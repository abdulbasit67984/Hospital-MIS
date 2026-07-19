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
    LABORATORY_FACILITY_ID:
      z
        .string()
        .regex(
          /^[a-f\d]{24}$/iu,
        ),

    LABORATORY_SEED_ACTOR_USER_ID:
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
        .min(3)
        .max(80)
        .default('admin'),
  });

const modulePermissionKeys = [
  'laboratory.catalog.read',
  'laboratory.catalog.manage',

  'laboratory.orders.read',
  'laboratory.orders.create',
  'laboratory.orders.manage',
  'laboratory.orders.cancel',

  'laboratory.specimens.read',
  'laboratory.specimens.collect',
  'laboratory.specimens.receive',
  'laboratory.specimens.reject',

  'laboratory.results.read',
  'laboratory.results.enter',
  'laboratory.results.validate',
  'laboratory.results.verify',
  'laboratory.results.amend',
  'laboratory.results.publish',
  'laboratory.results.print',

  'laboratory.critical_results.notify',
  'laboratory.critical_results.acknowledge',

  'billing.charges.create',
  'reports.clinical.read',
  'audit.read',
  'security.break_glass',
] as const satisfies readonly PermissionKey[];

type RoleScope =
  | 'GLOBAL'
  | 'FACILITY';

interface RoleSeed {
  code: string;
  name: string;
  description: string;
  scope: RoleScope;
  permissions: readonly PermissionKey[];
}

const roleSeeds:
  readonly RoleSeed[] = [
    {
      code: 'SYSTEM_ADMINISTRATOR',
      name: 'System Administrator',
      description:
        'Global system administration, security, and controlled Laboratory configuration access.',
      scope: 'GLOBAL',
      permissions: modulePermissionKeys,
    },
    {
      code: 'CLINICAL_DOCTOR',
      name: 'Clinical Management – Doctor',
      description:
        'Encounter-linked standardized Laboratory ordering, cancellation, result review, report printing, and critical-result acknowledgement.',
      scope: 'FACILITY',
      permissions: [
        'laboratory.catalog.read',
        'laboratory.orders.read',
        'laboratory.orders.create',
        'laboratory.orders.cancel',
        'laboratory.results.read',
        'laboratory.results.print',
        'laboratory.critical_results.acknowledge',
      ],
    },
    {
      code: 'LABORATORY_STAFF',
      name: 'Laboratory Staff',
      description:
        'Laboratory catalog, order acceptance, specimen workflow, result entry, validation, verification, correction, publication, printing, and critical notification.',
      scope: 'FACILITY',
      permissions: [
        'laboratory.catalog.read',
        'laboratory.catalog.manage',
        'laboratory.orders.read',
        'laboratory.orders.manage',
        'laboratory.orders.cancel',
        'laboratory.specimens.read',
        'laboratory.specimens.collect',
        'laboratory.specimens.receive',
        'laboratory.specimens.reject',
        'laboratory.results.read',
        'laboratory.results.enter',
        'laboratory.results.validate',
        'laboratory.results.verify',
        'laboratory.results.amend',
        'laboratory.results.publish',
        'laboratory.results.print',
        'laboratory.critical_results.notify',
        'billing.charges.create',
        'reports.clinical.read',
      ],
    },
    {
      code: 'WARD_NURSE',
      name: 'Ward Management – Nurse',
      description:
        'Authorized specimen collection, Laboratory order and result review, and critical-result acknowledgement for assigned patients.',
      scope: 'FACILITY',
      permissions: [
        'laboratory.catalog.read',
        'laboratory.orders.read',
        'laboratory.specimens.read',
        'laboratory.specimens.collect',
        'laboratory.results.read',
        'laboratory.critical_results.acknowledge',
      ],
    },
    {
      code: 'MEDICAL_RECORDS_OFFICER',
      name: 'Medical Records Officer',
      description:
        'Authorized longitudinal Laboratory order, result-history, and printable-report access.',
      scope: 'FACILITY',
      permissions: [
        'laboratory.catalog.read',
        'laboratory.orders.read',
        'laboratory.results.read',
        'laboratory.results.print',
      ],
    },
    {
      code: 'DEPARTMENT_MANAGER',
      name: 'Department Manager',
      description:
        'Read-only Laboratory operational oversight and clinical reporting for permitted departments.',
      scope: 'FACILITY',
      permissions: [
        'laboratory.catalog.read',
        'laboratory.orders.read',
        'laboratory.specimens.read',
        'laboratory.results.read',
        'reports.clinical.read',
      ],
    },
    {
      code: 'AUDITOR',
      name: 'Auditor',
      description:
        'Read-only audited access to Laboratory catalogs, orders, specimens, results, immutable versions, and communication history.',
      scope: 'FACILITY',
      permissions: [
        'laboratory.catalog.read',
        'laboratory.orders.read',
        'laboratory.specimens.read',
        'laboratory.results.read',
        'audit.read',
      ],
    },
  ];

