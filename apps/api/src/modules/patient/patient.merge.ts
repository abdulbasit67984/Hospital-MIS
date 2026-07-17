import {
  z,
} from 'zod';

import {
  patientMergeEvidenceCodeValues,
  type DatabaseObjectId,
  type PatientMergeEvidenceCode,
  type PatientMergeStatus,
  type PatientMergeStrategy,
} from '@hospital-mis/database';

import type {
  PatientStatus,
} from '@hospital-mis/database';

const objectIdSchema = z
  .string()
  .regex(
    /^[a-f\d]{24}$/iu,
    'Expected a valid MongoDB ObjectId',
  );

const reasonSchema = z
  .string()
  .trim()
  .min(10)
  .max(2_000);

export const duplicateReviewDecisionValues = [
  'CONFIRMED_NOT_DUPLICATE',
  'RETAIN_FOR_REVIEW',
] as const;

export type DuplicateReviewDecision =
  (typeof duplicateReviewDecisionValues)[number];

export const mergePatientsBodySchema = z
  .object({
    targetPatientId:
      objectIdSchema,

    expectedSourceVersion: z
      .number()
      .int()
      .min(0),

    expectedTargetVersion: z
      .number()
      .int()
      .min(0),

    evidenceCodes: z
      .array(
        z.enum(
          patientMergeEvidenceCodeValues,
        ),
      )
      .min(1)
      .max(20)
      .refine(
        (values) =>
          new Set(values).size ===
          values.length,
        {
          message:
            'Patient merge evidence codes must be unique',
        },
      ),

    reason:
      reasonSchema,

    acknowledgement: z.literal(
      'I_CONFIRM_PATIENT_MERGE',
    ),
  })
  .superRefine(
    (
      value,
      context,
    ) => {
      if (
        value.evidenceCodes.includes(
          'OTHER_DOCUMENTED_EVIDENCE',
        ) &&
        value.reason.length < 25
      ) {
        context.addIssue({
          code:
            'custom',

          path: [
            'reason',
          ],

          message:
            'Other documented evidence requires a more detailed merge reason',
        });
      }
    },
  );

export const resolveDuplicateReviewBodySchema =
  z.object({
    expectedVersion: z
      .number()
      .int()
      .min(0),

    decision: z.enum(
      duplicateReviewDecisionValues,
    ),

    reason:
      reasonSchema,
  });

export interface MergePatientsInput {
  targetPatientId: string;
  expectedSourceVersion: number;
  expectedTargetVersion: number;
  evidenceCodes: PatientMergeEvidenceCode[];
  reason: string;
  acknowledgement: 'I_CONFIRM_PATIENT_MERGE';
}

export interface ResolveDuplicateReviewInput {
  expectedVersion: number;
  decision: DuplicateReviewDecision;
  reason: string;
}

export interface PatientMergeRecord {
  _id: DatabaseObjectId;
  facilityId: DatabaseObjectId;
  mergeId: string;
  sourcePatientId: DatabaseObjectId;
  targetPatientId: DatabaseObjectId;
  sourceEnterprisePatientId: string;
  targetEnterprisePatientId: string;
  sourcePrimaryMrn: string;
  targetPrimaryMrn: string;
  evidenceCodes: PatientMergeEvidenceCode[];
  reason: string;
  strategy: PatientMergeStrategy;
  status: PatientMergeStatus;
  sourceStatusBefore: PatientStatus;
  targetStatusBefore: PatientStatus;
  sourceVersionBefore: number;
  sourceVersionAfter: number;
  targetVersionBefore: number;
  targetVersionAfter: number;
  mergedAt: Date;
  mergedBy: DatabaseObjectId;
  transactionId: string;
  correlationId: string;
  schemaVersion: number;
  version: number;
  createdBy: DatabaseObjectId;
  updatedBy: DatabaseObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface PatientMergeResultDto {
  mergeId: string;
  status: PatientMergeStatus;
  strategy: PatientMergeStrategy;

  source: {
    patientId: string;
    enterprisePatientId: string;
    mrn: string;
    status: 'MERGED';
    version: number;
  };

  target: {
    patientId: string;
    enterprisePatientId: string;
    mrn: string;
    status: PatientStatus;
    version: number;
  };

  evidenceCodes: PatientMergeEvidenceCode[];
  mergedAt: string;
}

export interface DuplicateReviewResolutionDto {
  patientId: string;
  facilityId: string;
  decision: DuplicateReviewDecision;
  duplicateReviewRequired: boolean;

  mergeState:
    | 'CANONICAL'
    | 'DUPLICATE_SUSPECTED';

  version: number;
  updatedAt: string;
}

export interface CanonicalPatientResolution {
  requestedPatientId: string;
  canonicalPatientId: string;
  canonicalEnterprisePatientId: string;
  canonicalStatus: PatientStatus;
  redirected: boolean;
  redirectPath: string[];
}

export type MergePatientsBody =
  z.infer<
    typeof mergePatientsBodySchema
  >;

export type ResolveDuplicateReviewBody =
  z.infer<
    typeof resolveDuplicateReviewBodySchema
  >;