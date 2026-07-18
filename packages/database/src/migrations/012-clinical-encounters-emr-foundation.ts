import type {
  Db,
  IndexDescription,
} from 'mongodb';

import {
  jsonSchemaFor,
} from '../catalog/json-schema.js';

import {
  allergyCatalogStatusValues,
  allergyCategoryValues,
  allergySeverityValues,
  allergyVerificationStatusValues,
  clinicalConfidentialityValues,
  clinicalDocumentStatusValues,
  clinicalDocumentTypeValues,
  clinicalDocumentVersionChangeTypeValues,
  diagnosisCatalogStatusValues,
  diagnosisCertaintyValues,
  diagnosisCodeSystemValues,
  encounterCareContextValues,
  encounterDiagnosisRoleValues,
  encounterDiagnosisStatusValues,
  encounterOwnerRoleValues,
  encounterStatusChangeSourceValues,
  encounterStatusValues,
  encounterTypeValues,
  patientAllergyRecordTypeValues,
  patientAllergyStatusValues,
  patientProblemStatusValues,
  patientProblemVersionChangeTypeValues,
  providerSignatureMethodValues,
} from '../models/clinical-emr.types.js';

import {
  AllergyModel,
  PatientAllergyModel,
  PatientAllergyVersionModel,
} from '../models/allergy.model.js';

import {
  ClinicalNoteModel,
  ClinicalNoteVersionModel,
} from '../models/clinical-note.model.js';

import {
  DiagnosisModel,
  EncounterDiagnosisModel,
  PatientProblemModel,
  PatientProblemVersionModel,
} from '../models/diagnosis.model.js';

import {
  EncounterModel,
  EncounterStatusHistoryModel,
} from '../models/encounter.model.js';

import type {
  Migration,
} from './types.js';

export const clinicalEmrCollections = [
  'encounters',
  'encounterStatusHistories',
  'clinicalNotes',
  'clinicalNoteVersions',
  'diagnoses',
  'encounterDiagnoses',
  'patientProblems',
  'patientProblemVersions',
  'allergies',
  'patientAllergies',
  'patientAllergyVersions',
] as const;

type ClinicalEmrCollection =
  (typeof clinicalEmrCollections)[number];

const objectId = {
  bsonType:
    'objectId',
} as const;

const nullableObjectId = {
  bsonType: [
    'objectId',
    'null',
  ],
} as const;

const string = {
  bsonType:
    'string',
} as const;

const nullableString = {
  bsonType: [
    'string',
    'null',
  ],
} as const;

const date = {
  bsonType:
    'date',
} as const;

const nullableDate = {
  bsonType: [
    'date',
    'null',
  ],
} as const;

const number = {
  bsonType:
    'number',
} as const;

const boolean = {
  bsonType:
    'bool',
} as const;

