import {
  FormularyItemModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  ConcurrencyConflictError,
  ConflictError,
  ForbiddenError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import type {
  ChangeInventoryCatalogStatusInput,
  ChangeSupplierStatusInput,
  CreateInventoryCategoryInput,
  CreateInventoryItemInput,
  CreateInventoryLocationInput,
  CreateSupplierInput,
  InventoryActorContext,
  InventoryBatchListQuery,
  InventoryCategoryListQuery,
  InventoryItemListQuery,
  InventoryLocationListQuery,
  InventoryUnitConversionRequest,
  StockBalanceListQuery,
  SupplierListQuery,
  UpdateInventoryCategoryInput,
  UpdateInventoryItemInput,
  UpdateInventoryLocationInput,
  UpdateSupplierInput,
} from '../inventory.contracts.js';

import type {
  InventoryAccessPolicyPort,
  InventoryCatalogRepositoryPort,
  InventoryClockPort,
  InventoryContextPort,
  InventoryStockQueryRepositoryPort,
  InventoryUnitConversionPort,
} from '../inventory.ports.js';

import type {
  InventoryProcurementAuditPort,
  InventoryProcurementOutboxPort,
  InventoryProcurementRealtimePort,
  InventoryProcurementTransactionContext,
  InventoryProcurementTransactionManagerPort,
} from '../inventory-procurement.ports.js';

import {
  normalizeInventoryText,
} from '../inventory.normalization.js';

export interface InventoryCatalogCommandContext {
  actor: InventoryActorContext;
  idempotencyKey: string;
}

export interface InventoryCatalogServiceDependencies {
  catalog: InventoryCatalogRepositoryPort;
  stockQueries: InventoryStockQueryRepositoryPort;
  context: InventoryContextPort;
  accessPolicy: InventoryAccessPolicyPort;
  unitConversion: InventoryUnitConversionPort;
  transactionManager: InventoryProcurementTransactionManagerPort;
  audit: InventoryProcurementAuditPort;
  outbox: InventoryProcurementOutboxPort;
  realtime: InventoryProcurementRealtimePort;
  clock: InventoryClockPort;
}

function requireAllowed(
  decision: Awaited<
    ReturnType<InventoryAccessPolicyPort['authorize']>
  >,
  requireCost = false,
): void {
  if (!decision.allowed) {
    throw new ForbiddenError(
      decision.denialReason ??
        'Inventory catalogue access was denied',
    );
  }

  if (requireCost && !decision.includeCost) {
    throw new ForbiddenError(
      'This inventory catalogue operation requires cost visibility',
    );
  }
}

function requireVersioned<T>(
  value: T | null,
  message: string,
): T {
  if (value === null) {
    throw new ConcurrencyConflictError(message);
  }

  return value;
}

function lockKey(
  namespace: string,
  facilityId: string,
  ...parts: readonly string[]
): string {
  return [
    namespace,
    facilityId,
    ...parts,
  ]
    .map((value) =>
      value
        .normalize('NFKC')
        .trim()
        .toLowerCase(),
    )
    .join(':');
}

function deduplicationKey(
  transactionId: string,
  action: string,
  entityId: string,
): string {
  return [
    transactionId,
    action,
    entityId,
  ].join(':');
}

function inventoryEntityKey(value: string): string {
  return normalizeInventoryText(value)
    .replaceAll(/[^a-z0-9]+/gu, '_')
    .replaceAll(/^_+|_+$/gu, '');
}

function safeSnapshot(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (
      [
        'notes',
        'description',
        'contacts',
        'addresses',
        'registrationNumber',
        'taxRegistrationNumber',
        'salesTaxRegistrationNumber',
        'drugSaleLicenseNumber',
        'deactivationReason',
        'suspensionReason',
      ].includes(key)
    ) {
      continue;
    }

    if (value instanceof Date) {
      snapshot[key] = value.toISOString();
    } else if (
      value !== null &&
      typeof value === 'object' &&
      'toHexString' in value &&
      typeof value.toHexString === 'function'
    ) {
      snapshot[key] = value.toHexString();
    } else if (
      value !== null &&
      typeof value === 'object' &&
      '_bsontype' in value &&
      value._bsontype === 'Decimal128'
    ) {
      snapshot[key] = String(value);
    } else {
      snapshot[key] = value;
    }
  }

  return snapshot;
}

export class InventoryCatalogService {
  public constructor(
    private readonly dependencies: InventoryCatalogServiceDependencies,
  ) {}

  public async listCategories(
    actor: InventoryActorContext,
    query: InventoryCategoryListQuery,
  ) {
    requireAllowed(
      await this.dependencies.accessPolicy.authorize({
        actor,
        action: 'CATALOG_READ',
      }),
    );

    return this.dependencies.catalog.listCategories(
      actor.facilityId,
      query,
    );
  }

