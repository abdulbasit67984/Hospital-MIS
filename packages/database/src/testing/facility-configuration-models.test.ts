import {
  describe,
  expect,
  it,
} from 'vitest';

import type {
  IndexDefinition,
} from 'mongoose';

import {
  DepartmentModel,
  FacilityModel,
  SettingDefinitionModel,
  SystemSettingModel,
  SystemSettingVersionModel,
  registerAllModels,
} from '../index.js';

type ModelIndexes =
  ReturnType<
    typeof FacilityModel.schema.indexes
  >;

function containsFields(
  definition:
    IndexDefinition,

  fields:
    readonly string[],
): boolean {
  const keys =
    Object.keys(
      definition,
    );

  return (
    keys.length ===
      fields.length &&
    fields.every(
      (
        field,
        index,
      ) =>
        keys[index] ===
        field,
    )
  );
}

function hasUniqueIndex(
  indexes:
    ModelIndexes,

  fields:
    readonly string[],
): boolean {
  return indexes.some(
    (
      [
        definition,
        options,
      ],
    ) =>
      options.unique ===
        true &&
      containsFields(
        definition,
        fields,
      ),
  );
}

describe(
  'facility and configuration persistence models',
  () => {
    it(
      'registers all explicit models in the shared database registry',
      () => {
        const models =
          registerAllModels();

        expect(
          models['facilities'],
        ).toBeDefined();

        expect(
          models['departments'],
        ).toBeDefined();

        expect(
          models[
            'settingDefinitions'
          ],
        ).toBeDefined();

        expect(
          models[
            'systemSettings'
          ],
        ).toBeDefined();

        expect(
          models[
            'systemSettingVersions'
          ],
        ).toBeDefined();
      },
    );

    it(
      'defines the required facility and department uniqueness boundaries',
      () => {
        expect(
          hasUniqueIndex(
            FacilityModel
              .schema
              .indexes(),
            [
              'code',
            ],
          ),
        ).toBe(true);

        expect(
          hasUniqueIndex(
            DepartmentModel
              .schema
              .indexes(),
            [
              'facilityId',
              'code',
            ],
          ),
        ).toBe(true);
      },
    );

    it(
      'defines the required configuration uniqueness boundaries',
      () => {
        expect(
          hasUniqueIndex(
            SettingDefinitionModel
              .schema
              .indexes(),
            [
              'key',
            ],
          ),
        ).toBe(true);

        expect(
          hasUniqueIndex(
            SystemSettingModel
              .schema
              .indexes(),
            [
              'scope',
              'facilityId',
              'key',
            ],
          ),
        ).toBe(true);

        expect(
          hasUniqueIndex(
            SystemSettingVersionModel
              .schema
              .indexes(),
            [
              'settingId',
              'revision',
            ],
          ),
        ).toBe(true);
      },
    );

    it(
      'requires operational regional and hierarchy fields',
      () => {
        expect(
          FacilityModel
            .schema
            .path(
              'timezone',
            )
            .isRequired,
        ).toBe(true);

        expect(
          FacilityModel
            .schema
            .path(
              'currency',
            )
            .isRequired,
        ).toBe(true);

        expect(
          FacilityModel
            .schema
            .path(
              'locale',
            )
            .isRequired,
        ).toBe(true);

        expect(
          DepartmentModel
            .schema
            .path(
              'facilityId',
            )
            .isRequired,
        ).toBe(true);

        expect(
          SettingDefinitionModel
            .schema
            .path(
              'dataType',
            )
            .isRequired,
        ).toBe(true);

        expect(
          SystemSettingModel
            .schema
            .path(
              'revision',
            )
            .isRequired,
        ).toBe(true);

        expect(
          SystemSettingVersionModel
            .schema
            .path(
              'changeReason',
            )
            .isRequired,
        ).toBe(true);
      },
    );

    it(
      'excludes protected setting material from ordinary Mongoose queries',
      () => {
        expect(
          SystemSettingModel
            .schema
            .path(
              'encryptedValue',
            )
            .options
            .select,
        ).toBe(false);

        expect(
          SystemSettingModel
            .schema
            .path(
              'valueHash',
            )
            .options
            .select,
        ).toBe(false);
      },
    );
  },
);