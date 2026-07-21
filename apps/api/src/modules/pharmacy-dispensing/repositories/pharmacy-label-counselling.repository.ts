import {
  DispensingLabelModel,
  DispensingLabelPrintModel,
  PharmacyCounsellingRecordModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  ClientSession,
} from 'mongoose';

import type {
  PharmacyCounsellingRecord,
  PharmacyDispensingLabelPrintRecord,
  PharmacyDispensingLabelRecord,
} from '../pharmacy-dispensing.persistence.types.js';

type CreateLabelRecord =
  Omit<
    PharmacyDispensingLabelRecord,
    '_id' | 'createdAt' | 'updatedAt'
  >;

type CreateLabelPrintRecord =
  Omit<
    PharmacyDispensingLabelPrintRecord,
    '_id' | 'createdAt' | 'updatedAt'
  >;

type CreateCounsellingRecord =
  Omit<
    PharmacyCounsellingRecord,
    '_id' | 'createdAt' | 'updatedAt'
  >;

function record<T>(value: unknown): T {
  return value as T;
}

export class PharmacyLabelCounsellingRepository {
  public async createLabel(
    input: CreateLabelRecord,
    session: ClientSession,
  ): Promise<PharmacyDispensingLabelRecord> {
    const [created] =
      await DispensingLabelModel.create(
        [input],
        { session },
      );

    if (created === undefined) {
      throw new Error(
        'Dispensing-label creation returned no record',
      );
    }

    return record<PharmacyDispensingLabelRecord>(
      created.toObject(),
    );
  }

  public async findLabel(
    facilityId: string,
    labelId: string,
    session?: ClientSession,
  ): Promise<PharmacyDispensingLabelRecord | null> {
    const query =
      DispensingLabelModel.findOne({
        _id:
          toObjectId(
            labelId,
            'labelId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          [
            '+patientDisplayName',
            '+patientIdentifierSnapshot',
            '+instructions',
            '+voidReason',
          ].join(' '),
        )
        .lean();

    if (session !== undefined) {
      query.session(session);
    }

    return record<
      PharmacyDispensingLabelRecord | null
    >(await query.exec());
  }

  public async findLatestItemLabel(
    facilityId: string,
    dispensationItemId: string,
    session?: ClientSession,
  ): Promise<PharmacyDispensingLabelRecord | null> {
    const query =
      DispensingLabelModel.findOne({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        dispensationItemId:
          toObjectId(
            dispensationItemId,
            'dispensationItemId',
          ),

        status: {
          $ne: 'VOID',
        },
      })
        .select(
          [
            '+patientDisplayName',
            '+patientIdentifierSnapshot',
            '+instructions',
          ].join(' '),
        )
        .sort({
          templateVersion: -1,
          createdAt: -1,
        })
        .lean();

    if (session !== undefined) {
      query.session(session);
    }

    return record<
      PharmacyDispensingLabelRecord | null
    >(await query.exec());
  }

  public async updateLabelPrintState(
    facilityId: string,
    labelId: string,
    expectedVersion: number,
    actorUserId: string,
    printedAt: Date,
    session: ClientSession,
  ): Promise<PharmacyDispensingLabelRecord | null> {
    return record<
      PharmacyDispensingLabelRecord | null
    >(
      await DispensingLabelModel.findOneAndUpdate(
        {
          _id:
            toObjectId(
              labelId,
              'labelId',
            ),

          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          version:
            expectedVersion,

          status: {
            $ne: 'VOID',
          },
        },
        {
          $set: {
            status:
              'PRINTED',

            lastPrintedAt:
              printedAt,

            updatedBy:
              toObjectId(
                actorUserId,
                'actorUserId',
              ),
          },

          $inc: {
            printCount: 1,
            version: 1,
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
            '+patientDisplayName',
            '+patientIdentifierSnapshot',
            '+instructions',
          ].join(' '),
        )
        .lean()
        .exec(),
    );
  }

  public async appendPrint(
    input: CreateLabelPrintRecord,
    session: ClientSession,
  ): Promise<PharmacyDispensingLabelPrintRecord> {
    const [created] =
      await DispensingLabelPrintModel.create(
        [input],
        { session },
      );

    if (created === undefined) {
      throw new Error(
        'Dispensing-label print history creation returned no record',
      );
    }

    return record<PharmacyDispensingLabelPrintRecord>(
      created.toObject(),
    );
  }

  public async findLatestPrint(
    facilityId: string,
    labelId: string,
    session?: ClientSession,
  ): Promise<PharmacyDispensingLabelPrintRecord | null> {
    const query =
      DispensingLabelPrintModel.findOne({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        dispensingLabelId:
          toObjectId(
            labelId,
            'labelId',
          ),
      })
        .sort({
          printSequence: -1,
          printedAt: -1,
        })
        .lean();

    if (session !== undefined) {
      query.session(session);
    }

    return record<
      PharmacyDispensingLabelPrintRecord | null
    >(await query.exec());
  }

  public async createCounselling(
    input: CreateCounsellingRecord,
    session: ClientSession,
  ): Promise<PharmacyCounsellingRecord> {
    const [created] =
      await PharmacyCounsellingRecordModel.create(
        [input],
        { session },
      );

    if (created === undefined) {
      throw new Error(
        'Pharmacy counselling creation returned no record',
      );
    }

    return record<PharmacyCounsellingRecord>(
      created.toObject(),
    );
  }

  public async findLatestCounselling(
    facilityId: string,
    dispensationId: string,
    session?: ClientSession,
  ): Promise<PharmacyCounsellingRecord | null> {
    const query =
      PharmacyCounsellingRecordModel.findOne({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        dispensationId:
          toObjectId(
            dispensationId,
            'dispensationId',
          ),
      })
        .select(
          [
            '+interpreterName',
            '+caregiverName',
            '+declinedReason',
            '+unableReason',
            '+notes',
          ].join(' '),
        )
        .sort({
          createdAt: -1,
        })
        .lean();

    if (session !== undefined) {
      query.session(session);
    }

    return record<
      PharmacyCounsellingRecord | null
    >(await query.exec());
  }
}