import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  CoverageRuleEvaluatorService,
} from '../services/coverage-rule-evaluator.service.js';

import {
  PackageEnrollmentService,
} from '../services/package-enrollment.service.js';

describe('package enrollment and coverage determination workflows', () => {
  it('rejects package enrollment when admission eligibility fails', async () => {
    const service = new PackageEnrollmentService({
      packages: {
        findDefinition: vi.fn(async () => ({
          id: 'package-1',
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-01-01T00:00:00Z'),
          effectiveThrough: null,
          eligibility: {
            patientCategoryCodes: [],
            minimumAgeYears: null,
            maximumAgeYears: null,
            genderCodes: [],
            admissionRequired: true,
            departmentIds: [],
            payerOrganizationIds: [],
          },
          items: [],
        })),
        findPatientSnapshot: vi.fn(async () => ({
          patientCategoryCode: null,
          ageYears: 30,
          genderCode: 'FEMALE',
          hasActiveAdmission: false,
          departmentId: null,
          payerOrganizationIds: [],
        })),
      } as never,
      referenceData: {} as never,
      accessPolicy: {
        authorize: vi.fn(async () => ({
          allowed: true,
          denialReason: null,
        })),
      },
      transactionManager: {} as never,
      audit: {} as never,
      outbox: {} as never,
      clock: { now: () => new Date() },
      nextEnrollmentNumber: vi.fn(),
    });

    await expect(
      service.enroll(
        {
          userId: '507f1f77bcf86cd799439011',
          staffId: null,
          facilityId: '507f1f77bcf86cd799439012',
          correlationId: 'corr-1',
          permissionKeys: ['packages.enroll'],
          roleKeys: [],
        },
        'idem-1',
        {
          patientId: '507f1f77bcf86cd799439013',
          packageId: '507f1f77bcf86cd799439014',
          accountId: null,
          invoiceId: null,
          startsAt: '2026-07-22T00:00:00+05:00',
          expiresAt: null,
          enrollmentPrice: '10000.00',
          authorizationReference: null,
          reason: 'Approved patient package enrollment',
        },
      ),
    ).rejects.toThrow('active admission required');
  });

  it('denies excluded coverage services on the backend', () => {
    const evaluator = new CoverageRuleEvaluatorService();
    const result = evaluator.evaluate({
      coverage: {
        status: 'ACTIVE',
        eligibleFrom: new Date('2026-01-01T00:00:00Z'),
        eligibleThrough: null,
      } as never,
      plan: {
        copaymentAmount: { toString: () => '0.00' },
        coinsurancePercentage: { toString: () => '0' },
        coveragePercentage: { toString: () => '100' },
        rules: [{
          ruleCode: 'EXCLUDE_SERVICE',
          effect: 'EXCLUDE',
          chargeCatalogItemId: {
            toHexString: () => '507f1f77bcf86cd799439099',
          },
          chargeCategoryId: null,
          departmentId: null,
          limitPeriod: null,
          limitQuantity: null,
          limitAmount: null,
          waitingPeriodDays: 0,
          networkCode: null,
          preauthorizationRequired: false,
          priority: 1,
        }],
      } as never,
      charge: {
        invoiceLineId: '507f1f77bcf86cd799439020',
        chargeCatalogItemId: '507f1f77bcf86cd799439099',
        serviceDate: '2026-07-22T00:00:00+05:00',
        quantity: '1',
        grossAmount: '5000.00',
        packageAllocationAmount: '0.00',
      },
      serviceDepartmentId: null,
      networkCode: null,
      hasValidPreauthorization: false,
      consumedAmountByRule: new Map(),
      deductibleRemaining: '0.00',
    });

    expect(result.covered).toBe(false);
    expect(result.denialReason).toBe('SERVICE_EXCLUDED');
  });

  it('enforces waiting periods from coverage eligibility', () => {
    const evaluator = new CoverageRuleEvaluatorService();
    const result = evaluator.evaluate({
      coverage: {
        status: 'ACTIVE',
        eligibleFrom: new Date('2026-07-01T00:00:00Z'),
        eligibleThrough: null,
      } as never,
      plan: {
        copaymentAmount: { toString: () => '0.00' },
        coinsurancePercentage: { toString: () => '0' },
        coveragePercentage: { toString: () => '100' },
        rules: [{
          ruleCode: 'WAIT_30',
          effect: 'COVER',
          chargeCatalogItemId: null,
          chargeCategoryId: null,
          departmentId: null,
          limitPeriod: null,
          limitQuantity: null,
          limitAmount: null,
          waitingPeriodDays: 30,
          networkCode: null,
          preauthorizationRequired: false,
          priority: 1,
        }],
      } as never,
      charge: {
        invoiceLineId: '507f1f77bcf86cd799439020',
        chargeCatalogItemId: '507f1f77bcf86cd799439099',
        serviceDate: '2026-07-22T00:00:00+05:00',
        quantity: '1',
        grossAmount: '5000.00',
        packageAllocationAmount: '0.00',
      },
      serviceDepartmentId: null,
      networkCode: null,
      hasValidPreauthorization: false,
      consumedAmountByRule: new Map(),
      deductibleRemaining: '0.00',
    });

    expect(result.denialReason).toBe('WAITING_PERIOD');
  });
});