import Decimal from 'decimal.js';

import {
  decimal128ToString,
} from '@hospital-mis/database';

import {
  CLAIM_PERMISSION_KEYS,
} from '../claims.constants.js';

import type {
  ClaimsActorContext,
} from '../claims.contracts.js';

import {
  ClaimAccessDeniedError,
  ClaimFinancialReconciliationError,
  ClaimNotFoundError,
  ClaimVersionConflictError,
} from '../claims.errors.js';

import {
  aggregateClaimFinancials,
  calculateClaimReceivable,
} from '../claims.financial-math.js';

import type {
  ClaimAdjustmentRepositoryPort,
  ClaimLineRepositoryPort,
  ClaimPaymentAllocationRepositoryPort,
  ClaimsAccessPolicyPort,
  ClaimsAuditPort,
  ClaimsAuthoritativeBillingPort,
  ClaimsFinancialDischargePort,
  ClaimsOutboxPort,
  ClaimsRepositoryPort,
  ClaimsTransactionManagerPort,
  ClaimsWorkflowPort,
} from '../claims.ports.js';

export interface ClaimReconciliationServiceDependencies {
  claims: ClaimsRepositoryPort;
  lines: ClaimLineRepositoryPort;
  payments: ClaimPaymentAllocationRepositoryPort;
  adjustments: ClaimAdjustmentRepositoryPort;
  billing: ClaimsAuthoritativeBillingPort;
  workflow: ClaimsWorkflowPort;
  accessPolicy: ClaimsAccessPolicyPort;
  transactionManager: ClaimsTransactionManagerPort;
  financialDischarge: ClaimsFinancialDischargePort;
  audit: ClaimsAuditPort;
  outbox: ClaimsOutboxPort;
  now(): Date;
}


export class ClaimReconciliationService {
  public constructor(
    private readonly dependencies: ClaimReconciliationServiceDependencies,
  ) {}

