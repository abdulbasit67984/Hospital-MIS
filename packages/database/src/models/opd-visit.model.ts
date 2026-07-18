import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  activeOpdVisitStatusValues,
  opdVisitStatusValues,
  registrationSourceValues,
  visitTypeValues,
} from './registration-queue.types.js';

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

export const opdVisitSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    visitNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 120,
    },
    registrationId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
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
    serviceDate: {
      type: String,
      required: true,
      immutable: true,
      match: /^\d{4}-\d{2}-\d{2}$/u,
    },
    visitType: {
      type: String,
      required: true,
      enum: visitTypeValues,
    },
    registrationSource: {
      type: String,
      required: true,
      enum: registrationSourceValues,
    },
    status: {
      type: String,
      required: true,
      enum: opdVisitStatusValues,
      default: 'REGISTERED',
    },
    departmentId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    clinicId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    servicePointId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    assignedProviderId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    assignedCounterId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    currentQueueTokenId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    activeVisitKey: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
      select: false,
    },
    arrivedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    checkedInAt: {
      type: Date,
      default: null,
    },
    queuedAt: {
      type: Date,
      default: null,
    },
    serviceStartedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
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
    noShowAt: {
      type: Date,
      default: null,
    },
    noShowMarkedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    supersedesVisitId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    supersededByVisitId: {
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
    collection: 'opdVisits',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

opdVisitSchema.pre('validate', function validateOpdVisit() {
  const redirected =
    !this.patientId.equals(this.requestedPatientId);

  if (this.canonicalRedirected !== redirected) {
    this.invalidate(
      'canonicalRedirected',
      'canonicalRedirected must reflect whether the requested patient was redirected',
    );
  }

  const active = activeOpdVisitStatusValues.includes(
    this.status as
      (typeof activeOpdVisitStatusValues)[number],
  );

  if (active) {
    const contextKey = [
      objectIdText(this.departmentId),
      this.clinicId == null
        ? '-'
        : objectIdText(this.clinicId),
      this.servicePointId == null
        ? '-'
        : objectIdText(this.servicePointId),
    ].join(':');

    this.activeVisitKey =
      `${objectIdText(this.patientId)}:${this.serviceDate}:${contextKey}`;
  } else {
    this.activeVisitKey = null;
  }

  const chronological = [
    this.arrivedAt,
    this.checkedInAt,
    this.queuedAt,
    this.serviceStartedAt,
    this.completedAt,
  ].filter(
    (value): value is Date =>
      value instanceof Date,
  );

  for (
    let index = 1;
    index < chronological.length;
    index += 1
  ) {
    const previous =
      chronological[index - 1];

    const current =
      chronological[index];

    if (
      previous != null &&
      current != null &&
      current < previous
    ) {
      this.invalidate(
        'status',
        'Visit lifecycle timestamps must be chronological',
      );

      break;
    }
  }

  if (
    this.status === 'CHECKED_IN' &&
    this.checkedInAt == null
  ) {
    this.invalidate(
      'checkedInAt',
      'Checked-in visits require checkedInAt',
    );
  }

  if (
    this.status === 'QUEUED' &&
    this.queuedAt == null
  ) {
    this.invalidate(
      'queuedAt',
      'Queued visits require queuedAt',
    );
  }

  if (
    this.status === 'IN_SERVICE' &&
    this.serviceStartedAt == null
  ) {
    this.invalidate(
      'serviceStartedAt',
      'Visits in service require serviceStartedAt',
    );
  }

  if (
    this.status === 'COMPLETED' &&
    this.completedAt == null
  ) {
    this.invalidate(
      'completedAt',
      'Completed visits require completedAt',
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
        'Cancelled visits require cancellation metadata',
      );
    }
  } else if (
    this.cancelledAt != null ||
    this.cancelledBy != null ||
    this.cancellationReason != null
  ) {
    this.invalidate(
      'status',
      'Cancellation metadata is only valid for cancelled visits',
    );
  }

  if (this.status === 'NO_SHOW') {
    if (
      this.noShowAt == null ||
      this.noShowMarkedBy == null
    ) {
      this.invalidate(
        'status',
        'No-show visits require no-show metadata',
      );
    }
  } else if (
    this.noShowAt != null ||
    this.noShowMarkedBy != null
  ) {
    this.invalidate(
      'status',
      'No-show metadata is only valid for no-show visits',
    );
  }

  if (this.status === 'CORRECTED') {
    if (
      this.supersededByVisitId == null ||
      this.correctionReason == null
    ) {
      this.invalidate(
        'status',
        'Corrected visits require a replacement visit and correction reason',
      );
    }
  } else if (this.supersededByVisitId != null) {
    this.invalidate(
      'supersededByVisitId',
      'Only corrected visits may reference a replacement visit',
    );
  }

  if (
    this.supersedesVisitId != null &&
    this.supersedesVisitId.equals(this._id)
  ) {
    this.invalidate(
      'supersedesVisitId',
      'A visit cannot supersede itself',
    );
  }
});

opdVisitSchema.index(
  {
    facilityId: 1,
    visitNumber: 1,
  },
  {
    name: 'uq_opd_visits_facility_number',
    unique: true,
  },
);

opdVisitSchema.index(
  {
    facilityId: 1,
    registrationId: 1,
  },
  {
    name: 'uq_opd_visits_facility_registration',
    unique: true,
  },
);

opdVisitSchema.index(
  {
    transactionId: 1,
  },
  {
    name: 'uq_opd_visits_transaction',
    unique: true,
  },
);

opdVisitSchema.index(
  {
    facilityId: 1,
    activeVisitKey: 1,
  },
  {
    name: 'uq_opd_visits_facility_active_key',
    unique: true,
    partialFilterExpression: {
      activeVisitKey: {
        $type: 'string',
      },
    },
  },
);

opdVisitSchema.index(
  {
    facilityId: 1,
    serviceDate: 1,
    departmentId: 1,
    clinicId: 1,
    servicePointId: 1,
    assignedProviderId: 1,
    status: 1,
    arrivedAt: 1,
  },
  {
    name: 'ix_opd_visits_facility_context_status_arrival',
  },
);

opdVisitSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    serviceDate: -1,
    arrivedAt: -1,
  },
  {
    name: 'ix_opd_visits_facility_patient_service_arrival',
  },
);

opdVisitSchema.index(
  {
    facilityId: 1,
    supersedesVisitId: 1,
  },
  {
    name: 'uq_opd_visits_facility_supersedes',
    unique: true,
    partialFilterExpression: {
      supersedesVisitId: {
        $type: 'objectId',
      },
    },
  },
);

export type OpdVisitDocument =
  InferSchemaType<typeof opdVisitSchema>;

export const OpdVisitModel =
  (mongoose.models['opdVisits'] as
    | Model<OpdVisitDocument>
    | undefined) ??
  mongoose.model<OpdVisitDocument>(
    'opdVisits',
    opdVisitSchema,
    'opdVisits',
  );