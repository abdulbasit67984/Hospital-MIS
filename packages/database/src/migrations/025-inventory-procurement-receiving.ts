import type {
  Db,
  IndexDescription,
} from 'mongodb';

import {
  collectionSpecs,
  type HospitalCollectionName,
} from '../catalog/collection-specs.js';

import {
  ProcurementApprovalHistoryModel,
  PurchaseInvoiceModel,
  PurchaseOrderItemModel,
  PurchaseOrderModel,
  PurchaseRequisitionItemModel,
  PurchaseRequisitionModel,
  procurementApprovalDecisionValues,
  procurementDocumentTypeValues,
  purchaseInvoiceStatusValues,
  purchaseOrderItemStatusValues,
  purchaseOrderStatusValues,
  purchaseRequisitionItemStatusValues,
  purchaseRequisitionPriorityValues,
  purchaseRequisitionStatusValues,
  supplierAcknowledgementStatusValues,
} from '../models/inventory-procurement.model.js';

import {
  GoodsReceiptItemModel,
  GoodsReceiptModel,
  SupplierReturnItemModel,
  SupplierReturnModel,
  goodsReceiptInspectionStatusValues,
  goodsReceiptStatusValues,
  supplierReturnConditionValues,
  supplierReturnReasonValues,
  supplierReturnStatusValues,
} from '../models/inventory-receipt.model.js';

import type {
  Migration,
} from './types.js';

export const inventoryProcurementReceivingCollections = [
  'purchaseRequisitions',
  'purchaseRequisitionItems',
  'procurementApprovalHistories',
  'purchaseOrders',
  'purchaseOrderItems',
  'goodsReceipts',
  'goodsReceiptItems',
  'purchaseInvoices',
  'supplierReturns',
  'supplierReturnItems',
] as const satisfies readonly HospitalCollectionName[];

type ProcurementCollection =
  (typeof inventoryProcurementReceivingCollections)[number];

const objectId = {
  bsonType: 'objectId',
} as const;

const nullableObjectId = {
  bsonType: [
    'objectId',
    'null',
  ],
} as const;

const string = {
  bsonType: 'string',
} as const;

const nullableString = {
  bsonType: [
    'string',
    'null',
  ],
} as const;

const date = {
  bsonType: 'date',
} as const;

const nullableDate = {
  bsonType: [
    'date',
    'null',
  ],
} as const;

const number = {
  bsonType: 'number',
} as const;

const decimal = {
  bsonType: 'decimal',
} as const;

const nullableDecimal = {
  bsonType: [
    'decimal',
    'null',
  ],
} as const;

const objectIdArray = {
  bsonType: 'array',
  items: objectId,
} as const;

const commonProperties = {
  facilityId: objectId,
  transactionId: string,
  correlationId: string,

  schemaVersion: {
    ...number,
    minimum: 1,
  },

  version: {
    ...number,
    minimum: 0,
  },

  createdBy: objectId,
  updatedBy: objectId,
  createdAt: date,
  updatedAt: date,
} as const;

const commonRequired = [
  'facilityId',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
] as const;

function validator(
  required: readonly string[],
  properties: Record<
    string,
    unknown
  >,
): Record<string, unknown> {
  return {
    $jsonSchema: {
      bsonType: 'object',

      required: [
        ...required,
        ...commonRequired,
      ],

      properties: {
        _id: objectId,
        ...properties,
        ...commonProperties,
      },
    },
  };
}

export const inventoryProcurementReceivingValidators:
Readonly<
  Record<
    ProcurementCollection,
    Record<string, unknown>
  >
