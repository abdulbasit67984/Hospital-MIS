import {
  OpdVisitModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  throwMappedRegistrationQueuePersistenceError,
} from '../registration-queue.persistence-errors.js';

import {
  OPD_VISIT_INTERNAL_SELECT,
} from '../registration-queue.projections.js';

import {
  buildActiveVisitKey,
} from '../registration-queue.normalization.js';

import type {
  OpdVisitRecord,
} from '../registration-queue.types.js';

export class OpdVisitLifecycleRepository {
  public async transferWithVersion(
    input: Readonly<{
      facilityId: string;
      visitId: string;
      expectedVersion: number;
      patientId: string;
      serviceDate: string;
      destinationDepartmentId: string;
      destinationClinicId: string | null;
      destinationServicePointId: string | null;
      destinationProviderId: string | null;
      destinationCounterId: string | null;
      destinationQueueTokenId: string;
      occurredAt: Date;
      actorUserId: string;
    }>,
  ): Promise<OpdVisitRecord | null> {
    const activeVisitKey =
      buildActiveVisitKey({
        patientId:
          input.patientId,

        serviceDate:
          input.serviceDate,

        departmentId:
          input.destinationDepartmentId,

        clinicId:
          input.destinationClinicId,

        servicePointId:
          input.destinationServicePointId,
      });

    try {
      return await OpdVisitModel.findOneAndUpdate(
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
            status:
              'QUEUED',

            departmentId:
              toObjectId(
                input.destinationDepartmentId,
                'destinationDepartmentId',
              ),

            clinicId:
              input.destinationClinicId ===
              null
                ? null
                : toObjectId(
                    input.destinationClinicId,
                    'destinationClinicId',
                  ),

            servicePointId:
              input.destinationServicePointId ===
              null
                ? null
                : toObjectId(
                    input.destinationServicePointId,
                    'destinationServicePointId',
                  ),

            assignedProviderId:
              input.destinationProviderId ===
              null
                ? null
                : toObjectId(
                    input.destinationProviderId,
                    'destinationProviderId',
                  ),

            assignedCounterId:
              input.destinationCounterId ===
              null
                ? null
                : toObjectId(
                    input.destinationCounterId,
                    'destinationCounterId',
                  ),

            currentQueueTokenId:
              toObjectId(
                input.destinationQueueTokenId,
                'destinationQueueTokenId',
              ),

            activeVisitKey,

            queuedAt:
              input.occurredAt,

            serviceStartedAt:
              null,

            completedAt:
              null,

            cancelledAt:
              null,

            cancelledBy:
              null,

            cancellationReason:
              null,

            noShowAt:
              null,

            noShowMarkedBy:
              null,

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
    } catch (error) {
      throwMappedRegistrationQueuePersistenceError(
        error,
        'CREATE_VISIT',
      );
    }
  }

  public async cancelWithVersion(
    input: Readonly<{
      facilityId: string;
      visitId: string;
      expectedVersion: number;
      reason: string;
      occurredAt: Date;
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
          status:
            'CANCELLED',

          activeVisitKey:
            null,

          cancelledAt:
            input.occurredAt,

          cancelledBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),

          cancellationReason:
            input.reason,

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

  public async markNoShowWithVersion(
    input: Readonly<{
      facilityId: string;
      visitId: string;
      expectedVersion: number;
      occurredAt: Date;
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
          ],
        },
      },
      {
        $set: {
          status:
            'NO_SHOW',

          activeVisitKey:
            null,

          noShowAt:
            input.occurredAt,

          noShowMarkedBy:
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
        OPD_VISIT_INTERNAL_SELECT,
      )
      .lean<OpdVisitRecord>()
      .exec();
  }
}