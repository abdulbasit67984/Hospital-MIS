import type {
  AuthConfig,
} from '@hospital-mis/config';

import type {
  Db,
} from '@hospital-mis/database';

import {
  createObjectId,
  toObjectId,
} from '@hospital-mis/database';

import {
  AppError,
  ConflictError,
  hashPassword,
  verifyPassword,
} from '@hospital-mis/shared';

import type {
  AuditRepository,
} from '../../audit/audit.repository.js';

import {
  sanitizeAuditSnapshot,
} from '../../audit/audit.sanitizer.js';

import type {
  AuditSensitivity,
} from '../../audit/audit.types.js';

import type {
  IdentityAuditEntry,
  IdentityAuditPort,
  IdentityOutboxMessage,
  IdentityOutboxPort,
  IdentityPasswordHasherPort,
  IdentitySessionRevocationPort,
  RevokeUserSessionsRequest,
  RevokeUserSessionsResult,
} from '../identity.ports.js';

function isDuplicateKey(
  error: unknown,
): boolean {
  return (
    typeof error ===
      'object' &&
    error !== null &&
    'code' in error &&
    error.code ===
      11000
  );
}

function requiredFacilityId(
  facilityId:
    | string
    | null
    | undefined,

  operation: string,
): string {
  if (
    facilityId ===
      undefined ||
    facilityId ===
      null
  ) {
    throw new AppError({
      code:
        'IDENTITY_FACILITY_CONTEXT_REQUIRED',

      message:
        `Facility context is required to ${operation}`,

      statusCode:
        500,

      retryable:
        false,
    });
  }

  return facilityId;
}

function auditSensitivity(
  action: string,
): AuditSensitivity {
  if (
    action.includes(
      'password',
    ) ||
    action.includes(
      'sessions',
    ) ||
    action.includes(
      'permissions',
    ) ||
    action.includes(
      'roles_changed',
    )
  ) {
    return 'HIGHLY_SENSITIVE';
  }

  return 'SENSITIVE';
}

export class MongoIdentityAuditAdapter
implements IdentityAuditPort {
  public constructor(
    private readonly repository:
      AuditRepository,
  ) {}

  public async append(
    entry:
      IdentityAuditEntry,
  ): Promise<void> {
    const facilityId =
      requiredFacilityId(
        entry.facilityId,
        'write an identity audit event',
      );

    try {
      await this.repository
        .insertAuditEvent({
          eventId:
            entry.deduplicationKey,

          facilityId,

          actorId:
            entry.actorUserId,

          actorRoleIds:
            [],

          actorRoleCodes:
            [],

          action:
            entry.action,

          module:
            'identity',

          entityType:
            entry.entityType,

          entityId:
            entry.entityId,

          beforeSnapshot:
            sanitizeAuditSnapshot(
              entry.before ??
                null,
            ),

          afterSnapshot:
            sanitizeAuditSnapshot(
              entry.after ??
                null,
            ),

          metadata:
            sanitizeAuditSnapshot({
              ...(
                entry.metadata ??
                {}
              ),

              deduplicationKey:
                entry.deduplicationKey,
            }),

          outcome:
            'SUCCESS',

          sensitivity:
            auditSensitivity(
              entry.action,
            ),

          correlationId:
            entry.correlationId,

          transactionId:
            entry.transactionId,

          requestSource:
            'API',

          ...(entry.ipAddress ===
          undefined
            ? {}
            : {
                ipAddress:
                  entry.ipAddress,
              }),

          ...(entry.userAgent ===
          undefined
            ? {}
            : {
                userAgent:
                  entry.userAgent,
              }),

          occurredAt:
            entry.occurredAt,
        });
    } catch (error) {
      if (
        !isDuplicateKey(
          error,
        )
      ) {
        throw error;
      }
    }
  }
}

type OutboxDocument =
  Record<
    string,
    unknown
  > & {
    facilityId:
      ReturnType<
        typeof toObjectId
      >;

    eventId:
      string;

    transactionId:
      string;

    eventType:
      string;

    aggregateType:
      string;

    aggregateId:
      string;
  };

