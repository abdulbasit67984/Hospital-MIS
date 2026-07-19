import {
  Types,
} from 'mongoose';

import {
  toObjectId,
} from '@hospital-mis/database';

import {
  RADIOLOGY_PERMISSION_KEYS,
} from '../radiology.constants.js';

import {
  RadiologyClinicalContextMismatchError,
  RadiologyDuplicateProcedureSelectionError,
  RadiologyInactiveModalityError,
  RadiologyMinimumNecessaryAccessError,
  RadiologyModalityConcurrencyError,
  RadiologyModalityNotFoundError,
  RadiologyOrderConcurrencyError,
  RadiologyOrderItemConcurrencyError,
  RadiologyOrderItemNotFoundError,
  RadiologyOrderNotFoundError,
  RadiologyProcedureConcurrencyError,
  RadiologyProcedureNotFoundError,
  RadiologyProcedureRequestConflictError,
} from '../radiology.errors.js';

import type {
  RadiologyAccessAction,
  RadiologyAccessPolicyPort,
  RadiologyAuditEntry,
  RadiologyAuditPort,
  RadiologyCanonicalPatientPort,
  RadiologyCatalogRepositoryPort,
  RadiologyClockPort,
  RadiologyClinicalContextPort,
  RadiologyOrderRepositoryPort,
  RadiologyOutboxPort,
  RadiologyRealtimePort,
  RadiologySequencePort,
  RadiologySnapshotCryptoPort,
  RadiologyTransactionContext,
  RadiologyTransactionManagerPort,
} from '../radiology.ports.js';

import type {
  RadiologyModalityRecord,
  RadiologyOrderItemRecord,
  RadiologyOrderRecord,
  RadiologyProcedureDefinitionSnapshotRecord,
  RadiologyProcedureRecord,
} from '../radiology.persistence.types.js';

import type {
  CreateRadiologyOrderItemInput,
  RadiologyActorContext,
  RadiologyClinicalContext,
} from '../radiology.types.js';

import {
  assertRadiologyProcedureOrderable,
  assertRadiologyProcedureRequest,
} from '../radiology.lifecycle.js';

import {
  normalizeNullableRadiologyText,
  normalizeRadiologyCode,
  normalizeRadiologyText,
  radiologyContentHash,
  radiologyProcedureSelectionKey,
  uniqueRadiologyObjectIdStrings,
  uniqueRadiologyStrings,
} from '../radiology.normalization.js';

import {
  radiologyDeduplicationKey,
  safeRadiologyOrderEventPayload,
} from '../radiology.workflow-helpers.js';

import {
  RADIOLOGY_TRANSACTION_STATES,
} from '../radiology.transaction.constants.js';

export interface RadiologyChargeRequest {
  facilityId: string;
  patientId: string;
  encounterId: string;
  radiologyOrderId: string;
  radiologyOrderItemId: string;
  chargeCatalogItemId: string;
  sourceModule: 'RADIOLOGY';
  sourceRecordType: 'RADIOLOGY_ORDER_ITEM';
  quantity: '1';
  requestedBy: string;
  requestedAt: Date;
  correlationId: string;
  transactionId: string;
}

export interface RadiologyChargeRequestResult {
  status: 'PENDING' | 'CHARGED';
  accountChargeId: string | null;
}

export interface RadiologyChargeCancellationRequest {
  facilityId: string;
  patientId: string;
  encounterId: string;
  radiologyOrderId: string;
  radiologyOrderItemId: string;
  accountChargeId: string | null;
  requestedBy: string;
  requestedAt: Date;
  reason: string;
  correlationId: string;
  transactionId: string;
}

/**
 * Unified billing boundary. Radiology never creates, edits, reverses, or
 * refunds invoice lines directly. Implementations must be idempotent by
 * transaction and Radiology order-item source identifier.
 */
export interface RadiologyChargeBridgePort {
  requestCharge(
    request: RadiologyChargeRequest,
  ): Promise<RadiologyChargeRequestResult>;

  requestCancellation(
    request: RadiologyChargeCancellationRequest,
  ): Promise<void>;
}

