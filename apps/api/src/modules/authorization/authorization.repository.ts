import type {
  Db,
} from '@hospital-mis/database';

import {
  toObjectId,
  type DatabaseObjectId,
} from '@hospital-mis/database';

export type UserRoleDocument = {
  facilityId?: DatabaseObjectId | null;
  userId: DatabaseObjectId;
  roleId: DatabaseObjectId;
  isActive: boolean;
  expiresAt?: Date | null;
};

export type RoleDocument = {
  _id: DatabaseObjectId;
  facilityId?: DatabaseObjectId | null;
  scope: 'GLOBAL' | 'FACILITY';
  isActive: boolean;
};

export type RolePermissionDocument = {
  roleId: DatabaseObjectId;
  permissionId: DatabaseObjectId;
};

export type PermissionDocument = {
  _id: DatabaseObjectId;
  code: string;
  isActive: boolean;
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
  public constructor(
    private readonly database: Db,
  ) {}

  public async resolvePermissionKeys(
    facilityIdValue: string,
    userIdValue: string,
  ): Promise<readonly string[]> {
    const facilityId = toObjectId(
      facilityIdValue,
      'facilityId',
    );

    const userId = toObjectId(
      userIdValue,
      'userId',
    );

    const now = new Date();

    const assignments =
      await this.database
        .collection<UserRoleDocument>(
          'userRoles',
        )
        .find({
          userId,
          isActive: true,
          $and: [
            {
              $or: [
                { facilityId: null },
                { facilityId },
              ],
            },
            {
              $or: [
                { expiresAt: null },
                {
                  expiresAt: {
                    $gt: now,
                  },
                },
              ],
            },
          ],
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
          _id: {
            $in: assignedRoleIds,
          },
          isActive: true,
          $or: [
            {
              scope: 'GLOBAL',
              facilityId: null,
            },
            {
              scope: 'FACILITY',
              facilityId,
            },
          ],
        })
        .toArray();

    if (activeRoles.length === 0) {
      return [];
    }

    const activeRoleIds =
      activeRoles.map(
        (role) => role._id,
      );

    const rolePermissions =
      await this.database
        .collection<RolePermissionDocument>(
          'rolePermissions',
        )
        .find({
          roleId: {
            $in: activeRoleIds,
          },
        })
        .toArray();

    if (rolePermissions.length === 0) {
      return [];
    }

    const permissionIds = [
      ...new Map(
        rolePermissions.map(
          (assignment) => [
            assignment.permissionId.toHexString(),
            assignment.permissionId,
          ],
        ),
      ).values(),
    ];

    const activePermissions =
      await this.database
        .collection<PermissionDocument>(
          'permissions',
        )
        .find({
          _id: {
            $in: permissionIds,
          },
          isActive: true,
        })
        .toArray();

    return [
      ...new Set(
        activePermissions.map(
          (permission) =>
            permission.code,
        ),
      ),
    ].sort();
  }

  public async incrementUserPermissionVersion(
    facilityId: string,
    userId: string,
  ): Promise<boolean> {
    void facilityId;

    const result =
      await this.database
        .collection('users')
        .updateOne(
          {
            _id: toObjectId(
              userId,
              'userId',
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