import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  permissionKeys,
} from '@hospital-mis/permissions';

import {
  openApiDocument,
} from '../../../infrastructure/openapi.js';

import {
  FACILITY_PERMISSION_KEYS,
} from '../facility.constants.js';

type OpenApiOperation =
  Record<string, unknown> & {
    parameters?:
      readonly Record<
        string,
        unknown
      >[];
  };

type OpenApiPath =
  Partial<
    Record<
      | 'get'
      | 'post'
      | 'put'
      | 'patch'
      | 'delete',
      OpenApiOperation
    >
  >;

function path(
  value:
    string,
): OpenApiPath {
  const paths =
    openApiDocument.paths as
      Record<
        string,
        OpenApiPath
      >;

  const item =
    paths[value];

  if (
    item ===
    undefined
  ) {
    throw new Error(
      `OpenAPI path ${value} is missing`,
    );
  }

  return item;
}

function hasIdempotencyHeader(
  operation:
    OpenApiOperation | undefined,
): boolean {
  return (
    operation
      ?.parameters
      ?.some(
        (
          parameter,
        ) =>
          parameter['name'] ===
            'Idempotency-Key' &&
          parameter['in'] ===
            'header' &&
          parameter['required'] ===
            true,
      ) ??
    false
  );
}

describe(
  'facility and configuration OpenAPI',
  () => {
    it(
      'publishes every facility, department, and configuration route',
      () => {
        const expectedPaths = [
          '/facilities',
          '/facilities/{facilityId}',
          '/facilities/{facilityId}/activate',
          '/facilities/{facilityId}/deactivate',
          '/facilities/{facilityId}/departments',
          '/facilities/{facilityId}/departments/{departmentId}',
          '/facilities/{facilityId}/departments/{departmentId}/activate',
          '/facilities/{facilityId}/departments/{departmentId}/deactivate',
          '/configuration/definitions',
          '/configuration/definitions/{key}',
          '/configuration/settings',
          '/configuration/settings/effective/{key}',
          '/configuration/settings/{key}',
          '/configuration/settings/{settingId}/history',
        ];

        const paths =
          openApiDocument.paths as
            Record<
              string,
              unknown
            >;

        for (
          const expectedPath of
          expectedPaths
        ) {
          expect(
            paths,
          ).toHaveProperty(
            expectedPath,
          );
        }
      },
    );

    it(
      'requires an idempotency header on every documented mutation',
      () => {
        const mutations:
          readonly [
            string,
            keyof OpenApiPath,
          ][] = [
          [
            '/facilities',
            'post',
          ],
          [
            '/facilities/{facilityId}',
            'patch',
          ],
          [
            '/facilities/{facilityId}/activate',
            'post',
          ],
          [
            '/facilities/{facilityId}/deactivate',
            'post',
          ],
          [
            '/facilities/{facilityId}/departments',
            'post',
          ],
          [
            '/facilities/{facilityId}/departments/{departmentId}',
            'patch',
          ],
          [
            '/facilities/{facilityId}/departments/{departmentId}/activate',
            'post',
          ],
          [
            '/facilities/{facilityId}/departments/{departmentId}/deactivate',
            'post',
          ],
          [
            '/configuration/definitions',
            'post',
          ],
          [
            '/configuration/definitions/{key}',
            'patch',
          ],
          [
            '/configuration/settings/{key}',
            'put',
          ],
        ];

        for (
          const [
            pathName,
            method,
          ] of
          mutations
        ) {
          expect(
            hasIdempotencyHeader(
              path(
                pathName,
              )[method],
            ),
            `${method.toLocaleUpperCase(
              'en-US',
            )} ${pathName}`,
          ).toBe(true);
        }
      },
    );

    it(
      'documents sensitive setting masking and effective precedence',
      () => {
        const schemas =
          openApiDocument
            .components
            .schemas as
              Record<
                string,
                unknown
              >;

        expect(
          schemas,
        ).toHaveProperty(
          'SystemSetting',
        );

        expect(
          schemas,
        ).toHaveProperty(
          'EffectiveSystemSetting',
        );

        const effectiveOperation =
          path(
            '/configuration/settings/effective/{key}',
          ).get;

        expect(
          effectiveOperation?.[
            'description'
          ],
        ).toContain(
          'facility value, global value, definition default',
        );

        const mutationOperation =
          path(
            '/configuration/settings/{key}',
          ).put;

        expect(
          mutationOperation?.[
            'description'
          ],
        ).toContain(
          'never returned as plaintext',
        );
      },
    );

    it(
      'uses permission keys that exist in the central permission catalog',
      () => {
        const catalog =
          new Set<string>(
            permissionKeys,
          );

        for (
          const permission of
          Object.values(
            FACILITY_PERMISSION_KEYS,
          )
        ) {
          expect(
            catalog.has(
              permission,
            ),
            permission,
          ).toBe(true);
        }

        expect(
          catalog.has(
            'facility.read',
          ),
        ).toBe(false);

        expect(
          catalog.has(
            'department.read',
          ),
        ).toBe(false);
      },
    );
  },
);