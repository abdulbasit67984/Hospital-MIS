import type {
  ClientSession,
  Types,
} from 'mongoose';

import type {
  ActiveShiftPolicy,
  CashCounterType,
  CashierShiftStatus,
  CashMovementStatus,
  CashMovementType,
  DepositStatus,
  PaymentAllocationStatus,
  PaymentIntentStatus,
  PaymentMethodCode,
  PaymentMethodKind,
  PaymentOperationalAction,
  PaymentOperationalEntityType,
  PaymentReceiptStatus,
  PaymentReversalStatus,
  PaymentSettlementMode,
  PaymentStatus,
  ReceiptCopyType,
  RefundRequestStatus,
  RefundStatus,
  ShiftReconciliationStatus,
} from './payments-cashier-shifts.constants.js';

export type PaymentCashierMongoSession =
  ClientSession;

export interface PaymentCashierPersistenceMetadata {
  facilityId: Types.ObjectId;
  transactionId: string;
  correlationId: string;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentActorIdentityRecord {
  userId: string;
  facilityId: string | null;
  staffId: string | null;
  status: string;
}

export interface PaymentStaffRecord {
  staffId: string;
  userId: string;
  facilityId: string;
  departmentId: string | null;
  displayName: string;
  employmentStatus: string;
  isActive: boolean;
}

export interface PaymentMethodConfigurationRecord
extends PaymentCashierPersistenceMetadata {
  _id: Types.ObjectId;
  code: string;
  name: string;
  description: string | null;
  methodCode: PaymentMethodCode;
  methodKind: PaymentMethodKind;
  active: boolean;
  effectiveFrom: Date;
  effectiveThrough: Date | null;
  allowedCurrencies: string[];
  externalReferenceRequired: boolean;
  bankReferenceRequired: boolean;
  cardReferenceRequired: boolean;
  cashEquivalent: boolean;
  refundEligible: boolean;
  reversalEligible: boolean;
  settlementMode: PaymentSettlementMode;
  settlementDelayHours: number | null;
  permissionCodes: string[];
  cashLedgerAccountId: Types.ObjectId | null;
  clearingLedgerAccountId:
    Types.ObjectId | null;
  receivableLedgerAccountId:
    Types.ObjectId | null;
  externalProviderCode: string | null;
  requiresOpenCashierShift: boolean;
  deactivatedAt: Date | null;
  deactivatedBy: Types.ObjectId | null;
  deactivationReason: string | null;
}

export interface CashCounterRecord
extends PaymentCashierPersistenceMetadata {
  _id: Types.ObjectId;
  counterCode: string;
  name: string;
  location: string;
  departmentId: Types.ObjectId | null;
  counterType: CashCounterType;
  active: boolean;
  assignedUserIds: Types.ObjectId[];

  allowedPaymentMethodConfigurationIds:
    Types.ObjectId[];

  currency: string;
  cashHoldingLimit: Types.Decimal128;
  openingFloatRequired: boolean;
  minimumOpeningFloat: Types.Decimal128;
  maximumOpeningFloat: Types.Decimal128;
  activeShiftPolicy: ActiveShiftPolicy;

  supervisorApprovalRequiredForClose:
    boolean;

  negativeExpectedCashAllowed:
    boolean;

  deactivatedAt: Date | null;
  deactivatedBy: Types.ObjectId | null;
  deactivationReason: string | null;
}

export interface PaymentMethodTotalRecord {
  paymentMethodConfigurationId:
    Types.ObjectId;

  paymentMethodCodeSnapshot:
    string;

  collectedAmount:
    Types.Decimal128;

  refundedAmount:
    Types.Decimal128;

  reversedAmount:
    Types.Decimal128;

  netAmount:
    Types.Decimal128;

