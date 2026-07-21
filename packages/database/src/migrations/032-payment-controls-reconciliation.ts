import type {
  Db,
  IndexDescription,
} from 'mongodb';

import {
  PaymentModel,
  PaymentReversalModel,
  RefundModel,
  RefundRequestModel,
} from '../models/billing-payment.model.js';

import {
  FinancialApprovalRequestModel,
} from '../models/billing-invoice-adjustment.model.js';

import {
  approvalTypeValues,
  paymentReversalStatusValues,
  paymentStatusValues,
  refundRequestStatusValues,
  refundStatusValues,
} from '../models/billing.types.js';

import {
  chargeCatalogUnifiedBillingFoundationValidators,
} from './029-charge-catalog-unified-billing-foundation.js';

import {
  paymentCollectionDepositValidators,
} from './031-payment-collection-deposits.js';

import type {
  Migration,
} from './types.js';

const objectId = { bsonType: 'objectId' } as const;
const nullableObjectId = { bsonType: ['objectId', 'null'] } as const;
const string = { bsonType: 'string' } as const;
const nullableString = { bsonType: ['string', 'null'] } as const;
const nullableDate = { bsonType: ['date', 'null'] } as const;
const decimal = { bsonType: 'decimal' } as const;

function enumString(values: readonly string[]): Record<string, unknown> {
  return {
    bsonType: 'string',
    enum: [...values],
  };
}

function cloneValidator(
  collectionName:
    | 'payments'
    | 'refundRequests'
    | 'refunds'
    | 'paymentReversals'
    | 'financialApprovalRequests',
): Record<string, unknown> {
  if (
    collectionName === 'payments' ||
    collectionName === 'financialApprovalRequests'
  ) {
    return structuredClone(
      paymentCollectionDepositValidators[collectionName],
    );
  }

  return structuredClone(
    chargeCatalogUnifiedBillingFoundationValidators[collectionName],
  );
}

function properties(
  validator: Record<string, unknown>,
): Record<string, unknown> {
  const schema = validator['$jsonSchema'];

  if (
    schema === null ||
    typeof schema !== 'object' ||
    Array.isArray(schema)
  ) {
    throw new Error('Financial-control validator has no JSON schema');
  }

  const value = (schema as Record<string, unknown>)['properties'];

  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new Error('Financial-control validator has no properties');
  }

  return value as Record<string, unknown>;
}

function paymentValidator(): Record<string, unknown> {
  const validator = cloneValidator('payments');
  const fields = properties(validator);
  const tenders = fields['tenders'];

  fields['status'] = enumString(paymentStatusValues);
  fields['reversedAmount'] = decimal;

  if (
    tenders !== null &&
    typeof tenders === 'object' &&
    !Array.isArray(tenders)
  ) {
    const items = (tenders as Record<string, unknown>)['items'];

    if (
      items !== null &&
      typeof items === 'object' &&
      !Array.isArray(items)
    ) {
      const tenderProperties = (items as Record<string, unknown>)['properties'];

      if (
        tenderProperties !== null &&
        typeof tenderProperties === 'object' &&
        !Array.isArray(tenderProperties)
      ) {
        (tenderProperties as Record<string, unknown>)['refundedAmount'] = decimal;
      }
    }
  }

  return validator;
}

function refundRequestValidator(): Record<string, unknown> {
  const validator = cloneValidator('refundRequests');
  const fields = properties(validator);

  Object.assign(fields, {
    supportingReference: nullableString,
    status: enumString(refundRequestStatusValues),
  });

  return validator;
}

function refundValidator(): Record<string, unknown> {
  const validator = cloneValidator('refunds');
  const fields = properties(validator);

  Object.assign(fields, {
    creditNoteId: nullableObjectId,
    paymentMethodConfigurationId: nullableObjectId,
    cashCounterId: nullableObjectId,
    cashShiftId: nullableObjectId,
    cashierUserId: nullableObjectId,
    unallocatedRefundAmount: decimal,
    allocationEffects: {
      bsonType: 'array',
      maxItems: 100,
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
        additionalProperties: false,
      },
    },
    status: enumString(refundStatusValues),
    reversedAt: nullableDate,
    reversedBy: nullableObjectId,
    reversalReason: nullableString,
    reversalApprovalRequestId: nullableObjectId,
  });

  return validator;
}

function paymentReversalValidator(): Record<string, unknown> {
  const validator = cloneValidator('paymentReversals');
  const fields = properties(validator);

  Object.assign(fields, {
    replacementPaymentId: nullableObjectId,
    cashCounterId: nullableObjectId,
    cashShiftId: nullableObjectId,
    cashierUserId: nullableObjectId,
    status: enumString(paymentReversalStatusValues),
  });

  return validator;
}

function approvalValidator(): Record<string, unknown> {
  const validator = cloneValidator('financialApprovalRequests');
  properties(validator)['approvalType'] = enumString(approvalTypeValues);
  return validator;
}

export const paymentControlReconciliationValidators = {
  payments: paymentValidator(),
  refundRequests: refundRequestValidator(),
  refunds: refundValidator(),
  paymentReversals: paymentReversalValidator(),
  financialApprovalRequests: approvalValidator(),
} as const;

const models = {
  payments: PaymentModel,
  refundRequests: RefundRequestModel,
  refunds: RefundModel,
  paymentReversals: PaymentReversalModel,
  financialApprovalRequests: FinancialApprovalRequestModel,
} as const;

async function updateCollection(
  database: Db,
  collectionName: keyof typeof paymentControlReconciliationValidators,
): Promise<void> {
  const exists = (
    await database
      .listCollections({ name: collectionName }, { nameOnly: true })
      .toArray()
  ).length > 0;

  if (!exists) {
    throw new Error(
      `${collectionName} must exist before payment-control migration 032`,
    );
  }

  await database.command({
    collMod: collectionName,
    validator: paymentControlReconciliationValidators[collectionName],
    validationLevel: 'strict',
    validationAction: 'error',
  });

  const indexes = models[collectionName].schema.indexes() as IndexDescription[];

  if (indexes.length > 0) {
    await database.collection(collectionName).createIndexes(indexes);
  }
}

export const paymentControlsReconciliation: Migration = {
  id: '032-payment-controls-reconciliation',
  description:
    'Add refund allocation effects, controlled payment reversals, cash-shift financial approvals, and reconciliation indexes',

  async up(database) {
    for (const collectionName of [
      'payments',
      'refundRequests',
      'refunds',
      'paymentReversals',
      'financialApprovalRequests',
    ] as const) {
      await updateCollection(database, collectionName);
    }
  },
};