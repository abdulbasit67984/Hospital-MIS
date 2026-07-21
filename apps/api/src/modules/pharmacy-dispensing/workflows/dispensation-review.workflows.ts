import {
  Types,
  toObjectId,
} from '@hospital-mis/database';

import {
  ConflictError,
} from '@hospital-mis/shared';

import type {
  HoldDispensationInput,
  PharmacyDispensingActorContext,
  RejectDispensationInput,
  ReleaseDispensationInput,
  VerifyDispensationInput,
} from '../pharmacy-dispensing.contracts.js';

import type {
  PharmacyDispensationRecord,
} from '../pharmacy-dispensing.persistence.types.js';

import {
  PHARMACY_DISPENSING_EVENT_TYPES,
  PHARMACY_DISPENSING_REALTIME_EVENTS,
  PHARMACY_DISPENSING_TRANSACTION_TYPES,
} from '../pharmacy-dispensing.constants.js';

import {
  PHARMACY_DISPENSING_AUDIT_ACTIONS,
  PHARMACY_DISPENSING_OUTBOX_EVENTS,
} from '../pharmacy-dispensing.transaction.constants.js';

import {
  PharmacySafetyBlockingError,
} from '../pharmacy-dispensing.errors.js';

import {
  dispensationMutationLockKeys,
  dispensationSnapshot,
  pharmacyDeduplicationKey,
  pharmacySnapshotHash,
  safePharmacyJournalPayload,
} from '../pharmacy-dispensing.workflow-helpers.js';

import {
  PharmacyDispensingCommandService,
} from '../services/pharmacy-dispensing-command.service.js';

import {
  PharmacySafetyService,
} from '../services/pharmacy-safety.service.js';

export interface VerifyDispensationCommand {
  actor: PharmacyDispensingActorContext;
  dispensationId: string;
  input: VerifyDispensationInput;
  idempotencyKey: string;
}

export interface ChangeDispensationReviewStateCommand<TInput> {
  actor: PharmacyDispensingActorContext;
  dispensationId: string;
  input: TInput;
  idempotencyKey: string;
}

function alertDocuments(
  findings: Awaited<
    ReturnType<
      PharmacySafetyService['evaluate']
    >
  >['findings'],
  decisions: VerifyDispensationInput['alertDecisions'],
  occurredAt: Date,
  actorStaffId: string,
) {
  const decisionMap = new Map(
    (decisions ?? []).map(
      (decision) => [
        decision.alertFingerprint,
        decision,
      ],
    ),
  );

  return findings.map((finding) => {
    const decision =
      decisionMap.get(
        finding.fingerprint,
      );
    const acknowledged =
      decision !== undefined &&
      [
        'ACKNOWLEDGED',
        'OVERRIDDEN',
        'RESOLVED',
      ].includes(decision.disposition);

    return {
      _id:
        new Types.ObjectId(),
      alertFingerprint:
        finding.fingerprint,
      alertType:
        finding.type,
      severity:
        finding.severity,
      disposition:
        decision?.disposition ??
        finding.disposition,
      code:
        finding.code,
      message:
        finding.message,
      sourceEntityType:
        finding.sourceEntityType,
      sourceEntityId:
        finding.sourceEntityId === null
          ? null
          : toObjectId(
              finding.sourceEntityId,
              'sourceEntityId',
            ),
      detectedAt:
        occurredAt,
      acknowledgedByStaffId:
        acknowledged
          ? toObjectId(
              actorStaffId,
              'actorStaffId',
            )
          : null,
      acknowledgedAt:
        acknowledged
          ? occurredAt
          : null,
      acknowledgementReason:
        acknowledged
          ? decision?.reason ?? null
          : null,
    };
  });
}

export class VerifyDispensationWorkflow {
  public constructor(
    private readonly support:
      PharmacyDispensingCommandService,
    private readonly safety:
      PharmacySafetyService,
  ) {}

