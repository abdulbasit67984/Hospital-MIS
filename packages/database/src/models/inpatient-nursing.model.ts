import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  medicationAdministrationRouteValues,
  medicationAdministrationSourceValues,
  medicationDoseStatusValues,
  medicationScheduleStatusValues,
  nursingAmendmentEntityTypeValues,
  nursingAmendmentTypeValues,
  nursingEntryStatusValues,
  nursingIntakeOutputDirectionValues,
  nursingIntakeOutputRouteValues,
  nursingNoteTypeValues,
  nursingObservationSeverityValues,
  wardHandoverStatusValues,
  wardHandoverTypeValues,
} from './inpatient-nursing.types.js';

const commonFields = {
  facilityId: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
  },
  admissionId: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
  },
  patientId: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
  },
  encounterId: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
  },
  wardId: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
  },
  roomId: {
    type: Schema.Types.ObjectId,
    default: null,
    immutable: true,
  },
  bedId: {
    type: Schema.Types.ObjectId,
    default: null,
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

const intakeOutputSchema = new Schema(
  {
    direction: {
      type: String,
      required: true,
      enum: nursingIntakeOutputDirectionValues,
    },
    route: {
      type: String,
      required: true,
      enum: nursingIntakeOutputRouteValues,
    },
    amountMillilitres: {
      type: Schema.Types.Decimal128,
      required: true,
    },
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1_000,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

export const nursingNoteSchema = new Schema(
  {
    ...commonFields,

    noteNumber: {
      type: String,
      required: true,
      immutable: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 120,
    },

    noteType: {
      type: String,
      required: true,
      enum: nursingNoteTypeValues,
    },

    observationSeverity: {
      type: String,
      required: true,
      enum: nursingObservationSeverityValues,
      default: 'ROUTINE',
    },

    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 300,
    },

    content: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 50_000,
      select: false,
    },

    intakeOutput: {
      type: intakeOutputSchema,
      default: null,
    },

    requiresEscalation: {
      type: Boolean,
      required: true,
      default: false,
    },

    escalationRecipientStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    escalatedAt: {
      type: Date,
      default: null,
    },

    acknowledgedAt: {
      type: Date,
      default: null,
    },

    acknowledgedByStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    recordedAt: {
      type: Date,
      required: true,
      immutable: true,
    },

    recordedByUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    recordedByStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    status: {
      type: String,
      required: true,
      enum: nursingEntryStatusValues,
      default: 'ACTIVE',
    },

    revisionNumber: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
      default: 1,
    },

    rootNursingNoteId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    supersedesNursingNoteId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },

    supersededByNursingNoteId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    correctedAt: {
      type: Date,
      default: null,
    },

    correctedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    correctionReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },

    enteredInErrorAt: {
      type: Date,
      default: null,
    },

    enteredInErrorBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    enteredInErrorReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },
  },
  {
    collection: 'nursingNotes',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

nursingNoteSchema.pre(
  'validate',
  function validateNursingNote() {
    if (
      this.noteType === 'INTAKE_OUTPUT' &&
      this.intakeOutput == null
    ) {
      this.invalidate(
        'intakeOutput',
        'Intake/output notes require structured intake/output values',
      );
    }

    if (
      this.noteType !== 'INTAKE_OUTPUT' &&
      this.intakeOutput != null
    ) {
      this.invalidate(
        'intakeOutput',
        'Structured intake/output values are only valid for intake/output notes',
      );
    }

    if (
      this.requiresEscalation &&
      this.escalationRecipientStaffId == null
    ) {
      this.invalidate(
        'escalationRecipientStaffId',
        'Escalated observations require a recipient',
      );
    }
  },
);

nursingNoteSchema.index(
  {
    facilityId: 1,
    noteNumber: 1,
  },
  {
    unique: true,
    name: 'uq_nursing_notes_facility_number',
  },
);

nursingNoteSchema.index(
  {
    facilityId: 1,
    admissionId: 1,
    recordedAt: -1,
  },
  {
    name: 'ix_nursing_notes_admission_timeline',
  },
);

nursingNoteSchema.index(
  {
    facilityId: 1,
    wardId: 1,
    noteType: 1,
    recordedAt: -1,
  },
  {
    name: 'ix_nursing_notes_ward_worklist',
  },
);

nursingNoteSchema.index(
  {
    facilityId: 1,
    rootNursingNoteId: 1,
    revisionNumber: 1,
  },
  {
    unique: true,
    name: 'uq_nursing_note_revisions',
  },
);

export const nursingNoteVersionSchema = new Schema(
  {
    ...commonFields,

    nursingNoteId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    rootNursingNoteId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    revisionNumber: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
    },

    snapshotHash: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 64,
      maxlength: 128,
    },

    noteTypeSnapshot: {
      type: String,
      required: true,
      immutable: true,
      enum: nursingNoteTypeValues,
    },

    observationSeveritySnapshot: {
      type: String,
      required: true,
      immutable: true,
      enum: nursingObservationSeverityValues,
    },

    titleSnapshot: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 300,
    },

    contentSnapshot: {
      type: String,
      required: true,
      immutable: true,
      maxlength: 50_000,
      select: false,
    },

    intakeOutputSnapshot: {
      type: intakeOutputSchema,
      default: null,
      immutable: true,
    },

    statusSnapshot: {
      type: String,
      required: true,
      immutable: true,
      enum: nursingEntryStatusValues,
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

    recordedByUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    recordedByStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
  },
  {
    collection: 'nursingNoteVersions',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

nursingNoteVersionSchema.index(
  {
    facilityId: 1,
    rootNursingNoteId: 1,
    revisionNumber: 1,
  },
  {
    unique: true,
    name: 'uq_nursing_note_versions_revision',
  },
);

export const medicationScheduleSchema = new Schema(
  {
    ...commonFields,

    scheduleNumber: {
      type: String,
      required: true,
      immutable: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 120,
    },

    prescriptionId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },

    prescriptionItemId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },

    source: {
      type: String,
      required: true,
      enum: medicationAdministrationSourceValues,
      immutable: true,
    },

    medicineId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    formularyItemId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },

    medicineDisplay: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 1,
      maxlength: 500,
    },

    prescribedDose: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
    },

    doseUnitCode: {
      type: String,
      required: true,
      immutable: true,
      uppercase: true,
      trim: true,
      minlength: 1,
      maxlength: 80,
    },

    route: {
      type: String,
      required: true,
      enum: medicationAdministrationRouteValues,
      immutable: true,
    },

    frequencyCode: {
      type: String,
      required: true,
      immutable: true,
      uppercase: true,
      trim: true,
      minlength: 1,
      maxlength: 80,
    },

    scheduledTimes: {
      type: [Date],
      required: true,
      default: [],
    },

    prn: {
      type: Boolean,
      required: true,
      default: false,
      immutable: true,
    },

    prnIndication: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1_000,
      select: false,
    },

    startAt: {
      type: Date,
      required: true,
      immutable: true,
    },

    endAt: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      required: true,
      enum: medicationScheduleStatusValues,
      default: 'ACTIVE',
    },

    holdReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
      select: false,
    },

    orderedByUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    orderedByStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    lastAdministrationAt: {
      type: Date,
      default: null,
    },

    nextScheduledAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: 'medicationSchedules',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

