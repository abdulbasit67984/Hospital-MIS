import {
  z,
} from 'zod';

import type {
  RadiologyCommunicationChannel,
  RadiologyCommunicationRecipientType,
  RadiologyCriticalFindingCommunication,
  RadiologyCriticalFindingCommunicationType,
  RadiologyReport,
  RadiologyReportPublicationStatus,
  RadiologyReportUrgency,
  RadiologyReportVersion,
  RadiologyReportVersionChangeType,
} from '@hospital-mis/database';

import {
  radiologyCommunicationChannelValues,
  radiologyCommunicationRecipientTypeValues,
  radiologyCriticalFindingCommunicationTypeValues,
  radiologyReportPublicationStatusValues,
  radiologyReportUrgencyValues,
} from '@hospital-mis/database';

import type {
  RadiologyActorContext,
} from './radiology.types.js';

import type {
  RadiologyEncryptedSnapshot,
} from './radiology.ports.js';

import {
  radiologyExpectedVersionSchema,
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

const reportTextSchema = z.object({
  urgency:
    z
      .enum(
        radiologyReportUrgencyValues,
      )
      .default('ROUTINE'),

  clinicalHistory:
    nullableText(
      1,
      50_000,
    ),

  comparisonStudyReferences:
    z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(2_000),
      )
      .max(100)
      .default([]),

  findings:
    z
      .string()
      .trim()
      .min(3)
      .max(250_000),

  impression:
    z
      .string()
      .trim()
      .min(3)
      .max(100_000),

  recommendations:
    nullableText(
      1,
      50_000,
    ),

  attachmentIds:
    z
      .array(
        radiologyObjectIdSchema,
      )
      .max(100)
      .default([]),
});

export const radiologyCriticalFindingInputSchema =
  z
    .object({
      findingCode:
        z
          .string()
          .trim()
          .min(1)
          .max(100),

      title:
        z
          .string()
          .trim()
          .min(2)
          .max(500),

      description:
        z
          .string()
          .trim()
          .min(3)
          .max(20_000),

      urgency:
        z.enum([
          'URGENT',
          'CRITICAL',
        ]),

      recommendation:
        nullableText(
          1,
          10_000,
        ),
    })
    .strict();

export const assignRadiologyReportBodySchema =
  z
    .object({
      orderItemId:
        radiologyObjectIdSchema,

      expectedOrderItemVersion:
        radiologyExpectedVersionSchema,

      radiologistStaffId:
        radiologyObjectIdSchema,
    })
    .strict();

export const saveRadiologyReportDraftBodySchema =
  reportTextSchema
    .extend({
      expectedReportVersion:
        radiologyExpectedVersionSchema,

      criticalFindings:
        z
          .array(
            radiologyCriticalFindingInputSchema,
          )
          .max(100)
          .default([]),
    })
    .strict()
    .superRefine(
      (
        value,
        context,
      ) => {
        const codes =
          value.criticalFindings.map(
            (finding) =>
              finding.findingCode
                .trim()
                .toUpperCase(),
          );

        if (
          new Set(
            codes,
          ).size !==
          codes.length
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'criticalFindings',
            ],

            message:
              'Critical-finding codes must be unique within a report',
          });
        }
      },
    );

export const submitRadiologyPreliminaryBodySchema =
  saveRadiologyReportDraftBodySchema;

export const finalizeRadiologyReportBodySchema =
  saveRadiologyReportDraftBodySchema;

export const correctRadiologyReportBodySchema =
  reportTextSchema
    .extend({
      expectedReportVersion:
        radiologyExpectedVersionSchema,

      reason:
        radiologyReasonSchema,

      criticalFindings:
        z
          .array(
            radiologyCriticalFindingInputSchema,
          )
          .max(100)
          .default([]),
    })
    .strict();

export const addRadiologyReportAddendumBodySchema =
  z
    .object({
      expectedReportVersion:
        radiologyExpectedVersionSchema,

      reason:
        radiologyReasonSchema,

      addendumText:
        z
          .string()
          .trim()
          .min(3)
          .max(100_000),

      attachmentIds:
        z
          .array(
            radiologyObjectIdSchema,
          )
          .max(100)
          .default([]),
    })
    .strict();

