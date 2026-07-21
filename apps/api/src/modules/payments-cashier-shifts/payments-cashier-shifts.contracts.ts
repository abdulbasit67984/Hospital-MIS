import type {
  ActiveShiftPolicy,
  CashCounterType,
  CashierShiftStatus,
  CashMovementStatus,
  CashMovementType,
  DepositStatus,
  PaymentAllocationStatus,
  PaymentCashierAccessAction,
  PaymentCashierCurrency,
  PaymentCashierObjectIdString,
  PaymentCashierPermissionKey,
  PaymentCashierSortDirection,
  PaymentCashierSortField,
  PaymentIntentStatus,
  PaymentMethodCode,
  PaymentMethodKind,
  PaymentReceiptStatus,
  PaymentReversalStatus,
  PaymentSettlementMode,
  PaymentStatus,
  ReceiptCopyType,
  RefundRequestStatus,
  RefundStatus,
  ShiftReconciliationStatus,
} from './payments-cashier-shifts.constants.js';

export interface PaymentCashierActorContext {
  userId: PaymentCashierObjectIdString;
  facilityId: PaymentCashierObjectIdString;
  correlationId: string;
  roleKeys: readonly string[];
  permissionKeys: ReadonlySet<string>;
  staffId: PaymentCashierObjectIdString;
  departmentId: PaymentCashierObjectIdString | null;
  displayName: string;
  active: boolean;
  assignedCounterIds:
    readonly PaymentCashierObjectIdString[];
  ipAddress?: string;
  userAgent?: string;
  breakGlassReason?: string;
}

export interface PaymentCashierAccessRequest {
  actor: PaymentCashierActorContext;
  action: PaymentCashierAccessAction;
  resourceFacilityId?: PaymentCashierObjectIdString;
  counterId?: PaymentCashierObjectIdString | null;
  cashierUserId?: PaymentCashierObjectIdString | null;
  makerUserId?: PaymentCashierObjectIdString | null;
  paymentMethodPermissionCodes?: readonly string[];
  manualOperation?: boolean;
  sensitiveAmount?: boolean;
}

export interface PaymentCashierAccessDecision {
  allowed: boolean;

  accessMode:
    | 'FULL'
    | 'COUNTER_SCOPED'
    | 'CASHIER_SCOPED'
    | 'READ_ONLY'
    | 'DENIED';

  requiredPermission:
    PaymentCashierPermissionKey;

  minimumNecessaryFields:
    readonly string[];

  auditSensitiveRead:
    boolean;

  requiresIndependentApproval:
    boolean;

  denialReason?: string;
}

