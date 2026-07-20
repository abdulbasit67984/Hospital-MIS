import {
  Decimal128,
} from 'mongodb';

import {
  toObjectId,
} from '@hospital-mis/database';

import {
  ActiveAdmissionAssignmentConflictError,
  ActiveBedHoldConflictError,
  ActiveBedOccupancyConflictError,
  AdmissionConcurrencyError,
  BedAssignmentNotFoundError,
  BedHoldNotFoundError,
  InpatientBedConcurrencyError,
  InpatientBedNotAvailableError,
  InpatientBedRateResolutionError,
  InpatientClinicalContextMismatchError,
} from '../inpatient.errors.js';

import {
  assertBedAssignmentTransition,
  assertBedHoldTransition,
  assertBedStatusTransition,
  assertInpatientBedAllocatable,
  assertInpatientBedCompatibility,
} from '../inpatient.lifecycle.js';

import {
  INPATIENT_NUMBER_SEQUENCE_NAMESPACE,
} from '../inpatient.constants.js';

import {
  INPATIENT_BED_OPERATION_AUDIT_ACTIONS,
  INPATIENT_BED_OPERATION_EVENTS,
  INPATIENT_BED_OPERATION_REALTIME_EVENTS,
  INPATIENT_BED_OPERATION_REASON_CODES,
  INPATIENT_BED_OPERATION_TRANSACTION_TYPES,
} from '../inpatient-bed-operations.constants.js';

import type {
  InpatientBedBillingPort,
  InpatientBedChargeCalculatorPort,
  InpatientBedOperationRepositoryPort,
} from '../inpatient-bed-operations.ports.js';

import type {
  AssignBedInput,
  InpatientBedOperationCommand,
  ReleaseBedHoldInput,
  ReleaseBedInput,
  ReserveBedInput,
  ReverseBedChargeInput,
  SubmitBedChargeInput,
  TransferBedInput,
} from '../inpatient-bed-operations.types.js';

import {
  assignBedBodySchema,
  releaseBedBodySchema,
  releaseBedHoldBodySchema,
  reserveBedBodySchema,
  reverseBedChargeBodySchema,
  submitBedChargeBodySchema,
  transferBedBodySchema,
} from '../inpatient-bed-operations.validation.js';

import {
  buildInpatientSequenceKey,
  formatInpatientNumber,
} from '../inpatient.normalization.js';

import {
  admissionMutationLockKeys,
  bedMutationLockKeys,
  inpatientLockKey,
  safeAdmissionSnapshot,
  safeBedSnapshot,
  safeInpatientJournalPayload,
} from '../inpatient.workflow-helpers.js';

import {
  InpatientCommandService,
} from './inpatient-command.service.js';

export interface InpatientBedOperationDependencies {
  operations:
    InpatientBedOperationRepositoryPort;

  billing:
    InpatientBedBillingPort;

  calculator:
    InpatientBedChargeCalculatorPort;
}

export class InpatientBedOperationService {
  public constructor(
    private readonly support:
      InpatientCommandService,

    private readonly dependencies:
      InpatientBedOperationDependencies,
  ) {}

  private async publish(
    input:
      Readonly<{
        actor:
          import('../inpatient.types.js')
            .InpatientActorContext;

        transactionId:
          string;

        action:
          string;

        eventType:
          string;

        entityType:
          string;

        entityId:
          string;

        occurredAt:
          Date;

        before:
          unknown;

        after:
          Record<string, unknown>;

        wardId?:
          string;

        roomId?:
          string;

        bedId?:
          string;

        admissionId?:
          string;
      }>,
  ): Promise<void> {
    await this.support.dependencies.audit.append({
      transactionId:
        input.transactionId,

      deduplicationKey:
        this.support.deduplicationKey(
          input.transactionId,
          input.action,
          input.entityId,
        ),

      action:
        input.action,

      entityType:
        input.entityType,

      entityId:
        input.entityId,

      ...this.support.auditActorFields(
        input.actor,
      ),

      occurredAt:
        input.occurredAt,

      before:
        input.before,

      after:
        input.after,
    });

    await this.support.dependencies.outbox.enqueue({
      transactionId:
        input.transactionId,

      deduplicationKey:
        this.support.deduplicationKey(
          input.transactionId,
          input.eventType,
          input.entityId,
        ),

      eventType:
        input.eventType,

      aggregateType:
        input.entityType,

      aggregateId:
        input.entityId,

      actorUserId:
        input.actor.userId,

      facilityId:
        input.actor.facilityId,

      correlationId:
        input.actor.correlationId,

      occurredAt:
        input.occurredAt,

      payload:
        input.after,
    });

    await this.support.dependencies.realtime.publish({
      eventType:
        input.admissionId ===
        undefined
          ? INPATIENT_BED_OPERATION_REALTIME_EVENTS
              .BED_MAP_CHANGED
          : INPATIENT_BED_OPERATION_REALTIME_EVENTS
              .ADMISSION_LOCATION_CHANGED,

      facilityId:
        input.actor.facilityId,

      ...(
        input.wardId ===
        undefined
          ? {}
          : {
              wardId:
                input.wardId,
            }
      ),

      ...(
        input.roomId ===
        undefined
          ? {}
          : {
              roomId:
                input.roomId,
            }
      ),

      ...(
        input.bedId ===
        undefined
          ? {}
          : {
              bedId:
                input.bedId,
            }
      ),

      ...(
        input.admissionId ===
        undefined
          ? {}
          : {
              admissionId:
                input.admissionId,
            }
      ),

      payload:
        input.after,
    });
  }

