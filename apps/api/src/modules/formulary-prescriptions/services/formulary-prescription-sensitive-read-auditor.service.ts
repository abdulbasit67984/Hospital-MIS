import {
  randomUUID,
} from 'node:crypto';

import type {
  FormularyPrescriptionAuditPort,
} from '../formulary-prescriptions.ports.js';

import type {
  FormularyPrescriptionActorContext,
} from '../formulary-prescriptions.types.js';

import type {
  FormularyPrescriptionAccessDecision,
} from './formulary-prescription-access-policy.service.js';

export type FormularyPrescriptionReadResource =
  | 'PRESCRIPTION_DETAIL'
  | 'PRESCRIPTION_LIST'
  | 'PRESCRIPTION_HISTORY'
  | 'PATIENT_MEDICATION_HISTORY'
  | 'PRESCRIPTION_PRINT';

export class FormularyPrescriptionSensitiveReadAuditor {
  public constructor(
    private readonly audit:
      FormularyPrescriptionAuditPort,
  ) {}

  public async recordRead(
    input: Readonly<{
      actor:
        FormularyPrescriptionActorContext;

      patientId:
        string;

      encounterId?:
        string | null;

      prescriptionId?:
        string | null;

      entityType:
        string;

      entityId:
        string;

      resource:
        FormularyPrescriptionReadResource;

      accessDecision:
        FormularyPrescriptionAccessDecision;

      returnedFieldGroups:
        readonly string[];

      occurredAt:
        Date;
    }>,
  ): Promise<void> {
    if (
      !input.accessDecision
        .auditSensitiveRead
    ) {
      return;
    }

    const readId =
      randomUUID();

    const breakGlass =
      input.accessDecision.accessMode ===
      'BREAK_GLASS';

    await this.audit.append({
      transactionId:
        `prescription-read:${readId}`,

      deduplicationKey:
        `prescription-read:${readId}`,

      action:
        breakGlass
          ? 'prescription.break_glass_read'
          : 'prescription.sensitive_read',

      entityType:
        input.entityType,

      entityId:
        input.entityId,

      actorUserId:
        input.actor.userId,

      facilityId:
        input.actor.facilityId,

      correlationId:
        input.actor.correlationId,

      ...(input.actor.ipAddress ===
      undefined
        ? {}
        : {
            ipAddress:
              input.actor.ipAddress,
          }),

      ...(input.actor.userAgent ===
      undefined
        ? {}
        : {
            userAgent:
              input.actor.userAgent,
          }),

      occurredAt:
        input.occurredAt,

      ...(breakGlass
        ? {
            reason:
              input.actor
                .breakGlassReason
                ?.trim(),
          }
        : {}),

      before:
        null,

      after: {
        resource:
          input.resource,

        patientId:
          input.patientId,

        encounterId:
          input.encounterId ??
          null,

        prescriptionId:
          input.prescriptionId ??
          null,

        accessMode:
          input.accessDecision
            .accessMode,

        returnedFieldGroups:
          [
            ...input.returnedFieldGroups,
          ],
      },

      metadata: {
        minimumNecessaryFields:
          [
            ...input
              .accessDecision
              .minimumNecessaryFields,
          ],

        breakGlass,
      },
    });
  }
}