import Decimal from 'decimal.js';

import type {
  Db,
} from '@hospital-mis/database';

import {
  createObjectId,
  toObjectId,
} from '@hospital-mis/database';

import type {
  PermissionKey,
} from '@hospital-mis/permissions';

import {
  ConflictError,
} from '@hospital-mis/shared';

import type {
  InventoryApplication,
} from '../modules/inventory/inventory.application.js';

import type {
  PharmacyDispensingActorContext,
  PharmacyPricingRequest,
  PharmacyPricingResult,
  PharmacyRealtimeMessage,
  PharmacySafetyEvaluationRequest,
  PharmacySafetyFinding,
} from '../modules/pharmacy-dispensing/pharmacy-dispensing.contracts.js';

import type {
  PharmacyActorResolverInput,
  PharmacyActorResolverPort,
  PharmacyAuditEntry,
  PharmacyAuditPort,
  PharmacyBillingChargeInput,
  PharmacyBillingPort,
  PharmacyClockPort,
  PharmacyInventoryIntegrationPort,
  PharmacyInventoryQueryPort,
  PharmacyOutboxMessage,
  PharmacyOutboxPort,
  PharmacyPricingPort,
  PharmacyRealtimePort,
  PharmacySafetyPort,
  PharmacySequenceAllocation,
  PharmacySequencePort,
} from '../modules/pharmacy-dispensing/pharmacy-dispensing.ports.js';

import type {
  PharmacyMongoSession,
} from '../modules/pharmacy-dispensing/pharmacy-dispensing.persistence.types.js';

import {
  sanitizeAuditSnapshot,
} from '../modules/audit/audit.sanitizer.js';

import type {
  BackgroundJobService,
} from './background-job.service.js';

import type {
  SequenceService,
} from './sequence.service.js';

function isDuplicateKeyError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 11000
  );
}

interface UserRoleRecord {
  roleId: ReturnType<typeof toObjectId>;
  facilityId?: ReturnType<typeof toObjectId> | null;
  isActive: boolean;
  expiresAt?: Date | null;
}

interface RoleRecord {
  _id: ReturnType<typeof toObjectId>;
  code?: string;
  key?: string;
  roleCode?: string;
  name?: string;
  scope: 'GLOBAL' | 'FACILITY';
  facilityId?: ReturnType<typeof toObjectId> | null;
  isActive: boolean;
}

