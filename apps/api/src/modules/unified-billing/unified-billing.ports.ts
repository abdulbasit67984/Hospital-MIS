import type {
  PermissionKey,
} from '@hospital-mis/permissions';

import type {
  ClientSession,
} from 'mongoose';

import type {
  AccountChargeView,
  AuthoritativeBillingAccountContext,
  AuthoritativeBillingSourceContext,
  BillingPage,
  ChargeCatalogItemView,
  ChargeCategoryView,
  ChargeRuleView,
  CreatePatientAccountInput,
  FinancialApprovalView,
  InvoiceView,
  PatientAccountView,
  PaymentView,
  PriceListView,
  ServiceRateView,
  TaxCategoryView,
  TreatmentPackageView,
  PostChargeBatchInput,
  PostSourceChargeInput,
  ResolvedPriceView,
  UnifiedBillingAccountListQuery,
  UnifiedBillingActorContext,
  UnifiedBillingCatalogListQuery,
  UnifiedBillingChargeListQuery,
  UnifiedBillingInvoiceListQuery,
} from './unified-billing.contracts.js';

import type {
  AccountChargeHistoryRecord,
  AccountChargePersistenceUpdate,
  AccountChargeRecord,
  BillingActorIdentityRecord,
  BillingCoverageRecord,
  BillingGuarantorRecord,
  BillingMongoSession,
  BillingPatientRecord,
  BillingSourceContextRecord,
  BillingStaffRecord,
  ChargeCatalogPersistenceUpdate,
  ChargeCatalogRecord,
  ChargeCatalogVersionRecord,
  ChargeCategoryPersistenceUpdate,
  ChargeCategoryRecord,
  ChargeRulePersistenceUpdate,
  ChargeRuleRecord,
  FinancialApprovalRequestRecord,
  InvoiceLineRecord,
  InvoicePersistenceUpdate,
  InvoiceRecord,
  InvoiceStatusHistoryRecord,
  PatientAccountPersistenceUpdate,
  PatientAccountRecord,
  PatientAccountStatusHistoryRecord,
  PaymentRecord,
  PriceListPersistenceUpdate,
  PriceListRecord,
  PriceListVersionRecord,
  ResolvedPriceRecord,
  ServiceRatePersistenceUpdate,
  ServiceRateRecord,
  TaxCategoryRecord,
  TreatmentPackageItemRecord,
  TreatmentPackagePersistenceUpdate,
  TreatmentPackageRecord,
} from './unified-billing.persistence.types.js';

export interface UnifiedBillingActorResolverInput {
  userId: string;
  facilityId: string;
  correlationId: string;
  permissions: ReadonlySet<PermissionKey>;
  ipAddress?: string;
  userAgent?: string;
  breakGlassReason?: string;
}

export interface UnifiedBillingActorResolverPort {
  resolve(
    input: UnifiedBillingActorResolverInput,
  ): Promise<UnifiedBillingActorContext>;
}

export interface UnifiedBillingContextRepositoryPort {
  findActorIdentity(
    userId: string,
  ): Promise<BillingActorIdentityRecord | null>;

  findStaff(
    facilityId: string,
    staffId: string,
  ): Promise<BillingStaffRecord | null>;

  findPatient(
    facilityId: string,
    patientId: string,
  ): Promise<BillingPatientRecord | null>;

  findGuarantor(
    facilityId: string,
    guarantorId: string,
  ): Promise<BillingGuarantorRecord | null>;

  listCoverage(
    facilityId: string,
    patientId: string,
    coverageIds: readonly string[],
    at: Date,
  ): Promise<BillingCoverageRecord[]>;

  resolveSourceContext(
    facilityId: string,
    sourceModule: PostSourceChargeInput['sourceModule'],
    sourceRecordId: string,
    sourceLineId: string | null,
  ): Promise<BillingSourceContextRecord | null>;
}

