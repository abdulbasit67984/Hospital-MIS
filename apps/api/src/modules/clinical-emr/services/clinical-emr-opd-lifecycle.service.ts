import {
  OpdVisitModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  ClinicalEncounterContextMismatchError,
  EncounterConcurrencyError,
} from '../clinical-emr.errors.js';

import {
  deleteCreatedClinicalRecordCompensation,
  opdVisitRestoreSnapshot,
  protectedClinicalEmrRestorePayload,
  queueTokenClinicalRestoreSnapshot,
  restoreClinicalRecordCompensation,
} from '../clinical-emr.mutation-snapshots.js';

import type {
  ClinicalEmrOpdLifecycleMutationInput,
  ClinicalEmrOpdLifecycleMutationResult,
  ClinicalEmrOpdLifecyclePort,
  ClinicalEmrSnapshotCryptoPort,
  ClinicalEmrTransactionContext,
} from '../clinical-emr.ports.js';

import {
  CLINICAL_EMR_TRANSACTION_STATES,
} from '../clinical-emr.transaction.constants.js';

import {
  newClinicalEmrObjectIdString,
} from '../clinical-emr.workflow-helpers.js';

import {
  OPD_VISIT_INTERNAL_SELECT,
} from '../../registration-queue/registration-queue.projections.js';

import type {
  OpdVisitRecord,
  QueueTokenRecord,
} from '../../registration-queue/registration-queue.types.js';

import {
  OpdVisitQueueMutationRepository,
} from '../../registration-queue/repositories/opd-visit-queue-mutation.repository.js';

import {
  OpdVisitRepository,
} from '../../registration-queue/repositories/opd-visit.repository.js';

import {
  QueueStatusHistoryRepository,
} from '../../registration-queue/repositories/queue-status-history.repository.js';

import {
  QueueTokenMutationRepository,
} from '../../registration-queue/repositories/queue-token-mutation.repository.js';

import {
  QueueTokenRepository,
} from '../../registration-queue/repositories/queue-token.repository.js';

function id(
  value: { toHexString(): string } | null,
): string | null {
  return value?.toHexString() ?? null;
}

function assertProviderAssignment(
  providerId: string,
  visit: OpdVisitRecord,
  queue: QueueTokenRecord | null,
): void {
  const visitProviderId = id(visit.assignedProviderId);
  const queueProviderId = queue === null
    ? null
    : id(queue.assignedProviderId);

  if (
    visitProviderId !== null &&
    visitProviderId !== providerId
  ) {
    throw new ClinicalEncounterContextMismatchError(
      'The OPD visit is assigned to another clinical provider',
    );
  }

  if (
    queueProviderId !== null &&
    queueProviderId !== providerId
  ) {
    throw new ClinicalEncounterContextMismatchError(
      'The queue entry is assigned to another clinical provider',
    );
  }
}

