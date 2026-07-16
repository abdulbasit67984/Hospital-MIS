import type {
  Db,
} from '@hospital-mis/database';

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type {
  AuditRepository,
} from '../../audit/audit.repository.js';

import {
  MongoIdentityAuditAdapter,
  MongoIdentityOutboxAdapter,
  MongoIdentitySessionRevocationAdapter,
} from './identity-runtime.adapters.js';

const actorUserId =
  '507f1f77bcf86cd799439011';

const facilityId =
  '507f191e810c19729de860ea';

describe(
  'identity runtime adapters',
  () => {
    it(
      'writes deterministic, sanitized audit events',
      async () => {
        const insertAuditEvent =
          vi.fn()
            .mockResolvedValue(
              undefined,
            );

        const repository = {
          insertAuditEvent,
        } as unknown as AuditRepository;

        const adapter =
          new MongoIdentityAuditAdapter(
            repository,
          );

        await adapter.append({
          transactionId:
            'transaction-1',

          deduplicationKey:
            'transaction-1:audit:user-updated',

          action:
            'identity.user.updated',

          entityType:
            'User',

          entityId:
            actorUserId,

          actorUserId,

          facilityId,

          correlationId:
            'correlation-1',

          occurredAt:
            new Date(
              '2026-07-16T10:00:00.000Z',
            ),

          before: {
            password:
              'must-not-be-stored',
          },

          after: {
            status:
              'ACTIVE',
          },
        });

        expect(
          insertAuditEvent,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            eventId:
              'transaction-1:audit:user-updated',

            action:
              'identity.user.updated',

            module:
              'identity',

            transactionId:
              'transaction-1',

            outcome:
              'SUCCESS',

            beforeSnapshot: {
              password:
                '[REDACTED]',
            },
          }),
        );
      },
    );

    it(
      'stores identity events as blocked outbox messages with deterministic IDs',
      async () => {
        const insertOne =
          vi.fn()
            .mockResolvedValue({
              acknowledged:
                true,
            });

        const database = {
          collection:
            vi.fn(
              () => ({
                insertOne,

                findOne:
                  vi.fn(),
              }),
            ),
        } as unknown as Db;

        const adapter =
          new MongoIdentityOutboxAdapter(
            database,
          );

        await adapter.enqueue({
          transactionId:
            'transaction-2',

          deduplicationKey:
            'transaction-2:outbox:user-updated',

          eventType:
            'identity.user.updated.v1',

          aggregateType:
            'User',

          aggregateId:
            actorUserId,

          actorUserId,

          facilityId,

          correlationId:
            'correlation-2',

          occurredAt:
            new Date(
              '2026-07-16T10:05:00.000Z',
            ),

          payload: {
            userId:
              actorUserId,
          },
        });

        expect(
          insertOne,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            eventId:
              'transaction-2:outbox:user-updated',

            transactionId:
              'transaction-2',

            status:
              'BLOCKED',

            attemptCount:
              0,

            payload:
              expect.objectContaining({
                userId:
                  actorUserId,

                actorUserId,

                correlationId:
                  'correlation-2',
              }),
          }),
        );
      },
    );

    it(
      'replays a completed session-revocation result without changing sessions again',
      async () => {
        const sessionUpdate =
          vi.fn();

        const database = {
          collection:
            vi.fn(
              (
                name:
                  string,
              ) => {
                if (
                  name ===
                  'identitySessionRevocations'
                ) {
                  return {
                    findOne:
                      vi.fn()
                        .mockResolvedValue({
                          transactionId:
                            'transaction-3',

                          status:
                            'COMPLETED',

                          revokedSessionCount:
                            4,

                          version:
                            1,
                        }),
                  };
                }

                return {
                  updateMany:
                    sessionUpdate,
                };
              },
            ),
        } as unknown as Db;

        const adapter =
          new MongoIdentitySessionRevocationAdapter(
            database,
          );

        await expect(
          adapter.revokeAllForUser({
            userId:
              actorUserId,

            revokedBy:
              actorUserId,

            reason:
              'Security review',

            transactionId:
              'transaction-3',
          }),
        ).resolves.toEqual({
          revokedSessionCount:
            4,
        });

        expect(
          sessionUpdate,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'preserves an explicitly excluded session while revoking the others',
      async () => {
        const operationInsert =
          vi.fn()
            .mockResolvedValue({
              acknowledged:
                true,
            });

        const operationUpdate =
          vi.fn()
            .mockResolvedValue({
              modifiedCount:
                1,
            });

        const sessionUpdate =
          vi.fn()
            .mockResolvedValue({
              modifiedCount:
                2,
            });

        const refreshUpdate =
          vi.fn()
            .mockResolvedValue({
              modifiedCount:
                3,
            });

        const countDocuments =
          vi.fn()
            .mockResolvedValue(
              2,
            );

        const database = {
          collection:
            vi.fn(
              (
                name:
                  string,
              ) => {
                if (
                  name ===
                  'identitySessionRevocations'
                ) {
                  return {
                    findOne:
                      vi.fn()
                        .mockResolvedValue(
                          null,
                        ),

                    insertOne:
                      operationInsert,

                    updateOne:
                      operationUpdate,
                  };
                }

                if (
                  name ===
                  'sessions'
                ) {
                  return {
                    updateMany:
                      sessionUpdate,

                    countDocuments,
                  };
                }

                if (
                  name ===
                  'refreshTokens'
                ) {
                  return {
                    updateMany:
                      refreshUpdate,
                  };
                }

                throw new Error(
                  `Unexpected collection ${name}`,
                );
              },
            ),
        } as unknown as Db;

        const adapter =
          new MongoIdentitySessionRevocationAdapter(
            database,
          );

        const excludeSessionId =
          '25da21e9-d661-41dc-b2e8-734f30f3f5a8';

        await expect(
          adapter.revokeAllForUser({
            userId:
              actorUserId,

            revokedBy:
              actorUserId,

            reason:
              'Administrative reset',

            transactionId:
              'transaction-4',

            excludeSessionId,
          }),
        ).resolves.toEqual({
          revokedSessionCount:
            2,
        });

        expect(
          sessionUpdate,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            status:
              'ACTIVE',

            sessionId: {
              $ne:
                excludeSessionId,
            },
          }),

          expect.objectContaining({
            $set:
              expect.objectContaining({
                status:
                  'REVOKED',

                identityRevocationTransactionId:
                  'transaction-4',
              }),
          }),
        );

        expect(
          refreshUpdate,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionId: {
              $ne:
                excludeSessionId,
            },
          }),

          expect.any(
            Object,
          ),
        );
      },
    );
  },
);