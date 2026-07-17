import mongoose from 'mongoose';

export type DatabaseConnectionOptions = {
  uri: string;
  appName: string;
  serverSelectionTimeoutMs: number;
};

export type DependencyHealth = {
  status: 'up';
  latencyMs: number;
};

let connectionPromise:
  | Promise<typeof mongoose>
  | undefined;

export async function connectDatabase(
  options:
    DatabaseConnectionOptions,
): Promise<typeof mongoose> {
  if (
    mongoose.connection
      .readyState === 1
  ) {
    return mongoose;
  }

  const connectOptions = {
    appName:
      options.appName,

    serverSelectionTimeoutMS:
      options.serverSelectionTimeoutMs,

    maxPoolSize:
      20,

    minPoolSize:
      1,

    retryWrites:
      false,
  } as mongoose.ConnectOptions;

  connectionPromise ??=
    mongoose.connect(
      options.uri,
      connectOptions,
    );

  try {
    return await connectionPromise;
  } catch (error) {
    connectionPromise =
      undefined;

    throw error;
  }
}

export async function disconnectDatabase():
  Promise<void> {
  connectionPromise =
    undefined;

  if (
    mongoose.connection
      .readyState !== 0
  ) {
    await mongoose.disconnect();
  }
}

export async function pingDatabase():
  Promise<DependencyHealth> {
  const database =
    mongoose.connection.db;

  if (
    mongoose.connection
      .readyState !== 1 ||
    database === undefined
  ) {
    throw new Error(
      'MongoDB connection is not ready',
    );
  }

  const startedAt =
    Date.now();

  await database.command({
    ping: 1,
  });

  return {
    status:
      'up',

    latencyMs:
      Date.now() -
      startedAt,
  };
}

export function databaseReadyState():
  number {
  return mongoose.connection
    .readyState;
}

export function nativeDatabase() {
  const database =
    mongoose.connection.db;

  if (
    database === undefined
  ) {
    throw new Error(
      'MongoDB connection is not ready',
    );
  }

  return database;
}

export type {
  Collection,
  Db,
  Filter,
  IndexDescription,
  UpdateFilter,
} from 'mongodb';

export {
  Decimal128,
  ObjectId,
} from 'mongodb';

export * from './atomic.js';
export * from './decimal128.js';
export * from './object-id.js';

export * from './catalog/collection-specs.js';
export * from './catalog/enums.js';
export * from './catalog/json-schema.js';

export * from './models/access-control.js';
export * from './models/audit.js';
export * from './models/auth.js';
export * from './models/common.js';
export * from './models/critical.js';
export * from './models/facility-configuration.js';
export * from './models/registry.js';

export * from './models/department.model.js';
export * from './models/facility.model.js';
export * from './models/permission.model.js';
export * from './models/setting-definition.model.js';
export * from './models/system-setting.model.js';
export * from './models/system-setting-version.model.js';
export * from './models/role.model.js';
export * from './models/role-permission.model.js';
export * from './models/staff.model.js';
export * from './models/user.model.js';
export * from './models/user-role.model.js';

export * from './migrations/types.js';
export * from './migrations/index.js';