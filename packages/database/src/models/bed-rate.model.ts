import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  bedRateScopeValues,
  bedRateStatusValues,
  bedRateVersionChangeTypeValues,
} from './inpatient.types.js';

import {
  chargingPolicySchema,
  inpatientCommonFields,
  normalizeCode,
} from './inpatient-schema-helpers.js';

function decimalNumber(
  value: mongoose.Types.Decimal128,
): number {
  return Number(
    value.toString(),
  );
}

const rateSnapshotFields = {
  rateCode: {
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
    maxlength: 300,
  },

  scope: {
    type: String,
    required: true,
    enum: bedRateScopeValues,
  },

  scopeKey: {
    type: String,
    required: true,
    immutable: true,
    trim: true,
    uppercase: true,
    minlength: 3,
    maxlength: 200,
  },

  scopeReferenceId: {
    type: Schema.Types.ObjectId,
    default: null,
  },

  scopeCode: {
    type: String,
    default: null,
    trim: true,
    uppercase: true,
    maxlength: 100,
  },

  currencyCode: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    minlength: 3,
    maxlength: 3,
    default: 'PKR',
  },

  amount: {
    type: Schema.Types.Decimal128,
    required: true,
    min: 0,
  },

  chargingPolicy: {
    type: chargingPolicySchema,
    required: true,
  },

  chargeCatalogItemId: {
    type: Schema.Types.ObjectId,
    default: null,
  },

  priceListId: {
    type: Schema.Types.ObjectId,
    default: null,
  },

  payerOrganizationId: {
    type: Schema.Types.ObjectId,
    default: null,
  },

  panelPlanId: {
    type: Schema.Types.ObjectId,
    default: null,
  },

  treatmentPackageId: {
    type: Schema.Types.ObjectId,
    default: null,
  },

  effectiveFrom: {
    type: Date,
    required: true,
  },

  effectiveThrough: {
    type: Date,
    default: null,
  },
} as const;

export const bedRateSchema = new Schema(
  {
    ...inpatientCommonFields,
    ...rateSnapshotFields,

    status: {
      type: String,
      required: true,
      enum: bedRateStatusValues,
      default: 'DRAFT',
    },

    currentVersion: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    latestVersionId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    activatedAt: {
      type: Date,
      default: null,
    },

    activatedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    supersededAt: {
      type: Date,
      default: null,
    },

    supersededBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    supersededByRateId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancelledBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    cancellationReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },
  },
  {
    collection: 'bedRates',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

bedRateSchema.pre(
  'validate',
  function validateBedRate() {
    this.rateCode = normalizeCode(
      this.rateCode,
    );

    this.scopeKey = normalizeCode(
      this.scopeKey,
    );

    this.currencyCode = normalizeCode(
      this.currencyCode,
    );

    if (this.scopeCode != null) {
      this.scopeCode = normalizeCode(
        this.scopeCode,
      );
    }

    const amount = decimalNumber(
      this.amount,
    );

    if (
      !Number.isFinite(amount) ||
      amount < 0
    ) {
      this.invalidate(
        'amount',
        'Bed-rate amount must be a non-negative finite decimal value',
      );
    }

    const objectScoped = [
      'WARD',
      'ROOM',
      'BED',
    ].includes(this.scope);

    if (
      objectScoped &&
      this.scopeReferenceId == null
    ) {
      this.invalidate(
        'scopeReferenceId',
        'Ward, room, and bed rates require a scope reference',
      );
    }

    if (
      this.scope === 'BED_CATEGORY' &&
      this.scopeCode == null
    ) {
      this.invalidate(
        'scopeCode',
        'Bed-category rates require a scope code',
      );
    }

    if (
      this.effectiveThrough != null &&
      this.effectiveThrough <=
        this.effectiveFrom
    ) {
      this.invalidate(
        'effectiveThrough',
        'Effective-through time must follow effective-from time',
      );
    }

    if (this.status === 'DRAFT') {
      if (
        this.currentVersion !== 0 ||
        this.latestVersionId != null ||
        this.activatedAt != null ||
        this.activatedBy != null
      ) {
        this.invalidate(
          'status',
          'Draft bed rates cannot retain active version metadata',
        );
      }
    } else if (
      this.currentVersion < 1 ||
      this.latestVersionId == null ||
      this.activatedAt == null ||
      this.activatedBy == null
    ) {
      this.invalidate(
        'status',
        'Non-draft bed rates require an immutable version and activation attribution',
      );
    }

    if (
      this.status === 'SUPERSEDED' &&
      (
        this.supersededAt == null ||
        this.supersededBy == null ||
        this.supersededByRateId == null
      )
    ) {
      this.invalidate(
        'status',
        'Superseded rates require supersession attribution and replacement reference',
      );
    }

    if (
      this.status === 'CANCELLED' &&
      (
        this.cancelledAt == null ||
        this.cancelledBy == null ||
        this.cancellationReason == null
      )
    ) {
      this.invalidate(
        'status',
        'Cancelled rates require cancellation attribution and reason',
      );
    }
  },
);

bedRateSchema.index(
  {
    facilityId: 1,
    rateCode: 1,
  },
  {
    name:
      'uq_bed_rates_facility_code',
    unique: true,
  },
);

bedRateSchema.index(
  {
    facilityId: 1,
    scopeKey: 1,
    effectiveFrom: 1,
  },
  {
    name:
      'uq_bed_rates_scope_effective_from',
    unique: true,
  },
);

bedRateSchema.index(
  {
    facilityId: 1,
    scope: 1,
    scopeReferenceId: 1,
    scopeCode: 1,
    status: 1,
    effectiveFrom: -1,
    effectiveThrough: 1,
  },
  {
    name:
      'ix_bed_rates_effective_resolution',
  },
);

bedRateSchema.index(
  {
    facilityId: 1,
    payerOrganizationId: 1,
    panelPlanId: 1,
    treatmentPackageId: 1,
    status: 1,
    effectiveFrom: -1,
  },
  {
    name:
      'ix_bed_rates_financial_context',
  },
);

export const bedRateVersionSchema =
  new Schema(
    {
      ...inpatientCommonFields,

      bedRateId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      versionNumber: {
        type: Number,
        required: true,
        immutable: true,
        min: 1,
      },

      previousVersionId: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      changeType: {
        type: String,
        required: true,
        immutable: true,
        enum:
          bedRateVersionChangeTypeValues,
      },

      rateCodeSnapshot: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        maxlength: 100,
      },

      nameSnapshot: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        maxlength: 300,
      },

      scopeSnapshot: {
        type: String,
        required: true,
        immutable: true,
        enum: bedRateScopeValues,
      },

      scopeKeySnapshot: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        maxlength: 200,
      },

      scopeReferenceIdSnapshot: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      scopeCodeSnapshot: {
        type: String,
        default: null,
        immutable: true,
        trim: true,
        uppercase: true,
        maxlength: 100,
      },

      currencyCodeSnapshot: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        minlength: 3,
        maxlength: 3,
      },

      amountSnapshot: {
        type: Schema.Types.Decimal128,
        required: true,
        immutable: true,
        min: 0,
      },

      chargingPolicySnapshot: {
        type: chargingPolicySchema,
        required: true,
        immutable: true,
      },

      chargeCatalogItemIdSnapshot: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      priceListIdSnapshot: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      payerOrganizationIdSnapshot: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      panelPlanIdSnapshot: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      treatmentPackageIdSnapshot: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      effectiveFromSnapshot: {
        type: Date,
        required: true,
        immutable: true,
      },

      effectiveThroughSnapshot: {
        type: Date,
        default: null,
        immutable: true,
      },

      statusSnapshot: {
        type: String,
        required: true,
        immutable: true,
        enum: bedRateStatusValues,
      },

      snapshotHash: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 32,
        maxlength: 256,
      },

      changeReason: {
        type: String,
        default: null,
        immutable: true,
        trim: true,
        maxlength: 2_000,
        select: false,
      },

      recordedAt: {
        type: Date,
        required: true,
        immutable: true,
      },

      recordedBy: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },
    },
    {
      collection: 'bedRateVersions',
      strict: true,
      timestamps: true,
      versionKey: false,
    },
  );

