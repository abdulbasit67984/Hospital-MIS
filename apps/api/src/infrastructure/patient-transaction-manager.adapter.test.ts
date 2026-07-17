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

import type {
  PatientCompensationExecutorPort,
} from './patient-compensation.executor.js';

import {
  MongoPatientTransactionManagerAdapter,
} from './patient-transaction-manager.adapter.js';

function createFixture(
  replayResponse?: unknown,
) {
  const updateOne =
    vi.fn()
      .mockResolvedValue({
        matchedCount:
          1,
        modifiedCount:
          1,
      });

  const updateMany =
    vi.fn()
      .mockResolvedValue({
        matchedCount:
          1,
        modifiedCount:
          1,
      });

  const findOne =
    vi.fn()
      .mockResolvedValue({
        transactionId:
          'transaction-1',
      });

  const database = {
    collection:
      vi.fn(
        () => ({
          updateOne,
          updateMany,
          findOne,
        }),
      ),
  } as unknown as Db;

  const transactions = {
    create:
      vi.fn()
        .mockResolvedValue(undefined),
    setStatus:
      vi.fn()
        .mockResolvedValue(undefined),
    setStepStatus:
      vi.fn()
        .mockResolvedValue(undefined),
    markStaleForRecovery:
      vi.fn(),
  } as unknown as ApplicationTransactionRepository;

  const idempotency = {
    begin:
      vi.fn()
        .mockResolvedValue(
          replayResponse === undefined
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
        ),
    complete:
      vi.fn()
        .mockResolvedValue(undefined),
    fail:
      vi.fn()
        .mockResolvedValue(undefined),
  } as unknown as IdempotencyService;

  const locks = {
    acquireMany:
      vi.fn()
        .mockResolvedValue([]),
    releaseMany:
      vi.fn()
        .mockResolvedValue(undefined),
  } as unknown as OperationLockService;

  const outbox = {
    releaseTransactionEvents:
      vi.fn()
        .mockResolvedValue(1),
  } as unknown as OutboxService;

  const compensationExecutor = {
    execute:
      vi.fn()
        .mockResolvedValue(undefined),
  } as PatientCompensationExecutorPort;

  const manager =
    new MongoPatientTransactionManagerAdapter({
      database,
      transactions,
      idempotency,
      locks,
      outbox,
      compensationExecutor,
    });

  return {
    manager,
    database,
    updateOne,
    updateMany,
    transactions,
    idempotency,
    locks,
    outbox,
    compensationExecutor,
  };
}

const baseRequest = {
  transactionType:
    'PATIENT_GUARDIAN_TEST',
  idempotencyKey:
    'patient-test-0001',
  actorUserId:
    '507f1f77bcf86cd799439011',
  facilityId:
    '507f191e810c19729de860ea',
  correlationId:
    'correlation-0001',
  lockKeys: [
    'patient:test',
  ],
  idempotencyPayload: {
    sensitiveInput:
      'full-request-used-only-for-hash',
  },
  journalPayload: {
    operation:
      'test',
  },
};

describe(
  'MongoPatientTransactionManagerAdapter',
  () => {
    it(
      'uses the full in-memory payload for idempotency while journaling only the safe payload',
      async () => {
        const fixture =
          createFixture();

        const result =
          await fixture.manager.execute({
            ...baseRequest,
            execute:
              async (context) => {
                await context.checkpoint(
                  'VALIDATED',
                  {
                    valid:
                      true,
                  },
                );

                return {
                  patientId:
                    'patient-1',
                  mrn:
                    'MAIN-2026-000001',
                };
              },
          });

        expect(result).toEqual({
          patientId:
            'patient-1',
          mrn:
            'MAIN-2026-000001',
        });

        expect(
          fixture.idempotency.begin,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            requestPayload:
              baseRequest.idempotencyPayload,
          }),
        );

        expect(
          fixture.transactions.create,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            contextSnapshot:
              baseRequest.journalPayload,
          }),
        );

        expect(
          fixture.transactions.create,
        ).not.toHaveBeenCalledWith(
          expect.objectContaining({
            contextSnapshot:
              baseRequest.idempotencyPayload,
          }),
        );

        expect(
          fixture.idempotency.complete,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            response: {
              patientId:
                'patient-1',
              mrn:
                'MAIN-2026-000001',
            },
          }),
        );

        expect(
          fixture.outbox.releaseTransactionEvents,
        ).toHaveBeenCalledTimes(1);
      },
    );

    it(
      'executes compensations in reverse order and suppresses blocked outbox events',
      async () => {
        const fixture =
          createFixture();

        const error =
          new Error(
            'domain failure',
          );

        await expect(
          fixture.manager.execute({
            ...baseRequest,
            execute:
              async (context) => {
                await context.registerCompensation({
                  key:
                    'first',
                  type:
                    'FIRST',
                  payload:
                    {},
                });

                await context.registerCompensation({
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
        ).rejects.toBe(error);

        expect(
          vi.mocked(
            fixture.compensationExecutor.execute,
          ).mock.calls.map(
            (call: [Parameters<PatientCompensationExecutorPort['execute']>[0]]) =>
              call[0].key,
          ),
        ).toEqual([
          'second',
          'first',
        ]);

        expect(
          fixture.idempotency.fail,
        ).toHaveBeenCalledTimes(1);

        expect(
          fixture.updateMany,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            status:
              'BLOCKED',
          }),
          expect.objectContaining({
            $set:
              expect.objectContaining({
                status:
                  'DEAD_LETTER',
              }),
          }),
        );
      },
    );

    it(
      'returns an idempotent replay without creating another transaction journal',
      async () => {
        const fixture =
          createFixture({
            patientId:
              'replayed-patient',
          });

        const execute =
          vi.fn();

        const result =
          await fixture.manager.execute({
            ...baseRequest,
            execute,
          });

        expect(result).toEqual({
          patientId:
            'replayed-patient',
        });

        expect(execute).not.toHaveBeenCalled();
        expect(
          fixture.transactions.create,
        ).not.toHaveBeenCalled();
        expect(
          fixture.locks.acquireMany,
        ).not.toHaveBeenCalled();
      },
    );
  },
);