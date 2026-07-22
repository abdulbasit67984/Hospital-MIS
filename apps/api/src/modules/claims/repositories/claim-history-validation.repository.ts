import {
  ClaimStatusHistoryModel,
  ClaimValidationSnapshotModel,
  ClaimVersionHistoryModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  ClaimValidationRepositoryPort,
  ClaimWorkflowHistoryRepositoryPort,
} from '../claims.ports.js';

import type {
  ClaimStatusHistoryRecord,
  ClaimValidationSnapshotRecord,
  ClaimVersionHistoryRecord,
  ClaimsMongoSession,
} from '../claims.persistence.types.js';

import {
  stableClaimPayloadHash,
} from '../claims.normalization.js';

import {
  claimRecord,
  withClaimsSession,
} from './claims-repository.support.js';

export class MongoClaimWorkflowHistoryRepository
implements ClaimWorkflowHistoryRepositoryPort {
  public async appendStatus(
    actor: Parameters<ClaimWorkflowHistoryRepositoryPort['appendStatus']>[0],
    input: Parameters<ClaimWorkflowHistoryRepositoryPort['appendStatus']>[1],
    transaction: Parameters<ClaimWorkflowHistoryRepositoryPort['appendStatus']>[2],
  ): Promise<ClaimStatusHistoryRecord> {
    const occurredAt = input.occurredAt;
    const hashPayload = {
      facilityId: actor.facilityId,
      claimId: input.claimId.toHexString(),
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      reason: input.reason,
      payerReasonCode: input.payerReasonCode,
      payerReasonDescription: input.payerReasonDescription,
      actorUserId: input.actorUserId.toHexString(),
      makerUserId: input.makerUserId?.toHexString() ?? null,
      checkerUserId: input.checkerUserId?.toHexString() ?? null,
      approvalRequestId: input.approvalRequestId?.toHexString() ?? null,
      transactionId: transaction.transactionId,
      correlationId: actor.correlationId,
      occurredAt: occurredAt.toISOString(),
    };

    const [created] = await ClaimStatusHistoryModel.create(
      [{
        facilityId: toObjectId(actor.facilityId, 'facilityId'),
        transactionId: transaction.transactionId,
        correlationId: actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: toObjectId(actor.userId, 'createdBy'),
        updatedBy: toObjectId(actor.userId, 'updatedBy'),
        claimId: input.claimId,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        reason: input.reason,
        payerReasonCode: input.payerReasonCode,
        payerReasonDescription: input.payerReasonDescription,
        actorUserId: input.actorUserId,
        makerUserId: input.makerUserId,
        checkerUserId: input.checkerUserId,
        approvalRequestId: input.approvalRequestId,
        occurredAt,
        immutableHash: stableClaimPayloadHash(hashPayload),
      }],
      { session: transaction.session },
    );

    return claimRecord<ClaimStatusHistoryRecord>(created!.toObject());
  }

  public async appendVersion(
    actor: Parameters<ClaimWorkflowHistoryRepositoryPort['appendVersion']>[0],
    input: Parameters<ClaimWorkflowHistoryRepositoryPort['appendVersion']>[1],
    transaction: Parameters<ClaimWorkflowHistoryRepositoryPort['appendVersion']>[2],
  ): Promise<ClaimVersionHistoryRecord> {
    const snapshotHash = stableClaimPayloadHash(input.snapshot);

    const [created] = await ClaimVersionHistoryModel.create(
      [{
        facilityId: toObjectId(actor.facilityId, 'facilityId'),
        transactionId: transaction.transactionId,
        correlationId: actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: toObjectId(actor.userId, 'createdBy'),
        updatedBy: toObjectId(actor.userId, 'updatedBy'),
        claimId: input.claimId,
        claimNumber: input.claimNumber,
        versionNumber: input.versionNumber,
        versionType: input.versionType,
        priorClaimId: input.priorClaimId,
        snapshot: input.snapshot,
        snapshotHash,
        reason: input.reason,
        actorUserId: input.actorUserId,
        occurredAt: input.occurredAt,
      }],
      { session: transaction.session },
    );

    return claimRecord<ClaimVersionHistoryRecord>(created!.toObject());
  }

  public async listStatusHistory(
    facilityId: string,
    claimId: string,
  ): Promise<readonly ClaimStatusHistoryRecord[]> {
    return claimRecord<ClaimStatusHistoryRecord[]>(
      await ClaimStatusHistoryModel.find({
        facilityId: toObjectId(facilityId, 'facilityId'),
        claimId: toObjectId(claimId, 'claimId'),
      })
        .sort({ occurredAt: 1 })
        .lean()
        .exec(),
    );
  }

  public async listVersionHistory(
    facilityId: string,
    claimId: string,
  ): Promise<readonly ClaimVersionHistoryRecord[]> {
    return claimRecord<ClaimVersionHistoryRecord[]>(
      await ClaimVersionHistoryModel.find({
        facilityId: toObjectId(facilityId, 'facilityId'),
        claimId: toObjectId(claimId, 'claimId'),
      })
        .sort({ versionNumber: 1, occurredAt: 1 })
        .lean()
        .exec(),
    );
  }
}

export class MongoClaimValidationRepository
implements ClaimValidationRepositoryPort {
  public async createSnapshot(
    actor: Parameters<ClaimValidationRepositoryPort['createSnapshot']>[0],
    input: Parameters<ClaimValidationRepositoryPort['createSnapshot']>[1],
    transaction: Parameters<ClaimValidationRepositoryPort['createSnapshot']>[2],
  ): Promise<ClaimValidationSnapshotRecord> {
    const [created] = await ClaimValidationSnapshotModel.create(
      [{
        facilityId: toObjectId(actor.facilityId, 'facilityId'),
        transactionId: transaction.transactionId,
        correlationId: actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: toObjectId(actor.userId, 'createdBy'),
        updatedBy: toObjectId(actor.userId, 'updatedBy'),
        claimId: input.claimId,
        claimVersion: input.claimVersion,
        checkedAt: input.checkedAt,
        checkedBy: input.checkedBy,
        complete: input.complete,
        eligible: input.eligible,
        duplicateFree: input.duplicateFree,
        scrubbed: input.scrubbed,
        submissionReady: input.submissionReady,
        authoritativePayloadHash: input.authoritativePayloadHash,
        issues: input.issues,
      }],
      { session: transaction.session },
    );

    return claimRecord<ClaimValidationSnapshotRecord>(created!.toObject());
  }

  public async findById(
    facilityId: string,
    snapshotId: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimValidationSnapshotRecord | null> {
    return claimRecord<ClaimValidationSnapshotRecord | null>(
      await withClaimsSession(
        ClaimValidationSnapshotModel.findOne({
          _id: toObjectId(snapshotId, 'snapshotId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async findLatestForClaim(
    facilityId: string,
    claimId: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimValidationSnapshotRecord | null> {
    return claimRecord<ClaimValidationSnapshotRecord | null>(
      await withClaimsSession(
        ClaimValidationSnapshotModel.findOne({
          facilityId: toObjectId(facilityId, 'facilityId'),
          claimId: toObjectId(claimId, 'claimId'),
        })
          .sort({ checkedAt: -1 })
          .lean(),
        session,
      ).exec(),
    );
  }
}