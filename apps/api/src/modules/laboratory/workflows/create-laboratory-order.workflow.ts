import {
  Types,
} from 'mongoose';

import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  CreateLaboratoryOrderInput,
  LaboratoryActorContext,
} from '../laboratory.types.js';

import type {
  LaboratoryOrderItemRecord,
  LaboratoryOrderRecord,
  LaboratoryTestRecord,
} from '../laboratory.persistence.types.js';

import {
  LABORATORY_NUMBER_SEQUENCE_NAMESPACE,
  LABORATORY_TRANSACTION_TYPES,
} from '../laboratory.constants.js';

import {
  LABORATORY_AUDIT_ACTIONS,
  LABORATORY_OUTBOX_EVENTS,
  LABORATORY_REALTIME_EVENTS,
  LABORATORY_TRANSACTION_STATES,
} from '../laboratory.transaction.constants.js';

import {
  deleteCreatedLaboratoryRecordCompensation,
  deleteCreatedLaboratoryRecordSetCompensation,
} from '../laboratory.mutation-snapshots.js';

import {
  formatLaboratoryNumber,
  laboratoryOrderCreateLockKeys,
  safeLaboratoryOrderAuditSnapshot,
  safeLaboratoryOrderEventPayload,
  safeLaboratoryOrderJournalPayload,
  turnaroundMinutesForPriority,
} from '../laboratory.workflow-helpers.js';

import {
  LaboratoryCommandService,
} from '../services/laboratory-command.service.js';

export interface CreateLaboratoryOrderCommand {
  actor:
    LaboratoryActorContext;

  input:
    CreateLaboratoryOrderInput;

  idempotencyKey:
    string;
}

function resultComponentSnapshots(
  test:
    LaboratoryTestRecord,
): unknown[] {
  return test
    .components
    .map(
      (component) => ({
        componentCode:
          component.componentCode,

        name:
          component.name,

        valueType:
          component.valueType,

        unitCode:
          component.unitCode,

        unitName:
          component.unitName,

        decimalScale:
          component.decimalScale,

        required:
          component.required,

        displayOrder:
          component.displayOrder,

        structuredSchemaKey:
          component.structuredSchemaKey,

        referenceRangesSnapshot:
          component
            .referenceRanges
            .map(
              (range) => ({
                rangeCode:
                  range.rangeCode,

                kind:
                  range.kind,

                sex:
                  range.sex,

                minimumAgeDays:
                  range.minimumAgeDays,

                maximumAgeDays:
                  range.maximumAgeDays,

                lowerBound:
                  range.lowerBound,

                upperBound:
                  range.upperBound,

                criticalLowerBound:
                  range.criticalLowerBound,

                criticalUpperBound:
                  range.criticalUpperBound,

                textualReference:
                  range.textualReference,

                codedValues:
                  range.codedValues,

                notes:
                  range.notes,
              }),
            ),
      }),
    );
}

export class CreateLaboratoryOrderWorkflow {
  public constructor(
    private readonly support:
      LaboratoryCommandService,
  ) {}

