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
  ApplicationTransactionRepository,
} from '../../../infrastructure/application-transaction.js';

import type {
  IdempotencyService,
} from '../../../infrastructure/idempotency.service.js';

import type {
  OperationLockService,
} from '../../../infrastructure/operation-lock.service.js';

import type {
  OutboxService,
} from '../../../infrastructure/outbox.service.js';

import type {
  IdentityCompensationExecutorPort,
} from './identity-compensation.executor.js';

import {
  MongoIdentityTransactionManagerAdapter,
} from './identity-transaction-manager.adapter.js';

function createFixture(
  replayResponse?:
    unknown,
) {
  const databaseUpdateOne =
    vi.fn()
      .mockResolvedValue({
        matchedCount:
          1,

        modifiedCount:
          1,
      });

  const databaseFindOne =
    vi.fn()
      .mockResolvedValue({
        transactionId:
          'transaction-1',
      });

  const database = {
    collection:
      vi.fn(
        () => ({
          updateOne:
            databaseUpdateOne,

          findOne:
            databaseFindOne,
        }),
      ),
  } as unknown as Db;

  const create =
    vi.fn()
      .mockResolvedValue(
        undefined,
      );

  const setStatus =
    vi.fn()
      .mockResolvedValue(
        undefined,
      );

  const setStepStatus =
    vi.fn()
      .mockResolvedValue(
        undefined,
      );

  const transactions = {
    create,
    setStatus,
    setStepStatus,

    markStaleForRecovery:
      vi.fn(),
  } as unknown as ApplicationTransactionRepository;

  const begin =
    vi.fn()
      .mockResolvedValue(
        replayResponse ===
          undefined
          ? {
              kind:
                'ACQUIRED',

              ownerId:
                'owner-1',
            }
          : {
              kind:
                'REPLAY',

              response:
                replayResponse,
            },
      );

  const complete =
    vi.fn()
      .mockResolvedValue(
        undefined,
      );

  const fail =
    vi.fn()
      .mockResolvedValue(
        undefined,
      );

  const idempotency = {
    begin,
    complete,
    fail,
  } as unknown as IdempotencyService;

  const acquireMany =
    vi.fn()
      .mockResolvedValue(
        [],
      );

  const releaseMany =
    vi.fn()
      .mockResolvedValue(
        undefined,
      );

  const locks = {
    acquireMany,
    releaseMany,
  } as unknown as OperationLockService;

  const releaseTransactionEvents =
    vi.fn()
      .mockResolvedValue(
        1,
      );

  const outbox = {
    releaseTransactionEvents,
  } as unknown as OutboxService;

  const executeCompensation =
    vi.fn()
      .mockResolvedValue(
        undefined,
      );

  const compensationExecutor = {
    execute:
      executeCompensation,
  } as IdentityCompensationExecutorPort;

  const manager =
    new MongoIdentityTransactionManagerAdapter({
      database,
      transactions,
      idempotency,
      locks,
      outbox,
      compensationExecutor,
    });

  return {
    manager,
    create,
    setStatus,
    setStepStatus,
    begin,
    complete,
    fail,
    acquireMany,
    releaseMany,
    releaseTransactionEvents,
    executeCompensation,
    databaseUpdateOne,
  };
}

const baseRequest = {
  transactionType:
    'IDENTITY_TEST',

  idempotencyKey:
    'identity-test-0001',

  actorUserId:
    '507f1f77bcf86cd799439011',

  facilityId:
    '507f191e810c19729de860ea',

  lockKeys: [
    'identity:user:test',
  ],

  payload: {
    operation:
      'test',
  },
};

describe(
  'MongoIdentityTransactionManagerAdapter',
  () => {
    it(
      'journals, checkpoints, completes idempotency, and releases outbox events',
      async () => {
        const fixture =
          createFixture();

        const result =
          await fixture.manager
            .execute({
              ...baseRequest,

              async execute(
                context,
              ) {
                await context
                  .registerCompensation({
                    key:
                      'restore-test',

                    type:
                      'RESTORE_TEST',

                    payload: {
                      id:
                        'test',
                    },
                  });

                await context
                  .checkpoint(
                    'VALIDATED',
                    {
                      valid:
                        true,
                    },
                  );

                return {
                  id:
                    'result-1',
                };
              },
            });

        expect(
          result,
        ).toEqual({
          id:
            'result-1',
        });

        expect(
          fixture.create,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          fixture.setStatus,
        ).toHaveBeenCalledWith(
          expect.any(
            String,
          ),
          'COMPLETED',
        );

        expect(
          fixture.complete,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            facilityId:
              baseRequest.facilityId,

            scope:
              baseRequest.transactionType,

            key:
              baseRequest.idempotencyKey,

            response: {
              id:
                'result-1',
            },
          }),
        );

        expect(
          fixture.releaseTransactionEvents,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          fixture.executeCompensation,
        ).not.toHaveBeenCalled();

        expect(
          fixture.releaseMany,
        ).toHaveBeenCalledWith(
          [],
        );
      },
    );

    it(
      'runs registered compensations in reverse order when the domain operation fails',
      async () => {
        const fixture =
          createFixture();

        const error =
          new Error(
            'domain failed',
          );

        await expect(
          fixture.manager
            .execute({
              ...baseRequest,

              async execute(
                context,
              ) {
                await context
                  .registerCompensation({
                    key:
                      'first',

                    type:
                      'FIRST',

                    payload:
                      {},
                  });

                await context
                  .registerCompensation({
                    key:
                      'second',

                    type:
                      'SECOND',

                    payload:
                      {},
                  });

                throw error;
              },
            }),
        ).rejects.toBe(
          error,
        );

        expect(
          fixture
            .executeCompensation
            .mock.calls
            .map(
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
          fixture.fail,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          fixture.setStatus,
        ).toHaveBeenCalledWith(
          expect.any(
            String,
          ),
          'COMPENSATED',
          expect.any(
            Object,
          ),
        );
      },
    );

    it(
      'returns a stored response without opening another transaction',
      async () => {
        const fixture =
          createFixture({
            id:
              'replayed',
          });

        const execute =
          vi.fn();

        const result =
          await fixture.manager
            .execute({
              ...baseRequest,
              execute,
            });

        expect(
          result,
        ).toEqual({
          id:
            'replayed',
        });

        expect(
          execute,
        ).not.toHaveBeenCalled();

        expect(
          fixture.create,
        ).not.toHaveBeenCalled();
      },
    );
  },
);