import {
  decimal128ToString,
} from '@hospital-mis/database';

import type {
  CashCounterView,
  CashierShiftView,
  CashMovementView,
  DepositView,
  PaymentAllocationView,
  PaymentIntentView,
  PaymentMethodConfigurationView,
  PaymentMethodTotalView,
  PaymentTenderView,
  PaymentReceiptView,
  PaymentReversalView,
  PaymentView,
  RefundRequestView,
  RefundView,
  ShiftReconciliationView,
} from './payments-cashier-shifts.contracts.js';

import type {
  CashCounterRecord,
  CashierShiftRecord,
  CashMovementRecord,
  DepositRecord,
  PaymentAllocationRecord,
  PaymentIntentRecord,
  PaymentMethodConfigurationRecord,
  PaymentMethodTotalRecord,
  PaymentReceiptRecord,
  PaymentReversalRecord,
  PaymentRecord,
  PaymentTenderRecord,
  RefundRequestRecord,
  RefundRecord,
  ShiftReconciliationRecord,
} from './payments-cashier-shifts.persistence.types.js';

function objectId(
  value:
    Readonly<{
      toHexString(): string;
    }>,
): string {
  return value.toHexString();
}

function nullableObjectId(
  value:
    | Readonly<{
        toHexString(): string;
      }>
    | null,
): string | null {
  return value?.toHexString() ?? null;
}

function objectIds(
  values:
    readonly Readonly<{
      toHexString(): string;
    }>[],
): string[] {
  return values.map(
    objectId,
  );
}

function decimal(
  value:
    Parameters<
      typeof decimal128ToString
    >[0],
): string {
  return decimal128ToString(
    value,
  );
}

function iso(
  value: Date,
): string {
  return value.toISOString();
}

function nullableIso(
  value: Date | null,
): string | null {
  return value?.toISOString() ?? null;
}

export function maskPaymentReference(
  value: string | null,
): string | null {
  if (
    value === null ||
    value.trim().length === 0
  ) {
    return null;
  }

  const normalized =
    value.trim();

  const visible =
    normalized.slice(-4);

  return `${'*'.repeat(
    Math.max(
      4,
      normalized.length -
        visible.length,
    ),
  )}${visible}`;
}

export function projectPaymentMethodConfiguration(
  record:
    PaymentMethodConfigurationRecord,
): PaymentMethodConfigurationView {
  return {
    id:
      objectId(
        record._id,
      ),

    code:
      record.code,

    name:
      record.name,

    description:
      record.description,

    methodCode:
      record.methodCode,

    methodKind:
      record.methodKind,

    active:
      record.active,

    effectiveFrom:
      iso(
        record.effectiveFrom,
      ),

    effectiveThrough:
      nullableIso(
        record.effectiveThrough,
      ),

    allowedCurrencies:
      [...record.allowedCurrencies],

    externalReferenceRequired:
      record.externalReferenceRequired,

    bankReferenceRequired:
      record.bankReferenceRequired,

    cardReferenceRequired:
      record.cardReferenceRequired,

    cashEquivalent:
      record.cashEquivalent,

    refundEligible:
      record.refundEligible,

    reversalEligible:
      record.reversalEligible,

    settlementMode:
      record.settlementMode,

    settlementDelayHours:
      record.settlementDelayHours,

    permissionCodes:
      [...record.permissionCodes],

    requiresOpenCashierShift:
      record.requiresOpenCashierShift,

    version:
      record.version,

    createdAt:
      iso(
        record.createdAt,
      ),

    updatedAt:
      iso(
        record.updatedAt,
      ),
  };
}

export function projectCashCounter(
  record:
    CashCounterRecord,
): CashCounterView {
  return {
    id:
      objectId(
        record._id,
      ),

    counterCode:
      record.counterCode,

    name:
      record.name,

    location:
      record.location,

    departmentId:
      nullableObjectId(
        record.departmentId,
      ),

    counterType:
      record.counterType,

    active:
      record.active,

    assignedUserIds:
      objectIds(
        record.assignedUserIds,
      ),

    allowedPaymentMethodConfigurationIds:
      objectIds(
        record
          .allowedPaymentMethodConfigurationIds,
      ),

    currency:
      record.currency,

    cashHoldingLimit:
      decimal(
        record.cashHoldingLimit,
      ),

    openingFloatRequired:
      record.openingFloatRequired,

    minimumOpeningFloat:
      decimal(
        record.minimumOpeningFloat,
      ),

    maximumOpeningFloat:
      decimal(
        record.maximumOpeningFloat,
      ),

    activeShiftPolicy:
      record.activeShiftPolicy,

    supervisorApprovalRequiredForClose:
      record
        .supervisorApprovalRequiredForClose,

    negativeExpectedCashAllowed:
      record.negativeExpectedCashAllowed,

    version:
      record.version,

    createdAt:
      iso(
        record.createdAt,
      ),

    updatedAt:
      iso(
        record.updatedAt,
      ),
  };
}

