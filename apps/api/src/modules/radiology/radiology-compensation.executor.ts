import type {
  Model,
} from 'mongoose';

import {
  RadiologyAppointmentModel,
  RadiologyCriticalFindingCommunicationModel,
  RadiologyExaminationModel,
  RadiologyImagingSeriesModel,
  RadiologyImagingStudyModel,
  RadiologyModalityModel,
  RadiologyOrderItemModel,
  RadiologyOrderItemStatusHistoryModel,
  RadiologyOrderModel,
  RadiologyOrderStatusHistoryModel,
  RadiologyProcedureModel,
  RadiologyReportModel,
  RadiologyReportVersionModel,
  RadiologyResourceModel,
  RadiologyResourceReservationModel,
  RadiologySafetyScreeningModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  RadiologySnapshotCryptoPort,
  RadiologyTransactionCompensation,
} from './radiology.ports.js';

import {
  RADIOLOGY_COMPENSATION_TYPES,
  type RadiologyCompensatableCollection,
} from './radiology.transaction.constants.js';

import type {
  RadiologyDeleteCreatedRecordPayload,
  RadiologyDeleteCreatedRecordSetPayload,
  RadiologyRestoreEncryptedRecordPayload,
} from './radiology.mutation-snapshots.js';

function collectionModel(
  collection: RadiologyCompensatableCollection,
): Model<unknown> {
  switch (collection) {
    case 'radiologyModalities':
      return RadiologyModalityModel as Model<unknown>;

    case 'radiologyProcedures':
      return RadiologyProcedureModel as Model<unknown>;

    case 'radiologyOrders':
      return RadiologyOrderModel as Model<unknown>;

    case 'radiologyOrderItems':
      return RadiologyOrderItemModel as Model<unknown>;

    case 'radiologyOrderStatusHistories':
      return RadiologyOrderStatusHistoryModel as Model<unknown>;

    case 'radiologyOrderItemStatusHistories':
      return RadiologyOrderItemStatusHistoryModel as Model<unknown>;

    case 'radiologyResources':
      return RadiologyResourceModel as Model<unknown>;

    case 'radiologyAppointments':
      return RadiologyAppointmentModel as Model<unknown>;

    case 'radiologyResourceReservations':
      return RadiologyResourceReservationModel as Model<unknown>;

    case 'radiologySafetyScreenings':
      return RadiologySafetyScreeningModel as Model<unknown>;

    case 'radiologyExaminations':
      return RadiologyExaminationModel as Model<unknown>;

    case 'radiologyImagingStudies':
      return RadiologyImagingStudyModel as Model<unknown>;

    case 'radiologyImagingSeries':
      return RadiologyImagingSeriesModel as Model<unknown>;

    case 'radiologyReports':
      return RadiologyReportModel as Model<unknown>;

    case 'radiologyReportVersions':
      return RadiologyReportVersionModel as Model<unknown>;

    case 'radiologyCriticalFindingCommunications':
      return RadiologyCriticalFindingCommunicationModel as Model<unknown>;
  }
}

export class RadiologyCompensationExecutor {
  public constructor(
    private readonly snapshotCrypto:
      RadiologySnapshotCryptoPort,
  ) {}

  public async execute(
    compensation:
      RadiologyTransactionCompensation,
  ): Promise<void> {
    switch (compensation.type) {
      case RADIOLOGY_COMPENSATION_TYPES.DELETE_CREATED_RECORD:
        await this.deleteCreatedRecord(
          compensation.payload as unknown as RadiologyDeleteCreatedRecordPayload,
        );
        return;

      case RADIOLOGY_COMPENSATION_TYPES.DELETE_CREATED_RECORD_SET:
        await this.deleteCreatedRecordSet(
          compensation.payload as unknown as RadiologyDeleteCreatedRecordSetPayload,
        );
        return;

      case RADIOLOGY_COMPENSATION_TYPES.RESTORE_ENCRYPTED_RECORD:
        await this.restoreEncryptedRecord(
          compensation.payload as unknown as RadiologyRestoreEncryptedRecordPayload,
        );
        return;

      default:
        throw new Error(
          `Unsupported Radiology compensation type: ${compensation.type}`,
        );
    }
  }

  private async deleteCreatedRecord(
    payload:
      RadiologyDeleteCreatedRecordPayload,
  ): Promise<void> {
    await collectionModel(
      payload.collection,
    )
      .deleteOne({
        _id: toObjectId(
          payload.entityId,
          'entityId',
        ),
        facilityId: toObjectId(
          payload.facilityId,
          'facilityId',
        ),
        transactionId:
          payload.transactionId,
      })
      .exec();
  }

  private async deleteCreatedRecordSet(
    payload:
      RadiologyDeleteCreatedRecordSetPayload,
  ): Promise<void> {
    await collectionModel(
      payload.collection,
    )
      .deleteMany({
        _id: {
          $in: payload.entityIds.map(
            (entityId) =>
              toObjectId(
                entityId,
                'entityIds',
              ),
          ),
        },
        facilityId: toObjectId(
          payload.facilityId,
          'facilityId',
        ),
        transactionId:
          payload.transactionId,
      })
      .exec();
  }

  private async restoreEncryptedRecord(
    payload:
      RadiologyRestoreEncryptedRecordPayload,
  ): Promise<void> {
    const snapshot =
      this.snapshotCrypto.unprotect<
        Record<string, unknown>
      >(
        payload.encryptedSnapshot,
        payload.associatedData,
      );

    if (
      !this.snapshotCrypto.matchesHash(
        snapshot,
        payload.associatedData,
        payload.snapshotHash,
      )
    ) {
      throw new Error(
        'Radiology compensation snapshot integrity verification failed',
      );
    }

    const result =
      await collectionModel(
        payload.collection,
      )
        .updateOne(
          {
            _id: toObjectId(
              payload.entityId,
              'entityId',
            ),
            facilityId:
              toObjectId(
                payload.facilityId,
                'facilityId',
              ),
            version:
              payload.expectedPostVersion,
          },
          {
            $set:
              snapshot,
          },
          {
            runValidators:
              true,
          },
        )
        .exec();

    if (result.matchedCount !== 1) {
      throw new Error(
        'Radiology compensation could not restore the expected record version',
      );
    }
  }
}