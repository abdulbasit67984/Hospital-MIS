import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

export const radiologyReportStatusValues = [
  'DRAFT',
  'PRELIMINARY',
  'FINAL',
  'CORRECTED',
  'ADDENDUM',
] as const;

export const radiologyReportUrgencyValues = [
  'ROUTINE',
  'URGENT',
  'CRITICAL',
] as const;

export const radiologyReportPublicationStatusValues = [
  'NOT_PUBLISHED',
  'PUBLISHED',
  'WITHDRAWN',
] as const;

export const radiologyReportVersionChangeTypeValues = [
  'INITIAL_FINALIZATION',
  'CORRECTION',
  'ADDENDUM',
  'RECOVERY',
] as const;

export const radiologyCriticalFindingCommunicationTypeValues = [
  'NOTIFICATION_ATTEMPT',
  'NOTIFIED',
  'ACKNOWLEDGED',
  'ESCALATED',
  'FAILED',
] as const;

export const radiologyCommunicationChannelValues = [
  'IN_PERSON',
  'PHONE',
  'SMS',
  'EMAIL',
  'SYSTEM',
  'OTHER',
] as const;

export const radiologyCommunicationRecipientTypeValues = [
  'ORDERING_PROVIDER',
  'ON_CALL_PROVIDER',
  'RADIOLOGIST',
  'NURSE',
  'PATIENT',
  'GUARDIAN',
  'OTHER',
] as const;

export type RadiologyReportStatus =
  (typeof radiologyReportStatusValues)[number];

export type RadiologyReportUrgency =
  (typeof radiologyReportUrgencyValues)[number];

export type RadiologyReportPublicationStatus =
  (typeof radiologyReportPublicationStatusValues)[number];

export type RadiologyReportVersionChangeType =
  (typeof radiologyReportVersionChangeTypeValues)[number];

export type RadiologyCriticalFindingCommunicationType =
  (typeof radiologyCriticalFindingCommunicationTypeValues)[number];

export type RadiologyCommunicationChannel =
  (typeof radiologyCommunicationChannelValues)[number];

export type RadiologyCommunicationRecipientType =
  (typeof radiologyCommunicationRecipientTypeValues)[number];

function normalizeCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replaceAll(/[^A-Z0-9.-]+/gu, '_');
}

