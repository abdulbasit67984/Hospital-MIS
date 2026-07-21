import mongoose from 'mongoose';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  collectionSpecs,
} from '../catalog/collection-specs.js';

import {
  AccountChargeModel,
  accountChargeSchema,
} from '../models/patient-account-charge.model.js';

import {
  FinancialApprovalRequestModel,
  InvoiceModel,
  invoiceSchema,
} from '../models/billing-invoice-adjustment.model.js';

import {
  FinancialLedgerTransactionModel,
  financialLedgerTransactionSchema,
} from '../models/financial-ledger.model.js';

import {
  chargeCatalogSchema,
} from '../models/charge-catalog.model.js';

import {
  priceListSchema,
  treatmentPackageSchema,
} from '../models/billing-pricing-package.model.js';

import {
  paymentSchema,
} from '../models/billing-payment.model.js';

import {
  schemaForCollection,
} from '../models/registry.js';

import {
  chargeCatalogUnifiedBillingFoundation,
  chargeCatalogUnifiedBillingFoundationCollections,
  chargeCatalogUnifiedBillingFoundationValidators,
} from '../migrations/029-charge-catalog-unified-billing-foundation.js';

import {
  migrations,
} from '../migrations/index.js';

function objectId(): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId();
}

function commonFields() {
  const actorId = objectId();

  return {
    facilityId: objectId(),
    transactionId: `tx-${objectId().toHexString()}`,
    correlationId: `corr-${objectId().toHexString()}`,
    schemaVersion: 1,
    version: 0,
    createdBy: actorId,
    updatedBy: actorId,
  };
}

function indexNames(
  schema: mongoose.Schema,
): string[] {
  return schema.indexes().flatMap(
    ([, options]) =>
      typeof options.name === 'string'
        ? [options.name]
        : [],
  );
}

function accountChargeInput() {
  const patientId = objectId();

  return {
    ...commonFields(),
    operationKey:
      'pharmacy-dispensation-charge-operation-0001',
    deterministicChargeKey:
      'PHARMACY_DISPENSING:DISPENSATION_ITEM:0001',
    patientAccountId: objectId(),
    patientId,
    registrationId: objectId(),
    opdVisitId: objectId(),
    encounterId: objectId(),
    admissionId: null,
    source: {
      sourceModule: 'PHARMACY_DISPENSING' as const,
      sourceRecordType: 'DISPENSATION_ITEM',
      sourceRecordId: objectId(),
      sourceLineId: objectId(),
      sourceOccurredAt: new Date(),
    },
    chargeCatalogItemId: objectId(),
    chargeCatalogVersionId: objectId(),
    serviceRateId: objectId(),
    priceListId: objectId(),
    priceListVersionId: objectId(),
    chargeCodeSnapshot: 'PHARMACY-MEDICINE',
    serviceCodeSnapshot: 'MED-001',
    chargeNameSnapshot: 'Dispensed medicine',
    categoryCodeSnapshot: 'PHARMACY',
    departmentId: objectId(),
    serviceLineCodeSnapshot: 'PHARMACY',
    revenueAccountCodeSnapshot: 'REV-PHARMACY',
    taxCategoryId: null,
    taxCategoryCodeSnapshot: null,
    unitOfMeasureId: objectId(),
    unitOfMeasureCodeSnapshot: 'TABLET',
    quantity: '2',
    originalUnitPrice: '50',
    authoritativeUnitPrice: '50',
    costAmountSnapshot: '35',
    currency: 'PKR',
    grossAmount: '100',
    discountAmount: '10',
    taxAmount: '5',
    welfareAmount: '0',
    payerAmount: '0',
    patientAmount: '95',
    netAmount: '95',
    status: 'PENDING' as const,
    packageEnrollmentId: null,
    treatmentPackageItemId: null,
    packageIncludedQuantity: '0',
    packageOverageQuantity: '0',
    payerOrganizationId: null,
    panelPlanId: null,
    patientCoverageId: null,
    preauthorizationId: null,
    authorizationReferenceSnapshot: null,
    excludedFromCoverage: false,
    coverageExclusionReason: null,
    originalChargeId: null,
    replacementChargeId: null,
    transferredFromAccountId: null,
    transferredToAccountId: null,
    approvalRequestIds: [],
    postedAt: null,
    postedBy: null,
    lifecycleReason: null,
    serviceFrom: new Date(),
    serviceThrough: null,
  };
}