  public async execute(
    command:
      CreateLaboratoryOrderCommand,
  ): Promise<{
    order:
      LaboratoryOrderRecord;

    items:
      LaboratoryOrderItemRecord[];
  }> {
    await this
      .support
      .resolveOrderClinicalContext(
        command.actor,
        command.input.encounterId,
      );

    return this
      .support
      .dependencies
      .transactionManager
      .execute({
        transactionType:
          LABORATORY_TRANSACTION_TYPES
            .CREATE_ORDER,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys:
          laboratoryOrderCreateLockKeys(
            command.actor.facilityId,
            command.input.encounterId,
          ),

        idempotencyPayload: {
          facilityId:
            command.actor.facilityId,

          encounterId:
            command.input.encounterId,

          input:
            command.input,
        },

        journalPayload:
          safeLaboratoryOrderJournalPayload(
            'CREATE_ORDER',
            {
              encounterId:
                command.input.encounterId,

              status:
                'ORDERED',

              priority:
                command.input.priority,

              itemCount:
                command.input.testIds.length,
            },
          ),

        execute: async (
          transaction,
        ) => {
          const occurredAt =
            this
              .support
              .dependencies
              .clock
              .now();

          const currentContext =
            await this
              .support
              .resolveOrderClinicalContext(
                command.actor,
                command.input.encounterId,
              );

          await transaction.checkpoint(
            LABORATORY_TRANSACTION_STATES
              .CONTEXT_VALIDATED,
            {
              encounterId:
                currentContext.encounterId,

              departmentId:
                currentContext.departmentId,
            },
          );

          const tests =
            await this
              .support
              .resolveOrderableTests(
                command.actor,
                currentContext,
                command.input.testIds,
                occurredAt,
              );

          await transaction.checkpoint(
            LABORATORY_TRANSACTION_STATES
              .CATALOG_REFERENCES_VALIDATED,
            {
              testCount:
                tests.length,
            },
          );

          const year =
            occurredAt.getUTCFullYear();

          const allocation =
            await this
              .support
              .dependencies
              .sequence
              .next(
                command.actor.facilityId,

                `${
                  LABORATORY_NUMBER_SEQUENCE_NAMESPACE
                    .ORDER
                }:${year}`,
              );

          const orderNumber =
            formatLaboratoryNumber(
              'LAB',
              year,
              allocation.value,
            );

          await transaction.checkpoint(
            LABORATORY_TRANSACTION_STATES
              .NUMBER_ALLOCATED,
            {
              sequenceKey:
                allocation.key,
            },
          );

          const actorId =
            toObjectId(
              command.actor.userId,
              'actorUserId',
            );

          const orderId =
            new Types.ObjectId();

          const orderInput = {
            _id:
              orderId,

            facilityId:
              toObjectId(
                command.actor.facilityId,
                'facilityId',
              ),

            orderNumber,

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
              currentContext.registrationId ===
                null
                ? null
                : toObjectId(
                    currentContext.registrationId,
                    'registrationId',
                  ),

            opdVisitId:
              currentContext.opdVisitId ===
                null
                ? null
                : toObjectId(
                    currentContext.opdVisitId,
                    'opdVisitId',
                  ),

            queueTokenId:
              currentContext.queueTokenId ===
                null
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
              currentContext.clinicId ===
                null
                ? null
                : toObjectId(
                    currentContext.clinicId,
                    'clinicId',
                  ),

            servicePointId:
              currentContext.servicePointId ===
                null
                ? null
                : toObjectId(
                    currentContext.servicePointId,
                    'servicePointId',
                  ),

            orderingProviderId:
              toObjectId(
                currentContext.orderingProviderId,
                'orderingProviderId',
              ),

            priority:
              command.input.priority,

            status:
              'ORDERED',

            clinicalIndication:
              command
                .input
                .clinicalIndication
                .trim(),

            orderingNotes:
              command
                .input
                .orderingNotes
                ?.trim() ??
              null,

            orderedAt:
              occurredAt,

            acceptedAt:
              null,

            acceptedBy:
              null,

            collectionCompletedAt:
              null,

            processingStartedAt:
              null,

            completedAt:
              null,

            verifiedAt:
              null,

            cancelledAt:
              null,

            cancelledBy:
              null,

            cancellationReason:
              null,

            itemCount:
              tests.length,

            activeItemCount:
              tests.length,

            collectedItemCount:
              0,

            completedItemCount:
              0,

            verifiedItemCount:
              0,

            rejectedItemCount:
              0,

            criticalResultCount:
              0,

            lastStatusChangedAt:
              occurredAt,

            lastStatusChangedBy:
              actorId,

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
          } as unknown as Omit<
            LaboratoryOrderRecord,
            | '_id'
            | 'createdAt'
            | 'updatedAt'
          >;

          const itemInputs =
            tests.map(
              (
                test,
                index,
              ) => {
                const turnaroundMinutes =
                  turnaroundMinutesForPriority(
                    test,
                    command.input.priority,
                  );

                return {
                  facilityId:
                    toObjectId(
                      command.actor.facilityId,
                      'facilityId',
                    ),

                  labOrderId:
                    orderId,

                  patientId:
                    toObjectId(
                      currentContext.patientId,
                      'patientId',
                    ),

                  encounterId:
                    toObjectId(
                      currentContext.encounterId,
                      'encounterId',
                    ),

                  sequence:
                    index +
                    1,

                  labTestId:
                    test._id,

                  testCodeSnapshot:
                    test.testCode,

                  testNameSnapshot:
                    test.name,

                  categoryCodeSnapshot:
                    test.categoryCodeSnapshot,

                  categoryNameSnapshot:
                    test.categoryNameSnapshot,

                  methodCodeSnapshot:
                    test.methodCode,

                  methodNameSnapshot:
                    test.methodName,

                  requiresSpecimen:
                    test.requiresSpecimen,

                  specimenRequirementsSnapshot:
                    test.specimenRequirements,

                  resultComponentsSnapshot:
                    resultComponentSnapshots(
                      test,
                    ),

                  testDefinitionHash:
                    this
                      .support
                      .testDefinitionHash(
                        test,
                      ),

                  turnaroundMinutes,

                  dueAt:
                    new Date(
                      occurredAt.getTime() +
                        turnaroundMinutes *
                          60_000,
                    ),

                  status:
                    'ORDERED' as const,

                  activeSpecimenId:
                    null,

                  specimenCount:
                    0,

                  recollectionCount:
                    0,

                  resultId:
                    null,

                  acceptedAt:
                    null,

                  acceptedBy:
                    null,

                  processingStartedAt:
                    null,

                  completedAt:
                    null,

                  verifiedAt:
                    null,

                  rejectedAt:
                    null,

                  rejectedBy:
                    null,

                  rejectionReasonCode:
                    null,

                  rejectionReason:
                    null,

                  cancelledAt:
                    null,

                  cancelledBy:
                    null,

                  cancellationReason:
                    null,

                  chargeCatalogItemId:
                    test.chargeCatalogItemId,

                  accountChargeId:
                    null,

                  billingStatus:
                    test.chargeCatalogItemId ===
                      null
                      ? 'NOT_REQUESTED' as const
                      : 'PENDING' as const,

                  billingFailureCode:
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
                } as unknown as Omit<
                  LaboratoryOrderItemRecord,
                  | '_id'
                  | 'createdAt'
                  | 'updatedAt'
                >;
              },
            );

          const created =
            await this
              .support
              .orders
              .create(
                orderInput,
                itemInputs,
              );

          await transaction.registerCompensation(
            deleteCreatedLaboratoryRecordSetCompensation(
              `delete-order-items:${
                created
                  .order
                  ._id
                  .toHexString()
              }`,
              {
                collection:
                  'labOrderItems',

                entityIds:
                  created
                    .items
                    .map(
                      (item) =>
                        item
                          ._id
                          .toHexString(),
                    ),

                transactionId:
                  transaction.transactionId,
              },
            ),
          );

          await transaction.registerCompensation(
            deleteCreatedLaboratoryRecordCompensation(
              `delete-order:${
                created
                  .order
                  ._id
                  .toHexString()
              }`,
              {
                collection:
                  'labOrders',

                entityId:
                  created
                    .order
                    ._id
                    .toHexString(),

                transactionId:
                  transaction.transactionId,
              },
            ),
          );

          await transaction.checkpoint(
            LABORATORY_TRANSACTION_STATES
              .ITEMS_CREATED,
            {
              orderId:
                created
                  .order
                  ._id
                  .toHexString(),

              itemCount:
                created.items.length,
            },
          );

          const history =
            await this
              .support
              .orders
              .appendHistory({
                facilityId:
                  created.order.facilityId,

                labOrderId:
                  created.order._id,

                patientId:
                  created.order.patientId,

                encounterId:
                  created.order.encounterId,

                sequence:
                  1,

                fromStatus:
                  null,

                toStatus:
                  'ORDERED',

                changeSource:
                  'ORDERING_PROVIDER',

                reasonCode:
                  null,

                reason:
                  null,

                occurredAt,

                changedBy:
                  actorId,

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

          await transaction.registerCompensation(
            deleteCreatedLaboratoryRecordCompensation(
              `delete-order-history:${
                history
                  ._id
                  .toHexString()
              }`,
              {
                collection:
                  'labOrderStatusHistories',

                entityId:
                  history
                    ._id
                    .toHexString(),

                transactionId:
                  transaction.transactionId,
              },
            ),
          );

          await transaction.checkpoint(
            LABORATORY_TRANSACTION_STATES
              .STATUS_HISTORY_APPENDED,
            {
              orderId:
                created
                  .order
                  ._id
                  .toHexString(),

              historySequence:
                history.sequence,
            },
          );

          await this
            .support
            .requestOrderCharges(
              command.actor,
              transaction,
              created.order,

              created.items.map(
                (item) => ({
                  orderItemId:
                    item
                      ._id
                      .toHexString(),

                  chargeCatalogItemId:
                    item
                      .chargeCatalogItemId
                      ?.toHexString() ??
                    null,

                  expectedVersion:
                    item.version,
                }),
              ),

              occurredAt,
            );

          const persistedItems =
            await this
              .support
              .orders
              .listItems(
                command.actor.facilityId,

                created
                  .order
                  ._id
                  .toHexString(),
              );

          const persistedOrderId =
            created
              .order
              ._id
              .toHexString();

          await this
            .support
            .dependencies
            .audit
            .append({
              transactionId:
                transaction.transactionId,

              deduplicationKey:
                this
                  .support
                  .deduplicationKey(
                    transaction.transactionId,

                    LABORATORY_AUDIT_ACTIONS
                      .ORDER_CREATED,

                    persistedOrderId,
                  ),

              action:
                LABORATORY_AUDIT_ACTIONS
                  .ORDER_CREATED,

              entityType:
                'LabOrder',

              entityId:
                persistedOrderId,

              ...this
                .support
                .auditActorFields(
                  command.actor,
                ),

              occurredAt,

              before:
                null,

              after:
                safeLaboratoryOrderAuditSnapshot(
                  created.order,
                ),

              metadata: {
                testIds:
                  tests.map(
                    (test) =>
                      test
                        ._id
                        .toHexString(),
                  ),
              },
            });

          await this
            .support
            .dependencies
            .outbox
            .enqueue({
              transactionId:
                transaction.transactionId,

              deduplicationKey:
                this
                  .support
                  .deduplicationKey(
                    transaction.transactionId,

                    LABORATORY_OUTBOX_EVENTS
                      .ORDER_CREATED,

                    persistedOrderId,
                  ),

              eventType:
                LABORATORY_OUTBOX_EVENTS
                  .ORDER_CREATED,

              aggregateType:
                'LabOrder',

              aggregateId:
                persistedOrderId,

              actorUserId:
                command.actor.userId,

              facilityId:
                command.actor.facilityId,

              correlationId:
                command.actor.correlationId,

              occurredAt,

              payload:
                safeLaboratoryOrderEventPayload(
                  created.order,
                ),
            });

          await this
            .support
            .publishOrderRealtime(
              command.actor,
              created.order,

              LABORATORY_REALTIME_EVENTS
                .ORDER_WORKLIST_CHANGED,
            );

          await this
            .support
            .publishOrderRealtime(
              command.actor,
              created.order,

              LABORATORY_REALTIME_EVENTS
                .ENCOUNTER_LABORATORY_CHANGED,
            );

          await transaction.checkpoint(
            LABORATORY_TRANSACTION_STATES
              .REALTIME_PUBLISHED,
            {
              orderId:
                persistedOrderId,
            },
          );

          return {
            order:
              created.order,

            items:
              persistedItems,
          };
        },
      });
  }
}