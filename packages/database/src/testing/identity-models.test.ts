import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  PermissionModel,
  RoleModel,
  RolePermissionModel,
  StaffModel,
  UserModel,
  UserRoleModel,
  accessControlSchemas,
  authSchemas,
} from '../index.js';

function indexNames(
  indexes: ReturnType<
    typeof PermissionModel.schema.indexes
  >,
): string[] {
  return indexes
    .map(
      ([, options]) =>
        options.name,
    )
    .filter(
      (
        name,
      ): name is string =>
        typeof name ===
        'string',
    );
}

describe(
  'Phase 4 identity persistence models',
  () => {
    it(
      'registers dedicated identity schemas in the aggregators',
      () => {
        expect(
          accessControlSchemas
            .permissions,
        ).toBe(
          PermissionModel.schema,
        );

        expect(
          accessControlSchemas.roles,
        ).toBe(
          RoleModel.schema,
        );

        expect(
          accessControlSchemas
            .rolePermissions,
        ).toBe(
          RolePermissionModel.schema,
        );

        expect(
          accessControlSchemas.staff,
        ).toBe(
          StaffModel.schema,
        );

        expect(
          accessControlSchemas
            .userRoles,
        ).toBe(
          UserRoleModel.schema,
        );

        expect(
          authSchemas.users,
        ).toBe(
          UserModel.schema,
        );
      },
    );

    it(
      'defines required uniqueness boundaries',
      () => {
        expect(
          indexNames(
            PermissionModel
              .schema
              .indexes(),
          ),
        ).toContain(
          'uq_permissions_code',
        );

        expect(
          indexNames(
            RoleModel
              .schema
              .indexes(),
          ),
        ).toContain(
          'uq_roles_scope_facility_code',
        );

        expect(
          indexNames(
            RolePermissionModel
              .schema
              .indexes(),
          ),
        ).toContain(
          'uq_role_permissions_role_permission',
        );

        expect(
          indexNames(
            StaffModel
              .schema
              .indexes(),
          ),
        ).toContain(
          'uq_staff_facility_employee_number',
        );

        expect(
          indexNames(
            UserModel
              .schema
              .indexes(),
          ),
        ).toContain(
          'uq_users_normalized_username',
        );

        expect(
          indexNames(
            UserRoleModel
              .schema
              .indexes(),
          ),
        ).toContain(
          'uq_user_roles_user_role_facility',
        );
      },
    );

    it(
      'keeps credential fields excluded from ordinary user queries',
      () => {
        expect(
          UserModel
            .schema
            .path(
              'passwordHash',
            )
            .options
            .select,
        ).toBe(false);
      },
    );

    it(
      'stores one canonical failed-login counter',
      () => {
        expect(
          UserModel.schema.path(
            'failedLoginCount',
          ),
        ).toBeDefined();

        expect(
          UserModel.schema.path(
            'failedLoginAttempts',
          ),
        ).toBeUndefined();
      },
    );

    it(
      'requires a facility for staff but permits global roles and users',
      () => {
        expect(
          StaffModel
            .schema
            .path(
              'facilityId',
            )
            .isRequired,
        ).toBe(true);

        expect(
          RoleModel
            .schema
            .path(
              'facilityId',
            )
            .isRequired,
        ).toBe(false);

        expect(
          UserModel
            .schema
            .path(
              'facilityId',
            )
            .isRequired,
        ).toBe(false);
      },
    );
  },
);