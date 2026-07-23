import Decimal from 'decimal.js';

import type {
  ConsultantAgreementRuleDefinition,
  ConsultantSharingActorContext,
} from '../consultant-sharing.contracts.js';
import {
  ConsultantAgreementRuleNotFoundError,
  ConsultantRevenueReconciliationError,
  ConsultantSharingAccessDeniedError,
} from '../consultant-sharing.errors.js';
import {
  calculateConsultantRecognition,
  calculateConsultantShare,
  deriveConsultantEligibleRevenue,
} from '../consultant-sharing.financial-math.js';
import type {
  ConsultantFinancialChangeReference,
  ConsultantRevenueAdjustmentView,
  ConsultantRevenueReversalView,
} from '../consultant-sharing.contracts.js';
import { stableConsultantSharingPayloadHash } from '../consultant-sharing.normalization.js';
import type {
  ConsultantAgreementRuleRepositoryPort,
  ConsultantAuthoritativeFinancialChangePort,
  ConsultantAuditPort,
  ConsultantClockPort,
  ConsultantIdempotencyPort,
  ConsultantOperationLockPort,
  ConsultantOutboxPort,
  ConsultantPeriodCapPort,
  ConsultantSharingAccessPolicyPort,
  ConsultantSharingTransactionManagerPort,
} from '../consultant-sharing.ports.js';
import {
  ConsultantRevenueAdjustmentService,
} from './consultant-revenue-adjustment.service.js';

export interface RecalculateConsultantFinancialChangeInput {
  source: ConsultantFinancialChangeReference;
  approvalRequestId: string;
  attachmentIds?: readonly string[];
}

export type ConsultantRecalculationOutcome =
  | Readonly<{ kind: 'NO_CHANGE'; calculationHash: string }>
  | Readonly<{ kind: 'ADJUSTMENT_REQUESTED'; adjustment: ConsultantRevenueAdjustmentView; calculationHash: string }>
  | Readonly<{ kind: 'REVERSAL_REQUESTED'; reversal: ConsultantRevenueReversalView; calculationHash: string }>;

export interface ConsultantRecalculationServiceDependencies {
  changes: ConsultantAuthoritativeFinancialChangePort;
  rules: ConsultantAgreementRuleRepositoryPort;
  periodCaps: ConsultantPeriodCapPort;
  adjustments: ConsultantRevenueAdjustmentService;
  accessPolicy: ConsultantSharingAccessPolicyPort;
  transactions: ConsultantSharingTransactionManagerPort;
  idempotency: ConsultantIdempotencyPort;
  locks: ConsultantOperationLockPort;
  audit: ConsultantAuditPort;
  outbox: ConsultantOutboxPort;
  clock: ConsultantClockPort;
}

function findHistoricalRule(
  rules: readonly ConsultantAgreementRuleDefinition[],
  ruleId: string,
): ConsultantAgreementRuleDefinition {
  const rule = rules.find((candidate) => candidate.id === ruleId);
  if (rule == null) throw new ConsultantAgreementRuleNotFoundError();
  return rule;
}

