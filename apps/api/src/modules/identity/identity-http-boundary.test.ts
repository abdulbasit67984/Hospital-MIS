import type {
  Request,
  Response,
} from 'express';

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  AppError,
} from '@hospital-mis/shared';

import {
  identityActorFromRequest,
  idempotencyKeyFromRequest,
} from './controllers/identity-controller.helpers.js';

import {
  PermissionController,
} from './controllers/permission.controller.js';

import {
  IdentityValidationError,
} from './identity.errors.js';

import {
  createIdentityRecordPolicies,
} from './identity.policy.js';

import type {
  PermissionService,
} from './services/permission.service.js';

const principal = {
  userId:
    '507f1f77bcf86cd799439011',

  facilityId:
    '507f191e810c19729de860ea',

  sessionId:
    'session-1',

  accessTokenId:
    'access-token-1',

  tokenVersion:
    0,

  permissionVersion:
    0,
};

function requestFixture(
  overrides:
    Partial<Request> = {},
): Request {
  const headers =
    new Map<
      string,
      string
    >([
      [
        'idempotency-key',
        'identity-test-key-0001',
      ],

      [
        'user-agent',
        'Vitest',
      ],
    ]);

  return {
    auth:
      principal,

    correlationId:
      'correlation-1',

    ip:
      '127.0.0.1',

    validated: {
      params: {},
      query: {},
      body: {},
    },

    header:
      vi.fn(
        (
          name:
            string,
        ) =>
          headers.get(
            name.toLocaleLowerCase(
              'en-US',
            ),
          ),
      ),

    ...overrides,
  } as unknown as Request;
}

function responseFixture(): {
  response:
    Response;

  status:
    ReturnType<
      typeof vi.fn
    >;

  json:
    ReturnType<
      typeof vi.fn
    >;
} {
  const json =
    vi.fn();

  const status =
    vi.fn(
      () => ({
        json,
      }),
    );

  return {
    response: {
      status,
    } as unknown as Response,

    status,

    json,
  };
}

describe(
  'identity HTTP boundary',
  () => {
    it(
      'exposes identity domain errors through the shared error contract',
      () => {
        const error =
          new IdentityValidationError(
            'Invalid role assignment',
            {
              roleId:
                '507f1f77bcf86cd799439012',
            },
          );

        expect(
          error,
        ).toBeInstanceOf(
          AppError,
        );

        expect(
          error,
        ).toMatchObject({
          statusCode:
            400,

          code:
            'IDENTITY_VALIDATION_FAILED',

          expose:
            true,
        });

        expect(
          error.details,
        ).toEqual([
          {
            code:
              'identity_role_id',

            message:
              '507f1f77bcf86cd799439012',

            path:
              'roleId',
          },
        ]);
      },
    );

    it(
      'builds a safe mutation actor and validates idempotency keys',
      () => {
        const request =
          requestFixture();

        expect(
          identityActorFromRequest(
            request,
          ),
        ).toEqual({
          userId:
            principal.userId,

          facilityId:
            principal.facilityId,

          correlationId:
            'correlation-1',

          ipAddress:
            '127.0.0.1',

          userAgent:
            'Vitest',
        });

        expect(
          idempotencyKeyFromRequest(
            request,
          ),
        ).toBe(
          'identity-test-key-0001',
        );

        expect(
          () =>
            idempotencyKeyFromRequest(
              requestFixture({
                header:
                  vi.fn(
                    () =>
                      undefined,
                  ),
              }),
            ),
        ).toThrow(
          'Idempotency-Key header is required',
        );
      },
    );

    it(
      'returns permission pages in the standard API envelope',
      async () => {
        const list =
          vi.fn()
            .mockResolvedValue({
              items: [],
              page: 1,
              pageSize: 20,
              totalItems: 0,
              totalPages: 0,
            });

        const service = {
          list,
        } as unknown as PermissionService;

        const controller =
          new PermissionController(
            service,
          );

        const request =
          requestFixture({
            validated: {
              query: {
                page: 1,
                pageSize: 20,
                activeOnly: true,
                sortBy: 'module',
                sortDirection:
                  'asc',
              },
            },
          });

        const fixture =
          responseFixture();

        await controller.list(
          request,
          fixture.response,
        );

        expect(
          list,
        ).toHaveBeenCalledWith(
          request.validated
            .query,
        );

        expect(
          fixture.status,
        ).toHaveBeenCalledWith(
          200,
        );

        expect(
          fixture.json,
        ).toHaveBeenCalledWith({
          success:
            true,

          data: {
            items: [],
            page: 1,
            pageSize: 20,
            totalItems: 0,
            totalPages: 0,
          },

          meta: {
            correlationId:
              'correlation-1',
          },
        });
      },
    );

    it(
      'enforces facility restrictions for staff, roles, and users',
      async () => {
        const policies =
          createIdentityRecordPolicies();

        const request =
          requestFixture();

        await expect(
          policies.staff.evaluate({
            principal,
            request,

            record: {
              id:
                '507f1f77bcf86cd799439021',

              facilityId:
                '507f1f77bcf86cd799439099',

              departmentId:
                null,

              employeeNumber:
                'EMP-1',

              firstName:
                'Ayesha',

              middleName:
                null,

              lastName:
                'Khan',

              displayName:
                'Ayesha Khan',

              cnic:
                null,

              phone:
                null,

              email:
                null,

              designation:
                null,

              professionalType:
                null,

              professionalRegistrationNumber:
                null,

              joiningDate:
                null,

              employmentStatus:
                'ACTIVE',

              isClinical:
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
          }),
        ).resolves.toMatchObject({
          allowed:
            false,
        });

        await expect(
          policies.role.evaluate({
            principal,
            request,

            record: {
              id:
                '507f1f77bcf86cd799439022',

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
                true,

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
          }),
        ).resolves.toEqual({
          allowed:
            true,
        });

        await expect(
          policies.user.evaluate({
            principal,
            request,

            record: {
              user: {
                id:
                  '507f1f77bcf86cd799439023',

                staffId:
                  null,

                username:
                  'other.user',

                email:
                  null,

                status:
                  'ACTIVE',

                mustChangePassword:
                  false,

                failedLoginAttempts:
                  0,

                lockedUntil:
                  null,

                lastLoginAt:
                  null,

                passwordChangedAt:
                  null,

                version:
                  0,

                createdAt:
                  new Date()
                    .toISOString(),

                updatedAt:
                  new Date()
                    .toISOString(),
              },

              roleAssignments: [
                {
                  id:
                    '507f1f77bcf86cd799439024',

                  userId:
                    '507f1f77bcf86cd799439023',

                  roleId:
                    '507f1f77bcf86cd799439025',

                  facilityId:
                    principal.facilityId,

                  assignedBy:
                    principal.userId,

                  assignedAt:
                    new Date()
                      .toISOString(),

                  expiresAt:
                    null,

                  isActive:
                    true,

                  revokedAt:
                    null,

                  revokedBy:
                    null,

                  revocationReason:
                    null,
                },
              ],
            },
          }),
        ).resolves.toEqual({
          allowed:
            true,
        });
      },
    );
  },
);