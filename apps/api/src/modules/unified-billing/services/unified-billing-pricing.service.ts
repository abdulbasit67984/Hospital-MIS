import Decimal from 'decimal.js';

import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  ActivatePriceListVersionInput,
  ChangePriceListStatusInput,
  CreatePriceListInput,
  CreateTaxCategoryInput,
  PriceListView,
  ResolvedPriceView,
  ServiceRateView,
  TaxCategoryView,
  UnifiedBillingActorContext,
  UpsertServiceRateInput,
} from '../unified-billing.contracts.js';

import {
  UNIFIED_BILLING_EVENT_TYPES,
  UNIFIED_BILLING_LOCK_NAMESPACE,
  UNIFIED_BILLING_REALTIME_EVENTS,
  UNIFIED_BILLING_TRANSACTION_TYPES,
} from '../unified-billing.constants.js';

import {
  BillingAccessDeniedError,
  BillingCatalogConcurrencyError,
  BillingChargeCatalogItemNotFoundError,
  BillingChargeCategoryNotFoundError,
  BillingChargeRuleViolationError,
  BillingFinalizedRecordImmutableError,
  BillingInvalidLifecycleTransitionError,
  BillingNoEffectivePriceError,
  BillingPriceListConcurrencyError,
  BillingPriceListNotFoundError,
  BillingPriceResolutionError,
  BillingTaxCategoryNotFoundError,
} from '../unified-billing.errors.js';

import type {
  ChargeCatalogRepositoryPort,
  PriceListRepositoryPort,
  UnifiedBillingAccessPolicyPort,
  UnifiedBillingAuditPort,
  UnifiedBillingClockPort,
  UnifiedBillingContextPort,
  UnifiedBillingOutboxPort,
  UnifiedBillingPricingPort,
  UnifiedBillingPricingResolutionRequest,
  UnifiedBillingRealtimePort,
  UnifiedBillingReferenceDataPort,
  UnifiedBillingTransactionManagerPort,
} from '../unified-billing.ports.js';

import type {
  ResolvedPriceRecord,
} from '../unified-billing.persistence.types.js';

import {
  projectPriceList,
  projectResolvedPrice,
  projectServiceRate,
  projectTaxCategory,
} from '../unified-billing.projections.js';

import {
  billingDecimal128,
  decimal128ToDecimal,
  isBillingRecordEffective,
  normalizeBillingCode,
  normalizeBillingText,
  normalizeNullableBillingText,
  nullableBillingDecimal128,
  nullableBillingObjectId,
  pricingSpecificityScore,
  requirePositiveBillingDecimal,
  unifiedBillingLockKey,
} from '../unified-billing.normalization.js';

export interface UnifiedBillingPricingCommandContext {
  actor: UnifiedBillingActorContext;
  idempotencyKey: string;
}

