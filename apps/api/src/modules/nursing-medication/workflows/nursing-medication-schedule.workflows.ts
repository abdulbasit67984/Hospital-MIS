import {
  Decimal128,
} from 'mongodb';

import {
  ConflictError,
} from '@hospital-mis/shared';

import type {
  CancelMedicationScheduleInput,
  CompleteMedicationScheduleInput,
  CreateMedicationScheduleInput,
  HoldMedicationScheduleInput,
  NursingMarCommand,
  NursingMarEntityCommand,
  ResumeMedicationScheduleInput,
} from '../nursing-mar.contracts.js';

import {
  projectMedicationSchedule,
} from '../nursing-mar.projections.js';

import {
  cancelMedicationScheduleBodySchema,
  completeMedicationScheduleBodySchema,
  createMedicationScheduleBodySchema,
  holdMedicationScheduleBodySchema,
  resumeMedicationScheduleBodySchema,
} from '../nursing-mar.validation.js';

import {
  deleteCreatedMarRecord,
  NURSING_MAR_AUDIT_ACTIONS,
  NURSING_MAR_OUTBOX_EVENTS,
  NURSING_MAR_REALTIME_EVENTS,
  NURSING_MAR_TRANSACTION_TYPES,
  restoreMedicationScheduleCompensation,
} from '../nursing-mar.transaction-support.js';

import {
  assertNursingDocumentationAllowed,
} from '../nursing-medication.lifecycle.js';

import {
  NursingMarCommandService,
} from '../services/nursing-mar-command.service.js';

function nextScheduledTime(
  scheduledTimes: readonly Date[],
  from: Date,
): Date | null {
  return [
    ...scheduledTimes,
  ]
    .filter(
      (value) =>
        value >= from,
    )
    .sort(
      (left, right) =>
        left.getTime() -
        right.getTime(),
    )[0] ?? null;
}

export class CreateMedicationScheduleWorkflow {
  public constructor(
    private readonly service:
      NursingMarCommandService,
  ) {}

