import Decimal from 'decimal.js';
import {
  Types,
  type ClientSession,
  type Query,
} from 'mongoose';

import {
  ConcurrencyConflictError,
} from '@hospital-mis/shared';

import {
  GoodsReceiptItemModel,
  GoodsReceiptModel,
  InventoryBatchModel,
  ProcurementApprovalHistoryModel,
  PurchaseInvoiceModel,
  PurchaseOrderItemModel,
  PurchaseOrderModel,
  PurchaseRequisitionItemModel,
  PurchaseRequisitionModel,
  SupplierReturnItemModel,
  SupplierReturnModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  AcknowledgePurchaseOrderInput,
  CreatePurchaseOrderInput,
  CreatePurchaseRequisitionInput,
  DecidePurchaseRequisitionInput,
  EnterGoodsReceiptInErrorInput,
  InitiateSupplierReturnInput,
  ReceiveGoodsInput,
} from '../inventory-procurement.contracts.js';

import type {
  InventoryProcurementRepositoryPort,
} from '../inventory-procurement.ports.js';

import type {
  InventoryBatchRecord,
} from '../inventory.persistence.types.js';

import type {
  CreatedGoodsReceiptAggregate,
  CreatedPurchaseOrderAggregate,
  CreatedRequisitionAggregate,
  CreatedSupplierReturnAggregate,
  GoodsReceiptItemRecord,
  GoodsReceiptRecord,
  InventoryMongoSession,
  ProcurementApprovalHistoryRecord,
  PurchaseOrderItemRecord,
  PurchaseOrderRecord,
  PurchaseRequisitionItemRecord,
  PurchaseRequisitionRecord,
  SupplierReturnItemRecord,
  SupplierReturnRecord,
} from '../inventory-procurement.persistence.types.js';

import {
  normalizeInventoryCurrency,
  normalizeInventoryDisplayText,
  normalizeInventoryText,
  normalizeNullableInventoryText,
} from '../inventory.normalization.js';

import {
  throwMappedInventoryPersistenceError,
} from '../inventory.errors.js';

function record<T>(value: unknown): T {
  return value as T;
}

function decimal(value: string): Types.Decimal128 {
  return Types.Decimal128.fromString(value);
}

function optionalObjectId(
  value: string | null | undefined,
  path: string,
): Types.ObjectId | null {
  return value == null ? null : toObjectId(value, path);
}

function withSession<T>(
  query: Query<T, unknown>,
  session?: InventoryMongoSession,
): Query<T, unknown> {
  return session === undefined ? query : query.session(session);
}

function common(
  facilityId: string,
  actorUserId: string,
  transactionId: string,
  correlationId: string,
): Record<string, unknown> {
  const actorId = toObjectId(actorUserId, 'actorUserId');

  return {
    facilityId: toObjectId(facilityId, 'facilityId'),
    transactionId,
    correlationId,
    schemaVersion: 1,
    version: 0,
    createdBy: actorId,
    updatedBy: actorId,
  };
}

function sessionOptions(session: ClientSession) {
  return {
    session,
    ordered: true,
  } as const;
}

