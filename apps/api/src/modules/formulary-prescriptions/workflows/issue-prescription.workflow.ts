import {
  toObjectId,
} from '@hospital-mis/database';

import {
  PrescriptionBlockingWarningError,
  PrescriptionConcurrencyError,
  PrescriptionDraftRequiredError,
  PrescriptionSignatureRequiredError,
} from '../formulary-prescriptions.errors.js';

import type {
  FormularyPrescriptionActorContext,
  IssuePrescriptionInput,
} from '../formulary-prescriptions.types.js';

import {
  prescriptionRestoreSnapshot,
  protectFormularyPrescriptionRestorePayload,
  restoreFormularyPrescriptionRecordCompensation,
} from '../formulary-prescriptions.mutation-snapshots.js';

import {
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
  prescriptionSnapshotAssociatedData,
} from '../formulary-prescriptions.normalization.js';

import type {
  PrescriptionRecord,
} from '../formulary-prescriptions.persistence.types.js';

import {
  FormularyPrescriptionCommandService,
} from '../services/formulary-prescription-command.service.js';

import {
  PrescriptionSafetyService,
} from '../services/prescription-safety.service.js';

export interface IssuePrescriptionCommand {
  actor: FormularyPrescriptionActorContext;
  prescriptionId: string;
  input: IssuePrescriptionInput;
  idempotencyKey: string;
}

export class IssuePrescriptionWorkflow {
  public constructor(
    private readonly support:
      FormularyPrescriptionCommandService,

    private readonly safety:
      PrescriptionSafetyService,
  ) {}

  public async execute(
    command: IssuePrescriptionCommand,
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
      'PRESCRIPTION_ISSUE',
      {
        clinicalContext:
          context,

        prescription:
          current,
      },
    );

