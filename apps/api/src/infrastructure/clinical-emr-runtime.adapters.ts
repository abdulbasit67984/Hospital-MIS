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
  ClinicalEmrAuditEntry,
  ClinicalEmrAuditPort,
  ClinicalEmrClockPort,
  ClinicalEmrOutboxMessage,
  ClinicalEmrOutboxPort,
  ClinicalEmrRealtimeMessage,
  ClinicalEmrRealtimePort,
  ClinicalEmrSequenceAllocation,
  ClinicalEmrSequencePort,
} from '../modules/clinical-emr/clinical-emr.ports.js';

import type {
  SequenceService,
} from './sequence.service.js';

const prohibitedClinicalPayloadKeys = new Set([
  'narrativetext',
  'structureddata',
  'clinicalcontent',
  'clinicalnote',
  'clinicalnotes',
  'ciphertext',
  'encryptedsnapshot',
  'signaturedigest',
  'restrictionreason',
  'correctionreason',
  'amendmentreason',
  'enteredinerrorreason',
  'cancellationreason',
  'statusreason',
  'evidence',
  'summary',
  'notes',
  'reactions',
  'allergentext',
  'diagnosisdisplay',
  'patientname',
  'mrn',
  'cnic',
  'bform',
  'phone',
  'address',
]);

function normalizedKey(
  value: string,
): string {
  return value
    .normalize('NFKC')
    .replaceAll(/[^a-z0-9]/giu, '')
    .toLocaleLowerCase('en-US');
}

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

function redactClinicalAuditValue(
  value: unknown,
  depth = 0,
): unknown {
  if (depth > 6) {
    return '[MAX_DEPTH]';
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 50)
      .map((item) => redactClinicalAuditValue(item, depth + 1));
  }

  if (
    typeof value !== 'object' ||
    value === null ||
    value instanceof Date
  ) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 100)
      .map(([key, nested]) => [
        key,
        prohibitedClinicalPayloadKeys.has(normalizedKey(key))
          ? '[REDACTED_CLINICAL_CONTENT]'
          : redactClinicalAuditValue(nested, depth + 1),
      ]),
  );
}

export function assertSafeClinicalEventPayload(
  payload: Record<string, unknown>,
): void {
  const visit = (
    value: unknown,
    path: string,
    depth: number,
  ): void => {
    if (depth > 8) {
      throw new TypeError(
        `Clinical event payload exceeds the safe nesting depth at ${path}`,
      );
    }

    if (Array.isArray(value)) {
      if (value.length > 100) {
        throw new TypeError(
          `Clinical event payload array is too large at ${path}`,
        );
      }

      value.forEach((item, index) =>
        visit(item, `${path}.${index}`, depth + 1),
      );
      return;
    }

    if (typeof value !== 'object' || value === null) {
      if (typeof value === 'string' && value.length > 2_000) {
        throw new TypeError(
          `Clinical event payload string is too long at ${path}`,
        );
      }
      return;
    }

    for (const [key, nested] of Object.entries(value)) {
      if (prohibitedClinicalPayloadKeys.has(normalizedKey(key))) {
        throw new TypeError(
          `Sensitive clinical field ${path}.${key} cannot be published`,
        );
      }

      visit(nested, `${path}.${key}`, depth + 1);
    }
  };

  visit(payload, 'payload', 0);
}

export class MongoClinicalEmrAuditAdapter
implements ClinicalEmrAuditPort {
  public constructor(
    private readonly repository: AuditRepository,
  ) {}

  public async append(
    entry: ClinicalEmrAuditEntry,
  ): Promise<void> {
    try {
      await this.repository.insertAuditEvent({
        eventId: entry.deduplicationKey,
        facilityId: entry.facilityId,
        actorId: entry.actorUserId,
        actorRoleIds: [],
        actorRoleCodes: [],
        action: entry.action,
        module: 'clinical_emr',
        entityType: entry.entityType,
        entityId: entry.entityId,
        ...(entry.reason === undefined
          ? {}
          : {
              reason: entry.reason,
            }),
        beforeSnapshot: sanitizeAuditSnapshot(
          redactClinicalAuditValue(entry.before ?? null),
        ),
        afterSnapshot: sanitizeAuditSnapshot(
          redactClinicalAuditValue(entry.after ?? null),
        ),
        metadata: sanitizeAuditSnapshot(
          redactClinicalAuditValue({
            ...(entry.metadata ?? {}),
            deduplicationKey: entry.deduplicationKey,
          }),
        ),
        outcome: 'SUCCESS',
        sensitivity: 'HIGHLY_SENSITIVE',
        correlationId: entry.correlationId,
        transactionId: entry.transactionId,
        requestSource: 'API',
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
      if (!isDuplicateKey(error)) {
        throw error;
      }
    }
  }
}

type ClinicalEmrOutboxDocument = Record<string, unknown> & {
  eventId: string;
  transactionId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
};

export class MongoClinicalEmrOutboxAdapter
implements ClinicalEmrOutboxPort {
  public constructor(
    private readonly database: Db,
  ) {}

  public async enqueue(
    message: ClinicalEmrOutboxMessage,
  ): Promise<void> {
    assertSafeClinicalEventPayload(message.payload);

    const collection =
      this.database.collection<ClinicalEmrOutboxDocument>('outboxEvents');

    try {
      await collection.insertOne({
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
      });
    } catch (error) {
      if (!isDuplicateKey(error)) {
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
          'The clinical EMR outbox deduplication key is already used by another event',
        );
      }
    }
  }
}

export class ClinicalEmrRealtimeAdapter
implements ClinicalEmrRealtimePort {
  public constructor(
    private readonly publishMessage: (
      message: ClinicalEmrRealtimeMessage,
    ) => Promise<void>,
  ) {}

  public async publish(
    message: ClinicalEmrRealtimeMessage,
  ): Promise<void> {
    assertSafeClinicalEventPayload(message.payload);
    await this.publishMessage(message);
  }
}

export class ClinicalEmrSystemClock
implements ClinicalEmrClockPort {
  public now(): Date {
    return new Date();
  }
}

export class ClinicalEmrSequenceAdapter
implements ClinicalEmrSequencePort {
  public constructor(
    private readonly sequence: SequenceService,
  ) {}

  public async next(
    facilityId: string,
    key: string,
  ): Promise<ClinicalEmrSequenceAllocation> {
    return this.sequence.next(facilityId, key);
  }
}

export function createClinicalEmrRuntimeAdapters(
  input: Readonly<{
    database: Db;
    auditRepository: AuditRepository;
    sequence: SequenceService;
    publishRealtime(
      message: ClinicalEmrRealtimeMessage,
    ): Promise<void>;
  }>,
) {
  return {
    audit: new MongoClinicalEmrAuditAdapter(input.auditRepository),
    outbox: new MongoClinicalEmrOutboxAdapter(input.database),
    realtime: new ClinicalEmrRealtimeAdapter(input.publishRealtime),
    clock: new ClinicalEmrSystemClock(),
    sequence: new ClinicalEmrSequenceAdapter(input.sequence),
  };
}