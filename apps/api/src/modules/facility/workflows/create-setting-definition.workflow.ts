import {
  Types,
} from 'mongoose';

import {
  ConflictError,
} from '@hospital-mis/shared';

import {
  InvalidSettingValueError,
  SettingDefinitionKeyConflictError,
} from '../facility.errors.js';

import {
  normalizeSettingKey,
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
  CreateSettingDefinitionInput,
  FacilityActorContext,
  SettingDefinitionDto,
  SettingDefinitionRecord,
} from '../facility.types.js';

import {
  requireActorFacilityId,
} from '../facility.workflow-helpers.js';

import type {
  SettingDefinitionRepository,
} from '../repositories/setting-definition.repository.js';

function isDuplicateKey(
  error: unknown,
): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

function candidateRecord(
  input:
    CreateSettingDefinitionInput,
): SettingDefinitionRecord {
  const now =
    new Date();

  return {
    _id:
      new Types.ObjectId(),

    key:
      normalizeSettingKey(
        input.key,
      ),

    category:
      input.category,

    dataType:
      input.dataType,

    allowedScopes: [
      ...new Set(
        input.allowedScopes,
      ),
    ],

    defaultValue:
      input.defaultValue ??
      null,

    labels:
      input.labels,

    validation:
      input.validation,

    isSensitive:
      input.isSensitive,

    isMutable:
      input.isMutable,

    isActive:
      input.isActive,

    cacheTtlSeconds:
      input.cacheTtlSeconds,

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

export interface CreateSettingDefinitionCommand {
  input:
    CreateSettingDefinitionInput;

  actor:
    FacilityActorContext;

  idempotencyKey:
    string;
}

export class CreateSettingDefinitionWorkflow {
  public constructor(
    private readonly repository:
      SettingDefinitionRepository,

    private readonly dependencies:
      FacilityMutationDependencies,
  ) {}

  public async execute(
    command:
      CreateSettingDefinitionCommand,
  ): Promise<SettingDefinitionDto> {
    const transactionFacilityId =
      requireActorFacilityId(
        command.actor,
      );

    const candidate =
      candidateRecord(
        command.input,
      );

    validateDefinition(
      candidate,
    );

    const existing =
      await this.repository.findByKey(
        candidate.key,
      );

    if (
      existing !== null
    ) {
      throw new SettingDefinitionKeyConflictError(
        candidate.key,
      );
    }

    try {
      return await this.dependencies
        .transactionManager
        .execute({
          transactionType:
            FACILITY_TRANSACTION_TYPES
              .CREATE_SETTING_DEFINITION,

          idempotencyKey:
            command.idempotencyKey,

          actorUserId:
            command.actor.userId,

          facilityId:
            transactionFacilityId,

          correlationId:
            command.actor.correlationId,

          lockKeys: [
            `setting-definition:key:${candidate.key}`,
          ],

          payload: {
            key:
              candidate.key,

            category:
              candidate.category,

            dataType:
              candidate.dataType,

            allowedScopes:
              candidate.allowedScopes,

            isSensitive:
              candidate.isSensitive,

            isMutable:
              candidate.isMutable,

            isActive:
              candidate.isActive,
          },

          execute:
            async (
              transaction,
            ) => {
              const concurrent =
                await this.repository
                  .findByKey(
                    candidate.key,
                  );

              if (
                concurrent !== null
              ) {
                throw new SettingDefinitionKeyConflictError(
                  candidate.key,
                );
              }

              const created =
                await this.repository.create({
                  ...command.input,

                  key:
                    candidate.key,

                  allowedScopes:
                    candidate.allowedScopes,

                  defaultValue:
                    candidate.isSensitive
                      ? null
                      : candidate.defaultValue,

                  createdBy:
                    command.actor.userId,
                });

              const definitionId =
                created._id.toHexString();

              await transaction
                .registerCompensation({
                  key:
                    `delete-created-setting-definition:${definitionId}`,

                  type:
                    FACILITY_COMPENSATION_TYPES
                      .DELETE_CREATED_SETTING_DEFINITION,

                  payload: {
                    definitionId,

                    expectedVersion:
                      created.version,
                  },
                });

              await transaction.checkpoint(
                FACILITY_TRANSACTION_CHECKPOINTS
                  .SETTING_DEFINITION_CREATED,
                {
                  definitionId,
                  key:
                    created.key,
                },
              );

              const definition =
                toSettingDefinitionDto(
                  created,
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
                    `${transaction.transactionId}:audit:setting-definition-created`,

                  action:
                    FACILITY_AUDIT_ACTIONS
                      .SETTING_DEFINITION_CREATED,

                  entityType:
                    'SettingDefinition',

                  entityId:
                    definitionId,

                  ...buildFacilityAuditActorFields(
                    command.actor,
                  ),

                  facilityId:
                    transactionFacilityId,

                  occurredAt:
                    now,

                  before:
                    null,

                  after:
                    definition,

                  metadata: {
                    key:
                      definition.key,

                    category:
                      definition.category,

                    isSensitive:
                      definition.isSensitive,

                    idempotencyKey:
                      command.idempotencyKey,
                  },
                });

              await transaction.checkpoint(
                FACILITY_TRANSACTION_CHECKPOINTS
                  .AUDIT_APPENDED,
                {
                  definitionId,
                },
              );

              await this.dependencies
                .outbox
                .enqueue({
                  transactionId:
                    transaction.transactionId,

                  deduplicationKey:
                    `${transaction.transactionId}:outbox:setting-definition-created`,

                  eventType:
                    FACILITY_OUTBOX_EVENTS
                      .SETTING_DEFINITION_CREATED,

                  aggregateType:
                    'SettingDefinition',

                  aggregateId:
                    definitionId,

                  actorUserId:
                    command.actor.userId,

                  facilityId:
                    transactionFacilityId,

                  correlationId:
                    command.actor.correlationId,

                  occurredAt:
                    now,

                  payload: {
                    definition,
                  },
                });

              await transaction.checkpoint(
                FACILITY_TRANSACTION_CHECKPOINTS
                  .OUTBOX_ENQUEUED,
                {
                  definitionId,
                },
              );

              return definition;
            },
        });
    } catch (error) {
      if (
        error instanceof
        SettingDefinitionKeyConflictError
      ) {
        throw error;
      }

      if (
        isDuplicateKey(
          error,
        )
      ) {
        throw new SettingDefinitionKeyConflictError(
          candidate.key,
        );
      }

      if (
        error instanceof Error
      ) {
        throw error;
      }

      throw new ConflictError(
        'The setting definition could not be created',
      );
    }
  }
}