export class MongoPharmacyActorResolver
implements PharmacyActorResolverPort {
  public constructor(private readonly database: Db) {}

  public async resolve(
    input: PharmacyActorResolverInput,
  ): Promise<PharmacyDispensingActorContext> {
    const now = new Date();
    const facilityId = toObjectId(input.facilityId, 'facilityId');
    const assignments = await this.database
      .collection<UserRoleRecord>('userRoles')
      .find({
        userId: toObjectId(input.userId, 'userId'),
        isActive: true,
        $and: [
          { $or: [{ facilityId: null }, { facilityId }] },
          { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
        ],
      })
      .toArray();
    const roleIds = assignments.map((assignment) => assignment.roleId);
    const roles = roleIds.length === 0
      ? []
      : await this.database
          .collection<RoleRecord>('roles')
          .find({
            _id: { $in: roleIds },
            isActive: true,
            $or: [
              { scope: 'GLOBAL', facilityId: null },
              { scope: 'FACILITY', facilityId },
            ],
          })
          .toArray();
    const roleKeys = [
      ...new Set(
        roles
          .map((role) => role.code ?? role.key ?? role.roleCode ?? role.name ?? '')
          .filter(Boolean)
          .map((value) =>
            value
              .normalize('NFKC')
              .trim()
              .toUpperCase()
              .replaceAll(/[^A-Z0-9]+/gu, '_'),
          ),
      ),
    ];

    return {
      userId: input.userId,
      facilityId: input.facilityId,
      correlationId: input.correlationId,
      roleKeys,
      permissionKeys: [...input.permissions],
      ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
      ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
      ...(input.breakGlassReason === undefined
        ? {}
        : { breakGlassReason: input.breakGlassReason }),
    };
  }
}

export class MongoPharmacyAuditAdapter
implements PharmacyAuditPort {
  public constructor(private readonly database: Db) {}

  public async append(
    entry: PharmacyAuditEntry,
    session?: PharmacyMongoSession,
  ): Promise<void> {
    try {
      await this.database.collection('auditLogs').insertOne(
        {
          _id: createObjectId(),
          facilityId: toObjectId(entry.facilityId, 'facilityId'),
          eventId: entry.deduplicationKey,
          actorId: toObjectId(entry.actorUserId, 'actorUserId'),
          actorRoleIds: [],
          actorRoleCodes: [],
          action: entry.action,
          module: 'PHARMACY_DISPENSING',
          entityType: entry.entityType,
          entityId: entry.entityId,
          ...(entry.reason === undefined ? {} : { reason: entry.reason }),
          ...(entry.before === undefined
            ? {}
            : { beforeSnapshot: sanitizeAuditSnapshot(entry.before) }),
          ...(entry.after === undefined
            ? {}
            : { afterSnapshot: sanitizeAuditSnapshot(entry.after) }),
          metadata: sanitizeAuditSnapshot({
            actorStaffId: entry.actorStaffId,
            deduplicationKey: entry.deduplicationKey,
            ...(entry.metadata ?? {}),
          }),
          outcome: 'SUCCESS',
          sensitivity: 'HIGHLY_SENSITIVE',
          correlationId: entry.correlationId,
          transactionId: entry.transactionId,
          requestSource: 'API',
          ...(entry.ipAddress === undefined ? {} : { ipAddress: entry.ipAddress }),
          ...(entry.userAgent === undefined ? {} : { userAgent: entry.userAgent }),
          occurredAt: entry.occurredAt,
          schemaVersion: 1,
          version: 0,
          createdAt: entry.occurredAt,
          updatedAt: entry.occurredAt,
        },
        session === undefined ? undefined : { session: session as never },
      );
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  }
}

export class MongoPharmacyOutboxAdapter
implements PharmacyOutboxPort {
  public constructor(private readonly database: Db) {}

  public async enqueue(
    message: PharmacyOutboxMessage,
    session?: PharmacyMongoSession,
  ): Promise<void> {
    try {
      await this.database.collection('outboxEvents').insertOne(
        {
          _id: createObjectId(),
          facilityId: toObjectId(message.facilityId, 'facilityId'),
          eventId: message.deduplicationKey,
          transactionId: message.transactionId,
          eventType: message.eventType,
          aggregateType: message.aggregateType,
          aggregateId: message.aggregateId,
          payload: {
            ...message.payload,
            actorUserId: message.actorUserId,
            correlationId: message.correlationId,
            occurredAt: message.occurredAt.toISOString(),
          },
          status: 'BLOCKED',
          availableAt: message.occurredAt,
          attemptCount: 0,
          schemaVersion: 1,
          version: 0,
          createdAt: message.occurredAt,
          updatedAt: message.occurredAt,
        },
        session === undefined ? undefined : { session: session as never },
      );
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  }
}

const prohibitedRealtimeKeys = new Set([
  'patientname',
  'patientdisplayname',
  'mrn',
  'instructions',
  'allergy',
  'reason',
  'notes',
  'grossamount',
  'netamount',
  'taxamount',
  'discountamount',
]);

function assertSafeRealtimePayload(value: unknown, path = 'payload'): void {
  if (value == null || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertSafeRealtimePayload(item, `${path}[${index}]`),
    );
    return;
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.replaceAll(/[^A-Za-z0-9]/gu, '').toLowerCase();

    if (prohibitedRealtimeKeys.has(normalized)) {
      throw new TypeError(
        `Pharmacy realtime payload exposes prohibited field ${path}.${key}`,
      );
    }

    assertSafeRealtimePayload(nested, `${path}.${key}`);
  }
}

export class PharmacyRealtimeAdapter
implements PharmacyRealtimePort {
  public constructor(
    private readonly publishMessage: (message: PharmacyRealtimeMessage) => Promise<void>,
    private readonly jobs?: BackgroundJobService,
  ) {}

  public async publish(message: PharmacyRealtimeMessage): Promise<void> {
    assertSafeRealtimePayload(message.payload);

    try {
      await this.publishMessage(message);
    } catch {
      if (this.jobs !== undefined) {
        await this.jobs.enqueue({
          facilityId: message.facilityId,
          jobType: 'pharmacy.realtime.retry',
          payload: message,
          priority: 20,
          maxAttempts: 10,
        });
      }
    }
  }
}

export class PharmacySystemClock
implements PharmacyClockPort {
  public now(): Date {
    return new Date();
  }
}

export class PharmacySequenceAdapter
implements PharmacySequencePort {
  public constructor(private readonly sequences: SequenceService) {}

  public next(
    facilityId: string,
    key: string,
  ): Promise<PharmacySequenceAllocation> {
    return this.sequences.next(facilityId, key);
  }
}

export class PharmacyInventoryAdapter
implements PharmacyInventoryQueryPort, PharmacyInventoryIntegrationPort {
  public readonly unitConversion;

  public constructor(private readonly inventory: InventoryApplication) {
    this.unitConversion = inventory.services.unitConversion;
  }

  public findInventoryItem(facilityId: string, itemId: string) {
    return this.inventory.repositories.catalog.findItemById(
      facilityId,
      itemId,
      false,
    );
  }

  public listEligibleFefoBatches(
    facilityId: string,
    locationId: string,
    itemId: string,
    at: Date,
    limit?: number,
  ) {
    return this.inventory.repositories.stockQueries.listEligibleFefoBatches(
      facilityId,
      locationId,
      itemId,
      at,
      limit,
    );
  }

  public reserveForDispensing(
    context: Parameters<PharmacyInventoryIntegrationPort['reserveForDispensing']>[0],
    input: Parameters<PharmacyInventoryIntegrationPort['reserveForDispensing']>[1],
  ) {
    return this.inventory.integrations.dispensing.reserveForDispensing(
      context,
      input,
    );
  }

  public async consumeDispensingReservation(
    context: Parameters<PharmacyInventoryIntegrationPort['consumeDispensingReservation']>[0],
    reservationId: string,
    input: Parameters<PharmacyInventoryIntegrationPort['consumeDispensingReservation']>[2],
  ) {
    const reservation = await this.inventory.repositories.stockOperations.findReservation(
      context.actor.facilityId,
      reservationId,
    );

    if (reservation === null) {
      throw new ConflictError('The pharmacy inventory reservation was not found');
    }

    return this.inventory.integrations.dispensing.consumeDispensingReservation(
      context,
      reservationId,
      {
        ...input,
        expectedVersion: reservation.version,
      },
    );
  }

  public async releaseDispensingReservation(
    context: Parameters<PharmacyInventoryIntegrationPort['releaseDispensingReservation']>[0],
    reservationId: string,
    input: Parameters<PharmacyInventoryIntegrationPort['releaseDispensingReservation']>[2],
  ) {
    const reservation = await this.inventory.repositories.stockOperations.findReservation(
      context.actor.facilityId,
      reservationId,
    );

    if (reservation === null) {
      throw new ConflictError('The pharmacy inventory reservation was not found');
    }

    return this.inventory.services.stock.releaseStockReservation(
      context,
      reservationId,
      {
        ...input,
        expectedVersion: reservation.version,
      },
    );
  }

  public reverseDispensing(
    context: Parameters<PharmacyInventoryIntegrationPort['reverseDispensing']>[0],
    input: Parameters<PharmacyInventoryIntegrationPort['reverseDispensing']>[1],
  ) {
    return this.inventory.integrations.dispensing.reverseDispensing(
      context,
      input,
    );
  }
}

interface InventoryBatchPriceRecord {
  _id: ReturnType<typeof toObjectId>;
  facilityId: ReturnType<typeof toObjectId>;
  itemId: ReturnType<typeof toObjectId>;
  sellingPrice: { toString(): string };
  currency: string;
  status: string;
  expiryDate?: Date | null;
}

export class MongoPharmacyPricingAdapter
implements PharmacyPricingPort {
  public constructor(private readonly database: Db) {}

  public async resolve(
    request: PharmacyPricingRequest,
  ): Promise<PharmacyPricingResult> {
    if (request.inventoryBatchId === null) {
      throw new ConflictError(
        'Batch-attributed pharmacy pricing is required for dispensing',
      );
    }

    const batch = await this.database
      .collection<InventoryBatchPriceRecord>('inventoryBatches')
      .findOne({
        _id: toObjectId(request.inventoryBatchId, 'inventoryBatchId'),
        facilityId: toObjectId(request.facilityId, 'facilityId'),
        itemId: toObjectId(request.inventoryItemId, 'inventoryItemId'),
        status: 'ACTIVE',
      });

    if (
      batch === null ||
      (batch.expiryDate != null && batch.expiryDate.getTime() <= request.occurredAt.getTime())
    ) {
      throw new ConflictError(
        'The authoritative inventory batch price is unavailable or expired',
      );
    }

    const unitPrice = new Decimal(batch.sellingPrice.toString());
    const quantity = new Decimal(request.stockQuantity);

    if (!unitPrice.isFinite() || unitPrice.isNegative()) {
      throw new ConflictError('The inventory batch selling price is invalid');
    }

    const gross = quantity.times(unitPrice);

    return {
      unitSellingPrice: unitPrice.toFixed(),
      grossAmount: gross.toFixed(),
      discountAmount: '0',
      taxAmount: '0',
      netAmount: gross.toFixed(),
      currency: batch.currency,
      pricingSource: 'INVENTORY_BATCH_SELLING_PRICE',
      authoritativeRecordId: batch._id.toHexString(),
      priceOverrideRequired: false,
    };
  }
}

export class PharmacySafetyAdapter
implements PharmacySafetyPort {
  public async evaluate(
    _request: PharmacySafetyEvaluationRequest,
  ): Promise<readonly PharmacySafetyFinding[]> {
    return [];
  }
}

interface BillingIntegrationRequestRecord {
  requestId: string;
  operationKey: string;
  requestType: 'CREATE_PHARMACY_CHARGES' | 'REVERSE_PHARMACY_CHARGES';
  status: 'PENDING';
}

export class MongoPharmacyBillingAdapter
implements PharmacyBillingPort {
  public constructor(private readonly database: Db) {}

  public async createDispensingCharges(
    operationKey: string,
    charges: readonly PharmacyBillingChargeInput[],
    session: PharmacyMongoSession,
  ): Promise<Readonly<{ billingRecordId: string }>> {
    if (charges.length === 0) {
      throw new ConflictError('Pharmacy billing requires at least one charge line');
    }

    const existing = await this.database
      .collection<BillingIntegrationRequestRecord>('billingIntegrationRequests')
      .findOne({ operationKey }, { session: session as never });

    if (existing !== null) {
      return { billingRecordId: existing.requestId };
    }

    const requestId = createObjectId().toHexString();
    const occurredAt = new Date();

    await this.database.collection('billingIntegrationRequests').insertOne(
      {
        _id: toObjectId(requestId, 'billingRecordId'),
        facilityId: toObjectId(charges[0]!.facilityId, 'facilityId'),
        requestId,
        operationKey,
        requestType: 'CREATE_PHARMACY_CHARGES',
        sourceModule: 'PHARMACY_DISPENSING',
        sourceType: 'DISPENSATION',
        sourceId: charges[0]!.dispensationId,
        patientId: toObjectId(charges[0]!.patientId, 'patientId'),
        encounterId:
          charges[0]!.encounterId === null
            ? null
            : toObjectId(charges[0]!.encounterId, 'encounterId'),
        admissionId:
          charges[0]!.admissionId === null
            ? null
            : toObjectId(charges[0]!.admissionId, 'admissionId'),
        charges: charges.map((charge) => ({ ...charge })),
        status: 'PENDING',
        attemptCount: 0,
        schemaVersion: 1,
        version: 0,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      },
      { session: session as never },
    );

    return { billingRecordId: requestId };
  }

  public async reverseDispensingCharges(
    operationKey: string,
    dispensationId: string,
    reason: string,
    session: PharmacyMongoSession,
  ): Promise<Readonly<{ billingRecordId: string }>> {
    const existing = await this.database
      .collection<BillingIntegrationRequestRecord>('billingIntegrationRequests')
      .findOne({ operationKey }, { session: session as never });

    if (existing !== null) {
      return { billingRecordId: existing.requestId };
    }

    const source = await this.database.collection('dispensations').findOne(
      { _id: toObjectId(dispensationId, 'dispensationId') },
      { session: session as never },
    );

    if (source === null) {
      throw new ConflictError('The source dispensation for billing reversal was not found');
    }

    const requestId = createObjectId().toHexString();
    const occurredAt = new Date();

    await this.database.collection('billingIntegrationRequests').insertOne(
      {
        _id: toObjectId(requestId, 'billingRecordId'),
        facilityId: source['facilityId'],
        requestId,
        operationKey,
        requestType: 'REVERSE_PHARMACY_CHARGES',
        sourceModule: 'PHARMACY_DISPENSING',
        sourceType: 'DISPENSATION',
        sourceId: dispensationId,
        reason,
        status: 'PENDING',
        attemptCount: 0,
        schemaVersion: 1,
        version: 0,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      },
      { session: session as never },
    );

    return { billingRecordId: requestId };
  }
}

export function createPharmacyRuntimeAdapters(input: Readonly<{
  database: Db;
  inventory: InventoryApplication;
  sequences: SequenceService;
  jobs?: BackgroundJobService;
  publishRealtime(message: PharmacyRealtimeMessage): Promise<void>;
}>) {
  const inventory = new PharmacyInventoryAdapter(input.inventory);

  return {
    actorResolver: new MongoPharmacyActorResolver(input.database),
    audit: new MongoPharmacyAuditAdapter(input.database),
    outbox: new MongoPharmacyOutboxAdapter(input.database),
    realtime: new PharmacyRealtimeAdapter(input.publishRealtime, input.jobs),
    clock: new PharmacySystemClock(),
    sequence: new PharmacySequenceAdapter(input.sequences),
    inventory,
    inventoryQueries: inventory,
    pricing: new MongoPharmacyPricingAdapter(input.database),
    safety: new PharmacySafetyAdapter(),
    billing: new MongoPharmacyBillingAdapter(input.database),
  };
}

export function pharmacyPermissions(values: readonly string[]): ReadonlySet<PermissionKey> {
  return new Set(values as PermissionKey[]);
}