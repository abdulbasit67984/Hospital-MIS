import type {
  Db,
} from '@hospital-mis/database';

import {
  MongoAuthorizationRepository,
} from './authorization.repository.js';

import {
  AuthorizationService,
} from './authorization.service.js';

export function createAuthorizationModule(
  database: Db,
) {
  const repository =
    new MongoAuthorizationRepository(
      database,
    );

  const service =
    new AuthorizationService(
      repository,
    );

  return {
    repository,
    service,
  };
}

export * from './authorization.middleware.js';
export * from './authorization.repository.js';
export * from './authorization.service.js';