import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  Money,
  calculateLineAmount,
  sumMoney,
} from './money.js';

import {
  hospitalServiceDate,
  localDateRangeToUtc,
  localDateTimeToUtc,
  toHospitalDateTime,
} from './time.js';

describe(
  'Money',
  () => {
    it(
      'never uses binary floating-point calculations',
      () => {
        const first =
          Money.from('0.10');

        const second =
          Money.from('0.20');

        expect(
          first
            .add(second)
            .toString(),
        ).toBe('0.30');
      },
    );

    it(
      'rounds final PKR amounts to two decimal places',
      () => {
        expect(
          calculateLineAmount({
            rate: '10.5555',
            quantity: '3',
          }).toString(),
        ).toBe('31.67');
      },
    );

    it(
      'calculates percentages using decimal arithmetic',
      () => {
        expect(
          Money
            .from('1250.00')
            .percentage('7.5')
            .toString(),
        ).toBe('93.75');
      },
    );

    it(
      'sums money values',
      () => {
        expect(
          sumMoney([
            Money.from('10.25'),
            Money.from('20.25'),
            Money.from('30.50'),
          ]).toString(),
        ).toBe('61.00');
      },
    );

    it(
      'rejects exponent notation',
      () => {
        expect(() =>
          Money.from('1e4'),
        ).toThrow(
          'Invalid decimal value',
        );
      },
    );
  },
);

describe(
  'hospital timezone',
  () => {
    it(
      'converts Karachi local time to UTC',
      () => {
        expect(
          localDateTimeToUtc(
            '2026-07-15T00:00:00',
          ).toISOString(),
        ).toBe(
          '2026-07-14T19:00:00.000Z',
        );
      },
    );

    it(
      'formats UTC values in hospital time',
      () => {
        expect(
          toHospitalDateTime(
            new Date(
              '2026-07-15T07:00:00.000Z',
            ),
          ),
        ).toContain(
          '2026-07-15T12:00:00',
        );
      },
    );

    it(
      'calculates the service date using hospital time',
      () => {
        expect(
          hospitalServiceDate(
            new Date(
              '2026-07-14T20:00:00.000Z',
            ),
          ),
        ).toBe(
          '2026-07-15',
        );
      },
    );

    it(
      'creates an end-exclusive UTC report range',
      () => {
        const range =
          localDateRangeToUtc(
            '2026-07-01',
            '2026-07-31',
          );

        expect(
          range.startInclusive
            .toISOString(),
        ).toBe(
          '2026-06-30T19:00:00.000Z',
        );

        expect(
          range.endExclusive
            .toISOString(),
        ).toBe(
          '2026-07-31T19:00:00.000Z',
        );
      },
    );
  },
);