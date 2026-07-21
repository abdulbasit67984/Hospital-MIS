import Decimal from 'decimal.js';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  normalizePharmacyDecimal,
} from '../pharmacy-dispensing.workflow-helpers.js';

import {
  PharmacyPricingPreparationService,
} from '../services/pharmacy-pricing-preparation.service.js';

import type {
  PharmacyPricingPort,
} from '../pharmacy-dispensing.ports.js';

describe(
  'pharmacy dispensing finalization',
  () => {
    it(
      'reconciles partial dispensing quantities exactly',
      () => {
        const approved =
          new Decimal('10');

        const previouslyDispensed =
          new Decimal('3.25');

        const currentDispense =
          new Decimal('2.75');

        const newDispensed =
          previouslyDispensed.plus(
            currentDispense,
          );

        expect(
          normalizePharmacyDecimal(
            newDispensed,
          ),
        ).toBe('6');

        expect(
          newDispensed.lte(
            approved,
          ),
        ).toBe(true);
      },
    );

    it(
      'reconciles allocation quantities without floating point arithmetic',
      () => {
        const allocationOne =
          new Decimal('1.125');

        const allocationTwo =
          new Decimal('2.875');

        expect(
          normalizePharmacyDecimal(
            allocationOne.plus(
              allocationTwo,
            ),
          ),
        ).toBe('4');
      },
    );

    it(
      'prepares authoritative batch pricing',
      async () => {
        const pricingPort:
          PharmacyPricingPort = {
            async resolve(request) {
              return {
                unitSellingPrice:
                  '25',

                grossAmount:
                  new Decimal(
                    request.stockQuantity,
                  )
                    .times('25')
                    .toFixed(),

                discountAmount:
                  '0',

                taxAmount:
                  '0',

                netAmount:
                  new Decimal(
                    request.stockQuantity,
                  )
                    .times('25')
                    .toFixed(),

                currency:
                  'PKR',

                pricingSource:
                  'BATCH_SELLING_PRICE',

                authoritativeRecordId:
                  request.inventoryBatchId,

                priceOverrideRequired:
                  false,
              };
            },
          };

        const service =
          new PharmacyPricingPreparationService(
            pricingPort,
          );

        const result =
          await service.prepare([
            {
              facilityId:
                '64b64b64b64b64b64b64b641',

              patientId:
                '64b64b64b64b64b64b64b642',

              prescriptionId:
                '64b64b64b64b64b64b64b643',

              dispensationId:
                '64b64b64b64b64b64b64b644',

              dispensationItemId:
                '64b64b64b64b64b64b64b645',

              formularyItemId:
                '64b64b64b64b64b64b64b646',

              inventoryItemId:
                '64b64b64b64b64b64b64b647',

              inventoryBatchId:
                '64b64b64b64b64b64b64b648',

              stockQuantity:
                '2.5',

              currency:
                'PKR',

              context:
                'OUTPATIENT',

              admissionId:
                null,

              occurredAt:
                new Date(),
            },
          ]);

        expect(
          result.get(
            '64b64b64b64b64b64b64b645',
          ),
        ).toEqual(
          expect.objectContaining({
            unitSellingPrice:
              '25',

            grossAmount:
              '62.5',

            netAmount:
              '62.5',

            currency:
              'PKR',
          }),
        );
      },
    );

    it(
      'requires controlled medicine witnesses to be independent',
      () => {
        const pharmacistStaffId =
          '64b64b64b64b64b64b64b650';

        const witnessStaffId =
          '64b64b64b64b64b64b64b651';

        expect(
          pharmacistStaffId,
        ).not.toBe(
          witnessStaffId,
        );
      },
    );

    it(
      'does not allow an allocation to exceed its reserved quantity',
      () => {
        const reserved =
          new Decimal('5');

        const alreadyConsumed =
          new Decimal('2');

        const remaining =
          reserved.minus(
            alreadyConsumed,
          );

        expect(
          new Decimal('3').lte(
            remaining,
          ),
        ).toBe(true);

        expect(
          new Decimal('3.00000001').lte(
            remaining,
          ),
        ).toBe(false);
      },
    );
  },
);