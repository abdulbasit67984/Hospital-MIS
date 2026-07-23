import 'dotenv/config';

import { z } from 'zod';

import { loadApiConfig } from '@hospital-mis/config';
import {
  connectDatabase,
  createObjectId,
  disconnectDatabase,
  nativeDatabase,
  toObjectId,
} from '@hospital-mis/database';
import {
  permissionDefinitions,
  type PermissionKey,
} from '@hospital-mis/permissions';

const environmentSchema = z.object({
  CONSULTANT_SHARING_FACILITY_ID: z
    .string()
    .regex(/^[a-f\d]{24}$/iu),
  ADMIN_USERNAME: z.string().trim().min(1).default('admin'),
});

const consultantPermissionDefinitions = permissionDefinitions.filter(
  (definition) => definition.key.startsWith('consultants.'),
);
const allConsultantPermissions = consultantPermissionDefinitions.map(
  (definition) => definition.key,
);

const financeMakerPermissions = allConsultantPermissions.filter(
  (key) =>
    !key.endsWith('.approve')
    && !key.endsWith('.reverse')
    && key !== 'consultants.agreements.activate'
    && key !== 'consultants.agreements.suspend'
    && key !== 'consultants.agreements.terminate'
    && key !== 'consultants.settlements.cancel'
    && key !== 'consultants.disputes.resolve'
    && key !== 'consultants.recovery.manage',
);

const roleGrants: readonly Readonly<{
  code: string;
  createWhenMissing: boolean;
  permissions: readonly PermissionKey[];
}>[] = [
  {
    code: 'SYSTEM_ADMINISTRATOR',
    createWhenMissing: false,
    permissions: allConsultantPermissions,
  },
  {
    code: 'HOSPITAL_ADMINISTRATOR',
    createWhenMissing: false,
    permissions: allConsultantPermissions,
  },
  {
    code: 'FINANCE_MANAGER',
    createWhenMissing: true,
    permissions: allConsultantPermissions,
  },
  {
    code: 'BILLING_OFFICER',
    createWhenMissing: false,
    permissions: financeMakerPermissions,
  },
  {
    code: 'CONSULTANT',
    createWhenMissing: true,
    permissions: [
      'consultants.read',
      'consultants.revenue.read',
      'consultants.settlements.read',
      'consultants.disputes.create',
      'consultants.reports.read',
    ],
  },
  {
    code: 'AUDITOR',
    createWhenMissing: false,
    permissions: [
      'consultants.read',
      'consultants.revenue.read',
      'consultants.settlements.read',
      'consultants.reports.read',
      'consultants.reports.export',
    ],
  },
] as const;

async function main(): Promise<void> {
  const configuration = loadApiConfig();
  const environment = environmentSchema.parse(process.env);

  await connectDatabase({
    uri: configuration.mongodbUri,
    appName: 'hospital-mis-consultant-sharing-access-seed',
    serverSelectionTimeoutMs:
      configuration.mongodbServerSelectionTimeoutMs,
  });

  const database = nativeDatabase();
  const facilityId = toObjectId(
    environment.CONSULTANT_SHARING_FACILITY_ID,
    'CONSULTANT_SHARING_FACILITY_ID',
  );
  const actor = await database.collection('users').findOne({
    normalizedUsername: environment.ADMIN_USERNAME.toLowerCase(),
  });
  if (actor === null) throw new Error('Consultant Sharing seed actor not found');

  const now = new Date();
  const permissionCollection = database.collection('permissions');
  await permissionCollection.bulkWrite(
    consultantPermissionDefinitions.map((definition) => ({
      updateOne: {
        filter: { code: definition.key },
        update: {
          $set: {
            name: definition.description,
            module: 'consultants',
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
  );

  const permissionByCode = new Map(
    (
      await permissionCollection
        .find({ code: { $in: allConsultantPermissions } })
        .toArray()
    ).map((permission) => [String(permission['code']), permission['_id']]),
  );

  for (const roleGrant of roleGrants) {
    let role = await database.collection('roles').findOne({
      code: roleGrant.code,
      $or: [
        { scope: 'GLOBAL', facilityId: null },
        { scope: 'FACILITY', facilityId },
      ],
    });
    if (role === null && roleGrant.createWhenMissing) {
      const roleId = createObjectId();
      await database.collection('roles').insertOne({
        _id: roleId,
        facilityId,
        scope: 'FACILITY',
        code: roleGrant.code,
        name: roleGrant.code.replaceAll('_', ' '),
        description: 'Consultant Sharing operational role',
        isSystem: true,
        isActive: true,
        createdBy: actor['_id'],
        updatedBy: actor['_id'],
        schemaVersion: 1,
        version: 0,
        createdAt: now,
        updatedAt: now,
      });
      role = await database.collection('roles').findOne({ _id: roleId });
    }
    if (role === null) continue;

    for (const permissionKey of roleGrant.permissions) {
      const permissionId = permissionByCode.get(permissionKey);
      if (permissionId === undefined) {
        throw new Error(`Permission ${permissionKey} was not seeded`);
      }
      await database.collection('rolePermissions').updateOne(
        { roleId: role['_id'], permissionId },
        {
          $set: {
            grantedBy: actor['_id'],
            grantedAt: now,
            updatedAt: now,
          },
          $setOnInsert: {
            _id: createObjectId(),
            schemaVersion: 1,
            version: 0,
            createdAt: now,
          },
        },
        { upsert: true },
      );
    }
  }

  console.info(JSON.stringify({
    success: true,
    facilityId: facilityId.toHexString(),
    permissionsSeeded: consultantPermissionDefinitions.length,
    rolesProcessed: roleGrants.length,
  }, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });