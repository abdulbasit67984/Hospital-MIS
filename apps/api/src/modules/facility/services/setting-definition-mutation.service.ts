import type {
  ConfigurationCachePort,
} from '../../../infrastructure/configuration-cache.port.js';

import {
  CONFIGURATION_CACHE_NAMESPACE,
} from '../facility.constants.js';

import {
  normalizeSettingKey,
} from '../facility.mapper.js';

import type {
  CreateSettingDefinitionInput,
  FacilityActorContext,
  SettingDefinitionDto,
  UpdateSettingDefinitionInput,
} from '../facility.types.js';

import type {
  SettingDefinitionService,
} from './setting-definition.service.js';

import type {
  CreateSettingDefinitionWorkflow,
} from '../workflows/create-setting-definition.workflow.js';

import type {
  UpdateSettingDefinitionWorkflow,
} from '../workflows/update-setting-definition.workflow.js';

export interface SettingDefinitionMutationServiceOptions {
  queryService:
    SettingDefinitionService;

  createWorkflow:
    CreateSettingDefinitionWorkflow;

  updateWorkflow:
    UpdateSettingDefinitionWorkflow;

  cache:
    ConfigurationCachePort;
}

export class SettingDefinitionMutationService {
  public constructor(
    private readonly options:
      SettingDefinitionMutationServiceOptions,
  ) {}

  public async create(
    input:
      CreateSettingDefinitionInput,

    actor:
      FacilityActorContext,

    idempotencyKey:
      string,
  ): Promise<SettingDefinitionDto> {
    const definition =
      await this.options
        .createWorkflow
        .execute({
          input,
          actor,
          idempotencyKey,
        });

    await this.invalidate(
      definition.key,
    );

    return definition;
  }

  public async update(
    key:
      string,

    input:
      UpdateSettingDefinitionInput,

    actor:
      FacilityActorContext,

    idempotencyKey:
      string,
  ): Promise<SettingDefinitionDto> {
    const definition =
      await this.options
        .updateWorkflow
        .execute({
          key,
          input,
          actor,
          idempotencyKey,
        });

    await this.invalidate(
      definition.key,
    );

    return definition;
  }

  public async invalidate(
    key:
      string,
  ): Promise<void> {
    await this.options
      .queryService
      .invalidate(
        normalizeSettingKey(
          key,
        ),
      );

    /*
     * A definition change can alter validation, activity, cache TTL, default
     * value, or allowed scope. All effective-setting projections are cleared.
     */
    await this.options
      .cache
      .deleteByPrefix(
        `${CONFIGURATION_CACHE_NAMESPACE}:effective-setting:`,
      );
  }
}