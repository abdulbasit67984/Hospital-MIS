import type {
  Db,
  IndexDescription,
} from 'mongodb';

import {
  collectionSpecs,
  type HospitalCollectionName,
} from '../catalog/collection-specs.js';

import {
  RadiologyAppointmentModel,
  RadiologyExaminationModel,
  RadiologyImagingSeriesModel,
  RadiologyImagingStudyModel,
  RadiologyResourceModel,
  RadiologyResourceReservationModel,
  RadiologySafetyScreeningModel,
  radiologyAppointmentStatusValues,
  radiologyExaminationStatusValues,
  radiologyExternalSystemTypeValues,
  radiologyImagingStudyStatusValues,
  radiologyReservationStatusValues,
  radiologyReservationSubjectTypeValues,
  radiologyResourceStatusValues,
  radiologyResourceTypeValues,
  radiologyScreeningResponseValues,
} from '../models/radiology-operations.model.js';

import {
  radiologyLateralityValues,
  radiologyPreparationStatusValues,
  radiologySafetyScreeningStatusValues,
} from '../models/radiology.types.js';

import type {
  Migration,
} from './types.js';

export const radiologyImagingOperationCollections = [
  'radiologyResources',
  'radiologyAppointments',
  'radiologyResourceReservations',
  'radiologySafetyScreenings',
  'radiologyExaminations',
  'radiologyImagingStudies',
  'radiologyImagingSeries',
] as const satisfies readonly HospitalCollectionName[];

type RadiologyImagingOperationCollection =
  (typeof radiologyImagingOperationCollections)[number];

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

