import {
  Types,
  type FilterQuery,
  type UpdateQuery,
} from 'mongoose';

import {
  FormularyItemModel,
  InventoryCategoryModel,
  InventoryItemModel,
  StoreLocationModel,
  SupplierModel,
  UnitOfMeasureModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  ChangeInventoryCatalogStatusInput,
  ChangeSupplierStatusInput,
  CreateInventoryCategoryInput,
  CreateInventoryItemInput,
  CreateInventoryLocationInput,
  CreateSupplierInput,
  InventoryCategoryListQuery,
  InventoryItemListQuery,
  InventoryLocationListQuery,
  SupplierListQuery,
  UpdateInventoryCategoryInput,
  UpdateInventoryItemInput,
  UpdateInventoryLocationInput,
  UpdateSupplierInput,
} from '../inventory.contracts.js';

import type {
  InventoryCatalogRepositoryPort,
  InventoryPage,
} from '../inventory.ports.js';

import type {
  InventoryCategoryRecord,
  InventoryFormularyItemRecord,
  InventoryItemRecord,
  InventoryUnitOfMeasureRecord,
  StoreLocationRecord,
  SupplierRecord,
} from '../inventory.persistence.types.js';

import {
  INVENTORY_CATEGORY_INTERNAL_SELECT,
  INVENTORY_ITEM_COST_SELECT,
  INVENTORY_ITEM_INTERNAL_SELECT,
  INVENTORY_ITEM_STANDARD_SELECT,
  INVENTORY_LOCATION_INTERNAL_SELECT,
  SUPPLIER_SENSITIVE_SELECT,
  SUPPLIER_STANDARD_SELECT,
} from '../inventory.projections.js';

import {
  buildInventorySearchText,
  escapeInventoryRegex,
  normalizeInventoryCode,
  normalizeInventoryCurrency,
  normalizeInventoryDisplayText,
  normalizeInventoryText,
  normalizeNullableInventoryText,
  uniqueInventoryObjectIds,
} from '../inventory.normalization.js';

import {
  throwMappedInventoryPersistenceError,
} from '../inventory.errors.js';

function record<T>(value: unknown): T {
  return value as T;
}

function decimal(value: string | null | undefined): Types.Decimal128 | null {
  return value == null
    ? null
    : Types.Decimal128.fromString(value);
}

function optionalObjectId(
  value: string | null | undefined,
  path: string,
): Types.ObjectId | null {
  return value == null
    ? null
    : toObjectId(value, path);
}

function pageResult<T>(
  items: T[],
  page: number,
  pageSize: number,
  totalItems: number,
): InventoryPage<T> {
  return {
    items,
    page,
    pageSize,
    totalItems,
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
  };
}

function pagination(
  page: number,
  pageSize: number,
): { page: number; pageSize: number; skip: number } {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);

  return {
    page: safePage,
    pageSize: safePageSize,
    skip: (safePage - 1) * safePageSize,
  };
}

function unitConversions(
  values: readonly {
    unitId: string;
    purpose: string;
    toStockUnitFactor: string;
    isDefault?: boolean;
  }[],
): Array<Record<string, unknown>> {
  return values.map((value) => ({
    unitId: toObjectId(value.unitId, 'unitConversions.unitId'),
    purpose: value.purpose,
    toStockUnitFactor: Types.Decimal128.fromString(value.toStockUnitFactor),
    isDefault: value.isDefault ?? false,
  }));
}

function supplierCatalogueEntries(
  values: readonly {
    supplierId: string;
    supplierItemCode: string;
    supplierItemName?: string | null;
    purchaseUnitId: string;
    purchaseUnitToStockFactor: string;
    minimumOrderQuantity?: string;
    lastQuotedUnitCost?: string | null;
    currency?: string;
    leadTimeDays?: number | null;
    preferred?: boolean;
    active?: boolean;
  }[],
): Array<Record<string, unknown>> {
  return values.map((value) => ({
    supplierId: toObjectId(value.supplierId, 'supplierCatalogueEntries.supplierId'),
    supplierItemCode: normalizeInventoryDisplayText(value.supplierItemCode),
    supplierItemName: normalizeNullableInventoryText(value.supplierItemName),
    purchaseUnitId: toObjectId(value.purchaseUnitId, 'supplierCatalogueEntries.purchaseUnitId'),
    purchaseUnitToStockFactor: Types.Decimal128.fromString(value.purchaseUnitToStockFactor),
    minimumOrderQuantity: Types.Decimal128.fromString(value.minimumOrderQuantity ?? '1'),
    lastQuotedUnitCost: decimal(value.lastQuotedUnitCost),
    currency: normalizeInventoryCurrency(value.currency ?? 'PKR'),
    leadTimeDays: value.leadTimeDays ?? null,
    preferred: value.preferred ?? false,
    active: value.active ?? true,
  }));
}

function supplierContacts(
  values: CreateSupplierInput['contacts'] | UpdateSupplierInput['contacts'],
): Array<Record<string, unknown>> | undefined {
  if (values === undefined) {
    return undefined;
  }

  return values.map((value) => ({
    contactType: value.contactType,
    name: normalizeInventoryDisplayText(value.name),
    designation: normalizeNullableInventoryText(value.designation),
    phone: normalizeNullableInventoryText(value.phone),
    email: normalizeNullableInventoryText(value.email)?.toLowerCase() ?? null,
    primary: value.primary ?? false,
    active: value.active ?? true,
  }));
}

