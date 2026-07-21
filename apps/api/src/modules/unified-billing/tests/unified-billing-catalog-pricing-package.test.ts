import Decimal from 'decimal.js';
import {
  Types,
} from 'mongoose';
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  ServiceRateModel,
  TreatmentPackageModel,
} from '@hospital-mis/database';

import {
  BillingChargeRuleViolationError,
  BillingNoEffectivePriceError,
} from '../unified-billing.errors.js';

import type {
  ChargeCatalogRecord,
  ChargeCatalogVersionRecord,
  ChargeCategoryRecord,
  PriceListRecord,
  ServiceRateRecord,
  TaxCategoryRecord,
} from '../unified-billing.persistence.types.js';

import {
  allocatePackageAmounts,
  deriveTreatmentPackageType,
  pricingSpecificityScore,
} from '../unified-billing.normalization.js';

import {
  UnifiedBillingPackageService,
  type UnifiedBillingPackageServiceDependencies,
} from '../services/unified-billing-package.service.js';

import {
  UnifiedBillingPricingService,
  type UnifiedBillingPricingServiceDependencies,
} from '../services/unified-billing-pricing.service.js';

const facilityId = new Types.ObjectId();
const actorUserId = new Types.ObjectId();
const categoryId = new Types.ObjectId();
const catalogId = new Types.ObjectId();
const catalogVersionId = new Types.ObjectId();
const cashPriceListId = new Types.ObjectId();
const payerPriceListId = new Types.ObjectId();
const cashRateId = new Types.ObjectId();
const payerRateId = new Types.ObjectId();
const taxCategoryId = new Types.ObjectId();
const now = new Date('2026-07-21T08:00:00.000Z');

function metadata() {
  return {
    facilityId,
    transactionId: 'tx-1',
    correlationId: 'corr-1',
    version: 0,
    createdBy: actorUserId,
    updatedBy: actorUserId,
    createdAt: now,
    updatedAt: now,
  };
}

function category(): ChargeCategoryRecord {
  return {
    _id: categoryId,
    ...metadata(),
    code: 'LAB',
    parentCategoryId: null,
    name: 'Laboratory',
    description: null,
    clinical: true,
    departmentId: null,
    serviceLineCode: 'LAB',
    revenueAccountCode: 'REV-LAB',
    status: 'ACTIVE',
    activatedAt: now,
    activatedBy: actorUserId,
    deactivatedAt: null,
    deactivatedBy: null,
    deactivationReason: null,
  };
}

function catalog(): ChargeCatalogRecord {
  return {
    _id: catalogId,
    ...metadata(),
    chargeCode: 'LAB-CBC',
    serviceCode: 'CBC',
    name: 'Complete blood count',
    description: null,
    categoryId,
    chargeType: 'LABORATORY',
    clinical: true,
    departmentId: null,
    serviceLineCode: 'LAB',
    revenueAccountCode: 'REV-LAB',
    ledgerAccountId: null,
    taxCategoryId,
    unitOfMeasureId: null,
    defaultQuantity: Types.Decimal128.fromString('1'),
    minimumQuantity: Types.Decimal128.fromString('1'),
    maximumQuantity: Types.Decimal128.fromString('5'),
    minimumPrice: Types.Decimal128.fromString('100'),
    maximumPrice: Types.Decimal128.fromString('1000'),
    costAmount: Types.Decimal128.fromString('75'),
    manualPostingAllowed: false,
    recurringChargeAllowed: false,
    timeBasedCharge: false,
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveThrough: null,
    status: 'ACTIVE',
    currentVersion: 1,
    latestVersionId: catalogVersionId,
    activatedAt: now,
    activatedBy: actorUserId,
    deactivatedAt: null,
    deactivatedBy: null,
    deactivationReason: null,
    retiredAt: null,
    retiredBy: null,
    retirementReason: null,
  };
}

function catalogVersion(): ChargeCatalogVersionRecord {
  const source = catalog();
  const {
    status: _status,
    currentVersion: _currentVersion,
    latestVersionId: _latestVersionId,
    activatedAt: _activatedAt,
    activatedBy: _activatedBy,
    deactivatedAt: _deactivatedAt,
    deactivatedBy: _deactivatedBy,
    deactivationReason: _deactivationReason,
    retiredAt: _retiredAt,
    retiredBy: _retiredBy,
    retirementReason: _retirementReason,
    ...snapshot
  } = source;

  return {
    ...snapshot,
    _id: catalogVersionId,
    chargeCatalogItemId: catalogId,
    versionNumber: 1,
    statusSnapshot: 'ACTIVE',
    changeReason: 'Initial active version',
    recordedAt: now,
    recordedBy: actorUserId,
  };
}

