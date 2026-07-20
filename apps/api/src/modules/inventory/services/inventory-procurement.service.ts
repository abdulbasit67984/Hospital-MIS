import Decimal from 'decimal.js';
import {
  Types,
} from 'mongoose';

import {
  ConcurrencyConflictError,
  ConflictError,
  ForbiddenError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import type {
  InventoryAccessDecision,
} from '../inventory.ports.js';

import type {
  AcknowledgePurchaseOrderInput,
  ApproveSupplierReturnInput,
  CancelPurchaseOrderInput,
  CreatePurchaseOrderInput,
  CreatePurchaseRequisitionInput,
  DecidePurchaseRequisitionInput,
  EnterGoodsReceiptInErrorInput,
  InitiateSupplierReturnInput,
  ProcurementCommandContext,
  ReceiveGoodsInput,
  SubmitPurchaseRequisitionInput,
} from '../inventory-procurement.contracts.js';

import type {
  InventoryProcurementDependencies,
  InventoryProcurementTransactionContext,
  ProcurementCommandResult,
} from '../inventory-procurement.ports.js';

import type {
  GoodsReceiptItemRecord,
  GoodsReceiptRecord,
  InventoryMongoSession,
  PurchaseOrderItemRecord,
  PurchaseOrderRecord,
  PurchaseRequisitionItemRecord,
  PurchaseRequisitionRecord,
  SupplierReturnRecord,
} from '../inventory-procurement.persistence.types.js';

import {
  normalizeInventoryDecimal,
  normalizeNullableInventoryText,
} from '../inventory.normalization.js';

import {
  INVENTORY_PROCUREMENT_AUDIT_ACTIONS,
  INVENTORY_PROCUREMENT_COMPENSATION_TYPES,
  INVENTORY_PROCUREMENT_OUTBOX_EVENTS,
  INVENTORY_PROCUREMENT_REALTIME_EVENTS,
  INVENTORY_PROCUREMENT_SEQUENCE_KEYS,
  INVENTORY_PROCUREMENT_TRANSACTION_STATES,
  INVENTORY_PROCUREMENT_TRANSACTION_TYPES,
  formatProcurementDocumentNumber,
  procurementDeduplicationKey,
  procurementLockKey,
  safeGoodsReceiptSnapshot,
  safePurchaseOrderSnapshot,
  safeRequisitionSnapshot,
  safeSupplierReturnSnapshot,
} from '../inventory-procurement.transaction.constants.js';

function decimal(value: string): Decimal {
  return new Decimal(value);
}

function normalized(value: Decimal): string {
  return normalizeInventoryDecimal(value.toFixed(), 8);
}

function requireAllowed(
  decision: InventoryAccessDecision,
  requireCost = false,
): void {
  if (!decision.allowed) {
    throw new ForbiddenError(
      decision.denialReason ?? 'Inventory procurement access was denied',
    );
  }

  if (requireCost && !decision.includeCost) {
    throw new ForbiddenError(
      'This procurement operation requires inventory cost visibility',
    );
  }
}

function assertVersionedResult<T>(
  value: T | null,
  message: string,
): T {
  if (value === null) {
    throw new ConcurrencyConflictError(message);
  }

  return value;
}

function itemById(
  items: readonly PurchaseRequisitionItemRecord[],
  id: string,
): PurchaseRequisitionItemRecord {
  const item = items.find(
    (candidate) => candidate._id.toHexString() === id,
  );

  if (item === undefined) {
    throw new ResourceNotFoundError('Purchase requisition line was not found');
  }

  return item;
}

function purchaseOrderItemById(
  items: readonly PurchaseOrderItemRecord[],
  id: string,
): PurchaseOrderItemRecord {
  const item = items.find(
    (candidate) => candidate._id.toHexString() === id,
  );

  if (item === undefined) {
    throw new ResourceNotFoundError('Purchase-order line was not found');
  }

  return item;
}

function receiptItemById(
  items: readonly GoodsReceiptItemRecord[],
  id: string,
): GoodsReceiptItemRecord {
  const item = items.find(
    (candidate) => candidate._id.toHexString() === id,
  );

  if (item === undefined) {
    throw new ResourceNotFoundError('Goods-receipt line was not found');
  }

  return item;
}

export class InventoryProcurementService {
  public constructor(
    private readonly dependencies: InventoryProcurementDependencies,
  ) {}

  public createPurchaseRequisition(
    context: ProcurementCommandContext,
    input: CreatePurchaseRequisitionInput,
  ): ProcurementCommandResult<PurchaseRequisitionRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType: INVENTORY_PROCUREMENT_TRANSACTION_TYPES.CREATE_REQUISITION,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        procurementLockKey(
          'inventory:requisition:create',
          context.actor.facilityId,
          input.requestingLocationId,
        ),
        ...input.lines.map((line) =>
          procurementLockKey(
            'inventory:item:procurement',
            context.actor.facilityId,
            line.itemId,
          ),
        ),
      ],
      idempotencyPayload: input,
      journalPayload: {
        operation: 'CREATE_REQUISITION',
        requestingDepartmentId: input.requestingDepartmentId,
        requestingLocationId: input.requestingLocationId,
        lineCount: input.lines.length,
        priority: input.priority ?? 'ROUTINE',
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const operational = await this.dependencies.context.resolveOperationalLocation(
          context.actor,
          input.requestingLocationId,
        );

        if (
          operational.location.departmentId !== null &&
          operational.location.departmentId !== input.requestingDepartmentId
        ) {
          throw new ConflictError(
            'The requesting department does not own the selected inventory location',
          );
        }

        await transaction.checkpoint(
          INVENTORY_PROCUREMENT_TRANSACTION_STATES.CONTEXT_VALIDATED,
        );

        const access = await this.dependencies.accessPolicy.authorize({
          actor: context.actor,
          action: 'PROCURE',
        });
        requireAllowed(access, true);

        await transaction.checkpoint(
          INVENTORY_PROCUREMENT_TRANSACTION_STATES.ACCESS_AUTHORIZED,
        );

        await this.dependencies.attachments.assertAvailable(
          context.actor.facilityId,
          input.attachmentIds ?? [],
        );

        const preparedLines = [];
        let subtotal = new Decimal(0);
        let taxAmount = new Decimal(0);
        let discountAmount = new Decimal(0);

        for (const line of input.lines) {
          const item = await this.dependencies.catalog.findItemById(
            context.actor.facilityId,
            line.itemId,
            true,
          );

          if (item === null || item.status !== 'ACTIVE') {
            throw new ResourceNotFoundError(
              'An active requisition inventory item was not found',
            );
          }

          if (line.preferredSupplierId != null) {
            const supplier = await this.dependencies.catalog.findSupplierById(
              context.actor.facilityId,
              line.preferredSupplierId,
              false,
            );

            if (supplier === null || supplier.status !== 'ACTIVE') {
              throw new ConflictError(
                'A preferred supplier is unavailable for procurement',
              );
            }
          }

          const stockQuantity = this.dependencies.unitConversion.toStockUnit(
            item,
            line.requestedQuantity,
            line.requestedUnitId,
          );
          const unitFactor = decimal(stockQuantity).div(line.requestedQuantity);
          const base = decimal(line.requestedQuantity).mul(line.estimatedUnitCost);
          const lineTax = decimal(line.estimatedTaxAmount ?? '0');
          const lineDiscount = decimal(line.estimatedDiscountAmount ?? '0');
          const lineTotal = base.plus(lineTax).minus(lineDiscount);

          if (lineTotal.isNegative()) {
            throw new ConflictError(
              'A requisition line discount cannot exceed its estimated amount and tax',
            );
          }

          subtotal = subtotal.plus(base);
          taxAmount = taxAmount.plus(lineTax);
          discountAmount = discountAmount.plus(lineDiscount);

          preparedLines.push({
            itemId: line.itemId,
            requestedUnitId: line.requestedUnitId,
            requestedQuantity: normalized(decimal(line.requestedQuantity)),
            requestedUnitToStockFactor: normalized(unitFactor),
            requestedStockQuantity: stockQuantity,
            estimatedUnitCost: normalized(decimal(line.estimatedUnitCost)),
            estimatedTaxAmount: normalized(lineTax),
            estimatedDiscountAmount: normalized(lineDiscount),
            estimatedLineTotal: normalized(lineTotal),
            preferredSupplierId: line.preferredSupplierId ?? null,
            notes: normalizeNullableInventoryText(line.notes),
          });
        }

        const netAmount = subtotal.plus(taxAmount).minus(discountAmount);

        await transaction.checkpoint(
          INVENTORY_PROCUREMENT_TRANSACTION_STATES.REFERENCES_VALIDATED,
        );

        const sequence = await this.dependencies.sequence.next(
          context.actor.facilityId,
          INVENTORY_PROCUREMENT_SEQUENCE_KEYS.REQUISITION,
        );
        const requisitionNumber = formatProcurementDocumentNumber(
          'PR',
          sequence.facilityCode,
          occurredAt,
          sequence.value,
        );

        await transaction.checkpoint(
          INVENTORY_PROCUREMENT_TRANSACTION_STATES.NUMBER_ALLOCATED,
          { requisitionNumber },
        );

        const aggregate = await this.dependencies.repository.withTransaction(
          (session) =>
            this.dependencies.repository.createRequisitionAggregate(
              input,
              {
                requisitionNumber,
                requestedByStaffId: operational.actor.staffId,
                transactionId: transaction.transactionId,
                correlationId: context.actor.correlationId,
                occurredAt,
                subtotal: normalized(subtotal),
                taxAmount: normalized(taxAmount),
                discountAmount: normalized(discountAmount),
                netAmount: normalized(netAmount),
                lineData: preparedLines,
              },
              context.actor.userId,
              context.actor.facilityId,
              session,
            ),
        );

        await transaction.registerCompensation({
          key: procurementDeduplicationKey(
            transaction.transactionId,
            INVENTORY_PROCUREMENT_COMPENSATION_TYPES.DELETE_CREATED_AGGREGATE,
            aggregate.requisition._id.toHexString(),
          ),
          type: INVENTORY_PROCUREMENT_COMPENSATION_TYPES.DELETE_CREATED_AGGREGATE,
          payload: {
            aggregateType: 'PURCHASE_REQUISITION',
            aggregateId: aggregate.requisition._id.toHexString(),
            transactionId: transaction.transactionId,
            facilityId: context.actor.facilityId,
          },
        });

        await transaction.checkpoint(
          INVENTORY_PROCUREMENT_TRANSACTION_STATES.COMPENSATION_REGISTERED,
        );

        await this.appendAuditOutboxRealtime(
          context,
          transaction,
          operational.actor.staffId,
          occurredAt,
          INVENTORY_PROCUREMENT_AUDIT_ACTIONS.REQUISITION_CREATED,
          INVENTORY_PROCUREMENT_OUTBOX_EVENTS.REQUISITION_CREATED,
          INVENTORY_PROCUREMENT_REALTIME_EVENTS.REQUISITION_WORKLIST_CHANGED,
          'PurchaseRequisition',
          aggregate.requisition._id.toHexString(),
          safeRequisitionSnapshot(aggregate.requisition),
          {
            requisitionId: aggregate.requisition._id.toHexString(),
            locationId: input.requestingLocationId,
          },
        );

        return aggregate.requisition;
      },
    });
  }

  public submitPurchaseRequisition(
    context: ProcurementCommandContext,
    requisitionId: string,
    input: SubmitPurchaseRequisitionInput,
  ): ProcurementCommandResult<PurchaseRequisitionRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType: INVENTORY_PROCUREMENT_TRANSACTION_TYPES.SUBMIT_REQUISITION,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        procurementLockKey('inventory:requisition', context.actor.facilityId, requisitionId),
      ],
      idempotencyPayload: { requisitionId, ...input },
      journalPayload: { operation: 'SUBMIT_REQUISITION', requisitionId },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const requisition = await this.requireRequisition(
          context.actor.facilityId,
          requisitionId,
        );
        const operational = await this.dependencies.context.resolveOperationalLocation(
          context.actor,
          requisition.requestingLocationId.toHexString(),
        );
        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'PROCURE',
          }),
          true,
        );

        if (requisition.requestedByStaffId.toHexString() !== operational.actor.staffId) {
          throw new ForbiddenError('Only the requisition maker may submit this draft');
        }

        const updated = await this.dependencies.repository.withTransaction((session) =>
          this.dependencies.repository.submitRequisition(
            context.actor.facilityId,
            requisitionId,
            input.expectedVersion,
            context.actor.userId,
            operational.actor.staffId,
            input.reason,
            occurredAt,
            transaction.transactionId,
            context.actor.correlationId,
            session,
          ),
        );

        const result = assertVersionedResult(
          updated,
          'The purchase requisition could not be submitted from the expected draft version',
        );

        await transaction.registerCompensation({
          key: procurementDeduplicationKey(
            transaction.transactionId,
            INVENTORY_PROCUREMENT_COMPENSATION_TYPES.RESTORE_DOCUMENT_VERSION,
            requisitionId,
          ),
          type: INVENTORY_PROCUREMENT_COMPENSATION_TYPES.RESTORE_DOCUMENT_VERSION,
          payload: {
            collection: 'purchaseRequisitions',
            entityId: requisitionId,
            facilityId: context.actor.facilityId,
            expectedPostVersion: result.version,
            previousStatus: requisition.status,
            previousVersion: requisition.version,
          },
        });

        await this.appendAuditOutboxRealtime(
          context,
          transaction,
          operational.actor.staffId,
          occurredAt,
          INVENTORY_PROCUREMENT_AUDIT_ACTIONS.REQUISITION_SUBMITTED,
          INVENTORY_PROCUREMENT_OUTBOX_EVENTS.REQUISITION_SUBMITTED,
          INVENTORY_PROCUREMENT_REALTIME_EVENTS.REQUISITION_WORKLIST_CHANGED,
          'PurchaseRequisition',
          requisitionId,
          safeRequisitionSnapshot(result),
          { requisitionId, locationId: requisition.requestingLocationId.toHexString() },
          safeRequisitionSnapshot(requisition),
          input.reason,
        );

        return result;
      },
    });
  }

  public decidePurchaseRequisition(
    context: ProcurementCommandContext,
    requisitionId: string,
    input: DecidePurchaseRequisitionInput,
  ): ProcurementCommandResult<PurchaseRequisitionRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType: INVENTORY_PROCUREMENT_TRANSACTION_TYPES.DECIDE_REQUISITION,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        procurementLockKey('inventory:requisition', context.actor.facilityId, requisitionId),
      ],
      idempotencyPayload: { requisitionId, ...input },
      journalPayload: {
        operation: 'DECIDE_REQUISITION',
        requisitionId,
        decision: input.decision,
        lineCount: input.lines?.length ?? 0,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const requisition = await this.requireRequisition(
          context.actor.facilityId,
          requisitionId,
        );
        const items = await this.dependencies.repository.findRequisitionItems(
          context.actor.facilityId,
          requisitionId,
        );
        const operational = await this.dependencies.context.resolveOperationalLocation(
          context.actor,
          requisition.requestingLocationId.toHexString(),
        );
        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'PROCURE',
          }),
          true,
        );

        if (requisition.status !== 'SUBMITTED') {
          throw new ConflictError('Only submitted requisitions can be decided');
        }

        if (requisition.requestedByStaffId.toHexString() === operational.actor.staffId) {
          throw new ForbiddenError('The requisition maker cannot approve or reject the same requisition');
        }

        let actorApprovalLimit: string | null = null;

        if (input.decision === 'APPROVED') {
          actorApprovalLimit = await this.dependencies.approvalLimits.resolveLimit({
            facilityId: context.actor.facilityId,
            actorUserId: context.actor.userId,
            actorStaffId: operational.actor.staffId,
            roleKeys: context.actor.roleKeys,
            documentType: 'PURCHASE_REQUISITION',
            currency: requisition.currency,
            amount: requisition.estimatedNetAmount.toString(),
            occurredAt,
          });

          if (
            actorApprovalLimit === null ||
            decimal(actorApprovalLimit).lt(requisition.estimatedNetAmount.toString())
          ) {
            throw new ForbiddenError('The requisition amount exceeds the actor approval limit');
          }
        }

        if (input.decision === 'APPROVED') {
          const decisions = new Map(
            (input.lines ?? []).map((line) => [line.requisitionItemId, line]),
          );

          for (const item of items) {
            const line = decisions.get(item._id.toHexString());

            if (line === undefined) {
              throw new ConflictError('Every requisition line requires an approval decision');
            }

            if (
              decimal(line.approvedStockQuantity).gt(item.requestedStockQuantity.toString())
            ) {
              throw new ConflictError('Approved quantity cannot exceed requested stock quantity');
            }
          }
        }

        const decision = await this.dependencies.repository.withTransaction((session) =>
          this.dependencies.repository.decideRequisition(
            context.actor.facilityId,
            requisition,
            items,
            input,
            context.actor.userId,
            operational.actor.staffId,
            actorApprovalLimit,
            occurredAt,
            transaction.transactionId,
            context.actor.correlationId,
            session,
          ),
        );

        const result = assertVersionedResult(
          decision.requisition,
          'The requisition changed before the approval decision was recorded',
        );

        await transaction.checkpoint(
          INVENTORY_PROCUREMENT_TRANSACTION_STATES.APPROVAL_HISTORY_APPENDED,
          { approvalHistoryId: decision.history._id.toHexString() },
        );

        const approved = input.decision === 'APPROVED';

        await this.appendAuditOutboxRealtime(
          context,
          transaction,
          operational.actor.staffId,
          occurredAt,
          approved
            ? INVENTORY_PROCUREMENT_AUDIT_ACTIONS.REQUISITION_APPROVED
            : INVENTORY_PROCUREMENT_AUDIT_ACTIONS.REQUISITION_REJECTED,
          approved
            ? INVENTORY_PROCUREMENT_OUTBOX_EVENTS.REQUISITION_APPROVED
            : INVENTORY_PROCUREMENT_OUTBOX_EVENTS.REQUISITION_REJECTED,
          INVENTORY_PROCUREMENT_REALTIME_EVENTS.REQUISITION_WORKLIST_CHANGED,
          'PurchaseRequisition',
          requisitionId,
          safeRequisitionSnapshot(result),
          { requisitionId, locationId: requisition.requestingLocationId.toHexString() },
          safeRequisitionSnapshot(requisition),
          input.reason,
        );

        return result;
      },
    });
  }

  public createPurchaseOrder(
    context: ProcurementCommandContext,
    input: CreatePurchaseOrderInput,
  ): ProcurementCommandResult<PurchaseOrderRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType: INVENTORY_PROCUREMENT_TRANSACTION_TYPES.CREATE_PURCHASE_ORDER,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        procurementLockKey('inventory:requisition', context.actor.facilityId, input.requisitionId),
        procurementLockKey('inventory:supplier', context.actor.facilityId, input.supplierId),
        procurementLockKey('inventory:location', context.actor.facilityId, input.deliveryLocationId),
      ],
      idempotencyPayload: input,
      journalPayload: {
        operation: 'CREATE_PURCHASE_ORDER',
        requisitionId: input.requisitionId,
        supplierId: input.supplierId,
        deliveryLocationId: input.deliveryLocationId,
        lineCount: input.lines.length,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const requisition = await this.requireRequisition(
          context.actor.facilityId,
          input.requisitionId,
        );
        const requisitionItems = await this.dependencies.repository.findRequisitionItems(
          context.actor.facilityId,
          input.requisitionId,
        );
        const operational = await this.dependencies.context.resolveOperationalLocation(
          context.actor,
          input.deliveryLocationId,
        );
        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'PROCURE',
          }),
          true,
        );

        if (!['APPROVED', 'PARTIALLY_CONVERTED'].includes(requisition.status)) {
          throw new ConflictError('Only approved requisition quantities can be ordered');
        }

        if (requisition.requestedByStaffId.toHexString() === operational.actor.staffId) {
          throw new ForbiddenError('The requisition maker cannot issue its purchase order');
        }

        const supplier = await this.dependencies.catalog.findSupplierById(
          context.actor.facilityId,
          input.supplierId,
          false,
        );

        if (supplier === null || supplier.status !== 'ACTIVE') {
          throw new ResourceNotFoundError('An active purchase-order supplier was not found');
        }

        await this.dependencies.attachments.assertAvailable(
          context.actor.facilityId,
          input.attachmentIds ?? [],
        );

        const lineData = [];
        let subtotal = new Decimal(0);
        let taxAmount = new Decimal(0);
        let discountAmount = new Decimal(0);

        for (const line of input.lines) {
          const requisitionItem = itemById(requisitionItems, line.requisitionItemId);

          if (requisitionItem.status !== 'APPROVED') {
            throw new ConflictError('Only approved and unordered requisition lines can be ordered');
          }

          const item = await this.dependencies.catalog.findItemById(
            context.actor.facilityId,
            requisitionItem.itemId.toHexString(),
            true,
          );

          if (item === null || item.status !== 'ACTIVE') {
            throw new ResourceNotFoundError('An active purchase-order inventory item was not found');
          }

          const orderedStockQuantity = this.dependencies.unitConversion.toStockUnit(
            item,
            line.orderedQuantity,
            line.purchaseUnitId,
          );
          const approvedQuantity = decimal(
            requisitionItem.approvedStockQuantity?.toString() ?? '0',
          );
          const remainingApprovedQuantity = approvedQuantity.minus(
            requisitionItem.orderedStockQuantity.toString(),
          );

          if (decimal(orderedStockQuantity).gt(remainingApprovedQuantity)) {
            throw new ConflictError(
              'Ordered stock quantity cannot exceed the remaining approved requisition quantity',
            );
          }

          const unitFactor = decimal(orderedStockQuantity).div(line.orderedQuantity);
          const base = decimal(line.orderedQuantity).mul(line.unitCost);
          const lineTax = decimal(line.taxAmount ?? '0');
          const lineDiscount = decimal(line.discountAmount ?? '0');
          const lineTotal = base.plus(lineTax).minus(lineDiscount);

          if (lineTotal.isNegative()) {
            throw new ConflictError('A purchase-order line discount exceeds its amount and tax');
          }

          subtotal = subtotal.plus(base);
          taxAmount = taxAmount.plus(lineTax);
          discountAmount = discountAmount.plus(lineDiscount);

          lineData.push({
            requisitionItem,
            purchaseUnitId: line.purchaseUnitId,
            purchaseUnitToStockFactor: normalized(unitFactor),
            orderedQuantity: normalized(decimal(line.orderedQuantity)),
            orderedStockQuantity,
            unitCost: normalized(decimal(line.unitCost)),
            taxAmount: normalized(lineTax),
            discountAmount: normalized(lineDiscount),
            lineTotal: normalized(lineTotal),
            overReceiptTolerancePercent: normalized(
              decimal(line.overReceiptTolerancePercent ?? '0'),
            ),
            notes: normalizeNullableInventoryText(line.notes),
          });
        }

        const sequence = await this.dependencies.sequence.next(
          context.actor.facilityId,
          INVENTORY_PROCUREMENT_SEQUENCE_KEYS.PURCHASE_ORDER,
        );
        const purchaseOrderNumber = formatProcurementDocumentNumber(
          'PO',
          sequence.facilityCode,
          occurredAt,
          sequence.value,
        );
        const netAmount = subtotal.plus(taxAmount).minus(discountAmount);

        const aggregate = await this.dependencies.repository.withTransaction((session) =>
          this.dependencies.repository.createPurchaseOrderAggregate(
            input,
            {
              purchaseOrderNumber,
              orderedByStaffId: operational.actor.staffId,
              transactionId: transaction.transactionId,
              correlationId: context.actor.correlationId,
              occurredAt,
              subtotal: normalized(subtotal),
              taxAmount: normalized(taxAmount),
              discountAmount: normalized(discountAmount),
              netAmount: normalized(netAmount),
              lineData,
            },
            context.actor.userId,
            context.actor.facilityId,
            session,
          ),
        );

        await transaction.registerCompensation({
          key: procurementDeduplicationKey(
            transaction.transactionId,
            INVENTORY_PROCUREMENT_COMPENSATION_TYPES.DELETE_CREATED_AGGREGATE,
            aggregate.purchaseOrder._id.toHexString(),
          ),
          type: INVENTORY_PROCUREMENT_COMPENSATION_TYPES.DELETE_CREATED_AGGREGATE,
          payload: {
            aggregateType: 'PURCHASE_ORDER',
            aggregateId: aggregate.purchaseOrder._id.toHexString(),
            transactionId: transaction.transactionId,
            facilityId: context.actor.facilityId,
          },
        });

        await this.appendAuditOutboxRealtime(
          context,
          transaction,
          operational.actor.staffId,
          occurredAt,
          INVENTORY_PROCUREMENT_AUDIT_ACTIONS.PURCHASE_ORDER_CREATED,
          INVENTORY_PROCUREMENT_OUTBOX_EVENTS.PURCHASE_ORDER_CREATED,
          INVENTORY_PROCUREMENT_REALTIME_EVENTS.PURCHASE_ORDER_WORKLIST_CHANGED,
          'PurchaseOrder',
          aggregate.purchaseOrder._id.toHexString(),
          safePurchaseOrderSnapshot(aggregate.purchaseOrder),
          {
            purchaseOrderId: aggregate.purchaseOrder._id.toHexString(),
            supplierId: input.supplierId,
            locationId: input.deliveryLocationId,
          },
        );

        return aggregate.purchaseOrder;
      },
    });
  }

  public acknowledgePurchaseOrder(
    context: ProcurementCommandContext,
    purchaseOrderId: string,
    input: AcknowledgePurchaseOrderInput,
  ): ProcurementCommandResult<PurchaseOrderRecord> {
    return this.mutatePurchaseOrder(
      context,
      purchaseOrderId,
      input,
      INVENTORY_PROCUREMENT_TRANSACTION_TYPES.ACKNOWLEDGE_PURCHASE_ORDER,
      INVENTORY_PROCUREMENT_AUDIT_ACTIONS.PURCHASE_ORDER_ACKNOWLEDGED,
      INVENTORY_PROCUREMENT_OUTBOX_EVENTS.PURCHASE_ORDER_ACKNOWLEDGED,
      async (order, occurredAt, staffId, transactionId, session) =>
        this.dependencies.repository.acknowledgePurchaseOrder(
          context.actor.facilityId,
          purchaseOrderId,
          input,
          context.actor.userId,
          staffId,
          occurredAt,
          session,
        ),
    );
  }

  public cancelPurchaseOrder(
    context: ProcurementCommandContext,
    purchaseOrderId: string,
    input: CancelPurchaseOrderInput,
  ): ProcurementCommandResult<PurchaseOrderRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType: INVENTORY_PROCUREMENT_TRANSACTION_TYPES.CANCEL_PURCHASE_ORDER,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        procurementLockKey('inventory:purchase-order', context.actor.facilityId, purchaseOrderId),
      ],
      idempotencyPayload: { purchaseOrderId, ...input },
      journalPayload: { operation: 'CANCEL_PURCHASE_ORDER', purchaseOrderId },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const order = await this.requirePurchaseOrder(context.actor.facilityId, purchaseOrderId);
        const operational = await this.dependencies.context.resolveOperationalLocation(
          context.actor,
          order.deliveryLocationId.toHexString(),
        );
        requireAllowed(
          await this.dependencies.accessPolicy.authorize({ actor: context.actor, action: 'PROCURE' }),
          true,
        );

        if (
          await this.dependencies.repository.countReceiptsForOrder(
            context.actor.facilityId,
            purchaseOrderId,
          )
        ) {
          throw new ConflictError('A purchase order with receipts cannot be cancelled');
        }

        const updated = await this.dependencies.repository.withTransaction((session) =>
          this.dependencies.repository.cancelPurchaseOrder(
            context.actor.facilityId,
            purchaseOrderId,
            input.expectedVersion,
            context.actor.userId,
            operational.actor.staffId,
            input.reason,
            occurredAt,
            session,
          ),
        );
        const result = assertVersionedResult(
          updated,
          'The purchase order could not be cancelled from the expected version',
        );

        await this.appendAuditOutboxRealtime(
          context,
          transaction,
          operational.actor.staffId,
          occurredAt,
          INVENTORY_PROCUREMENT_AUDIT_ACTIONS.PURCHASE_ORDER_CANCELLED,
          INVENTORY_PROCUREMENT_OUTBOX_EVENTS.PURCHASE_ORDER_CANCELLED,
          INVENTORY_PROCUREMENT_REALTIME_EVENTS.PURCHASE_ORDER_WORKLIST_CHANGED,
          'PurchaseOrder',
          purchaseOrderId,
          safePurchaseOrderSnapshot(result),
          {
            purchaseOrderId,
            supplierId: order.supplierId.toHexString(),
            locationId: order.deliveryLocationId.toHexString(),
          },
          safePurchaseOrderSnapshot(order),
          input.reason,
        );

        return result;
      },
    });
  }

  public receiveGoods(
    context: ProcurementCommandContext,
    input: ReceiveGoodsInput,
  ): ProcurementCommandResult<GoodsReceiptRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType: INVENTORY_PROCUREMENT_TRANSACTION_TYPES.RECEIVE_GOODS,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        procurementLockKey('inventory:purchase-order', context.actor.facilityId, input.purchaseOrderId),
        procurementLockKey('inventory:location', context.actor.facilityId, input.receivingLocationId),
        ...input.lines.map((line) =>
          procurementLockKey(
            'inventory:purchase-order-item:receipt',
            context.actor.facilityId,
            line.purchaseOrderItemId,
          ),
        ),
      ],
      idempotencyPayload: input,
      journalPayload: {
        operation: 'RECEIVE_GOODS',
        purchaseOrderId: input.purchaseOrderId,
        receivingLocationId: input.receivingLocationId,
        lineCount: input.lines.length,
        inspectionStatus: input.inspectionStatus,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const order = await this.requirePurchaseOrder(
          context.actor.facilityId,
          input.purchaseOrderId,
        );
        const orderItems = await this.dependencies.repository.findPurchaseOrderItems(
          context.actor.facilityId,
          input.purchaseOrderId,
        );
        const operational = await this.dependencies.context.resolveOperationalLocation(
          context.actor,
          input.receivingLocationId,
        );
        requireAllowed(
          await this.dependencies.accessPolicy.authorize({ actor: context.actor, action: 'RECEIVE' }),
          true,
        );

        if (order.deliveryLocationId.toHexString() !== input.receivingLocationId) {
          throw new ConflictError('Goods must be received into the purchase-order delivery location');
        }

        if (!['ISSUED', 'ACKNOWLEDGED', 'PARTIALLY_RECEIVED'].includes(order.status)) {
          throw new ConflictError('The purchase order cannot accept additional receipts');
        }

        await this.dependencies.attachments.assertAvailable(
          context.actor.facilityId,
          [
            ...(input.attachmentIds ?? []),
            ...(input.purchaseInvoice?.attachmentIds ?? []),
          ],
        );

        const lineData = [];
        let subtotal = new Decimal(0);
        let taxAmount = new Decimal(0);
        let discountAmount = new Decimal(0);
        let totalReceived = new Decimal(0);
        let totalAccepted = new Decimal(0);
        let totalRejected = new Decimal(0);
        let totalDamaged = new Decimal(0);
        let totalQuarantined = new Decimal(0);
        let hasPurchasePriceVariance = false;

        for (const line of input.lines) {
          const orderItem = purchaseOrderItemById(orderItems, line.purchaseOrderItemId);
          const item = await this.dependencies.catalog.findItemById(
            context.actor.facilityId,
            orderItem.itemId.toHexString(),
            true,
          );

          if (item === null || item.status !== 'ACTIVE') {
            throw new ResourceNotFoundError('An active received inventory item was not found');
          }

          const receivedStockQuantity = this.dependencies.unitConversion.toStockUnit(
            item,
            line.receivedQuantity,
            line.receivedUnitId,
          );
          const received = decimal(receivedStockQuantity);
          const classified = decimal(line.acceptedStockQuantity)
            .plus(line.rejectedStockQuantity ?? '0')
            .plus(line.damagedStockQuantity ?? '0')
            .plus(line.quarantinedStockQuantity ?? '0');

          if (!classified.eq(received)) {
            throw new ConflictError(
              'Accepted, rejected, damaged, and quarantined quantities must equal received stock quantity',
            );
          }

          const alreadyReceived = decimal(orderItem.receivedStockQuantity.toString());
          const ordered = decimal(orderItem.orderedStockQuantity.toString());
          const tolerance = decimal(orderItem.overReceiptTolerancePercent.toString()).div(100);
          const maximum = ordered.mul(tolerance.plus(1));

          if (alreadyReceived.plus(received).gt(maximum)) {
            throw new ConflictError('Receipt quantity exceeds the purchase-order over-receipt tolerance');
          }

          const receiptAt = input.receivedAt === undefined
            ? occurredAt
            : new Date(input.receivedAt);
          const expiryDate = line.expiryDate == null ? null : new Date(line.expiryDate);

          if (
            item.expiryTrackingRequired &&
            expiryDate === null
          ) {
            throw new ConflictError('This inventory item requires an expiry date at receipt');
          }

          const expired = expiryDate !== null && expiryDate.getTime() <= receiptAt.getTime();

          if (expired && decimal(line.acceptedStockQuantity).gt(0)) {
            throw new ConflictError('Expired stock cannot be accepted into available inventory');
          }

          if (
            item.controlledMedicine &&
            !operational.location.allowsControlledMedicine
          ) {
            throw new ConflictError('The receiving location is not approved for controlled medicines');
          }

          const accepted = decimal(line.acceptedStockQuantity);
          const rejected = decimal(line.rejectedStockQuantity ?? '0');
          const damaged = decimal(line.damagedStockQuantity ?? '0');
          const quarantined = decimal(line.quarantinedStockQuantity ?? '0');
          const unitFactor = received.div(line.receivedQuantity);
          const base = decimal(line.receivedQuantity).mul(line.unitCost);
          const lineTax = decimal(line.taxAmount ?? '0');
          const lineDiscount = decimal(line.discountAmount ?? '0');
          const lineTotal = base.plus(lineTax).minus(lineDiscount);

          if (!decimal(line.unitCost).eq(orderItem.unitCost.toString())) {
            hasPurchasePriceVariance = true;
          }

          if (lineTotal.isNegative()) {
            throw new ConflictError('A goods-receipt line discount exceeds its amount and tax');
          }

          const batchStatus = expired
            ? 'EXPIRED'
            : accepted.gt(0)
              ? 'ACTIVE'
              : quarantined.gt(0)
                ? 'QUARANTINED'
                : 'BLOCKED';
          const existingBatch = await this.dependencies.repository.findInventoryBatchByNumber(
            context.actor.facilityId,
            orderItem.itemId.toHexString(),
            line.manufacturerBatchNumber,
          );

          if (
            existingBatch !== null &&
            ['QUARANTINED', 'RECALLED', 'EXPIRED', 'DEPLETED', 'BLOCKED'].includes(existingBatch.status) &&
            accepted.gt(0)
          ) {
            throw new ConflictError(
              'Restricted, depleted, recalled, or expired batches cannot receive accepted stock',
            );
          }

          if (existingBatch !== null) {
            const existingExpiry = existingBatch.expiryDate?.getTime() ?? null;
            const incomingExpiry = expiryDate?.getTime() ?? null;
            const incomingManufactureDate =
              line.manufactureDate == null ? null : new Date(line.manufactureDate).getTime();
            const existingManufactureDate = existingBatch.manufactureDate?.getTime() ?? null;

            if (existingExpiry !== incomingExpiry) {
              throw new ConflictError(
                'Existing manufacturer batch has a different expiry date',
              );
            }

            if (existingManufactureDate !== incomingManufactureDate) {
              throw new ConflictError(
                'Existing manufacturer batch has a different manufacture date',
              );
            }

            if (!decimal(existingBatch.costPrice.toString()).eq(line.unitCost)) {
              throw new ConflictError(
                'Existing manufacturer batch has a different batch cost',
              );
            }
          }

          subtotal = subtotal.plus(base);
          taxAmount = taxAmount.plus(lineTax);
          discountAmount = discountAmount.plus(lineDiscount);
          totalReceived = totalReceived.plus(received);
          totalAccepted = totalAccepted.plus(accepted);
          totalRejected = totalRejected.plus(rejected);
          totalDamaged = totalDamaged.plus(damaged);
          totalQuarantined = totalQuarantined.plus(quarantined);

          lineData.push({
            purchaseOrderItem: orderItem,
            inventoryBatchId:
              existingBatch?._id.toHexString() ?? new Types.ObjectId().toHexString(),
            createInventoryBatch: existingBatch === null,
            batchStatus,
            receivedUnitToStockFactor: normalized(unitFactor),
            receivedStockQuantity: normalized(received),
            acceptedStockQuantity: normalized(accepted),
            rejectedStockQuantity: normalized(rejected),
            damagedStockQuantity: normalized(damaged),
            quarantinedStockQuantity: normalized(quarantined),
            lineTotal: normalized(lineTotal),
          });
        }

        const sequence = await this.dependencies.sequence.next(
          context.actor.facilityId,
          INVENTORY_PROCUREMENT_SEQUENCE_KEYS.GOODS_RECEIPT,
        );
        const goodsReceiptNumber = formatProcurementDocumentNumber(
          'GRN',
          sequence.facilityCode,
          occurredAt,
          sequence.value,
        );

        let purchaseInvoiceReference: string | null = null;

        if (input.purchaseInvoice !== undefined) {
          const invoiceSequence = await this.dependencies.sequence.next(
            context.actor.facilityId,
            INVENTORY_PROCUREMENT_SEQUENCE_KEYS.PURCHASE_INVOICE,
          );
          purchaseInvoiceReference = formatProcurementDocumentNumber(
            'PINV',
            invoiceSequence.facilityCode,
            occurredAt,
            invoiceSequence.value,
          );
        }

        const netAmount = subtotal.plus(taxAmount).minus(discountAmount);
        const invoice = input.purchaseInvoice;

        if (invoice === undefined && hasPurchasePriceVariance) {
          throw new ConflictError(
            'Purchase-price variances require a disputed supplier invoice with a reason',
          );
        }

        if (invoice !== undefined) {
          const invoiceCurrency = (invoice.currency ?? order.currency).trim().toUpperCase();
          const invoiceCalculatedNet = decimal(invoice.subtotal)
            .plus(invoice.taxAmount ?? '0')
            .minus(invoice.discountAmount ?? '0');

          if (invoiceCurrency !== order.currency) {
            throw new ConflictError('Supplier invoice currency must match the purchase order');
          }

          if (!invoiceCalculatedNet.eq(invoice.netAmount)) {
            throw new ConflictError(
              'Supplier invoice net amount does not reconcile to subtotal, tax, and discount',
            );
          }

          if (
            (hasPurchasePriceVariance || !invoiceCalculatedNet.eq(netAmount)) &&
            invoice.status !== 'DISPUTED'
          ) {
            throw new ConflictError(
              'Purchase-order or receipt-value variances require a disputed supplier invoice',
            );
          }
        }

        const posted = await this.dependencies.repository.withTransaction(async (session) => {
          const aggregate = await this.dependencies.repository.createGoodsReceiptAggregate(
            input,
            {
              goodsReceiptNumber,
              purchaseInvoiceReference,
              receivedByStaffId: operational.actor.staffId,
              transactionId: transaction.transactionId,
              correlationId: context.actor.correlationId,
              occurredAt,
              purchaseOrder: order,
              subtotal: normalized(subtotal),
              taxAmount: normalized(taxAmount),
              discountAmount: normalized(discountAmount),
              netAmount: normalized(netAmount),
              totalReceivedStockQuantity: normalized(totalReceived),
              totalAcceptedStockQuantity: normalized(totalAccepted),
              totalRejectedStockQuantity: normalized(totalRejected),
              totalDamagedStockQuantity: normalized(totalDamaged),
              totalQuarantinedStockQuantity: normalized(totalQuarantined),
              lineData,
            },
            context.actor.userId,
            context.actor.facilityId,
            session,
          );

          await transaction.checkpoint(
            INVENTORY_PROCUREMENT_TRANSACTION_STATES.BATCHES_CREATED,
            {
              goodsReceiptId: aggregate.goodsReceipt._id.toHexString(),
              batchCount: aggregate.items.length,
            },
          );

          await this.dependencies.stockPosting.postGoodsReceipt(
            {
              facilityId: context.actor.facilityId,
              transactionId: transaction.transactionId,
              correlationId: context.actor.correlationId,
              actorUserId: context.actor.userId,
              actorStaffId: operational.actor.staffId,
              goodsReceiptId: aggregate.goodsReceipt._id.toHexString(),
              occurredAt,
              lines: aggregate.items.map((receiptItem) => ({
                goodsReceiptItemId: receiptItem._id.toHexString(),
                itemId: receiptItem.itemId.toHexString(),
                batchId: receiptItem.inventoryBatchId.toHexString(),
                locationId: input.receivingLocationId,
                acceptedStockQuantity: receiptItem.acceptedStockQuantity.toString(),
                quarantinedStockQuantity: receiptItem.quarantinedStockQuantity.toString(),
                damagedStockQuantity: receiptItem.damagedStockQuantity.toString(),
                unitCost: receiptItem.unitCost.toString(),
                currency: order.currency,
              })),
            },
            session,
          );

          await transaction.checkpoint(
            INVENTORY_PROCUREMENT_TRANSACTION_STATES.STOCK_POSTED,
          );

          return assertVersionedResult(
            await this.dependencies.repository.markGoodsReceiptPosted(
              context.actor.facilityId,
              aggregate.goodsReceipt._id.toHexString(),
              aggregate.goodsReceipt.version,
              transaction.transactionId,
              context.actor.userId,
              occurredAt,
              session,
            ),
            'Goods receipt stock posting could not finalize the expected receipt version',
          );
        });

        await transaction.registerCompensation({
          key: procurementDeduplicationKey(
            transaction.transactionId,
            INVENTORY_PROCUREMENT_COMPENSATION_TYPES.REVERSE_STOCK_POSTING,
            posted._id.toHexString(),
          ),
          type: INVENTORY_PROCUREMENT_COMPENSATION_TYPES.REVERSE_STOCK_POSTING,
          payload: {
            facilityId: context.actor.facilityId,
            goodsReceiptId: posted._id.toHexString(),
            stockPostingTransactionId: transaction.transactionId,
          },
        });

        await this.appendAuditOutboxRealtime(
          context,
          transaction,
          operational.actor.staffId,
          occurredAt,
          INVENTORY_PROCUREMENT_AUDIT_ACTIONS.GOODS_RECEIPT_POSTED,
          INVENTORY_PROCUREMENT_OUTBOX_EVENTS.GOODS_RECEIPT_POSTED,
          INVENTORY_PROCUREMENT_REALTIME_EVENTS.RECEIVING_WORKLIST_CHANGED,
          'GoodsReceipt',
          posted._id.toHexString(),
          safeGoodsReceiptSnapshot(posted),
          {
            goodsReceiptId: posted._id.toHexString(),
            purchaseOrderId: input.purchaseOrderId,
            supplierId: order.supplierId.toHexString(),
            locationId: input.receivingLocationId,
          },
        );

        await this.dependencies.realtime.publish({
          eventType: INVENTORY_PROCUREMENT_REALTIME_EVENTS.STOCK_CHANGED,
          facilityId: context.actor.facilityId,
          locationId: input.receivingLocationId,
          goodsReceiptId: posted._id.toHexString(),
          payload: {
            goodsReceiptId: posted._id.toHexString(),
            itemIds: lineData.map((line) => line.purchaseOrderItem.itemId.toHexString()),
          },
        });

        return posted;
      },
    });
  }

  public enterGoodsReceiptInError(
    context: ProcurementCommandContext,
    goodsReceiptId: string,
    input: EnterGoodsReceiptInErrorInput,
  ): ProcurementCommandResult<GoodsReceiptRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType: INVENTORY_PROCUREMENT_TRANSACTION_TYPES.ENTER_RECEIPT_IN_ERROR,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        procurementLockKey('inventory:goods-receipt', context.actor.facilityId, goodsReceiptId),
      ],
      idempotencyPayload: { goodsReceiptId, ...input },
      journalPayload: { operation: 'ENTER_RECEIPT_IN_ERROR', goodsReceiptId },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const receipt = await this.requireGoodsReceipt(context.actor.facilityId, goodsReceiptId);
        const operational = await this.dependencies.context.resolveOperationalLocation(
          context.actor,
          receipt.receivingLocationId.toHexString(),
        );
        requireAllowed(
          await this.dependencies.accessPolicy.authorize({ actor: context.actor, action: 'RECEIVE' }),
          true,
        );

        if (receipt.status !== 'POSTED') {
          throw new ConflictError('Only posted goods receipts can be entered in error');
        }

        if (
          await this.dependencies.repository.countActiveSupplierReturnsForReceipt(
            context.actor.facilityId,
            goodsReceiptId,
          )
        ) {
          throw new ConflictError('A receipt with active supplier returns cannot be entered in error');
        }

        const updated = await this.dependencies.repository.withTransaction(async (session) => {
          await this.dependencies.stockPosting.reverseGoodsReceipt(
            {
              facilityId: context.actor.facilityId,
              transactionId: transaction.transactionId,
              correlationId: context.actor.correlationId,
              actorUserId: context.actor.userId,
              actorStaffId: operational.actor.staffId,
              goodsReceiptId,
              occurredAt,
              reason: input.reason,
            },
            session,
          );

          return assertVersionedResult(
            await this.dependencies.repository.enterGoodsReceiptInError(
              context.actor.facilityId,
              goodsReceiptId,
              input,
              context.actor.userId,
              operational.actor.staffId,
              occurredAt,
              transaction.transactionId,
              session,
            ),
            'The goods receipt changed before reversal could be recorded',
          );
        });

        await this.appendAuditOutboxRealtime(
          context,
          transaction,
          operational.actor.staffId,
          occurredAt,
          INVENTORY_PROCUREMENT_AUDIT_ACTIONS.GOODS_RECEIPT_ENTERED_IN_ERROR,
          INVENTORY_PROCUREMENT_OUTBOX_EVENTS.GOODS_RECEIPT_REVERSED,
          INVENTORY_PROCUREMENT_REALTIME_EVENTS.RECEIVING_WORKLIST_CHANGED,
          'GoodsReceipt',
          goodsReceiptId,
          safeGoodsReceiptSnapshot(updated),
          {
            goodsReceiptId,
            purchaseOrderId: receipt.purchaseOrderId.toHexString(),
            supplierId: receipt.supplierId.toHexString(),
            locationId: receipt.receivingLocationId.toHexString(),
          },
          safeGoodsReceiptSnapshot(receipt),
          input.reason,
        );

        return updated;
      },
    });
  }

  public initiateSupplierReturn(
    context: ProcurementCommandContext,
    input: InitiateSupplierReturnInput,
  ): ProcurementCommandResult<SupplierReturnRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType: INVENTORY_PROCUREMENT_TRANSACTION_TYPES.INITIATE_SUPPLIER_RETURN,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        procurementLockKey('inventory:goods-receipt', context.actor.facilityId, input.goodsReceiptId),
        procurementLockKey('inventory:location', context.actor.facilityId, input.sourceLocationId),
      ],
      idempotencyPayload: input,
      journalPayload: {
        operation: 'INITIATE_SUPPLIER_RETURN',
        goodsReceiptId: input.goodsReceiptId,
        sourceLocationId: input.sourceLocationId,
        lineCount: input.lines.length,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const receipt = await this.requireGoodsReceipt(
          context.actor.facilityId,
          input.goodsReceiptId,
        );
        const receiptItems = await this.dependencies.repository.findGoodsReceiptItems(
          context.actor.facilityId,
          input.goodsReceiptId,
        );
        const operational = await this.dependencies.context.resolveOperationalLocation(
          context.actor,
          input.sourceLocationId,
        );
        requireAllowed(
          await this.dependencies.accessPolicy.authorize({ actor: context.actor, action: 'RETURN' }),
        );

        if (receipt.status !== 'POSTED') {
          throw new ConflictError('Supplier returns require a posted goods receipt');
        }

        if (receipt.receivingLocationId.toHexString() !== input.sourceLocationId) {
          throw new ConflictError('Supplier returns must originate from the receipt location');
        }

        await this.dependencies.attachments.assertAvailable(
          context.actor.facilityId,
          input.attachmentIds ?? [],
        );

        const lineData = [];
        let total = new Decimal(0);

        for (const line of input.lines) {
          const receiptItem = receiptItemById(receiptItems, line.goodsReceiptItemId);
          const eligible = decimal(receiptItem.acceptedStockQuantity.toString())
            .plus(receiptItem.quarantinedStockQuantity.toString())
            .plus(receiptItem.damagedStockQuantity.toString());
          const previouslyReturned = decimal(
            await this.dependencies.repository.sumPreviouslyReturnedQuantity(
              context.actor.facilityId,
              line.goodsReceiptItemId,
            ),
          );
          const requested = decimal(line.returnStockQuantity);

          if (previouslyReturned.plus(requested).gt(eligible)) {
            throw new ConflictError('Supplier-return quantity exceeds eligible received stock');
          }

          total = total.plus(requested);
          lineData.push({
            receiptItem,
            returnStockQuantity: normalized(requested),
            reasonCode: line.reasonCode,
            condition: line.condition,
            notes: normalizeNullableInventoryText(line.notes),
          });
        }

        const sequence = await this.dependencies.sequence.next(
          context.actor.facilityId,
          INVENTORY_PROCUREMENT_SEQUENCE_KEYS.SUPPLIER_RETURN,
        );
        const supplierReturnNumber = formatProcurementDocumentNumber(
          'SRET',
          sequence.facilityCode,
          occurredAt,
          sequence.value,
        );

        const aggregate = await this.dependencies.repository.withTransaction((session) =>
          this.dependencies.repository.createSupplierReturnAggregate(
            input,
            {
              supplierReturnNumber,
              supplierId: receipt.supplierId.toHexString(),
              initiatedByStaffId: operational.actor.staffId,
              transactionId: transaction.transactionId,
              correlationId: context.actor.correlationId,
              occurredAt,
              totalStockQuantity: normalized(total),
              lineData,
            },
            context.actor.userId,
            context.actor.facilityId,
            session,
          ),
        );

        await transaction.registerCompensation({
          key: procurementDeduplicationKey(
            transaction.transactionId,
            INVENTORY_PROCUREMENT_COMPENSATION_TYPES.DELETE_CREATED_AGGREGATE,
            aggregate.supplierReturn._id.toHexString(),
          ),
          type: INVENTORY_PROCUREMENT_COMPENSATION_TYPES.DELETE_CREATED_AGGREGATE,
          payload: {
            aggregateType: 'SUPPLIER_RETURN',
            aggregateId: aggregate.supplierReturn._id.toHexString(),
            transactionId: transaction.transactionId,
            facilityId: context.actor.facilityId,
          },
        });

        await this.appendAuditOutboxRealtime(
          context,
          transaction,
          operational.actor.staffId,
          occurredAt,
          INVENTORY_PROCUREMENT_AUDIT_ACTIONS.SUPPLIER_RETURN_INITIATED,
          INVENTORY_PROCUREMENT_OUTBOX_EVENTS.SUPPLIER_RETURN_INITIATED,
          INVENTORY_PROCUREMENT_REALTIME_EVENTS.SUPPLIER_RETURN_WORKLIST_CHANGED,
          'SupplierReturn',
          aggregate.supplierReturn._id.toHexString(),
          safeSupplierReturnSnapshot(aggregate.supplierReturn),
          {
            supplierReturnId: aggregate.supplierReturn._id.toHexString(),
            goodsReceiptId: input.goodsReceiptId,
            supplierId: receipt.supplierId.toHexString(),
            locationId: input.sourceLocationId,
          },
        );

        return aggregate.supplierReturn;
      },
    });
  }

  public approveSupplierReturn(
    context: ProcurementCommandContext,
    supplierReturnId: string,
    input: ApproveSupplierReturnInput,
  ): ProcurementCommandResult<SupplierReturnRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType: INVENTORY_PROCUREMENT_TRANSACTION_TYPES.APPROVE_SUPPLIER_RETURN,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        procurementLockKey('inventory:supplier-return', context.actor.facilityId, supplierReturnId),
      ],
      idempotencyPayload: { supplierReturnId, ...input },
      journalPayload: { operation: 'APPROVE_SUPPLIER_RETURN', supplierReturnId },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const supplierReturn = await this.requireSupplierReturn(
          context.actor.facilityId,
          supplierReturnId,
        );
        const receiptItems = await this.dependencies.repository.findGoodsReceiptItems(
          context.actor.facilityId,
          supplierReturn.goodsReceiptId.toHexString(),
        );
        const operational = await this.dependencies.context.resolveOperationalLocation(
          context.actor,
          supplierReturn.sourceLocationId.toHexString(),
        );
        requireAllowed(
          await this.dependencies.accessPolicy.authorize({ actor: context.actor, action: 'RETURN' }),
        );

        if (supplierReturn.initiatedByStaffId.toHexString() === operational.actor.staffId) {
          throw new ForbiddenError('The supplier-return maker cannot approve the same return');
        }

        const returnItems = await this.loadSupplierReturnItems(
          context.actor.facilityId,
          supplierReturnId,
        );

        const updated = await this.dependencies.repository.withTransaction(async (session) => {
          await this.dependencies.stockPosting.postSupplierReturn(
            {
              facilityId: context.actor.facilityId,
              transactionId: transaction.transactionId,
              correlationId: context.actor.correlationId,
              actorUserId: context.actor.userId,
              actorStaffId: operational.actor.staffId,
              supplierReturnId,
              occurredAt,
              lines: returnItems.map((returnItem) => {
                const source = receiptItemById(
                  receiptItems,
                  returnItem.goodsReceiptItemId.toHexString(),
                );

                return {
                  supplierReturnItemId: returnItem._id.toHexString(),
                  itemId: returnItem.itemId.toHexString(),
                  batchId: returnItem.batchId.toHexString(),
                  locationId: supplierReturn.sourceLocationId.toHexString(),
                  quantity: returnItem.returnStockQuantity.toString(),
                  reasonCode: returnItem.reasonCode,
                  condition: returnItem.condition,
                };
              }),
            },
            session,
          );

          return assertVersionedResult(
            await this.dependencies.repository.approveSupplierReturn(
              context.actor.facilityId,
              supplierReturnId,
              input.expectedVersion,
              context.actor.userId,
              operational.actor.staffId,
              occurredAt,
              session,
            ),
            'The supplier return changed before approval could be recorded',
          );
        });

        await this.appendAuditOutboxRealtime(
          context,
          transaction,
          operational.actor.staffId,
          occurredAt,
          INVENTORY_PROCUREMENT_AUDIT_ACTIONS.SUPPLIER_RETURN_APPROVED,
          INVENTORY_PROCUREMENT_OUTBOX_EVENTS.SUPPLIER_RETURN_APPROVED,
          INVENTORY_PROCUREMENT_REALTIME_EVENTS.SUPPLIER_RETURN_WORKLIST_CHANGED,
          'SupplierReturn',
          supplierReturnId,
          safeSupplierReturnSnapshot(updated),
          {
            supplierReturnId,
            goodsReceiptId: supplierReturn.goodsReceiptId.toHexString(),
            supplierId: supplierReturn.supplierId.toHexString(),
            locationId: supplierReturn.sourceLocationId.toHexString(),
          },
          safeSupplierReturnSnapshot(supplierReturn),
          input.reason,
        );

        return updated;
      },
    });
  }

  private async mutatePurchaseOrder(
    context: ProcurementCommandContext,
    purchaseOrderId: string,
    input: AcknowledgePurchaseOrderInput,
    transactionType: string,
    auditAction: string,
    outboxEvent: string,
    mutate: (
      order: PurchaseOrderRecord,
      occurredAt: Date,
      actorStaffId: string,
      transactionId: string,
      session: InventoryMongoSession,
    ) => Promise<PurchaseOrderRecord | null>,
  ): ProcurementCommandResult<PurchaseOrderRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        procurementLockKey('inventory:purchase-order', context.actor.facilityId, purchaseOrderId),
      ],
      idempotencyPayload: { purchaseOrderId, ...input },
      journalPayload: { operation: transactionType, purchaseOrderId },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const order = await this.requirePurchaseOrder(context.actor.facilityId, purchaseOrderId);
        const operational = await this.dependencies.context.resolveOperationalLocation(
          context.actor,
          order.deliveryLocationId.toHexString(),
        );
        requireAllowed(
          await this.dependencies.accessPolicy.authorize({ actor: context.actor, action: 'PROCURE' }),
          true,
        );

        const result = assertVersionedResult(
          await this.dependencies.repository.withTransaction((session) =>
            mutate(order, occurredAt, operational.actor.staffId, transaction.transactionId, session),
          ),
          'The purchase order changed before the operation could be recorded',
        );

        await this.appendAuditOutboxRealtime(
          context,
          transaction,
          operational.actor.staffId,
          occurredAt,
          auditAction,
          outboxEvent,
          INVENTORY_PROCUREMENT_REALTIME_EVENTS.PURCHASE_ORDER_WORKLIST_CHANGED,
          'PurchaseOrder',
          purchaseOrderId,
          safePurchaseOrderSnapshot(result),
          {
            purchaseOrderId,
            supplierId: order.supplierId.toHexString(),
            locationId: order.deliveryLocationId.toHexString(),
          },
          safePurchaseOrderSnapshot(order),
        );

        return result;
      },
    });
  }

  private async requireRequisition(
    facilityId: string,
    requisitionId: string,
  ): Promise<PurchaseRequisitionRecord> {
    const requisition = await this.dependencies.repository.findRequisition(
      facilityId,
      requisitionId,
    );

    if (requisition === null) {
      throw new ResourceNotFoundError('Purchase requisition was not found');
    }

    return requisition;
  }

  private async requirePurchaseOrder(
    facilityId: string,
    purchaseOrderId: string,
  ): Promise<PurchaseOrderRecord> {
    const order = await this.dependencies.repository.findPurchaseOrder(
      facilityId,
      purchaseOrderId,
    );

    if (order === null) {
      throw new ResourceNotFoundError('Purchase order was not found');
    }

    return order;
  }

  private async requireGoodsReceipt(
    facilityId: string,
    goodsReceiptId: string,
  ): Promise<GoodsReceiptRecord> {
    const receipt = await this.dependencies.repository.findGoodsReceipt(
      facilityId,
      goodsReceiptId,
    );

    if (receipt === null) {
      throw new ResourceNotFoundError('Goods receipt was not found');
    }

    return receipt;
  }

  private async requireSupplierReturn(
    facilityId: string,
    supplierReturnId: string,
  ): Promise<SupplierReturnRecord> {
    const record = await this.dependencies.repository.findSupplierReturn(
      facilityId,
      supplierReturnId,
    );

    if (record === null) {
      throw new ResourceNotFoundError('Supplier return was not found');
    }

    return record;
  }

  private loadSupplierReturnItems(
    facilityId: string,
    supplierReturnId: string,
  ) {
    return this.dependencies.repository.findSupplierReturnItems(
      facilityId,
      supplierReturnId,
    );
  }

  private async appendAuditOutboxRealtime(
    context: ProcurementCommandContext,
    transaction: InventoryProcurementTransactionContext,
    actorStaffId: string,
    occurredAt: Date,
    auditAction: string,
    outboxEvent: string,
    realtimeEvent: string,
    entityType: string,
    entityId: string,
    after: Record<string, unknown>,
    routing: Readonly<{
      requisitionId?: string;
      purchaseOrderId?: string;
      goodsReceiptId?: string;
      supplierReturnId?: string;
      supplierId?: string;
      locationId?: string;
    }>,
    before?: Record<string, unknown>,
    reason?: string,
  ): Promise<void> {
    const transactionId = transaction.transactionId;
    const auditDeduplicationKey = procurementDeduplicationKey(
      transactionId,
      auditAction,
      entityId,
    );

    await this.dependencies.audit.append({
      transactionId,
      deduplicationKey: auditDeduplicationKey,
      action: auditAction,
      entityType,
      entityId,
      actorUserId: context.actor.userId,
      actorStaffId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      occurredAt,
      ...(context.actor.ipAddress === undefined
        ? {}
        : { ipAddress: context.actor.ipAddress }),
      ...(context.actor.userAgent === undefined
        ? {}
        : { userAgent: context.actor.userAgent }),
      ...(reason === undefined ? {} : { reason }),
      ...(before === undefined ? {} : { before }),
      after,
    });

    await transaction.checkpoint(
      INVENTORY_PROCUREMENT_TRANSACTION_STATES.AUDIT_APPENDED,
      { auditAction, entityType, entityId },
    );

    await this.dependencies.outbox.enqueue({
      transactionId,
      deduplicationKey: procurementDeduplicationKey(
        transactionId,
        outboxEvent,
        entityId,
      ),
      eventType: outboxEvent,
      aggregateType: entityType,
      aggregateId: entityId,
      actorUserId: context.actor.userId,
      actorStaffId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      occurredAt,
      payload: after,
    });

    await transaction.checkpoint(
      INVENTORY_PROCUREMENT_TRANSACTION_STATES.OUTBOX_ENQUEUED,
      { outboxEvent, entityType, entityId },
    );

    await this.dependencies.realtime.publish({
      eventType: realtimeEvent,
      facilityId: context.actor.facilityId,
      ...(routing.locationId === undefined ? {} : { locationId: routing.locationId }),
      ...(routing.supplierId === undefined ? {} : { supplierId: routing.supplierId }),
      ...(routing.requisitionId === undefined
        ? {}
        : { requisitionId: routing.requisitionId }),
      ...(routing.purchaseOrderId === undefined
        ? {}
        : { purchaseOrderId: routing.purchaseOrderId }),
      ...(routing.goodsReceiptId === undefined
        ? {}
        : { goodsReceiptId: routing.goodsReceiptId }),
      ...(routing.supplierReturnId === undefined
        ? {}
        : { supplierReturnId: routing.supplierReturnId }),
      payload: after,
    });

    await transaction.checkpoint(
      INVENTORY_PROCUREMENT_TRANSACTION_STATES.REALTIME_PUBLISHED,
      { realtimeEvent, entityType, entityId },
    );
  }
}