import type {
  ConfigurationCachePort,
} from '../../../infrastructure/configuration-cache.port.js';

import {
  CONFIGURATION_CACHE_KEYS,
  CONFIGURATION_CACHE_NAMESPACE,
  SETTING_SCOPE,
  type SettingScope,
} from '../facility.constants.js';

import {
  SettingDefinitionNotFoundError,
  SystemSettingNotFoundError,
} from '../facility.errors.js';

import {
  normalizeSettingKey,
  nullableObjectIdToString,
  toSystemSettingDto,
  toSystemSettingVersionDto,
} from '../facility.mapper.js';

import type {
  FacilitySensitiveSettingCryptoPort,
} from '../facility.ports.js';

import type {
  FacilityActorContext,
  PageResult,
  SettingDefinitionRecord,
  SystemSettingDto,
  SystemSettingListQuery,
  SystemSettingVersionDto,
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
  UpsertSystemSettingInput,
  UpsertSystemSettingWorkflow,
} from '../workflows/upsert-system-setting.workflow.js';

import type {
  FacilityService,
} from './facility.service.js';

import type {
  SettingDefinitionService,
} from './setting-definition.service.js';

export type EffectiveSettingSource =
  | 'FACILITY'
  | 'GLOBAL'
  | 'DEFAULT'
  | 'UNCONFIGURED';

export interface EffectiveSystemSettingDto {
  key:
    string;

  dataType:
    SettingDefinitionRecord['dataType'];

  requestedFacilityId:
    string;

  source:
    EffectiveSettingSource;

  sourceFacilityId:
    string | null;

  settingId:
    string | null;

  value:
    unknown;

  isSensitive:
    boolean;

  isConfigured:
    boolean;

  revision:
    number | null;

  updatedAt:
    string | null;
}

export interface SystemSettingServiceOptions {
  settingRepository:
    SystemSettingRepository;

  versionRepository:
    SystemSettingVersionRepository;

  definitionRepository:
    SettingDefinitionRepository;

  definitionService:
    SettingDefinitionService;

  facilityService:
    FacilityService;

  upsertWorkflow:
    UpsertSystemSettingWorkflow;

  cache:
    ConfigurationCachePort;

  crypto:
    FacilitySensitiveSettingCryptoPort;

  defaultCacheTtlSeconds:
    number;
}

function associatedData(
  input: Readonly<{
    key: string;
    scope: SettingScope;
    facilityId: string | null;
  }>,
): string {
  return [
    'hospital-mis',
    'system-setting',
    input.key,
    input.scope,
    input.facilityId ??
      'global',
  ].join(':');
}

export class SystemSettingService {
  public constructor(
    private readonly options:
      SystemSettingServiceOptions,
  ) {
    if (
      !Number.isSafeInteger(
        options.defaultCacheTtlSeconds,
      ) ||
      options.defaultCacheTtlSeconds <=
        0
    ) {
      throw new TypeError(
        'System-setting cache TTL must be a positive safe integer',
      );
    }
  }

  public async getById(
    settingId:
      string,
  ): Promise<SystemSettingDto> {
    const record =
      await this.options
        .settingRepository
        .findById(
          settingId,
        );

    if (
      record === null
    ) {
      throw new SystemSettingNotFoundError();
    }

    return toSystemSettingDto(
      record,
    );
  }

  public async list(
    query:
      SystemSettingListQuery,
  ): Promise<
    PageResult<SystemSettingDto>
  > {
    const definitions =
      query.category ===
      undefined
        ? undefined
        : await this.definitionsForCategory(
            query.category,
          );

    const page =
      await this.options
        .settingRepository
        .list(
          query,
          definitions,
        );

    return {
      ...page,

      items:
        page.items.map(
          toSystemSettingDto,
        ),
    };
  }

  public async upsert(
    key:
      string,

    input:
      UpsertSystemSettingInput,

    actor:
      FacilityActorContext,

    idempotencyKey:
      string,
  ): Promise<SystemSettingDto> {
    const setting =
      await this.options
        .upsertWorkflow
        .execute({
          key,
          input,
          actor,
          idempotencyKey,
        });

    await this.invalidateAfterMutation(
      setting,
    );

    return setting;
  }

  public async resolveEffective(
    key:
      string,

    facilityId:
      string,
  ): Promise<EffectiveSystemSettingDto> {
    await this.options
      .facilityService
      .assertActive(
        facilityId,
      );

    const normalizedKey =
      normalizeSettingKey(
        key,
      );

    const cacheKey =
      CONFIGURATION_CACHE_KEYS
        .effectiveSetting(
          facilityId,
          normalizedKey,
        );

    const cached =
      await this.options
        .cache
        .get<EffectiveSystemSettingDto>(
          cacheKey,
        );

    if (
      cached !== null
    ) {
      return cached;
    }

    const definition =
      await this.options
        .definitionService
        .getRecordByKey(
          normalizedKey,
        );

    if (
      !definition.isActive
    ) {
      throw new SettingDefinitionNotFoundError();
    }

    const setting =
      await this.options
        .settingRepository
        .findEffective(
          normalizedKey,
          facilityId,
        );

    const effective =
      this.toEffectiveDto(
        definition,
        setting,
        facilityId,
      );

    await this.options
      .cache
      .set(
        cacheKey,
        effective,
        definition.cacheTtlSeconds >
          0
          ? definition.cacheTtlSeconds
          : this.options
              .defaultCacheTtlSeconds,
      );

    return effective;
  }