medicationScheduleSchema.index(
  {
    facilityId: 1,
    scheduleNumber: 1,
  },
  {
    unique: true,
    name: 'uq_medication_schedules_facility_number',
  },
);

medicationScheduleSchema.index(
  {
    facilityId: 1,
    admissionId: 1,
    status: 1,
    nextScheduledAt: 1,
  },
  {
    name: 'ix_medication_schedules_due',
  },
);

medicationScheduleSchema.index(
  {
    facilityId: 1,
    admissionId: 1,
    prescriptionItemId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      prescriptionItemId: {
        $type: 'objectId',
      },
      status: {
        $in: [
          'ACTIVE',
          'HELD',
        ],
      },
    },
    name: 'uq_active_medication_schedule_prescription_item',
  },
);

export const medicationAdministrationSchema =
  new Schema(
    {
      ...commonFields,

      administrationNumber: {
        type: String,
        required: true,
        immutable: true,
        uppercase: true,
        trim: true,
        minlength: 3,
        maxlength: 120,
      },

      medicationScheduleId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      prescriptionId: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      prescriptionItemId: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      medicineId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      medicineDisplaySnapshot: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        maxlength: 500,
      },

      scheduledAt: {
        type: Date,
        required: true,
        immutable: true,
      },

      status: {
        type: String,
        required: true,
        enum: medicationDoseStatusValues,
      },

      prescribedDose: {
        type: Schema.Types.Decimal128,
        required: true,
        immutable: true,
      },

      administeredDose: {
        type: Schema.Types.Decimal128,
        default: null,
      },

      doseUnitCode: {
        type: String,
        required: true,
        uppercase: true,
        trim: true,
        maxlength: 80,
        immutable: true,
      },

      prescribedRoute: {
        type: String,
        required: true,
        enum: medicationAdministrationRouteValues,
        immutable: true,
      },

      administeredRoute: {
        type: String,
        default: null,
        enum: [
          ...medicationAdministrationRouteValues,
          null,
        ],
      },

      administeredAt: {
        type: Date,
        default: null,
      },

      administeringNurseUserId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      administeringNurseStaffId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      reasonCode: {
        type: String,
        default: null,
        uppercase: true,
        trim: true,
        maxlength: 100,
      },

      reason: {
        type: String,
        default: null,
        trim: true,
        maxlength: 2_000,
        select: false,
      },

      notes: {
        type: String,
        default: null,
        trim: true,
        maxlength: 5_000,
        select: false,
      },

      delayedUntil: {
        type: Date,
        default: null,
      },

      statusChangedAt: {
        type: Date,
        required: true,
      },

      statusChangedBy: {
        type: Schema.Types.ObjectId,
        required: true,
      },

      correctionOfAdministrationId: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      supersededByAdministrationId: {
        type: Schema.Types.ObjectId,
        default: null,
      },
    },
    {
      collection: 'medicationAdministrations',
      strict: true,
      timestamps: true,
      versionKey: false,
    },
  );

