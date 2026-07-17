import {
  BadRequestError,
} from '@hospital-mis/shared';

import {
  SETTING_CHANGE_SOURCE,
  SETTING_CHANGE_TYPE,
  SETTING_SCOPE,
  type SettingScope,
} from '../facility.constants.js';

import {
  ImmutableSettingDefinitionError,
  SettingDefinitionConcurrencyError,
  SettingDefinitionNotFoundError,
  SystemSettingConcurrencyError,
  SystemSettingNotFoundError,
} from '../facility.errors.js';

import {
  normalizeSettingKey,
  nullableObjectIdToString,
  toSystemSettingDto,
} from '../facility.mapper.js';

import {
  buildFacilityAuditActorFields,
  type FacilityMutationDependencies,
  type FacilitySensitiveSettingCryptoPort,
} from '../facility.ports.js';

import {
  assertSettingScopeAllowed,
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
  SystemSettingDto,
  SystemSettingRecord,
} from '../facility.types.js';

import {
  assertFacilityActive,
  requireActorFacilityId,
} from '../facility.workflow-helpers.js';

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

export interface UpsertSystemSettingInput {
  scope:
    SettingScope;

  facilityId:
    string | null;

  value:
    unknown;

  expectedVersion:
    number | null;

  expectedRevision:
    number | null;

  reason:
    string;
}

export interface UpsertSystemSettingCommand {
  key:
    string;

  input:
    UpsertSystemSettingInput;

  actor:
    FacilityActorContext;

