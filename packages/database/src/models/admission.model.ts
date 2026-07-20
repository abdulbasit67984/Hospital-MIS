import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  activeAdmissionStatusValues,
  admissionHistoryChangeTypeValues,
  admissionPriorityValues,
  admissionStatusValues,
  admissionTypeValues,
} from './inpatient.types.js';

import {
  inpatientCommonFields,
  normalizeCode,
} from './inpatient-schema-helpers.js';

const diagnosisSnapshotSchema =
  new Schema(
    {
      diagnosisId: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      diagnosisCode: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        maxlength: 100,
      },

      diagnosisSystem: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        maxlength: 80,
      },

      diagnosisDisplay: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        maxlength: 1_000,
      },

      primary: {
        type: Boolean,
        required: true,
        immutable: true,
        default: false,
      },
    },
    {
      _id: false,
      strict: true,
    },
  );

diagnosisSnapshotSchema.pre(
  'validate',
  function validateDiagnosisSnapshot() {
    this.diagnosisCode =
      normalizeCode(
        this.diagnosisCode,
      );

    this.diagnosisSystem =
      normalizeCode(
        this.diagnosisSystem,
      );
  },
);

const contactSnapshotSchema =
  new Schema(
    {
      sourceId: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      relationshipCode: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        maxlength: 80,
      },

      displayName: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        maxlength: 300,
      },

      primaryPhoneMasked: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        maxlength: 100,
      },

      alternatePhoneMasked: {
        type: String,
        default: null,
        immutable: true,
        trim: true,
        maxlength: 100,
      },
    },
    {
      _id: false,
      strict: true,
    },
  );

contactSnapshotSchema.pre(
  'validate',
  function validateContactSnapshot() {
    this.relationshipCode =
      normalizeCode(
        this.relationshipCode,
      );
  },
);

const careTeamMemberSchema =
  new Schema(
    {
      userId: {
        type: Schema.Types.ObjectId,
        required: true,
      },

      staffId: {
        type: Schema.Types.ObjectId,
        required: true,
      },

      roleCode: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        maxlength: 80,
      },

      isPrimary: {
        type: Boolean,
        required: true,
        default: false,
      },

      assignedAt: {
        type: Date,
        required: true,
      },

      assignedBy: {
        type: Schema.Types.ObjectId,
        required: true,
      },

      endedAt: {
        type: Date,
        default: null,
      },

      endedBy: {
        type: Schema.Types.ObjectId,
        default: null,
      },
    },
    {
      _id: false,
      strict: true,
    },
  );

careTeamMemberSchema.pre(
  'validate',
  function validateCareTeamMember() {
    this.roleCode = normalizeCode(
      this.roleCode,
    );

    if (
      this.endedAt != null &&
      this.endedAt < this.assignedAt
    ) {
      this.invalidate(
        'endedAt',
        'Care-team end time cannot precede assignment time',
      );
    }

    if (
      (this.endedAt == null) !==
      (this.endedBy == null)
    ) {
      this.invalidate(
        'endedAt',
        'Care-team end time and ending actor must be recorded together',
      );
    }
  },
);

export const admissionSchema =
  new Schema(
    {
      ...inpatientCommonFields,

      admissionNumber: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        minlength: 3,
        maxlength: 120,
      },

      admissionRecommendationId: {
        type: Schema.Types.ObjectId,
        default: null,
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

      encounterId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
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

      admittingDepartmentId: {
        type: Schema.Types.ObjectId,
        required: true,
      },

      admittingServicePointId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      admissionType: {
        type: String,
        required: true,
        enum: admissionTypeValues,
      },

      priority: {
        type: String,
        required: true,
        enum: admissionPriorityValues,
        default: 'ROUTINE',
      },

      status: {
        type: String,
        required: true,
        enum: admissionStatusValues,
        default: 'PENDING_ACCEPTANCE',
      },

      isActive: {
        type: Boolean,
        required: true,
        default: true,
      },

      requestedAt: {
        type: Date,
        required: true,
        immutable: true,
      },

      acceptedAt: {
        type: Date,
        default: null,
      },

      acceptedBy: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      acceptedByStaffId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      admittedAt: {
        type: Date,
        default: null,
      },

      admittedBy: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      admittedByStaffId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      clinicallyDischargedAt: {
        type: Date,
        default: null,
      },

      financiallyClearedAt: {
        type: Date,
        default: null,
      },

      dischargedAt: {
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

      cancelledByStaffId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      cancellationReason: {
        type: String,
        default: null,
        trim: true,
        minlength: 5,
        maxlength: 5_000,
        select: false,
      },

      attendingConsultantUserId: {
        type: Schema.Types.ObjectId,
        required: true,
      },

      attendingConsultantStaffId: {
        type: Schema.Types.ObjectId,
        required: true,
      },

      careTeam: {
        type: [careTeamMemberSchema],
        required: true,
        default: [],
      },

      clinicalIndicationSnapshot: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 3,
        maxlength: 50_000,
        select: false,
      },

      diagnosisSnapshots: {
        type: [diagnosisSnapshotSchema],
        required: true,
        default: [],
        select: false,
      },

      guardianSnapshot: {
        type: contactSnapshotSchema,
        default: null,
        immutable: true,
        select: false,
      },

      emergencyContactSnapshot: {
        type: contactSnapshotSchema,
        default: null,
        immutable: true,
        select: false,
      },

      payerOrganizationId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      panelProgramId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      panelPlanId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      patientCoverageId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      preauthorizationId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      treatmentPackageId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      depositRequirementReference: {
        type: String,
        default: null,
        trim: true,
        maxlength: 200,
      },

      authorizationRequirementReference: {
        type: String,
        default: null,
        trim: true,
        maxlength: 200,
      },

      billingAccountReference: {
        type: String,
        default: null,
        trim: true,
        maxlength: 200,
      },

      currentWardId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      currentRoomId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      currentBedId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      currentBedAssignmentId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      currentBedAssignedAt: {
        type: Date,
        default: null,
      },

      currentStatusSequence: {
        type: Number,
        required: true,
        default: 1,
        min: 1,
      },

      latestStatusHistoryId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      dischargeId: {
        type: Schema.Types.ObjectId,
        default: null,
      },
    },
    {
      collection: 'admissions',
      strict: true,
      timestamps: true,
      versionKey: false,
    },
  );

