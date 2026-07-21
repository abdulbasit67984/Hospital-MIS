import type {
  Db,
  IndexDescription,
} from 'mongodb';

import {
  collectionSpecs,
  type CollectionRetention,
  type HospitalCollectionName,
} from '../catalog/collection-specs.js';

import {
  CashCounterModel,
  PaymentMethodConfigurationModel,
} from '../models/payment-configuration.model.js';

import {
  CashShiftModel,
  ShiftReconciliationModel,
} from '../models/cashier-shift.model.js';

import {
  PaymentReceiptModel,
  ReceiptReprintModel,
} from '../models/payment-receipt.model.js';

import {
  DepositApplicationModel,
  DepositTransferModel,
} from '../models/deposit-operation.model.js';

import {
  CashMovementModel,
} from '../models/cash-movement.model.js';

import {
  PaymentOperationalHistoryModel,
} from '../models/payment-operational-history.model.js';

import {
  activeShiftPolicyValues,
  cashCounterTypeValues,
  cashierShiftStatusValues,
  cashMovementStatusValues,
  cashMovementTypeValues,
  paymentMethodCodeValues,
  paymentMethodKindValues,
  paymentOperationalActionValues,
  paymentOperationalEntityTypeValues,
  paymentReceiptStatusValues,
  paymentSettlementModeValues,
  receiptCopyTypeValues,
  shiftReconciliationStatusValues,
} from '../models/payment-cashier.types.js';

import type {
  Migration,
} from './types.js';

export const paymentsCashierShiftsFoundationCollections = [
  'paymentMethodConfigurations',
  'cashCounters',
  'cashShifts',
  'shiftReconciliations',
  'paymentReceipts',
  'receiptReprints',
  'depositApplications',
  'depositTransfers',
  'cashMovements',
  'paymentOperationalHistories',
] as const satisfies readonly HospitalCollectionName[];

type PaymentsCashierCollection =
  (typeof paymentsCashierShiftsFoundationCollections)[number];

const objectId = { bsonType: 'objectId' } as const;
const nullableObjectId = {
  bsonType: ['objectId', 'null'],
} as const;
const string = { bsonType: 'string' } as const;
const nullableString = {
  bsonType: ['string', 'null'],
} as const;
const date = { bsonType: 'date' } as const;
const nullableDate = {
  bsonType: ['date', 'null'],
} as const;
const number = { bsonType: 'number' } as const;
const boolean = { bsonType: 'bool' } as const;
const decimal = { bsonType: 'decimal' } as const;
const nullableDecimal = {
  bsonType: ['decimal', 'null'],
} as const;
const objectIdArray = {
  bsonType: 'array',
  items: objectId,
} as const;
const stringArray = {
  bsonType: 'array',
  items: string,
} as const;

const commonProperties = {
  facilityId: objectId,
  transactionId: string,
  correlationId: string,
  schemaVersion: {
    ...number,
    minimum: 1,
  },
  version: {
    ...number,
    minimum: 0,
  },
  createdBy: objectId,
  updatedBy: objectId,
  createdAt: date,
  updatedAt: date,
} as const;

const commonRequired = [
  'facilityId',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
] as const;

function enumString(
  values: readonly string[],
): Record<string, unknown> {
  return {
    ...string,
    enum: [...values],
  };
}

function validator(
  required: readonly string[],
  properties: Record<string, unknown>,
): Record<string, unknown> {
  return {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        ...commonRequired,
        ...required,
      ],
      properties: {
        _id: objectId,
        ...commonProperties,
        ...properties,
      },
    },
  };
}

const paymentMethodTotals = {
  bsonType: 'array',
  items: {
    bsonType: 'object',
    required: [
      'paymentMethodConfigurationId',
      'paymentMethodCodeSnapshot',
      'collectedAmount',
      'refundedAmount',
      'reversedAmount',
      'netAmount',
      'transactionCount',
    ],
    properties: {
      paymentMethodConfigurationId: objectId,
      paymentMethodCodeSnapshot: string,
      collectedAmount: decimal,
      refundedAmount: decimal,
      reversedAmount: decimal,
      netAmount: decimal,
      transactionCount: number,
    },
  },
} as const;

export const paymentsCashierShiftsFoundationValidators:
Readonly<
  Record<
    PaymentsCashierCollection,
    Record<string, unknown>
  >
