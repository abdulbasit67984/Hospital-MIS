import {
  formularyPrescriptionDeduplicationKey,
  prescriptionMutationLockKeys,
  safePrescriptionEventPayload,
  safePrescriptionJournalPayload,
} from '../formulary-prescriptions.workflow-helpers.js';

import {
  prescriptionWarningRestoreSnapshot,
  protectFormularyPrescriptionRestorePayload,
  restoreFormularyPrescriptionRecordCompensation,
} from '../formulary-prescriptions.mutation-snapshots.js';

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
  PrescriptionSafetyWarningConcurrencyError,
  PrescriptionSafetyWarningNotFoundError,
} from '../formulary-prescriptions.errors.js';

import {
  toPrescriptionSafetyWarningView,
} from '../formulary-prescriptions.mapper.js';

import type {
  AcknowledgePrescriptionWarningInput,
  FormularyPrescriptionActorContext,
  PrescriptionSafetyWarningView,
} from '../formulary-prescriptions.types.js';

import {
  FormularyPrescriptionCommandService,
} from '../services/formulary-prescription-command.service.js';

export interface AcknowledgePrescriptionWarningCommand {
  actor:
    FormularyPrescriptionActorContext;

  prescriptionId:
    string;

  warningId:
    string;

  input:
    AcknowledgePrescriptionWarningInput;

  idempotencyKey:
    string;
}

export class AcknowledgePrescriptionWarningWorkflow {
  public constructor(
    private readonly support:
      FormularyPrescriptionCommandService,
  ) {}

  public async execute(
    command:
      AcknowledgePrescriptionWarningCommand,
  ): Promise<PrescriptionSafetyWarningView> {
    const prescription =
      await this.support.requirePrescription(
        command.actor,
        command.prescriptionId,
      );

    await this.support.assertAccess(
      command.actor,
      'PRESCRIPTION_ISSUE',
      {
        prescription,
      },
    );

    const warnings =
      await this.support
        .prescriptions
        .listForPrescription(
          command.actor.facilityId,
          command.prescriptionId,
          true,
        );

    const current =
      warnings.find(
        (warning) =>
          warning._id.toHexString() ===
          command.warningId,
      );

    if (current === undefined) {
      throw new PrescriptionSafetyWarningNotFoundError();
    }

    if (
      current.version !==
      command.input.expectedVersion
    ) {
      throw new PrescriptionSafetyWarningConcurrencyError();
    }

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        FORMULARY_PRESCRIPTION_TRANSACTION_TYPES.ACKNOWLEDGE_PRESCRIPTION_WARNING,

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
          prescription,
        ),

      idempotencyPayload: {
        facilityId:
          command.actor.facilityId,

        prescriptionId:
          command.prescriptionId,

        warningId:
          command.warningId,

        input:
          command.input,
      },

      journalPayload:
        safePrescriptionJournalPayload(
          'ACKNOWLEDGE_PRESCRIPTION_WARNING',
          {
            prescriptionId:
              command.prescriptionId,

            encounterId:
              prescription.encounterId
                .toHexString(),

            patientId:
              prescription.patientId
                .toHexString(),

            status:
              prescription.status,

            itemCount:
              prescription.itemCount,

            revisionNumber:
              prescription.revisionNumber,
          },
        ),

