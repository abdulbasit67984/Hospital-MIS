import {
  Router,
  type Request,
  type RequestHandler,
} from 'express';

import {
  ForbiddenError,
} from '@hospital-mis/shared';

import {
  z,
} from 'zod';

import {
  authenticate,
} from '../../middleware/authenticate.js';

import {
  validateRequest,
} from '../../middleware/validate-request.js';

import {
  requirePermission,
} from '../authorization/authorization.middleware.js';

import type {
  AuthorizationService,
} from '../authorization/authorization.service.js';

import type {
  AuthenticationService,
} from '../auth/auth.service.js';

import {
  ConfigurationController,
} from './configuration.controller.js';

import {
  FACILITY_PERMISSION_KEYS,
  SETTING_SCOPE,
} from './facility.constants.js';

import {
  assertFacilityOrManageAll,
  requireFacilityPrincipal,
  validatedFacilityPart,
} from './facility.http-helpers.js';

import {
  createSettingDefinitionBodySchema,
  facilityMutationHeadersSchema,
  settingDefinitionListQuerySchema,
  settingHistoryQuerySchema,
  settingIdParamsSchema,
  settingKeyParamsSchema,
  systemSettingListQuerySchema,
  updateSettingDefinitionBodySchema,
  upsertSystemSettingBodySchema,
} from './facility.validation.js';

import type {
  SettingDefinitionMutationService,
} from './services/setting-definition-mutation.service.js';

import type {
  SettingDefinitionService,
} from './services/setting-definition.service.js';

import type {
  SystemSettingService,
} from './services/system-setting.service.js';

interface SettingKeyParams {
  key:
    string;
}

interface SettingIdParams {
  settingId:
    string;
}

interface EffectiveSettingQuery {
  facilityId?:
    string;
}

interface SettingMutationBody {
  scope:
    'GLOBAL'
    | 'FACILITY';

  facilityId:
    string | null;
}

interface SensitiveDefinitionBody {
  isSensitive:
    boolean;
}

