import {
  RoleModel,
} from '@hospital-mis/database';
import type { FilterQuery, UpdateQuery } from 'mongoose';

import { ROLE_SCOPE } from '../identity.constants.js';
import {
  escapeRegex,
  normalizeOptionalText,
  normalizeRoleCode,
  toNullableObjectId,
  toObjectId,
} from '../identity.mapper.js';
import type {
  CreateRolePersistenceInput,
  IdentityPageResult,
  RoleListQuery,
  RoleRecord,
  UpdateRoleInput,
} from '../identity.types.js';

export class RoleRepository {
  public async create(
    input: CreateRolePersistenceInput,
  ): Promise<RoleRecord> {
    const created = await RoleModel.create({
      facilityId: input.facilityId ?? null,
      code: normalizeRoleCode(input.code),
      name: input.name.trim(),
      description: normalizeOptionalText(input.description),
      scope: input.scope,
      isSystem: input.isSystem,
      isActive: input.isActive,
      version: 0,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    });

    return created.toObject() as RoleRecord;
  }

  public async findById(
    roleId: string,
  ): Promise<RoleRecord | null> {
    return RoleModel.findById(toObjectId(roleId, 'roleId'))
      .lean<RoleRecord>()
      .exec();
  }

  public async findByCode(input: {
    code: string;
    scope: RoleRecord['scope'];
    facilityId?: string | null;
  }): Promise<RoleRecord | null> {
    const filter: FilterQuery<RoleRecord> = {
      code: normalizeRoleCode(input.code),
      scope: input.scope,
    };

    if (input.scope === ROLE_SCOPE.FACILITY) {
      filter.facilityId = toObjectId(
        input.facilityId ?? '',
        'facilityId',
      );
    } else {
      filter.facilityId = null;
    }

    return RoleModel.findOne(filter)
      .lean<RoleRecord>()
      .exec();
  }

  public async findActiveByIds(
    roleIds: string[],
  ): Promise<RoleRecord[]> {
    if (roleIds.length === 0) {
      return [];
    }

    return RoleModel.find({
      _id: {
        $in: roleIds.map((id) => toObjectId(id, 'roleId')),
      },
      isActive: true,
    })
      .sort({ scope: 1, name: 1 })
      .lean<RoleRecord[]>()
      .exec();
  }

  public async list(
    query: RoleListQuery,
  ): Promise<IdentityPageResult<RoleRecord>> {
    const filter: FilterQuery<RoleRecord> = {};

    if (query.activeOnly ?? true) {
      filter.isActive = true;
    }

    if (query.scope) {
      filter.scope = query.scope;
    }

    if (query.facilityId) {
      filter.$or = [
        {
          scope: ROLE_SCOPE.GLOBAL,
          facilityId: null,
        },
        {
          scope: ROLE_SCOPE.FACILITY,
          facilityId: toObjectId(query.facilityId, 'facilityId'),
        },
      ];
    }

    if (query.search) {
      const searchRegex = new RegExp(
        escapeRegex(query.search.trim()),
        'i',
      );

      const searchCondition = {
        $or: [
          { code: searchRegex },
          { name: searchRegex },
          { description: searchRegex },
        ],
      };

      if (filter.$or) {
        filter.$and = [
          { $or: filter.$or },
          searchCondition,
        ];
        delete filter.$or;
      } else {
        Object.assign(filter, searchCondition);
      }
    }

    const page = Math.max(1, query.page);
    const pageSize = Math.max(1, query.pageSize);
    const skip = (page - 1) * pageSize;
    const sortBy = query.sortBy ?? 'name';
    const sortDirection = query.sortDirection === 'desc' ? -1 : 1;

    const [items, totalItems] = await Promise.all([
      RoleModel.find(filter)
        .sort({
          [sortBy]: sortDirection,
          code: 1,
          _id: 1,
        })
        .skip(skip)
        .limit(pageSize)
        .lean<RoleRecord[]>()
        .exec(),
      RoleModel.countDocuments(filter).exec(),
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

  public async updateWithVersion(
    roleId: string,
    input: UpdateRoleInput,
    actorUserId: string,
  ): Promise<RoleRecord | null> {
    const update: UpdateQuery<RoleRecord> = {
      $set: {
        updatedBy: toObjectId(actorUserId, 'actorUserId'),
      },
      $inc: {
        version: 1,
      },
    };

    const setValues: Record<string, unknown> = {
      updatedBy: toObjectId(actorUserId, 'actorUserId'),
    };

    if (input.name !== undefined) {
      setValues.name = input.name.trim();
    }

    if (input.description !== undefined) {
      setValues.description = normalizeOptionalText(
        input.description,
      );
    }

    if (input.isActive !== undefined) {
      setValues.isActive = input.isActive;
    }

    update.$set = setValues;

    return RoleModel.findOneAndUpdate(
      {
        _id: toObjectId(roleId, 'roleId'),
        version: input.expectedVersion,
      },
      update,
      {
        new: true,
        runValidators: true,
      },
    )
      .lean<RoleRecord>()
      .exec();
  }

  public async incrementVersion(
    roleId: string,
    expectedVersion: number,
    actorUserId: string,
  ): Promise<RoleRecord | null> {
    return RoleModel.findOneAndUpdate(
      {
        _id: toObjectId(roleId, 'roleId'),
        version: expectedVersion,
      },
      {
        $set: {
          updatedBy: toObjectId(actorUserId, 'actorUserId'),
        },
        $inc: {
          version: 1,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    )
      .lean<RoleRecord>()
      .exec();
  }

  public async countByFacility(
    facilityId: string,
  ): Promise<number> {
    return RoleModel.countDocuments({
      $or: [
        {
          scope: ROLE_SCOPE.GLOBAL,
          facilityId: null,
        },
        {
          scope: ROLE_SCOPE.FACILITY,
          facilityId: toNullableObjectId(
            facilityId,
            'facilityId',
          ),
        },
      ],
      isActive: true,
    }).exec();
  }
}