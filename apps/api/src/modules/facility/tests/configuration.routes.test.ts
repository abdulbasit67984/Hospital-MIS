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

import {
  createConfigurationRouter,
} from '../configuration.routes.js';

import {
  FACILITY_PERMISSION_KEYS,
} from '../facility.constants.js';

import type {
  SettingDefinitionMutationService,
} from '../services/setting-definition-mutation.service.js';

import type {
  SettingDefinitionService,
} from '../services/setting-definition.service.js';

import type {
  SystemSettingService,
} from '../services/system-setting.service.js';

const facilityId =
  '507f191e810c19729de860ea';

const foreignFacilityId =
  '507f191e810c19729de860eb';

const principal = {
  userId:
    '507f1f77bcf86cd799439011',

  sessionId:
    '25da21e9-d661-41dc-b2e8-734f30f3f5a8',

  facilityId,

  accessTokenId:
    'access-token-1',

  tokenVersion:
    0,

  permissionVersion:
    0,
};

function sensitiveDefinition() {
  return {
    id:
      '507f1f77bcf86cd799439031',

    key:
      'integrations.sms.api_key',

    category:
      'INTEGRATIONS',

    dataType:
      'SECRET',

    allowedScopes: [
      'FACILITY',
      'GLOBAL',
    ],

    defaultValue:
      null,

    labels:
      [],

    validation: {
      required:
        true,

      minLength:
        8,

      maxLength:
        200,

      pattern:
        null,

      minimum:
        null,

      maximum:
        null,

      allowedValues:
        [],

      jsonSchema:
        null,
    },

    isSensitive:
      true,

    isMutable:
      true,

    isActive:
      true,

    cacheTtlSeconds:
      300,

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

  const listDefinitions =
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
      });

  const getByKey =
    vi.fn()
      .mockResolvedValue(
        sensitiveDefinition(),
      );

  const definitionService = {
    list:
      listDefinitions,

    getByKey,
  } as unknown as SettingDefinitionService;

  const definitionMutationService = {
    create:
      vi.fn(),

    update:
      vi.fn(),
  } as unknown as SettingDefinitionMutationService;

  const upsert =
    vi.fn()
      .mockResolvedValue({
        id:
          '507f1f77bcf86cd799439041',

        definitionId:
          '507f1f77bcf86cd799439031',

        key:
          'integrations.sms.api_key',

        scope:
          'GLOBAL',

        facilityId:
          null,

        value:
          null,

        isSensitive:
          true,

        isConfigured:
          true,

        revision:
          1,

        isActive:
          true,

        version:
          0,

        createdAt:
          '2026-07-17T10:00:00.000Z',

        updatedAt:
          '2026-07-17T10:00:00.000Z',
      });

  const settingService = {
    list:
      vi.fn(),

    resolveEffective:
      vi.fn(),

    upsert,

    getById:
      vi.fn(),

    listHistory:
      vi.fn(),
  } as unknown as SystemSettingService;

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
    '/api/v1/configuration',

    createConfigurationRouter({
      authenticationService,
      authorizationService,
      definitionService,
      definitionMutationService,
      settingService,
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
    listDefinitions,
    getByKey,
    upsert,
  };
}

describe(
  'configuration routes',
  () => {
    it(
      'uses configuration.definitions.read for definition listing',
      async () => {
        const fixture =
          createFixture();

        const response =
          await request(
            fixture.app,
          )
            .get(
              '/api/v1/configuration/definitions?page=1&pageSize=20',
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
          fixture.assertPermission,
        ).toHaveBeenCalledWith(
          principal,
          FACILITY_PERMISSION_KEYS
            .CONFIGURATION_DEFINITIONS_READ,
        );
      },
    );

    it(
      'requires global and sensitive permissions for a sensitive global setting',
      async () => {
        const fixture =
          createFixture();

        const response =
          await request(
            fixture.app,
          )
            .put(
              '/api/v1/configuration/settings/integrations.sms.api_key',
            )
            .set(
              'Authorization',
              'Bearer token',
            )
            .set(
              'Idempotency-Key',
              'global-sensitive-setting-0001',
            )
            .send({
              scope:
                'GLOBAL',

              facilityId:
                null,

              value:
                'super-secret-api-key',

              expectedVersion:
                null,

              expectedRevision:
                null,

              reason:
                'Configure global SMS gateway',
            });

        expect(
          response.status,
        ).toBe(
          200,
        );

        expect(
          fixture.assertPermission,
        ).toHaveBeenCalledWith(
          principal,
          FACILITY_PERMISSION_KEYS
            .CONFIGURATION_MANAGE,
        );

        expect(
          fixture.assertPermission,
        ).toHaveBeenCalledWith(
          principal,
          FACILITY_PERMISSION_KEYS
            .CONFIGURATION_MANAGE_GLOBAL,
        );

        expect(
          fixture.assertPermission,
        ).toHaveBeenCalledWith(
          principal,
          FACILITY_PERMISSION_KEYS
            .CONFIGURATION_MANAGE_SENSITIVE,
        );

        expect(
          fixture.upsert,
        ).toHaveBeenCalledWith(
          'integrations.sms.api_key',

          expect.objectContaining({
            scope:
              'GLOBAL',

            facilityId:
              null,
          }),

          expect.objectContaining({
            userId:
              principal.userId,

            facilityId:
              principal.facilityId,
          }),

          'global-sensitive-setting-0001',
        );
      },
    );

    it(
      'denies a foreign facility-scoped setting without facilities.manage_all',
      async () => {
        const fixture =
          createFixture(
            false,
          );

        const response =
          await request(
            fixture.app,
          )
            .put(
              '/api/v1/configuration/settings/integrations.sms.api_key',
            )
            .set(
              'Authorization',
              'Bearer token',
            )
            .set(
              'Idempotency-Key',
              'foreign-sensitive-setting-0001',
            )
            .send({
              scope:
                'FACILITY',

              facilityId:
                foreignFacilityId,

              value:
                'super-secret-api-key',

              expectedVersion:
                null,

              expectedRevision:
                null,

              reason:
                'Configure another branch',
            });

        expect(
          response.status,
        ).toBe(
          403,
        );

        expect(
          fixture.upsert,
        ).not.toHaveBeenCalled();

        expect(
          fixture.hasPermission,
        ).toHaveBeenCalledWith(
          principal,
          FACILITY_PERMISSION_KEYS
            .FACILITY_MANAGE_ALL,
        );
      },
    );
  },
);