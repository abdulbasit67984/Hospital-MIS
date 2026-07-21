import {
  allocationStatusValues,
  approvalStatusValues,
  approvalTypeValues,
  billingContextValues,
  chargeCatalogStatusValues,
  chargeCategoryStatusValues,
  chargeRuleTypeValues,
  chargeSourceModuleValues,
  chargeStatusValues,
  chargeTypeValues,
  depositStatusValues,
  discountScopeValues,
  discountTypeValues,
  financialNoteStatusValues,
  invoiceStatusValues,
  invoiceTypeValues,
  packageEnrollmentStatusValues,
  packageStatusValues,
  packageUtilizationStatusValues,
  patientAccountStatusValues,
  patientAccountTypeValues,
  paymentIntentStatusValues,
  paymentMethodValues,
  paymentReversalStatusValues,
  paymentStatusValues,
  priceListStatusValues,
  priceListTypeValues,
  rateStatusValues,
  refundRequestStatusValues,
  refundStatusValues,
  responsiblePartyTypeValues,
  roundingModeValues,
  taxCalculationModeValues,
} from '@hospital-mis/database';

import type {
  UnifiedBillingAccountSortField,
  UnifiedBillingCatalogSortField,
  UnifiedBillingChargeSortField,
  UnifiedBillingInvoiceSortField,
} from './unified-billing.constants.js';

export type BillingObjectIdString = string;
export type BillingSortDirection = 'asc' | 'desc';

export type BillingContext = (typeof billingContextValues)[number];
export type ChargeCategoryStatus =
  (typeof chargeCategoryStatusValues)[number];
export type ChargeCatalogStatus =
  (typeof chargeCatalogStatusValues)[number];
export type ChargeType = (typeof chargeTypeValues)[number];
export type ChargeRuleType = (typeof chargeRuleTypeValues)[number];
export type ChargeSourceModule =
  (typeof chargeSourceModuleValues)[number];
export type ChargeStatus = (typeof chargeStatusValues)[number];
export type PriceListStatus = (typeof priceListStatusValues)[number];
export type PriceListType = (typeof priceListTypeValues)[number];
export type ServiceRateStatus = (typeof rateStatusValues)[number];
export type TaxCalculationMode =
  (typeof taxCalculationModeValues)[number];
export type BillingRoundingMode = (typeof roundingModeValues)[number];
export type TreatmentPackageStatus = (typeof packageStatusValues)[number];
export type PackageEnrollmentStatus =
  (typeof packageEnrollmentStatusValues)[number];
export type PackageUtilizationStatus =
  (typeof packageUtilizationStatusValues)[number];
export type PatientAccountType =
  (typeof patientAccountTypeValues)[number];
export type PatientAccountStatus =
  (typeof patientAccountStatusValues)[number];
export type ResponsiblePartyType =
  (typeof responsiblePartyTypeValues)[number];
export type InvoiceStatus = (typeof invoiceStatusValues)[number];
export type InvoiceType = (typeof invoiceTypeValues)[number];
export type FinancialNoteStatus =
  (typeof financialNoteStatusValues)[number];
export type DiscountType = (typeof discountTypeValues)[number];
export type DiscountScope = (typeof discountScopeValues)[number];
export type FinancialApprovalType =
  (typeof approvalTypeValues)[number];
export type FinancialApprovalStatus =
  (typeof approvalStatusValues)[number];
export type PaymentMethod = (typeof paymentMethodValues)[number];
export type PaymentIntentStatus =
  (typeof paymentIntentStatusValues)[number];
export type PaymentStatus = (typeof paymentStatusValues)[number];
export type PaymentAllocationStatus =
  (typeof allocationStatusValues)[number];
export type DepositStatus = (typeof depositStatusValues)[number];
export type RefundRequestStatus =
  (typeof refundRequestStatusValues)[number];
export type RefundStatus = (typeof refundStatusValues)[number];
export type PaymentReversalStatus =
  (typeof paymentReversalStatusValues)[number];

export interface UnifiedBillingActorContext {
  userId: BillingObjectIdString;
  facilityId: BillingObjectIdString;
  correlationId: string;
  roleKeys: readonly string[];
  permissionKeys: readonly string[];
  staffId?: BillingObjectIdString | null;
  departmentId?: BillingObjectIdString | null;
  ipAddress?: string;
  userAgent?: string;
  breakGlassReason?: string;
}

export interface UnifiedBillingStaffContext {
  userId: BillingObjectIdString;
  staffId: BillingObjectIdString;
  facilityId: BillingObjectIdString;
  departmentId: BillingObjectIdString | null;
  displayName: string;
  professionalType: string | null;
}

export interface BillingPatientSnapshot {
  patientId: BillingObjectIdString;
  mrn: string | null;
  displayName: string;
  status: string;
}

export interface BillingPayerSnapshot {
  sequence: 1 | 2;
  payerOrganizationId: BillingObjectIdString;
  panelPlanId: BillingObjectIdString | null;
  patientCoverageId: BillingObjectIdString | null;
  payerName: string;
  planName: string | null;
  membershipNumber: string | null;
  authorizationReference: string | null;
  coverageLimit: string | null;
  copay: string;
  coinsurancePercentage: string;
  deductible: string;
  coverageEffectiveFrom: string | null;
  coverageEffectiveThrough: string | null;
}

