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
    ADMIN_FACILITY_ID:
      z
        .string()
        .regex(
          /^[a-f\d]{24}$/i,
        ),

    ADMIN_USERNAME:
      z
        .string()
        .trim()
        .min(3)
        .max(100)
        .default(
          'admin',
        ),

    ADMIN_DISPLAY_NAME:
      z
        .string()
        .trim()
        .min(3)
        .max(150)
        .default(
          'System Administrator',
        ),

    ADMIN_PASSWORD:
      z
        .string()
        .min(12)
        .max(128),

    ADMIN_RESET_PASSWORD:
      z
        .enum([
          'true',
          'false',
        ])
        .default(
          'false',
        ),
  });

type PermissionDocument = {
  _id: DatabaseObjectId;
  facilityId: DatabaseObjectId;
  key: string;
};

type RoleDocument = {
  _id: DatabaseObjectId;
  facilityId: DatabaseObjectId;
  normalizedCode: string;
};

type UserDocument = {
  _id: DatabaseObjectId;
  facilityId: DatabaseObjectId;
  normalizedUsername: string;
  version: number;
};

function normalize(
  value: string,
): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase();
}

function permissionPublicId(
  key: string,
): string {
  return `PERM-${key
    .toUpperCase()
    .replaceAll('.', '-')
    .replaceAll('_', '-')}`;
}

