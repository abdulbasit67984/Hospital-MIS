import {
  EncounterStatusHistoryModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  throwMappedClinicalEmrPersistenceError,
} from '../clinical-emr.persistence-errors.js';

import {
  ENCOUNTER_STATUS_HISTORY_INTERNAL_SELECT,
  ENCOUNTER_STATUS_HISTORY_STANDARD_SELECT,
} from '../clinical-emr.projections.js';

import type {
  EncounterStatusHistoryRecord,
} from '../clinical-emr.persistence.types.js';

export interface CreateEncounterStatusHistoryInput {
  historyId: string;
  facilityId: string;
  encounterId: string;
  patientId: string;
  sequence: number;
  fromStatus: EncounterStatusHistoryRecord['fromStatus'];
  toStatus: EncounterStatusHistoryRecord['toStatus'];
  previousOwnerId: string | null;
  newOwnerId: string;
  previousOwnerRole: EncounterStatusHistoryRecord['previousOwnerRole'];
  newOwnerRole: EncounterStatusHistoryRecord['newOwnerRole'];
  changeSource: EncounterStatusHistoryRecord['changeSource'];
  reason: string | null;
  occurredAt: Date;
  changedBy: string;
  transactionId: string;
  correlationId: string;
}

export class EncounterStatusHistoryRepository {
  public async create(
    input: CreateEncounterStatusHistoryInput,
  ): Promise<EncounterStatusHistoryRecord> {
    try {
      const created =
        await EncounterStatusHistoryModel.create({
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

          encounterId:
            toObjectId(
              input.encounterId,
              'encounterId',
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

          previousOwnerId:
            input.previousOwnerId === null
              ? null
              : toObjectId(
                  input.previousOwnerId,
                  'previousOwnerId',
                ),

          newOwnerId:
            toObjectId(
              input.newOwnerId,
              'newOwnerId',
            ),

          previousOwnerRole:
            input.previousOwnerRole,

          newOwnerRole:
            input.newOwnerRole,

          changeSource:
            input.changeSource,

          reason:
            input.reason,

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

      return created.toObject() as EncounterStatusHistoryRecord;
    } catch (error) {
      throwMappedClinicalEmrPersistenceError(
        error,
        'CREATE_ENCOUNTER_HISTORY',
      );
    }
  }

  public async listForEncounter(
    facilityId: string,
    encounterId: string,
    includeReason = false,
  ): Promise<EncounterStatusHistoryRecord[]> {
    return EncounterStatusHistoryModel.find({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      encounterId:
        toObjectId(
          encounterId,
          'encounterId',
        ),
    })
      .select(
        includeReason
          ? ENCOUNTER_STATUS_HISTORY_INTERNAL_SELECT
          : ENCOUNTER_STATUS_HISTORY_STANDARD_SELECT,
      )
      .sort({
        sequence: 1,
      })
      .lean<EncounterStatusHistoryRecord[]>()
      .exec();
  }

  public async nextSequence(
    facilityId: string,
    encounterId: string,
  ): Promise<number> {
    const latest =
      await EncounterStatusHistoryModel.findOne({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        encounterId:
          toObjectId(
            encounterId,
            'encounterId',
          ),
      })
        .select('sequence')
        .sort({
          sequence: -1,
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