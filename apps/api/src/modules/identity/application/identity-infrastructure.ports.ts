import type {
  IdentityMutationRequest,
} from './identity-application.types.js';

export interface IdentityMutationCoordinatorPort {
  /**
   * Phase 3 adapter responsibilities:
   *
   * 1. Reserve/check the idempotency record.
   * 2. Acquire every requested lease lock in deterministic order.
   * 3. Persist the application transaction and step states.
   * 4. Execute incomplete domain steps.
   * 5. Compensate completed domain steps if another domain step fails.
   * 6. Persist audit records after domain completion.
   * 7. Persist durable outbox events.
   * 8. Leave audit/outbox failures in a recoverable state without undoing
   *    already completed domain changes.
   * 9. Return the previously stored response for completed idempotent calls.
   */
  execute<TContext extends object, TResult>(
    request: IdentityMutationRequest<TContext, TResult>,
  ): Promise<TResult>;
}

export interface PasswordHasherPort {
  hash(plainTextPassword: string): Promise<string>;
  verify(
    plainTextPassword: string,
    passwordHash: string,
  ): Promise<boolean>;
}

export interface UserSessionRevokerPort {
  revokeAllForUser(input: {
    userId: string;
    actorUserId: string;
    reason: string;
    correlationId: string;
    excludeSessionId?: string;
  }): Promise<number>;
}