  transactionCount:
    number;
}

export interface CashierShiftRecord
extends PaymentCashierPersistenceMetadata {
  _id: Types.ObjectId;
  operationKey: string;
  shiftNumber: string;
  cashCounterId: Types.ObjectId;
  cashierUserId: Types.ObjectId;
  cashierStaffId: Types.ObjectId | null;
  supervisorUserId: Types.ObjectId | null;
  currency: string;
  status: CashierShiftStatus;
  openedAt: Date;
  openingFloat: Types.Decimal128;
  suspendedAt: Date | null;
  suspendedBy: Types.ObjectId | null;
  suspensionReason: string | null;
  closingStartedAt: Date | null;
  closingStartedBy: Types.ObjectId | null;
  closedAt: Date | null;
  closedBy: Types.ObjectId | null;
  expectedCash: Types.Decimal128;
  declaredCash: Types.Decimal128;
  cashVariance: Types.Decimal128;
  nonCashTotal: Types.Decimal128;

  paymentMethodTotals:
    PaymentMethodTotalRecord[];

  refundTotal: Types.Decimal128;
  reversalTotal: Types.Decimal128;
  depositTotal: Types.Decimal128;
  advanceTotal: Types.Decimal128;
  firstReceiptNumber: string | null;
  lastReceiptNumber: string | null;
  receiptCount: number;
  paymentCount: number;
  notes: string | null;
  handoverToUserId: Types.ObjectId | null;
  handoverAt: Date | null;
  handoverNotes: string | null;
  shiftReconciliationId:
    Types.ObjectId | null;
  closingApprovalRequestId:
    Types.ObjectId | null;
  varianceApprovalRequestId:
    Types.ObjectId | null;
  reopenedFromShiftId:
    Types.ObjectId | null;
  reopenApprovalRequestId:
    Types.ObjectId | null;
  reopenReason: string | null;
}

export interface ShiftReconciliationRecord
extends PaymentCashierPersistenceMetadata {
  _id: Types.ObjectId;
  operationKey: string;
  reconciliationNumber: string;
  cashShiftId: Types.ObjectId;
  cashCounterId: Types.ObjectId;
  cashierUserId: Types.ObjectId;
  status: ShiftReconciliationStatus;
  currency: string;
  calculatedAt: Date;
  calculatedBy: Types.ObjectId;
  openingFloat: Types.Decimal128;
  cashCollections: Types.Decimal128;
  cashRefunds: Types.Decimal128;
  cashPaidOut: Types.Decimal128;
  cashDrops: Types.Decimal128;
  safeDeposits: Types.Decimal128;
  cashTransfersIn: Types.Decimal128;
  cashTransfersOut: Types.Decimal128;
  expectedClosingCash: Types.Decimal128;
  declaredClosingCash: Types.Decimal128;
  cashVariance: Types.Decimal128;
  nonCashTotal: Types.Decimal128;

  paymentMethodTotals:
    PaymentMethodTotalRecord[];

  paymentCount: number;
  receiptCount: number;
  failedPaymentCount: number;
  unallocatedPaymentCount: number;
  unresolvedRefundCount: number;
  incompleteJournalCount: number;
  blockingIssueCodes: string[];
  varianceReason: string | null;
  overrideReason: string | null;
  overrideApprovalRequestId:
    Types.ObjectId | null;
  varianceApprovalRequestId:
    Types.ObjectId | null;
  approvedAt: Date | null;
  approvedBy: Types.ObjectId | null;
  closedAt: Date | null;
  snapshotHash: string;
}

export interface PaymentIntentRecord
extends PaymentCashierPersistenceMetadata {
  _id: Types.ObjectId;
  operationKey: string;
  intentNumber: string;
  patientAccountId: Types.ObjectId;
  patientId: Types.ObjectId;
  invoiceId: Types.ObjectId | null;
  cashierStaffId: Types.ObjectId | null;
  cashShiftId: Types.ObjectId | null;
  cashCounterId: Types.ObjectId | null;
  paymentMethod: string;
  amount: Types.Decimal128;
  currency: string;
  externalReference: string | null;
  status: PaymentIntentStatus;
  expiresAt: Date;
  authorizedAt: Date | null;
  completedPaymentId: Types.ObjectId | null;
  failureCode: string | null;
  failureMessage: string | null;
}

export interface PaymentRecord
extends PaymentCashierPersistenceMetadata {
  _id: Types.ObjectId;
  operationKey: string;
  paymentNumber?: string;
  receiptNumber: string;
  paymentIntentId: Types.ObjectId | null;
  patientAccountId: Types.ObjectId;
  patientId: Types.ObjectId;
  invoiceId: Types.ObjectId | null;
  cashierStaffId: Types.ObjectId | null;
  cashShiftId: Types.ObjectId | null;
  cashCounterId: Types.ObjectId | null;
  paymentMethod: string;
  amount: Types.Decimal128;
  allocatedAmount: Types.Decimal128;
  unallocatedAmount: Types.Decimal128;
  refundedAmount: Types.Decimal128;
  currency: string;
  externalReference: string | null;
  status: PaymentStatus;
  receivedAt: Date;
  receivedBy?: Types.ObjectId;
  postedAt: Date | null;
  postedBy: Types.ObjectId | null;
  failureCode: string | null;
  failureMessage: string | null;
  reversalId: Types.ObjectId | null;
}

export type PaymentTenderStatusRecord =
  | 'PENDING'
  | 'POSTED'
  | 'FAILED'
  | 'CANCELLED'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'REVERSED';

export interface PaymentTenderRecord
extends PaymentCashierPersistenceMetadata {
  _id: Types.ObjectId;
  operationKey: string;
  paymentId: Types.ObjectId;
  sequence: number;
  paymentMethodConfigurationId:
    Types.ObjectId;
  paymentMethodCodeSnapshot: string;
  paymentMethodKindSnapshot: string;
  amount: Types.Decimal128;
  currency: string;
  externalReference: string | null;
  maskedReference: string | null;
  referenceType: string | null;
  status: PaymentTenderStatusRecord;
  settledAt: Date | null;
  failureCode: string | null;
  failureMessage: string | null;
}

export interface PaymentAllocationRecord
extends PaymentCashierPersistenceMetadata {
  _id: Types.ObjectId;
  operationKey: string;
  paymentId: Types.ObjectId;
  patientAccountId: Types.ObjectId;
  invoiceId: Types.ObjectId | null;
  accountChargeId: Types.ObjectId | null;
  amount: Types.Decimal128;
  status: PaymentAllocationStatus;
  allocatedAt: Date;
  allocatedBy: Types.ObjectId;
  reversedAt: Date | null;
  reversedBy: Types.ObjectId | null;
  reversalReason: string | null;
}

export interface ReceiptPaymentMethodSummaryRecord {
  paymentMethodConfigurationId:
    Types.ObjectId;

