import type {
  ConfigurationCachePort,
} from '../../../infrastructure/configuration-cache.port.js';

import {
  CONFIGURATION_CACHE_KEYS,
} from '../facility.constants.js';

import {
  SettingDefinitionNotFoundError,
} from '../facility.errors.js';

import {
  normalizeSettingKey,
  toSettingDefinitionDto,
} from '../facility.mapper.js';

import {
  assertSettingScopeAllowed,
  validateSettingValue,
  type ValidatedSettingValue,
} from '../facility.setting-value.js';

import type {
  PageResult,
  SettingDefinitionDto,
  SettingDefinitionListQuery,
  SettingDefinitionRecord,
} from '../facility.types.js';

import type {
  SettingScope,
} from '../facility.constants.js';

import type {
  SettingDefinitionRepository,
} from '../repositories/setting-definition.repository.js';

export interface SettingDefinitionServiceOptions {
  defaultCacheTtlSeconds:
    number;
}

export class SettingDefinitionService {
  public constructor(
    private readonly repository:
      SettingDefinitionRepository,

    private readonly cache:
      ConfigurationCachePort,

    private readonly options:
      SettingDefinitionServiceOptions,
  ) {
    if (
      !Number.isSafeInteger(
        options.defaultCacheTtlSeconds,
      ) ||
      options.defaultCacheTtlSeconds <=
        0
    ) {
      throw new TypeError(
        'Setting-definition cache TTL must be a positive safe integer',
      );
    }
  }

  public async getRecordByKey(
    key:
      string,
  ): Promise<SettingDefinitionRecord> {
    const normalizedKey =
      normalizeSettingKey(
        key,
      );

    const record =
      await this.repository.findByKey(
        normalizedKey,
      );

    if (
      record === null
    ) {
      throw new SettingDefinitionNotFoundError();
    }

    return record;
  }

  public async getByKey(
    key:
      string,
  ): Promise<SettingDefinitionDto> {
    const normalizedKey =
      normalizeSettingKey(
        key,
      );

    const cacheKey =
      CONFIGURATION_CACHE_KEYS.definition(
        normalizedKey,
      );

    const cached =
      await this.cache.get<SettingDefinitionDto>(
        cacheKey,
      );

    if (
      cached !== null
    ) {
      return cached;
    }

    const record =
      await this.getRecordByKey(
        normalizedKey,
      );

    const definition =
      toSettingDefinitionDto(
        record,
      );

    await this.cache.set(
      cacheKey,
      definition,
      record.cacheTtlSeconds >
        0
        ? record.cacheTtlSeconds
        : this.options
            .defaultCacheTtlSeconds,
    );

    return definition;
  }

  public async getById(
    definitionId:
      string,
  ): Promise<SettingDefinitionDto> {
    const record =
      await this.repository.findById(
        definitionId,
      );

    if (
      record === null
    ) {
      throw new SettingDefinitionNotFoundError();
    }

    const definition =
      toSettingDefinitionDto(
        record,
      );

    await this.cache.set(
      CONFIGURATION_CACHE_KEYS.definition(
        definition.key,
      ),
      definition,
      record.cacheTtlSeconds >
        0
        ? record.cacheTtlSeconds
        : this.options
            .defaultCacheTtlSeconds,
    );

    return definition;
  }

  public async list(
    query:
      SettingDefinitionListQuery,
  ): Promise<
    PageResult<SettingDefinitionDto>
  > {
    const page =
      await this.repository.list(
        query,
      );

    return {
      ...page,

      items:
        page.items.map(
          toSettingDefinitionDto,
        ),
    };
  }

  public async validateValue(
    key:
      string,
    scope:
      SettingScope,
    value:
      unknown,
  ): Promise<ValidatedSettingValue> {
    const definition =
      await this.getRecordByKey(
        key,
      );

    if (
      !definition.isActive
    ) {
      throw new SettingDefinitionNotFoundError();
    }

    assertSettingScopeAllowed(
      definition,
      scope,
    );

    return validateSettingValue(
      definition,
      value,
    );
  }

  public async invalidate(
    key:
      string,
  ): Promise<void> {
    await this.cache.delete(
      CONFIGURATION_CACHE_KEYS.definition(
        normalizeSettingKey(
          key,
        ),
      ),
    );
  }
}