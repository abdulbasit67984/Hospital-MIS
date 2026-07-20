import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  intakeOutputCategoryValues,
  intakeOutputDirectionValues,
  intakeOutputEntryStatusValues,
  nursingAssessmentRiskLevelValues,
  nursingAssessmentStatusValues,
  nursingAssessmentTypeValues,
  nursingCarePlanGoalStatusValues,
  nursingCarePlanProblemStatusValues,
  nursingCarePlanStatusValues,
  nursingDeviceObservationTypeValues,
  nursingDeviceStatusValues,
  nursingDeviceTypeValues,
  nursingInterventionFrequencyTypeValues,
  nursingTaskPriorityValues,
  nursingTaskSourceTypeValues,
  nursingTaskStatusValues,
  woundClassificationValues,
} from './nursing-medication.types.js';

const nursingClinicalContextFields = {
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
  },
  roomId: {
    type: Schema.Types.ObjectId,
    default: null,
  },
  bedId: {
    type: Schema.Types.ObjectId,
    default: null,
  },
} as const;

const operationalFields = {
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
  idempotencyKey: {
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

const immutableVersionFields = {
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
  createdBy: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
  },
} as const;

const structuredAssessmentSectionSchema = new Schema(
  {
    sectionCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    sectionLabel: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
    },
    values: {
      type: Schema.Types.Mixed,
      required: true,
    },
    narrative: {
      type: String,
      default: null,
      trim: true,
      maxlength: 10_000,
      select: false,
    },
    riskLevel: {
      type: String,
      required: true,
      enum: nursingAssessmentRiskLevelValues,
      default: 'NOT_ASSESSED',
    },
    score: {
      type: Schema.Types.Decimal128,
      default: null,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

export const nursingAssessmentSchema = new Schema(
  {
    ...nursingClinicalContextFields,
    ...operationalFields,

    assessmentNumber: {
      type: String,
      required: true,
      immutable: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 120,
    },
    assessmentType: {
      type: String,
      required: true,
      enum: nursingAssessmentTypeValues,
      immutable: true,
    },
    templateCode: {
      type: String,
      default: null,
      uppercase: true,
      trim: true,
      maxlength: 100,
      immutable: true,
    },
    templateVersion: {
      type: Number,
      default: null,
      min: 1,
      immutable: true,
    },
    sections: {
      type: [structuredAssessmentSectionSchema],
      required: true,
      default: [],
    },
    summary: {
      type: String,
      default: null,
      trim: true,
      maxlength: 20_000,
      select: false,
    },
    overallRiskLevel: {
      type: String,
      required: true,
      enum: nursingAssessmentRiskLevelValues,
      default: 'NOT_ASSESSED',
    },
    requiresEscalation: {
      type: Boolean,
      required: true,
      default: false,
    },
    escalationReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },
    assessedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    recordedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    backdatedEntryReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },
    assessedByUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    assessedByStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      required: true,
      enum: nursingAssessmentStatusValues,
      default: 'DRAFT',
    },
    signedAt: {
      type: Date,
      default: null,
    },
    signedByUserId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    signedByStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    revisionNumber: {
      type: Number,
      required: true,
      immutable: true,
      default: 1,
      min: 1,
    },
    rootAssessmentId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    supersedesAssessmentId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    supersededByAssessmentId: {
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
    enteredInErrorByUserId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    enteredInErrorByStaffId: {
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
    collection: 'nursingAssessments',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

nursingAssessmentSchema.pre(
  'validate',
  function validateAssessment() {
    if (
      this.assessmentType === 'CUSTOM' &&
      this.templateCode == null
    ) {
      this.invalidate(
        'templateCode',
        'Custom assessments require a template code',
      );
    }

    if (
      this.status === 'SIGNED' &&
      (
        this.signedAt == null ||
        this.signedByUserId == null ||
        this.signedByStaffId == null
      )
    ) {
      this.invalidate(
        'signedAt',
        'Signed assessments require complete signing attribution',
      );
    }

    if (
      this.recordedAt.getTime() >
      Date.now()
    ) {
      this.invalidate(
        'recordedAt',
        'Recorded time cannot be in the future',
      );
    }

    if (
      this.assessedAt.getTime() >
      this.recordedAt.getTime()
    ) {
      this.invalidate(
        'assessedAt',
        'Assessment time cannot be after recorded time',
      );
    }

    if (
      this.assessedAt.getTime() <
        this.recordedAt.getTime() -
          15 * 60 * 1000 &&
      this.backdatedEntryReason == null
    ) {
      this.invalidate(
        'backdatedEntryReason',
        'Backdated assessments require a reason',
      );
    }

    if (
      this.requiresEscalation &&
      this.escalationReason == null
    ) {
      this.invalidate(
        'escalationReason',
        'Escalated assessments require a reason',
      );
    }
  },
);

nursingAssessmentSchema.index(
  {
    facilityId: 1,
    assessmentNumber: 1,
  },
  {
    unique: true,
  },
);

nursingAssessmentSchema.index(
  {
    facilityId: 1,
    idempotencyKey: 1,
  },
  {
    unique: true,
  },
);

nursingAssessmentSchema.index({
  facilityId: 1,
  admissionId: 1,
  assessmentType: 1,
  assessedAt: -1,
});

nursingAssessmentSchema.index({
  facilityId: 1,
  wardId: 1,
  status: 1,
  assessedAt: -1,
});

nursingAssessmentSchema.index({
  facilityId: 1,
  rootAssessmentId: 1,
  revisionNumber: 1,
});

export const nursingAssessmentVersionSchema =
  new Schema(
    {
      ...nursingClinicalContextFields,
      ...immutableVersionFields,

      nursingAssessmentId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },
      rootAssessmentId: {
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
      snapshot: {
        type: Schema.Types.Mixed,
        required: true,
        immutable: true,
        select: false,
      },
      capturedAt: {
        type: Date,
        required: true,
        immutable: true,
      },
      capturedByUserId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },
      capturedByStaffId: {
        type: Schema.Types.ObjectId,
        required: true,
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
    },
    {
      collection: 'nursingAssessmentVersions',
      strict: true,
      timestamps: {
        createdAt: true,
        updatedAt: false,
      },
      versionKey: false,
    },
  );

nursingAssessmentVersionSchema.index(
  {
    facilityId: 1,
    nursingAssessmentId: 1,
    revisionNumber: 1,
  },
  {
    unique: true,
  },
);

nursingAssessmentVersionSchema.index({
  facilityId: 1,
  rootAssessmentId: 1,
  revisionNumber: -1,
});

const carePlanGoalSchema = new Schema(
  {
    goalId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 5_000,
      select: false,
    },
    expectedOutcome: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 5_000,
      select: false,
    },
    targetDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: nursingCarePlanGoalStatusValues,
      default: 'PLANNED',
    },
    evaluation: {
      type: String,
      default: null,
      trim: true,
      maxlength: 5_000,
      select: false,
    },
    evaluatedAt: {
      type: Date,
      default: null,
    },
    evaluatedByStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

const interventionFrequencySchema = new Schema(
  {
    type: {
      type: String,
      required: true,
      enum: nursingInterventionFrequencyTypeValues,
    },
    intervalMinutes: {
      type: Number,
      default: null,
      min: 1,
      max: 525_600,
    },
    timesOfDay: {
      type: [String],
      required: true,
      default: [],
    },
    shiftCodes: {
      type: [String],
      required: true,
      default: [],
    },
    instruction: {
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

const carePlanInterventionSchema = new Schema(
  {
    interventionId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 5_000,
      select: false,
    },
    frequency: {
      type: interventionFrequencySchema,
      required: true,
    },
    assignedStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    assignedTeamCode: {
      type: String,
      default: null,
      uppercase: true,
      trim: true,
      maxlength: 100,
    },
    startsAt: {
      type: Date,
      required: true,
    },
    endsAt: {
      type: Date,
      default: null,
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

const carePlanProblemSchema = new Schema(
  {
    problemId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    problemCode: {
      type: String,
      default: null,
      uppercase: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 5_000,
      select: false,
    },
    identifiedAt: {
      type: Date,
      required: true,
    },
    sourceAssessmentId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: nursingCarePlanProblemStatusValues,
      default: 'ACTIVE',
    },
    goals: {
      type: [carePlanGoalSchema],
      required: true,
      default: [],
    },
    interventions: {
      type: [carePlanInterventionSchema],
      required: true,
      default: [],
    },
  },
  {
    _id: false,
    strict: true,
  },
);

export const nursingCarePlanSchema = new Schema(
  {
    ...nursingClinicalContextFields,
    ...operationalFields,

    carePlanNumber: {
      type: String,
      required: true,
      immutable: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 120,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 300,
    },
    status: {
      type: String,
      required: true,
      enum: nursingCarePlanStatusValues,
      default: 'DRAFT',
    },
    problems: {
      type: [carePlanProblemSchema],
      required: true,
      default: [],
    },
    assignedNurseStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    assignedTeamCode: {
      type: String,
      default: null,
      uppercase: true,
      trim: true,
      maxlength: 100,
    },
    startedAt: {
      type: Date,
      required: true,
    },
    targetCompletionAt: {
      type: Date,
      default: null,
    },
    nextReviewAt: {
      type: Date,
      default: null,
    },
    lastReviewedAt: {
      type: Date,
      default: null,
    },
    lastReviewedByStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    outcomeEvaluation: {
      type: String,
      default: null,
      trim: true,
      maxlength: 10_000,
      select: false,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    completedByStaffId: {
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
    revisionNumber: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    rootCarePlanId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    supersedesCarePlanId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    supersededByCarePlanId: {
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
  },
  {
    collection: 'nursingCarePlans',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

nursingCarePlanSchema.pre(
  'validate',
  function validateCarePlan() {
    if (
      this.targetCompletionAt != null &&
      this.targetCompletionAt.getTime() <
        this.startedAt.getTime()
    ) {
      this.invalidate(
        'targetCompletionAt',
        'Target completion cannot precede the care-plan start',
      );
    }

    if (
      this.status === 'COMPLETED' &&
      (
        this.completedAt == null ||
        this.completedByStaffId == null
      )
    ) {
      this.invalidate(
        'completedAt',
        'Completed care plans require completion attribution',
      );
    }

    if (
      this.status === 'CANCELLED' &&
      this.cancellationReason == null
    ) {
      this.invalidate(
        'cancellationReason',
        'Cancelled care plans require a reason',
      );
    }
  },
);

nursingCarePlanSchema.index(
  {
    facilityId: 1,
    carePlanNumber: 1,
  },
  {
    unique: true,
  },
);

nursingCarePlanSchema.index(
  {
    facilityId: 1,
    idempotencyKey: 1,
  },
  {
    unique: true,
  },
);

nursingCarePlanSchema.index({
  facilityId: 1,
  admissionId: 1,
  status: 1,
  startedAt: -1,
});

nursingCarePlanSchema.index({
  facilityId: 1,
  wardId: 1,
  assignedNurseStaffId: 1,
  status: 1,
});

export const nursingCarePlanVersionSchema =
  new Schema(
    {
      ...nursingClinicalContextFields,
      ...immutableVersionFields,

      nursingCarePlanId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },
      rootCarePlanId: {
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
      snapshot: {
        type: Schema.Types.Mixed,
        required: true,
        immutable: true,
        select: false,
      },
      capturedAt: {
        type: Date,
        required: true,
        immutable: true,
      },
      capturedByUserId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },
      capturedByStaffId: {
        type: Schema.Types.ObjectId,
        required: true,
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
    },
    {
      collection: 'nursingCarePlanVersions',
      strict: true,
      timestamps: {
        createdAt: true,
        updatedAt: false,
      },
      versionKey: false,
    },
  );

nursingCarePlanVersionSchema.index(
  {
    facilityId: 1,
    nursingCarePlanId: 1,
    revisionNumber: 1,
  },
  {
    unique: true,
  },
);

export const nursingTaskSchema = new Schema(
  {
    ...nursingClinicalContextFields,
    ...operationalFields,

    taskNumber: {
      type: String,
      required: true,
      immutable: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 120,
    },
    sourceType: {
      type: String,
      required: true,
      enum: nursingTaskSourceTypeValues,
      immutable: true,
    },
    sourceRecordId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    carePlanId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    carePlanInterventionId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 300,
    },
    instructions: {
      type: String,
      default: null,
      trim: true,
      maxlength: 10_000,
      select: false,
    },
    priority: {
      type: String,
      required: true,
      enum: nursingTaskPriorityValues,
      default: 'ROUTINE',
    },
    status: {
      type: String,
      required: true,
      enum: nursingTaskStatusValues,
      default: 'PENDING',
    },
    assignedStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    assignedTeamCode: {
      type: String,
      default: null,
      uppercase: true,
      trim: true,
      maxlength: 100,
    },
    scheduledAt: {
      type: Date,
      default: null,
    },
    dueAt: {
      type: Date,
      required: true,
    },
    recurrenceKey: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
      immutable: true,
    },
    carriedForwardFromTaskId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    carriedForwardToTaskId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    completedByUserId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    completedByStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    dispositionReasonCode: {
      type: String,
      default: null,
      uppercase: true,
      trim: true,
      maxlength: 100,
    },
    dispositionReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
      select: false,
    },
    escalatedAt: {
      type: Date,
      default: null,
    },
    escalatedToStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    escalationReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
      select: false,
    },
  },
  {
    collection: 'nursingTasks',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

nursingTaskSchema.pre(
  'validate',
  function validateNursingTask() {
    if (
      this.scheduledAt != null &&
      this.dueAt.getTime() <
        this.scheduledAt.getTime()
    ) {
      this.invalidate(
        'dueAt',
        'Task due time cannot precede its scheduled time',
      );
    }

    if (
      this.status === 'COMPLETED' &&
      (
        this.completedAt == null ||
        this.completedByUserId == null ||
        this.completedByStaffId == null
      )
    ) {
      this.invalidate(
        'completedAt',
        'Completed tasks require completion attribution',
      );
    }

    if (
      [
        'OMITTED',
        'DELAYED',
        'REFUSED',
        'CANCELLED',
      ].includes(this.status) &&
      this.dispositionReason == null
    ) {
      this.invalidate(
        'dispositionReason',
        `${this.status} tasks require a reason`,
      );
    }

    if (
      this.status === 'ESCALATED' &&
      (
        this.escalatedAt == null ||
        this.escalationReason == null
      )
    ) {
      this.invalidate(
        'escalationReason',
        'Escalated tasks require escalation details',
      );
    }
  },
);

nursingTaskSchema.index(
  {
    facilityId: 1,
    taskNumber: 1,
  },
  {
    unique: true,
  },
);

nursingTaskSchema.index(
  {
    facilityId: 1,
    idempotencyKey: 1,
  },
  {
    unique: true,
  },
);

nursingTaskSchema.index({
  facilityId: 1,
  wardId: 1,
  status: 1,
  dueAt: 1,
  priority: -1,
});

nursingTaskSchema.index({
  facilityId: 1,
  assignedStaffId: 1,
  status: 1,
  dueAt: 1,
});

nursingTaskSchema.index(
  {
    facilityId: 1,
    recurrenceKey: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      recurrenceKey: {
        $type: 'string',
      },
    },
  },
);

export const intakeOutputEntrySchema = new Schema(
  {
    ...nursingClinicalContextFields,
    ...operationalFields,

    entryNumber: {
      type: String,
      required: true,
      immutable: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 120,
    },
    direction: {
      type: String,
      required: true,
      enum: intakeOutputDirectionValues,
      immutable: true,
    },
    category: {
      type: String,
      required: true,
      enum: intakeOutputCategoryValues,
      immutable: true,
    },
    sourceDescription: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1_000,
    },
    volumeMillilitres: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
    },
    originalQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
    },
    originalUnitCode: {
      type: String,
      required: true,
      immutable: true,
      uppercase: true,
      trim: true,
      minlength: 1,
      maxlength: 50,
    },
    conversionFactorToMillilitres: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
    },
    occurredAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    recordedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    shiftCode: {
      type: String,
      required: true,
      immutable: true,
      uppercase: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
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
      enum: intakeOutputEntryStatusValues,
      default: 'ACTIVE',
    },
    rootEntryId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    revisionNumber: {
      type: Number,
      required: true,
      immutable: true,
      default: 1,
      min: 1,
    },
    supersedesEntryId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    supersededByEntryId: {
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
    enteredInErrorByUserId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    enteredInErrorByStaffId: {
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
    collection: 'intakeOutputEntries',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

intakeOutputEntrySchema.pre(
  'validate',
  function validateIntakeOutputEntry() {
    const volume = Number(
      this.volumeMillilitres.toString(),
    );

    const originalQuantity = Number(
      this.originalQuantity.toString(),
    );

    const conversionFactor = Number(
      this.conversionFactorToMillilitres.toString(),
    );

    if (
      !Number.isFinite(volume) ||
      volume <= 0
    ) {
      this.invalidate(
        'volumeMillilitres',
        'Normalized volume must be greater than zero',
      );
    }

    if (
      !Number.isFinite(originalQuantity) ||
      originalQuantity <= 0
    ) {
      this.invalidate(
        'originalQuantity',
        'Original quantity must be greater than zero',
      );
    }

    if (
      !Number.isFinite(conversionFactor) ||
      conversionFactor <= 0
    ) {
      this.invalidate(
        'conversionFactorToMillilitres',
        'Conversion factor must be greater than zero',
      );
    }

    if (
      this.occurredAt.getTime() >
      this.recordedAt.getTime()
    ) {
      this.invalidate(
        'occurredAt',
        'Occurrence time cannot be after recorded time',
      );
    }
  },
);

intakeOutputEntrySchema.index(
  {
    facilityId: 1,
    entryNumber: 1,
  },
  {
    unique: true,
  },
);

intakeOutputEntrySchema.index(
  {
    facilityId: 1,
    idempotencyKey: 1,
  },
  {
    unique: true,
  },
);

intakeOutputEntrySchema.index({
  facilityId: 1,
  admissionId: 1,
  occurredAt: 1,
  status: 1,
});

intakeOutputEntrySchema.index({
  facilityId: 1,
  wardId: 1,
  shiftCode: 1,
  occurredAt: 1,
});

intakeOutputEntrySchema.index({
  facilityId: 1,
  rootEntryId: 1,
  revisionNumber: -1,
});

const woundDetailsSchema = new Schema(
  {
    classification: {
      type: String,
      required: true,
      enum: woundClassificationValues,
      default: 'NOT_APPLICABLE',
    },
    anatomicalLocation: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
    stageOrGrade: {
      type: String,
      default: null,
      trim: true,
      maxlength: 100,
    },
    lengthCm: {
      type: Schema.Types.Decimal128,
      default: null,
    },
    widthCm: {
      type: Schema.Types.Decimal128,
      default: null,
    },
    depthCm: {
      type: Schema.Types.Decimal128,
      default: null,
    },
    dressingType: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

export const nursingDeviceSchema = new Schema(
  {
    ...nursingClinicalContextFields,
    ...operationalFields,

    deviceNumber: {
      type: String,
      required: true,
      immutable: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 120,
    },
    deviceType: {
      type: String,
      required: true,
      enum: nursingDeviceTypeValues,
      immutable: true,
    },
    deviceName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 300,
    },
    anatomicalSite: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 500,
    },
    laterality: {
      type: String,
      default: null,
      uppercase: true,
      trim: true,
      maxlength: 50,
    },
    woundDetails: {
      type: woundDetailsSchema,
      default: null,
    },
    insertedAt: {
      type: Date,
      default: null,
      immutable: true,
    },
    insertedByStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    status: {
      type: String,
      required: true,
      enum: nursingDeviceStatusValues,
      default: 'ACTIVE',
    },
    removedAt: {
      type: Date,
      default: null,
    },
    removedByStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    removalReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
      select: false,
    },
  },
  {
    collection: 'nursingDevices',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

nursingDeviceSchema.pre(
  'validate',
  function validateNursingDevice() {
    if (
      this.deviceType === 'WOUND' &&
      this.woundDetails == null
    ) {
      this.invalidate(
        'woundDetails',
        'Wound records require structured wound details',
      );
    }

    if (
      this.deviceType !== 'WOUND' &&
      this.woundDetails != null
    ) {
      this.invalidate(
        'woundDetails',
        'Wound details are only valid for wound records',
      );
    }

    if (
      this.status === 'REMOVED' &&
      (
        this.removedAt == null ||
        this.removedByStaffId == null
      )
    ) {
      this.invalidate(
        'removedAt',
        'Removed devices require removal attribution',
      );
    }
  },
);

nursingDeviceSchema.index(
  {
    facilityId: 1,
    deviceNumber: 1,
  },
  {
    unique: true,
  },
);

nursingDeviceSchema.index(
  {
    facilityId: 1,
    idempotencyKey: 1,
  },
  {
    unique: true,
  },
);

nursingDeviceSchema.index({
  facilityId: 1,
  admissionId: 1,
  status: 1,
  deviceType: 1,
});

nursingDeviceSchema.index({
  facilityId: 1,
  wardId: 1,
  status: 1,
  deviceType: 1,
});

export const nursingDeviceObservationSchema =
  new Schema(
    {
      ...nursingClinicalContextFields,
      ...immutableVersionFields,

      nursingDeviceId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },
      observationNumber: {
        type: String,
        required: true,
        immutable: true,
        uppercase: true,
        trim: true,
        minlength: 3,
        maxlength: 120,
      },
      observationType: {
        type: String,
        required: true,
        enum: nursingDeviceObservationTypeValues,
        immutable: true,
      },
      observedAt: {
        type: Date,
        required: true,
        immutable: true,
      },
      recordedAt: {
        type: Date,
        required: true,
        immutable: true,
      },
      observedByUserId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },
      observedByStaffId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },
      siteCondition: {
        type: String,
        default: null,
        trim: true,
        maxlength: 5_000,
        immutable: true,
        select: false,
      },
      dressingType: {
        type: String,
        default: null,
        trim: true,
        maxlength: 500,
        immutable: true,
      },
      outputMillilitres: {
        type: Schema.Types.Decimal128,
        default: null,
        immutable: true,
      },
      infectionIndicators: {
        type: [String],
        required: true,
        default: [],
        immutable: true,
      },
      findings: {
        type: Schema.Types.Mixed,
        required: true,
        default: {},
        immutable: true,
      },
      narrative: {
        type: String,
        default: null,
        trim: true,
        maxlength: 10_000,
        immutable: true,
        select: false,
      },
      requiresEscalation: {
        type: Boolean,
        required: true,
        default: false,
        immutable: true,
      },
      escalationReason: {
        type: String,
        default: null,
        trim: true,
        maxlength: 2_000,
        immutable: true,
        select: false,
      },
    },
    {
      collection: 'nursingDeviceObservations',
      strict: true,
      timestamps: {
        createdAt: true,
        updatedAt: false,
      },
      versionKey: false,
    },
  );

nursingDeviceObservationSchema.pre(
  'validate',
  function validateDeviceObservation() {
    if (
      this.observedAt.getTime() >
      this.recordedAt.getTime()
    ) {
      this.invalidate(
        'observedAt',
        'Observation time cannot be after recorded time',
      );
    }

    if (
      this.requiresEscalation &&
      this.escalationReason == null
    ) {
      this.invalidate(
        'escalationReason',
        'Escalated device observations require a reason',
      );
    }
  },
);

nursingDeviceObservationSchema.index(
  {
    facilityId: 1,
    observationNumber: 1,
  },
  {
    unique: true,
  },
);

nursingDeviceObservationSchema.index({
  facilityId: 1,
  nursingDeviceId: 1,
  observedAt: -1,
});

nursingDeviceObservationSchema.index({
  facilityId: 1,
  admissionId: 1,
  observedAt: -1,
});

export type NursingAssessmentDocument =
  InferSchemaType<
    typeof nursingAssessmentSchema
  >;

export type NursingAssessmentVersionDocument =
  InferSchemaType<
    typeof nursingAssessmentVersionSchema
  >;

export type NursingCarePlanDocument =
  InferSchemaType<
    typeof nursingCarePlanSchema
  >;

export type NursingCarePlanVersionDocument =
  InferSchemaType<
    typeof nursingCarePlanVersionSchema
  >;

export type NursingTaskDocument =
  InferSchemaType<
    typeof nursingTaskSchema
  >;

export type IntakeOutputEntryDocument =
  InferSchemaType<
    typeof intakeOutputEntrySchema
  >;

export type NursingDeviceDocument =
  InferSchemaType<
    typeof nursingDeviceSchema
  >;

export type NursingDeviceObservationDocument =
  InferSchemaType<
    typeof nursingDeviceObservationSchema
  >;

export const NursingAssessmentModel =
  (
    mongoose.models['NursingAssessment'] ??
    mongoose.model(
      'NursingAssessment',
      nursingAssessmentSchema,
      'nursingAssessments',
    )
  ) as Model<NursingAssessmentDocument>;

export const NursingAssessmentVersionModel =
  (
    mongoose.models[
      'NursingAssessmentVersion'
    ] ??
    mongoose.model(
      'NursingAssessmentVersion',
      nursingAssessmentVersionSchema,
      'nursingAssessmentVersions',
    )
  ) as Model<NursingAssessmentVersionDocument>;

export const NursingCarePlanModel =
  (
    mongoose.models['NursingCarePlan'] ??
    mongoose.model(
      'NursingCarePlan',
      nursingCarePlanSchema,
      'nursingCarePlans',
    )
  ) as Model<NursingCarePlanDocument>;

export const NursingCarePlanVersionModel =
  (
    mongoose.models[
      'NursingCarePlanVersion'
    ] ??
    mongoose.model(
      'NursingCarePlanVersion',
      nursingCarePlanVersionSchema,
      'nursingCarePlanVersions',
    )
  ) as Model<NursingCarePlanVersionDocument>;

export const NursingTaskModel =
  (
    mongoose.models['NursingTask'] ??
    mongoose.model(
      'NursingTask',
      nursingTaskSchema,
      'nursingTasks',
    )
  ) as Model<NursingTaskDocument>;

export const IntakeOutputEntryModel =
  (
    mongoose.models[
      'IntakeOutputEntry'
    ] ??
    mongoose.model(
      'IntakeOutputEntry',
      intakeOutputEntrySchema,
      'intakeOutputEntries',
    )
  ) as Model<IntakeOutputEntryDocument>;

export const NursingDeviceModel =
  (
    mongoose.models['NursingDevice'] ??
    mongoose.model(
      'NursingDevice',
      nursingDeviceSchema,
      'nursingDevices',
    )
  ) as Model<NursingDeviceDocument>;

export const NursingDeviceObservationModel =
  (
    mongoose.models[
      'NursingDeviceObservation'
    ] ??
    mongoose.model(
      'NursingDeviceObservation',
      nursingDeviceObservationSchema,
      'nursingDeviceObservations',
    )
  ) as Model<NursingDeviceObservationDocument>;