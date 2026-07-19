import 'dotenv/config';

import {
  z,
} from 'zod';

import {
  loadApiConfig,
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
  type PermissionKey,
} from '@hospital-mis/permissions';

const environmentSchema =
  z.object({
    FORMULARY_PRESCRIPTION_FACILITY_ID:
      z
        .string()
        .regex(
          /^[a-f\d]{24}$/iu,
        ),

    FORMULARY_PRESCRIPTION_SEED_ACTOR_USER_ID:
      z
        .string()
        .regex(
          /^[a-f\d]{24}$/iu,
        )
        .optional(),

    ADMIN_USERNAME:
      z
        .string()
        .trim()
        .min(
          3,
        )
        .max(
          80,
        )
        .default(
          'admin',
        ),
  });

const modulePermissionKeys = [
  'formulary.read',
  'formulary.manage',

  'prescriptions.read',
  'prescriptions.create',
  'prescriptions.issue',
  'prescriptions.amend',
  'prescriptions.cancel',
  'prescriptions.print',

  'inventory.read',
  'pharmacy.queue.read',

  'security.break_glass',
] as const satisfies readonly PermissionKey[];

type RoleScope =
  | 'GLOBAL'
  | 'FACILITY';

interface RoleSeed {
  code:
    string;

  name:
    string;

  description:
    string;

  scope:
    RoleScope;

  permissions:
    readonly PermissionKey[];
}

const roleSeeds:
  readonly RoleSeed[] = [
    {
      code:
        'SYSTEM_ADMINISTRATOR',

      name:
        'System Administrator',

      description:
        'Global system administration and security access.',

      scope:
        'GLOBAL',

      permissions:
        modulePermissionKeys,
    },

    {
      code:
        'CLINICAL_DOCTOR',

      name:
        'Clinical Management – Doctor',

      description:
        'Encounter-linked prescribing, safety review, immutable issuance, amendment, cancellation, printing, and permitted stock visibility.',

      scope:
        'FACILITY',

      permissions: [
        'formulary.read',

        'prescriptions.read',
        'prescriptions.create',
        'prescriptions.issue',
        'prescriptions.amend',
        'prescriptions.cancel',
        'prescriptions.print',

        'inventory.read',
      ],
    },

    {
      code:
        'PHARMACIST',

      name:
        'Inventory Management – Pharmacist',

      description:
        'Formulary management, prescription queue review, printable prescription access, and inventory visibility without provider issuance authority.',

      scope:
        'FACILITY',

      permissions: [
        'formulary.read',
        'formulary.manage',

        'prescriptions.read',
        'prescriptions.print',

        'inventory.read',
        'pharmacy.queue.read',
      ],
    },

    {
      code:
        'MEDICAL_RECORDS_OFFICER',

      name:
        'Medical Records Officer',

      description:
        'Authorized longitudinal medical-record and medication-history access.',

      scope:
        'FACILITY',

      permissions: [
        'formulary.read',
        'prescriptions.read',
      ],
    },

    {
      code:
        'AUDITOR',

      name:
        'Auditor',

      description:
        'Read-only audited access to formulary and prescription lifecycle records.',

      scope:
        'FACILITY',

      permissions: [
        'formulary.read',
        'prescriptions.read',
      ],
    },
  ];

function normalizedUsername(
  value:
    string,
): string {
  return value
    .normalize(
      'NFKC',
    )
    .trim()
    .toLocaleLowerCase(
      'en-US',
    );
}