export interface AuthoritativeBillingSourceContext {
  facilityId: BillingObjectIdString;
  sourceModule: ChargeSourceModule;
  sourceRecordType: string;
  sourceRecordId: BillingObjectIdString;
  sourceLineId: BillingObjectIdString | null;
  sourceOccurredAt: string;
  sourceStatus: string;
  billable: boolean;
  unbillableReason: string | null;
  patient: BillingPatientSnapshot;
  billingContext: BillingContext;
  registrationId: BillingObjectIdString | null;
  opdVisitId: BillingObjectIdString | null;
  encounterId: BillingObjectIdString | null;
  admissionId: BillingObjectIdString | null;
  emergencyVisitId: BillingObjectIdString | null;
  departmentId: BillingObjectIdString | null;
  locationId: BillingObjectIdString | null;
  serviceLineCode: string | null;
  serviceFrom: string;
  serviceThrough: string | null;
}

export interface AuthoritativeBillingAccountContext {
  source: AuthoritativeBillingSourceContext;
  actor: UnifiedBillingStaffContext;
  accountType: PatientAccountType;
  payerSnapshots: readonly BillingPayerSnapshot[];
  responsiblePartyType: ResponsiblePartyType;
  guarantorId: BillingObjectIdString | null;
  guarantorName: string | null;
  currency: 'PKR';
}

export interface CreateChargeCategoryInput {
  code: string;
  parentCategoryId?: BillingObjectIdString | null;
  name: string;
  description?: string | null;
  clinical?: boolean;
  departmentId?: BillingObjectIdString | null;
  serviceLineCode?: string | null;
  revenueAccountCode?: string | null;
}

export interface UpdateChargeCategoryInput {
  expectedVersion: number;
  name?: string;
  description?: string | null;
  parentCategoryId?: BillingObjectIdString | null;
  clinical?: boolean;
  departmentId?: BillingObjectIdString | null;
  serviceLineCode?: string | null;
  revenueAccountCode?: string | null;
}

export interface ChangeChargeCategoryStatusInput {
  expectedVersion: number;
  status: Exclude<ChargeCategoryStatus, 'ACTIVE'> | 'ACTIVE';
  reason: string;
}

export interface CreateChargeRuleInput {
  ruleCode: string;
  chargeCatalogItemId: BillingObjectIdString;
  ruleType: ChargeRuleType;
  relatedChargeCatalogItemId?: BillingObjectIdString | null;
  thresholdQuantity?: string | null;
  thresholdAmount?: string | null;
  effectiveFrom: string;
  effectiveThrough?: string | null;
  reason: string;
}

export interface ChangeChargeRuleStatusInput {
  expectedVersion: number;
  active: boolean;
  reason: string;
}

export interface CreateChargeCatalogItemInput {
  chargeCode: string;
  serviceCode: string;
  name: string;
  description?: string | null;
  categoryId: BillingObjectIdString;
  chargeType: ChargeType;
  clinical?: boolean;
  departmentId?: BillingObjectIdString | null;
  serviceLineCode?: string | null;
  revenueAccountCode?: string | null;
  ledgerAccountId?: BillingObjectIdString | null;
  taxCategoryId?: BillingObjectIdString | null;
  unitOfMeasureId?: BillingObjectIdString | null;
  defaultQuantity?: string;
  minimumQuantity?: string | null;
  maximumQuantity?: string | null;
  minimumPrice?: string | null;
  maximumPrice?: string | null;
  costAmount?: string;
  manualPostingAllowed?: boolean;
  recurringChargeAllowed?: boolean;
  timeBasedCharge?: boolean;
  effectiveFrom: string;
  effectiveThrough?: string | null;
}

export interface ActivateChargeCatalogVersionInput
extends CreateChargeCatalogItemInput {
  expectedVersion: number;
  changeReason: string;
}

export interface ChangeChargeCatalogStatusInput {
  expectedVersion: number;
  status: ChargeCatalogStatus;
  reason: string;
}

export interface CreateTaxCategoryInput {
  code: string;
  name: string;
  calculationMode: TaxCalculationMode;
  ratePercentage?: string;
  roundingMode?: BillingRoundingMode;
  roundingScale?: number;
  exemptionReasonRequired?: boolean;
  effectiveFrom: string;
  effectiveThrough?: string | null;
}

export interface CreatePriceListInput {
  code: string;
  name: string;
  description?: string | null;
  priceListType: PriceListType;
  patientCategoryCode?: string | null;
  payerCategoryCode?: string | null;
  payerOrganizationId?: BillingObjectIdString | null;
  panelPlanId?: BillingObjectIdString | null;
  departmentId?: BillingObjectIdString | null;
  locationId?: BillingObjectIdString | null;
  billingContext?: BillingContext | null;
  afterHoursOnly?: boolean;
  effectiveFrom: string;
  effectiveThrough?: string | null;
  priority?: number;
}

export interface ActivatePriceListVersionInput extends CreatePriceListInput {
  expectedVersion: number;
  changeReason: string;
}

export interface ChangePriceListStatusInput {
  expectedVersion: number;
  status: PriceListStatus;
  reason: string;
}

export interface UpsertServiceRateInput {
  rateCode: string;
  chargeCatalogItemId: BillingObjectIdString;
  priceListId: BillingObjectIdString;
  amount: string;
  minimumAmount?: string | null;
  maximumAmount?: string | null;
  taxCategoryId?: BillingObjectIdString | null;
  billingContext?: BillingContext | null;
  patientCategoryCode?: string | null;
  payerCategoryCode?: string | null;
  departmentId?: BillingObjectIdString | null;
  locationId?: BillingObjectIdString | null;
  afterHoursOnly?: boolean;
  effectiveFrom: string;
  effectiveThrough?: string | null;
  status?: ServiceRateStatus;
  expectedVersion?: number;
  changeReason: string;
}

export interface CreateTreatmentPackageItemInput {
  chargeCatalogItemId: BillingObjectIdString;
  includedQuantity: string;
  overageAllowed?: boolean;
  overagePriceListId?: BillingObjectIdString | null;
  sequence: number;
}

