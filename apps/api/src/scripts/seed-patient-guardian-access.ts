import 'dotenv/config';

import { z } from 'zod';

import { loadApiConfig } from '@hospital-mis/config';
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

const environmentSchema = z.object({
  IDENTITY_FACILITY_ID: z
    .string()
    .regex(/^[a-f\d]{24}$/i),
  PATIENT_ACCESS_SEED_ACTOR_USER_ID: z
    .string()
    .regex(/^[a-f\d]{24}$/i)
    .optional(),
  ADMIN_USERNAME: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .default('admin'),
});

type RoleScope =
  | 'GLOBAL'
  | 'FACILITY';

type RolePermissionGrant = Readonly<{
  roleCode: string;
  scope: RoleScope;
  permissions: readonly PermissionKey[];
}>;

const patientGuardianPermissionKeys = [
  'patients.read',
  'patients.read_sensitive',
  'patients.create',
  'patients.update',
  'patients.merge',
  'guardians.read',
  'guardians.manage',
] as const satisfies readonly PermissionKey[];

const rolePermissionGrants: readonly RolePermissionGrant[] = [
  {
    roleCode: 'SYSTEM_ADMINISTRATOR',
    scope: 'GLOBAL',
    permissions: patientGuardianPermissionKeys,
  },
  {
    roleCode: 'RECEPTION_MANAGEMENT',
    scope: 'FACILITY',
    permissions: [
      'patients.read',
      'patients.create',
      'patients.update',
      'guardians.read',
      'guardians.manage',
    ],
  },
  {
    roleCode: 'CLINICAL_DOCTOR',
    scope: 'FACILITY',
    permissions: [
      'patients.read',
      'patients.read_sensitive',
      'guardians.read',
    ],
  },
  {
    roleCode: 'WARD_NURSE',
    scope: 'FACILITY',
    permissions: [
      'patients.read',
      'guardians.read',
    ],
  },
  {
    roleCode: 'BILLING_OFFICER',
    scope: 'FACILITY',
    permissions: [
      'patients.read',
      'guardians.read',
    ],
  },
  {
    roleCode: 'MEDICAL_RECORDS_OFFICER',
    scope: 'FACILITY',
    permissions: patientGuardianPermissionKeys,
  },
  {
    roleCode: 'EXECUTIVE_ADMINISTRATOR',
    scope: 'FACILITY',
    permissions: [
      'patients.read',
      'patients.read_sensitive',
      'guardians.read',
    ],
  },
  {
    roleCode: 'AUDITOR',
    scope: 'FACILITY',
    permissions: [
      'patients.read',
      'guardians.read',
    ],
  },
];

function normalizeUsername(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US');
}

async function main(): Promise<void> {
  const apiConfig = loadApiConfig();

  const environment = environmentSchema.parse(
    process.env,
  );

  await connectDatabase({
    uri: apiConfig.mongodbUri,
    appName:
      'hospital-mis-patient-guardian-access-seed',
    serverSelectionTimeoutMs:
      apiConfig.mongodbServerSelectionTimeoutMs,
  });

  const database = nativeDatabase();

  const facilityId = toObjectId(
    environment.IDENTITY_FACILITY_ID,
    'IDENTITY_FACILITY_ID',
  );

  const actor =
    environment.PATIENT_ACCESS_SEED_ACTOR_USER_ID ===
    undefined
      ? await database
          .collection<{
            _id: DatabaseObjectId;
          }>('users')
          .findOne({
            normalizedUsername: normalizeUsername(
              environment.ADMIN_USERNAME,
            ),
          })
      : await database
          .collection<{
            _id: DatabaseObjectId;
          }>('users')
          .findOne({
            _id: toObjectId(
              environment
                .PATIENT_ACCESS_SEED_ACTOR_USER_ID,
              'PATIENT_ACCESS_SEED_ACTOR_USER_ID',
            ),
          });

  if (actor === null) {
    throw new Error(
      'Patient access seed actor was not found. Run seed:admin first or provide PATIENT_ACCESS_SEED_ACTOR_USER_ID.',
    );
  }

  const now = new Date();

  const relevantDefinitions =
    permissionDefinitions.filter((definition) =>
      patientGuardianPermissionKeys.includes(
        definition.key as (typeof patientGuardianPermissionKeys)[number],
      ),
    );

  const permissionsCollection =
    database.collection<
      Record<string, unknown> & {
        _id: DatabaseObjectId;
        code: PermissionKey;
      }
    >('permissions');

  await permissionsCollection.bulkWrite(
    relevantDefinitions.map((definition) => ({
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
    })),
    {
      ordered: true,
    },
  );

  const permissionRecords =
    await permissionsCollection
      .find({
        code: {
          $in: [
            ...patientGuardianPermissionKeys,
          ],
        },
      })
      .toArray();

  const permissionByCode = new Map(
    permissionRecords.map((permission) => [
      permission.code,
      permission._id,
    ]),
  );

  const rolesCollection =
    database.collection<
      Record<string, unknown> & {
        _id: DatabaseObjectId;
        code: string;
        scope: RoleScope;
        facilityId?: DatabaseObjectId | null;
      }
    >('roles');

  const rolePermissionsCollection =
    database.collection('rolePermissions');

  const affectedRoleIds: DatabaseObjectId[] = [];

  for (const grant of rolePermissionGrants) {
    const roleFacilityId =
      grant.scope === 'GLOBAL'
        ? null
        : facilityId;

    const role = await rolesCollection.findOne({
      code: grant.roleCode,
      scope: grant.scope,
      facilityId: roleFacilityId,
      isActive: true,
    });

    if (role === null) {
      throw new Error(
        `Required role ${grant.roleCode} was not found. Run the identity access seed first.`,
      );
    }

    affectedRoleIds.push(role._id);

    await rolePermissionsCollection.bulkWrite(
      grant.permissions.map(
        (permissionCode) => {
          const permissionId =
            permissionByCode.get(permissionCode);

          if (permissionId === undefined) {
            throw new Error(
              `Permission ${permissionCode} was not seeded`,
            );
          }

          return {
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
          };
        },
      ),
      {
        ordered: true,
      },
    );
  }

  const assignedUserIds = await database
    .collection('userRoles')
    .distinct('userId', {
      roleId: {
        $in: affectedRoleIds,
      },
      isActive: true,
    });

  if (assignedUserIds.length > 0) {
    await database.collection('users').updateMany(
      {
        _id: {
          $in: assignedUserIds,
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
        facilityId: facilityId.toHexString(),
        permissionCount:
          relevantDefinitions.length,
        roleCount:
          rolePermissionGrants.length,
        invalidatedUserCount:
          assignedUserIds.length,
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
        : 'Patient access seed failed',
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });