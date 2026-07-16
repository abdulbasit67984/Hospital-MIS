import {
  Router,
  type Request,
  type RequestHandler,
} from 'express';

import {
  ForbiddenError,
  UnauthorizedError,
} from '@hospital-mis/shared';

import {
  authenticate,
} from '../../middleware/authenticate.js';

import {
  validateRequest,
} from '../../middleware/validate-request.js';

import {
  enforceRecordPolicy,
  requirePermission,
} from '../authorization/authorization.middleware.js';

import type {
  AuthorizationService,
} from '../authorization/authorization.service.js';

import type {
  AuthenticationService,
} from '../auth/auth.service.js';

import {
  PermissionController,
} from './controllers/permission.controller.js';

import {
  RoleController,
} from './controllers/role.controller.js';

import {
  StaffController,
} from './controllers/staff.controller.js';

import {
  UserController,
} from './controllers/user.controller.js';

import {
  validatedPart,
} from './controllers/identity-controller.helpers.js';

import type {
  IdentityApplication,
} from './identity.application.js';

import {
  IDENTITY_PERMISSION_KEYS,
} from './identity.constants.js';

import {
  changeUserPasswordBodySchema,
  createRoleBodySchema,
  createStaffBodySchema,
  createUserBodySchema,
  identityIdParamsSchema,
  identityMutationHeadersSchema,
  permissionListQuerySchema,
  replaceRolePermissionsBodySchema,
  replaceUserRolesBodySchema,
  revokeUserSessionsBodySchema,
  roleIdParamsSchema,
  roleListQuerySchema,
  staffListQuerySchema,
  updateRoleBodySchema,
  updateStaffBodySchema,
  updateUserBodySchema,
  userDetailsQuerySchema,
  userIdParamsSchema,
  userListQuerySchema,
} from './identity.validation.js';

interface RoleIdParams {
  roleId:
    string;
}

interface IdentityIdParams {
  id:
    string;
}

interface UserIdParams {
  userId:
    string;
}

interface OptionalFacilityQuery {
  facilityId?:
    string;
}

interface RequiredFacilityQuery {
  facilityId:
    string;
}

interface OptionalFacilityBody {
  facilityId?:
    string | null;
}

interface UserAssignmentBody {
  roleAssignments?: Array<{
    facilityId?:
      string | null;
  }>;

  assignments?: Array<{
    facilityId?:
      string | null;
  }>;
}

interface StatusUpdateBody {
  status?:
    string;

  isActive?:
    boolean;

  employmentStatus?:
    string;
}

function requirePrincipal(
  request:
    Request,
) {
  if (
    request.auth ===
    undefined
  ) {
    throw new UnauthorizedError();
  }

  return request.auth;
}

function requireOptionalFacilityAccess(
  authorizationService:
    AuthorizationService,

  resolveFacilityId:
    (
      request:
        Request,
    ) =>
      | string
      | null
      | undefined,
): RequestHandler {
  return (
    request,
    _response,
    next,
  ) => {
    try {
      const facilityId =
        resolveFacilityId(
          request,
        );

      if (
        facilityId !==
          undefined &&
        facilityId !==
          null
      ) {
        authorizationService
          .assertFacilityAccess(
            requirePrincipal(
              request,
            ),

            facilityId,
          );
      }

      next();
    } catch (error) {
      next(
        error,
      );
    }
  };
}

function requireAssignmentFacilityAccess(
  authorizationService:
    AuthorizationService,
): RequestHandler {
  return (
    request,
    _response,
    next,
  ) => {
    try {
      const body =
        validatedPart<
          UserAssignmentBody
        >(
          request,
          'body',
        );

      const assignments =
        body.roleAssignments ??
        body.assignments ??
        [];

      const facilityIds =
        new Set(
          assignments
            .map(
              (
                assignment,
              ) =>
                assignment.facilityId,
            )
            .filter(
              (
                facilityId,
              ): facilityId is string =>
                typeof facilityId ===
                  'string' &&
                facilityId.length >
                  0,
            ),
        );

      const principal =
        requirePrincipal(
          request,
        );

      for (
        const facilityId of
        facilityIds
      ) {
        authorizationService
          .assertFacilityAccess(
            principal,
            facilityId,
          );
      }

      next();
    } catch (error) {
      next(
        error,
      );
    }
  };
}

