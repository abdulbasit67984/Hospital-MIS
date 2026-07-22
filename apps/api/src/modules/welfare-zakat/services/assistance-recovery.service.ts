import type { Db } from '@hospital-mis/database';
import { createObjectId, toObjectId } from '@hospital-mis/database';
import type { Document } from 'mongodb';

import type { OutboxService } from '../../../infrastructure/outbox.service.js';
import type {
  RecoverableInfrastructure,
  RecoveryCycleResult,
} from '../../../infrastructure/recovery-loop.js';
import { WELFARE_ZAKAT_PERMISSION_KEYS } from '../welfare-zakat.constants.js';
import type {
  WelfareZakatActorContext,
  WelfareZakatRecoveryRunInput,
} from '../welfare-zakat.contracts.js';
import {
  AssistanceAccessDeniedError,
  AssistanceBreakGlassApprovalBypassError,
  AssistanceVersionConflictError,
} from '../welfare-zakat.errors.js';
import type {
  WelfareZakatAccessPolicyPort,
  WelfareZakatClockPort,
} from '../welfare-zakat.ports.js';
import { stableAssistancePayloadHash } from '../welfare-zakat.normalization.js';

export const WELFARE_ZAKAT_RECOVERABLE_TRANSACTION_TYPES = [
  'CREATE_ASSISTANCE_FUND',
  'UPDATE_ASSISTANCE_FUND',
  'CHANGE_ASSISTANCE_FUND_STATUS',
  'RECORD_ASSISTANCE_FUND_INFLOW',
  'REQUEST_ASSISTANCE_FUND_TRANSFER',
  'POST_ASSISTANCE_FUND_TRANSFER',
  'REJECT_ASSISTANCE_FUND_TRANSFER',
  'REVERSE_ASSISTANCE_FUND_TRANSFER',
  'CREATE_ASSISTANCE_APPLICATION',
  'UPDATE_ASSISTANCE_APPLICATION',
  'SUBMIT_ASSISTANCE_APPLICATION',
  'REQUEST_ASSISTANCE_APPLICATION_INFORMATION',
  'RECORD_ASSISTANCE_REVIEW',
  'EVALUATE_ASSISTANCE_ELIGIBILITY',
  'REQUEST_ASSISTANCE_APPROVAL',
  'DECIDE_ASSISTANCE_APPROVAL',
  'EXPIRE_ASSISTANCE_APPROVAL',
  'EXPIRE_ASSISTANCE_APPLICATION',
  'RESERVE_ASSISTANCE_FUNDS',
  'RELEASE_ASSISTANCE_RESERVATION',
  'CREATE_ASSISTANCE_ALLOCATION',
  'CONFIRM_UTILIZE_ASSISTANCE_ALLOCATION',
  'REQUEST_ASSISTANCE_ALLOCATION_REVERSAL',
  'POST_ASSISTANCE_ALLOCATION_REVERSAL',
  'POST_ASSISTANCE_REFUND',
  'POST_ASSISTANCE_REPAYMENT',
  'POST_ASSISTANCE_RECOVERY',
  'RECONCILE_ASSISTANCE_FUND',
  'RECONCILE_ASSISTANCE_ALLOCATION',
  'ASSIGN_ASSISTANCE_WORK_ITEM',
  'ESCALATE_ASSISTANCE_WORK_ITEM',
] as const;

const evidenceCollections = [
  'fundTransactions',
  'fundTransfers',
  'assistanceApplicationHistories',
  'assistanceReviews',
  'eligibilityEvaluationSnapshots',
  'assistanceApprovalHistories',
  'assistanceReservations',
  'invoiceFundAllocations',
  'fundAllocationReversals',
  'fundReturns',
  'assistanceWorkItems',
  'auditLogs',
] as const;