export function projectPaymentMethodTotal(
  record:
    PaymentMethodTotalRecord,
): PaymentMethodTotalView {
  return {
    paymentMethodConfigurationId:
      objectId(
        record
          .paymentMethodConfigurationId,
      ),

    paymentMethodCode:
      record.paymentMethodCodeSnapshot,

    collectedAmount:
      decimal(
        record.collectedAmount,
      ),

    refundedAmount:
      decimal(
        record.refundedAmount,
      ),

    reversedAmount:
      decimal(
        record.reversedAmount,
      ),

    netAmount:
      decimal(
        record.netAmount,
      ),

    transactionCount:
      record.transactionCount,
  };
}

export function projectCashierShift(
  record:
    CashierShiftRecord,
): CashierShiftView {
  return {
    id:
      objectId(
        record._id,
      ),

    shiftNumber:
      record.shiftNumber,

    cashCounterId:
      objectId(
        record.cashCounterId,
      ),

    cashierUserId:
      objectId(
        record.cashierUserId,
      ),

    cashierStaffId:
      nullableObjectId(
        record.cashierStaffId,
      ),

    supervisorUserId:
      nullableObjectId(
        record.supervisorUserId,
      ),

    currency:
      record.currency,

    status:
      record.status,

    openedAt:
      iso(
        record.openedAt,
      ),

    openingFloat:
      decimal(
        record.openingFloat,
      ),

    suspendedAt:
      nullableIso(
        record.suspendedAt,
      ),

    closingStartedAt:
      nullableIso(
        record.closingStartedAt,
      ),

    closedAt:
      nullableIso(
        record.closedAt,
      ),

    expectedCash:
      decimal(
        record.expectedCash,
      ),

    declaredCash:
      decimal(
        record.declaredCash,
      ),

    cashVariance:
      decimal(
        record.cashVariance,
      ),

    nonCashTotal:
      decimal(
        record.nonCashTotal,
      ),

    paymentMethodTotals:
      record.paymentMethodTotals.map(
        projectPaymentMethodTotal,
      ),

    refundTotal:
      decimal(
        record.refundTotal,
      ),

    reversalTotal:
      decimal(
        record.reversalTotal,
      ),

    depositTotal:
      decimal(
        record.depositTotal,
      ),

    advanceTotal:
      decimal(
        record.advanceTotal,
      ),

    firstReceiptNumber:
      record.firstReceiptNumber,

    lastReceiptNumber:
      record.lastReceiptNumber,

    receiptCount:
      record.receiptCount,

    paymentCount:
      record.paymentCount,

    handoverToUserId:
      nullableObjectId(
        record.handoverToUserId,
      ),

    handoverAt:
      nullableIso(
        record.handoverAt,
      ),

    shiftReconciliationId:
      nullableObjectId(
        record.shiftReconciliationId,
      ),

    version:
      record.version,

    createdAt:
      iso(
        record.createdAt,
      ),

    updatedAt:
      iso(
        record.updatedAt,
      ),
  };
}