> = {
  purchaseRequisitions:
    validator(
      [
        'requisitionNumber',
        'requestingDepartmentId',
        'requestingLocationId',
        'requestedByStaffId',
        'priority',
        'justification',
        'currency',
        'estimatedSubtotal',
        'estimatedTaxAmount',
        'estimatedDiscountAmount',
        'estimatedNetAmount',
        'lineCount',
        'status',
        'convertedPurchaseOrderIds',
        'attachmentIds',
      ],
      {
        requisitionNumber:
          string,

        requestingDepartmentId:
          objectId,

        requestingLocationId:
          objectId,

        requestedByStaffId:
          objectId,

        priority: {
          bsonType: 'string',

          enum: [
            ...purchaseRequisitionPriorityValues,
          ],
        },

        needByDate:
          nullableDate,

        justification:
          string,

        notes:
          nullableString,

        currency:
          string,

        estimatedSubtotal:
          decimal,

        estimatedTaxAmount:
          decimal,

        estimatedDiscountAmount:
          decimal,

        estimatedNetAmount:
          decimal,

        lineCount:
          number,

        status: {
          bsonType: 'string',

          enum: [
            ...purchaseRequisitionStatusValues,
          ],
        },

        submittedAt:
          nullableDate,

        submittedByStaffId:
          nullableObjectId,

        decidedAt:
          nullableDate,

        decidedByStaffId:
          nullableObjectId,

        decisionReason:
          nullableString,

        convertedPurchaseOrderIds:
          objectIdArray,

        cancelledAt:
          nullableDate,

        cancelledByStaffId:
          nullableObjectId,

        cancellationReason:
          nullableString,

        attachmentIds:
          objectIdArray,
      },
    ),

  purchaseRequisitionItems:
    validator(
      [
        'purchaseRequisitionId',
        'lineNumber',
        'itemId',
        'requestedUnitId',
        'requestedQuantity',
        'requestedUnitToStockFactor',
        'requestedStockQuantity',
        'orderedStockQuantity',
        'estimatedUnitCost',
        'estimatedTaxAmount',
        'estimatedDiscountAmount',
        'estimatedLineTotal',
        'status',
      ],
      {
        purchaseRequisitionId:
          objectId,

        lineNumber:
          number,

        itemId:
          objectId,

        requestedUnitId:
          objectId,

        requestedQuantity:
          decimal,

        requestedUnitToStockFactor:
          decimal,

        requestedStockQuantity:
          decimal,

        approvedStockQuantity:
          nullableDecimal,

        orderedStockQuantity:
          decimal,

        estimatedUnitCost:
          decimal,

        estimatedTaxAmount:
          decimal,

        estimatedDiscountAmount:
          decimal,

        estimatedLineTotal:
          decimal,

        preferredSupplierId:
          nullableObjectId,

        status: {
          bsonType: 'string',

          enum: [
            ...purchaseRequisitionItemStatusValues,
          ],
        },

        notes:
          nullableString,
      },
    ),

  procurementApprovalHistories:
    validator(
      [
        'documentType',
        'documentId',
        'sequence',
        'decision',
        'actorStaffId',
        'amountAtDecision',
        'reason',
        'documentVersion',
        'decidedAt',
      ],
      {
        documentType: {
          bsonType: 'string',

          enum: [
            ...procurementDocumentTypeValues,
          ],
        },

        documentId:
          objectId,

        sequence:
          number,

        decision: {
          bsonType: 'string',

          enum: [
            ...procurementApprovalDecisionValues,
          ],
        },

        actorStaffId:
          objectId,

        amountAtDecision:
          decimal,

        actorApprovalLimit:
          nullableDecimal,

        reason:
          string,

        documentVersion:
          number,

        decidedAt:
          date,
      },
    ),

  purchaseOrders:
    validator(
      [
        'purchaseOrderNumber',
        'purchaseRequisitionId',
        'supplierId',
        'deliveryLocationId',
        'orderedByStaffId',
        'currency',
        'subtotal',
        'taxAmount',
        'discountAmount',
        'netAmount',
        'lineCount',
        'openLineCount',
        'status',
        'orderedAt',
        'expectedDeliveryDate',
        'supplierAcknowledgementStatus',
        'attachmentIds',
      ],
      {
        purchaseOrderNumber:
          string,

        purchaseRequisitionId:
          objectId,

        supplierId:
          objectId,

        deliveryLocationId:
          objectId,

        orderedByStaffId:
          objectId,

        currency:
          string,

        subtotal:
          decimal,

        taxAmount:
          decimal,

        discountAmount:
          decimal,

        netAmount:
          decimal,

        lineCount:
          number,

        openLineCount:
          number,

        status: {
          bsonType: 'string',

          enum: [
            ...purchaseOrderStatusValues,
          ],
        },

        orderedAt:
          date,

        expectedDeliveryDate:
          date,

        supplierAcknowledgementStatus: {
          bsonType: 'string',

          enum: [
            ...supplierAcknowledgementStatusValues,
          ],
        },

        supplierAcknowledgementReference:
          nullableString,

        supplierAcknowledgedAt:
          nullableDate,

        supplierAcknowledgedBy:
          nullableString,

        supplierAcknowledgementNotes:
          nullableString,

        termsAndConditions:
          nullableString,

        notes:
          nullableString,

        cancelledAt:
          nullableDate,

        cancelledByStaffId:
          nullableObjectId,

        cancellationReason:
          nullableString,

        attachmentIds:
          objectIdArray,
      },
    ),

  purchaseOrderItems:
    validator(
      [
        'purchaseOrderId',
        'purchaseRequisitionItemId',
        'lineNumber',
        'itemId',
        'purchaseUnitId',
        'purchaseUnitToStockFactor',
        'orderedQuantity',
        'orderedStockQuantity',
        'unitCost',
        'taxAmount',
        'discountAmount',
        'lineTotal',
        'receivedStockQuantity',
        'acceptedStockQuantity',
        'rejectedStockQuantity',
        'damagedStockQuantity',
        'quarantinedStockQuantity',
        'overReceiptTolerancePercent',
        'status',
      ],
      {
        purchaseOrderId:
          objectId,

        purchaseRequisitionItemId:
          objectId,

        lineNumber:
          number,

        itemId:
          objectId,

        purchaseUnitId:
          objectId,

        purchaseUnitToStockFactor:
          decimal,

        orderedQuantity:
          decimal,

        orderedStockQuantity:
          decimal,

        unitCost:
          decimal,

        taxAmount:
          decimal,

        discountAmount:
          decimal,

        lineTotal:
          decimal,

        receivedStockQuantity:
          decimal,

        acceptedStockQuantity:
          decimal,

        rejectedStockQuantity:
          decimal,

        damagedStockQuantity:
          decimal,

        quarantinedStockQuantity:
          decimal,

        overReceiptTolerancePercent:
          decimal,

        status: {
          bsonType: 'string',

          enum: [
            ...purchaseOrderItemStatusValues,
          ],
        },

        notes:
          nullableString,
      },
    ),

  goodsReceipts:
    validator(
      [
        'goodsReceiptNumber',
        'purchaseOrderId',
        'supplierId',
        'receivingLocationId',
        'receivedByStaffId',
        'receivedAt',
        'currency',
        'subtotal',
        'taxAmount',
        'discountAmount',
        'netAmount',
        'totalReceivedStockQuantity',
        'totalAcceptedStockQuantity',
        'totalRejectedStockQuantity',
        'totalDamagedStockQuantity',
        'totalQuarantinedStockQuantity',
        'lineCount',
        'inspectionStatus',
        'status',
        'attachmentIds',
      ],
      {
        goodsReceiptNumber:
          string,

        purchaseOrderId:
          objectId,

        supplierId:
          objectId,

        receivingLocationId:
          objectId,

        receivedByStaffId:
          objectId,

        inspectedByStaffId:
          nullableObjectId,

        receivedAt:
          date,

        inspectedAt:
          nullableDate,

        supplierDeliveryReference:
          nullableString,

        supplierInvoiceNumber:
          nullableString,

        purchaseInvoiceId:
          nullableObjectId,

        currency:
          string,

        subtotal:
          decimal,

        taxAmount:
          decimal,

        discountAmount:
          decimal,

        netAmount:
          decimal,

        totalReceivedStockQuantity:
          decimal,

        totalAcceptedStockQuantity:
          decimal,

        totalRejectedStockQuantity:
          decimal,

        totalDamagedStockQuantity:
          decimal,

        totalQuarantinedStockQuantity:
          decimal,

        lineCount:
          number,

        inspectionStatus: {
          bsonType: 'string',

          enum: [
            ...goodsReceiptInspectionStatusValues,
          ],
        },

        status: {
          bsonType: 'string',

          enum: [
            ...goodsReceiptStatusValues,
          ],
        },

        notes:
          nullableString,

        correctionOfGoodsReceiptId:
          nullableObjectId,

        correctedByGoodsReceiptId:
          nullableObjectId,

        enteredInErrorAt:
          nullableDate,

        enteredInErrorByStaffId:
          nullableObjectId,

        enteredInErrorReason:
          nullableString,

        stockPostingTransactionId:
          nullableString,

        postedAt:
          nullableDate,

        attachmentIds:
          objectIdArray,
      },
    ),

  goodsReceiptItems:
    validator(
      [
        'goodsReceiptId',
        'purchaseOrderItemId',
        'lineNumber',
        'itemId',
        'receivedUnitId',
        'receivedUnitToStockFactor',
        'receivedQuantity',
        'receivedStockQuantity',
        'acceptedStockQuantity',
        'rejectedStockQuantity',
        'damagedStockQuantity',
        'quarantinedStockQuantity',
        'manufacturerBatchNumber',
        'unitCost',
        'taxAmount',
        'discountAmount',
        'lineTotal',
        'inventoryBatchId',
      ],
      {
        goodsReceiptId:
          objectId,

        purchaseOrderItemId:
          objectId,

        lineNumber:
          number,

        itemId:
          objectId,

        receivedUnitId:
          objectId,

        receivedUnitToStockFactor:
          decimal,

        receivedQuantity:
          decimal,

        receivedStockQuantity:
          decimal,

        acceptedStockQuantity:
          decimal,

        rejectedStockQuantity:
          decimal,

        damagedStockQuantity:
          decimal,

        quarantinedStockQuantity:
          decimal,

        manufacturerName:
          nullableString,

        manufacturerBatchNumber:
          string,

        manufactureDate:
          nullableDate,

        expiryDate:
          nullableDate,

        unitCost:
          decimal,

        taxAmount:
          decimal,

        discountAmount:
          decimal,

        lineTotal:
          decimal,

        inventoryBatchId:
          objectId,

        inspectionNotes:
          nullableString,
      },
    ),

  purchaseInvoices:
    validator(
      [
        'internalInvoiceReference',
        'supplierInvoiceNumber',
        'normalizedSupplierInvoiceNumber',
        'supplierId',
        'purchaseOrderId',
        'invoiceDate',
        'currency',
        'subtotal',
        'taxAmount',
        'discountAmount',
        'netAmount',
        'status',
        'attachmentIds',
      ],
      {
        internalInvoiceReference:
          string,

        supplierInvoiceNumber:
          string,

        normalizedSupplierInvoiceNumber:
          string,

        supplierId:
          objectId,

        purchaseOrderId:
          objectId,

        goodsReceiptId:
          nullableObjectId,

        invoiceDate:
          date,

        dueDate:
          nullableDate,

        currency:
          string,

        subtotal:
          decimal,

        taxAmount:
          decimal,

        discountAmount:
          decimal,

        netAmount:
          decimal,

        status: {
          bsonType: 'string',

          enum: [
            ...purchaseInvoiceStatusValues,
          ],
        },

        discrepancyReason:
          nullableString,

        attachmentIds:
          objectIdArray,
      },
    ),

  supplierReturns:
    validator(
      [
        'supplierReturnNumber',
        'supplierId',
        'goodsReceiptId',
        'sourceLocationId',
        'initiatedByStaffId',
        'status',
        'reason',
        'lineCount',
        'totalStockQuantity',
        'attachmentIds',
      ],
      {
        supplierReturnNumber:
          string,

        supplierId:
          objectId,

        goodsReceiptId:
          objectId,

        sourceLocationId:
          objectId,

        initiatedByStaffId:
          objectId,

        approvedByStaffId:
          nullableObjectId,

        approvedAt:
          nullableDate,

        status: {
          bsonType: 'string',

          enum: [
            ...supplierReturnStatusValues,
          ],
        },

        reason:
          string,

        lineCount:
          number,

        totalStockQuantity:
          decimal,

        dispatchedAt:
          nullableDate,

        dispatchedByStaffId:
          nullableObjectId,

        supplierAcknowledgementReference:
          nullableString,

        acknowledgedAt:
          nullableDate,

        cancelledAt:
          nullableDate,

        cancelledByStaffId:
          nullableObjectId,

        cancellationReason:
          nullableString,

        attachmentIds:
          objectIdArray,
      },
    ),

  supplierReturnItems:
    validator(
      [
        'supplierReturnId',
        'goodsReceiptItemId',
        'lineNumber',
        'itemId',
        'batchId',
        'returnStockQuantity',
        'reasonCode',
        'condition',
      ],
      {
        supplierReturnId:
          objectId,

        goodsReceiptItemId:
          objectId,

        lineNumber:
          number,

        itemId:
          objectId,

        batchId:
          objectId,

        returnStockQuantity:
          decimal,

        reasonCode: {
          bsonType: 'string',

          enum: [
            ...supplierReturnReasonValues,
          ],
        },

        condition: {
          bsonType: 'string',

          enum: [
            ...supplierReturnConditionValues,
          ],
        },

        notes:
          nullableString,
      },
    ),
};

