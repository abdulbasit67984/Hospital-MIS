import type {
  Db,
  IndexDescription,
} from 'mongodb';

import {
  collectionSpecs,
  type HospitalCollectionName,
} from '../catalog/collection-specs.js';

import {
  AdmissionRecommendationModel,
} from '../models/admission-recommendation.model.js';

import {
  AdmissionModel,
  AdmissionStatusHistoryModel,
} from '../models/admission.model.js';

import {
  BedRateModel,
  BedRateVersionModel,
} from '../models/bed-rate.model.js';

import {
  AdmissionBedAssignmentModel,
  BedChargeSegmentModel,
  BedHoldModel,
  BedStatusHistoryModel,
} from '../models/inpatient-bed-operation.model.js';

import {
  BedModel,
  RoomModel,
  WardModel,
} from '../models/inpatient-location.model.js';

import {
  admissionHistoryChangeTypeValues,
  admissionPriorityValues,
  admissionRecommendationStatusValues,
  admissionStatusValues,
  admissionTypeValues,
  bedAssignmentStatusValues,
  bedAssignmentTypeValues,
  bedChargeSegmentStatusValues,
  bedHoldStatusValues,
  bedHoldTypeValues,
  bedRateScopeValues,
  bedRateStatusValues,
  bedRateVersionChangeTypeValues,
  bedReleaseReasonValues,
  bedStatusChangeReasonValues,
  inpatientBedStatusValues,
  inpatientCatalogStatusValues,
  roomClassValues,
  roomTypeValues,
  wardTypeValues,
} from '../models/inpatient.types.js';

import type {
  Migration,
} from './types.js';

export const inpatientFoundationCollections =
  [
    'admissionRecommendations',
    'wards',
    'rooms',
    'beds',
    'bedRates',
    'bedRateVersions',
    'admissions',
    'admissionStatusHistories',
    'bedHolds',
    'admissionBedAssignments',
    'bedStatusHistories',
    'bedChargeSegments',
  ] as const satisfies readonly HospitalCollectionName[];

type InpatientFoundationCollection =
  (typeof inpatientFoundationCollections)[number];

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

const decimal = {
  bsonType: 'decimal',
} as const;

const nullableDecimal = {
  bsonType: [
    'decimal',
    'null',
  ],
} as const;

const objectIdArray = {
  bsonType: 'array',
  items: objectId,
} as const;

const stringArray = {
  bsonType: 'array',
  items: string,
} as const;

