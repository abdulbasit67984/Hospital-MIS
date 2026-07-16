import type {
  Db,
} from '@hospital-mis/database';

import {
  createObjectId,
} from '@hospital-mis/database';

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type {
  IdempotencyService,
} from '../../../infrastructure/idempotency.service.js';

import type {
  OutboxService,
} from '../../../infrastructure/outbox.service.js';

import type {
  IdentityCompensationExecutorPort,
} from './identity-compensation.executor.js';

import {
  IdentityRecoveryService,
} from './identity-recovery.service.js';

import {
  IDENTITY_RECOVERY_MODES,
} from './identity-transaction-manager.adapter.js';

function createDatabase(
  transaction:
    Record<string, unknown>,
) {
  const transactionUpdate =
    vi.fn()
      .mockResolvedValue({
        matchedCount:
          1,

        modifiedCount:
          1,
      });

  const stepUpdate =
    vi.fn()
      .mockResolvedValue({
        modifiedCount:
          1,
      });

  const staleUpdate =
    vi.fn()
      .mockResolvedValue({
        modifiedCount:
          0,
      });

  const lease =
    vi.fn()
      .mockResolvedValueOnce(
        transaction,
      )
      .mockResolvedValueOnce(
        null,
      );

  const database = {
    collection(
      name:
        string,
    ) {
      if (
        name ===
        'applicationTransactions'
      ) {
        return {
          findOneAndUpdate:
            lease,

          updateOne:
            transactionUpdate,

          updateMany:
            staleUpdate,
        };
      }

      if (
        name ===
        'applicationTransactionSteps'
      ) {
        return {
          updateMany:
            stepUpdate,
        };
      }

      if (
        name ===
        'idempotencyKeys'
      ) {
        return {
          findOne:
            vi.fn()
              .mockResolvedValue({
                status:
                  'IN_PROGRESS',

                ownerId:
                  transaction[
                    'identityIdempotencyOwnerId'
                  ],
              }),
        };
      }

      throw new Error(
        `Unexpected collection ${name}`,
      );
    },
  } as unknown as Db;

  return {
    database,
    transactionUpdate,
    stepUpdate,
    staleUpdate,
    lease,
  };
}

function transactionFixture(
  overrides:
    Record<string, unknown> = {},
) {
  return {
    _id:
      createObjectId(),

    facilityId:
      createObjectId(),

    transactionId:
      'identity-transaction-1',

    transactionType:
      'IDENTITY_UPDATE_USER',

    idempotencyKey:
      'identity-update-user-0001',

    status:
      'RECOVERY_REQUIRED',

    identityIdempotencyOwnerId:
      'owner-1',

    version:
      1,

    ...overrides,
  };
}