function normalizedUsername(
  value: string,
): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US');
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
    uri: config.mongodbUri,
    appName:
      'hospital-mis-laboratory-access-seed',
    serverSelectionTimeoutMs:
      config.mongodbServerSelectionTimeoutMs,
  });

  const database =
    nativeDatabase();

  const facilityId =
    toObjectId(
      environment.LABORATORY_FACILITY_ID,
      'LABORATORY_FACILITY_ID',
    );

  const actor =
    environment.LABORATORY_SEED_ACTOR_USER_ID === undefined
      ? await database
          .collection<{
            _id: DatabaseObjectId;
          }>('users')
          .findOne({
            normalizedUsername:
              normalizedUsername(
                environment.ADMIN_USERNAME,
              ),
          })
      : await database
          .collection<{
            _id: DatabaseObjectId;
          }>('users')
          .findOne({
            _id: toObjectId(
              environment.LABORATORY_SEED_ACTOR_USER_ID,
              'LABORATORY_SEED_ACTOR_USER_ID',
            ),
          });

  if (actor === null) {
    throw new Error(
      'Seed actor was not found. Run seed:admin first or provide LABORATORY_SEED_ACTOR_USER_ID.',
    );
  }

  const requiredDefinitions =
    permissionDefinitions.filter(
      (definition) =>
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
          (definition) => definition.key,
        ),
      );

    const missing =
      modulePermissionKeys.filter(
        (permission) =>
          !available.has(permission),
      );

    throw new Error(
      `Laboratory permission definitions are missing: ${missing.join(', ')}`,
    );
  }

  const now =
    new Date();

  const permissionsCollection =
    database.collection<{
      _id: DatabaseObjectId;
      code: PermissionKey;
    } & Record<string, unknown>>(
      'permissions',
    );

  await permissionsCollection.bulkWrite(
    requiredDefinitions.map(
      (definition) => ({
        updateOne: {
          filter: {
            code: definition.key,
          },
          update: {
            $set: {
              name: definition.description,
              module: definition.module,
              description: definition.description,
              sensitivity: definition.sensitivity,
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
        (permission) => [
          permission.code,
          permission._id,
        ],
      ),
    );

  const rolesCollection =
    database.collection<{
      _id: DatabaseObjectId;
      code: string;
      scope: RoleScope;
      facilityId?: DatabaseObjectId | null;
    } & Record<string, unknown>>(
      'roles',
    );

  const affectedRoleIds:
    DatabaseObjectId[] = [];

  for (const seed of roleSeeds) {
    const roleFacilityId =
      seed.scope === 'GLOBAL'
        ? null
        : facilityId;

    await rolesCollection.updateOne(
      {
        code: seed.code,
        scope: seed.scope,
        facilityId: roleFacilityId,
      },
      {
        $set: {
          name: seed.name,
          description: seed.description,
          isSystem: true,
          isActive: true,
          updatedBy: actor._id,
          updatedAt: now,
        },
        $setOnInsert: {
          _id: createObjectId(),
          code: seed.code,
          scope: seed.scope,
          facilityId: roleFacilityId,
          createdBy: actor._id,
          schemaVersion: 1,
          version: 0,
          createdAt: now,
        },
      },
      {
        upsert: true,
      },
    );

    const role =
      await rolesCollection.findOne({
        code: seed.code,
        scope: seed.scope,
        facilityId: roleFacilityId,
      });

    if (role === null) {
      throw new Error(
        `Role ${seed.code} could not be loaded after upsert`,
      );
    }

    affectedRoleIds.push(role._id);

    const permissionIds =
      seed.permissions.map(
        (permissionCode) => {
          const permissionId =
            permissionByCode.get(
              permissionCode,
            );

          if (permissionId === undefined) {
            throw new Error(
              `Permission ${permissionCode} was not seeded`,
            );
          }

          return permissionId;
        },
      );

    await database
      .collection('rolePermissions')
      .bulkWrite(
        permissionIds.map(
          (permissionId) => ({
            updateOne: {
              filter: {
                roleId: role._id,
                permissionId,
              },
              update: {
                $set: {
                  grantedBy: actor._id,
                  grantedAt: now,
                  updatedAt: now,
                },
                $setOnInsert: {
                  _id: createObjectId(),
                  roleId: role._id,
                  permissionId,
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

  const affectedUserIds =
    await database
      .collection('userRoles')
      .distinct(
        'userId',
        {
          roleId: {
            $in: affectedRoleIds,
          },
          isActive: true,
        },
      );

  if (affectedUserIds.length > 0) {
    await database
      .collection('users')
      .updateMany(
        {
          _id: {
            $in: affectedUserIds,
          },
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
  }

  console.info(
    JSON.stringify(
      {
        success: true,
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
    (error: unknown) => {
      console.error(
        error instanceof Error
          ? error.message
          : 'Laboratory access seed failed',
      );

      process.exitCode = 1;
    },
  )
  .finally(
    async () => {
      await disconnectDatabase();
    },
  );