const nullableDecimal = {
  bsonType: [
    'decimal',
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
  transactionId: string,
  correlationId: string,
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
  'transactionId',
  'correlationId',
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

const screeningResponse = {
  bsonType: 'object',
  required: [
    'requirementCode',
    'response',
  ],
  additionalProperties: false,
  properties: {
    requirementCode: string,
    response: {
      bsonType: 'string',
      enum: [...radiologyScreeningResponseValues],
    },
    details: nullableString,
  },
} as const;

const externalReference = {
  bsonType: 'object',
  required: [
    'systemType',
    'systemName',
    'endpointAlias',
    'externalStudyId',
  ],
  additionalProperties: false,
  properties: {
    systemType: {
      bsonType: 'string',
      enum: [...radiologyExternalSystemTypeValues],
    },
    systemName: string,
    endpointAlias: string,
    externalStudyId: string,
    viewerReference: nullableString,
  },
} as const;

export const radiologyImagingOperationValidators: Readonly<
  Record<
    RadiologyImagingOperationCollection,
    Record<string, unknown>
  >
> = {
  radiologyResources: validator(
    [
      'resourceCode',
      'name',
      'normalizedName',
      'resourceType',
      'departmentId',
      'modalityIds',
      'capabilities',
      'status',
      'effectiveFrom',
    ],
    {
      resourceCode: string,
      name: string,
      normalizedName: string,
      resourceType: {
        bsonType: 'string',
        enum: [...radiologyResourceTypeValues],
      },
      departmentId: objectId,
      modalityIds: objectIdArray,
      location: nullableString,
      capabilities: stringArray,
      manufacturer: nullableString,
      modelName: nullableString,
      serialNumber: nullableString,
      externalResourceReference: nullableString,
      status: {
        bsonType: 'string',
        enum: [...radiologyResourceStatusValues],
      },
      effectiveFrom: date,
      effectiveThrough: nullableDate,
      deactivatedAt: nullableDate,
      deactivatedBy: nullableObjectId,
      deactivationReason: nullableString,
    },
  ),

  radiologyAppointments: validator(
    [
      'radiologyOrderId',
      'radiologyOrderItemId',
      'patientId',
      'encounterId',
      'procedureId',
      'modalityId',
      'departmentId',
      'scheduledStartAt',
      'scheduledEndAt',
      'timezone',
      'equipmentResourceIds',
      'technicianStaffIds',
      'preparationStatus',
      'safetyScreeningStatus',
      'status',
      'scheduledByStaffId',
      'scheduledAt',
    ],
    {
      radiologyOrderId: objectId,
      radiologyOrderItemId: objectId,
      patientId: objectId,
      encounterId: objectId,
      procedureId: objectId,
      modalityId: objectId,
      departmentId: objectId,
      scheduledStartAt: date,
      scheduledEndAt: date,
      timezone: string,
      roomResourceId: nullableObjectId,
      equipmentResourceIds: objectIdArray,
      technicianStaffIds: objectIdArray,
      preparationStatus: {
        bsonType: 'string',
        enum: [...radiologyPreparationStatusValues],
      },
      safetyScreeningStatus: {
        bsonType: 'string',
        enum: [...radiologySafetyScreeningStatusValues],
      },
      status: {
        bsonType: 'string',
        enum: [...radiologyAppointmentStatusValues],
      },
      scheduledByStaffId: objectId,
      scheduledAt: date,
      checkedInAt: nullableDate,
      checkedInByStaffId: nullableObjectId,
      cancelledAt: nullableDate,
      cancelledByStaffId: nullableObjectId,
      cancellationReason: nullableString,
    },
  ),

  radiologyResourceReservations: validator(
    [
      'appointmentId',
      'radiologyOrderItemId',
      'subjectType',
      'reservedStartAt',
      'reservedEndAt',
      'status',
    ],
    {
      appointmentId: objectId,
      radiologyOrderItemId: objectId,
      subjectType: {
        bsonType: 'string',
        enum: [...radiologyReservationSubjectTypeValues],
      },
      resourceId: nullableObjectId,
      staffId: nullableObjectId,
      reservedStartAt: date,
      reservedEndAt: date,
      status: {
        bsonType: 'string',
        enum: [...radiologyReservationStatusValues],
      },
      releasedAt: nullableDate,
      releasedByStaffId: nullableObjectId,
    },
  ),

  radiologySafetyScreenings: validator(
    [
      'radiologyOrderId',
      'radiologyOrderItemId',
      'patientId',
      'encounterId',
      'requiredScreeningCodesSnapshot',
      'requirementsHash',
      'responses',
      'pregnancyStatus',
      'contrastAllergyStatus',
      'renalRiskStatus',
      'implantDeviceStatus',
      'status',
      'preparationStatus',
      'conditions',
      'screenedAt',
      'screenedByStaffId',
    ],
    {
      radiologyOrderId: objectId,
      radiologyOrderItemId: objectId,
      appointmentId: nullableObjectId,
      patientId: objectId,
      encounterId: objectId,
      requiredScreeningCodesSnapshot: stringArray,
      requirementsHash: string,
      responses: {
        bsonType: 'array',
        items: screeningResponse,
      },
      pregnancyStatus: {
        bsonType: 'string',
        enum: [...radiologyScreeningResponseValues],
      },
      contrastAllergyStatus: {
        bsonType: 'string',
        enum: [...radiologyScreeningResponseValues],
      },
      renalRiskStatus: {
        bsonType: 'string',
        enum: [...radiologyScreeningResponseValues],
      },
      implantDeviceStatus: {
        bsonType: 'string',
        enum: [...radiologyScreeningResponseValues],
      },
      estimatedGfr: nullableDecimal,
      serumCreatinine: nullableDecimal,
      renalLabObservedAt: nullableDate,
      status: {
        bsonType: 'string',
        enum: [...radiologySafetyScreeningStatusValues],
      },
      preparationStatus: {
        bsonType: 'string',
        enum: [...radiologyPreparationStatusValues],
      },
      conditions: stringArray,
      screenedAt: date,
      screenedByStaffId: objectId,
      reviewedAt: nullableDate,
      reviewedByStaffId: nullableObjectId,
    },
  ),

  radiologyExaminations: validator(
    [
      'radiologyOrderId',
      'radiologyOrderItemId',
      'patientId',
      'encounterId',
      'modalityId',
      'procedureDefinitionHash',
      'status',
      'technicianStaffIds',
      'checkedInAt',
      'checkedInByStaffId',
      'contrastAdministered',
    ],
    {
      radiologyOrderId: objectId,
      radiologyOrderItemId: objectId,
      appointmentId: nullableObjectId,
      patientId: objectId,
      encounterId: objectId,
      modalityId: objectId,
      procedureDefinitionHash: string,
      status: {
        bsonType: 'string',
        enum: [...radiologyExaminationStatusValues],
      },
      technicianStaffIds: objectIdArray,
      checkedInAt: date,
      checkedInByStaffId: objectId,
      startedAt: nullableDate,
      startedByStaffId: nullableObjectId,
      completedAt: nullableDate,
      completedByStaffId: nullableObjectId,
      contrastAdministered: boolean,
      contrastUsageReference: nullableString,
      technicianNotes: nullableString,
      complications: nullableString,
    },
  ),

  radiologyImagingStudies: validator(
    [
      'studyNumber',
      'accessionNumber',
      'radiologyOrderId',
      'radiologyOrderItemId',
      'examinationId',
      'patientId',
      'encounterId',
      'modalityId',
      'modalityCodeSnapshot',
      'studyInstanceUid',
      'studyDateTime',
      'status',
      'externalReferences',
      'seriesCount',
      'instanceCount',
      'binaryStorageProhibited',
      'registeredAt',
      'registeredByStaffId',
    ],
    {
      studyNumber: string,
      accessionNumber: string,
      radiologyOrderId: objectId,
      radiologyOrderItemId: objectId,
      examinationId: objectId,
      patientId: objectId,
      encounterId: objectId,
      modalityId: objectId,
      modalityCodeSnapshot: string,
      studyInstanceUid: string,
      studyDateTime: date,
      status: {
        bsonType: 'string',
        enum: [...radiologyImagingStudyStatusValues],
      },
      externalReferences: {
        bsonType: 'array',
        items: externalReference,
      },
      seriesCount: number,
      instanceCount: number,
      binaryStorageProhibited: boolean,
      registeredAt: date,
      registeredByStaffId: objectId,
    },
  ),

  radiologyImagingSeries: validator(
    [
      'imagingStudyId',
      'patientId',
      'seriesInstanceUid',
      'seriesNumber',
      'modalityCodeSnapshot',
      'laterality',
      'instanceCount',
      'binaryStorageProhibited',
    ],
    {
      imagingStudyId: objectId,
      patientId: objectId,
      seriesInstanceUid: string,
      seriesNumber: number,
      modalityCodeSnapshot: string,
      bodyRegionCode: nullableString,
      laterality: {
        bsonType: 'string',
        enum: [...radiologyLateralityValues],
      },
      description: nullableString,
      protocolName: nullableString,
      instanceCount: number,
      externalSeriesId: nullableString,
      storageReference: nullableString,
      binaryStorageProhibited: boolean,
    },
  ),
};

const models = {
  radiologyResources: RadiologyResourceModel,
  radiologyAppointments: RadiologyAppointmentModel,
  radiologyResourceReservations:
    RadiologyResourceReservationModel,
  radiologySafetyScreenings: RadiologySafetyScreeningModel,
  radiologyExaminations: RadiologyExaminationModel,
  radiologyImagingStudies: RadiologyImagingStudyModel,
  radiologyImagingSeries: RadiologyImagingSeriesModel,
} as const;

async function ensureCollection(
  database: Db,
  name: RadiologyImagingOperationCollection,
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

  const collectionValidator =
    radiologyImagingOperationValidators[name];

  if (!exists) {
    await database.createCollection(name, {
      validator: collectionValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  } else {
    await database.command({
      collMod: name,
      validator: collectionValidator,
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

  const indexes =
    models[name].schema.indexes() as IndexDescription[];

  if (indexes.length > 0) {
    await collection.createIndexes(indexes);
  }
}

export const radiologyImagingOperations: Migration = {
  id: '018-radiology-imaging-operations',
  description:
    'Create Radiology operational resources, conflict-safe reservations, appointments, safety screening, examinations, and external imaging metadata collections',

  async up(database) {
    for (const name of radiologyImagingOperationCollections) {
      const spec = collectionSpecs.find(
        (candidate) => candidate.name === name,
      );

      if (
        spec === undefined ||
        !spec.facilityScoped ||
        spec.domain !== 'radiology' ||
        spec.retention !== 'standard'
      ) {
        throw new Error(
          `${name} must be cataloged as facility-scoped standard Radiology data`,
        );
      }

      await ensureCollection(database, name);
    }
  },
};