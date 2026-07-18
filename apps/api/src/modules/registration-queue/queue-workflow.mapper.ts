import type {
  OpdVisitRecord,
  QueueStatusHistoryRecord,
  QueueTokenRecord,
} from './registration-queue.types.js';

export interface QueueEntryMutationResult {
  queue: {
    id: string;
    queueEntryId: string;
    opdVisitId: string;
    patientId: string;
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
    calledAt: string | null;
    servingAt: string | null;
    skippedAt: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
    noShowAt: string | null;
    skipCount: number;
    recallCount: number;
    transferCount: number;
    lastStatusChangedAt: string;
    version: number;
  };

  visit: {
    id: string;
    visitNumber: string;
    status: OpdVisitRecord['status'];
    assignedProviderId: string | null;
    assignedCounterId: string | null;
    currentQueueTokenId: string | null;
    queuedAt: string | null;
    serviceStartedAt: string | null;
    completedAt: string | null;
    noShowAt: string | null;
    version: number;
  } | null;

  history: {
    id: string;
    sequence: number;
    fromStatus: QueueStatusHistoryRecord['fromStatus'];
    toStatus: QueueStatusHistoryRecord['toStatus'];
    occurredAt: string;
  } | null;
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

export function toQueueEntryMutationResult(
  input: Readonly<{
    queueToken: QueueTokenRecord;
    visit?: OpdVisitRecord | null;
    history?: QueueStatusHistoryRecord | null;
  }>,
): QueueEntryMutationResult {
  return {
    queue: {
      id:
        input.queueToken._id.toHexString(),

      queueEntryId:
        input.queueToken.queueEntryId,

      opdVisitId:
        input.queueToken.opdVisitId.toHexString(),

      patientId:
        input.queueToken.patientId.toHexString(),

      queueDefinitionId:
        input.queueToken.queueDefinitionId.toHexString(),

      serviceDate:
        input.queueToken.serviceDate,

      tokenNumber:
        input.queueToken.tokenNumber,

      tokenLabel:
        input.queueToken.tokenLabel,

      status:
        input.queueToken.status,

      priorityClass:
        input.queueToken.priorityClass,

      priorityScore:
        input.queueToken.priorityScore,

      triagePriority:
        input.queueToken.triagePriority,

      emergencyOverride:
        input.queueToken.emergencyOverride,

      specialCategories: [
        ...input.queueToken.specialCategories,
      ],

      assignedProviderId:
        objectIdString(
          input.queueToken.assignedProviderId,
        ),

      assignedCounterId:
        objectIdString(
          input.queueToken.assignedCounterId,
        ),

      queuedAt:
        input.queueToken.queuedAt.toISOString(),

      calledAt:
        dateString(
          input.queueToken.calledAt,
        ),

      servingAt:
        dateString(
          input.queueToken.servingAt,
        ),

      skippedAt:
        dateString(
          input.queueToken.skippedAt,
        ),

      completedAt:
        dateString(
          input.queueToken.completedAt,
        ),

      cancelledAt:
        dateString(
          input.queueToken.cancelledAt,
        ),

      noShowAt:
        dateString(
          input.queueToken.noShowAt,
        ),

      skipCount:
        input.queueToken.skipCount,

      recallCount:
        input.queueToken.recallCount,

      transferCount:
        input.queueToken.transferCount,

      lastStatusChangedAt:
        input.queueToken.lastStatusChangedAt.toISOString(),

      version:
        input.queueToken.version,
    },

    visit:
      input.visit ===
        undefined ||
      input.visit ===
        null
        ? null
        : {
            id:
              input.visit._id.toHexString(),

            visitNumber:
              input.visit.visitNumber,

            status:
              input.visit.status,

            assignedProviderId:
              objectIdString(
                input.visit.assignedProviderId,
              ),

            assignedCounterId:
              objectIdString(
                input.visit.assignedCounterId,
              ),

            currentQueueTokenId:
              objectIdString(
                input.visit.currentQueueTokenId,
              ),

            queuedAt:
              dateString(
                input.visit.queuedAt,
              ),

            serviceStartedAt:
              dateString(
                input.visit.serviceStartedAt,
              ),

            completedAt:
              dateString(
                input.visit.completedAt,
              ),

            noShowAt:
              dateString(
                input.visit.noShowAt,
              ),

            version:
              input.visit.version,
          },

    history:
      input.history ===
        undefined ||
      input.history ===
        null
        ? null
        : {
            id:
              input.history._id.toHexString(),

            sequence:
              input.history.sequence,

            fromStatus:
              input.history.fromStatus,

            toStatus:
              input.history.toStatus,

            occurredAt:
              input.history.occurredAt.toISOString(),
          },
  };
}