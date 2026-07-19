import {
  Types,
} from 'mongoose';

import {
  toObjectId,
} from '@hospital-mis/database';

import {
  LABORATORY_PERMISSION_KEYS,
} from '../laboratory.constants.js';

import {
  LaboratoryClinicalContextMismatchError,
  LaboratoryDuplicateTestSelectionError,
  LaboratoryInactiveCategoryError,
  LaboratoryMinimumNecessaryAccessError,
  LaboratoryOrderConcurrencyError,
  LaboratoryOrderItemConcurrencyError,
  LaboratoryOrderNotFoundError,
  LaboratoryTestCategoryConcurrencyError,
  LaboratoryTestCategoryNotFoundError,
  LaboratoryTestConcurrencyError,
  LaboratoryTestNotFoundError,
  LaboratoryTestNotOrderableError,
} from '../laboratory.errors.js';

import type {
  LaboratoryAccessAction,
  LaboratoryAuditEntry,
  LaboratoryAuditPort,
  LaboratoryCanonicalPatientPort,
  LaboratoryClockPort,
  LaboratoryOutboxPort,
  LaboratoryRealtimePort,
  LaboratorySequencePort,
  LaboratorySnapshotCryptoPort,
  LaboratoryTransactionContext,
  LaboratoryTransactionManagerPort,
} from '../laboratory.ports.js';

import type {
  LaboratoryOrderItemRecord,
  LaboratoryOrderRecord,
  LaboratoryOrderStatusHistoryRecord,
  LaboratoryResultComponentDefinitionRecord,
  LaboratorySpecimenRequirementRecord,
  LaboratoryTestCategoryRecord,
  LaboratoryTestRecord,
} from '../laboratory.persistence.types.js';

import type {
  LaboratoryActorContext,
  LaboratoryCatalogSearchQuery,
  LaboratoryClinicalContext,
  LaboratoryOrderListQuery,
  LaboratoryOrderSummaryView,
  LaboratoryResultComponentDefinitionInput,
  LaboratorySpecimenRequirementInput,
} from '../laboratory.types.js';

import {
  laboratoryContentHash,
  laboratoryDecimal128,
  normalizeLaboratoryCode,
  normalizeLaboratoryText,
  normalizeNullableLaboratoryText,
  nullableLaboratoryDecimal128,
  uniqueLaboratoryObjectIdStrings,
  uniqueLaboratoryStrings,
} from '../laboratory.normalization.js';

import {
  laboratoryDeduplicationKey,
  safeLaboratoryOrderEventPayload,
} from '../laboratory.workflow-helpers.js';

import {
  LABORATORY_AUDIT_ACTIONS,
  LABORATORY_TRANSACTION_STATES,
} from '../laboratory.transaction.constants.js';

import {
  LaboratoryCatalogRepository,
} from '../repositories/laboratory-catalog.repository.js';

import {
  LaboratoryOrderRepository,
} from '../repositories/laboratory-order.repository.js';

import {
  LaboratoryAccessPolicyService,
} from './laboratory-access-policy.service.js';

import {
  LaboratoryContextService,
} from './laboratory-context.service.js';

export interface LaboratoryChargeRequest {
  facilityId:
    string;

  patientId:
    string;

  encounterId:
    string;

  laboratoryOrderId:
    string;

  laboratoryOrderItemId:
    string;

  chargeCatalogItemId:
    string;

  sourceModule:
    'LABORATORY';

  sourceRecordType:
    'LAB_ORDER_ITEM';

  quantity:
    '1';

  requestedBy:
    string;

  requestedAt:
    Date;

  correlationId:
    string;

  transactionId:
    string;
}

export interface LaboratoryChargeRequestResult {
  status:
    | 'PENDING'
    | 'CHARGED';

  accountChargeId:
    string | null;
}

export interface LaboratoryChargeCancellationRequest {
  facilityId:
    string;

  patientId:
    string;

  encounterId:
    string;

