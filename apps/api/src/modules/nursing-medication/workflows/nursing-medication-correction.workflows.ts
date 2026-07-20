import {
  createHash,
} from 'node:crypto';

import {
  Decimal128,
} from 'mongodb';

import {
  ConflictError,
} from '@hospital-mis/shared';

import type {
  CorrectMedicationAdministrationInput,
  EnterMedicationAdministrationInErrorInput,
  NursingMarEntityCommand,
} from '../nursing-mar.contracts.js';

import {
  projectMedicationAdministration,
} from '../nursing-mar.projections.js';

import {
  correctMedicationAdministrationBodySchema,
  enterMedicationAdministrationInErrorBodySchema,
} from '../nursing-mar.validation.js';

import {
  deleteCreatedMarRecord,
  NURSING_MAR_AUDIT_ACTIONS,
  NURSING_MAR_OUTBOX_EVENTS,
  NURSING_MAR_REALTIME_EVENTS,
  NURSING_MAR_TRANSACTION_TYPES,
  restoreMedicationAdministrationCompensation,
  restoreMedicationScheduleCompensation,
} from '../nursing-mar.transaction-support.js';

import {
  assertNursingDocumentationAllowed,
} from '../nursing-medication.lifecycle.js';

import {
  NursingMarCommandService,
} from '../services/nursing-mar-command.service.js';

function administrationSnapshotHash(
  record: Awaited<
    ReturnType<
      NursingMarCommandService['requireAdministration']
    >
  >,
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
          record.administeredDose?.toString() ?? null,

        administeredRoute:
          record.administeredRoute,

        administeredAt:
          record.administeredAt?.toISOString() ?? null,

        reasonCode:
          record.reasonCode,

        reason:
          record.reason,

        delayedUntil:
          record.delayedUntil?.toISOString() ?? null,
      }),
    )
    .digest(
      'hex',
    );
}

interface CorrectionDefinition {
  transactionType: string;
  auditAction: string;
  outboxEvent: string;

  amendmentType:
    | 'CORRECTION'
    | 'ENTERED_IN_ERROR';
}

