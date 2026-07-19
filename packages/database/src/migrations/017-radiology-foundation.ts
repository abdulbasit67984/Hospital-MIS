import type {
  Db,
  IndexDescription,
} from 'mongodb';

import {
  collectionSpecs,
  type HospitalCollectionName,
} from '../catalog/collection-specs.js';

import {
  RadiologyModalityModel,
  RadiologyProcedureModel,
} from '../models/radiology-catalog.model.js';

import {
  RadiologyOrderItemModel,
  RadiologyOrderItemStatusHistoryModel,
  RadiologyOrderModel,
  RadiologyOrderStatusHistoryModel,
} from '../models/radiology-order.model.js';

import {
  radiologyBillingStatusValues,
  radiologyCatalogStatusValues,
  radiologyContrastRequirementValues,
  radiologyContrastRouteValues,
  radiologyLateralityRequirementValues,
  radiologyLateralityValues,
  radiologyModalityTypeValues,
  radiologyOrderItemStatusValues,
  radiologyOrderPriorityValues,
  radiologyOrderStatusChangeSourceValues,
  radiologyOrderStatusValues,
  radiologyPreparationStatusValues,
  radiologySafetyRequirementValues,
  radiologySafetyScreeningStatusValues,
} from '../models/radiology.types.js';

import type {
  Migration,
} from './types.js';

export const radiologyCollections = [
  'radiologyModalities',
  'radiologyProcedures',
  'radiologyOrders',
  'radiologyOrderItems',
  'radiologyOrderStatusHistories',
  'radiologyOrderItemStatusHistories',
] as const satisfies readonly HospitalCollectionName[];

type RadiologyCollection =
  (typeof radiologyCollections)[number];

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

const boolean = {
  bsonType: 'bool',
} as const;

const objectIdArray = {
  bsonType: 'array',
  items: objectId,
} as const;