export class MongoIdentityOutboxAdapter
implements IdentityOutboxPort {
  public constructor(
    private readonly database:
      Db,
  ) {}

  public async enqueue(
    message:
      IdentityOutboxMessage,
  ): Promise<void> {
    const facilityId =
      requiredFacilityId(
        message.facilityId,
        'enqueue an identity event',
      );

    const collection =
      this.database
        .collection<OutboxDocument>(
          'outboxEvents',
        );

    const now =
      message.occurredAt;

    try {
      await collection.insertOne({
        _id:
          createObjectId(),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        eventId:
          message.deduplicationKey,

        transactionId:
          message.transactionId,

        eventType:
          message.eventType,

        aggregateType:
          message.aggregateType,

        aggregateId:
          message.aggregateId,

        payload: {
          ...message.payload,

          actorUserId:
            message.actorUserId,

          correlationId:
            message.correlationId,

          occurredAt:
            message.occurredAt
              .toISOString(),
        },

        status:
          'BLOCKED',

        availableAt:
          now,

        attemptCount:
          0,

        schemaVersion:
          1,

        version:
          0,

        createdAt:
          now,

        updatedAt:
          now,
      });
    } catch (error) {
      if (
        !isDuplicateKey(
          error,
        )
      ) {
        throw error;
      }

      const existing =
        await collection.findOne({
          eventId:
            message.deduplicationKey,
        });

      if (
        existing ===
          null ||
        existing.transactionId !==
          message.transactionId ||
        existing.eventType !==
          message.eventType ||
        existing.aggregateType !==
          message.aggregateType ||
        existing.aggregateId !==
          message.aggregateId
      ) {
        throw new ConflictError(
          'The identity outbox deduplication key is already used by another event',
        );
      }
    }
  }
}

export class ArgonIdentityPasswordHasherAdapter
implements IdentityPasswordHasherPort {
  public constructor(
    private readonly authConfig:
      AuthConfig,
  ) {}

  public async hash(
    plainTextPassword:
      string,
  ): Promise<string> {
    return hashPassword(
      plainTextPassword,
      this.authConfig,
    );
  }

  public async verify(
    passwordHash:
      string,

    plainTextPassword:
      string,
  ): Promise<boolean> {
    return verifyPassword(
      plainTextPassword,
      passwordHash,
      this.authConfig,
    );
  }
}

type SessionRevocationDocument =
  Record<
    string,
    unknown
  > & {
    transactionId:
      string;

    userId:
      ReturnType<
        typeof toObjectId
      >;

    status:
      | 'IN_PROGRESS'
      | 'COMPLETED'
      | 'FAILED';

    revokedSessionCount:
      number;

    version:
      number;
  };

