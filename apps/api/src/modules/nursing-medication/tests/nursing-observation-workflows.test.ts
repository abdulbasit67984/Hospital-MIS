import {
  Types,
} from 'mongoose';

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  RecordNursingVitalObservationWorkflow,
} from '../workflows/nursing-vital-observation.workflows.js';

import {
  CorrectWardHandoverWorkflow,
} from '../workflows/nursing-handover.workflows.js';

import type {
  NursingObservationCommandService,
} from '../services/nursing-observation-command.service.js';

const ids = {
  facility:
    '507f1f77bcf86cd799439001',

  admission:
    '507f1f77bcf86cd799439002',

  patient:
    '507f1f77bcf86cd799439003',

  encounter:
    '507f1f77bcf86cd799439004',

  ward:
    '507f1f77bcf86cd799439005',

  user:
    '507f1f77bcf86cd799439006',

  staff:
    '507f1f77bcf86cd799439007',

  handover:
    '507f1f77bcf86cd799439008',
};

const actor = {
  userId:
    ids.user,

  facilityId:
    ids.facility,

  correlationId:
    'correlation-test',

  roleKeys: [
    'WARD_NURSE',
  ],

  permissionKeys: [
    'nursing.read',
    'nursing.vitals.create',
    'nursing.handover.manage',
  ],
};

const context = {
  facilityId:
    ids.facility,

  admissionId:
    ids.admission,

  admissionNumber:
    'ADM-2026-0000001',

  admissionStatus:
    'ADMITTED' as const,

  isActive:
    true,

  encounterId:
    ids.encounter,

  admittedAt:
    '2026-07-20T08:00:00.000Z',

  clinicallyDischargedAt:
    null,

  dischargedAt:
    null,

  attendingConsultantUserId:
    ids.user,

  attendingConsultantStaffId:
    ids.staff,

  careTeam:
    [],

  patient: {
    patientId:
      ids.patient,

    displayName:
      'Fictional Patient',

    mrn:
      'HOSP-2026-000001',

    birthDate:
      '1990-01-01',

    estimatedAgeYears:
      null,

    sexAtBirth:
      'FEMALE',
  },

  location: {
    wardId:
      ids.ward,

    wardCode:
      'WARD-A',

    wardName:
      'Ward A',

    wardType:
      'GENERAL',

    nursingStationCode:
      'NS-A',

    departmentId:
      '507f1f77bcf86cd799439009',

    roomId:
      null,

    roomNumber:
      null,

    roomName:
      null,

    bedId:
      null,

    bedNumber:
      null,

    bedLabel:
      null,

    bedCategory:
      null,
  },

  alerts:
    [],

  allergies:
    [],
};

function transactionManager() {
  return {
    execute:
      vi.fn(
        async (
          request,
        ) =>
          request.execute({
            transactionId:
              'transaction-test',

            idempotencyKey:
              request.idempotencyKey,

            checkpoint:
              vi.fn(),

            registerCompensation:
              vi.fn(),
          }),
      ),
  };
}

