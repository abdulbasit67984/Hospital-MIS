import {
  decimal128ToString,
} from '@hospital-mis/database';

import type {
  AssistanceAllocationLineView,
  AssistanceAllocationView,
  AssistanceApplicationView,
  AssistanceApprovalView,
  AssistanceFundView,
  AssistanceReservationView,
  AssistanceWorkItemView,
  FundBalanceView,
  FundTransactionView,
} from './welfare-zakat.contracts.js';
import type {
  AssistanceAllocationLineRecord,
  AssistanceAllocationRecord,
  AssistanceApplicationRecord,
  AssistanceApprovalRecord,
  AssistanceFundRecord,
  AssistanceReservationRecord,
  AssistanceWorkItemRecord,
  FundTransactionRecord,
} from './welfare-zakat.persistence.types.js';

function objectId(value: Readonly<{ toHexString(): string }>): string {
  return value.toHexString();
}

function nullableObjectId(
  value: Readonly<{ toHexString(): string }> | null,
): string | null {
  return value === null ? null : objectId(value);
}

function decimal(value: Parameters<typeof decimal128ToString>[0]): string {
  return decimal128ToString(value);
}

function nullableDecimal(
  value: Parameters<typeof decimal128ToString>[0] | null,
): string | null {
  return value === null ? null : decimal(value);
}

function iso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

export function projectFundBalance(record: AssistanceFundRecord): FundBalanceView {
  return {
    openingBalance: decimal(record.openingBalance),
    inflowAmount: decimal(record.inflowAmount),
    transferInAmount: decimal(record.transferInAmount),
    transferOutAmount: decimal(record.transferOutAmount),
    adjustmentIncreaseAmount: decimal(record.adjustmentIncreaseAmount),
    adjustmentDecreaseAmount: decimal(record.adjustmentDecreaseAmount),
    ledgerBalance: decimal(record.ledgerBalance),
    reservedBalance: decimal(record.reservedBalance),
    committedBalance: decimal(record.committedBalance),
    availableBalance: decimal(record.availableBalance),
    utilizedBalance: decimal(record.utilizedBalance),
    reversedBalance: decimal(record.reversedBalance),
    refundAmount: decimal(record.refundAmount),
    repaymentAmount: decimal(record.repaymentAmount),
    recoveryAmount: decimal(record.recoveryAmount),
    writeOffAmount: decimal(record.writeOffAmount),
  };
}

