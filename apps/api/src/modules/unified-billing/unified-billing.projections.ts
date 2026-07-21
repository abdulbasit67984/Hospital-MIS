import {
  decimal128ToString,
} from '@hospital-mis/database';

import type {
  AccountChargeView,
  BillingPayerSnapshot,
  ChargeCatalogItemView,
  ChargeCategoryView,
  ChargeRuleView,
  FinancialApprovalView,
  InvoiceLineView,
  InvoiceView,
  MoneyBreakdownView,
  PatientAccountView,
  PaymentView,
  PriceListView,
  ResolvedPriceView,
  ServiceRateView,
  TaxCategoryView,
  TreatmentPackageView,
} from './unified-billing.contracts.js';

import type {
  AccountChargeRecord,
  BillingMoneyRecord,
  BillingPayerSnapshotRecord,
  ChargeCatalogRecord,
  ChargeCategoryRecord,
  ChargeRuleRecord,
  FinancialApprovalRequestRecord,
  InvoiceLineRecord,
  InvoiceRecord,
  PatientAccountRecord,
  PaymentRecord,
  PriceListRecord,
  ResolvedPriceRecord,
  ServiceRateRecord,
  TaxCategoryRecord,
  TreatmentPackageItemRecord,
  TreatmentPackageRecord,
} from './unified-billing.persistence.types.js';

function objectId(
  value: Readonly<{
    toHexString(): string;
  }>,
): string {
  return value.toHexString();
}

function nullableObjectId(
  value:
    | Readonly<{
        toHexString(): string;
      }>
    | null,
): string | null {
  return value?.toHexString() ?? null;
}

function decimal(
  value: Parameters<typeof decimal128ToString>[0],
): string {
  return decimal128ToString(value);
}

function nullableDecimal(
  value: Parameters<typeof decimal128ToString>[0] | null,
): string | null {
  return value === null
    ? null
    : decimal128ToString(value);
}

function iso(value: Date): string {
  return value.toISOString();
}

function nullableIso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

export function projectMoneyBreakdown(
  record: BillingMoneyRecord,
): MoneyBreakdownView {
  return {
    grossAmount: decimal(record.grossAmount),
    discountAmount: decimal(record.discountAmount),
    welfareAmount: decimal(record.welfareAmount),
    panelAmount: decimal(record.payerAmount),
    taxAmount: decimal(record.taxAmount),
    patientResponsibility: decimal(record.patientAmount),
    payerResponsibility: decimal(record.payerAmount),
    netAmount: decimal(record.netAmount),
    currency: 'PKR',
  };
}

export function projectBillingPayerSnapshot(
  record: BillingPayerSnapshotRecord,
): BillingPayerSnapshot {
  return {
    sequence: record.sequence,
    payerOrganizationId: objectId(record.payerOrganizationId),
    panelPlanId: nullableObjectId(record.panelPlanId),
    patientCoverageId: nullableObjectId(record.patientCoverageId),
    payerName: record.payerNameSnapshot,
    planName: record.planNameSnapshot,
    membershipNumber: record.membershipNumberSnapshot,
    authorizationReference: record.authorizationReference,
    coverageLimit: nullableDecimal(record.coverageLimitSnapshot),
    copay: decimal(record.copaySnapshot),
    coinsurancePercentage: decimal(
      record.coinsurancePercentageSnapshot,
    ),
    deductible: decimal(record.deductibleSnapshot),
    coverageEffectiveFrom: nullableIso(record.coverageEffectiveFrom),
    coverageEffectiveThrough: nullableIso(record.coverageEffectiveThrough),
  };
}

export function projectChargeCategory(
  record: ChargeCategoryRecord,
): ChargeCategoryView {
  return {
    id: objectId(record._id),
    code: record.code,
    parentCategoryId: nullableObjectId(record.parentCategoryId),
    name: record.name,
    description: record.description,
    clinical: record.clinical,
    departmentId: nullableObjectId(record.departmentId),
    serviceLineCode: record.serviceLineCode,
    revenueAccountCode: record.revenueAccountCode,
    status: record.status,
    version: record.version,
    createdAt: iso(record.createdAt),
    updatedAt: iso(record.updatedAt),
  };
}

