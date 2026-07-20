import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

export const dischargeStatusValues = [
  'INITIATED',
  'CLINICALLY_CLEARED',
  'FINANCIAL_CLEARANCE_PENDING',
  'FINANCIALLY_CLEARED',
  'COMPLETED',
  'CANCELLED',
] as const;

export const dischargeDispositionValues = [
  'HOME',
  'TRANSFERRED_TO_FACILITY',
  'LEFT_AGAINST_MEDICAL_ADVICE',
  'ABSCONDED',
  'EXPIRED',
  'OTHER',
] as const;

export const dischargeSummaryStatusValues = [
  'DRAFT',
  'FINAL',
  'AMENDED',
  'ENTERED_IN_ERROR',
] as const;

export const dischargeChecklistItemStatusValues = [
  'PENDING',
  'COMPLETED',
  'NOT_APPLICABLE',
  'BLOCKED',
] as const;

export type DischargeStatus =
  (typeof dischargeStatusValues)[number];

export type DischargeDisposition =
  (typeof dischargeDispositionValues)[number];

export type DischargeSummaryStatus =
  (typeof dischargeSummaryStatusValues)[number];

export type DischargeChecklistItemStatus =
  (typeof dischargeChecklistItemStatusValues)[number];

const diagnosisSnapshotSchema =
  new Schema(
    {
      diagnosisId: {
        type:
          Schema.Types.ObjectId,

        default:
          null,

        immutable:
          true,
      },

      diagnosisCode: {
        type:
          String,

        required:
          true,

        immutable:
          true,

        uppercase:
          true,

        trim:
          true,

        maxlength:
          100,
      },

      diagnosisSystem: {
        type:
          String,

        required:
          true,

        immutable:
          true,

        uppercase:
          true,

        trim:
          true,

        maxlength:
          100,
      },

      diagnosisDisplay: {
        type:
          String,

        required:
          true,

        immutable:
          true,

        trim:
          true,

        maxlength:
          1_000,
      },

      primary: {
        type:
          Boolean,

        required:
          true,

        immutable:
          true,

        default:
          false,
      },
    },

    {
      _id:
        false,

      strict:
        true,
    },
  );

const medicationReconciliationItemSchema =
  new Schema(
    {
      medicineId: {
        type:
          Schema.Types.ObjectId,

        default:
          null,
      },

      medicineDisplay: {
        type:
          String,

        required:
          true,

        trim:
          true,

        maxlength:
          500,
      },

      action: {
        type:
          String,

        required:
          true,

        enum: [
          'CONTINUE',
          'STOP',
          'CHANGE',
          'NEW',
        ],
      },

      dose: {
        type:
          Schema.Types.Decimal128,

        default:
          null,
      },

      doseUnitCode: {
        type:
          String,

        default:
          null,

        uppercase:
          true,

        trim:
          true,

        maxlength:
          80,
      },

      routeCode: {
        type:
          String,

        default:
          null,

        uppercase:
          true,

        trim:
          true,

        maxlength:
          80,
      },

      frequencyCode: {
        type:
          String,

        default:
          null,

        uppercase:
          true,

        trim:
          true,

        maxlength:
          80,
      },

      durationText: {
        type:
          String,

        default:
          null,

        trim:
          true,

        maxlength:
          500,
      },

      instructions: {
        type:
          String,

        default:
          null,

        trim:
          true,

        maxlength:
          2_000,

        select:
          false,
      },
    },

    {
      _id:
        false,

      strict:
        true,
    },
  );

const followUpInstructionSchema =
  new Schema(
    {
      departmentId: {
        type:
          Schema.Types.ObjectId,

        default:
          null,
      },

      providerStaffId: {
        type:
          Schema.Types.ObjectId,

        default:
          null,
      },

      clinicName: {
        type:
          String,

        default:
          null,

        trim:
          true,

        maxlength:
          500,
      },

      followUpAt: {
        type:
          Date,

        default:
          null,
      },

      instruction: {
        type:
          String,

        required:
          true,

        trim:
          true,

        maxlength:
          2_000,

        select:
          false,
      },
    },

    {
      _id:
        false,

      strict:
        true,
    },
  );