  public async execute(
    command: VerifyDispensationCommand,
  ): Promise<PharmacyDispensationRecord> {
    const current =
      await this.support.requireDispensation(
        command.actor,
        command.dispensationId,
      );

    this.support.assertExpectedVersion(
      current,
      command.input.expectedVersion,
    );

    if (
      ![
        'PENDING_REVIEW',
        'HELD',
      ].includes(current.status)
    ) {
      throw new ConflictError(
        'Only pending or held dispensations can be verified',
      );
    }

    const operational =
      await this.support.dependencies.context
        .resolveOperationalContext(
          command.actor,
          current.pharmacyLocationId.toHexString(),
          {
            patientId:
              current.patientId.toHexString(),
            encounterId:
              current.encounterId?.toHexString() ??
              null,
            admissionId:
              current.admissionId?.toHexString() ??
              null,
            wardId:
              current.wardId?.toHexString() ??
              null,
            requireControlledMedicine:
              current.controlledMedicine,
          },
        );

    await this.support.assertAccess({
      actor: command.actor,
      action:
        current.controlledMedicine
          ? 'CONTROLLED_DISPENSE'
          : 'VERIFY',
      location: {
        ...operational.location,
        allowsGeneralStock: true,
      },
      dispensation:
        current,
    });

    const result =
      await this.support.dependencies.transactions.execute({
        transactionType:
          PHARMACY_DISPENSING_TRANSACTION_TYPES.VERIFY,
        idempotencyKey:
          command.idempotencyKey,
        actorUserId:
          command.actor.userId,
        facilityId:
          command.actor.facilityId,
        correlationId:
          command.actor.correlationId,
        lockKeys:
          dispensationMutationLockKeys(
            command.actor.facilityId,
            current,
          ),
        idempotencyPayload: {
          dispensationId:
            command.dispensationId,
          input:
            command.input,
        },
        journalPayload:
          safePharmacyJournalPayload(
            'VERIFY_DISPENSATION',
            {
              dispensationId:
                command.dispensationId,
              action:
                command.input.action,
              outcome:
                command.input.outcome,
            },
          ),
        execute: async (transaction) => {
          const fresh =
            await this.support.requireDispensation(
              command.actor,
              command.dispensationId,
              transaction.session,
            );

          this.support.assertExpectedVersion(
            fresh,
            command.input.expectedVersion,
          );

          const items =
            await this.support.dependencies.repository
              .listItems(
                command.actor.facilityId,
                command.dispensationId,
                transaction.session,
              );

          const occurredAt =
            this.support.dependencies.clock.now();

          const evaluated =
            await this.safety.evaluate(
              command.actor,
              {
                facilityId:
                  command.actor.facilityId,
                patientId:
                  fresh.patientId.toHexString(),
                encounterId:
                  fresh.encounterId?.toHexString() ??
                  null,
                admissionId:
                  fresh.admissionId?.toHexString() ??
                  null,
                prescriptionId:
                  fresh.prescriptionId.toHexString(),
                prescriptionItemIds:
                  items.map(
                    (item) =>
                      item.prescriptionItemId.toHexString(),
                  ),
                evaluatedAt:
                  occurredAt,
              },
            );

          const decided =
            this.safety.applyDecisions(
              evaluated,
              command.input.alertDecisions ??
                [],
            );

          if (decided.blockingCount > 0) {
            throw new PharmacySafetyBlockingError();
          }

          const isSecondCheck =
            command.input.action ===
            'SECOND_CHECK_APPROVED';

          if (
            isSecondCheck &&
            fresh.verifiedByStaffId === null
          ) {
            throw new ConflictError(
              'The primary pharmacist verification must occur before second-person verification',
            );
          }

          if (
            isSecondCheck &&
            fresh.verifiedByStaffId?.toHexString() ===
              operational.actor.staffId
          ) {
            throw new ConflictError(
              'The primary verifier and second checker must be different staff members',
            );
          }

          const nextStatus =
            fresh.secondCheckRequired &&
            !isSecondCheck
              ? 'PENDING_REVIEW'
              : 'VERIFIED';

          for (const item of items) {
            const itemFindings =
              decided.findings.filter(
                (finding) =>
                  finding.prescriptionItemId ===
                    null ||
                  finding.prescriptionItemId ===
                    item.prescriptionItemId.toHexString(),
              );

            await this.support.dependencies.repository
              .updateItem(
                command.actor.facilityId,
                command.dispensationId,
                item._id.toHexString(),
                item.version,
                {
                  $set: {
                    approvedQuantity:
                      item.requestedQuantity,
                    safetyAlerts:
                      alertDocuments(
                        itemFindings,
                        command.input.alertDecisions,
                        occurredAt,
                        operational.actor.staffId,
                      ),
                    blockingAlertCount: 0,
                    status:
                      nextStatus,
                    ...(isSecondCheck
                      ? {}
                      : {
                          verifiedByStaffId:
                            toObjectId(
                              operational.actor.staffId,
                              'actorStaffId',
                            ),
                          verifiedAt:
                            occurredAt,
                        }),
                  },
                  $inc: {
                    version: 1,
                  },
                },
                command.actor.userId,
                transaction.session,
              );
          }

          const before =
            dispensationSnapshot(fresh);

          const updated =
            await this.support.dependencies.repository
              .updateDispensation(
                command.actor.facilityId,
                command.dispensationId,
                fresh.version,
                {
                  $set: {
                    status:
                      nextStatus,
                    verifiedLineCount:
                      items.length,
                    holdReason:
                      null,
                    heldAt:
                      null,
                    heldByStaffId:
                      null,
                    ...(isSecondCheck
                      ? {
                          secondCheckedAt:
                            occurredAt,
                          secondCheckedByStaffId:
                            toObjectId(
                              operational.actor.staffId,
                              'actorStaffId',
                            ),
                        }
                      : {
                          verifiedAt:
                            occurredAt,
                          verifiedByStaffId:
                            toObjectId(
                              operational.actor.staffId,
                              'actorStaffId',
                            ),
                        }),
                  },
                  $inc: {
                    version: 1,
                  },
                },
                command.actor.userId,
                transaction.session,
              );

          if (updated === null) {
            throw new ConflictError(
              'The dispensation changed during pharmacist verification',
            );
          }

          await this.support.dependencies.repository
            .appendReviewEvent(
              {
                facilityId:
                  toObjectId(
                    command.actor.facilityId,
                    'facilityId',
                  ),
                transactionId:
                  transaction.transactionId,
                correlationId:
                  command.actor.correlationId,
                schemaVersion: 1,
                version: 0,
                createdBy:
                  toObjectId(
                    command.actor.userId,
                    'actorUserId',
                  ),
                updatedBy:
                  toObjectId(
                    command.actor.userId,
                    'actorUserId',
                  ),
                dispensationId:
                  updated._id,
                dispensationItemId:
                  null,
                prescriptionId:
                  updated.prescriptionId,
                patientId:
                  updated.patientId,
                scope:
                  'DISPENSATION',
                action:
                  command.input.action ??
                  'VERIFIED',
                outcome:
                  command.input.outcome,
                reviewerStaffId:
                  isSecondCheck
                    ? fresh.verifiedByStaffId!
                    : toObjectId(
                        operational.actor.staffId,
                        'actorStaffId',
                      ),
                checkerStaffId:
                  isSecondCheck
                    ? toObjectId(
                        operational.actor.staffId,
                        'checkerStaffId',
                      )
                    : null,
                reason:
                  command.input.reason ?? null,
                safetyAlerts:
                  alertDocuments(
                    decided.findings,
                    command.input.alertDecisions,
                    occurredAt,
                    operational.actor.staffId,
                  ),
                blockingAlertCount: 0,
                occurredAt,
              },
              transaction.session,
            );

          if (fresh.status !== updated.status) {
            await this.support.dependencies.repository
              .appendStatusHistory(
                {
                  facilityId:
                    toObjectId(
                      command.actor.facilityId,
                      'facilityId',
                    ),
                  transactionId:
                    transaction.transactionId,
                  correlationId:
                    command.actor.correlationId,
                  schemaVersion: 1,
                  version: 0,
                  createdBy:
                    toObjectId(
                      command.actor.userId,
                      'actorUserId',
                    ),
                  updatedBy:
                    toObjectId(
                      command.actor.userId,
                      'actorUserId',
                    ),
                  dispensationId:
                    updated._id,
                  dispensationItemId:
                    null,
                  patientId:
                    updated.patientId,
                  sequence:
                    updated.version,
                  fromStatus:
                    fresh.status,
                  toStatus:
                    updated.status,
                  changeSource:
                    'PHARMACY',
                  actorStaffId:
                    toObjectId(
                      operational.actor.staffId,
                      'actorStaffId',
                    ),
                  reason:
                    command.input.reason ??
                    'Pharmacist verification completed',
                  snapshotHash:
                    pharmacySnapshotHash(
                      dispensationSnapshot(
                        updated,
                      ),
                    ),
                  occurredAt,
                },
                transaction.session,
              );
          }

          const auditAction =
            isSecondCheck
              ? PHARMACY_DISPENSING_AUDIT_ACTIONS.DISPENSATION_SECOND_CHECKED
              : PHARMACY_DISPENSING_AUDIT_ACTIONS.DISPENSATION_VERIFIED;

          const outboxEvent =
            isSecondCheck
              ? PHARMACY_DISPENSING_OUTBOX_EVENTS.DISPENSATION_SECOND_CHECKED
              : PHARMACY_DISPENSING_OUTBOX_EVENTS.DISPENSATION_VERIFIED;

          await this.support.dependencies.audit.append(
            {
              transactionId:
                transaction.transactionId,
              deduplicationKey:
                pharmacyDeduplicationKey(
                  transaction.transactionId,
                  auditAction,
                  updated._id.toHexString(),
                ),
              action:
                auditAction,
              entityType:
                'DISPENSATION',
              entityId:
                updated._id.toHexString(),
              actorUserId:
                command.actor.userId,
              actorStaffId:
                operational.actor.staffId,
              facilityId:
                command.actor.facilityId,
              correlationId:
                command.actor.correlationId,
              occurredAt,
              reason:
                command.input.reason,
              before,
              after:
                dispensationSnapshot(
                  updated,
                ),
              metadata: {
                reviewOutcome:
                  command.input.outcome,
                safetyFindingCount:
                  decided.findings.length,
              },
            },
            transaction.session,
          );

          await this.support.dependencies.outbox.enqueue(
            {
              transactionId:
                transaction.transactionId,
              deduplicationKey:
                pharmacyDeduplicationKey(
                  transaction.transactionId,
                  outboxEvent,
                  updated._id.toHexString(),
                ),
              eventType:
                outboxEvent,
              aggregateType:
                'DISPENSATION',
              aggregateId:
                updated._id.toHexString(),
              actorUserId:
                command.actor.userId,
              facilityId:
                command.actor.facilityId,
              correlationId:
                command.actor.correlationId,
              occurredAt,
              payload: {
                dispensationId:
                  updated._id.toHexString(),
                pharmacyLocationId:
                  updated.pharmacyLocationId.toHexString(),
                status:
                  updated.status,
                secondCheckCompleted:
                  isSecondCheck,
              },
            },
            transaction.session,
          );

          return updated;
        },
      });

    await this.support.dependencies.realtime
      .publish({
        eventType:
          PHARMACY_DISPENSING_REALTIME_EVENTS.WORKLIST_CHANGED,
        facilityId:
          command.actor.facilityId,
        pharmacyLocationId:
          result.pharmacyLocationId.toHexString(),
        payload: {
          event:
            command.input.action ===
            'SECOND_CHECK_APPROVED'
              ? PHARMACY_DISPENSING_EVENT_TYPES.VERIFIED
              : PHARMACY_DISPENSING_EVENT_TYPES.REVIEWED,
          dispensationId:
            result._id.toHexString(),
          status:
            result.status,
        },
      })
      .catch(() => undefined);

    return result;
  }
}