export class MongoIdentitySessionRevocationAdapter
implements IdentitySessionRevocationPort {
  public constructor(
    private readonly database:
      Db,
  ) {}

  public async revokeAllForUser(
    request:
      RevokeUserSessionsRequest,
  ): Promise<RevokeUserSessionsResult> {
    const operations =
      this.database
        .collection<SessionRevocationDocument>(
          'identitySessionRevocations',
        );

    const userId =
      toObjectId(
        request.userId,
        'userId',
      );

    const revokedBy =
      toObjectId(
        request.revokedBy,
        'revokedBy',
      );

    const now =
      new Date();

    let existing =
      await operations.findOne({
        transactionId:
          request.transactionId,
      });

    if (
      existing?.status ===
      'COMPLETED'
    ) {
      return {
        revokedSessionCount:
          existing.revokedSessionCount,
      };
    }

    if (
      existing?.status ===
      'IN_PROGRESS'
    ) {
      throw new AppError({
        code:
          'IDENTITY_SESSION_REVOCATION_IN_PROGRESS',

        message:
          'Session revocation is already in progress for this transaction',

        statusCode:
          409,

        retryable:
          true,
      });
    }

    if (
      existing ===
      null
    ) {
      try {
        await operations.insertOne({
          _id:
            createObjectId(),

          transactionId:
            request.transactionId,

          userId,

          revokedBy,

          reason:
            request.reason,

          excludeSessionId:
            request.excludeSessionId ??
            null,

          status:
            'IN_PROGRESS',

          revokedSessionCount:
            0,

          schemaVersion:
            1,

          version:
            0,

          createdAt:
            now,

          updatedAt:
            now,
        });
      } catch (error) {
        if (
          !isDuplicateKey(
            error,
          )
        ) {
          throw error;
        }

        existing =
          await operations.findOne({
            transactionId:
              request.transactionId,
          });

        if (
          existing?.status ===
          'COMPLETED'
        ) {
          return {
            revokedSessionCount:
              existing.revokedSessionCount,
          };
        }

        throw new AppError({
          code:
            'IDENTITY_SESSION_REVOCATION_IN_PROGRESS',

          message:
            'Session revocation is already in progress for this transaction',

          statusCode:
            409,

          retryable:
            true,
        });
      }
    } else {
      const takeover =
        await operations.updateOne(
          {
            transactionId:
              request.transactionId,

            status:
              'FAILED',

            version:
              existing.version,
          },
          {
            $set: {
              status:
                'IN_PROGRESS',

              revokedBy,

              reason:
                request.reason,

              excludeSessionId:
                request.excludeSessionId ??
                null,

              lastError:
                null,
            },

            $inc: {
              version:
                1,
            },

            $currentDate: {
              updatedAt:
                true,
            },
          },
        );

      if (
        takeover.modifiedCount !==
        1
      ) {
        throw new AppError({
          code:
            'IDENTITY_SESSION_REVOCATION_IN_PROGRESS',

          message:
            'Session revocation could not acquire recovery ownership',

          statusCode:
            409,

          retryable:
            true,
        });
      }
    }

    const excludedSessionFilter =
      request.excludeSessionId ===
      undefined
        ? {}
        : {
            sessionId: {
              $ne:
                request.excludeSessionId,
            },
          };

    try {
      await this.database
        .collection(
          'sessions',
        )
        .updateMany(
          {
            userId,

            status:
              'ACTIVE',

            ...excludedSessionFilter,
          },
          {
            $set: {
              status:
                'REVOKED',

              revokedAt:
                now,

              revokedBy,

              revokeReason:
                request.reason,

              identityRevocationTransactionId:
                request.transactionId,
            },

            $inc: {
              version:
                1,
            },

            $currentDate: {
              updatedAt:
                true,
            },
          },
        );

      await this.database
        .collection(
          'refreshTokens',
        )
        .updateMany(
          {
            userId,

            status: {
              $in: [
                'ACTIVE',
                'ROTATED',
              ],
            },

            ...excludedSessionFilter,
          },
          {
            $set: {
              status:
                'REVOKED',

              revokedAt:
                now,

              revokedBy,

              revokeReason:
                request.reason,

              identityRevocationTransactionId:
                request.transactionId,
            },

            $inc: {
              version:
                1,
            },

            $currentDate: {
              updatedAt:
                true,
            },
          },
        );

      const revokedSessionCount =
        await this.database
          .collection(
            'sessions',
          )
          .countDocuments({
            userId,

            identityRevocationTransactionId:
              request.transactionId,
          });

      await operations.updateOne(
        {
          transactionId:
            request.transactionId,

          status:
            'IN_PROGRESS',
        },
        {
          $set: {
            status:
              'COMPLETED',

            revokedSessionCount,

            completedAt:
              new Date(),
          },

          $inc: {
            version:
              1,
          },

          $currentDate: {
            updatedAt:
              true,
          },
        },
      );

      return {
        revokedSessionCount,
      };
    } catch (error) {
      await operations
        .updateOne(
          {
            transactionId:
              request.transactionId,

            status:
              'IN_PROGRESS',
          },
          {
            $set: {
              status:
                'FAILED',

              lastError: {
                name:
                  error instanceof
                  Error
                    ? error.name
                    : typeof error,

                message:
                  error instanceof
                  Error
                    ? error.message.slice(
                        0,
                        1000,
                      )
                    : 'Unknown session revocation error',
              },
            },

            $inc: {
              version:
                1,
            },

            $currentDate: {
              updatedAt:
                true,
            },
          },
        )
        .catch(
          () =>
            undefined,
        );

      throw error;
    }
  }
}

export type IdentityRuntimeAdapters =
  Readonly<{
    audit:
      MongoIdentityAuditAdapter;

    outbox:
      MongoIdentityOutboxAdapter;

    passwordHasher:
      ArgonIdentityPasswordHasherAdapter;

    sessions:
      MongoIdentitySessionRevocationAdapter;
  }>;

export function createIdentityRuntimeAdapters(
  input:
    Readonly<{
      database:
        Db;

      auditRepository:
        AuditRepository;

      authConfig:
        AuthConfig;
    }>,
): IdentityRuntimeAdapters {
  return {
    audit:
      new MongoIdentityAuditAdapter(
        input.auditRepository,
      ),

    outbox:
      new MongoIdentityOutboxAdapter(
        input.database,
      ),

    passwordHasher:
      new ArgonIdentityPasswordHasherAdapter(
        input.authConfig,
      ),

    sessions:
      new MongoIdentitySessionRevocationAdapter(
        input.database,
      ),
  };
}