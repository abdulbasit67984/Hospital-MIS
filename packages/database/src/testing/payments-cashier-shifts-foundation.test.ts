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
  CashCounterModel,
  cashCounterSchema,
  PaymentMethodConfigurationModel,
  paymentMethodConfigurationSchema,
} from '../models/payment-configuration.model.js';

import {
  CashShiftModel,
  cashShiftSchema,
  ShiftReconciliationModel,
  shiftReconciliationSchema,
} from '../models/cashier-shift.model.js';

import {
  PaymentReceiptModel,
  paymentReceiptSchema,
  receiptReprintSchema,
} from '../models/payment-receipt.model.js';

import {
  CashMovementModel,
  cashMovementSchema,
} from '../models/cash-movement.model.js';

import {
  depositApplicationSchema,
  depositTransferSchema,
} from '../models/deposit-operation.model.js';

import {
  paymentOperationalHistorySchema,
} from '../models/payment-operational-history.model.js';

import {
  schemaForCollection,
} from '../models/registry.js';

import {
  paymentsCashierShiftsFoundation,
  paymentsCashierShiftsFoundationCollections,
  paymentsCashierShiftsFoundationValidators,
} from '../migrations/030-payments-cashier-shifts-foundation.js';

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

function paymentMethodInput() {
  return {
    ...commonFields(),
    code: 'cash-main',
    name: 'Cash',
    description: 'Cash collection in PKR',
    methodCode: 'CASH' as const,
    methodKind: 'CASH' as const,
    active: true,
    effectiveFrom: new Date(
      '2026-01-01T00:00:00.000Z',
    ),
    effectiveThrough: null,
    allowedCurrencies: ['PKR'],
    externalReferenceRequired: false,
    bankReferenceRequired: false,
    cardReferenceRequired: false,
    cashEquivalent: true,
    refundEligible: true,
    reversalEligible: true,
    settlementMode: 'IMMEDIATE' as const,
    settlementDelayHours: null,
    permissionCodes: ['payments.collect.cash'],
    cashLedgerAccountId: objectId(),
    clearingLedgerAccountId: null,
    receivableLedgerAccountId: null,
    externalProviderCode: null,
    requiresOpenCashierShift: true,
    deactivatedAt: null,
    deactivatedBy: null,
    deactivationReason: null,
  };
}

function counterInput(
  paymentMethodConfigurationId = objectId(),
) {
  return {
    ...commonFields(),
    counterCode: 'billing-01',
    name: 'Main Billing Counter',
    location: 'Ground Floor',
    departmentId: objectId(),
    counterType: 'BILLING' as const,
    active: true,
    assignedUserIds: [objectId()],
    allowedPaymentMethodConfigurationIds: [
      paymentMethodConfigurationId,
    ],
    currency: 'PKR',
    cashHoldingLimit: '500000',
    openingFloatRequired: true,
    minimumOpeningFloat: '1000',
    maximumOpeningFloat: '10000',
    activeShiftPolicy:
      'CASHIER_AND_COUNTER' as const,
    supervisorApprovalRequiredForClose: true,
    negativeExpectedCashAllowed: false,
    deactivatedAt: null,
    deactivatedBy: null,
    deactivationReason: null,
  };
}

function shiftInput() {
  return {
    ...commonFields(),
    operationKey: 'open-shift-operation-0001',
    shiftNumber: 'shift-2026-000001',
    cashCounterId: objectId(),
    cashierUserId: objectId(),
    cashierStaffId: objectId(),
    supervisorUserId: objectId(),
    currency: 'PKR',
    status: 'OPEN' as const,
    openedAt: new Date(
      '2026-07-21T08:00:00.000Z',
    ),
    openingFloat: '5000',
    suspendedAt: null,
    suspendedBy: null,
    suspensionReason: null,
    closingStartedAt: null,
    closingStartedBy: null,
    closedAt: null,
    closedBy: null,
    expectedCash: '5000',
    declaredCash: '5000',
    cashVariance: '0',
    nonCashTotal: '0',
    paymentMethodTotals: [],
    refundTotal: '0',
    reversalTotal: '0',
    depositTotal: '0',
    advanceTotal: '0',
    firstReceiptNumber: null,
    lastReceiptNumber: null,
    receiptCount: 0,
    paymentCount: 0,
    notes: null,
    handoverToUserId: null,
    handoverAt: null,
    handoverNotes: null,
    shiftReconciliationId: null,
    closingApprovalRequestId: null,
    varianceApprovalRequestId: null,
    reopenedFromShiftId: null,
    reopenApprovalRequestId: null,
    reopenReason: null,
  };
}

