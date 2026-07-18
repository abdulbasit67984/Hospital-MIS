import type {
  Db,
} from '@hospital-mis/database';

import {
  toObjectId,
} from '@hospital-mis/database';

import {
  ConflictError,
} from '@hospital-mis/shared';

import type {
  ClinicalEmrEncryptedSnapshot,
  ClinicalEmrSnapshotCryptoPort,
  ClinicalEmrTransactionCompensation,
} from '../modules/clinical-emr/clinical-emr.ports.js';

import {
  CLINICAL_EMR_COMPENSATABLE_COLLECTIONS,
  CLINICAL_EMR_COMPENSATION_TYPES,
  type ClinicalEmrCompensatableCollection,
} from '../modules/clinical-emr/clinical-emr.transaction.constants.js';

export interface ClinicalEmrCompensationExecutorPort {
  execute(
    compensation: ClinicalEmrTransactionCompensation,
  ): Promise<void>;
}

type JsonObject = Record<string, unknown>;

type RestoreSnapshot = {
  version: number;
  updatedBy: string;
  updatedAt: string;
  values: Record<string, unknown>;
};

const mutableFields: Readonly<
  Record<string, ReadonlySet<string>>
> = {
  encounters: new Set([
    'status',
    'primaryProviderId',
    'currentOwnerId',
    'currentOwnerRole',
    'assignedProviderIds',
    'confidentiality',
    'restrictionReason',
    'activeContextKey',
    'lastClinicalActivityAt',
    'completedAt',
    'signedAt',
    'signedBy',
    'signatureDigest',
    'closedAt',
    'closedBy',
    'cancelledAt',
    'cancelledBy',
    'cancellationReason',
    'supersededByEncounterId',
    'correctionReason',
    'amendmentCount',
    'latestClinicalNoteId',
    'latestDiagnosisAt',
  ]),
  clinicalNotes: new Set([
    'title',
    'narrativeText',
    'structuredData',
    'status',
    'confidentiality',
    'restrictionReason',
    'currentVersion',
    'latestVersionId',
    'finalizedAt',
    'finalizedBy',
    'signedAt',
    'signedBy',
    'signatureMethod',
    'signatureDigest',
    'amendedAt',
    'amendedBy',
    'amendmentReason',
    'correctedAt',
    'correctedBy',
    'correctionReason',
    'enteredInErrorAt',
    'enteredInErrorBy',
    'enteredInErrorReason',
    'supersededByNoteId',
  ]),
  encounterDiagnoses: new Set([
    'display',
    'role',
    'certainty',
    'status',
    'activeDiagnosisKey',
    'clinicalNoteId',
    'onsetDate',
    'resolvedAt',
    'isChronic',
    'presentOnAdmission',
    'evidence',
    'verifiedAt',
    'verifiedBy',
    'statusReason',
    'supersededByEncounterDiagnosisId',
  ]),
  patientProblems: new Set([
    'display',
    'status',
    'activeProblemKey',
    'onsetDate',
    'resolvedAt',
    'summary',
    'currentVersion',
    'latestVersionId',
    'statusReason',
    'supersededByProblemId',
  ]),
  opdVisits: new Set([
    'status',
    'departmentId',
    'clinicId',
    'servicePointId',
    'assignedProviderId',
    'assignedCounterId',
    'currentQueueTokenId',
    'activeVisitKey',
    'checkedInAt',
    'queuedAt',
    'serviceStartedAt',
    'completedAt',
    'cancelledAt',
    'cancelledBy',
    'cancellationReason',
    'noShowAt',
    'noShowMarkedBy',
    'supersededByVisitId',
    'correctionReason',
  ]),
  queueTokens: new Set([
    'queueDefinitionId',
    'status',
    'priorityClass',
    'priorityScore',
    'triagePriority',
    'emergencyOverride',
    'emergencyOverrideReason',
    'specialCategories',
    'assignedProviderId',
    'assignedCounterId',
    'activeEntryKey',
    'calledAt',
    'servingAt',
    'skippedAt',
    'transferredAt',
    'completedAt',
    'cancelledAt',
    'noShowAt',
    'skipCount',
    'recallCount',
    'transferCount',
    'estimatedWaitMinutes',
    'estimatedServiceAt',
    'transferredFromQueueTokenId',
    'transferredToQueueTokenId',
    'transferReason',
    'statusReason',
    'lastStatusChangedAt',
    'lastStatusChangedBy',
  ]),
  patientAllergies: new Set([
    'status',
    'verificationStatus',
    'severity',
    'reactions',
    'onsetDate',
    'lastReactionAt',
    'clinicalNoteId',
    'activeAllergyKey',
    'notes',
    'currentVersion',
    'latestVersionId',
    'verifiedAt',
    'verifiedBy',
    'statusReason',
    'supersededByPatientAllergyId',
  ]),
};