export class DeferredRadiologyChargeBridge
implements RadiologyChargeBridgePort {
  public async requestCharge(): Promise<RadiologyChargeRequestResult> {
    return {
      status: 'PENDING',
      accountChargeId: null,
    };
  }

  public async requestCancellation(): Promise<void> {
    return Promise.resolve();
  }
}

export interface RadiologyMutationDependencies {
  transactionManager: RadiologyTransactionManagerPort;
  audit: RadiologyAuditPort;
  outbox: RadiologyOutboxPort;
  realtime: RadiologyRealtimePort;
  clock: RadiologyClockPort;
  sequence: RadiologySequencePort;
  canonicalPatient: RadiologyCanonicalPatientPort;
  snapshotCrypto: RadiologySnapshotCryptoPort;
  charges: RadiologyChargeBridgePort;
}

export interface RadiologyResolvedProcedureSelection {
  input: CreateRadiologyOrderItemInput;
  procedure: RadiologyProcedureRecord;
  modality: RadiologyModalityRecord;
}

export class RadiologyCommandService {
  public constructor(
    public readonly catalog: RadiologyCatalogRepositoryPort,
    public readonly orders: RadiologyOrderRepositoryPort,
    public readonly context: RadiologyClinicalContextPort,
    public readonly accessPolicy: RadiologyAccessPolicyPort,
    public readonly dependencies: RadiologyMutationDependencies,
  ) {}

  public newId(): string {
    return new Types.ObjectId().toHexString();
  }

  public assertExpectedVersion(
    record: { version: number },
    expectedVersion: number,
    entity: 'MODALITY' | 'PROCEDURE' | 'ORDER' | 'ORDER_ITEM',
  ): void {
    if (record.version === expectedVersion) {
      return;
    }

    switch (entity) {
      case 'MODALITY':
        throw new RadiologyModalityConcurrencyError();

      case 'PROCEDURE':
        throw new RadiologyProcedureConcurrencyError();

      case 'ORDER_ITEM':
        throw new RadiologyOrderItemConcurrencyError();

      case 'ORDER':
        throw new RadiologyOrderConcurrencyError();
    }
  }

  public async requireModality(
    actor: RadiologyActorContext,
    modalityId: string,
  ): Promise<RadiologyModalityRecord> {
    const modality = await this.catalog.findModalityById(
      actor.facilityId,
      modalityId,
    );

    if (modality === null) {
      throw new RadiologyModalityNotFoundError();
    }

    return modality;
  }

  public async requireProcedure(
    actor: RadiologyActorContext,
    procedureId: string,
  ): Promise<RadiologyProcedureRecord> {
    const procedure = await this.catalog.findProcedureById(
      actor.facilityId,
      procedureId,
    );

    if (procedure === null) {
      throw new RadiologyProcedureNotFoundError();
    }

    return procedure;
  }

  public async requireOrder(
    actor: RadiologyActorContext,
    orderId: string,
  ): Promise<RadiologyOrderRecord> {
    const order = await this.orders.findById(actor.facilityId, orderId);

    if (order === null) {
      throw new RadiologyOrderNotFoundError();
    }

    return order;
  }

  public async requireOrderItem(
    actor: RadiologyActorContext,
    orderItemId: string,
  ): Promise<RadiologyOrderItemRecord> {
    const item = await this.orders.findItemById(
      actor.facilityId,
      orderItemId,
    );

    if (item === null) {
      throw new RadiologyOrderItemNotFoundError();
    }

    return item;
  }

  public async assertAccess(
    actor: RadiologyActorContext,
    action: RadiologyAccessAction,
    options: Readonly<{
      clinicalContext?: RadiologyClinicalContext;
      order?: RadiologyOrderRecord;
      orderItem?: RadiologyOrderItemRecord;
    }> = {},
  ): Promise<void> {
    const decision = await this.accessPolicy.authorize({
      actor,
      action,
      ...(options.clinicalContext === undefined
        ? {}
        : { clinicalContext: options.clinicalContext }),
      ...(options.order === undefined ? {} : { order: options.order }),
      ...(options.orderItem === undefined
        ? {}
        : { orderItem: options.orderItem }),
    });

    if (!decision.allowed) {
      throw new RadiologyMinimumNecessaryAccessError();
    }
  }

