import Decimal from 'decimal.js';

import type {
  ConsultantAgreementMatchContext,
  ConsultantRevenueCalculationTrace,
  ConsultantRevenueEntryView,
  ConsultantSharingActorContext,
} from '../consultant-sharing.contracts.js';
import {
  ConsultantAgreementConflictError,
  ConsultantSharingAccessDeniedError,
} from '../consultant-sharing.errors.js';
import {
  calculateConsultantRecognition,
  calculateConsultantShare,
  deriveConsultantEligibleRevenue,
} from '../consultant-sharing.financial-math.js';
import { selectConsultantAgreementRule } from '../consultant-sharing.agreement-matching.js';
import {
  buildConsultantCalculationDuplicateKey,
  stableConsultantSharingPayloadHash,
} from '../consultant-sharing.normalization.js';
import type {
  ConsultantAgreementRuleRepositoryPort,
  ConsultantAuditPort,
  ConsultantCalculationRunRepositoryPort,
  ConsultantClockPort,
  ConsultantFinancialActivityPort,
  ConsultantFinancialLedgerPort,
  ConsultantIdempotencyPort,
  ConsultantIdentityResolutionPort,
  ConsultantOperationLockPort,
  ConsultantOutboxPort,
  ConsultantPeriodCapPort,
  ConsultantRevenueEntryRepositoryPort,
  ConsultantSharingAccessPolicyPort,
  ConsultantSharingTransactionManagerPort,
} from '../consultant-sharing.ports.js';

export type ConsultantRevenueCalculationRunType =
  | 'INITIAL_RECOGNITION'
  | 'RECALCULATION'
  | 'REFUND_RECALCULATION'
  | 'CLAIM_RECALCULATION'
  | 'PACKAGE_RECALCULATION'
  | 'WELFARE_ZAKAT_RECALCULATION'
  | 'MANUAL_RECOVERY';

export interface CalculateConsultantRevenueInput {
  sourceFinancialEventId: string;
  invoiceLineId: string;
  consultantId: string;
  runType?: ConsultantRevenueCalculationRunType;
  reason?: string;
}

export interface ConsultantRevenueCalculationServiceDependencies {
  financialActivity: ConsultantFinancialActivityPort;
  rules: ConsultantAgreementRuleRepositoryPort;
  identity: ConsultantIdentityResolutionPort;
  revenueEntries: ConsultantRevenueEntryRepositoryPort;
  calculationRuns: ConsultantCalculationRunRepositoryPort;
  ledger: ConsultantFinancialLedgerPort;
  periodCaps: ConsultantPeriodCapPort;
  accessPolicy: ConsultantSharingAccessPolicyPort;
  transactions: ConsultantSharingTransactionManagerPort;
  idempotency: ConsultantIdempotencyPort;
  locks: ConsultantOperationLockPort;
  audit: ConsultantAuditPort;
  outbox: ConsultantOutboxPort;
  clock: ConsultantClockPort;
}

function patientType(activity: Awaited<ReturnType<ConsultantFinancialActivityPort['getAuthoritativeActivity']>>): ConsultantAgreementMatchContext['patientType'] {
  if (activity == null) return 'CASH';
  if (activity.packageId != null) return 'PACKAGE';
  if (activity.panelProgramId != null) return 'CORPORATE_PANEL';
  if (activity.payerOrganizationId != null) return 'INSURANCE';
  if (new Decimal(activity.welfareZakatAmount).greaterThan(0)) return 'WELFARE';
  return 'CASH';
}

function encounterType(serviceCategory: string): ConsultantAgreementMatchContext['encounterType'] {
  if (serviceCategory === 'LABORATORY') return 'LABORATORY';
  if (serviceCategory === 'RADIOLOGY') return 'RADIOLOGY';
  if (serviceCategory === 'PHARMACY') return 'PHARMACY';
  if (serviceCategory === 'SURGERY' || serviceCategory === 'PROCEDURE') return 'SURGERY';
  if (['ADMISSION', 'BED', 'ROOM', 'ICU'].includes(serviceCategory)) return 'INPATIENT';
  return 'OUTPATIENT';
}

function entryTypeFor(
  basis: string,
  recognitionSatisfied: boolean,
  packageId: string | null,
): ConsultantRevenueEntryView['entryType'] {
  if (!recognitionSatisfied) return 'PENDING';
  if (packageId != null) return 'PACKAGE_DEPENDENT';
  if (basis === 'CLAIM_APPROVAL_BASIS' || basis === 'CLAIM_PAYMENT_BASIS') return 'CLAIM_DEPENDENT';
  if (basis === 'PAID_BASIS' || basis === 'COLLECTION_BASIS' || basis === 'FULL_PAYMENT_BASIS') return 'COLLECTED';
  return basis === 'ACCRUAL_ON_SERVICE_COMPLETION' ? 'EARNED' : 'ACCRUED';
}

function sumOtherParticipants(trace: ConsultantRevenueCalculationTrace): string {
  return trace.shares.participantShares
    .filter((participant) => participant.participantId !== trace.consultantId)
    .reduce((sum, participant) => sum.plus(participant.shareAmount), new Decimal(0))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toFixed(2);
}

