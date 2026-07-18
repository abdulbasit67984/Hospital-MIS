import type {
  Request,
} from 'express';

import {
  z,
} from 'zod';

import {
  allergyCatalogStatusValues,
  allergyCategoryValues,
  clinicalConfidentialityValues,
  clinicalReferralPriorityValues,
  clinicalReferralStatusValues,
  clinicalReferralTypeValues,
  diagnosisCatalogStatusValues,
  diagnosisCodeSystemValues,
  encounterDiagnosisStatusValues,
  encounterTypeValues,
  patientAllergyStatusValues,
  patientProblemStatusValues,
  vitalSignBodyPositionValues,
  vitalSignSourceValues,
  vitalSignStatusValues,
  vitalSignTemperatureSiteValues,
} from '@hospital-mis/database';

import {
  BadRequestError,
  UnauthorizedError,
} from '@hospital-mis/shared';

import type {
  AuthorizationService,
} from '../authorization/authorization.service.js';

import type {
  AuthenticatedPrincipal,
} from '../auth/auth.types.js';

import type {
  ClinicalEmrActorContext,
} from './clinical-emr.types.js';

import {
  createPatientProblemBodySchema,
  recordEncounterDiagnosisBodySchema,
  recordPatientAllergyBodySchema,
} from './clinical-emr.validation.js';

const objectIdSchema =
  z
    .string()
    .regex(
      /^[a-f\d]{24}$/iu,
      'Expected a valid MongoDB ObjectId',
    );

const isoDateTimeSchema =
  z
    .string()
    .datetime({
      offset: true,
    });

const reasonSchema =
  z
    .string()
    .trim()
    .min(5)
    .max(5_000);

const idempotencyKeySchema =
  z
    .string()
    .trim()
    .min(8)
    .max(200)
    .regex(
      /^[A-Za-z0-9._:-]+$/u,
      'Use letters, numbers, periods, underscores, colons, or hyphens',
    );


const booleanQuerySchema =
  z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true');

const pageSchema =
  z.coerce.number().int().min(1).default(1);

const pageSizeSchema =
  z.coerce.number().int().min(1).max(100).default(25);

const nullableObjectIdSchema =
  objectIdSchema.nullable().optional();

const nullableText =
  (maximum: number) =>
    z
      .string()
      .trim()
      .max(maximum)
      .nullable()
      .optional();

export const clinicalEmrMutationHeadersSchema =
  z
    .object({
      'idempotency-key': idempotencyKeySchema,
      'x-break-glass-reason':
        z
          .string()
          .trim()
          .min(10)
          .max(1_000)
          .optional(),
    })
    .strict();

export const clinicalEntityParamsSchema =
  z
    .object({
      encounterId: objectIdSchema.optional(),
      clinicalNoteId: objectIdSchema.optional(),
      encounterDiagnosisId: objectIdSchema.optional(),
      patientProblemId: objectIdSchema.optional(),
      patientAllergyId: objectIdSchema.optional(),
      vitalSignId: objectIdSchema.optional(),
      referralNumber: z.string().trim().min(3).max(120).optional(),
      patientId: objectIdSchema.optional(),
      providerId: objectIdSchema.optional(),
    })
    .strict();

export const structuredEncounterSectionBodySchema =
  z
    .object({
      encounterId: objectIdSchema,
      authorProviderId: objectIdSchema,
      sectionKey: z.enum([
        'CHIEF_COMPLAINT',
        'HISTORY_OF_PRESENTING_ILLNESS',
        'PAST_MEDICAL_HISTORY',
        'PAST_SURGICAL_HISTORY',
        'FAMILY_HISTORY',
        'SOCIAL_HISTORY',
        'CURRENT_MEDICATIONS',
        'REVIEW_OF_SYSTEMS',
        'PHYSICAL_EXAMINATION',
        'ASSESSMENT',
        'PLAN',
        'PROCEDURES_AND_INTERVENTIONS',
        'FOLLOW_UP_INSTRUCTIONS',
      ]),
      narrativeText: nullableText(200_000),
      structuredData:
        z.record(z.string(), z.unknown()).nullable().optional(),
      confidentiality:
        z.enum(clinicalConfidentialityValues).optional(),
      restrictionReason: nullableText(1_000),
    })
    .strict()
    .refine(
      (value) =>
        value.narrativeText != null ||
        value.structuredData != null,
      {
        message:
          'A structured encounter section requires narrativeText, structuredData, or both',
      },
    );