  public async getCategory(
    actor: InventoryActorContext,
    categoryId: string,
  ) {
    requireAllowed(
      await this.dependencies.accessPolicy.authorize({
        actor,
        action: 'CATALOG_READ',
      }),
    );

    const category =
      await this.dependencies.catalog.findCategoryById(
        actor.facilityId,
        categoryId,
      );

    if (category === null) {
      throw new ResourceNotFoundError(
        'Inventory category was not found',
      );
    }

    return category;
  }

  public createCategory(
    context: InventoryCatalogCommandContext,
    input: CreateInventoryCategoryInput,
  ) {
    return this.dependencies.transactionManager.execute({
      transactionType: 'inventory.catalog.category.create',
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey(
          'inventory:category:create',
          context.actor.facilityId,
          input.categoryCode,
        ),
      ],
      idempotencyPayload: input,
      journalPayload: {
        operation: 'CREATE_INVENTORY_CATEGORY',
        categoryCode: input.categoryCode,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const actor =
          await this.dependencies.context.requireActiveActorStaff(
            context.actor,
          );

        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'ITEM_MANAGE',
          }),
        );

        const hierarchy = await this.resolveCategoryHierarchy(
          context.actor.facilityId,
          input.parentCategoryId ?? null,
        );

        const created = await this.dependencies.catalog.createCategory(
          input,
          {
            facilityId: context.actor.facilityId,
            actorUserId: context.actor.userId,
            transactionId: transaction.transactionId,
            correlationId: context.actor.correlationId,
            occurredAt,
            ancestorCategoryIds: hierarchy.ancestorIds,
            hierarchyDepth: hierarchy.depth,
          },
        );

        await transaction.registerCompensation({
          key: deduplicationKey(
            transaction.transactionId,
            'delete-category',
            created._id.toHexString(),
          ),
          type: 'inventory.catalog.delete-created',
          payload: {
            collection: 'inventoryCategories',
            entityId: created._id.toHexString(),
            facilityId: context.actor.facilityId,
            transactionId: transaction.transactionId,
          },
        });

        await this.publish(
          context,
          transaction,
          actor.staffId,
          occurredAt,
          'inventory.category.created',
          'inventory.category.created.v1',
          'inventory.catalog.changed',
          'InventoryCategory',
          created._id.toHexString(),
          safeSnapshot(created as unknown as Record<string, unknown>),
        );

