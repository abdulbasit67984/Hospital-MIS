import {
  ObjectId,
  type Db,
} from '@hospital-mis/database';

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type {
  FacilityCompensationExecutorPort,
} from '../../../infrastructure/facility-compensation.executor.js';

import {
  FacilityRecoveryService,
} from '../../../infrastructure/facility-recovery.service.js';

import type {
  IdempotencyService,
} from '../../../infrastructure/idempotency.service.js';

import type {
  OutboxService,
} from '../../../infrastructure/outbox.service.js';

describe(
  'FacilityRecoveryService',
  () => {
    it(
      'marks stale completed and incomplete facility transactions for recovery',
      async () => {
        const updateMany =
          vi.fn()
            .mockResolvedValueOnce({
              modifiedCount:
                2,
            })
            .mockResolvedValueOnce({
              modifiedCount:
                3,
            });

        const database = {
          collection:
            vi.fn(
              () => ({
                updateMany,
              }),
            ),
        } as unknown as Db;

        const service =
          new FacilityRecoveryService({
            database,

            idempotency:
              {} as IdempotencyService,

            outbox:
              {} as OutboxService,

            compensationExecutor:
              {} as FacilityCompensationExecutorPort,
          });

        const result =
          await service.markStaleTransactions(
            new Date(
              '2026-07-17T10:00:00.000Z',
            ),
          );

        expect(result).toBe(5);

        expect(
          updateMany,
        ).toHaveBeenCalledTimes(
          2,
        );

        expect(
          updateMany,
        ).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            transactionType: {
              $regex:
                '^FACILITY_CONFIGURATION_',
            },

            facilityDomainCompletedAt: {
              $type:
                'date',
            },
          }),
          expect.any(Object),
        );
      },
    );

    it(
      'recovers an incomplete transaction by compensating in reverse order',
      async () => {
        const facilityId =
          new ObjectId(
            '507f1f77bcf86cd799439011',
          );

        let leaseReturned =
          false;

        const transaction = {
          _id:
            new ObjectId(),

          facilityId,

          transactionId:
            'facility-transaction-1',

          transactionType:
            'FACILITY_CONFIGURATION_UPDATE_FACILITY',

          idempotencyKey:
            'facility-operation-0001',

          status:
            'RECOVERY_REQUIRED',

          recoveryStatus:
            'PENDING',

          retryCount:
            1,

          updatedAt:
            new Date(),

          facilityRecoveryMode:
            'COMPENSATE',

          facilityIdempotencyOwnerId:
            'owner-1',

          facilityCompensations: [
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
                  '2026-07-17T09:00:00.000Z',
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
                  '2026-07-17T09:01:00.000Z',
                ),
            },
          ],

          version:
            1,
        };

        const applicationTransactionUpdate =
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

        const outboxUpdate =
          vi.fn()
            .mockResolvedValue({
              modifiedCount:
                1,
            });

        const database = {
          collection:
            vi.fn(
              (
                name:
                  string,
              ) => {
                if (
                  name ===
                  'applicationTransactions'
                ) {
                  return {
                    findOneAndUpdate:
                      vi.fn(
                        async () => {
                          if (
                            leaseReturned
                          ) {
                            return null;
                          }

                          leaseReturned =
                            true;

                          return transaction;
                        },
                      ),

                    updateOne:
                      applicationTransactionUpdate,
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
                  'outboxEvents'
                ) {
                  return {
                    updateMany:
                      outboxUpdate,
                  };
                }

                if (
                  name ===
                  'idempotencyKeys'
                ) {
                  return {
                    findOne:
                      vi.fn()
                        .mockResolvedValue(
                          null,
                        ),
                  };
                }

                throw new Error(
                  `Unexpected collection ${name}`,
                );
              },
            ),
        } as unknown as Db;

        const fail =
          vi.fn()
            .mockResolvedValue(
              undefined,
            );

        const execute =
          vi.fn()
            .mockResolvedValue(
              undefined,
            );

        const service =
          new FacilityRecoveryService({
            database,

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
              'facility-recovery-test',

            maxTransactions:
              10,

            now:
              new Date(
                '2026-07-17T10:00:00.000Z',
              ),
          });

        expect(result).toEqual({
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
                  key: string;
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
            facilityId:
              facilityId.toHexString(),

            ownerId:
              'owner-1',
          }),
        );

        expect(
          outboxUpdate,
        ).toHaveBeenCalledWith(
          {
            transactionId:
              'facility-transaction-1',

            status:
              'BLOCKED',
          },
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