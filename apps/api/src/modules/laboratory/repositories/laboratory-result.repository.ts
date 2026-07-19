import type {
  FilterQuery,
} from 'mongoose';

import type {
  LaboratoryResultPublicationStatus,
  LaboratoryResultStatus,
} from '@hospital-mis/database';

import {
  LabCriticalResultCommunicationModel,
  LabResultModel,
  LabResultVersionModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  LaboratoryResultLifecyclePersistenceUpdate,
  LaboratoryResultRepositoryPort,
} from '../laboratory.ports.js';

import type {
  LaboratoryCriticalResultCommunicationRecord,
  LaboratoryResultRecord,
  LaboratoryResultVersionRecord,
} from '../laboratory.persistence.types.js';

import {
  throwMappedLaboratoryPersistenceError,
} from '../laboratory.persistence-errors.js';

const RESULT_SELECT = [
  '_id',
  'facilityId',
  'resultNumber',
  'labOrderId',
  'labOrderItemId',
  'labTestId',
  'specimenId',
  'patientId',
  'encounterId',
  'testCodeSnapshot',
  'testNameSnapshot',
  'methodCodeSnapshot',
  'methodNameSnapshot',
  'status',
  '+components',
  'overallFlag',
  'criticalComponentCount',
  'unresolvedCriticalComponentCount',
  '+conclusion',
  '+technicalNotes',
  'enteredAt',
  'enteredBy',
  'technicianStaffId',
  'validatedAt',
  'validatedBy',
  'validatorStaffId',
  'verifiedAt',
  'verifiedBy',
  'verifierStaffId',
  'currentVersion',
  'latestVersionId',
  'correctedAt',
  'correctedBy',
  '+correctionReason',
  'supersedesResultVersionId',
  'cancelledAt',
  'cancelledBy',
  '+cancellationReason',
  'publicationStatus',
  'publishedAt',
  'publishedBy',
  'withdrawnAt',
  'withdrawnBy',
  '+withdrawalReason',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const VERSION_SELECT = [
  '_id',
  'facilityId',
  'labResultId',
  'labOrderId',
  'labOrderItemId',
  'patientId',
  'encounterId',
  'versionNumber',
  'previousVersionId',
  'changeType',
  'statusSnapshot',
  'overallFlagSnapshot',
  'criticalComponentCountSnapshot',
  '+encryptedSnapshot',
  'snapshotHash',
  'contentHash',
  '+changeReason',
  'technicianStaffId',
  'validatorStaffId',
  'verifierStaffId',
  'recordedAt',
  'recordedBy',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const COMMUNICATION_SELECT = [
  '_id',
  'facilityId',
  'labResultId',
  'labResultVersionId',
  'labOrderId',
  'patientId',
  'encounterId',
  'sequence',
  'componentCodeSnapshot',
  'resultFlagSnapshot',
  'communicationType',
  'channel',
  'recipientType',
  'recipientUserId',
  'recipientStaffId',
  '+recipientDisplaySnapshot',
  '+communicationNotes',
  'occurredAt',
  'performedBy',
  'acknowledgedAt',
  'acknowledgedBy',
  '+acknowledgementNotes',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

function record<T>(
  value:
    unknown,
): T {
  return value as T;
}

export interface LaboratoryResultHistoryQuery {
  page:
    number;

  pageSize:
    number;

  patientId?:
    string;

  encounterId?:
    string;

  orderId?:
    string;

  status?:
    LaboratoryResultStatus;

  publicationStatus?:
    LaboratoryResultPublicationStatus;
}

export class LaboratoryResultRepository
implements LaboratoryResultRepositoryPort {
  public async findById(
    facilityId:
      string,

    resultId:
      string,
  ): Promise<
    LaboratoryResultRecord | null
  > {
    return record<
      LaboratoryResultRecord | null
    >(
      await LabResultModel
        .findOne({
          _id:
            toObjectId(
              resultId,
              'resultId',
            ),

          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),
        })
        .select(
          RESULT_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async findByOrderItemId(
    facilityId:
      string,

    orderItemId:
      string,
  ): Promise<
    LaboratoryResultRecord | null
  > {
    return record<
      LaboratoryResultRecord | null
    >(
      await LabResultModel
        .findOne({
          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          labOrderItemId:
            toObjectId(
              orderItemId,
              'orderItemId',
            ),
        })
        .select(
          RESULT_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async list(
    facilityId:
      string,

    query:
      LaboratoryResultHistoryQuery,
  ): Promise<{
    items:
      LaboratoryResultRecord[];

    total:
      number;
  }> {
    const filter:
      FilterQuery<unknown> = {
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    };

    if (
      query.patientId !==
      undefined
    ) {
      filter[
        'patientId'
      ] = toObjectId(
        query.patientId,
        'patientId',
      );
    }

    if (
      query.encounterId !==
      undefined
    ) {
      filter[
        'encounterId'
      ] = toObjectId(
        query.encounterId,
        'encounterId',
      );
    }

    if (
      query.orderId !==
      undefined
    ) {
      filter[
        'labOrderId'
      ] = toObjectId(
        query.orderId,
        'orderId',
      );
    }

    if (
      query.status !==
      undefined
    ) {
      filter[
        'status'
      ] = query.status;
    }

    if (
      query.publicationStatus !==
      undefined
    ) {
      filter[
        'publicationStatus'
      ] =
        query.publicationStatus;
    }

    const skip =
      (
        query.page -
        1
      ) *
      query.pageSize;

    const [
      items,
      total,
    ] =
      await Promise.all([
        LabResultModel
          .find(
            filter,
          )
          .select(
            RESULT_SELECT,
          )
          .sort({
            verifiedAt:
              -1,

            enteredAt:
              -1,

            _id:
              -1,
          })
          .skip(
            skip,
          )
          .limit(
            query.pageSize,
          )
          .lean()
          .exec(),

        LabResultModel
          .countDocuments(
            filter,
          )
          .exec(),
      ]);

    return {
      items:
        record<
          LaboratoryResultRecord[]
        >(
          items,
        ),

      total,
    };
  }

  public async create(
    result: Omit<
      LaboratoryResultRecord,
      | '_id'
      | 'createdAt'
      | 'updatedAt'
    >,
  ): Promise<
    LaboratoryResultRecord
  > {
    try {
      const document =
        await LabResultModel
          .create(
            result,
          );

      return record<
        LaboratoryResultRecord
      >(
        document.toObject(),
      );
    } catch (error) {
      throwMappedLaboratoryPersistenceError(
        error,
        'CREATE_RESULT',
      );
    }
  }

  public async transitionStatus(
    facilityId:
      string,

    resultId:
      string,

    expectedVersion:
      number,

    fromStatuses:
      readonly LaboratoryResultStatus[],

    update:
      LaboratoryResultLifecyclePersistenceUpdate,
  ): Promise<
    LaboratoryResultRecord | null
  > {
    return record<
      LaboratoryResultRecord | null
    >(
      await LabResultModel
        .findOneAndUpdate(
          {
            _id:
              toObjectId(
                resultId,
                'resultId',
              ),

            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),

            status: {
              $in:
                fromStatuses,
            },

            version:
              expectedVersion,
          },

          {
            $set:
              update,

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
          RESULT_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async transitionPublication(
    facilityId:
      string,

    resultId:
      string,

    expectedVersion:
      number,

    fromStatuses:
      readonly LaboratoryResultPublicationStatus[],

    update:
      LaboratoryResultLifecyclePersistenceUpdate,
  ): Promise<
    LaboratoryResultRecord | null
  > {
    return record<
      LaboratoryResultRecord | null
    >(
      await LabResultModel
        .findOneAndUpdate(
          {
            _id:
              toObjectId(
                resultId,
                'resultId',
              ),

            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),

            publicationStatus: {
              $in:
                fromStatuses,
            },

            version:
              expectedVersion,
          },

          {
            $set:
              update,

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
          RESULT_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async appendVersion(
    version: Omit<
      LaboratoryResultVersionRecord,
      | '_id'
      | 'createdAt'
      | 'updatedAt'
    >,
  ): Promise<
    LaboratoryResultVersionRecord
  > {
    try {
      const document =
        await LabResultVersionModel
          .create(
            version,
          );

      return record<
        LaboratoryResultVersionRecord
      >(
        document.toObject(),
      );
    } catch (error) {
      throwMappedLaboratoryPersistenceError(
        error,
        'CREATE_RESULT_VERSION',
      );
    }
  }

  public async findVersionById(
    facilityId:
      string,

    versionId:
      string,
  ): Promise<
    LaboratoryResultVersionRecord | null
  > {
    return record<
      LaboratoryResultVersionRecord | null
    >(
      await LabResultVersionModel
        .findOne({
          _id:
            toObjectId(
              versionId,
              'versionId',
            ),

          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),
        })
        .select(
          VERSION_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async listVersions(
    facilityId:
      string,

    resultId:
      string,
  ): Promise<
    LaboratoryResultVersionRecord[]
  > {
    return record<
      LaboratoryResultVersionRecord[]
    >(
      await LabResultVersionModel
        .find({
          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          labResultId:
            toObjectId(
              resultId,
              'resultId',
            ),
        })
        .select(
          VERSION_SELECT,
        )
        .sort({
          versionNumber:
            1,
        })
        .lean()
        .exec(),
    );
  }

  public async appendCriticalCommunication(
    communication: Omit<
      LaboratoryCriticalResultCommunicationRecord,
      | '_id'
      | 'createdAt'
      | 'updatedAt'
    >,
  ): Promise<
    LaboratoryCriticalResultCommunicationRecord
  > {
    try {
      const document =
        await LabCriticalResultCommunicationModel
          .create(
            communication,
          );

      return record<
        LaboratoryCriticalResultCommunicationRecord
      >(
        document.toObject(),
      );
    } catch (error) {
      throwMappedLaboratoryPersistenceError(
        error,
        'CREATE_CRITICAL_COMMUNICATION',
      );
    }
  }

  public async listCriticalCommunications(
    facilityId:
      string,

    resultId:
      string,
  ): Promise<
    LaboratoryCriticalResultCommunicationRecord[]
  > {
    return record<
      LaboratoryCriticalResultCommunicationRecord[]
    >(
      await LabCriticalResultCommunicationModel
        .find({
          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          labResultId:
            toObjectId(
              resultId,
              'resultId',
            ),
        })
        .select(
          COMMUNICATION_SELECT,
        )
        .sort({
          sequence:
            1,
        })
        .lean()
        .exec(),
    );
  }
}