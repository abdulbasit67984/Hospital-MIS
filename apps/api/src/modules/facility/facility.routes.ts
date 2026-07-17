import {
  Router,
  type Request,
  type RequestHandler,
} from 'express';

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
  DepartmentController,
} from './controllers/department.controller.js';

import {
  FacilityController,
} from './controllers/facility.controller.js';

import type {
  FacilityApplication,
} from './facility.application.js';

import {
  FACILITY_PERMISSION_KEYS,
} from './facility.constants.js';

import {
  assertFacilityOrManageAll,
  validatedFacilityPart,
} from './facility.http-helpers.js';

import type {
  FacilityLifecycleService,
} from './facility.lifecycle.service.js';

import type {
  FacilityRecordPolicies,
} from './facility.policy.js';

import {
  createDepartmentBodySchema,
  createFacilityBodySchema,
  departmentIdParamsSchema,
  departmentListQuerySchema,
  departmentStatusBodySchema,
  facilityIdParamsSchema,
  facilityListQuerySchema,
  facilityMutationHeadersSchema,
  facilityStatusBodySchema,
  updateDepartmentBodySchema,
  updateFacilityBodySchema,
} from './facility.validation.js';

interface FacilityIdParams {
  facilityId:
    string;
}

interface DepartmentIdParams {
  facilityId:
    string;

  departmentId:
    string;
}

interface CreateFacilityBoundaryBody {
  parentFacilityId?:
    string | null;
}

function requireFacilityBoundary(
  authorization:
    AuthorizationService,

  resolveFacilityId:
    (
      request:
        Request,
    ) => string,
): RequestHandler {
  return async (
    request,
    _response,
    next,
  ) => {
    try {
      await assertFacilityOrManageAll(
        request,
        authorization,
        resolveFacilityId(
          request,
        ),
      );

      next();
    } catch (error) {
      next(error);
    }
  };
}

