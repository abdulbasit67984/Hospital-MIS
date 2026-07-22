import Decimal from 'decimal.js';

import {
  decimal128ToString,
} from '@hospital-mis/database';

import {
  CLAIM_BATCH_NUMBER_SEQUENCE_KEY,
  CLAIM_PERMISSION_KEYS,
} from '../claims.constants.js';

import type {
  ApproveClaimBatchInput,
  ClaimsActorContext,
  ClaimsListQuery,
  CreateClaimBatchInput,
} from '../claims.contracts.js';

import {
  ClaimAccessDeniedError,
  ClaimBatchNotFoundError,
  ClaimBreakGlassProhibitedError,
  ClaimFinancialReconciliationError,
  ClaimMakerCheckerError,
  ClaimNotReadyError,
  ClaimVersionConflictError,
} from '../claims.errors.js';

import {
  normalizeOptionalClaimText,
  stableClaimPayloadHash,
} from '../claims.normalization.js';

import type {
  ClaimBatchRepositoryPort,
  ClaimsAccessPolicyPort,
  ClaimsApprovalPort,
  ClaimsAuditPort,
  ClaimsClockPort,
  ClaimsEncryptionPort,
  ClaimsNumberSequencePort,
  ClaimsOutboxPort,
  ClaimsRepositoryPort,
  ClaimsTransactionManagerPort,
} from '../claims.ports.js';

import {
  projectClaimBatch,
} from '../claims.projections.js';

export interface ClaimBatchServiceDependencies {
  claims: ClaimsRepositoryPort;
  batches: ClaimBatchRepositoryPort;
  accessPolicy: ClaimsAccessPolicyPort;
  approval: ClaimsApprovalPort;
  transactionManager: ClaimsTransactionManagerPort;
  audit: ClaimsAuditPort;
  outbox: ClaimsOutboxPort;
  clock: ClaimsClockPort;
  numberSequence: ClaimsNumberSequencePort;
  encryption: ClaimsEncryptionPort;
}

function moneySum(
  values: readonly Parameters<typeof decimal128ToString>[0][],
): string {
  return values
    .reduce(
      (total, value) => total.plus(decimal128ToString(value)),
      new Decimal(0),
    )
    .toFixed(2);
}

export class ClaimBatchService {
  public constructor(
    private readonly dependencies: ClaimBatchServiceDependencies,
  ) {}

  public async get(
    actor: ClaimsActorContext,
    batchId: string,
  ) {
    await this.requirePermission(actor, CLAIM_PERMISSION_KEYS.READ);
    const batch = await this.dependencies.batches.findById(
      actor.facilityId,
      batchId,
    );
    if (batch === null) {
      throw new ClaimBatchNotFoundError();
    }
    return projectClaimBatch(batch);
  }

  public async list(
    actor: ClaimsActorContext,
    query: ClaimsListQuery,
  ) {
    await this.requirePermission(actor, CLAIM_PERMISSION_KEYS.READ);
    const { records, totalItems } = await this.dependencies.batches.list(
      actor.facilityId,
      query,
    );
    const page = Math.max(1, Math.trunc(query.page ?? 1));
    const pageSize = Math.max(1, Math.trunc(query.pageSize ?? 25));
    return {
      items: records.map(projectClaimBatch),
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    };
  }