const decimalStringSchema =
  z
    .string()
    .trim()
    .regex(
      /^\d{1,6}(?:\.\d{1,4})?$/u,
      'Expected a positive decimal string',
    )
    .nullable()
    .optional();

export const recordVitalSignsBodySchema =
  z
    .object({
      encounterId: objectIdSchema,
      sourceClinicalNoteId: nullableObjectIdSchema,
      measuredAt: isoDateTimeSchema,
      source: z.enum(vitalSignSourceValues).optional(),
      deviceIdentifier: nullableText(200),
      bodyPosition: z.enum(vitalSignBodyPositionValues).optional(),
      temperatureCelsius: decimalStringSchema,
      temperatureSite: z.enum(vitalSignTemperatureSiteValues).optional(),
      pulsePerMinute: z.number().int().min(1).max(400).nullable().optional(),
      respiratoryRatePerMinute:
        z.number().int().min(1).max(150).nullable().optional(),
      systolicBloodPressureMmHg:
        z.number().int().min(20).max(400).nullable().optional(),
      diastolicBloodPressureMmHg:
        z.number().int().min(10).max(250).nullable().optional(),
      oxygenSaturationPercent: decimalStringSchema,
      bloodGlucoseMgDl: decimalStringSchema,
      painScore: z.number().int().min(0).max(10).nullable().optional(),
      weightKg: decimalStringSchema,
      heightCm: decimalStringSchema,
      bmi: decimalStringSchema,
      oxygenDeliveryMethod: nullableText(200),
      oxygenFlowLitresPerMinute: decimalStringSchema,
      notes: nullableText(5_000),
      confidentiality:
        z.enum(clinicalConfidentialityValues).optional(),
      restrictionReason: nullableText(1_000),
    })
    .strict();

export const correctVitalSignsBodySchema =
  recordVitalSignsBodySchema
    .omit({
      encounterId: true,
    })
    .extend({
      expectedVersion: z.number().int().min(0),
      reason: reasonSchema,
    })
    .strict();

export const enterVitalSignsInErrorBodySchema =
  z
    .object({
      expectedVersion: z.number().int().min(0),
      reason: reasonSchema,
    })
    .strict();

const referralTargetSchema =
  z
    .object({
      facilityId: nullableObjectIdSchema,
      departmentId: nullableObjectIdSchema,
      clinicId: nullableObjectIdSchema,
      servicePointId: nullableObjectIdSchema,
      providerId: nullableObjectIdSchema,
      externalOrganization: nullableText(500),
      externalProviderName: nullableText(300),
    })
    .strict();


export const verifyEncounterDiagnosisBodySchema =
  z
    .object({
      expectedVersion: z.number().int().min(0),
    })
    .strict();

export const correctEncounterDiagnosisBodySchema =
  z
    .object({
      expectedVersion: z.number().int().min(0),
      reason: reasonSchema,
      replacement:
        recordEncounterDiagnosisBodySchema.omit({
          encounterId: true,
        }),
    })
    .strict();

export const correctPatientProblemBodySchema =
  z
    .object({
      expectedVersion: z.number().int().min(0),
      reason: reasonSchema,
      replacement:
        createPatientProblemBodySchema.omit({
          sourceEncounterId: true,
          sourceEncounterDiagnosisId: true,
        }),
    })
    .strict();

export const correctPatientAllergyBodySchema =
  z
    .object({
      expectedVersion: z.number().int().min(0),
      reason: reasonSchema,
      replacement:
        recordPatientAllergyBodySchema.omit({
          patientId: true,
          sourceEncounterId: true,
        }),
    })
    .strict();

export const createClinicalReferralBodySchema =
  z
    .object({
      patientId: objectIdSchema,
      sourceEncounterId: objectIdSchema,
      sourceClinicalNoteId: nullableObjectIdSchema,
      requestingProviderId: objectIdSchema,
      referralType: z.enum(clinicalReferralTypeValues),
      priority: z.enum(clinicalReferralPriorityValues).default('ROUTINE'),
      target: referralTargetSchema,
      reason: z.string().trim().min(3).max(10_000),
      clinicalQuestion: nullableText(10_000),
    })
    .strict();

export const transitionClinicalReferralBodySchema =
  z
    .object({
      expectedVersion: z.number().int().min(0),
      status: z.enum([
        'ACCEPTED',
        'IN_PROGRESS',
        'COMPLETED',
        'DECLINED',
        'CANCELLED',
      ]),
      assignedProviderId: nullableObjectIdSchema,
      responseSummary: nullableText(20_000),
      reason: nullableText(5_000),
    })
    .strict();

