import 'dotenv/config';

import {
  z,
} from 'zod';

import {
  loadApiConfig,
  loadAuthConfig,
} from '@hospital-mis/config';

import {
  connectDatabase,
  createObjectId,
  disconnectDatabase,
  nativeDatabase,
  toObjectId,
  type DatabaseObjectId,
} from '@hospital-mis/database';

import {
  permissionDefinitions,
  permissionKeys,
} from '@hospital-mis/permissions';

import {
  hashPassword,
} from '@hospital-mis/shared';

const seedEnvironmentSchema =
  z.object({
    ADMIN_FACILITY_ID: z
      .string()
      .regex(/^[a-f\d]{24}$/i),

    ADMIN_USERNAME: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .default('admin'),

    ADMIN_DISPLAY_NAME: z
      .string()
      .trim()
      .min(3)
      .max(260)
      .default(
        'System Administrator',
      ),

    ADMIN_PASSWORD: z
      .string()
      .min(12)
      .max(128),

    ADMIN_RESET_PASSWORD: z
      .enum([
        'true',
        'false',
      ])
      .default('false'),
  });

type PermissionDocument = Record<string, unknown> & {
  _id: DatabaseObjectId;
  code: string;
};

type RoleDocument = Record<string, unknown> & {
  _id: DatabaseObjectId;
  facilityId?:
    | DatabaseObjectId
    | null;
  scope: 'GLOBAL' | 'FACILITY';
  code: string;
};

type UserDocument = Record<string, unknown> & {
  _id: DatabaseObjectId;
  facilityId?:
    | DatabaseObjectId
    | null;
  normalizedUsername: string;
  version: number;
  tokenVersion: number;
  permissionVersion: number;
};

function normalize(
  value: string,
): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase(
      'en-US',
    );
}

