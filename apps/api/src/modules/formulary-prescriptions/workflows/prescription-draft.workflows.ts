import {
  toObjectId,
} from '@hospital-mis/database';

import {
  PrescriptionConcurrencyError,
  PrescriptionDraftRequiredError,
  PrescriptionNoActiveItemsError,
} from '../formulary-prescriptions.errors.js';

import type {
  CreatePrescriptionDraftInput,
  FormularyPrescriptionActorContext,
  UpdatePrescriptionDraftInput,
} from '../formulary-prescriptions.types.js';

import type {
  PrescriptionRecord,
} from '../formulary-prescriptions.persistence.types.js';

import {
  deleteCreatedFormularyPrescriptionRecordCompensation,
  protectPrescriptionItemSetRestorePayload,
  restorePrescriptionItemSetCompensation,
} from '../formulary-prescriptions.mutation-snapshots.js';

import {
  prescriptionCreateLockKeys,
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

export interface CreatePrescriptionDraftCommand {
  actor: FormularyPrescriptionActorContext;
  input: CreatePrescriptionDraftInput;
  idempotencyKey: string;
}

export class CreatePrescriptionDraftWorkflow {
  public constructor(
    private readonly support:
      FormularyPrescriptionCommandService,
  ) {}

  public async execute(
    command: CreatePrescriptionDraftCommand,
  ): Promise<PrescriptionRecord> {
    const context =
      await this.support.resolveClinicalContext(
        command.actor,
        command.input.encounterId,
        command.input.patientId,
        command.input.prescriberProviderId,
      );

    await this.support.assertAccess(
      command.actor,
      'PRESCRIPTION_CREATE',
      {
        clinicalContext:
          context,
      },
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        FORMULARY_PRESCRIPTION_TRANSACTION_TYPES.CREATE_PRESCRIPTION_DRAFT,

      idempotencyKey:
        command.idempotencyKey,

      actorUserId:
        command.actor.userId,

      facilityId:
        command.actor.facilityId,

      correlationId:
        command.actor.correlationId,

      lockKeys:
        prescriptionCreateLockKeys(
          command.actor.facilityId,
          context.patientId,
          context.encounterId,
        ),

      idempotencyPayload: {
        facilityId:
          command.actor.facilityId,

        input:
          command.input,
      },

      journalPayload:
        safePrescriptionJournalPayload(
          'CREATE_PRESCRIPTION_DRAFT',
          {
            encounterId:
              context.encounterId,

            patientId:
              context.patientId,

            status:
              'DRAFT',

            itemCount:
              command.input.items.length,

            revisionNumber:
              1,
          },
        ),

      execute: async (transaction) => {
        const currentContext =
          await this.support.resolveClinicalContext(
            command.actor,
            command.input.encounterId,
            command.input.patientId,
            command.input.prescriberProviderId,
          );

        const occurredAt =
          this.support.dependencies.clock.now();

        const prescriptionId =
          this.support.newId();

        const prescriptionNumber =
          await this.support.allocatePrescriptionNumber(
            command.actor.facilityId,
            occurredAt,
          );

        await transaction.checkpoint(
          FORMULARY_PRESCRIPTION_TRANSACTION_STATES.NUMBER_ALLOCATED,
          {
            prescriptionNumber,
          },
        );

        const resolvedItems =
          await this.support.resolvePrescriptionItems(
            command.actor,
            currentContext,
            prescriptionId,
            command.input.items,
            transaction.transactionId,
            occurredAt,
          );

        if (resolvedItems.length === 0) {
          throw new PrescriptionNoActiveItemsError();
        }

        await transaction.checkpoint(
          FORMULARY_PRESCRIPTION_TRANSACTION_STATES.CATALOG_REFERENCES_VALIDATED,
          {
            prescriptionId,
            itemCount:
              resolvedItems.length,
          },
        );

        const actorObjectId =
          toObjectId(
            command.actor.userId,
            'actorUserId',
          );

        const prescriptionInput = {
          _id:
            toObjectId(
              prescriptionId,
              'prescriptionId',
            ),

          facilityId:
            toObjectId(
              command.actor.facilityId,
              'facilityId',
            ),

          prescriptionNumber,

          patientId:
            toObjectId(
              currentContext.patientId,
              'patientId',
            ),

          requestedPatientId:
            toObjectId(
              currentContext.requestedPatientId,
              'requestedPatientId',
            ),

          canonicalRedirected:
            currentContext.canonicalRedirected,

          encounterId:
            toObjectId(
              currentContext.encounterId,
              'encounterId',
            ),

          registrationId:
            currentContext.registrationId === null
              ? null
              : toObjectId(
                  currentContext.registrationId,
                  'registrationId',
                ),

          opdVisitId:
            currentContext.opdVisitId === null
              ? null
              : toObjectId(
                  currentContext.opdVisitId,
                  'opdVisitId',
                ),

          queueTokenId:
            currentContext.queueTokenId === null
              ? null
              : toObjectId(
                  currentContext.queueTokenId,
                  'queueTokenId',
                ),

          departmentId:
            toObjectId(
              currentContext.departmentId,
              'departmentId',
            ),

          clinicId:
            currentContext.clinicId === null
              ? null
              : toObjectId(
                  currentContext.clinicId,
                  'clinicId',
                ),

          servicePointId:
            currentContext.servicePointId === null
              ? null
              : toObjectId(
                  currentContext.servicePointId,
                  'servicePointId',
                ),

          prescriberProviderId:
            toObjectId(
              command.input.prescriberProviderId,
              'prescriberProviderId',
            ),

          status:
            'DRAFT' as const,

          revisionNumber:
            1,

          rootPrescriptionId:
            toObjectId(
              prescriptionId,
              'rootPrescriptionId',
            ),

          supersedesPrescriptionId:
            null,

          supersededByPrescriptionId:
            null,

          replacementReason:
            null,

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
            prescriptionInput,
            resolvedItems.map(
              (resolved) =>
                resolved.item,
            ),
          );

        await transaction.registerCompensation(
          deleteCreatedFormularyPrescriptionRecordCompensation({
            key:
              `delete-prescription:${prescriptionId}`,

            collection:
              'prescriptions',

            entityId:
              prescriptionId,

            expectedVersion:
              0,

            transactionId:
              transaction.transactionId,
          }),
        );

        for (const item of created.items) {
          await transaction.registerCompensation(
            deleteCreatedFormularyPrescriptionRecordCompensation({
              key:
                `delete-prescription-item:${item._id.toHexString()}`,

              collection:
                'prescriptionItems',

              entityId:
                item._id.toHexString(),

              expectedVersion:
                item.version,

              transactionId:
                transaction.transactionId,
            }),
          );
        }

        await transaction.checkpoint(
          FORMULARY_PRESCRIPTION_TRANSACTION_STATES.CURRENT_PROJECTION_CREATED,
          {
            prescriptionId,
          },
        );

        await transaction.checkpoint(
          FORMULARY_PRESCRIPTION_TRANSACTION_STATES.ITEMS_CREATED,
          {
            prescriptionId,
            itemCount:
              created.items.length,
          },
        );

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
        });

        await this.support.publishPrescriptionMutation({
          transaction,
          actor:
            command.actor,

          occurredAt,

          auditAction:
            FORMULARY_PRESCRIPTION_AUDIT_ACTIONS.PRESCRIPTION_DRAFT_CREATED,

          outboxEventType:
            FORMULARY_PRESCRIPTION_OUTBOX_EVENTS.PRESCRIPTION_DRAFT_CREATED,

          realtimeEventTypes: [
            FORMULARY_PRESCRIPTION_REALTIME_EVENTS.PRESCRIPTION_CHANGED,
            FORMULARY_PRESCRIPTION_REALTIME_EVENTS.PATIENT_MEDICATION_HISTORY_CHANGED,
          ],

          before:
            null,

          after:
            created.prescription,
        });

        return created.prescription;
      },
    });
  }
}

