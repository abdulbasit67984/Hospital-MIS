import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  DepartmentModel,
  FacilityModel,
  SettingDefinitionModel,
  SystemSettingModel,
  SystemSettingVersionModel,
  collectionSpecs,
  createObjectId,
  facilityConfigurationSchemas,
  schemaForCollection,
} from '../index.js';
import {
  facilityConfigurationCollections,
  facilityConfigurationFoundation,
  facilityConfigurationValidators,
} from '../migrations/008-facility-configuration-foundation.js';
import {
  migrations,
} from '../migrations/index.js';

function indexNames(
  indexes: ReturnType<typeof FacilityModel.schema.indexes>,
): string[] {
  return indexes
    .map(
      (
        [
          ,
          options,
        ],
      ) =>
        options.name,
    )
    .filter(
      (
        name,
      ): name is string =>
        typeof name ===
        'string',
    );
}

function jsonSchema(
  collection:
    (typeof facilityConfigurationCollections)[number],
): Record<string, unknown> {
  return facilityConfigurationValidators[
    collection
  ][
    '$jsonSchema'
  ] as Record<
    string,
    unknown
  >;
}

describe(
  'Phase 4 facility configuration persistence foundation',
  () => {
    it(
      'registers every dedicated schema in the central registry',
      () => {
        expect(
          facilityConfigurationSchemas.facilities,
        ).toBe(
          FacilityModel.schema,
        );

        expect(
          facilityConfigurationSchemas.departments,
        ).toBe(
          DepartmentModel.schema,
        );

        expect(
          facilityConfigurationSchemas.settingDefinitions,
        ).toBe(
          SettingDefinitionModel.schema,
        );

        expect(
          facilityConfigurationSchemas.systemSettings,
        ).toBe(
          SystemSettingModel.schema,
        );

        expect(
          facilityConfigurationSchemas.systemSettingVersions,
        ).toBe(
          SystemSettingVersionModel.schema,
        );

        for (
          const collection of
          facilityConfigurationCollections
        ) {
          expect(
            schemaForCollection(
              collection,
            ),
          ).toBe(
            facilityConfigurationSchemas[
              collection
            ],
          );
        }
      },
    );

    it(
      'uses global catalog scope for facilities and dual-scope settings',
      () => {
        const byName =
          new Map(
            collectionSpecs.map(
              (
                specification,
              ) => [
                specification.name,
                specification,
              ],
            ),
          );

        expect(
          byName.get(
            'facilities',
          )?.facilityScoped,
        ).toBe(
          false,
        );

        expect(
          byName.get(
            'departments',
          )?.facilityScoped,
        ).toBe(
          true,
        );

        expect(
          byName.get(
            'settingDefinitions',
          )?.facilityScoped,
        ).toBe(
          false,
        );

        expect(
          byName.get(
            'systemSettings',
          )?.facilityScoped,
        ).toBe(
          false,
        );

        expect(
          byName.get(
            'systemSettingVersions',
          )?.retention,
        ).toBe(
          'immutable',
        );
      },
    );

    it(
      'defines required uniqueness and query indexes',
      () => {
        expect(
          indexNames(
            FacilityModel.schema.indexes(),
          ),
        ).toContain(
          'uq_facilities_code',
        );

        expect(
          indexNames(
            DepartmentModel.schema.indexes(),
          ),
        ).toContain(
          'uq_departments_facility_code',
        );

        expect(
          indexNames(
            SettingDefinitionModel.schema.indexes(),
          ),
        ).toContain(
          'uq_setting_definitions_key',
        );

        expect(
          indexNames(
            SystemSettingModel.schema.indexes(),
          ),
        ).toContain(
          'uq_system_settings_scope_facility_key',
        );

        expect(
          indexNames(
            SystemSettingVersionModel.schema.indexes(),
          ),
        ).toContain(
          'uq_system_setting_versions_setting_revision',
        );
      },
    );

    it(
      'excludes encrypted setting material from ordinary reads',
      () => {
        expect(
          SystemSettingModel.schema
            .path(
              'encryptedValue',
            )
            .options
            .select,
        ).toBe(
          false,
        );

        expect(
          SystemSettingModel.schema
            .path(
              'valueHash',
            )
            .options
            .select,
        ).toBe(
          false,
        );

        expect(
          SystemSettingVersionModel.schema
            .path(
              'value',
            )
            .options
            .select,
        ).toBe(
          false,
        );

        expect(
          SystemSettingVersionModel.schema
            .path(
              'encryptedValue',
            )
            .options
            .select,
        ).toBe(
          false,
        );
      },
    );

    it(
      'rejects invalid scope and plaintext sensitive-setting records',
      async () => {
        const invalidGlobal =
          new SystemSettingModel({
            definitionId:
              createObjectId(),

            key:
              'regional.timezone',

            scope:
              'GLOBAL',

            facilityId:
              createObjectId(),

            value:
              'Asia/Karachi',

            encryptedValue:
              null,

            valueHash:
              null,

            isSensitive:
              false,

            revision:
              1,

            isActive:
              true,
          });

        await expect(
          invalidGlobal.validate(),
        ).rejects.toMatchObject({
          errors: {
            facilityId:
              expect.anything(),
          },
        });

        const invalidSensitive =
          new SystemSettingModel({
            definitionId:
              createObjectId(),

            key:
              'integrations.gateway_secret',

            scope:
              'FACILITY',

            facilityId:
              createObjectId(),

            value:
              'plaintext-secret',

            encryptedValue:
              null,

            valueHash:
              null,

            isSensitive:
              true,

            revision:
              1,

            isActive:
              true,
          });

        await expect(
          invalidSensitive.validate(),
        ).rejects.toMatchObject({
          errors: {
            value:
              expect.anything(),

            encryptedValue:
              expect.anything(),
          },
        });
      },
    );

    it(
      'registers migration 008 with a validator for every collection',
      () => {
        expect(
          migrations.at(
            -1,
          ),
        ).toBe(
          facilityConfigurationFoundation,
        );

        expect(
          facilityConfigurationFoundation.id,
        ).toBe(
          '008-facility-configuration-foundation',
        );

        for (
          const collection of
          facilityConfigurationCollections
        ) {
          expect(
            jsonSchema(
              collection,
            ),
          ).toHaveProperty(
            'bsonType',
            'object',
          );
        }
      },
    );

    it(
      'requires typed settings and append-only history metadata',
      () => {
        expect(
          jsonSchema(
            'systemSettings',
          )[
            'required'
          ],
        ).toEqual(
          expect.arrayContaining([
            'definitionId',
            'key',
            'scope',
            'facilityId',
            'revision',
            'isSensitive',
          ]),
        );

        expect(
          jsonSchema(
            'systemSettingVersions',
          )[
            'required'
          ],
        ).toEqual(
          expect.arrayContaining([
            'settingId',
            'revision',
            'changeType',
            'changeSource',
            'changeReason',
            'changedAt',
          ]),
        );
      },
    );
  },
);