describe(
  'IdentityRecoveryService',
  () => {
    it(
      'finalizes a completed domain operation without running compensation',
      async () => {
        const transaction =
          transactionFixture({
            identityRecoveryMode:
              IDENTITY_RECOVERY_MODES
                .FINALIZE_COMPLETED,

            identityDomainCompletedAt:
              new Date(),

            identityResultSnapshot: {
              userId:
                '507f1f77bcf86cd799439011',
            },

            identityCompensations: [
              {
                key:
                  'restore-user',

                type:
                  'IDENTITY_RESTORE_USER',

                payload:
                  {},

                status:
                  'PENDING',

                registeredAt:
                  new Date(),
              },
            ],
          });

        const fixture =
          createDatabase(
            transaction,
          );

        const complete =
          vi.fn()
            .mockResolvedValue(
              undefined,
            );

        const fail =
          vi.fn();

        const releaseTransactionEvents =
          vi.fn()
            .mockResolvedValue(
              1,
            );

        const execute =
          vi.fn();

        const service =
          new IdentityRecoveryService({
            database:
              fixture.database,

            idempotency: {
              complete,
              fail,
            } as unknown as IdempotencyService,

            outbox: {
              releaseTransactionEvents,
            } as unknown as OutboxService,

            compensationExecutor: {
              execute,
            } as IdentityCompensationExecutorPort,
          });

        await expect(
          service.recoverAvailable({
            workerId:
              'identity-recovery-test',
          }),
        ).resolves.toEqual({
          recovered:
            1,

          failed:
            0,
        });

        expect(
          complete,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            scope:
              'IDENTITY_UPDATE_USER',

            key:
              'identity-update-user-0001',

            ownerId:
              'owner-1',

            response: {
              userId:
                '507f1f77bcf86cd799439011',
            },
          }),
        );

        expect(
          releaseTransactionEvents,
        ).toHaveBeenCalledWith(
          'identity-transaction-1',
        );

        expect(
          execute,
        ).not.toHaveBeenCalled();

        expect(
          fail,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'executes incomplete compensations in reverse registration order',
      async () => {
        const transaction =
          transactionFixture({
            identityRecoveryMode:
              IDENTITY_RECOVERY_MODES
                .COMPENSATE,

            identityCompensations: [
              {
                key:
                  'first',

                type:
                  'FIRST',

                payload:
                  {},

                status:
                  'PENDING',

                registeredAt:
                  new Date(
                    '2026-07-16T10:00:00.000Z',
                  ),
              },
              {
                key:
                  'second',

                type:
                  'SECOND',

                payload:
                  {},

                status:
                  'FAILED',

                registeredAt:
                  new Date(
                    '2026-07-16T10:01:00.000Z',
                  ),
              },
            ],
          });

        const fixture =
          createDatabase(
            transaction,
          );

        const execute =
          vi.fn()
            .mockResolvedValue(
              undefined,
            );

        const fail =
          vi.fn()
            .mockResolvedValue(
              undefined,
            );

        const service =
          new IdentityRecoveryService({
            database:
              fixture.database,

            idempotency: {
              complete:
                vi.fn(),

              fail,
            } as unknown as IdempotencyService,

            outbox: {
              releaseTransactionEvents:
                vi.fn(),
            } as unknown as OutboxService,

            compensationExecutor: {
              execute,
            } as IdentityCompensationExecutorPort,
          });

        await expect(
          service.recoverAvailable({
            workerId:
              'identity-recovery-test',
          }),
        ).resolves.toEqual({
          recovered:
            1,

          failed:
            0,
        });

        expect(
          execute.mock.calls.map(
            (
              call,
            ) =>
              (
                call[0] as {
                  key:
                    string;
                }
              ).key,
          ),
        ).toEqual([
          'second',
          'first',
        ]);

        expect(
          fail,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            scope:
              'IDENTITY_UPDATE_USER',

            ownerId:
              'owner-1',
          }),
        );

        expect(
          fixture.stepUpdate,
        ).toHaveBeenCalled();
      },
    );

    it(
      'marks stale completed and incomplete transactions with different recovery modes',
      async () => {
        const transaction =
          transactionFixture();

        const fixture =
          createDatabase(
            transaction,
          );

        fixture.staleUpdate
          .mockResolvedValueOnce({
            modifiedCount:
              2,
          })
          .mockResolvedValueOnce({
            modifiedCount:
              3,
          });

        const service =
          new IdentityRecoveryService({
            database:
              fixture.database,

            idempotency: {
              complete:
                vi.fn(),

              fail:
                vi.fn(),
            } as unknown as IdempotencyService,

            outbox: {
              releaseTransactionEvents:
                vi.fn(),
            } as unknown as OutboxService,

            compensationExecutor: {
              execute:
                vi.fn(),
            } as IdentityCompensationExecutorPort,
          });

        await expect(
          service.markStaleTransactions(
            new Date(
              '2026-07-16T09:00:00.000Z',
            ),
          ),
        ).resolves.toBe(
          5,
        );

        expect(
          fixture.staleUpdate,
        ).toHaveBeenNthCalledWith(
          1,

          expect.objectContaining({
            identityDomainCompletedAt: {
              $type:
                'date',
            },
          }),

          expect.objectContaining({
            $set:
              expect.objectContaining({
                identityRecoveryMode:
                  IDENTITY_RECOVERY_MODES
                    .FINALIZE_COMPLETED,
              }),
          }),
        );

        expect(
          fixture.staleUpdate,
        ).toHaveBeenNthCalledWith(
          2,

          expect.objectContaining({
            identityDomainCompletedAt: {
              $exists:
                false,
            },
          }),

          expect.objectContaining({
            $set:
              expect.objectContaining({
                identityRecoveryMode:
                  IDENTITY_RECOVERY_MODES
                    .COMPENSATE,
              }),
          }),
        );
      },
    );
  },
);