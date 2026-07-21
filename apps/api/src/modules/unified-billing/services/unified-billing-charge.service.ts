import {
  createHash,
} from 'node:crypto';

import Decimal from 'decimal.js';

import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  AccountChargeView,
  AuthoritativeBillingSourceContext,
  PostChargeBatchInput,
  PostManualChargeInput,
  PostSourceChargeInput,
  UnifiedBillingActorContext,
  UnifiedBillingChargeListQuery,
  UnifiedChargePostingResultView,
} from '../unified-billing.contracts.js';

import {
  BILLING_CURRENCY,
  DEFAULT_BILLING_NUMBER_WIDTH,
  UNIFIED_BILLING_EVENT_TYPES,
  UNIFIED_BILLING_LOCK_NAMESPACE,
  UNIFIED_BILLING_NUMBER_SEQUENCE_NAMESPACE,
  UNIFIED_BILLING_REALTIME_EVENTS,
  UNIFIED_BILLING_TRANSACTION_TYPES,
} from '../unified-billing.constants.js';

import {
  BillingAccessDeniedError,
  BillingAccountLockedError,
  BillingChargeCatalogItemNotFoundError,
  BillingChargeRuleViolationError,
  BillingDuplicateChargeError,
  BillingPatientAccountConcurrencyError,
  BillingPatientAccountNotFoundError,
} from '../unified-billing.errors.js';

import type {
  AccountChargeRepositoryPort,
  ChargeCatalogRepositoryPort,
  PatientAccountRepositoryPort,
  UnifiedBillingAccessPolicyPort,
  UnifiedBillingAuditPort,
  UnifiedBillingChargePostingPort,
  UnifiedBillingClockPort,
  UnifiedBillingContextPort,
  UnifiedBillingOutboxPort,
  UnifiedBillingPricingPort,
  UnifiedBillingRealtimePort,
  UnifiedBillingSequencePort,
  UnifiedBillingTransactionManagerPort,
  UnifiedBillingPostingResult,
} from '../unified-billing.ports.js';

import type {
  AccountChargeRecord,
  BillingMongoSession,
  PatientAccountRecord,
  ResolvedPriceRecord,
} from '../unified-billing.persistence.types.js';

import {
  projectAccountCharge,
  projectPatientAccount,
} from '../unified-billing.projections.js';

import {
  billingDecimal128,
  decimal128ToDecimal,
  normalizeBillingCode,
  normalizeBillingText,
  nullableBillingObjectId,
  unifiedBillingLockKey,
} from '../unified-billing.normalization.js';

export interface UnifiedBillingChargeCommandContext {
  actor: UnifiedBillingActorContext;
  idempotencyKey: string;
}

export interface UnifiedBillingChargeServiceDependencies {
  accounts: PatientAccountRepositoryPort;
  charges: AccountChargeRepositoryPort;
  catalog: ChargeCatalogRepositoryPort;
  pricing: UnifiedBillingPricingPort;
  context: UnifiedBillingContextPort;
  accessPolicy: UnifiedBillingAccessPolicyPort;
  transactionManager: UnifiedBillingTransactionManagerPort;
  sequence: UnifiedBillingSequencePort;
  audit: UnifiedBillingAuditPort;
  outbox: UnifiedBillingOutboxPort;
  realtime: UnifiedBillingRealtimePort;
  clock: UnifiedBillingClockPort;
}

function requireAllowed(
  decision: Awaited<ReturnType<UnifiedBillingAccessPolicyPort['authorize']>>,
): void {
  if (!decision.allowed) {
    throw new BillingAccessDeniedError(decision.denialReason);
  }
}

function formatAccountNumber(year: number, value: number): string {
  return `ACC-${year}-${String(value).padStart(DEFAULT_BILLING_NUMBER_WIDTH, '0')}`;
}

export function deriveBillingDeterministicChargeKey(
  source: AuthoritativeBillingSourceContext,
  chargeCode: string,
  packageEnrollmentId: string | null,
): string {
  return createHash('sha256')
    .update([
      source.facilityId,
      source.sourceModule,
      source.sourceRecordId,
      source.sourceLineId ?? '-',
      normalizeBillingCode(chargeCode),
      packageEnrollmentId ?? '-',
    ].join('|'))
    .digest('hex');
}

