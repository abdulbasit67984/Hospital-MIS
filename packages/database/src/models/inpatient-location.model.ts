import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  bedCategoryValues,
  inpatientBedStatusValues,
  roomClassValues,
  roomTypeValues,
  wardTypeValues,
} from './inpatient.types.js';

import {
  catalogLifecycleFields,
  inpatientCommonFields,
  locationRestrictionFields,
  normalizeCode,
  normalizeText,
  validateCatalogLifecycle,
  validateLocationRestrictions,
} from './inpatient-schema-helpers.js';

export const wardSchema = new Schema(
  {
    ...inpatientCommonFields,
    ...catalogLifecycleFields,
    ...locationRestrictionFields,

    wardCode: {
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

    wardType: {
      type: String,
      required: true,
      enum: wardTypeValues,
    },

    departmentId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    servicePointId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    nursingStationCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 80,
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
    collection: 'wards',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

wardSchema.pre(
  'validate',
  function validateWard() {
    this.wardCode = normalizeCode(
      this.wardCode,
    );

    this.normalizedName = normalizeText(
      this.name,
    );

    if (
      this.nursingStationCode != null
    ) {
      this.nursingStationCode =
        normalizeCode(
          this.nursingStationCode,
        );
    }

    validateLocationRestrictions(this);
    validateCatalogLifecycle(
      this,
      'wards',
    );
  },
);

wardSchema.index(
  {
    facilityId: 1,
    wardCode: 1,
  },
  {
    name: 'uq_wards_facility_code',
    unique: true,
  },
);

wardSchema.index(
  {
    facilityId: 1,
    normalizedName: 1,
  },
  {
    name: 'uq_wards_facility_name',
    unique: true,
  },
);

wardSchema.index(
  {
    facilityId: 1,
    departmentId: 1,
    status: 1,
    wardType: 1,
    displayOrder: 1,
  },
  {
    name:
      'ix_wards_department_type_status',
  },
);

wardSchema.index(
  {
    facilityId: 1,
    specialtyCodes: 1,
    status: 1,
  },
  {
    name:
      'ix_wards_specialty_status',
  },
);

export const roomSchema = new Schema(
  {
    ...inpatientCommonFields,
    ...catalogLifecycleFields,
    ...locationRestrictionFields,

    wardId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    departmentId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    servicePointId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    roomCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 80,
    },

    roomNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 80,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 300,
    },

    normalizedName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 1,
      maxlength: 300,
    },

    roomType: {
      type: String,
      required: true,
      enum: roomTypeValues,
    },

    roomClass: {
      type: String,
      required: true,
      enum: roomClassValues,
    },

    capacity: {
      type: Number,
      required: true,
      min: 1,
      max: 500,
    },

    floorCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 80,
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
    collection: 'rooms',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

roomSchema.pre(
  'validate',
  function validateRoom() {
    this.roomCode = normalizeCode(
      this.roomCode,
    );

    this.roomNumber = normalizeCode(
      this.roomNumber,
    );

    this.normalizedName = normalizeText(
      this.name,
    );

    if (this.floorCode != null) {
      this.floorCode = normalizeCode(
        this.floorCode,
      );
    }

    validateLocationRestrictions(this);
    validateCatalogLifecycle(
      this,
      'rooms',
    );
  },
);

roomSchema.index(
  {
    facilityId: 1,
    wardId: 1,
    roomCode: 1,
  },
  {
    name: 'uq_rooms_ward_code',
    unique: true,
  },
);

roomSchema.index(
  {
    facilityId: 1,
    wardId: 1,
    roomNumber: 1,
  },
  {
    name: 'uq_rooms_ward_number',
    unique: true,
  },
);

roomSchema.index(
  {
    facilityId: 1,
    wardId: 1,
    status: 1,
    roomClass: 1,
    displayOrder: 1,
  },
  {
    name:
      'ix_rooms_ward_class_status',
  },
);

export const bedSchema = new Schema(
  {
    ...inpatientCommonFields,
    ...catalogLifecycleFields,
    ...locationRestrictionFields,

    wardId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    roomId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    departmentId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    servicePointId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    bedCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 100,
    },

    bedNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 80,
    },

    label: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 300,
    },

    normalizedLabel: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 1,
      maxlength: 300,
    },

    bedCategory: {
      type: String,
      required: true,
      enum: bedCategoryValues,
    },

    operationalStatus: {
      type: String,
      required: true,
      enum: inpatientBedStatusValues,
      default: 'AVAILABLE',
    },

    operationalStatusChangedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },

    operationalStatusChangedBy: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    operationalStatusReasonCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 100,
    },

    operationalStatusReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 5_000,
      select: false,
    },

    currentAdmissionId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    currentAssignmentId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    currentPatientId: {
      type: Schema.Types.ObjectId,
      default: null,
      select: false,
    },

    activeHoldId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    lastReleasedAt: {
      type: Date,
      default: null,
    },

    turnaroundRequiredAfterRelease: {
      type: Boolean,
      required: true,
      default: true,
    },

    maintenanceReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
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
    collection: 'beds',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

