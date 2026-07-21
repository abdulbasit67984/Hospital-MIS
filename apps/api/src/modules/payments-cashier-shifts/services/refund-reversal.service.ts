import Decimal from 'decimal.js';

import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  CreatePaymentReversalInput,
  CreateRefundRequestInput,
  DecidePaymentReversalInput,
  DecideRefundRequestInput,
  PaymentCashierActorContext,
  PaymentReversalView,
  PostPaymentReversalInput,
  ProcessRefundInput,
  RefundRequestView,
  RefundView,
  ReverseRefundInput,
} from '../payments-cashier-shifts.contracts.js';

import {
  CashCounterInactiveError,
  CashCounterNotFoundError,
  CashierShiftNotFoundError,
  CashierShiftNotOpenError,
  DepositNotFoundError,
  PaymentCashierConcurrencyError,
  PaymentMethodConfigurationNotFoundError,
  PaymentMethodInactiveError,
  PaymentMethodRefundNotAllowedError,
  PaymentNotFoundError,
  PaymentRefundableBalanceError,
  PaymentReversalNotFoundError,
  RefundNotFoundError,
  RefundRequestNotFoundError,
} from '../payments-cashier-shifts.errors.js';

import type {
  PaymentCashierAccessPolicyPort,
  PaymentCashierAuditPort,
  PaymentCashierOutboxPort,
  PaymentCashierRealtimePort,
  PaymentCashierSequencePort,
  PaymentLedgerPort,
} from '../payments-cashier-shifts.ports.js';

import type {
  PaymentCashierMongoSession,
  PaymentMethodConfigurationRecord,
  PaymentRecord,
  RefundRecord,
  RefundRequestRecord,
} from '../payments-cashier-shifts.persistence.types.js';

import {
  projectPaymentReversal,
  projectRefund,
  projectRefundRequest,
} from '../payments-cashier-shifts.projections.js';

import {
  PAYMENT_CASHIER_AUDIT_ACTIONS,
  PAYMENT_CASHIER_EVENT_TYPES,
  PAYMENT_CASHIER_LOCK_NAMESPACES,
  PAYMENT_CASHIER_REALTIME_EVENTS,
  PAYMENT_CASHIER_SEQUENCE_KEYS,
  PAYMENT_CASHIER_TRANSACTION_TYPES,
} from '../payments-cashier-shifts.operations.js';

import {
  normalizePaymentCashierCode,
  normalizePaymentCashierText,
  nullablePaymentCashierObjectId,
  paymentCashierDecimal128,
  paymentCashierLockKey,
} from '../payments-cashier-shifts.normalization.js';

import type {
  CashierShiftExtendedRepositoryPort,
} from '../repositories/cashier-shift.repository.js';

import type {
  PaymentConfigurationRepository,
} from '../repositories/payment-configuration.repository.js';

import type {
  DepositFinancialRepositoryPort,
  PaymentFinancialRepositoryPort,
} from '../repositories/payment-finance.repository.js';

import {
  MongoPaymentReceiptRepository,
} from '../repositories/payment-finance.repository.js';

import type {
  RefundReversalControlRepositoryPort,
} from '../repositories/refund-reversal.repository.js';

import {
  PaymentCashierCommandSupport,
  type PaymentCashierCommandContext,
} from './payment-cashier-command-support.js';

import {
  PaymentFinancialControlService,
} from './payment-financial-control.service.js';

import {
  MongoUnifiedBillingPaymentsAdapter,
} from './unified-billing-payments.adapter.js';

export interface RefundReversalServiceDependencies {
  controls: RefundReversalControlRepositoryPort;
  payments: PaymentFinancialRepositoryPort;
  deposits: DepositFinancialRepositoryPort;
  receipts: MongoPaymentReceiptRepository;
  configuration: PaymentConfigurationRepository;
  shifts: CashierShiftExtendedRepositoryPort;
  financialControl: PaymentFinancialControlService;
  billing: MongoUnifiedBillingPaymentsAdapter;
  ledger: PaymentLedgerPort;
  accessPolicy: PaymentCashierAccessPolicyPort;
  commandSupport: PaymentCashierCommandSupport;
  sequences: PaymentCashierSequencePort;
  audit: PaymentCashierAuditPort;
  outbox: PaymentCashierOutboxPort;
  realtime: PaymentCashierRealtimePort;
  clock: Readonly<{ now(): Date }>;
}

interface RefundSourceResolution {
  patientId: string;
  patientAccountId: string;
  currency: string;
  maximumRefundable: Decimal;
}

function decimal(value: unknown): Decimal {
  if (
    value !== null &&
    typeof value === 'object' &&
    'toString' in value
  ) {
    return new Decimal(String(value));
  }

  return new Decimal(String(value ?? '0'));
}

function requireUpdated<T>(value: T | null): T {
  if (value === null) {
    throw new PaymentCashierConcurrencyError();
  }

  return value;
}

export class RefundReversalService {
  public constructor(
    private readonly dependencies: RefundReversalServiceDependencies,
  ) {}

  public async getRefundRequest(
    actor: PaymentCashierActorContext,
    requestId: string,
  ): Promise<RefundRequestView> {
    const request = await this.dependencies.controls.findRefundRequestById(
      actor.facilityId,
      requestId,
    );

    if (request === null) {
      throw new RefundRequestNotFoundError();
    }

    this.dependencies.accessPolicy.require({
      actor,
      action: 'PAYMENT_READ',
      resourceFacilityId: actor.facilityId,
    });

    return projectRefundRequest(request);
  }

