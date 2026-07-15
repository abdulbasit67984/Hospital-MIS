import type {
  Db,
} from '@hospital-mis/database';

import type {
  ApiConfig,
  AuthConfig,
} from '@hospital-mis/config';

import {
  MongoAuthRepository,
} from './auth.repository.js';

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
  },
) {
  const repository =
    new MongoAuthRepository(
      input.database,
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
    repository,
    service,
    router,
  };
}

export * from './auth.repository.js';
export * from './auth.service.js';
export * from './auth.types.js';