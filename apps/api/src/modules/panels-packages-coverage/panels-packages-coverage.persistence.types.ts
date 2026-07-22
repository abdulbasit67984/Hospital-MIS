import type {
  ClientSession,
  Types,
} from 'mongoose';

import type {
  CoverageDeterminationStatus,
  CoverageEnrollmentStatus,
  CoverageLimitPeriod,
  CoveragePriority,
  CoverageRuleEffect,
  PackageEnrollmentStatus,
  PackageUtilizationStatus,
  PanelStatus,
  PanelType,
  PayerOrganizationType,
} from './panels-packages-coverage.contracts.js';

export type PpcMongoSession = ClientSession;

export interface PpcPersistenceMetadata {
  _id: Types.ObjectId;
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

export interface DiagnosticPanelRecord extends PpcPersistenceMetadata {
  panelCode: string;
  name: string;
  description: string | null;
  panelType: PanelType;
  priceListId: Types.ObjectId;
  fixedPrice: Types.Decimal128;
  currency: string;
  effectiveFrom: Date;
  effectiveThrough: Date | null;
  status: PanelStatus;
  currentVersion: number;
  activatedAt: Date | null;
  activatedBy: Types.ObjectId | null;
  suspendedAt: Date | null;
  suspendedBy: Types.ObjectId | null;
  suspensionReason: string | null;
  retiredAt: Date | null;
  retiredBy: Types.ObjectId | null;
  retirementReason: string | null;
}

export interface DiagnosticPanelItemRecord
extends PpcPersistenceMetadata {
  diagnosticPanelId: Types.ObjectId;
  lineNumber: number;
  chargeCatalogItemId: Types.ObjectId;
  quantity: Types.Decimal128;
  requiredComponent: boolean;
  allocationAmount: Types.Decimal128;
  active: boolean;
}

export interface PayerOrganizationRecord
extends PpcPersistenceMetadata {
  organizationCode: string;
  name: string;
  organizationType: PayerOrganizationType;
  registrationReference: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'RETIRED';
  active: boolean;
}

export interface PanelPlanRuleRecord {
  _id: Types.ObjectId;
  ruleCode: string;
  effect: CoverageRuleEffect;
  chargeCatalogItemId: Types.ObjectId | null;
  chargeCategoryId: Types.ObjectId | null;
  departmentId: Types.ObjectId | null;
  limitPeriod: CoverageLimitPeriod | null;
  limitQuantity: Types.Decimal128 | null;
  limitAmount: Types.Decimal128 | null;
  waitingPeriodDays: number;
  networkCode: string | null;
  preauthorizationRequired: boolean;
  priority: number;
}

export interface PanelPlanRecord extends PpcPersistenceMetadata {
  payerOrganizationId: Types.ObjectId;
  panelProgramId: Types.ObjectId | null;
  planCode: string;
  name: string;
  description: string | null;
  deductibleAmount: Types.Decimal128;
  copaymentAmount: Types.Decimal128;
  coinsurancePercentage: Types.Decimal128;
  coveragePercentage: Types.Decimal128;
  annualLimit: Types.Decimal128 | null;
  lifetimeLimit: Types.Decimal128 | null;
  networkCodes: readonly string[];
  rules: readonly PanelPlanRuleRecord[];
  effectiveFrom: Date;
  effectiveThrough: Date | null;
  status: 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'RETIRED';
  currentVersion: number;
}

export interface PatientCoverageRecord
extends PpcPersistenceMetadata {
  coverageNumber: string;
  patientId: Types.ObjectId;
  panelPlanId: Types.ObjectId;
  priority: CoveragePriority;
  policyReference: string | null;
  membershipReferenceEncrypted?: string | null;
  membershipReferenceHash?: string | null;
  employerReference: string | null;
  authorizationReference: string | null;
  eligibleFrom: Date;
  eligibleThrough: Date | null;
  status: CoverageEnrollmentStatus;
  lastVerificationId: Types.ObjectId | null;
  suspendedAt: Date | null;
  suspendedBy: Types.ObjectId | null;
  suspensionReason: string | null;
  cancelledAt: Date | null;
  cancelledBy: Types.ObjectId | null;
  cancellationReason: string | null;
}

export interface PackageEnrollmentRecord
extends PpcPersistenceMetadata {
  patientId: Types.ObjectId;
  treatmentPackageId: Types.ObjectId;
  status: PackageEnrollmentStatus;
  enrollmentNumber: string;
  effectiveFrom: Date;
  effectiveThrough: Date | null;
  accountId: Types.ObjectId | null;
  invoiceId: Types.ObjectId | null;
  authorizationReference: string | null;
}

export interface PackageEnrollmentBalanceRecord
extends PpcPersistenceMetadata {
  packageEnrollmentId: Types.ObjectId;
  treatmentPackageItemId: Types.ObjectId;
  includedQuantity: Types.Decimal128;
  reservedQuantity: Types.Decimal128;
  consumedQuantity: Types.Decimal128;
  reversedQuantity: Types.Decimal128;
  includedAmount: Types.Decimal128;
  reservedAmount: Types.Decimal128;
  consumedAmount: Types.Decimal128;
  reversedAmount: Types.Decimal128;
}

export interface CoverageAllocationRecord {
  _id: Types.ObjectId;
  invoiceLineId: Types.ObjectId;
  patientCoverageId: Types.ObjectId | null;
  packageEnrollmentId: Types.ObjectId | null;
  grossAmount: Types.Decimal128;
  packageAmount: Types.Decimal128;
  deductibleAmount: Types.Decimal128;
  copaymentAmount: Types.Decimal128;
  coinsuranceAmount: Types.Decimal128;
  sponsorAmount: Types.Decimal128;
  patientAmount: Types.Decimal128;
  deniedAmount: Types.Decimal128;
  denialReason: string | null;
}

export interface CoverageDeterminationRecord
extends PpcPersistenceMetadata {
  operationKey: string;
  determinationNumber: string;
  patientId: Types.ObjectId;
  invoiceId: Types.ObjectId;
  estimationId: Types.ObjectId | null;
  coverageIds: readonly Types.ObjectId[];
  status: CoverageDeterminationStatus;
  asOf: Date;
  grossAmount: Types.Decimal128;
  packageAmount: Types.Decimal128;
  sponsorAmount: Types.Decimal128;
  patientAmount: Types.Decimal128;
  allocations: readonly CoverageAllocationRecord[];
  approvedAt: Date | null;
  approvedBy: Types.ObjectId | null;
  overriddenAt: Date | null;
  overriddenBy: Types.ObjectId | null;
  overrideAuthorizationReference: string | null;
  overrideReason: string | null;
  reversedAt: Date | null;
  reversedBy: Types.ObjectId | null;
  reversalReason: string | null;
}

export interface CoverageBenefitBalanceRecord
extends PpcPersistenceMetadata {
  patientCoverageId: Types.ObjectId;
  panelPlanId: Types.ObjectId;
  ruleCode: string;
  limitPeriod: CoverageLimitPeriod;
  periodStart: Date;
  periodEnd: Date | null;
  quantityLimit: Types.Decimal128 | null;
  amountLimit: Types.Decimal128 | null;
  reservedQuantity: Types.Decimal128;
  consumedQuantity: Types.Decimal128;
  reversedQuantity: Types.Decimal128;
  reservedAmount: Types.Decimal128;
  consumedAmount: Types.Decimal128;
  reversedAmount: Types.Decimal128;
}

export interface CoverageUtilizationRecord
extends PpcPersistenceMetadata {
  operationKey: string;
  coverageDeterminationId: Types.ObjectId;
  coverageBenefitBalanceId: Types.ObjectId;
  patientCoverageId: Types.ObjectId;
  invoiceId: Types.ObjectId;
  invoiceLineId: Types.ObjectId;
  chargeCatalogItemId: Types.ObjectId;
  quantity: Types.Decimal128;
  sponsorAmount: Types.Decimal128;
  status: PackageUtilizationStatus;
  consumedAt: Date | null;
  refundId: Types.ObjectId | null;
  creditNoteId: Types.ObjectId | null;
  reversedAt: Date | null;
  reversedBy: Types.ObjectId | null;
  reversalReason: string | null;
}