const stringArray = {
  bsonType: 'array',
  items: string,
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

const bodyRegionSnapshot = {
  bsonType: 'object',
  required: [
    'code',
    'name',
  ],
  additionalProperties: false,
  properties: {
    code: string,
    name: string,
  },
} as const;

const procedureDefinitionSnapshot = {
  bsonType: 'object',
  required: [
    'procedureId',
    'procedureVersion',
    'procedureCode',
    'procedureName',
    'modalityId',
    'modalityCode',
    'modalityName',
    'modalityType',
    'dicomModalityCode',
    'bodyRegions',
    'lateralityRequirement',
    'permittedLateralities',
    'contrastRequirement',
    'permittedContrastRoutes',
    'preparationInstructions',
    'contraindications',
    'safetyScreeningRequirements',
    'expectedDurationMinutes',
    'routineTurnaroundMinutes',
    'availableDepartmentIds',
    'schedulingRequired',
    'requiresTechnician',
    'requiresRadiologist',
    'effectiveFrom',
    'capturedAt',
  ],
  additionalProperties: false,
  properties: {
    procedureId: objectId,
    procedureVersion: number,
    procedureCode: string,
    procedureName: string,
    description: nullableString,
    modalityId: objectId,
    modalityCode: string,
    modalityName: string,
    modalityType: {
      bsonType: 'string',
      enum: [...radiologyModalityTypeValues],
    },
    dicomModalityCode: string,
    bodyRegions: {
      bsonType: 'array',
      items: bodyRegionSnapshot,
    },
    lateralityRequirement: {
      bsonType: 'string',
      enum: [...radiologyLateralityRequirementValues],
    },
    permittedLateralities: {
      bsonType: 'array',
      items: {
        bsonType: 'string',
        enum: [...radiologyLateralityValues],
      },
    },
    contrastRequirement: {
      bsonType: 'string',
      enum: [...radiologyContrastRequirementValues],
    },
    permittedContrastRoutes: {
      bsonType: 'array',
      items: {
        bsonType: 'string',
        enum: [...radiologyContrastRouteValues],
      },
    },
    preparationInstructions: stringArray,
    contraindications: stringArray,
    safetyScreeningRequirements: {
      bsonType: 'array',
      items: {
        bsonType: 'string',
        enum: [...radiologySafetyRequirementValues],
      },
    },
    expectedDurationMinutes: number,
    routineTurnaroundMinutes: number,
    urgentTurnaroundMinutes: nullableNumber,
    statTurnaroundMinutes: nullableNumber,
    availableDepartmentIds: objectIdArray,
    schedulingRequired: boolean,
    requiresTechnician: boolean,
    requiresRadiologist: boolean,
    chargeCatalogItemId: nullableObjectId,
    effectiveFrom: date,
    effectiveThrough: nullableDate,
    capturedAt: date,
  },
} as const;

export const radiologyValidators: Readonly<
  Record<RadiologyCollection, Record<string, unknown>>
> = {
  radiologyModalities: validator(
    [
      'modalityCode',
      'name',
      'normalizedName',
      'modalityType',
      'dicomModalityCode',
      'availableDepartmentIds',
      'supportsContrast',
      'supportsPacsIntegration',
      'orderable',
      'effectiveFrom',
      'status',
      'transactionId',
      'correlationId',
    ],
    {
      modalityCode: string,
      name: string,
      normalizedName: string,
      modalityType: {
        bsonType: 'string',
        enum: [...radiologyModalityTypeValues],
      },
      dicomModalityCode: string,
      description: nullableString,
      availableDepartmentIds: objectIdArray,
      supportsContrast: boolean,
      supportsPacsIntegration: boolean,
      pacsRoutingCode: nullableString,
      orderable: boolean,
      effectiveFrom: date,
      effectiveThrough: nullableDate,
      status: {
        bsonType: 'string',
        enum: [...radiologyCatalogStatusValues],
      },
      deactivatedAt: nullableDate,
      deactivatedBy: nullableObjectId,
      deactivationReason: nullableString,
      transactionId: string,
      correlationId: string,
    },
  ),

  radiologyProcedures: validator(
    [
      'procedureCode',
      'name',
      'normalizedName',
      'aliases',
      'normalizedAliases',
      'modalityId',
      'modalityCodeSnapshot',
      'modalityNameSnapshot',
      'modalityTypeSnapshot',
      'dicomModalityCodeSnapshot',
      'bodyRegions',
      'lateralityRequirement',
      'permittedLateralities',
      'contrastRequirement',
      'permittedContrastRoutes',
      'preparationInstructions',
      'contraindications',
      'safetyScreeningRequirements',
      'expectedDurationMinutes',
      'routineTurnaroundMinutes',
      'availableDepartmentIds',
      'schedulingRequired',
      'requiresTechnician',
      'requiresRadiologist',
      'orderable',
      'effectiveFrom',
      'status',
      'transactionId',
      'correlationId',
    ],
    {
      procedureCode: string,
      name: string,
      normalizedName: string,
      aliases: stringArray,
      normalizedAliases: stringArray,
      description: nullableString,
      modalityId: objectId,
      modalityCodeSnapshot: string,
      modalityNameSnapshot: string,
      modalityTypeSnapshot: {
        bsonType: 'string',
        enum: [...radiologyModalityTypeValues],
      },
      dicomModalityCodeSnapshot: string,
      bodyRegions: {
        bsonType: 'array',
        items: bodyRegionSnapshot,
      },
      lateralityRequirement: {
        bsonType: 'string',
        enum: [...radiologyLateralityRequirementValues],
      },
      permittedLateralities: {
        bsonType: 'array',
        items: {
          bsonType: 'string',
          enum: [...radiologyLateralityValues],
        },
      },
      contrastRequirement: {
        bsonType: 'string',
        enum: [...radiologyContrastRequirementValues],
      },
      permittedContrastRoutes: {
        bsonType: 'array',
        items: {
          bsonType: 'string',
          enum: [...radiologyContrastRouteValues],
        },
      },
      preparationInstructions: stringArray,
      contraindications: stringArray,
      safetyScreeningRequirements: {
        bsonType: 'array',
        items: {
          bsonType: 'string',
          enum: [...radiologySafetyRequirementValues],
        },
      },
      expectedDurationMinutes: number,
      routineTurnaroundMinutes: number,
      urgentTurnaroundMinutes: nullableNumber,
      statTurnaroundMinutes: nullableNumber,
      availableDepartmentIds: objectIdArray,
      schedulingRequired: boolean,
      requiresTechnician: boolean,
      requiresRadiologist: boolean,
      orderable: boolean,
      chargeCatalogItemId: nullableObjectId,
      effectiveFrom: date,
      effectiveThrough: nullableDate,
      status: {
        bsonType: 'string',
        enum: [...radiologyCatalogStatusValues],
      },
      deactivatedAt: nullableDate,
      deactivatedBy: nullableObjectId,
      deactivationReason: nullableString,
      transactionId: string,
      correlationId: string,
    },
  ),

  radiologyOrders: validator(
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
      'scheduledItemCount',
      'completedItemCount',
      'reportedItemCount',
      'verifiedItemCount',
      'rejectedItemCount',
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
        enum: [...radiologyOrderPriorityValues],
      },
      status: {
        bsonType: 'string',
        enum: [...radiologyOrderStatusValues],
      },
      clinicalIndication: string,
      orderingNotes: nullableString,
      orderedAt: date,
      acceptedAt: nullableDate,
      acceptedBy: nullableObjectId,
      scheduledAt: nullableDate,
      checkedInAt: nullableDate,
      examinationStartedAt: nullableDate,
      examinationCompletedAt: nullableDate,
      verifiedAt: nullableDate,
      rejectedAt: nullableDate,
      rejectedBy: nullableObjectId,
      rejectionReasonCode: nullableString,
      rejectionReason: nullableString,
      cancelledAt: nullableDate,
      cancelledBy: nullableObjectId,
      cancellationReason: nullableString,
      itemCount: number,
      activeItemCount: number,
      scheduledItemCount: number,
      completedItemCount: number,
      reportedItemCount: number,
      verifiedItemCount: number,
      rejectedItemCount: number,
      lastStatusChangedAt: date,
      lastStatusChangedBy: objectId,
      transactionId: string,
      correlationId: string,
    },
  ),

  radiologyOrderItems: validator(
    [
      'radiologyOrderId',
      'patientId',
      'encounterId',
      'sequence',
      'radiologyProcedureId',
      'procedureDefinitionSnapshot',
      'procedureDefinitionHash',
      'requestedLaterality',
      'contrastRequested',
      'priority',
      'status',
      'orderedAt',
      'dueAt',
      'preparationStatus',
      'safetyScreeningStatus',
      'billingStatus',
      'transactionId',
      'correlationId',
    ],
    {
      radiologyOrderId: objectId,
      patientId: objectId,
      encounterId: objectId,
      sequence: number,
      radiologyProcedureId: objectId,
      procedureDefinitionSnapshot,
      procedureDefinitionHash: string,
      requestedLaterality: {
        bsonType: 'string',
        enum: [...radiologyLateralityValues],
      },
      contrastRequested: boolean,
      requestedContrastRoute: {
        bsonType: [
          'string',
          'null',
        ],
        enum: [
          ...radiologyContrastRouteValues,
          null,
        ],
      },
      specialInstructions: nullableString,
      priority: {
        bsonType: 'string',
        enum: [...radiologyOrderPriorityValues],
      },
      status: {
        bsonType: 'string',
        enum: [...radiologyOrderItemStatusValues],
      },
      orderedAt: date,
      dueAt: date,
      preparationStatus: {
        bsonType: 'string',
        enum: [...radiologyPreparationStatusValues],
      },
      safetyScreeningStatus: {
        bsonType: 'string',
        enum: [...radiologySafetyScreeningStatusValues],
      },
      appointmentId: nullableObjectId,
      imagingStudyId: nullableObjectId,
      reportId: nullableObjectId,
      accessionNumber: nullableString,
      externalStudyIdentifier: nullableString,
      acceptedAt: nullableDate,
      acceptedBy: nullableObjectId,
      scheduledAt: nullableDate,
      checkedInAt: nullableDate,
      examinationStartedAt: nullableDate,
      examinationCompletedAt: nullableDate,
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
        enum: [...radiologyBillingStatusValues],
      },
      billingFailureCode: nullableString,
      transactionId: string,
      correlationId: string,
    },
  ),

  radiologyOrderStatusHistories: validator(
    [
      'radiologyOrderId',
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
      radiologyOrderId: objectId,
      patientId: objectId,
      encounterId: objectId,
      sequence: number,
      fromStatus: {
        bsonType: [
          'string',
          'null',
        ],
        enum: [
          ...radiologyOrderStatusValues,
          null,
        ],
      },
      toStatus: {
        bsonType: 'string',
        enum: [...radiologyOrderStatusValues],
      },
      changeSource: {
        bsonType: 'string',
        enum: [...radiologyOrderStatusChangeSourceValues],
      },
      reasonCode: nullableString,
      reason: nullableString,
      occurredAt: date,
      changedBy: objectId,
      transactionId: string,
      correlationId: string,
    },
  ),

  radiologyOrderItemStatusHistories: validator(
    [
      'radiologyOrderId',
      'radiologyOrderItemId',
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
      radiologyOrderId: objectId,
      radiologyOrderItemId: objectId,
      patientId: objectId,
      encounterId: objectId,
      sequence: number,
      fromStatus: {
        bsonType: [
          'string',
          'null',
        ],
        enum: [
          ...radiologyOrderItemStatusValues,
          null,
        ],
      },
      toStatus: {
        bsonType: 'string',
        enum: [...radiologyOrderItemStatusValues],
      },
      changeSource: {
        bsonType: 'string',
        enum: [...radiologyOrderStatusChangeSourceValues],
      },
      reasonCode: nullableString,
      reason: nullableString,
      occurredAt: date,
      changedBy: objectId,
      transactionId: string,
      correlationId: string,
    },
  ),
};