  public async create(
    actor: ClaimsActorContext,
    idempotencyKey: string,
    input: CreateClaimBatchInput,
  ) {
    await this.requirePermission(
      actor,
      CLAIM_PERMISSION_KEYS.BATCH_MANAGE,
    );

    return this.dependencies.transactionManager.execute({
      transactionType: 'CREATE_CLAIM_BATCH',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: input.claimIds
        .map((claimId) =>
          `claims:claim:${actor.facilityId}:${claimId}`,
        )
        .sort(),
      idempotencyPayload: input,
      journalPayload: {
        payerOrganizationId: input.payerOrganizationId,
        claimCount: input.claimIds.length,
        submissionChannel: input.submissionChannel,
      },
      execute: async (transaction) => {
        const claims = await this.dependencies.claims.findByIds(
          actor.facilityId,
          input.claimIds,
          transaction.session,
        );
        if (claims.length !== input.claimIds.length) {
          throw new ClaimNotReadyError();
        }
        if (claims.some((claim) => claim.status !== 'READY')) {
          throw new ClaimNotReadyError();
        }
        if (
          claims.some(
            (claim) =>
              claim.payerOrganizationId.toHexString() !==
                input.payerOrganizationId ||
              (input.panelPlanId != null &&
                claim.panelPlanId.toHexString() !== input.panelPlanId),
          )
        ) {
          throw new ClaimFinancialReconciliationError(
            'All batch claims must belong to the same payer and coverage plan',
          );
        }
        for (const claim of claims) {
          const existing =
            await this.dependencies.batches.findActiveContainingClaim(
              actor.facilityId,
              claim._id.toHexString(),
              transaction.session,
            );
          if (existing !== null) {
            throw new ClaimFinancialReconciliationError(
              'A ready claim cannot occur in more than one active submission batch',
            );
          }
        }
        const now = this.dependencies.clock.now();
        const batchNumber = await this.dependencies.numberSequence.next({
          facilityId: actor.facilityId,
          sequenceKey: CLAIM_BATCH_NUMBER_SEQUENCE_KEY,
          effectiveAt: now,
          actorUserId: actor.userId,
          transaction,
        });
        const normalizedNotes = normalizeOptionalClaimText(input.notes);
        const notesEncrypted = normalizedNotes === null
          ? null
          : await this.dependencies.encryption.encrypt(normalizedNotes);
        const batch = await this.dependencies.batches.create(
          actor,
          input,
          batchNumber,
          {
            claimCount: claims.length,
            claimedAmount: moneySum(
              claims.map((claim) => claim.claimedAmount),
            ),
            approvedAmount: moneySum(
              claims.map((claim) => claim.approvedAmount),
            ),
            paidAmount: moneySum(
              claims.map((claim) => claim.paidAmount),
            ),
          },
          {
            operationKey: stableClaimPayloadHash({
              facilityId: actor.facilityId,
              idempotencyKey,
              payerOrganizationId: input.payerOrganizationId,
              claimIds: [...input.claimIds].sort(),
            }),
            notesEncrypted,
          },
          transaction,
        );
        await this.dependencies.audit.record({
          actor,
          action: 'CLAIM_BATCH_CREATED',
          entityType: 'ClaimBatch',
          entityId: batch._id.toHexString(),
          reason: null,
          before: null,
          after: {
            batchId: batch._id.toHexString(),
            status: batch.status,
            claimCount: batch.claimCount,
            version: batch.version,
          },
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType: 'claims.batch.created',
          aggregateType: 'ClaimBatch',
          aggregateId: batch._id.toHexString(),
          payload: {
            claimBatchId: batch._id.toHexString(),
            status: batch.status,
            version: batch.version,
            eventAt: now.toISOString(),
          },
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        return projectClaimBatch(batch);
      },
    });
  }

  public async approve(
    actor: ClaimsActorContext,
    batchId: string,
    idempotencyKey: string,
    input: ApproveClaimBatchInput,
  ) {
    await this.requirePermission(
      actor,
      CLAIM_PERMISSION_KEYS.SUBMISSION_APPROVE,
    );
    if (actor.breakGlassReason !== undefined) {
      throw new ClaimBreakGlassProhibitedError();
    }

    return this.dependencies.transactionManager.execute({
      transactionType: 'APPROVE_CLAIM_BATCH',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`claims:batch:${actor.facilityId}:${batchId}`],
      idempotencyPayload: input,
      journalPayload: { batchId, approvalRequestId: input.approvalRequestId },
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
        if (batch.status !== 'DRAFT') {
          throw new ClaimNotReadyError();
        }
        const makerUserId = batch.createdBy.toHexString();
        if (makerUserId === actor.userId) {
          throw new ClaimMakerCheckerError();
        }
        await this.dependencies.approval.assertApproved({
          facilityId: actor.facilityId,
          approvalRequestId: input.approvalRequestId,
          action: 'CLAIM_BATCH_SUBMISSION',
          entityId: batchId,
          makerUserId,
          checkerUserId: actor.userId,
          session: transaction.session,
        });
        const now = this.dependencies.clock.now();
        const updated = await this.dependencies.batches.updateStatus(
          actor.facilityId,
          batchId,
          input.expectedVersion,
          {
            status: 'APPROVED',
            approvalRequestId: input.approvalRequestId,
            approvedBy: actor.userId,
            approvedAt: now,
          },
          actor.userId,
          transaction,
        );
        if (updated === null) {
          throw new ClaimVersionConflictError();
        }
        await this.dependencies.audit.record({
          actor,
          action: 'CLAIM_BATCH_APPROVED',
          entityType: 'ClaimBatch',
          entityId: batchId,
          reason: input.reason,
          before: { status: batch.status, version: batch.version },
          after: { status: updated.status, version: updated.version },
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType: 'claims.batch.approved',
          aggregateType: 'ClaimBatch',
          aggregateId: batchId,
          payload: {
            claimBatchId: batchId,
            status: updated.status,
            version: updated.version,
            eventAt: now.toISOString(),
          },
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        return projectClaimBatch(updated);
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
      sensitiveFinancialAction:
        permission === CLAIM_PERMISSION_KEYS.SUBMISSION_APPROVE,
    });
    if (!decision.allowed) {
      throw new ClaimAccessDeniedError(
        decision.denialReason ?? undefined,
      );
    }
  }
}