const encryptedRadiologySnapshotSchema = new Schema(
  {
    algorithm: {
      type: String,
      required: true,
      immutable: true,
      enum: ['AES-256-GCM'],
    },
    keyVersion: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    initializationVector: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 16,
      maxlength: 256,
    },
    authenticationTag: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 16,
      maxlength: 256,
    },
    ciphertext: {
      type: String,
      required: true,
      immutable: true,
      minlength: 1,
      maxlength: 20_000_000,
      select: false,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

const criticalFindingSchema = new Schema(
  {
    findingCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 500,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 20_000,
      select: false,
    },
    urgency: {
      type: String,
      required: true,
      enum: ['URGENT', 'CRITICAL'],
    },
    recommendation: {
      type: String,
      default: null,
      trim: true,
      maxlength: 10_000,
      select: false,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

criticalFindingSchema.pre(
  'validate',
  function normalizeCriticalFinding() {
    this.findingCode = normalizeCode(this.findingCode);
  },
);

const commonFields = {
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

export const radiologyReportSchema = new Schema(
  {
    ...commonFields,
    reportNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 120,
    },
    radiologyOrderId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    radiologyOrderItemId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    imagingStudyId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    examinationId: {
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
    procedureId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    procedureCodeSnapshot: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    procedureNameSnapshot: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 500,
    },
    modalityCodeSnapshot: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 80,
    },
    accessionNumberSnapshot: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 120,
    },
    studyInstanceUidSnapshot: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 3,
      maxlength: 128,
      match: /^[0-9]+(?:\.[0-9]+)+$/u,
    },
    assignedRadiologistStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    assignedAt: {
      type: Date,
      required: true,
    },
    assignedByStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: radiologyReportStatusValues,
      default: 'DRAFT',
    },
    urgency: {
      type: String,
      required: true,
      enum: radiologyReportUrgencyValues,
      default: 'ROUTINE',
    },
    clinicalHistory: {
      type: String,
      default: null,
      trim: true,
      maxlength: 50_000,
      select: false,
    },
    comparisonStudyReferences: {
      type: [String],
      required: true,
      default: [],
      select: false,
    },
    findings: {
      type: String,
      default: null,
      trim: true,
      maxlength: 250_000,
      select: false,
    },
    impression: {
      type: String,
      default: null,
      trim: true,
      maxlength: 100_000,
      select: false,
    },
    recommendations: {
      type: String,
      default: null,
      trim: true,
      maxlength: 50_000,
      select: false,
    },
    criticalFindings: {
      type: [criticalFindingSchema],
      required: true,
      default: [],
      select: false,
    },
    criticalFindingCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    unresolvedCriticalFindingCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    attachmentIds: {
      type: [Schema.Types.ObjectId],
      required: true,
      default: [],
    },
    authoredAt: {
      type: Date,
      default: null,
    },
    authoredBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    authorStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    preliminaryAt: {
      type: Date,
      default: null,
    },
    preliminaryBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    preliminaryRadiologistStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    finalizedAt: {
      type: Date,
      default: null,
    },
    finalizedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    finalRadiologistStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    currentVersion: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    latestVersionId: {
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
      maxlength: 5_000,
      select: false,
    },
    supersedesReportVersionId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    addendumCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    latestAddendumAt: {
      type: Date,
      default: null,
    },
    publicationStatus: {
      type: String,
      required: true,
      enum: radiologyReportPublicationStatusValues,
      default: 'NOT_PUBLISHED',
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    publishedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    withdrawnAt: {
      type: Date,
      default: null,
    },
    withdrawnBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    withdrawalReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 5_000,
      select: false,
    },
    latestRenderedArtifactId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
  },
  {
    collection: 'radiologyReports',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

radiologyReportSchema.pre(
  'validate',
  function validateRadiologyReport() {
    this.reportNumber = normalizeCode(this.reportNumber);
    this.procedureCodeSnapshot = normalizeCode(
      this.procedureCodeSnapshot,
    );
    this.modalityCodeSnapshot = normalizeCode(
      this.modalityCodeSnapshot,
    );
    this.accessionNumberSnapshot = normalizeCode(
      this.accessionNumberSnapshot,
    );

    this.attachmentIds = [
      ...new Map(
        this.attachmentIds.map((id) => [
          id.toHexString(),
          id,
        ]),
      ).values(),
    ];

    this.comparisonStudyReferences = [
      ...new Set(
        this.comparisonStudyReferences
          .map((value) => value.trim())
          .filter((value) => value.length > 0),
      ),
    ];

    const findingCodes = new Set<string>();

    for (const finding of this.criticalFindings) {
      if (findingCodes.has(finding.findingCode)) {
        this.invalidate(
          'criticalFindings',
          'Radiology reports cannot contain duplicate critical-finding codes',
        );
      }

      findingCodes.add(finding.findingCode);
    }

    if (
      this.criticalFindingCount !==
      this.criticalFindings.length
    ) {
      this.invalidate(
        'criticalFindingCount',
        'Critical-finding count must match the report critical findings',
      );
    }

    if (
      this.unresolvedCriticalFindingCount >
      this.criticalFindingCount
    ) {
      this.invalidate(
        'unresolvedCriticalFindingCount',
        'Unresolved critical-finding count cannot exceed the total critical-finding count',
      );
    }

    if (this.status === 'DRAFT') {
      if (
        this.currentVersion !== 0 ||
        this.latestVersionId != null ||
        this.finalizedAt != null ||
        this.finalizedBy != null ||
        this.finalRadiologistStaffId != null
      ) {
        this.invalidate(
          'status',
          'Draft Radiology reports cannot retain finalization or immutable-version attribution',
        );
      }
    }

    if (this.status === 'PRELIMINARY') {
      if (
        this.findings == null ||
        this.impression == null ||
        this.preliminaryAt == null ||
        this.preliminaryBy == null ||
        this.preliminaryRadiologistStaffId == null
      ) {
        this.invalidate(
          'status',
          'Preliminary Radiology reports require findings, impression, and radiologist attribution',
        );
      }
    }

    if (
      ['FINAL', 'CORRECTED', 'ADDENDUM'].includes(
        this.status,
      )
    ) {
      if (
        this.findings == null ||
        this.impression == null ||
        this.finalizedAt == null ||
        this.finalizedBy == null ||
        this.finalRadiologistStaffId == null ||
        this.latestVersionId == null ||
        this.currentVersion < 1
      ) {
        this.invalidate(
          'status',
          'Final Radiology report states require signed content, final radiologist attribution, and an immutable version',
        );
      }
    }

    if (this.status === 'CORRECTED') {
      if (
        this.correctedAt == null ||
        this.correctedBy == null ||
        this.correctionReason == null ||
        this.supersedesReportVersionId == null ||
        this.currentVersion < 2
      ) {
        this.invalidate(
          'status',
          'Corrected Radiology reports require correction attribution and prior-version traceability',
        );
      }
    }

    if (this.status === 'ADDENDUM') {
      if (
        this.addendumCount < 1 ||
        this.latestAddendumAt == null
      ) {
        this.invalidate(
          'status',
          'Radiology addendum state requires addendum count and timestamp',
        );
      }
    }

    if (this.publicationStatus === 'PUBLISHED') {
      if (
        this.publishedAt == null ||
        this.publishedBy == null ||
        !['FINAL', 'CORRECTED', 'ADDENDUM'].includes(
          this.status,
        )
      ) {
        this.invalidate(
          'publicationStatus',
          'Only final, corrected, or addendum Radiology reports may be published with attribution',
        );
      }
    }

    if (this.publicationStatus === 'WITHDRAWN') {
      if (
        this.withdrawnAt == null ||
        this.withdrawnBy == null ||
        this.withdrawalReason == null
      ) {
        this.invalidate(
          'publicationStatus',
          'Withdrawn Radiology reports require withdrawal attribution and reason',
        );
      }
    } else if (
      this.withdrawnAt != null ||
      this.withdrawnBy != null ||
      this.withdrawalReason != null
    ) {
      this.invalidate(
        'publicationStatus',
        'Non-withdrawn Radiology reports cannot retain withdrawal metadata',
      );
    }
  },
);

radiologyReportSchema.index(
  {
    facilityId: 1,
    reportNumber: 1,
  },
  {
    name: 'uq_radiology_reports_facility_number',
    unique: true,
  },
);

radiologyReportSchema.index(
  {
    facilityId: 1,
    radiologyOrderItemId: 1,
  },
  {
    name: 'uq_radiology_reports_order_item',
    unique: true,
  },
);

radiologyReportSchema.index(
  {
    facilityId: 1,
    assignedRadiologistStaffId: 1,
    status: 1,
    urgency: 1,
    updatedAt: 1,
  },
  {
    name: 'ix_radiology_reports_radiologist_worklist',
  },
);

radiologyReportSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    publicationStatus: 1,
    finalizedAt: -1,
  },
  {
    name: 'ix_radiology_reports_patient_history',
  },
);

