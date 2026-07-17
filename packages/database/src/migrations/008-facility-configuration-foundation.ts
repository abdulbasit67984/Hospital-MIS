import type {
  Db,
  Document,
  IndexDescription,
} from 'mongodb';
import {
  ObjectId,
} from 'mongodb';

import {
  departmentSchema,
  departmentStatusValues,
  departmentTypeValues,
} from '../models/department.model.js';
import {
  facilitySchema,
  facilityStatusValues,
  facilityTypeValues,
} from '../models/facility.model.js';
import {
  settingCategoryValues,
  settingDataTypeValues,
  settingDefinitionSchema,
  settingScopeValues,
} from '../models/setting-definition.model.js';
import {
  encryptedSettingAlgorithmValues,
  systemSettingSchema,
} from '../models/system-setting.model.js';
import {
  settingChangeSourceValues,
  settingChangeTypeValues,
  systemSettingVersionSchema,
} from '../models/system-setting-version.model.js';
import type {
  Migration,
} from './types.js';

export const facilityConfigurationCollections = [
  'facilities',
  'departments',
  'settingDefinitions',
  'systemSettings',
  'systemSettingVersions',
] as const;

type FacilityConfigurationCollection =
  (typeof facilityConfigurationCollections)[number];

type SettingScope = (typeof settingScopeValues)[number];

const objectId = { bsonType: 'objectId' } as const;

const nullableObjectId = {
  bsonType: ['objectId', 'null'],
} as const;

const date = { bsonType: 'date' } as const;

const nullableDate = {
  bsonType: ['date', 'null'],
} as const;

const string = { bsonType: 'string' } as const;

const nullableString = {
  bsonType: ['string', 'null'],
} as const;

const boolean = { bsonType: 'bool' } as const;

const number = { bsonType: 'number' } as const;

const mutableProperties = {
  _id: objectId,
  schemaVersion: {
    ...number,
    minimum: 1,
  },
  version: {
    ...number,
    minimum: 0,
  },
  createdBy: nullableObjectId,
  updatedBy: nullableObjectId,
  createdAt: date,
  updatedAt: date,
};

const encryptedValue = {
  bsonType: ['object', 'null'],
  properties: {
    algorithm: {
      bsonType: 'string',
      enum: [...encryptedSettingAlgorithmValues],
    },
    keyVersion: string,
    initializationVector: string,
    authenticationTag: string,
    ciphertext: string,
  },
} as const;

function typedValidator(
  required: readonly string[],
  properties: Record<string, unknown>,
  allOf: readonly Record<string, unknown>[] = [],
): Record<string, unknown> {
  return {
    $jsonSchema: {
      bsonType: 'object',
      required: [...required],
      properties,
      ...(allOf.length > 0
        ? {
            allOf,
          }
        : {}),
      additionalProperties: true,
    },
  };
}

const scopeRule = {
  oneOf: [
    {
      properties: {
        scope: {
          enum: ['GLOBAL'],
        },
        facilityId: {
          bsonType: 'null',
        },
      },
    },
    {
      properties: {
        scope: {
          enum: ['FACILITY'],
        },
        facilityId: objectId,
      },
    },
  ],
};

const sensitiveValueRule = {
  oneOf: [
    {
      properties: {
        isSensitive: {
          enum: [false],
        },
        encryptedValue: {
          bsonType: 'null',
        },
      },
    },
    {
      properties: {
        isSensitive: {
          enum: [true],
        },
        value: {
          bsonType: 'null',
        },
        encryptedValue: {
          bsonType: 'object',
        },
      },
    },
  ],
};

export const facilityConfigurationValidators: Record<
  FacilityConfigurationCollection,
  Record<string, unknown>
