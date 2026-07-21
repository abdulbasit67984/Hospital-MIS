import {
  DispensationReversalModel,
  PatientReturnItemModel,
  PatientReturnModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  ClientSession,
} from 'mongoose';

import type {
  PharmacyDispensationReversalRecord,
  PharmacyPatientReturnItemRecord,
  PharmacyPatientReturnRecord,
} from '../pharmacy-dispensing.persistence.types.js';

export type CreatePharmacyPatientReturnRecord =
  Omit<
    PharmacyPatientReturnRecord,
    '_id' | 'createdAt' | 'updatedAt'
  >;

export type CreatePharmacyPatientReturnItemRecord =
  Omit<
    PharmacyPatientReturnItemRecord,
    '_id' | 'createdAt' | 'updatedAt'
  >;

export type CreatePharmacyDispensationReversalRecord =
  Omit<
    PharmacyDispensationReversalRecord,
    '_id' | 'createdAt' | 'updatedAt'
  >;

function record<T>(value: unknown): T {
  return value as T;
}

export class PharmacyReturnReversalRepository {
  public async createReturn(
    header: CreatePharmacyPatientReturnRecord,
    items: readonly CreatePharmacyPatientReturnItemRecord[],
    session: ClientSession,
  ): Promise<{
    header: PharmacyPatientReturnRecord;
    items: PharmacyPatientReturnItemRecord[];
  }> {
    const [createdHeader] =
      await PatientReturnModel.create(
        [header],
        { session },
      );

    if (createdHeader === undefined) {
      throw new Error(
        'Patient-return creation returned no header',
      );
    }

    const createdItems =
      await PatientReturnItemModel.create(
        items.map((item) => ({
          ...item,
          patientReturnId:
            createdHeader._id,
        })),
        { session },
      );

    return {
      header:
        record<PharmacyPatientReturnRecord>(
          createdHeader.toObject(),
        ),

      items:
        createdItems.map((item) =>
          record<PharmacyPatientReturnItemRecord>(
            item.toObject(),
          ),
        ),
    };
  }

