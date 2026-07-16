import express, {
  type ErrorRequestHandler,
} from 'express';

import request from 'supertest';

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  AppError,
  ForbiddenError,
} from '@hospital-mis/shared';

import type {
  AuthenticationService,
} from '../auth/auth.service.js';

import type {
  AuthorizationService,
} from '../authorization/authorization.service.js';

import type {
  IdentityApplication,
} from './identity.application.js';

import {
  createIdentityRecordPolicies,
} from './identity.policy.js';

import {
  createIdentityRouter,
} from './identity.routes.js';

const principal = {
  userId:
    '507f1f77bcf86cd799439011',

  sessionId:
    '25da21e9-d661-41dc-b2e8-734f30f3f5a8',

  facilityId:
    '507f191e810c19729de860ea',

  accessTokenId:
    'access-token-1',

  tokenVersion:
    0,

  permissionVersion:
    0,
};

function createFixture() {
  const permissionList =
    vi.fn()
      .mockResolvedValue({
        items: [],
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
      });

  const roleCreate =
    vi.fn()
      .mockResolvedValue({
        role: {
          id:
            '507f1f77bcf86cd799439012',

          facilityId:
            null,

          code:
            'AUDITOR',

          name:
            'Auditor',

          description:
            null,

          scope:
            'GLOBAL',

          isSystem:
            false,

          isActive:
            true,

          version:
            0,

          createdAt:
            new Date()
              .toISOString(),

          updatedAt:
            new Date()
              .toISOString(),
        },

        permissionIds:
          [],
      });

  const authenticationService = {
    authenticateAccessToken:
      vi.fn()
        .mockResolvedValue(
          principal,
        ),
  } as unknown as AuthenticationService;

  const assertPermission =
    vi.fn()
      .mockResolvedValue(
        undefined,
      );

  const assertFacilityAccess =
    vi.fn(
      (
        _principal,
        facilityId:
          string,
      ) => {
        if (
          facilityId !==
          principal.facilityId
        ) {
          throw new ForbiddenError(
            'Cross-facility access is not permitted',
          );
        }
      },
    );

  const authorizationService = {
    assertPermission,
    assertFacilityAccess,
  } as unknown as AuthorizationService;

  const application = {
    permissionService: {
      list:
        permissionList,

      getById:
        vi.fn(),
    },

    roleService: {
      create:
        roleCreate,

      list:
        vi.fn(),

      getById:
        vi.fn(),

      getWithPermissions:
        vi.fn(),

      listPermissions:
        vi.fn(),

      update:
        vi.fn(),

      replacePermissions:
        vi.fn(),
    },

    staffService: {
      list:
        vi.fn(),

      getById:
        vi.fn(),

      create:
        vi.fn(),

      update:
        vi.fn(),
    },

    userService: {
      list:
        vi.fn(),

      getWithRoles:
        vi.fn(),

      create:
        vi.fn(),

      update:
        vi.fn(),

      replaceRoles:
        vi.fn(),

      resetPassword:
        vi.fn(),

      revokeSessions:
        vi.fn(),
    },

    userRoleService: {
      getById:
        vi.fn(),

      listForUser:
        vi.fn(),
    },

    policies:
      createIdentityRecordPolicies(),

    repositories: {},
  } as unknown as IdentityApplication;

  const app =
    express();

  app.use(
    express.json(),
  );

  app.use(
    '/api/v1/identity',

    createIdentityRouter({
      application,
      authenticationService,
      authorizationService,
    }),
  );

  const errorHandler:
    ErrorRequestHandler =
    (
      error:
        unknown,
      request,
      response,
      _next,
    ) => {
      if (
        error instanceof
        AppError
      ) {
        response
          .status(
            error.statusCode,
          )
          .json({
            success:
              false,

            error: {
              code:
                error.code,

              message:
                error.message,

              correlationId:
                request.correlationId ??
                'test-correlation',
            },
          });

        return;
      }

      response
        .status(
          500,
        )
        .json({
          success:
            false,
        });
    };

  app.use(
    errorHandler,
  );

  return {
    app,
    permissionList,
    roleCreate,
    assertPermission,
    assertFacilityAccess,
  };
}

describe(
  'identity routes',
  () => {
    it(
      'authenticates and authorizes permission-list access',
      async () => {
        const fixture =
          createFixture();

        const response =
          await request(
            fixture.app,
          )
            .get(
              '/api/v1/identity/permissions',
            )
            .set(
              'Authorization',
              'Bearer test-token',
            )
            .expect(
              200,
            );

        expect(
          response.body,
        ).toMatchObject({
          success:
            true,

          data: {
            page:
              1,

            pageSize:
              20,

            totalItems:
              0,
          },
        });

        expect(
          fixture.assertPermission,
        ).toHaveBeenCalledWith(
          principal,
          'identity.permissions.read',
        );

        expect(
          fixture.permissionList,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            page:
              1,

            pageSize:
              20,

            activeOnly:
              true,
          }),
        );
      },
    );

    it(
      'rejects a mutation without an idempotency key',
      async () => {
        const fixture =
          createFixture();

        await request(
          fixture.app,
        )
          .post(
            '/api/v1/identity/roles',
          )
          .set(
            'Authorization',
            'Bearer test-token',
          )
          .send({
            code:
              'AUDITOR',

            name:
              'Auditor',

            scope:
              'GLOBAL',

            permissionIds:
              [],
          })
          .expect(
            400,
          );

        expect(
          fixture.roleCreate,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'creates a global role through the protected mutation route',
      async () => {
        const fixture =
          createFixture();

        const response =
          await request(
            fixture.app,
          )
            .post(
              '/api/v1/identity/roles',
            )
            .set(
              'Authorization',
              'Bearer test-token',
            )
            .set(
              'Idempotency-Key',
              'role-create-0001',
            )
            .send({
              facilityId:
                null,

              code:
                'AUDITOR',

              name:
                'Auditor',

              scope:
                'GLOBAL',

              permissionIds:
                [],
            })
            .expect(
              201,
            );

        expect(
          response.body,
        ).toMatchObject({
          success:
            true,

          data: {
            role: {
              code:
                'AUDITOR',

              scope:
                'GLOBAL',
            },
          },
        });

        expect(
          fixture.assertPermission,
        ).toHaveBeenCalledWith(
          principal,
          'identity.roles.create',
        );

        expect(
          fixture.roleCreate,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            code:
              'AUDITOR',

            scope:
              'GLOBAL',
          }),

          expect.objectContaining({
            idempotencyKey:
              'role-create-0001',

            actor:
              expect.objectContaining({
                userId:
                  principal.userId,

                facilityId:
                  principal.facilityId,
              }),
          }),
        );
      },
    );

    it(
      'blocks a cross-facility staff query',
      async () => {
        const fixture =
          createFixture();

        await request(
          fixture.app,
        )
          .get(
            '/api/v1/identity/staff',
          )
          .query({
            facilityId:
              '507f191e810c19729de860ff',
          })
          .set(
            'Authorization',
            'Bearer test-token',
          )
          .expect(
            403,
          );

        expect(
          fixture.assertFacilityAccess,
        ).toHaveBeenCalledWith(
          principal,
          '507f191e810c19729de860ff',
        );
      },
    );

    it(
      'requires a bearer token',
      async () => {
        const fixture =
          createFixture();

        await request(
          fixture.app,
        )
          .get(
            '/api/v1/identity/permissions',
          )
          .expect(
            401,
          );
      },
    );
  },
);