function rounded(value: Decimal, scale: number): Decimal {
  return value.toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
}

export function calculateAuthoritativeChargeMoney(
  resolved: ResolvedPriceRecord,
  payer: PatientAccountRecord['payerSnapshots'][number] | undefined,
): Readonly<{
  originalUnitPrice: Decimal;
  authoritativeUnitPrice: Decimal;
  grossAmount: Decimal;
  taxAmount: Decimal;
  netAmount: Decimal;
  payerAmount: Decimal;
  patientAmount: Decimal;
}> {
  const quantity = decimal128ToDecimal(resolved.quantity);
  const listedUnitPrice = decimal128ToDecimal(resolved.authoritativeUnitPrice);
  const taxRate = resolved.taxCategory === null
    ? new Decimal(0)
    : decimal128ToDecimal(resolved.taxCategory.ratePercentage);
  const scale = resolved.taxCategory?.roundingScale ?? 2;
  const taxMode = resolved.taxCategory?.calculationMode ?? 'EXEMPT';

  let authoritativeUnitPrice = listedUnitPrice;
  let grossAmount = listedUnitPrice.mul(quantity);
  let taxAmount = new Decimal(0);

  if (taxMode === 'INCLUSIVE' && !taxRate.isZero()) {
    const taxDivisor = new Decimal(100).plus(taxRate);
    authoritativeUnitPrice = rounded(listedUnitPrice.mul(100).div(taxDivisor), 8);
    grossAmount = rounded(authoritativeUnitPrice.mul(quantity), scale);
    taxAmount = rounded(listedUnitPrice.mul(quantity).minus(grossAmount), scale);
  } else if (taxMode === 'EXCLUSIVE' && !taxRate.isZero()) {
    grossAmount = rounded(grossAmount, scale);
    taxAmount = rounded(grossAmount.mul(taxRate).div(100), scale);
  } else {
    grossAmount = rounded(grossAmount, scale);
  }

  const netAmount = grossAmount.plus(taxAmount);
  if (payer === undefined) {
    return {
      originalUnitPrice: decimal128ToDecimal(resolved.originalUnitPrice),
      authoritativeUnitPrice,
      grossAmount,
      taxAmount,
      netAmount,
      payerAmount: new Decimal(0),
      patientAmount: netAmount,
    };
  }

  const deductible = decimal128ToDecimal(payer.deductibleSnapshot);
  const copay = decimal128ToDecimal(payer.copaySnapshot);
  const coinsurance = decimal128ToDecimal(payer.coinsurancePercentageSnapshot);
  const deductibleApplied = Decimal.min(netAmount, deductible);
  const afterDeductible = Decimal.max(0, netAmount.minus(deductibleApplied));
  const copayApplied = Decimal.min(afterDeductible, copay);
  const coveredBase = Decimal.max(0, afterDeductible.minus(copayApplied));
  const coinsuranceAmount = rounded(coveredBase.mul(coinsurance).div(100), scale);
  let patientAmount = Decimal.min(
    netAmount,
    deductibleApplied.plus(copayApplied).plus(coinsuranceAmount),
  );
  let payerAmount = netAmount.minus(patientAmount);
  if (payer.coverageLimitSnapshot !== null) {
    payerAmount = Decimal.min(payerAmount, decimal128ToDecimal(payer.coverageLimitSnapshot));
    patientAmount = netAmount.minus(payerAmount);
  }

  return {
    originalUnitPrice: decimal128ToDecimal(resolved.originalUnitPrice),
    authoritativeUnitPrice,
    grossAmount,
    taxAmount,
    netAmount,
    payerAmount,
    patientAmount,
  };
}

