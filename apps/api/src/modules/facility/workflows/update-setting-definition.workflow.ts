import {
  ConflictError,
} from '@hospital-mis/shared';

import {
  ImmutableSettingDefinitionError,
  InvalidSettingValueError,
  SettingDefinitionConcurrencyError,
  SettingDefinitionNotFoundError,
} from '../facility.errors.js';

import {
  normalizeSettingKey,
  nullableObjectIdToString,
  toSettingDefinitionDto,
} from '../facility.mapper.js';

import {
  buildFacilityAuditActorFields,
  type FacilityMutationDependencies,
} from '../facility.ports.js';

import {
  validateSettingValue,
} from '../facility.setting-value.js';

import {
  FACILITY_AUDIT_ACTIONS,
  FACILITY_COMPENSATION_TYPES,
  FACILITY_OUTBOX_EVENTS,
  FACILITY_TRANSACTION_CHECKPOINTS,
  FACILITY_TRANSACTION_TYPES,
} from '../facility.transaction.constants.js';

import type {
  FacilityActorContext,
  SettingDefinitionDto,
  SettingDefinitionRecord,
  UpdateSettingDefinitionInput,
} from '../facility.types.js';

import {
  requireActorFacilityId,
} from '../facility.workflow-helpers.js';

import type {
  SettingDefinitionRepository,
} from '../repositories/setting-definition.repository.js';

import type {
  SystemSettingRepository,
} from '../repositories/system-setting.repository.js';

function mergedDefinition(
  current:
    SettingDefinitionRecord,

  input:
    UpdateSettingDefinitionInput,
): SettingDefinitionRecord {
  return {
    ...current,

    category:
      input.category ??
      current.category,

    allowedScopes:
      input.allowedScopes ===
      undefined
        ? current.allowedScopes
        : [
            ...new Set(
              input.allowedScopes,
            ),
          ],

    defaultValue:
      input.defaultValue ===
      undefined
        ? current.defaultValue
        : input.defaultValue,

    labels:
      input.labels ??
      current.labels,

    validation:
      input.validation ??
      current.validation,

    isMutable:
      input.isMutable ??
      current.isMutable,

    isActive:
      input.isActive ??
      current.isActive,

    cacheTtlSeconds:
      input.cacheTtlSeconds ??
      current.cacheTtlSeconds,
  };
}

function validateDefinition(
  definition:
    SettingDefinitionRecord,
): void {
  if (
    definition.isSensitive &&
    definition.defaultValue !== null &&
    definition.defaultValue !== undefined
  ) {
    throw new InvalidSettingValueError(
      'Sensitive setting definitions cannot contain plaintext default values',
      'body.defaultValue',
    );
  }

  if (
    definition.defaultValue !== null &&
    definition.defaultValue !== undefined
  ) {
    validateSettingValue(
      definition,
      definition.defaultValue,
    );
  }
}

function changedFields(
  before:
    SettingDefinitionDto,

  after:
    SettingDefinitionDto,
): string[] {
  const fields:
    readonly (
      keyof SettingDefinitionDto
    )[] = [
    'category',
    'allowedScopes',
    'defaultValue',
    'labels',
    'validation',
    'isMutable',
    'isActive',
    'cacheTtlSeconds',
  ];

  return fields
    .filter(
      (field) =>
        JSON.stringify(
          before[field],
        ) !==
        JSON.stringify(
          after[field],
        ),
    )
    .map(String);
}

function previousSnapshot(
  current:
    SettingDefinitionRecord,
): Record<string, unknown> {
  return {
    category:
      current.category,

    allowedScopes:
      current.allowedScopes,

    defaultValue:
      current.defaultValue,

    labels:
      current.labels,

    validation:
      current.validation,

    isMutable:
      current.isMutable,

    isActive:
      current.isActive,

    cacheTtlSeconds:
      current.cacheTtlSeconds,

    version:
      current.version,

    updatedBy:
      nullableObjectIdToString(
        current.updatedBy,
      ),

    updatedAt:
      current.updatedAt.toISOString(),
  };
}

export interface UpdateSettingDefinitionCommand {
  key:
    string;

  input:
    UpdateSettingDefinitionInput;

  actor:
    FacilityActorContext;

  idempotencyKey:
    string;
}

export class UpdateSettingDefinitionWorkflow {
  public constructor(
    private readonly definitionRepository:
      SettingDefinitionRepository,

    private readonly settingRepository:
      SystemSettingRepository,

    private readonly dependencies:
      FacilityMutationDependencies,
  ) {}

