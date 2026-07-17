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
  PATIENT_PERMISSION_KEYS,
} from '../patient.constants.js';

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

function hasHeader(
  operation:
    OpenApiOperation | undefined,

  name:
    string,

  required?:
    boolean,
): boolean {
  return (
    operation
      ?.parameters
      ?.some(
        (
          parameter,
        ) =>
          parameter['name'] ===
            name &&
          parameter['in'] ===
            'header' &&
          (
            required ===
            undefined ||
            parameter['required'] ===
              required
          ),
      ) ??
    false
  );
}

describe(
  'patient and guardian OpenAPI',
  () => {
    it(
      'publishes the complete patient and guardian HTTP surface',
      () => {
        const expectedPaths = [
          '/patients',
          '/patients/search',
          '/patients/duplicate-check',
          '/patients/{patientId}',
          '/patients/{patientId}/canonical',
          '/patients/{patientId}/registration-slip',
          '/patients/{patientId}/identifiers',
          '/patients/identifiers/{identifierId}/verify',
          '/patients/identifiers/{identifierId}/revoke',
          '/patients/{patientId}/guardians',
          '/patients/guardian-relationships/{relationshipId}/verify',
          '/patients/guardian-relationships/{relationshipId}/end',
          '/patients/{patientId}/contacts',
          '/patients/contacts/{contactId}',
          '/patients/contacts/{contactId}/verify',
          '/patients/contacts/{contactId}/deactivate',
          '/patients/{patientId}/addresses',
          '/patients/addresses/{addressId}',
          '/patients/addresses/{addressId}/deactivate',
          '/patients/{patientId}/alerts',
          '/patients/alerts/{alertId}/resolve',
          '/patients/{patientId}/duplicate-review',
          '/patients/{patientId}/merge',
          '/patients/merges/{mergeId}',
          '/guardians',
          '/guardians/{guardianId}',
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
      'requires idempotency keys on every documented patient mutation',
      () => {
        const mutations:
          readonly [
            string,
            keyof OpenApiPath,
          ][] = [
          [
            '/patients',
            'post',
          ],
          [
            '/patients/{patientId}',
            'patch',
          ],
          [
            '/patients/{patientId}/identifiers',
            'post',
          ],
          [
            '/patients/identifiers/{identifierId}/verify',
            'post',
          ],
          [
            '/patients/identifiers/{identifierId}/revoke',
            'post',
          ],
          [
            '/patients/{patientId}/guardians',
            'post',
          ],
          [
            '/patients/guardian-relationships/{relationshipId}/verify',
            'post',
          ],
          [
            '/patients/guardian-relationships/{relationshipId}/end',
            'post',
          ],
          [
            '/patients/{patientId}/contacts',
            'post',
          ],
          [
            '/patients/contacts/{contactId}',
            'patch',
          ],
          [
            '/patients/contacts/{contactId}/verify',
            'post',
          ],
          [
            '/patients/contacts/{contactId}/deactivate',
            'post',
          ],
          [
            '/patients/{patientId}/addresses',
            'post',
          ],
          [
            '/patients/addresses/{addressId}',
            'patch',
          ],
          [
            '/patients/addresses/{addressId}/deactivate',
            'post',
          ],
          [
            '/patients/{patientId}/alerts',
            'post',
          ],
          [
            '/patients/alerts/{alertId}/resolve',
            'post',
          ],
          [
            '/patients/{patientId}/duplicate-review',
            'post',
          ],
          [
            '/patients/{patientId}/merge',
            'post',
          ],
          [
            '/guardians/{guardianId}',
            'patch',
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
            hasHeader(
              path(
                pathName,
              )[method],
              'Idempotency-Key',
              true,
            ),
            `${method.toLocaleUpperCase(
              'en-US',
            )} ${pathName}`,
          ).toBe(true);
        }
      },
    );

    it(
      'documents explicit standard versus sensitive patient reads',
      () => {
        const sensitiveReads:
          readonly [
            string,
            keyof OpenApiPath,
          ][] = [
          [
            '/patients/search',
            'get',
          ],
          [
            '/patients/{patientId}',
            'get',
          ],
          [
            '/guardians',
            'get',
          ],
          [
            '/guardians/{guardianId}',
            'get',
          ],
        ];

        for (
          const [
            pathName,
            method,
          ] of
          sensitiveReads
        ) {
          expect(
            hasHeader(
              path(
                pathName,
              )[method],
              'X-Patient-Access-Level',
              false,
            ),
            `${method.toLocaleUpperCase(
              'en-US',
            )} ${pathName}`,
          ).toBe(true);
        }
      },
    );

    it(
      'documents minor registration, permanent MRN behavior, canonical redirects, and immutable merge audit history',
      () => {
        expect(
          path(
            '/patients',
          ).post?.[
            'description'
          ],
        ).toContain(
          'permanent concurrency-safe MRN',
        );

        expect(
          path(
            '/patients',
          ).post?.[
            'description'
          ],
        ).toContain(
          'guardian CNIC',
        );

        expect(
          path(
            '/patients/{patientId}',
          ).get?.[
            'description'
          ],
        ).toContain(
          'canonical patient profile',
        );

        expect(
          path(
            '/patients/merges/{mergeId}',
          ).get?.[
            'description'
          ],
        ).toContain(
          'version transitions',
        );

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
          'RegisterPatientRequest',
        );

        expect(
          schemas,
        ).toHaveProperty(
          'PatientRegistrationSlip',
        );

        expect(
          schemas,
        ).toHaveProperty(
          'MergePatientsRequest',
        );

        expect(
          schemas,
        ).toHaveProperty(
          'PatientMergeRecord',
        );
      },
    );

    it(
      'uses only centralized patient and guardian permission keys',
      () => {
        const catalog =
          new Set<string>(
            permissionKeys,
          );

        for (
          const permission of
          Object.values(
            PATIENT_PERMISSION_KEYS,
          )
        ) {
          expect(
            catalog.has(
              String(
                permission,
              ),
            ),
            String(
              permission,
            ),
          ).toBe(true);
        }
      },
    );
  },
);