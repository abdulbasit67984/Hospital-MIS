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
  assertFacilityParentChain,
  facilityChangedFields,
  facilityPreviousSnapshot,
  normalizeUpdateFacilityInput,
  requireActorFacilityId,
  throwMappedFacilityPersistenceError,
} from '../facility.workflow-helpers.js';

import {
  FacilityConcurrencyError,
  FacilityNotFoundError,
} from '../facility.errors.js';

import {
  nullableObjectIdToString,
  toFacilityDto,
} from '../facility.mapper.js';

import type {
  FacilityActorContext,
  FacilityDto,
  UpdateFacilityInput,
} from '../facility.types.js';

import type {
  FacilityRepository,
} from '../repositories/facility.repository.js';

export interface UpdateFacilityCommand {
  facilityId: string;
  input: UpdateFacilityInput;
  actor: FacilityActorContext;
  idempotencyKey: string;
}

export class UpdateFacilityWorkflow {
  public constructor(
    private readonly repository:
      FacilityRepository,

    private readonly dependencies:
      FacilityMutationDependencies,
  ) {}

  public async execute(
    command:
      UpdateFacilityCommand,
  ): Promise<FacilityDto> {
    const transactionFacilityId =
      requireActorFacilityId(
        command.actor,
      );

    const initial =
      await this.repository.findById(
        command.facilityId,
      );

    if (initial === null) {
      throw new FacilityNotFoundError();
    }

    if (
      initial.version !==
      command.input.expectedVersion
    ) {
      throw new FacilityConcurrencyError();
    }

    const input =
      normalizeUpdateFacilityInput(
        command.input,
        initial,
      );

    const parentFacilityId =
      input.parentFacilityId ===
      undefined
        ? nullableObjectIdToString(
            initial.parentFacilityId,
          )
        : input.parentFacilityId;

    await assertFacilityParentChain(
      this.repository,
      parentFacilityId ??
        null,
      command.facilityId,
    );

    try {
      return await this.dependencies
        .transactionManager
        .execute({
          transactionType:
            FACILITY_TRANSACTION_TYPES
              .UPDATE_FACILITY,

          idempotencyKey:
            command.idempotencyKey,

          actorUserId:
            command.actor.userId,

          facilityId:
            transactionFacilityId,

          correlationId:
            command.actor.correlationId,

          lockKeys: [
            `facility:id:${command.facilityId}`,
            `facility:parent:${parentFacilityId ?? 'ROOT'}`,
          ],

          payload: {
            facilityId:
              command.facilityId,

            input,
          },

          execute:
            async (
              transaction,
            ) => {
              const current =
                await this.repository.findById(
                  command.facilityId,
                );

              if (current === null) {
                throw new FacilityNotFoundError();
              }

              if (
                current.version !==
                input.expectedVersion
              ) {
                throw new FacilityConcurrencyError();
              }

              const currentParentId =
                input.parentFacilityId ===
                undefined
                  ? nullableObjectIdToString(
                      current.parentFacilityId,
                    )
                  : input.parentFacilityId;

              await assertFacilityParentChain(
                this.repository,
                currentParentId ??
                  null,
                command.facilityId,
              );

              await transaction
                .registerCompensation({
                  key:
                    `restore-facility:${command.facilityId}`,

                  type:
                    FACILITY_COMPENSATION_TYPES
                      .RESTORE_FACILITY,

                  payload: {
                    facilityId:
                      command.facilityId,

                    expectedPostVersion:
                      current.version +
                      1,

                    previous:
                      facilityPreviousSnapshot(
                        current,
                      ),

                    transactionId:
                      transaction.transactionId,
                  },
                });

              const updated =
                await this.repository
                  .updateWithVersion(
                    command.facilityId,
                    input,
                    command.actor.userId,
                  );

              if (updated === null) {
                throw new FacilityConcurrencyError();
              }

              await transaction.checkpoint(
                FACILITY_TRANSACTION_CHECKPOINTS
                  .FACILITY_UPDATED,
                {
                  facilityId:
                    command.facilityId,

                  version:
                    updated.version,
                },
              );

              const before =
                toFacilityDto(
                  current,
                );

              const after =
                toFacilityDto(
                  updated,
                );

              const changed =
                facilityChangedFields(
                  before,
                  after,
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
                    `${transaction.transactionId}:audit:facility-updated`,

                  action:
                    FACILITY_AUDIT_ACTIONS
                      .FACILITY_UPDATED,

                  entityType:
                    'Facility',

                  entityId:
                    command.facilityId,

                  ...buildFacilityAuditActorFields(
                    command.actor,
                  ),

                  facilityId:
                    command.facilityId,

                  occurredAt:
                    now,

                  before,

                  after,

                  metadata: {
                    idempotencyKey:
                      command.idempotencyKey,

                    changedFields:
                      changed,

                    transactionFacilityId,
                  },
                });

              await transaction.checkpoint(
                FACILITY_TRANSACTION_CHECKPOINTS
                  .AUDIT_APPENDED,
                {
                  facilityId:
                    command.facilityId,
                },
              );

              await this.dependencies
                .outbox
                .enqueue({
                  transactionId:
                    transaction.transactionId,

                  deduplicationKey:
                    `${transaction.transactionId}:outbox:facility-updated`,

                  eventType:
                    FACILITY_OUTBOX_EVENTS
                      .FACILITY_UPDATED,

                  aggregateType:
                    'Facility',

                  aggregateId:
                    command.facilityId,

                  actorUserId:
                    command.actor.userId,

                  facilityId:
                    command.facilityId,

                  correlationId:
                    command.actor.correlationId,

                  occurredAt:
                    now,

                  payload: {
                    before,
                    after,
                    changedFields:
                      changed,
                  },
                });

              await transaction.checkpoint(
                FACILITY_TRANSACTION_CHECKPOINTS
                  .OUTBOX_ENQUEUED,
                {
                  facilityId:
                    command.facilityId,
                },
              );

              return after;
            },
        });
    } catch (error) {
      throwMappedFacilityPersistenceError(
        error,
        'Facility',
        initial.code,
      );
    }
  }
}