radiologyReportSchema.index(
  {
    facilityId: 1,
    encounterId: 1,
    publicationStatus: 1,
    finalizedAt: -1,
  },
  {
    name: 'ix_radiology_reports_encounter_history',
  },
);

radiologyReportSchema.index(
  {
    facilityId: 1,
    unresolvedCriticalFindingCount: 1,
    urgency: 1,
    finalizedAt: 1,
  },
  {
    name: 'ix_radiology_reports_critical_worklist',
  },
);

export const radiologyReportVersionSchema = new Schema(
  {
    ...commonFields,
    radiologyReportId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    radiologyOrderId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    radiologyOrderItemId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    imagingStudyId: {
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
      enum: radiologyReportVersionChangeTypeValues,
      immutable: true,
    },
    statusSnapshot: {
      type: String,
      required: true,
      enum: radiologyReportStatusValues,
      immutable: true,
    },
    urgencySnapshot: {
      type: String,
      required: true,
      enum: radiologyReportUrgencyValues,
      immutable: true,
    },
    criticalFindingCountSnapshot: {
      type: Number,
      required: true,
      immutable: true,
      min: 0,
    },
    attachmentIdsSnapshot: {
      type: [Schema.Types.ObjectId],
      required: true,
      immutable: true,
      default: [],
    },
    encryptedSnapshot: {
      type: encryptedRadiologySnapshotSchema,
      required: true,
      immutable: true,
      select: false,
    },
    snapshotHash: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      lowercase: true,
      match: /^[a-f0-9]{64}$/u,
    },
    contentHash: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      lowercase: true,
      match: /^[a-f0-9]{64}$/u,
    },
    changeReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 5_000,
      immutable: true,
      select: false,
    },
    authorStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    finalRadiologistStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
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
    collection: 'radiologyReportVersions',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

