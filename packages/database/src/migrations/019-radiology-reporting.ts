import type {
  Db,
  IndexDescription,
} from 'mongodb';

import {
  collectionSpecs,
  type HospitalCollectionName,
} from '../catalog/collection-specs.js';

import {
  RadiologyCriticalFindingCommunicationModel,
  RadiologyReportModel,
  RadiologyReportVersionModel,
  radiologyCommunicationChannelValues,
  radiologyCommunicationRecipientTypeValues,
  radiologyCriticalFindingCommunicationTypeValues,
  radiologyReportPublicationStatusValues,
  radiologyReportStatusValues,
  radiologyReportUrgencyValues,
  radiologyReportVersionChangeTypeValues,
} from '../models/radiology-report.model.js';

import type {
  Migration,
} from './types.js';

export const radiologyReportingCollections = [
  'radiologyReports',
  'radiologyReportVersions',
  'radiologyCriticalFindingCommunications',
] as const satisfies readonly HospitalCollectionName[];

type RadiologyReportingCollection =
  (typeof radiologyReportingCollections)[number];

const objectId = {
  bsonType: 'objectId',
} as const;

const nullableObjectId = {
  bsonType: [
    'objectId',
    'null',
  ],
} as const;

const string = {
  bsonType: 'string',
} as const;

const nullableString = {
  bsonType: [
    'string',
    'null',
  ],
} as const;

const date = {
  bsonType: 'date',
} as const;

const nullableDate = {
  bsonType: [
    'date',
    'null',
  ],
} as const;

const number = {
  bsonType: 'number',
} as const;

const commonProperties = {
  facilityId: objectId,
  transactionId: string,
  correlationId: string,
  schemaVersion: {
    ...number,
    minimum: 1,
  },
  version: {
    ...number,
    minimum: 0,
  },
  createdBy: objectId,
  updatedBy: objectId,
  createdAt: date,
  updatedAt: date,
} as const;

const commonRequired = [
  'facilityId',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
] as const;

function validator(
  required: readonly string[],
  properties: Record<string, unknown>,
): Record<string, unknown> {
  return {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        ...required,
        ...commonRequired,
      ],
      properties: {
        _id: objectId,
        ...properties,
        ...commonProperties,
      },
    },
  };
}

const encryptedSnapshot = {
  bsonType: 'object',
  required: [
    'algorithm',
    'keyVersion',
    'initializationVector',
    'authenticationTag',
    'ciphertext',
  ],
  additionalProperties: false,
  properties: {
    algorithm: {
      bsonType: 'string',
      enum: ['AES-256-GCM'],
    },
    keyVersion: string,
    initializationVector: string,
    authenticationTag: string,
    ciphertext: string,
  },
} as const;

const criticalFinding = {
  bsonType: 'object',
  required: [
    'findingCode',
    'title',
    'description',
    'urgency',
  ],
  additionalProperties: false,
  properties: {
    findingCode: string,
    title: string,
    description: string,
    urgency: {
      bsonType: 'string',
      enum: [
        'URGENT',
        'CRITICAL',
      ],
    },
    recommendation: nullableString,
  },
} as const;

export const radiologyReportingValidators: Readonly<
  Record<
    RadiologyReportingCollection,
    Record<string, unknown>
  >
