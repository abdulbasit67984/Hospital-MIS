import type {
  CorrectNursingVitalObservationInput,
  EnterNursingVitalObservationInErrorInput,
  NursingObservationCommand,
  NursingObservationEntityCommand,
  NursingVitalMeasurementInput,
  NursingVitalObservationResult,
  NursingVitalTrendQuery,
} from '../nursing-observation.contracts.js';

import {
  correctNursingVitalObservationBodySchema,
  enterNursingVitalObservationInErrorBodySchema,
  nursingVitalMeasurementBodySchema,
  nursingVitalTrendQuerySchema,
} from '../nursing-observation.validation.js';

import {
  assertNursingDocumentationAllowed,
} from '../nursing-medication.lifecycle.js';

import {
  NURSING_OBSERVATION_AUDIT_ACTIONS,
  NURSING_OBSERVATION_OUTBOX_EVENTS,
  NURSING_OBSERVATION_REALTIME_EVENTS,
} from '../nursing-observation.transaction-support.js';

import {
  NursingObservationCommandService,
} from '../services/nursing-observation-command.service.js';

function escalationPriority(
  severity:
    | 'ROUTINE'
    | 'ATTENTION'
    | 'URGENT'
    | 'CRITICAL',
) {
  switch (
    severity
  ) {
    case 'CRITICAL':
      return 'CRITICAL' as const;

    case 'URGENT':
      return 'STAT' as const;

    case 'ATTENTION':
      return 'URGENT' as const;

    case 'ROUTINE':
      return 'ROUTINE' as const;
  }
}

function escalationDueAt(
  now: Date,
  severity: string,
): Date {
  const minutes =
    severity ===
    'CRITICAL'
      ? 0
      : severity ===
          'URGENT'
        ? 5
        : 15;

  return new Date(
    now.getTime() +
      minutes *
        60 *
        1_000,
  );
}

export class RecordNursingVitalObservationWorkflow {
  public constructor(
    private readonly service:
      NursingObservationCommandService,
  ) {}

  public async execute(
    command:
      NursingObservationCommand<NursingVitalMeasurementInput>,
  ): Promise<NursingVitalObservationResult> {
    const input =
      nursingVitalMeasurementBodySchema.parse(
        command.input,
      );

    const context =
      await this.service.resolveAdmission(
        command.actor,
        input.admissionId,
      );

    await this.service.support.assertAccess(
      'VITAL_RECORD',
      command.actor,
      context,
    );

    assertNursingDocumentationAllowed(
      context,

      [
        'CLINICALLY_DISCHARGED',
        'FINANCIAL_CLEARANCE_PENDING',
        'DISCHARGED',
      ].includes(
        context.admissionStatus,
      )
        ? 'LATE_ENTRY'
        : 'NEW_ENTRY',

      input.backdatedEntryReason,
    );

    const vitalSign =
      await this.service.vitalCommands.record({
        actor:
          command.actor,

        idempotencyKey:
          command.idempotencyKey,

        measurement:
          input,
      });

    const configuration =
      await this.service.thresholds.resolve(
        context.facilityId,
        context.location.wardId,
      );

    const deterioration =
      this.service.thresholds.evaluate(
        configuration,
        vitalSign,
      );

    let escalationTaskId:
      string | null = null;

    if (
      deterioration.requiresEscalation
    ) {
      const now =
        this.service.support.dependencies
          .clock.now();

      escalationTaskId =
        await this.service.escalationTasks.create({
          actor:
            command.actor,

          context,

          idempotencyKey:
            `${command.idempotencyKey}:deterioration-task`,

          vitalSignId:
            vitalSign.vitalSignId,

          evaluation:
            deterioration,

          dueAt:
            escalationDueAt(
              now,
              deterioration.severity,
            ),

          priority:
            escalationPriority(
              deterioration.severity,
            ),
        });

      const payload = {
        vitalSignId:
          vitalSign.vitalSignId,

        admissionId:
          context.admissionId,

        patientId:
          context.patient.patientId,

        wardId:
          context.location.wardId,

        escalationTaskId,

        deterioration,
      };

      await this.service.support.dependencies
        .audit.append({
          transactionId:
            `vital-escalation:${vitalSign.vitalSignId}`,

          deduplicationKey:
            `vital-escalation:${vitalSign.vitalSignId}:${configuration.configurationVersion}`,

          action:
            NURSING_OBSERVATION_AUDIT_ACTIONS
              .CRITICAL_OBSERVATION_ESCALATED,

          entityType:
            'VitalSign',

          entityId:
            vitalSign.vitalSignId,

          ...this.service.support.auditActorFields(
            command.actor,
          ),

          occurredAt:
            now,

          after:
            payload,
        });

      await this.service.support.dependencies
        .outbox.enqueue({
          transactionId:
            `vital-escalation:${vitalSign.vitalSignId}`,

          deduplicationKey:
            `vital-escalation-outbox:${vitalSign.vitalSignId}:${configuration.configurationVersion}`,

          eventType:
            NURSING_OBSERVATION_OUTBOX_EVENTS
              .CRITICAL_OBSERVATION_ESCALATED,

          aggregateType:
            'VitalSign',

          aggregateId:
            vitalSign.vitalSignId,

          actorUserId:
            command.actor.userId,

          facilityId:
            command.actor.facilityId,

          correlationId:
            command.actor.correlationId,

          occurredAt:
            now,

          payload,
        });

      await this.service.support.dependencies
        .realtime.publish({
          eventType:
            NURSING_OBSERVATION_REALTIME_EVENTS
              .CRITICAL_OBSERVATION,

          facilityId:
            context.facilityId,

          admissionId:
            context.admissionId,

          patientId:
            context.patient.patientId,

          wardId:
            context.location.wardId,

          entityId:
            vitalSign.vitalSignId,

          payload,
        });
    }

    return {
      vitalSign,
      deterioration,
      escalationTaskId,
    };
  }
}