describe('charge catalog and unified billing database foundation', () => {
  it('registers the billing migration after pharmacy dispensing', () => {
    expect(
      migrations.at(-1),
    ).toBe(chargeCatalogUnifiedBillingFoundation);
    expect(
      chargeCatalogUnifiedBillingFoundation.id,
    ).toBe(
      '029-charge-catalog-unified-billing-foundation',
    );
    expect(
      new Set(
        chargeCatalogUnifiedBillingFoundationCollections,
      ).size,
    ).toBe(
      chargeCatalogUnifiedBillingFoundationCollections.length,
    );
  });

  it('declares facility-scoped collection specifications and validators', () => {
    for (const name of
      chargeCatalogUnifiedBillingFoundationCollections) {
      const spec = collectionSpecs.find(
        (candidate) => candidate.name === name,
      );

      expect(spec).toBeDefined();
      expect(spec?.facilityScoped).toBe(true);
      expect(
        ['finance', 'payers'],
      ).toContain(spec?.domain);
      expect(
        chargeCatalogUnifiedBillingFoundationValidators[
          name
        ]['$jsonSchema'],
      ).toBeDefined();
    }
  });

  it('uses explicit schemas instead of generic fallback schemas', () => {
    expect(
      schemaForCollection('chargeCatalog'),
    ).toBe(chargeCatalogSchema);
    expect(
      schemaForCollection('priceLists'),
    ).toBe(priceListSchema);
    expect(
      schemaForCollection('treatmentPackages'),
    ).toBe(treatmentPackageSchema);
    expect(
      schemaForCollection('accountCharges'),
    ).toBe(accountChargeSchema);
    expect(
      schemaForCollection('invoices'),
    ).toBe(invoiceSchema);
    expect(
      schemaForCollection('payments'),
    ).toBe(paymentSchema);
    expect(
      schemaForCollection(
        'financialLedgerTransactions',
      ),
    ).toBe(financialLedgerTransactionSchema);
  });

  it('defines deterministic idempotency and facility indexes', () => {
    expect(indexNames(accountChargeSchema)).toEqual(
      expect.arrayContaining([
        'uq_account_charges_operation',
        'uq_account_charges_deterministic_key',
        'ix_account_charges_source',
      ]),
    );
    expect(indexNames(invoiceSchema)).toContain(
      'uq_invoices_facility_number',
    );
    expect(indexNames(paymentSchema)).toEqual(
      expect.arrayContaining([
        'uq_payments_operation',
        'uq_payments_facility_receipt',
      ]),
    );
  });

  it('accepts an exactly reconciled Decimal128 charge snapshot', async () => {
    const charge = new AccountChargeModel(
      accountChargeInput(),
    );

    await expect(charge.validate()).resolves.toBeUndefined();
    expect(charge.grossAmount.toString()).toBe('100');
    expect(charge.netAmount.toString()).toBe('95');
  });

  it('rejects floating-point-style client total disagreement', async () => {
    const charge = new AccountChargeModel({
      ...accountChargeInput(),
      grossAmount: '99.99999999999999',
    });

    await expect(charge.validate()).rejects.toThrow(
      /grossAmount must equal quantity multiplied by authoritativeUnitPrice/u,
    );
  });

  it('rejects an unbalanced operational ledger transaction', async () => {
    const ledgerTransaction =
      new FinancialLedgerTransactionModel({
        ...commonFields(),
        operationKey: 'ledger-operation-0001',
        journalNumber: 'JRN-2026-000001',
        sourceModule: 'UNIFIED_BILLING',
        sourceEntityType: 'INVOICE',
        sourceEntityId: objectId(),
        patientId: objectId(),
        patientAccountId: objectId(),
        invoiceId: objectId(),
        paymentId: null,
        cashShiftId: null,
        cashCounterId: null,
        currency: 'PKR',
        totalDebit: '100',
        totalCredit: '99.99',
        entryCount: 2,
        status: 'POSTED',
        postedAt: new Date(),
        postedBy: objectId(),
        description:
          'Invoice posting operational subledger entry',
        reversalOfTransactionId: null,
        reversedByTransactionId: null,
        reversalReason: null,
        closedPeriodCode: null,
      });

    await expect(
      ledgerTransaction.validate(),
    ).rejects.toThrow(
      /must balance debits and credits exactly/u,
    );
  });

  it('requires immutable finalization attribution for finalized invoices', async () => {
    const invoice = new InvoiceModel({
      ...commonFields(),
      invoiceNumber: 'INV-2026-000001',
      patientAccountId: objectId(),
      patientId: objectId(),
      invoiceType: 'OUTPATIENT',
      currency: 'PKR',
      status: 'FINALIZED',
      lineCount: 1,
      grossAmount: '100',
      discountAmount: '0',
      taxAmount: '0',
      welfareAmount: '0',
      payerAmount: '0',
      patientAmount: '100',
      netAmount: '100',
      paymentsAppliedAmount: '0',
      creditsAppliedAmount: '0',
      outstandingAmount: '100',
      refundableAmount: '0',
      issuedAt: new Date(),
      finalizedAt: null,
      finalizedBy: null,
      lockedAccountVersion: null,
      cancelledAt: null,
      cancelledBy: null,
      cancellationReason: null,
      originalInvoiceId: null,
      replacementInvoiceId: null,
      taxSummary: [],
      discountIds: [],
      creditNoteIds: [],
      debitNoteIds: [],
      printableSnapshotVersion: 1,
    });

    await expect(invoice.validate()).rejects.toThrow(
      /require issue, finalization, and account-lock attribution/u,
    );
  });

  it('enforces maker-checker separation for sensitive approvals', async () => {
    const actorId = objectId();
    const request = new FinancialApprovalRequestModel({
      ...commonFields(),
      requestNumber: 'APR-2026-000001',
      operationKey: 'approval-operation-0001',
      approvalType: 'WRITE_OFF',
      entityType: 'PATIENT_ACCOUNT',
      entityId: objectId(),
      patientAccountId: objectId(),
      amount: '500',
      thresholdAmountSnapshot: '100',
      requestedBy: actorId,
      requestedAt: new Date(),
      reason: 'Approved financial hardship write-off request',
      status: 'APPROVED',
      decidedBy: actorId,
      decidedAt: new Date(),
      decisionReason: 'Approving requested write-off',
      expiresAt: null,
      makerCheckerSatisfied: true,
    });

    await expect(request.validate()).rejects.toThrow(
      /require an independent checker/u,
    );
  });
});