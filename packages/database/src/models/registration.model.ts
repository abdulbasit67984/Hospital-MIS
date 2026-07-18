import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  registrationModeValues,
  registrationSourceValues,
  registrationStatusValues,
  visitTypeValues,
} from './registration-queue.types.js';

export const registrationSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    registrationNumber: {
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
    registrationMode: {
      type: String,
      required: true,
      enum: registrationModeValues,
    },
    registrationSource: {
      type: String,
      required: true,
      enum: registrationSourceValues,
    },
    visitType: {
      type: String,
      required: true,
      enum: visitTypeValues,
    },
    status: {
      type: String,
      required: true,
      enum: registrationStatusValues,
      default: 'ACTIVE',
    },
    serviceDate: {
      type: String,
      required: true,
      immutable: true,
      match: /^\d{4}-\d{2}-\d{2}$/u,
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
    appointmentId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    referralId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    referralReference: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      maxlength: 160,
    },
    emergencyCaseId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
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
    registrationNotes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
      select: false,
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
    supersedesRegistrationId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    supersededByRegistrationId: {
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
    collection: 'registrations',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

registrationSchema.pre('validate', function validateRegistration() {
  const redirected =
    !this.patientId.equals(this.requestedPatientId);

  if (this.canonicalRedirected !== redirected) {
    this.invalidate(
      'canonicalRedirected',
      'canonicalRedirected must reflect whether the requested patient was redirected',
    );
  }

  if (
    this.checkedInAt != null &&
    this.checkedInAt < this.arrivedAt
  ) {
    this.invalidate(
      'checkedInAt',
      'Check-in cannot occur before arrival',
    );
  }

  if (
    this.registrationSource === 'APPOINTMENT' &&
    this.appointmentId == null
  ) {
    this.invalidate(
      'appointmentId',
      'Appointment registrations require appointmentId',
    );
  }

  if (
    this.registrationSource !== 'APPOINTMENT' &&
    this.appointmentId != null
  ) {
    this.invalidate(
      'appointmentId',
      'appointmentId is only valid for appointment registrations',
    );
  }

  if (
    this.registrationSource === 'REFERRAL' &&
    this.referralId == null &&
    this.referralReference == null
  ) {
    this.invalidate(
      'referralId',
      'Referral registrations require referralId or referralReference',
    );
  }

  if (
    this.registrationSource === 'EMERGENCY' &&
    this.visitType !== 'EMERGENCY'
  ) {
    this.invalidate(
      'visitType',
      'Emergency registration sources require EMERGENCY visit type',
    );
  }

  if (
    this.visitType === 'FOLLOW_UP' &&
    this.registrationMode !== 'RETURNING_PATIENT'
  ) {
    this.invalidate(
      'registrationMode',
      'Follow-up visits require RETURNING_PATIENT registration mode',
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
        'Cancelled registrations require cancellation metadata',
      );
    }
  } else if (
    this.cancelledAt != null ||
    this.cancelledBy != null ||
    this.cancellationReason != null
  ) {
    this.invalidate(
      'status',
      'Cancellation metadata is only valid for cancelled registrations',
    );
  }

  if (this.status === 'SUPERSEDED') {
    if (
      this.supersededByRegistrationId == null ||
      this.correctionReason == null
    ) {
      this.invalidate(
        'status',
        'Superseded registrations require replacement and correction reason',
      );
    }
  } else if (this.supersededByRegistrationId != null) {
    this.invalidate(
      'supersededByRegistrationId',
      'Only superseded registrations may reference a replacement',
    );
  }

  if (
    this.supersedesRegistrationId != null &&
    this.supersedesRegistrationId.equals(this._id)
  ) {
    this.invalidate(
      'supersedesRegistrationId',
      'A registration cannot supersede itself',
    );
  }
});

registrationSchema.index(
  {
    facilityId: 1,
    registrationNumber: 1,
  },
  {
    name: 'uq_registrations_facility_number',
    unique: true,
  },
);

registrationSchema.index(
  {
    transactionId: 1,
  },
  {
    name: 'uq_registrations_transaction',
    unique: true,
  },
);

registrationSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    serviceDate: -1,
    status: 1,
    arrivedAt: -1,
  },
  {
    name: 'ix_registrations_facility_patient_service_status_arrival',
  },
);

registrationSchema.index(
  {
    facilityId: 1,
    departmentId: 1,
    clinicId: 1,
    servicePointId: 1,
    serviceDate: 1,
    status: 1,
  },
  {
    name: 'ix_registrations_facility_context_service_status',
  },
);

registrationSchema.index(
  {
    facilityId: 1,
    appointmentId: 1,
  },
  {
    name: 'uq_registrations_facility_appointment',
    unique: true,
    partialFilterExpression: {
      appointmentId: {
        $type: 'objectId',
      },
      status: 'ACTIVE',
    },
  },
);

registrationSchema.index(
  {
    facilityId: 1,
    supersedesRegistrationId: 1,
  },
  {
    name: 'uq_registrations_facility_supersedes',
    unique: true,
    partialFilterExpression: {
      supersedesRegistrationId: {
        $type: 'objectId',
      },
    },
  },
);

export type RegistrationDocument =
  InferSchemaType<typeof registrationSchema>;

export const RegistrationModel =
  (mongoose.models['registrations'] as
    | Model<RegistrationDocument>
    | undefined) ??
  mongoose.model<RegistrationDocument>(
    'registrations',
    registrationSchema,
    'registrations',
  );