export function projectShiftReconciliation(
  record:
    ShiftReconciliationRecord,
): ShiftReconciliationView {
  return {
    id:
      objectId(
        record._id,
      ),

    reconciliationNumber:
      record.reconciliationNumber,

    cashShiftId:
      objectId(
        record.cashShiftId,
      ),

    cashCounterId:
      objectId(
        record.cashCounterId,
      ),

    cashierUserId:
      objectId(
        record.cashierUserId,
      ),

    status:
      record.status,

    currency:
      record.currency,

    calculatedAt:
      iso(
        record.calculatedAt,
      ),

    openingFloat:
      decimal(
        record.openingFloat,
      ),

    cashCollections:
      decimal(
        record.cashCollections,
      ),

    cashRefunds:
      decimal(
        record.cashRefunds,
      ),

    cashPaidOut:
      decimal(
        record.cashPaidOut,
      ),

    cashDrops:
      decimal(
        record.cashDrops,
      ),

    safeDeposits:
      decimal(
        record.safeDeposits,
      ),

    cashTransfersIn:
      decimal(
        record.cashTransfersIn,
      ),

    cashTransfersOut:
      decimal(
        record.cashTransfersOut,
      ),

    expectedClosingCash:
      decimal(
        record.expectedClosingCash,
      ),

    declaredClosingCash:
      decimal(
        record.declaredClosingCash,
      ),

    cashVariance:
      decimal(
        record.cashVariance,
      ),

    nonCashTotal:
      decimal(
        record.nonCashTotal,
      ),

    paymentMethodTotals:
      record.paymentMethodTotals.map(
        projectPaymentMethodTotal,
      ),

    paymentCount:
      record.paymentCount,

    receiptCount:
      record.receiptCount,

    failedPaymentCount:
      record.failedPaymentCount,

    unallocatedPaymentCount:
      record.unallocatedPaymentCount,

    unresolvedRefundCount:
      record.unresolvedRefundCount,

    incompleteJournalCount:
      record.incompleteJournalCount,

    blockingIssueCodes:
      [...record.blockingIssueCodes],

    varianceReason:
      record.varianceReason,

    approvedAt:
      nullableIso(
        record.approvedAt,
      ),

    approvedBy:
      nullableObjectId(
        record.approvedBy,
      ),

    closedAt:
      nullableIso(
        record.closedAt,
      ),

    version:
      record.version,
  };
}

export function projectPaymentIntent(
  record:
    PaymentIntentRecord,
): PaymentIntentView {
  return {
    id:
      objectId(
        record._id,
      ),

    intentNumber:
      record.intentNumber,

    patientId:
      objectId(
        record.patientId,
      ),

    patientAccountId:
      objectId(
        record.patientAccountId,
      ),

    invoiceId:
      nullableObjectId(
        record.invoiceId,
      ),

    paymentMethod:
      record.paymentMethod,

    amount:
      decimal(
        record.amount,
      ),

    currency:
      record.currency,

    status:
      record.status,

    expiresAt:
      iso(
        record.expiresAt,
      ),

    authorizedAt:
      nullableIso(
        record.authorizedAt,
      ),

    completedPaymentId:
      nullableObjectId(
        record.completedPaymentId,
      ),

    failureCode:
      record.failureCode,

    externalReferenceMasked:
      maskPaymentReference(
        record.externalReference,
      ),

    version:
      record.version,

    createdAt:
      iso(
        record.createdAt,
      ),

    updatedAt:
      iso(
        record.updatedAt,
      ),
  };
}

export function projectPaymentTender(
  record:
    PaymentTenderRecord,
): PaymentTenderView {
  return {
    id:
      objectId(
        record._id,
      ),

    paymentId:
      objectId(
        record.paymentId,
      ),

    sequence:
      record.sequence,

    paymentMethodConfigurationId:
      objectId(
        record
          .paymentMethodConfigurationId,
      ),

    paymentMethodCode:
      record.paymentMethodCodeSnapshot,

    amount:
      decimal(
        record.amount,
      ),

    externalReferenceMasked:
      record.maskedReference ??
      maskPaymentReference(
        record.externalReference,
      ),

    status:
      record.status,

    settledAt:
      nullableIso(
        record.settledAt,
      ),

    version:
      record.version,
  };
}

export function projectPaymentAllocation(
  record:
    PaymentAllocationRecord,
): PaymentAllocationView {
  return {
    id:
      objectId(
        record._id,
      ),

    paymentId:
      objectId(
        record.paymentId,
      ),

    patientAccountId:
      objectId(
        record.patientAccountId,
      ),

    invoiceId:
      nullableObjectId(
        record.invoiceId,
      ),

    accountChargeId:
      nullableObjectId(
        record.accountChargeId,
      ),

    amount:
      decimal(
        record.amount,
      ),

    status:
      record.status,

    allocatedAt:
      iso(
        record.allocatedAt,
      ),

    allocatedBy:
      objectId(
        record.allocatedBy,
      ),

    reversedAt:
      nullableIso(
        record.reversedAt,
      ),

    reversedBy:
      nullableObjectId(
        record.reversedBy,
      ),

    reversalReason:
      record.reversalReason,

    version:
      record.version,
  };
}

