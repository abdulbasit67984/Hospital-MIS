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
  WELFARE_ZAKAT_FACILITY_ID: z.string().regex(/^[a-f\d]{24}$/i),
  WELFARE_ZAKAT_SEED_ACTOR_USER_ID: z
    .string()
    .regex(/^[a-f\d]{24}$/i)
    .optional(),
  ADMIN_USERNAME: z.string().trim().min(3).max(80).default('admin'),
});

type RoleSeed = Readonly<{
  code: string;
  name: string;
  description: string;
  createWhenMissing: boolean;
  permissions: readonly PermissionKey[];
}>;

const allWelfareZakatPermissions = permissionDefinitions
  .map((definition) => definition.key)
  .filter((key): key is PermissionKey => key.startsWith('welfare_zakat.'));

function permissions(...keys: PermissionKey[]): readonly PermissionKey[] {
  return keys;
}

const operationalReadPermissions = permissions(
  'welfare_zakat.read',
  'welfare_zakat.funds.read',
  'welfare_zakat.reports.read',
);

const roleSeeds: readonly RoleSeed[] = [
  {
    code: 'SYSTEM_ADMINISTRATOR',
    name: 'System Administrator',
    description: 'System-wide administration including Welfare and Zakat configuration.',
    createWhenMissing: false,
    permissions: allWelfareZakatPermissions,
  },
  {
    code: 'BILLING_OFFICER',
    name: 'Financial Management – Billing Officer',
    description: 'Patient billing, assistance applications, reservations, and allocation preparation.',
    createWhenMissing: false,
    permissions: permissions(
      ...operationalReadPermissions,
      'welfare_zakat.applications.create',
      'welfare_zakat.applications.update',
      'welfare_zakat.applications.submit',
      'welfare_zakat.approvals.request',
      'welfare_zakat.reservations.create',
      'welfare_zakat.reservations.release',
      'welfare_zakat.allocations.create',
      'welfare_zakat.allocations.confirm',
      'welfare_zakat.refunds.request',
      'welfare_zakat.repayments.request',
    ),
  },
  {
    code: 'SOCIAL_WELFARE_OFFICER',
    name: 'Social Welfare Officer',
    description: 'Assistance intake, household assessment, evidence review, eligibility, and case work queues.',
    createWhenMissing: true,
    permissions: permissions(
      ...operationalReadPermissions,
      'welfare_zakat.read_sensitive',
      'welfare_zakat.applications.create',
      'welfare_zakat.applications.update',
      'welfare_zakat.applications.submit',
      'welfare_zakat.applications.review',
      'welfare_zakat.applications.reopen',
      'welfare_zakat.applications.cancel',
      'welfare_zakat.assign',
      'welfare_zakat.escalate',
      'welfare_zakat.eligibility.evaluate',
      'welfare_zakat.approvals.request',
      'welfare_zakat.reservations.create',
      'welfare_zakat.reservations.release',
      'welfare_zakat.allocations.create',
      'welfare_zakat.allocations.reverse.request',
      'welfare_zakat.reports.export',
    ),
  },
  {
    code: 'ZAKAT_OFFICER',
    name: 'Zakat Officer',
    description: 'Zakat declaration review, eligibility assessment, case recommendation, and utilization oversight.',
    createWhenMissing: true,
    permissions: permissions(
      ...operationalReadPermissions,
      'welfare_zakat.read_sensitive',
      'welfare_zakat.applications.review',
      'welfare_zakat.assign',
      'welfare_zakat.escalate',
      'welfare_zakat.eligibility.evaluate',
      'welfare_zakat.approvals.request',
      'welfare_zakat.allocations.reverse.request',
      'welfare_zakat.reports.export',
    ),
  },
  {
    code: 'FINANCE_MANAGER',
    name: 'Finance Manager',
    description: 'Independent approval and posting authority for Welfare and Zakat financial operations.',
    createWhenMissing: true,
    permissions: permissions(
      ...allWelfareZakatPermissions,
      'billing.accounts.read',
      'billing.invoice.read',
      'billing.financial_discharge',
      'reports.financial.read',
      'reports.export',
    ),
  },
  {
    code: 'EXECUTIVE_ADMINISTRATOR',
    name: 'Executive Management – Hospital Administrator',
    description: 'Controlled executive oversight of Welfare and Zakat balances and utilization.',
    createWhenMissing: false,
    permissions: permissions(
      ...operationalReadPermissions,
      'welfare_zakat.reports.export',
    ),
  },
  {
    code: 'AUDITOR',
    name: 'Auditor',
    description: 'Read-only audit and reconciliation review for assistance funds.',
    createWhenMissing: false,
    permissions: permissions(
      ...operationalReadPermissions,
      'welfare_zakat.read_sensitive',
      'welfare_zakat.reports.export',
    ),
  },
];