async function main():
  Promise<void> {
  const apiConfig =
    loadApiConfig();

  const authConfig =
    loadAuthConfig();

  const seedEnvironment =
    seedEnvironmentSchema.parse(
      process.env,
    );

  await connectDatabase({
    uri:
      apiConfig.mongodbUri,

    appName:
      'hospital-mis-admin-seed',

    serverSelectionTimeoutMs:
      apiConfig
        .mongodbServerSelectionTimeoutMs,
  });

  const database =
    nativeDatabase();

  const now =
    new Date();

  const facilityId =
    toObjectId(
      seedEnvironment
        .ADMIN_FACILITY_ID,

      'ADMIN_FACILITY_ID',
    );

  const permissions =
    database.collection<PermissionDocument>(
      'permissions',
    );

  for (
    const definition of
    permissionDefinitions
  ) {
    await permissions.updateOne(
      {
        facilityId,
        key:
          definition.key,
      },

      {
        $set: {
          module:
            definition.module,

          description:
            definition.description,

          sensitivity:
            definition.sensitivity,

          source:
            'SYSTEM',

          active:
            true,

          updatedAt:
            now,
        },

        $setOnInsert: {
          _id:
            createObjectId(),

          facilityId,

          publicId:
            permissionPublicId(
              definition.key,
            ),

          key:
            definition.key,

          schemaVersion:
            1,

          version:
            0,

          createdAt:
            now,
        },
      },

      {
        upsert:
          true,
      },
    );
  }

  const roles =
    database.collection<RoleDocument>(
      'roles',
    );

  const normalizedRoleCode =
    'system-administrator';

  await roles.updateOne(
    {
      facilityId,

      normalizedCode:
        normalizedRoleCode,
    },

    {
      $set: {
        code:
          'SYSTEM_ADMINISTRATOR',

        name:
          'System Administrator',

        description:
          'Full administrative access to the Hospital MIS',

        systemRole:
          true,

        active:
          true,

        updatedAt:
          now,
      },

      $setOnInsert: {
        _id:
          createObjectId(),

        facilityId,

        publicId:
          'ROLE-SYSTEM-ADMIN',

        normalizedCode:
          normalizedRoleCode,

        schemaVersion:
          1,

        version:
          0,

        createdAt:
          now,
      },
    },

    {
      upsert:
        true,
    },
  );

  const role =
    await roles.findOne({
      facilityId,

      normalizedCode:
        normalizedRoleCode,
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

  const normalizedUsername =
    normalize(
      seedEnvironment
        .ADMIN_USERNAME,
    );

  let user =
    await users.findOne({
      facilityId,
      normalizedUsername,
    });

  if (user === null) {
    const passwordHash =
      await hashPassword(
        seedEnvironment
          .ADMIN_PASSWORD,

        authConfig,
      );

    const userId =
      createObjectId();

    await users.insertOne({
      _id:
        userId,

      facilityId,

      publicId:
        'USR-SYSTEM-ADMIN',

      username:
        seedEnvironment
          .ADMIN_USERNAME,

      normalizedUsername,

      displayName:
        seedEnvironment
          .ADMIN_DISPLAY_NAME,

      passwordHash,

      status:
        'ACTIVE',

      failedLoginCount:
        0,

      passwordChangedAt:
        now,

      tokenVersion:
        0,

      permissionVersion:
        0,

      schemaVersion:
        1,

      version:
        0,

      createdAt:
        now,

      updatedAt:
        now,
    });

    user =
      await users.findOne({
        _id: userId,
      });
  } else {
    const resetPassword =
      seedEnvironment
        .ADMIN_RESET_PASSWORD ===
      'true';

    const passwordUpdate =
      resetPassword
        ? {
            passwordHash:
              await hashPassword(
                seedEnvironment
                  .ADMIN_PASSWORD,

                authConfig,
              ),

            passwordChangedAt:
              now,
          }
        : {};

    await users.updateOne(
      {
        _id:
          user._id,

        version:
          user.version,
      },

      {
        $set: {
          username:
            seedEnvironment
              .ADMIN_USERNAME,

          normalizedUsername,

          displayName:
            seedEnvironment
              .ADMIN_DISPLAY_NAME,

          status:
            'ACTIVE',

          ...passwordUpdate,
        },

        $inc: {
          version:
            1,

          ...(resetPassword
            ? {
                tokenVersion:
                  1,
              }
            : {}),
        },

        $currentDate: {
          updatedAt:
            true,
        },
      },
    );

    user =
      await users.findOne({
        _id:
          user._id,
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
        facilityId,

        key: {
          $in: [
            ...permissionKeys,
          ],
        },

        active:
          true,
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

  const rolePermissions =
    database.collection(
      'rolePermissions',
    );

  for (
    const permission of
    seededPermissions
  ) {
    await rolePermissions.updateOne(
      {
        facilityId,

        roleId:
          role._id,

        permissionKey:
          permission.key,

        active:
          true,
      },

      {
        $setOnInsert: {
          _id:
            createObjectId(),

          facilityId,

          roleId:
            role._id,

          permissionId:
            permission._id,

          permissionKey:
            permission.key,

          active:
            true,

          assignedAt:
            now,

          assignedBy:
            user._id,

          schemaVersion:
            1,

          version:
            0,

          createdAt:
            now,

          updatedAt:
            now,
        },
      },

      {
        upsert:
          true,
      },
    );
  }

  await database
    .collection('userRoles')
    .updateOne(
      {
        facilityId,

        userId:
          user._id,

        roleId:
          role._id,

        active:
          true,
      },

      {
        $setOnInsert: {
          _id:
            createObjectId(),

          facilityId,

          userId:
            user._id,

          roleId:
            role._id,

          active:
            true,

          assignedAt:
            now,

          assignedBy:
            user._id,

          schemaVersion:
            1,

          version:
            0,

          createdAt:
            now,

          updatedAt:
            now,
        },
      },

      {
        upsert:
          true,
      },
    );

  await users.updateOne(
    {
      _id:
        user._id,
    },

    {
      $inc: {
        permissionVersion:
          1,

        version:
          1,
      },

      $currentDate: {
        updatedAt:
          true,
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
          seedEnvironment
            .ADMIN_USERNAME,

        role:
          'SYSTEM_ADMINISTRATOR',

        permissions:
          permissionKeys.length,

        passwordReset:
          seedEnvironment
            .ADMIN_RESET_PASSWORD ===
          'true',
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