export interface UnifiedBillingReferenceDataPort {
  departmentExists(facilityId: string, departmentId: string): Promise<boolean>;
  locationExists(facilityId: string, locationId: string): Promise<boolean>;
  unitOfMeasureExists(facilityId: string, unitOfMeasureId: string): Promise<boolean>;
  ledgerAccountExists(facilityId: string, ledgerAccountId: string): Promise<boolean>;
  payerOrganizationExists(facilityId: string, payerOrganizationId: string): Promise<boolean>;
  panelPlanExists(
    facilityId: string,
    panelPlanId: string,
    payerOrganizationId?: string | null,
  ): Promise<boolean>;
}

export interface UnifiedBillingContextPort {
  requireActiveActorStaff(
    actor: Readonly<{
      userId: string;
      facilityId: string;
    }>,
  ): Promise<AuthoritativeBillingAccountContext['actor']>;

  resolveSource(
    actor: UnifiedBillingActorContext,
    input: Readonly<{
      sourceModule: PostSourceChargeInput['sourceModule'];
      sourceRecordId: string;
      sourceLineId?: string | null;
    }>,
  ): Promise<AuthoritativeBillingSourceContext>;

  resolveAccountCreationContext(
    actor: UnifiedBillingActorContext,
    input: CreatePatientAccountInput,
  ): Promise<AuthoritativeBillingAccountContext>;
}

export interface ChargeCatalogRepositoryPort {
  createCategory(
    input: Omit<
      ChargeCategoryRecord,
      BillingPersistenceMetadataFields | '_id'
    > &
      Readonly<{
        facilityId: string;
        createdBy: string;
        updatedBy: string;
        transactionId: string;
        correlationId: string;
      }>,
    session: BillingMongoSession,
  ): Promise<ChargeCategoryRecord>;

  findCategory(
    facilityId: string,
    categoryId: string,
    session?: BillingMongoSession,
  ): Promise<ChargeCategoryRecord | null>;

  findCategoryByCode(
    facilityId: string,
    code: string,
    session?: BillingMongoSession,
  ): Promise<ChargeCategoryRecord | null>;

  listCategories(
    facilityId: string,
    includeInactive?: boolean,
  ): Promise<ChargeCategoryView[]>;

  updateCategory(
    facilityId: string,
    categoryId: string,
    expectedVersion: number,
    update: ChargeCategoryPersistenceUpdate,
    transactionId: string,
    correlationId: string,
    session: BillingMongoSession,
  ): Promise<ChargeCategoryRecord | null>;

  createCatalogItem(
    input: Omit<
      ChargeCatalogRecord,
      BillingPersistenceMetadataFields | '_id'
    > &
      Readonly<{
        facilityId: string;
        createdBy: string;
        updatedBy: string;
        transactionId: string;
        correlationId: string;
      }>,
    session: BillingMongoSession,
  ): Promise<ChargeCatalogRecord>;

  findCatalogItem(
    facilityId: string,
    catalogItemId: string,
    options?: Readonly<{
      includeCost?: boolean;
      session?: BillingMongoSession;
    }>,
  ): Promise<ChargeCatalogRecord | null>;

  findCatalogItemByCode(
    facilityId: string,
    chargeCode: string,
    at: Date,
    options?: Readonly<{
      includeCost?: boolean;
      session?: BillingMongoSession;
    }>,
  ): Promise<ChargeCatalogRecord | null>;

  updateCatalogItem(
    facilityId: string,
    catalogItemId: string,
    expectedVersion: number,
    update: ChargeCatalogPersistenceUpdate,
    transactionId: string,
    correlationId: string,
    session: BillingMongoSession,
  ): Promise<ChargeCatalogRecord | null>;

  createCatalogVersion(
    record: Omit<
      ChargeCatalogVersionRecord,
      BillingPersistenceMetadataFields | '_id'
    > &
      Readonly<{
        facilityId: string;
        createdBy: string;
        updatedBy: string;
        transactionId: string;
        correlationId: string;
      }>,
    session: BillingMongoSession,
  ): Promise<ChargeCatalogVersionRecord>;

