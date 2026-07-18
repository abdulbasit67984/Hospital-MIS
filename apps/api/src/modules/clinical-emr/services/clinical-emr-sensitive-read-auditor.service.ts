import {
  randomUUID,
} from 'node:crypto';

import type {
  ClinicalAccessDecision,
  ClinicalEmrAuditPort,
} from '../clinical-emr.ports.js';

import {
  buildClinicalEmrAuditActorFields,
} from '../clinical-emr.ports.js';

import type {
  ClinicalEmrActorContext,
} from '../clinical-emr.types.js';

export type ClinicalReadResource =
  | 'ENCOUNTER_SUMMARY'
  | 'ENCOUNTER_DETAIL'
  | 'CLINICAL_NOTE'
  | 'CLINICAL_NOTE_VERSION'
  | 'DIAGNOSIS_HISTORY'
  | 'PROBLEM_LIST'
  | 'ALLERGY_HISTORY'
  | 'EMR_TIMELINE';

export class ClinicalEmrSensitiveReadAuditor {
  public constructor(
    private readonly audit: ClinicalEmrAuditPort,
  ) {}

  public async recordRead(
    input: Readonly<{
      actor: ClinicalEmrActorContext;
      patientId: string;
      encounterId?: string | null;
      entityType: string;
      entityId: string;
      resource: ClinicalReadResource;
      accessDecision: ClinicalAccessDecision;
      returnedFieldGroups: readonly string[];
      occurredAt: Date;
    }>,
  ): Promise<void> {
    if (!input.accessDecision.auditSensitiveRead) {
      return;
    }

    const readId = randomUUID();

    await this.audit.append({
      transactionId: `clinical-read:${readId}`,
      deduplicationKey: `clinical-read:${readId}`,
      action:
        input.accessDecision.accessMode === 'BREAK_GLASS'
          ? 'clinical.break_glass_read'
          : 'clinical.sensitive_read',
      entityType: input.entityType,
      entityId: input.entityId,
      ...buildClinicalEmrAuditActorFields(input.actor),
      occurredAt: input.occurredAt,
      ...(input.accessDecision.accessMode === 'BREAK_GLASS'
        ? {
            reason: input.actor.breakGlassReason?.trim(),
          }
        : {}),
      before: null,
      after: {
        resource: input.resource,
        patientId: input.patientId,
        encounterId: input.encounterId ?? null,
        accessMode: input.accessDecision.accessMode,
        returnedFieldGroups: [...input.returnedFieldGroups],
      },
      metadata: {
        minimumNecessaryFields: [
          ...input.accessDecision.minimumNecessaryFields,
        ],
        breakGlass:
          input.accessDecision.accessMode === 'BREAK_GLASS',
      },
    });
  }
}