import type {
  OpdVisitRecord,
  QueueStatusHistoryRecord,
  QueueTokenRecord,
  RegistrationRecord,
} from './registration-queue.types.js';

export interface QueueTransferMutationResult {
  sourceQueue: QueueLifecycleProjection;
  destinationQueue: QueueLifecycleProjection;
  visit: VisitLifecycleProjection;
  sourceHistory: QueueHistoryProjection;
  destinationHistory: QueueHistoryProjection;
}

export interface VisitLifecycleMutationResult {
  registration: RegistrationLifecycleProjection | null;
  visit: VisitLifecycleProjection;
  queue: QueueLifecycleProjection | null;
  history: QueueHistoryProjection | null;
}

export interface RegistrationLifecycleProjection {
  id: string;
  registrationNumber: string;
  patientId: string;
  status: RegistrationRecord['status'];
  serviceDate: string;
  cancelledAt: string | null;
  version: number;
}

export interface VisitLifecycleProjection {
  id: string;
  visitNumber: string;
  registrationId: string;
  patientId: string;
  status: OpdVisitRecord['status'];
  serviceDate: string;
  departmentId: string;
  clinicId: string | null;
  servicePointId: string | null;
  assignedProviderId: string | null;
  assignedCounterId: string | null;
  currentQueueTokenId: string | null;
  queuedAt: string | null;
  serviceStartedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  noShowAt: string | null;
  version: number;
}

export interface QueueLifecycleProjection {
  id: string;
  queueEntryId: string;
  opdVisitId: string;
  queueDefinitionId: string;
  serviceDate: string;
  tokenNumber: number;
  tokenLabel: string;
  status: QueueTokenRecord['status'];
  priorityClass: QueueTokenRecord['priorityClass'];
  priorityScore: number;
  triagePriority: QueueTokenRecord['triagePriority'];
  emergencyOverride: boolean;
  specialCategories: QueueTokenRecord['specialCategories'];
  assignedProviderId: string | null;
  assignedCounterId: string | null;
  queuedAt: string;
  transferredAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  noShowAt: string | null;
  transferredFromQueueTokenId: string | null;
  transferredToQueueTokenId: string | null;
  transferReason: QueueTokenRecord['transferReason'];
  transferCount: number;
  version: number;
}

export interface QueueHistoryProjection {
  id: string;
  sequence: number;
  fromStatus: QueueStatusHistoryRecord['fromStatus'];
  toStatus: QueueStatusHistoryRecord['toStatus'];
  queueDefinitionId: string;
  destinationQueueDefinitionId: string | null;
  occurredAt: string;
}

function objectIdString(
  value: {
    toHexString(): string;
  } | null,
): string | null {
  return value?.toHexString() ??
    null;
}

function dateString(
  value: Date | null,
): string | null {
  return value?.toISOString() ??
    null;
}

export function toRegistrationLifecycleProjection(
  record: RegistrationRecord,
): RegistrationLifecycleProjection {
  return {
    id:
      record._id.toHexString(),

    registrationNumber:
      record.registrationNumber,

    patientId:
      record.patientId.toHexString(),

    status:
      record.status,

    serviceDate:
      record.serviceDate,

    cancelledAt:
      dateString(
        record.cancelledAt,
      ),

    version:
      record.version,
  };
}

export function toVisitLifecycleProjection(
  record: OpdVisitRecord,
): VisitLifecycleProjection {
  return {
    id:
      record._id.toHexString(),

    visitNumber:
      record.visitNumber,

    registrationId:
      record.registrationId.toHexString(),

    patientId:
      record.patientId.toHexString(),

    status:
      record.status,

    serviceDate:
      record.serviceDate,

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

    noShowAt:
      dateString(
        record.noShowAt,
      ),

    version:
      record.version,
  };
}

export function toQueueLifecycleProjection(
  record: QueueTokenRecord,
): QueueLifecycleProjection {
  return {
    id:
      record._id.toHexString(),

    queueEntryId:
      record.queueEntryId,

    opdVisitId:
      record.opdVisitId.toHexString(),

    queueDefinitionId:
      record.queueDefinitionId.toHexString(),

    serviceDate:
      record.serviceDate,

    tokenNumber:
      record.tokenNumber,

    tokenLabel:
      record.tokenLabel,

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

    queuedAt:
      record.queuedAt.toISOString(),

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

    transferCount:
      record.transferCount,

    version:
      record.version,
  };
}

export function toQueueHistoryProjection(
  record: QueueStatusHistoryRecord,
): QueueHistoryProjection {
  return {
    id:
      record._id.toHexString(),

    sequence:
      record.sequence,

    fromStatus:
      record.fromStatus,

    toStatus:
      record.toStatus,

    queueDefinitionId:
      record.queueDefinitionId.toHexString(),

    destinationQueueDefinitionId:
      objectIdString(
        record.destinationQueueDefinitionId,
      ),

    occurredAt:
      record.occurredAt.toISOString(),
  };
}

export function toQueueTransferMutationResult(
  input: Readonly<{
    sourceQueue: QueueTokenRecord;
    destinationQueue: QueueTokenRecord;
    visit: OpdVisitRecord;
    sourceHistory: QueueStatusHistoryRecord;
    destinationHistory: QueueStatusHistoryRecord;
  }>,
): QueueTransferMutationResult {
  return {
    sourceQueue:
      toQueueLifecycleProjection(
        input.sourceQueue,
      ),

    destinationQueue:
      toQueueLifecycleProjection(
        input.destinationQueue,
      ),

    visit:
      toVisitLifecycleProjection(
        input.visit,
      ),

    sourceHistory:
      toQueueHistoryProjection(
        input.sourceHistory,
      ),

    destinationHistory:
      toQueueHistoryProjection(
        input.destinationHistory,
      ),
  };
}

export function toVisitLifecycleMutationResult(
  input: Readonly<{
    registration?: RegistrationRecord | null;
    visit: OpdVisitRecord;
    queue?: QueueTokenRecord | null;
    history?: QueueStatusHistoryRecord | null;
  }>,
): VisitLifecycleMutationResult {
  return {
    registration:
      input.registration ===
        undefined ||
      input.registration ===
        null
        ? null
        : toRegistrationLifecycleProjection(
            input.registration,
          ),

    visit:
      toVisitLifecycleProjection(
        input.visit,
      ),

    queue:
      input.queue ===
        undefined ||
      input.queue ===
        null
        ? null
        : toQueueLifecycleProjection(
            input.queue,
          ),

    history:
      input.history ===
        undefined ||
      input.history ===
        null
        ? null
        : toQueueHistoryProjection(
            input.history,
          ),
  };
}