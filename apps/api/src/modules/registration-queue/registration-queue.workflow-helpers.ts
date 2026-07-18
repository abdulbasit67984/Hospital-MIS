import {
  createHash,
  randomUUID,
} from 'node:crypto';

import {
  DateTime,
} from 'luxon';

import {
  RequestValidationError,
} from '@hospital-mis/shared';

import {
  QueueEmergencyOverrideNotSupportedError,
  QueuePriorityNotSupportedError,
} from './registration-queue.errors.js';

import {
  REGISTRATION_QUEUE_LOCK_NAMESPACE,
} from './registration-queue.constants.js';

import {
  calculateQueuePriorityScore,
  parseRegistrationQueueDateTime,
  registrationQueueLockKey,
  serviceDateForTimestamp,
} from './registration-queue.normalization.js';

import type {
  CreateQueueEntryInput,
  CreateRegistrationInput,
  QueueDefinitionRecord,
  RegistrationQueueActorContext,
} from './registration-queue.types.js';

export interface RegistrationTemporalContext {
  arrivedAt: Date;
  checkedInAt: Date | null;
}

export interface RegistrationQueueEntityIds {
  registrationId: string;
  visitId: string;
  queueTokenId: string | null;
  queueEntryId: string | null;
  queueHistoryId: string | null;
}

function requestValidationError(
  path: string,
  message: string,
): RequestValidationError {
  return new RequestValidationError([
    {
      code:
        'invalid_opd_registration',

      message,

      path,
    },
  ]);
}

function stableHash(
  value: string,
): string {
  return createHash(
    'sha256',
  )
    .update(
      value,
      'utf8',
    )
    .digest(
      'hex',
    );
}

export function resolveRegistrationTemporalContext(
  input: CreateRegistrationInput,
  facilityTimezone: string,
  now: Date,
): RegistrationTemporalContext {
  const arrivedAt =
    input.arrivedAt === undefined
      ? new Date(
          now,
        )
      : parseRegistrationQueueDateTime(
          input.arrivedAt,
          'body.registration.arrivedAt',
        );

  const checkedInAt =
    input.checkedInAt ===
      undefined ||
    input.checkedInAt ===
      null
      ? null
      : parseRegistrationQueueDateTime(
          input.checkedInAt,
          'body.registration.checkedInAt',
        );

  const latestAllowedArrival =
    DateTime.fromJSDate(
      now,
      {
        zone:
          'utc',
      },
    )
      .plus({
        minutes:
          5,
      })
      .toJSDate();

  if (
    arrivedAt >
    latestAllowedArrival
  ) {
    throw requestValidationError(
      'body.registration.arrivedAt',
      'Arrival time cannot be more than five minutes in the future',
    );
  }

  if (
    checkedInAt !== null &&
    checkedInAt < arrivedAt
  ) {
    throw requestValidationError(
      'body.registration.checkedInAt',
      'Check-in time cannot be before arrival time',
    );
  }

  const derivedServiceDate =
    serviceDateForTimestamp(
      arrivedAt,
      facilityTimezone,
    );

  if (
    derivedServiceDate !==
    input.serviceDate
  ) {
    throw requestValidationError(
      'body.registration.serviceDate',
      'Service date must match the arrival date in the facility timezone',
    );
  }

  return {
    arrivedAt,
    checkedInAt,
  };
}

export function assertQueueDefinitionSupportsInput(
  queueDefinition: QueueDefinitionRecord,
  input: CreateQueueEntryInput,
): void {
  const priorityRequested =
    (
      input.priorityClass ??
      'ROUTINE'
    ) !== 'ROUTINE' ||
    (
      input.triagePriority ??
      'NOT_TRIAGED'
    ) !== 'NOT_TRIAGED' ||
    (
      input.specialCategories ??
      []
    ).length > 0;

  if (
    priorityRequested &&
    !queueDefinition.allowPriority
  ) {
    throw new QueuePriorityNotSupportedError();
  }

  if (
    input.emergencyOverride ===
      true &&
    !queueDefinition.allowEmergencyOverride
  ) {
    throw new QueueEmergencyOverrideNotSupportedError();
  }
}

export function queuePriorityScoreForInput(
  input: CreateQueueEntryInput,
): number {
  return calculateQueuePriorityScore({
    priorityClass:
      input.priorityClass ??
      'ROUTINE',

    triagePriority:
      input.triagePriority ??
      'NOT_TRIAGED',

    emergencyOverride:
      input.emergencyOverride ??
      false,

    specialCategories:
      input.specialCategories ??
      [],
  });
}

export function createRegistrationQueueEntityIds(
  queueRequested: boolean,
): RegistrationQueueEntityIds {
  return {
    registrationId:
      randomUUID()
        .replaceAll(
          '-',
          '',
        )
        .slice(
          0,
          24,
        ),

    visitId:
      randomUUID()
        .replaceAll(
          '-',
          '',
        )
        .slice(
          0,
          24,
        ),

    queueTokenId:
      queueRequested
        ? randomUUID()
            .replaceAll(
              '-',
              '',
            )
            .slice(
              0,
              24,
            )
        : null,

    queueEntryId:
      queueRequested
        ? randomUUID()
        : null,

    queueHistoryId:
      queueRequested
        ? randomUUID()
            .replaceAll(
              '-',
              '',
            )
            .slice(
              0,
              24,
            )
        : null,
  };
}