  public async requestRefund(
    command: PaymentCashierCommandContext,
    input: CreateRefundRequestInput,
  ): Promise<RefundRequestView> {
    const { actor } = command;

    this.dependencies.accessPolicy.require({
      actor,
      action: 'REFUND_REQUEST',
      resourceFacilityId: actor.facilityId,
    });

    const result = await this.dependencies.commandSupport.execute({
      operation: PAYMENT_CASHIER_TRANSACTION_TYPES.CREATE_REFUND_REQUEST,
      command,
      payload: input,
      lockKeys: this.refundSourceLockKeys(actor.facilityId, input),
      work: async ({ session, transactionId, operationKey }) => {
        const source = await this.resolveRefundSource(
          actor.facilityId,
          input,
          session,
        );
        const amount = new Decimal(input.amount);

        if (
          source.patientAccountId !== input.patientAccountId ||
          amount.greaterThan(source.maximumRefundable)
        ) {
          throw new PaymentRefundableBalanceError();
        }

        const now = this.dependencies.clock.now();
        const [requestNumber, approvalNumber] = await Promise.all([
          this.dependencies.sequences.next(
            actor.facilityId,
            PAYMENT_CASHIER_SEQUENCE_KEYS.REFUND_REQUEST,
            now,
            session,
          ),
          this.dependencies.sequences.next(
            actor.facilityId,
            PAYMENT_CASHIER_SEQUENCE_KEYS.FINANCIAL_APPROVAL,
            now,
            session,
          ),
        ]);
        const created = await this.dependencies.controls.createRefundRequestWithApproval(
          actor.facilityId,
          input,
          {
            operationKey,
            requestNumber,
            approvalOperationKey: `${operationKey}:approval`,
            approvalRequestNumber: approvalNumber,
            patientId: source.patientId,
            currency: source.currency,
            actorUserId: actor.userId,
            requestedAt: now,
            transactionId,
            correlationId: actor.correlationId,
          },
          session,
        );
        const view = projectRefundRequest(created);

        await this.dependencies.commandSupport.appendHistory({
          actor,
          transactionId,
          entityType: 'REFUND_REQUEST',
          entityId: view.id,
          action: 'APPROVAL_REQUESTED',
          occurredAt: now,
          session,
          statusFrom: null,
          statusTo: 'PENDING',
          amount: view.amount,
          currency: view.currency,
          reasonCode: view.reasonCode,
          reason: view.reason,
          patientId: view.patientId,
          patientAccountId: view.patientAccountId,
          paymentId: view.paymentId,
          metadata: {
            requestNumber: view.requestNumber,
            depositId: view.depositId,
            creditNoteId: view.creditNoteId,
          },
        });

        await Promise.all([
          this.dependencies.audit.record(
            {
              facilityId: actor.facilityId,
              actorUserId: actor.userId,
              actorStaffId: actor.staffId,
              action: PAYMENT_CASHIER_AUDIT_ACTIONS.REFUND_REQUESTED,
              entityType: 'REFUND_REQUEST',
              entityId: view.id,
              reason: view.reason,
              before: null,
              after: view as unknown as Record<string, unknown>,
              correlationId: actor.correlationId,
              transactionId,
              ipAddress: actor.ipAddress,
              userAgent: actor.userAgent,
            },
            session,
          ),
          this.dependencies.outbox.publish(
            {
              facilityId: actor.facilityId,
              aggregateType: 'REFUND_REQUEST',
              aggregateId: view.id,
              eventType: PAYMENT_CASHIER_EVENT_TYPES.REFUND_REQUESTED,
              payload: {
                requestId: view.id,
                requestNumber: view.requestNumber,
                status: view.status,
                amount: view.amount,
                currency: view.currency,
              },
              correlationId: actor.correlationId,
              transactionId,
              occurredAt: now,
            },
            session,
          ),
        ]);

        return view;
      },
    });

    await this.publishRefundChange(actor.facilityId, result.id, result.status);
    return result;
  }