> = {
  radiologyReports: validator(
    [
      'reportNumber',
      'radiologyOrderId',
      'radiologyOrderItemId',
      'imagingStudyId',
      'examinationId',
      'patientId',
      'encounterId',
      'procedureId',
      'procedureCodeSnapshot',
      'procedureNameSnapshot',
      'modalityCodeSnapshot',
      'accessionNumberSnapshot',
      'studyInstanceUidSnapshot',
      'assignedRadiologistStaffId',
      'assignedAt',
      'assignedByStaffId',
      'status',
      'urgency',
      'comparisonStudyReferences',
      'criticalFindings',
      'criticalFindingCount',
      'unresolvedCriticalFindingCount',
      'attachmentIds',
      'currentVersion',
      'addendumCount',
      'publicationStatus',
    ],
    {
      reportNumber: string,
      radiologyOrderId: objectId,
      radiologyOrderItemId: objectId,
      imagingStudyId: objectId,
      examinationId: objectId,
      patientId: objectId,
      encounterId: objectId,
      procedureId: objectId,
      procedureCodeSnapshot: string,
      procedureNameSnapshot: string,
      modalityCodeSnapshot: string,
      accessionNumberSnapshot: string,
      studyInstanceUidSnapshot: string,
      assignedRadiologistStaffId: objectId,
      assignedAt: date,
      assignedByStaffId: objectId,
      status: {
        bsonType: 'string',
        enum: [
          ...radiologyReportStatusValues,
        ],
      },
      urgency: {
        bsonType: 'string',
        enum: [
          ...radiologyReportUrgencyValues,
        ],
      },
      clinicalHistory: nullableString,
      comparisonStudyReferences: {
        bsonType: 'array',
        items: string,
      },
      findings: nullableString,
      impression: nullableString,
      recommendations: nullableString,
      criticalFindings: {
        bsonType: 'array',
        items: criticalFinding,
      },
      criticalFindingCount: {
        ...number,
        minimum: 0,
      },
      unresolvedCriticalFindingCount: {
        ...number,
        minimum: 0,
      },
      attachmentIds: {
        bsonType: 'array',
        items: objectId,
      },
      authoredAt: nullableDate,
      authoredBy: nullableObjectId,
      authorStaffId: nullableObjectId,
      preliminaryAt: nullableDate,
      preliminaryBy: nullableObjectId,
      preliminaryRadiologistStaffId:
        nullableObjectId,
      finalizedAt: nullableDate,
      finalizedBy: nullableObjectId,
      finalRadiologistStaffId: nullableObjectId,
      currentVersion: {
        ...number,
        minimum: 0,
      },
      latestVersionId: nullableObjectId,
      correctedAt: nullableDate,
      correctedBy: nullableObjectId,
      correctionReason: nullableString,
      supersedesReportVersionId: nullableObjectId,
      addendumCount: {
        ...number,
        minimum: 0,
      },
      latestAddendumAt: nullableDate,
      publicationStatus: {
        bsonType: 'string',
        enum: [
          ...radiologyReportPublicationStatusValues,
        ],
      },
      publishedAt: nullableDate,
      publishedBy: nullableObjectId,
      withdrawnAt: nullableDate,
      withdrawnBy: nullableObjectId,
      withdrawalReason: nullableString,
      latestRenderedArtifactId: nullableObjectId,
    },
  ),

  radiologyReportVersions: validator(
    [
      'radiologyReportId',
      'radiologyOrderId',
      'radiologyOrderItemId',
      'imagingStudyId',
      'patientId',
      'encounterId',
      'versionNumber',
      'changeType',
      'statusSnapshot',
      'urgencySnapshot',
      'criticalFindingCountSnapshot',
      'attachmentIdsSnapshot',
      'encryptedSnapshot',
      'snapshotHash',
      'contentHash',
      'authorStaffId',
      'finalRadiologistStaffId',
      'recordedAt',
      'recordedBy',
    ],
    {
      radiologyReportId: objectId,
      radiologyOrderId: objectId,
      radiologyOrderItemId: objectId,
      imagingStudyId: objectId,
      patientId: objectId,
      encounterId: objectId,
      versionNumber: {
        ...number,
        minimum: 1,
      },
      previousVersionId: nullableObjectId,
      changeType: {
        bsonType: 'string',
        enum: [
          ...radiologyReportVersionChangeTypeValues,
        ],
      },
      statusSnapshot: {
        bsonType: 'string',
        enum: [
          ...radiologyReportStatusValues,
        ],
      },
      urgencySnapshot: {
        bsonType: 'string',
        enum: [
          ...radiologyReportUrgencyValues,
        ],
      },
      criticalFindingCountSnapshot: {
        ...number,
        minimum: 0,
      },
      attachmentIdsSnapshot: {
        bsonType: 'array',
        items: objectId,
      },
      encryptedSnapshot,
      snapshotHash: string,
      contentHash: string,
      changeReason: nullableString,
      authorStaffId: objectId,
      finalRadiologistStaffId: objectId,
      recordedAt: date,
      recordedBy: objectId,
    },
  ),

  radiologyCriticalFindingCommunications:
    validator(
      [
        'radiologyReportId',
        'radiologyReportVersionId',
        'radiologyOrderId',
        'patientId',
        'encounterId',
        'sequence',
        'findingCodeSnapshot',
        'urgencySnapshot',
        'communicationType',
        'channel',
        'recipientType',
        'recipientDisplaySnapshot',
        'occurredAt',
        'performedByStaffId',
      ],
      {
        radiologyReportId: objectId,
        radiologyReportVersionId: objectId,
        radiologyOrderId: objectId,
        patientId: objectId,
        encounterId: objectId,
        sequence: {
          ...number,
          minimum: 1,
        },
        findingCodeSnapshot: string,
        urgencySnapshot: {
          bsonType: 'string',
          enum: [
            'URGENT',
            'CRITICAL',
          ],
        },
        communicationType: {
          bsonType: 'string',
          enum: [
            ...radiologyCriticalFindingCommunicationTypeValues,
          ],
        },
        channel: {
          bsonType: 'string',
          enum: [
            ...radiologyCommunicationChannelValues,
          ],
        },
        recipientType: {
          bsonType: 'string',
          enum: [
            ...radiologyCommunicationRecipientTypeValues,
          ],
        },
        recipientUserId: nullableObjectId,
        recipientStaffId: nullableObjectId,
        recipientDisplaySnapshot: string,
        communicationNotes: nullableString,
        acknowledgesCommunicationId:
          nullableObjectId,
        occurredAt: date,
        performedByStaffId: objectId,
      },
    ),
};