export interface UpdatePrescriptionDraftCommand {
  actor: FormularyPrescriptionActorContext;
  prescriptionId: string;
  input: UpdatePrescriptionDraftInput;
  idempotencyKey: string;
}

export class UpdatePrescriptionDraftWorkflow {
  public constructor(
    private readonly support:
      FormularyPrescriptionCommandService,
  ) {}

  public async execute(
    command: UpdatePrescriptionDraftCommand,
  ): Promise<PrescriptionRecord> {
    const current =
      await this.support.requirePrescription(
        command.actor,
        command.prescriptionId,
      );

    if (current.status !== 'DRAFT') {
      throw new PrescriptionDraftRequiredError();
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
      'PRESCRIPTION_UPDATE_DRAFT',
      {
        clinicalContext:
          context,

        prescription:
          current,
      },
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        FORMULARY_PRESCRIPTION_TRANSACTION_TYPES.UPDATE_PRESCRIPTION_DRAFT,

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
          'UPDATE_PRESCRIPTION_DRAFT',
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
              current.revisionNumber,
          },
        ),

      execute: async (transaction) => {
        const fresh =
          await this.support.requirePrescription(
            command.actor,
            command.prescriptionId,
          );

        if (fresh.status !== 'DRAFT') {
          throw new PrescriptionDraftRequiredError();
        }

        this.support.assertExpectedVersion(
          fresh,
          command.input.expectedVersion,
        );

        const occurredAt =
          this.support.dependencies.clock.now();

        const existingItems =
          await this.support.prescriptions.listItems(
            command.actor.facilityId,
            command.prescriptionId,
          );

        const itemRestorePayload =
          protectPrescriptionItemSetRestorePayload({
            prescriptionId:
              command.prescriptionId,

            items:
              existingItems,

            transactionId:
              transaction.transactionId,

            snapshotCrypto:
              this.support.dependencies.snapshotCrypto,
          });

        await transaction.registerCompensation(
          restorePrescriptionItemSetCompensation(
            `restore-prescription-items:${command.prescriptionId}`,
            itemRestorePayload,
          ),
        );

        const resolvedItems =
          await this.support.resolvePrescriptionItems(
            command.actor,
            context,
            command.prescriptionId,
            command.input.items,
            transaction.transactionId,
            occurredAt,
          );

        const updated =
          await this.support.prescriptions.replaceDraftItems(
            command.actor.facilityId,
            command.prescriptionId,
            command.input.expectedVersion,
            resolvedItems.map(
              (resolved) =>
                resolved.item,
            ),
            command.actor.userId,
            transaction.transactionId,
            command.actor.correlationId,
            occurredAt,
          );

        if (updated === null) {
          throw new PrescriptionConcurrencyError();
        }

        await transaction.checkpoint(
          FORMULARY_PRESCRIPTION_TRANSACTION_STATES.ITEMS_REPLACED,
          {
            prescriptionId:
              command.prescriptionId,

            itemCount:
              updated.items.length,
          },
        );

        await this.support.appendStatusHistory({
          transaction,
          actor:
            command.actor,

          prescription:
            updated.prescription,

          items:
            updated.items,

          warnings:
            [],

          sequence:
            (
              await this.support.prescriptions.listHistory(
                command.actor.facilityId,
                command.prescriptionId,
              )
            ).length + 1,

          fromStatus:
            'DRAFT',

          toStatus:
            'DRAFT',

          changeType:
            'UPDATED',

          changeSource:
            'PROVIDER',

          occurredAt,
        });

        await this.support.publishPrescriptionMutation({
          transaction,
          actor:
            command.actor,

          occurredAt,

          auditAction:
            FORMULARY_PRESCRIPTION_AUDIT_ACTIONS.PRESCRIPTION_DRAFT_UPDATED,

          outboxEventType:
            FORMULARY_PRESCRIPTION_OUTBOX_EVENTS.PRESCRIPTION_DRAFT_UPDATED,

          realtimeEventTypes: [
            FORMULARY_PRESCRIPTION_REALTIME_EVENTS.PRESCRIPTION_CHANGED,
          ],

          before:
            fresh,

          after:
            updated.prescription,
        });

        return updated.prescription;
      },
    });
  }
}