function priceList(
  id: Types.ObjectId,
  code: string,
  payerOrganizationId: Types.ObjectId | null,
  priority: number,
): PriceListRecord {
  return {
    _id: id,
    ...metadata(),
    code,
    name: code,
    description: null,
    priceListType: payerOrganizationId === null ? 'CASH' : 'PAYER',
    currency: 'PKR',
    patientCategoryCode: null,
    payerCategoryCode: null,
    payerOrganizationId,
    panelPlanId: null,
    departmentId: null,
    locationId: null,
    billingContext: 'OUTPATIENT',
    afterHoursOnly: false,
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveThrough: null,
    status: 'ACTIVE',
    priority,
    currentVersion: 1,
    latestVersionId: new Types.ObjectId(),
    activatedAt: now,
    activatedBy: actorUserId,
    retiredAt: null,
    retiredBy: null,
    retirementReason: null,
  };
}

function rate(
  id: Types.ObjectId,
  code: string,
  list: PriceListRecord,
  amount: string,
): ServiceRateRecord {
  return {
    _id: id,
    ...metadata(),
    rateCode: code,
    chargeCatalogItemId: catalogId,
    chargeCatalogVersionId: catalogVersionId,
    priceListId: list._id,
    priceListVersionId: list.latestVersionId!,
    amount: Types.Decimal128.fromString(amount),
    minimumAmount: null,
    maximumAmount: null,
    currency: 'PKR',
    taxCategoryId,
    billingContext: 'OUTPATIENT',
    patientCategoryCode: null,
    payerCategoryCode: null,
    payerOrganizationId: list.payerOrganizationId,
    panelPlanId: null,
    departmentId: null,
    locationId: null,
    contractReference: list.payerOrganizationId === null ? null : 'PANEL-A',
    afterHoursOnly: false,
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveThrough: null,
    status: 'ACTIVE',
    changeReason: 'Configured price',
    supersedesRateId: null,
  };
}

function tax(): TaxCategoryRecord {
  return {
    _id: taxCategoryId,
    ...metadata(),
    code: 'GST-0',
    name: 'Exempt',
    calculationMode: 'EXEMPT',
    ratePercentage: Types.Decimal128.fromString('0'),
    roundingMode: 'HALF_UP',
    roundingScale: 2,
    exemptionReasonRequired: false,
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveThrough: null,
    active: true,
  };
}

