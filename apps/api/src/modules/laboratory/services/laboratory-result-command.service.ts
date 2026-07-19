import {
  Types,
} from 'mongoose';

import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  ChangeLaboratoryPublicationInput,
  CorrectLaboratoryResultInput,
  EnterLaboratoryResultInput,
  LaboratoryActorContext,
  RecordCriticalResultCommunicationInput,
  ValidateLaboratoryResultInput,
  VerifyLaboratoryResultInput,
} from '../laboratory.types.js';

import type {
  LaboratoryOrderItemRecord,
  LaboratoryOrderRecord,
  LaboratoryResultRecord,
  LaboratoryResultVersionRecord,
  LaboratorySpecimenRecord,
  LaboratoryTestRecord,
} from '../laboratory.persistence.types.js';

import {
  LABORATORY_LOCK_NAMESPACE,
  LABORATORY_NUMBER_SEQUENCE_NAMESPACE,
  LABORATORY_TRANSACTION_TYPES,
} from '../laboratory.constants.js';

import {
  LABORATORY_RESULT_AUDIT_ACTIONS,
  LABORATORY_RESULT_OUTBOX_EVENTS,
  LABORATORY_RESULT_REALTIME_EVENTS,
} from '../laboratory-result.transaction.constants.js';

import {
  LaboratoryCriticalResultCommunicationConflictError,
  LaboratoryCriticalResultComponentNotFoundError,
  LaboratoryResultAttributionError,
  LaboratoryResultComponentDefinitionError,
  LaboratoryResultOrderItemStateError,
  LaboratoryResultPublicationConflictError,
  LaboratoryResultSpecimenMismatchError,
} from '../laboratory-result.errors.js';

import {
  LaboratoryOrderConcurrencyError,
  LaboratoryOrderItemConcurrencyError,
  LaboratoryOrderItemNotFoundError,
  LaboratoryResultConcurrencyError,
  LaboratoryResultNotFoundError,
  LaboratoryResultVersionNotFoundError,
  LaboratorySpecimenNotFoundError,
  LaboratoryTestNotFoundError,
} from '../laboratory.errors.js';

import {
  assertLaboratoryPublicationTransition,
  assertLaboratoryResultEditable,
  assertLaboratoryResultTransition,
  assertLaboratoryResultVerificationReady,
} from '../laboratory.lifecycle.js';

import {
  createLaboratoryVerifiedResultSnapshot,
  laboratoryResultSnapshotContentHash,
  laboratoryResultVersionAssociatedData,
  mapLaboratoryResultComponents,
  safeLaboratoryResultAuditSnapshot,
  safeLaboratoryResultEventPayload,
  summarizeLaboratoryResultFlags,
} from '../laboratory-result.workflow-helpers.js';

import {
  deleteCreatedLaboratoryResultRecordCompensation,
  laboratoryResultRestoreSnapshot,
  protectLaboratoryResultRestorePayload,
  restoreLaboratoryResultRecordCompensation,
} from '../laboratory-result.mutation-snapshots.js';

import {
  formatLaboratoryNumber,
  laboratoryLockKey,
} from '../laboratory.workflow-helpers.js';

import {
  normalizeLaboratoryCode,
  normalizeNullableLaboratoryText,
} from '../laboratory.normalization.js';

import {
  LaboratoryCommandService,
} from './laboratory-command.service.js';

import {
  LaboratorySpecimenRepository,
} from '../repositories/laboratory-specimen.repository.js';

import {
  LaboratoryResultRepository,
} from '../repositories/laboratory-result.repository.js';

interface ResultMutationCommand<T> {
  actor: LaboratoryActorContext;
  resultId: string;
  input: T;
  idempotencyKey: string;
}

interface EnterResultCommand {
  actor: LaboratoryActorContext;
  input: EnterLaboratoryResultInput;
  idempotencyKey: string;
}

function activeResultEntryItemStatus(
  item: LaboratoryOrderItemRecord,
): boolean {
  if (!item.requiresSpecimen) {
    return [
      'ACCEPTED',
      'IN_PROGRESS',
      'RESULT_ENTERED',
    ].includes(item.status);
  }

  return [
    'SPECIMEN_RECEIVED',
    'IN_PROGRESS',
    'RESULT_ENTERED',
  ].includes(item.status);
}

function internalRecipientRequiresReference(
  recipientType:
    RecordCriticalResultCommunicationInput['recipientType'],
): boolean {
  return [
    'ORDERING_PROVIDER',
    'ON_CALL_PROVIDER',
    'NURSE',
  ].includes(recipientType);
}

export class LaboratoryResultCommandService {
  public constructor(
    private readonly support:
      LaboratoryCommandService,

    private readonly results:
      LaboratoryResultRepository,

    private readonly specimens:
      LaboratorySpecimenRepository,
  ) {}

  private async assertActorStaffAttribution(
    actor:
      LaboratoryActorContext,

    attributedStaffId:
      string,

    role:
      string,
  ): Promise<void> {
    const actorStaffId =
      await this
        .support
        .accessPolicy
        .requireActiveActorStaffId(
          actor,
        );

    if (
      actorStaffId !==
      attributedStaffId
    ) {
      throw new LaboratoryResultAttributionError(
        `The authenticated actor must match the attributed ${role} staff member`,
      );
    }
  }

  private async requireResult(
    actor:
      LaboratoryActorContext,

    resultId:
      string,
  ): Promise<
    LaboratoryResultRecord
  > {
    const result =
      await this
        .results
        .findById(
          actor.facilityId,
          resultId,
        );

    if (
      result ===
      null
    ) {
      throw new LaboratoryResultNotFoundError();
    }

    return result;
  }

  private async requireItem(
    actor:
      LaboratoryActorContext,

    itemId:
      string,
  ): Promise<
    LaboratoryOrderItemRecord
  > {
    const item =
      await this
        .support
        .orders
        .findItemById(
          actor.facilityId,
          itemId,
        );

    if (
      item ===
      null
    ) {
      throw new LaboratoryOrderItemNotFoundError();
    }

    return item;
  }

  private async requireTest(
    actor:
      LaboratoryActorContext,

    testId:
      string,
  ): Promise<
    LaboratoryTestRecord
  > {
    const test =
      await this
        .support
        .catalog
        .findTestById(
          actor.facilityId,
          testId,
        );

    if (
      test ===
      null
    ) {
      throw new LaboratoryTestNotFoundError();
    }

    return test;
  }

  private async resolveSpecimen(
    actor:
      LaboratoryActorContext,

    item:
      LaboratoryOrderItemRecord,

    specimenId:
      string | null | undefined,
  ): Promise<
    LaboratorySpecimenRecord | null
  > {
    if (
      !item.requiresSpecimen
    ) {
      if (
        specimenId !=
        null
      ) {
        throw new LaboratoryResultSpecimenMismatchError();
      }

      return null;
    }

    if (
      specimenId ==
      null
    ) {
      throw new LaboratoryResultSpecimenMismatchError();
    }

    const specimen =
      await this
        .specimens
        .findById(
          actor.facilityId,
          specimenId,
        );

    if (
      specimen ===
      null
    ) {
      throw new LaboratorySpecimenNotFoundError();
    }

    const itemLinked =
      specimen
        .labOrderItemIds
        .some(
          (itemId) =>
            itemId.equals(
              item._id,
            ),
        );

    if (
      !itemLinked ||
      !specimen
        .labOrderId
        .equals(
          item.labOrderId,
        ) ||
      ![
        'RECEIVED',
        'PROCESSING',
        'COMPLETED',
      ].includes(
        specimen.status,
      )
    ) {
      throw new LaboratoryResultSpecimenMismatchError();
    }

    return specimen;
  }

