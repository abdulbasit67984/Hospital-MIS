import Decimal from 'decimal.js';

import {
  ConflictError,
} from '@hospital-mis/shared';

import type {
  CreatePatientReturnItemInput,
} from '../pharmacy-dispensing.contracts.js';

import type {
  PharmacyDispensationAllocationRecord,
  PharmacyDispensationItemRecord,
} from '../pharmacy-dispensing.persistence.types.js';

import {
  normalizePharmacyDecimal,
} from '../pharmacy-dispensing.workflow-helpers.js';

export interface PharmacyReturnAssessment {
  originalItem:
    PharmacyDispensationItemRecord;

  originalAllocation:
    PharmacyDispensationAllocationRecord | null;

  quantity:
    string;

  restockEligible:
    boolean;

  disposition:
    | 'RESTOCK'
    | 'QUARANTINE'
    | 'DISPOSE'
    | 'RETURN_TO_SUPPLIER';

  assessmentReason:
    string;
}

function remainingReturnableQuantity(
  item: PharmacyDispensationItemRecord,
): Decimal {
  return new Decimal(
    item.dispensedQuantity.toString(),
  )
    .minus(
      item.returnedQuantity.toString(),
    )
    .minus(
      item.reversedQuantity.toString(),
    );
}

function remainingAllocationReturnableQuantity(
  allocation: PharmacyDispensationAllocationRecord,
): Decimal {
  return new Decimal(
    allocation.consumedStockQuantity.toString(),
  )
    .minus(
      allocation.returnedStockQuantity.toString(),
    );
}

function determineDisposition(
  input: CreatePatientReturnItemInput,
): {
  restockEligible: boolean;
  disposition:
    | 'RESTOCK'
    | 'QUARANTINE'
    | 'DISPOSE'
    | 'RETURN_TO_SUPPLIER';
  reason: string;
} {
  if (
    input.contaminationRisk === 'CONFIRMED'
  ) {
    return {
      restockEligible: false,
      disposition: 'DISPOSE',
      reason:
        'Confirmed contamination prevents medicine restocking',
    };
  }

  if (
    input.contaminationRisk === 'POSSIBLE' ||
    input.contaminationRisk === 'UNKNOWN'
  ) {
    return {
      restockEligible: false,
      disposition: 'QUARANTINE',
      reason:
        'Possible or unknown contamination requires quarantine assessment',
    };
  }

  if (
    input.sealStatus !== 'SEALED_INTACT'
  ) {
    return {
      restockEligible: false,
      disposition: 'QUARANTINE',
      reason:
        'Only medicine with an intact manufacturer or pharmacy seal may be restocked',
    };
  }

  if (
    input.storageIntegrity !== 'CONFIRMED' ||
    input.coldChainIntegrity === 'FAILED'
  ) {
    return {
      restockEligible: false,
      disposition: 'QUARANTINE',
      reason:
        'Storage or cold-chain integrity has not been confirmed',
    };
  }

  if (
    input.requestedDisposition === 'DISPOSE'
  ) {
    return {
      restockEligible: false,
      disposition: 'DISPOSE',
      reason:
        'The authorized requested disposition is disposal',
    };
  }

  if (
    input.requestedDisposition ===
    'RETURN_TO_SUPPLIER'
  ) {
    return {
      restockEligible: false,
      disposition:
        'RETURN_TO_SUPPLIER',
      reason:
        'The authorized requested disposition is supplier return',
    };
  }

  if (
    input.requestedDisposition ===
    'QUARANTINE'
  ) {
    return {
      restockEligible: false,
      disposition: 'QUARANTINE',
      reason:
        'The medicine was explicitly routed to quarantine',
    };
  }

  return {
    restockEligible: true,
    disposition: 'RESTOCK',
    reason:
      'Seal, storage, cold-chain, and contamination checks permit restocking',
  };
}

export class PharmacyReturnAssessmentService {
  public assess(
    item:
      PharmacyDispensationItemRecord,

    input:
      CreatePatientReturnItemInput,
  ): PharmacyReturnAssessment {
    const quantity =
      normalizePharmacyDecimal(
        input.quantity,
      );

    const returnable =
      remainingReturnableQuantity(
        item,
      );

    if (
      new Decimal(quantity).gt(
        returnable,
      )
    ) {
      throw new ConflictError(
        `Returned quantity for dispensing line ${item.lineNumber} exceeds its remaining returnable quantity`,
      );
    }

    const allocation =
      input.originalAllocationId == null
        ? null
        : item.allocations.find(
            (candidate) =>
              candidate._id.toHexString() ===
              input.originalAllocationId,
          ) ??
          null;

    if (
      input.originalAllocationId != null &&
      allocation === null
    ) {
      throw new ConflictError(
        `The selected return allocation does not belong to dispensing line ${item.lineNumber}`,
      );
    }

    if (allocation !== null) {
      const allocationReturnable =
        remainingAllocationReturnableQuantity(
          allocation,
        );

      if (
        new Decimal(quantity).gt(
          allocationReturnable,
        )
      ) {
        throw new ConflictError(
          `Returned quantity for allocation ${allocation._id.toHexString()} exceeds its remaining consumed quantity`,
        );
      }
    }

    if (
      item.controlledMedicine &&
      input.originalAllocationId == null
    ) {
      throw new ConflictError(
        'Controlled-medicine returns require original batch-allocation attribution',
      );
    }

    const decision =
      determineDisposition(input);

    return {
      originalItem:
        item,

      originalAllocation:
        allocation,

      quantity,

      restockEligible:
        decision.restockEligible,

      disposition:
        decision.disposition,

      assessmentReason:
        decision.reason,
    };
  }
}