export class CorrectNursingVitalObservationWorkflow {
  public constructor(
    private readonly service:
      NursingObservationCommandService,
  ) {}

  public async execute(
    command:
      NursingObservationEntityCommand<CorrectNursingVitalObservationInput>,
  ): Promise<NursingVitalObservationResult> {
    const input =
      correctNursingVitalObservationBodySchema.parse(
        command.input,
      );

    const context =
      await this.service.resolveAdmission(
        command.actor,
        input.admissionId,
      );

    await this.service.support.assertAccess(
      'VITAL_CORRECT',
      command.actor,
      context,
    );

    assertNursingDocumentationAllowed(
      context,
      'CORRECTION',
      input.reason,
    );

    const vitalSign =
      await this.service.vitalCommands.correct({
        actor:
          command.actor,

        idempotencyKey:
          command.idempotencyKey,

        vitalSignId:
          command.entityId,

        measurement:
          input,
      });

    const configuration =
      await this.service.thresholds.resolve(
        context.facilityId,
        context.location.wardId,
      );

    const deterioration =
      this.service.thresholds.evaluate(
        configuration,
        vitalSign,
      );

    let escalationTaskId:
      string | null = null;

    if (
      deterioration.requiresEscalation
    ) {
      const now =
        this.service.support.dependencies
          .clock.now();

      escalationTaskId =
        await this.service.escalationTasks.create({
          actor:
            command.actor,

          context,

          idempotencyKey:
            `${command.idempotencyKey}:deterioration-task`,

          vitalSignId:
            vitalSign.vitalSignId,

          evaluation:
            deterioration,

          dueAt:
            escalationDueAt(
              now,
              deterioration.severity,
            ),

          priority:
            escalationPriority(
              deterioration.severity,
            ),
        });
    }

    return {
      vitalSign,
      deterioration,
      escalationTaskId,
    };
  }
}

export class EnterNursingVitalObservationInErrorWorkflow {
  public constructor(
    private readonly service:
      NursingObservationCommandService,
  ) {}

  public async execute(
    command:
      NursingObservationEntityCommand<EnterNursingVitalObservationInErrorInput> & {
        admissionId: string;
      },
  ) {
    const input =
      enterNursingVitalObservationInErrorBodySchema.parse(
        command.input,
      );

    const context =
      await this.service.resolveAdmission(
        command.actor,
        command.admissionId,
      );

    await this.service.support.assertAccess(
      'VITAL_CORRECT',
      command.actor,
      context,
    );

    assertNursingDocumentationAllowed(
      context,
      'CORRECTION',
      input.reason,
    );

    return this.service.vitalCommands.enterInError({
      actor:
        command.actor,

      idempotencyKey:
        command.idempotencyKey,

      vitalSignId:
        command.entityId,

      change:
        input,
    });
  }
}

export class ListNursingVitalTrendWorkflow {
  public constructor(
    private readonly service:
      NursingObservationCommandService,
  ) {}

  public async execute(
    actor:
      NursingObservationCommand<unknown>['actor'],

    query:
      NursingVitalTrendQuery,
  ) {
    const parsed =
      nursingVitalTrendQuerySchema.parse(
        query,
      );

    const context =
      await this.service.resolveAdmission(
        actor,
        parsed.admissionId,
      );

    await this.service.support.assertAccess(
      'VITAL_READ',
      actor,
      context,
    );

    const configuration =
      await this.service.thresholds.resolve(
        context.facilityId,
        context.location.wardId,
      );

    const page =
      await this.service.vitalQueries.list(
        actor.facilityId,
        parsed,
      );

    return {
      ...page,

      items:
        page.items.map(
          (vitalSign) => ({
            vitalSign,

            deterioration:
              this.service.thresholds.evaluate(
                configuration,
                vitalSign,
              ),
          }),
        ),
    };
  }
}