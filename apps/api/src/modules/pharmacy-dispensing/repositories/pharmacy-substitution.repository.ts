import {
  DispensationSubstitutionModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  ClientSession,
} from 'mongoose';

import type {
  PharmacyDispensationSubstitutionRecord,
} from '../pharmacy-dispensing.persistence.types.js';

export type CreatePharmacySubstitutionRecord =
  Omit<
    PharmacyDispensationSubstitutionRecord,
    '_id' | 'createdAt' | 'updatedAt'
  >;

export interface DecidePharmacySubstitutionInput {
  facilityId: string;
  substitutionId: string;
  expectedVersion: number;
  status:
    | 'AUTHORIZED'
    | 'REJECTED';
  actorUserId: string;
  actorStaffId: string;
  reason: string;
  occurredAt: Date;
  prescriberProviderId?: string | null;
  session: ClientSession;
}

function record<T>(value: unknown): T {
  return value as T;
}

export class PharmacySubstitutionRepository {
  public async create(
    input:
      CreatePharmacySubstitutionRecord,
    session: ClientSession,
  ): Promise<PharmacyDispensationSubstitutionRecord> {
    const [created] =
      await DispensationSubstitutionModel.create(
        [input],
        {
          session,
        },
      );

    if (created === undefined) {
      throw new Error(
        'Pharmacy substitution creation returned no record',
      );
    }

    return record<PharmacyDispensationSubstitutionRecord>(
      created.toObject(),
    );
  }

  public async findById(
    facilityId: string,
    substitutionId: string,
    session?: ClientSession,
  ): Promise<PharmacyDispensationSubstitutionRecord | null> {
    const query =
      DispensationSubstitutionModel.findOne({
        _id:
          toObjectId(
            substitutionId,
            'substitutionId',
          ),
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          '+reason +decisionReason',
        )
        .lean();

    if (session !== undefined) {
      query.session(session);
    }

    return record<
      PharmacyDispensationSubstitutionRecord | null
    >(
      await query.exec(),
    );
  }

  public async decide(
    input:
      DecidePharmacySubstitutionInput,
  ): Promise<PharmacyDispensationSubstitutionRecord | null> {
    const authorized =
      input.status === 'AUTHORIZED';

    return record<
      PharmacyDispensationSubstitutionRecord | null
    >(
      await DispensationSubstitutionModel.findOneAndUpdate(
        {
          _id:
            toObjectId(
              input.substitutionId,
              'substitutionId',
            ),
          facilityId:
            toObjectId(
              input.facilityId,
              'facilityId',
            ),
          status:
            'PROPOSED',
          version:
            input.expectedVersion,
        },
        {
          $set: {
            status:
              input.status,
            updatedBy:
              toObjectId(
                input.actorUserId,
                'actorUserId',
              ),
            decisionReason:
              input.reason,
            ...(authorized
              ? {
                  authorizedByStaffId:
                    toObjectId(
                      input.actorStaffId,
                      'actorStaffId',
                    ),
                  authorizedAt:
                    input.occurredAt,
                  prescriberAuthorizedByProviderId:
                    input.prescriberProviderId ===
                      undefined ||
                    input.prescriberProviderId ===
                      null
                      ? null
                      : toObjectId(
                          input.prescriberProviderId,
                          'prescriberProviderId',
                        ),
                  prescriberAuthorizedAt:
                    input.prescriberProviderId ===
                      undefined ||
                    input.prescriberProviderId ===
                      null
                      ? null
                      : input.occurredAt,
                }
              : {
                  rejectedByStaffId:
                    toObjectId(
                      input.actorStaffId,
                      'actorStaffId',
                    ),
                  rejectedAt:
                    input.occurredAt,
                }),
          },
          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          runValidators: true,
          session:
            input.session,
        },
      )
        .select(
          '+reason +decisionReason',
        )
        .lean()
        .exec(),
    );
  }
}