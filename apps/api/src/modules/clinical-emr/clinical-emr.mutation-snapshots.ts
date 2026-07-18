import type {
  OpdVisitRecord,
  QueueTokenRecord,
} from '../registration-queue/registration-queue.types.js';

import {
  opdVisitQueueRestoreSnapshot,
  queueTokenRestoreSnapshot,
} from '../registration-queue/registration-queue.mutation-snapshots.js';

import type {
  ClinicalEmrSnapshotCryptoPort,
  ClinicalEmrTransactionCompensation,
} from './clinical-emr.ports.js';

import {
  CLINICAL_EMR_COMPENSATION_TYPES,
  type ClinicalEmrCompensatableCollection,
} from './clinical-emr.transaction.constants.js';

import type {
  ClinicalNoteRecord,
  EncounterDiagnosisRecord,
  EncounterRecord,
  PatientAllergyRecord,
  PatientProblemRecord,
} from './clinical-emr.types.js';

export interface ClinicalEmrRestorePayload {
  collection: ClinicalEmrCompensatableCollection;
  entityId: string;
  expectedPostVersion: number;
  associatedData: string;
  encryptedSnapshot: ReturnType<
    ClinicalEmrSnapshotCryptoPort['protect']
  >['encryptedValue'];
  snapshotHash: string;
}

interface RestoreSnapshot {
  version: number;
  updatedBy: string;
  updatedAt: string;
  values: Record<string, unknown>;
}

function dateString(
  value: Date | null,
): string | null {
  return value?.toISOString() ?? null;
}

function idString(
  value: { toHexString(): string } | null,
): string | null {
  return value?.toHexString() ?? null;
}

export function encounterRestoreSnapshot(
  record: EncounterRecord,
): RestoreSnapshot {
  return {
    version: record.version,
    updatedBy: record.updatedBy.toHexString(),
    updatedAt: record.updatedAt.toISOString(),
    values: {
      status: record.status,
      primaryProviderId: record.primaryProviderId.toHexString(),
      currentOwnerId: record.currentOwnerId.toHexString(),
      currentOwnerRole: record.currentOwnerRole,
      assignedProviderIds: record.assignedProviderIds.map(
        (providerId) => providerId.toHexString(),
      ),
      confidentiality: record.confidentiality,
      restrictionReason: record.restrictionReason,
      activeContextKey:
        record.status === 'CREATED' ||
        record.status === 'IN_PROGRESS' ||
        record.status === 'ON_HOLD'
          ? record.opdVisitId === null
            ? null
            : `opd:${record.opdVisitId.toHexString()}`
          : null,
      lastClinicalActivityAt: record.lastClinicalActivityAt.toISOString(),
      completedAt: dateString(record.completedAt),
      signedAt: dateString(record.signedAt),
      signedBy: idString(record.signedBy),
      signatureDigest: record.signatureDigest,
      closedAt: dateString(record.closedAt),
      closedBy: idString(record.closedBy),
      cancelledAt: dateString(record.cancelledAt),
      cancelledBy: idString(record.cancelledBy),
      cancellationReason: record.cancellationReason,
      supersededByEncounterId: idString(record.supersededByEncounterId),
      correctionReason: record.correctionReason,
      amendmentCount: record.amendmentCount,
      latestClinicalNoteId: idString(record.latestClinicalNoteId),
      latestDiagnosisAt: dateString(record.latestDiagnosisAt),
    },
  };
}

export function clinicalNoteRestoreSnapshot(
  record: ClinicalNoteRecord,
): RestoreSnapshot {
  return {
    version: record.version,
    updatedBy: record.updatedBy.toHexString(),
    updatedAt: record.updatedAt.toISOString(),
    values: {
      title: record.title,
      narrativeText: record.narrativeText,
      structuredData: record.structuredData,
      status: record.status,
      confidentiality: record.confidentiality,
      restrictionReason: record.restrictionReason,
      currentVersion: record.currentVersion,
      latestVersionId: idString(record.latestVersionId),
      finalizedAt: dateString(record.finalizedAt),
      finalizedBy: idString(record.finalizedBy),
      signedAt: dateString(record.signedAt),
      signedBy: idString(record.signedBy),
      signatureMethod: record.signatureMethod,
      signatureDigest: record.signatureDigest,
      amendedAt: dateString(record.amendedAt),
      amendedBy: idString(record.amendedBy),
      amendmentReason: record.amendmentReason,
      correctedAt: dateString(record.correctedAt),
      correctedBy: idString(record.correctedBy),
      correctionReason: record.correctionReason,
      enteredInErrorAt: dateString(record.enteredInErrorAt),
      enteredInErrorBy: idString(record.enteredInErrorBy),
      enteredInErrorReason: record.enteredInErrorReason,
      supersededByNoteId: idString(record.supersededByNoteId),
    },
  };
}



