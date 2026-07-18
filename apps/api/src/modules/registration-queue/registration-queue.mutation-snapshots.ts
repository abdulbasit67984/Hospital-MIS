import type {
  RegistrationQueueEncryptedSnapshot,
  RegistrationQueueMutationDependencies,
  RegistrationQueueSnapshotCryptoPort,
} from './registration-queue.ports.js';

import type {
  OpdVisitRecord,
  QueueTokenRecord,
  RegistrationRecord,
} from './registration-queue.types.js';

export interface RegistrationQueueEncryptedRestorePayload {
  entityId: string;
  expectedPostVersion: number;
  associatedData: string;
  encryptedSnapshot: RegistrationQueueEncryptedSnapshot;
  snapshotHash: string;
}

export interface RegistrationRestoreSnapshot {
  status: RegistrationRecord['status'];
  checkedInAt: string | null;
  departmentId: string;
  clinicId: string | null;
  servicePointId: string | null;
  assignedProviderId: string | null;
  registrationNotes: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  supersededByRegistrationId: string | null;
  correctionReason: string | null;
  version: number;
  updatedBy: string;
  updatedAt: string;
}

export interface QueueTokenRestoreSnapshot {
  queueDefinitionId: string;
  status: QueueTokenRecord['status'];
  priorityClass: QueueTokenRecord['priorityClass'];
  priorityScore: number;
  triagePriority: QueueTokenRecord['triagePriority'];
  emergencyOverride: boolean;
  emergencyOverrideReason: string | null;
  specialCategories: QueueTokenRecord['specialCategories'];
  assignedProviderId: string | null;
  assignedCounterId: string | null;
  activeEntryKey: string | null;
  calledAt: string | null;
  servingAt: string | null;
  skippedAt: string | null;
  transferredAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  noShowAt: string | null;
  skipCount: number;
  recallCount: number;
  transferCount: number;
  estimatedWaitMinutes: number | null;
  estimatedServiceAt: string | null;
  transferredFromQueueTokenId: string | null;
  transferredToQueueTokenId: string | null;
  transferReason: QueueTokenRecord['transferReason'];
  statusReason: string | null;
  lastStatusChangedAt: string;
  lastStatusChangedBy: string;
  version: number;
  updatedBy: string;
  updatedAt: string;
}

export interface OpdVisitQueueRestoreSnapshot {
  status: OpdVisitRecord['status'];
  departmentId: string;
  clinicId: string | null;
  servicePointId: string | null;
  assignedProviderId: string | null;
  assignedCounterId: string | null;
  currentQueueTokenId: string | null;
  activeVisitKey: string | null;
  checkedInAt: string | null;
  queuedAt: string | null;
  serviceStartedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  noShowAt: string | null;
  noShowMarkedBy: string | null;
  supersededByVisitId: string | null;
  correctionReason: string | null;
  version: number;
  updatedBy: string;
  updatedAt: string;
}

function dateString(
  value: Date | null,
): string | null {
  return value?.toISOString() ??
    null;
}

function objectIdString(
  value: {
    toHexString(): string;
  } | null,
): string | null {
  return value?.toHexString() ??
    null;
}

export function requireRegistrationQueueSnapshotCrypto(
  dependencies: RegistrationQueueMutationDependencies,
): RegistrationQueueSnapshotCryptoPort {
  if (
    dependencies.snapshotCrypto ===
    undefined
  ) {
    throw new Error(
      'Registration and queue compensation snapshot encryption is not configured',
    );
  }

  return dependencies.snapshotCrypto;
}

export function registrationRestoreSnapshot(
  record: RegistrationRecord,
): RegistrationRestoreSnapshot {
  return {
    status:
      record.status,

    checkedInAt:
      dateString(
        record.checkedInAt,
      ),

    departmentId:
      record.departmentId.toHexString(),

    clinicId:
      objectIdString(
        record.clinicId,
      ),

    servicePointId:
      objectIdString(
        record.servicePointId,
      ),

    assignedProviderId:
      objectIdString(
        record.assignedProviderId,
      ),

    registrationNotes:
      record.registrationNotes,

    cancelledAt:
      dateString(
        record.cancelledAt,
      ),

    cancelledBy:
      objectIdString(
        record.cancelledBy,
      ),

    cancellationReason:
      record.cancellationReason,

    supersededByRegistrationId:
      objectIdString(
        record.supersededByRegistrationId,
      ),

    correctionReason:
      record.correctionReason,

    version:
      record.version,

    updatedBy:
      record.updatedBy.toHexString(),

    updatedAt:
      record.updatedAt.toISOString(),
  };
}