const models = {
  radiologyReports: RadiologyReportModel,
  radiologyReportVersions:
    RadiologyReportVersionModel,
  radiologyCriticalFindingCommunications:
    RadiologyCriticalFindingCommunicationModel,
} as const;

async function ensureCollection(
  database: Db,
  name: RadiologyReportingCollection,
): Promise<void> {
  const exists =
    (
      await database
        .listCollections(
          {
            name,
          },
          {
            nameOnly: true,
          },
        )
        .toArray()
    ).length > 0;

  const collectionValidator =
    radiologyReportingValidators[name];

  if (!exists) {
    await database.createCollection(name, {
      validator: collectionValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  } else {
    await database.command({
      collMod: name,
      validator: collectionValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  }

  const collection = database.collection(name);
  const existingIndexes =
    await collection.indexes();

  for (const index of existingIndexes) {
    if (index.name !== '_id_') {
      await collection.dropIndex(index.name);
    }
  }

  const indexes =
    models[name].schema.indexes() as IndexDescription[];

  if (indexes.length > 0) {
    await collection.createIndexes(indexes);
  }
}

export const radiologyReportingFoundation: Migration = {
  id: '019-radiology-reporting',
  description:
    'Create Radiology report projections, encrypted immutable report versions, and append-only critical-finding communications',

  async up(database) {
    for (
      const name of
      radiologyReportingCollections
    ) {
      const spec = collectionSpecs.find(
        (candidate) =>
          candidate.name === name,
      );

      const expectedRetention =
        name === 'radiologyReports'
          ? 'standard'
          : 'immutable';

      if (
        spec === undefined ||
        !spec.facilityScoped ||
        spec.domain !== 'radiology' ||
        spec.retention !== expectedRetention
      ) {
        throw new Error(
          `${name} must be cataloged as facility-scoped Radiology ${expectedRetention} data`,
        );
      }

      await ensureCollection(database, name);
    }
  },
};