  laboratoryOrderId:
    string;

  laboratoryOrderItemId:
    string;

  accountChargeId:
    string | null;

  requestedBy:
    string;

  requestedAt:
    Date;

  reason:
    string;

  correlationId:
    string;

  transactionId:
    string;
}

/**
 * Bridge to the unified billing engine. Laboratory never creates, edits,
 * reverses, or refunds invoice lines directly. Implementations must be
 * idempotent by transaction and source record.
 */
export interface LaboratoryChargeBridgePort {
  requestCharge(
    request:
      LaboratoryChargeRequest,
  ): Promise<
    LaboratoryChargeRequestResult
  >;

  requestCancellation(
    request:
      LaboratoryChargeCancellationRequest,
  ): Promise<void>;
}

export class DeferredLaboratoryChargeBridge
implements LaboratoryChargeBridgePort {
  public async requestCharge():
    Promise<
      LaboratoryChargeRequestResult
    > {
    return {
      status:
        'PENDING',

      accountChargeId:
        null,
    };
  }

  public async requestCancellation():
    Promise<void> {
    return Promise.resolve();
  }
}

export interface LaboratoryMutationDependencies {
  transactionManager:
    LaboratoryTransactionManagerPort;

  audit:
    LaboratoryAuditPort;

  outbox:
    LaboratoryOutboxPort;

  realtime:
    LaboratoryRealtimePort;

  clock:
    LaboratoryClockPort;

  sequence:
    LaboratorySequencePort;

  canonicalPatient:
    LaboratoryCanonicalPatientPort;

  snapshotCrypto:
    LaboratorySnapshotCryptoPort;

  charges:
    LaboratoryChargeBridgePort;
}

export class LaboratoryCommandService {
  public constructor(
    public readonly catalog:
      LaboratoryCatalogRepository,

    public readonly orders:
      LaboratoryOrderRepository,

    public readonly context:
      LaboratoryContextService,

    public readonly accessPolicy:
      LaboratoryAccessPolicyService,

    public readonly dependencies:
      LaboratoryMutationDependencies,
  ) {}

  public newId():
    string {
    return new Types.ObjectId()
      .toHexString();
  }

  public assertExpectedVersion(
    record: {
      version: number;
    },

    expectedVersion:
      number,

    entity:
      | 'CATEGORY'
      | 'TEST'
      | 'ORDER',
  ): void {
    if (
      record.version ===
      expectedVersion
    ) {
      return;
    }

    if (
      entity ===
      'CATEGORY'
    ) {
      throw new LaboratoryTestCategoryConcurrencyError();
    }

    if (
      entity ===
      'TEST'
    ) {
      throw new LaboratoryTestConcurrencyError();
    }

    throw new LaboratoryOrderConcurrencyError();
  }

  public async requireCategory(
    actor:
      LaboratoryActorContext,

    categoryId:
      string,
  ): Promise<
    LaboratoryTestCategoryRecord
  > {
    const category =
      await this
        .catalog
        .findCategoryById(
          actor.facilityId,
          categoryId,
        );

    if (
      category ===
      null
    ) {
      throw new LaboratoryTestCategoryNotFoundError();
    }

    return category;
  }