medicationAdministrationSchema.pre(
  'validate',
  function validateAdministration() {
    if (
      this.status === 'ADMINISTERED' &&
      (
        this.administeredDose == null ||
        this.administeredRoute == null ||
        this.administeredAt == null ||
        this.administeringNurseUserId == null ||
        this.administeringNurseStaffId == null
      )
    ) {
      this.invalidate(
        'status',
        'Administered doses require dose, route, administration time, and nurse attribution',
      );
    }

    if (
      [
        'OMITTED',
        'REFUSED',
        'DELAYED',
      ].includes(
        this.status,
      ) &&
      (
        this.reasonCode == null ||
        this.reason == null
      )
    ) {
      this.invalidate(
        'reason',
        'Omitted, refused, and delayed doses require a reason',
      );
    }

    if (
      this.status === 'DELAYED' &&
      this.delayedUntil == null
    ) {
      this.invalidate(
        'delayedUntil',
        'Delayed doses require a revised due time',
      );
    }
  },
);

medicationAdministrationSchema.index(
  {
    facilityId: 1,
    administrationNumber: 1,
  },
  {
    unique: true,
    name: 'uq_medication_administrations_facility_number',
  },
);

medicationAdministrationSchema.index(
  {
    facilityId: 1,
    medicationScheduleId: 1,
    scheduledAt: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      correctionOfAdministrationId: null,
    },
    name: 'uq_medication_administration_scheduled_dose',
  },
);

