import Decimal from 'decimal.js';

import {
  WELFARE_ZAKAT_FUND_TRANSACTION_NUMBER_SEQUENCE_KEY,
  WELFARE_ZAKAT_PERMISSION_KEYS,
  WELFARE_ZAKAT_TRANSFER_NUMBER_SEQUENCE_KEY,
} from '../welfare-zakat.constants.js';
import type {
  RequestFundTransferInput,
  WelfareZakatActorContext,
  WelfareZakatListQuery,
} from '../welfare-zakat.contracts.js';
import {
  AssistanceAccessDeniedError,
  AssistanceBreakGlassApprovalBypassError,
  AssistanceCurrencyMismatchError,
  AssistanceFundBalanceExceededError,
  AssistanceFundInactiveError,
  AssistanceFundNotFoundError,
  AssistanceMakerCheckerViolationError,
  AssistanceTransferSameFundError,
  AssistanceVersionConflictError,
} from '../welfare-zakat.errors.js';
import { reconcileFundTransfer } from '../welfare-zakat.financial-math.js';
import {
  safeWelfareZakatRealtimePayload,
  stableAssistancePayloadHash,
} from '../welfare-zakat.normalization.js';
import type {
  AssistanceFundRepositoryPort,
  FundTransactionRepositoryPort,
  FundTransferRepositoryPort,
  WelfareZakatAccessPolicyPort,
  WelfareZakatAttachmentPort,
  WelfareZakatAuditPort,
  WelfareZakatClockPort,
  WelfareZakatFinancialApprovalPort,
  WelfareZakatFinancialLedgerPort,
  WelfareZakatNumberSequencePort,
  WelfareZakatOutboxPort,
  WelfareZakatTransactionContext,
  WelfareZakatTransactionManagerPort,
} from '../welfare-zakat.ports.js';
import type { FundTransferRecord } from '../welfare-zakat.persistence.types.js';
import {
  projectAssistanceFund,
  projectFundBalance,
  projectFundTransaction,
} from '../welfare-zakat.projections.js';
import { decimal128ToString } from '@hospital-mis/database';

export interface DecideFundTransferInput {
  expectedTransferVersion: number;
  expectedSourceFundVersion: number;
  expectedDestinationFundVersion: number;
  decision: 'APPROVE' | 'REJECT';
  reason: string;
}

export interface ReverseFundTransferInput {
  expectedTransferVersion: number;
  expectedSourceFundVersion: number;
  expectedDestinationFundVersion: number;
  approvalRequestId: string;
  reason: string;
}

export interface AssistanceFundTransferServiceDependencies {
  funds: AssistanceFundRepositoryPort;
  fundTransactions: FundTransactionRepositoryPort;
  transfers: FundTransferRepositoryPort;
  accessPolicy: WelfareZakatAccessPolicyPort;
  transactionManager: WelfareZakatTransactionManagerPort;
  attachments: WelfareZakatAttachmentPort;
  audit: WelfareZakatAuditPort;
  outbox: WelfareZakatOutboxPort;
  clock: WelfareZakatClockPort;
  sequences: WelfareZakatNumberSequencePort;
  financialApprovals: WelfareZakatFinancialApprovalPort;
  financialLedger: WelfareZakatFinancialLedgerPort;
}

