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
  FormularyPrescriptionAuditEntry,
  FormularyPrescriptionAuditPort,
  FormularyPrescriptionClockPort,
  FormularyPrescriptionOutboxMessage,
  FormularyPrescriptionOutboxPort,
  FormularyPrescriptionRealtimeMessage,
  FormularyPrescriptionRealtimePort,
  FormularyPrescriptionSequenceAllocation,
  FormularyPrescriptionSequencePort,
} from '../modules/formulary-prescriptions/formulary-prescriptions.ports.js';

import type {
  SequenceService,
} from './sequence.service.js';

const prohibitedEventPayloadKeys =
  new Set([
    'patientname',
    'patientdisplayname',
    'mrn',
    'cnic',
    'bform',
    'phone',
    'address',
    'genericname',
    'brandname',
    'selectedbrandname',
    'medicinestrength',
    'medicinestrengthsnapshot',
    'medicineformsnapshot',
    'dose',
    'doseunitsnapshot',
    'route',
    'routesnapshot',
    'frequency',
    'frequencysnapshot',
    'durationvalue',
    'durationunit',
    'quantity',
    'quantityunitsnapshot',
    'instructions',
    'asneededreason',
    'prescribingnotes',
    'warningmessage',
    'message',
    'allergentext',
    'allergy',
    'reactions',
    'signaturedigest',
    'encryptedsnapshot',
    'ciphertext',
    'snapshot',
    'replacementreason',
    'cancellationreason',
    'acknowledgementreason',
    'overridereason',
    'resolutionreason',
  ]);

const redactedAuditKeys =
  new Set([
    ...prohibitedEventPayloadKeys,
    'professionalregistrationnumber',
    'externalreferenceid',
  ]);

function normalizedKey(
  value: string,
): string {
  return value
    .normalize('NFKC')
    .replaceAll(
      /[^a-z0-9]/giu,
      '',
    )
    .toLocaleLowerCase(
      'en-US',
    );
}

function isDuplicateKeyError(
  error: unknown,
): boolean {
  return (
    typeof error ===
      'object' &&
    error !==
      null &&
    'code' in
      error &&
    error.code ===
      11000
  );
}

function redactAuditValue(
  value: unknown,
  depth = 0,
): unknown {
  if (depth > 7) {
    return '[MAX_DEPTH]';
  }

  if (Array.isArray(value)) {
    return value
      .slice(
        0,
        100,
      )
      .map(
        (item) =>
          redactAuditValue(
            item,
            depth + 1,
          ),
      );
  }

  if (
    typeof value !==
      'object' ||
    value ===
      null ||
    value instanceof
      Date
  ) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(
      value,
    )
      .slice(
        0,
        200,
      )
      .map(
        (
          [
            key,
            nestedValue,
          ],
        ) => [
          key,

          redactedAuditKeys.has(
            normalizedKey(
              key,
            ),
          )
            ? '[REDACTED_PRESCRIPTION_CONTENT]'
            : redactAuditValue(
                nestedValue,
                depth + 1,
              ),
        ],
      ),
  );
}

export function assertSafeFormularyPrescriptionEventPayload(
  payload:
    Record<string, unknown>,
): void {
  const visit = (
    value:
      unknown,

    path:
      string,

    depth:
      number,
  ): void => {
    if (depth > 8) {
      throw new TypeError(
        `Formulary and prescription event payload exceeds the maximum nesting depth at ${path}`,
      );
    }

    if (
      Array.isArray(
        value,
      )
    ) {
      if (
        value.length >
        100
      ) {
        throw new TypeError(
          `Formulary and prescription event payload array is too large at ${path}`,
        );
      }

      value.forEach(
        (
          item,
          index,
        ) =>
          visit(
            item,
            `${path}.${index}`,
            depth + 1,
          ),
      );

      return;
    }

    if (
      typeof value !==
        'object' ||
      value ===
        null
    ) {
      if (
        typeof value ===
          'string' &&
        value.length >
          2_000
      ) {
        throw new TypeError(
          `Formulary and prescription event payload string is too long at ${path}`,
        );
      }

      return;
    }

    for (
      const [
        key,
        nestedValue,
      ] of Object.entries(
        value,
      )
    ) {
      if (
        prohibitedEventPayloadKeys.has(
          normalizedKey(
            key,
          ),
        )
      ) {
        throw new TypeError(
          `Sensitive formulary or prescription field ${path}.${key} cannot be published`,
        );
      }

      visit(
        nestedValue,
        `${path}.${key}`,
        depth + 1,
      );
    }
  };

  visit(
    payload,
    'payload',
    0,
  );
}