  findCatalogVersion(
    facilityId: string,
    catalogVersionId: string,
    session?: BillingMongoSession,
  ): Promise<ChargeCatalogVersionRecord | null>;

  createRule(
    input: Omit<
      ChargeRuleRecord,
      BillingPersistenceMetadataFields | '_id'
    > & Readonly<{
      facilityId: string;
      createdBy: string;
      updatedBy: string;
      transactionId: string;
      correlationId: string;
    }>,
    session: BillingMongoSession,
  ): Promise<ChargeRuleRecord>;

  findRule(
    facilityId: string,
    ruleId: string,
    session?: BillingMongoSession,
  ): Promise<ChargeRuleRecord | null>;

  updateRule(
    facilityId: string,
    ruleId: string,
    expectedVersion: number,
    update: ChargeRulePersistenceUpdate,
    transactionId: string,
    correlationId: string,
    session: BillingMongoSession,
  ): Promise<ChargeRuleRecord | null>;

  listRules(
    facilityId: string,
    catalogItemId: string,
    at?: Date,
  ): Promise<ChargeRuleView[]>;

  listCatalog(
    facilityId: string,
    query: UnifiedBillingCatalogListQuery,
    includeCost: boolean,
  ): Promise<BillingPage<ChargeCatalogItemView>>;
}

type BillingPersistenceMetadataFields =
  | 'facilityId'
  | 'version'
  | 'transactionId'
  | 'correlationId'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt';

export interface UnifiedBillingPricingResolutionRequest {
  facilityId: string;
  chargeCode: string;
  chargeCatalogItemId?: string;
  quantity: string;
  at: Date;
  billingContext: AuthoritativeBillingSourceContext['billingContext'];
  patientId: string;
  departmentId: string | null;
  locationId: string | null;
  patientCategoryCode?: string | null;
  payerCategoryCode?: string | null;
  payerOrganizationId?: string | null;
  panelPlanId?: string | null;
  packageEnrollmentId?: string | null;
  afterHours: boolean;
  includeCost: boolean;
}

export interface UnifiedBillingPricingPort {
  resolve(
    request: UnifiedBillingPricingResolutionRequest,
    session?: BillingMongoSession,
  ): Promise<ResolvedPriceRecord>;

  toView(
    resolved: ResolvedPriceRecord,
    includeCost: boolean,
  ): ResolvedPriceView;
}

export interface PriceListRepositoryPort {
  createTaxCategory(
    input: Omit<
      TaxCategoryRecord,
      BillingPersistenceMetadataFields | '_id'
    > & Readonly<{
      facilityId: string;
      createdBy: string;
      updatedBy: string;
      transactionId: string;
      correlationId: string;
    }>,
    session: BillingMongoSession,
  ): Promise<TaxCategoryRecord>;

  listTaxCategories(
    facilityId: string,
    includeInactive?: boolean,
  ): Promise<TaxCategoryView[]>;

  createPriceList(
    input: Omit<
      PriceListRecord,
      BillingPersistenceMetadataFields | '_id'
    > & Readonly<{
      facilityId: string;
      createdBy: string;
      updatedBy: string;
      transactionId: string;
      correlationId: string;
    }>,
    session: BillingMongoSession,
  ): Promise<PriceListRecord>;

  createPriceListVersion(
    input: Omit<
      PriceListVersionRecord,
      BillingPersistenceMetadataFields | '_id'
    > & Readonly<{
      facilityId: string;
      createdBy: string;
      updatedBy: string;
      transactionId: string;
      correlationId: string;
    }>,
    session: BillingMongoSession,
  ): Promise<PriceListVersionRecord>;

  findPriceList(
    facilityId: string,
    priceListId: string,
    session?: BillingMongoSession,
  ): Promise<PriceListRecord | null>;