describe(
  'nursing observation workflows',
  () => {
    it(
      'creates an escalation task for a critical observation',
      async () => {
        const createTask =
          vi.fn(
            async () =>
              '507f1f77bcf86cd799439099',
          );

        const service = {
          resolveAdmission:
            vi.fn(
              async () =>
                context,
            ),

          vitalCommands: {
            record:
              vi.fn(
                async () => ({
                  vitalSignId:
                    '507f1f77bcf86cd799439010',

                  facilityId:
                    ids.facility,

                  admissionId:
                    ids.admission,

                  encounterId:
                    ids.encounter,

                  patientId:
                    ids.patient,

                  observerProviderId:
                    ids.staff,

                  source:
                    'MANUAL',

                  deviceIdentifier:
                    null,

                  measuredAt:
                    '2026-07-20T10:00:00.000Z',

                  recordedAt:
                    '2026-07-20T10:01:00.000Z',

                  bodyPosition:
                    'SITTING',

                  temperatureCelsius:
                    '37',

                  temperatureSite:
                    'ORAL',

                  pulsePerMinute:
                    140,

                  respiratoryRatePerMinute:
                    28,

                  systolicBloodPressureMmHg:
                    85,

                  diastolicBloodPressureMmHg:
                    50,

                  oxygenSaturationPercent:
                    '88',

                  bloodGlucoseMgDl:
                    null,

                  painScore:
                    2,

                  weightKg:
                    null,

                  heightCm:
                    null,

                  bmi:
                    null,

                  oxygenDeliveryMethod:
                    null,

                  oxygenFlowLitresPerMinute:
                    null,

                  status:
                    'RECORDED',

                  supersedesVitalSignId:
                    null,

                  supersededByVitalSignId:
                    null,

                  version:
                    0,
                }),
              ),
          },

          thresholds: {
            resolve:
              vi.fn(
                async () => ({
                  configurationVersion:
                    1,
                }),
              ),

            evaluate:
              vi.fn(
                () => ({
                  configurationVersion:
                    1,

                  totalScore:
                    12,

                  severity:
                    'CRITICAL',

                  requiresEscalation:
                    true,

                  requiresImmediateEscalation:
                    true,

                  triggeredRules:
                    [],
                }),
              ),
          },

          escalationTasks: {
            create:
              createTask,
          },

          support: {
            assertAccess:
              vi.fn(),

            auditActorFields:
              vi.fn(
                () => ({
                  actorUserId:
                    ids.user,

                  facilityId:
                    ids.facility,

                  correlationId:
                    'correlation-test',
                }),
              ),

            dependencies: {
              clock: {
                now:
                  () =>
                    new Date(
                      '2026-07-20T10:01:00.000Z',
                    ),
              },

              audit: {
                append:
                  vi.fn(),
              },

              outbox: {
                enqueue:
                  vi.fn(),
              },

              realtime: {
                publish:
                  vi.fn(),
              },
            },
          },
        } as unknown as
          NursingObservationCommandService;

        const workflow =
          new RecordNursingVitalObservationWorkflow(
            service,
          );

        const result =
          await workflow.execute({
            actor,

            idempotencyKey:
              'vital-record-001',

            input: {
              admissionId:
                ids.admission,

              measuredAt:
                '2026-07-20T10:00:00.000Z',

              pulsePerMinute:
                140,
            },
          });

        expect(
          createTask,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          result.escalationTaskId,
        ).toBe(
          '507f1f77bcf86cd799439099',
        );
      },
    );

    it(
      'corrects a signed handover by creating a linked replacement and amendment',
      async () => {
        const oid = (
          value: string,
        ) =>
          new Types.ObjectId(
            value,
          );

        const current = {
          _id:
            oid(
              ids.handover,
            ),

          facilityId:
            oid(
              ids.facility,
            ),

          admissionId:
            oid(
              ids.admission,
            ),

          patientId:
            oid(
              ids.patient,
            ),

          encounterId:
            oid(
              ids.encounter,
            ),

          wardId:
            oid(
              ids.ward,
            ),

          roomId:
            null,

          bedId:
            null,

          handoverNumber:
            'WHO-2026-0000001',

          handoverType:
            'SHIFT',

          shiftCode:
            'DAY',

          summary:
            'Original',

          activeConcerns:
            [],

          pendingTasks:
            [],

          medicationConcerns:
            [],

          safetyConcerns:
            [],

          fromNurseUserId:
            oid(
              ids.user,
            ),

          fromNurseStaffId:
            oid(
              ids.staff,
            ),

          toNurseUserId:
            oid(
              ids.user,
            ),

          toNurseStaffId:
            oid(
              ids.staff,
            ),

          handedOverAt:
            new Date(
              '2026-07-20T10:00:00.000Z',
            ),

          status:
            'SIGNED',

          signedAt:
            new Date(
              '2026-07-20T10:00:00.000Z',
            ),

          acknowledgedAt:
            null,

          acknowledgedByUserId:
            null,

          acknowledgedByStaffId:
            null,

          supersedesWardHandoverId:
            null,

          supersededByWardHandoverId:
            null,

          version:
            1,

          transactionId:
            'tx-old',

          correlationId:
            'correlation-test',

          schemaVersion:
            1,

          createdBy:
            oid(
              ids.user,
            ),

          updatedBy:
            oid(
              ids.user,
            ),

          createdAt:
            new Date(),

          updatedAt:
            new Date(),
        } as const;

        const replacement = {
          ...current,

          _id:
            new Types.ObjectId(),

          handoverNumber:
            'WHO-2026-0000002',

          version:
            0,

          supersedesWardHandoverId:
            current._id,
        };

        const createAmendment =
          vi.fn(
            async () =>
              new Types.ObjectId()
                .toHexString(),
          );

        const service = {
          requireHandover:
            vi.fn(
              async () =>
                current,
            ),

          resolveAdmission:
            vi.fn(
              async () =>
                context,
            ),

          assertVersion:
            vi.fn(),

          handovers: {
            createReplacement:
              vi.fn(
                async () =>
                  replacement,
              ),

            updateStatus:
              vi.fn(
                async () => ({
                  ...current,

                  status:
                    'CORRECTED',

                  version:
                    2,
                }),
              ),

            createAmendment,
          },

          handoverProjection:
            vi.fn(
              (record) => ({
                id:
                  record._id.toHexString(),

                status:
                  record.status,
              }),
            ),

          support: {
            assertAccess:
              vi.fn(),

            actorStaffId:
              vi.fn(
                async () =>
                  ids.staff,
              ),

            allocateNumber:
              vi.fn(
                async () => ({
                  number:
                    'WHO-2026-0000002',

                  sequenceKey:
                    'handover:2026',

                  sequenceValue:
                    2,
                }),
              ),

            normalizedCode:
              (
                value: string,
              ) =>
                value.toUpperCase(),

            normalizedText:
              (
                value: string,
              ) =>
                value.trim(),

            dependencies: {
              transactionManager:
                transactionManager(),

              clock: {
                now:
                  () =>
                    new Date(
                      '2026-07-20T10:05:00.000Z',
                    ),
              },

              snapshotCrypto: {
                protect:
                  vi.fn(
                    () => ({
                      encryptedValue: {
                        algorithm:
                          'AES',

                        keyId:
                          'key',

                        initializationVector:
                          'iv',

                        authenticationTag:
                          'tag',

                        ciphertext:
                          'cipher',
                      },

                      valueHash:
                        'a'.repeat(
                          64,
                        ),
                    }),
                  ),
              },
            },

            publishMutation:
              vi.fn(),
          },
        } as unknown as
          NursingObservationCommandService;

        const workflow =
          new CorrectWardHandoverWorkflow(
            service,
          );

        const result =
          await workflow.execute({
            actor,

            entityId:
              ids.handover,

            idempotencyKey:
              'handover-correct-001',

            input: {
              expectedVersion:
                1,

              reason:
                'Correcting the recipient and shift summary',

              replacement: {
                handoverType:
                  'SHIFT',

                shiftCode:
                  'NIGHT',

                summary:
                  'Corrected summary',

                activeConcerns:
                  [],

                pendingTasks:
                  [],

                medicationConcerns:
                  [],

                safetyConcerns:
                  [],

                toNurseUserId:
                  ids.user,

                toNurseStaffId:
                  ids.staff,

                handedOverAt:
                  '2026-07-20T10:05:00.000Z',
              },
            },
          });

        expect(
          createAmendment,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            amendmentType:
              'CORRECTION',
          }),
        );

        expect(
          result.correctedHandoverId,
        ).toBe(
          ids.handover,
        );
      },
    );
  },
);