  public async execute(
    command:
      NursingMarCommand<CreateMedicationScheduleInput>,
  ) {
    const input =
      createMedicationScheduleBodySchema.parse(
        command.input,
      );

    const context =
      await this.service.support.resolveAdmission(
        command.actor,
        input.admissionId,
      );

    await this.service.support.assertAccess(
      'MEDICATION_ADMINISTER',
      command.actor,
      context,
    );

    let orderTrace =
      input.prescriptionId ==
        null ||
      input.prescriptionItemId ==
        null
        ? null
        : await this.service.orders.findOrderTrace(
            command.actor.facilityId,
            input.prescriptionId,
            input.prescriptionItemId,
          );

    if (
      input.source ===
        'PRESCRIPTION' &&
      orderTrace ===
        null
    ) {
      throw new ConflictError(
        'The prescription item could not be resolved for MAR scheduling',
      );
    }

    if (
      orderTrace !==
        null &&
      (
        orderTrace.patientId !==
          context.patient.patientId ||
        orderTrace.encounterId !==
          context.encounterId ||
        ![
          'ISSUED',
          'PARTIALLY_DISPENSED',
          'DISPENSED',
        ].includes(
          orderTrace.prescriptionStatus,
        ) ||
        orderTrace.prescriptionItemStatus !==
          'ACTIVE'
      )
    ) {
      throw new ConflictError(
        'The prescription item is not active for this patient admission',
      );
    }

    if (
      input.prescriptionItemId !=
      null
    ) {
      const existing =
        await this.service.repository
          .findActiveScheduleForPrescriptionItem(
            command.actor.facilityId,
            input.admissionId,
            input.prescriptionItemId,
          );

      if (
        existing !==
        null
      ) {
        throw new ConflictError(
          'An active or held MAR schedule already exists for this prescription item',
        );
      }
    }

    return this.service.support.dependencies
      .transactionManager.execute({
        transactionType:
          NURSING_MAR_TRANSACTION_TYPES.CREATE_SCHEDULE,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          `nursing:mar:schedule:${context.facilityId}:${context.admissionId}:${input.prescriptionItemId ?? input.medicineId}`,
        ],

        idempotencyPayload: {
          facilityId:
            command.actor.facilityId,

          input,
        },

        journalPayload: {
          operation:
            'CREATE_MEDICATION_SCHEDULE',

          admissionId:
            context.admissionId,

          prescriptionItemId:
            input.prescriptionItemId,

          source:
            input.source,
        },

        execute:
          async (
            transaction,
          ) => {
            const lockedContext =
              await this.service.support.resolveAdmission(
                command.actor,
                input.admissionId,
              );

            await this.service.support.assertAccess(
              'MEDICATION_ADMINISTER',
              command.actor,
              lockedContext,
            );

            assertNursingDocumentationAllowed(
              lockedContext,
              'NEW_ENTRY',
            );

            if (
              input.prescriptionItemId !=
              null
            ) {
              const duplicate =
                await this.service.repository
                  .findActiveScheduleForPrescriptionItem(
                    command.actor.facilityId,
                    input.admissionId,
                    input.prescriptionItemId,
                  );

              if (
                duplicate !==
                null
              ) {
                throw new ConflictError(
                  'An active or held MAR schedule already exists for this prescription item',
                );
              }
            }

            orderTrace =
              input.prescriptionId ==
                null ||
              input.prescriptionItemId ==
                null
                ? null
                : await this.service.orders.findOrderTrace(
                    command.actor.facilityId,
                    input.prescriptionId,
                    input.prescriptionItemId,
                  );

            const occurredAt =
              this.service.support.dependencies
                .clock.now();

            const allocation =
              await this.service.support.allocateNumber(
                lockedContext.facilityId,
                'inpatient.medication_schedule.number',
                'MAR-SCH',
                occurredAt,
              );

            const scheduledTimes =
              input.scheduledTimes
                .map(
                  (value) =>
                    new Date(value),
                )
                .sort(
                  (left, right) =>
                    left.getTime() -
                    right.getTime(),
                );

            const actorUserId =
              this.service.support.objectId(
                command.actor.userId,
                'actorUserId',
              );

            const medicineId =
              orderTrace?.medicineId ??
              input.medicineId!;

            const formularyItemId =
              orderTrace?.formularyItemId ??
              input.formularyItemId ??
              null;

            const created =
              await this.service.repository.createSchedule({
                facilityId:
                  this.service.support.objectId(
                    lockedContext.facilityId,
                    'facilityId',
                  ),

                admissionId:
                  this.service.support.objectId(
                    lockedContext.admissionId,
                    'admissionId',
                  ),

                patientId:
                  this.service.support.objectId(
                    lockedContext.patient.patientId,
                    'patientId',
                  ),

                encounterId:
                  this.service.support.objectId(
                    lockedContext.encounterId,
                    'encounterId',
                  ),

                wardId:
                  this.service.support.objectId(
                    lockedContext.location.wardId,
                    'wardId',
                  ),

                roomId:
                  lockedContext.location.roomId ==
                  null
                    ? null
                    : this.service.support.objectId(
                        lockedContext.location.roomId,
                        'roomId',
                      ),

                bedId:
                  lockedContext.location.bedId ==
                  null
                    ? null
                    : this.service.support.objectId(
                        lockedContext.location.bedId,
                        'bedId',
                      ),

                scheduleNumber:
                  allocation.number,

                prescriptionId:
                  input.prescriptionId ==
                  null
                    ? null
                    : this.service.support.objectId(
                        input.prescriptionId,
                        'prescriptionId',
                      ),

                prescriptionItemId:
                  input.prescriptionItemId ==
                  null
                    ? null
                    : this.service.support.objectId(
                        input.prescriptionItemId,
                        'prescriptionItemId',
                      ),

                source:
                  input.source,

                medicineId:
                  this.service.support.objectId(
                    medicineId,
                    'medicineId',
                  ),

                formularyItemId:
                  formularyItemId ==
                  null
                    ? null
                    : this.service.support.objectId(
                        formularyItemId,
                        'formularyItemId',
                      ),

                medicineDisplay:
                  this.service.support.normalizedText(
                    orderTrace?.medicineDisplay ??
                    input.medicineDisplay!,
                  ),

                prescribedDose:
                  Decimal128.fromString(
                    orderTrace?.prescribedDose ??
                    input.prescribedDose!,
                  ),

                doseUnitCode:
                  this.service.support.normalizedCode(
                    orderTrace?.doseUnitCode ??
                    input.doseUnitCode!,
                  ),

                route:
                  orderTrace?.prescribedRoute ??
                  input.route!,

                frequencyCode:
                  this.service.support.normalizedCode(
                    orderTrace?.frequencyCode ??
                    input.frequencyCode!,
                  ),

                scheduledTimes,

                prn:
                  orderTrace?.asNeeded ??
                  input.prn,

                prnIndication:
                  this.service.support.nullableText(
                    orderTrace?.asNeededReason ??
                    input.prnIndication,
                  ),

                startAt:
                  new Date(
                    input.startAt,
                  ),

                endAt:
                  input.endAt ==
                  null
                    ? null
                    : new Date(
                        input.endAt,
                      ),

                status:
                  'ACTIVE',

                holdReason:
                  null,

                orderedByUserId:
                  this.service.support.objectId(
                    orderTrace?.orderedByUserId ??
                    input.orderedByUserId!,
                    'orderedByUserId',
                  ),

                orderedByStaffId:
                  this.service.support.objectId(
                    orderTrace?.orderedByStaffId ??
                    input.orderedByStaffId!,
                    'orderedByStaffId',
                  ),

                lastAdministrationAt:
                  null,

                nextScheduledAt:
                  nextScheduledTime(
                    scheduledTimes,
                    occurredAt,
                  ),

                transactionId:
                  transaction.transactionId,

                correlationId:
                  command.actor.correlationId,

                schemaVersion:
                  1,

                version:
                  0,

                createdBy:
                  actorUserId,

                updatedBy:
                  actorUserId,
              });

            await transaction.registerCompensation(
              deleteCreatedMarRecord(
                `delete-mar-schedule:${created._id.toHexString()}`,
                {
                  facilityId:
                    lockedContext.facilityId,

                  collection:
                    'medicationSchedules',

                  entityId:
                    created._id.toHexString(),

                  expectedVersion:
                    0,

                  transactionId:
                    transaction.transactionId,
                },
              ),
            );

            const payload =
              this.service.scheduleEventPayload(
                created,
              );

            await this.service.support.publishMutation({
              transaction,

              actor:
                command.actor,

              occurredAt,

              auditAction:
                NURSING_MAR_AUDIT_ACTIONS.SCHEDULE_CREATED,

              outboxEventType:
                NURSING_MAR_OUTBOX_EVENTS.SCHEDULE_CREATED,

              realtimeEventType:
                NURSING_MAR_REALTIME_EVENTS.SCHEDULE_WORKLIST_CHANGED,

              entityType:
                'MedicationSchedule',

              entityId:
                created._id.toHexString(),

              context:
                lockedContext,

              before:
                null,

              after:
                payload,

              eventPayload:
                payload,
            });

            return projectMedicationSchedule(
              created,
            );
          },
      });
  }
}

