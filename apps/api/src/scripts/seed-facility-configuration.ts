import 'dotenv/config';

import {
  z,
} from 'zod';

import {
  loadApiConfig,
} from '@hospital-mis/config';

import {
  loadFacilityConfigurationConfig,
} from '@hospital-mis/config/facility-configuration';

import {
  connectDatabase,
  disconnectDatabase,
  nativeDatabase,
  toObjectId,
} from '@hospital-mis/database';

import {
  seedFacilityConfiguration,
} from '../modules/facility/facility.seed.js';

const environmentSchema =
  z.object({
    FACILITY_SEED_FACILITY_ID:
      z
        .string()
        .regex(
          /^[a-f\d]{24}$/i,
        )
        .optional(),

    ADMIN_FACILITY_ID:
      z
        .string()
        .regex(
          /^[a-f\d]{24}$/i,
        )
        .optional(),

    FACILITY_SEED_ACTOR_USER_ID:
      z
        .string()
        .regex(
          /^[a-f\d]{24}$/i,
        )
        .optional(),

    ADMIN_USERNAME:
      z
        .string()
        .trim()
        .min(3)
        .max(80)
        .default(
          'admin',
        ),

    FACILITY_SEED_CODE:
      z
        .string()
        .trim()
        .min(2)
        .max(40)
        .default(
          'MAIN',
        ),

    FACILITY_SEED_NAME:
      z
        .string()
        .trim()
        .min(2)
        .max(200)
        .default(
          'Main Hospital',
        ),

    FACILITY_SEED_LEGAL_NAME:
      z
        .string()
        .trim()
        .min(2)
        .max(240)
        .default(
          'Main Hospital Limited',
        ),

    FACILITY_SEED_SMS_API_KEY:
      z
        .string()
        .min(8)
        .max(500)
        .optional(),
  });

function normalizeLogin(
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

async function resolveActorUserId(
  input: Readonly<{
    explicitActorUserId?:
      string;

    adminUsername:
      string;
  }>,
): Promise<string | null> {
  if (
    input.explicitActorUserId !==
    undefined
  ) {
    return toObjectId(
      input.explicitActorUserId,
      'FACILITY_SEED_ACTOR_USER_ID',
    ).toHexString();
  }

  const database =
    nativeDatabase();

  const admin =
    await database
      .collection<{
        _id:
          ReturnType<
            typeof toObjectId
          >;
      }>(
        'users',
      )
      .findOne({
        normalizedUsername:
          normalizeLogin(
            input.adminUsername,
          ),
      });

  return admin?._id.toHexString() ??
    null;
}

async function main():
  Promise<void> {
  const apiConfig =
    loadApiConfig();

  const facilityConfiguration =
    loadFacilityConfigurationConfig();

  const environment =
    environmentSchema.parse(
      process.env,
    );

  await connectDatabase({
    uri:
      apiConfig.mongodbUri,

    appName:
      `${apiConfig.mongodbAppName}-facility-configuration-seed`,

    serverSelectionTimeoutMs:
      apiConfig.mongodbServerSelectionTimeoutMs,
  });

  try {
    const actorUserId =
      await resolveActorUserId({
        explicitActorUserId:
          environment
            .FACILITY_SEED_ACTOR_USER_ID,

        adminUsername:
          environment
            .ADMIN_USERNAME,
      });

    const result =
      await seedFacilityConfiguration({
        database:
          nativeDatabase(),

        configuration:
          facilityConfiguration,

        facilityId:
          environment
            .FACILITY_SEED_FACILITY_ID ??
          environment
            .ADMIN_FACILITY_ID,

        actorUserId,

        facilityCode:
          environment
            .FACILITY_SEED_CODE,

        facilityName:
          environment
            .FACILITY_SEED_NAME,

        legalName:
          environment
            .FACILITY_SEED_LEGAL_NAME,

        smsApiKey:
          environment
            .FACILITY_SEED_SMS_API_KEY,
      });

    console.log(
      JSON.stringify(
        {
          message:
            'Facility and configuration seed completed',

          actorUserId:
            actorUserId ??
            'SYSTEM_SEED',

          facility:
            result.facility,

          departmentCount:
            result.departments.total,

          definitionCount:
            result.definitions.total,

          settings:
            result.settings,
        },
        null,
        2,
      ),
    );
  } finally {
    await disconnectDatabase();
  }
}

await main();