function catalogLifecycleSet(
  status: 'ACTIVE' | 'INACTIVE',
  actorUserId: string,
  reason: string,
  occurredAt: Date,
): Record<string, unknown> {
  if (status === 'INACTIVE') {
    return {
      status,
      deactivatedAt: occurredAt,
      deactivatedBy: toObjectId(actorUserId, 'actorUserId'),
      deactivationReason: reason.trim(),
      updatedBy: toObjectId(actorUserId, 'actorUserId'),
    };
  }

  return {
    status,
    activatedAt: occurredAt,
    activatedBy: toObjectId(actorUserId, 'actorUserId'),
    deactivatedAt: null,
    deactivatedBy: null,
    deactivationReason: null,
    updatedBy: toObjectId(actorUserId, 'actorUserId'),
  };
}

function supplierLifecycleSet(
  status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE',
  actorUserId: string,
  reason: string,
  occurredAt: Date,
): Record<string, unknown> {
  const actorId = toObjectId(actorUserId, 'actorUserId');

  if (status === 'SUSPENDED') {
    return {
      status,
      suspendedAt: occurredAt,
      suspendedBy: actorId,
      suspensionReason: reason.trim(),
      deactivatedAt: null,
      deactivatedBy: null,
      deactivationReason: null,
      updatedBy: actorId,
    };
  }

  if (status === 'INACTIVE') {
    return {
      status,
      suspendedAt: null,
      suspendedBy: null,
      suspensionReason: null,
      deactivatedAt: occurredAt,
      deactivatedBy: actorId,
      deactivationReason: reason.trim(),
      updatedBy: actorId,
    };
  }

  return {
    status,
    activatedAt: occurredAt,
    activatedBy: actorId,
    suspendedAt: null,
    suspendedBy: null,
    suspensionReason: null,
    deactivatedAt: null,
    deactivatedBy: null,
    deactivationReason: null,
    updatedBy: actorId,
  };
}

function supplierAddresses(
  values: CreateSupplierInput['addresses'] | UpdateSupplierInput['addresses'],
): Array<Record<string, unknown>> | undefined {
  if (values === undefined) {
    return undefined;
  }

  return values.map((value) => ({
    addressType: value.addressType,
    line1: normalizeInventoryDisplayText(value.line1),
    line2: normalizeNullableInventoryText(value.line2),
    city: normalizeInventoryDisplayText(value.city),
    district: normalizeNullableInventoryText(value.district),
    province: normalizeNullableInventoryText(value.province),
    postalCode: normalizeNullableInventoryText(value.postalCode),
    countryCode: (value.countryCode ?? 'PK').trim().toUpperCase(),
    primary: value.primary ?? false,
    active: value.active ?? true,
  }));
}

