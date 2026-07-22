import { decimal128ToString } from '@hospital-mis/database';

import {
  WELFARE_ZAKAT_PERMISSION_KEYS,
  isAssistanceApplicationStatusTransitionAllowed,
} from '../welfare-zakat.constants.js';
import type {
  FundEligibilityPolicyInput,
  WelfareZakatActorContext,
} from '../welfare-zakat.contracts.js';
import {
  AssistanceAccessDeniedError,
  AssistanceApplicationNotFoundError,
  AssistanceFundExpiredError,
  AssistanceFundInactiveError,
  AssistanceFundNotFoundError,
  AssistanceInvalidStateTransitionError,
  AssistanceVersionConflictError,
} from '../welfare-zakat.errors.js';
import { evaluateFundEligibility } from '../welfare-zakat.eligibility.js';
import {
  safeWelfareZakatRealtimePayload,
  stableAssistancePayloadHash,
} from '../welfare-zakat.normalization.js';
import type {
  AssistanceApplicationHistoryRepositoryPort,
  AssistanceApplicationRepositoryPort,
  AssistanceFundRepositoryPort,
  AssistanceReviewRepositoryPort,
  WelfareZakatAccessPolicyPort,
  WelfareZakatAuditPort,
  WelfareZakatClockPort,
  WelfareZakatEligibilityContextPort,
  WelfareZakatOutboxPort,
  WelfareZakatTransactionContext,
  WelfareZakatTransactionManagerPort,
} from '../welfare-zakat.ports.js';
import type {
  AssistanceApplicationRecord,
  AssistanceFundRecord,
} from '../welfare-zakat.persistence.types.js';
import { projectAssistanceApplication } from '../welfare-zakat.projections.js';

export interface AssistanceEligibilityServiceDependencies {
  applications: AssistanceApplicationRepositoryPort;
  applicationHistories: AssistanceApplicationHistoryRepositoryPort;
  funds: AssistanceFundRepositoryPort;
  reviews: AssistanceReviewRepositoryPort;
  context: WelfareZakatEligibilityContextPort;
  accessPolicy: WelfareZakatAccessPolicyPort;
  transactionManager: WelfareZakatTransactionManagerPort;
  audit: WelfareZakatAuditPort;
  outbox: WelfareZakatOutboxPort;
  clock: WelfareZakatClockPort;
}

function fundPolicy(fund: AssistanceFundRecord): FundEligibilityPolicyInput {
  return {
    defaultOutcome: fund.defaultEligibilityOutcome,
    rules: fund.eligibilityRules.map((rule) => ({
      ruleCode: rule.ruleCode,
      description: rule.description,
      field: rule.field,
      operator: rule.operator,
      effect: rule.effect,
      ...(rule.value === null ? {} : { value: rule.value }),
      ...(rule.values.length === 0 ? {} : { values: rule.values }),
      ...(rule.minimum === null ? {} : { minimum: rule.minimum }),
      ...(rule.maximum === null ? {} : { maximum: rule.maximum }),
      priority: rule.priority,
      active: rule.active,
      ...(rule.failureCode === null ? {} : { failureCode: rule.failureCode }),
      ...(rule.failureMessage === null ? {} : { failureMessage: rule.failureMessage }),
    })),
    allowedDepartmentIds: fund.allowedDepartmentIds.map((id) => id.toHexString()),
    excludedDepartmentIds: fund.excludedDepartmentIds.map((id) => id.toHexString()),
    allowedServiceCategories: fund.allowedServiceCategories,
    excludedServiceCategories: fund.excludedServiceCategories,
    allowedServiceCodes: fund.allowedServiceCodes,
    excludedServiceCodes: fund.excludedServiceCodes,
    allowedPatientCategoryCodes: fund.allowedPatientCategoryCodes,
    excludedPatientCategoryCodes: fund.excludedPatientCategoryCodes,
    allowedDiagnosisCodes: fund.allowedDiagnosisCodes,
    excludedDiagnosisCodes: fund.excludedDiagnosisCodes,
    limits: fund.limits.map((limit) => ({
      scope: limit.scope,
      amount: decimal128ToString(limit.amount),
      periodType: limit.periodType,
      rollingDays: limit.rollingDays,
      serviceCategory: limit.serviceCategory,
      serviceCode: limit.serviceCode,
      appliesPerPatient: limit.appliesPerPatient,
    })),
    requiresZakatDeclaration: fund.requiresZakatDeclaration,
    requiresSocialWelfareReview: fund.requiresSocialWelfareReview,
    requiresClinicalReview: fund.requiresClinicalReview,
  };
}

