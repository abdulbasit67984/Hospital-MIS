import Decimal from 'decimal.js';

import {
  ConflictError,
} from '@hospital-mis/shared';

import type {
  CompleteDispensationInput,
  PharmacyBillingChargeInput,
  PharmacyDispensingActorContext,
  PharmacyPricingRequest,
} from '../pharmacy-dispensing.contracts.js';

import type {
  PharmacyDispensationItemRecord,
  PharmacyDispensationRecord,
  PharmacyInventoryItemRecord,
} from '../pharmacy-dispensing.persistence.types.js';

import type {
  PharmacyDispensingDependencies,
} from '../pharmacy-dispensing.ports.js';

import {
  normalizePharmacyDecimal,
} from '../pharmacy-dispensing.workflow-helpers.js';

import {
  PharmacyPricingPreparationService,
} from './pharmacy-pricing-preparation.service.js';

export interface PreparedDispensingLine {
  input: CompleteDispensationInput['items'][number];
  item: PharmacyDispensationItemRecord;
  inventory: PharmacyInventoryItemRecord;
  stockQuantity: string;
  requestedQuantity: string;
}

export interface PreparedDispensingFinalization {
  lines: readonly PreparedDispensingLine[];
  pricingRequests: readonly PharmacyPricingRequest[];
}

export class PharmacyDispensingFinalizationService {
  public constructor(
    private readonly dependencies:
      PharmacyDispensingDependencies,

    private readonly pricing:
      PharmacyPricingPreparationService,
  ) {}

  public async prepare(
    actor: PharmacyDispensingActorContext,
    dispensation: PharmacyDispensationRecord,
    items: readonly PharmacyDispensationItemRecord[],
    input: CompleteDispensationInput,
    occurredAt: Date,
  ): Promise<PreparedDispensingFinalization> {
    if (
      dispensation.stockReservationId === null
    ) {
      throw new ConflictError(
        'Dispensing requires an active inventory reservation',
      );
    }

    const byId =
      new Map(
        items.map(
          (item) => [
            item._id.toHexString(),
            item,
          ],
        ),
      );

    const lines: PreparedDispensingLine[] = [];

    for (const lineInput of input.items) {
      const item =
        byId.get(
          lineInput.dispensationItemId,
        );

      if (item === undefined) {
        throw new ConflictError(
          'A requested dispensing item does not belong to this dispensation',
        );
      }

      if (
        item.version !==
        lineInput.expectedVersion
      ) {
        throw new ConflictError(
          `Dispensing line ${item.lineNumber} changed before finalization`,
        );
      }

      if (
        ![
          'RESERVED',
          'PARTIALLY_RESERVED',
          'PARTIALLY_DISPENSED',
        ].includes(item.status)
      ) {
        throw new ConflictError(
          `Dispensing line ${item.lineNumber} is not reserved for finalization`,
        );
      }

      if (item.blockingAlertCount > 0) {
        throw new ConflictError(
          `Dispensing line ${item.lineNumber} contains unresolved blocking safety findings`,
        );
      }

      const formularyItemId =
        (
          item.actualFormularyItemId ??
          item.prescribedFormularyItemId
        ).toHexString();

      const inventory =
        await this.dependencies.prescriptions
          .findInventoryItemForFormulary(
            actor.facilityId,
            formularyItemId,
          );

      if (
        inventory === null ||
        inventory.status !== 'ACTIVE' ||
        inventory.negativeStockAllowed
      ) {
        throw new ConflictError(
          `Dispensing line ${item.lineNumber} has no eligible inventory mapping`,
        );
      }

      const requestedQuantity =
        normalizePharmacyDecimal(
          lineInput.quantity,
        );

      const remainingApproved =
        new Decimal(
          item.approvedQuantity.toString(),
        )
          .minus(
            item.dispensedQuantity.toString(),
          )
          .minus(
            item.reversedQuantity.toString(),
          );

      if (
        new Decimal(requestedQuantity).gt(
          remainingApproved,
        )
      ) {
        throw new ConflictError(
          `Dispensing quantity for line ${item.lineNumber} exceeds the remaining approved quantity`,
        );
      }

      const stockQuantity =
        this.dependencies.inventory
          .unitConversion
          .toStockUnit(
            inventory as never,
            requestedQuantity,
            lineInput.quantityUnitId,
          );

      const allocationTotal =
        lineInput.allocations.reduce(
          (total, allocation) =>
            total.plus(
              allocation.stockQuantity,
            ),
          new Decimal(0),
        );

      if (
        !allocationTotal.eq(
          stockQuantity,
        )
      ) {
        throw new ConflictError(
          `Selected allocations for line ${item.lineNumber} do not reconcile to its dispensing quantity`,
        );
      }

      const allocationById =
        new Map(
          item.allocations.map(
            (allocation) => [
              allocation._id.toHexString(),
              allocation,
            ],
          ),
        );

      for (
        const allocationInput of
        lineInput.allocations
      ) {
        const allocation =
          allocationById.get(
            allocationInput.allocationId,
          );

        if (
          allocation === undefined ||
          allocation.status !== 'RESERVED'
        ) {
          throw new ConflictError(
            `A selected stock allocation for line ${item.lineNumber} is unavailable`,
          );
        }

        const remainingAllocation =
          new Decimal(
            allocation
              .reservedStockQuantity
              .toString(),
          )
            .minus(
              allocation
                .consumedStockQuantity
                .toString(),
            )
            .minus(
              allocation
                .releasedStockQuantity
                .toString(),
            );

        if (
          new Decimal(
            allocationInput.stockQuantity,
          ).gt(remainingAllocation)
        ) {
          throw new ConflictError(
            `A selected stock allocation for line ${item.lineNumber} exceeds its reserved quantity`,
          );
        }

        if (
          allocation.expiryDateSnapshot !== null &&
          allocation.expiryDateSnapshot.getTime() <=
            occurredAt.getTime()
        ) {
          throw new ConflictError(
            `An expired stock allocation was selected for line ${item.lineNumber}`,
          );
        }
      }

      lines.push({
        input:
          lineInput,

        item,
        inventory,

        stockQuantity:
          normalizePharmacyDecimal(
            stockQuantity,
          ),

        requestedQuantity,
      });
    }

    const pricingRequests =
      lines.flatMap(
        (line) =>
          line.input.allocations.map(
            (allocationInput) => {
              const allocation =
                line.item.allocations.find(
                  (candidate) =>
                    candidate._id.toHexString() ===
                    allocationInput.allocationId,
                )!;

              return {
                facilityId:
                  actor.facilityId,

                patientId:
                  dispensation.patientId.toHexString(),

                prescriptionId:
                  dispensation.prescriptionId.toHexString(),

                dispensationId:
                  dispensation._id.toHexString(),

                dispensationItemId:
                  line.item._id.toHexString(),

                formularyItemId:
                  (
                    line.item.actualFormularyItemId ??
                    line.item.prescribedFormularyItemId
                  ).toHexString(),

                inventoryItemId:
                  line.inventory._id.toHexString(),

                inventoryBatchId:
                  allocation.inventoryBatchId?.toHexString() ??
                  null,

                stockQuantity:
                  normalizePharmacyDecimal(
                    allocationInput.stockQuantity,
                  ),

                currency:
                  dispensation.currency,

                context:
                  dispensation.context,

                admissionId:
                  dispensation.admissionId?.toHexString() ??
                  null,

                occurredAt,
              };
            },
          ),
      );

    return {
      lines,
      pricingRequests,
    };
  }

