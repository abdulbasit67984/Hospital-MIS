import {
  ClaimAdjudicationModel,
  ClaimDenialModel,
  decimal128,
  toObjectId,
} from '@hospital-mis/database';

import type {
  ClaimAdjudicationRepositoryPort,
  ClaimDenialRepositoryPort,
} from '../claims.ports.js';

import type {
  ClaimAdjudicationRecord,
  ClaimDenialRecord,
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

interface CalculatedAdjudicationLine {
  claimLineId: string;
  decision: string;
  claimedAmount: string;
  approvedAmount: string;
  deniedAmount: string;
  disallowedAmount: string;
  returnedAmount: string;
  contractualAdjustmentAmount: string;
  payerLineReference: string | null;
  denialCategory: string | null;
  reasonCode: string | null;
  reasonDescription: string | null;
}

interface CalculatedAdjudication {
  adjudicationSequence: number;
  claimedAmount: string;
  approvedAmount: string;
  deniedAmount: string;
  disallowedAmount: string;
  returnedAmount: string;
  contractualAdjustmentAmount: string;
  notesEncrypted: string | null;
  lines: readonly CalculatedAdjudicationLine[];
}

function adjudicationCalculation(
  value: Readonly<Record<string, unknown>>,
): CalculatedAdjudication {
  return value as unknown as CalculatedAdjudication;
}

export class MongoClaimAdjudicationRepository
implements ClaimAdjudicationRepositoryPort {
  public async create(
    actor: Parameters<ClaimAdjudicationRepositoryPort['create']>[0],
    claimId: string,
    input: Parameters<ClaimAdjudicationRepositoryPort['create']>[2],
    calculatedInput: Parameters<ClaimAdjudicationRepositoryPort['create']>[3],
    transaction: Parameters<ClaimAdjudicationRepositoryPort['create']>[4],
  ): Promise<ClaimAdjudicationRecord> {
    const calculated = adjudicationCalculation(calculatedInput);
    const recordedAt = new Date();
    const hashPayload = {
      facilityId: actor.facilityId,
      claimId,
      sequence: calculated.adjudicationSequence,
      payerReferenceNumber: input.payerReferenceNumber,
      decisionReference: input.decisionReference ?? null,
      adjudicatedAt: input.adjudicatedAt,
      totals: {
        claimedAmount: calculated.claimedAmount,
        approvedAmount: calculated.approvedAmount,
        deniedAmount: calculated.deniedAmount,
        disallowedAmount: calculated.disallowedAmount,
        returnedAmount: calculated.returnedAmount,
        contractualAdjustmentAmount:
          calculated.contractualAdjustmentAmount,
      },
      lines: calculated.lines,
      transactionId: transaction.transactionId,
      correlationId: actor.correlationId,
    };

    try {
      const [created] = await ClaimAdjudicationModel.create(
        [{
          facilityId: toObjectId(actor.facilityId, 'facilityId'),
          transactionId: transaction.transactionId,
          correlationId: actor.correlationId,
          schemaVersion: 1,
          version: 0,
          createdBy: toObjectId(actor.userId, 'createdBy'),
          updatedBy: toObjectId(actor.userId, 'updatedBy'),
          claimId: toObjectId(claimId, 'claimId'),
          adjudicationSequence: calculated.adjudicationSequence,
          payerReferenceNumber: input.payerReferenceNumber,
          decisionReference: input.decisionReference ?? null,
          claimedAmount: decimal128(calculated.claimedAmount),
          approvedAmount: decimal128(calculated.approvedAmount),
          deniedAmount: decimal128(calculated.deniedAmount),
          disallowedAmount: decimal128(calculated.disallowedAmount),
          returnedAmount: decimal128(calculated.returnedAmount),
          contractualAdjustmentAmount: decimal128(
            calculated.contractualAdjustmentAmount,
          ),
          lines: calculated.lines.map((line) => ({
            claimLineId: toObjectId(line.claimLineId, 'claimLineId'),
            decision: line.decision,
            claimedAmount: decimal128(line.claimedAmount),
            approvedAmount: decimal128(line.approvedAmount),
            deniedAmount: decimal128(line.deniedAmount),
            disallowedAmount: decimal128(line.disallowedAmount),
            returnedAmount: decimal128(line.returnedAmount),
            contractualAdjustmentAmount: decimal128(
              line.contractualAdjustmentAmount,
            ),
            payerLineReference: line.payerLineReference,
            denialCategory: line.denialCategory,
            reasonCode: line.reasonCode,
            reasonDescription: line.reasonDescription,
          })),
          explanationOfBenefitsAttachmentId: nullableClaimObjectIdValue(
            input.explanationOfBenefitsAttachmentId,
            'explanationOfBenefitsAttachmentId',
          ),
          notesEncrypted: calculated.notesEncrypted,
          recordedBy: toObjectId(actor.userId, 'recordedBy'),
          adjudicatedAt: new Date(input.adjudicatedAt),
          recordedAt,
          immutableHash: stableClaimPayloadHash(hashPayload),
          reversedAt: null,
          reversedBy: null,
          reversalReason: null,
        }],
        { session: transaction.session },
      );

      return claimRecord<ClaimAdjudicationRecord>(created!.toObject());
    } catch (error) {
      throwMappedClaimsPersistenceError(error);
    }
  }

  public async findById(
    facilityId: string,
    adjudicationId: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimAdjudicationRecord | null> {
    return claimRecord<ClaimAdjudicationRecord | null>(
      await withClaimsSession(
        ClaimAdjudicationModel.findOne({
          _id: toObjectId(adjudicationId, 'adjudicationId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async findLatest(
    facilityId: string,
    claimId: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimAdjudicationRecord | null> {
    return claimRecord<ClaimAdjudicationRecord | null>(
      await withClaimsSession(
        ClaimAdjudicationModel.findOne({
          facilityId: toObjectId(facilityId, 'facilityId'),
          claimId: toObjectId(claimId, 'claimId'),
          reversedAt: null,
        })
          .sort({ adjudicationSequence: -1 })
          .lean(),
        session,
      ).exec(),
    );
  }
}

export class MongoClaimDenialRepository
implements ClaimDenialRepositoryPort {
  public async createMany(
    actor: Parameters<ClaimDenialRepositoryPort['createMany']>[0],
    denials: Parameters<ClaimDenialRepositoryPort['createMany']>[1],
    transaction: Parameters<ClaimDenialRepositoryPort['createMany']>[2],
  ): Promise<readonly ClaimDenialRecord[]> {
    if (denials.length === 0) {
      return [];
    }

    try {
      const created = await ClaimDenialModel.create(
        denials.map((denial) => ({
          facilityId: toObjectId(actor.facilityId, 'facilityId'),
          transactionId: transaction.transactionId,
          correlationId: actor.correlationId,
          schemaVersion: 1,
          version: 0,
          createdBy: toObjectId(actor.userId, 'createdBy'),
          updatedBy: toObjectId(actor.userId, 'updatedBy'),
          claimId: toObjectId(String(denial['claimId']), 'claimId'),
          claimLineId: nullableClaimObjectIdValue(
            denial['claimLineId'] == null
              ? null
              : String(denial['claimLineId']),
            'claimLineId',
          ),
          adjudicationId: toObjectId(
            String(denial['adjudicationId']),
            'adjudicationId',
          ),
          category: String(denial['category']),
          reasonCode:
            denial['reasonCode'] == null
              ? null
              : String(denial['reasonCode']),
          reasonDescription: String(denial['reasonDescription']),
          deniedAmount: decimal128(String(denial['deniedAmount'])),
          appealEligible: Boolean(denial['appealEligible']),
          appealDeadline:
            denial['appealDeadline'] == null
              ? null
              : new Date(String(denial['appealDeadline'])),
          resolved: false,
          resolvedAt: null,
          resolvedBy: null,
          resolution: null,
        })),
        { session: transaction.session, ordered: true },
      );

      return created.map((record) =>
        claimRecord<ClaimDenialRecord>(record.toObject()),
      );
    } catch (error) {
      throwMappedClaimsPersistenceError(error);
    }
  }

  public async findByIds(
    facilityId: string,
    claimId: string,
    denialIds: readonly string[],
    session?: ClaimsMongoSession,
  ): Promise<readonly ClaimDenialRecord[]> {
    return claimRecord<ClaimDenialRecord[]>(
      await withClaimsSession(
        ClaimDenialModel.find({
          _id: {
            $in: denialIds.map((id) => toObjectId(id, 'denialId')),
          },
          facilityId: toObjectId(facilityId, 'facilityId'),
          claimId: toObjectId(claimId, 'claimId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async listByClaim(
    facilityId: string,
    claimId: string,
    session?: ClaimsMongoSession,
  ): Promise<readonly ClaimDenialRecord[]> {
    return claimRecord<ClaimDenialRecord[]>(
      await withClaimsSession(
        ClaimDenialModel.find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          claimId: toObjectId(claimId, 'claimId'),
        })
          .sort({ createdAt: 1 })
          .lean(),
        session,
      ).exec(),
    );
  }

  public async resolveMany(
    facilityId: string,
    denialIds: readonly string[],
    resolution: string,
    actorUserId: string,
    transaction: Parameters<ClaimDenialRepositoryPort['resolveMany']>[4],
  ): Promise<number> {
    if (denialIds.length === 0) {
      return 0;
    }

    const result = await ClaimDenialModel.updateMany(
      {
        _id: {
          $in: denialIds.map((id) => toObjectId(id, 'denialId')),
        },
        facilityId: toObjectId(facilityId, 'facilityId'),
        resolved: false,
      },
      {
        $set: {
          resolved: true,
          resolvedAt: new Date(),
          resolvedBy: toObjectId(actorUserId, 'resolvedBy'),
          resolution,
          updatedBy: toObjectId(actorUserId, 'updatedBy'),
          transactionId: transaction.transactionId,
          correlationId: transaction.transactionId,
        },
        $inc: { version: 1 },
      },
      {
        session: transaction.session,
        runValidators: true,
      },
    ).exec();

    return result.modifiedCount;
  }
}