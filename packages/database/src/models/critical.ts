import mongoose, { Schema } from 'mongoose';

import {
  bedStatuses,
  invoiceStatuses,
  prescriptionStatuses,
  queueStatuses,
  transactionStatuses,
} from '../catalog/enums.js';

import { baseSchema, decimal128, objectId } from './common.js';
import { patientIdentifierSchema } from './patient-identifier.model.js';
import { patientSchema } from './patient.model.js';

const sequenceSchema = baseSchema(
  {
    key: {
      type: String,
      required: true,
    },
    year: {
      type: Number,
    },
    currentValue: {
      type: Number,
      required: true,
      min: 0,
    },
    prefix: {
      type: String,
    },
  },
  {
    collection: 'numberSequences',
  },
);

sequenceSchema.index(
  {
    facilityId: 1,
    key: 1,
    year: 1,
  },
  {
    unique: true,
  },
);

const queueTokenSchema = baseSchema(
  {
    opdVisitId: {
      type: objectId,
      required: true,
    },
    queueDefinitionId: {
      type: objectId,
      required: true,
    },
    patientId: {
      type: objectId,
      required: true,
    },
    serviceDate: {
      type: String,
      required: true,
    },
    tokenNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    priority: {
      type: Number,
      required: true,
      default: 0,
    },
    status: {
      type: String,
      enum: queueStatuses,
      required: true,
      default: 'WAITING',
    },
    calledAt: Date,
    completedAt: Date,
  },
  {
    collection: 'queueTokens',
  },
);

queueTokenSchema.index(
  {
    facilityId: 1,
    serviceDate: 1,
    queueDefinitionId: 1,
    tokenNumber: 1,
  },
  {
    unique: true,
  },
);

queueTokenSchema.index({
  facilityId: 1,
  serviceDate: 1,
  queueDefinitionId: 1,
  status: 1,
  priority: -1,
  createdAt: 1,
});

const bedSchema = baseSchema(
  {
    wardId: {
      type: objectId,
      required: true,
    },
    roomId: {
      type: objectId,
    },
    bedNumber: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: bedStatuses,
      required: true,
      default: 'AVAILABLE',
    },
    activeAssignmentId: {
      type: objectId,
    },
  },
  {
    collection: 'beds',
  },
);

bedSchema.index(
  {
    facilityId: 1,
    wardId: 1,
    bedNumber: 1,
  },
  {
    unique: true,
  },
);

bedSchema.index({
  facilityId: 1,
  wardId: 1,
  status: 1,
  category: 1,
});

const bedAssignmentSchema = baseSchema(
  {
    admissionId: {
      type: objectId,
      required: true,
    },
    bedId: {
      type: objectId,
      required: true,
    },
    startedAt: {
      type: Date,
      required: true,
    },
    endedAt: Date,
    active: {
      type: Boolean,
      required: true,
      default: true,
    },
    transactionId: {
      type: objectId,
      required: true,
    },
  },
  {
    collection: 'admissionBedAssignments',
  },
);

bedAssignmentSchema.index(
  {
    bedId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      active: true,
    },
  },
);

bedAssignmentSchema.index({
  admissionId: 1,
  startedAt: 1,
});

const inventoryBatchSchema = baseSchema(
  {
    itemId: {
      type: objectId,
      required: true,
    },
    supplierId: {
      type: objectId,
    },
    batchNumber: {
      type: String,
      required: true,
    },
    manufactureDate: Date,
    expiryDate: {
      type: Date,
      required: true,
    },
    costPrice: {
      type: decimal128,
      required: true,
    },
    sellingPrice: {
      type: decimal128,
      required: true,
    },
    currency: {
      type: String,
      required: true,
      default: 'PKR',
    },
    status: {
      type: String,
      enum: [
        'ACTIVE',
        'EXPIRED',
        'QUARANTINED',
        'RECALLED',
      ],
      default: 'ACTIVE',
    },
  },
  {
    collection: 'inventoryBatches',
  },
);

inventoryBatchSchema.index(
  {
    facilityId: 1,
    itemId: 1,
    supplierId: 1,
    batchNumber: 1,
  },
  {
    unique: true,
  },
);

inventoryBatchSchema.index({
  facilityId: 1,
  itemId: 1,
  expiryDate: 1,
  status: 1,
});

const stockBalanceSchema = baseSchema(
  {
    storeLocationId: {
      type: objectId,
      required: true,
    },
    itemId: {
      type: objectId,
      required: true,
    },
    batchId: {
      type: objectId,
      required: true,
    },
    availableQuantity: {
      type: decimal128,
      required: true,
    },
    reservedQuantity: {
      type: decimal128,
      required: true,
      default: '0',
    },
    lastMovementId: {
      type: objectId,
    },
  },
  {
    collection: 'stockBalances',
  },
);

