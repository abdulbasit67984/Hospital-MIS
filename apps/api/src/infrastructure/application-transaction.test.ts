import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type {
  ApplicationTransactionRepository,
  TransactionStep,
} from './application-transaction.js';

import {
  ApplicationTransactionManager,
} from './application-transaction.js';

import type {
  IdempotencyService,
} from './idempotency.service.js';

import type {
  OperationLockService,
} from './operation-lock.service.js';

import type {
  OutboxService,
} from './outbox.service.js';

function dependencies() {
  const transactions:
    ApplicationTransactionRepository = {
    create:
      vi.fn(),

    setStatus:
      vi.fn(),

    setStepStatus:
      vi.fn(),

    markStaleForRecovery:
      vi.fn(),
  };

  const idempotency = {
    begin:
      vi.fn()
        .mockResolvedValue({
          kind:
            'ACQUIRED',

          ownerId:
            'owner-1',
        }),

    complete:
      vi.fn(),

    fail:
      vi.fn(),
  } as unknown as
    IdempotencyService;

  const locks = {
    acquireMany:
      vi.fn()
        .mockResolvedValue(
          [],
        ),

    releaseMany:
      vi.fn(),
  } as unknown as
    OperationLockService;

  const outbox = {
    releaseTransactionEvents:
      vi.fn()
        .mockResolvedValue(
          0,
        ),
  } as unknown as
    OutboxService;

  return {
    transactions,
    idempotency,
    locks,
    outbox,
  };
}

describe(
  'ApplicationTransactionManager',
  () => {
    it(
      'executes and verifies steps in order',
      async () => {
        const dependenciesValue =
          dependencies();

        const executionOrder:
          string[] = [];

        const context = {
          value:
            0,
        };

        const steps:
          readonly TransactionStep<
            typeof context
          >[] = [
          {
            name:
              'increment',

            async execute(
              transactionContext,
            ) {
              executionOrder.push(
                'execute-1',
              );

              transactionContext.value +=
                1;
            },

            async verify(
              transactionContext,
            ) {
              executionOrder.push(
                'verify-1',
              );

              return (
                transactionContext.value ===
                1
              );
            },

            async compensate(
              transactionContext,
            ) {
              transactionContext.value -=
                1;
            },
          },

          {
            name:
              'double',

            async execute(
              transactionContext,
            ) {
              executionOrder.push(
                'execute-2',
              );

              transactionContext.value *=
                2;
            },

            async verify(
              transactionContext,
            ) {
              executionOrder.push(
                'verify-2',
              );

              return (
                transactionContext.value ===
                2
              );
            },

            async compensate(
              transactionContext,
            ) {
              transactionContext.value /=
                2;
            },
          },
        ];

        const manager =
          new ApplicationTransactionManager(
            dependenciesValue
              .transactions,

            dependenciesValue
              .idempotency,

            dependenciesValue
              .locks,

            dependenciesValue
              .outbox,
          );

        const result =
          await manager.execute({
            facilityId:
              '507f191e810c19729de860ea',

            transactionType:
              'TEST_OPERATION',

            idempotencyKey:
              'test-idempotency-key-0001',

            correlationId:
              '5de81ce9-845f-42e4-907f-c66503bdfd4a',

            initiatedBy:
              '507f1f77bcf86cd799439011',

            requestPayload: {
              value:
                0,
            },

            context,
            steps,

            buildResult(
              transactionContext,
            ) {
              return {
                value:
                  transactionContext.value,
              };
            },

            serializeResult(
              resultValue,
            ) {
              return resultValue;
            },
          });

        expect(
          result,
        ).toEqual({
          value:
            2,
        });

        expect(
          executionOrder,
        ).toEqual([
          'execute-1',
          'verify-1',
          'execute-2',
          'verify-2',
        ]);

        expect(
          dependenciesValue
            .idempotency
            .complete,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          dependenciesValue
            .locks
            .releaseMany,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      'compensates completed steps in reverse order',
      async () => {
        const dependenciesValue =
          dependencies();

        const compensationOrder:
          string[] = [];

        const context = {
          value:
            0,
        };

        const steps:
          readonly TransactionStep<
            typeof context
          >[] = [
          {
            name:
              'first',

            async execute(
              transactionContext,
            ) {
              transactionContext.value +=
                1;
            },

            async verify() {
              return true;
            },

            async compensate(
              transactionContext,
            ) {
              compensationOrder.push(
                'first',
              );

              transactionContext.value -=
                1;
            },
          },

          {
            name:
              'second',

            async execute(
              transactionContext,
            ) {
              transactionContext.value +=
                2;
            },

            async verify() {
              return true;
            },

            async compensate(
              transactionContext,
            ) {
              compensationOrder.push(
                'second',
              );

              transactionContext.value -=
                2;
            },
          },

          {
            name:
              'failing',

            async execute() {
              throw new Error(
                'Expected failure',
              );
            },

            async verify() {
              return false;
            },
          },
        ];

        const manager =
          new ApplicationTransactionManager(
            dependenciesValue
              .transactions,

            dependenciesValue
              .idempotency,

            dependenciesValue
              .locks,

            dependenciesValue
              .outbox,
          );

        await expect(
          manager.execute({
            facilityId:
              '507f191e810c19729de860ea',

            transactionType:
              'TEST_FAILURE',

            idempotencyKey:
              'test-idempotency-key-0002',

            correlationId:
              '5de81ce9-845f-42e4-907f-c66503bdfd4a',

            initiatedBy:
              '507f1f77bcf86cd799439011',

            requestPayload:
              {},

            context,
            steps,

            buildResult() {
              return {};
            },

            serializeResult(
              result,
            ) {
              return result;
            },
          }),
        ).rejects.toThrow(
          'Expected failure',
        );

        expect(
          compensationOrder,
        ).toEqual([
          'second',
          'first',
        ]);

        expect(
          context.value,
        ).toBe(0);

        expect(
          dependenciesValue
            .idempotency
            .fail,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      'returns the stored result for an idempotent replay',
      async () => {
        const dependenciesValue =
          dependencies();

        vi.mocked(
          dependenciesValue
            .idempotency
            .begin,
        ).mockResolvedValue({
          kind:
            'REPLAY',

          response: {
            value:
              25,
          },
        } as never);

        const manager =
          new ApplicationTransactionManager(
            dependenciesValue
              .transactions,

            dependenciesValue
              .idempotency,

            dependenciesValue
              .locks,

            dependenciesValue
              .outbox,
          );

        const result =
          await manager.execute({
            facilityId:
              '507f191e810c19729de860ea',

            transactionType:
              'TEST_REPLAY',

            idempotencyKey:
              'test-idempotency-key-0003',

            correlationId:
              '5de81ce9-845f-42e4-907f-c66503bdfd4a',

            initiatedBy:
              '507f1f77bcf86cd799439011',

            requestPayload:
              {},

            context:
              {},

            steps:
              [],

            buildResult() {
              return {
                value:
                  0,
              };
            },

            serializeResult(
              resultValue,
            ) {
              return resultValue;
            },
          });

        expect(
          result,
        ).toEqual({
          value:
            25,
        });

        expect(
          dependenciesValue
            .transactions
            .create,
        ).not.toHaveBeenCalled();
      },
    );
  },
);