function requireUpdatePermissions(
  authorizationService:
    AuthorizationService,

  input: Readonly<{
    basePermission:
      Parameters<
        AuthorizationService[
          'assertPermission'
        ]
      >[1];

    statusPermission:
      Parameters<
        AuthorizationService[
          'assertPermission'
        ]
      >[1];

    statusFields:
      readonly (
        keyof StatusUpdateBody
      )[];
  }>,
): RequestHandler {
  return async (
    request,
    _response,
    next,
  ) => {
    try {
      const principal =
        requirePrincipal(
          request,
        );

      await authorizationService
        .assertPermission(
          principal,
          input.basePermission,
        );

      const body =
        validatedPart<
          StatusUpdateBody
        >(
          request,
          'body',
        );

      const changesStatus =
        input.statusFields.some(
          (
            field,
          ) =>
            body[
              field
            ] !==
            undefined,
        );

      if (
        changesStatus
      ) {
        await authorizationService
          .assertPermission(
            principal,
            input.statusPermission,
          );
      }

      next();
    } catch (error) {
      next(
        error,
      );
    }
  };
}

function rejectCrossFacilityUserQuery(
  authorizationService:
    AuthorizationService,
): RequestHandler {
  return requireOptionalFacilityAccess(
    authorizationService,
    (
      request,
    ) =>
      validatedPart<
        OptionalFacilityQuery
      >(
        request,
        'query',
      ).facilityId,
  );
}

export interface CreateIdentityRouterOptions {
  application:
    IdentityApplication;

  authenticationService:
    AuthenticationService;

  authorizationService:
    AuthorizationService;
}