  findPriceListByCode(
    facilityId: string,
    code: string,
    session?: BillingMongoSession,
  ): Promise<PriceListRecord | null>;

  findPriceListVersion(
    facilityId: string,
    priceListVersionId: string,
    session?: BillingMongoSession,
  ): Promise<PriceListVersionRecord | null>;

  updatePriceList(
    facilityId: string,
    priceListId: string,
    expectedVersion: number,
    update: PriceListPersistenceUpdate,
    transactionId: string,
    correlationId: string,
    session: BillingMongoSession,
  ): Promise<PriceListRecord | null>;

  listPriceLists(
    facilityId: string,
    includeInactive?: boolean,
  ): Promise<PriceListView[]>;

  createServiceRate(
    input: Omit<
      ServiceRateRecord,
      BillingPersistenceMetadataFields | '_id'
    > & Readonly<{
      facilityId: string;
      createdBy: string;
      updatedBy: string;
      transactionId: string;
      correlationId: string;
    }>,
    session: BillingMongoSession,
  ): Promise<ServiceRateRecord>;

  findServiceRate(
    facilityId: string,
    serviceRateId: string,
    session?: BillingMongoSession,
  ): Promise<ServiceRateRecord | null>;

  findServiceRateByCode(
    facilityId: string,
    rateCode: string,
    session?: BillingMongoSession,
  ): Promise<ServiceRateRecord | null>;

  findCurrentServiceRate(
    facilityId: string,
    chargeCatalogItemId: string,
    priceListId: string,
    at: Date,
    session?: BillingMongoSession,
  ): Promise<ServiceRateRecord | null>;

  updateServiceRate(
    facilityId: string,
    serviceRateId: string,
    expectedVersion: number,
    update: ServiceRatePersistenceUpdate,
    transactionId: string,
    correlationId: string,
    session: BillingMongoSession,
  ): Promise<ServiceRateRecord | null>;

  listEffectiveRateCandidates(
    request: UnifiedBillingPricingResolutionRequest,
    session?: BillingMongoSession,
  ): Promise<ReadonlyArray<Readonly<{
    priceList: PriceListRecord;
    serviceRate: ServiceRateRecord;
  }>>>;

  listServiceRates(
    facilityId: string,
    priceListId?: string,
  ): Promise<ServiceRateView[]>;

  findTaxCategory(
    facilityId: string,
    taxCategoryId: string,
    session?: BillingMongoSession,
  ): Promise<TaxCategoryRecord | null>;
}

export interface TreatmentPackageRepositoryPort {
  createPackage(
    input: Omit<
      TreatmentPackageRecord,
      BillingPersistenceMetadataFields | '_id'
    > & Readonly<{
      facilityId: string;
      createdBy: string;
      updatedBy: string;
      transactionId: string;
      correlationId: string;
    }>,
    session: BillingMongoSession,
  ): Promise<TreatmentPackageRecord>;

  insertItems(
    items: readonly (Omit<
      TreatmentPackageItemRecord,
      BillingPersistenceMetadataFields | '_id'
    > & Readonly<{
      facilityId: string;
      createdBy: string;
      updatedBy: string;
      transactionId: string;
      correlationId: string;
    }>)[],
    session: BillingMongoSession,
  ): Promise<TreatmentPackageItemRecord[]>;

  findPackage(
    facilityId: string,
    treatmentPackageId: string,
    session?: BillingMongoSession,
  ): Promise<TreatmentPackageRecord | null>;

  findPackageByCode(
    facilityId: string,
    packageCode: string,
    session?: BillingMongoSession,
  ): Promise<TreatmentPackageRecord | null>;

  listItems(
    facilityId: string,
    treatmentPackageId: string,
    session?: BillingMongoSession,
  ): Promise<TreatmentPackageItemRecord[]>;

  updatePackage(
    facilityId: string,
    treatmentPackageId: string,
    expectedVersion: number,
    update: TreatmentPackagePersistenceUpdate,
    transactionId: string,
    correlationId: string,
    session: BillingMongoSession,
  ): Promise<TreatmentPackageRecord | null>;