  public async findReturn(
    facilityId: string,
    returnId: string,
    session?: ClientSession,
  ): Promise<PharmacyPatientReturnRecord | null> {
    const query =
      PatientReturnModel.findOne({
        _id:
          toObjectId(
            returnId,
            'returnId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          [
            '+reason',
            '+recoveryReason',
            '+lastFailureCode',
            '+billingOperationKey',
          ].join(' '),
        )
        .lean();

    if (session !== undefined) {
      query.session(session);
    }

    return record<
      PharmacyPatientReturnRecord | null
    >(await query.exec());
  }

  public async listReturnItems(
    facilityId: string,
    returnId: string,
    session?: ClientSession,
  ): Promise<PharmacyPatientReturnItemRecord[]> {
    const query =
      PatientReturnItemModel.find({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        patientReturnId:
          toObjectId(
            returnId,
            'returnId',
          ),
      })
        .select(
          [
            '+assessmentNotes',
            '+dispositionReason',
          ].join(' '),
        )
        .sort({
          lineNumber: 1,
          _id: 1,
        })
        .lean();

    if (session !== undefined) {
      query.session(session);
    }

    return record<
      PharmacyPatientReturnItemRecord[]
    >(await query.exec());
  }

  public async updateReturn(
    facilityId: string,
    returnId: string,
    expectedVersion: number,
    update: Record<string, unknown>,
    actorUserId: string,
    session: ClientSession,
  ): Promise<PharmacyPatientReturnRecord | null> {
    return record<
      PharmacyPatientReturnRecord | null
    >(
      await PatientReturnModel.findOneAndUpdate(
        {
          _id:
            toObjectId(
              returnId,
              'returnId',
            ),

          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          version:
            expectedVersion,
        },

        {
          ...update,

          $set: {
            ...(
              (
                update['$set'] ??
                {}
              ) as Record<string, unknown>
            ),

            updatedBy:
              toObjectId(
                actorUserId,
                'actorUserId',
              ),
          },
        },

        {
          new: true,
          runValidators: true,
          session,
        },
      )
        .select(
          [
            '+reason',
            '+recoveryReason',
            '+lastFailureCode',
            '+billingOperationKey',
          ].join(' '),
        )
        .lean()
        .exec(),
    );
  }

  public async updateReturnItem(
    facilityId: string,
    returnId: string,
    itemId: string,
    expectedVersion: number,
    update: Record<string, unknown>,
    actorUserId: string,
    session: ClientSession,
  ): Promise<PharmacyPatientReturnItemRecord | null> {
    return record<
      PharmacyPatientReturnItemRecord | null
    >(
      await PatientReturnItemModel.findOneAndUpdate(
        {
          _id:
            toObjectId(
              itemId,
              'returnItemId',
            ),

          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          patientReturnId:
            toObjectId(
              returnId,
              'returnId',
            ),

          version:
            expectedVersion,
        },

        {
          ...update,

          $set: {
            ...(
              (
                update['$set'] ??
                {}
              ) as Record<string, unknown>
            ),

            updatedBy:
              toObjectId(
                actorUserId,
                'actorUserId',
              ),
          },
        },

        {
          new: true,
          runValidators: true,
          session,
        },
      )
        .select(
          [
            '+assessmentNotes',
            '+dispositionReason',
          ].join(' '),
        )
        .lean()
        .exec(),
    );
  }

  public async createReversal(
    recordInput: CreatePharmacyDispensationReversalRecord,
    session: ClientSession,
  ): Promise<PharmacyDispensationReversalRecord> {
    const [created] =
      await DispensationReversalModel.create(
        [recordInput],
        { session },
      );

    if (created === undefined) {
      throw new Error(
        'Dispensation-reversal creation returned no record',
      );
    }

    return record<PharmacyDispensationReversalRecord>(
      created.toObject(),
    );
  }

  public async findReversal(
    facilityId: string,
    reversalId: string,
    session?: ClientSession,
  ): Promise<PharmacyDispensationReversalRecord | null> {
    const query =
      DispensationReversalModel.findOne({
        _id:
          toObjectId(
            reversalId,
            'reversalId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          [
            '+reason',
            '+recoveryReason',
            '+lastFailureCode',
            '+billingOperationKey',
          ].join(' '),
        )
        .lean();

    if (session !== undefined) {
      query.session(session);
    }

    return record<
      PharmacyDispensationReversalRecord | null
    >(await query.exec());
  }

  public async findActiveReversalByDispensation(
    facilityId: string,
    dispensationId: string,
    session?: ClientSession,
  ): Promise<PharmacyDispensationReversalRecord | null> {
    const query =
      DispensationReversalModel.findOne({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        originalDispensationId:
          toObjectId(
            dispensationId,
            'dispensationId',
          ),

        status: {
          $in: [
            'REQUESTED',
            'APPROVED',
            'IN_PROGRESS',
            'RECOVERY_REQUIRED',
          ],
        },
      })
        .select(
          [
            '+reason',
            '+recoveryReason',
            '+lastFailureCode',
            '+billingOperationKey',
          ].join(' '),
        )
        .lean();

    if (session !== undefined) {
      query.session(session);
    }

    return record<
      PharmacyDispensationReversalRecord | null
    >(await query.exec());
  }

  public async updateReversal(
    facilityId: string,
    reversalId: string,
    expectedVersion: number,
    update: Record<string, unknown>,
    actorUserId: string,
    session: ClientSession,
  ): Promise<PharmacyDispensationReversalRecord | null> {
    return record<
      PharmacyDispensationReversalRecord | null
    >(
      await DispensationReversalModel.findOneAndUpdate(
        {
          _id:
            toObjectId(
              reversalId,
              'reversalId',
            ),

          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          version:
            expectedVersion,
        },

        {
          ...update,

          $set: {
            ...(
              (
                update['$set'] ??
                {}
              ) as Record<string, unknown>
            ),

            updatedBy:
              toObjectId(
                actorUserId,
                'actorUserId',
              ),
          },
        },

        {
          new: true,
          runValidators: true,
          session,
        },
      )
        .select(
          [
            '+reason',
            '+recoveryReason',
            '+lastFailureCode',
            '+billingOperationKey',
          ].join(' '),
        )
        .lean()
        .exec(),
    );
  }

  public async listReturnsRequiringRecovery(
    facilityId: string,
    before: Date,
    limit: number,
  ): Promise<PharmacyPatientReturnRecord[]> {
    return record<
      PharmacyPatientReturnRecord[]
    >(
      await PatientReturnModel.find({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        finalizationState: {
          $in: [
            'RECOVERY_REQUIRED',
            'COMPENSATION_REQUIRED',
          ],
        },

        finalizationUpdatedAt: {
          $lte: before,
        },
      })
        .select(
          [
            '+reason',
            '+recoveryReason',
            '+lastFailureCode',
            '+billingOperationKey',
          ].join(' '),
        )
        .sort({
          finalizationUpdatedAt: 1,
          _id: 1,
        })
        .limit(limit)
        .lean()
        .exec(),
    );
  }

  public async listReversalsRequiringRecovery(
    facilityId: string,
    before: Date,
    limit: number,
  ): Promise<PharmacyDispensationReversalRecord[]> {
    return record<
      PharmacyDispensationReversalRecord[]
    >(
      await DispensationReversalModel.find({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        finalizationState: {
          $in: [
            'RECOVERY_REQUIRED',
            'COMPENSATION_REQUIRED',
          ],
        },

        finalizationUpdatedAt: {
          $lte: before,
        },
      })
        .select(
          [
            '+reason',
            '+recoveryReason',
            '+lastFailureCode',
            '+billingOperationKey',
          ].join(' '),
        )
        .sort({
          finalizationUpdatedAt: 1,
          _id: 1,
        })
        .limit(limit)
        .lean()
        .exec(),
    );
  }
}