        return created;
      },
    });
  }

  public updateCategory(
    context: InventoryCatalogCommandContext,
    categoryId: string,
    input: UpdateInventoryCategoryInput,
  ) {
    return this.dependencies.transactionManager.execute({
      transactionType: 'inventory.catalog.category.update',
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey(
          'inventory:category',
          context.actor.facilityId,
          categoryId,
        ),
      ],
      idempotencyPayload: input,
      journalPayload: {
        operation: 'UPDATE_INVENTORY_CATEGORY',
        categoryId,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const actor =
          await this.dependencies.context.requireActiveActorStaff(
            context.actor,
          );
        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'ITEM_MANAGE',
          }),
        );

        const current =
          await this.dependencies.catalog.findCategoryById(
            context.actor.facilityId,
            categoryId,
          );

        if (current === null) {
          throw new ResourceNotFoundError(
            'Inventory category was not found',
          );
        }

        if (
          input.parentCategoryId !== undefined &&
          input.parentCategoryId !==
            current.parentCategoryId?.toHexString()
        ) {
          if (
            input.parentCategoryId === categoryId ||
            current.ancestorCategoryIds.some(
              (ancestor) =>
                ancestor.toHexString() === input.parentCategoryId,
            )
          ) {
            throw new ConflictError(
              'Inventory category hierarchy cannot contain a cycle',
            );
          }

          const children =
            await this.dependencies.catalog.countActiveCategoryChildren(
              context.actor.facilityId,
              categoryId,
            );

          if (children > 0) {
            throw new ConflictError(
              'Move child categories before changing this category parent',
            );
          }
        }

        const hierarchy = await this.resolveCategoryHierarchy(
          context.actor.facilityId,
          input.parentCategoryId === undefined
            ? current.parentCategoryId?.toHexString() ?? null
            : input.parentCategoryId,
        );

        const updated = requireVersioned(
          await this.dependencies.catalog.updateCategory(
            context.actor.facilityId,
            categoryId,
            input,
            {
              actorUserId: context.actor.userId,
              ancestorCategoryIds: hierarchy.ancestorIds,
              hierarchyDepth: hierarchy.depth,
            },
          ),
          'The inventory category changed before the update completed',
        );

        await this.publish(
          context,
          transaction,
          actor.staffId,
          occurredAt,
          'inventory.category.updated',
          'inventory.category.updated.v1',
          'inventory.catalog.changed',
          'InventoryCategory',
          categoryId,
          safeSnapshot(updated as unknown as Record<string, unknown>),
          safeSnapshot(current as unknown as Record<string, unknown>),
        );

        return updated;
      },
    });
  }

  public changeCategoryStatus(
    context: InventoryCatalogCommandContext,
    categoryId: string,
    input: ChangeInventoryCatalogStatusInput,
  ) {
    return this.changeCatalogStatus(
      context,
      'InventoryCategory',
      categoryId,
      input,
    );
  }

  public async listItems(
    actor: InventoryActorContext,
    query: InventoryItemListQuery,
  ) {
    const access = await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'CATALOG_READ',
    });
    requireAllowed(access);

    return this.dependencies.catalog.listItems(
      actor.facilityId,
      query,
      access.includeCost,
    );
  }

  public async getItem(
    actor: InventoryActorContext,
    itemId: string,
  ) {
    const access = await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'CATALOG_READ',
    });
    requireAllowed(access);

    const item = await this.dependencies.catalog.findItemById(
      actor.facilityId,
      itemId,
      access.includeCost,
    );

    if (item === null) {
      throw new ResourceNotFoundError(
        'Inventory item was not found',
      );
    }

    return item;
  }

  public createItem(
    context: InventoryCatalogCommandContext,
    input: CreateInventoryItemInput,
  ) {
    return this.dependencies.transactionManager.execute({
      transactionType: 'inventory.catalog.item.create',
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey(
          'inventory:item:create',
          context.actor.facilityId,
          input.itemCode,
        ),
        ...(input.formularyItemId == null
          ? []
          : [
              lockKey(
                'inventory:formulary-link',
                context.actor.facilityId,
                input.formularyItemId,
              ),
            ]),
      ],
      idempotencyPayload: input,
      journalPayload: {
        operation: 'CREATE_INVENTORY_ITEM',
        itemCode: input.itemCode,
        itemType: input.itemType,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const actor =
          await this.dependencies.context.requireActiveActorStaff(
            context.actor,
          );
        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'ITEM_MANAGE',
          }),
          true,
        );

        await this.validateItemReferences(
          context.actor.facilityId,
          input,
        );

        const created = await this.dependencies.catalog.createItem(
          input,
          {
            facilityId: context.actor.facilityId,
            actorUserId: context.actor.userId,
            transactionId: transaction.transactionId,
            correlationId: context.actor.correlationId,
            occurredAt,
          },
        );

        if (input.formularyItemId != null) {
          const linkResult = await FormularyItemModel.updateOne(
            {
              _id: toObjectId(
                input.formularyItemId,
                'formularyItemId',
              ),
              facilityId: toObjectId(
                context.actor.facilityId,
                'facilityId',
              ),
              status: 'ACTIVE',
              $or: [
                { inventoryItemId: null },
                { inventoryItemId: created._id },
              ],
            },
            {
              $set: {
                inventoryItemId: created._id,
                stockTracked: true,
                updatedBy: toObjectId(
                  context.actor.userId,
                  'actorUserId',
                ),
              },
              $inc: {
                version: 1,
              },
              $currentDate: {
                updatedAt: true,
              },
            },
          ).exec();

          if (linkResult.matchedCount !== 1) {
            throw new ConflictError(
              'The formulary item is already linked to another inventory item',
            );
          }
        }

        await transaction.registerCompensation({
          key: deduplicationKey(
            transaction.transactionId,
            'delete-item',
            created._id.toHexString(),
          ),
          type: 'inventory.catalog.delete-created',
          payload: {
            collection: 'inventoryItems',
            entityId: created._id.toHexString(),
            facilityId: context.actor.facilityId,
            transactionId: transaction.transactionId,
            formularyItemId: input.formularyItemId ?? null,
          },
        });

        await this.publish(
          context,
          transaction,
          actor.staffId,
          occurredAt,
          'inventory.item.created',
          'inventory.item.created.v1',
          'inventory.catalog.changed',
          'InventoryItem',
          created._id.toHexString(),
          safeSnapshot(created as unknown as Record<string, unknown>),
        );

        return created;
      },
    });
  }

  public updateItem(
    context: InventoryCatalogCommandContext,
    itemId: string,
    input: UpdateInventoryItemInput,
  ) {
    return this.dependencies.transactionManager.execute({
      transactionType: 'inventory.catalog.item.update',
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey(
          'inventory:item',
          context.actor.facilityId,
          itemId,
        ),
      ],
      idempotencyPayload: input,
      journalPayload: {
        operation: 'UPDATE_INVENTORY_ITEM',
        itemId,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const actor =
          await this.dependencies.context.requireActiveActorStaff(
            context.actor,
          );
        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'ITEM_MANAGE',
          }),
          true,
        );

        const current = await this.dependencies.catalog.findItemById(
          context.actor.facilityId,
          itemId,
          true,
        );

        if (current === null) {
          throw new ResourceNotFoundError(
            'Inventory item was not found',
          );
        }

        await this.validateItemReferences(
          context.actor.facilityId,
          {
            itemType: current.itemType,
            categoryId:
              input.categoryId ?? current.categoryId.toHexString(),
            formularyItemId:
              current.formularyItemId?.toHexString() ?? null,
            stockUnitId: current.stockUnitId.toHexString(),
            purchaseUnitId:
              input.purchaseUnitId ??
              current.purchaseUnitId.toHexString(),
            issueUnitId:
              input.issueUnitId ??
              current.issueUnitId.toHexString(),
            preferredSupplierIds:
              input.preferredSupplierIds ??
              current.preferredSupplierIds.map((id) =>
                id.toHexString(),
              ),
            supplierCatalogueEntries:
              input.supplierCatalogueEntries ?? [],
          },
          itemId,
        );

        const updated = requireVersioned(
          await this.dependencies.catalog.updateItem(
            context.actor.facilityId,
            itemId,
            input,
            context.actor.userId,
          ),
          'The inventory item changed before the update completed',
        );

        await this.publish(
          context,
          transaction,
          actor.staffId,
          occurredAt,
          'inventory.item.updated',
          'inventory.item.updated.v1',
          'inventory.catalog.changed',
          'InventoryItem',
          itemId,
          safeSnapshot(updated as unknown as Record<string, unknown>),
          safeSnapshot(current as unknown as Record<string, unknown>),
        );

        return updated;
      },
    });
  }

  public changeItemStatus(
    context: InventoryCatalogCommandContext,
    itemId: string,
    input: ChangeInventoryCatalogStatusInput,
  ) {
    return this.changeCatalogStatus(
      context,
      'InventoryItem',
      itemId,
      input,
    );
  }

  public async convertUnit(
    actor: InventoryActorContext,
    itemId: string,
    request: InventoryUnitConversionRequest,
  ) {
    requireAllowed(
      await this.dependencies.accessPolicy.authorize({
        actor,
        action: 'CATALOG_READ',
      }),
    );

    const item = await this.dependencies.catalog.findItemById(
      actor.facilityId,
      itemId,
      false,
    );

    if (item === null || item.status !== 'ACTIVE') {
      throw new ResourceNotFoundError(
        'Active inventory item was not found',
      );
    }

    return this.dependencies.unitConversion.convert(item, request);
  }

  public async listSuppliers(
    actor: InventoryActorContext,
    query: SupplierListQuery,
  ) {
    const access = await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'CATALOG_READ',
    });
    requireAllowed(access);

    return this.dependencies.catalog.listSuppliers(
      actor.facilityId,
      query,
      access.includeCost,
    );
  }

  public async getSupplier(
    actor: InventoryActorContext,
    supplierId: string,
  ) {
    const access = await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'CATALOG_READ',
    });
    requireAllowed(access);

    const supplier = await this.dependencies.catalog.findSupplierById(
      actor.facilityId,
      supplierId,
      access.includeCost,
    );

    if (supplier === null) {
      throw new ResourceNotFoundError(
        'Inventory supplier was not found',
      );
    }

    return supplier;
  }

  public createSupplier(
    context: InventoryCatalogCommandContext,
    input: CreateSupplierInput,
  ) {
    return this.dependencies.transactionManager.execute({
      transactionType: 'inventory.catalog.supplier.create',
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey(
          'inventory:supplier:create',
          context.actor.facilityId,
          input.supplierCode,
        ),
      ],
      idempotencyPayload: input,
      journalPayload: {
        operation: 'CREATE_INVENTORY_SUPPLIER',
        supplierCode: input.supplierCode,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const actor =
          await this.dependencies.context.requireActiveActorStaff(
            context.actor,
          );
        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'SUPPLIER_MANAGE',
          }),
          true,
        );

        const created = await this.dependencies.catalog.createSupplier(
          input,
          {
            facilityId: context.actor.facilityId,
            actorUserId: context.actor.userId,
            transactionId: transaction.transactionId,
            correlationId: context.actor.correlationId,
            occurredAt,
          },
        );

        await transaction.registerCompensation({
          key: deduplicationKey(
            transaction.transactionId,
            'delete-supplier',
            created._id.toHexString(),
          ),
          type: 'inventory.catalog.delete-created',
          payload: {
            collection: 'suppliers',
            entityId: created._id.toHexString(),
            facilityId: context.actor.facilityId,
            transactionId: transaction.transactionId,
          },
        });

        await this.publish(
          context,
          transaction,
          actor.staffId,
          occurredAt,
          'inventory.supplier.created',
          'inventory.supplier.created.v1',
          'inventory.supplier_worklist.changed',
          'Supplier',
          created._id.toHexString(),
          safeSnapshot(created as unknown as Record<string, unknown>),
        );

        return created;
      },
    });
  }

  public updateSupplier(
    context: InventoryCatalogCommandContext,
    supplierId: string,
    input: UpdateSupplierInput,
  ) {
    return this.dependencies.transactionManager.execute({
      transactionType: 'inventory.catalog.supplier.update',
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey(
          'inventory:supplier',
          context.actor.facilityId,
          supplierId,
        ),
      ],
      idempotencyPayload: input,
      journalPayload: {
        operation: 'UPDATE_INVENTORY_SUPPLIER',
        supplierId,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const actor =
          await this.dependencies.context.requireActiveActorStaff(
            context.actor,
          );
        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'SUPPLIER_MANAGE',
          }),
          true,
        );

        const current =
          await this.dependencies.catalog.findSupplierById(
            context.actor.facilityId,
            supplierId,
            true,
          );

        if (current === null) {
          throw new ResourceNotFoundError(
            'Inventory supplier was not found',
          );
        }

        const updated = requireVersioned(
          await this.dependencies.catalog.updateSupplier(
            context.actor.facilityId,
            supplierId,
            input,
            context.actor.userId,
          ),
          'The inventory supplier changed before the update completed',
        );

        await this.publish(
          context,
          transaction,
          actor.staffId,
          occurredAt,
          'inventory.supplier.updated',
          'inventory.supplier.updated.v1',
          'inventory.supplier_worklist.changed',
          'Supplier',
          supplierId,
          safeSnapshot(updated as unknown as Record<string, unknown>),
          safeSnapshot(current as unknown as Record<string, unknown>),
        );

        return updated;
      },
    });
  }

  public changeSupplierStatus(
    context: InventoryCatalogCommandContext,
    supplierId: string,
    input: ChangeSupplierStatusInput,
  ) {
    return this.dependencies.transactionManager.execute({
      transactionType: 'inventory.catalog.supplier.status',
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey(
          'inventory:supplier',
          context.actor.facilityId,
          supplierId,
        ),
      ],
      idempotencyPayload: input,
      journalPayload: {
        operation: 'CHANGE_INVENTORY_SUPPLIER_STATUS',
        supplierId,
        status: input.status,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const actor =
          await this.dependencies.context.requireActiveActorStaff(
            context.actor,
          );
        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'SUPPLIER_MANAGE',
          }),
          true,
        );

        const current =
          await this.dependencies.catalog.findSupplierById(
            context.actor.facilityId,
            supplierId,
            true,
          );

        if (current === null) {
          throw new ResourceNotFoundError(
            'Inventory supplier was not found',
          );
        }

        const updated = requireVersioned(
          await this.dependencies.catalog.changeSupplierStatus(
            context.actor.facilityId,
            supplierId,
            input,
            context.actor.userId,
            occurredAt,
          ),
          'The inventory supplier changed before the status update completed',
        );

        await this.publish(
          context,
          transaction,
          actor.staffId,
          occurredAt,
          'inventory.supplier.status_changed',
          'inventory.supplier.status_changed.v1',
          'inventory.supplier_worklist.changed',
          'Supplier',
          supplierId,
          safeSnapshot(updated as unknown as Record<string, unknown>),
          safeSnapshot(current as unknown as Record<string, unknown>),
          input.reason,
        );

        return updated;
      },
    });
  }

  public async listLocations(
    actor: InventoryActorContext,
    query: InventoryLocationListQuery,
  ) {
    requireAllowed(
      await this.dependencies.accessPolicy.authorize({
        actor,
        action: 'CATALOG_READ',
      }),
    );

    return this.dependencies.catalog.listLocations(
      actor.facilityId,
      query,
    );
  }

  public async getLocation(
    actor: InventoryActorContext,
    locationId: string,
  ) {
    requireAllowed(
      await this.dependencies.accessPolicy.authorize({
        actor,
        action: 'CATALOG_READ',
      }),
    );

    const location =
      await this.dependencies.catalog.findLocationById(
        actor.facilityId,
        locationId,
      );

    if (location === null) {
      throw new ResourceNotFoundError(
        'Inventory location was not found',
      );
    }

    return location;
  }

  public createLocation(
    context: InventoryCatalogCommandContext,
    input: CreateInventoryLocationInput,
  ) {
    return this.dependencies.transactionManager.execute({
      transactionType: 'inventory.catalog.location.create',
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey(
          'inventory:location:create',
          context.actor.facilityId,
          input.locationCode,
        ),
      ],
      idempotencyPayload: input,
      journalPayload: {
        operation: 'CREATE_INVENTORY_LOCATION',
        locationCode: input.locationCode,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const actor =
          await this.dependencies.context.requireActiveActorStaff(
            context.actor,
          );
        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'LOCATION_MANAGE',
          }),
        );

        const hierarchy = await this.resolveLocationHierarchy(
          context.actor.facilityId,
          input.parentLocationId ?? null,
        );

        const created = await this.dependencies.catalog.createLocation(
          input,
          {
            facilityId: context.actor.facilityId,
            actorUserId: context.actor.userId,
            transactionId: transaction.transactionId,
            correlationId: context.actor.correlationId,
            occurredAt,
            ancestorLocationIds: hierarchy.ancestorIds,
            hierarchyDepth: hierarchy.depth,
          },
        );

        await transaction.registerCompensation({
          key: deduplicationKey(
            transaction.transactionId,
            'delete-location',
            created._id.toHexString(),
          ),
          type: 'inventory.catalog.delete-created',
          payload: {
            collection: 'storeLocations',
            entityId: created._id.toHexString(),
            facilityId: context.actor.facilityId,
            transactionId: transaction.transactionId,
          },
        });

        await this.publish(
          context,
          transaction,
          actor.staffId,
          occurredAt,
          'inventory.location.created',
          'inventory.location.created.v1',
          'inventory.location_worklist.changed',
          'StoreLocation',
          created._id.toHexString(),
          safeSnapshot(created as unknown as Record<string, unknown>),
        );

        return created;
      },
    });
  }

  public updateLocation(
    context: InventoryCatalogCommandContext,
    locationId: string,
    input: UpdateInventoryLocationInput,
  ) {
    return this.dependencies.transactionManager.execute({
      transactionType: 'inventory.catalog.location.update',
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey(
          'inventory:location',
          context.actor.facilityId,
          locationId,
        ),
      ],
      idempotencyPayload: input,
      journalPayload: {
        operation: 'UPDATE_INVENTORY_LOCATION',
        locationId,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const actor =
          await this.dependencies.context.requireActiveActorStaff(
            context.actor,
          );
        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'LOCATION_MANAGE',
          }),
        );

        const current =
          await this.dependencies.catalog.findLocationById(
            context.actor.facilityId,
            locationId,
          );

        if (current === null) {
          throw new ResourceNotFoundError(
            'Inventory location was not found',
          );
        }

        if (
          input.parentLocationId !== undefined &&
          input.parentLocationId !==
            current.parentLocationId?.toHexString()
        ) {
          if (
            input.parentLocationId === locationId ||
            current.ancestorLocationIds.some(
              (ancestor) =>
                ancestor.toHexString() === input.parentLocationId,
            )
          ) {
            throw new ConflictError(
              'Inventory location hierarchy cannot contain a cycle',
            );
          }

          const children =
            await this.dependencies.catalog.countActiveLocationChildren(
              context.actor.facilityId,
              locationId,
            );

          if (children > 0) {
            throw new ConflictError(
              'Move child locations before changing this location parent',
            );
          }
        }

        const hierarchy = await this.resolveLocationHierarchy(
          context.actor.facilityId,
          input.parentLocationId === undefined
            ? current.parentLocationId?.toHexString() ?? null
            : input.parentLocationId,
        );

        const updated = requireVersioned(
          await this.dependencies.catalog.updateLocation(
            context.actor.facilityId,
            locationId,
            input,
            {
              actorUserId: context.actor.userId,
              ancestorLocationIds: hierarchy.ancestorIds,
              hierarchyDepth: hierarchy.depth,
            },
          ),
          'The inventory location changed before the update completed',
        );

        await this.publish(
          context,
          transaction,
          actor.staffId,
          occurredAt,
          'inventory.location.updated',
          'inventory.location.updated.v1',
          'inventory.location_worklist.changed',
          'StoreLocation',
          locationId,
          safeSnapshot(updated as unknown as Record<string, unknown>),
          safeSnapshot(current as unknown as Record<string, unknown>),
        );

        return updated;
      },
    });
  }

  public changeLocationStatus(
    context: InventoryCatalogCommandContext,
    locationId: string,
    input: ChangeInventoryCatalogStatusInput,
  ) {
    return this.changeCatalogStatus(
      context,
      'StoreLocation',
      locationId,
      input,
    );
  }

  public async listBatches(
    actor: InventoryActorContext,
    query: InventoryBatchListQuery,
  ) {
    const access = await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'STOCK_READ',
    });
    requireAllowed(access);

    return this.dependencies.stockQueries.listBatches(
      actor.facilityId,
      query,
      access.includeCost,
    );
  }

  public async listBalances(
    actor: InventoryActorContext,
    query: StockBalanceListQuery,
  ) {
    requireAllowed(
      await this.dependencies.accessPolicy.authorize({
        actor,
        action: 'STOCK_READ',
      }),
    );

    if (query.locationId !== undefined) {
      await this.dependencies.context.resolveOperationalLocation(
        actor,
        query.locationId,
      );
    }

    return this.dependencies.stockQueries.listBalances(
      actor.facilityId,
      query,
    );
  }

  private async changeCatalogStatus(
    context: InventoryCatalogCommandContext,
    entityType:
      | 'InventoryCategory'
      | 'InventoryItem'
      | 'StoreLocation',
    entityId: string,
    input: ChangeInventoryCatalogStatusInput,
  ) {
    return this.dependencies.transactionManager.execute({
      transactionType: `inventory.catalog.${normalizeInventoryText(
        entityType,
      )}.status`,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey(
          `inventory:${entityType}`,
          context.actor.facilityId,
          entityId,
        ),
      ],
      idempotencyPayload: input,
      journalPayload: {
        operation: 'CHANGE_INVENTORY_CATALOG_STATUS',
        entityType,
        entityId,
        status: input.status,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const actor =
          await this.dependencies.context.requireActiveActorStaff(
            context.actor,
          );
        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action:
              entityType === 'StoreLocation'
                ? 'LOCATION_MANAGE'
                : 'ITEM_MANAGE',
          }),
        );

        const current =
          entityType === 'InventoryCategory'
            ? await this.dependencies.catalog.findCategoryById(
                context.actor.facilityId,
                entityId,
              )
            : entityType === 'InventoryItem'
              ? await this.dependencies.catalog.findItemById(
                  context.actor.facilityId,
                  entityId,
                  false,
                )
              : await this.dependencies.catalog.findLocationById(
                  context.actor.facilityId,
                  entityId,
                );

        if (current === null) {
          throw new ResourceNotFoundError(
            `${entityType} was not found`,
          );
        }

        if (
          input.status === 'INACTIVE' &&
          entityType === 'InventoryCategory' &&
          (await this.dependencies.catalog.countActiveCategoryChildren(
            context.actor.facilityId,
            entityId,
          )) > 0
        ) {
          throw new ConflictError(
            'Deactivate or move active child categories first',
          );
        }

        if (
          input.status === 'INACTIVE' &&
          entityType === 'StoreLocation' &&
          (await this.dependencies.catalog.countActiveLocationChildren(
            context.actor.facilityId,
            entityId,
          )) > 0
        ) {
          throw new ConflictError(
            'Deactivate or move active child locations first',
          );
        }

        const updated = requireVersioned(
          entityType === 'InventoryCategory'
            ? await this.dependencies.catalog.changeCategoryStatus(
                context.actor.facilityId,
                entityId,
                input,
                context.actor.userId,
                occurredAt,
              )
            : entityType === 'InventoryItem'
              ? await this.dependencies.catalog.changeItemStatus(
                  context.actor.facilityId,
                  entityId,
                  input,
                  context.actor.userId,
                  occurredAt,
                )
              : await this.dependencies.catalog.changeLocationStatus(
                  context.actor.facilityId,
                  entityId,
                  input,
                  context.actor.userId,
                  occurredAt,
                ),
          `${entityType} changed before the status update completed`,
        );

        await this.publish(
          context,
          transaction,
          actor.staffId,
          occurredAt,
          `inventory.${inventoryEntityKey(entityType)}.status_changed`,
          `inventory.${inventoryEntityKey(entityType)}.status_changed.v1`,
          'inventory.catalog.changed',
          entityType,
          entityId,
          safeSnapshot(updated as unknown as Record<string, unknown>),
          safeSnapshot(current as unknown as Record<string, unknown>),
          input.reason,
        );

        return updated;
      },
    });
  }

  private async validateItemReferences(
    facilityId: string,
    input: Pick<
      CreateInventoryItemInput,
      | 'itemType'
      | 'categoryId'
      | 'formularyItemId'
      | 'stockUnitId'
      | 'purchaseUnitId'
      | 'issueUnitId'
      | 'preferredSupplierIds'
      | 'supplierCatalogueEntries'
    >,
    excludeItemId?: string,
  ): Promise<void> {
    const category = await this.dependencies.catalog.findCategoryById(
      facilityId,
      input.categoryId,
    );

    if (category === null || category.status !== 'ACTIVE') {
      throw new ConflictError(
        'Inventory item requires an active category',
      );
    }

    const unitIds = [
      input.stockUnitId,
      input.purchaseUnitId,
      input.issueUnitId,
      ...(input.supplierCatalogueEntries ?? []).map(
        (entry) => entry.purchaseUnitId,
      ),
    ];
    const units = await this.dependencies.catalog.findUnitsOfMeasureByIds(
      facilityId,
      unitIds,
    );
    const activeUnitIds = new Set(
      units
        .filter((unit) => unit.status === 'ACTIVE')
        .map((unit) => unit._id.toHexString()),
    );

    if (
      [...new Set(unitIds)].some(
        (unitId) => !activeUnitIds.has(unitId),
      )
    ) {
      throw new ConflictError(
        'Inventory item references an inactive or unavailable unit of measure',
      );
    }

    const stockUnit = units.find(
      (unit) => unit._id.toHexString() === input.stockUnitId,
    );

    if (
      stockUnit === undefined ||
      units.some(
        (unit) => unit.dimension !== stockUnit.dimension,
      )
    ) {
      throw new ConflictError(
        'All inventory item units must use the same measurement dimension',
      );
    }

    if (input.itemType === 'MEDICATION') {
      if (input.formularyItemId == null) {
        throw new ConflictError(
          'Medication inventory items require a formulary link',
        );
      }

      const formulary =
        await this.dependencies.catalog.findFormularyItemById(
          facilityId,
          input.formularyItemId,
        );

      if (
        formulary === null ||
        formulary.status !== 'ACTIVE'
      ) {
        throw new ConflictError(
          'Medication inventory item requires an active formulary item',
        );
      }

      const existing =
        await this.dependencies.catalog.findItemByFormularyItemId(
          facilityId,
          input.formularyItemId,
        );

      if (
        existing !== null &&
        existing._id.toHexString() !== excludeItemId
      ) {
        throw new ConflictError(
          'The formulary item is already linked to active inventory stock',
        );
      }
    } else if (input.formularyItemId != null) {
      throw new ConflictError(
        'Non-medication inventory items cannot link to the formulary',
      );
    }

    const supplierIds = [
      ...(input.preferredSupplierIds ?? []),
      ...(input.supplierCatalogueEntries ?? []).map(
        (entry) => entry.supplierId,
      ),
    ];

    for (const supplierId of new Set(supplierIds)) {
      const supplier = await this.dependencies.catalog.findSupplierById(
        facilityId,
        supplierId,
        false,
      );

      if (supplier === null || supplier.status !== 'ACTIVE') {
        throw new ConflictError(
          'Inventory item references an inactive or unavailable supplier',
        );
      }
    }
  }

  private async resolveCategoryHierarchy(
    facilityId: string,
    parentCategoryId: string | null,
  ): Promise<{
    ancestorIds: string[];
    depth: number;
  }> {
    if (parentCategoryId === null) {
      return {
        ancestorIds: [],
        depth: 0,
      };
    }

    const parent = await this.dependencies.catalog.findCategoryById(
      facilityId,
      parentCategoryId,
    );

    if (parent === null || parent.status !== 'ACTIVE') {
      throw new ConflictError(
        'Inventory category parent is inactive or unavailable',
      );
    }

    return {
      ancestorIds: [
        ...parent.ancestorCategoryIds.map((id) => id.toHexString()),
        parent._id.toHexString(),
      ],
      depth: parent.hierarchyDepth + 1,
    };
  }

  private async resolveLocationHierarchy(
    facilityId: string,
    parentLocationId: string | null,
  ): Promise<{
    ancestorIds: string[];
    depth: number;
  }> {
    if (parentLocationId === null) {
      return {
        ancestorIds: [],
        depth: 0,
      };
    }

    const parent = await this.dependencies.catalog.findLocationById(
      facilityId,
      parentLocationId,
    );

    if (parent === null || parent.status !== 'ACTIVE') {
      throw new ConflictError(
        'Inventory location parent is inactive or unavailable',
      );
    }

    return {
      ancestorIds: [
        ...parent.ancestorLocationIds.map((id) => id.toHexString()),
        parent._id.toHexString(),
      ],
      depth: parent.hierarchyDepth + 1,
    };
  }

  private async publish(
    context: InventoryCatalogCommandContext,
    transaction: InventoryProcurementTransactionContext,
    actorStaffId: string,
    occurredAt: Date,
    auditAction: string,
    outboxEvent: string,
    realtimeEvent: string,
    entityType: string,
    entityId: string,
    after: Record<string, unknown>,
    before?: Record<string, unknown>,
    reason?: string,
  ): Promise<void> {
    const key = deduplicationKey(
      transaction.transactionId,
      auditAction,
      entityId,
    );

    await this.dependencies.audit.append({
      transactionId: transaction.transactionId,
      deduplicationKey: key,
      action: auditAction,
      entityType,
      entityId,
      actorUserId: context.actor.userId,
      actorStaffId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      occurredAt,
      ...(context.actor.ipAddress === undefined
        ? {}
        : {
            ipAddress: context.actor.ipAddress,
          }),
      ...(context.actor.userAgent === undefined
        ? {}
        : {
            userAgent: context.actor.userAgent,
          }),
      ...(reason === undefined ? {} : { reason }),
      ...(before === undefined ? {} : { before }),
      after,
    });

    await this.dependencies.outbox.enqueue({
      transactionId: transaction.transactionId,
      deduplicationKey: `${key}:outbox`,
      eventType: outboxEvent,
      aggregateType: entityType,
      aggregateId: entityId,
      actorUserId: context.actor.userId,
      actorStaffId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      occurredAt,
      payload: {
        entityId,
        status: after['status'] ?? null,
        version: after['version'] ?? null,
      },
    });

    await this.dependencies.realtime.publish({
      eventType: realtimeEvent,
      facilityId: context.actor.facilityId,
      payload: {
        entityType,
        entityId,
        status: after['status'] ?? null,
        version: after['version'] ?? null,
      },
    });
  }
}