> = {
  facilities: typedValidator(
    [
      'code',
      'name',
      'facilityType',
      'identifiers',
      'timezone',
      'currency',
      'locale',
      'supportedLocales',
      'address',
      'contact',
      'status',
      'allowsAuthentication',
      'schemaVersion',
      'version',
      'createdAt',
      'updatedAt',
    ],
    {
      ...mutableProperties,
      code: string,
      name: string,
      legalName: nullableString,
      facilityType: {
        bsonType: 'string',
        enum: [...facilityTypeValues],
      },
      parentFacilityId: nullableObjectId,
      identifiers: {
        bsonType: 'array',
      },
      timezone: string,
      currency: string,
      locale: string,
      supportedLocales: {
        bsonType: 'array',
        minItems: 1,
        items: string,
      },
      address: {
        bsonType: 'object',
      },
      contact: {
        bsonType: 'object',
      },
      status: {
        bsonType: 'string',
        enum: [...facilityStatusValues],
      },
      allowsAuthentication: boolean,
      deactivatedAt: nullableDate,
      deactivatedBy: nullableObjectId,
      deactivationReason: nullableString,
    },
  ),

  departments: typedValidator(
    [
      'facilityId',
      'code',
      'name',
      'departmentType',
      'isClinical',
      'contact',
      'status',
      'schemaVersion',
      'version',
      'createdAt',
      'updatedAt',
    ],
    {
      ...mutableProperties,
      facilityId: objectId,
      parentDepartmentId: nullableObjectId,
      managerStaffId: nullableObjectId,
      code: string,
      name: string,
      description: nullableString,
      departmentType: {
        bsonType: 'string',
        enum: [...departmentTypeValues],
      },
      isClinical: boolean,
      location: nullableString,
      costCenterCode: nullableString,
      contact: {
        bsonType: 'object',
      },
      status: {
        bsonType: 'string',
        enum: [...departmentStatusValues],
      },
      deactivatedAt: nullableDate,
      deactivatedBy: nullableObjectId,
      deactivationReason: nullableString,
    },
  ),

  settingDefinitions: typedValidator(
    [
      'key',
      'category',
      'dataType',
      'allowedScopes',
      'labels',
      'validation',
      'isSensitive',
      'isMutable',
      'isActive',
      'cacheTtlSeconds',
      'schemaVersion',
      'version',
      'createdAt',
      'updatedAt',
    ],
    {
      ...mutableProperties,
      key: string,
      category: {
        bsonType: 'string',
        enum: [...settingCategoryValues],
      },
      dataType: {
        bsonType: 'string',
        enum: [...settingDataTypeValues],
      },
      allowedScopes: {
        bsonType: 'array',
        minItems: 1,
        items: {
          bsonType: 'string',
          enum: [...settingScopeValues],
        },
      },
      defaultValue: {},
      labels: {
        bsonType: 'array',
        minItems: 1,
      },
      validation: {
        bsonType: 'object',
      },
      isSensitive: boolean,
      isMutable: boolean,
      isActive: boolean,
      cacheTtlSeconds: {
        ...number,
        minimum: 0,
        maximum: 86_400,
      },
    },
  ),

  systemSettings: typedValidator(
    [
      'definitionId',
      'key',
      'scope',
      'facilityId',
      'value',
      'encryptedValue',
      'valueHash',
      'isSensitive',
      'revision',
      'isActive',
      'schemaVersion',
      'version',
      'createdAt',
      'updatedAt',
    ],
    {
      ...mutableProperties,
      definitionId: objectId,
      key: string,
      scope: {
        bsonType: 'string',
        enum: [...settingScopeValues],
      },
      facilityId: nullableObjectId,
      value: {},
      encryptedValue,
      valueHash: nullableString,
      isSensitive: boolean,
      revision: {
        ...number,
        minimum: 1,
      },
      isActive: boolean,
    },
    [
      scopeRule,
      sensitiveValueRule,
    ],
  ),

  systemSettingVersions: typedValidator(
    [
      'settingId',
      'definitionId',
      'key',
      'scope',
      'facilityId',
      'revision',
      'changeType',
      'changeSource',
      'value',
      'encryptedValue',
      'valueHash',
      'isSensitive',
      'isActive',
      'changedBy',
      'changeReason',
      'correlationId',
      'changedAt',
      'schemaVersion',
      'createdAt',
    ],
    {
      _id: objectId,
      settingId: objectId,
      definitionId: objectId,
      key: string,
      scope: {
        bsonType: 'string',
        enum: [...settingScopeValues],
      },
      facilityId: nullableObjectId,
      revision: {
        ...number,
        minimum: 1,
      },
      changeType: {
        bsonType: 'string',
        enum: [...settingChangeTypeValues],
      },
      changeSource: {
        bsonType: 'string',
        enum: [...settingChangeSourceValues],
      },
      value: {},
      encryptedValue,
      valueHash: nullableString,
      isSensitive: boolean,
      isActive: boolean,
      changedBy: nullableObjectId,
      changeReason: string,
      correlationId: nullableString,
      changedAt: date,
      schemaVersion: {
        ...number,
        minimum: 1,
      },
      createdAt: date,
    },
    [
      scopeRule,
      sensitiveValueRule,
    ],
  ),
};

