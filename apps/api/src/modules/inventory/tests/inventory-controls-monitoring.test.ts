import {
  Types,
} from 'mongoose';

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  StockAdjustmentModel,
  collectionSpecs,
  migrations,
  schemaForCollection,
} from '@hospital-mis/database';

import {
  activateProductRecallBodySchema,
  createPhysicalStockCountBodySchema,
  createProductRecallBodySchema,
  createStockAdjustmentBodySchema,
  upsertReorderRuleBodySchema,
} from '../inventory-control.validation.js';

import type {
  InventoryControlDependencies,
} from '../inventory-control.ports.js';

import type {
  StockAdjustmentRecord,
} from '../inventory-control.persistence.types.js';

import {
  InventoryControlService,
} from '../services/inventory-control.service.js';

function objectId(): Types.ObjectId {
  return new Types.ObjectId();
}

function adjustmentRecord(): StockAdjustmentRecord {
  const facilityId = objectId();
  const actorUserId = objectId();
  const requestedByStaffId = objectId();
  const itemId = objectId();
  const stockUnitId = objectId();
  const now = new Date('2026-07-20T10:00:00.000Z');

  return {
    _id: objectId(),
    facilityId,
    transactionId: 'tx-adjustment',
    correlationId: 'corr-adjustment',
    schemaVersion: 1,
    version: 1,
    createdBy: actorUserId,
    updatedBy: actorUserId,
    createdAt: now,
    updatedAt: now,
    adjustmentNumber: 'FAC-ADJ-2026-00000001',
    locationId: objectId(),
    adjustmentType: 'MANUAL_CORRECTION',
    requestedByStaffId,
    approvedByStaffId: null,
    postedByStaffId: null,
    rejectedByStaffId: null,
    cancelledByStaffId: null,
    reversedByStaffId: null,
    reason: 'Counted damaged packaging discrepancy',
    status: 'SUBMITTED',
    lineCount: 1,
    totalAbsoluteStockQuantity: Types.Decimal128.fromString('2'),
    lines: [
      {
        _id: objectId(),
        lineNumber: 1,
        itemId,
        batchId: null,
        stockUnitId,
        bucket: 'AVAILABLE',
        direction: 'DECREASE',
        quantity: Types.Decimal128.fromString('2'),
        onHandDelta: Types.Decimal128.fromString('-2'),
        availableDelta: Types.Decimal128.fromString('-2'),
        reservedDelta: Types.Decimal128.fromString('0'),
        quarantinedDelta: Types.Decimal128.fromString('0'),
        damagedDelta: Types.Decimal128.fromString('0'),
        expiredDelta: Types.Decimal128.fromString('0'),
        unitCost: null,
        currency: null,
        reasonCode: 'COUNT_VARIANCE',
        notes: null,
      },
    ],
    submittedAt: now,
    approvedAt: null,
    postedAt: null,
    rejectedAt: null,
    cancelledAt: null,
    reversedAt: null,
    decisionReason: 'Submitted for independent review',
    reversalReason: null,
    sourceType: 'MANUAL',
    sourceId: null,
    stockPostingTransactionId: null,
    reversalTransactionId: null,
    attachmentIds: [],
  };
}

