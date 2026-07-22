import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const databaseMocks = vi.hoisted(() => {
  let reservationRecord: unknown = null;
  let reservationUpdateRecord: unknown = null;
  let allocationUpdateRecord: unknown = null;

  const query = (read: () => unknown) => ({
    session: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn(async () => read()),
  });

  return {
    setReservationRecord(value: unknown) {
      reservationRecord = value;
    },
    setReservationUpdateRecord(value: unknown) {
      reservationUpdateRecord = value;
    },
    setAllocationUpdateRecord(value: unknown) {
      allocationUpdateRecord = value;
    },
    reservationFindOne: vi.fn(() => query(() => reservationRecord)),
    reservationFindOneAndUpdate: vi.fn(() => query(() => reservationUpdateRecord)),
    allocationFindOneAndUpdate: vi.fn(() => query(() => allocationUpdateRecord)),
  };
});

vi.mock('@hospital-mis/database', () => ({
  AssistanceReservationModel: {
    findOne: databaseMocks.reservationFindOne,
    findOneAndUpdate: databaseMocks.reservationFindOneAndUpdate,
  },
  InvoiceFundAllocationModel: {
    findOneAndUpdate: databaseMocks.allocationFindOneAndUpdate,
  },
  createObjectId: () => objectId('64b000000000000000000099'),
  decimal128ToString: (value: { toString(): string } | string) =>
    typeof value === 'string' ? value : value.toString(),
  decimalStringToDecimal128: (value: string) => ({
    toString: () => value,
  }),
  toObjectId: (value: string) => objectId(value),
}));

import { AssistanceDoubleFundingError } from '../welfare-zakat.errors.js';
import { MongoAssistanceAllocationRepository } from '../repositories/assistance-allocation.repository.js';
import { MongoAssistanceReservationRepository } from '../repositories/assistance-reservation.repository.js';
import {
  throwMappedWelfareZakatPersistenceError,
} from '../repositories/welfare-zakat-repository.support.js';
import type {
  WelfareZakatActorContext,
} from '../welfare-zakat.contracts.js';
import type {
  WelfareZakatTransactionContext,
} from '../welfare-zakat.ports.js';

const facilityId = '64b000000000000000000001';
const actorUserId = '64b000000000000000000002';
const reservationId = '64b000000000000000000003';
const allocationId = '64b000000000000000000004';
const firstLineId = '64b000000000000000000005';
const secondLineId = '64b000000000000000000006';

function objectId(value: string) {
  return {
    toHexString: () => value,
    toString: () => value,
    equals: (candidate: { toString(): string }) => candidate.toString() === value,
  };
}

function decimal(value: string) {
  return { toString: () => value };
}

function actor(): WelfareZakatActorContext {
  return {
    userId: actorUserId,
    staffId: null,
    facilityId,
    correlationId: 'welfare-zakat-batch-4-repository-test',
    permissionKeys: new Set(),
    roleKeys: ['BILLING_OFFICER'],
  };
}

function transaction(): WelfareZakatTransactionContext {
  return {
    transactionId: 'welfare-zakat-batch-4-repository-transaction',
    session: {} as WelfareZakatTransactionContext['session'],
  };
}