export function queueTokenRestoreSnapshot(
  record: QueueTokenRecord,
): QueueTokenRestoreSnapshot {
  return {
    queueDefinitionId:
      record.queueDefinitionId.toHexString(),

    status:
      record.status,

    priorityClass:
      record.priorityClass,

    priorityScore:
      record.priorityScore,

    triagePriority:
      record.triagePriority,

    emergencyOverride:
      record.emergencyOverride,

    emergencyOverrideReason:
      record.emergencyOverrideReason,

    specialCategories: [
      ...record.specialCategories,
    ],

    assignedProviderId:
      objectIdString(
        record.assignedProviderId,
      ),

    assignedCounterId:
      objectIdString(
        record.assignedCounterId,
      ),

    activeEntryKey:
      record.activeEntryKey,

    calledAt:
      dateString(
        record.calledAt,
      ),

    servingAt:
      dateString(
        record.servingAt,
      ),

    skippedAt:
      dateString(
        record.skippedAt,
      ),

    transferredAt:
      dateString(
        record.transferredAt,
      ),

    completedAt:
      dateString(
        record.completedAt,
      ),

    cancelledAt:
      dateString(
        record.cancelledAt,
      ),

    noShowAt:
      dateString(
        record.noShowAt,
      ),

    skipCount:
      record.skipCount,

    recallCount:
      record.recallCount,

    transferCount:
      record.transferCount,

    estimatedWaitMinutes:
      record.estimatedWaitMinutes,

    estimatedServiceAt:
      dateString(
        record.estimatedServiceAt,
      ),

    transferredFromQueueTokenId:
      objectIdString(
        record.transferredFromQueueTokenId,
      ),

    transferredToQueueTokenId:
      objectIdString(
        record.transferredToQueueTokenId,
      ),

    transferReason:
      record.transferReason,

    statusReason:
      record.statusReason,

    lastStatusChangedAt:
      record.lastStatusChangedAt.toISOString(),

    lastStatusChangedBy:
      record.lastStatusChangedBy.toHexString(),

    version:
      record.version,

    updatedBy:
      record.updatedBy.toHexString(),

    updatedAt:
      record.updatedAt.toISOString(),
  };
}

export function opdVisitQueueRestoreSnapshot(
  record: OpdVisitRecord,
): OpdVisitQueueRestoreSnapshot {
  return {
    status:
      record.status,

    departmentId:
      record.departmentId.toHexString(),

    clinicId:
      objectIdString(
        record.clinicId,
      ),

    servicePointId:
      objectIdString(
        record.servicePointId,
      ),

    assignedProviderId:
      objectIdString(
        record.assignedProviderId,
      ),

    assignedCounterId:
      objectIdString(
        record.assignedCounterId,
      ),

    currentQueueTokenId:
      objectIdString(
        record.currentQueueTokenId,
      ),

    activeVisitKey:
      record.activeVisitKey,

    checkedInAt:
      dateString(
        record.checkedInAt,
      ),

    queuedAt:
      dateString(
        record.queuedAt,
      ),

    serviceStartedAt:
      dateString(
        record.serviceStartedAt,
      ),

    completedAt:
      dateString(
        record.completedAt,
      ),

    cancelledAt:
      dateString(
        record.cancelledAt,
      ),

    cancelledBy:
      objectIdString(
        record.cancelledBy,
      ),

    cancellationReason:
      record.cancellationReason,

    noShowAt:
      dateString(
        record.noShowAt,
      ),

    noShowMarkedBy:
      objectIdString(
        record.noShowMarkedBy,
      ),

    supersededByVisitId:
      objectIdString(
        record.supersededByVisitId,
      ),

    correctionReason:
      record.correctionReason,

    version:
      record.version,

    updatedBy:
      record.updatedBy.toHexString(),

    updatedAt:
      record.updatedAt.toISOString(),
  };
}

export function protectedRegistrationQueueRestorePayload(
  input: Readonly<{
    crypto: RegistrationQueueSnapshotCryptoPort;
    transactionId: string;
    entityType:
      | 'registration'
      | 'queue-entry'
      | 'opd-visit';
    entityId: string;
    expectedPostVersion: number;
    snapshot: unknown;
  }>,
): RegistrationQueueEncryptedRestorePayload {
  const associatedData = [
    'hospital-mis',
    'registration-queue-compensation',
    input.transactionId,
    input.entityType,
    input.entityId,
    String(
      input.expectedPostVersion,
    ),
  ].join(
    ':',
  );

  const protectedSnapshot =
    input.crypto.protect(
      input.snapshot,
      associatedData,
    );

  return {
    entityId:
      input.entityId,

    expectedPostVersion:
      input.expectedPostVersion,

    associatedData,

    encryptedSnapshot:
      protectedSnapshot.encryptedValue,

    snapshotHash:
      protectedSnapshot.valueHash,
  };
}