  public async requireTest(
    actor:
      LaboratoryActorContext,

    testId:
      string,
  ): Promise<
    LaboratoryTestRecord
  > {
    const test =
      await this
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

  public async requireOrder(
    actor:
      LaboratoryActorContext,

    orderId:
      string,
  ): Promise<
    LaboratoryOrderRecord
  > {
    const order =
      await this
        .orders
        .findById(
          actor.facilityId,
          orderId,
        );

    if (
      order ===
      null
    ) {
      throw new LaboratoryOrderNotFoundError();
    }

    return order;
  }

  public async assertAccess(
    actor:
      LaboratoryActorContext,

    action:
      LaboratoryAccessAction,

    options: Readonly<{
      clinicalContext?:
        LaboratoryClinicalContext;

      order?:
        LaboratoryOrderRecord;
    }> = {},
  ): Promise<void> {
    const decision =
      await this
        .accessPolicy
        .authorize({
          actor,

          action,

          ...(
            options.clinicalContext ===
              undefined
              ? {}
              : {
                  clinicalContext:
                    options.clinicalContext,
                }
          ),

          ...(
            options.order ===
              undefined
              ? {}
              : {
                  order:
                    options.order,
                }
          ),
        });

    if (
      !decision.allowed
    ) {
      throw new LaboratoryMinimumNecessaryAccessError();
    }
  }

  public async resolveOrderClinicalContext(
    actor:
      LaboratoryActorContext,

    encounterId:
      string,
  ): Promise<
    LaboratoryClinicalContext
  > {
    const context =
      await this
        .context
        .resolveActiveEncounter(
          actor.facilityId,
          encounterId,
        );

    const canonical =
      await this
        .dependencies
        .canonicalPatient
        .resolve(
          actor.facilityId,
          context.requestedPatientId,
        );

    if (
      canonical.canonicalPatientId !==
        context.patientId ||
      canonical.requestedPatientId !==
        context.requestedPatientId ||
      canonical.redirected !==
        context.canonicalRedirected
    ) {
      throw new LaboratoryClinicalContextMismatchError(
        'The encounter patient does not match the current canonical patient resolution',
      );
    }

    const orderingProviderId =
      await this
        .accessPolicy
        .requireActiveActorStaffId(
          actor,
        );

    this.context
      .assertOrderingProviderAssigned(
        context,
        orderingProviderId,
      );

    const orderingContext:
      LaboratoryClinicalContext = {
      ...context,

      orderingProviderId,
    };

    await this.assertAccess(
      actor,
      'ORDER_CREATE',
      {
        clinicalContext:
          orderingContext,
      },
    );

    return orderingContext;
  }

  public async resolveOrderableTests(
    actor:
      LaboratoryActorContext,

    context:
      LaboratoryClinicalContext,

    testIds:
      readonly string[],

    occurredAt:
      Date,
  ): Promise<
    LaboratoryTestRecord[]
  > {
    const uniqueIds =
      uniqueLaboratoryObjectIdStrings(
        testIds,
      );

    if (
      uniqueIds.length !==
      testIds.length
    ) {
      throw new LaboratoryDuplicateTestSelectionError();
    }

    const records =
      await this
        .catalog
        .findTestsByIds(
          actor.facilityId,
          uniqueIds,
        );

    const byId =
      new Map(
        records.map(
          (test) => [
            test._id.toHexString(),
            test,
          ],
        ),
      );

    const ordered:
      LaboratoryTestRecord[] =
        [];

    for (
      const testId of
      uniqueIds
    ) {
      const test =
        byId.get(
          testId,
        );

      if (
        test ===
        undefined
      ) {
        throw new LaboratoryTestNotFoundError();
      }

      const category =
        await this
          .requireCategory(
            actor,
            test
              .categoryId
              .toHexString(),
          );

      if (
        category.status !==
        'ACTIVE'
      ) {
        throw new LaboratoryInactiveCategoryError();
      }

      const departmentAvailable =
        test
          .availableDepartmentIds
          .length ===
          0 ||
        test
          .availableDepartmentIds
          .some(
            (departmentId) =>
              departmentId
                .toHexString() ===
              context.departmentId,
          );

      const effective =
        test.effectiveFrom <=
          occurredAt &&
        (
          test.effectiveThrough ===
            null ||
          test.effectiveThrough >=
            occurredAt
        );

      if (
        test.status !==
          'ACTIVE' ||
        !test.orderable ||
        !departmentAvailable ||
        !effective
      ) {
        throw new LaboratoryTestNotOrderableError();
      }

      ordered.push(
        test,
      );
    }

    return ordered;
  }

  public specimenRequirementRecords(
    inputs:
      readonly LaboratorySpecimenRequirementInput[],
  ): LaboratorySpecimenRequirementRecord[] {
    return inputs.map(
      (input) => ({
        requirementCode:
          normalizeLaboratoryCode(
            input.requirementCode,
          ),

        specimenTypeCode:
          normalizeLaboratoryCode(
            input.specimenTypeCode,
          ),

        specimenTypeName:
          input
            .specimenTypeName
            .normalize('NFKC')
            .trim(),

        containerCode:
          input.containerCode ==
            null
            ? null
            : normalizeLaboratoryCode(
                input.containerCode,
              ),

        containerName:
          normalizeNullableLaboratoryText(
            input.containerName,
          ),

        minimumVolume:
          nullableLaboratoryDecimal128(
            input.minimumVolume,
          ),

        volumeUnitCode:
          input.volumeUnitCode ==
            null
            ? null
            : normalizeLaboratoryCode(
                input.volumeUnitCode,
              ),

        fastingRequired:
          input.fastingRequired ??
          false,

        collectionInstructions:
          normalizeNullableLaboratoryText(
            input.collectionInstructions,
          ),

        handlingInstructions:
          normalizeNullableLaboratoryText(
            input.handlingInstructions,
          ),

        maximumTransportMinutes:
          input.maximumTransportMinutes ??
          null,

        preferred:
          input.preferred ??
          false,
      }),
    );
  }

  public resultComponentDefinitionRecords(
    inputs:
      readonly LaboratoryResultComponentDefinitionInput[],
  ): LaboratoryResultComponentDefinitionRecord[] {
    return inputs.map(
      (input) => ({
        componentCode:
          normalizeLaboratoryCode(
            input.componentCode,
          ),

        name:
          input.name
            .normalize('NFKC')
            .trim(),

        normalizedName:
          normalizeLaboratoryText(
            input.name,
          ),

        valueType:
          input.valueType,

        unitCode:
          input.unitCode ==
            null
            ? null
            : normalizeLaboratoryCode(
                input.unitCode,
              ),

        unitName:
          normalizeNullableLaboratoryText(
            input.unitName,
          ),

        decimalScale:
          input.decimalScale ??
          2,

        referenceRanges:
          (
            input.referenceRanges ??
            []
          ).map(
            (range) => ({
              rangeCode:
                normalizeLaboratoryCode(
                  range.rangeCode,
                ),

              kind:
                range.kind,

              sex:
                range.sex ??
                'ANY',

              minimumAgeDays:
                range.minimumAgeDays ??
                null,

              maximumAgeDays:
                range.maximumAgeDays ??
                null,

              lowerBound:
                nullableLaboratoryDecimal128(
                  range.lowerBound,
                ),

              upperBound:
                nullableLaboratoryDecimal128(
                  range.upperBound,
                ),

              criticalLowerBound:
                nullableLaboratoryDecimal128(
                  range.criticalLowerBound,
                ),

              criticalUpperBound:
                nullableLaboratoryDecimal128(
                  range.criticalUpperBound,
                ),

              textualReference:
                normalizeNullableLaboratoryText(
                  range.textualReference,
                ),

              codedValues:
                (
                  range.codedValues ??
                  []
                ).map(
                  (
                    codedValue,
                  ) => ({
                    code:
                      codedValue
                        .code
                        .normalize(
                          'NFKC',
                        )
                        .trim(),

                    display:
                      codedValue
                        .display
                        .normalize(
                          'NFKC',
                        )
                        .trim(),

                    codingSystem:
                      normalizeNullableLaboratoryText(
                        codedValue
                          .codingSystem,
                      ),

                    normal:
                      codedValue
                        .normal ??
                      true,
                  }),
                ),

              notes:
                normalizeNullableLaboratoryText(
                  range.notes,
                ),
            }),
          ),

        required:
          input.required ??
          true,

        displayOrder:
          input.displayOrder ??
          0,

        structuredSchemaKey:
          normalizeNullableLaboratoryText(
            input.structuredSchemaKey,
          ),
      }),
    );
  }

  public testDefinitionHash(
    test:
      LaboratoryTestRecord,
  ): string {
    return laboratoryContentHash({
      testId:
        test._id.toHexString(),

      testCode:
        test.testCode,

      name:
        test.name,

      categoryId:
        test.categoryId.toHexString(),

      methodCode:
        test.methodCode,

      methodName:
        test.methodName,

      requiresSpecimen:
        test.requiresSpecimen,

      specimenRequirements:
        test.specimenRequirements,

      components:
        test.components,

      routineTurnaroundMinutes:
        test.routineTurnaroundMinutes,

      urgentTurnaroundMinutes:
        test.urgentTurnaroundMinutes,

      statTurnaroundMinutes:
        test.statTurnaroundMinutes,

      version:
        test.version,
    });
  }

  public normalizedAliases(
    aliases:
      readonly string[],
  ): {
    aliases: string[];
    normalizedAliases: string[];
  } {
    const unique =
      uniqueLaboratoryStrings(
        aliases,
      );

    return {
      aliases:
        unique,

      normalizedAliases:
        unique.map(
          normalizeLaboratoryText,
        ),
    };
  }

  public objectIds(
    values:
      readonly string[],

    fieldName:
      string,
  ): Types.ObjectId[] {
    return uniqueLaboratoryObjectIdStrings(
      values,
    ).map(
      (value) =>
        toObjectId(
          value,
          fieldName,
        ),
    );
  }

  public decimal128(
    value:
      string,
  ): Types.Decimal128 {
    return laboratoryDecimal128(
      value,
    );
  }

  public async requestOrderCharges(
    actor:
      LaboratoryActorContext,

    transaction:
      LaboratoryTransactionContext,

    order:
      LaboratoryOrderRecord,

    itemInputs:
      ReadonlyArray<{
        orderItemId: string;

        chargeCatalogItemId:
          string | null;

        expectedVersion:
          number;
      }>,

    occurredAt:
      Date,
  ): Promise<void> {
    for (
      const item of
      itemInputs
    ) {
      if (
        item.chargeCatalogItemId ===
        null
      ) {
        continue;
      }

      const charge =
        await this
          .dependencies
          .charges
          .requestCharge({
            facilityId:
              actor.facilityId,

            patientId:
              order
                .patientId
                .toHexString(),

            encounterId:
              order
                .encounterId
                .toHexString(),

            laboratoryOrderId:
              order
                ._id
                .toHexString(),

            laboratoryOrderItemId:
              item.orderItemId,

            chargeCatalogItemId:
              item.chargeCatalogItemId,

            sourceModule:
              'LABORATORY',

            sourceRecordType:
              'LAB_ORDER_ITEM',

            quantity:
              '1',

            requestedBy:
              actor.userId,

            requestedAt:
              occurredAt,

            correlationId:
              actor.correlationId,

            transactionId:
              transaction.transactionId,
          });

      if (
        charge.status ===
        'CHARGED'
      ) {
        if (
          charge.accountChargeId ===
          null
        ) {
          throw new Error(
            'The billing bridge returned CHARGED without an account charge identifier',
          );
        }

        const updated =
          await this
            .orders
            .updateItemBilling(
              actor.facilityId,
              item.orderItemId,
              item.expectedVersion,
              'CHARGED',
              charge.accountChargeId,
              actor.userId,
            );

        if (
          updated ===
          null
        ) {
          throw new LaboratoryOrderItemConcurrencyError();
        }
      }
    }

    await transaction.checkpoint(
      LABORATORY_TRANSACTION_STATES
        .BILLING_REQUESTED,
      {
        orderId:
          order._id.toHexString(),

        requestedChargeCount:
          itemInputs.filter(
            (item) =>
              item.chargeCatalogItemId !==
              null,
          ).length,
      },
    );
  }

  public async requestOrderChargeCancellations(
    actor:
      LaboratoryActorContext,

    transaction:
      LaboratoryTransactionContext,

    order:
      LaboratoryOrderRecord,

    reason:
      string,

    occurredAt:
      Date,
  ): Promise<void> {
    const items =
      await this
        .orders
        .listItems(
          actor.facilityId,
          order._id.toHexString(),
        );

    for (
      const item of
      items
    ) {
      if (
        item.billingStatus ===
          'NOT_REQUESTED' ||
        item.billingStatus ===
          'CANCELLED' ||
        item.billingStatus ===
          'REFUNDED'
      ) {
        continue;
      }

      await this
        .dependencies
        .charges
        .requestCancellation({
          facilityId:
            actor.facilityId,

          patientId:
            order
              .patientId
              .toHexString(),

          encounterId:
            order
              .encounterId
              .toHexString(),

          laboratoryOrderId:
            order
              ._id
              .toHexString(),

          laboratoryOrderItemId:
            item
              ._id
              .toHexString(),

          accountChargeId:
            item
              .accountChargeId
              ?.toHexString() ??
            null,

          requestedBy:
            actor.userId,

          requestedAt:
            occurredAt,

          reason,

          correlationId:
            actor.correlationId,

          transactionId:
            transaction.transactionId,
        });
    }
  }

  public auditActorFields(
    actor:
      LaboratoryActorContext,
  ): Pick<
    LaboratoryAuditEntry,
    | 'actorUserId'
    | 'facilityId'
    | 'correlationId'
    | 'ipAddress'
    | 'userAgent'
  > {
    return {
      actorUserId:
        actor.userId,

      facilityId:
        actor.facilityId,

      correlationId:
        actor.correlationId,

      ...(
        actor.ipAddress ===
          undefined
          ? {}
          : {
              ipAddress:
                actor.ipAddress,
            }
      ),

      ...(
        actor.userAgent ===
          undefined
          ? {}
          : {
              userAgent:
                actor.userAgent,
            }
      ),
    };
  }

  public async publishOrderRealtime(
    actor:
      LaboratoryActorContext,

    order:
      LaboratoryOrderRecord,

    eventType:
      string,
  ): Promise<void> {
    await this
      .dependencies
      .realtime
      .publish({
        eventType,

        facilityId:
          actor.facilityId,

        encounterId:
          order
            .encounterId
            .toHexString(),

        orderId:
          order
            ._id
            .toHexString(),

        payload:
          safeLaboratoryOrderEventPayload(
            order,
          ),
      });
  }

  public deduplicationKey(
    transactionId:
      string,

    action:
      string,

    entityId:
      string,
  ): string {
    return laboratoryDeduplicationKey(
      transactionId,
      action,
      entityId,
    );
  }

  public catalogManagePermission():
    string {
    return LABORATORY_PERMISSION_KEYS
      .CATALOG_MANAGE;
  }
}

export class LaboratoryQueryService {
  public constructor(
    private readonly catalog:
      LaboratoryCatalogRepository,

    private readonly orders:
      LaboratoryOrderRepository,

    private readonly accessPolicy:
      LaboratoryAccessPolicyService,

    private readonly audit:
      LaboratoryAuditPort,

    private readonly clock:
      LaboratoryClockPort,
  ) {}

