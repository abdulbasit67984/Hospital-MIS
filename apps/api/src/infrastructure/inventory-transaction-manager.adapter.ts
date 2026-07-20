import {
  randomUUID,
} from 'node:crypto';

import mongoose from 'mongoose';

import type {
  Db,
} from '@hospital-mis/database';

import {
  toObjectId,
} from '@hospital-mis/database';

import {
  AppError,
} from '@hospital-mis/shared';

import type {
  InventoryProcurementTransactionCompensation,
  InventoryProcurementTransactionContext,
  InventoryProcurementTransactionManagerPort,
  InventoryProcurementTransactionRequest,
} from '../modules/inventory/inventory-procurement.ports.js';

import type {
  InventoryStockPostingPort,
} from '../modules/inventory/inventory-stock.ports.js';

import type {
  ApplicationTransactionRepository,
} from './application-transaction.js';

import type {
  IdempotencyService,
} from './idempotency.service.js';

import type {
  AcquiredLock,
  OperationLockService,
} from './operation-lock.service.js';

import type {
  OutboxService,
} from './outbox.service.js';

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | {
      [key: string]: JsonValue;
    };

function serialize(
  value: unknown,
  depth = 0,
): JsonValue {
  if (depth > 24) {
    throw new TypeError(
      'Inventory idempotency result exceeds the serialization depth limit',
    );
  }

  if (value == null) {
    return null;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(
        'Inventory idempotency result contains a non-finite number',
      );
    }

    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => serialize(entry, depth + 1));
  }

  if (typeof value === 'object') {
    const candidate = value as Record<string, unknown>;

    if (
      typeof candidate['toHexString'] === 'function'
    ) {
      return (
        candidate['toHexString'] as () => string
      )();
    }

    if (
      candidate['_bsontype'] === 'Decimal128' &&
      typeof candidate['toString'] === 'function'
    ) {
      return (
        candidate['toString'] as () => string
      )();
    }

    return Object.fromEntries(
      Object.entries(candidate).map(([key, nested]) => [
        key,
        serialize(nested, depth + 1),
      ]),
    );
  }

  return String(value);
}

function errorSnapshot(
  error: unknown,
): Record<string, string> {
  return {
    name:
      error instanceof Error
        ? error.name
        : typeof error,
    message:
      error instanceof Error
        ? error.message.slice(0, 2_000)
        : 'Unknown inventory transaction failure',
  };
}

const aggregateCollections = {
  PURCHASE_REQUISITION: {
    root: 'purchaseRequisitions',
    children: [
      {
        collection: 'purchaseRequisitionItems',
        foreignKey: 'purchaseRequisitionId',
      },
      {
        collection: 'procurementApprovalHistories',
        foreignKey: 'documentId',
      },
    ],
  },
  PURCHASE_ORDER: {
    root: 'purchaseOrders',
    children: [
      {
        collection: 'purchaseOrderItems',
        foreignKey: 'purchaseOrderId',
      },
      {
        collection: 'purchaseInvoices',
        foreignKey: 'purchaseOrderId',
      },
    ],
  },
  SUPPLIER_RETURN: {
    root: 'supplierReturns',
    children: [
      {
        collection: 'supplierReturnItems',
        foreignKey: 'supplierReturnId',
      },
    ],
  },
} as const;

export class MongoInventoryCompensationExecutor {
  private stockPosting: InventoryStockPostingPort | undefined;

  public constructor(
    private readonly database: Db,
    stockPosting?: InventoryStockPostingPort,
  ) {
    this.stockPosting = stockPosting;
  }

  public setStockPosting(
    stockPosting: InventoryStockPostingPort,
  ): void {
    this.stockPosting = stockPosting;
  }