admissionSchema.pre(
  'validate',
  function validateAdmission() {
    this.admissionNumber =
      normalizeCode(
        this.admissionNumber,
      );

    const activeStatus = (
      activeAdmissionStatusValues as readonly string[]
    ).includes(this.status);

    if (
      this.isActive !== activeStatus
    ) {
      this.invalidate(
        'isActive',
        'Admission activity projection must match admission status',
      );
    }

    const primaryDiagnosisCount =
      this.diagnosisSnapshots.filter(
        (diagnosis) =>
          diagnosis.primary,
      ).length;

    if (
      primaryDiagnosisCount > 1
    ) {
      this.invalidate(
        'diagnosisSnapshots',
        'Admissions may contain only one primary diagnosis snapshot',
      );
    }

    const activeCareTeamKeys =
      new Set<string>();

    let primaryAttendingCount = 0;

    for (
      const member of this.careTeam
    ) {
      if (member.endedAt != null) {
        continue;
      }

      const key =
        `${member.staffId.toHexString()}:${member.roleCode}`;

      if (
        activeCareTeamKeys.has(key)
      ) {
        this.invalidate(
          'careTeam',
          'Active care-team membership cannot contain duplicate staff-role assignments',
        );
      }

      activeCareTeamKeys.add(key);

      if (
        member.isPrimary &&
        member.roleCode ===
          'ATTENDING_CONSULTANT'
      ) {
        primaryAttendingCount += 1;
      }
    }

    if (
      primaryAttendingCount > 1
    ) {
      this.invalidate(
        'careTeam',
        'Admissions may have only one active primary attending consultant',
      );
    }

    const bedProjectionValues = [
      this.currentWardId,
      this.currentRoomId,
      this.currentBedId,
      this.currentBedAssignmentId,
      this.currentBedAssignedAt,
    ];

    const hasAnyBedProjection =
      bedProjectionValues.some(
        (value) => value != null,
      );

    const hasCompleteBedProjection =
      bedProjectionValues.every(
        (value) => value != null,
      );

    if (
      hasAnyBedProjection &&
      !hasCompleteBedProjection
    ) {
      this.invalidate(
        'currentBedId',
        'Current bed projection must include ward, room, bed, assignment, and assignment time together',
      );
    }

    if (
      [
        'ADMITTED',
        'TRANSFER_PENDING',
        'DISCHARGE_INITIATED',
      ].includes(this.status) &&
      !hasCompleteBedProjection
    ) {
      this.invalidate(
        'currentBedId',
        'Admitted inpatient statuses require a complete current bed projection',
      );
    }

    if (
      this.status === 'ACCEPTED' &&
      (
        this.acceptedAt == null ||
        this.acceptedBy == null ||
        this.acceptedByStaffId == null
      )
    ) {
      this.invalidate(
        'status',
        'Accepted admissions require acceptance attribution',
      );
    }

    if (
      [
        'ADMITTED',
        'TRANSFER_PENDING',
        'DISCHARGE_INITIATED',
        'CLINICALLY_DISCHARGED',
        'FINANCIAL_CLEARANCE_PENDING',
        'DISCHARGED',
      ].includes(this.status) &&
      (
        this.admittedAt == null ||
        this.admittedBy == null ||
        this.admittedByStaffId == null
      )
    ) {
      this.invalidate(
        'status',
        'Post-admission statuses require admission attribution',
      );
    }

    if (
      this.status === 'CANCELLED' &&
      (
        this.cancelledAt == null ||
        this.cancelledBy == null ||
        this.cancelledByStaffId == null ||
        this.cancellationReason == null
      )
    ) {
      this.invalidate(
        'status',
        'Cancelled admissions require cancellation attribution and reason',
      );
    }

    if (
      this.status === 'DISCHARGED' &&
      (
        this
          .clinicallyDischargedAt ==
          null ||
        this.financiallyClearedAt ==
          null ||
        this.dischargedAt == null ||
        this.dischargeId == null ||
        hasAnyBedProjection
      )
    ) {
      this.invalidate(
        'status',
        'Discharged admissions require clinical and financial completion, a discharge reference, and released bed projections',
      );
    }
  },
);

