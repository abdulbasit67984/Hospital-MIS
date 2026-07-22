import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  createAssistanceAllocationSchema,
  createAssistanceApplicationSchema,
  createAssistanceFundSchema,
  decideAssistanceApprovalSchema,
  returnFundsSchema,
} from '../welfare-zakat.validation.js';

const ids = {
  patient: '507f1f77bcf86cd799439011',
  guardian: '507f1f77bcf86cd799439012',
  account: '507f1f77bcf86cd799439013',
  invoice: '507f1f77bcf86cd799439014',
  invoiceLine: '507f1f77bcf86cd799439015',
  secondInvoiceLine: '507f1f77bcf86cd799439016',
  application: '507f1f77bcf86cd799439017',
  approval: '507f1f77bcf86cd799439018',
  fund: '507f1f77bcf86cd799439019',
  approvalRequest: '507f1f77bcf86cd799439020',
  refund: '507f1f77bcf86cd799439021',
} as const;

function validFundPayload() {
  return {
    fundCode: 'ZAKAT-GENERAL-2026',
    name: 'General Zakat Fund',
    description: 'Facility Zakat assistance for eligible patients.',
    fundType: 'ZAKAT',
    categoryCode: 'GENERAL-PATIENT-ASSISTANCE',
    restriction: {
      restriction: 'RESTRICTED',
      fundingSourceReference: 'TRUST-2026',
      restrictionNarrative: 'Use only for approved patient treatment.',
    },
    effectiveFrom: '2026-07-01T00:00:00+05:00',
    effectiveThrough: '2027-06-30T23:59:59+05:00',
    openingBalance: '1000000.00',
    currency: 'PKR',
    eligibilityPolicy: {
      defaultOutcome: 'MANUAL_REVIEW',
      rules: [
        {
          ruleCode: 'MAX-HOUSEHOLD-INCOME',
          description: 'Household income must remain within the fund ceiling.',
          field: 'monthlyHouseholdIncome',
          operator: 'GREATER_THAN',
          effect: 'DENY',
          value: '75000.00',
          priority: 10,
          active: true,
        },
      ],
      requiresZakatDeclaration: true,
      requiresSocialWelfareReview: true,
      limits: [
        {
          scope: 'PATIENT',
          amount: '250000.00',
          periodType: 'FINANCIAL_YEAR',
          appliesPerPatient: true,
        },
      ],
    },
    approvalMatrixCode: 'ZAKAT-STANDARD',
    facilitySpecific: true,
    reason: 'Create the approved annual Zakat fund.',
  };
}

function validApplicationPayload() {
  return {
    applicationType: 'ZAKAT',
    patientId: ids.patient,
    guardianId: ids.guardian,
    invoiceId: ids.invoice,
    preferredFundId: ids.fund,
    applicant: {
      applicantRelationshipToPatient: 'SELF',
      applicantName: 'Fictional Patient',
      applicantPhone: '03000000000',
      applicantIdentifierReference: 'MASKED-IDENTITY-REFERENCE',
      guardianId: ids.guardian,
    },
    householdMembers: [
      {
        relationship: 'SELF',
        ageYears: 45,
        employed: true,
        monthlyIncome: '30000.00',
        dependant: false,
      },
      {
        relationship: 'CHILD',
        ageYears: 10,
        employed: false,
        monthlyIncome: '0.00',
        dependant: true,
      },
    ],
    employment: {
      employmentStatus: 'DAILY-WAGE',
      monthlyIncome: '30000.00',
      otherMonthlyIncome: '0.00',
    },
    financialCondition: {
      monthlyHouseholdIncome: '30000.00',
      monthlyHouseholdExpenses: '28000.00',
      assetsEstimatedValue: '50000.00',
      liabilitiesEstimatedValue: '100000.00',
      medicalDebt: '75000.00',
      otherFinancialSupport: '0.00',
    },
    zakatDeclaration: {
      declarationProvided: true,
      declaresEligible: true,
      declarationDate: '2026-07-22T10:00:00+05:00',
      declarationReference: 'DECLARATION-REF-1',
    },
    questionnaireAnswers: {
      ownsResidence: false,
      assessmentNarrative: 'Requires financial assistance for treatment.',
    },
    requestedAmount: '50000.00',
    requestedServices: [
      {
        invoiceLineId: ids.invoiceLine,
        serviceCategory: 'SURGERY',
        serviceCode: 'SURGERY-GENERAL',
        requestedAmount: '50000.00',
      },
    ],
    financialYearCode: 'FY-2026-27',
  };
}