medicationAdministrationSchema.index(
  {
    facilityId: 1,
    wardId: 1,
    status: 1,
    scheduledAt: 1,
  },
  {
    name: 'ix_medication_administration_ward_due',
  },
);

medicationAdministrationSchema.index(
  {
    facilityId: 1,
    admissionId: 1,
    scheduledAt: -1,
  },
  {
    name: 'ix_medication_administration_admission_history',
  },
);

export const medicationAdministrationAmendmentSchema =
  new Schema(
    {
      ...commonFields,

      medicationAdministrationId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      amendmentSequence: {
        type: Number,
        required: true,
        immutable: true,
        min: 1,
      },

      amendmentType: {
        type: String,
        required: true,
        immutable: true,
        enum: nursingAmendmentTypeValues,
      },

      previousStatus: {
        type: String,
        required: true,
        immutable: true,
        enum: medicationDoseStatusValues,
      },

      replacementAdministrationId: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      reason: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 5,
        maxlength: 2_000,
        select: false,
      },

      snapshotHash: {
        type: String,
        required: true,
        immutable: true,
        minlength: 64,
        maxlength: 128,
      },

      occurredAt: {
        type: Date,
        required: true,
        immutable: true,
      },

      performedByUserId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      performedByStaffId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },
    },
    {
      collection:
        'medicationAdministrationAmendments',

      strict: true,
      timestamps: true,
      versionKey: false,
    },
  );

medicationAdministrationAmendmentSchema.index(
  {
    facilityId: 1,
    medicationAdministrationId: 1,
    amendmentSequence: 1,
  },
  {
    unique: true,
    name: 'uq_medication_administration_amendment_sequence',
  },
);

export const wardHandoverSchema = new Schema(
  {
    ...commonFields,

    handoverNumber: {
      type: String,
      required: true,
      immutable: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 120,
    },

    handoverType: {
      type: String,
      required: true,
      enum: wardHandoverTypeValues,
      immutable: true,
    },

    shiftCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      minlength: 1,
      maxlength: 80,
      immutable: true,
    },

    summary: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 50_000,
      select: false,
    },

    activeConcerns: {
      type: [String],
      required: true,
      default: [],
      select: false,
    },

    pendingTasks: {
      type: [String],
      required: true,
      default: [],
      select: false,
    },

    medicationConcerns: {
      type: [String],
      required: true,
      default: [],
      select: false,
    },

    safetyConcerns: {
      type: [String],
      required: true,
      default: [],
      select: false,
    },

    fromNurseUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    fromNurseStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    toNurseUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    toNurseStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    handedOverAt: {
      type: Date,
      required: true,
      immutable: true,
    },

    status: {
      type: String,
      required: true,
      enum: wardHandoverStatusValues,
      default: 'DRAFT',
    },

    signedAt: {
      type: Date,
      default: null,
    },

    acknowledgedAt: {
      type: Date,
      default: null,
    },

    acknowledgedByUserId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    acknowledgedByStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    supersedesWardHandoverId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },

    supersededByWardHandoverId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
  },
  {
    collection: 'wardHandovers',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

wardHandoverSchema.index(
  {
    facilityId: 1,
    handoverNumber: 1,
  },
  {
    unique: true,
    name: 'uq_ward_handovers_facility_number',
  },
);

wardHandoverSchema.index(
  {
    facilityId: 1,
    wardId: 1,
    handedOverAt: -1,
  },
  {
    name: 'ix_ward_handovers_ward_timeline',
  },
);

wardHandoverSchema.index(
  {
    facilityId: 1,
    toNurseStaffId: 1,
    status: 1,
    handedOverAt: -1,
  },
  {
    name: 'ix_ward_handovers_acknowledgement_worklist',
  },
);

export const nursingEntryAmendmentSchema =
  new Schema(
    {
      facilityId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      admissionId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      patientId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      entityType: {
        type: String,
        required: true,
        immutable: true,
        enum: nursingAmendmentEntityTypeValues,
      },

      entityId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      amendmentSequence: {
        type: Number,
        required: true,
        immutable: true,
        min: 1,
      },

      amendmentType: {
        type: String,
        required: true,
        immutable: true,
        enum: nursingAmendmentTypeValues,
      },

      previousSnapshotHash: {
        type: String,
        required: true,
        immutable: true,
        minlength: 64,
        maxlength: 128,
      },

      replacementEntityId: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      reason: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 5,
        maxlength: 2_000,
        select: false,
      },

      occurredAt: {
        type: Date,
        required: true,
        immutable: true,
      },

      performedByUserId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      performedByStaffId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      transactionId: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        maxlength: 200,
      },

      correlationId: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
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
      collection: 'nursingEntryAmendments',
      strict: true,
      timestamps: true,
      versionKey: false,
    },
  );