export function registrationQueueCreateLockKeys(
  input: Readonly<{
    actor: RegistrationQueueActorContext;
    canonicalPatientId: string;
    registration: CreateRegistrationInput;
    queueDefinitionId?: string | null;
  }>,
): string[] {
  const keys =
    new Set<string>();

  keys.add(
    registrationQueueLockKey(
      REGISTRATION_QUEUE_LOCK_NAMESPACE
        .ACTIVE_VISIT,
      input.actor.facilityId,
      input.canonicalPatientId,
      input.registration.serviceDate,
      input.registration.departmentId,
      input.registration.clinicId ??
        '-',
      input.registration.servicePointId ??
        '-',
    ),
  );

  keys.add(
    registrationQueueLockKey(
      REGISTRATION_QUEUE_LOCK_NAMESPACE
        .REGISTRATION_NUMBER,
      input.actor.facilityId,
      input.registration.serviceDate,
    ),
  );

  keys.add(
    registrationQueueLockKey(
      REGISTRATION_QUEUE_LOCK_NAMESPACE
        .VISIT_NUMBER,
      input.actor.facilityId,
      input.registration.serviceDate,
    ),
  );

  if (
    input.queueDefinitionId !==
      undefined &&
    input.queueDefinitionId !==
      null
  ) {
    keys.add(
      registrationQueueLockKey(
        REGISTRATION_QUEUE_LOCK_NAMESPACE
          .QUEUE_TOKEN,
        input.actor.facilityId,
        input.queueDefinitionId,
        input.registration.serviceDate,
      ),
    );
  }

  if (
    input.registration.appointmentId !==
      undefined &&
    input.registration.appointmentId !==
      null
  ) {
    keys.add(
      registrationQueueLockKey(
        'registration-queue:appointment',
        input.actor.facilityId,
        input.registration.appointmentId,
      ),
    );
  }

  return [
    ...keys,
  ];
}

export function safeRegisterOpdVisitJournalPayload(
  input: Readonly<{
    registration: CreateRegistrationInput;
    queue?: CreateQueueEntryInput | null;
  }>,
): Record<string, unknown> {
  return {
    operation:
      'REGISTER_OPD_VISIT',

    registrationMode:
      input.registration.registrationMode,

    registrationSource:
      input.registration.registrationSource,

    visitType:
      input.registration.visitType,

    serviceDate:
      input.registration.serviceDate,

    departmentId:
      input.registration.departmentId,

    clinicId:
      input.registration.clinicId ??
      null,

    servicePointId:
      input.registration.servicePointId ??
      null,

    appointmentLinked:
      input.registration.appointmentId !=
      null,

    referralLinked:
      input.registration.referralId !=
        null ||
      input.registration.referralReference !=
        null,

    emergencyLinked:
      input.registration.emergencyCaseId !=
      null,

    queueRequested:
      input.queue != null,

    queueDefinitionId:
      input.queue?.queueDefinitionId ??
      null,

    priorityClass:
      input.queue?.priorityClass ??
      'ROUTINE',

    triagePriority:
      input.queue?.triagePriority ??
      'NOT_TRIAGED',

    emergencyOverride:
      input.queue?.emergencyOverride ??
      false,

    specialCategoryCount:
      input.queue?.specialCategories
        ?.length ??
      0,
  };
}

export function registrationQueueOutboxPayload(
  input: Readonly<{
    registrationId: string;
    registrationNumber: string;
    visitId: string;
    visitNumber: string;
    patientId: string;
    requestedPatientId: string;
    canonicalRedirected: boolean;
    serviceDate: string;
    departmentId: string;
    clinicId: string | null;
    servicePointId: string | null;
    assignedProviderId: string | null;
    assignedCounterId: string | null;
    queueEntryId: string | null;
    queueDefinitionId: string | null;
    tokenLabel: string | null;
    occurredAt: Date;
  }>,
): Record<string, unknown> {
  return {
    registrationId:
      input.registrationId,

    registrationNumber:
      input.registrationNumber,

    visitId:
      input.visitId,

    visitNumber:
      input.visitNumber,

    patientId:
      input.patientId,

    requestedPatientId:
      input.requestedPatientId,

    canonicalRedirected:
      input.canonicalRedirected,

    serviceDate:
      input.serviceDate,

    departmentId:
      input.departmentId,

    clinicId:
      input.clinicId,

    servicePointId:
      input.servicePointId,

    assignedProviderId:
      input.assignedProviderId,

    assignedCounterId:
      input.assignedCounterId,

    queueEntryId:
      input.queueEntryId,

    queueDefinitionId:
      input.queueDefinitionId,

    tokenLabel:
      input.tokenLabel,

    occurredAt:
      input.occurredAt.toISOString(),
  };
}

export function registrationQueueDeduplicationKey(
  transactionId: string,
  category: string,
  entityId: string,
): string {
  return [
    transactionId,
    category,
    stableHash(
      entityId,
    ).slice(
      0,
      24,
    ),
  ].join(
    ':',
  );
}