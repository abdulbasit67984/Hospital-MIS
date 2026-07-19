import {
  toObjectId,
} from '@hospital-mis/database';

import {
  PrescriptionCancellationConflictError,
  PrescriptionConcurrencyError,
  PrescriptionReplacementConflictError,
} from '../formulary-prescriptions.errors.js';

import type {
  CancelPrescriptionInput,
  FormularyPrescriptionActorContext,
  ReplacePrescriptionInput,
} from '../formulary-prescriptions.types.js';

import type {
  PrescriptionRecord,
} from '../formulary-prescriptions.persistence.types.js';

import {
  deleteCreatedFormularyPrescriptionRecordCompensation,
  prescriptionRestoreSnapshot,
  protectFormularyPrescriptionRestorePayload,
  restoreFormularyPrescriptionRecordCompensation,
} from '../formulary-prescriptions.mutation-snapshots.js';

import {
  assertPrescriptionTransition,
  prescriptionMutationLockKeys,
  safePrescriptionJournalPayload,
} from '../formulary-prescriptions.workflow-helpers.js';

import {
  FORMULARY_PRESCRIPTION_AUDIT_ACTIONS,
  FORMULARY_PRESCRIPTION_OUTBOX_EVENTS,
  FORMULARY_PRESCRIPTION_REALTIME_EVENTS,
  FORMULARY_PRESCRIPTION_TRANSACTION_STATES,
} from '../formulary-prescriptions.transaction.constants.js';

import {
  FORMULARY_PRESCRIPTION_TRANSACTION_TYPES,
} from '../formulary-prescriptions.constants.js';

import {
  FormularyPrescriptionCommandService,
} from '../services/formulary-prescription-command.service.js';

export interface CancelPrescriptionCommand {
  actor: FormularyPrescriptionActorContext;
  prescriptionId: string;
  input: CancelPrescriptionInput;
  idempotencyKey: string;
}

export class CancelPrescriptionWorkflow {
  public constructor(
    private readonly support:
      FormularyPrescriptionCommandService,
  ) {}

