import {
  CLAIM_PERMISSION_KEYS,
} from '../claims.constants.js';

import type {
  ClaimsActorContext,
  RecordSubmissionAcknowledgementInput,
  SubmitClaimBatchInput,
} from '../claims.contracts.js';

import {
  ClaimAccessDeniedError,
  ClaimBatchNotFoundError,
  ClaimMakerCheckerError,
  ClaimNotReadyError,
  ClaimSubmissionNotFoundError,
  ClaimVersionConflictError,
} from '../claims.errors.js';

import {
  stableClaimPayloadHash,
} from '../claims.normalization.js';

import type {
  ClaimBatchRepositoryPort,
  ClaimDocumentRepositoryPort,
  ClaimSubmissionRepositoryPort,
  ClaimsAccessPolicyPort,
  ClaimsApprovalPort,
  ClaimsAttachmentPort,
  ClaimsAuditPort,
  ClaimsClockPort,
  ClaimsOutboxPort,
  ClaimsRepositoryPort,
  ClaimsTransactionManagerPort,
  ClaimsWorkflowPort,
} from '../claims.ports.js';

import type {
  ClaimSubmissionRecord,
} from '../claims.persistence.types.js';

export interface ClaimSubmissionServiceDependencies {
  claims: ClaimsRepositoryPort;
  batches: ClaimBatchRepositoryPort;
  submissions: ClaimSubmissionRepositoryPort;
  documents: ClaimDocumentRepositoryPort;
  attachments: ClaimsAttachmentPort;
  workflow: ClaimsWorkflowPort;
  accessPolicy: ClaimsAccessPolicyPort;
  approval: ClaimsApprovalPort;
  transactionManager: ClaimsTransactionManagerPort;
  audit: ClaimsAuditPort;
  outbox: ClaimsOutboxPort;
  clock: ClaimsClockPort;
}

function submissionVersion(submission: ClaimSubmissionRecord): number {
  return (submission as ClaimSubmissionRecord & { version: number }).version;
}

function projectSubmission(submission: ClaimSubmissionRecord) {
  return {
    id: submission._id.toHexString(),
    claimBatchId: submission.claimBatchId.toHexString(),
    submissionAttempt: submission.submissionAttempt,
    submissionChannel: submission.submissionChannel,
    status: submission.status,
    externalSubmissionReference: submission.externalSubmissionReference,
    payerReferenceNumber: submission.payerReferenceNumber,
    acknowledgementReference: submission.acknowledgementReference,
    rejectionCode: submission.rejectionCode,
    rejectionReason: submission.rejectionReason,
    retryCount: submission.retryCount,
    nextRetryAt: submission.nextRetryAt?.toISOString() ?? null,
    sentAt: submission.sentAt?.toISOString() ?? null,
    acknowledgedAt: submission.acknowledgedAt?.toISOString() ?? null,
    completedAt: submission.completedAt?.toISOString() ?? null,
    version: submissionVersion(submission),
  };
}

export class ClaimSubmissionService {
  public constructor(
    private readonly dependencies: ClaimSubmissionServiceDependencies,
  ) {}