stockBalanceSchema.index(
  {
    facilityId: 1,
    storeLocationId: 1,
    itemId: 1,
    batchId: 1,
  },
  {
    unique: true,
  },
);

stockBalanceSchema.index({
  facilityId: 1,
  storeLocationId: 1,
  itemId: 1,
  availableQuantity: 1,
});

const stockMovementSchema = baseSchema(
  {
    movementNumber: {
      type: String,
      required: true,
      immutable: true,
    },
    itemId: {
      type: objectId,
      required: true,
    },
    batchId: {
      type: objectId,
      required: true,
    },
    storeLocationId: {
      type: objectId,
      required: true,
    },
    movementType: {
      type: String,
      required: true,
    },
    quantity: {
      type: decimal128,
      required: true,
    },
    direction: {
      type: String,
      enum: [
        'IN',
        'OUT',
      ],
      required: true,
    },
    sourceType: {
      type: String,
      required: true,
    },
    sourceId: {
      type: objectId,
      required: true,
    },
    transactionId: {
      type: objectId,
      required: true,
    },
    operationKey: {
      type: String,
      required: true,
      immutable: true,
    },
    occurredAt: {
      type: Date,
      required: true,
    },
  },
  {
    collection: 'stockMovements',
  },
);

stockMovementSchema.index(
  {
    facilityId: 1,
    operationKey: 1,
  },
  {
    unique: true,
  },
);

stockMovementSchema.index({
  facilityId: 1,
  itemId: 1,
  batchId: 1,
  occurredAt: -1,
});

const prescriptionSchema = baseSchema(
  {
    prescriptionNumber: {
      type: String,
      required: true,
      immutable: true,
    },
    patientId: {
      type: objectId,
      required: true,
    },
    encounterId: {
      type: objectId,
      required: true,
    },
    doctorId: {
      type: objectId,
      required: true,
    },
    status: {
      type: String,
      enum: prescriptionStatuses,
      required: true,
      default: 'DRAFT',
    },
    issuedAt: Date,
    finalizedSnapshot: Schema.Types.Mixed,
  },
  {
    collection: 'prescriptions',
  },
);

prescriptionSchema.index(
  {
    facilityId: 1,
    prescriptionNumber: 1,
  },
  {
    unique: true,
  },
);

prescriptionSchema.index({
  facilityId: 1,
  patientId: 1,
  createdAt: -1,
});

const invoiceSchema = baseSchema(
  {
    invoiceNumber: {
      type: String,
      immutable: true,
    },
    patientId: {
      type: objectId,
      required: true,
    },
    patientAccountId: {
      type: objectId,
      required: true,
    },
    status: {
      type: String,
      enum: invoiceStatuses,
      required: true,
      default: 'DRAFT',
    },
    currency: {
      type: String,
      required: true,
      default: 'PKR',
    },
    grossAmount: {
      type: decimal128,
      required: true,
      default: '0',
    },
    netAmount: {
      type: decimal128,
      required: true,
      default: '0',
    },
    outstandingAmount: {
      type: decimal128,
      required: true,
      default: '0',
    },
    finalizedAt: Date,
  },
  {
    collection: 'invoices',
  },
);

invoiceSchema.index(
  {
    facilityId: 1,
    invoiceNumber: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      invoiceNumber: {
        $type: 'string',
      },
    },
  },
);

invoiceSchema.index({
  facilityId: 1,
  patientId: 1,
  status: 1,
  createdAt: -1,
});

const applicationTransactionSchema = baseSchema(
  {
    transactionId: {
      type: String,
      required: true,
      immutable: true,
    },
    transactionType: {
      type: String,
      required: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
    },
    correlationId: {
      type: String,
      required: true,
    },
    initiatedBy: {
      type: objectId,
      required: true,
    },
    patientId: {
      type: objectId,
    },
    invoiceId: {
      type: objectId,
    },
    admissionId: {
      type: objectId,
    },
    prescriptionId: {
      type: objectId,
    },
    status: {
      type: String,
      enum: transactionStatuses,
      required: true,
      default: 'PENDING',
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    error: Schema.Types.Mixed,
    completedAt: Date,
    recoveryStatus: String,
  },
  {
    collection: 'applicationTransactions',
  },
);

applicationTransactionSchema.index(
  {
    transactionType: 1,
    idempotencyKey: 1,
  },
  {
    unique: true,
  },
);

applicationTransactionSchema.index({
  status: 1,
  updatedAt: 1,
});

const transactionStepSchema = baseSchema(
  {
    transactionId: {
      type: objectId,
      required: true,
    },
    sequence: {
      type: Number,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
    },
    executionAttempts: {
      type: Number,
      default: 0,
    },
    executedAt: Date,
    verifiedAt: Date,
    compensatedAt: Date,
    error: Schema.Types.Mixed,
  },
  {
    collection: 'applicationTransactionSteps',
  },
);

transactionStepSchema.index(
  {
    transactionId: 1,
    sequence: 1,
  },
  {
    unique: true,
  },
);

const idempotencySchema = baseSchema(
  {
    scope: {
      type: String,
      required: true,
    },
    key: {
      type: String,
      required: true,
    },
    requestHash: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: [
        'PROCESSING',
        'COMPLETED',
        'FAILED',
      ],
      required: true,
    },
    transactionId: {
      type: objectId,
    },
    responseCode: Number,
    responseBody: Schema.Types.Mixed,
    expiresAt: Date,
  },
  {
    collection: 'idempotencyKeys',
  },
);