type ReviewStateInput =
  | HoldDispensationInput
  | ReleaseDispensationInput
  | RejectDispensationInput;

type ReviewStateAction =
  | 'HOLD'
  | 'RELEASE'
  | 'REJECT';

class ChangeDispensationReviewStateWorkflow {
  public constructor(
    private readonly support:
      PharmacyDispensingCommandService,
    private readonly action:
      ReviewStateAction,
  ) {}

  public async execute(
    command:
      ChangeDispensationReviewStateCommand<ReviewStateInput>,
  ): Promise<PharmacyDispensationRecord> {
    const current =
      await this.support.requireDispensation(
        command.actor,
        command.dispensationId,
      );

    this.support.assertExpectedVersion(
      current,
      command.input.expectedVersion,
    );

    const allowedStatuses =
      this.action === 'HOLD'
        ? [
            'PENDING_REVIEW',
            'VERIFIED',
            'PARTIALLY_RESERVED',
            'RESERVED',
          ]
        : this.action === 'RELEASE'
          ? ['HELD']
          : [
              'PENDING_REVIEW',
              'HELD',
            ];

    if (
      !allowedStatuses.includes(
        current.status,
      )
    ) {
      throw new ConflictError(
        `Dispensation status ${current.status} cannot perform ${this.action}`,
      );
    }

    const operational =
      await this.support.dependencies.context
        .resolveOperationalContext(
          command.actor,
          current.pharmacyLocationId.toHexString(),
          {
            patientId:
              current.patientId.toHexString(),
            admissionId:
              current.admissionId?.toHexString() ??
              null,
            wardId:
              current.wardId?.toHexString() ??
              null,
            requireControlledMedicine:
              current.controlledMedicine,
          },
        );

    await this.support.assertAccess({
      actor:
        command.actor,
      action:
        current.controlledMedicine
          ? 'CONTROLLED_DISPENSE'
          : 'VERIFY',
      location: {
        ...operational.location,
        allowsGeneralStock: true,
      },
      dispensation:
        current,
    });

    const transactionType =
      this.action === 'HOLD'
        ? PHARMACY_DISPENSING_TRANSACTION_TYPES.HOLD
        : this.action === 'RELEASE'
          ? PHARMACY_DISPENSING_TRANSACTION_TYPES.RELEASE
          : PHARMACY_DISPENSING_TRANSACTION_TYPES.REJECT;

    return this.support.dependencies.transactions.execute({
      transactionType,
      idempotencyKey:
        command.idempotencyKey,
      actorUserId:
        command.actor.userId,
      facilityId:
        command.actor.facilityId,
      correlationId:
        command.actor.correlationId,
      lockKeys:
        dispensationMutationLockKeys(
          command.actor.facilityId,
          current,
        ),
      idempotencyPayload: {
        dispensationId:
          command.dispensationId,
        action:
          this.action,
        expectedVersion:
          command.input.expectedVersion,
        reason:
          command.input.reason,
      },
      journalPayload:
        safePharmacyJournalPayload(
          `${this.action}_DISPENSATION`,
          {
            dispensationId:
              command.dispensationId,
            reason:
              command.input.reason,
          },
        ),
      execute: async (transaction) => {
        const fresh =
          await this.support.requireDispensation(
            command.actor,
            command.dispensationId,
            transaction.session,
          );

        this.support.assertExpectedVersion(
          fresh,
          command.input.expectedVersion,
        );

        const occurredAt =
          this.support.dependencies.clock.now();

        const nextStatus =
          this.action === 'HOLD'
            ? 'HELD'
            : this.action === 'RELEASE'
              ? fresh.verifiedByStaffId ===
                  null
                ? 'PENDING_REVIEW'
                : 'VERIFIED'
              : 'REJECTED';

        const update =
          this.action === 'HOLD'
            ? {
                status:
                  nextStatus,
                heldAt:
                  occurredAt,
                heldByStaffId:
                  toObjectId(
                    operational.actor.staffId,
                    'actorStaffId',
                  ),
                holdReason:
                  command.input.reason,
              }
            : this.action === 'RELEASE'
              ? {
                  status:
                    nextStatus,
                  heldAt:
                    null,
                  heldByStaffId:
                    null,
                  holdReason:
                    null,
                }
              : {
                  status:
                    nextStatus,
                  rejectedAt:
                    occurredAt,
                  rejectedByStaffId:
                    toObjectId(
                      operational.actor.staffId,
                      'actorStaffId',
                    ),
                  rejectionReason:
                    command.input.reason,
                };

        const updated =
          await this.support.dependencies.repository
            .updateDispensation(
              command.actor.facilityId,
              command.dispensationId,
              fresh.version,
              {
                $set:
                  update,
                $inc: {
                  version: 1,
                },
              },
              command.actor.userId,
              transaction.session,
            );

        if (updated === null) {
          throw new ConflictError(
            'The dispensation changed during its pharmacy review transition',
          );
        }

        await this.support.dependencies.repository
          .appendStatusHistory(
            {
              facilityId:
                toObjectId(
                  command.actor.facilityId,
                  'facilityId',
                ),
              transactionId:
                transaction.transactionId,
              correlationId:
                command.actor.correlationId,
              schemaVersion: 1,
              version: 0,
              createdBy:
                toObjectId(
                  command.actor.userId,
                  'actorUserId',
                ),
              updatedBy:
                toObjectId(
                  command.actor.userId,
                  'actorUserId',
                ),
              dispensationId:
                updated._id,
              dispensationItemId:
                null,
              patientId:
                updated.patientId,
              sequence:
                updated.version,
              fromStatus:
                fresh.status,
              toStatus:
                updated.status,
              changeSource:
                'PHARMACY',
              actorStaffId:
                toObjectId(
                  operational.actor.staffId,
                  'actorStaffId',
                ),
              reason:
                command.input.reason,
              snapshotHash:
                pharmacySnapshotHash(
                  dispensationSnapshot(
                    updated,
                  ),
                ),
              occurredAt,
            },
            transaction.session,
          );

        const auditAction =
          this.action === 'HOLD'
            ? PHARMACY_DISPENSING_AUDIT_ACTIONS.DISPENSATION_HELD
            : this.action === 'RELEASE'
              ? PHARMACY_DISPENSING_AUDIT_ACTIONS.DISPENSATION_RELEASED
              : PHARMACY_DISPENSING_AUDIT_ACTIONS.DISPENSATION_REJECTED;

        const outboxEvent =
          this.action === 'HOLD'
            ? PHARMACY_DISPENSING_OUTBOX_EVENTS.DISPENSATION_HELD
            : this.action === 'RELEASE'
              ? PHARMACY_DISPENSING_OUTBOX_EVENTS.DISPENSATION_RELEASED
              : PHARMACY_DISPENSING_OUTBOX_EVENTS.DISPENSATION_REJECTED;

        await this.support.dependencies.audit.append(
          {
            transactionId:
              transaction.transactionId,
            deduplicationKey:
              pharmacyDeduplicationKey(
                transaction.transactionId,
                auditAction,
                updated._id.toHexString(),
              ),
            action:
              auditAction,
            entityType:
              'DISPENSATION',
            entityId:
              updated._id.toHexString(),
            actorUserId:
              command.actor.userId,
            actorStaffId:
              operational.actor.staffId,
            facilityId:
              command.actor.facilityId,
            correlationId:
              command.actor.correlationId,
            occurredAt,
            reason:
              command.input.reason,
            before:
              dispensationSnapshot(
                fresh,
              ),
            after:
              dispensationSnapshot(
                updated,
              ),
          },
          transaction.session,
        );

        await this.support.dependencies.outbox.enqueue(
          {
            transactionId:
              transaction.transactionId,
            deduplicationKey:
              pharmacyDeduplicationKey(
                transaction.transactionId,
                outboxEvent,
                updated._id.toHexString(),
              ),
            eventType:
              outboxEvent,
            aggregateType:
              'DISPENSATION',
            aggregateId:
              updated._id.toHexString(),
            actorUserId:
              command.actor.userId,
            facilityId:
              command.actor.facilityId,
            correlationId:
              command.actor.correlationId,
            occurredAt,
            payload: {
              dispensationId:
                updated._id.toHexString(),
              pharmacyLocationId:
                updated.pharmacyLocationId.toHexString(),
              status:
                updated.status,
            },
          },
          transaction.session,
        );

        return updated;
      },
    });
  }
}

export class HoldDispensationWorkflow extends ChangeDispensationReviewStateWorkflow {
  public constructor(
    support:
      PharmacyDispensingCommandService,
  ) {
    super(support, 'HOLD');
  }
}

export class ReleaseDispensationWorkflow extends ChangeDispensationReviewStateWorkflow {
  public constructor(
    support:
      PharmacyDispensingCommandService,
  ) {
    super(support, 'RELEASE');
  }
}

export class RejectDispensationWorkflow extends ChangeDispensationReviewStateWorkflow {
  public constructor(
    support:
      PharmacyDispensingCommandService,
  ) {
    super(support, 'REJECT');
  }
}