  public async execute(
    command: CancelPrescriptionCommand,
  ): Promise<PrescriptionRecord> {
    const current =
      await this.support.requirePrescription(
        command.actor,
        command.prescriptionId,
      );

    if (
      ![
        'DRAFT',
        'ISSUED',
        'PARTIALLY_DISPENSED',
      ].includes(
        current.status,
      )
    ) {
      throw new PrescriptionCancellationConflictError();
    }

    this.support.assertExpectedVersion(
      current,
      command.input.expectedVersion,
    );

    await this.support.assertAccess(
      command.actor,
      'PRESCRIPTION_CANCEL',
      {
        prescription:
          current,
      },
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        FORMULARY_PRESCRIPTION_TRANSACTION_TYPES.CANCEL_PRESCRIPTION,

      idempotencyKey:
        command.idempotencyKey,

      actorUserId:
        command.actor.userId,

      facilityId:
        command.actor.facilityId,

      correlationId:
        command.actor.correlationId,

      lockKeys:
        prescriptionMutationLockKeys(
          command.actor.facilityId,
          current,
        ),

      idempotencyPayload: {
        facilityId:
          command.actor.facilityId,

        prescriptionId:
          command.prescriptionId,

        input:
          command.input,
      },

      journalPayload:
        safePrescriptionJournalPayload(
          'CANCEL_PRESCRIPTION',
          {
            prescriptionId:
              command.prescriptionId,

            encounterId:
              current.encounterId.toHexString(),

            patientId:
              current.patientId.toHexString(),

            status:
              'CANCELLED',

            itemCount:
              current.itemCount,

            revisionNumber:
              current.revisionNumber,
          },
        ),

      execute: async (transaction) => {
        const fresh =
          await this.support.requirePrescription(
            command.actor,
            command.prescriptionId,
          );

        this.support.assertExpectedVersion(
          fresh,
          command.input.expectedVersion,
        );

        if (
          ![
            'DRAFT',
            'ISSUED',
            'PARTIALLY_DISPENSED',
          ].includes(
            fresh.status,
          )
        ) {
          throw new PrescriptionCancellationConflictError();
        }

        assertPrescriptionTransition(
          fresh.status,
          'CANCELLED',
        );

        const occurredAt =
          this.support.dependencies.clock.now();

        const restorePayload =
          protectFormularyPrescriptionRestorePayload({
            collection:
              'prescriptions',

            entityId:
              command.prescriptionId,

            expectedPostVersion:
              fresh.version + 1,

            transactionId:
              transaction.transactionId,

            snapshot:
              prescriptionRestoreSnapshot(
                fresh,
              ),

            snapshotCrypto:
              this.support.dependencies.snapshotCrypto,
          });

        await transaction.registerCompensation(
          restoreFormularyPrescriptionRecordCompensation(
            `restore-prescription:${command.prescriptionId}:${fresh.version + 1}`,
            restorePayload,
          ),
        );

        const cancelled =
          await this.support.prescriptions.transitionStatus(
            command.actor.facilityId,
            command.prescriptionId,
            command.input.expectedVersion,
            [
              fresh.status,
            ],
            {
              status:
                'CANCELLED',

              cancelledAt:
                occurredAt,

              cancelledBy:
                toObjectId(
                  command.actor.userId,
                  'cancelledBy',
                ),

              cancellationReason:
                command.input.reason,

              updatedBy:
                toObjectId(
                  command.actor.userId,
                  'actorUserId',
                ),
            },
          );

        if (cancelled === null) {
          throw new PrescriptionConcurrencyError();
        }

        const [
          items,
          warnings,
          history,
        ] =
          await Promise.all([
            this.support.prescriptions.listItems(
              command.actor.facilityId,
              command.prescriptionId,
            ),

            this.support.prescriptions.listForPrescription(
              command.actor.facilityId,
              command.prescriptionId,
              true,
            ),

            this.support.prescriptions.listHistory(
              command.actor.facilityId,
              command.prescriptionId,
            ),
          ]);

        await this.support.appendStatusHistory({
          transaction,
          actor:
            command.actor,

          prescription:
            cancelled,

          items,

          warnings,

          sequence:
            history.length + 1,

          fromStatus:
            fresh.status,

          toStatus:
            'CANCELLED',

          changeType:
            'CANCELLED',

          changeSource:
            'PROVIDER',

          occurredAt,

          reason:
            command.input.reason,
        });

        await this.support.publishPrescriptionMutation({
          transaction,
          actor:
            command.actor,

          occurredAt,

          auditAction:
            FORMULARY_PRESCRIPTION_AUDIT_ACTIONS.PRESCRIPTION_CANCELLED,

          outboxEventType:
            FORMULARY_PRESCRIPTION_OUTBOX_EVENTS.PRESCRIPTION_CANCELLED,

          realtimeEventTypes: [
            FORMULARY_PRESCRIPTION_REALTIME_EVENTS.PRESCRIPTION_CHANGED,
            FORMULARY_PRESCRIPTION_REALTIME_EVENTS.PATIENT_MEDICATION_HISTORY_CHANGED,
            FORMULARY_PRESCRIPTION_REALTIME_EVENTS.PHARMACY_QUEUE_CHANGED,
          ],

          before:
            fresh,

          after:
            cancelled,

          reason:
            command.input.reason,
        });

        return cancelled;
      },
    });
  }
}

export interface ReplacePrescriptionCommand {
  actor: FormularyPrescriptionActorContext;
  prescriptionId: string;
  input: ReplacePrescriptionInput;
  idempotencyKey: string;
}

export class ReplacePrescriptionWorkflow {
  public constructor(
    private readonly support:
      FormularyPrescriptionCommandService,
  ) {}