radiologyReportVersionSchema.pre(
  'validate',
  function validateRadiologyReportVersion() {
    if (
      this.versionNumber === 1 &&
      this.previousVersionId != null
    ) {
      this.invalidate(
        'previousVersionId',
        'The first Radiology report version cannot reference a previous version',
      );
    }

    if (
      this.versionNumber > 1 &&
      this.previousVersionId == null
    ) {
      this.invalidate(
        'previousVersionId',
        'Subsequent Radiology report versions require previous-version traceability',
      );
    }

    if (
      this.changeType === 'INITIAL_FINALIZATION' &&
      this.versionNumber !== 1
    ) {
      this.invalidate(
        'changeType',
        'Initial Radiology finalization must create the first immutable version',
      );
    }

    if (
      ['CORRECTION', 'ADDENDUM', 'RECOVERY'].includes(
        this.changeType,
      ) &&
      this.changeReason == null
    ) {
      this.invalidate(
        'changeReason',
        `${this.changeType} Radiology report versions require a reason`,
      );
    }
  },
);

radiologyReportVersionSchema.index(
  {
    facilityId: 1,
    radiologyReportId: 1,
    versionNumber: 1,
  },
  {
    name: 'uq_radiology_report_versions_report_version',
    unique: true,
  },
);

radiologyReportVersionSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    recordedAt: -1,
  },
  {
    name: 'ix_radiology_report_versions_patient_recorded',
  },
);

radiologyReportVersionSchema.index(
  {
    facilityId: 1,
    encounterId: 1,
    recordedAt: -1,
  },
  {
    name: 'ix_radiology_report_versions_encounter_recorded',
  },
);

export const radiologyCriticalFindingCommunicationSchema =
  new Schema(
    {
      ...commonFields,
      radiologyReportId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },
      radiologyReportVersionId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },
      radiologyOrderId: {
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
      sequence: {
        type: Number,
        required: true,
        immutable: true,
        min: 1,
      },
      findingCodeSnapshot: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        maxlength: 100,
      },
      urgencySnapshot: {
        type: String,
        required: true,
        immutable: true,
        enum: ['URGENT', 'CRITICAL'],
      },
      communicationType: {
        type: String,
        required: true,
        immutable: true,
        enum: radiologyCriticalFindingCommunicationTypeValues,
      },
      channel: {
        type: String,
        required: true,
        immutable: true,
        enum: radiologyCommunicationChannelValues,
      },
      recipientType: {
        type: String,
        required: true,
        immutable: true,
        enum: radiologyCommunicationRecipientTypeValues,
      },
      recipientUserId: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },
      recipientStaffId: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },
      recipientDisplaySnapshot: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 1,
        maxlength: 500,
        select: false,
      },
      communicationNotes: {
        type: String,
        default: null,
        trim: true,
        maxlength: 5_000,
        immutable: true,
        select: false,
      },
      acknowledgesCommunicationId: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },
      occurredAt: {
        type: Date,
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
        'radiologyCriticalFindingCommunications',
      strict: true,
      timestamps: true,
      versionKey: false,
    },
  );

