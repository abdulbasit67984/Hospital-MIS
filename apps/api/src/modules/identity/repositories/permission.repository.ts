import {
  PermissionModel,
} from '@hospital-mis/database';
import type { FilterQuery } from 'mongoose';

import { escapeRegex, toObjectId } from '../identity.mapper.js';
import type {
  IdentityPageResult,
  PermissionListQuery,
  PermissionRecord,
} from '../identity.types.js';

export class PermissionRepository {
  public async findById(
    permissionId: string,
  ): Promise<PermissionRecord | null> {
    return PermissionModel.findById(
      toObjectId(permissionId, 'permissionId'),
    )
      .lean<PermissionRecord>()
      .exec();
  }

  public async findByCode(
    code: string,
  ): Promise<PermissionRecord | null> {
    return PermissionModel.findOne({
      code: code.trim().toLocaleLowerCase('en-US'),
    })
      .lean<PermissionRecord>()
      .exec();
  }

  public async findByIds(
    permissionIds: string[],
    options: { activeOnly?: boolean } = {},
  ): Promise<PermissionRecord[]> {
    if (permissionIds.length === 0) {
      return [];
    }

    const filter: FilterQuery<PermissionRecord> = {
      _id: {
        $in: permissionIds.map((id) =>
          toObjectId(id, 'permissionId'),
        ),
      },
    };

    if (options.activeOnly ?? true) {
      filter.isActive = true;
    }

    return PermissionModel.find(filter)
      .sort({ module: 1, code: 1 })
      .lean<PermissionRecord[]>()
      .exec();
  }

  public async findActiveByCodes(
    permissionCodes: string[],
  ): Promise<PermissionRecord[]> {
    if (permissionCodes.length === 0) {
      return [];
    }

    const normalizedCodes = [
      ...new Set(
        permissionCodes.map((code) =>
          code.trim().toLocaleLowerCase('en-US'),
        ),
      ),
    ];

    return PermissionModel.find({
      code: { $in: normalizedCodes },
      isActive: true,
    })
      .sort({ module: 1, code: 1 })
      .lean<PermissionRecord[]>()
      .exec();
  }

  public async list(
    query: PermissionListQuery,
  ): Promise<IdentityPageResult<PermissionRecord>> {
    const filter: FilterQuery<PermissionRecord> = {};

    if (query.activeOnly ?? true) {
      filter.isActive = true;
    }

    if (query.module) {
      filter.module = query.module.trim();
    }

    if (query.search) {
      const searchRegex = new RegExp(
        escapeRegex(query.search.trim()),
        'i',
      );

      filter.$or = [
        { code: searchRegex },
        { name: searchRegex },
        { module: searchRegex },
        { description: searchRegex },
      ];
    }

    const page = Math.max(1, query.page);
    const pageSize = Math.max(1, query.pageSize);
    const skip = (page - 1) * pageSize;
    const sortBy = query.sortBy ?? 'module';
    const sortDirection = query.sortDirection === 'desc' ? -1 : 1;

    const [items, totalItems] = await Promise.all([
      PermissionModel.find(filter)
        .sort({
          [sortBy]: sortDirection,
          code: 1,
          _id: 1,
        })
        .skip(skip)
        .limit(pageSize)
        .lean<PermissionRecord[]>()
        .exec(),
      PermissionModel.countDocuments(filter).exec(),
    ]);

    return {
      items,
      page,
      pageSize,
      totalItems,
      totalPages:
        totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
    };
  }

  public async countActiveByIds(
    permissionIds: string[],
  ): Promise<number> {
    if (permissionIds.length === 0) {
      return 0;
    }

    return PermissionModel.countDocuments({
      _id: {
        $in: permissionIds.map((id) =>
          toObjectId(id, 'permissionId'),
        ),
      },
      isActive: true,
    }).exec();
  }
}