  private async assertResultAccess(
    actor:
      LaboratoryActorContext,

    action:
      | 'RESULT_ENTER'
      | 'RESULT_VALIDATE'
      | 'RESULT_VERIFY'
      | 'RESULT_AMEND'
      | 'RESULT_PUBLISH'
      | 'CRITICAL_NOTIFY'
      | 'CRITICAL_ACKNOWLEDGE',

    order:
      LaboratoryOrderRecord,

    result?:
      LaboratoryResultRecord,
  ): Promise<void> {
    const decision =
      await this
        .support
        .accessPolicy
        .authorize({
          actor,

          action,

          order,

          ...(
            result ===
            undefined
              ? {}
              : {
                  result,
                }
          ),
        });

    if (
      !decision.allowed
    ) {
      throw new LaboratoryResultAttributionError(
        'The acting user is not authorized for this Laboratory result operation',
      );
    }
  }

  private async synchronizeOrderAggregate(
    actor:
      LaboratoryActorContext,

    order:
      LaboratoryOrderRecord,

    occurredAt:
      Date,
  ): Promise<
    LaboratoryOrderRecord
  > {
    const items =
      await this
        .support
        .orders
        .listItems(
          actor.facilityId,
          order
            ._id
            .toHexString(),
        );

    const activeItems =
      items.filter(
        (item) =>
          item.status !==
          'CANCELLED',
      );

    const completedItemCount =
      activeItems.filter(
        (item) =>
          [
            'COMPLETED',
            'VERIFIED',
          ].includes(
            item.status,
          ),
      ).length;

    const verifiedItemCount =
      activeItems.filter(
        (item) =>
          item.status ===
          'VERIFIED',
      ).length;

    const collectedItemCount =
      activeItems.filter(
        (item) =>
          [
            'SPECIMEN_COLLECTED',
            'SPECIMEN_RECEIVED',
            'IN_PROGRESS',
            'RESULT_ENTERED',
            'COMPLETED',
            'VERIFIED',
          ].includes(
            item.status,
          ),
      ).length;

    const rejectedItemCount =
      activeItems.filter(
        (item) =>
          [
            'REJECTED',
            'RECOLLECTION_REQUIRED',
          ].includes(
            item.status,
          ),
      ).length;

    let status =
      order.status;

    if (
      activeItems.length >
        0 &&
      verifiedItemCount ===
        activeItems.length
    ) {
      status =
        'VERIFIED';
    } else if (
      activeItems.length >
        0 &&
      completedItemCount ===
        activeItems.length
    ) {
      status =
        'COMPLETED';
    } else if (
      completedItemCount >
      0
    ) {
      status =
        'PARTIALLY_COMPLETED';
    } else if (
      activeItems.some(
        (item) =>
          [
            'IN_PROGRESS',
            'RESULT_ENTERED',
          ].includes(
            item.status,
          ),
      )
    ) {
      status =
        'IN_PROGRESS';
    }

    const actorId =
      toObjectId(
        actor.userId,
        'actorUserId',
      );

    const updated =
      await this
        .support
        .orders
        .transitionStatus(
          actor.facilityId,

          order
            ._id
            .toHexString(),

          order.version,

          [
            order.status,
          ],

          {
            status,

            activeItemCount:
              activeItems.length,

            collectedItemCount,

            completedItemCount,

            verifiedItemCount,

            rejectedItemCount,

            processingStartedAt:
              status ===
                'IN_PROGRESS' &&
              order
                .processingStartedAt ===
                null
                ? occurredAt
                : order
                    .processingStartedAt,

            completedAt:
              status ===
                'COMPLETED' ||
              status ===
                'VERIFIED'
                ? order
                    .completedAt ??
                  occurredAt
                : order
                    .completedAt,

            verifiedAt:
              status ===
                'VERIFIED'
                ? occurredAt
                : order
                    .verifiedAt,

            lastStatusChangedAt:
              occurredAt,

            lastStatusChangedBy:
              actorId,

            updatedBy:
              actorId,
          },
        );

    if (
      updated ===
      null
    ) {
      throw new LaboratoryOrderConcurrencyError();
    }

    return updated;
  }

  private async appendFinalVersion(
    actor:
      LaboratoryActorContext,

    transactionId:
      string,

    result:
      LaboratoryResultRecord,

    status:
      | 'VERIFIED'
      | 'CORRECTED',

    verifierStaffId:
      string,

    validatorStaffId:
      string,

    occurredAt:
      Date,

    changeType:
      | 'INITIAL_VERIFICATION'
      | 'CORRECTION',

    correctionReason:
      string | null,
  ): Promise<
    LaboratoryResultVersionRecord
  > {
    const versionNumber =
      result.currentVersion +
      1;

    const snapshot =
      createLaboratoryVerifiedResultSnapshot({
        result,

        versionNumber,

        status,

        verifierUserId:
          actor.userId,

        verifierStaffId,

        validatorStaffId,

        recordedAt:
          occurredAt,

        correctionReason,
      });

    const associatedData =
      laboratoryResultVersionAssociatedData(
        actor.facilityId,

        result
          ._id
          .toHexString(),

        versionNumber,
      );

    const protectedSnapshot =
      this
        .support
        .dependencies
        .snapshotCrypto
        .protect(
          snapshot,
          associatedData,
        );

    const actorId =
      toObjectId(
        actor.userId,
        'actorUserId',
      );

    return this
      .results
      .appendVersion({
        facilityId:
          toObjectId(
            actor.facilityId,
            'facilityId',
          ),

        labResultId:
          result._id,

        labOrderId:
          result.labOrderId,

        labOrderItemId:
          result.labOrderItemId,

        patientId:
          result.patientId,

        encounterId:
          result.encounterId,

        versionNumber,

        previousVersionId:
          result.latestVersionId,

        changeType,

        statusSnapshot:
          status,

        overallFlagSnapshot:
          result.overallFlag,

        criticalComponentCountSnapshot:
          result
            .criticalComponentCount,

        encryptedSnapshot:
          protectedSnapshot
            .encryptedValue,

        snapshotHash:
          protectedSnapshot
            .valueHash,

        contentHash:
          laboratoryResultSnapshotContentHash(
            snapshot,
          ),

        changeReason:
          correctionReason,

        technicianStaffId:
          result
            .technicianStaffId ??
          toObjectId(
            verifierStaffId,
            'technicianStaffId',
          ),

        validatorStaffId:
          toObjectId(
            validatorStaffId,
            'validatorStaffId',
          ),

        verifierStaffId:
          toObjectId(
            verifierStaffId,
            'verifierStaffId',
          ),

        recordedAt:
          occurredAt,

        recordedBy:
          actorId,

        transactionId,

        correlationId:
          actor.correlationId,

        schemaVersion:
          1,

        version:
          0,

        createdBy:
          actorId,

        updatedBy:
          actorId,
      });
  }