const objectIdFields = new Set([
  'primaryProviderId',
  'currentOwnerId',
  'signedBy',
  'closedBy',
  'cancelledBy',
  'supersededByEncounterId',
  'latestClinicalNoteId',
  'latestVersionId',
  'finalizedBy',
  'amendedBy',
  'correctedBy',
  'enteredInErrorBy',
  'supersededByNoteId',
  'clinicalNoteId',
  'verifiedBy',
  'supersededByEncounterDiagnosisId',
  'supersededByProblemId',
  'supersededByPatientAllergyId',
  'departmentId',
  'clinicId',
  'servicePointId',
  'assignedProviderId',
  'assignedCounterId',
  'currentQueueTokenId',
  'cancelledBy',
  'noShowMarkedBy',
  'supersededByVisitId',
  'queueDefinitionId',
  'lastStatusChangedBy',
  'transferredFromQueueTokenId',
  'transferredToQueueTokenId',
]);

const objectIdArrayFields = new Set([
  'assignedProviderIds',
]);

const dateFields = new Set([
  'lastClinicalActivityAt',
  'completedAt',
  'signedAt',
  'closedAt',
  'cancelledAt',
  'latestDiagnosisAt',
  'finalizedAt',
  'amendedAt',
  'correctedAt',
  'enteredInErrorAt',
  'resolvedAt',
  'verifiedAt',
  'lastReactionAt',
  'checkedInAt',
  'queuedAt',
  'serviceStartedAt',
  'completedAt',
  'cancelledAt',
  'noShowAt',
  'calledAt',
  'servingAt',
  'skippedAt',
  'transferredAt',
  'estimatedServiceAt',
  'lastStatusChangedAt',
]);

function asObject(
  value: unknown,
  fieldName: string,
): JsonObject {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new TypeError(`${fieldName} must be an object`);
  }

  return value as JsonObject;
}

function requiredString(
  object: JsonObject,
  fieldName: string,
): string {
  const value = object[fieldName];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }

  return value;
}

function requiredInteger(
  object: JsonObject,
  fieldName: string,
): number {
  const value = object[fieldName];

  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new TypeError(`${fieldName} must be a non-negative safe integer`);
  }

  return value;
}

function clinicalCollection(
  value: unknown,
): ClinicalEmrCompensatableCollection {
  if (
    typeof value !== 'string' ||
    !CLINICAL_EMR_COMPENSATABLE_COLLECTIONS.includes(
      value as ClinicalEmrCompensatableCollection,
    )
  ) {
    throw new TypeError('collection must be a supported clinical EMR collection');
  }

  return value as ClinicalEmrCompensatableCollection;
}

function encryptedSnapshot(
  value: unknown,
): ClinicalEmrEncryptedSnapshot {
  const object = asObject(value, 'encryptedSnapshot');
  const algorithm = requiredString(object, 'algorithm');

  if (algorithm !== 'AES-256-GCM') {
    throw new TypeError('encryptedSnapshot.algorithm is unsupported');
  }

  return {
    algorithm,
    keyVersion: requiredString(object, 'keyVersion'),
    initializationVector: requiredString(object, 'initializationVector'),
    authenticationTag: requiredString(object, 'authenticationTag'),
    ciphertext: requiredString(object, 'ciphertext'),
  };
}

function convertRestoreValue(
  field: string,
  value: unknown,
): unknown {
  if (value === null) {
    return null;
  }

  if (objectIdFields.has(field)) {
    if (typeof value !== 'string') {
      throw new TypeError(`${field} must be an ObjectId string or null`);
    }

    return toObjectId(value, field);
  }

  if (objectIdArrayFields.has(field)) {
    if (!Array.isArray(value)) {
      throw new TypeError(`${field} must be an array of ObjectId strings`);
    }

    return value.map((item, index) => {
      if (typeof item !== 'string') {
        throw new TypeError(`${field}.${index} must be an ObjectId string`);
      }

      return toObjectId(item, `${field}.${index}`);
    });
  }

  if (dateFields.has(field)) {
    if (typeof value !== 'string') {
      throw new TypeError(`${field} must be an ISO date-time string or null`);
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.valueOf())) {
      throw new TypeError(`${field} must be a valid ISO date-time string`);
    }

    return parsed;
  }

  return value;
}

