import {
  FACILITY_STATUS,
} from '../facility.constants.js';

import {
  FacilityConcurrencyError,
  FacilityNotFoundError,
} from '../facility.errors.js';

import {
  nullableObjectIdToString,
  toFacilityDto,
} from '../facility.mapper.js';

import {
  buildFacilityAuditActorFields,
  type FacilityMutationDependencies,
} from '../facility.ports.js';

import {
  FACILITY_AUDIT_ACTIONS,
  FACILITY_COMPENSATION_TYPES,
  FACILITY_OUTBOX_EVENTS,
  FACILITY_TRANSACTION_CHECKPOINTS,
  FACILITY_TRANSACTION_TYPES,
} from '../facility.transaction.constants.js';

import type {
  FacilityActorContext,
  FacilityDto,
} from '../facility.types.js';

import {
  assertFacilityParentChain,
  requireActorFacilityId,
} from '../facility.workflow-helpers.js';

import type {
  FacilityRepository,
} from '../repositories/facility.repository.js';

export interface ActivateFacilityCommand {
  facilityId: string;
  expectedVersion: number;
  reason: string;
  actor: FacilityActorContext;
  idempotencyKey: string;
}

function lifecycleSnapshot(
  facility:
    Awaited<
      ReturnType<
        FacilityRepository['findById']
      >
    > extends infer T
      ? Exclude<T, null>
      : never,
): Record<string, unknown> {
  return {
    status:
      facility.status,

    allowsAuthentication:
      facility.allowsAuthentication,

    deactivatedAt:
      facility.deactivatedAt
        ?.toISOString() ??
      null,

    deactivatedBy:
      nullableObjectIdToString(
        facility.deactivatedBy,
      ),

    deactivationReason:
      facility.deactivationReason,

    version:
      facility.version,

    updatedBy:
      nullableObjectIdToString(
        facility.updatedBy,
      ),

    updatedAt:
      facility.updatedAt
        .toISOString(),
  };
}

export class ActivateFacilityWorkflow {
  public constructor(
    private readonly repository:
      FacilityRepository,

    private readonly dependencies:
      FacilityMutationDependencies,
  ) {}

  public async execute(
    command:
      ActivateFacilityCommand,
  ): Promise<FacilityDto> {
    const transactionFacilityId =
      requireActorFacilityId(
        command.actor,
      );

    const initial =
      await this.repository.findById(
        command.facilityId,
      );

    if (
      initial === null
    ) {
      throw new FacilityNotFoundError();
    }

    if (
      initial.version !==
      command.expectedVersion
    ) {
      throw new FacilityConcurrencyError();
    }

    if (
      initial.status ===
      FACILITY_STATUS.ACTIVE
    ) {
      return toFacilityDto(
        initial,
      );
    }

    await assertFacilityParentChain(
      this.repository,
      nullableObjectIdToString(
        initial.parentFacilityId,
      ),
      command.facilityId,
    );

    return this.dependencies
      .transactionManager
      .execute({
        transactionType:
          FACILITY_TRANSACTION_TYPES
            .ACTIVATE_FACILITY,

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
          `facility:parent:${nullableObjectIdToString(
            initial.parentFacilityId,
          ) ?? 'ROOT'}`,
        ],

        payload: {
          facilityId:
            command.facilityId,

          expectedVersion:
            command.expectedVersion,

          reason:
            command.reason,
        },

        execute:
          async (
            transaction,
          ) => {
            const current =
              await this.repository.findById(
                command.facilityId,
              );

            if (
              current === null
            ) {
              throw new FacilityNotFoundError();
            }

            if (
              current.version !==
              command.expectedVersion
            ) {
              throw new FacilityConcurrencyError();
            }

            if (
              current.status ===
              FACILITY_STATUS.ACTIVE
            ) {
              return toFacilityDto(
                current,
              );
            }

            await assertFacilityParentChain(
              this.repository,
              nullableObjectIdToString(
                current.parentFacilityId,
              ),
              command.facilityId,
            );

            await transaction
              .registerCompensation({
                key:
                  `restore-facility-lifecycle:${command.facilityId}`,

                type:
                  FACILITY_COMPENSATION_TYPES
                    .RESTORE_FACILITY_LIFECYCLE,

                payload: {
                  facilityId:
                    command.facilityId,

                  expectedPostVersion:
                    current.version +
                    1,

                  previous:
                    lifecycleSnapshot(
                      current,
                    ),
                },
              });

            const updated =
              await this.repository
                .changeStatus({
                  facilityId:
                    command.facilityId,

                  expectedVersion:
                    current.version,

                  status:
                    FACILITY_STATUS.ACTIVE,

                  actorUserId:
                    command.actor.userId,

                  reason:
                    command.reason,

                  changedAt:
                    this.dependencies
                      .clock
                      .now(),
                });

            if (
              updated === null
            ) {
              throw new FacilityConcurrencyError();
            }

            const before =
              toFacilityDto(
                current,
              );

            const after =
              toFacilityDto(
                updated,
              );

            await transaction.checkpoint(
              FACILITY_TRANSACTION_CHECKPOINTS
                .FACILITY_ACTIVATED,
              {
                facilityId:
                  command.facilityId,

                version:
                  updated.version,
              },
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
                  `${transaction.transactionId}:audit:facility-activated`,

                action:
                  FACILITY_AUDIT_ACTIONS
                    .FACILITY_ACTIVATED,

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

                reason:
                  command.reason,

                before,

                after,

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
                  `${transaction.transactionId}:outbox:facility-activated`,

                eventType:
                  FACILITY_OUTBOX_EVENTS
                    .FACILITY_ACTIVATED,

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
                  reason:
                    command.reason,
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
  }
}