const schemaIndexes = {
  facilities: facilitySchema.indexes(),
  departments: departmentSchema.indexes(),
  settingDefinitions: settingDefinitionSchema.indexes(),
  systemSettings: systemSettingSchema.indexes(),
  systemSettingVersions: systemSettingVersionSchema.indexes(),
};

function record(
  value: unknown,
): Record<string, unknown> {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function legacy(
  document: Document,
  key: string,
): unknown {
  return document[key] !== undefined
    ? document[key]
    : record(document['data'])[key];
}

function text(
  value: unknown,
): string | null {
  return typeof value === 'string' &&
    value.trim().length > 0
    ? value.trim()
    : null;
}

function bool(
  value: unknown,
  fallback: boolean,
): boolean {
  return typeof value === 'boolean'
    ? value
    : fallback;
}

function numeric(
  value: unknown,
  fallback: number,
): number {
  return typeof value === 'number' &&
    Number.isFinite(value)
    ? value
    : fallback;
}

function validDate(
  value: unknown,
  fallback: Date,
): Date {
  return value instanceof Date &&
    !Number.isNaN(value.getTime())
    ? value
    : fallback;
}

function objectIdOrNull(
  value: unknown,
): ObjectId | null {
  return value instanceof ObjectId
    ? value
    : null;
}

function code(
  value: unknown,
  fallback: string,
): string {
  const normalized = (
    text(value) ??
    fallback
  )
    .normalize('NFKC')
    .toUpperCase()
    .replace(
      /[^A-Z0-9_-]+/gu,
      '_',
    )
    .replace(
      /^[_-]+|[_-]+$/gu,
      '',
    );

  return (
    /^[A-Z]/u.test(normalized)
      ? normalized
      : `X_${normalized}`
  ).slice(
    0,
    40,
  );
}

function settingKey(
  value: unknown,
  fallback: string,
): string {
  const normalized = (
    text(value) ??
    fallback
  )
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(
      /[^a-z0-9_.]+/gu,
      '_',
    )
    .replace(
      /^[^a-z]+/u,
      '',
    )
    .replace(
      /\.+/gu,
      '.',
    )
    .replace(
      /^\.|\.$/gu,
      '',
    );

  if (
    /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/u.test(
      normalized,
    )
  ) {
    return normalized.slice(
      0,
      160,
    );
  }

  const suffix = (
    normalized ||
    fallback.toLocaleLowerCase(
      'en-US',
    )
  )
    .replace(
      /[^a-z0-9_]+/gu,
      '_',
    )
    .replace(
      /^_+|_+$/gu,
      '',
    );

  return `legacy.${suffix || 'setting'}`.slice(
    0,
    160,
  );
}

function countryCode(
  value: unknown,
): string {
  const normalized = (
    text(value) ??
    'PK'
  )
    .toUpperCase()
    .replace(
      /[^A-Z]/gu,
      '',
    )
    .slice(
      0,
      2,
    );

  return normalized.length === 2
    ? normalized
    : 'PK';
}

function currency(
  value: unknown,
): string {
  const normalized = (
    text(value) ??
    'PKR'
  )
    .toUpperCase()
    .replace(
      /[^A-Z]/gu,
      '',
    )
    .slice(
      0,
      3,
    );

  return normalized.length === 3
    ? normalized
    : 'PKR';
}

function localeList(
  value: unknown,
  primary: string,
): string[] {
  const entries = Array.isArray(value)
    ? value
        .map(
          (item) =>
            text(item),
        )
        .filter(
          (
            item,
          ): item is string =>
            item !== null,
        )
    : [];

  return [
    ...new Set([
      primary,
      ...entries,
    ]),
  ];
}

function identifiers(
  value: unknown,
): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(
    (item) => {
      const source =
        record(item);

      const type =
        text(
          source['type'],
        );

      const identifierValue =
        text(
          source['value'],
        );

      if (
        type === null ||
        identifierValue === null
      ) {
        return [];
      }

      return [
        {
          type:
            code(
              type,
              'OTHER',
            ).slice(
              0,
              60,
            ),

          value:
            identifierValue.slice(
              0,
              160,
            ),

          normalizedValue:
            text(
              source[
                'normalizedValue'
              ],
            )?.toLocaleLowerCase(
              'en-US',
            ) ??
            identifierValue
              .normalize(
                'NFKC',
              )
              .toLocaleLowerCase(
                'en-US',
              ),

          issuingAuthority:
            text(
              source[
                'issuingAuthority'
              ],
            ),

          isPrimary:
            bool(
              source[
                'isPrimary'
              ],
              false,
            ),
        },
      ];
    },
  );
}