type ScheduleLifecycleInput =
  | HoldMedicationScheduleInput
  | ResumeMedicationScheduleInput
  | CompleteMedicationScheduleInput
  | CancelMedicationScheduleInput;

interface ScheduleLifecycleDefinition {
  transactionType: string;
  auditAction: string;
  outboxEvent: string;

  targetStatus:
    | 'ACTIVE'
    | 'HELD'
    | 'COMPLETED'
    | 'CANCELLED';

  allowedStatuses: readonly (
    | 'ACTIVE'
    | 'HELD'
    | 'COMPLETED'
    | 'CANCELLED'
  )[];
}

async function mutateScheduleLifecycle(
  service:
    NursingMarCommandService,

  command:
    NursingMarEntityCommand<ScheduleLifecycleInput>,

  definition:
    ScheduleLifecycleDefinition,

  updateFactory: (
    input: ScheduleLifecycleInput,
    occurredAt: Date,
    actorUserId: ReturnType<
      NursingMarCommandService['support']['objectId']
    >,
    schedule: Awaited<
      ReturnType<
        NursingMarCommandService['requireSchedule']
      >
    >,
  ) => Record<string, unknown>,
) {
  const current =
    await service.requireSchedule(
      command.actor,
      command.entityId,
    );

  const expectedVersion =
    command.input.expectedVersion;

  service.assertVersion(
    current,
    expectedVersion,
    'Medication schedule',
  );

  if (
    !definition.allowedStatuses.includes(
      current.status,
    )
  ) {
    throw new ConflictError(
      `Medication schedule cannot transition from ${current.status} to ${definition.targetStatus}`,
    );
  }

  const context =
    await service.resolveContextForSchedule(
      command.actor,
      current,
    );

  await service.support.assertAccess(
    'MEDICATION_ADMINISTER',
    command.actor,
    context,
  );

  const reason =
    'reason' in
      command.input
      ? command.input.reason
      : 'Medication schedule lifecycle update';

  return service.support.dependencies
    .transactionManager.execute({
      transactionType:
        definition.transactionType,

      idempotencyKey:
        command.idempotencyKey,

      actorUserId:
        command.actor.userId,

      facilityId:
        command.actor.facilityId,

      correlationId:
        command.actor.correlationId,

      lockKeys: [
        `nursing:mar:schedule:${context.facilityId}:${command.entityId}`,
      ],

      idempotencyPayload: {
        scheduleId:
          command.entityId,

        input:
          command.input,
      },

      journalPayload: {
        operation:
          definition.transactionType,

        scheduleId:
          command.entityId,

        targetStatus:
          definition.targetStatus,

        expectedVersion,
      },

      execute:
        async (
          transaction,
        ) => {
          const locked =
            await service.requireSchedule(
              command.actor,
              command.entityId,
            );

          service.assertVersion(
            locked,
            expectedVersion,
            'Medication schedule',
          );

          const lockedContext =
            await service.resolveContextForSchedule(
              command.actor,
              locked,
            );

          assertNursingDocumentationAllowed(
            lockedContext,

            definition.targetStatus ===
              'ACTIVE'
              ? 'NEW_ENTRY'
              : 'CORRECTION',

            reason,
          );

          const occurredAt =
            service.support.dependencies
              .clock.now();

          const actorUserId =
            service.support.objectId(
              command.actor.userId,
              'actorUserId',
            );

          const updated =
            await service.repository.updateSchedule(
              lockedContext.facilityId,
              command.entityId,
              locked.version,
              definition.allowedStatuses,
              {
                status:
                  definition.targetStatus,

                ...updateFactory(
                  command.input,
                  occurredAt,
                  actorUserId,
                  locked,
                ),

                updatedBy:
                  actorUserId,
              },
            );

          if (
            updated ===
            null
          ) {
            throw new ConflictError(
              'Medication schedule changed before the lifecycle update completed',
            );
          }

          await transaction.registerCompensation(
            restoreMedicationScheduleCompensation(
              service.support.dependencies
                .snapshotCrypto,

              locked,

              locked.version + 1,

              transaction.transactionId,
            ),
          );

          const before =
            service.scheduleEventPayload(
              locked,
            );

          const after =
            service.scheduleEventPayload(
              updated,
            );

          await service.support.publishMutation({
            transaction,

            actor:
              command.actor,

            occurredAt,

            auditAction:
              definition.auditAction,

            outboxEventType:
              definition.outboxEvent,

            realtimeEventType:
              NURSING_MAR_REALTIME_EVENTS.SCHEDULE_WORKLIST_CHANGED,

            entityType:
              'MedicationSchedule',

            entityId:
              command.entityId,

            context:
              lockedContext,

            before,

            after,

            eventPayload:
              after,

            ...(
              'reason' in
              command.input
                ? {
                    reason:
                      command.input.reason,
                  }
                : {}
            ),
          });

          return projectMedicationSchedule(
            updated,
          );
        },
    });
}

