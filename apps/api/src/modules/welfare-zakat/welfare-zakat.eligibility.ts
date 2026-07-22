import Decimal from 'decimal.js';

import type {
  EligibilityEvaluationContext,
  EligibilityEvaluationResult,
  EligibilityRuleInput,
  EligibilityRuleResult,
  EligibilityScalar,
  FundEligibilityPolicyInput,
} from './welfare-zakat.contracts.js';
import type {
  EligibilityOutcome,
  EligibilityRuleEffect,
} from './welfare-zakat.constants.js';
import {
  normalizeAssistanceCode,
} from './welfare-zakat.normalization.js';

function normalizeScalar(value: EligibilityScalar): EligibilityScalar {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

function scalarEquals(left: EligibilityScalar, right: EligibilityScalar): boolean {
  if (typeof left === 'number' && typeof right === 'number') {
    return left === right;
  }
  if (typeof left === 'boolean' && typeof right === 'boolean') {
    return left === right;
  }
  if (left === null || right === null) {
    return left === right;
  }
  return normalizeScalar(left) === normalizeScalar(right);
}

function decimalValue(value: unknown): Decimal | null {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  try {
    const parsed = new Decimal(value);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

function getFieldValue(
  context: EligibilityEvaluationContext,
  field: string,
): EligibilityScalar | readonly EligibilityScalar[] | undefined {
  if (field.startsWith('attributes.')) {
    return context.attributes[field.slice('attributes.'.length)];
  }

  const source = context as unknown as Readonly<Record<string, unknown>>;
  const value = source[field];

  if (
    value === undefined ||
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    (Array.isArray(value) &&
      value.every(
        (item) =>
          item === null ||
          typeof item === 'string' ||
          typeof item === 'number' ||
          typeof item === 'boolean',
      ))
  ) {
    return value as EligibilityScalar | readonly EligibilityScalar[] | undefined;
  }

  return undefined;
}

function isEligibilityArray(
  value: EligibilityScalar | readonly EligibilityScalar[] | undefined,
): value is readonly EligibilityScalar[] {
  return Array.isArray(value);
}

function matchRule(
  rule: EligibilityRuleInput,
  actual: EligibilityScalar | readonly EligibilityScalar[] | undefined,
): boolean {
  switch (rule.operator) {
    case 'EXISTS':
      return actual !== undefined && actual !== null;
    case 'NOT_EXISTS':
      return actual === undefined || actual === null;
    case 'EQUALS':
      return (
        !isEligibilityArray(actual) &&
        actual !== undefined &&
        rule.value !== undefined &&
        scalarEquals(actual, rule.value)
      );
    case 'NOT_EQUALS':
      return (
        !isEligibilityArray(actual) &&
        actual !== undefined &&
        rule.value !== undefined &&
        !scalarEquals(actual, rule.value)
      );
    case 'IN':
      return (
        !isEligibilityArray(actual) &&
        actual !== undefined &&
        (rule.values ?? []).some((value) => scalarEquals(actual, value))
      );
    case 'NOT_IN':
      return (
        !isEligibilityArray(actual) &&
        actual !== undefined &&
        !(rule.values ?? []).some((value) => scalarEquals(actual, value))
      );
    case 'CONTAINS_ANY': {
      if (!isEligibilityArray(actual)) {
        return false;
      }
      const expected = rule.values ?? [];
      return expected.some((value) => actual.some((item) => scalarEquals(item, value)));
    }
    case 'CONTAINS_ALL': {
      if (!isEligibilityArray(actual)) {
        return false;
      }
      const expected = rule.values ?? [];
      return (
        expected.length > 0 &&
        expected.every((value) => actual.some((item) => scalarEquals(item, value)))
      );
    }
    case 'BETWEEN': {
      const actualDecimal = decimalValue(actual);
      const minimum = decimalValue(rule.minimum);
      const maximum = decimalValue(rule.maximum);
      return (
        actualDecimal !== null &&
        minimum !== null &&
        maximum !== null &&
        actualDecimal.greaterThanOrEqualTo(minimum) &&
        actualDecimal.lessThanOrEqualTo(maximum)
      );
    }
    case 'GREATER_THAN':
    case 'GREATER_THAN_OR_EQUAL':
    case 'LESS_THAN':
    case 'LESS_THAN_OR_EQUAL': {
      const actualDecimal = decimalValue(actual);
      const expectedDecimal = decimalValue(rule.value);
      if (actualDecimal === null || expectedDecimal === null) {
        return false;
      }

      if (rule.operator === 'GREATER_THAN') {
        return actualDecimal.greaterThan(expectedDecimal);
      }
      if (rule.operator === 'GREATER_THAN_OR_EQUAL') {
        return actualDecimal.greaterThanOrEqualTo(expectedDecimal);
      }
      if (rule.operator === 'LESS_THAN') {
        return actualDecimal.lessThan(expectedDecimal);
      }
      return actualDecimal.lessThanOrEqualTo(expectedDecimal);
    }
  }
}

function restrictionResult(input: Readonly<{
  ruleCode: string;
  matched: boolean;
  effect: EligibilityRuleEffect;
  message: string;
}>): EligibilityRuleResult {
  return {
    ruleCode: input.ruleCode,
    matched: input.matched,
    effect: input.effect,
    failureCode: input.matched ? input.ruleCode : null,
    failureMessage: input.matched ? input.message : null,
  };
}

function listContains(values: readonly string[] | undefined, value: string | null): boolean {
  if (value === null || values === undefined) {
    return false;
  }
  const normalized = normalizeAssistanceCode(value);
  return values.some((item) => normalizeAssistanceCode(item) === normalized);
}

function diagnosisMatches(
  configured: readonly string[] | undefined,
  actual: readonly string[],
): boolean {
  if (configured === undefined || configured.length === 0) {
    return false;
  }
  const normalizedActual = new Set(actual.map(normalizeAssistanceCode));
  return configured.some((code) => normalizedActual.has(normalizeAssistanceCode(code)));
}

function evaluateRestrictions(
  policy: FundEligibilityPolicyInput,
  context: EligibilityEvaluationContext,
): readonly EligibilityRuleResult[] {
  const results: EligibilityRuleResult[] = [];

  if (
    policy.allowedDepartmentIds !== undefined &&
    policy.allowedDepartmentIds.length > 0
  ) {
    results.push(
      restrictionResult({
        ruleCode: 'FUND_ALLOWED_DEPARTMENT',
        matched: !listContains(policy.allowedDepartmentIds, context.departmentId),
        effect: 'DENY',
        message: 'The department is not allowed by this fund',
      }),
    );
  }

  results.push(
    restrictionResult({
      ruleCode: 'FUND_EXCLUDED_DEPARTMENT',
      matched: listContains(policy.excludedDepartmentIds, context.departmentId),
      effect: 'DENY',
      message: 'The department is excluded by this fund',
    }),
  );

  if (
    policy.allowedServiceCategories !== undefined &&
    policy.allowedServiceCategories.length > 0
  ) {
    results.push(
      restrictionResult({
        ruleCode: 'FUND_ALLOWED_SERVICE_CATEGORY',
        matched: !listContains(
          policy.allowedServiceCategories,
          context.serviceCategory,
        ),
        effect: 'DENY',
        message: 'The service category is not allowed by this fund',
      }),
    );
  }

  results.push(
    restrictionResult({
      ruleCode: 'FUND_EXCLUDED_SERVICE_CATEGORY',
      matched: listContains(
        policy.excludedServiceCategories,
        context.serviceCategory,
      ),
      effect: 'DENY',
      message: 'The service category is excluded by this fund',
    }),
  );

  if (policy.allowedServiceCodes !== undefined && policy.allowedServiceCodes.length > 0) {
    results.push(
      restrictionResult({
        ruleCode: 'FUND_ALLOWED_SERVICE_CODE',
        matched: !listContains(policy.allowedServiceCodes, context.serviceCode),
        effect: 'DENY',
        message: 'The service is not allowed by this fund',
      }),
    );
  }

  results.push(
    restrictionResult({
      ruleCode: 'FUND_EXCLUDED_SERVICE_CODE',
      matched: listContains(policy.excludedServiceCodes, context.serviceCode),
      effect: 'DENY',
      message: 'The service is excluded by this fund',
    }),
  );

  if (
    policy.allowedPatientCategoryCodes !== undefined &&
    policy.allowedPatientCategoryCodes.length > 0
  ) {
    results.push(
      restrictionResult({
        ruleCode: 'FUND_ALLOWED_PATIENT_CATEGORY',
        matched: !listContains(
          policy.allowedPatientCategoryCodes,
          context.patientCategoryCode,
        ),
        effect: 'DENY',
        message: 'The patient category is not allowed by this fund',
      }),
    );
  }

  results.push(
    restrictionResult({
      ruleCode: 'FUND_EXCLUDED_PATIENT_CATEGORY',
      matched: listContains(
        policy.excludedPatientCategoryCodes,
        context.patientCategoryCode,
      ),
      effect: 'DENY',
      message: 'The patient category is excluded by this fund',
    }),
  );

  if (
    policy.allowedDiagnosisCodes !== undefined &&
    policy.allowedDiagnosisCodes.length > 0
  ) {
    results.push(
      restrictionResult({
        ruleCode: 'FUND_ALLOWED_DIAGNOSIS',
        matched: !diagnosisMatches(
          policy.allowedDiagnosisCodes,
          context.diagnosisCodes,
        ),
        effect: 'DENY',
        message: 'The configured diagnosis restriction is not satisfied',
      }),
    );
  }

  results.push(
    restrictionResult({
      ruleCode: 'FUND_EXCLUDED_DIAGNOSIS',
      matched: diagnosisMatches(
        policy.excludedDiagnosisCodes,
        context.diagnosisCodes,
      ),
      effect: 'DENY',
      message: 'The diagnosis is excluded by this fund',
    }),
  );

  results.push(
    restrictionResult({
      ruleCode: 'ZAKAT_DECLARATION_REQUIRED',
      matched:
        policy.requiresZakatDeclaration === true &&
        context.zakatDeclaredEligible !== true,
      effect: 'DENY',
      message: 'A positive Zakat eligibility declaration is required',
    }),
  );

  results.push(
    restrictionResult({
      ruleCode: 'SOCIAL_WELFARE_REVIEW_REQUIRED',
      matched:
        policy.requiresSocialWelfareReview === true &&
        !context.socialWelfareAssessmentCompleted,
      effect: 'REQUIRE_REVIEW',
      message: 'A social-welfare officer assessment is required',
    }),
  );

  results.push(
    restrictionResult({
      ruleCode: 'CLINICAL_REVIEW_REQUIRED',
      matched:
        policy.requiresClinicalReview === true &&
        !context.clinicalReviewCompleted,
      effect: 'REQUIRE_REVIEW',
      message: 'A clinical medical-necessity review is required',
    }),
  );

  return results;
}

function deriveOutcome(
  defaultOutcome: EligibilityOutcome,
  results: readonly EligibilityRuleResult[],
): EligibilityOutcome {
  if (results.some((result) => result.matched && result.effect === 'DENY')) {
    return 'INELIGIBLE';
  }
  if (
    results.some(
      (result) => result.matched && result.effect === 'REQUIRE_REVIEW',
    )
  ) {
    return 'MANUAL_REVIEW';
  }
  if (results.some((result) => result.matched && result.effect === 'ALLOW')) {
    return 'ELIGIBLE';
  }
  return defaultOutcome;
}

export function evaluateFundEligibility(input: Readonly<{
  policy: FundEligibilityPolicyInput;
  context: EligibilityEvaluationContext;
}>): EligibilityEvaluationResult {
  const ruleResults = input.policy.rules
    .filter((rule) => rule.active)
    .slice()
    .sort((left, right) => left.priority - right.priority)
    .map<EligibilityRuleResult>((rule) => {
      const matched = matchRule(rule, getFieldValue(input.context, rule.field));
      return {
        ruleCode: normalizeAssistanceCode(rule.ruleCode),
        matched,
        effect: rule.effect,
        failureCode:
          matched && rule.effect !== 'ALLOW'
            ? normalizeAssistanceCode(rule.failureCode ?? rule.ruleCode)
            : null,
        failureMessage:
          matched && rule.effect !== 'ALLOW'
            ? rule.failureMessage ?? rule.description
            : null,
      };
    });

  const allResults = [...evaluateRestrictions(input.policy, input.context), ...ruleResults];
  const outcome = deriveOutcome(input.policy.defaultOutcome, allResults);
  const matched = allResults.filter((result) => result.matched);
  const failures = matched.filter((result) => result.effect !== 'ALLOW');

  return {
    outcome,
    eligible: outcome === 'ELIGIBLE',
    manualReviewRequired: outcome === 'MANUAL_REVIEW',
    matchedRuleCodes: matched.map((result) => result.ruleCode),
    failedRuleCodes: failures.map((result) => result.failureCode ?? result.ruleCode),
    reasons: failures
      .map((result) => result.failureMessage)
      .filter((message): message is string => message !== null),
    ruleResults: allResults,
  };
}