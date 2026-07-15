import type {
  Db,
} from '@hospital-mis/database';

import {
  toObjectId,
  type DatabaseObjectId,
} from '@hospital-mis/database';

export type UserRoleDocument = {
  facilityId: DatabaseObjectId;
  userId: DatabaseObjectId;
  roleId: DatabaseObjectId;
  active: boolean;
};

export type RoleDocument = {
  _id: DatabaseObjectId;
  facilityId: DatabaseObjectId;
  active: boolean;
};

export type RolePermissionDocument = {
  facilityId: DatabaseObjectId;
  roleId: DatabaseObjectId;
  permissionKey: string;
  active: boolean;
};

export type PermissionDocument = {
  facilityId: DatabaseObjectId;
  key: string;
  active: boolean;
};

export interface AuthorizationRepository {
  resolvePermissionKeys(
    facilityId: string,
    userId: string,
  ): Promise<readonly string[]>;

  incrementUserPermissionVersion(
    facilityId: string,
    userId: string,
  ): Promise<boolean>;
}

export class MongoAuthorizationRepository
implements AuthorizationRepository {
  constructor(
    private readonly database: Db,
  ) {}

  async resolvePermissionKeys(
    facilityIdValue: string,
    userIdValue: string,
  ): Promise<readonly string[]> {
    const facilityId =
      toObjectId(
        facilityIdValue,
        'facilityId',
      );

    const userId =
      toObjectId(
        userIdValue,
        'userId',
      );

    const assignments =
      await this.database
        .collection<UserRoleDocument>(
          'userRoles',
        )
        .find({
          facilityId,
          userId,
          active: true,
        })
        .toArray();

    if (assignments.length === 0) {
      return [];
    }

    const assignedRoleIds =
      assignments.map(
        (assignment) =>
          assignment.roleId,
      );

    const activeRoles =
      await this.database
        .collection<RoleDocument>(
          'roles',
        )
        .find({
          facilityId,

          _id: {
            $in: assignedRoleIds,
          },

          active: true,
        })
        .toArray();

    if (activeRoles.length === 0) {
      return [];
    }

    const activeRoleIds =
      activeRoles.map(
        (role) =>
          role._id,
      );

    const rolePermissions =
      await this.database
        .collection<RolePermissionDocument>(
          'rolePermissions',
        )
        .find({
          facilityId,

          roleId: {
            $in: activeRoleIds,
          },

          active: true,
        })
        .toArray();

    if (
      rolePermissions.length === 0
    ) {
      return [];
    }

    const candidateKeys = [
      ...new Set(
        rolePermissions.map(
          (assignment) =>
            assignment.permissionKey,
        ),
      ),
    ];

    const activePermissions =
      await this.database
        .collection<PermissionDocument>(
          'permissions',
        )
        .find({
          facilityId,

          key: {
            $in: candidateKeys,
          },

          active: true,
        })
        .toArray();

    return [
      ...new Set(
        activePermissions.map(
          (permission) =>
            permission.key,
        ),
      ),
    ];
  }

  async incrementUserPermissionVersion(
    facilityId: string,
    userId: string,
  ): Promise<boolean> {
    const result =
      await this.database
        .collection('users')
        .updateOne(
          {
            _id:
              toObjectId(
                userId,
                'userId',
              ),

            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),

            status: {
              $ne: 'DISABLED',
            },
          },

          {
            $inc: {
              permissionVersion: 1,
              version: 1,
            },

            $currentDate: {
              updatedAt: true,
            },
          },
        );

    return result.modifiedCount === 1;
  }
}