const clinicalProperties:
  Record<
    ClinicalEmrCollection,
    Record<string, unknown>
  > = {
    encounters: {
      encounterNumber:
        string,

      patientId:
        objectId,

      requestedPatientId:
        objectId,

      canonicalRedirected:
        boolean,

      registrationId:
        nullableObjectId,

      opdVisitId:
        nullableObjectId,

      queueTokenId:
        nullableObjectId,

      emergencyCaseId:
        nullableObjectId,

      admissionId:
        nullableObjectId,

      referralId:
        nullableObjectId,

      encounterType: {
        bsonType:
          'string',

        enum: [
          ...encounterTypeValues,
        ],
      },

      careContext: {
        bsonType:
          'string',

        enum: [
          ...encounterCareContextValues,
        ],
      },

      status: {
        bsonType:
          'string',

        enum: [
          ...encounterStatusValues,
        ],
      },

      serviceDate:
        string,

      departmentId:
        objectId,

      clinicId:
        nullableObjectId,

      servicePointId:
        nullableObjectId,

      primaryProviderId:
        objectId,

      currentOwnerId:
        objectId,

      currentOwnerRole: {
        bsonType:
          'string',

        enum: [
          ...encounterOwnerRoleValues,
        ],
      },

      assignedProviderIds: {
        bsonType:
          'array',

        items:
          objectId,
      },

      confidentiality: {
        bsonType:
          'string',

        enum: [
          ...clinicalConfidentialityValues,
        ],
      },

      restrictionReason:
        nullableString,

      activeContextKey:
        nullableString,

      startedAt:
        date,

      lastClinicalActivityAt:
        date,

      completedAt:
        nullableDate,

      signedAt:
        nullableDate,

      signedBy:
        nullableObjectId,

      signatureDigest:
        nullableString,

      closedAt:
        nullableDate,

      closedBy:
        nullableObjectId,

      cancelledAt:
        nullableDate,

      cancelledBy:
        nullableObjectId,

      cancellationReason:
        nullableString,

      supersedesEncounterId:
        nullableObjectId,

      supersededByEncounterId:
        nullableObjectId,

      correctionReason:
        nullableString,

      amendmentCount:
        number,

      latestClinicalNoteId:
        nullableObjectId,

      latestDiagnosisAt:
        nullableDate,

      transactionId:
        string,

      correlationId:
        string,

      createdBy:
        objectId,

      updatedBy:
        objectId,
    },

    encounterStatusHistories: {
      encounterId:
        objectId,

      patientId:
        objectId,

      sequence:
        number,

      fromStatus: {
        bsonType: [
          'string',
          'null',
        ],

        enum: [
          ...encounterStatusValues,
          null,
        ],
      },

      toStatus: {
        bsonType:
          'string',

        enum: [
          ...encounterStatusValues,
        ],
      },

      previousOwnerId:
        nullableObjectId,

      newOwnerId:
        objectId,

      previousOwnerRole: {
        bsonType: [
          'string',
          'null',
        ],

        enum: [
          ...encounterOwnerRoleValues,
          null,
        ],
      },

      newOwnerRole: {
        bsonType:
          'string',

        enum: [
          ...encounterOwnerRoleValues,
        ],
      },

      changeSource: {
        bsonType:
          'string',

        enum: [
          ...encounterStatusChangeSourceValues,
        ],
      },

      reason:
        nullableString,

      occurredAt:
        date,

      changedBy:
        objectId,

      transactionId:
        string,

      correlationId:
        string,

      createdBy:
        objectId,

      updatedBy:
        objectId,
    },

    clinicalNotes: {
      noteNumber:
        string,

      encounterId:
        objectId,

      patientId:
        objectId,

      authorProviderId:
        objectId,

      documentType: {
        bsonType:
          'string',

        enum: [
          ...clinicalDocumentTypeValues,
        ],
      },

      title:
        nullableString,

      narrativeText:
        nullableString,

      structuredData:
        {},

      status: {
        bsonType:
          'string',

        enum: [
          ...clinicalDocumentStatusValues,
        ],
      },

      confidentiality: {
        bsonType:
          'string',

        enum: [
          ...clinicalConfidentialityValues,
        ],
      },

      restrictionReason:
        nullableString,

      currentVersion:
        number,

      latestVersionId:
        nullableObjectId,

      finalizedAt:
        nullableDate,

      finalizedBy:
        nullableObjectId,

      signedAt:
        nullableDate,

      signedBy:
        nullableObjectId,

      signatureMethod: {
        bsonType: [
          'string',
          'null',
        ],

        enum: [
          ...providerSignatureMethodValues,
          null,
        ],
      },

      signatureDigest:
        nullableString,

      amendedAt:
        nullableDate,

      amendedBy:
        nullableObjectId,

      amendmentReason:
        nullableString,

      correctedAt:
        nullableDate,

      correctedBy:
        nullableObjectId,

      correctionReason:
        nullableString,

      enteredInErrorAt:
        nullableDate,

      enteredInErrorBy:
        nullableObjectId,

      enteredInErrorReason:
        nullableString,

      addendumToNoteId:
        nullableObjectId,

      supersedesNoteId:
        nullableObjectId,

      supersededByNoteId:
        nullableObjectId,

      transactionId:
        string,

      correlationId:
        string,

      createdBy:
        objectId,

      updatedBy:
        objectId,
    },

    clinicalNoteVersions: {
      clinicalNoteId:
        objectId,

      encounterId:
        objectId,

      patientId:
        objectId,

      versionNumber:
        number,

      previousVersionId:
        nullableObjectId,

      changeType: {
        bsonType:
          'string',

        enum: [
          ...clinicalDocumentVersionChangeTypeValues,
        ],
      },

      statusSnapshot: {
        bsonType:
          'string',

        enum: [
          ...clinicalDocumentStatusValues,
        ],
      },

      documentTypeSnapshot: {
        bsonType:
          'string',

        enum: [
          ...clinicalDocumentTypeValues,
        ],
      },

      confidentialitySnapshot: {
        bsonType:
          'string',

        enum: [
          ...clinicalConfidentialityValues,
        ],
      },

      encryptedSnapshot: {
        bsonType:
          'object',
      },

      snapshotHash:
        string,

      contentHash:
        string,

      changeReason:
        nullableString,

      authorProviderId:
        objectId,

      signedBy:
        nullableObjectId,

      signatureMethod: {
        bsonType: [
          'string',
          'null',
        ],

        enum: [
          ...providerSignatureMethodValues,
          null,
        ],
      },

      signatureDigest:
        nullableString,

      recordedAt:
        date,

      recordedBy:
        objectId,

      transactionId:
        string,

      correlationId:
        string,

      createdBy:
        objectId,

      updatedBy:
        objectId,
    },

    diagnoses: {
      codeSystem: {
        bsonType:
          'string',

        enum: [
          ...diagnosisCodeSystemValues,
        ],
      },

      code:
        string,

      normalizedCode:
        string,

      display:
        string,

      normalizedDisplay:
        string,

      synonyms: {
        bsonType:
          'array',

        items:
          string,
      },

      description:
        nullableString,

      parentDiagnosisId:
        nullableObjectId,

      billable:
        boolean,

      status: {
        bsonType:
          'string',

        enum: [
          ...diagnosisCatalogStatusValues,
        ],
      },

      deactivatedAt:
        nullableDate,

      deactivatedBy:
        nullableObjectId,

      deactivationReason:
        nullableString,

      createdBy:
        objectId,

      updatedBy:
        objectId,
    },

    encounterDiagnoses: {
      encounterId:
        objectId,

      patientId:
        objectId,

      diagnosisId:
        nullableObjectId,

      codeSystem: {
        bsonType:
          'string',

        enum: [
          ...diagnosisCodeSystemValues,
        ],
      },

      code:
        string,

      normalizedCode:
        string,

      display:
        string,

      role: {
        bsonType:
          'string',

        enum: [
          ...encounterDiagnosisRoleValues,
        ],
      },

      certainty: {
        bsonType:
          'string',

        enum: [
          ...diagnosisCertaintyValues,
        ],
      },

      status: {
        bsonType:
          'string',

        enum: [
          ...encounterDiagnosisStatusValues,
        ],
      },

      activeDiagnosisKey:
        nullableString,

      clinicalNoteId:
        nullableObjectId,

      onsetDate:
        nullableString,

      resolvedAt:
        nullableDate,

      isChronic:
        boolean,

      presentOnAdmission: {
        bsonType: [
          'bool',
          'null',
        ],
      },

      evidence:
        nullableString,

      recordedAt:
        date,

      recordedBy:
        objectId,

      verifiedAt:
        nullableDate,

      verifiedBy:
        nullableObjectId,

      statusReason:
        nullableString,

      supersedesEncounterDiagnosisId:
        nullableObjectId,

      supersededByEncounterDiagnosisId:
        nullableObjectId,

      transactionId:
        string,

      correlationId:
        string,

      createdBy:
        objectId,

      updatedBy:
        objectId,
    },

    patientProblems: {
      problemNumber:
        string,

      patientId:
        objectId,

      diagnosisId:
        nullableObjectId,

      sourceEncounterId:
        objectId,

      sourceEncounterDiagnosisId:
        nullableObjectId,

      codeSystem: {
        bsonType:
          'string',

        enum: [
          ...diagnosisCodeSystemValues,
        ],
      },

      code:
        string,

      normalizedCode:
        string,

      display:
        string,

      status: {
        bsonType:
          'string',

        enum: [
          ...patientProblemStatusValues,
        ],
      },

      activeProblemKey:
        nullableString,

      onsetDate:
        nullableString,

      resolvedAt:
        nullableDate,

      summary:
        nullableString,

      currentVersion:
        number,

      latestVersionId:
        nullableObjectId,

      statusReason:
        nullableString,

      supersedesProblemId:
        nullableObjectId,

      supersededByProblemId:
        nullableObjectId,

      recordedAt:
        date,

      recordedBy:
        objectId,

      transactionId:
        string,

      correlationId:
        string,

      createdBy:
        objectId,

      updatedBy:
        objectId,
    },

    patientProblemVersions: {
      patientProblemId:
        objectId,

      patientId:
        objectId,

      versionNumber:
        number,

      previousVersionId:
        nullableObjectId,

      changeType: {
        bsonType:
          'string',

        enum: [
          ...patientProblemVersionChangeTypeValues,
        ],
      },

      statusSnapshot: {
        bsonType:
          'string',

        enum: [
          ...patientProblemStatusValues,
        ],
      },

      encryptedSnapshot: {
        bsonType:
          'object',
      },

      snapshotHash:
        string,

      changeReason:
        nullableString,

      recordedAt:
        date,

      recordedBy:
        objectId,

      transactionId:
        string,

      correlationId:
        string,

      createdBy:
        objectId,

      updatedBy:
        objectId,
    },

    allergies: {
      code:
        string,

      category: {
        bsonType:
          'string',

        enum: [
          ...allergyCategoryValues,
        ],
      },

      name:
        string,

      normalizedName:
        string,

      synonyms: {
        bsonType:
          'array',

        items:
          string,
      },

      description:
        nullableString,

      status: {
        bsonType:
          'string',

        enum: [
          ...allergyCatalogStatusValues,
        ],
      },

      deactivatedAt:
        nullableDate,

      deactivatedBy:
        nullableObjectId,

      deactivationReason:
        nullableString,

      createdBy:
        objectId,

      updatedBy:
        objectId,
    },

    patientAllergies: {
      patientId:
        objectId,

      recordType: {
        bsonType:
          'string',

        enum: [
          ...patientAllergyRecordTypeValues,
        ],
      },

      allergyId:
        nullableObjectId,

      category: {
        bsonType:
          'string',

        enum: [
          ...allergyCategoryValues,
        ],
      },

      allergenText:
        string,

      normalizedAllergenText:
        string,

      status: {
        bsonType:
          'string',

        enum: [
          ...patientAllergyStatusValues,
        ],
      },

      verificationStatus: {
        bsonType:
          'string',

        enum: [
          ...allergyVerificationStatusValues,
        ],
      },

      severity: {
        bsonType:
          'string',

        enum: [
          ...allergySeverityValues,
        ],
      },

      reactions: {
        bsonType:
          'array',
      },

      onsetDate:
        nullableString,

      lastReactionAt:
        nullableDate,

      notes:
        nullableString,

      clinicalNoteId:
        nullableObjectId,

      sourceEncounterId:
        nullableObjectId,

      activeAllergyKey:
        nullableString,

      currentVersion:
        number,

      latestVersionId:
        nullableObjectId,

      recordedAt:
        date,

      recordedBy:
        objectId,

      verifiedAt:
        nullableDate,

      verifiedBy:
        nullableObjectId,

      statusReason:
        nullableString,

      supersedesPatientAllergyId:
        nullableObjectId,

      supersededByPatientAllergyId:
        nullableObjectId,

      transactionId:
        string,

      correlationId:
        string,

      createdBy:
        objectId,

      updatedBy:
        objectId,
    },

    patientAllergyVersions: {
      patientAllergyId:
        objectId,

      patientId:
        objectId,

      versionNumber:
        number,

      previousVersionId:
        nullableObjectId,

      statusSnapshot: {
        bsonType:
          'string',

        enum: [
          ...patientAllergyStatusValues,
        ],
      },

      encryptedSnapshot: {
        bsonType:
          'object',
      },

      snapshotHash:
        string,

      changeReason:
        nullableString,

      recordedAt:
        date,

      recordedBy:
        objectId,

      transactionId:
        string,

      correlationId:
        string,

      createdBy:
        objectId,

      updatedBy:
        objectId,
    },
  };

