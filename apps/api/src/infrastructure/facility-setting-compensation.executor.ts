import {
  SettingDefinitionModel,
  SystemSettingModel,
  SystemSettingVersionModel,
} from '@hospital-mis/database';

import {
  ConflictError,
} from '@hospital-mis/shared';

import {
  toNullableObjectId,
  toObjectId,
} from '../modules/facility/facility.mapper.js';

import type {
  FacilityTransactionCompensation,
} from '../modules/facility/facility.ports.js';

import {
  FACILITY_COMPENSATION_TYPES,
} from '../modules/facility/facility.transaction.constants.js';

import type {
  FacilityCompensationExecutorPort,
} from './facility-compensation.executor.js';

type JsonObject =
  Record<string, unknown>;

function asObject(
  value: unknown,
  fieldName: string,
): JsonObject {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(
      `${fieldName} must be an object`,
    );
  }

  return value as JsonObject;
}

function asString(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== 'string' ||
    value.length === 0
  ) {
    throw new Error(
      `${fieldName} must be a non-empty string`,
    );
  }

  return value;
}

function asInteger(
  value: unknown,
  fieldName: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `${fieldName} must be a non-negative safe integer`,
    );
  }

  return value;
}

function asBoolean(
  value: unknown,
  fieldName: string,
): boolean {
  if (
    typeof value !== 'boolean'
  ) {
    throw new Error(
      `${fieldName} must be a boolean`,
    );
  }

  return value;
}

function nullableString(
  value: unknown,
): string | null {
  return typeof value === 'string'
    ? value
    : null;
}

function dateValue(
  value: unknown,
  fieldName: string,
): Date {
  const parsed =
    value instanceof Date
      ? value
      : new Date(
          asString(
            value,
            fieldName,
          ),
        );

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    throw new Error(
      `${fieldName} must contain a valid date`,
    );
  }

  return parsed;
}