nursingEntryAmendmentSchema.index(
  {
    facilityId: 1,
    entityType: 1,
    entityId: 1,
    amendmentSequence: 1,
  },
  {
    unique: true,
    name: 'uq_nursing_entry_amendment_sequence',
  },
);

export type NursingNoteDocument =
  InferSchemaType<typeof nursingNoteSchema>;

export type NursingNoteVersionDocument =
  InferSchemaType<typeof nursingNoteVersionSchema>;

export type MedicationScheduleDocument =
  InferSchemaType<typeof medicationScheduleSchema>;

export type MedicationAdministrationDocument =
  InferSchemaType<
    typeof medicationAdministrationSchema
  >;

export type MedicationAdministrationAmendmentDocument =
  InferSchemaType<
    typeof medicationAdministrationAmendmentSchema
  >;

export type WardHandoverDocument =
  InferSchemaType<typeof wardHandoverSchema>;

export type NursingEntryAmendmentDocument =
  InferSchemaType<
    typeof nursingEntryAmendmentSchema
  >;

export const NursingNoteModel =
  (
    mongoose.models.NursingNote as
      | Model<NursingNoteDocument>
      | undefined
  ) ??
  mongoose.model<NursingNoteDocument>(
    'NursingNote',
    nursingNoteSchema,
  );

export const NursingNoteVersionModel =
  (
    mongoose.models.NursingNoteVersion as
      | Model<NursingNoteVersionDocument>
      | undefined
  ) ??
  mongoose.model<NursingNoteVersionDocument>(
    'NursingNoteVersion',
    nursingNoteVersionSchema,
  );

export const MedicationScheduleModel =
  (
    mongoose.models.MedicationSchedule as
      | Model<MedicationScheduleDocument>
      | undefined
  ) ??
  mongoose.model<MedicationScheduleDocument>(
    'MedicationSchedule',
    medicationScheduleSchema,
  );

export const MedicationAdministrationModel =
  (
    mongoose.models.MedicationAdministration as
      | Model<MedicationAdministrationDocument>
      | undefined
  ) ??
  mongoose.model<MedicationAdministrationDocument>(
    'MedicationAdministration',
    medicationAdministrationSchema,
  );

export const MedicationAdministrationAmendmentModel =
  (
    mongoose.models
      .MedicationAdministrationAmendment as
      | Model<MedicationAdministrationAmendmentDocument>
      | undefined
  ) ??
  mongoose.model<MedicationAdministrationAmendmentDocument>(
    'MedicationAdministrationAmendment',
    medicationAdministrationAmendmentSchema,
  );

export const WardHandoverModel =
  (
    mongoose.models.WardHandover as
      | Model<WardHandoverDocument>
      | undefined
  ) ??
  mongoose.model<WardHandoverDocument>(
    'WardHandover',
    wardHandoverSchema,
  );

export const NursingEntryAmendmentModel =
  (
    mongoose.models.NursingEntryAmendment as
      | Model<NursingEntryAmendmentDocument>
      | undefined
  ) ??
  mongoose.model<NursingEntryAmendmentDocument>(
    'NursingEntryAmendment',
    nursingEntryAmendmentSchema,
  );