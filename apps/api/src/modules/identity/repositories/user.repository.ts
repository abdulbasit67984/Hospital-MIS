import {
  UserModel,
  UserRoleModel,
} from '@hospital-mis/database';
import type {
  FilterQuery,
  UpdateQuery,
} from 'mongoose';

import {
  escapeRegex,
  normalizeEmail,
  normalizeUsername,
  toNullableObjectId,
  toObjectId,
} from '../identity.mapper.js';
import type {
  CreateUserPersistenceInput,
  IdentityPageResult,
  UpdateUserInput,
  UserCredentialRecord,
  UserListQuery,
  UserRecord,
} from '../identity.types.js';

type PersistedUserRecord = Omit<
  UserRecord,
  'failedLoginAttempts'
>;

type PersistedUserCredentialRecord = Omit<
  UserCredentialRecord,
  'failedLoginAttempts'
>;

export class UserRepository {
  public async create(
    input: CreateUserPersistenceInput,
  ): Promise<UserRecord> {
    const created = await UserModel.create({
      staffId: input.staffId ?? null,
      username: input.username.trim(),
      normalizedUsername: normalizeUsername(
        input.username,
      ),
      email: normalizeEmail(input.email),
      normalizedEmail: normalizeEmail(
        input.email,
      ),
      passwordHash: input.passwordHash,
      status: input.status,
      mustChangePassword:
        input.mustChangePassword,
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: null,
      passwordChangedAt: new Date(),
      version: 0,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    });

    const record =
      created.toObject() as PersistedUserCredentialRecord;

    return this.removeCredentialFields(record);
  }

  public async findById(
    userId: string,
  ): Promise<UserRecord | null> {
    const record = await UserModel.findById(
      toObjectId(userId, 'userId'),
    )
      .select('-passwordHash')
      .lean<PersistedUserRecord>()
      .exec();

    return this.toIdentityRecord(record);
  }

  public async findCredentialById(
    userId: string,
  ): Promise<UserCredentialRecord | null> {
    const record = await UserModel.findById(
      toObjectId(userId, 'userId'),
    )
      .select('+passwordHash')
      .lean<PersistedUserCredentialRecord>()
      .exec();

    return this.toCredentialRecord(record);
  }

  public async findCredentialByUsername(
    username: string,
  ): Promise<UserCredentialRecord | null> {
    const record = await UserModel.findOne({
      normalizedUsername:
        normalizeUsername(username),
    })
      .select('+passwordHash')
      .lean<PersistedUserCredentialRecord>()
      .exec();

    return this.toCredentialRecord(record);
  }

  public async findByUsername(
    username: string,
  ): Promise<UserRecord | null> {
    const record = await UserModel.findOne({
      normalizedUsername:
        normalizeUsername(username),
    })
      .select('-passwordHash')
      .lean<PersistedUserRecord>()
      .exec();

    return this.toIdentityRecord(record);
  }

  public async findByEmail(
    email: string,
  ): Promise<UserRecord | null> {
    const normalizedEmail =
      normalizeEmail(email);

    if (!normalizedEmail) {
      return null;
    }

    const record = await UserModel.findOne({
      normalizedEmail,
    })
      .select('-passwordHash')
      .lean<PersistedUserRecord>()
      .exec();

    return this.toIdentityRecord(record);
  }

  public async findByStaffId(
    staffId: string,
  ): Promise<UserRecord | null> {
    const record = await UserModel.findOne({
      staffId: toObjectId(staffId, 'staffId'),
    })
      .select('-passwordHash')
      .lean<PersistedUserRecord>()
      .exec();

    return this.toIdentityRecord(record);
  }