export function projectChargeRule(
  record: ChargeRuleRecord,
): ChargeRuleView {
  return {
    id: objectId(record._id),
    ruleCode: record.ruleCode,
    chargeCatalogItemId: objectId(record.chargeCatalogItemId),
    ruleType: record.ruleType,
    relatedChargeCatalogItemId: nullableObjectId(record.relatedChargeCatalogItemId),
    thresholdQuantity: nullableDecimal(record.thresholdQuantity),
    thresholdAmount: nullableDecimal(record.thresholdAmount),
    effectiveFrom: iso(record.effectiveFrom),
    effectiveThrough: nullableIso(record.effectiveThrough),
    active: record.active,
    reason: record.reason,
    version: record.version,
    createdAt: iso(record.createdAt),
    updatedAt: iso(record.updatedAt),
  };
}

export function projectChargeCatalogItem(
  record: ChargeCatalogRecord,
  includeCost: boolean,
): ChargeCatalogItemView {
  return {
    id: objectId(record._id),
    chargeCode: record.chargeCode,
    serviceCode: record.serviceCode,
    name: record.name,
    description: record.description,
    categoryId: objectId(record.categoryId),
    chargeType: record.chargeType,
    clinical: record.clinical,
    departmentId: nullableObjectId(record.departmentId),
    serviceLineCode: record.serviceLineCode,
    revenueAccountCode: record.revenueAccountCode,
    ledgerAccountId: nullableObjectId(record.ledgerAccountId),
    taxCategoryId: nullableObjectId(record.taxCategoryId),
    unitOfMeasureId: nullableObjectId(record.unitOfMeasureId),
    defaultQuantity: decimal(record.defaultQuantity),
    minimumQuantity: nullableDecimal(record.minimumQuantity),
    maximumQuantity: nullableDecimal(record.maximumQuantity),
    minimumPrice: nullableDecimal(record.minimumPrice),
    maximumPrice: nullableDecimal(record.maximumPrice),
    ...(includeCost
      ? {
          costAmount: decimal(record.costAmount),
        }
      : {}),
    manualPostingAllowed: record.manualPostingAllowed,
    recurringChargeAllowed: record.recurringChargeAllowed,
    timeBasedCharge: record.timeBasedCharge,
    effectiveFrom: iso(record.effectiveFrom),
    effectiveThrough: nullableIso(record.effectiveThrough),
    status: record.status,
    currentVersion: record.currentVersion,
    version: record.version,
    createdAt: iso(record.createdAt),
    updatedAt: iso(record.updatedAt),
  };
}

export function projectTaxCategory(
  record: TaxCategoryRecord,
): TaxCategoryView {
  return {
    id: objectId(record._id),
    code: record.code,
    name: record.name,
    calculationMode: record.calculationMode,
    ratePercentage: decimal(record.ratePercentage),
    roundingMode: record.roundingMode,
    roundingScale: record.roundingScale,
    exemptionReasonRequired: record.exemptionReasonRequired,
    effectiveFrom: iso(record.effectiveFrom),
    effectiveThrough: nullableIso(record.effectiveThrough),
    active: record.active,
    version: record.version,
  };
}

export function projectPriceList(
  record: PriceListRecord,
): PriceListView {
  return {
    id: objectId(record._id),
    code: record.code,
    name: record.name,
    description: record.description,
    priceListType: record.priceListType,
    patientCategoryCode: record.patientCategoryCode,
    payerCategoryCode: record.payerCategoryCode,
    payerOrganizationId: nullableObjectId(record.payerOrganizationId),
    panelPlanId: nullableObjectId(record.panelPlanId),
    departmentId: nullableObjectId(record.departmentId),
    locationId: nullableObjectId(record.locationId),
    billingContext: record.billingContext,
    afterHoursOnly: record.afterHoursOnly,
    effectiveFrom: iso(record.effectiveFrom),
    effectiveThrough: nullableIso(record.effectiveThrough),
    status: record.status,
    priority: record.priority,
    currentVersion: record.currentVersion,
    version: record.version,
    createdAt: iso(record.createdAt),
    updatedAt: iso(record.updatedAt),
  };
}

