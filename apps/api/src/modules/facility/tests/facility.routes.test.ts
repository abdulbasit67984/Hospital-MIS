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
} from '@hospital-mis/shared';

import type {
  AuthenticationService,
} from '../../auth/auth.service.js';

import type {
  AuthorizationService,
} from '../../authorization/authorization.service.js';

import type {
  FacilityApplication,
} from '../facility.application.js';

import {
  FACILITY_PERMISSION_KEYS,
} from '../facility.constants.js';

import type {
  FacilityLifecycleService,
} from '../facility.lifecycle.service.js';

import {
  createFacilityRecordPolicies,
} from '../facility.policy.js';

import {
  createFacilityRouter,
} from '../facility.routes.js';

const ownFacilityId =
  '507f191e810c19729de860ea';

const otherFacilityId =
  '507f191e810c19729de860eb';

const departmentId =
  '507f1f77bcf86cd799439011';

const principal = {
  userId:
    '507f1f77bcf86cd799439012',

  sessionId:
    '25da21e9-d661-41dc-b2e8-734f30f3f5a8',

  facilityId:
    ownFacilityId,

  accessTokenId:
    'access-token-1',

  tokenVersion:
    0,

  permissionVersion:
    0,
};

function facilityDto(
  id:
    string,
) {
  return {
    id,

    code:
      id ===
      ownFacilityId
        ? 'MAIN'
        : 'OTHER',

    name:
      id ===
      ownFacilityId
        ? 'Main Hospital'
        : 'Other Hospital',

    legalName:
      null,

    facilityType:
      'HOSPITAL',

    parentFacilityId:
      null,

    identifiers:
      [],

    timezone:
      'Asia/Karachi',

    currency:
      'PKR',

    locale:
      'en-PK',

    supportedLocales: [
      'en-PK',
    ],

    address: {
      line1:
        null,

      line2:
        null,

      city:
        'Lahore',

      district:
        null,

      province:
        'Punjab',

      postalCode:
        null,

      countryCode:
        'PK',
    },

    contact: {
      primaryPhone:
        null,

      secondaryPhone:
        null,

      email:
        null,

      website:
        null,

      emergencyPhone:
        null,
    },

    status:
      'ACTIVE',

    allowsAuthentication:
      true,

    deactivatedAt:
      null,

    deactivatedBy:
      null,

    deactivationReason:
      null,

    version:
      0,

    createdAt:
      '2026-07-17T10:00:00.000Z',

    updatedAt:
      '2026-07-17T10:00:00.000Z',
  };
}

function departmentDto() {
  return {
    id:
      departmentId,

    facilityId:
      ownFacilityId,

    parentDepartmentId:
      null,

    managerStaffId:
      null,

    code:
      'OPD',

    name:
      'Outpatient Department',

    description:
      null,

    departmentType:
      'CLINICAL',

    isClinical:
      true,

    location:
      'Ground Floor',

    costCenterCode:
      null,

    contact: {
      phone:
        null,

      extension:
        null,

      email:
        null,
    },

    status:
      'ACTIVE',

    deactivatedAt:
      null,

    deactivatedBy:
      null,

    deactivationReason:
      null,

    version:
      0,

    createdAt:
      '2026-07-17T10:00:00.000Z',

    updatedAt:
      '2026-07-17T10:00:00.000Z',
  };
}

