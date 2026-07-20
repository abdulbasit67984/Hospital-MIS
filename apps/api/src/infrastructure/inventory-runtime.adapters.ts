import Decimal from 'decimal.js';

import type {
  Db,
} from '@hospital-mis/database';

import {
  createObjectId,
  toObjectId,
} from '@hospital-mis/database';

import {
  ConflictError,
  ForbiddenError,
} from '@hospital-mis/shared';

import type {
  PermissionKey,
} from '@hospital-mis/permissions';

import type {
  AuditRepository,
} from '../modules/audit/audit.repository.js';

import {
  sanitizeAuditSnapshot,
} from '../modules/audit/audit.sanitizer.js';

import type {
  InventoryActorContext,
} from '../modules/inventory/inventory.contracts.js';

import type {
  InventoryClockPort,
} from '../modules/inventory/inventory.ports.js';

import type {
  InventoryProcurementApprovalLimitPort,
  InventoryProcurementAttachmentPort,
  InventoryProcurementAuditEntry,
  InventoryProcurementAuditPort,
  InventoryProcurementOutboxMessage,
  InventoryProcurementOutboxPort,
  InventoryProcurementRealtimeMessage,
  InventoryProcurementRealtimePort,
  InventoryProcurementSequenceAllocation,
  InventoryProcurementSequencePort,
} from '../modules/inventory/inventory-procurement.ports.js';

import type {
  BackgroundJobService,
} from './background-job.service.js';

import type {
  SequenceService,
} from './sequence.service.js';

function isDuplicateKeyError(
  error: unknown,
): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 11000
  );
}

const prohibitedRealtimeKeys = new Set([
  'patientname',
  'patientdisplayname',
  'mrn',
  'cnic',
  'bform',
  'phone',
  'address',
  'email',
  'registrationnumber',
  'taxregistrationnumber',
  'salestaxregistrationnumber',
  'drugsalelicensenumber',
  'suppliercontacts',
  'contacts',
  'notes',
  'reason',
  'unitcost',
  'costprice',
  'lastquotedunitcost',
  'netamount',
  'subtotal',
  'taxamount',
  'discountamount',
]);

function assertSafeRealtimePayload(
  value: unknown,
  path = 'payload',
): void {
  if (value == null) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertSafeRealtimePayload(entry, `${path}[${index}]`),
    );
    return;
  }

  if (typeof value !== 'object') {
    return;
  }

  for (const [key, nested] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const normalizedKey = key
      .replaceAll(/[^A-Za-z0-9]/gu, '')
      .toLowerCase();

    if (prohibitedRealtimeKeys.has(normalizedKey)) {
      throw new TypeError(
        `Inventory realtime payload exposes prohibited field ${path}.${key}`,
      );
    }

    assertSafeRealtimePayload(nested, `${path}.${key}`);
  }
}

export interface InventoryActorResolverInput {
  userId: string;
  facilityId: string;
  correlationId: string;
  permissions: ReadonlySet<PermissionKey>;
  ipAddress?: string;
  userAgent?: string;
  breakGlassReason?: string;
}