export function projectServiceRate(
  record: ServiceRateRecord,
): ServiceRateView {
  return {
    id: objectId(record._id),
    rateCode: record.rateCode,
    chargeCatalogItemId: objectId(record.chargeCatalogItemId),
    chargeCatalogVersionId: objectId(record.chargeCatalogVersionId),
    priceListId: objectId(record.priceListId),
    priceListVersionId: objectId(record.priceListVersionId),
    amount: decimal(record.amount),
    minimumAmount: nullableDecimal(record.minimumAmount),
    maximumAmount: nullableDecimal(record.maximumAmount),
    taxCategoryId: nullableObjectId(record.taxCategoryId),
    billingContext: record.billingContext,
    patientCategoryCode: record.patientCategoryCode,
    payerCategoryCode: record.payerCategoryCode,
    payerOrganizationId: nullableObjectId(record.payerOrganizationId),
    panelPlanId: nullableObjectId(record.panelPlanId),
    departmentId: nullableObjectId(record.departmentId),
    locationId: nullableObjectId(record.locationId),
    contractReference: record.contractReference,
    afterHoursOnly: record.afterHoursOnly,
    effectiveFrom: iso(record.effectiveFrom),
    effectiveThrough: nullableIso(record.effectiveThrough),
    status: record.status,
    supersedesRateId: nullableObjectId(record.supersedesRateId),
    changeReason: record.changeReason,
    version: record.version,
    createdAt: iso(record.createdAt),
    updatedAt: iso(record.updatedAt),
  };
}

export function projectTreatmentPackage(
  record: TreatmentPackageRecord,
  items: readonly TreatmentPackageItemRecord[],
): TreatmentPackageView {
  return {
    id: objectId(record._id),
    packageCode: record.packageCode,
    name: record.name,
    description: record.description,
    priceListId: objectId(record.priceListId),
    packageType: record.packageType,
    fixedPrice: decimal(record.fixedPrice),
    validityDays: record.validityDays,
    payerOrganizationId: nullableObjectId(record.payerOrganizationId),
    panelPlanId: nullableObjectId(record.panelPlanId),
    patientCategoryCode: record.patientCategoryCode,
    billingContext: record.billingContext,
    effectiveFrom: iso(record.effectiveFrom),
    effectiveThrough: nullableIso(record.effectiveThrough),
    status: record.status,
    items: items
      .slice()
      .sort((left, right) => left.lineNumber - right.lineNumber)
      .map((item) => ({
        id: objectId(item._id),
        lineNumber: item.lineNumber,
        chargeCatalogItemId: objectId(item.chargeCatalogItemId),
        includedQuantity: decimal(item.includedQuantity),
        overageAllowed: item.overageAllowed,
        overageRateId: nullableObjectId(item.overageRateId),
        allocationAmount: decimal(item.allocationAmount),
        requiredComponent: item.requiredComponent,
        active: item.active,
      })),
    version: record.version,
    createdAt: iso(record.createdAt),
    updatedAt: iso(record.updatedAt),
  };
}

export function projectResolvedPrice(
  record: ResolvedPriceRecord,
  includeCost: boolean,
): ResolvedPriceView {
  return {
    chargeCatalogItemId: objectId(record.catalog._id),
    chargeCatalogVersionId: objectId(record.catalogVersion._id),
    chargeCode: record.catalog.chargeCode,
    serviceCode: record.catalog.serviceCode,
    chargeName: record.catalog.name,
    categoryCode: record.category.code,
    chargeType: record.catalog.chargeType,
    serviceRateId: objectId(record.serviceRate._id),
    priceListId: objectId(record.priceList._id),
    priceListVersionId: objectId(record.serviceRate.priceListVersionId),
    priceListCode: record.priceList.code,
    originalUnitPrice: decimal(record.originalUnitPrice),
    authoritativeUnitPrice: decimal(record.authoritativeUnitPrice),
    minimumAmount: nullableDecimal(record.serviceRate.minimumAmount),
    maximumAmount: nullableDecimal(record.serviceRate.maximumAmount),
    quantity: decimal(record.quantity),
    taxCategoryId: record.taxCategory === null
      ? null
      : objectId(record.taxCategory._id),
    taxCategoryCode: record.taxCategory?.code ?? null,
    taxMode: record.taxCategory?.calculationMode ?? 'EXEMPT',
    taxRatePercentage: record.taxCategory === null
      ? '0'
      : decimal(record.taxCategory.ratePercentage),
    currency: 'PKR',
    ...(includeCost
      ? {
          costAmount: decimal(record.catalog.costAmount),
        }
      : {}),
    resolutionReason: record.resolutionReason,
  };
}

