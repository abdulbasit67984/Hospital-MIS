import {
  decimal128ToString,
} from '@hospital-mis/database';

import type {
  ClaimAppealView,
  ClaimBatchView,
  ClaimFinancialSummaryView,
  ClaimLineFinancialView,
  ClaimLineView,
  ClaimReadinessIssueView,
  ClaimView,
  ClaimWorkItemView,
} from './claims.contracts.js';

import type {
  ClaimAppealRecord,
  ClaimBatchRecord,
  ClaimLineRecord,
  ClaimReadinessIssueRecord,
  ClaimRecord,
  ClaimWorkItemRecord,
} from './claims.persistence.types.js';

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

function iso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

export function projectClaimReadinessIssue(
  issue: ClaimReadinessIssueRecord,
): ClaimReadinessIssueView {
  return {
    code: issue.code,
    severity: issue.severity,
    scope: issue.scope,
    claimLineId: nullableObjectId(issue.claimLineId),
    field: issue.field,
    message: issue.message,
  };
}

export function projectClaimLineFinancials(
  record: ClaimLineRecord,
): ClaimLineFinancialView {
  return {
    grossAmount: decimal(record.grossAmount),
    packageAmount: decimal(record.packageAmount),
    deductibleAmount: decimal(record.deductibleAmount),
    copaymentAmount: decimal(record.copaymentAmount),
    coinsuranceAmount: decimal(record.coinsuranceAmount),
    excludedAmount: decimal(record.excludedAmount),
    patientOtherAmount: decimal(record.patientOtherAmount),
    patientResponsibilityAmount: decimal(record.patientResponsibilityAmount),
    claimedAmount: decimal(record.claimedAmount),
    approvedAmount: decimal(record.approvedAmount),
    deniedAmount: decimal(record.deniedAmount),
    disallowedAmount: decimal(record.disallowedAmount),
    returnedAmount: decimal(record.returnedAmount),
    contractualAdjustmentAmount: decimal(record.contractualAdjustmentAmount),
    writeOffAmount: decimal(record.writeOffAmount),
    paidAmount: decimal(record.paidAmount),
    outstandingAmount: decimal(record.outstandingAmount),
  };
}

export function projectClaimLine(record: ClaimLineRecord): ClaimLineView {
  return {
    id: objectId(record._id),
    claimId: objectId(record.claimId),
    lineNumber: record.lineNumber,
    invoiceLineId: objectId(record.invoiceLineId),
    chargeCatalogItemId: objectId(record.chargeCatalogItemId),
    sourceModule: record.sourceModule,
    sourceRecordId: nullableObjectId(record.sourceRecordId),
    serviceCategory: record.serviceCategory,
    serviceFrom: record.serviceFrom.toISOString(),
    serviceThrough: iso(record.serviceThrough),
    serviceCodeSystem: record.serviceCodeSystem,
    serviceCode: record.serviceCode,
    revenueCode: record.revenueCode,
    modifiers: record.modifiers,
    providerId: nullableObjectId(record.providerId),
    departmentId: nullableObjectId(record.departmentId),
    status: record.status,
    financials: projectClaimLineFinancials(record),
    version: record.version,
  };
}

export function projectClaimFinancialSummary(
  record: ClaimRecord,
): ClaimFinancialSummaryView {
  return {
    currency: record.currency,
    grossAmount: decimal(record.grossAmount),
    packageAmount: decimal(record.packageAmount),
    deductibleAmount: decimal(record.deductibleAmount),
    copaymentAmount: decimal(record.copaymentAmount),
    coinsuranceAmount: decimal(record.coinsuranceAmount),
    excludedAmount: decimal(record.excludedAmount),
    patientOtherAmount: decimal(record.patientOtherAmount),
    patientResponsibilityAmount: decimal(record.patientResponsibilityAmount),
    claimedAmount: decimal(record.claimedAmount),
    approvedAmount: decimal(record.approvedAmount),
    deniedAmount: decimal(record.deniedAmount),
    disallowedAmount: decimal(record.disallowedAmount),
    returnedAmount: decimal(record.returnedAmount),
    contractualAdjustmentAmount: decimal(record.contractualAdjustmentAmount),
    writeOffAmount: decimal(record.writeOffAmount),
    paidAmount: decimal(record.paidAmount),
    outstandingAmount: decimal(record.outstandingAmount),
  };
}

