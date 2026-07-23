import type { Db } from '@hospital-mis/database';
import { toObjectId } from '@hospital-mis/database';
import type { Document } from 'mongodb';

import type { BackgroundJobService } from '../../../infrastructure/background-job.service.js';
import { CONSULTANT_SHARING_PERMISSION_KEYS } from '../consultant-sharing.constants.js';
import type { ConsultantSharingActorContext } from '../consultant-sharing.contracts.js';
import { ConsultantSharingAccessDeniedError } from '../consultant-sharing.errors.js';
import { stableConsultantSharingPayloadHash } from '../consultant-sharing.normalization.js';
import type {
  ConsultantAuditPort,
  ConsultantClockPort,
  ConsultantIdempotencyPort,
  ConsultantSharingAccessPolicyPort,
} from '../consultant-sharing.ports.js';
import type {
  ConsultantSharingRecoveryRunInput,
  ConsultantSharingRecoveryRunResult,
} from '../consultant-sharing.reporting.contracts.js';
import type { ConsultantAgreementApprovalService } from './consultant-agreement-approval.service.js';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1_000;

function objectIdString(value: unknown): string | null {
  if (
    typeof value === 'object'
    && value !== null
    && 'toHexString' in value
    && typeof value.toHexString === 'function'
  ) {
    return value.toHexString();
  }
  return typeof value === 'string' ? value : null;
}

function integer(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : 0;
}

function systemActor(
  facilityId: string,
  correlationId: string,
): ConsultantSharingActorContext {
  return {
    userId: '000000000000000000000001',
    staffId: null,
    facilityId,
    correlationId,
    permissionKeys: new Set([
      CONSULTANT_SHARING_PERMISSION_KEYS.AGREEMENT_TERMINATE,
      CONSULTANT_SHARING_PERMISSION_KEYS.CALCULATE,
      CONSULTANT_SHARING_PERMISSION_KEYS.RECALCULATE,
      CONSULTANT_SHARING_PERMISSION_KEYS.RECONCILE,
      CONSULTANT_SHARING_PERMISSION_KEYS.RECOVERY_MANAGE,
    ]),
    roleKeys: ['BACKGROUND_JOB'],
  };
}

export class ConsultantSharingRecoveryService {
  public constructor(
    private readonly dependencies: Readonly<{
      database: Db;
      jobs: BackgroundJobService;
      accessPolicy: ConsultantSharingAccessPolicyPort;
      idempotency: ConsultantIdempotencyPort;
      audit: ConsultantAuditPort;
      clock: ConsultantClockPort;
      agreementApprovals: ConsultantAgreementApprovalService;
    }>,
  ) {}