const checklistItemSchema =
  new Schema(
    {
      code: {
        type:
          String,

        required:
          true,

        uppercase:
          true,

        trim:
          true,

        maxlength:
          100,
      },

      label: {
        type:
          String,

        required:
          true,

        trim:
          true,

        maxlength:
          500,
      },

      status: {
        type:
          String,

        required:
          true,

        enum:
          dischargeChecklistItemStatusValues,

        default:
          'PENDING',
      },

      completedAt: {
        type:
          Date,

        default:
          null,
      },

      completedByUserId: {
        type:
          Schema.Types.ObjectId,

        default:
          null,
      },

      completedByStaffId: {
        type:
          Schema.Types.ObjectId,

        default:
          null,
      },

      note: {
        type:
          String,

        default:
          null,

        trim:
          true,

        maxlength:
          2_000,

        select:
          false,
      },
    },

    {
      _id:
        false,

      strict:
        true,
    },
  );

export const dischargeSchema =
  new Schema(
    {
      facilityId: {
        type:
          Schema.Types.ObjectId,

        required:
          true,

        immutable:
          true,
      },

      dischargeNumber: {
        type:
          String,

        required:
          true,

        immutable:
          true,

        uppercase:
          true,

        trim:
          true,

        minlength:
          3,

        maxlength:
          120,
      },

      admissionId: {
        type:
          Schema.Types.ObjectId,

        required:
          true,

        immutable:
          true,
      },

      admissionNumberSnapshot: {
        type:
          String,

        required:
          true,

        immutable:
          true,

        uppercase:
          true,

        trim:
          true,

        maxlength:
          120,
      },

      patientId: {
        type:
          Schema.Types.ObjectId,

        required:
          true,

        immutable:
          true,

        select:
          false,
      },

      encounterId: {
        type:
          Schema.Types.ObjectId,

        required:
          true,

        immutable:
          true,
      },

      attendingConsultantUserId: {
        type:
          Schema.Types.ObjectId,

        required:
          true,

        immutable:
          true,
      },

      attendingConsultantStaffId: {
        type:
          Schema.Types.ObjectId,

        required:
          true,

        immutable:
          true,
      },

      initiatingDepartmentId: {
        type:
          Schema.Types.ObjectId,

        required:
          true,

        immutable:
          true,
      },

      status: {
        type:
          String,

        required:
          true,

        enum:
          dischargeStatusValues,

        default:
          'INITIATED',
      },

      disposition: {
        type:
          String,

        default:
          null,

        enum: [
          ...dischargeDispositionValues,
          null,
        ],
      },

      initiatedAt: {
        type:
          Date,

        required:
          true,

        immutable:
          true,
      },

      initiatedByUserId: {
        type:
          Schema.Types.ObjectId,

        required:
          true,

        immutable:
          true,
      },

      initiatedByStaffId: {
        type:
          Schema.Types.ObjectId,

        required:
          true,

        immutable:
          true,
      },

      clinicalClearanceAt: {
        type:
          Date,

        default:
          null,
      },

      clinicalClearanceByUserId: {
        type:
          Schema.Types.ObjectId,

        default:
          null,
      },

      clinicalClearanceByStaffId: {
        type:
          Schema.Types.ObjectId,

        default:
          null,
      },

      financialClearanceRequestedAt: {
        type:
          Date,

        default:
          null,
      },

      financialClearanceRequestId: {
        type:
          String,

        default:
          null,

        trim:
          true,

        maxlength:
          200,
      },

      financialClearanceReference: {
        type:
          String,

        default:
          null,

        trim:
          true,

        maxlength:
          200,
      },

      financiallyClearedAt: {
        type:
          Date,

        default:
          null,
      },

      financiallyClearedByUserId: {
        type:
          Schema.Types.ObjectId,

        default:
          null,
      },

      completedAt: {
        type:
          Date,

        default:
          null,
      },

      completedByUserId: {
        type:
          Schema.Types.ObjectId,

        default:
          null,
      },

      completedByStaffId: {
        type:
          Schema.Types.ObjectId,

        default:
          null,
      },

      cancelledAt: {
        type:
          Date,

        default:
          null,
      },

      cancelledByUserId: {
        type:
          Schema.Types.ObjectId,

        default:
          null,
      },

      cancelledByStaffId: {
        type:
          Schema.Types.ObjectId,

        default:
          null,
      },

      cancellationReason: {
        type:
          String,

        default:
          null,

        trim:
          true,

        minlength:
          5,

        maxlength:
          2_000,

        select:
          false,
      },

      checklist: {
        type: [
          checklistItemSchema,
        ],

        required:
          true,

        default: [],
      },

      medicationReconciliationCompleted: {
        type:
          Boolean,

        required:
          true,

        default:
          false,
      },

      medicationReconciliationItems: {
        type: [
          medicationReconciliationItemSchema,
        ],

        required:
          true,

        default: [],
      },

      dischargeSummaryId: {
        type:
          Schema.Types.ObjectId,

        default:
          null,
      },

      latestDischargeSummaryVersionId: {
        type:
          Schema.Types.ObjectId,

        default:
          null,
      },

      currentSummaryVersion: {
        type:
          Number,

        required:
          true,

        default:
          0,

        min:
          0,
      },

      billingAccountReference: {
        type:
          String,

        default:
          null,

        trim:
          true,

        maxlength:
          200,
      },

      transactionId: {
        type:
          String,

        required:
          true,

        immutable:
          true,

        trim:
          true,

        maxlength:
          200,
      },

      correlationId: {
        type:
          String,

        required:
          true,

        immutable:
          true,

        trim:
          true,

        maxlength:
          200,
      },

      schemaVersion: {
        type:
          Number,

        required:
          true,

        immutable:
          true,

        default:
          1,

        min:
          1,
      },

      version: {
        type:
          Number,

        required:
          true,

        default:
          0,

        min:
          0,
      },

      createdBy: {
        type:
          Schema.Types.ObjectId,

        required:
          true,

        immutable:
          true,
      },

      updatedBy: {
        type:
          Schema.Types.ObjectId,

        required:
          true,
      },
    },

    {
      collection:
        'discharges',

      strict:
        true,

      timestamps:
        true,

      versionKey:
        false,
    },
  );