async function executeCorrection(
  service:
    NursingMarCommandService,

  command:
    NursingMarEntityCommand<CorrectMedicationAdministrationInput>,

  definition:
    CorrectionDefinition,
) {
  const current =
    await service.requireAdministration(
      command.actor,
      command.entityId,
    );

  service.assertVersion(
    current,
    command.input.expectedAdministrationVersion,
    'Medication administration',
  );

  if (
    current.supersededByAdministrationId !==
    null
  ) {
    throw new ConflictError(
      'Only the current medication-administration revision can be corrected',
    );
  }

  const schedule =
    await service.requireSchedule(
      command.actor,
      current.medicationScheduleId.toHexString(),
    );

  const context =
    await service.resolveContextForSchedule(
      command.actor,
      schedule,
    );

  await service.support.assertAccess(
    'MEDICATION_CORRECT',
    command.actor,
    context,
  );

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
        `nursing:mar:administration:${context.facilityId}:${command.entityId}`,
        `nursing:mar:schedule:${context.facilityId}:${schedule._id.toHexString()}`,
      ],

      idempotencyPayload: {
        medicationAdministrationId:
          command.entityId,

        input:
          command.input,
      },

      journalPayload: {
        operation:
          definition.transactionType,

        medicationAdministrationId:
          command.entityId,

        expectedVersion:
          command.input.expectedAdministrationVersion,

        replacementStatus:
          command.input.replacement.status,
      },

      execute:
        async (
          transaction,
        ) => {
          const lockedAdministration =
            await service.requireAdministration(
              command.actor,
              command.entityId,
            );

          service.assertVersion(
            lockedAdministration,
            command.input.expectedAdministrationVersion,
            'Medication administration',
          );

          if (
            lockedAdministration.supersededByAdministrationId !==
            null
          ) {
            throw new ConflictError(
              'The medication administration was already corrected',
            );
          }

          const lockedSchedule =
            await service.requireSchedule(
              command.actor,
              lockedAdministration.medicationScheduleId.toHexString(),
            );

          const lockedContext =
            await service.resolveContextForSchedule(
              command.actor,
              lockedSchedule,
            );

          assertNursingDocumentationAllowed(
            lockedContext,
            'CORRECTION',
            command.input.reason,
          );

          const occurredAt =
            service.support.dependencies
              .clock.now();

          const actorStaffId =
            await service.support.actorStaffId(
              command.actor,
            );

          const actorUserId =
            service.support.objectId(
              command.actor.userId,
              'actorUserId',
            );

          const replacement =
            command.input.replacement;

          let safety =
            null;

          if (
            replacement.status ===
            'ADMINISTERED'
          ) {
            safety =
              await service.evaluateAdministrationSafety(
                lockedContext,
                lockedSchedule,
                {
                  scheduledAt:
                    lockedAdministration.scheduledAt,

                  administeredAt:
                    new Date(
                      replacement.administeredAt!,
                    ),

                  administeredDose:
                    replacement.administeredDose!,

                  administeredRoute:
                    replacement.administeredRoute!,
                },
              );

            service.assertSafetyAllowed(
              safety,
            );
          }

          const allocation =
            await service.support.allocateNumber(
              lockedContext.facilityId,
              'inpatient.medication_administration.number',
              'MAR-ADM',
              occurredAt,
            );

          const replacementRecord =
            await service.repository.createAdministration({
              facilityId:
                lockedAdministration.facilityId,

              admissionId:
                lockedAdministration.admissionId,

              patientId:
                lockedAdministration.patientId,

              encounterId:
                lockedAdministration.encounterId,

              wardId:
                service.support.objectId(
                  lockedContext.location.wardId,
                  'wardId',
                ),

              roomId:
                lockedContext.location.roomId ==
                null
                  ? null
                  : service.support.objectId(
                      lockedContext.location.roomId,
                      'roomId',
                    ),

              bedId:
                lockedContext.location.bedId ==
                null
                  ? null
                  : service.support.objectId(
                      lockedContext.location.bedId,
                      'bedId',
                    ),

              administrationNumber:
                allocation.number,

              medicationScheduleId:
                lockedAdministration.medicationScheduleId,

              prescriptionId:
                lockedAdministration.prescriptionId,

              prescriptionItemId:
                lockedAdministration.prescriptionItemId,

              medicineId:
                lockedAdministration.medicineId,

              medicineDisplaySnapshot:
                lockedAdministration.medicineDisplaySnapshot,

              scheduledAt:
                lockedAdministration.scheduledAt,

              status:
                replacement.status,

              prescribedDose:
                lockedAdministration.prescribedDose,

              administeredDose:
                replacement.status ===
                'ADMINISTERED'
                  ? Decimal128.fromString(
                      replacement.administeredDose!,
                    )
                  : null,

              doseUnitCode:
                lockedAdministration.doseUnitCode,

              prescribedRoute:
                lockedAdministration.prescribedRoute,

              administeredRoute:
                replacement.status ===
                'ADMINISTERED'
                  ? replacement.administeredRoute!
                  : null,

              administeredAt:
                replacement.status ===
                'ADMINISTERED'
                  ? new Date(
                      replacement.administeredAt!,
                    )
                  : null,

              administeringNurseUserId:
                replacement.status ===
                'ADMINISTERED'
                  ? actorUserId
                  : null,

              administeringNurseStaffId:
                replacement.status ===
                'ADMINISTERED'
                  ? service.support.objectId(
                      actorStaffId,
                      'actorStaffId',
                    )
                  : null,

              reasonCode:
                replacement.status ===
                'ADMINISTERED'
                  ? null
                  : service.support.normalizedCode(
                      replacement.reasonCode!,
                    ),

              reason:
                replacement.status ===
                'ADMINISTERED'
                  ? null
                  : service.support.normalizedText(
                      replacement.reason!,
                    ),

              notes:
                service.support.nullableText(
                  replacement.notes,
                ),

              delayedUntil:
                replacement.status ===
                  'DELAYED' &&
                replacement.delayedUntil !=
                  null
                  ? new Date(
                      replacement.delayedUntil,
                    )
                  : null,

              statusChangedAt:
                occurredAt,

              statusChangedBy:
                actorUserId,

              correctionOfAdministrationId:
                lockedAdministration._id,

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
              `delete-mar-administration-replacement:${replacementRecord._id.toHexString()}`,
              {
                facilityId:
                  lockedContext.facilityId,

                collection:
                  'medicationAdministrations',

                entityId:
                  replacementRecord._id.toHexString(),

                expectedVersion:
                  0,

                transactionId:
                  transaction.transactionId,
              },
            ),
          );

          const superseded =
            await service.repository.updateAdministrationSupersession(
              lockedContext.facilityId,
              command.entityId,
              lockedAdministration.version,
              replacementRecord._id.toHexString(),
              command.actor.userId,
            );

          if (
            superseded ===
            null
          ) {
            throw new ConflictError(
              'Medication administration changed before correction completed',
            );
          }

          await transaction.registerCompensation(
            restoreMedicationAdministrationCompensation(
              service.support.dependencies
                .snapshotCrypto,

              lockedAdministration,

              lockedAdministration.version + 1,

              transaction.transactionId,
            ),
          );

          const amendment =
            await service.repository.createAdministrationAmendment({
              facilityId:
                lockedAdministration.facilityId,

              admissionId:
                lockedAdministration.admissionId,

              patientId:
                lockedAdministration.patientId,

              encounterId:
                lockedAdministration.encounterId,

              wardId:
                lockedAdministration.wardId,

              roomId:
                lockedAdministration.roomId,

              bedId:
                lockedAdministration.bedId,

              medicationAdministrationId:
                lockedAdministration._id,

              amendmentSequence:
                lockedAdministration.version + 1,

              amendmentType:
                definition.amendmentType,

              previousStatus:
                lockedAdministration.status,

              replacementAdministrationId:
                replacementRecord._id,

              reason:
                service.support.normalizedText(
                  command.input.reason,
                ),

              snapshotHash:
                administrationSnapshotHash(
                  lockedAdministration,
                ),

              occurredAt,

              performedByUserId:
                actorUserId,

              performedByStaffId:
                service.support.objectId(
                  actorStaffId,
                  'actorStaffId',
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
              `delete-mar-administration-amendment:${amendment._id.toHexString()}`,
              {
                facilityId:
                  lockedContext.facilityId,

                collection:
                  'medicationAdministrationAmendments',

                entityId:
                  amendment._id.toHexString(),

                expectedVersion:
                  0,

                transactionId:
                  transaction.transactionId,
              },
            ),
          );

          const derived =
            await service.repository.deriveScheduleState(
              lockedContext.facilityId,
              lockedSchedule._id.toHexString(),
              occurredAt,
            );

          const updatedSchedule =
            await service.repository.updateSchedule(
              lockedContext.facilityId,
              lockedSchedule._id.toHexString(),
              lockedSchedule.version,
              [
                lockedSchedule.status,
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
              'Medication schedule changed before correction state could be reconciled',
            );
          }

          await transaction.registerCompensation(
            restoreMedicationScheduleCompensation(
              service.support.dependencies
                .snapshotCrypto,

              lockedSchedule,

              lockedSchedule.version + 1,

              transaction.transactionId,
            ),
          );

          const before =
            service.administrationEventPayload(
              lockedAdministration,
            );

          const after = {
            ...service.administrationEventPayload(
              replacementRecord,
            ),

            correctedAdministrationId:
              command.entityId,

            amendmentId:
              amendment._id.toHexString(),

            safetyWarningCodes:
              safety?.findings
                .filter(
                  (item) =>
                    item.severity ===
                    'WARNING',
                )
                .map(
                  (item) =>
                    item.code,
                ) ?? [],
          };

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
              NURSING_MAR_REALTIME_EVENTS.PATIENT_MAR_CHANGED,

            entityType:
              'MedicationAdministration',

            entityId:
              replacementRecord._id.toHexString(),

            context:
              lockedContext,

            before,

            after,

            eventPayload:
              after,

            reason:
              command.input.reason,
          });

          return projectMedicationAdministration(
            replacementRecord,
          );
        },
    });
}

