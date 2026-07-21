import {
  ControlledMedicineRegisterEntryModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  ClientSession,
} from 'mongoose';

import type {
  PharmacyControlledRegisterRecord,
} from '../pharmacy-dispensing.persistence.types.js';

import {
  PHARMACY_CONTROLLED_REGISTER_INTERNAL_SELECT,
} from '../pharmacy-dispensing.projections.js';

export type CreateControlledRegisterRecord =
  Omit<
    PharmacyControlledRegisterRecord,
    '_id' | 'createdAt' | 'updatedAt'
  >;

function record<T>(value: unknown): T {
  return value as T;
}

export class PharmacyControlledRegisterRepository {
  public async create(
    input: CreateControlledRegisterRecord,
    session: ClientSession,
  ): Promise<PharmacyControlledRegisterRecord> {
    const [created] =
      await ControlledMedicineRegisterEntryModel.create(
        [input],
        { session },
      );

    if (created === undefined) {
      throw new Error(
        'Controlled-medicine register creation returned no record',
      );
    }

    return record<PharmacyControlledRegisterRecord>(
      created.toObject(),
    );
  }

  public async findLatestBalance(
    facilityId: string,
    stockLocationId: string,
    inventoryItemId: string,
    inventoryBatchId: string | null,
    session?: ClientSession,
  ): Promise<PharmacyControlledRegisterRecord | null> {
    const query =
      ControlledMedicineRegisterEntryModel.findOne({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        stockLocationId:
          toObjectId(
            stockLocationId,
            'stockLocationId',
          ),

        inventoryItemId:
          toObjectId(
            inventoryItemId,
            'inventoryItemId',
          ),

        inventoryBatchId:
          inventoryBatchId === null
            ? null
            : toObjectId(
                inventoryBatchId,
                'inventoryBatchId',
              ),
      })
        .select(
          PHARMACY_CONTROLLED_REGISTER_INTERNAL_SELECT,
        )
        .sort({
          registerSequence: -1,
          occurredAt: -1,
          _id: -1,
        })
        .lean();

    if (session !== undefined) {
      query.session(session);
    }

    return record<
      PharmacyControlledRegisterRecord | null
    >(await query.exec());
  }

  public async findByOperationKey(
    facilityId: string,
    operationKey: string,
    session?: ClientSession,
  ): Promise<PharmacyControlledRegisterRecord | null> {
    const query =
      ControlledMedicineRegisterEntryModel.findOne({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        operationKey,
      })
        .select(
          PHARMACY_CONTROLLED_REGISTER_INTERNAL_SELECT,
        )
        .lean();

    if (session !== undefined) {
      query.session(session);
    }

    return record<
      PharmacyControlledRegisterRecord | null
    >(await query.exec());
  }
}