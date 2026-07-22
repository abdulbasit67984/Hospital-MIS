import Decimal from 'decimal.js';

import {
  decimal128ToString,
} from '@hospital-mis/database';

import {
  CLAIM_PERMISSION_KEYS,
  CLAIM_REMITTANCE_NUMBER_SEQUENCE_KEY,
} from '../claims.constants.js';

import type {
  ClaimsActorContext,
  ImportRemittanceInput,
  PostClaimPaymentInput,
} from '../claims.contracts.js';

import {
  ClaimAccessDeniedError,
  ClaimFinancialReconciliationError,
  ClaimLineNotFoundError,
  ClaimNotFoundError,
  ClaimPaymentOverAllocationError,
  ClaimRemittanceNotFoundError,
  ClaimRemittanceReconciliationError,
  ClaimVersionConflictError,
} from '../claims.errors.js';

import {
  calculateClaimReceivable,
  reconcileRemittance,
} from '../claims.financial-math.js';

import type {
  ClaimLineRecord,
} from '../claims.persistence.types.js';

import type {
  ClaimLineRepositoryPort,
  ClaimPaymentAllocationRepositoryPort,
  ClaimRemittanceRepositoryPort,
  ClaimsAccessPolicyPort,
  ClaimsAttachmentPort,
  ClaimsAuditPort,
  ClaimsClockPort,
  ClaimsFinancialDischargePort,
  ClaimsFinancialLedgerPort,
  ClaimsNumberSequencePort,
  ClaimsOutboxPort,
  ClaimsPaymentIntegrationPort,
  ClaimsRepositoryPort,
  ClaimsTransactionManagerPort,
  ClaimsWorkflowPort,
  ClaimWorkQueueRepositoryPort,
} from '../claims.ports.js';

export interface ClaimRemittancePaymentServiceDependencies {
  claims: ClaimsRepositoryPort;
  lines: ClaimLineRepositoryPort;
  remittances: ClaimRemittanceRepositoryPort;
  paymentAllocations: ClaimPaymentAllocationRepositoryPort;
  paymentIntegration: ClaimsPaymentIntegrationPort;
  workflow: ClaimsWorkflowPort;
  workQueue: ClaimWorkQueueRepositoryPort;
  accessPolicy: ClaimsAccessPolicyPort;
  transactionManager: ClaimsTransactionManagerPort;
  numberSequence: ClaimsNumberSequencePort;
  attachments: ClaimsAttachmentPort;
  ledger: ClaimsFinancialLedgerPort;
  financialDischarge: ClaimsFinancialDischargePort;
  audit: ClaimsAuditPort;
  outbox: ClaimsOutboxPort;
  clock: ClaimsClockPort;
}

function money(value: unknown): Decimal {
  return new Decimal(String(value ?? '0')).toDecimalPlaces(
    2,
    Decimal.ROUND_HALF_UP,
  );
}

interface EffectivePaymentAllocation {
  claimLineId: string;
  amount: string;
}

function distributeHeaderPayment(
  lines: readonly ClaimLineRecord[],
  amountInput: string,
): readonly EffectivePaymentAllocation[] {
  let remaining = money(amountInput);
  const allocations: EffectivePaymentAllocation[] = [];
  const orderedLines = [...lines].sort(
    (left, right) => left.lineNumber - right.lineNumber,
  );

  for (const line of orderedLines) {
    if (remaining.isZero()) {
      break;
    }
    const outstanding = money(decimal128ToString(line.outstandingAmount));
    if (!outstanding.isPositive()) {
      continue;
    }
    const applied = remaining.lessThan(outstanding)
      ? remaining
      : outstanding;
    allocations.push({
      claimLineId: line._id.toHexString(),
      amount: applied.toFixed(2),
    });
    remaining = remaining.minus(applied);
  }

  if (remaining.isPositive()) {
    throw new ClaimPaymentOverAllocationError();
  }
  return allocations;
}

export class ClaimRemittancePaymentService {
  public constructor(
    private readonly dependencies: ClaimRemittancePaymentServiceDependencies,
  ) {}