async function main():
  Promise<void> {
  const apiConfig =
    loadApiConfig();
  const authConfig =
    loadAuthConfig();
  const environment =
    seedEnvironmentSchema.parse(
      process.env,
    );

  await connectDatabase({
    uri: apiConfig.mongodbUri,
    appName:
      'hospital-mis-admin-seed',
    serverSelectionTimeoutMs:
      apiConfig
        .mongodbServerSelectionTimeoutMs,
  });

  const database =
    nativeDatabase();
  const now = new Date();
  const facilityId = toObjectId(
    environment.ADMIN_FACILITY_ID,
    'ADMIN_FACILITY_ID',
  );
  const normalizedUsername =
    normalize(
      environment.ADMIN_USERNAME,
    );

  const permissions =
    database.collection<PermissionDocument>(
      'permissions',
    );

  if (
    permissionDefinitions.length > 0
  ) {
    await permissions.bulkWrite(
      permissionDefinitions.map(
        (definition) => ({
          updateOne: {
            filter: {
              code: definition.key,
            },
            update: {
              $set: {
                name:
                  definition.description,
                module:
                  definition.module,
                description:
                  definition.description,
                sensitivity:
                  definition.sensitivity,
                isSystem: true,
                isActive: true,
                updatedAt: now,
              },
              $setOnInsert: {
                _id: createObjectId(),
                code: definition.key,
                schemaVersion: 1,
                version: 0,
                createdAt: now,
              },
            },
            upsert: true,
          },
        }),
      ),
      {
        ordered: true,
      },
    );
  }

  const roles =
    database.collection<RoleDocument>(
      'roles',
    );
  const roleCode =
    'SYSTEM_ADMINISTRATOR';

  await roles.updateOne(
    {
      facilityId: null,
      scope: 'GLOBAL',
      code: roleCode,
    },
    {
      $set: {
        name:
          'System Administrator',
        description:
          'Controlled full-system administration access for the Hospital MIS',
        isSystem: true,
        isActive: true,
        updatedAt: now,
      },
      $setOnInsert: {
        _id: createObjectId(),
        facilityId: null,
        scope: 'GLOBAL',
        code: roleCode,
        schemaVersion: 1,
        version: 0,
        createdAt: now,
      },
    },
    {
      upsert: true,
    },
  );

  const role = await roles.findOne({
    facilityId: null,
    scope: 'GLOBAL',
    code: roleCode,
  });

  if (role === null) {
    throw new Error(
      'System administrator role could not be created',
    );
  }

  const users =
    database.collection<UserDocument>(
      'users',
    );
  let user = await users.findOne({
    normalizedUsername,
  });
  const resetPassword =
    environment
      .ADMIN_RESET_PASSWORD ===
    'true';

  if (user === null) {
    const passwordHash =
      await hashPassword(
        environment.ADMIN_PASSWORD,
        authConfig,
      );
    const userId = createObjectId();

    await users.insertOne({
      _id: userId,
      facilityId,
      publicId:
        'USR-SYSTEM-ADMIN',
      staffId: null,
      username:
        environment.ADMIN_USERNAME,
      normalizedUsername,
      email: null,
      normalizedEmail: null,
      displayName:
        environment
          .ADMIN_DISPLAY_NAME,
      passwordHash,
      status: 'ACTIVE',
      mustChangePassword: true,
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: null,
      passwordChangedAt: now,
      tokenVersion: 0,
      permissionVersion: 0,
      schemaVersion: 1,
      version: 0,
      createdBy: null,
      updatedBy: null,
      disabledAt: null,
      disabledBy: null,
      disabledReason: null,
      createdAt: now,
      updatedAt: now,
    });

    user = await users.findOne({
      _id: userId,
    });
  } else {
    const passwordSet: Record<
      string,
      unknown
    > = {};
    const increments: Record<
      string,
      number
    > = {
      version: 1,
    };

    if (resetPassword) {
      passwordSet['passwordHash'] =
        await hashPassword(
          environment.ADMIN_PASSWORD,
          authConfig,
        );
      passwordSet[
        'passwordChangedAt'
      ] = now;
      passwordSet[
        'mustChangePassword'
      ] = true;
      passwordSet[
        'failedLoginCount'
      ] = 0;
      passwordSet['lockedUntil'] =
        null;
      increments['tokenVersion'] =
        1;
    }

    const updateResult =
      await users.updateOne(
        {
          _id: user._id,
          version: user.version,
        },
        {
          $set: {
            facilityId,
            username:
              environment.ADMIN_USERNAME,
            normalizedUsername,
            displayName:
              environment
                .ADMIN_DISPLAY_NAME,
            status: 'ACTIVE',
            disabledAt: null,
            disabledBy: null,
            disabledReason: null,
            ...passwordSet,
          },
          $inc: increments,
          $currentDate: {
            updatedAt: true,
          },
        },
      );

    if (
      updateResult.modifiedCount !== 1
    ) {
      throw new Error(
        'System administrator user changed while the seed was running',
      );
    }

    user = await users.findOne({
      _id: user._id,
    });
  }

  if (user === null) {
    throw new Error(
      'System administrator user could not be created',
    );
  }

  const seededPermissions =
    await permissions
      .find({
        code: {
          $in: [
            ...permissionKeys,
          ],
        },
        isActive: true,
      })
      .toArray();

  if (
    seededPermissions.length !==
    permissionKeys.length
  ) {
    throw new Error(
      'Not all system permissions were created',
    );
  }

  const permissionIds =
    seededPermissions.map(
      (permission) =>
        permission._id,
    );
  const rolePermissions =
    database.collection(
      'rolePermissions',
    );

  await rolePermissions.deleteMany({
    roleId: role._id,
    permissionId: {
      $nin: permissionIds,
    },
  });

  await rolePermissions.bulkWrite(
    seededPermissions.map(
      (permission) => ({
        updateOne: {
          filter: {
            roleId: role._id,
            permissionId:
              permission._id,
          },
          update: {
            $set: {
              grantedBy: user!._id,
              grantedAt: now,
              updatedAt: now,
            },
            $setOnInsert: {
              _id: createObjectId(),
              roleId: role._id,
              permissionId:
                permission._id,
              schemaVersion: 1,
              version: 0,
              createdAt: now,
            },
          },
          upsert: true,
        },
      }),
    ),
    {
      ordered: true,
    },
  );

  await database
    .collection('userRoles')
    .updateOne(
      {
        userId: user._id,
        roleId: role._id,
        facilityId: null,
      },
      {
        $set: {
          assignedBy: user._id,
          assignedAt: now,
          expiresAt: null,
          isActive: true,
          revokedAt: null,
          revokedBy: null,
          revocationReason: null,
          updatedAt: now,
        },
        $setOnInsert: {
          _id: createObjectId(),
          userId: user._id,
          roleId: role._id,
          facilityId: null,
          schemaVersion: 1,
          version: 0,
          createdAt: now,
        },
      },
      {
        upsert: true,
      },
    );

  await users.updateOne(
    {
      _id: user._id,
    },
    {
      $inc: {
        permissionVersion: 1,
        version: 1,
      },
      $currentDate: {
        updatedAt: true,
      },
    },
  );

  console.info(
    JSON.stringify(
      {
        success: true,
        facilityId:
          facilityId.toHexString(),
        username:
          environment.ADMIN_USERNAME,
        role: roleCode,
        roleScope: 'GLOBAL',
        permissions:
          permissionKeys.length,
        passwordReset:
          resetPassword,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Administrator seed failed',
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });