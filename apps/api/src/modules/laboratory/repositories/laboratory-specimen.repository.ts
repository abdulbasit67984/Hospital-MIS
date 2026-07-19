import type {
  LaboratorySpecimenStatus,
} from '@hospital-mis/database';

import {
  LabSpecimenModel,
  LabSpecimenStatusHistoryModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  LaboratorySpecimenLifecyclePersistenceUpdate,
  LaboratorySpecimenRepositoryPort,
} from '../laboratory.ports.js';

import type {
  LaboratorySpecimenRecord,
  LaboratorySpecimenStatusHistoryRecord,
} from '../laboratory.persistence.types.js';

import {
  throwMappedLaboratoryPersistenceError,
} from '../laboratory.persistence-errors.js';

const SPECIMEN_SELECT = [
  '_id',
  'facilityId',
  'accessionNumber',
  'specimenIdentifier',
  '+labelCode',
  'labOrderId',
  'labOrderItemIds',
  'patientId',
  'encounterId',
  'requirementCodeSnapshot',
  'specimenTypeCodeSnapshot',
  'specimenTypeNameSnapshot',
  'containerCodeSnapshot',
  'containerNameSnapshot',
  'expectedMinimumVolume',
  'expectedVolumeUnitCode',
  'collectedVolume',
  'collectedVolumeUnitCode',
  'collectionMethod',
  '+collectionSite',
  'status',
  'labelPrintCount',
  'labelPrintedAt',
  'labelPrintedBy',
  'collectedAt',
  'collectedBy',
  'collectorStaffId',
  'receivedAt',
  'receivedBy',
  'processingStartedAt',
  'processingStartedBy',
  'completedAt',
  'completedBy',
  'rejectedAt',
  'rejectedBy',
  'rejectionReasonCode',
  '+rejectionReason',
  'recollectionRequestedAt',
  'recollectionRequestedBy',
  '+recollectionReason',
  'recollectionOfSpecimenId',
  'replacementSpecimenId',
  'collectionAttempt',
  'cancelledAt',
  'cancelledBy',
  '+cancellationReason',
  'lastStatusChangedAt',
  'lastStatusChangedBy',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const HISTORY_SELECT = [
  '_id',
  'facilityId',
  'labSpecimenId',
  'labOrderId',
  'patientId',
  'encounterId',
  'sequence',
  'fromStatus',
  'toStatus',
  'changeSource',
  'reasonCode',
  '+reason',
  'stateHash',
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

function record<T>(
  value: unknown,
): T {
  return value as T;
}

export class LaboratorySpecimenRepository
implements LaboratorySpecimenRepositoryPort {
  public async findById(
    facilityId: string,
    specimenId: string,
  ): Promise<LaboratorySpecimenRecord | null> {
    return record<LaboratorySpecimenRecord | null>(
      await LabSpecimenModel.findOne({
        _id: toObjectId(specimenId, 'specimenId'),
        facilityId: toObjectId(facilityId, 'facilityId'),
      })
        .select(SPECIMEN_SELECT)
        .lean()
        .exec(),
    );
  }

  public async listForOrder(
    facilityId: string,
    orderId: string,
  ): Promise<LaboratorySpecimenRecord[]> {
    return record<LaboratorySpecimenRecord[]>(
      await LabSpecimenModel.find({
        facilityId: toObjectId(facilityId, 'facilityId'),
        labOrderId: toObjectId(orderId, 'orderId'),
      })
        .select(SPECIMEN_SELECT)
        .sort({
          collectionAttempt: 1,
          createdAt: 1,
        })
        .lean()
        .exec(),
    );
  }

  public async listForOrderItem(
    facilityId: string,
    orderItemId: string,
  ): Promise<LaboratorySpecimenRecord[]> {
    return record<LaboratorySpecimenRecord[]>(
      await LabSpecimenModel.find({
        facilityId: toObjectId(facilityId, 'facilityId'),
        labOrderItemIds: toObjectId(orderItemId, 'orderItemId'),
      })
        .select(SPECIMEN_SELECT)
        .sort({
          collectionAttempt: 1,
          createdAt: 1,
        })
        .lean()
        .exec(),
    );
  }

  public async listHistory(
    facilityId: string,
    specimenId: string,
  ): Promise<LaboratorySpecimenStatusHistoryRecord[]> {
    return record<LaboratorySpecimenStatusHistoryRecord[]>(
      await LabSpecimenStatusHistoryModel.find({
        facilityId: toObjectId(facilityId, 'facilityId'),
        labSpecimenId: toObjectId(specimenId, 'specimenId'),
      })
        .select(HISTORY_SELECT)
        .sort({
          sequence: 1,
        })
        .lean()
        .exec(),
    );
  }

  public async create(
    specimen: Omit<
      LaboratorySpecimenRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<LaboratorySpecimenRecord> {
    try {
      const document = await LabSpecimenModel.create(specimen);

      return record<LaboratorySpecimenRecord>(
        document.toObject(),
      );
    } catch (error) {
      throwMappedLaboratoryPersistenceError(
        error,
        'CREATE_SPECIMEN',
      );
    }
  }

  public async transitionStatus(
    facilityId: string,
    specimenId: string,
    expectedVersion: number,
    fromStatuses: readonly LaboratorySpecimenStatus[],
    update: LaboratorySpecimenLifecyclePersistenceUpdate,
  ): Promise<LaboratorySpecimenRecord | null> {
    return record<LaboratorySpecimenRecord | null>(
      await LabSpecimenModel.findOneAndUpdate(
        {
          _id: toObjectId(specimenId, 'specimenId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          status: {
            $in: fromStatuses,
          },
          version: expectedVersion,
        },
        {
          $set: update,
          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
        .select(SPECIMEN_SELECT)
        .lean()
        .exec(),
    );
  }

  public async linkReplacement(
    facilityId: string,
    specimenId: string,
    expectedVersion: number,
    replacementSpecimenId: string,
    actorUserId: string,
  ): Promise<LaboratorySpecimenRecord | null> {
    return record<LaboratorySpecimenRecord | null>(
      await LabSpecimenModel.findOneAndUpdate(
        {
          _id: toObjectId(specimenId, 'specimenId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          status: 'RECOLLECTION_REQUIRED',
          replacementSpecimenId: null,
          version: expectedVersion,
        },
        {
          $set: {
            replacementSpecimenId: toObjectId(
              replacementSpecimenId,
              'replacementSpecimenId',
            ),
            updatedBy: toObjectId(actorUserId, 'actorUserId'),
          },
          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
        .select(SPECIMEN_SELECT)
        .lean()
        .exec(),
    );
  }

  public async appendHistory(
    history: Omit<
      LaboratorySpecimenStatusHistoryRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<LaboratorySpecimenStatusHistoryRecord> {
    try {
      const document =
        await LabSpecimenStatusHistoryModel.create(history);

      return record<LaboratorySpecimenStatusHistoryRecord>(
        document.toObject(),
      );
    } catch (error) {
      throwMappedLaboratoryPersistenceError(
        error,
        'CREATE_SPECIMEN_HISTORY',
      );
    }
  }
}
