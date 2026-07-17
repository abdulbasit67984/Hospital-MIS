import {
  randomUUID,
} from 'node:crypto';

import type {
  PatientAuditPort,
} from '../patient.ports.js';

import type {
  PatientActorContext,
} from '../patient.types.js';

export class PatientSensitiveReadAuditor {
  public constructor(
    private readonly audit:
      PatientAuditPort,
  ) {}

  public async recordPatientRead(
    input: Readonly<{
      actor: PatientActorContext;
      patientId: string;
      canonicalPatientId: string;
      redirected: boolean;
      resource: 'SEARCH' | 'PROFILE' | 'REGISTRATION_SLIP';
      fieldGroups: readonly string[];
      occurredAt: Date;
    }>,
  ): Promise<void> {
    const readId =
      randomUUID();

    await this.audit.append({
      transactionId:
        `patient-read:${readId}`,

      deduplicationKey:
        `patient-read:${readId}`,

      action:
        'patient.sensitive_read',

      entityType:
        'Patient',

      entityId:
        input.canonicalPatientId,

      actorUserId:
        input.actor.userId,

      facilityId:
        input.actor.facilityId,

      correlationId:
        input.actor.correlationId,

      ...(input.actor.ipAddress === undefined
        ? {}
        : {
            ipAddress:
              input.actor.ipAddress,
          }),

      ...(input.actor.userAgent === undefined
        ? {}
        : {
            userAgent:
              input.actor.userAgent,
          }),

      occurredAt:
        input.occurredAt,

      before:
        null,

      after: {
        resource:
          input.resource,

        requestedPatientId:
          input.patientId,

        canonicalPatientId:
          input.canonicalPatientId,

        redirected:
          input.redirected,

        fieldGroups: [
          ...input.fieldGroups,
        ],
      },
    });
  }

  public async recordGuardianRead(
    input: Readonly<{
      actor: PatientActorContext;
      guardianId: string;
      resource: 'SEARCH' | 'PROFILE';
      fieldGroups: readonly string[];
      occurredAt: Date;
    }>,
  ): Promise<void> {
    const readId =
      randomUUID();

    await this.audit.append({
      transactionId:
        `guardian-read:${readId}`,

      deduplicationKey:
        `guardian-read:${readId}`,

      action:
        'guardian.sensitive_read',

      entityType:
        'Guardian',

      entityId:
        input.guardianId,

      actorUserId:
        input.actor.userId,

      facilityId:
        input.actor.facilityId,

      correlationId:
        input.actor.correlationId,

      ...(input.actor.ipAddress === undefined
        ? {}
        : {
            ipAddress:
              input.actor.ipAddress,
          }),

      ...(input.actor.userAgent === undefined
        ? {}
        : {
            userAgent:
              input.actor.userAgent,
          }),

      occurredAt:
        input.occurredAt,

      before:
        null,

      after: {
        resource:
          input.resource,

        guardianId:
          input.guardianId,

        fieldGroups: [
          ...input.fieldGroups,
        ],
      },
    });
  }
}