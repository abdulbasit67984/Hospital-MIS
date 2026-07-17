import {
  Types,
} from 'mongoose';

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  SETTING_CATEGORY,
  SETTING_CHANGE_TYPE,
  SETTING_DATA_TYPE,
  SETTING_SCOPE,
} from '../facility.constants.js';

import type {
  FacilityMutationDependencies,
  FacilityTransactionManagerPort,
  FacilityTransactionRequest,
} from '../facility.ports.js';

import {
  FACILITY_COMPENSATION_TYPES,
} from '../facility.transaction.constants.js';

import type {
  FacilityRecord,
  SettingDefinitionRecord,
  SystemSettingRecord,
  SystemSettingVersionRecord,
} from '../facility.types.js';

import type {
  FacilityRepository,
} from '../repositories/facility.repository.js';

import type {
  SettingDefinitionRepository,
} from '../repositories/setting-definition.repository.js';

import type {
  SystemSettingRepository,
} from '../repositories/system-setting.repository.js';

import type {
  SystemSettingVersionRepository,
} from '../repositories/system-setting-version.repository.js';

import {
  SensitiveSettingCryptoService,
} from '../../../infrastructure/sensitive-setting-crypto.service.js';

import {
  UpsertSystemSettingWorkflow,
} from '../workflows/upsert-system-setting.workflow.js';

function base64Key(
  byte: number,
): string {
  return Buffer
    .alloc(
      32,
      byte,
    )
    .toString(
      'base64',
    );
}

function definition():
  SettingDefinitionRecord {
  const now =
    new Date(
      '2026-07-17T10:00:00.000Z',
    );

  return {
    _id:
      new Types.ObjectId(
        '507f1f77bcf86cd799439031',
      ),

    key:
      'integrations.sms.api_key',

    category:
      SETTING_CATEGORY.INTEGRATIONS,

    dataType:
      SETTING_DATA_TYPE.SECRET,

    allowedScopes: [
      SETTING_SCOPE.FACILITY,
    ],

    defaultValue:
      null,

    labels: [
      {
        locale:
          'en-PK',

        label:
          'SMS API key',

        description:
          null,
      },
    ],

    validation: {
      required:
        true,

      minLength:
        8,

      maxLength:
        200,

      pattern:
        null,

      minimum:
        null,

      maximum:
        null,

      allowedValues:
        [],

      jsonSchema:
        null,
    },

    isSensitive:
      true,

    isMutable:
      true,

    isActive:
      true,

    cacheTtlSeconds:
      300,

    schemaVersion:
      1,

    version:
      0,

    createdBy:
      null,

    updatedBy:
      null,

    createdAt:
      now,

    updatedAt:
      now,
  };
}

function activeFacility():
  FacilityRecord {
  const now =
    new Date(
      '2026-07-17T10:00:00.000Z',
    );

  return {
    _id:
      new Types.ObjectId(
        '507f1f77bcf86cd799439011',
      ),

    code:
      'MAIN',

    name:
      'Main Hospital',

    legalName:
      null,

    facilityType:
      'HOSPITAL',

    parentFacilityId:
      null,

    identifiers:
      [],

    timezone:
      'Asia/Karachi',

    currency:
      'PKR',

    locale:
      'en-PK',

    supportedLocales: [
      'en-PK',
    ],

    address: {
      line1:
        null,

      line2:
        null,

      city:
        'Lahore',

      district:
        null,

      province:
        'Punjab',

      postalCode:
        null,

      countryCode:
        'PK',
    },

    contact: {
      primaryPhone:
        null,

      secondaryPhone:
        null,

      email:
        null,

      website:
        null,

      emergencyPhone:
        null,
    },

    status:
      'ACTIVE',

    allowsAuthentication:
      true,

    deactivatedAt:
      null,

    deactivatedBy:
      null,

    deactivationReason:
      null,

    schemaVersion:
      1,

    version:
      0,

    createdBy:
      null,

    updatedBy:
      null,

    createdAt:
      now,

    updatedAt:
      now,
  };
}

function dependencies() {
  const registerCompensation =
    vi.fn()
      .mockResolvedValue(
        undefined,
      );

  const checkpoint =
    vi.fn()
      .mockResolvedValue(
        undefined,
      );

  const execute =
    vi.fn(
      async (
        request:
          FacilityTransactionRequest<unknown>,
      ) =>
        request.execute({
          transactionId:
            'transaction-setting-1',

          idempotencyKey:
            request.idempotencyKey,

          registerCompensation,

          checkpoint,
        }),
    );

  const audit =
    vi.fn()
      .mockResolvedValue(
        undefined,
      );

  const outbox =
    vi.fn()
      .mockResolvedValue(
        undefined,
      );

  const result:
    FacilityMutationDependencies = {
    transactionManager: {
      execute,
    } as FacilityTransactionManagerPort,

    audit: {
      append:
        audit,
    },

    outbox: {
      enqueue:
        outbox,
    },

    clock: {
      now:
        () =>
          new Date(
            '2026-07-17T10:30:00.000Z',
          ),
    },
  };

  return {
    result,
    execute,
    registerCompensation,
    checkpoint,
    audit,
    outbox,
  };
}

