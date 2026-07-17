import {
  Types,
} from 'mongoose';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  SETTING_CATEGORY,
  SETTING_DATA_TYPE,
  SETTING_SCOPE,
} from '../facility.constants.js';
import {
  InvalidSettingValueError,
  UnsupportedSettingScopeError,
} from '../facility.errors.js';
import {
  assertSettingScopeAllowed,
  validateSettingValue,
} from '../facility.setting-value.js';
import type {
  SettingDefinitionRecord,
} from '../facility.types.js';

function definition(
  input:
    Partial<SettingDefinitionRecord> & {
      dataType:
        SettingDefinitionRecord['dataType'];
    },
): SettingDefinitionRecord {
  const now =
    new Date(
      '2026-07-17T00:00:00.000Z',
    );

  return {
    _id:
      new Types.ObjectId(),

    key:
      input.key ??
      'regional.example',

    category:
      input.category ??
      SETTING_CATEGORY.REGIONAL,

    dataType:
      input.dataType,

    allowedScopes:
      input.allowedScopes ??
      [
        SETTING_SCOPE.GLOBAL,
        SETTING_SCOPE.FACILITY,
      ],

    defaultValue:
      input.defaultValue ??
      null,

    labels:
      input.labels ??
      [
        {
          locale:
            'en-PK',

          label:
            'Example',

          description:
            null,
        },
      ],

    validation:
      input.validation ??
      {
        required:
          true,

        minLength:
          null,

        maxLength:
          null,

        pattern:
          null,

        minimum:
          null,

        maximum:
          null,

        allowedValues:
          [],

        jsonSchema:
          null,
      },

    isSensitive:
      input.isSensitive ??
      false,

    isMutable:
      input.isMutable ??
      true,

    isActive:
      input.isActive ??
      true,

    cacheTtlSeconds:
      input.cacheTtlSeconds ??
      300,

    schemaVersion:
      1,

    version:
      0,

    createdBy:
      null,

    updatedBy:
      null,

    createdAt:
      now,

    updatedAt:
      now,
  };
}

describe(
  'facility setting semantic validation',
  () => {
    it(
      'normalizes timezone, currency, locale, decimal, and datetime values',
      () => {
        expect(
          validateSettingValue(
            definition({
              dataType:
                SETTING_DATA_TYPE.TIMEZONE,
            }),
            'Asia/Karachi',
          ).normalizedValue,
        ).toBe(
          'Asia/Karachi',
        );

        expect(
          validateSettingValue(
            definition({
              dataType:
                SETTING_DATA_TYPE.CURRENCY,
            }),
            'pkr',
          ).normalizedValue,
        ).toBe(
          'PKR',
        );

        expect(
          validateSettingValue(
            definition({
              dataType:
                SETTING_DATA_TYPE.LOCALE,
            }),
            'en-pk',
          ).normalizedValue,
        ).toBe(
          'en-PK',
        );

        expect(
          validateSettingValue(
            definition({
              dataType:
                SETTING_DATA_TYPE.DECIMAL,
            }),
            '001.2300',
          ).normalizedValue,
        ).toBe(
          '1.23',
        );

        expect(
          validateSettingValue(
            definition({
              dataType:
                SETTING_DATA_TYPE.DATETIME,
            }),
            '2026-07-17T12:00:00+05:00',
          ).normalizedValue,
        ).toBe(
          '2026-07-17T07:00:00.000Z',
        );
      },
    );

    it(
      'enforces string, numeric, and enum validation rules',
      () => {
        const stringDefinition =
          definition({
            dataType:
              SETTING_DATA_TYPE.STRING,

            validation: {
              required:
                true,

              minLength:
                3,

              maxLength:
                5,

              pattern:
                '^[A-Z]+$',

              minimum:
                null,

              maximum:
                null,

              allowedValues:
                [],

              jsonSchema:
                null,
            },
          });

        expect(
          validateSettingValue(
            stringDefinition,
            'ABC',
          ).normalizedValue,
        ).toBe('ABC');

        expect(() =>
          validateSettingValue(
            stringDefinition,
            'ab',
          ),
        ).toThrow(
          InvalidSettingValueError,
        );

        const numberDefinition =
          definition({
            dataType:
              SETTING_DATA_TYPE.INTEGER,

            validation: {
              required:
                true,

              minLength:
                null,

              maxLength:
                null,

              pattern:
                null,

              minimum:
                '1',

              maximum:
                '10',

              allowedValues:
                [],

              jsonSchema:
                null,
            },
          });

        expect(() =>
          validateSettingValue(
            numberDefinition,
            11,
          ),
        ).toThrow(
          InvalidSettingValueError,
        );

        const enumDefinition =
          definition({
            dataType:
              SETTING_DATA_TYPE.ENUM,

            validation: {
              required:
                true,

              minLength:
                null,

              maxLength:
                null,

              pattern:
                null,

              minimum:
                null,

              maximum:
                null,

              allowedValues: [
                'OPTION_A',
                'OPTION_B',
              ],

              jsonSchema:
                null,
            },
          });

        expect(
          validateSettingValue(
            enumDefinition,
            'OPTION_A',
          ).normalizedValue,
        ).toBe(
          'OPTION_A',
        );

        expect(() =>
          validateSettingValue(
            enumDefinition,
            'OPTION_C',
          ),
        ).toThrow(
          InvalidSettingValueError,
        );
      },
    );

    it(
      'rejects unsupported setting scopes',
      () => {
        const facilityOnly =
          definition({
            dataType:
              SETTING_DATA_TYPE.STRING,

            allowedScopes: [
              SETTING_SCOPE.FACILITY,
            ],
          });

        expect(() =>
          assertSettingScopeAllowed(
            facilityOnly,
            SETTING_SCOPE.GLOBAL,
          ),
        ).toThrow(
          UnsupportedSettingScopeError,
        );
      },
    );

    it(
      'uses stable serialization for JSON values',
      () => {
        const jsonDefinition =
          definition({
            dataType:
              SETTING_DATA_TYPE.JSON,
          });

        const left =
          validateSettingValue(
            jsonDefinition,
            {
              b: 2,
              a: {
                d: 4,
                c: 3,
              },
            },
          );

        const right =
          validateSettingValue(
            jsonDefinition,
            {
              a: {
                c: 3,
                d: 4,
              },
              b: 2,
            },
          );

        expect(
          left.serializedValue,
        ).toBe(
          right.serializedValue,
        );
      },
    );
  },
);