function reconciliationInput() {
  return {
    ...commonFields(),
    operationKey: 'reconcile-shift-operation-0001',
    reconciliationNumber: 'rec-2026-000001',
    cashShiftId: objectId(),
    cashCounterId: objectId(),
    cashierUserId: objectId(),
    status: 'DRAFT' as const,
    currency: 'PKR',
    calculatedAt: new Date(
      '2026-07-21T16:00:00.000Z',
    ),
    calculatedBy: objectId(),
    openingFloat: '5000',
    cashCollections: '20000',
    cashRefunds: '1000',
    cashPaidOut: '500',
    cashDrops: '3000',
    safeDeposits: '10000',
    cashTransfersIn: '2000',
    cashTransfersOut: '1000',
    expectedClosingCash: '11500',
    declaredClosingCash: '11400',
    cashVariance: '-100',
    nonCashTotal: '15000',
    paymentMethodTotals: [],
    paymentCount: 20,
    receiptCount: 20,
    failedPaymentCount: 0,
    unallocatedPaymentCount: 0,
    unresolvedRefundCount: 0,
    incompleteJournalCount: 0,
    blockingIssueCodes: [],
    varianceReason: 'Cash count is short by PKR 100',
    overrideReason: null,
    overrideApprovalRequestId: null,
    varianceApprovalRequestId: null,
    approvedAt: null,
    approvedBy: null,
    closedAt: null,
    snapshotHash: 'a'.repeat(64),
  };
}