    if (
      command.input.signatureDigest.trim().length <
      32
    ) {
      throw new PrescriptionSignatureRequiredError();
    }

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        FORMULARY_PRESCRIPTION_TRANSACTION_TYPES.ISSUE_PRESCRIPTION,

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
          'ISSUE_PRESCRIPTION',
          {
            prescriptionId:
              command.prescriptionId,

            encounterId:
              current.encounterId.toHexString(),

            patientId:
              current.patientId.toHexString(),

            status:
              'ISSUED',

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

        if (fresh.status !== 'DRAFT') {
          throw new PrescriptionDraftRequiredError();
        }

        this.support.assertExpectedVersion(
          fresh,
          command.input.expectedVersion,
        );

        const currentContext =
          await this.support.resolveClinicalContext(
            command.actor,
            fresh.encounterId.toHexString(),
            fresh.requestedPatientId.toHexString(),
            fresh.prescriberProviderId.toHexString(),
          );

        const items =
          await this.support.prescriptions.listItems(
            command.actor.facilityId,
            command.prescriptionId,
          );

        const occurredAt =
          this.support.dependencies.clock.now();

        const findings =
          await this.safety.evaluate({
            actor:
              command.actor,

            context:
              currentContext,

            prescriptionId:
              command.prescriptionId,

            items,
          });

        await transaction.checkpoint(
          FORMULARY_PRESCRIPTION_TRANSACTION_STATES.SAFETY_EVALUATED,
          {
            prescriptionId:
              command.prescriptionId,

            warningCount:
              findings.length,
          },
        );

        let warnings =
          await this.support.prescriptions.replaceOpenFindings(
            command.actor.facilityId,
            command.prescriptionId,
            fresh.patientId.toHexString(),
            fresh.encounterId.toHexString(),
            findings,
            command.actor.userId,
            transaction.transactionId,
            command.actor.correlationId,
            occurredAt,
          );

        for (
          const [
            warningId,
            acknowledgement,
          ] of Object.entries(
            command.input.warningAcknowledgements ??
            {},
          )
        ) {
          const acknowledged =
            await this.support.prescriptions.acknowledge(
              command.actor.facilityId,
              warningId,
              acknowledgement.expectedVersion,
              command.actor.userId,
              acknowledgement.reason,
              acknowledgement.override,
              occurredAt,
            );

          if (acknowledged === null) {
            throw new PrescriptionConcurrencyError();
          }
        }

        warnings =
          await this.support.prescriptions.listForPrescription(
            command.actor.facilityId,
            command.prescriptionId,
            true,
          );

        const blockingWarnings =
          this.support.blockingWarnings(
            warnings,
          );

        if (blockingWarnings.length > 0) {
          throw new PrescriptionBlockingWarningError();
        }

        await transaction.checkpoint(
          FORMULARY_PRESCRIPTION_TRANSACTION_STATES.WARNINGS_PERSISTED,
          {
            prescriptionId:
              command.prescriptionId,

            warningCount:
              warnings.length,
          },
        );

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

        const expiresAt =
          command.input.expiresAt == null
            ? this.support.defaultExpiry(
                occurredAt,
              )
            : new Date(
                command.input.expiresAt,
              );

        const associatedData =
          prescriptionSnapshotAssociatedData(
            command.actor.facilityId,
            command.prescriptionId,
            2,
          );

        const issuedSnapshotHash =
          this.support.dependencies.snapshotCrypto.hash(
            {
              prescriptionId:
                command.prescriptionId,

              prescriptionNumber:
                fresh.prescriptionNumber,

              patientId:
                fresh.patientId.toHexString(),

              encounterId:
                fresh.encounterId.toHexString(),

              prescriberProviderId:
                fresh.prescriberProviderId.toHexString(),

              items:
                items.map(
                  (item) => ({
                    itemId:
                      item._id.toHexString(),

                    formularyItemId:
                      item.formularyItemId.toHexString(),

                    medicineId:
                      item.medicineId.toHexString(),

                    dose:
                      item.dose.toString(),

                    doseUnit:
                      item.doseUnitSnapshot,

                    route:
                      item.routeSnapshot,

                    frequency:
                      item.frequencySnapshot,

                    durationValue:
                      item.durationValue?.toString() ??
                      null,

                    durationUnit:
                      item.durationUnit,

                    quantity:
                      item.quantity.toString(),

                    instructions:
                      item.instructions,
                  }),
                ),

              warnings:
                warnings.map(
                  (warning) => ({
                    warningId:
                      warning._id.toHexString(),

                    warningType:
                      warning.warningType,

                    severity:
                      warning.severity,

                    status:
                      warning.status,
                  }),
                ),
            },
            associatedData,
          );

        const issued =
          await this.support.prescriptions.transitionStatus(
            command.actor.facilityId,
            command.prescriptionId,
            command.input.expectedVersion,
            [
              'DRAFT',
            ],
            {
              status:
                'ISSUED',

              issuedAt:
                occurredAt,

              expiresAt,

              signedBy:
                toObjectId(
                  command.actor.userId,
                  'signedBy',
                ),

              signatureMethod:
                command.input.signatureMethod,

              signatureDigest:
                command.input.signatureDigest,

              lockedAt:
                occurredAt,

              lockedBy:
                toObjectId(
                  command.actor.userId,
                  'lockedBy',
                ),

              issuedSnapshotHash,

              safetyWarningCount:
                warnings.length,

              unresolvedBlockingWarningCount:
                0,

              updatedBy:
                toObjectId(
                  command.actor.userId,
                  'actorUserId',
                ),
            },
          );

        if (issued === null) {
          throw new PrescriptionConcurrencyError();
        }

        await transaction.checkpoint(
          FORMULARY_PRESCRIPTION_TRANSACTION_STATES.CURRENT_PROJECTION_UPDATED,
          {
            prescriptionId:
              command.prescriptionId,

            status:
              issued.status,
          },
        );

        const history =
          await this.support.prescriptions.listHistory(
            command.actor.facilityId,
            command.prescriptionId,
          );

        await this.support.appendStatusHistory({
          transaction,
          actor:
            command.actor,

          prescription:
            issued,

          items,

          warnings,

          sequence:
            history.length + 1,

          fromStatus:
            'DRAFT',

          toStatus:
            'ISSUED',

          changeType:
            'ISSUED',

          changeSource:
            'PROVIDER',

          occurredAt,

          signedBy:
            command.actor.userId,

          signatureMethod:
            command.input.signatureMethod,

          signatureDigest:
            command.input.signatureDigest,
        });

        await this.support.publishPrescriptionMutation({
          transaction,
          actor:
            command.actor,

          occurredAt,

          auditAction:
            FORMULARY_PRESCRIPTION_AUDIT_ACTIONS.PRESCRIPTION_ISSUED,

          outboxEventType:
            FORMULARY_PRESCRIPTION_OUTBOX_EVENTS.PRESCRIPTION_ISSUED,

          realtimeEventTypes: [
            FORMULARY_PRESCRIPTION_REALTIME_EVENTS.PRESCRIPTION_CHANGED,
            FORMULARY_PRESCRIPTION_REALTIME_EVENTS.PATIENT_MEDICATION_HISTORY_CHANGED,
            FORMULARY_PRESCRIPTION_REALTIME_EVENTS.PHARMACY_QUEUE_CHANGED,
          ],

          before:
            fresh,

          after:
            issued,
        });

        return issued;
      },
    });
  }
}