function facilityAddress(
  value: unknown,
): Record<string, unknown> {
  const source =
    record(value);

  return {
    line1:
      text(
        source['line1'],
      ),

    line2:
      text(
        source['line2'],
      ),

    city:
      text(
        source['city'],
      ),

    district:
      text(
        source['district'],
      ),

    province:
      text(
        source['province'],
      ),

    postalCode:
      text(
        source['postalCode'],
      ),

    countryCode:
      countryCode(
        source[
          'countryCode'
        ],
      ),
  };
}

function facilityContact(
  value: unknown,
): Record<string, unknown> {
  const source =
    record(value);

  return {
    primaryPhone:
      text(
        source[
          'primaryPhone'
        ],
      ),

    secondaryPhone:
      text(
        source[
          'secondaryPhone'
        ],
      ),

    email:
      text(
        source['email'],
      )?.toLocaleLowerCase(
        'en-US',
      ) ??
      null,

    website:
      text(
        source['website'],
      ),

    emergencyPhone:
      text(
        source[
          'emergencyPhone'
        ],
      ),
  };
}

function departmentContact(
  value: unknown,
): Record<string, unknown> {
  const source =
    record(value);

  return {
    phone:
      text(
        source['phone'],
      ),

    extension:
      text(
        source['extension'],
      ),

    email:
      text(
        source['email'],
      )?.toLocaleLowerCase(
        'en-US',
      ) ??
      null,
  };
}

function encrypted(
  value: unknown,
): Record<string, unknown> | null {
  const source =
    record(value);

  const keyVersion =
    text(
      source['keyVersion'],
    );

  const initializationVector =
    text(
      source[
        'initializationVector'
      ],
    );

  const authenticationTag =
    text(
      source[
        'authenticationTag'
      ],
    );

  const ciphertext =
    text(
      source['ciphertext'],
    );

  if (
    keyVersion === null ||
    initializationVector === null ||
    authenticationTag === null ||
    ciphertext === null
  ) {
    return null;
  }

  return {
    algorithm:
      'AES-256-GCM',

    keyVersion,

    initializationVector,

    authenticationTag,

    ciphertext,
  };
}

function inferredDataType(
  value: unknown,
): (typeof settingDataTypeValues)[number] {
  if (
    typeof value === 'boolean'
  ) {
    return 'BOOLEAN';
  }

  if (
    typeof value === 'number'
  ) {
    return Number.isInteger(
      value,
    )
      ? 'INTEGER'
      : 'NUMBER';
  }

  if (
    value instanceof Date
  ) {
    return 'DATETIME';
  }

  if (
    typeof value === 'object' &&
    value !== null
  ) {
    return 'JSON';
  }

  return 'STRING';
}