export class MongoFormularyPrescriptionAuditAdapter
implements FormularyPrescriptionAuditPort {
  public constructor(
    private readonly repository:
      AuditRepository,
  ) {}

  public async append(
    entry:
      FormularyPrescriptionAuditEntry,
  ): Promise<void> {
    const highlySensitive =
      [
        'Prescription',
        'PrescriptionSafetyWarning',
        'PrescriptionStatusHistory',
      ].includes(
        entry.entityType,
      );

    try {
      await this.repository
        .insertAuditEvent({
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
            'formulary_prescriptions',

          entityType:
            entry.entityType,

          entityId:
            entry.entityId,

          ...(entry.reason ===
          undefined
            ? {}
            : {
                reason:
                  entry.reason,
              }),

          beforeSnapshot:
            sanitizeAuditSnapshot(
              redactAuditValue(
                entry.before ??
                null,
              ),
            ),

          afterSnapshot:
            sanitizeAuditSnapshot(
              redactAuditValue(
                entry.after ??
                null,
              ),
            ),

          metadata:
            sanitizeAuditSnapshot(
              redactAuditValue({
                ...(entry.metadata ??
                  {}),

                deduplicationKey:
                  entry.deduplicationKey,
              }),
            ),

          outcome:
            'SUCCESS',

          sensitivity:
            highlySensitive
              ? 'HIGHLY_SENSITIVE'
              : 'SENSITIVE',

          correlationId:
            entry.correlationId,

          transactionId:
            entry.transactionId,

          requestSource:
            'API',

          ...(entry.ipAddress ===
          undefined
            ? {}
            : {
                ipAddress:
                  entry.ipAddress,
              }),

          ...(entry.userAgent ===
          undefined
            ? {}
            : {
                userAgent:
                  entry.userAgent,
              }),

          occurredAt:
            entry.occurredAt,
        });
    } catch (error) {
      if (
        !isDuplicateKeyError(
          error,
        )
      ) {
        throw error;
      }
    }
  }
}

type FormularyPrescriptionOutboxDocument =
  Record<string, unknown> & {
    eventId:
      string;

    transactionId:
      string;

    eventType:
      string;

    aggregateType:
      string;

    aggregateId:
      string;
  };

export class MongoFormularyPrescriptionOutboxAdapter
implements FormularyPrescriptionOutboxPort {
  public constructor(
    private readonly database:
      Db,
  ) {}

  public async enqueue(
    message:
      FormularyPrescriptionOutboxMessage,
  ): Promise<void> {
    assertSafeFormularyPrescriptionEventPayload(
      message.payload,
    );

    const collection =
      this.database
        .collection<FormularyPrescriptionOutboxDocument>(
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
      if (
        !isDuplicateKeyError(
          error,
        )
      ) {
        throw error;
      }

      const existing =
        await collection.findOne({
          eventId:
            message.deduplicationKey,
        });

      if (
        existing ===
          null ||
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
          'The formulary and prescription outbox deduplication key is already used by another event',
        );
      }
    }
  }
}

export class FormularyPrescriptionRealtimeAdapter
implements FormularyPrescriptionRealtimePort {
  public constructor(
    private readonly publishMessage:
      (
        message:
          FormularyPrescriptionRealtimeMessage,
      ) => Promise<void>,
  ) {}

  public async publish(
    message:
      FormularyPrescriptionRealtimeMessage,
  ): Promise<void> {
    assertSafeFormularyPrescriptionEventPayload(
      message.payload,
    );

    await this.publishMessage(
      message,
    );
  }
}

export class FormularyPrescriptionSystemClock
implements FormularyPrescriptionClockPort {
  public now(): Date {
    return new Date();
  }
}

export class FormularyPrescriptionSequenceAdapter
implements FormularyPrescriptionSequencePort {
  public constructor(
    private readonly sequence:
      SequenceService,
  ) {}

  public async next(
    facilityId:
      string,

    key:
      string,
  ): Promise<FormularyPrescriptionSequenceAllocation> {
    return this.sequence.next(
      facilityId,
      key,
    );
  }
}

export function createFormularyPrescriptionRuntimeAdapters(
  input: Readonly<{
    database:
      Db;

    auditRepository:
      AuditRepository;

    sequence:
      SequenceService;

    publishRealtime(
      message:
        FormularyPrescriptionRealtimeMessage,
    ): Promise<void>;
  }>,
) {
  return {
    audit:
      new MongoFormularyPrescriptionAuditAdapter(
        input.auditRepository,
      ),

    outbox:
      new MongoFormularyPrescriptionOutboxAdapter(
        input.database,
      ),

    realtime:
      new FormularyPrescriptionRealtimeAdapter(
        input.publishRealtime,
      ),

    clock:
      new FormularyPrescriptionSystemClock(),

    sequence:
      new FormularyPrescriptionSequenceAdapter(
        input.sequence,
      ),
  };
}