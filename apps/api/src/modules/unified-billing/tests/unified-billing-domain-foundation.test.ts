import {
  describe,
  expect,
  it,
} from 'vitest';

import type {
  PermissionKey,
} from '@hospital-mis/permissions';

import {
  UNIFIED_BILLING_ACCOUNT_TRANSITIONS,
  UNIFIED_BILLING_CHARGE_TRANSITIONS,
  UNIFIED_BILLING_PERMISSION_KEYS,
} from '../unified-billing.constants.js';

import {
  BillingBreakGlassReasonRequiredError,
  BillingContextMismatchError,
  BillingMakerCheckerViolationError,
  BillingSourceNotBillableError,
} from '../unified-billing.errors.js';

import {
  createChargeCatalogItemBodySchema,
  createPatientAccountBodySchema,
  receivePaymentBodySchema,
  reverseChargeBodySchema,
  unifiedBillingMutationHeadersSchema,
} from '../unified-billing.validation.js';

import type {
  UnifiedBillingActorContext,
} from '../unified-billing.contracts.js';

import type {
  BillingActorIdentityRecord,
  BillingCoverageRecord,
  BillingGuarantorRecord,
  BillingPatientRecord,
  BillingSourceContextRecord,
  BillingStaffRecord,
} from '../unified-billing.persistence.types.js';

import type {
  UnifiedBillingClockPort,
  UnifiedBillingContextRepositoryPort,
} from '../unified-billing.ports.js';

import {
  UnifiedBillingAccessPolicyService,
} from '../services/unified-billing-access-policy.service.js';

import {
  UnifiedBillingContextService,
} from '../services/unified-billing-context.service.js';

const actor: UnifiedBillingActorContext = {
  userId: '64b64b64b64b64b64b64b641',
  facilityId: '64b64b64b64b64b64b64b642',
  correlationId: 'correlation-billing-test',
  roleKeys: ['BILLING_OFFICER'],
  permissionKeys: [
    UNIFIED_BILLING_PERMISSION_KEYS.ACCOUNTS_CREATE,
    UNIFIED_BILLING_PERMISSION_KEYS.ACCOUNTS_READ,
  ],
};

class FixedClock implements UnifiedBillingClockPort {
  public now(): Date {
    return new Date('2026-07-21T06:00:00.000Z');
  }
}

class FakeContextRepository
implements UnifiedBillingContextRepositoryPort {
  public identity: BillingActorIdentityRecord | null = {
    userId: actor.userId,
    facilityId: actor.facilityId,
    staffId: '64b64b64b64b64b64b64b643',
    status: 'ACTIVE',
  };

  public staff: BillingStaffRecord | null = {
    staffId: '64b64b64b64b64b64b64b643',
    facilityId: actor.facilityId,
    departmentId: '64b64b64b64b64b64b64b644',
    displayName: 'Fictional Billing Officer',
    professionalType: 'BILLING_OFFICER',
    employmentStatus: 'ACTIVE',
    isActive: true,
  };

  public patient: BillingPatientRecord | null = {
    patientId: '64b64b64b64b64b64b64b645',
    facilityId: actor.facilityId,
    status: 'ACTIVE',
    mrn: 'FAC-2026-000001',
    displayName: 'Fictional Patient',
  };

  public guarantor: BillingGuarantorRecord | null = null;
  public coverage: BillingCoverageRecord[] = [];

  public source: BillingSourceContextRecord | null = {
    facilityId: actor.facilityId,
    sourceModule: 'LABORATORY',
    sourceRecordType: 'LAB_ORDER_ITEM',
    sourceRecordId: '64b64b64b64b64b64b64b646',
    sourceLineId: null,
    sourceOccurredAt: new Date('2026-07-21T05:00:00.000Z'),
    sourceStatus: 'ORDERED',
    billable: true,
    unbillableReason: null,
    patientId: '64b64b64b64b64b64b64b645',
    billingContext: 'OUTPATIENT',
    registrationId: '64b64b64b64b64b64b64b647',
    opdVisitId: '64b64b64b64b64b64b64b648',
    encounterId: '64b64b64b64b64b64b64b649',
    admissionId: null,
    emergencyVisitId: null,
    departmentId: '64b64b64b64b64b64b64b644',
    locationId: null,
    serviceLineCode: 'LAB',
    serviceFrom: new Date('2026-07-21T05:00:00.000Z'),
    serviceThrough: null,
  };

  public async findActorIdentity(
    _userId: string,
  ): Promise<BillingActorIdentityRecord | null> {
    return this.identity;
  }

  public async findStaff(
    _facilityId: string,
    _staffId: string,
  ): Promise<BillingStaffRecord | null> {
    return this.staff;
  }

  public async findPatient(
    _facilityId: string,
    _patientId: string,
  ): Promise<BillingPatientRecord | null> {
    return this.patient;
  }

  public async findGuarantor(
    _facilityId: string,
    _guarantorId: string,
  ): Promise<BillingGuarantorRecord | null> {
    return this.guarantor;
  }

  public async listCoverage(
    _facilityId: string,
    _patientId: string,
    _coverageIds: readonly string[],
    _at: Date,
  ): Promise<BillingCoverageRecord[]> {
    return this.coverage;
  }

  public async resolveSourceContext(
    _facilityId: string,
    _sourceModule: BillingSourceContextRecord['sourceModule'],
    _sourceRecordId: string,
    _sourceLineId: string | null,
  ): Promise<BillingSourceContextRecord | null> {
    return this.source;
  }
}

