import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  radiologyLateralityValues,
  radiologyPreparationStatusValues,
  radiologySafetyScreeningStatusValues,
} from './radiology.types.js';

export const radiologyResourceTypeValues = [
  'ROOM',
  'EQUIPMENT',
] as const;

export const radiologyResourceStatusValues = [
  'ACTIVE',
  'INACTIVE',
  'MAINTENANCE',
] as const;

export const radiologyReservationSubjectTypeValues = [
  'RESOURCE',
  'STAFF',
] as const;

export const radiologyReservationStatusValues = [
  'ACTIVE',
  'RELEASED',
  'CANCELLED',
] as const;

export const radiologyAppointmentStatusValues = [
  'SCHEDULED',
  'CHECKED_IN',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;

export const radiologyScreeningResponseValues = [
  'YES',
  'NO',
  'UNKNOWN',
  'NOT_APPLICABLE',
] as const;

export const radiologyExaminationStatusValues = [
  'CHECKED_IN',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;

export const radiologyExternalSystemTypeValues = [
  'PACS',
  'RIS',
  'VNA',
  'DICOMWEB',
  'OTHER',
] as const;

export const radiologyImagingStudyStatusValues = [
  'REGISTERED',
  'PARTIAL',
  'AVAILABLE',
  'FAILED',
  'ARCHIVED',
] as const;

export type RadiologyResourceType =
  (typeof radiologyResourceTypeValues)[number];

export type RadiologyResourceStatus =
  (typeof radiologyResourceStatusValues)[number];

export type RadiologyReservationSubjectType =
  (typeof radiologyReservationSubjectTypeValues)[number];

export type RadiologyReservationStatus =
  (typeof radiologyReservationStatusValues)[number];

export type RadiologyAppointmentStatus =
  (typeof radiologyAppointmentStatusValues)[number];

export type RadiologyScreeningResponse =
  (typeof radiologyScreeningResponseValues)[number];

export type RadiologyExaminationStatus =
  (typeof radiologyExaminationStatusValues)[number];

export type RadiologyExternalSystemType =
  (typeof radiologyExternalSystemTypeValues)[number];

export type RadiologyImagingStudyStatus =
  (typeof radiologyImagingStudyStatusValues)[number];

function normalizeCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replaceAll(/[^A-Z0-9.-]+/gu, '_');
}

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/gu, ' ');
}

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