  public async importRemittance(
    actor: ClaimsActorContext,
    idempotencyKey: string,
    input: ImportRemittanceInput,
  ) {
    await this.requirePermission(
      actor,
      CLAIM_PERMISSION_KEYS.REMITTANCE_IMPORT,
    );

    return this.dependencies.transactionManager.execute({
      transactionType: 'IMPORT_CLAIM_REMITTANCE',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `claims:remittance:${actor.facilityId}:${input.payerOrganizationId}:${input.remittanceReference}`,
        ...(input.paymentId == null
          ? []
          : [
              `claims:sponsor-payment:${actor.facilityId}:${input.paymentId}`,
            ]),
      ],
      idempotencyPayload: input,
      journalPayload: {
        payerOrganizationId: input.payerOrganizationId,
        remittanceReference: input.remittanceReference,
      },
      execute: async (transaction) => {
        const existing = await this.dependencies.remittances.findByReference(
          actor.facilityId,
          input.payerOrganizationId,
          input.remittanceReference,
          transaction.session,
        );
        if (existing !== null) {
          return existing;
        }

        const claimIds = [...new Set(
          input.allocations.map((allocation) => allocation.claimId),
        )];
        const claims = await this.dependencies.claims.findByIds(
          actor.facilityId,
          claimIds,
          transaction.session,
        );
        if (claims.length !== claimIds.length) {
          throw new ClaimNotFoundError();
        }
        if (
          claims.some(
            (claim) =>
              claim.payerOrganizationId.toHexString() !==
                input.payerOrganizationId ||
              claim.currency !== (input.currency ?? 'PKR'),
          )
        ) {
          throw new ClaimFinancialReconciliationError(
            'Remittance claims must belong to the same payer and currency',
          );
        }

        if (input.attachmentId !== undefined && input.attachmentId !== null) {
          await this.dependencies.attachments.assertAttachmentsUsable({
            facilityId: actor.facilityId,
            actorUserId: actor.userId,
            attachments: [{
              attachmentId: input.attachmentId,
              purpose: 'REMITTANCE_ADVICE',
            }],
          });
        }

        if (input.paymentId !== undefined && input.paymentId !== null) {
          const payment = await this.dependencies.paymentIntegration.assertSponsorPayment({
            facilityId: actor.facilityId,
            sponsorPaymentId: input.paymentId,
            payerOrganizationId: input.payerOrganizationId,
            currency: input.currency ?? 'PKR',
            session: transaction.session,
          });
          if (money(input.totalPaymentAmount).greaterThan(payment.availableAmount)) {
            throw new ClaimPaymentOverAllocationError();
          }
        }

        const allocatedAmount = input.allocations.reduce(
          (sum, allocation) => sum.plus(allocation.paidAmount),
          new Decimal(0),
        );
        const totalPaymentAmount = money(input.totalPaymentAmount);
        if (allocatedAmount.greaterThan(totalPaymentAmount)) {
          throw new ClaimRemittanceReconciliationError();
        }
        const unappliedAmount = totalPaymentAmount.minus(allocatedAmount);
        const reconciliation = reconcileRemittance({
          sponsorPaymentAmount: totalPaymentAmount.toFixed(2),
          allocatedAmount: allocatedAmount.toFixed(2),
          unappliedAmount: unappliedAmount.toFixed(2),
        });
        const now = this.dependencies.clock.now();
        const remittanceNumber = await this.dependencies.numberSequence.next({
          facilityId: actor.facilityId,
          sequenceKey: CLAIM_REMITTANCE_NUMBER_SEQUENCE_KEY,
          effectiveAt: now,
          actorUserId: actor.userId,
          transaction,
        });
        const remittance = await this.dependencies.remittances.create(
          actor,
          input,
          remittanceNumber,
          {
            operationKey: idempotencyKey,
            allocatedAmount: reconciliation.allocatedAmount,
            unappliedAmount: reconciliation.unappliedAmount,
            importedAt: now,
            allocations: input.allocations.map((allocation) => ({
              claimId: allocation.claimId,
              claimLineId: allocation.claimLineId,
              paidAmount: money(allocation.paidAmount).toFixed(2),
              contractualAdjustmentAmount: money(
                allocation.contractualAdjustmentAmount,
              ).toFixed(2),
              disallowedAmount: money(
                allocation.disallowedAmount,
              ).toFixed(2),
              withholdingAmount: money(
                allocation.withholdingAmount ?? '0',
              ).toFixed(2),
              payerClaimReference:
                allocation.payerClaimReference ?? null,
              payerLineReference:
                allocation.payerLineReference ?? null,
            })),
          },
          transaction,
        );

        for (const claimId of claimIds) {
          await this.dependencies.workQueue.upsertOpenItem(
            actor,
            {
              claimId,
              workQueueType: 'PAYMENT_MATCHING',
              priority: 55,
              followUpAt: now,
              reasonEncrypted: null,
            },
            transaction,
          );
        }

        await this.dependencies.audit.record({
          actor,
          action: 'CLAIM_REMITTANCE_IMPORTED',
          entityType: 'ClaimRemittance',
          entityId: remittance._id.toHexString(),
          reason: null,
          before: null,
          after: {
            remittanceNumber: remittance.remittanceNumber,
            claimCount: claimIds.length,
          },
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType: 'claims.remittance.imported',
          aggregateType: 'ClaimRemittance',
          aggregateId: remittance._id.toHexString(),
          payload: {
            remittanceId: remittance._id.toHexString(),
            status: 'IMPORTED',
            eventAt: now.toISOString(),
          },
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });

        return remittance;
      },
    });
  }

  public async postClaimPayment(
    actor: ClaimsActorContext,
    claimId: string,
    idempotencyKey: string,
    input: PostClaimPaymentInput,
  ) {
    await this.requirePermission(actor, CLAIM_PERMISSION_KEYS.PAYMENT_RECORD);
    await this.requirePermission(actor, CLAIM_PERMISSION_KEYS.PAYMENT_MATCH);

    return this.dependencies.transactionManager.execute({
      transactionType: 'POST_CLAIM_PAYMENT',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `claims:claim:${actor.facilityId}:${claimId}`,
        `claims:remittance:${actor.facilityId}:${input.remittanceId}`,
        `claims:sponsor-payment:${actor.facilityId}:${input.sponsorPaymentId}`,
      ],
      idempotencyPayload: input,
      journalPayload: {
        claimId,
        remittanceId: input.remittanceId,
        sponsorPaymentId: input.sponsorPaymentId,
      },
      execute: async (transaction) => {
        const claim = await this.dependencies.claims.findById(
          actor.facilityId,
          claimId,
          transaction.session,
        );
        if (claim === null) {
          throw new ClaimNotFoundError();
        }
        if (claim.version !== input.expectedVersion) {
          throw new ClaimVersionConflictError();
        }
        if (!['APPROVED', 'PARTIALLY_APPROVED'].includes(claim.status)) {
          throw new ClaimFinancialReconciliationError(
            'Only adjudicated claims can receive sponsor payments',
          );
        }

        const remittance = await this.dependencies.remittances.findById(
          actor.facilityId,
          input.remittanceId,
          transaction.session,
        );
        if (
          remittance === null ||
          remittance.reversedAt !== null ||
          remittance.payerOrganizationId.toHexString() !==
            claim.payerOrganizationId.toHexString()
        ) {
          throw new ClaimRemittanceNotFoundError();
        }

        const sponsorPayment = await this.dependencies.paymentIntegration.assertSponsorPayment({
          facilityId: actor.facilityId,
          sponsorPaymentId: input.sponsorPaymentId,
          payerOrganizationId: claim.payerOrganizationId.toHexString(),
          currency: claim.currency,
          session: transaction.session,
        });
        if (
          remittance.sponsorPaymentId !== null &&
          remittance.sponsorPaymentId.toHexString() !== input.sponsorPaymentId
        ) {
          throw new ClaimRemittanceReconciliationError();
        }
        const remittanceClaimAllocations = remittance.allocations.filter(
          (allocation) => allocation.claimId.toHexString() === claimId,
        );
        if (remittanceClaimAllocations.length === 0) {
          throw new ClaimRemittanceReconciliationError();
        }
        const allocatedAmount = input.allocations.reduce(
          (sum, allocation) => sum.plus(allocation.amount),
          new Decimal(0),
        );
        reconcileRemittance({
          sponsorPaymentAmount: sponsorPayment.availableAmount,
          allocatedAmount: allocatedAmount.toFixed(2),
          unappliedAmount: input.unappliedAmount,
        });
        if (
          allocatedAmount.greaterThan(sponsorPayment.availableAmount) ||
          allocatedAmount.greaterThan(
            decimal128ToString(claim.outstandingAmount),
          )
        ) {
          throw new ClaimPaymentOverAllocationError();
        }

        const lines = await this.dependencies.lines.listByClaim(
          actor.facilityId,
          claimId,
          transaction.session,
        );
        const byId = new Map(
          lines.map((line) => [line._id.toHexString(), line]),
        );
        const headerAllocations = input.allocations.filter(
          (allocation) => allocation.claimLineId == null,
        );
        if (
          headerAllocations.length > 1 ||
          (headerAllocations.length === 1 && input.allocations.length > 1)
        ) {
          throw new ClaimRemittanceReconciliationError();
        }
        const effectiveAllocations = headerAllocations.length === 1
          ? distributeHeaderPayment(lines, headerAllocations[0]!.amount)
          : input.allocations.map((allocation) => ({
              claimLineId: allocation.claimLineId!,
              amount: allocation.amount,
            }));
        if (
          new Set(
            effectiveAllocations.map((allocation) => allocation.claimLineId),
          ).size !== effectiveAllocations.length
        ) {
          throw new ClaimRemittanceReconciliationError();
        }
        const remittanceClaimPaymentLimit = remittanceClaimAllocations.reduce(
          (sum, allocation) =>
            sum.plus(decimal128ToString(allocation.paidAmount)),
          new Decimal(0),
        );
        const alreadyPostedForRemittance = (
          await this.dependencies.paymentAllocations.listByClaim(
            actor.facilityId,
            claimId,
            transaction.session,
          )
        )
          .filter(
            (allocation) =>
              allocation.remittanceId.toHexString() === input.remittanceId,
          )
          .reduce(
            (sum, allocation) =>
              sum.plus(decimal128ToString(allocation.amount)),
            new Decimal(0),
          );
        if (
          alreadyPostedForRemittance.plus(allocatedAmount)
            .greaterThan(remittanceClaimPaymentLimit)
        ) {
          throw new ClaimPaymentOverAllocationError();
        }

        for (const allocation of effectiveAllocations) {
          const line = byId.get(allocation.claimLineId);
          if (line === undefined) {
            throw new ClaimLineNotFoundError();
          }
          if (
            money(allocation.amount).greaterThan(
              decimal128ToString(line.outstandingAmount),
            )
          ) {
            throw new ClaimPaymentOverAllocationError();
          }
        }

        const now = this.dependencies.clock.now();
        const allocations = await this.dependencies.paymentAllocations.appendMany(
          actor,
          effectiveAllocations.map((allocation, index) => ({
            operationKey: `${idempotencyKey}:${index + 1}`,
            claimId,
            claimLineId: allocation.claimLineId ?? null,
            remittanceId: input.remittanceId,
            sponsorPaymentId: input.sponsorPaymentId,
            amount: money(allocation.amount).toFixed(2),
            postedAt: now,
          })),
          transaction,
        );

        for (const allocation of effectiveAllocations) {
          const line = byId.get(allocation.claimLineId);
          if (line === undefined) {
            throw new ClaimLineNotFoundError();
          }
          const paidAmount = money(decimal128ToString(line.paidAmount))
            .plus(allocation.amount);
          const outstandingAmount = Decimal.max(
            0,
            money(decimal128ToString(line.outstandingAmount))
              .minus(allocation.amount),
          );
          const updated = await this.dependencies.lines.updateFinancials(
            actor.facilityId,
            allocation.claimLineId,
            line.version,
            {
              paidAmount: paidAmount.toFixed(2),
              outstandingAmount: outstandingAmount.toFixed(2),
              status: outstandingAmount.isZero()
                ? 'PAID'
                : line.status,
            },
            actor.userId,
            transaction,
          );
          if (updated === null) {
            throw new ClaimVersionConflictError();
          }
        }

        const paidAmount = money(decimal128ToString(claim.paidAmount))
          .plus(allocatedAmount);
        const receivable = calculateClaimReceivable({
          approvedAmount: decimal128ToString(claim.approvedAmount),
          paidAmount: paidAmount.toFixed(2),
          contractualAdjustmentAmount: decimal128ToString(
            claim.contractualAdjustmentAmount,
          ),
          writeOffAmount: decimal128ToString(claim.writeOffAmount),
          payerWithholdingAmount: decimal128ToString(
            claim.payerWithholdingAmount,
          ),
          debitNoteAmount: decimal128ToString(claim.debitNoteAmount),
          creditNoteAmount: decimal128ToString(claim.creditNoteAmount),
          refundAmount: decimal128ToString(claim.refundAmount),
          repaymentAmount: decimal128ToString(claim.repaymentAmount),
        });
        const financialClaim = await this.dependencies.claims.updateFinancials(
          actor.facilityId,
          claimId,
          claim.version,
          {
            paidAmount: paidAmount.toFixed(2),
            unappliedPaymentAmount: money(input.unappliedAmount).toFixed(2),
            outstandingAmount: receivable.outstandingAmount,
            overpaymentAmount: receivable.overpaymentAmount,
          },
          actor.userId,
          transaction,
        );
        if (financialClaim === null) {
          throw new ClaimVersionConflictError();
        }

        await this.dependencies.paymentIntegration.consumeSponsorPayment({
          facilityId: actor.facilityId,
          sponsorPaymentId: input.sponsorPaymentId,
          amount: allocatedAmount.toFixed(2),
          actorUserId: actor.userId,
          transaction,
        });
        await this.dependencies.ledger.postClaimFinancialEvent({
          actor,
          claimId,
          eventType: 'CLAIM_PAYMENT_POSTED',
          amount: allocatedAmount.toFixed(2),
          sourceRecordId: input.remittanceId,
          patientId: claim.patientId.toHexString(),
          patientAccountId: claim.patientAccountId.toHexString(),
          invoiceId: claim.invoiceId.toHexString(),
          paymentId: input.sponsorPaymentId,
          currency: claim.currency,
          transaction,
        });

        const finalClaim = receivable.outstandingAmount === '0.00'
          ? await this.dependencies.workflow.transition({
              actor,
              claim: financialClaim,
              toStatus: 'PAID',
              reason: input.reason,
              transaction,
            })
          : financialClaim;

        await this.dependencies.financialDischarge.refreshClearance({
          facilityId: actor.facilityId,
          patientAccountId: claim.patientAccountId.toHexString(),
          invoiceId: claim.invoiceId.toHexString(),
          actorUserId: actor.userId,
          transaction,
        });
        await this.dependencies.audit.record({
          actor,
          action: 'CLAIM_PAYMENT_POSTED',
          entityType: 'Claim',
          entityId: claimId,
          reason: input.reason,
          before: {
            paidAmount: decimal128ToString(claim.paidAmount),
            outstandingAmount: decimal128ToString(claim.outstandingAmount),
          },
          after: {
            status: finalClaim.status,
            paymentAllocationCount: allocations.length,
          },
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType: 'claims.payment.posted',
          aggregateType: 'Claim',
          aggregateId: claimId,
          payload: {
            claimId,
            status: finalClaim.status,
            version: finalClaim.version,
            eventAt: now.toISOString(),
          },
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });

        return {
          claim: finalClaim,
          allocations,
        };
      },
    });
  }

  private async requirePermission(
    actor: ClaimsActorContext,
    permission: string,
  ): Promise<void> {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      permission,
      resourceFacilityId: actor.facilityId,
      sensitiveFinancialAction: true,
    });
    if (!decision.allowed) {
      throw new ClaimAccessDeniedError(
        decision.denialReason ?? undefined,
      );
    }
  }
}