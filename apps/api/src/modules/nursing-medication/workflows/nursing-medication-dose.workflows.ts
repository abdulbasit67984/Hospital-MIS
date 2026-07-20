import {
  Decimal128,
} from 'mongodb';

import {
  ConflictError,
} from '@hospital-mis/shared';

import type {
  AdministerMedicationDoseInput,
  NursingMarEntityCommand,
  RecordMedicationDoseExceptionInput,
} from '../nursing-mar.contracts.js';

import {
  projectMedicationAdministration,
} from '../nursing-mar.projections.js';

import {
  administerMedicationDoseBodySchema,
  recordMedicationDoseExceptionBodySchema,
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

function assertDoseBelongsToSchedule(
  scheduledAt: Date,

  schedule: Awaited<
    ReturnType<
      NursingMarCommandService['requireSchedule']
    >
  >,
): void {
  const withinInterval =
    scheduledAt >=
      schedule.startAt &&
    (
      schedule.endAt ===
        null ||
      scheduledAt <=
        schedule.endAt
    );

  const explicitScheduledDose =
    schedule.scheduledTimes.some(
      (value) =>
        value.getTime() ===
        scheduledAt.getTime(),
    );

  if (
    !withinInterval ||
    (
      !schedule.prn &&
      !explicitScheduledDose
    )
  ) {
    throw new ConflictError(
      'The requested dose time is not part of the medication schedule',
    );
  }
}

async function assertNoCurrentDose(
  service:
    NursingMarCommandService,

  scheduleId:
    string,

  facilityId:
    string,

  scheduledAt:
    Date,
): Promise<void> {
  const current =
    await service.repository
      .findCurrentAdministrationForDose(
        facilityId,
        scheduleId,
        scheduledAt,
      );

  if (
    current !==
    null
  ) {
    throw new ConflictError(
      'A current MAR entry already exists for this scheduled dose',
    );
  }
}

export class AdministerMedicationDoseWorkflow {
  public constructor(
    private readonly service:
      NursingMarCommandService,
  ) {}

  public async execute(
    command:
      NursingMarEntityCommand<AdministerMedicationDoseInput>,
  ) {
    const input =
      administerMedicationDoseBodySchema.parse(
        command.input,
      );

    const schedule =
      await this.service.requireSchedule(
        command.actor,
        command.entityId,
      );

    this.service.assertVersion(
      schedule,
      input.expectedScheduleVersion,
      'Medication schedule',
    );

    if (
      schedule.status !==
      'ACTIVE'
    ) {
      throw new ConflictError(
        'Only an active medication schedule can be administered',
      );
    }

    const context =
      await this.service.resolveContextForSchedule(
        command.actor,
        schedule,
      );

    await this.service.support.assertAccess(
      'MEDICATION_ADMINISTER',
      command.actor,
      context,
    );

    const scheduledAt =
      new Date(
        input.scheduledAt,
      );

    assertDoseBelongsToSchedule(
      scheduledAt,
      schedule,
    );

    await assertNoCurrentDose(
      this.service,
      command.entityId,
      command.actor.facilityId,
      scheduledAt,
    );

    return this.service.support.dependencies
      .transactionManager.execute({
        transactionType:
          NURSING_MAR_TRANSACTION_TYPES.ADMINISTER_DOSE,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          `nursing:mar:dose:${context.facilityId}:${command.entityId}:${scheduledAt.toISOString()}`,
        ],

        idempotencyPayload: {
          medicationScheduleId:
            command.entityId,

          input,
        },

        journalPayload: {
          operation:
            'ADMINISTER_MEDICATION_DOSE',

          medicationScheduleId:
            command.entityId,

          scheduledAt:
            input.scheduledAt,
        },

        execute:
          async (
            transaction,
          ) => {
            const locked =
              await this.service.requireSchedule(
                command.actor,
                command.entityId,
              );

            this.service.assertVersion(
              locked,
              input.expectedScheduleVersion,
              'Medication schedule',
            );

            if (
              locked.status !==
              'ACTIVE'
            ) {
              throw new ConflictError(
                'The medication schedule is not active',
              );
            }

            const lockedContext =
              await this.service.resolveContextForSchedule(
                command.actor,
                locked,
              );

            assertNursingDocumentationAllowed(
              lockedContext,
              'NEW_ENTRY',
            );

            assertDoseBelongsToSchedule(
              scheduledAt,
              locked,
            );

            await assertNoCurrentDose(
              this.service,
              command.entityId,
              command.actor.facilityId,
              scheduledAt,
            );

            const occurredAt =
              this.service.support.dependencies
                .clock.now();

            const administeredAt =
              input.administeredAt ==
              null
                ? occurredAt
                : new Date(
                    input.administeredAt,
                  );

            if (
              administeredAt >
              occurredAt
            ) {
              throw new ConflictError(
                'Medication administration time cannot be in the future',
              );
            }

            const safety =
              await this.service.evaluateAdministrationSafety(
                lockedContext,
                locked,
                {
                  scheduledAt,

                  administeredAt,

                  administeredDose:
                    input.administeredDose,

                  administeredRoute:
                    input.administeredRoute,
                },
              );

            this.service.assertSafetyAllowed(
              safety,
            );

            const staffId =
              await this.service.support.actorStaffId(
                command.actor,
              );

            const actorUserId =
              this.service.support.objectId(
                command.actor.userId,
                'actorUserId',
              );

            const allocation =
              await this.service.support.allocateNumber(
                lockedContext.facilityId,
                'inpatient.medication_administration.number',
                'MAR-ADM',
                occurredAt,
              );

            const administration =
              await this.service.repository.createAdministration({
                facilityId:
                  locked.facilityId,

                admissionId:
                  locked.admissionId,

                patientId:
                  locked.patientId,

                encounterId:
                  locked.encounterId,

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
                  'ADMINISTERED',

                prescribedDose:
                  locked.prescribedDose,

                administeredDose:
                  Decimal128.fromString(
                    input.administeredDose,
                  ),

                doseUnitCode:
                  locked.doseUnitCode,

                prescribedRoute:
                  locked.route,

                administeredRoute:
                  input.administeredRoute,

                administeredAt,

                administeringNurseUserId:
                  actorUserId,

                administeringNurseStaffId:
                  this.service.support.objectId(
                    staffId,
                    'staffId',
                  ),

                reasonCode:
                  null,

                reason:
                  null,

                notes:
                  this.service.support.nullableText(
                    input.notes,
                  ),

                delayedUntil:
                  null,

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
              deleteCreatedMarRecord(
                `delete-mar-administration:${administration._id.toHexString()}`,
                {
                  facilityId:
                    lockedContext.facilityId,

                  collection:
                    'medicationAdministrations',

                  entityId:
                    administration._id.toHexString(),

                  expectedVersion:
                    0,

                  transactionId:
                    transaction.transactionId,
                },
              ),
            );

            const derived =
              await this.service.repository.deriveScheduleState(
                lockedContext.facilityId,
                command.entityId,
                occurredAt,
              );

            const updatedSchedule =
              await this.service.repository.updateSchedule(
                lockedContext.facilityId,
                command.entityId,
                locked.version,
                [
                  'ACTIVE',
                ],
                {
                  ...derived,

                  updatedBy:
                    actorUserId,
                },
              );

            if (
              updatedSchedule ===
              null
            ) {
              throw new ConflictError(
                'Medication schedule changed before dose administration completed',
              );
            }

            await transaction.registerCompensation(
              restoreMedicationScheduleCompensation(
                this.service.support.dependencies
                  .snapshotCrypto,

                locked,

                locked.version + 1,

                transaction.transactionId,
              ),
            );

            const payload = {
              ...this.service.administrationEventPayload(
                administration,
              ),

              safety: {
                rightPatient:
                  safety.rightPatient,

                rightMedicine:
                  safety.rightMedicine,

                rightDose:
                  safety.rightDose,

                rightRoute:
                  safety.rightRoute,

                rightTime:
                  safety.rightTime,

                warningCodes:
                  safety.findings
                    .filter(
                      (item) =>
                        item.severity ===
                        'WARNING',
                    )
                    .map(
                      (item) =>
                        item.code,
                    ),
              },
            };

            await this.service.support.publishMutation({
              transaction,

              actor:
                command.actor,

              occurredAt,

              auditAction:
                NURSING_MAR_AUDIT_ACTIONS.DOSE_ADMINISTERED,

              outboxEventType:
                NURSING_MAR_OUTBOX_EVENTS.DOSE_ADMINISTERED,

              realtimeEventType:
                NURSING_MAR_REALTIME_EVENTS.DUE_DOSE_WORKLIST_CHANGED,

              entityType:
                'MedicationAdministration',

              entityId:
                administration._id.toHexString(),

              context:
                lockedContext,

              before:
                null,

              after:
                payload,

              eventPayload:
                payload,
            });

            return {
              administration:
                projectMedicationAdministration(
                  administration,
                ),

              safety,
            };
          },
      });
  }
}

export class RecordMedicationDoseExceptionWorkflow {
  public constructor(
    private readonly service:
      NursingMarCommandService,
  ) {}

  public async execute(
    command:
      NursingMarEntityCommand<RecordMedicationDoseExceptionInput>,
  ) {
    const input =
      recordMedicationDoseExceptionBodySchema.parse(
        command.input,
      );

    const schedule =
      await this.service.requireSchedule(
        command.actor,
        command.entityId,
      );

    this.service.assertVersion(
      schedule,
      input.expectedScheduleVersion,
      'Medication schedule',
    );

    if (
      schedule.status !==
      'ACTIVE'
    ) {
      throw new ConflictError(
        'Dose exceptions require an active medication schedule',
      );
    }

    const context =
      await this.service.resolveContextForSchedule(
        command.actor,
        schedule,
      );

    await this.service.support.assertAccess(
      'MEDICATION_ADMINISTER',
      command.actor,
      context,
    );

    const scheduledAt =
      new Date(
        input.scheduledAt,
      );

    assertDoseBelongsToSchedule(
      scheduledAt,
      schedule,
    );

    return this.service.support.dependencies
      .transactionManager.execute({
        transactionType:
          NURSING_MAR_TRANSACTION_TYPES.RECORD_DOSE_EXCEPTION,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          `nursing:mar:dose:${context.facilityId}:${command.entityId}:${scheduledAt.toISOString()}`,
        ],

        idempotencyPayload: {
          medicationScheduleId:
            command.entityId,

          input,
        },

        journalPayload: {
          operation:
            'RECORD_MEDICATION_DOSE_EXCEPTION',

          medicationScheduleId:
            command.entityId,

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
              await this.service.requireSchedule(
                command.actor,
                command.entityId,
              );

            this.service.assertVersion(
              locked,
              input.expectedScheduleVersion,
              'Medication schedule',
            );

            const lockedContext =
              await this.service.resolveContextForSchedule(
                command.actor,
                locked,
              );

            assertNursingDocumentationAllowed(
              lockedContext,
              'NEW_ENTRY',
            );

            assertDoseBelongsToSchedule(
              scheduledAt,
              locked,
            );

            await assertNoCurrentDose(
              this.service,
              command.entityId,
              command.actor.facilityId,
              scheduledAt,
            );

            const occurredAt =
              this.service.support.dependencies
                .clock.now();

            const actorUserId =
              this.service.support.objectId(
                command.actor.userId,
                'actorUserId',
              );

            const allocation =
              await this.service.support.allocateNumber(
                lockedContext.facilityId,
                'inpatient.medication_administration.number',
                'MAR-ADM',
                occurredAt,
              );

            const administration =
              await this.service.repository.createAdministration({
                facilityId:
                  locked.facilityId,

                admissionId:
                  locked.admissionId,

                patientId:
                  locked.patientId,

                encounterId:
                  locked.encounterId,

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
                  null,

                doseUnitCode:
                  locked.doseUnitCode,

                prescribedRoute:
                  locked.route,

                administeredRoute:
                  null,

                administeredAt:
                  null,

                administeringNurseUserId:
                  null,

                administeringNurseStaffId:
                  null,

                reasonCode:
                  this.service.support.normalizedCode(
                    input.reasonCode,
                  ),

                reason:
                  this.service.support.normalizedText(
                    input.reason,
                  ),

                notes:
                  this.service.support.nullableText(
                    input.notes,
                  ),

                delayedUntil:
                  input.delayedUntil ==
                  null
                    ? null
                    : new Date(
                        input.delayedUntil,
                      ),

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
              deleteCreatedMarRecord(
                `delete-mar-dose-exception:${administration._id.toHexString()}`,
                {
                  facilityId:
                    lockedContext.facilityId,

                  collection:
                    'medicationAdministrations',

                  entityId:
                    administration._id.toHexString(),

                  expectedVersion:
                    0,

                  transactionId:
                    transaction.transactionId,
                },
              ),
            );

            const derived =
              await this.service.repository.deriveScheduleState(
                lockedContext.facilityId,
                command.entityId,
                occurredAt,
              );

            const updatedSchedule =
              await this.service.repository.updateSchedule(
                lockedContext.facilityId,
                command.entityId,
                locked.version,
                [
                  'ACTIVE',
                ],
                {
                  ...derived,

                  updatedBy:
                    actorUserId,
                },
              );

            if (
              updatedSchedule ===
              null
            ) {
              throw new ConflictError(
                'Medication schedule changed before the dose exception completed',
              );
            }

            await transaction.registerCompensation(
              restoreMedicationScheduleCompensation(
                this.service.support.dependencies
                  .snapshotCrypto,

                locked,

                locked.version + 1,

                transaction.transactionId,
              ),
            );

            const payload =
              this.service.administrationEventPayload(
                administration,
              );

            await this.service.support.publishMutation({
              transaction,

              actor:
                command.actor,

              occurredAt,

              auditAction:
                NURSING_MAR_AUDIT_ACTIONS.DOSE_EXCEPTION_RECORDED,

              outboxEventType:
                NURSING_MAR_OUTBOX_EVENTS.DOSE_EXCEPTION_RECORDED,

              realtimeEventType:
                NURSING_MAR_REALTIME_EVENTS.DUE_DOSE_WORKLIST_CHANGED,

              entityType:
                'MedicationAdministration',

              entityId:
                administration._id.toHexString(),

              context:
                lockedContext,

              before:
                null,

              after:
                payload,

              eventPayload:
                payload,

              reason:
                input.reason,
            });

            return projectMedicationAdministration(
              administration,
            );
          },
      });
  }
}