  public async resolveEffectiveRuntime<T>(
    key:
      string,

    facilityId:
      string,
  ): Promise<T | null> {
    await this.options
      .facilityService
      .assertActive(
        facilityId,
      );

    const normalizedKey =
      normalizeSettingKey(
        key,
      );

    const definition =
      await this.options
        .definitionService
        .getRecordByKey(
          normalizedKey,
        );

    if (
      !definition.isActive
    ) {
      throw new SettingDefinitionNotFoundError();
    }

    const setting =
      await this.options
        .settingRepository
        .findEffective(
          normalizedKey,
          facilityId,
          true,
        );

    if (
      setting === null
    ) {
      return (
        definition.defaultValue ??
        null
      ) as T | null;
    }

    if (
      !setting.isSensitive
    ) {
      return setting.value as
        | T
        | null;
    }

    if (
      setting.encryptedValue ===
      null
    ) {
      return null;
    }

    /*
     * Sensitive plaintext is deliberately not stored in the shared cache.
     */
    return this.options
      .crypto
      .unprotect<T>(
        setting.encryptedValue,
        associatedData({
          key:
            setting.key,

          scope:
            setting.scope,

          facilityId:
            nullableObjectIdToString(
              setting.facilityId,
            ),
        }),
      );
  }

  public async listHistory(
    settingId:
      string,

    input: Readonly<{
      page: number;
      pageSize: number;
      sortDirection:
        | 'asc'
        | 'desc';
    }>,
  ): Promise<
    PageResult<SystemSettingVersionDto>
  > {
    const setting =
      await this.options
        .settingRepository
        .findById(
          settingId,
        );

    if (
      setting === null
    ) {
      throw new SystemSettingNotFoundError();
    }

    const page =
      await this.options
        .versionRepository
        .listBySetting({
          settingId,
          ...input,
        });

    return {
      ...page,

      items:
        page.items.map(
          toSystemSettingVersionDto,
        ),
    };
  }

  private toEffectiveDto(
    definition:
      SettingDefinitionRecord,

    setting:
      Awaited<
        ReturnType<
          SystemSettingRepository[
            'findEffective'
          ]
        >
      >,

    requestedFacilityId:
      string,
  ): EffectiveSystemSettingDto {
    if (
      setting === null
    ) {
      const hasDefault =
        definition.defaultValue !==
          null &&
        definition.defaultValue !==
          undefined;

      return {
        key:
          definition.key,

        dataType:
          definition.dataType,

        requestedFacilityId,

        source:
          hasDefault
            ? 'DEFAULT'
            : 'UNCONFIGURED',

        sourceFacilityId:
          null,

        settingId:
          null,

        value:
          definition.isSensitive
            ? null
            : definition.defaultValue,

        isSensitive:
          definition.isSensitive,

        isConfigured:
          hasDefault,

        revision:
          null,

        updatedAt:
          null,
      };
    }

    return {
      key:
        setting.key,

      dataType:
        definition.dataType,

      requestedFacilityId,

      source:
        setting.scope ===
        SETTING_SCOPE.FACILITY
          ? 'FACILITY'
          : 'GLOBAL',

      sourceFacilityId:
        nullableObjectIdToString(
          setting.facilityId,
        ),

      settingId:
        setting._id.toHexString(),

      value:
        setting.isSensitive
          ? null
          : setting.value,

      isSensitive:
        setting.isSensitive,

      isConfigured:
        setting.isSensitive
          ? setting.encryptedValue !==
              null ||
            setting.valueHash !==
              null
          : setting.value !==
              undefined,

      revision:
        setting.revision,

      updatedAt:
        setting.updatedAt
          .toISOString(),
    };
  }

  private async definitionsForCategory(
    category:
      NonNullable<
        SystemSettingListQuery[
          'category'
        ]
      >,
  ): Promise<
    SettingDefinitionRecord[]
  > {
    const definitions:
      SettingDefinitionRecord[] =
      [];

    let page =
      1;

    for (;;) {
      const result =
        await this.options
          .definitionRepository
          .list({
            category,

            activeOnly:
              false,

            page,

            pageSize:
              100,

            sortBy:
              'key',

            sortDirection:
              'asc',
          });

      definitions.push(
        ...result.items,
      );

      if (
        page >=
        result.totalPages
      ) {
        break;
      }

      page += 1;
    }

    return definitions;
  }

  private async invalidateAfterMutation(
    setting:
      SystemSettingDto,
  ): Promise<void> {
    await this.options
      .cache
      .delete(
        CONFIGURATION_CACHE_KEYS
          .settingScope(
            setting.scope,
            setting.facilityId,
            setting.key,
          ),
      );

    if (
      setting.scope ===
      SETTING_SCOPE.GLOBAL
    ) {
      await this.options
        .cache
        .deleteByPrefix(
          `${CONFIGURATION_CACHE_NAMESPACE}:effective-setting:`,
        );

      return;
    }

    if (
      setting.facilityId !==
      null
    ) {
      await this.options
        .cache
        .delete(
          CONFIGURATION_CACHE_KEYS
            .effectiveSetting(
              setting.facilityId,
              setting.key,
            ),
        );
    }
  }
}