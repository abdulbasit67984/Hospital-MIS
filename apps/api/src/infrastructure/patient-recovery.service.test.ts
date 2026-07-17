import type {
  Db,
} from '@hospital-mis/database';

import {
  createObjectId,
  toObjectId,
} from '@hospital-mis/database';

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type {
  IdempotencyService,
} from './idempotency.service.js';

import type {
  OutboxService,
} from './outbox.service.js';

import type {
  PatientCompensationExecutorPort,
} from './patient-compensation.executor.js';

import {
  PatientRecoveryService,
} from './patient-recovery.service.js';

function createDatabase(
  transaction:
    Record<string, unknown> | null,
) {
  const applicationUpdateMany =
    vi.fn()
      .mockResolvedValue({
        modifiedCount:
          1,
      });

  const applicationUpdateOne =
    vi.fn()
      .mockResolvedValue({
        matchedCount:
          1,
        modifiedCount:
          1,
      });

  const leaseNext =
    vi.fn()
      .mockResolvedValueOnce(transaction)
      .mockResolvedValueOnce(null);

  const stepUpdateMany =
    vi.fn()
      .mockResolvedValue({
        modifiedCount:
          1,
      });

  const outboxUpdateMany =
    vi.fn()
      .mockResolvedValue({
        modifiedCount:
          1,
      });

  const database = {
    collection:
      vi.fn(
        (name: string) => {
          if (
            name === 'applicationTransactions'
          ) {
            return {
              updateMany:
                applicationUpdateMany,
              updateOne:
                applicationUpdateOne,
              findOneAndUpdate:
                leaseNext,
            };
          }

          if (
            name === 'applicationTransactionSteps'
          ) {
            return {
              updateMany:
                stepUpdateMany,
            };
          }

          if (name === 'outboxEvents') {
            return {
              updateMany:
                outboxUpdateMany,
            };
          }

          if (name === 'idempotencyKeys') {
            return {
              findOne:
                vi.fn()
                  .mockResolvedValue(null),
            };
          }

          throw new Error(
            `Unexpected collection ${name}`,
          );
        },
      ),
  } as unknown as Db;

  return {
    database,
    applicationUpdateMany,
    applicationUpdateOne,
    leaseNext,
    stepUpdateMany,
    outboxUpdateMany,
  };
}

describe(
  'PatientRecoveryService',
  () => {
    it(
      'marks completed and incomplete stale patient transactions with the correct recovery modes',
      async () => {
        const fixture =
          createDatabase(null);

        const service =
          new PatientRecoveryService({
            database:
              fixture.database,
            idempotency:
              {} as IdempotencyService,
            outbox:
              {} as OutboxService,
            compensationExecutor:
              {} as PatientCompensationExecutorPort,
          });

        const count =
          await service.markStaleTransactions(
            new Date(
              '2026-07-17T09:00:00.000Z',
            ),
          );

        expect(count).toBe(2);
        expect(
          fixture.applicationUpdateMany,
        ).toHaveBeenCalledTimes(2);

        expect(
          fixture.applicationUpdateMany,
        ).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            patientDomainCompletedAt: {
              $type:
                'date',
            },
          }),
          expect.objectContaining({
            $set:
              expect.objectContaining({
                patientRecoveryMode:
                  'FINALIZE_COMPLETED',
              }),
          }),
        );

        expect(
          fixture.applicationUpdateMany,
        ).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            patientDomainCompletedAt: {
              $exists:
                false,
            },
          }),
          expect.objectContaining({
            $set:
              expect.objectContaining({
                patientRecoveryMode:
                  'COMPENSATE',
              }),
          }),
        );
      },
    );

    it(
      'recovers an interrupted registration by compensating in reverse registration order',
      async () => {
        const transaction = {
          _id:
            createObjectId(),
          facilityId:
            toObjectId(
              '507f191e810c19729de860ea',
            ),
          transactionId:
            'transaction-1',
          transactionType:
            'PATIENT_GUARDIAN_REGISTER_PATIENT',
          idempotencyKey:
            'register-patient-1',
          status:
            'RECOVERY_REQUIRED',
          recoveryStatus:
            'PENDING',
          retryCount:
            1,
          updatedAt:
            new Date(),
          patientRecoveryMode:
            'COMPENSATE',
          patientIdempotencyOwnerId:
            'owner-1',
          patientCompensations: [
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
                  '2026-07-17T10:00:00.000Z',
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
                'PENDING',
              registeredAt:
                new Date(
                  '2026-07-17T10:00:01.000Z',
                ),
            },
          ],
          version:
            1,
        };

        const fixture =
          createDatabase(transaction);

        const fail =
          vi.fn()
            .mockResolvedValue(undefined);

        const execute =
          vi.fn()
            .mockResolvedValue(undefined);

        const service =
          new PatientRecoveryService({
            database:
              fixture.database,
            idempotency: {
              fail,
            } as unknown as IdempotencyService,
            outbox:
              {} as OutboxService,
            compensationExecutor: {
              execute,
            },
          });

        const result =
          await service.recoverAvailable({
            workerId:
              'worker-1',
            maxTransactions:
              1,
          });

        expect(result).toEqual({
          recovered:
            1,
          failed:
            0,
        });

        expect(
          execute.mock.calls.map(
            (call: [Parameters<PatientCompensationExecutorPort['execute']>[0]]) =>
              call[0].key,
          ),
        ).toEqual([
          'second',
          'first',
        ]);

        expect(fail).toHaveBeenCalledWith(
          expect.objectContaining({
            scope:
              'PATIENT_GUARDIAN_REGISTER_PATIENT',
            key:
              'register-patient-1',
            ownerId:
              'owner-1',
          }),
        );

        expect(
          fixture.outboxUpdateMany,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            transactionId:
              'transaction-1',
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
  },
);