export const correctClinicalReferralBodySchema =
  z
    .object({
      expectedVersion: z.number().int().min(0),
      correctionReason: reasonSchema,
      replacement:
        createClinicalReferralBodySchema.omit({
          patientId: true,
          sourceEncounterId: true,
          requestingProviderId: true,
        }),
    })
    .strict();

export const diagnosisCatalogListQuerySchema =
  z
    .object({
      page: pageSchema,
      pageSize: pageSizeSchema,
      sortDirection: z.enum(['asc', 'desc']).default('asc'),
      search: z.string().trim().min(1).max(200).optional(),
      status: z.enum(diagnosisCatalogStatusValues).optional(),
      codeSystem: z.enum(diagnosisCodeSystemValues).optional(),
    })
    .strict();

export const allergyCatalogListQuerySchema =
  z
    .object({
      page: pageSchema,
      pageSize: pageSizeSchema,
      sortDirection: z.enum(['asc', 'desc']).default('asc'),
      search: z.string().trim().min(1).max(200).optional(),
      status: z.enum(allergyCatalogStatusValues).optional(),
      category: z.enum(allergyCategoryValues).optional(),
    })
    .strict();

export const encounterDiagnosisListQuerySchema =
  z
    .object({
      encounterId: objectIdSchema.optional(),
      patientId: objectIdSchema.optional(),
      status: z.enum(encounterDiagnosisStatusValues).optional(),
      page: pageSchema,
      pageSize: pageSizeSchema,
      sortDirection: z.enum(['asc', 'desc']).default('desc'),
    })
    .strict()
    .refine(
      (value) =>
        value.encounterId !== undefined ||
        value.patientId !== undefined,
      {
        message: 'encounterId or patientId is required',
      },
    );

export const patientProblemListQuerySchema =
  z
    .object({
      patientId: objectIdSchema,
      status: z.enum(patientProblemStatusValues).optional(),
      page: pageSchema,
      pageSize: pageSizeSchema,
      sortDirection: z.enum(['asc', 'desc']).default('desc'),
    })
    .strict();

export const patientAllergyListQuerySchema =
  z
    .object({
      patientId: objectIdSchema,
      status: z.enum(patientAllergyStatusValues).optional(),
      category: z.enum(allergyCategoryValues).optional(),
      page: pageSchema,
      pageSize: pageSizeSchema,
      sortDirection: z.enum(['asc', 'desc']).default('desc'),
    })
    .strict();

export const vitalSignListQuerySchema =
  z
    .object({
      encounterId: objectIdSchema.optional(),
      patientId: objectIdSchema.optional(),
      admissionId: objectIdSchema.optional(),
      status: z.enum(vitalSignStatusValues).optional(),
      measuredFrom: isoDateTimeSchema.optional(),
      measuredTo: isoDateTimeSchema.optional(),
      page: pageSchema,
      pageSize: pageSizeSchema,
      sortDirection: z.enum(['asc', 'desc']).default('desc'),
    })
    .strict()
    .refine(
      (value) =>
        value.encounterId !== undefined ||
        value.patientId !== undefined,
      {
        message: 'encounterId or patientId is required',
      },
    )
    .superRefine((value, context) => {
      if (
        value.measuredFrom !== undefined &&
        value.measuredTo !== undefined &&
        value.measuredFrom > value.measuredTo
      ) {
        context.addIssue({
          code: 'custom',
          path: ['measuredTo'],
          message: 'measuredTo cannot precede measuredFrom',
        });
      }
    });

export const clinicalReferralListQuerySchema =
  z
    .object({
      page: pageSchema,
      pageSize: pageSizeSchema,
      patientId: objectIdSchema.optional(),
      encounterId: objectIdSchema.optional(),
      assignedProviderId: objectIdSchema.optional(),
      departmentId: objectIdSchema.optional(),
      status: z.enum(clinicalReferralStatusValues).optional(),
      priority: z.enum(clinicalReferralPriorityValues).optional(),
      referralType: z.enum(clinicalReferralTypeValues).optional(),
      changedFrom: isoDateTimeSchema.optional(),
      changedTo: isoDateTimeSchema.optional(),
    })
    .strict();

export const clinicalPatientSummaryQuerySchema =
  z
    .object({
      encounterLimit: z.coerce.number().int().min(1).max(50).default(10),
      timelineLimit: z.coerce.number().int().min(1).max(100).default(50),
      includeEnteredInError: booleanQuerySchema,
    })
    .strict();

