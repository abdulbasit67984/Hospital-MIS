import Decimal from 'decimal.js';

import {
  PharmacyPriceResolutionError,
} from '../pharmacy-dispensing.errors.js';

import type {
  PharmacyPricingPort,
} from '../pharmacy-dispensing.ports.js';

import type {
  PharmacyPricingRequest,
  PharmacyPricingResult,
} from '../pharmacy-dispensing.contracts.js';

import {
  normalizePharmacyDecimal,
} from '../pharmacy-dispensing.workflow-helpers.js';

function requireNonNegative(
  value: string,
  field: string,
): Decimal {
  const decimal = new Decimal(value);

  if (
    !decimal.isFinite() ||
    decimal.isNegative()
  ) {
    throw new PharmacyPriceResolutionError(
      `${field} must be a non-negative exact decimal`,
    );
  }

  return decimal;
}

function validateResult(
  request: PharmacyPricingRequest,
  result: PharmacyPricingResult,
): PharmacyPricingResult {
  const quantity = requireNonNegative(
    request.stockQuantity,
    'Stock quantity',
  );
  const unitPrice = requireNonNegative(
    result.unitSellingPrice,
    'Unit selling price',
  );
  const gross = requireNonNegative(
    result.grossAmount,
    'Gross amount',
  );
  const discount = requireNonNegative(
    result.discountAmount,
    'Discount amount',
  );
  const tax = requireNonNegative(
    result.taxAmount,
    'Tax amount',
  );
  const net = requireNonNegative(
    result.netAmount,
    'Net amount',
  );

  if (
    !quantity
      .times(unitPrice)
      .eq(gross)
  ) {
    throw new PharmacyPriceResolutionError(
      'Authoritative gross amount does not equal quantity multiplied by unit selling price',
    );
  }

  if (
    !gross
      .plus(tax)
      .minus(discount)
      .eq(net)
  ) {
    throw new PharmacyPriceResolutionError(
      'Authoritative net amount does not reconcile to gross, tax, and discount',
    );
  }

  if (
    !/^[A-Z]{3}$/u.test(
      result.currency,
    )
  ) {
    throw new PharmacyPriceResolutionError(
      'Pricing currency must be an ISO-style three-letter currency',
    );
  }

  return {
    ...result,
    unitSellingPrice:
      normalizePharmacyDecimal(unitPrice),
    grossAmount:
      normalizePharmacyDecimal(gross),
    discountAmount:
      normalizePharmacyDecimal(discount),
    taxAmount:
      normalizePharmacyDecimal(tax),
    netAmount:
      normalizePharmacyDecimal(net),
  };
}

export class PharmacyPricingPreparationService {
  public constructor(
    private readonly pricing:
      PharmacyPricingPort,
  ) {}

  public async prepare(
    requests:
      readonly PharmacyPricingRequest[],
  ): Promise<
    ReadonlyMap<string, PharmacyPricingResult>
  > {
    const results = await Promise.all(
      requests.map(async (request) => [
        request.dispensationItemId,
        validateResult(
          request,
          await this.pricing.resolve(
            request,
          ),
        ),
      ] as const),
    );

    const currencies =
      new Set(
        results.map(
          ([, result]) =>
            result.currency,
        ),
      );

    if (currencies.size > 1) {
      throw new PharmacyPriceResolutionError(
        'One dispensing transaction cannot contain multiple currencies',
      );
    }

    return new Map(results);
  }
}