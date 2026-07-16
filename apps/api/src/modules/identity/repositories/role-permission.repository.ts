import {
  PermissionModel,
  RolePermissionModel,
} from '@hospital-mis/database';
import type { Types } from 'mongoose';

import {
  toObjectId,
} from '../identity.mapper.js';
import type {
  PermissionRecord,
  RolePermissionRecord,
} from '../identity.types.js';

export interface GrantRolePermissionInput {
  roleId: string;
  permissionId: string;
  grantedBy: string;
}

export interface RevokedRolePermissionSnapshot {
  roleId: Types.ObjectId;
  permissionId: Types.ObjectId;
  grantedBy: Types.ObjectId;
  grantedAt: Date;
}

export class RolePermissionRepository {
  public async findAssignments(
    roleId: string,
  ): Promise<RolePermissionRecord[]> {
    return RolePermissionModel.find({
      roleId: toObjectId(roleId, 'roleId'),
    })
      .sort({ createdAt: 1, _id: 1 })
      .lean<RolePermissionRecord[]>()
      .exec();
  }

  public async findPermissionIds(
    roleId: string,
  ): Promise<string[]> {
    const assignments = await RolePermissionModel.find(
      {
        roleId: toObjectId(roleId, 'roleId'),
      },
      {
        permissionId: 1,
      },
    )
      .sort({ permissionId: 1 })
      .lean<Array<Pick<RolePermissionRecord, 'permissionId'>>>()
      .exec();

    return assignments.map((assignment) =>
      assignment.permissionId.toHexString(),
    );
  }

  public async findPermissions(
    roleId: string,
    options: { activeOnly?: boolean } = {},
  ): Promise<PermissionRecord[]> {
    const assignments = await RolePermissionModel.find(
      {
        roleId: toObjectId(roleId, 'roleId'),
      },
      {
        permissionId: 1,
      },
    )
      .lean<Array<Pick<RolePermissionRecord, 'permissionId'>>>()
      .exec();

    if (assignments.length === 0) {
      return [];
    }

    const filter: Record<string, unknown> = {
      _id: {
        $in: assignments.map(
          (assignment) => assignment.permissionId,
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

  public async grant(
    input: GrantRolePermissionInput,
  ): Promise<{
    assignment: RolePermissionRecord;
    created: boolean;
  }> {
    const roleId = toObjectId(input.roleId, 'roleId');
    const permissionId = toObjectId(
      input.permissionId,
      'permissionId',
    );
    const grantedBy = toObjectId(input.grantedBy, 'grantedBy');
    const grantedAt = new Date();

    const result = await RolePermissionModel.findOneAndUpdate(
      {
        roleId,
        permissionId,
      },
      {
        $setOnInsert: {
          roleId,
          permissionId,
          grantedBy,
          grantedAt,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        includeResultMetadata: true,
      },
    ).exec();

    const document = result.value;

    if (!document) {
      throw new Error(
        'Role-permission upsert completed without returning a document',
      );
    }

    return {
      assignment: document.toObject() as RolePermissionRecord,
      created: !result.lastErrorObject?.updatedExisting,
    };
  }

  public async revoke(input: {
    roleId: string;
    permissionId: string;
  }): Promise<RevokedRolePermissionSnapshot | null> {
    const deleted = await RolePermissionModel.findOneAndDelete({
      roleId: toObjectId(input.roleId, 'roleId'),
      permissionId: toObjectId(
        input.permissionId,
        'permissionId',
      ),
    })
      .lean<RolePermissionRecord>()
      .exec();

    if (!deleted) {
      return null;
    }

    return {
      roleId: deleted.roleId,
      permissionId: deleted.permissionId,
      grantedBy: deleted.grantedBy,
      grantedAt: deleted.grantedAt,
    };
  }

  public async restore(
    snapshot: RevokedRolePermissionSnapshot,
  ): Promise<RolePermissionRecord> {
    const restored = await RolePermissionModel.findOneAndUpdate(
      {
        roleId: snapshot.roleId,
        permissionId: snapshot.permissionId,
      },
      {
        $setOnInsert: {
          roleId: snapshot.roleId,
          permissionId: snapshot.permissionId,
          grantedBy: snapshot.grantedBy,
          grantedAt: snapshot.grantedAt,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      },
    ).exec();

    if (!restored) {
      throw new Error(
        'Role-permission restoration did not return a document',
      );
    }

    return restored.toObject() as RolePermissionRecord;
  }

  public async countForRole(roleId: string): Promise<number> {
    return RolePermissionModel.countDocuments({
      roleId: toObjectId(roleId, 'roleId'),
    }).exec();
  }
}