const models = {
  purchaseRequisitions:
    PurchaseRequisitionModel,

  purchaseRequisitionItems:
    PurchaseRequisitionItemModel,

  procurementApprovalHistories:
    ProcurementApprovalHistoryModel,

  purchaseOrders:
    PurchaseOrderModel,

  purchaseOrderItems:
    PurchaseOrderItemModel,

  goodsReceipts:
    GoodsReceiptModel,

  goodsReceiptItems:
    GoodsReceiptItemModel,

  purchaseInvoices:
    PurchaseInvoiceModel,

  supplierReturns:
    SupplierReturnModel,

  supplierReturnItems:
    SupplierReturnItemModel,
} as const;

async function ensureCollection(
  database: Db,
  name: ProcurementCollection,
): Promise<void> {
  const exists = (
    await database
      .listCollections(
        {
          name,
        },
        {
          nameOnly: true,
        },
      )
      .toArray()
  ).length > 0;

  const collectionValidator =
    inventoryProcurementReceivingValidators[
      name
    ];

  if (exists) {
    await database.command({
      collMod: name,
      validator:
        collectionValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  } else {
    await database.createCollection(
      name,
      {
        validator:
          collectionValidator,

        validationLevel: 'strict',
        validationAction: 'error',
      },
    );
  }

  const collection =
    database.collection(name);

  const existingIndexes =
    await collection.indexes();

  for (
    const index of
    existingIndexes
  ) {
    if (index.name !== '_id_') {
      await collection.dropIndex(
        index.name,
      );
    }
  }

  const indexes =
    models[
      name
    ].schema.indexes() as IndexDescription[];

  if (
    indexes.length > 0
  ) {
    await collection.createIndexes(
      indexes,
    );
  }
}

export const inventoryProcurementReceiving:
  Migration = {
    id:
      '025-inventory-procurement-receiving',

    description:
      'Create purchase requisitions, immutable approvals, purchase orders, invoices, goods receipts, batch-linked receipt lines, and supplier returns',

    async up(database) {
      for (
        const collectionName of
        inventoryProcurementReceivingCollections
      ) {
        const spec =
          collectionSpecs.find(
            (candidate) =>
              candidate.name ===
              collectionName,
          );

        if (
          spec === undefined ||
          spec.domain !==
            'inventory' ||
          !spec.facilityScoped ||
          (
            collectionName ===
              'procurementApprovalHistories'
              ? spec.retention !==
                'immutable'
              : spec.retention !==
                'standard'
          )
        ) {
          throw new Error(
            `${collectionName} has an invalid inventory collection specification`,
          );
        }

        await ensureCollection(
          database,
          collectionName,
        );
      }
    },
  };