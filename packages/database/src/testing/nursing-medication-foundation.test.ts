import mongoose from 'mongoose';

import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import {
  IntakeOutputEntryModel,
  NursingAssessmentModel,
  NursingCarePlanModel,
  NursingDeviceModel,
  NursingTaskModel,
} from '../models/nursing-medication.model.js';

import {
  nursingMedicationCollections,
  nursingMedicationFoundation,
  nursingMedicationValidators,
} from '../migrations/023-nursing-medication-foundation.js';

import {
  migrations,
} from '../migrations/index.js';

describe(
  'nursing and medication database foundation',
  () => {
    beforeEach(() => {
      mongoose.deleteModel(
        /NursingAssessment|NursingCarePlan|NursingTask|IntakeOutputEntry|NursingDevice/u,
      );
    });

    it(
      'uses migration 023 after the inpatient discharge migration',
      () => {
        expect(
          nursingMedicationFoundation.id,
        ).toBe(
          '023-nursing-medication-foundation',
        );

        expect(
          migrations.at(-1),
        ).toBe(
          nursingMedicationFoundation,
        );

        expect(
          migrations
            .slice(-2)
            .map(
              (migration) =>
                migration.id,
            ),
        ).toEqual([
          '022-inpatient-discharge',
          '023-nursing-medication-foundation',
        ]);
      },
    );

    it(
      'provides a strict validator for every new nursing collection',
      () => {
        expect(
          Object.keys(
            nursingMedicationValidators,
          ).sort(),
        ).toEqual(
          [
            ...nursingMedicationCollections,
          ].sort(),
        );

        for (
          const collectionName of
          nursingMedicationCollections
        ) {
          expect(
            nursingMedicationValidators[
              collectionName
            ],
          ).toHaveProperty(
            '$jsonSchema.bsonType',
            'object',
          );

          expect(
            nursingMedicationValidators[
              collectionName
            ],
          ).toHaveProperty(
            '$jsonSchema.properties.facilityId.bsonType',
            'objectId',
          );

          expect(
            nursingMedicationValidators[
              collectionName
            ],
          ).toHaveProperty(
            '$jsonSchema.properties.admissionId.bsonType',
            'objectId',
          );
        }
      },
    );

    it(
      'rejects a signed assessment without signer attribution',
      async () => {
        const id =
          new mongoose.Types.ObjectId();

        const assessment =
          new NursingAssessmentModel({
            facilityId: id,
            admissionId: id,
            patientId: id,
            encounterId: id,
            wardId: id,
            roomId: null,
            bedId: null,
            assessmentNumber:
              'NAS-2026-000001',
            assessmentType:
              'INITIAL',
            templateCode: null,
            templateVersion: null,
            sections: [],
            summary: null,
            overallRiskLevel:
              'LOW',
            requiresEscalation:
              false,
            escalationReason: null,
            assessedAt: new Date(),
            recordedAt: new Date(),
            backdatedEntryReason:
              null,
            assessedByUserId: id,
            assessedByStaffId: id,
            status: 'SIGNED',
            signedAt: null,
            signedByUserId: null,
            signedByStaffId: null,
            revisionNumber: 1,
            rootAssessmentId: id,
            supersedesAssessmentId:
              null,
            supersededByAssessmentId:
              null,
            correctionReason: null,
            enteredInErrorAt: null,
            enteredInErrorByUserId:
              null,
            enteredInErrorByStaffId:
              null,
            enteredInErrorReason:
              null,
            transactionId: 'tx-1',
            correlationId:
              'correlation-1',
            idempotencyKey:
              'assessment-key-1',
            schemaVersion: 1,
            version: 0,
            createdBy: id,
            updatedBy: id,
          });

        await expect(
          assessment.validate(),
        ).rejects.toThrow(
          /signing attribution/iu,
        );
      },
    );

    it(
      'rejects a completed care plan without completion attribution',
      async () => {
        const id =
          new mongoose.Types.ObjectId();

        const carePlan =
          new NursingCarePlanModel({
            facilityId: id,
            admissionId: id,
            patientId: id,
            encounterId: id,
            wardId: id,
            roomId: null,
            bedId: null,
            carePlanNumber:
              'NCP-2026-000001',
            title:
              'Mobility support',
            status: 'COMPLETED',
            problems: [],
            assignedNurseStaffId:
              null,
            assignedTeamCode: null,
            startedAt: new Date(),
            targetCompletionAt:
              null,
            nextReviewAt: null,
            lastReviewedAt: null,
            lastReviewedByStaffId:
              null,
            outcomeEvaluation:
              null,
            completedAt: null,
            completedByStaffId:
              null,
            cancellationReason:
              null,
            revisionNumber: 1,
            rootCarePlanId: id,
            supersedesCarePlanId:
              null,
            supersededByCarePlanId:
              null,
            correctionReason: null,
            transactionId: 'tx-2',
            correlationId:
              'correlation-2',
            idempotencyKey:
              'care-plan-key-1',
            schemaVersion: 1,
            version: 0,
            createdBy: id,
            updatedBy: id,
          });

        await expect(
          carePlan.validate(),
        ).rejects.toThrow(
          /completion attribution/iu,
        );
      },
    );

    it(
      'requires reasons for omitted nursing tasks',
      async () => {
        const id =
          new mongoose.Types.ObjectId();

        const task =
          new NursingTaskModel({
            facilityId: id,
            admissionId: id,
            patientId: id,
            encounterId: id,
            wardId: id,
            roomId: null,
            bedId: null,
            taskNumber:
              'NTK-2026-000001',
            sourceType: 'MANUAL',
            sourceRecordId: null,
            carePlanId: null,
            carePlanInterventionId:
              null,
            title:
              'Reposition patient',
            instructions: null,
            priority: 'ROUTINE',
            status: 'OMITTED',
            assignedStaffId: id,
            assignedTeamCode: null,
            scheduledAt: new Date(),
            dueAt: new Date(),
            recurrenceKey: null,
            carriedForwardFromTaskId:
              null,
            carriedForwardToTaskId:
              null,
            startedAt: null,
            completedAt: null,
            completedByUserId: null,
            completedByStaffId: null,
            dispositionReasonCode:
              null,
            dispositionReason: null,
            escalatedAt: null,
            escalatedToStaffId:
              null,
            escalationReason: null,
            transactionId: 'tx-3',
            correlationId:
              'correlation-3',
            idempotencyKey:
              'task-key-1',
            schemaVersion: 1,
            version: 0,
            createdBy: id,
            updatedBy: id,
          });

        await expect(
          task.validate(),
        ).rejects.toThrow(
          /require a reason/iu,
        );
      },
    );

    it(
      'rejects non-positive normalized intake-output volumes',
      async () => {
        const id =
          new mongoose.Types.ObjectId();

        const entry =
          new IntakeOutputEntryModel({
            facilityId: id,
            admissionId: id,
            patientId: id,
            encounterId: id,
            wardId: id,
            roomId: null,
            bedId: null,
            entryNumber:
              'NIO-2026-000001',
            direction: 'INTAKE',
            category: 'ORAL',
            sourceDescription:
              'Water',
            volumeMillilitres:
              mongoose.Types.Decimal128.fromString(
                '0',
              ),
            originalQuantity:
              mongoose.Types.Decimal128.fromString(
                '0',
              ),
            originalUnitCode: 'ML',
            conversionFactorToMillilitres:
              mongoose.Types.Decimal128.fromString(
                '1',
              ),
            occurredAt: new Date(),
            recordedAt: new Date(),
            shiftCode: 'DAY',
            recordedByUserId: id,
            recordedByStaffId: id,
            status: 'ACTIVE',
            rootEntryId: id,
            revisionNumber: 1,
            supersedesEntryId: null,
            supersededByEntryId: null,
            correctionReason: null,
            enteredInErrorAt: null,
            enteredInErrorByUserId:
              null,
            enteredInErrorByStaffId:
              null,
            enteredInErrorReason:
              null,
            transactionId: 'tx-4',
            correlationId:
              'correlation-4',
            idempotencyKey:
              'io-key-1',
            schemaVersion: 1,
            version: 0,
            createdBy: id,
            updatedBy: id,
          });

        await expect(
          entry.validate(),
        ).rejects.toThrow(
          /greater than zero/iu,
        );
      },
    );

    it(
      'requires wound details for wound records',
      async () => {
        const id =
          new mongoose.Types.ObjectId();

        const device =
          new NursingDeviceModel({
            facilityId: id,
            admissionId: id,
            patientId: id,
            encounterId: id,
            wardId: id,
            roomId: null,
            bedId: null,
            deviceNumber:
              'NDV-2026-000001',
            deviceType: 'WOUND',
            deviceName:
              'Sacral wound',
            anatomicalSite:
              'Sacral region',
            laterality: null,
            woundDetails: null,
            insertedAt: null,
            insertedByStaffId:
              null,
            status: 'ACTIVE',
            removedAt: null,
            removedByStaffId:
              null,
            removalReason: null,
            transactionId: 'tx-5',
            correlationId:
              'correlation-5',
            idempotencyKey:
              'device-key-1',
            schemaVersion: 1,
            version: 0,
            createdBy: id,
            updatedBy: id,
          });

        await expect(
          device.validate(),
        ).rejects.toThrow(
          /structured wound details/iu,
        );
      },
    );
  },
);