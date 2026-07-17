import {
  FACILITY_AUDIT_ACTIONS,
  FACILITY_COMPENSATION_TYPES,
  FACILITY_OUTBOX_EVENTS,
  FACILITY_TRANSACTION_CHECKPOINTS,
  FACILITY_TRANSACTION_TYPES,
} from '../facility.transaction.constants.js';

import {
  buildFacilityAuditActorFields,
  type FacilityMutationDependencies,
} from '../facility.ports.js';

import {
  normalizeCreateFacilityInput,
  requireActorFacilityId,
  assertFacilityParentChain,
  throwMappedFacilityPersistenceError,
} from '../facility.workflow-helpers.js';

import {
  toFacilityDto,
} from '../facility.mapper.js';

import {
  FacilityCodeConflictError,
} from '../facility.errors.js';

import type {
  CreateFacilityInput,
  FacilityActorContext,
  FacilityDto,
} from '../facility.types.js';

import type {
  FacilityRepository,
} from '../repositories/facility.repository.js';

export interface CreateFacilityCommand {
  input: CreateFacilityInput;
  actor: FacilityActorContext;
  idempotencyKey: string;
}

export class CreateFacilityWorkflow {
  public constructor(
    private readonly repository:
      FacilityRepository,

    private readonly dependencies:
      FacilityMutationDependencies,
  ) {}

  public async execute(
    command:
      CreateFacilityCommand,
  ): Promise<FacilityDto> {
    const input =
      normalizeCreateFacilityInput(
        command.input,
      );

    const transactionFacilityId =
      requireActorFacilityId(
        command.actor,
      );

    await this.assertCodeAvailable(
      input.code,
    );

    await assertFacilityParentChain(
      this.repository,
      input.parentFacilityId ??
        null,
    );

    try {
      return await this.dependencies
        .transactionManager
        .execute({
          transactionType:
            FACILITY_TRANSACTION_TYPES
              .CREATE_FACILITY,

          idempotencyKey:
            command.idempotencyKey,

          actorUserId:
            command.actor.userId,

          facilityId:
            transactionFacilityId,

          correlationId:
            command.actor.correlationId,

          lockKeys: [
            `facility:code:${input.code}`,
            `facility:parent:${input.parentFacilityId ?? 'ROOT'}`,
          ],

          payload: {
            input,
          },

          execute:
            async (
              transaction,
            ) => {
              await this.assertCodeAvailable(
                input.code,
              );

              await assertFacilityParentChain(
                this.repository,
                input.parentFacilityId ??
                  null,
              );

              const created =
                await this.repository.create({
                  ...input,

                  createdBy:
                    command.actor.userId,
                });

              const facilityId =
                created._id.toHexString();

              await transaction
                .registerCompensation({
                  key:
                    `delete-created-facility:${facilityId}`,

                  type:
                    FACILITY_COMPENSATION_TYPES
                      .DELETE_CREATED_FACILITY,

                  payload: {
                    facilityId,

                    expectedVersion:
                      created.version,

                    transactionId:
                      transaction.transactionId,
                  },
                });

              await transaction.checkpoint(
                FACILITY_TRANSACTION_CHECKPOINTS
                  .FACILITY_CREATED,
                {
                  facilityId,
                },
              );

              const facility =
                toFacilityDto(
                  created,
                );

              const now =
                this.dependencies
                  .clock
                  .now();

              await this.dependencies
                .audit
                .append({
                  transactionId:
                    transaction.transactionId,

                  deduplicationKey:
                    `${transaction.transactionId}:audit:facility-created`,

                  action:
                    FACILITY_AUDIT_ACTIONS
                      .FACILITY_CREATED,

                  entityType:
                    'Facility',

                  entityId:
                    facilityId,

                  ...buildFacilityAuditActorFields(
                    command.actor,
                  ),

                  facilityId,

                  occurredAt:
                    now,

                  before:
                    null,

                  after:
                    facility,

                  metadata: {
                    idempotencyKey:
                      command.idempotencyKey,

                    transactionFacilityId,
                  },
                });

              await transaction.checkpoint(
                FACILITY_TRANSACTION_CHECKPOINTS
                  .AUDIT_APPENDED,
                {
                  facilityId,
                },
              );

              await this.dependencies
                .outbox
                .enqueue({
                  transactionId:
                    transaction.transactionId,

                  deduplicationKey:
                    `${transaction.transactionId}:outbox:facility-created`,

                  eventType:
                    FACILITY_OUTBOX_EVENTS
                      .FACILITY_CREATED,

                  aggregateType:
                    'Facility',

                  aggregateId:
                    facilityId,

                  actorUserId:
                    command.actor.userId,

                  facilityId,

                  correlationId:
                    command.actor.correlationId,

                  occurredAt:
                    now,

                  payload: {
                    facility,
                  },
                });

              await transaction.checkpoint(
                FACILITY_TRANSACTION_CHECKPOINTS
                  .OUTBOX_ENQUEUED,
                {
                  facilityId,
                },
              );

              return facility;
            },
        });
    } catch (error) {
      throwMappedFacilityPersistenceError(
        error,
        'Facility',
        input.code,
      );
    }
  }

  private async assertCodeAvailable(
    code: string,
  ): Promise<void> {
    const existing =
      await this.repository.findByCode(
        code,
      );

    if (existing !== null) {
      throw new FacilityCodeConflictError(
        code,
      );
    }
  }
}