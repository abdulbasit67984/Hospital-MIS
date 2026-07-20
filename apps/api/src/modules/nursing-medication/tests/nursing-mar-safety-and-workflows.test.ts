import {
  Decimal128,
} from 'mongodb';

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
  DefaultNursingMedicationSafetyPolicy,
} from '../nursing-mar.safety-policy.js';

import type {
  MarMedicationAdministrationRecord,
  MarMedicationScheduleRecord,
} from '../nursing-mar.persistence.types.js';

import type {
  NursingMarCommandService,
} from '../services/nursing-mar-command.service.js';

import {
  AdministerMedicationDoseWorkflow,
} from '../workflows/nursing-medication-dose.workflows.js';

import {
  CorrectMedicationAdministrationWorkflow,
} from '../workflows/nursing-medication-correction.workflows.js';

import {
  GetMedicationComplianceWorkflow,
} from '../workflows/nursing-medication-query.workflows.js';

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

  room:
    '507f1f77bcf86cd799439006',

  bed:
    '507f1f77bcf86cd799439007',

  user:
    '507f1f77bcf86cd799439008',

  staff:
    '507f1f77bcf86cd799439009',

  schedule:
    '507f1f77bcf86cd799439010',

  administration:
    '507f1f77bcf86cd799439011',

  prescription:
    '507f1f77bcf86cd799439012',

  prescriptionItem:
    '507f1f77bcf86cd799439013',

  medicine:
    '507f1f77bcf86cd799439014',

  formulary:
    '507f1f77bcf86cd799439015',
};

const fixedNow =
  new Date(
    '2026-07-20T10:00:00.000Z',
  );

function oid(
  value:
    string,
): Types.ObjectId {
  return new Types.ObjectId(
    value,
  );
}

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
    'nursing.medication_administer',
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
      '507f1f77bcf86cd799439099',

    roomId:
      ids.room,

    roomNumber:
      '101',

    roomName:
      'Room 101',

    bedId:
      ids.bed,

    bedNumber:
      '1',

    bedLabel:
      '101-1',

    bedCategory:
      'GENERAL',
  },

  alerts:
    [],

  allergies:
    [],
};

