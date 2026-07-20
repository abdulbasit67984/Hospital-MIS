import {
  Types,
} from 'mongoose';

import {
  toObjectId,
} from '@hospital-mis/database';

import {
  DEFAULT_NURSING_MEDICATION_NUMBER_WIDTH,
} from '../nursing-medication.constants.js';

import {
  NursingAssessmentConcurrencyError,
  NursingAssessmentNotFoundError,
  NursingCarePlanConcurrencyError,
  NursingCarePlanNotFoundError,
  NursingMinimumNecessaryAccessError,
  NursingTaskConcurrencyError,
  NursingTaskNotFoundError,
} from '../nursing-medication.errors.js';

import {
  buildNursingSequenceKey,
  formatNursingNumber,
  normalizeNursingCode,
  normalizeNursingText,
  nullableNursingText,
} from '../nursing-medication.normalization.js';

import type {
  NursingAccessAction,
  NursingAccessDecision,
  NursingAccessPolicyPort,
  NursingAssessmentRepositoryPort,
  NursingCareRepositoryPort,
  NursingMedicationContextPort,
} from '../nursing-medication.ports.js';

import type {
  NursingAssessmentRecord,
  NursingCarePlanRecord,
  NursingTaskRecord,
} from '../nursing-medication.persistence.types.js';

import type {
  NursingAdmissionContext,
  NursingMedicationActorContext,
} from '../nursing-medication.contracts.js';

import {
  NURSING_MEDICATION_TRANSACTION_STATES,
} from '../nursing-medication.transaction.constants.js';

import type {
  NursingMedicationAuditEntry,
  NursingMedicationCommandDependencies,
  NursingMedicationTransactionContext,
} from '../nursing-medication.workflow-ports.js';

export interface NursingAllocatedNumber {
  number: string;
  sequenceKey: string;
  sequenceValue: number;
}

