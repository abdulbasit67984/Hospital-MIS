import type {
  Db,
} from '@hospital-mis/database';

import {
  ClaimModel,
  ClaimSubmissionModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  Document,
} from 'mongodb';

import {
  CLAIM_PERMISSION_KEYS,
} from '../claims.constants.js';

import type {
  ClaimsActorContext,
  ClaimsRecoveryRunInput,
} from '../claims.contracts.js';

import {
  ClaimAccessDeniedError,
  ClaimBreakGlassProhibitedError,
  ClaimSubmissionNotFoundError,
  ClaimVersionConflictError,
} from '../claims.errors.js';

import type {
  ClaimBatchRepositoryPort,
  ClaimSubmissionRepositoryPort,
  ClaimsAccessPolicyPort,
  ClaimsClockPort,
  ClaimsOutboxPort,
  ClaimsRepositoryPort,
  ClaimsTransactionManagerPort,
  ClaimsWorkflowPort,
} from '../claims.ports.js';

import type {
  ClaimSubmissionRecord,
} from '../claims.persistence.types.js';

import type {
  BackgroundJobService,
  LeasedBackgroundJob,
} from '../../../infrastructure/background-job.service.js';

import type {
  OutboxService,
} from '../../../infrastructure/outbox.service.js';

import type {
  RecoverableInfrastructure,
  RecoveryCycleResult,
} from '../../../infrastructure/recovery-loop.js';

export const CLAIM_RECOVERABLE_TRANSACTION_TYPES = [
  'CREATE_CLAIM',
  'UPDATE_DRAFT_CLAIM',
  'VALIDATE_CLAIM',
  'MARK_CLAIM_READY',
  'CREATE_CLAIM_BATCH',
  'APPROVE_CLAIM_BATCH',
  'QUEUE_CLAIM_BATCH_SUBMISSION',
  'ACKNOWLEDGE_CLAIM_SUBMISSION',
  'RECORD_CLAIM_ADJUDICATION',
  'IMPORT_CLAIM_REMITTANCE',
  'POST_CLAIM_PAYMENT',
  'REQUEST_CLAIM_ADJUSTMENT',
  'APPROVE_POST_CLAIM_ADJUSTMENT',
  'CREATE_CLAIM_APPEAL',
  'APPROVE_CLAIM_APPEAL',
  'SUBMIT_CLAIM_APPEAL',
  'RECORD_CLAIM_APPEAL_DECISION',
  'ASSIGN_CLAIM_WORK_ITEM',
  'ESCALATE_CLAIM_WORK_ITEM',
  'RESOLVE_CLAIM_WORK_ITEM',
  'RECONCILE_CLAIM',
  'CLAIM_CANCELLED',
  'CLAIM_REVERSED',
  'CLAIM_VOIDED',
] as const;

export const CLAIM_BACKGROUND_JOB_TYPES = [
  'CLAIM_REPORT_EXPORT',
  'CLAIM_SUBMISSION_DISPATCH',
] as const;

const manualDispatchChannels = new Set([
  'COURIER',
  'MANUAL_HAND_DELIVERY',
]);

export function claimAgingBucketForDays(days: number): string {
  if (days <= 0) return 'CURRENT';
  if (days <= 30) return 'DAYS_1_30';
  if (days <= 60) return 'DAYS_31_60';
  if (days <= 90) return 'DAYS_61_90';
  if (days <= 120) return 'DAYS_91_120';
  if (days <= 180) return 'DAYS_121_180';
  return 'DAYS_181_PLUS';
}

export function claimSubmissionFailureState(
  retryCount: number,
  maximumRetries = 5,
): 'FAILED_RETRYABLE' | 'DEAD_LETTER' {
  return retryCount + 1 >= maximumRetries
    ? 'DEAD_LETTER'
    : 'FAILED_RETRYABLE';
}

function backgroundActor(
  facilityId: string,
  submittedBy: string,
  correlationId: string,
): ClaimsActorContext {
  return {
    userId: submittedBy,
    staffId: null,
    facilityId,
    correlationId,
    permissionKeys: new Set([
      CLAIM_PERMISSION_KEYS.SUBMIT,
      CLAIM_PERMISSION_KEYS.STATUS_MANAGE,
      CLAIM_PERMISSION_KEYS.RECOVER,
    ]),
    roleKeys: ['BACKGROUND_JOB'],
  };
}

function submissionVersion(submission: ClaimSubmissionRecord): number {
  return (submission as ClaimSubmissionRecord & { version: number }).version;
}