function enforceDefinitionCreateSensitivity(
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
          SensitiveDefinitionBody
        >(
          request,
          'body',
        );

      if (
        body.isSensitive
      ) {
        await authorization
          .assertPermission(
            requireFacilityPrincipal(
              request,
            ),

            FACILITY_PERMISSION_KEYS
              .CONFIGURATION_MANAGE_SENSITIVE,
          );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

function enforceDefinitionUpdateSensitivity(
  authorization:
    AuthorizationService,

  definitionService:
    SettingDefinitionService,
): RequestHandler {
  return async (
    request,
    _response,
    next,
  ) => {
    try {
      const params =
        validatedFacilityPart<
          SettingKeyParams
        >(
          request,
          'params',
        );

      const definition =
        await definitionService
          .getByKey(
            params.key,
          );

      if (
        definition.isSensitive
      ) {
        await authorization
          .assertPermission(
            requireFacilityPrincipal(
              request,
            ),

            FACILITY_PERMISSION_KEYS
              .CONFIGURATION_MANAGE_SENSITIVE,
          );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

function enforceSettingMutationBoundary(
  authorization:
    AuthorizationService,

  definitionService:
    SettingDefinitionService,
): RequestHandler {
  return async (
    request,
    _response,
    next,
  ) => {
    try {
      const params =
        validatedFacilityPart<
          SettingKeyParams
        >(
          request,
          'params',
        );

      const body =
        validatedFacilityPart<
          SettingMutationBody
        >(
          request,
          'body',
        );

      const principal =
        requireFacilityPrincipal(
          request,
        );

      if (
        body.scope ===
        SETTING_SCOPE.GLOBAL
      ) {
        await authorization
          .assertPermission(
            principal,

            FACILITY_PERMISSION_KEYS
              .CONFIGURATION_MANAGE_GLOBAL,
          );
      } else {
        if (
          body.facilityId ===
          null
        ) {
          throw new ForbiddenError(
            'Facility-scoped settings require a facility ID',
          );
        }

        await assertFacilityOrManageAll(
          request,
          authorization,
          body.facilityId,
        );
      }

      const definition =
        await definitionService
          .getByKey(
            params.key,
          );

      if (
        definition.isSensitive
      ) {
        await authorization
          .assertPermission(
            principal,

            FACILITY_PERMISSION_KEYS
              .CONFIGURATION_MANAGE_SENSITIVE,
          );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

function enforceSettingsListBoundary(
  authorization:
    AuthorizationService,
): RequestHandler {
  return async (
    request,
    _response,
    next,
  ) => {
    try {
      const query =
        validatedFacilityPart<{
          facilityId?:
            string | null;
        }>(
          request,
          'query',
        );

      if (
        typeof query.facilityId ===
        'string'
      ) {
        await assertFacilityOrManageAll(
          request,
          authorization,
          query.facilityId,
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

function enforceEffectiveSettingBoundary(
  authorization:
    AuthorizationService,
): RequestHandler {
  return async (
    request,
    _response,
    next,
  ) => {
    try {
      const query =
        validatedFacilityPart<
          EffectiveSettingQuery
        >(
          request,
          'query',
        );

      if (
        query.facilityId !==
        undefined
      ) {
        await assertFacilityOrManageAll(
          request,
          authorization,
          query.facilityId,
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

function enforceHistoryBoundary(
  authorization:
    AuthorizationService,

  settingService:
    SystemSettingService,
): RequestHandler {
  return async (
    request,
    _response,
    next,
  ) => {
    try {
      const params =
        validatedFacilityPart<
          SettingIdParams
        >(
          request,
          'params',
        );

      const setting =
        await settingService
          .getById(
            params.settingId,
          );

      if (
        setting.facilityId !==
        null
      ) {
        await assertFacilityOrManageAll(
          request,
          authorization,
          setting.facilityId,
        );
      }

      if (
        setting.isSensitive
      ) {
        await authorization
          .assertPermission(
            requireFacilityPrincipal(
              request,
            ),

            FACILITY_PERMISSION_KEYS
              .CONFIGURATION_MANAGE_SENSITIVE,
          );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

const effectiveSettingQuerySchema =
  z.object({
    facilityId:
      z
        .string()
        .regex(
          /^[a-f\d]{24}$/i,
          'Expected a valid MongoDB ObjectId',
        )
        .optional(),
  });

export interface CreateConfigurationRouterOptions {
  authenticationService:
    AuthenticationService;

  authorizationService:
    AuthorizationService;

  definitionService:
    SettingDefinitionService;

  definitionMutationService:
    SettingDefinitionMutationService;

  settingService:
    SystemSettingService;
}

export function createConfigurationRouter(
  options:
    CreateConfigurationRouterOptions,
): Router {
  const router =
    Router();

  const controller =
    new ConfigurationController(
      options.definitionService,
      options.definitionMutationService,
      options.settingService,
    );

  router.use(
    authenticate(
      options.authenticationService,
    ),
  );

  router.get(
    '/definitions',

    requirePermission(
      options.authorizationService,
      FACILITY_PERMISSION_KEYS
        .CONFIGURATION_DEFINITIONS_READ,
    ),

    validateRequest({
      query:
        settingDefinitionListQuerySchema,
    }),

    controller.listDefinitions,
  );

  router.post(
    '/definitions',

    validateRequest({
      headers:
        facilityMutationHeadersSchema,

      body:
        createSettingDefinitionBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      FACILITY_PERMISSION_KEYS
        .CONFIGURATION_MANAGE,
    ),

    enforceDefinitionCreateSensitivity(
      options.authorizationService,
    ),

    controller.createDefinition,
  );

  router.get(
    '/definitions/:key',

    validateRequest({
      params:
        settingKeyParamsSchema,
    }),

    requirePermission(
      options.authorizationService,
      FACILITY_PERMISSION_KEYS
        .CONFIGURATION_DEFINITIONS_READ,
    ),

    controller.getDefinition,
  );

  router.patch(
    '/definitions/:key',

    validateRequest({
      headers:
        facilityMutationHeadersSchema,

      params:
        settingKeyParamsSchema,

      body:
        updateSettingDefinitionBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      FACILITY_PERMISSION_KEYS
        .CONFIGURATION_MANAGE,
    ),

    enforceDefinitionUpdateSensitivity(
      options.authorizationService,
      options.definitionService,
    ),

    controller.updateDefinition,
  );

  router.get(
    '/settings',

    requirePermission(
      options.authorizationService,
      FACILITY_PERMISSION_KEYS
        .CONFIGURATION_READ,
    ),

    validateRequest({
      query:
        systemSettingListQuerySchema,
    }),

    enforceSettingsListBoundary(
      options.authorizationService,
    ),

    controller.listSettings,
  );

  router.get(
    '/settings/effective/:key',

    requirePermission(
      options.authorizationService,
      FACILITY_PERMISSION_KEYS
        .CONFIGURATION_READ,
    ),

    validateRequest({
      params:
        settingKeyParamsSchema,

      query:
        effectiveSettingQuerySchema,
    }),

    enforceEffectiveSettingBoundary(
      options.authorizationService,
    ),

    controller.getEffectiveSetting,
  );

  router.put(
    '/settings/:key',

    validateRequest({
      headers:
        facilityMutationHeadersSchema,

      params:
        settingKeyParamsSchema,

      body:
        upsertSystemSettingBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      FACILITY_PERMISSION_KEYS
        .CONFIGURATION_MANAGE,
    ),

    enforceSettingMutationBoundary(
      options.authorizationService,
      options.definitionService,
    ),

    controller.upsertSetting,
  );

  router.get(
    '/settings/:settingId/history',

    validateRequest({
      params:
        settingIdParamsSchema,

      query:
        settingHistoryQuerySchema,
    }),

    requirePermission(
      options.authorizationService,
      FACILITY_PERMISSION_KEYS
        .CONFIGURATION_READ_HISTORY,
    ),

    enforceHistoryBoundary(
      options.authorizationService,
      options.settingService,
    ),

    controller.listSettingHistory,
  );

  return router;
}