bedRateVersionSchema.pre(
  'validate',
  function validateBedRateVersion() {
    this.rateCodeSnapshot =
      normalizeCode(
        this.rateCodeSnapshot,
      );

    this.scopeKeySnapshot =
      normalizeCode(
        this.scopeKeySnapshot,
      );

    this.currencyCodeSnapshot =
      normalizeCode(
        this.currencyCodeSnapshot,
      );

    if (
      this.scopeCodeSnapshot != null
    ) {
      this.scopeCodeSnapshot =
        normalizeCode(
          this.scopeCodeSnapshot,
        );
    }

    const amount = decimalNumber(
      this.amountSnapshot,
    );

    if (
      !Number.isFinite(amount) ||
      amount < 0
    ) {
      this.invalidate(
        'amountSnapshot',
        'Version amount must be a non-negative finite decimal value',
      );
    }

    if (
      this.effectiveThroughSnapshot !=
        null &&
      this.effectiveThroughSnapshot <=
        this.effectiveFromSnapshot
    ) {
      this.invalidate(
        'effectiveThroughSnapshot',
        'Version effective-through time must follow effective-from time',
      );
    }
  },
);

bedRateVersionSchema.index(
  {
    facilityId: 1,
    bedRateId: 1,
    versionNumber: 1,
  },
  {
    name:
      'uq_bed_rate_versions_rate_version',
    unique: true,
  },
);

bedRateVersionSchema.index(
  {
    facilityId: 1,
    scopeKeySnapshot: 1,
    effectiveFromSnapshot: -1,
  },
  {
    name:
      'ix_bed_rate_versions_scope_effective',
  },
);

bedRateVersionSchema.index(
  {
    facilityId: 1,
    recordedAt: -1,
  },
  {
    name:
      'ix_bed_rate_versions_recorded',
  },
);

export type BedRate =
  InferSchemaType<typeof bedRateSchema>;

export type BedRateVersion =
  InferSchemaType<
    typeof bedRateVersionSchema
  >;

export const BedRateModel =
  (
    mongoose.models[
      'bedRates'
    ] as Model<BedRate> | undefined
  ) ??
  mongoose.model<BedRate>(
    'bedRates',
    bedRateSchema,
    'bedRates',
  );

export const BedRateVersionModel =
  (
    mongoose.models[
      'bedRateVersions'
    ] as
      | Model<BedRateVersion>
      | undefined
  ) ??
  mongoose.model<BedRateVersion>(
    'bedRateVersions',
    bedRateVersionSchema,
    'bedRateVersions',
  );