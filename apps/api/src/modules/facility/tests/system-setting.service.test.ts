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
  SETTING_DATA_TYPE,
  SETTING_SCOPE,
} from '../facility.constants.js';

import type {
  SettingDefinitionRecord,
  SystemSettingRecord,
} from '../facility.types.js';

import type {
  SettingDefinitionRepository,
} from '../repositories/setting-definition.repository.js';

import type {
  SystemSettingRepository,
} from '../repositories/system-setting.repository.js';

import type {
  SystemSettingVersionRepository,
} from '../repositories/system-setting-version.repository.js';

import type {
  UpsertSystemSettingWorkflow,
} from '../workflows/upsert-system-setting.workflow.js';

import type {
  FacilityService,
} from '../services/facility.service.js';

import type {
  SettingDefinitionService,
} from '../services/setting-definition.service.js';

import {
  SystemSettingService,
} from '../services/system-setting.service.js';

import {
  InMemoryConfigurationCacheAdapter,
} from '../../../infrastructure/in-memory-configuration-cache.adapter.js';

import {
  SensitiveSettingCryptoService,
} from '../../../infrastructure/sensitive-setting-crypto.service.js';

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

function definition(
  overrides:
    Partial<SettingDefinitionRecord> = {},
): SettingDefinitionRecord {
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
      'regional.currency',

    category:
      SETTING_CATEGORY.REGIONAL,

    dataType:
      SETTING_DATA_TYPE.CURRENCY,

    allowedScopes: [
      SETTING_SCOPE.GLOBAL,
      SETTING_SCOPE.FACILITY,
    ],

    defaultValue:
      'PKR',

    labels: [
      {
        locale:
          'en-PK',

        label:
          'Currency',

        description:
          null,
      },
    ],

    validation: {
      required:
        true,

      minLength:
        3,

      maxLength:
        3,

      pattern:
        '^[A-Z]{3}$',

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
      false,

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

    ...overrides,
  };
}

function publicSetting():
  SystemSettingRecord {
  const now =
    new Date(
      '2026-07-17T10:30:00.000Z',
    );

  return {
    _id:
      new Types.ObjectId(
        '507f1f77bcf86cd799439041',
      ),

    definitionId:
      definition()._id,

    key:
      'regional.currency',

    scope:
      SETTING_SCOPE.FACILITY,

    facilityId:
      new Types.ObjectId(
        '507f1f77bcf86cd799439011',
      ),

    value:
      'USD',

    encryptedValue:
      null,

    valueHash:
      'hash',

    isSensitive:
      false,

    revision:
      2,

    isActive:
      true,

    schemaVersion:
      1,

    version:
      1,

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

describe(
  'SystemSettingService',
  () => {
    it(
      'returns facility scope before global and falls back to definition defaults',
      async () => {
        const cache =
          new InMemoryConfigurationCacheAdapter();

        const findEffective =
          vi.fn()
            .mockResolvedValueOnce(
              publicSetting(),
            )
            .mockResolvedValueOnce(
              null,
            );

        const settingRepository = {
          findEffective,
        } as unknown as SystemSettingRepository;

        const definitionService = {
          getRecordByKey:
            vi.fn()
              .mockResolvedValue(
                definition(),
              ),
        } as unknown as SettingDefinitionService;

        const facilityService = {
          assertActive:
            vi.fn()
              .mockResolvedValue(
                {},
              ),
        } as unknown as FacilityService;

        const crypto =
          new SensitiveSettingCryptoService({
            activeKeyVersion:
              'v1',

            keys: {
              v1:
                base64Key(
                  1,
                ),
            },

            hashSecret:
              'system-setting-service-hash-secret-with-more-than-thirty-two-characters',
          });

        const service =
          new SystemSettingService({
            settingRepository,

            versionRepository:
              {} as SystemSettingVersionRepository,

            definitionRepository:
              {} as SettingDefinitionRepository,

            definitionService,

            facilityService,

            upsertWorkflow:
              {} as UpsertSystemSettingWorkflow,

            cache,

            crypto,

            defaultCacheTtlSeconds:
              300,
          });

        const facilityResult =
          await service.resolveEffective(
            'regional.currency',
            '507f1f77bcf86cd799439011',
          );

        expect(
          facilityResult.source,
        ).toBe(
          'FACILITY',
        );

        expect(
          facilityResult.value,
        ).toBe(
          'USD',
        );

        await cache.clear();

        const defaultResult =
          await service.resolveEffective(
            'regional.currency',
            '507f1f77bcf86cd799439012',
          );

        expect(
          defaultResult.source,
        ).toBe(
          'DEFAULT',
        );

        expect(
          defaultResult.value,
        ).toBe(
          'PKR',
        );
      },
    );

    it(
      'masks sensitive API results but decrypts through the trusted runtime method',
      async () => {
        const cache =
          new InMemoryConfigurationCacheAdapter();

        const sensitiveDefinition =
          definition({
            key:
              'integrations.sms.api_key',

            category:
              SETTING_CATEGORY.INTEGRATIONS,

            dataType:
              SETTING_DATA_TYPE.SECRET,

            defaultValue:
              null,

            isSensitive:
              true,

            allowedScopes: [
              SETTING_SCOPE.FACILITY,
            ],
          });

        const crypto =
          new SensitiveSettingCryptoService({
            activeKeyVersion:
              'v1',

            keys: {
              v1:
                base64Key(
                  2,
                ),
            },

            hashSecret:
              'sensitive-runtime-hash-secret-with-more-than-thirty-two-characters',

            randomBytes:
              (size) =>
                Buffer.alloc(
                  size,
                  3,
                ),
          });

        const facilityId =
          '507f1f77bcf86cd799439011';

        const data = [
          'hospital-mis',
          'system-setting',
          sensitiveDefinition.key,
          SETTING_SCOPE.FACILITY,
          facilityId,
        ].join(':');

        const protectedValue =
          crypto.protect(
            'runtime-secret',
            data,
          );

        const setting:
          SystemSettingRecord = {
          ...publicSetting(),

          key:
            sensitiveDefinition.key,

          definitionId:
            sensitiveDefinition._id,

          value:
            null,

          encryptedValue:
            protectedValue.encryptedValue,

          valueHash:
            protectedValue.valueHash,

          isSensitive:
            true,

          revision:
            1,
        };

        const settingRepository = {
          findEffective:
            vi.fn()
              .mockResolvedValue(
                setting,
              ),
        } as unknown as SystemSettingRepository;

        const definitionService = {
          getRecordByKey:
            vi.fn()
              .mockResolvedValue(
                sensitiveDefinition,
              ),
        } as unknown as SettingDefinitionService;

        const service =
          new SystemSettingService({
            settingRepository,

            versionRepository:
              {} as SystemSettingVersionRepository,

            definitionRepository:
              {} as SettingDefinitionRepository,

            definitionService,

            facilityService: {
              assertActive:
                vi.fn()
                  .mockResolvedValue(
                    {},
                  ),
            } as unknown as FacilityService,

            upsertWorkflow:
              {} as UpsertSystemSettingWorkflow,

            cache,

            crypto,

            defaultCacheTtlSeconds:
              300,
          });

        const publicResult =
          await service.resolveEffective(
            sensitiveDefinition.key,
            facilityId,
          );

        expect(
          publicResult.value,
        ).toBeNull();

        expect(
          publicResult.isConfigured,
        ).toBe(true);

        const runtimeResult =
          await service
            .resolveEffectiveRuntime<string>(
              sensitiveDefinition.key,
              facilityId,
            );

        expect(
          runtimeResult,
        ).toBe(
          'runtime-secret',
        );
      },
    );
  },
);