  listPackages(
    facilityId: string,
    includeInactive?: boolean,
  ): Promise<TreatmentPackageView[]>;
}

export interface PatientAccountRepositoryPort {
  create(
    input: Omit<
      PatientAccountRecord,
      BillingPersistenceMetadataFields | '_id'
    > &
      Readonly<{
        facilityId: string;
        createdBy: string;
        updatedBy: string;
        transactionId: string;
        correlationId: string;
      }>,
    session: BillingMongoSession,
  ): Promise<PatientAccountRecord>;

  findById(
    facilityId: string,
    patientAccountId: string,
    session?: BillingMongoSession,
  ): Promise<PatientAccountRecord | null>;

  findOpenForSource(
    facilityId: string,
    source: AuthoritativeBillingSourceContext,
    session?: BillingMongoSession,
  ): Promise<PatientAccountRecord | null>;

  update(
    facilityId: string,
    patientAccountId: string,
    expectedVersion: number,
    update: PatientAccountPersistenceUpdate,
    transactionId: string,
    correlationId: string,
    session: BillingMongoSession,
  ): Promise<PatientAccountRecord | null>;

  appendStatusHistory(
    input: Omit<
      PatientAccountStatusHistoryRecord,
      BillingPersistenceMetadataFields | '_id' | 'patientAccountId' | 'changedBy'
    > & Readonly<{
      facilityId: string;
      patientAccountId: string;
      changedBy: string;
      createdBy: string;
      updatedBy: string;
      transactionId: string;
      correlationId: string;
    }>,
    session: BillingMongoSession,
  ): Promise<PatientAccountStatusHistoryRecord>;

  list(
    facilityId: string,
    query: UnifiedBillingAccountListQuery,
  ): Promise<BillingPage<PatientAccountView>>;
}

export interface AccountChargeRepositoryPort {
  create(
    input: Omit<
      AccountChargeRecord,
      BillingPersistenceMetadataFields | '_id'
    > &
      Readonly<{
        facilityId: string;
        createdBy: string;
        updatedBy: string;
        transactionId: string;
        correlationId: string;
      }>,
    session: BillingMongoSession,
  ): Promise<AccountChargeRecord>;

  findById(
    facilityId: string,
    accountChargeId: string,
    session?: BillingMongoSession,
  ): Promise<AccountChargeRecord | null>;

  findByOperationKey(
    facilityId: string,
    operationKey: string,
    session?: BillingMongoSession,
  ): Promise<AccountChargeRecord | null>;

  findByDeterministicKey(
    facilityId: string,
    deterministicChargeKey: string,
    session?: BillingMongoSession,
  ): Promise<AccountChargeRecord | null>;

  update(
    facilityId: string,
    accountChargeId: string,
    expectedVersion: number,
    update: AccountChargePersistenceUpdate,
    transactionId: string,
    correlationId: string,
    session: BillingMongoSession,
  ): Promise<AccountChargeRecord | null>;

  appendHistory(
    input: Omit<
      AccountChargeHistoryRecord,
      BillingPersistenceMetadataFields | '_id' | 'accountChargeId' | 'changedBy'
    > & Readonly<{
      facilityId: string;
      accountChargeId: string;
      originalChargeId: string | null;
      replacementChargeId: string | null;
      approvalRequestId: string | null;
      changedBy: string;
      createdBy: string;
      updatedBy: string;
      transactionId: string;
      correlationId: string;
    }>,
    session: BillingMongoSession,
  ): Promise<AccountChargeHistoryRecord>;

  listRecordsForAccount(
    facilityId: string,
    patientAccountId: string,
    session?: BillingMongoSession,
  ): Promise<AccountChargeRecord[]>;

  listPostedUninvoiced(
    facilityId: string,
    patientAccountId: string,
    chargeIds: readonly string[] | undefined,
    session?: BillingMongoSession,
  ): Promise<AccountChargeRecord[]>;

