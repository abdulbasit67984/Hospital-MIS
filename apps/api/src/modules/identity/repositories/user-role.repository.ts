import {
  UserRoleModel,
} from '@hospital-mis/database';
import type { Types } from 'mongoose';

import {
  parseOptionalDate,
  toNullableObjectId,
  toObjectId,
} from '../identity.mapper.js';
import type {
  UserRoleRecord,
} from '../identity.types.js';

export interface AssignUserRoleInput {
  userId: string;
  roleId: string;
  facilityId?: string | null;
  assignedBy: string;
  expiresAt?: string | Date | null;
}

export interface RevokeUserRoleInput {
  userRoleId: string;
  revokedBy: string;
  reason: string;
}

export interface UserRoleStateSnapshot {
  exists: boolean;
  id: string | null;
  userId: string;
  roleId: string;
  facilityId: string | null;
  assignedBy: string | null;
  assignedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  revokedAt: string | null;
  revokedBy: string | null;
  revocationReason: string | null;
}

export class UserRoleRepository {
  public async findById(
    userRoleId: string,
  ): Promise<UserRoleRecord | null> {
    return UserRoleModel.findById(
      toObjectId(userRoleId, 'userRoleId'),
    )
      .lean<UserRoleRecord>()
      .exec();
  }

  public async findByIdentity(input: {
    userId: string;
    roleId: string;
    facilityId?: string | null;
  }): Promise<UserRoleRecord | null> {
    return UserRoleModel.findOne({
      userId: toObjectId(
        input.userId,
        'userId',
      ),
      roleId: toObjectId(
        input.roleId,
        'roleId',
      ),
      facilityId: toNullableObjectId(
        input.facilityId,
        'facilityId',
      ),
    })
      .lean<UserRoleRecord>()
      .exec();
  }

  public async findAssignments(
    userId: string,
    options: {
      activeOnly?: boolean;
      facilityId?: string;
      includeExpired?: boolean;
    } = {},
  ): Promise<UserRoleRecord[]> {
    const now = new Date();

    const filter: Record<
      string,
      unknown
    > = {
      userId: toObjectId(userId, 'userId'),
    };

    if (options.activeOnly ?? true) {
      filter.isActive = true;
    }

    if (options.facilityId) {
      filter.$or = [
        { facilityId: null },
        {
          facilityId: toObjectId(
            options.facilityId,
            'facilityId',
          ),
        },
      ];
    }

    if (!(options.includeExpired ?? false)) {
      const expiryCondition = {
        $or: [
          { expiresAt: null },
          {
            expiresAt: {
              $gt: now,
            },
          },
        ],
      };

      if (filter.$or) {
        filter.$and = [
          { $or: filter.$or },
          expiryCondition,
        ];

        delete filter.$or;
      } else {
        Object.assign(
          filter,
          expiryCondition,
        );
      }
    }

    return UserRoleModel.find(filter)
      .sort({
        facilityId: 1,
        roleId: 1,
        assignedAt: 1,
      })
      .lean<UserRoleRecord[]>()
      .exec();
  }

  public async findActiveAssignment(input: {
    userId: string;
    roleId: string;
    facilityId?: string | null;
  }): Promise<UserRoleRecord | null> {
    return UserRoleModel.findOne({
      userId: toObjectId(
        input.userId,
        'userId',
      ),
      roleId: toObjectId(
        input.roleId,
        'roleId',
      ),
      facilityId: toNullableObjectId(
        input.facilityId,
        'facilityId',
      ),
      isActive: true,
      $or: [
        { expiresAt: null },
        {
          expiresAt: {
            $gt: new Date(),
          },
        },
      ],
    })
      .lean<UserRoleRecord>()
      .exec();
  }

  public async assign(
    input: AssignUserRoleInput,
  ): Promise<{
    assignment: UserRoleRecord;
    created: boolean;
    reactivated: boolean;
    previousState: UserRoleStateSnapshot;
  }> {
    const userId = toObjectId(
      input.userId,
      'userId',
    );
    const roleId = toObjectId(
      input.roleId,
      'roleId',
    );
    const facilityId = toNullableObjectId(
      input.facilityId,
      'facilityId',
    );
    const assignedBy = toObjectId(
      input.assignedBy,
      'assignedBy',
    );
    const expiresAt = parseOptionalDate(
      input.expiresAt,
    );
    const assignedAt = new Date();

    const existing =
      await UserRoleModel.findOne({
        userId,
        roleId,
        facilityId,
      }).exec();

    const previousState =
      this.createSnapshot(
        existing
          ? (existing.toObject() as UserRoleRecord)
          : null,
        {
          userId: input.userId,
          roleId: input.roleId,
          facilityId:
            input.facilityId ?? null,
        },
      );

    if (existing) {
      const wasInactive =
        !existing.isActive;

      existing.isActive = true;
      existing.assignedBy = assignedBy;
      existing.assignedAt = assignedAt;
      existing.expiresAt = expiresAt;
      existing.revokedAt = null;
      existing.revokedBy = null;
      existing.revocationReason = null;

      await existing.save();

      return {
        assignment:
          existing.toObject() as UserRoleRecord,
        created: false,
        reactivated: wasInactive,
        previousState,
      };
    }

    const created =
      await UserRoleModel.create({
        userId,
        roleId,
        facilityId,
        assignedBy,
        assignedAt,
        expiresAt,
        isActive: true,
        revokedAt: null,
        revokedBy: null,
        revocationReason: null,
      });

    return {
      assignment:
        created.toObject() as UserRoleRecord,
      created: true,
      reactivated: false,
      previousState,
    };
  }

