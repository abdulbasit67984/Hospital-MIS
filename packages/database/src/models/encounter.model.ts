import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

import {
  activeEncounterStatusValues,
  clinicalConfidentialityValues,
  encounterCareContextValues,
  encounterOwnerRoleValues,
  encounterStatusChangeSourceValues,
  encounterStatusValues,
  encounterTypeValues,
} from './clinical-emr.types.js';

function objectIdText(value: unknown): string {
  if (
    value != null &&
    typeof value === 'object' &&
    'toHexString' in value &&
    typeof value.toHexString === 'function'
  ) {
    return value.toHexString();
  }

  return String(value);
}

export const encounterSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    encounterNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 120,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    requestedPatientId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    canonicalRedirected: {
      type: Boolean,
      required: true,
      immutable: true,
      default: false,
    },
    registrationId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    opdVisitId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    queueTokenId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    emergencyCaseId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    admissionId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    referralId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    encounterType: {
      type: String,
      required: true,
      enum: encounterTypeValues,
    },
    careContext: {
      type: String,
      required: true,
      enum: encounterCareContextValues,
    },
    status: {
      type: String,
      required: true,
      enum: encounterStatusValues,
      default: 'CREATED',
    },
    serviceDate: {
      type: String,
      required: true,
      immutable: true,
      match: /^\d{4}-\d{2}-\d{2}$/u,
    },
    departmentId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    clinicId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    servicePointId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    primaryProviderId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    currentOwnerId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    currentOwnerRole: {
      type: String,
      required: true,
      enum: encounterOwnerRoleValues,
      default: 'PRIMARY_PROVIDER',
    },
    assignedProviderIds: {
      type: [Schema.Types.ObjectId],
      required: true,
      default: [],
    },
    confidentiality: {
      type: String,
      required: true,
      enum: clinicalConfidentialityValues,
      default: 'ROUTINE',
    },
    restrictionReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 1_000,
      select: false,
    },
    activeContextKey: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
      select: false,
    },
    startedAt: {
      type: Date,
      required: true,
    },
    lastClinicalActivityAt: {
      type: Date,
      required: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    signedAt: {
      type: Date,
      default: null,
    },
    signedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    signatureDigest: {
      type: String,
      default: null,
      trim: true,
      minlength: 32,
      maxlength: 256,
      select: false,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    closedBy: {
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
      maxlength: 1_000,
      select: false,
    },
    supersedesEncounterId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    supersededByEncounterId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    correctionReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 1_000,
      select: false,
    },
    amendmentCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    latestClinicalNoteId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    latestDiagnosisAt: {
      type: Date,
      default: null,
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
  },
  {
    collection: 'encounters',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

encounterSchema.pre('validate', function validateEncounter() {
  const redirected = !this.patientId.equals(this.requestedPatientId);

  if (this.canonicalRedirected !== redirected) {
    this.invalidate(
      'canonicalRedirected',
      'canonicalRedirected must reflect whether the requested patient was redirected',
    );
  }

  if (this.careContext === 'OPD_VISIT') {
    if (this.registrationId == null || this.opdVisitId == null) {
      this.invalidate(
        'careContext',
        'OPD encounters require both registrationId and opdVisitId',
      );
    }
  }

  if (this.careContext === 'ADMISSION' && this.admissionId == null) {
    this.invalidate('admissionId', 'Admission encounters require admissionId');
  }

  if (this.careContext === 'EMERGENCY_CASE' && this.emergencyCaseId == null) {
    this.invalidate(
      'emergencyCaseId',
      'Emergency encounters require emergencyCaseId',
    );
  }

  const assigned = new Set(
    this.assignedProviderIds.map((providerId) => objectIdText(providerId)),
  );

  assigned.add(objectIdText(this.primaryProviderId));
  assigned.add(objectIdText(this.currentOwnerId));

  this.assignedProviderIds = [...assigned].map(
    (providerId) => new mongoose.Types.ObjectId(providerId),
  );

  if (this.confidentiality !== 'ROUTINE' && this.restrictionReason == null) {
    this.invalidate(
      'restrictionReason',
      'Restricted encounters require a minimum-necessary access reason',
    );
  }

  const isActive = activeEncounterStatusValues.includes(
    this.status as (typeof activeEncounterStatusValues)[number],
  );

  if (isActive) {
    const sourceContext =
      this.opdVisitId != null
        ? `opd:${objectIdText(this.opdVisitId)}`
        : this.admissionId != null
          ? `admission:${objectIdText(this.admissionId)}`
          : this.emergencyCaseId != null
            ? `emergency:${objectIdText(this.emergencyCaseId)}`
            : this.referralId != null
              ? `referral:${objectIdText(this.referralId)}`
              : [
                  'direct',
                  objectIdText(this.patientId),
                  this.serviceDate,
                  objectIdText(this.departmentId),
                  this.clinicId == null
                    ? '-'
                    : objectIdText(this.clinicId),
                  this.servicePointId == null
                    ? '-'
                    : objectIdText(this.servicePointId),
                ].join(':');

    this.activeContextKey = sourceContext;
  } else {
    this.activeContextKey = null;
  }

  if (this.lastClinicalActivityAt < this.startedAt) {
    this.invalidate(
      'lastClinicalActivityAt',
      'lastClinicalActivityAt cannot precede startedAt',
    );
  }

  if (this.completedAt != null && this.completedAt < this.startedAt) {
    this.invalidate(
      'completedAt',
      'completedAt cannot precede startedAt',
    );
  }

  if (
    this.signedAt != null &&
    (this.completedAt == null || this.signedAt < this.completedAt)
  ) {
    this.invalidate(
      'signedAt',
      'signedAt requires and cannot precede completedAt',
    );
  }

  if (
    this.closedAt != null &&
    (this.signedAt == null || this.closedAt < this.signedAt)
  ) {
    this.invalidate(
      'closedAt',
      'closedAt requires and cannot precede signedAt',
    );
  }

  if (
    ['COMPLETED', 'SIGNED', 'CLOSED'].includes(this.status) &&
    this.completedAt == null
  ) {
    this.invalidate(
      'completedAt',
      'Completed, signed, or closed encounters require completedAt',
    );
  }

  if (['SIGNED', 'CLOSED'].includes(this.status)) {
    if (
      this.signedAt == null ||
      this.signedBy == null ||
      this.signatureDigest == null
    ) {
      this.invalidate(
        'status',
        'Signed or closed encounters require signature attribution',
      );
    }
  }

  if (
    this.status === 'CLOSED' &&
    (this.closedAt == null || this.closedBy == null)
  ) {
    this.invalidate(
      'status',
      'Closed encounters require close attribution',
    );
  }

  if (this.status === 'CANCELLED') {
    if (
      this.cancelledAt == null ||
      this.cancelledBy == null ||
      this.cancellationReason == null
    ) {
      this.invalidate(
        'status',
        'Cancelled encounters require cancellation metadata',
      );
    }
  } else if (
    this.cancelledAt != null ||
    this.cancelledBy != null ||
    this.cancellationReason != null
  ) {
    this.invalidate(
      'status',
      'Cancellation metadata is only valid for cancelled encounters',
    );
  }

  if (this.status === 'CORRECTED') {
    if (
      this.supersededByEncounterId == null ||
      this.correctionReason == null
    ) {
      this.invalidate(
        'status',
        'Corrected encounters require a replacement encounter and correction reason',
      );
    }
  } else if (this.supersededByEncounterId != null) {
    this.invalidate(
      'supersededByEncounterId',
      'Only corrected encounters may reference a replacement encounter',
    );
  }

  if (
    this.supersedesEncounterId != null &&
    this.supersedesEncounterId.equals(this._id)
  ) {
    this.invalidate(
      'supersedesEncounterId',
      'An encounter cannot supersede itself',
    );
  }
});

encounterSchema.index(
  {
    facilityId: 1,
    encounterNumber: 1,
  },
  {
    name: 'uq_encounters_facility_number',
    unique: true,
  },
);

encounterSchema.index(
  {
    facilityId: 1,
    opdVisitId: 1,
  },
  {
    name: 'uq_encounters_facility_opd_visit',
    unique: true,
    partialFilterExpression: {
      opdVisitId: {
        $type: 'objectId',
      },
      status: {
        $in: [...activeEncounterStatusValues],
      },
    },
  },
);

encounterSchema.index(
  {
    facilityId: 1,
    activeContextKey: 1,
  },
  {
    name: 'uq_encounters_facility_active_context',
    unique: true,
    partialFilterExpression: {
      activeContextKey: {
        $type: 'string',
      },
    },
  },
);

encounterSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    startedAt: -1,
  },
  {
    name: 'ix_encounters_facility_patient_started',
  },
);