const clinicalRequired:
  Record<
    ClinicalEmrCollection,
    readonly string[]
  > = {
    encounters: [
      'facilityId',
      'encounterNumber',
      'patientId',
      'requestedPatientId',
      'canonicalRedirected',
      'encounterType',
      'careContext',
      'status',
      'serviceDate',
      'departmentId',
      'primaryProviderId',
      'currentOwnerId',
      'currentOwnerRole',
      'assignedProviderIds',
      'confidentiality',
      'startedAt',
      'lastClinicalActivityAt',
      'amendmentCount',
      'transactionId',
      'correlationId',
      'createdBy',
      'updatedBy',
    ],

    encounterStatusHistories: [
      'facilityId',
      'encounterId',
      'patientId',
      'sequence',
      'toStatus',
      'newOwnerId',
      'newOwnerRole',
      'changeSource',
      'occurredAt',
      'changedBy',
      'transactionId',
      'correlationId',
      'createdBy',
      'updatedBy',
    ],

    clinicalNotes: [
      'facilityId',
      'noteNumber',
      'encounterId',
      'patientId',
      'authorProviderId',
      'documentType',
      'status',
      'confidentiality',
      'currentVersion',
      'transactionId',
      'correlationId',
      'createdBy',
      'updatedBy',
    ],

    clinicalNoteVersions: [
      'facilityId',
      'clinicalNoteId',
      'encounterId',
      'patientId',
      'versionNumber',
      'changeType',
      'statusSnapshot',
      'documentTypeSnapshot',
      'confidentialitySnapshot',
      'encryptedSnapshot',
      'snapshotHash',
      'contentHash',
      'authorProviderId',
      'recordedAt',
      'recordedBy',
      'transactionId',
      'correlationId',
      'createdBy',
      'updatedBy',
    ],

    diagnoses: [
      'facilityId',
      'codeSystem',
      'code',
      'normalizedCode',
      'display',
      'normalizedDisplay',
      'synonyms',
      'billable',
      'status',
      'createdBy',
      'updatedBy',
    ],

    encounterDiagnoses: [
      'facilityId',
      'encounterId',
      'patientId',
      'codeSystem',
      'code',
      'normalizedCode',
      'display',
      'role',
      'certainty',
      'status',
      'isChronic',
      'recordedAt',
      'recordedBy',
      'transactionId',
      'correlationId',
      'createdBy',
      'updatedBy',
    ],

    patientProblems: [
      'facilityId',
      'problemNumber',
      'patientId',
      'sourceEncounterId',
      'codeSystem',
      'code',
      'normalizedCode',
      'display',
      'status',
      'currentVersion',
      'recordedAt',
      'recordedBy',
      'transactionId',
      'correlationId',
      'createdBy',
      'updatedBy',
    ],

    patientProblemVersions: [
      'facilityId',
      'patientProblemId',
      'patientId',
      'versionNumber',
      'changeType',
      'statusSnapshot',
      'encryptedSnapshot',
      'snapshotHash',
      'recordedAt',
      'recordedBy',
      'transactionId',
      'correlationId',
      'createdBy',
      'updatedBy',
    ],

    allergies: [
      'facilityId',
      'code',
      'category',
      'name',
      'normalizedName',
      'synonyms',
      'status',
      'createdBy',
      'updatedBy',
    ],

    patientAllergies: [
      'facilityId',
      'patientId',
      'recordType',
      'category',
      'allergenText',
      'normalizedAllergenText',
      'status',
      'verificationStatus',
      'severity',
      'reactions',
      'currentVersion',
      'recordedAt',
      'recordedBy',
      'transactionId',
      'correlationId',
      'createdBy',
      'updatedBy',
    ],

    patientAllergyVersions: [
      'facilityId',
      'patientAllergyId',
      'patientId',
      'versionNumber',
      'statusSnapshot',
      'encryptedSnapshot',
      'snapshotHash',
      'recordedAt',
      'recordedBy',
      'transactionId',
      'correlationId',
      'createdBy',
      'updatedBy',
    ],
  };