export class ConsultantRevenueCalculationService {
  public constructor(
    private readonly dependencies: ConsultantRevenueCalculationServiceDependencies,
  ) {}

  public async calculate(
    actor: ConsultantSharingActorContext,
    idempotencyKey: string,
    input: CalculateConsultantRevenueInput,
  ): Promise<ConsultantRevenueEntryView> {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      action: input.runType === 'RECALCULATION' ? 'RECALCULATE' : 'CALCULATE',
      resourceFacilityId: actor.facilityId,
      sensitiveFinancialAction: false,
    });
    if (!decision.allowed) throw new ConsultantSharingAccessDeniedError(decision.denialReason);

    const requestHash = stableConsultantSharingPayloadHash(input);
    return this.dependencies.idempotency.execute({
      scope: 'CONSULTANT_REVENUE_CALCULATION',
      actor,
      idempotencyKey,
      requestHash,
      operation: () => this.dependencies.locks.withLock({
        lockKey: `consultant-revenue:${actor.facilityId}:${input.sourceFinancialEventId}:${input.invoiceLineId}:${input.consultantId}`,
        ownerId: `${actor.userId}:${actor.correlationId}`,
        ttlMs: 60_000,
        operation: () => this.calculateLocked(actor, idempotencyKey, input),
      }),
    });
  }

  private async calculateLocked(
    actor: ConsultantSharingActorContext,
    idempotencyKey: string,
    input: CalculateConsultantRevenueInput,
  ): Promise<ConsultantRevenueEntryView> {
    return this.dependencies.transactions.withTransaction(async (transaction) => {
      const activity = await this.dependencies.financialActivity.getAuthoritativeActivity({
        actor,
        sourceFinancialEventId: input.sourceFinancialEventId,
        invoiceLineId: input.invoiceLineId,
        transaction,
      });
      if (activity == null) throw new ConsultantAgreementConflictError('Authoritative consultant financial activity was not found');
      if (activity.facilityId !== actor.facilityId) {
        throw new ConsultantSharingAccessDeniedError('Cross-facility financial activity is forbidden');
      }

      const consultant = await this.dependencies.identity.resolveConsultant({
        facilityId: actor.facilityId,
        consultantId: input.consultantId,
        transaction,
      });
      if (consultant == null || !consultant.active) {
        throw new ConsultantAgreementConflictError('Consultant is not active in the facility');
      }

      const candidates = await this.dependencies.rules.findMatchingCandidates({
        facilityId: actor.facilityId,
        consultantId: input.consultantId,
        financialEventAt: new Date(activity.financialEventAt),
        transaction,
      });
      const match = selectConsultantAgreementRule(candidates, {
        facilityId: actor.facilityId,
        consultantId: input.consultantId,
        consultantGroupId: consultant.consultantGroupId,
        financialEventAt: activity.financialEventAt,
        departmentId: activity.departmentId,
        serviceId: activity.serviceId,
        serviceCategory: activity.serviceCategory,
        chargeCatalogItemId: activity.chargeCatalogItemId,
        procedureId: activity.procedureId,
        patientType: patientType(activity),
        encounterType: encounterType(activity.serviceCategory),
        payerOrganizationId: activity.payerOrganizationId,
        panelProgramId: activity.panelProgramId,
        packageId: activity.packageId,
      });
      const rule = match.selected.rule;
      const eligible = deriveConsultantEligibleRevenue(activity, rule.eligibilityPolicy);
      const recognition = calculateConsultantRecognition(
        activity,
        eligible.eligibleRevenueBeforeRecognition,
        rule.recognitionBasis,
      );
      const remainingPeriodCap = await this.dependencies.periodCaps.getRemainingCap({
        facilityId: actor.facilityId,
        consultantId: input.consultantId,
        agreementRuleId: rule.id,
        financialEventAt: new Date(activity.financialEventAt),
        configuredPeriodCap: rule.periodCap,
        transaction,
      });
      const shares = calculateConsultantShare({
        eligibleRevenue: recognition.recognizedEligibleRevenue,
        method: rule.calculationMethod,
        percentage: rule.percentage,
        fixedAmount: rule.fixedAmount,
        unitQuantity: activity.unitQuantity,
        thresholdAmount: rule.thresholdAmount,
        minimumShare: rule.minimumShare,
        maximumShare: rule.maximumShare,
        perServiceCap: rule.perServiceCap,
        perCaseCap: rule.perCaseCap,
        periodRemainingCap: remainingPeriodCap,
        guaranteedAmount: rule.guaranteedAmount,
        tiers: rule.tiers,
        participantRules: rule.participants,
      });
      const calculatedAt = this.dependencies.clock.now();
      const inputHash = stableConsultantSharingPayloadHash({ activity, rule, remainingPeriodCap });
      const calculationHash = buildConsultantCalculationDuplicateKey({
        facilityId: actor.facilityId,
        sourceFinancialEventId: activity.sourceFinancialEventId,
        invoiceLineId: activity.invoiceLineId,
        consultantId: input.consultantId,
        agreementId: match.selected.agreementId,
        agreementVersion: match.selected.agreementVersion,
        agreementRuleId: rule.id,
        ruleVersion: rule.ruleVersion,
      });
      const existing = await this.dependencies.revenueEntries.findByCalculationKey({
        facilityId: actor.facilityId,
        calculationKey: calculationHash,
        transaction,
      });
      if (existing != null) return existing;

      const operationKey = stableConsultantSharingPayloadHash({
        scope: 'CONSULTANT_REVENUE_CALCULATION',
        facilityId: actor.facilityId,
        idempotencyKey,
      });
      const runId = await this.dependencies.calculationRuns.start({
        actor,
        operationKey,
        runType: input.runType ?? 'INITIAL_RECOGNITION',
        sourceFinancialEventId: activity.sourceFinancialEventId,
        sourceFinancialEventType: activity.sourceFinancialEventType,
        sourceModule: activity.sourceModule,
        sourceRecordId: activity.sourceRecordId,
        invoiceLineId: activity.invoiceLineId,
        consultantId: input.consultantId,
        inputHash,
        startedAt: calculatedAt,
        transaction,
      });
      const trace: ConsultantRevenueCalculationTrace = {
        facilityId: actor.facilityId,
        consultantId: input.consultantId,
        agreementId: match.selected.agreementId,
        agreementVersion: match.selected.agreementVersion,
        agreementRuleId: rule.id,
        ruleVersion: rule.ruleVersion,
        patientId: activity.patientId,
        encounterId: activity.encounterId,
        admissionId: activity.admissionId,
        invoiceId: activity.invoiceId,
        invoiceLineId: activity.invoiceLineId,
        chargeSource: `${activity.sourceModule}:${activity.sourceFinancialEventType}`,
        serviceId: activity.serviceId,
        departmentId: activity.departmentId,
        procedureId: activity.procedureId,
        payerOrganizationId: activity.payerOrganizationId,
        panelProgramId: activity.panelProgramId,
        packageId: activity.packageId,
        claimId: activity.claimId,
        sourceFinancialEventId: activity.sourceFinancialEventId,
        sourceLedgerEntryId: activity.sourceLedgerEntryId,
        inputHash,
        calculationHash,
        calculatedAt: calculatedAt.toISOString(),
        calculatedBy: actor.userId,
        matchReason: match.selectionReason,
        eligibleRevenue: eligible,
        recognition,
        shares,
      };
      const status: ConsultantRevenueEntryView['status'] =
        new Decimal(shares.consultantShare).greaterThan(0) ? 'POSTED' : 'PENDING';
      const entry = await this.dependencies.revenueEntries.append({
        actor,
        operationKey,
        calculationRunId: runId,
        calculationKey: calculationHash,
        activity,
        consultantStaffId: consultant.staffId,
        consultantGroupId: consultant.consultantGroupId,
        direction: 'CREDIT',
        entryType: entryTypeFor(rule.recognitionBasis, recognition.recognitionSatisfied, activity.packageId),
        status,
        trace,
        taxWithholdingAmount: '0.00',
        deductionAmount: '0.00',
        otherParticipantShare: sumOtherParticipants(trace),
        netPayableAmount: shares.consultantShare,
        reversalOfEntryId: null,
        adjustmentOfEntryId: null,
        reason: input.reason ?? 'Authoritative consultant revenue recognition',
        occurredAt: calculatedAt,
        transaction,
      });
      if (status === 'POSTED') {
        await this.dependencies.ledger.postConsultantLiability({
          actor,
          revenueEntryId: entry.id,
          consultantId: input.consultantId,
          invoiceId: activity.invoiceId,
          invoiceLineId: activity.invoiceLineId,
          consultantShare: shares.consultantShare,
          hospitalShare: shares.hospitalShare,
          currency: activity.currency,
          sourceLedgerEntryId: activity.sourceLedgerEntryId,
          occurredAt: calculatedAt,
          transaction,
        });
      }
      const resultHash = stableConsultantSharingPayloadHash({ entry, trace });
      await this.dependencies.calculationRuns.complete({ actor, runId, resultHash, completedAt: calculatedAt, transaction });
      await this.dependencies.audit.record({
        actor,
        action: 'CONSULTANT_REVENUE_CALCULATED',
        entityType: 'ConsultantRevenueEntry',
        entityId: entry.id,
        after: { status: entry.status, calculationHash, agreementId: trace.agreementId, ruleId: trace.agreementRuleId },
        reason: input.reason,
        transaction,
      });
      await this.dependencies.outbox.publish({
        aggregateType: 'ConsultantRevenueEntry',
        aggregateId: entry.id,
        eventType: 'consultant.revenue.calculated',
        payload: { revenueEntryId: entry.id, status: entry.status, version: entry.version },
        correlationId: actor.correlationId,
        occurredAt: calculatedAt,
        transaction,
      });
      return entry;
    });
  }
}