  public async resolveOrderClinicalContext(
    actor: RadiologyActorContext,
    encounterId: string,
  ): Promise<RadiologyClinicalContext> {
    const context = await this.context.resolveActiveEncounter(
      actor.facilityId,
      encounterId,
    );

    const canonical = await this.dependencies.canonicalPatient.resolve(
      actor.facilityId,
      context.requestedPatientId,
    );

    if (
      canonical.canonicalPatientId !== context.patientId ||
      canonical.requestedPatientId !== context.requestedPatientId ||
      canonical.redirected !== context.canonicalRedirected
    ) {
      throw new RadiologyClinicalContextMismatchError(
        'The encounter patient does not match the current canonical patient resolution',
      );
    }

    const orderingProviderId =
      await this.accessPolicy.requireActiveActorStaffId(actor);

    if (!context.assignedProviderIds.includes(orderingProviderId)) {
      throw new RadiologyClinicalContextMismatchError(
        'The authenticated ordering provider is not assigned to the active encounter',
      );
    }

    const orderingContext: RadiologyClinicalContext = {
      ...context,
      orderingProviderId,
    };

    await this.assertAccess(actor, 'ORDER_CREATE', {
      clinicalContext: orderingContext,
    });

    return orderingContext;
  }

  public async resolveOrderableSelections(
    actor: RadiologyActorContext,
    context: RadiologyClinicalContext,
    items: readonly CreateRadiologyOrderItemInput[],
    occurredAt: Date,
  ): Promise<RadiologyResolvedProcedureSelection[]> {
    const selectionKeys = items.map(radiologyProcedureSelectionKey);

    if (new Set(selectionKeys).size !== selectionKeys.length) {
      throw new RadiologyDuplicateProcedureSelectionError();
    }

    const uniqueProcedureIds = uniqueRadiologyObjectIdStrings(
      items.map((item) => item.procedureId),
    );
    const procedures = await this.catalog.findProceduresByIds(
      actor.facilityId,
      uniqueProcedureIds,
    );
    const proceduresById = new Map(
      procedures.map((procedure) => [procedure._id.toHexString(), procedure]),
    );
    const modalities = new Map<string, RadiologyModalityRecord>();
    const selections: RadiologyResolvedProcedureSelection[] = [];

    for (const item of items) {
      const procedure = proceduresById.get(item.procedureId);

      if (procedure === undefined) {
        throw new RadiologyProcedureNotFoundError();
      }

      assertRadiologyProcedureOrderable(
        procedure,
        context.departmentId,
        occurredAt,
      );
      assertRadiologyProcedureRequest(procedure, item);

      const modalityId = procedure.modalityId.toHexString();
      let modality = modalities.get(modalityId);

      if (modality === undefined) {
        modality = await this.requireModality(actor, modalityId);
        modalities.set(modalityId, modality);
      }

      const modalityDepartmentAvailable =
        modality.availableDepartmentIds.some(
          (departmentId) =>
            departmentId.toHexString() === context.departmentId,
        );
      const modalityEffective =
        modality.effectiveFrom <= occurredAt &&
        (modality.effectiveThrough === null ||
          modality.effectiveThrough >= occurredAt);

      if (
        modality.status !== 'ACTIVE' ||
        !modality.orderable ||
        !modalityDepartmentAvailable ||
        !modalityEffective
      ) {
        throw new RadiologyInactiveModalityError();
      }

      if (item.contrastRequested && !modality.supportsContrast) {
        throw new RadiologyProcedureRequestConflictError(
          'The selected Radiology modality does not support contrast',
        );
      }

      selections.push({
        input: item,
        procedure,
        modality,
      });
    }

    return selections;
  }

