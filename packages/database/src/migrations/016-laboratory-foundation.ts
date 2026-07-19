import type {
  Db,
  IndexDescription,
} from 'mongodb';

import {
  collectionSpecs,
  type HospitalCollectionName,
} from '../catalog/collection-specs.js';

import {
  LabTestCategoryModel,
  LabTestModel,
} from '../models/laboratory-catalog.model.js';

import {
  LabOrderItemModel,
  LabOrderModel,
  LabOrderStatusHistoryModel,
} from '../models/laboratory-order.model.js';

import {
  LabSpecimenModel,
  LabSpecimenStatusHistoryModel,
} from '../models/laboratory-specimen.model.js';

import {
  LabResultModel,
  LabResultVersionModel,
} from '../models/laboratory-result.model.js';

import {
  LabCriticalResultCommunicationModel,
} from '../models/laboratory-critical-result-communication.model.js';

import {
  laboratoryBillingStatusValues,
  laboratoryCatalogStatusValues,
  laboratoryCommunicationChannelValues,
  laboratoryCommunicationRecipientTypeValues,
  laboratoryCriticalCommunicationTypeValues,
  laboratoryOrderItemStatusValues,
  laboratoryOrderPriorityValues,
  laboratoryOrderStatusChangeSourceValues,
  laboratoryOrderStatusValues,
  laboratoryReferenceRangeKindValues,
  laboratoryReferenceSexValues,
  laboratoryResultFlagValues,
  laboratoryResultPublicationStatusValues,
  laboratoryResultStatusValues,
  laboratoryResultValueTypeValues,
  laboratoryResultVersionChangeTypeValues,
  laboratorySpecimenCollectionMethodValues,
  laboratorySpecimenStatusChangeSourceValues,
  laboratorySpecimenStatusValues,
} from '../models/laboratory.types.js';

import type {
  Migration,
} from './types.js';

export const laboratoryCollections = [
  'labTestCategories',
  'labTests',
  'labOrders',
  'labOrderItems',
  'labOrderStatusHistories',
  'labSpecimens',
  'labSpecimenStatusHistories',
  'labResults',
  'labResultVersions',
  'labCriticalResultCommunications',
] as const satisfies readonly HospitalCollectionName[];

type LaboratoryCollection =
  (typeof laboratoryCollections)[number];

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