export const clinicalEmrValidators =
  Object.fromEntries(
    clinicalEmrCollections.map(
      (name) => {
        const base =
          jsonSchemaFor(
            name,
          ) as {
            required?:
              readonly string[];

            properties?:
              Record<
                string,
                unknown
              >;

            [key: string]:
              unknown;
          };

        return [
          name,

          {
            $jsonSchema: {
              ...base,

              required: [
                'schemaVersion',
                'version',
                'createdAt',
                'updatedAt',
                ...clinicalRequired[
                  name
                ],
              ],

              properties: {
                ...(base.properties ??
                  {}),

                ...clinicalProperties[
                  name
                ],
              },
            },
          },
        ];
      },
    ),
  ) as Record<
    ClinicalEmrCollection,
    Record<string, unknown>
  >;

const modelIndexes:
  Record<
    ClinicalEmrCollection,
    readonly IndexDescription[]
  > = {
    encounters:
      EncounterModel.schema.indexes() as
        IndexDescription[],

    encounterStatusHistories:
      EncounterStatusHistoryModel.schema.indexes() as
        IndexDescription[],

    clinicalNotes:
      ClinicalNoteModel.schema.indexes() as
        IndexDescription[],

    clinicalNoteVersions:
      ClinicalNoteVersionModel.schema.indexes() as
        IndexDescription[],

    diagnoses:
      DiagnosisModel.schema.indexes() as
        IndexDescription[],

    encounterDiagnoses:
      EncounterDiagnosisModel.schema.indexes() as
        IndexDescription[],

    patientProblems:
      PatientProblemModel.schema.indexes() as
        IndexDescription[],

    patientProblemVersions:
      PatientProblemVersionModel.schema.indexes() as
        IndexDescription[],

    allergies:
      AllergyModel.schema.indexes() as
        IndexDescription[],

    patientAllergies:
      PatientAllergyModel.schema.indexes() as
        IndexDescription[],

    patientAllergyVersions:
      PatientAllergyVersionModel.schema.indexes() as
        IndexDescription[],
  };

