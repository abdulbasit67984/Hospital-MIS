import {
  z,
} from 'zod';

import {
  radiologyAppointmentStatusValues,
  radiologyExternalSystemTypeValues,
  radiologyImagingStudyStatusValues,
  radiologyLateralityValues,
  radiologyPreparationStatusValues,
  radiologyResourceStatusValues,
  radiologyResourceTypeValues,
  radiologySafetyScreeningStatusValues,
  radiologyScreeningResponseValues,
} from '@hospital-mis/database';

import {
  radiologyExpectedVersionSchema,
  radiologyIsoDateTimeSchema,
  radiologyObjectIdSchema,
  radiologyReasonSchema,
} from './radiology.validation.js';

const nullableText = (
  minimum: number,
  maximum: number,
) =>
  z
    .string()
    .trim()
    .min(minimum)
    .max(maximum)
    .nullable()
    .optional();

const decimalStringSchema = z
  .string()
  .trim()
  .regex(
    /^(?:0|[1-9]\d*)(?:\.\d+)?$/u,
    'Expected a non-negative decimal string',
  );

const dicomUidSchema = z
  .string()
  .trim()
  .min(3)
  .max(128)
  .regex(
    /^[0-9]+(?:\.[0-9]+)+$/u,
    'Expected a valid DICOM UID',
  );

const uniqueObjectIds = (
  values: readonly string[],
): boolean =>
  new Set(
    values.map((value) => value.toLowerCase()),
  ).size === values.length;

export const createRadiologyResourceBodySchema = z
  .object({
    resourceCode: z.string().trim().min(2).max(100),
    name: z.string().trim().min(2).max(300),
    resourceType: z.enum(radiologyResourceTypeValues),
    departmentId: radiologyObjectIdSchema,
    modalityIds: z
      .array(radiologyObjectIdSchema)
      .min(1)
      .max(100),
    location: nullableText(1, 500),
    capabilities: z
      .array(
        z.string().trim().min(1).max(100),
      )
      .max(100)
      .default([]),
    manufacturer: nullableText(1, 300),
    modelName: nullableText(1, 300),
    serialNumber: nullableText(1, 300),
    externalResourceReference: nullableText(1, 500),
    effectiveFrom: radiologyIsoDateTimeSchema.optional(),
    effectiveThrough:
      radiologyIsoDateTimeSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!uniqueObjectIds(value.modalityIds)) {
      context.addIssue({
        code: 'custom',
        path: ['modalityIds'],
        message:
          'Radiology resource modalities must be unique',
      });
    }

    if (
      value.effectiveFrom !== undefined &&
      value.effectiveThrough != null &&
      new Date(value.effectiveThrough) <
        new Date(value.effectiveFrom)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['effectiveThrough'],
        message:
          'Effective-through time cannot precede effective-from time',
      });
    }
  });

export const updateRadiologyResourceBodySchema = z
  .object({
    expectedVersion: radiologyExpectedVersionSchema,
    name: z
      .string()
      .trim()
      .min(2)
      .max(300)
      .optional(),
    departmentId: radiologyObjectIdSchema.optional(),
    modalityIds: z
      .array(radiologyObjectIdSchema)
      .min(1)
      .max(100)
      .optional(),
    location: nullableText(1, 500),
    capabilities: z
      .array(
        z.string().trim().min(1).max(100),
      )
      .max(100)
      .optional(),
    manufacturer: nullableText(1, 300),
    modelName: nullableText(1, 300),
    serialNumber: nullableText(1, 300),
    externalResourceReference: nullableText(1, 500),
    effectiveFrom: radiologyIsoDateTimeSchema.optional(),
    effectiveThrough:
      radiologyIsoDateTimeSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.modalityIds !== undefined &&
      !uniqueObjectIds(value.modalityIds)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['modalityIds'],
        message:
          'Radiology resource modalities must be unique',
      });
    }
  });

export const changeRadiologyResourceStatusBodySchema = z
  .object({
    expectedVersion: radiologyExpectedVersionSchema,
    status: z.enum(radiologyResourceStatusValues),
    reason: radiologyReasonSchema,
  })
  .strict();