  public procedureDefinitionSnapshot(
    selection: RadiologyResolvedProcedureSelection,
    capturedAt: Date,
  ): RadiologyProcedureDefinitionSnapshotRecord {
    const procedure = selection.procedure;

    return {
      procedureId: procedure._id,
      procedureVersion: procedure.version,
      procedureCode: procedure.procedureCode,
      procedureName: procedure.name,
      description: procedure.description,
      modalityId: procedure.modalityId,
      modalityCode: procedure.modalityCodeSnapshot,
      modalityName: procedure.modalityNameSnapshot,
      modalityType: procedure.modalityTypeSnapshot,
      dicomModalityCode: procedure.dicomModalityCodeSnapshot,
      bodyRegions: procedure.bodyRegions.map((region) => ({ ...region })),
      lateralityRequirement: procedure.lateralityRequirement,
      permittedLateralities: [...procedure.permittedLateralities],
      contrastRequirement: procedure.contrastRequirement,
      permittedContrastRoutes: [...procedure.permittedContrastRoutes],
      preparationInstructions: [...procedure.preparationInstructions],
      contraindications: [...procedure.contraindications],
      safetyScreeningRequirements: [
        ...procedure.safetyScreeningRequirements,
      ],
      expectedDurationMinutes: procedure.expectedDurationMinutes,
      routineTurnaroundMinutes: procedure.routineTurnaroundMinutes,
      urgentTurnaroundMinutes: procedure.urgentTurnaroundMinutes,
      statTurnaroundMinutes: procedure.statTurnaroundMinutes,
      availableDepartmentIds: [...procedure.availableDepartmentIds],
      schedulingRequired: procedure.schedulingRequired,
      requiresTechnician: procedure.requiresTechnician,
      requiresRadiologist: procedure.requiresRadiologist,
      chargeCatalogItemId: procedure.chargeCatalogItemId,
      effectiveFrom: procedure.effectiveFrom,
      effectiveThrough: procedure.effectiveThrough,
      capturedAt,
    };
  }

  public procedureDefinitionHash(
    snapshot: RadiologyProcedureDefinitionSnapshotRecord,
  ): string {
    return radiologyContentHash(snapshot);
  }

  public normalizedAliases(
    aliases: readonly string[],
  ): {
    aliases: string[];
    normalizedAliases: string[];
  } {
    const unique = uniqueRadiologyStrings(aliases);

    return {
      aliases: unique,
      normalizedAliases: unique.map(normalizeRadiologyText),
    };
  }

  public bodyRegions(
    regions: readonly { code: string; name: string }[],
  ): Array<{ code: string; name: string }> {
    return regions.map((region) => ({
      code: normalizeRadiologyCode(region.code),
      name: region.name.normalize('NFKC').trim(),
    }));
  }

  public objectIds(
    values: readonly string[],
    fieldName: string,
  ): Types.ObjectId[] {
    return uniqueRadiologyObjectIdStrings(values).map((value) =>
      toObjectId(value, fieldName),
    );
  }

  public nullableObjectId(
    value: string | null | undefined,
    fieldName: string,
  ): Types.ObjectId | null {
    return value == null ? null : toObjectId(value, fieldName);
  }

  public displayText(value: string): string {
    return value.normalize('NFKC').trim();
  }

  public nullableText(value: string | null | undefined): string | null {
    return normalizeNullableRadiologyText(value);
  }

  public normalizedText(value: string): string {
    return normalizeRadiologyText(value);
  }

  public normalizedCode(value: string): string {
    return normalizeRadiologyCode(value);
  }

  public async requestOrderCharges(
    actor: RadiologyActorContext,
    transaction: RadiologyTransactionContext,
    order: RadiologyOrderRecord,
    itemInputs: ReadonlyArray<{
      orderItemId: string;
      chargeCatalogItemId: string | null;
      expectedVersion: number;
    }>,
    occurredAt: Date,
  ): Promise<void> {
    let requestedChargeCount = 0;

    for (const item of itemInputs) {
      if (item.chargeCatalogItemId === null) {
        continue;
      }

      requestedChargeCount += 1;
      const charge = await this.dependencies.charges.requestCharge({
        facilityId: actor.facilityId,
        patientId: order.patientId.toHexString(),
        encounterId: order.encounterId.toHexString(),
        radiologyOrderId: order._id.toHexString(),
        radiologyOrderItemId: item.orderItemId,
        chargeCatalogItemId: item.chargeCatalogItemId,
        sourceModule: 'RADIOLOGY',
        sourceRecordType: 'RADIOLOGY_ORDER_ITEM',
        quantity: '1',
        requestedBy: actor.userId,
        requestedAt: occurredAt,
        correlationId: actor.correlationId,
        transactionId: transaction.transactionId,
      });

      if (charge.status === 'CHARGED') {
        if (charge.accountChargeId === null) {
          throw new Error(
            'The billing bridge returned CHARGED without an account charge identifier',
          );
        }

        const updated = await this.orders.updateItemBilling(
          actor.facilityId,
          item.orderItemId,
          item.expectedVersion,
          'CHARGED',
          charge.accountChargeId,
          null,
          actor.userId,
        );

        if (updated === null) {
          throw new RadiologyOrderItemConcurrencyError();
        }
      }
    }

    await transaction.checkpoint(
      RADIOLOGY_TRANSACTION_STATES.BILLING_REQUESTED,
      {
        orderId: order._id.toHexString(),
        requestedChargeCount,
      },
    );
  }

