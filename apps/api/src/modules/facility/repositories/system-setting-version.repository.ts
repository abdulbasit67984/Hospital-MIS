import {
  SystemSettingVersionModel,
} from '@hospital-mis/database';

import {
  toNullableObjectId,
  toObjectId,
} from '../facility.mapper.js';
import type {
  CreateSystemSettingVersionInput,
  PageResult,
  SystemSettingVersionRecord,
} from '../facility.types.js';

export class SystemSettingVersionRepository {
  public async append(
    input:
      CreateSystemSettingVersionInput,
  ): Promise<SystemSettingVersionRecord> {
    const created =
      await SystemSettingVersionModel.create({
        settingId:
          toObjectId(
            input.settingId,
            'settingId',
          ),

        definitionId:
          toObjectId(
            input.definitionId,
            'definitionId',
          ),

        key:
          input.key,

        scope:
          input.scope,

        facilityId:
          toNullableObjectId(
            input.facilityId,
            'facilityId',
          ),

        revision:
          input.revision,

        changeType:
          input.changeType,

        changeSource:
          input.changeSource,

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

        isActive:
          input.isActive,

        changedBy:
          toNullableObjectId(
            input.changedBy,
            'changedBy',
          ),

        changeReason:
          input.changeReason.trim(),

        correlationId:
          input.correlationId,

        changedAt:
          input.changedAt,
      });

    return created.toObject() as SystemSettingVersionRecord;
  }

  public async findBySettingAndRevision(
    settingId: string,
    revision: number,
    includeProtectedValues = false,
  ): Promise<SystemSettingVersionRecord | null> {
    const query =
      SystemSettingVersionModel.findOne({
        settingId:
          toObjectId(
            settingId,
            'settingId',
          ),

        revision,
      });

    if (includeProtectedValues) {
      query.select(
        '+value +encryptedValue +valueHash',
      );
    }

    return query
      .lean<SystemSettingVersionRecord>()
      .exec();
  }

  public async listBySetting(
    input: {
      settingId: string;
      page: number;
      pageSize: number;
      sortDirection:
        | 'asc'
        | 'desc';
    },
  ): Promise<
    PageResult<SystemSettingVersionRecord>
  > {
    const page =
      Math.max(1, input.page);

    const pageSize =
      Math.max(
        1,
        input.pageSize,
      );

    const skip =
      (page - 1) * pageSize;

    const direction =
      input.sortDirection ===
      'desc'
        ? -1
        : 1;

    const filter = {
      settingId:
        toObjectId(
          input.settingId,
          'settingId',
        ),
    };

    const [
      items,
      totalItems,
    ] = await Promise.all([
      SystemSettingVersionModel.find(
        filter,
      )
        .sort({
          revision:
            direction,
          _id: direction,
        })
        .skip(skip)
        .limit(pageSize)
        .lean<
          SystemSettingVersionRecord[]
        >()
        .exec(),

      SystemSettingVersionModel.countDocuments(
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

  public async exists(
    settingId: string,
    revision: number,
  ): Promise<boolean> {
    const result =
      await SystemSettingVersionModel.exists({
        settingId:
          toObjectId(
            settingId,
            'settingId',
          ),

        revision,
      });

    return result !== null;
  }
}