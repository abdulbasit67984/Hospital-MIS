import type {
  Db,
  IndexDescription,
} from 'mongodb';

import {
  collectionSpecs,
  type HospitalCollectionName,
} from '../catalog/collection-specs.js';

import {
  FormularyItemModel,
  MedicineFormModel,
  MedicineModel,
  MedicineRouteModel,
  MedicineStrengthModel,
  PrescriptionFrequencyModel,
  UnitOfMeasureModel,
} from '../models/medicine-catalog.model.js';

import {
  PrescriptionItemModel,
  PrescriptionModel,
  PrescriptionSafetyWarningModel,
  PrescriptionStatusHistoryModel,
} from '../models/prescription.model.js';

import {
  formularyItemStatusValues,
  formularyRestrictionTypeValues,
  medicineCatalogStatusValues,
  medicineFormCategoryValues,
  medicineInteractionCheckStatusValues,
  medicineRouteCodeValues,
  prescriptionChangeTypeValues,
  prescriptionDurationUnitValues,
  prescriptionFrequencyKindValues,
  prescriptionItemStatusValues,
  prescriptionStatusChangeSourceValues,
  prescriptionStatusValues,
  prescriptionWarningSeverityValues,
  prescriptionWarningStatusValues,
  prescriptionWarningTypeValues,
  unitOfMeasureDimensionValues,
} from '../models/formulary-prescription.types.js';

import {
  providerSignatureMethodValues,
} from '../models/clinical-emr.types.js';

import type {
  Migration,
} from './types.js';

export const formularyPrescriptionCollections = [
  'medicines',
  'medicineForms',
  'medicineRoutes',
  'unitsOfMeasure',
  'medicineStrengths',
  'prescriptionFrequencies',
  'formularyItems',
  'prescriptions',
  'prescriptionItems',
  'prescriptionSafetyWarnings',
  'prescriptionStatusHistories',
] as const satisfies readonly HospitalCollectionName[];

type FormularyPrescriptionCollection =
  (typeof formularyPrescriptionCollections)[number];

const objectId = {
  bsonType: 'objectId',
} as const;

const nullableObjectId = {
  bsonType: [
    'objectId',
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

const date = {
  bsonType: 'date',
} as const;

const nullableDate = {
  bsonType: [
    'date',
    'null',
  ],
} as const;

const number = {
  bsonType: 'number',
} as const;

const nullableNumber = {
  bsonType: [
    'number',
    'null',
  ],
} as const;

const decimal = {
  bsonType: 'decimal',
} as const;

const nullableDecimal = {
  bsonType: [
    'decimal',
    'null',
  ],
} as const;

const boolean = {
  bsonType: 'bool',
} as const;

const commonProperties = {
  facilityId: objectId,
  schemaVersion: {
    ...number,
    minimum: 1,
  },
  version: {
    ...number,
    minimum: 0,
  },
  createdBy: objectId,
  updatedBy: objectId,
  createdAt: date,
  updatedAt: date,
} as const;

const commonRequired = [
  'facilityId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
] as const;

function validator(
  required: readonly string[],
  properties: Record<string, unknown>,
): Record<string, unknown> {
  return {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        ...required,
        ...commonRequired,
      ],
      properties: {
        _id: objectId,
        ...properties,
        ...commonProperties,
      },
    },
  };
}

const encryptedSnapshot = {
  bsonType: 'object',
  required: [
    'algorithm',
    'keyVersion',
    'initializationVector',
    'authenticationTag',
    'ciphertext',
  ],
  additionalProperties: false,
  properties: {
    algorithm: {
      bsonType: 'string',
      enum: ['AES-256-GCM'],
    },
    keyVersion: string,
    initializationVector: string,
    authenticationTag: string,
    ciphertext: string,
  },
} as const;

export const formularyPrescriptionValidators: Readonly<
  Record<FormularyPrescriptionCollection, Record<string, unknown>>
