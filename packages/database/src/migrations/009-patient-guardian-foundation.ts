import { randomUUID } from 'node:crypto';

import type {
  Db,
  Document,
  IndexDescription,
} from 'mongodb';
import { ObjectId } from 'mongodb';

import { guardianSchema } from '../models/guardian.model.js';
import { patientGuardianSchema } from '../models/patient-guardian.model.js';
import {
  guardianLegalAuthorityStatusValues,
  guardianRelationshipTypeValues,
  guardianStatusValues,
  guardianVerificationStatusValues,
  patientAddressStatusValues,
  patientAddressTypeValues,
  patientAlertSeverityValues,
  patientAlertStatusValues,
  patientAlertTypeValues,
  patientAlertVisibilityValues,
  patientBirthDatePrecisionValues,
  patientContactPurposeValues,
  patientContactStatusValues,
  patientContactTypeValues,
  patientGenderIdentityValues,
  patientGuardianRequirementValues,
  patientIdentifierScopeValues,
  patientIdentifierStatusValues,
  patientIdentifierTypeValues,
  patientIdentifierVerificationValues,
  patientMergeStateValues,
  patientRegistrationSourceValues,
  patientSexAtBirthValues,
  patientStatusValues,
} from '../models/patient-guardian.types.js';
import { patientIdentifierSchema } from '../models/patient-identifier.model.js';
import { patientSchema } from '../models/patient.model.js';
import {
  patientAddressSchema,
  patientAlertSchema,
  patientContactSchema,
} from '../models/patient-profile.model.js';
import type { Migration } from './types.js';

export const patientGuardianCollections = [
  'patients',
  'patientIdentifiers',
  'guardians',
  'patientGuardians',
  'patientContacts',
  'patientAddresses',
  'patientAlerts',
] as const;

type PatientGuardianCollection =
  (typeof patientGuardianCollections)[number];

const objectId = {
  bsonType: 'objectId',
} as const;

const nullableObjectId = {
  bsonType: [
    'objectId',
    'null',
  ],
} as const;

const date = {
  bsonType: 'date',
} as const;

const nullableDate = {
  bsonType: [
    'date',
    'null',
  ],
} as const;

const string = {
  bsonType: 'string',
} as const;

const nullableString = {
  bsonType: [
    'string',
    'null',
  ],
} as const;

const boolean = {
  bsonType: 'bool',
} as const;

const number = {
  bsonType: 'number',
} as const;