  paymentMethodCodeSnapshot:
    string;

  amount:
    Types.Decimal128;

  externalReferenceMasked:
    string | null;
}

export interface ReceiptAllocationSummaryRecord {
  paymentAllocationId:
    Types.ObjectId;

  invoiceId:
    Types.ObjectId | null;

  accountChargeId:
    Types.ObjectId | null;

  amount:
    Types.Decimal128;
}

export interface PaymentReceiptRecord
extends PaymentCashierPersistenceMetadata {
  _id: Types.ObjectId;
  operationKey: string;
  receiptNumber: string;
  paymentId: Types.ObjectId;
  paymentIntentId: Types.ObjectId | null;
  patientId: Types.ObjectId;
  patientAccountId: Types.ObjectId;
  invoiceIds: Types.ObjectId[];
  cashCounterId: Types.ObjectId | null;
  cashShiftId: Types.ObjectId | null;
  cashierUserId: Types.ObjectId | null;
  cashierStaffId: Types.ObjectId | null;
  issuedAt: Date;
  currency: string;
  totalAmount: Types.Decimal128;
  allocatedAmount: Types.Decimal128;
  unallocatedAmount: Types.Decimal128;

  paymentMethodSummaries:
    ReceiptPaymentMethodSummaryRecord[];

  allocationSummaries:
    ReceiptAllocationSummaryRecord[];

  payerDisplayName: string | null;
  responsiblePartyType: string | null;
  status: PaymentReceiptStatus;
  originalReceiptId: Types.ObjectId | null;
  replacementReceiptId: Types.ObjectId | null;
  refundId: Types.ObjectId | null;
  paymentReversalId: Types.ObjectId | null;
  statusChangedAt: Date | null;
  statusChangedBy: Types.ObjectId | null;
  statusReason: string | null;
  printableProjectionVersion: number;
  printableProjectionHash: string;
}

export interface ReceiptReprintRecord
extends PaymentCashierPersistenceMetadata {
  _id: Types.ObjectId;
  reprintNumber: string;
  receiptId: Types.ObjectId;
  receiptNumberSnapshot: string;
  copyType: ReceiptCopyType;
  reason: string;
  printedBy: Types.ObjectId;
  printedAt: Date;
  cashCounterId: Types.ObjectId | null;
  cashShiftId: Types.ObjectId | null;
  outputFormat: 'PRINT' | 'PDF';
  projectionHash: string;
}

export interface DepositRecord
extends PaymentCashierPersistenceMetadata {
  _id: Types.ObjectId;
  depositNumber: string;
  patientId: Types.ObjectId;
  patientAccountId: Types.ObjectId | null;
  paymentId: Types.ObjectId;
  originalAmount: Types.Decimal128;
  availableAmount: Types.Decimal128;
  appliedAmount: Types.Decimal128;
  refundedAmount: Types.Decimal128;
  currency: string;
  status: DepositStatus;
  receivedAt: Date;
  expiresAt: Date | null;
}

export interface DepositApplicationRecord
extends PaymentCashierPersistenceMetadata {
  _id: Types.ObjectId;
  operationKey: string;
  applicationNumber: string;
  depositId: Types.ObjectId;
  patientId: Types.ObjectId;
  sourcePatientAccountId:
    Types.ObjectId | null;
  targetPatientAccountId:
    Types.ObjectId;
  targetInvoiceId:
    Types.ObjectId | null;
  amount: Types.Decimal128;
  currency: string;
  appliedAt: Date;
  appliedBy: Types.ObjectId;
  cashCounterId: Types.ObjectId | null;
  cashShiftId: Types.ObjectId | null;
  paymentAllocationId:
    Types.ObjectId | null;
  financialLedgerTransactionId:
    Types.ObjectId | null;
  recordType: 'APPLICATION' | 'REVERSAL';
  originalApplicationId:
    Types.ObjectId | null;
  reversalReason: string | null;
}

export interface DepositTransferRecord
extends PaymentCashierPersistenceMetadata {
  _id: Types.ObjectId;
  operationKey: string;
  transferNumber: string;
  sourceDepositId: Types.ObjectId;
  sourcePatientId: Types.ObjectId;
  sourcePatientAccountId:
    Types.ObjectId | null;
  destinationPatientId: Types.ObjectId;
  destinationPatientAccountId:
    Types.ObjectId | null;
  destinationDepositId:
    Types.ObjectId | null;
  amount: Types.Decimal128;
  currency: string;
  reasonCode: string;
  reason: string;
  approvalRequestId: Types.ObjectId;
  requestedBy: Types.ObjectId;
  approvedBy: Types.ObjectId;
  transferredAt: Date;
  financialLedgerTransactionId:
    Types.ObjectId;
  recordType: 'TRANSFER' | 'REVERSAL';
  originalTransferId:
    Types.ObjectId | null;
  reversalReason: string | null;
}

export interface RefundRequestRecord
extends PaymentCashierPersistenceMetadata {
  _id: Types.ObjectId;
  requestNumber: string;
  operationKey: string;
  patientAccountId: Types.ObjectId;
  patientId: Types.ObjectId;
  paymentId: Types.ObjectId | null;
  depositId: Types.ObjectId | null;
  creditNoteId: Types.ObjectId | null;
  amount: Types.Decimal128;
  currency: string;
  reasonCode: string;
  reason: string;
  approvalRequestId: Types.ObjectId;
  status: RefundRequestStatus;
  completedRefundId:
    Types.ObjectId | null;
}

export interface RefundRecord
extends PaymentCashierPersistenceMetadata {
  _id: Types.ObjectId;
  operationKey: string;
  refundNumber: string;
  refundRequestId: Types.ObjectId;
  patientAccountId: Types.ObjectId;
  patientId: Types.ObjectId;
  paymentId: Types.ObjectId | null;
  depositId: Types.ObjectId | null;
  amount: Types.Decimal128;
  currency: string;
  paymentMethod: string;
  externalReference: string | null;
  status: RefundStatus;
  postedAt: Date | null;
  postedBy: Types.ObjectId | null;
  failureCode: string | null;
  failureMessage: string | null;
}

export interface PaymentReversalRecord
extends PaymentCashierPersistenceMetadata {
  _id: Types.ObjectId;
  operationKey: string;
  reversalNumber: string;
  paymentId: Types.ObjectId;
  patientAccountId: Types.ObjectId;
  amount: Types.Decimal128;
  reasonCode: string;
  reason: string;
  approvalRequestId: Types.ObjectId;
  status: PaymentReversalStatus;
  postedAt: Date | null;
  postedBy: Types.ObjectId | null;
  failureCode: string | null;
}

export interface CashMovementRecord
extends PaymentCashierPersistenceMetadata {
  _id: Types.ObjectId;
  operationKey: string;
  movementNumber: string;
  movementType: CashMovementType;
  status: CashMovementStatus;
  amount: Types.Decimal128;
  currency: string;
  sourceCounterId: Types.ObjectId | null;
  sourceShiftId: Types.ObjectId | null;
  destinationCounterId:
    Types.ObjectId | null;
  destinationShiftId:
    Types.ObjectId | null;
  destinationSafeReference:
    string | null;
  sourceDocumentType:
    string | null;
  sourceDocumentId:
    Types.ObjectId | null;
  reasonCode: string;
  reason: string;
  requestedBy: Types.ObjectId;
  requestedAt: Date;
  approvalRequestId:
    Types.ObjectId | null;
  approvedBy: Types.ObjectId | null;
  approvedAt: Date | null;
  rejectedBy: Types.ObjectId | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  postedBy: Types.ObjectId | null;
  postedAt: Date | null;
  financialLedgerTransactionId:
    Types.ObjectId | null;
  expectedCashEffect:
    Types.Decimal128;
  reversalOfCashMovementId:
    Types.ObjectId | null;
  reversedByCashMovementId:
    Types.ObjectId | null;
  reversalReason: string | null;
}

export interface PaymentOperationalHistoryRecord
extends PaymentCashierPersistenceMetadata {
  _id: Types.ObjectId;
  operationKey: string;
  eventNumber: string;
  entityType:
    PaymentOperationalEntityType;
  entityId: Types.ObjectId;
  action:
    PaymentOperationalAction;
  statusFrom: string | null;
  statusTo: string | null;
  amount: Types.Decimal128 | null;
  currency: string | null;
  reasonCode: string | null;
  reason: string | null;
  actorUserId: Types.ObjectId;
  actorStaffId: Types.ObjectId | null;
  approvalRequestId:
    Types.ObjectId | null;
  cashCounterId: Types.ObjectId | null;
  cashShiftId: Types.ObjectId | null;
  paymentMethodConfigurationId:
    Types.ObjectId | null;
  patientId: Types.ObjectId | null;
  patientAccountId:
    Types.ObjectId | null;
  invoiceId: Types.ObjectId | null;
  paymentId: Types.ObjectId | null;
  refundId: Types.ObjectId | null;
  receiptId: Types.ObjectId | null;
  occurredAt: Date;
  snapshotHash: string;
  metadata: Record<string, unknown>;
}

export interface PatientAccountFinancialRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  patientId: Types.ObjectId;
  currency: string;
  status: string;
  paymentsAppliedTotal:
    Types.Decimal128;
  outstandingBalance:
    Types.Decimal128;
  refundableBalance:
    Types.Decimal128;
  version: number;
}