  list(
    facilityId: string,
    query: UnifiedBillingChargeListQuery,
    includeCost: boolean,
  ): Promise<BillingPage<AccountChargeView>>;
}

export interface InvoiceRepositoryPort {
  create(
    input: Omit<
      InvoiceRecord,
      BillingPersistenceMetadataFields | '_id'
    > &
      Readonly<{
        facilityId: string;
        createdBy: string;
        updatedBy: string;
        transactionId: string;
        correlationId: string;
      }>,
    session: BillingMongoSession,
  ): Promise<InvoiceRecord>;

  insertLines(
    records: readonly Omit<InvoiceLineRecord, '_id'>[],
    session: BillingMongoSession,
  ): Promise<InvoiceLineRecord[]>;

  findById(
    facilityId: string,
    invoiceId: string,
    session?: BillingMongoSession,
  ): Promise<InvoiceRecord | null>;

  listLines(
    facilityId: string,
    invoiceId: string,
    session?: BillingMongoSession,
  ): Promise<InvoiceLineRecord[]>;

  update(
    facilityId: string,
    invoiceId: string,
    expectedVersion: number,
    update: InvoicePersistenceUpdate,
    transactionId: string,
    correlationId: string,
    session: BillingMongoSession,
  ): Promise<InvoiceRecord | null>;

  findLineByAccountCharge(
    facilityId: string,
    accountChargeId: string,
    session?: BillingMongoSession,
  ): Promise<InvoiceLineRecord | null>;

  appendStatusHistory(
    input: Omit<
      InvoiceStatusHistoryRecord,
      BillingPersistenceMetadataFields | '_id' | 'invoiceId' | 'changedBy'
    > & Readonly<{
      facilityId: string;
      invoiceId: string;
      originalInvoiceId: string | null;
      replacementInvoiceId: string | null;
      changedBy: string;
      createdBy: string;
      updatedBy: string;
      transactionId: string;
      correlationId: string;
    }>,
    session: BillingMongoSession,
  ): Promise<InvoiceStatusHistoryRecord>;

  listRecordsForAccount(
    facilityId: string,
    patientAccountId: string,
    session?: BillingMongoSession,
  ): Promise<InvoiceRecord[]>;

  list(
    facilityId: string,
    query: UnifiedBillingInvoiceListQuery,
  ): Promise<BillingPage<InvoiceView>>;
}

export interface FinancialApprovalRepositoryPort {
  create(
    input: Omit<
      FinancialApprovalRequestRecord,
      BillingPersistenceMetadataFields | '_id'
    > &
      Readonly<{
        facilityId: string;
        createdBy: string;
        updatedBy: string;
        transactionId: string;
        correlationId: string;
      }>,
    session: BillingMongoSession,
  ): Promise<FinancialApprovalRequestRecord>;

  findById(
    facilityId: string,
    approvalRequestId: string,
    session?: BillingMongoSession,
  ): Promise<FinancialApprovalRequestRecord | null>;

  updateDecision(
    facilityId: string,
    approvalRequestId: string,
    expectedVersion: number,
    decision: Readonly<{
      status: 'APPROVED' | 'REJECTED';
      decidedBy: string;
      decidedAt: Date;
      decisionReason: string;
      updatedBy: string;
    }>,
    transactionId: string,
    correlationId: string,
    session: BillingMongoSession,
  ): Promise<FinancialApprovalRequestRecord | null>;

  listPending(
    facilityId: string,
    limit: number,
  ): Promise<FinancialApprovalView[]>;
}

export interface PaymentRepositoryPort {
  create(
    input: Omit<
      PaymentRecord,
      BillingPersistenceMetadataFields | '_id'
    > &
      Readonly<{
        facilityId: string;
        createdBy: string;
        updatedBy: string;
        transactionId: string;
        correlationId: string;
      }>,
    session: BillingMongoSession,
  ): Promise<PaymentRecord>;