dischargeSchema.pre(
  'validate',
  function validateDischarge() {
    if (
      [
        'CLINICALLY_CLEARED',
        'FINANCIAL_CLEARANCE_PENDING',
        'FINANCIALLY_CLEARED',
        'COMPLETED',
      ].includes(
        this.status,
      ) &&
      (
        this.clinicalClearanceAt ==
          null ||
        this.clinicalClearanceByUserId ==
          null ||
        this.clinicalClearanceByStaffId ==
          null
      )
    ) {
      this.invalidate(
        'clinicalClearanceAt',
        'Clinical clearance requires complete clinician attribution',
      );
    }

    if (
      [
        'FINANCIALLY_CLEARED',
        'COMPLETED',
      ].includes(
        this.status,
      ) &&
      (
        this.financiallyClearedAt ==
          null ||
        this.financialClearanceReference ==
          null
      )
    ) {
      this.invalidate(
        'financiallyClearedAt',
        'Financial clearance requires a clearance timestamp and reference',
      );
    }

    if (
      this.status ===
        'COMPLETED' &&
      (
        this.completedAt ==
          null ||
        this.completedByUserId ==
          null ||
        this.completedByStaffId ==
          null ||
        this.disposition ==
          null
      )
    ) {
      this.invalidate(
        'completedAt',
        'Completed discharge requires disposition and completion attribution',
      );
    }

    if (
      this.status ===
        'CANCELLED' &&
      (
        this.cancelledAt ==
          null ||
        this.cancelledByUserId ==
          null ||
        this.cancelledByStaffId ==
          null ||
        this.cancellationReason ==
          null
      )
    ) {
      this.invalidate(
        'cancelledAt',
        'Cancelled discharge requires complete cancellation attribution',
      );
    }
  },
);

