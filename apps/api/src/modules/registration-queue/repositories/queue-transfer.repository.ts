import {
  QueueTokenModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  ACTIVE_QUEUE_ENTRY_STATUSES,
} from '../registration-queue.constants.js';

import {
  QUEUE_TOKEN_INTERNAL_SELECT,
} from '../registration-queue.projections.js';

import type {
  QueueTokenRecord,
} from '../registration-queue.types.js';

export class QueueTransferRepository {
  public async markTransferredWithVersion(
    input: Readonly<{
      facilityId: string;
      sourceQueueTokenId: string;
      expectedVersion: number;
      destinationQueueTokenId: string;
      transferReason: QueueTokenRecord['transferReason'];
      reason: string;
      occurredAt: Date;
      actorUserId: string;
    }>,
  ): Promise<QueueTokenRecord | null> {
    return QueueTokenModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.sourceQueueTokenId,
            'sourceQueueTokenId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,

        status: {
          $in: [
            ...ACTIVE_QUEUE_ENTRY_STATUSES,
          ],
        },
      },
      {
        $set: {
          status:
            'TRANSFERRED',

          activeEntryKey:
            null,

          transferredAt:
            input.occurredAt,

          transferredToQueueTokenId:
            toObjectId(
              input.destinationQueueTokenId,
              'destinationQueueTokenId',
            ),

          transferReason:
            input.transferReason,

          statusReason:
            input.reason,

          lastStatusChangedAt:
            input.occurredAt,

          lastStatusChangedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),

          updatedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),
        },

        $inc: {
          transferCount:
            1,

          version:
            1,
        },
      },
      {
        new:
          true,

        runValidators:
          true,
      },
    )
      .select(
        QUEUE_TOKEN_INTERNAL_SELECT,
      )
      .lean<QueueTokenRecord>()
      .exec();
  }
}