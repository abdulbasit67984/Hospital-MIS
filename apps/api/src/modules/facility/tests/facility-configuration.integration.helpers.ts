import {
  randomBytes,
} from 'node:crypto';

import type {
  FacilityConfigurationConfig,
} from '@hospital-mis/config/facility-configuration';

import {
  connectDatabase,
  createObjectId,
  disconnectDatabase,
  nativeDatabase,
  runMigrations,
  type Db,
} from '@hospital-mis/database';

export interface FacilityIntegrationNamespace {
  suffix:
    string;

  codePrefix:
    string;

  keyPrefix:
    string;

  correlationPrefix:
    string;

  idempotencyPrefix:
    string;

  actorUserId:
    string;
}

function escapeRegularExpression(
  value:
    string,
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/gu,
    '\\$&',
  );
}

export function createFacilityIntegrationNamespace():
  FacilityIntegrationNamespace {
  const suffix =
    createObjectId()
      .toHexString()
      .slice(
        -8,
      );

  return {
    suffix,

    codePrefix:
      `IT${suffix.toLocaleUpperCase(
        'en-US',
      )}`,

    keyPrefix:
      `integration.${suffix}.`,

    correlationPrefix:
      `facility-integration-${suffix}`,

    idempotencyPrefix:
      `facility-integration-${suffix}`,

    actorUserId:
      createObjectId()
        .toHexString(),
  };
}

export function createFacilityIntegrationConfiguration(
  namespace:
    FacilityIntegrationNamespace,
): FacilityConfigurationConfig {
  return {
    activeEncryptionKeyVersion:
      `integration-${namespace.suffix}`,

    encryptionKeys: {
      [`integration-${namespace.suffix}`]:
        randomBytes(
          32,
        ).toString(
          'base64',
        ),
    },

    hashSecret:
      `facility-integration-hash-secret-${namespace.suffix}-with-at-least-thirty-two-characters`,

    cacheDefaultTtlSeconds:
      30,

    cacheMaximumEntries:
      500,
  } as FacilityConfigurationConfig;
}

export async function connectFacilityIntegrationDatabase():
  Promise<Db> {
  const uri =
    process.env[
      'FACILITY_INTEGRATION_MONGODB_URI'
    ] ??
    process.env[
      'MONGODB_URI'
    ];

  if (
    uri ===
    undefined ||
    uri.trim().length ===
    0
  ) {
    throw new Error(
      'FACILITY_INTEGRATION_MONGODB_URI or MONGODB_URI is required',
    );
  }

  await connectDatabase({
    uri,

    appName:
      'hospital-mis-facility-integration',

    serverSelectionTimeoutMs:
      10_000,
  });

  const database =
    nativeDatabase();

  if (
    !/test/i.test(
      database.databaseName,
    )
  ) {
    await disconnectDatabase();

    throw new Error(
      `Facility integration tests require a database name containing "test"; received ${database.databaseName}`,
    );
  }

  await runMigrations(
    database,
  );

  return database;
}

export async function disconnectFacilityIntegrationDatabase():
  Promise<void> {
  await disconnectDatabase();
}

export async function cleanupFacilityIntegrationData(
  database:
    Db,

  namespace:
    FacilityIntegrationNamespace,
): Promise<void> {
  const codeExpression =
    new RegExp(
      `^${escapeRegularExpression(
        namespace.codePrefix,
      )}`,
      'u',
    );

  const keyExpression =
    new RegExp(
      `^${escapeRegularExpression(
        namespace.keyPrefix,
      )}`,
      'u',
    );

  const correlationExpression =
    new RegExp(
      `^${escapeRegularExpression(
        namespace.correlationPrefix,
      )}`,
      'u',
    );

  const idempotencyExpression =
    new RegExp(
      `^${escapeRegularExpression(
        namespace.idempotencyPrefix,
      )}`,
      'u',
    );

  const facilities =
    await database
      .collection<{
        _id:
          ReturnType<
            typeof createObjectId
          >;
      }>(
        'facilities',
      )
      .find({
        code: {
          $regex:
            codeExpression,
        },
      })
      .project({
        _id:
          1,
      })
      .toArray();

  const facilityIds =
    facilities.map(
      (
        facility,
      ) =>
        facility._id,
    );

  const transactions =
    await database
      .collection<{
        transactionId:
          string;
      }>(
        'applicationTransactions',
      )
      .find({
        $or: [
          {
            correlationId: {
              $regex:
                correlationExpression,
            },
          },
          {
            idempotencyKey: {
              $regex:
                idempotencyExpression,
            },
          },
        ],
      })
      .project({
        transactionId:
          1,
      })
      .toArray();

  const transactionIds =
    transactions.map(
      (
        transaction,
      ) =>
        transaction.transactionId,
    );

  const settings =
    await database
      .collection<{
        _id:
          ReturnType<
            typeof createObjectId
          >;
      }>(
        'systemSettings',
      )
      .find({
        key: {
          $regex:
            keyExpression,
        },
      })
      .project({
        _id:
          1,
      })
      .toArray();

  const settingIds =
    settings.map(
      (
        setting,
      ) =>
        setting._id,
    );

  if (
    transactionIds.length >
    0
  ) {
    await Promise.all([
      database
        .collection(
          'applicationTransactionSteps',
        )
        .deleteMany({
          transactionId: {
            $in:
              transactionIds,
          },
        }),

      database
        .collection(
          'outboxEvents',
        )
        .deleteMany({
          transactionId: {
            $in:
              transactionIds,
          },
        }),

      database
        .collection(
          'operationLocks',
        )
        .deleteMany({
          ownerId: {
            $in:
              transactionIds,
          },
        }),
    ]);
  }

  await Promise.all([
    database
      .collection(
        'auditEvents',
      )
      .deleteMany({
        correlationId: {
          $regex:
            correlationExpression,
        },
      }),

    database
      .collection(
        'idempotencyKeys',
      )
      .deleteMany({
        key: {
          $regex:
            idempotencyExpression,
        },
      }),

    database
      .collection(
        'systemSettingVersions',
      )
      .deleteMany({
        $or: [
          {
            key: {
              $regex:
                keyExpression,
            },
          },
          {
            settingId: {
              $in:
                settingIds,
            },
          },
        ],
      }),

    database
      .collection(
        'systemSettings',
      )
      .deleteMany({
        key: {
          $regex:
            keyExpression,
        },
      }),

    database
      .collection(
        'settingDefinitions',
      )
      .deleteMany({
        key: {
          $regex:
            keyExpression,
        },
      }),
  ]);

  if (
    facilityIds.length >
    0
  ) {
    await Promise.all([
      database
        .collection(
          'refreshTokens',
        )
        .deleteMany({
          facilityId: {
            $in:
              facilityIds,
          },
        }),

      database
        .collection(
          'sessions',
        )
        .deleteMany({
          facilityId: {
            $in:
              facilityIds,
          },
        }),

      database
        .collection(
          'departments',
        )
        .deleteMany({
          facilityId: {
            $in:
              facilityIds,
          },
        }),
    ]);
  }

  await database
    .collection(
      'applicationTransactions',
    )
    .deleteMany({
      $or: [
        {
          correlationId: {
            $regex:
              correlationExpression,
          },
        },
        {
          idempotencyKey: {
            $regex:
              idempotencyExpression,
          },
        },
      ],
    });

  if (
    facilityIds.length >
    0
  ) {
    await database
      .collection(
        'facilities',
      )
      .deleteMany({
        _id: {
          $in:
            facilityIds,
        },
      });
  }
}