export class AssistanceRecoveryService implements RecoverableInfrastructure {
  public constructor(
    private readonly dependencies: Readonly<{
      database: Db;
      operationalOutbox: OutboxService;
      accessPolicy: WelfareZakatAccessPolicyPort;
      clock: WelfareZakatClockPort;
    }>,
  ) {}

  public async runManual(
    actor: WelfareZakatActorContext,
    idempotencyKey: string,
    input: WelfareZakatRecoveryRunInput,
  ): Promise<Readonly<{
    markedStale: number;
    recovered: number;
    failed: number;
  }>> {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      permission: WELFARE_ZAKAT_PERMISSION_KEYS.RECOVERY_MANAGE,
      resourceFacilityId: actor.facilityId,
      sensitiveFinancialAction: true,
    });
    if (!decision.allowed) {
      throw new AssistanceAccessDeniedError(decision.denialReason ?? undefined);
    }
    if (actor.breakGlassReason != null) {
      throw new AssistanceBreakGlassApprovalBypassError();
    }
    const collection = this.dependencies.database.collection<Document>(
      'applicationTransactions',
    );
    const facilityId = toObjectId(actor.facilityId, 'facilityId');
    const requestHash = stableAssistancePayloadHash({
      action: 'RUN_ASSISTANCE_RECOVERY',
      facilityId: actor.facilityId,
      input,
    });
    const operationFilter = {
      facilityId,
      transactionType: 'RUN_ASSISTANCE_RECOVERY',
      idempotencyKey,
    };
    const existing = await collection.findOne(operationFilter);
    if (existing != null) {
      if (existing['requestHash'] !== requestHash) {
        throw new AssistanceVersionConflictError();
      }
      if (existing['status'] === 'COMPLETED' && existing['result'] != null) {
        return existing['result'] as Readonly<{
          markedStale: number;
          recovered: number;
          failed: number;
        }>;
      }
      if (['PENDING', 'IN_PROGRESS'].includes(String(existing['status']))) {
        throw new AssistanceVersionConflictError();
      }
    }

    const now = this.dependencies.clock.now();
    const transactionId = stableAssistancePayloadHash({
      action: 'RUN_ASSISTANCE_RECOVERY',
      facilityId: actor.facilityId,
      idempotencyKey,
    });
    if (existing == null) {
      try {
        await collection.insertOne({
          _id: createObjectId(),
          facilityId,
          transactionId,
          transactionType: 'RUN_ASSISTANCE_RECOVERY',
          idempotencyKey,
          correlationId: actor.correlationId,
          initiatedBy: toObjectId(actor.userId, 'initiatedBy'),
          status: 'IN_PROGRESS',
          requestHash,
          retryCount: 0,
          schemaVersion: 1,
          version: 0,
          createdAt: now,
          updatedAt: now,
        });
      } catch (error) {
        const concurrent = await collection.findOne(operationFilter);
        if (concurrent?.['requestHash'] === requestHash) {
          if (
            concurrent['status'] === 'COMPLETED' &&
            concurrent['result'] != null
          ) {
            return concurrent['result'] as Readonly<{
              markedStale: number;
              recovered: number;
              failed: number;
            }>;
          }
          throw new AssistanceVersionConflictError();
        }
        throw error;
      }
    } else {
      const retry = await collection.updateOne(
        { ...operationFilter, version: existing['version'], status: { $in: ['FAILED', 'RECOVERY_REQUIRED'] } },
        {
          $set: {
            status: 'IN_PROGRESS',
            correlationId: actor.correlationId,
            initiatedBy: toObjectId(actor.userId, 'initiatedBy'),
            requestHash,
          },
          $inc: { retryCount: 1, version: 1 },
          $unset: { errorDetails: '', result: '', completedAt: '' },
          $currentDate: { updatedAt: true },
        },
      );
      if (retry.modifiedCount !== 1) throw new AssistanceVersionConflictError();
    }

    try {
      const markedStale = await this.markStaleTransactions(
        new Date(now.getTime() - input.staleAfterMinutes * 60_000),
        actor.facilityId,
      );
      const recovered = await this.recoverAvailable({
        workerId: `manual-welfare-zakat-recovery:${actor.userId}`,
        maxTransactions: input.limit,
        now,
        facilityId: actor.facilityId,
      });
      const result = { markedStale, ...recovered };
      await collection.updateOne(
        operationFilter,
        {
          $set: { status: 'COMPLETED', result, completedAt: now },
          $inc: { version: 1 },
          $currentDate: { updatedAt: true },
        },
      );
      return result;
    } catch (error) {
      await collection.updateOne(
        operationFilter,
        {
          $set: {
            status: 'FAILED',
            errorDetails: {
              name: error instanceof Error ? error.name : typeof error,
              message: error instanceof Error
                ? error.message.slice(0, 2_000)
                : 'Unknown Welfare and Zakat manual recovery failure',
            },
          },
          $inc: { version: 1 },
          $currentDate: { updatedAt: true },
        },
      );
      throw error;
    }
  }

  public async markStaleTransactions(
    staleBefore: Date,
    facilityId?: string,
  ): Promise<number> {
    const result = await this.dependencies.database
      .collection('applicationTransactions')
      .updateMany(
        {
          transactionType: { $in: [...WELFARE_ZAKAT_RECOVERABLE_TRANSACTION_TYPES] },
          ...(facilityId == null
            ? {}
            : { facilityId: toObjectId(facilityId, 'facilityId') }),
          status: { $in: ['PENDING', 'IN_PROGRESS'] },
          updatedAt: { $lte: staleBefore },
        },
        {
          $set: {
            status: 'RECOVERY_REQUIRED',
            recoveryStatus: 'WELFARE_ZAKAT_ABANDONED_TRANSACTION_DETECTED',
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
            transactionType: { $in: [...WELFARE_ZAKAT_RECOVERABLE_TRANSACTION_TYPES] },
            status: 'RECOVERY_REQUIRED',
            ...(input.facilityId == null
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
              recoveryStatus: 'WELFARE_ZAKAT_RECOVERY_IN_PROGRESS',
            },
            $inc: { retryCount: 1, version: 1 },
            $currentDate: { updatedAt: true },
          },
          { sort: { updatedAt: 1 }, returnDocument: 'after' },
        );
      if (transaction === null) break;

      try {
        const transactionId = String(transaction['transactionId'] ?? '');
        const evidence = transactionId.length > 0
          ? await this.hasCommittedEvidence(transactionId)
          : false;
        await this.dependencies.database
          .collection('applicationTransactions')
          .updateOne(
            { _id: transaction['_id'], recoveryLeaseOwner: input.workerId },
            {
              $set: {
                status: evidence ? 'COMPLETED' : 'FAILED',
                recoveryStatus: evidence
                  ? 'WELFARE_ZAKAT_RECOVERED_FROM_DOMAIN_EVIDENCE'
                  : 'WELFARE_ZAKAT_NO_COMMITTED_DOMAIN_EVIDENCE',
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
        if (evidence) {
          await this.dependencies.operationalOutbox.releaseTransactionEvents(transactionId);
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
                recoveryStatus: 'WELFARE_ZAKAT_RECOVERY_FAILED',
                errorDetails: {
                  name: error instanceof Error ? error.name : typeof error,
                  message: error instanceof Error
                    ? error.message.slice(0, 2_000)
                    : 'Unknown Welfare and Zakat recovery failure',
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

  private async hasCommittedEvidence(transactionId: string): Promise<boolean> {
    for (const collectionName of evidenceCollections) {
      const evidence = await this.dependencies.database
        .collection(collectionName)
        .findOne(
          collectionName === 'auditLogs'
            ? { transactionId, module: 'WELFARE_ZAKAT', outcome: 'SUCCESS' }
            : { transactionId },
          { projection: { _id: 1 } },
        );
      if (evidence !== null) return true;
    }
    return false;
  }
}