function delta(next: Decimal.Value, previous: Decimal.Value): string {
  return new Decimal(next).minus(previous).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

export class ConsultantRecalculationService {
  public constructor(private readonly dependencies: ConsultantRecalculationServiceDependencies) {}

  public async recalculate(
    actor: ConsultantSharingActorContext,
    idempotencyKey: string,
    input: RecalculateConsultantFinancialChangeInput,
  ): Promise<ConsultantRecalculationOutcome> {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'RECALCULATE',
      resourceFacilityId: actor.facilityId,
      sensitiveFinancialAction: false,
    });
    if (!decision.allowed) throw new ConsultantSharingAccessDeniedError(decision.denialReason);

    return this.dependencies.idempotency.execute({
      scope: 'CONSULTANT_FINANCIAL_CHANGE_RECALCULATION',
      actor,
      idempotencyKey,
      requestHash: stableConsultantSharingPayloadHash(input),
      operation: () => this.dependencies.locks.withLock({
        lockKey: `consultant-recalculation:${actor.facilityId}:${input.source.sourceRecordId}:${input.source.sourceFinancialEventId}`,
        ownerId: `${actor.userId}:${actor.correlationId}`,
        ttlMs: 90_000,
        operation: async () => {
          const plan = await this.dependencies.transactions.withTransaction(async (transaction) => {
            const context = await this.dependencies.changes.loadChange({ actor, source: input.source, transaction });
            if (context == null) {
              throw new ConsultantRevenueReconciliationError('Authoritative financial-change context was not found');
            }
            const rules = await this.dependencies.rules.listByAgreement({
              facilityId: actor.facilityId,
              agreementId: context.originalEntry.agreementId,
              transaction,
            });
            const rule = findHistoricalRule(rules, context.originalEntry.agreementRuleId);
            const eligible = deriveConsultantEligibleRevenue(context.changedActivity, rule.eligibilityPolicy);
            const recognition = calculateConsultantRecognition(
              context.changedActivity,
              eligible.eligibleRevenueBeforeRecognition,
              rule.recognitionBasis,
            );
            const remainingCap = await this.dependencies.periodCaps.getRemainingCap({
              facilityId: actor.facilityId,
              consultantId: context.originalEntry.consultantId,
              agreementRuleId: rule.id,
              financialEventAt: new Date(context.changedActivity.financialEventAt),
              configuredPeriodCap: rule.periodCap,
              transaction,
            });
            const restoredPeriodCap = remainingCap == null
              ? null
              : new Decimal(remainingCap).plus(context.originalEntry.consultantShare).toFixed(2);
            const shares = calculateConsultantShare({
              eligibleRevenue: recognition.recognizedEligibleRevenue,
              method: rule.calculationMethod,
              percentage: rule.percentage,
              fixedAmount: rule.fixedAmount,
              unitQuantity: context.changedActivity.unitQuantity,
              thresholdAmount: rule.thresholdAmount,
              minimumShare: rule.minimumShare,
              maximumShare: rule.maximumShare,
              perServiceCap: rule.perServiceCap,
              perCaseCap: rule.perCaseCap,
              periodRemainingCap: restoredPeriodCap,
              guaranteedAmount: rule.guaranteedAmount,
              tiers: rule.tiers,
              participantRules: rule.participants,
            });
            const calculationHash = stableConsultantSharingPayloadHash({
              source: input.source,
              originalCalculationHash: context.originalEntry.calculationHash,
              ruleId: rule.id,
              ruleVersion: rule.ruleVersion,
              eligible,
              recognition,
              shares,
            });
            return {
              context,
              calculationHash,
              eligibleDelta: delta(recognition.recognizedEligibleRevenue, context.originalEntry.eligibleRevenue),
              consultantDelta: delta(shares.consultantShare, context.originalEntry.consultantShare),
              hospitalDelta: delta(shares.hospitalShare, context.originalEntry.hospitalShare),
              reversedToZero: new Decimal(shares.consultantShare).isZero()
                && new Decimal(context.originalEntry.consultantShare).greaterThan(0),
            };
          });

          if (
            new Decimal(plan.eligibleDelta).isZero()
            && new Decimal(plan.consultantDelta).isZero()
            && new Decimal(plan.hospitalDelta).isZero()
          ) {
            return { kind: 'NO_CHANGE', calculationHash: plan.calculationHash } as const;
          }

          if (plan.reversedToZero) {
            const reversal = await this.dependencies.adjustments.requestReversal(
              actor,
              `${idempotencyKey}:reversal`,
              {
                revenueEntryId: plan.context.originalEntry.id,
                source: {
                  ...input.source,
                  sourceRecordId: plan.context.originalEntry.id,
                  consultantId: plan.context.originalEntry.consultantId,
                  invoiceLineId: plan.context.originalEntry.invoiceLineId,
                },
                attachmentIds: input.attachmentIds,
                approvalRequestId: input.approvalRequestId,
              },
            );
            await this.publishInTransaction(
              actor,
              'consultant.revenue.recalculation.reversal-requested',
              plan.context.originalEntry.id,
              plan.calculationHash,
            );
            return { kind: 'REVERSAL_REQUESTED', reversal, calculationHash: plan.calculationHash } as const;
          }

          const adjustment = await this.dependencies.adjustments.requestAdjustment(
            actor,
            `${idempotencyKey}:adjustment`,
            {
              revenueEntryId: plan.context.originalEntry.id,
              settlementId: plan.context.originalEntry.settlementId,
              eligibleRevenueDelta: plan.eligibleDelta,
              consultantShareDelta: plan.consultantDelta,
              hospitalShareDelta: plan.hospitalDelta,
              taxWithholdingDelta: '0.00',
              deductionDelta: '0.00',
              reasonCode: input.source.reasonCode,
              reason: input.source.reason,
              attachmentIds: input.attachmentIds,
              approvalRequestId: input.approvalRequestId,
            },
          );
          await this.publishInTransaction(
            actor,
            'consultant.revenue.recalculation.adjustment-requested',
            plan.context.originalEntry.id,
            plan.calculationHash,
          );
          return { kind: 'ADJUSTMENT_REQUESTED', adjustment, calculationHash: plan.calculationHash } as const;
        },
      }),
    });
  }

  private async publishInTransaction(
    actor: ConsultantSharingActorContext,
    eventType: string,
    revenueEntryId: string,
    calculationHash: string,
  ): Promise<void> {
    await this.dependencies.transactions.withTransaction(async (transaction) => {
      const occurredAt = this.dependencies.clock.now();
      await this.dependencies.audit.record({
        actor,
        action: 'CONSULTANT_REVENUE_RECALCULATED',
        entityType: 'ConsultantRevenueEntry',
        entityId: revenueEntryId,
        after: { calculationHash },
        reason: 'Authoritative financial change recalculation',
        transaction,
      });
      await this.dependencies.outbox.publish({
        aggregateType: 'ConsultantRevenueEntry',
        aggregateId: revenueEntryId,
        eventType,
        payload: { revenueEntryId, calculationHash },
        correlationId: actor.correlationId,
        occurredAt,
        transaction,
      });
    });
  }

}