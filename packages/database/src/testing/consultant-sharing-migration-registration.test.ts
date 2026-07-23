import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  consultantSharingFoundation,
  consultantSharingFoundationCollections,
  consultantSharingFoundationValidators,
  migrations,
} from '../migrations/index.js';

describe('Consultant sharing migration registration', () => {
  it('registers migration 036 immediately after Welfare and Zakat', () => {
    const ids = migrations.map((migration) => migration.id);

    expect(ids.at(-2)).toBe('035-welfare-zakat-foundation');
    expect(ids.at(-1)).toBe('036-consultant-sharing-foundation');
    expect(consultantSharingFoundation.id).toBe(
      '036-consultant-sharing-foundation',
    );
  });

  it('covers every consultant-sharing collection with a strict validator', () => {
    expect(consultantSharingFoundationCollections).toHaveLength(15);
    expect(Object.keys(consultantSharingFoundationValidators).sort()).toEqual(
      [...consultantSharingFoundationCollections].sort(),
    );

    for (const collectionName of consultantSharingFoundationCollections) {
      expect(consultantSharingFoundationValidators[collectionName]).toMatchObject({
        $jsonSchema: {
          bsonType: 'object',
          required: expect.arrayContaining([
            'facilityId',
            'createdAt',
            'updatedAt',
          ]),
        },
      });
    }
  });

  it('includes version histories, calculation recovery, participant allocation, payouts, and disputes', () => {
    expect(consultantSharingFoundationCollections).toEqual(
      expect.arrayContaining([
        'consultantAgreementHistories',
        'consultantAgreementRuleHistories',
        'consultantCalculationRuns',
        'consultantRevenueParticipants',
        'consultantRevenueAdjustments',
        'consultantRevenueReversals',
        'consultantSettlementPayments',
        'consultantDisputeHistories',
        'consultantWorkItems',
      ]),
    );
  });
});