encounterSchema.index(
  {
    facilityId: 1,
    currentOwnerId: 1,
    status: 1,
    serviceDate: 1,
  },
  {
    name: 'ix_encounters_facility_owner_status_date',
  },
);

encounterSchema.index(
  {
    facilityId: 1,
    departmentId: 1,
    clinicId: 1,
    servicePointId: 1,
    status: 1,
    serviceDate: 1,
  },
  {
    name: 'ix_encounters_facility_care_context_status_date',
  },
);

export const encounterStatusHistorySchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    encounterId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    sequence: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
    },
    fromStatus: {
      type: String,
      enum: [...encounterStatusValues, null],
      default: null,
      immutable: true,
    },
    toStatus: {
      type: String,
      required: true,
      enum: encounterStatusValues,
      immutable: true,
    },
    previousOwnerId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    newOwnerId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    previousOwnerRole: {
      type: String,
      enum: [...encounterOwnerRoleValues, null],
      default: null,
      immutable: true,
    },
    newOwnerRole: {
      type: String,
      required: true,
      enum: encounterOwnerRoleValues,
      immutable: true,
    },
    changeSource: {
      type: String,
      required: true,
      enum: encounterStatusChangeSourceValues,
      immutable: true,
    },
    reason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1_000,
      immutable: true,
      select: false,
    },
    occurredAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    changedBy: {
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
      immutable: true,
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
      immutable: true,
    },
  },
  {
    collection: 'encounterStatusHistories',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

encounterStatusHistorySchema.index(
  {
    facilityId: 1,
    encounterId: 1,
    sequence: 1,
  },
  {
    name: 'uq_encounter_status_histories_sequence',
    unique: true,
  },
);

encounterStatusHistorySchema.index(
  {
    facilityId: 1,
    patientId: 1,
    occurredAt: -1,
  },
  {
    name: 'ix_encounter_status_histories_patient_occurred',
  },
);

export type EncounterDocument =
  InferSchemaType<typeof encounterSchema>;

export type EncounterStatusHistoryDocument =
  InferSchemaType<typeof encounterStatusHistorySchema>;

export const EncounterModel =
  (mongoose.models['encounters'] as
    | Model<EncounterDocument>
    | undefined) ??
  mongoose.model<EncounterDocument>(
    'encounters',
    encounterSchema,
    'encounters',
  );

export const EncounterStatusHistoryModel =
  (mongoose.models['encounterStatusHistories'] as
    | Model<EncounterStatusHistoryDocument>
    | undefined) ??
  mongoose.model<EncounterStatusHistoryDocument>(
    'encounterStatusHistories',
    encounterStatusHistorySchema,
    'encounterStatusHistories',
  );