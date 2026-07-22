import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  calculateCoverageFinancialAllocation,
} from '../panels-packages-coverage.financial-math.js';

import {
  createCoveragePlanSchema,
  createTreatmentPackageSchema,
} from '../panels-packages-coverage.validation.js';

describe('panels, packages, and coverage foundation', () => {
  it('calculates exact package, sponsor, and patient portions', () => {
    expect(
      calculateCoverageFinancialAllocation(
        '10000.00',
        '1000.00',
        {
          deductibleRemaining: '500.00',
          copaymentAmount: '250.00',
          coinsurancePercentage: '10',
          coveragePercentage: '80',
          benefitRemaining: null,
        },
      ),
    ).toEqual({
      grossAmount: '10000.00',
      packageAmount: '1000.00',
      eligibleAmount: '9000.00',
      deductibleAmount: '500.00',
      copaymentAmount: '250.00',
      coinsuranceAmount: '825.00',
      sponsorAmount: '5940.00',
      patientAmount: '3060.00',
      deniedAmount: '0.00',
    });
  });

  it('caps sponsor responsibility at the remaining benefit', () => {
    const result = calculateCoverageFinancialAllocation(
      '5000.00',
      '0.00',
      {
        deductibleRemaining: '0.00',
        copaymentAmount: '0.00',
        coinsurancePercentage: '0',
        coveragePercentage: '100',
        benefitRemaining: '1200.00',
      },
    );

    expect(result.sponsorAmount).toBe('1200.00');
    expect(result.patientAmount).toBe('3800.00');
    expect(result.deniedAmount).toBe('3800.00');
  });

  it('rejects a fixed-price package without a fixed price', () => {
    const parsed = createTreatmentPackageSchema.safeParse({
      code: 'MATERNITY_BASIC',
      name: 'Basic Maternity',
      packageType: 'MATERNITY',
      pricingMode: 'FIXED_PRICE',
      fixedPrice: null,
      discountPercentage: null,
      usageLimit: null,
      eligibility: {},
      items: [
        {
          chargeCatalogItemId: '507f1f77bcf86cd799439011',
          included: true,
          quantityLimit: '1',
          amountLimit: null,
          discountPercentage: null,
          requiresAuthorization: false,
          displayOrder: 1,
        },
      ],
      effectiveFrom: '2026-07-22T00:00:00+05:00',
      effectiveThrough: null,
      changeReason: 'Initial package configuration',
    });

    expect(parsed.success).toBe(false);
  });

  it('accepts exact decimal coverage terms and ordered rules', () => {
    const parsed = createCoveragePlanSchema.safeParse({
      payerOrganizationId: '507f1f77bcf86cd799439011',
      code: 'CORP_GOLD',
      name: 'Corporate Gold',
      description: null,
      terms: {
        deductibleAmount: '1000.00',
        copaymentAmount: '250.00',
        coinsurancePercentage: '10',
        coveragePercentage: '80',
        annualLimit: '500000.00',
        lifetimeLimit: null,
      },
      rules: [
        {
          code: 'LAB_COVER',
          effect: 'COVER',
          chargeCatalogItemId: null,
          chargeCategoryId: '507f191e810c19729de860ea',
          departmentId: null,
          limitPeriod: 'ANNUAL',
          limitQuantity: null,
          limitAmount: '100000.00',
          waitingPeriodDays: 0,
          networkCode: null,
          preauthorizationRequired: false,
          priority: 1,
        },
      ],
      effectiveFrom: '2026-07-22T00:00:00+05:00',
      effectiveThrough: null,
      changeReason: 'Initial approved plan version',
    });

    expect(parsed.success).toBe(true);
  });
});