export const scheduleRadiologyAppointmentBodySchema = z
  .object({
    orderItemId: radiologyObjectIdSchema,
    expectedOrderItemVersion:
      radiologyExpectedVersionSchema,
    expectedAppointmentVersion:
      radiologyExpectedVersionSchema.optional(),
    scheduledStartAt: radiologyIsoDateTimeSchema,
    scheduledEndAt: radiologyIsoDateTimeSchema,
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .default('Asia/Karachi'),
    roomResourceId:
      radiologyObjectIdSchema.nullable().optional(),
    equipmentResourceIds: z
      .array(radiologyObjectIdSchema)
      .max(50)
      .default([]),
    technicianStaffIds: z
      .array(radiologyObjectIdSchema)
      .max(50)
      .default([]),
  })
  .strict()
  .superRefine((value, context) => {
    const start = new Date(value.scheduledStartAt);
    const end = new Date(value.scheduledEndAt);

    if (end <= start) {
      context.addIssue({
        code: 'custom',
        path: ['scheduledEndAt'],
        message:
          'Scheduled end time must be after scheduled start time',
      });
    }

    if (
      end.getTime() - start.getTime() >
      24 * 60 * 60 * 1_000
    ) {
      context.addIssue({
        code: 'custom',
        path: ['scheduledEndAt'],
        message:
          'A Radiology appointment cannot exceed 24 hours',
      });
    }

    if (!uniqueObjectIds(value.equipmentResourceIds)) {
      context.addIssue({
        code: 'custom',
        path: ['equipmentResourceIds'],
        message:
          'Equipment allocations must be unique',
      });
    }

    if (!uniqueObjectIds(value.technicianStaffIds)) {
      context.addIssue({
        code: 'custom',
        path: ['technicianStaffIds'],
        message:
          'Technician allocations must be unique',
      });
    }

    if (
      value.roomResourceId != null &&
      value.equipmentResourceIds.includes(
        value.roomResourceId,
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['equipmentResourceIds'],
        message:
          'The room resource cannot also be allocated as equipment',
      });
    }
  });

export const cancelRadiologyAppointmentBodySchema = z
  .object({
    expectedAppointmentVersion:
      radiologyExpectedVersionSchema,
    reason: radiologyReasonSchema,
  })
  .strict();

const screeningResponseSchema = z
  .object({
    requirementCode: z
      .string()
      .trim()
      .min(1)
      .max(100),
    response: z.enum(
      radiologyScreeningResponseValues,
    ),
    details: nullableText(1, 10_000),
  })
  .strict();

export const recordRadiologySafetyScreeningBodySchema = z
  .object({
    orderItemId: radiologyObjectIdSchema,
    expectedOrderItemVersion:
      radiologyExpectedVersionSchema,
    expectedScreeningVersion:
      radiologyExpectedVersionSchema.optional(),
    responses: z
      .array(screeningResponseSchema)
      .max(100),
    pregnancyStatus: z.enum(
      radiologyScreeningResponseValues,
    ),
    contrastAllergyStatus: z.enum(
      radiologyScreeningResponseValues,
    ),
    renalRiskStatus: z.enum(
      radiologyScreeningResponseValues,
    ),
    implantDeviceStatus: z.enum(
      radiologyScreeningResponseValues,
    ),
    estimatedGfr:
      decimalStringSchema.nullable().optional(),
    serumCreatinine:
      decimalStringSchema.nullable().optional(),
    renalLabObservedAt:
      radiologyIsoDateTimeSchema.nullable().optional(),
    status: z.enum(
      radiologySafetyScreeningStatusValues,
    ),
    preparationStatus: z.enum(
      radiologyPreparationStatusValues,
    ),
    conditions: z
      .array(
        z.string().trim().min(1).max(5_000),
      )
      .max(100)
      .default([]),
  })
  .strict()
  .superRefine((value, context) => {
    const codes = value.responses.map((response) =>
      response.requirementCode
        .trim()
        .toUpperCase(),
    );

    if (new Set(codes).size !== codes.length) {
      context.addIssue({
        code: 'custom',
        path: ['responses'],
        message:
          'Safety-screening requirement responses must be unique',
      });
    }

    if (
      value.status === 'CLEARED' &&
      [
        value.pregnancyStatus,
        value.contrastAllergyStatus,
        value.renalRiskStatus,
        value.implantDeviceStatus,
      ].includes('UNKNOWN')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message:
          'Safety screening cannot be cleared with unresolved UNKNOWN risk responses',
      });
    }

    if (
      value.estimatedGfr != null &&
      value.renalLabObservedAt == null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['renalLabObservedAt'],
        message:
          'Renal laboratory values require an observation time',
      });
    }
  });

export const checkInRadiologyExaminationBodySchema = z
  .object({
    orderItemId: radiologyObjectIdSchema,
    expectedOrderItemVersion:
      radiologyExpectedVersionSchema,
    expectedAppointmentVersion:
      radiologyExpectedVersionSchema.optional(),
  })
  .strict();

export const startRadiologyExaminationBodySchema = z
  .object({
    orderItemId: radiologyObjectIdSchema,
    expectedOrderItemVersion:
      radiologyExpectedVersionSchema,
    expectedExaminationVersion:
      radiologyExpectedVersionSchema,
    technicianStaffIds: z
      .array(radiologyObjectIdSchema)
      .max(50)
      .default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (!uniqueObjectIds(value.technicianStaffIds)) {
      context.addIssue({
        code: 'custom',
        path: ['technicianStaffIds'],
        message:
          'Technician identifiers must be unique',
      });
    }
  });

