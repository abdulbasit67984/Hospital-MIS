import mongoose, {
  Schema,
} from 'mongoose';

import {
  bedBillingUnitValues,
  inpatientCatalogStatusValues,
  isolationCapabilityValues,
  partialDayPolicyValues,
  patientSexRestrictionValues,
  sameDayDischargePolicyValues,
  transferChargingPolicyValues,
} from './inpatient.types.js';

export function normalizeCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replaceAll(/[^A-Z0-9.-]+/gu, '_');
}

export function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/gu, ' ');
}

export function uniqueCodes(
  values: readonly string[],
): string[] {
  return [
    ...new Set(
      values
        .map(normalizeCode)
        .filter(Boolean),
    ),
  ];
}

export const inpatientCommonFields = {
  facilityId: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
  },
  transactionId: {
    type: String,
    required: true,
    immutable: true,
    trim: true,
    minlength: 1,
    maxlength: 200,
  },
  correlationId: {
    type: String,
    required: true,
    immutable: true,
    trim: true,
    minlength: 1,
    maxlength: 200,
  },
  schemaVersion: {
    type: Number,
    required: true,
    immutable: true,
    default: 1,
    min: 1,
  },
  version: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    required: true,
  },
} as const;

export const catalogLifecycleFields = {
  status: {
    type: String,
    required: true,
    enum: inpatientCatalogStatusValues,
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
    select: false,
  },
} as const;

export const locationRestrictionFields = {
  permittedSexes: {
    type: [String],
    required: true,
    enum: patientSexRestrictionValues,
    default: [...patientSexRestrictionValues],
  },
  minimumAgeYears: {
    type: Number,
    default: null,
    min: 0,
    max: 150,
  },
  maximumAgeYears: {
    type: Number,
    default: null,
    min: 0,
    max: 150,
  },
  specialtyCodes: {
    type: [String],
    required: true,
    default: [],
  },
  isolationCapabilities: {
    type: [String],
    required: true,
    enum: isolationCapabilityValues,
    default: ['STANDARD_PRECAUTIONS'],
  },
  infectionControlTags: {
    type: [String],
    required: true,
    default: [],
  },
  negativePressureCapable: {
    type: Boolean,
    required: true,
    default: false,
  },
  cohortingAllowed: {
    type: Boolean,
    required: true,
    default: true,
  },
} as const;

export const chargingPolicySchema = new Schema(
  {
    policyCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 100,
    },
    billingUnit: {
      type: String,
      required: true,
      enum: bedBillingUnitValues,
    },
    partialDayPolicy: {
      type: String,
      required: true,
      enum: partialDayPolicyValues,
    },
    sameDayDischargePolicy: {
      type: String,
      required: true,
      enum: sameDayDischargePolicyValues,
    },
    transferChargingPolicy: {
      type: String,
      required: true,
      enum: transferChargingPolicyValues,
    },
    roundingIncrementMinutes: {
      type: Number,
      default: null,
      min: 1,
      max: 1_440,
    },
    minimumChargeMinutes: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 525_600,
    },
    dayBoundaryTimezone: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 100,
      default: 'Asia/Karachi',
    },
    dayBoundaryHour: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 23,
    },
    gracePeriodMinutes: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 1_440,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

chargingPolicySchema.pre(
  'validate',
  function validateChargingPolicy() {
    this.policyCode = normalizeCode(
      this.policyCode,
    );

    if (
      this.partialDayPolicy ===
        'ROUND_TO_INCREMENT' &&
      this.roundingIncrementMinutes == null
    ) {
      this.invalidate(
        'roundingIncrementMinutes',
        'ROUND_TO_INCREMENT policies require a rounding increment',
      );
    }

    if (
      this.partialDayPolicy !==
        'ROUND_TO_INCREMENT' &&
      this.roundingIncrementMinutes != null
    ) {
      this.invalidate(
        'roundingIncrementMinutes',
        'Only ROUND_TO_INCREMENT policies may define a rounding increment',
      );
    }
  },
);

export function validateCatalogLifecycle(
  document: {
    status: string;
    deactivatedAt?: Date | null;
    deactivatedBy?:
      | mongoose.Types.ObjectId
      | null;
    deactivationReason?: string | null;
    invalidate(
      path: string,
      message: string,
    ): void;
  },
  subject: string,
): void {
  if (document.status === 'INACTIVE') {
    if (
      document.deactivatedAt == null ||
      document.deactivatedBy == null ||
      document.deactivationReason == null
    ) {
      document.invalidate(
        'status',
        `Inactive ${subject} require deactivation attribution and reason`,
      );
    }

    return;
  }

  if (
    document.deactivatedAt != null ||
    document.deactivatedBy != null ||
    document.deactivationReason != null
  ) {
    document.invalidate(
      'status',
      `Active ${subject} cannot retain deactivation metadata`,
    );
  }
}

export function validateLocationRestrictions(
  document: {
    permittedSexes: string[];
    minimumAgeYears?: number | null;
    maximumAgeYears?: number | null;
    specialtyCodes: string[];
    isolationCapabilities: string[];
    infectionControlTags: string[];
    negativePressureCapable: boolean;
    invalidate(
      path: string,
      message: string,
    ): void;
  },
): void {
  document.permittedSexes = uniqueCodes(
    document.permittedSexes,
  );

  document.specialtyCodes = uniqueCodes(
    document.specialtyCodes,
  );

  document.isolationCapabilities = uniqueCodes(
    document.isolationCapabilities,
  );

  document.infectionControlTags = uniqueCodes(
    document.infectionControlTags,
  );

  if (
    document.permittedSexes.length === 0
  ) {
    document.invalidate(
      'permittedSexes',
      'At least one permitted sex is required',
    );
  }

  if (
    document.isolationCapabilities.length === 0
  ) {
    document.invalidate(
      'isolationCapabilities',
      'At least one isolation capability is required',
    );
  }

  if (
    document.minimumAgeYears != null &&
    document.maximumAgeYears != null &&
    document.minimumAgeYears >
      document.maximumAgeYears
  ) {
    document.invalidate(
      'maximumAgeYears',
      'Maximum age cannot be lower than minimum age',
    );
  }

  if (
    document.negativePressureCapable &&
    !document.isolationCapabilities.includes(
      'NEGATIVE_PRESSURE',
    )
  ) {
    document.invalidate(
      'isolationCapabilities',
      'Negative-pressure locations must declare NEGATIVE_PRESSURE capability',
    );
  }
}