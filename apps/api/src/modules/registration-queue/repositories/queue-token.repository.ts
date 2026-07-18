import type {
  FilterQuery,
} from 'mongoose';

import {
  QueueTokenModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  throwMappedRegistrationQueuePersistenceError,
} from '../registration-queue.persistence-errors.js';

import {
  QUEUE_TOKEN_INTERNAL_SELECT,
  QUEUE_TOKEN_STANDARD_SELECT,
} from '../registration-queue.projections.js';

import type {
  QueueEntryListQuery,
  QueueTokenRecord,
  RegistrationQueuePageResult,
} from '../registration-queue.types.js';

export interface CreateQueueTokenRecordInput {
  queueTokenId: string;
  queueEntryId: string;
  facilityId: string;
  registrationId: string;
  opdVisitId: string;
  patientId: string;
  queueDefinitionId: string;
  serviceDate: string;
  tokenNumber: number;
  tokenPrefix: string;
  tokenLabel: string;
  priorityClass: QueueTokenRecord['priorityClass'];
  priorityScore: number;
  triagePriority: QueueTokenRecord['triagePriority'];
  emergencyOverride: boolean;
  emergencyOverrideReason: string | null;
  specialCategories: QueueTokenRecord['specialCategories'];
  assignedProviderId: string | null;
  assignedCounterId: string | null;
  queuedAt: Date;
  transferredFromQueueTokenId?: string | null;
  transferCount?: number;
  transactionId: string;
  correlationId: string;
  actorUserId: string;
}

export class QueueTokenRepository {
  public async create(
    input: CreateQueueTokenRecordInput,
  ): Promise<QueueTokenRecord> {
    try {
      const created =
        await QueueTokenModel.create({
          _id:
            toObjectId(
              input.queueTokenId,
              'queueTokenId',
            ),

          queueEntryId:
            input.queueEntryId,

          facilityId:
            toObjectId(
              input.facilityId,
              'facilityId',
            ),

          registrationId:
            toObjectId(
              input.registrationId,
              'registrationId',
            ),

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

          queueDefinitionId:
            toObjectId(
              input.queueDefinitionId,
              'queueDefinitionId',
            ),

          serviceDate:
            input.serviceDate,

          tokenNumber:
            input.tokenNumber,

          tokenPrefix:
            input.tokenPrefix,

          tokenLabel:
            input.tokenLabel,

          status:
            'WAITING',

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
            null,

          queuedAt:
            input.queuedAt,

          calledAt:
            null,

          servingAt:
            null,

          skippedAt:
            null,

          transferredAt:
            null,

          completedAt:
            null,

          cancelledAt:
            null,

          noShowAt:
            null,

          skipCount:
            0,

          recallCount:
            0,

          transferCount:
            input.transferCount ??
            0,

          estimatedWaitMinutes:
            null,

          estimatedServiceAt:
            null,

          transferredFromQueueTokenId:
            input.transferredFromQueueTokenId ===
              undefined ||
            input.transferredFromQueueTokenId ===
              null
              ? null
              : toObjectId(
                  input.transferredFromQueueTokenId,
                  'transferredFromQueueTokenId',
                ),

          transferredToQueueTokenId:
            null,

          transferReason:
            null,

          statusReason:
            null,

          lastStatusChangedAt:
            input.queuedAt,

          lastStatusChangedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
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
              input.actorUserId,
              'actorUserId',
            ),

          updatedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),
        });