function titleFor(
  key: string,
): string {
  return key
    .split(
      /[._-]+/u,
    )
    .filter(
      Boolean,
    )
    .map(
      (part) =>
        part
          .charAt(0)
          .toUpperCase() +
        part
          .slice(1)
          .toLocaleLowerCase(
            'en-US',
          ),
    )
    .join(
      ' ',
    );
}

async function ensureCollections(
  database: Db,
): Promise<void> {
  const existing =
    new Set(
      (
        await database
          .listCollections(
            {},
            {
              nameOnly:
                true,
            },
          )
          .toArray()
      ).map(
        (collection) =>
          collection.name,
      ),
    );

  for (
    const name of
    facilityConfigurationCollections
  ) {
    if (
      !existing.has(
        name,
      )
    ) {
      await database
        .createCollection(
          name,
        );
    }
  }
}

async function prepareCollections(
  database: Db,
): Promise<void> {
  for (
    const name of
    facilityConfigurationCollections
  ) {
    await database.command({
      collMod:
        name,

      validator:
        {},

      validationLevel:
        'moderate',

      validationAction:
        'warn',
    });

    const indexes =
      await database
        .collection(
          name,
        )
        .indexes();

    if (
      indexes.some(
        (index) =>
          index.name !==
          '_id_',
      )
    ) {
      await database
        .collection(
          name,
        )
        .dropIndexes();
    }
  }
}

async function migrateFacilities(
  database: Db,
  now: Date,
): Promise<void> {
  const collection =
    database.collection(
      'facilities',
    );

  for (
    const document of
    await collection
      .find({})
      .toArray()
  ) {
    const suffix =
      String(
        document[
          '_id'
        ],
      )
        .slice(
          -8,
        )
        .toUpperCase();

    const rawStatus =
      legacy(
        document,
        'status',
      );

    const status =
      facilityStatusValues.includes(
        rawStatus as
          (typeof facilityStatusValues)[number],
      )
        ? rawStatus
        : bool(
              legacy(
                document,
                'isActive',
              ),
              true,
            )
          ? 'ACTIVE'
          : 'INACTIVE';

    const primaryLocale =
      text(
        legacy(
          document,
          'locale',
        ),
      ) ??
      'en-PK';

    await collection.updateOne(
      {
        _id:
          document[
            '_id'
          ],
      },
      {
        $set: {
          code:
            code(
              legacy(
                document,
                'code',
              ),
              `FAC_${suffix}`,
            ),

          name:
            text(
              legacy(
                document,
                'name',
              ),
            ) ??
            text(
              legacy(
                document,
                'displayName',
              ),
            ) ??
            `Facility ${suffix}`,

          legalName:
            text(
              legacy(
                document,
                'legalName',
              ),
            ),

          facilityType:
            facilityTypeValues.includes(
              legacy(
                document,
                'facilityType',
              ) as
                (typeof facilityTypeValues)[number],
            )
              ? legacy(
                  document,
                  'facilityType',
                )
              : 'HOSPITAL',

          parentFacilityId:
            objectIdOrNull(
              legacy(
                document,
                'parentFacilityId',
              ),
            ),

          identifiers:
            identifiers(
              legacy(
                document,
                'identifiers',
              ),
            ),

          timezone:
            text(
              legacy(
                document,
                'timezone',
              ),
            ) ??
            'Asia/Karachi',

          currency:
            currency(
              legacy(
                document,
                'currency',
              ),
            ),

          locale:
            primaryLocale,

          supportedLocales:
            localeList(
              legacy(
                document,
                'supportedLocales',
              ),
              primaryLocale,
            ),

          address:
            facilityAddress(
              legacy(
                document,
                'address',
              ),
            ),

          contact:
            facilityContact(
              legacy(
                document,
                'contact',
              ),
            ),

          status,

          allowsAuthentication:
            status ===
              'ACTIVE' &&
            bool(
              legacy(
                document,
                'allowsAuthentication',
              ),
              true,
            ),

          deactivatedAt:
            status ===
            'INACTIVE'
              ? validDate(
                  legacy(
                    document,
                    'deactivatedAt',
                  ),
                  now,
                )
              : null,

          deactivatedBy:
            objectIdOrNull(
              legacy(
                document,
                'deactivatedBy',
              ),
            ),

          deactivationReason:
            text(
              legacy(
                document,
                'deactivationReason',
              ),
            ),

          schemaVersion:
            Math.max(
              1,
              numeric(
                document[
                  'schemaVersion'
                ],
                1,
              ),
            ),

          version:
            Math.max(
              0,
              numeric(
                document[
                  'version'
                ],
                0,
              ),
            ),

          createdBy:
            objectIdOrNull(
              document[
                'createdBy'
              ],
            ),

          updatedBy:
            objectIdOrNull(
              document[
                'updatedBy'
              ],
            ),

          createdAt:
            validDate(
              document[
                'createdAt'
              ],
              now,
            ),

          updatedAt:
            now,
        },

        $unset: {
          data:
            '',

          facilityId:
            '',

          displayName:
            '',

          isActive:
            '',
        },
      },
      {
        bypassDocumentValidation:
          true,
      },
    );
  }
}

