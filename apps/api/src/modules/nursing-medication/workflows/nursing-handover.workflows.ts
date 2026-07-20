import {
  createHash,
} from 'node:crypto';

import type {
  CorrectWardHandoverInput,
  EnterWardHandoverInErrorInput,
  NursingObservationEntityCommand,
  WardHandoverListQuery,
} from '../nursing-observation.contracts.js';

import {
  correctWardHandoverBodySchema,
  enterWardHandoverInErrorBodySchema,
  wardHandoverListQuerySchema,
} from '../nursing-observation.validation.js';

import {
  assertNursingDocumentationAllowed,
} from '../nursing-medication.lifecycle.js';

import {
  deleteCreatedObservationRecord,
  NURSING_OBSERVATION_AUDIT_ACTIONS,
  NURSING_OBSERVATION_OUTBOX_EVENTS,
  NURSING_OBSERVATION_REALTIME_EVENTS,
  NURSING_OBSERVATION_TRANSACTION_TYPES,
  restoreHandoverCompensation,
} from '../nursing-observation.transaction-support.js';

import {
  NursingObservationCommandService,
} from '../services/nursing-observation-command.service.js';

function snapshotHash(
  record:
    Awaited<
      ReturnType<
        NursingObservationCommandService[
          'requireHandover'
        ]
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

        summary:
          record.summary,

        activeConcerns:
          record.activeConcerns,

        pendingTasks:
          record.pendingTasks,

        medicationConcerns:
          record.medicationConcerns,

        safetyConcerns:
          record.safetyConcerns,
      }),
    )
    .digest(
      'hex',
    );
}

export class CorrectWardHandoverWorkflow {
  public constructor(
    private readonly service:
      NursingObservationCommandService,
  ) {}

