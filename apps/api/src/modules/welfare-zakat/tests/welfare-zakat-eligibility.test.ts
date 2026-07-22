import {
  describe,
  expect,
  it,
} from 'vitest';

import type {
  EligibilityEvaluationContext,
  FundEligibilityPolicyInput,
} from '../welfare-zakat.contracts.js';
import { evaluateFundEligibility } from '../welfare-zakat.eligibility.js';

const patientId = '507f1f77bcf86cd799439011';
const departmentId = '507f1f77bcf86cd799439012';

function eligibilityContext(
  overrides: Partial<EligibilityEvaluationContext> = {},
): EligibilityEvaluationContext {
  return {
    patientId,
    patientCategoryCode: 'GENERAL',
    ageYears: 44,
    guardianPresent: false,
    householdSize: 5,
    dependants: 3,
    monthlyHouseholdIncome: '35000.00',
    monthlyHouseholdExpenses: '33000.00',
    monthlyDisposableIncome: '2000.00',
    perCapitaIncome: '7000.00',
    employmentStatus: 'DAILY_WAGE',
    zakatDeclaredEligible: true,
    socialWelfareAssessmentCompleted: true,
    clinicalReviewCompleted: true,
    departmentId,
    serviceCategory: 'SURGERY',
    serviceCode: 'SURGERY-GENERAL',
    diagnosisCodes: ['K35.80'],
    invoiceAmount: '125000.00',
    patientResponsibilityAmount: '85000.00',
    currentPeriodUtilization: '0.00',
    lifetimeUtilization: '0.00',
    attributes: {
      residenceDistrict: 'LAHORE',
      vulnerableCategories: ['LOW_INCOME'],
    },
    ...overrides,
  };
}

function eligibilityPolicy(
  overrides: Partial<FundEligibilityPolicyInput> = {},
): FundEligibilityPolicyInput {
  return {
    defaultOutcome: 'ELIGIBLE',
    rules: [],
    ...overrides,
  };
}

describe('Welfare and Zakat eligibility evaluation', () => {
  it('returns the configured default when no restriction or rule blocks the patient', () => {
    const result = evaluateFundEligibility({
      policy: eligibilityPolicy({
        allowedDepartmentIds: [departmentId],
        allowedServiceCategories: ['SURGERY'],
        allowedPatientCategoryCodes: ['GENERAL'],
      }),
      context: eligibilityContext(),
    });

    expect(result).toMatchObject({
      outcome: 'ELIGIBLE',
      eligible: true,
      manualReviewRequired: false,
      failedRuleCodes: [],
    });
  });

  it('denies a patient when an active financial-threshold rule matches', () => {
    const result = evaluateFundEligibility({
      policy: eligibilityPolicy({
        rules: [
          {
            ruleCode: 'MAX-HOUSEHOLD-INCOME',
            description: 'Household income exceeds the configured limit',
            field: 'monthlyHouseholdIncome',
            operator: 'GREATER_THAN',
            effect: 'DENY',
            value: '50000.00',
            priority: 10,
            active: true,
            failureCode: 'HOUSEHOLD-INCOME-EXCEEDED',
          },
        ],
      }),
      context: eligibilityContext({ monthlyHouseholdIncome: '50000.01' }),
    });

    expect(result.outcome).toBe('INELIGIBLE');
    expect(result.failedRuleCodes).toContain('HOUSEHOLD-INCOME-EXCEEDED');
    expect(result.reasons).toContain(
      'Household income exceeds the configured limit',
    );
  });

  it('requires manual review when a mandatory assessment has not been completed', () => {
    const result = evaluateFundEligibility({
      policy: eligibilityPolicy({
        requiresSocialWelfareReview: true,
        requiresClinicalReview: true,
      }),
      context: eligibilityContext({
        socialWelfareAssessmentCompleted: false,
        clinicalReviewCompleted: false,
      }),
    });

    expect(result).toMatchObject({
      outcome: 'MANUAL_REVIEW',
      eligible: false,
      manualReviewRequired: true,
    });
    expect(result.failedRuleCodes).toEqual(
      expect.arrayContaining([
        'SOCIAL_WELFARE_REVIEW_REQUIRED',
        'CLINICAL_REVIEW_REQUIRED',
      ]),
    );
  });

  it('applies fund restrictions before permissive custom rules', () => {
    const result = evaluateFundEligibility({
      policy: eligibilityPolicy({
        excludedServiceCategories: ['PHARMACY'],
        rules: [
          {
            ruleCode: 'LOW-INCOME-ALLOWANCE',
            description: 'Low-income patients may be assisted',
            field: 'monthlyHouseholdIncome',
            operator: 'LESS_THAN_OR_EQUAL',
            effect: 'ALLOW',
            value: '40000.00',
            priority: 1,
            active: true,
          },
        ],
      }),
      context: eligibilityContext({ serviceCategory: 'PHARMACY' }),
    });

    expect(result.outcome).toBe('INELIGIBLE');
    expect(result.matchedRuleCodes).toEqual(
      expect.arrayContaining([
        'FUND_EXCLUDED_SERVICE_CATEGORY',
        'LOW-INCOME-ALLOWANCE',
      ]),
    );
  });

  it('supports normalized custom attributes and list membership without exposing identifiers', () => {
    const result = evaluateFundEligibility({
      policy: eligibilityPolicy({
        defaultOutcome: 'MANUAL_REVIEW',
        rules: [
          {
            ruleCode: 'VULNERABLE-CATEGORY',
            description: 'Approved vulnerable category',
            field: 'attributes.vulnerableCategories',
            operator: 'CONTAINS_ANY',
            effect: 'ALLOW',
            values: ['low_income', 'widow'],
            priority: 1,
            active: true,
          },
        ],
      }),
      context: eligibilityContext(),
    });

    expect(result.outcome).toBe('ELIGIBLE');
    expect(result.matchedRuleCodes).toContain('VULNERABLE-CATEGORY');
  });
});