export class CorrectMedicationAdministrationWorkflow {
  public constructor(
    private readonly service:
      NursingMarCommandService,
  ) {}

  public async execute(
    command:
      NursingMarEntityCommand<CorrectMedicationAdministrationInput>,
  ) {
    const input =
      correctMedicationAdministrationBodySchema.parse(
        command.input,
      );

    return executeCorrection(
      this.service,

      {
        ...command,
        input,
      },

      {
        transactionType:
          NURSING_MAR_TRANSACTION_TYPES.CORRECT_ADMINISTRATION,

        auditAction:
          NURSING_MAR_AUDIT_ACTIONS.ADMINISTRATION_CORRECTED,

        outboxEvent:
          NURSING_MAR_OUTBOX_EVENTS.ADMINISTRATION_CORRECTED,

        amendmentType:
          'CORRECTION',
      },
    );
  }
}

export class EnterMedicationAdministrationInErrorWorkflow {
  public constructor(
    private readonly service:
      NursingMarCommandService,
  ) {}

  public async execute(
    command:
      NursingMarEntityCommand<EnterMedicationAdministrationInErrorInput>,
  ) {
    const input =
      enterMedicationAdministrationInErrorBodySchema.parse(
        command.input,
      );

    return executeCorrection(
      this.service,

      {
        ...command,

        input: {
          expectedAdministrationVersion:
            input.expectedAdministrationVersion,

          reason:
            input.reason,

          replacement: {
            status:
              'CANCELLED',

            reasonCode:
              'ENTERED_IN_ERROR',

            reason:
              input.reason,
          },
        },
      },

      {
        transactionType:
          NURSING_MAR_TRANSACTION_TYPES.ENTER_ADMINISTRATION_IN_ERROR,

        auditAction:
          NURSING_MAR_AUDIT_ACTIONS.ADMINISTRATION_ENTERED_IN_ERROR,

        outboxEvent:
          NURSING_MAR_OUTBOX_EVENTS.ADMINISTRATION_ENTERED_IN_ERROR,

        amendmentType:
          'ENTERED_IN_ERROR',
      },
    );
  }
}