  public async reconcile(
    actor: ClaimsActorContext,
    claimId: string,
    expectedVersion: number,
    idempotencyKey: string,
    reason: string,
  ) {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      permission: CLAIM_PERMISSION_KEYS.PAYMENT_MATCH,
      resourceFacilityId: actor.facilityId,
      sensitiveFinancialAction: true,
    });
    if (!decision.allowed) {
      throw new ClaimAccessDeniedError(
        decision.denialReason ?? undefined,
      );
    }

    return this.dependencies.transactionManager.execute({
      transactionType: 'RECONCILE_CLAIM',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `claims:claim:${actor.facilityId}:${claimId}`,
        `claims:reconciliation:${actor.facilityId}:${claimId}`,
      ],
      idempotencyPayload: { claimId, expectedVersion, reason },
      journalPayload: { claimId },
      execute: async (transaction) => {
        const claim = await this.dependencies.claims.findById(
          actor.facilityId,
          claimId,
          transaction.session,
        );
        if (claim === null) {
          throw new ClaimNotFoundError();
        }
        if (claim.version !== expectedVersion) {
          throw new ClaimVersionConflictError();
        }

        const [lines, payments, adjustments] = await Promise.all([
          this.dependencies.lines.listByClaim(
            actor.facilityId,
            claimId,
            transaction.session,
          ),
          this.dependencies.payments.listByClaim(
            actor.facilityId,
            claimId,
            transaction.session,
          ),
          this.dependencies.adjustments.listByClaim(
            actor.facilityId,
            claimId,
            transaction.session,
          ),
        ]);
        if (lines.length === 0) {
          throw new ClaimFinancialReconciliationError(
            'Claims must contain at least one service line',
          );
        }

        const aggregate = aggregateClaimFinancials(
          lines.map((line) => ({
            grossAmount: decimal128ToString(line.grossAmount),
            packageAmount: decimal128ToString(line.packageAmount),
            deductibleAmount: decimal128ToString(line.deductibleAmount),
            copaymentAmount: decimal128ToString(line.copaymentAmount),
            coinsuranceAmount: decimal128ToString(line.coinsuranceAmount),
            excludedAmount: decimal128ToString(line.excludedAmount),
            patientOtherAmount: decimal128ToString(line.patientOtherAmount),
            patientResponsibilityAmount: decimal128ToString(
              line.patientResponsibilityAmount,
            ),
            claimedAmount: decimal128ToString(line.claimedAmount),
            approvedAmount: decimal128ToString(line.approvedAmount),
            deniedAmount: decimal128ToString(line.deniedAmount),
            disallowedAmount: decimal128ToString(line.disallowedAmount),
            returnedAmount: decimal128ToString(line.returnedAmount),
            contractualAdjustmentAmount: decimal128ToString(
              line.contractualAdjustmentAmount,
            ),
            writeOffAmount: decimal128ToString(line.writeOffAmount),
            paidAmount: decimal128ToString(line.paidAmount),
            outstandingAmount: decimal128ToString(line.outstandingAmount),
          })),
        );
        const paymentTotal = payments.reduce(
          (sum, payment) =>
            sum.plus(decimal128ToString(payment.amount)),
          new Decimal(0),
        );
        if (!paymentTotal.equals(aggregate.paidAmount)) {
          throw new ClaimFinancialReconciliationError(
            'Claim payment history does not reconcile to line payments',
          );
        }

        const postedAdjustmentCount = adjustments.filter(
          (adjustment) => adjustment.status === 'POSTED',
        ).length;

        const receivable = calculateClaimReceivable({
          approvedAmount: aggregate.approvedAmount,
          paidAmount: aggregate.paidAmount,
          contractualAdjustmentAmount:
            aggregate.contractualAdjustmentAmount,
          writeOffAmount: aggregate.writeOffAmount,
          payerWithholdingAmount: decimal128ToString(
            claim.payerWithholdingAmount,
          ),
          debitNoteAmount: decimal128ToString(claim.debitNoteAmount),
          creditNoteAmount: decimal128ToString(claim.creditNoteAmount),
          refundAmount: decimal128ToString(claim.refundAmount),
          repaymentAmount: decimal128ToString(claim.repaymentAmount),
        });

        await this.dependencies.billing.assertInvoiceClaimReconciliation({
          facilityId: actor.facilityId,
          invoiceId: claim.invoiceId.toHexString(),
          claimId,
          session: transaction.session,
        });

        const updated = await this.dependencies.claims.updateFinancials(
          actor.facilityId,
          claimId,
          claim.version,
          {
            grossAmount: aggregate.grossAmount,
            packageAmount: aggregate.packageAmount,
            deductibleAmount: aggregate.deductibleAmount,
            copaymentAmount: aggregate.copaymentAmount,
            coinsuranceAmount: aggregate.coinsuranceAmount,
            excludedAmount: aggregate.excludedAmount,
            patientOtherAmount: aggregate.patientOtherAmount,
            patientResponsibilityAmount:
              aggregate.patientResponsibilityAmount,
            claimedAmount: aggregate.claimedAmount,
            approvedAmount: aggregate.approvedAmount,
            deniedAmount: aggregate.deniedAmount,
            disallowedAmount: aggregate.disallowedAmount,
            returnedAmount: aggregate.returnedAmount,
            contractualAdjustmentAmount:
              aggregate.contractualAdjustmentAmount,
            writeOffAmount: aggregate.writeOffAmount,
            paidAmount: aggregate.paidAmount,
            outstandingAmount: receivable.outstandingAmount,
            overpaymentAmount: receivable.overpaymentAmount,
          },
          actor.userId,
          transaction,
        );
        if (updated === null) {
          throw new ClaimVersionConflictError();
        }

        const finalClaim =
          receivable.outstandingAmount === '0.00' &&
          ['APPROVED', 'PARTIALLY_APPROVED'].includes(updated.status)
            ? await this.dependencies.workflow.transition({
                actor,
                claim: updated,
                toStatus: 'PAID',
                reason,
                transaction,
              })
            : updated;

        await this.dependencies.financialDischarge.refreshClearance({
          facilityId: actor.facilityId,
          patientAccountId: claim.patientAccountId.toHexString(),
          invoiceId: claim.invoiceId.toHexString(),
          actorUserId: actor.userId,
          transaction,
        });
        await this.dependencies.audit.record({
          actor,
          action: 'CLAIM_RECONCILED',
          entityType: 'Claim',
          entityId: claimId,
          reason,
          before: {
            version: claim.version,
            outstandingAmount: decimal128ToString(claim.outstandingAmount),
          },
          after: {
            version: finalClaim.version,
            status: finalClaim.status,
            postedAdjustmentCount,
          },
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType: 'claims.reconciled',
          aggregateType: 'Claim',
          aggregateId: claimId,
          payload: {
            claimId,
            status: finalClaim.status,
            version: finalClaim.version,
            eventAt: this.dependencies.now().toISOString(),
          },
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });

        return finalClaim;
      },
    });
  }
}