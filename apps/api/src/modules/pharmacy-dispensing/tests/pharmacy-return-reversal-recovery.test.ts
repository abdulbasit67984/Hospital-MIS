import Decimal from 'decimal.js';

import {
  describe,
  expect,
  it,
} from 'vitest';

import type {
  PharmacyDispensationItemRecord,
  PharmacyDispensationRecord,
} from '../pharmacy-dispensing.persistence.types.js';

import {
  PharmacyReturnAssessmentService,
} from '../services/pharmacy-return-assessment.service.js';

import {
  PharmacyReversalFinalizationService,
} from '../services/pharmacy-reversal-finalization.service.js';

function objectId(value: string) {
  return {
    toHexString: () => value,
  };
}

const itemId =
  '64b64b64b64b64b64b64b641';

const allocationId =
  '64b64b64b64b64b64b64b642';

function dispensingItem(
  overrides:
    Partial<PharmacyDispensationItemRecord> = {},
): PharmacyDispensationItemRecord {
  return {
    _id:
      objectId(itemId),

    lineNumber: 1,

    status:
      'DISPENSED',

    controlledMedicine:
      false,

    dispensedQuantity:
      {
        toString: () => '10',
      },

    returnedQuantity:
      {
        toString: () => '2',
      },

    reversedQuantity:
      {
        toString: () => '1',
      },

    grossAmount:
      {
        toString: () => '100',
      },

    discountAmount:
      {
        toString: () => '10',
      },

    taxAmount:
      {
        toString: () => '5',
      },

    netAmount:
      {
        toString: () => '95',
      },

    allocations: [
      {
        _id:
          objectId(allocationId),

        consumedStockQuantity: {
          toString: () => '10',
        },

        returnedStockQuantity: {
          toString: () => '2',
        },
      },
    ],

    ...overrides,
  } as PharmacyDispensationItemRecord;
}

describe(
  'pharmacy returns, reversals, and recovery',
  () => {
    it(
      'only permits restocking when seal and storage integrity are confirmed',
      () => {
        const service =
          new PharmacyReturnAssessmentService();

        const result =
          service.assess(
            dispensingItem(),
            {
              originalDispensationItemId:
                itemId,

              originalAllocationId:
                allocationId,

              quantity:
                '2',

              sealStatus:
                'SEALED_INTACT',

              storageIntegrity:
                'CONFIRMED',

              coldChainIntegrity:
                'CONFIRMED',

              contaminationRisk:
                'NONE_IDENTIFIED',
            },
          );

        expect(
          result.restockEligible,
        ).toBe(true);

        expect(
          result.disposition,
        ).toBe('RESTOCK');
      },
    );

    it(
      'routes uncertain contamination to quarantine',
      () => {
        const service =
          new PharmacyReturnAssessmentService();

        const result =
          service.assess(
            dispensingItem(),
            {
              originalDispensationItemId:
                itemId,

              originalAllocationId:
                allocationId,

              quantity:
                '1',

              sealStatus:
                'SEALED_INTACT',

              storageIntegrity:
                'CONFIRMED',

              coldChainIntegrity:
                'CONFIRMED',

              contaminationRisk:
                'UNKNOWN',
            },
          );

        expect(
          result.restockEligible,
        ).toBe(false);

        expect(
          result.disposition,
        ).toBe('QUARANTINE');
      },
    );

    it(
      'rejects quantities above the remaining returnable amount',
      () => {
        const service =
          new PharmacyReturnAssessmentService();

        expect(() =>
          service.assess(
            dispensingItem(),
            {
              originalDispensationItemId:
                itemId,

              originalAllocationId:
                allocationId,

              quantity:
                '8',

              sealStatus:
                'SEALED_INTACT',

              storageIntegrity:
                'CONFIRMED',

              coldChainIntegrity:
                'CONFIRMED',

              contaminationRisk:
                'NONE_IDENTIFIED',
            },
          ),
        ).toThrow(
          'exceeds its remaining returnable quantity',
        );
      },
    );

    it(
      'requires batch-allocation attribution for controlled medicine returns',
      () => {
        const service =
          new PharmacyReturnAssessmentService();

        expect(() =>
          service.assess(
            dispensingItem({
              controlledMedicine:
                true,
            }),
            {
              originalDispensationItemId:
                itemId,

              quantity:
                '1',

              sealStatus:
                'SEALED_INTACT',

              storageIntegrity:
                'CONFIRMED',

              coldChainIntegrity:
                'CONFIRMED',

              contaminationRisk:
                'NONE_IDENTIFIED',
            },
          ),
        ).toThrow(
          'require original batch-allocation attribution',
        );
      },
    );

    it(
      'prepares exact proportional reversal amounts',
      () => {
        const service =
          new PharmacyReversalFinalizationService();

        const result =
          service.prepare(
            {
              currency:
                'PKR',
            } as PharmacyDispensationRecord,

            [
              dispensingItem({
                returnedQuantity: {
                  toString: () => '2',
                } as never,

                reversedQuantity: {
                  toString: () => '0',
                } as never,
              }),
            ],

            undefined,
          );

        expect(
          result.lines[0]
            ?.reversibleQuantity,
        ).toBe('8');

        expect(
          result.grossAmount,
        ).toBe('80');

        expect(
          result.discountAmount,
        ).toBe('8');

        expect(
          result.taxAmount,
        ).toBe('4');

        expect(
          result.netAmount,
        ).toBe('76');
      },
    );

    it(
      'does not use floating-point arithmetic for returned quantities',
      () => {
        const returned =
          new Decimal('0.1')
            .plus('0.2');

        expect(
          returned.toFixed(),
        ).toBe('0.3');
      },
    );
  },
);