export interface NursingMutationPublication {
  transaction: NursingMedicationTransactionContext;
  actor: NursingMedicationActorContext;
  occurredAt: Date;
  auditAction: string;
  outboxEventType: string;
  realtimeEventType: string;
  entityType: string;
  entityId: string;
  context: NursingAdmissionContext;
  before: unknown;
  after: unknown;
  eventPayload: Record<string, unknown>;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export class NursingMedicationCommandService {
  public constructor(
    public readonly assessments:
      NursingAssessmentRepositoryPort,
    public readonly care:
      NursingCareRepositoryPort,
    public readonly context:
      NursingMedicationContextPort,
    public readonly accessPolicy:
      NursingAccessPolicyPort,
    public readonly dependencies:
      NursingMedicationCommandDependencies,
  ) {}

  public newId(): string {
    return new Types.ObjectId()
      .toHexString();
  }

  public objectId(
    value: string,
    fieldName: string,
  ): Types.ObjectId {
    return toObjectId(
      value,
      fieldName,
    );
  }

  public normalizedCode(
    value: string,
  ): string {
    return normalizeNursingCode(
      value,
    );
  }

  public normalizedText(
    value: string,
  ): string {
    return normalizeNursingText(
      value,
    );
  }

  public nullableText(
    value: string | null | undefined,
  ): string | null {
    return nullableNursingText(
      value,
    );
  }

  public async resolveAdmission(
    actor: NursingMedicationActorContext,
    admissionId: string,
  ): Promise<NursingAdmissionContext> {
    return this.context.resolveAdmission(
      actor,
      admissionId,
    );
  }

  public async actorStaffId(
    actor: NursingMedicationActorContext,
  ): Promise<string> {
    return this.context.requireActiveActorStaffId(
      actor,
    );
  }

  public async assertAccess(
    action: NursingAccessAction,
    actor: NursingMedicationActorContext,
    context: NursingAdmissionContext,
  ): Promise<NursingAccessDecision> {
    const decision =
      await this.accessPolicy.authorize({
        action,
        actor,
        context,
      });

    if (
      !decision.allowed
    ) {
      throw new NursingMinimumNecessaryAccessError();
    }

    return decision;
  }

  public async requireAssessment(
    actor: NursingMedicationActorContext,
    assessmentId: string,
  ): Promise<NursingAssessmentRecord> {
    const assessment =
      await this.assessments.findById(
        actor.facilityId,
        assessmentId,
      );

    if (
      assessment === null
    ) {
      throw new NursingAssessmentNotFoundError();
    }

    return assessment;
  }

  public async requireCarePlan(
    actor: NursingMedicationActorContext,
    carePlanId: string,
  ): Promise<NursingCarePlanRecord> {
    const carePlan =
      await this.care.findCarePlanById(
        actor.facilityId,
        carePlanId,
      );

    if (
      carePlan === null
    ) {
      throw new NursingCarePlanNotFoundError();
    }

    return carePlan;
  }

  public async requireTask(
    actor: NursingMedicationActorContext,
    taskId: string,
  ): Promise<NursingTaskRecord> {
    const task =
      await this.care.findTaskById(
        actor.facilityId,
        taskId,
      );

    if (
      task === null
    ) {
      throw new NursingTaskNotFoundError();
    }

    return task;
  }

  public assertExpectedVersion(
    record: Readonly<{
      version: number;
    }>,
    expectedVersion: number,
    entity:
      | 'ASSESSMENT'
      | 'CARE_PLAN'
      | 'TASK',
  ): void {
    if (
      record.version ===
      expectedVersion
    ) {
      return;
    }

    switch (
      entity
    ) {
      case 'ASSESSMENT':
        throw new NursingAssessmentConcurrencyError();

      case 'CARE_PLAN':
        throw new NursingCarePlanConcurrencyError();

      case 'TASK':
        throw new NursingTaskConcurrencyError();
    }
  }

  public async allocateNumber(
    facilityId: string,
    namespace: string,
    prefix: string,
    occurredAt: Date,
  ): Promise<NursingAllocatedNumber> {
    const sequenceKey =
      buildNursingSequenceKey(
        namespace,
        occurredAt,
      );

    const allocation =
      await this.dependencies.sequence.next(
        facilityId,
        sequenceKey,
      );

    return {
      number:
        formatNursingNumber(
          prefix,
          occurredAt,
          allocation.value,
          DEFAULT_NURSING_MEDICATION_NUMBER_WIDTH,
        ),
      sequenceKey:
        allocation.key,
      sequenceValue:
        allocation.value,
    };
  }

  public auditActorFields(
    actor: NursingMedicationActorContext,
  ): Pick<
    NursingMedicationAuditEntry,
    | 'actorUserId'
    | 'facilityId'
    | 'correlationId'
    | 'ipAddress'
    | 'userAgent'
  > {
    return {
      actorUserId:
        actor.userId,
      facilityId:
        actor.facilityId,
      correlationId:
        actor.correlationId,
      ...(
        actor.ipAddress ===
        undefined
          ? {}
          : {
              ipAddress:
                actor.ipAddress,
            }
      ),
      ...(
        actor.userAgent ===
        undefined
          ? {}
          : {
              userAgent:
                actor.userAgent,
            }
      ),
    };
  }

  public deduplicationKey(
    transactionId: string,
    action: string,
    entityId: string,
  ): string {
    return [
      transactionId,
      action,
      entityId,
    ].join(':');
  }

  public async publishMutation(
    publication: NursingMutationPublication,
  ): Promise<void> {
    await this.dependencies.audit.append({
      transactionId:
        publication.transaction.transactionId,
      deduplicationKey:
        this.deduplicationKey(
          publication.transaction.transactionId,
          publication.auditAction,
          publication.entityId,
        ),
      action:
        publication.auditAction,
      entityType:
        publication.entityType,
      entityId:
        publication.entityId,
      ...this.auditActorFields(
        publication.actor,
      ),
      occurredAt:
        publication.occurredAt,
      ...(publication.reason ===
      undefined
        ? {}
        : {
            reason:
              publication.reason,
          }),
      before:
        publication.before,
      after:
        publication.after,
      metadata: {
        admissionId:
          publication.context.admissionId,
        patientId:
          publication.context.patient.patientId,
        wardId:
          publication.context.location.wardId,
        ...(publication.metadata ?? {}),
      },
    });

    await publication.transaction.checkpoint(
      NURSING_MEDICATION_TRANSACTION_STATES.AUDIT_APPENDED,
      {
        action:
          publication.auditAction,
        entityId:
          publication.entityId,
      },
    );

    await this.dependencies.outbox.enqueue({
      transactionId:
        publication.transaction.transactionId,
      deduplicationKey:
        this.deduplicationKey(
          publication.transaction.transactionId,
          publication.outboxEventType,
          publication.entityId,
        ),
      eventType:
        publication.outboxEventType,
      aggregateType:
        publication.entityType,
      aggregateId:
        publication.entityId,
      actorUserId:
        publication.actor.userId,
      facilityId:
        publication.actor.facilityId,
      correlationId:
        publication.actor.correlationId,
      occurredAt:
        publication.occurredAt,
      payload:
        publication.eventPayload,
    });

    await publication.transaction.checkpoint(
      NURSING_MEDICATION_TRANSACTION_STATES.OUTBOX_ENQUEUED,
      {
        eventType:
          publication.outboxEventType,
        entityId:
          publication.entityId,
      },
    );

    await this.dependencies.realtime.publish({
      eventType:
        publication.realtimeEventType,
      facilityId:
        publication.context.facilityId,
      admissionId:
        publication.context.admissionId,
      patientId:
        publication.context.patient.patientId,
      wardId:
        publication.context.location.wardId,
      entityId:
        publication.entityId,
      payload:
        publication.eventPayload,
    });

    await publication.transaction.checkpoint(
      NURSING_MEDICATION_TRANSACTION_STATES.REALTIME_PUBLISHED,
      {
        eventType:
          publication.realtimeEventType,
        entityId:
          publication.entityId,
      },
    );
  }
}