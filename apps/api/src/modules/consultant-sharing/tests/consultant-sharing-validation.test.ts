import { describe, expect, it } from 'vitest';

import {
  consultantAgreementMatchContextSchema,
  consultantAgreementRuleInputSchema,
  consultantParticipantRuleSchema,
  consultantSettlementPeriodSchema,
  consultantSharingListQuerySchema,
  consultantSharingPercentageSchema,
  createConsultantAgreementSchema,
} from '../consultant-sharing.validation.js';

const id = (digit: string): string => digit.repeat(24);

const eligibilityPolicy = {
  discountTreatment: 'DEDUCT_FROM_ELIGIBLE' as const,
  patientResponsibilityTreatment: 'INCLUDE' as const,
  sponsorResponsibilityTreatment: 'INCLUDE' as const,
  packageResponsibilityTreatment: 'INCLUDE' as const,
  welfareZakatTreatment: 'EXCLUDE' as const,
  taxTreatment: 'EXCLUDE' as const,
  serviceChargeTreatment: 'EXCLUDE' as const,
  deductRefunds: true,
  deductCreditNotes: true,
  includeDebitNotes: true,
  deductWriteOffs: true,
  applyClaimAdjustments: true,
  deductNonShareableCharges: true,
  deductCosts: true,
  deductConsumables: true,
  deductOtherApprovedDeductions: true,
};

const validRule = {
  ruleCode: 'SURGERY_PANEL',
  ruleName: 'Surgery panel consultant share',
  priority: 100,
  isFallback: false,
  effectiveFrom: '2026-07-01T00:00:00.000Z',
  effectiveThrough: null,
  departmentId: id('1'),
  serviceId: id('2'),
  serviceCategory: 'SURGERY' as const,
  chargeCatalogItemId: id('3'),
  procedureId: id('4'),
  patientType: 'CORPORATE_PANEL' as const,
  encounterType: 'SURGERY' as const,
  admissionType: null,
  payerOrganizationId: id('5'),
  panelProgramId: id('6'),
  packageId: null,
  claimType: 'SURGICAL',
  calculationMethod: 'PERCENTAGE_OF_ELIGIBLE_REVENUE' as const,
  recognitionBasis: 'CLAIM_PAYMENT_BASIS' as const,
  percentage: '30.000000',
  fixedAmount: null,
  minimumShare: null,
  maximumShare: '50000.00',
  perServiceCap: null,
  perCaseCap: '50000.00',
  periodCap: null,
  guaranteedAmount: null,
  thresholdAmount: null,
  tiers: [],
  participants: [],
  eligibilityPolicy,
};

describe('consultant-sharing validation', () => {
  it('normalizes decimal percentages without using floating point', () => {
    expect(consultantSharingPercentageSchema.parse('30')).toBe('30.000000');
    expect(consultantSharingPercentageSchema.safeParse('100.000001').success).toBe(
      false,
    );
  });

  it('requires method-specific financial configuration', () => {
    expect(consultantAgreementRuleInputSchema.safeParse(validRule).success).toBe(
      true,
    );
    expect(
      consultantAgreementRuleInputSchema.safeParse({
        ...validRule,
        percentage: null,
      }).success,
    ).toBe(false);
    expect(
      consultantAgreementRuleInputSchema.safeParse({
        ...validRule,
        calculationMethod: 'PROGRESSIVE_TIERS',
        percentage: null,
        tiers: [],
      }).success,
    ).toBe(false);
  });

  it('requires exactly one valid residual participant and prevents duplicates', () => {
    expect(
      consultantParticipantRuleSchema.safeParse({
        participantId: id('7'),
        participantRole: 'ASSISTANT_SURGEON',
        allocationMethod: 'RESIDUAL',
        priority: 10,
        receivesResidual: true,
      }).success,
    ).toBe(true);
    expect(
      consultantParticipantRuleSchema.safeParse({
        participantId: id('7'),
        participantRole: 'ASSISTANT_SURGEON',
        allocationMethod: 'RESIDUAL',
        priority: 10,
      }).success,
    ).toBe(false);
  });

  it('validates complete agreement effective dates and unique rule codes', () => {
    const parsed = createConsultantAgreementSchema.safeParse({
      agreementName: 'Visiting surgeon agreement',
      description: 'Approved share terms for visiting surgeon services.',
      consultantId: id('8'),
      consultantStaffId: id('9'),
      consultantGroupId: null,
      engagementType: 'VISITING',
      priority: 100,
      effectiveFrom: '2026-07-01T00:00:00.000Z',
      effectiveThrough: '2027-06-30T23:59:59.999Z',
      supportingAttachmentIds: [id('a')],
      internalNotes: null,
      rules: [validRule],
    });
    expect(parsed.success).toBe(true);

    expect(
      createConsultantAgreementSchema.safeParse({
        agreementName: 'Invalid duplicate rules',
        consultantId: id('8'),
        engagementType: 'VISITING',
        priority: 100,
        effectiveFrom: '2026-07-01T00:00:00.000Z',
        supportingAttachmentIds: [],
        rules: [validRule, validRule],
      }).success,
    ).toBe(false);
  });

  it('validates matching contexts, settlement periods, and bounded pagination', () => {
    expect(
      consultantAgreementMatchContextSchema.safeParse({
        facilityId: id('1'),
        consultantId: id('2'),
        financialEventAt: '2026-07-23T01:00:00.000Z',
        serviceCategory: 'SURGERY',
      }).success,
    ).toBe(true);

    expect(
      consultantSettlementPeriodSchema.safeParse({
        periodType: 'MONTHLY',
        periodFrom: '2026-07-31T23:59:59.999Z',
        periodThrough: '2026-07-01T00:00:00.000Z',
      }).success,
    ).toBe(false);

    expect(
      consultantSharingListQuerySchema.parse({ page: '2', pageSize: '200' }),
    ).toMatchObject({ page: 2, pageSize: 200, sortBy: 'createdAt' });
    expect(
      consultantSharingListQuerySchema.safeParse({ pageSize: '201' }).success,
    ).toBe(false);
  });
});