  public async execute(
    command:
      NursingObservationEntityCommand<CorrectWardHandoverInput>,
  ) {
    const input =
      correctWardHandoverBodySchema.parse(
        command.input,
      );

    const current =
      await this.service.requireHandover(
        command.actor,
        command.entityId,
      );

    const context =
      await this.service.resolveAdmission(
        command.actor,
        current.admissionId.toHexString(),
      );

    this.service.assertVersion(
      current,
      input.expectedVersion,
      'Ward handover',
    );

    if (
      ![
        'SIGNED',
        'ACKNOWLEDGED',
      ].includes(
        current.status,
      )
    ) {
      throw new Error(
        'Only signed or acknowledged handovers can be corrected',
      );
    }

    await this.service.support.assertAccess(
      'HANDOVER_MANAGE',
      command.actor,
      context,
    );

    return this.service.support.dependencies
      .transactionManager.execute({
        transactionType:
          NURSING_OBSERVATION_TRANSACTION_TYPES
            .CORRECT_HANDOVER,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          `nursing:handover:${context.facilityId}:${command.entityId}`,
        ],

        idempotencyPayload: {
          handoverId:
            command.entityId,

          input,
        },

        journalPayload: {
          operation:
            'CORRECT_HANDOVER',

          handoverId:
            command.entityId,

          expectedVersion:
            input.expectedVersion,
        },

        execute:
          async (
            transaction,
          ) => {
            const locked =
              await this.service.requireHandover(
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
              'Ward handover',
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

            const allocation =
              await this.service.support.allocateNumber(
                lockedContext.facilityId,
                'inpatient.ward_handover.number',
                'WHO',
                occurredAt,
              );

            const replacement =
              await this.service.handovers
                .createReplacement({
                  facilityId:
                    lockedContext.facilityId,

                  admissionId:
                    lockedContext.admissionId,

                  patientId:
                    lockedContext.patient.patientId,

                  encounterId:
                    lockedContext.encounterId,

                  wardId:
                    lockedContext.location.wardId,

                  roomId:
                    lockedContext.location.roomId,

                  bedId:
                    lockedContext.location.bedId,

                  handoverNumber:
                    allocation.number,

                  handoverType:
                    input.replacement.handoverType,

                  shiftCode:
                    this.service.support.normalizedCode(
                      input.replacement.shiftCode,
                    ),

                  summary:
                    this.service.support.normalizedText(
                      input.replacement.summary,
                    ),

                  activeConcerns:
                    input.replacement.activeConcerns.map(
                      (value) =>
                        this.service.support.normalizedText(
                          value,
                        ),
                    ),

                  pendingTasks:
                    input.replacement.pendingTasks.map(
                      (value) =>
                        this.service.support.normalizedText(
                          value,
                        ),
                    ),

                  medicationConcerns:
                    input.replacement.medicationConcerns.map(
                      (value) =>
                        this.service.support.normalizedText(
                          value,
                        ),
                    ),

                  safetyConcerns:
                    input.replacement.safetyConcerns.map(
                      (value) =>
                        this.service.support.normalizedText(
                          value,
                        ),
                    ),

                  fromNurseUserId:
                    command.actor.userId,

                  fromNurseStaffId:
                    staffId,

                  toNurseUserId:
                    input.replacement.toNurseUserId,

                  toNurseStaffId:
                    input.replacement.toNurseStaffId,

                  handedOverAt:
                    new Date(
                      input.replacement.handedOverAt,
                    ),

                  status:
                    'SIGNED',

                  signedAt:
                    occurredAt,

                  supersedesWardHandoverId:
                    command.entityId,

                  transactionId:
                    transaction.transactionId,

                  correlationId:
                    command.actor.correlationId,

                  actorUserId:
                    command.actor.userId,
                });

            await transaction.registerCompensation(
              deleteCreatedObservationRecord(
                `delete-handover-replacement:${replacement._id.toHexString()}`,
                {
                  facilityId:
                    lockedContext.facilityId,

                  collection:
                    'wardHandovers',

                  entityId:
                    replacement._id.toHexString(),

                  expectedVersion:
                    0,

                  transactionId:
                    transaction.transactionId,
                },
              ),
            );

            const updated =
              await this.service.handovers
                .updateStatus({
                  facilityId:
                    lockedContext.facilityId,

                  handoverId:
                    command.entityId,

                  expectedVersion:
                    locked.version,

                  allowedStatuses: [
                    'SIGNED',
                    'ACKNOWLEDGED',
                  ],

                  status:
                    'CORRECTED',

                  supersededByWardHandoverId:
                    replacement._id.toHexString(),

                  actorUserId:
                    command.actor.userId,
                });

            if (
              updated === null
            ) {
              throw new Error(
                'Ward handover concurrency conflict',
              );
            }

            await transaction.registerCompensation(
              restoreHandoverCompensation(
                this.service.support.dependencies
                  .snapshotCrypto,
                locked,
                locked.version + 1,
                transaction.transactionId,
              ),
            );

            const amendmentId =
              await this.service.handovers
                .createAmendment({
                  facilityId:
                    lockedContext.facilityId,

                  admissionId:
                    lockedContext.admissionId,

                  patientId:
                    lockedContext.patient.patientId,

                  handoverId:
                    command.entityId,

                  amendmentSequence:
                    locked.version + 1,

                  amendmentType:
                    'CORRECTION',

                  previousSnapshotHash:
                    snapshotHash(
                      locked,
                    ),

                  replacementHandoverId:
                    replacement._id.toHexString(),

                  reason:
                    this.service.support.normalizedText(
                      input.reason,
                    ),

                  occurredAt,

                  actorUserId:
                    command.actor.userId,

                  actorStaffId:
                    staffId,

                  transactionId:
                    transaction.transactionId,

                  correlationId:
                    command.actor.correlationId,
                });

            await transaction.registerCompensation(
              deleteCreatedObservationRecord(
                `delete-handover-amendment:${amendmentId}`,
                {
                  facilityId:
                    lockedContext.facilityId,

                  collection:
                    'nursingEntryAmendments',

                  entityId:
                    amendmentId,

                  expectedVersion:
                    null,

                  transactionId:
                    transaction.transactionId,
                },
              ),
            );

            const before =
              this.service.handoverProjection(
                locked,
              );

            const after = {
              ...this.service.handoverProjection(
                replacement,
              ),

              correctedHandoverId:
                command.entityId,

              amendmentId,
            };

            await this.service.support.publishMutation({
              transaction,

              actor:
                command.actor,

              occurredAt,

              auditAction:
                NURSING_OBSERVATION_AUDIT_ACTIONS
                  .HANDOVER_CORRECTED,

              outboxEventType:
                NURSING_OBSERVATION_OUTBOX_EVENTS
                  .HANDOVER_CORRECTED,

              realtimeEventType:
                NURSING_OBSERVATION_REALTIME_EVENTS
                  .HANDOVER_WORKLIST_CHANGED,

              entityType:
                'WardHandover',

              entityId:
                replacement._id.toHexString(),

              context:
                lockedContext,

              before,

              after,

              eventPayload:
                after,

              reason:
                input.reason,
            });

            return after;
          },
      });
  }
}

export class EnterWardHandoverInErrorWorkflow {
  public constructor(
    private readonly service:
      NursingObservationCommandService,
  ) {}