function validAllocationPayload() {
  return {
    expectedFundVersion: 2,
    expectedApprovalVersion: 1,
    applicationId: ids.application,
    approvalId: ids.approval,
    fundId: ids.fund,
    patientId: ids.patient,
    patientAccountId: ids.account,
    invoiceId: ids.invoice,
    priority: 10,
    lines: [
      {
        invoiceLineId: ids.invoiceLine,
        amount: '20000.00',
        reason: 'Allocate approved patient responsibility.',
      },
    ],
    reason: 'Apply the approved Zakat assistance.',
  };
}

describe('Welfare and Zakat request validation', () => {
  it('accepts a complete restricted fund and normalizes exact decimal values', () => {
    const result = createAssistanceFundSchema.parse(validFundPayload());

    expect(result.openingBalance).toBe('1000000.00');
    expect(result.eligibilityPolicy.limits?.[0]?.amount).toBe('250000.00');
  });

  it('rejects client-supplied authoritative fund balances', () => {
    expect(
      createAssistanceFundSchema.safeParse({
        ...validFundPayload(),
        availableBalance: '999999999.00',
      }).success,
    ).toBe(false);
  });

  it('requires use restrictions for restricted funds', () => {
    expect(
      createAssistanceFundSchema.safeParse({
        ...validFundPayload(),
        restriction: {
          restriction: 'RESTRICTED',
        },
      }).success,
    ).toBe(false);
  });

  it('requires a complete declaration for Zakat applications', () => {
    expect(createAssistanceApplicationSchema.safeParse(validApplicationPayload()).success).toBe(
      true,
    );

    expect(
      createAssistanceApplicationSchema.safeParse({
        ...validApplicationPayload(),
        zakatDeclaration: null,
      }).success,
    ).toBe(false);
  });

  it('blocks duplicate invoice-line requests and allocations', () => {
    const application = validApplicationPayload();
    expect(
      createAssistanceApplicationSchema.safeParse({
        ...application,
        requestedServices: [
          application.requestedServices[0],
          {
            ...application.requestedServices[0],
            requestedAmount: '1000.00',
          },
        ],
      }).success,
    ).toBe(false);

    const allocation = validAllocationPayload();
    expect(
      createAssistanceAllocationSchema.safeParse({
        ...allocation,
        lines: [
          allocation.lines[0],
          {
            ...allocation.lines[0],
            amount: '500.00',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('does not accept client-calculated fund or invoice balances on allocation requests', () => {
    expect(
      createAssistanceAllocationSchema.safeParse({
        ...validAllocationPayload(),
        availableFundBalance: '500000.00',
        patientResponsibilityAmount: '20000.00',
      }).success,
    ).toBe(false);
  });

  it('requires approved amounts for positive decisions and forbids them for rejections', () => {
    expect(
      decideAssistanceApprovalSchema.safeParse({
        expectedVersion: 0,
        decision: 'APPROVE',
        decisionReason: 'Approve after independent review.',
      }).success,
    ).toBe(false);

    expect(
      decideAssistanceApprovalSchema.safeParse({
        expectedVersion: 0,
        decision: 'REJECT',
        approvedAmount: '100.00',
        decisionReason: 'Reject because eligibility was not established.',
      }).success,
    ).toBe(false);
  });

  it('requires every refund, repayment, or recovery to reference its financial source', () => {
    const base = {
      expectedAllocationVersion: 1,
      amount: '500.00',
      approvalRequestId: ids.approvalRequest,
      reason: 'Return the unused assistance to the originating fund.',
    };

    expect(returnFundsSchema.safeParse(base).success).toBe(false);
    expect(
      returnFundsSchema.safeParse({
        ...base,
        refundId: ids.refund,
      }).success,
    ).toBe(true);
  });
});