  public async prepareBillingCharges(
    prepared: PreparedDispensingFinalization,
    dispensation: PharmacyDispensationRecord,
  ): Promise<{
    charges: readonly PharmacyBillingChargeInput[];
    pricingByLine: ReadonlyMap<
      string,
      Readonly<{
        unitSellingPrice: string;
        grossAmount: string;
        discountAmount: string;
        taxAmount: string;
        netAmount: string;
        currency: string;
        pricingSource: string;
      }>
    >;
  }> {
    const pricing =
      await this.pricing.prepare(
        prepared.pricingRequests,
      );

    const pricingByLine =
      new Map<
        string,
        {
          unitSellingPrice: string;
          grossAmount: string;
          discountAmount: string;
          taxAmount: string;
          netAmount: string;
          currency: string;
          pricingSource: string;
        }
      >();

    const charges: PharmacyBillingChargeInput[] = [];

    for (const line of prepared.lines) {
      const linePrices =
        prepared.pricingRequests
          .filter(
            (request) =>
              request.dispensationItemId ===
              line.item._id.toHexString(),
          )
          .map((request) => {
            const result =
              pricing.get(
                request.dispensationItemId,
              );

            if (result === undefined) {
              throw new ConflictError(
                'Authoritative pharmacy pricing was not returned',
              );
            }

            return result;
          });

      const gross =
        linePrices.reduce(
          (total, result) =>
            total.plus(
              result.grossAmount,
            ),
          new Decimal(0),
        );

      const discount =
        linePrices.reduce(
          (total, result) =>
            total.plus(
              result.discountAmount,
            ),
          new Decimal(0),
        );

      const tax =
        linePrices.reduce(
          (total, result) =>
            total.plus(
              result.taxAmount,
            ),
          new Decimal(0),
        );

      const net =
        linePrices.reduce(
          (total, result) =>
            total.plus(
              result.netAmount,
            ),
          new Decimal(0),
        );

      const weightedUnitPrice =
        new Decimal(line.requestedQuantity)
          .eq(0)
          ? new Decimal(0)
          : gross.dividedBy(
              line.requestedQuantity,
            );

      const pricingSource =
        [
          ...new Set(
            linePrices.map(
              (result) =>
                result.pricingSource,
            ),
          ),
        ].join('+');

      const summary = {
        unitSellingPrice:
          normalizePharmacyDecimal(
            weightedUnitPrice,
          ),

        grossAmount:
          normalizePharmacyDecimal(
            gross,
          ),

        discountAmount:
          normalizePharmacyDecimal(
            discount,
          ),

        taxAmount:
          normalizePharmacyDecimal(
            tax,
          ),

        netAmount:
          normalizePharmacyDecimal(
            net,
          ),

        currency:
          dispensation.currency,

        pricingSource,
      };

      pricingByLine.set(
        line.item._id.toHexString(),
        summary,
      );

      charges.push({
        facilityId:
          dispensation.facilityId.toHexString(),

        patientId:
          dispensation.patientId.toHexString(),

        encounterId:
          dispensation.encounterId?.toHexString() ??
          null,

        admissionId:
          dispensation.admissionId?.toHexString() ??
          null,

        dispensationId:
          dispensation._id.toHexString(),

        dispensationItemId:
          line.item._id.toHexString(),

        quantity:
          line.requestedQuantity,

        unitPrice:
          summary.unitSellingPrice,

        grossAmount:
          summary.grossAmount,

        discountAmount:
          summary.discountAmount,

        taxAmount:
          summary.taxAmount,

        netAmount:
          summary.netAmount,

        currency:
          summary.currency,

        pricingSource:
          summary.pricingSource,
      });
    }

    return {
      charges,
      pricingByLine,
    };
  }
}