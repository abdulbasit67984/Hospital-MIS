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
} from '@hospital-mis/database';

import {
  permissionDefinitions,
  type PermissionKey,
} from '@hospital-mis/permissions';

const environmentSchema =
  z.object({
    IDENTITY_FACILITY_ID:
      z
        .string()
        .regex(
          /^[a-f\d]{24}$/iu,
        ),

    RADIOLOGY_ACCESS_SEED_ACTOR_USER_ID:
      z
        .string()
        .regex(
          /^[a-f\d]{24}$/iu,
        ),
  });

const radiologyPermissionKeys = [
  'radiology.catalog.read',
  'radiology.catalog.manage',
  'radiology.orders.read',
  'radiology.orders.create',
  'radiology.orders.manage',
  'radiology.orders.cancel',
  'radiology.schedules.read',
  'radiology.schedules.manage',
  'radiology.safety_screening.read',
  'radiology.safety_screening.manage',
  'radiology.examinations.read',
  'radiology.examinations.manage',
  'radiology.studies.read',
  'radiology.studies.manage',
  'radiology.reports.read',
  'radiology.reports.enter',
  'radiology.reports.review',
  'radiology.reports.verify',
  'radiology.reports.amend',
  'radiology.reports.publish',
  'radiology.reports.withdraw',
  'radiology.reports.print',
  'radiology.critical_findings.notify',
  'radiology.critical_findings.acknowledge',
] as const satisfies readonly PermissionKey[];

interface RoleGrant {
  code:
    string;

  name:
    string;

  description:
    string;

  permissions:
    readonly PermissionKey[];
}

const roleGrants:
  readonly RoleGrant[] = [
    {
      code:
        'RADIOLOGY_MANAGER',

      name:
        'Radiology Manager',

      description:
        'Manages the facility Radiology catalog, operations, reports, and critical-finding workflows',

      permissions:
        radiologyPermissionKeys,
    },
    {
      code:
        'RADIOLOGIST',

      name:
        'Radiologist',

      description:
        'Reviews studies, authors and verifies reports, communicates critical findings, and publishes finalized reports',

      permissions: [
        'radiology.catalog.read',
        'radiology.orders.read',
        'radiology.orders.manage',
        'radiology.schedules.read',
        'radiology.safety_screening.read',
        'radiology.examinations.read',
        'radiology.studies.read',
        'radiology.reports.read',
        'radiology.reports.enter',
        'radiology.reports.review',
        'radiology.reports.verify',
        'radiology.reports.amend',
        'radiology.reports.publish',
        'radiology.reports.withdraw',
        'radiology.reports.print',
        'radiology.critical_findings.notify',
        'radiology.critical_findings.acknowledge',
      ],
    },
    {
      code:
        'RADIOLOGY_TECHNOLOGIST',

      name:
        'Radiology Technologist',

      description:
        'Performs safety screening, patient check-in, examinations, contrast-use requests, and external study registration',

      permissions: [
        'radiology.catalog.read',
        'radiology.orders.read',
        'radiology.orders.manage',
        'radiology.schedules.read',
        'radiology.safety_screening.read',
        'radiology.safety_screening.manage',
        'radiology.examinations.read',
        'radiology.examinations.manage',
        'radiology.studies.read',
        'radiology.studies.manage',
        'radiology.reports.read',
        'radiology.critical_findings.notify',
      ],
    },
    {
      code:
        'RADIOLOGY_SCHEDULER',

      name:
        'Radiology Scheduler',

      description:
        'Accepts orders and manages Radiology appointments, rooms, equipment, and technician allocations',

      permissions: [
        'radiology.catalog.read',
        'radiology.orders.read',
        'radiology.orders.manage',
        'radiology.orders.cancel',
        'radiology.schedules.read',
        'radiology.schedules.manage',
        'radiology.safety_screening.read',
      ],
    },
    {
      code:
        'CLINICAL_DOCTOR',

      name:
        'Clinical Doctor',

      description:
        'Orders Radiology procedures and reads or acknowledges published findings for assigned encounters',

      permissions: [
        'radiology.catalog.read',
        'radiology.orders.read',
        'radiology.orders.create',
        'radiology.reports.read',
        'radiology.reports.print',
        'radiology.critical_findings.acknowledge',
      ],
    },
    {
      code:
        'MEDICAL_RECORDS_OFFICER',

      name:
        'Medical Records Officer',

      description:
        'Reads and prints published Radiology reports under minimum-necessary access controls',

      permissions: [
        'radiology.orders.read',
        'radiology.reports.read',
        'radiology.reports.print',
      ],
    },
  ];