export const clinicalTimelineRouteQuerySchema =
  z
    .object({
      page: pageSchema,
      pageSize: pageSizeSchema,
      sortBy: z.enum(['occurredAt', 'createdAt']).default('occurredAt'),
      sortDirection: z.enum(['asc', 'desc']).default('desc'),
      dateFrom: isoDateTimeSchema.optional(),
      dateTo: isoDateTimeSchema.optional(),
      encounterType: z.enum(encounterTypeValues).optional(),
      includeEnteredInError: booleanQuerySchema,
    })
    .strict()
    .superRefine((value, context) => {
      if (
        value.dateFrom !== undefined &&
        value.dateTo !== undefined &&
        value.dateFrom > value.dateTo
      ) {
        context.addIssue({
          code: 'custom',
          path: ['dateTo'],
          message: 'dateTo cannot precede dateFrom',
        });
      }
    });

export const clinicalProviderWorklistQuerySchema =
  z
    .object({
      page: pageSchema,
      pageSize: pageSizeSchema,
      serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
      status: z.enum([
        'CREATED',
        'IN_PROGRESS',
        'ON_HOLD',
        'COMPLETED',
        'SIGNED',
        'CLOSED',
      ]).optional(),
    })
    .strict();

export type DiagnosisCatalogRouteQuery =
  z.infer<typeof diagnosisCatalogListQuerySchema>;

export type AllergyCatalogRouteQuery =
  z.infer<typeof allergyCatalogListQuerySchema>;

export type EncounterDiagnosisRouteQuery =
  z.infer<typeof encounterDiagnosisListQuerySchema>;

export type PatientProblemRouteQuery =
  z.infer<typeof patientProblemListQuerySchema>;

export type PatientAllergyRouteQuery =
  z.infer<typeof patientAllergyListQuerySchema>;

export type VitalSignRouteQuery =
  z.infer<typeof vitalSignListQuerySchema>;

export type ClinicalEmrValidatedLocation =
  | 'params'
  | 'query'
  | 'body'
  | 'headers';

export function validatedClinicalEmrPart<T>(
  request: Request,
  location: ClinicalEmrValidatedLocation,
): T {
  const value =
    request.validated[location];

  if (value === undefined) {
    throw new BadRequestError(
      `Validated request ${location} is unavailable`,
    );
  }

  return value as T;
}

export function requireClinicalEmrPrincipal(
  request: Request,
): AuthenticatedPrincipal {
  if (request.auth === undefined) {
    throw new UnauthorizedError();
  }

  return request.auth;
}

export async function clinicalEmrActorFromRequest(
  request: Request,
  authorization: AuthorizationService,
): Promise<ClinicalEmrActorContext> {
  const principal =
    requireClinicalEmrPrincipal(request);

  const permissions =
    await authorization.permissionsFor(principal);

  const headers =
    request.validated.headers as
      | {
          'idempotency-key'?: string;
          'x-break-glass-reason'?: string;
        }
      | undefined;
  const ipAddress = request.ip;
  const userAgent = request.header('user-agent');
  const rawBreakGlassReason =
    headers?.['x-break-glass-reason'] ??
    request.header('x-break-glass-reason');
  const breakGlassReason =
    rawBreakGlassReason === undefined
      ? undefined
      : z
          .string()
          .trim()
          .min(10)
          .max(1_000)
          .parse(rawBreakGlassReason);

  return {
    userId: principal.userId,
    facilityId: principal.facilityId,
    correlationId: request.correlationId,
    roleKeys: [],
    permissionKeys: [...permissions],
    ...(ipAddress.length === 0
      ? {}
      : {
          ipAddress,
        }),
    ...(userAgent === undefined
      ? {}
      : {
          userAgent,
        }),
    ...(breakGlassReason === undefined
      ? {}
      : {
          breakGlassReason,
        }),
  };
}

export function clinicalEmrIdempotencyKeyFromRequest(
  request: Request,
): string {
  const headers =
    validatedClinicalEmrPart<{
      'idempotency-key': string;
    }>(request, 'headers');

  return headers['idempotency-key'];
}

export type CreateClinicalReferralBody =
  z.infer<typeof createClinicalReferralBodySchema>;

export type TransitionClinicalReferralBody =
  z.infer<typeof transitionClinicalReferralBodySchema>;

export type CorrectClinicalReferralBody =
  z.infer<typeof correctClinicalReferralBodySchema>;

export type ClinicalReferralListQuery =
  z.infer<typeof clinicalReferralListQuerySchema>;

export type ClinicalTimelineRouteQuery =
  z.infer<typeof clinicalTimelineRouteQuerySchema>;