export class ClinicalEmrCompensationExecutor
implements ClinicalEmrCompensationExecutorPort {
  public constructor(
    private readonly database: Db,
    private readonly crypto: ClinicalEmrSnapshotCryptoPort,
  ) {}

  public async execute(
    compensation: ClinicalEmrTransactionCompensation,
  ): Promise<void> {
    switch (compensation.type) {
      case CLINICAL_EMR_COMPENSATION_TYPES.DELETE_CREATED_RECORD:
        await this.deleteCreatedRecord(compensation.payload);
        return;

      case CLINICAL_EMR_COMPENSATION_TYPES.RESTORE_ENCRYPTED_RECORD:
        await this.restoreEncryptedRecord(compensation.payload);
        return;

      default:
        throw new Error(
          `Unsupported clinical EMR compensation type: ${compensation.type}`,
        );
    }
  }

  private async deleteCreatedRecord(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const object = asObject(payload, 'payload');
    const collectionName = clinicalCollection(object['collection']);
    const entityId = requiredString(object, 'entityId');
    const expectedVersion = requiredInteger(object, 'expectedVersion');
    const transactionId = requiredString(object, 'transactionId');
    const collection = this.database.collection(collectionName);

    const result = await collection.deleteOne({
      _id: toObjectId(entityId, 'entityId'),
      version: expectedVersion,
      transactionId,
    });

    if (result.deletedCount === 1) {
      return;
    }

    const existing = await collection.findOne({
      _id: toObjectId(entityId, 'entityId'),
    });

    if (existing === null) {
      return;
    }

    throw new ConflictError(
      `Created ${collectionName} record changed before compensation`,
    );
  }

  private async restoreEncryptedRecord(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const object = asObject(payload, 'payload');
    const collectionName = clinicalCollection(object['collection']);
    const allowed = mutableFields[collectionName];

    if (allowed === undefined) {
      throw new TypeError(
        `${collectionName} cannot be restored through mutable clinical compensation`,
      );
    }

    const entityId = requiredString(object, 'entityId');
    const expectedPostVersion = requiredInteger(
      object,
      'expectedPostVersion',
    );
    const associatedData = requiredString(object, 'associatedData');
    const snapshotHash = requiredString(object, 'snapshotHash');
    const encrypted = encryptedSnapshot(object['encryptedSnapshot']);

    const snapshot = this.crypto.unprotect<RestoreSnapshot>(
      encrypted,
      associatedData,
    );

    if (
      !this.crypto.matchesHash(
        snapshot,
        associatedData,
        snapshotHash,
      )
    ) {
      throw new ConflictError(
        'Clinical EMR compensation snapshot integrity check failed',
      );
    }

    if (
      !Number.isSafeInteger(snapshot.version) ||
      snapshot.version < 0 ||
      typeof snapshot.updatedBy !== 'string' ||
      typeof snapshot.updatedAt !== 'string' ||
      typeof snapshot.values !== 'object' ||
      snapshot.values === null ||
      Array.isArray(snapshot.values)
    ) {
      throw new TypeError('Clinical EMR restore snapshot is malformed');
    }

    const updateValues: Record<string, unknown> = {};

    for (const [field, value] of Object.entries(snapshot.values)) {
      if (!allowed.has(field)) {
        throw new TypeError(
          `${field} is not an allowed ${collectionName} compensation field`,
        );
      }

      updateValues[field] = convertRestoreValue(field, value);
    }

    const updatedAt = new Date(snapshot.updatedAt);

    if (Number.isNaN(updatedAt.valueOf())) {
      throw new TypeError('Clinical EMR restore snapshot updatedAt is invalid');
    }

    const result = await this.database.collection(collectionName).updateOne(
      {
        _id: toObjectId(entityId, 'entityId'),
        version: expectedPostVersion,
      },
      {
        $set: {
          ...updateValues,
          version: snapshot.version,
          updatedBy: toObjectId(snapshot.updatedBy, 'updatedBy'),
          updatedAt,
        },
      },
    );

    if (result.matchedCount === 1) {
      return;
    }

    const existing = await this.database.collection(collectionName).findOne({
      _id: toObjectId(entityId, 'entityId'),
      version: snapshot.version,
    });

    if (existing !== null) {
      return;
    }

    throw new ConflictError(
      `${collectionName} changed before encrypted compensation could restore it`,
    );
  }
}