export interface CreateTreatmentPackageInput {
  packageCode: string;
  name: string;
  description?: string | null;
  billingContext?: BillingContext | null;
  priceListId: BillingObjectIdString;
  fixedPrice: string;
  validityDays: number;
  admissionPackage?: boolean;
  procedurePackage?: boolean;
  maternityPackage?: boolean;
  surgicalPackage?: boolean;
  effectiveFrom: string;
  effectiveThrough?: string | null;
  items: readonly CreateTreatmentPackageItemInput[];
}

export interface ChangeTreatmentPackageStatusInput {
  expectedVersion: number;
  status: TreatmentPackageStatus;
  reason: string;
}

export interface CreatePatientAccountInput {
  sourceModule: ChargeSourceModule;
  sourceRecordId: BillingObjectIdString;
  sourceLineId?: BillingObjectIdString | null;
  accountType?: PatientAccountType;
  responsiblePartyType?: ResponsiblePartyType;
  guarantorId?: BillingObjectIdString | null;
  payerCoverageIds?: readonly BillingObjectIdString[];
}

export interface ChangePatientAccountStatusInput {
  expectedVersion: number;
  status: PatientAccountStatus;
  reason: string;
  approvalRequestId?: BillingObjectIdString | null;
}

export interface PostSourceChargeInput {
  patientAccountId?: BillingObjectIdString | null;
  sourceModule: ChargeSourceModule;
  sourceRecordId: BillingObjectIdString;
  sourceLineId?: BillingObjectIdString | null;
  chargeCode: string;
  quantity?: string;
  serviceFrom?: string;
  serviceThrough?: string | null;
  packageEnrollmentId?: BillingObjectIdString | null;
  payerCoverageId?: BillingObjectIdString | null;
  postingReason?: string | null;
}

export interface PostManualChargeInput {
  patientAccountId: BillingObjectIdString;
  chargeCode: string;
  quantity?: string;
  serviceFrom: string;
  serviceThrough?: string | null;
  departmentId?: BillingObjectIdString | null;
  locationId?: BillingObjectIdString | null;
  reason: string;
}

export interface PriceOverrideInput {
  requestedUnitPrice: string;
  reason: string;
  approvalRequestId?: BillingObjectIdString | null;
}

export interface PostChargeBatchItemInput extends PostSourceChargeInput {
  operationKey: string;
}

export interface PostChargeBatchInput {
  items: readonly PostChargeBatchItemInput[];
}

export interface CancelChargeInput {
  expectedVersion: number;
  reason: string;
}

export interface ReverseChargeInput {
  expectedVersion: number;
  quantity?: string;
  amount?: string;
  reason: string;
  approvalRequestId?: BillingObjectIdString | null;
}

export interface AdjustChargeInput {
  expectedVersion: number;
  replacementQuantity?: string;
  replacementChargeCode?: string;
  reason: string;
  approvalRequestId?: BillingObjectIdString | null;
}

export interface TransferChargeInput {
  expectedVersion: number;
  targetPatientAccountId: BillingObjectIdString;
  reason: string;
  approvalRequestId?: BillingObjectIdString | null;
}

export interface RequestFinancialApprovalInput {
  approvalType: FinancialApprovalType;
  patientAccountId?: BillingObjectIdString | null;
  accountChargeId?: BillingObjectIdString | null;
  invoiceId?: BillingObjectIdString | null;
  paymentId?: BillingObjectIdString | null;
  requestedAmount?: string | null;
  requestedPercentage?: string | null;
  reason: string;
  expiresAt?: string | null;
}

export interface DecideFinancialApprovalInput {
  expectedVersion: number;
  decision: 'APPROVE' | 'REJECT';
  reason: string;
}

export interface CreateInvoiceInput {
  patientAccountId: BillingObjectIdString;
  invoiceType: InvoiceType;
  chargeIds?: readonly BillingObjectIdString[];
  invoiceDate?: string;
  dueDate?: string | null;
}

export interface FinalizeInvoiceInput {
  expectedVersion: number;
  approvalRequestId?: BillingObjectIdString | null;
  reason: string;
}

export interface CorrectInvoiceInput {
  expectedVersion: number;
  reason: string;
  replacementInvoiceType?: InvoiceType;
}

export interface CreateDiscountInput {
  patientAccountId: BillingObjectIdString;
  invoiceId?: BillingObjectIdString | null;
  invoiceLineId?: BillingObjectIdString | null;
  accountChargeId?: BillingObjectIdString | null;
  discountType: DiscountType;
  scope: DiscountScope;
  requestedValue: string;
  reason: string;
}

export interface CreateFinancialNoteInput {
  patientAccountId: BillingObjectIdString;
  invoiceId?: BillingObjectIdString | null;
  accountChargeIds: readonly BillingObjectIdString[];
  amount: string;
  reason: string;
  approvalRequestId?: BillingObjectIdString | null;
}

export interface CreatePaymentIntentInput {
  patientAccountId: BillingObjectIdString;
  invoiceId?: BillingObjectIdString | null;
  amount: string;
  paymentMethod: PaymentMethod;
  externalReference?: string | null;
  expiresAt?: string | null;
}

export interface ReceivePaymentInput {
  patientAccountId: BillingObjectIdString;
  invoiceId?: BillingObjectIdString | null;
  paymentIntentId?: BillingObjectIdString | null;
  amount: string;
  paymentMethod: PaymentMethod;
  externalReference?: string | null;
  cashierStaffId?: BillingObjectIdString | null;
  cashShiftId?: BillingObjectIdString | null;
  counterId?: BillingObjectIdString | null;
  receivedAt?: string;
}

export interface PaymentAllocationInput {
  invoiceId?: BillingObjectIdString | null;
  patientAccountId: BillingObjectIdString;
  amount: string;
}

