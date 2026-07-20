import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  createMedicationScheduleBodySchema,
  createNursingNoteBodySchema,
  createWardHandoverBodySchema,
  recordMedicationDoseBodySchema,
  recordNursingVitalSignBodySchema,
} from '../inpatient-nursing.validation.js';

const admissionId =
  '64b000000000000000000001';

const prescriptionId =
  '64b000000000000000000002';

const prescriptionItemId =
  '64b000000000000000000003';

const medicineId =
  '64b000000000000000000004';

const nurseUserId =
  '64b000000000000000000005';

const nurseStaffId =
  '64b000000000000000000006';

describe(
  'inpatient nursing validation',
  () => {
    it(
      'accepts a complete hourly vital-sign observation',
      () => {
        const result =
          recordNursingVitalSignBodySchema.safeParse({
            admissionId,

            measuredAt:
              '2026-07-20T09:00:00.000+05:00',

            bodyPosition:
              'SUPINE',

            temperatureCelsius:
              '38.2',

            pulsePerMinute:
              112,

            respiratoryRatePerMinute:
              24,

            systolicBloodPressureMmHg:
              102,

            diastolicBloodPressureMmHg:
              64,

            oxygenSaturationPercent:
              '93',

            bloodGlucoseMgDl:
              '138',

            painScore:
              4,

            notes:
              'Patient febrile; medical officer informed',
          });

        expect(
          result.success,
        ).toBe(
          true,
        );
      },
    );

    it(
      'rejects empty vital-sign observations',
      () => {
        const result =
          recordNursingVitalSignBodySchema.safeParse({
            admissionId,

            measuredAt:
              '2026-07-20T09:00:00.000+05:00',
          });

        expect(
          result.success,
        ).toBe(
          false,
        );
      },
    );

    it(
      'requires structured values for intake and output notes',
      () => {
        const invalid =
          createNursingNoteBodySchema.safeParse({
            admissionId,

            noteType:
              'INTAKE_OUTPUT',

            observationSeverity:
              'ROUTINE',

            title:
              'Hourly fluid balance',

            content:
              'Urine output recorded',
          });

        expect(
          invalid.success,
        ).toBe(
          false,
        );

        const valid =
          createNursingNoteBodySchema.safeParse({
            admissionId,

            noteType:
              'INTAKE_OUTPUT',

            observationSeverity:
              'ROUTINE',

            title:
              'Hourly fluid balance',

            content:
              'Urine output recorded',

            intakeOutput: {
              direction:
                'OUTPUT',

              route:
                'URINE',

              amountMillilitres:
                '250',
            },
          });

        expect(
          valid.success,
        ).toBe(
          true,
        );
      },
    );

    it(
      'requires escalation recipients for escalated observations',
      () => {
        const result =
          createNursingNoteBodySchema.safeParse({
            admissionId,

            noteType:
              'ESCALATION',

            observationSeverity:
              'CRITICAL',

            title:
              'Clinical deterioration',

            content:
              'Sudden fall in oxygen saturation',

            requiresEscalation:
              true,
          });

        expect(
          result.success,
        ).toBe(
          false,
        );
      },
    );

    it(
      'requires prescription references for prescription schedules',
      () => {
        const result =
          createMedicationScheduleBodySchema.safeParse({
            admissionId,

            source:
              'PRESCRIPTION',

            medicineId,

            medicineDisplay:
              'Ceftriaxone 1 g injection',

            prescribedDose:
              '1',

            doseUnitCode:
              'G',

            route:
              'INTRAVENOUS',

            frequencyCode:
              'BID',

            scheduledTimes: [
              '2026-07-20T08:00:00.000+05:00',
              '2026-07-20T20:00:00.000+05:00',
            ],

            startAt:
              '2026-07-20T08:00:00.000+05:00',

            orderedByUserId:
              nurseUserId,

            orderedByStaffId:
              nurseStaffId,
          });

        expect(
          result.success,
        ).toBe(
          false,
        );

        const complete =
          createMedicationScheduleBodySchema.safeParse({
            admissionId,
            prescriptionId,
            prescriptionItemId,

            source:
              'PRESCRIPTION',

            medicineId,

            medicineDisplay:
              'Ceftriaxone 1 g injection',

            prescribedDose:
              '1',

            doseUnitCode:
              'G',

            route:
              'INTRAVENOUS',

            frequencyCode:
              'BID',

            scheduledTimes: [
              '2026-07-20T08:00:00.000+05:00',
              '2026-07-20T20:00:00.000+05:00',
            ],

            startAt:
              '2026-07-20T08:00:00.000+05:00',

            orderedByUserId:
              nurseUserId,

            orderedByStaffId:
              nurseStaffId,
          });

        expect(
          complete.success,
        ).toBe(
          true,
        );
      },
    );

    it(
      'requires dose, route, and time for administered medication',
      () => {
        const invalid =
          recordMedicationDoseBodySchema.safeParse({
            expectedScheduleVersion:
              0,

            scheduledAt:
              '2026-07-20T08:00:00.000+05:00',

            status:
              'ADMINISTERED',
          });

        expect(
          invalid.success,
        ).toBe(
          false,
        );

        const valid =
          recordMedicationDoseBodySchema.safeParse({
            expectedScheduleVersion:
              0,

            scheduledAt:
              '2026-07-20T08:00:00.000+05:00',

            status:
              'ADMINISTERED',

            administeredDose:
              '1',

            administeredRoute:
              'INTRAVENOUS',

            administeredAt:
              '2026-07-20T08:05:00.000+05:00',

            notes:
              'Administered through patent IV line',
          });

        expect(
          valid.success,
        ).toBe(
          true,
        );
      },
    );

    it(
      'requires reasons for omitted, refused, and delayed doses',
      () => {
        for (
          const status of [
            'OMITTED',
            'REFUSED',
            'DELAYED',
          ] as const
        ) {
          const result =
            recordMedicationDoseBodySchema.safeParse({
              expectedScheduleVersion:
                0,

              scheduledAt:
                '2026-07-20T08:00:00.000+05:00',

              status,
            });

          expect(
            result.success,
          ).toBe(
            false,
          );
        }
      },
    );

    it(
      'validates signed ward-handover content',
      () => {
        const result =
          createWardHandoverBodySchema.safeParse({
            admissionId,

            handoverType:
              'SHIFT',

            shiftCode:
              'NIGHT',

            summary:
              'Patient stable but requires oxygen monitoring',

            activeConcerns: [
              'Oxygen saturation fluctuating',
            ],

            pendingTasks: [
              'Repeat CBC at 06:00',
            ],

            medicationConcerns: [
              'Next antibiotic dose at 08:00',
            ],

            safetyConcerns: [
              'Fall-risk precautions',
            ],

            toNurseUserId:
              nurseUserId,

            toNurseStaffId:
              nurseStaffId,
          });

        expect(
          result.success,
        ).toBe(
          true,
        );
      },
    );
  },
);  