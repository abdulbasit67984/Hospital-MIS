import Decimal from 'decimal.js';

import {
  describe,
  expect,
  it,
} from 'vitest';

import type {
  PharmacyPricingPort,
  PharmacyPrescriptionRepositoryPort,
  PharmacySafetyPort,
} from '../pharmacy-dispensing.ports.js';

import {
  PharmacyPriceResolutionError,
} from '../pharmacy-dispensing.errors.js';

import {
  normalizePharmacyDecimal,
  pharmacyLockKey,
  remainingPrescriptionQuantity,
} from '../pharmacy-dispensing.workflow-helpers.js';

import {
  PharmacyPricingPreparationService,
} from '../services/pharmacy-pricing-preparation.service.js';

import {
  PharmacySafetyService,
} from '../services/pharmacy-safety.service.js';

const facilityId =
  '64b64b64b64b64b64b64b641';
const patientId =
  '64b64b64b64b64b64b64b642';
const prescriptionId =
  '64b64b64b64b64b64b64b643';
const prescriptionItemId =
  '64b64b64b64b64b64b64b644';
const dispensationId =
  '64b64b64b64b64b64b64b645';
const dispensationItemId =
  '64b64b64b64b64b64b64b646';
const formularyItemId =
  '64b64b64b64b64b64b64b647';
const inventoryItemId =
  '64b64b64b64b64b64b64b648';

function prescriptionRepository():
PharmacyPrescriptionRepositoryPort {
  return {
    async findPrescription() {
      return null;
    },

    async listPrescriptionItems() {
      return [];
    },

    async listPrescriptionWarnings() {
      return [
        {
          _id: {
            toHexString: () =>
              '64b64b64b64b64b64b64b650',
          },
          prescriptionId: {
            toHexString: () =>
              prescriptionId,
          },
          prescriptionItemId: {
            toHexString: () =>
              prescriptionItemId,
          },
          warningType:
            'ALLERGY',
          severity:
            'BLOCKING',
          status:
            'OPEN',
          warningCode:
            'ALLERGY_MATCH',
          message:
            'Recorded allergy matches prescribed medicine',
          detectedAt:
            new Date(),
        },
      ] as never;
    },

    async findFormularyItem() {
      return null;
    },

    async findInventoryItemForFormulary() {
      return null;
    },

    async updateDispensingProgress() {
      return null;
    },
  };
}

describe(
  'pharmacy intake, review, pricing, and reservation foundations',
  () => {
    it(
      'calculates exact remaining quantities without floating-point arithmetic',
      () => {
        expect(
          remainingPrescriptionQuantity(
            '10.00000000',
            '3.12500000',
          ),
        ).toBe('6.875');

        expect(
          normalizePharmacyDecimal(
            new Decimal('0.1').plus('0.2'),
          ),
        ).toBe('0.3');
      },
    );

    it(
      'creates deterministic pharmacy lock keys',
      () => {
        expect(
          pharmacyLockKey(
            'pharmacy-dispensing:prescription',
            facilityId,
            prescriptionId,
          ),
        ).toBe(
          `pharmacy-dispensing:prescription:${facilityId}:${prescriptionId}`,
        );
      },
    );

    it(
      'combines authoritative prescription warnings with external safety findings',
      async () => {
        const safetyPort:
          PharmacySafetyPort = {
            async evaluate() {
              return [
                {
                  fingerprint:
                    'external-dose-range-warning',
                  type:
                    'DOSE_RANGE',
                  severity:
                    'HIGH',
                  disposition:
                    'BLOCKING',
                  code:
                    'DOSE_TOO_HIGH',
                  message:
                    'Dose exceeds the configured range',
                  prescriptionItemId,
                  sourceEntityType:
                    'DOSE_RANGE_RULE',
                  sourceEntityId:
                    null,
                },
              ];
            },
          };

        const service =
          new PharmacySafetyService(
            prescriptionRepository(),
            safetyPort,
          );

        const result =
          await service.evaluate(
            {
              userId:
                '64b64b64b64b64b64b64b651',
              facilityId,
              correlationId:
                'corr-pharmacy-safety',
              roleKeys:
                ['PHARMACIST'],
              permissionKeys:
                ['pharmacy.verify'],
            },
            {
              facilityId,
              patientId,
              encounterId:
                null,
              admissionId:
                null,
              prescriptionId,
              prescriptionItemIds:
                [prescriptionItemId],
              evaluatedAt:
                new Date(),
            },
          );

        expect(
          result.findings,
        ).toHaveLength(2);

        expect(
          result.blockingCount,
        ).toBe(2);

        const decided =
          service.applyDecisions(
            result,
            [
              {
                alertFingerprint:
                  'external-dose-range-warning',
                disposition:
                  'OVERRIDDEN',
                reason:
                  'Dose confirmed with prescriber',
              },
            ],
          );

        expect(
          decided.blockingCount,
        ).toBe(1);
      },
    );

    it(
      'accepts reconciled authoritative pricing',
      async () => {
        const port:
          PharmacyPricingPort = {
            async resolve() {
              return {
                unitSellingPrice:
                  '12.50',
                grossAmount:
                  '25.00',
                discountAmount:
                  '2.00',
                taxAmount:
                  '1.00',
                netAmount:
                  '24.00',
                currency:
                  'PKR',
                pricingSource:
                  'BATCH_SELLING_PRICE',
                authoritativeRecordId:
                  null,
                priceOverrideRequired:
                  false,
              };
            },
          };

        const service =
          new PharmacyPricingPreparationService(
            port,
          );

        const result =
          await service.prepare([
            {
              facilityId,
              patientId,
              prescriptionId,
              dispensationId,
              dispensationItemId,
              formularyItemId,
              inventoryItemId,
              inventoryBatchId:
                null,
              stockQuantity:
                '2',
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
            dispensationItemId,
          ),
        ).toEqual(
          expect.objectContaining({
            unitSellingPrice:
              '12.5',
            grossAmount:
              '25',
            netAmount:
              '24',
            currency:
              'PKR',
          }),
        );
      },
    );

    it(
      'rejects server pricing that does not reconcile exactly',
      async () => {
        const port:
          PharmacyPricingPort = {
            async resolve() {
              return {
                unitSellingPrice:
                  '12.50',
                grossAmount:
                  '24.99',
                discountAmount:
                  '0',
                taxAmount:
                  '0',
                netAmount:
                  '24.99',
                currency:
                  'PKR',
                pricingSource:
                  'INVALID_TEST_PRICE',
                authoritativeRecordId:
                  null,
                priceOverrideRequired:
                  false,
              };
            },
          };

        const service =
          new PharmacyPricingPreparationService(
            port,
          );

        await expect(
          service.prepare([
            {
              facilityId,
              patientId,
              prescriptionId,
              dispensationId,
              dispensationItemId,
              formularyItemId,
              inventoryItemId,
              inventoryBatchId:
                null,
              stockQuantity:
                '2',
              currency:
                'PKR',
              context:
                'OUTPATIENT',
              admissionId:
                null,
              occurredAt:
                new Date(),
            },
          ]),
        ).rejects.toBeInstanceOf(
          PharmacyPriceResolutionError,
        );
      },
    );
  },
);