import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  calculateCoverageFinancialAllocation,
} from '../panels-packages-coverage.financial-math.js';

import {
  CoverageMasterService,
} from '../services/coverage-master.service.js';

describe('panels packages coverage repositories and services', () => {
  it('reconciles package, sponsor, and patient responsibility', () => {
    const result = calculateCoverageFinancialAllocation(
      '10000.00',
      '1000.00',
      {
        deductibleRemaining: '500.00',
        copaymentAmount: '250.00',
        coinsurancePercentage: '10',
        coveragePercentage: '80',
        benefitRemaining: null,
      },
    );

    expect(
      Number(result.packageAmount) +
        Number(result.sponsorAmount) +
        Number(result.patientAmount),
    ).toBe(10000);
  });

  it('does not place membership references in idempotency payloads', async () => {
    const execute = vi.fn(async (input) =>
      input.execute({
        transactionId: 'txn-1',
        session: {} as never,
      }),
    );
    const enrollPatient = vi.fn(async () => ({
      _id: { toHexString: () => 'coverage-1' },
      status: 'PENDING_VERIFICATION',
    }));

    const service = new CoverageMasterService({
      repository: {
        createPayer: vi.fn(),
        createPlan: vi.fn(),
        findPlan: vi.fn(async () => ({
          _id: { toHexString: () => 'plan-1' },
          status: 'ACTIVE',
        })),
        enrollPatient,
        findPatientCoverage: vi.fn(),
        listActivePatientCoverage: vi.fn(),
      } as never,
      referenceData: {
        patientExists: vi.fn(async () => true),
      } as never,
      accessPolicy: {
        authorize: vi.fn(async () => ({
          allowed: true,
          denialReason: null,
        })),
      },
      transactionManager: { execute },
      audit: { record: vi.fn() },
      outbox: { enqueue: vi.fn() },
      encryptSensitiveReference: vi.fn(async () => 'ciphertext'),
      nextCoverageNumber: vi.fn(async () => 'COV-000001'),
    });

    await service.enrollPatient(
      {
        userId: '507f1f77bcf86cd799439011',
        staffId: null,
        facilityId: '507f1f77bcf86cd799439012',
        correlationId: 'corr-1',
        permissionKeys: [],
        roleKeys: [],
      },
      'idempotency-1',
      {
        patientId: '507f1f77bcf86cd799439013',
        coveragePlanId: '507f1f77bcf86cd799439014',
        priority: 'PRIMARY',
        policyReference: 'POL-1',
        membershipReference: 'MEMBER-SECRET',
        authorizationReference: null,
        eligibleFrom: '2026-07-22T00:00:00+05:00',
        eligibleThrough: null,
        employerReference: null,
        reason: 'Initial enrollment',
      },
    );

    expect(execute.mock.calls[0]![0].idempotencyPayload).toMatchObject({
      membershipReference: '[REDACTED]',
    });
    expect(enrollPatient).toHaveBeenCalled();
  });
});