export class InventoryCatalogRepository
implements InventoryCatalogRepositoryPort {
  public async findCategoryById(
    facilityId: string,
    categoryId: string,
  ): Promise<InventoryCategoryRecord | null> {
    return record<InventoryCategoryRecord | null>(
      await InventoryCategoryModel.findOne({
        _id: toObjectId(categoryId, 'categoryId'),
        facilityId: toObjectId(facilityId, 'facilityId'),
      })
        .select(INVENTORY_CATEGORY_INTERNAL_SELECT)
        .lean()
        .exec(),
    );
  }

  public async listCategories(
    facilityId: string,
    query: InventoryCategoryListQuery,
  ): Promise<InventoryPage<InventoryCategoryRecord>> {
    const filter: FilterQuery<unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
    };

    if (query.parentCategoryId !== undefined) {
      filter['parentCategoryId'] = query.parentCategoryId === null
        ? null
        : toObjectId(query.parentCategoryId, 'parentCategoryId');
    }

    if (query.categoryType !== undefined) {
      filter['categoryType'] = query.categoryType;
    }

    if (query.status !== undefined) {
      filter['status'] = query.status;
    }

    if (query.search !== undefined) {
      const search = new RegExp(escapeInventoryRegex(query.search.trim()), 'i');
      filter['$or'] = [
        { categoryCode: search },
        { name: search },
        { description: search },
      ];
    }

    const { page, pageSize, skip } = pagination(query.page, query.pageSize);
    const direction = query.sortDirection === 'desc' ? -1 : 1;
    const [items, totalItems] = await Promise.all([
      InventoryCategoryModel.find(filter)
        .select(INVENTORY_CATEGORY_INTERNAL_SELECT)
        .sort({ [query.sortBy]: direction, categoryCode: 1, _id: 1 })
        .skip(skip)
        .limit(pageSize)
        .lean()
        .exec(),
      InventoryCategoryModel.countDocuments(filter).exec(),
    ]);

    return pageResult(record<InventoryCategoryRecord[]>(items), page, pageSize, totalItems);
  }

  public async createCategory(
    input: CreateInventoryCategoryInput,
    metadata: Readonly<{
      facilityId: string;
      actorUserId: string;
      transactionId: string;
      correlationId: string;
      occurredAt: Date;
      ancestorCategoryIds: readonly string[];
      hierarchyDepth: number;
    }>,
  ): Promise<InventoryCategoryRecord> {
    try {
      const created = await InventoryCategoryModel.create({
        facilityId: toObjectId(metadata.facilityId, 'facilityId'),
        categoryCode: normalizeInventoryCode(input.categoryCode),
        name: normalizeInventoryDisplayText(input.name),
        normalizedName: normalizeInventoryText(input.name),
        categoryType: input.categoryType ?? 'MIXED',
        parentCategoryId: optionalObjectId(input.parentCategoryId, 'parentCategoryId'),
        ancestorCategoryIds: metadata.ancestorCategoryIds.map((value) => toObjectId(value, 'ancestorCategoryIds')),
        hierarchyDepth: metadata.hierarchyDepth,
        description: normalizeNullableInventoryText(input.description),
        displayOrder: input.displayOrder ?? 0,
        status: 'ACTIVE',
        activatedAt: metadata.occurredAt,
        activatedBy: toObjectId(metadata.actorUserId, 'actorUserId'),
        deactivatedAt: null,
        deactivatedBy: null,
        deactivationReason: null,
        transactionId: metadata.transactionId,
        correlationId: metadata.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: toObjectId(metadata.actorUserId, 'actorUserId'),
        updatedBy: toObjectId(metadata.actorUserId, 'actorUserId'),
      });

      return record<InventoryCategoryRecord>(created.toObject());
    } catch (error) {
      throwMappedInventoryPersistenceError(error);
    }
  }

  public async updateCategory(
    facilityId: string,
    categoryId: string,
    input: UpdateInventoryCategoryInput,
    metadata: Readonly<{
      actorUserId: string;
      ancestorCategoryIds: readonly string[];
      hierarchyDepth: number;
    }>,
  ): Promise<InventoryCategoryRecord | null> {
    const setValues: Record<string, unknown> = {
      updatedBy: toObjectId(metadata.actorUserId, 'actorUserId'),
    };

    if (input.name !== undefined) {
      setValues['name'] = normalizeInventoryDisplayText(input.name);
      setValues['normalizedName'] = normalizeInventoryText(input.name);
    }

    if (input.categoryType !== undefined) {
      setValues['categoryType'] = input.categoryType;
    }

    if (input.parentCategoryId !== undefined) {
      setValues['parentCategoryId'] = optionalObjectId(input.parentCategoryId, 'parentCategoryId');
      setValues['ancestorCategoryIds'] = metadata.ancestorCategoryIds.map(
        (value) => toObjectId(value, 'ancestorCategoryIds'),
      );
      setValues['hierarchyDepth'] = metadata.hierarchyDepth;
    }

    if (input.description !== undefined) {
      setValues['description'] = normalizeNullableInventoryText(input.description);
    }

    if (input.displayOrder !== undefined) {
      setValues['displayOrder'] = input.displayOrder;
    }

    try {
      return record<InventoryCategoryRecord | null>(
        await InventoryCategoryModel.findOneAndUpdate(
          {
            _id: toObjectId(categoryId, 'categoryId'),
            facilityId: toObjectId(facilityId, 'facilityId'),
            version: input.expectedVersion,
          },
          {
            $set: setValues,
            $inc: {
              version: 1,
            },
          },
          {
            new: true,
            runValidators: true,
          },
        )
          .select(INVENTORY_CATEGORY_INTERNAL_SELECT)
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedInventoryPersistenceError(error);
    }
  }

  public async changeCategoryStatus(
    facilityId: string,
    categoryId: string,
    input: ChangeInventoryCatalogStatusInput,
    actorUserId: string,
    occurredAt: Date,
  ): Promise<InventoryCategoryRecord | null> {
    return record<InventoryCategoryRecord | null>(
      await InventoryCategoryModel.findOneAndUpdate(
        {
          _id: toObjectId(categoryId, 'categoryId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: input.expectedVersion,
        },
        {
          $set: catalogLifecycleSet(
            input.status,
            actorUserId,
            input.reason,
            occurredAt,
          ),
          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
        .select(INVENTORY_CATEGORY_INTERNAL_SELECT)
        .lean()
        .exec(),
    );
  }

  public async countActiveCategoryChildren(
    facilityId: string,
    categoryId: string,
  ): Promise<number> {
    return InventoryCategoryModel.countDocuments({
      facilityId: toObjectId(facilityId, 'facilityId'),
      parentCategoryId: toObjectId(categoryId, 'categoryId'),
      status: 'ACTIVE',
    }).exec();
  }

  public async findItemById(
    facilityId: string,
    itemId: string,
    includeCost = false,
  ): Promise<InventoryItemRecord | null> {
    return record<InventoryItemRecord | null>(
      await InventoryItemModel.findOne({
        _id: toObjectId(itemId, 'itemId'),
        facilityId: toObjectId(facilityId, 'facilityId'),
      })
        .select(includeCost ? INVENTORY_ITEM_INTERNAL_SELECT : INVENTORY_ITEM_STANDARD_SELECT)
        .lean()
        .exec(),
    );
  }

  public async findItemByFormularyItemId(
    facilityId: string,
    formularyItemId: string,
  ): Promise<InventoryItemRecord | null> {
    return record<InventoryItemRecord | null>(
      await InventoryItemModel.findOne({
        facilityId: toObjectId(facilityId, 'facilityId'),
        formularyItemId: toObjectId(formularyItemId, 'formularyItemId'),
        status: 'ACTIVE',
      })
        .select(INVENTORY_ITEM_INTERNAL_SELECT)
        .lean()
        .exec(),
    );
  }

  public async listItems(
    facilityId: string,
    query: InventoryItemListQuery,
    includeCost = false,
  ): Promise<InventoryPage<InventoryItemRecord>> {
    const filter: FilterQuery<unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
    };

    if (query.categoryId !== undefined) {
      filter['categoryId'] = toObjectId(query.categoryId, 'categoryId');
    }

    if (query.itemType !== undefined) {
      filter['itemType'] = query.itemType;
    }

    if (query.formularyItemId !== undefined) {
      filter['formularyItemId'] = toObjectId(query.formularyItemId, 'formularyItemId');
    }

    if (query.supplierId !== undefined) {
      filter['supplierCatalogueEntries.supplierId'] = toObjectId(query.supplierId, 'supplierId');
    }

    if (query.status !== undefined) {
      filter['status'] = query.status;
    }

    if (query.controlledMedicine !== undefined) {
      filter['controlledMedicine'] = query.controlledMedicine;
    }

    if (query.highAlert !== undefined) {
      filter['highAlert'] = query.highAlert;
    }

    if (query.highValue !== undefined) {
      filter['highValue'] = query.highValue;
    }

    if (query.batchTrackingRequired !== undefined) {
      filter['batchTrackingRequired'] = query.batchTrackingRequired;
    }

    if (query.search !== undefined) {
      const terms = normalizeInventoryText(query.search)
        .split(' ')
        .filter(Boolean);

      filter['$and'] = terms.map((term) => ({
        searchText: new RegExp(escapeInventoryRegex(term), 'i'),
      }));
    }

    const { page, pageSize, skip } = pagination(query.page, query.pageSize);
    const direction = query.sortDirection === 'desc' ? -1 : 1;

    const [items, totalItems] = await Promise.all([
      InventoryItemModel.find(filter)
        .select(includeCost ? INVENTORY_ITEM_COST_SELECT : INVENTORY_ITEM_STANDARD_SELECT)
        .sort({
          [query.sortBy]: direction,
          itemCode: 1,
          _id: 1,
        })
        .skip(skip)
        .limit(pageSize)
        .lean()
        .exec(),

      InventoryItemModel.countDocuments(filter).exec(),
    ]);

    return pageResult(
      record<InventoryItemRecord[]>(items),
      page,
      pageSize,
      totalItems,
    );
  }

  public async createItem(
    input: CreateInventoryItemInput,
    metadata: Readonly<{
      facilityId: string;
      actorUserId: string;
      transactionId: string;
      correlationId: string;
      occurredAt: Date;
    }>,
  ): Promise<InventoryItemRecord> {
    try {
      const created = await InventoryItemModel.create({
        facilityId: toObjectId(metadata.facilityId, 'facilityId'),
        itemCode: normalizeInventoryCode(input.itemCode),
        name: normalizeInventoryDisplayText(input.name),
        normalizedName: normalizeInventoryText(input.name),
        itemType: input.itemType,
        categoryId: toObjectId(input.categoryId, 'categoryId'),
        formularyItemId: optionalObjectId(input.formularyItemId, 'formularyItemId'),
        barcode: normalizeNullableInventoryText(input.barcode),
        manufacturerName: normalizeNullableInventoryText(input.manufacturerName),
        description: normalizeNullableInventoryText(input.description),
        stockUnitId: toObjectId(input.stockUnitId, 'stockUnitId'),
        purchaseUnitId: toObjectId(input.purchaseUnitId, 'purchaseUnitId'),
        purchaseUnitToStockFactor: Types.Decimal128.fromString(
          input.purchaseUnitToStockFactor,
        ),
        issueUnitId: toObjectId(input.issueUnitId, 'issueUnitId'),
        issueUnitToStockFactor: Types.Decimal128.fromString(
          input.issueUnitToStockFactor,
        ),
        unitConversions: unitConversions(input.unitConversions ?? []),
        allowFractionalStock: input.allowFractionalStock ?? false,
        batchTrackingRequired: input.batchTrackingRequired ?? false,
        expiryTrackingRequired: input.expiryTrackingRequired ?? false,
        storageConditions: [...(input.storageConditions ?? ['AMBIENT'])],
        minimumStorageTemperatureCelsius: decimal(
          input.minimumStorageTemperatureCelsius,
        ),
        maximumStorageTemperatureCelsius: decimal(
          input.maximumStorageTemperatureCelsius,
        ),
        reorderLevel: Types.Decimal128.fromString(input.reorderLevel ?? '0'),
        minimumStockLevel: Types.Decimal128.fromString(
          input.minimumStockLevel ?? '0',
        ),
        maximumStockLevel: decimal(input.maximumStockLevel),
        safetyStockLevel: Types.Decimal128.fromString(
          input.safetyStockLevel ?? '0',
        ),
        nearExpiryWarningDays: input.nearExpiryWarningDays ?? 90,
        negativeStockAllowed: input.negativeStockAllowed ?? false,
        controlledMedicine: input.controlledMedicine ?? false,
        highAlert: input.highAlert ?? false,
        highValue: input.highValue ?? false,
        valuationMethod: input.valuationMethod ?? 'BATCH_COST',
        preferredSupplierIds: uniqueInventoryObjectIds(
          input.preferredSupplierIds ?? [],
        ).map((value) => toObjectId(value, 'preferredSupplierIds')),
        supplierCatalogueEntries: supplierCatalogueEntries(
          input.supplierCatalogueEntries ?? [],
        ),
        searchText: buildInventorySearchText(input),
        status: 'ACTIVE',
        activatedAt: metadata.occurredAt,
        activatedBy: toObjectId(metadata.actorUserId, 'actorUserId'),
        deactivatedAt: null,
        deactivatedBy: null,
        deactivationReason: null,
        transactionId: metadata.transactionId,
        correlationId: metadata.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: toObjectId(metadata.actorUserId, 'actorUserId'),
        updatedBy: toObjectId(metadata.actorUserId, 'actorUserId'),
      });

      return record<InventoryItemRecord>(created.toObject());
    } catch (error) {
      throwMappedInventoryPersistenceError(error);
    }
  }

  public async updateItem(
    facilityId: string,
    itemId: string,
    input: UpdateInventoryItemInput,
    actorUserId: string,
  ): Promise<InventoryItemRecord | null> {
    const current = await this.findItemById(facilityId, itemId, true);

    if (current === null) {
      return null;
    }

    const setValues: Record<string, unknown> = {
      updatedBy: toObjectId(actorUserId, 'actorUserId'),
    };

    if (input.name !== undefined) {
      setValues['name'] = normalizeInventoryDisplayText(input.name);
      setValues['normalizedName'] = normalizeInventoryText(input.name);
    }

    if (input.categoryId !== undefined) {
      setValues['categoryId'] = toObjectId(input.categoryId, 'categoryId');
    }

    if (input.barcode !== undefined) {
      setValues['barcode'] = normalizeNullableInventoryText(input.barcode);
    }

    if (input.manufacturerName !== undefined) {
      setValues['manufacturerName'] = normalizeNullableInventoryText(
        input.manufacturerName,
      );
    }

    if (input.description !== undefined) {
      setValues['description'] = normalizeNullableInventoryText(input.description);
    }

    if (input.purchaseUnitId !== undefined) {
      setValues['purchaseUnitId'] = toObjectId(input.purchaseUnitId, 'purchaseUnitId');
    }

    if (input.purchaseUnitToStockFactor !== undefined) {
      setValues['purchaseUnitToStockFactor'] = Types.Decimal128.fromString(
        input.purchaseUnitToStockFactor,
      );
    }

    if (input.issueUnitId !== undefined) {
      setValues['issueUnitId'] = toObjectId(input.issueUnitId, 'issueUnitId');
    }

    if (input.issueUnitToStockFactor !== undefined) {
      setValues['issueUnitToStockFactor'] = Types.Decimal128.fromString(
        input.issueUnitToStockFactor,
      );
    }

    if (input.unitConversions !== undefined) {
      setValues['unitConversions'] = unitConversions(input.unitConversions);
    }

    if (input.allowFractionalStock !== undefined) {
      setValues['allowFractionalStock'] = input.allowFractionalStock;
    }

    if (input.batchTrackingRequired !== undefined) {
      setValues['batchTrackingRequired'] = input.batchTrackingRequired;
    }

    if (input.expiryTrackingRequired !== undefined) {
      setValues['expiryTrackingRequired'] = input.expiryTrackingRequired;
    }

    if (input.storageConditions !== undefined) {
      setValues['storageConditions'] = [...input.storageConditions];
    }

    if (input.minimumStorageTemperatureCelsius !== undefined) {
      setValues['minimumStorageTemperatureCelsius'] = decimal(
        input.minimumStorageTemperatureCelsius,
      );
    }

    if (input.maximumStorageTemperatureCelsius !== undefined) {
      setValues['maximumStorageTemperatureCelsius'] = decimal(
        input.maximumStorageTemperatureCelsius,
      );
    }

    if (input.reorderLevel !== undefined) {
      setValues['reorderLevel'] = Types.Decimal128.fromString(input.reorderLevel);
    }

    if (input.minimumStockLevel !== undefined) {
      setValues['minimumStockLevel'] = Types.Decimal128.fromString(
        input.minimumStockLevel,
      );
    }

    if (input.maximumStockLevel !== undefined) {
      setValues['maximumStockLevel'] = decimal(input.maximumStockLevel);
    }

    if (input.safetyStockLevel !== undefined) {
      setValues['safetyStockLevel'] = Types.Decimal128.fromString(
        input.safetyStockLevel,
      );
    }

    if (input.nearExpiryWarningDays !== undefined) {
      setValues['nearExpiryWarningDays'] = input.nearExpiryWarningDays;
    }

    if (input.negativeStockAllowed !== undefined) {
      setValues['negativeStockAllowed'] = input.negativeStockAllowed;
    }

    if (input.controlledMedicine !== undefined) {
      setValues['controlledMedicine'] = input.controlledMedicine;
    }

    if (input.highAlert !== undefined) {
      setValues['highAlert'] = input.highAlert;
    }

    if (input.highValue !== undefined) {
      setValues['highValue'] = input.highValue;
    }

    if (input.preferredSupplierIds !== undefined) {
      setValues['preferredSupplierIds'] = uniqueInventoryObjectIds(
        input.preferredSupplierIds,
      ).map((value) => toObjectId(value, 'preferredSupplierIds'));
    }

    if (input.supplierCatalogueEntries !== undefined) {
      setValues['supplierCatalogueEntries'] = supplierCatalogueEntries(
        input.supplierCatalogueEntries,
      );
    }

    setValues['searchText'] = buildInventorySearchText({
      itemCode: current.itemCode,
      name: input.name ?? current.name,
      barcode: input.barcode === undefined ? current.barcode : input.barcode,
      manufacturerName:
        input.manufacturerName === undefined
          ? current.manufacturerName
          : input.manufacturerName,
    });

    try {
      return record<InventoryItemRecord | null>(
        await InventoryItemModel.findOneAndUpdate(
          {
            _id: toObjectId(itemId, 'itemId'),
            facilityId: toObjectId(facilityId, 'facilityId'),
            version: input.expectedVersion,
          },
          {
            $set: setValues,
            $inc: {
              version: 1,
            },
          },
          {
            new: true,
            runValidators: true,
          },
        )
          .select(INVENTORY_ITEM_INTERNAL_SELECT)
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedInventoryPersistenceError(error);
    }
  }

  public async changeItemStatus(
    facilityId: string,
    itemId: string,
    input: ChangeInventoryCatalogStatusInput,
    actorUserId: string,
    occurredAt: Date,
  ): Promise<InventoryItemRecord | null> {
    return record<InventoryItemRecord | null>(
      await InventoryItemModel.findOneAndUpdate(
        {
          _id: toObjectId(itemId, 'itemId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: input.expectedVersion,
        },
        {
          $set: catalogLifecycleSet(
            input.status,
            actorUserId,
            input.reason,
            occurredAt,
          ),
          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
        .select(INVENTORY_ITEM_INTERNAL_SELECT)
        .lean()
        .exec(),
    );
  }

  public async findSupplierById(
    facilityId: string,
    supplierId: string,
    includeSensitive = false,
  ): Promise<SupplierRecord | null> {
    return record<SupplierRecord | null>(
      await SupplierModel.findOne({
        _id: toObjectId(supplierId, 'supplierId'),
        facilityId: toObjectId(facilityId, 'facilityId'),
      })
        .select(includeSensitive ? SUPPLIER_SENSITIVE_SELECT : SUPPLIER_STANDARD_SELECT)
        .lean()
        .exec(),
    );
  }

  public async listSuppliers(
    facilityId: string,
    query: SupplierListQuery,
    includeSensitive = false,
  ): Promise<InventoryPage<SupplierRecord>> {
    const filter: FilterQuery<unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
    };

    if (query.status !== undefined) {
      filter['status'] = query.status;
    }

    if (query.search !== undefined) {
      const search = new RegExp(escapeInventoryRegex(query.search.trim()), 'i');

      filter['$or'] = [
        {
          supplierCode: search,
        },
        {
          legalName: search,
        },
        {
          tradingName: search,
        },
        {
          'contacts.name': search,
        },
      ];
    }

    const { page, pageSize, skip } = pagination(query.page, query.pageSize);
    const direction = query.sortDirection === 'desc' ? -1 : 1;

    const [items, totalItems] = await Promise.all([
      SupplierModel.find(filter)
        .select(includeSensitive ? SUPPLIER_SENSITIVE_SELECT : SUPPLIER_STANDARD_SELECT)
        .sort({
          [query.sortBy]: direction,
          supplierCode: 1,
          _id: 1,
        })
        .skip(skip)
        .limit(pageSize)
        .lean()
        .exec(),

      SupplierModel.countDocuments(filter).exec(),
    ]);

    return pageResult(
      record<SupplierRecord[]>(items),
      page,
      pageSize,
      totalItems,
    );
  }

  public async createSupplier(
    input: CreateSupplierInput,
    metadata: Readonly<{
      facilityId: string;
      actorUserId: string;
      transactionId: string;
      correlationId: string;
      occurredAt: Date;
    }>,
  ): Promise<SupplierRecord> {
    try {
      const created = await SupplierModel.create({
        facilityId: toObjectId(metadata.facilityId, 'facilityId'),
        supplierCode: normalizeInventoryCode(input.supplierCode),
        legalName: normalizeInventoryDisplayText(input.legalName),
        normalizedLegalName: normalizeInventoryText(input.legalName),
        tradingName: normalizeNullableInventoryText(input.tradingName),
        registrationNumber: normalizeNullableInventoryText(input.registrationNumber),
        taxRegistrationNumber: normalizeNullableInventoryText(input.taxRegistrationNumber),
        salesTaxRegistrationNumber: normalizeNullableInventoryText(
          input.salesTaxRegistrationNumber,
        ),
        drugSaleLicenseNumber: normalizeNullableInventoryText(
          input.drugSaleLicenseNumber,
        ),
        contacts: supplierContacts(input.contacts) ?? [],
        addresses: supplierAddresses(input.addresses) ?? [],
        defaultCurrency: normalizeInventoryCurrency(input.defaultCurrency ?? 'PKR'),
        paymentTermsDays: input.paymentTermsDays ?? 0,
        standardLeadTimeDays: input.standardLeadTimeDays ?? 0,
        notes: normalizeNullableInventoryText(input.notes),
        status: 'ACTIVE',
        activatedAt: metadata.occurredAt,
        activatedBy: toObjectId(metadata.actorUserId, 'actorUserId'),
        suspendedAt: null,
        suspendedBy: null,
        suspensionReason: null,
        deactivatedAt: null,
        deactivatedBy: null,
        deactivationReason: null,
        transactionId: metadata.transactionId,
        correlationId: metadata.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: toObjectId(metadata.actorUserId, 'actorUserId'),
        updatedBy: toObjectId(metadata.actorUserId, 'actorUserId'),
      });

      return record<SupplierRecord>(created.toObject());
    } catch (error) {
      throwMappedInventoryPersistenceError(error);
    }
  }

  public async updateSupplier(
    facilityId: string,
    supplierId: string,
    input: UpdateSupplierInput,
    actorUserId: string,
  ): Promise<SupplierRecord | null> {
    const setValues: Record<string, unknown> = {
      updatedBy: toObjectId(actorUserId, 'actorUserId'),
    };

    if (input.legalName !== undefined) {
      setValues['legalName'] = normalizeInventoryDisplayText(input.legalName);
      setValues['normalizedLegalName'] = normalizeInventoryText(input.legalName);
    }

    if (input.tradingName !== undefined) {
      setValues['tradingName'] = normalizeNullableInventoryText(input.tradingName);
    }

    if (input.registrationNumber !== undefined) {
      setValues['registrationNumber'] = normalizeNullableInventoryText(
        input.registrationNumber,
      );
    }

    if (input.taxRegistrationNumber !== undefined) {
      setValues['taxRegistrationNumber'] = normalizeNullableInventoryText(
        input.taxRegistrationNumber,
      );
    }

    if (input.salesTaxRegistrationNumber !== undefined) {
      setValues['salesTaxRegistrationNumber'] = normalizeNullableInventoryText(
        input.salesTaxRegistrationNumber,
      );
    }

    if (input.drugSaleLicenseNumber !== undefined) {
      setValues['drugSaleLicenseNumber'] = normalizeNullableInventoryText(
        input.drugSaleLicenseNumber,
      );
    }

    if (input.contacts !== undefined) {
      setValues['contacts'] = supplierContacts(input.contacts);
    }

    if (input.addresses !== undefined) {
      setValues['addresses'] = supplierAddresses(input.addresses);
    }

    if (input.defaultCurrency !== undefined) {
      setValues['defaultCurrency'] = normalizeInventoryCurrency(
        input.defaultCurrency,
      );
    }

    if (input.paymentTermsDays !== undefined) {
      setValues['paymentTermsDays'] = input.paymentTermsDays;
    }

    if (input.standardLeadTimeDays !== undefined) {
      setValues['standardLeadTimeDays'] = input.standardLeadTimeDays;
    }

    if (input.notes !== undefined) {
      setValues['notes'] = normalizeNullableInventoryText(input.notes);
    }

    try {
      return record<SupplierRecord | null>(
        await SupplierModel.findOneAndUpdate(
          {
            _id: toObjectId(supplierId, 'supplierId'),
            facilityId: toObjectId(facilityId, 'facilityId'),
            version: input.expectedVersion,
          },
          {
            $set: setValues,
            $inc: {
              version: 1,
            },
          },
          {
            new: true,
            runValidators: true,
          },
        )
          .select(SUPPLIER_SENSITIVE_SELECT)
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedInventoryPersistenceError(error);
    }
  }

  public async changeSupplierStatus(
    facilityId: string,
    supplierId: string,
    input: ChangeSupplierStatusInput,
    actorUserId: string,
    occurredAt: Date,
  ): Promise<SupplierRecord | null> {
    return record<SupplierRecord | null>(
      await SupplierModel.findOneAndUpdate(
        {
          _id: toObjectId(supplierId, 'supplierId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: input.expectedVersion,
        },
        {
          $set: supplierLifecycleSet(
            input.status,
            actorUserId,
            input.reason,
            occurredAt,
          ),
          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
        .select(SUPPLIER_SENSITIVE_SELECT)
        .lean()
        .exec(),
    );
  }

  public async findLocationById(
    facilityId: string,
    locationId: string,
  ): Promise<StoreLocationRecord | null> {
    return record<StoreLocationRecord | null>(
      await StoreLocationModel.findOne({
        _id: toObjectId(locationId, 'locationId'),
        facilityId: toObjectId(facilityId, 'facilityId'),
      })
        .select(INVENTORY_LOCATION_INTERNAL_SELECT)
        .lean()
        .exec(),
    );
  }

  public async listLocations(
    facilityId: string,
    query: InventoryLocationListQuery,
  ): Promise<InventoryPage<StoreLocationRecord>> {
    const filter: FilterQuery<unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
    };

    if (query.parentLocationId !== undefined) {
      filter['parentLocationId'] = query.parentLocationId === null
        ? null
        : toObjectId(query.parentLocationId, 'parentLocationId');
    }

    if (query.locationType !== undefined) {
      filter['locationType'] = query.locationType;
    }

    if (query.departmentId !== undefined) {
      filter['departmentId'] = toObjectId(query.departmentId, 'departmentId');
    }

    if (query.wardId !== undefined) {
      filter['wardId'] = toObjectId(query.wardId, 'wardId');
    }

    if (query.status !== undefined) {
      filter['status'] = query.status;
    }

    if (query.supportsDispensing !== undefined) {
      filter['supportsDispensing'] = query.supportsDispensing;
    }

    if (query.search !== undefined) {
      const search = new RegExp(escapeInventoryRegex(query.search.trim()), 'i');

      filter['$or'] = [
        {
          locationCode: search,
        },
        {
          stockOwnershipCode: search,
        },
        {
          name: search,
        },
        {
          physicalAddress: search,
        },
      ];
    }

    const { page, pageSize, skip } = pagination(query.page, query.pageSize);
    const direction = query.sortDirection === 'desc' ? -1 : 1;

    const [items, totalItems] = await Promise.all([
      StoreLocationModel.find(filter)
        .select(INVENTORY_LOCATION_INTERNAL_SELECT)
        .sort({
          [query.sortBy]: direction,
          locationCode: 1,
          _id: 1,
        })
        .skip(skip)
        .limit(pageSize)
        .lean()
        .exec(),

      StoreLocationModel.countDocuments(filter).exec(),
    ]);

    return pageResult(
      record<StoreLocationRecord[]>(items),
      page,
      pageSize,
      totalItems,
    );
  }

  public async createLocation(
    input: CreateInventoryLocationInput,
    metadata: Readonly<{
      facilityId: string;
      actorUserId: string;
      transactionId: string;
      correlationId: string;
      occurredAt: Date;
      ancestorLocationIds: readonly string[];
      hierarchyDepth: number;
    }>,
  ): Promise<StoreLocationRecord> {
    try {
      const created = await StoreLocationModel.create({
        facilityId: toObjectId(metadata.facilityId, 'facilityId'),
        locationCode: normalizeInventoryCode(input.locationCode),
        name: normalizeInventoryDisplayText(input.name),
        normalizedName: normalizeInventoryText(input.name),
        locationType: input.locationType,
        parentLocationId: optionalObjectId(input.parentLocationId, 'parentLocationId'),
        ancestorLocationIds: metadata.ancestorLocationIds.map(
          (value) => toObjectId(value, 'ancestorLocationIds'),
        ),
        hierarchyDepth: metadata.hierarchyDepth,
        departmentId: optionalObjectId(input.departmentId, 'departmentId'),
        wardId: optionalObjectId(input.wardId, 'wardId'),
        servicePointId: optionalObjectId(input.servicePointId, 'servicePointId'),
        managerStaffId: optionalObjectId(input.managerStaffId, 'managerStaffId'),
        storageConditions: [...(input.storageConditions ?? ['AMBIENT'])],
        supportsDispensing: input.supportsDispensing ?? false,
        allowsControlledMedicine: input.allowsControlledMedicine ?? false,
        allowsGeneralStock: input.allowsGeneralStock ?? true,
        stockOwnershipCode: normalizeInventoryCode(input.stockOwnershipCode),
        physicalAddress: normalizeNullableInventoryText(input.physicalAddress),
        contactPhone: normalizeNullableInventoryText(input.contactPhone),
        displayOrder: input.displayOrder ?? 0,
        status: 'ACTIVE',
        activatedAt: metadata.occurredAt,
        activatedBy: toObjectId(metadata.actorUserId, 'actorUserId'),
        deactivatedAt: null,
        deactivatedBy: null,
        deactivationReason: null,
        transactionId: metadata.transactionId,
        correlationId: metadata.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: toObjectId(metadata.actorUserId, 'actorUserId'),
        updatedBy: toObjectId(metadata.actorUserId, 'actorUserId'),
      });

      return record<StoreLocationRecord>(created.toObject());
    } catch (error) {
      throwMappedInventoryPersistenceError(error);
    }
  }

  public async updateLocation(
    facilityId: string,
    locationId: string,
    input: UpdateInventoryLocationInput,
    metadata: Readonly<{
      actorUserId: string;
      ancestorLocationIds: readonly string[];
      hierarchyDepth: number;
    }>,
  ): Promise<StoreLocationRecord | null> {
    const setValues: Record<string, unknown> = {
      updatedBy: toObjectId(metadata.actorUserId, 'actorUserId'),
    };

    if (input.name !== undefined) {
      setValues['name'] = normalizeInventoryDisplayText(input.name);
      setValues['normalizedName'] = normalizeInventoryText(input.name);
    }

    if (input.parentLocationId !== undefined) {
      setValues['parentLocationId'] = optionalObjectId(
        input.parentLocationId,
        'parentLocationId',
      );
      setValues['ancestorLocationIds'] = metadata.ancestorLocationIds.map(
        (value) => toObjectId(value, 'ancestorLocationIds'),
      );
      setValues['hierarchyDepth'] = metadata.hierarchyDepth;
    }

    if (input.departmentId !== undefined) {
      setValues['departmentId'] = optionalObjectId(input.departmentId, 'departmentId');
    }

    if (input.wardId !== undefined) {
      setValues['wardId'] = optionalObjectId(input.wardId, 'wardId');
    }

    if (input.servicePointId !== undefined) {
      setValues['servicePointId'] = optionalObjectId(
        input.servicePointId,
        'servicePointId',
      );
    }

    if (input.managerStaffId !== undefined) {
      setValues['managerStaffId'] = optionalObjectId(
        input.managerStaffId,
        'managerStaffId',
      );
    }

    if (input.storageConditions !== undefined) {
      setValues['storageConditions'] = [...input.storageConditions];
    }

    if (input.supportsDispensing !== undefined) {
      setValues['supportsDispensing'] = input.supportsDispensing;
    }

    if (input.allowsControlledMedicine !== undefined) {
      setValues['allowsControlledMedicine'] = input.allowsControlledMedicine;
    }

    if (input.allowsGeneralStock !== undefined) {
      setValues['allowsGeneralStock'] = input.allowsGeneralStock;
    }

    if (input.physicalAddress !== undefined) {
      setValues['physicalAddress'] = normalizeNullableInventoryText(
        input.physicalAddress,
      );
    }

    if (input.contactPhone !== undefined) {
      setValues['contactPhone'] = normalizeNullableInventoryText(
        input.contactPhone,
      );
    }

    if (input.displayOrder !== undefined) {
      setValues['displayOrder'] = input.displayOrder;
    }

    try {
      return record<StoreLocationRecord | null>(
        await StoreLocationModel.findOneAndUpdate(
          {
            _id: toObjectId(locationId, 'locationId'),
            facilityId: toObjectId(facilityId, 'facilityId'),
            version: input.expectedVersion,
          },
          {
            $set: setValues,
            $inc: {
              version: 1,
            },
          },
          {
            new: true,
            runValidators: true,
          },
        )
          .select(INVENTORY_LOCATION_INTERNAL_SELECT)
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedInventoryPersistenceError(error);
    }
  }

  public async changeLocationStatus(
    facilityId: string,
    locationId: string,
    input: ChangeInventoryCatalogStatusInput,
    actorUserId: string,
    occurredAt: Date,
  ): Promise<StoreLocationRecord | null> {
    return record<StoreLocationRecord | null>(
      await StoreLocationModel.findOneAndUpdate(
        {
          _id: toObjectId(locationId, 'locationId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: input.expectedVersion,
        },
        {
          $set: catalogLifecycleSet(
            input.status,
            actorUserId,
            input.reason,
            occurredAt,
          ),
          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
        .select(INVENTORY_LOCATION_INTERNAL_SELECT)
        .lean()
        .exec(),
    );
  }

  public async countActiveLocationChildren(
    facilityId: string,
    locationId: string,
  ): Promise<number> {
    return StoreLocationModel.countDocuments({
      facilityId: toObjectId(facilityId, 'facilityId'),
      parentLocationId: toObjectId(locationId, 'locationId'),
      status: 'ACTIVE',
    }).exec();
  }

  public async findUnitOfMeasureById(
    facilityId: string,
    unitId: string,
  ): Promise<InventoryUnitOfMeasureRecord | null> {
    return record<InventoryUnitOfMeasureRecord | null>(
      await UnitOfMeasureModel.findOne({
        _id: toObjectId(unitId, 'unitId'),
        facilityId: toObjectId(facilityId, 'facilityId'),
      })
        .select('_id facilityId code name normalizedName symbol dimension decimalScale status')
        .lean()
        .exec(),
    );
  }

  public async findUnitsOfMeasureByIds(
    facilityId: string,
    unitIds: readonly string[],
  ): Promise<InventoryUnitOfMeasureRecord[]> {
    const ids = uniqueInventoryObjectIds(unitIds);

    if (ids.length === 0) {
      return [];
    }

    return record<InventoryUnitOfMeasureRecord[]>(
      await UnitOfMeasureModel.find({
        _id: {
          $in: ids.map((value) => toObjectId(value, 'unitIds')),
        },
        facilityId: toObjectId(facilityId, 'facilityId'),
      })
        .select('_id facilityId code name normalizedName symbol dimension decimalScale status')
        .lean()
        .exec(),
    );
  }

  public async findFormularyItemById(
    facilityId: string,
    formularyItemId: string,
  ): Promise<InventoryFormularyItemRecord | null> {
    return record<InventoryFormularyItemRecord | null>(
      await FormularyItemModel.findOne({
        _id: toObjectId(formularyItemId, 'formularyItemId'),
        facilityId: toObjectId(facilityId, 'facilityId'),
      })
        .select(
          '_id facilityId formularyCode inventoryItemId stockTracked highAlert controlledMedicine status',
        )
        .lean()
        .exec(),
    );
  }
}