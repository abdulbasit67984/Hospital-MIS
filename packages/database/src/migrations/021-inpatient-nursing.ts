import type {
  Db,
  IndexDescription,
} from 'mongodb';

import {
  MedicationAdministrationAmendmentModel,
  MedicationAdministrationModel,
  MedicationScheduleModel,
  NursingEntryAmendmentModel,
  NursingNoteModel,
  NursingNoteVersionModel,
  WardHandoverModel,
} from '../models/inpatient-nursing.model.js';

import {
  medicationAdministrationRouteValues,
  medicationAdministrationSourceValues,
  medicationDoseStatusValues,
  medicationScheduleStatusValues,
  nursingAmendmentEntityTypeValues,
  nursingAmendmentTypeValues,
  nursingEntryStatusValues,
  nursingIntakeOutputDirectionValues,
  nursingIntakeOutputRouteValues,
  nursingNoteTypeValues,
  nursingObservationSeverityValues,
  wardHandoverStatusValues,
  wardHandoverTypeValues,
} from '../models/inpatient-nursing.types.js';

import type {
  Migration,
} from './types.js';

const objectId = {
  bsonType: 'objectId',
} as const;

const nullableObjectId = {
  bsonType: [
    'objectId',
    'null',
  ],
} as const;

const nullableString = {
  bsonType: [
    'string',
    'null',
  ],
} as const;

const nullableDate = {
  bsonType: [
    'date',
    'null',
  ],
} as const;

const nullableDecimal = {
  bsonType: [
    'decimal',
    'null',
  ],
} as const;

const metadataRequired = [
  'facilityId',
  'admissionId',
  'patientId',
  'encounterId',
  'wardId',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
] as const;

const metadataProperties = {
  _id: objectId,
  facilityId: objectId,
  admissionId: objectId,
  patientId: objectId,
  encounterId: objectId,
  wardId: objectId,
  roomId: nullableObjectId,
  bedId: nullableObjectId,
  transactionId: {
    bsonType: 'string',
  },
  correlationId: {
    bsonType: 'string',
  },
  schemaVersion: {
    bsonType: 'number',
    minimum: 1,
  },
  version: {
    bsonType: 'number',
    minimum: 0,
  },
  createdBy: objectId,
  updatedBy: objectId,
  createdAt: {
    bsonType: 'date',
  },
  updatedAt: {
    bsonType: 'date',
  },
} as const;

const intakeOutput = {
  bsonType: [
    'object',
    'null',
  ],
  properties: {
    direction: {
      bsonType: 'string',
      enum: [
        ...nursingIntakeOutputDirectionValues,
      ],
    },
    route: {
      bsonType: 'string',
      enum: [
        ...nursingIntakeOutputRouteValues,
      ],
    },
    amountMillilitres: {
      bsonType: 'decimal',
    },
    description: nullableString,
  },
} as const;