  public async execute(
    compensation: InventoryProcurementTransactionCompensation,
    actorUserId: string,
    correlationId: string,
  ): Promise<void> {

    if (
      compensation.type ===
      'inventory.catalog.delete-created'
    ) {
      await this.deleteCreatedCatalogRecord(compensation.payload);
      return;
    }

    if (
      compensation.type ===
      'inventory.procurement.aggregate.delete-created'
    ) {
      await this.deleteCreatedAggregate(compensation.payload);
      return;
    }

    if (
      compensation.type ===
      'inventory.procurement.document.restore-version'
    ) {
      await this.restoreDocumentVersion(compensation.payload);
      return;
    }

    if (
      compensation.type ===
        'inventory.procurement.stock.reverse-posting' ||
      compensation.type ===
        'inventory.stock.reverse-source-movements'
    ) {
      await this.reverseStock(
        compensation,
        actorUserId,
        correlationId,
      );
      return;
    }

    throw new Error(
      `Unsupported inventory compensation type ${compensation.type}`,
    );
  }


  private async deleteCreatedCatalogRecord(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const collection = String(payload['collection']);
    const entityId = String(payload['entityId']);
    const facilityId = String(payload['facilityId']);
    const transactionId = String(payload['transactionId']);

    const result = await this.database
      .collection(collection)
      .deleteOne({
        _id: toObjectId(entityId, 'entityId'),
        facilityId: toObjectId(facilityId, 'facilityId'),
        transactionId,
      });

    if (result.deletedCount === 0) {
      return;
    }

    const formularyItemId = payload['formularyItemId'];

    if (
      collection === 'inventoryItems' &&
      typeof formularyItemId === 'string' &&
      formularyItemId.length > 0
    ) {
      await this.database
        .collection('formularyItems')
        .updateOne(
          {
            _id: toObjectId(formularyItemId, 'formularyItemId'),
            facilityId: toObjectId(facilityId, 'facilityId'),
            inventoryItemId: toObjectId(entityId, 'entityId'),
          },
          {
            $set: {
              inventoryItemId: null,
              updatedAt: new Date(),
            },
            $inc: {
              version: 1,
            },
          },
        );
    }
  }

  private async deleteCreatedAggregate(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const aggregateType = String(payload['aggregateType']);
    const aggregateId = String(payload['aggregateId']);
    const facilityId = String(payload['facilityId']);
    const transactionId = String(payload['transactionId']);
    const definition =
      aggregateCollections[
        aggregateType as keyof typeof aggregateCollections
      ];

    if (definition === undefined) {
      throw new Error(
        `Unsupported inventory aggregate compensation ${aggregateType}`,
      );
    }

    const facilityObjectId = toObjectId(
      facilityId,
      'facilityId',
    );
    const aggregateObjectId = toObjectId(
      aggregateId,
      'aggregateId',
    );

    for (const child of definition.children) {
      await this.database
        .collection(child.collection)
        .deleteMany({
          facilityId: facilityObjectId,
          transactionId,
          [child.foreignKey]: aggregateObjectId,
        });
    }

    await this.database
      .collection(definition.root)
      .deleteOne({
        _id: aggregateObjectId,
        facilityId: facilityObjectId,
        transactionId,
      });
  }

  private async restoreDocumentVersion(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const collection = String(payload['collection']);
    const entityId = String(payload['entityId']);
    const facilityId = String(payload['facilityId']);
    const expectedPostVersion = Number(
      payload['expectedPostVersion'],
    );
    const previousVersion = Number(payload['previousVersion']);
    const previousStatus = String(payload['previousStatus']);

    const result = await this.database
      .collection(collection)
      .updateOne(
        {
          _id: toObjectId(entityId, 'entityId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: expectedPostVersion,
        },
        {
          $set: {
            status: previousStatus,
            version: previousVersion,
            updatedAt: new Date(),
          },
          $unset: {
            submittedAt: '',
            submittedByStaffId: '',
            decidedAt: '',
            decidedByStaffId: '',
            decisionReason: '',
          },
        },
      );

    if (result.matchedCount !== 1) {
      throw new Error(
        'Inventory document compensation encountered a version conflict',
      );
    }
  }

  private async reverseStock(
    compensation: InventoryProcurementTransactionCompensation,
    actorUserId: string,
    correlationId: string,
  ): Promise<void> {
    const payload = compensation.payload;
    const facilityId = String(payload['facilityId']);
    const sourceType =
      compensation.type ===
      'inventory.procurement.stock.reverse-posting'
        ? 'GOODS_RECEIPT'
        : String(payload['sourceType']);
    const sourceId =
      compensation.type ===
      'inventory.procurement.stock.reverse-posting'
        ? String(payload['goodsReceiptId'])
        : String(payload['sourceId']);

    const user = await this.database
      .collection<{
        staffId?: {
          toHexString(): string;
        } | null;
      }>('users')
      .findOne(
        {
          _id: toObjectId(actorUserId, 'actorUserId'),
        },
        {
          projection: {
            staffId: 1,
          },
        },
      );

    if (user?.staffId == null) {
      throw new Error(
        'Inventory stock compensation requires staff attribution',
      );
    }

    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        if (this.stockPosting === undefined) {
          throw new Error(
            'Inventory stock compensation is not configured',
          );
        }

        await this.stockPosting.reverseSourceMovements(
          {
            facilityId,
            transactionId: randomUUID(),
            correlationId,
            actorUserId,
            actorStaffId: user.staffId!.toHexString(),
            sourceType,
            sourceId,
            reason:
              'Automatic compensation for a failed inventory application transaction',
            occurredAt: new Date(),
          },
          session as never,
        );
      });
    } finally {
      await session.endSession();
    }
  }
}