      return created.toObject() as QueueTokenRecord;
    } catch (error) {
      throwMappedRegistrationQueuePersistenceError(
        error,
        'CREATE_QUEUE_ENTRY',
      );
    }
  }

  public async findById(
    facilityId: string,
    queueTokenId: string,
    includeInternal = false,
  ): Promise<QueueTokenRecord | null> {
    return QueueTokenModel.findOne({
      _id:
        toObjectId(
          queueTokenId,
          'queueTokenId',
        ),

      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    })
      .select(
        includeInternal
          ? QUEUE_TOKEN_INTERNAL_SELECT
          : QUEUE_TOKEN_STANDARD_SELECT,
      )
      .lean<QueueTokenRecord>()
      .exec();
  }

  public async findByEntryId(
    facilityId: string,
    queueEntryId: string,
    includeInternal = false,
  ): Promise<QueueTokenRecord | null> {
    return QueueTokenModel.findOne({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      queueEntryId,
    })
      .select(
        includeInternal
          ? QUEUE_TOKEN_INTERNAL_SELECT
          : QUEUE_TOKEN_STANDARD_SELECT,
      )
      .lean<QueueTokenRecord>()
      .exec();
  }

  public async findActiveByVisitId(
    facilityId: string,
    opdVisitId: string,
  ): Promise<QueueTokenRecord | null> {
    return QueueTokenModel.findOne({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      activeEntryKey:
        opdVisitId,
    })
      .select(
        QUEUE_TOKEN_INTERNAL_SELECT,
      )
      .lean<QueueTokenRecord>()
      .exec();
  }

  public async list(
    facilityId: string,
    query: QueueEntryListQuery,
  ): Promise<
    RegistrationQueuePageResult<QueueTokenRecord>
  > {
    const filter:
      FilterQuery<QueueTokenRecord> = {
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        serviceDate:
          query.serviceDate,
      };

    if (
      query.queueDefinitionId !==
      undefined
    ) {
      filter.queueDefinitionId =
        toObjectId(
          query.queueDefinitionId,
          'queueDefinitionId',
        );
    }

    if (query.status !== undefined) {
      filter.status =
        query.status;
    }

    if (
      query.assignedProviderId !==
      undefined
    ) {
      filter.assignedProviderId =
        toObjectId(
          query.assignedProviderId,
          'assignedProviderId',
        );
    }

    if (
      query.assignedCounterId !==
      undefined
    ) {
      filter.assignedCounterId =
        toObjectId(
          query.assignedCounterId,
          'assignedCounterId',
        );
    }

    if (query.patientId !== undefined) {
      filter.patientId =
        toObjectId(
          query.patientId,
          'patientId',
        );
    }

    if (
      query.priorityClass !==
      undefined
    ) {
      filter.priorityClass =
        query.priorityClass;
    }

    if (
      query.triagePriority !==
      undefined
    ) {
      filter.triagePriority =
        query.triagePriority;
    }

    if (
      query.emergencyOverride !==
      undefined
    ) {
      filter.emergencyOverride =
        query.emergencyOverride;
    }

    const skip =
      (query.page - 1) *
      query.pageSize;

    const direction =
      query.sortDirection ===
      'asc'
        ? 1
        : -1;

    const [
      items,
      totalItems,
    ] =
      await Promise.all([
        QueueTokenModel.find(
          filter,
        )
          .select(
            QUEUE_TOKEN_STANDARD_SELECT,
          )
          .sort({
            [query.sortBy]:
              direction,

            _id:
              direction,
          })
          .skip(
            skip,
          )
          .limit(
            query.pageSize,
          )
          .lean<QueueTokenRecord[]>()
          .exec(),

        QueueTokenModel.countDocuments(
          filter,
        ).exec(),
      ]);

    return {
      items,

      page:
        query.page,

      pageSize:
        query.pageSize,

      totalItems,

      totalPages:
        Math.ceil(
          totalItems /
            query.pageSize,
        ),
    };
  }

  public async countAhead(
    input: Readonly<{
      facilityId: string;
      queueDefinitionId: string;
      serviceDate: string;
      priorityScore: number;
      queuedAt: Date;
      queueTokenId: string;
    }>,
  ): Promise<number> {
    return QueueTokenModel.countDocuments({
      facilityId:
        toObjectId(
          input.facilityId,
          'facilityId',
        ),

      queueDefinitionId:
        toObjectId(
          input.queueDefinitionId,
          'queueDefinitionId',
        ),

      serviceDate:
        input.serviceDate,

      status: {
        $in: [
          'WAITING',
          'CALLED',
          'SKIPPED',
        ],
      },

      _id: {
        $ne:
          toObjectId(
            input.queueTokenId,
            'queueTokenId',
          ),
      },

      $or: [
        {
          priorityScore: {
            $gt:
              input.priorityScore,
          },
        },

        {
          priorityScore:
            input.priorityScore,

          queuedAt: {
            $lt:
              input.queuedAt,
          },
        },

        {
          priorityScore:
            input.priorityScore,

          queuedAt:
            input.queuedAt,

          _id: {
            $lt:
              toObjectId(
                input.queueTokenId,
                'queueTokenId',
              ),
          },
        },
      ],
    }).exec();
  }
}