export interface InvoiceFinancialRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  patientAccountId:
    Types.ObjectId;
  patientId: Types.ObjectId;
  invoiceNumber: string;
  status: string;
  currency: string;
  paymentsAppliedAmount:
    Types.Decimal128;
  outstandingAmount:
    Types.Decimal128;
  refundableAmount:
    Types.Decimal128;
  finalizedAt: Date | null;
  version: number;
}

export interface FinancialApprovalRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  approvalType: string;
  paymentId: Types.ObjectId | null;
  requestedAmount:
    Types.Decimal128 | null;
  reason: string;
  status: string;
  requestedBy: Types.ObjectId;
  requestedAt: Date;
  decidedBy: Types.ObjectId | null;
  decidedAt: Date | null;
  decisionReason: string | null;
  expiresAt: Date | null;
  version: number;
}

export interface FinancialLedgerTransactionRecord
extends PaymentCashierPersistenceMetadata {
  _id: Types.ObjectId;
  operationKey: string;
  journalNumber: string;
  sourceModule: string;
  sourceEntityType: string;
  sourceEntityId: Types.ObjectId;
  patientId: Types.ObjectId | null;
  patientAccountId:
    Types.ObjectId | null;
  invoiceId: Types.ObjectId | null;
  paymentId: Types.ObjectId | null;
  cashShiftId: Types.ObjectId | null;
  cashCounterId: Types.ObjectId | null;
  currency: string;
  totalDebit: Types.Decimal128;
  totalCredit: Types.Decimal128;
  entryCount: number;
  status: 'POSTED' | 'REVERSED';
  postedAt: Date;
  postedBy: Types.ObjectId;
  description: string;
  reversalOfTransactionId:
    Types.ObjectId | null;
  reversedByTransactionId:
    Types.ObjectId | null;
  reversalReason: string | null;
  closedPeriodCode: string | null;
}

