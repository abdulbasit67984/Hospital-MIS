import type {
  ConsultantAgreementRuleDefinition,
  ConsultantAgreementRuleView,
  ConsultantAgreementView,
  ConsultantDisputeView,
  ConsultantRevenueEntryView,
  ConsultantSettlementTotalsResult,
  ConsultantSettlementView,
} from './consultant-sharing.contracts.js';
import type {
  ConsultantAgreementStatus,
  ConsultantDisputeStatus,
  ConsultantEngagementType,
  ConsultantRevenueEntryStatus,
  ConsultantRevenueEntryType,
  ConsultantSettlementPeriodType,
  ConsultantSettlementStatus,
  ConsultantSharingCurrency,
} from './consultant-sharing.constants.js';

interface ObjectIdLike {
  toHexString(): string;
}

interface DecimalLike {
  toString(): string;
}

function objectId(value: ObjectIdLike): string {
  return value.toHexString();
}

function nullableObjectId(value: ObjectIdLike | null): string | null {
  return value === null ? null : objectId(value);
}

function decimal(value: DecimalLike): string {
  return value.toString();
}

function iso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

export interface ConsultantAgreementProjectionRecord {
  _id: ObjectIdLike;
  facilityId: ObjectIdLike;
  agreementNumber: string;
  agreementName: string;
  description: string | null;
  consultantId: ObjectIdLike;
  consultantStaffId: ObjectIdLike | null;
  consultantGroupId: ObjectIdLike | null;
  engagementType: ConsultantEngagementType;
  status: ConsultantAgreementStatus;
  priority: number;
  effectiveFrom: Date;
  effectiveThrough: Date | null;
  agreementVersion: number;
  supersedesAgreementId: ObjectIdLike | null;
  supportingAttachmentIds: readonly ObjectIdLike[];
  submittedBy: ObjectIdLike | null;
  reviewedBy: ObjectIdLike | null;
  approvedBy: ObjectIdLike | null;
  activatedBy: ObjectIdLike | null;
  suspendedBy: ObjectIdLike | null;
  terminatedBy: ObjectIdLike | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  approvedAt: Date | null;
  activatedAt: Date | null;
  suspendedAt: Date | null;
  terminatedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConsultantAgreementRuleProjectionRecord
  extends Omit<
    ConsultantAgreementRuleDefinition,
    | 'id'
    | 'agreementId'
    | 'facilityId'
    | 'consultantId'
    | 'consultantGroupId'
    | 'departmentId'
    | 'serviceId'
    | 'chargeCatalogItemId'
    | 'procedureId'
    | 'payerOrganizationId'
    | 'panelProgramId'
    | 'packageId'
    | 'effectiveFrom'
    | 'effectiveThrough'
  > {
  _id: ObjectIdLike;
  agreementId: ObjectIdLike;
  facilityId: ObjectIdLike;
  consultantId: ObjectIdLike;
  consultantGroupId: ObjectIdLike | null;
  departmentId: ObjectIdLike | null;
  serviceId: ObjectIdLike | null;
  chargeCatalogItemId: ObjectIdLike | null;
  procedureId: ObjectIdLike | null;
  payerOrganizationId: ObjectIdLike | null;
  panelProgramId: ObjectIdLike | null;
  packageId: ObjectIdLike | null;
  effectiveFrom: Date;
  effectiveThrough: Date | null;
}

export interface ConsultantRevenueEntryProjectionRecord {
  _id: ObjectIdLike;
  facilityId: ObjectIdLike;
  consultantId: ObjectIdLike;
  agreementId: ObjectIdLike;
  agreementRuleId: ObjectIdLike;
  invoiceId: ObjectIdLike;
  invoiceLineId: ObjectIdLike;
  entryType: ConsultantRevenueEntryType;
  status: ConsultantRevenueEntryStatus;
  eligibleRevenue: DecimalLike;
  consultantShare: DecimalLike;
  hospitalShare: DecimalLike;
  taxWithholdingAmount: DecimalLike;
  deductionAmount: DecimalLike;
  netPayableAmount: DecimalLike;
  settledAmount: DecimalLike;
  outstandingAmount: DecimalLike;
  settlementId: ObjectIdLike | null;
  reversalOfEntryId: ObjectIdLike | null;
  calculationHash: string;
  occurredAt: Date;
  version: number;
}

export interface ConsultantSettlementProjectionRecord {
  _id: ObjectIdLike;
  facilityId: ObjectIdLike;
  settlementNumber: string;
  consultantId: ObjectIdLike;
  periodType: ConsultantSettlementPeriodType;
  periodFrom: Date;
  periodThrough: Date;
  status: ConsultantSettlementStatus;
  currency: ConsultantSharingCurrency;
  openingBalance: DecimalLike;
  broughtForwardBalance: DecimalLike;
  eligibleRevenue: DecimalLike;
  consultantShare: DecimalLike;
  adjustments: DecimalLike;
  refundDeductions: DecimalLike;
  creditNoteDeductions: DecimalLike;
  debitNoteAdditions: DecimalLike;
  claimDeductions: DecimalLike;
  welfareZakatDeductions: DecimalLike;
  taxWithholding: DecimalLike;
  otherDeductions: DecimalLike;
  advanceRecovery: DecimalLike;
  overpaymentRecovery: DecimalLike;
  paidAmount: DecimalLike;
  grossPayable: DecimalLike;
  totalDeductions: DecimalLike;
  netPayable: DecimalLike;
  outstandingAmount: DecimalLike;
  submittedBy: ObjectIdLike | null;
  approvedBy: ObjectIdLike | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  paidAt: Date | null;
  ledgerTransactionId: ObjectIdLike | null;
  itemCount: number;
  revenueEntryCount: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConsultantDisputeProjectionRecord {
  _id: ObjectIdLike;
  facilityId: ObjectIdLike;
  disputeNumber: string;
  consultantId: ObjectIdLike;
  makerUserId: ObjectIdLike;
  targetType: 'REVENUE_ENTRY' | 'SETTLEMENT' | 'SETTLEMENT_ITEM' | 'PAYMENT' | 'AGREEMENT' | 'AGREEMENT_RULE';
  settlementId: ObjectIdLike | null;
  revenueEntryId: ObjectIdLike | null;
  status: ConsultantDisputeStatus;
  reasonCode: string;
  reason: string;
  requestedAdjustmentAmount: DecimalLike;
  approvedAdjustmentAmount: DecimalLike;
  assignedToUserId: ObjectIdLike | null;
  followUpAt: Date | null;
  resolvedAt: Date | null;
  version: number;
}

export function projectConsultantAgreement(
  record: ConsultantAgreementProjectionRecord,
): ConsultantAgreementView {
  return {
    id: objectId(record._id),
    facilityId: objectId(record.facilityId),
    agreementNumber: record.agreementNumber,
    agreementName: record.agreementName,
    description: record.description,
    consultantId: objectId(record.consultantId),
    consultantStaffId: nullableObjectId(record.consultantStaffId),
    consultantGroupId: nullableObjectId(record.consultantGroupId),
    engagementType: record.engagementType,
    status: record.status,
    priority: record.priority,
    effectiveFrom: record.effectiveFrom.toISOString(),
    effectiveThrough: iso(record.effectiveThrough),
    agreementVersion: record.agreementVersion,
    supersedesAgreementId: nullableObjectId(record.supersedesAgreementId),
    supportingAttachmentIds: record.supportingAttachmentIds.map(objectId),
    submittedBy: nullableObjectId(record.submittedBy),
    reviewedBy: nullableObjectId(record.reviewedBy),
    approvedBy: nullableObjectId(record.approvedBy),
    activatedBy: nullableObjectId(record.activatedBy),
    suspendedBy: nullableObjectId(record.suspendedBy),
    terminatedBy: nullableObjectId(record.terminatedBy),
    submittedAt: iso(record.submittedAt),
    reviewedAt: iso(record.reviewedAt),
    approvedAt: iso(record.approvedAt),
    activatedAt: iso(record.activatedAt),
    suspendedAt: iso(record.suspendedAt),
    terminatedAt: iso(record.terminatedAt),
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function projectConsultantAgreementRule(
  record: ConsultantAgreementRuleProjectionRecord,
): ConsultantAgreementRuleView {
  return {
    ...record,
    id: objectId(record._id),
    agreementId: objectId(record.agreementId),
    facilityId: objectId(record.facilityId),
    consultantId: objectId(record.consultantId),
    consultantGroupId: nullableObjectId(record.consultantGroupId),
    departmentId: nullableObjectId(record.departmentId),
    serviceId: nullableObjectId(record.serviceId),
    chargeCatalogItemId: nullableObjectId(record.chargeCatalogItemId),
    procedureId: nullableObjectId(record.procedureId),
    payerOrganizationId: nullableObjectId(record.payerOrganizationId),
    panelProgramId: nullableObjectId(record.panelProgramId),
    packageId: nullableObjectId(record.packageId),
    effectiveFrom: record.effectiveFrom.toISOString(),
    effectiveThrough: iso(record.effectiveThrough),
  };
}

export function projectConsultantRevenueEntry(
  record: ConsultantRevenueEntryProjectionRecord,
): ConsultantRevenueEntryView {
  return {
    id: objectId(record._id),
    facilityId: objectId(record.facilityId),
    consultantId: objectId(record.consultantId),
    agreementId: objectId(record.agreementId),
    agreementRuleId: objectId(record.agreementRuleId),
    invoiceId: objectId(record.invoiceId),
    invoiceLineId: objectId(record.invoiceLineId),
    entryType: record.entryType,
    status: record.status,
    eligibleRevenue: decimal(record.eligibleRevenue),
    consultantShare: decimal(record.consultantShare),
    hospitalShare: decimal(record.hospitalShare),
    taxWithholdingAmount: decimal(record.taxWithholdingAmount),
    deductionAmount: decimal(record.deductionAmount),
    netPayableAmount: decimal(record.netPayableAmount),
    settledAmount: decimal(record.settledAmount),
    outstandingAmount: decimal(record.outstandingAmount),
    settlementId: nullableObjectId(record.settlementId),
    reversalOfEntryId: nullableObjectId(record.reversalOfEntryId),
    calculationHash: record.calculationHash,
    occurredAt: record.occurredAt.toISOString(),
    version: record.version,
  };
}

function projectSettlementTotals(
  record: ConsultantSettlementProjectionRecord,
): ConsultantSettlementTotalsResult {
  return {
    openingBalance: decimal(record.openingBalance),
    broughtForwardBalance: decimal(record.broughtForwardBalance),
    eligibleRevenue: decimal(record.eligibleRevenue),
    consultantShare: decimal(record.consultantShare),
    adjustments: decimal(record.adjustments),
    refundDeductions: decimal(record.refundDeductions),
    creditNoteDeductions: decimal(record.creditNoteDeductions),
    debitNoteAdditions: decimal(record.debitNoteAdditions),
    claimDeductions: decimal(record.claimDeductions),
    welfareZakatDeductions: decimal(record.welfareZakatDeductions),
    taxWithholding: decimal(record.taxWithholding),
    otherDeductions: decimal(record.otherDeductions),
    advanceRecovery: decimal(record.advanceRecovery),
    overpaymentRecovery: decimal(record.overpaymentRecovery),
    paidAmount: decimal(record.paidAmount),
    grossPayable: decimal(record.grossPayable),
    totalDeductions: decimal(record.totalDeductions),
    netPayable: decimal(record.netPayable),
    outstandingAmount: decimal(record.outstandingAmount),
  };
}

export function projectConsultantSettlement(
  record: ConsultantSettlementProjectionRecord,
): ConsultantSettlementView {
  return {
    id: objectId(record._id),
    facilityId: objectId(record.facilityId),
    settlementNumber: record.settlementNumber,
    consultantId: objectId(record.consultantId),
    periodType: record.periodType,
    periodFrom: record.periodFrom.toISOString(),
    periodThrough: record.periodThrough.toISOString(),
    status: record.status,
    currency: record.currency,
    totals: projectSettlementTotals(record),
    submittedBy: nullableObjectId(record.submittedBy),
    approvedBy: nullableObjectId(record.approvedBy),
    submittedAt: iso(record.submittedAt),
    approvedAt: iso(record.approvedAt),
    paidAt: iso(record.paidAt),
    ledgerTransactionId: nullableObjectId(record.ledgerTransactionId),
    itemCount: record.itemCount,
    revenueEntryCount: record.revenueEntryCount,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function projectConsultantDispute(
  record: ConsultantDisputeProjectionRecord,
): ConsultantDisputeView {
  return {
    id: objectId(record._id),
    facilityId: objectId(record.facilityId),
    disputeNumber: record.disputeNumber,
    consultantId: objectId(record.consultantId),
    makerUserId: objectId(record.makerUserId),
    targetType: record.targetType,
    settlementId: nullableObjectId(record.settlementId),
    revenueEntryId: nullableObjectId(record.revenueEntryId),
    status: record.status,
    reasonCode: record.reasonCode,
    reason: record.reason,
    requestedAdjustmentAmount: decimal(record.requestedAdjustmentAmount),
    approvedAdjustmentAmount: decimal(record.approvedAdjustmentAmount),
    assignedToUserId: nullableObjectId(record.assignedToUserId),
    followUpAt: iso(record.followUpAt),
    resolvedAt: iso(record.resolvedAt),
    version: record.version,
  };
}