export interface PaymentCashierPage<T> {
  items: readonly T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PaymentCashierListQuery {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  status?: readonly string[];
  counterId?: PaymentCashierObjectIdString;
  cashierUserId?: PaymentCashierObjectIdString;
  paymentMethodConfigurationId?:
    PaymentCashierObjectIdString;
  patientId?: PaymentCashierObjectIdString;
  patientAccountId?: PaymentCashierObjectIdString;
  invoiceId?: PaymentCashierObjectIdString;
  search?: string;
  sortBy?: PaymentCashierSortField;
  sortDirection?: PaymentCashierSortDirection;
}

export interface CreatePaymentMethodConfigurationInput {
  code: string;
  name: string;
  description?: string | null;
  methodCode: PaymentMethodCode;
  methodKind: PaymentMethodKind;
  effectiveFrom: string;
  effectiveThrough?: string | null;
  allowedCurrencies:
    readonly PaymentCashierCurrency[];
  externalReferenceRequired?: boolean;
  bankReferenceRequired?: boolean;
  cardReferenceRequired?: boolean;
  cashEquivalent?: boolean;
  refundEligible?: boolean;
  reversalEligible?: boolean;
  settlementMode?: PaymentSettlementMode;
  settlementDelayHours?: number | null;
  permissionCodes?: readonly string[];
  cashLedgerAccountId?:
    PaymentCashierObjectIdString | null;
  clearingLedgerAccountId?:
    PaymentCashierObjectIdString | null;
  receivableLedgerAccountId?:
    PaymentCashierObjectIdString | null;
  externalProviderCode?: string | null;
  requiresOpenCashierShift?: boolean;
}

export interface UpdatePaymentMethodConfigurationInput
extends Partial<
  Omit<
    CreatePaymentMethodConfigurationInput,
    'code' | 'methodCode'
  >
> {
  expectedVersion: number;
}

export interface ChangePaymentMethodStatusInput {
  expectedVersion: number;
  active: boolean;
  reason: string;
}

export interface CreateCashCounterInput {
  counterCode: string;
  name: string;
  location: string;
  departmentId?:
    PaymentCashierObjectIdString | null;
  counterType: CashCounterType;
  assignedUserIds?:
    readonly PaymentCashierObjectIdString[];
  allowedPaymentMethodConfigurationIds:
    readonly PaymentCashierObjectIdString[];
  currency?: PaymentCashierCurrency;
  cashHoldingLimit: string;
  openingFloatRequired?: boolean;
  minimumOpeningFloat?: string;
  maximumOpeningFloat?: string;
  activeShiftPolicy?: ActiveShiftPolicy;
  supervisorApprovalRequiredForClose?: boolean;
  negativeExpectedCashAllowed?: boolean;
}

export interface UpdateCashCounterInput
extends Partial<
  Omit<
    CreateCashCounterInput,
    'counterCode'
  >
> {
  expectedVersion: number;
}

export interface ChangeCashCounterStatusInput {
  expectedVersion: number;
  active: boolean;
  reason: string;
}

export interface AssignCashCounterUsersInput {
  expectedVersion: number;
  assignedUserIds:
    readonly PaymentCashierObjectIdString[];
  reason: string;
}

export interface OpenCashierShiftInput {
  cashCounterId: PaymentCashierObjectIdString;
  openingFloat: string;
  currency?: PaymentCashierCurrency;
  supervisorUserId?:
    PaymentCashierObjectIdString | null;
  notes?: string | null;
}

export interface SuspendCashierShiftInput {
  expectedVersion: number;
  reason: string;
}

export interface ResumeCashierShiftInput {
  expectedVersion: number;
  reason: string;
}

export interface HandoverCashierShiftInput {
  expectedVersion: number;
  handoverToUserId:
    PaymentCashierObjectIdString;
  notes: string;
}

export interface BeginShiftClosingInput {
  expectedVersion: number;
  declaredCash: string;
  paymentMethodDeclarations?:
    readonly PaymentMethodDeclarationInput[];
  varianceReason?: string | null;
  notes?: string | null;
}

export interface PaymentMethodDeclarationInput {
  paymentMethodConfigurationId:
    PaymentCashierObjectIdString;
  declaredAmount: string;
}

export interface ApproveShiftVarianceInput {
  expectedVersion: number;
  approvalRequestId:
    PaymentCashierObjectIdString;
  decisionReason: string;
}

export interface CloseCashierShiftInput {
  expectedVersion: number;
  reconciliationId:
    PaymentCashierObjectIdString;
  closingApprovalRequestId:
    PaymentCashierObjectIdString;
  overrideApprovalRequestId?:
    PaymentCashierObjectIdString | null;
  reason?: string | null;
}

export interface ReopenCashierShiftInput {
  expectedVersion: number;
  approvalRequestId:
    PaymentCashierObjectIdString;
  reason: string;
}

export type PaymentIntentPurpose =
  | 'ACCOUNT_PAYMENT'
  | 'INVOICE_PAYMENT'
  | 'PATIENT_DEPOSIT'
  | 'ADMISSION_DEPOSIT'
  | 'PROCEDURE_DEPOSIT'
  | 'GENERAL_ADVANCE'
  | 'REFUND';

export interface CreatePaymentIntentInput {
  patientAccountId:
    PaymentCashierObjectIdString;
  invoiceId?:
    PaymentCashierObjectIdString | null;
  purpose: PaymentIntentPurpose;
  amount: string;
  currency?: PaymentCashierCurrency;
  paymentMethodConfigurationId:
    PaymentCashierObjectIdString;
  cashCounterId?:
    PaymentCashierObjectIdString | null;
  cashShiftId?:
    PaymentCashierObjectIdString | null;
  externalReference?: string | null;
  expiresInMinutes?: number;
  payerName?: string | null;
  responsiblePartyType?: string | null;
}

export interface CancelPaymentIntentInput {
  expectedVersion: number;
  reason: string;
}

export interface AuthorizePaymentIntentInput {
  expectedVersion: number;
  externalReference: string;
  authorizedAt: string;
}

export interface PaymentTenderInput {
  paymentMethodConfigurationId:
    PaymentCashierObjectIdString;
  amount: string;
  externalReference?: string | null;
  maskedReference?: string | null;

