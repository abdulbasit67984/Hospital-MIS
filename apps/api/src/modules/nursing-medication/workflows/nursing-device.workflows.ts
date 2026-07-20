import {
  Decimal128,
} from 'mongodb';

import {
  NURSING_MEDICATION_NUMBER_SEQUENCE_NAMESPACE,
} from '../nursing-medication.constants.js';

import type {
  CreateNursingDeviceInput,
  NursingMedicationCommand,
  NursingMedicationEntityCommand,
  RecordNursingDeviceObservationInput,
  RemoveNursingDeviceInput,
} from '../nursing-medication.contracts.js';

import {
  assertNursingDeviceTransition,
  assertNursingDocumentationAllowed,
  assertNursingRecordContext,
} from '../nursing-medication.lifecycle.js';

import {
  createNursingDeviceBodySchema,
  recordNursingDeviceObservationBodySchema,
  removeNursingDeviceBodySchema,
} from '../nursing-medication.validation.js';

import {
  projectNursingDeviceSummary,
} from '../nursing-medication.projections.js';

import {
  deleteCreatedObservationRecord,
  NURSING_OBSERVATION_AUDIT_ACTIONS,
  NURSING_OBSERVATION_OUTBOX_EVENTS,
  NURSING_OBSERVATION_REALTIME_EVENTS,
  NURSING_OBSERVATION_TRANSACTION_TYPES,
  restoreDeviceCompensation,
} from '../nursing-observation.transaction-support.js';

import {
  NursingObservationCommandService,
} from '../services/nursing-observation-command.service.js';

function devicePayload(
  record:
    Awaited<
      ReturnType<
        NursingObservationCommandService[
          'requireDevice'
        ]
      >
    >,
) {
  return {
    deviceId:
      record._id.toHexString(),

    deviceNumber:
      record.deviceNumber,

    admissionId:
      record.admissionId.toHexString(),

    patientId:
      record.patientId.toHexString(),

    wardId:
      record.wardId.toHexString(),

    deviceType:
      record.deviceType,

    deviceName:
      record.deviceName,

    anatomicalSite:
      record.anatomicalSite,

    status:
      record.status,

    insertedAt:
      record.insertedAt
        ?.toISOString() ?? null,

    removedAt:
      record.removedAt
        ?.toISOString() ?? null,
  };
}

export class CreateNursingDeviceWorkflow {
  public constructor(
    private readonly service:
      NursingObservationCommandService,
  ) {}