export function projectClaim(
  record: ClaimRecord,
  lines: readonly ClaimLineRecord[],
): ClaimView {
  return {
    id: objectId(record._id),
    facilityId: objectId(record.facilityId),
    claimNumber: record.claimNumber,
    claimVersionNumber: record.claimVersionNumber,
    claimVersionType: record.claimVersionType,
    originalClaimId: nullableObjectId(record.originalClaimId),
    patientId: objectId(record.patientId),
    invoiceId: objectId(record.invoiceId),
    coverageDeterminationId: objectId(record.coverageDeterminationId),
    payerOrganizationId: objectId(record.payerOrganizationId),
    payerType: record.payerType,
    panelPlanId: objectId(record.panelPlanId),
    patientCoverageId: objectId(record.patientCoverageId),
    policyReferenceMasked: record.policyReferenceMasked,
    membershipReferenceMasked: record.membershipReferenceMasked,
    status: record.status,
    serviceFrom: record.serviceFrom.toISOString(),
    serviceThrough: record.serviceThrough.toISOString(),
    filingDeadline: iso(record.filingDeadline),
    payerReferenceNumber: record.payerReferenceNumber,
    assignedToUserId: nullableObjectId(record.assignedToUserId),
    followUpAt: iso(record.followUpAt),
    financials: projectClaimFinancialSummary(record),
    lines: lines.map(projectClaimLine),
    readinessIssues: record.readinessIssues.map(projectClaimReadinessIssue),
    submittedAt: iso(record.submittedAt),
    adjudicatedAt: iso(record.adjudicatedAt),
    paidAt: iso(record.paidAt),
    closedAt: iso(record.closedAt),
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function projectClaimBatch(record: ClaimBatchRecord): ClaimBatchView {
  return {
    id: objectId(record._id),
    facilityId: objectId(record.facilityId),
    batchNumber: record.batchNumber,
    payerOrganizationId: objectId(record.payerOrganizationId),
    panelPlanId: nullableObjectId(record.panelPlanId),
    submissionChannel: record.submissionChannel,
    status: record.status,
    claimCount: record.claimCount,
    claimedAmount: decimal(record.claimedAmount),
    approvedAmount: decimal(record.approvedAmount),
    paidAmount: decimal(record.paidAmount),
    submissionStatus: record.submissionStatus,
    submittedAt: iso(record.submittedAt),
    acknowledgedAt: iso(record.acknowledgedAt),
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function projectClaimAppeal(record: ClaimAppealRecord): ClaimAppealView {
  return {
    id: objectId(record._id),
    claimId: objectId(record.claimId),
    appealNumber: record.appealNumber,
    status: record.status,
    appealDeadline: record.appealDeadline.toISOString(),
    requestedAmount: decimal(record.requestedAmount),
    approvedAdditionalAmount: decimal(record.approvedAdditionalAmount),
    assignedToUserId: nullableObjectId(record.assignedToUserId),
    submittedAt: iso(record.submittedAt),
    decidedAt: iso(record.decidedAt),
    version: record.version,
  };
}

export function projectClaimWorkItem(
  record: ClaimWorkItemRecord,
): ClaimWorkItemView {
  return {
    id: objectId(record._id),
    claimId: objectId(record.claimId),
    workQueueType: record.workQueueType,
    status: record.status,
    assignedToUserId: nullableObjectId(record.assignedToUserId),
    priority: record.priority,
    followUpAt: iso(record.followUpAt),
    escalatedAt: iso(record.escalatedAt),
    version: record.version,
  };
}