function amount(value: string | Decimal): string {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

function transferView(record: FundTransferRecord) {
  return {
    id: record._id.toHexString(),
    transferNumber: record.transferNumber,
    sourceFundId: record.sourceFundId.toHexString(),
    destinationFundId: record.destinationFundId.toHexString(),
    amount: decimal128ToString(record.amount),
    currency: record.currency,
    status: record.status,
    approvalRequestId: record.approvalRequestId.toHexString(),
    makerUserId: record.makerUserId.toHexString(),
    checkerUserId: record.checkerUserId?.toHexString() ?? null,
    sourceTransactionId: record.sourceTransactionId?.toHexString() ?? null,
    destinationTransactionId: record.destinationTransactionId?.toHexString() ?? null,
    reason: record.reason,
    attachmentIds: record.attachmentIds.map((id) => id.toHexString()),
    postedAt: record.postedAt?.toISOString() ?? null,
    reversedAt: record.reversedAt?.toISOString() ?? null,
    reversedBy: record.reversedBy?.toHexString() ?? null,
    reversalReason: record.reversalReason,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export class AssistanceFundTransferService {
  public constructor(
    private readonly dependencies: AssistanceFundTransferServiceDependencies,
  ) {}

  public async list(actor: WelfareZakatActorContext, query: WelfareZakatListQuery) {
    await this.require(actor, WELFARE_ZAKAT_PERMISSION_KEYS.FUND_READ, false);
    const page = await this.dependencies.transfers.list(actor.facilityId, query);
    const pageSize = Math.max(1, Math.min(query.pageSize ?? 50, 200));
    const pageNumber = Math.max(1, query.page ?? 1);
    return {
      items: page.records.map(transferView),
      page: pageNumber,
      pageSize,
      totalItems: page.total,
      totalPages: Math.ceil(page.total / pageSize),
    };
  }

  public async get(actor: WelfareZakatActorContext, transferId: string) {
    await this.require(actor, WELFARE_ZAKAT_PERMISSION_KEYS.FUND_READ, false);
    const transfer = await this.dependencies.transfers.findById(
      actor.facilityId,
      transferId,
    );
    if (transfer === null) {
      throw new AssistanceFundNotFoundError();
    }
    return transferView(transfer);
  }

  public async request(
    actor: WelfareZakatActorContext,
    idempotencyKey: string,
    input: RequestFundTransferInput,
  ) {
    await this.require(actor, WELFARE_ZAKAT_PERMISSION_KEYS.FUND_TRANSFER_REQUEST, true);
    if (actor.breakGlassReason != null) {
      throw new AssistanceBreakGlassApprovalBypassError();
    }
    if (input.sourceFundId === input.destinationFundId) {
      throw new AssistanceTransferSameFundError();
    }
    await this.dependencies.attachments.assertAttachmentIdsUsable({
      facilityId: actor.facilityId,
      actorUserId: actor.userId,
      attachmentIds: input.attachmentIds ?? [],
    });

    return this.dependencies.transactionManager.execute({
      transactionType: 'REQUEST_ASSISTANCE_FUND_TRANSFER',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `welfare-zakat:fund:${actor.facilityId}:${input.sourceFundId}`,
        `welfare-zakat:fund:${actor.facilityId}:${input.destinationFundId}`,
      ].sort(),
      idempotencyPayload: input,
      journalPayload: {
        sourceFundId: input.sourceFundId,
        destinationFundId: input.destinationFundId,
        amount: input.amount,
      },
      execute: async (transaction) => {
        const [source, destination] = await Promise.all([
          this.dependencies.funds.findById(
            actor.facilityId,
            input.sourceFundId,
            transaction.session,
          ),
          this.dependencies.funds.findById(
            actor.facilityId,
            input.destinationFundId,
            transaction.session,
          ),
        ]);
        if (source === null || destination === null) {
          throw new AssistanceFundNotFoundError();
        }
        if (source.status !== 'ACTIVE' || destination.status !== 'ACTIVE') {
          throw new AssistanceFundInactiveError();
        }
        if (source.currency !== destination.currency) {
          throw new AssistanceCurrencyMismatchError();
        }
        const sourceBalance = projectFundBalance(source);
        reconcileFundTransfer({
          requestedAmount: input.amount,
          sourceAvailableAmount: sourceBalance.availableBalance,
          sourceDebitAmount: input.amount,
          destinationCreditAmount: input.amount,
        });

        const transferNumber = await this.dependencies.sequences.next({
          facilityId: actor.facilityId,
          sequenceKey: WELFARE_ZAKAT_TRANSFER_NUMBER_SEQUENCE_KEY,
          effectiveAt: input.transferAt == null
            ? this.dependencies.clock.now()
            : new Date(input.transferAt),
          actorUserId: actor.userId,
          transaction,
        });
        const operationKey = stableAssistancePayloadHash({
          action: 'REQUEST_ASSISTANCE_FUND_TRANSFER',
          facilityId: actor.facilityId,
          idempotencyKey,
          sourceFundId: input.sourceFundId,
          destinationFundId: input.destinationFundId,
          amount: input.amount,
        });
        const transfer = await this.dependencies.transfers.create({
          actor,
          input,
          operationKey,
          transferNumber,
          transaction,
        });
        await this.dependencies.audit.record({
          actor,
          action: 'ASSISTANCE_FUND_TRANSFER_REQUESTED',
          entityType: 'FundTransfer',
          entityId: transfer._id.toHexString(),
          reason: input.reason,
          before: null,
          after: transferView(transfer),
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType: 'welfare_zakat.transfer.requested',
          aggregateType: 'FundTransfer',
          aggregateId: transfer._id.toHexString(),
          payload: safeWelfareZakatRealtimePayload({
            status: transfer.status,
            version: transfer.version,
            eventAt: this.dependencies.clock.now().toISOString(),
          }),
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        return transferView(transfer);
      },
    });
  }

  public async decide(
    actor: WelfareZakatActorContext,
    transferId: string,
    idempotencyKey: string,
    input: DecideFundTransferInput,
  ) {
    await this.require(actor, WELFARE_ZAKAT_PERMISSION_KEYS.FUND_TRANSFER_APPROVE, true);
    if (actor.breakGlassReason != null) {
      throw new AssistanceBreakGlassApprovalBypassError();
    }

    if (input.decision === 'REJECT') {
      return this.dependencies.transactionManager.execute({
        transactionType: 'REJECT_ASSISTANCE_FUND_TRANSFER',
        idempotencyKey,
        actorUserId: actor.userId,
        facilityId: actor.facilityId,
        correlationId: actor.correlationId,
        lockKeys: [`welfare-zakat:transfer:${actor.facilityId}:${transferId}`],
        idempotencyPayload: input,
        journalPayload: { transferId, decision: input.decision },
        execute: async (transaction) => {
          const existing = await this.dependencies.transfers.findById(
            actor.facilityId,
            transferId,
            transaction.session,
          );
          if (existing === null) {
            throw new AssistanceFundNotFoundError();
          }
          if (existing.makerUserId.toHexString() === actor.userId) {
            throw new AssistanceMakerCheckerViolationError();
          }
          const rejected = await this.dependencies.transfers.reject({
            actor,
            transferId,
            expectedVersion: input.expectedTransferVersion,
            checkerUserId: actor.userId,
            reason: input.reason,
            transaction,
          });
          if (rejected === null) throw new AssistanceVersionConflictError();
          await this.recordDecision(actor, existing, rejected, transaction, input.reason);
          return transferView(rejected);
        },
      });
    }

    return this.postTransfer(actor, transferId, idempotencyKey, input);
  }

  public async reverse(
    actor: WelfareZakatActorContext,
    transferId: string,
    idempotencyKey: string,
    input: ReverseFundTransferInput,
  ) {
    await this.require(actor, WELFARE_ZAKAT_PERMISSION_KEYS.FUND_TRANSFER_APPROVE, true);
    if (actor.breakGlassReason != null) {
      throw new AssistanceBreakGlassApprovalBypassError();
    }

    return this.dependencies.transactionManager.execute({
      transactionType: 'REVERSE_ASSISTANCE_FUND_TRANSFER',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`welfare-zakat:transfer:${actor.facilityId}:${transferId}`],
      idempotencyPayload: input,
      journalPayload: { transferId, reversal: true },
      execute: async (transaction) => {
        const transfer = await this.dependencies.transfers.findById(
          actor.facilityId,
          transferId,
          transaction.session,
        );
        if (transfer === null) {
          throw new AssistanceFundNotFoundError();
        }
        if (transfer.status !== 'POSTED') throw new AssistanceVersionConflictError();
        const [source, destination] = await Promise.all([
          this.dependencies.funds.findById(
            actor.facilityId,
            transfer.sourceFundId.toHexString(),
            transaction.session,
          ),
          this.dependencies.funds.findById(
            actor.facilityId,
            transfer.destinationFundId.toHexString(),
            transaction.session,
          ),
        ]);
        if (source === null || destination === null) throw new AssistanceFundNotFoundError();
        if (transfer.makerUserId.toHexString() === actor.userId) {
          throw new AssistanceMakerCheckerViolationError();
        }
        await this.dependencies.financialApprovals.assertApproved({
          facilityId: actor.facilityId,
          approvalRequestId: input.approvalRequestId,
          action: 'ASSISTANCE_FUND_TRANSFER_REVERSAL',
          entityId: transferId,
          amount: decimal128ToString(transfer.amount),
          makerUserId: transfer.makerUserId.toHexString(),
          checkerUserId: actor.userId,
          session: transaction.session,
        });

        const sourceBalance = projectFundBalance(source);
        const destinationBalance = projectFundBalance(destination);
        const transferAmount = new Decimal(decimal128ToString(transfer.amount));
        if (new Decimal(destinationBalance.availableBalance).lessThan(transferAmount)) {
          throw new AssistanceFundBalanceExceededError();
        }
        const nextSource = {
          ...sourceBalance,
          transferOutAmount: amount(new Decimal(sourceBalance.transferOutAmount).minus(transferAmount)),
          ledgerBalance: amount(new Decimal(sourceBalance.ledgerBalance).plus(transferAmount)),
          availableBalance: amount(new Decimal(sourceBalance.availableBalance).plus(transferAmount)),
        };
        const nextDestination = {
          ...destinationBalance,
          transferInAmount: amount(new Decimal(destinationBalance.transferInAmount).minus(transferAmount)),
          ledgerBalance: amount(new Decimal(destinationBalance.ledgerBalance).minus(transferAmount)),
          availableBalance: amount(new Decimal(destinationBalance.availableBalance).minus(transferAmount)),
        };
        const [updatedSource, updatedDestination] = await Promise.all([
          this.dependencies.funds.applyFinancialPosition({
            actor,
            fundId: source._id.toHexString(),
            expectedVersion: input.expectedSourceFundVersion,
            balances: nextSource,
            transaction,
          }),
          this.dependencies.funds.applyFinancialPosition({
            actor,
            fundId: destination._id.toHexString(),
            expectedVersion: input.expectedDestinationFundVersion,
            balances: nextDestination,
            transaction,
          }),
        ]);
        if (updatedSource === null || updatedDestination === null) {
          throw new AssistanceVersionConflictError();
        }
        const occurredAt = this.dependencies.clock.now();
        const [sourceLedger, destinationLedger] = await Promise.all([
          this.appendTransferTransaction({
            actor,
            fund: source,
            transferId,
            transactionType: 'TRANSFER_IN',
            direction: 'CREDIT',
            balanceBefore: sourceBalance.ledgerBalance,
            balanceAfter: nextSource.ledgerBalance,
            reason: input.reason,
            occurredAt,
            transaction,
          }),
          this.appendTransferTransaction({
            actor,
            fund: destination,
            transferId,
            transactionType: 'TRANSFER_OUT',
            direction: 'DEBIT',
            balanceBefore: destinationBalance.ledgerBalance,
            balanceAfter: nextDestination.ledgerBalance,
            reason: input.reason,
            occurredAt,
            transaction,
          }),
        ]);
        const reversed = await this.dependencies.transfers.reverse({
          actor,
          transferId,
          expectedVersion: input.expectedTransferVersion,
          reversedAt: occurredAt,
          reason: input.reason,
          transaction,
        });
        if (reversed === null) throw new AssistanceVersionConflictError();
        await Promise.all([
          this.dependencies.financialLedger.postFundFinancialEvent({
            actor,
            fundId: source._id.toHexString(),
            eventType: 'ASSISTANCE_FUND_TRANSFER_REVERSAL_IN',
            amount: decimal128ToString(transfer.amount),
            sourceRecordId: sourceLedger._id.toHexString(),
            currency: source.currency,
            transaction,
          }),
          this.dependencies.financialLedger.postFundFinancialEvent({
            actor,
            fundId: destination._id.toHexString(),
            eventType: 'ASSISTANCE_FUND_TRANSFER_REVERSAL_OUT',
            amount: decimal128ToString(transfer.amount),
            sourceRecordId: destinationLedger._id.toHexString(),
            currency: destination.currency,
            transaction,
          }),
        ]);
        await this.recordDecision(actor, transfer, reversed, transaction, input.reason);
        return {
          transfer: transferView(reversed),
          sourceFund: projectAssistanceFund(updatedSource),
          destinationFund: projectAssistanceFund(updatedDestination),
          sourceTransaction: projectFundTransaction(sourceLedger),
          destinationTransaction: projectFundTransaction(destinationLedger),
        };
      },
    });
  }

  private async postTransfer(
    actor: WelfareZakatActorContext,
    transferId: string,
    idempotencyKey: string,
    input: DecideFundTransferInput,
  ) {
    return this.dependencies.transactionManager.execute({
      transactionType: 'POST_ASSISTANCE_FUND_TRANSFER',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`welfare-zakat:transfer:${actor.facilityId}:${transferId}`],
      idempotencyPayload: input,
      journalPayload: { transferId, decision: input.decision },
      execute: async (transaction) => {
        const transfer = await this.dependencies.transfers.findById(
          actor.facilityId,
          transferId,
          transaction.session,
        );
        if (transfer === null) {
          throw new AssistanceFundNotFoundError();
        }
        if (transfer.makerUserId.toHexString() === actor.userId) {
          throw new AssistanceMakerCheckerViolationError();
        }
        const [source, destination] = await Promise.all([
          this.dependencies.funds.findById(
            actor.facilityId,
            transfer.sourceFundId.toHexString(),
            transaction.session,
          ),
          this.dependencies.funds.findById(
            actor.facilityId,
            transfer.destinationFundId.toHexString(),
            transaction.session,
          ),
        ]);
        if (source === null || destination === null) throw new AssistanceFundNotFoundError();
        if (source.status !== 'ACTIVE' || destination.status !== 'ACTIVE') {
          throw new AssistanceFundInactiveError();
        }
        const transferAmount = decimal128ToString(transfer.amount);
        await this.dependencies.financialApprovals.assertApproved({
          facilityId: actor.facilityId,
          approvalRequestId: transfer.approvalRequestId.toHexString(),
          action: 'ASSISTANCE_FUND_TRANSFER',
          entityId: transferId,
          amount: transferAmount,
          makerUserId: transfer.makerUserId.toHexString(),
          checkerUserId: actor.userId,
          session: transaction.session,
        });
        const sourceBalance = projectFundBalance(source);
        const destinationBalance = projectFundBalance(destination);
        reconcileFundTransfer({
          requestedAmount: transferAmount,
          sourceAvailableAmount: sourceBalance.availableBalance,
          sourceDebitAmount: transferAmount,
          destinationCreditAmount: transferAmount,
        });
        const value = new Decimal(transferAmount);
        const nextSource = {
          ...sourceBalance,
          transferOutAmount: amount(new Decimal(sourceBalance.transferOutAmount).plus(value)),
          ledgerBalance: amount(new Decimal(sourceBalance.ledgerBalance).minus(value)),
          availableBalance: amount(new Decimal(sourceBalance.availableBalance).minus(value)),
        };
        const nextDestination = {
          ...destinationBalance,
          transferInAmount: amount(new Decimal(destinationBalance.transferInAmount).plus(value)),
          ledgerBalance: amount(new Decimal(destinationBalance.ledgerBalance).plus(value)),
          availableBalance: amount(new Decimal(destinationBalance.availableBalance).plus(value)),
        };
        const [updatedSource, updatedDestination] = await Promise.all([
          this.dependencies.funds.applyFinancialPosition({
            actor,
            fundId: source._id.toHexString(),
            expectedVersion: input.expectedSourceFundVersion,
            balances: nextSource,
            transaction,
          }),
          this.dependencies.funds.applyFinancialPosition({
            actor,
            fundId: destination._id.toHexString(),
            expectedVersion: input.expectedDestinationFundVersion,
            balances: nextDestination,
            transaction,
          }),
        ]);
        if (updatedSource === null || updatedDestination === null) {
          throw new AssistanceVersionConflictError();
        }
        const occurredAt = this.dependencies.clock.now();
        const [sourceLedger, destinationLedger] = await Promise.all([
          this.appendTransferTransaction({
            actor,
            fund: source,
            transferId,
            transactionType: 'TRANSFER_OUT',
            direction: 'DEBIT',
            balanceBefore: sourceBalance.ledgerBalance,
            balanceAfter: nextSource.ledgerBalance,
            reason: transfer.reason,
            occurredAt,
            transaction,
          }),
          this.appendTransferTransaction({
            actor,
            fund: destination,
            transferId,
            transactionType: 'TRANSFER_IN',
            direction: 'CREDIT',
            balanceBefore: destinationBalance.ledgerBalance,
            balanceAfter: nextDestination.ledgerBalance,
            reason: transfer.reason,
            occurredAt,
            transaction,
          }),
        ]);
        const posted = await this.dependencies.transfers.post({
          actor,
          transferId,
          expectedVersion: input.expectedTransferVersion,
          checkerUserId: actor.userId,
          sourceTransactionId: sourceLedger._id.toHexString(),
          destinationTransactionId: destinationLedger._id.toHexString(),
          postedAt: occurredAt,
          transaction,
        });
        if (posted === null) throw new AssistanceVersionConflictError();
        await Promise.all([
          this.dependencies.financialLedger.postFundFinancialEvent({
            actor,
            fundId: source._id.toHexString(),
            eventType: 'ASSISTANCE_FUND_TRANSFER_OUT',
            amount: transferAmount,
            sourceRecordId: sourceLedger._id.toHexString(),
            currency: source.currency,
            transaction,
          }),
          this.dependencies.financialLedger.postFundFinancialEvent({
            actor,
            fundId: destination._id.toHexString(),
            eventType: 'ASSISTANCE_FUND_TRANSFER_IN',
            amount: transferAmount,
            sourceRecordId: destinationLedger._id.toHexString(),
            currency: destination.currency,
            transaction,
          }),
        ]);
        await this.recordDecision(actor, transfer, posted, transaction, input.reason);
        return {
          transfer: transferView(posted),
          sourceFund: projectAssistanceFund(updatedSource),
          destinationFund: projectAssistanceFund(updatedDestination),
          sourceTransaction: projectFundTransaction(sourceLedger),
          destinationTransaction: projectFundTransaction(destinationLedger),
        };
      },
    });
  }

  private async appendTransferTransaction(input: Readonly<{
    actor: WelfareZakatActorContext;
    fund: Parameters<FundTransactionRepositoryPort['append']>[0]['fund'];
    transferId: string;
    transactionType: 'TRANSFER_IN' | 'TRANSFER_OUT';
    direction: 'CREDIT' | 'DEBIT';
    balanceBefore: string;
    balanceAfter: string;
    reason: string;
    occurredAt: Date;
    transaction: Parameters<FundTransactionRepositoryPort['append']>[0]['transaction'];
  }>) {
    const transactionNumber = await this.dependencies.sequences.next({
      facilityId: input.actor.facilityId,
      sequenceKey: WELFARE_ZAKAT_FUND_TRANSACTION_NUMBER_SEQUENCE_KEY,
      effectiveAt: input.occurredAt,
      actorUserId: input.actor.userId,
      transaction: input.transaction,
    });
    const transfer = await this.dependencies.transfers.findById(
      input.actor.facilityId,
      input.transferId,
      input.transaction.session,
    );
    if (transfer === null) {
      throw new AssistanceFundNotFoundError();
    }
    const transferAmount = decimal128ToString(transfer.amount);
    const operationKey = stableAssistancePayloadHash({
      action: input.transactionType,
      transferId: input.transferId,
      fundId: input.fund._id.toHexString(),
      transactionId: input.transaction.transactionId,
    });
    return this.dependencies.fundTransactions.append({
      actor: input.actor,
      fund: input.fund,
      transactionNumber,
      operationKey,
      transactionType: input.transactionType,
      direction: input.direction,
      amount: transferAmount,
      balanceBefore: input.balanceBefore,
      balanceAfter: input.balanceAfter,
      transferId: input.transferId,
      reason: input.reason,
      attachmentIds: transfer.attachmentIds.map((id) => id.toHexString()),
      makerUserId: transfer.makerUserId.toHexString(),
      checkerUserId: input.actor.userId,
      approvalRequestId: transfer.approvalRequestId.toHexString(),
      occurredAt: input.occurredAt,
      immutableHash: stableAssistancePayloadHash({
        operationKey,
        transferId: input.transferId,
        amount: transferAmount,
        balanceAfter: input.balanceAfter,
      }),
      transaction: input.transaction,
    });
  }

  private async recordDecision(
    actor: WelfareZakatActorContext,
    before: FundTransferRecord,
    after: FundTransferRecord,
    transaction: WelfareZakatTransactionContext,
    reason: string,
  ): Promise<void> {
    await this.dependencies.audit.record({
      actor,
      action: `ASSISTANCE_FUND_TRANSFER_${after.status}`,
      entityType: 'FundTransfer',
      entityId: after._id.toHexString(),
      reason,
      before: transferView(before),
      after: transferView(after),
      transactionId: transaction.transactionId,
      session: transaction.session,
    });
    await this.dependencies.outbox.enqueue({
      facilityId: actor.facilityId,
      eventType: `welfare_zakat.transfer.${after.status.toLowerCase()}`,
      aggregateType: 'FundTransfer',
      aggregateId: after._id.toHexString(),
      payload: safeWelfareZakatRealtimePayload({
        status: after.status,
        previousStatus: before.status,
        version: after.version,
        eventAt: this.dependencies.clock.now().toISOString(),
      }),
      correlationId: actor.correlationId,
      transactionId: transaction.transactionId,
      session: transaction.session,
    });
  }

  private async require(
    actor: WelfareZakatActorContext,
    permission: string,
    sensitiveFinancialAction: boolean,
  ): Promise<void> {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      permission,
      resourceFacilityId: actor.facilityId,
      sensitiveFinancialAction,
    });
    if (!decision.allowed) {
      throw new AssistanceAccessDeniedError(decision.denialReason ?? undefined);
    }
  }
}