  idempotencyKey:
    string;
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

function previousSnapshot(
  current:
    SystemSettingRecord,
): Record<string, unknown> {
  return {
    value:
      current.value,

    encryptedValue:
      current.encryptedValue,

    valueHash:
      current.valueHash,

    revision:
      current.revision,

    isActive:
      current.isActive,

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

export class UpsertSystemSettingWorkflow {
  public constructor(
    private readonly definitionRepository:
      SettingDefinitionRepository,

    private readonly settingRepository:
      SystemSettingRepository,

    private readonly versionRepository:
      SystemSettingVersionRepository,

    private readonly facilityRepository:
      FacilityRepository,

    private readonly crypto:
      FacilitySensitiveSettingCryptoPort,

    private readonly dependencies:
      FacilityMutationDependencies,
  ) {}

  public async execute(
    command:
      UpsertSystemSettingCommand,
  ): Promise<SystemSettingDto> {
    const transactionFacilityId =
      requireActorFacilityId(
        command.actor,
      );

    const key =
      normalizeSettingKey(
        command.key,
      );

    this.assertScopeShape(
      command.input,
    );

    const initialDefinition =
      await this.definitionRepository
        .findByKey(
          key,
        );

    if (
      initialDefinition === null ||
      !initialDefinition.isActive
    ) {
      throw new SettingDefinitionNotFoundError();
    }

    if (
      !initialDefinition.isMutable
    ) {
      throw new ImmutableSettingDefinitionError(
        key,
      );
    }

    assertSettingScopeAllowed(
      initialDefinition,
      command.input.scope,
    );

    if (
      command.input.scope ===
      SETTING_SCOPE.FACILITY
    ) {
      await assertFacilityActive(
        this.facilityRepository,
        command.input.facilityId as string,
      );
    }

    const initialValue =
      validateSettingValue(
        initialDefinition,
        command.input.value,
      );

    const data =
      associatedData({
        key,

        scope:
          command.input.scope,

        facilityId:
          command.input.facilityId,
      });

    const requestValueHash =
      this.crypto.hash(
        initialValue.normalizedValue,
        data,
      );

    return this.dependencies
      .transactionManager
      .execute({
        transactionType:
          FACILITY_TRANSACTION_TYPES
            .UPSERT_SYSTEM_SETTING,

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

          `system-setting:${command.input.scope}:${command.input.facilityId ?? 'global'}:${key}`,
        ],

        /*
         * Sensitive plaintext is never copied into the durable transaction
         * journal. The keyed hash still gives idempotency request matching.
         */
        payload: {
          key,

          scope:
            command.input.scope,

          facilityId:
            command.input.facilityId,

          expectedVersion:
            command.input.expectedVersion,

          expectedRevision:
            command.input.expectedRevision,

          reason:
            command.input.reason,

          valueHash:
            requestValueHash,

          isSensitive:
            initialDefinition.isSensitive,

          definitionVersion:
            initialDefinition.version,
        },

        execute:
          async (
            transaction,
          ) => {
            const definition =
              await this.definitionRepository
                .findByKey(
                  key,
                );

            if (
              definition === null ||
              !definition.isActive
            ) {
              throw new SettingDefinitionNotFoundError();
            }

            if (
              definition.version !==
              initialDefinition.version
            ) {
              throw new SettingDefinitionConcurrencyError();
            }

            if (
              !definition.isMutable
            ) {
              throw new ImmutableSettingDefinitionError(
                definition.key,
              );
            }

            assertSettingScopeAllowed(
              definition,
              command.input.scope,
            );

            if (
              command.input.scope ===
              SETTING_SCOPE.FACILITY
            ) {
              await assertFacilityActive(
                this.facilityRepository,
                command.input.facilityId as string,
              );
            }

            const validated =
              validateSettingValue(
                definition,
                command.input.value,
              );

            const valueHash =
              this.crypto.hash(
                validated.normalizedValue,
                data,
              );

            const existing =
              await this.settingRepository
                .findByScope({
                  key,

                  scope:
                    command.input.scope,

                  facilityId:
                    command.input.facilityId,

                  includeEncryptedValue:
                    true,
                });

            this.assertConcurrency(
              existing,
              command.input,
            );

            if (
              existing !== null &&
              existing.valueHash ===
                valueHash &&
              existing.isActive
            ) {
              return toSystemSettingDto(
                existing,
              );
            }

            const protectedValue =
              definition.isSensitive
                ? this.crypto.protect(
                    validated.normalizedValue,
                    data,
                  )
                : null;

            let persisted:
              SystemSettingRecord;

            let changeType:
              | typeof SETTING_CHANGE_TYPE.CREATED
              | typeof SETTING_CHANGE_TYPE.UPDATED
              | typeof SETTING_CHANGE_TYPE.REACTIVATED;

            if (
              existing === null
            ) {
              persisted =
                await this.settingRepository
                  .create({
                    definitionId:
                      definition._id.toHexString(),

                    key:
                      definition.key,

                    scope:
                      command.input.scope,

                    facilityId:
                      command.input.facilityId,

                    value:
                      definition.isSensitive
                        ? null
                        : validated.normalizedValue,

                    encryptedValue:
                      protectedValue
                        ?.encryptedValue ??
                      null,

                    valueHash,

                    isSensitive:
                      definition.isSensitive,

                    isActive:
                      true,

                    actorUserId:
                      command.actor.userId,
                  });

              changeType =
                SETTING_CHANGE_TYPE.CREATED;

              await transaction
                .registerCompensation({
                  key:
                    `delete-created-system-setting:${persisted._id.toHexString()}`,

                  type:
                    FACILITY_COMPENSATION_TYPES
                      .DELETE_CREATED_SYSTEM_SETTING,

                  payload: {
                    settingId:
                      persisted._id.toHexString(),

                    expectedVersion:
                      persisted.version,
                  },
                });

              await transaction.checkpoint(
                FACILITY_TRANSACTION_CHECKPOINTS
                  .SYSTEM_SETTING_CREATED,
                {
                  settingId:
                    persisted._id.toHexString(),

                  revision:
                    persisted.revision,
                },
              );
            } else {
              await transaction
                .registerCompensation({
                  key:
                    `restore-system-setting:${existing._id.toHexString()}`,

                  type:
                    FACILITY_COMPENSATION_TYPES
                      .RESTORE_SYSTEM_SETTING,

                  payload: {
                    settingId:
                      existing._id.toHexString(),

                    expectedPostVersion:
                      existing.version +
                      1,

                    previous:
                      previousSnapshot(
                        existing,
                      ),
                  },
                });

              const updated =
                await this.settingRepository
                  .updateWithVersion(
                    existing._id.toHexString(),
                    {
                      expectedVersion:
                        existing.version,

                      expectedRevision:
                        existing.revision,

                      value:
                        definition.isSensitive
                          ? null
                          : validated.normalizedValue,

                      encryptedValue:
                        protectedValue
                          ?.encryptedValue ??
                        null,

                      valueHash,

                      isActive:
                        true,

                      actorUserId:
                        command.actor.userId,
                    },
                  );

              if (
                updated === null
              ) {
                throw new SystemSettingConcurrencyError();
              }

              persisted =
                updated;

              changeType =
                existing.isActive
                  ? SETTING_CHANGE_TYPE.UPDATED
                  : SETTING_CHANGE_TYPE.REACTIVATED;

              await transaction.checkpoint(
                FACILITY_TRANSACTION_CHECKPOINTS
                  .SYSTEM_SETTING_UPDATED,
                {
                  settingId:
                    persisted._id.toHexString(),

                  revision:
                    persisted.revision,
                },
              );
            }

            const changedAt =
              this.dependencies
                .clock
                .now();

            const version =
              await this.versionRepository
                .append({
                  settingId:
                    persisted._id.toHexString(),

                  definitionId:
                    definition._id.toHexString(),

                  key:
                    definition.key,

                  scope:
                    persisted.scope,

                  facilityId:
                    nullableObjectIdToString(
                      persisted.facilityId,
                    ),

                  revision:
                    persisted.revision,

                  changeType,

                  changeSource:
                    SETTING_CHANGE_SOURCE.USER,

                  value:
                    definition.isSensitive
                      ? null
                      : persisted.value,

                  encryptedValue:
                    definition.isSensitive
                      ? persisted.encryptedValue
                      : null,

                  valueHash:
                    persisted.valueHash,

                  isSensitive:
                    persisted.isSensitive,

                  isActive:
                    persisted.isActive,

                  changedBy:
                    command.actor.userId,

                  changeReason:
                    command.input.reason,

                  correlationId:
                    command.actor.correlationId,

                  changedAt,
                });

            await transaction
              .registerCompensation({
                key:
                  `delete-system-setting-version:${version._id.toHexString()}`,

                type:
                  FACILITY_COMPENSATION_TYPES
                    .DELETE_SYSTEM_SETTING_VERSION,

                payload: {
                  versionId:
                    version._id.toHexString(),

                  settingId:
                    persisted._id.toHexString(),

                  revision:
                    persisted.revision,
                },
              });

            await transaction.checkpoint(
              FACILITY_TRANSACTION_CHECKPOINTS
                .SYSTEM_SETTING_VERSION_APPENDED,
              {
                settingId:
                  persisted._id.toHexString(),

                versionId:
                  version._id.toHexString(),

                revision:
                  persisted.revision,
              },
            );

            const before =
              existing === null
                ? null
                : toSystemSettingDto(
                    existing,
                  );

            const after =
              toSystemSettingDto(
                persisted,
              );

            const auditAction =
              existing === null
                ? FACILITY_AUDIT_ACTIONS
                    .SYSTEM_SETTING_CREATED
                : FACILITY_AUDIT_ACTIONS
                    .SYSTEM_SETTING_UPDATED;

            const outboxEvent =
              existing === null
                ? FACILITY_OUTBOX_EVENTS
                    .SYSTEM_SETTING_CREATED
                : FACILITY_OUTBOX_EVENTS
                    .SYSTEM_SETTING_UPDATED;

            const auditFacilityId =
              command.input.facilityId ??
              transactionFacilityId;

            await this.dependencies
              .audit
              .append({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:audit:system-setting-upserted`,

                action:
                  auditAction,

                entityType:
                  'SystemSetting',

                entityId:
                  persisted._id.toHexString(),

                ...buildFacilityAuditActorFields(
                  command.actor,
                ),

                facilityId:
                  auditFacilityId,

                occurredAt:
                  changedAt,

                reason:
                  command.input.reason,

                before,

                after,

                metadata: {
                  key:
                    definition.key,

                  scope:
                    persisted.scope,

                  revision:
                    persisted.revision,

                  isSensitive:
                    persisted.isSensitive,

                  valueChanged:
                    true,

                  idempotencyKey:
                    command.idempotencyKey,
                },
              });

            await transaction.checkpoint(
              FACILITY_TRANSACTION_CHECKPOINTS
                .AUDIT_APPENDED,
              {
                settingId:
                  persisted._id.toHexString(),
              },
            );

            await this.dependencies
              .outbox
              .enqueue({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:outbox:system-setting-upserted`,

                eventType:
                  outboxEvent,

                aggregateType:
                  'SystemSetting',

                aggregateId:
                  persisted._id.toHexString(),

                actorUserId:
                  command.actor.userId,

                facilityId:
                  auditFacilityId,

                correlationId:
                  command.actor.correlationId,

                occurredAt:
                  changedAt,

                /*
                 * toSystemSettingDto masks sensitive values. No ciphertext,
                 * authentication tag, keyed hash, or plaintext is published.
                 */
                payload: {
                  before,
                  after,

                  key:
                    definition.key,

                  scope:
                    persisted.scope,

                  revision:
                    persisted.revision,

                  isSensitive:
                    persisted.isSensitive,
                },
              });

            await transaction.checkpoint(
              FACILITY_TRANSACTION_CHECKPOINTS
                .OUTBOX_ENQUEUED,
              {
                settingId:
                  persisted._id.toHexString(),
              },
            );

            return after;
          },
      });
  }

  private assertScopeShape(
    input:
      UpsertSystemSettingInput,
  ): void {
    if (
      input.scope ===
        SETTING_SCOPE.GLOBAL &&
      input.facilityId !==
        null
    ) {
      throw new BadRequestError(
        'Global settings cannot specify a facility ID',
      );
    }

    if (
      input.scope ===
        SETTING_SCOPE.FACILITY &&
      input.facilityId ===
        null
    ) {
      throw new BadRequestError(
        'Facility-scoped settings require a facility ID',
      );
    }
  }

  private assertConcurrency(
    existing:
      SystemSettingRecord | null,

    input:
      UpsertSystemSettingInput,
  ): void {
    const expectedVersion =
      input.expectedVersion;

    const expectedRevision =
      input.expectedRevision;

    if (
      existing === null
    ) {
      if (
        expectedVersion !== null ||
        expectedRevision !== null
      ) {
        throw new SystemSettingNotFoundError();
      }

      return;
    }

    if (
      expectedVersion === null ||
      expectedRevision === null
    ) {
      throw new SystemSettingConcurrencyError();
    }

    if (
      existing.version !==
        expectedVersion ||
      existing.revision !==
        expectedRevision
    ) {
      throw new SystemSettingConcurrencyError();
    }
  }
}