  public async list(
    query: UserListQuery,
  ): Promise<IdentityPageResult<UserRecord>> {
    const filter: FilterQuery<PersistedUserRecord> = {};

    if (query.staffId) {
      filter.staffId = toObjectId(
        query.staffId,
        'staffId',
      );
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.search) {
      const searchRegex = new RegExp(
        escapeRegex(query.search.trim()),
        'i',
      );

      filter.$or = [
        { username: searchRegex },
        { normalizedUsername: searchRegex },
        { email: searchRegex },
        { normalizedEmail: searchRegex },
      ];
    }

    if (query.facilityId) {
      const now = new Date();

      const userIds =
        await UserRoleModel.distinct(
          'userId',
          {
            isActive: true,
            $and: [
              {
                $or: [
                  { facilityId: null },
                  {
                    facilityId: toObjectId(
                      query.facilityId,
                      'facilityId',
                    ),
                  },
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
          },
        ).exec();

      filter._id = {
        $in: userIds,
      };
    }

    const page = Math.max(1, query.page);
    const pageSize = Math.max(
      1,
      query.pageSize,
    );
    const skip = (page - 1) * pageSize;
    const sortBy =
      query.sortBy ?? 'username';
    const sortDirection =
      query.sortDirection === 'desc'
        ? -1
        : 1;

    const [persistedItems, totalItems] =
      await Promise.all([
        UserModel.find(filter)
          .select('-passwordHash')
          .sort({
            [sortBy]: sortDirection,
            username: 1,
            _id: 1,
          })
          .skip(skip)
          .limit(pageSize)
          .lean<PersistedUserRecord[]>()
          .exec(),

        UserModel.countDocuments(
          filter,
        ).exec(),
      ]);

    return {
      items: persistedItems.map(
        (record) =>
          this.withCompatibilityCounter(
            record,
          ),
      ),
      page,
      pageSize,
      totalItems,
      totalPages:
        totalItems === 0
          ? 0
          : Math.ceil(
              totalItems / pageSize,
            ),
    };
  }

  public async updateWithVersion(
    userId: string,
    input: UpdateUserInput,
    actorUserId: string,
  ): Promise<UserRecord | null> {
    const setValues: Record<
      string,
      unknown
    > = {
      updatedBy: toObjectId(
        actorUserId,
        'actorUserId',
      ),
    };

    if (input.email !== undefined) {
      const normalizedEmail =
        normalizeEmail(input.email);

      setValues.email = normalizedEmail;
      setValues.normalizedEmail =
        normalizedEmail;
    }

    if (input.status !== undefined) {
      setValues.status = input.status;

      if (input.status !== 'LOCKED') {
        setValues.lockedUntil = null;
        setValues.failedLoginCount = 0;
      }
    }

    if (
      input.mustChangePassword !== undefined
    ) {
      setValues.mustChangePassword =
        input.mustChangePassword;
    }

    const update: UpdateQuery<PersistedUserRecord> = {
      $set: setValues,
      $inc: {
        version: 1,
      },
    };

    const record = await UserModel.findOneAndUpdate(
      {
        _id: toObjectId(userId, 'userId'),
        version: input.expectedVersion,
      },
      update,
      {
        new: true,
        runValidators: true,
        projection: {
          passwordHash: 0,
        },
      },
    )
      .lean<PersistedUserRecord>()
      .exec();

    return this.toIdentityRecord(record);
  }

  public async updatePassword(input: {
    userId: string;
    passwordHash: string;
    mustChangePassword: boolean;
    expectedVersion: number;
    actorUserId: string;
  }): Promise<UserRecord | null> {
    const record = await UserModel.findOneAndUpdate(
      {
        _id: toObjectId(
          input.userId,
          'userId',
        ),
        version: input.expectedVersion,
      },
      {
        $set: {
          passwordHash:
            input.passwordHash,
          passwordChangedAt: new Date(),
          mustChangePassword:
            input.mustChangePassword,
          failedLoginCount: 0,
          lockedUntil: null,
          updatedBy: toObjectId(
            input.actorUserId,
            'actorUserId',
          ),
        },
        $inc: {
          version: 1,
        },
      },
      {
        new: true,
        runValidators: true,
        projection: {
          passwordHash: 0,
        },
      },
    )
      .lean<PersistedUserRecord>()
      .exec();

    return this.toIdentityRecord(record);
  }

  public async attachStaff(input: {
    userId: string;
    staffId: string | null;
    expectedVersion: number;
    actorUserId: string;
  }): Promise<UserRecord | null> {
    const record = await UserModel.findOneAndUpdate(
      {
        _id: toObjectId(
          input.userId,
          'userId',
        ),
        version: input.expectedVersion,
      },
      {
        $set: {
          staffId: toNullableObjectId(
            input.staffId,
            'staffId',
          ),
          updatedBy: toObjectId(
            input.actorUserId,
            'actorUserId',
          ),
        },
        $inc: {
          version: 1,
        },
      },
      {
        new: true,
        runValidators: true,
        projection: {
          passwordHash: 0,
        },
      },
    )
      .lean<PersistedUserRecord>()
      .exec();

    return this.toIdentityRecord(record);
  }

  public async existsById(
    userId: string,
  ): Promise<boolean> {
    return Boolean(
      await UserModel.exists({
        _id: toObjectId(userId, 'userId'),
      }).exec(),
    );
  }

  private toIdentityRecord(
    record: PersistedUserRecord | null,
  ): UserRecord | null {
    return record === null
      ? null
      : this.withCompatibilityCounter(
          record,
        );
  }

  private toCredentialRecord(
    record:
      | PersistedUserCredentialRecord
      | null,
  ): UserCredentialRecord | null {
    return record === null
      ? null
      : this.withCompatibilityCounter(
          record,
        );
  }

  private withCompatibilityCounter<
    T extends PersistedUserRecord,
  >(
    record: T,
  ): T & {
    failedLoginAttempts: number;
  } {
    return {
      ...record,
      failedLoginAttempts:
        record.failedLoginCount,
    };
  }

  private removeCredentialFields(
    record: PersistedUserCredentialRecord,
  ): UserRecord {
    const {
      passwordHash: _passwordHash,
      ...safeRecord
    } = record;

    return this.withCompatibilityCounter(
      safeRecord,
    );
  }
}