  public async enter(
    command:
      EnterResultCommand,
  ): Promise<
    LaboratoryResultRecord
  > {
    await this
      .assertActorStaffAttribution(
        command.actor,
        command
          .input
          .technicianStaffId,
        'technician',
      );

    const item =
      await this
        .requireItem(
          command.actor,

          command
            .input
            .labOrderItemId,
        );

    const order =
      await this
        .support
        .requireOrder(
          command.actor,

          item
            .labOrderId
            .toHexString(),
        );

    await this
      .assertResultAccess(
        command.actor,
        'RESULT_ENTER',
        order,
      );

    if (
      !activeResultEntryItemStatus(
        item,
      )
    ) {
      throw new LaboratoryResultOrderItemStateError();
    }

    const specimen =
      await this
        .resolveSpecimen(
          command.actor,
          item,
          command
            .input
            .specimenId,
        );

    const components =
      mapLaboratoryResultComponents(
        item,
        command
          .input
          .components,
      );

    const summary =
      summarizeLaboratoryResultFlags(
        components,
      );

    const existing =
      await this
        .results
        .findByOrderItemId(
          command
            .actor
            .facilityId,

          item
            ._id
            .toHexString(),
        );

    if (
      existing !==
        null &&
      command
        .input
        .expectedVersion ===
        undefined
    ) {
      throw new LaboratoryResultComponentDefinitionError(
        'An expected version is required when updating an existing Laboratory result',
      );
    }

    if (
      existing !==
      null
    ) {
      assertLaboratoryResultEditable(
        existing.status,
      );
    }

    const resultId =
      existing
        ?._id
        .toHexString() ??
      new Types
        .ObjectId()
        .toHexString();

    return this
      .support
      .dependencies
      .transactionManager
      .execute({
        transactionType:
          LABORATORY_TRANSACTION_TYPES
            .ENTER_RESULT,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          laboratoryLockKey(
            LABORATORY_LOCK_NAMESPACE
              .RESULT,

            command.actor.facilityId,

            resultId,
          ),

          laboratoryLockKey(
            LABORATORY_LOCK_NAMESPACE
              .ORDER_ITEM,

            command.actor.facilityId,

            item
              ._id
              .toHexString(),
          ),

          laboratoryLockKey(
            LABORATORY_LOCK_NAMESPACE
              .ORDER,

            command.actor.facilityId,

            order
              ._id
              .toHexString(),
          ),
        ],

        idempotencyPayload:
          command.input,

        journalPayload: {
          operation:
            'ENTER_RESULT',

          orderId:
            order
              ._id
              .toHexString(),

          orderItemId:
            item
              ._id
              .toHexString(),

          resultId,

          componentCount:
            components.length,
        },

        execute: async (
          transaction,
        ) => {
          const occurredAt =
            this
              .support
              .dependencies
              .clock
              .now();

          const actorId =
            toObjectId(
              command.actor.userId,
              'actorUserId',
            );

          const technicianStaffId =
            toObjectId(
              command
                .input
                .technicianStaffId,

              'technicianStaffId',
            );

          let result:
            LaboratoryResultRecord;

          if (
            existing ===
            null
          ) {
            const year =
              occurredAt
                .getUTCFullYear();

            const allocation =
              await this
                .support
                .dependencies
                .sequence
                .next(
                  command
                    .actor
                    .facilityId,

                  `${
                    LABORATORY_NUMBER_SEQUENCE_NAMESPACE
                      .RESULT
                  }:${year}`,
                );

            const resultNumber =
              formatLaboratoryNumber(
                'RES',

                year,

                allocation.value,
              );

            result =
              await this
                .results
                .create({
                  facilityId:
                    toObjectId(
                      command
                        .actor
                        .facilityId,

                      'facilityId',
                    ),

                  resultNumber,

                  labOrderId:
                    order._id,

                  labOrderItemId:
                    item._id,

                  labTestId:
                    item.labTestId,

                  specimenId:
                    specimen
                      ?._id ??
                    null,

                  patientId:
                    order.patientId,

                  encounterId:
                    order.encounterId,

                  testCodeSnapshot:
                    item
                      .testCodeSnapshot,

                  testNameSnapshot:
                    item
                      .testNameSnapshot,

                  methodCodeSnapshot:
                    item
                      .methodCodeSnapshot,

                  methodNameSnapshot:
                    item
                      .methodNameSnapshot,

                  status:
                    'ENTERED',

                  components,

                  overallFlag:
                    summary
                      .overallFlag,

                  criticalComponentCount:
                    summary
                      .criticalComponentCount,

                  unresolvedCriticalComponentCount:
                    summary
                      .criticalComponentCount,

                  conclusion:
                    normalizeNullableLaboratoryText(
                      command
                        .input
                        .conclusion,
                    ),

                  technicalNotes:
                    normalizeNullableLaboratoryText(
                      command
                        .input
                        .technicalNotes,
                    ),

                  enteredAt:
                    occurredAt,

                  enteredBy:
                    actorId,

                  technicianStaffId,

                  validatedAt:
                    null,

                  validatedBy:
                    null,

                  validatorStaffId:
                    null,

                  verifiedAt:
                    null,

                  verifiedBy:
                    null,

                  verifierStaffId:
                    null,

                  currentVersion:
                    0,

                  latestVersionId:
                    null,

                  correctedAt:
                    null,

                  correctedBy:
                    null,

                  correctionReason:
                    null,

                  supersedesResultVersionId:
                    null,

                  cancelledAt:
                    null,

                  cancelledBy:
                    null,

                  cancellationReason:
                    null,

                  publicationStatus:
                    'NOT_PUBLISHED',

                  publishedAt:
                    null,

                  publishedBy:
                    null,

                  withdrawnAt:
                    null,

                  withdrawnBy:
                    null,

                  withdrawalReason:
                    null,

                  transactionId:
                    transaction
                      .transactionId,

                  correlationId:
                    command
                      .actor
                      .correlationId,

                  schemaVersion:
                    1,

                  version:
                    0,

                  createdBy:
                    actorId,

                  updatedBy:
                    actorId,
                });

            await transaction
              .registerCompensation(
                deleteCreatedLaboratoryResultRecordCompensation(
                  `delete-result:${
                    result
                      ._id
                      .toHexString()
                  }`,

                  'labResults',

                  result
                    ._id
                    .toHexString(),

                  transaction
                    .transactionId,
                ),
              );
          } else {
            const expectedVersion =
              command
                .input
                .expectedVersion as
                number;

            const restore =
              protectLaboratoryResultRestorePayload({
                facilityId:
                  command
                    .actor
                    .facilityId,

                collection:
                  'labResults',

                entityId:
                  existing
                    ._id
                    .toHexString(),

                expectedPostVersion:
                  expectedVersion +
                  1,

                transactionId:
                  transaction
                    .transactionId,

                snapshot:
                  laboratoryResultRestoreSnapshot(
                    existing,
                  ),

                snapshotCrypto:
                  this
                    .support
                    .dependencies
                    .snapshotCrypto,
              });

            await transaction
              .registerCompensation(
                restoreLaboratoryResultRecordCompensation(
                  `restore-result:${
                    existing
                      ._id
                      .toHexString()
                  }`,

                  restore,
                ),
              );

            const updated =
              await this
                .results
                .transitionStatus(
                  command
                    .actor
                    .facilityId,

                  existing
                    ._id
                    .toHexString(),

                  expectedVersion,

                  [
                    'DRAFT',
                    'ENTERED',
                  ],

                  {
                    status:
                      'ENTERED',

                    components,

                    overallFlag:
                      summary
                        .overallFlag,

                    criticalComponentCount:
                      summary
                        .criticalComponentCount,

                    unresolvedCriticalComponentCount:
                      summary
                        .criticalComponentCount,

                    conclusion:
                      normalizeNullableLaboratoryText(
                        command
                          .input
                          .conclusion,
                      ),

                    technicalNotes:
                      normalizeNullableLaboratoryText(
                        command
                          .input
                          .technicalNotes,
                      ),

                    enteredAt:
                      occurredAt,

                    enteredBy:
                      actorId,

                    technicianStaffId,

                    validatedAt:
                      null,

                    validatedBy:
                      null,

                    validatorStaffId:
                      null,

                    updatedBy:
                      actorId,
                  },
                );

            if (
              updated ===
              null
            ) {
              throw new LaboratoryResultConcurrencyError();
            }

            result =
              updated;
          }

          const updatedItem =
            await this
              .support
              .orders
              .transitionItem(
                command
                  .actor
                  .facilityId,

                item
                  ._id
                  .toHexString(),

                item.version,

                [
                  'ACCEPTED',
                  'SPECIMEN_RECEIVED',
                  'IN_PROGRESS',
                  'RESULT_ENTERED',
                ],

                {
                  status:
                    'RESULT_ENTERED',

                  resultId:
                    result._id,

                  processingStartedAt:
                    item
                      .processingStartedAt ??
                    occurredAt,

                  updatedBy:
                    actorId,
                },
              );

          if (
            updatedItem ===
            null
          ) {
            throw new LaboratoryOrderItemConcurrencyError();
          }

          await this
            .synchronizeOrderAggregate(
              command.actor,
              order,
              occurredAt,
            );

          const auditAction =
            existing ===
              null
              ? LABORATORY_RESULT_AUDIT_ACTIONS
                  .RESULT_ENTERED
              : LABORATORY_RESULT_AUDIT_ACTIONS
                  .RESULT_UPDATED;

          const eventType =
            existing ===
              null
              ? LABORATORY_RESULT_OUTBOX_EVENTS
                  .RESULT_ENTERED
              : LABORATORY_RESULT_OUTBOX_EVENTS
                  .RESULT_UPDATED;

          await this
            .support
            .dependencies
            .audit
            .append({
              transactionId:
                transaction
                  .transactionId,

              deduplicationKey:
                this
                  .support
                  .deduplicationKey(
                    transaction
                      .transactionId,

                    auditAction,

                    result
                      ._id
                      .toHexString(),
                  ),

              action:
                auditAction,

              entityType:
                'LabResult',

              entityId:
                result
                  ._id
                  .toHexString(),

              ...this
                .support
                .auditActorFields(
                  command.actor,
                ),

              occurredAt,

              before:
                existing ===
                  null
                  ? null
                  : safeLaboratoryResultAuditSnapshot(
                      existing,
                    ),

              after:
                safeLaboratoryResultAuditSnapshot(
                  result,
                ),
            });

          await this
            .support
            .dependencies
            .outbox
            .enqueue({
              transactionId:
                transaction
                  .transactionId,

              deduplicationKey:
                this
                  .support
                  .deduplicationKey(
                    transaction
                      .transactionId,

                    eventType,

                    result
                      ._id
                      .toHexString(),
                  ),

              eventType,

              aggregateType:
                'LabResult',

              aggregateId:
                result
                  ._id
                  .toHexString(),

              actorUserId:
                command.actor.userId,

              facilityId:
                command.actor.facilityId,

              correlationId:
                command.actor.correlationId,

              occurredAt,

              payload:
                safeLaboratoryResultEventPayload(
                  result,
                ),
            });

          await this
            .publishResultRealtime(
              command.actor,
              result,
            );

          return result;
        },
      });
  }

  public async validate(
    command:
      ResultMutationCommand<
        ValidateLaboratoryResultInput
      >,
  ): Promise<
    LaboratoryResultRecord
  > {
    await this
      .assertActorStaffAttribution(
        command.actor,

        command
          .input
          .validatorStaffId,

        'validator',
      );

    const current =
      await this
        .requireResult(
          command.actor,
          command.resultId,
        );

    const order =
      await this
        .support
        .requireOrder(
          command.actor,

          current
            .labOrderId
            .toHexString(),
        );

    await this
      .assertResultAccess(
        command.actor,
        'RESULT_VALIDATE',
        order,
        current,
      );

    assertLaboratoryResultTransition(
      current.status,
      'VALIDATED',
    );

    if (
      current
        .technicianStaffId
        ?.toHexString() ===
      command
        .input
        .validatorStaffId
    ) {
      throw new LaboratoryResultAttributionError(
        'The result validator must be distinct from the entering technician',
      );
    }

    return this
      .support
      .dependencies
      .transactionManager
      .execute({
        transactionType:
          LABORATORY_TRANSACTION_TYPES
            .VALIDATE_RESULT,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          laboratoryLockKey(
            LABORATORY_LOCK_NAMESPACE
              .RESULT,

            command.actor.facilityId,

            command.resultId,
          ),
        ],

        idempotencyPayload:
          command.input,

        journalPayload: {
          operation:
            'VALIDATE_RESULT',

          resultId:
            command.resultId,
        },

        execute: async (
          transaction,
        ) => {
          const occurredAt =
            this
              .support
              .dependencies
              .clock
              .now();

          const actorId =
            toObjectId(
              command.actor.userId,
              'actorUserId',
            );

          const updated =
            await this
              .results
              .transitionStatus(
                command
                  .actor
                  .facilityId,

                command.resultId,

                command
                  .input
                  .expectedVersion,

                [
                  'ENTERED',
                ],

                {
                  status:
                    'VALIDATED',

                  validatedAt:
                    occurredAt,

                  validatedBy:
                    actorId,

                  validatorStaffId:
                    toObjectId(
                      command
                        .input
                        .validatorStaffId,

                      'validatorStaffId',
                    ),

                  updatedBy:
                    actorId,
                },
              );

          if (
            updated ===
            null
          ) {
            throw new LaboratoryResultConcurrencyError();
          }

          await this
            .appendResultAuditAndEvent(
              command.actor,

              transaction
                .transactionId,

              current,

              updated,

              occurredAt,

              LABORATORY_RESULT_AUDIT_ACTIONS
                .RESULT_VALIDATED,

              LABORATORY_RESULT_OUTBOX_EVENTS
                .RESULT_VALIDATED,
            );

          return updated;
        },
      });
  }

  public async verify(
    command:
      ResultMutationCommand<
        VerifyLaboratoryResultInput
      >,
  ): Promise<
    LaboratoryResultRecord
  > {
    await this
      .assertActorStaffAttribution(
        command.actor,

        command
          .input
          .verifierStaffId,

        'verifier',
      );

    const current =
      await this
        .requireResult(
          command.actor,
          command.resultId,
        );

    const item =
      await this
        .requireItem(
          command.actor,

          current
            .labOrderItemId
            .toHexString(),
        );

    const order =
      await this
        .support
        .requireOrder(
          command.actor,

          current
            .labOrderId
            .toHexString(),
        );

    const test =
      await this
        .requireTest(
          command.actor,

          current
            .labTestId
            .toHexString(),
        );

    await this
      .assertResultAccess(
        command.actor,
        'RESULT_VERIFY',
        order,
        current,
      );

    const requiredCodes =
      new Set(
        item
          .resultComponentsSnapshot
          .filter(
            (component) =>
              component.required,
          )
          .map(
            (component) =>
              normalizeLaboratoryCode(
                component
                  .componentCode,
              ),
          ),
      );

    const populatedCodes =
      new Set(
        current
          .components
          .map(
            (component) =>
              normalizeLaboratoryCode(
                component
                  .componentCode,
              ),
          ),
      );

    assertLaboratoryResultVerificationReady({
      status:
        current.status,

      componentCount:
        current
          .components
          .length,

      requiredComponentCount:
        requiredCodes.size,

      populatedRequiredComponentCount:
        [
          ...requiredCodes,
        ].filter(
          (code) =>
            populatedCodes.has(
              code,
            ),
        ).length,

      requiresValidation:
        test
          .requiresResultValidation,

      validatedAt:
        current.validatedAt,

      technicianStaffId:
        current
          .technicianStaffId
          ?.toHexString() ??
        null,

      validatorStaffId:
        current
          .validatorStaffId
          ?.toHexString() ??
        null,

      verifierStaffId:
        command
          .input
          .verifierStaffId,
    });

    return this
      .support
      .dependencies
      .transactionManager
      .execute({
        transactionType:
          LABORATORY_TRANSACTION_TYPES
            .VERIFY_RESULT,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          laboratoryLockKey(
            LABORATORY_LOCK_NAMESPACE
              .RESULT,

            command.actor.facilityId,

            command.resultId,
          ),

          laboratoryLockKey(
            LABORATORY_LOCK_NAMESPACE
              .ORDER_ITEM,

            command.actor.facilityId,

            item
              ._id
              .toHexString(),
          ),

          laboratoryLockKey(
            LABORATORY_LOCK_NAMESPACE
              .ORDER,

            command.actor.facilityId,

            order
              ._id
              .toHexString(),
          ),
        ],

        idempotencyPayload:
          command.input,

        journalPayload: {
          operation:
            'VERIFY_RESULT',

          resultId:
            command.resultId,

          orderId:
            order
              ._id
              .toHexString(),
        },

        execute: async (
          transaction,
        ) => {
          const occurredAt =
            this
              .support
              .dependencies
              .clock
              .now();

          const actorId =
            toObjectId(
              command.actor.userId,
              'actorUserId',
            );

          const prospective:
            LaboratoryResultRecord = {
            ...current,

            status:
              'VERIFIED',

            verifiedAt:
              occurredAt,

            verifiedBy:
              actorId,

            verifierStaffId:
              toObjectId(
                command
                  .input
                  .verifierStaffId,

                'verifierStaffId',
              ),
          };

          const validatorStaffId =
            current
              .validatorStaffId
              ?.toHexString() ??
            command
              .input
              .verifierStaffId;

          const version =
            await this
              .appendFinalVersion(
                command.actor,

                transaction
                  .transactionId,

                prospective,

                'VERIFIED',

                command
                  .input
                  .verifierStaffId,

                validatorStaffId,

                occurredAt,

                'INITIAL_VERIFICATION',

                null,
              );

          await transaction
            .registerCompensation(
              deleteCreatedLaboratoryResultRecordCompensation(
                `delete-result-version:${
                  version
                    ._id
                    .toHexString()
                }`,

                'labResultVersions',

                version
                  ._id
                  .toHexString(),

                transaction
                  .transactionId,
              ),
            );

          const updated =
            await this
              .results
              .transitionStatus(
                command
                  .actor
                  .facilityId,

                command.resultId,

                command
                  .input
                  .expectedVersion,

                test
                  .requiresResultValidation
                  ? [
                      'VALIDATED',
                    ]
                  : [
                      'ENTERED',
                      'VALIDATED',
                    ],

                {
                  status:
                    'VERIFIED',

                  verifiedAt:
                    occurredAt,

                  verifiedBy:
                    actorId,

                  verifierStaffId:
                    toObjectId(
                      command
                        .input
                        .verifierStaffId,

                      'verifierStaffId',
                    ),

                  currentVersion:
                    version
                      .versionNumber,

                  latestVersionId:
                    version._id,

                  supersedesResultVersionId:
                    current
                      .latestVersionId,

                  updatedBy:
                    actorId,
                },
              );

          if (
            updated ===
            null
          ) {
            throw new LaboratoryResultConcurrencyError();
          }

          const updatedItem =
            await this
              .support
              .orders
              .transitionItem(
                command
                  .actor
                  .facilityId,

                item
                  ._id
                  .toHexString(),

                item.version,

                [
                  'RESULT_ENTERED',
                  'IN_PROGRESS',
                ],

                {
                  status:
                    'VERIFIED',

                  completedAt:
                    item
                      .completedAt ??
                    occurredAt,

                  verifiedAt:
                    occurredAt,

                  updatedBy:
                    actorId,
                },
              );

          if (
            updatedItem ===
            null
          ) {
            throw new LaboratoryOrderItemConcurrencyError();
          }

          const updatedOrder =
            await this
              .synchronizeOrderAggregate(
                command.actor,
                order,
                occurredAt,
              );

          if (
            updated
              .criticalComponentCount >
            0
          ) {
            await this
              .support
              .dependencies
              .realtime
              .publish({
                eventType:
                  LABORATORY_RESULT_REALTIME_EVENTS
                    .CRITICAL_WORKLIST_CHANGED,

                facilityId:
                  command
                    .actor
                    .facilityId,

                patientId:
                  updated
                    .patientId
                    .toHexString(),

                encounterId:
                  updated
                    .encounterId
                    .toHexString(),

                orderId:
                  updated
                    .labOrderId
                    .toHexString(),

                resultId:
                  updated
                    ._id
                    .toHexString(),

                payload: {
                  resultId:
                    updated
                      ._id
                      .toHexString(),

                  orderId:
                    updated
                      .labOrderId
                      .toHexString(),

                  criticalComponentCount:
                    updated
                      .criticalComponentCount,

                  unresolvedCriticalComponentCount:
                    updated
                      .unresolvedCriticalComponentCount,

                  status:
                    updated.status,

                  version:
                    updated.version,
                },
              });
          }

          await this
            .appendResultAuditAndEvent(
              command.actor,

              transaction
                .transactionId,

              current,

              updated,

              occurredAt,

              LABORATORY_RESULT_AUDIT_ACTIONS
                .RESULT_VERIFIED,

              LABORATORY_RESULT_OUTBOX_EVENTS
                .RESULT_VERIFIED,

              {
                resultVersionId:
                  version
                    ._id
                    .toHexString(),

                resultVersionNumber:
                  version
                    .versionNumber,

                orderStatus:
                  updatedOrder
                    .status,
              },
            );

          return updated;
        },
      });
  }

  public async correct(
    command:
      ResultMutationCommand<
        CorrectLaboratoryResultInput
      >,
  ): Promise<
    LaboratoryResultRecord
  > {
    await this
      .assertActorStaffAttribution(
        command.actor,

        command
          .input
          .verifierStaffId,

        'correction verifier',
      );

    if (
      command
        .input
        .technicianStaffId ===
        command
          .input
          .validatorStaffId ||
      command
        .input
        .technicianStaffId ===
        command
          .input
          .verifierStaffId ||
      command
        .input
        .validatorStaffId ===
        command
          .input
          .verifierStaffId
    ) {
      throw new LaboratoryResultAttributionError(
        'Correction technician, validator, and verifier must be distinct staff members',
      );
    }

    const current =
      await this
        .requireResult(
          command.actor,
          command.resultId,
        );

    if (
      ![
        'VERIFIED',
        'CORRECTED',
      ].includes(
        current.status,
      )
    ) {
      throw new LaboratoryResultOrderItemStateError();
    }

    const item =
      await this
        .requireItem(
          command.actor,

          current
            .labOrderItemId
            .toHexString(),
        );

    const order =
      await this
        .support
        .requireOrder(
          command.actor,

          current
            .labOrderId
            .toHexString(),
        );

    await this
      .assertResultAccess(
        command.actor,
        'RESULT_AMEND',
        order,
        current,
      );

    const components =
      mapLaboratoryResultComponents(
        item,

        command
          .input
          .components,
      );

    const summary =
      summarizeLaboratoryResultFlags(
        components,
      );

    return this
      .support
      .dependencies
      .transactionManager
      .execute({
        transactionType:
          LABORATORY_TRANSACTION_TYPES
            .CORRECT_RESULT,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          laboratoryLockKey(
            LABORATORY_LOCK_NAMESPACE
              .RESULT,

            command.actor.facilityId,

            command.resultId,
          ),
        ],

        idempotencyPayload:
          command.input,

        journalPayload: {
          operation:
            'CORRECT_RESULT',

          resultId:
            command.resultId,

          componentCount:
            components.length,
        },

        execute: async (
          transaction,
        ) => {
          const occurredAt =
            this
              .support
              .dependencies
              .clock
              .now();

          const actorId =
            toObjectId(
              command.actor.userId,
              'actorUserId',
            );

          const prospective:
            LaboratoryResultRecord = {
            ...current,

            status:
              'CORRECTED',

            components,

            overallFlag:
              summary
                .overallFlag,

            criticalComponentCount:
              summary
                .criticalComponentCount,

            unresolvedCriticalComponentCount:
              summary
                .criticalComponentCount,

            conclusion:
              normalizeNullableLaboratoryText(
                command
                  .input
                  .conclusion,
              ),

            technicalNotes:
              normalizeNullableLaboratoryText(
                command
                  .input
                  .technicalNotes,
              ),

            enteredAt:
              occurredAt,

            enteredBy:
              actorId,

            technicianStaffId:
              toObjectId(
                command
                  .input
                  .technicianStaffId,

                'technicianStaffId',
              ),

            validatedAt:
              occurredAt,

            validatedBy:
              actorId,

            validatorStaffId:
              toObjectId(
                command
                  .input
                  .validatorStaffId,

                'validatorStaffId',
              ),

            verifiedAt:
              occurredAt,

            verifiedBy:
              actorId,

            verifierStaffId:
              toObjectId(
                command
                  .input
                  .verifierStaffId,

                'verifierStaffId',
              ),

            correctedAt:
              occurredAt,

            correctedBy:
              actorId,

            correctionReason:
              command
                .input
                .reason
                .trim(),
          };

          const version =
            await this
              .appendFinalVersion(
                command.actor,

                transaction
                  .transactionId,

                prospective,

                'CORRECTED',

                command
                  .input
                  .verifierStaffId,

                command
                  .input
                  .validatorStaffId,

                occurredAt,

                'CORRECTION',

                command
                  .input
                  .reason
                  .trim(),
              );

          await transaction
            .registerCompensation(
              deleteCreatedLaboratoryResultRecordCompensation(
                `delete-corrected-version:${
                  version
                    ._id
                    .toHexString()
                }`,

                'labResultVersions',

                version
                  ._id
                  .toHexString(),

                transaction
                  .transactionId,
              ),
            );

          const updated =
            await this
              .results
              .transitionStatus(
                command
                  .actor
                  .facilityId,

                command.resultId,

                command
                  .input
                  .expectedVersion,

                [
                  'VERIFIED',
                  'CORRECTED',
                ],

                {
                  status:
                    'CORRECTED',

                  components,

                  overallFlag:
                    summary
                      .overallFlag,

                  criticalComponentCount:
                    summary
                      .criticalComponentCount,

                  unresolvedCriticalComponentCount:
                    summary
                      .criticalComponentCount,

                  conclusion:
                    normalizeNullableLaboratoryText(
                      command
                        .input
                        .conclusion,
                    ),

                  technicalNotes:
                    normalizeNullableLaboratoryText(
                      command
                        .input
                        .technicalNotes,
                    ),

                  enteredAt:
                    occurredAt,

                  enteredBy:
                    actorId,

                  technicianStaffId:
                    toObjectId(
                      command
                        .input
                        .technicianStaffId,

                      'technicianStaffId',
                    ),

                  validatedAt:
                    occurredAt,

                  validatedBy:
                    actorId,

                  validatorStaffId:
                    toObjectId(
                      command
                        .input
                        .validatorStaffId,

                      'validatorStaffId',
                    ),

                  verifiedAt:
                    occurredAt,

                  verifiedBy:
                    actorId,

                  verifierStaffId:
                    toObjectId(
                      command
                        .input
                        .verifierStaffId,

                      'verifierStaffId',
                    ),

                  correctedAt:
                    occurredAt,

                  correctedBy:
                    actorId,

                  correctionReason:
                    command
                      .input
                      .reason
                      .trim(),

                  currentVersion:
                    version
                      .versionNumber,

                  latestVersionId:
                    version._id,

                  supersedesResultVersionId:
                    current
                      .latestVersionId,

                  publicationStatus:
                    current
                      .publicationStatus ===
                      'PUBLISHED'
                      ? 'WITHDRAWN'
                      : current
                          .publicationStatus,

                  withdrawnAt:
                    current
                      .publicationStatus ===
                      'PUBLISHED'
                      ? occurredAt
                      : current
                          .withdrawnAt,

                  withdrawnBy:
                    current
                      .publicationStatus ===
                      'PUBLISHED'
                      ? actorId
                      : current
                          .withdrawnBy,

                  withdrawalReason:
                    current
                      .publicationStatus ===
                      'PUBLISHED'
                      ? 'Automatically withdrawn because a corrected result version was recorded'
                      : current
                          .withdrawalReason,

                  updatedBy:
                    actorId,
                },
              );

          if (
            updated ===
            null
          ) {
            throw new LaboratoryResultConcurrencyError();
          }

          await this
            .appendResultAuditAndEvent(
              command.actor,

              transaction
                .transactionId,

              current,

              updated,

              occurredAt,

              LABORATORY_RESULT_AUDIT_ACTIONS
                .RESULT_CORRECTED,

              LABORATORY_RESULT_OUTBOX_EVENTS
                .RESULT_CORRECTED,

              {
                resultVersionId:
                  version
                    ._id
                    .toHexString(),

                resultVersionNumber:
                  version
                    .versionNumber,
              },

              command
                .input
                .reason,
            );

          return updated;
        },
      });
  }

  public async changePublication(
    command:
      ResultMutationCommand<
        ChangeLaboratoryPublicationInput
      >,
  ): Promise<
    LaboratoryResultRecord
  > {
    const current =
      await this
        .requireResult(
          command.actor,
          command.resultId,
        );

    const order =
      await this
        .support
        .requireOrder(
          command.actor,

          current
            .labOrderId
            .toHexString(),
        );

    await this
      .assertResultAccess(
        command.actor,
        'RESULT_PUBLISH',
        order,
        current,
      );

    if (
      ![
        'VERIFIED',
        'CORRECTED',
      ].includes(
        current.status,
      )
    ) {
      throw new LaboratoryResultPublicationConflictError(
        'Only verified or corrected Laboratory results may be published',
      );
    }

    assertLaboratoryPublicationTransition(
      current
        .publicationStatus,

      command
        .input
        .publicationStatus,
    );

    if (
      command
        .input
        .publicationStatus ===
        'PUBLISHED' &&
      current
        .latestVersionId ===
        null
    ) {
      throw new LaboratoryResultPublicationConflictError(
        'Publication requires an immutable verified result version',
      );
    }

    return this
      .support
      .dependencies
      .transactionManager
      .execute({
        transactionType:
          command
            .input
            .publicationStatus ===
            'PUBLISHED'
            ? LABORATORY_TRANSACTION_TYPES
                .PUBLISH_RESULT
            : LABORATORY_TRANSACTION_TYPES
                .WITHDRAW_RESULT,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          laboratoryLockKey(
            LABORATORY_LOCK_NAMESPACE
              .RESULT,

            command.actor.facilityId,

            command.resultId,
          ),
        ],

        idempotencyPayload:
          command.input,

        journalPayload: {
          operation:
            'CHANGE_RESULT_PUBLICATION',

          resultId:
            command.resultId,

          publicationStatus:
            command
              .input
              .publicationStatus,
        },

        execute: async (
          transaction,
        ) => {
          const occurredAt =
            this
              .support
              .dependencies
              .clock
              .now();

          const actorId =
            toObjectId(
              command.actor.userId,
              'actorUserId',
            );

          const publishing =
            command
              .input
              .publicationStatus ===
            'PUBLISHED';

          const updated =
            await this
              .results
              .transitionPublication(
                command
                  .actor
                  .facilityId,

                command.resultId,

                command
                  .input
                  .expectedVersion,

                [
                  current
                    .publicationStatus,
                ],

                {
                  publicationStatus:
                    command
                      .input
                      .publicationStatus,

                  publishedAt:
                    publishing
                      ? occurredAt
                      : current
                          .publishedAt,

                  publishedBy:
                    publishing
                      ? actorId
                      : current
                          .publishedBy,

                  withdrawnAt:
                    publishing
                      ? null
                      : occurredAt,

                  withdrawnBy:
                    publishing
                      ? null
                      : actorId,

                  withdrawalReason:
                    publishing
                      ? null
                      : command
                          .input
                          .reason
                          ?.trim() ??
                        null,

                  updatedBy:
                    actorId,
                },
              );

          if (
            updated ===
            null
          ) {
            throw new LaboratoryResultConcurrencyError();
          }

          await this
            .appendResultAuditAndEvent(
              command.actor,

              transaction
                .transactionId,

              current,

              updated,

              occurredAt,

              publishing
                ? LABORATORY_RESULT_AUDIT_ACTIONS
                    .RESULT_PUBLISHED
                : LABORATORY_RESULT_AUDIT_ACTIONS
                    .RESULT_WITHDRAWN,

              publishing
                ? LABORATORY_RESULT_OUTBOX_EVENTS
                    .RESULT_PUBLISHED
                : LABORATORY_RESULT_OUTBOX_EVENTS
                    .RESULT_WITHDRAWN,

              undefined,

              command
                .input
                .reason,
            );

          return updated;
        },
      });
  }

  public async recordCriticalCommunication(
    command:
      ResultMutationCommand<
        RecordCriticalResultCommunicationInput
      >,
  ) {
    const current =
      await this
        .requireResult(
          command.actor,
          command.resultId,
        );

    const order =
      await this
        .support
        .requireOrder(
          command.actor,

          current
            .labOrderId
            .toHexString(),
        );

    const action =
      command
        .input
        .communicationType ===
        'ACKNOWLEDGED'
        ? 'CRITICAL_ACKNOWLEDGE'
        : 'CRITICAL_NOTIFY';

    await this
      .assertResultAccess(
        command.actor,
        action,
        order,
        current,
      );

    if (
      current
        .latestVersionId ===
        null ||
      ![
        'VERIFIED',
        'CORRECTED',
      ].includes(
        current.status,
      )
    ) {
      throw new LaboratoryCriticalResultCommunicationConflictError(
        'Critical communication requires a finalized Laboratory result version',
      );
    }

    const componentCode =
      normalizeLaboratoryCode(
        command
          .input
          .componentCode,
      );

    const component =
      current
        .components
        .find(
          (candidate) =>
            normalizeLaboratoryCode(
              candidate
                .componentCode,
            ) ===
            componentCode,
        );

    if (
      component ===
        undefined ||
      ![
        'CRITICAL',
        'CRITICAL_HIGH',
        'CRITICAL_LOW',
      ].includes(
        component.flag,
      )
    ) {
      throw new LaboratoryCriticalResultComponentNotFoundError();
    }

    if (
      internalRecipientRequiresReference(
        command
          .input
          .recipientType,
      ) &&
      command
        .input
        .recipientUserId ==
        null &&
      command
        .input
        .recipientStaffId ==
        null
    ) {
      throw new LaboratoryCriticalResultCommunicationConflictError(
        'Internal critical-result recipients require a user or staff reference',
      );
    }

    const latestVersion =
      await this
        .results
        .findVersionById(
          command.actor.facilityId,

          current
            .latestVersionId
            .toHexString(),
        );

    if (
      latestVersion ===
      null
    ) {
      throw new LaboratoryResultVersionNotFoundError();
    }

    return this
      .support
      .dependencies
      .transactionManager
      .execute({
        transactionType:
          LABORATORY_TRANSACTION_TYPES
            .RECORD_CRITICAL_COMMUNICATION,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          laboratoryLockKey(
            LABORATORY_LOCK_NAMESPACE
              .CRITICAL_COMMUNICATION,

            command.actor.facilityId,

            command.resultId,

            componentCode,
          ),
        ],

        idempotencyPayload:
          command.input,

        journalPayload: {
          operation:
            'RECORD_CRITICAL_COMMUNICATION',

          resultId:
            command.resultId,

          componentCode,

          communicationType:
            command
              .input
              .communicationType,
        },

        execute: async (
          transaction,
        ) => {
          const occurredAt =
            this
              .support
              .dependencies
              .clock
              .now();

          const actorId =
            toObjectId(
              command.actor.userId,
              'actorUserId',
            );

          const existing =
            await this
              .results
              .listCriticalCommunications(
                command
                  .actor
                  .facilityId,

                command.resultId,
              );

          if (
            command
              .input
              .communicationType ===
            'ACKNOWLEDGED'
          ) {
            if (
              !existing.some(
                (entry) =>
                  [
                    'NOTIFIED',
                    'ESCALATED',
                  ].includes(
                    entry
                      .communicationType,
                  ),
              )
            ) {
              throw new LaboratoryCriticalResultCommunicationConflictError(
                'Critical-result acknowledgement requires a prior successful notification or escalation',
              );
            }

            if (
              existing.some(
                (entry) =>
                  entry
                    .communicationType ===
                    'ACKNOWLEDGED' &&
                  entry
                    .componentCodeSnapshot ===
                    componentCode,
              )
            ) {
              throw new LaboratoryCriticalResultCommunicationConflictError(
                'The critical Laboratory result component has already been acknowledged',
              );
            }
          }

          const communication =
            await this
              .results
              .appendCriticalCommunication({
                facilityId:
                  toObjectId(
                    command
                      .actor
                      .facilityId,

                    'facilityId',
                  ),

                labResultId:
                  current._id,

                labResultVersionId:
                  latestVersion._id,

                labOrderId:
                  current.labOrderId,

                patientId:
                  current.patientId,

                encounterId:
                  current.encounterId,

                sequence:
                  existing.length +
                  1,

                componentCodeSnapshot:
                  componentCode,

                resultFlagSnapshot:
                  component.flag as
                    | 'CRITICAL'
                    | 'CRITICAL_HIGH'
                    | 'CRITICAL_LOW',

                communicationType:
                  command
                    .input
                    .communicationType,

                channel:
                  command
                    .input
                    .channel,

                recipientType:
                  command
                    .input
                    .recipientType,

                recipientUserId:
                  command
                    .input
                    .recipientUserId ==
                    null
                    ? null
                    : toObjectId(
                        command
                          .input
                          .recipientUserId,

                        'recipientUserId',
                      ),

                recipientStaffId:
                  command
                    .input
                    .recipientStaffId ==
                    null
                    ? null
                    : toObjectId(
                        command
                          .input
                          .recipientStaffId,

                        'recipientStaffId',
                      ),

                recipientDisplaySnapshot:
                  command
                    .input
                    .recipientDisplay
                    .trim(),

                communicationNotes:
                  normalizeNullableLaboratoryText(
                    command
                      .input
                      .communicationNotes,
                  ),

                occurredAt,

                performedBy:
                  actorId,

                acknowledgedAt:
                  command
                    .input
                    .acknowledgedAt ==
                    null
                    ? null
                    : new Date(
                        command
                          .input
                          .acknowledgedAt,
                      ),

                acknowledgedBy:
                  command
                    .input
                    .acknowledgedBy ==
                    null
                    ? null
                    : toObjectId(
                        command
                          .input
                          .acknowledgedBy,

                        'acknowledgedBy',
                      ),

                acknowledgementNotes:
                  normalizeNullableLaboratoryText(
                    command
                      .input
                      .acknowledgementNotes,
                  ),

                transactionId:
                  transaction
                    .transactionId,

                correlationId:
                  command
                    .actor
                    .correlationId,

                schemaVersion:
                  1,

                version:
                  0,

                createdBy:
                  actorId,

                updatedBy:
                  actorId,
              });

          await transaction
            .registerCompensation(
              deleteCreatedLaboratoryResultRecordCompensation(
                `delete-critical-communication:${
                  communication
                    ._id
                    .toHexString()
                }`,

                'labCriticalResultCommunications',

                communication
                  ._id
                  .toHexString(),

                transaction
                  .transactionId,
              ),
            );

          let unresolvedCriticalComponentCount =
            current
              .unresolvedCriticalComponentCount;

          if (
            command
              .input
              .communicationType ===
            'ACKNOWLEDGED'
          ) {
            unresolvedCriticalComponentCount =
              Math.max(
                0,

                current
                  .unresolvedCriticalComponentCount -
                  1,
              );

            const updated =
              await this
                .results
                .transitionStatus(
                  command
                    .actor
                    .facilityId,

                  command.resultId,

                  command
                    .input
                    .expectedVersion,

                  [
                    current.status,
                  ],

                  {
                    unresolvedCriticalComponentCount,

                    updatedBy:
                      actorId,
                  },
                );

            if (
              updated ===
              null
            ) {
              throw new LaboratoryResultConcurrencyError();
            }
          }

          await this
            .support
            .dependencies
            .audit
            .append({
              transactionId:
                transaction
                  .transactionId,

              deduplicationKey:
                this
                  .support
                  .deduplicationKey(
                    transaction
                      .transactionId,

                    LABORATORY_RESULT_AUDIT_ACTIONS
                      .CRITICAL_COMMUNICATION_RECORDED,

                    communication
                      ._id
                      .toHexString(),
                  ),

              action:
                LABORATORY_RESULT_AUDIT_ACTIONS
                  .CRITICAL_COMMUNICATION_RECORDED,

              entityType:
                'LabCriticalResultCommunication',

              entityId:
                communication
                  ._id
                  .toHexString(),

              ...this
                .support
                .auditActorFields(
                  command.actor,
                ),

              occurredAt,

              metadata: {
                resultId:
                  current
                    ._id
                    .toHexString(),

                resultVersionId:
                  latestVersion
                    ._id
                    .toHexString(),

                componentCode,

                communicationType:
                  command
                    .input
                    .communicationType,

                recipientType:
                  command
                    .input
                    .recipientType,
              },
            });

          await this
            .support
            .dependencies
            .outbox
            .enqueue({
              transactionId:
                transaction
                  .transactionId,

              deduplicationKey:
                this
                  .support
                  .deduplicationKey(
                    transaction
                      .transactionId,

                    LABORATORY_RESULT_OUTBOX_EVENTS
                      .CRITICAL_COMMUNICATION_RECORDED,

                    communication
                      ._id
                      .toHexString(),
                  ),

              eventType:
                LABORATORY_RESULT_OUTBOX_EVENTS
                  .CRITICAL_COMMUNICATION_RECORDED,

              aggregateType:
                'LabResult',

              aggregateId:
                current
                  ._id
                  .toHexString(),

              actorUserId:
                command.actor.userId,

              facilityId:
                command.actor.facilityId,

              correlationId:
                command.actor.correlationId,

              occurredAt,

              payload: {
                resultId:
                  current
                    ._id
                    .toHexString(),

                resultVersionId:
                  latestVersion
                    ._id
                    .toHexString(),

                componentCode,

                communicationType:
                  command
                    .input
                    .communicationType,

                unresolvedCriticalComponentCount,
              },
            });

          await this
            .support
            .dependencies
            .realtime
            .publish({
              eventType:
                LABORATORY_RESULT_REALTIME_EVENTS
                  .CRITICAL_WORKLIST_CHANGED,

              facilityId:
                command.actor.facilityId,

              patientId:
                current
                  .patientId
                  .toHexString(),

              encounterId:
                current
                  .encounterId
                  .toHexString(),

              orderId:
                current
                  .labOrderId
                  .toHexString(),

              resultId:
                current
                  ._id
                  .toHexString(),

              payload: {
                resultId:
                  current
                    ._id
                    .toHexString(),

                componentCode,

                communicationType:
                  command
                    .input
                    .communicationType,

                unresolvedCriticalComponentCount,
              },
            });

          return communication;
        },
      });
  }

  private async appendResultAuditAndEvent(
    actor:
      LaboratoryActorContext,

    transactionId:
      string,

    before:
      LaboratoryResultRecord,

    after:
      LaboratoryResultRecord,

    occurredAt:
      Date,

    auditAction:
      string,

    eventType:
      string,

    metadata?:
      Record<string, unknown>,

    reason?:
      string,
  ): Promise<void> {
    await this
      .support
      .dependencies
      .audit
      .append({
        transactionId,

        deduplicationKey:
          this
            .support
            .deduplicationKey(
              transactionId,
              auditAction,

              after
                ._id
                .toHexString(),
            ),

        action:
          auditAction,

        entityType:
          'LabResult',

        entityId:
          after
            ._id
            .toHexString(),

        ...this
          .support
          .auditActorFields(
            actor,
          ),

        occurredAt,

        ...(
          reason ===
          undefined
            ? {}
            : {
                reason,
              }
        ),

        before:
          safeLaboratoryResultAuditSnapshot(
            before,
          ),

        after:
          safeLaboratoryResultAuditSnapshot(
            after,
          ),

        ...(
          metadata ===
          undefined
            ? {}
            : {
                metadata,
              }
        ),
      });

    await this
      .support
      .dependencies
      .outbox
      .enqueue({
        transactionId,

        deduplicationKey:
          this
            .support
            .deduplicationKey(
              transactionId,
              eventType,

              after
                ._id
                .toHexString(),
            ),

        eventType,

        aggregateType:
          'LabResult',

        aggregateId:
          after
            ._id
            .toHexString(),

        actorUserId:
          actor.userId,

        facilityId:
          actor.facilityId,

        correlationId:
          actor.correlationId,

        occurredAt,

        payload: {
          ...safeLaboratoryResultEventPayload(
            after,
          ),

          ...(
            metadata ??
            {}
          ),
        },
      });

    await this
      .publishResultRealtime(
        actor,
        after,
      );
  }

  private async publishResultRealtime(
    actor:
      LaboratoryActorContext,

    result:
      LaboratoryResultRecord,
  ): Promise<void> {
    const payload =
      safeLaboratoryResultEventPayload(
        result,
      );

    for (
      const eventType of
      [
        LABORATORY_RESULT_REALTIME_EVENTS
          .RESULT_WORKLIST_CHANGED,

        LABORATORY_RESULT_REALTIME_EVENTS
          .ENCOUNTER_LABORATORY_CHANGED,

        LABORATORY_RESULT_REALTIME_EVENTS
          .PATIENT_LABORATORY_HISTORY_CHANGED,
      ]
    ) {
      await this
        .support
        .dependencies
        .realtime
        .publish({
          eventType,

          facilityId:
            actor.facilityId,

          patientId:
            result
              .patientId
              .toHexString(),

          encounterId:
            result
              .encounterId
              .toHexString(),

          orderId:
            result
              .labOrderId
              .toHexString(),

          resultId:
            result
              ._id
              .toHexString(),

          payload,
        });
    }
  }
}