export class HoldMedicationScheduleWorkflow {
  public constructor(
    private readonly service:
      NursingMarCommandService,
  ) {}

  public async execute(
    command:
      NursingMarEntityCommand<HoldMedicationScheduleInput>,
  ) {
    const input =
      holdMedicationScheduleBodySchema.parse(
        command.input,
      );

    return mutateScheduleLifecycle(
      this.service,

      {
        ...command,
        input,
      },

      {
        transactionType:
          NURSING_MAR_TRANSACTION_TYPES.HOLD_SCHEDULE,

        auditAction:
          NURSING_MAR_AUDIT_ACTIONS.SCHEDULE_HELD,

        outboxEvent:
          NURSING_MAR_OUTBOX_EVENTS.SCHEDULE_HELD,

        targetStatus:
          'HELD',

        allowedStatuses: [
          'ACTIVE',
        ],
      },

      (value) => ({
        holdReason:
          this.service.support.normalizedText(
            (
              value as HoldMedicationScheduleInput
            ).reason,
          ),

        nextScheduledAt:
          null,
      }),
    );
  }
}

export class ResumeMedicationScheduleWorkflow {
  public constructor(
    private readonly service:
      NursingMarCommandService,
  ) {}

  public async execute(
    command:
      NursingMarEntityCommand<ResumeMedicationScheduleInput>,
  ) {
    const input =
      resumeMedicationScheduleBodySchema.parse(
        command.input,
      );

    return mutateScheduleLifecycle(
      this.service,

      {
        ...command,
        input,
      },

      {
        transactionType:
          NURSING_MAR_TRANSACTION_TYPES.RESUME_SCHEDULE,

        auditAction:
          NURSING_MAR_AUDIT_ACTIONS.SCHEDULE_RESUMED,

        outboxEvent:
          NURSING_MAR_OUTBOX_EVENTS.SCHEDULE_RESUMED,

        targetStatus:
          'ACTIVE',

        allowedStatuses: [
          'HELD',
        ],
      },

      (
        value,
        occurredAt,
        _actorUserId,
        schedule,
      ) => ({
        holdReason:
          null,

        nextScheduledAt:
          (
            value as ResumeMedicationScheduleInput
          ).nextScheduledAt ==
          null
            ? nextScheduledTime(
                schedule.scheduledTimes,
                occurredAt,
              )
            : new Date(
                (
                  value as ResumeMedicationScheduleInput
                ).nextScheduledAt!,
              ),
      }),
    );
  }
}