export interface InventoryActorResolverPort {
  resolve(
    input: InventoryActorResolverInput,
  ): Promise<InventoryActorContext>;
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

export class MongoInventoryActorResolver
implements InventoryActorResolverPort {
  public constructor(
    private readonly database: Db,
  ) {}

  public async resolve(
    input: InventoryActorResolverInput,
  ): Promise<InventoryActorContext> {
    const now = new Date();
    const facilityId = toObjectId(
      input.facilityId,
      'facilityId',
    );
    const userId = toObjectId(
      input.userId,
      'userId',
    );

    const assignments = await this.database
      .collection<UserRoleRecord>('userRoles')
      .find({
        userId,
        isActive: true,
        $and: [
          {
            $or: [
              { facilityId: null },
              { facilityId },
            ],
          },
          {
            $or: [
              { expiresAt: null },
              {
                expiresAt: {
                  $gt: now,
                },
              },
            ],
          },
        ],
      })
      .toArray();

    const roleIds = assignments.map(
      (assignment) => assignment.roleId,
    );

    const roles =
      roleIds.length === 0
        ? []
        : await this.database
            .collection<RoleRecord>('roles')
            .find({
              _id: {
                $in: roleIds,
              },
              isActive: true,
              $or: [
                {
                  scope: 'GLOBAL',
                  facilityId: null,
                },
                {
                  scope: 'FACILITY',
                  facilityId,
                },
              ],
            })
            .toArray();

    const roleKeys = [
      ...new Set(
        roles
          .map(
            (role) =>
              role.code ??
              role.key ??
              role.roleCode ??
              role.name ??
              '',
          )
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
      permissionKeys: [
        ...input.permissions,
      ],
      ...(input.ipAddress === undefined
        ? {}
        : {
            ipAddress: input.ipAddress,
          }),
      ...(input.userAgent === undefined
        ? {}
        : {
            userAgent: input.userAgent,
          }),
      ...(input.breakGlassReason === undefined
        ? {}
        : {
            breakGlassReason: input.breakGlassReason,
          }),
    };
  }
}

export class MongoInventoryAuditAdapter
implements InventoryProcurementAuditPort {
  public constructor(
    private readonly audit: AuditRepository,
  ) {}

  public async append(
    entry: InventoryProcurementAuditEntry,
  ): Promise<void> {
    try {
      await this.audit.insertAuditEvent({
        eventId: entry.deduplicationKey,
        actorId: entry.actorUserId,
        action: entry.action,
        module: 'INVENTORY',
        entityType: entry.entityType,
        entityId: entry.entityId,
        facilityId: entry.facilityId,
        correlationId: entry.correlationId,
        transactionId: entry.transactionId,
        requestSource: 'API',
        outcome: 'SUCCESS',
        sensitivity: 'SENSITIVE',
        ...(entry.reason === undefined
          ? {}
          : {
              reason: entry.reason,
            }),
        ...(entry.before === undefined
          ? {}
          : {
              beforeSnapshot: sanitizeAuditSnapshot(
                entry.before,
              ),
            }),
        ...(entry.after === undefined
          ? {}
          : {
              afterSnapshot: sanitizeAuditSnapshot(
                entry.after,
              ),
            }),
        metadata: sanitizeAuditSnapshot({
          actorStaffId: entry.actorStaffId,
          deduplicationKey: entry.deduplicationKey,
          ...(entry.metadata ?? {}),
        }),
        ...(entry.ipAddress === undefined
          ? {}
          : {
              ipAddress: entry.ipAddress,
            }),
        ...(entry.userAgent === undefined
          ? {}
          : {
              userAgent: entry.userAgent,
            }),
        occurredAt: entry.occurredAt,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  }
}

interface InventoryOutboxRecord {
  eventId: string;
  transactionId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
}

export class MongoInventoryOutboxAdapter
implements InventoryProcurementOutboxPort {
  public constructor(
    private readonly database: Db,
  ) {}

  public async enqueue(
    message: InventoryProcurementOutboxMessage,
  ): Promise<void> {
    const collection = this.database.collection<InventoryOutboxRecord>(
      'outboxEvents',
    );

    try {
      await collection.insertOne({
        _id: createObjectId(),
        facilityId: toObjectId(
          message.facilityId,
          'facilityId',
        ),
        eventId: message.deduplicationKey,
        transactionId: message.transactionId,
        eventType: message.eventType,
        aggregateType: message.aggregateType,
        aggregateId: message.aggregateId,
        payload: {
          ...message.payload,
          actorUserId: message.actorUserId,
          actorStaffId: message.actorStaffId,
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
      } as never);
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      const existing = await collection.findOne({
        eventId: message.deduplicationKey,
      });

      if (
        existing === null ||
        existing.transactionId !== message.transactionId ||
        existing.eventType !== message.eventType ||
        existing.aggregateType !== message.aggregateType ||
        existing.aggregateId !== message.aggregateId
      ) {
        throw new ConflictError(
          'The inventory outbox deduplication key is already used by another event',
        );
      }
    }
  }
}

export class InventoryRealtimeAdapter
implements InventoryProcurementRealtimePort {
  public constructor(
    private readonly publishMessage: (
      message: InventoryProcurementRealtimeMessage,
    ) => Promise<void>,
    private readonly jobs?: BackgroundJobService,
  ) {}

  public async publish(
    message: InventoryProcurementRealtimeMessage,
  ): Promise<void> {
    assertSafeRealtimePayload(message.payload);

    try {
      await this.publishMessage(message);
    } catch {
      if (this.jobs !== undefined) {
        await this.jobs.enqueue({
          facilityId: message.facilityId,
          jobType: 'inventory.realtime.retry',
          payload: message,
          priority: 20,
          maxAttempts: 10,
        });
      }
    }
  }
}

export class InventorySystemClock
implements InventoryClockPort {
  public now(): Date {
    return new Date();
  }
}

interface FacilityCodeRecord {
  code: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export class InventorySequenceAdapter
implements InventoryProcurementSequencePort {
  public constructor(
    private readonly database: Db,
    private readonly sequences: SequenceService,
  ) {}

  public async next(
    facilityId: string,
    key: string,
  ): Promise<InventoryProcurementSequenceAllocation> {
    const [facility, allocation] = await Promise.all([
      this.database
        .collection<FacilityCodeRecord>('facilities')
        .findOne(
          {
            _id: toObjectId(facilityId, 'facilityId'),
            status: 'ACTIVE',
          },
          {
            projection: {
              code: 1,
              status: 1,
            },
          },
        ),
      this.sequences.next(facilityId, key),
    ]);

    if (facility === null) {
      throw new ConflictError(
        'Inventory number allocation requires an active facility',
      );
    }

    return {
      ...allocation,
      facilityCode: facility.code,
    };
  }
}

interface ApprovalLimitSettingRecord {
  value?: unknown;
  isActive: boolean;
}

interface ApprovalLimitConfiguration {
  defaultLimit?: string | null;
  roleLimits?: Record<string, string>;
  currency?: string;
}

export class MongoInventoryApprovalLimitAdapter
implements InventoryProcurementApprovalLimitPort {
  public constructor(
    private readonly database: Db,
  ) {}

  public async resolveLimit(
    input: Parameters<
      InventoryProcurementApprovalLimitPort['resolveLimit']
    >[0],
  ): Promise<string | null> {
    const setting = await this.database
      .collection<ApprovalLimitSettingRecord>('systemSettings')
      .findOne({
        key: 'inventory.procurement.approval_limits',
        scope: 'FACILITY',
        facilityId: toObjectId(
          input.facilityId,
          'facilityId',
        ),
        isActive: true,
        isSensitive: false,
      });

    if (setting?.value == null) {
      return null;
    }

    if (
      typeof setting.value !== 'object' ||
      Array.isArray(setting.value)
    ) {
      throw new ConflictError(
        'Inventory procurement approval-limit setting is invalid',
      );
    }

    const configuration =
      setting.value as ApprovalLimitConfiguration;

    if (
      configuration.currency !== undefined &&
      configuration.currency.toUpperCase() !==
        input.currency.toUpperCase()
    ) {
      throw new ConflictError(
        'Inventory procurement approval limits are configured for another currency',
      );
    }

    const roleLimits = configuration.roleLimits ?? {};
    let highest: string | null = configuration.defaultLimit ?? null;

    if (highest !== null) {
      const defaultLimit = new Decimal(highest);

      if (!defaultLimit.isFinite() || defaultLimit.isNegative()) {
        throw new Error('Configured inventory approval limits must be finite and non-negative');
      }
    }

    for (const roleKey of input.roleKeys) {
      const candidate = roleLimits[roleKey];

      if (candidate === undefined) {
        continue;
      }

      const candidateLimit = new Decimal(candidate);

      if (!candidateLimit.isFinite() || candidateLimit.isNegative()) {
        throw new Error('Configured inventory approval limits must be finite and non-negative');
      }

      if (
        highest === null ||
        candidateLimit.gt(new Decimal(highest))
      ) {
        highest = candidateLimit.toFixed();
      }
    }

    return highest;
  }
}

interface AttachmentRecord {
  _id: unknown;
  facilityId: unknown;
  status?: string;
  deletedAt?: Date | null;
  malwareScanStatus?: string;
}

export class MongoInventoryAttachmentAdapter
implements InventoryProcurementAttachmentPort {
  public constructor(
    private readonly database: Db,
  ) {}

  public async assertAvailable(
    facilityId: string,
    attachmentIds: readonly string[],
  ): Promise<void> {
    if (attachmentIds.length === 0) {
      return;
    }

    const uniqueIds = [
      ...new Set(attachmentIds),
    ];

    const attachments = await this.database
      .collection<AttachmentRecord>('attachments')
      .find({
        _id: {
          $in: uniqueIds.map((id) =>
            toObjectId(id, 'attachmentIds'),
          ),
        },
        facilityId: toObjectId(
          facilityId,
          'facilityId',
        ),
        $and: [
          {
            $or: [
              { deletedAt: null },
              {
                deletedAt: {
                  $exists: false,
                },
              },
            ],
          },
          {
            $or: [
              { malwareScanStatus: 'CLEAN' },
              {
                malwareScanStatus: {
                  $exists: false,
                },
              },
            ],
          },
          {
            $or: [
              { status: 'AVAILABLE' },
              { status: 'ACTIVE' },
              {
                status: {
                  $exists: false,
                },
              },
            ],
          },
        ],
      })
      .project({
        _id: 1,
      })
      .toArray();

    if (attachments.length !== uniqueIds.length) {
      throw new ConflictError(
        'One or more inventory attachments are missing, deleted, unsafe, or outside the facility',
      );
    }
  }
}

export function assertInventoryJobPermission(
  actor: InventoryActorContext,
  permission: string,
): void {
  if (!actor.permissionKeys.includes(permission)) {
    throw new ForbiddenError(
      `Inventory background operation requires ${permission}`,
    );
  }
}

export function createInventoryRuntimeAdapters(
  input: Readonly<{
    database: Db;
    auditRepository: AuditRepository;
    sequence: SequenceService;
    jobs?: BackgroundJobService;
    publishRealtime(
      message: InventoryProcurementRealtimeMessage,
    ): Promise<void>;
  }>,
) {
  return {
    audit: new MongoInventoryAuditAdapter(
      input.auditRepository,
    ),
    outbox: new MongoInventoryOutboxAdapter(
      input.database,
    ),
    realtime: new InventoryRealtimeAdapter(
      input.publishRealtime,
      input.jobs,
    ),
    clock: new InventorySystemClock(),
    sequence: new InventorySequenceAdapter(
      input.database,
      input.sequence,
    ),
    approvalLimits:
      new MongoInventoryApprovalLimitAdapter(
        input.database,
      ),
    attachments: new MongoInventoryAttachmentAdapter(
      input.database,
    ),
    actorResolver: new MongoInventoryActorResolver(
      input.database,
    ),
  };
}