  public async revoke(
    input: RevokeUserRoleInput,
  ): Promise<{
    assignment: UserRoleRecord;
    previousState: UserRoleStateSnapshot;
  } | null> {
    const existing =
      await UserRoleModel.findOne({
        _id: toObjectId(
          input.userRoleId,
          'userRoleId',
        ),
        isActive: true,
      }).exec();

    if (!existing) {
      return null;
    }

    const previousState =
      this.createSnapshot(
        existing.toObject() as UserRoleRecord,
      );

    existing.isActive = false;
    existing.revokedAt = new Date();
    existing.revokedBy = toObjectId(
      input.revokedBy,
      'revokedBy',
    );
    existing.revocationReason =
      input.reason.trim();

    await existing.save();

    return {
      assignment:
        existing.toObject() as UserRoleRecord,
      previousState,
    };
  }

  public async restoreSnapshot(
    snapshot: UserRoleStateSnapshot,
  ): Promise<UserRoleRecord | null> {
    if (!snapshot.exists) {
      await this.deleteByIdentity({
        userId: snapshot.userId,
        roleId: snapshot.roleId,
        facilityId:
          snapshot.facilityId,
      });

      return null;
    }

    if (
      !snapshot.id ||
      !snapshot.assignedBy ||
      !snapshot.assignedAt
    ) {
      throw new Error(
        'Existing user-role snapshot is incomplete',
      );
    }

    return UserRoleModel.findOneAndUpdate(
      {
        _id: toObjectId(
          snapshot.id,
          'userRoleId',
        ),
      },
      {
        $set: {
          userId: toObjectId(
            snapshot.userId,
            'userId',
          ),
          roleId: toObjectId(
            snapshot.roleId,
            'roleId',
          ),
          facilityId:
            toNullableObjectId(
              snapshot.facilityId,
              'facilityId',
            ),
          assignedBy: toObjectId(
            snapshot.assignedBy,
            'assignedBy',
          ),
          assignedAt: new Date(
            snapshot.assignedAt,
          ),
          expiresAt:
            snapshot.expiresAt
              ? new Date(
                  snapshot.expiresAt,
                )
              : null,
          isActive:
            snapshot.isActive,
          revokedAt:
            snapshot.revokedAt
              ? new Date(
                  snapshot.revokedAt,
                )
              : null,
          revokedBy:
            toNullableObjectId(
              snapshot.revokedBy,
              'revokedBy',
            ),
          revocationReason:
            snapshot.revocationReason,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      },
    )
      .lean<UserRoleRecord>()
      .exec();
  }

  public async deleteByIdentity(input: {
    userId: string;
    roleId: string;
    facilityId?: string | null;
  }): Promise<boolean> {
    const deleted =
      await UserRoleModel.findOneAndDelete({
        userId: toObjectId(
          input.userId,
          'userId',
        ),
        roleId: toObjectId(
          input.roleId,
          'roleId',
        ),
        facilityId:
          toNullableObjectId(
            input.facilityId,
            'facilityId',
          ),
      }).exec();

    return Boolean(deleted);
  }

  public async revokeAllForUser(input: {
    userId: string;
    revokedBy: string;
    reason: string;
    excludeAssignmentIds?: string[];
  }): Promise<number> {
    const filter: Record<
      string,
      unknown
    > = {
      userId: toObjectId(
        input.userId,
        'userId',
      ),
      isActive: true,
    };

    if (
      input.excludeAssignmentIds &&
      input.excludeAssignmentIds.length >
        0
    ) {
      filter._id = {
        $nin:
          input.excludeAssignmentIds.map(
            (id) =>
              toObjectId(
                id,
                'userRoleId',
              ),
          ),
      };
    }

    const result =
      await UserRoleModel.updateMany(
        filter,
        {
          $set: {
            isActive: false,
            revokedAt: new Date(),
            revokedBy: toObjectId(
              input.revokedBy,
              'revokedBy',
            ),
            revocationReason:
              input.reason.trim(),
          },
        },
        {
          runValidators: true,
        },
      ).exec();

    return result.modifiedCount;
  }

  public async countActiveAssignments(
    userId: string,
  ): Promise<number> {
    return UserRoleModel.countDocuments({
      userId: toObjectId(
        userId,
        'userId',
      ),
      isActive: true,
      $or: [
        { expiresAt: null },
        {
          expiresAt: {
            $gt: new Date(),
          },
        },
      ],
    }).exec();
  }

  public createSnapshot(
    record: UserRoleRecord | null,
    identity?: {
      userId: string;
      roleId: string;
      facilityId?: string | null;
    },
  ): UserRoleStateSnapshot {
    if (!record) {
      if (!identity) {
        throw new Error(
          'Identity is required for a missing user-role snapshot',
        );
      }

      return {
        exists: false,
        id: null,
        userId: identity.userId,
        roleId: identity.roleId,
        facilityId:
          identity.facilityId ?? null,
        assignedBy: null,
        assignedAt: null,
        expiresAt: null,
        isActive: false,
        revokedAt: null,
        revokedBy: null,
        revocationReason: null,
      };
    }

    return {
      exists: true,
      id: record._id.toHexString(),
      userId:
        record.userId.toHexString(),
      roleId:
        record.roleId.toHexString(),
      facilityId:
        record.facilityId?.toHexString() ??
        null,
      assignedBy:
        record.assignedBy.toHexString(),
      assignedAt:
        record.assignedAt.toISOString(),
      expiresAt:
        record.expiresAt?.toISOString() ??
        null,
      isActive: record.isActive,
      revokedAt:
        record.revokedAt?.toISOString() ??
        null,
      revokedBy:
        record.revokedBy?.toHexString() ??
        null,
      revocationReason:
        record.revocationReason ?? null,
    };
  }
}