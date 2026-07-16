import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  migrations,
} from '../migrations/index.js';
import {
  identitySchemaAlignment,
  identitySchemaAlignmentCollections,
  identitySchemaAlignmentValidators,
} from '../migrations/006-identity-schema-alignment.js';

function jsonSchema(
  collection:
    (typeof identitySchemaAlignmentCollections)[number],
): Record<string, unknown> {
  const validator =
    identitySchemaAlignmentValidators[
      collection
    ];

  return validator[
    '$jsonSchema'
  ] as Record<string, unknown>;
}

describe(
  'identity schema alignment migration',
  () => {
    it(
      'is registered after the Phase 3 infrastructure migrations',
      () => {
        expect(
          migrations.at(-1),
        ).toBe(
          identitySchemaAlignment,
        );

        expect(
          identitySchemaAlignment.id,
        ).toBe(
          '006-identity-schema-alignment',
        );
      },
    );

    it(
      'provides a strict validator for every identity collection',
      () => {
        for (
          const collection of
          identitySchemaAlignmentCollections
        ) {
          expect(
            jsonSchema(collection),
          ).toHaveProperty(
            'bsonType',
            'object',
          );
        }
      },
    );

    it(
      'requires the canonical authentication counter only',
      () => {
        const users =
          jsonSchema('users');
        const required =
          users[
            'required'
          ] as string[];
        const properties =
          users[
            'properties'
          ] as Record<
            string,
            unknown
          >;

        expect(required).toContain(
          'failedLoginCount',
        );
        expect(required).not.toContain(
          'failedLoginAttempts',
        );
        expect(properties).toHaveProperty(
          'failedLoginCount',
        );
        expect(properties).not.toHaveProperty(
          'failedLoginAttempts',
        );
      },
    );

    it(
      'uses the Phase 4 access-control field names',
      () => {
        const permissions =
          jsonSchema('permissions');
        const userRoles =
          jsonSchema('userRoles');
        const rolePermissions =
          jsonSchema(
            'rolePermissions',
          );

        expect(
          permissions[
            'required'
          ],
        ).toEqual(
          expect.arrayContaining([
            'code',
            'name',
            'isActive',
          ]),
        );

        expect(
          userRoles[
            'required'
          ],
        ).toEqual(
          expect.arrayContaining([
            'isActive',
            'assignedBy',
          ]),
        );

        expect(
          rolePermissions[
            'required'
          ],
        ).toEqual(
          expect.arrayContaining([
            'permissionId',
            'grantedBy',
            'grantedAt',
          ]),
        );
      },
    );
  },
);