  public async queue(
    actor: ClaimsActorContext,
    batchId: string,
    input: SubmitClaimBatchInput,
  ) {
    await this.requirePermission(actor, CLAIM_PERMISSION_KEYS.SUBMIT);

    return this.dependencies.transactionManager.execute({
      transactionType: 'QUEUE_CLAIM_BATCH_SUBMISSION',
      idempotencyKey: input.idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`claims:batch:${actor.facilityId}:${batchId}`],
      idempotencyPayload: input,
      journalPayload: { batchId },
      execute: async (transaction) => {
        const batch = await this.dependencies.batches.findById(
          actor.facilityId,
          batchId,
          transaction.session,
        );
        if (batch === null) {
          throw new ClaimBatchNotFoundError();
        }
        if (batch.version !== input.expectedVersion) {
          throw new ClaimVersionConflictError();
        }
        if (
          batch.status !== 'APPROVED' ||
          batch.approvalRequestId === null ||
          batch.approvedBy === null
        ) {
          throw new ClaimNotReadyError();
        }
        if (batch.createdBy.equals(batch.approvedBy)) {
          throw new ClaimMakerCheckerError();
        }
        await this.dependencies.approval.assertApproved({
          facilityId: actor.facilityId,
          approvalRequestId: input.approvalRequestId,
          action: 'CLAIM_BATCH_SUBMISSION',
          entityId: batchId,
          makerUserId: batch.createdBy.toHexString(),
          checkerUserId: batch.approvedBy.toHexString(),
          session: transaction.session,
        });
        const claims = await this.dependencies.claims.findByIds(
          actor.facilityId,
          batch.claimIds.map((claimId) => claimId.toHexString()),
          transaction.session,
        );
        if (
          claims.length !== batch.claimCount ||
          claims.some((claim) => claim.status !== 'READY')
        ) {
          throw new ClaimNotReadyError();
        }
        const latest = await this.dependencies.submissions.findLatestForBatch(
          actor.facilityId,
          batchId,
          transaction.session,
        );
        if (
          latest !== null &&
          ['QUEUED', 'PROCESSING', 'SENT'].includes(latest.status)
        ) {
          throw new ClaimNotReadyError();
        }
        const now = input.submittedAt === undefined
          ? this.dependencies.clock.now()
          : new Date(input.submittedAt);
        const attempt = (latest?.submissionAttempt ?? 0) + 1;
        const submission = await this.dependencies.submissions.createAttempt(
          actor,
          {
            operationKey: stableClaimPayloadHash({
              facilityId: actor.facilityId,
              batchId,
              idempotencyKey: input.idempotencyKey,
              attempt,
            }),
            claimBatchId: batchId,
            submissionAttempt: attempt,
            submissionChannel: batch.submissionChannel,
            status: 'QUEUED',
            outboundPayloadHash: stableClaimPayloadHash({
              claimBatchId: batchId,
              batchNumber: batch.batchNumber,
              claimIds: batch.claimIds.map((claimId) =>
                claimId.toHexString(),
              ),
              claimedAmount: batch.claimedAmount.toString(),
            }),
            outboundAttachmentId: null,
            destinationReference: batch.destinationReference,
            clearinghouseReference: batch.clearinghouseReference,
            externalSubmissionReference: null,
            payerReferenceNumber: null,
            acknowledgementReference: null,
            rejectionCode: null,
            rejectionReason: null,
            retryCount: 0,
            nextRetryAt: now,
            lastErrorCode: null,
            sentAt: null,
            acknowledgedAt: null,
            completedAt: null,
          },
          transaction,
        );
        const updatedBatch = await this.dependencies.batches.updateStatus(
          actor.facilityId,
          batchId,
          input.expectedVersion,
          {
            status: 'SUBMISSION_PENDING',
            submissionStatus: 'QUEUED',
            submittedBy: actor.userId,
            submittedAt: now,
          },
          actor.userId,
          transaction,
        );
        if (updatedBatch === null) {
          throw new ClaimVersionConflictError();
        }
        for (const claim of claims) {
          await this.dependencies.workflow.transition({
            actor,
            claim,
            toStatus: 'SUBMISSION_PENDING',
            reason: 'Approved claim batch queued for submission',
            makerUserId: batch.createdBy.toHexString(),
            checkerUserId: batch.approvedBy.toHexString(),
            approvalRequestId: input.approvalRequestId,
            transaction,
          });
        }
        await this.dependencies.audit.record({
          actor,
          action: 'CLAIM_BATCH_SUBMISSION_QUEUED',
          entityType: 'ClaimSubmission',
          entityId: submission._id.toHexString(),
          reason: null,
          before: null,
          after: {
            submissionId: submission._id.toHexString(),
            claimBatchId: batchId,
            status: submission.status,
            attempt,
          },
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType: 'claims.submission.queued',
          aggregateType: 'ClaimSubmission',
          aggregateId: submission._id.toHexString(),
          payload: {
            claimBatchId: batchId,
            status: submission.status,
            version: submissionVersion(submission),
            eventAt: now.toISOString(),
          },
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        return {
          batch: {
            id: updatedBatch._id.toHexString(),
            status: updatedBatch.status,
            version: updatedBatch.version,
          },
          submission: projectSubmission(submission),
        };
      },
    });
  }

  public async acknowledge(
    actor: ClaimsActorContext,
    batchId: string,
    idempotencyKey: string,
    input: RecordSubmissionAcknowledgementInput,
  ) {
    await this.requirePermission(
      actor,
      CLAIM_PERMISSION_KEYS.ACKNOWLEDGEMENT_RECORD,
    );
    if (input.rawAttachmentId !== null && input.rawAttachmentId !== undefined) {
      await this.dependencies.attachments.assertAttachmentsUsable({
        facilityId: actor.facilityId,
        actorUserId: actor.userId,
        attachments: [{
          attachmentId: input.rawAttachmentId,
          purpose: 'OTHER',
          description: 'Submission acknowledgement',
        }],
      });
    }

    return this.dependencies.transactionManager.execute({
      transactionType: 'ACKNOWLEDGE_CLAIM_SUBMISSION',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`claims:batch:${actor.facilityId}:${batchId}`],
      idempotencyPayload: input,
      journalPayload: {
        batchId,
        acknowledgementReference: input.acknowledgementReference,
        accepted: input.accepted,
      },
      execute: async (transaction) => {
        const [batch, submission] = await Promise.all([
          this.dependencies.batches.findById(
            actor.facilityId,
            batchId,
            transaction.session,
          ),
          this.dependencies.submissions.findLatestForBatch(
            actor.facilityId,
            batchId,
            transaction.session,
          ),
        ]);
        if (batch === null) {
          throw new ClaimBatchNotFoundError();
        }
        if (submission === null) {
          throw new ClaimSubmissionNotFoundError();
        }
        if (submissionVersion(submission) !== input.expectedVersion) {
          throw new ClaimVersionConflictError();
        }
        if (!['SENT', 'PROCESSING', 'QUEUED'].includes(submission.status)) {
          throw new ClaimNotReadyError();
        }
        const acknowledged =
          await this.dependencies.submissions.recordAcknowledgement(
            actor.facilityId,
            submission._id.toHexString(),
            input,
            actor.userId,
            transaction,
          );
        if (acknowledged === null) {
          throw new ClaimVersionConflictError();
        }
        const acknowledgedAt = new Date(input.acknowledgedAt);
        const updatedBatch = await this.dependencies.batches.updateStatus(
          actor.facilityId,
          batchId,
          batch.version,
          {
            status: input.accepted ? 'ACKNOWLEDGED' : 'REJECTED',
            submissionStatus: 'ACKNOWLEDGED',
            acknowledgedAt,
          },
          actor.userId,
          transaction,
        );
        if (updatedBatch === null) {
          throw new ClaimVersionConflictError();
        }
        const claims = await this.dependencies.claims.findByIds(
          actor.facilityId,
          batch.claimIds.map((claimId) => claimId.toHexString()),
          transaction.session,
        );
        for (const initialClaim of claims) {
          let claim = initialClaim;
          if (claim.status === 'SUBMISSION_PENDING') {
            claim = await this.dependencies.workflow.transition({
              actor,
              claim,
              toStatus: 'SUBMITTED',
              reason: 'Payer acknowledgement confirms batch transmission',
              transaction,
            });
          }
          const target = input.accepted ? 'ACKNOWLEDGED' : 'REJECTED';
          await this.dependencies.workflow.transition({
            actor,
            claim,
            toStatus: target,
            reason: input.accepted
              ? 'Payer accepted the claim submission'
              : input.rejectionReason ?? 'Payer rejected the claim submission',
            transaction,
          });
        }
        if (input.rawAttachmentId != null) {
          await this.dependencies.documents.appendForSubmission(
            actor,
            batch.claimIds.map((claimId) => claimId.toHexString()),
            input.rawAttachmentId,
            'Submission acknowledgement',
            transaction,
          );
        }
        await this.dependencies.audit.record({
          actor,
          action: input.accepted
            ? 'CLAIM_SUBMISSION_ACKNOWLEDGED'
            : 'CLAIM_SUBMISSION_REJECTED',
          entityType: 'ClaimSubmission',
          entityId: submission._id.toHexString(),
          reason: input.rejectionReason ?? null,
          before: {
            status: submission.status,
            version: submissionVersion(submission),
          },
          after: {
            status: acknowledged.status,
            version: submissionVersion(acknowledged),
            accepted: input.accepted,
          },
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType: input.accepted
            ? 'claims.submission.acknowledged'
            : 'claims.submission.rejected',
          aggregateType: 'ClaimSubmission',
          aggregateId: submission._id.toHexString(),
          payload: {
            claimBatchId: batchId,
            status: acknowledged.status,
            previousStatus: submission.status,
            version: submissionVersion(acknowledged),
            eventAt: acknowledgedAt.toISOString(),
          },
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        return {
          batch: {
            id: updatedBatch._id.toHexString(),
            status: updatedBatch.status,
            version: updatedBatch.version,
          },
          submission: projectSubmission(acknowledged),
        };
      },
    });
  }

  private async requirePermission(
    actor: ClaimsActorContext,
    permission: string,
  ): Promise<void> {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      permission,
      resourceFacilityId: actor.facilityId,
    });
    if (!decision.allowed) {
      throw new ClaimAccessDeniedError(
        decision.denialReason ?? undefined,
      );
    }
  }
}