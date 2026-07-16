import {
  RoleModel,
  RolePermissionModel,
  StaffModel,
  UserModel,
  UserRoleModel,
} from '@hospital-mis/database';

import { toObjectId } from '../identity.mapper.js';
import type {
  RolePermissionRecord,
  UserRoleRecord,
} from '../identity.types.js';

export class IdentityCompensationRepository {
  public async deleteCreatedRoleCascade(
    roleId: string,
  ): Promise<void> {
    const objectId = toObjectId(roleId, 'roleId');

    await RolePermissionModel.deleteMany({
      roleId: objectId,
    }).exec();

    await RoleModel.deleteOne({
      _id: objectId,
    }).exec();
  }

  public async deleteCreatedStaff(
    staffId: string,
  ): Promise<void> {
    await StaffModel.deleteOne({
      _id: toObjectId(staffId, 'staffId'),
    }).exec();
  }

  public async deleteCreatedUserCascade(
    userId: string,
  ): Promise<void> {
    const objectId = toObjectId(userId, 'userId');

    await UserRoleModel.deleteMany({
      userId: objectId,
    }).exec();

    await UserModel.deleteOne({
      _id: objectId,
    }).exec();
  }

  public async deleteRolePermission(input: {
    roleId: string;
    permissionId: string;
  }): Promise<void> {
    await RolePermissionModel.deleteOne({
      roleId: toObjectId(input.roleId, 'roleId'),
      permissionId: toObjectId(
        input.permissionId,
        'permissionId',
      ),
    }).exec();
  }

  public async restoreRolePermission(
    snapshot: Pick<
      RolePermissionRecord,
      'roleId' | 'permissionId' | 'grantedBy' | 'grantedAt'
    >,
  ): Promise<void> {
    await RolePermissionModel.findOneAndUpdate(
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
        upsert: true,
        runValidators: true,
      },
    ).exec();
  }

  public async deleteUserRoleById(
    userRoleId: string,
  ): Promise<void> {
    await UserRoleModel.deleteOne({
      _id: toObjectId(userRoleId, 'userRoleId'),
    }).exec();
  }

  public async restoreUserRoleSnapshot(
    snapshot: UserRoleRecord,
  ): Promise<void> {
    await UserRoleModel.findOneAndUpdate(
      {
        _id: snapshot._id,
      },
      {
        $set: {
          userId: snapshot.userId,
          roleId: snapshot.roleId,
          facilityId: snapshot.facilityId ?? null,
          assignedBy: snapshot.assignedBy,
          assignedAt: snapshot.assignedAt,
          expiresAt: snapshot.expiresAt ?? null,
          isActive: snapshot.isActive,
          revokedAt: snapshot.revokedAt ?? null,
          revokedBy: snapshot.revokedBy ?? null,
          revocationReason:
            snapshot.revocationReason ?? null,
        },
      },
      {
        upsert: true,
        runValidators: true,
      },
    ).exec();
  }
}