async function migrateDepartments(
  database: Db,
  now: Date,
): Promise<void> {
  const collection =
    database.collection(
      'departments',
    );

  for (
    const document of
    await collection
      .find({})
      .toArray()
  ) {
    const facilityId =
      objectIdOrNull(
        legacy(
          document,
          'facilityId',
        ),
      );

    if (
      facilityId === null
    ) {
      throw new Error(
        `Department ${String(
          document['_id'],
        )} has no facilityId`,
      );
    }

    const suffix =
      String(
        document[
          '_id'
        ],
      )
        .slice(
          -8,
        )
        .toUpperCase();

    const rawStatus =
      legacy(
        document,
        'status',
      );

    const status =
      departmentStatusValues.includes(
        rawStatus as
          (typeof departmentStatusValues)[number],
      )
        ? rawStatus
        : bool(
              legacy(
                document,
                'isActive',
              ),
              true,
            )
          ? 'ACTIVE'
          : 'INACTIVE';

    await collection.updateOne(
      {
        _id:
          document[
            '_id'
          ],
      },
      {
        $set: {
          facilityId,

          parentDepartmentId:
            objectIdOrNull(
              legacy(
                document,
                'parentDepartmentId',
              ),
            ),

          managerStaffId:
            objectIdOrNull(
              legacy(
                document,
                'managerStaffId',
              ),
            ),

          code:
            code(
              legacy(
                document,
                'code',
              ),
              `DEP_${suffix}`,
            ),

          name:
            text(
              legacy(
                document,
                'name',
              ),
            ) ??
            `Department ${suffix}`,

          description:
            text(
              legacy(
                document,
                'description',
              ),
            ),

          departmentType:
            departmentTypeValues.includes(
              legacy(
                document,
                'departmentType',
              ) as
                (typeof departmentTypeValues)[number],
            )
              ? legacy(
                  document,
                  'departmentType',
                )
              : 'OTHER',

          isClinical:
            bool(
              legacy(
                document,
                'isClinical',
              ),
              false,
            ),

          location:
            text(
              legacy(
                document,
                'location',
              ),
            ),

          costCenterCode:
            text(
              legacy(
                document,
                'costCenterCode',
              ),
            )?.toUpperCase() ??
            null,

          contact:
            departmentContact(
              legacy(
                document,
                'contact',
              ),
            ),

          status,

          deactivatedAt:
            status ===
            'INACTIVE'
              ? validDate(
                  legacy(
                    document,
                    'deactivatedAt',
                  ),
                  now,
                )
              : null,

          deactivatedBy:
            objectIdOrNull(
              legacy(
                document,
                'deactivatedBy',
              ),
            ),

          deactivationReason:
            text(
              legacy(
                document,
                'deactivationReason',
              ),
            ),

          schemaVersion:
            Math.max(
              1,
              numeric(
                document[
                  'schemaVersion'
                ],
                1,
              ),
            ),

          version:
            Math.max(
              0,
              numeric(
                document[
                  'version'
                ],
                0,
              ),
            ),

          createdBy:
            objectIdOrNull(
              document[
                'createdBy'
              ],
            ),

          updatedBy:
            objectIdOrNull(
              document[
                'updatedBy'
              ],
            ),

          createdAt:
            validDate(
              document[
                'createdAt'
              ],
              now,
            ),

          updatedAt:
            now,
        },

        $unset: {
          data:
            '',

          isActive:
            '',
        },
      },
      {
        bypassDocumentValidation:
          true,
      },
    );
  }
}