describe('Unified billing domain foundation', () => {
  it('uses explicit non-destructive lifecycle transitions', () => {
    expect(
      UNIFIED_BILLING_ACCOUNT_TRANSITIONS.FINALIZED,
    ).toEqual([]);

    expect(
      UNIFIED_BILLING_CHARGE_TRANSITIONS.POSTED,
    ).toEqual(
      expect.arrayContaining([
        'REVERSED',
        'CREDITED',
        'ADJUSTED',
        'WRITTEN_OFF',
        'TRANSFERRED',
        'CORRECTED',
      ]),
    );

    expect(
      UNIFIED_BILLING_CHARGE_TRANSITIONS.POSTED,
    ).not.toContain('DRAFT');
  });

  it('normalizes exact decimal inputs without JavaScript number arithmetic', () => {
    const parsed =
      createChargeCatalogItemBodySchema.parse({
        chargeCode: 'lab-cbc',
        serviceCode: 'cbc',
        name: 'Complete blood count',
        categoryId: '64b64b64b64b64b64b64b650',
        chargeType: 'LABORATORY',
        defaultQuantity: '1.000',
        minimumPrice: '0.10',
        maximumPrice: '9999.9900',
        costAmount: '125.500',
        effectiveFrom: '2026-07-21T00:00:00.000Z',
      });

    expect(parsed.chargeCode).toBe('LAB-CBC');
    expect(parsed.defaultQuantity).toBe('1');
    expect(parsed.minimumPrice).toBe('0.1');
    expect(parsed.maximumPrice).toBe('9999.99');
    expect(parsed.costAmount).toBe('125.5');
  });

  it('rejects invalid decimal ranges and incomplete reversals', () => {
    expect(
      createChargeCatalogItemBodySchema.safeParse({
        chargeCode: 'LAB-CBC',
        serviceCode: 'CBC',
        name: 'Complete blood count',
        categoryId: '64b64b64b64b64b64b64b650',
        chargeType: 'LABORATORY',
        minimumPrice: '200',
        maximumPrice: '100',
        effectiveFrom: '2026-07-21T00:00:00.000Z',
      }).success,
    ).toBe(false);

    expect(
      reverseChargeBodySchema.safeParse({
        expectedVersion: 2,
        reason: 'Correct duplicate posting',
      }).success,
    ).toBe(false);
  });

  it('requires idempotency keys for financial mutations', () => {
    expect(
      unifiedBillingMutationHeadersSchema.safeParse({
        'idempotency-key': 'billing:lab:order:1',
      }).success,
    ).toBe(true);

    expect(
      unifiedBillingMutationHeadersSchema.safeParse({}).success,
    ).toBe(false);
  });

  it('validates guarantor and exact payment inputs', () => {
    expect(
      createPatientAccountBodySchema.safeParse({
        sourceModule: 'LABORATORY',
        sourceRecordId: '64b64b64b64b64b64b64b646',
        responsiblePartyType: 'GUARANTOR',
      }).success,
    ).toBe(false);

    const payment =
      receivePaymentBodySchema.parse({
        patientAccountId: '64b64b64b64b64b64b64b651',
        amount: '1000.5000',
        paymentMethod: 'CASH',
      });

    expect(payment.amount).toBe('1000.5');
  });

  it('resolves patient and service identity from the authoritative source', async () => {
    const repository =
      new FakeContextRepository();
    const service =
      new UnifiedBillingContextService(
        repository,
        new FixedClock(),
      );

    const context =
      await service.resolveAccountCreationContext(
        actor,
        {
          sourceModule: 'LABORATORY',
          sourceRecordId:
            '64b64b64b64b64b64b64b646',
        },
      );

    expect(context.source.patient.patientId).toBe(
      '64b64b64b64b64b64b64b645',
    );
    expect(context.source.billingContext).toBe(
      'OUTPATIENT',
    );
    expect(context.accountType).toBe(
      'OUTPATIENT',
    );
    expect(context.currency).toBe('PKR');
    expect(context.actor.staffId).toBe(
      '64b64b64b64b64b64b64b643',
    );
  });

  it('rejects non-billable and cross-context source records', async () => {
    const repository =
      new FakeContextRepository();
    const service =
      new UnifiedBillingContextService(
        repository,
        new FixedClock(),
      );

    repository.source = {
      ...repository.source!,
      billable: false,
      unbillableReason: 'Order was cancelled',
    };

    await expect(
      service.resolveSource(
        actor,
        {
          sourceModule: 'LABORATORY',
          sourceRecordId:
            '64b64b64b64b64b64b64b646',
        },
      ),
    ).rejects.toBeInstanceOf(
      BillingSourceNotBillableError,
    );

    repository.source = {
      ...repository.source!,
      billable: true,
      unbillableReason: null,
      facilityId:
        '64b64b64b64b64b64b64b699',
    };

    await expect(
      service.resolveSource(
        actor,
        {
          sourceModule: 'LABORATORY',
          sourceRecordId:
            '64b64b64b64b64b64b64b646',
        },
      ),
    ).rejects.toBeInstanceOf(
      BillingContextMismatchError,
    );
  });

  it('enforces facility roles, cost permissions, and maker-checker separation', async () => {
    const repository =
      new FakeContextRepository();
    const policy =
      new UnifiedBillingAccessPolicyService(
        repository,
      );

    const operational =
      await policy.authorize({
        actor,
        action: 'ACCOUNT_CREATE',
      });

    expect(operational.allowed).toBe(true);
    expect(operational.accessMode).toBe(
      'BILLING_OPERATIONAL',
    );

    const costDenied =
      await policy.authorize({
        actor: {
          ...actor,
          permissionKeys: [
            UNIFIED_BILLING_PERMISSION_KEYS
              .REPORT_COST_MARGIN,
          ],
        },
        action: 'REPORT_COST_MARGIN',
        includeCost: true,
      });

    expect(costDenied.allowed).toBe(true);
    expect(costDenied.includeCost).toBe(true);

    const makerCheckerDenied =
      await policy.authorize({
        actor: {
          ...actor,
          roleKeys: ['BILLING_MANAGER'],
          permissionKeys: [
            UNIFIED_BILLING_PERMISSION_KEYS
              .DISCOUNT_APPROVE,
          ],
        },
        action: 'DISCOUNT_APPROVE',
        requesterUserId: actor.userId,
      });

    expect(makerCheckerDenied.allowed).toBe(false);
    expect(
      makerCheckerDenied.denialReason,
    ).toContain('cannot approve');
  });

  it('requires a reason before break-glass financial reads', async () => {
    const repository =
      new FakeContextRepository();
    const policy =
      new UnifiedBillingAccessPolicyService(
        repository,
      );

    await expect(
      policy.authorize({
        actor: {
          ...actor,
          roleKeys: [],
          permissionKeys: [
            UNIFIED_BILLING_PERMISSION_KEYS
              .ACCOUNTS_READ,
            UNIFIED_BILLING_PERMISSION_KEYS
              .BREAK_GLASS,
          ],
        },
        action: 'ACCOUNT_READ',
      }),
    ).rejects.toBeInstanceOf(
      BillingBreakGlassReasonRequiredError,
    );
  });

  it('registers billing constants as typed permissions', () => {
    const permissions:
      readonly PermissionKey[] =
      Object.values(
        UNIFIED_BILLING_PERMISSION_KEYS,
      );

    expect(permissions).toContain(
      'billing.charges.post',
    );
    expect(permissions).toContain(
      'billing.reports.cost_margin',
    );
  });

  it('exposes explicit maker-checker errors for workflows', () => {
    expect(
      new BillingMakerCheckerViolationError(),
    ).toBeInstanceOf(Error);
  });
});