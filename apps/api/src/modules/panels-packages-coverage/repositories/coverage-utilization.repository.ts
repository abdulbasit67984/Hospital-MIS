import {
  CoverageBenefitBalanceModel,
  CoverageDeterminationModel,
  CoverageUtilizationModel,
  decimal128,
  toObjectId,
} from '@hospital-mis/database';

import type {
  CoverageUtilizationRepositoryPort,
} from '../panels-packages-coverage.ports.js';

import type {
  CoverageBenefitBalanceRecord,
  CoverageDeterminationRecord,
  CoverageUtilizationRecord,
} from '../panels-packages-coverage.persistence.types.js';

function record<T>(value: unknown): T {
  return value as T;
}

export class CoverageUtilizationRepository
implements CoverageUtilizationRepositoryPort {
  public async createDetermination(
    actor: Parameters<CoverageUtilizationRepositoryPort['createDetermination']>[0],
    input: Parameters<CoverageUtilizationRepositoryPort['createDetermination']>[1],
    transaction: Parameters<CoverageUtilizationRepositoryPort['createDetermination']>[2],
  ): Promise<CoverageDeterminationRecord> {
    const [created] = await CoverageDeterminationModel.create(
      [{
        ...input,
        facilityId: toObjectId(actor.facilityId, 'facilityId'),
        transactionId: transaction.transactionId,
        correlationId: actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: toObjectId(actor.userId, 'createdBy'),
        updatedBy: toObjectId(actor.userId, 'updatedBy'),
      }],
      { session: transaction.session },
    );

    return record<CoverageDeterminationRecord>(created!.toObject());
  }

  public async findBenefitBalance(
    facilityId: string,
    patientCoverageId: string,
    ruleCode: string,
    periodStart: Date,
    session: Parameters<CoverageUtilizationRepositoryPort['findBenefitBalance']>[4],
  ): Promise<CoverageBenefitBalanceRecord | null> {
    return record<CoverageBenefitBalanceRecord | null>(
      await CoverageBenefitBalanceModel.findOne({
        facilityId: toObjectId(facilityId, 'facilityId'),
        patientCoverageId: toObjectId(
          patientCoverageId,
          'patientCoverageId',
        ),
        ruleCode,
        periodStart,
      }).session(session).lean().exec(),
    );
  }

  public async reserveBenefit(
    balanceId: string,
    facilityId: string,
    expectedVersion: number,
    quantity: string,
    amount: string,
    actorUserId: string,
    transaction: Parameters<CoverageUtilizationRepositoryPort['reserveBenefit']>[6],
  ): Promise<CoverageBenefitBalanceRecord | null> {
    return record<CoverageBenefitBalanceRecord | null>(
      await CoverageBenefitBalanceModel.findOneAndUpdate(
        {
          _id: toObjectId(balanceId, 'balanceId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: expectedVersion,
        },
        {
          $inc: {
            reservedQuantity: decimal128(quantity),
            reservedAmount: decimal128(amount),
            version: 1,
          },
          $set: {
            updatedBy: toObjectId(actorUserId, 'updatedBy'),
            transactionId: transaction.transactionId,
          },
        },
        {
          new: true,
          runValidators: true,
          session: transaction.session,
        },
      ).lean().exec(),
    );
  }

  public async createUtilization(
    actor: Parameters<CoverageUtilizationRepositoryPort['createUtilization']>[0],
    input: Parameters<CoverageUtilizationRepositoryPort['createUtilization']>[1],
    transaction: Parameters<CoverageUtilizationRepositoryPort['createUtilization']>[2],
  ): Promise<CoverageUtilizationRecord> {
    const [created] = await CoverageUtilizationModel.create(
      [{
        ...input,
        facilityId: toObjectId(actor.facilityId, 'facilityId'),
        transactionId: transaction.transactionId,
        correlationId: actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: toObjectId(actor.userId, 'createdBy'),
        updatedBy: toObjectId(actor.userId, 'updatedBy'),
      }],
      { session: transaction.session },
    );

    return record<CoverageUtilizationRecord>(created!.toObject());
  }
}