export class ClinicalEmrOpdLifecycleService
implements ClinicalEmrOpdLifecyclePort {
  public constructor(
    private readonly snapshotCrypto: ClinicalEmrSnapshotCryptoPort,
    private readonly visits: OpdVisitRepository = new OpdVisitRepository(),
    private readonly visitMutations: OpdVisitQueueMutationRepository =
      new OpdVisitQueueMutationRepository(),
    private readonly queueTokens: QueueTokenRepository =
      new QueueTokenRepository(),
    private readonly queueMutations: QueueTokenMutationRepository =
      new QueueTokenMutationRepository(),
    private readonly queueHistory: QueueStatusHistoryRepository =
      new QueueStatusHistoryRepository(),
  ) {}

  public async startConsultation(
    input: ClinicalEmrOpdLifecycleMutationInput,
    transaction: ClinicalEmrTransactionContext,
  ): Promise<ClinicalEmrOpdLifecycleMutationResult> {
    return this.synchronize(
      input,
      transaction,
      'SERVING',
    );
  }

  public async completeConsultation(
    input: ClinicalEmrOpdLifecycleMutationInput,
    transaction: ClinicalEmrTransactionContext,
  ): Promise<ClinicalEmrOpdLifecycleMutationResult> {
    return this.synchronize(
      input,
      transaction,
      'COMPLETED',
    );
  }

  private async synchronize(
    input: ClinicalEmrOpdLifecycleMutationInput,
    transaction: ClinicalEmrTransactionContext,
    targetQueueStatus: 'SERVING' | 'COMPLETED',
  ): Promise<ClinicalEmrOpdLifecycleMutationResult> {
    const visit = await this.visits.findById(
      input.facilityId,
      input.opdVisitId,
      true,
    );

    if (visit === null) {
      throw new ClinicalEncounterContextMismatchError(
        'The linked OPD visit was not found in the active facility',
      );
    }

    const queue = input.queueTokenId === null
      ? null
      : await this.queueTokens.findById(
          input.facilityId,
          input.queueTokenId,
          true,
        );

    if (input.queueTokenId !== null && queue === null) {
      throw new ClinicalEncounterContextMismatchError(
        'The linked queue entry was not found in the active facility',
      );
    }

    if (
      queue !== null &&
      (
        queue.opdVisitId.toHexString() !== input.opdVisitId ||
        visit.currentQueueTokenId?.toHexString() !== input.queueTokenId
      )
    ) {
      throw new ClinicalEncounterContextMismatchError(
        'The queue entry does not belong to the linked OPD visit',
      );
    }

    assertProviderAssignment(input.providerId, visit, queue);

    let updatedQueue = queue;

    if (
      queue !== null &&
      queue.status !== targetQueueStatus
    ) {
      const allowedQueueStatuses: readonly QueueTokenRecord['status'][] =
        targetQueueStatus === 'SERVING'
          ? ['WAITING', 'CALLED', 'SKIPPED']
          : ['SERVING'];

      if (!allowedQueueStatuses.includes(queue.status)) {
        throw new ClinicalEncounterContextMismatchError(
          `Queue status ${queue.status} cannot transition to ${targetQueueStatus} from a clinical encounter`,
        );
      }

      const queueRestore = protectedClinicalEmrRestorePayload({
        collection: 'queueTokens',
        entityId: queue._id.toHexString(),
        expectedPostVersion: queue.version + 1,
        snapshot: queueTokenClinicalRestoreSnapshot(queue),
        transactionId: input.transactionId,
        snapshotCrypto: this.snapshotCrypto,
      });

      updatedQueue = await this.queueMutations.transitionWithVersion({
        facilityId: input.facilityId,
        queueTokenId: queue._id.toHexString(),
        opdVisitId: input.opdVisitId,
        expectedVersion: queue.version,
        fromStatuses: [...allowedQueueStatuses],
        status: targetQueueStatus,
        assignedProviderId: input.providerId,
        assignedCounterId: id(queue.assignedCounterId),
        occurredAt: input.occurredAt,
        actorUserId: input.actorUserId,
        reason: null,
        incrementSkip: false,
        incrementRecall: false,
      });

      if (updatedQueue === null) {
        throw new EncounterConcurrencyError();
      }

      await transaction.registerCompensation(
        restoreClinicalRecordCompensation(
          `restore-queue-token:${queue._id.toHexString()}`,
          queueRestore,
        ),
      );

      const historyId = newClinicalEmrObjectIdString();
      const sequence = await this.queueHistory.nextSequence(
        input.facilityId,
        queue._id.toHexString(),
      );

      await this.queueHistory.append({
        historyId,
        facilityId: input.facilityId,
        queueTokenId: queue._id.toHexString(),
        queueEntryId: queue.queueEntryId,
        opdVisitId: input.opdVisitId,
        patientId: queue.patientId.toHexString(),
        sequence,
        fromStatus: queue.status,
        toStatus: targetQueueStatus,
        queueDefinitionId: queue.queueDefinitionId.toHexString(),
        providerId: id(queue.assignedProviderId),
        destinationProviderId: input.providerId,
        counterId: id(queue.assignedCounterId),
        destinationCounterId: id(queue.assignedCounterId),
        changeSource: 'PROVIDER',
        reason: null,
        occurredAt: input.occurredAt,
        changedBy: input.actorUserId,
        transactionId: input.transactionId,
        correlationId: input.correlationId,
      });

      await transaction.registerCompensation(
        deleteCreatedClinicalRecordCompensation({
          key: `delete-queue-history:${historyId}`,
          collection: 'queueStatusHistories',
          entityId: historyId,
          expectedVersion: 0,
          transactionId: input.transactionId,
        }),
      );
    }

    let updatedVisit: OpdVisitRecord | null = visit;
    const targetVisitStatus = targetQueueStatus === 'SERVING'
      ? 'IN_SERVICE'
      : 'COMPLETED';

    if (visit.status !== targetVisitStatus) {
      const visitRestore = protectedClinicalEmrRestorePayload({
        collection: 'opdVisits',
        entityId: visit._id.toHexString(),
        expectedPostVersion: visit.version + 1,
        snapshot: opdVisitRestoreSnapshot(visit),
        transactionId: input.transactionId,
        snapshotCrypto: this.snapshotCrypto,
      });

      if (updatedQueue !== null) {
        updatedVisit = await this.visitMutations.applyQueueStatusWithVersion({
          facilityId: input.facilityId,
          visitId: visit._id.toHexString(),
          queueTokenId: updatedQueue._id.toHexString(),
          expectedVersion: visit.version,
          queueStatus: targetQueueStatus,
          assignedProviderId: input.providerId,
          assignedCounterId: id(updatedQueue.assignedCounterId),
          existingActiveVisitKey: visit.activeVisitKey,
          existingCheckedInAt: visit.checkedInAt,
          existingQueuedAt: visit.queuedAt,
          existingServiceStartedAt: visit.serviceStartedAt,
          occurredAt: input.occurredAt,
          actorUserId: input.actorUserId,
        });
      } else {
        updatedVisit = await this.updateVisitWithoutQueue(
          input,
          visit,
          targetVisitStatus,
        );
      }

      if (updatedVisit === null) {
        throw new EncounterConcurrencyError();
      }

      await transaction.registerCompensation(
        restoreClinicalRecordCompensation(
          `restore-opd-visit:${visit._id.toHexString()}`,
          visitRestore,
        ),
      );
    }

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.OPD_LIFECYCLE_SYNCHRONIZED,
      {
        opdVisitId: input.opdVisitId,
        visitStatus: updatedVisit.status,
        hasQueueToken: updatedQueue !== null,
        queueStatus: updatedQueue?.status ?? null,
      },
    );

    return {
      opdVisitId: updatedVisit._id.toHexString(),
      visitStatus: updatedVisit.status,
      visitVersion: updatedVisit.version,
      queueTokenId: updatedQueue?._id.toHexString() ?? null,
      queueStatus: updatedQueue?.status ?? null,
      queueVersion: updatedQueue?.version ?? null,
    };
  }

  private async updateVisitWithoutQueue(
    input: ClinicalEmrOpdLifecycleMutationInput,
    visit: OpdVisitRecord,
    targetStatus: 'IN_SERVICE' | 'COMPLETED',
  ): Promise<OpdVisitRecord | null> {
    const allowedStatuses = targetStatus === 'IN_SERVICE'
      ? ['CHECKED_IN', 'QUEUED']
      : ['IN_SERVICE'];

    return OpdVisitModel.findOneAndUpdate(
      {
        _id: toObjectId(input.opdVisitId, 'opdVisitId'),
        facilityId: toObjectId(input.facilityId, 'facilityId'),
        version: visit.version,
        status: { $in: allowedStatuses },
      },
      {
        $set: {
          status: targetStatus,
          assignedProviderId: toObjectId(input.providerId, 'providerId'),
          serviceStartedAt: targetStatus === 'IN_SERVICE'
            ? visit.serviceStartedAt ?? input.occurredAt
            : visit.serviceStartedAt,
          completedAt: targetStatus === 'COMPLETED'
            ? input.occurredAt
            : null,
          activeVisitKey: targetStatus === 'COMPLETED'
            ? null
            : visit.activeVisitKey,
          updatedBy: toObjectId(input.actorUserId, 'actorUserId'),
        },
        $inc: { version: 1 },
      },
      {
        new: true,
        runValidators: true,
      },
    )
      .select(OPD_VISIT_INTERNAL_SELECT)
      .lean<OpdVisitRecord>()
      .exec();
  }
}