describe('inventory Batch 5 controls and monitoring', () => {
  it('registers migration 027 and all control schemas', () => {
    expect(
      migrations.some(
        (migration) =>
          migration.id === '027-inventory-controls-monitoring',
      ),
    ).toBe(true);

    for (const collectionName of [
      'stockAdjustments',
      'physicalStockCounts',
      'physicalStockCountItems',
      'productRecalls',
      'productRecallItems',
      'reorderRules',
    ] as const) {
      expect(schemaForCollection(collectionName)).toBeDefined();
      expect(
        collectionSpecs.find(
          (spec) => spec.name === collectionName,
        ),
      ).toMatchObject({
        domain: 'inventory',
        facilityScoped: true,
        retention: 'standard',
      });
    }
  });

  it('rejects duplicate adjustment targets and client-supplied approval fields', () => {
    const itemId = objectId().toHexString();

    expect(
      createStockAdjustmentBodySchema.safeParse({
        locationId: objectId().toHexString(),
        adjustmentType: 'MANUAL_CORRECTION',
        reason: 'Correct an independently verified stock variance',
        approvedByStaffId: objectId().toHexString(),
        lines: [
          {
            itemId,
            bucket: 'AVAILABLE',
            direction: 'DECREASE',
            quantity: '1',
            reasonCode: 'COUNT_VARIANCE',
          },
          {
            itemId,
            bucket: 'AVAILABLE',
            direction: 'INCREASE',
            quantity: '1',
            reasonCode: 'COUNT_VARIANCE',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate physical-count and recall targets', () => {
    const itemId = objectId().toHexString();
    const batchId = objectId().toHexString();

    expect(
      createPhysicalStockCountBodySchema.safeParse({
        locationId: objectId().toHexString(),
        scope: 'SELECTED_ITEMS',
        reason: 'Monthly controlled physical stock count',
        targets: [
          {
            itemId,
            batchId,
            bucket: 'AVAILABLE',
          },
          {
            itemId,
            batchId,
            bucket: 'AVAILABLE',
          },
        ],
      }).success,
    ).toBe(false);

    expect(
      createProductRecallBodySchema.safeParse({
        externalReference: 'MFG-RECALL-2026-001',
        title: 'Manufacturer recall',
        reason: 'Manufacturer instructed immediate batch withdrawal',
        action: 'QUARANTINE',
        batches: [
          {
            itemId,
            batchId,
          },
          {
            itemId,
            batchId,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('keeps recall activation maker-checker fields server controlled', () => {
    expect(
      activateProductRecallBodySchema.safeParse({
        expectedVersion: 0,
        reason: 'Independent pharmacist confirmed the recall notice',
        decision: 'APPROVE',
        actorApprovalLimit: '999999999',
      }).success,
    ).toBe(false);
  });

  it('enforces critical, safety, minimum, reorder, and maximum ordering', () => {
    expect(
      upsertReorderRuleBodySchema.safeParse({
        locationId: objectId().toHexString(),
        itemId: objectId().toHexString(),
        criticalStockLevel: '20',
        safetyStockLevel: '10',
        minimumStockLevel: '5',
        reorderLevel: '4',
        maximumStockLevel: '3',
      }).success,
    ).toBe(false);
  });

  it('rejects adjustment documents whose bucket deltas do not reconcile', () => {
    const actor = objectId();
    const document = new StockAdjustmentModel({
      facilityId: objectId(),
      transactionId: 'tx-invalid-adjustment',
      correlationId: 'corr-invalid-adjustment',
      schemaVersion: 1,
      version: 0,
      createdBy: actor,
      updatedBy: actor,
      adjustmentNumber: 'FAC-ADJ-2026-00000002',
      locationId: objectId(),
      adjustmentType: 'MANUAL_CORRECTION',
      requestedByStaffId: objectId(),
      reason: 'Deliberately inconsistent adjustment for validation test',
      status: 'DRAFT',
      lineCount: 1,
      totalAbsoluteStockQuantity: Types.Decimal128.fromString('2'),
      lines: [
        {
          lineNumber: 1,
          itemId: objectId(),
          batchId: null,
          stockUnitId: objectId(),
          bucket: 'AVAILABLE',
          direction: 'DECREASE',
          quantity: Types.Decimal128.fromString('2'),
          onHandDelta: Types.Decimal128.fromString('-2'),
          availableDelta: Types.Decimal128.fromString('-1'),
          reservedDelta: Types.Decimal128.fromString('0'),
          quarantinedDelta: Types.Decimal128.fromString('0'),
          damagedDelta: Types.Decimal128.fromString('0'),
          expiredDelta: Types.Decimal128.fromString('0'),
          reasonCode: 'TEST',
        },
      ],
      sourceType: 'MANUAL',
      sourceId: null,
      attachmentIds: [],
    });

    expect(document.validateSync()).toBeDefined();
  });

  it('rolls back adjustment approval publication when ledger posting fails', async () => {
    const current = adjustmentRecord();
    const approved: StockAdjustmentRecord = {
      ...current,
      version: 2,
      status: 'APPROVED',
      approvedAt: new Date('2026-07-20T10:05:00.000Z'),
      approvedByStaffId: objectId(),
      decisionReason: 'Independent approval completed',
    };

    const auditAppend = vi.fn();
    const outboxEnqueue = vi.fn();
    const realtimePublish = vi.fn();

    const dependencies = {
      clock: {
        now: () => new Date('2026-07-20T10:05:00.000Z'),
      },
      transactionManager: {
        execute: async (request: {
          execute: (context: {
            transactionId: string;
            idempotencyKey: string;
            checkpoint: () => Promise<void>;
            registerCompensation: () => Promise<void>;
          }) => Promise<unknown>;
        }) =>
          request.execute({
            transactionId: 'tx-ledger-failure',
            idempotencyKey: 'idem-ledger-failure',
            checkpoint: async () => undefined,
            registerCompensation: async () => undefined,
          }),
      },
      repository: {
        findAdjustment: async () => current,
        withTransaction: async (work: (session: unknown) => Promise<unknown>) =>
          work({}),
        decideAdjustment: async () => approved,
        markAdjustmentPosted: vi.fn(),
      },
      stockPosting: {
        post: async () => {
          throw new Error('simulated ledger failure');
        },
      },
      context: {
        resolveOperationalLocation: async () => ({
          actor: {
            userId: current.createdBy.toHexString(),
            staffId: approved.approvedByStaffId!.toHexString(),
            facilityId: current.facilityId.toHexString(),
            departmentId: null,
            displayName: 'Independent Approver',
            professionalType: 'PHARMACIST',
          },
          location: {
            locationId: current.locationId.toHexString(),
          },
        }),
      },
      accessPolicy: {
        authorize: async () => ({
          allowed: true,
          accessMode: 'FACILITY_INVENTORY',
          includeCost: false,
          minimumNecessaryFields: [],
          auditSensitiveRead: false,
        }),
      },
      catalog: {
        findLocationById: async () => ({
          _id: current.locationId,
          facilityId: current.facilityId,
        }),
      },
      audit: {
        append: auditAppend,
      },
      outbox: {
        enqueue: outboxEnqueue,
      },
      realtime: {
        publish: realtimePublish,
      },
    } as unknown as InventoryControlDependencies;

    const service = new InventoryControlService(dependencies);

    await expect(
      service.decideStockAdjustment(
        {
          actor: {
            userId: current.createdBy.toHexString(),
            facilityId: current.facilityId.toHexString(),
            correlationId: 'corr-ledger-failure',
            roleKeys: ['STORE_MANAGER'],
            permissionKeys: ['inventory.adjust'],
          },
          idempotencyKey: 'idem-ledger-failure',
        },
        current._id.toHexString(),
        {
          expectedVersion: current.version,
          decision: 'APPROVE',
          reason: 'Independent approval completed',
        },
      ),
    ).rejects.toThrow('simulated ledger failure');

    expect(auditAppend).not.toHaveBeenCalled();
    expect(outboxEnqueue).not.toHaveBeenCalled();
    expect(realtimePublish).not.toHaveBeenCalled();
  });
});