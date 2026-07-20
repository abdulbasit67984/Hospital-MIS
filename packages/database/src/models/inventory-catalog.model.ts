import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  inventoryCategoryTypeValues,
  inventoryItemTypeValues,
  inventoryStorageConditionValues,
  inventoryUnitPurposeValues,
  inventoryValuationMethodValues,
} from './inventory.types.js';

import {
  compareInventoryDecimals,
  inventoryCatalogLifecycleFields,
  inventoryCommonFields,
  normalizeInventoryCode,
  normalizeInventoryText,
  validateInventoryCatalogLifecycle,
  validateNonNegativeInventoryDecimal,
  validatePositiveInventoryDecimal,
} from './inventory-schema-helpers.js';

const unitConversionSchema = new Schema(
  {
    unitId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    purpose: {
      type: String,
      required: true,
      enum: inventoryUnitPurposeValues,
    },

    toStockUnitFactor: {
      type: Schema.Types.Decimal128,
      required: true,
    },

    isDefault: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

const supplierCatalogueEntrySchema = new Schema(
  {
    supplierId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    supplierItemCode: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    supplierItemName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },

    purchaseUnitId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    purchaseUnitToStockFactor: {
      type: Schema.Types.Decimal128,
      required: true,
    },

    minimumOrderQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '1',
    },

    lastQuotedUnitCost: {
      type: Schema.Types.Decimal128,
      default: null,
    },

    currency: {
      type: String,
      required: true,
      default: 'PKR',
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
    },

    leadTimeDays: {
      type: Number,
      default: null,
      min: 0,
      max: 3_650,
    },

    preferred: {
      type: Boolean,
      required: true,
      default: false,
    },

    active: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

export const inventoryCategorySchema = new Schema(
  {
    ...inventoryCommonFields,
    ...inventoryCatalogLifecycleFields,

    categoryCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 80,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 300,
    },

    normalizedName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 300,
    },

    categoryType: {
      type: String,
      required: true,
      enum: inventoryCategoryTypeValues,
      default: 'MIXED',
    },

    parentCategoryId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    ancestorCategoryIds: {
      type: [Schema.Types.ObjectId],
      required: true,
      default: [],
    },

    hierarchyDepth: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 20,
    },

    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 5_000,
    },

    displayOrder: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 100_000,
    },
  },
  {
    collection: 'inventoryCategories',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

inventoryCategorySchema.pre(
  'validate',
  function validateInventoryCategory() {
    this.categoryCode = normalizeInventoryCode(
      this.categoryCode,
    );
    this.normalizedName = normalizeInventoryText(
      this.name,
    );

    const ancestorIds = [
      ...new Set(
        this.ancestorCategoryIds.map(
          (value) => value.toHexString(),
        ),
      ),
    ];

    this.ancestorCategoryIds = ancestorIds.map(
      (value) =>
        new mongoose.Types.ObjectId(value),
    );

    if (
      this.ancestorCategoryIds.some(
        (value) =>
          value.equals(this._id),
      )
    ) {
      this.invalidate(
        'ancestorCategoryIds',
        'Inventory category ancestry cannot contain the category itself',
      );
    }

    if (this.parentCategoryId == null) {
      if (
        this.ancestorCategoryIds.length !== 0 ||
        this.hierarchyDepth !== 0
      ) {
        this.invalidate(
          'parentCategoryId',
          'Root inventory categories cannot contain ancestors or a non-zero hierarchy depth',
        );
      }
    } else {
      const parentId =
        this.parentCategoryId.toHexString();
      const lastAncestor =
        this.ancestorCategoryIds.at(-1)?.toHexString();

      if (
        lastAncestor !== parentId ||
        this.hierarchyDepth !==
          this.ancestorCategoryIds.length
      ) {
        this.invalidate(
          'ancestorCategoryIds',
          'Inventory category ancestry must end with parentCategoryId and match hierarchyDepth',
        );
      }
    }

    validateInventoryCatalogLifecycle(
      this,
      'inventory categories',
    );
  },
);

inventoryCategorySchema.index(
  {
    facilityId: 1,
    categoryCode: 1,
  },
  {
    name: 'uq_inventory_categories_facility_code',
    unique: true,
  },
);

inventoryCategorySchema.index(
  {
    facilityId: 1,
    parentCategoryId: 1,
    normalizedName: 1,
  },
  {
    name: 'uq_inventory_categories_parent_name',
    unique: true,
  },
);

inventoryCategorySchema.index(
  {
    facilityId: 1,
    ancestorCategoryIds: 1,
    status: 1,
    displayOrder: 1,
  },
  {
    name: 'ix_inventory_categories_hierarchy',
  },
);

export const inventoryItemSchema = new Schema(
  {
    ...inventoryCommonFields,
    ...inventoryCatalogLifecycleFields,

    itemCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 100,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 500,
    },

    normalizedName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 500,
    },

    itemType: {
      type: String,
      required: true,
      enum: inventoryItemTypeValues,
    },

    categoryId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    formularyItemId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    barcode: {
      type: String,
      default: null,
      trim: true,
      maxlength: 100,
    },

    manufacturerName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
    },

    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 5_000,
    },

    stockUnitId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    purchaseUnitId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    purchaseUnitToStockFactor: {
      type: Schema.Types.Decimal128,
      required: true,
    },

    issueUnitId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    issueUnitToStockFactor: {
      type: Schema.Types.Decimal128,
      required: true,
    },

    unitConversions: {
      type: [unitConversionSchema],
      required: true,
      default: [],
    },

    allowFractionalStock: {
      type: Boolean,
      required: true,
      default: false,
    },

    batchTrackingRequired: {
      type: Boolean,
      required: true,
      default: false,
    },

    expiryTrackingRequired: {
      type: Boolean,
      required: true,
      default: false,
    },

    storageConditions: {
      type: [String],
      required: true,
      enum: inventoryStorageConditionValues,
      default: ['AMBIENT'],
    },

    minimumStorageTemperatureCelsius: {
      type: Schema.Types.Decimal128,
      default: null,
    },

    maximumStorageTemperatureCelsius: {
      type: Schema.Types.Decimal128,
      default: null,
    },

    reorderLevel: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    minimumStockLevel: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    maximumStockLevel: {
      type: Schema.Types.Decimal128,
      default: null,
    },

    safetyStockLevel: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    nearExpiryWarningDays: {
      type: Number,
      required: true,
      default: 90,
      min: 0,
      max: 3_650,
    },

    negativeStockAllowed: {
      type: Boolean,
      required: true,
      default: false,
    },

    controlledMedicine: {
      type: Boolean,
      required: true,
      default: false,
    },

    highAlert: {
      type: Boolean,
      required: true,
      default: false,
    },

    highValue: {
      type: Boolean,
      required: true,
      default: false,
    },

    valuationMethod: {
      type: String,
      required: true,
      enum: inventoryValuationMethodValues,
      default: 'BATCH_COST',
    },

    preferredSupplierIds: {
      type: [Schema.Types.ObjectId],
      required: true,
      default: [],
    },

    supplierCatalogueEntries: {
      type: [supplierCatalogueEntrySchema],
      required: true,
      default: [],
    },

    searchText: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 2_000,
    },
  },
  {
    collection: 'inventoryItems',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

inventoryItemSchema.pre(
  'validate',
  function validateInventoryItem() {
    this.itemCode = normalizeInventoryCode(
      this.itemCode,
    );
    this.normalizedName = normalizeInventoryText(
      this.name,
    );
    this.searchText = normalizeInventoryText(
      [
        this.itemCode,
        this.name,
        this.barcode ?? '',
        this.manufacturerName ?? '',
      ].join(' '),
    );

    this.storageConditions = [
      ...new Set(this.storageConditions),
    ];

    this.preferredSupplierIds = [
      ...new Set(
        this.preferredSupplierIds.map(
          (value) => value.toHexString(),
        ),
      ),
    ].map(
      (value) =>
        new mongoose.Types.ObjectId(value),
    );

    if (
      this.itemType === 'MEDICATION' &&
      this.formularyItemId == null
    ) {
      this.invalidate(
        'formularyItemId',
        'Medication inventory items require a formulary-item link',
      );
    }

    if (
      this.itemType === 'NON_MEDICATION' &&
      this.formularyItemId != null
    ) {
      this.invalidate(
        'formularyItemId',
        'Non-medication inventory items cannot link to a medicine formulary item',
      );
    }

    if (this.storageConditions.length === 0) {
      this.invalidate(
        'storageConditions',
        'Inventory items require at least one storage condition',
      );
    }

    if (
      this.expiryTrackingRequired &&
      !this.batchTrackingRequired
    ) {
      this.invalidate(
        'expiryTrackingRequired',
        'Expiry tracking requires batch tracking',
      );
    }

    validatePositiveInventoryDecimal(
      this,
      'purchaseUnitToStockFactor',
      this.purchaseUnitToStockFactor,
    );
    validatePositiveInventoryDecimal(
      this,
      'issueUnitToStockFactor',
      this.issueUnitToStockFactor,
    );

    for (
      const [index, conversion] of
      this.unitConversions.entries()
    ) {
      validatePositiveInventoryDecimal(
        this,
        `unitConversions.${index}.toStockUnitFactor`,
        conversion.toStockUnitFactor,
      );
    }

    const conversionKeys =
      this.unitConversions.map(
        (conversion) =>
          `${conversion.unitId.toHexString()}:${conversion.purpose}`,
      );

    if (
      new Set(conversionKeys).size !==
      conversionKeys.length
    ) {
      this.invalidate(
        'unitConversions',
        'Unit conversions must be unique by unit and purpose',
      );
    }

    const defaultPurposeCounts =
      this.unitConversions.reduce<
        Record<string, number>
      >(
        (counts, conversion) => {
          if (conversion.isDefault) {
            counts[conversion.purpose] =
              (counts[conversion.purpose] ?? 0) + 1;
          }

          return counts;
        },
        {},
      );

    if (
      Object.values(defaultPurposeCounts).some(
        (count) => count > 1,
      )
    ) {
      this.invalidate(
        'unitConversions',
        'Only one default unit conversion is allowed per purpose',
      );
    }

    for (
      const field of [
        'reorderLevel',
        'minimumStockLevel',
        'safetyStockLevel',
      ] as const
    ) {
      validateNonNegativeInventoryDecimal(
        this,
        field,
        this[field],
      );
    }

    if (this.maximumStockLevel != null) {
      validateNonNegativeInventoryDecimal(
        this,
        'maximumStockLevel',
        this.maximumStockLevel,
      );

      if (
        compareInventoryDecimals(
          this.minimumStockLevel,
          this.maximumStockLevel,
        ) > 0
      ) {
        this.invalidate(
          'maximumStockLevel',
          'Maximum stock level cannot be lower than minimum stock level',
        );
      }

      if (
        compareInventoryDecimals(
          this.reorderLevel,
          this.maximumStockLevel,
        ) > 0
      ) {
        this.invalidate(
          'reorderLevel',
          'Reorder level cannot exceed maximum stock level',
        );
      }
    }

    if (
      compareInventoryDecimals(
        this.minimumStockLevel,
        this.reorderLevel,
      ) > 0
    ) {
      this.invalidate(
        'reorderLevel',
        'Reorder level cannot be lower than minimum stock level',
      );
    }

    if (
      compareInventoryDecimals(
        this.safetyStockLevel,
        this.minimumStockLevel,
      ) > 0
    ) {
      this.invalidate(
        'safetyStockLevel',
        'Safety stock level cannot exceed minimum stock level',
      );
    }

    if (
      this.minimumStorageTemperatureCelsius != null &&
      this.maximumStorageTemperatureCelsius != null &&
      compareInventoryDecimals(
        this.minimumStorageTemperatureCelsius,
        this.maximumStorageTemperatureCelsius,
      ) > 0
    ) {
      this.invalidate(
        'maximumStorageTemperatureCelsius',
        'Maximum storage temperature cannot be lower than minimum storage temperature',
      );
    }

    const supplierIds =
      this.supplierCatalogueEntries
        .filter((entry) => entry.active)
        .map(
          (entry) =>
            entry.supplierId.toHexString(),
        );

    if (
      new Set(supplierIds).size !==
      supplierIds.length
    ) {
      this.invalidate(
        'supplierCatalogueEntries',
        'Only one active supplier catalogue entry is allowed per supplier and inventory item',
      );
    }

    for (
      const [index, entry] of
      this.supplierCatalogueEntries.entries()
    ) {
      validatePositiveInventoryDecimal(
        this,
        `supplierCatalogueEntries.${index}.purchaseUnitToStockFactor`,
        entry.purchaseUnitToStockFactor,
      );
      validatePositiveInventoryDecimal(
        this,
        `supplierCatalogueEntries.${index}.minimumOrderQuantity`,
        entry.minimumOrderQuantity,
      );

      if (entry.lastQuotedUnitCost != null) {
        validateNonNegativeInventoryDecimal(
          this,
          `supplierCatalogueEntries.${index}.lastQuotedUnitCost`,
          entry.lastQuotedUnitCost,
        );
      }
    }

    const preferredCatalogueSupplierIds =
      this.supplierCatalogueEntries
        .filter((entry) => entry.preferred)
        .map((entry) =>
          entry.supplierId.toHexString(),
        );
    const preferredSupplierIds =
      new Set(
        this.preferredSupplierIds.map(
          (value) => value.toHexString(),
        ),
      );

    if (
      preferredCatalogueSupplierIds.some(
        (supplierId) =>
          !preferredSupplierIds.has(supplierId),
      )
    ) {
      this.invalidate(
        'preferredSupplierIds',
        'Preferred supplier catalogue entries must also be present in preferredSupplierIds',
      );
    }

    validateInventoryCatalogLifecycle(
      this,
      'inventory items',
    );
  },
);

inventoryItemSchema.index(
  {
    facilityId: 1,
    itemCode: 1,
  },
  {
    name: 'uq_inventory_items_facility_code',
    unique: true,
  },
);

inventoryItemSchema.index(
  {
    facilityId: 1,
    barcode: 1,
  },
  {
    name: 'uq_inventory_items_facility_barcode',
    unique: true,
    partialFilterExpression: {
      barcode: {
        $type: 'string',
      },
    },
  },
);

inventoryItemSchema.index(
  {
    facilityId: 1,
    formularyItemId: 1,
  },
  {
    name: 'uq_inventory_items_active_formulary_link',
    unique: true,
    partialFilterExpression: {
      formularyItemId: {
        $type: 'objectId',
      },
      status: 'ACTIVE',
    },
  },
);

inventoryItemSchema.index(
  {
    facilityId: 1,
    categoryId: 1,
    status: 1,
    normalizedName: 1,
  },
  {
    name: 'ix_inventory_items_category_status_name',
  },
);

inventoryItemSchema.index(
  {
    facilityId: 1,
    preferredSupplierIds: 1,
    status: 1,
  },
  {
    name: 'ix_inventory_items_preferred_suppliers',
  },
);

inventoryItemSchema.index(
  {
    facilityId: 1,
    controlledMedicine: 1,
    highAlert: 1,
    highValue: 1,
    status: 1,
  },
  {
    name: 'ix_inventory_items_risk_flags',
  },
);

inventoryItemSchema.index(
  {
    facilityId: 1,
    searchText: 'text',
  },
  {
    name: 'ix_inventory_items_search',
  },
);

export type InventoryCategory =
  InferSchemaType<
    typeof inventoryCategorySchema
  >;

export type InventoryItem =
  InferSchemaType<
    typeof inventoryItemSchema
  >;

export const InventoryCategoryModel =
  (
    mongoose.models[
      'inventoryCategories'
    ] as Model<InventoryCategory> | undefined
  ) ??
  mongoose.model<InventoryCategory>(
    'inventoryCategories',
    inventoryCategorySchema,
    'inventoryCategories',
  );

export const InventoryItemModel =
  (
    mongoose.models[
      'inventoryItems'
    ] as Model<InventoryItem> | undefined
  ) ??
  mongoose.model<InventoryItem>(
    'inventoryItems',
    inventoryItemSchema,
    'inventoryItems',
  );