export const completeRadiologyExaminationBodySchema = z
  .object({
    orderItemId: radiologyObjectIdSchema,
    expectedOrderItemVersion:
      radiologyExpectedVersionSchema,
    expectedExaminationVersion:
      radiologyExpectedVersionSchema,
    technicianStaffIds: z
      .array(radiologyObjectIdSchema)
      .min(1)
      .max(50),
    contrastAdministered: z.boolean(),
    contrastProductReference: nullableText(1, 500),
    contrastQuantity:
      decimalStringSchema.nullable().optional(),
    contrastUnitCode: nullableText(1, 40),
    technicianNotes: nullableText(1, 100_000),
    complications: nullableText(1, 20_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (!uniqueObjectIds(value.technicianStaffIds)) {
      context.addIssue({
        code: 'custom',
        path: ['technicianStaffIds'],
        message:
          'Technician identifiers must be unique',
      });
    }

    if (value.contrastAdministered) {
      if (
        value.contrastProductReference == null ||
        value.contrastQuantity == null ||
        value.contrastUnitCode == null
      ) {
        context.addIssue({
          code: 'custom',
          path: ['contrastProductReference'],
          message:
            'Contrast administration requires product, quantity, and unit references',
        });
      }
    } else if (
      value.contrastProductReference != null ||
      value.contrastQuantity != null ||
      value.contrastUnitCode != null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['contrastAdministered'],
        message:
          'Non-contrast examinations cannot include contrast-use details',
      });
    }
  });

const externalStudyReferenceSchema = z
  .object({
    systemType: z.enum(
      radiologyExternalSystemTypeValues,
    ),
    systemName: z
      .string()
      .trim()
      .min(1)
      .max(300),
    endpointAlias: z
      .string()
      .trim()
      .min(1)
      .max(200),
    externalStudyId: z
      .string()
      .trim()
      .min(1)
      .max(500),
    viewerReference: nullableText(1, 2_000),
  })
  .strict();

const imagingSeriesSchema = z
  .object({
    seriesInstanceUid: dicomUidSchema,
    seriesNumber: z
      .number()
      .int()
      .min(0)
      .max(1_000_000),
    modalityCode: z
      .string()
      .trim()
      .min(1)
      .max(80),
    bodyRegionCode: nullableText(1, 80),
    laterality: z
      .enum(radiologyLateralityValues)
      .default('NOT_APPLICABLE'),
    description: nullableText(1, 5_000),
    protocolName: nullableText(1, 2_000),
    instanceCount: z
      .number()
      .int()
      .min(0)
      .max(10_000_000),
    externalSeriesId: nullableText(1, 500),
    storageReference: nullableText(1, 2_000),
  })
  .strict();

export const registerRadiologyImagingStudyBodySchema = z
  .object({
    orderItemId: radiologyObjectIdSchema,
    expectedOrderItemVersion:
      radiologyExpectedVersionSchema,
    expectedExaminationVersion:
      radiologyExpectedVersionSchema,
    studyInstanceUid: dicomUidSchema,
    studyDateTime: radiologyIsoDateTimeSchema,
    status: z.enum(
      radiologyImagingStudyStatusValues,
    ),
    externalReferences: z
      .array(externalStudyReferenceSchema)
      .min(1)
      .max(20),
    series: z
      .array(imagingSeriesSchema)
      .min(1)
      .max(10_000),
  })
  .strict()
  .superRefine((value, context) => {
    const seriesUids = value.series.map(
      (series) => series.seriesInstanceUid,
    );

    const seriesNumbers = value.series.map(
      (series) => series.seriesNumber,
    );

    if (
      new Set(seriesUids).size !==
      seriesUids.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['series'],
        message:
          'Series Instance UIDs must be unique within a study',
      });
    }

    if (
      new Set(seriesNumbers).size !==
      seriesNumbers.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['series'],
        message:
          'Series numbers must be unique within a study',
      });
    }

    const externalKeys =
      value.externalReferences.map((reference) =>
        [
          reference.systemType,
          reference.endpointAlias.toLowerCase(),
          reference.externalStudyId,
        ].join(':'),
      );

    if (
      new Set(externalKeys).size !==
      externalKeys.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['externalReferences'],
        message:
          'External imaging references must be unique',
      });
    }
  });

export const radiologyOperationsQuerySchema = z
  .object({
    scheduledFrom:
      radiologyIsoDateTimeSchema.optional(),
    scheduledTo:
      radiologyIsoDateTimeSchema.optional(),
    departmentId:
      radiologyObjectIdSchema.optional(),
    modalityId:
      radiologyObjectIdSchema.optional(),
    resourceId:
      radiologyObjectIdSchema.optional(),
    technicianStaffId:
      radiologyObjectIdSchema.optional(),
    appointmentStatus: z
      .enum(radiologyAppointmentStatusValues)
      .optional(),
  })
  .strict();