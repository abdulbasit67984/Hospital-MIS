import {
  z,
} from 'zod';

import {
  MAX_IDENTITY_PAGE_SIZE,
  PERMISSION_SORT_FIELDS,
  ROLE_SCOPE,
  ROLE_SORT_FIELDS,
  STAFF_EMPLOYMENT_STATUS,
  STAFF_SORT_FIELDS,
  USER_SORT_FIELDS,
  USER_STATUS,
} from './identity.constants.js';

const objectIdSchema =
  z
    .string()
    .trim()
    .regex(
      /^[a-f\d]{24}$/i,
      'Must be a valid MongoDB ObjectId',
    );

const nullableObjectIdSchema =
  z.union([
    objectIdSchema,
    z.null(),
  ]);

const nullableTrimmedString = (
  maxLength:
    number,
) =>
  z.union([
    z
      .string()
      .trim()
      .min(1)
      .max(
        maxLength,
      ),

    z.literal(
      '',
    ),

    z.null(),
  ]);

const optionalNullableTrimmedString = (
  maxLength:
    number,
) =>
  nullableTrimmedString(
    maxLength,
  ).optional();

const nullableIsoDateSchema =
  z.union([
    z
      .string()
      .datetime({
        offset:
          true,
      }),

    z
      .string()
      .date(),

    z.null(),
  ]);

const queryBooleanSchema =
  z.preprocess(
    (
      rawValue,
    ) => {
      const value =
        Array.isArray(
          rawValue,
        )
          ? rawValue[0]
          : rawValue;

      if (
        value ===
          true ||
        value ===
          false
      ) {
        return value;
      }

      if (
        typeof value ===
        'string'
      ) {
        const normalized =
          value
            .trim()
            .toLocaleLowerCase(
              'en-US',
            );

        if (
          normalized ===
            'true' ||
          normalized ===
            '1'
        ) {
          return true;
        }

        if (
          normalized ===
            'false' ||
          normalized ===
            '0'
        ) {
          return false;
        }
      }

      return value;
    },

    z.boolean(),
  );

const headerStringSchema =
  z.preprocess(
    (
      rawValue,
    ) =>
      Array.isArray(
        rawValue,
      )
        ? rawValue[0]
        : rawValue,

    z.string(),
  );

const paginationFields = {
  page:
    z.coerce
      .number()
      .int()
      .min(1)
      .default(1),

  pageSize:
    z.coerce
      .number()
      .int()
      .min(1)
      .max(
        MAX_IDENTITY_PAGE_SIZE,
      )
      .default(20),
};

const sortDirectionSchema =
  z
    .enum([
      'asc',
      'desc',
    ])
    .default(
      'asc',
    );

export const identityIdParamsSchema =
  z.object({
    id:
      objectIdSchema,
  });

export const roleIdParamsSchema =
  z.object({
    roleId:
      objectIdSchema,
  });

export const userIdParamsSchema =
  z.object({
    userId:
      objectIdSchema,
  });

export const identityMutationHeadersSchema =
  z
    .object({
      'idempotency-key':
        headerStringSchema
          .trim()
          .min(
            8,
            'Idempotency-Key must contain at least 8 characters',
          )
          .max(
            200,
            'Idempotency-Key cannot exceed 200 characters',
          )
          .regex(
            /^[A-Za-z0-9._:-]+$/,
            'Idempotency-Key contains unsupported characters',
          ),
    })
    .passthrough();

export const permissionListQuerySchema =
  z.object({
    ...paginationFields,

    search:
      z
        .string()
        .trim()
        .max(100)
        .optional(),

    module:
      z
        .string()
        .trim()
        .max(80)
        .optional(),

    activeOnly:
      queryBooleanSchema
        .default(
          true,
        ),

    sortBy:
      z
        .enum(
          PERMISSION_SORT_FIELDS,
        )
        .default(
          'module',
        ),

    sortDirection:
      sortDirectionSchema,
  });

export const roleListQuerySchema =
  z.object({
    ...paginationFields,

    search:
      z
        .string()
        .trim()
        .max(100)
        .optional(),

    facilityId:
      objectIdSchema
        .optional(),

    scope:
      z
        .enum([
          ROLE_SCOPE.GLOBAL,
          ROLE_SCOPE.FACILITY,
        ])
        .optional(),

    activeOnly:
      queryBooleanSchema
        .default(
          true,
        ),

    sortBy:
      z
        .enum(
          ROLE_SORT_FIELDS,
        )
        .default(
          'name',
        ),

    sortDirection:
      sortDirectionSchema,
  });

