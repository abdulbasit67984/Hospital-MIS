import {
  Types,
} from 'mongoose';

import {
  describe,
  expect,
  it,
} from 'vitest';

import type {
  AuthoritativeBillingSourceContext,
} from '../unified-billing.contracts.js';

import type {
  BillingPayerSnapshotRecord,
  ResolvedPriceRecord,
} from '../unified-billing.persistence.types.js';

import {
  calculateAuthoritativeChargeMoney,
  deriveBillingDeterministicChargeKey,
} from '../services/unified-billing-charge.service.js';

function decimal(value: string): Types.Decimal128 {
  return Types.Decimal128.fromString(value);
}

function source(
  sourceLineId: string | null,
): AuthoritativeBillingSourceContext {
  return {
    facilityId: '64b000000000000000000001',
    sourceModule: 'LABORATORY',
    sourceRecordType: 'LAB_ORDER_ITEM',
    sourceRecordId: '64b000000000000000000002',
    sourceLineId,
    sourceOccurredAt: '2026-07-21T00:00:00.000Z',
    sourceStatus: 'COMPLETED',
    billable: true,
    unbillableReason: null,
    patient: {
      patientId: '64b000000000000000000003',
      mrn: 'HOSP-2026-000001',
      displayName: 'Fictional Patient',
      status: 'ACTIVE',
    },
    billingContext: 'OUTPATIENT',
    registrationId: null,
    opdVisitId: '64b000000000000000000004',
    encounterId: '64b000000000000000000005',
    admissionId: null,
    emergencyVisitId: null,
    departmentId: '64b000000000000000000006',
    locationId: null,
    serviceLineCode: 'LABORATORY',
    serviceFrom: '2026-07-21T00:00:00.000Z',
    serviceThrough: null,
  };
}

function resolvedPrice(
  mode: 'EXEMPT' | 'INCLUSIVE' | 'EXCLUSIVE',
  unitPrice: string,
  quantity: string,
  ratePercentage: string,
): ResolvedPriceRecord {
  return {
    catalog: {
      _id: new Types.ObjectId(),
      costAmount: decimal('25'),
    },
    catalogVersion: { _id: new Types.ObjectId() },
    category: { _id: new Types.ObjectId(), code: 'LAB' },
    priceList: { _id: new Types.ObjectId() },
    serviceRate: {
      _id: new Types.ObjectId(),
      priceListVersionId: new Types.ObjectId(),
    },
    taxCategory: mode === 'EXEMPT'
      ? null
      : {
          _id: new Types.ObjectId(),
          code: 'GST15',
          calculationMode: mode,
          ratePercentage: decimal(ratePercentage),
          roundingScale: 2,
        },
    quantity: decimal(quantity),
    originalUnitPrice: decimal(unitPrice),
    authoritativeUnitPrice: decimal(unitPrice),
    resolutionReason: 'test',
  } as unknown as ResolvedPriceRecord;
}

function payer(): BillingPayerSnapshotRecord {
  return {
    sequence: 1,
    payerOrganizationId: new Types.ObjectId(),
    panelPlanId: new Types.ObjectId(),
    patientCoverageId: new Types.ObjectId(),
    payerNameSnapshot: 'Fictional Corporate Panel',
    planNameSnapshot: 'Standard Plan',
    membershipNumberSnapshot: 'MEM-001',
    authorizationReference: 'AUTH-001',
    coverageLimitSnapshot: null,
    copaySnapshot: decimal('20'),
    coinsurancePercentageSnapshot: decimal('10'),
    deductibleSnapshot: decimal('10'),
    coverageEffectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    coverageEffectiveThrough: new Date('2026-12-31T23:59:59.999Z'),
  };
}

describe('unified billing account, charge, and invoice foundations', () => {
  it('derives a stable deterministic key for the same source line', () => {
    const first = deriveBillingDeterministicChargeKey(source(null), 'LAB-CBC', null);
    const second = deriveBillingDeterministicChargeKey(source(null), 'lab-cbc', null);
    const differentLine = deriveBillingDeterministicChargeKey(
      source('64b000000000000000000007'),
      'LAB-CBC',
      null,
    );

    expect(first).toBe(second);
    expect(first).not.toBe(differentLine);
    expect(first).toHaveLength(64);
  });

  it('calculates tax-exclusive prices without floating-point arithmetic', () => {
    const money = calculateAuthoritativeChargeMoney(
      resolvedPrice('EXCLUSIVE', '100', '2', '15'),
      undefined,
    );

    expect(money.authoritativeUnitPrice.toFixed()).toBe('100');
    expect(money.grossAmount.toFixed()).toBe('200');
    expect(money.taxAmount.toFixed()).toBe('30');
    expect(money.netAmount.toFixed()).toBe('230');
    expect(money.patientAmount.toFixed()).toBe('230');
    expect(money.payerAmount.toFixed()).toBe('0');
  });

  it('backs tax out of a tax-inclusive authoritative price', () => {
    const money = calculateAuthoritativeChargeMoney(
      resolvedPrice('INCLUSIVE', '115', '2', '15'),
      undefined,
    );

    expect(money.authoritativeUnitPrice.toFixed()).toBe('100');
    expect(money.grossAmount.toFixed()).toBe('200');
    expect(money.taxAmount.toFixed()).toBe('30');
    expect(money.netAmount.toFixed()).toBe('230');
  });

  it('splits patient and payer responsibility using exact coverage snapshots', () => {
    const money = calculateAuthoritativeChargeMoney(
      resolvedPrice('EXCLUSIVE', '100', '2', '15'),
      payer(),
    );

    expect(money.netAmount.toFixed()).toBe('230');
    expect(money.patientAmount.toFixed()).toBe('47');
    expect(money.payerAmount.toFixed()).toBe('183');
    expect(
      money.patientAmount.plus(money.payerAmount).toFixed(),
    ).toBe(money.netAmount.toFixed());
  });
});