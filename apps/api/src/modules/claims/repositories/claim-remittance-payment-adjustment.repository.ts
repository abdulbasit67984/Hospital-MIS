import {
  ClaimAdjustmentModel,
  ClaimPaymentModel,
  ClaimRemittanceModel,
  decimal128,
  toObjectId,
} from '@hospital-mis/database';

import type {
  ClaimAdjustmentRepositoryPort,
  ClaimPaymentAllocationRepositoryPort,
  ClaimRemittanceRepositoryPort,
} from '../claims.ports.js';

import type {
  ClaimAdjustmentRecord,
  ClaimPaymentAllocationRecord,
  ClaimRemittanceRecord,
  ClaimsMongoSession,
} from '../claims.persistence.types.js';

import {
  stableClaimPayloadHash,
} from '../claims.normalization.js';

import {
  claimRecord,
  nullableClaimObjectIdValue,
  throwMappedClaimsPersistenceError,
  withClaimsSession,
} from './claims-repository.support.js';

interface CalculatedRemittance {
  operationKey: string;
  allocatedAmount: string;
  unappliedAmount: string;
  importedAt: Date;
  allocations: readonly Readonly<{
    claimId: string;
    claimLineId: string | null;
    paidAmount: string;
    contractualAdjustmentAmount: string;
    disallowedAmount: string;
    withholdingAmount: string;
    payerClaimReference: string | null;
    payerLineReference: string | null;
  }>[];
}

function remittanceCalculation(
  value: Readonly<Record<string, unknown>>,
): CalculatedRemittance {
  return value as unknown as CalculatedRemittance;
}

