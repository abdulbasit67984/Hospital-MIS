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
  MedicationAdministrationService,
} from '../services/medication-administration.service.js';

import {
  DefaultMedicationTimingPolicy,
  MedicationSafetyPolicyService,
} from '../services/medication-safety-policy.service.js';

import type {
  MedicationAdministrationRecord,
  MedicationScheduleRecord,
} from '../medication-administration.ports.js';

import type {
  NursingMedicationCommandService,
} from '../services/nursing-medication-command.service.js';

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
  administration:
    '507f1f77bcf86cd799439010',
} as const;

function oid(
  value: string,
) {
  return new Types.ObjectId(
    value,
  );
}

function schedule(): MedicationScheduleRecord {
  const now =
    new Date(
      '2026-07-20T08:00:00.000Z',
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
      'BID',
    scheduledTimes: [
      new Date(
        '2026-07-20T10:00:00.000Z',
      ),
      new Date(
        '2026-07-20T18:00:00.000Z',
      ),
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
      new Date(
        '2026-07-20T10:00:00.000Z',
      ),
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
  };
}

function administration(): MedicationAdministrationRecord {
  const occurredAt =
    new Date(
      '2026-07-20T10:00:00.000Z',
    );

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
      null,
    bedId:
      null,
    administrationNumber:
      'MAA-2026-0000001',
    medicationScheduleId:
      oid(
        ids.schedule,
      ),
    prescriptionId:
      null,
    prescriptionItemId:
      null,
    medicineId:
      oid(
        ids.medicine,
      ),
    medicineDisplaySnapshot:
      'Fictional Medicine 500 mg',
    scheduledAt:
      occurredAt,
    status:
      'ADMINISTERED',
    prescribedDose:
      Types.Decimal128.fromString(
        '500',
      ),
    administeredDose:
      Types.Decimal128.fromString(
        '500',
      ),
    doseUnitCode:
      'MG',
    prescribedRoute:
      'ORAL',
    administeredRoute:
      'ORAL',
    administeredAt:
      occurredAt,
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
      occurredAt,
    statusChangedBy:
      oid(
        ids.user,
      ),
    correctionOfAdministrationId:
      null,
    supersededByAdministrationId:
      null,
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
      occurredAt,
    updatedAt:
      occurredAt,
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
    'reports.clinical.read',
  ],
};

describe(
  'medication administration compliance',
  () => {
    it(
      'counts unrecorded scheduled slots as non-compliant',
      async () => {
        const repository = {
          listSchedulesForCompliance:
            vi.fn(
              async () => [
                schedule(),
              ],
            ),
          listCurrentAdministrationsForSchedules:
            vi.fn(
              async () => [
                administration(),
              ],
            ),
        };

        const support = {
          resolveAdmission:
            vi.fn(
              async () => ({
                admissionId:
                  ids.admission,
              }),
            ),
          assertAccess:
            vi.fn(),
        } as unknown as
          NursingMedicationCommandService;

        const service =
          new MedicationAdministrationService(
            support,
            repository as never,
            new MedicationSafetyPolicyService(
              new DefaultMedicationTimingPolicy(),
            ),
          );

        const result =
          await service.compliance(
            actor,
            {
              admissionId:
                ids.admission,
              from:
                '2026-07-20T00:00:00.000Z',
              to:
                '2026-07-20T23:59:59.999Z',
            },
          );

        expect(
          result,
        ).toEqual(
          expect.objectContaining({
            scheduled:
              2,
            administered:
              1,
            unrecorded:
              1,
            compliancePercent:
              50,
          }),
        );
      },
    );

    it(
      'reports one hundred percent when there are no scheduled non-PRN slots',
      async () => {
        const repository = {
          listSchedulesForCompliance:
            vi.fn(
              async () => [
                {
                  ...schedule(),
                  prn:
                    true,
                },
              ],
            ),
          listCurrentAdministrationsForSchedules:
            vi.fn(
              async () => [],
            ),
        };

        const support = {
          resolveAdmission:
            vi.fn(
              async () => ({
                admissionId:
                  ids.admission,
              }),
            ),
          assertAccess:
            vi.fn(),
        } as unknown as
          NursingMedicationCommandService;

        const service =
          new MedicationAdministrationService(
            support,
            repository as never,
            new MedicationSafetyPolicyService(
              new DefaultMedicationTimingPolicy(),
            ),
          );

        const result =
          await service.compliance(
            actor,
            {
              admissionId:
                ids.admission,
              from:
                '2026-07-20T00:00:00.000Z',
              to:
                '2026-07-20T23:59:59.999Z',
            },
          );

        expect(
          result.scheduled,
        ).toBe(0);

        expect(
          result.compliancePercent,
        ).toBe(100);
      },
    );
  },
);