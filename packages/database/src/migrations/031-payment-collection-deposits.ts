import type {
  Db,
  IndexDescription,
} from 'mongodb';

import {
  DepositModel,
  PaymentIntentModel,
  PaymentModel,
} from '../models/billing-payment.model.js';

import {
  FinancialApprovalRequestModel,
  InvoiceModel,
} from '../models/billing-invoice-adjustment.model.js';

import {
  approvalTypeValues,
  depositStatusValues,
  depositTypeValues,
  invoiceStatusValues,
  paymentIntentPurposeValues,
  paymentIntentStatusValues,
  paymentMethodValues,
  paymentStatusValues,
} from '../models/billing.types.js';

import {
  chargeCatalogUnifiedBillingFoundationValidators,
} from './029-charge-catalog-unified-billing-foundation.js';

import type {
  Migration,
} from './types.js';

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
const decimal = { bsonType: 'decimal' } as const;
const number = { bsonType: 'number' } as const;

function enumString(
  values: readonly string[],
): Record<string, unknown> {
  return {
    bsonType: 'string',
    enum: [...values],
  };
}

function baseValidator(
  collectionName:
    | 'paymentIntents'
    | 'payments'
    | 'deposits'
    | 'invoices'
    | 'financialApprovalRequests',
): Record<string, unknown> {
  return structuredClone(
    chargeCatalogUnifiedBillingFoundationValidators[
      collectionName
    ],
  );
}

function jsonSchema(
  validator: Record<string, unknown>,
): Record<string, unknown> {
  const schema = validator['$jsonSchema'];

  if (
    schema === null ||
    typeof schema !== 'object' ||
    Array.isArray(schema)
  ) {
    throw new Error(
      'Unified-billing validator does not contain a JSON schema',
    );
  }

  return schema as Record<string, unknown>;
}

function properties(
  validator: Record<string, unknown>,
): Record<string, unknown> {
  const schema = jsonSchema(validator);
  const value = schema['properties'];

  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new Error(
      'Unified-billing validator does not contain properties',
    );
  }

  return value as Record<string, unknown>;
}

function augmentPaymentIntentValidator(): Record<string, unknown> {
  const validator = baseValidator('paymentIntents');
  const fields = properties(validator);

  Object.assign(fields, {
    paymentMethodConfigurationId:
      nullableObjectId,
    purpose:
      enumString(
        paymentIntentPurposeValues,
      ),
    payerName:
      nullableString,
    responsiblePartyType:
      nullableString,
    status:
      enumString(
        paymentIntentStatusValues,
      ),
    capturedAt:
      nullableDate,
    cancelledAt:
      nullableDate,
    cancelledBy:
      nullableObjectId,
    cancellationReason:
      nullableString,
    reversedAt:
      nullableDate,
    reversedBy:
      nullableObjectId,
    reversalReason:
      nullableString,
  });

  return validator;
}

function augmentPaymentValidator(): Record<string, unknown> {
  const validator = baseValidator('payments');
  const fields = properties(validator);

  Object.assign(fields, {
    paymentNumber:
      nullableString,
    paymentMethodConfigurationId:
      nullableObjectId,
    paymentMethod:
      enumString(
        paymentMethodValues,
      ),
    status:
      enumString(
        paymentStatusValues,
      ),
    payerName:
      nullableString,
    responsiblePartyType:
      nullableString,
    notes:
      nullableString,
    tenders: {
      bsonType: 'array',
      maxItems: 8,
      items: {
        bsonType: 'object',
        required: [
          '_id',
          'operationKey',
          'sequence',
          'paymentMethodConfigurationId',
          'paymentMethodCodeSnapshot',
          'paymentMethodKindSnapshot',
          'amount',
          'currency',
          'status',
          'version',
        ],
        properties: {
          _id: objectId,
          operationKey: string,
          sequence: number,
          paymentMethodConfigurationId:
            objectId,
          paymentMethodCodeSnapshot:
            string,
          paymentMethodKindSnapshot:
            string,
          amount: decimal,
          currency: string,
          externalReference:
            nullableString,
          maskedReference:
            nullableString,
          referenceType:
            nullableString,
          status: enumString([
            'PENDING',
            'POSTED',
            'FAILED',
            'CANCELLED',
            'PARTIALLY_REFUNDED',
            'REFUNDED',
            'REVERSED',
          ]),
          settledAt:
            nullableDate,
          failureCode:
            nullableString,
          failureMessage:
            nullableString,
          version: number,
        },
      },
    },
  });

  return validator;
}

function augmentDepositValidator(): Record<string, unknown> {
  const validator = baseValidator('deposits');
  const fields = properties(validator);

  Object.assign(fields, {
    operationKey:
      string,
    depositType:
      enumString(
        depositTypeValues,
      ),
    admissionId:
      nullableObjectId,
    procedureReferenceId:
      nullableObjectId,
    responsiblePartyType:
      nullableString,
    transferredAmount:
      decimal,
    forfeitedAmount:
      decimal,
    status:
      enumString(
        depositStatusValues,
      ),
    releasedAt:
      nullableDate,
    releasedBy:
      nullableObjectId,
    releaseReason:
      nullableString,
    reversalId:
      nullableObjectId,
  });

  return validator;
}

function augmentInvoiceValidator(): Record<string, unknown> {
  const validator = baseValidator('invoices');
  const fields = properties(validator);

  fields['status'] = enumString(
    invoiceStatusValues,
  );

  return validator;
}

function augmentFinancialApprovalValidator(): Record<string, unknown> {
  const validator = baseValidator('financialApprovalRequests');
  const fields = properties(validator);

  fields['approvalType'] = enumString(
    approvalTypeValues,
  );

  return validator;
}

export const paymentCollectionDepositValidators = {
  paymentIntents:
    augmentPaymentIntentValidator(),
  payments:
    augmentPaymentValidator(),
  deposits:
    augmentDepositValidator(),
  invoices:
    augmentInvoiceValidator(),
  financialApprovalRequests:
    augmentFinancialApprovalValidator(),
} as const;

const models = {
  paymentIntents:
    PaymentIntentModel,
  payments:
    PaymentModel,
  deposits:
    DepositModel,
  invoices:
    InvoiceModel,
  financialApprovalRequests:
    FinancialApprovalRequestModel,
} as const;

async function updateCollection(
  database: Db,
  collectionName:
    keyof typeof paymentCollectionDepositValidators,
): Promise<void> {
  const exists =
    (
      await database
        .listCollections(
          {
            name:
              collectionName,
          },
          {
            nameOnly:
              true,
          },
        )
        .toArray()
    ).length > 0;

  if (!exists) {
    throw new Error(
      `${collectionName} must exist before payment collection migration 031`,
    );
  }

  await database.command({
    collMod:
      collectionName,
    validator:
      paymentCollectionDepositValidators[
        collectionName
      ],
    validationLevel:
      'strict',
    validationAction:
      'error',
  });

  const indexes = models[
    collectionName
  ].schema.indexes() as IndexDescription[];

  if (indexes.length > 0) {
    await database
      .collection(
        collectionName,
      )
      .createIndexes(
        indexes,
      );
  }
}

export const paymentCollectionDeposits: Migration = {
  id:
    '031-payment-collection-deposits',

  description:
    'Extend unified-billing payments with payment intents, split tenders, payment-state invoice updates, and deposit or advance controls',

  async up(database) {
    for (const collectionName of [
      'paymentIntents',
      'payments',
      'deposits',
      'invoices',
      'financialApprovalRequests',
    ] as const) {
      await updateCollection(
        database,
        collectionName,
      );
    }
  },
};