> = {
  medicines: validator(
    [
      'medicineCode',
      'genericName',
      'normalizedGenericName',
      'brandNames',
      'synonyms',
      'status',
    ],
    {
      medicineCode: string,
      genericName: string,
      normalizedGenericName: string,
      brandNames: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: [
            'name',
            'normalizedName',
            'status',
          ],
          additionalProperties: false,
          properties: {
            name: string,
            normalizedName: string,
            manufacturerName: nullableString,
            status: {
              bsonType: 'string',
              enum: [...medicineCatalogStatusValues],
            },
          },
        },
      },
      synonyms: {
        bsonType: 'array',
        items: string,
      },
      therapeuticClass: nullableString,
      atcCode: nullableString,
      description: nullableString,
      status: {
        bsonType: 'string',
        enum: [...medicineCatalogStatusValues],
      },
      deactivatedAt: nullableDate,
      deactivatedBy: nullableObjectId,
      deactivationReason: nullableString,
    },
  ),

  medicineForms: validator(
    [
      'code',
      'name',
      'normalizedName',
      'category',
      'status',
    ],
    {
      code: string,
      name: string,
      normalizedName: string,
      category: {
        bsonType: 'string',
        enum: [...medicineFormCategoryValues],
      },
      status: {
        bsonType: 'string',
        enum: [...medicineCatalogStatusValues],
      },
      deactivatedAt: nullableDate,
      deactivatedBy: nullableObjectId,
      deactivationReason: nullableString,
    },
  ),

  medicineRoutes: validator(
    [
      'code',
      'name',
      'normalizedName',
      'status',
    ],
    {
      code: {
        bsonType: 'string',
        enum: [...medicineRouteCodeValues],
      },
      name: string,
      normalizedName: string,
      status: {
        bsonType: 'string',
        enum: [...medicineCatalogStatusValues],
      },
      deactivatedAt: nullableDate,
      deactivatedBy: nullableObjectId,
      deactivationReason: nullableString,
    },
  ),

  unitsOfMeasure: validator(
    [
      'code',
      'name',
      'normalizedName',
      'symbol',
      'dimension',
      'decimalScale',
      'status',
    ],
    {
      code: string,
      name: string,
      normalizedName: string,
      symbol: string,
      dimension: {
        bsonType: 'string',
        enum: [...unitOfMeasureDimensionValues],
      },
      decimalScale: {
        ...number,
        minimum: 0,
        maximum: 6,
      },
      status: {
        bsonType: 'string',
        enum: [...medicineCatalogStatusValues],
      },
      deactivatedAt: nullableDate,
      deactivatedBy: nullableObjectId,
      deactivationReason: nullableString,
    },
  ),

  medicineStrengths: validator(
    [
      'medicineId',
      'medicineFormId',
      'displayText',
      'normalizedDisplayText',
      'numeratorValue',
      'numeratorUnitId',
      'status',
    ],
    {
      medicineId: objectId,
      medicineFormId: objectId,
      displayText: string,
      normalizedDisplayText: string,
      numeratorValue: decimal,
      numeratorUnitId: objectId,
      denominatorValue: nullableDecimal,
      denominatorUnitId: nullableObjectId,
      status: {
        bsonType: 'string',
        enum: [...medicineCatalogStatusValues],
      },
      deactivatedAt: nullableDate,
      deactivatedBy: nullableObjectId,
      deactivationReason: nullableString,
    },
  ),

  prescriptionFrequencies: validator(
    [
      'code',
      'name',
      'normalizedName',
      'kind',
      'defaultAdministrationTimes',
      'allowsAsNeeded',
      'status',
    ],
    {
      code: string,
      name: string,
      normalizedName: string,
      kind: {
        bsonType: 'string',
        enum: [...prescriptionFrequencyKindValues],
      },
      timesPerDay: nullableNumber,
      intervalMinutes: nullableNumber,
      defaultAdministrationTimes: {
        bsonType: 'array',
        items: string,
      },
      allowsAsNeeded: boolean,
      maxAdministrationsPerDay: nullableNumber,
      patientInstructionTemplate: nullableString,
      status: {
        bsonType: 'string',
        enum: [...medicineCatalogStatusValues],
      },
      deactivatedAt: nullableDate,
      deactivatedBy: nullableObjectId,
      deactivationReason: nullableString,
    },
  ),

  formularyItems: validator(
    [
      'formularyCode',
      'medicineId',
      'medicineFormId',
      'medicineStrengthId',
      'allowedRouteIds',
      'defaultRouteId',
      'doseUnitId',
      'quantityUnitId',
      'stockTracked',
      'restrictionType',
      'restrictedDepartmentIds',
      'highAlert',
      'controlledMedicine',
      'searchText',
      'effectiveFrom',
      'status',
      'transactionId',
      'correlationId',
    ],
    {
      formularyCode: string,
      medicineId: objectId,
      medicineFormId: objectId,
      medicineStrengthId: objectId,
      brandName: nullableString,
      normalizedBrandName: nullableString,
      allowedRouteIds: {
        bsonType: 'array',
        items: objectId,
      },
      defaultRouteId: objectId,
      doseUnitId: objectId,
      quantityUnitId: objectId,
      inventoryItemId: nullableObjectId,
      stockTracked: boolean,
      restrictionType: {
        bsonType: 'string',
        enum: [...formularyRestrictionTypeValues],
      },
      restrictedDepartmentIds: {
        bsonType: 'array',
        items: objectId,
      },
      minimumAgeYears: nullableNumber,
      maximumAgeYears: nullableNumber,
      highAlert: boolean,
      controlledMedicine: boolean,
      prescribingNotes: nullableString,
      searchText: string,
      activeSelectionKey: nullableString,
      effectiveFrom: date,
      effectiveUntil: nullableDate,
      status: {
        bsonType: 'string',
        enum: [...formularyItemStatusValues],
      },
      deactivatedAt: nullableDate,
      deactivatedBy: nullableObjectId,
      deactivationReason: nullableString,
      transactionId: string,
      correlationId: string,
    },
  ),

  prescriptions: validator(
    [
      'prescriptionNumber',
      'patientId',
      'requestedPatientId',
      'canonicalRedirected',
      'encounterId',
      'departmentId',
      'prescriberProviderId',
      'status',
      'revisionNumber',
      'rootPrescriptionId',
      'draftedAt',
      'interactionCheckStatus',
      'itemCount',
      'activeItemCount',
      'dispensedItemCount',
      'safetyWarningCount',
      'unresolvedBlockingWarningCount',
      'printRevision',
      'transactionId',
      'correlationId',
    ],
    {
      prescriptionNumber: string,
      patientId: objectId,
      requestedPatientId: objectId,
      canonicalRedirected: boolean,
      encounterId: objectId,
      registrationId: nullableObjectId,
      opdVisitId: nullableObjectId,
      queueTokenId: nullableObjectId,
      departmentId: objectId,
      clinicId: nullableObjectId,
      servicePointId: nullableObjectId,
      prescriberProviderId: objectId,
      status: {
        bsonType: 'string',
        enum: [...prescriptionStatusValues],
      },
      revisionNumber: {
        ...number,
        minimum: 1,
      },
      rootPrescriptionId: objectId,
      supersedesPrescriptionId: nullableObjectId,
      supersededByPrescriptionId: nullableObjectId,
      replacementReason: nullableString,
      draftedAt: date,
      issuedAt: nullableDate,
      expiresAt: nullableDate,
      signedBy: nullableObjectId,
      signatureMethod: {
        bsonType: [
          'string',
          'null',
        ],
        enum: [
          ...providerSignatureMethodValues,
          null,
        ],
      },
      signatureDigest: nullableString,
      lockedAt: nullableDate,
      lockedBy: nullableObjectId,
      issuedSnapshotHash: nullableString,
      cancelledAt: nullableDate,
      cancelledBy: nullableObjectId,
      cancellationReason: nullableString,
      interactionCheckStatus: {
        bsonType: 'string',
        enum: [...medicineInteractionCheckStatusValues],
      },
      interactionCheckProvider: nullableString,
      interactionCheckedAt: nullableDate,
      itemCount: {
        ...number,
        minimum: 0,
      },
      activeItemCount: {
        ...number,
        minimum: 0,
      },
      dispensedItemCount: {
        ...number,
        minimum: 0,
      },
      safetyWarningCount: {
        ...number,
        minimum: 0,
      },
      unresolvedBlockingWarningCount: {
        ...number,
        minimum: 0,
      },
      printRevision: {
        ...number,
        minimum: 0,
      },
      lastPrintedAt: nullableDate,
      lastPrintedBy: nullableObjectId,
      transactionId: string,
      correlationId: string,
    },
  ),

  prescriptionItems: validator(
    [
      'prescriptionId',
      'patientId',
      'encounterId',
      'sequence',
      'formularyItemId',
      'medicineId',
      'medicineFormId',
      'medicineStrengthId',
      'genericNameSnapshot',
      'medicineFormSnapshot',
      'medicineStrengthSnapshot',
      'dose',
      'doseUnitId',
      'doseUnitSnapshot',
      'routeId',
      'routeSnapshot',
      'frequencyId',
      'frequencySnapshot',
      'durationUnit',
      'quantity',
      'quantityUnitId',
      'quantityUnitSnapshot',
      'asNeeded',
      'startDate',
      'status',
      'dispensedQuantity',
      'transactionId',
      'correlationId',
    ],
    {
      prescriptionId: objectId,
      patientId: objectId,
      encounterId: objectId,
      sequence: {
        ...number,
        minimum: 1,
      },
      formularyItemId: objectId,
      medicineId: objectId,
      medicineFormId: objectId,
      medicineStrengthId: objectId,
      selectedBrandName: nullableString,
      genericNameSnapshot: string,
      medicineFormSnapshot: string,
      medicineStrengthSnapshot: string,
      dose: decimal,
      doseUnitId: objectId,
      doseUnitSnapshot: string,
      routeId: objectId,
      routeSnapshot: string,
      frequencyId: objectId,
      frequencySnapshot: string,
      durationValue: nullableDecimal,
      durationUnit: {
        bsonType: 'string',
        enum: [...prescriptionDurationUnitValues],
      },
      quantity: decimal,
      quantityUnitId: objectId,
      quantityUnitSnapshot: string,
      instructions: nullableString,
      asNeeded: boolean,
      asNeededReason: nullableString,
      startDate: string,
      endDate: nullableString,
      status: {
        bsonType: 'string',
        enum: [...prescriptionItemStatusValues],
      },
      cancelledAt: nullableDate,
      cancelledBy: nullableObjectId,
      cancellationReason: nullableString,
      dispensedQuantity: decimal,
      lastDispensedAt: nullableDate,
      lastDispensationId: nullableObjectId,
      transactionId: string,
      correlationId: string,
    },
  ),

  prescriptionSafetyWarnings: validator(
    [
      'prescriptionId',
      'patientId',
      'encounterId',
      'warningFingerprint',
      'warningType',
      'severity',
      'status',
      'warningCode',
      'message',
      'detectedAt',
      'detectedBy',
      'transactionId',
      'correlationId',
    ],
    {
      prescriptionId: objectId,
      prescriptionItemId: nullableObjectId,
      patientId: objectId,
      encounterId: objectId,
      warningFingerprint: string,
      warningType: {
        bsonType: 'string',
        enum: [...prescriptionWarningTypeValues],
      },
      severity: {
        bsonType: 'string',
        enum: [...prescriptionWarningSeverityValues],
      },
      status: {
        bsonType: 'string',
        enum: [...prescriptionWarningStatusValues],
      },
      warningCode: string,
      message: string,
      patientAllergyId: nullableObjectId,
      conflictingPrescriptionId: nullableObjectId,
      conflictingPrescriptionItemId: nullableObjectId,
      externalReferenceId: nullableString,
      detectedAt: date,
      detectedBy: objectId,
      acknowledgedAt: nullableDate,
      acknowledgedBy: nullableObjectId,
      acknowledgementReason: nullableString,
      overriddenAt: nullableDate,
      overriddenBy: nullableObjectId,
      overrideReason: nullableString,
      resolvedAt: nullableDate,
      resolvedBy: nullableObjectId,
      resolutionReason: nullableString,
      transactionId: string,
      correlationId: string,
    },
  ),

  prescriptionStatusHistories: validator(
    [
      'prescriptionId',
      'patientId',
      'sequence',
      'toStatus',
      'changeType',
      'changeSource',
      'encryptedSnapshot',
      'snapshotHash',
      'occurredAt',
      'changedBy',
      'transactionId',
      'correlationId',
    ],
    {
      prescriptionId: objectId,
      patientId: objectId,
      sequence: {
        ...number,
        minimum: 1,
      },
      fromStatus: {
        bsonType: [
          'string',
          'null',
        ],
        enum: [
          ...prescriptionStatusValues,
          null,
        ],
      },
      toStatus: {
        bsonType: 'string',
        enum: [...prescriptionStatusValues],
      },
      changeType: {
        bsonType: 'string',
        enum: [...prescriptionChangeTypeValues],
      },
      changeSource: {
        bsonType: 'string',
        enum: [...prescriptionStatusChangeSourceValues],
      },
      reason: nullableString,
      encryptedSnapshot,
      snapshotHash: string,
      signedBy: nullableObjectId,
      signatureMethod: {
        bsonType: [
          'string',
          'null',
        ],
        enum: [
          ...providerSignatureMethodValues,
          null,
        ],
      },
      signatureDigest: nullableString,
      occurredAt: date,
      changedBy: objectId,
      transactionId: string,
      correlationId: string,
    },
  ),
};

