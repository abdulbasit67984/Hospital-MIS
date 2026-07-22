import {
  CLAIM_PERMISSION_KEYS,
  type ClaimStatus,
} from '../claims.constants.js';

import type {
  ClaimsActorContext,
} from '../claims.contracts.js';

import {
  ClaimAccessDeniedError,
  ClaimBreakGlassProhibitedError,
  ClaimMakerCheckerError,
  ClaimNotFoundError,
  ClaimVersionConflictError,
} from '../claims.errors.js';

import type {
  ClaimsAccessPolicyPort,
  ClaimsRepositoryPort,
  ClaimsTransactionManagerPort,
  ClaimsWorkflowPort,
} from '../claims.ports.js';

export interface SensitiveClaimLifecycleInput {
  expectedVersion: number;
  approvalRequestId: string;
  makerUserId: string;
  reason: string;
}

export interface ClaimSensitiveLifecycleServiceDependencies {
  claims: ClaimsRepositoryPort;
  workflow: ClaimsWorkflowPort;
  accessPolicy: ClaimsAccessPolicyPort;
  transactionManager: ClaimsTransactionManagerPort;
}

const transitionPermission: Readonly<
  Record<'CANCELLED' | 'REVERSED' | 'VOIDED', string>
> = {
  CANCELLED: CLAIM_PERMISSION_KEYS.CANCEL_APPROVE,
  REVERSED: CLAIM_PERMISSION_KEYS.REVERSE_APPROVE,
  VOIDED: CLAIM_PERMISSION_KEYS.VOID_APPROVE,
};

export class ClaimSensitiveLifecycleService {
  public constructor(
    private readonly dependencies: ClaimSensitiveLifecycleServiceDependencies,
  ) {}

  public cancel(
    actor: ClaimsActorContext,
    claimId: string,
    idempotencyKey: string,
    input: SensitiveClaimLifecycleInput,
  ) {
    return this.execute(actor, claimId, idempotencyKey, input, 'CANCELLED');
  }

  public reverse(
    actor: ClaimsActorContext,
    claimId: string,
    idempotencyKey: string,
    input: SensitiveClaimLifecycleInput,
  ) {
    return this.execute(actor, claimId, idempotencyKey, input, 'REVERSED');
  }

  public voidClaim(
    actor: ClaimsActorContext,
    claimId: string,
    idempotencyKey: string,
    input: SensitiveClaimLifecycleInput,
  ) {
    return this.execute(actor, claimId, idempotencyKey, input, 'VOIDED');
  }

  private async execute(
    actor: ClaimsActorContext,
    claimId: string,
    idempotencyKey: string,
    input: SensitiveClaimLifecycleInput,
    toStatus: Extract<ClaimStatus, 'CANCELLED' | 'REVERSED' | 'VOIDED'>,
  ) {
    if (actor.breakGlassReason !== undefined) {
      throw new ClaimBreakGlassProhibitedError();
    }
    if (input.makerUserId === actor.userId) {
      throw new ClaimMakerCheckerError();
    }

    const permission = transitionPermission[toStatus];
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      permission,
      resourceFacilityId: actor.facilityId,
      makerUserId: input.makerUserId,
      sensitiveFinancialAction: true,
    });
    if (!decision.allowed) {
      throw new ClaimAccessDeniedError(decision.denialReason ?? undefined);
    }

    return this.dependencies.transactionManager.execute({
      transactionType: `CLAIM_${toStatus}`,
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`claims:claim:${actor.facilityId}:${claimId}`],
      idempotencyPayload: input,
      journalPayload: {
        claimId,
        toStatus,
        expectedVersion: input.expectedVersion,
      },
      execute: async (transaction) => {
        const claim = await this.dependencies.claims.findById(
          actor.facilityId,
          claimId,
          transaction.session,
        );
        if (claim === null) {
          throw new ClaimNotFoundError();
        }
        if (claim.version !== input.expectedVersion) {
          throw new ClaimVersionConflictError();
        }

        return this.dependencies.workflow.transition({
          actor,
          claim,
          toStatus,
          reason: input.reason,
          makerUserId: input.makerUserId,
          checkerUserId: actor.userId,
          approvalRequestId: input.approvalRequestId,
          transaction,
        });
      },
    });
  }
}