> = {
  paymentMethodConfigurations: validator(
    [
      'code',
      'name',
      'methodCode',
      'methodKind',
      'active',
      'effectiveFrom',
      'allowedCurrencies',
      'externalReferenceRequired',
      'bankReferenceRequired',
      'cardReferenceRequired',
      'cashEquivalent',
      'refundEligible',
      'reversalEligible',
      'settlementMode',
      'permissionCodes',
      'requiresOpenCashierShift',
    ],
    {
      code: string,
      name: string,
      description: nullableString,
      methodCode: enumString(paymentMethodCodeValues),
      methodKind: enumString(paymentMethodKindValues),
      active: boolean,
      effectiveFrom: date,
      effectiveThrough: nullableDate,
      allowedCurrencies: stringArray,
      externalReferenceRequired: boolean,
      bankReferenceRequired: boolean,
      cardReferenceRequired: boolean,
      cashEquivalent: boolean,
      refundEligible: boolean,
      reversalEligible: boolean,
      settlementMode: enumString(
        paymentSettlementModeValues,
      ),
      settlementDelayHours: {
        bsonType: ['number', 'null'],
      },
      permissionCodes: stringArray,
      cashLedgerAccountId: nullableObjectId,
      clearingLedgerAccountId: nullableObjectId,
      receivableLedgerAccountId: nullableObjectId,
      externalProviderCode: nullableString,
      requiresOpenCashierShift: boolean,
      deactivatedAt: nullableDate,
      deactivatedBy: nullableObjectId,
      deactivationReason: nullableString,
    },
  ),

  cashCounters: validator(
    [
      'counterCode',
      'name',
      'location',
      'counterType',
      'active',
      'assignedUserIds',
      'allowedPaymentMethodConfigurationIds',
      'currency',
      'cashHoldingLimit',
      'openingFloatRequired',
      'minimumOpeningFloat',
      'maximumOpeningFloat',
      'activeShiftPolicy',
      'supervisorApprovalRequiredForClose',
      'negativeExpectedCashAllowed',
    ],
    {
      counterCode: string,
      name: string,
      location: string,
      departmentId: nullableObjectId,
      counterType: enumString(cashCounterTypeValues),
      active: boolean,
      assignedUserIds: objectIdArray,
      allowedPaymentMethodConfigurationIds:
        objectIdArray,
      currency: string,
      cashHoldingLimit: decimal,
      openingFloatRequired: boolean,
      minimumOpeningFloat: decimal,
      maximumOpeningFloat: decimal,
      activeShiftPolicy: enumString(
        activeShiftPolicyValues,
      ),
      supervisorApprovalRequiredForClose:
        boolean,
      negativeExpectedCashAllowed: boolean,
      deactivatedAt: nullableDate,
      deactivatedBy: nullableObjectId,
      deactivationReason: nullableString,
    },
  ),

  cashShifts: validator(
    [
      'operationKey',
      'shiftNumber',
      'cashCounterId',
      'cashierUserId',
      'currency',
      'status',
      'openedAt',
      'openingFloat',
      'expectedCash',
      'declaredCash',
      'cashVariance',
      'nonCashTotal',
      'paymentMethodTotals',
      'refundTotal',
      'reversalTotal',
      'depositTotal',
      'advanceTotal',
      'receiptCount',
      'paymentCount',
    ],
    {
      operationKey: string,
      shiftNumber: string,
      cashCounterId: objectId,
      cashierUserId: objectId,
      cashierStaffId: nullableObjectId,
      supervisorUserId: nullableObjectId,
      currency: string,
      status: enumString(cashierShiftStatusValues),
      openedAt: date,
      openingFloat: decimal,
      suspendedAt: nullableDate,
      suspendedBy: nullableObjectId,
      suspensionReason: nullableString,
      closingStartedAt: nullableDate,
      closingStartedBy: nullableObjectId,
      closedAt: nullableDate,
      closedBy: nullableObjectId,
      expectedCash: decimal,
      declaredCash: decimal,
      cashVariance: decimal,
      nonCashTotal: decimal,
      paymentMethodTotals,
      refundTotal: decimal,
      reversalTotal: decimal,
      depositTotal: decimal,
      advanceTotal: decimal,
      firstReceiptNumber: nullableString,
      lastReceiptNumber: nullableString,
      receiptCount: number,
      paymentCount: number,
      notes: nullableString,
      handoverToUserId: nullableObjectId,
      handoverAt: nullableDate,
      handoverNotes: nullableString,
      shiftReconciliationId: nullableObjectId,
      closingApprovalRequestId: nullableObjectId,
      varianceApprovalRequestId: nullableObjectId,
      reopenedFromShiftId: nullableObjectId,
      reopenApprovalRequestId: nullableObjectId,
      reopenReason: nullableString,
    },
  ),

  shiftReconciliations: validator(
    [
      'operationKey',
      'reconciliationNumber',
      'cashShiftId',
      'cashCounterId',
      'cashierUserId',
      'status',
      'currency',
      'calculatedAt',
      'calculatedBy',
      'openingFloat',
      'cashCollections',
      'cashRefunds',
      'cashPaidOut',
      'cashDrops',
      'safeDeposits',
      'cashTransfersIn',
      'cashTransfersOut',
      'expectedClosingCash',
      'declaredClosingCash',
      'cashVariance',
      'nonCashTotal',
      'paymentMethodTotals',
      'paymentCount',
      'receiptCount',
      'failedPaymentCount',
      'unallocatedPaymentCount',
      'unresolvedRefundCount',
      'incompleteJournalCount',
      'blockingIssueCodes',
      'snapshotHash',
    ],
    {
      operationKey: string,
      reconciliationNumber: string,
      cashShiftId: objectId,
      cashCounterId: objectId,
      cashierUserId: objectId,
      status: enumString(
        shiftReconciliationStatusValues,
      ),
      currency: string,
      calculatedAt: date,
      calculatedBy: objectId,
      openingFloat: decimal,
      cashCollections: decimal,
      cashRefunds: decimal,
      cashPaidOut: decimal,
      cashDrops: decimal,
      safeDeposits: decimal,
      cashTransfersIn: decimal,
      cashTransfersOut: decimal,
      expectedClosingCash: decimal,
      declaredClosingCash: decimal,
      cashVariance: decimal,
      nonCashTotal: decimal,
      paymentMethodTotals,
      paymentCount: number,
      receiptCount: number,
      failedPaymentCount: number,
      unallocatedPaymentCount: number,
      unresolvedRefundCount: number,
      incompleteJournalCount: number,
      blockingIssueCodes: stringArray,
      varianceReason: nullableString,
      overrideReason: nullableString,
      overrideApprovalRequestId: nullableObjectId,
      varianceApprovalRequestId: nullableObjectId,
      approvedAt: nullableDate,
      approvedBy: nullableObjectId,
      closedAt: nullableDate,
      snapshotHash: string,
    },
  ),

  paymentReceipts: validator(
    [
      'operationKey',
      'receiptNumber',
      'paymentId',
      'patientId',
      'patientAccountId',
      'invoiceIds',
      'issuedAt',
      'currency',
      'totalAmount',
      'allocatedAmount',
      'unallocatedAmount',
      'paymentMethodSummaries',
      'allocationSummaries',
      'status',
      'printableProjectionVersion',
      'printableProjectionHash',
    ],
    {
      operationKey: string,
      receiptNumber: string,
      paymentId: objectId,
      paymentIntentId: nullableObjectId,
      patientId: objectId,
      patientAccountId: objectId,
      invoiceIds: objectIdArray,
      cashCounterId: nullableObjectId,
      cashShiftId: nullableObjectId,
      cashierUserId: nullableObjectId,
      cashierStaffId: nullableObjectId,
      issuedAt: date,
      currency: string,
      totalAmount: decimal,
      allocatedAmount: decimal,
      unallocatedAmount: decimal,
      paymentMethodSummaries: {
        bsonType: 'array',
        minItems: 1,
        items: {
          bsonType: 'object',
          required: [
            'paymentMethodConfigurationId',
            'paymentMethodCodeSnapshot',
            'amount',
          ],
          properties: {
            paymentMethodConfigurationId: objectId,
            paymentMethodCodeSnapshot: string,
            amount: decimal,
            externalReferenceMasked: nullableString,
          },
        },
      },
      allocationSummaries: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: [
            'paymentAllocationId',
            'amount',
          ],
          properties: {
            paymentAllocationId: objectId,
            invoiceId: nullableObjectId,
            accountChargeId: nullableObjectId,
            amount: decimal,
          },
        },
      },
      payerDisplayName: nullableString,
      responsiblePartyType: nullableString,
      status: enumString(paymentReceiptStatusValues),
      originalReceiptId: nullableObjectId,
      replacementReceiptId: nullableObjectId,
      refundId: nullableObjectId,
      paymentReversalId: nullableObjectId,
      statusChangedAt: nullableDate,
      statusChangedBy: nullableObjectId,
      statusReason: nullableString,
      printableProjectionVersion: number,
      printableProjectionHash: string,
    },
  ),

  receiptReprints: validator(
    [
      'reprintNumber',
      'receiptId',
      'receiptNumberSnapshot',
      'copyType',
      'reason',
      'printedBy',
      'printedAt',
      'outputFormat',
      'projectionHash',
    ],
    {
      reprintNumber: string,
      receiptId: objectId,
      receiptNumberSnapshot: string,
      copyType: enumString(receiptCopyTypeValues),
      reason: string,
      printedBy: objectId,
      printedAt: date,
      cashCounterId: nullableObjectId,
      cashShiftId: nullableObjectId,
      outputFormat: enumString(['PRINT', 'PDF']),
      projectionHash: string,
    },
  ),

  depositApplications: validator(
    [
      'operationKey',
      'applicationNumber',
      'depositId',
      'patientId',
      'targetPatientAccountId',
      'amount',
      'currency',
      'appliedAt',
      'appliedBy',
      'recordType',
    ],
    {
      operationKey: string,
      applicationNumber: string,
      depositId: objectId,
      patientId: objectId,
      sourcePatientAccountId: nullableObjectId,
      targetPatientAccountId: objectId,
      targetInvoiceId: nullableObjectId,
      amount: decimal,
      currency: string,
      appliedAt: date,
      appliedBy: objectId,
      cashCounterId: nullableObjectId,
      cashShiftId: nullableObjectId,
      paymentAllocationId: nullableObjectId,
      financialLedgerTransactionId: nullableObjectId,
      recordType: enumString([
        'APPLICATION',
        'REVERSAL',
      ]),
      originalApplicationId: nullableObjectId,
      reversalReason: nullableString,
    },
  ),

  depositTransfers: validator(
    [
      'operationKey',
      'transferNumber',
      'sourceDepositId',
      'sourcePatientId',
      'destinationPatientId',
      'amount',
      'currency',
      'reasonCode',
      'reason',
      'approvalRequestId',
      'requestedBy',
      'approvedBy',
      'transferredAt',
      'financialLedgerTransactionId',
      'recordType',
    ],
    {
      operationKey: string,
      transferNumber: string,
      sourceDepositId: objectId,
      sourcePatientId: objectId,
      sourcePatientAccountId: nullableObjectId,
      destinationPatientId: objectId,
      destinationPatientAccountId:
        nullableObjectId,
      destinationDepositId: nullableObjectId,
      amount: decimal,
      currency: string,
      reasonCode: string,
      reason: string,
      approvalRequestId: objectId,
      requestedBy: objectId,
      approvedBy: objectId,
      transferredAt: date,
      financialLedgerTransactionId: objectId,
      recordType: enumString([
        'TRANSFER',
        'REVERSAL',
      ]),
      originalTransferId: nullableObjectId,
      reversalReason: nullableString,
    },
  ),

  cashMovements: validator(
    [
      'operationKey',
      'movementNumber',
      'movementType',
      'status',
      'amount',
      'currency',
      'reasonCode',
      'reason',
      'requestedBy',
      'requestedAt',
      'expectedCashEffect',
    ],
    {
      operationKey: string,
      movementNumber: string,
      movementType: enumString(cashMovementTypeValues),
      status: enumString(cashMovementStatusValues),
      amount: decimal,
      currency: string,
      sourceCounterId: nullableObjectId,
      sourceShiftId: nullableObjectId,
      destinationCounterId: nullableObjectId,
      destinationShiftId: nullableObjectId,
      destinationSafeReference: nullableString,
      sourceDocumentType: nullableString,
      sourceDocumentId: nullableObjectId,
      reasonCode: string,
      reason: string,
      requestedBy: objectId,
      requestedAt: date,
      approvalRequestId: nullableObjectId,
      approvedBy: nullableObjectId,
      approvedAt: nullableDate,
      rejectedBy: nullableObjectId,
      rejectedAt: nullableDate,
      rejectionReason: nullableString,
      postedBy: nullableObjectId,
      postedAt: nullableDate,
      financialLedgerTransactionId:
        nullableObjectId,
      expectedCashEffect: decimal,
      reversalOfCashMovementId: nullableObjectId,
      reversedByCashMovementId: nullableObjectId,
      reversalReason: nullableString,
    },
  ),

  paymentOperationalHistories: validator(
    [
      'operationKey',
      'eventNumber',
      'entityType',
      'entityId',
      'action',
      'actorUserId',
      'occurredAt',
      'snapshotHash',
      'metadata',
    ],
    {
      operationKey: string,
      eventNumber: string,
      entityType: enumString(
        paymentOperationalEntityTypeValues,
      ),
      entityId: objectId,
      action: enumString(
        paymentOperationalActionValues,
      ),
      statusFrom: nullableString,
      statusTo: nullableString,
      amount: nullableDecimal,
      currency: nullableString,
      reasonCode: nullableString,
      reason: nullableString,
      actorUserId: objectId,
      actorStaffId: nullableObjectId,
      approvalRequestId: nullableObjectId,
      cashCounterId: nullableObjectId,
      cashShiftId: nullableObjectId,
      paymentMethodConfigurationId:
        nullableObjectId,
      patientId: nullableObjectId,
      patientAccountId: nullableObjectId,
      invoiceId: nullableObjectId,
      paymentId: nullableObjectId,
      refundId: nullableObjectId,
      receiptId: nullableObjectId,
      occurredAt: date,
      snapshotHash: string,
      metadata: { bsonType: 'object' },
    },
  ),
};