export class InventoryProcurementRepository
implements InventoryProcurementRepositoryPort {
  public async withTransaction<T>(
    work: (session: InventoryMongoSession) => Promise<T>,
  ): Promise<T> {
    const session = await PurchaseRequisitionModel.db.startSession();

    try {
      let result: T | undefined;

      await session.withTransaction(async () => {
        result = await work(session);
      });

      if (result === undefined) {
        throw new Error('Inventory procurement transaction completed without a result');
      }

      return result;
    } finally {
      await session.endSession();
    }
  }

  public async findRequisition(
    facilityId: string,
    requisitionId: string,
    session?: InventoryMongoSession,
  ): Promise<PurchaseRequisitionRecord | null> {
    return record<PurchaseRequisitionRecord | null>(
      await withSession(
        PurchaseRequisitionModel.findOne({
          _id: toObjectId(requisitionId, 'requisitionId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).select('+justification +notes +decisionReason +cancellationReason'),
        session,
      )
        .lean()
        .exec(),
    );
  }

  public async findRequisitionItems(
    facilityId: string,
    requisitionId: string,
    session?: InventoryMongoSession,
  ): Promise<PurchaseRequisitionItemRecord[]> {
    return record<PurchaseRequisitionItemRecord[]>(
      await withSession(
        PurchaseRequisitionItemModel.find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          purchaseRequisitionId: toObjectId(requisitionId, 'requisitionId'),
        })
          .select('+notes')
          .sort({ lineNumber: 1 }),
        session,
      )
        .lean()
        .exec(),
    );
  }

  public async createRequisitionAggregate(
    input: CreatePurchaseRequisitionInput,
    prepared: Readonly<{
      requisitionNumber: string;
      requestedByStaffId: string;
      transactionId: string;
      correlationId: string;
      occurredAt: Date;
      subtotal: string;
      taxAmount: string;
      discountAmount: string;
      netAmount: string;
      lineData: readonly {
        itemId: string;
        requestedUnitId: string;
        requestedQuantity: string;
        requestedUnitToStockFactor: string;
        requestedStockQuantity: string;
        estimatedUnitCost: string;
        estimatedTaxAmount: string;
        estimatedDiscountAmount: string;
        estimatedLineTotal: string;
        preferredSupplierId: string | null;
        notes: string | null;
      }[];
    }>,
    actorUserId: string,
    facilityId: string,
    session: InventoryMongoSession,
  ): Promise<CreatedRequisitionAggregate> {
    try {
      const requisitionId = new Types.ObjectId();
      const metadata = common(
        facilityId,
        actorUserId,
        prepared.transactionId,
        prepared.correlationId,
      );

      const [requisition] = await PurchaseRequisitionModel.create(
        [
          {
            _id: requisitionId,
            ...metadata,
            requisitionNumber: prepared.requisitionNumber,
            requestingDepartmentId: toObjectId(
              input.requestingDepartmentId,
              'requestingDepartmentId',
            ),
            requestingLocationId: toObjectId(
              input.requestingLocationId,
              'requestingLocationId',
            ),
            requestedByStaffId: toObjectId(
              prepared.requestedByStaffId,
              'requestedByStaffId',
            ),
            priority: input.priority ?? 'ROUTINE',
            needByDate: input.needByDate == null ? null : new Date(input.needByDate),
            justification: normalizeInventoryDisplayText(input.justification),
            notes: normalizeNullableInventoryText(input.notes),
            currency: normalizeInventoryCurrency(input.currency ?? 'PKR'),
            estimatedSubtotal: decimal(prepared.subtotal),
            estimatedTaxAmount: decimal(prepared.taxAmount),
            estimatedDiscountAmount: decimal(prepared.discountAmount),
            estimatedNetAmount: decimal(prepared.netAmount),
            lineCount: prepared.lineData.length,
            status: 'DRAFT',
            submittedAt: null,
            submittedByStaffId: null,
            decidedAt: null,
            decidedByStaffId: null,
            decisionReason: null,
            convertedPurchaseOrderIds: [],
            cancelledAt: null,
            cancelledByStaffId: null,
            cancellationReason: null,
            attachmentIds: (input.attachmentIds ?? []).map(
              (value) => toObjectId(value, 'attachmentIds'),
            ),
          },
        ],
        sessionOptions(session),
      );

      if (requisition === undefined) {
        throw new Error('Purchase requisition was not created');
      }

      const createdItems = await PurchaseRequisitionItemModel.create(
        prepared.lineData.map((line, index) => ({
          ...metadata,
          purchaseRequisitionId: requisitionId,
          lineNumber: index + 1,
          itemId: toObjectId(line.itemId, 'itemId'),
          requestedUnitId: toObjectId(line.requestedUnitId, 'requestedUnitId'),
          requestedQuantity: decimal(line.requestedQuantity),
          requestedUnitToStockFactor: decimal(line.requestedUnitToStockFactor),
          requestedStockQuantity: decimal(line.requestedStockQuantity),
          approvedStockQuantity: null,
          orderedStockQuantity: decimal('0'),
          estimatedUnitCost: decimal(line.estimatedUnitCost),
          estimatedTaxAmount: decimal(line.estimatedTaxAmount),
          estimatedDiscountAmount: decimal(line.estimatedDiscountAmount),
          estimatedLineTotal: decimal(line.estimatedLineTotal),
          preferredSupplierId: optionalObjectId(
            line.preferredSupplierId,
            'preferredSupplierId',
          ),
          status: 'REQUESTED',
          notes: normalizeNullableInventoryText(line.notes),
        })),
        sessionOptions(session),
      );

      return {
        requisition: record<PurchaseRequisitionRecord>(requisition.toObject()),
        items: createdItems.map((item) =>
          record<PurchaseRequisitionItemRecord>(item.toObject()),
        ),
      };
    } catch (error) {
      throwMappedInventoryPersistenceError(error);
    }
  }

  public async submitRequisition(
    facilityId: string,
    requisitionId: string,
    expectedVersion: number,
    actorUserId: string,
    actorStaffId: string,
    reason: string,
    occurredAt: Date,
    transactionId: string,
    correlationId: string,
    session: InventoryMongoSession,
  ): Promise<PurchaseRequisitionRecord | null> {
    const updated = await PurchaseRequisitionModel.findOneAndUpdate(
      {
        _id: toObjectId(requisitionId, 'requisitionId'),
        facilityId: toObjectId(facilityId, 'facilityId'),
        version: expectedVersion,
        status: 'DRAFT',
      },
      {
        $set: {
          status: 'SUBMITTED',
          submittedAt: occurredAt,
          submittedByStaffId: toObjectId(actorStaffId, 'actorStaffId'),
          updatedBy: toObjectId(actorUserId, 'actorUserId'),
        },
        $inc: { version: 1 },
      },
      { new: true, runValidators: true, session },
    )
      .select('+justification +notes +decisionReason +cancellationReason')
      .lean()
      .exec();

    if (updated === null) {
      return null;
    }

    await ProcurementApprovalHistoryModel.create(
      [
        {
          ...common(facilityId, actorUserId, transactionId, correlationId),
          documentType: 'PURCHASE_REQUISITION',
          documentId: toObjectId(requisitionId, 'requisitionId'),
          sequence: 1,
          decision: 'SUBMITTED',
          actorStaffId: toObjectId(actorStaffId, 'actorStaffId'),
          amountAtDecision: updated.estimatedNetAmount,
          actorApprovalLimit: null,
          reason: normalizeInventoryDisplayText(reason),
          documentVersion: updated.version,
          decidedAt: occurredAt,
        },
      ],
      sessionOptions(session),
    );

    return record<PurchaseRequisitionRecord>(updated);
  }

  public async decideRequisition(
    facilityId: string,
    requisition: PurchaseRequisitionRecord,
    items: readonly PurchaseRequisitionItemRecord[],
    input: DecidePurchaseRequisitionInput,
    actorUserId: string,
    actorStaffId: string,
    actorApprovalLimit: string | null,
    occurredAt: Date,
    transactionId: string,
    correlationId: string,
    session: InventoryMongoSession,
  ): Promise<{
    requisition: PurchaseRequisitionRecord | null;
    history: ProcurementApprovalHistoryRecord;
  }> {
    const decisionById = new Map(
      (input.lines ?? []).map((line) => [line.requisitionItemId, line]),
    );

    if (input.decision === 'APPROVED') {
      for (const item of items) {
        const decision = decisionById.get(item._id.toHexString());

        if (decision === undefined) {
          throw new Error('Every requisition line requires an approval decision');
        }

        await PurchaseRequisitionItemModel.updateOne(
          {
            _id: item._id,
            facilityId: toObjectId(facilityId, 'facilityId'),
            purchaseRequisitionId: requisition._id,
            version: item.version,
          },
          {
            $set: {
              approvedStockQuantity: decimal(decision.approvedStockQuantity),
              status: decision.decision,
              updatedBy: toObjectId(actorUserId, 'actorUserId'),
            },
            $inc: { version: 1 },
          },
          { session, runValidators: true },
        ).exec();
      }
    } else {
      await PurchaseRequisitionItemModel.updateMany(
        {
          facilityId: toObjectId(facilityId, 'facilityId'),
          purchaseRequisitionId: requisition._id,
          status: 'REQUESTED',
        },
        {
          $set: {
            approvedStockQuantity: decimal('0'),
            status: 'REJECTED',
            updatedBy: toObjectId(actorUserId, 'actorUserId'),
          },
          $inc: { version: 1 },
        },
        { session, runValidators: true },
      ).exec();
    }

    const updated = await PurchaseRequisitionModel.findOneAndUpdate(
      {
        _id: requisition._id,
        facilityId: toObjectId(facilityId, 'facilityId'),
        version: input.expectedVersion,
        status: 'SUBMITTED',
      },
      {
        $set: {
          status: input.decision,
          decidedAt: occurredAt,
          decidedByStaffId: toObjectId(actorStaffId, 'actorStaffId'),
          decisionReason: normalizeInventoryDisplayText(input.reason),
          updatedBy: toObjectId(actorUserId, 'actorUserId'),
        },
        $inc: { version: 1 },
      },
      { new: true, runValidators: true, session },
    )
      .select('+justification +notes +decisionReason +cancellationReason')
      .lean()
      .exec();

    if (updated === null) {
      throw new ConcurrencyConflictError(
        'The purchase requisition changed before the approval decision was persisted',
      );
    }

    const sequence = await ProcurementApprovalHistoryModel.countDocuments({
      facilityId: toObjectId(facilityId, 'facilityId'),
      documentType: 'PURCHASE_REQUISITION',
      documentId: requisition._id,
    })
      .session(session)
      .exec();

    const [history] = await ProcurementApprovalHistoryModel.create(
      [
        {
          ...common(facilityId, actorUserId, transactionId, correlationId),
          documentType: 'PURCHASE_REQUISITION',
          documentId: requisition._id,
          sequence: sequence + 1,
          decision: input.decision,
          actorStaffId: toObjectId(actorStaffId, 'actorStaffId'),
          amountAtDecision: requisition.estimatedNetAmount,
          actorApprovalLimit:
            actorApprovalLimit === null ? null : decimal(actorApprovalLimit),
          reason: normalizeInventoryDisplayText(input.reason),
          documentVersion: updated.version,
          decidedAt: occurredAt,
        },
      ],
      sessionOptions(session),
    );

    if (history === undefined) {
      throw new Error('Procurement approval history was not created');
    }

    return {
      requisition: record<PurchaseRequisitionRecord | null>(updated),
      history: record<ProcurementApprovalHistoryRecord>(history.toObject()),
    };
  }

  public async createPurchaseOrderAggregate(
    input: CreatePurchaseOrderInput,
    prepared: Readonly<{
      purchaseOrderNumber: string;
      orderedByStaffId: string;
      transactionId: string;
      correlationId: string;
      occurredAt: Date;
      subtotal: string;
      taxAmount: string;
      discountAmount: string;
      netAmount: string;
      lineData: readonly {
        requisitionItem: PurchaseRequisitionItemRecord;
        purchaseUnitId: string;
        purchaseUnitToStockFactor: string;
        orderedQuantity: string;
        orderedStockQuantity: string;
        unitCost: string;
        taxAmount: string;
        discountAmount: string;
        lineTotal: string;
        overReceiptTolerancePercent: string;
        notes: string | null;
      }[];
    }>,
    actorUserId: string,
    facilityId: string,
    session: InventoryMongoSession,
  ): Promise<CreatedPurchaseOrderAggregate> {
    try {
      const orderId = new Types.ObjectId();
      const metadata = common(
        facilityId,
        actorUserId,
        prepared.transactionId,
        prepared.correlationId,
      );

      const [order] = await PurchaseOrderModel.create(
        [
          {
            _id: orderId,
            ...metadata,
            purchaseOrderNumber: prepared.purchaseOrderNumber,
            purchaseRequisitionId: toObjectId(input.requisitionId, 'requisitionId'),
            supplierId: toObjectId(input.supplierId, 'supplierId'),
            deliveryLocationId: toObjectId(input.deliveryLocationId, 'deliveryLocationId'),
            orderedByStaffId: toObjectId(prepared.orderedByStaffId, 'orderedByStaffId'),
            currency: normalizeInventoryCurrency(input.currency ?? 'PKR'),
            subtotal: decimal(prepared.subtotal),
            taxAmount: decimal(prepared.taxAmount),
            discountAmount: decimal(prepared.discountAmount),
            netAmount: decimal(prepared.netAmount),
            lineCount: prepared.lineData.length,
            openLineCount: prepared.lineData.length,
            status: 'ISSUED',
            orderedAt: prepared.occurredAt,
            expectedDeliveryDate: new Date(input.expectedDeliveryDate),
            supplierAcknowledgementStatus: 'PENDING',
            supplierAcknowledgementReference: null,
            supplierAcknowledgedAt: null,
            supplierAcknowledgedBy: null,
            supplierAcknowledgementNotes: null,
            termsAndConditions: normalizeNullableInventoryText(input.termsAndConditions),
            notes: normalizeNullableInventoryText(input.notes),
            cancelledAt: null,
            cancelledByStaffId: null,
            cancellationReason: null,
            attachmentIds: (input.attachmentIds ?? []).map(
              (value) => toObjectId(value, 'attachmentIds'),
            ),
          },
        ],
        sessionOptions(session),
      );

      if (order === undefined) {
        throw new Error('Purchase order was not created');
      }

      const createdItems = await PurchaseOrderItemModel.create(
        prepared.lineData.map((line, index) => ({
          ...metadata,
          purchaseOrderId: orderId,
          purchaseRequisitionItemId: line.requisitionItem._id,
          lineNumber: index + 1,
          itemId: line.requisitionItem.itemId,
          purchaseUnitId: toObjectId(line.purchaseUnitId, 'purchaseUnitId'),
          purchaseUnitToStockFactor: decimal(line.purchaseUnitToStockFactor),
          orderedQuantity: decimal(line.orderedQuantity),
          orderedStockQuantity: decimal(line.orderedStockQuantity),
          unitCost: decimal(line.unitCost),
          taxAmount: decimal(line.taxAmount),
          discountAmount: decimal(line.discountAmount),
          lineTotal: decimal(line.lineTotal),
          receivedStockQuantity: decimal('0'),
          acceptedStockQuantity: decimal('0'),
          rejectedStockQuantity: decimal('0'),
          damagedStockQuantity: decimal('0'),
          quarantinedStockQuantity: decimal('0'),
          overReceiptTolerancePercent: decimal(line.overReceiptTolerancePercent),
          status: 'OPEN',
          notes: normalizeNullableInventoryText(line.notes),
        })),
        sessionOptions(session),
      );

      for (const line of prepared.lineData) {
        const currentOrdered = new Decimal(
          line.requisitionItem.orderedStockQuantity.toString(),
        );
        const nextOrdered = currentOrdered.plus(line.orderedStockQuantity);
        const approved = new Decimal(
          line.requisitionItem.approvedStockQuantity?.toString() ?? '0',
        );

        const itemUpdate = await PurchaseRequisitionItemModel.updateOne(
          {
            _id: line.requisitionItem._id,
            facilityId: toObjectId(facilityId, 'facilityId'),
            version: line.requisitionItem.version,
            status: 'APPROVED',
          },
          {
            $set: {
              orderedStockQuantity: decimal(nextOrdered.toFixed()),
              status: nextOrdered.gte(approved) ? 'ORDERED' : 'APPROVED',
              updatedBy: toObjectId(actorUserId, 'actorUserId'),
            },
            $inc: { version: 1 },
          },
          { session, runValidators: true },
        ).exec();

        if (itemUpdate.modifiedCount !== 1) {
          throw new ConcurrencyConflictError(
            'A requisition line changed before the purchase order was created',
          );
        }
      }

      const remainingApprovedLines = await PurchaseRequisitionItemModel.countDocuments({
        facilityId: toObjectId(facilityId, 'facilityId'),
        purchaseRequisitionId: toObjectId(input.requisitionId, 'requisitionId'),
        status: 'APPROVED',
      })
        .session(session)
        .exec();

      const requisitionUpdate = await PurchaseRequisitionModel.updateOne(
        {
          _id: toObjectId(input.requisitionId, 'requisitionId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          status: { $in: ['APPROVED', 'PARTIALLY_CONVERTED'] },
        },
        {
          $set: {
            status: remainingApprovedLines === 0 ? 'CONVERTED' : 'PARTIALLY_CONVERTED',
            updatedBy: toObjectId(actorUserId, 'actorUserId'),
          },
          $push: {
            convertedPurchaseOrderIds: orderId,
          },
          $inc: { version: 1 },
        },
        { session, runValidators: true },
      ).exec();

      if (requisitionUpdate.modifiedCount !== 1) {
        throw new ConcurrencyConflictError(
          'The requisition changed before purchase-order conversion was finalized',
        );
      }

      return {
        purchaseOrder: record<PurchaseOrderRecord>(order.toObject()),
        items: createdItems.map((item) => record<PurchaseOrderItemRecord>(item.toObject())),
      };
    } catch (error) {
      throwMappedInventoryPersistenceError(error);
    }
  }

  public async findPurchaseOrder(
    facilityId: string,
    purchaseOrderId: string,
    session?: InventoryMongoSession,
  ): Promise<PurchaseOrderRecord | null> {
    return record<PurchaseOrderRecord | null>(
      await withSession(
        PurchaseOrderModel.findOne({
          _id: toObjectId(purchaseOrderId, 'purchaseOrderId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).select(
          '+supplierAcknowledgedBy +supplierAcknowledgementNotes +termsAndConditions +notes +cancellationReason',
        ),
        session,
      )
        .lean()
        .exec(),
    );
  }

  public async findPurchaseOrderItems(
    facilityId: string,
    purchaseOrderId: string,
    session?: InventoryMongoSession,
  ): Promise<PurchaseOrderItemRecord[]> {
    return record<PurchaseOrderItemRecord[]>(
      await withSession(
        PurchaseOrderItemModel.find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          purchaseOrderId: toObjectId(purchaseOrderId, 'purchaseOrderId'),
        })
          .select('+notes')
          .sort({ lineNumber: 1 }),
        session,
      )
        .lean()
        .exec(),
    );
  }

  public async countReceiptsForOrder(
    facilityId: string,
    purchaseOrderId: string,
    session?: InventoryMongoSession,
  ): Promise<number> {
    return withSession(
      GoodsReceiptModel.countDocuments({
        facilityId: toObjectId(facilityId, 'facilityId'),
        purchaseOrderId: toObjectId(purchaseOrderId, 'purchaseOrderId'),
        status: { $nin: ['CANCELLED', 'ENTERED_IN_ERROR'] },
      }),
      session,
    ).exec();
  }

  public async acknowledgePurchaseOrder(
    facilityId: string,
    purchaseOrderId: string,
    input: AcknowledgePurchaseOrderInput,
    actorUserId: string,
    actorStaffId: string,
    occurredAt: Date,
    session: InventoryMongoSession,
  ): Promise<PurchaseOrderRecord | null> {
    const setValues: Record<string, unknown> = {
      supplierAcknowledgementStatus: input.acknowledgementStatus,
      supplierAcknowledgementReference: normalizeInventoryDisplayText(
        input.acknowledgementReference,
      ),
      supplierAcknowledgedAt: occurredAt,
      supplierAcknowledgedBy: normalizeNullableInventoryText(input.acknowledgedBy),
      supplierAcknowledgementNotes: normalizeNullableInventoryText(
        input.acknowledgementNotes,
      ),
      status:
        input.acknowledgementStatus === 'REJECTED'
          ? 'CANCELLED'
          : 'ACKNOWLEDGED',
      updatedBy: toObjectId(actorUserId, 'actorUserId'),
    };

    if (input.revisedExpectedDeliveryDate != null) {
      setValues['expectedDeliveryDate'] = new Date(input.revisedExpectedDeliveryDate);
    }

    if (input.acknowledgementStatus === 'REJECTED') {
      setValues['cancelledAt'] = occurredAt;
      setValues['cancelledByStaffId'] = toObjectId(actorStaffId, 'actorStaffId');
      setValues['cancellationReason'] =
        normalizeNullableInventoryText(input.acknowledgementNotes) ??
        'Supplier rejected purchase order';
    }

    return record<PurchaseOrderRecord | null>(
      await PurchaseOrderModel.findOneAndUpdate(
        {
          _id: toObjectId(purchaseOrderId, 'purchaseOrderId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: input.expectedVersion,
          status: { $in: ['ISSUED', 'ACKNOWLEDGED'] },
        },
        {
          $set: setValues,
          $inc: { version: 1 },
        },
        { new: true, runValidators: true, session },
      )
        .select(
          '+supplierAcknowledgedBy +supplierAcknowledgementNotes +termsAndConditions +notes +cancellationReason',
        )
        .lean()
        .exec(),
    );
  }

  public async cancelPurchaseOrder(
    facilityId: string,
    purchaseOrderId: string,
    expectedVersion: number,
    actorUserId: string,
    actorStaffId: string,
    reason: string,
    occurredAt: Date,
    session: InventoryMongoSession,
  ): Promise<PurchaseOrderRecord | null> {
    const updated = await PurchaseOrderModel.findOneAndUpdate(
      {
        _id: toObjectId(purchaseOrderId, 'purchaseOrderId'),
        facilityId: toObjectId(facilityId, 'facilityId'),
        version: expectedVersion,
        status: { $in: ['ISSUED', 'ACKNOWLEDGED'] },
      },
      {
        $set: {
          status: 'CANCELLED',
          cancelledAt: occurredAt,
          cancelledByStaffId: toObjectId(actorStaffId, 'actorStaffId'),
          cancellationReason: normalizeInventoryDisplayText(reason),
          updatedBy: toObjectId(actorUserId, 'actorUserId'),
        },
        $inc: { version: 1 },
      },
      { new: true, runValidators: true, session },
    )
      .select(
        '+supplierAcknowledgedBy +supplierAcknowledgementNotes +termsAndConditions +notes +cancellationReason',
      )
      .lean()
      .exec();

    if (updated !== null) {
      await PurchaseOrderItemModel.updateMany(
        {
          facilityId: toObjectId(facilityId, 'facilityId'),
          purchaseOrderId: toObjectId(purchaseOrderId, 'purchaseOrderId'),
          status: 'OPEN',
        },
        {
          $set: {
            status: 'CANCELLED',
            updatedBy: toObjectId(actorUserId, 'actorUserId'),
          },
          $inc: { version: 1 },
        },
        { session, runValidators: true },
      ).exec();
    }

    return record<PurchaseOrderRecord | null>(updated);
  }


  public async findInventoryBatchByNumber(
    facilityId: string,
    itemId: string,
    manufacturerBatchNumber: string,
    session?: InventoryMongoSession,
  ): Promise<InventoryBatchRecord | null> {
    return record<InventoryBatchRecord | null>(
      await withSession(
        InventoryBatchModel.findOne({
          facilityId: toObjectId(facilityId, 'facilityId'),
          itemId: toObjectId(itemId, 'itemId'),
          normalizedBatchNumber: normalizeInventoryText(manufacturerBatchNumber),
        }),
        session,
      )
        .lean()
        .exec(),
    );
  }

  public async createGoodsReceiptAggregate(
    input: ReceiveGoodsInput,
    prepared: Readonly<{
      goodsReceiptNumber: string;
      purchaseInvoiceReference: string | null;
      receivedByStaffId: string;
      transactionId: string;
      correlationId: string;
      occurredAt: Date;
      purchaseOrder: PurchaseOrderRecord;
      subtotal: string;
      taxAmount: string;
      discountAmount: string;
      netAmount: string;
      totalReceivedStockQuantity: string;
      totalAcceptedStockQuantity: string;
      totalRejectedStockQuantity: string;
      totalDamagedStockQuantity: string;
      totalQuarantinedStockQuantity: string;
      lineData: readonly {
        purchaseOrderItem: PurchaseOrderItemRecord;
        inventoryBatchId: string;
        createInventoryBatch: boolean;
        batchStatus: 'ACTIVE' | 'QUARANTINED' | 'RECALLED' | 'EXPIRED' | 'DEPLETED' | 'BLOCKED';
        receivedUnitToStockFactor: string;
        receivedStockQuantity: string;
        acceptedStockQuantity: string;
        rejectedStockQuantity: string;
        damagedStockQuantity: string;
        quarantinedStockQuantity: string;
        lineTotal: string;
      }[];
    }>,
    actorUserId: string,
    facilityId: string,
    session: InventoryMongoSession,
  ): Promise<CreatedGoodsReceiptAggregate> {
    try {
      const receiptId = new Types.ObjectId();
      const invoiceId = input.purchaseInvoice === undefined ? null : new Types.ObjectId();
      const metadata = common(
        facilityId,
        actorUserId,
        prepared.transactionId,
        prepared.correlationId,
      );

      const [receipt] = await GoodsReceiptModel.create(
        [
          {
            _id: receiptId,
            ...metadata,
            goodsReceiptNumber: prepared.goodsReceiptNumber,
            purchaseOrderId: prepared.purchaseOrder._id,
            supplierId: prepared.purchaseOrder.supplierId,
            receivingLocationId: toObjectId(input.receivingLocationId, 'receivingLocationId'),
            receivedByStaffId: toObjectId(prepared.receivedByStaffId, 'receivedByStaffId'),
            inspectedByStaffId: toObjectId(prepared.receivedByStaffId, 'receivedByStaffId'),
            receivedAt: input.receivedAt === undefined ? prepared.occurredAt : new Date(input.receivedAt),
            inspectedAt: prepared.occurredAt,
            supplierDeliveryReference: normalizeNullableInventoryText(
              input.supplierDeliveryReference,
            ),
            supplierInvoiceNumber:
              input.purchaseInvoice?.supplierInvoiceNumber ?? null,
            purchaseInvoiceId: invoiceId,
            currency: prepared.purchaseOrder.currency,
            subtotal: decimal(prepared.subtotal),
            taxAmount: decimal(prepared.taxAmount),
            discountAmount: decimal(prepared.discountAmount),
            netAmount: decimal(prepared.netAmount),
            totalReceivedStockQuantity: decimal(prepared.totalReceivedStockQuantity),
            totalAcceptedStockQuantity: decimal(prepared.totalAcceptedStockQuantity),
            totalRejectedStockQuantity: decimal(prepared.totalRejectedStockQuantity),
            totalDamagedStockQuantity: decimal(prepared.totalDamagedStockQuantity),
            totalQuarantinedStockQuantity: decimal(prepared.totalQuarantinedStockQuantity),
            lineCount: prepared.lineData.length,
            inspectionStatus: input.inspectionStatus,
            status: 'STOCK_POSTING_PENDING',
            notes: normalizeNullableInventoryText(input.notes),
            correctionOfGoodsReceiptId: null,
            correctedByGoodsReceiptId: null,
            enteredInErrorAt: null,
            enteredInErrorByStaffId: null,
            enteredInErrorReason: null,
            stockPostingTransactionId: null,
            postedAt: null,
            attachmentIds: (input.attachmentIds ?? []).map(
              (value) => toObjectId(value, 'attachmentIds'),
            ),
          },
        ],
        sessionOptions(session),
      );

      if (receipt === undefined) {
        throw new Error('Goods receipt was not created');
      }

      const receiptItemIds = prepared.lineData.map(() => new Types.ObjectId());

      const newBatchDocuments = prepared.lineData.flatMap((line, index) => {
        if (!line.createInventoryBatch) {
          return [];
        }

        const inputLine = input.lines[index];

        if (inputLine === undefined) {
          throw new Error('Receipt line preparation is inconsistent');
        }

        return [{
            _id: toObjectId(line.inventoryBatchId, 'inventoryBatchId'),
            facilityId: toObjectId(facilityId, 'facilityId'),
            itemId: line.purchaseOrderItem.itemId,
            supplierId: prepared.purchaseOrder.supplierId,
            batchNumber: normalizeInventoryDisplayText(inputLine.manufacturerBatchNumber),
            manufacturerName: normalizeNullableInventoryText(inputLine.manufacturerName),
            manufacturerBatchNumber: normalizeInventoryDisplayText(
              inputLine.manufacturerBatchNumber,
            ),
            normalizedBatchNumber: normalizeInventoryText(
              inputLine.manufacturerBatchNumber,
            ),
            manufactureDate:
              inputLine.manufactureDate == null ? null : new Date(inputLine.manufactureDate),
            expiryDate: inputLine.expiryDate == null ? null : new Date(inputLine.expiryDate),
            costPrice: decimal(inputLine.unitCost),
            sellingPrice: decimal(inputLine.unitCost),
            currency: prepared.purchaseOrder.currency,
            goodsReceiptId: receiptId,
            goodsReceiptItemId: receiptItemIds[index],
            inspectionStatus: input.inspectionStatus,
            status: line.batchStatus,
            quarantineAt:
              line.batchStatus === 'QUARANTINED' ? prepared.occurredAt : null,
            quarantinedBy:
              line.batchStatus === 'QUARANTINED'
                ? toObjectId(actorUserId, 'actorUserId')
                : null,
            quarantineReason:
              line.batchStatus === 'QUARANTINED'
                ? 'Stock quarantined during goods-receipt inspection'
                : null,
            releasedFromQuarantineAt: null,
            releasedFromQuarantineBy: null,
            quarantineReleaseReason: null,
            recallStatus: 'NONE',
            recallReference: null,
            recalledAt: null,
            recalledBy: null,
            recallReason: null,
            blockedAt:
              ['BLOCKED', 'EXPIRED'].includes(line.batchStatus)
                ? prepared.occurredAt
                : null,
            blockedBy:
              ['BLOCKED', 'EXPIRED'].includes(line.batchStatus)
                ? toObjectId(actorUserId, 'actorUserId')
                : null,
            blockedReason:
              line.batchStatus === 'EXPIRED'
                ? 'Expired at receipt'
                : line.batchStatus === 'BLOCKED'
                  ? 'Rejected or damaged stock received'
                  : null,
            enteredInErrorAt: null,
            enteredInErrorBy: null,
            enteredInErrorReason: null,
            transactionId: prepared.transactionId,
            correlationId: prepared.correlationId,
            schemaVersion: 1,
            version: 0,
            createdBy: toObjectId(actorUserId, 'actorUserId'),
            updatedBy: toObjectId(actorUserId, 'actorUserId'),
          }];
      });

      if (newBatchDocuments.length > 0) {
        await InventoryBatchModel.create(
          newBatchDocuments,
          sessionOptions(session),
        );
      }

      const createdItems = await GoodsReceiptItemModel.create(
        prepared.lineData.map((line, index) => {
          const inputLine = input.lines[index];

          if (inputLine === undefined) {
            throw new Error('Receipt line preparation is inconsistent');
          }

          return {
            _id: receiptItemIds[index],
            ...metadata,
            goodsReceiptId: receiptId,
            purchaseOrderItemId: line.purchaseOrderItem._id,
            lineNumber: index + 1,
            itemId: line.purchaseOrderItem.itemId,
            receivedUnitId: toObjectId(inputLine.receivedUnitId, 'receivedUnitId'),
            receivedUnitToStockFactor: decimal(line.receivedUnitToStockFactor),
            receivedQuantity: decimal(inputLine.receivedQuantity),
            receivedStockQuantity: decimal(line.receivedStockQuantity),
            acceptedStockQuantity: decimal(line.acceptedStockQuantity),
            rejectedStockQuantity: decimal(line.rejectedStockQuantity),
            damagedStockQuantity: decimal(line.damagedStockQuantity),
            quarantinedStockQuantity: decimal(line.quarantinedStockQuantity),
            manufacturerName: normalizeNullableInventoryText(inputLine.manufacturerName),
            manufacturerBatchNumber: normalizeInventoryDisplayText(
              inputLine.manufacturerBatchNumber,
            ),
            manufactureDate:
              inputLine.manufactureDate == null ? null : new Date(inputLine.manufactureDate),
            expiryDate: inputLine.expiryDate == null ? null : new Date(inputLine.expiryDate),
            unitCost: decimal(inputLine.unitCost),
            taxAmount: decimal(inputLine.taxAmount ?? '0'),
            discountAmount: decimal(inputLine.discountAmount ?? '0'),
            lineTotal: decimal(line.lineTotal),
            inventoryBatchId: toObjectId(line.inventoryBatchId, 'inventoryBatchId'),
            inspectionNotes: normalizeNullableInventoryText(inputLine.inspectionNotes),
          };
        }),
        sessionOptions(session),
      );

      for (const line of prepared.lineData) {
        const currentReceived = new Decimal(
          line.purchaseOrderItem.receivedStockQuantity.toString(),
        );
        const newReceived = currentReceived.plus(line.receivedStockQuantity);
        const ordered = new Decimal(line.purchaseOrderItem.orderedStockQuantity.toString());
        const status = newReceived.gte(ordered) ? 'RECEIVED' : 'PARTIALLY_RECEIVED';

        const orderItemUpdate = await PurchaseOrderItemModel.updateOne(
          {
            _id: line.purchaseOrderItem._id,
            facilityId: toObjectId(facilityId, 'facilityId'),
            version: line.purchaseOrderItem.version,
          },
          {
            $set: {
              receivedStockQuantity: decimal(newReceived.toFixed()),
              status,
              updatedBy: toObjectId(actorUserId, 'actorUserId'),
            },
            $inc: {
              acceptedStockQuantity: decimal(line.acceptedStockQuantity),
              rejectedStockQuantity: decimal(line.rejectedStockQuantity),
              damagedStockQuantity: decimal(line.damagedStockQuantity),
              quarantinedStockQuantity: decimal(line.quarantinedStockQuantity),
              version: 1,
            },
          },
          { session, runValidators: true },
        ).exec();

        if (orderItemUpdate.modifiedCount !== 1) {
          throw new ConcurrencyConflictError(
            'A purchase-order line changed before receipt posting was completed',
          );
        }
      }

      const openLineCount = await PurchaseOrderItemModel.countDocuments({
        facilityId: toObjectId(facilityId, 'facilityId'),
        purchaseOrderId: prepared.purchaseOrder._id,
        status: { $in: ['OPEN', 'PARTIALLY_RECEIVED'] },
      })
        .session(session)
        .exec();

      const orderUpdate = await PurchaseOrderModel.updateOne(
        {
          _id: prepared.purchaseOrder._id,
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: prepared.purchaseOrder.version,
        },
        {
          $set: {
            status: openLineCount === 0 ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
            openLineCount,
            updatedBy: toObjectId(actorUserId, 'actorUserId'),
          },
          $inc: { version: 1 },
        },
        { session, runValidators: true },
      ).exec();

      if (orderUpdate.modifiedCount !== 1) {
        throw new ConcurrencyConflictError(
          'The purchase order changed before receipt posting was finalized',
        );
      }

      let invoiceRecord = null;

      if (input.purchaseInvoice !== undefined && invoiceId !== null) {
        const [invoice] = await PurchaseInvoiceModel.create(
          [
            {
              _id: invoiceId,
              ...metadata,
              internalInvoiceReference: prepared.purchaseInvoiceReference,
              supplierInvoiceNumber: normalizeInventoryDisplayText(
                input.purchaseInvoice.supplierInvoiceNumber,
              ),
              normalizedSupplierInvoiceNumber: normalizeInventoryText(
                input.purchaseInvoice.supplierInvoiceNumber,
              ),
              supplierId: prepared.purchaseOrder.supplierId,
              purchaseOrderId: prepared.purchaseOrder._id,
              goodsReceiptId: receiptId,
              invoiceDate: new Date(input.purchaseInvoice.invoiceDate),
              dueDate:
                input.purchaseInvoice.dueDate == null
                  ? null
                  : new Date(input.purchaseInvoice.dueDate),
              currency: normalizeInventoryCurrency(
                input.purchaseInvoice.currency ?? prepared.purchaseOrder.currency,
              ),
              subtotal: decimal(input.purchaseInvoice.subtotal),
              taxAmount: decimal(input.purchaseInvoice.taxAmount ?? '0'),
              discountAmount: decimal(input.purchaseInvoice.discountAmount ?? '0'),
              netAmount: decimal(input.purchaseInvoice.netAmount),
              status: input.purchaseInvoice.status ?? 'REGISTERED',
              discrepancyReason: normalizeNullableInventoryText(
                input.purchaseInvoice.discrepancyReason,
              ),
              attachmentIds: (input.purchaseInvoice.attachmentIds ?? []).map(
                (value) => toObjectId(value, 'purchaseInvoice.attachmentIds'),
              ),
            },
          ],
          sessionOptions(session),
        );

        invoiceRecord = invoice?.toObject() ?? null;
      }

      return {
        goodsReceipt: record<GoodsReceiptRecord>(receipt.toObject()),
        items: createdItems.map((item) => record<GoodsReceiptItemRecord>(item.toObject())),
        purchaseInvoice: record(invoiceRecord),
      };
    } catch (error) {
      throwMappedInventoryPersistenceError(error);
    }
  }

  public async markGoodsReceiptPosted(
    facilityId: string,
    goodsReceiptId: string,
    expectedVersion: number,
    stockPostingTransactionId: string,
    actorUserId: string,
    occurredAt: Date,
    session: InventoryMongoSession,
  ): Promise<GoodsReceiptRecord | null> {
    return record<GoodsReceiptRecord | null>(
      await GoodsReceiptModel.findOneAndUpdate(
        {
          _id: toObjectId(goodsReceiptId, 'goodsReceiptId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: expectedVersion,
          status: 'STOCK_POSTING_PENDING',
        },
        {
          $set: {
            status: 'POSTED',
            stockPostingTransactionId,
            postedAt: occurredAt,
            updatedBy: toObjectId(actorUserId, 'actorUserId'),
          },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true, session },
      )
        .select('+notes +enteredInErrorReason')
        .lean()
        .exec(),
    );
  }

  public async findGoodsReceipt(
    facilityId: string,
    goodsReceiptId: string,
    session?: InventoryMongoSession,
  ): Promise<GoodsReceiptRecord | null> {
    return record<GoodsReceiptRecord | null>(
      await withSession(
        GoodsReceiptModel.findOne({
          _id: toObjectId(goodsReceiptId, 'goodsReceiptId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).select('+notes +enteredInErrorReason'),
        session,
      )
        .lean()
        .exec(),
    );
  }

  public async findGoodsReceiptItems(
    facilityId: string,
    goodsReceiptId: string,
    session?: InventoryMongoSession,
  ): Promise<GoodsReceiptItemRecord[]> {
    return record<GoodsReceiptItemRecord[]>(
      await withSession(
        GoodsReceiptItemModel.find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          goodsReceiptId: toObjectId(goodsReceiptId, 'goodsReceiptId'),
        })
          .select('+inspectionNotes')
          .sort({ lineNumber: 1 }),
        session,
      )
        .lean()
        .exec(),
    );
  }

  public async countActiveSupplierReturnsForReceipt(
    facilityId: string,
    goodsReceiptId: string,
    session?: InventoryMongoSession,
  ): Promise<number> {
    return withSession(
      SupplierReturnModel.countDocuments({
        facilityId: toObjectId(facilityId, 'facilityId'),
        goodsReceiptId: toObjectId(goodsReceiptId, 'goodsReceiptId'),
        status: { $ne: 'CANCELLED' },
      }),
      session,
    ).exec();
  }

  public async sumPreviouslyReturnedQuantity(
    facilityId: string,
    goodsReceiptItemId: string,
    session?: InventoryMongoSession,
  ): Promise<string> {
    const aggregate = SupplierReturnItemModel.aggregate<{ total: Types.Decimal128 }>([
      {
        $match: {
          facilityId: toObjectId(facilityId, 'facilityId'),
          goodsReceiptItemId: toObjectId(goodsReceiptItemId, 'goodsReceiptItemId'),
        },
      },
      {
        $lookup: {
          from: 'supplierReturns',
          localField: 'supplierReturnId',
          foreignField: '_id',
          as: 'return',
        },
      },
      { $unwind: '$return' },
      {
        $match: {
          'return.status': { $ne: 'CANCELLED' },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$returnStockQuantity' },
        },
      },
    ]);

    if (session !== undefined) {
      aggregate.session(session);
    }

    const [result] = await aggregate.exec();
    return result?.total.toString() ?? '0';
  }

  public async enterGoodsReceiptInError(
    facilityId: string,
    goodsReceiptId: string,
    input: EnterGoodsReceiptInErrorInput,
    actorUserId: string,
    actorStaffId: string,
    occurredAt: Date,
    transactionId: string,
    session: InventoryMongoSession,
  ): Promise<GoodsReceiptRecord | null> {
    return record<GoodsReceiptRecord | null>(
      await GoodsReceiptModel.findOneAndUpdate(
        {
          _id: toObjectId(goodsReceiptId, 'goodsReceiptId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: input.expectedVersion,
          status: 'POSTED',
        },
        {
          $set: {
            status: 'ENTERED_IN_ERROR',
            enteredInErrorAt: occurredAt,
            enteredInErrorByStaffId: toObjectId(actorStaffId, 'actorStaffId'),
            enteredInErrorReason: normalizeInventoryDisplayText(input.reason),
            stockPostingTransactionId: transactionId,
            updatedBy: toObjectId(actorUserId, 'actorUserId'),
          },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true, session },
      )
        .select('+notes +enteredInErrorReason')
        .lean()
        .exec(),
    );
  }

  public async createSupplierReturnAggregate(
    input: InitiateSupplierReturnInput,
    prepared: Readonly<{
      supplierReturnNumber: string;
      supplierId: string;
      initiatedByStaffId: string;
      transactionId: string;
      correlationId: string;
      occurredAt: Date;
      totalStockQuantity: string;
      lineData: readonly {
        receiptItem: GoodsReceiptItemRecord;
        returnStockQuantity: string;
        reasonCode: string;
        condition: string;
        notes: string | null;
      }[];
    }>,
    actorUserId: string,
    facilityId: string,
    session: InventoryMongoSession,
  ): Promise<CreatedSupplierReturnAggregate> {
    try {
      const supplierReturnId = new Types.ObjectId();
      const metadata = common(
        facilityId,
        actorUserId,
        prepared.transactionId,
        prepared.correlationId,
      );

      const [supplierReturn] = await SupplierReturnModel.create(
        [
          {
            _id: supplierReturnId,
            ...metadata,
            supplierReturnNumber: prepared.supplierReturnNumber,
            supplierId: toObjectId(prepared.supplierId, 'supplierId'),
            goodsReceiptId: toObjectId(input.goodsReceiptId, 'goodsReceiptId'),
            sourceLocationId: toObjectId(input.sourceLocationId, 'sourceLocationId'),
            initiatedByStaffId: toObjectId(prepared.initiatedByStaffId, 'initiatedByStaffId'),
            approvedByStaffId: null,
            approvedAt: null,
            status: 'DRAFT',
            reason: normalizeInventoryDisplayText(input.reason),
            lineCount: prepared.lineData.length,
            totalStockQuantity: decimal(prepared.totalStockQuantity),
            dispatchedAt: null,
            dispatchedByStaffId: null,
            supplierAcknowledgementReference: null,
            acknowledgedAt: null,
            cancelledAt: null,
            cancelledByStaffId: null,
            cancellationReason: null,
            attachmentIds: (input.attachmentIds ?? []).map(
              (value) => toObjectId(value, 'attachmentIds'),
            ),
          },
        ],
        sessionOptions(session),
      );

      if (supplierReturn === undefined) {
        throw new Error('Supplier return was not created');
      }

      const items = await SupplierReturnItemModel.create(
        prepared.lineData.map((line, index) => ({
          ...metadata,
          supplierReturnId,
          goodsReceiptItemId: line.receiptItem._id,
          lineNumber: index + 1,
          itemId: line.receiptItem.itemId,
          batchId: line.receiptItem.inventoryBatchId,
          returnStockQuantity: decimal(line.returnStockQuantity),
          reasonCode: line.reasonCode,
          condition: line.condition,
          notes: normalizeNullableInventoryText(line.notes),
        })),
        sessionOptions(session),
      );

      return {
        supplierReturn: record<SupplierReturnRecord>(supplierReturn.toObject()),
        items: items.map((item) => record(item.toObject())),
      };
    } catch (error) {
      throwMappedInventoryPersistenceError(error);
    }
  }


  public async findSupplierReturn(
    facilityId: string,
    supplierReturnId: string,
    session?: InventoryMongoSession,
  ): Promise<SupplierReturnRecord | null> {
    return record<SupplierReturnRecord | null>(
      await withSession(
        SupplierReturnModel.findOne({
          _id: toObjectId(supplierReturnId, 'supplierReturnId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).select('+reason +cancellationReason'),
        session,
      )
        .lean()
        .exec(),
    );
  }

  public async findSupplierReturnItems(
    facilityId: string,
    supplierReturnId: string,
    session?: InventoryMongoSession,
  ) {
    return record<SupplierReturnItemRecord[]>(
      await withSession(
        SupplierReturnItemModel.find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          supplierReturnId: toObjectId(supplierReturnId, 'supplierReturnId'),
        })
          .select('+notes')
          .sort({ lineNumber: 1 }),
        session,
      )
        .lean()
        .exec(),
    );
  }

  public async approveSupplierReturn(
    facilityId: string,
    supplierReturnId: string,
    expectedVersion: number,
    actorUserId: string,
    actorStaffId: string,
    occurredAt: Date,
    session: InventoryMongoSession,
  ): Promise<SupplierReturnRecord | null> {
    return record<SupplierReturnRecord | null>(
      await SupplierReturnModel.findOneAndUpdate(
        {
          _id: toObjectId(supplierReturnId, 'supplierReturnId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: expectedVersion,
          status: 'DRAFT',
          initiatedByStaffId: { $ne: toObjectId(actorStaffId, 'actorStaffId') },
        },
        {
          $set: {
            status: 'APPROVED',
            approvedByStaffId: toObjectId(actorStaffId, 'actorStaffId'),
            approvedAt: occurredAt,
            updatedBy: toObjectId(actorUserId, 'actorUserId'),
          },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true, session },
      )
        .select('+reason +cancellationReason')
        .lean()
        .exec(),
    );
  }
}