const objectArray = {
  bsonType: 'array',
  items: {
    bsonType: 'object',
  },
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
  properties:
    Record<string, unknown>,
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

const restrictionProperties = {
  permittedSexes: stringArray,
  minimumAgeYears: nullableNumber,
  maximumAgeYears: nullableNumber,
  specialtyCodes: stringArray,
  isolationCapabilities: stringArray,
  infectionControlTags: stringArray,
  negativePressureCapable: boolean,
  cohortingAllowed: boolean,
} as const;

const catalogLifecycleProperties = {
  status: {
    bsonType: 'string',
    enum: [
      ...inpatientCatalogStatusValues,
    ],
  },

  activatedAt: date,
  activatedBy: objectId,
  deactivatedAt: nullableDate,
  deactivatedBy: nullableObjectId,
  deactivationReason: nullableString,
} as const;

export const inpatientFoundationValidators:
  Readonly<
    Record<
      InpatientFoundationCollection,
      Record<string, unknown>
    >
  > = {
    admissionRecommendations:
      validator(
        [
          'recommendationNumber',
          'patientId',
          'requestedPatientId',
          'canonicalRedirected',
          'encounterId',
          'orderingProviderUserId',
          'orderingProviderStaffId',
          'orderingDepartmentId',
          'admissionType',
          'priority',
          'requestedWardTypes',
          'requestedSpecialtyCodes',
          'requestedIsolationCapabilities',
          'clinicalIndication',
          'diagnosisSnapshots',
          'recommendedAt',
          'status',
          'attachmentIds',
        ],
        {
          recommendationNumber: string,
          patientId: objectId,
          requestedPatientId: objectId,
          canonicalRedirected: boolean,
          encounterId: objectId,
          registrationId:
            nullableObjectId,
          opdVisitId: nullableObjectId,
          queueTokenId:
            nullableObjectId,
          orderingProviderUserId:
            objectId,
          orderingProviderStaffId:
            objectId,
          orderingDepartmentId:
            objectId,
          orderingServicePointId:
            nullableObjectId,

          admissionType: {
            bsonType: 'string',
            enum: [
              ...admissionTypeValues,
            ],
          },

          priority: {
            bsonType: 'string',
            enum: [
              ...admissionPriorityValues,
            ],
          },

          requestedWardTypes:
            stringArray,

          requestedSpecialtyCodes:
            stringArray,

          requestedIsolationCapabilities:
            stringArray,

          clinicalIndication: string,
          diagnosisSnapshots:
            objectArray,

          expectedLengthOfStayDays:
            nullableNumber,

          requestedAdmissionAt:
            nullableDate,

          recommendedAt: date,

          status: {
            bsonType: 'string',
            enum: [
              ...admissionRecommendationStatusValues,
            ],
          },

          acceptedAt: nullableDate,
          acceptedBy: nullableObjectId,
          acceptedByStaffId:
            nullableObjectId,

          rejectedAt: nullableDate,
          rejectedBy: nullableObjectId,
          rejectedByStaffId:
            nullableObjectId,

          rejectionReason:
            nullableString,

          cancelledAt: nullableDate,
          cancelledBy: nullableObjectId,
          cancelledByStaffId:
            nullableObjectId,

          cancellationReason:
            nullableString,

          expiresAt: nullableDate,
          admissionId: nullableObjectId,
          convertedAt: nullableDate,
          convertedBy: nullableObjectId,

          patientCoverageId:
            nullableObjectId,

          preauthorizationId:
            nullableObjectId,

          treatmentPackageId:
            nullableObjectId,

          attachmentIds: objectIdArray,
        },
      ),

    wards: validator(
      [
        'wardCode',
        'name',
        'normalizedName',
        'wardType',
        'departmentId',
        'displayOrder',
        ...Object.keys(
          restrictionProperties,
        ),
        'status',
        'activatedAt',
        'activatedBy',
      ],
      {
        wardCode: string,
        name: string,
        normalizedName: string,

        wardType: {
          bsonType: 'string',
          enum: [
            ...wardTypeValues,
          ],
        },

        departmentId: objectId,
        servicePointId:
          nullableObjectId,

        nursingStationCode:
          nullableString,

        description: nullableString,
        displayOrder: number,

        ...restrictionProperties,
        ...catalogLifecycleProperties,
      },
    ),

    rooms: validator(
      [
        'wardId',
        'departmentId',
        'roomCode',
        'roomNumber',
        'name',
        'normalizedName',
        'roomType',
        'roomClass',
        'capacity',
        'displayOrder',
        ...Object.keys(
          restrictionProperties,
        ),
        'status',
        'activatedAt',
        'activatedBy',
      ],
      {
        wardId: objectId,
        departmentId: objectId,
        servicePointId:
          nullableObjectId,

        roomCode: string,
        roomNumber: string,
        name: string,
        normalizedName: string,

        roomType: {
          bsonType: 'string',
          enum: [
            ...roomTypeValues,
          ],
        },

        roomClass: {
          bsonType: 'string',
          enum: [
            ...roomClassValues,
          ],
        },

        capacity: number,
        floorCode: nullableString,
        description: nullableString,
        displayOrder: number,

        ...restrictionProperties,
        ...catalogLifecycleProperties,
      },
    ),

    beds: validator(
      [
        'wardId',
        'roomId',
        'departmentId',
        'bedCode',
        'bedNumber',
        'label',
        'normalizedLabel',
        'bedCategory',
        'operationalStatus',
        'operationalStatusChangedAt',
        'operationalStatusChangedBy',
        'operationalStatusReasonCode',
        'turnaroundRequiredAfterRelease',
        'displayOrder',
        ...Object.keys(
          restrictionProperties,
        ),
        'status',
        'activatedAt',
        'activatedBy',
      ],
      {
        wardId: objectId,
        roomId: objectId,
        departmentId: objectId,
        servicePointId:
          nullableObjectId,

        bedCode: string,
        bedNumber: string,
        label: string,
        normalizedLabel: string,
        bedCategory: string,

        operationalStatus: {
          bsonType: 'string',
          enum: [
            ...inpatientBedStatusValues,
          ],
        },

        operationalStatusChangedAt:
          date,

        operationalStatusChangedBy:
          objectId,

        operationalStatusReasonCode:
          string,

        operationalStatusReason:
          nullableString,

        currentAdmissionId:
          nullableObjectId,

        currentAssignmentId:
          nullableObjectId,

        currentPatientId:
          nullableObjectId,

        activeHoldId:
          nullableObjectId,

        lastReleasedAt: nullableDate,

        turnaroundRequiredAfterRelease:
          boolean,

        maintenanceReference:
          nullableString,

        displayOrder: number,

        ...restrictionProperties,
        ...catalogLifecycleProperties,
      },
    ),

    bedRates: validator(
      [
        'rateCode',
        'name',
        'scope',
        'scopeKey',
        'currencyCode',
        'amount',
        'chargingPolicy',
        'effectiveFrom',
        'status',
        'currentVersion',
      ],
      {
        rateCode: string,
        name: string,

        scope: {
          bsonType: 'string',
          enum: [
            ...bedRateScopeValues,
          ],
        },

        scopeKey: string,
        scopeReferenceId:
          nullableObjectId,

        scopeCode: nullableString,
        currencyCode: string,
        amount: decimal,

        chargingPolicy: {
          bsonType: 'object',
        },

        chargeCatalogItemId:
          nullableObjectId,

        priceListId: nullableObjectId,

        payerOrganizationId:
          nullableObjectId,

        panelPlanId:
          nullableObjectId,

        treatmentPackageId:
          nullableObjectId,

        effectiveFrom: date,
        effectiveThrough: nullableDate,

        status: {
          bsonType: 'string',
          enum: [
            ...bedRateStatusValues,
          ],
        },

        currentVersion: number,

        latestVersionId:
          nullableObjectId,

        activatedAt: nullableDate,
        activatedBy: nullableObjectId,
        supersededAt: nullableDate,
        supersededBy:
          nullableObjectId,

        supersededByRateId:
          nullableObjectId,

        cancelledAt: nullableDate,
        cancelledBy: nullableObjectId,

        cancellationReason:
          nullableString,
      },
    ),

    bedRateVersions: validator(
      [
        'bedRateId',
        'versionNumber',
        'changeType',
        'rateCodeSnapshot',
        'nameSnapshot',
        'scopeSnapshot',
        'scopeKeySnapshot',
        'currencyCodeSnapshot',
        'amountSnapshot',
        'chargingPolicySnapshot',
        'effectiveFromSnapshot',
        'statusSnapshot',
        'snapshotHash',
        'recordedAt',
        'recordedBy',
      ],
      {
        bedRateId: objectId,
        versionNumber: number,

        previousVersionId:
          nullableObjectId,

        changeType: {
          bsonType: 'string',
          enum: [
            ...bedRateVersionChangeTypeValues,
          ],
        },

        rateCodeSnapshot: string,
        nameSnapshot: string,

        scopeSnapshot: {
          bsonType: 'string',
          enum: [
            ...bedRateScopeValues,
          ],
        },

        scopeKeySnapshot: string,

        scopeReferenceIdSnapshot:
          nullableObjectId,

        scopeCodeSnapshot:
          nullableString,

        currencyCodeSnapshot:
          string,

        amountSnapshot: decimal,

        chargingPolicySnapshot: {
          bsonType: 'object',
        },

        chargeCatalogItemIdSnapshot:
          nullableObjectId,

        priceListIdSnapshot:
          nullableObjectId,

        payerOrganizationIdSnapshot:
          nullableObjectId,

        panelPlanIdSnapshot:
          nullableObjectId,

        treatmentPackageIdSnapshot:
          nullableObjectId,

        effectiveFromSnapshot: date,

        effectiveThroughSnapshot:
          nullableDate,

        statusSnapshot: {
          bsonType: 'string',
          enum: [
            ...bedRateStatusValues,
          ],
        },

        snapshotHash: string,
        changeReason: nullableString,
        recordedAt: date,
        recordedBy: objectId,
      },
    ),

    admissions: validator(
      [
        'admissionNumber',
        'patientId',
        'requestedPatientId',
        'canonicalRedirected',
        'encounterId',
        'admittingDepartmentId',
        'admissionType',
        'priority',
        'status',
        'isActive',
        'requestedAt',
        'attendingConsultantUserId',
        'attendingConsultantStaffId',
        'careTeam',
        'clinicalIndicationSnapshot',
        'diagnosisSnapshots',
        'currentStatusSequence',
      ],
      {
        admissionNumber: string,

        admissionRecommendationId:
          nullableObjectId,

        patientId: objectId,
        requestedPatientId: objectId,
        canonicalRedirected: boolean,
        encounterId: objectId,

        registrationId:
          nullableObjectId,

        opdVisitId: nullableObjectId,
        queueTokenId:
          nullableObjectId,

        admittingDepartmentId:
          objectId,

        admittingServicePointId:
          nullableObjectId,

        admissionType: {
          bsonType: 'string',
          enum: [
            ...admissionTypeValues,
          ],
        },

        priority: {
          bsonType: 'string',
          enum: [
            ...admissionPriorityValues,
          ],
        },

        status: {
          bsonType: 'string',
          enum: [
            ...admissionStatusValues,
          ],
        },

        isActive: boolean,
        requestedAt: date,
        acceptedAt: nullableDate,
        acceptedBy: nullableObjectId,

        acceptedByStaffId:
          nullableObjectId,

        admittedAt: nullableDate,
        admittedBy: nullableObjectId,

        admittedByStaffId:
          nullableObjectId,

        clinicallyDischargedAt:
          nullableDate,

        financiallyClearedAt:
          nullableDate,

        dischargedAt: nullableDate,
        cancelledAt: nullableDate,
        cancelledBy: nullableObjectId,

        cancelledByStaffId:
          nullableObjectId,

        cancellationReason:
          nullableString,

        attendingConsultantUserId:
          objectId,

        attendingConsultantStaffId:
          objectId,

        careTeam: objectArray,

        clinicalIndicationSnapshot:
          string,

        diagnosisSnapshots:
          objectArray,

        guardianSnapshot: {
          bsonType: [
            'object',
            'null',
          ],
        },

        emergencyContactSnapshot: {
          bsonType: [
            'object',
            'null',
          ],
        },

        payerOrganizationId:
          nullableObjectId,

        panelProgramId:
          nullableObjectId,

        panelPlanId:
          nullableObjectId,

        patientCoverageId:
          nullableObjectId,

        preauthorizationId:
          nullableObjectId,

        treatmentPackageId:
          nullableObjectId,

        depositRequirementReference:
          nullableString,

        authorizationRequirementReference:
          nullableString,

        billingAccountReference:
          nullableString,

        currentWardId:
          nullableObjectId,

        currentRoomId:
          nullableObjectId,

        currentBedId:
          nullableObjectId,

        currentBedAssignmentId:
          nullableObjectId,

        currentBedAssignedAt:
          nullableDate,

        currentStatusSequence: number,

        latestStatusHistoryId:
          nullableObjectId,

        dischargeId: nullableObjectId,
      },
    ),

    admissionStatusHistories:
      validator(
        [
          'admissionId',
          'patientId',
          'sequence',
          'toStatus',
          'changeType',
          'reasonCode',
          'occurredAt',
          'performedBy',
          'performedByStaffId',
        ],
        {
          admissionId: objectId,
          patientId: objectId,
          sequence: number,

          fromStatus: {
            bsonType: [
              'string',
              'null',
            ],
            enum: [
              ...admissionStatusValues,
              null,
            ],
          },

          toStatus: {
            bsonType: 'string',
            enum: [
              ...admissionStatusValues,
            ],
          },

          changeType: {
            bsonType: 'string',
            enum: [
              ...admissionHistoryChangeTypeValues,
            ],
          },

          reasonCode: string,
          reason: nullableString,

          admissionBedAssignmentId:
            nullableObjectId,

          bedId: nullableObjectId,
          dischargeId:
            nullableObjectId,

          occurredAt: date,
          performedBy: objectId,
          performedByStaffId:
            objectId,
        },
      ),

    bedHolds: validator(
      [
        'holdNumber',
        'bedId',
        'roomId',
        'wardId',
        'patientId',
        'holdType',
        'status',
        'isActive',
        'heldAt',
        'expiresAt',
        'heldBy',
        'heldByStaffId',
        'reasonCode',
        'reason',
      ],
      {
        holdNumber: string,
        bedId: objectId,
        roomId: objectId,
        wardId: objectId,
        admissionId: nullableObjectId,

        admissionRecommendationId:
          nullableObjectId,

        patientId: objectId,

        holdType: {
          bsonType: 'string',
          enum: [
            ...bedHoldTypeValues,
          ],
        },

        status: {
          bsonType: 'string',
          enum: [
            ...bedHoldStatusValues,
          ],
        },

        isActive: boolean,
        heldAt: date,
        expiresAt: date,
        heldBy: objectId,
        heldByStaffId: objectId,
        reasonCode: string,
        reason: string,
        consumedAt: nullableDate,
        consumedBy: nullableObjectId,

        admissionBedAssignmentId:
          nullableObjectId,

        endedAt: nullableDate,
        endedBy: nullableObjectId,
        endingReason: nullableString,
      },
    ),

    admissionBedAssignments:
      validator(
        [
          'assignmentNumber',
          'admissionId',
          'patientId',
          'sequence',
          'assignmentType',
          'status',
          'isActive',
          'wardId',
          'roomId',
          'bedId',
          'wardCodeSnapshot',
          'wardNameSnapshot',
          'roomCodeSnapshot',
          'roomNumberSnapshot',
          'bedCodeSnapshot',
          'bedNumberSnapshot',
          'bedCategorySnapshot',
          'assignedAt',
          'assignedBy',
          'assignedByStaffId',
          'turnaroundRequired',
        ],
        {
          assignmentNumber: string,
          admissionId: objectId,
          patientId: objectId,
          sequence: number,

          assignmentType: {
            bsonType: 'string',
            enum: [
              ...bedAssignmentTypeValues,
            ],
          },

          status: {
            bsonType: 'string',
            enum: [
              ...bedAssignmentStatusValues,
            ],
          },

          isActive: boolean,
          wardId: objectId,
          roomId: objectId,
          bedId: objectId,
          wardCodeSnapshot: string,
          wardNameSnapshot: string,
          roomCodeSnapshot: string,
          roomNumberSnapshot: string,
          bedCodeSnapshot: string,
          bedNumberSnapshot: string,
          bedCategorySnapshot: string,

          bedHoldId: nullableObjectId,

          previousAssignmentId:
            nullableObjectId,

          assignedAt: date,
          assignedBy: objectId,
          assignedByStaffId: objectId,
          releasedAt: nullableDate,
          releasedBy: nullableObjectId,

          releasedByStaffId:
            nullableObjectId,

          releaseReasonCode: {
            bsonType: [
              'string',
              'null',
            ],
            enum: [
              ...bedReleaseReasonValues,
              null,
            ],
          },

          releaseReason:
            nullableString,

          nextAssignmentId:
            nullableObjectId,

          turnaroundRequired:
            boolean,

          bedChargeSegmentId:
            nullableObjectId,
        },
      ),

    bedStatusHistories: validator(
      [
        'bedId',
        'wardId',
        'roomId',
        'sequence',
        'toStatus',
        'reasonCode',
        'occurredAt',
        'performedBy',
        'performedByStaffId',
      ],
      {
        bedId: objectId,
        wardId: objectId,
        roomId: objectId,
        sequence: number,

        fromStatus: {
          bsonType: [
            'string',
            'null',
          ],
          enum: [
            ...inpatientBedStatusValues,
            null,
          ],
        },

        toStatus: {
          bsonType: 'string',
          enum: [
            ...inpatientBedStatusValues,
          ],
        },

        reasonCode: {
          bsonType: 'string',
          enum: [
            ...bedStatusChangeReasonValues,
          ],
        },

        reason: nullableString,
        admissionId: nullableObjectId,

        admissionBedAssignmentId:
          nullableObjectId,

        bedHoldId: nullableObjectId,

        maintenanceReference:
          nullableString,

        occurredAt: date,
        performedBy: objectId,
        performedByStaffId: objectId,
      },
    ),

    bedChargeSegments: validator(
      [
        'segmentNumber',
        'admissionId',
        'admissionBedAssignmentId',
        'patientId',
        'wardId',
        'roomId',
        'bedId',
        'bedRateId',
        'bedRateVersionId',
        'bedRateVersionNumber',
        'rateCodeSnapshot',
        'currencyCode',
        'unitRate',
        'chargingPolicySnapshot',
        'startedAt',
        'isOpen',
        'status',
      ],
      {
        segmentNumber: string,
        admissionId: objectId,

        admissionBedAssignmentId:
          objectId,

        patientId: objectId,
        wardId: objectId,
        roomId: objectId,
        bedId: objectId,
        bedRateId: objectId,
        bedRateVersionId: objectId,
        bedRateVersionNumber: number,
        rateCodeSnapshot: string,
        currencyCode: string,
        unitRate: decimal,

        chargingPolicySnapshot: {
          bsonType: 'object',
        },

        startedAt: date,
        endedAt: nullableDate,
        isOpen: boolean,
        billableMinutes:
          nullableNumber,

        quantity: nullableDecimal,
        grossAmount: nullableDecimal,

        status: {
          bsonType: 'string',
          enum: [
            ...bedChargeSegmentStatusValues,
          ],
        },

        billingRequestId:
          nullableString,

        billingChargeReference:
          nullableString,

        billedAt: nullableDate,

        reversalRequestId:
          nullableString,

        reversalReference:
          nullableString,

        reversedAt: nullableDate,

        correctionReason:
          nullableString,
      },
    ),
  };

const models = {
  admissionRecommendations:
    AdmissionRecommendationModel,

  wards: WardModel,
  rooms: RoomModel,
  beds: BedModel,
  bedRates: BedRateModel,

  bedRateVersions:
    BedRateVersionModel,

  admissions: AdmissionModel,

  admissionStatusHistories:
    AdmissionStatusHistoryModel,

  bedHolds: BedHoldModel,

  admissionBedAssignments:
    AdmissionBedAssignmentModel,

  bedStatusHistories:
    BedStatusHistoryModel,

  bedChargeSegments:
    BedChargeSegmentModel,
} as const;

const immutableCollections =
  new Set<InpatientFoundationCollection>(
    [
      'bedRateVersions',
      'admissionStatusHistories',
      'bedStatusHistories',
    ],
  );

async function ensureCollection(
  database: Db,
  name:
    InpatientFoundationCollection,
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
    inpatientFoundationValidators[
      name
    ];

  if (!exists) {
    await database.createCollection(
      name,
      {
        validator:
          collectionValidator,

        validationLevel: 'strict',
        validationAction: 'error',
      },
    );
  } else {
    await database.command({
      collMod: name,

      validator:
        collectionValidator,

      validationLevel: 'strict',
      validationAction: 'error',
    });
  }

  const collection =
    database.collection(name);

  const existingIndexes =
    await collection.indexes();

  for (
    const index of existingIndexes
  ) {
    if (index.name !== '_id_') {
      await collection.dropIndex(
        index.name,
      );
    }
  }

  const indexes =
    models[name].schema.indexes() as
      IndexDescription[];

  if (indexes.length > 0) {
    await collection.createIndexes(
      indexes,
    );
  }
}

export const inpatientFoundation:
  Migration = {
    id: '020-inpatient-foundation',

    description:
      'Create inpatient location, effective-dated bed-rate, admission, conflict-safe occupancy, immutable history, and bed-charge foundations',

    async up(database) {
      for (
        const name of
        inpatientFoundationCollections
      ) {
        const spec =
          collectionSpecs.find(
            (candidate) =>
              candidate.name === name,
          );

        const expectedDomain =
          name ===
          'admissionRecommendations'
            ? 'clinical'
            : 'inpatient';

        const expectedRetention =
          immutableCollections.has(name)
            ? 'immutable'
            : 'standard';

        if (
          spec === undefined ||
          !spec.facilityScoped ||
          spec.domain !==
            expectedDomain ||
          spec.retention !==
            expectedRetention
        ) {
          throw new Error(
            `${name} must be cataloged as facility-scoped ${expectedDomain} ${expectedRetention} data`,
          );
        }

        await ensureCollection(
          database,
          name,
        );
      }
    },
  };