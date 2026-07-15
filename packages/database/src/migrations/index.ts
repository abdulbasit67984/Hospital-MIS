import type {
  Db,
} from 'mongodb';

import {
  initializeDatabase,
} from './001-initialize-database.js';

import {
  authenticationFoundation,
} from './002-authentication-foundation.js';

import {
  accessControlFoundation,
} from './003-access-control-foundation.js';

import {
  auditFoundation,
} from './004-audit-foundation.js';

import {
  operationalInfrastructure,
} from './005-operational-infrastructure.js';

export const migrations = [
  initializeDatabase,
  authenticationFoundation,
  accessControlFoundation,
  auditFoundation,
  operationalInfrastructure,
] as const;

export async function runMigrations(
  database: Db,
): Promise<void> {
  await database
    .collection('_migrations')
    .createIndex(
      {
        id: 1,
      },
      {
        unique: true,
      },
    );

  const applied =
    new Set(
      (
        await database
          .collection(
            '_migrations',
          )
          .find({})
          .project({
            id: 1,
          })
          .toArray()
      ).map((record) =>
        String(
          record['id'],
        ),
      ),
    );

  for (
    const migration of
    migrations
  ) {
    if (
      applied.has(
        migration.id,
      )
    ) {
      continue;
    }

    await migration.up(
      database,
    );

    await database
      .collection(
        '_migrations',
      )
      .insertOne({
        id:
          migration.id,

        description:
          migration.description,

        appliedAt:
          new Date(),
      });
  }
}