export function projectPatientAccount(
  record: PatientAccountRecord,
): PatientAccountView {
  return {
    id: objectId(record._id),
    accountNumber: record.accountNumber,
    patientId: objectId(record.patientId),
    accountType: record.accountType,
    billingContext: record.billingContext,
    registrationId: nullableObjectId(record.registrationId),
    opdVisitId: nullableObjectId(record.opdVisitId),
    encounterId: nullableObjectId(record.encounterId),
    admissionId: nullableObjectId(record.admissionId),
    emergencyVisitId: nullableObjectId(record.emergencyVisitId),
    responsiblePartyType: record.responsiblePartyType,
    guarantorId: nullableObjectId(record.guarantorId),
    payerSnapshots: record.payerSnapshots.map(
      projectBillingPayerSnapshot,
    ),
    currency: 'PKR',
    grossCharges: decimal(record.grossCharges),
    discountTotal: decimal(record.discountTotal),
    taxTotal: decimal(record.taxTotal),
    welfareTotal: decimal(record.welfareTotal),
    payerResponsibilityTotal: decimal(record.payerResponsibilityTotal),
    patientResponsibilityTotal: decimal(record.patientResponsibilityTotal),
    paymentsAppliedTotal: decimal(record.paymentsAppliedTotal),
    creditsTotal: decimal(record.creditsTotal),
    writeOffTotal: decimal(record.writeOffTotal),
    outstandingBalance: decimal(record.outstandingBalance),
    refundableBalance: decimal(record.refundableBalance),
    status: record.status,
    lockedAt: nullableIso(record.lockedAt),
    finalizedAt: nullableIso(record.finalizedAt),
    version: record.version,
    createdAt: iso(record.createdAt),
    updatedAt: iso(record.updatedAt),
  };
}

export function projectAccountCharge(
  record: AccountChargeRecord,
  includeCost: boolean,
): AccountChargeView {
  return {
    ...projectMoneyBreakdown(record),
    id: objectId(record._id),
    operationKey: record.operationKey,
    deterministicChargeKey: record.deterministicChargeKey,
    patientAccountId: objectId(record.patientAccountId),
    patientId: objectId(record.patientId),
    sourceModule: record.source.sourceModule,
    sourceRecordType: record.source.sourceRecordType,
    sourceRecordId: objectId(record.source.sourceRecordId),
    sourceLineId: nullableObjectId(record.source.sourceLineId),
    chargeCatalogItemId: objectId(record.chargeCatalogItemId),
    chargeCatalogVersionId: objectId(record.chargeCatalogVersionId),
    serviceRateId: objectId(record.serviceRateId),
    priceListId: objectId(record.priceListId),
    chargeCode: record.chargeCodeSnapshot,
    serviceCode: record.serviceCodeSnapshot,
    chargeName: record.chargeNameSnapshot,
    categoryCode: record.categoryCodeSnapshot,
    departmentId: nullableObjectId(record.departmentId),
    quantity: decimal(record.quantity),
    originalUnitPrice: decimal(record.originalUnitPrice),
    authoritativeUnitPrice: decimal(record.authoritativeUnitPrice),
    ...(includeCost
      ? {
          costAmount: decimal(record.costAmountSnapshot),
        }
      : {}),
    status: record.status,
    packageEnrollmentId: nullableObjectId(record.packageEnrollmentId),
    originalChargeId: nullableObjectId(record.originalChargeId),
    replacementChargeId: nullableObjectId(record.replacementChargeId),
    serviceFrom: iso(record.serviceFrom),
    serviceThrough: nullableIso(record.serviceThrough),
    postedAt: nullableIso(record.postedAt),
    version: record.version,
    createdAt: iso(record.createdAt),
    updatedAt: iso(record.updatedAt),
  };
}