export const staffListQuerySchema =
  z.object({
    ...paginationFields,

    search:
      z
        .string()
        .trim()
        .max(100)
        .optional(),

    facilityId:
      objectIdSchema,

    departmentId:
      objectIdSchema
        .optional(),

    employmentStatus:
      z
        .enum([
          STAFF_EMPLOYMENT_STATUS.ACTIVE,
          STAFF_EMPLOYMENT_STATUS.INACTIVE,
          STAFF_EMPLOYMENT_STATUS.ON_LEAVE,
          STAFF_EMPLOYMENT_STATUS.SUSPENDED,
          STAFF_EMPLOYMENT_STATUS.TERMINATED,
        ])
        .optional(),

    isClinical:
      queryBooleanSchema
        .optional(),

    activeOnly:
      queryBooleanSchema
        .default(
          true,
        ),

    sortBy:
      z
        .enum(
          STAFF_SORT_FIELDS,
        )
        .default(
          'displayName',
        ),

    sortDirection:
      sortDirectionSchema,
  });

export const userListQuerySchema =
  z.object({
    ...paginationFields,

    search:
      z
        .string()
        .trim()
        .max(100)
        .optional(),

    staffId:
      objectIdSchema
        .optional(),

    facilityId:
      objectIdSchema
        .optional(),

    status:
      z
        .enum([
          USER_STATUS.ACTIVE,
          USER_STATUS.INACTIVE,
          USER_STATUS.LOCKED,
          USER_STATUS.SUSPENDED,
          USER_STATUS.DISABLED,
        ])
        .optional(),

    sortBy:
      z
        .enum(
          USER_SORT_FIELDS,
        )
        .default(
          'username',
        ),

    sortDirection:
      sortDirectionSchema,
  });

export const userDetailsQuerySchema =
  z.object({
    facilityId:
      objectIdSchema
        .optional(),

    includeExpired:
      queryBooleanSchema
        .default(
          false,
        ),

    activeOnly:
      queryBooleanSchema
        .default(
          true,
        ),
  });

export const createRoleBodySchema =
  z
    .object({
      facilityId:
        nullableObjectIdSchema
          .optional(),

      code:
        z
          .string()
          .trim()
          .min(2)
          .max(80)
          .regex(
            /^[A-Z][A-Z0-9_]*$/,
            'Role code must use uppercase letters, numbers, and underscores',
          ),

      name:
        z
          .string()
          .trim()
          .min(2)
          .max(120),

      description:
        optionalNullableTrimmedString(
          500,
        ),

      scope:
        z.enum([
          ROLE_SCOPE.GLOBAL,
          ROLE_SCOPE.FACILITY,
        ]),

      permissionIds:
        z
          .array(
            objectIdSchema,
          )
          .max(500)
          .default([]),
    })
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value.scope ===
            ROLE_SCOPE.FACILITY &&
          !value.facilityId
        ) {
          context.addIssue({
            code:
              z.ZodIssueCode.custom,

            path: [
              'facilityId',
            ],

            message:
              'facilityId is required for a facility-scoped role',
          });
        }

        if (
          value.scope ===
            ROLE_SCOPE.GLOBAL &&
          value.facilityId
        ) {
          context.addIssue({
            code:
              z.ZodIssueCode.custom,

            path: [
              'facilityId',
            ],

            message:
              'facilityId must be null for a global role',
          });
        }
      },
    );

export const updateRoleBodySchema =
  z.object({
    name:
      z
        .string()
        .trim()
        .min(2)
        .max(120)
        .optional(),

    description:
      optionalNullableTrimmedString(
        500,
      ),

    isActive:
      z
        .boolean()
        .optional(),

    expectedVersion:
      z
        .number()
        .int()
        .min(0),
  });

export const replaceRolePermissionsBodySchema =
  z.object({
    permissionIds:
      z
        .array(
          objectIdSchema,
        )
        .max(500),

    expectedRoleVersion:
      z
        .number()
        .int()
        .min(0),
  });