export const changeRadiologyReportPublicationBodySchema =
  z
    .object({
      expectedReportVersion:
        radiologyExpectedVersionSchema,

      publicationStatus:
        z.enum(
          radiologyReportPublicationStatusValues,
        ),

      reason:
        radiologyReasonSchema.optional(),
    })
    .strict()
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value.publicationStatus ===
            'WITHDRAWN' &&
          value.reason === undefined
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'reason',
            ],

            message:
              'Report withdrawal requires a documented reason',
          });
        }

        if (
          value.publicationStatus !==
            'WITHDRAWN' &&
          value.reason !== undefined
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'reason',
            ],

            message:
              'A withdrawal reason is only valid for WITHDRAWN status',
          });
        }
      },
    );

export const recordRadiologyCriticalCommunicationBodySchema =
  z
    .object({
      expectedReportVersion:
        radiologyExpectedVersionSchema,

      findingCode:
        z
          .string()
          .trim()
          .min(1)
          .max(100),

      communicationType:
        z.enum(
          radiologyCriticalFindingCommunicationTypeValues,
        ),

      channel:
        z.enum(
          radiologyCommunicationChannelValues,
        ),

      recipientType:
        z.enum(
          radiologyCommunicationRecipientTypeValues,
        ),

      recipientUserId:
        radiologyObjectIdSchema
          .nullable()
          .optional(),

      recipientStaffId:
        radiologyObjectIdSchema
          .nullable()
          .optional(),

      recipientDisplay:
        z
          .string()
          .trim()
          .min(1)
          .max(500),

      notes:
        nullableText(
          1,
          5_000,
        ),
    })
    .strict()
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value.communicationType ===
          'ACKNOWLEDGED'
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'communicationType',
            ],

            message:
              'Use the dedicated acknowledgement command for critical-finding acknowledgement',
          });
        }

        if (
          value.recipientUserId != null &&
          value.recipientStaffId != null
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'recipientUserId',
            ],

            message:
              'Specify at most one internal recipient principal',
          });
        }
      },
    );

export const acknowledgeRadiologyCriticalCommunicationBodySchema =
  z
    .object({
      expectedReportVersion:
        radiologyExpectedVersionSchema,

      communicationId:
        radiologyObjectIdSchema,

      notes:
        nullableText(
          1,
          5_000,
        ),
    })
    .strict();

export const renderRadiologyReportBodySchema =
  z
    .object({
      expectedReportVersion:
        radiologyExpectedVersionSchema,
    })
    .strict();

export interface RadiologyCriticalFindingInput {
  findingCode: string;
  title: string;
  description: string;
  urgency:
    | 'URGENT'
    | 'CRITICAL';
  recommendation?:
    | string
    | null;
}

export interface AssignRadiologyReportInput {
  orderItemId: string;
  expectedOrderItemVersion: number;
  radiologistStaffId: string;
}

export interface SaveRadiologyReportDraftInput {
  expectedReportVersion: number;
  urgency: RadiologyReportUrgency;
  clinicalHistory?:
    | string
    | null;
  comparisonStudyReferences:
    readonly string[];
  findings: string;
  impression: string;
  recommendations?:
    | string
    | null;
  criticalFindings:
    readonly RadiologyCriticalFindingInput[];
  attachmentIds:
    readonly string[];
}

export type SubmitRadiologyPreliminaryInput =
  SaveRadiologyReportDraftInput;

export type FinalizeRadiologyReportInput =
  SaveRadiologyReportDraftInput;

export interface CorrectRadiologyReportInput
  extends SaveRadiologyReportDraftInput {
  reason: string;
}

export interface AddRadiologyReportAddendumInput {
  expectedReportVersion: number;
  reason: string;
  addendumText: string;
  attachmentIds:
    readonly string[];
}

export interface ChangeRadiologyReportPublicationInput {
  expectedReportVersion: number;
  publicationStatus:
    RadiologyReportPublicationStatus;
  reason?: string;
}

export interface RecordRadiologyCriticalCommunicationInput {
  expectedReportVersion: number;
  findingCode: string;
  communicationType:
    Exclude<
      RadiologyCriticalFindingCommunicationType,
      'ACKNOWLEDGED'
    >;
  channel:
    RadiologyCommunicationChannel;
  recipientType:
    RadiologyCommunicationRecipientType;
  recipientUserId?:
    | string
    | null;
  recipientStaffId?:
    | string
    | null;
  recipientDisplay: string;
  notes?:
    | string
    | null;
}

export interface AcknowledgeRadiologyCriticalCommunicationInput {
  expectedReportVersion: number;
  communicationId: string;
  notes?:
    | string
    | null;
}

export interface RadiologyReportCommand<T> {
  actor:
    RadiologyActorContext;

  reportId:
    string;

  input:
    T;

  idempotencyKey:
    string;
}

export interface AssignRadiologyReportCommand {
  actor:
    RadiologyActorContext;