admissionSchema.index(
  {
    facilityId: 1,
    admissionNumber: 1,
  },
  {
    name:
      'uq_admissions_facility_number',
    unique: true,
  },
);

admissionSchema.index(
  {
    facilityId: 1,
    patientId: 1,
  },
  {
    name:
      'uq_admissions_active_patient',

    unique: true,

    partialFilterExpression: {
      isActive: true,
    },
  },
);

admissionSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    requestedAt: -1,
  },
  {
    name:
      'ix_admissions_patient_history',
  },
);

admissionSchema.index(
  {
    facilityId: 1,
    currentWardId: 1,
    status: 1,
    priority: 1,
    admittedAt: 1,
  },
  {
    name:
      'ix_admissions_ward_worklist',
  },
);

admissionSchema.index(
  {
    facilityId: 1,
    attendingConsultantStaffId: 1,
    status: 1,
    admittedAt: -1,
  },
  {
    name:
      'ix_admissions_consultant_worklist',
  },
);

admissionSchema.index(
  {
    facilityId: 1,
    encounterId: 1,
  },
  {
    name:
      'ix_admissions_encounter',
  },
);

export const admissionStatusHistorySchema =
  new Schema(
    {
      ...inpatientCommonFields,

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

      sequence: {
        type: Number,
        required: true,
        immutable: true,
        min: 1,
      },

      fromStatus: {
        type: String,
        default: null,
        immutable: true,
        enum: admissionStatusValues,
      },

      toStatus: {
        type: String,
        required: true,
        immutable: true,
        enum: admissionStatusValues,
      },

      changeType: {
        type: String,
        required: true,
        immutable: true,
        enum:
          admissionHistoryChangeTypeValues,
      },

      reasonCode: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        minlength: 2,
        maxlength: 100,
      },

      reason: {
        type: String,
        default: null,
        immutable: true,
        trim: true,
        maxlength: 5_000,
        select: false,
      },

      admissionBedAssignmentId: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      bedId: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      dischargeId: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      occurredAt: {
        type: Date,
        required: true,
        immutable: true,
      },

      performedBy: {
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
        'admissionStatusHistories',

      strict: true,
      timestamps: true,
      versionKey: false,
    },
  );

admissionStatusHistorySchema.pre(
  'validate',
  function validateAdmissionStatusHistory() {
    this.reasonCode = normalizeCode(
      this.reasonCode,
    );

    if (
      this.sequence === 1 &&
      this.fromStatus != null
    ) {
      this.invalidate(
        'fromStatus',
        'The first admission history entry cannot have a prior status',
      );
    }

    if (
      this.sequence > 1 &&
      this.fromStatus == null
    ) {
      this.invalidate(
        'fromStatus',
        'Subsequent admission history entries require a prior status',
      );
    }

    if (
      this.fromStatus ===
        this.toStatus &&
      ![
        'CORRECTED',
        'RECOVERY',
      ].includes(this.changeType)
    ) {
      this.invalidate(
        'toStatus',
        'Admission status may remain unchanged only for correction or recovery history',
      );
    }
  },
);

admissionStatusHistorySchema.index(
  {
    facilityId: 1,
    admissionId: 1,
    sequence: 1,
  },
  {
    name:
      'uq_admission_status_histories_sequence',

    unique: true,
  },
);

admissionStatusHistorySchema.index(
  {
    facilityId: 1,
    patientId: 1,
    occurredAt: -1,
  },
  {
    name:
      'ix_admission_status_histories_patient_time',
  },
);

admissionStatusHistorySchema.index(
  {
    facilityId: 1,
    toStatus: 1,
    occurredAt: -1,
  },
  {
    name:
      'ix_admission_status_histories_status_time',
  },
);

export type Admission =
  InferSchemaType<
    typeof admissionSchema
  >;

export type AdmissionStatusHistory =
  InferSchemaType<
    typeof admissionStatusHistorySchema
  >;

export const AdmissionModel =
  (
    mongoose.models[
      'admissions'
    ] as Model<Admission> | undefined
  ) ??
  mongoose.model<Admission>(
    'admissions',
    admissionSchema,
    'admissions',
  );

export const AdmissionStatusHistoryModel =
  (
    mongoose.models[
      'admissionStatusHistories'
    ] as
      | Model<AdmissionStatusHistory>
      | undefined
  ) ??
  mongoose.model<AdmissionStatusHistory>(
    'admissionStatusHistories',
    admissionStatusHistorySchema,
    'admissionStatusHistories',
  );