  public async requestOrderChargeCancellations(
    actor: RadiologyActorContext,
    transaction: RadiologyTransactionContext,
    order: RadiologyOrderRecord,
    reason: string,
    occurredAt: Date,
  ): Promise<RadiologyOrderItemRecord[]> {
    const items = await this.orders.listItems(
      actor.facilityId,
      order._id.toHexString(),
    );
    const updatedItems: RadiologyOrderItemRecord[] = [];
    let requestedCancellationCount = 0;

    for (const item of items) {
      if (
        item.billingStatus === 'NOT_REQUESTED' ||
        item.billingStatus === 'CANCELLED' ||
        item.billingStatus === 'REFUND_PENDING' ||
        item.billingStatus === 'REFUNDED'
      ) {
        updatedItems.push(item);
        continue;
      }

      if (item.billingStatus !== 'FAILED') {
        requestedCancellationCount += 1;
        await this.dependencies.charges.requestCancellation({
          facilityId: actor.facilityId,
          patientId: order.patientId.toHexString(),
          encounterId: order.encounterId.toHexString(),
          radiologyOrderId: order._id.toHexString(),
          radiologyOrderItemId: item._id.toHexString(),
          accountChargeId: item.accountChargeId?.toHexString() ?? null,
          requestedBy: actor.userId,
          requestedAt: occurredAt,
          reason,
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
        });
      }

      const nextBillingStatus =
        item.billingStatus === 'CHARGED'
          ? 'REFUND_PENDING'
          : 'CANCELLED';
      const updated = await this.orders.updateItemBilling(
        actor.facilityId,
        item._id.toHexString(),
        item.version,
        nextBillingStatus,
        item.accountChargeId?.toHexString() ?? null,
        null,
        actor.userId,
      );

      if (updated === null) {
        throw new RadiologyOrderItemConcurrencyError();
      }

      updatedItems.push(updated);
    }

    await transaction.checkpoint(
      RADIOLOGY_TRANSACTION_STATES.BILLING_CANCELLATION_REQUESTED,
      {
        orderId: order._id.toHexString(),
        requestedCancellationCount,
      },
    );

    return updatedItems;
  }

  public auditActorFields(
    actor: RadiologyActorContext,
  ): Pick<
    RadiologyAuditEntry,
    | 'actorUserId'
    | 'facilityId'
    | 'correlationId'
    | 'ipAddress'
    | 'userAgent'
  > {
    return {
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      ...(actor.ipAddress === undefined
        ? {}
        : { ipAddress: actor.ipAddress }),
      ...(actor.userAgent === undefined
        ? {}
        : { userAgent: actor.userAgent }),
    };
  }

  public async publishOrderRealtime(
    actor: RadiologyActorContext,
    order: RadiologyOrderRecord,
    eventType: string,
  ): Promise<void> {
    await this.dependencies.realtime.publish({
      eventType,
      facilityId: actor.facilityId,
      patientId: order.patientId.toHexString(),
      encounterId: order.encounterId.toHexString(),
      orderId: order._id.toHexString(),
      payload: safeRadiologyOrderEventPayload(order),
    });
  }

  public deduplicationKey(
    transactionId: string,
    action: string,
    entityId: string,
  ): string {
    return radiologyDeduplicationKey(transactionId, action, entityId);
  }

  public catalogManagePermission(): string {
    return RADIOLOGY_PERMISSION_KEYS.CATALOG_MANAGE;
  }
}