describe(
  'payments and cashier shifts database foundation',
  () => {
    it('registers migration 030 after unified billing', () => {
      expect(migrations.at(-1)).toBe(
        paymentsCashierShiftsFoundation,
      );
      expect(
        paymentsCashierShiftsFoundation.id,
      ).toBe(
        '030-payments-cashier-shifts-foundation',
      );
    });

    it('declares facility-scoped finance collections and validators', () => {
      expect(
        new Set(
          paymentsCashierShiftsFoundationCollections,
        ).size,
      ).toBe(
        paymentsCashierShiftsFoundationCollections.length,
      );

      for (const name of
        paymentsCashierShiftsFoundationCollections) {
        const spec = collectionSpecs.find(
          (candidate) => candidate.name === name,
        );

        expect(spec).toBeDefined();
        expect(spec?.domain).toBe('finance');
        expect(spec?.facilityScoped).toBe(true);
        expect(
          paymentsCashierShiftsFoundationValidators[
            name
          ]['$jsonSchema'],
        ).toBeDefined();
      }
    });

    it('registers explicit schemas for every new collection', () => {
      expect(
        schemaForCollection(
          'paymentMethodConfigurations',
        ),
      ).toBe(paymentMethodConfigurationSchema);
      expect(
        schemaForCollection('cashCounters'),
      ).toBe(cashCounterSchema);
      expect(
        schemaForCollection('cashShifts'),
      ).toBe(cashShiftSchema);
      expect(
        schemaForCollection(
          'shiftReconciliations',
        ),
      ).toBe(shiftReconciliationSchema);
      expect(
        schemaForCollection('paymentReceipts'),
      ).toBe(paymentReceiptSchema);
      expect(
        schemaForCollection('receiptReprints'),
      ).toBe(receiptReprintSchema);
      expect(
        schemaForCollection('depositApplications'),
      ).toBe(depositApplicationSchema);
      expect(
        schemaForCollection('depositTransfers'),
      ).toBe(depositTransferSchema);
      expect(
        schemaForCollection('cashMovements'),
      ).toBe(cashMovementSchema);
      expect(
        schemaForCollection(
          'paymentOperationalHistories',
        ),
      ).toBe(paymentOperationalHistorySchema);
    });

    it('defines concurrency and facility indexes', () => {
      expect(
        indexNames(paymentMethodConfigurationSchema),
      ).toContain(
        'uq_payment_method_configurations_code',
      );
      expect(indexNames(cashCounterSchema)).toContain(
        'uq_cash_counters_code',
      );
      expect(indexNames(cashShiftSchema)).toEqual(
        expect.arrayContaining([
          'uq_cash_shifts_operation',
          'uq_cash_shifts_number',
          'uq_cash_shifts_active_counter_cashier',
        ]),
      );
      expect(
        indexNames(paymentReceiptSchema),
      ).toEqual(
        expect.arrayContaining([
          'uq_payment_receipts_operation',
          'uq_payment_receipts_number',
          'uq_payment_receipts_payment',
        ]),
      );
    });

    it('accepts valid payment-method and counter configuration', async () => {
      const method =
        new PaymentMethodConfigurationModel(
          paymentMethodInput(),
        );
      await expect(
        method.validate(),
      ).resolves.toBeUndefined();
      expect(method.code).toBe('CASH-MAIN');

      const counter = new CashCounterModel(
        counterInput(method._id),
      );
      await expect(
        counter.validate(),
      ).resolves.toBeUndefined();
      expect(counter.counterCode).toBe(
        'BILLING-01',
      );
    });

    it('rejects delayed settlement without a delay', async () => {
      const method =
        new PaymentMethodConfigurationModel({
          ...paymentMethodInput(),
          methodCode: 'BANK_TRANSFER',
          methodKind: 'BANK',
          cashEquivalent: false,
          settlementMode: 'DELAYED',
          settlementDelayHours: null,
        });

      await expect(method.validate()).rejects.toThrow(
        'Delayed payment methods require a settlement delay',
      );
    });

    it('accepts an exactly reconciled opening shift', async () => {
      const shift = new CashShiftModel(
        shiftInput(),
      );

      await expect(
        shift.validate(),
      ).resolves.toBeUndefined();
      expect(shift.openingFloat.toString()).toBe(
        '5000',
      );
    });

    it('rejects client-supplied shift variance disagreement', async () => {
      const shift = new CashShiftModel({
        ...shiftInput(),
        declaredCash: '4999.99',
        cashVariance: '0',
      });

      await expect(shift.validate()).rejects.toThrow(
        'Declared cash must equal expected cash plus cash variance',
      );
    });

    it('calculates reconciliation through exact decimal identities', async () => {
      const reconciliation =
        new ShiftReconciliationModel(
          reconciliationInput(),
        );

      await expect(
        reconciliation.validate(),
      ).resolves.toBeUndefined();
      expect(
        reconciliation.cashVariance.toString(),
      ).toBe('-100');
    });

    it('rejects an unreconciled expected cash total', async () => {
      const reconciliation =
        new ShiftReconciliationModel({
          ...reconciliationInput(),
          expectedClosingCash: '11500.01',
        });

      await expect(
        reconciliation.validate(),
      ).rejects.toThrow(
        'Expected cash must reconcile opening float',
      );
    });

    it('rejects maker-checker violation for cash movements', async () => {
      const maker = objectId();
      const movement = new CashMovementModel({
        ...commonFields(),
        operationKey: 'cash-drop-operation-0001',
        movementNumber: 'mov-2026-000001',
        movementType: 'CASH_DROP',
        status: 'APPROVED',
        amount: '1000',
        currency: 'PKR',
        sourceCounterId: objectId(),
        sourceShiftId: objectId(),
        destinationCounterId: null,
        destinationShiftId: null,
        destinationSafeReference: null,
        sourceDocumentType:
          'SHIFT_RECONCILIATION',
        sourceDocumentId: objectId(),
        reasonCode: 'CASH_HOLDING_LIMIT',
        reason:
          'Cash drop required by holding limit',
        requestedBy: maker,
        requestedAt: new Date(),
        approvalRequestId: objectId(),
        approvedBy: maker,
        approvedAt: new Date(),
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
        postedBy: null,
        postedAt: null,
        financialLedgerTransactionId: null,
        expectedCashEffect: '-1000',
        reversalOfCashMovementId: null,
        reversedByCashMovementId: null,
        reversalReason: null,
      });

      await expect(
        movement.validate(),
      ).rejects.toThrow(
        'Cash-movement maker cannot approve the same movement',
      );
    });

    it('accepts a balanced immutable receipt projection', async () => {
      const paymentMethodConfigurationId =
        objectId();
      const allocationId = objectId();
      const invoiceId = objectId();

      const receipt = new PaymentReceiptModel({
        ...commonFields(),
        operationKey: 'receipt-operation-0001',
        receiptNumber: 'rcp-2026-000001',
        paymentId: objectId(),
        paymentIntentId: objectId(),
        patientId: objectId(),
        patientAccountId: objectId(),
        invoiceIds: [invoiceId],
        cashCounterId: objectId(),
        cashShiftId: objectId(),
        cashierUserId: objectId(),
        cashierStaffId: objectId(),
        issuedAt: new Date(),
        currency: 'PKR',
        totalAmount: '1000',
        allocatedAmount: '800',
        unallocatedAmount: '200',
        paymentMethodSummaries: [
          {
            paymentMethodConfigurationId,
            paymentMethodCodeSnapshot: 'CASH',
            amount: '1000',
            externalReferenceMasked: null,
          },
        ],
        allocationSummaries: [
          {
            paymentAllocationId: allocationId,
            invoiceId,
            accountChargeId: null,
            amount: '800',
          },
        ],
        payerDisplayName: 'Fictional Patient',
        responsiblePartyType: 'PATIENT',
        status: 'ISSUED',
        originalReceiptId: null,
        replacementReceiptId: null,
        refundId: null,
        paymentReversalId: null,
        statusChangedAt: null,
        statusChangedBy: null,
        statusReason: null,
        printableProjectionVersion: 1,
        printableProjectionHash: 'b'.repeat(64),
      });

      await expect(
        receipt.validate(),
      ).resolves.toBeUndefined();
      expect(receipt.totalAmount.toString()).toBe(
        '1000',
      );
    });
  },
);