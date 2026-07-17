import {
  SettingDefinitionModel,
} from '@hospital-mis/database';

import type {
  FilterQuery,
  UpdateQuery,
} from 'mongoose';

import {
  escapeRegex,
  normalizeSettingKey,
  toObjectId,
} from '../facility.mapper.js';
import type {
  CreateSettingDefinitionInput,
  PageResult,
  SettingDefinitionListQuery,
  SettingDefinitionRecord,
  UpdateSettingDefinitionInput,
} from '../facility.types.js';

export class SettingDefinitionRepository {
  public async create(
    input:
      CreateSettingDefinitionInput & {
        createdBy: string;
      },
  ): Promise<SettingDefinitionRecord> {
    const created =
      await SettingDefinitionModel.create({
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
          input.isSensitive
            ? null
            : input.defaultValue ??
              null,

        labels:
          input.labels.map(
            (label) => ({
              locale:
                label.locale.trim(),

              label:
                label.label.trim(),

              description:
                label.description?.trim() ??
                null,
            }),
          ),

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

        version:
          0,

        createdBy:
          toObjectId(
            input.createdBy,
            'createdBy',
          ),

        updatedBy:
          toObjectId(
            input.createdBy,
            'createdBy',
          ),
      });

    return created.toObject() as SettingDefinitionRecord;
  }

  public async findById(
    definitionId: string,
  ): Promise<SettingDefinitionRecord | null> {
    return SettingDefinitionModel.findById(
      toObjectId(
        definitionId,
        'definitionId',
      ),
    )
      .lean<SettingDefinitionRecord>()
      .exec();
  }

  public async findByKey(
    key: string,
  ): Promise<SettingDefinitionRecord | null> {
    return SettingDefinitionModel.findOne({
      key:
        normalizeSettingKey(
          key,
        ),
    })
      .lean<SettingDefinitionRecord>()
      .exec();
  }

  public async list(
    query:
      SettingDefinitionListQuery,
  ): Promise<
    PageResult<SettingDefinitionRecord>
  > {
    const filter:
      FilterQuery<SettingDefinitionRecord> =
      {};

    if (query.activeOnly) {
      filter.isActive = true;
    }

    if (query.category) {
      filter.category =
        query.category;
    }

    if (query.dataType) {
      filter.dataType =
        query.dataType;
    }

    if (query.scope) {
      filter.allowedScopes =
        query.scope;
    }

    if (query.search) {
      const search =
        new RegExp(
          escapeRegex(
            query.search.trim(),
          ),
          'i',
        );

      filter.$or = [
        {
          key: search,
        },
        {
          'labels.label':
            search,
        },
        {
          'labels.description':
            search,
        },
      ];
    }

    const page =
      Math.max(1, query.page);

    const pageSize =
      Math.max(
        1,
        query.pageSize,
      );

    const skip =
      (page - 1) * pageSize;

    const direction =
      query.sortDirection ===
      'desc'
        ? -1
        : 1;

    const [
      items,
      totalItems,
    ] = await Promise.all([
      SettingDefinitionModel.find(
        filter,
      )
        .sort({
          [query.sortBy]:
            direction,
          key: 1,
          _id: 1,
        })
        .skip(skip)
        .limit(pageSize)
        .lean<
          SettingDefinitionRecord[]
        >()
        .exec(),

      SettingDefinitionModel.countDocuments(
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
    definitionId: string,
    input:
      UpdateSettingDefinitionInput,
    actorUserId: string,
  ): Promise<SettingDefinitionRecord | null> {
    const setValues:
      Record<string, unknown> = {
        updatedBy:
          toObjectId(
            actorUserId,
            'actorUserId',
          ),
      };

    if (
      input.category !==
      undefined
    ) {
      setValues.category =
        input.category;
    }

    if (
      input.allowedScopes !==
      undefined
    ) {
      setValues.allowedScopes = [
        ...new Set(
          input.allowedScopes,
        ),
      ];
    }

    if (
      input.defaultValue !==
      undefined
    ) {
      setValues.defaultValue =
        input.defaultValue;
    }

    if (
      input.labels !==
      undefined
    ) {
      setValues.labels =
        input.labels;
    }

    if (
      input.validation !==
      undefined
    ) {
      setValues.validation =
        input.validation;
    }

    if (
      input.isMutable !==
      undefined
    ) {
      setValues.isMutable =
        input.isMutable;
    }

    if (
      input.isActive !==
      undefined
    ) {
      setValues.isActive =
        input.isActive;
    }

    if (
      input.cacheTtlSeconds !==
      undefined
    ) {
      setValues.cacheTtlSeconds =
        input.cacheTtlSeconds;
    }

    const update:
      UpdateQuery<SettingDefinitionRecord> = {
        $set: setValues,

        $inc: {
          version: 1,
        },
      };

    return SettingDefinitionModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            definitionId,
            'definitionId',
          ),

        version:
          input.expectedVersion,
      },
      update,
      {
        new: true,
        runValidators: true,
      },
    )
      .lean<SettingDefinitionRecord>()
      .exec();
  }
}