describe(
  'configuration setting workflows',
  () => {
    it(
      'encrypts sensitive values before persistence and masks external records',
      async () => {
        const fixture =
          dependencies();

        const settingId =
          new Types.ObjectId(
            '507f1f77bcf86cd799439041',
          );

        const versionId =
          new Types.ObjectId(
            '507f1f77bcf86cd799439042',
          );

        let createdInput:
          Record<string, unknown> | undefined;

        const definitionRepository = {
          findByKey:
            vi.fn()
              .mockResolvedValue(
                definition(),
              ),
        } as unknown as SettingDefinitionRepository;

        const settingRepository = {
          findByScope:
            vi.fn()
              .mockResolvedValue(
                null,
              ),

          create:
            vi.fn(
              async (
                input:
                  Record<string, unknown>,
              ) => {
                createdInput =
                  input;

                return {
                  _id:
                    settingId,

                  definitionId:
                    definition()._id,

                  key:
                    definition().key,

                  scope:
                    SETTING_SCOPE.FACILITY,

                  facilityId:
                    activeFacility()._id,

                  value:
                    null,

                  encryptedValue:
                    input['encryptedValue'],

                  valueHash:
                    input['valueHash'],

                  isSensitive:
                    true,

                  revision:
                    1,

                  isActive:
                    true,

                  schemaVersion:
                    1,

                  version:
                    0,

                  createdBy:
                    new Types.ObjectId(
                      '507f191e810c19729de860ea',
                    ),

                  updatedBy:
                    new Types.ObjectId(
                      '507f191e810c19729de860ea',
                    ),

                  createdAt:
                    new Date(
                      '2026-07-17T10:30:00.000Z',
                    ),

                  updatedAt:
                    new Date(
                      '2026-07-17T10:30:00.000Z',
                    ),
                } as SystemSettingRecord;
              },
            ),
        } as unknown as SystemSettingRepository;

        const versionRepository = {
          append:
            vi.fn()
              .mockResolvedValue({
                _id:
                  versionId,

                settingId,

                definitionId:
                  definition()._id,

                key:
                  definition().key,

                scope:
                  SETTING_SCOPE.FACILITY,

                facilityId:
                  activeFacility()._id,

                revision:
                  1,

                changeType:
                  SETTING_CHANGE_TYPE.CREATED,

                changeSource:
                  'USER',

                value:
                  null,

                encryptedValue:
                  null,

                valueHash:
                  'hash',

                isSensitive:
                  true,

                isActive:
                  true,

                changedBy:
                  new Types.ObjectId(
                    '507f191e810c19729de860ea',
                  ),

                changeReason:
                  'Configure SMS integration',

                correlationId:
                  'correlation-1',

                changedAt:
                  new Date(),

                schemaVersion:
                  1,

                createdAt:
                  new Date(),
              } as SystemSettingVersionRecord),
        } as unknown as SystemSettingVersionRepository;

        const facilityRepository = {
          findById:
            vi.fn()
              .mockResolvedValue(
                activeFacility(),
              ),
        } as unknown as FacilityRepository;

        const crypto =
          new SensitiveSettingCryptoService({
            activeKeyVersion:
              'v1',

            keys: {
              v1:
                base64Key(
                  7,
                ),
            },

            hashSecret:
              'setting-workflow-hash-secret-with-more-than-thirty-two-characters',

            randomBytes:
              (size) =>
                Buffer.alloc(
                  size,
                  9,
                ),
          });

        const workflow =
          new UpsertSystemSettingWorkflow(
            definitionRepository,
            settingRepository,
            versionRepository,
            facilityRepository,
            crypto,
            fixture.result,
          );

        const result =
          await workflow.execute({
            key:
              definition().key,

            input: {
              scope:
                SETTING_SCOPE.FACILITY,

              facilityId:
                activeFacility()
                  ._id
                  .toHexString(),

              value:
                'super-secret-api-key',

              expectedVersion:
                null,

              expectedRevision:
                null,

              reason:
                'Configure SMS integration',
            },

            actor: {
              userId:
                '507f191e810c19729de860ea',

              facilityId:
                activeFacility()
                  ._id
                  .toHexString(),

              correlationId:
                'correlation-1',
            },

            idempotencyKey:
              'configure-sms-0001',
          });

        expect(
          createdInput?.['value'],
        ).toBeNull();

        expect(
          JSON.stringify(
            createdInput?.[
              'encryptedValue'
            ],
          ),
        ).not.toContain(
          'super-secret-api-key',
        );

        expect(
          result.value,
        ).toBeNull();

        expect(
          result.isConfigured,
        ).toBe(true);

        const transactionRequest =
          fixture.execute.mock
            .calls[0]?.[0] as
            | FacilityTransactionRequest<unknown>
            | undefined;

        expect(
          JSON.stringify(
            transactionRequest?.payload,
          ),
        ).not.toContain(
          'super-secret-api-key',
        );

        expect(
          fixture.registerCompensation,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            type:
              FACILITY_COMPENSATION_TYPES
                .DELETE_CREATED_SYSTEM_SETTING,
          }),
        );

        expect(
          fixture.registerCompensation,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            type:
              FACILITY_COMPENSATION_TYPES
                .DELETE_SYSTEM_SETTING_VERSION,
          }),
        );

        const auditInput =
          fixture.audit.mock
            .calls[0]?.[0];

        expect(
          JSON.stringify(
            auditInput,
          ),
        ).not.toContain(
          'super-secret-api-key',
        );

        const outboxInput =
          fixture.outbox.mock
            .calls[0]?.[0];

        expect(
          JSON.stringify(
            outboxInput,
          ),
        ).not.toContain(
          'super-secret-api-key',
        );
      },
    );
  },
);