export const radiologyResourceSchema = new Schema(
  {
    ...commonFields,
    resourceCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 100,
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
    resourceType: {
      type: String,
      required: true,
      enum: radiologyResourceTypeValues,
    },
    departmentId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    modalityIds: {
      type: [Schema.Types.ObjectId],
      required: true,
      default: [],
    },
    location: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
    capabilities: {
      type: [String],
      required: true,
      default: [],
    },
    manufacturer: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
    },
    modelName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
    },
    serialNumber: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
      select: false,
    },
    externalResourceReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
    status: {
      type: String,
      required: true,
      enum: radiologyResourceStatusValues,
      default: 'ACTIVE',
    },
    effectiveFrom: {
      type: Date,
      required: true,
    },
    effectiveThrough: {
      type: Date,
      default: null,
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
    },
  },
  {
    collection: 'radiologyResources',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

radiologyResourceSchema.pre(
  'validate',
  function validateRadiologyResource() {
    this.resourceCode = normalizeCode(this.resourceCode);
    this.normalizedName = normalizeName(this.name);
    this.capabilities = [
      ...new Set(
        this.capabilities
          .map((capability) => normalizeCode(capability))
          .filter((capability) => capability.length > 0),
      ),
    ];
    this.modalityIds = [
      ...new Map(
        this.modalityIds.map((id) => [id.toHexString(), id]),
      ).values(),
    ];

    if (this.modalityIds.length < 1) {
      this.invalidate(
        'modalityIds',
        'Radiology resources require at least one supported modality',
      );
    }

    if (
      this.effectiveThrough != null &&
      this.effectiveThrough < this.effectiveFrom
    ) {
      this.invalidate(
        'effectiveThrough',
        'Radiology resource effective-through time cannot precede effective-from time',
      );
    }

    if (this.status === 'ACTIVE') {
      if (
        this.deactivatedAt != null ||
        this.deactivatedBy != null ||
        this.deactivationReason != null
      ) {
        this.invalidate(
          'status',
          'Active Radiology resources cannot retain deactivation metadata',
        );
      }
    } else if (
      this.deactivatedAt == null ||
      this.deactivatedBy == null ||
      this.deactivationReason == null
    ) {
      this.invalidate(
        'status',
        'Inactive or maintenance Radiology resources require attribution and reason',
      );
    }
  },
);

radiologyResourceSchema.index(
  {
    facilityId: 1,
    resourceCode: 1,
  },
  {
    name: 'uq_radiology_resources_facility_code',
    unique: true,
  },
);

radiologyResourceSchema.index(
  {
    facilityId: 1,
    normalizedName: 1,
  },
  {
    name: 'uq_radiology_resources_facility_name',
    unique: true,
  },
);

radiologyResourceSchema.index(
  {
    facilityId: 1,
    departmentId: 1,
    resourceType: 1,
    modalityIds: 1,
    status: 1,
  },
  {
    name: 'ix_radiology_resources_availability',
  },
);

export const radiologyAppointmentSchema = new Schema(
  {
    ...commonFields,
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
    modalityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    departmentId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    scheduledStartAt: {
      type: Date,
      required: true,
    },
    scheduledEndAt: {
      type: Date,
      required: true,
    },
    timezone: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
      default: 'Asia/Karachi',
    },
    roomResourceId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    equipmentResourceIds: {
      type: [Schema.Types.ObjectId],
      required: true,
      default: [],
    },
    technicianStaffIds: {
      type: [Schema.Types.ObjectId],
      required: true,
      default: [],
    },
    preparationStatus: {
      type: String,
      required: true,
      enum: radiologyPreparationStatusValues,
    },
    safetyScreeningStatus: {
      type: String,
      required: true,
      enum: radiologySafetyScreeningStatusValues,
    },
    status: {
      type: String,
      required: true,
      enum: radiologyAppointmentStatusValues,
      default: 'SCHEDULED',
    },
    scheduledByStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    scheduledAt: {
      type: Date,
      required: true,
    },
    checkedInAt: {
      type: Date,
      default: null,
    },
    checkedInByStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    cancelledAt: {
      type: Date,
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
      maxlength: 2_000,
      select: false,
    },
  },
  {
    collection: 'radiologyAppointments',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

radiologyAppointmentSchema.pre(
  'validate',
  function validateAppointment() {
    if (this.scheduledEndAt <= this.scheduledStartAt) {
      this.invalidate(
        'scheduledEndAt',
        'Radiology appointment end time must be after its start time',
      );
    }

    this.equipmentResourceIds = [
      ...new Map(
        this.equipmentResourceIds.map((id) => [
          id.toHexString(),
          id,
        ]),
      ).values(),
    ];

    this.technicianStaffIds = [
      ...new Map(
        this.technicianStaffIds.map((id) => [
          id.toHexString(),
          id,
        ]),
      ).values(),
    ];

    if (this.status === 'CHECKED_IN') {
      if (
        this.checkedInAt == null ||
        this.checkedInByStaffId == null
      ) {
        this.invalidate(
          'status',
          'Checked-in Radiology appointments require staff attribution',
        );
      }
    }

    if (this.status === 'CANCELLED') {
      if (
        this.cancelledAt == null ||
        this.cancelledByStaffId == null ||
        this.cancellationReason == null
      ) {
        this.invalidate(
          'status',
          'Cancelled Radiology appointments require attribution and reason',
        );
      }
    } else if (
      this.cancelledAt != null ||
      this.cancelledByStaffId != null ||
      this.cancellationReason != null
    ) {
      this.invalidate(
        'status',
        'Active Radiology appointments cannot retain cancellation metadata',
      );
    }
  },
);

radiologyAppointmentSchema.index(
  {
    facilityId: 1,
    radiologyOrderItemId: 1,
  },
  {
    name: 'uq_radiology_appointments_order_item',
    unique: true,
  },
);

radiologyAppointmentSchema.index(
  {
    facilityId: 1,
    departmentId: 1,
    status: 1,
    scheduledStartAt: 1,
  },
  {
    name: 'ix_radiology_appointments_department_schedule',
  },
);

radiologyAppointmentSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    scheduledStartAt: -1,
  },
  {
    name: 'ix_radiology_appointments_patient_schedule',
  },
);

