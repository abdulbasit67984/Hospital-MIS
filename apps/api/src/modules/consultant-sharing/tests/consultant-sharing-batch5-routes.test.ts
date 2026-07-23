import { describe, expect, it } from 'vitest';

import { permissionKeys } from '@hospital-mis/permissions';

import { CONSULTANT_SHARING_PERMISSION_KEYS as P } from '../consultant-sharing.constants.js';
import { CONSULTANT_SHARING_ROUTE_MANIFEST } from '../consultant-sharing.routes.js';
import {
  consultantAgreementTransitionBodySchema,
  consultantDisputeTransitionBodySchema,
  consultantSettlementTransitionBodySchema,
  consultantSharingIdempotencyHeaderSchema,
  createConsultantAgreementSchema,
  requestConsultantPayoutSchema,
} from '../consultant-sharing.validation.js';

const objectId = '507f1f77bcf86cd799439011';

describe('Consultant Sharing HTTP composition', () => {
  it('registers unique permission-protected routes', () => {
    const routeKeys = CONSULTANT_SHARING_ROUTE_MANIFEST.map(
      ([method, path]) => `${method}:${path}`,
    );
    expect(new Set(routeKeys).size).toBe(routeKeys.length);

    for (const [, , permission] of CONSULTANT_SHARING_ROUTE_MANIFEST) {
      expect(permissionKeys).toContain(permission);
    }
    for (const permission of Object.values(P)) {
      expect(permissionKeys).toContain(permission);
    }
  });

  it('uses action-specific maker-checker permissions', () => {
    expect(CONSULTANT_SHARING_ROUTE_MANIFEST).toContainEqual([
      'POST',
      '/agreements/:id/approve',
      P.AGREEMENT_APPROVE,
    ]);
    expect(CONSULTANT_SHARING_ROUTE_MANIFEST).toContainEqual([
      'POST',
      '/settlements/:id/review',
      P.SETTLEMENT_REVIEW,
    ]);
    expect(CONSULTANT_SHARING_ROUTE_MANIFEST).toContainEqual([
      'POST',
      '/settlements/:id/reverse',
      P.SETTLEMENT_REVERSE,
    ]);
    expect(CONSULTANT_SHARING_ROUTE_MANIFEST).toContainEqual([
      'POST',
      '/payouts/:id/reverse',
      P.PAYOUT_REVERSE,
    ]);
    expect(CONSULTANT_SHARING_ROUTE_MANIFEST).toContainEqual([
      'POST',
      '/disputes/:id/approve',
      P.DISPUTE_RESOLVE,
    ]);
    expect(CONSULTANT_SHARING_ROUTE_MANIFEST).not.toContainEqual([
      'POST',
      '/agreements/:id/status',
      P.AGREEMENT_SUBMIT,
    ]);
  });

  it('requires an idempotency key on mutation requests', () => {
    expect(consultantSharingIdempotencyHeaderSchema.safeParse({}).success)
      .toBe(false);
    expect(consultantSharingIdempotencyHeaderSchema.safeParse({
      'idempotency-key': 'consultant-sharing-operation-0001',
    }).success).toBe(true);
  });

  it('does not accept a client-selected lifecycle target on fixed routes', () => {
    const common = {
      expectedVersion: 2,
      reason: 'Independent lifecycle review completed',
    };
    expect(consultantAgreementTransitionBodySchema.safeParse({
      ...common,
      targetStatus: 'ACTIVE',
    }).success).toBe(false);
    expect(consultantSettlementTransitionBodySchema.safeParse({
      ...common,
      toStatus: 'APPROVED',
    }).success).toBe(false);
    expect(consultantDisputeTransitionBodySchema.safeParse({
      ...common,
      toStatus: 'RESOLVED',
    }).success).toBe(false);
  });

  it('accepts department, service, category, and approval-matrix agreement scope', () => {
    const result = createConsultantAgreementSchema.safeParse({
      agreementName: 'Visiting consultant agreement',
      consultantId: objectId,
      engagementType: 'VISITING',
      priority: 100,
      departmentIds: [objectId],
      serviceIds: ['507f1f77bcf86cd799439012'],
      serviceCategories: ['CONSULTATION', 'PROCEDURE'],
      approvalMatrixCode: 'CONSULTANT_AGREEMENT_STANDARD',
      effectiveFrom: '2026-07-23T00:00:00.000Z',
      effectiveThrough: null,
      supportingAttachmentIds: [],
      rules: [{
        ruleCode: 'CONSULTATION_DEFAULT',
        ruleName: 'Default consultation share',
        priority: 100,
        isFallback: true,
        effectiveFrom: '2026-07-23T00:00:00.000Z',
        effectiveThrough: null,
        calculationMethod: 'PERCENTAGE_OF_ELIGIBLE_REVENUE',
        recognitionBasis: 'ACCRUAL_ON_FINALIZATION',
        percentage: '30.000000',
        fixedAmount: null,
        thresholdAmount: null,
        minimumShare: null,
        maximumShare: null,
        perServiceCap: null,
        perCaseCap: null,
        periodCap: null,
        guaranteedAmount: null,
        currency: 'PKR',
        tiers: [],
        participants: [],
        eligibilityPolicy: {
          discountTreatment: 'DEDUCT_FROM_ELIGIBLE',
          patientResponsibilityTreatment: 'INCLUDE',
          sponsorResponsibilityTreatment: 'INCLUDE',
          packageResponsibilityTreatment: 'INCLUDE',
          welfareZakatTreatment: 'EXCLUDE',
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
      }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects payout requests without independent approval', () => {
    expect(requestConsultantPayoutSchema.safeParse({
      paymentMethod: 'BANK',
      paymentMethodId: objectId,
      amount: '100.00',
      paymentReference: 'BANK-REFERENCE-1',
    }).success).toBe(false);
  });
});