dischargeSchema.index(
  {
    facilityId:
      1,

    dischargeNumber:
      1,
  },

  {
    unique:
      true,

    name:
      'uq_discharges_facility_number',
  },
);

dischargeSchema.index(
  {
    facilityId:
      1,

    admissionId:
      1,
  },

  {
    unique:
      true,

    partialFilterExpression: {
      status: {
        $in: [
          'INITIATED',
          'CLINICALLY_CLEARED',
          'FINANCIAL_CLEARANCE_PENDING',
          'FINANCIALLY_CLEARED',
          'COMPLETED',
        ],
      },
    },

    name:
      'uq_active_discharge_per_admission',
  },
);

dischargeSchema.index(
  {
    facilityId:
      1,

    status:
      1,

    initiatedAt:
      -1,
  },

  {
    name:
      'ix_discharges_worklist',
  },
);

dischargeSchema.index(
  {
    facilityId:
      1,

    patientId:
      1,

    initiatedAt:
      -1,
  },

  {
    name:
      'ix_discharges_patient_history',
  },
);

export const dischargeSummarySchema =
  new Schema(
    {
      facilityId: {
        type:
          Schema.Types.ObjectId,

        required:
          true,

        immutable:
          true,
      },

      dischargeId: {
        type:
          Schema.Types.ObjectId,

        required:
          true,

        immutable:
          true,
      },

      admissionId: {
        type:
          Schema.Types.ObjectId,

        required:
          true,

        immutable:
          true,
      },

      patientId: {
        type:
          Schema.Types.ObjectId,

        required:
          true,

        immutable:
          true,

        select:
          false,
      },

      encounterId: {
        type:
          Schema.Types.ObjectId,

        required:
          true,

        immutable:
          true,
      },

      summaryNumber: {
        type:
          String,

        required:
          true,

        immutable:
          true,

        uppercase:
          true,

        trim:
          true,

        maxlength:
          120,
      },

      versionNumber: {
        type:
          Number,

        required:
          true,

        immutable:
          true,

        min:
          1,
      },

      previousVersionId: {
        type:
          Schema.Types.ObjectId,

        default:
          null,

        immutable:
          true,
      },

      status: {
        type:
          String,

        required:
          true,

        immutable:
          true,

        enum:
          dischargeSummaryStatusValues,
      },

      admissionReason: {
        type:
          String,

        required:
          true,

        immutable:
          true,

        trim:
          true,

        maxlength:
          10_000,

        select:
          false,
      },

      hospitalCourse: {
        type:
          String,

        required:
          true,

        immutable:
          true,

        trim:
          true,

        maxlength:
          50_000,

        select:
          false,
      },

      proceduresPerformed: {
        type: [
          String,
        ],

        required:
          true,

        immutable:
          true,

        default: [],

        select:
          false,
      },

      significantInvestigations: {
        type: [
          String,
        ],

        required:
          true,

        immutable:
          true,

        default: [],

        select:
          false,
      },

      diagnosisSnapshots: {
        type: [
          diagnosisSnapshotSchema,
        ],

        required:
          true,

        immutable:
          true,

        default: [],
      },

      conditionAtDischarge: {
        type:
          String,

        required:
          true,

        immutable:
          true,

        trim:
          true,

        maxlength:
          10_000,

        select:
          false,
      },

      medicationReconciliationItems: {
        type: [
          medicationReconciliationItemSchema,
        ],

        required:
          true,

        immutable:
          true,

        default: [],
      },

      followUpInstructions: {
        type: [
          followUpInstructionSchema,
        ],

        required:
          true,

        immutable:
          true,

        default: [],
      },

      warningSigns: {
        type: [
          String,
        ],

        required:
          true,

        immutable:
          true,

        default: [],

        select:
          false,
      },

      patientInstructions: {
        type:
          String,

        required:
          true,

        immutable:
          true,

        trim:
          true,

        maxlength:
          20_000,

        select:
          false,
      },

      preparedAt: {
        type:
          Date,

        required:
          true,

        immutable:
          true,
      },

      preparedByUserId: {
        type:
          Schema.Types.ObjectId,

        required:
          true,

        immutable:
          true,
      },

      preparedByStaffId: {
        type:
          Schema.Types.ObjectId,

        required:
          true,

        immutable:
          true,
      },

      finalizedAt: {
        type:
          Date,

        default:
          null,

        immutable:
          true,
      },

      finalizedByUserId: {
        type:
          Schema.Types.ObjectId,

        default:
          null,

        immutable:
          true,
      },

      finalizedByStaffId: {
        type:
          Schema.Types.ObjectId,

        default:
          null,

        immutable:
          true,
      },

      amendmentReason: {
        type:
          String,

        default:
          null,

        immutable:
          true,

        trim:
          true,

        maxlength:
          2_000,

        select:
          false,
      },

      snapshotHash: {
        type:
          String,

        required:
          true,

        immutable:
          true,

        minlength:
          64,

        maxlength:
          128,
      },

      transactionId: {
        type:
          String,

        required:
          true,

        immutable:
          true,

        trim:
          true,

        maxlength:
          200,
      },

      correlationId: {
        type:
          String,

        required:
          true,

        immutable:
          true,

        trim:
          true,

        maxlength:
          200,
      },

      schemaVersion: {
        type:
          Number,

        required:
          true,

        immutable:
          true,

        default:
          1,

        min:
          1,
      },

      version: {
        type:
          Number,

        required:
          true,

        immutable:
          true,

        default:
          0,
      },

      createdBy: {
        type:
          Schema.Types.ObjectId,

        required:
          true,

        immutable:
          true,
      },

      updatedBy: {
        type:
          Schema.Types.ObjectId,

        required:
          true,

        immutable:
          true,
      },
    },

    {
      collection:
        'dischargeSummaries',

      strict:
        true,

      timestamps:
        true,

      versionKey:
        false,
    },
  );