export function projectInvoiceLine(
  record: InvoiceLineRecord,
): InvoiceLineView {
  return {
    ...projectMoneyBreakdown(record),
    id: objectId(record._id),
    invoiceId: objectId(record.invoiceId),
    lineNumber: record.lineNumber,
    accountChargeId: objectId(record.accountChargeId),
    chargeCode: record.chargeCodeSnapshot,
    serviceCode: record.serviceCodeSnapshot,
    chargeName: record.chargeNameSnapshot,
    sourceModule: record.sourceModuleSnapshot,
    sourceRecordId: objectId(record.sourceRecordId),
    quantity: decimal(record.quantity),
    originalUnitPrice: decimal(record.originalRate),
    authoritativeUnitPrice: decimal(record.authoritativeRate),
    departmentId: nullableObjectId(record.departmentId),
  };
}

export function projectInvoice(
  record: InvoiceRecord,
  lines: readonly InvoiceLineRecord[],
): InvoiceView {
  const moneyRecord = {
    grossAmount: record.grossAmount,
    discountAmount: record.discountAmount,
    welfareAmount: record.welfareAmount,
    payerAmount: record.payerAmount,
    taxAmount: record.taxAmount,
    patientAmount: record.patientAmount,
    netAmount: record.netAmount,
    currency: record.currency,
  };
  return {
    ...projectMoneyBreakdown(moneyRecord),
    id: objectId(record._id),
    invoiceNumber: record.invoiceNumber,
    patientAccountId: objectId(record.patientAccountId),
    patientId: objectId(record.patientId),
    invoiceType: record.invoiceType,
    invoiceDate: iso(record.issuedAt ?? record.createdAt),
    dueDate: null,
    status: record.status,
    paidAmount: decimal(record.paymentsAppliedAmount),
    creditAmount: decimal(record.creditsAppliedAmount),
    outstandingBalance: decimal(record.outstandingAmount),
    refundableBalance: decimal(record.refundableAmount),
    finalizedAt: nullableIso(record.finalizedAt),
    cancelledAt: nullableIso(record.cancelledAt),
    replacementInvoiceId: nullableObjectId(record.replacementInvoiceId),
    lines: lines.map(projectInvoiceLine),
    version: record.version,
    createdAt: iso(record.createdAt),
    updatedAt: iso(record.updatedAt),
  };
}

export function projectFinancialApproval(
  record: FinancialApprovalRequestRecord,
): FinancialApprovalView {
  return {
    id: objectId(record._id),
    approvalType: record.approvalType,
    patientAccountId: nullableObjectId(record.patientAccountId),
    accountChargeId: nullableObjectId(record.accountChargeId),
    invoiceId: nullableObjectId(record.invoiceId),
    paymentId: nullableObjectId(record.paymentId),
    requestedAmount: nullableDecimal(record.requestedAmount),
    requestedPercentage: nullableDecimal(record.requestedPercentage),
    reason: record.reason,
    status: record.status,
    requestedBy: objectId(record.requestedBy),
    requestedAt: iso(record.requestedAt),
    decidedBy: nullableObjectId(record.decidedBy),
    decidedAt: nullableIso(record.decidedAt),
    decisionReason: record.decisionReason,
    expiresAt: nullableIso(record.expiresAt),
    version: record.version,
  };
}

export function projectPayment(
  record: PaymentRecord,
): PaymentView {
  return {
    id: objectId(record._id),
    paymentNumber: record.paymentNumber,
    receiptNumber: record.receiptNumber,
    patientAccountId: objectId(record.patientAccountId),
    invoiceId: nullableObjectId(record.invoiceId),
    paymentIntentId: nullableObjectId(record.paymentIntentId),
    paymentMethod: record.paymentMethod,
    amount: decimal(record.amount),
    allocatedAmount: decimal(record.allocatedAmount),
    unallocatedAmount: decimal(record.unallocatedAmount),
    refundedAmount: decimal(record.refundedAmount),
    currency: 'PKR',
    externalReference: record.externalReference,
    status: record.status,
    receivedAt: iso(record.receivedAt),
    cashierStaffId: nullableObjectId(record.cashierStaffId),
    cashShiftId: nullableObjectId(record.cashShiftId),
    counterId: nullableObjectId(record.counterId),
    version: record.version,
    createdAt: iso(record.createdAt),
    updatedAt: iso(record.updatedAt),
  };
}