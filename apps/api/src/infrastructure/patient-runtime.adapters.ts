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
  PatientAuditEntry,
  PatientAuditPort,
  PatientOutboxMessage,
  PatientOutboxPort,
} from '../modules/patient/patient.ports.js';

function isDuplicateKey(
  error: unknown,
): boolean {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000;
}

export class MongoPatientAuditAdapter
implements PatientAuditPort {
  public constructor(
    private readonly repository:
      AuditRepository,
  ) {}

  public async append(
    entry: PatientAuditEntry,
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
          'patient',
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
            entry.before ?? null,
          ),
        afterSnapshot:
          sanitizeAuditSnapshot(
            entry.after ?? null,
          ),
        metadata:
          sanitizeAuditSnapshot({
            ...(entry.metadata ?? {}),
            deduplicationKey:
              entry.deduplicationKey,
          }),
        outcome:
          'SUCCESS',
        sensitivity:
          'HIGHLY_SENSITIVE',
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

type PatientOutboxDocument =
  Record<string, unknown> & {
    eventId: string;
    transactionId: string;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
  };

export class MongoPatientOutboxAdapter
implements PatientOutboxPort {
  public constructor(
    private readonly database:
      Db,
  ) {}

  public async enqueue(
    message: PatientOutboxMessage,
  ): Promise<void> {
    const collection =
      this.database.collection<PatientOutboxDocument>(
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
            message.occurredAt.toISOString(),
        },
        status:
          'BLOCKED',
        availableAt:
          message.occurredAt,
        attemptCount:
          0,
        schemaVersion:
          1,
        version:
          0,
        createdAt:
          message.occurredAt,
        updatedAt:
          message.occurredAt,
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
        existing.transactionId !== message.transactionId ||
        existing.eventType !== message.eventType ||
        existing.aggregateType !== message.aggregateType ||
        existing.aggregateId !== message.aggregateId
      ) {
        throw new ConflictError(
          'The patient outbox deduplication key is already used by another event',
        );
      }
    }
  }
}

export function createPatientRuntimeAdapters(
  input: Readonly<{
    database: Db;
    auditRepository: AuditRepository;
  }>,
) {
  return {
    audit:
      new MongoPatientAuditAdapter(
        input.auditRepository,
      ),
    outbox:
      new MongoPatientOutboxAdapter(
        input.database,
      ),
  };
}