export interface UnifiedBillingPricingServiceDependencies {
  catalog: ChargeCatalogRepositoryPort;
  pricing: PriceListRepositoryPort;
  references: UnifiedBillingReferenceDataPort;
  accessPolicy: UnifiedBillingAccessPolicyPort;
  context: UnifiedBillingContextPort;
  transactionManager: UnifiedBillingTransactionManagerPort;
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

function requirePriceListUpdated<T>(value: T | null): T {
  if (value === null) {
    throw new BillingPriceListConcurrencyError();
  }
  return value;
}

function requireRateUpdated<T>(value: T | null): T {
  if (value === null) {
    throw new BillingCatalogConcurrencyError();
  }
  return value;
}

async function requireReference(
  value: string | null | undefined,
  label: string,
  exists: (id: string) => Promise<boolean>,
): Promise<void> {
  if (value != null && !(await exists(value))) {
    throw new BillingChargeRuleViolationError(
      `${label} does not belong to the current facility or is not available`,
    );
  }
}

export class UnifiedBillingPricingService
implements UnifiedBillingPricingPort {
  public constructor(
    private readonly dependencies: UnifiedBillingPricingServiceDependencies,
  ) {}

  public async createTaxCategory(
    command: UnifiedBillingPricingCommandContext,
    input: CreateTaxCategoryInput,
  ): Promise<TaxCategoryView> {
    const { actor } = command;
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'PRICING_MANAGE',
    }));
    const staff = await this.dependencies.context.requireActiveActorStaff(actor);
    const occurredAt = this.dependencies.clock.now();
    const result = await this.dependencies.transactionManager.execute({
      transactionType: UNIFIED_BILLING_TRANSACTION_TYPES.CREATE_TAX_CATEGORY,
      idempotencyKey: command.idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [unifiedBillingLockKey(
        UNIFIED_BILLING_LOCK_NAMESPACE.TAX_CATEGORY,
        actor.facilityId,
        normalizeBillingCode(input.code),
      )],
      idempotencyPayload: input,
      journalPayload: { taxCategoryCode: normalizeBillingCode(input.code) },
      execute: async (transaction) => {
        const created = await this.dependencies.pricing.createTaxCategory({
          facilityId: actor.facilityId,
          transactionId: transaction.transactionId,
          correlationId: actor.correlationId,
          createdBy: actor.userId,
          updatedBy: actor.userId,
          code: normalizeBillingCode(input.code),
          name: normalizeBillingText(input.name),
          calculationMode: input.calculationMode,
          ratePercentage: billingDecimal128(
            input.calculationMode === 'EXEMPT'
              ? '0'
              : input.ratePercentage ?? '0',
            'ratePercentage',
          ),
          roundingMode: input.roundingMode ?? 'HALF_UP',
          roundingScale: input.roundingScale ?? 2,
          exemptionReasonRequired: input.exemptionReasonRequired ?? false,
          effectiveFrom: new Date(input.effectiveFrom),
          effectiveThrough: input.effectiveThrough == null
            ? null
            : new Date(input.effectiveThrough),
          active: true,
        }, transaction.session);
        const view = projectTaxCategory(created);
        await this.appendAuditAndOutbox(
          actor,
          staff.staffId,
          transaction.transactionId,
          UNIFIED_BILLING_EVENT_TYPES.TAX_CATEGORY_CHANGED,
          'billing.tax_category.created',
          'TaxCategory',
          view.id,
          occurredAt,
          undefined,
          view,
          transaction.session,
        );
        return view;
      },
    });

    await this.publishPricingChanged(actor.facilityId, result.id, 'TAX_CATEGORY');
    return result;
  }

  public async createPriceList(
    command: UnifiedBillingPricingCommandContext,
    input: CreatePriceListInput,
  ): Promise<PriceListView> {
    const { actor } = command;
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'PRICING_MANAGE',
    }));
    const staff = await this.dependencies.context.requireActiveActorStaff(actor);
    await this.validatePriceListReferences(actor.facilityId, input);
    const occurredAt = this.dependencies.clock.now();
    const result = await this.dependencies.transactionManager.execute({
      transactionType: UNIFIED_BILLING_TRANSACTION_TYPES.CREATE_PRICE_LIST,
      idempotencyKey: command.idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [unifiedBillingLockKey(
        UNIFIED_BILLING_LOCK_NAMESPACE.PRICE_LIST,
        actor.facilityId,
        normalizeBillingCode(input.code),
      )],
      idempotencyPayload: input,
      journalPayload: { priceListCode: normalizeBillingCode(input.code) },
      execute: async (transaction) => {
        const created = await this.dependencies.pricing.createPriceList({
          facilityId: actor.facilityId,
          transactionId: transaction.transactionId,
          correlationId: actor.correlationId,
          createdBy: actor.userId,
          updatedBy: actor.userId,
          ...this.priceListSnapshot(input),
          status: 'DRAFT',
          priority: input.priority ?? 100,
          currentVersion: 0,
          latestVersionId: null,
          activatedAt: null,
          activatedBy: null,
          retiredAt: null,
          retiredBy: null,
          retirementReason: null,
        }, transaction.session);
        const view = projectPriceList(created);
        await this.appendAuditAndOutbox(
          actor,
          staff.staffId,
          transaction.transactionId,
          UNIFIED_BILLING_EVENT_TYPES.PRICE_LIST_CREATED,
          'billing.price_list.created',
          'PriceList',
          view.id,
          occurredAt,
          undefined,
          view,
          transaction.session,
        );
        return view;
      },
    });

    await this.publishPricingChanged(actor.facilityId, result.id, 'PRICE_LIST');
    return result;
  }

  public async activatePriceListVersion(
    command: UnifiedBillingPricingCommandContext,
    priceListId: string,
    input: ActivatePriceListVersionInput,
  ): Promise<PriceListView> {
    const { actor } = command;
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'PRICING_MANAGE',
    }));
    const staff = await this.dependencies.context.requireActiveActorStaff(actor);
    await this.validatePriceListReferences(actor.facilityId, input);
    const occurredAt = this.dependencies.clock.now();
    const result = await this.dependencies.transactionManager.execute({
      transactionType: UNIFIED_BILLING_TRANSACTION_TYPES.ACTIVATE_PRICE_LIST_VERSION,
      idempotencyKey: command.idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [unifiedBillingLockKey(
        UNIFIED_BILLING_LOCK_NAMESPACE.PRICE_LIST,
        actor.facilityId,
        priceListId,
      )],
      idempotencyPayload: { priceListId, ...input },
      journalPayload: { priceListId },
      execute: async (transaction) => {
        const existing = await this.dependencies.pricing.findPriceList(
          actor.facilityId,
          priceListId,
          transaction.session,
        );
        if (existing === null) {
          throw new BillingPriceListNotFoundError();
        }
        if (existing.status === 'RETIRED') {
          throw new BillingFinalizedRecordImmutableError();
        }
        if (normalizeBillingCode(input.code) !== existing.code) {
          throw new BillingChargeRuleViolationError(
            'A price-list code is immutable after creation',
          );
        }
        const nextVersion = existing.currentVersion + 1;
        const snapshot = this.priceListSnapshot(input);
        const version = await this.dependencies.pricing.createPriceListVersion({
          facilityId: actor.facilityId,
          transactionId: transaction.transactionId,
          correlationId: actor.correlationId,
          createdBy: actor.userId,
          updatedBy: actor.userId,
          priceListId: existing._id,
          versionNumber: nextVersion,
          ...snapshot,
          statusSnapshot: 'ACTIVE',
          prioritySnapshot: input.priority ?? existing.priority,
          changeReason: normalizeBillingText(input.changeReason),
          recordedAt: occurredAt,
          recordedBy: toObjectId(actor.userId, 'actor.userId'),
        }, transaction.session);
        const updated = requirePriceListUpdated(
          await this.dependencies.pricing.updatePriceList(
            actor.facilityId,
            priceListId,
            input.expectedVersion,
            {
              ...snapshot,
              status: 'ACTIVE',
              priority: input.priority ?? existing.priority,
              currentVersion: nextVersion,
              latestVersionId: version._id,
              activatedAt: occurredAt,
              activatedBy: toObjectId(actor.userId, 'actor.userId'),
              retiredAt: null,
              retiredBy: null,
              retirementReason: null,
              updatedBy: toObjectId(actor.userId, 'actor.userId'),
            },
            transaction.transactionId,
            actor.correlationId,
            transaction.session,
          ),
        );
        const view = projectPriceList(updated);
        await this.appendAuditAndOutbox(
          actor,
          staff.staffId,
          transaction.transactionId,
          UNIFIED_BILLING_EVENT_TYPES.PRICE_LIST_VERSION_ACTIVATED,
          'billing.price_list.version_activated',
          'PriceList',
          priceListId,
          occurredAt,
          projectPriceList(existing),
          view,
          transaction.session,
          input.changeReason,
        );
        return view;
      },
    });

    await this.publishPricingChanged(actor.facilityId, result.id, 'PRICE_LIST');
    return result;
  }

  public async changePriceListStatus(
    command: UnifiedBillingPricingCommandContext,
    priceListId: string,
    input: ChangePriceListStatusInput,
  ): Promise<PriceListView> {
    const { actor } = command;
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'PRICING_MANAGE',
    }));
    const staff = await this.dependencies.context.requireActiveActorStaff(actor);
    const occurredAt = this.dependencies.clock.now();
    const result = await this.dependencies.transactionManager.execute({
      transactionType: UNIFIED_BILLING_TRANSACTION_TYPES.CHANGE_PRICE_LIST_STATUS,
      idempotencyKey: command.idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [unifiedBillingLockKey(
        UNIFIED_BILLING_LOCK_NAMESPACE.PRICE_LIST,
        actor.facilityId,
        priceListId,
      )],
      idempotencyPayload: { priceListId, ...input },
      journalPayload: { priceListId, status: input.status },
      execute: async (transaction) => {
        const existing = await this.dependencies.pricing.findPriceList(
          actor.facilityId,
          priceListId,
          transaction.session,
        );
        if (existing === null) {
          throw new BillingPriceListNotFoundError();
        }
        if (existing.status === 'RETIRED' && input.status !== 'RETIRED') {
          throw new BillingInvalidLifecycleTransitionError(
            'Price list',
            existing.status,
            input.status,
          );
        }
        if (input.status === 'ACTIVE' && existing.currentVersion < 1) {
          throw new BillingChargeRuleViolationError(
            'A draft price list must be activated through an immutable version',
          );
        }
        const actorId = toObjectId(actor.userId, 'actor.userId');
        const updated = requirePriceListUpdated(
          await this.dependencies.pricing.updatePriceList(
            actor.facilityId,
            priceListId,
            input.expectedVersion,
            input.status === 'RETIRED'
              ? {
                  status: input.status,
                  retiredAt: occurredAt,
                  retiredBy: actorId,
                  retirementReason: normalizeBillingText(input.reason),
                  updatedBy: actorId,
                }
              : {
                  status: input.status,
                  updatedBy: actorId,
                },
            transaction.transactionId,
            actor.correlationId,
            transaction.session,
          ),
        );
        const view = projectPriceList(updated);
        await this.appendAuditAndOutbox(
          actor,
          staff.staffId,
          transaction.transactionId,
          UNIFIED_BILLING_EVENT_TYPES.PRICE_LIST_STATUS_CHANGED,
          'billing.price_list.status_changed',
          'PriceList',
          priceListId,
          occurredAt,
          projectPriceList(existing),
          view,
          transaction.session,
          input.reason,
        );
        return view;
      },
    });

    await this.publishPricingChanged(actor.facilityId, result.id, 'PRICE_LIST');
    return result;
  }

  public async upsertServiceRate(
    command: UnifiedBillingPricingCommandContext,
    input: UpsertServiceRateInput,
  ): Promise<ServiceRateView> {
    const { actor } = command;
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'PRICING_MANAGE',
    }));
    const staff = await this.dependencies.context.requireActiveActorStaff(actor);
    const catalog = await this.dependencies.catalog.findCatalogItem(
      actor.facilityId,
      input.chargeCatalogItemId,
      { includeCost: false },
    );
    if (catalog === null || catalog.latestVersionId === null) {
      throw new BillingChargeCatalogItemNotFoundError();
    }
    const priceList = await this.dependencies.pricing.findPriceList(
      actor.facilityId,
      input.priceListId,
    );
    if (priceList === null || priceList.latestVersionId === null) {
      throw new BillingPriceListNotFoundError();
    }
    const catalogVersionId = catalog.latestVersionId;
    const priceListVersionId = priceList.latestVersionId;
    if ((input.status ?? 'ACTIVE') === 'ACTIVE') {
      if (catalog.status !== 'ACTIVE' || priceList.status !== 'ACTIVE') {
        throw new BillingChargeRuleViolationError(
          'An active rate requires an active catalog item and active price list',
        );
      }
    }
    if (input.taxCategoryId != null) {
      const tax = await this.dependencies.pricing.findTaxCategory(
        actor.facilityId,
        input.taxCategoryId,
      );
      if (tax === null || !tax.active) {
        throw new BillingTaxCategoryNotFoundError();
      }
    }
    await Promise.all([
      requireReference(input.departmentId, 'Department', (id) =>
        this.dependencies.references.departmentExists(actor.facilityId, id)),
      requireReference(input.locationId, 'Location', (id) =>
        this.dependencies.references.locationExists(actor.facilityId, id)),
    ]);
    const occurredAt = this.dependencies.clock.now();
    const result = await this.dependencies.transactionManager.execute({
      transactionType: UNIFIED_BILLING_TRANSACTION_TYPES.UPSERT_SERVICE_RATE,
      idempotencyKey: command.idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        unifiedBillingLockKey(
          UNIFIED_BILLING_LOCK_NAMESPACE.SERVICE_RATE,
          actor.facilityId,
          input.chargeCatalogItemId,
          input.priceListId,
        ),
        unifiedBillingLockKey(
          UNIFIED_BILLING_LOCK_NAMESPACE.SERVICE_RATE,
          actor.facilityId,
          normalizeBillingCode(input.rateCode),
        ),
      ],
      idempotencyPayload: input,
      journalPayload: {
        rateCode: normalizeBillingCode(input.rateCode),
        chargeCatalogItemId: input.chargeCatalogItemId,
        priceListId: input.priceListId,
      },
      execute: async (transaction) => {
        const duplicateCode = await this.dependencies.pricing.findServiceRateByCode(
          actor.facilityId,
          input.rateCode,
          transaction.session,
        );
        if (duplicateCode !== null) {
          throw new BillingChargeRuleViolationError(
            'A service-rate code is immutable and already exists; use a new code to supersede it',
          );
        }
        const current = await this.dependencies.pricing.findCurrentServiceRate(
          actor.facilityId,
          input.chargeCatalogItemId,
          input.priceListId,
          new Date(input.effectiveFrom),
          transaction.session,
        );
        if (
          current !== null &&
          input.expectedVersion !== undefined &&
          current.version !== input.expectedVersion
        ) {
          throw new BillingPriceListConcurrencyError();
        }
        if (current !== null && (input.status ?? 'ACTIVE') === 'ACTIVE') {
          requireRateUpdated(await this.dependencies.pricing.updateServiceRate(
            actor.facilityId,
            current._id.toHexString(),
            current.version,
            {
              status: 'RETIRED',
              changeReason: `Superseded by ${normalizeBillingCode(input.rateCode)}: ${normalizeBillingText(input.changeReason)}`,
              updatedBy: toObjectId(actor.userId, 'actor.userId'),
            },
            transaction.transactionId,
            actor.correlationId,
            transaction.session,
          ));
        }
        const created = await this.dependencies.pricing.createServiceRate({
          facilityId: actor.facilityId,
          transactionId: transaction.transactionId,
          correlationId: actor.correlationId,
          createdBy: actor.userId,
          updatedBy: actor.userId,
          rateCode: normalizeBillingCode(input.rateCode),
          chargeCatalogItemId: catalog._id,
          chargeCatalogVersionId: catalogVersionId,
          priceListId: priceList._id,
          priceListVersionId,
          amount: billingDecimal128(input.amount, 'amount'),
          minimumAmount: nullableBillingDecimal128(input.minimumAmount, 'minimumAmount'),
          maximumAmount: nullableBillingDecimal128(input.maximumAmount, 'maximumAmount'),
          currency: 'PKR',
          taxCategoryId: nullableBillingObjectId(input.taxCategoryId, 'taxCategoryId'),
          billingContext: input.billingContext ?? null,
          patientCategoryCode: input.patientCategoryCode == null
            ? null
            : normalizeBillingCode(input.patientCategoryCode),
          payerCategoryCode: input.payerCategoryCode == null
            ? null
            : normalizeBillingCode(input.payerCategoryCode),
          payerOrganizationId: priceList.payerOrganizationId,
          panelPlanId: priceList.panelPlanId,
          departmentId: nullableBillingObjectId(input.departmentId, 'departmentId'),
          locationId: nullableBillingObjectId(input.locationId, 'locationId'),
          contractReference: priceList.priceListType === 'CASH' || priceList.priceListType === 'SELF_PAY'
            ? null
            : priceList.code,
          afterHoursOnly: input.afterHoursOnly ?? false,
          effectiveFrom: new Date(input.effectiveFrom),
          effectiveThrough: input.effectiveThrough == null
            ? null
            : new Date(input.effectiveThrough),
          status: input.status ?? 'ACTIVE',
          changeReason: normalizeBillingText(input.changeReason),
          supersedesRateId: current?._id ?? null,
        }, transaction.session);
        const view = projectServiceRate(created);
        await this.appendAuditAndOutbox(
          actor,
          staff.staffId,
          transaction.transactionId,
          UNIFIED_BILLING_EVENT_TYPES.SERVICE_RATE_CHANGED,
          'billing.service_rate.created',
          'ServiceRate',
          view.id,
          occurredAt,
          current === null ? undefined : projectServiceRate(current),
          view,
          transaction.session,
          input.changeReason,
        );
        return view;
      },
    });

    await this.publishPricingChanged(actor.facilityId, result.id, 'SERVICE_RATE');
    return result;
  }

  public async resolve(
    request: UnifiedBillingPricingResolutionRequest,
    session?: Parameters<UnifiedBillingPricingPort['resolve']>[1],
  ): Promise<ResolvedPriceRecord> {
    const quantity = requirePositiveBillingDecimal(request.quantity, 'quantity');
    const catalog = await this.dependencies.catalog.findCatalogItemByCode(
      request.facilityId,
      request.chargeCode,
      request.at,
      { includeCost: request.includeCost, session },
    );
    if (catalog === null || catalog.latestVersionId === null) {
      throw new BillingChargeCatalogItemNotFoundError();
    }
    const catalogVersion = await this.dependencies.catalog.findCatalogVersion(
      request.facilityId,
      catalog.latestVersionId.toHexString(),
      session,
    );
    if (catalogVersion === null) {
      throw new BillingPriceResolutionError(
        'The active catalog item does not have a resolvable immutable version',
      );
    }
    const category = await this.dependencies.catalog.findCategory(
      request.facilityId,
      catalog.categoryId.toHexString(),
      session,
    );
    if (category === null || category.status !== 'ACTIVE') {
      throw new BillingChargeCategoryNotFoundError();
    }
    const minimumQuantity = catalog.minimumQuantity == null
      ? null
      : decimal128ToDecimal(catalog.minimumQuantity);
    const maximumQuantity = catalog.maximumQuantity == null
      ? null
      : decimal128ToDecimal(catalog.maximumQuantity);
    if (minimumQuantity !== null && quantity.lessThan(minimumQuantity)) {
      throw new BillingPriceResolutionError(
        `Quantity is below the configured minimum of ${minimumQuantity.toFixed()}`,
      );
    }
    if (maximumQuantity !== null && quantity.greaterThan(maximumQuantity)) {
      throw new BillingPriceResolutionError(
        `Quantity exceeds the configured maximum of ${maximumQuantity.toFixed()}`,
      );
    }

    const candidates = await this.dependencies.pricing.listEffectiveRateCandidates({
      ...request,
      chargeCatalogItemId: catalog._id.toHexString(),
    }, session);
    const ranked = candidates.flatMap((candidate) => {
      const listScore = pricingSpecificityScore({
        payerOrganizationId: candidate.priceList.payerOrganizationId?.toHexString() ?? null,
        panelPlanId: candidate.priceList.panelPlanId?.toHexString() ?? null,
        patientCategoryCode: candidate.priceList.patientCategoryCode,
        payerCategoryCode: candidate.priceList.payerCategoryCode,
        departmentId: candidate.priceList.departmentId?.toHexString() ?? null,
        locationId: candidate.priceList.locationId?.toHexString() ?? null,
        billingContext: candidate.priceList.billingContext,
        afterHoursOnly: candidate.priceList.afterHoursOnly,
      }, request);
      const rateScore = pricingSpecificityScore({
        payerOrganizationId: candidate.serviceRate.payerOrganizationId?.toHexString() ?? null,
        panelPlanId: candidate.serviceRate.panelPlanId?.toHexString() ?? null,
        patientCategoryCode: candidate.serviceRate.patientCategoryCode,
        payerCategoryCode: candidate.serviceRate.payerCategoryCode,
        departmentId: candidate.serviceRate.departmentId?.toHexString() ?? null,
        locationId: candidate.serviceRate.locationId?.toHexString() ?? null,
        billingContext: candidate.serviceRate.billingContext,
        afterHoursOnly: candidate.serviceRate.afterHoursOnly,
      }, request);
      return listScore === null || rateScore === null
        ? []
        : [{ ...candidate, score: listScore + rateScore }];
    }).sort((left, right) =>
      right.score - left.score ||
      left.priceList.priority - right.priceList.priority ||
      right.serviceRate.effectiveFrom.getTime() - left.serviceRate.effectiveFrom.getTime() ||
      left.serviceRate._id.toHexString().localeCompare(right.serviceRate._id.toHexString()),
    );
    const selected = ranked[0];
    if (selected === undefined) {
      throw new BillingNoEffectivePriceError();
    }

    const original = decimal128ToDecimal(selected.serviceRate.amount);
    let authoritative = original;
    const lowerBounds = [
      selected.serviceRate.minimumAmount,
      catalog.minimumPrice,
    ].flatMap((value) => value === null ? [] : [decimal128ToDecimal(value)]);
    const upperBounds = [
      selected.serviceRate.maximumAmount,
      catalog.maximumPrice,
    ].flatMap((value) => value === null ? [] : [decimal128ToDecimal(value)]);
    for (const lower of lowerBounds) {
      authoritative = Decimal.max(authoritative, lower);
    }
    for (const upper of upperBounds) {
      authoritative = Decimal.min(authoritative, upper);
    }
    const effectiveTaxCategoryId = selected.serviceRate.taxCategoryId ?? catalog.taxCategoryId;
    const taxCategory = effectiveTaxCategoryId === null
      ? null
      : await this.dependencies.pricing.findTaxCategory(
          request.facilityId,
          effectiveTaxCategoryId.toHexString(),
          session,
        );
    if (
      taxCategory !== null &&
      (!taxCategory.active || !isBillingRecordEffective(
        taxCategory.effectiveFrom,
        taxCategory.effectiveThrough,
        request.at,
      ))
    ) {
      throw new BillingTaxCategoryNotFoundError();
    }

    return {
      catalog,
      catalogVersion,
      category,
      priceList: selected.priceList,
      serviceRate: selected.serviceRate,
      taxCategory,
      quantity: billingDecimal128(quantity.toFixed(), 'quantity'),
      originalUnitPrice: billingDecimal128(original.toFixed(), 'originalUnitPrice'),
      authoritativeUnitPrice: billingDecimal128(
        authoritative.toFixed(),
        'authoritativeUnitPrice',
      ),
      resolutionReason: [
        `Selected price list ${selected.priceList.code}`,
        `rate ${selected.serviceRate.rateCode}`,
        `specificity score ${selected.score}`,
        original.equals(authoritative)
          ? 'configured amount accepted'
          : 'configured amount constrained by minimum/maximum policy',
      ].join('; '),
    };
  }

  public toView(
    resolved: ResolvedPriceRecord,
    includeCost: boolean,
  ): ResolvedPriceView {
    return projectResolvedPrice(resolved, includeCost);
  }

  public async listTaxCategories(
    actor: UnifiedBillingActorContext,
    includeInactive = false,
  ) {
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'PRICING_READ',
    }));
    return this.dependencies.pricing.listTaxCategories(actor.facilityId, includeInactive);
  }

  public async listPriceLists(
    actor: UnifiedBillingActorContext,
    includeInactive = false,
  ) {
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'PRICING_READ',
    }));
    return this.dependencies.pricing.listPriceLists(actor.facilityId, includeInactive);
  }

  public async listServiceRates(
    actor: UnifiedBillingActorContext,
    priceListId?: string,
  ) {
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'PRICING_READ',
    }));
    return this.dependencies.pricing.listServiceRates(actor.facilityId, priceListId);
  }

  private priceListSnapshot(input: CreatePriceListInput) {
    return {
      code: normalizeBillingCode(input.code),
      name: normalizeBillingText(input.name),
      description: normalizeNullableBillingText(input.description),
      priceListType: input.priceListType,
      currency: 'PKR',
      patientCategoryCode: input.patientCategoryCode == null
        ? null
        : normalizeBillingCode(input.patientCategoryCode),
      payerCategoryCode: input.payerCategoryCode == null
        ? null
        : normalizeBillingCode(input.payerCategoryCode),
      payerOrganizationId: nullableBillingObjectId(
        input.payerOrganizationId,
        'payerOrganizationId',
      ),
      panelPlanId: nullableBillingObjectId(input.panelPlanId, 'panelPlanId'),
      departmentId: nullableBillingObjectId(input.departmentId, 'departmentId'),
      locationId: nullableBillingObjectId(input.locationId, 'locationId'),
      billingContext: input.billingContext ?? null,
      afterHoursOnly: input.afterHoursOnly ?? false,
      effectiveFrom: new Date(input.effectiveFrom),
      effectiveThrough: input.effectiveThrough == null
        ? null
        : new Date(input.effectiveThrough),
    } as const;
  }

  private async validatePriceListReferences(
    facilityId: string,
    input: CreatePriceListInput,
  ): Promise<void> {
    await Promise.all([
      requireReference(input.departmentId, 'Department', (id) =>
        this.dependencies.references.departmentExists(facilityId, id)),
      requireReference(input.locationId, 'Location', (id) =>
        this.dependencies.references.locationExists(facilityId, id)),
      requireReference(input.payerOrganizationId, 'Payer organization', (id) =>
        this.dependencies.references.payerOrganizationExists(facilityId, id)),
      requireReference(input.panelPlanId, 'Panel plan', (id) =>
        this.dependencies.references.panelPlanExists(
          facilityId,
          id,
          input.payerOrganizationId,
        )),
    ]);
    if (
      ['PAYER', 'CORPORATE', 'GOVERNMENT'].includes(input.priceListType) &&
      input.payerOrganizationId == null
    ) {
      throw new BillingChargeRuleViolationError(
        `${input.priceListType} price lists require a payer organization`,
      );
    }
  }

  private async appendAuditAndOutbox(
    actor: UnifiedBillingActorContext,
    staffId: string,
    transactionId: string,
    eventType: string,
    action: string,
    entityType: string,
    entityId: string,
    occurredAt: Date,
    before: unknown,
    after: unknown,
    session: Parameters<UnifiedBillingAuditPort['append']>[1],
    reason?: string,
  ): Promise<void> {
    await Promise.all([
      this.dependencies.audit.append({
        transactionId,
        deduplicationKey: `${transactionId}:audit:${action}:${entityId}`,
        action,
        entityType,
        entityId,
        actorUserId: actor.userId,
        actorStaffId: staffId,
        facilityId: actor.facilityId,
        correlationId: actor.correlationId,
        ...(actor.ipAddress === undefined ? {} : { ipAddress: actor.ipAddress }),
        ...(actor.userAgent === undefined ? {} : { userAgent: actor.userAgent }),
        occurredAt,
        ...(reason === undefined ? {} : { reason: normalizeBillingText(reason) }),
        ...(before === undefined ? {} : { before }),
        after,
      }, session),
      this.dependencies.outbox.enqueue({
        transactionId,
        deduplicationKey: `${transactionId}:outbox:${eventType}:${entityId}`,
        eventType,
        aggregateType: entityType,
        aggregateId: entityId,
        actorUserId: actor.userId,
        facilityId: actor.facilityId,
        correlationId: actor.correlationId,
        occurredAt,
        payload: { entityId, action },
      }, session),
    ]);
  }

  private async publishPricingChanged(
    facilityId: string,
    entityId: string,
    entityType: string,
  ): Promise<void> {
    await this.dependencies.realtime.publish({
      eventType: UNIFIED_BILLING_REALTIME_EVENTS.PRICING_CHANGED,
      facilityId,
      payload: { entityId, entityType },
    });
  }
}