export type PaymentMethodConfigurationUpdate =
  Partial<
    Pick<
      PaymentMethodConfigurationRecord,
      | 'name'
      | 'description'
      | 'methodKind'
      | 'active'
      | 'effectiveFrom'
      | 'effectiveThrough'
      | 'allowedCurrencies'
      | 'externalReferenceRequired'
      | 'bankReferenceRequired'
      | 'cardReferenceRequired'
      | 'cashEquivalent'
      | 'refundEligible'
      | 'reversalEligible'
      | 'settlementMode'
      | 'settlementDelayHours'
      | 'permissionCodes'
      | 'cashLedgerAccountId'
      | 'clearingLedgerAccountId'
      | 'receivableLedgerAccountId'
      | 'externalProviderCode'
      | 'requiresOpenCashierShift'
      | 'deactivatedAt'
      | 'deactivatedBy'
      | 'deactivationReason'
      | 'updatedBy'
    >
  >;

export type CashCounterUpdate =
  Partial<
    Pick<
      CashCounterRecord,
      | 'name'
      | 'location'
      | 'departmentId'
      | 'counterType'
      | 'active'
      | 'assignedUserIds'
      | 'allowedPaymentMethodConfigurationIds'
      | 'cashHoldingLimit'
      | 'openingFloatRequired'
      | 'minimumOpeningFloat'
      | 'maximumOpeningFloat'
      | 'activeShiftPolicy'
      | 'supervisorApprovalRequiredForClose'
      | 'negativeExpectedCashAllowed'
      | 'deactivatedAt'
      | 'deactivatedBy'
      | 'deactivationReason'
      | 'updatedBy'
    >
  >;

