import {
  Decimal128,
} from 'mongodb';

import {
  NURSING_MEDICATION_NUMBER_SEQUENCE_NAMESPACE,
} from '../nursing-medication.constants.js';

import type {
  CorrectIntakeOutputInput,
  MarkIntakeOutputEnteredInErrorInput,
  NursingMedicationCommand,
  NursingMedicationEntityCommand,
  RecordIntakeOutputInput,
} from '../nursing-medication.contracts.js';

import {
  assertIntakeOutputTransition,
  assertNursingDocumentationAllowed,
  assertNursingRecordContext,
} from '../nursing-medication.lifecycle.js';

import {
  correctIntakeOutputBodySchema,
  markIntakeOutputEnteredInErrorBodySchema,
  recordIntakeOutputBodySchema,
} from '../nursing-medication.validation.js';

import {
  projectIntakeOutputEntry,
} from '../nursing-medication.projections.js';

import {
  deleteCreatedObservationRecord,
  NURSING_OBSERVATION_AUDIT_ACTIONS,
  NURSING_OBSERVATION_OUTBOX_EVENTS,
  NURSING_OBSERVATION_REALTIME_EVENTS,
  NURSING_OBSERVATION_TRANSACTION_TYPES,
  restoreIntakeOutputCompensation,
} from '../nursing-observation.transaction-support.js';

import {
  NursingObservationCommandService,
} from '../services/nursing-observation-command.service.js';

function eventPayload(
  record:
    Awaited<
      ReturnType<
        NursingObservationCommandService[
          'requireIntakeOutput'
        ]
      >
    >,
) {
  return {
    entryId:
      record._id.toHexString(),

    entryNumber:
      record.entryNumber,

    admissionId:
      record.admissionId.toHexString(),

    patientId:
      record.patientId.toHexString(),

    wardId:
      record.wardId.toHexString(),

    direction:
      record.direction,

    category:
      record.category,

    volumeMillilitres:
      record.volumeMillilitres.toString(),

    occurredAt:
      record.occurredAt.toISOString(),

    shiftCode:
      record.shiftCode,

    status:
      record.status,

    revisionNumber:
      record.revisionNumber,
  };
}

export class RecordIntakeOutputWorkflow {
  public constructor(
    private readonly service:
      NursingObservationCommandService,
  ) {}

