import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  DefaultNursingObservationThresholdPolicy,
} from '../nursing-observation.thresholds.js';

import {
  nursingVitalMeasurementBodySchema,
} from '../nursing-observation.validation.js';

import type {
  NursingVitalMutationResult,
} from '../nursing-observation.contracts.js';

function vital(
  overrides:
    Partial<NursingVitalMutationResult> = {},
): NursingVitalMutationResult {
  return {
    vitalSignId:
      '507f1f77bcf86cd799439001',

    facilityId:
      '507f1f77bcf86cd799439002',

    admissionId:
      '507f1f77bcf86cd799439003',

    encounterId:
      '507f1f77bcf86cd799439004',

    patientId:
      '507f1f77bcf86cd799439005',

    observerProviderId:
      '507f1f77bcf86cd799439006',

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
      '37.0',

    temperatureSite:
      'ORAL',

    pulsePerMinute:
      80,

    respiratoryRatePerMinute:
      18,

    systolicBloodPressureMmHg:
      120,

    diastolicBloodPressureMmHg:
      80,

    oxygenSaturationPercent:
      '98',

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

    ...overrides,
  };
}

describe(
  'nursing vital validation and deterioration thresholds',
  () => {
    it(
      'requires device attribution for device-originated observations',
      () => {
        const parsed =
          nursingVitalMeasurementBodySchema.safeParse({
            admissionId:
              '507f1f77bcf86cd799439003',

            measuredAt:
              '2026-07-20T10:00:00.000Z',

            source:
              'DEVICE',

            pulsePerMinute:
              80,
          });

        expect(
          parsed.success,
        ).toBe(false);
      },
    );

    it(
      'returns routine when observations are within configured thresholds',
      async () => {
        const policy =
          new DefaultNursingObservationThresholdPolicy();

        const configuration =
          await policy.resolve(
            '507f1f77bcf86cd799439002',
            '507f1f77bcf86cd799439007',
          );

        const result =
          policy.evaluate(
            configuration,
            vital(),
          );

        expect(
          result.severity,
        ).toBe(
          'ROUTINE',
        );

        expect(
          result.totalScore,
        ).toBe(0);

        expect(
          result.requiresEscalation,
        ).toBe(false);
      },
    );

    it(
      'immediately escalates critical oxygen desaturation',
      async () => {
        const policy =
          new DefaultNursingObservationThresholdPolicy();

        const configuration =
          await policy.resolve(
            '507f1f77bcf86cd799439002',
            '507f1f77bcf86cd799439007',
          );

        const result =
          policy.evaluate(
            configuration,
            vital({
              oxygenSaturationPercent:
                '88',

              respiratoryRatePerMinute:
                27,
            }),
          );

        expect(
          result.severity,
        ).toBe(
          'CRITICAL',
        );

        expect(
          result.requiresImmediateEscalation,
        ).toBe(true);

        expect(
          result.triggeredRules.map(
            (rule) =>
              rule.code,
          ),
        ).toEqual(
          expect.arrayContaining([
            'SPO2_CRITICAL',
            'RESP_CRITICAL_HIGH',
          ]),
        );
      },
    );

    it(
      'adds configured score for supplemental oxygen',
      async () => {
        const policy =
          new DefaultNursingObservationThresholdPolicy();

        const configuration =
          await policy.resolve(
            '507f1f77bcf86cd799439002',
            '507f1f77bcf86cd799439007',
          );

        const result =
          policy.evaluate(
            configuration,
            vital({
              oxygenDeliveryMethod:
                'NASAL_CANNULA',

              oxygenFlowLitresPerMinute:
                '2',
            }),
          );

        expect(
          result.totalScore,
        ).toBe(
          configuration
            .supplementalOxygenScore,
        );

        expect(
          result.severity,
        ).toBe(
          'ATTENTION',
        );
      },
    );
  },
);