export class UnifiedBillingChargeService
implements UnifiedBillingChargePostingPort {
  public constructor(
    private readonly dependencies: UnifiedBillingChargeServiceDependencies,
  ) {}

  public async postCharge(
    actor: UnifiedBillingActorContext,
    operationKey: string,
    input: PostSourceChargeInput,
    session?: BillingMongoSession,
  ): Promise<UnifiedBillingPostingResult> {
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'CHARGE_POST',
    }));
    const result = session === undefined
      ? await this.postWithManagedTransaction(actor, operationKey, input)
      : await this.postInSession(
          actor,
          operationKey,
          input,
          session,
          actor.correlationId,
        );
    await this.publishChargeChanged(actor.facilityId, result.patientAccountId, result.chargeIds);
    return result;
  }

  public async postChargeBatch(
    actor: UnifiedBillingActorContext,
    input: PostChargeBatchInput,
    session?: BillingMongoSession,
  ): Promise<UnifiedBillingPostingResult> {
    if (input.items.length === 0) {
      throw new BillingChargeRuleViolationError('Charge batch must contain at least one item');
    }
    const results: UnifiedBillingPostingResult[] = [];
    for (const item of input.items) {
      results.push(await this.postCharge(actor, item.operationKey, item, session));
    }
    const accountIds = new Set(results.map((item) => item.patientAccountId));
    if (accountIds.size !== 1) {
      throw new BillingChargeRuleViolationError(
        'A single charge batch cannot post to multiple patient accounts',
      );
    }
    return {
      patientAccountId: results[0]!.patientAccountId,
      chargeIds: results.flatMap((item) => item.chargeIds),
      replayed: results.every((item) => item.replayed),
    };
  }

  public async reverseSourceCharges(
    actor: UnifiedBillingActorContext,
    operationKey: string,
    sourceModule: PostSourceChargeInput['sourceModule'],
    sourceRecordId: string,
    reason: string,
    session?: BillingMongoSession,
  ): Promise<UnifiedBillingPostingResult> {
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'CHARGE_REVERSE',
    }));
    const matches = await this.dependencies.charges.list(actor.facilityId, {
      page: 1,
      pageSize: 100,
      sourceModule: [sourceModule],
      status: ['POSTED'],
    }, false);
    const sourceMatches = matches.items.filter(
      (item) => item.sourceRecordId === sourceRecordId,
    );
    if (sourceMatches.length === 0) {
      return { patientAccountId: '', chargeIds: [], replayed: true };
    }
    throw new BillingChargeRuleViolationError(
      `Source reversal for ${operationKey} requires the Batch 5 reversal workflow: ${normalizeBillingText(reason)}`,
    );
  }

  public async postManualCharge(
    command: UnifiedBillingChargeCommandContext,
    input: PostManualChargeInput,
  ): Promise<UnifiedChargePostingResultView> {
    const { actor } = command;
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'CHARGE_MANUAL',
    }));
    const account = await this.dependencies.accounts.findById(
      actor.facilityId,
      input.patientAccountId,
    );
    if (account === null) {
      throw new BillingPatientAccountNotFoundError();
    }
    const syntheticSource: PostSourceChargeInput = {
      patientAccountId: input.patientAccountId,
      sourceModule: 'UNIFIED_BILLING',
      sourceRecordId: input.patientAccountId,
      sourceLineId: null,
      chargeCode: input.chargeCode,
      ...(input.quantity === undefined ? {} : { quantity: input.quantity }),
      serviceFrom: input.serviceFrom,
      ...(input.serviceThrough === undefined ? {} : { serviceThrough: input.serviceThrough }),
      postingReason: input.reason,
    };
    const posted = await this.postCharge(actor, command.idempotencyKey, syntheticSource);
    const records = await Promise.all(
      posted.chargeIds.map((chargeId) => this.dependencies.charges.findById(
        actor.facilityId,
        chargeId,
      )),
    );
    const updatedAccount = await this.dependencies.accounts.findById(
      actor.facilityId,
      posted.patientAccountId,
    );
    if (updatedAccount === null) {
      throw new BillingPatientAccountNotFoundError();
    }
    return {
      patientAccount: projectPatientAccount(updatedAccount),
      charges: records.flatMap((record) => record === null
        ? []
        : [projectAccountCharge(record, false)]),
      replayed: posted.replayed,
    };
  }

  public async listCharges(
    actor: UnifiedBillingActorContext,
    query: UnifiedBillingChargeListQuery,
  ) {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'CHARGE_READ',
    });
    requireAllowed(decision);
    return this.dependencies.charges.list(actor.facilityId, query, decision.includeCost);
  }

  private async postWithManagedTransaction(
    actor: UnifiedBillingActorContext,
    operationKey: string,
    input: PostSourceChargeInput,
  ): Promise<UnifiedBillingPostingResult> {
    const source = await this.resolveSource(actor, input);
    const key = deriveBillingDeterministicChargeKey(source, input.chargeCode, input.packageEnrollmentId ?? null);
    return this.dependencies.transactionManager.execute({
      transactionType: UNIFIED_BILLING_TRANSACTION_TYPES.POST_CHARGE,
      idempotencyKey: operationKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        unifiedBillingLockKey(
          UNIFIED_BILLING_LOCK_NAMESPACE.SOURCE_CHARGE,
          actor.facilityId,
          key,
        ),
      ],
      idempotencyPayload: input,
      journalPayload: {
        sourceModule: source.sourceModule,
        sourceRecordId: source.sourceRecordId,
        chargeCode: normalizeBillingCode(input.chargeCode),
      },
      execute: (transaction) => this.postResolvedInSession(
        actor,
        operationKey,
        input,
        source,
        transaction.session,
        transaction.transactionId,
      ),
    });
  }

  private async postInSession(
    actor: UnifiedBillingActorContext,
    operationKey: string,
    input: PostSourceChargeInput,
    session: BillingMongoSession,
    transactionId: string,
  ): Promise<UnifiedBillingPostingResult> {
    const source = await this.resolveSource(actor, input);
    return this.postResolvedInSession(actor, operationKey, input, source, session, transactionId);
  }

  private async resolveSource(
    actor: UnifiedBillingActorContext,
    input: PostSourceChargeInput,
  ): Promise<AuthoritativeBillingSourceContext> {
    if (input.sourceModule === 'UNIFIED_BILLING') {
      const account = input.patientAccountId === null || input.patientAccountId === undefined
        ? null
        : await this.dependencies.accounts.findById(actor.facilityId, input.patientAccountId);
      if (account === null) {
        throw new BillingPatientAccountNotFoundError();
      }
      return {
        facilityId: actor.facilityId,
        sourceModule: 'UNIFIED_BILLING',
        sourceRecordType: 'MANUAL_CHARGE',
        sourceRecordId: input.sourceRecordId,
        sourceLineId: input.sourceLineId ?? null,
        sourceOccurredAt: new Date(input.serviceFrom ?? this.dependencies.clock.now()).toISOString(),
        sourceStatus: 'AUTHORIZED',
        billable: true,
        unbillableReason: null,
        patient: { patientId: account.patientId.toHexString(), mrn: null, displayName: '', status: 'ACTIVE' },
        billingContext: account.billingContext,
        registrationId: account.registrationId?.toHexString() ?? null,
        opdVisitId: account.opdVisitId?.toHexString() ?? null,
        encounterId: account.encounterId?.toHexString() ?? null,
        admissionId: account.admissionId?.toHexString() ?? null,
        emergencyVisitId: account.emergencyVisitId?.toHexString() ?? null,
        departmentId: null,
        locationId: null,
        serviceLineCode: null,
        serviceFrom: input.serviceFrom ?? this.dependencies.clock.now().toISOString(),
        serviceThrough: input.serviceThrough ?? null,
      };
    }
    return this.dependencies.context.resolveSource(actor, input);
  }

  private async postResolvedInSession(
    actor: UnifiedBillingActorContext,
    operationKey: string,
    input: PostSourceChargeInput,
    source: AuthoritativeBillingSourceContext,
    session: BillingMongoSession,
    transactionId: string,
  ): Promise<UnifiedBillingPostingResult> {
    const existingOperation = await this.dependencies.charges.findByOperationKey(
      actor.facilityId,
      operationKey,
      session,
    );
    if (existingOperation !== null) {
      return {
        patientAccountId: existingOperation.patientAccountId.toHexString(),
        chargeIds: [existingOperation._id.toHexString()],
        replayed: true,
      };
    }
    const key = deriveBillingDeterministicChargeKey(source, input.chargeCode, input.packageEnrollmentId ?? null);
    const duplicate = await this.dependencies.charges.findByDeterministicKey(
      actor.facilityId,
      key,
      session,
    );
    if (duplicate !== null) {
      if (duplicate.operationKey !== operationKey) {
        throw new BillingDuplicateChargeError();
      }
      return {
        patientAccountId: duplicate.patientAccountId.toHexString(),
        chargeIds: [duplicate._id.toHexString()],
        replayed: true,
      };
    }

    const staff = await this.dependencies.context.requireActiveActorStaff(actor);
    const account = await this.requireOrCreateAccount(
      actor,
      source,
      input.patientAccountId ?? null,
      transactionId,
      session,
    );
    if (account.status !== 'OPEN' || account.lockedAt !== null) {
      throw new BillingAccountLockedError();
    }
    const quantity = input.quantity ?? '1';
    const selectedPayer = input.payerCoverageId == null
      ? account.payerSnapshots[0]
      : account.payerSnapshots.find(
          (payer) => payer.patientCoverageId?.toHexString() === input.payerCoverageId,
        );
    const resolved = await this.dependencies.pricing.resolve({
      facilityId: actor.facilityId,
      chargeCode: input.chargeCode,
      quantity,
      at: new Date(input.serviceFrom ?? source.serviceFrom),
      billingContext: source.billingContext,
      patientId: source.patient.patientId,
      departmentId: source.departmentId,
      locationId: source.locationId,
      payerOrganizationId: selectedPayer?.payerOrganizationId.toHexString() ?? null,
      panelPlanId: selectedPayer?.panelPlanId?.toHexString() ?? null,
      packageEnrollmentId: input.packageEnrollmentId ?? null,
      afterHours: false,
      includeCost: true,
    }, session);
    if (resolved.catalog.status !== 'ACTIVE') {
      throw new BillingChargeCatalogItemNotFoundError();
    }
    const currentCharges = await this.dependencies.charges.listRecordsForAccount(
      actor.facilityId,
      account._id.toHexString(),
      session,
    );
    await this.enforceRules(actor.facilityId, resolved, currentCharges);
    const money = calculateAuthoritativeChargeMoney(resolved, selectedPayer);
    const zero = billingDecimal128('0', 'zero');
    const occurredAt = this.dependencies.clock.now();
    const created = await this.dependencies.charges.create({
      facilityId: actor.facilityId,
      transactionId,
      correlationId: actor.correlationId,
      createdBy: actor.userId,
      updatedBy: actor.userId,
      operationKey,
      deterministicChargeKey: key,
      patientAccountId: account._id,
      patientId: account.patientId,
      registrationId: account.registrationId,
      opdVisitId: account.opdVisitId,
      encounterId: account.encounterId,
      admissionId: account.admissionId,
      source: {
        sourceModule: source.sourceModule,
        sourceRecordType: normalizeBillingCode(source.sourceRecordType),
        sourceRecordId: toObjectId(source.sourceRecordId, 'sourceRecordId'),
        sourceLineId: nullableBillingObjectId(source.sourceLineId, 'sourceLineId'),
        sourceOccurredAt: new Date(source.sourceOccurredAt),
      },
      chargeCatalogItemId: resolved.catalog._id,
      chargeCatalogVersionId: resolved.catalogVersion._id,
      serviceRateId: resolved.serviceRate._id,
      priceListId: resolved.priceList._id,
      priceListVersionId: resolved.serviceRate.priceListVersionId,
      chargeCodeSnapshot: resolved.catalog.chargeCode,
      serviceCodeSnapshot: resolved.catalog.serviceCode,
      chargeNameSnapshot: resolved.catalog.name,
      categoryCodeSnapshot: resolved.category.code,
      departmentId: nullableBillingObjectId(
        source.departmentId ?? resolved.catalog.departmentId?.toHexString() ?? null,
        'departmentId',
      ),
      serviceLineCodeSnapshot: source.serviceLineCode ?? resolved.catalog.serviceLineCode,
      revenueAccountCodeSnapshot: resolved.catalog.revenueAccountCode,
      taxCategoryId: resolved.taxCategory?._id ?? null,
      taxCategoryCodeSnapshot: resolved.taxCategory?.code ?? null,
      unitOfMeasureId: resolved.catalog.unitOfMeasureId,
      unitOfMeasureCodeSnapshot: null,
      quantity: resolved.quantity,
      originalUnitPrice: billingDecimal128(money.originalUnitPrice.toFixed(), 'originalUnitPrice'),
      authoritativeUnitPrice: billingDecimal128(
        money.authoritativeUnitPrice.toFixed(),
        'authoritativeUnitPrice',
      ),
      costAmountSnapshot: resolved.catalog.costAmount,
      currency: BILLING_CURRENCY,
      grossAmount: billingDecimal128(money.grossAmount.toFixed(), 'grossAmount'),
      discountAmount: zero,
      taxAmount: billingDecimal128(money.taxAmount.toFixed(), 'taxAmount'),
      welfareAmount: zero,
      payerAmount: billingDecimal128(money.payerAmount.toFixed(), 'payerAmount'),
      patientAmount: billingDecimal128(money.patientAmount.toFixed(), 'patientAmount'),
      netAmount: billingDecimal128(money.netAmount.toFixed(), 'netAmount'),
      status: 'POSTED',
      packageEnrollmentId: nullableBillingObjectId(input.packageEnrollmentId, 'packageEnrollmentId'),
      treatmentPackageItemId: null,
      packageIncludedQuantity: zero,
      packageOverageQuantity: zero,
      payerOrganizationId: selectedPayer?.payerOrganizationId ?? null,
      panelPlanId: selectedPayer?.panelPlanId ?? null,
      patientCoverageId: selectedPayer?.patientCoverageId ?? null,
      preauthorizationId: null,
      excludedFromCoverage: selectedPayer === undefined,
      originalChargeId: null,
      replacementChargeId: null,
      transferredFromAccountId: null,
      transferredToAccountId: null,
      approvalRequestIds: [],
      postedAt: occurredAt,
      postedBy: toObjectId(actor.userId, 'actor.userId'),
      lifecycleReason: input.postingReason == null
        ? null
        : normalizeBillingText(input.postingReason),
      serviceFrom: new Date(input.serviceFrom ?? source.serviceFrom),
      serviceThrough: input.serviceThrough === null || input.serviceThrough === undefined
        ? source.serviceThrough === null ? null : new Date(source.serviceThrough)
        : new Date(input.serviceThrough),
    }, session);
    await this.dependencies.charges.appendHistory({
      facilityId: actor.facilityId,
      accountChargeId: created._id.toHexString(),
      action: 'POSTED',
      fromStatus: null,
      toStatus: 'POSTED',
      chargeVersion: created.version,
      originalChargeId: null,
      replacementChargeId: null,
      reason: input.postingReason == null
        ? 'Authoritative source charge posted'
        : normalizeBillingText(input.postingReason),
      approvalRequestId: null,
      changedAt: occurredAt,
      changedBy: actor.userId,
      amountSnapshot: {
        grossAmount: created.grossAmount,
        discountAmount: created.discountAmount,
        taxAmount: created.taxAmount,
        welfareAmount: created.welfareAmount,
        payerAmount: created.payerAmount,
        patientAmount: created.patientAmount,
        netAmount: created.netAmount,
      },
      createdBy: actor.userId,
      updatedBy: actor.userId,
      transactionId,
      correlationId: actor.correlationId,
    }, session);
    const updatedAccount = await this.recalculateAccount(
      actor,
      account,
      transactionId,
      session,
    );
    const chargeView = projectAccountCharge(created, false);
    await Promise.all([
      this.dependencies.audit.append({
        transactionId,
        deduplicationKey: `${transactionId}:audit:charge:${created._id.toHexString()}`,
        action: 'billing.charge.posted',
        entityType: 'AccountCharge',
        entityId: created._id.toHexString(),
        actorUserId: actor.userId,
        actorStaffId: staff.staffId,
        facilityId: actor.facilityId,
        correlationId: actor.correlationId,
        ...(actor.ipAddress === undefined ? {} : { ipAddress: actor.ipAddress }),
        ...(actor.userAgent === undefined ? {} : { userAgent: actor.userAgent }),
        occurredAt,
        ...(input.postingReason == null
          ? {}
          : { reason: normalizeBillingText(input.postingReason) }),
        after: chargeView,
        metadata: {
          patientAccountId: account._id.toHexString(),
          sourceModule: source.sourceModule,
          sourceRecordId: source.sourceRecordId,
        },
      }, session),
      this.dependencies.outbox.enqueue({
        transactionId,
        deduplicationKey: `${transactionId}:outbox:${UNIFIED_BILLING_EVENT_TYPES.CHARGE_POSTED}:${created._id.toHexString()}`,
        eventType: UNIFIED_BILLING_EVENT_TYPES.CHARGE_POSTED,
        aggregateType: 'AccountCharge',
        aggregateId: created._id.toHexString(),
        actorUserId: actor.userId,
        facilityId: actor.facilityId,
        correlationId: actor.correlationId,
        occurredAt,
        payload: {
          accountChargeId: created._id.toHexString(),
          patientAccountId: updatedAccount._id.toHexString(),
          patientId: updatedAccount.patientId.toHexString(),
          sourceModule: source.sourceModule,
          sourceRecordId: source.sourceRecordId,
          netAmount: money.netAmount.toFixed(),
          currency: BILLING_CURRENCY,
        },
      }, session),
    ]);
    return {
      patientAccountId: updatedAccount._id.toHexString(),
      chargeIds: [created._id.toHexString()],
      replayed: false,
    };
  }

  private async requireOrCreateAccount(
    actor: UnifiedBillingActorContext,
    source: AuthoritativeBillingSourceContext,
    requestedAccountId: string | null,
    transactionId: string,
    session: BillingMongoSession,
  ): Promise<PatientAccountRecord> {
    if (requestedAccountId !== null) {
      const requested = await this.dependencies.accounts.findById(
        actor.facilityId,
        requestedAccountId,
        session,
      );
      if (requested === null || requested.patientId.toHexString() !== source.patient.patientId) {
        throw new BillingPatientAccountNotFoundError();
      }
      return requested;
    }
    const existing = await this.dependencies.accounts.findOpenForSource(
      actor.facilityId,
      source,
      session,
    );
    if (existing !== null) {
      return existing;
    }
    const allocation = await this.dependencies.sequence.next(
      actor.facilityId,
      UNIFIED_BILLING_NUMBER_SEQUENCE_NAMESPACE.ACCOUNT,
    );
    const zero = billingDecimal128('0', 'zero');
    const now = this.dependencies.clock.now();
    const account = await this.dependencies.accounts.create({
      facilityId: actor.facilityId,
      transactionId,
      correlationId: actor.correlationId,
      createdBy: actor.userId,
      updatedBy: actor.userId,
      accountNumber: formatAccountNumber(now.getUTCFullYear(), allocation.value),
      patientId: toObjectId(source.patient.patientId, 'patientId'),
      accountType: source.billingContext === 'INPATIENT'
        ? 'INPATIENT'
        : source.billingContext === 'EMERGENCY'
          ? 'EMERGENCY'
          : 'OUTPATIENT',
      billingContext: source.billingContext,
      registrationId: nullableBillingObjectId(source.registrationId, 'registrationId'),
      opdVisitId: nullableBillingObjectId(source.opdVisitId, 'opdVisitId'),
      encounterId: nullableBillingObjectId(source.encounterId, 'encounterId'),
      admissionId: nullableBillingObjectId(source.admissionId, 'admissionId'),
      emergencyVisitId: nullableBillingObjectId(source.emergencyVisitId, 'emergencyVisitId'),
      responsiblePartyType: 'PATIENT',
      guarantorId: null,
      guarantorNameSnapshot: null,
      payerSnapshots: [],
      currency: BILLING_CURRENCY,
      grossCharges: zero,
      discountTotal: zero,
      taxTotal: zero,
      welfareTotal: zero,
      payerResponsibilityTotal: zero,
      patientResponsibilityTotal: zero,
      paymentsAppliedTotal: zero,
      creditsTotal: zero,
      writeOffTotal: zero,
      outstandingBalance: zero,
      refundableBalance: zero,
      status: 'OPEN',
      lockedAt: null,
      lockedBy: null,
      lockReason: null,
      finalizedAt: null,
      finalizedBy: null,
      suspendedAt: null,
      suspendedBy: null,
      suspensionReason: null,
      closedPeriodCode: null,
    }, session);
    await this.dependencies.accounts.appendStatusHistory({
      facilityId: actor.facilityId,
      patientAccountId: account._id.toHexString(),
      fromStatus: null,
      toStatus: 'OPEN',
      accountVersion: account.version,
      reason: 'Patient financial account opened by unified charge capture',
      changedAt: now,
      changedBy: actor.userId,
      approvalRequestId: null,
      createdBy: actor.userId,
      updatedBy: actor.userId,
      transactionId,
      correlationId: actor.correlationId,
    }, session);
    return account;
  }

  private async enforceRules(
    facilityId: string,
    resolved: ResolvedPriceRecord,
    currentCharges: readonly AccountChargeRecord[],
  ): Promise<void> {
    const rules = await this.dependencies.catalog.listRules(
      facilityId,
      resolved.catalog._id.toHexString(),
      this.dependencies.clock.now(),
    );
    for (const rule of rules) {
      if (rule.relatedChargeCatalogItemId === null) {
        continue;
      }
      const relatedExists = currentCharges.some(
        (charge) =>
          charge.chargeCatalogItemId.toHexString() === rule.relatedChargeCatalogItemId &&
          charge.status === 'POSTED',
      );
      if (rule.ruleType === 'REQUIRES' && !relatedExists) {
        throw new BillingChargeRuleViolationError(
          `Charge ${resolved.catalog.chargeCode} requires related charge ${rule.relatedChargeCatalogItemId}`,
        );
      }
      if (rule.ruleType === 'MUTUALLY_EXCLUSIVE' && relatedExists) {
        throw new BillingChargeRuleViolationError(
          `Charge ${resolved.catalog.chargeCode} is mutually exclusive with an existing account charge`,
        );
      }
    }
  }

  private async recalculateAccount(
    actor: UnifiedBillingActorContext,
    account: PatientAccountRecord,
    transactionId: string,
    session: BillingMongoSession,
  ): Promise<PatientAccountRecord> {
    const records = await this.dependencies.charges.listRecordsForAccount(
      actor.facilityId,
      account._id.toHexString(),
      session,
    );
    const posted = records.filter((record) => record.status === 'POSTED');
    const sum = (field: keyof Pick<AccountChargeRecord,
      | 'grossAmount'
      | 'discountAmount'
      | 'taxAmount'
      | 'welfareAmount'
      | 'payerAmount'
      | 'patientAmount'
    >) => posted.reduce(
      (total, record) => total.plus(record[field].toString()),
      new Decimal(0),
    );
    const patient = sum('patientAmount');
    const paymentsAndCredits = decimal128ToDecimal(account.paymentsAppliedTotal)
      .plus(decimal128ToDecimal(account.creditsTotal));
    const outstanding = Decimal.max(0, patient.minus(paymentsAndCredits));
    const refundable = Decimal.max(0, paymentsAndCredits.minus(patient));
    const updated = await this.dependencies.accounts.update(
      actor.facilityId,
      account._id.toHexString(),
      account.version,
      {
        grossCharges: billingDecimal128(sum('grossAmount').toFixed(), 'grossCharges'),
        discountTotal: billingDecimal128(sum('discountAmount').toFixed(), 'discountTotal'),
        taxTotal: billingDecimal128(sum('taxAmount').toFixed(), 'taxTotal'),
        welfareTotal: billingDecimal128(sum('welfareAmount').toFixed(), 'welfareTotal'),
        payerResponsibilityTotal: billingDecimal128(sum('payerAmount').toFixed(), 'payerResponsibilityTotal'),
        patientResponsibilityTotal: billingDecimal128(patient.toFixed(), 'patientResponsibilityTotal'),
        outstandingBalance: billingDecimal128(outstanding.toFixed(), 'outstandingBalance'),
        refundableBalance: billingDecimal128(refundable.toFixed(), 'refundableBalance'),
        updatedBy: toObjectId(actor.userId, 'actor.userId'),
      },
      transactionId,
      actor.correlationId,
      session,
    );
    if (updated === null) {
      throw new BillingPatientAccountConcurrencyError();
    }
    return updated;
  }

  private async publishChargeChanged(
    facilityId: string,
    patientAccountId: string,
    chargeIds: readonly string[],
  ): Promise<void> {
    if (patientAccountId.length === 0) {
      return;
    }
    await Promise.all([
      this.dependencies.realtime.publish({
        eventType: UNIFIED_BILLING_REALTIME_EVENTS.CHARGES_CHANGED,
        facilityId,
        patientAccountId,
        payload: { patientAccountId, chargeIds },
      }),
      this.dependencies.realtime.publish({
        eventType: UNIFIED_BILLING_REALTIME_EVENTS.ACCOUNT_CHANGED,
        facilityId,
        patientAccountId,
        payload: { patientAccountId },
      }),
    ]);
  }
}