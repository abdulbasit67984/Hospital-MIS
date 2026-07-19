import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  collectionSpecs,
} from '../catalog/collection-specs.js';

import {
  laboratoryCollections,
  laboratoryFoundation,
  laboratoryValidators,
} from '../migrations/016-laboratory-foundation.js';

import {
  migrations,
} from '../migrations/index.js';

import {
  LabCriticalResultCommunicationModel,
} from '../models/laboratory-critical-result-communication.model.js';

import {
  LabOrderModel,
} from '../models/laboratory-order.model.js';

import {
  LabResultVersionModel,
} from '../models/laboratory-result.model.js';

import {
  LabSpecimenModel,
} from '../models/laboratory-specimen.model.js';

import {
  laboratorySchemas,
  schemaForCollection,
} from '../models/registry.js';

function indexNames(
  indexes: ReturnType<typeof LabOrderModel.schema.indexes>,
): string[] {
  return indexes.flatMap(([, options]) =>
    typeof options.name === 'string'
      ? [options.name]
      : [],
  );
}

describe('laboratory migration and collection registration', () => {
  it('catalogs every Laboratory collection with explicit retention', () => {
    const immutableCollections = new Set([
      'labOrderStatusHistories',
      'labSpecimenStatusHistories',
      'labResultVersions',
      'labCriticalResultCommunications',
    ]);

    for (const name of laboratoryCollections) {
      const spec =
        collectionSpecs.find(
          (candidate) => candidate.name === name,
        );

      expect(spec).toBeDefined();
      expect(spec?.domain).toBe('laboratory');
      expect(spec?.facilityScoped).toBe(true);
      expect(spec?.retention).toBe(
        immutableCollections.has(name)
          ? 'immutable'
          : 'standard',
      );
    }
  });

  it('registers concrete schemas instead of generic fallback schemas', () => {
    for (const name of laboratoryCollections) {
      expect(schemaForCollection(name)).toBe(
        laboratorySchemas[name],
      );
    }
  });

  it('provides a strict MongoDB validator for every Laboratory collection', () => {
    expect(Object.keys(laboratoryValidators).sort()).toEqual(
      [...laboratoryCollections].sort(),
    );

    for (const name of laboratoryCollections) {
      expect(laboratoryValidators[name]).toHaveProperty(
        '$jsonSchema.bsonType',
        'object',
      );

      expect(laboratoryValidators[name]).toHaveProperty(
        '$jsonSchema.properties.facilityId.bsonType',
        'objectId',
      );
    }
  });

  it('registers the Laboratory migration after the formulary migration', () => {
    expect(laboratoryFoundation.id).toBe(
      '016-laboratory-foundation',
    );

    expect(migrations.at(-1)).toBe(laboratoryFoundation);
    expect(
      migrations.map((migration) => migration.id),
    ).toEqual(
      expect.arrayContaining([
        '015-formulary-prescriptions-foundation',
        '016-laboratory-foundation',
      ]),
    );
  });

  it('retains facility-safe accession, result-version, and critical communication indexes', () => {
    expect(indexNames(LabSpecimenModel.schema.indexes())).toEqual(
      expect.arrayContaining([
        'uq_lab_specimens_facility_accession',
        'uq_lab_specimens_facility_identifier',
        'uq_lab_specimens_facility_label_code',
      ]),
    );

    expect(indexNames(LabResultVersionModel.schema.indexes())).toContain(
      'uq_lab_result_versions_result_version',
    );

    expect(
      indexNames(
        LabCriticalResultCommunicationModel.schema.indexes(),
      ),
    ).toContain(
      'uq_lab_critical_communications_sequence',
    );
  });
});