export class MongoClaimRemittanceRepository
implements ClaimRemittanceRepositoryPort {
  public async create(
    actor: Parameters<ClaimRemittanceRepositoryPort['create']>[0],
    input: Parameters<ClaimRemittanceRepositoryPort['create']>[1],
    remittanceNumber: string,
    calculatedInput: Parameters<ClaimRemittanceRepositoryPort['create']>[3],
    transaction: Parameters<ClaimRemittanceRepositoryPort['create']>[4],
  ): Promise<ClaimRemittanceRecord> {
    const calculated = remittanceCalculation(calculatedInput);
    const hashPayload = {
      facilityId: actor.facilityId,
      remittanceNumber,
      payerOrganizationId: input.payerOrganizationId,
      remittanceReference: input.remittanceReference,
      remittanceDate: input.remittanceDate,
      sponsorPaymentId: input.paymentId ?? null,
      totalPaymentAmount: input.totalPaymentAmount,
      allocatedAmount: calculated.allocatedAmount,
      unappliedAmount: calculated.unappliedAmount,
      allocations: calculated.allocations,
      transactionId: transaction.transactionId,
    };

    try {
      const [created] = await ClaimRemittanceModel.create(
        [{
          facilityId: toObjectId(actor.facilityId, 'facilityId'),
          transactionId: transaction.transactionId,
          correlationId: actor.correlationId,
          schemaVersion: 1,
          version: 0,
          createdBy: toObjectId(actor.userId, 'createdBy'),
          updatedBy: toObjectId(actor.userId, 'updatedBy'),
          operationKey: calculated.operationKey,
          remittanceNumber,
          payerOrganizationId: toObjectId(
            input.payerOrganizationId,
            'payerOrganizationId',
          ),
          remittanceReference: input.remittanceReference,
          remittanceDate: new Date(input.remittanceDate),
          sponsorPaymentId: nullableClaimObjectIdValue(
            input.paymentId,
            'sponsorPaymentId',
          ),
          sponsorPaymentReference: input.sponsorPaymentReference ?? null,
          currency: input.currency ?? 'PKR',
          totalPaymentAmount: decimal128(input.totalPaymentAmount),
          allocatedAmount: decimal128(calculated.allocatedAmount),
          unappliedAmount: decimal128(calculated.unappliedAmount),
          attachmentId: nullableClaimObjectIdValue(
            input.attachmentId,
            'attachmentId',
          ),
          allocations: calculated.allocations.map((allocation) => ({
            claimId: toObjectId(allocation.claimId, 'claimId'),
            claimLineId: nullableClaimObjectIdValue(
              allocation.claimLineId,
              'claimLineId',
            ),
            paidAmount: decimal128(allocation.paidAmount),
            contractualAdjustmentAmount: decimal128(
              allocation.contractualAdjustmentAmount,
            ),
            disallowedAmount: decimal128(allocation.disallowedAmount),
            withholdingAmount: decimal128(allocation.withholdingAmount),
            payerClaimReference: allocation.payerClaimReference,
            payerLineReference: allocation.payerLineReference,
          })),
          importedBy: toObjectId(actor.userId, 'importedBy'),
          importedAt: calculated.importedAt,
          immutableHash: stableClaimPayloadHash(hashPayload),
          reversedAt: null,
          reversedBy: null,
          reversalReason: null,
        }],
        { session: transaction.session },
      );

      return claimRecord<ClaimRemittanceRecord>(created!.toObject());
    } catch (error) {
      throwMappedClaimsPersistenceError(error);
    }
  }

  public async findByReference(
    facilityId: string,
    payerOrganizationId: string,
    remittanceReference: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimRemittanceRecord | null> {
    return claimRecord<ClaimRemittanceRecord | null>(
      await withClaimsSession(
        ClaimRemittanceModel.findOne({
          facilityId: toObjectId(facilityId, 'facilityId'),
          payerOrganizationId: toObjectId(
            payerOrganizationId,
            'payerOrganizationId',
          ),
          remittanceReference,
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async findById(
    facilityId: string,
    remittanceId: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimRemittanceRecord | null> {
    return claimRecord<ClaimRemittanceRecord | null>(
      await withClaimsSession(
        ClaimRemittanceModel.findOne({
          _id: toObjectId(remittanceId, 'remittanceId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }
}

export class MongoClaimPaymentAllocationRepository
implements ClaimPaymentAllocationRepositoryPort {
  public async appendMany(
    actor: Parameters<ClaimPaymentAllocationRepositoryPort['appendMany']>[0],
    allocations: Parameters<ClaimPaymentAllocationRepositoryPort['appendMany']>[1],
    transaction: Parameters<ClaimPaymentAllocationRepositoryPort['appendMany']>[2],
  ): Promise<readonly ClaimPaymentAllocationRecord[]> {
    if (allocations.length === 0) {
      return [];
    }

    try {
      const created = await ClaimPaymentModel.create(
        allocations.map((allocation, index) => {
          const payload = {
            facilityId: actor.facilityId,
            claimId: String(allocation['claimId']),
            claimLineId:
              allocation['claimLineId'] == null
                ? null
                : String(allocation['claimLineId']),
            remittanceId: String(allocation['remittanceId']),
            sponsorPaymentId: String(allocation['sponsorPaymentId']),
            amount: String(allocation['amount']),
            operationKey: String(allocation['operationKey']),
            transactionId: transaction.transactionId,
            index,
          };

          return {
            facilityId: toObjectId(actor.facilityId, 'facilityId'),
            transactionId: transaction.transactionId,
            correlationId: actor.correlationId,
            schemaVersion: 1,
            version: 0,
            createdBy: toObjectId(actor.userId, 'createdBy'),
            updatedBy: toObjectId(actor.userId, 'updatedBy'),
            operationKey: payload.operationKey,
            claimId: toObjectId(payload.claimId, 'claimId'),
            claimLineId: nullableClaimObjectIdValue(
              payload.claimLineId,
              'claimLineId',
            ),
            remittanceId: toObjectId(payload.remittanceId, 'remittanceId'),
            sponsorPaymentId: toObjectId(
              payload.sponsorPaymentId,
              'sponsorPaymentId',
            ),
            amount: decimal128(payload.amount),
            postedBy: toObjectId(actor.userId, 'postedBy'),
            postedAt:
              allocation['postedAt'] instanceof Date
                ? allocation['postedAt']
                : new Date(String(allocation['postedAt'])),
            immutableHash: stableClaimPayloadHash(payload),
            reversedAt: null,
            reversedBy: null,
            reversalReason: null,
          };
        }),
        { session: transaction.session, ordered: true },
      );

      return created.map((record) =>
        claimRecord<ClaimPaymentAllocationRecord>(record.toObject()),
      );
    } catch (error) {
      throwMappedClaimsPersistenceError(error);
    }
  }

  public async listByClaim(
    facilityId: string,
    claimId: string,
    session?: ClaimsMongoSession,
  ): Promise<readonly ClaimPaymentAllocationRecord[]> {
    return claimRecord<ClaimPaymentAllocationRecord[]>(
      await withClaimsSession(
        ClaimPaymentModel.find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          claimId: toObjectId(claimId, 'claimId'),
          reversedAt: null,
        })
          .sort({ postedAt: 1 })
          .lean(),
        session,
      ).exec(),
    );
  }
}

export class MongoClaimAdjustmentRepository
implements ClaimAdjustmentRepositoryPort {
  public async create(
    actor: Parameters<ClaimAdjustmentRepositoryPort['create']>[0],
    claimId: string,
    input: Parameters<ClaimAdjustmentRepositoryPort['create']>[2],
    adjustmentType: string,
    transaction: Parameters<ClaimAdjustmentRepositoryPort['create']>[4],
  ): Promise<ClaimAdjustmentRecord> {
    const requestedAt = new Date();
    const hashPayload = {
      facilityId: actor.facilityId,
      claimId,
      claimLineId: input.claimLineId ?? null,
      adjustmentType,
      amount: input.amount,
      reason: input.reason,
      makerUserId: actor.userId,
      requestedAt: requestedAt.toISOString(),
      transactionId: transaction.transactionId,
    };

    const approvalRequestId =
      'approvalRequestId' in input
        ? input.approvalRequestId
        : null;

    const [created] = await ClaimAdjustmentModel.create(
      [{
        facilityId: toObjectId(actor.facilityId, 'facilityId'),
        transactionId: transaction.transactionId,
        correlationId: actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: toObjectId(actor.userId, 'createdBy'),
        updatedBy: toObjectId(actor.userId, 'updatedBy'),
        claimId: toObjectId(claimId, 'claimId'),
        claimLineId: nullableClaimObjectIdValue(
          input.claimLineId,
          'claimLineId',
        ),
        adjustmentType,
        amount: decimal128(input.amount),
        reason: input.reason,
        makerUserId: toObjectId(actor.userId, 'makerUserId'),
        checkerUserId: null,
        approvalRequestId: nullableClaimObjectIdValue(
          approvalRequestId,
          'approvalRequestId',
        ),
        status: 'REQUESTED',
        requestedAt,
        postedAt: null,
        immutableHash: stableClaimPayloadHash(hashPayload),
        reversedAt: null,
        reversedBy: null,
        reversalReason: null,
      }],
      { session: transaction.session },
    );

    return claimRecord<ClaimAdjustmentRecord>(created!.toObject());
  }

  public async findById(
    facilityId: string,
    adjustmentId: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimAdjustmentRecord | null> {
    return claimRecord<ClaimAdjustmentRecord | null>(
      await withClaimsSession(
        ClaimAdjustmentModel.findOne({
          _id: toObjectId(adjustmentId, 'adjustmentId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async listByClaim(
    facilityId: string,
    claimId: string,
    session?: ClaimsMongoSession,
  ): Promise<readonly ClaimAdjustmentRecord[]> {
    return claimRecord<ClaimAdjustmentRecord[]>(
      await withClaimsSession(
        ClaimAdjustmentModel.find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          claimId: toObjectId(claimId, 'claimId'),
        })
          .sort({ requestedAt: 1 })
          .lean(),
        session,
      ).exec(),
    );
  }

  public async approveAndPost(
    facilityId: string,
    adjustmentId: string,
    expectedVersion: number,
    approvalRequestId: string,
    checkerUserId: string,
    transaction: Parameters<ClaimAdjustmentRepositoryPort['approveAndPost']>[5],
  ): Promise<ClaimAdjustmentRecord | null> {
    return claimRecord<ClaimAdjustmentRecord | null>(
      await ClaimAdjustmentModel.findOneAndUpdate(
        {
          _id: toObjectId(adjustmentId, 'adjustmentId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          status: 'REQUESTED',
          version: expectedVersion,
          makerUserId: { $ne: toObjectId(checkerUserId, 'checkerUserId') },
        },
        {
          $set: {
            checkerUserId: toObjectId(checkerUserId, 'checkerUserId'),
            approvalRequestId: toObjectId(
              approvalRequestId,
              'approvalRequestId',
            ),
            status: 'POSTED',
            postedAt: new Date(),
            updatedBy: toObjectId(checkerUserId, 'updatedBy'),
            transactionId: transaction.transactionId,
          },
          $inc: { version: 1 },
        },
        {
          session: transaction.session,
          new: true,
          runValidators: true,
        },
      )
        .lean()
        .exec(),
    );
  }
}