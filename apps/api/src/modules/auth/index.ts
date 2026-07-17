import type {
  ApiConfig,
  AuthConfig,
} from '@hospital-mis/config';

import type {
  Db,
} from '@hospital-mis/database';

import {
  MongoAuthRepository,
} from './auth.repository.js';

import {
  withFacilityStatusEnforcement,
  type AuthenticationFacilityAccessPort,
} from './auth.repository.facility-aware.js';

import {
  createAuthenticationRouter,
} from './auth.routes.js';

import {
  AuthenticationService,
} from './auth.service.js';

export function createAuthenticationModule(
  input: {
    database:
      Db;

    apiConfig:
      ApiConfig;

    authConfig:
      AuthConfig;

    facilityAccess?:
      AuthenticationFacilityAccessPort;
  },
) {
  const baseRepository =
    new MongoAuthRepository(
      input.database,
    );

  const repository =
    input.facilityAccess ===
    undefined
      ? baseRepository
      : withFacilityStatusEnforcement(
          baseRepository,
          input.facilityAccess,
        );

  const service =
    new AuthenticationService(
      repository,
      input.authConfig,
    );

  const router =
    createAuthenticationRouter({
      service,

      apiConfig:
        input.apiConfig,
    });

  return {
    baseRepository,
    repository,
    service,
    router,
  };
}

export * from './auth.repository.js';
export * from './auth.repository.facility-aware.js';
export * from './auth.service.js';
export * from './auth.types.js';