export const createStaffBodySchema =
  z.object({
    facilityId:
      objectIdSchema,

    departmentId:
      nullableObjectIdSchema
        .optional(),

    employeeNumber:
      z
        .string()
        .trim()
        .min(1)
        .max(50)
        .regex(
          /^[A-Za-z0-9/_-]+$/,
          'Employee number contains unsupported characters',
        ),

    firstName:
      z
        .string()
        .trim()
        .min(1)
        .max(100),

    middleName:
      optionalNullableTrimmedString(
        100,
      ),

    lastName:
      z
        .string()
        .trim()
        .min(1)
        .max(100),

    cnic:
      z
        .union([
          z
            .string()
            .trim()
            .regex(
              /^\d{13}$/,
              'CNIC must contain 13 digits',
            ),

          z.literal(
            '',
          ),

          z.null(),
        ])
        .optional(),

    phone:
      optionalNullableTrimmedString(
        30,
      ),

    email:
      z
        .union([
          z
            .string()
            .trim()
            .email()
            .max(254),

          z.literal(
            '',
          ),

          z.null(),
        ])
        .optional(),

    designation:
      optionalNullableTrimmedString(
        120,
      ),

    professionalType:
      optionalNullableTrimmedString(
        100,
      ),

    professionalRegistrationNumber:
      optionalNullableTrimmedString(
        100,
      ),

    joiningDate:
      nullableIsoDateSchema
        .optional(),

    employmentStatus:
      z
        .enum([
          STAFF_EMPLOYMENT_STATUS.ACTIVE,
          STAFF_EMPLOYMENT_STATUS.INACTIVE,
          STAFF_EMPLOYMENT_STATUS.ON_LEAVE,
          STAFF_EMPLOYMENT_STATUS.SUSPENDED,
          STAFF_EMPLOYMENT_STATUS.TERMINATED,
        ])
        .default(
          STAFF_EMPLOYMENT_STATUS.ACTIVE,
        ),

    isClinical:
      z
        .boolean()
        .default(
          false,
        ),
  });

export const updateStaffBodySchema =
  z.object({
    departmentId:
      nullableObjectIdSchema
        .optional(),

    firstName:
      z
        .string()
        .trim()
        .min(1)
        .max(100)
        .optional(),

    middleName:
      optionalNullableTrimmedString(
        100,
      ),

    lastName:
      z
        .string()
        .trim()
        .min(1)
        .max(100)
        .optional(),

    cnic:
      z
        .union([
          z
            .string()
            .trim()
            .regex(
              /^\d{13}$/,
              'CNIC must contain 13 digits',
            ),

          z.literal(
            '',
          ),

          z.null(),
        ])
        .optional(),

    phone:
      optionalNullableTrimmedString(
        30,
      ),

    email:
      z
        .union([
          z
            .string()
            .trim()
            .email()
            .max(254),

          z.literal(
            '',
          ),

          z.null(),
        ])
        .optional(),

    designation:
      optionalNullableTrimmedString(
        120,
      ),

    professionalType:
      optionalNullableTrimmedString(
        100,
      ),

    professionalRegistrationNumber:
      optionalNullableTrimmedString(
        100,
      ),

    joiningDate:
      nullableIsoDateSchema
        .optional(),

    employmentStatus:
      z
        .enum([
          STAFF_EMPLOYMENT_STATUS.ACTIVE,
          STAFF_EMPLOYMENT_STATUS.INACTIVE,
          STAFF_EMPLOYMENT_STATUS.ON_LEAVE,
          STAFF_EMPLOYMENT_STATUS.SUSPENDED,
          STAFF_EMPLOYMENT_STATUS.TERMINATED,
        ])
        .optional(),

    isClinical:
      z
        .boolean()
        .optional(),

    isActive:
      z
        .boolean()
        .optional(),

    expectedVersion:
      z
        .number()
        .int()
        .min(0),
  });

const passwordSchema =
  z
    .string()
    .min(12)
    .max(128)
    .regex(
      /[a-z]/,
      'Password must contain a lowercase letter',
    )
    .regex(
      /[A-Z]/,
      'Password must contain an uppercase letter',
    )
    .regex(
      /\d/,
      'Password must contain a number',
    )
    .regex(
      /[^A-Za-z0-9]/,
      'Password must contain a special character',
    );

