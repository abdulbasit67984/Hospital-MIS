import type {
  EncryptedSettingValue,
  FacilityActorContext,
} from './facility.types.js';

export interface FacilityTransactionCompensation {
  key: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface FacilityTransactionContext {
  transactionId: string;
  idempotencyKey: string;

  checkpoint(
    state: string,
    data?: Record<string, unknown>,
  ): Promise<void>;

  registerCompensation(
    compensation: FacilityTransactionCompensation,
  ): Promise<void>;
}

export interface FacilityTransactionRequest<T> {
  transactionType: string;
  idempotencyKey: string;
  actorUserId: string;
  facilityId: string;
  correlationId: string;
  lockKeys: string[];
  payload: Record<string, unknown>;

  execute(
    context: FacilityTransactionContext,
  ): Promise<T>;
}

export interface FacilityTransactionManagerPort {
  execute<T>(
    request: FacilityTransactionRequest<T>,
  ): Promise<T>;
}

export interface FacilityAuditEntry {
  transactionId: string;
  deduplicationKey: string;

  action: string;
  entityType: string;
  entityId: string;

  actorUserId: string;
  facilityId: string;
  correlationId: string;

  ipAddress?: string;
  userAgent?: string;

  occurredAt: Date;
  reason?: string;

  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

export interface FacilityAuditPort {
  append(
    entry: FacilityAuditEntry,
  ): Promise<void>;
}

export interface FacilityOutboxMessage {
  transactionId: string;
  deduplicationKey: string;

  eventType: string;
  aggregateType: string;
  aggregateId: string;

  actorUserId: string;
  facilityId: string;
  correlationId: string;

  occurredAt: Date;
  payload: Record<string, unknown>;
}

export interface FacilityOutboxPort {
  enqueue(
    message: FacilityOutboxMessage,
  ): Promise<void>;
}

export interface FacilityClockPort {
  now(): Date;
}

export interface ProtectedFacilitySettingValue {
  encryptedValue: EncryptedSettingValue;
  valueHash: string;
}

export interface FacilitySensitiveSettingCryptoPort {
  protect(
    value: unknown,
    associatedData: string,
  ): ProtectedFacilitySettingValue;

  unprotect<T>(
    encryptedValue: EncryptedSettingValue,
    associatedData: string,
  ): T;

  hash(
    value: unknown,
    associatedData: string,
  ): string;

  matchesHash(
    value: unknown,
    associatedData: string,
    expectedHash: string,
  ): boolean;

  needsRotation(
    encryptedValue: EncryptedSettingValue,
  ): boolean;
}

export interface FacilityMutationDependencies {
  transactionManager: FacilityTransactionManagerPort;
  audit: FacilityAuditPort;
  outbox: FacilityOutboxPort;
  clock: FacilityClockPort;
}

export function buildFacilityAuditActorFields(
  actor: FacilityActorContext,
): Pick<
  FacilityAuditEntry,
  | 'actorUserId'
  | 'correlationId'
  | 'ipAddress'
  | 'userAgent'
> {
  return {
    actorUserId:
      actor.userId,

    correlationId:
      actor.correlationId,

    ...(actor.ipAddress === undefined
      ? {}
      : {
          ipAddress:
            actor.ipAddress,
        }),

    ...(actor.userAgent === undefined
      ? {}
      : {
          userAgent:
            actor.userAgent,
        }),
  };
}