const models = {
  paymentMethodConfigurations:
    PaymentMethodConfigurationModel,
  cashCounters: CashCounterModel,
  cashShifts: CashShiftModel,
  shiftReconciliations: ShiftReconciliationModel,
  paymentReceipts: PaymentReceiptModel,
  receiptReprints: ReceiptReprintModel,
  depositApplications: DepositApplicationModel,
  depositTransfers: DepositTransferModel,
  cashMovements: CashMovementModel,
  paymentOperationalHistories:
    PaymentOperationalHistoryModel,
} as const;

const expectedRetention: Readonly<
  Record<
    PaymentsCashierCollection,
    CollectionRetention
  >
> = {
  paymentMethodConfigurations: 'standard',
  cashCounters: 'standard',
  cashShifts: 'standard',
  shiftReconciliations: 'standard',
  paymentReceipts: 'standard',
  receiptReprints: 'immutable',
  depositApplications: 'immutable',
  depositTransfers: 'immutable',
  cashMovements: 'standard',
  paymentOperationalHistories: 'immutable',
};

async function ensureCollection(
  database: Db,
  name: PaymentsCashierCollection,
): Promise<void> {
  const exists =
    (
      await database
        .listCollections({ name }, { nameOnly: true })
        .toArray()
    ).length > 0;

  const collectionValidator =
    paymentsCashierShiftsFoundationValidators[name];

  if (exists) {
    await database.command({
      collMod: name,
      validator: collectionValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  } else {
    await database.createCollection(name, {
      validator: collectionValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  }

  const collection = database.collection(name);
  const existingIndexes = await collection.indexes();

  for (const index of existingIndexes) {
    if (index.name !== '_id_') {
      await collection.dropIndex(index.name);
    }
  }

  const indexes =
    models[name].schema.indexes() as IndexDescription[];

  if (indexes.length > 0) {
    await collection.createIndexes(indexes);
  }
}

export const paymentsCashierShiftsFoundation: Migration = {
  id: '030-payments-cashier-shifts-foundation',
  description:
    'Create facility payment-method configuration, cash-counter, cashier-shift, receipt, deposit-operation, cash-movement, reconciliation, and immutable payment-history foundations',

  async up(database) {
    for (const collectionName of
      paymentsCashierShiftsFoundationCollections) {
      const spec = collectionSpecs.find(
        (candidate) =>
          candidate.name === collectionName,
      );

      if (
        spec === undefined ||
        spec.domain !== 'finance' ||
        !spec.facilityScoped ||
        spec.retention !==
          expectedRetention[collectionName]
      ) {
        throw new Error(
          `${collectionName} has an invalid payments-and-cashier-shifts collection specification`,
        );
      }

      await ensureCollection(
        database,
        collectionName,
      );
    }
  },
};