import type {
  Db,
} from '@hospital-mis/database';

import {
  MongoAuditRepository,
} from './audit.repository.js';

import {
  AuditService,
} from './audit.service.js';

export function createAuditModule(
  database: Db,
) {
  const repository =
    new MongoAuditRepository(
      database,
    );

  const service =
    new AuditService(
      repository,
    );

  return {
    repository,
    service,
  };
}

export * from './audit.middleware.js';
export * from './audit.repository.js';
export * from './audit.sanitizer.js';
export * from './audit.service.js';
export * from './audit.types.js';