radiologyCriticalFindingCommunicationSchema.pre(
  'validate',
  function validateCriticalFindingCommunication() {
    this.findingCodeSnapshot = normalizeCode(
      this.findingCodeSnapshot,
    );

    const recipientCount = [
      this.recipientUserId,
      this.recipientStaffId,
    ].filter((value) => value != null).length;

    if (recipientCount > 1) {
      this.invalidate(
        'recipientUserId',
        'A critical-finding communication may identify at most one internal recipient principal',
      );
    }

    if (
      this.communicationType === 'ACKNOWLEDGED' &&
      this.acknowledgesCommunicationId == null
    ) {
      this.invalidate(
        'acknowledgesCommunicationId',
        'Critical-finding acknowledgement requires the notification record it acknowledges',
      );
    }

    if (
      this.communicationType !== 'ACKNOWLEDGED' &&
      this.acknowledgesCommunicationId != null
    ) {
      this.invalidate(
        'acknowledgesCommunicationId',
        'Only acknowledgement communications may reference an acknowledged notification',
      );
    }
  },
);

radiologyCriticalFindingCommunicationSchema.index(
  {
    facilityId: 1,
    radiologyReportId: 1,
    sequence: 1,
  },
  {
    name:
      'uq_radiology_critical_communications_report_sequence',
    unique: true,
  },
);

radiologyCriticalFindingCommunicationSchema.index(
  {
    facilityId: 1,
    radiologyReportVersionId: 1,
    findingCodeSnapshot: 1,
    occurredAt: 1,
  },
  {
    name:
      'ix_radiology_critical_communications_finding_time',
  },
);

radiologyCriticalFindingCommunicationSchema.index(
  {
    facilityId: 1,
    acknowledgesCommunicationId: 1,
  },
  {
    name:
      'uq_radiology_critical_communication_acknowledgement',
    unique: true,
    partialFilterExpression: {
      communicationType: 'ACKNOWLEDGED',
    },
  },
);

export type RadiologyReport = InferSchemaType<
  typeof radiologyReportSchema
>;

export type RadiologyReportVersion = InferSchemaType<
  typeof radiologyReportVersionSchema
>;

export type RadiologyCriticalFindingCommunication =
  InferSchemaType<
    typeof radiologyCriticalFindingCommunicationSchema
  >;

export const RadiologyReportModel =
  (mongoose.models['radiologyReports'] as
    | Model<RadiologyReport>
    | undefined) ??
  mongoose.model<RadiologyReport>(
    'radiologyReports',
    radiologyReportSchema,
    'radiologyReports',
  );

export const RadiologyReportVersionModel =
  (mongoose.models['radiologyReportVersions'] as
    | Model<RadiologyReportVersion>
    | undefined) ??
  mongoose.model<RadiologyReportVersion>(
    'radiologyReportVersions',
    radiologyReportVersionSchema,
    'radiologyReportVersions',
  );

export const RadiologyCriticalFindingCommunicationModel =
  (mongoose.models[
    'radiologyCriticalFindingCommunications'
  ] as
    | Model<RadiologyCriticalFindingCommunication>
    | undefined) ??
  mongoose.model<RadiologyCriticalFindingCommunication>(
    'radiologyCriticalFindingCommunications',
    radiologyCriticalFindingCommunicationSchema,
    'radiologyCriticalFindingCommunications',
  );