export interface AllocatePaymentInput {
  expectedVersion: number;
  allocations: readonly PaymentAllocationInput[];
}

export interface RequestRefundInput {
  paymentId: BillingObjectIdString;
  amount: string;
  reason: string;
}

export interface ProcessRefundInput {
  expectedVersion: number;
  paymentMethod: PaymentMethod;
  externalReference?: string | null;
  reason: string;
}

export interface UnifiedBillingCatalogListQuery {
  page?: number;
  pageSize?: number;
  status?: readonly ChargeCatalogStatus[];
  chargeType?: readonly ChargeType[];
  categoryId?: BillingObjectIdString;
  departmentId?: BillingObjectIdString;
  effectiveAt?: string;
  search?: string;
  includeCost?: boolean;
  sortBy?: UnifiedBillingCatalogSortField;
  sortDirection?: BillingSortDirection;
}

export interface UnifiedBillingAccountListQuery {
  page?: number;
  pageSize?: number;
  patientId?: BillingObjectIdString;
  status?: readonly PatientAccountStatus[];
  accountType?: readonly PatientAccountType[];
  billingContext?: readonly BillingContext[];
  admissionId?: BillingObjectIdString;
  outstandingOnly?: boolean;
  search?: string;
  sortBy?: UnifiedBillingAccountSortField;
  sortDirection?: BillingSortDirection;
}

export interface UnifiedBillingChargeListQuery {
  page?: number;
  pageSize?: number;
  patientAccountId?: BillingObjectIdString;
  patientId?: BillingObjectIdString;
  status?: readonly ChargeStatus[];
  sourceModule?: readonly ChargeSourceModule[];
  chargeType?: readonly ChargeType[];
  departmentId?: BillingObjectIdString;
  from?: string;
  to?: string;
  unbilledOnly?: boolean;
  search?: string;
  sortBy?: UnifiedBillingChargeSortField;
  sortDirection?: BillingSortDirection;
}

export interface UnifiedBillingInvoiceListQuery {
  page?: number;
  pageSize?: number;
  patientAccountId?: BillingObjectIdString;
  patientId?: BillingObjectIdString;
  status?: readonly InvoiceStatus[];
  invoiceType?: readonly InvoiceType[];
  from?: string;
  to?: string;
  outstandingOnly?: boolean;
  search?: string;
  sortBy?: UnifiedBillingInvoiceSortField;
  sortDirection?: BillingSortDirection;
}

