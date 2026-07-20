import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  supplierAddressTypeValues,
  supplierContactTypeValues,
  supplierStatusValues,
} from './inventory.types.js';

import {
  inventoryCommonFields,
  normalizeInventoryCode,
  normalizeInventoryText,
} from './inventory-schema-helpers.js';

const supplierContactSchema = new Schema(
  {
    contactType: {
      type: String,
      required: true,
      enum: supplierContactTypeValues,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 200,
    },

    designation: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
    },

    phone: {
      type: String,
      default: null,
      trim: true,
      maxlength: 50,
    },

    email: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      maxlength: 320,
    },

    primary: {
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

const supplierAddressSchema = new Schema(
  {
    addressType: {
      type: String,
      required: true,
      enum: supplierAddressTypeValues,
    },

    line1: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },

    line2: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
    },

    city: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    district: {
      type: String,
      default: null,
      trim: true,
      maxlength: 150,
    },

    province: {
      type: String,
      default: null,
      trim: true,
      maxlength: 150,
    },

    postalCode: {
      type: String,
      default: null,
      trim: true,
      maxlength: 30,
    },

    countryCode: {
      type: String,
      required: true,
      default: 'PK',
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 2,
    },

    primary: {
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

export const supplierSchema = new Schema(
  {
    ...inventoryCommonFields,

    supplierCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 80,
    },

    legalName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 500,
    },

    normalizedLegalName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 500,
    },

    tradingName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },

    registrationNumber: {
      type: String,
      default: null,
      trim: true,
      maxlength: 120,
      select: false,
    },

    taxRegistrationNumber: {
      type: String,
      default: null,
      trim: true,
      maxlength: 120,
      select: false,
    },

    salesTaxRegistrationNumber: {
      type: String,
      default: null,
      trim: true,
      maxlength: 120,
      select: false,
    },

    drugSaleLicenseNumber: {
      type: String,
      default: null,
      trim: true,
      maxlength: 120,
      select: false,
    },

    contacts: {
      type: [supplierContactSchema],
      required: true,
      default: [],
    },

    addresses: {
      type: [supplierAddressSchema],
      required: true,
      default: [],
    },

    defaultCurrency: {
      type: String,
      required: true,
      default: 'PKR',
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
    },

    paymentTermsDays: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 3_650,
    },

    standardLeadTimeDays: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 3_650,
    },

    notes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 5_000,
      select: false,
    },

    status: {
      type: String,
      required: true,
      enum: supplierStatusValues,
      default: 'ACTIVE',
    },

    activatedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },

    activatedBy: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    suspendedAt: {
      type: Date,
      default: null,
    },

    suspendedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    suspensionReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },

    deactivatedAt: {
      type: Date,
      default: null,
    },

    deactivatedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    deactivationReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
  },
  {
    collection: 'suppliers',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

supplierSchema.pre(
  'validate',
  function validateSupplier() {
    this.supplierCode = normalizeInventoryCode(
      this.supplierCode,
    );
    this.normalizedLegalName = normalizeInventoryText(
      this.legalName,
    );

    if (
      this.contacts.filter(
        (contact) =>
          contact.active && contact.primary,
      ).length > 1
    ) {
      this.invalidate(
        'contacts',
        'A supplier can have only one active primary contact',
      );
    }

    if (
      this.addresses.filter(
        (address) =>
          address.active && address.primary,
      ).length > 1
    ) {
      this.invalidate(
        'addresses',
        'A supplier can have only one active primary address',
      );
    }

    if (this.status === 'ACTIVE') {
      if (
        this.suspendedAt != null ||
        this.suspendedBy != null ||
        this.suspensionReason != null ||
        this.deactivatedAt != null ||
        this.deactivatedBy != null ||
        this.deactivationReason != null
      ) {
        this.invalidate(
          'status',
          'Active suppliers cannot retain suspension or deactivation metadata',
        );
      }
    }

    if (this.status === 'SUSPENDED') {
      if (
        this.suspendedAt == null ||
        this.suspendedBy == null ||
        this.suspensionReason == null
      ) {
        this.invalidate(
          'status',
          'Suspended suppliers require suspension attribution and reason',
        );
      }

      if (
        this.deactivatedAt != null ||
        this.deactivatedBy != null ||
        this.deactivationReason != null
      ) {
        this.invalidate(
          'status',
          'Suspended suppliers cannot retain deactivation metadata',
        );
      }
    }

    if (this.status === 'INACTIVE') {
      if (
        this.deactivatedAt == null ||
        this.deactivatedBy == null ||
        this.deactivationReason == null
      ) {
        this.invalidate(
          'status',
          'Inactive suppliers require deactivation attribution and reason',
        );
      }
    }
  },
);

supplierSchema.index(
  {
    facilityId: 1,
    supplierCode: 1,
  },
  {
    name: 'uq_suppliers_facility_code',
    unique: true,
  },
);

supplierSchema.index(
  {
    facilityId: 1,
    normalizedLegalName: 1,
  },
  {
    name: 'uq_suppliers_facility_legal_name',
    unique: true,
  },
);

supplierSchema.index(
  {
    facilityId: 1,
    status: 1,
    standardLeadTimeDays: 1,
  },
  {
    name: 'ix_suppliers_status_lead_time',
  },
);

export type Supplier =
  InferSchemaType<typeof supplierSchema>;

export const SupplierModel =
  (
    mongoose.models[
      'suppliers'
    ] as Model<Supplier> | undefined
  ) ??
  mongoose.model<Supplier>(
    'suppliers',
    supplierSchema,
    'suppliers',
  );