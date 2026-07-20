import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  collectionSpecs,
} from '../catalog/collection-specs.js';

import {
  inpatientFoundation,
  inpatientFoundationCollections,
  inpatientFoundationValidators,
} from '../migrations/020-inpatient-foundation.js';

import {
  migrations,
} from '../migrations/index.js';

import {
  inpatientSchemas,
  schemaForCollection,
} from '../models/registry.js';

describe(
  'inpatient migration and collection registration',
  () => {
    it(
      'catalogs every Batch 1 collection with the required scope and retention',
      () => {
        const immutableCollections =
          new Set([
            'bedRateVersions',
            'admissionStatusHistories',
            'bedStatusHistories',
          ]);

        for (
          const name of
          inpatientFoundationCollections
        ) {
          const spec =
            collectionSpecs.find(
              (candidate) =>
                candidate.name ===
                name,
            );

          expect(spec).toBeDefined();

          expect(
            spec?.facilityScoped,
          ).toBe(true);

          expect(
            spec?.domain,
          ).toBe(
            name ===
              'admissionRecommendations'
              ? 'clinical'
              : 'inpatient',
          );

          expect(
            spec?.retention,
          ).toBe(
            immutableCollections.has(
              name,
            )
              ? 'immutable'
              : 'standard',
          );
        }
      },
    );

    it(
      'registers concrete schemas instead of generic fallback schemas',
      () => {
        for (
          const name of
          inpatientFoundationCollections
        ) {
          expect(
            schemaForCollection(name),
          ).toBe(
            inpatientSchemas[name],
          );
        }
      },
    );

    it(
      'provides a strict MongoDB validator for every foundation collection',
      () => {
        expect(
          Object.keys(
            inpatientFoundationValidators,
          ).sort(),
        ).toEqual(
          [
            ...inpatientFoundationCollections,
          ].sort(),
        );

        for (
          const name of
          inpatientFoundationCollections
        ) {
          expect(
            inpatientFoundationValidators[
              name
            ],
          ).toHaveProperty(
            '$jsonSchema.bsonType',
            'object',
          );

          expect(
            inpatientFoundationValidators[
              name
            ],
          ).toHaveProperty(
            '$jsonSchema.properties.facilityId.bsonType',
            'objectId',
          );
        }
      },
    );

    it(
      'registers inpatient foundation after Radiology reporting',
      () => {
        expect(
          inpatientFoundation.id,
        ).toBe(
          '020-inpatient-foundation',
        );

        expect(
          migrations.at(-1),
        ).toBe(
          inpatientFoundation,
        );

        expect(
          migrations.map(
            (migration) =>
              migration.id,
          ),
        ).toEqual(
          expect.arrayContaining([
            '019-radiology-reporting',
            '020-inpatient-foundation',
          ]),
        );
      },
    );
  },
);