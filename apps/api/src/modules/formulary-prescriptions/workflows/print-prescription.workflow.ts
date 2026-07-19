import {
  Buffer,
} from 'node:buffer';

import {
  PrescriptionConcurrencyError,
  PrescriptionDraftRequiredError,
} from '../formulary-prescriptions.errors.js';

import type {
  FormularyPrescriptionActorContext,
  PrintPrescriptionInput,
} from '../formulary-prescriptions.types.js';

import type {
  PrescriptionPrintDocument,
  PrescriptionPrintPort,
} from '../formulary-prescriptions.ports.js';

import {
  prescriptionMutationLockKeys,
  safePrescriptionJournalPayload,
  formularyPrescriptionDeduplicationKey,
} from '../formulary-prescriptions.workflow-helpers.js';

import {
  prescriptionRestoreSnapshot,
  protectFormularyPrescriptionRestorePayload,
  restoreFormularyPrescriptionRecordCompensation,
} from '../formulary-prescriptions.mutation-snapshots.js';

import {
  FORMULARY_PRESCRIPTION_AUDIT_ACTIONS,
  FORMULARY_PRESCRIPTION_TRANSACTION_STATES,
} from '../formulary-prescriptions.transaction.constants.js';

import {
  FORMULARY_PRESCRIPTION_TRANSACTION_TYPES,
} from '../formulary-prescriptions.constants.js';

import {
  FormularyPrescriptionCommandService,
} from '../services/formulary-prescription-command.service.js';

interface PersistedPrintablePrescription {
  mediaType:
    'application/pdf';

  filename:
    string;

  contentHash:
    string;

  bytesBase64:
    string;
}

export interface PrintPrescriptionCommand {
  actor:
    FormularyPrescriptionActorContext;

  prescriptionId:
    string;

  input:
    PrintPrescriptionInput;

  idempotencyKey:
    string;
}

export class PrintPrescriptionWorkflow {
  public constructor(
    private readonly support:
      FormularyPrescriptionCommandService,

    private readonly printer:
      PrescriptionPrintPort,
  ) {}

  public async execute(
    command:
      PrintPrescriptionCommand,
  ): Promise<PrescriptionPrintDocument> {
    const current =
      await this.support
        .requirePrescription(
          command.actor,
          command.prescriptionId,
        );

    if (
      current.status ===
      'DRAFT'
    ) {
      throw new PrescriptionDraftRequiredError();
    }

    this.support.assertExpectedVersion(
      current,
      command.input.expectedVersion,
    );

    await this.support.assertAccess(
      command.actor,
      'PRESCRIPTION_PRINT',
      {
        prescription:
          current,
      },
    );

    const persisted =
      await this.support
        .dependencies
        .transactionManager
        .execute<PersistedPrintablePrescription>({
          transactionType:
            FORMULARY_PRESCRIPTION_TRANSACTION_TYPES
              .PRINT_PRESCRIPTION,

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
              'PRINT_PRESCRIPTION',
              {
                prescriptionId:
                  command.prescriptionId,

                encounterId:
                  current.encounterId
                    .toHexString(),

                patientId:
                  current.patientId
                    .toHexString(),

                status:
                  current.status,

                itemCount:
                  current.itemCount,

                revisionNumber:
                  current.revisionNumber,
              },
            ),

          execute: async (
            transaction,
          ) => {
            const fresh =
              await this.support
                .requirePrescription(
                  command.actor,
                  command.prescriptionId,
                );

            if (
              fresh.status ===
              'DRAFT'
            ) {
              throw new PrescriptionDraftRequiredError();
            }

            this.support.assertExpectedVersion(
              fresh,
              command.input.expectedVersion,
            );

            const [
              items,
              warnings,
            ] =
              await Promise.all([
                this.support
                  .prescriptions
                  .listItems(
                    command.actor.facilityId,
                    command.prescriptionId,
                  ),

                this.support
                  .prescriptions
                  .listForPrescription(
                    command.actor.facilityId,
                    command.prescriptionId,
                    true,
                  ),
              ]);

            const document =
              await this.printer.render({
                prescription:
                  fresh,

                items,

                warnings,

                locale:
                  command.input.locale ??
                  'en-PK',

                timezone:
                  command.input.timezone ??
                  'Asia/Karachi',
              });

            await transaction.checkpoint(
              FORMULARY_PRESCRIPTION_TRANSACTION_STATES
                .PRINT_ARTIFACT_CREATED,

              {
                prescriptionId:
                  command.prescriptionId,

                contentHash:
                  document.contentHash,
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
                  this.support
                    .dependencies
                    .snapshotCrypto,
              });

            await transaction.registerCompensation(
              restoreFormularyPrescriptionRecordCompensation(
                `restore-prescription-after-print:${command.prescriptionId}:${fresh.version + 1}`,

                restorePayload,
              ),
            );

            const printedAt =
              this.support
                .dependencies
                .clock
                .now();

            const updated =
              await this.support
                .prescriptions
                .markPrinted(
                  command.actor.facilityId,
                  command.prescriptionId,
                  command.input.expectedVersion,
                  command.actor.userId,
                  printedAt,
                );

            if (
              updated ===
              null
            ) {
              throw new PrescriptionConcurrencyError();
            }

            await transaction.checkpoint(
              FORMULARY_PRESCRIPTION_TRANSACTION_STATES
                .CURRENT_PROJECTION_UPDATED,

              {
                prescriptionId:
                  command.prescriptionId,

                printRevision:
                  updated.printRevision,
              },
            );

            await this.support
              .dependencies
              .audit
              .append({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  formularyPrescriptionDeduplicationKey(
                    transaction.transactionId,

                    FORMULARY_PRESCRIPTION_AUDIT_ACTIONS
                      .PRESCRIPTION_PRINTED,

                    command.prescriptionId,
                  ),

                action:
                  FORMULARY_PRESCRIPTION_AUDIT_ACTIONS
                    .PRESCRIPTION_PRINTED,

                entityType:
                  'Prescription',

                entityId:
                  command.prescriptionId,

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

                occurredAt:
                  printedAt,

                before: {
                  printRevision:
                    fresh.printRevision,

                  lastPrintedAt:
                    fresh.lastPrintedAt
                      ?.toISOString() ??
                    null,

                  version:
                    fresh.version,
                },

                after: {
                  printRevision:
                    updated.printRevision,

                  lastPrintedAt:
                    updated.lastPrintedAt
                      ?.toISOString() ??
                    null,

                  version:
                    updated.version,
                },

                metadata: {
                  contentHash:
                    document.contentHash,

                  filename:
                    document.filename,

                  mediaType:
                    document.mediaType,
                },
              });

            await transaction.checkpoint(
              FORMULARY_PRESCRIPTION_TRANSACTION_STATES
                .AUDIT_APPENDED,

              {
                prescriptionId:
                  command.prescriptionId,

                printRevision:
                  updated.printRevision,
              },
            );

            return {
              mediaType:
                document.mediaType,

              filename:
                document.filename,

              contentHash:
                document.contentHash,

              bytesBase64:
                Buffer
                  .from(
                    document.bytes,
                  )
                  .toString(
                    'base64',
                  ),
            };
          },
        });

    return {
      mediaType:
        persisted.mediaType,

      filename:
        persisted.filename,

      contentHash:
        persisted.contentHash,

      bytes:
        new Uint8Array(
          Buffer.from(
            persisted.bytesBase64,
            'base64',
          ),
        ),
    };
  }
}