const models = {
  radiologyModalities: RadiologyModalityModel,
  radiologyProcedures: RadiologyProcedureModel,
  radiologyOrders: RadiologyOrderModel,
  radiologyOrderItems: RadiologyOrderItemModel,
  radiologyOrderStatusHistories: RadiologyOrderStatusHistoryModel,
  radiologyOrderItemStatusHistories:
    RadiologyOrderItemStatusHistoryModel,
} as const;

async function ensureCollection(
  database: Db,
  name: RadiologyCollection,
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

  const validatorForCollection = radiologyValidators[name];

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

export const radiologyFoundation: Migration = {
  id: '017-radiology-foundation',
  description:
    'Create facility-scoped radiology modality, procedure, encounter-linked order, immutable procedure snapshot, and lifecycle-history persistence',

  async up(database) {
    const immutableCollections = new Set<RadiologyCollection>([
      'radiologyOrderStatusHistories',
      'radiologyOrderItemStatusHistories',
    ]);

    for (const name of radiologyCollections) {
      const spec = collectionSpecs.find((candidate) => candidate.name === name);

      if (
        spec === undefined ||
        !spec.facilityScoped ||
        spec.domain !== 'radiology'
      ) {
        throw new Error(
          `${name} must be cataloged as facility-scoped radiology data`,
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