import Decimal from 'decimal.js';

import type {
  CoverageChargeInput,
  CoverageDenialReason,
} from '../panels-packages-coverage.contracts.js';

import type {
  PanelPlanRecord,
  PatientCoverageRecord,
} from '../panels-packages-coverage.persistence.types.js';

export interface CoverageEvaluationContext {
  coverage: PatientCoverageRecord;
  plan: PanelPlanRecord;
  charge: CoverageChargeInput;
  serviceDepartmentId: string | null;
  networkCode: string | null;
  hasValidPreauthorization: boolean;
  consumedAmountByRule: ReadonlyMap<string, string>;
  deductibleRemaining: string;
}

export interface CoverageRuleEvaluation {
  covered: boolean;
  ruleCode: string | null;
  denialReason: CoverageDenialReason | null;
  waitingPeriodEndsAt: Date | null;
  benefitRemaining: string | null;
  deductibleRemaining: string;
  copaymentAmount: string;
  coinsurancePercentage: string;
  coveragePercentage: string;
}

function decimal128String(value: Readonly<{ toString(): string }>): string {
  return value.toString();
}

export class CoverageRuleEvaluatorService {
  public evaluate(
    context: CoverageEvaluationContext,
  ): CoverageRuleEvaluation {
    const serviceDate = new Date(context.charge.serviceDate);

    if (
      context.coverage.status !== 'ACTIVE' ||
      serviceDate < context.coverage.eligibleFrom ||
      (
        context.coverage.eligibleThrough !== null &&
        serviceDate > context.coverage.eligibleThrough
      )
    ) {
      return this.denied('COVERAGE_INACTIVE');
    }

    const rules = context.plan.rules
      .slice()
      .sort((left, right) => left.priority - right.priority);

    const matched = rules.find((rule) => {
      const serviceMatches =
        rule.chargeCatalogItemId === null ||
        rule.chargeCatalogItemId.toHexString() ===
          context.charge.chargeCatalogItemId;
      const departmentMatches =
        rule.departmentId === null ||
        rule.departmentId.toHexString() ===
          context.serviceDepartmentId;
      return serviceMatches && departmentMatches;
    });

    if (matched?.effect === 'EXCLUDE') {
      return this.denied('SERVICE_EXCLUDED', matched.ruleCode);
    }

    if (
      (matched?.effect === 'REQUIRE_PREAUTHORIZATION' ||
        matched?.preauthorizationRequired === true) &&
      !context.hasValidPreauthorization
    ) {
      return this.denied(
        'PREAUTHORIZATION_REQUIRED',
        matched.ruleCode,
      );
    }

    if (
      matched?.effect === 'RESTRICT_NETWORK' &&
      matched.networkCode !== null &&
      matched.networkCode !== context.networkCode
    ) {
      return this.denied('OUT_OF_NETWORK', matched.ruleCode);
    }

    const waitingDays = matched?.waitingPeriodDays ?? 0;
    const waitingPeriodEndsAt = new Date(
      context.coverage.eligibleFrom.getTime() +
        waitingDays * 86_400_000,
    );

    if (waitingDays > 0 && serviceDate < waitingPeriodEndsAt) {
      return {
        ...this.denied('WAITING_PERIOD', matched?.ruleCode ?? null),
        waitingPeriodEndsAt,
      };
    }

    let benefitRemaining: string | null = null;
    if (matched?.limitAmount !== null && matched?.limitAmount !== undefined) {
      const limit = new Decimal(decimal128String(matched.limitAmount));
      const consumed = new Decimal(
        context.consumedAmountByRule.get(matched.ruleCode) ?? '0',
      );
      benefitRemaining = Decimal.max(0, limit.minus(consumed)).toFixed(2);

      if (new Decimal(benefitRemaining).isZero()) {
        return this.denied('LIMIT_EXHAUSTED', matched.ruleCode);
      }
    }

    return {
      covered: true,
      ruleCode: matched?.ruleCode ?? null,
      denialReason: null,
      waitingPeriodEndsAt:
        waitingDays > 0 ? waitingPeriodEndsAt : null,
      benefitRemaining,
      deductibleRemaining: context.deductibleRemaining,
      copaymentAmount: decimal128String(context.plan.copaymentAmount),
      coinsurancePercentage: decimal128String(
        context.plan.coinsurancePercentage,
      ),
      coveragePercentage: decimal128String(
        context.plan.coveragePercentage,
      ),
    };
  }

  private denied(
    reason: CoverageDenialReason,
    ruleCode: string | null = null,
  ): CoverageRuleEvaluation {
    return {
      covered: false,
      ruleCode,
      denialReason: reason,
      waitingPeriodEndsAt: null,
      benefitRemaining: null,
      deductibleRemaining: '0.00',
      copaymentAmount: '0.00',
      coinsurancePercentage: '0',
      coveragePercentage: '0',
    };
  }
}