  input:
    AssignRadiologyReportInput;

  idempotencyKey:
    string;
}

export type RadiologyReportRecord =
  RadiologyReport & {
    _id: {
      toHexString(): string;
    };

    facilityId: {
      toHexString(): string;
    };

    radiologyOrderId: {
      toHexString(): string;
    };

    radiologyOrderItemId: {
      toHexString(): string;
    };

    imagingStudyId: {
      toHexString(): string;
    };

    examinationId: {
      toHexString(): string;
    };

    patientId: {
      toHexString(): string;
    };

    encounterId: {
      toHexString(): string;
    };

    procedureId: {
      toHexString(): string;
    };

    assignedRadiologistStaffId: {
      toHexString(): string;
    };

    assignedByStaffId: {
      toHexString(): string;
    };

    attachmentIds:
      Array<{
        toHexString(): string;
      }>;

    latestVersionId:
      | {
          toHexString(): string;
        }
      | null;

    finalRadiologistStaffId:
      | {
          toHexString(): string;
        }
      | null;

    createdBy: {
      toHexString(): string;
    };

    updatedBy: {
      toHexString(): string;
    };

    createdAt:
      Date;

    updatedAt:
      Date;
  };

export type RadiologyReportVersionRecord =
  RadiologyReportVersion & {
    _id: {
      toHexString(): string;
    };

    facilityId: {
      toHexString(): string;
    };

    radiologyReportId: {
      toHexString(): string;
    };

    radiologyOrderId: {
      toHexString(): string;
    };

    radiologyOrderItemId: {
      toHexString(): string;
    };

    imagingStudyId: {
      toHexString(): string;
    };

    patientId: {
      toHexString(): string;
    };

    encounterId: {
      toHexString(): string;
    };

    previousVersionId:
      | {
          toHexString(): string;
        }
      | null;

    attachmentIdsSnapshot:
      Array<{
        toHexString(): string;
      }>;

    encryptedSnapshot:
      RadiologyEncryptedSnapshot;

    authorStaffId: {
      toHexString(): string;
    };

    finalRadiologistStaffId: {
      toHexString(): string;
    };

    createdAt:
      Date;

    updatedAt:
      Date;
  };

export type RadiologyCriticalFindingCommunicationRecord =
  RadiologyCriticalFindingCommunication & {
    _id: {
      toHexString(): string;
    };

    facilityId: {
      toHexString(): string;
    };

    radiologyReportId: {
      toHexString(): string;
    };

    radiologyReportVersionId: {
      toHexString(): string;
    };

    radiologyOrderId: {
      toHexString(): string;
    };

    patientId: {
      toHexString(): string;
    };

    encounterId: {
      toHexString(): string;
    };

    acknowledgesCommunicationId:
      | {
          toHexString(): string;
        }
      | null;

    createdAt:
      Date;

    updatedAt:
      Date;
  };

export interface RadiologyFinalReportSnapshot {
  schemaVersion:
    1;

  reportId:
    string;

  reportNumber:
    string;

  orderId:
    string;

  orderItemId:
    string;

  imagingStudyId:
    string;

  examinationId:
    string;

  patientId:
    string;

  encounterId:
    string;

  procedureId:
    string;

  procedureCode:
    string;

  procedureName:
    string;

  modalityCode:
    string;

  accessionNumber:
    string;

  studyInstanceUid:
    string;

  status:
    | 'FINAL'
    | 'CORRECTED'
    | 'ADDENDUM';

  urgency:
    RadiologyReportUrgency;

  versionNumber:
    number;

  clinicalHistory:
    | string
    | null;

  comparisonStudyReferences:
    string[];

  findings:
    string;

  impression:
    string;

  recommendations:
    | string
    | null;

  criticalFindings:
    Array<{
      findingCode:
        string;

      title:
        string;

      description:
        string;

      urgency:
        | 'URGENT'
        | 'CRITICAL';

      recommendation:
        | string
        | null;
    }>;

  attachmentIds:
    string[];

  authorStaffId:
    string;

  finalRadiologistStaffId:
    string;

  finalizedAt:
    string;

  correctionReason:
    | string
    | null;

  addendumText:
    | string
    | null;

  recordedAt:
    string;
}

export interface RadiologyReportRepositoryPort {
  findById(
    facilityId: string,
    reportId: string,
    includeSensitive?: boolean,
  ): Promise<
    | RadiologyReportRecord
    | null
  >;

  findByOrderItem(
    facilityId: string,
    orderItemId: string,
    includeSensitive?: boolean,
  ): Promise<
    | RadiologyReportRecord
    | null
  >;