idempotencySchema.index(
  {
    scope: 1,
    key: 1,
  },
  {
    unique: true,
  },
);

idempotencySchema.index(
  {
    expiresAt: 1,
  },
  {
    expireAfterSeconds: 0,
  },
);

const operationLockSchema = baseSchema(
  {
    resourceType: {
      type: String,
      required: true,
    },
    resourceKey: {
      type: String,
      required: true,
    },
    ownerId: {
      type: String,
      required: true,
    },
    leaseToken: {
      type: String,
      required: true,
    },
    leaseExpiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    collection: 'operationLocks',
  },
);

operationLockSchema.index(
  {
    resourceType: 1,
    resourceKey: 1,
  },
  {
    unique: true,
  },
);

operationLockSchema.index(
  {
    leaseExpiresAt: 1,
  },
  {
    expireAfterSeconds: 0,
  },
);

const outboxSchema = baseSchema(
  {
    eventId: {
      type: String,
      required: true,
    },
    transactionId: {
      type: objectId,
      required: true,
    },
    eventType: {
      type: String,
      required: true,
    },
    aggregateType: {
      type: String,
      required: true,
    },
    aggregateId: {
      type: String,
      required: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: [
        'PENDING',
        'LEASED',
        'PUBLISHED',
        'FAILED',
        'DEAD_LETTER',
      ],
      required: true,
      default: 'PENDING',
    },
    availableAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    leaseExpiresAt: Date,
    attempts: {
      type: Number,
      default: 0,
    },
    publishedAt: Date,
  },
  {
    collection: 'outboxEvents',
  },
);

outboxSchema.index(
  {
    eventId: 1,
  },
  {
    unique: true,
  },
);

outboxSchema.index({
  status: 1,
  availableAt: 1,
  createdAt: 1,
});

const auditSchema = baseSchema(
  {
    actorId: {
      type: objectId,
      required: true,
    },
    actorRoleIds: [
      {
        type: objectId,
      },
    ],
    action: {
      type: String,
      required: true,
    },
    module: {
      type: String,
      required: true,
    },
    entityType: {
      type: String,
      required: true,
    },
    entityId: {
      type: String,
      required: true,
    },
    safeBefore: Schema.Types.Mixed,
    safeAfter: Schema.Types.Mixed,
    reason: String,
    correlationId: {
      type: String,
      required: true,
    },
    transactionId: {
      type: objectId,
    },
    ipAddress: String,
    userAgent: String,
    occurredAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    collection: 'auditLogs',
  },
);

auditSchema.index({
  facilityId: 1,
  occurredAt: -1,
});

auditSchema.index({
  facilityId: 1,
  actorId: 1,
  occurredAt: -1,
});

auditSchema.index({
  facilityId: 1,
  entityType: 1,
  entityId: 1,
  occurredAt: -1,
});

export const criticalSchemas = {
  patients: patientSchema,
  patientIdentifiers: patientIdentifierSchema,
  numberSequences: sequenceSchema,
  queueTokens: queueTokenSchema,
  beds: bedSchema,
  admissionBedAssignments: bedAssignmentSchema,
  inventoryBatches: inventoryBatchSchema,
  stockBalances: stockBalanceSchema,
  stockMovements: stockMovementSchema,
  prescriptions: prescriptionSchema,
  invoices: invoiceSchema,
  applicationTransactions: applicationTransactionSchema,
  applicationTransactionSteps: transactionStepSchema,
  idempotencyKeys: idempotencySchema,
  operationLocks: operationLockSchema,
  outboxEvents: outboxSchema,
  auditLogs: auditSchema,
} as const;

export type CriticalModelName = keyof typeof criticalSchemas;

export function registerCriticalModels(
  connection: mongoose.Connection = mongoose.connection,
) {
  return Object.fromEntries(
    Object.entries(criticalSchemas).map(([name, schema]) => [
      name,
      connection.models[name] ??
        connection.model(name, schema, name),
    ]),
  );
}