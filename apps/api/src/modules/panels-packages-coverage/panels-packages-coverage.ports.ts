import type {
  PermissionKey,
} from '@hospital-mis/permissions';

import type {
  CreateCoveragePlanInput,
  CreatePanelInput,
  CreatePayerOrganizationInput,
  EnrollPatientCoverageInput,
  EnrollPatientPackageInput,
  PanelsPackagesCoverageActorContext,
} from './panels-packages-coverage.contracts.js';

import type {
  CoverageBenefitBalanceRecord,
  CoverageDeterminationRecord,
  CoverageUtilizationRecord,
  DiagnosticPanelItemRecord,
  DiagnosticPanelRecord,
  PackageEnrollmentBalanceRecord,
  PackageEnrollmentRecord,
  PanelPlanRecord,
  PatientCoverageRecord,
  PayerOrganizationRecord,
  PpcMongoSession,
} from './panels-packages-coverage.persistence.types.js';

export interface PpcTransactionContext {
  transactionId: string;
  session: PpcMongoSession;
}

export interface PpcTransactionManagerPort {
  execute<T>(input: Readonly<{
    transactionType: string;
    idempotencyKey: string;
    actorUserId: string;
    facilityId: string;
    correlationId: string;
    lockKeys: readonly string[];
    idempotencyPayload: unknown;
    journalPayload: unknown;
    execute(context: PpcTransactionContext): Promise<T>;
  }>): Promise<T>;
}

export interface PpcAccessPolicyPort {
  authorize(input: Readonly<{
    actor: PanelsPackagesCoverageActorContext;
    permission: PermissionKey | string;
  }>): Promise<Readonly<{
    allowed: boolean;
    denialReason: string | null;
  }>>;
}

export interface PpcAuditPort {
  record(input: Readonly<{
    actor: PanelsPackagesCoverageActorContext;
    action: string;
    entityType: string;
    entityId: string;
    reason: string | null;
    before: unknown;
    after: unknown;
    transactionId: string;
    session: PpcMongoSession;
  }>): Promise<void>;
}

export interface PpcOutboxPort {
  enqueue(input: Readonly<{
    facilityId: string;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: Readonly<Record<string, unknown>>;
    correlationId: string;
    transactionId: string;
    session: PpcMongoSession;
  }>): Promise<void>;
}

export interface PpcClockPort {
  now(): Date;
}

export interface DiagnosticPanelRepositoryPort {
  create(
    actor: PanelsPackagesCoverageActorContext,
    input: CreatePanelInput,
    priceListId: string,
    transaction: PpcTransactionContext,
  ): Promise<DiagnosticPanelRecord>;

  insertItems(
    actor: PanelsPackagesCoverageActorContext,
    panelId: string,
    items: CreatePanelInput['items'],
    transaction: PpcTransactionContext,
  ): Promise<DiagnosticPanelItemRecord[]>;

  findById(
    facilityId: string,
    panelId: string,
    session?: PpcMongoSession,
  ): Promise<DiagnosticPanelRecord | null>;

  listItems(
    facilityId: string,
    panelId: string,
    session?: PpcMongoSession,
  ): Promise<DiagnosticPanelItemRecord[]>;

  updateStatus(
    facilityId: string,
    panelId: string,
    expectedVersion: number,
    update: Readonly<Record<string, unknown>>,
    transaction: PpcTransactionContext,
  ): Promise<DiagnosticPanelRecord | null>;
}

export interface PayerCoverageRepositoryPort {
  createPayer(
    actor: PanelsPackagesCoverageActorContext,
    input: CreatePayerOrganizationInput,
    transaction: PpcTransactionContext,
  ): Promise<PayerOrganizationRecord>;

  createPlan(
    actor: PanelsPackagesCoverageActorContext,
    input: CreateCoveragePlanInput,
    transaction: PpcTransactionContext,
  ): Promise<PanelPlanRecord>;

  findPlan(
    facilityId: string,
    planId: string,
    session?: PpcMongoSession,
  ): Promise<PanelPlanRecord | null>;

  enrollPatient(
    actor: PanelsPackagesCoverageActorContext,
    input: EnrollPatientCoverageInput,
    coverageNumber: string,
    membershipEncrypted: string | null,
    membershipHash: string | null,
    plan: PanelPlanRecord,
    transaction: PpcTransactionContext,
  ): Promise<PatientCoverageRecord>;

  findPatientCoverage(
    facilityId: string,
    coverageId: string,
    session?: PpcMongoSession,
  ): Promise<PatientCoverageRecord | null>;

  listActivePatientCoverage(
    facilityId: string,
    patientId: string,
    asOf: Date,
    session?: PpcMongoSession,
  ): Promise<PatientCoverageRecord[]>;
}

export interface PackageCoverageRepositoryPort {
  enroll(
    actor: PanelsPackagesCoverageActorContext,
    input: EnrollPatientPackageInput,
    enrollmentNumber: string,
    transaction: PpcTransactionContext,
  ): Promise<PackageEnrollmentRecord>;

  createBalances(
    actor: PanelsPackagesCoverageActorContext,
    enrollmentId: string,
    balances: readonly Readonly<{
      treatmentPackageItemId: string;
      includedQuantity: string;
      includedAmount: string;
    }>[],
    transaction: PpcTransactionContext,
  ): Promise<PackageEnrollmentBalanceRecord[]>;

  findEnrollment(
    facilityId: string,
    enrollmentId: string,
    session?: PpcMongoSession,
  ): Promise<PackageEnrollmentRecord | null>;
}

export interface CoverageUtilizationRepositoryPort {
  createDetermination(
    actor: PanelsPackagesCoverageActorContext,
    input: Omit<
      CoverageDeterminationRecord,
      keyof import('./panels-packages-coverage.persistence.types.js').PpcPersistenceMetadata
    >,
    transaction: PpcTransactionContext,
  ): Promise<CoverageDeterminationRecord>;

  findBenefitBalance(
    facilityId: string,
    patientCoverageId: string,
    ruleCode: string,
    periodStart: Date,
    session: PpcMongoSession,
  ): Promise<CoverageBenefitBalanceRecord | null>;

  reserveBenefit(
    balanceId: string,
    facilityId: string,
    expectedVersion: number,
    quantity: string,
    amount: string,
    actorUserId: string,
    transaction: PpcTransactionContext,
  ): Promise<CoverageBenefitBalanceRecord | null>;

  createUtilization(
    actor: PanelsPackagesCoverageActorContext,
    input: Readonly<Record<string, unknown>>,
    transaction: PpcTransactionContext,
  ): Promise<CoverageUtilizationRecord>;
}

export interface PpcReferenceDataPort {
  patientExists(facilityId: string, patientId: string): Promise<boolean>;
  priceListExists(facilityId: string, priceListId: string): Promise<boolean>;
  chargeCatalogItemsExist(
    facilityId: string,
    itemIds: readonly string[],
  ): Promise<boolean>;
  treatmentPackageExists(
    facilityId: string,
    packageId: string,
  ): Promise<boolean>;
}