export function createIdentityRouter(
  options:
    CreateIdentityRouterOptions,
): Router {
  const router =
    Router();

  const permissionController =
    new PermissionController(
      options.application
        .permissionService,
    );

  const roleController =
    new RoleController(
      options.application
        .roleService,
    );

  const staffController =
    new StaffController(
      options.application
        .staffService,
    );

  const userController =
    new UserController(
      options.application
        .userService,
    );

  router.use(
    authenticate(
      options.authenticationService,
    ),
  );

  router.get(
    '/permissions',

    requirePermission(
      options.authorizationService,
      IDENTITY_PERMISSION_KEYS
        .PERMISSIONS_READ,
    ),

    validateRequest({
      query:
        permissionListQuerySchema,
    }),

    permissionController.list,
  );

  router.get(
    '/permissions/:id',

    requirePermission(
      options.authorizationService,
      IDENTITY_PERMISSION_KEYS
        .PERMISSIONS_READ,
    ),

    validateRequest({
      params:
        identityIdParamsSchema,
    }),

    permissionController.getById,
  );

  router.get(
    '/roles',

    requirePermission(
      options.authorizationService,
      IDENTITY_PERMISSION_KEYS
        .ROLES_READ,
    ),

    validateRequest({
      query:
        roleListQuerySchema,
    }),

    rejectCrossFacilityUserQuery(
      options.authorizationService,
    ),

    roleController.list,
  );

  router.post(
    '/roles',

    validateRequest({
      headers:
        identityMutationHeadersSchema,

      body:
        createRoleBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      IDENTITY_PERMISSION_KEYS
        .ROLES_CREATE,
    ),

    requireOptionalFacilityAccess(
      options.authorizationService,
      (
        request,
      ) =>
        validatedPart<
          OptionalFacilityBody
        >(
          request,
          'body',
        ).facilityId,
    ),

    roleController.create,
  );

  router.get(
    '/roles/:roleId/permissions',

    requirePermission(
      options.authorizationService,
      IDENTITY_PERMISSION_KEYS
        .ROLES_READ,
    ),

    validateRequest({
      params:
        roleIdParamsSchema,
    }),

    enforceRecordPolicy(
      options.application
        .policies.role,

      async (
        request,
      ) =>
        options.application
          .roleService
          .getById(
            validatedPart<
              RoleIdParams
            >(
              request,
              'params',
            ).roleId,
          ),
    ),

    roleController.listPermissions,
  );

  router.put(
    '/roles/:roleId/permissions',

    validateRequest({
      headers:
        identityMutationHeadersSchema,

      params:
        roleIdParamsSchema,

      body:
        replaceRolePermissionsBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      IDENTITY_PERMISSION_KEYS
        .ROLES_ASSIGN_PERMISSIONS,
    ),

    enforceRecordPolicy(
      options.application
        .policies.role,

      async (
        request,
      ) =>
        options.application
          .roleService
          .getById(
            validatedPart<
              RoleIdParams
            >(
              request,
              'params',
            ).roleId,
          ),
    ),

    roleController.replacePermissions,
  );

  router.get(
    '/roles/:roleId',

    requirePermission(
      options.authorizationService,
      IDENTITY_PERMISSION_KEYS
        .ROLES_READ,
    ),

    validateRequest({
      params:
        roleIdParamsSchema,
    }),

    enforceRecordPolicy(
      options.application
        .policies.role,

      async (
        request,
      ) =>
        options.application
          .roleService
          .getById(
            validatedPart<
              RoleIdParams
            >(
              request,
              'params',
            ).roleId,
          ),
    ),

    roleController.getById,
  );

  router.patch(
    '/roles/:roleId',

    validateRequest({
      headers:
        identityMutationHeadersSchema,

      params:
        roleIdParamsSchema,

      body:
        updateRoleBodySchema,
    }),

    requireUpdatePermissions(
      options.authorizationService,
      {
        basePermission:
          IDENTITY_PERMISSION_KEYS
            .ROLES_UPDATE,

        statusPermission:
          IDENTITY_PERMISSION_KEYS
            .ROLES_DEACTIVATE,

        statusFields: [
          'isActive',
        ],
      },
    ),

    enforceRecordPolicy(
      options.application
        .policies.role,

      async (
        request,
      ) =>
        options.application
          .roleService
          .getById(
            validatedPart<
              RoleIdParams
            >(
              request,
              'params',
            ).roleId,
          ),
    ),

    roleController.update,
  );

  router.get(
    '/staff',

    requirePermission(
      options.authorizationService,
      IDENTITY_PERMISSION_KEYS
        .STAFF_READ,
    ),

    validateRequest({
      query:
        staffListQuerySchema,
    }),

    requireOptionalFacilityAccess(
      options.authorizationService,
      (
        request,
      ) =>
        validatedPart<
          RequiredFacilityQuery
        >(
          request,
          'query',
        ).facilityId,
    ),

    staffController.list,
  );

  router.post(
    '/staff',

    validateRequest({
      headers:
        identityMutationHeadersSchema,

      body:
        createStaffBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      IDENTITY_PERMISSION_KEYS
        .STAFF_CREATE,
    ),

    requireOptionalFacilityAccess(
      options.authorizationService,
      (
        request,
      ) =>
        validatedPart<{
          facilityId:
            string;
        }>(
          request,
          'body',
        ).facilityId,
    ),

    staffController.create,
  );

  router.get(
    '/staff/:id',

    requirePermission(
      options.authorizationService,
      IDENTITY_PERMISSION_KEYS
        .STAFF_READ,
    ),

    validateRequest({
      params:
        identityIdParamsSchema,
    }),

    enforceRecordPolicy(
      options.application
        .policies.staff,

      async (
        request,
      ) =>
        options.application
          .staffService
          .getById(
            validatedPart<
              IdentityIdParams
            >(
              request,
              'params',
            ).id,
          ),
    ),

    staffController.getById,
  );

  router.patch(
    '/staff/:id',

    validateRequest({
      headers:
        identityMutationHeadersSchema,

      params:
        identityIdParamsSchema,

      body:
        updateStaffBodySchema,
    }),

    requireUpdatePermissions(
      options.authorizationService,
      {
        basePermission:
          IDENTITY_PERMISSION_KEYS
            .STAFF_UPDATE,

        statusPermission:
          IDENTITY_PERMISSION_KEYS
            .STAFF_CHANGE_STATUS,

        statusFields: [
          'employmentStatus',
          'isActive',
        ],
      },
    ),

    enforceRecordPolicy(
      options.application
        .policies.staff,

      async (
        request,
      ) =>
        options.application
          .staffService
          .getById(
            validatedPart<
              IdentityIdParams
            >(
              request,
              'params',
            ).id,
          ),
    ),

    staffController.update,
  );

  router.get(
    '/users',

    requirePermission(
      options.authorizationService,
      IDENTITY_PERMISSION_KEYS
        .USERS_READ,
    ),

    validateRequest({
      query:
        userListQuerySchema,
    }),

    rejectCrossFacilityUserQuery(
      options.authorizationService,
    ),

    userController.list,
  );

  router.post(
    '/users',

    validateRequest({
      headers:
        identityMutationHeadersSchema,

      body:
        createUserBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      IDENTITY_PERMISSION_KEYS
        .USERS_CREATE,
    ),

    requireAssignmentFacilityAccess(
      options.authorizationService,
    ),

    userController.create,
  );

  router.get(
    '/users/:userId',

    requirePermission(
      options.authorizationService,
      IDENTITY_PERMISSION_KEYS
        .USERS_READ,
    ),

    validateRequest({
      params:
        userIdParamsSchema,

      query:
        userDetailsQuerySchema,
    }),

    rejectCrossFacilityUserQuery(
      options.authorizationService,
    ),

    enforceRecordPolicy(
      options.application
        .policies.user,

      async (
        request,
      ) =>
        options.application
          .userService
          .getWithRoles(
            validatedPart<
              UserIdParams
            >(
              request,
              'params',
            ).userId,

            {
              activeOnly:
                false,

              includeExpired:
                true,
            },
          ),
    ),

    userController.getById,
  );

  router.patch(
    '/users/:userId',

    validateRequest({
      headers:
        identityMutationHeadersSchema,

      params:
        userIdParamsSchema,

      body:
        updateUserBodySchema,
    }),

    requireUpdatePermissions(
      options.authorizationService,
      {
        basePermission:
          IDENTITY_PERMISSION_KEYS
            .USERS_UPDATE,

        statusPermission:
          IDENTITY_PERMISSION_KEYS
            .USERS_CHANGE_STATUS,

        statusFields: [
          'status',
        ],
      },
    ),

    enforceRecordPolicy(
      options.application
        .policies.user,

      async (
        request,
      ) =>
        options.application
          .userService
          .getWithRoles(
            validatedPart<
              UserIdParams
            >(
              request,
              'params',
            ).userId,

            {
              activeOnly:
                false,

              includeExpired:
                true,
            },
          ),
    ),

    userController.update,
  );

  router.put(
    '/users/:userId/roles',

    validateRequest({
      headers:
        identityMutationHeadersSchema,

      params:
        userIdParamsSchema,

      body:
        replaceUserRolesBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      IDENTITY_PERMISSION_KEYS
        .USERS_ASSIGN_ROLES,
    ),

    requireAssignmentFacilityAccess(
      options.authorizationService,
    ),

    enforceRecordPolicy(
      options.application
        .policies.user,

      async (
        request,
      ) =>
        options.application
          .userService
          .getWithRoles(
            validatedPart<
              UserIdParams
            >(
              request,
              'params',
            ).userId,

            {
              activeOnly:
                false,

              includeExpired:
                true,
            },
          ),
    ),

    userController.replaceRoles,
  );

  router.post(
    '/users/:userId/password-reset',

    validateRequest({
      headers:
        identityMutationHeadersSchema,

      params:
        userIdParamsSchema,

      body:
        changeUserPasswordBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      IDENTITY_PERMISSION_KEYS
        .USERS_RESET_PASSWORD,
    ),

    enforceRecordPolicy(
      options.application
        .policies.user,

      async (
        request,
      ) =>
        options.application
          .userService
          .getWithRoles(
            validatedPart<
              UserIdParams
            >(
              request,
              'params',
            ).userId,

            {
              activeOnly:
                false,

              includeExpired:
                true,
            },
          ),
    ),

    userController.resetPassword,
  );

  router.post(
    '/users/:userId/sessions/revoke',

    validateRequest({
      headers:
        identityMutationHeadersSchema,

      params:
        userIdParamsSchema,

      body:
        revokeUserSessionsBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      IDENTITY_PERMISSION_KEYS
        .USERS_REVOKE_SESSIONS,
    ),

    enforceRecordPolicy(
      options.application
        .policies.user,

      async (
        request,
      ) =>
        options.application
          .userService
          .getWithRoles(
            validatedPart<
              UserIdParams
            >(
              request,
              'params',
            ).userId,

            {
              activeOnly:
                false,

              includeExpired:
                true,
            },
          ),
    ),

    userController.revokeSessions,
  );

  router.use(
    (
      _request,
      _response,
      next,
    ) => {
      next(
        new ForbiddenError(
          'The requested identity operation is not available',
        ),
      );
    },
  );

  return router;
}