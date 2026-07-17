import type {
  Db,
} from '@hospital-mis/database';

import {
  createObjectId,
  toObjectId,
} from '@hospital-mis/database';

import {
  ConflictError,
} from '@hospital-mis/shared';

import type {
  AuditRepository,
} from '../modules/audit/audit.repository.js';

import {
  sanitizeAuditSnapshot,
} from '../modules/audit/audit.sanitizer.js';

import type {
  AuditSensitivity,
} from '../modules/audit/audit.types.js';

import type {
  FacilityAuditEntry,
  FacilityAuditPort,
  FacilityOutboxMessage,
  FacilityOutboxPort,
} from '../modules/facility/facility.ports.js';

function isDuplicateKey(
  error: unknown,
): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

function sensitivityForAction(
  action: string,
): AuditSensitivity {
  if (
    action.includes(
      'deactivated',
    ) ||
    action.includes(
      'activated',
    ) ||
    action.includes(
      'sensitive',
    )
  ) {
    return 'HIGHLY_SENSITIVE';
  }

  return 'SENSITIVE';
}

export class MongoFacilityAuditAdapter
implements FacilityAuditPort {
  public constructor(
    private readonly repository:
      AuditRepository,
  ) {}

  public async append(
    entry: FacilityAuditEntry,
  ): Promise<void> {
    try {
      await this.repository.insertAuditEvent({
        eventId:
          entry.deduplicationKey,

        facilityId:
          entry.facilityId,

        actorId:
          entry.actorUserId,

        actorRoleIds:
          [],

        actorRoleCodes:
          [],

        action:
          entry.action,

        module:
          'facility',

        entityType:
          entry.entityType,

        entityId:
          entry.entityId,

        ...(entry.reason === undefined
          ? {}
          : {
              reason:
                entry.reason,
            }),

        beforeSnapshot:
          sanitizeAuditSnapshot(
            entry.before ??
              null,
          ),

        afterSnapshot:
          sanitizeAuditSnapshot(
            entry.after ??
              null,
          ),

        metadata:
          sanitizeAuditSnapshot({
            ...(
              entry.metadata ??
              {}
            ),

            deduplicationKey:
              entry.deduplicationKey,
          }),

        outcome:
          'SUCCESS',

        sensitivity:
          sensitivityForAction(
            entry.action,
          ),

        correlationId:
          entry.correlationId,

        transactionId:
          entry.transactionId,

        requestSource:
          'API',

        ...(entry.ipAddress === undefined
          ? {}
          : {
              ipAddress:
                entry.ipAddress,
            }),

        ...(entry.userAgent === undefined
          ? {}
          : {
              userAgent:
                entry.userAgent,
            }),

        occurredAt:
          entry.occurredAt,
      });
    } catch (error) {
      if (!isDuplicateKey(error)) {
        throw error;
      }
    }
  }
}

type FacilityOutboxDocument =
  Record<string, unknown> & {
    eventId: string;
    transactionId: string;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
  };

export class MongoFacilityOutboxAdapter
implements FacilityOutboxPort {
  public constructor(
    private readonly database: Db,
  ) {}

  public async enqueue(
    message:
      FacilityOutboxMessage,
  ): Promise<void> {
    const now =
      message.occurredAt;

    const collection =
      this.database.collection<
        FacilityOutboxDocument
      >(
        'outboxEvents',
      );

    try {
      await collection.insertOne({
        _id:
          createObjectId(),

        facilityId:
          toObjectId(
            message.facilityId,
            'facilityId',
          ),

        eventId:
          message.deduplicationKey,

        transactionId:
          message.transactionId,

        eventType:
          message.eventType,

        aggregateType:
          message.aggregateType,

        aggregateId:
          message.aggregateId,

        payload: {
          ...message.payload,

          actorUserId:
            message.actorUserId,

          correlationId:
            message.correlationId,

          occurredAt:
            message.occurredAt
              .toISOString(),
        },

        status:
          'BLOCKED',

        availableAt:
          now,

        attemptCount:
          0,

        schemaVersion:
          1,

        version:
          0,

        createdAt:
          now,

        updatedAt:
          now,
      });
    } catch (error) {
      if (!isDuplicateKey(error)) {
        throw error;
      }

      const existing =
        await collection.findOne({
          eventId:
            message.deduplicationKey,
        });

      if (
        existing === null ||
        existing.transactionId !==
          message.transactionId ||
        existing.eventType !==
          message.eventType ||
        existing.aggregateType !==
          message.aggregateType ||
        existing.aggregateId !==
          message.aggregateId
      ) {
        throw new ConflictError(
          'The facility outbox deduplication key is already used by another event',
        );
      }
    }
  }
}

export function createFacilityRuntimeAdapters(
  input: Readonly<{
    database: Db;
    auditRepository: AuditRepository;
  }>,
) {
  return {
    audit:
      new MongoFacilityAuditAdapter(
        input.auditRepository,
      ),

    outbox:
      new MongoFacilityOutboxAdapter(
        input.database,
      ),
  };
}