const mixed = {
  bsonType: [
    'object',
    'array',
    'string',
    'number',
    'bool',
    'date',
    'objectId',
    'decimal',
    'null',
  ],
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

const objectIdArray = {
  bsonType: 'array',
  items: objectId,
} as const;

const stringArray = {
  bsonType: 'array',
  items: string,
} as const;

const specimenRequirementSnapshot = {
  bsonType: 'object',
  required: [
    'requirementCode',
    'specimenTypeCode',
    'specimenTypeName',
    'fastingRequired',
    'preferred',
  ],
  additionalProperties: false,
  properties: {
    requirementCode: string,
    specimenTypeCode: string,
    specimenTypeName: string,
    containerCode: nullableString,
    containerName: nullableString,
    minimumVolume: nullableDecimal,
    volumeUnitCode: nullableString,
    fastingRequired: boolean,
    collectionInstructions: nullableString,
    handlingInstructions: nullableString,
    maximumTransportMinutes: nullableNumber,
    preferred: boolean,
  },
} as const;

const referenceRange = {
  bsonType: 'object',
  required: [
    'rangeCode',
    'kind',
    'sex',
    'codedValues',
  ],
  additionalProperties: false,
  properties: {
    rangeCode: string,
    kind: {
      bsonType: 'string',
      enum: [...laboratoryReferenceRangeKindValues],
    },
    sex: {
      bsonType: 'string',
      enum: [...laboratoryReferenceSexValues],
    },
    minimumAgeDays: nullableNumber,
    maximumAgeDays: nullableNumber,
    lowerBound: nullableDecimal,
    upperBound: nullableDecimal,
    criticalLowerBound: nullableDecimal,
    criticalUpperBound: nullableDecimal,
    textualReference: nullableString,
    codedValues: {
      bsonType: 'array',
      items: {
        bsonType: 'object',
        required: [
          'code',
          'display',
          'normal',
        ],
        additionalProperties: false,
        properties: {
          code: string,
          display: string,
          codingSystem: nullableString,
          normal: boolean,
        },
      },
    },
    notes: nullableString,
  },
} as const;

const resultComponentDefinition = {
  bsonType: 'object',
  required: [
    'componentCode',
    'name',
    'normalizedName',
    'valueType',
    'decimalScale',
    'referenceRanges',
    'required',
    'displayOrder',
  ],
  additionalProperties: false,
  properties: {
    componentCode: string,
    name: string,
    normalizedName: string,
    valueType: {
      bsonType: 'string',
      enum: [...laboratoryResultValueTypeValues],
    },
    unitCode: nullableString,
    unitName: nullableString,
    decimalScale: number,
    referenceRanges: {
      bsonType: 'array',
      items: referenceRange,
    },
    required: boolean,
    displayOrder: number,
    structuredSchemaKey: nullableString,
  },
} as const;

const resultComponentSnapshot = {
  bsonType: 'object',
  required: [
    'componentCode',
    'name',
    'valueType',
    'decimalScale',
    'required',
    'displayOrder',
    'referenceRangesSnapshot',
  ],
  additionalProperties: false,
  properties: {
    componentCode: string,
    name: string,
    valueType: {
      bsonType: 'string',
      enum: [...laboratoryResultValueTypeValues],
    },
    unitCode: nullableString,
    unitName: nullableString,
    decimalScale: number,
    required: boolean,
    displayOrder: number,
    referenceRangesSnapshot: {
      bsonType: 'array',
      items: mixed,
    },
    structuredSchemaKey: nullableString,
  },
} as const;

const resultComponent = {
  bsonType: 'object',
  required: [
    'componentCode',
    'componentNameSnapshot',
    'valueType',
    'flag',
    'displayOrder',
  ],
  additionalProperties: false,
  properties: {
    componentCode: string,
    componentNameSnapshot: string,
    valueType: {
      bsonType: 'string',
      enum: [...laboratoryResultValueTypeValues],
    },
    numericValue: nullableDecimal,
    textValue: nullableString,
    codedValue: {
      bsonType: [
        'object',
        'null',
      ],
    },
    qualitativeValue: nullableString,
    structuredValue: mixed,
    unitCodeSnapshot: nullableString,
    unitNameSnapshot: nullableString,
    referenceRangeSnapshot: {
      bsonType: [
        'object',
        'null',
      ],
    },
    flag: {
      bsonType: 'string',
      enum: [...laboratoryResultFlagValues],
    },
    interpretation: nullableString,
    displayOrder: number,
  },
} as const;

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

export const laboratoryValidators: Readonly<
  Record<LaboratoryCollection, Record<string, unknown>>
> = {
  labTestCategories: validator(
    [
      'categoryCode',
      'name',
      'normalizedName',
      'displayOrder',
      'status',
    ],
    {
      categoryCode: string,
      name: string,
      normalizedName: string,
      description: nullableString,
      displayOrder: number,
      status: {
        bsonType: 'string',
        enum: [...laboratoryCatalogStatusValues],
      },
      deactivatedAt: nullableDate,
      deactivatedBy: nullableObjectId,
      deactivationReason: nullableString,
    },
  ),

  labTests: validator(
    [
      'testCode',
      'name',
      'normalizedName',
      'aliases',
      'normalizedAliases',
      'categoryId',
      'categoryCodeSnapshot',
      'categoryNameSnapshot',
      'requiresSpecimen',
      'specimenRequirements',
      'components',
      'routineTurnaroundMinutes',
      'availableDepartmentIds',
      'orderable',
      'requiresResultValidation',
      'requiresResultVerification',
      'criticalNotificationRequired',
      'effectiveFrom',
      'status',
      'transactionId',
      'correlationId',
    ],
    {
      testCode: string,
      name: string,
      normalizedName: string,
      aliases: stringArray,
      normalizedAliases: stringArray,
      categoryId: objectId,
      categoryCodeSnapshot: string,
      categoryNameSnapshot: string,
      description: nullableString,
      methodCode: nullableString,
      methodName: nullableString,
      requiresSpecimen: boolean,
      specimenRequirements: {
        bsonType: 'array',
        items: specimenRequirementSnapshot,
      },
      components: {
        bsonType: 'array',
        items: resultComponentDefinition,
      },
      routineTurnaroundMinutes: number,
      urgentTurnaroundMinutes: nullableNumber,
      statTurnaroundMinutes: nullableNumber,
      availableDepartmentIds: objectIdArray,
      orderable: boolean,
      requiresResultValidation: boolean,
      requiresResultVerification: boolean,
      criticalNotificationRequired: boolean,
      chargeCatalogItemId: nullableObjectId,
      effectiveFrom: date,
      effectiveThrough: nullableDate,
      status: {
        bsonType: 'string',
        enum: [...laboratoryCatalogStatusValues],
      },
      deactivatedAt: nullableDate,
      deactivatedBy: nullableObjectId,
      deactivationReason: nullableString,
      transactionId: string,
      correlationId: string,
    },
  ),

  labOrders: validator(
    [
      'orderNumber',
      'patientId',
      'requestedPatientId',
      'canonicalRedirected',
      'encounterId',
      'departmentId',
      'orderingProviderId',
      'priority',
      'status',
      'clinicalIndication',
      'orderedAt',
      'itemCount',
      'activeItemCount',
      'collectedItemCount',
      'completedItemCount',
      'verifiedItemCount',
      'rejectedItemCount',
      'criticalResultCount',
      'lastStatusChangedAt',
      'lastStatusChangedBy',
      'transactionId',
      'correlationId',
    ],
    {
      orderNumber: string,
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
      orderingProviderId: objectId,
      priority: {
        bsonType: 'string',
        enum: [...laboratoryOrderPriorityValues],
      },
      status: {
        bsonType: 'string',
        enum: [...laboratoryOrderStatusValues],
      },
      clinicalIndication: string,
      orderingNotes: nullableString,
      orderedAt: date,
      acceptedAt: nullableDate,
      acceptedBy: nullableObjectId,
      collectionCompletedAt: nullableDate,
      processingStartedAt: nullableDate,
      completedAt: nullableDate,
      verifiedAt: nullableDate,
      cancelledAt: nullableDate,
      cancelledBy: nullableObjectId,
      cancellationReason: nullableString,
      itemCount: number,
      activeItemCount: number,
      collectedItemCount: number,
      completedItemCount: number,
      verifiedItemCount: number,
      rejectedItemCount: number,
      criticalResultCount: number,
      lastStatusChangedAt: date,
      lastStatusChangedBy: objectId,
      transactionId: string,
      correlationId: string,
    },
  ),

  labOrderItems: validator(
    [
      'labOrderId',
      'patientId',
      'encounterId',
      'sequence',
      'labTestId',
      'testCodeSnapshot',
      'testNameSnapshot',
      'categoryCodeSnapshot',
      'categoryNameSnapshot',
      'requiresSpecimen',
      'specimenRequirementsSnapshot',
      'resultComponentsSnapshot',
      'testDefinitionHash',
      'turnaroundMinutes',
      'dueAt',
      'status',
      'specimenCount',
      'recollectionCount',
      'billingStatus',
      'transactionId',
      'correlationId',
    ],
    {
      labOrderId: objectId,
      patientId: objectId,
      encounterId: objectId,
      sequence: number,
      labTestId: objectId,
      testCodeSnapshot: string,
      testNameSnapshot: string,
      categoryCodeSnapshot: string,
      categoryNameSnapshot: string,
      methodCodeSnapshot: nullableString,
      methodNameSnapshot: nullableString,
      requiresSpecimen: boolean,
      specimenRequirementsSnapshot: {
        bsonType: 'array',
        items: specimenRequirementSnapshot,
      },
      resultComponentsSnapshot: {
        bsonType: 'array',
        items: resultComponentSnapshot,
      },
      testDefinitionHash: string,
      turnaroundMinutes: number,
      dueAt: date,
      status: {
        bsonType: 'string',
        enum: [...laboratoryOrderItemStatusValues],
      },
      activeSpecimenId: nullableObjectId,
      specimenCount: number,
      recollectionCount: number,
      resultId: nullableObjectId,
      acceptedAt: nullableDate,
      acceptedBy: nullableObjectId,
      processingStartedAt: nullableDate,
      completedAt: nullableDate,
      verifiedAt: nullableDate,
      rejectedAt: nullableDate,
      rejectedBy: nullableObjectId,
      rejectionReasonCode: nullableString,
      rejectionReason: nullableString,
      cancelledAt: nullableDate,
      cancelledBy: nullableObjectId,
      cancellationReason: nullableString,
      chargeCatalogItemId: nullableObjectId,
      accountChargeId: nullableObjectId,
      billingStatus: {
        bsonType: 'string',
        enum: [...laboratoryBillingStatusValues],
      },
      billingFailureCode: nullableString,
      transactionId: string,
      correlationId: string,
    },
  ),

  labOrderStatusHistories: validator(
    [
      'labOrderId',
      'patientId',
      'encounterId',
      'sequence',
      'toStatus',
      'changeSource',
      'occurredAt',
      'changedBy',
      'transactionId',
      'correlationId',
    ],
    {
      labOrderId: objectId,
      patientId: objectId,
      encounterId: objectId,
      sequence: number,
      fromStatus: {
        bsonType: [
          'string',
          'null',
        ],
        enum: [
          ...laboratoryOrderStatusValues,
          null,
        ],
      },
      toStatus: {
        bsonType: 'string',
        enum: [...laboratoryOrderStatusValues],
      },
      changeSource: {
        bsonType: 'string',
        enum: [...laboratoryOrderStatusChangeSourceValues],
      },
      reasonCode: nullableString,
      reason: nullableString,
      occurredAt: date,
      changedBy: objectId,
      transactionId: string,
      correlationId: string,
    },
  ),

  labSpecimens: validator(
    [
      'accessionNumber',
      'specimenIdentifier',
      'labelCode',
      'labOrderId',
      'labOrderItemIds',
      'patientId',
      'encounterId',
      'requirementCodeSnapshot',
      'specimenTypeCodeSnapshot',
      'specimenTypeNameSnapshot',
      'status',
      'labelPrintCount',
      'collectionAttempt',
      'lastStatusChangedAt',
      'lastStatusChangedBy',
      'transactionId',
      'correlationId',
    ],
    {
      accessionNumber: string,
      specimenIdentifier: string,
      labelCode: string,
      labOrderId: objectId,
      labOrderItemIds: objectIdArray,
      patientId: objectId,
      encounterId: objectId,
      requirementCodeSnapshot: string,
      specimenTypeCodeSnapshot: string,
      specimenTypeNameSnapshot: string,
      containerCodeSnapshot: nullableString,
      containerNameSnapshot: nullableString,
      expectedMinimumVolume: nullableDecimal,
      expectedVolumeUnitCode: nullableString,
      collectedVolume: nullableDecimal,
      collectedVolumeUnitCode: nullableString,
      collectionMethod: {
        bsonType: [
          'string',
          'null',
        ],
        enum: [
          ...laboratorySpecimenCollectionMethodValues,
          null,
        ],
      },
      collectionSite: nullableString,
      status: {
        bsonType: 'string',
        enum: [...laboratorySpecimenStatusValues],
      },
      labelPrintCount: number,
      labelPrintedAt: nullableDate,
      labelPrintedBy: nullableObjectId,
      collectedAt: nullableDate,
      collectedBy: nullableObjectId,
      collectorStaffId: nullableObjectId,
      receivedAt: nullableDate,
      receivedBy: nullableObjectId,
      processingStartedAt: nullableDate,
      processingStartedBy: nullableObjectId,
      completedAt: nullableDate,
      completedBy: nullableObjectId,
      rejectedAt: nullableDate,
      rejectedBy: nullableObjectId,
      rejectionReasonCode: nullableString,
      rejectionReason: nullableString,
      recollectionRequestedAt: nullableDate,
      recollectionRequestedBy: nullableObjectId,
      recollectionReason: nullableString,
      recollectionOfSpecimenId: nullableObjectId,
      replacementSpecimenId: nullableObjectId,
      collectionAttempt: number,
      cancelledAt: nullableDate,
      cancelledBy: nullableObjectId,
      cancellationReason: nullableString,
      lastStatusChangedAt: date,
      lastStatusChangedBy: objectId,
      transactionId: string,
      correlationId: string,
    },
  ),

  labSpecimenStatusHistories: validator(
    [
      'labSpecimenId',
      'labOrderId',
      'patientId',
      'encounterId',
      'sequence',
      'toStatus',
      'changeSource',
      'stateHash',
      'occurredAt',
      'changedBy',
      'transactionId',
      'correlationId',
    ],
    {
      labSpecimenId: objectId,
      labOrderId: objectId,
      patientId: objectId,
      encounterId: objectId,
      sequence: number,
      fromStatus: {
        bsonType: [
          'string',
          'null',
        ],
        enum: [
          ...laboratorySpecimenStatusValues,
          null,
        ],
      },
      toStatus: {
        bsonType: 'string',
        enum: [...laboratorySpecimenStatusValues],
      },
      changeSource: {
        bsonType: 'string',
        enum: [...laboratorySpecimenStatusChangeSourceValues],
      },
      reasonCode: nullableString,
      reason: nullableString,
      stateHash: string,
      occurredAt: date,
      changedBy: objectId,
      transactionId: string,
      correlationId: string,
    },
  ),

  labResults: validator(
    [
      'resultNumber',
      'labOrderId',
      'labOrderItemId',
      'labTestId',
      'patientId',
      'encounterId',
      'testCodeSnapshot',
      'testNameSnapshot',
      'status',
      'components',
      'overallFlag',
      'criticalComponentCount',
      'unresolvedCriticalComponentCount',
      'currentVersion',
      'publicationStatus',
      'transactionId',
      'correlationId',
    ],
    {
      resultNumber: string,
      labOrderId: objectId,
      labOrderItemId: objectId,
      labTestId: objectId,
      specimenId: nullableObjectId,
      patientId: objectId,
      encounterId: objectId,
      testCodeSnapshot: string,
      testNameSnapshot: string,
      methodCodeSnapshot: nullableString,
      methodNameSnapshot: nullableString,
      status: {
        bsonType: 'string',
        enum: [...laboratoryResultStatusValues],
      },
      components: {
        bsonType: 'array',
        items: resultComponent,
      },
      overallFlag: {
        bsonType: 'string',
        enum: [...laboratoryResultFlagValues],
      },
      criticalComponentCount: number,
      unresolvedCriticalComponentCount: number,
      conclusion: nullableString,
      technicalNotes: nullableString,
      enteredAt: nullableDate,
      enteredBy: nullableObjectId,
      technicianStaffId: nullableObjectId,
      validatedAt: nullableDate,
      validatedBy: nullableObjectId,
      validatorStaffId: nullableObjectId,
      verifiedAt: nullableDate,
      verifiedBy: nullableObjectId,
      verifierStaffId: nullableObjectId,
      currentVersion: number,
      latestVersionId: nullableObjectId,
      correctedAt: nullableDate,
      correctedBy: nullableObjectId,
      correctionReason: nullableString,
      supersedesResultVersionId: nullableObjectId,
      cancelledAt: nullableDate,
      cancelledBy: nullableObjectId,
      cancellationReason: nullableString,
      publicationStatus: {
        bsonType: 'string',
        enum: [...laboratoryResultPublicationStatusValues],
      },
      publishedAt: nullableDate,
      publishedBy: nullableObjectId,
      withdrawnAt: nullableDate,
      withdrawnBy: nullableObjectId,
      withdrawalReason: nullableString,
      transactionId: string,
      correlationId: string,
    },
  ),

  labResultVersions: validator(
    [
      'labResultId',
      'labOrderId',
      'labOrderItemId',
      'patientId',
      'encounterId',
      'versionNumber',
      'changeType',
      'statusSnapshot',
      'overallFlagSnapshot',
      'criticalComponentCountSnapshot',
      'encryptedSnapshot',
      'snapshotHash',
      'contentHash',
      'technicianStaffId',
      'validatorStaffId',
      'verifierStaffId',
      'recordedAt',
      'recordedBy',
      'transactionId',
      'correlationId',
    ],
    {
      labResultId: objectId,
      labOrderId: objectId,
      labOrderItemId: objectId,
      patientId: objectId,
      encounterId: objectId,
      versionNumber: number,
      previousVersionId: nullableObjectId,
      changeType: {
        bsonType: 'string',
        enum: [...laboratoryResultVersionChangeTypeValues],
      },
      statusSnapshot: {
        bsonType: 'string',
        enum: [...laboratoryResultStatusValues],
      },
      overallFlagSnapshot: {
        bsonType: 'string',
        enum: [...laboratoryResultFlagValues],
      },
      criticalComponentCountSnapshot: number,
      encryptedSnapshot,
      snapshotHash: string,
      contentHash: string,
      changeReason: nullableString,
      technicianStaffId: objectId,
      validatorStaffId: objectId,
      verifierStaffId: objectId,
      recordedAt: date,
      recordedBy: objectId,
      transactionId: string,
      correlationId: string,
    },
  ),

  labCriticalResultCommunications: validator(
    [
      'labResultId',
      'labResultVersionId',
      'labOrderId',
      'patientId',
      'encounterId',
      'sequence',
      'componentCodeSnapshot',
      'resultFlagSnapshot',
      'communicationType',
      'channel',
      'recipientType',
      'recipientDisplaySnapshot',
      'occurredAt',
      'performedBy',
      'transactionId',
      'correlationId',
    ],
    {
      labResultId: objectId,
      labResultVersionId: objectId,
      labOrderId: objectId,
      patientId: objectId,
      encounterId: objectId,
      sequence: number,
      componentCodeSnapshot: string,
      resultFlagSnapshot: {
        bsonType: 'string',
        enum: [
          'CRITICAL',
          'CRITICAL_HIGH',
          'CRITICAL_LOW',
        ],
      },
      communicationType: {
        bsonType: 'string',
        enum: [...laboratoryCriticalCommunicationTypeValues],
      },
      channel: {
        bsonType: 'string',
        enum: [...laboratoryCommunicationChannelValues],
      },
      recipientType: {
        bsonType: 'string',
        enum: [...laboratoryCommunicationRecipientTypeValues],
      },
      recipientUserId: nullableObjectId,
      recipientStaffId: nullableObjectId,
      recipientDisplaySnapshot: string,
      communicationNotes: nullableString,
      occurredAt: date,
      performedBy: objectId,
      acknowledgedAt: nullableDate,
      acknowledgedBy: nullableObjectId,
      acknowledgementNotes: nullableString,
      transactionId: string,
      correlationId: string,
    },
  ),
};

const models = {
  labTestCategories: LabTestCategoryModel,
  labTests: LabTestModel,
  labOrders: LabOrderModel,
  labOrderItems: LabOrderItemModel,
  labOrderStatusHistories: LabOrderStatusHistoryModel,
  labSpecimens: LabSpecimenModel,
  labSpecimenStatusHistories: LabSpecimenStatusHistoryModel,
  labResults: LabResultModel,
  labResultVersions: LabResultVersionModel,
  labCriticalResultCommunications: LabCriticalResultCommunicationModel,
} as const;

async function ensureCollection(
  database: Db,
  name: LaboratoryCollection,
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

  const validatorForCollection = laboratoryValidators[name];

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

export const laboratoryFoundation: Migration = {
  id: '016-laboratory-foundation',
  description:
    'Create laboratory catalog, orders, specimens, immutable result versions, and critical-result communication persistence',

  async up(database) {
    const immutableCollections = new Set<LaboratoryCollection>([
      'labOrderStatusHistories',
      'labSpecimenStatusHistories',
      'labResultVersions',
      'labCriticalResultCommunications',
    ]);

    for (const name of laboratoryCollections) {
      const spec = collectionSpecs.find((candidate) => candidate.name === name);

      if (
        spec === undefined ||
        !spec.facilityScoped ||
        spec.domain !== 'laboratory'
      ) {
        throw new Error(
          `${name} must be cataloged as facility-scoped laboratory data`,
        );
      }

      if (
        immutableCollections.has(name) &&
        spec.retention !== 'immutable'
      ) {
        throw new Error(`${name} must be cataloged as immutable data`);
      }

      await ensureCollection(database, name);
    }
  },
};