dischargeSummarySchema.pre(
  'validate',
  function validateSummary() {
    if (
      this.status ===
        'FINAL' &&
      (
        this.finalizedAt ==
          null ||
        this.finalizedByUserId ==
          null ||
        this.finalizedByStaffId ==
          null
      )
    ) {
      this.invalidate(
        'finalizedAt',
        'Final discharge summaries require finalization attribution',
      );
    }

    if (
      this.status ===
        'AMENDED' &&
      (
        this.previousVersionId ==
          null ||
        this.amendmentReason ==
          null
      )
    ) {
      this.invalidate(
        'previousVersionId',
        'Amended discharge summaries require a previous version and amendment reason',
      );
    }
  },
);

dischargeSummarySchema.index(
  {
    facilityId:
      1,

    summaryNumber:
      1,
  },

  {
    unique:
      true,

    name:
      'uq_discharge_summaries_facility_number',
  },
);

dischargeSummarySchema.index(
  {
    facilityId:
      1,

    dischargeId:
      1,

    versionNumber:
      1,
  },

  {
    unique:
      true,

    name:
      'uq_discharge_summary_versions',
  },
);

dischargeSummarySchema.index(
  {
    facilityId:
      1,

    admissionId:
      1,

    preparedAt:
      -1,
  },

  {
    name:
      'ix_discharge_summaries_admission',
  },
);

export type DischargeDocument =
  InferSchemaType<
    typeof dischargeSchema
  >;

export type DischargeSummaryDocument =
  InferSchemaType<
    typeof dischargeSummarySchema
  >;

export const DischargeModel =
  (
    mongoose.models.Discharge as
      | Model<DischargeDocument>
      | undefined
  ) ??
  mongoose.model<DischargeDocument>(
    'Discharge',
    dischargeSchema,
  );

export const DischargeSummaryModel =
  (
    mongoose.models.DischargeSummary as
      | Model<DischargeSummaryDocument>
      | undefined
  ) ??
  mongoose.model<DischargeSummaryDocument>(
    'DischargeSummary',
    dischargeSummarySchema,
  );