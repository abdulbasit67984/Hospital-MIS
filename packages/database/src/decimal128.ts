import {
  Decimal128,
} from 'mongodb';

import {
  Money,
  type CurrencyCode,
} from '@hospital-mis/shared';

export function moneyToDecimal128(
  money: Money,
): Decimal128 {
  return Decimal128.fromString(
    money.toString(),
  );
}

export function decimal128ToMoney(
  value: Decimal128,
  currency:
    CurrencyCode =
      'PKR',
): Money {
  return Money.from(
    value.toString(),
    currency,
  );
}

export function decimalStringToDecimal128(
  value: string,
): Decimal128 {
  return Decimal128.fromString(
    value,
  );
}

export function decimal128ToString(
  value: Decimal128,
): string {
  return value.toString();
}