function schedule(
  overrides:
    Partial<MarMedicationScheduleRecord> = {},
): MarMedicationScheduleRecord {
  return {
    _id:
      oid(
        ids.schedule,
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
      oid(
        ids.room,
      ),

    bedId:
      oid(
        ids.bed,
      ),

    scheduleNumber:
      'MAR-SCH-2026-0000001',

    prescriptionId:
      oid(
        ids.prescription,
      ),

    prescriptionItemId:
      oid(
        ids.prescriptionItem,
      ),

    source:
      'PRESCRIPTION',

    medicineId:
      oid(
        ids.medicine,
      ),

    formularyItemId:
      oid(
        ids.formulary,
      ),

    medicineDisplay:
      'Fictional Medicine 500 mg tablet',

    prescribedDose:
      Decimal128.fromString(
        '500',
      ) as never,

    doseUnitCode:
      'MG',

    route:
      'ORAL',

    frequencyCode:
      'BID',

    scheduledTimes: [
      fixedNow,

      new Date(
        '2026-07-20T22:00:00.000Z',
      ),
    ],

    prn:
      false,

    prnIndication:
      null,

    startAt:
      fixedNow,

    endAt:
      null,

    status:
      'ACTIVE',

    holdReason:
      null,

    orderedByUserId:
      oid(
        ids.user,
      ),

    orderedByStaffId:
      oid(
        ids.staff,
      ),

    lastAdministrationAt:
      null,

    nextScheduledAt:
      fixedNow,

    transactionId:
      'transaction-old',

    correlationId:
      'correlation-test',

    schemaVersion:
      1,

    version:
      2,

    createdBy:
      oid(
        ids.user,
      ),

    updatedBy:
      oid(
        ids.user,
      ),

    createdAt:
      fixedNow,

    updatedAt:
      fixedNow,

    ...overrides,
  };
}

function administration(
  overrides:
    Partial<MarMedicationAdministrationRecord> = {},
): MarMedicationAdministrationRecord {
  return {
    _id:
      oid(
        ids.administration,
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
      oid(
        ids.room,
      ),

    bedId:
      oid(
        ids.bed,
      ),

    administrationNumber:
      'MAR-ADM-2026-0000001',

    medicationScheduleId:
      oid(
        ids.schedule,
      ),

    prescriptionId:
      oid(
        ids.prescription,
      ),

    prescriptionItemId:
      oid(
        ids.prescriptionItem,
      ),

    medicineId:
      oid(
        ids.medicine,
      ),

    medicineDisplaySnapshot:
      'Fictional Medicine 500 mg tablet',

    scheduledAt:
      fixedNow,

    status:
      'ADMINISTERED',

    prescribedDose:
      Decimal128.fromString(
        '500',
      ) as never,

    administeredDose:
      Decimal128.fromString(
        '500',
      ) as never,

    doseUnitCode:
      'MG',

    prescribedRoute:
      'ORAL',

    administeredRoute:
      'ORAL',

    administeredAt:
      fixedNow,

    administeringNurseUserId:
      oid(
        ids.user,
      ),

    administeringNurseStaffId:
      oid(
        ids.staff,
      ),

    reasonCode:
      null,

    reason:
      null,

    notes:
      null,

    delayedUntil:
      null,

    statusChangedAt:
      fixedNow,

    statusChangedBy:
      oid(
        ids.user,
      ),

    correctionOfAdministrationId:
      null,

    supersededByAdministrationId:
      null,

    transactionId:
      'transaction-old',

    correlationId:
      'correlation-test',

    schemaVersion:
      1,

    version:
      0,

    createdBy:
      oid(
        ids.user,
      ),

    updatedBy:
      oid(
        ids.user,
      ),

    createdAt:
      fixedNow,

    updatedAt:
      fixedNow,

    ...overrides,
  };
}

function orderTrace() {
  return {
    prescriptionId:
      ids.prescription,

    prescriptionItemId:
      ids.prescriptionItem,

    facilityId:
      ids.facility,

    patientId:
      ids.patient,

    encounterId:
      ids.encounter,

    prescriptionStatus:
      'DISPENSED' as const,

    prescriptionItemStatus:
      'ACTIVE' as const,

    medicineId:
      ids.medicine,

    formularyItemId:
      ids.formulary,

    medicineDisplay:
      'Fictional Medicine 500 mg tablet',

    prescribedDose:
      '500',

    doseUnitCode:
      'MG',

    prescribedRoute:
      'ORAL' as const,

    frequencyCode:
      'BID',

    asNeeded:
      false,

    asNeededReason:
      null,

    startDate:
      '2026-07-20',

    endDate:
      null,

    orderedByUserId:
      ids.user,

    orderedByStaffId:
      ids.staff,

    dispensedQuantity:
      '10',

    lastDispensationId:
      '507f1f77bcf86cd799439016',

    stockTracked:
      true,

    highAlert:
      false,

    controlledMedicine:
      false,

    openWarnings:
      [],
  };
}

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
  'MAR medication safety',
  () => {
    it(
      'blocks an incorrect dose and missing dispensation trace',
      async () => {
        const policy =
          new DefaultNursingMedicationSafetyPolicy();

        const configuration =
          await policy.configuration(
            ids.facility,
            ids.ward,
          );

        const result =
          policy.evaluate(
            configuration,
            {
              context,

              schedule:
                schedule(),

              orderTrace: {
                ...orderTrace(),

                dispensedQuantity:
                  '0',

                lastDispensationId:
                  null,
              },

              scheduledAt:
                fixedNow,

              administeredAt:
                fixedNow,

              administeredDose:
                '250',

              administeredRoute:
                'ORAL',
            },
          );

        expect(
          result.allowed,
        ).toBe(false);

        expect(
          result.findings.map(
            (item) =>
              item.code,
          ),
        ).toEqual(
          expect.arrayContaining([
            'DOSE_MISMATCH',
            'DISPENSATION_TRACE_MISSING',
          ]),
        );
      },
    );

    it(
      'allows the five medication rights with valid order trace',
      async () => {
        const policy =
          new DefaultNursingMedicationSafetyPolicy();

        const configuration =
          await policy.configuration(
            ids.facility,
            ids.ward,
          );

        const result =
          policy.evaluate(
            configuration,
            {
              context,

              schedule:
                schedule(),

              orderTrace:
                orderTrace(),

              scheduledAt:
                fixedNow,

              administeredAt:
                fixedNow,

              administeredDose:
                '500',

              administeredRoute:
                'ORAL',
            },
          );

        expect(
          result.allowed,
        ).toBe(true);

        expect({
          rightPatient:
            result.rightPatient,

          rightMedicine:
            result.rightMedicine,

          rightDose:
            result.rightDose,

          rightRoute:
            result.rightRoute,

          rightTime:
            result.rightTime,
        }).toEqual({
          rightPatient:
            true,

          rightMedicine:
            true,

          rightDose:
            true,

          rightRoute:
            true,

          rightTime:
            true,
        });
      },
    );
  },
);

describe(
  'MAR command workflows',
  () => {
    it(
      'blocks duplicate current entries for the same scheduled dose',
      async () => {
        const service = {
          requireSchedule:
            vi.fn(
              async () =>
                schedule(),
            ),

          assertVersion:
            vi.fn(),

          resolveContextForSchedule:
            vi.fn(
              async () =>
                context,
            ),

          repository: {
            findCurrentAdministrationForDose:
              vi.fn(
                async () =>
                  administration(),
              ),
          },

          support: {
            assertAccess:
              vi.fn(),
          },
        } as unknown as
          NursingMarCommandService;

        const workflow =
          new AdministerMedicationDoseWorkflow(
            service,
          );

        await expect(
          workflow.execute({
            actor,

            entityId:
              ids.schedule,

            idempotencyKey:
              'dose-administer-duplicate',

            input: {
              expectedScheduleVersion:
                2,

              scheduledAt:
                fixedNow.toISOString(),

              administeredDose:
                '500',

              administeredRoute:
                'ORAL',
            },
          }),
        ).rejects.toThrow(
          /already exists/iu,
        );
      },
    );

    it(
      'creates an administered MAR entry and advances schedule state',
      async () => {
        const created =
          administration();

        const createAdministration =
          vi.fn(
            async () =>
              created,
          );

        const updateSchedule =
          vi.fn(
            async () =>
              schedule({
                version:
                  3,

                lastAdministrationAt:
                  fixedNow,

                nextScheduledAt:
                  new Date(
                    '2026-07-20T22:00:00.000Z',
                  ),
              }),
          );

        const service = {
          requireSchedule:
            vi.fn(
              async () =>
                schedule(),
            ),

          assertVersion:
            vi.fn(),

          resolveContextForSchedule:
            vi.fn(
              async () =>
                context,
            ),

          evaluateAdministrationSafety:
            vi.fn(
              async () => ({
                allowed:
                  true,

                rightPatient:
                  true,

                rightMedicine:
                  true,

                rightDose:
                  true,

                rightRoute:
                  true,

                rightTime:
                  true,

                orderActive:
                  true,

                dispensationTraceSatisfied:
                  true,

                findings:
                  [],
              }),
            ),

          assertSafetyAllowed:
            vi.fn(),

          administrationEventPayload:
            vi.fn(
              () => ({
                medicationAdministrationId:
                  ids.administration,
              }),
            ),

          repository: {
            findCurrentAdministrationForDose:
              vi.fn(
                async () =>
                  null,
              ),

            createAdministration,

            deriveScheduleState:
              vi.fn(
                async () => ({
                  lastAdministrationAt:
                    fixedNow,

                  nextScheduledAt:
                    new Date(
                      '2026-07-20T22:00:00.000Z',
                    ),
                }),
              ),

            updateSchedule,
          },

          support: {
            assertAccess:
              vi.fn(),

            actorStaffId:
              vi.fn(
                async () =>
                  ids.staff,
              ),

            objectId:
              oid,

            nullableText:
              (
                value:
                  | string
                  | null
                  | undefined,
              ) =>
                value ?? null,

            allocateNumber:
              vi.fn(
                async () => ({
                  number:
                    'MAR-ADM-2026-0000001',

                  sequenceKey:
                    'mar:2026',

                  sequenceValue:
                    1,
                }),
              ),

            dependencies: {
              transactionManager:
                transactionManager(),

              clock: {
                now:
                  () =>
                    fixedNow,
              },

              snapshotCrypto: {
                protect:
                  vi.fn(
                    () => ({
                      encryptedValue: {
                        algorithm:
                          'AES-256-GCM',

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
                        'a'.repeat(64),
                    }),
                  ),
              },
            },

            publishMutation:
              vi.fn(),
          },
        } as unknown as
          NursingMarCommandService;

        const workflow =
          new AdministerMedicationDoseWorkflow(
            service,
          );

        const result =
          await workflow.execute({
            actor,

            entityId:
              ids.schedule,

            idempotencyKey:
              'dose-administer-001',

            input: {
              expectedScheduleVersion:
                2,

              scheduledAt:
                fixedNow.toISOString(),

              administeredDose:
                '500',

              administeredRoute:
                'ORAL',
            },
          });

        expect(
          createAdministration,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            status:
              'ADMINISTERED',

            administeringNurseStaffId:
              expect.anything(),
          }),
        );

        expect(
          updateSchedule,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          result.administration.status,
        ).toBe(
          'ADMINISTERED',
        );
      },
    );

    it(
      'creates a replacement and immutable amendment when correcting MAR',
      async () => {
        const original =
          administration();

        const replacement =
          administration({
            _id:
              new Types.ObjectId(),

            administrationNumber:
              'MAR-ADM-2026-0000002',

            status:
              'REFUSED',

            administeredDose:
              null,

            administeredRoute:
              null,

            administeredAt:
              null,

            administeringNurseUserId:
              null,

            administeringNurseStaffId:
              null,

            reasonCode:
              'PATIENT_REFUSED',

            reason:
              'Patient declined after counselling',

            correctionOfAdministrationId:
              original._id,
          });

        const createAmendment =
          vi.fn(
            async (input) => ({
              _id:
                new Types.ObjectId(),

              createdAt:
                fixedNow,

              updatedAt:
                fixedNow,

              ...input,
            }),
          );

        const service = {
          requireAdministration:
            vi.fn(
              async () =>
                original,
            ),

          requireSchedule:
            vi.fn(
              async () =>
                schedule(),
            ),

          assertVersion:
            vi.fn(),

          resolveContextForSchedule:
            vi.fn(
              async () =>
                context,
            ),

          administrationEventPayload:
            vi.fn(
              (record) => ({
                medicationAdministrationId:
                  record._id.toHexString(),

                status:
                  record.status,
              }),
            ),

          repository: {
            createAdministration:
              vi.fn(
                async () =>
                  replacement,
              ),

            updateAdministrationSupersession:
              vi.fn(
                async () => ({
                  ...original,

                  supersededByAdministrationId:
                    replacement._id,

                  version:
                    1,
                }),
              ),

            createAdministrationAmendment:
              createAmendment,

            deriveScheduleState:
              vi.fn(
                async () => ({
                  lastAdministrationAt:
                    null,

                  nextScheduledAt:
                    new Date(
                      '2026-07-20T22:00:00.000Z',
                    ),
                }),
              ),

            updateSchedule:
              vi.fn(
                async () =>
                  schedule({
                    version:
                      3,
                  }),
              ),
          },

          support: {
            assertAccess:
              vi.fn(),

            actorStaffId:
              vi.fn(
                async () =>
                  ids.staff,
              ),

            objectId:
              oid,

            normalizedCode:
              (
                value:
                  string,
              ) =>
                value.toUpperCase(),

            normalizedText:
              (
                value:
                  string,
              ) =>
                value.trim(),

            nullableText:
              (
                value:
                  | string
                  | null
                  | undefined,
              ) =>
                value ?? null,

            allocateNumber:
              vi.fn(
                async () => ({
                  number:
                    'MAR-ADM-2026-0000002',

                  sequenceKey:
                    'mar:2026',

                  sequenceValue:
                    2,
                }),
              ),

            dependencies: {
              transactionManager:
                transactionManager(),

              clock: {
                now:
                  () =>
                    fixedNow,
              },

              snapshotCrypto: {
                protect:
                  vi.fn(
                    () => ({
                      encryptedValue: {
                        algorithm:
                          'AES-256-GCM',

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
                        'a'.repeat(64),
                    }),
                  ),
              },
            },

            publishMutation:
              vi.fn(),
          },
        } as unknown as
          NursingMarCommandService;

        const workflow =
          new CorrectMedicationAdministrationWorkflow(
            service,
          );

        const result =
          await workflow.execute({
            actor,

            entityId:
              ids.administration,

            idempotencyKey:
              'administration-correct-001',

            input: {
              expectedAdministrationVersion:
                0,

              reason:
                'Correcting administration status recorded against the wrong patient response',

              replacement: {
                status:
                  'REFUSED',

                reasonCode:
                  'PATIENT_REFUSED',

                reason:
                  'Patient declined after counselling',
              },
            },
          });

        expect(
          createAmendment,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            amendmentType:
              'CORRECTION',

            previousStatus:
              'ADMINISTERED',

            replacementAdministrationId:
              replacement._id,
          }),
        );

        expect(
          result.status,
        ).toBe(
          'REFUSED',
        );
      },
    );

    it(
      'calculates medication compliance from current MAR revisions',
      async () => {
        const service = {
          repository: {
            medicationCompliance:
              vi.fn(
                async () => ({
                  scheduled:
                    10,

                  administered:
                    8,

                  omitted:
                    1,

                  refused:
                    1,

                  delayed:
                    0,

                  cancelled:
                    0,

                  completedDoses:
                    10,
                }),
              ),
          },

          support: {
            resolveAdmission:
              vi.fn(
                async () =>
                  context,
              ),

            assertAccess:
              vi.fn(),
          },
        } as unknown as
          NursingMarCommandService;

        const workflow =
          new GetMedicationComplianceWorkflow(
            service,
          );

        const result =
          await workflow.execute(
            actor,
            {
              admissionId:
                ids.admission,

              from:
                '2026-07-20T00:00:00.000Z',

              to:
                '2026-07-21T00:00:00.000Z',
            },
          );

        expect(
          result.compliancePercent,
        ).toBe(
          '80.00',
        );
      },
    );
  },
);