describe('unified billing catalog, pricing, and package foundation', () => {
  it('keeps required immutable pricing and package schema fields', () => {
    expect(ServiceRateModel.schema.path('changeReason')).toBeDefined();
    expect(ServiceRateModel.schema.path('supersedesRateId')).toBeDefined();
    expect(TreatmentPackageModel.schema.path('priceListId')).toBeDefined();
  });

  it('scores exact payer pricing above wildcard pricing', () => {
    const payerId = new Types.ObjectId().toHexString();
    const request = {
      payerOrganizationId: payerId,
      panelPlanId: null,
      patientCategoryCode: null,
      payerCategoryCode: null,
      departmentId: null,
      locationId: null,
      billingContext: 'OUTPATIENT',
      afterHours: false,
    };
    const fallback = pricingSpecificityScore({
      payerOrganizationId: null,
      panelPlanId: null,
      patientCategoryCode: null,
      payerCategoryCode: null,
      departmentId: null,
      locationId: null,
      billingContext: 'OUTPATIENT',
      afterHoursOnly: false,
    }, request);
    const exact = pricingSpecificityScore({
      payerOrganizationId: payerId,
      panelPlanId: null,
      patientCategoryCode: null,
      payerCategoryCode: null,
      departmentId: null,
      locationId: null,
      billingContext: 'OUTPATIENT',
      afterHoursOnly: false,
    }, request);

    expect(exact).not.toBeNull();
    expect(fallback).not.toBeNull();
    expect(exact!).toBeGreaterThan(fallback!);
  });

  it('allocates a fixed package price without decimal drift', () => {
    const allocations = allocatePackageAmounts('1000', [
      { weight: '1' },
      { weight: '2' },
      { weight: '3' },
    ]);
    const total = allocations.reduce(
      (sum, value) => sum.plus(value),
      new Decimal(0),
    );

    expect(total.toFixed()).toBe('1000');
    expect(allocations).toHaveLength(3);
  });

  it('rejects conflicting specialized package types', () => {
    expect(() => deriveTreatmentPackageType({
      admissionPackage: true,
      surgicalPackage: true,
    })).toThrow(BillingChargeRuleViolationError);
  });

  it('selects the more specific payer rate and enforces catalog price limits', async () => {
    const payerId = new Types.ObjectId();
    const cashList = priceList(cashPriceListId, 'CASH', null, 100);
    const payerList = priceList(payerPriceListId, 'PAYER-A', payerId, 10);
    const dependencies = {
      catalog: {
        findCatalogItemByCode: vi.fn().mockResolvedValue(catalog()),
        findCatalogVersion: vi.fn().mockResolvedValue(catalogVersion()),
        findCategory: vi.fn().mockResolvedValue(category()),
      },
      pricing: {
        listEffectiveRateCandidates: vi.fn().mockResolvedValue([
          { priceList: cashList, serviceRate: rate(cashRateId, 'CBC-CASH', cashList, '500') },
          { priceList: payerList, serviceRate: rate(payerRateId, 'CBC-PANEL', payerList, '50') },
        ]),
        findTaxCategory: vi.fn().mockResolvedValue(tax()),
      },
    } as unknown as UnifiedBillingPricingServiceDependencies;
    const service = new UnifiedBillingPricingService(dependencies);
    const resolved = await service.resolve({
      facilityId: facilityId.toHexString(),
      chargeCode: 'LAB-CBC',
      quantity: '1',
      at: now,
      billingContext: 'OUTPATIENT',
      patientId: new Types.ObjectId().toHexString(),
      departmentId: null,
      locationId: null,
      payerOrganizationId: payerId.toHexString(),
      panelPlanId: null,
      afterHours: false,
      includeCost: false,
    });

    expect(resolved.serviceRate._id.equals(payerRateId)).toBe(true);
    expect(resolved.originalUnitPrice.toString()).toBe('50');
    expect(resolved.authoritativeUnitPrice.toString()).toBe('100');
  });

  it('fails when no effective candidate matches the authoritative context', async () => {
    const dependencies = {
      catalog: {
        findCatalogItemByCode: vi.fn().mockResolvedValue(catalog()),
        findCatalogVersion: vi.fn().mockResolvedValue(catalogVersion()),
        findCategory: vi.fn().mockResolvedValue(category()),
      },
      pricing: {
        listEffectiveRateCandidates: vi.fn().mockResolvedValue([]),
      },
    } as unknown as UnifiedBillingPricingServiceDependencies;
    const service = new UnifiedBillingPricingService(dependencies);

    await expect(service.resolve({
      facilityId: facilityId.toHexString(),
      chargeCode: 'LAB-CBC',
      quantity: '1',
      at: now,
      billingContext: 'OUTPATIENT',
      patientId: new Types.ObjectId().toHexString(),
      departmentId: null,
      locationId: null,
      afterHours: false,
      includeCost: false,
    })).rejects.toBeInstanceOf(BillingNoEffectivePriceError);
  });

  it('rejects duplicate package components before persistence', async () => {
    const dependencies = {
      accessPolicy: {
        authorize: vi.fn().mockResolvedValue({ allowed: true }),
      },
      context: {
        requireActiveActorStaff: vi.fn().mockResolvedValue({
          staffId: new Types.ObjectId().toHexString(),
        }),
      },
    } as unknown as UnifiedBillingPackageServiceDependencies;
    const service = new UnifiedBillingPackageService(dependencies);
    const chargeId = new Types.ObjectId().toHexString();

    await expect(service.createPackage({
      actor: {
        userId: actorUserId.toHexString(),
        facilityId: facilityId.toHexString(),
        correlationId: 'corr-1',
        roleKeys: ['BILLING_OFFICER'],
        permissionKeys: ['billing.packages.manage'],
      },
      idempotencyKey: 'package-create-duplicate-components',
    }, {
      packageCode: 'PKG-1',
      name: 'Package',
      priceListId: cashPriceListId.toHexString(),
      fixedPrice: '1000',
      validityDays: 5,
      effectiveFrom: now.toISOString(),
      items: [
        { chargeCatalogItemId: chargeId, includedQuantity: '1', sequence: 1 },
        { chargeCatalogItemId: chargeId, includedQuantity: '2', sequence: 2 },
      ],
    })).rejects.toBeInstanceOf(BillingChargeRuleViolationError);
  });
});