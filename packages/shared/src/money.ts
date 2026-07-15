import Decimal from 'decimal.js';

import {
  BadRequestError,
} from './errors.js';

Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -100,
  toExpPos: 100,
});

export const defaultCurrency =
  'PKR' as const;

export const moneyScale = 2;
export const rateScale = 4;

export type CurrencyCode =
  typeof defaultCurrency | string;

const decimalPattern =
  /^-?(?:0|[1-9]\d*)(?:\.\d{1,4})?$/;

const quantityPattern =
  /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/;

function assertDecimalString(
  value: string,
  path: string,
): void {
  if (
    !decimalPattern.test(value)
  ) {
    throw new BadRequestError(
      'Invalid decimal value',
      [
        {
          code:
            'invalid_decimal',

          message:
            'Decimal values must be supplied as non-exponential strings with at most four decimal places',

          path,
        },
      ],
    );
  }
}

export function decimalFromString(
  value: string,
  path = 'amount',
): Decimal {
  assertDecimalString(
    value,
    path,
  );

  return new Decimal(value);
}

export function quantityFromString(
  value: string,
  path = 'quantity',
): Decimal {
  if (
    !quantityPattern.test(value)
  ) {
    throw new BadRequestError(
      'Invalid quantity value',
      [
        {
          code:
            'invalid_quantity',

          message:
            'Quantity must be a non-negative decimal string with at most four decimal places',

          path,
        },
      ],
    );
  }

  return new Decimal(value);
}

export class Money {
  readonly currency:
    CurrencyCode;

  private readonly amount:
    Decimal;

  private constructor(
    amount: Decimal,
    currency: CurrencyCode,
  ) {
    this.amount =
      amount.toDecimalPlaces(
        moneyScale,
        Decimal.ROUND_HALF_UP,
      );

    this.currency =
      currency;
  }

  static zero(
    currency:
      CurrencyCode =
        defaultCurrency,
  ): Money {
    return new Money(
      new Decimal(0),
      currency,
    );
  }

  static from(
    value: string,
    currency:
      CurrencyCode =
        defaultCurrency,
    path = 'amount',
  ): Money {
    return new Money(
      decimalFromString(
        value,
        path,
      ),
      currency,
    );
  }

  static fromDecimal(
    value: Decimal,
    currency:
      CurrencyCode =
        defaultCurrency,
  ): Money {
    return new Money(
      value,
      currency,
    );
  }

  private assertSameCurrency(
    other: Money,
  ): void {
    if (
      this.currency !==
      other.currency
    ) {
      throw new BadRequestError(
        `Currency mismatch: ${this.currency} and ${other.currency}`,
      );
    }
  }

  add(
    other: Money,
  ): Money {
    this.assertSameCurrency(
      other,
    );

    return Money.fromDecimal(
      this.amount.plus(
        other.amount,
      ),
      this.currency,
    );
  }

  subtract(
    other: Money,
  ): Money {
    this.assertSameCurrency(
      other,
    );

    return Money.fromDecimal(
      this.amount.minus(
        other.amount,
      ),
      this.currency,
    );
  }

  multiply(
    quantity: string,
  ): Money {
    return Money.fromDecimal(
      this.amount.times(
        quantityFromString(
          quantity,
        ),
      ),
      this.currency,
    );
  }

  percentage(
    percentageValue: string,
  ): Money {
    const percentage =
      decimalFromString(
        percentageValue,
        'percentage',
      );

    return Money.fromDecimal(
      this.amount
        .times(percentage)
        .dividedBy(100),
      this.currency,
    );
  }

  negate(): Money {
    return Money.fromDecimal(
      this.amount.negated(),
      this.currency,
    );
  }

  absolute(): Money {
    return Money.fromDecimal(
      this.amount.abs(),
      this.currency,
    );
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  isNegative(): boolean {
    return this.amount.isNegative();
  }

  isPositive(): boolean {
    return this.amount.isPositive();
  }

  equals(
    other: Money,
  ): boolean {
    this.assertSameCurrency(
      other,
    );

    return this.amount.equals(
      other.amount,
    );
  }

  compare(
    other: Money,
  ): number {
    this.assertSameCurrency(
      other,
    );

    return this.amount.comparedTo(
      other.amount,
    );
  }

  toString(): string {
    return this.amount.toFixed(
      moneyScale,
    );
  }

  toJSON(): Readonly<{
    amount: string;
    currency: CurrencyCode;
  }> {
    return {
      amount:
        this.toString(),

      currency:
        this.currency,
    };
  }

  toDecimal(): Decimal {
    return new Decimal(
      this.amount,
    );
  }
}

export function sumMoney(
  values: readonly Money[],
  currency:
    CurrencyCode =
      defaultCurrency,
): Money {
  return values.reduce(
    (
      total,
      value,
    ) =>
      total.add(value),

    Money.zero(currency),
  );
}

export function calculateLineAmount(
  input: Readonly<{
    rate: string;
    quantity: string;
    currency?: CurrencyCode;
  }>,
): Money {
  const rate =
    decimalFromString(
      input.rate,
      'rate',
    );

  const quantity =
    quantityFromString(
      input.quantity,
      'quantity',
    );

  return Money.fromDecimal(
    rate.times(quantity),
    input.currency ??
      defaultCurrency,
  );
}