  findById(
    facilityId: string,
    paymentId: string,
    session?: BillingMongoSession,
  ): Promise<PaymentRecord | null>;

  findByOperationKey(
    facilityId: string,
    operationKey: string,
    session?: BillingMongoSession,
  ): Promise<PaymentRecord | null>;

  listForAccount(
    facilityId: string,
    patientAccountId: string,
  ): Promise<PaymentView[]>;
}

export interface UnifiedBillingPostingResult {
  patientAccountId: string;
  chargeIds: readonly string[];
  replayed: boolean;
}

export interface UnifiedBillingChargePostingPort {
  postCharge(
    actor: UnifiedBillingActorContext,
    operationKey: string,
    input: PostSourceChargeInput,
    session?: ClientSession,
  ): Promise<UnifiedBillingPostingResult>;

  postChargeBatch(
    actor: UnifiedBillingActorContext,
    input: PostChargeBatchInput,
    session?: ClientSession,
  ): Promise<UnifiedBillingPostingResult>;

  reverseSourceCharges(
    actor: UnifiedBillingActorContext,
    operationKey: string,
    sourceModule: PostSourceChargeInput['sourceModule'],
    sourceRecordId: string,
    reason: string,
    session?: ClientSession,
  ): Promise<UnifiedBillingPostingResult>;
}

export interface LegacyPharmacyBillingChargeInput {
  facilityId: string;
  patientId: string;
  encounterId: string | null;
  admissionId: string | null;
  dispensationId: string;
  dispensationItemId: string;
  quantity: string;
  unitPrice: string;
  grossAmount: string;
  discountAmount: string;
  taxAmount: string;
  netAmount: string;
  currency: string;
  pricingSource: string;
}

export interface LegacyPharmacyBillingCompatibilityPort {
  createDispensingCharges(
    operationKey: string,
    charges: readonly LegacyPharmacyBillingChargeInput[],
    session: ClientSession,
  ): Promise<Readonly<{ billingRecordId: string }>>;

  reverseDispensingCharges(
    operationKey: string,
    dispensationId: string,
    reason: string,
    session: ClientSession,
  ): Promise<Readonly<{ billingRecordId: string }>>;
}