export type CashierShiftUpdate =
  Partial<
    Pick<
      CashierShiftRecord,
      | 'status'
      | 'suspendedAt'
      | 'suspendedBy'
      | 'suspensionReason'
      | 'closingStartedAt'
      | 'closingStartedBy'
      | 'closedAt'
      | 'closedBy'
      | 'expectedCash'
      | 'declaredCash'
      | 'cashVariance'
      | 'nonCashTotal'
      | 'paymentMethodTotals'
      | 'refundTotal'
      | 'reversalTotal'
      | 'depositTotal'
      | 'advanceTotal'
      | 'firstReceiptNumber'
      | 'lastReceiptNumber'
      | 'receiptCount'
      | 'paymentCount'
      | 'notes'
      | 'handoverToUserId'
      | 'handoverAt'
      | 'handoverNotes'
      | 'shiftReconciliationId'
      | 'closingApprovalRequestId'
      | 'varianceApprovalRequestId'
      | 'reopenedFromShiftId'
      | 'reopenApprovalRequestId'
      | 'reopenReason'
      | 'updatedBy'
    >
  >;

export type PaymentUpdate =
  Partial<
    Pick<
      PaymentRecord,
      | 'allocatedAmount'
      | 'unallocatedAmount'
      | 'refundedAmount'
      | 'status'
      | 'postedAt'
      | 'postedBy'
      | 'failureCode'
      | 'failureMessage'
      | 'reversalId'
      | 'updatedBy'
    >
  >;