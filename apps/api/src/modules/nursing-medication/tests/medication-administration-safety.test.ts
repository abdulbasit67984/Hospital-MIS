import {
  Types,
} from 'mongoose';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  createMedicationAdministrationScheduleBodySchema,
  recordMedicationAdministrationBodySchema,
} from '../medication-administration.validation.js';

import {
  DefaultMedicationTimingPolicy,
  MedicationSafetyPolicyService,
} from '../services/medication-safety-policy.service.js';

import type {
  MedicationScheduleRecord,
} from '../medication-administration.ports.js';

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
  medicine:
    '507f1f77bcf86cd799439008',
  schedule:
    '507f1f77bcf86cd799439009',
  secondUser:
    '507f1f77bcf86cd799439010',
  secondStaff:
    '507f1f77bcf86cd799439011',
} as const;

const scheduledAt =
  new Date(
    '2026-07-20T10:00:00.000Z',
  );

function oid(
  value: string,
) {
  return new Types.ObjectId(
    value,
  );
}

function schedule(
  overrides:
    Partial<MedicationScheduleRecord> = {},
): MedicationScheduleRecord {
  const now =
    new Date(
      '2026-07-20T09:45:00.000Z',
    );

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
      null,
    bedId:
      null,
    scheduleNumber:
      'MAR-2026-0000001',
    prescriptionId:
      null,
    prescriptionItemId:
      null,
    source:
      'MANUAL_RECOVERY',
    medicineId:
      oid(
        ids.medicine,
      ),
    formularyItemId:
      null,
    medicineDisplay:
      'Fictional Medicine 500 mg',
    prescribedDose:
      Types.Decimal128.fromString(
        '500',
      ),
    doseUnitCode:
      'MG',
    route:
      'ORAL',
    frequencyCode:
      'OD',
    scheduledTimes: [
      scheduledAt,
    ],
    prn:
      false,
    prnIndication:
      null,
    startAt:
      new Date(
        '2026-07-20T00:00:00.000Z',
      ),
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
      scheduledAt,
    version:
      0,
    transactionId:
      'transaction-test',
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
      now,
    updatedAt:
      now,
    ...overrides,
  };
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

function administrationInput() {
  return {
    expectedScheduleVersion:
      0,
    scheduledAt:
      scheduledAt.toISOString(),
    status:
      'ADMINISTERED' as const,
    patientConfirmation: {
      patientId:
        ids.patient,
      mrn:
        'HOSP-2026-000001',
      birthDate:
        '1990-01-01',
    },
    administeredDose:
      '500',
    administeredRoute:
      'ORAL' as const,
    administeredAt:
      scheduledAt.toISOString(),
  };
}

describe(
  'medication administration validation and safety',
  () => {
    it(
      'requires prescription and prescription-item trace together',
      () => {
        const result =
          createMedicationAdministrationScheduleBodySchema.safeParse({
            admissionId:
              ids.admission,
            prescriptionId:
              '507f1f77bcf86cd799439012',
            source:
              'PRESCRIPTION',
            medicineId:
              ids.medicine,
            medicineDisplay:
              'Fictional Medicine 500 mg',
            prescribedDose:
              '500',
            doseUnitCode:
              'MG',
            route:
              'ORAL',
            frequencyCode:
              'OD',
            scheduledTimes: [
              scheduledAt.toISOString(),
            ],
            startAt:
              '2026-07-20T00:00:00.000Z',
            orderedByUserId:
              ids.user,
            orderedByStaffId:
              ids.staff,
          });

        expect(
          result.success,
        ).toBe(false);
      },
    );

    it(
      'rejects an administered outcome without a dose and route',
      () => {
        const result =
          recordMedicationAdministrationBodySchema.safeParse({
            expectedScheduleVersion:
              0,
            scheduledAt:
              scheduledAt.toISOString(),
            status:
              'ADMINISTERED',
            patientConfirmation: {
              patientId:
                ids.patient,
              mrn:
                'HOSP-2026-000001',
              birthDate:
                '1990-01-01',
            },
          });

        expect(
          result.success,
        ).toBe(false);
      },
    );

    it(
      'blocks a patient identity mismatch',
      async () => {
        const safety =
          new MedicationSafetyPolicyService(
            new DefaultMedicationTimingPolicy(),
          );

        await expect(
          safety.validateAdministration({
            actor,
            context,
            schedule:
              schedule(),
            orderTrace: {
              valid:
                true,
              prescriptionStatus:
                null,
              prescriptionItemStatus:
                null,
              highAlert:
                false,
              controlledMedicine:
                false,
              blockingReasons:
                [],
            },
            command: {
              ...administrationInput(),
              patientConfirmation: {
                patientId:
                  '507f1f77bcf86cd799439099',
                mrn:
                  'HOSP-2026-000001',
                birthDate:
                  '1990-01-01',
              },
            },
            now:
              scheduledAt,
            delayedSourceExists:
              false,
          }),
        ).rejects.toThrow(
          'patient confirmation failed',
        );
      },
    );

    it(
      'requires a second nurse for a high-alert medication',
      async () => {
        const safety =
          new MedicationSafetyPolicyService(
            new DefaultMedicationTimingPolicy(),
          );

        await expect(
          safety.validateAdministration({
            actor,
            context,
            schedule:
              schedule(),
            orderTrace: {
              valid:
                true,
              prescriptionStatus:
                'ISSUED',
              prescriptionItemStatus:
                'ACTIVE',
              highAlert:
                true,
              controlledMedicine:
                false,
              blockingReasons:
                [],
            },
            command:
              administrationInput(),
            now:
              scheduledAt,
            delayedSourceExists:
              false,
          }),
        ).rejects.toThrow(
          'independent double-check',
        );
      },
    );

    it(
      'accepts a fresh independent high-alert double-check by another user',
      async () => {
        const safety =
          new MedicationSafetyPolicyService(
            new DefaultMedicationTimingPolicy(),
          );

        await expect(
          safety.validateAdministration({
            actor,
            context,
            schedule:
              schedule(),
            orderTrace: {
              valid:
                true,
              prescriptionStatus:
                'ISSUED',
              prescriptionItemStatus:
                'ACTIVE',
              highAlert:
                true,
              controlledMedicine:
                false,
              blockingReasons:
                [],
            },
            command: {
              ...administrationInput(),
              independentDoubleCheck: {
                performedByUserId:
                  ids.secondUser,
                performedByStaffId:
                  ids.secondStaff,
                confirmedAt:
                  '2026-07-20T09:55:00.000Z',
                confirmationMethod:
                  'TWO_PERSON_VISUAL',
              },
            },
            now:
              scheduledAt,
            delayedSourceExists:
              false,
          }),
        ).resolves.toEqual(
          expect.objectContaining({
            highAlertEarlyWindowMinutes:
              15,
          }),
        );
      },
    );
  },
);