const mutableProperties = {
  _id: objectId,
  facilityId: objectId,
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

const patientMergeRule = {
  oneOf: [
    {
      properties: {
        status: {
          enum: [
            'ACTIVE',
            'INACTIVE',
            'DECEASED',
            'RESTRICTED',
          ],
        },
        mergeState: {
          enum: [
            'CANONICAL',
            'DUPLICATE_SUSPECTED',
          ],
        },
        mergedIntoPatientId: {
          bsonType: 'null',
        },
        mergedAt: {
          bsonType: 'null',
        },
        mergedBy: {
          bsonType: 'null',
        },
      },
    },
    {
      properties: {
        status: {
          enum: [
            'MERGED',
          ],
        },
        mergeState: {
          enum: [
            'MERGED',
          ],
        },
        mergedIntoPatientId: objectId,
        mergedAt: date,
        mergedBy: objectId,
      },
    },
  ],
};

const patientIdentifierScopeRule = {
  oneOf: [
    {
      properties: {
        scope: {
          enum: [
            'FACILITY',
          ],
        },
        issuingFacilityId: objectId,
      },
    },
    {
      properties: {
        scope: {
          enum: [
            'ENTERPRISE',
          ],
        },
        issuingFacilityId: {
          bsonType: 'null',
        },
      },
    },
  ],
};

export const patientGuardianValidators: Record<
  PatientGuardianCollection,
  Record<string, unknown>
> = {
  patients: typedValidator(
    [
      'facilityId',
      'enterprisePatientId',
      'firstName',
      'displayName',
      'normalizedFullName',
      'nameSearchTokens',
      'localizedNames',
      'birthDate',
      'isMinor',
      'guardianRequirement',
      'sexAtBirth',
      'genderIdentity',
      'preferredLocale',
      'nationalityCountryCode',
      'status',
      'mergeState',
      'identityReviewRequired',
      'duplicateReviewRequired',
      'registrationSource',
      'registeredAt',
      'schemaVersion',
      'version',
      'createdAt',
      'updatedAt',
    ],
    {
      ...mutableProperties,
      enterprisePatientId: string,
      canonicalPatientId: nullableObjectId,
      firstName: string,
      middleName: nullableString,
      lastName: nullableString,
      preferredName: nullableString,
      displayName: string,
      normalizedFullName: string,
      nameSearchTokens: {
        bsonType: 'array',
        items: string,
      },
      localizedNames: {
        bsonType: 'array',
      },
      birthDate: {
        bsonType: 'object',
        required: [
          'value',
          'precision',
          'isApproximate',
          'estimatedAgeYears',
          'estimatedAsOfDate',
        ],
        properties: {
          value: nullableDate,
          precision: {
            bsonType: 'string',
            enum: [...patientBirthDatePrecisionValues],
          },
          isApproximate: boolean,
          estimatedAgeYears: {
            bsonType: [
              'number',
              'null',
            ],
          },
          estimatedAsOfDate: nullableDate,
        },
      },
      isMinor: boolean,
      guardianRequirement: {
        bsonType: 'string',
        enum: [...patientGuardianRequirementValues],
      },
      sexAtBirth: {
        bsonType: 'string',
        enum: [...patientSexAtBirthValues],
      },
      genderIdentity: {
        bsonType: 'string',
        enum: [...patientGenderIdentityValues],
      },
      genderDescription: nullableString,
      preferredLocale: string,
      nationalityCountryCode: string,
      status: {
        bsonType: 'string',
        enum: [...patientStatusValues],
      },
      mergeState: {
        bsonType: 'string',
        enum: [...patientMergeStateValues],
      },
      mergedIntoPatientId: nullableObjectId,
      mergedAt: nullableDate,
      mergedBy: nullableObjectId,
      mergeReason: nullableString,
      deceasedAt: nullableDate,
      statusReason: nullableString,
      identityReviewRequired: boolean,
      duplicateReviewRequired: boolean,
      registrationSource: {
        bsonType: 'string',
        enum: [...patientRegistrationSourceValues],
      },
      registeredAt: date,
    },
    [patientMergeRule],
  ),

  patientIdentifiers: typedValidator(
    [
      'facilityId',
      'patientId',
      'issuingFacilityId',
      'identifierType',
      'scope',
      'normalizedValue',
      'displayValue',
      'issuingCountryCode',
      'isPrimaryIdentity',
      'isPrimaryMrn',
      'verificationStatus',
      'status',
      'schemaVersion',
      'version',
      'createdAt',
      'updatedAt',
    ],
    {
      ...mutableProperties,
      patientId: objectId,
      issuingFacilityId: nullableObjectId,
      identifierType: {
        bsonType: 'string',
        enum: [...patientIdentifierTypeValues],
      },
      scope: {
        bsonType: 'string',
        enum: [...patientIdentifierScopeValues],
      },
      normalizedValue: string,
      displayValue: string,
      issuingCountryCode: string,
      issuingAuthority: nullableString,
      isPrimaryIdentity: boolean,
      isPrimaryMrn: boolean,
      verificationStatus: {
        bsonType: 'string',
        enum: [...patientIdentifierVerificationValues],
      },
      verifiedAt: nullableDate,
      verifiedBy: nullableObjectId,
      validFrom: nullableDate,
      expiresAt: nullableDate,
      status: {
        bsonType: 'string',
        enum: [...patientIdentifierStatusValues],
      },
      replacedByIdentifierId: nullableObjectId,
      statusReason: nullableString,
    },
    [patientIdentifierScopeRule],
  ),

  guardians: typedValidator(
    [
      'facilityId',
      'enterpriseGuardianId',
      'firstName',
      'displayName',
      'normalizedFullName',
      'localizedNames',
      'address',
      'preferredLocale',
      'status',
      'schemaVersion',
      'version',
      'createdAt',
      'updatedAt',
    ],
    {
      ...mutableProperties,
      enterpriseGuardianId: string,
      firstName: string,
      middleName: nullableString,
      lastName: nullableString,
      displayName: string,
      normalizedFullName: string,
      localizedNames: {
        bsonType: 'array',
      },
      cnicNormalized: nullableString,
      cnicDisplayValue: nullableString,
      dateOfBirth: nullableDate,
      sexAtBirth: {
        bsonType: 'string',
        enum: [...patientSexAtBirthValues],
      },
      genderIdentity: {
        bsonType: 'string',
        enum: [...patientGenderIdentityValues],
      },
      phoneNormalized: nullableString,
      phoneDisplayValue: nullableString,
      emailNormalized: nullableString,
      address: {
        bsonType: 'object',
      },
      preferredLocale: string,
      status: {
        bsonType: 'string',
        enum: [...guardianStatusValues],
      },
      mergedIntoGuardianId: nullableObjectId,
      mergedAt: nullableDate,
      mergedBy: nullableObjectId,
      statusReason: nullableString,
    },
  ),

  patientGuardians: typedValidator(
    [
      'facilityId',
      'patientId',
      'guardianId',
      'relationshipType',
      'isPrimary',
      'isEmergencyContact',
      'livesWithPatient',
      'isFinanciallyResponsible',
      'legalAuthorityStatus',
      'canConsentToTreatment',
      'canConsentToDisclosure',
      'canReceiveClinicalInformation',
      'verificationStatus',
      'supportingAttachmentIds',
      'isActive',
      'schemaVersion',
      'version',
      'createdAt',
      'updatedAt',
    ],
    {
      ...mutableProperties,
      patientId: objectId,
      guardianId: objectId,
      relationshipType: {
        bsonType: 'string',
        enum: [...guardianRelationshipTypeValues],
      },
      relationshipDescription: nullableString,
      isPrimary: boolean,
      isEmergencyContact: boolean,
      livesWithPatient: boolean,
      isFinanciallyResponsible: boolean,
      legalAuthorityStatus: {
        bsonType: 'string',
        enum: [...guardianLegalAuthorityStatusValues],
      },
      canConsentToTreatment: boolean,
      canConsentToDisclosure: boolean,
      canReceiveClinicalInformation: boolean,
      authorityBasis: nullableString,
      authorityEffectiveFrom: nullableDate,
      authorityEffectiveTo: nullableDate,
      verificationStatus: {
        bsonType: 'string',
        enum: [...guardianVerificationStatusValues],
      },
      verifiedAt: nullableDate,
      verifiedBy: nullableObjectId,
      verificationNotes: nullableString,
      supportingAttachmentIds: {
        bsonType: 'array',
        items: objectId,
      },
      isActive: boolean,
      endedAt: nullableDate,
      endedBy: nullableObjectId,
      endReason: nullableString,
    },
  ),

  patientContacts: typedValidator(
    [
      'facilityId',
      'patientId',
      'contactType',
      'purpose',
      'normalizedValue',
      'displayValue',
      'isPrimary',
      'isEmergencyContact',
      'consentToContact',
      'isVerified',
      'status',
      'schemaVersion',
      'version',
      'createdAt',
      'updatedAt',
    ],
    {
      ...mutableProperties,
      patientId: objectId,
      contactType: {
        bsonType: 'string',
        enum: [...patientContactTypeValues],
      },
      purpose: {
        bsonType: 'string',
        enum: [...patientContactPurposeValues],
      },
      normalizedValue: string,
      displayValue: string,
      contactName: nullableString,
      relationshipToPatient: nullableString,
      relatedGuardianId: nullableObjectId,
      isPrimary: boolean,
      isEmergencyContact: boolean,
      consentToContact: boolean,
      isVerified: boolean,
      verifiedAt: nullableDate,
      verifiedBy: nullableObjectId,
      status: {
        bsonType: 'string',
        enum: [...patientContactStatusValues],
      },
    },
  ),

  patientAddresses: typedValidator(
    [
      'facilityId',
      'patientId',
      'addressType',
      'line1',
      'city',
      'countryCode',
      'isPrimary',
      'status',
      'schemaVersion',
      'version',
      'createdAt',
      'updatedAt',
    ],
    {
      ...mutableProperties,
      patientId: objectId,
      addressType: {
        bsonType: 'string',
        enum: [...patientAddressTypeValues],
      },
      line1: string,
      line2: nullableString,
      landmark: nullableString,
      city: string,
      district: nullableString,
      province: nullableString,
      postalCode: nullableString,
      countryCode: string,
      isPrimary: boolean,
      validFrom: nullableDate,
      validTo: nullableDate,
      status: {
        bsonType: 'string',
        enum: [...patientAddressStatusValues],
      },
    },
  ),

  patientAlerts: typedValidator(
    [
      'facilityId',
      'patientId',
      'alertType',
      'severity',
      'visibility',
      'title',
      'details',
      'effectiveFrom',
      'status',
      'schemaVersion',
      'version',
      'createdAt',
      'updatedAt',
    ],
    {
      ...mutableProperties,
      patientId: objectId,
      alertType: {
        bsonType: 'string',
        enum: [...patientAlertTypeValues],
      },
      severity: {
        bsonType: 'string',
        enum: [...patientAlertSeverityValues],
      },
      visibility: {
        bsonType: 'string',
        enum: [...patientAlertVisibilityValues],
      },
      title: string,
      details: string,
      effectiveFrom: date,
      effectiveTo: nullableDate,
      status: {
        bsonType: 'string',
        enum: [...patientAlertStatusValues],
      },
      resolvedAt: nullableDate,
      resolvedBy: nullableObjectId,
      resolutionReason: nullableString,
    },
  ),
};

const schemaIndexes = {
  patients: patientSchema.indexes(),
  patientIdentifiers: patientIdentifierSchema.indexes(),
  guardians: guardianSchema.indexes(),
  patientGuardians: patientGuardianSchema.indexes(),
  patientContacts: patientContactSchema.indexes(),
  patientAddresses: patientAddressSchema.indexes(),
  patientAlerts: patientAlertSchema.indexes(),
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
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

function text(value: unknown): string | null {
  return typeof value === 'string' &&
    value.trim().length > 0
    ? value.trim()
    : null;
}

function booleanValue(
  value: unknown,
  fallback: boolean,
): boolean {
  return typeof value === 'boolean'
    ? value
    : fallback;
}

function validDate(value: unknown): Date | null {
  return value instanceof Date &&
    !Number.isNaN(value.getTime())
    ? value
    : null;
}

function objectIdOrNull(
  value: unknown,
): ObjectId | null {
  return value instanceof ObjectId
    ? value
    : null;
}

function requiredFacilityId(
  document: Document,
): ObjectId {
  const facilityId = objectIdOrNull(
    legacy(document, 'facilityId'),
  );

  if (facilityId === null) {
    throw new Error(
      `Patient foundation migration cannot migrate ${String(
        document['_id'],
      )} without facilityId`,
    );
  }

  return facilityId;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function normalizeIdentifier(
  type: string,
  value: string,
): string {
  const normalized = value
    .normalize('NFKC')
    .trim()
    .toUpperCase();

  if (type === 'CNIC' || type === 'B_FORM') {
    return normalized.replace(/\D/gu, '');
  }

  if (type === 'PASSPORT' || type === 'MRN') {
    return normalized.replace(
      /[^A-Z0-9_-]/gu,
      '',
    );
  }

  return normalized;
}

function maskIdentifier(
  type: string,
  value: string,
): string {
  if (type === 'MRN') {
    return value;
  }

  if (value.length <= 4) {
    return '*'.repeat(value.length);
  }

  return `${'*'.repeat(
    Math.max(4, value.length - 4),
  )}${value.slice(-4)}`;
}

function normalizedSex(
  value: unknown,
): (typeof patientSexAtBirthValues)[number] {
  const candidate = text(value)?.toUpperCase();

  return patientSexAtBirthValues.includes(
    candidate as (typeof patientSexAtBirthValues)[number],
  )
    ? (candidate as (typeof patientSexAtBirthValues)[number])
    : 'UNKNOWN';
}

function normalizedPatientStatus(
  value: unknown,
): (typeof patientStatusValues)[number] {
  const candidate = text(value)?.toUpperCase();

  return patientStatusValues.includes(
    candidate as (typeof patientStatusValues)[number],
  )
    ? (candidate as (typeof patientStatusValues)[number])
    : 'ACTIVE';
}

function normalizePhone(
  value: unknown,
): string | null {
  const candidate = text(value);

  if (candidate === null) {
    return null;
  }

  const leadingPlus = candidate.startsWith('+');
  const digits = candidate.replace(/\D/gu, '');

  if (digits.length < 7 || digits.length > 15) {
    return null;
  }

  return leadingPlus
    ? `+${digits}`
    : digits;
}

function maskPhone(
  value: string | null,
): string | null {
  if (value === null) {
    return null;
  }

  const visible = value.slice(-4);

  return `${'*'.repeat(
    Math.max(3, value.length - 4),
  )}${visible}`;
}

function birthDateShape(
  document: Document,
): Record<string, unknown> {
  const existing = record(
    legacy(document, 'birthDate'),
  );

  const value =
    validDate(existing['value']) ??
    validDate(legacy(document, 'dateOfBirth'));

  const estimatedAge = legacy(
    document,
    'estimatedAgeYears',
  );

  const isApproximate = booleanValue(
    existing['isApproximate'] ??
      legacy(document, 'dateOfBirthApproximate'),
    false,
  );

  const explicitPrecision = text(
    existing['precision'],
  )?.toUpperCase();

  const precision =
    patientBirthDatePrecisionValues.includes(
      explicitPrecision as (typeof patientBirthDatePrecisionValues)[number],
    )
      ? explicitPrecision
      : value === null
        ? 'UNKNOWN'
        : isApproximate
          ? 'APPROXIMATE'
          : 'EXACT';

  return {
    value,
    precision,
    isApproximate,
    estimatedAgeYears:
      typeof estimatedAge === 'number' &&
      Number.isFinite(estimatedAge) &&
      estimatedAge >= 0 &&
      estimatedAge <= 150
        ? estimatedAge
        : null,
    estimatedAsOfDate:
      validDate(existing['estimatedAsOfDate']) ??
      validDate(
        legacy(document, 'estimatedAsOfDate'),
      ),
  };
}

async function ensureCollections(
  database: Db,
): Promise<void> {
  const existing = new Set(
    (
      await database
        .listCollections(
          {},
          {
            nameOnly: true,
          },
        )
        .toArray()
    ).map((collection) => collection.name),
  );

  for (const name of patientGuardianCollections) {
    if (!existing.has(name)) {
      await database.createCollection(name);
    }
  }
}

async function prepareCollections(
  database: Db,
): Promise<void> {
  for (const name of patientGuardianCollections) {
    await database.command({
      collMod: name,
      validator: {},
      validationLevel: 'moderate',
      validationAction: 'warn',
    });

    const indexes = await database
      .collection(name)
      .indexes();

    if (
      indexes.some(
        (index) => index.name !== '_id_',
      )
    ) {
      await database.collection(name).dropIndexes();
    }
  }
}

async function migratePatients(
  database: Db,
  now: Date,
): Promise<void> {
  const collection = database.collection('patients');
  const cursor = collection.find({});

  for await (const document of cursor) {
    const facilityId = requiredFacilityId(document);

    const firstName =
      text(legacy(document, 'firstName')) ??
      'Unknown';

    const middleName = text(
      legacy(document, 'middleName'),
    );

    const lastName = text(
      legacy(document, 'lastName'),
    );

    const fullName = [
      firstName,
      middleName,
      lastName,
    ]
      .filter(
        (part): part is string => part !== null,
      )
      .join(' ');

    const normalizedFullName =
      normalizeSearchText(fullName);

    const birthDate = birthDateShape(document);

    const dateOfBirth =
      birthDate['value'] as Date | null;

    const derivedMinor =
      dateOfBirth === null
        ? false
        : now.getUTCFullYear() -
            dateOfBirth.getUTCFullYear() <
          18;

    const isMinor = booleanValue(
      legacy(document, 'isMinor'),
      derivedMinor,
    );

    const status = normalizedPatientStatus(
      legacy(document, 'status'),
    );

    const mergedIntoPatientId = objectIdOrNull(
      legacy(document, 'mergedIntoPatientId') ??
        legacy(document, 'canonicalPatientId'),
    );

    const mergeActor =
      objectIdOrNull(
        legacy(document, 'mergedBy'),
      ) ??
      objectIdOrNull(
        legacy(document, 'updatedBy'),
      ) ??
      objectIdOrNull(
        legacy(document, 'createdBy'),
      );

    const isMerged =
      status === 'MERGED' &&
      mergedIntoPatientId !== null &&
      mergeActor !== null;

    const requiresMergeReview =
      status === 'MERGED' && !isMerged;

    const migratedStatus = requiresMergeReview
      ? 'RESTRICTED'
      : status;

    const createdAt =
      validDate(
        legacy(document, 'createdAt'),
      ) ?? now;

    const updatedAt =
      validDate(
        legacy(document, 'updatedAt'),
      ) ?? createdAt;

    await collection.updateOne(
      {
        _id: document['_id'],
      },
      {
        $set: {
          facilityId,
          enterprisePatientId:
            text(
              legacy(
                document,
                'enterprisePatientId',
              ),
            ) ?? randomUUID(),
          canonicalPatientId: objectIdOrNull(
            legacy(
              document,
              'canonicalPatientId',
            ),
          ),
          firstName,
          middleName,
          lastName,
          preferredName: text(
            legacy(document, 'preferredName'),
          ),
          displayName:
            text(
              legacy(document, 'displayName'),
            ) ?? fullName,
          normalizedFullName,
          nameSearchTokens: [
            ...new Set(
              normalizedFullName
                .split(' ')
                .filter(Boolean),
            ),
          ],
          localizedNames: Array.isArray(
            legacy(document, 'localizedNames'),
          )
            ? legacy(document, 'localizedNames')
            : [],
          birthDate,
          isMinor,
          guardianRequirement: isMinor
            ? 'REQUIRED'
            : 'NOT_REQUIRED',
          sexAtBirth: normalizedSex(
            legacy(document, 'sexAtBirth'),
          ),
          genderIdentity: 'NOT_DISCLOSED',
          genderDescription: null,
          preferredLocale:
            text(
              legacy(
                document,
                'preferredLocale',
              ),
            ) ?? 'en-PK',
          nationalityCountryCode:
            text(
              legacy(
                document,
                'nationalityCountryCode',
              ),
            )?.toUpperCase() ?? 'PK',
          status: isMerged
            ? 'MERGED'
            : migratedStatus,
          mergeState: isMerged
            ? 'MERGED'
            : 'CANONICAL',
          mergedIntoPatientId: isMerged
            ? mergedIntoPatientId
            : null,
          mergedAt: isMerged
            ? validDate(
                legacy(document, 'mergedAt'),
              ) ?? now
            : null,
          mergedBy: isMerged
            ? mergeActor
            : null,
          mergeReason: isMerged
            ? text(
                legacy(
                  document,
                  'mergeReason',
                ),
              ) ??
              'Migrated merged patient record'
            : requiresMergeReview
              ? 'Legacy merge metadata requires authorized review'
              : null,
          deceasedAt:
            status === 'DECEASED'
              ? validDate(
                  legacy(
                    document,
                    'deceasedAt',
                  ),
                ) ?? updatedAt
              : null,
          statusReason: text(
            legacy(document, 'statusReason'),
          ),
          identityReviewRequired:
            requiresMergeReview ||
            booleanValue(
              legacy(
                document,
                'identityReviewRequired',
              ),
              false,
            ),
          duplicateReviewRequired:
            booleanValue(
              legacy(
                document,
                'duplicateReviewRequired',
              ),
              false,
            ),
          registrationSource: 'MIGRATION',
          registeredAt:
            validDate(
              legacy(
                document,
                'registeredAt',
              ),
            ) ?? createdAt,
          schemaVersion: 1,
          version:
            typeof legacy(document, 'version') ===
            'number'
              ? legacy(document, 'version')
              : 0,
          createdBy: objectIdOrNull(
            legacy(document, 'createdBy'),
          ),
          updatedBy: objectIdOrNull(
            legacy(document, 'updatedBy'),
          ),
          createdAt,
          updatedAt,
        },
        $unset: {
          data: '',
          mrn: '',
          dateOfBirth: '',
        },
      },
      {
        bypassDocumentValidation: true,
      },
    );
  }
}

async function migratePatientIdentifiers(
  database: Db,
  now: Date,
): Promise<void> {
  const collection = database.collection(
    'patientIdentifiers',
  );

  const cursor = collection.find({});

  for await (const document of cursor) {
    const facilityId = requiredFacilityId(document);

    const patientId = objectIdOrNull(
      legacy(document, 'patientId'),
    );

    if (patientId === null) {
      throw new Error(
        `Patient identifier ${String(
          document['_id'],
        )} does not reference a patient`,
      );
    }

    const rawType = text(
      legacy(document, 'identifierType') ??
        legacy(document, 'type'),
    )?.toUpperCase();

    const identifierType: (typeof patientIdentifierTypeValues)[number] =
      patientIdentifierTypeValues.includes(
        rawType as (typeof patientIdentifierTypeValues)[number],
      )
        ? (rawType as (typeof patientIdentifierTypeValues)[number])
        : 'OTHER';

    const rawValue =
      text(
        legacy(document, 'normalizedValue'),
      ) ??
      text(legacy(document, 'value'));

    if (rawValue === null) {
      throw new Error(
        `Patient identifier ${String(
          document['_id'],
        )} does not contain a value`,
      );
    }

    const normalizedValue = normalizeIdentifier(
      identifierType,
      rawValue,
    );

    const isFacilityScoped =
      identifierType === 'MRN';

    const active = booleanValue(
      legacy(document, 'active'),
      true,
    );

    const createdAt =
      validDate(
        legacy(document, 'createdAt'),
      ) ?? now;

    const updatedAt =
      validDate(
        legacy(document, 'updatedAt'),
      ) ?? createdAt;

    await collection.updateOne(
      {
        _id: document['_id'],
      },
      {
        $set: {
          facilityId,
          patientId,
          issuingFacilityId: isFacilityScoped
            ? facilityId
            : null,
          identifierType,
          scope: isFacilityScoped
            ? 'FACILITY'
            : 'ENTERPRISE',
          normalizedValue,
          displayValue: maskIdentifier(
            identifierType,
            normalizedValue,
          ),
          issuingCountryCode:
            text(
              legacy(
                document,
                'issuingCountryCode',
              ),
            )?.toUpperCase() ?? 'PK',
          issuingAuthority: text(
            legacy(
              document,
              'issuingAuthority',
            ),
          ),
          isPrimaryIdentity: booleanValue(
            legacy(
              document,
              'isPrimaryIdentity',
            ),
            false,
          ),
          isPrimaryMrn:
            identifierType === 'MRN',
          verificationStatus: 'UNVERIFIED',
          verifiedAt: null,
          verifiedBy: null,
          validFrom: validDate(
            legacy(document, 'validFrom'),
          ),
          expiresAt: validDate(
            legacy(document, 'expiresAt'),
          ),
          status: active
            ? 'ACTIVE'
            : 'REVOKED',
          replacedByIdentifierId: null,
          statusReason: active
            ? null
            : 'Migrated inactive identifier',
          schemaVersion: 1,
          version:
            typeof legacy(document, 'version') ===
            'number'
              ? legacy(document, 'version')
              : 0,
          createdBy: objectIdOrNull(
            legacy(document, 'createdBy'),
          ),
          updatedBy: objectIdOrNull(
            legacy(document, 'updatedBy'),
          ),
          createdAt,
          updatedAt,
        },
        $unset: {
          data: '',
          type: '',
          active: '',
          value: '',
        },
      },
      {
        bypassDocumentValidation: true,
      },
    );
  }
}

async function ensureMigratedMedicalRecordNumbers(
  database: Db,
  now: Date,
): Promise<void> {
  const patients = database.collection('patients');

  const identifiers = database.collection(
    'patientIdentifiers',
  );

  const cursor = patients.find({});

  for await (const patient of cursor) {
    const legacyMrn =
      text(patient['mrn']) ??
      text(record(patient['data'])['mrn']);

    if (legacyMrn === null) {
      continue;
    }

    const facilityId = requiredFacilityId(patient);

    const patientId = objectIdOrNull(
      patient['_id'],
    );

    if (patientId === null) {
      continue;
    }

    const normalizedValue = normalizeIdentifier(
      'MRN',
      legacyMrn,
    );

    await identifiers.updateOne(
      {
        patientId,
        identifierType: 'MRN',
        issuingFacilityId: facilityId,
        normalizedValue,
      },
      {
        $set: {
          displayValue: normalizedValue,
          status: 'ACTIVE',
          isPrimaryMrn: true,
          updatedAt: now,
        },
        $setOnInsert: {
          _id: new ObjectId(),
          facilityId,
          patientId,
          issuingFacilityId: facilityId,
          identifierType: 'MRN',
          scope: 'FACILITY',
          normalizedValue,
          issuingCountryCode: 'PK',
          issuingAuthority: null,
          isPrimaryIdentity: false,
          verificationStatus: 'UNVERIFIED',
          verifiedAt: null,
          verifiedBy: null,
          validFrom: null,
          expiresAt: null,
          replacedByIdentifierId: null,
          statusReason: null,
          schemaVersion: 1,
          version: 0,
          createdBy: objectIdOrNull(
            patient['createdBy'],
          ),
          updatedBy: objectIdOrNull(
            patient['updatedBy'],
          ),
          createdAt:
            validDate(patient['createdAt']) ??
            now,
        },
      },
      {
        upsert: true,
        bypassDocumentValidation: true,
      },
    );
  }
}

async function migrateGuardians(
  database: Db,
  now: Date,
): Promise<void> {
  const collection = database.collection('guardians');
  const cursor = collection.find({});

  for await (const document of cursor) {
    const facilityId = requiredFacilityId(document);

    const firstName =
      text(legacy(document, 'firstName')) ??
      'Unknown';

    const middleName = text(
      legacy(document, 'middleName'),
    );

    const lastName = text(
      legacy(document, 'lastName'),
    );

    const displayName = [
      firstName,
      middleName,
      lastName,
    ]
      .filter(
        (part): part is string => part !== null,
      )
      .join(' ');

    const cnic =
      text(
        legacy(document, 'cnic'),
      )?.replace(/\D/gu, '') ?? null;

    const phone = normalizePhone(
      legacy(document, 'phoneNormalized') ??
        legacy(document, 'phone'),
    );

    const address = record(
      legacy(document, 'address'),
    );

    const createdAt =
      validDate(
        legacy(document, 'createdAt'),
      ) ?? now;

    const updatedAt =
      validDate(
        legacy(document, 'updatedAt'),
      ) ?? createdAt;

    await collection.updateOne(
      {
        _id: document['_id'],
      },
      {
        $set: {
          facilityId,
          enterpriseGuardianId:
            text(
              legacy(
                document,
                'enterpriseGuardianId',
              ),
            ) ?? randomUUID(),
          firstName,
          middleName,
          lastName,
          displayName,
          normalizedFullName:
            normalizeSearchText(displayName),
          localizedNames: Array.isArray(
            legacy(document, 'localizedNames'),
          )
            ? legacy(document, 'localizedNames')
            : [],
          cnicNormalized:
            cnic !== null && cnic.length === 13
              ? cnic
              : null,
          cnicDisplayValue:
            cnic !== null && cnic.length === 13
              ? maskIdentifier('CNIC', cnic)
              : null,
          dateOfBirth: validDate(
            legacy(document, 'dateOfBirth'),
          ),
          sexAtBirth: normalizedSex(
            legacy(document, 'sexAtBirth'),
          ),
          genderIdentity: 'NOT_DISCLOSED',
          phoneNormalized: phone,
          phoneDisplayValue: maskPhone(phone),
          emailNormalized:
            text(
              legacy(document, 'email'),
            )?.toLocaleLowerCase('en-US') ??
            null,
          address: {
            line1: text(address['line1']),
            line2: text(address['line2']),
            city: text(address['city']),
            district: text(address['district']),
            province: text(address['province']),
            postalCode: text(
              address['postalCode'],
            ),
            countryCode:
              text(
                address['countryCode'],
              )?.toUpperCase() ?? 'PK',
          },
          preferredLocale:
            text(
              legacy(
                document,
                'preferredLocale',
              ),
            ) ?? 'en-PK',
          status: 'ACTIVE',
          mergedIntoGuardianId: null,
          mergedAt: null,
          mergedBy: null,
          statusReason: null,
          schemaVersion: 1,
          version:
            typeof legacy(document, 'version') ===
            'number'
              ? legacy(document, 'version')
              : 0,
          createdBy: objectIdOrNull(
            legacy(document, 'createdBy'),
          ),
          updatedBy: objectIdOrNull(
            legacy(document, 'updatedBy'),
          ),
          createdAt,
          updatedAt,
        },
        $unset: {
          data: '',
          cnic: '',
          phone: '',
          email: '',
        },
      },
      {
        bypassDocumentValidation: true,
      },
    );
  }
}

async function migratePatientGuardians(
  database: Db,
  now: Date,
): Promise<void> {
  const collection = database.collection(
    'patientGuardians',
  );

  const cursor = collection.find({});

  for await (const document of cursor) {
    const facilityId = requiredFacilityId(document);

    const patientId = objectIdOrNull(
      legacy(document, 'patientId'),
    );

    const guardianId = objectIdOrNull(
      legacy(document, 'guardianId'),
    );

    if (
      patientId === null ||
      guardianId === null
    ) {
      throw new Error(
        `Patient guardian relationship ${String(
          document['_id'],
        )} is missing references`,
      );
    }

    const rawRelationship = text(
      legacy(document, 'relationshipType'),
    )?.toUpperCase();

    const relationshipType: (typeof guardianRelationshipTypeValues)[number] =
      guardianRelationshipTypeValues.includes(
        rawRelationship as (typeof guardianRelationshipTypeValues)[number],
      )
        ? (rawRelationship as (typeof guardianRelationshipTypeValues)[number])
        : 'OTHER';

    const isActive = booleanValue(
      legacy(document, 'isActive'),
      true,
    );

    const createdAt =
      validDate(
        legacy(document, 'createdAt'),
      ) ?? now;

    const updatedAt =
      validDate(
        legacy(document, 'updatedAt'),
      ) ?? createdAt;

    await collection.updateOne(
      {
        _id: document['_id'],
      },
      {
        $set: {
          facilityId,
          patientId,
          guardianId,
          relationshipType,
          relationshipDescription:
            relationshipType === 'OTHER'
              ? text(
                  legacy(
                    document,
                    'relationshipDescription',
                  ),
                ) ?? 'Migrated relationship'
              : text(
                  legacy(
                    document,
                    'relationshipDescription',
                  ),
                ),
          isPrimary: booleanValue(
            legacy(document, 'isPrimary'),
            false,
          ),
          isEmergencyContact: booleanValue(
            legacy(
              document,
              'isEmergencyContact',
            ),
            false,
          ),
          livesWithPatient: booleanValue(
            legacy(
              document,
              'livesWithPatient',
            ),
            false,
          ),
          isFinanciallyResponsible:
            booleanValue(
              legacy(
                document,
                'isFinanciallyResponsible',
              ),
              false,
            ),
          legalAuthorityStatus: 'DECLARED',
          canConsentToTreatment: booleanValue(
            legacy(
              document,
              'canConsentToTreatment',
            ),
            false,
          ),
          canConsentToDisclosure: booleanValue(
            legacy(
              document,
              'canConsentToDisclosure',
            ),
            false,
          ),
          canReceiveClinicalInformation:
            booleanValue(
              legacy(
                document,
                'canReceiveClinicalInformation',
              ),
              false,
            ),
          authorityBasis: text(
            legacy(document, 'authorityBasis'),
          ),
          authorityEffectiveFrom: validDate(
            legacy(
              document,
              'authorityEffectiveFrom',
            ),
          ),
          authorityEffectiveTo: validDate(
            legacy(
              document,
              'authorityEffectiveTo',
            ),
          ),
          verificationStatus: 'UNVERIFIED',
          verifiedAt: null,
          verifiedBy: null,
          verificationNotes: null,
          supportingAttachmentIds:
            Array.isArray(
              legacy(
                document,
                'supportingAttachmentIds',
              ),
            )
              ? legacy(
                  document,
                  'supportingAttachmentIds',
                )
              : [],
          isActive,
          endedAt: isActive
            ? null
            : validDate(
                legacy(document, 'endedAt'),
              ) ?? updatedAt,
          endedBy: isActive
            ? null
            : objectIdOrNull(
                legacy(document, 'endedBy'),
              ),
          endReason: isActive
            ? null
            : text(
                legacy(document, 'endReason'),
              ) ??
              'Migrated inactive relationship',
          schemaVersion: 1,
          version:
            typeof legacy(document, 'version') ===
            'number'
              ? legacy(document, 'version')
              : 0,
          createdBy: objectIdOrNull(
            legacy(document, 'createdBy'),
          ),
          updatedBy: objectIdOrNull(
            legacy(document, 'updatedBy'),
          ),
          createdAt,
          updatedAt,
        },
        $unset: {
          data: '',
        },
      },
      {
        bypassDocumentValidation: true,
      },
    );
  }
}

async function migratePatientContacts(
  database: Db,
  now: Date,
): Promise<void> {
  const collection = database.collection(
    'patientContacts',
  );

  const cursor = collection.find({});

  for await (const document of cursor) {
    const facilityId = requiredFacilityId(document);

    const patientId = objectIdOrNull(
      legacy(document, 'patientId'),
    );

    if (patientId === null) {
      throw new Error(
        `Patient contact ${String(
          document['_id'],
        )} is missing patientId`,
      );
    }

    const rawType = text(
      legacy(document, 'contactType'),
    )?.toUpperCase();

    const contactType =
      rawType === 'EMAIL'
        ? 'EMAIL'
        : 'PHONE';

    const rawValue =
      text(
        legacy(document, 'normalizedValue'),
      ) ??
      text(legacy(document, 'value')) ??
      text(
        legacy(
          document,
          contactType === 'EMAIL'
            ? 'email'
            : 'phone',
        ),
      );

    if (rawValue === null) {
      throw new Error(
        `Patient contact ${String(
          document['_id'],
        )} is missing a value`,
      );
    }

    const normalizedValue =
      contactType === 'EMAIL'
        ? rawValue.toLocaleLowerCase('en-US')
        : normalizePhone(rawValue);

    if (normalizedValue === null) {
      throw new Error(
        `Patient contact ${String(
          document['_id'],
        )} has an invalid phone`,
      );
    }

    const createdAt =
      validDate(
        legacy(document, 'createdAt'),
      ) ?? now;

    const updatedAt =
      validDate(
        legacy(document, 'updatedAt'),
      ) ?? createdAt;

    await collection.updateOne(
      {
        _id: document['_id'],
      },
      {
        $set: {
          facilityId,
          patientId,
          contactType,
          purpose: booleanValue(
            legacy(
              document,
              'isEmergencyContact',
            ),
            false,
          )
            ? 'EMERGENCY'
            : 'PRIMARY',
          normalizedValue,
          displayValue:
            contactType === 'PHONE'
              ? maskPhone(normalizedValue) ??
                normalizedValue
              : normalizedValue.replace(
                  /^(.{1,2}).*(@.*)$/u,
                  '$1***$2',
                ),
          contactName: text(
            legacy(document, 'contactName'),
          ),
          relationshipToPatient: text(
            legacy(
              document,
              'relationshipToPatient',
            ),
          ),
          relatedGuardianId: objectIdOrNull(
            legacy(
              document,
              'relatedGuardianId',
            ),
          ),
          isPrimary: booleanValue(
            legacy(document, 'isPrimary'),
            false,
          ),
          isEmergencyContact: booleanValue(
            legacy(
              document,
              'isEmergencyContact',
            ),
            false,
          ),
          consentToContact: booleanValue(
            legacy(
              document,
              'consentToContact',
            ),
            true,
          ),
          isVerified: false,
          verifiedAt: null,
          verifiedBy: null,
          status: 'ACTIVE',
          schemaVersion: 1,
          version:
            typeof legacy(document, 'version') ===
            'number'
              ? legacy(document, 'version')
              : 0,
          createdBy: objectIdOrNull(
            legacy(document, 'createdBy'),
          ),
          updatedBy: objectIdOrNull(
            legacy(document, 'updatedBy'),
          ),
          createdAt,
          updatedAt,
        },
        $unset: {
          data: '',
          value: '',
          phone: '',
          email: '',
        },
      },
      {
        bypassDocumentValidation: true,
      },
    );
  }
}

async function migratePatientAddresses(
  database: Db,
  now: Date,
): Promise<void> {
  const collection = database.collection(
    'patientAddresses',
  );

  const cursor = collection.find({});

  for await (const document of cursor) {
    const facilityId = requiredFacilityId(document);

    const patientId = objectIdOrNull(
      legacy(document, 'patientId'),
    );

    if (patientId === null) {
      throw new Error(
        `Patient address ${String(
          document['_id'],
        )} is missing patientId`,
      );
    }

    const createdAt =
      validDate(
        legacy(document, 'createdAt'),
      ) ?? now;

    const updatedAt =
      validDate(
        legacy(document, 'updatedAt'),
      ) ?? createdAt;

    await collection.updateOne(
      {
        _id: document['_id'],
      },
      {
        $set: {
          facilityId,
          patientId,
          addressType: 'HOME',
          line1:
            text(
              legacy(document, 'line1'),
            ) ?? 'Unknown address',
          line2: text(
            legacy(document, 'line2'),
          ),
          landmark: text(
            legacy(document, 'landmark'),
          ),
          city:
            text(
              legacy(document, 'city'),
            ) ?? 'Unknown',
          district: text(
            legacy(document, 'district'),
          ),
          province: text(
            legacy(document, 'province'),
          ),
          postalCode: text(
            legacy(document, 'postalCode'),
          ),
          countryCode:
            text(
              legacy(
                document,
                'countryCode',
              ),
            )?.toUpperCase() ?? 'PK',
          isPrimary: booleanValue(
            legacy(document, 'isPrimary'),
            false,
          ),
          validFrom: validDate(
            legacy(document, 'validFrom'),
          ),
          validTo: validDate(
            legacy(document, 'validTo'),
          ),
          status: 'ACTIVE',
          schemaVersion: 1,
          version:
            typeof legacy(document, 'version') ===
            'number'
              ? legacy(document, 'version')
              : 0,
          createdBy: objectIdOrNull(
            legacy(document, 'createdBy'),
          ),
          updatedBy: objectIdOrNull(
            legacy(document, 'updatedBy'),
          ),
          createdAt,
          updatedAt,
        },
        $unset: {
          data: '',
        },
      },
      {
        bypassDocumentValidation: true,
      },
    );
  }
}

async function migratePatientAlerts(
  database: Db,
  now: Date,
): Promise<void> {
  const collection = database.collection(
    'patientAlerts',
  );

  const cursor = collection.find({});

  for await (const document of cursor) {
    const facilityId = requiredFacilityId(document);

    const patientId = objectIdOrNull(
      legacy(document, 'patientId'),
    );

    if (patientId === null) {
      throw new Error(
        `Patient alert ${String(
          document['_id'],
        )} is missing patientId`,
      );
    }

    const createdAt =
      validDate(
        legacy(document, 'createdAt'),
      ) ?? now;

    const updatedAt =
      validDate(
        legacy(document, 'updatedAt'),
      ) ?? createdAt;

    await collection.updateOne(
      {
        _id: document['_id'],
      },
      {
        $set: {
          facilityId,
          patientId,
          alertType: 'ADMINISTRATIVE',
          severity: 'WARNING',
          visibility: 'RESTRICTED',
          title:
            text(
              legacy(document, 'title'),
            ) ?? 'Migrated patient alert',
          details:
            text(
              legacy(document, 'details'),
            ) ??
            text(
              legacy(document, 'message'),
            ) ??
            'Migrated patient alert',
          effectiveFrom:
            validDate(
              legacy(
                document,
                'effectiveFrom',
              ),
            ) ?? createdAt,
          effectiveTo: validDate(
            legacy(
              document,
              'effectiveTo',
            ),
          ),
          status: 'ACTIVE',
          resolvedAt: null,
          resolvedBy: null,
          resolutionReason: null,
          schemaVersion: 1,
          version:
            typeof legacy(document, 'version') ===
            'number'
              ? legacy(document, 'version')
              : 0,
          createdBy: objectIdOrNull(
            legacy(document, 'createdBy'),
          ),
          updatedBy: objectIdOrNull(
            legacy(document, 'updatedBy'),
          ),
          createdAt,
          updatedAt,
        },
        $unset: {
          data: '',
          message: '',
        },
      },
      {
        bypassDocumentValidation: true,
      },
    );
  }
}

async function enforceSchemas(
  database: Db,
): Promise<void> {
  for (const name of patientGuardianCollections) {
    await database.command({
      collMod: name,
      validator: patientGuardianValidators[name],
      validationLevel: 'strict',
      validationAction: 'error',
    });

    const indexes = schemaIndexes[name];

    if (indexes.length > 0) {
      await database.collection(name).createIndexes(
        indexes.map(
          ([keys, options]) =>
            ({
              key: keys,
              ...options,
            }) as IndexDescription,
        ),
      );
    }
  }
}

export const patientGuardianFoundation: Migration = {
  id: '009-patient-guardian-foundation',
  description:
    'Create typed patient, identifier, guardian, relationship, contact, address, and alert persistence',

  async up(database) {
    const now = new Date();

    await ensureCollections(database);
    await prepareCollections(database);
    await migratePatientIdentifiers(database, now);
    await ensureMigratedMedicalRecordNumbers(
      database,
      now,
    );
    await migratePatients(database, now);
    await migrateGuardians(database, now);
    await migratePatientGuardians(database, now);
    await migratePatientContacts(database, now);
    await migratePatientAddresses(database, now);
    await migratePatientAlerts(database, now);
    await enforceSchemas(database);
  },
};