function effective(fund: AssistanceFundRecord, asOf: Date): boolean {
  return (
    fund.effectiveFrom.getTime() <= asOf.getTime() &&
    (fund.effectiveThrough == null || fund.effectiveThrough.getTime() >= asOf.getTime())
  );
}

export class AssistanceEligibilityService {
  public constructor(
    private readonly dependencies: AssistanceEligibilityServiceDependencies,
  ) {}

  public async evaluate(
    actor: WelfareZakatActorContext,
    applicationId: string,
    fundId: string,
    idempotencyKey: string,
  ) {
    await this.requirePermission(actor, WELFARE_ZAKAT_PERMISSION_KEYS.ELIGIBILITY_EVALUATE);
    return this.dependencies.transactionManager.execute({
      transactionType: 'EVALUATE_ASSISTANCE_ELIGIBILITY',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `welfare-zakat:application:${actor.facilityId}:${applicationId}`,
        `welfare-zakat:fund:${actor.facilityId}:${fundId}`,
      ],
      idempotencyPayload: { applicationId, fundId },
      journalPayload: { applicationId, fundId },
      execute: async (transaction) => {
        let application = await this.dependencies.applications.findById(
          actor.facilityId,
          applicationId,
          transaction.session,
        );
        if (application === null) throw new AssistanceApplicationNotFoundError();
        const fund = await this.dependencies.funds.findById(
          actor.facilityId,
          fundId,
          transaction.session,
        );
        if (fund === null) throw new AssistanceFundNotFoundError();
        const now = this.dependencies.clock.now();
        if (fund.status !== 'ACTIVE') throw new AssistanceFundInactiveError();
        if (!effective(fund, now)) throw new AssistanceFundExpiredError();
        if (!['SUBMITTED', 'UNDER_REVIEW', 'REOPENED'].includes(application.status)) {
          throw new AssistanceInvalidStateTransitionError(
            'Assistance application eligibility',
            application.status,
            'UNDER_REVIEW',
          );
        }

        const context = await this.dependencies.context.build({
          actor,
          application,
          fund,
          asOf: now,
          session: transaction.session,
        });
        const result = evaluateFundEligibility({ policy: fundPolicy(fund), context });
        const contextHash = stableAssistancePayloadHash(context);
        const snapshot = await this.dependencies.reviews.appendEligibilitySnapshot({
          actor,
          applicationId,
          fundId,
          applicationVersion: application.version,
          fundVersion: fund.version,
          result,
          contextHash,
          evaluatedAt: now,
          immutableHash: stableAssistancePayloadHash({
            applicationId,
            fundId,
            applicationVersion: application.version,
            fundVersion: fund.version,
            contextHash,
            result,
            transactionId: transaction.transactionId,
          }),
          transaction,
        });

        const targetStatus = result.outcome === 'ELIGIBLE'
          ? 'ELIGIBLE'
          : result.outcome === 'INELIGIBLE'
            ? 'INELIGIBLE'
            : 'UNDER_REVIEW';
        if (application.status !== targetStatus) {
          if (!isAssistanceApplicationStatusTransitionAllowed(application.status, targetStatus)) {
            if (application.status === 'SUBMITTED' && targetStatus !== 'UNDER_REVIEW') {
              const underReview = await this.transition(
                actor,
                application,
                'UNDER_REVIEW',
                'Eligibility evaluation started',
                { eligibilityOutcome: result.outcome, eligibilitySnapshotId: snapshot._id.toHexString() },
                transaction,
              );
              application = underReview;
            } else {
              throw new AssistanceInvalidStateTransitionError(
                'Assistance application',
                application.status,
                targetStatus,
              );
            }
          }
          if (application.status !== targetStatus) {
            application = await this.transition(
              actor,
              application,
              targetStatus,
              result.reasons.join('; ') || `Eligibility evaluated as ${result.outcome}`,
              { eligibilityOutcome: result.outcome, eligibilitySnapshotId: snapshot._id.toHexString() },
              transaction,
            );
          }
        } else {
          const eligibilityRecorded = await this.dependencies.applications.recordEligibility({
            actor,
            applicationId,
            expectedVersion: application.version,
            outcome: result.outcome,
            eligibilitySnapshotId: snapshot._id.toHexString(),
            transaction,
          });
          if (eligibilityRecorded === null) throw new AssistanceVersionConflictError();
          application = eligibilityRecorded;
        }

        await this.dependencies.audit.record({
          actor,
          action: 'ASSISTANCE_ELIGIBILITY_EVALUATED',
          entityType: 'EligibilityEvaluationSnapshot',
          entityId: snapshot._id.toHexString(),
          reason: result.reasons.join('; ') || null,
          before: null,
          after: {
            applicationId,
            fundId,
            outcome: result.outcome,
            matchedRuleCodes: result.matchedRuleCodes,
            failedRuleCodes: result.failedRuleCodes,
          },
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType: 'welfare_zakat.eligibility.evaluated',
          aggregateType: 'AssistanceApplication',
          aggregateId: applicationId,
          payload: safeWelfareZakatRealtimePayload({
            applicationId,
            fundId,
            status: application.status,
            previousStatus: null,
            version: application.version,
            eventAt: now.toISOString(),
          }),
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        return {
          application: projectAssistanceApplication(application),
          snapshotId: snapshot._id.toHexString(),
          result,
        };
      },
    });
  }

  private async transition(
    actor: WelfareZakatActorContext,
    application: AssistanceApplicationRecord,
    toStatus: AssistanceApplicationRecord['status'],
    reason: string,
    updates: Readonly<Record<string, unknown>>,
    transaction: WelfareZakatTransactionContext,
  ): Promise<AssistanceApplicationRecord> {
    const updated = await this.dependencies.applications.transition({
      actor,
      applicationId: application._id.toHexString(),
      expectedVersion: application.version,
      fromStatus: application.status,
      toStatus,
      reason,
      occurredAt: this.dependencies.clock.now(),
      updates,
      transaction,
    });
    if (updated === null) throw new AssistanceVersionConflictError();
    const snapshot = projectAssistanceApplication(updated);
    const snapshotHash = stableAssistancePayloadHash(snapshot);
    await this.dependencies.applicationHistories.append({
      actor,
      application: updated,
      fromStatus: application.status,
      toStatus,
      reason,
      snapshot: snapshot as unknown as Readonly<Record<string, unknown>>,
      snapshotHash,
      immutableHash: stableAssistancePayloadHash({
        applicationId: updated._id.toHexString(),
        applicationVersion: updated.version,
        fromStatus: application.status,
        toStatus,
        snapshotHash,
        transactionId: transaction.transactionId,
      }),
      occurredAt: this.dependencies.clock.now(),
      transaction,
    });
    return updated;
  }

  private async requirePermission(actor: WelfareZakatActorContext, permission: string) {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      permission,
      resourceFacilityId: actor.facilityId,
    });
    if (!decision.allowed) throw new AssistanceAccessDeniedError(decision.denialReason ?? undefined);
  }
}