async function main():
  Promise<void> {
  const config =
    loadApiConfig();

  const environment =
    environmentSchema.parse(
      process.env,
    );

  await connectDatabase({
    uri:
      config.mongodbUri,

    appName:
      'hospital-mis-formulary-prescription-access-seed',

    serverSelectionTimeoutMs:
      config.mongodbServerSelectionTimeoutMs,
  });

  const database =
    nativeDatabase();

  const facilityId =
    toObjectId(
      environment
        .FORMULARY_PRESCRIPTION_FACILITY_ID,

      'FORMULARY_PRESCRIPTION_FACILITY_ID',
    );

  const actor =
    environment
      .FORMULARY_PRESCRIPTION_SEED_ACTOR_USER_ID ===
    undefined
      ? await database
          .collection<{
            _id:
              DatabaseObjectId;
          }>(
            'users',
          )
          .findOne({
            normalizedUsername:
              normalizedUsername(
                environment.ADMIN_USERNAME,
              ),
          })
      : await database
          .collection<{
            _id:
              DatabaseObjectId;
          }>(
            'users',
          )
          .findOne({
            _id:
              toObjectId(
                environment
                  .FORMULARY_PRESCRIPTION_SEED_ACTOR_USER_ID,

                'FORMULARY_PRESCRIPTION_SEED_ACTOR_USER_ID',
              ),
          });

  if (
    actor ===
    null
  ) {
    throw new Error(
      'Seed actor was not found. Run seed:admin first or provide FORMULARY_PRESCRIPTION_SEED_ACTOR_USER_ID.',
    );
  }

  const requiredDefinitions =
    permissionDefinitions.filter(
      (
        definition,
      ) =>
        modulePermissionKeys.includes(
          definition.key as
            (typeof modulePermissionKeys)[number],
        ),
    );

  if (
    requiredDefinitions.length !==
    modulePermissionKeys.length
  ) {
    const available =
      new Set(
        requiredDefinitions.map(
          (
            definition,
          ) =>
            definition.key,
        ),
      );

    const missing =
      modulePermissionKeys.filter(
        (
          permission,
        ) =>
          !available.has(
            permission,
          ),
      );

    throw new Error(
      `Formulary and prescription permission definitions are missing: ${missing.join(', ')}`,
    );
  }

  const now =
    new Date();

  const permissionsCollection =
    database.collection<{
      _id:
        DatabaseObjectId;

      code:
        PermissionKey;
    } & Record<string, unknown>>(
      'permissions',
    );

  await permissionsCollection.bulkWrite(
    requiredDefinitions.map(
      (
        definition,
      ) => ({
        updateOne: {
          filter: {
            code:
              definition.key,
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

              isSystem:
                true,

              isActive:
                true,

              updatedAt:
                now,
            },

            $setOnInsert: {
              _id:
                createObjectId(),

              code:
                definition.key,

              schemaVersion:
                1,

              version:
                0,

              createdAt:
                now,
            },
          },

          upsert:
            true,
        },
      }),
    ),

    {
      ordered:
        true,
    },
  );

  const permissionRecords =
    await permissionsCollection
      .find({
        code: {
          $in: [
            ...modulePermissionKeys,
          ],
        },
      })
      .toArray();

  const permissionByCode =
    new Map(
      permissionRecords.map(
        (
          permission,
        ) => [
          permission.code,
          permission._id,
        ],
      ),
    );

  const rolesCollection =
    database.collection<{
      _id:
        DatabaseObjectId;

      code:
        string;

      scope:
        RoleScope;

      facilityId?:
        DatabaseObjectId | null;
    } & Record<string, unknown>>(
      'roles',
    );

  const affectedRoleIds:
    DatabaseObjectId[] = [];

  for (
    const seed of
    roleSeeds
  ) {
    const roleFacilityId =
      seed.scope ===
      'GLOBAL'
        ? null
        : facilityId;

    await rolesCollection.updateOne(
      {
        code:
          seed.code,

        scope:
          seed.scope,

        facilityId:
          roleFacilityId,
      },

      {
        $set: {
          name:
            seed.name,

          description:
            seed.description,

          isSystem:
            true,

          isActive:
            true,

          updatedBy:
            actor._id,

          updatedAt:
            now,
        },

        $setOnInsert: {
          _id:
            createObjectId(),

          code:
            seed.code,

          scope:
            seed.scope,

          facilityId:
            roleFacilityId,

          createdBy:
            actor._id,

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
      await rolesCollection.findOne({
        code:
          seed.code,

        scope:
          seed.scope,

        facilityId:
          roleFacilityId,
      });

    if (
      role ===
      null
    ) {
      throw new Error(
        `Role ${seed.code} could not be loaded after upsert`,
      );
    }

    affectedRoleIds.push(
      role._id,
    );

    const permissionIds =
      seed.permissions.map(
        (
          permissionCode,
        ) => {
          const permissionId =
            permissionByCode.get(
              permissionCode,
            );

          if (
            permissionId ===
            undefined
          ) {
            throw new Error(
              `Permission ${permissionCode} was not seeded`,
            );
          }

          return permissionId;
        },
      );

    if (
      permissionIds.length ===
      0
    ) {
      continue;
    }

    await database
      .collection(
        'rolePermissions',
      )
      .bulkWrite(
        permissionIds.map(
          (
            permissionId,
          ) => ({
            updateOne: {
              filter: {
                roleId:
                  role._id,

                permissionId,
              },

              update: {
                $set: {
                  grantedBy:
                    actor._id,

                  grantedAt:
                    now,

                  updatedAt:
                    now,
                },

                $setOnInsert: {
                  _id:
                    createObjectId(),

                  roleId:
                    role._id,

                  permissionId,

                  schemaVersion:
                    1,

                  version:
                    0,

                  createdAt:
                    now,
                },
              },

              upsert:
                true,
            },
          }),
        ),

        {
          ordered:
            true,
        },
      );
  }

  const affectedUserIds =
    await database
      .collection(
        'userRoles',
      )
      .distinct(
        'userId',

        {
          roleId: {
            $in:
              affectedRoleIds,
          },

          isActive:
            true,
        },
      );

  if (
    affectedUserIds.length >
    0
  ) {
    await database
      .collection(
        'users',
      )
      .updateMany(
        {
          _id: {
            $in:
              affectedUserIds,
          },
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
  }

  console.info(
    JSON.stringify(
      {
        success:
          true,

        facilityId:
          facilityId.toHexString(),

        permissionsSeeded:
          requiredDefinitions.length,

        rolesUpdated:
          roleSeeds.length,

        invalidatedUsers:
          affectedUserIds.length,
      },

      null,
      2,
    ),
  );
}

main()
  .catch(
    (
      error:
        unknown,
    ) => {
      console.error(
        error instanceof
        Error
          ? error.message
          : 'Formulary and prescription access seed failed',
      );

      process.exitCode =
        1;
    },
  )
  .finally(
    async () => {
      await disconnectDatabase();
    },
  );