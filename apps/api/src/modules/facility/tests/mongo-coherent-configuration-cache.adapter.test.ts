import type {
  Db,
} from '@hospital-mis/database';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  MongoCoherentConfigurationCacheAdapter,
} from '../../../infrastructure/mongo-coherent-configuration-cache.adapter.js';

function createDatabaseFixture() {
  let epoch =
    0;

  const collection = {
    async findOne() {
      return {
        _id:
          'facility-configuration',

        epoch,

        createdAt:
          new Date(
            '2026-07-17T10:00:00.000Z',
          ),

        updatedAt:
          new Date(
            '2026-07-17T10:00:00.000Z',
          ),
      };
    },

    async findOneAndUpdate(
      _filter:
        unknown,

      update:
        Record<
          string,
          Record<
            string,
            unknown
          >
        >,
    ) {
      const increment =
        update['$inc']
          ?.['epoch'];

      if (
        typeof increment ===
        'number'
      ) {
        epoch +=
          increment;
      }

      return {
        _id:
          'facility-configuration',

        epoch,

        createdAt:
          new Date(
            '2026-07-17T10:00:00.000Z',
          ),

        updatedAt:
          new Date(),
      };
    },
  };

  const database = {
    collection:
      () =>
        collection,
  } as unknown as Db;

  return {
    database,

    externalBump() {
      epoch += 1;
    },

    currentEpoch() {
      return epoch;
    },
  };
}

describe(
  'MongoCoherentConfigurationCacheAdapter',
  () => {
    it(
      'clears another process cache after the shared epoch changes',
      async () => {
        const fixture =
          createDatabaseFixture();

        const first =
          new MongoCoherentConfigurationCacheAdapter(
            fixture.database,
            {
              epochRefreshMilliseconds:
                0,
            },
          );

        const second =
          new MongoCoherentConfigurationCacheAdapter(
            fixture.database,
            {
              epochRefreshMilliseconds:
                0,
            },
          );

        await first.set(
          'facility-configuration:facility:1',
          {
            name:
              'Main Hospital',
          },
          300,
        );

        await second.set(
          'facility-configuration:facility:1',
          {
            name:
              'Main Hospital',
          },
          300,
        );

        expect(
          await second.get(
            'facility-configuration:facility:1',
          ),
        ).toEqual({
          name:
            'Main Hospital',
        });

        await first.delete(
          'facility-configuration:facility:1',
        );

        expect(
          fixture.currentEpoch(),
        ).toBe(
          1,
        );

        expect(
          await second.get(
            'facility-configuration:facility:1',
          ),
        ).toBeNull();
      },
    );

    it(
      'invalidates the namespace for facility and configuration outbox events',
      async () => {
        const fixture =
          createDatabaseFixture();

        const cache =
          new MongoCoherentConfigurationCacheAdapter(
            fixture.database,
            {
              epochRefreshMilliseconds:
                0,
            },
          );

        await cache.set(
          'facility-configuration:effective-setting:facility-1:regional.currency',
          {
            value:
              'PKR',
          },
          300,
        );

        const handled =
          await cache
            .handleOutboxEvent({
              facilityId:
                '507f191e810c19729de860ea',

              eventId:
                'event-1',

              transactionId:
                'transaction-1',

              eventType:
                'configuration.setting.updated',

              aggregateType:
                'SystemSetting',

              aggregateId:
                '507f1f77bcf86cd799439011',

              payload: {
                key:
                  'regional.currency',
              },

              leaseOwner:
                'worker-1',

              leaseToken:
                'lease-1',

              attemptCount:
                1,
            });

        expect(
          handled,
        ).toBe(
          true,
        );

        expect(
          await cache.get(
            'facility-configuration:effective-setting:facility-1:regional.currency',
          ),
        ).toBeNull();

        expect(
          fixture.currentEpoch(),
        ).toBe(
          1,
        );
      },
    );

    it(
      'ignores unrelated outbox events',
      async () => {
        const fixture =
          createDatabaseFixture();

        const cache =
          new MongoCoherentConfigurationCacheAdapter(
            fixture.database,
            {
              epochRefreshMilliseconds:
                0,
            },
          );

        await cache.set(
          'facility-configuration:facility:1',
          {
            name:
              'Main Hospital',
          },
          300,
        );

        const handled =
          await cache
            .handleOutboxEvent({
              facilityId:
                '507f191e810c19729de860ea',

              eventId:
                'event-2',

              transactionId:
                'transaction-2',

              eventType:
                'identity.user.updated',

              aggregateType:
                'User',

              aggregateId:
                '507f1f77bcf86cd799439011',

              payload:
                {},

              leaseOwner:
                'worker-1',

              leaseToken:
                'lease-2',

              attemptCount:
                1,
            });

        expect(
          handled,
        ).toBe(
          false,
        );

        expect(
          await cache.get(
            'facility-configuration:facility:1',
          ),
        ).toEqual({
          name:
            'Main Hospital',
        });
      },
    );
  },
);