const models = {
  medicines: MedicineModel,
  medicineForms: MedicineFormModel,
  medicineRoutes: MedicineRouteModel,
  unitsOfMeasure: UnitOfMeasureModel,
  medicineStrengths: MedicineStrengthModel,
  prescriptionFrequencies: PrescriptionFrequencyModel,
  formularyItems: FormularyItemModel,
  prescriptions: PrescriptionModel,
  prescriptionItems: PrescriptionItemModel,
  prescriptionSafetyWarnings: PrescriptionSafetyWarningModel,
  prescriptionStatusHistories: PrescriptionStatusHistoryModel,
} as const;

async function ensureCollection(
  database: Db,
  name: FormularyPrescriptionCollection,
): Promise<void> {
  const exists =
    (
      await database
        .listCollections(
          {
            name,
          },
          {
            nameOnly: true,
          },
        )
        .toArray()
    ).length > 0;

  const validatorForCollection = formularyPrescriptionValidators[name];

  if (!exists) {
    await database.createCollection(name, {
      validator: validatorForCollection,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  } else {
    await database.command({
      collMod: name,
      validator: validatorForCollection,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  }

  const collection = database.collection(name);
  const existingIndexes = await collection.indexes();

  for (const index of existingIndexes) {
    if (index.name !== '_id_') {
      await collection.dropIndex(index.name);
    }
  }

  const indexes = models[name].schema.indexes() as IndexDescription[];

  if (indexes.length > 0) {
    await collection.createIndexes(indexes);
  }
}

export const formularyPrescriptionsFoundation: Migration = {
  id: '015-formulary-prescriptions-foundation',
  description:
    'Create standardized formulary, immutable prescription history, and prescription safety persistence',

  async up(database) {
    for (const name of formularyPrescriptionCollections) {
      const spec = collectionSpecs.find((candidate) => candidate.name === name);

      if (spec === undefined || !spec.facilityScoped) {
        throw new Error(`${name} must be cataloged as facility-scoped data`);
      }

      if (
        name === 'prescriptionStatusHistories' &&
        spec.retention !== 'immutable'
      ) {
        throw new Error(
          'prescriptionStatusHistories must be cataloged as immutable clinical data',
        );
      }

      await ensureCollection(database, name);
    }
  },
};