  public async searchCatalog(
    actor:
      LaboratoryActorContext,

    query:
      LaboratoryCatalogSearchQuery,
  ): Promise<{
    items:
      LaboratoryTestRecord[];

    total:
      number;
  }> {
    const decision =
      await this
        .accessPolicy
        .authorize({
          actor,

          action:
            'CATALOG_READ',
        });

    if (
      !decision.allowed
    ) {
      throw new LaboratoryMinimumNecessaryAccessError();
    }

    return this
      .catalog
      .searchTests(
        actor.facilityId,
        query,
      );
  }

  public async getTest(
    actor:
      LaboratoryActorContext,

    testId:
      string,
  ): Promise<
    LaboratoryTestRecord
  > {
    const decision =
      await this
        .accessPolicy
        .authorize({
          actor,

          action:
            'CATALOG_READ',
        });

    if (
      !decision.allowed
    ) {
      throw new LaboratoryMinimumNecessaryAccessError();
    }

    const test =
      await this
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

  public async listOperationalOrders(
    actor:
      LaboratoryActorContext,

    query:
      LaboratoryOrderListQuery,
  ): Promise<{
    items:
      LaboratoryOrderSummaryView[];

    total:
      number;
  }> {
    const decision =
      await this
        .accessPolicy
        .authorize({
          actor,

          action:
            'ORDER_READ',
        });

    if (
      !decision.allowed
    ) {
      throw new LaboratoryMinimumNecessaryAccessError();
    }

    const result =
      await this
        .orders
        .list(
          actor.facilityId,
          query,
        );

    return {
      items:
        result.items.map(
          (order) => ({
            id:
              order
                ._id
                .toHexString(),

            orderNumber:
              order.orderNumber,

            patientId:
              order
                .patientId
                .toHexString(),

            encounterId:
              order
                .encounterId
                .toHexString(),

            orderingProviderId:
              order
                .orderingProviderId
                .toHexString(),

            departmentId:
              order
                .departmentId
                .toHexString(),

            priority:
              order.priority,

            status:
              order.status,

            itemCount:
              order.itemCount,

            orderedAt:
              order
                .orderedAt
                .toISOString(),

            version:
              order.version,
          }),
        ),

      total:
        result.total,
    };
  }

  public async getOperationalOrder(
    actor:
      LaboratoryActorContext,

    orderId:
      string,
  ): Promise<{
    order:
      LaboratoryOrderRecord;

    items:
      LaboratoryOrderItemRecord[];

    history:
      LaboratoryOrderStatusHistoryRecord[];
  }> {
    const order =
      await this
        .orders
        .findById(
          actor.facilityId,
          orderId,
        );

    if (
      order ===
      null
    ) {
      throw new LaboratoryOrderNotFoundError();
    }

    const decision =
      await this
        .accessPolicy
        .authorize({
          actor,

          action:
            'ORDER_READ',

          order,
        });

    if (
      !decision.allowed
    ) {
      throw new LaboratoryMinimumNecessaryAccessError();
    }

    const [
      items,
      history,
    ] =
      await Promise.all([
        this
          .orders
          .listItems(
            actor.facilityId,
            orderId,
          ),

        this
          .orders
          .listHistory(
            actor.facilityId,
            orderId,
          ),
      ]);

    if (
      decision.auditSensitiveRead
    ) {
      const occurredAt =
        this.clock.now();

      const transactionId =
        actor.correlationId;

      await this
        .audit
        .append({
          transactionId,

          deduplicationKey:
            laboratoryDeduplicationKey(
              transactionId,
              LABORATORY_AUDIT_ACTIONS
                .ORDER_SENSITIVE_READ,
              orderId,
            ),

          action:
            LABORATORY_AUDIT_ACTIONS
              .ORDER_SENSITIVE_READ,

          entityType:
            'LabOrder',

          entityId:
            orderId,

          actorUserId:
            actor.userId,

          facilityId:
            actor.facilityId,

          correlationId:
            actor.correlationId,

          ...(
            actor.ipAddress ===
              undefined
              ? {}
              : {
                  ipAddress:
                    actor.ipAddress,
                }
          ),

          ...(
            actor.userAgent ===
              undefined
              ? {}
              : {
                  userAgent:
                    actor.userAgent,
                }
          ),

          occurredAt,

          metadata: {
            accessMode:
              decision.accessMode,

            encounterId:
              order
                .encounterId
                .toHexString(),

            patientId:
              order
                .patientId
                .toHexString(),
          },
        });
    }

    return {
      order,
      items,
      history,
    };
  }
}