export class FacilitySettingCompensationExecutor
implements FacilityCompensationExecutorPort {
  public constructor(
    private readonly fallback:
      FacilityCompensationExecutorPort,
  ) {}

  public async execute(
    compensation:
      FacilityTransactionCompensation,
  ): Promise<void> {
    switch (
      compensation.type
    ) {
      case FACILITY_COMPENSATION_TYPES
        .DELETE_CREATED_SETTING_DEFINITION:
        await this.deleteCreatedDefinition(
          compensation.payload,
        );
        return;

      case FACILITY_COMPENSATION_TYPES
        .RESTORE_SETTING_DEFINITION:
        await this.restoreDefinition(
          compensation.payload,
        );
        return;

      case FACILITY_COMPENSATION_TYPES
        .DELETE_CREATED_SYSTEM_SETTING:
        await this.deleteCreatedSetting(
          compensation.payload,
        );
        return;

      case FACILITY_COMPENSATION_TYPES
        .RESTORE_SYSTEM_SETTING:
        await this.restoreSetting(
          compensation.payload,
        );
        return;

      case FACILITY_COMPENSATION_TYPES
        .DELETE_SYSTEM_SETTING_VERSION:
        await this.deleteSettingVersion(
          compensation.payload,
        );
        return;

      default:
        await this.fallback.execute(
          compensation,
        );
    }
  }

  private async deleteCreatedDefinition(
    payload: JsonObject,
  ): Promise<void> {
    const definitionId =
      asString(
        payload['definitionId'],
        'definitionId',
      );

    const expectedVersion =
      asInteger(
        payload['expectedVersion'],
        'expectedVersion',
      );

    const objectId =
      toObjectId(
        definitionId,
        'definitionId',
      );

    const existingSetting =
      await SystemSettingModel.exists({
        definitionId:
          objectId,
      });

    if (
      existingSetting !== null
    ) {
      throw new ConflictError(
        'The created setting definition acquired setting values before compensation',
      );
    }

    const result =
      await SettingDefinitionModel.deleteOne({
        _id:
          objectId,

        version:
          expectedVersion,
      }).exec();

    if (
      result.deletedCount === 1
    ) {
      return;
    }

    const existing =
      await SettingDefinitionModel.exists({
        _id:
          objectId,
      });

    if (
      existing === null
    ) {
      return;
    }

    throw new ConflictError(
      'The created setting definition changed before compensation',
    );
  }

  private async restoreDefinition(
    payload: JsonObject,
  ): Promise<void> {
    const definitionId =
      asString(
        payload['definitionId'],
        'definitionId',
      );

    const expectedPostVersion =
      asInteger(
        payload['expectedPostVersion'],
        'expectedPostVersion',
      );

    const previous =
      asObject(
        payload['previous'],
        'previous',
      );

    const previousVersion =
      asInteger(
        previous['version'],
        'previous.version',
      );

    const result =
      await SettingDefinitionModel.updateOne(
        {
          _id:
            toObjectId(
              definitionId,
              'definitionId',
            ),

          version:
            expectedPostVersion,
        },
        {
          $set: {
            category:
              asString(
                previous['category'],
                'previous.category',
              ),

            allowedScopes:
              previous['allowedScopes'],

            defaultValue:
              previous['defaultValue'] ??
              null,

            labels:
              previous['labels'],

            validation:
              previous['validation'],

            isMutable:
              asBoolean(
                previous['isMutable'],
                'previous.isMutable',
              ),

            isActive:
              asBoolean(
                previous['isActive'],
                'previous.isActive',
              ),

            cacheTtlSeconds:
              asInteger(
                previous['cacheTtlSeconds'],
                'previous.cacheTtlSeconds',
              ),

            version:
              previousVersion,

            updatedBy:
              toNullableObjectId(
                nullableString(
                  previous['updatedBy'],
                ),
                'previous.updatedBy',
              ),

            updatedAt:
              dateValue(
                previous['updatedAt'],
                'previous.updatedAt',
              ),
          },
        },
        {
          runValidators:
            true,

          timestamps:
            false,
        },
      ).exec();

    await this.assertRestored(
      'Setting definition',
      definitionId,
      previousVersion,
      result.matchedCount,
      async () => {
        const current =
          await SettingDefinitionModel.findById(
            toObjectId(
              definitionId,
              'definitionId',
            ),
          )
            .select(
              'version',
            )
            .lean<{
              version: number;
            }>()
            .exec();

        return current?.version ??
          null;
      },
    );
  }

  private async deleteCreatedSetting(
    payload: JsonObject,
  ): Promise<void> {
    const settingId =
      asString(
        payload['settingId'],
        'settingId',
      );

    const expectedVersion =
      asInteger(
        payload['expectedVersion'],
        'expectedVersion',
      );

    const objectId =
      toObjectId(
        settingId,
        'settingId',
      );

    const existingVersion =
      await SystemSettingVersionModel.exists({
        settingId:
          objectId,
      });

    if (
      existingVersion !== null
    ) {
      throw new ConflictError(
        'The created system setting still has version-history records',
      );
    }

    const result =
      await SystemSettingModel.deleteOne({
        _id:
          objectId,

        version:
          expectedVersion,
      }).exec();

    if (
      result.deletedCount === 1
    ) {
      return;
    }

    const existing =
      await SystemSettingModel.exists({
        _id:
          objectId,
      });

    if (
      existing === null
    ) {
      return;
    }

    throw new ConflictError(
      'The created system setting changed before compensation',
    );
  }

  private async restoreSetting(
    payload: JsonObject,
  ): Promise<void> {
    const settingId =
      asString(
        payload['settingId'],
        'settingId',
      );

    const expectedPostVersion =
      asInteger(
        payload['expectedPostVersion'],
        'expectedPostVersion',
      );

    const previous =
      asObject(
        payload['previous'],
        'previous',
      );

    const previousVersion =
      asInteger(
        previous['version'],
        'previous.version',
      );

    const result =
      await SystemSettingModel.updateOne(
        {
          _id:
            toObjectId(
              settingId,
              'settingId',
            ),

          version:
            expectedPostVersion,
        },
        {
          $set: {
            value:
              previous['value'] ??
              null,

            encryptedValue:
              previous['encryptedValue'] ??
              null,

            valueHash:
              nullableString(
                previous['valueHash'],
              ),

            revision:
              asInteger(
                previous['revision'],
                'previous.revision',
              ),

            isActive:
              asBoolean(
                previous['isActive'],
                'previous.isActive',
              ),

            version:
              previousVersion,

            updatedBy:
              toNullableObjectId(
                nullableString(
                  previous['updatedBy'],
                ),
                'previous.updatedBy',
              ),

            updatedAt:
              dateValue(
                previous['updatedAt'],
                'previous.updatedAt',
              ),
          },
        },
        {
          runValidators:
            true,

          timestamps:
            false,
        },
      ).exec();

    await this.assertRestored(
      'System setting',
      settingId,
      previousVersion,
      result.matchedCount,
      async () => {
        const current =
          await SystemSettingModel.findById(
            toObjectId(
              settingId,
              'settingId',
            ),
          )
            .select(
              'version',
            )
            .lean<{
              version: number;
            }>()
            .exec();

        return current?.version ??
          null;
      },
    );
  }

  private async deleteSettingVersion(
    payload: JsonObject,
  ): Promise<void> {
    const versionId =
      asString(
        payload['versionId'],
        'versionId',
      );

    const settingId =
      asString(
        payload['settingId'],
        'settingId',
      );

    const revision =
      asInteger(
        payload['revision'],
        'revision',
      );

    const result =
      await SystemSettingVersionModel.deleteOne({
        _id:
          toObjectId(
            versionId,
            'versionId',
          ),

        settingId:
          toObjectId(
            settingId,
            'settingId',
          ),

        revision,
      }).exec();

    if (
      result.deletedCount === 1
    ) {
      return;
    }

    const existing =
      await SystemSettingVersionModel.exists({
        _id:
          toObjectId(
            versionId,
            'versionId',
          ),
      });

    if (
      existing === null
    ) {
      return;
    }

    throw new ConflictError(
      'The system-setting version record could not be removed during compensation',
    );
  }

  private async assertRestored(
    entityName: string,
    entityId: string,
    expectedVersion: number,
    matchedCount: number,
    readCurrentVersion:
      () => Promise<number | null>,
  ): Promise<void> {
    if (
      matchedCount === 1
    ) {
      return;
    }

    const currentVersion =
      await readCurrentVersion();

    if (
      currentVersion ===
      expectedVersion
    ) {
      return;
    }

    throw new ConflictError(
      `${entityName} ${entityId} could not be restored during compensation`,
    );
  }
}