async function seed(): Promise<void> {
  const environment =
    environmentSchema.parse(
      process.env,
    );

  const config =
    loadApiConfig();

  await connectDatabase({
    uri:
      config.mongodbUri,

    appName:
      `${config.mongodbAppName}-seed-radiology-access`,

    serverSelectionTimeoutMs:
      config.mongodbServerSelectionTimeoutMs,
  });

  const database =
    nativeDatabase();

  const facilityId =
    toObjectId(
      environment.IDENTITY_FACILITY_ID,
      'IDENTITY_FACILITY_ID',
    );

  const actorUserId =
    toObjectId(
      environment.RADIOLOGY_ACCESS_SEED_ACTOR_USER_ID,
      'RADIOLOGY_ACCESS_SEED_ACTOR_USER_ID',
    );

  const now =
    new Date();

  const definitionsByKey =
    new Map(
      permissionDefinitions.map(
        (
          definition,
        ) => [
          definition.key,
          definition,
        ],
      ),
    );

  for (
    const permissionKey of
    radiologyPermissionKeys
  ) {
    const definition =
      definitionsByKey.get(
        permissionKey,
      );

    if (
      definition ==
      null
    ) {
      throw new Error(
        `Permission ${permissionKey} is missing from @hospital-mis/permissions`,
      );
    }

    await database
      .collection(
        'permissions',
      )
      .updateOne(
        {
          code:
            permissionKey,
        },
        {
          $setOnInsert: {
            _id:
              createObjectId(),

            code:
              permissionKey,

            schemaVersion:
              1,

            version:
              0,

            createdAt:
              now,
          },

          $set: {
            name:
              definition.description,

            module:
              'radiology',

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
        },
        {
          upsert:
            true,
        },
      );
  }

  const permissionDocuments =
    await database
      .collection(
        'permissions',
      )
      .find({
        code: {
          $in: [
            ...radiologyPermissionKeys,
          ],
        },
      })
      .project({
        _id:
          1,

        code:
          1,
      })
      .toArray();

  const permissionIds =
    new Map(
      permissionDocuments.map(
        (
          permission,
        ) => [
          String(
            permission[
              'code'
            ],
          ),

          permission[
            '_id'
          ],
        ],
      ),
    );

  for (
    const grant of
    roleGrants
  ) {
    const role =
      await database
        .collection(
          'roles',
        )
        .findOneAndUpdate(
          {
            scope:
              'FACILITY',

            facilityId,

            code:
              grant.code,
          },
          {
            $setOnInsert: {
              _id:
                createObjectId(),

              facilityId,

              code:
                grant.code,

              scope:
                'FACILITY',

              isSystem:
                true,

              schemaVersion:
                1,

              version:
                0,

              createdBy:
                actorUserId,

              createdAt:
                now,
            },

            $set: {
              name:
                grant.name,

              description:
                grant.description,

              isActive:
                true,

              updatedBy:
                actorUserId,

              updatedAt:
                now,
            },
          },
          {
            upsert:
              true,

            returnDocument:
              'after',
          },
        );

    if (
      role ===
      null
    ) {
      throw new Error(
        `Role ${grant.code} could not be seeded`,
      );
    }

    for (
      const permissionCode of
      grant.permissions
    ) {
      const permissionId =
        permissionIds.get(
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

      await database
        .collection(
          'rolePermissions',
        )
        .updateOne(
          {
            roleId:
              role[
                '_id'
              ],

            permissionId,
          },
          {
            $setOnInsert: {
              _id:
                createObjectId(),

              roleId:
                role[
                  '_id'
                ],

              permissionId,

              grantedBy:
                actorUserId,

              grantedAt:
                now,

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
  }
}

try {
  await seed();

  console.info(
    'Radiology permissions and role grants seeded',
  );
} finally {
  await disconnectDatabase();
}