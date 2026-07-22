import {
  ClaimAppealModel,
  decimal128,
  toObjectId,
} from '@hospital-mis/database';

import type {
  ClaimAppealRepositoryPort,
} from '../claims.ports.js';

import type {
  ClaimAppealRecord,
  ClaimsMongoSession,
} from '../claims.persistence.types.js';

import {
  claimRecord,
  withClaimsSession,
} from './claims-repository.support.js';

export class MongoClaimAppealRepository
implements ClaimAppealRepositoryPort {
  public async create(
    actor: Parameters<ClaimAppealRepositoryPort['create']>[0],
    claimId: string,
    appealNumber: string,
    input: Parameters<ClaimAppealRepositoryPort['create']>[3],
    encryptedGrounds: string,
    transaction: Parameters<ClaimAppealRepositoryPort['create']>[5],
  ): Promise<ClaimAppealRecord> {
    const [created] = await ClaimAppealModel.create(
      [{
        facilityId: toObjectId(actor.facilityId, 'facilityId'),
        transactionId: transaction.transactionId,
        correlationId: actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: toObjectId(actor.userId, 'createdBy'),
        updatedBy: toObjectId(actor.userId, 'updatedBy'),
        claimId: toObjectId(claimId, 'claimId'),
        appealNumber,
        denialIds: input.denialIds.map((id) =>
          toObjectId(id, 'denialId'),
        ),
        status: 'APPROVAL_PENDING',
        appealDeadline: new Date(input.appealDeadline),
        groundsEncrypted: encryptedGrounds,
        requestedAmount: decimal128(input.requestedAmount),
        approvedAdditionalAmount: decimal128('0.00'),
        evidenceAttachmentIds: input.evidenceAttachmentIds.map((id) =>
          toObjectId(id, 'evidenceAttachmentId'),
        ),
        approvalRequestId: null,
        approvedBy: null,
        approvedAt: null,
        submissionChannel: null,
        submissionReference: null,
        payerDecisionReference: null,
        assignedToUserId: null,
        submittedAt: null,
        acknowledgedAt: null,
        decidedAt: null,
        closedAt: null,
      }],
      { session: transaction.session },
    );

    return claimRecord<ClaimAppealRecord>(created!.toObject());
  }

  public async findById(
    facilityId: string,
    appealId: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimAppealRecord | null> {
    return claimRecord<ClaimAppealRecord | null>(
      await withClaimsSession(
        ClaimAppealModel.findOne({
          _id: toObjectId(appealId, 'appealId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async approve(
    facilityId: string,
    appealId: string,
    expectedVersion: number,
    input: Parameters<ClaimAppealRepositoryPort['approve']>[3],
    actorUserId: string,
    transaction: Parameters<ClaimAppealRepositoryPort['approve']>[5],
  ): Promise<ClaimAppealRecord | null> {
    return claimRecord<ClaimAppealRecord | null>(
      await ClaimAppealModel.findOneAndUpdate(
        {
          _id: toObjectId(appealId, 'appealId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: expectedVersion,
          status: 'APPROVAL_PENDING',
          createdBy: { $ne: toObjectId(actorUserId, 'approvedBy') },
        },
        {
          $set: {
            status: 'APPROVED_FOR_SUBMISSION',
            approvalRequestId: toObjectId(
              input.approvalRequestId,
              'approvalRequestId',
            ),
            approvedBy: toObjectId(actorUserId, 'approvedBy'),
            approvedAt: new Date(),
            updatedBy: toObjectId(actorUserId, 'updatedBy'),
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

  public async submit(
    facilityId: string,
    appealId: string,
    expectedVersion: number,
    input: Parameters<ClaimAppealRepositoryPort['submit']>[3],
    actorUserId: string,
    transaction: Parameters<ClaimAppealRepositoryPort['submit']>[5],
  ): Promise<ClaimAppealRecord | null> {
    return claimRecord<ClaimAppealRecord | null>(
      await ClaimAppealModel.findOneAndUpdate(
        {
          _id: toObjectId(appealId, 'appealId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: expectedVersion,
          status: 'APPROVED_FOR_SUBMISSION',
          approvalRequestId: toObjectId(
            input.approvalRequestId,
            'approvalRequestId',
          ),
        },
        {
          $set: {
            status: 'SUBMITTED',
            submissionChannel: input.submissionChannel,
            submissionReference: input.submissionReference,
            submittedAt: new Date(input.submittedAt),
            updatedBy: toObjectId(actorUserId, 'updatedBy'),
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

  public async recordDecision(
    facilityId: string,
    appealId: string,
    input: Parameters<ClaimAppealRepositoryPort['recordDecision']>[2],
    actorUserId: string,
    transaction: Parameters<ClaimAppealRepositoryPort['recordDecision']>[4],
  ): Promise<ClaimAppealRecord | null> {
    const closed = ['UPHELD', 'OVERTURNED', 'PARTIALLY_OVERTURNED'].includes(
      input.decision,
    );

    return claimRecord<ClaimAppealRecord | null>(
      await ClaimAppealModel.findOneAndUpdate(
        {
          _id: toObjectId(appealId, 'appealId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: input.expectedVersion,
          status: {
            $in: ['SUBMITTED', 'ACKNOWLEDGED', 'UNDER_REVIEW'],
          },
        },
        {
          $set: {
            status: input.decision,
            approvedAdditionalAmount: decimal128(
              input.approvedAdditionalAmount,
            ),
            payerDecisionReference:
              input.payerDecisionReference ?? null,
            decidedAt: new Date(input.decidedAt),
            closedAt: closed ? new Date(input.decidedAt) : null,
            updatedBy: toObjectId(actorUserId, 'updatedBy'),
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

  public async listByClaim(
    facilityId: string,
    claimId: string,
    session?: ClaimsMongoSession,
  ): Promise<readonly ClaimAppealRecord[]> {
    return claimRecord<ClaimAppealRecord[]>(
      await withClaimsSession(
        ClaimAppealModel.find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          claimId: toObjectId(claimId, 'claimId'),
        })
          .sort({ createdAt: 1 })
          .lean(),
        session,
      ).exec(),
    );
  }
}