interface ExecutionState {
  checkpoints: Array<{
    state: string;
    data?: Record<string, unknown>;
  }>;
  compensations: InventoryProcurementTransactionCompensation[];
}

export class MongoInventoryTransactionManagerAdapter
implements InventoryProcurementTransactionManagerPort {
  public constructor(
    private readonly database: Db,
    private readonly transactions: ApplicationTransactionRepository,
    private readonly idempotency: IdempotencyService,
    private readonly locks: OperationLockService,
    private readonly outbox: OutboxService,
    private readonly compensationExecutor: MongoInventoryCompensationExecutor,
  ) {}

  public async execute<T>(
    request: InventoryProcurementTransactionRequest<T>,
  ): Promise<T> {
    const claim = await this.idempotency.begin({
      facilityId: request.facilityId,
      scope: request.transactionType,
      key: request.idempotencyKey,
      requestPayload: request.idempotencyPayload,
    });

    if (claim.kind === 'REPLAY') {
      return claim.response as T;
    }

    const transactionId = randomUUID();
    const state: ExecutionState = {
      checkpoints: [],
      compensations: [],
    };
    let acquiredLocks: readonly AcquiredLock[] = [];
    let transactionCreated = false;
    let domainExecuted = false;
    let result: T | undefined;

    const context: InventoryProcurementTransactionContext = {
      transactionId,
      idempotencyKey: request.idempotencyKey,
      checkpoint: async (checkpointState, data) => {
        state.checkpoints.push({
          state: checkpointState,
          ...(data === undefined ? {} : { data }),
        });

        await this.databaseCheckpoint(
          transactionId,
          state.checkpoints,
          state.compensations,
        );
      },
      registerCompensation: async (compensation) => {
        state.compensations.push(compensation);
        await this.databaseCheckpoint(
          transactionId,
          state.checkpoints,
          state.compensations,
        );
      },
    };

    try {
      try {
        await this.transactions.create({
          facilityId: request.facilityId,
          transactionId,
          transactionType: request.transactionType,
          idempotencyKey: request.idempotencyKey,
          correlationId: request.correlationId,
          initiatedBy: request.actorUserId,
          contextSnapshot: request.journalPayload,
          relatedEntities: {
            lockKeys: request.lockKeys,
          },
          stepNames: [
            'EXECUTE_INVENTORY_DOMAIN_TRANSACTION',
          ],
        });
        transactionCreated = true;

        acquiredLocks = await this.locks.acquireMany({
          facilityId: request.facilityId,
          ownerId: transactionId,
          resources: request.lockKeys.map((resourceKey) => ({
            resourceType: 'INVENTORY',
            resourceKey,
          })),
        });

        await this.transactions.setStatus(
          transactionId,
          'IN_PROGRESS',
        );
        await this.transactions.setStepStatus(
          transactionId,
          0,
          'EXECUTING',
        );

        result = await request.execute(context);
        domainExecuted = true;

        await this.transactions.setStepStatus(
          transactionId,
          0,
          'EXECUTED',
        );
        await this.transactions.setStepStatus(
          transactionId,
          0,
          'VERIFIED',
        );
        await this.transactions.setStatus(
          transactionId,
          'COMPLETED',
        );
      } catch (error) {
        if (domainExecuted && result !== undefined) {
          await this.markFinalizationRecovery({
            request,
            transactionId,
            ownerId: claim.ownerId,
            response: serialize(result),
            error,
          });

          throw new AppError({
            code: 'INVENTORY_TRANSACTION_FINALIZATION_PENDING',
            message:
              'The inventory operation completed and finalization will be recovered safely',
            statusCode: 503,
            retryable: true,
            cause: error,
          });
        }

        if (transactionCreated) {
          await this.transactions.setStepStatus(
            transactionId,
            0,
            'FAILED',
            errorSnapshot(error),
          ).catch(() => undefined);
        }

        const compensated = await this.compensate(
          state.compensations,
          request.actorUserId,
          request.correlationId,
        );

        await this.idempotency.fail({
          facilityId: request.facilityId,
          scope: request.transactionType,
          key: request.idempotencyKey,
          ownerId: claim.ownerId,
          error: errorSnapshot(error),
        }).catch(() => undefined);

        if (transactionCreated) {
          await this.transactions.setStatus(
            transactionId,
            compensated
              ? 'COMPENSATED'
              : 'RECOVERY_REQUIRED',
            {
              originalError: errorSnapshot(error),
              compensations: state.compensations.map(
                (entry) => ({
                  key: entry.key,
                  type: entry.type,
                }),
              ),
            },
          ).catch(() => undefined);
        }

        if (!compensated) {
          throw new AppError({
            code: 'INVENTORY_TRANSACTION_RECOVERY_REQUIRED',
            message:
              'The inventory operation failed and requires recovery',
            statusCode: 500,
            retryable: false,
            cause: error,
          });
        }

        throw error;
      }

      if (result === undefined) {
        throw new Error(
          'Inventory transaction completed without a result',
        );
      }

      try {
        await this.idempotency.complete({
          facilityId: request.facilityId,
          scope: request.transactionType,
          key: request.idempotencyKey,
          ownerId: claim.ownerId,
          response: serialize(result) as never,
        });

        await this.outbox.releaseTransactionEvents(
          transactionId,
        );

        await this.clearFinalizationRecovery(transactionId);
      } catch (error) {
        await this.markFinalizationRecovery({
          request,
          transactionId,
          ownerId: claim.ownerId,
          response: serialize(result),
          error,
        });

        throw new AppError({
          code: 'INVENTORY_TRANSACTION_FINALIZATION_PENDING',
          message:
            'The inventory operation completed and finalization will be recovered safely',
          statusCode: 503,
          retryable: true,
          cause: error,
        });
      }

      return result;
    } finally {
      await this.locks
        .releaseMany(acquiredLocks)
        .catch(() => undefined);
    }
  }

  public async recoverFinalizations(
    facilityId: string,
    limit = 50,
  ): Promise<number> {
    const safeLimit = Math.max(1, Math.min(limit, 500));
    const records = await this.database
      .collection<{
        facilityId: ReturnType<typeof toObjectId>;
        transactionId: string;
        transactionType: string;
        idempotencyKey: string;
        status: string;
        relatedEntities?: {
          finalization?: {
            ownerId: string;
            response: JsonValue;
          };
        };
      }>('applicationTransactions')
      .find({
        facilityId: toObjectId(facilityId, 'facilityId'),
        status: 'RECOVERY_REQUIRED',
        recoveryStatus: 'INVENTORY_FINALIZATION_PENDING',
      })
      .sort({ updatedAt: 1, _id: 1 })
      .limit(safeLimit)
      .toArray();

    let recovered = 0;

    for (const record of records) {
      const finalization = record.relatedEntities?.finalization;

      if (finalization === undefined) {
        await this.database
          .collection('applicationTransactions')
          .updateOne(
            { transactionId: record.transactionId },
            {
              $set: {
                recoveryStatus:
                  'INVENTORY_FINALIZATION_INVALID_METADATA',
              },
              $inc: {
                retryCount: 1,
                version: 1,
              },
              $currentDate: {
                updatedAt: true,
              },
            },
          );
        continue;
      }

      try {
        const idempotencyRecord = await this.database
          .collection<{
            status: string;
            ownerId: string;
          }>('idempotencyKeys')
          .findOne({
            facilityId: record.facilityId,
            scope: record.transactionType,
            key: record.idempotencyKey,
          });

        if (idempotencyRecord === null) {
          throw new Error(
            'Inventory finalization idempotency record is unavailable',
          );
        }

        if (idempotencyRecord.status === 'IN_PROGRESS') {
          await this.idempotency.complete({
            facilityId: record.facilityId.toHexString(),
            scope: record.transactionType,
            key: record.idempotencyKey,
            ownerId: finalization.ownerId,
            response: finalization.response as never,
          });
        } else if (idempotencyRecord.status !== 'COMPLETED') {
          throw new Error(
            `Inventory finalization cannot continue from idempotency status ${idempotencyRecord.status}`,
          );
        }

        await this.outbox.releaseTransactionEvents(
          record.transactionId,
        );

        await this.transactions.setStatus(
          record.transactionId,
          'COMPLETED',
          {
            recoveredFinalization: true,
          },
        );

        await this.clearFinalizationRecovery(
          record.transactionId,
        );
        recovered += 1;
      } catch (error) {
        await this.database
          .collection('applicationTransactions')
          .updateOne(
            { transactionId: record.transactionId },
            {
              $set: {
                errorDetails: errorSnapshot(error),
                recoveryStatus:
                  'INVENTORY_FINALIZATION_PENDING',
              },
              $inc: {
                retryCount: 1,
                version: 1,
              },
              $currentDate: {
                updatedAt: true,
              },
            },
          );
      }
    }

    return recovered;
  }

  private async markFinalizationRecovery<T>(
    input: Readonly<{
      request: InventoryProcurementTransactionRequest<T>;
      transactionId: string;
      ownerId: string;
      response: JsonValue;
      error: unknown;
    }>,
  ): Promise<void> {
    await this.database
      .collection('applicationTransactions')
      .updateOne(
        {
          transactionId: input.transactionId,
        },
        {
          $set: {
            status: 'RECOVERY_REQUIRED',
            recoveryStatus:
              'INVENTORY_FINALIZATION_PENDING',
            errorDetails: errorSnapshot(input.error),
            'relatedEntities.finalization': {
              ownerId: input.ownerId,
              response: input.response,
              facilityId: input.request.facilityId,
              transactionType: input.request.transactionType,
              idempotencyKey: input.request.idempotencyKey,
            },
          },
          $inc: {
            retryCount: 1,
            version: 1,
          },
          $currentDate: {
            updatedAt: true,
          },
        },
      )
      .catch(() => undefined);
  }

  private async clearFinalizationRecovery(
    transactionId: string,
  ): Promise<void> {
    await this.database
      .collection('applicationTransactions')
      .updateOne(
        {
          transactionId,
        },
        {
          $unset: {
            recoveryStatus: '',
            'relatedEntities.finalization': '',
          },
          $inc: {
            version: 1,
          },
          $currentDate: {
            updatedAt: true,
          },
        },
      );
  }

  private async compensate(
    compensations: readonly InventoryProcurementTransactionCompensation[],
    actorUserId: string,
    correlationId: string,
  ): Promise<boolean> {
    let success = true;

    for (const compensation of [...compensations].reverse()) {
      try {
        await this.compensationExecutor.execute(
          compensation,
          actorUserId,
          correlationId,
        );
      } catch {
        success = false;
      }
    }

    return success;
  }

  private async databaseCheckpoint(
    transactionId: string,
    checkpoints: readonly {
      state: string;
      data?: Record<string, unknown>;
    }[],
    compensations: readonly InventoryProcurementTransactionCompensation[],
  ): Promise<void> {
    await this.database
      .collection('applicationTransactions')
      .updateOne(
        {
          transactionId,
        },
        {
          $set: {
            relatedEntities: {
              checkpoints,
              compensations,
            },
          },
          $inc: {
            version: 1,
          },
          $currentDate: {
            updatedAt: true,
          },
        },
      );
  }
}