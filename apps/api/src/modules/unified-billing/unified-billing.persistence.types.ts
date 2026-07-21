import type {
  ClientSession,
  Types,
} from 'mongoose';

import type {
  BillingContext,
  BillingRoundingMode,
  ChargeCatalogStatus,
  ChargeCategoryStatus,
  ChargeSourceModule,
  ChargeStatus,
  ChargeRuleType,
  ChargeType,
  FinancialApprovalStatus,
  FinancialApprovalType,
  InvoiceStatus,
  InvoiceType,
  PatientAccountStatus,
  PatientAccountType,
  PaymentMethod,
  PaymentStatus,
  PriceListStatus,
  PriceListType,
  ResponsiblePartyType,
  ServiceRateStatus,
  TaxCalculationMode,
  TreatmentPackageStatus,
} from './unified-billing.contracts.js';

export type BillingMongoSession = ClientSession;

export interface BillingPersistenceMetadata {
  facilityId: Types.ObjectId;
  version: number;
  transactionId: string | null;
  correlationId: string | null;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillingActorIdentityRecord {
  userId: string;
  facilityId: string | null;
  staffId: string | null;
  status: string;
}

export interface BillingStaffRecord {
  staffId: string;
  facilityId: string;
  departmentId: string | null;
  displayName: string;
  professionalType: string | null;
  employmentStatus: string;
  isActive: boolean;
}

export interface BillingPatientRecord {
  patientId: string;
  facilityId: string;
  status: string;
  mrn: string | null;
  displayName: string;
}

export interface BillingGuarantorRecord {
  guarantorId: string;
  facilityId: string;
  displayName: string;
  status: string;
}

export interface BillingCoverageRecord {
  patientCoverageId: string;
  facilityId: string;
  patientId: string;
  sequence: 1 | 2;
  payerOrganizationId: string;
  panelPlanId: string | null;
  payerName: string;
  planName: string | null;
  membershipNumber: string | null;
  authorizationReference: string | null;
  coverageLimit: string | null;
  copay: string;
  coinsurancePercentage: string;
  deductible: string;
  effectiveFrom: Date | null;
  effectiveThrough: Date | null;
  status: string;
}

export interface BillingSourceContextRecord {
  facilityId: string;
  sourceModule: ChargeSourceModule;
  sourceRecordType: string;
  sourceRecordId: string;
  sourceLineId: string | null;
  sourceOccurredAt: Date;
  sourceStatus: string;
  billable: boolean;
  unbillableReason: string | null;
  patientId: string;
  billingContext: BillingContext;
  registrationId: string | null;
  opdVisitId: string | null;
  encounterId: string | null;
  admissionId: string | null;
  emergencyVisitId: string | null;
  departmentId: string | null;
  locationId: string | null;
  serviceLineCode: string | null;
  serviceFrom: Date;
  serviceThrough: Date | null;
}

export interface ChargeCategoryRecord extends BillingPersistenceMetadata {
  _id: Types.ObjectId;
  code: string;
  parentCategoryId: Types.ObjectId | null;
  name: string;
  description: string | null;
  clinical: boolean;
  departmentId: Types.ObjectId | null;
  serviceLineCode: string | null;
  revenueAccountCode: string | null;
  status: ChargeCategoryStatus;
  activatedAt: Date;
  activatedBy: Types.ObjectId;
  deactivatedAt: Date | null;
  deactivatedBy: Types.ObjectId | null;
  deactivationReason: string | null;
}

export interface ChargeCatalogRecord extends BillingPersistenceMetadata {
  _id: Types.ObjectId;
  chargeCode: string;
  serviceCode: string;
  name: string;
  description: string | null;
  categoryId: Types.ObjectId;
  chargeType: ChargeType;
  clinical: boolean;
  departmentId: Types.ObjectId | null;
  serviceLineCode: string | null;
  revenueAccountCode: string | null;
  ledgerAccountId: Types.ObjectId | null;
  taxCategoryId: Types.ObjectId | null;
  unitOfMeasureId: Types.ObjectId | null;
  defaultQuantity: Types.Decimal128;
  minimumQuantity: Types.Decimal128 | null;
  maximumQuantity: Types.Decimal128 | null;
  minimumPrice: Types.Decimal128 | null;
  maximumPrice: Types.Decimal128 | null;
  costAmount: Types.Decimal128;
  manualPostingAllowed: boolean;
  recurringChargeAllowed: boolean;
  timeBasedCharge: boolean;
  effectiveFrom: Date;
  effectiveThrough: Date | null;
  status: ChargeCatalogStatus;
  currentVersion: number;
  latestVersionId: Types.ObjectId | null;
  activatedAt: Date | null;
  activatedBy: Types.ObjectId | null;
  deactivatedAt: Date | null;
  deactivatedBy: Types.ObjectId | null;
  deactivationReason: string | null;
  retiredAt: Date | null;
  retiredBy: Types.ObjectId | null;
  retirementReason: string | null;
}

export interface ChargeRuleRecord extends BillingPersistenceMetadata {
  _id: Types.ObjectId;
  ruleCode: string;
  chargeCatalogItemId: Types.ObjectId;
  ruleType: ChargeRuleType;
  relatedChargeCatalogItemId: Types.ObjectId | null;
  thresholdQuantity: Types.Decimal128 | null;
  thresholdAmount: Types.Decimal128 | null;
  effectiveFrom: Date;
  effectiveThrough: Date | null;
  active: boolean;
  reason: string;
}

export interface ChargeCatalogVersionRecord
extends Omit<
  ChargeCatalogRecord,
  | 'status'
  | 'currentVersion'
  | 'latestVersionId'
  | 'activatedAt'
  | 'activatedBy'
  | 'deactivatedAt'
  | 'deactivatedBy'
  | 'deactivationReason'
  | 'retiredAt'
  | 'retiredBy'
  | 'retirementReason'
> {
  chargeCatalogItemId: Types.ObjectId;
  versionNumber: number;
  statusSnapshot: ChargeCatalogStatus;
  changeReason: string;
  recordedAt: Date;
  recordedBy: Types.ObjectId;
}

export interface TaxCategoryRecord extends BillingPersistenceMetadata {
  _id: Types.ObjectId;
  code: string;
  name: string;
  calculationMode: TaxCalculationMode;
  ratePercentage: Types.Decimal128;
  roundingMode: BillingRoundingMode;
  roundingScale: number;
  exemptionReasonRequired: boolean;
  effectiveFrom: Date;
  effectiveThrough: Date | null;
  active: boolean;
}

export interface PriceListRecord extends BillingPersistenceMetadata {
  _id: Types.ObjectId;
  code: string;
  name: string;
  description: string | null;
  priceListType: PriceListType;
  currency: string;
  patientCategoryCode: string | null;
  payerCategoryCode: string | null;
  payerOrganizationId: Types.ObjectId | null;
  panelPlanId: Types.ObjectId | null;
  departmentId: Types.ObjectId | null;
  locationId: Types.ObjectId | null;
  billingContext: BillingContext | null;
  afterHoursOnly: boolean;
  effectiveFrom: Date;
  effectiveThrough: Date | null;
  status: PriceListStatus;
  priority: number;
  currentVersion: number;
  latestVersionId: Types.ObjectId | null;
  activatedAt: Date | null;
  activatedBy: Types.ObjectId | null;
  retiredAt: Date | null;
  retiredBy: Types.ObjectId | null;
  retirementReason: string | null;
}

export interface PriceListVersionRecord
extends Omit<
  PriceListRecord,
  | 'status'
  | 'priority'
  | 'currentVersion'
  | 'latestVersionId'
  | 'activatedAt'
  | 'activatedBy'
  | 'retiredAt'
  | 'retiredBy'
  | 'retirementReason'
> {
  priceListId: Types.ObjectId;
  versionNumber: number;
  statusSnapshot: PriceListStatus;
  prioritySnapshot: number;
  changeReason: string;
  recordedAt: Date;
  recordedBy: Types.ObjectId;
}

export interface ServiceRateRecord extends BillingPersistenceMetadata {
  _id: Types.ObjectId;
  rateCode: string;
  chargeCatalogItemId: Types.ObjectId;
  chargeCatalogVersionId: Types.ObjectId;
  priceListId: Types.ObjectId;
  priceListVersionId: Types.ObjectId;
  amount: Types.Decimal128;
  minimumAmount: Types.Decimal128 | null;
  maximumAmount: Types.Decimal128 | null;
  currency: string;
  taxCategoryId: Types.ObjectId | null;
  billingContext: BillingContext | null;
  patientCategoryCode: string | null;
  payerCategoryCode: string | null;
  payerOrganizationId: Types.ObjectId | null;
  panelPlanId: Types.ObjectId | null;
  departmentId: Types.ObjectId | null;
  locationId: Types.ObjectId | null;
  contractReference: string | null;
  afterHoursOnly: boolean;
  effectiveFrom: Date;
  effectiveThrough: Date | null;
  status: ServiceRateStatus;
  changeReason: string;
  supersedesRateId: Types.ObjectId | null;
}

export interface TreatmentPackageRecord extends BillingPersistenceMetadata {
  _id: Types.ObjectId;
  packageCode: string;
  name: string;
  description: string | null;
  priceListId: Types.ObjectId;
  packageType: 'ADMISSION' | 'PROCEDURE' | 'SURGERY' | 'MATERNITY' | 'GENERAL';
  fixedPrice: Types.Decimal128;
  currency: string;
  validityDays: number;
  payerOrganizationId: Types.ObjectId | null;
  panelPlanId: Types.ObjectId | null;
  patientCategoryCode: string | null;
  billingContext: BillingContext | null;
  effectiveFrom: Date;
  effectiveThrough: Date | null;
  status: TreatmentPackageStatus;
}

export interface TreatmentPackageItemRecord extends BillingPersistenceMetadata {
  _id: Types.ObjectId;
  treatmentPackageId: Types.ObjectId;
  lineNumber: number;
  chargeCatalogItemId: Types.ObjectId;
  includedQuantity: Types.Decimal128;
  overageAllowed: boolean;
  overageRateId: Types.ObjectId | null;
  allocationAmount: Types.Decimal128;
  requiredComponent: boolean;
  active: boolean;
}

export interface ResolvedPriceRecord {
  catalog: ChargeCatalogRecord;
  catalogVersion: ChargeCatalogVersionRecord;
  category: ChargeCategoryRecord;
  priceList: PriceListRecord;
  serviceRate: ServiceRateRecord;
  taxCategory: TaxCategoryRecord | null;
  quantity: Types.Decimal128;
  originalUnitPrice: Types.Decimal128;
  authoritativeUnitPrice: Types.Decimal128;
  resolutionReason: string;
}

export interface BillingPayerSnapshotRecord {
  sequence: 1 | 2;
  payerOrganizationId: Types.ObjectId;
  panelPlanId: Types.ObjectId | null;
  patientCoverageId: Types.ObjectId | null;
  payerNameSnapshot: string;
  planNameSnapshot: string | null;
  membershipNumberSnapshot: string | null;
  authorizationReference: string | null;
  coverageLimitSnapshot: Types.Decimal128 | null;
  copaySnapshot: Types.Decimal128;
  coinsurancePercentageSnapshot: Types.Decimal128;
  deductibleSnapshot: Types.Decimal128;
  coverageEffectiveFrom: Date | null;
  coverageEffectiveThrough: Date | null;
}

export interface PatientAccountRecord extends BillingPersistenceMetadata {
  _id: Types.ObjectId;
  accountNumber: string;
  patientId: Types.ObjectId;
  accountType: PatientAccountType;
  billingContext: BillingContext;
  registrationId: Types.ObjectId | null;
  opdVisitId: Types.ObjectId | null;
  encounterId: Types.ObjectId | null;
  admissionId: Types.ObjectId | null;
  emergencyVisitId: Types.ObjectId | null;
  responsiblePartyType: ResponsiblePartyType;
  guarantorId: Types.ObjectId | null;
  guarantorNameSnapshot: string | null;
  payerSnapshots: BillingPayerSnapshotRecord[];
  currency: string;
  grossCharges: Types.Decimal128;
  discountTotal: Types.Decimal128;
  taxTotal: Types.Decimal128;
  welfareTotal: Types.Decimal128;
  payerResponsibilityTotal: Types.Decimal128;
  patientResponsibilityTotal: Types.Decimal128;
  paymentsAppliedTotal: Types.Decimal128;
  creditsTotal: Types.Decimal128;
  writeOffTotal: Types.Decimal128;
  outstandingBalance: Types.Decimal128;
  refundableBalance: Types.Decimal128;
  status: PatientAccountStatus;
  lockedAt: Date | null;
  lockedBy: Types.ObjectId | null;
  lockReason: string | null;
  finalizedAt: Date | null;
  finalizedBy: Types.ObjectId | null;
  suspendedAt: Date | null;
  suspendedBy: Types.ObjectId | null;
  suspensionReason: string | null;
  closedPeriodCode: string | null;
}

export interface BillingMoneyRecord {
  grossAmount: Types.Decimal128;
  discountAmount: Types.Decimal128;
  taxAmount: Types.Decimal128;
  welfareAmount: Types.Decimal128;
  payerAmount: Types.Decimal128;
  patientAmount: Types.Decimal128;
  netAmount: Types.Decimal128;
}

export interface AccountChargeRecord
extends BillingPersistenceMetadata, BillingMoneyRecord {
  _id: Types.ObjectId;
  operationKey: string;
  deterministicChargeKey: string;
  patientAccountId: Types.ObjectId;
  patientId: Types.ObjectId;
  registrationId: Types.ObjectId | null;
  opdVisitId: Types.ObjectId | null;
  encounterId: Types.ObjectId | null;
  admissionId: Types.ObjectId | null;
  source: {
    sourceModule: ChargeSourceModule;
    sourceRecordType: string;
    sourceRecordId: Types.ObjectId;
    sourceLineId: Types.ObjectId | null;
    sourceOccurredAt: Date;
  };
  chargeCatalogItemId: Types.ObjectId;
  chargeCatalogVersionId: Types.ObjectId;
  serviceRateId: Types.ObjectId;
  priceListId: Types.ObjectId;
  priceListVersionId: Types.ObjectId;
  chargeCodeSnapshot: string;
  serviceCodeSnapshot: string;
  chargeNameSnapshot: string;
  categoryCodeSnapshot: string;
  departmentId: Types.ObjectId | null;
  serviceLineCodeSnapshot: string | null;
  revenueAccountCodeSnapshot: string | null;
  taxCategoryId: Types.ObjectId | null;
  taxCategoryCodeSnapshot: string | null;
  unitOfMeasureId: Types.ObjectId | null;
  unitOfMeasureCodeSnapshot: string | null;
  quantity: Types.Decimal128;
  originalUnitPrice: Types.Decimal128;
  authoritativeUnitPrice: Types.Decimal128;
  costAmountSnapshot: Types.Decimal128;
  currency: string;
  status: ChargeStatus;
  packageEnrollmentId: Types.ObjectId | null;
  treatmentPackageItemId: Types.ObjectId | null;
  packageIncludedQuantity: Types.Decimal128;
  packageOverageQuantity: Types.Decimal128;
  payerOrganizationId: Types.ObjectId | null;
  panelPlanId: Types.ObjectId | null;
  patientCoverageId: Types.ObjectId | null;
  preauthorizationId: Types.ObjectId | null;
  excludedFromCoverage: boolean;
  originalChargeId: Types.ObjectId | null;
  replacementChargeId: Types.ObjectId | null;
  transferredFromAccountId: Types.ObjectId | null;
  transferredToAccountId: Types.ObjectId | null;
  approvalRequestIds: Types.ObjectId[];
  postedAt: Date | null;
  postedBy: Types.ObjectId | null;
  lifecycleReason: string | null;
  serviceFrom: Date;
  serviceThrough: Date | null;
}

export interface InvoiceTaxSummaryRecord {
  _id?: Types.ObjectId;
  taxCategoryId: Types.ObjectId | null;
  taxCodeSnapshot: string;
  taxableAmount: Types.Decimal128;
  taxAmount: Types.Decimal128;
}

export interface InvoiceRecord extends BillingPersistenceMetadata {
  _id: Types.ObjectId;
  invoiceNumber: string;
  patientAccountId: Types.ObjectId;
  patientId: Types.ObjectId;
  invoiceType: InvoiceType;
  currency: string;
  status: InvoiceStatus;
  lineCount: number;
  grossAmount: Types.Decimal128;
  discountAmount: Types.Decimal128;
  taxAmount: Types.Decimal128;
  welfareAmount: Types.Decimal128;
  payerAmount: Types.Decimal128;
  patientAmount: Types.Decimal128;
  netAmount: Types.Decimal128;
  paymentsAppliedAmount: Types.Decimal128;
  creditsAppliedAmount: Types.Decimal128;
  outstandingAmount: Types.Decimal128;
  refundableAmount: Types.Decimal128;
  issuedAt: Date | null;
  finalizedAt: Date | null;
  finalizedBy: Types.ObjectId | null;
  lockedAccountVersion: number | null;
  cancelledAt: Date | null;
  cancelledBy: Types.ObjectId | null;
  cancellationReason: string | null;
  originalInvoiceId: Types.ObjectId | null;
  replacementInvoiceId: Types.ObjectId | null;
  taxSummary: InvoiceTaxSummaryRecord[];
  discountIds: Types.ObjectId[];
  creditNoteIds: Types.ObjectId[];
  debitNoteIds: Types.ObjectId[];
  printableSnapshotVersion: number;
}

export interface InvoiceLineRecord extends BillingPersistenceMetadata, BillingMoneyRecord {
  _id: Types.ObjectId;
  invoiceId: Types.ObjectId;
  patientAccountId: Types.ObjectId;
  accountChargeId: Types.ObjectId;
  lineNumber: number;
  sourceModuleSnapshot: ChargeSourceModule;
  sourceRecordTypeSnapshot: string;
  sourceRecordId: Types.ObjectId;
  sourceLineId: Types.ObjectId | null;
  chargeCatalogItemId: Types.ObjectId;
  chargeCatalogVersionId: Types.ObjectId;
  priceListId: Types.ObjectId;
  priceListVersionId: Types.ObjectId;
  serviceRateId: Types.ObjectId;
  chargeCodeSnapshot: string;
  serviceCodeSnapshot: string;
  chargeNameSnapshot: string;
  categoryCodeSnapshot: string;
  departmentId: Types.ObjectId | null;
  serviceLineCodeSnapshot: string | null;
  quantity: Types.Decimal128;
  originalRate: Types.Decimal128;
  authoritativeRate: Types.Decimal128;
  currency: string;
  packageEnrollmentId: Types.ObjectId | null;
  payerOrganizationId: Types.ObjectId | null;
  patientCoverageId: Types.ObjectId | null;
  taxCategoryCodeSnapshot: string | null;
  discountIds: Types.ObjectId[];
}

export interface PatientAccountStatusHistoryRecord extends BillingPersistenceMetadata {
  _id: Types.ObjectId;
  patientAccountId: Types.ObjectId;
  fromStatus: PatientAccountStatus | null;
  toStatus: PatientAccountStatus;
  accountVersion: number;
  reason: string;
  changedAt: Date;
  changedBy: Types.ObjectId;
  approvalRequestId: Types.ObjectId | null;
}

export interface AccountChargeHistoryRecord extends BillingPersistenceMetadata {
  _id: Types.ObjectId;
  accountChargeId: Types.ObjectId;
  action: string;
  fromStatus: ChargeStatus | null;
  toStatus: ChargeStatus;
  chargeVersion: number;
  originalChargeId: Types.ObjectId | null;
  replacementChargeId: Types.ObjectId | null;
  reason: string;
  approvalRequestId: Types.ObjectId | null;
  changedAt: Date;
  changedBy: Types.ObjectId;
  amountSnapshot: BillingMoneyRecord;
}

export interface InvoiceStatusHistoryRecord extends BillingPersistenceMetadata {
  _id: Types.ObjectId;
  invoiceId: Types.ObjectId;
  action: string;
  fromStatus: InvoiceStatus | null;
  toStatus: InvoiceStatus;
  invoiceVersion: number;
  reason: string;
  originalInvoiceId: Types.ObjectId | null;
  replacementInvoiceId: Types.ObjectId | null;
  changedAt: Date;
  changedBy: Types.ObjectId;
}

export interface FinancialApprovalRequestRecord
extends BillingPersistenceMetadata {
  _id: Types.ObjectId;
  approvalType: FinancialApprovalType;
  patientAccountId: Types.ObjectId | null;
  accountChargeId: Types.ObjectId | null;
  invoiceId: Types.ObjectId | null;
  paymentId: Types.ObjectId | null;
  requestedAmount: Types.Decimal128 | null;
  requestedPercentage: Types.Decimal128 | null;
  reason: string;
  status: FinancialApprovalStatus;
  requestedBy: Types.ObjectId;
  requestedAt: Date;
  decidedBy: Types.ObjectId | null;
  decidedAt: Date | null;
  decisionReason: string | null;
  expiresAt: Date | null;
}

export interface PaymentRecord extends BillingPersistenceMetadata {
  _id: Types.ObjectId;
  operationKey: string;
  paymentNumber: string;
  receiptNumber: string | null;
  patientAccountId: Types.ObjectId;
  invoiceId: Types.ObjectId | null;
  paymentIntentId: Types.ObjectId | null;
  amount: Types.Decimal128;
  allocatedAmount: Types.Decimal128;
  unallocatedAmount: Types.Decimal128;
  refundedAmount: Types.Decimal128;
  currency: string;
  paymentMethod: PaymentMethod;
  externalReference: string | null;
  status: PaymentStatus;
  receivedAt: Date;
  receivedBy: Types.ObjectId;
  cashierStaffId: Types.ObjectId | null;
  cashShiftId: Types.ObjectId | null;
  counterId: Types.ObjectId | null;
}

export type ChargeCategoryPersistenceUpdate = Partial<
  Pick<
    ChargeCategoryRecord,
    | 'parentCategoryId'
    | 'name'
    | 'description'
    | 'clinical'
    | 'departmentId'
    | 'serviceLineCode'
    | 'revenueAccountCode'
    | 'status'
    | 'deactivatedAt'
    | 'deactivatedBy'
    | 'deactivationReason'
    | 'updatedBy'
  >
>;

export type ChargeCatalogPersistenceUpdate = Partial<
  Pick<
    ChargeCatalogRecord,
    | 'serviceCode'
    | 'name'
    | 'description'
    | 'categoryId'
    | 'chargeType'
    | 'clinical'
    | 'departmentId'
    | 'serviceLineCode'
    | 'revenueAccountCode'
    | 'ledgerAccountId'
    | 'taxCategoryId'
    | 'unitOfMeasureId'
    | 'defaultQuantity'
    | 'minimumQuantity'
    | 'maximumQuantity'
    | 'minimumPrice'
    | 'maximumPrice'
    | 'costAmount'
    | 'manualPostingAllowed'
    | 'recurringChargeAllowed'
    | 'timeBasedCharge'
    | 'effectiveFrom'
    | 'effectiveThrough'
    | 'status'
    | 'currentVersion'
    | 'latestVersionId'
    | 'activatedAt'
    | 'activatedBy'
    | 'deactivatedAt'
    | 'deactivatedBy'
    | 'deactivationReason'
    | 'retiredAt'
    | 'retiredBy'
    | 'retirementReason'
    | 'updatedBy'
  >
>;

export type ChargeRulePersistenceUpdate = Partial<
  Pick<
    ChargeRuleRecord,
    | 'active'
    | 'reason'
    | 'updatedBy'
  >
>;

export type PriceListPersistenceUpdate = Partial<
  Pick<
    PriceListRecord,
    | 'name'
    | 'description'
    | 'priceListType'
    | 'patientCategoryCode'
    | 'payerCategoryCode'
    | 'payerOrganizationId'
    | 'panelPlanId'
    | 'departmentId'
    | 'locationId'
    | 'billingContext'
    | 'afterHoursOnly'
    | 'effectiveFrom'
    | 'effectiveThrough'
    | 'status'
    | 'priority'
    | 'currentVersion'
    | 'latestVersionId'
    | 'activatedAt'
    | 'activatedBy'
    | 'retiredAt'
    | 'retiredBy'
    | 'retirementReason'
    | 'updatedBy'
  >
>;

export type ServiceRatePersistenceUpdate = Partial<
  Pick<
    ServiceRateRecord,
    | 'status'
    | 'updatedBy'
    | 'changeReason'
  >
>;

export type TreatmentPackagePersistenceUpdate = Partial<
  Pick<
    TreatmentPackageRecord,
    | 'status'
    | 'updatedBy'
  >
>;

export type PatientAccountPersistenceUpdate = Partial<
  Pick<
    PatientAccountRecord,
    | 'payerSnapshots'
    | 'responsiblePartyType'
    | 'guarantorId'
    | 'guarantorNameSnapshot'
    | 'grossCharges'
    | 'discountTotal'
    | 'taxTotal'
    | 'welfareTotal'
    | 'payerResponsibilityTotal'
    | 'patientResponsibilityTotal'
    | 'paymentsAppliedTotal'
    | 'creditsTotal'
    | 'writeOffTotal'
    | 'outstandingBalance'
    | 'refundableBalance'
    | 'status'
    | 'lockedAt'
    | 'lockedBy'
    | 'lockReason'
    | 'finalizedAt'
    | 'finalizedBy'
    | 'suspendedAt'
    | 'suspendedBy'
    | 'suspensionReason'
    | 'updatedBy'
  >
>;

export type AccountChargePersistenceUpdate = Partial<
  Pick<
    AccountChargeRecord,
    | 'status'
    | 'originalChargeId'
    | 'replacementChargeId'
    | 'transferredFromAccountId'
    | 'transferredToAccountId'
    | 'approvalRequestIds'
    | 'postedAt'
    | 'postedBy'
    | 'lifecycleReason'
    | 'updatedBy'
  >
>;

export type InvoicePersistenceUpdate = Partial<
  Pick<
    InvoiceRecord,
    | 'status'
    | 'lineCount'
    | 'grossAmount'
    | 'discountAmount'
    | 'taxAmount'
    | 'welfareAmount'
    | 'payerAmount'
    | 'patientAmount'
    | 'netAmount'
    | 'paymentsAppliedAmount'
    | 'creditsAppliedAmount'
    | 'outstandingAmount'
    | 'refundableAmount'
    | 'issuedAt'
    | 'finalizedAt'
    | 'finalizedBy'
    | 'lockedAccountVersion'
    | 'cancelledAt'
    | 'cancelledBy'
    | 'cancellationReason'
    | 'originalInvoiceId'
    | 'replacementInvoiceId'
    | 'taxSummary'
    | 'discountIds'
    | 'creditNoteIds'
    | 'debitNoteIds'
    | 'printableSnapshotVersion'
    | 'updatedBy'
  >
>;