  public async execute(
    command:
      NursingMedicationCommand<RecordIntakeOutputInput>,
  ) {
    const input =
      recordIntakeOutputBodySchema.parse(
        command.input,
      );

    const context =
      await this.service.resolveAdmission(
        command.actor,
        input.admissionId,
      );

    await this.service.support.assertAccess(
      'INTAKE_OUTPUT_RECORD',
      command.actor,
      context,
    );

    return this.service.support.dependencies
      .transactionManager.execute({
        transactionType:
          NURSING_OBSERVATION_TRANSACTION_TYPES
            .RECORD_INTAKE_OUTPUT,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          `nursing:intake-output:${context.facilityId}:${context.admissionId}:${input.occurredAt}:${input.direction}`,
        ],

        idempotencyPayload: {
          facilityId:
            command.actor.facilityId,

          input,
        },

        journalPayload: {
          operation:
            'RECORD_INTAKE_OUTPUT',

          admissionId:
            context.admissionId,

          direction:
            input.direction,

          category:
            input.category,

          occurredAt:
            input.occurredAt,
        },

        execute:
          async (
            transaction,
          ) => {
            const lockedContext =
              await this.service.resolveAdmission(
                command.actor,
                input.admissionId,
              );

            await this.service.support.assertAccess(
              'INTAKE_OUTPUT_RECORD',
              command.actor,
              lockedContext,
            );

            assertNursingDocumentationAllowed(
              lockedContext,

              [
                'CLINICALLY_DISCHARGED',
                'FINANCIAL_CLEARANCE_PENDING',
                'DISCHARGED',
              ].includes(
                lockedContext.admissionStatus,
              )
                ? 'LATE_ENTRY'
                : 'NEW_ENTRY',

              input.backdatedEntryReason,
            );

            const occurredAt =
              this.service.support.dependencies
                .clock.now();

            const staffId =
              await this.service.support.actorStaffId(
                command.actor,
              );

            const allocation =
              await this.service.support.allocateNumber(
                lockedContext.facilityId,
                NURSING_MEDICATION_NUMBER_SEQUENCE_NAMESPACE
                  .INTAKE_OUTPUT,
                'NIO',
                occurredAt,
              );

            const actorUserId =
              this.service.support.objectId(
                command.actor.userId,
                'actorUserId',
              );

            const quantity =
              Decimal128.fromString(
                input.quantity,
              );

            const factor =
              Decimal128.fromString(
                input.conversionFactorToMillilitres,
              );

            const volume =
              Decimal128.fromString(
                (
                  Number(
                    input.quantity,
                  ) *
                  Number(
                    input.conversionFactorToMillilitres,
                  )
                ).toFixed(4),
              );

            const rootEntryId =
              this.service.support.objectId(
                this.service.support.newId(),
                'rootEntryId',
              );

            const created =
              await this.service.observations
                .createIntakeOutput({
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

                  entryNumber:
                    allocation.number,

                  direction:
                    input.direction,

                  category:
                    input.category,

                  sourceDescription:
                    this.service.support.nullableText(
                      input.sourceDescription,
                    ),

                  volumeMillilitres:
                    volume,

                  originalQuantity:
                    quantity,

                  originalUnitCode:
                    this.service.support.normalizedCode(
                      input.unitCode,
                    ),

                  conversionFactorToMillilitres:
                    factor,

                  occurredAt:
                    new Date(
                      input.occurredAt,
                    ),

                  recordedAt:
                    occurredAt,

                  shiftCode:
                    this.service.support.normalizedCode(
                      input.shiftCode,
                    ),

                  recordedByUserId:
                    actorUserId,

                  recordedByStaffId:
                    this.service.support.objectId(
                      staffId,
                      'staffId',
                    ),

                  status:
                    'ACTIVE',

                  rootEntryId,

                  revisionNumber:
                    1,

                  supersedesEntryId:
                    null,

                  supersededByEntryId:
                    null,

                  correctionReason:
                    null,

                  enteredInErrorAt:
                    null,

                  enteredInErrorByUserId:
                    null,

                  enteredInErrorByStaffId:
                    null,

                  enteredInErrorReason:
                    null,

                  transactionId:
                    transaction.transactionId,

                  correlationId:
                    command.actor.correlationId,

                  idempotencyKey:
                    command.idempotencyKey,

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
              deleteCreatedObservationRecord(
                `delete-intake-output:${created._id.toHexString()}`,
                {
                  facilityId:
                    lockedContext.facilityId,

                  collection:
                    'intakeOutputEntries',

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
              eventPayload(
                created,
              );

            await this.service.support.publishMutation({
              transaction,

              actor:
                command.actor,

              occurredAt,

              auditAction:
                NURSING_OBSERVATION_AUDIT_ACTIONS
                  .INTAKE_OUTPUT_RECORDED,

              outboxEventType:
                NURSING_OBSERVATION_OUTBOX_EVENTS
                  .INTAKE_OUTPUT_RECORDED,

              realtimeEventType:
                NURSING_OBSERVATION_REALTIME_EVENTS
                  .INTAKE_OUTPUT_CHANGED,

              entityType:
                'IntakeOutputEntry',

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

            return projectIntakeOutputEntry(
              created,
            );
          },
      });
  }
}

export class CorrectIntakeOutputWorkflow {
  public constructor(
    private readonly service:
      NursingObservationCommandService,
  ) {}

  public async execute(
    command:
      NursingMedicationEntityCommand<CorrectIntakeOutputInput>,
  ) {
    const input =
      correctIntakeOutputBodySchema.parse(
        command.input,
      );

    const current =
      await this.service.requireIntakeOutput(
        command.actor,
        command.entityId,
      );

    const context =
      await this.service.resolveAdmission(
        command.actor,
        current.admissionId.toHexString(),
      );

    assertNursingRecordContext(
      context,
      current,
    );

    this.service.assertVersion(
      current,
      input.expectedVersion,
      'Intake/output entry',
    );

    assertIntakeOutputTransition(
      current.status,
      'CORRECTED',
    );

    await this.service.support.assertAccess(
      'INTAKE_OUTPUT_CORRECT',
      command.actor,
      context,
    );

    return this.service.support.dependencies
      .transactionManager.execute({
        transactionType:
          NURSING_OBSERVATION_TRANSACTION_TYPES
            .CORRECT_INTAKE_OUTPUT,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          `nursing:intake-output:${context.facilityId}:${command.entityId}`,
        ],

        idempotencyPayload: {
          facilityId:
            command.actor.facilityId,

          entryId:
            command.entityId,

          input,
        },

        journalPayload: {
          operation:
            'CORRECT_INTAKE_OUTPUT',

          entryId:
            command.entityId,

          expectedVersion:
            input.expectedVersion,
        },

        execute:
          async (
            transaction,
          ) => {
            const locked =
              await this.service.requireIntakeOutput(
                command.actor,
                command.entityId,
              );

            const lockedContext =
              await this.service.resolveAdmission(
                command.actor,
                locked.admissionId.toHexString(),
              );

            assertNursingRecordContext(
              lockedContext,
              locked,
            );

            this.service.assertVersion(
              locked,
              input.expectedVersion,
              'Intake/output entry',
            );

            assertNursingDocumentationAllowed(
              lockedContext,
              'CORRECTION',
              input.reason,
            );

            const occurredAt =
              this.service.support.dependencies
                .clock.now();

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
                NURSING_MEDICATION_NUMBER_SEQUENCE_NAMESPACE
                  .INTAKE_OUTPUT,
                'NIO',
                occurredAt,
              );

            const replacement =
              input.replacement;

            const replacementRecord =
              await this.service.observations
                .createIntakeOutput({
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

                  entryNumber:
                    allocation.number,

                  direction:
                    replacement.direction,

                  category:
                    replacement.category,

                  sourceDescription:
                    this.service.support.nullableText(
                      replacement.sourceDescription,
                    ),

                  volumeMillilitres:
                    Decimal128.fromString(
                      (
                        Number(
                          replacement.quantity,
                        ) *
                        Number(
                          replacement.conversionFactorToMillilitres,
                        )
                      ).toFixed(4),
                    ),

                  originalQuantity:
                    Decimal128.fromString(
                      replacement.quantity,
                    ),

                  originalUnitCode:
                    this.service.support.normalizedCode(
                      replacement.unitCode,
                    ),

                  conversionFactorToMillilitres:
                    Decimal128.fromString(
                      replacement.conversionFactorToMillilitres,
                    ),

                  occurredAt:
                    new Date(
                      replacement.occurredAt,
                    ),

                  recordedAt:
                    occurredAt,

                  shiftCode:
                    this.service.support.normalizedCode(
                      replacement.shiftCode,
                    ),

                  recordedByUserId:
                    actorUserId,

                  recordedByStaffId:
                    this.service.support.objectId(
                      staffId,
                      'staffId',
                    ),

                  status:
                    'ACTIVE',

                  rootEntryId:
                    locked.rootEntryId,

                  revisionNumber:
                    locked.revisionNumber +
                    1,

                  supersedesEntryId:
                    locked._id,

                  supersededByEntryId:
                    null,

                  correctionReason:
                    this.service.support.normalizedText(
                      input.reason,
                    ),

                  enteredInErrorAt:
                    null,

                  enteredInErrorByUserId:
                    null,

                  enteredInErrorByStaffId:
                    null,

                  enteredInErrorReason:
                    null,

                  transactionId:
                    transaction.transactionId,

                  correlationId:
                    command.actor.correlationId,

                  idempotencyKey:
                    command.idempotencyKey,

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
              deleteCreatedObservationRecord(
                `delete-intake-output-replacement:${replacementRecord._id.toHexString()}`,
                {
                  facilityId:
                    lockedContext.facilityId,

                  collection:
                    'intakeOutputEntries',

                  entityId:
                    replacementRecord._id.toHexString(),

                  expectedVersion:
                    0,

                  transactionId:
                    transaction.transactionId,
                },
              ),
            );

            const updated =
              await this.service.observations
                .updateIntakeOutput(
                  lockedContext.facilityId,
                  command.entityId,
                  locked.version,
                  [
                    'ACTIVE',
                  ],
                  {
                    status:
                      'CORRECTED',

                    supersededByEntryId:
                      replacementRecord._id,

                    correctionReason:
                      this.service.support.normalizedText(
                        input.reason,
                      ),

                    updatedBy:
                      actorUserId,
                  },
                );

            if (
              updated === null
            ) {
              throw new Error(
                'Intake/output concurrency conflict',
              );
            }

            await transaction.registerCompensation(
              restoreIntakeOutputCompensation(
                this.service.support.dependencies
                  .snapshotCrypto,
                locked,
                locked.version + 1,
                transaction.transactionId,
              ),
            );

            const payload = {
              ...eventPayload(
                replacementRecord,
              ),

              correctedEntryId:
                command.entityId,
            };

            await this.service.support.publishMutation({
              transaction,

              actor:
                command.actor,

              occurredAt,

              auditAction:
                NURSING_OBSERVATION_AUDIT_ACTIONS
                  .INTAKE_OUTPUT_CORRECTED,

              outboxEventType:
                NURSING_OBSERVATION_OUTBOX_EVENTS
                  .INTAKE_OUTPUT_CORRECTED,

              realtimeEventType:
                NURSING_OBSERVATION_REALTIME_EVENTS
                  .INTAKE_OUTPUT_CHANGED,

              entityType:
                'IntakeOutputEntry',

              entityId:
                replacementRecord._id.toHexString(),

              context:
                lockedContext,

              before:
                eventPayload(
                  locked,
                ),

              after:
                payload,

              eventPayload:
                payload,

              reason:
                input.reason,
            });

            return projectIntakeOutputEntry(
              replacementRecord,
            );
          },
      });
  }
}

export class EnterIntakeOutputInErrorWorkflow {
  public constructor(
    private readonly service:
      NursingObservationCommandService,
  ) {}

  public async execute(
    command:
      NursingMedicationEntityCommand<MarkIntakeOutputEnteredInErrorInput>,
  ) {
    const input =
      markIntakeOutputEnteredInErrorBodySchema.parse(
        command.input,
      );

    const current =
      await this.service.requireIntakeOutput(
        command.actor,
        command.entityId,
      );

    const context =
      await this.service.resolveAdmission(
        command.actor,
        current.admissionId.toHexString(),
      );

    assertNursingRecordContext(
      context,
      current,
    );

    this.service.assertVersion(
      current,
      input.expectedVersion,
      'Intake/output entry',
    );

    assertIntakeOutputTransition(
      current.status,
      'ENTERED_IN_ERROR',
    );

    await this.service.support.assertAccess(
      'INTAKE_OUTPUT_CORRECT',
      command.actor,
      context,
    );

    return this.service.support.dependencies
      .transactionManager.execute({
        transactionType:
          NURSING_OBSERVATION_TRANSACTION_TYPES
            .ENTER_INTAKE_OUTPUT_IN_ERROR,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          `nursing:intake-output:${context.facilityId}:${command.entityId}`,
        ],

        idempotencyPayload: {
          entryId:
            command.entityId,

          input,
        },

        journalPayload: {
          operation:
            'ENTER_INTAKE_OUTPUT_IN_ERROR',

          entryId:
            command.entityId,

          expectedVersion:
            input.expectedVersion,
        },

        execute:
          async (
            transaction,
          ) => {
            const locked =
              await this.service.requireIntakeOutput(
                command.actor,
                command.entityId,
              );

            const lockedContext =
              await this.service.resolveAdmission(
                command.actor,
                locked.admissionId.toHexString(),
              );

            assertNursingDocumentationAllowed(
              lockedContext,
              'CORRECTION',
              input.reason,
            );

            const occurredAt =
              this.service.support.dependencies
                .clock.now();

            const staffId =
              await this.service.support.actorStaffId(
                command.actor,
              );

            const actorUserId =
              this.service.support.objectId(
                command.actor.userId,
                'actorUserId',
              );

            const updated =
              await this.service.observations
                .updateIntakeOutput(
                  lockedContext.facilityId,
                  command.entityId,
                  locked.version,
                  [
                    'ACTIVE',
                  ],
                  {
                    status:
                      'ENTERED_IN_ERROR',

                    enteredInErrorAt:
                      occurredAt,

                    enteredInErrorByUserId:
                      actorUserId,

                    enteredInErrorByStaffId:
                      this.service.support.objectId(
                        staffId,
                        'staffId',
                      ),

                    enteredInErrorReason:
                      this.service.support.normalizedText(
                        input.reason,
                      ),

                    updatedBy:
                      actorUserId,
                  },
                );

            if (
              updated === null
            ) {
              throw new Error(
                'Intake/output concurrency conflict',
              );
            }

            await transaction.registerCompensation(
              restoreIntakeOutputCompensation(
                this.service.support.dependencies
                  .snapshotCrypto,
                locked,
                locked.version + 1,
                transaction.transactionId,
              ),
            );

            const payload =
              eventPayload(
                updated,
              );

            await this.service.support.publishMutation({
              transaction,

              actor:
                command.actor,

              occurredAt,

              auditAction:
                NURSING_OBSERVATION_AUDIT_ACTIONS
                  .INTAKE_OUTPUT_ENTERED_IN_ERROR,

              outboxEventType:
                NURSING_OBSERVATION_OUTBOX_EVENTS
                  .INTAKE_OUTPUT_ENTERED_IN_ERROR,

              realtimeEventType:
                NURSING_OBSERVATION_REALTIME_EVENTS
                  .INTAKE_OUTPUT_CHANGED,

              entityType:
                'IntakeOutputEntry',

              entityId:
                command.entityId,

              context:
                lockedContext,

              before:
                eventPayload(
                  locked,
                ),

              after:
                payload,

              eventPayload:
                payload,

              reason:
                input.reason,
            });

            return projectIntakeOutputEntry(
              updated,
            );
          },
      });
  }
}

export class CalculateFluidBalanceWorkflow {
  public constructor(
    private readonly service:
      NursingObservationCommandService,
  ) {}

  public async execute(
    actor:
      NursingMedicationCommand<unknown>['actor'],

    input: Readonly<{
      admissionId: string;
      from: string;
      to: string;
    }>,
  ) {
    const context =
      await this.service.resolveAdmission(
        actor,
        input.admissionId,
      );

    await this.service.support.assertAccess(
      'INTAKE_OUTPUT_READ',
      actor,
      context,
    );

    const from =
      new Date(
        input.from,
      );

    const to =
      new Date(
        input.to,
      );

    if (
      !(
        from.getTime() <
        to.getTime()
      )
    ) {
      throw new Error(
        'Fluid-balance start must precede end',
      );
    }

    return this.service.observations
      .calculateFluidBalance(
        actor.facilityId,
        input.admissionId,
        from,
        to,
      );
  }
}