export const radiologyResourceReservationSchema = new Schema(
  {
    ...commonFields,
    appointmentId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    radiologyOrderItemId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    subjectType: {
      type: String,
      required: true,
      immutable: true,
      enum: radiologyReservationSubjectTypeValues,
    },
    resourceId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    staffId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    reservedStartAt: {
      type: Date,
      required: true,
    },
    reservedEndAt: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: radiologyReservationStatusValues,
      default: 'ACTIVE',
    },
    releasedAt: {
      type: Date,
      default: null,
    },
    releasedByStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
  },
  {
    collection: 'radiologyResourceReservations',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

radiologyResourceReservationSchema.pre(
  'validate',
  function validateResourceReservation() {
    if (this.reservedEndAt <= this.reservedStartAt) {
      this.invalidate(
        'reservedEndAt',
        'Radiology reservation end time must be after its start time',
      );
    }

    const hasResource = this.resourceId != null;
    const hasStaff = this.staffId != null;

    if (
      this.subjectType === 'RESOURCE' &&
      (!hasResource || hasStaff)
    ) {
      this.invalidate(
        'resourceId',
        'Resource reservations require only a resource identifier',
      );
    }

    if (
      this.subjectType === 'STAFF' &&
      (!hasStaff || hasResource)
    ) {
      this.invalidate(
        'staffId',
        'Staff reservations require only a staff identifier',
      );
    }

    if (this.status === 'ACTIVE') {
      if (
        this.releasedAt != null ||
        this.releasedByStaffId != null
      ) {
        this.invalidate(
          'status',
          'Active Radiology reservations cannot retain release attribution',
        );
      }
    } else if (
      this.releasedAt == null ||
      this.releasedByStaffId == null
    ) {
      this.invalidate(
        'status',
        'Released or cancelled Radiology reservations require attribution',
      );
    }
  },
);

radiologyResourceReservationSchema.index(
  {
    facilityId: 1,
    appointmentId: 1,
    subjectType: 1,
    resourceId: 1,
    staffId: 1,
  },
  {
    name: 'uq_radiology_reservations_appointment_subject',
    unique: true,
    partialFilterExpression: {
      status: 'ACTIVE',
    },
  },
);

radiologyResourceReservationSchema.index(
  {
    facilityId: 1,
    subjectType: 1,
    resourceId: 1,
    status: 1,
    reservedStartAt: 1,
    reservedEndAt: 1,
  },
  {
    name: 'ix_radiology_reservations_resource_overlap',
  },
);

radiologyResourceReservationSchema.index(
  {
    facilityId: 1,
    subjectType: 1,
    staffId: 1,
    status: 1,
    reservedStartAt: 1,
    reservedEndAt: 1,
  },
  {
    name: 'ix_radiology_reservations_staff_overlap',
  },
);

const screeningResponseSchema = new Schema(
  {
    requirementCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    response: {
      type: String,
      required: true,
      enum: radiologyScreeningResponseValues,
    },
    details: {
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

export const radiologySafetyScreeningSchema = new Schema(
  {
    ...commonFields,
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
    appointmentId: {
      type: Schema.Types.ObjectId,
      default: null,
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
    requiredScreeningCodesSnapshot: {
      type: [String],
      required: true,
      immutable: true,
      default: [],
    },
    requirementsHash: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      lowercase: true,
      match: /^[a-f0-9]{64}$/u,
    },
    responses: {
      type: [screeningResponseSchema],
      required: true,
      default: [],
      select: false,
    },
    pregnancyStatus: {
      type: String,
      required: true,
      enum: radiologyScreeningResponseValues,
      default: 'NOT_APPLICABLE',
      select: false,
    },
    contrastAllergyStatus: {
      type: String,
      required: true,
      enum: radiologyScreeningResponseValues,
      default: 'NOT_APPLICABLE',
      select: false,
    },
    renalRiskStatus: {
      type: String,
      required: true,
      enum: radiologyScreeningResponseValues,
      default: 'NOT_APPLICABLE',
      select: false,
    },
    implantDeviceStatus: {
      type: String,
      required: true,
      enum: radiologyScreeningResponseValues,
      default: 'NOT_APPLICABLE',
      select: false,
    },
    estimatedGfr: {
      type: Schema.Types.Decimal128,
      default: null,
      min: 0,
      select: false,
    },
    serumCreatinine: {
      type: Schema.Types.Decimal128,
      default: null,
      min: 0,
      select: false,
    },
    renalLabObservedAt: {
      type: Date,
      default: null,
      select: false,
    },
    status: {
      type: String,
      required: true,
      enum: radiologySafetyScreeningStatusValues,
      default: 'PENDING',
    },
    preparationStatus: {
      type: String,
      required: true,
      enum: radiologyPreparationStatusValues,
      default: 'PENDING',
    },
    conditions: {
      type: [String],
      required: true,
      default: [],
      select: false,
    },
    screenedAt: {
      type: Date,
      required: true,
    },
    screenedByStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewedByStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
  },
  {
    collection: 'radiologySafetyScreenings',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

radiologySafetyScreeningSchema.pre(
  'validate',
  function validateSafetyScreening() {
    this.requiredScreeningCodesSnapshot = [
      ...new Set(
        this.requiredScreeningCodesSnapshot.map((code) =>
          normalizeCode(code),
        ),
      ),
    ];

    const responseCodes = new Set<string>();

    for (const response of this.responses) {
      response.requirementCode = normalizeCode(
        response.requirementCode,
      );

      if (responseCodes.has(response.requirementCode)) {
        this.invalidate(
          'responses',
          'Radiology safety screening cannot contain duplicate requirement responses',
        );
      }

      responseCodes.add(response.requirementCode);
    }

    if (this.status === 'CLEARED') {
      if (
        this.reviewedAt == null ||
        this.reviewedByStaffId == null
      ) {
        this.invalidate(
          'status',
          'Cleared Radiology safety screening requires reviewer attribution',
        );
      }
    }

    if (
      this.status === 'NOT_REQUIRED' &&
      this.requiredScreeningCodesSnapshot.length > 0
    ) {
      this.invalidate(
        'status',
        'Required Radiology safety screening cannot use NOT_REQUIRED status',
      );
    }
  },
);

radiologySafetyScreeningSchema.index(
  {
    facilityId: 1,
    radiologyOrderItemId: 1,
  },
  {
    name: 'uq_radiology_safety_screenings_order_item',
    unique: true,
  },
);

radiologySafetyScreeningSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    screenedAt: -1,
  },
  {
    name: 'ix_radiology_safety_screenings_patient_time',
  },
);

export const radiologyExaminationSchema = new Schema(
  {
    ...commonFields,
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
    appointmentId: {
      type: Schema.Types.ObjectId,
      default: null,
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
    modalityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    procedureDefinitionHash: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      lowercase: true,
      match: /^[a-f0-9]{64}$/u,
    },
    status: {
      type: String,
      required: true,
      enum: radiologyExaminationStatusValues,
      default: 'CHECKED_IN',
    },
    technicianStaffIds: {
      type: [Schema.Types.ObjectId],
      required: true,
      default: [],
    },
    checkedInAt: {
      type: Date,
      required: true,
    },
    checkedInByStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    startedByStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    completedByStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    contrastAdministered: {
      type: Boolean,
      required: true,
      default: false,
    },
    contrastUsageReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
    technicianNotes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 100_000,
      select: false,
    },
    complications: {
      type: String,
      default: null,
      trim: true,
      maxlength: 20_000,
      select: false,
    },
  },
  {
    collection: 'radiologyExaminations',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

radiologyExaminationSchema.pre(
  'validate',
  function validateExamination() {
    this.technicianStaffIds = [
      ...new Map(
        this.technicianStaffIds.map((id) => [
          id.toHexString(),
          id,
        ]),
      ).values(),
    ];

    if (this.status === 'IN_PROGRESS') {
      if (
        this.startedAt == null ||
        this.startedByStaffId == null
      ) {
        this.invalidate(
          'status',
          'In-progress Radiology examinations require start attribution',
        );
      }
    }

    if (this.status === 'COMPLETED') {
      if (
        this.startedAt == null ||
        this.startedByStaffId == null ||
        this.completedAt == null ||
        this.completedByStaffId == null
      ) {
        this.invalidate(
          'status',
          'Completed Radiology examinations require start and completion attribution',
        );
      }
    }

    if (
      this.contrastAdministered &&
      this.contrastUsageReference == null
    ) {
      this.invalidate(
        'contrastUsageReference',
        'Contrast administration requires an Inventory integration reference',
      );
    }

    if (
      !this.contrastAdministered &&
      this.contrastUsageReference != null
    ) {
      this.invalidate(
        'contrastUsageReference',
        'Non-contrast examinations cannot retain a contrast usage reference',
      );
    }
  },
);

radiologyExaminationSchema.index(
  {
    facilityId: 1,
    radiologyOrderItemId: 1,
  },
  {
    name: 'uq_radiology_examinations_order_item',
    unique: true,
  },
);

radiologyExaminationSchema.index(
  {
    facilityId: 1,
    status: 1,
    checkedInAt: 1,
  },
  {
    name: 'ix_radiology_examinations_worklist',
  },
);

const externalReferenceSchema = new Schema(
  {
    systemType: {
      type: String,
      required: true,
      enum: radiologyExternalSystemTypeValues,
    },
    systemName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    endpointAlias: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    externalStudyId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    viewerReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
      select: false,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

export const radiologyImagingStudySchema = new Schema(
  {
    ...commonFields,
    studyNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 120,
    },
    accessionNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
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
    modalityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    modalityCodeSnapshot: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 80,
    },
    studyInstanceUid: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 3,
      maxlength: 128,
      match: /^[0-9]+(?:\.[0-9]+)+$/u,
    },
    studyDateTime: {
      type: Date,
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      required: true,
      enum: radiologyImagingStudyStatusValues,
      default: 'REGISTERED',
    },
    externalReferences: {
      type: [externalReferenceSchema],
      required: true,
      default: [],
    },
    seriesCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    instanceCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    binaryStorageProhibited: {
      type: Boolean,
      required: true,
      immutable: true,
      default: true,
    },
    registeredAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    registeredByStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
  },
  {
    collection: 'radiologyImagingStudies',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

radiologyImagingStudySchema.pre(
  'validate',
  function validateImagingStudy() {
    this.studyNumber = normalizeCode(this.studyNumber);
    this.accessionNumber = normalizeCode(this.accessionNumber);
    this.modalityCodeSnapshot = normalizeCode(
      this.modalityCodeSnapshot,
    );

    if (!this.binaryStorageProhibited) {
      this.invalidate(
        'binaryStorageProhibited',
        'Radiology image binaries must not be stored in MongoDB',
      );
    }

    if (this.externalReferences.length < 1) {
      this.invalidate(
        'externalReferences',
        'Radiology imaging studies require at least one PACS, RIS, VNA, DICOMweb, or external reference',
      );
    }
  },
);

radiologyImagingStudySchema.index(
  {
    facilityId: 1,
    studyNumber: 1,
  },
  {
    name: 'uq_radiology_imaging_studies_facility_number',
    unique: true,
  },
);

radiologyImagingStudySchema.index(
  {
    facilityId: 1,
    studyInstanceUid: 1,
  },
  {
    name: 'uq_radiology_imaging_studies_instance_uid',
    unique: true,
  },
);

radiologyImagingStudySchema.index(
  {
    facilityId: 1,
    radiologyOrderItemId: 1,
  },
  {
    name: 'uq_radiology_imaging_studies_order_item',
    unique: true,
  },
);

radiologyImagingStudySchema.index(
  {
    facilityId: 1,
    patientId: 1,
    studyDateTime: -1,
  },
  {
    name: 'ix_radiology_imaging_studies_patient_time',
  },
);

export const radiologyImagingSeriesSchema = new Schema(
  {
    ...commonFields,
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
    seriesInstanceUid: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 3,
      maxlength: 128,
      match: /^[0-9]+(?:\.[0-9]+)+$/u,
    },
    seriesNumber: {
      type: Number,
      required: true,
      immutable: true,
      min: 0,
    },
    modalityCodeSnapshot: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 80,
    },
    bodyRegionCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 80,
    },
    laterality: {
      type: String,
      required: true,
      enum: radiologyLateralityValues,
      default: 'NOT_APPLICABLE',
    },
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 5_000,
      select: false,
    },
    protocolName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
      select: false,
    },
    instanceCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    externalSeriesId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
    storageReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
      select: false,
    },
    binaryStorageProhibited: {
      type: Boolean,
      required: true,
      immutable: true,
      default: true,
    },
  },
  {
    collection: 'radiologyImagingSeries',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

radiologyImagingSeriesSchema.pre(
  'validate',
  function validateImagingSeries() {
    this.modalityCodeSnapshot = normalizeCode(
      this.modalityCodeSnapshot,
    );

    if (this.bodyRegionCode != null) {
      this.bodyRegionCode = normalizeCode(this.bodyRegionCode);
    }

    if (!this.binaryStorageProhibited) {
      this.invalidate(
        'binaryStorageProhibited',
        'Radiology image binaries must not be stored in MongoDB',
      );
    }
  },
);

radiologyImagingSeriesSchema.index(
  {
    facilityId: 1,
    seriesInstanceUid: 1,
  },
  {
    name: 'uq_radiology_imaging_series_instance_uid',
    unique: true,
  },
);

radiologyImagingSeriesSchema.index(
  {
    facilityId: 1,
    imagingStudyId: 1,
    seriesNumber: 1,
  },
  {
    name: 'uq_radiology_imaging_series_study_number',
    unique: true,
  },
);

export type RadiologyResource = InferSchemaType<
  typeof radiologyResourceSchema
>;

export type RadiologyAppointment = InferSchemaType<
  typeof radiologyAppointmentSchema
>;

export type RadiologyResourceReservation = InferSchemaType<
  typeof radiologyResourceReservationSchema
>;

export type RadiologySafetyScreening = InferSchemaType<
  typeof radiologySafetyScreeningSchema
>;

export type RadiologyExamination = InferSchemaType<
  typeof radiologyExaminationSchema
>;

export type RadiologyImagingStudy = InferSchemaType<
  typeof radiologyImagingStudySchema
>;

export type RadiologyImagingSeries = InferSchemaType<
  typeof radiologyImagingSeriesSchema
>;

export const RadiologyResourceModel =
  (mongoose.models['radiologyResources'] as
    | Model<RadiologyResource>
    | undefined) ??
  mongoose.model<RadiologyResource>(
    'radiologyResources',
    radiologyResourceSchema,
    'radiologyResources',
  );

export const RadiologyAppointmentModel =
  (mongoose.models['radiologyAppointments'] as
    | Model<RadiologyAppointment>
    | undefined) ??
  mongoose.model<RadiologyAppointment>(
    'radiologyAppointments',
    radiologyAppointmentSchema,
    'radiologyAppointments',
  );

export const RadiologyResourceReservationModel =
  (mongoose.models['radiologyResourceReservations'] as
    | Model<RadiologyResourceReservation>
    | undefined) ??
  mongoose.model<RadiologyResourceReservation>(
    'radiologyResourceReservations',
    radiologyResourceReservationSchema,
    'radiologyResourceReservations',
  );

export const RadiologySafetyScreeningModel =
  (mongoose.models['radiologySafetyScreenings'] as
    | Model<RadiologySafetyScreening>
    | undefined) ??
  mongoose.model<RadiologySafetyScreening>(
    'radiologySafetyScreenings',
    radiologySafetyScreeningSchema,
    'radiologySafetyScreenings',
  );

export const RadiologyExaminationModel =
  (mongoose.models['radiologyExaminations'] as
    | Model<RadiologyExamination>
    | undefined) ??
  mongoose.model<RadiologyExamination>(
    'radiologyExaminations',
    radiologyExaminationSchema,
    'radiologyExaminations',
  );

export const RadiologyImagingStudyModel =
  (mongoose.models['radiologyImagingStudies'] as
    | Model<RadiologyImagingStudy>
    | undefined) ??
  mongoose.model<RadiologyImagingStudy>(
    'radiologyImagingStudies',
    radiologyImagingStudySchema,
    'radiologyImagingStudies',
  );

export const RadiologyImagingSeriesModel =
  (mongoose.models['radiologyImagingSeries'] as
    | Model<RadiologyImagingSeries>
    | undefined) ??
  mongoose.model<RadiologyImagingSeries>(
    'radiologyImagingSeries',
    radiologyImagingSeriesSchema,
    'radiologyImagingSeries',
  );