async function ensureClinicalCollection(
  db: Db,
  name: ClinicalEmrCollection,
): Promise<void> {
  const existing =
    new Set(
      (
        await db
          .listCollections(
            {},
            {
              nameOnly:
                true,
            },
          )
          .toArray()
      ).map(
        (collection) =>
          collection.name,
      ),
    );

  if (
    !existing.has(
      name,
    )
  ) {
    await db.createCollection(
      name,
      {
        validator:
          clinicalEmrValidators[
            name
          ],

        validationLevel:
          'strict',

        validationAction:
          'error',
      },
    );
  } else {
    await db.command({
      collMod:
        name,

      validator:
        clinicalEmrValidators[
          name
        ],

      validationLevel:
        'strict',

      validationAction:
        'error',
    });
  }

  const collection =
    db.collection(
      name,
    );

  const indexes =
    await collection.indexes();

  for (
    const index of indexes
  ) {
    if (
      index.name !==
      '_id_'
    ) {
      await collection.dropIndex(
        index.name,
      );
    }
  }

  if (
    modelIndexes[
      name
    ].length > 0
  ) {
    await collection.createIndexes(
      modelIndexes[
        name
      ],
    );
  }
}

export const clinicalEncountersEmrFoundation:
  Migration = {
    id:
      '012-clinical-encounters-emr-foundation',

    description:
      'Create facility-safe clinical encounter, immutable clinical history, diagnosis, problem, and allergy persistence',

    async up(
      db,
    ) {
      for (
        const collection of
        clinicalEmrCollections
      ) {
        await ensureClinicalCollection(
          db,
          collection,
        );
      }
    },
  };