export function encounterDiagnosisRestoreSnapshot(
  record: EncounterDiagnosisRecord,
): RestoreSnapshot {
  return {
    version: record.version,
    updatedBy: record.updatedBy.toHexString(),
    updatedAt: record.updatedAt.toISOString(),
    values: {
      status: record.status,
      activeDiagnosisKey: record.activeDiagnosisKey,
      resolvedAt: dateString(record.resolvedAt),
      verifiedAt: dateString(record.verifiedAt),
      verifiedBy: idString(record.verifiedBy),
      statusReason: record.statusReason,
      supersededByEncounterDiagnosisId: idString(
        record.supersededByEncounterDiagnosisId,
      ),
    },
  };
}

export function patientProblemRestoreSnapshot(
  record: PatientProblemRecord,
): RestoreSnapshot {
  return {
    version: record.version,
    updatedBy: record.updatedBy.toHexString(),
    updatedAt: record.updatedAt.toISOString(),
    values: {
      status: record.status,
      activeProblemKey: record.activeProblemKey,
      onsetDate: record.onsetDate,
      resolvedAt: dateString(record.resolvedAt),
      summary: record.summary,
      currentVersion: record.currentVersion,
      latestVersionId: idString(record.latestVersionId),
      statusReason: record.statusReason,
      supersededByProblemId: idString(record.supersededByProblemId),
    },
  };
}

export function patientAllergyRestoreSnapshot(
  record: PatientAllergyRecord,
): RestoreSnapshot {
  return {
    version: record.version,
    updatedBy: record.updatedBy.toHexString(),
    updatedAt: record.updatedAt.toISOString(),
    values: {
      status: record.status,
      activeAllergyKey: record.activeAllergyKey,
      verificationStatus: record.verificationStatus,
      severity: record.severity,
      reactions: record.reactions.map((reaction) => ({
        manifestation: reaction.manifestation,
        severity: reaction.severity,
        occurredAt: reaction.occurredAt ?? null,
        notes: reaction.notes ?? null,
      })),
      onsetDate: record.onsetDate,
      lastReactionAt: dateString(record.lastReactionAt),
      notes: record.notes,
      currentVersion: record.currentVersion,
      latestVersionId: idString(record.latestVersionId),
      verifiedAt: dateString(record.verifiedAt),
      verifiedBy: idString(record.verifiedBy),
      statusReason: record.statusReason,
      supersededByPatientAllergyId: idString(
        record.supersededByPatientAllergyId,
      ),
    },
  };
}

export function protectedClinicalEmrRestorePayload(
  input: Readonly<{
    collection: ClinicalEmrCompensatableCollection;
    entityId: string;
    expectedPostVersion: number;
    snapshot: RestoreSnapshot;
    transactionId: string;
    snapshotCrypto: ClinicalEmrSnapshotCryptoPort;
  }>,
): ClinicalEmrRestorePayload {
  const associatedData = [
    'hospital-mis',
    'clinical-emr',
    'compensation',
    input.collection,
    input.entityId,
    input.transactionId,
  ].join(':');

  const protectedSnapshot = input.snapshotCrypto.protect(
    input.snapshot,
    associatedData,
  );

  return {
    collection: input.collection,
    entityId: input.entityId,
    expectedPostVersion: input.expectedPostVersion,
    associatedData,
    encryptedSnapshot: protectedSnapshot.encryptedValue,
    snapshotHash: protectedSnapshot.valueHash,
  };
}

export function deleteCreatedClinicalRecordCompensation(
  input: Readonly<{
    key: string;
    collection: ClinicalEmrCompensatableCollection;
    entityId: string;
    expectedVersion: number;
    transactionId: string;
  }>,
): ClinicalEmrTransactionCompensation {
  return {
    key: input.key,
    type: CLINICAL_EMR_COMPENSATION_TYPES.DELETE_CREATED_RECORD,
    payload: {
      collection: input.collection,
      entityId: input.entityId,
      expectedVersion: input.expectedVersion,
      transactionId: input.transactionId,
    },
  };
}

export function restoreClinicalRecordCompensation(
  key: string,
  payload: ClinicalEmrRestorePayload,
): ClinicalEmrTransactionCompensation {
  return {
    key,
    type: CLINICAL_EMR_COMPENSATION_TYPES.RESTORE_ENCRYPTED_RECORD,
    payload: {
      ...payload,
    },
  };
}

export function opdVisitRestoreSnapshot(
  record: OpdVisitRecord,
): RestoreSnapshot {
  const snapshot = opdVisitQueueRestoreSnapshot(record);
  const {
    version,
    updatedBy,
    updatedAt,
    ...values
  } = snapshot;

  return {
    version,
    updatedBy,
    updatedAt,
    values,
  };
}

export function queueTokenClinicalRestoreSnapshot(
  record: QueueTokenRecord,
): RestoreSnapshot {
  const snapshot = queueTokenRestoreSnapshot(record);
  const {
    version,
    updatedBy,
    updatedAt,
    ...values
  } = snapshot;

  return {
    version,
    updatedBy,
    updatedAt,
    values,
  };
}