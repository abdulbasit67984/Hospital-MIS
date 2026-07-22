import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  migrations,
  welfareZakatFoundation,
  welfareZakatFoundationCollections,
  welfareZakatFoundationValidators,
} from '../migrations/index.js';

describe('Welfare and Zakat migration registration', () => {
  it('registers migration 035 immediately after claims', () => {
    const ids = migrations.map((migration) => migration.id);
    expect(ids.at(-2)).toBe('034-claims-foundation');
    expect(ids.at(-1)).toBe('035-welfare-zakat-foundation');
    expect(welfareZakatFoundation.id).toBe('035-welfare-zakat-foundation');
  });

  it('covers every Welfare and Zakat collection with a strict validator', () => {
    expect(welfareZakatFoundationCollections).toHaveLength(14);
    expect(Object.keys(welfareZakatFoundationValidators).sort()).toEqual(
      [...welfareZakatFoundationCollections].sort(),
    );

    for (const collectionName of welfareZakatFoundationCollections) {
      expect(welfareZakatFoundationValidators[collectionName]).toMatchObject({
        $jsonSchema: {
          bsonType: 'object',
          required: expect.arrayContaining(['facilityId', 'createdAt', 'updatedAt']),
        },
      });
    }
  });

  it('includes reservations, immutable histories, returns, transfers, and work queues', () => {
    expect(welfareZakatFoundationCollections).toEqual(
      expect.arrayContaining([
        'fundTransfers',
        'assistanceApplicationHistories',
        'assistanceReviews',
        'eligibilityEvaluationSnapshots',
        'assistanceApprovalHistories',
        'assistanceReservations',
        'fundReturns',
        'assistanceWorkItems',
      ]),
    );
  });
});