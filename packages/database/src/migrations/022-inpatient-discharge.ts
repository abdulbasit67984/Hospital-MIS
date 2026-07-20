import type {
  Db,
  IndexDescription,
} from 'mongodb';

import {
  DischargeModel,
  DischargeSummaryModel,
} from '../models/inpatient-discharge.model.js';

import type {
  Migration,
} from './types.js';

const collections = {
  discharges: {
    model:
      DischargeModel,

    required: [
      'facilityId',
      'dischargeNumber',
      'admissionId',
      'admissionNumberSnapshot',
      'patientId',
      'encounterId',
      'attendingConsultantUserId',
      'attendingConsultantStaffId',
      'initiatingDepartmentId',
      'status',
      'initiatedAt',
      'initiatedByUserId',
      'initiatedByStaffId',
      'checklist',
      'medicationReconciliationCompleted',
      'medicationReconciliationItems',
      'currentSummaryVersion',
      'transactionId',
      'correlationId',
      'schemaVersion',
      'version',
      'createdBy',
      'updatedBy',
      'createdAt',
      'updatedAt',
    ],

    properties: {
      facilityId: {
        bsonType:
          'objectId',
      },

      dischargeNumber: {
        bsonType:
          'string',
      },

      admissionId: {
        bsonType:
          'objectId',
      },

      admissionNumberSnapshot: {
        bsonType:
          'string',
      },

      patientId: {
        bsonType:
          'objectId',
      },

      encounterId: {
        bsonType:
          'objectId',
      },

      attendingConsultantUserId: {
        bsonType:
          'objectId',
      },

      attendingConsultantStaffId: {
        bsonType:
          'objectId',
      },

      initiatingDepartmentId: {
        bsonType:
          'objectId',
      },

      status: {
        bsonType:
          'string',

        enum: [
          'INITIATED',
          'CLINICALLY_CLEARED',
          'FINANCIAL_CLEARANCE_PENDING',
          'FINANCIALLY_CLEARED',
          'COMPLETED',
          'CANCELLED',
        ],
      },

      disposition: {
        bsonType: [
          'string',
          'null',
        ],
      },

      initiatedAt: {
        bsonType:
          'date',
      },

      initiatedByUserId: {
        bsonType:
          'objectId',
      },

      initiatedByStaffId: {
        bsonType:
          'objectId',
      },

      clinicalClearanceAt: {
        bsonType: [
          'date',
          'null',
        ],
      },

      clinicalClearanceByUserId: {
        bsonType: [
          'objectId',
          'null',
        ],
      },

      clinicalClearanceByStaffId: {
        bsonType: [
          'objectId',
          'null',
        ],
      },

      financialClearanceRequestedAt: {
        bsonType: [
          'date',
          'null',
        ],
      },

      financialClearanceRequestId: {
        bsonType: [
          'string',
          'null',
        ],
      },

      financialClearanceReference: {
        bsonType: [
          'string',
          'null',
        ],
      },

      financiallyClearedAt: {
        bsonType: [
          'date',
          'null',
        ],
      },

      completedAt: {
        bsonType: [
          'date',
          'null',
        ],
      },

      cancelledAt: {
        bsonType: [
          'date',
          'null',
        ],
      },

      checklist: {
        bsonType:
          'array',
      },

      medicationReconciliationCompleted: {
        bsonType:
          'bool',
      },

      medicationReconciliationItems: {
        bsonType:
          'array',
      },

      dischargeSummaryId: {
        bsonType: [
          'objectId',
          'null',
        ],
      },

      latestDischargeSummaryVersionId: {
        bsonType: [
          'objectId',
          'null',
        ],
      },

      currentSummaryVersion: {
        bsonType:
          'number',

        minimum:
          0,
      },

      transactionId: {
        bsonType:
          'string',
      },

      correlationId: {
        bsonType:
          'string',
      },

      schemaVersion: {
        bsonType:
          'number',

        minimum:
          1,
      },

      version: {
        bsonType:
          'number',

        minimum:
          0,
      },

      createdBy: {
        bsonType:
          'objectId',
      },

      updatedBy: {
        bsonType:
          'objectId',
      },

      createdAt: {
        bsonType:
          'date',
      },

      updatedAt: {
        bsonType:
          'date',
      },
    },
  },

  dischargeSummaries: {
    model:
      DischargeSummaryModel,

    required: [
      'facilityId',
      'dischargeId',
      'admissionId',
      'patientId',
      'encounterId',
      'summaryNumber',
      'versionNumber',
      'status',
      'admissionReason',
      'hospitalCourse',
      'proceduresPerformed',
      'significantInvestigations',
      'diagnosisSnapshots',
      'conditionAtDischarge',
      'medicationReconciliationItems',
      'followUpInstructions',
      'warningSigns',
      'patientInstructions',
      'preparedAt',
      'preparedByUserId',
      'preparedByStaffId',
      'snapshotHash',
      'transactionId',
      'correlationId',
      'schemaVersion',
      'version',
      'createdBy',
      'updatedBy',
      'createdAt',
      'updatedAt',
    ],

    properties: {
      facilityId: {
        bsonType:
          'objectId',
      },

      dischargeId: {
        bsonType:
          'objectId',
      },

      admissionId: {
        bsonType:
          'objectId',
      },

      patientId: {
        bsonType:
          'objectId',
      },

      encounterId: {
        bsonType:
          'objectId',
      },

      summaryNumber: {
        bsonType:
          'string',
      },

      versionNumber: {
        bsonType:
          'number',

        minimum:
          1,
      },

      previousVersionId: {
        bsonType: [
          'objectId',
          'null',
        ],
      },

      status: {
        bsonType:
          'string',

        enum: [
          'DRAFT',
          'FINAL',
          'AMENDED',
          'ENTERED_IN_ERROR',
        ],
      },

      admissionReason: {
        bsonType:
          'string',
      },

      hospitalCourse: {
        bsonType:
          'string',
      },

      proceduresPerformed: {
        bsonType:
          'array',
      },

      significantInvestigations: {
        bsonType:
          'array',
      },

      diagnosisSnapshots: {
        bsonType:
          'array',
      },

      conditionAtDischarge: {
        bsonType:
          'string',
      },

      medicationReconciliationItems: {
        bsonType:
          'array',
      },

      followUpInstructions: {
        bsonType:
          'array',
      },

      warningSigns: {
        bsonType:
          'array',
      },

      patientInstructions: {
        bsonType:
          'string',
      },

      preparedAt: {
        bsonType:
          'date',
      },

      preparedByUserId: {
        bsonType:
          'objectId',
      },

      preparedByStaffId: {
        bsonType:
          'objectId',
      },

      finalizedAt: {
        bsonType: [
          'date',
          'null',
        ],
      },

      finalizedByUserId: {
        bsonType: [
          'objectId',
          'null',
        ],
      },

      finalizedByStaffId: {
        bsonType: [
          'objectId',
          'null',
        ],
      },

      amendmentReason: {
        bsonType: [
          'string',
          'null',
        ],
      },

      snapshotHash: {
        bsonType:
          'string',
      },

      transactionId: {
        bsonType:
          'string',
      },

      correlationId: {
        bsonType:
          'string',
      },

      schemaVersion: {
        bsonType:
          'number',

        minimum:
          1,
      },

      version: {
        bsonType:
          'number',

        minimum:
          0,
      },

      createdBy: {
        bsonType:
          'objectId',
      },

      updatedBy: {
        bsonType:
          'objectId',
      },

      createdAt: {
        bsonType:
          'date',
      },

      updatedAt: {
        bsonType:
          'date',
      },
    },
  },
} as const;

