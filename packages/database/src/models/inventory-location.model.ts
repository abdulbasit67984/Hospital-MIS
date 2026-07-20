import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  inventoryLocationTypeValues,
  inventoryStorageConditionValues,
} from './inventory.types.js';

import {
  inventoryCatalogLifecycleFields,
  inventoryCommonFields,
  normalizeInventoryCode,
  normalizeInventoryText,
  validateInventoryCatalogLifecycle,
} from './inventory-schema-helpers.js';

export const storeLocationSchema = new Schema(
  {
    ...inventoryCommonFields,
    ...inventoryCatalogLifecycleFields,

    locationCode: {
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

    locationType: {
      type: String,
      required: true,
      enum: inventoryLocationTypeValues,
    },

    parentLocationId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    ancestorLocationIds: {
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

    departmentId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    wardId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    servicePointId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    managerStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    storageConditions: {
      type: [String],
      required: true,
      enum: inventoryStorageConditionValues,
      default: ['AMBIENT'],
    },

    supportsDispensing: {
      type: Boolean,
      required: true,
      default: false,
    },

    allowsControlledMedicine: {
      type: Boolean,
      required: true,
      default: false,
    },

    allowsGeneralStock: {
      type: Boolean,
      required: true,
      default: true,
    },

    stockOwnershipCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 80,
    },

    physicalAddress: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1_000,
    },

    contactPhone: {
      type: String,
      default: null,
      trim: true,
      maxlength: 50,
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
    collection: 'storeLocations',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

storeLocationSchema.pre(
  'validate',
  function validateStoreLocation() {
    this.locationCode = normalizeInventoryCode(
      this.locationCode,
    );
    this.stockOwnershipCode =
      normalizeInventoryCode(
        this.stockOwnershipCode,
      );
    this.normalizedName = normalizeInventoryText(
      this.name,
    );
    this.storageConditions = [
      ...new Set(this.storageConditions),
    ];

    const ancestorIds = [
      ...new Set(
        this.ancestorLocationIds.map(
          (value) => value.toHexString(),
        ),
      ),
    ];

    this.ancestorLocationIds = ancestorIds.map(
      (value) =>
        new mongoose.Types.ObjectId(value),
    );

    if (
      this.ancestorLocationIds.some(
        (value) =>
          value.equals(this._id),
      )
    ) {
      this.invalidate(
        'ancestorLocationIds',
        'Inventory location ancestry cannot contain the location itself',
      );
    }

    if (this.storageConditions.length === 0) {
      this.invalidate(
        'storageConditions',
        'Inventory locations require at least one storage condition',
      );
    }

    if (this.parentLocationId == null) {
      if (
        this.ancestorLocationIds.length !== 0 ||
        this.hierarchyDepth !== 0
      ) {
        this.invalidate(
          'parentLocationId',
          'Root inventory locations cannot contain ancestors or a non-zero hierarchy depth',
        );
      }
    } else {
      const parentId =
        this.parentLocationId.toHexString();
      const lastAncestor =
        this.ancestorLocationIds.at(-1)?.toHexString();

      if (
        lastAncestor !== parentId ||
        this.hierarchyDepth !==
          this.ancestorLocationIds.length
      ) {
        this.invalidate(
          'ancestorLocationIds',
          'Inventory location ancestry must end with parentLocationId and match hierarchyDepth',
        );
      }
    }

    if (
      this.locationType === 'PHARMACY' &&
      !this.supportsDispensing
    ) {
      this.invalidate(
        'supportsDispensing',
        'Pharmacy locations must support dispensing',
      );
    }

    if (
      this.locationType === 'WARD_STORE' &&
      this.wardId == null
    ) {
      this.invalidate(
        'wardId',
        'Ward-store locations require a ward link',
      );
    }

    if (
      this.locationType === 'DEPARTMENT_STORE' &&
      this.departmentId == null
    ) {
      this.invalidate(
        'departmentId',
        'Department-store locations require a department link',
      );
    }

    if (
      [
        'QUARANTINE',
        'DAMAGED',
        'RETURNS',
        'IN_TRANSIT',
      ].includes(this.locationType) &&
      this.supportsDispensing
    ) {
      this.invalidate(
        'supportsDispensing',
        `${this.locationType} locations cannot support dispensing`,
      );
    }

    validateInventoryCatalogLifecycle(
      this,
      'inventory locations',
    );
  },
);

storeLocationSchema.index(
  {
    facilityId: 1,
    locationCode: 1,
  },
  {
    name: 'uq_store_locations_facility_code',
    unique: true,
  },
);

storeLocationSchema.index(
  {
    facilityId: 1,
    stockOwnershipCode: 1,
  },
  {
    name: 'uq_store_locations_ownership_code',
    unique: true,
  },
);

storeLocationSchema.index(
  {
    facilityId: 1,
    parentLocationId: 1,
    normalizedName: 1,
  },
  {
    name: 'uq_store_locations_parent_name',
    unique: true,
  },
);

storeLocationSchema.index(
  {
    facilityId: 1,
    ancestorLocationIds: 1,
    status: 1,
    displayOrder: 1,
  },
  {
    name: 'ix_store_locations_hierarchy',
  },
);

storeLocationSchema.index(
  {
    facilityId: 1,
    locationType: 1,
    departmentId: 1,
    wardId: 1,
    status: 1,
  },
  {
    name: 'ix_store_locations_operational_scope',
  },
);

storeLocationSchema.index(
  {
    facilityId: 1,
    supportsDispensing: 1,
    status: 1,
  },
  {
    name: 'ix_store_locations_dispensing',
  },
);

export type StoreLocation =
  InferSchemaType<
    typeof storeLocationSchema
  >;

export const StoreLocationModel =
  (
    mongoose.models[
      'storeLocations'
    ] as Model<StoreLocation> | undefined
  ) ??
  mongoose.model<StoreLocation>(
    'storeLocations',
    storeLocationSchema,
    'storeLocations',
  );