  public async execute(
    command:
      NursingMedicationCommand<CreateNursingDeviceInput>,
  ) {
    const input =
      createNursingDeviceBodySchema.parse(
        command.input,
      );

    const context =
      await this.service.resolveAdmission(
        command.actor,
        input.admissionId,
      );

    await this.service.support.assertAccess(
      'DEVICE_RECORD',
      command.actor,
      context,
    );

    return this.service.support.dependencies
      .transactionManager.execute({
        transactionType:
          NURSING_OBSERVATION_TRANSACTION_TYPES
            .CREATE_DEVICE,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          `nursing:device:${context.facilityId}:${context.admissionId}:${input.deviceType}:${input.anatomicalSite}`,
        ],

        idempotencyPayload: {
          facilityId:
            command.actor.facilityId,

          input,
        },

        journalPayload: {
          operation:
            'CREATE_DEVICE',

          admissionId:
            context.admissionId,

          deviceType:
            input.deviceType,
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
              'DEVICE_RECORD',
              command.actor,
              lockedContext,
            );

            assertNursingDocumentationAllowed(
              lockedContext,
              'NEW_ENTRY',
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
                  .DEVICE,
                'NDV',
                occurredAt,
              );

            const created =
              await this.service.observations
                .createDevice({
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

                  deviceNumber:
                    allocation.number,

                  deviceType:
                    input.deviceType,

                  deviceName:
                    this.service.support.normalizedText(
                      input.deviceName,
                    ),

                  anatomicalSite:
                    this.service.support.normalizedText(
                      input.anatomicalSite,
                    ),

                  laterality:
                    input.laterality ==
                    null
                      ? null
                      : this.service.support.normalizedCode(
                          input.laterality,
                        ),

                  woundDetails:
                    input.woundDetails ==
                    null
                      ? null
                      : {
                          classification:
                            input.woundDetails.classification,

                          anatomicalLocation:
                            this.service.support.nullableText(
                              input.woundDetails.anatomicalLocation,
                            ),

                          stageOrGrade:
                            this.service.support.nullableText(
                              input.woundDetails.stageOrGrade,
                            ),

                          lengthCm:
                            input.woundDetails.lengthCm ==
                            null
                              ? null
                              : Decimal128.fromString(
                                  input.woundDetails.lengthCm,
                                ),

                          widthCm:
                            input.woundDetails.widthCm ==
                            null
                              ? null
                              : Decimal128.fromString(
                                  input.woundDetails.widthCm,
                                ),

                          depthCm:
                            input.woundDetails.depthCm ==
                            null
                              ? null
                              : Decimal128.fromString(
                                  input.woundDetails.depthCm,
                                ),

                          dressingType:
                            this.service.support.nullableText(
                              input.woundDetails.dressingType,
                            ),
                        },

                  insertedAt:
                    input.insertedAt ==
                    null
                      ? null
                      : new Date(
                          input.insertedAt,
                        ),

                  insertedByStaffId:
                    input.insertedByStaffId ==
                    null
                      ? this.service.support.objectId(
                          staffId,
                          'staffId',
                        )
                      : this.service.support.objectId(
                          input.insertedByStaffId,
                          'insertedByStaffId',
                        ),

                  status:
                    'ACTIVE',

                  removedAt:
                    null,

                  removedByStaffId:
                    null,

                  removalReason:
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
                `delete-nursing-device:${created._id.toHexString()}`,
                {
                  facilityId:
                    lockedContext.facilityId,

                  collection:
                    'nursingDevices',

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
              devicePayload(
                created,
              );

            await this.service.support.publishMutation({
              transaction,

              actor:
                command.actor,

              occurredAt,

              auditAction:
                NURSING_OBSERVATION_AUDIT_ACTIONS
                  .DEVICE_CREATED,

              outboxEventType:
                NURSING_OBSERVATION_OUTBOX_EVENTS
                  .DEVICE_CREATED,

              realtimeEventType:
                NURSING_OBSERVATION_REALTIME_EVENTS
                  .DEVICE_WORKLIST_CHANGED,

              entityType:
                'NursingDevice',

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

            return projectNursingDeviceSummary(
              created,
            );
          },
      });
  }
}

export class RecordNursingDeviceObservationWorkflow {
  public constructor(
    private readonly service:
      NursingObservationCommandService,
  ) {}

  public async execute(
    command:
      NursingMedicationEntityCommand<RecordNursingDeviceObservationInput>,
  ) {
    const input =
      recordNursingDeviceObservationBodySchema.parse(
        command.input,
      );

    const device =
      await this.service.requireDevice(
        command.actor,
        command.entityId,
      );

    const context =
      await this.service.resolveAdmission(
        command.actor,
        device.admissionId.toHexString(),
      );

    assertNursingRecordContext(
      context,
      device,
    );

    await this.service.support.assertAccess(
      'DEVICE_RECORD',
      command.actor,
      context,
    );

    assertNursingDocumentationAllowed(
      context,
      'NEW_ENTRY',
    );

    return this.service.support.dependencies
      .transactionManager.execute({
        transactionType:
          NURSING_OBSERVATION_TRANSACTION_TYPES
            .RECORD_DEVICE_OBSERVATION,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          `nursing:device:${context.facilityId}:${command.entityId}:observation:${input.observedAt}`,
        ],

        idempotencyPayload: {
          deviceId:
            command.entityId,

          input,
        },

        journalPayload: {
          operation:
            'RECORD_DEVICE_OBSERVATION',

          deviceId:
            command.entityId,

          observationType:
            input.observationType,
        },

        execute:
          async (
            transaction,
          ) => {
            const locked =
              await this.service.requireDevice(
                command.actor,
                command.entityId,
              );

            if (
              locked.status !==
              'ACTIVE'
            ) {
              throw new Error(
                'Observations require an active device',
              );
            }

            const lockedContext =
              await this.service.resolveAdmission(
                command.actor,
                locked.admissionId.toHexString(),
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
                  .DEVICE_OBSERVATION,
                'NDO',
                occurredAt,
              );

            const created =
              await this.service.observations
                .createDeviceObservation({
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

                  createdBy:
                    actorUserId,

                  nursingDeviceId:
                    locked._id,

                  observationNumber:
                    allocation.number,

                  observationType:
                    input.observationType,

                  observedAt:
                    new Date(
                      input.observedAt,
                    ),

                  recordedAt:
                    occurredAt,

                  observedByUserId:
                    actorUserId,

                  observedByStaffId:
                    this.service.support.objectId(
                      staffId,
                      'staffId',
                    ),

                  siteCondition:
                    this.service.support.nullableText(
                      input.siteCondition,
                    ),

                  dressingType:
                    this.service.support.nullableText(
                      input.dressingType,
                    ),

                  outputMillilitres:
                    input.outputMillilitres ==
                    null
                      ? null
                      : Decimal128.fromString(
                          input.outputMillilitres,
                        ),

                  infectionIndicators: [
                    ...input.infectionIndicators,
                  ],

                  findings: {
                    ...input.findings,
                  },

                  narrative:
                    this.service.support.nullableText(
                      input.narrative,
                    ),

                  requiresEscalation:
                    input.requiresEscalation,

                  escalationReason:
                    this.service.support.nullableText(
                      input.escalationReason,
                    ),
                });

            await transaction.registerCompensation(
              deleteCreatedObservationRecord(
                `delete-device-observation:${created._id.toHexString()}`,
                {
                  facilityId:
                    lockedContext.facilityId,

                  collection:
                    'nursingDeviceObservations',

                  entityId:
                    created._id.toHexString(),

                  expectedVersion:
                    null,

                  transactionId:
                    transaction.transactionId,
                },
              ),
            );

            const payload = {
              observationId:
                created._id.toHexString(),

              deviceId:
                command.entityId,

              admissionId:
                lockedContext.admissionId,

              wardId:
                lockedContext.location.wardId,

              observationType:
                created.observationType,

              observedAt:
                created.observedAt.toISOString(),

              requiresEscalation:
                created.requiresEscalation,

              infectionIndicatorCount:
                created.infectionIndicators.length,
            };

            await this.service.support.publishMutation({
              transaction,

              actor:
                command.actor,

              occurredAt,

              auditAction:
                NURSING_OBSERVATION_AUDIT_ACTIONS
                  .DEVICE_OBSERVATION_RECORDED,

              outboxEventType:
                NURSING_OBSERVATION_OUTBOX_EVENTS
                  .DEVICE_OBSERVATION_RECORDED,

              realtimeEventType:
                NURSING_OBSERVATION_REALTIME_EVENTS
                  .DEVICE_WORKLIST_CHANGED,

              entityType:
                'NursingDeviceObservation',

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

            return payload;
          },
      });
  }
}

export class RemoveNursingDeviceWorkflow {
  public constructor(
    private readonly service:
      NursingObservationCommandService,
  ) {}

  public async execute(
    command:
      NursingMedicationEntityCommand<RemoveNursingDeviceInput>,
  ) {
    const input =
      removeNursingDeviceBodySchema.parse(
        command.input,
      );

    const current =
      await this.service.requireDevice(
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
      'Nursing device',
    );

    assertNursingDeviceTransition(
      current.status,
      'REMOVED',
    );

    await this.service.support.assertAccess(
      'DEVICE_CORRECT',
      command.actor,
      context,
    );

    return this.service.support.dependencies
      .transactionManager.execute({
        transactionType:
          NURSING_OBSERVATION_TRANSACTION_TYPES
            .REMOVE_DEVICE,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          `nursing:device:${context.facilityId}:${command.entityId}`,
        ],

        idempotencyPayload: {
          deviceId:
            command.entityId,

          input,
        },

        journalPayload: {
          operation:
            'REMOVE_DEVICE',

          deviceId:
            command.entityId,

          expectedVersion:
            input.expectedVersion,
        },

        execute:
          async (
            transaction,
          ) => {
            const locked =
              await this.service.requireDevice(
                command.actor,
                command.entityId,
              );

            const lockedContext =
              await this.service.resolveAdmission(
                command.actor,
                locked.admissionId.toHexString(),
              );

            this.service.assertVersion(
              locked,
              input.expectedVersion,
              'Nursing device',
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
                .updateDevice(
                  lockedContext.facilityId,
                  command.entityId,
                  locked.version,
                  [
                    'ACTIVE',
                  ],
                  {
                    status:
                      'REMOVED',

                    removedAt:
                      new Date(
                        input.removedAt,
                      ),

                    removedByStaffId:
                      this.service.support.objectId(
                        staffId,
                        'staffId',
                      ),

                    removalReason:
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
                'Nursing device concurrency conflict',
              );
            }

            await transaction.registerCompensation(
              restoreDeviceCompensation(
                this.service.support.dependencies
                  .snapshotCrypto,
                locked,
                locked.version + 1,
                transaction.transactionId,
              ),
            );

            const payload =
              devicePayload(
                updated,
              );

            await this.service.support.publishMutation({
              transaction,

              actor:
                command.actor,

              occurredAt,

              auditAction:
                NURSING_OBSERVATION_AUDIT_ACTIONS
                  .DEVICE_REMOVED,

              outboxEventType:
                NURSING_OBSERVATION_OUTBOX_EVENTS
                  .DEVICE_REMOVED,

              realtimeEventType:
                NURSING_OBSERVATION_REALTIME_EVENTS
                  .DEVICE_WORKLIST_CHANGED,

              entityType:
                'NursingDevice',

              entityId:
                command.entityId,

              context:
                lockedContext,

              before:
                devicePayload(
                  locked,
                ),

              after:
                payload,

              eventPayload:
                payload,

              reason:
                input.reason,
            });

            return projectNursingDeviceSummary(
              updated,
            );
          },
      });
  }
}