  listPublishedByEncounter(
    facilityId: string,
    encounterId: string,
    page: number,
    pageSize: number,
  ): Promise<{
    items:
      RadiologyReportRecord[];

    total:
      number;
  }>;

  listPublishedByPatient(
    facilityId: string,
    patientId: string,
    page: number,
    pageSize: number,
  ): Promise<{
    items:
      RadiologyReportRecord[];

    total:
      number;
  }>;

  create(
    input:
      Record<string, unknown>,
  ): Promise<
    RadiologyReportRecord
  >;

  update(
    facilityId: string,
    reportId: string,
    expectedVersion: number,
    update:
      Record<string, unknown>,
  ): Promise<
    | RadiologyReportRecord
    | null
  >;

  appendVersion(
    input:
      Record<string, unknown>,
  ): Promise<
    RadiologyReportVersionRecord
  >;

  findVersionById(
    facilityId: string,
    versionId: string,
    includeEncrypted?: boolean,
  ): Promise<
    | RadiologyReportVersionRecord
    | null
  >;

  listVersions(
    facilityId: string,
    reportId: string,
  ): Promise<
    RadiologyReportVersionRecord[]
  >;

  appendCriticalCommunication(
    input:
      Record<string, unknown>,
  ): Promise<
    RadiologyCriticalFindingCommunicationRecord
  >;

  findCriticalCommunicationById(
    facilityId: string,
    communicationId: string,
  ): Promise<
    | RadiologyCriticalFindingCommunicationRecord
    | null
  >;

  listCriticalCommunications(
    facilityId: string,
    reportId: string,
  ): Promise<
    RadiologyCriticalFindingCommunicationRecord[]
  >;
}

export interface RadiologyReportingStaffPort {
  assertEligibleRadiologist(
    input: {
      facilityId:
        string;

      staffId:
        string;
    },
  ): Promise<void>;
}

export interface RadiologyReportAttachmentPort {
  assertUsable(
    input: {
      facilityId:
        string;

      attachmentIds:
        readonly string[];

      actorUserId:
        string;

      purpose:
        'RADIOLOGY_REPORT';
    },
  ): Promise<void>;
}

export interface RadiologyCriticalNotificationPort {
  notify(
    input: {
      facilityId:
        string;

      reportId:
        string;

      reportVersionId:
        string;

      patientId:
        string;

      encounterId:
        string;

      findingCode:
        string;

      urgency:
        | 'URGENT'
        | 'CRITICAL';

      recipientType:
        RadiologyCommunicationRecipientType;

      recipientUserId:
        | string
        | null;

      recipientStaffId:
        | string
        | null;

      channel:
        RadiologyCommunicationChannel;

      correlationId:
        string;

      transactionId:
        string;
    },
  ): Promise<void>;
}

export interface RadiologyReportDocument {
  mediaType:
    'application/pdf';

  filename:
    string;

  bytes:
    Uint8Array;

  contentHash:
    string;
}

export interface RadiologyReportRendererPort {
  renderFinalSnapshot(
    input: {
      snapshot:
        RadiologyFinalReportSnapshot;

      printedAt:
        Date;
    },
  ): Promise<
    RadiologyReportDocument
  >;
}

export interface RadiologyReportArtifactPort {
  storeGeneratedReport(
    input: {
      facilityId:
        string;

      reportId:
        string;

      reportVersionId:
        string;

      patientId:
        string;

      encounterId:
        string;

      mediaType:
        'application/pdf';

      filename:
        string;

      bytes:
        Uint8Array;

      contentHash:
        string;

      generatedBy:
        string;

      generatedAt:
        Date;

      correlationId:
        string;

      transactionId:
        string;
    },
  ): Promise<{
    artifactId:
      string;
  }>;
}

export interface RadiologyReportSummaryView {
  id:
    string;

  reportNumber:
    string;

  orderId:
    string;

  orderItemId:
    string;

  imagingStudyId:
    string;

  procedureCode:
    string;

  procedureName:
    string;

  modalityCode:
    string;

  status:
    string;

  urgency:
    string;

  publicationStatus:
    string;

  versionNumber:
    number;

  criticalFindingCount:
    number;

  finalizedAt:
    | string
    | null;

  publishedAt:
    | string
    | null;
}

export interface RadiologyReportVersionAppendInput {
  changeType:
    RadiologyReportVersionChangeType;

  changeReason:
    | string
    | null;

  snapshot:
    RadiologyFinalReportSnapshot;
}