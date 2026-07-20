import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  clinicallyClearDischargeBodySchema,
  completeDischargeBodySchema,
  initiateDischargeBodySchema,
  prepareDischargeSummaryBodySchema,
  updateDischargeReadinessBodySchema,
} from '../inpatient-discharge.validation.js';

import {
  inpatientActorFromRequest,
  requireInpatientIdempotencyKey,
} from '../inpatient.http.js';

const admissionId =
  '64b000000000000000000001';

const dischargeId =
  '64b000000000000000000002';

describe(
  'inpatient discharge and HTTP boundary',
  () => {
    it(
      'validates discharge initiation',
      () => {
        const result =
          initiateDischargeBodySchema.safeParse({
            admissionId,

            expectedAdmissionVersion:
              4,

            checklist: [
              {
                code:
                  'CLINICAL_SUMMARY',

                label:
                  'Discharge summary completed',

                status:
                  'PENDING',
              },
            ],
          });

        expect(
          result.success,
        ).toBe(
          true,
        );
      },
    );

    it(
      'validates medication reconciliation and readiness',
      () => {
        const result =
          updateDischargeReadinessBodySchema.safeParse({
            expectedDischargeVersion:
              0,

            checklist: [
              {
                code:
                  'CLINICAL_SUMMARY',

                label:
                  'Discharge summary completed',

                status:
                  'COMPLETED',
              },
            ],

            medicationReconciliationCompleted:
              true,

            medicationReconciliationItems: [
              {
                medicineDisplay:
                  'Amlodipine 5 mg tablet',

                action:
                  'CONTINUE',

                dose:
                  '5',

                doseUnitCode:
                  'MG',

                routeCode:
                  'ORAL',

                frequencyCode:
                  'OD',

                instructions:
                  'Take once daily',
              },
            ],
          });

        expect(
          result.success,
        ).toBe(
          true,
        );
      },
    );

    it(
      'requires at least one discharge diagnosis',
      () => {
        const result =
          prepareDischargeSummaryBodySchema.safeParse({
            expectedDischargeVersion:
              1,

            admissionReason:
              'Community-acquired pneumonia',

            hospitalCourse:
              'Treated with intravenous antibiotics and oxygen',

            diagnosisSnapshots:
              [],

            conditionAtDischarge:
              'Stable',

            medicationReconciliationItems:
              [],

            patientInstructions:
              'Return immediately for breathing difficulty',
          });

        expect(
          result.success,
        ).toBe(
          false,
        );
      },
    );

    it(
      'validates clinical-clearance disposition',
      () => {
        const result =
          clinicallyClearDischargeBodySchema.safeParse({
            expectedDischargeVersion:
              3,

            expectedAdmissionVersion:
              8,

            disposition:
              'HOME',
          });

        expect(
          result.success,
        ).toBe(
          true,
        );
      },
    );

    it(
      'requires bed and assignment versions together',
      () => {
        const result =
          completeDischargeBodySchema.safeParse({
            expectedDischargeVersion:
              5,

            expectedAdmissionVersion:
              10,

            expectedBedVersion:
              4,
          });

        expect(
          result.success,
        ).toBe(
          false,
        );
      },
    );

    it(
      'builds the actor context from the authenticated request',
      () => {
        const actor =
          inpatientActorFromRequest({
            id:
              'request-1',

            ip:
              '127.0.0.1',

            headers: {
              'x-correlation-id':
                'corr-1',

              'user-agent':
                'vitest',
            },

            user: {
              userId:
                '64b000000000000000000010',

              facilityId:
                '64b000000000000000000011',

              roleKeys: [
                'WARD_NURSE',
              ],

              permissionKeys: [
                'admissions.read',
              ],
            },
          } as never);

        expect(
          actor.correlationId,
        ).toBe(
          'corr-1',
        );

        expect(
          actor.ipAddress,
        ).toBe(
          '127.0.0.1',
        );
      },
    );

    it(
      'rejects missing mutation idempotency keys',
      () => {
        expect(
          () =>
            requireInpatientIdempotencyKey({
              headers:
                {},
            } as never),
        ).toThrow(
          'A valid Idempotency-Key header is required',
        );
      },
    );

    it(
      'accepts valid mutation idempotency keys',
      () => {
        expect(
          requireInpatientIdempotencyKey({
            headers: {
              'idempotency-key':
                'discharge-operation-001',
            },
          } as never),
        ).toBe(
          'discharge-operation-001',
        );
      },
    );
  },
);