async function ensureCollection(
  database:
    Db,

  name:
    keyof typeof collections,
): Promise<void> {
  const definition =
    collections[
      name
    ];

  const exists =
    await database
      .listCollections(
        {
          name,
        },

        {
          nameOnly:
            true,
        },
      )
      .hasNext();

  const validator = {
    $jsonSchema: {
      bsonType:
        'object',

      required:
        definition.required,

      properties:
        definition.properties,
    },
  };

  if (
    exists
  ) {
    await database.command({
      collMod:
        name,

      validator,

      validationLevel:
        'strict',

      validationAction:
        'error',
    });
  } else {
    await database.createCollection(
      name,

      {
        validator,

        validationLevel:
          'strict',

        validationAction:
          'error',
      },
    );
  }

  for (
    const [
      keys,
      options,
    ] of
    definition.model
      .schema
      .indexes()
  ) {
    await database
      .collection(
        name,
      )
      .createIndex(
        keys,

        options as
          IndexDescription,
      );
  }
}

export const inpatientDischargeMigration:
  Migration = {
    id:
      '022-inpatient-discharge',

    description:
      'Create inpatient discharge and immutable discharge-summary collections',

    async up(
      database:
        Db,
    ): Promise<void> {
      await ensureCollection(
        database,
        'discharges',
      );

      await ensureCollection(
        database,
        'dischargeSummaries',
      );
    },
  };