export function projectAssistanceFund(
  record: AssistanceFundRecord,
): AssistanceFundView {
  return {
    id: objectId(record._id),
    facilityId: objectId(record.facilityId),
    fundCode: record.fundCode,
    name: record.name,
    description: record.description,
    fundType: record.fundType,
    categoryCode: record.categoryCode,
    restriction: record.restriction,
    donorReferenceMasked: record.donorReferenceMasked,
    fundingSourceReferenceMasked: record.fundingSourceReferenceMasked,
    effectiveFrom: record.effectiveFrom.toISOString(),
    effectiveThrough: iso(record.effectiveThrough),
    status: record.status,
    currency: record.currency,
    balances: projectFundBalance(record),
    approvalMatrixCode: record.approvalMatrixCode,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function projectFundTransaction(
  record: FundTransactionRecord,
): FundTransactionView {
  return {
    id: objectId(record._id),
    fundId: objectId(record.fundId),
    transactionNumber: record.transactionNumber,
    transactionType: record.transactionType,
    direction: record.direction,
    amount: decimal(record.amount),
    balanceAfter: decimal(record.balanceAfter),
    applicationId: nullableObjectId(record.applicationId),
    approvalId: nullableObjectId(record.approvalId),
    reservationId: nullableObjectId(record.reservationId),
    allocationId: nullableObjectId(record.allocationId),
    invoiceId: nullableObjectId(record.invoiceId),
    invoiceLineId: nullableObjectId(record.invoiceLineId),
    donorReferenceMasked: record.donorReferenceMasked,
    receiptReferenceMasked: record.receiptReferenceMasked,
    occurredAt: record.occurredAt.toISOString(),
    actorUserId: objectId(record.actorUserId),
    makerUserId: nullableObjectId(record.makerUserId),
    checkerUserId: nullableObjectId(record.checkerUserId),
    reversalOfTransactionId: nullableObjectId(record.reversalOfTransactionId),
  };
}

export function projectAssistanceApplication(
  record: AssistanceApplicationRecord,
): AssistanceApplicationView {
  return {
    id: objectId(record._id),
    facilityId: objectId(record.facilityId),
    applicationNumber: record.applicationNumber,
    applicationType: record.applicationType,
    patientId: objectId(record.patientId),
    guardianId: nullableObjectId(record.guardianId),
    encounterId: nullableObjectId(record.encounterId),
    admissionId: nullableObjectId(record.admissionId),
    invoiceId: nullableObjectId(record.invoiceId),
    claimId: nullableObjectId(record.claimId),
    preferredFundId: nullableObjectId(record.preferredFundId),
    status: record.status,
    completenessSatisfied: record.completenessSatisfied,
    eligibilityOutcome: record.eligibilityOutcome,
    requestedAmount: nullableDecimal(record.requestedAmount),
    recommendedAmount: nullableDecimal(record.recommendedAmount),
    approvedAmount: decimal(record.approvedAmount),
    reservedAmount: decimal(record.reservedAmount),
    utilizedAmount: decimal(record.utilizedAmount),
    remainingApprovedAmount: decimal(record.remainingApprovedAmount),
    financialYearCode: record.financialYearCode,
    assignedToUserId: nullableObjectId(record.assignedToUserId),
    followUpAt: iso(record.followUpAt),
    submittedAt: iso(record.submittedAt),
    reviewDeadlineAt: iso(record.reviewDeadlineAt),
    approvalDeadlineAt: iso(record.approvalDeadlineAt),
    expiresAt: iso(record.expiresAt),
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function projectAssistanceApproval(
  record: AssistanceApprovalRecord,
): AssistanceApprovalView {
  return {
    id: objectId(record._id),
    applicationId: objectId(record.applicationId),
    approvalNumber: record.approvalNumber,
    fundId: objectId(record.fundId),
    status: record.status,
    requestedAmount: decimal(record.requestedAmount),
    approvedAmount: decimal(record.approvedAmount),
    reservedAmount: decimal(record.reservedAmount),
    committedAmount: decimal(record.committedAmount),
    utilizedAmount: decimal(record.utilizedAmount),
    reversedAmount: decimal(record.reversedAmount),
    releasedAmount: decimal(record.releasedAmount),
    remainingAmount: decimal(record.remainingAmount),
    approvedFrom: record.approvedFrom.toISOString(),
    approvedThrough: iso(record.approvedThrough),
    approvalMatrixCode: record.approvalMatrixCode,
    makerUserId: objectId(record.makerUserId),
    checkerUserIds: record.checkerUserIds.map(objectId),
    expiresAt: iso(record.expiresAt),
    version: record.version,
  };
}

export function projectAssistanceReservation(
  record: AssistanceReservationRecord,
): AssistanceReservationView {
  return {
    id: objectId(record._id),
    applicationId: objectId(record.applicationId),
    approvalId: objectId(record.approvalId),
    fundId: objectId(record.fundId),
    patientId: objectId(record.patientId),
    invoiceId: objectId(record.invoiceId),
    status: record.status,
    reservedAmount: decimal(record.reservedAmount),
    consumedAmount: decimal(record.consumedAmount),
    releasedAmount: decimal(record.releasedAmount),
    remainingAmount: decimal(record.remainingAmount),
    expiresAt: record.expiresAt.toISOString(),
    version: record.version,
  };
}

export function projectAssistanceAllocationLine(
  record: AssistanceAllocationLineRecord,
): AssistanceAllocationLineView {
  return {
    id: objectId(record._id),
    invoiceLineId: objectId(record.invoiceLineId),
    amount: decimal(record.amount),
    utilizedAmount: decimal(record.utilizedAmount),
    reversedAmount: decimal(record.reversedAmount),
    refundableAmount: decimal(record.remainingAmount),
  };
}

export function projectAssistanceAllocation(
  record: AssistanceAllocationRecord,
): AssistanceAllocationView {
  return {
    id: objectId(record._id),
    facilityId: objectId(record.facilityId),
    allocationNumber: record.allocationNumber,
    fundId: objectId(record.fundId),
    patientId: objectId(record.patientId),
    applicationId: objectId(record.applicationId),
    approvalId: objectId(record.approvalId),
    reservationId: nullableObjectId(record.reservationId),
    patientAccountId: objectId(record.patientAccountId),
    invoiceId: objectId(record.invoiceId),
    claimId: nullableObjectId(record.claimId),
    status: record.status,
    amount: decimal(record.amount),
    utilizedAmount: decimal(record.utilizedAmount),
    reversedAmount: decimal(record.reversedAmount),
    refundedAmount: decimal(record.refundedAmount),
    repaidAmount: decimal(record.repaidAmount),
    recoveredAmount: decimal(record.recoveredAmount),
    remainingAmount: decimal(record.remainingAmount),
    priority: record.priority,
    allocatedBy: objectId(record.allocatedBy),
    approvedBy: nullableObjectId(record.approvedBy),
    allocatedAt: record.allocatedAt.toISOString(),
    confirmedAt: iso(record.confirmedAt),
    lines: record.lines.map(projectAssistanceAllocationLine),
    reversalStatus: record.reversalStatus,
    version: record.version,
  };
}

export function projectAssistanceWorkItem(
  record: AssistanceWorkItemRecord,
): AssistanceWorkItemView {
  return {
    id: objectId(record._id),
    applicationId: objectId(record.applicationId),
    approvalId: nullableObjectId(record.approvalId),
    allocationId: nullableObjectId(record.allocationId),
    workQueueType: record.workQueueType,
    status: record.status,
    assignedToUserId: nullableObjectId(record.assignedToUserId),
    priority: record.priority,
    followUpAt: iso(record.followUpAt),
    escalatedAt: iso(record.escalatedAt),
    version: record.version,
  };
}