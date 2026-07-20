import {
  createHash,
} from 'node:crypto';

import {
  Types,
} from 'mongoose';

import {
  ConflictError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import {
  assertNursingDocumentationAllowed,
  assertNursingRecordContext,
} from '../nursing-medication.lifecycle.js';

import type {
  NursingAdmissionContext,
  NursingMedicationActorContext,
} from '../nursing-medication.contracts.js';

import type {
  MedicationAdministrationCommand,
  MedicationAdministrationEntityCommand,
  MedicationAdministrationHistoryQuery,
  MedicationAdministrationView,
  MedicationComplianceQuery,
  MedicationDueBoardItem,
  MedicationDueBoardQuery,
  MedicationScheduleView,
  ChangeMedicationAdministrationScheduleStatusInput,
  CorrectMedicationAdministrationInput,
  CreateMedicationAdministrationScheduleInput,
  EnterMedicationAdministrationInErrorInput,
  RecordMedicationAdministrationInput,
} from '../medication-administration.contracts.js';

import type {
  MedicationAdministrationRecord,
  MedicationAdministrationRepositoryPort,
  MedicationScheduleRecord,
} from '../medication-administration.ports.js';

import {
  changeMedicationAdministrationScheduleStatusBodySchema,
  correctMedicationAdministrationBodySchema,
  createMedicationAdministrationScheduleBodySchema,
  enterMedicationAdministrationInErrorBodySchema,
  medicationAdministrationHistoryQuerySchema,
  medicationComplianceQuerySchema,
  medicationDueBoardQuerySchema,
  recordMedicationAdministrationBodySchema,
} from '../medication-administration.validation.js';

import type {
  NursingMedicationTransactionContext,
} from '../nursing-medication.workflow-ports.js';

import {
  NursingMedicationCommandService,
} from './nursing-medication-command.service.js';

import {
  MedicationSafetyPolicyService,
} from './medication-safety-policy.service.js';

export const MEDICATION_ADMINISTRATION_TRANSACTION_TYPES = {
  CREATE_SCHEDULE:
    'NURSING_MEDICATION_SCHEDULE_CREATE',

  CHANGE_SCHEDULE_STATUS:
    'NURSING_MEDICATION_SCHEDULE_STATUS_CHANGE',

  RECORD_DOSE:
    'NURSING_MEDICATION_DOSE_RECORD',

  CORRECT_ADMINISTRATION:
    'NURSING_MEDICATION_ADMINISTRATION_CORRECT',

  ENTER_ADMINISTRATION_IN_ERROR:
    'NURSING_MEDICATION_ADMINISTRATION_ENTERED_IN_ERROR',
} as const;

export const MEDICATION_ADMINISTRATION_AUDIT_ACTIONS = {
  SCHEDULE_CREATED:
    'nursing.medication_schedule.created',

  SCHEDULE_STATUS_CHANGED:
    'nursing.medication_schedule.status_changed',

  DOSE_RECORDED:
    'nursing.medication_administration.recorded',

  ADMINISTRATION_CORRECTED:
    'nursing.medication_administration.corrected',

  ADMINISTRATION_ENTERED_IN_ERROR:
    'nursing.medication_administration.entered_in_error',
} as const;

export const MEDICATION_ADMINISTRATION_OUTBOX_EVENTS = {
  SCHEDULE_CREATED:
    'nursing.medication_schedule.created.v1',

  SCHEDULE_STATUS_CHANGED:
    'nursing.medication_schedule.status_changed.v1',

  DOSE_RECORDED:
    'nursing.medication_administration.recorded.v1',

  ADMINISTRATION_CORRECTED:
    'nursing.medication_administration.corrected.v1',

  ADMINISTRATION_ENTERED_IN_ERROR:
    'nursing.medication_administration.entered_in_error.v1',
} as const;

const MAR_REALTIME_EVENT =
  'nursing.medication_administration_worklist.changed';

function decimal(
  value: string | null | undefined,
): Types.Decimal128 | null {
  return value == null
    ? null
    : Types.Decimal128.fromString(
        value,
      );
}

function dateOrNull(
  value: string | null | undefined,
): Date | null {
  return value == null
    ? null
    : new Date(
        value,
      );
}

function sortedUniqueDates(
  values: readonly string[],
): Date[] {
  return [
    ...new Set(
      values.map(
        (value) =>
          new Date(
            value,
          ).toISOString(),
      ),
    ),
  ]
    .map(
      (value) =>
        new Date(
          value,
        ),
    )
    .sort(
      (
        left,
        right,
      ) =>
        left.getTime() -
        right.getTime(),
    );
}

function scheduleView(
  record: MedicationScheduleRecord,
): MedicationScheduleView {
  return {
    id:
      record._id.toHexString(),

    scheduleNumber:
      record.scheduleNumber,

    admissionId:
      record.admissionId.toHexString(),

    patientId:
      record.patientId.toHexString(),

    wardId:
      record.wardId.toHexString(),

    prescriptionId:
      record.prescriptionId?.toHexString() ??
      null,

    prescriptionItemId:
      record.prescriptionItemId?.toHexString() ??
      null,

    source:
      record.source,

    medicineId:
      record.medicineId.toHexString(),

    formularyItemId:
      record.formularyItemId?.toHexString() ??
      null,

    medicineDisplay:
      record.medicineDisplay,

    prescribedDose:
      record.prescribedDose.toString(),

    doseUnitCode:
      record.doseUnitCode,

    route:
      record.route,

    frequencyCode:
      record.frequencyCode,

    scheduledTimes:
      record.scheduledTimes.map(
        (value) =>
          value.toISOString(),
      ),

    prn:
      record.prn,

    prnIndication:
      record.prnIndication,

    startAt:
      record.startAt.toISOString(),

    endAt:
      record.endAt?.toISOString() ??
      null,

    status:
      record.status,

    holdReason:
      record.holdReason,

    lastAdministrationAt:
      record.lastAdministrationAt?.toISOString() ??
      null,

    nextScheduledAt:
      record.nextScheduledAt?.toISOString() ??
      null,

    version:
      record.version,
  };
}

function administrationView(
  record: MedicationAdministrationRecord,
): MedicationAdministrationView {
  return {
    id:
      record._id.toHexString(),

    administrationNumber:
      record.administrationNumber,

    medicationScheduleId:
      record.medicationScheduleId.toHexString(),

    admissionId:
      record.admissionId.toHexString(),

    patientId:
      record.patientId.toHexString(),

    wardId:
      record.wardId.toHexString(),

    medicineId:
      record.medicineId.toHexString(),

    medicineDisplay:
      record.medicineDisplaySnapshot,

    scheduledAt:
      record.scheduledAt.toISOString(),

    status:
      record.status,

    prescribedDose:
      record.prescribedDose.toString(),

    administeredDose:
      record.administeredDose?.toString() ??
      null,

    doseUnitCode:
      record.doseUnitCode,

    prescribedRoute:
      record.prescribedRoute,

    administeredRoute:
      record.administeredRoute,

    administeredAt:
      record.administeredAt?.toISOString() ??
      null,

    administeringNurseUserId:
      record.administeringNurseUserId?.toHexString() ??
      null,

    administeringNurseStaffId:
      record.administeringNurseStaffId?.toHexString() ??
      null,

    reasonCode:
      record.reasonCode,

    delayedUntil:
      record.delayedUntil?.toISOString() ??
      null,

    correctionOfAdministrationId:
      record.correctionOfAdministrationId?.toHexString() ??
      null,

    supersededByAdministrationId:
      record.supersededByAdministrationId?.toHexString() ??
      null,

    version:
      record.version,
  };
}

function scheduleEvent(
  record: MedicationScheduleRecord,
) {
  return {
    medicationScheduleId:
      record._id.toHexString(),

    admissionId:
      record.admissionId.toHexString(),

    patientId:
      record.patientId.toHexString(),

    wardId:
      record.wardId.toHexString(),

    medicineId:
      record.medicineId.toHexString(),

    status:
      record.status,

    nextScheduledAt:
      record.nextScheduledAt?.toISOString() ??
      null,

    version:
      record.version,
  };
}

function administrationEvent(
  record: MedicationAdministrationRecord,
) {
  return {
    medicationAdministrationId:
      record._id.toHexString(),

    medicationScheduleId:
      record.medicationScheduleId.toHexString(),

    admissionId:
      record.admissionId.toHexString(),

    patientId:
      record.patientId.toHexString(),

    wardId:
      record.wardId.toHexString(),

    medicineId:
      record.medicineId.toHexString(),

    scheduledAt:
      record.scheduledAt.toISOString(),

    status:
      record.status,

    administeredAt:
      record.administeredAt?.toISOString() ??
      null,

    delayedUntil:
      record.delayedUntil?.toISOString() ??
      null,

    version:
      record.version,
  };
}

function snapshotHash(
  record: MedicationAdministrationRecord,
): string {
  return createHash(
    'sha256',
  )
    .update(
      JSON.stringify({
        id:
          record._id.toHexString(),

        version:
          record.version,

        status:
          record.status,

        scheduledAt:
          record.scheduledAt.toISOString(),

        administeredDose:
          record.administeredDose?.toString() ??
          null,

        administeredRoute:
          record.administeredRoute,

        administeredAt:
          record.administeredAt?.toISOString() ??
          null,

        delayedUntil:
          record.delayedUntil?.toISOString() ??
          null,

        supersededByAdministrationId:
          record.supersededByAdministrationId?.toHexString() ??
          null,
      }),
    )
    .digest(
      'hex',
    );
}

function deleteCreatedCompensation(
  key: string,
  collection: string,
  record: Readonly<{
    _id: Types.ObjectId;
    facilityId: Types.ObjectId;
    version?: number;
    transactionId: string;
  }>,
) {
  return {
    key,

    type:
      'nursing.record.delete_created',

    payload: {
      facilityId:
        record.facilityId.toHexString(),

      collection,

      entityId:
        record._id.toHexString(),

      expectedVersion:
        record.version ??
        null,

      transactionId:
        record.transactionId,
    },
  };
}

function restoreCompensation(
  support: NursingMedicationCommandService,
  key: string,
  collection: string,
  record: Readonly<{
    _id: Types.ObjectId;
    facilityId: Types.ObjectId;
    version: number;
    updatedBy: Types.ObjectId;
    updatedAt: Date;
  }>,
  expectedPostVersion: number,
  values: Record<string, unknown>,
  transactionId: string,
) {
  const associatedData = [
    'hospital-mis',
    'nursing-medication',
    'compensation',
    record.facilityId.toHexString(),
    collection,
    record._id.toHexString(),
    expectedPostVersion.toString(),
  ].join(':');

  const protectedValue =
    support.dependencies.snapshotCrypto.protect(
      {
        version:
          record.version,

        updatedBy:
          record.updatedBy,

        updatedAt:
          record.updatedAt,

        values,
      },
      associatedData,
    );

  return {
    key,

    type:
      'nursing.record.restore_encrypted',

    payload: {
      facilityId:
        record.facilityId.toHexString(),

      collection,

      entityId:
        record._id.toHexString(),

      expectedPostVersion,

      transactionId,

      associatedData,

      encryptedSnapshot:
        protectedValue.encryptedValue,

      snapshotHash:
        protectedValue.valueHash,
    },
  };
}

function assertScheduleTransition(
  current: MedicationScheduleRecord['status'],
  target: MedicationScheduleRecord['status'],
): void {
  const allowed:
    Record<
      MedicationScheduleRecord['status'],
      readonly MedicationScheduleRecord['status'][]
    > = {
      ACTIVE: [
        'HELD',
        'COMPLETED',
        'CANCELLED',
      ],

      HELD: [
        'ACTIVE',
        'COMPLETED',
        'CANCELLED',
      ],

      COMPLETED:
        [],

      CANCELLED:
        [],
    };

  if (
    !allowed[
      current
    ].includes(
      target,
    )
  ) {
    throw new ConflictError(
      `Medication schedule cannot transition from ${current} to ${target}`,
    );
  }
}

function isEnteredInError(
  record: MedicationAdministrationRecord,
): boolean {
  return (
    record.status ===
      'CANCELLED' &&
    record.reasonCode ===
      'ENTERED_IN_ERROR'
  );
}

export class MedicationAdministrationService {
  public constructor(
    private readonly support:
      NursingMedicationCommandService,

    private readonly repository:
      MedicationAdministrationRepositoryPort,

    private readonly safety:
      MedicationSafetyPolicyService,
  ) {}

  private async requireSchedule(
    actor: NursingMedicationActorContext,
    scheduleId: string,
  ): Promise<MedicationScheduleRecord> {
    const record =
      await this.repository.findScheduleById(
        actor.facilityId,
        scheduleId,
      );

    if (
      record == null
    ) {
      throw new ResourceNotFoundError(
        'The medication schedule was not found',
      );
    }

    return record;
  }

  private async requireAdministration(
    actor: NursingMedicationActorContext,
    administrationId: string,
  ): Promise<MedicationAdministrationRecord> {
    const record =
      await this.repository.findAdministrationById(
        actor.facilityId,
        administrationId,
      );

    if (
      record == null
    ) {
      throw new ResourceNotFoundError(
        'The medication administration was not found',
      );
    }

    return record;
  }

  private assertVersion(
    actual: number,
    expected: number,
    label: string,
  ): void {
    if (
      actual !==
      expected
    ) {
      throw new ConflictError(
        `${label} changed before the operation completed`,
      );
    }
  }

  private async nextUnrecordedTime(
    schedule: MedicationScheduleRecord,
  ): Promise<Date | null> {
    if (
      schedule.prn
    ) {
      return null;
    }

    const upper =
      schedule.endAt ??
      schedule.scheduledTimes.at(-1) ??
      schedule.startAt;

    const administrations =
      await this.repository.listCurrentAdministrationsForSchedules(
        schedule.facilityId.toHexString(),
        [
          schedule._id.toHexString(),
        ],
        schedule.startAt,
        upper,
      );

    const recorded =
      new Set(
        administrations
          .filter(
            (record) =>
              !isEnteredInError(
                record,
              ),
          )
          .map(
            (record) =>
              record.scheduledAt.toISOString(),
          ),
      );

    return schedule.scheduledTimes.find(
      (value) =>
        !recorded.has(
          value.toISOString(),
        ),
    ) ??
      null;
  }

  private async publish(
    transaction: NursingMedicationTransactionContext,
    actor: NursingMedicationActorContext,
    context: NursingAdmissionContext,
    occurredAt: Date,
    input: Readonly<{
      auditAction: string;
      outboxEventType: string;
      entityType: string;
      entityId: string;
      before: unknown;
      after: unknown;
      eventPayload: Record<string, unknown>;
      reason?: string;
      metadata?: Record<string, unknown>;
    }>,
  ): Promise<void> {
    await this.support.publishMutation({
      transaction,
      actor,
      occurredAt,
      auditAction:
        input.auditAction,
      outboxEventType:
        input.outboxEventType,
      realtimeEventType:
        MAR_REALTIME_EVENT,
      entityType:
        input.entityType,
      entityId:
        input.entityId,
      context,
      before:
        input.before,
      after:
        input.after,
      eventPayload:
        input.eventPayload,
      ...(input.reason ===
      undefined
        ? {}
        : {
            reason:
              input.reason,
          }),
      ...(input.metadata ===
      undefined
        ? {}
        : {
            metadata:
              input.metadata,
          }),
    });
  }

  public async createSchedule(
    command: MedicationAdministrationCommand<CreateMedicationAdministrationScheduleInput>,
  ): Promise<MedicationScheduleView> {
    const input =
      createMedicationAdministrationScheduleBodySchema.parse(
        command.input,
      );

    const context =
      await this.support.resolveAdmission(
        command.actor,
        input.admissionId,
      );

    await this.support.assertAccess(
      'MEDICATION_SCHEDULE_MANAGE' as never,
      command.actor,
      context,
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        MEDICATION_ADMINISTRATION_TRANSACTION_TYPES.CREATE_SCHEDULE,
      idempotencyKey:
        command.idempotencyKey,
      actorUserId:
        command.actor.userId,
      facilityId:
        command.actor.facilityId,
      correlationId:
        command.actor.correlationId,
      lockKeys: [
        `nursing:medication-schedule:${context.facilityId}:${context.admissionId}:${input.prescriptionItemId ?? input.medicineId}`,
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
        medicineId:
          input.medicineId,
        prescriptionItemId:
          input.prescriptionItemId,
      },
      execute:
        async (
          transaction,
        ) => {
          const lockedContext =
            await this.support.resolveAdmission(
              command.actor,
              input.admissionId,
            );

          await this.support.assertAccess(
            'MEDICATION_SCHEDULE_MANAGE' as never,
            command.actor,
            lockedContext,
          );

          assertNursingDocumentationAllowed(
            lockedContext,
            'NEW_ENTRY',
          );

          const occurredAt =
            this.support.dependencies.clock.now();

          const allocation =
            await this.support.allocateNumber(
              lockedContext.facilityId,
              'nursing.medication_schedule.number',
              'MSC',
              occurredAt,
            );

          const actorUserId =
            this.support.objectId(
              command.actor.userId,
              'actorUserId',
            );

          const scheduledTimes =
            sortedUniqueDates(
              input.scheduledTimes,
            );

          const created =
            await this.repository.createSchedule({
              facilityId:
                this.support.objectId(
                  lockedContext.facilityId,
                  'facilityId',
                ),
              admissionId:
                this.support.objectId(
                  lockedContext.admissionId,
                  'admissionId',
                ),
              patientId:
                this.support.objectId(
                  lockedContext.patient.patientId,
                  'patientId',
                ),
              encounterId:
                this.support.objectId(
                  lockedContext.encounterId,
                  'encounterId',
                ),
              wardId:
                this.support.objectId(
                  lockedContext.location.wardId,
                  'wardId',
                ),
              roomId:
                lockedContext.location.roomId ==
                null
                  ? null
                  : this.support.objectId(
                      lockedContext.location.roomId,
                      'roomId',
                    ),
              bedId:
                lockedContext.location.bedId ==
                null
                  ? null
                  : this.support.objectId(
                      lockedContext.location.bedId,
                      'bedId',
                    ),
              scheduleNumber:
                allocation.number,
              prescriptionId:
                input.prescriptionId ==
                null
                  ? null
                  : this.support.objectId(
                      input.prescriptionId,
                      'prescriptionId',
                    ),
              prescriptionItemId:
                input.prescriptionItemId ==
                null
                  ? null
                  : this.support.objectId(
                      input.prescriptionItemId,
                      'prescriptionItemId',
                    ),
              source:
                input.source,
              medicineId:
                this.support.objectId(
                  input.medicineId,
                  'medicineId',
                ),
              formularyItemId:
                input.formularyItemId ==
                null
                  ? null
                  : this.support.objectId(
                      input.formularyItemId,
                      'formularyItemId',
                    ),
              medicineDisplay:
                this.support.normalizedText(
                  input.medicineDisplay,
                ),
              prescribedDose:
                Types.Decimal128.fromString(
                  input.prescribedDose,
                ),
              doseUnitCode:
                this.support.normalizedCode(
                  input.doseUnitCode,
                ),
              route:
                input.route,
              frequencyCode:
                this.support.normalizedCode(
                  input.frequencyCode,
                ),
              scheduledTimes,
              prn:
                input.prn,
              prnIndication:
                this.support.nullableText(
                  input.prnIndication,
                ),
              startAt:
                new Date(
                  input.startAt,
                ),
              endAt:
                dateOrNull(
                  input.endAt,
                ),
              status:
                'ACTIVE',
              holdReason:
                null,
              orderedByUserId:
                this.support.objectId(
                  input.orderedByUserId,
                  'orderedByUserId',
                ),
              orderedByStaffId:
                this.support.objectId(
                  input.orderedByStaffId,
                  'orderedByStaffId',
                ),
              lastAdministrationAt:
                null,
              nextScheduledAt:
                input.prn
                  ? null
                  : scheduledTimes[0] ??
                    null,
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
            deleteCreatedCompensation(
              `delete-medication-schedule:${created._id.toHexString()}`,
              'medicationSchedules',
              created,
            ),
          );

          const trace =
            await this.repository.resolveOrderTrace(
              created,
            );

          if (
            !trace.valid
          ) {
            throw new ConflictError(
              trace.blockingReasons.join(
                '; ',
              ),
            );
          }

          const payload =
            scheduleEvent(
              created,
            );

          await this.publish(
            transaction,
            command.actor,
            lockedContext,
            occurredAt,
            {
              auditAction:
                MEDICATION_ADMINISTRATION_AUDIT_ACTIONS.SCHEDULE_CREATED,
              outboxEventType:
                MEDICATION_ADMINISTRATION_OUTBOX_EVENTS.SCHEDULE_CREATED,
              entityType:
                'MedicationSchedule',
              entityId:
                created._id.toHexString(),
              before:
                null,
              after:
                payload,
              eventPayload:
                payload,
              metadata: {
                highAlert:
                  trace.highAlert,
                controlledMedicine:
                  trace.controlledMedicine,
              },
            },
          );

          return scheduleView(
            created,
          );
        },
    });
  }

  public async changeScheduleStatus(
    command: MedicationAdministrationEntityCommand<ChangeMedicationAdministrationScheduleStatusInput>,
  ): Promise<MedicationScheduleView> {
    const input =
      changeMedicationAdministrationScheduleStatusBodySchema.parse(
        command.input,
      );

    const current =
      await this.requireSchedule(
        command.actor,
        command.entityId,
      );

    this.assertVersion(
      current.version,
      input.expectedVersion,
      'Medication schedule',
    );

    assertScheduleTransition(
      current.status,
      input.status,
    );

    const context =
      await this.support.resolveAdmission(
        command.actor,
        current.admissionId.toHexString(),
      );

    assertNursingRecordContext(
      context,
      current,
    );

    await this.support.assertAccess(
      'MEDICATION_SCHEDULE_MANAGE' as never,
      command.actor,
      context,
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        MEDICATION_ADMINISTRATION_TRANSACTION_TYPES.CHANGE_SCHEDULE_STATUS,
      idempotencyKey:
        command.idempotencyKey,
      actorUserId:
        command.actor.userId,
      facilityId:
        command.actor.facilityId,
      correlationId:
        command.actor.correlationId,
      lockKeys: [
        `nursing:medication-schedule:${context.facilityId}:${command.entityId}`,
      ],
      idempotencyPayload: {
        scheduleId:
          command.entityId,
        input,
      },
      journalPayload: {
        operation:
          'CHANGE_MEDICATION_SCHEDULE_STATUS',
        scheduleId:
          command.entityId,
        targetStatus:
          input.status,
        expectedVersion:
          input.expectedVersion,
      },
      execute:
        async (
          transaction,
        ) => {
          const locked =
            await this.requireSchedule(
              command.actor,
              command.entityId,
            );

          this.assertVersion(
            locked.version,
            input.expectedVersion,
            'Medication schedule',
          );

          assertScheduleTransition(
            locked.status,
            input.status,
          );

          const lockedContext =
            await this.support.resolveAdmission(
              command.actor,
              locked.admissionId.toHexString(),
            );

          assertNursingDocumentationAllowed(
            lockedContext,
            input.status ===
              'ACTIVE'
              ? 'NEW_ENTRY'
              : 'CORRECTION',
            input.reason ??
              'Medication schedule lifecycle change',
          );

          const occurredAt =
            this.support.dependencies.clock.now();

          const actorUserId =
            this.support.objectId(
              command.actor.userId,
              'actorUserId',
            );

          const nextScheduledAt =
            input.status ===
              'ACTIVE'
              ? await this.nextUnrecordedTime(
                  locked,
                )
              : null;

          const updated =
            await this.repository.updateSchedule(
              lockedContext.facilityId,
              command.entityId,
              locked.version,
              [
                locked.status,
              ],
              {
                status:
                  input.status,
                holdReason:
                  input.status ===
                    'HELD'
                    ? this.support.normalizedText(
                        input.reason!,
                      )
                    : null,
                nextScheduledAt,
                updatedBy:
                  actorUserId,
              },
            );

          if (
            updated == null
          ) {
            throw new ConflictError(
              'Medication schedule changed concurrently',
            );
          }

          await transaction.registerCompensation(
            restoreCompensation(
              this.support,
              `restore-medication-schedule:${command.entityId}`,
              'medicationSchedules',
              locked,
              locked.version +
                1,
              {
                status:
                  locked.status,
                holdReason:
                  locked.holdReason,
                nextScheduledAt:
                  locked.nextScheduledAt,
                lastAdministrationAt:
                  locked.lastAdministrationAt,
              },
              transaction.transactionId,
            ),
          );

          const before =
            scheduleEvent(
              locked,
            );

          const after =
            scheduleEvent(
              updated,
            );

          await this.publish(
            transaction,
            command.actor,
            lockedContext,
            occurredAt,
            {
              auditAction:
                MEDICATION_ADMINISTRATION_AUDIT_ACTIONS.SCHEDULE_STATUS_CHANGED,
              outboxEventType:
                MEDICATION_ADMINISTRATION_OUTBOX_EVENTS.SCHEDULE_STATUS_CHANGED,
              entityType:
                'MedicationSchedule',
              entityId:
                command.entityId,
              before,
              after,
              eventPayload:
                after,
              reason:
                input.reason ??
                undefined,
            },
          );

          return scheduleView(
            updated,
          );
        },
    });
  }

  public async recordDose(
    command: MedicationAdministrationEntityCommand<RecordMedicationAdministrationInput>,
  ): Promise<{
    administration: MedicationAdministrationView;
    schedule: MedicationScheduleView;
  }> {
    const input =
      recordMedicationAdministrationBodySchema.parse(
        command.input,
      );

    const schedule =
      await this.requireSchedule(
        command.actor,
        command.entityId,
      );

    this.assertVersion(
      schedule.version,
      input.expectedScheduleVersion,
      'Medication schedule',
    );

    const context =
      await this.support.resolveAdmission(
        command.actor,
        schedule.admissionId.toHexString(),
      );

    assertNursingRecordContext(
      context,
      schedule,
    );

    await this.support.assertAccess(
      'MEDICATION_ADMINISTER' as never,
      command.actor,
      context,
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        MEDICATION_ADMINISTRATION_TRANSACTION_TYPES.RECORD_DOSE,
      idempotencyKey:
        command.idempotencyKey,
      actorUserId:
        command.actor.userId,
      facilityId:
        command.actor.facilityId,
      correlationId:
        command.actor.correlationId,
      lockKeys: [
        `nursing:medication-dose:${context.facilityId}:${command.entityId}:${input.scheduledAt}`,
      ],
      idempotencyPayload: {
        scheduleId:
          command.entityId,
        input,
      },
      journalPayload: {
        operation:
          'RECORD_MEDICATION_DOSE',
        scheduleId:
          command.entityId,
        admissionId:
          context.admissionId,
        scheduledAt:
          input.scheduledAt,
        status:
          input.status,
      },
      execute:
        async (
          transaction,
        ) => {
          const locked =
            await this.requireSchedule(
              command.actor,
              command.entityId,
            );

          this.assertVersion(
            locked.version,
            input.expectedScheduleVersion,
            'Medication schedule',
          );

          const lockedContext =
            await this.support.resolveAdmission(
              command.actor,
              locked.admissionId.toHexString(),
            );

          assertNursingDocumentationAllowed(
            lockedContext,
            'NEW_ENTRY',
          );

          const scheduledAt =
            new Date(
              input.scheduledAt,
            );

          const duplicate =
            await this.repository.findCurrentAdministrationForDose(
              lockedContext.facilityId,
              command.entityId,
              scheduledAt,
            );

          if (
            duplicate != null &&
            !isEnteredInError(
              duplicate,
            )
          ) {
            throw new ConflictError(
              'This medication dose slot already has a recorded outcome',
            );
          }

          const delayedSource =
            await this.repository.findDelayedAdministrationByRevisedTime(
              lockedContext.facilityId,
              command.entityId,
              scheduledAt,
            );

          const orderTrace =
            await this.repository.resolveOrderTrace(
              locked,
            );

          const occurredAt =
            this.support.dependencies.clock.now();

          await this.safety.validateAdministration({
            actor:
              command.actor,
            context:
              lockedContext,
            schedule:
              locked,
            orderTrace,
            command:
              input,
            now:
              occurredAt,
            delayedSourceExists:
              delayedSource != null,
          });

          const staffId =
            await this.support.actorStaffId(
              command.actor,
            );

          const actorUserId =
            this.support.objectId(
              command.actor.userId,
              'actorUserId',
            );

          const actorStaffId =
            this.support.objectId(
              staffId,
              'staffId',
            );

          const allocation =
            await this.support.allocateNumber(
              lockedContext.facilityId,
              'nursing.medication_administration.number',
              'MAR',
              occurredAt,
            );

          const administered =
            input.status ===
            'ADMINISTERED';

          const administration =
            await this.repository.createAdministration({
              facilityId:
                locked.facilityId,
              admissionId:
                locked.admissionId,
              patientId:
                locked.patientId,
              encounterId:
                locked.encounterId,
              wardId:
                this.support.objectId(
                  lockedContext.location.wardId,
                  'wardId',
                ),
              roomId:
                lockedContext.location.roomId ==
                null
                  ? null
                  : this.support.objectId(
                      lockedContext.location.roomId,
                      'roomId',
                    ),
              bedId:
                lockedContext.location.bedId ==
                null
                  ? null
                  : this.support.objectId(
                      lockedContext.location.bedId,
                      'bedId',
                    ),
              administrationNumber:
                allocation.number,
              medicationScheduleId:
                locked._id,
              prescriptionId:
                locked.prescriptionId,
              prescriptionItemId:
                locked.prescriptionItemId,
              medicineId:
                locked.medicineId,
              medicineDisplaySnapshot:
                locked.medicineDisplay,
              scheduledAt,
              status:
                input.status,
              prescribedDose:
                locked.prescribedDose,
              administeredDose:
                administered
                  ? decimal(
                      input.administeredDose,
                    )
                  : null,
              doseUnitCode:
                locked.doseUnitCode,
              prescribedRoute:
                locked.route,
              administeredRoute:
                administered
                  ? input.administeredRoute ??
                    null
                  : null,
              administeredAt:
                administered
                  ? dateOrNull(
                      input.administeredAt,
                    ) ??
                    occurredAt
                  : null,
              administeringNurseUserId:
                administered
                  ? actorUserId
                  : null,
              administeringNurseStaffId:
                administered
                  ? actorStaffId
                  : null,
              reasonCode:
                administered &&
                input.varianceReason !=
                  null
                  ? 'VARIANCE'
                  : input.reasonCode ==
                      null
                    ? null
                    : this.support.normalizedCode(
                        input.reasonCode,
                      ),
              reason:
                this.support.nullableText(
                  input.varianceReason ??
                  input.reason,
                ),
              notes:
                this.support.nullableText(
                  input.notes,
                ),
              delayedUntil:
                input.status ===
                  'DELAYED'
                  ? new Date(
                      input.delayedUntil!,
                    )
                  : null,
              statusChangedAt:
                occurredAt,
              statusChangedBy:
                actorUserId,
              correctionOfAdministrationId:
                null,
              supersededByAdministrationId:
                null,
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
            deleteCreatedCompensation(
              `delete-medication-administration:${administration._id.toHexString()}`,
              'medicationAdministrations',
              administration,
            ),
          );

          if (
            delayedSource != null
          ) {
            const supersededDelay =
              await this.repository.updateAdministration(
                lockedContext.facilityId,
                delayedSource._id.toHexString(),
                delayedSource.version,
                {
                  supersededByAdministrationId:
                    administration._id,
                  updatedBy:
                    actorUserId,
                },
              );

            if (
              supersededDelay == null
            ) {
              throw new ConflictError(
                'The delayed dose changed concurrently',
              );
            }

            await transaction.registerCompensation(
              restoreCompensation(
                this.support,
                `restore-delayed-administration:${delayedSource._id.toHexString()}`,
                'medicationAdministrations',
                delayedSource,
                delayedSource.version +
                  1,
                {
                  supersededByAdministrationId:
                    delayedSource.supersededByAdministrationId,
                },
                transaction.transactionId,
              ),
            );
          }

          const provisionalSchedule: MedicationScheduleRecord = {
            ...locked,
            lastAdministrationAt:
              administration.status ===
              'ADMINISTERED'
                ? administration.administeredAt
                : locked.lastAdministrationAt,
          };

          const nextScheduledAt =
            administration.status ===
              'DELAYED'
              ? administration.delayedUntil
              : await this.nextUnrecordedTime(
                  provisionalSchedule,
                );

          const updatedSchedule =
            await this.repository.updateSchedule(
              lockedContext.facilityId,
              locked._id.toHexString(),
              locked.version,
              [
                'ACTIVE',
              ],
              {
                lastAdministrationAt:
                  provisionalSchedule.lastAdministrationAt,
                nextScheduledAt,
                updatedBy:
                  actorUserId,
              },
            );

          if (
            updatedSchedule == null
          ) {
            throw new ConflictError(
              'Medication schedule changed concurrently',
            );
          }

          await transaction.registerCompensation(
            restoreCompensation(
              this.support,
              `restore-medication-schedule-after-dose:${locked._id.toHexString()}`,
              'medicationSchedules',
              locked,
              locked.version +
                1,
              {
                lastAdministrationAt:
                  locked.lastAdministrationAt,
                nextScheduledAt:
                  locked.nextScheduledAt,
              },
              transaction.transactionId,
            ),
          );

          const payload =
            administrationEvent(
              administration,
            );

          await this.publish(
            transaction,
            command.actor,
            lockedContext,
            occurredAt,
            {
              auditAction:
                MEDICATION_ADMINISTRATION_AUDIT_ACTIONS.DOSE_RECORDED,
              outboxEventType:
                MEDICATION_ADMINISTRATION_OUTBOX_EVENTS.DOSE_RECORDED,
              entityType:
                'MedicationAdministration',
              entityId:
                administration._id.toHexString(),
              before:
                null,
              after:
                payload,
              eventPayload:
                payload,
              reason:
                input.reason ??
                input.varianceReason ??
                undefined,
              metadata: {
                highAlert:
                  orderTrace.highAlert,
                controlledMedicine:
                  orderTrace.controlledMedicine,
                patientIdentityConfirmed:
                  true,
                barcodeConfirmed:
                  input.medicationBarcode !=
                  null,
                independentDoubleCheck:
                  input.independentDoubleCheck ==
                  null
                    ? null
                    : {
                        performedByUserId:
                          input.independentDoubleCheck.performedByUserId,
                        performedByStaffId:
                          input.independentDoubleCheck.performedByStaffId,
                        confirmedAt:
                          input.independentDoubleCheck.confirmedAt,
                        confirmationMethod:
                          input.independentDoubleCheck.confirmationMethod,
                      },
              },
            },
          );

          return {
            administration:
              administrationView(
                administration,
              ),
            schedule:
              scheduleView(
                updatedSchedule,
              ),
          };
        },
    });
  }

  public async correctAdministration(
    command: MedicationAdministrationEntityCommand<CorrectMedicationAdministrationInput>,
  ): Promise<MedicationAdministrationView> {
    const input =
      correctMedicationAdministrationBodySchema.parse(
        command.input,
      );

    const current =
      await this.requireAdministration(
        command.actor,
        command.entityId,
      );

    this.assertVersion(
      current.version,
      input.expectedAdministrationVersion,
      'Medication administration',
    );

    if (
      current.supersededByAdministrationId !=
      null
    ) {
      throw new ConflictError(
        'A superseded medication administration cannot be corrected again',
      );
    }

    const schedule =
      await this.requireSchedule(
        command.actor,
        current.medicationScheduleId.toHexString(),
      );

    const context =
      await this.support.resolveAdmission(
        command.actor,
        current.admissionId.toHexString(),
      );

    await this.support.assertAccess(
      'MEDICATION_CORRECT' as never,
      command.actor,
      context,
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        MEDICATION_ADMINISTRATION_TRANSACTION_TYPES.CORRECT_ADMINISTRATION,
      idempotencyKey:
        command.idempotencyKey,
      actorUserId:
        command.actor.userId,
      facilityId:
        command.actor.facilityId,
      correlationId:
        command.actor.correlationId,
      lockKeys: [
        `nursing:medication-administration:${context.facilityId}:${command.entityId}`,
        `nursing:medication-schedule:${context.facilityId}:${schedule._id.toHexString()}`,
      ],
      idempotencyPayload: {
        administrationId:
          command.entityId,
        input,
      },
      journalPayload: {
        operation:
          'CORRECT_MEDICATION_ADMINISTRATION',
        administrationId:
          command.entityId,
        scheduleId:
          schedule._id.toHexString(),
        expectedAdministrationVersion:
          input.expectedAdministrationVersion,
      },
      execute:
        async (
          transaction,
        ) => {
          const locked =
            await this.requireAdministration(
              command.actor,
              command.entityId,
            );

          this.assertVersion(
            locked.version,
            input.expectedAdministrationVersion,
            'Medication administration',
          );

          if (
            locked.supersededByAdministrationId !=
            null
          ) {
            throw new ConflictError(
              'A superseded medication administration cannot be corrected again',
            );
          }

          const lockedSchedule =
            await this.requireSchedule(
              command.actor,
              locked.medicationScheduleId.toHexString(),
            );

          this.assertVersion(
            lockedSchedule.version,
            input.replacement.expectedScheduleVersion,
            'Medication schedule',
          );

          const lockedContext =
            await this.support.resolveAdmission(
              command.actor,
              locked.admissionId.toHexString(),
            );

          assertNursingDocumentationAllowed(
            lockedContext,
            'CORRECTION',
            input.reason,
          );

          if (
            new Date(
              input.replacement.scheduledAt,
            ).getTime() !==
            locked.scheduledAt.getTime()
          ) {
            throw new ConflictError(
              'Medication administration correction must retain the original dose slot',
            );
          }

          const occurredAt =
            this.support.dependencies.clock.now();

          const orderTrace =
            await this.repository.resolveOrderTrace(
              lockedSchedule,
            );

          await this.safety.validateAdministration({
            actor:
              command.actor,
            context:
              lockedContext,
            schedule: {
              ...lockedSchedule,
              status:
                'ACTIVE',
            },
            orderTrace: {
              ...orderTrace,
              valid:
                true,
              blockingReasons:
                [],
            },
            command:
              input.replacement,
            now:
              occurredAt,
            delayedSourceExists:
              false,
          });

          const staffId =
            await this.support.actorStaffId(
              command.actor,
            );

          const actorUserId =
            this.support.objectId(
              command.actor.userId,
              'actorUserId',
            );

          const actorStaffId =
            this.support.objectId(
              staffId,
              'staffId',
            );

          const allocation =
            await this.support.allocateNumber(
              lockedContext.facilityId,
              'nursing.medication_administration.number',
              'MAR',
              occurredAt,
            );

          const administered =
            input.replacement.status ===
            'ADMINISTERED';

          const replacement =
            await this.repository.createAdministration({
              facilityId:
                locked.facilityId,
              admissionId:
                locked.admissionId,
              patientId:
                locked.patientId,
              encounterId:
                locked.encounterId,
              wardId:
                this.support.objectId(
                  lockedContext.location.wardId,
                  'wardId',
                ),
              roomId:
                lockedContext.location.roomId ==
                null
                  ? null
                  : this.support.objectId(
                      lockedContext.location.roomId,
                      'roomId',
                    ),
              bedId:
                lockedContext.location.bedId ==
                null
                  ? null
                  : this.support.objectId(
                      lockedContext.location.bedId,
                      'bedId',
                    ),
              administrationNumber:
                allocation.number,
              medicationScheduleId:
                locked.medicationScheduleId,
              prescriptionId:
                locked.prescriptionId,
              prescriptionItemId:
                locked.prescriptionItemId,
              medicineId:
                locked.medicineId,
              medicineDisplaySnapshot:
                locked.medicineDisplaySnapshot,
              scheduledAt:
                locked.scheduledAt,
              status:
                input.replacement.status,
              prescribedDose:
                locked.prescribedDose,
              administeredDose:
                administered
                  ? decimal(
                      input.replacement.administeredDose,
                    )
                  : null,
              doseUnitCode:
                locked.doseUnitCode,
              prescribedRoute:
                locked.prescribedRoute,
              administeredRoute:
                administered
                  ? input.replacement.administeredRoute ??
                    null
                  : null,
              administeredAt:
                administered
                  ? dateOrNull(
                      input.replacement.administeredAt,
                    ) ??
                    occurredAt
                  : null,
              administeringNurseUserId:
                administered
                  ? actorUserId
                  : null,
              administeringNurseStaffId:
                administered
                  ? actorStaffId
                  : null,
              reasonCode:
                administered &&
                input.replacement.varianceReason !=
                  null
                  ? 'VARIANCE'
                  : input.replacement.reasonCode ==
                      null
                    ? null
                    : this.support.normalizedCode(
                        input.replacement.reasonCode,
                      ),
              reason:
                this.support.nullableText(
                  input.replacement.varianceReason ??
                  input.replacement.reason,
                ),
              notes:
                this.support.nullableText(
                  input.replacement.notes,
                ),
              delayedUntil:
                input.replacement.status ===
                  'DELAYED'
                  ? new Date(
                      input.replacement.delayedUntil!,
                    )
                  : null,
              statusChangedAt:
                occurredAt,
              statusChangedBy:
                actorUserId,
              correctionOfAdministrationId:
                locked._id,
              supersededByAdministrationId:
                null,
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
            deleteCreatedCompensation(
              `delete-medication-administration-correction:${replacement._id.toHexString()}`,
              'medicationAdministrations',
              replacement,
            ),
          );

          const updatedOriginal =
            await this.repository.updateAdministration(
              lockedContext.facilityId,
              locked._id.toHexString(),
              locked.version,
              {
                supersededByAdministrationId:
                  replacement._id,
                updatedBy:
                  actorUserId,
              },
            );

          if (
            updatedOriginal == null
          ) {
            throw new ConflictError(
              'Medication administration changed concurrently',
            );
          }

          await transaction.registerCompensation(
            restoreCompensation(
              this.support,
              `restore-corrected-medication-administration:${locked._id.toHexString()}`,
              'medicationAdministrations',
              locked,
              locked.version +
                1,
              {
                supersededByAdministrationId:
                  locked.supersededByAdministrationId,
              },
              transaction.transactionId,
            ),
          );

          const amendmentId =
            await this.repository.createAmendment({
              facilityId:
                locked.facilityId,
              admissionId:
                locked.admissionId,
              patientId:
                locked.patientId,
              encounterId:
                locked.encounterId,
              wardId:
                locked.wardId,
              roomId:
                locked.roomId,
              bedId:
                locked.bedId,
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
              medicationAdministrationId:
                locked._id,
              amendmentSequence:
                locked.version +
                1,
              amendmentType:
                'CORRECTION',
              previousStatus:
                locked.status,
              replacementAdministrationId:
                replacement._id,
              reason:
                this.support.normalizedText(
                  input.reason,
                ),
              snapshotHash:
                snapshotHash(
                  locked,
                ),
              occurredAt,
              performedByUserId:
                actorUserId,
              performedByStaffId:
                actorStaffId,
            });

          await transaction.registerCompensation({
            key:
              `delete-medication-administration-amendment:${amendmentId}`,
            type:
              'nursing.record.delete_created',
            payload: {
              facilityId:
                lockedContext.facilityId,
              collection:
                'medicationAdministrationAmendments',
              entityId:
                amendmentId,
              expectedVersion:
                null,
              transactionId:
                transaction.transactionId,
            },
          });

          const nextScheduledAt =
            replacement.status ===
              'DELAYED'
              ? replacement.delayedUntil
              : await this.nextUnrecordedTime(
                  lockedSchedule,
                );

          const updatedSchedule =
            await this.repository.updateSchedule(
              lockedContext.facilityId,
              lockedSchedule._id.toHexString(),
              lockedSchedule.version,
              [
                lockedSchedule.status,
              ],
              {
                lastAdministrationAt:
                  replacement.status ===
                  'ADMINISTERED'
                    ? replacement.administeredAt
                    : lockedSchedule.lastAdministrationAt,
                nextScheduledAt,
                updatedBy:
                  actorUserId,
              },
            );

          if (
            updatedSchedule == null
          ) {
            throw new ConflictError(
              'Medication schedule changed concurrently during correction',
            );
          }

          await transaction.registerCompensation(
            restoreCompensation(
              this.support,
              `restore-medication-schedule-after-correction:${lockedSchedule._id.toHexString()}`,
              'medicationSchedules',
              lockedSchedule,
              lockedSchedule.version +
                1,
              {
                lastAdministrationAt:
                  lockedSchedule.lastAdministrationAt,
                nextScheduledAt:
                  lockedSchedule.nextScheduledAt,
              },
              transaction.transactionId,
            ),
          );

          const before =
            administrationEvent(
              locked,
            );

          const after = {
            ...administrationEvent(
              replacement,
            ),
            correctedAdministrationId:
              locked._id.toHexString(),
            amendmentId,
          };

          await this.publish(
            transaction,
            command.actor,
            lockedContext,
            occurredAt,
            {
              auditAction:
                MEDICATION_ADMINISTRATION_AUDIT_ACTIONS.ADMINISTRATION_CORRECTED,
              outboxEventType:
                MEDICATION_ADMINISTRATION_OUTBOX_EVENTS.ADMINISTRATION_CORRECTED,
              entityType:
                'MedicationAdministration',
              entityId:
                replacement._id.toHexString(),
              before,
              after,
              eventPayload:
                after,
              reason:
                input.reason,
              metadata: {
                correctedAdministrationId:
                  locked._id.toHexString(),
                highAlert:
                  orderTrace.highAlert,
              },
            },
          );

          return administrationView(
            replacement,
          );
        },
    });
  }

  public async enterAdministrationInError(
    command: MedicationAdministrationEntityCommand<EnterMedicationAdministrationInErrorInput>,
  ): Promise<MedicationAdministrationView> {
    const input =
      enterMedicationAdministrationInErrorBodySchema.parse(
        command.input,
      );

    const current =
      await this.requireAdministration(
        command.actor,
        command.entityId,
      );

    this.assertVersion(
      current.version,
      input.expectedAdministrationVersion,
      'Medication administration',
    );

    if (
      current.supersededByAdministrationId !=
      null
    ) {
      throw new ConflictError(
        'A superseded medication administration cannot be entered in error',
      );
    }

    const context =
      await this.support.resolveAdmission(
        command.actor,
        current.admissionId.toHexString(),
      );

    await this.support.assertAccess(
      'MEDICATION_CORRECT' as never,
      command.actor,
      context,
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        MEDICATION_ADMINISTRATION_TRANSACTION_TYPES.ENTER_ADMINISTRATION_IN_ERROR,
      idempotencyKey:
        command.idempotencyKey,
      actorUserId:
        command.actor.userId,
      facilityId:
        command.actor.facilityId,
      correlationId:
        command.actor.correlationId,
      lockKeys: [
        `nursing:medication-administration:${context.facilityId}:${command.entityId}`,
      ],
      idempotencyPayload: {
        administrationId:
          command.entityId,
        input,
      },
      journalPayload: {
        operation:
          'ENTER_MEDICATION_ADMINISTRATION_IN_ERROR',
        administrationId:
          command.entityId,
        expectedVersion:
          input.expectedAdministrationVersion,
      },
      execute:
        async (
          transaction,
        ) => {
          const locked =
            await this.requireAdministration(
              command.actor,
              command.entityId,
            );

          this.assertVersion(
            locked.version,
            input.expectedAdministrationVersion,
            'Medication administration',
          );

          const lockedContext =
            await this.support.resolveAdmission(
              command.actor,
              locked.admissionId.toHexString(),
            );

          assertNursingDocumentationAllowed(
            lockedContext,
            'CORRECTION',
            input.reason,
          );

          const occurredAt =
            this.support.dependencies.clock.now();

          const staffId =
            await this.support.actorStaffId(
              command.actor,
            );

          const actorUserId =
            this.support.objectId(
              command.actor.userId,
              'actorUserId',
            );

          const actorStaffId =
            this.support.objectId(
              staffId,
              'staffId',
            );

          const updated =
            await this.repository.updateAdministration(
              lockedContext.facilityId,
              command.entityId,
              locked.version,
              {
                status:
                  'CANCELLED',
                reasonCode:
                  'ENTERED_IN_ERROR',
                reason:
                  this.support.normalizedText(
                    input.reason,
                  ),
                statusChangedAt:
                  occurredAt,
                statusChangedBy:
                  actorUserId,
                updatedBy:
                  actorUserId,
              },
            );

          if (
            updated == null
          ) {
            throw new ConflictError(
              'Medication administration changed concurrently',
            );
          }

          await transaction.registerCompensation(
            restoreCompensation(
              this.support,
              `restore-entered-error-medication-administration:${locked._id.toHexString()}`,
              'medicationAdministrations',
              locked,
              locked.version +
                1,
              {
                status:
                  locked.status,
                reasonCode:
                  locked.reasonCode,
                reason:
                  locked.reason,
                statusChangedAt:
                  locked.statusChangedAt,
                statusChangedBy:
                  locked.statusChangedBy,
              },
              transaction.transactionId,
            ),
          );

          const amendmentId =
            await this.repository.createAmendment({
              facilityId:
                locked.facilityId,
              admissionId:
                locked.admissionId,
              patientId:
                locked.patientId,
              encounterId:
                locked.encounterId,
              wardId:
                locked.wardId,
              roomId:
                locked.roomId,
              bedId:
                locked.bedId,
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
              medicationAdministrationId:
                locked._id,
              amendmentSequence:
                locked.version +
                1,
              amendmentType:
                'ENTERED_IN_ERROR',
              previousStatus:
                locked.status,
              replacementAdministrationId:
                null,
              reason:
                this.support.normalizedText(
                  input.reason,
                ),
              snapshotHash:
                snapshotHash(
                  locked,
                ),
              occurredAt,
              performedByUserId:
                actorUserId,
              performedByStaffId:
                actorStaffId,
            });

          await transaction.registerCompensation({
            key:
              `delete-medication-administration-error-amendment:${amendmentId}`,
            type:
              'nursing.record.delete_created',
            payload: {
              facilityId:
                lockedContext.facilityId,
              collection:
                'medicationAdministrationAmendments',
              entityId:
                amendmentId,
              expectedVersion:
                null,
              transactionId:
                transaction.transactionId,
            },
          });

          const schedule =
            await this.requireSchedule(
              command.actor,
              locked.medicationScheduleId.toHexString(),
            );

          const nextScheduledAt =
            await this.nextUnrecordedTime({
              ...schedule,
              nextScheduledAt:
                locked.scheduledAt,
            });

          const updatedSchedule =
            await this.repository.updateSchedule(
              lockedContext.facilityId,
              schedule._id.toHexString(),
              schedule.version,
              [
                schedule.status,
              ],
              {
                nextScheduledAt:
                  nextScheduledAt ??
                  locked.scheduledAt,
                updatedBy:
                  actorUserId,
              },
            );

          if (
            updatedSchedule == null
          ) {
            throw new ConflictError(
              'Medication schedule changed concurrently during error correction',
            );
          }

          await transaction.registerCompensation(
            restoreCompensation(
              this.support,
              `restore-medication-schedule-after-entered-error:${schedule._id.toHexString()}`,
              'medicationSchedules',
              schedule,
              schedule.version +
                1,
              {
                nextScheduledAt:
                  schedule.nextScheduledAt,
              },
              transaction.transactionId,
            ),
          );

          const before =
            administrationEvent(
              locked,
            );

          const after = {
            ...administrationEvent(
              updated,
            ),
            amendmentId,
          };

          await this.publish(
            transaction,
            command.actor,
            lockedContext,
            occurredAt,
            {
              auditAction:
                MEDICATION_ADMINISTRATION_AUDIT_ACTIONS.ADMINISTRATION_ENTERED_IN_ERROR,
              outboxEventType:
                MEDICATION_ADMINISTRATION_OUTBOX_EVENTS.ADMINISTRATION_ENTERED_IN_ERROR,
              entityType:
                'MedicationAdministration',
              entityId:
                command.entityId,
              before,
              after,
              eventPayload:
                after,
              reason:
                input.reason,
            },
          );

          return administrationView(
            updated,
          );
        },
    });
  }

  public async dueBoard(
    actor: NursingMedicationActorContext,
    query: MedicationDueBoardQuery,
  ): Promise<{
    items: MedicationDueBoardItem[];
    page: number;
    pageSize: number;
    total: number;
  }> {
    const parsed =
      medicationDueBoardQuerySchema.parse(
        query,
      );

    const schedules =
      await this.repository.listSchedulesForDueBoard(
        actor.facilityId,
        parsed,
      );

    for (
      const schedule of
      schedules
    ) {
      const context =
        await this.support.resolveAdmission(
          actor,
          schedule.admissionId.toHexString(),
        );

      await this.support.assertAccess(
        'MEDICATION_READ' as never,
        actor,
        context,
      );
    }

    if (
      schedules.length ===
      0
    ) {
      return {
        items:
          [],
        page:
          parsed.page,
        pageSize:
          parsed.pageSize,
        total:
          0,
      };
    }

    const now =
      this.support.dependencies.clock.now();

    const dueUntil =
      new Date(
        parsed.dueUntil,
      );

    const earliest =
      schedules.reduce(
        (
          value,
          schedule,
        ) =>
          schedule.startAt <
          value
            ? schedule.startAt
            : value,
        schedules[0]!.startAt,
      );

    const administrations =
      await this.repository.listCurrentAdministrationsForSchedules(
        actor.facilityId,
        schedules.map(
          (schedule) =>
            schedule._id.toHexString(),
        ),
        earliest,
        dueUntil,
      );

    const currentByDose =
      new Map<string, MedicationAdministrationRecord>();

    for (
      const record of
      administrations
    ) {
      if (
        isEnteredInError(
          record,
        )
      ) {
        continue;
      }

      currentByDose.set(
        `${record.medicationScheduleId.toHexString()}:${record.scheduledAt.toISOString()}`,
        record,
      );
    }

    const traceBySchedule =
      new Map<
        string,
        Awaited<
          ReturnType<
            MedicationAdministrationRepositoryPort['resolveOrderTrace']
          >
        >
      >();

    const items:
      MedicationDueBoardItem[] = [];

    for (
      const schedule of
      schedules
    ) {
      const scheduleId =
        schedule._id.toHexString();

      const trace =
        await this.repository.resolveOrderTrace(
          schedule,
        );

      traceBySchedule.set(
        scheduleId,
        trace,
      );

      if (
        !schedule.prn
      ) {
        for (
          const scheduledAt of
          schedule.scheduledTimes
        ) {
          if (
            scheduledAt >
            dueUntil
          ) {
            break;
          }

          const recorded =
            currentByDose.get(
              `${scheduleId}:${scheduledAt.toISOString()}`,
            ) ??
            null;

          if (
            recorded != null
          ) {
            continue;
          }

          const dueState =
            schedule.status ===
              'HELD'
              ? 'HELD'
              : scheduledAt >
                  now
                ? 'UPCOMING'
                : scheduledAt.getTime() <
                    now.getTime() -
                      60 *
                        60 *
                        1_000
                  ? 'OVERDUE'
                  : 'DUE';

          items.push({
            medicationSchedule:
              scheduleView(
                schedule,
              ),
            scheduledAt:
              scheduledAt.toISOString(),
            dueState,
            recordedAdministration:
              null,
            highAlert:
              trace.highAlert,
            controlledMedicine:
              trace.controlledMedicine,
          });
        }
      }

      for (
        const administration of
        administrations
      ) {
        if (
          administration.medicationScheduleId.toHexString() !==
            scheduleId ||
          administration.status !==
            'DELAYED' ||
          administration.delayedUntil ==
            null ||
          administration.supersededByAdministrationId !=
            null ||
          administration.delayedUntil >
            dueUntil
        ) {
          continue;
        }

        const replacement =
          currentByDose.get(
            `${scheduleId}:${administration.delayedUntil.toISOString()}`,
          );

        if (
          replacement != null
        ) {
          continue;
        }

        items.push({
          medicationSchedule:
            scheduleView(
              schedule,
            ),
          scheduledAt:
            administration.delayedUntil.toISOString(),
          dueState:
            schedule.status ===
              'HELD'
              ? 'HELD'
              : 'DELAYED_DUE',
          recordedAdministration:
            administrationView(
              administration,
            ),
          highAlert:
            trace.highAlert,
          controlledMedicine:
            trace.controlledMedicine,
        });
      }
    }

    items.sort(
      (
        left,
        right,
      ) =>
        left.scheduledAt.localeCompare(
          right.scheduledAt,
        ) ||
        left.medicationSchedule.scheduleNumber.localeCompare(
          right.medicationSchedule.scheduleNumber,
        ),
    );

    const total =
      items.length;

    const offset =
      (
        parsed.page -
        1
      ) *
      parsed.pageSize;

    return {
      items:
        items.slice(
          offset,
          offset +
            parsed.pageSize,
        ),
      page:
        parsed.page,
      pageSize:
        parsed.pageSize,
      total,
    };
  }

  public async history(
    actor: NursingMedicationActorContext,
    query: MedicationAdministrationHistoryQuery,
  ) {
    const parsed =
      medicationAdministrationHistoryQuerySchema.parse(
        query,
      );

    const context =
      await this.support.resolveAdmission(
        actor,
        parsed.admissionId,
      );

    await this.support.assertAccess(
      'MEDICATION_READ' as never,
      actor,
      context,
    );

    const result =
      await this.repository.listAdministrations(
        actor.facilityId,
        parsed,
      );

    return {
      items:
        result.items.map(
          administrationView,
        ),
      page:
        parsed.page,
      pageSize:
        parsed.pageSize,
      total:
        result.total,
    };
  }

  public async compliance(
    actor: NursingMedicationActorContext,
    query: MedicationComplianceQuery,
  ) {
    const parsed =
      medicationComplianceQuerySchema.parse(
        query,
      );

    const context =
      await this.support.resolveAdmission(
        actor,
        parsed.admissionId,
      );

    await this.support.assertAccess(
      'MEDICATION_READ' as never,
      actor,
      context,
    );

    const from =
      new Date(
        parsed.from,
      );

    const to =
      new Date(
        parsed.to,
      );

    const schedules =
      await this.repository.listSchedulesForCompliance(
        actor.facilityId,
        parsed.admissionId,
        from,
        to,
      );

    const scheduleIds =
      schedules.map(
        (record) =>
          record._id.toHexString(),
      );

    const administrations =
      await this.repository.listCurrentAdministrationsForSchedules(
        actor.facilityId,
        scheduleIds,
        from,
        to,
      );

    const currentByDose =
      new Map<string, MedicationAdministrationRecord>();

    for (
      const record of
      administrations
    ) {
      if (
        !isEnteredInError(
          record,
        )
      ) {
        currentByDose.set(
          `${record.medicationScheduleId.toHexString()}:${record.scheduledAt.toISOString()}`,
          record,
        );
      }
    }

    const counts = {
      scheduled:
        0,
      administered:
        0,
      omitted:
        0,
      refused:
        0,
      delayed:
        0,
      cancelled:
        0,
      unrecorded:
        0,
    };

    for (
      const schedule of
      schedules
    ) {
      if (
        schedule.prn
      ) {
        continue;
      }

      for (
        const scheduledAt of
        schedule.scheduledTimes
      ) {
        if (
          scheduledAt <
            from ||
          scheduledAt >
            to
        ) {
          continue;
        }

        counts.scheduled +=
          1;

        const record =
          currentByDose.get(
            `${schedule._id.toHexString()}:${scheduledAt.toISOString()}`,
          );

        if (
          record == null
        ) {
          counts.unrecorded +=
            1;
          continue;
        }

        switch (
          record.status
        ) {
          case 'ADMINISTERED':
            counts.administered +=
              1;
            break;

          case 'OMITTED':
            counts.omitted +=
              1;
            break;

          case 'REFUSED':
            counts.refused +=
              1;
            break;

          case 'DELAYED':
            counts.delayed +=
              1;
            break;

          case 'CANCELLED':
            counts.cancelled +=
              1;
            break;

          case 'SCHEDULED':
          case 'DUE':
            counts.unrecorded +=
              1;
            break;
        }
      }
    }

    const compliancePercent =
      counts.scheduled ===
      0
        ? 100
        : Number(
            (
              counts.administered /
              counts.scheduled *
              100
            ).toFixed(
              2,
            ),
          );

    return {
      ...counts,
      compliancePercent,
      from:
        from.toISOString(),
      to:
        to.toISOString(),
    };
  }
}