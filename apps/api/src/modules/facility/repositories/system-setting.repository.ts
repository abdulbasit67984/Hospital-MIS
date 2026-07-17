import {
  SystemSettingModel,
} from '@hospital-mis/database';

import type {
  FilterQuery,
} from 'mongoose';

import {
  SETTING_SCOPE,
  type SettingScope,
} from '../facility.constants.js';

import {
  escapeRegex,
  normalizeSettingKey,
  toNullableObjectId,
  toObjectId,
} from '../facility.mapper.js';

import type {
  CreateSystemSettingPersistenceInput,
  PageResult,
  SettingDefinitionRecord,
  SystemSettingListQuery,
  SystemSettingRecord,
  UpdateSystemSettingPersistenceInput,
} from '../facility.types.js';

export class SystemSettingRepository {
  public async create(
    input:
      CreateSystemSettingPersistenceInput,
  ): Promise<SystemSettingRecord> {
    const created =
      await SystemSettingModel.create({
        definitionId:
          toObjectId(
            input.definitionId,
            'definitionId',
          ),

        key:
          normalizeSettingKey(
            input.key,
          ),

        scope:
          input.scope,

        facilityId:
          toNullableObjectId(
            input.facilityId,
            'facilityId',
          ),

        value:
          input.isSensitive
            ? null
            : input.value,

        encryptedValue:
          input.isSensitive
            ? input.encryptedValue
            : null,

        valueHash:
          input.valueHash,

        isSensitive:
          input.isSensitive,

        revision:
          1,

        isActive:
          input.isActive,

        version:
          0,

        createdBy:
          toObjectId(
            input.actorUserId,
            'actorUserId',
          ),

        updatedBy:
          toObjectId(
            input.actorUserId,
            'actorUserId',
          ),
      });

    return created.toObject() as SystemSettingRecord;
  }

  public async findById(
    settingId:
      string,
    includeEncryptedValue =
      false,
  ): Promise<SystemSettingRecord | null> {
    const query =
      SystemSettingModel.findById(
        toObjectId(
          settingId,
          'settingId',
        ),
      );

    if (
      includeEncryptedValue
    ) {
      query.select(
        '+encryptedValue +valueHash',
      );
    }

    return query
      .lean<SystemSettingRecord>()
      .exec();
  }

  public async findByScope(
    input:
      Readonly<{
        key:
          string;

        scope:
          SettingScope;

        facilityId:
          string | null;

        includeEncryptedValue?:
          boolean;
      }>,
  ): Promise<SystemSettingRecord | null> {
    const query =
      SystemSettingModel.findOne({
        key:
          normalizeSettingKey(
            input.key,
          ),

        scope:
          input.scope,

        facilityId:
          toNullableObjectId(
            input.facilityId,
            'facilityId',
          ),
      });

    if (
      input.includeEncryptedValue
    ) {
      query.select(
        '+encryptedValue +valueHash',
      );
    }

    return query
      .lean<SystemSettingRecord>()
      .exec();
  }

  public async findEffective(
    key:
      string,
    facilityId:
      string,
    includeEncryptedValue =
      false,
  ): Promise<SystemSettingRecord | null> {
    const normalizedKey =
      normalizeSettingKey(
        key,
      );

    const query =
      SystemSettingModel.find({
        key:
          normalizedKey,

        isActive:
          true,

        $or: [
          {
            scope:
              SETTING_SCOPE.FACILITY,

            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),
          },

          {
            scope:
              SETTING_SCOPE.GLOBAL,

            facilityId:
              null,
          },
        ],
      }).limit(2);

    if (
      includeEncryptedValue
    ) {
      query.select(
        '+encryptedValue +valueHash',
      );
    }

    const records =
      await query
        .lean<SystemSettingRecord[]>()
        .exec();

    return (
      records.find(
        (record) =>
          record.scope ===
          SETTING_SCOPE.FACILITY,
      ) ??
      records.find(
        (record) =>
          record.scope ===
          SETTING_SCOPE.GLOBAL,
      ) ??
      null
    );
  }

  public async list(
    query:
      SystemSettingListQuery,
    definitions?:
      readonly SettingDefinitionRecord[],
  ): Promise<
    PageResult<SystemSettingRecord>
  > {
    const filter:
      FilterQuery<SystemSettingRecord> =
      {};

    if (
      query.activeOnly
    ) {
      filter.isActive =
        true;
    }

    if (
      query.scope
    ) {
      filter.scope =
        query.scope;
    }

    if (
      query.facilityId !==
      undefined
    ) {
      filter.facilityId =
        toNullableObjectId(
          query.facilityId,
          'facilityId',
        );
    }

    if (
      query.category
    ) {
      const definitionIds =
        (
          definitions ??
          []
        )
          .filter(
            (definition) =>
              definition.category ===
              query.category,
          )
          .map(
            (definition) =>
              definition._id,
          );

      filter.definitionId = {
        $in:
          definitionIds,
      };
    }

    if (
      query.search
    ) {
      filter.key =
        new RegExp(
          escapeRegex(
            query.search.trim(),
          ),
          'i',
        );
    }

    const page =
      Math.max(
        1,
        query.page,
      );

    const pageSize =
      Math.max(
        1,
        query.pageSize,
      );

    const skip =
      (
        page -
        1
      ) *
      pageSize;

    const direction =
      query.sortDirection ===
      'desc'
        ? -1
        : 1;

    const [
      items,
      totalItems,
    ] =
      await Promise.all([
        SystemSettingModel.find(
          filter,
        )
          .sort({
            [query.sortBy]:
              direction,

            key:
              1,

            _id:
              1,
          })
          .skip(
            skip,
          )
          .limit(
            pageSize,
          )
          .lean<
            SystemSettingRecord[]
          >()
          .exec(),

        SystemSettingModel.countDocuments(
          filter,
        ).exec(),
      ]);

    return {
      items,
      page,
      pageSize,
      totalItems,

      totalPages:
        totalItems === 0
          ? 0
          : Math.ceil(
              totalItems /
                pageSize,
            ),
    };
  }

  public async updateWithVersion(
    settingId:
      string,
    input:
      UpdateSystemSettingPersistenceInput,
  ): Promise<SystemSettingRecord | null> {
    return SystemSettingModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            settingId,
            'settingId',
          ),

        version:
          input.expectedVersion,

        revision:
          input.expectedRevision,
      },
      {
        $set: {
          value:
            input.encryptedValue ===
            null
              ? input.value
              : null,

          encryptedValue:
            input.encryptedValue,

          valueHash:
            input.valueHash,

          isActive:
            input.isActive,

          updatedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),
        },

        $inc: {
          version:
            1,

          revision:
            1,
        },
      },
      {
        new:
          true,

        runValidators:
          true,
      },
    )
      .select(
        '+encryptedValue +valueHash',
      )
      .lean<SystemSettingRecord>()
      .exec();
  }

  public async countByDefinition(
    definitionId:
      string,
  ): Promise<number> {
    return SystemSettingModel.countDocuments({
      definitionId:
        toObjectId(
          definitionId,
          'definitionId',
        ),
    }).exec();
  }
}