import {
  OpdVisitModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  OPD_VISIT_INTERNAL_SELECT,
} from '../registration-queue.projections.js';

import type {
  OpdVisitRecord,
  QueueTokenRecord,
} from '../registration-queue.types.js';

export class OpdVisitQueueMutationRepository {
  public async applyQueueStatusWithVersion(
    input: Readonly<{
      facilityId: string;
      visitId: string;
      queueTokenId: string;
      expectedVersion: number;
      queueStatus: QueueTokenRecord['status'];
      assignedProviderId: string | null;
      assignedCounterId: string | null;
      existingActiveVisitKey: string | null;
      existingCheckedInAt: Date | null;
      existingQueuedAt: Date | null;
      existingServiceStartedAt: Date | null;
      occurredAt: Date;
      actorUserId: string;
    }>,
  ): Promise<OpdVisitRecord | null> {
    const setValues:
      Record<string, unknown> = {
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

        updatedBy:
          toObjectId(
            input.actorUserId,
            'actorUserId',
          ),
      };

    if (
      input.queueStatus ===
        'WAITING' ||
      input.queueStatus ===
        'CALLED' ||
      input.queueStatus ===
        'SKIPPED'
    ) {
      setValues.status =
        'QUEUED';

      setValues.currentQueueTokenId =
        toObjectId(
          input.queueTokenId,
          'queueTokenId',
        );

      setValues.queuedAt =
        input.existingQueuedAt ??
        input.occurredAt;

      setValues.activeVisitKey =
        input.existingActiveVisitKey;
    }

    if (
      input.queueStatus ===
      'SERVING'
    ) {
      setValues.status =
        'IN_SERVICE';

      setValues.currentQueueTokenId =
        toObjectId(
          input.queueTokenId,
          'queueTokenId',
        );

      setValues.queuedAt =
        input.existingQueuedAt ??
        input.occurredAt;

      setValues.serviceStartedAt =
        input.existingServiceStartedAt ??
        input.occurredAt;

      setValues.activeVisitKey =
        input.existingActiveVisitKey;
    }

    if (
      input.queueStatus ===
      'COMPLETED'
    ) {
      setValues.status =
        'COMPLETED';

      setValues.currentQueueTokenId =
        toObjectId(
          input.queueTokenId,
          'queueTokenId',
        );

      setValues.completedAt =
        input.occurredAt;

      setValues.activeVisitKey =
        null;
    }

    if (
      input.queueStatus ===
      'NO_SHOW'
    ) {
      setValues.status =
        'NO_SHOW';

      setValues.currentQueueTokenId =
        toObjectId(
          input.queueTokenId,
          'queueTokenId',
        );

      setValues.noShowAt =
        input.occurredAt;

      setValues.noShowMarkedBy =
        toObjectId(
          input.actorUserId,
          'actorUserId',
        );

      setValues.activeVisitKey =
        null;
    }

    if (
      input.queueStatus ===
      'CANCELLED'
    ) {
      setValues.status =
        input.existingCheckedInAt ===
        null
          ? 'REGISTERED'
          : 'CHECKED_IN';

      setValues.currentQueueTokenId =
        null;

      setValues.assignedCounterId =
        null;

      setValues.activeVisitKey =
        input.existingActiveVisitKey;
    }

    return OpdVisitModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.visitId,
            'visitId',
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
            'REGISTERED',
            'CHECKED_IN',
            'QUEUED',
            'IN_SERVICE',
          ],
        },
      },
      {
        $set:
          setValues,

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
        OPD_VISIT_INTERNAL_SELECT,
      )
      .lean<OpdVisitRecord>()
      .exec();
  }

  public async updateQueueAssignmentWithVersion(
    input: Readonly<{
      facilityId: string;
      visitId: string;
      queueTokenId: string;
      expectedVersion: number;
      assignedProviderId: string | null;
      assignedCounterId: string | null;
      actorUserId: string;
    }>,
  ): Promise<OpdVisitRecord | null> {
    return OpdVisitModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.visitId,
            'visitId',
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
            'REGISTERED',
            'CHECKED_IN',
            'QUEUED',
            'IN_SERVICE',
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

          currentQueueTokenId:
            toObjectId(
              input.queueTokenId,
              'queueTokenId',
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
        OPD_VISIT_INTERNAL_SELECT,
      )
      .lean<OpdVisitRecord>()
      .exec();
  }
}