  public async reserveBed(
    command:
      InpatientBedOperationCommand<ReserveBedInput>,
  ) {
    const input =
      reserveBedBodySchema.parse(
        command.input,
      );

    const [
      admission,
      bed,
    ] =
      await Promise.all([
        this.support.requireAdmission(
          command.actor,
          input.admissionId,
        ),

        this.support.requireBed(
          command.actor,
          input.bedId,
        ),
      ]);

    const [
      ward,
      room,
    ] =
      await Promise.all([
        this.support.requireWard(
          command.actor,
          bed.wardId.toHexString(),
        ),

        this.support.requireRoom(
          command.actor,
          bed.roomId.toHexString(),
        ),
      ]);

    this.support.assertExpectedVersion(
      bed,
      input.expectedBedVersion,
      'BED',
    );

    await this.support.assertAccess(
      command.actor,
      'BED_ASSIGN',
      {
        admission,
        ward,
        room,
        bed,
      },
    );

    if (
      ![
        'ACCEPTED',
        'AWAITING_BED',
      ].includes(
        admission.status,
      )
    ) {
      throw new InpatientClinicalContextMismatchError(
        'Only accepted admissions awaiting allocation may reserve a bed',
      );
    }

    assertInpatientBedAllocatable(
      ward,
      room,
      bed,
    );

    const existingHold =
      await this.support.admissions
        .findActiveBedHold(
          command.actor.facilityId,
          bed._id.toHexString(),
        );

    if (
      existingHold !==
      null
    ) {
      throw new ActiveBedHoldConflictError();
    }

    const existingAssignment =
      await this.support.admissions
        .findActiveBedAssignment(
          command.actor.facilityId,
          bed._id.toHexString(),
        );

    if (
      existingAssignment !==
      null
    ) {
      throw new ActiveBedOccupancyConflictError();
    }

    const patient =
      await this.support.context.resolvePatient(
        command.actor.facilityId,
        admission.patientId.toHexString(),
      );

    assertInpatientBedCompatibility(
      {
        patientSex:
          patient.sexAtBirth,

        ageYears:
          patient.ageYears,

        specialtyCodes:
          admission.diagnosisSnapshots.map(
            (
              diagnosis,
            ) =>
              diagnosis.diagnosisCode,
          ),

        requiredIsolationCapabilities:
          [],

        infectionControlTags:
          [],
      },

      ward,
      room,
      bed,
    );

    const actorStaffId =
      await this.support.actorStaffId(
        command.actor,
      );

    return this.support.dependencies
      .transactionManager.execute({
        transactionType:
          INPATIENT_BED_OPERATION_TRANSACTION_TYPES
            .RESERVE_BED,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          ...admissionMutationLockKeys(
            command.actor.facilityId,
            admission,
          ),

          ...bedMutationLockKeys(
            command.actor.facilityId,
            bed.wardId.toHexString(),
            bed.roomId.toHexString(),
            bed._id.toHexString(),
          ),
        ],

        idempotencyPayload: {
          admissionId:
            input.admissionId,

          bedId:
            input.bedId,

          expectedBedVersion:
            input.expectedBedVersion,
        },

        journalPayload:
          safeInpatientJournalPayload(
            'RESERVE_BED',
            {
              admissionId:
                input.admissionId,

              bedId:
                input.bedId,
            },
          ),

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              this.support.dependencies
                .clock.now();

            const expiresAt =
              new Date(
                occurredAt.getTime() +
                (
                  input.holdMinutes *
                  60_000
                ),
              );

            const allocation =
              await this.support.dependencies
                .sequence.next(
                  command.actor.facilityId,

                  buildInpatientSequenceKey(
                    INPATIENT_NUMBER_SEQUENCE_NAMESPACE
                      .BED_HOLD,

                    occurredAt,
                  ),
                );

            const actorId =
              toObjectId(
                command.actor.userId,
                'actorUserId',
              );

            const hold =
              await this.dependencies.operations
                .createBedHold({
                  facilityId:
                    admission.facilityId,

                  holdNumber:
                    formatInpatientNumber(
                      'BED-HOLD',
                      occurredAt,
                      allocation.value,
                    ),

                  bedId:
                    bed._id,

                  roomId:
                    bed.roomId,

                  wardId:
                    bed.wardId,

                  admissionId:
                    admission._id,

                  admissionRecommendationId:
                    admission.admissionRecommendationId,

                  patientId:
                    admission.patientId,

                  holdType:
                    input.holdType,

                  status:
                    'ACTIVE',

                  isActive:
                    true,

                  heldAt:
                    occurredAt,

                  expiresAt,

                  heldBy:
                    actorId,

                  heldByStaffId:
                    toObjectId(
                      actorStaffId,
                      'actorStaffId',
                    ),

                  reasonCode:
                    this.support.normalizedCode(
                      input.reasonCode,
                    ),

                  reason:
                    this.support.displayText(
                      input.reason,
                    ),

                  consumedAt:
                    null,

                  consumedBy:
                    null,

                  admissionBedAssignmentId:
                    null,

                  endedAt:
                    null,

                  endedBy:
                    null,

                  endingReason:
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
                    actorId,

                  updatedBy:
                    actorId,
                });

            const projected =
              await this.dependencies.operations
                .projectBedState(
                  command.actor.facilityId,
                  bed._id.toHexString(),
                  input.expectedBedVersion,
                  {
                    operationalStatus:
                      'RESERVED',

                    operationalStatusChangedAt:
                      occurredAt,

                    operationalStatusChangedBy:
                      actorId,

                    operationalStatusReasonCode:
                      INPATIENT_BED_OPERATION_REASON_CODES
                        .BED_RESERVED,

                    operationalStatusReason:
                      this.support.displayText(
                        input.reason,
                      ),

                    activeHoldId:
                      hold._id,

                    maintenanceReference:
                      null,

                    updatedBy:
                      actorId,
                  },
                );

            if (
              projected ===
              null
            ) {
              throw new InpatientBedConcurrencyError();
            }

            await this.publish({
              actor:
                command.actor,

              transactionId:
                transaction.transactionId,

              action:
                INPATIENT_BED_OPERATION_AUDIT_ACTIONS
                  .BED_RESERVED,

              eventType:
                INPATIENT_BED_OPERATION_EVENTS
                  .BED_RESERVED,

              entityType:
                'BedHold',

              entityId:
                hold._id.toHexString(),

              occurredAt,

              before:
                safeBedSnapshot(
                  bed,
                ),

              after: {
                holdId:
                  hold._id.toHexString(),

                holdNumber:
                  hold.holdNumber,

                admissionId:
                  admission._id.toHexString(),

                bed:
                  safeBedSnapshot(
                    projected,
                  ),

                expiresAt:
                  hold.expiresAt.toISOString(),
              },

              wardId:
                bed.wardId.toHexString(),

              roomId:
                bed.roomId.toHexString(),

              bedId:
                bed._id.toHexString(),

              admissionId:
                admission._id.toHexString(),
            });

            return {
              hold,
              bed:
                projected,
            };
          },
      });
  }

  public async releaseBedHold(
    command:
      import('../inpatient-bed-operations.types.js')
        .InpatientBedHoldEntityCommand<ReleaseBedHoldInput>,
  ) {
    const input =
      releaseBedHoldBodySchema.parse(
        command.input,
      );

    const hold =
      await this.dependencies.operations
        .findBedHoldById(
          command.actor.facilityId,
          command.bedHoldId,
        );

    if (
      hold === null
    ) {
      throw new BedHoldNotFoundError();
    }

    const bed =
      await this.support.requireBed(
        command.actor,
        hold.bedId.toHexString(),
      );

    assertBedHoldTransition(
      hold.status,
      'RELEASED',
    );

    await this.support.assertAccess(
      command.actor,
      'BED_ASSIGN',
      {
        bed,
      },
    );

    return this.support.dependencies
      .transactionManager.execute({
        transactionType:
          INPATIENT_BED_OPERATION_TRANSACTION_TYPES
            .RELEASE_BED_HOLD,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys:
          bedMutationLockKeys(
            command.actor.facilityId,
            bed.wardId.toHexString(),
            bed.roomId.toHexString(),
            bed._id.toHexString(),
          ),

        idempotencyPayload: {
          bedHoldId:
            command.bedHoldId,

          input,
        },

        journalPayload:
          safeInpatientJournalPayload(
            'RELEASE_BED_HOLD',
            {
              bedHoldId:
                command.bedHoldId,

              bedId:
                bed._id.toHexString(),
            },
          ),

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              this.support.dependencies
                .clock.now();

            const actorId =
              toObjectId(
                command.actor.userId,
                'actorUserId',
              );

            const released =
              await this.dependencies.operations
                .updateBedHold(
                  command.actor.facilityId,
                  hold._id.toHexString(),
                  input.expectedHoldVersion,
                  {
                    status:
                      'RELEASED',

                    isActive:
                      false,

                    endedAt:
                      occurredAt,

                    endedBy:
                      actorId,

                    endingReason:
                      this.support.displayText(
                        input.reason,
                      ),

                    updatedBy:
                      actorId,
                  },
                );

            if (
              released ===
              null
            ) {
              throw new ActiveBedHoldConflictError();
            }

            const projected =
              await this.dependencies.operations
                .projectBedState(
                  command.actor.facilityId,
                  bed._id.toHexString(),
                  input.expectedBedVersion,
                  {
                    operationalStatus:
                      'AVAILABLE',

                    operationalStatusChangedAt:
                      occurredAt,

                    operationalStatusChangedBy:
                      actorId,

                    operationalStatusReasonCode:
                      INPATIENT_BED_OPERATION_REASON_CODES
                        .RESERVATION_RELEASED,

                    operationalStatusReason:
                      this.support.displayText(
                        input.reason,
                      ),

                    activeHoldId:
                      null,

                    updatedBy:
                      actorId,
                  },
                );

            if (
              projected ===
              null
            ) {
              throw new InpatientBedConcurrencyError();
            }

            await this.publish({
              actor:
                command.actor,

              transactionId:
                transaction.transactionId,

              action:
                INPATIENT_BED_OPERATION_AUDIT_ACTIONS
                  .BED_HOLD_RELEASED,

              eventType:
                INPATIENT_BED_OPERATION_EVENTS
                  .BED_HOLD_RELEASED,

              entityType:
                'BedHold',

              entityId:
                released._id.toHexString(),

              occurredAt,

              before: {
                status:
                  hold.status,

                bed:
                  safeBedSnapshot(
                    bed,
                  ),
              },

              after: {
                status:
                  released.status,

                bed:
                  safeBedSnapshot(
                    projected,
                  ),
              },

              wardId:
                bed.wardId.toHexString(),

              roomId:
                bed.roomId.toHexString(),

              bedId:
                bed._id.toHexString(),

              admissionId:
                hold.admissionId?.toHexString(),
            });

            return {
              hold:
                released,

              bed:
                projected,
            };
          },
      });
  }

  public async assignBed(
    command:
      InpatientBedOperationCommand<AssignBedInput>,
  ) {
    const input =
      assignBedBodySchema.parse(
        command.input,
      );

    const [
      admission,
      bed,
    ] =
      await Promise.all([
        this.support.requireAdmission(
          command.actor,
          input.admissionId,
        ),

        this.support.requireBed(
          command.actor,
          input.bedId,
        ),
      ]);

    const [
      ward,
      room,
    ] =
      await Promise.all([
        this.support.requireWard(
          command.actor,
          bed.wardId.toHexString(),
        ),

        this.support.requireRoom(
          command.actor,
          bed.roomId.toHexString(),
        ),
      ]);

    this.support.assertExpectedVersion(
      admission,
      input.expectedAdmissionVersion,
      'ADMISSION',
    );

    this.support.assertExpectedVersion(
      bed,
      input.expectedBedVersion,
      'BED',
    );

    await this.support.assertAccess(
      command.actor,
      'BED_ASSIGN',
      {
        admission,
        ward,
        room,
        bed,
      },
    );

    if (
      ![
        'ACCEPTED',
        'AWAITING_BED',
      ].includes(
        admission.status,
      )
    ) {
      throw new InpatientClinicalContextMismatchError(
        'The admission is not awaiting its initial bed assignment',
      );
    }

    const activeAdmissionAssignment =
      await this.support.admissions
        .findActiveAssignmentForAdmission(
          command.actor.facilityId,
          admission._id.toHexString(),
        );

    if (
      activeAdmissionAssignment !==
      null
    ) {
      throw new ActiveAdmissionAssignmentConflictError();
    }

    const hold =
      input.bedHoldId == null
        ? null
        : await this.dependencies.operations
            .findBedHoldById(
              command.actor.facilityId,
              input.bedHoldId,
            );

    if (
      input.bedHoldId != null &&
      (
        hold === null ||
        hold.status !==
          'ACTIVE' ||
        !hold.isActive ||
        hold.bedId.toHexString() !==
          bed._id.toHexString() ||
        hold.admissionId?.toHexString() !==
          admission._id.toHexString() ||
        hold.expiresAt <=
          this.support.dependencies
            .clock.now()
      )
    ) {
      throw new InpatientBedNotAvailableError();
    }

    assertInpatientBedAllocatable(
      ward,
      room,
      bed,
      hold !== null,
    );

    const actorStaffId =
      await this.support.actorStaffId(
        command.actor,
      );

    return this.support.dependencies
      .transactionManager.execute({
        transactionType:
          INPATIENT_BED_OPERATION_TRANSACTION_TYPES
            .ASSIGN_BED,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          ...admissionMutationLockKeys(
            command.actor.facilityId,
            admission,
          ),

          ...bedMutationLockKeys(
            command.actor.facilityId,
            bed.wardId.toHexString(),
            bed.roomId.toHexString(),
            bed._id.toHexString(),
          ),
        ],

        idempotencyPayload: {
          admissionId:
            input.admissionId,

          bedId:
            input.bedId,

          bedHoldId:
            input.bedHoldId,
        },

        journalPayload:
          safeInpatientJournalPayload(
            'ASSIGN_BED',
            {
              admissionId:
                input.admissionId,

              bedId:
                input.bedId,
            },
          ),

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              input.assignedAt ==
              null
                ? this.support.dependencies
                    .clock.now()
                : new Date(
                    input.assignedAt,
                  );

            const actorId =
              toObjectId(
                command.actor.userId,
                'actorUserId',
              );

            const assignmentAllocation =
              await this.support.dependencies
                .sequence.next(
                  command.actor.facilityId,

                  buildInpatientSequenceKey(
                    INPATIENT_NUMBER_SEQUENCE_NAMESPACE
                      .BED_ASSIGNMENT,

                    occurredAt,
                  ),
                );

            const assignment =
              await this.dependencies.operations
                .createAssignment({
                  facilityId:
                    admission.facilityId,

                  assignmentNumber:
                    formatInpatientNumber(
                      'BED-ASG',
                      occurredAt,
                      assignmentAllocation.value,
                    ),

                  admissionId:
                    admission._id,

                  patientId:
                    admission.patientId,

                  sequence:
                    1,

                  assignmentType:
                    'INITIAL',

                  status:
                    'ACTIVE',

                  isActive:
                    true,

                  wardId:
                    ward._id,

                  roomId:
                    room._id,

                  bedId:
                    bed._id,

                  wardCodeSnapshot:
                    ward.wardCode,

                  wardNameSnapshot:
                    ward.name,

                  roomCodeSnapshot:
                    room.roomCode,

                  roomNumberSnapshot:
                    room.roomNumber,

                  bedCodeSnapshot:
                    bed.bedCode,

                  bedNumberSnapshot:
                    bed.bedNumber,

                  bedCategorySnapshot:
                    bed.bedCategory,

                  bedHoldId:
                    hold?._id ??
                    null,

                  previousAssignmentId:
                    null,

                  assignedAt:
                    occurredAt,

                  assignedBy:
                    actorId,

                  assignedByStaffId:
                    toObjectId(
                      actorStaffId,
                      'actorStaffId',
                    ),

                  releasedAt:
                    null,

                  releasedBy:
                    null,

                  releasedByStaffId:
                    null,

                  releaseReasonCode:
                    null,

                  releaseReason:
                    null,

                  nextAssignmentId:
                    null,

                  turnaroundRequired:
                    bed
                      .turnaroundRequiredAfterRelease,

                  bedChargeSegmentId:
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
                    actorId,

                  updatedBy:
                    actorId,
                });

            const rate =
              await this.support.locations
                .resolveEffectiveBedRate({
                  facilityId:
                    command.actor.facilityId,

                  wardId:
                    ward._id.toHexString(),

                  roomId:
                    room._id.toHexString(),

                  bedId:
                    bed._id.toHexString(),

                  bedCategory:
                    bed.bedCategory,

                  occurredAt,

                  payerOrganizationId:
                    admission.payerOrganizationId?.toHexString() ??
                    null,

                  panelPlanId:
                    admission.panelPlanId?.toHexString() ??
                    null,

                  treatmentPackageId:
                    admission.treatmentPackageId?.toHexString() ??
                    null,
                });

            if (
              rate ===
              null
            ) {
              throw new InpatientBedRateResolutionError();
            }

            const chargeAllocation =
              await this.support.dependencies
                .sequence.next(
                  command.actor.facilityId,

                  buildInpatientSequenceKey(
                    INPATIENT_NUMBER_SEQUENCE_NAMESPACE
                      .BED_CHARGE_SEGMENT,

                    occurredAt,
                  ),
                );

            const chargeSegment =
              await this.dependencies.operations
                .createChargeSegment({
                  facilityId:
                    admission.facilityId,

                  segmentNumber:
                    formatInpatientNumber(
                      'BED-CHG',
                      occurredAt,
                      chargeAllocation.value,
                    ),

                  admissionId:
                    admission._id,

                  admissionBedAssignmentId:
                    assignment._id,

                  patientId:
                    admission.patientId,

                  wardId:
                    ward._id,

                  roomId:
                    room._id,

                  bedId:
                    bed._id,

                  bedRateId:
                    toObjectId(
                      rate.bedRateId,
                      'bedRateId',
                    ),

                  bedRateVersionId:
                    toObjectId(
                      rate.versionId,
                      'bedRateVersionId',
                    ),

                  bedRateVersionNumber:
                    rate.versionNumber,

                  rateCodeSnapshot:
                    rate.rateCode,

                  currencyCode:
                    rate.currencyCode,

                  unitRate:
                    Decimal128.fromString(
                      rate.amount,
                    ),

                  chargingPolicySnapshot:
                    rate.chargingPolicy,

                  startedAt:
                    occurredAt,

                  endedAt:
                    null,

                  isOpen:
                    true,

                  billableMinutes:
                    null,

                  quantity:
                    null,

                  grossAmount:
                    null,

                  status:
                    'OPEN',

                  billingRequestId:
                    null,

                  billingChargeReference:
                    null,

                  billedAt:
                    null,

                  reversalRequestId:
                    null,

                  reversalReference:
                    null,

                  reversedAt:
                    null,

                  correctionReason:
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
                    actorId,

                  updatedBy:
                    actorId,
                });

            const linkedAssignment =
              await this.dependencies.operations
                .updateAssignment(
                  command.actor.facilityId,
                  assignment._id.toHexString(),
                  0,
                  {
                    bedChargeSegmentId:
                      chargeSegment._id,

                    updatedBy:
                      actorId,
                  },
                );

            if (
              linkedAssignment ===
              null
            ) {
              throw new ActiveAdmissionAssignmentConflictError();
            }

            if (
              hold !== null
            ) {
              const consumed =
                await this.dependencies.operations
                  .updateBedHold(
                    command.actor.facilityId,
                    hold._id.toHexString(),
                    input.expectedHoldVersion ??
                      hold.version,
                    {
                      status:
                        'CONSUMED',

                      isActive:
                        false,

                      consumedAt:
                        occurredAt,

                      consumedBy:
                        actorId,

                      admissionBedAssignmentId:
                        assignment._id,

                      endedAt:
                        occurredAt,

                      endedBy:
                        actorId,

                      endingReason:
                        'Consumed by bed assignment',

                      updatedBy:
                        actorId,
                    },
                  );

              if (
                consumed ===
                null
              ) {
                throw new ActiveBedHoldConflictError();
              }
            }

            const projectedBed =
              await this.dependencies.operations
                .projectBedState(
                  command.actor.facilityId,
                  bed._id.toHexString(),
                  input.expectedBedVersion,
                  {
                    operationalStatus:
                      'OCCUPIED',

                    operationalStatusChangedAt:
                      occurredAt,

                    operationalStatusChangedBy:
                      actorId,

                    operationalStatusReasonCode:
                      INPATIENT_BED_OPERATION_REASON_CODES
                        .PATIENT_ADMITTED,

                    operationalStatusReason:
                      null,

                    currentAdmissionId:
                      admission._id,

                    currentAssignmentId:
                      assignment._id,

                    currentPatientId:
                      admission.patientId,

                    activeHoldId:
                      null,

                    updatedBy:
                      actorId,
                  },
                );

            if (
              projectedBed ===
              null
            ) {
              throw new InpatientBedConcurrencyError();
            }

            const projectedAdmission =
              await this.support.admissions
                .updateAdmission(
                  command.actor.facilityId,
                  admission._id.toHexString(),
                  input.expectedAdmissionVersion,
                  {
                    status:
                      'ADMITTED',

                    isActive:
                      true,

                    admittedAt:
                      admission.admittedAt ??
                      occurredAt,

                    admittedBy:
                      admission.admittedBy ??
                      actorId,

                    admittedByStaffId:
                      admission.admittedByStaffId ??
                      toObjectId(
                        actorStaffId,
                        'actorStaffId',
                      ),

                    currentWardId:
                      ward._id,

                    currentRoomId:
                      room._id,

                    currentBedId:
                      bed._id,

                    currentBedAssignmentId:
                      assignment._id,

                    currentBedAssignedAt:
                      occurredAt,

                    updatedBy:
                      actorId,
                  },
                );

            if (
              projectedAdmission ===
              null
            ) {
              throw new AdmissionConcurrencyError();
            }

            await this.publish({
              actor:
                command.actor,

              transactionId:
                transaction.transactionId,

              action:
                INPATIENT_BED_OPERATION_AUDIT_ACTIONS
                  .BED_ASSIGNED,

              eventType:
                INPATIENT_BED_OPERATION_EVENTS
                  .BED_ASSIGNED,

              entityType:
                'AdmissionBedAssignment',

              entityId:
                assignment._id.toHexString(),

              occurredAt,

              before: {
                admission:
                  safeAdmissionSnapshot(
                    admission,
                  ),

                bed:
                  safeBedSnapshot(
                    bed,
                  ),
              },

              after: {
                assignmentId:
                  assignment._id.toHexString(),

                chargeSegmentId:
                  chargeSegment._id.toHexString(),

                admission:
                  safeAdmissionSnapshot(
                    projectedAdmission,
                  ),

                bed:
                  safeBedSnapshot(
                    projectedBed,
                  ),
              },

              wardId:
                ward._id.toHexString(),

              roomId:
                room._id.toHexString(),

              bedId:
                bed._id.toHexString(),

              admissionId:
                admission._id.toHexString(),
            });

            return {
              admission:
                projectedAdmission,

              bed:
                projectedBed,

              assignment:
                linkedAssignment,

              chargeSegment,
            };
          },
      });
  }

  public async releaseBed(
    command:
      InpatientBedOperationCommand<ReleaseBedInput>,
  ) {
    const input =
      releaseBedBodySchema.parse(
        command.input,
      );

    const admission =
      await this.support.requireAdmission(
        command.actor,
        input.admissionId,
      );

    if (
      admission.currentBedId ===
        null ||
      admission.currentBedAssignmentId ===
        null
    ) {
      throw new BedAssignmentNotFoundError();
    }

    const [
      bed,
      assignment,
    ] =
      await Promise.all([
        this.support.requireBed(
          command.actor,
          admission.currentBedId.toHexString(),
        ),

        this.dependencies.operations
          .findAssignmentById(
            command.actor.facilityId,
            admission
              .currentBedAssignmentId
              .toHexString(),
          ),
      ]);

    if (
      assignment ===
      null
    ) {
      throw new BedAssignmentNotFoundError();
    }

    assertBedAssignmentTransition(
      assignment.status,
      'COMPLETED',
    );

    const actorStaffId =
      await this.support.actorStaffId(
        command.actor,
      );

    return this.support.dependencies
      .transactionManager.execute({
        transactionType:
          INPATIENT_BED_OPERATION_TRANSACTION_TYPES
            .RELEASE_BED,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          ...admissionMutationLockKeys(
            command.actor.facilityId,
            admission,
          ),

          ...bedMutationLockKeys(
            command.actor.facilityId,
            bed.wardId.toHexString(),
            bed.roomId.toHexString(),
            bed._id.toHexString(),
          ),
        ],

        idempotencyPayload: {
          admissionId:
            input.admissionId,

          assignmentId:
            assignment._id.toHexString(),

          input,
        },

        journalPayload:
          safeInpatientJournalPayload(
            'RELEASE_BED',
            {
              admissionId:
                admission._id.toHexString(),

              assignmentId:
                assignment._id.toHexString(),

              bedId:
                bed._id.toHexString(),
            },
          ),

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              input.releasedAt ==
              null
                ? this.support.dependencies
                    .clock.now()
                : new Date(
                    input.releasedAt,
                  );

            const actorId =
              toObjectId(
                command.actor.userId,
                'actorUserId',
              );

            const charge =
              await this.dependencies.operations
                .findOpenChargeSegmentForAssignment(
                  command.actor.facilityId,
                  assignment._id.toHexString(),
                );

            let closedCharge =
              charge;

            if (
              charge !==
              null
            ) {
              const calculation =
                this.dependencies.calculator
                  .calculate({
                    ...charge,

                    endedAt:
                      occurredAt,
                  });

              closedCharge =
                await this.dependencies.operations
                  .updateChargeSegment(
                    command.actor.facilityId,
                    charge._id.toHexString(),
                    charge.version,
                    {
                      endedAt:
                        occurredAt,

                      isOpen:
                        false,

                      billableMinutes:
                        calculation.billableMinutes,

                      quantity:
                        Decimal128.fromString(
                          calculation.quantity,
                        ),

                      grossAmount:
                        Decimal128.fromString(
                          calculation.grossAmount,
                        ),

                      status:
                        'PENDING_BILLING',

                      updatedBy:
                        actorId,
                    },
                  );
            }

            const releasedAssignment =
              await this.dependencies.operations
                .updateAssignment(
                  command.actor.facilityId,
                  assignment._id.toHexString(),
                  input.expectedAssignmentVersion,
                  {
                    status:
                      'COMPLETED',

                    isActive:
                      false,

                    releasedAt:
                      occurredAt,

                    releasedBy:
                      actorId,

                    releasedByStaffId:
                      toObjectId(
                        actorStaffId,
                        'actorStaffId',
                      ),

                    releaseReasonCode:
                      input.releaseReasonCode,

                    releaseReason:
                      this.support.nullableText(
                        input.releaseReason,
                      ),

                    updatedBy:
                      actorId,
                  },
                );

            if (
              releasedAssignment ===
              null
            ) {
              throw new ActiveAdmissionAssignmentConflictError();
            }

            const nextBedStatus =
              input.startTurnaround &&
              bed.turnaroundRequiredAfterRelease
                ? 'CLEANING'
                : 'AVAILABLE';

            assertBedStatusTransition(
              bed.operationalStatus,
              nextBedStatus,
            );

            const projectedBed =
              await this.dependencies.operations
                .projectBedState(
                  command.actor.facilityId,
                  bed._id.toHexString(),
                  input.expectedBedVersion,
                  {
                    operationalStatus:
                      nextBedStatus,

                    operationalStatusChangedAt:
                      occurredAt,

                    operationalStatusChangedBy:
                      actorId,

                    operationalStatusReasonCode:
                      nextBedStatus ===
                      'CLEANING'
                        ? INPATIENT_BED_OPERATION_REASON_CODES
                            .TURNAROUND_STARTED
                        : INPATIENT_BED_OPERATION_REASON_CODES
                            .PATIENT_DISCHARGED,

                    operationalStatusReason:
                      this.support.nullableText(
                        input.releaseReason,
                      ),

                    currentAdmissionId:
                      null,

                    currentAssignmentId:
                      null,

                    currentPatientId:
                      null,

                    activeHoldId:
                      null,

                    lastReleasedAt:
                      occurredAt,

                    updatedBy:
                      actorId,
                  },
                );

            if (
              projectedBed ===
              null
            ) {
              throw new InpatientBedConcurrencyError();
            }

            const projectedAdmission =
              await this.support.admissions
                .updateAdmission(
                  command.actor.facilityId,
                  admission._id.toHexString(),
                  input.expectedAdmissionVersion,
                  {
                    currentWardId:
                      null,

                    currentRoomId:
                      null,

                    currentBedId:
                      null,

                    currentBedAssignmentId:
                      null,

                    currentBedAssignedAt:
                      null,

                    updatedBy:
                      actorId,
                  },
                );

            if (
              projectedAdmission ===
              null
            ) {
              throw new AdmissionConcurrencyError();
            }

            await this.publish({
              actor:
                command.actor,

              transactionId:
                transaction.transactionId,

              action:
                INPATIENT_BED_OPERATION_AUDIT_ACTIONS
                  .BED_RELEASED,

              eventType:
                INPATIENT_BED_OPERATION_EVENTS
                  .BED_RELEASED,

              entityType:
                'AdmissionBedAssignment',

              entityId:
                releasedAssignment._id.toHexString(),

              occurredAt,

              before: {
                admission:
                  safeAdmissionSnapshot(
                    admission,
                  ),

                bed:
                  safeBedSnapshot(
                    bed,
                  ),
              },

              after: {
                admission:
                  safeAdmissionSnapshot(
                    projectedAdmission,
                  ),

                bed:
                  safeBedSnapshot(
                    projectedBed,
                  ),

                assignmentId:
                  releasedAssignment._id.toHexString(),

                chargeSegmentId:
                  closedCharge?._id.toHexString() ??
                  null,

                chargeStatus:
                  closedCharge?.status ??
                  null,
              },

              wardId:
                bed.wardId.toHexString(),

              roomId:
                bed.roomId.toHexString(),

              bedId:
                bed._id.toHexString(),

              admissionId:
                admission._id.toHexString(),
            });

            return {
              admission:
                projectedAdmission,

              bed:
                projectedBed,

              assignment:
                releasedAssignment,

              chargeSegment:
                closedCharge,
            };
          },
      });
  }

  public async transferBed(
    command:
      InpatientBedOperationCommand<TransferBedInput>,
  ) {
    const input =
      transferBedBodySchema.parse(
        command.input,
      );

    const admission =
      await this.support.requireAdmission(
        command.actor,
        input.admissionId,
      );

    if (
      admission.currentBedId ===
        null ||
      admission.currentBedAssignmentId ===
        null
    ) {
      throw new BedAssignmentNotFoundError();
    }

    if (
      admission.currentBedId.toHexString() ===
      input.destinationBedId
    ) {
      throw new InpatientClinicalContextMismatchError(
        'The destination bed must differ from the current bed',
      );
    }

    const sourceAssignment =
      await this.dependencies.operations
        .findAssignmentById(
          command.actor.facilityId,
          admission
            .currentBedAssignmentId
            .toHexString(),
        );

    if (
      sourceAssignment ===
      null
    ) {
      throw new BedAssignmentNotFoundError();
    }

    const sourceBed =
      await this.support.requireBed(
        command.actor,
        admission.currentBedId.toHexString(),
      );

    await this.support.assertAccess(
      command.actor,
      'BED_TRANSFER',
      {
        admission,
        bed:
          sourceBed,
      },
    );

    const released =
      await this.releaseBed({
        actor:
          command.actor,

        idempotencyKey:
          `${command.idempotencyKey}:release-source`,

        input: {
          admissionId:
            input.admissionId,

          expectedAdmissionVersion:
            input.expectedAdmissionVersion,

          expectedBedVersion:
            input.expectedSourceBedVersion,

          expectedAssignmentVersion:
            input.expectedSourceAssignmentVersion,

          releaseReasonCode:
            'TRANSFER',

          releaseReason:
            input.reason,

          releasedAt:
            input.transferredAt,

          startTurnaround:
            true,
        },
      });

    const assigned =
      await this.assignBed({
        actor:
          command.actor,

        idempotencyKey:
          `${command.idempotencyKey}:assign-destination`,

        input: {
          admissionId:
            input.admissionId,

          bedId:
            input.destinationBedId,

          bedHoldId:
            input.destinationBedHoldId,

          expectedAdmissionVersion:
            released.admission.version,

          expectedBedVersion:
            input.expectedDestinationBedVersion,

          expectedHoldVersion:
            input.expectedDestinationHoldVersion,

          assignedAt:
            input.transferredAt,
        },
      });

    return {
      source:
        released,

      destination:
        assigned,
    };
  }

  public async submitBedCharge(
    command:
      import('../inpatient-bed-operations.types.js')
        .InpatientChargeSegmentEntityCommand<SubmitBedChargeInput>,
  ) {
    const input =
      submitBedChargeBodySchema.parse(
        command.input,
      );

    const segment =
      await this.dependencies.operations
        .findChargeSegmentById(
          command.actor.facilityId,
          command.chargeSegmentId,
        );

    if (
      segment ===
      null
    ) {
      throw new InpatientClinicalContextMismatchError(
        'The bed-charge segment was not found',
      );
    }

    if (
      segment.status !==
        'PENDING_BILLING' ||
      segment.endedAt ===
        null ||
      segment.quantity ===
        null ||
      segment.grossAmount ===
        null
    ) {
      throw new InpatientClinicalContextMismatchError(
        'Only closed pending bed-charge segments can be submitted',
      );
    }

    const admission =
      await this.support.requireAdmission(
        command.actor,
        segment.admissionId.toHexString(),
      );

    const billingResult =
      await this.dependencies.billing
        .submitBedCharge({
          idempotencyKey:
            command.idempotencyKey,

          facilityId:
            command.actor.facilityId,

          patientId:
            segment.patientId.toHexString(),

          admissionId:
            segment.admissionId.toHexString(),

          accountReference:
            admission.billingAccountReference,

          chargeSegmentId:
            segment._id.toHexString(),

          assignmentId:
            segment
              .admissionBedAssignmentId
              .toHexString(),

          bedId:
            segment.bedId.toHexString(),

          wardId:
            segment.wardId.toHexString(),

          roomId:
            segment.roomId.toHexString(),

          rateCode:
            segment.rateCodeSnapshot,

          bedRateId:
            segment.bedRateId.toHexString(),

          bedRateVersionId:
            segment
              .bedRateVersionId
              .toHexString(),

          currencyCode:
            segment.currencyCode,

          unitRate:
            segment.unitRate.toString(),

          quantity:
            segment.quantity.toString(),

          grossAmount:
            segment.grossAmount.toString(),

          startedAt:
            segment.startedAt.toISOString(),

          endedAt:
            segment.endedAt.toISOString(),

          correlationId:
            command.actor.correlationId,
        });

    const updated =
      await this.dependencies.operations
        .updateChargeSegment(
          command.actor.facilityId,
          segment._id.toHexString(),
          input.expectedChargeSegmentVersion,
          {
            status:
              'BILLED',

            billingRequestId:
              billingResult.requestId,

            billingChargeReference:
              billingResult.chargeReference,

            billedAt:
              billingResult.acceptedAt,

            updatedBy:
              toObjectId(
                command.actor.userId,
                'actorUserId',
              ),
          },
        );

    if (
      updated ===
      null
    ) {
      throw new InpatientClinicalContextMismatchError(
        'The bed-charge segment changed before billing confirmation',
      );
    }

    return updated;
  }

  public async reverseBedCharge(
    command:
      import('../inpatient-bed-operations.types.js')
        .InpatientChargeSegmentEntityCommand<ReverseBedChargeInput>,
  ) {
    const input =
      reverseBedChargeBodySchema.parse(
        command.input,
      );

    const segment =
      await this.dependencies.operations
        .findChargeSegmentById(
          command.actor.facilityId,
          command.chargeSegmentId,
        );

    if (
      segment ===
        null ||
      segment.status !==
        'BILLED' ||
      segment.billingChargeReference ===
        null
    ) {
      throw new InpatientClinicalContextMismatchError(
        'Only billed bed-charge segments may be reversed',
      );
    }

    const reversal =
      await this.dependencies.billing
        .reverseBedCharge({
          idempotencyKey:
            command.idempotencyKey,

          facilityId:
            command.actor.facilityId,

          admissionId:
            segment.admissionId.toHexString(),

          chargeSegmentId:
            segment._id.toHexString(),

          billingChargeReference:
            segment.billingChargeReference,

          reason:
            this.support.displayText(
              input.reason,
            ),

          correlationId:
            command.actor.correlationId,
        });

    const updated =
      await this.dependencies.operations
        .updateChargeSegment(
          command.actor.facilityId,
          segment._id.toHexString(),
          input.expectedChargeSegmentVersion,
          {
            status:
              'REVERSED',

            reversalRequestId:
              reversal.requestId,

            reversalReference:
              reversal.reversalReference,

            reversedAt:
              reversal.reversedAt,

            correctionReason:
              this.support.displayText(
                input.reason,
              ),

            updatedBy:
              toObjectId(
                command.actor.userId,
                'actorUserId',
              ),
          },
        );

    if (
      updated ===
      null
    ) {
      throw new InpatientClinicalContextMismatchError(
        'The bed-charge segment changed before reversal confirmation',
      );
    }

    return updated;
  }
}