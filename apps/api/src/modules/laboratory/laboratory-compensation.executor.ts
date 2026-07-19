import type {
  Model,
} from 'mongoose';

import {
  LabCriticalResultCommunicationModel,
  LabOrderItemModel,
  LabOrderModel,
  LabOrderStatusHistoryModel,
  LabResultModel,
  LabResultVersionModel,
  LabSpecimenModel,
  LabSpecimenStatusHistoryModel,
  LabTestCategoryModel,
  LabTestModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  LaboratorySnapshotCryptoPort,
  LaboratoryTransactionCompensation,
} from './laboratory.ports.js';

import {
  LABORATORY_COMPENSATION_TYPES,
  type LaboratoryCompensatableCollection,
} from './laboratory.transaction.constants.js';

import {
  LABORATORY_RESULT_COMPENSATION_TYPES,
  type LaboratoryResultCompensatableCollection,
} from './laboratory-result.transaction.constants.js';

type CompensatableCollection =
  | LaboratoryCompensatableCollection
  | LaboratoryResultCompensatableCollection
  | 'labSpecimens'
  | 'labSpecimenStatusHistories'
  | 'labCriticalResultCommunications';

interface DeleteCreatedPayload {
  collection: CompensatableCollection;
  entityId: string;
  transactionId: string;
}

interface DeleteCreatedSetPayload {
  collection: CompensatableCollection;
  entityIds: string[];
  transactionId: string;
}

interface RestoreEncryptedPayload {
  collection: CompensatableCollection;
  entityId: string;
  expectedPostVersion: number;
  transactionId: string;
  associatedData: string;
  encryptedSnapshot: Parameters<
    LaboratorySnapshotCryptoPort['unprotect']
  >[0];
  snapshotHash: string;
}

function collectionModel(
  collection: CompensatableCollection,
): Model<unknown> {
  switch (collection) {
    case 'labTestCategories':
      return LabTestCategoryModel as Model<unknown>;

    case 'labTests':
      return LabTestModel as Model<unknown>;

    case 'labOrders':
      return LabOrderModel as Model<unknown>;

    case 'labOrderItems':
      return LabOrderItemModel as Model<unknown>;

    case 'labOrderStatusHistories':
      return LabOrderStatusHistoryModel as Model<unknown>;

    case 'labSpecimens':
      return LabSpecimenModel as Model<unknown>;

    case 'labSpecimenStatusHistories':
      return LabSpecimenStatusHistoryModel as Model<unknown>;

    case 'labResults':
      return LabResultModel as Model<unknown>;

    case 'labResultVersions':
      return LabResultVersionModel as Model<unknown>;

    case 'labCriticalResultCommunications':
      return LabCriticalResultCommunicationModel as Model<unknown>;
  }
}

export class LaboratoryCompensationExecutor {
  public constructor(
    private readonly snapshotCrypto: LaboratorySnapshotCryptoPort,
  ) {}

  public async execute(
    compensation: LaboratoryTransactionCompensation,
  ): Promise<void> {
    switch (compensation.type) {
      case LABORATORY_COMPENSATION_TYPES.DELETE_CREATED_RECORD:
      case LABORATORY_RESULT_COMPENSATION_TYPES.DELETE_CREATED_RECORD:
        await this.deleteCreatedRecord(
          compensation.payload as unknown as DeleteCreatedPayload,
        );

        return;

      case LABORATORY_COMPENSATION_TYPES.DELETE_CREATED_RECORD_SET:
        await this.deleteCreatedRecordSet(
          compensation.payload as unknown as DeleteCreatedSetPayload,
        );

        return;

      case LABORATORY_COMPENSATION_TYPES.RESTORE_ENCRYPTED_RECORD:
      case LABORATORY_RESULT_COMPENSATION_TYPES.RESTORE_ENCRYPTED_RECORD:
        await this.restoreEncryptedRecord(
          compensation.payload as unknown as RestoreEncryptedPayload,
        );

        return;

      default:
        throw new Error(
          `Unsupported Laboratory compensation type: ${compensation.type}`,
        );
    }
  }

  private async deleteCreatedRecord(
    payload: DeleteCreatedPayload,
  ): Promise<void> {
    const model =
      collectionModel(payload.collection);

    await model.deleteOne({
      _id: toObjectId(
        payload.entityId,
        'entityId',
      ),
      transactionId: payload.transactionId,
      version: 0,
    }).exec();
  }

  private async deleteCreatedRecordSet(
    payload: DeleteCreatedSetPayload,
  ): Promise<void> {
    const model =
      collectionModel(payload.collection);

    await model.deleteMany({
      _id: {
        $in: payload.entityIds.map((entityId) =>
          toObjectId(entityId, 'entityIds'),
        ),
      },
      transactionId: payload.transactionId,
      version: 0,
    }).exec();
  }

  private async restoreEncryptedRecord(
    payload: RestoreEncryptedPayload,
  ): Promise<void> {
    if (
      !this.snapshotCrypto.matchesHash(
        this.snapshotCrypto.unprotect(
          payload.encryptedSnapshot,
          payload.associatedData,
        ),
        payload.associatedData,
        payload.snapshotHash,
      )
    ) {
      throw new Error(
        'Laboratory compensation snapshot integrity verification failed',
      );
    }

    const snapshot =
      this.snapshotCrypto.unprotect<Record<string, unknown>>(
        payload.encryptedSnapshot,
        payload.associatedData,
      );

    const model =
      collectionModel(payload.collection);

    const result =
      await model.updateOne(
        {
          _id: toObjectId(
            payload.entityId,
            'entityId',
          ),
          version: payload.expectedPostVersion,
        },
        {
          $set: snapshot,
        },
        {
          runValidators: true,
        },
      ).exec();

    if (result.matchedCount !== 1) {
      throw new Error(
        'Laboratory compensation could not restore the expected record version',
      );
    }
  }
}