function createFixture(
  manageAll =
    false,
) {
  const authenticateAccessToken =
    vi.fn()
      .mockResolvedValue(
        principal,
      );

  const authenticationService = {
    authenticateAccessToken,
  } as unknown as AuthenticationService;

  const assertPermission =
    vi.fn()
      .mockResolvedValue(
        undefined,
      );

  const hasPermission =
    vi.fn(
      async (
        _principal,
        permission:
          string,
      ) =>
        permission ===
          FACILITY_PERMISSION_KEYS
            .FACILITY_MANAGE_ALL
          ? manageAll
          : true,
    );

  const authorizationService = {
    assertPermission,
    hasPermission,
  } as unknown as AuthorizationService;

  const getFacilityById =
    vi.fn(
      async (
        facilityId:
          string,
      ) =>
        facilityDto(
          facilityId,
        ),
    );

  const listFacilities =
    vi.fn()
      .mockResolvedValue({
        items: [
          facilityDto(
            ownFacilityId,
          ),

          facilityDto(
            otherFacilityId,
          ),
        ],

        page:
          1,

        pageSize:
          20,

        totalItems:
          2,

        totalPages:
          1,
      });

  const createDepartment =
    vi.fn()
      .mockResolvedValue(
        departmentDto(),
      );

  const application = {
    facilityService: {
      getById:
        getFacilityById,

      list:
        listFacilities,

      create:
        vi.fn(),

      update:
        vi.fn(),
    },

    departmentService: {
      getByIdInFacility:
        vi.fn()
          .mockResolvedValue(
            departmentDto(),
          ),

      list:
        vi.fn()
          .mockResolvedValue({
            items:
              [],

            page:
              1,

            pageSize:
              20,

            totalItems:
              0,

            totalPages:
              0,
          }),

      create:
        createDepartment,

      update:
        vi.fn(),
    },
  } as unknown as FacilityApplication;

  const lifecycleService = {
    activateFacility:
      vi.fn(),

    deactivateFacility:
      vi.fn(),

    activateDepartment:
      vi.fn(),

    deactivateDepartment:
      vi.fn(),
  } as unknown as FacilityLifecycleService;

  const app =
    express();

  app.use(
    (
      request,
      _response,
      next,
    ) => {
      request.correlationId =
        'test-correlation';

      next();
    },
  );

  app.use(
    express.json(),
  );

  app.use(
    '/api/v1/facilities',

    createFacilityRouter({
      application,
      lifecycleService,
      authenticationService,
      authorizationService,

      policies:
        createFacilityRecordPolicies(
          authorizationService,
        ),
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
                request.correlationId,
            },
          });

        return;
      }

      response
        .status(500)
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
    assertPermission,
    hasPermission,
    listFacilities,
    getFacilityById,
    createDepartment,
  };
}

describe(
  'facility routes',
  () => {
    it(
      'returns only the authenticated facility without facilities.manage_all',
      async () => {
        const fixture =
          createFixture(
            false,
          );

        const response =
          await request(
            fixture.app,
          )
            .get(
              '/api/v1/facilities?page=1&pageSize=20',
            )
            .set(
              'Authorization',
              'Bearer token',
            );

        expect(
          response.status,
        ).toBe(
          200,
        );

        expect(
          response.body.data.items,
        ).toHaveLength(
          1,
        );

        expect(
          response.body.data.items[0].id,
        ).toBe(
          ownFacilityId,
        );

        expect(
          fixture.listFacilities,
        ).not.toHaveBeenCalled();

        expect(
          fixture.assertPermission,
        ).toHaveBeenCalledWith(
          principal,
          FACILITY_PERMISSION_KEYS
            .FACILITY_READ,
        );
      },
    );

    it(
      'denies a foreign facility record without facilities.manage_all',
      async () => {
        const fixture =
          createFixture(
            false,
          );

        const response =
          await request(
            fixture.app,
          )
            .get(
              `/api/v1/facilities/${otherFacilityId}`,
            )
            .set(
              'Authorization',
              'Bearer token',
            );

        expect(
          response.status,
        ).toBe(
          403,
        );

        expect(
          response.body.error.message,
        ).toContain(
          'outside the authenticated facility context',
        );
      },
    );

    it(
      'merges the path facility into department creation',
      async () => {
        const fixture =
          createFixture(
            false,
          );

        const response =
          await request(
            fixture.app,
          )
            .post(
              `/api/v1/facilities/${ownFacilityId}/departments`,
            )
            .set(
              'Authorization',
              'Bearer token',
            )
            .set(
              'Idempotency-Key',
              'create-department-0001',
            )
            .send({
              parentDepartmentId:
                null,

              managerStaffId:
                null,

              code:
                'OPD',

              name:
                'Outpatient Department',

              description:
                null,

              departmentType:
                'CLINICAL',

              isClinical:
                true,

              location:
                'Ground Floor',

              costCenterCode:
                null,

              contact: {
                phone:
                  null,

                extension:
                  null,

                email:
                  null,
              },
            });

        expect(
          response.status,
        ).toBe(
          201,
        );

        expect(
          fixture.createDepartment,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            facilityId:
              ownFacilityId,

            code:
              'OPD',
          }),

          expect.objectContaining({
            userId:
              principal.userId,

            facilityId:
              principal.facilityId,
          }),

          'create-department-0001',
        );

        expect(
          fixture.assertPermission,
        ).toHaveBeenCalledWith(
          principal,
          FACILITY_PERMISSION_KEYS
            .DEPARTMENT_CREATE,
        );
      },
    );
  },
);