      execute: async (
        transaction,
      ) => {
        const freshWarnings =
          await this.support
            .prescriptions
            .listForPrescription(
              command.actor.facilityId,
              command.prescriptionId,
              true,
            );

        const fresh =
          freshWarnings.find(
            (warning) =>
              warning._id
                .toHexString() ===
              command.warningId,
          );

        if (fresh === undefined) {
          throw new PrescriptionSafetyWarningNotFoundError();
        }

        if (
          fresh.version !==
          command.input.expectedVersion
        ) {
          throw new PrescriptionSafetyWarningConcurrencyError();
        }

        const occurredAt =
          this.support.dependencies
            .clock
            .now();

        const restorePayload =
          protectFormularyPrescriptionRestorePayload({
            collection:
              'prescriptionSafetyWarnings',

            entityId:
              command.warningId,

            expectedPostVersion:
              fresh.version + 1,

            transactionId:
              transaction.transactionId,

            snapshot:
              prescriptionWarningRestoreSnapshot(
                fresh,
              ),

            snapshotCrypto:
              this.support.dependencies
                .snapshotCrypto,
          });

        await transaction.registerCompensation(
          restoreFormularyPrescriptionRecordCompensation(
            `restore-prescription-warning:${command.warningId}:${fresh.version + 1}`,
            restorePayload,
          ),
        );

        const updated =
          await this.support
            .prescriptions
            .acknowledge(
              command.actor.facilityId,
              command.warningId,
              command.input.expectedVersion,
              command.actor.userId,
              command.input.reason,
              command.input.override,
              occurredAt,
            );

        if (updated === null) {
          throw new PrescriptionSafetyWarningConcurrencyError();
        }

        await transaction.checkpoint(
          FORMULARY_PRESCRIPTION_TRANSACTION_STATES.WARNINGS_PERSISTED,
          {
            prescriptionId:
              command.prescriptionId,

            warningId:
              command.warningId,

            warningStatus:
              updated.status,
          },
        );

        const action =
          command.input.override
            ? FORMULARY_PRESCRIPTION_AUDIT_ACTIONS.PRESCRIPTION_WARNING_OVERRIDDEN
            : FORMULARY_PRESCRIPTION_AUDIT_ACTIONS.PRESCRIPTION_WARNING_ACKNOWLEDGED;

        await this.support.dependencies.audit.append({
          transactionId:
            transaction.transactionId,

          deduplicationKey:
            formularyPrescriptionDeduplicationKey(
              transaction.transactionId,
              action,
              command.warningId,
            ),

          action,

          entityType:
            'PrescriptionSafetyWarning',

          entityId:
            command.warningId,

          actorUserId:
            command.actor.userId,

          facilityId:
            command.actor.facilityId,

          correlationId:
            command.actor.correlationId,

          ...(command.actor.ipAddress ===
          undefined
            ? {}
            : {
                ipAddress:
                  command.actor.ipAddress,
              }),

          ...(command.actor.userAgent ===
          undefined
            ? {}
            : {
                userAgent:
                  command.actor.userAgent,
              }),

          occurredAt,

          reason:
            command.input.reason,

          before: {
            prescriptionId:
              command.prescriptionId,

            warningType:
              fresh.warningType,

            severity:
              fresh.severity,

            status:
              fresh.status,

            version:
              fresh.version,
          },

          after: {
            prescriptionId:
              command.prescriptionId,

            warningType:
              updated.warningType,

            severity:
              updated.severity,

            status:
              updated.status,

            version:
              updated.version,
          },
        });

        await transaction.checkpoint(
          FORMULARY_PRESCRIPTION_TRANSACTION_STATES.AUDIT_APPENDED,
          {
            warningId:
              command.warningId,
          },
        );

        await this.support.dependencies.outbox.enqueue({
          transactionId:
            transaction.transactionId,

          deduplicationKey:
            formularyPrescriptionDeduplicationKey(
              transaction.transactionId,
              FORMULARY_PRESCRIPTION_OUTBOX_EVENTS.PRESCRIPTION_WARNING_CHANGED,
              command.warningId,
            ),

          eventType:
            FORMULARY_PRESCRIPTION_OUTBOX_EVENTS.PRESCRIPTION_WARNING_CHANGED,

          aggregateType:
            'PrescriptionSafetyWarning',

          aggregateId:
            command.warningId,

          actorUserId:
            command.actor.userId,

          facilityId:
            command.actor.facilityId,

          correlationId:
            command.actor.correlationId,

          occurredAt,

          payload: {
            prescriptionId:
              command.prescriptionId,

            warningId:
              command.warningId,

            warningType:
              updated.warningType,

            severity:
              updated.severity,

            status:
              updated.status,

            version:
              updated.version,
          },
        });

        await transaction.checkpoint(
          FORMULARY_PRESCRIPTION_TRANSACTION_STATES.OUTBOX_ENQUEUED,
          {
            warningId:
              command.warningId,
          },
        );

        await this.support.dependencies.realtime.publish({
          eventType:
            FORMULARY_PRESCRIPTION_REALTIME_EVENTS.PRESCRIPTION_WARNING_CHANGED,

          facilityId:
            command.actor.facilityId,

          patientId:
            prescription.patientId
              .toHexString(),

          encounterId:
            prescription.encounterId
              .toHexString(),

          prescriptionId:
            command.prescriptionId,

          providerId:
            prescription.prescriberProviderId
              .toHexString(),

          payload: {
            ...safePrescriptionEventPayload(
              prescription,
            ),

            warningId:
              command.warningId,

            warningType:
              updated.warningType,

            severity:
              updated.severity,

            warningStatus:
              updated.status,
          },
        });

        await transaction.checkpoint(
          FORMULARY_PRESCRIPTION_TRANSACTION_STATES.REALTIME_PUBLISHED,
          {
            warningId:
              command.warningId,
          },
        );

        return toPrescriptionSafetyWarningView(
          updated,
        );
      },
    });
  }
}