export class CompleteMedicationScheduleWorkflow {
  public constructor(
    private readonly service:
      NursingMarCommandService,
  ) {}

  public async execute(
    command:
      NursingMarEntityCommand<CompleteMedicationScheduleInput>,
  ) {
    const input =
      completeMedicationScheduleBodySchema.parse(
        command.input,
      );

    return mutateScheduleLifecycle(
      this.service,

      {
        ...command,
        input,
      },

      {
        transactionType:
          NURSING_MAR_TRANSACTION_TYPES.COMPLETE_SCHEDULE,

        auditAction:
          NURSING_MAR_AUDIT_ACTIONS.SCHEDULE_COMPLETED,

        outboxEvent:
          NURSING_MAR_OUTBOX_EVENTS.SCHEDULE_COMPLETED,

        targetStatus:
          'COMPLETED',

        allowedStatuses: [
          'ACTIVE',
          'HELD',
        ],
      },

      (
        value,
        occurredAt,
      ) => ({
        endAt:
          (
            value as CompleteMedicationScheduleInput
          ).completedAt ==
          null
            ? occurredAt
            : new Date(
                (
                  value as CompleteMedicationScheduleInput
                ).completedAt!,
              ),

        holdReason:
          null,

        nextScheduledAt:
          null,
      }),
    );
  }
}

export class CancelMedicationScheduleWorkflow {
  public constructor(
    private readonly service:
      NursingMarCommandService,
  ) {}

  public async execute(
    command:
      NursingMarEntityCommand<CancelMedicationScheduleInput>,
  ) {
    const input =
      cancelMedicationScheduleBodySchema.parse(
        command.input,
      );

    return mutateScheduleLifecycle(
      this.service,

      {
        ...command,
        input,
      },

      {
        transactionType:
          NURSING_MAR_TRANSACTION_TYPES.CANCEL_SCHEDULE,

        auditAction:
          NURSING_MAR_AUDIT_ACTIONS.SCHEDULE_CANCELLED,

        outboxEvent:
          NURSING_MAR_OUTBOX_EVENTS.SCHEDULE_CANCELLED,

        targetStatus:
          'CANCELLED',

        allowedStatuses: [
          'ACTIVE',
          'HELD',
        ],
      },

      (
        value,
        occurredAt,
      ) => ({
        holdReason:
          this.service.support.normalizedText(
            (
              value as CancelMedicationScheduleInput
            ).reason,
          ),

        endAt:
          occurredAt,

        nextScheduledAt:
          null,
      }),
    );
  }
}