export interface UnifiedBillingTransactionCompensation {
  key: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface UnifiedBillingTransactionContext {
  transactionId: string;
  idempotencyKey: string;
  session: BillingMongoSession;
  checkpoint(
    state: string,
    data?: Record<string, unknown>,
  ): Promise<void>;
  registerCompensation(
    compensation: UnifiedBillingTransactionCompensation,
  ): Promise<void>;
}

export interface UnifiedBillingTransactionRequest<T> {
  transactionType: string;
  idempotencyKey: string;
  actorUserId: string;
  facilityId: string;
  correlationId: string;
  lockKeys: string[];
  idempotencyPayload: unknown;
  journalPayload: Record<string, unknown>;
  execute(
    context: UnifiedBillingTransactionContext,
  ): Promise<T>;
}

export interface UnifiedBillingTransactionManagerPort {
  execute<T>(
    request: UnifiedBillingTransactionRequest<T>,
  ): Promise<T>;
}

export interface UnifiedBillingAuditEntry {
  transactionId: string;
  deduplicationKey: string;
  action: string;
  entityType: string;
  entityId: string;
  actorUserId: string;
  actorStaffId: string;
  facilityId: string;
  correlationId: string;
  ipAddress?: string;
  userAgent?: string;
  occurredAt: Date;
  reason?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

export interface UnifiedBillingAuditPort {
  append(
    entry: UnifiedBillingAuditEntry,
    session?: BillingMongoSession,
  ): Promise<void>;
}

export interface UnifiedBillingOutboxMessage {
  transactionId: string;
  deduplicationKey: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  actorUserId: string;
  facilityId: string;
  correlationId: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
}

export interface UnifiedBillingOutboxPort {
  enqueue(
    message: UnifiedBillingOutboxMessage,
    session?: BillingMongoSession,
  ): Promise<void>;
}

export interface UnifiedBillingRealtimeMessage {
  eventType: string;
  facilityId: string;
  patientAccountId?: string;
  payload: Record<string, unknown>;
}

export interface UnifiedBillingRealtimePort {
  publish(
    message: UnifiedBillingRealtimeMessage,
  ): Promise<void>;
}

export interface UnifiedBillingClockPort {
  now(): Date;
}

export interface UnifiedBillingSequenceAllocation {
  key: string;
  value: number;
}

export interface UnifiedBillingSequencePort {
  next(
    facilityId: string,
    key: string,
  ): Promise<UnifiedBillingSequenceAllocation>;
}

export type UnifiedBillingAccessAction =
  | 'CATALOG_READ'
  | 'CATALOG_MANAGE'
  | 'CATALOG_COST_READ'
  | 'PRICING_READ'
  | 'PRICING_MANAGE'
  | 'PACKAGE_READ'
  | 'PACKAGE_MANAGE'
  | 'ACCOUNT_READ'
  | 'ACCOUNT_CREATE'
  | 'ACCOUNT_MANAGE'
  | 'ACCOUNT_SUSPEND'
  | 'ACCOUNT_FINALIZE'
  | 'CHARGE_READ'
  | 'CHARGE_CREATE'
  | 'CHARGE_POST'
  | 'CHARGE_CANCEL'
  | 'CHARGE_REVERSE'
  | 'CHARGE_ADJUST'
  | 'CHARGE_WRITE_OFF'
  | 'CHARGE_TRANSFER'
  | 'CHARGE_MANUAL'
  | 'INVOICE_READ'
  | 'INVOICE_CREATE'
  | 'INVOICE_FINALIZE'
  | 'INVOICE_CANCEL'
  | 'INVOICE_CORRECT'
  | 'INVOICE_PRINT'
  | 'DISCOUNT_REQUEST'
  | 'DISCOUNT_APPROVE'
  | 'PRICE_OVERRIDE_REQUEST'
  | 'PRICE_OVERRIDE_APPROVE'
  | 'PAYMENT_READ'
  | 'PAYMENT_RECEIVE'
  | 'PAYMENT_ALLOCATE'
  | 'PAYMENT_REVERSE'
  | 'REFUND_REQUEST'
  | 'REFUND_APPROVE'
  | 'REFUND_PROCESS'
  | 'CREDIT_NOTE_CREATE'
  | 'CREDIT_NOTE_POST'
  | 'DEBIT_NOTE_CREATE'
  | 'DEBIT_NOTE_POST'
  | 'FINANCIAL_DISCHARGE'
  | 'REPORT_READ'
  | 'REPORT_EXPORT'
  | 'REPORT_COST_MARGIN';

export interface UnifiedBillingAccessRequest {
  actor: UnifiedBillingActorContext;
  action: UnifiedBillingAccessAction;
  patientAccount?: PatientAccountRecord;
  accountCharge?: AccountChargeRecord;
  invoice?: InvoiceRecord;
  payment?: PaymentRecord;
  requesterUserId?: string | null;
  includeCost?: boolean;
}

export interface UnifiedBillingAccessDecision {
  allowed: boolean;
  accessMode:
    | 'BILLING_OPERATIONAL'
    | 'BILLING_MANAGER'
    | 'CASHIER'
    | 'CLAIMS_OPERATIONAL'
    | 'FACILITY_ADMINISTRATOR'
    | 'BREAK_GLASS'
    | 'DENIED';
  includeCost: boolean;
  minimumNecessaryFields: readonly string[];
  auditSensitiveRead: boolean;
  requiresIndependentApproval: boolean;
  denialReason?: string;
}

export interface UnifiedBillingAccessPolicyPort {
  authorize(
    request: UnifiedBillingAccessRequest,
  ): Promise<UnifiedBillingAccessDecision>;
}