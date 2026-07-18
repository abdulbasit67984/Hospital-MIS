import {
  QueueStatusHistoryModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  throwMappedRegistrationQueuePersistenceError,
} from '../registration-queue.persistence-errors.js';

import type {
  QueueStatusHistoryRecord,
} from '../registration-queue.types.js';

export interface AppendQueueStatusHistoryInput {
  historyId: string;
  facilityId: string;
  queueTokenId: string;
  queueEntryId: string;
  opdVisitId: string;
  patientId: string;
  sequence: number;
  fromStatus: QueueStatusHistoryRecord['fromStatus'];
  toStatus: QueueStatusHistoryRecord['toStatus'];
  queueDefinitionId: string;
  destinationQueueDefinitionId?: string | null;
  providerId?: string | null;
  destinationProviderId?: string | null;
  counterId?: string | null;
  destinationCounterId?: string | null;
  changeSource: QueueStatusHistoryRecord['changeSource'];
  transferReason?: QueueStatusHistoryRecord['transferReason'];
  reason?: string | null;
  occurredAt: Date;
  changedBy: string;
  transactionId: string;
  correlationId: string;
}

const QUEUE_STATUS_HISTORY_SELECT = [
  '_id',
  'facilityId',
  'queueTokenId',
  'queueEntryId',
  'opdVisitId',
  'patientId',
  'sequence',
  'fromStatus',
  'toStatus',
  'queueDefinitionId',
  'destinationQueueDefinitionId',
  'providerId',
  'destinationProviderId',
  'counterId',
  'destinationCounterId',
  'changeSource',
  'transferReason',
  'occurredAt',
  'changedBy',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const QUEUE_STATUS_HISTORY_INTERNAL_SELECT = [
  QUEUE_STATUS_HISTORY_SELECT,
  '+reason',
].join(' ');

export class QueueStatusHistoryRepository {
  public async append(
    input: AppendQueueStatusHistoryInput,
  ): Promise<QueueStatusHistoryRecord> {
    try {
      const created =
        await QueueStatusHistoryModel.create({
          _id:
            toObjectId(
              input.historyId,
              'historyId',
            ),

          facilityId:
            toObjectId(
              input.facilityId,
              'facilityId',
            ),

          queueTokenId:
            toObjectId(
              input.queueTokenId,
              'queueTokenId',
            ),

          queueEntryId:
            input.queueEntryId,

          opdVisitId:
            toObjectId(
              input.opdVisitId,
              'opdVisitId',
            ),

          patientId:
            toObjectId(
              input.patientId,
              'patientId',
            ),

          sequence:
            input.sequence,

          fromStatus:
            input.fromStatus,

          toStatus:
            input.toStatus,

          queueDefinitionId:
            toObjectId(
              input.queueDefinitionId,
              'queueDefinitionId',
            ),

          destinationQueueDefinitionId:
            input.destinationQueueDefinitionId ===
              undefined ||
            input.destinationQueueDefinitionId ===
              null
              ? null
              : toObjectId(
                  input.destinationQueueDefinitionId,
                  'destinationQueueDefinitionId',
                ),

          providerId:
            input.providerId ===
              undefined ||
            input.providerId ===
              null
              ? null
              : toObjectId(
                  input.providerId,
                  'providerId',
                ),

          destinationProviderId:
            input.destinationProviderId ===
              undefined ||
            input.destinationProviderId ===
              null
              ? null
              : toObjectId(
                  input.destinationProviderId,
                  'destinationProviderId',
                ),

          counterId:
            input.counterId ===
              undefined ||
            input.counterId ===
              null
              ? null
              : toObjectId(
                  input.counterId,
                  'counterId',
                ),

          destinationCounterId:
            input.destinationCounterId ===
              undefined ||
            input.destinationCounterId ===
              null
              ? null
              : toObjectId(
                  input.destinationCounterId,
                  'destinationCounterId',
                ),

          changeSource:
            input.changeSource,

          transferReason:
            input.transferReason ??
            null,

          reason:
            input.reason ??
            null,

          occurredAt:
            input.occurredAt,

          changedBy:
            toObjectId(
              input.changedBy,
              'changedBy',
            ),

          transactionId:
            input.transactionId,

          correlationId:
            input.correlationId,

          schemaVersion:
            1,

          version:
            0,

          createdBy:
            toObjectId(
              input.changedBy,
              'changedBy',
            ),

          updatedBy:
            toObjectId(
              input.changedBy,
              'changedBy',
            ),
        });

      return created.toObject() as QueueStatusHistoryRecord;
    } catch (error) {
      throwMappedRegistrationQueuePersistenceError(
        error,
        'CREATE_QUEUE_HISTORY',
      );
    }
  }

  public async listForQueueEntry(
    facilityId: string,
    queueTokenId: string,
    includeReason = false,
  ): Promise<QueueStatusHistoryRecord[]> {
    return QueueStatusHistoryModel.find({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      queueTokenId:
        toObjectId(
          queueTokenId,
          'queueTokenId',
        ),
    })
      .select(
        includeReason
          ? QUEUE_STATUS_HISTORY_INTERNAL_SELECT
          : QUEUE_STATUS_HISTORY_SELECT,
      )
      .sort({
        sequence:
          1,
      })
      .lean<QueueStatusHistoryRecord[]>()
      .exec();
  }

  public async nextSequence(
    facilityId: string,
    queueTokenId: string,
  ): Promise<number> {
    const latest =
      await QueueStatusHistoryModel.findOne({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        queueTokenId:
          toObjectId(
            queueTokenId,
            'queueTokenId',
          ),
      })
        .select(
          'sequence',
        )
        .sort({
          sequence:
            -1,
        })
        .lean<{
          sequence: number;
        }>()
        .exec();

    return (
      latest?.sequence ??
      0
    ) + 1;
  }
}