  public async decideRefundRequest(
    command: PaymentCashierCommandContext,
    requestId: string,
    input: DecideRefundRequestInput,
  ): Promise<RefundRequestView> {
    const { actor } = command;
    const existing = await this.dependencies.controls.findRefundRequestById(
      actor.facilityId,
      requestId,
    );

    if (existing === null) {
      throw new RefundRequestNotFoundError();
    }

    this.dependencies.accessPolicy.require({
      actor,
      action: 'REFUND_APPROVE',
      resourceFacilityId: actor.facilityId,
      makerUserId: existing.createdBy.toHexString(),
    });

    const result = await this.dependencies.commandSupport.execute({
      operation: PAYMENT_CASHIER_TRANSACTION_TYPES.DECIDE_REFUND_REQUEST,
      command,
      payload: { requestId, ...input },
      lockKeys: [
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.REFUND_REQUEST,
          actor.facilityId,
          requestId,
        ),
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.FINANCIAL_APPROVAL,
          actor.facilityId,
          existing.approvalRequestId.toHexString(),
        ),
      ],
      work: async ({ session, transactionId }) => {
        const now = this.dependencies.clock.now();
        const decided = await this.dependencies.controls.decideRefundRequest(
          actor.facilityId,
          requestId,
          input.expectedVersion,
          existing.approvalRequestId.toHexString(),
          input.decision,
          input.decisionReason,
          actor.userId,
          now,
          transactionId,
          actor.correlationId,
          session,
        );
        const view = projectRefundRequest(decided);
        const approved = input.decision === 'APPROVE';

        await this.dependencies.commandSupport.appendHistory({
          actor,
          transactionId,
          entityType: 'REFUND_REQUEST',
          entityId: view.id,
          action: approved ? 'APPROVED' : 'REJECTED',
          occurredAt: now,
          session,
          statusFrom: 'PENDING',
          statusTo: view.status,
          amount: view.amount,
          currency: view.currency,
          reason: input.decisionReason,
          approvalRequestId: view.approvalRequestId,
          patientId: view.patientId,
          patientAccountId: view.patientAccountId,
          paymentId: view.paymentId,
        });

        await this.writeControlEvent(
          actor,
          transactionId,
          now,
          'REFUND_REQUEST',
          view.id,
          approved
            ? PAYMENT_CASHIER_AUDIT_ACTIONS.REFUND_APPROVED
            : PAYMENT_CASHIER_AUDIT_ACTIONS.REFUND_REJECTED,
          PAYMENT_CASHIER_EVENT_TYPES.REFUND_REQUEST_DECIDED,
          input.decisionReason,
          view as unknown as Record<string, unknown>,
          session,
        );

        return view;
      },
    });

    await this.publishRefundChange(actor.facilityId, result.id, result.status);
    return result;
  }

  public async processRefund(
    command: PaymentCashierCommandContext,
    requestId: string,
    input: ProcessRefundInput,
  ): Promise<RefundView> {
    const { actor } = command;
    const existing = await this.dependencies.controls.findRefundRequestById(
      actor.facilityId,
      requestId,
    );

    if (existing === null) {
      throw new RefundRequestNotFoundError();
    }

    this.dependencies.accessPolicy.require({
      actor,
      action: 'REFUND_PROCESS',
      resourceFacilityId: actor.facilityId,
      counterId: input.cashCounterId,
      cashierUserId: actor.userId,
      makerUserId: existing.createdBy.toHexString(),
    });

    const result = await this.dependencies.commandSupport.execute({
      operation: PAYMENT_CASHIER_TRANSACTION_TYPES.PROCESS_REFUND,
      command,
      payload: { requestId, ...input },
      lockKeys: [
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.REFUND_REQUEST,
          actor.facilityId,
          requestId,
        ),
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.PATIENT_ACCOUNT,
          actor.facilityId,
          existing.patientAccountId.toHexString(),
        ),
        ...this.refundRequestSourceLocks(actor.facilityId, existing),
        ...(input.cashShiftId == null
          ? []
          : [
              paymentCashierLockKey(
                PAYMENT_CASHIER_LOCK_NAMESPACES.CASHIER_SHIFT,
                actor.facilityId,
                input.cashShiftId,
              ),
            ]),
      ],
      work: async ({ session, transactionId, operationKey }) => {
        const request = await this.dependencies.controls.findRefundRequestById(
          actor.facilityId,
          requestId,
          session,
        );

        if (
          request === null ||
          request.status !== 'APPROVED' ||
          request.version !== input.expectedRequestVersion
        ) {
          throw new PaymentCashierConcurrencyError();
        }

        const approval = await this.dependencies.controls.findApprovalById(
          actor.facilityId,
          request.approvalRequestId.toHexString(),
          session,
        );

        if (
          approval === null ||
          approval.status !== 'APPROVED' ||
          approval.decidedBy === null
        ) {
          throw new PaymentCashierConcurrencyError(
            'Refund processing requires an approved independent decision',
          );
        }

        const method = await this.requireRefundMethod(
          actor.facilityId,
          input.paymentMethodConfigurationId,
          request.currency,
          session,
        );
        await this.requireRefundShift(
          actor,
          method,
          input.cashCounterId,
          input.cashShiftId,
          session,
        );

        const now = this.dependencies.clock.now();
        const metadata = {
          actorUserId: actor.userId,
          transactionId,
          correlationId: actor.correlationId,
        };
        let payment: PaymentRecord | null = null;
        let allocationEffects: RefundRecord['allocationEffects'] = [];
        let unallocatedRefundAmount = '0';

        if (request.paymentId !== null) {
          payment = await this.dependencies.payments.findPaymentById(
            actor.facilityId,
            request.paymentId.toHexString(),
            session,
          );

          if (payment === null) {
            throw new PaymentNotFoundError();
          }

          const applied = await this.dependencies.financialControl.applyPaymentRefund(
            actor.facilityId,
            payment,
            request.amount.toString(),
            metadata,
            session,
          );
          payment = applied.updatedPayment;
          allocationEffects = applied.allocationEffects;
          unallocatedRefundAmount = applied.unallocatedRefundAmount;
        } else if (request.depositId !== null) {
          const deposit = await this.dependencies.deposits.findById(
            actor.facilityId,
            request.depositId.toHexString(),
            session,
          );

          if (deposit === null) {
            throw new DepositNotFoundError();
          }

          await this.dependencies.financialControl.applyDepositRefund(
            actor.facilityId,
            deposit,
            request.amount.toString(),
            metadata,
            session,
          );
          unallocatedRefundAmount = request.amount.toString();
        } else if (request.creditNoteId !== null) {
          const creditNote = await this.dependencies.controls.findPostedCreditNote(
            actor.facilityId,
            request.creditNoteId.toHexString(),
            session,
          );

          if (creditNote === null) {
            throw new PaymentRefundableBalanceError();
          }

          const alreadyRefunded = new Decimal(
            await this.dependencies.controls.sumPostedCreditNoteRefunds(
              actor.facilityId,
              request.creditNoteId.toHexString(),
              session,
            ),
          );

          if (
            alreadyRefunded.plus(request.amount.toString()).greaterThan(
              creditNote.amount.toString(),
            )
          ) {
            throw new PaymentRefundableBalanceError();
          }

          await this.dependencies.financialControl.applyCreditNoteRefund(
            actor.facilityId,
            request.patientAccountId.toHexString(),
            request.amount.toString(),
            metadata,
            session,
          );
          unallocatedRefundAmount = request.amount.toString();
        } else {
          throw new PaymentRefundableBalanceError();
        }

        const refundNumber = await this.dependencies.sequences.next(
          actor.facilityId,
          PAYMENT_CASHIER_SEQUENCE_KEYS.REFUND,
          now,
          session,
        );
        const ledgerTransaction = await this.postRefundLedger(
          actor,
          method,
          request.amount.toString(),
          request.patientId.toHexString(),
          request.patientAccountId.toHexString(),
          request.paymentId?.toHexString() ?? null,
          input.cashCounterId ?? null,
          input.cashShiftId ?? null,
          request.currency,
          `${operationKey}:ledger`,
          transactionId,
          now,
          false,
          session,
        );
        const refund = await this.dependencies.controls.createRefund(
          {
            facilityId: toObjectId(actor.facilityId, 'facilityId'),
            transactionId,
            correlationId: actor.correlationId,
            schemaVersion: 1,
            version: 0,
            createdBy: toObjectId(actor.userId, 'actor.userId'),
            updatedBy: toObjectId(actor.userId, 'actor.userId'),
            operationKey,
            refundNumber: normalizePaymentCashierCode(refundNumber),
            refundRequestId: request._id,
            patientAccountId: request.patientAccountId,
            patientId: request.patientId,
            paymentId: request.paymentId,
            depositId: request.depositId,
            creditNoteId: request.creditNoteId,
            amount: request.amount,
            currency: request.currency,
            paymentMethodConfigurationId: method._id,
            paymentMethod: method.methodCode,
            externalReference: input.externalReference ?? null,
            cashCounterId: nullablePaymentCashierObjectId(
              input.cashCounterId,
              'cashCounterId',
            ),
            cashShiftId: nullablePaymentCashierObjectId(
              input.cashShiftId,
              'cashShiftId',
            ),
            cashierUserId: toObjectId(actor.userId, 'actor.userId'),
            unallocatedRefundAmount: paymentCashierDecimal128(
              unallocatedRefundAmount,
              'unallocatedRefundAmount',
            ),
            allocationEffects,
            status: 'POSTED',
            postedAt: now,
            postedBy: toObjectId(actor.userId, 'actor.userId'),
            failureCode: null,
            failureMessage: null,
            reversedAt: null,
            reversedBy: null,
            reversalReason: null,
            reversalApprovalRequestId: null,
          },
          session,
        );
        const updatedRequest = await this.dependencies.controls.updateRefundRequest(
          actor.facilityId,
          requestId,
          request.version,
          {
            status: 'COMPLETED',
            completedRefundId: refund._id,
            updatedBy: toObjectId(actor.userId, 'actor.userId'),
            transactionId,
            correlationId: actor.correlationId,
          },
          session,
        );

        if (updatedRequest === null) {
          throw new PaymentCashierConcurrencyError();
        }

        if (payment !== null && payment.status === 'REFUNDED') {
          const receipt = await this.dependencies.receipts.findByPaymentId(
            actor.facilityId,
            payment._id.toHexString(),
            session,
          );

          if (receipt !== null) {
            await this.dependencies.receipts.updateStatus(
              actor.facilityId,
              receipt._id.toHexString(),
              receipt.version,
              {
                status: 'REFUNDED',
                refundId: refund._id,
                statusChangedAt: now,
                statusChangedBy: toObjectId(actor.userId, 'actor.userId'),
                statusReason: request.reason,
                updatedBy: toObjectId(actor.userId, 'actor.userId'),
                transactionId,
                correlationId: actor.correlationId,
              },
              session,
            );
          }
        }

        const view = projectRefund(refund);

        await this.dependencies.commandSupport.appendHistory({
          actor,
          transactionId,
          entityType: 'REFUND',
          entityId: view.id,
          action: 'POSTED',
          occurredAt: now,
          session,
          statusFrom: 'PENDING',
          statusTo: 'POSTED',
          amount: view.amount,
          currency: view.currency,
          reasonCode: request.reasonCode,
          reason: request.reason,
          approvalRequestId: request.approvalRequestId.toHexString(),
          cashCounterId: input.cashCounterId,
          cashShiftId: input.cashShiftId,
          paymentMethodConfigurationId: method._id.toHexString(),
          patientId: view.patientId,
          patientAccountId: view.patientAccountId,
          paymentId: view.paymentId,
          refundId: view.id,
          metadata: {
            refundNumber: view.refundNumber,
            ledgerTransactionId: ledgerTransaction._id.toHexString(),
          },
        });

        await this.writeControlEvent(
          actor,
          transactionId,
          now,
          'REFUND',
          view.id,
          PAYMENT_CASHIER_AUDIT_ACTIONS.REFUND_POSTED,
          PAYMENT_CASHIER_EVENT_TYPES.REFUND_POSTED,
          request.reason,
          view as unknown as Record<string, unknown>,
          session,
        );

        return view;
      },
    });

    await this.publishRefundChange(actor.facilityId, result.id, result.status);
    return result;
  }

  public async reverseRefund(
    command: PaymentCashierCommandContext,
    refundId: string,
    input: ReverseRefundInput,
  ): Promise<RefundView> {
    const { actor } = command;
    const existing = await this.dependencies.controls.findRefundById(
      actor.facilityId,
      refundId,
    );

    if (existing === null) {
      throw new RefundNotFoundError();
    }

    this.dependencies.accessPolicy.require({
      actor,
      action: 'REFUND_REVERSE',
      resourceFacilityId: actor.facilityId,
      counterId: existing.cashCounterId?.toHexString() ?? null,
      makerUserId: existing.postedBy?.toHexString() ?? existing.createdBy.toHexString(),
    });

    const result = await this.dependencies.commandSupport.execute({
      operation: PAYMENT_CASHIER_TRANSACTION_TYPES.REVERSE_REFUND,
      command,
      payload: { refundId, ...input },
      lockKeys: [
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.REFUND,
          actor.facilityId,
          refundId,
        ),
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.PATIENT_ACCOUNT,
          actor.facilityId,
          existing.patientAccountId.toHexString(),
        ),
        ...(existing.paymentId === null
          ? []
          : [
              paymentCashierLockKey(
                PAYMENT_CASHIER_LOCK_NAMESPACES.PAYMENT,
                actor.facilityId,
                existing.paymentId.toHexString(),
              ),
            ]),
        ...(existing.depositId === null
          ? []
          : [
              paymentCashierLockKey(
                PAYMENT_CASHIER_LOCK_NAMESPACES.DEPOSIT,
                actor.facilityId,
                existing.depositId.toHexString(),
              ),
            ]),
      ],
      work: async ({ session, transactionId, operationKey }) => {
        const refund = await this.dependencies.controls.findRefundById(
          actor.facilityId,
          refundId,
          session,
        );

        if (
          refund === null ||
          refund.version !== input.expectedRefundVersion ||
          refund.status !== 'POSTED'
        ) {
          throw new PaymentCashierConcurrencyError();
        }

        const approval = await this.dependencies.controls.findApprovalById(
          actor.facilityId,
          input.approvalRequestId,
          session,
        );

        if (
          approval === null ||
          approval.status !== 'APPROVED' ||
          approval.approvalType !== 'REFUND_REVERSAL' ||
          approval.entityId.toHexString() !== refundId ||
          approval.decidedBy === null ||
          approval.requestedBy.equals(actor.userId)
        ) {
          throw new PaymentCashierConcurrencyError(
            'Refund reversal requires an approved independent reversal request',
          );
        }

        const now = this.dependencies.clock.now();
        const metadata = {
          actorUserId: actor.userId,
          transactionId,
          correlationId: actor.correlationId,
        };
        let payment: PaymentRecord | null = null;

        if (refund.paymentId !== null) {
          payment = await this.dependencies.payments.findPaymentById(
            actor.facilityId,
            refund.paymentId.toHexString(),
            session,
          );

          if (payment === null) {
            throw new PaymentNotFoundError();
          }

          payment = await this.dependencies.financialControl.reversePaymentRefund(
            actor.facilityId,
            payment,
            refund,
            metadata,
            session,
          );
        } else if (refund.depositId !== null) {
          const deposit = await this.dependencies.deposits.findById(
            actor.facilityId,
            refund.depositId.toHexString(),
            session,
          );

          if (deposit === null) {
            throw new DepositNotFoundError();
          }

          await this.dependencies.financialControl.reverseDepositRefund(
            actor.facilityId,
            deposit,
            refund.amount.toString(),
            metadata,
            session,
          );
        } else if (refund.creditNoteId !== null) {
          await this.dependencies.financialControl.reverseCreditNoteRefund(
            actor.facilityId,
            refund.patientAccountId.toHexString(),
            refund.amount.toString(),
            metadata,
            session,
          );
        }

        const method = refund.paymentMethodConfigurationId === null
          ? null
          : await this.dependencies.configuration.findPaymentMethodById(
              actor.facilityId,
              refund.paymentMethodConfigurationId.toHexString(),
              session,
            );

        if (method === null) {
          throw new PaymentMethodConfigurationNotFoundError();
        }

        await this.postRefundLedger(
          actor,
          method,
          refund.amount.toString(),
          refund.patientId.toHexString(),
          refund.patientAccountId.toHexString(),
          refund.paymentId?.toHexString() ?? null,
          refund.cashCounterId?.toHexString() ?? null,
          refund.cashShiftId?.toHexString() ?? null,
          refund.currency,
          `${operationKey}:ledger`,
          transactionId,
          now,
          true,
          session,
        );

        const updated = requireUpdated(
          await this.dependencies.controls.updateRefund(
            actor.facilityId,
            refundId,
            refund.version,
            {
              status: 'REVERSED',
              reversedAt: now,
              reversedBy: toObjectId(actor.userId, 'actor.userId'),
              reversalReason: normalizePaymentCashierText(input.reason),
              reversalApprovalRequestId: toObjectId(
                input.approvalRequestId,
                'approvalRequestId',
              ),
              updatedBy: toObjectId(actor.userId, 'actor.userId'),
              transactionId,
              correlationId: actor.correlationId,
            },
            session,
          ),
        );

        if (payment !== null) {
          const receipt = await this.dependencies.receipts.findByPaymentId(
            actor.facilityId,
            payment._id.toHexString(),
            session,
          );

          if (receipt !== null && receipt.refundId?.equals(refund._id) === true) {
            await this.dependencies.receipts.updateStatus(
              actor.facilityId,
              receipt._id.toHexString(),
              receipt.version,
              {
                status: 'ISSUED',
                refundId: null,
                statusChangedAt: now,
                statusChangedBy: toObjectId(actor.userId, 'actor.userId'),
                statusReason: input.reason,
                updatedBy: toObjectId(actor.userId, 'actor.userId'),
                transactionId,
                correlationId: actor.correlationId,
              },
              session,
            );
          }
        }

        const view = projectRefund(updated);

        await this.dependencies.commandSupport.appendHistory({
          actor,
          transactionId,
          entityType: 'REFUND',
          entityId: view.id,
          action: 'REVERSED',
          occurredAt: now,
          session,
          statusFrom: 'POSTED',
          statusTo: 'REVERSED',
          amount: view.amount,
          currency: view.currency,
          reasonCode: input.reasonCode,
          reason: input.reason,
          approvalRequestId: input.approvalRequestId,
          cashCounterId: refund.cashCounterId?.toHexString() ?? null,
          cashShiftId: refund.cashShiftId?.toHexString() ?? null,
          patientId: view.patientId,
          patientAccountId: view.patientAccountId,
          paymentId: view.paymentId,
          refundId: view.id,
        });

        await this.writeControlEvent(
          actor,
          transactionId,
          now,
          'REFUND',
          view.id,
          PAYMENT_CASHIER_AUDIT_ACTIONS.REFUND_REVERSED,
          PAYMENT_CASHIER_EVENT_TYPES.REFUND_REVERSED,
          input.reason,
          view as unknown as Record<string, unknown>,
          session,
        );

        return view;
      },
    });

    await this.publishRefundChange(actor.facilityId, result.id, result.status);
    return result;
  }

  public async requestPaymentReversal(
    command: PaymentCashierCommandContext,
    input: CreatePaymentReversalInput,
  ): Promise<PaymentReversalView> {
    const { actor } = command;

    this.dependencies.accessPolicy.require({
      actor,
      action: 'REVERSAL_REQUEST',
      resourceFacilityId: actor.facilityId,
    });

    const result = await this.dependencies.commandSupport.execute({
      operation: PAYMENT_CASHIER_TRANSACTION_TYPES.CREATE_PAYMENT_REVERSAL,
      command,
      payload: input,
      lockKeys: [
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.PAYMENT,
          actor.facilityId,
          input.paymentId,
        ),
      ],
      work: async ({ session, transactionId, operationKey }) => {
        const payment = await this.dependencies.payments.findPaymentById(
          actor.facilityId,
          input.paymentId,
          session,
        );

        if (
          payment === null ||
          !['POSTED', 'COMPLETED'].includes(payment.status) ||
          !decimal(payment.amount).equals(input.amount) ||
          !decimal(payment.refundedAmount).isZero() ||
          !decimal(payment.reversedAmount).isZero()
        ) {
          throw new PaymentRefundableBalanceError();
        }

        const now = this.dependencies.clock.now();
        const [reversalNumber, approvalNumber] = await Promise.all([
          this.dependencies.sequences.next(
            actor.facilityId,
            PAYMENT_CASHIER_SEQUENCE_KEYS.PAYMENT_REVERSAL,
            now,
            session,
          ),
          this.dependencies.sequences.next(
            actor.facilityId,
            PAYMENT_CASHIER_SEQUENCE_KEYS.FINANCIAL_APPROVAL,
            now,
            session,
          ),
        ]);
        const created = await this.dependencies.controls.createPaymentReversalWithApproval(
          actor.facilityId,
          input,
          {
            operationKey,
            reversalNumber,
            approvalOperationKey: `${operationKey}:approval`,
            approvalRequestNumber: approvalNumber,
            patientAccountId: payment.patientAccountId.toHexString(),
            actorUserId: actor.userId,
            requestedAt: now,
            transactionId,
            correlationId: actor.correlationId,
          },
          session,
        );
        const view = projectPaymentReversal(created);

        await this.dependencies.commandSupport.appendHistory({
          actor,
          transactionId,
          entityType: 'PAYMENT_REVERSAL',
          entityId: view.id,
          action: 'APPROVAL_REQUESTED',
          occurredAt: now,
          session,
          statusFrom: null,
          statusTo: 'REQUESTED',
          amount: view.amount,
          currency: payment.currency,
          reasonCode: view.reasonCode,
          reason: view.reason,
          approvalRequestId: view.approvalRequestId,
          patientId: payment.patientId.toHexString(),
          patientAccountId: view.patientAccountId,
          paymentId: view.paymentId,
        });

        await this.writeControlEvent(
          actor,
          transactionId,
          now,
          'PAYMENT_REVERSAL',
          view.id,
          PAYMENT_CASHIER_AUDIT_ACTIONS.PAYMENT_REVERSAL_REQUESTED,
          PAYMENT_CASHIER_EVENT_TYPES.PAYMENT_REVERSAL_REQUESTED,
          view.reason,
          view as unknown as Record<string, unknown>,
          session,
        );

        return view;
      },
    });

    await this.publishReversalChange(actor.facilityId, result.id, result.status);
    return result;
  }

  public async decidePaymentReversal(
    command: PaymentCashierCommandContext,
    reversalId: string,
    input: DecidePaymentReversalInput,
  ): Promise<PaymentReversalView> {
    const { actor } = command;
    const existing = await this.dependencies.controls.findReversalById(
      actor.facilityId,
      reversalId,
    );

    if (existing === null) {
      throw new PaymentReversalNotFoundError();
    }

    this.dependencies.accessPolicy.require({
      actor,
      action: 'REVERSAL_APPROVE',
      resourceFacilityId: actor.facilityId,
      makerUserId: existing.createdBy.toHexString(),
    });

    const result = await this.dependencies.commandSupport.execute({
      operation: PAYMENT_CASHIER_TRANSACTION_TYPES.DECIDE_PAYMENT_REVERSAL,
      command,
      payload: { reversalId, ...input },
      lockKeys: [
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.PAYMENT_REVERSAL,
          actor.facilityId,
          reversalId,
        ),
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.FINANCIAL_APPROVAL,
          actor.facilityId,
          existing.approvalRequestId.toHexString(),
        ),
      ],
      work: async ({ session, transactionId }) => {
        const now = this.dependencies.clock.now();
        const decided = await this.dependencies.controls.decidePaymentReversal(
          actor.facilityId,
          reversalId,
          input.expectedVersion,
          existing.approvalRequestId.toHexString(),
          input.decision,
          input.decisionReason,
          actor.userId,
          now,
          transactionId,
          actor.correlationId,
          session,
        );
        const view = projectPaymentReversal(decided);
        const approved = input.decision === 'APPROVE';

        await this.dependencies.commandSupport.appendHistory({
          actor,
          transactionId,
          entityType: 'PAYMENT_REVERSAL',
          entityId: view.id,
          action: approved ? 'APPROVED' : 'REJECTED',
          occurredAt: now,
          session,
          statusFrom: 'REQUESTED',
          statusTo: view.status,
          amount: view.amount,
          reason: input.decisionReason,
          approvalRequestId: view.approvalRequestId,
          patientAccountId: view.patientAccountId,
          paymentId: view.paymentId,
        });

        await this.writeControlEvent(
          actor,
          transactionId,
          now,
          'PAYMENT_REVERSAL',
          view.id,
          approved
            ? PAYMENT_CASHIER_AUDIT_ACTIONS.PAYMENT_REVERSAL_APPROVED
            : PAYMENT_CASHIER_AUDIT_ACTIONS.PAYMENT_REVERSAL_REJECTED,
          PAYMENT_CASHIER_EVENT_TYPES.PAYMENT_REVERSAL_DECIDED,
          input.decisionReason,
          view as unknown as Record<string, unknown>,
          session,
        );

        return view;
      },
    });

    await this.publishReversalChange(actor.facilityId, result.id, result.status);
    return result;
  }

  public async postPaymentReversal(
    command: PaymentCashierCommandContext,
    reversalId: string,
    input: PostPaymentReversalInput,
  ): Promise<PaymentReversalView> {
    const { actor } = command;
    const existing = await this.dependencies.controls.findReversalById(
      actor.facilityId,
      reversalId,
    );

    if (existing === null) {
      throw new PaymentReversalNotFoundError();
    }

    this.dependencies.accessPolicy.require({
      actor,
      action: 'REVERSAL_PROCESS',
      resourceFacilityId: actor.facilityId,
      counterId: input.cashCounterId,
      cashierUserId: actor.userId,
      makerUserId: existing.createdBy.toHexString(),
    });

    const result = await this.dependencies.commandSupport.execute({
      operation: PAYMENT_CASHIER_TRANSACTION_TYPES.POST_PAYMENT_REVERSAL,
      command,
      payload: { reversalId, ...input },
      lockKeys: [
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.PAYMENT_REVERSAL,
          actor.facilityId,
          reversalId,
        ),
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.PAYMENT,
          actor.facilityId,
          existing.paymentId.toHexString(),
        ),
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.PATIENT_ACCOUNT,
          actor.facilityId,
          existing.patientAccountId.toHexString(),
        ),
        ...(input.cashShiftId == null
          ? []
          : [
              paymentCashierLockKey(
                PAYMENT_CASHIER_LOCK_NAMESPACES.CASHIER_SHIFT,
                actor.facilityId,
                input.cashShiftId,
              ),
            ]),
      ],
      work: async ({ session, transactionId, operationKey }) => {
        const reversal = await this.dependencies.controls.findReversalById(
          actor.facilityId,
          reversalId,
          session,
        );

        if (
          reversal === null ||
          reversal.version !== input.expectedVersion ||
          reversal.status !== 'APPROVED'
        ) {
          throw new PaymentCashierConcurrencyError();
        }

        const approval = await this.dependencies.controls.findApprovalById(
          actor.facilityId,
          reversal.approvalRequestId.toHexString(),
          session,
        );

        if (approval === null || approval.status !== 'APPROVED') {
          throw new PaymentCashierConcurrencyError();
        }

        const payment = await this.dependencies.payments.findPaymentById(
          actor.facilityId,
          reversal.paymentId.toHexString(),
          session,
        );

        if (
          payment === null ||
          !decimal(payment.amount).equals(reversal.amount.toString()) ||
          !decimal(payment.refundedAmount).isZero() ||
          !decimal(payment.reversedAmount).isZero()
        ) {
          throw new PaymentRefundableBalanceError();
        }

        const cashTender = payment.tenders.some(
          (tender) => tender.paymentMethodKindSnapshot === 'CASH',
        );

        if (cashTender) {
          await this.requireRefundShift(
            actor,
            null,
            input.cashCounterId,
            input.cashShiftId,
            session,
          );
        }

        const allocations = await this.dependencies.payments.listAllocations(
          actor.facilityId,
          payment._id.toHexString(),
          session,
        );
        const activeAllocationIds = allocations
          .filter((allocation) => allocation.status === 'ACTIVE')
          .map((allocation) => allocation._id.toHexString());
        const reversedAllocations = activeAllocationIds.length === 0
          ? []
          : await this.dependencies.payments.reverseAllocations(
              actor.facilityId,
              activeAllocationIds,
              reversal.reason,
              actor.userId,
              this.dependencies.clock.now(),
              session,
            );

        const now = this.dependencies.clock.now();
        await this.dependencies.billing.reversePaymentEffects(
          actor.facilityId,
          payment,
          reversedAllocations,
          reversal.amount.toString(),
          session,
        );
        await this.postPaymentReversalLedger(
          actor,
          payment,
          input.cashCounterId ?? null,
          input.cashShiftId ?? null,
          `${operationKey}:ledger`,
          transactionId,
          now,
          session,
        );
        await this.dependencies.financialControl.markPaymentReversed(
          actor.facilityId,
          payment,
          reversalId,
          {
            actorUserId: actor.userId,
            transactionId,
            correlationId: actor.correlationId,
          },
          session,
        );
        const updated = requireUpdated(
          await this.dependencies.controls.updateReversal(
            actor.facilityId,
            reversalId,
            reversal.version,
            {
              status: 'POSTED',
              cashCounterId: nullablePaymentCashierObjectId(
                input.cashCounterId,
                'cashCounterId',
              ),
              cashShiftId: nullablePaymentCashierObjectId(
                input.cashShiftId,
                'cashShiftId',
              ),
              cashierUserId: toObjectId(actor.userId, 'actor.userId'),
              postedAt: now,
              postedBy: toObjectId(actor.userId, 'actor.userId'),
              updatedBy: toObjectId(actor.userId, 'actor.userId'),
              transactionId,
              correlationId: actor.correlationId,
            },
            session,
          ),
        );
        const receipt = await this.dependencies.receipts.findByPaymentId(
          actor.facilityId,
          payment._id.toHexString(),
          session,
        );

        if (receipt !== null) {
          await this.dependencies.receipts.updateStatus(
            actor.facilityId,
            receipt._id.toHexString(),
            receipt.version,
            {
              status: 'REVERSED',
              paymentReversalId: updated._id,
              statusChangedAt: now,
              statusChangedBy: toObjectId(actor.userId, 'actor.userId'),
              statusReason: reversal.reason,
              updatedBy: toObjectId(actor.userId, 'actor.userId'),
              transactionId,
              correlationId: actor.correlationId,
            },
            session,
          );
        }

        const view = projectPaymentReversal(updated);

        await this.dependencies.commandSupport.appendHistory({
          actor,
          transactionId,
          entityType: 'PAYMENT_REVERSAL',
          entityId: view.id,
          action: 'POSTED',
          occurredAt: now,
          session,
          statusFrom: 'APPROVED',
          statusTo: 'POSTED',
          amount: view.amount,
          currency: payment.currency,
          reasonCode: view.reasonCode,
          reason: view.reason,
          approvalRequestId: view.approvalRequestId,
          cashCounterId: input.cashCounterId,
          cashShiftId: input.cashShiftId,
          patientId: payment.patientId.toHexString(),
          patientAccountId: view.patientAccountId,
          paymentId: view.paymentId,
        });

        await this.writeControlEvent(
          actor,
          transactionId,
          now,
          'PAYMENT_REVERSAL',
          view.id,
          PAYMENT_CASHIER_AUDIT_ACTIONS.PAYMENT_REVERSED,
          PAYMENT_CASHIER_EVENT_TYPES.PAYMENT_REVERSED,
          view.reason,
          view as unknown as Record<string, unknown>,
          session,
        );

        return view;
      },
    });

    await this.publishReversalChange(actor.facilityId, result.id, result.status);
    return result;
  }

  private async resolveRefundSource(
    facilityId: string,
    input: CreateRefundRequestInput,
    session: PaymentCashierMongoSession,
  ): Promise<RefundSourceResolution> {
    if (input.paymentId != null) {
      const payment = await this.dependencies.payments.findPaymentById(
        facilityId,
        input.paymentId,
        session,
      );

      if (payment === null) {
        throw new PaymentNotFoundError();
      }

      return {
        patientId: payment.patientId.toHexString(),
        patientAccountId: payment.patientAccountId.toHexString(),
        currency: payment.currency,
        maximumRefundable: decimal(payment.amount)
          .minus(decimal(payment.refundedAmount))
          .minus(decimal(payment.reversedAmount)),
      };
    }

    if (input.depositId != null) {
      const deposit = await this.dependencies.deposits.findById(
        facilityId,
        input.depositId,
        session,
      );

      if (deposit === null || deposit.patientAccountId === null) {
        throw new DepositNotFoundError();
      }

      return {
        patientId: deposit.patientId.toHexString(),
        patientAccountId: deposit.patientAccountId.toHexString(),
        currency: deposit.currency,
        maximumRefundable: decimal(deposit.availableAmount),
      };
    }

    if (input.creditNoteId != null) {
      const creditNote = await this.dependencies.controls.findPostedCreditNote(
        facilityId,
        input.creditNoteId,
        session,
      );

      if (creditNote === null) {
        throw new PaymentRefundableBalanceError();
      }

      const refunded = new Decimal(
        await this.dependencies.controls.sumPostedCreditNoteRefunds(
          facilityId,
          input.creditNoteId,
          session,
        ),
      );

      return {
        patientId: creditNote.patientId.toHexString(),
        patientAccountId: creditNote.patientAccountId.toHexString(),
        currency: creditNote.currency,
        maximumRefundable: decimal(creditNote.amount).minus(refunded),
      };
    }

    throw new PaymentRefundableBalanceError();
  }

  private async requireRefundMethod(
    facilityId: string,
    methodId: string,
    currency: string,
    session: PaymentCashierMongoSession,
  ): Promise<PaymentMethodConfigurationRecord> {
    const method = await this.dependencies.configuration.findPaymentMethodById(
      facilityId,
      methodId,
      session,
    );

    if (method === null) {
      throw new PaymentMethodConfigurationNotFoundError();
    }

    const now = this.dependencies.clock.now();

    if (
      !method.active ||
      method.effectiveFrom > now ||
      (method.effectiveThrough !== null && method.effectiveThrough < now)
    ) {
      throw new PaymentMethodInactiveError();
    }

    if (!method.refundEligible) {
      throw new PaymentMethodRefundNotAllowedError();
    }

    if (!method.allowedCurrencies.includes(currency)) {
      throw new PaymentMethodRefundNotAllowedError();
    }

    return method;
  }

  private async requireRefundShift(
    actor: PaymentCashierActorContext,
    method: PaymentMethodConfigurationRecord | null,
    counterId: string | null | undefined,
    shiftId: string | null | undefined,
    session: PaymentCashierMongoSession,
  ): Promise<void> {
    const required = method === null ||
      method.cashEquivalent ||
      method.requiresOpenCashierShift;

    if (!required) {
      return;
    }

    if (counterId == null || shiftId == null) {
      throw new CashierShiftNotOpenError();
    }

    const [counter, shift] = await Promise.all([
      this.dependencies.configuration.findCounterById(
        actor.facilityId,
        counterId,
        session,
      ),
      this.dependencies.shifts.findById(
        actor.facilityId,
        shiftId,
        session,
      ),
    ]);

    if (counter === null) {
      throw new CashCounterNotFoundError();
    }

    if (!counter.active) {
      throw new CashCounterInactiveError();
    }

    if (shift === null) {
      throw new CashierShiftNotFoundError();
    }

    if (
      shift.status !== 'OPEN' ||
      shift.cashCounterId.toHexString() !== counterId ||
      shift.cashierUserId.toHexString() !== actor.userId
    ) {
      throw new CashierShiftNotOpenError();
    }
  }

  private async postRefundLedger(
    actor: PaymentCashierActorContext,
    method: PaymentMethodConfigurationRecord,
    amount: string,
    patientId: string,
    patientAccountId: string,
    paymentId: string | null,
    counterId: string | null,
    shiftId: string | null,
    currency: string,
    operationKey: string,
    transactionId: string,
    postedAt: Date,
    reverse: boolean,
    session: PaymentCashierMongoSession,
  ) {
    const sourceLedger = method.cashEquivalent
      ? method.cashLedgerAccountId
      : method.clearingLedgerAccountId;
    const counterpartyLedger = method.receivableLedgerAccountId;

    if (sourceLedger === null || counterpartyLedger === null) {
      throw new PaymentMethodRefundNotAllowedError();
    }

    return this.dependencies.ledger.postBalancedTransaction(
      {
        operationKey,
        facilityId: actor.facilityId,
        sourceEntityType: reverse ? 'REFUND_REVERSAL' : 'REFUND',
        sourceEntityId: paymentId ?? patientAccountId,
        patientId,
        patientAccountId,
        paymentId,
        cashShiftId: shiftId,
        cashCounterId: counterId,
        paymentMethodConfigurationId: method._id.toHexString(),
        currency,
        description: reverse ? 'Refund reversal' : 'Approved patient refund',
        postedAt,
        postedBy: actor.userId,
        entries: reverse
          ? [
              {
                ledgerAccountId: sourceLedger.toHexString(),
                direction: 'DEBIT',
                amount,
                description: 'Restore cash or clearing balance',
              },
              {
                ledgerAccountId: counterpartyLedger.toHexString(),
                direction: 'CREDIT',
                amount,
                description: 'Restore patient credit or receivable',
              },
            ]
          : [
              {
                ledgerAccountId: counterpartyLedger.toHexString(),
                direction: 'DEBIT',
                amount,
                description: 'Reduce patient credit or receivable',
              },
              {
                ledgerAccountId: sourceLedger.toHexString(),
                direction: 'CREDIT',
                amount,
                description: 'Refund cash or clearing outflow',
              },
            ],
        transactionId,
        correlationId: actor.correlationId,
      },
      session,
    );
  }

  private async postPaymentReversalLedger(
    actor: PaymentCashierActorContext,
    payment: PaymentRecord,
    counterId: string | null,
    shiftId: string | null,
    currency: string,
    operationKey: string,
    transactionId: string,
    postedAt: Date,
    session: PaymentCashierMongoSession,
  ): Promise<void> {
    const entries: Array<{
      ledgerAccountId: string;
      direction: 'DEBIT' | 'CREDIT';
      amount: string;
      description: string;
    }> = [];

    for (const tender of payment.tenders) {
      const method = await this.dependencies.configuration.findPaymentMethodById(
        actor.facilityId,
        tender.paymentMethodConfigurationId.toHexString(),
        session,
      );

      if (method === null || !method.reversalEligible) {
        throw new PaymentMethodRefundNotAllowedError();
      }

      const sourceLedger = method.cashEquivalent
        ? method.cashLedgerAccountId
        : method.clearingLedgerAccountId;
      const counterpartyLedger = method.receivableLedgerAccountId;

      if (sourceLedger === null || counterpartyLedger === null) {
        throw new PaymentMethodRefundNotAllowedError();
      }

      entries.push(
        {
          ledgerAccountId: counterpartyLedger.toHexString(),
          direction: 'DEBIT',
          amount: tender.amount.toString(),
          description: `Reverse ${tender.paymentMethodCodeSnapshot} receipt`,
        },
        {
          ledgerAccountId: sourceLedger.toHexString(),
          direction: 'CREDIT',
          amount: tender.amount.toString(),
          description: `Return ${tender.paymentMethodCodeSnapshot} tender`,
        },
      );
    }

    await this.dependencies.ledger.postBalancedTransaction(
      {
        operationKey,
        facilityId: actor.facilityId,
        sourceEntityType: 'PAYMENT_REVERSAL',
        sourceEntityId: payment._id.toHexString(),
        patientId: payment.patientId.toHexString(),
        patientAccountId: payment.patientAccountId.toHexString(),
        invoiceId: payment.invoiceId?.toHexString() ?? null,
        paymentId: payment._id.toHexString(),
        cashShiftId: shiftId,
        cashCounterId: counterId,
        currency: payment.currency,
        description: `Reverse payment ${payment.paymentNumber}`,
        postedAt,
        postedBy: actor.userId,
        entries,
        transactionId,
        correlationId: actor.correlationId,
      },
      session,
    );
  }

  private refundSourceLockKeys(
    facilityId: string,
    input: CreateRefundRequestInput,
  ): string[] {
    if (input.paymentId != null) {
      return [
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.PAYMENT,
          facilityId,
          input.paymentId,
        ),
      ];
    }

    if (input.depositId != null) {
      return [
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.DEPOSIT,
          facilityId,
          input.depositId,
        ),
      ];
    }

    return [
      paymentCashierLockKey(
        PAYMENT_CASHIER_LOCK_NAMESPACES.PATIENT_ACCOUNT,
        facilityId,
        input.patientAccountId,
      ),
    ];
  }

  private refundRequestSourceLocks(
    facilityId: string,
    request: RefundRequestRecord,
  ): string[] {
    if (request.paymentId !== null) {
      return [
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.PAYMENT,
          facilityId,
          request.paymentId.toHexString(),
        ),
      ];
    }

    if (request.depositId !== null) {
      return [
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.DEPOSIT,
          facilityId,
          request.depositId.toHexString(),
        ),
      ];
    }

    return [];
  }

  private async writeControlEvent(
    actor: PaymentCashierActorContext,
    transactionId: string,
    occurredAt: Date,
    entityType: string,
    entityId: string,
    auditAction: string,
    eventType: string,
    reason: string,
    after: Record<string, unknown>,
    session: PaymentCashierMongoSession,
  ): Promise<void> {
    await Promise.all([
      this.dependencies.audit.record(
        {
          facilityId: actor.facilityId,
          actorUserId: actor.userId,
          actorStaffId: actor.staffId,
          action: auditAction,
          entityType,
          entityId,
          reason,
          before: null,
          after,
          correlationId: actor.correlationId,
          transactionId,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        },
        session,
      ),
      this.dependencies.outbox.publish(
        {
          facilityId: actor.facilityId,
          aggregateType: entityType,
          aggregateId: entityId,
          eventType,
          payload: {
            entityId,
            status: after['status'],
          },
          correlationId: actor.correlationId,
          transactionId,
          occurredAt,
        },
        session,
      ),
    ]);
  }

  private async publishRefundChange(
    facilityId: string,
    entityId: string,
    status: string,
  ): Promise<void> {
    await this.dependencies.realtime.publishMinimumNecessary({
      facilityId,
      eventType: PAYMENT_CASHIER_REALTIME_EVENTS.REFUND_CHANGED,
      entityId,
      status,
      occurredAt: this.dependencies.clock.now().toISOString(),
    });
  }

  private async publishReversalChange(
    facilityId: string,
    entityId: string,
    status: string,
  ): Promise<void> {
    await this.dependencies.realtime.publishMinimumNecessary({
      facilityId,
      eventType: PAYMENT_CASHIER_REALTIME_EVENTS.REVERSAL_CHANGED,
      entityId,
      status,
      occurredAt: this.dependencies.clock.now().toISOString(),
    });
  }
}