  public async execute(
    command: ReplacePrescriptionCommand,
  ): Promise<PrescriptionRecord> {
    const current =
      await this.support.requirePrescription(
        command.actor,
        command.prescriptionId,
      );

    if (
      ![
        'ISSUED',
        'PARTIALLY_DISPENSED',
      ].includes(
        current.status,
      ) ||
      current.supersededByPrescriptionId !== null
    ) {
      throw new PrescriptionReplacementConflictError();
    }

    this.support.assertExpectedVersion(
      current,
      command.input.expectedVersion,
    );

    const context =
      await this.support.resolveClinicalContext(
        command.actor,
        current.encounterId.toHexString(),
        current.requestedPatientId.toHexString(),
        current.prescriberProviderId.toHexString(),
      );

    await this.support.assertAccess(
      command.actor,
      'PRESCRIPTION_AMEND',
      {
        clinicalContext:
          context,

        prescription:
          current,
      },
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        FORMULARY_PRESCRIPTION_TRANSACTION_TYPES.REPLACE_PRESCRIPTION,

      idempotencyKey:
        command.idempotencyKey,

      actorUserId:
        command.actor.userId,

      facilityId:
        command.actor.facilityId,

      correlationId:
        command.actor.correlationId,

      lockKeys:
        prescriptionMutationLockKeys(
          command.actor.facilityId,
          current,
        ),

      idempotencyPayload: {
        facilityId:
          command.actor.facilityId,

        prescriptionId:
          command.prescriptionId,

        input:
          command.input,
      },

      journalPayload:
        safePrescriptionJournalPayload(
          'REPLACE_PRESCRIPTION',
          {
            prescriptionId:
              command.prescriptionId,

            encounterId:
              current.encounterId.toHexString(),

            patientId:
              current.patientId.toHexString(),

            status:
              current.status,

            itemCount:
              command.input.items.length,

            revisionNumber:
              current.revisionNumber + 1,
          },
        ),

      execute: async (transaction) => {
        const fresh =
          await this.support.requirePrescription(
            command.actor,
            command.prescriptionId,
          );

        this.support.assertExpectedVersion(
          fresh,
          command.input.expectedVersion,
        );

        if (
          ![
            'ISSUED',
            'PARTIALLY_DISPENSED',
          ].includes(
            fresh.status,
          ) ||
          fresh.supersededByPrescriptionId !== null
        ) {
          throw new PrescriptionReplacementConflictError();
        }

        const occurredAt =
          this.support.dependencies.clock.now();

        const replacementId =
          this.support.newId();

        const replacementNumber =
          await this.support.allocatePrescriptionNumber(
            command.actor.facilityId,
            occurredAt,
          );

        const resolvedItems =
          await this.support.resolvePrescriptionItems(
            command.actor,
            context,
            replacementId,
            command.input.items,
            transaction.transactionId,
            occurredAt,
          );

        const actorObjectId =
          toObjectId(
            command.actor.userId,
            'actorUserId',
          );

        const replacementInput = {
          _id:
            toObjectId(
              replacementId,
              'replacementPrescriptionId',
            ),

          facilityId:
            fresh.facilityId,

          prescriptionNumber:
            replacementNumber,

          patientId:
            fresh.patientId,

          requestedPatientId:
            fresh.requestedPatientId,

          canonicalRedirected:
            fresh.canonicalRedirected,

          encounterId:
            fresh.encounterId,

          registrationId:
            fresh.registrationId,

          opdVisitId:
            fresh.opdVisitId,

          queueTokenId:
            fresh.queueTokenId,

          departmentId:
            fresh.departmentId,

          clinicId:
            fresh.clinicId,

          servicePointId:
            fresh.servicePointId,

          prescriberProviderId:
            fresh.prescriberProviderId,

          status:
            'DRAFT' as const,

          revisionNumber:
            fresh.revisionNumber + 1,

          rootPrescriptionId:
            fresh.rootPrescriptionId,

          supersedesPrescriptionId:
            fresh._id,

          supersededByPrescriptionId:
            null,

          replacementReason:
            command.input.reason,

          draftedAt:
            occurredAt,

          issuedAt:
            null,

          expiresAt:
            null,

          signedBy:
            null,

          signatureMethod:
            null,

          signatureDigest:
            null,

          lockedAt:
            null,

          lockedBy:
            null,

          issuedSnapshotHash:
            null,

          cancelledAt:
            null,

          cancelledBy:
            null,

          cancellationReason:
            null,

          interactionCheckStatus:
            'NOT_REQUESTED' as const,

          interactionCheckProvider:
            null,

          interactionCheckedAt:
            null,

          itemCount:
            resolvedItems.length,

          activeItemCount:
            resolvedItems.length,

          dispensedItemCount:
            0,

          safetyWarningCount:
            0,

          unresolvedBlockingWarningCount:
            0,

          printRevision:
            0,

          lastPrintedAt:
            null,

          lastPrintedBy:
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
            actorObjectId,

          updatedBy:
            actorObjectId,
        };

        const created =
          await this.support.prescriptions.create(
            replacementInput,
            resolvedItems.map(
              (resolved) =>
                resolved.item,
            ),
          );

        await transaction.registerCompensation(
          deleteCreatedFormularyPrescriptionRecordCompensation({
            key:
              `delete-replacement-prescription:${replacementId}`,

            collection:
              'prescriptions',

            entityId:
              replacementId,

            expectedVersion:
              0,

            transactionId:
              transaction.transactionId,
          }),
        );

        const linked =
          await this.support.prescriptions.linkReplacement(
            command.actor.facilityId,
            command.prescriptionId,
            replacementId,
            command.input.expectedVersion,
          );

        if (linked === null) {
          throw new PrescriptionConcurrencyError();
        }

        await transaction.checkpoint(
          FORMULARY_PRESCRIPTION_TRANSACTION_STATES.REPLACEMENT_LINKED,
          {
            prescriptionId:
              command.prescriptionId,

            replacementPrescriptionId:
              replacementId,
          },
        );

        const history =
          await this.support.prescriptions.listHistory(
            command.actor.facilityId,
            command.prescriptionId,
          );

        const originalItems =
          await this.support.prescriptions.listItems(
            command.actor.facilityId,
            command.prescriptionId,
          );

        const originalWarnings =
          await this.support.prescriptions.listForPrescription(
            command.actor.facilityId,
            command.prescriptionId,
            true,
          );

        await this.support.appendStatusHistory({
          transaction,
          actor:
            command.actor,

          prescription:
            linked,

          items:
            originalItems,

          warnings:
            originalWarnings,

          sequence:
            history.length + 1,

          fromStatus:
            fresh.status,

          toStatus:
            fresh.status,

          changeType:
            'REPLACED',

          changeSource:
            'PROVIDER',

          occurredAt,

          reason:
            command.input.reason,
        });

        await this.support.appendStatusHistory({
          transaction,
          actor:
            command.actor,

          prescription:
            created.prescription,

          items:
            created.items,

          warnings:
            [],

          sequence:
            1,

          fromStatus:
            null,

          toStatus:
            'DRAFT',

          changeType:
            'CREATED',

          changeSource:
            'PROVIDER',

          occurredAt,

          reason:
            command.input.reason,
        });

        await this.support.publishPrescriptionMutation({
          transaction,
          actor:
            command.actor,

          occurredAt,

          auditAction:
            FORMULARY_PRESCRIPTION_AUDIT_ACTIONS.PRESCRIPTION_REPLACED,

          outboxEventType:
            FORMULARY_PRESCRIPTION_OUTBOX_EVENTS.PRESCRIPTION_REPLACED,

          realtimeEventTypes: [
            FORMULARY_PRESCRIPTION_REALTIME_EVENTS.PRESCRIPTION_CHANGED,
            FORMULARY_PRESCRIPTION_REALTIME_EVENTS.PATIENT_MEDICATION_HISTORY_CHANGED,
            FORMULARY_PRESCRIPTION_REALTIME_EVENTS.PHARMACY_QUEUE_CHANGED,
          ],

          before:
            fresh,

          after:
            linked,

          reason:
            command.input.reason,

          metadata: {
            replacementPrescriptionId:
              replacementId,

            replacementRevisionNumber:
              created.prescription.revisionNumber,
          },
        });

        return created.prescription;
      },
    });
  }
}