const validators = {
  nursingNotes: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        ...metadataRequired,
        'noteNumber',
        'noteType',
        'observationSeverity',
        'title',
        'content',
        'requiresEscalation',
        'recordedAt',
        'recordedByUserId',
        'recordedByStaffId',
        'status',
        'revisionNumber',
        'rootNursingNoteId',
      ],
      properties: {
        ...metadataProperties,
        noteNumber: {
          bsonType: 'string',
        },
        noteType: {
          bsonType: 'string',
          enum: [
            ...nursingNoteTypeValues,
          ],
        },
        observationSeverity: {
          bsonType: 'string',
          enum: [
            ...nursingObservationSeverityValues,
          ],
        },
        title: {
          bsonType: 'string',
        },
        content: {
          bsonType: 'string',
        },
        intakeOutput,
        requiresEscalation: {
          bsonType: 'bool',
        },
        escalationRecipientStaffId:
          nullableObjectId,
        escalatedAt: nullableDate,
        acknowledgedAt: nullableDate,
        acknowledgedByStaffId:
          nullableObjectId,
        recordedAt: {
          bsonType: 'date',
        },
        recordedByUserId: objectId,
        recordedByStaffId: objectId,
        status: {
          bsonType: 'string',
          enum: [
            ...nursingEntryStatusValues,
          ],
        },
        revisionNumber: {
          bsonType: 'number',
          minimum: 1,
        },
        rootNursingNoteId: objectId,
        supersedesNursingNoteId:
          nullableObjectId,
        supersededByNursingNoteId:
          nullableObjectId,
        correctedAt: nullableDate,
        correctedBy: nullableObjectId,
        correctionReason:
          nullableString,
        enteredInErrorAt:
          nullableDate,
        enteredInErrorBy:
          nullableObjectId,
        enteredInErrorReason:
          nullableString,
      },
    },
  },

  nursingNoteVersions: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        ...metadataRequired,
        'nursingNoteId',
        'rootNursingNoteId',
        'revisionNumber',
        'snapshotHash',
        'noteTypeSnapshot',
        'observationSeveritySnapshot',
        'titleSnapshot',
        'contentSnapshot',
        'statusSnapshot',
        'recordedAt',
        'recordedByUserId',
        'recordedByStaffId',
      ],
      properties: {
        ...metadataProperties,
        nursingNoteId: objectId,
        rootNursingNoteId: objectId,
        revisionNumber: {
          bsonType: 'number',
          minimum: 1,
        },
        snapshotHash: {
          bsonType: 'string',
        },
        noteTypeSnapshot: {
          bsonType: 'string',
          enum: [
            ...nursingNoteTypeValues,
          ],
        },
        observationSeveritySnapshot: {
          bsonType: 'string',
          enum: [
            ...nursingObservationSeverityValues,
          ],
        },
        titleSnapshot: {
          bsonType: 'string',
        },
        contentSnapshot: {
          bsonType: 'string',
        },
        intakeOutputSnapshot:
          intakeOutput,
        statusSnapshot: {
          bsonType: 'string',
          enum: [
            ...nursingEntryStatusValues,
          ],
        },
        changeReason:
          nullableString,
        recordedAt: {
          bsonType: 'date',
        },
        recordedByUserId:
          objectId,
        recordedByStaffId:
          objectId,
      },
    },
  },

  medicationSchedules: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        ...metadataRequired,
        'scheduleNumber',
        'source',
        'medicineId',
        'medicineDisplay',
        'prescribedDose',
        'doseUnitCode',
        'route',
        'frequencyCode',
        'scheduledTimes',
        'prn',
        'startAt',
        'status',
        'orderedByUserId',
        'orderedByStaffId',
      ],
      properties: {
        ...metadataProperties,
        scheduleNumber: {
          bsonType: 'string',
        },
        prescriptionId:
          nullableObjectId,
        prescriptionItemId:
          nullableObjectId,
        source: {
          bsonType: 'string',
          enum: [
            ...medicationAdministrationSourceValues,
          ],
        },
        medicineId: objectId,
        formularyItemId:
          nullableObjectId,
        medicineDisplay: {
          bsonType: 'string',
        },
        prescribedDose: {
          bsonType: 'decimal',
        },
        doseUnitCode: {
          bsonType: 'string',
        },
        route: {
          bsonType: 'string',
          enum: [
            ...medicationAdministrationRouteValues,
          ],
        },
        frequencyCode: {
          bsonType: 'string',
        },
        scheduledTimes: {
          bsonType: 'array',
          items: {
            bsonType: 'date',
          },
        },
        prn: {
          bsonType: 'bool',
        },
        prnIndication:
          nullableString,
        startAt: {
          bsonType: 'date',
        },
        endAt: nullableDate,
        status: {
          bsonType: 'string',
          enum: [
            ...medicationScheduleStatusValues,
          ],
        },
        holdReason:
          nullableString,
        orderedByUserId:
          objectId,
        orderedByStaffId:
          objectId,
        lastAdministrationAt:
          nullableDate,
        nextScheduledAt:
          nullableDate,
      },
    },
  },

  medicationAdministrations: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        ...metadataRequired,
        'administrationNumber',
        'medicationScheduleId',
        'medicineId',
        'medicineDisplaySnapshot',
        'scheduledAt',
        'status',
        'prescribedDose',
        'doseUnitCode',
        'prescribedRoute',
        'statusChangedAt',
        'statusChangedBy',
      ],
      properties: {
        ...metadataProperties,
        administrationNumber: {
          bsonType: 'string',
        },
        medicationScheduleId:
          objectId,
        prescriptionId:
          nullableObjectId,
        prescriptionItemId:
          nullableObjectId,
        medicineId: objectId,
        medicineDisplaySnapshot: {
          bsonType: 'string',
        },
        scheduledAt: {
          bsonType: 'date',
        },
        status: {
          bsonType: 'string',
          enum: [
            ...medicationDoseStatusValues,
          ],
        },
        prescribedDose: {
          bsonType: 'decimal',
        },
        administeredDose:
          nullableDecimal,
        doseUnitCode: {
          bsonType: 'string',
        },
        prescribedRoute: {
          bsonType: 'string',
          enum: [
            ...medicationAdministrationRouteValues,
          ],
        },
        administeredRoute: {
          bsonType: [
            'string',
            'null',
          ],
          enum: [
            ...medicationAdministrationRouteValues,
            null,
          ],
        },
        administeredAt:
          nullableDate,
        administeringNurseUserId:
          nullableObjectId,
        administeringNurseStaffId:
          nullableObjectId,
        reasonCode:
          nullableString,
        reason:
          nullableString,
        notes:
          nullableString,
        delayedUntil:
          nullableDate,
        statusChangedAt: {
          bsonType: 'date',
        },
        statusChangedBy:
          objectId,
        correctionOfAdministrationId:
          nullableObjectId,
        supersededByAdministrationId:
          nullableObjectId,
      },
    },
  },

  medicationAdministrationAmendments: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        ...metadataRequired,
        'medicationAdministrationId',
        'amendmentSequence',
        'amendmentType',
        'previousStatus',
        'reason',
        'snapshotHash',
        'occurredAt',
        'performedByUserId',
        'performedByStaffId',
      ],
      properties: {
        ...metadataProperties,
        medicationAdministrationId:
          objectId,
        amendmentSequence: {
          bsonType: 'number',
          minimum: 1,
        },
        amendmentType: {
          bsonType: 'string',
          enum: [
            ...nursingAmendmentTypeValues,
          ],
        },
        previousStatus: {
          bsonType: 'string',
          enum: [
            ...medicationDoseStatusValues,
          ],
        },
        replacementAdministrationId:
          nullableObjectId,
        reason: {
          bsonType: 'string',
        },
        snapshotHash: {
          bsonType: 'string',
        },
        occurredAt: {
          bsonType: 'date',
        },
        performedByUserId:
          objectId,
        performedByStaffId:
          objectId,
      },
    },
  },

  wardHandovers: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        ...metadataRequired,
        'handoverNumber',
        'handoverType',
        'shiftCode',
        'summary',
        'activeConcerns',
        'pendingTasks',
        'medicationConcerns',
        'safetyConcerns',
        'fromNurseUserId',
        'fromNurseStaffId',
        'toNurseUserId',
        'toNurseStaffId',
        'handedOverAt',
        'status',
      ],
      properties: {
        ...metadataProperties,
        handoverNumber: {
          bsonType: 'string',
        },
        handoverType: {
          bsonType: 'string',
          enum: [
            ...wardHandoverTypeValues,
          ],
        },
        shiftCode: {
          bsonType: 'string',
        },
        summary: {
          bsonType: 'string',
        },
        activeConcerns: {
          bsonType: 'array',
          items: {
            bsonType: 'string',
          },
        },
        pendingTasks: {
          bsonType: 'array',
          items: {
            bsonType: 'string',
          },
        },
        medicationConcerns: {
          bsonType: 'array',
          items: {
            bsonType: 'string',
          },
        },
        safetyConcerns: {
          bsonType: 'array',
          items: {
            bsonType: 'string',
          },
        },
        fromNurseUserId:
          objectId,
        fromNurseStaffId:
          objectId,
        toNurseUserId:
          objectId,
        toNurseStaffId:
          objectId,
        handedOverAt: {
          bsonType: 'date',
        },
        status: {
          bsonType: 'string',
          enum: [
            ...wardHandoverStatusValues,
          ],
        },
        signedAt:
          nullableDate,
        acknowledgedAt:
          nullableDate,
        acknowledgedByUserId:
          nullableObjectId,
        acknowledgedByStaffId:
          nullableObjectId,
        supersedesWardHandoverId:
          nullableObjectId,
        supersededByWardHandoverId:
          nullableObjectId,
      },
    },
  },

  nursingEntryAmendments: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'facilityId',
        'admissionId',
        'patientId',
        'entityType',
        'entityId',
        'amendmentSequence',
        'amendmentType',
        'previousSnapshotHash',
        'reason',
        'occurredAt',
        'performedByUserId',
        'performedByStaffId',
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
        _id: objectId,
        facilityId: objectId,
        admissionId: objectId,
        patientId: objectId,
        entityType: {
          bsonType: 'string',
          enum: [
            ...nursingAmendmentEntityTypeValues,
          ],
        },
        entityId: objectId,
        amendmentSequence: {
          bsonType: 'number',
          minimum: 1,
        },
        amendmentType: {
          bsonType: 'string',
          enum: [
            ...nursingAmendmentTypeValues,
          ],
        },
        previousSnapshotHash: {
          bsonType: 'string',
        },
        replacementEntityId:
          nullableObjectId,
        reason: {
          bsonType: 'string',
        },
        occurredAt: {
          bsonType: 'date',
        },
        performedByUserId:
          objectId,
        performedByStaffId:
          objectId,
        transactionId: {
          bsonType: 'string',
        },
        correlationId: {
          bsonType: 'string',
        },
        schemaVersion: {
          bsonType: 'number',
          minimum: 1,
        },
        version: {
          bsonType: 'number',
          minimum: 0,
        },
        createdBy: objectId,
        updatedBy: objectId,
        createdAt: {
          bsonType: 'date',
        },
        updatedAt: {
          bsonType: 'date',
        },
      },
    },
  },
} as const;

