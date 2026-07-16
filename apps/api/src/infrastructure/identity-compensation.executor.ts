import {
  RoleModel,
  RolePermissionModel,
  StaffModel,
  UserModel,
  UserRoleModel,
} from '@hospital-mis/database';

import {
  ConflictError,
} from '@hospital-mis/shared';

import {
  toNullableObjectId,
  toObjectId,
} from '../identity.mapper.js';

import type {
  IdentityTransactionCompensation,
} from '../identity.ports.js';

import {
  IDENTITY_COMPENSATION_TYPES,
} from '../identity.transaction.constants.js';

import {
  UserRoleRepository,
  type UserRoleStateSnapshot,
} from '../repositories/user-role.repository.js';

export interface IdentityCompensationExecutorPort {
  execute(
    compensation:
      IdentityTransactionCompensation,
  ): Promise<void>;
}

type JsonObject = Record<string, unknown>;

function asObject(
  value: unknown,
  fieldName: string,
): JsonObject {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(
      `${fieldName} must be an object`,
    );
  }

  return value as JsonObject;
}

function asString(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== 'string' ||
    value.length === 0
  ) {
    throw new Error(
      `${fieldName} must be a non-empty string`,
    );
  }

  return value;
}

function asNumber(
  value: unknown,
  fieldName: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `${fieldName} must be a non-negative integer`,
    );
  }

  return value;
}

function nullableString(
  value: unknown,
): string | null {
  return typeof value === 'string'
    ? value
    : null;
}

function nullableDate(
  value: unknown,
): Date | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const parsed =
    value instanceof Date
      ? value
      : new Date(
          asString(
            value,
            'date',
          ),
        );

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    throw new Error(
      'Date value is invalid',
    );
  }

  return parsed;
}

function requiredDate(
  value: unknown,
  fieldName: string,
): Date {
  const parsed =
    nullableDate(
      value,
    );

  if (
    parsed === null
  ) {
    throw new Error(
      `${fieldName} is required`,
    );
  }

  return parsed;
}

function hasOwn(
  value: JsonObject,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(
    value,
    key,
  );
}

