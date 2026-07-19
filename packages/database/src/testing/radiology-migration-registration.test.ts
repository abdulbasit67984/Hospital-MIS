import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  collectionSpecs,
} from '../catalog/collection-specs.js';

import {
  radiologyCollections,
  radiologyFoundation,
  radiologyValidators,
} from '../migrations/017-radiology-foundation.js';

import {
  migrations,
} from '../migrations/index.js';

import {
  RadiologyOrderItemModel,
  RadiologyOrderItemStatusHistoryModel,
  RadiologyOrderStatusHistoryModel,
} from '../models/radiology-order.model.js';

import {
  radiologySchemas,
  schemaForCollection,
} from '../models/registry.js';

function indexNames(
  indexes: ReturnType<typeof RadiologyOrderItemModel.schema.indexes>,
): string[] {
  return indexes.flatMap(([, options]) =>
    typeof options.name === 'string'
      ? [options.name]
      : [],
  );
}

describe('radiology migration and collection registration', () => {
  it('catalogs every foundation collection with explicit retention', () => {
    const immutableCollections = new Set([
      'radiologyOrderStatusHistories',
      'radiologyOrderItemStatusHistories',
    ]);

    for (const name of radiologyCollections) {
      const spec = collectionSpecs.find(
        (candidate) => candidate.name === name,
      );

      expect(spec).toBeDefined();
      expect(spec?.domain).toBe('radiology');
      expect(spec?.facilityScoped).toBe(true);
      expect(spec?.retention).toBe(
        immutableCollections.has(name)
          ? 'immutable'
          : 'standard',
      );
    }
  });

  it('registers concrete schemas instead of generic fallback schemas', () => {
    for (const name of radiologyCollections) {
      expect(schemaForCollection(name)).toBe(radiologySchemas[name]);
    }
  });

  it('provides a strict MongoDB validator for every foundation collection', () => {
    expect(Object.keys(radiologyValidators).sort()).toEqual(
      [...radiologyCollections].sort(),
    );

    for (const name of radiologyCollections) {
      expect(radiologyValidators[name]).toHaveProperty(
        '$jsonSchema.bsonType',
        'object',
      );
      expect(radiologyValidators[name]).toHaveProperty(
        '$jsonSchema.properties.facilityId.bsonType',
        'objectId',
      );
    }
  });

  it('registers the Radiology migration after Laboratory', () => {
    expect(radiologyFoundation.id).toBe('017-radiology-foundation');
    expect(migrations.at(-1)).toBe(radiologyFoundation);
    expect(migrations.map((migration) => migration.id)).toEqual(
      expect.arrayContaining([
        '016-laboratory-foundation',
        '017-radiology-foundation',
      ]),
    );
  });

  it('retains facility-safe accession and immutable lifecycle indexes', () => {
    expect(indexNames(RadiologyOrderItemModel.schema.indexes())).toContain(
      'uq_radiology_order_items_facility_accession',
    );
    expect(
      indexNames(RadiologyOrderStatusHistoryModel.schema.indexes()),
    ).toContain('uq_radiology_order_status_histories_sequence');
    expect(
      indexNames(RadiologyOrderItemStatusHistoryModel.schema.indexes()),
    ).toContain('uq_radiology_order_item_status_histories_sequence');
  });
});