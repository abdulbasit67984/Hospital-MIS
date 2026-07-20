import Decimal from 'decimal.js';

import {
  InventoryUnitConversionError,
} from '../inventory.errors.js';

import type {
  InventoryUnitConversionRequest,
  InventoryUnitConversionResult,
} from '../inventory.contracts.js';

import type {
  InventoryItemRecord,
} from '../inventory.persistence.types.js';

import type {
  InventoryUnitConversionPort,
} from '../inventory.ports.js';

import {
  decimal128String,
  normalizeInventoryDecimal,
} from '../inventory.normalization.js';

function factorFor(
  item: InventoryItemRecord,
  unitId: string,
): Decimal {
  const normalizedUnitId = unitId.toLowerCase();
  const factors: Decimal[] = [];

  if (
    item.stockUnitId.toHexString().toLowerCase() ===
    normalizedUnitId
  ) {
    factors.push(new Decimal(1));
  }

  if (
    item.purchaseUnitId.toHexString().toLowerCase() ===
    normalizedUnitId
  ) {
    factors.push(
      new Decimal(
        decimal128String(
          item.purchaseUnitToStockFactor,
        ),
      ),
    );
  }

  if (
    item.issueUnitId.toHexString().toLowerCase() ===
    normalizedUnitId
  ) {
    factors.push(
      new Decimal(
        decimal128String(
          item.issueUnitToStockFactor,
        ),
      ),
    );
  }

  factors.push(
    ...item.unitConversions
      .filter(
        (entry) =>
          entry.unitId.toHexString().toLowerCase() ===
          normalizedUnitId,
      )
      .map(
        (entry) =>
          new Decimal(
            decimal128String(
              entry.toStockUnitFactor,
            ),
          ),
      ),
  );

  if (factors.length === 0) {
    throw new InventoryUnitConversionError(
      'The requested unit is not configured for this inventory item',
    );
  }

  const factor = factors[0];

  if (
    factor === undefined ||
    factors.some(
      (candidate) => !candidate.eq(factor),
    )
  ) {
    throw new InventoryUnitConversionError(
      'The requested unit has conflicting conversion factors for this inventory item',
    );
  }

  if (
    !factor.isFinite() ||
    factor.lte(0)
  ) {
    throw new InventoryUnitConversionError(
      'Inventory unit conversion factors must be finite and greater than zero',
    );
  }

  return factor;
}

function normalizedQuantity(
  value: Decimal,
  allowFractionalStock: boolean,
): string {
  if (
    !value.isFinite() ||
    value.isNegative()
  ) {
    throw new InventoryUnitConversionError(
      'Inventory quantities must be finite and non-negative',
    );
  }

  if (
    !allowFractionalStock &&
    !value.isInteger()
  ) {
    throw new InventoryUnitConversionError(
      'This inventory item does not allow fractional stock quantities',
    );
  }

  return normalizeInventoryDecimal(
    value.toFixed(),
    8,
  );
}

export class InventoryUnitConversionService
implements InventoryUnitConversionPort {
  public toStockUnit(
    item: InventoryItemRecord,
    quantity: string,
    fromUnitId: string,
  ): string {
    let decimal: Decimal;

    try {
      decimal = new Decimal(quantity);
    } catch {
      throw new InventoryUnitConversionError(
        'Inventory quantity is not a valid decimal',
      );
    }

    const stockQuantity = decimal.mul(
      factorFor(item, fromUnitId),
    );

    return normalizedQuantity(
      stockQuantity,
      item.allowFractionalStock,
    );
  }

  public fromStockUnit(
    item: InventoryItemRecord,
    stockQuantity: string,
    toUnitId: string,
  ): string {
    let decimal: Decimal;

    try {
      decimal = new Decimal(stockQuantity);
    } catch {
      throw new InventoryUnitConversionError(
        'Inventory quantity is not a valid decimal',
      );
    }

    const factor = factorFor(
      item,
      toUnitId,
    );

    if (factor.lte(0)) {
      throw new InventoryUnitConversionError(
        'Inventory unit conversion factors must be greater than zero',
      );
    }

    return normalizedQuantity(
      decimal.div(factor),
      true,
    );
  }

  public convert(
    item: InventoryItemRecord,
    request: InventoryUnitConversionRequest,
  ): InventoryUnitConversionResult {
    const stockQuantity = this.toStockUnit(
      item,
      request.quantity,
      request.fromUnitId,
    );

    const quantity = this.fromStockUnit(
      item,
      stockQuantity,
      request.toUnitId,
    );

    const roundTripStock = this.toStockUnit(
      item,
      quantity,
      request.toUnitId,
    );

    return {
      quantity,
      fromUnitId: request.fromUnitId,
      toUnitId: request.toUnitId,
      stockUnitId: item.stockUnitId.toHexString(),
      stockQuantity,
      exact: new Decimal(stockQuantity).eq(
        roundTripStock,
      ),
    };
  }
}