export function projectPayment(
  record:
    PaymentRecord,

  allocations:
    readonly PaymentAllocationRecord[],

  tenders:
    readonly PaymentTenderRecord[] = [],
): PaymentView {
  return {
    id:
      objectId(
        record._id,
      ),

    paymentNumber:
      record.paymentNumber ??
      record.receiptNumber,

    receiptNumber:
      record.receiptNumber,

    patientId:
      objectId(
        record.patientId,
      ),

    patientAccountId:
      objectId(
        record.patientAccountId,
      ),

    invoiceId:
      nullableObjectId(
        record.invoiceId,
      ),

    paymentIntentId:
      nullableObjectId(
        record.paymentIntentId,
      ),

    amount:
      decimal(
        record.amount,
      ),

    allocatedAmount:
      decimal(
        record.allocatedAmount,
      ),

    unallocatedAmount:
      decimal(
        record.unallocatedAmount,
      ),

    refundedAmount:
      decimal(
        record.refundedAmount,
      ),

    currency:
      record.currency,

    paymentMethod:
      record.paymentMethod,

    externalReferenceMasked:
      maskPaymentReference(
        record.externalReference,
      ),

    tenders:
      tenders.map(
        projectPaymentTender,
      ),

    status:
      record.status,

    receivedAt:
      iso(
        record.receivedAt,
      ),

    postedAt:
      nullableIso(
        record.postedAt,
      ),

    receivedBy:
      objectId(
        record.receivedBy ??
        record.createdBy,
      ),

    cashierStaffId:
      nullableObjectId(
        record.cashierStaffId,
      ),

    cashShiftId:
      nullableObjectId(
        record.cashShiftId,
      ),

    cashCounterId:
      nullableObjectId(
        record.cashCounterId,
      ),

    allocations:
      allocations.map(
        projectPaymentAllocation,
      ),

    version:
      record.version,

    createdAt:
      iso(
        record.createdAt,
      ),

    updatedAt:
      iso(
        record.updatedAt,
      ),
  };
}

export function projectPaymentReceipt(
  record:
    PaymentReceiptRecord,
): PaymentReceiptView {
  return {
    id:
      objectId(
        record._id,
      ),

    receiptNumber:
      record.receiptNumber,

    paymentId:
      objectId(
        record.paymentId,
      ),

    patientId:
      objectId(
        record.patientId,
      ),

    patientAccountId:
      objectId(
        record.patientAccountId,
      ),

    invoiceIds:
      objectIds(
        record.invoiceIds,
      ),

    cashCounterId:
      nullableObjectId(
        record.cashCounterId,
      ),

    cashShiftId:
      nullableObjectId(
        record.cashShiftId,
      ),

    cashierUserId:
      nullableObjectId(
        record.cashierUserId,
      ),

    issuedAt:
      iso(
        record.issuedAt,
      ),

    currency:
      record.currency,

    totalAmount:
      decimal(
        record.totalAmount,
      ),

    allocatedAmount:
      decimal(
        record.allocatedAmount,
      ),

    unallocatedAmount:
      decimal(
        record.unallocatedAmount,
      ),

    paymentMethods:
      record.paymentMethodSummaries.map(
        (summary) => ({
          paymentMethodConfigurationId:
            objectId(
              summary
                .paymentMethodConfigurationId,
            ),

          paymentMethodCode:
            summary
              .paymentMethodCodeSnapshot,

          amount:
            decimal(
              summary.amount,
            ),

          externalReferenceMasked:
            summary
              .externalReferenceMasked,
        }),
      ),

    allocations:
      record.allocationSummaries.map(
        (summary) => ({
          paymentAllocationId:
            objectId(
              summary
                .paymentAllocationId,
            ),

          invoiceId:
            nullableObjectId(
              summary.invoiceId,
            ),

          accountChargeId:
            nullableObjectId(
              summary.accountChargeId,
            ),

          amount:
            decimal(
              summary.amount,
            ),
        }),
      ),

    status:
      record.status,

    originalReceiptId:
      nullableObjectId(
        record.originalReceiptId,
      ),

    replacementReceiptId:
      nullableObjectId(
        record.replacementReceiptId,
      ),

    refundId:
      nullableObjectId(
        record.refundId,
      ),

    paymentReversalId:
      nullableObjectId(
        record.paymentReversalId,
      ),

    printableProjectionVersion:
      record.printableProjectionVersion,
  };
}

export function projectDeposit(
  record:
    DepositRecord,
): DepositView {
  return {
    id:
      objectId(
        record._id,
      ),

    depositNumber:
      record.depositNumber,

    patientId:
      objectId(
        record.patientId,
      ),

    patientAccountId:
      nullableObjectId(
        record.patientAccountId,
      ),

    paymentId:
      objectId(
        record.paymentId,
      ),

    originalAmount:
      decimal(
        record.originalAmount,
      ),

    availableAmount:
      decimal(
        record.availableAmount,
      ),

    appliedAmount:
      decimal(
        record.appliedAmount,
      ),

    refundedAmount:
      decimal(
        record.refundedAmount,
      ),

    currency:
      record.currency,

    status:
      record.status,

    receivedAt:
      iso(
        record.receivedAt,
      ),

    expiresAt:
      nullableIso(
        record.expiresAt,
      ),

    version:
      record.version,
  };
}