function normalizeUsername(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

async function main(): Promise<void> {
  const config = loadApiConfig();
  const environment = environmentSchema.parse(process.env);
  await connectDatabase({
    uri: config.mongodbUri,
    appName: 'hospital-mis-welfare-zakat-access-seed',
    serverSelectionTimeoutMs: config.mongodbServerSelectionTimeoutMs,
  });

  const database = nativeDatabase();
  const facilityId = toObjectId(
    environment.WELFARE_ZAKAT_FACILITY_ID,
    'WELFARE_ZAKAT_FACILITY_ID',
  );
  const actor = environment.WELFARE_ZAKAT_SEED_ACTOR_USER_ID === undefined
    ? await database.collection<{ _id: DatabaseObjectId }>('users').findOne({
        normalizedUsername: normalizeUsername(environment.ADMIN_USERNAME),
      })
    : await database.collection<{ _id: DatabaseObjectId }>('users').findOne({
        _id: toObjectId(
          environment.WELFARE_ZAKAT_SEED_ACTOR_USER_ID,
          'WELFARE_ZAKAT_SEED_ACTOR_USER_ID',
        ),
      });
  if (actor === null) {
    throw new Error(
      'Seed actor was not found. Run seed:admin first or provide WELFARE_ZAKAT_SEED_ACTOR_USER_ID.',
    );
  }

  const now = new Date();
  const definitions = permissionDefinitions.filter((definition) =>
    definition.key.startsWith('welfare_zakat.'));
  const permissionCollection = database.collection<{
    _id: DatabaseObjectId;
    code: PermissionKey;
  }>('permissions');

  await permissionCollection.bulkWrite(
    definitions.map((definition) => ({
      updateOne: {
        filter: { code: definition.key },
        update: {
          $set: {
            name: definition.description,
            module: 'welfare_zakat',
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
    { ordered: true },
  );

  const requiredRolePermissionCodes = [...new Set(
    roleSeeds.flatMap((seed) => seed.permissions),
  )];
  const permissionRecords = await permissionCollection.find({
    code: { $in: requiredRolePermissionCodes },
    isActive: true,
  }).toArray();
  const permissionByCode = new Map(
    permissionRecords.map((permission) => [permission.code, permission._id]),
  );
  const roles = database.collection<{
    _id: DatabaseObjectId;
    code: string;
    facilityId: DatabaseObjectId | null;
    scope: 'FACILITY' | 'GLOBAL';
  }>('roles');
  const affectedRoleIds: DatabaseObjectId[] = [];

  for (const seed of roleSeeds) {
    let role = await roles.findOne({
      code: seed.code,
      facilityId,
      scope: 'FACILITY',
    });
    if (role === null && seed.createWhenMissing) {
      await roles.updateOne(
        { code: seed.code, facilityId, scope: 'FACILITY' },
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
            facilityId,
            scope: 'FACILITY',
            createdBy: actor._id,
            schemaVersion: 1,
            version: 0,
            createdAt: now,
          },
        },
        { upsert: true },
      );
      role = await roles.findOne({
        code: seed.code,
        facilityId,
        scope: 'FACILITY',
      });
    }
    if (role === null) continue;
    affectedRoleIds.push(role._id);

    const rolePermissionCollection = database.collection('rolePermissions');
    for (const permissionCode of seed.permissions) {
      const permissionId = permissionByCode.get(permissionCode);
      if (permissionId === undefined) {
        throw new Error(`Permission ${permissionCode} was not seeded`);
      }
      await rolePermissionCollection.updateOne(
        { roleId: role._id, permissionId },
        {
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
        { upsert: true },
      );
    }
  }

  const assignedUserIds = affectedRoleIds.length === 0
    ? []
    : await database.collection('userRoles').distinct('userId', {
        roleId: { $in: affectedRoleIds },
        isActive: true,
      });
  if (assignedUserIds.length > 0) {
    await database.collection('users').updateMany(
      { _id: { $in: assignedUserIds } },
      {
        $inc: { permissionVersion: 1, version: 1 },
        $currentDate: { updatedAt: true },
      },
    );
  }

  console.info(JSON.stringify({
    success: true,
    facilityId: facilityId.toHexString(),
    permissionCount: definitions.length,
    affectedRoleCount: affectedRoleIds.length,
    invalidatedUserCount: assignedUserIds.length,
  }, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Welfare and Zakat access seed failed',
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });