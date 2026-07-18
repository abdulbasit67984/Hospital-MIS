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

export class QueueTokenMutationRepository {
  public async transitionWithVersion(
    input: Readonly<{
      facilityId: string;
      queueTokenId: string;
      opdVisitId: string;
      expectedVersion: number;
      fromStatuses: readonly QueueTokenRecord['status'][];
      status: QueueTokenRecord['status'];
      assignedProviderId: string | null;
      assignedCounterId: string | null;
      occurredAt: Date;
      actorUserId: string;
      reason: string | null;
      incrementSkip: boolean;
      incrementRecall: boolean;
    }>,
  ): Promise<QueueTokenRecord | null> {
    const active =
      ACTIVE_QUEUE_ENTRY_STATUSES.includes(
        input.status as
          (typeof ACTIVE_QUEUE_ENTRY_STATUSES)[number],
      );

    const setValues:
      Record<string, unknown> = {
        status:
          input.status,

        assignedProviderId:
          input.assignedProviderId ===
          null
            ? null
            : toObjectId(
                input.assignedProviderId,
                'assignedProviderId',
              ),

        assignedCounterId:
          input.assignedCounterId ===
          null
            ? null
            : toObjectId(
                input.assignedCounterId,
                'assignedCounterId',
              ),

        activeEntryKey:
          active
            ? input.opdVisitId
            : null,

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
      };

    if (input.status === 'WAITING') {
      setValues.calledAt =
        null;

      setValues.servingAt =
        null;

      setValues.skippedAt =
        null;

      setValues.transferredAt =
        null;

      setValues.completedAt =
        null;

      setValues.cancelledAt =
        null;

      setValues.noShowAt =
        null;
    }

    if (input.status === 'CALLED') {
      setValues.calledAt =
        input.occurredAt;

      setValues.servingAt =
        null;

      setValues.skippedAt =
        null;

      setValues.transferredAt =
        null;

      setValues.completedAt =
        null;

      setValues.cancelledAt =
        null;

      setValues.noShowAt =
        null;
    }

    if (input.status === 'SERVING') {
      setValues.servingAt =
        input.occurredAt;
    }

    if (input.status === 'SKIPPED') {
      setValues.skippedAt =
        input.occurredAt;
    }

    if (
      input.status ===
      'COMPLETED'
    ) {
      setValues.completedAt =
        input.occurredAt;
    }

    if (
      input.status ===
      'CANCELLED'
    ) {
      setValues.cancelledAt =
        input.occurredAt;
    }

    if (input.status === 'NO_SHOW') {
      setValues.noShowAt =
        input.occurredAt;
    }

    const incrementValues:
      Record<string, number> = {
        version:
          1,
      };

    if (input.incrementSkip) {
      incrementValues.skipCount =
        1;
    }

    if (input.incrementRecall) {
      incrementValues.recallCount =
        1;
    }

    return QueueTokenModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.queueTokenId,
            'queueTokenId',
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
            ...input.fromStatuses,
          ],
        },
      },
      {
        $set:
          setValues,

        $inc:
          incrementValues,
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

  public async updateAssignmentWithVersion(
    input: Readonly<{
      facilityId: string;
      queueTokenId: string;
      expectedVersion: number;
      assignedProviderId: string | null;
      assignedCounterId: string | null;
      actorUserId: string;
      reason: string;
      occurredAt: Date;
    }>,
  ): Promise<QueueTokenRecord | null> {
    return QueueTokenModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.queueTokenId,
            'queueTokenId',
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
          assignedProviderId:
            input.assignedProviderId ===
            null
              ? null
              : toObjectId(
                  input.assignedProviderId,
                  'assignedProviderId',
                ),

          assignedCounterId:
            input.assignedCounterId ===
            null
              ? null
              : toObjectId(
                  input.assignedCounterId,
                  'assignedCounterId',
                ),

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

  public async updatePriorityWithVersion(
    input: Readonly<{
      facilityId: string;
      queueTokenId: string;
      expectedVersion: number;
      priorityClass: QueueTokenRecord['priorityClass'];
      priorityScore: number;
      triagePriority: QueueTokenRecord['triagePriority'];
      emergencyOverride: boolean;
      emergencyOverrideReason: string | null;
      specialCategories: QueueTokenRecord['specialCategories'];
      actorUserId: string;
      reason: string;
      occurredAt: Date;
    }>,
  ): Promise<QueueTokenRecord | null> {
    return QueueTokenModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.queueTokenId,
            'queueTokenId',
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
          priorityClass:
            input.priorityClass,

          priorityScore:
            input.priorityScore,

          triagePriority:
            input.triagePriority,

          emergencyOverride:
            input.emergencyOverride,

          emergencyOverrideReason:
            input.emergencyOverrideReason,

          specialCategories: [
            ...input.specialCategories,
          ],

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