bedSchema.pre(
  'validate',
  function validateBed() {
    this.bedCode = normalizeCode(
      this.bedCode,
    );

    this.bedNumber = normalizeCode(
      this.bedNumber,
    );

    this.normalizedLabel = normalizeText(
      this.label,
    );

    this.operationalStatusReasonCode =
      normalizeCode(
        this.operationalStatusReasonCode,
      );

    validateLocationRestrictions(this);
    validateCatalogLifecycle(
      this,
      'beds',
    );

    const occupied =
      this.operationalStatus ===
      'OCCUPIED';

    const reserved =
      this.operationalStatus ===
      'RESERVED';

    const hasOccupancy =
      this.currentAdmissionId != null ||
      this.currentAssignmentId != null ||
      this.currentPatientId != null;

    if (
      occupied &&
      (
        this.currentAdmissionId == null ||
        this.currentAssignmentId == null ||
        this.currentPatientId == null ||
        this.activeHoldId != null
      )
    ) {
      this.invalidate(
        'operationalStatus',
        'Occupied beds require admission, assignment, and patient projections without an active hold',
      );
    }

    if (
      reserved &&
      (
        this.activeHoldId == null ||
        hasOccupancy
      )
    ) {
      this.invalidate(
        'operationalStatus',
        'Reserved beds require an active hold and cannot retain occupancy projections',
      );
    }

    if (
      !occupied &&
      !reserved &&
      (
        hasOccupancy ||
        this.activeHoldId != null
      )
    ) {
      this.invalidate(
        'operationalStatus',
        'Available, cleaning, maintenance, and blocked beds cannot retain active occupancy or hold projections',
      );
    }

    if (
      this.status === 'INACTIVE' &&
      [
        'RESERVED',
        'OCCUPIED',
      ].includes(
        this.operationalStatus,
      )
    ) {
      this.invalidate(
        'status',
        'Reserved or occupied beds cannot be deactivated',
      );
    }

    if (
      this.operationalStatus ===
        'MAINTENANCE' &&
      this.maintenanceReference == null
    ) {
      this.invalidate(
        'maintenanceReference',
        'Maintenance beds require a maintenance reference',
      );
    }
  },
);

bedSchema.index(
  {
    facilityId: 1,
    bedCode: 1,
  },
  {
    name: 'uq_beds_facility_code',
    unique: true,
  },
);

bedSchema.index(
  {
    facilityId: 1,
    roomId: 1,
    bedNumber: 1,
  },
  {
    name: 'uq_beds_room_number',
    unique: true,
  },
);

bedSchema.index(
  {
    facilityId: 1,
    wardId: 1,
    operationalStatus: 1,
    status: 1,
    bedCategory: 1,
    displayOrder: 1,
  },
  {
    name: 'ix_beds_live_ward_map',
  },
);

bedSchema.index(
  {
    facilityId: 1,
    roomId: 1,
    operationalStatus: 1,
    status: 1,
  },
  {
    name:
      'ix_beds_room_availability',
  },
);

bedSchema.index(
  {
    facilityId: 1,
    specialtyCodes: 1,
    operationalStatus: 1,
    status: 1,
  },
  {
    name:
      'ix_beds_specialty_availability',
  },
);

bedSchema.index(
  {
    facilityId: 1,
    currentAdmissionId: 1,
  },
  {
    name:
      'ix_beds_current_admission',

    partialFilterExpression: {
      currentAdmissionId: {
        $type: 'objectId',
      },
    },
  },
);

export type Ward =
  InferSchemaType<typeof wardSchema>;

export type Room =
  InferSchemaType<typeof roomSchema>;

export type Bed =
  InferSchemaType<typeof bedSchema>;

export const WardModel =
  (
    mongoose.models[
      'wards'
    ] as Model<Ward> | undefined
  ) ??
  mongoose.model<Ward>(
    'wards',
    wardSchema,
    'wards',
  );

export const RoomModel =
  (
    mongoose.models[
      'rooms'
    ] as Model<Room> | undefined
  ) ??
  mongoose.model<Room>(
    'rooms',
    roomSchema,
    'rooms',
  );

export const BedModel =
  (
    mongoose.models[
      'beds'
    ] as Model<Bed> | undefined
  ) ??
  mongoose.model<Bed>(
    'beds',
    bedSchema,
    'beds',
  );