describe('Welfare and Zakat Batch 4 repositories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('consumes a reservation with an optimistic version and exact Decimal128 values', async () => {
    const current = {
      _id: objectId(reservationId),
      facilityId: objectId(facilityId),
      version: 7,
      status: 'ACTIVE',
      remainingAmount: decimal('125.10'),
      consumedAmount: decimal('24.90'),
    };
    databaseMocks.setReservationRecord(current);
    databaseMocks.setReservationUpdateRecord({
      ...current,
      version: 8,
      status: 'PARTIALLY_CONSUMED',
      remainingAmount: decimal('100.05'),
      consumedAmount: decimal('49.95'),
    });

    const repository = new MongoAssistanceReservationRepository();
    const result = await repository.consume({
      actor: actor(),
      reservationId,
      expectedVersion: 7,
      amount: '25.05',
      consumedAt: new Date('2026-07-22T10:00:00.000Z'),
      transaction: transaction(),
    });

    expect(result?.version).toBe(8);
    const [filter, update, options] =
      databaseMocks.reservationFindOneAndUpdate.mock.calls[0]!;
    expect(filter).toMatchObject({ version: 7, status: 'ACTIVE' });
    expect(update.$set.consumedAmount.toString()).toBe('49.95');
    expect(update.$set.remainingAmount.toString()).toBe('100.05');
    expect(options).toMatchObject({ runValidators: true, returnDocument: 'after' });
  });

  it('preserves an active reservation status after a partial release', async () => {
    const current = {
      _id: objectId(reservationId),
      facilityId: objectId(facilityId),
      version: 9,
      status: 'ACTIVE',
      remainingAmount: decimal('100.00'),
      releasedAmount: decimal('0.00'),
    };
    databaseMocks.setReservationRecord(current);
    databaseMocks.setReservationUpdateRecord({
      ...current,
      version: 10,
      status: 'ACTIVE',
      remainingAmount: decimal('60.00'),
      releasedAmount: decimal('40.00'),
    });

    const repository = new MongoAssistanceReservationRepository();
    const result = await repository.release({
      actor: actor(),
      reservationId,
      expectedVersion: 9,
      amount: '40.00',
      status: 'RELEASED',
      reason: 'Release the unused portion of the reservation',
      releasedAt: new Date('2026-07-22T10:30:00.000Z'),
      transaction: transaction(),
    });

    expect(result?.status).toBe('ACTIVE');
    const [, update] = databaseMocks.reservationFindOneAndUpdate.mock.calls[0]!;
    expect(update.$set.status).toBe('ACTIVE');
    expect(update.$set.remainingAmount.toString()).toBe('60.00');
    expect(update.$set.releasedAt).toBeNull();
  });

  it('uses valid indexed array-filter aliases for invoice-line financial summaries', async () => {
    databaseMocks.setAllocationUpdateRecord({
      _id: objectId(allocationId),
      facilityId: objectId(facilityId),
      version: 3,
      status: 'PARTIALLY_REVERSED',
    });
    const repository = new MongoAssistanceAllocationRepository();

    await repository.applyFinancialSummary({
      actor: actor(),
      allocationId,
      expectedVersion: 2,
      amounts: {
        reversedAmount: '30.00',
        remainingAmount: '30.00',
      },
      lineAmounts: [
        {
          invoiceLineId: firstLineId,
          amounts: { reversedAmount: '10.00', remainingAmount: '10.00' },
        },
        {
          invoiceLineId: secondLineId,
          amounts: { reversedAmount: '20.00', remainingAmount: '20.00' },
        },
      ],
      status: 'PARTIALLY_REVERSED',
      reversalStatus: 'POSTED',
      transaction: transaction(),
    });

    const [filter, update, options] =
      databaseMocks.allocationFindOneAndUpdate.mock.calls[0]!;
    expect(filter).toMatchObject({ version: 2 });
    expect(Object.keys(update.$set)).toContain(
      'lines.$[allocationLine0].reversedAmount',
    );
    expect(Object.keys(update.$set)).toContain(
      'lines.$[allocationLine1].remainingAmount',
    );
    expect(options.arrayFilters).toEqual([
      { 'allocationLine0.invoiceLineId': expect.objectContaining({}) },
      { 'allocationLine1.invoiceLineId': expect.objectContaining({}) },
    ]);
  });

  it('maps an allocation duplicate key to a double-funding domain error', () => {
    expect(() =>
      throwMappedWelfareZakatPersistenceError(
        {
          code: 11000,
          keyPattern: { facilityId: 1, duplicateKey: 1 },
          keyValue: { facilityId, duplicateKey: 'duplicate-allocation' },
        },
        'ALLOCATION',
      ),
    ).toThrow(AssistanceDoubleFundingError);
  });
});