  referenceType?:
    | 'CARD_AUTHORIZATION'
    | 'BANK_REFERENCE'
    | 'CHEQUE_REFERENCE'
    | 'WALLET_REFERENCE'
    | 'ONLINE_REFERENCE'
    | 'OTHER';
}

export interface PaymentAllocationInput {
  invoiceId?:
    PaymentCashierObjectIdString | null;
  accountChargeId?:
    PaymentCashierObjectIdString | null;
  amount: string;
}

export interface CollectPaymentInput {
  patientAccountId:
    PaymentCashierObjectIdString;
  invoiceId?:
    PaymentCashierObjectIdString | null;
  paymentIntentId?:
    PaymentCashierObjectIdString | null;
  cashCounterId:
    PaymentCashierObjectIdString;
  cashShiftId:
    PaymentCashierObjectIdString;
  totalAmount: string;
  currency?: PaymentCashierCurrency;
  tenders: readonly PaymentTenderInput[];
  allocations?:
    readonly PaymentAllocationInput[];
  payerName?: string | null;
  responsiblePartyType?: string | null;
  receivedAt?: string;
  manualPayment?: boolean;
  notes?: string | null;
}

export interface AllocatePaymentInput {
  expectedPaymentVersion: number;
  allocations:
    readonly PaymentAllocationInput[];
}

export interface ReversePaymentAllocationInput {
  expectedPaymentVersion: number;
  allocationIds:
    readonly PaymentCashierObjectIdString[];
  reasonCode: string;
  reason: string;
  approvalRequestId?:
    PaymentCashierObjectIdString | null;
}

export type DepositType =
  | 'PATIENT'
  | 'ADMISSION'
  | 'PROCEDURE'
  | 'GENERAL_ADVANCE';

export interface CreateDepositInput {
  paymentId:
    PaymentCashierObjectIdString;
  patientAccountId?:
    PaymentCashierObjectIdString | null;
  depositType: DepositType;
  admissionId?:
    PaymentCashierObjectIdString | null;
  procedureReferenceId?:
    PaymentCashierObjectIdString | null;
  expiresAt?: string | null;
}

export interface ApplyDepositInput {
  expectedDepositVersion: number;
  targetPatientAccountId:
    PaymentCashierObjectIdString;
  targetInvoiceId?:
    PaymentCashierObjectIdString | null;
  amount: string;
}

export interface TransferDepositInput {
  expectedDepositVersion: number;
  destinationPatientId:
    PaymentCashierObjectIdString;
  destinationPatientAccountId?:
    PaymentCashierObjectIdString | null;
  amount: string;
  reasonCode: string;
  reason: string;
  approvalRequestId:
    PaymentCashierObjectIdString;
}

export interface ReleaseDepositInput {
  expectedDepositVersion: number;
  amount: string;
  reasonCode: string;
  reason: string;
  approvalRequestId?:
    PaymentCashierObjectIdString | null;
}

export interface ReprintReceiptInput {
  copyType: ReceiptCopyType;
  outputFormat: 'PRINT' | 'PDF';
  reason: string;
}

export interface CreateRefundRequestInput {
  patientAccountId:
    PaymentCashierObjectIdString;
  paymentId?:
    PaymentCashierObjectIdString | null;
  depositId?:
    PaymentCashierObjectIdString | null;
  creditNoteId?:
    PaymentCashierObjectIdString | null;
  amount: string;
  reasonCode: string;
  reason: string;
  supportingReference?: string | null;
}

export interface DecideRefundRequestInput {
  expectedVersion: number;
  decision: 'APPROVE' | 'REJECT';
  decisionReason: string;
}

export interface ProcessRefundInput {
  expectedRequestVersion: number;
  paymentMethodConfigurationId:
    PaymentCashierObjectIdString;
  cashCounterId?:
    PaymentCashierObjectIdString | null;
  cashShiftId?:
    PaymentCashierObjectIdString | null;
  externalReference?: string | null;
}

export interface ReverseRefundInput {
  expectedRefundVersion: number;
  reasonCode: string;
  reason: string;
  approvalRequestId:
    PaymentCashierObjectIdString;
}

export interface CreatePaymentReversalInput {
  paymentId:
    PaymentCashierObjectIdString;
  amount: string;
  reasonCode: string;
  reason: string;
  replacementPaymentId?:
    PaymentCashierObjectIdString | null;
}

export interface DecidePaymentReversalInput {
  expectedVersion: number;
  decision: 'APPROVE' | 'REJECT';
  decisionReason: string;
}

export interface PostPaymentReversalInput {
  expectedVersion: number;
  cashCounterId?:
    PaymentCashierObjectIdString | null;
  cashShiftId?:
    PaymentCashierObjectIdString | null;
}

export interface CreateCashMovementInput {
  movementType: CashMovementType;
  amount: string;
  currency?: PaymentCashierCurrency;
  sourceCounterId?:
    PaymentCashierObjectIdString | null;
  sourceShiftId?:
    PaymentCashierObjectIdString | null;
  destinationCounterId?:
    PaymentCashierObjectIdString | null;
  destinationShiftId?:
    PaymentCashierObjectIdString | null;
  destinationSafeReference?: string | null;
  sourceDocumentType?: string | null;
  sourceDocumentId?:
    PaymentCashierObjectIdString | null;
  reasonCode: string;
  reason: string;
}

export interface DecideCashMovementInput {
  expectedVersion: number;
  decision: 'APPROVE' | 'REJECT';
  decisionReason: string;
}

export interface PostCashMovementInput {
  expectedVersion: number;
}

export interface PaymentMethodConfigurationView {
  id: string;
  code: string;
  name: string;
  description: string | null;
  methodCode: PaymentMethodCode;
  methodKind: PaymentMethodKind;
  active: boolean;
  effectiveFrom: string;
  effectiveThrough: string | null;
  allowedCurrencies: readonly string[];
  externalReferenceRequired: boolean;
  bankReferenceRequired: boolean;
  cardReferenceRequired: boolean;
  cashEquivalent: boolean;
  refundEligible: boolean;
  reversalEligible: boolean;
  settlementMode: PaymentSettlementMode;
  settlementDelayHours: number | null;
  permissionCodes: readonly string[];
  requiresOpenCashierShift: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CashCounterView {
  id: string;
  counterCode: string;
  name: string;
  location: string;
  departmentId: string | null;
  counterType: CashCounterType;
  active: boolean;
  assignedUserIds: readonly string[];
  allowedPaymentMethodConfigurationIds:
    readonly string[];
  currency: string;
  cashHoldingLimit: string;
  openingFloatRequired: boolean;
  minimumOpeningFloat: string;
  maximumOpeningFloat: string;
  activeShiftPolicy: ActiveShiftPolicy;
  supervisorApprovalRequiredForClose: boolean;
  negativeExpectedCashAllowed: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentMethodTotalView {
  paymentMethodConfigurationId: string;
  paymentMethodCode: string;
  collectedAmount: string;
  refundedAmount: string;
  reversedAmount: string;
  netAmount: string;
  transactionCount: number;
}

export interface CashierShiftView {
  id: string;
  shiftNumber: string;
  cashCounterId: string;
  cashierUserId: string;
  cashierStaffId: string | null;
  supervisorUserId: string | null;
  currency: string;
  status: CashierShiftStatus;
  openedAt: string;
  openingFloat: string;
  suspendedAt: string | null;
  closingStartedAt: string | null;
  closedAt: string | null;
  expectedCash: string;
  declaredCash: string;
  cashVariance: string;
  nonCashTotal: string;
  paymentMethodTotals:
    readonly PaymentMethodTotalView[];
  refundTotal: string;
  reversalTotal: string;
  depositTotal: string;
  advanceTotal: string;
  firstReceiptNumber: string | null;
  lastReceiptNumber: string | null;
  receiptCount: number;
  paymentCount: number;
  handoverToUserId: string | null;
  handoverAt: string | null;
  shiftReconciliationId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftReconciliationView {
  id: string;
  reconciliationNumber: string;
  cashShiftId: string;
  cashCounterId: string;
  cashierUserId: string;
  status: ShiftReconciliationStatus;
  currency: string;
  calculatedAt: string;
  openingFloat: string;
  cashCollections: string;
  cashRefunds: string;
  cashPaidOut: string;
  cashDrops: string;
  safeDeposits: string;
  cashTransfersIn: string;
  cashTransfersOut: string;
  expectedClosingCash: string;
  declaredClosingCash: string;
  cashVariance: string;
  nonCashTotal: string;
  paymentMethodTotals:
    readonly PaymentMethodTotalView[];
  paymentCount: number;
  receiptCount: number;
  failedPaymentCount: number;
  unallocatedPaymentCount: number;
  unresolvedRefundCount: number;
  incompleteJournalCount: number;
  blockingIssueCodes: readonly string[];
  varianceReason: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  closedAt: string | null;
  version: number;
}

export interface PaymentIntentView {
  id: string;
  intentNumber: string;
  patientId: string;
  patientAccountId: string;
  invoiceId: string | null;
  paymentMethod: string;
  amount: string;
  currency: string;
  status: PaymentIntentStatus;
  expiresAt: string;
  authorizedAt: string | null;
  completedPaymentId: string | null;
  failureCode: string | null;
  externalReferenceMasked: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type PaymentTenderStatus =
  | 'PENDING'
  | 'POSTED'
  | 'FAILED'
  | 'CANCELLED'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'REVERSED';

export interface PaymentTenderView {
  id: string;
  paymentId: string;
  sequence: number;
  paymentMethodConfigurationId: string;
  paymentMethodCode: string;
  amount: string;
  externalReferenceMasked: string | null;
  status: PaymentTenderStatus;
  settledAt: string | null;
  version: number;
}

export interface PaymentAllocationView {
  id: string;
  paymentId: string;
  patientAccountId: string;
  invoiceId: string | null;
  accountChargeId: string | null;
  amount: string;
  status: PaymentAllocationStatus;
  allocatedAt: string;
  allocatedBy: string;
  reversedAt: string | null;
  reversedBy: string | null;
  reversalReason: string | null;
  version: number;
}

export interface PaymentView {
  id: string;
  paymentNumber: string;
  receiptNumber: string;
  patientId: string;
  patientAccountId: string;
  invoiceId: string | null;
  paymentIntentId: string | null;
  amount: string;
  allocatedAmount: string;
  unallocatedAmount: string;
  refundedAmount: string;
  currency: string;
  paymentMethod: string;
  externalReferenceMasked: string | null;
  tenders: readonly PaymentTenderView[];
  status: PaymentStatus;
  receivedAt: string;
  postedAt: string | null;
  receivedBy: string;
  cashierStaffId: string | null;
  cashShiftId: string | null;
  cashCounterId: string | null;
  allocations:
    readonly PaymentAllocationView[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentReceiptView {
  id: string;
  receiptNumber: string;
  paymentId: string;
  patientId: string;
  patientAccountId: string;
  invoiceIds: readonly string[];
  cashCounterId: string | null;
  cashShiftId: string | null;
  cashierUserId: string | null;
  issuedAt: string;
  currency: string;
  totalAmount: string;
  allocatedAmount: string;
  unallocatedAmount: string;

  paymentMethods:
    readonly Readonly<{
      paymentMethodConfigurationId: string;
      paymentMethodCode: string;
      amount: string;
      externalReferenceMasked: string | null;
    }>[];

  allocations:
    readonly Readonly<{
      paymentAllocationId: string;
      invoiceId: string | null;
      accountChargeId: string | null;
      amount: string;
    }>[];

  status: PaymentReceiptStatus;
  originalReceiptId: string | null;
  replacementReceiptId: string | null;
  refundId: string | null;
  paymentReversalId: string | null;
  printableProjectionVersion: number;
}

export interface DepositView {
  id: string;
  depositNumber: string;
  patientId: string;
  patientAccountId: string | null;
  paymentId: string;
  originalAmount: string;
  availableAmount: string;
  appliedAmount: string;
  refundedAmount: string;
  currency: string;
  status: DepositStatus;
  receivedAt: string;
  expiresAt: string | null;
  version: number;
}

export interface RefundRequestView {
  id: string;
  requestNumber: string;
  patientId: string;
  patientAccountId: string;
  paymentId: string | null;
  depositId: string | null;
  creditNoteId: string | null;
  amount: string;
  currency: string;
  reasonCode: string;
  reason: string;
  approvalRequestId: string;
  status: RefundRequestStatus;
  completedRefundId: string | null;
  version: number;
  createdAt: string;
}

export interface RefundView {
  id: string;
  refundNumber: string;
  refundRequestId: string;
  patientId: string;
  patientAccountId: string;
  paymentId: string | null;
  depositId: string | null;
  amount: string;
  currency: string;
  paymentMethod: string;
  externalReferenceMasked: string | null;
  status: RefundStatus;
  postedAt: string | null;
  postedBy: string | null;
  failureCode: string | null;
  version: number;
}

export interface PaymentReversalView {
  id: string;
  reversalNumber: string;
  paymentId: string;
  patientAccountId: string;
  amount: string;
  reasonCode: string;
  reason: string;
  approvalRequestId: string;
  status: PaymentReversalStatus;
  postedAt: string | null;
  postedBy: string | null;
  failureCode: string | null;
  version: number;
}

export interface CashMovementView {
  id: string;
  movementNumber: string;
  movementType: CashMovementType;
  status: CashMovementStatus;
  amount: string;
  currency: string;
  sourceCounterId: string | null;
  sourceShiftId: string | null;
  destinationCounterId: string | null;
  destinationShiftId: string | null;
  reasonCode: string;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  postedBy: string | null;
  postedAt: string | null;
  expectedCashEffect: string;
  version: number;
}