export function projectRefundRequest(
  record:
    RefundRequestRecord,
): RefundRequestView {
  return {
    id:
      objectId(
        record._id,
      ),

    requestNumber:
      record.requestNumber,

    patientId:
      objectId(
        record.patientId,
      ),

    patientAccountId:
      objectId(
        record.patientAccountId,
      ),

    paymentId:
      nullableObjectId(
        record.paymentId,
      ),

    depositId:
      nullableObjectId(
        record.depositId,
      ),

    creditNoteId:
      nullableObjectId(
        record.creditNoteId,
      ),

    amount:
      decimal(
        record.amount,
      ),

    currency:
      record.currency,

    reasonCode:
      record.reasonCode,

    reason:
      record.reason,

    approvalRequestId:
      objectId(
        record.approvalRequestId,
      ),

    status:
      record.status,

    completedRefundId:
      nullableObjectId(
        record.completedRefundId,
      ),

    version:
      record.version,

    createdAt:
      iso(
        record.createdAt,
      ),
  };
}

export function projectRefund(
  record:
    RefundRecord,
): RefundView {
  return {
    id:
      objectId(
        record._id,
      ),

    refundNumber:
      record.refundNumber,

    refundRequestId:
      objectId(
        record.refundRequestId,
      ),

    patientId:
      objectId(
        record.patientId,
      ),

    patientAccountId:
      objectId(
        record.patientAccountId,
      ),

    paymentId:
      nullableObjectId(
        record.paymentId,
      ),

    depositId:
      nullableObjectId(
        record.depositId,
      ),

    amount:
      decimal(
        record.amount,
      ),

    currency:
      record.currency,

    paymentMethod:
      record.paymentMethod,

    externalReferenceMasked:
      maskPaymentReference(
        record.externalReference,
      ),

    status:
      record.status,

    postedAt:
      nullableIso(
        record.postedAt,
      ),

    postedBy:
      nullableObjectId(
        record.postedBy,
      ),

    failureCode:
      record.failureCode,

    version:
      record.version,
  };
}

export function projectPaymentReversal(
  record:
    PaymentReversalRecord,
): PaymentReversalView {
  return {
    id:
      objectId(
        record._id,
      ),

    reversalNumber:
      record.reversalNumber,

    paymentId:
      objectId(
        record.paymentId,
      ),

    patientAccountId:
      objectId(
        record.patientAccountId,
      ),

    amount:
      decimal(
        record.amount,
      ),

    reasonCode:
      record.reasonCode,

    reason:
      record.reason,

    approvalRequestId:
      objectId(
        record.approvalRequestId,
      ),

    status:
      record.status,

    postedAt:
      nullableIso(
        record.postedAt,
      ),

    postedBy:
      nullableObjectId(
        record.postedBy,
      ),

    failureCode:
      record.failureCode,

    version:
      record.version,
  };
}

export function projectCashMovement(
  record:
    CashMovementRecord,
): CashMovementView {
  return {
    id:
      objectId(
        record._id,
      ),

    movementNumber:
      record.movementNumber,

    movementType:
      record.movementType,

    status:
      record.status,

    amount:
      decimal(
        record.amount,
      ),

    currency:
      record.currency,

    sourceCounterId:
      nullableObjectId(
        record.sourceCounterId,
      ),

    sourceShiftId:
      nullableObjectId(
        record.sourceShiftId,
      ),

    destinationCounterId:
      nullableObjectId(
        record.destinationCounterId,
      ),

    destinationShiftId:
      nullableObjectId(
        record.destinationShiftId,
      ),

    reasonCode:
      record.reasonCode,

    reason:
      record.reason,

    requestedBy:
      objectId(
        record.requestedBy,
      ),

    requestedAt:
      iso(
        record.requestedAt,
      ),

    approvedBy:
      nullableObjectId(
        record.approvedBy,
      ),

    approvedAt:
      nullableIso(
        record.approvedAt,
      ),

    postedBy:
      nullableObjectId(
        record.postedBy,
      ),

    postedAt:
      nullableIso(
        record.postedAt,
      ),

    expectedCashEffect:
      decimal(
        record.expectedCashEffect,
      ),

    version:
      record.version,
  };
}