  public async execute(
    command:
      UpdateSettingDefinitionCommand,
  ): Promise<SettingDefinitionDto> {
    const transactionFacilityId =
      requireActorFacilityId(
        command.actor,
      );

    const key =
      normalizeSettingKey(
        command.key,
      );

    const initial =
      await this.definitionRepository
        .findByKey(
          key,
        );

    if (
      initial === null
    ) {
      throw new SettingDefinitionNotFoundError();
    }

    if (
      initial.version !==
      command.input.expectedVersion
    ) {
      throw new SettingDefinitionConcurrencyError();
    }

    if (
      !initial.isMutable
    ) {
      throw new ImmutableSettingDefinitionError(
        initial.key,
      );
    }

    const candidate =
      mergedDefinition(
        initial,
        command.input,
      );

    validateDefinition(
      candidate,
    );

    const scopesChanged =
      JSON.stringify(
        [...initial.allowedScopes].sort(),
      ) !==
      JSON.stringify(
        [...candidate.allowedScopes].sort(),
      );

    if (
      scopesChanged &&
      await this.settingRepository
        .countByDefinition(
          initial._id.toHexString(),
        ) > 0
    ) {
      throw new ConflictError(
        'Allowed scopes cannot be changed after setting values have been created',
      );
    }

    return this.dependencies
      .transactionManager
      .execute({
        transactionType:
          FACILITY_TRANSACTION_TYPES
            .UPDATE_SETTING_DEFINITION,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          transactionFacilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          `setting-definition:key:${key}`,
        ],

        payload: {
          key,

          expectedVersion:
            command.input.expectedVersion,

          requestedFields:
            Object.keys(
              command.input,
            ).filter(
              (field) =>
                field !==
                'expectedVersion',
            ),
        },

        execute:
          async (
            transaction,
          ) => {
            const current =
              await this.definitionRepository
                .findByKey(
                  key,
                );

            if (
              current === null
            ) {
              throw new SettingDefinitionNotFoundError();
            }

            if (
              current.version !==
              command.input.expectedVersion
            ) {
              throw new SettingDefinitionConcurrencyError();
            }

            if (
              !current.isMutable
            ) {
              throw new ImmutableSettingDefinitionError(
                current.key,
              );
            }

            const next =
              mergedDefinition(
                current,
                command.input,
              );

            validateDefinition(
              next,
            );

            const currentScopesChanged =
              JSON.stringify(
                [...current.allowedScopes].sort(),
              ) !==
              JSON.stringify(
                [...next.allowedScopes].sort(),
              );

            if (
              currentScopesChanged &&
              await this.settingRepository
                .countByDefinition(
                  current._id.toHexString(),
                ) > 0
            ) {
              throw new ConflictError(
                'Allowed scopes cannot be changed after setting values have been created',
              );
            }

            await transaction
              .registerCompensation({
                key:
                  `restore-setting-definition:${current._id.toHexString()}`,

                type:
                  FACILITY_COMPENSATION_TYPES
                    .RESTORE_SETTING_DEFINITION,

                payload: {
                  definitionId:
                    current._id.toHexString(),

                  expectedPostVersion:
                    current.version +
                    1,

                  previous:
                    previousSnapshot(
                      current,
                    ),
                },
              });

            const updated =
              await this.definitionRepository
                .updateWithVersion(
                  current._id.toHexString(),
                  command.input,
                  command.actor.userId,
                );

            if (
              updated === null
            ) {
              throw new SettingDefinitionConcurrencyError();
            }

            const before =
              toSettingDefinitionDto(
                current,
              );

            const after =
              toSettingDefinitionDto(
                updated,
              );

            const changes =
              changedFields(
                before,
                after,
              );

            await transaction.checkpoint(
              FACILITY_TRANSACTION_CHECKPOINTS
                .SETTING_DEFINITION_UPDATED,
              {
                definitionId:
                  updated._id.toHexString(),

                key:
                  updated.key,

                version:
                  updated.version,
              },
            );

            const now =
              this.dependencies
                .clock
                .now();

            await this.dependencies
              .audit
              .append({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:audit:setting-definition-updated`,

                action:
                  FACILITY_AUDIT_ACTIONS
                    .SETTING_DEFINITION_UPDATED,

                entityType:
                  'SettingDefinition',

                entityId:
                  updated._id.toHexString(),

                ...buildFacilityAuditActorFields(
                  command.actor,
                ),

                facilityId:
                  transactionFacilityId,

                occurredAt:
                  now,

                before,

                after,

                metadata: {
                  key:
                    updated.key,

                  changedFields:
                    changes,

                  isSensitive:
                    updated.isSensitive,

                  idempotencyKey:
                    command.idempotencyKey,
                },
              });

            await transaction.checkpoint(
              FACILITY_TRANSACTION_CHECKPOINTS
                .AUDIT_APPENDED,
              {
                definitionId:
                  updated._id.toHexString(),
              },
            );

            await this.dependencies
              .outbox
              .enqueue({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:outbox:setting-definition-updated`,

                eventType:
                  FACILITY_OUTBOX_EVENTS
                    .SETTING_DEFINITION_UPDATED,

                aggregateType:
                  'SettingDefinition',

                aggregateId:
                  updated._id.toHexString(),

                actorUserId:
                  command.actor.userId,

                facilityId:
                  transactionFacilityId,

                correlationId:
                  command.actor.correlationId,

                occurredAt:
                  now,

                payload: {
                  before,
                  after,
                  changedFields:
                    changes,
                },
              });

            await transaction.checkpoint(
              FACILITY_TRANSACTION_CHECKPOINTS
                .OUTBOX_ENQUEUED,
              {
                definitionId:
                  updated._id.toHexString(),
              },
            );

            return after;
          },
      });
  }
}