  public async execute(
    command:
      NursingObservationEntityCommand<EnterWardHandoverInErrorInput>,
  ) {
    const input =
      enterWardHandoverInErrorBodySchema.parse(
        command.input,
      );

    const current =
      await this.service.requireHandover(
        command.actor,
        command.entityId,
      );

    const context =
      await this.service.resolveAdmission(
        command.actor,
        current.admissionId.toHexString(),
      );

    this.service.assertVersion(
      current,
      input.expectedVersion,
      'Ward handover',
    );

    if (
      ![
        'DRAFT',
        'SIGNED',
        'ACKNOWLEDGED',
      ].includes(
        current.status,
      )
    ) {
      throw new Error(
        'This handover cannot be entered in error',
      );
    }

    await this.service.support.assertAccess(
      'HANDOVER_MANAGE',
      command.actor,
      context,
    );

    return this.service.support.dependencies
      .transactionManager.execute({
        transactionType:
          NURSING_OBSERVATION_TRANSACTION_TYPES
            .ENTER_HANDOVER_IN_ERROR,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          `nursing:handover:${context.facilityId}:${command.entityId}`,
        ],

        idempotencyPayload: {
          handoverId:
            command.entityId,

          input,
        },

        journalPayload: {
          operation:
            'ENTER_HANDOVER_IN_ERROR',

          handoverId:
            command.entityId,

          expectedVersion:
            input.expectedVersion,
        },

        execute:
          async (
            transaction,
          ) => {
            const locked =
              await this.service.requireHandover(
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

            const updated =
              await this.service.handovers
                .updateStatus({
                  facilityId:
                    lockedContext.facilityId,

                  handoverId:
                    command.entityId,

                  expectedVersion:
                    locked.version,

                  allowedStatuses: [
                    'DRAFT',
                    'SIGNED',
                    'ACKNOWLEDGED',
                  ],

                  status:
                    'ENTERED_IN_ERROR',

                  actorUserId:
                    command.actor.userId,
                });

            if (
              updated === null
            ) {
              throw new Error(
                'Ward handover concurrency conflict',
              );
            }

            await transaction.registerCompensation(
              restoreHandoverCompensation(
                this.service.support.dependencies
                  .snapshotCrypto,
                locked,
                locked.version + 1,
                transaction.transactionId,
              ),
            );

            const amendmentId =
              await this.service.handovers
                .createAmendment({
                  facilityId:
                    lockedContext.facilityId,

                  admissionId:
                    lockedContext.admissionId,

                  patientId:
                    lockedContext.patient.patientId,

                  handoverId:
                    command.entityId,

                  amendmentSequence:
                    locked.version + 1,

                  amendmentType:
                    'ENTERED_IN_ERROR',

                  previousSnapshotHash:
                    snapshotHash(
                      locked,
                    ),

                  replacementHandoverId:
                    null,

                  reason:
                    this.service.support.normalizedText(
                      input.reason,
                    ),

                  occurredAt,

                  actorUserId:
                    command.actor.userId,

                  actorStaffId:
                    staffId,

                  transactionId:
                    transaction.transactionId,

                  correlationId:
                    command.actor.correlationId,
                });

            await transaction.registerCompensation(
              deleteCreatedObservationRecord(
                `delete-handover-amendment:${amendmentId}`,
                {
                  facilityId:
                    lockedContext.facilityId,

                  collection:
                    'nursingEntryAmendments',

                  entityId:
                    amendmentId,

                  expectedVersion:
                    null,

                  transactionId:
                    transaction.transactionId,
                },
              ),
            );

            const before =
              this.service.handoverProjection(
                locked,
              );

            const after = {
              ...this.service.handoverProjection(
                updated,
              ),

              amendmentId,
            };

            await this.service.support.publishMutation({
              transaction,

              actor:
                command.actor,

              occurredAt,

              auditAction:
                NURSING_OBSERVATION_AUDIT_ACTIONS
                  .HANDOVER_ENTERED_IN_ERROR,

              outboxEventType:
                NURSING_OBSERVATION_OUTBOX_EVENTS
                  .HANDOVER_ENTERED_IN_ERROR,

              realtimeEventType:
                NURSING_OBSERVATION_REALTIME_EVENTS
                  .HANDOVER_WORKLIST_CHANGED,

              entityType:
                'WardHandover',

              entityId:
                command.entityId,

              context:
                lockedContext,

              before,

              after,

              eventPayload:
                after,

              reason:
                input.reason,
            });

            return after;
          },
      });
  }
}

export class ListWardHandoverWorklistWorkflow {
  public constructor(
    private readonly service:
      NursingObservationCommandService,
  ) {}

  public async execute(
    actor:
      NursingObservationEntityCommand<unknown>['actor'],

    query:
      WardHandoverListQuery,
  ) {
    const parsed =
      wardHandoverListQuerySchema.parse(
        query,
      );

    if (
      parsed.admissionId != null
    ) {
      const context =
        await this.service.resolveAdmission(
          actor,
          parsed.admissionId,
        );

      await this.service.support.assertAccess(
        'HANDOVER_READ',
        actor,
        context,
      );
    }

    const result =
      await this.service.handovers.list(
        actor.facilityId,
        parsed,
      );

    return {
      ...result,

      items:
        result.items.map(
          (record) =>
            this.service.handoverProjection(
              record,
            ),
        ),
    };
  }
}