const models = {
  nursingNotes:
    NursingNoteModel,

  nursingNoteVersions:
    NursingNoteVersionModel,

  medicationSchedules:
    MedicationScheduleModel,

  medicationAdministrations:
    MedicationAdministrationModel,

  medicationAdministrationAmendments:
    MedicationAdministrationAmendmentModel,

  wardHandovers:
    WardHandoverModel,

  nursingEntryAmendments:
    NursingEntryAmendmentModel,
} as const;

async function ensureCollection(
  database:
    Db,

  name:
    keyof typeof validators,
): Promise<void> {
  const existing =
    await database
      .listCollections(
        {
          name,
        },
        {
          nameOnly: true,
        },
      )
      .hasNext();

  if (
    !existing
  ) {
    await database.createCollection(
      name,
      {
        validator:
          validators[name],

        validationLevel:
          'strict',

        validationAction:
          'error',
      },
    );
  } else {
    await database.command({
      collMod:
        name,

      validator:
        validators[name],

      validationLevel:
        'strict',

      validationAction:
        'error',
    });
  }

  const indexes =
    models[name].schema.indexes();

  for (
    const [
      keys,
      options,
    ] of indexes
  ) {
    await database
      .collection(
        name,
      )
      .createIndex(
        keys,
        options as IndexDescription,
      );
  }
}

export const inpatientNursingMigration:
  Migration = {
    id:
      '021-inpatient-nursing',

    description:
      'Create inpatient nursing notes, medication administration, handover, and immutable amendment collections',

    async up(
      database:
        Db,
    ): Promise<void> {
      for (
        const name of
        Object.keys(
          validators,
        ) as Array<
          keyof typeof validators
        >
      ) {
        await ensureCollection(
          database,
          name,
        );
      }
    },
  };