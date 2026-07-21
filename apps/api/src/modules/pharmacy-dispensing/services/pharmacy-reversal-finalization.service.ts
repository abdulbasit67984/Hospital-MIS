import Decimal from 'decimal.js';

import {
  ConflictError,
} from '@hospital-mis/shared';

import type {
  PharmacyDispensationItemRecord,
  PharmacyDispensationRecord,
} from '../pharmacy-dispensing.persistence.types.js';

import {
  normalizePharmacyDecimal,
} from '../pharmacy-dispensing.workflow-helpers.js';

export interface PharmacyReversalLine {
  item:
    PharmacyDispensationItemRecord;

  reversibleQuantity:
    string;

  allocationReversals:
    readonly {
      allocationId: string;
      stockQuantity: string;
    }[];
}

export interface PharmacyReversalPreparation {
  lines:
    readonly PharmacyReversalLine[];

  grossAmount:
    string;

  discountAmount:
    string;

  taxAmount:
    string;

  netAmount:
    string;
}

function proportionalAmount(
  originalAmount: string,
  reversibleQuantity: Decimal,
  originalQuantity: Decimal,
): string {
  if (originalQuantity.lte(0)) {
    throw new ConflictError(
      'A dispensed item has an invalid original quantity',
    );
  }

  return normalizePharmacyDecimal(
    new Decimal(originalAmount)
      .times(reversibleQuantity)
      .dividedBy(originalQuantity),
  );
}

export class PharmacyReversalFinalizationService {
  public prepare(
    dispensation:
      PharmacyDispensationRecord,

    items:
      readonly PharmacyDispensationItemRecord[],

    selectedItemIds:
      readonly string[] | undefined,
  ): PharmacyReversalPreparation {
    const selectedSet =
      selectedItemIds === undefined
        ? null
        : new Set(selectedItemIds);

    const selected =
      items.filter((item) =>
        selectedSet === null
          ? [
              'DISPENSED',
              'PARTIALLY_DISPENSED',
              'PARTIALLY_RETURNED',
            ].includes(item.status)
          : selectedSet.has(
              item._id.toHexString(),
            ),
      );

    if (
      selectedSet !== null &&
      selected.length !==
        selectedSet.size
    ) {
      throw new ConflictError(
        'One or more requested reversal items are unavailable',
      );
    }

    if (selected.length === 0) {
      throw new ConflictError(
        'No reversible dispensing items were selected',
      );
    }

    const lines: PharmacyReversalLine[] =
      [];

    let grossAmount =
      new Decimal(0);

    let discountAmount =
      new Decimal(0);

    let taxAmount =
      new Decimal(0);

    let netAmount =
      new Decimal(0);

    for (const item of selected) {
      const reversibleQuantity =
        new Decimal(
          item.dispensedQuantity.toString(),
        )
          .minus(
            item.returnedQuantity.toString(),
          )
          .minus(
            item.reversedQuantity.toString(),
          );

      if (reversibleQuantity.lte(0)) {
        throw new ConflictError(
          `Dispensing line ${item.lineNumber} contains no remaining quantity to reverse`,
        );
      }

      const allocationReversals =
        item.allocations
          .map((allocation) => {
            const reversibleStock =
              new Decimal(
                allocation
                  .consumedStockQuantity
                  .toString(),
              )
                .minus(
                  allocation
                    .returnedStockQuantity
                    .toString(),
                );

            return {
              allocationId:
                allocation._id.toHexString(),

              stockQuantity:
                normalizePharmacyDecimal(
                  reversibleStock,
                ),
            };
          })
          .filter((allocation) =>
            new Decimal(
              allocation.stockQuantity,
            ).gt(0),
          );

      if (
        allocationReversals.length === 0
      ) {
        throw new ConflictError(
          `Dispensing line ${item.lineNumber} has no reversible stock allocation`,
        );
      }

      const originalQuantity =
        new Decimal(
          item.dispensedQuantity.toString(),
        );

      const lineGross =
        proportionalAmount(
          item.grossAmount.toString(),
          reversibleQuantity,
          originalQuantity,
        );

      const lineDiscount =
        proportionalAmount(
          item.discountAmount.toString(),
          reversibleQuantity,
          originalQuantity,
        );

      const lineTax =
        proportionalAmount(
          item.taxAmount.toString(),
          reversibleQuantity,
          originalQuantity,
        );

      const lineNet =
        proportionalAmount(
          item.netAmount.toString(),
          reversibleQuantity,
          originalQuantity,
        );

      grossAmount =
        grossAmount.plus(lineGross);

      discountAmount =
        discountAmount.plus(
          lineDiscount,
        );

      taxAmount =
        taxAmount.plus(lineTax);

      netAmount =
        netAmount.plus(lineNet);

      lines.push({
        item,

        reversibleQuantity:
          normalizePharmacyDecimal(
            reversibleQuantity,
          ),

        allocationReversals,
      });
    }

    const calculatedNet =
      grossAmount
        .plus(taxAmount)
        .minus(discountAmount);

    if (!calculatedNet.eq(netAmount)) {
      throw new ConflictError(
        'Reversal financial values do not reconcile to the original dispensation',
      );
    }

    if (
      dispensation.currency.length !== 3
    ) {
      throw new ConflictError(
        'The original dispensation has an invalid currency',
      );
    }

    return {
      lines,

      grossAmount:
        normalizePharmacyDecimal(
          grossAmount,
        ),

      discountAmount:
        normalizePharmacyDecimal(
          discountAmount,
        ),

      taxAmount:
        normalizePharmacyDecimal(
          taxAmount,
        ),

      netAmount:
        normalizePharmacyDecimal(
          netAmount,
        ),
    };
  }
}