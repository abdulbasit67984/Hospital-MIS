import { describe, expect, it } from 'vitest';

import {
  assertNoConsultantAgreementRuleConflicts,
  detectConsultantAgreementRuleConflicts,
  selectConsultantAgreementRule,
} from '../consultant-sharing.agreement-matching.js';
import type {
  ConsultantAgreementMatchCandidate,
  ConsultantAgreementRuleDefinition,
} from '../consultant-sharing.contracts.js';

const id = (digit: string): string => digit.repeat(24);

const baseRule: ConsultantAgreementRuleDefinition = {
  id: id('1'),
  agreementId: id('2'),
  agreementVersion: 1,
  ruleVersion: 1,
  ruleCode: 'DEFAULT',
  ruleName: 'Default consultant share',
  status: 'ACTIVE',
  priority: 10,
  isFallback: false,
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  effectiveThrough: null,
  facilityId: id('3'),
  consultantId: id('4'),
  consultantGroupId: null,
  departmentId: null,
  serviceId: null,
  serviceCategory: null,
  chargeCatalogItemId: null,
  procedureId: null,
  patientType: null,
  encounterType: null,
  admissionType: null,
  payerOrganizationId: null,
  panelProgramId: null,
  packageId: null,
  claimType: null,
  calculationMethod: 'PERCENTAGE_OF_ELIGIBLE_REVENUE',
  recognitionBasis: 'ACCRUAL_ON_FINALIZATION',
  percentage: '20.000000',
  fixedAmount: null,
  minimumShare: null,
  maximumShare: null,
  perServiceCap: null,
  perCaseCap: null,
  periodCap: null,
  guaranteedAmount: null,
  thresholdAmount: null,
  tiers: [],
  participants: [],
  eligibilityPolicy: {
    discountTreatment: 'DEDUCT_FROM_ELIGIBLE',
    patientResponsibilityTreatment: 'INCLUDE',
    sponsorResponsibilityTreatment: 'INCLUDE',
    packageResponsibilityTreatment: 'INCLUDE',
    welfareZakatTreatment: 'INCLUDE',
    taxTreatment: 'EXCLUDE',
    serviceChargeTreatment: 'EXCLUDE',
    deductRefunds: true,
    deductCreditNotes: true,
    includeDebitNotes: true,
    deductWriteOffs: true,
    applyClaimAdjustments: true,
    deductNonShareableCharges: true,
    deductCosts: false,
    deductConsumables: false,
    deductOtherApprovedDeductions: true,
  },
  currency: 'PKR',
  calculationFingerprint: 'fingerprint-default',
};

function candidate(
  overrides: Partial<ConsultantAgreementRuleDefinition>,
  candidateOverrides: Partial<ConsultantAgreementMatchCandidate> = {},
): ConsultantAgreementMatchCandidate {
  const rule = { ...baseRule, ...overrides };
  return {
    agreementId: rule.agreementId,
    agreementNumber: 'CSA-2026-000001',
    agreementVersion: rule.agreementVersion,
    agreementStatus: 'ACTIVE',
    agreementPriority: 10,
    rule,
    ...candidateOverrides,
  };
}

const context = {
  facilityId: id('3'),
  consultantId: id('4'),
  financialEventAt: '2026-07-23T01:00:00.000Z',
  departmentId: id('5'),
  serviceId: id('6'),
  serviceCategory: 'SURGERY' as const,
  chargeCatalogItemId: id('7'),
  procedureId: id('8'),
  patientType: 'CORPORATE_PANEL' as const,
  encounterType: 'SURGERY' as const,
  payerOrganizationId: id('9'),
  panelProgramId: id('a'),
  packageId: null,
  claimType: 'SURGICAL',
};

describe('consultant agreement matching', () => {
  it('selects deterministically by fallback, priority, specificity, and version', () => {
    const fallback = candidate({
      id: id('a'),
      ruleCode: 'FALLBACK',
      isFallback: true,
      priority: 100,
      calculationFingerprint: 'fallback',
    });
    const department = candidate({
      id: id('b'),
      ruleCode: 'DEPARTMENT',
      departmentId: id('5'),
      priority: 20,
      calculationFingerprint: 'department',
    });
    const service = candidate({
      id: id('c'),
      ruleCode: 'SERVICE',
      departmentId: id('5'),
      serviceId: id('6'),
      priority: 20,
      calculationFingerprint: 'service',
    });

    const result = selectConsultantAgreementRule(
      [fallback, department, service],
      context,
    );

    expect(result.selected.rule.id).toBe(id('c'));
    expect(result.ranking.matchedDimensions).toEqual([
      'departmentId',
      'serviceId',
    ]);
    expect(result.ranking.specificityScore).toBe(12);
    expect(result.selectionReason).toContain('specificity 12');
  });

  it('rejects ambiguous top-ranked rules with different calculations', () => {
    const left = candidate({
      id: id('b'),
      departmentId: id('5'),
      serviceId: id('6'),
      calculationFingerprint: 'left',
    });
    const right = candidate({
      id: id('c'),
      agreementId: id('d'),
      departmentId: id('5'),
      serviceId: id('6'),
      calculationFingerprint: 'right',
    });

    expect(() => selectConsultantAgreementRule([left, right], context)).toThrow(
      /ambiguous/iu,
    );
  });

  it('permits deterministic duplicates only when their economic fingerprint is identical', () => {
    const left = candidate({
      id: id('b'),
      departmentId: id('5'),
      calculationFingerprint: 'same',
    });
    const right = candidate({
      id: id('c'),
      agreementId: id('d'),
      departmentId: id('5'),
      calculationFingerprint: 'same',
    });

    expect(selectConsultantAgreementRule([right, left], context).selected.rule.id).toBe(
      id('b'),
    );
  });

  it('detects overlapping same-scope conflicts before activation', () => {
    const left = candidate({
      id: id('b'),
      departmentId: id('5'),
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      effectiveThrough: '2026-12-31T23:59:59.999Z',
      calculationFingerprint: 'left',
    });
    const right = candidate({
      id: id('c'),
      agreementId: id('d'),
      departmentId: id('5'),
      effectiveFrom: '2026-06-01T00:00:00.000Z',
      effectiveThrough: null,
      calculationFingerprint: 'right',
    });

    expect(detectConsultantAgreementRuleConflicts([left, right])).toHaveLength(1);
    expect(() => assertNoConsultantAgreementRuleConflicts([left, right])).toThrow(
      /overlapping effective rules/iu,
    );
  });

  it('rejects when no active effective rule matches', () => {
    const inactive = candidate(
      { id: id('b'), departmentId: id('5') },
      { agreementStatus: 'SUSPENDED' },
    );
    expect(() => selectConsultantAgreementRule([inactive], context)).toThrow(
      /no active consultant agreement/iu,
    );
  });
});