const userRoleAssignmentSchema =
  z.object({
    roleId:
      objectIdSchema,

    facilityId:
      nullableObjectIdSchema
        .optional(),

    expiresAt:
      nullableIsoDateSchema
        .optional(),
  });

export const createUserBodySchema =
  z.object({
    staffId:
      nullableObjectIdSchema
        .optional(),

    username:
      z
        .string()
        .trim()
        .min(3)
        .max(80)
        .regex(
          /^[A-Za-z0-9._-]+$/,
          'Username contains unsupported characters',
        ),

    email:
      z
        .union([
          z
            .string()
            .trim()
            .email()
            .max(254),

          z.literal(
            '',
          ),

          z.null(),
        ])
        .optional(),

    password:
      passwordSchema,

    mustChangePassword:
      z
        .boolean()
        .default(
          true,
        ),

    status:
      z
        .enum([
          USER_STATUS.ACTIVE,
          USER_STATUS.INACTIVE,
          USER_STATUS.LOCKED,
          USER_STATUS.SUSPENDED,
          USER_STATUS.DISABLED,
        ])
        .default(
          USER_STATUS.ACTIVE,
        ),

    roleAssignments:
      z
        .array(
          userRoleAssignmentSchema,
        )
        .max(100)
        .default([]),
  });

export const updateUserBodySchema =
  z.object({
    email:
      z
        .union([
          z
            .string()
            .trim()
            .email()
            .max(254),

          z.literal(
            '',
          ),

          z.null(),
        ])
        .optional(),

    status:
      z
        .enum([
          USER_STATUS.ACTIVE,
          USER_STATUS.INACTIVE,
          USER_STATUS.LOCKED,
          USER_STATUS.SUSPENDED,
          USER_STATUS.DISABLED,
        ])
        .optional(),

    mustChangePassword:
      z
        .boolean()
        .optional(),

    expectedVersion:
      z
        .number()
        .int()
        .min(0),
  });

export const replaceUserRolesBodySchema =
  z.object({
    assignments:
      z
        .array(
          userRoleAssignmentSchema,
        )
        .max(100),

    reason:
      z
        .string()
        .trim()
        .min(3)
        .max(500),
  });

export const changeUserPasswordBodySchema =
  z.object({
    password:
      passwordSchema,

    mustChangePassword:
      z
        .boolean()
        .default(
          true,
        ),

    revokeSessions:
      z
        .boolean()
        .default(
          true,
        ),

    reason:
      z
        .string()
        .trim()
        .min(3)
        .max(500),
  });

export const revokeUserSessionsBodySchema =
  z.object({
    reason:
      z
        .string()
        .trim()
        .min(3)
        .max(500),

    excludeSessionId:
      z
        .string()
        .uuid()
        .optional(),
  });

export type PermissionListQueryData =
  z.infer<
    typeof permissionListQuerySchema
  >;

export type RoleListQueryData =
  z.infer<
    typeof roleListQuerySchema
  >;

export type StaffListQueryData =
  z.infer<
    typeof staffListQuerySchema
  >;

export type UserListQueryData =
  z.infer<
    typeof userListQuerySchema
  >;

export type UserDetailsQueryData =
  z.infer<
    typeof userDetailsQuerySchema
  >;

export type CreateRoleBody =
  z.infer<
    typeof createRoleBodySchema
  >;

export type UpdateRoleBody =
  z.infer<
    typeof updateRoleBodySchema
  >;

export type CreateStaffBody =
  z.infer<
    typeof createStaffBodySchema
  >;

export type UpdateStaffBody =
  z.infer<
    typeof updateStaffBodySchema
  >;

export type CreateUserBody =
  z.infer<
    typeof createUserBodySchema
  >;

export type UpdateUserBody =
  z.infer<
    typeof updateUserBodySchema
  >;

export type ReplaceUserRolesBody =
  z.infer<
    typeof replaceUserRolesBodySchema
  >;

export type ChangeUserPasswordBody =
  z.infer<
    typeof changeUserPasswordBodySchema
  >;

export type RevokeUserSessionsBody =
  z.infer<
    typeof revokeUserSessionsBodySchema
  >;