export class IdentityCompensationExecutor
implements IdentityCompensationExecutorPort {
  public constructor(
    private readonly userRoleRepository =
      new UserRoleRepository(),
  ) {}

  public async execute(
    compensation:
      IdentityTransactionCompensation,
  ): Promise<void> {
    switch (
      compensation.type
    ) {
      case IDENTITY_COMPENSATION_TYPES
        .DELETE_CREATED_ROLE:
        await this.deleteCreatedRole(
          compensation.payload,
        );
        return;

      case IDENTITY_COMPENSATION_TYPES
        .RESTORE_ROLE:
        await this.restoreRole(
          compensation.payload,
        );
        return;

      case IDENTITY_COMPENSATION_TYPES
        .DELETE_CREATED_ROLE_PERMISSION:
        await this.deleteRolePermission(
          compensation.payload,
        );
        return;

      case IDENTITY_COMPENSATION_TYPES
        .RESTORE_ROLE_PERMISSION:
        await this.restoreRolePermission(
          compensation.payload,
        );
        return;

      case IDENTITY_COMPENSATION_TYPES
        .DELETE_CREATED_STAFF:
        await this.deleteCreatedStaff(
          compensation.payload,
        );
        return;

      case IDENTITY_COMPENSATION_TYPES
        .RESTORE_STAFF:
        await this.restoreStaff(
          compensation.payload,
        );
        return;

      case IDENTITY_COMPENSATION_TYPES
        .DELETE_CREATED_USER:
        await this.deleteCreatedUser(
          compensation.payload,
        );
        return;

      case IDENTITY_COMPENSATION_TYPES
        .RESTORE_USER:
        await this.restoreUser(
          compensation.payload,
        );
        return;

      case IDENTITY_COMPENSATION_TYPES
        .DELETE_CREATED_USER_ROLE:
        await this.deleteCreatedUserRole(
          compensation.payload,
        );
        return;

      case IDENTITY_COMPENSATION_TYPES
        .RESTORE_USER_ROLE:
        await this.restoreUserRole(
          compensation.payload,
        );
        return;

      default:
        throw new Error(
          `Unsupported identity compensation type: ${compensation.type}`,
        );
    }
  }

  private async deleteCreatedRole(
    payload: JsonObject,
  ): Promise<void> {
    const roleId =
      asString(
        payload['roleId'],
        'roleId',
      );

    const expectedVersion =
      asNumber(
        payload[
          'expectedVersion'
        ],
        'expectedVersion',
      );

    const objectId =
      toObjectId(
        roleId,
        'roleId',
      );

    const role =
      await RoleModel.findById(
        objectId,
      )
        .select(
          'version',
        )
        .lean<{
          version: number;
        }>()
        .exec();

    if (
      role === null
    ) {
      return;
    }

    if (
      role.version !==
      expectedVersion
    ) {
      throw new ConflictError(
        'Created role changed before compensation could remove it',
      );
    }

    await RolePermissionModel
      .deleteMany({
        roleId:
          objectId,
      })
      .exec();

    const deleted =
      await RoleModel
        .deleteOne({
          _id:
            objectId,

          version:
            expectedVersion,
        })
        .exec();

    if (
      deleted.deletedCount !==
      1
    ) {
      throw new ConflictError(
        'Created role could not be removed during compensation',
      );
    }
  }

  private async restoreRole(
    payload: JsonObject,
  ): Promise<void> {
    const roleId =
      asString(
        payload['roleId'],
        'roleId',
      );

    const expectedPostVersion =
      asNumber(
        payload[
          'expectedPostVersion'
        ],
        'expectedPostVersion',
      );

    const previous =
      asObject(
        payload['previous'],
        'previous',
      );

    const previousVersion =
      asNumber(
        previous['version'],
        'previous.version',
      );

    const result =
      await RoleModel
        .updateOne(
          {
            _id:
              toObjectId(
                roleId,
                'roleId',
              ),

            version:
              expectedPostVersion,
          },
          {
            $set: {
              name:
                asString(
                  previous[
                    'name'
                  ],
                  'previous.name',
                ),

              description:
                nullableString(
                  previous[
                    'description'
                  ],
                ),

              isActive:
                previous[
                  'isActive'
                ] === true,

              version:
                previousVersion,

              updatedBy:
                toNullableObjectId(
                  nullableString(
                    previous[
                      'updatedBy'
                    ],
                  ),
                  'previous.updatedBy',
                ),

              updatedAt:
                requiredDate(
                  previous[
                    'updatedAt'
                  ],
                  'previous.updatedAt',
                ),
            },
          },
          {
            runValidators:
              true,
          },
        )
        .exec();

    await this.assertRestoredVersion(
      'Role',
      previousVersion,
      result.matchedCount,
      async () => {
        const current =
          await RoleModel
            .findById(
              toObjectId(
                roleId,
                'roleId',
              ),
            )
            .select(
              'version',
            )
            .lean<{
              version: number;
            }>()
            .exec();

        return (
          current?.version ??
          null
        );
      },
    );
  }

  private async deleteRolePermission(
    payload: JsonObject,
  ): Promise<void> {
    await RolePermissionModel
      .deleteOne({
        roleId:
          toObjectId(
            asString(
              payload[
                'roleId'
              ],
              'roleId',
            ),
            'roleId',
          ),

        permissionId:
          toObjectId(
            asString(
              payload[
                'permissionId'
              ],
              'permissionId',
            ),
            'permissionId',
          ),
      })
      .exec();
  }

  private async restoreRolePermission(
    payload: JsonObject,
  ): Promise<void> {
    const roleId =
      toObjectId(
        asString(
          payload[
            'roleId'
          ],
          'roleId',
        ),
        'roleId',
      );

    const permissionId =
      toObjectId(
        asString(
          payload[
            'permissionId'
          ],
          'permissionId',
        ),
        'permissionId',
      );

    await RolePermissionModel
      .findOneAndUpdate(
        {
          roleId,
          permissionId,
        },
        {
          $setOnInsert: {
            roleId,
            permissionId,

            grantedBy:
              toObjectId(
                asString(
                  payload[
                    'grantedBy'
                  ],
                  'grantedBy',
                ),
                'grantedBy',
              ),

            grantedAt:
              requiredDate(
                payload[
                  'grantedAt'
                ],
                'grantedAt',
              ),

            schemaVersion:
              1,

            version:
              0,
          },
        },
        {
          upsert:
            true,

          new:
            true,

          runValidators:
            true,

          setDefaultsOnInsert:
            true,
        },
      )
      .exec();
  }

  private async deleteCreatedStaff(
    payload: JsonObject,
  ): Promise<void> {
    const staffId =
      asString(
        payload['staffId'],
        'staffId',
      );

    const expectedVersion =
      asNumber(
        payload[
          'expectedVersion'
        ],
        'expectedVersion',
      );

    const result =
      await StaffModel
        .deleteOne({
          _id:
            toObjectId(
              staffId,
              'staffId',
            ),

          version:
            expectedVersion,
        })
        .exec();

    if (
      result.deletedCount ===
      1
    ) {
      return;
    }

    const exists =
      await StaffModel
        .exists({
          _id:
            toObjectId(
              staffId,
              'staffId',
            ),
        })
        .exec();

    if (
      exists !== null
    ) {
      throw new ConflictError(
        'Created staff record changed before compensation could remove it',
      );
    }
  }

  private async restoreStaff(
    payload: JsonObject,
  ): Promise<void> {
    const staffId =
      asString(
        payload[
          'staffId'
        ],
        'staffId',
      );

    const expectedPostVersion =
      asNumber(
        payload[
          'expectedPostVersion'
        ],
        'expectedPostVersion',
      );

    const previous =
      asObject(
        payload[
          'previous'
        ],
        'previous',
      );

    const previousVersion =
      asNumber(
        previous[
          'version'
        ],
        'previous.version',
      );

    const result =
      await StaffModel
        .updateOne(
          {
            _id:
              toObjectId(
                staffId,
                'staffId',
              ),

            version:
              expectedPostVersion,
          },
          {
            $set: {
              departmentId:
                toNullableObjectId(
                  nullableString(
                    previous[
                      'departmentId'
                    ],
                  ),
                  'previous.departmentId',
                ),

              firstName:
                asString(
                  previous[
                    'firstName'
                  ],
                  'previous.firstName',
                ),

              middleName:
                nullableString(
                  previous[
                    'middleName'
                  ],
                ),

              lastName:
                asString(
                  previous[
                    'lastName'
                  ],
                  'previous.lastName',
                ),

              displayName:
                asString(
                  previous[
                    'displayName'
                  ],
                  'previous.displayName',
                ),

              cnic:
                nullableString(
                  previous[
                    'cnic'
                  ],
                ),

              phone:
                nullableString(
                  previous[
                    'phone'
                  ],
                ),

              email:
                nullableString(
                  previous[
                    'email'
                  ],
                ),

              designation:
                nullableString(
                  previous[
                    'designation'
                  ],
                ),

              professionalType:
                nullableString(
                  previous[
                    'professionalType'
                  ],
                ),

              professionalRegistrationNumber:
                nullableString(
                  previous[
                    'professionalRegistrationNumber'
                  ],
                ),

              joiningDate:
                nullableDate(
                  previous[
                    'joiningDate'
                  ],
                ),

              employmentStatus:
                asString(
                  previous[
                    'employmentStatus'
                  ],
                  'previous.employmentStatus',
                ),

              isClinical:
                previous[
                  'isClinical'
                ] === true,

              isActive:
                previous[
                  'isActive'
                ] === true,

              version:
                previousVersion,

              updatedBy:
                toNullableObjectId(
                  nullableString(
                    previous[
                      'updatedBy'
                    ],
                  ),
                  'previous.updatedBy',
                ),

              updatedAt:
                requiredDate(
                  previous[
                    'updatedAt'
                  ],
                  'previous.updatedAt',
                ),
            },
          },
          {
            runValidators:
              true,
          },
        )
        .exec();

    await this.assertRestoredVersion(
      'Staff',
      previousVersion,
      result.matchedCount,
      async () => {
        const current =
          await StaffModel
            .findById(
              toObjectId(
                staffId,
                'staffId',
              ),
            )
            .select(
              'version',
            )
            .lean<{
              version: number;
            }>()
            .exec();

        return (
          current?.version ??
          null
        );
      },
    );
  }

  private async deleteCreatedUser(
    payload: JsonObject,
  ): Promise<void> {
    const userId =
      asString(
        payload[
          'userId'
        ],
        'userId',
      );

    const expectedVersion =
      asNumber(
        payload[
          'expectedVersion'
        ],
        'expectedVersion',
      );

    const objectId =
      toObjectId(
        userId,
        'userId',
      );

    const user =
      await UserModel
        .findById(
          objectId,
        )
        .select(
          'version',
        )
        .lean<{
          version: number;
        }>()
        .exec();

    if (
      user === null
    ) {
      return;
    }

    if (
      user.version !==
      expectedVersion
    ) {
      throw new ConflictError(
        'Created user changed before compensation could remove it',
      );
    }

    await UserRoleModel
      .deleteMany({
        userId:
          objectId,
      })
      .exec();

    const deleted =
      await UserModel
        .deleteOne({
          _id:
            objectId,

          version:
            expectedVersion,
        })
        .exec();

    if (
      deleted.deletedCount !==
      1
    ) {
      throw new ConflictError(
        'Created user could not be removed during compensation',
      );
    }
  }

  private async restoreUser(
    payload: JsonObject,
  ): Promise<void> {
    const userId =
      asString(
        payload[
          'userId'
        ],
        'userId',
      );

    const expectedPostVersion =
      asNumber(
        payload[
          'expectedPostVersion'
        ],
        'expectedPostVersion',
      );

    const previous =
      asObject(
        payload[
          'previous'
        ],
        'previous',
      );

    const previousVersion =
      asNumber(
        previous[
          'version'
        ],
        'previous.version',
      );

    const setValues:
      JsonObject = {
        version:
          previousVersion,

        updatedBy:
          toNullableObjectId(
            nullableString(
              previous[
                'updatedBy'
              ],
            ),
            'previous.updatedBy',
          ),

        updatedAt:
          requiredDate(
            previous[
              'updatedAt'
            ],
            'previous.updatedAt',
          ),
      };

    for (
      const field of
      [
        'email',
        'normalizedEmail',
        'status',
        'mustChangePassword',
        'passwordHash',
      ] as const
    ) {
      if (
        hasOwn(
          previous,
          field,
        )
      ) {
        setValues[
          field
        ] =
          previous[
            field
          ];
      }
    }

    if (
      hasOwn(
        previous,
        'lockedUntil',
      )
    ) {
      setValues[
        'lockedUntil'
      ] =
        nullableDate(
          previous[
            'lockedUntil'
          ],
        );
    }

    if (
      hasOwn(
        previous,
        'passwordChangedAt',
      )
    ) {
      setValues[
        'passwordChangedAt'
      ] =
        nullableDate(
          previous[
            'passwordChangedAt'
          ],
        );
    }

    if (
      hasOwn(
        previous,
        'failedLoginCount',
      ) ||
      hasOwn(
        previous,
        'failedLoginAttempts',
      )
    ) {
      setValues[
        'failedLoginCount'
      ] =
        asNumber(
          previous[
            'failedLoginCount'
          ] ??
            previous[
              'failedLoginAttempts'
            ],
          'previous.failedLoginCount',
        );
    }

    const result =
      await UserModel
        .updateOne(
          {
            _id:
              toObjectId(
                userId,
                'userId',
              ),

            version:
              expectedPostVersion,
          },
          {
            $set:
              setValues,
          },
          {
            runValidators:
              true,
          },
        )
        .exec();

    await this.assertRestoredVersion(
      'User',
      previousVersion,
      result.matchedCount,
      async () => {
        const current =
          await UserModel
            .findById(
              toObjectId(
                userId,
                'userId',
              ),
            )
            .select(
              'version',
            )
            .lean<{
              version: number;
            }>()
            .exec();

        return (
          current?.version ??
          null
        );
      },
    );
  }

  private async deleteCreatedUserRole(
    payload: JsonObject,
  ): Promise<void> {
    await this.userRoleRepository
      .deleteByIdentity({
        userId:
          asString(
            payload[
              'userId'
            ],
            'userId',
          ),

        roleId:
          asString(
            payload[
              'roleId'
            ],
            'roleId',
          ),

        facilityId:
          nullableString(
            payload[
              'facilityId'
            ],
          ),
      });
  }

  private async restoreUserRole(
    payload: JsonObject,
  ): Promise<void> {
    const snapshot =
      asObject(
        payload[
          'snapshot'
        ],
        'snapshot',
      ) as unknown as UserRoleStateSnapshot;

    await this.userRoleRepository
      .restoreSnapshot(
        snapshot,
      );
  }

  private async assertRestoredVersion(
    entityName: string,
    previousVersion: number,
    matchedCount: number,
    findCurrentVersion:
      () => Promise<
        number | null
      >,
  ): Promise<void> {
    if (
      matchedCount ===
      1
    ) {
      return;
    }

    const currentVersion =
      await findCurrentVersion();

    if (
      currentVersion ===
      previousVersion
    ) {
      return;
    }

    throw new ConflictError(
      `${entityName} could not be restored because its version changed`,
    );
  }
}