  public async run(
    actor: ConsultantSharingActorContext,
    idempotencyKey: string,
    input: ConsultantSharingRecoveryRunInput,
  ): Promise<ConsultantSharingRecoveryRunResult> {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'RECOVERY_MANAGE',
      resourceFacilityId: actor.facilityId,
      sensitiveFinancialAction: true,
    });
    if (!decision.allowed) {
      throw new ConsultantSharingAccessDeniedError(
        decision.denialReason ?? 'Consultant Sharing recovery is forbidden',
      );
    }
    if (input.facilityId !== undefined && input.facilityId !== actor.facilityId) {
      throw new ConsultantSharingAccessDeniedError(
        'Consultant Sharing recovery cannot cross facility boundaries',
      );
    }

    return this.dependencies.idempotency.execute({
      scope: 'CONSULTANT_SHARING_RECOVERY_RUN',
      actor,
      idempotencyKey,
      requestHash: stableConsultantSharingPayloadHash(input),
      operation: () => this.sweep(
        input.asOf === undefined ? this.dependencies.clock.now() : new Date(input.asOf),
        Math.max(1, Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT)),
        actor.facilityId,
        input,
      ),
    });
  }

  public async sweep(
    asOf: Date,
    limit = DEFAULT_LIMIT,
    facilityId?: string,
    options: ConsultantSharingRecoveryRunInput = {},
  ): Promise<ConsultantSharingRecoveryRunResult> {
    const safeLimit = Math.max(1, Math.min(limit, MAX_LIMIT));
    const facilityMatch = facilityId === undefined
      ? {}
      : { facilityId: toObjectId(facilityId, 'facilityId') };

    let expiredAgreements = 0;
    let recoveredCalculationRuns = 0;
    let queuedReconciliations = 0;
    let queuedJobs = 0;

    if (options.includeAgreementExpiry !== false) {
      const agreements = await this.dependencies.database
        .collection('consultantAgreements')
        .find({
          ...facilityMatch,
          status: { $in: ['ACTIVE', 'SUSPENDED'] },
          effectiveThrough: { $ne: null, $lte: asOf },
        })
        .sort({ effectiveThrough: 1, _id: 1 })
        .limit(safeLimit)
        .project({ _id: 1, facilityId: 1, version: 1 })
        .toArray();

      for (const agreement of agreements) {
        const agreementId = objectIdString(agreement['_id']);
        const agreementFacilityId = objectIdString(agreement['facilityId']);
        if (agreementId === null || agreementFacilityId === null) continue;
        const actor = systemActor(
          agreementFacilityId,
          `consultant-expiry:${agreementId}:${asOf.toISOString()}`,
        );
        try {
          await this.dependencies.agreementApprovals.changeStatus(
            actor,
            agreementId,
            `agreement-expiry:${agreementId}:${integer(agreement['version'])}`,
            {
              expectedVersion: integer(agreement['version']),
              targetStatus: 'EXPIRED',
              reason: 'Agreement expired at the configured effective end date',
            },
          );
          expiredAgreements += 1;
        } catch (error) {
          if (!(error instanceof Error) || !/state|version|transition/iu.test(error.message)) {
            throw error;
          }
        }
      }
    }

    if (options.includeCalculationRecovery !== false) {
      const runs = await this.dependencies.database
        .collection('consultantCalculationRuns')
        .find({
          ...facilityMatch,
          $or: [
            { status: 'FAILED', nextAttemptAt: { $lte: asOf } },
            { status: 'RUNNING', leaseExpiresAt: { $lte: asOf } },
            { status: 'QUEUED', nextAttemptAt: { $lte: asOf } },
          ],
          $expr: { $lt: ['$attemptCount', '$maxAttempts'] },
        })
        .sort({ nextAttemptAt: 1, requestedAt: 1, _id: 1 })
        .limit(safeLimit)
        .toArray();

      for (const run of runs) {
        const runId = objectIdString(run['_id']);
        const runFacilityId = objectIdString(run['facilityId']);
        const invoiceLineId = objectIdString(run['invoiceLineId']);
        const consultantId = objectIdString(run['consultantId']);
        if (
          runId === null
          || runFacilityId === null
          || invoiceLineId === null
          || consultantId === null
          || typeof run['sourceFinancialEventId'] !== 'string'
        ) {
          continue;
        }

        const existingJob = await this.dependencies.database
          .collection('backgroundJobs')
          .findOne({
            facilityId: toObjectId(runFacilityId, 'facilityId'),
            jobType: 'CONSULTANT_SHARING_CALCULATION_RECOVERY',
            'payload.calculationRunId': runId,
            status: { $in: ['PENDING', 'PROCESSING', 'COMPLETED'] },
          });
        if (existingJob !== null) continue;

        await this.dependencies.jobs.enqueue({
          facilityId: runFacilityId,
          jobType: 'CONSULTANT_SHARING_CALCULATION_RECOVERY',
          payload: {
            calculationRunId: runId,
            sourceFinancialEventId: run['sourceFinancialEventId'],
            invoiceLineId,
            consultantId,
          },
          maxAttempts: integer(run['maxAttempts']) || 10,
        });
        await this.dependencies.database.collection('consultantCalculationRuns').updateOne(
          {
            _id: run['_id'],
            facilityId: run['facilityId'],
            status: run['status'],
            version: run['version'],
          },
          {
            $set: { status: 'QUEUED', nextAttemptAt: asOf },
            $unset: { leaseOwner: '', leaseExpiresAt: '' },
            $inc: { version: 1 },
            $currentDate: { updatedAt: true },
          },
        );
        recoveredCalculationRuns += 1;
        queuedJobs += 1;
      }
    }

    if (
      options.includeSettlementReconciliation === true
      || options.includeLedgerReconciliation === true
    ) {
      const facilities = facilityId === undefined
        ? await this.dependencies.database.collection('facilities')
          .find({ status: 'ACTIVE' }, { projection: { _id: 1 } })
          .limit(safeLimit)
          .toArray()
        : [{ _id: toObjectId(facilityId, 'facilityId') }];

      for (const facility of facilities) {
        const id = objectIdString(facility['_id']);
        if (id === null) continue;
        const dayKey = asOf.toISOString().slice(0, 10);
        const existing = await this.dependencies.database.collection('backgroundJobs').findOne({
          facilityId: toObjectId(id, 'facilityId'),
          jobType: 'CONSULTANT_SHARING_RECONCILIATION',
          'payload.dayKey': dayKey,
          status: { $in: ['PENDING', 'PROCESSING', 'COMPLETED'] },
        });
        if (existing !== null) continue;
        await this.dependencies.jobs.enqueue({
          facilityId: id,
          jobType: 'CONSULTANT_SHARING_RECONCILIATION',
          payload: {
            dayKey,
            from: new Date(asOf.getTime() - 31 * 86_400_000).toISOString(),
            through: asOf.toISOString(),
          },
          maxAttempts: 5,
        });
        queuedReconciliations += 1;
        queuedJobs += 1;
      }
    }

    const deadLetteredRuns = await this.dependencies.database
      .collection('consultantCalculationRuns')
      .countDocuments({ ...facilityMatch, status: 'DEAD_LETTERED' });

    const completedAt = this.dependencies.clock.now();
    if (facilityId !== undefined) {
      await this.dependencies.audit.record({
        actor: systemActor(
          facilityId,
          `consultant-recovery:${facilityId}:${completedAt.toISOString()}`,
        ),
        action: 'CONSULTANT_SHARING_RECOVERY_SWEEP',
        entityType: 'RECOVERY',
        entityId: facilityId,
        after: {
          expiredAgreements,
          recoveredCalculationRuns,
          queuedReconciliations,
          queuedJobs,
          deadLetteredRuns,
          asOf: asOf.toISOString(),
        },
      });
    }

    return {
      expiredAgreements,
      recoveredCalculationRuns,
      queuedReconciliations,
      queuedJobs,
      deadLetteredRuns,
      completedAt: completedAt.toISOString(),
    };
  }


  public async completeCalculationRecovery(
    facilityId: string,
    calculationRunId: string,
    outputCalculationHash: string,
    completedAt: Date,
  ): Promise<void> {
    await this.dependencies.database.collection('consultantCalculationRuns').updateOne(
      {
        _id: toObjectId(calculationRunId, 'calculationRunId'),
        facilityId: toObjectId(facilityId, 'facilityId'),
        status: { $in: ['QUEUED', 'RUNNING', 'FAILED'] },
      },
      {
        $set: {
          status: 'COMPLETED',
          outputCalculationHash,
          completedAt,
          failedAt: null,
          nextAttemptAt: null,
          errorCode: null,
          errorMessageSanitized: null,
          deadLetterReason: null,
          processedEntryCount: 1,
        },
        $unset: { leaseOwner: '', leaseExpiresAt: '' },
        $inc: { version: 1 },
        $currentDate: { updatedAt: true },
      },
    );
  }

  public async failCalculationRecovery(
    facilityId: string,
    calculationRunId: string,
    attemptCount: number,
    maxAttempts: number,
    error: unknown,
    failedAt: Date,
  ): Promise<void> {
    const exhausted = attemptCount >= maxAttempts;
    const message = error instanceof Error
      ? error.message.slice(0, 2_000)
      : 'Unknown Consultant Sharing calculation recovery failure';
    const retryDelayMinutes = Math.min(60, 2 ** Math.min(attemptCount, 6));
    await this.dependencies.database.collection('consultantCalculationRuns').updateOne(
      {
        _id: toObjectId(calculationRunId, 'calculationRunId'),
        facilityId: toObjectId(facilityId, 'facilityId'),
        status: { $in: ['QUEUED', 'RUNNING', 'FAILED'] },
      },
      {
        $set: {
          status: exhausted ? 'DEAD_LETTERED' : 'FAILED',
          failedAt,
          completedAt: failedAt,
          errorCode: exhausted
            ? 'RECOVERY_ATTEMPTS_EXHAUSTED'
            : 'RECOVERY_ATTEMPT_FAILED',
          errorMessageSanitized: message,
          deadLetterReason: exhausted
            ? 'Automatic calculation recovery attempts were exhausted'
            : null,
          nextAttemptAt: exhausted
            ? null
            : new Date(failedAt.getTime() + retryDelayMinutes * 60_000),
        },
        $max: { attemptCount },
        $unset: { leaseOwner: '', leaseExpiresAt: '' },
        $inc: { version: 1, failedEntryCount: 1 },
        $currentDate: { updatedAt: true },
      },
    );
  }

  public async deadLetterExhaustedRuns(asOf: Date, limit = DEFAULT_LIMIT): Promise<number> {
    const candidates = await this.dependencies.database
      .collection('consultantCalculationRuns')
      .find({
        status: { $in: ['FAILED', 'QUEUED', 'RUNNING'] },
        $expr: { $gte: ['$attemptCount', '$maxAttempts'] },
      }, { projection: { _id: 1 } })
      .sort({ updatedAt: 1, _id: 1 })
      .limit(Math.max(1, Math.min(limit, MAX_LIMIT)))
      .toArray();
    if (candidates.length === 0) return 0;
    const result = await this.dependencies.database.collection('consultantCalculationRuns')
      .updateMany(
        { _id: { $in: candidates.map((candidate: Document) => candidate['_id']) } },
        {
          $set: {
            status: 'DEAD_LETTERED',
            failedAt: asOf,
            errorCode: 'RECOVERY_ATTEMPTS_EXHAUSTED',
            errorMessageSanitized: 'Calculation recovery attempts were exhausted',
            deadLetterReason: 'Automatic retry limit reached',
          },
          $unset: { leaseOwner: '', leaseExpiresAt: '', nextAttemptAt: '' },
          $inc: { version: 1 },
          $currentDate: { updatedAt: true },
        },
      );
    return result.modifiedCount;
  }

  public async recoverApplicationTransactions(asOf: Date, limit = DEFAULT_LIMIT): Promise<number> {
    const transactions = await this.dependencies.database
      .collection('applicationTransactions')
      .find({
        module: 'CONSULTANT_SHARING',
        status: { $in: ['STARTED', 'FAILED', 'RECOVERY_REQUIRED'] },
        $or: [
          { leaseExpiresAt: { $lte: asOf } },
          { updatedAt: { $lte: new Date(asOf.getTime() - 5 * 60_000) } },
        ],
      })
      .sort({ updatedAt: 1, _id: 1 })
      .limit(Math.max(1, Math.min(limit, MAX_LIMIT)))
      .toArray();

    let recovered = 0;
    for (const transaction of transactions) {
      const transactionId = String(transaction['transactionId'] ?? '');
      if (transactionId.length === 0) continue;
      const evidence = await this.hasCommittedEvidence(transactionId);
      const result = await this.dependencies.database.collection('applicationTransactions')
        .updateOne(
          { _id: transaction['_id'], version: transaction['version'] },
          {
            $set: {
              status: evidence ? 'COMPLETED' : 'FAILED',
              recoveryStatus: evidence
                ? 'CONSULTANT_SHARING_COMMITTED_EVIDENCE_FOUND'
                : 'CONSULTANT_SHARING_NO_COMMITTED_EVIDENCE',
              ...(evidence ? { completionTimestamp: asOf } : {}),
            },
            $unset: { recoveryLeaseOwner: '', recoveryLeaseExpiresAt: '' },
            $inc: { version: 1 },
            $currentDate: { updatedAt: true },
          },
        );
      recovered += result.modifiedCount;
    }
    return recovered;
  }

  private async hasCommittedEvidence(transactionId: string): Promise<boolean> {
    const collections = [
      'consultantAgreements',
      'consultantRevenueEntries',
      'consultantRevenueAdjustments',
      'consultantRevenueReversals',
      'consultantSettlements',
      'consultantSettlementPayments',
      'consultantDisputes',
      'auditLogs',
      'outboxEvents',
    ] as const;
    for (const collection of collections) {
      const evidence = await this.dependencies.database
        .collection<Document>(collection)
        .findOne({ transactionId }, { projection: { _id: 1 } });
      if (evidence !== null) return true;
    }
    return false;
  }
}