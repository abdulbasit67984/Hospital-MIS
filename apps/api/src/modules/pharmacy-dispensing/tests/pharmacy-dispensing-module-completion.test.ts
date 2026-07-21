import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  Types,
} from 'mongoose';

import {
  ControlledMedicineRegisterService,
} from '../services/controlled-medicine-register.service.js';

import {
  PharmacyDispensingQueryService,
} from '../services/pharmacy-dispensing-query.service.js';

const facilityId = '64b64b64b64b64b64b64b641';
const userId = '64b64b64b64b64b64b64b642';
const staffId = '64b64b64b64b64b64b64b643';
const witnessId = '64b64b64b64b64b64b64b644';
const dispensationId = '64b64b64b64b64b64b64b645';
const itemId = '64b64b64b64b64b64b64b646';
const allocationId = '64b64b64b64b64b64b64b647';
const inventoryItemId = '64b64b64b64b64b64b64b648';

function actor() {
  return {
    userId,
    facilityId,
    correlationId: 'corr-pharmacy-batch-6',
    roleKeys: ['PHARMACIST'],
    permissionKeys: ['pharmacy.read', 'pharmacy.reports.read'],
  };
}

describe('pharmacy dispensing module completion', () => {
  it('returns a minimum-safe worklist page through the query boundary', async () => {
    const worklists = {
      listPending: vi.fn(async () => ({
        items: [
          {
            _id: new Types.ObjectId(dispensationId),
            dispensationNumber: 'DSP-2026-0000001',
            grossAmount: Types.Decimal128.fromString('12.50'),
            queuedAt: new Date('2026-07-21T08:00:00.000Z'),
          },
        ],
        page: 1,
        pageSize: 25,
        totalItems: 1,
        totalPages: 1,
      })),
    };
    const service = new PharmacyDispensingQueryService(
      {} as never,
      worklists as never,
      {
        authorize: vi.fn(async () => ({
          allowed: true,
          accessMode: 'PHARMACY_OPERATIONAL',
          includeCost: false,
          minimumNecessaryFields: [],
          auditSensitiveRead: false,
        })),
      },
    );

    await expect(service.listWorklist(actor(), {})).resolves.toEqual({
      items: [
        {
          _id: dispensationId,
          dispensationNumber: 'DSP-2026-0000001',
          grossAmount: '12.50',
          queuedAt: '2026-07-21T08:00:00.000Z',
        },
      ],
      page: 1,
      pageSize: 25,
      totalItems: 1,
      totalPages: 1,
    });
  });

  it('posts an exact inbound controlled-register reversal balance', async () => {
    const create = vi.fn(async (input) => ({
      ...input,
      _id: new Types.ObjectId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const service = new ControlledMedicineRegisterService(
      {
        findByOperationKey: vi.fn(async () => null),
        findLatestBalance: vi.fn(async () => ({
          closingBalance: Types.Decimal128.fromString('7.25'),
          _id: new Types.ObjectId(),
        })),
        create,
      } as never,
      {
        next: vi.fn(async () => ({
          key: 'pharmacy.controlled-register.number',
          value: 12,
        })),
      },
    );

    await service.recordReversal({
      actor: actor(),
      operational: {
        actor: {
          userId,
          staffId,
          facilityId,
          departmentId: null,
          displayName: 'Pharmacist',
          professionalType: 'PHARMACIST',
        },
        location: {
          locationId: new Types.ObjectId().toHexString(),
          facilityId,
          locationCode: 'PHARM-01',
          name: 'Main Pharmacy',
          locationType: 'PHARMACY',
          departmentId: null,
          wardId: null,
          servicePointId: null,
          supportsDispensing: true,
          allowsControlledMedicine: true,
          status: 'ACTIVE',
        },
      },
      dispensation: {
        _id: new Types.ObjectId(dispensationId),
        pharmacyLocationId: new Types.ObjectId(),
        sourceStockLocationId: new Types.ObjectId(),
        patientId: new Types.ObjectId(),
        prescriptionId: new Types.ObjectId(),
        prescriberProviderId: new Types.ObjectId(),
      } as never,
      item: {
        _id: new Types.ObjectId(itemId),
        prescriptionItemId: new Types.ObjectId(),
        controlledMedicine: true,
        actualFormularyItemId: new Types.ObjectId(),
        prescribedFormularyItemId: new Types.ObjectId(),
        actualMedicineId: new Types.ObjectId(),
        prescribedMedicineId: new Types.ObjectId(),
      } as never,
      allocation: {
        _id: new Types.ObjectId(allocationId),
        inventoryBatchId: new Types.ObjectId(),
        batchNumberSnapshot: 'BATCH-01',
        expiryDateSnapshot: new Date('2027-01-01T00:00:00.000Z'),
        stockUnitId: new Types.ObjectId(),
      } as never,
      inventoryItemId,
      stockQuantity: '2.75',
      stockMovementId: new Types.ObjectId().toHexString(),
      witnessStaffId: witnessId,
      transactionId: 'tx-controlled-reversal',
      idempotencyKey: 'idem-controlled-reversal',
      occurredAt: new Date('2026-07-21T08:00:00.000Z'),
      session: {} as never,
      sourceType: 'REVERSAL',
      sourceId: new Types.ObjectId().toHexString(),
      reason: 'Entered in error and reversed with witness',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'IN',
        entryType: 'REVERSAL',
        quantity: expect.objectContaining({}),
        openingBalance: expect.objectContaining({}),
        closingBalance: expect.objectContaining({}),
      }),
      expect.anything(),
    );
    const created = create.mock.calls[0]?.[0] as {
      openingBalance: Types.Decimal128;
      quantity: Types.Decimal128;
      closingBalance: Types.Decimal128;
    };
    expect(created.openingBalance.toString()).toBe('7.25');
    expect(created.quantity.toString()).toBe('2.75');
    expect(created.closingBalance.toString()).toBe('10');
  });

  it('rejects a controlled-register witness who is the pharmacist', async () => {
    const service = new ControlledMedicineRegisterService(
      {} as never,
      {} as never,
    );

    await expect(
      service.recordReversal({
        actor: actor(),
        operational: {
          actor: {
            userId,
            staffId,
            facilityId,
            departmentId: null,
            displayName: 'Pharmacist',
            professionalType: 'PHARMACIST',
          },
          location: {
            locationId: new Types.ObjectId().toHexString(),
            facilityId,
            locationCode: 'PHARM-01',
            name: 'Main Pharmacy',
            locationType: 'PHARMACY',
            departmentId: null,
            wardId: null,
            servicePointId: null,
            supportsDispensing: true,
            allowsControlledMedicine: true,
            status: 'ACTIVE',
          },
        },
        dispensation: {} as never,
        item: { controlledMedicine: true } as never,
        allocation: {} as never,
        inventoryItemId,
        stockQuantity: '1',
        stockMovementId: null,
        witnessStaffId: staffId,
        transactionId: 'tx',
        idempotencyKey: 'idempotency-key',
        occurredAt: new Date(),
        session: {} as never,
        sourceType: 'REVERSAL',
        sourceId: new Types.ObjectId().toHexString(),
        reason: 'Reversal',
      }),
    ).rejects.toThrow('must be different staff members');
  });
});