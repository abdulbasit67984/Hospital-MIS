import {
  Decimal128,
} from 'mongodb';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  InpatientBedChargeCalculatorService,
} from '../services/inpatient-bed-charge-calculator.service.js';

import {
  assignBedBodySchema,
  releaseBedBodySchema,
  reserveBedBodySchema,
  transferBedBodySchema,
} from '../inpatient-bed-operations.validation.js';

import {
  evaluateInpatientBedCompatibility,
} from '../inpatient.lifecycle.js';

const objectId =
  '64b000000000000000000001';

describe(
  'inpatient bed operations',
  () => {
    it(
      'validates bed holds and expected versions',
      () => {
        const result =
          reserveBedBodySchema.safeParse({
            admissionId:
              objectId,

            bedId:
              '64b000000000000000000002',

            holdType:
              'ADMISSION',

            holdMinutes:
              30,

            reasonCode:
              'ADMISSION_ALLOCATION',

            reason:
              'Reserved for accepted inpatient admission',

            expectedBedVersion:
              2,
          });

        expect(
          result.success,
        ).toBe(
          true,
        );
      },
    );

    it(
      'requires hold version when assigning a reserved bed',
      () => {
        const result =
          assignBedBodySchema.safeParse({
            admissionId:
              objectId,

            bedId:
              '64b000000000000000000002',

            bedHoldId:
              '64b000000000000000000003',

            expectedAdmissionVersion:
              1,

            expectedBedVersion:
              2,
          });

        expect(
          result.success,
        ).toBe(
          false,
        );
      },
    );

    it(
      'requires independent source and destination versions for transfers',
      () => {
        const result =
          transferBedBodySchema.safeParse({
            admissionId:
              objectId,

            destinationBedId:
              '64b000000000000000000002',

            expectedAdmissionVersion:
              4,

            expectedSourceBedVersion:
              8,

            expectedDestinationBedVersion:
              2,

            expectedSourceAssignmentVersion:
              1,

            reason:
              'Transfer to higher-acuity monitored bed',
          });

        expect(
          result.success,
        ).toBe(
          true,
        );
      },
    );

    it(
      'requires explicit release reason codes',
      () => {
        const result =
          releaseBedBodySchema.safeParse({
            admissionId:
              objectId,

            expectedAdmissionVersion:
              5,

            expectedBedVersion:
              9,

            expectedAssignmentVersion:
              2,

            releaseReasonCode:
              'TRANSFER',

            releaseReason:
              'Transferred to intensive care',

            startTurnaround:
              true,
          });

        expect(
          result.success,
        ).toBe(
          true,
        );
      },
    );

    it(
      'calculates hourly charges using rounded increments',
      () => {
        const calculator =
          new InpatientBedChargeCalculatorService();

        const result =
          calculator.calculate({
            startedAt:
              new Date(
                '2026-07-20T08:00:00.000Z',
              ),

            endedAt:
              new Date(
                '2026-07-20T10:10:00.000Z',
              ),

            unitRate:
              Decimal128.fromString(
                '1000.00',
              ),

            currencyCode:
              'PKR',

            chargingPolicySnapshot: {
              policyCode:
                'HOURLY',

              billingUnit:
                'PER_HOUR',

              partialDayPolicy:
                'ROUND_TO_INCREMENT',

              sameDayDischargePolicy:
                'ACTUAL_USAGE',

              transferChargingPolicy:
                'SPLIT_AT_TRANSFER_TIME',

              roundingIncrementMinutes:
                30,

              minimumChargeMinutes:
                0,

              dayBoundaryTimezone:
                'Asia/Karachi',

              dayBoundaryHour:
                0,

              gracePeriodMinutes:
                0,
            },
          });

        expect(
          result,
        ).toEqual({
          billableMinutes:
            150,

          quantity:
            '2.5000',

          grossAmount:
            '2500.0000',

          currencyCode:
            'PKR',
        });
      },
    );

    it(
      'applies a minimum one-unit same-day charge',
      () => {
        const calculator =
          new InpatientBedChargeCalculatorService();

        const result =
          calculator.calculate({
            startedAt:
              new Date(
                '2026-07-20T08:00:00.000Z',
              ),

            endedAt:
              new Date(
                '2026-07-20T10:00:00.000Z',
              ),

            unitRate:
              Decimal128.fromString(
                '7500.00',
              ),

            currencyCode:
              'PKR',

            chargingPolicySnapshot: {
              policyCode:
                'DAILY',

              billingUnit:
                'PER_24_HOURS',

              partialDayPolicy:
                'ACTUAL_USAGE',

              sameDayDischargePolicy:
                'MINIMUM_ONE_UNIT',

              transferChargingPolicy:
                'SPLIT_AT_TRANSFER_TIME',

              roundingIncrementMinutes:
                null,

              minimumChargeMinutes:
                0,

              dayBoundaryTimezone:
                'Asia/Karachi',

              dayBoundaryHour:
                0,

              gracePeriodMinutes:
                0,
            },
          });

        expect(
          result.quantity,
        ).toBe(
          '1.0000',
        );

        expect(
          result.grossAmount,
        ).toBe(
          '7500.0000',
        );
      },
    );

    it(
      'rejects a bed that does not meet isolation requirements',
      () => {
        const result =
          evaluateInpatientBedCompatibility(
            {
              patientSex:
                'FEMALE',

              ageYears:
                32,

              specialtyCodes:
                [
                  'MEDICINE',
                ],

              requiredIsolationCapabilities:
                [
                  'NEGATIVE_PRESSURE',
                ],

              infectionControlTags:
                [
                  'AIRBORNE',
                ],
            },
            {
              permittedSexes:
                [
                  'FEMALE',
                ],

              minimumAgeYears:
                18,

              maximumAgeYears:
                null,

              specialtyCodes:
                [
                  'MEDICINE',
                ],

              isolationCapabilities:
                [
                  'STANDARD_PRECAUTIONS',
                ],

              infectionControlTags:
                [],

              negativePressureCapable:
                false,

              cohortingAllowed:
                true,
            },
          );

        expect(
          result.compatible,
        ).toBe(
          false,
        );

        expect(
          result.reasons.join(
            ' ',
          ),
        ).toContain(
          'NEGATIVE_PRESSURE',
        );
      },
    );
  },
);