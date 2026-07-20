import {
  Decimal,
} from 'decimal.js';

import type {
  BedChargeSegmentRecord,
} from '../inpatient.persistence.types.js';

import type {
  InpatientBedChargeCalculatorPort,
} from '../inpatient-bed-operations.ports.js';

import type {
  InpatientBedChargeCalculation,
} from '../inpatient-bed-operations.types.js';

function positiveMinutes(
  startedAt:
    Date,

  endedAt:
    Date,
): number {
  const milliseconds =
    endedAt.getTime() -
    startedAt.getTime();

  return Math.max(
    0,
    Math.ceil(
      milliseconds /
      60_000,
    ),
  );
}

function roundUp(
  value:
    number,

  increment:
    number,
): number {
  return Math.ceil(
    value /
    increment,
  ) *
  increment;
}

export class InpatientBedChargeCalculatorService
implements InpatientBedChargeCalculatorPort {
  public calculate(
    segment:
      Pick<
        BedChargeSegmentRecord,
        | 'startedAt'
        | 'endedAt'
        | 'unitRate'
        | 'currencyCode'
        | 'chargingPolicySnapshot'
      >,
  ): InpatientBedChargeCalculation {
    if (
      segment.endedAt ===
      null
    ) {
      throw new Error(
        'An open bed-charge segment cannot be calculated',
      );
    }

    const policy =
      segment.chargingPolicySnapshot;

    let billableMinutes =
      positiveMinutes(
        segment.startedAt,
        segment.endedAt,
      );

    billableMinutes =
      Math.max(
        billableMinutes,
        policy.minimumChargeMinutes,
      );

    if (
      billableMinutes <=
      policy.gracePeriodMinutes
    ) {
      billableMinutes =
        0;
    }

    if (
      policy.partialDayPolicy ===
        'ROUND_TO_INCREMENT'
    ) {
      billableMinutes =
        roundUp(
          billableMinutes,
          policy.roundingIncrementMinutes ??
            1,
        );
    }

    let unitMinutes:
      number;

    switch (
      policy.billingUnit
    ) {
      case 'PER_HOUR':
        unitMinutes =
          60;
        break;

      case 'PER_12_HOURS':
        unitMinutes =
          720;
        break;

      case 'PER_24_HOURS':
      case 'CALENDAR_DAY':
        unitMinutes =
          1_440;
        break;
    }

    let quantity =
      new Decimal(
        billableMinutes,
      ).dividedBy(
        unitMinutes,
      );

    if (
      policy.partialDayPolicy ===
        'FULL_UNIT'
    ) {
      quantity =
        quantity.ceil();
    }

    if (
      policy.sameDayDischargePolicy ===
        'MINIMUM_ONE_UNIT' &&
      billableMinutes >
        0 &&
      quantity.lessThan(
        1,
      )
    ) {
      quantity =
        new Decimal(
          1,
        );
    }

    if (
      policy.sameDayDischargePolicy ===
        'NO_CHARGE' &&
      segment.startedAt
        .toISOString()
        .slice(
          0,
          10,
        ) ===
        segment.endedAt
          .toISOString()
          .slice(
            0,
            10,
          )
    ) {
      quantity =
        new Decimal(
          0,
        );

      billableMinutes =
        0;
    }

    const unitRate =
      new Decimal(
        segment.unitRate.toString(),
      );

    const grossAmount =
      unitRate
        .times(
          quantity,
        )
        .toDecimalPlaces(
          4,
          Decimal.ROUND_HALF_UP,
        );

    return {
      billableMinutes,

      quantity:
        quantity
          .toDecimalPlaces(
            4,
            Decimal.ROUND_HALF_UP,
          )
          .toFixed(
            4,
          ),

      grossAmount:
        grossAmount.toFixed(
          4,
        ),

      currencyCode:
        segment.currencyCode,
    };
  }
}