function requireCreateFacilityParentBoundary(
  authorization:
    AuthorizationService,
): RequestHandler {
  return async (
    request,
    _response,
    next,
  ) => {
    try {
      const body =
        validatedFacilityPart<
          CreateFacilityBoundaryBody
        >(
          request,
          'body',
        );

      if (
        typeof body.parentFacilityId ===
        'string'
      ) {
        await assertFacilityOrManageAll(
          request,
          authorization,
          body.parentFacilityId,
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export interface CreateFacilityRouterOptions {
  application:
    FacilityApplication;

  lifecycleService:
    FacilityLifecycleService;

  authenticationService:
    AuthenticationService;

  authorizationService:
    AuthorizationService;

  policies:
    FacilityRecordPolicies;
}

export function createFacilityRouter(
  options:
    CreateFacilityRouterOptions,
): Router {
  const router =
    Router();

  const facilityController =
    new FacilityController(
      options.application
        .facilityService,

      options.lifecycleService,
      options.authorizationService,
    );

  const departmentController =
    new DepartmentController(
      options.application
        .departmentService,

      options.lifecycleService,
    );

  router.use(
    authenticate(
      options.authenticationService,
    ),
  );

  router.get(
    '/',

    requirePermission(
      options.authorizationService,
      FACILITY_PERMISSION_KEYS
        .FACILITY_READ,
    ),

    validateRequest({
      query:
        facilityListQuerySchema,
    }),

    facilityController.list,
  );

  router.post(
    '/',

    validateRequest({
      headers:
        facilityMutationHeadersSchema,

      body:
        createFacilityBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      FACILITY_PERMISSION_KEYS
        .FACILITY_CREATE,
    ),

    requireCreateFacilityParentBoundary(
      options.authorizationService,
    ),

    facilityController.create,
  );

  router.get(
    '/:facilityId',

    validateRequest({
      params:
        facilityIdParamsSchema,
    }),

    requirePermission(
      options.authorizationService,
      FACILITY_PERMISSION_KEYS
        .FACILITY_READ,
    ),

    enforceRecordPolicy(
      options.policies.facility,

      async (
        request,
      ) => {
        const params =
          validatedFacilityPart<
            FacilityIdParams
          >(
            request,
            'params',
          );

        return options.application
          .facilityService
          .getById(
            params.facilityId,
          );
      },
    ),

    facilityController.getById,
  );

  router.patch(
    '/:facilityId',

    validateRequest({
      headers:
        facilityMutationHeadersSchema,

      params:
        facilityIdParamsSchema,

      body:
        updateFacilityBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      FACILITY_PERMISSION_KEYS
        .FACILITY_UPDATE,
    ),

    enforceRecordPolicy(
      options.policies.facility,

      async (
        request,
      ) => {
        const params =
          validatedFacilityPart<
            FacilityIdParams
          >(
            request,
            'params',
          );

        return options.application
          .facilityService
          .getById(
            params.facilityId,
          );
      },
    ),

    facilityController.update,
  );

  router.post(
    '/:facilityId/activate',

    validateRequest({
      headers:
        facilityMutationHeadersSchema,

      params:
        facilityIdParamsSchema,

      body:
        facilityStatusBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      FACILITY_PERMISSION_KEYS
        .FACILITY_ACTIVATE,
    ),

    enforceRecordPolicy(
      options.policies.facility,

      async (
        request,
      ) => {
        const params =
          validatedFacilityPart<
            FacilityIdParams
          >(
            request,
            'params',
          );

        return options.application
          .facilityService
          .getById(
            params.facilityId,
          );
      },
    ),

    facilityController.activate,
  );

  router.post(
    '/:facilityId/deactivate',

    validateRequest({
      headers:
        facilityMutationHeadersSchema,

      params:
        facilityIdParamsSchema,

      body:
        facilityStatusBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      FACILITY_PERMISSION_KEYS
        .FACILITY_DEACTIVATE,
    ),

    enforceRecordPolicy(
      options.policies.facility,

      async (
        request,
      ) => {
        const params =
          validatedFacilityPart<
            FacilityIdParams
          >(
            request,
            'params',
          );

        return options.application
          .facilityService
          .getById(
            params.facilityId,
          );
      },
    ),

    facilityController.deactivate,
  );

  router.get(
    '/:facilityId/departments',

    validateRequest({
      params:
        facilityIdParamsSchema,

      query:
        departmentListQuerySchema,
    }),

    requirePermission(
      options.authorizationService,
      FACILITY_PERMISSION_KEYS
        .DEPARTMENT_READ,
    ),

    requireFacilityBoundary(
      options.authorizationService,

      (
        request,
      ) =>
        validatedFacilityPart<
          FacilityIdParams
        >(
          request,
          'params',
        ).facilityId,
    ),

    departmentController.list,
  );

  router.post(
    '/:facilityId/departments',

    validateRequest({
      headers:
        facilityMutationHeadersSchema,

      params:
        facilityIdParamsSchema,

      body:
        createDepartmentBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      FACILITY_PERMISSION_KEYS
        .DEPARTMENT_CREATE,
    ),

    requireFacilityBoundary(
      options.authorizationService,

      (
        request,
      ) =>
        validatedFacilityPart<
          FacilityIdParams
        >(
          request,
          'params',
        ).facilityId,
    ),

    departmentController.create,
  );

  router.get(
    '/:facilityId/departments/:departmentId',

    validateRequest({
      params:
        departmentIdParamsSchema,
    }),

    requirePermission(
      options.authorizationService,
      FACILITY_PERMISSION_KEYS
        .DEPARTMENT_READ,
    ),

    enforceRecordPolicy(
      options.policies.department,

      async (
        request,
      ) => {
        const params =
          validatedFacilityPart<
            DepartmentIdParams
          >(
            request,
            'params',
          );

        return options.application
          .departmentService
          .getByIdInFacility(
            params.departmentId,
            params.facilityId,
          );
      },
    ),

    departmentController.getById,
  );

  router.patch(
    '/:facilityId/departments/:departmentId',

    validateRequest({
      headers:
        facilityMutationHeadersSchema,

      params:
        departmentIdParamsSchema,

      body:
        updateDepartmentBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      FACILITY_PERMISSION_KEYS
        .DEPARTMENT_UPDATE,
    ),

    enforceRecordPolicy(
      options.policies.department,

      async (
        request,
      ) => {
        const params =
          validatedFacilityPart<
            DepartmentIdParams
          >(
            request,
            'params',
          );

        return options.application
          .departmentService
          .getByIdInFacility(
            params.departmentId,
            params.facilityId,
          );
      },
    ),

    departmentController.update,
  );

  router.post(
    '/:facilityId/departments/:departmentId/activate',

    validateRequest({
      headers:
        facilityMutationHeadersSchema,

      params:
        departmentIdParamsSchema,

      body:
        departmentStatusBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      FACILITY_PERMISSION_KEYS
        .DEPARTMENT_ACTIVATE,
    ),

    enforceRecordPolicy(
      options.policies.department,

      async (
        request,
      ) => {
        const params =
          validatedFacilityPart<
            DepartmentIdParams
          >(
            request,
            'params',
          );

        return options.application
          .departmentService
          .getByIdInFacility(
            params.departmentId,
            params.facilityId,
          );
      },
    ),

    departmentController.activate,
  );

  router.post(
    '/:facilityId/departments/:departmentId/deactivate',

    validateRequest({
      headers:
        facilityMutationHeadersSchema,

      params:
        departmentIdParamsSchema,

      body:
        departmentStatusBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      FACILITY_PERMISSION_KEYS
        .DEPARTMENT_DEACTIVATE,
    ),

    enforceRecordPolicy(
      options.policies.department,

      async (
        request,
      ) => {
        const params =
          validatedFacilityPart<
            DepartmentIdParams
          >(
            request,
            'params',
          );

        return options.application
          .departmentService
          .getByIdInFacility(
            params.departmentId,
            params.facilityId,
          );
      },
    ),

    departmentController.deactivate,
  );

  return router;
}