async function upsertLegacyDefinition(
  database: Db,
  document: Document,
  key: string,
  scope: SettingScope,
  value: unknown,
  isSensitive: boolean,
  now: Date,
): Promise<ObjectId> {
  const definitions =
    database.collection(
      'settingDefinitions',
    );

  await definitions.updateOne(
    {
      key,
    },
    {
      $setOnInsert: {
        _id:
          new ObjectId(),

        key,

        category:
          'OTHER',

        dataType:
          isSensitive
            ? 'SECRET'
            : inferredDataType(
                value,
              ),

        defaultValue:
          null,

        labels: [
          {
            locale:
              'en-PK',

            label:
              titleFor(
                key,
              ),

            description:
              'Definition created while migrating a legacy setting.',
          },
        ],

        validation: {
          required:
            false,

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

        isSensitive,

        isMutable:
          true,

        isActive:
          true,

        cacheTtlSeconds:
          300,

        schemaVersion:
          1,

        version:
          0,

        createdBy:
          objectIdOrNull(
            document[
              'createdBy'
            ],
          ),

        updatedBy:
          objectIdOrNull(
            document[
              'updatedBy'
            ],
          ),

        createdAt:
          validDate(
            document[
              'createdAt'
            ],
            now,
          ),
      },

      $addToSet: {
        allowedScopes:
          scope,
      },

      $set: {
        updatedAt:
          now,
      },
    },
    {
      upsert:
        true,

      bypassDocumentValidation:
        true,
    },
  );

  const definition =
    await definitions.findOne({
      key,
    });

  if (
    definition === null ||
    !(
      definition[
        '_id'
      ] instanceof
      ObjectId
    )
  ) {
    throw new Error(
      `Setting definition ${key} could not be loaded`,
    );
  }

  return definition[
    '_id'
  ];
}

async function migrateSystemSettings(
  database: Db,
  now: Date,
): Promise<void> {
  const settings =
    database.collection(
      'systemSettings',
    );

  const versions =
    database.collection(
      'systemSettingVersions',
    );

  for (
    const document of
    await settings
      .find({})
      .toArray()
  ) {
    const fallback =
      String(
        document[
          '_id'
        ],
      ).slice(
        -12,
      );

    const key =
      settingKey(
        legacy(
          document,
          'key',
        ),
        fallback,
      );

    const legacyFacilityId =
      objectIdOrNull(
        legacy(
          document,
          'facilityId',
        ),
      );

    const rawScope =
      legacy(
        document,
        'scope',
      );

    const scope:
      SettingScope =
      rawScope ===
        'GLOBAL' ||
      rawScope ===
        'FACILITY'
        ? rawScope
        : legacyFacilityId ===
            null
          ? 'GLOBAL'
          : 'FACILITY';

    const facilityId =
      scope ===
      'GLOBAL'
        ? null
        : legacyFacilityId;

    if (
      scope ===
        'FACILITY' &&
      facilityId ===
        null
    ) {
      throw new Error(
        `Facility setting ${String(
          document['_id'],
        )} has no facilityId`,
      );
    }

    const value =
      legacy(
        document,
        'value',
      );

    const isSensitive =
      bool(
        legacy(
          document,
          'isSensitive',
        ),
        false,
      );

    const encryptedValue =
      encrypted(
        legacy(
          document,
          'encryptedValue',
        ),
      );

    if (
      isSensitive &&
      encryptedValue ===
        null
    ) {
      throw new Error(
        `Sensitive legacy setting ${key} is not encrypted; migrate it manually before applying migration 008`,
      );
    }

    const definitionId =
      await upsertLegacyDefinition(
        database,
        document,
        key,
        scope,
        value,
        isSensitive,
        now,
      );

    const revision =
      Math.max(
        1,
        numeric(
          legacy(
            document,
            'revision',
          ),
          1,
        ),
      );

    const isActive =
      bool(
        legacy(
          document,
          'isActive',
        ),
        true,
      );

    const valueHash =
      text(
        legacy(
          document,
          'valueHash',
        ),
      )?.toLocaleLowerCase(
        'en-US',
      ) ??
      null;

    const normalized = {
      definitionId,
      key,
      scope,
      facilityId,
      value:
        isSensitive
          ? null
          : value ??
            null,
      encryptedValue:
        isSensitive
          ? encryptedValue
          : null,
      valueHash,
      isSensitive,
      revision,
      isActive,
    };

    await settings.updateOne(
      {
        _id:
          document[
            '_id'
          ],
      },
      {
        $set: {
          ...normalized,

          schemaVersion:
            Math.max(
              1,
              numeric(
                document[
                  'schemaVersion'
                ],
                1,
              ),
            ),

          version:
            Math.max(
              0,
              numeric(
                document[
                  'version'
                ],
                0,
              ),
            ),

          createdBy:
            objectIdOrNull(
              document[
                'createdBy'
              ],
            ),

          updatedBy:
            objectIdOrNull(
              document[
                'updatedBy'
              ],
            ),

          createdAt:
            validDate(
              document[
                'createdAt'
              ],
              now,
            ),

          updatedAt:
            now,
        },

        $unset: {
          data:
            '',
        },
      },
      {
        bypassDocumentValidation:
          true,
      },
    );

    await versions.updateOne(
      {
        settingId:
          document[
            '_id'
          ],

        revision,
      },
      {
        $setOnInsert: {
          _id:
            new ObjectId(),

          settingId:
            document[
              '_id'
            ],

          ...normalized,

          changeType:
            'MIGRATED',

          changeSource:
            'MIGRATION',

          changedBy:
            objectIdOrNull(
              document[
                'updatedBy'
              ],
            ) ??
            objectIdOrNull(
              document[
                'createdBy'
              ],
            ),

          changeReason:
            'Migrated to the typed facility configuration model.',

          correlationId:
            null,

          changedAt:
            now,

          schemaVersion:
            1,

          createdAt:
            now,
        },
      },
      {
        upsert:
          true,

        bypassDocumentValidation:
          true,
      },
    );
  }
}

async function enforceSchemas(
  database: Db,
): Promise<void> {
  for (
    const name of
    facilityConfigurationCollections
  ) {
    await database.command({
      collMod:
        name,

      validator:
        facilityConfigurationValidators[
          name
        ],

      validationLevel:
        'strict',

      validationAction:
        'error',
    });

    const indexes =
      schemaIndexes[
        name
      ];

    if (
      indexes.length > 0
    ) {
      await database
        .collection(
          name,
        )
        .createIndexes(
          indexes.map(
            (
              [
                keys,
                options,
              ],
            ) =>
              ({
                key:
                  keys,

                ...options,
              }) as
                IndexDescription,
          ),
        );
    }
  }
}

export const facilityConfigurationFoundation:
  Migration = {
    id:
      '008-facility-configuration-foundation',

    description:
      'Create typed facility, department, setting definition, setting value, and setting history persistence',

    async up(
      database,
    ) {
      const now =
        new Date();

      await ensureCollections(
        database,
      );

      await prepareCollections(
        database,
      );

      await migrateFacilities(
        database,
        now,
      );

      await migrateDepartments(
        database,
        now,
      );

      await migrateSystemSettings(
        database,
        now,
      );

      await enforceSchemas(
        database,
      );
    },
  };