export interface ClaimRecoveryServiceDependencies {
  database: Db;
  jobs: BackgroundJobService;
  operationalOutbox: OutboxService;
  claims: ClaimsRepositoryPort;
  batches: ClaimBatchRepositoryPort;
  submissions: ClaimSubmissionRepositoryPort;
  workflow: ClaimsWorkflowPort;
  accessPolicy: ClaimsAccessPolicyPort;
  transactionManager: ClaimsTransactionManagerPort;
  outbox: ClaimsOutboxPort;
  clock: ClaimsClockPort;
}

export class ClaimRecoveryService implements RecoverableInfrastructure {
  public constructor(
    private readonly dependencies: ClaimRecoveryServiceDependencies,
  ) {}

  public async run(
    actor: ClaimsActorContext,
    idempotencyKey: string,
    input: ClaimsRecoveryRunInput,
  ) {
    if (actor.breakGlassReason !== undefined) {
      throw new ClaimBreakGlassProhibitedError();
    }
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      permission: CLAIM_PERMISSION_KEYS.RECOVER,
      resourceFacilityId: actor.facilityId,
      sensitiveFinancialAction: true,
    });
    if (!decision.allowed) {
      throw new ClaimAccessDeniedError(decision.denialReason ?? undefined);
    }

    return this.dependencies.transactionManager.execute({
      transactionType: 'CLAIMS_RECOVERY_CYCLE',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`claims:recovery:${actor.facilityId}`],
      idempotencyPayload: input,
      journalPayload: { facilityId: actor.facilityId, limit: input.limit },
      execute: async () => {
        const now = this.dependencies.clock.now();
        const markedStale = await this.markStaleTransactions(
          new Date(now.getTime() - input.staleAfterMinutes * 60_000),
          actor.facilityId,
        );
        const recovered = await this.recoverAvailable({
          workerId: `manual-claims-recovery:${actor.userId}`,
          maxTransactions: input.limit,
          now,
          facilityId: actor.facilityId,
        });
        const sweep = await this.sweep(now, input.limit, actor.facilityId);
        return {
          markedStale,
          recovered: recovered.recovered,
          failed: recovered.failed,
          ...sweep,
        };
      },
    });
  }

  public async markStaleTransactions(
    staleBefore: Date,
    facilityId?: string,
  ): Promise<number> {
    const result = await this.dependencies.database
      .collection('applicationTransactions')
      .updateMany(
        {
          transactionType: { $in: [...CLAIM_RECOVERABLE_TRANSACTION_TYPES] },
          ...(facilityId === undefined
            ? {}
            : { facilityId: toObjectId(facilityId, 'facilityId') }),
          status: { $in: ['PENDING', 'IN_PROGRESS'] },
          updatedAt: { $lte: staleBefore },
        },
        {
          $set: {
            status: 'RECOVERY_REQUIRED',
            recoveryStatus: 'CLAIMS_ABANDONED_TRANSACTION_DETECTED',
          },
          $inc: { version: 1 },
          $currentDate: { updatedAt: true },
        },
      );
    return result.modifiedCount;
  }

  public async recoverAvailable(input: Readonly<{
    workerId: string;
    maxTransactions: number;
    now: Date;
    facilityId?: string;
  }>): Promise<RecoveryCycleResult> {
    let recovered = 0;
    let failed = 0;

    for (let count = 0; count < input.maxTransactions; count += 1) {
      const transaction = await this.dependencies.database
        .collection<Document>('applicationTransactions')
        .findOneAndUpdate(
          {
            transactionType: { $in: [...CLAIM_RECOVERABLE_TRANSACTION_TYPES] },
            status: 'RECOVERY_REQUIRED',
            ...(input.facilityId === undefined
              ? {}
              : { facilityId: toObjectId(input.facilityId, 'facilityId') }),
            $or: [
              { recoveryLeaseExpiresAt: { $exists: false } },
              { recoveryLeaseExpiresAt: { $lte: input.now } },
            ],
          },
          {
            $set: {
              recoveryLeaseOwner: input.workerId,
              recoveryLeaseExpiresAt: new Date(input.now.getTime() + 60_000),
              recoveryStatus: 'CLAIMS_RECOVERY_IN_PROGRESS',
            },
            $inc: { retryCount: 1, version: 1 },
            $currentDate: { updatedAt: true },
          },
          { sort: { updatedAt: 1 }, returnDocument: 'after' },
        );

      if (transaction === null) break;

      try {
        const transactionId = String(transaction['transactionId'] ?? '');
        const evidence = await this.findDomainEvidence(
          transactionId,
          String(transaction['transactionType'] ?? ''),
          transaction['contextSnapshot'] as Document | undefined,
        );

        await this.dependencies.database
          .collection('applicationTransactions')
          .updateOne(
            { _id: transaction['_id'], recoveryLeaseOwner: input.workerId },
            {
              $set: {
                status: evidence ? 'COMPLETED' : 'FAILED',
                recoveryStatus: evidence
                  ? 'CLAIMS_RECOVERED_FROM_DOMAIN_EVIDENCE'
                  : 'CLAIMS_NO_COMMITTED_DOMAIN_EVIDENCE',
                ...(evidence ? { completionTimestamp: input.now } : {}),
              },
              $unset: {
                recoveryLeaseOwner: '',
                recoveryLeaseExpiresAt: '',
              },
              $inc: { version: 1 },
              $currentDate: { updatedAt: true },
            },
          );

        if (evidence && transactionId.length > 0) {
          await this.dependencies.operationalOutbox.releaseTransactionEvents(transactionId);
        }
        if (evidence) {
          recovered += 1;
        } else {
          failed += 1;
        }
      } catch (error) {
        failed += 1;
        await this.dependencies.database
          .collection('applicationTransactions')
          .updateOne(
            { _id: transaction['_id'], recoveryLeaseOwner: input.workerId },
            {
              $set: {
                recoveryStatus: 'CLAIMS_RECOVERY_FAILED',
                errorDetails: {
                  name: error instanceof Error ? error.name : typeof error,
                  message: error instanceof Error
                    ? error.message.slice(0, 2_000)
                    : 'Unknown claims recovery failure',
                },
              },
              $unset: {
                recoveryLeaseOwner: '',
                recoveryLeaseExpiresAt: '',
              },
              $inc: { version: 1 },
              $currentDate: { updatedAt: true },
            },
          );
      }
    }

    return { recovered, failed };
  }

  public async sweep(
    now: Date,
    limit = 500,
    facilityId?: string,
  ): Promise<Readonly<{
    agingUpdated: number;
    submissionJobsQueued: number;
  }>> {
    const agingFilter: Document = {
      status: { $nin: ['CLOSED', 'CANCELLED', 'REVERSED', 'VOIDED'] },
      ...(facilityId === undefined
        ? {}
        : { facilityId: toObjectId(facilityId, 'facilityId') }),
    };

    const openClaims = await ClaimModel.find(agingFilter)
      .select({ _id: 1, agingAnchorAt: 1, agingDays: 1, agingBucket: 1, version: 1 })
      .sort({ agingAnchorAt: 1, _id: 1 })
      .limit(Math.max(1, Math.min(limit, 2_000)))
      .lean()
      .exec();

    let agingUpdated = 0;
    for (const claim of openClaims) {
      const days = Math.max(
        0,
        Math.floor((now.getTime() - claim.agingAnchorAt.getTime()) / 86_400_000),
      );
      const bucket = claimAgingBucketForDays(days);
      if (claim.agingDays === days && claim.agingBucket === bucket) continue;
      const result = await ClaimModel.updateOne(
        { _id: claim._id, version: claim.version },
        {
          $set: { agingDays: days, agingBucket: bucket, updatedAt: now },
          $inc: { version: 1 },
        },
      ).exec();
      agingUpdated += result.modifiedCount;
    }

    const submissionJobsQueued = await this.enqueueSubmissionJobs(
      now,
      limit,
      facilityId,
    );
    return { agingUpdated, submissionJobsQueued };
  }

  public async dispatchSubmissionJob(job: LeasedBackgroundJob): Promise<void> {
    const payload = job.payload as Readonly<{ submissionId?: string }>;
    if (typeof payload.submissionId !== 'string') {
      throw new ClaimSubmissionNotFoundError();
    }

    const existing = await ClaimSubmissionModel.findOne({
      _id: toObjectId(payload.submissionId, 'submissionId'),
      facilityId: toObjectId(job.facilityId, 'facilityId'),
    }).lean().exec();
    if (existing === null) throw new ClaimSubmissionNotFoundError();
    if (!['QUEUED', 'FAILED_RETRYABLE'].includes(existing.status)) return;

    const actor = backgroundActor(
      job.facilityId,
      existing.submittedBy.toHexString(),
      existing.correlationId,
    );

    await this.dependencies.transactionManager.execute({
      transactionType: 'DISPATCH_CLAIM_SUBMISSION',
      idempotencyKey: `dispatch:${existing._id.toHexString()}:${existing.retryCount}`,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `claims:submission:${actor.facilityId}:${existing._id.toHexString()}`,
        `claims:batch:${actor.facilityId}:${existing.claimBatchId.toHexString()}`,
      ],
      idempotencyPayload: {
        submissionId: existing._id.toHexString(),
        retryCount: existing.retryCount,
      },
      journalPayload: {
        submissionId: existing._id.toHexString(),
        claimBatchId: existing.claimBatchId.toHexString(),
      },
      execute: async (transaction) => {
        const submission = await this.dependencies.submissions.findLatestForBatch(
          actor.facilityId,
          existing.claimBatchId.toHexString(),
          transaction.session,
        );
        if (
          submission === null ||
          !submission._id.equals(existing._id) ||
          !['QUEUED', 'FAILED_RETRYABLE'].includes(submission.status)
        ) {
          return;
        }

        const batch = await this.dependencies.batches.findById(
          actor.facilityId,
          submission.claimBatchId.toHexString(),
          transaction.session,
        );
        if (batch === null) throw new ClaimVersionConflictError();

        if (!manualDispatchChannels.has(submission.submissionChannel)) {
          const nextStatus = claimSubmissionFailureState(submission.retryCount);
          const failed = await this.dependencies.submissions.updateStatus(
            actor.facilityId,
            submission._id.toHexString(),
            submissionVersion(submission),
            {
              status: nextStatus,
              retryCount: submission.retryCount + 1,
              nextRetryAt: nextStatus === 'DEAD_LETTER'
                ? null
                : new Date(this.dependencies.clock.now().getTime() + 15 * 60_000),
              lastErrorCode: 'TRANSPORT_NOT_CONFIGURED',
              completedAt: nextStatus === 'DEAD_LETTER'
                ? this.dependencies.clock.now()
                : null,
            },
            actor.userId,
            transaction,
          );
          if (failed === null) throw new ClaimVersionConflictError();
          const updatedBatch = await this.dependencies.batches.updateStatus(
            actor.facilityId,
            batch._id.toHexString(),
            batch.version,
            { submissionStatus: nextStatus },
            actor.userId,
            transaction,
          );
          if (updatedBatch === null) throw new ClaimVersionConflictError();
          await this.dependencies.outbox.enqueue({
            facilityId: actor.facilityId,
            eventType: nextStatus === 'DEAD_LETTER'
              ? 'claims.submission.dead_lettered'
              : 'claims.submission.retry_scheduled',
            aggregateType: 'ClaimSubmission',
            aggregateId: submission._id.toHexString(),
            payload: {
              claimBatchId: batch._id.toHexString(),
              status: nextStatus,
              version: submissionVersion(failed),
              eventAt: this.dependencies.clock.now().toISOString(),
            },
            correlationId: actor.correlationId,
            transactionId: transaction.transactionId,
            session: transaction.session,
          });
          return;
        }

        const now = this.dependencies.clock.now();
        const reference = [
          submission.submissionChannel,
          batch.batchNumber,
          submission.submissionAttempt,
        ].join('-');
        const sent = await this.dependencies.submissions.updateStatus(
          actor.facilityId,
          submission._id.toHexString(),
          submissionVersion(submission),
          {
            status: 'SENT',
            externalSubmissionReference: reference,
            sentAt: now,
            nextRetryAt: null,
            lastErrorCode: null,
          },
          actor.userId,
          transaction,
        );
        if (sent === null) throw new ClaimVersionConflictError();
        const updatedBatch = await this.dependencies.batches.updateStatus(
          actor.facilityId,
          batch._id.toHexString(),
          batch.version,
          {
            status: 'SUBMITTED',
            submissionStatus: 'SENT',
            submittedAt: now,
          },
          actor.userId,
          transaction,
        );
        if (updatedBatch === null) throw new ClaimVersionConflictError();

        const claims = await this.dependencies.claims.findByIds(
          actor.facilityId,
          batch.claimIds.map((claimId) => claimId.toHexString()),
          transaction.session,
        );
        for (const claim of claims) {
          if (claim.status !== 'SUBMISSION_PENDING') continue;
          await this.dependencies.workflow.transition({
            actor,
            claim,
            toStatus: 'SUBMITTED',
            reason: 'Claim submission package released to the configured manual channel',
            makerUserId: batch.createdBy.toHexString(),
            checkerUserId: batch.approvedBy?.toHexString() ?? null,
            approvalRequestId: batch.approvalRequestId?.toHexString() ?? null,
            transaction,
          });
        }
        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType: 'claims.submission.sent',
          aggregateType: 'ClaimSubmission',
          aggregateId: submission._id.toHexString(),
          payload: {
            claimBatchId: batch._id.toHexString(),
            status: sent.status,
            version: submissionVersion(sent),
            eventAt: now.toISOString(),
          },
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
      },
    });
  }

  private async enqueueSubmissionJobs(
    now: Date,
    limit: number,
    facilityId?: string,
  ): Promise<number> {
    const submissions = await ClaimSubmissionModel.find({
      ...(facilityId === undefined
        ? {}
        : { facilityId: toObjectId(facilityId, 'facilityId') }),
      status: { $in: ['QUEUED', 'FAILED_RETRYABLE'] },
      $or: [
        { nextRetryAt: null },
        { nextRetryAt: { $lte: now } },
      ],
    })
      .select({ _id: 1, facilityId: 1 })
      .sort({ nextRetryAt: 1, createdAt: 1 })
      .limit(Math.max(1, Math.min(limit, 2_000)))
      .lean()
      .exec();

    let queued = 0;
    for (const submission of submissions) {
      const submissionId = submission._id.toHexString();
      const existing = await this.dependencies.database
        .collection('backgroundJobs')
        .findOne({
          facilityId: submission.facilityId,
          jobType: 'CLAIM_SUBMISSION_DISPATCH',
          status: { $in: ['PENDING', 'PROCESSING', 'FAILED'] },
          'payload.submissionId': submissionId,
        });
      if (existing !== null) continue;
      await this.dependencies.jobs.enqueue({
        facilityId: submission.facilityId.toHexString(),
        jobType: 'CLAIM_SUBMISSION_DISPATCH',
        payload: { submissionId },
        maxAttempts: 1,
      });
      queued += 1;
    }
    return queued;
  }

  private async findDomainEvidence(
    transactionId: string,
    transactionType: string,
    context: Document | undefined,
  ): Promise<boolean> {
    if (transactionId.length > 0) {
      const outboxEvidence = await this.dependencies.database
        .collection('outboxEvents')
        .findOne({ transactionId });
      if (outboxEvidence !== null) return true;
    }

    const collectionByType: Readonly<Record<string, string>> = {
      CREATE_CLAIM: 'claims',
      UPDATE_DRAFT_CLAIM: 'claimVersionHistories',
      VALIDATE_CLAIM: 'claimValidationSnapshots',
      MARK_CLAIM_READY: 'claimStatusHistories',
      CREATE_CLAIM_BATCH: 'claimBatches',
      APPROVE_CLAIM_BATCH: 'claimBatches',
      QUEUE_CLAIM_BATCH_SUBMISSION: 'claimSubmissions',
      ACKNOWLEDGE_CLAIM_SUBMISSION: 'claimSubmissions',
      RECORD_CLAIM_ADJUDICATION: 'claimAdjudications',
      IMPORT_CLAIM_REMITTANCE: 'claimRemittances',
      POST_CLAIM_PAYMENT: 'claimPayments',
      REQUEST_CLAIM_ADJUSTMENT: 'claimAdjustments',
      APPROVE_POST_CLAIM_ADJUSTMENT: 'claimAdjustments',
      CREATE_CLAIM_APPEAL: 'claimAppeals',
      APPROVE_CLAIM_APPEAL: 'claimAppeals',
      SUBMIT_CLAIM_APPEAL: 'claimAppeals',
      RECORD_CLAIM_APPEAL_DECISION: 'claimAppeals',
      ASSIGN_CLAIM_WORK_ITEM: 'claimWorkItems',
      ESCALATE_CLAIM_WORK_ITEM: 'claimWorkItems',
      RESOLVE_CLAIM_WORK_ITEM: 'claimWorkItems',
      RECONCILE_CLAIM: 'claims',
      CLAIM_CANCELLED: 'claimStatusHistories',
      CLAIM_REVERSED: 'claimStatusHistories',
      CLAIM_VOIDED: 'claimStatusHistories',
    };
    const collectionName = collectionByType[transactionType];
    if (collectionName === undefined || context === undefined) return false;

    const identifiers = Object.values(context).filter(
      (value): value is string =>
        typeof value === 'string' && /^[a-f\d]{24}$/iu.test(value),
    );
    if (identifiers.length === 0) return false;

    return await this.dependencies.database.collection(collectionName).findOne({
      $or: identifiers.map((identifier) => ({ _id: toObjectId(identifier) })),
    }) !== null;
  }
}