export interface BillingPage<T> {
  items: readonly T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface MoneyBreakdownView {
  grossAmount: string;
  discountAmount: string;
  welfareAmount: string;
  panelAmount: string;
  taxAmount: string;
  patientResponsibility: string;
  payerResponsibility: string;
  netAmount: string;
  currency: 'PKR';
}

export interface ChargeCategoryView {
  id: BillingObjectIdString;
  code: string;
  parentCategoryId: BillingObjectIdString | null;
  name: string;
  description: string | null;
  clinical: boolean;
  departmentId: BillingObjectIdString | null;
  serviceLineCode: string | null;
  revenueAccountCode: string | null;
  status: ChargeCategoryStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChargeRuleView {
  id: BillingObjectIdString;
  ruleCode: string;
  chargeCatalogItemId: BillingObjectIdString;
  ruleType: ChargeRuleType;
  relatedChargeCatalogItemId: BillingObjectIdString | null;
  thresholdQuantity: string | null;
  thresholdAmount: string | null;
  effectiveFrom: string;
  effectiveThrough: string | null;
  active: boolean;
  reason: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChargeCatalogItemView {
  id: BillingObjectIdString;
  chargeCode: string;
  serviceCode: string;
  name: string;
  description: string | null;
  categoryId: BillingObjectIdString;
  chargeType: ChargeType;
  clinical: boolean;
  departmentId: BillingObjectIdString | null;
  serviceLineCode: string | null;
  revenueAccountCode: string | null;
  ledgerAccountId: BillingObjectIdString | null;
  taxCategoryId: BillingObjectIdString | null;
  unitOfMeasureId: BillingObjectIdString | null;
  defaultQuantity: string;
  minimumQuantity: string | null;
  maximumQuantity: string | null;
  minimumPrice: string | null;
  maximumPrice: string | null;
  costAmount?: string;
  manualPostingAllowed: boolean;
  recurringChargeAllowed: boolean;
  timeBasedCharge: boolean;
  effectiveFrom: string;
  effectiveThrough: string | null;
  status: ChargeCatalogStatus;
  currentVersion: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaxCategoryView {
  id: BillingObjectIdString;
  code: string;
  name: string;
  calculationMode: TaxCalculationMode;
  ratePercentage: string;
  roundingMode: BillingRoundingMode;
  roundingScale: number;
  exemptionReasonRequired: boolean;
  effectiveFrom: string;
  effectiveThrough: string | null;
  active: boolean;
  version: number;
}

export interface PriceListView {
  id: BillingObjectIdString;
  code: string;
  name: string;
  description: string | null;
  priceListType: PriceListType;
  patientCategoryCode: string | null;
  payerCategoryCode: string | null;
  payerOrganizationId: BillingObjectIdString | null;
  panelPlanId: BillingObjectIdString | null;
  departmentId: BillingObjectIdString | null;
  locationId: BillingObjectIdString | null;
  billingContext: BillingContext | null;
  afterHoursOnly: boolean;
  effectiveFrom: string;
  effectiveThrough: string | null;
  status: PriceListStatus;
  priority: number;
  currentVersion: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceRateView {
  id: BillingObjectIdString;
  rateCode: string;
  chargeCatalogItemId: BillingObjectIdString;
  chargeCatalogVersionId: BillingObjectIdString;
  priceListId: BillingObjectIdString;
  priceListVersionId: BillingObjectIdString;
  amount: string;
  minimumAmount: string | null;
  maximumAmount: string | null;
  taxCategoryId: BillingObjectIdString | null;
  billingContext: BillingContext | null;
  patientCategoryCode: string | null;
  payerCategoryCode: string | null;
  payerOrganizationId: BillingObjectIdString | null;
  panelPlanId: BillingObjectIdString | null;
  departmentId: BillingObjectIdString | null;
  locationId: BillingObjectIdString | null;
  contractReference: string | null;
  afterHoursOnly: boolean;
  effectiveFrom: string;
  effectiveThrough: string | null;
  status: ServiceRateStatus;
  supersedesRateId: BillingObjectIdString | null;
  changeReason: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TreatmentPackageItemView {
  id: BillingObjectIdString;
  lineNumber: number;
  chargeCatalogItemId: BillingObjectIdString;
  includedQuantity: string;
  overageAllowed: boolean;
  overageRateId: BillingObjectIdString | null;
  allocationAmount: string;
  requiredComponent: boolean;
  active: boolean;
}

export interface TreatmentPackageView {
  id: BillingObjectIdString;
  packageCode: string;
  name: string;
  description: string | null;
  priceListId: BillingObjectIdString;
  packageType: 'ADMISSION' | 'PROCEDURE' | 'SURGERY' | 'MATERNITY' | 'GENERAL';
  fixedPrice: string;
  validityDays: number;
  payerOrganizationId: BillingObjectIdString | null;
  panelPlanId: BillingObjectIdString | null;
  patientCategoryCode: string | null;
  billingContext: BillingContext | null;
  effectiveFrom: string;
  effectiveThrough: string | null;
  status: TreatmentPackageStatus;
  items: readonly TreatmentPackageItemView[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedPriceView {
  chargeCatalogItemId: BillingObjectIdString;
  chargeCatalogVersionId: BillingObjectIdString;
  chargeCode: string;
  serviceCode: string;
  chargeName: string;
  categoryCode: string;
  chargeType: ChargeType;
  serviceRateId: BillingObjectIdString;
  priceListId: BillingObjectIdString;
  priceListVersionId: BillingObjectIdString;
  priceListCode: string;
  originalUnitPrice: string;
  authoritativeUnitPrice: string;
  minimumAmount: string | null;
  maximumAmount: string | null;
  quantity: string;
  taxCategoryId: BillingObjectIdString | null;
  taxCategoryCode: string | null;
  taxMode: TaxCalculationMode;
  taxRatePercentage: string;
  currency: 'PKR';
  costAmount?: string;
  resolutionReason: string;
}

export interface PatientAccountView {
  id: BillingObjectIdString;
  accountNumber: string;
  patientId: BillingObjectIdString;
  accountType: PatientAccountType;
  billingContext: BillingContext;
  registrationId: BillingObjectIdString | null;
  opdVisitId: BillingObjectIdString | null;
  encounterId: BillingObjectIdString | null;
  admissionId: BillingObjectIdString | null;
  emergencyVisitId: BillingObjectIdString | null;
  responsiblePartyType: ResponsiblePartyType;
  guarantorId: BillingObjectIdString | null;
  payerSnapshots: readonly BillingPayerSnapshot[];
  currency: 'PKR';
  grossCharges: string;
  discountTotal: string;
  taxTotal: string;
  welfareTotal: string;
  payerResponsibilityTotal: string;
  patientResponsibilityTotal: string;
  paymentsAppliedTotal: string;
  creditsTotal: string;
  writeOffTotal: string;
  outstandingBalance: string;
  refundableBalance: string;
  status: PatientAccountStatus;
  lockedAt: string | null;
  finalizedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AccountChargeView extends MoneyBreakdownView {
  id: BillingObjectIdString;
  operationKey: string;
  deterministicChargeKey: string;
  patientAccountId: BillingObjectIdString;
  patientId: BillingObjectIdString;
  sourceModule: ChargeSourceModule;
  sourceRecordType: string;
  sourceRecordId: BillingObjectIdString;
  sourceLineId: BillingObjectIdString | null;
  chargeCatalogItemId: BillingObjectIdString;
  chargeCatalogVersionId: BillingObjectIdString;
  serviceRateId: BillingObjectIdString;
  priceListId: BillingObjectIdString;
  chargeCode: string;
  serviceCode: string;
  chargeName: string;
  categoryCode: string;
  departmentId: BillingObjectIdString | null;
  quantity: string;
  originalUnitPrice: string;
  authoritativeUnitPrice: string;
  costAmount?: string;
  status: ChargeStatus;
  packageEnrollmentId: BillingObjectIdString | null;
  originalChargeId: BillingObjectIdString | null;
  replacementChargeId: BillingObjectIdString | null;
  serviceFrom: string;
  serviceThrough: string | null;
  postedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLineView extends MoneyBreakdownView {
  id: BillingObjectIdString;
  invoiceId: BillingObjectIdString;
  lineNumber: number;
  accountChargeId: BillingObjectIdString;
  chargeCode: string;
  serviceCode: string;
  chargeName: string;
  sourceModule: ChargeSourceModule;
  sourceRecordId: BillingObjectIdString;
  quantity: string;
  originalUnitPrice: string;
  authoritativeUnitPrice: string;
  departmentId: BillingObjectIdString | null;
}

export interface InvoiceView extends MoneyBreakdownView {
  id: BillingObjectIdString;
  invoiceNumber: string;
  patientAccountId: BillingObjectIdString;
  patientId: BillingObjectIdString;
  invoiceType: InvoiceType;
  invoiceDate: string;
  dueDate: string | null;
  status: InvoiceStatus;
  paidAmount: string;
  creditAmount: string;
  outstandingBalance: string;
  refundableBalance: string;
  finalizedAt: string | null;
  cancelledAt: string | null;
  replacementInvoiceId: BillingObjectIdString | null;
  lines: readonly InvoiceLineView[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type PatientAccountStatementEntryType =
  | 'ACCOUNT_OPENED'
  | 'CHARGE_POSTED'
  | 'INVOICE_CREATED'
  | 'INVOICE_FINALIZED'
  | 'PAYMENT_APPLIED'
  | 'CREDIT_APPLIED'
  | 'WRITE_OFF'
  | 'ACCOUNT_STATUS_CHANGED';

export interface PatientAccountStatementEntryView {
  entryType: PatientAccountStatementEntryType;
  occurredAt: string;
  referenceType: string;
  referenceId: BillingObjectIdString;
  referenceNumber: string | null;
  description: string;
  debitAmount: string;
  creditAmount: string;
  runningBalance: string;
}

export interface PatientAccountStatementView {
  patientAccount: PatientAccountView;
  generatedAt: string;
  periodFrom: string | null;
  periodThrough: string | null;
  openingBalance: string;
  closingBalance: string;
  totalDebits: string;
  totalCredits: string;
  charges: readonly AccountChargeView[];
  invoices: readonly InvoiceView[];
  entries: readonly PatientAccountStatementEntryView[];
}

export interface UnifiedChargePostingResultView {
  patientAccount: PatientAccountView;
  charges: readonly AccountChargeView[];
  replayed: boolean;
}

export interface FinancialApprovalView {
  id: BillingObjectIdString;
  approvalType: FinancialApprovalType;
  patientAccountId: BillingObjectIdString | null;
  accountChargeId: BillingObjectIdString | null;
  invoiceId: BillingObjectIdString | null;
  paymentId: BillingObjectIdString | null;
  requestedAmount: string | null;
  requestedPercentage: string | null;
  reason: string;
  status: FinancialApprovalStatus;
  requestedBy: BillingObjectIdString;
  requestedAt: string;
  decidedBy: BillingObjectIdString | null;
  decidedAt: string | null;
  decisionReason: string | null;
  expiresAt: string | null;
  version: number;
}

export interface PaymentView {
  id: BillingObjectIdString;
  paymentNumber: string;
  receiptNumber: string | null;
  patientAccountId: BillingObjectIdString;
  invoiceId: BillingObjectIdString | null;
  paymentIntentId: BillingObjectIdString | null;
  paymentMethod: PaymentMethod;
  amount: string;
  allocatedAmount: string;
  unallocatedAmount: string;
  refundedAmount: string;
  currency: 'PKR';
  externalReference: string | null;
  status: PaymentStatus;
  receivedAt: string;
  cashierStaffId: BillingObjectIdString | null;
  cashShiftId: BillingObjectIdString | null;
  counterId: BillingObjectIdString | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}
import type {
  ChargeStatus,
  InvoiceStatus,
  PatientAccountStatus,
} from './unified-billing.contracts.js';

import type {
  PermissionKey,
} from '@hospital-mis/permissions';

export const UNIFIED_BILLING_PERMISSION_KEYS = {
  CATALOG_READ: 'billing.catalog.read',
  CATALOG_MANAGE: 'billing.catalog.manage',
  CATALOG_COST_READ: 'billing.catalog.view_cost',
  PRICING_READ: 'billing.pricing.read',
  PRICING_MANAGE: 'billing.pricing.manage',
  PACKAGES_READ: 'billing.packages.read',
  PACKAGES_MANAGE: 'billing.packages.manage',
  ACCOUNTS_READ: 'billing.accounts.read',
  ACCOUNTS_CREATE: 'billing.accounts.create',
  ACCOUNTS_MANAGE: 'billing.accounts.manage',
  ACCOUNTS_SUSPEND: 'billing.accounts.suspend',
  ACCOUNTS_FINALIZE: 'billing.accounts.finalize',
  CHARGES_READ: 'billing.charges.read',
  CHARGES_CREATE: 'billing.charges.create',
  CHARGES_POST: 'billing.charges.post',
  CHARGES_CANCEL: 'billing.charges.cancel',
  CHARGES_REVERSE: 'billing.charges.reverse',
  CHARGES_ADJUST: 'billing.charges.adjust',
  CHARGES_WRITE_OFF: 'billing.charges.write_off',
  CHARGES_TRANSFER: 'billing.charges.transfer',
  CHARGES_MANUAL: 'billing.charges.manual',
  INVOICE_READ: 'billing.invoice.read',
  INVOICE_CREATE: 'billing.invoice.create',
  INVOICE_FINALIZE: 'billing.invoice.finalize',
  INVOICE_CANCEL: 'billing.invoice.cancel',
  INVOICE_CORRECT: 'billing.invoice.correct',
  INVOICE_PRINT: 'billing.invoice.print',
  DISCOUNT_REQUEST: 'billing.discount.request',
  DISCOUNT_APPROVE: 'billing.discount.approve',
  PRICE_OVERRIDE_REQUEST: 'billing.price_override.request',
  PRICE_OVERRIDE_APPROVE: 'billing.price_override.approve',
  PAYMENT_READ: 'billing.payment.read',
  PAYMENT_RECEIVE: 'billing.payment.receive',
  PAYMENT_ALLOCATE: 'billing.payment.allocate',
  PAYMENT_REVERSE: 'billing.payment.reverse',
  REFUND_REQUEST: 'billing.refund.request',
  REFUND_APPROVE: 'billing.refund.approve',
  REFUND_PROCESS: 'billing.refund.process',
  CREDIT_NOTE_CREATE: 'billing.credit_note.create',
  CREDIT_NOTE_POST: 'billing.credit_note.post',
  DEBIT_NOTE_CREATE: 'billing.debit_note.create',
  DEBIT_NOTE_POST: 'billing.debit_note.post',
  FINANCIAL_DISCHARGE: 'billing.financial_discharge',
  REPORT_READ: 'billing.reports.read',
  REPORT_EXPORT: 'billing.reports.export',
  REPORT_COST_MARGIN: 'billing.reports.cost_margin',
  BREAK_GLASS: 'security.break_glass',
} as const satisfies Record<string, PermissionKey>;

export const UNIFIED_BILLING_OPERATIONAL_ROLE_KEYS = [
  'BILLING_OFFICER',
  'BILLING_MANAGER',
  'CASHIER',
  'CLAIMS_OFFICER',
  'SYSTEM_ADMINISTRATOR',
  'HOSPITAL_ADMINISTRATOR',
] as const;

export const UNIFIED_BILLING_ACCOUNT_TRANSITIONS = {
  OPEN: ['SUSPENDED', 'FINALIZED', 'CANCELLED', 'WRITTEN_OFF'],
  SUSPENDED: ['OPEN', 'FINALIZED', 'CANCELLED', 'WRITTEN_OFF'],
  FINALIZED: [],
  CANCELLED: [],
  WRITTEN_OFF: [],
} as const satisfies Record<PatientAccountStatus, readonly PatientAccountStatus[]>;

export const UNIFIED_BILLING_CHARGE_TRANSITIONS = {
  DRAFT: ['PENDING', 'CANCELLED'],
  PENDING: ['POSTED', 'CANCELLED'],
  POSTED: [
    'REVERSED',
    'CREDITED',
    'ADJUSTED',
    'WRITTEN_OFF',
    'TRANSFERRED',
    'CORRECTED',
  ],
  CANCELLED: [],
  REVERSED: [],
  CREDITED: [],
  ADJUSTED: [],
  WRITTEN_OFF: [],
  TRANSFERRED: [],
  CORRECTED: [],
} as const satisfies Record<ChargeStatus, readonly ChargeStatus[]>;

export const UNIFIED_BILLING_INVOICE_TRANSITIONS = {
  DRAFT: ['FINALIZED', 'CANCELLED'],
  FINALIZED: ['CANCELLED', 'CORRECTED'],
  CANCELLED: [],
  CORRECTED: [],
} as const satisfies Record<InvoiceStatus, readonly InvoiceStatus[]>;

export const UNIFIED_BILLING_CATALOG_SORT_FIELDS = [
  'chargeCode',
  'serviceCode',
  'name',
  'chargeType',
  'status',
  'effectiveFrom',
  'updatedAt',
] as const;

export const UNIFIED_BILLING_ACCOUNT_SORT_FIELDS = [
  'accountNumber',
  'status',
  'outstandingBalance',
  'createdAt',
  'updatedAt',
] as const;

export const UNIFIED_BILLING_CHARGE_SORT_FIELDS = [
  'serviceFrom',
  'postedAt',
  'chargeCodeSnapshot',
  'status',
  'grossAmount',
  'netAmount',
  'updatedAt',
] as const;

export const UNIFIED_BILLING_INVOICE_SORT_FIELDS = [
  'invoiceNumber',
  'invoiceDate',
  'status',
  'netAmount',
  'outstandingBalance',
  'updatedAt',
] as const;

export const DEFAULT_UNIFIED_BILLING_PAGE_SIZE = 25;
export const MAX_UNIFIED_BILLING_PAGE_SIZE = 100;
export const DEFAULT_BILLING_NUMBER_WIDTH = 8;
export const MAX_BILLING_BATCH_LINES = 500;
export const MAX_BILLING_PAYER_SNAPSHOTS = 2;
export const BILLING_CURRENCY = 'PKR';

export const UNIFIED_BILLING_NUMBER_SEQUENCE_NAMESPACE = {
  ACCOUNT: 'billing.patient-account.number',
  INVOICE: 'billing.invoice.number',
  CREDIT_NOTE: 'billing.credit-note.number',
  DEBIT_NOTE: 'billing.debit-note.number',
  PAYMENT: 'billing.payment.number',
  RECEIPT: 'billing.receipt.number',
  REFUND: 'billing.refund.number',
  LEDGER_TRANSACTION: 'billing.ledger-transaction.number',
} as const;

export const UNIFIED_BILLING_LOCK_NAMESPACE = {
  CATALOG_CATEGORY: 'unified-billing:catalog-category',
  CATALOG_RULE: 'unified-billing:catalog-rule',
  TAX_CATEGORY: 'unified-billing:tax-category',
  CATALOG_ITEM: 'unified-billing:catalog-item',
  PRICE_LIST: 'unified-billing:price-list',
  SERVICE_RATE: 'unified-billing:service-rate',
  PACKAGE: 'unified-billing:package',
  PATIENT_ACCOUNT: 'unified-billing:patient-account',
  ACCOUNT_CHARGE: 'unified-billing:account-charge',
  SOURCE_CHARGE: 'unified-billing:source-charge',
  INVOICE: 'unified-billing:invoice',
  PAYMENT: 'unified-billing:payment',
  APPROVAL: 'unified-billing:approval',
  REFUND: 'unified-billing:refund',
} as const;

export const UNIFIED_BILLING_EVENT_TYPES = {
  CATALOG_CATEGORY_CHANGED: 'billing.catalog_category.changed.v1',
  CATALOG_RULE_CHANGED: 'billing.catalog_rule.changed.v1',
  TAX_CATEGORY_CHANGED: 'billing.tax_category.changed.v1',
  CATALOG_CREATED: 'billing.catalog.created.v1',
  CATALOG_VERSION_ACTIVATED: 'billing.catalog.version_activated.v1',
  CATALOG_STATUS_CHANGED: 'billing.catalog.status_changed.v1',
  PRICE_LIST_CREATED: 'billing.price_list.created.v1',
  PRICE_LIST_VERSION_ACTIVATED: 'billing.price_list.version_activated.v1',
  PRICE_LIST_STATUS_CHANGED: 'billing.price_list.status_changed.v1',
  SERVICE_RATE_CHANGED: 'billing.service_rate.changed.v1',
  PACKAGE_CHANGED: 'billing.package.changed.v1',
  ACCOUNT_CREATED: 'billing.account.created.v1',
  ACCOUNT_STATUS_CHANGED: 'billing.account.status_changed.v1',
  CHARGE_PENDING: 'billing.charge.pending.v1',
  CHARGE_POSTED: 'billing.charge.posted.v1',
  CHARGE_CORRECTED: 'billing.charge.corrected.v1',
  INVOICE_CREATED: 'billing.invoice.created.v1',
  INVOICE_FINALIZED: 'billing.invoice.finalized.v1',
  INVOICE_CORRECTED: 'billing.invoice.corrected.v1',
  APPROVAL_REQUESTED: 'billing.approval.requested.v1',
  APPROVAL_DECIDED: 'billing.approval.decided.v1',
  PAYMENT_POSTED: 'billing.payment.posted.v1',
  PAYMENT_ALLOCATED: 'billing.payment.allocated.v1',
  REFUND_POSTED: 'billing.refund.posted.v1',
  RECONCILIATION_REQUIRED: 'billing.reconciliation.required.v1',
} as const;

export const UNIFIED_BILLING_REALTIME_EVENTS = {
  CATALOG_CHANGED: 'billing.catalog.changed',
  PRICING_CHANGED: 'billing.pricing.changed',
  PACKAGE_CHANGED: 'billing.package.changed',
  ACCOUNT_CHANGED: 'billing.account.changed',
  CHARGES_CHANGED: 'billing.charges.changed',
  INVOICE_CHANGED: 'billing.invoice.changed',
  APPROVAL_QUEUE_CHANGED: 'billing.approval_queue.changed',
  PAYMENT_CHANGED: 'billing.payment.changed',
} as const;

export const UNIFIED_BILLING_TRANSACTION_TYPES = {
  CREATE_CATALOG_CATEGORY: 'BILLING_CATALOG_CATEGORY_CREATE',
  UPDATE_CATALOG_CATEGORY: 'BILLING_CATALOG_CATEGORY_UPDATE',
  CHANGE_CATALOG_CATEGORY_STATUS: 'BILLING_CATALOG_CATEGORY_STATUS_CHANGE',
  CREATE_CATALOG_RULE: 'BILLING_CATALOG_RULE_CREATE',
  CHANGE_CATALOG_RULE_STATUS: 'BILLING_CATALOG_RULE_STATUS_CHANGE',
  CREATE_TAX_CATEGORY: 'BILLING_TAX_CATEGORY_CREATE',
  CREATE_CATALOG_ITEM: 'BILLING_CATALOG_ITEM_CREATE',
  ACTIVATE_CATALOG_VERSION: 'BILLING_CATALOG_VERSION_ACTIVATE',
  CHANGE_CATALOG_STATUS: 'BILLING_CATALOG_STATUS_CHANGE',
  CREATE_PRICE_LIST: 'BILLING_PRICE_LIST_CREATE',
  ACTIVATE_PRICE_LIST_VERSION: 'BILLING_PRICE_LIST_VERSION_ACTIVATE',
  CHANGE_PRICE_LIST_STATUS: 'BILLING_PRICE_LIST_STATUS_CHANGE',
  UPSERT_SERVICE_RATE: 'BILLING_SERVICE_RATE_UPSERT',
  CREATE_PACKAGE: 'BILLING_PACKAGE_CREATE',
  CHANGE_PACKAGE_STATUS: 'BILLING_PACKAGE_STATUS_CHANGE',
  CREATE_ACCOUNT: 'BILLING_ACCOUNT_CREATE',
  CHANGE_ACCOUNT_STATUS: 'BILLING_ACCOUNT_STATUS_CHANGE',
  POST_CHARGE: 'BILLING_CHARGE_POST',
  REVERSE_CHARGE: 'BILLING_CHARGE_REVERSE',
  ADJUST_CHARGE: 'BILLING_CHARGE_ADJUST',
  TRANSFER_CHARGE: 'BILLING_CHARGE_TRANSFER',
  CREATE_INVOICE: 'BILLING_INVOICE_CREATE',
  FINALIZE_INVOICE: 'BILLING_INVOICE_FINALIZE',
  POST_CREDIT_NOTE: 'BILLING_CREDIT_NOTE_POST',
  POST_DEBIT_NOTE: 'BILLING_DEBIT_NOTE_POST',
  DECIDE_APPROVAL: 'BILLING_APPROVAL_DECIDE',
  RECEIVE_PAYMENT: 'BILLING_PAYMENT_RECEIVE',
  ALLOCATE_PAYMENT: 'BILLING_PAYMENT_ALLOCATE',
  POST_REFUND: 'BILLING_REFUND_POST',
} as const;

export type UnifiedBillingCatalogSortField =
  (typeof UNIFIED_BILLING_CATALOG_SORT_FIELDS)[number];

export type UnifiedBillingAccountSortField =
  (typeof UNIFIED_BILLING_ACCOUNT_SORT_FIELDS)[number];

export type UnifiedBillingChargeSortField =
  (typeof UNIFIED_BILLING_CHARGE_SORT_FIELDS)[number];

export type UnifiedBillingInvoiceSortField =
  (typeof UNIFIED_BILLING_INVOICE_SORT_FIELDS)[number];