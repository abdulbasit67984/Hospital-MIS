import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  ActivateChargeCatalogVersionInput,
  ChangeChargeCatalogStatusInput,
  ChangeChargeCategoryStatusInput,
  ChangeChargeRuleStatusInput,
  ChargeCatalogItemView,
  ChargeCategoryView,
  ChargeRuleView,
  CreateChargeCatalogItemInput,
  CreateChargeCategoryInput,
  CreateChargeRuleInput,
  UnifiedBillingActorContext,
  UnifiedBillingCatalogListQuery,
  UpdateChargeCategoryInput,
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
  UnifiedBillingRealtimePort,
  UnifiedBillingReferenceDataPort,
  UnifiedBillingTransactionManagerPort,
} from '../unified-billing.ports.js';

import {
  projectChargeCatalogItem,
  projectChargeCategory,
  projectChargeRule,
} from '../unified-billing.projections.js';

import {
  billingDecimal128,
  normalizeBillingCode,
  normalizeBillingText,
  normalizeNullableBillingText,
  nullableBillingDecimal128,
  nullableBillingObjectId,
  unifiedBillingLockKey,
} from '../unified-billing.normalization.js';

export interface UnifiedBillingCatalogCommandContext {
  actor: UnifiedBillingActorContext;
  idempotencyKey: string;
}

export interface UnifiedBillingCatalogServiceDependencies {
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

function requireUpdated<T>(value: T | null): T {
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

export class UnifiedBillingCatalogService {
  public constructor(
    private readonly dependencies: UnifiedBillingCatalogServiceDependencies,
  ) {}

  public async createCategory(
    command: UnifiedBillingCatalogCommandContext,
    input: CreateChargeCategoryInput,
  ): Promise<ChargeCategoryView> {
    const { actor } = command;
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'CATALOG_MANAGE',
    }));
    const staff = await this.dependencies.context.requireActiveActorStaff(actor);
    await this.validateCategoryReferences(actor.facilityId, input);
    const occurredAt = this.dependencies.clock.now();
    const result = await this.dependencies.transactionManager.execute({
      transactionType: UNIFIED_BILLING_TRANSACTION_TYPES.CREATE_CATALOG_CATEGORY,
      idempotencyKey: command.idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        unifiedBillingLockKey(
          UNIFIED_BILLING_LOCK_NAMESPACE.CATALOG_CATEGORY,
          actor.facilityId,
          normalizeBillingCode(input.code),
        ),
      ],
      idempotencyPayload: input,
      journalPayload: { categoryCode: normalizeBillingCode(input.code) },
      execute: async (transaction) => {
        const created = await this.dependencies.catalog.createCategory({
          facilityId: actor.facilityId,
          transactionId: transaction.transactionId,
          correlationId: actor.correlationId,
          createdBy: actor.userId,
          updatedBy: actor.userId,
          code: normalizeBillingCode(input.code),
          parentCategoryId: nullableBillingObjectId(
            input.parentCategoryId,
            'parentCategoryId',
          ),
          name: normalizeBillingText(input.name),
          description: normalizeNullableBillingText(input.description),
          clinical: input.clinical ?? false,
          departmentId: nullableBillingObjectId(input.departmentId, 'departmentId'),
          serviceLineCode: input.serviceLineCode == null
            ? null
            : normalizeBillingCode(input.serviceLineCode),
          revenueAccountCode: input.revenueAccountCode == null
            ? null
            : normalizeBillingCode(input.revenueAccountCode),
          status: 'ACTIVE',
          activatedAt: occurredAt,
          activatedBy: toObjectId(actor.userId, 'actor.userId'),
          deactivatedAt: null,
          deactivatedBy: null,
          deactivationReason: null,
        }, transaction.session);
        const view = projectChargeCategory(created);

        await this.appendAuditAndOutbox(
          actor,
          staff.staffId,
          transaction.transactionId,
          UNIFIED_BILLING_EVENT_TYPES.CATALOG_CATEGORY_CHANGED,
          'billing.charge_category.created',
          'ChargeCategory',
          view.id,
          occurredAt,
          undefined,
          view,
          transaction.session,
        );
        return view;
      },
    });

    await this.publishCatalogChanged(actor.facilityId, result.id, 'CATEGORY');
    return result;
  }

  public async updateCategory(
    command: UnifiedBillingCatalogCommandContext,
    categoryId: string,
    input: UpdateChargeCategoryInput,
  ): Promise<ChargeCategoryView> {
    const { actor } = command;
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'CATALOG_MANAGE',
    }));
    const staff = await this.dependencies.context.requireActiveActorStaff(actor);
    await this.validateCategoryReferences(actor.facilityId, input, categoryId);
    const occurredAt = this.dependencies.clock.now();
    const result = await this.dependencies.transactionManager.execute({
      transactionType: UNIFIED_BILLING_TRANSACTION_TYPES.UPDATE_CATALOG_CATEGORY,
      idempotencyKey: command.idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [unifiedBillingLockKey(
        UNIFIED_BILLING_LOCK_NAMESPACE.CATALOG_CATEGORY,
        actor.facilityId,
        categoryId,
      )],
      idempotencyPayload: { categoryId, ...input },
      journalPayload: { categoryId },
      execute: async (transaction) => {
        const existing = await this.dependencies.catalog.findCategory(
          actor.facilityId,
          categoryId,
          transaction.session,
        );
        if (existing === null) {
          throw new BillingChargeCategoryNotFoundError();
        }
        if (existing.status === 'RETIRED') {
          throw new BillingFinalizedRecordImmutableError();
        }
        const before = projectChargeCategory(existing);
        const updated = requireUpdated(await this.dependencies.catalog.updateCategory(
          actor.facilityId,
          categoryId,
          input.expectedVersion,
          {
            ...(input.name === undefined
              ? {}
              : { name: normalizeBillingText(input.name) }),
            ...(input.description === undefined
              ? {}
              : { description: normalizeNullableBillingText(input.description) }),
            ...(input.parentCategoryId === undefined
              ? {}
              : { parentCategoryId: nullableBillingObjectId(input.parentCategoryId, 'parentCategoryId') }),
            ...(input.clinical === undefined ? {} : { clinical: input.clinical }),
            ...(input.departmentId === undefined
              ? {}
              : { departmentId: nullableBillingObjectId(input.departmentId, 'departmentId') }),
            ...(input.serviceLineCode === undefined
              ? {}
              : { serviceLineCode: input.serviceLineCode == null
                  ? null
                  : normalizeBillingCode(input.serviceLineCode) }),
            ...(input.revenueAccountCode === undefined
              ? {}
              : { revenueAccountCode: input.revenueAccountCode == null
                  ? null
                  : normalizeBillingCode(input.revenueAccountCode) }),
            updatedBy: toObjectId(actor.userId, 'actor.userId'),
          },
          transaction.transactionId,
          actor.correlationId,
          transaction.session,
        ));
        const after = projectChargeCategory(updated);
        await this.appendAuditAndOutbox(
          actor,
          staff.staffId,
          transaction.transactionId,
          UNIFIED_BILLING_EVENT_TYPES.CATALOG_CATEGORY_CHANGED,
          'billing.charge_category.updated',
          'ChargeCategory',
          categoryId,
          occurredAt,
          before,
          after,
          transaction.session,
        );
        return after;
      },
    });

    await this.publishCatalogChanged(actor.facilityId, result.id, 'CATEGORY');
    return result;
  }

  public async changeCategoryStatus(
    command: UnifiedBillingCatalogCommandContext,
    categoryId: string,
    input: ChangeChargeCategoryStatusInput,
  ): Promise<ChargeCategoryView> {
    const { actor } = command;
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'CATALOG_MANAGE',
    }));
    const staff = await this.dependencies.context.requireActiveActorStaff(actor);
    const occurredAt = this.dependencies.clock.now();
    const result = await this.dependencies.transactionManager.execute({
      transactionType: UNIFIED_BILLING_TRANSACTION_TYPES.CHANGE_CATALOG_CATEGORY_STATUS,
      idempotencyKey: command.idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [unifiedBillingLockKey(
        UNIFIED_BILLING_LOCK_NAMESPACE.CATALOG_CATEGORY,
        actor.facilityId,
        categoryId,
      )],
      idempotencyPayload: { categoryId, ...input },
      journalPayload: { categoryId, status: input.status },
      execute: async (transaction) => {
        const existing = await this.dependencies.catalog.findCategory(
          actor.facilityId,
          categoryId,
          transaction.session,
        );
        if (existing === null) {
          throw new BillingChargeCategoryNotFoundError();
        }
        if (existing.status === 'RETIRED' && input.status !== 'RETIRED') {
          throw new BillingInvalidLifecycleTransitionError(
            'Charge category',
            existing.status,
            input.status,
          );
        }
        const active = input.status === 'ACTIVE';
        const updated = requireUpdated(await this.dependencies.catalog.updateCategory(
          actor.facilityId,
          categoryId,
          input.expectedVersion,
          {
            status: input.status,
            deactivatedAt: active ? null : occurredAt,
            deactivatedBy: active ? null : toObjectId(actor.userId, 'actor.userId'),
            deactivationReason: active ? null : normalizeBillingText(input.reason),
            updatedBy: toObjectId(actor.userId, 'actor.userId'),
          },
          transaction.transactionId,
          actor.correlationId,
          transaction.session,
        ));
        const view = projectChargeCategory(updated);
        await this.appendAuditAndOutbox(
          actor,
          staff.staffId,
          transaction.transactionId,
          UNIFIED_BILLING_EVENT_TYPES.CATALOG_CATEGORY_CHANGED,
          'billing.charge_category.status_changed',
          'ChargeCategory',
          categoryId,
          occurredAt,
          projectChargeCategory(existing),
          view,
          transaction.session,
          input.reason,
        );
        return view;
      },
    });

    await this.publishCatalogChanged(actor.facilityId, result.id, 'CATEGORY');
    return result;
  }

  public async createCatalogItem(
    command: UnifiedBillingCatalogCommandContext,
    input: CreateChargeCatalogItemInput,
  ): Promise<ChargeCatalogItemView> {
    const { actor } = command;
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'CATALOG_MANAGE',
      includeCost: true,
    }));
    const staff = await this.dependencies.context.requireActiveActorStaff(actor);
    await this.validateCatalogReferences(actor.facilityId, input);
    const occurredAt = this.dependencies.clock.now();
    const result = await this.dependencies.transactionManager.execute({
      transactionType: UNIFIED_BILLING_TRANSACTION_TYPES.CREATE_CATALOG_ITEM,
      idempotencyKey: command.idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [unifiedBillingLockKey(
        UNIFIED_BILLING_LOCK_NAMESPACE.CATALOG_ITEM,
        actor.facilityId,
        normalizeBillingCode(input.chargeCode),
      )],
      idempotencyPayload: input,
      journalPayload: { chargeCode: normalizeBillingCode(input.chargeCode) },
      execute: async (transaction) => {
        const created = await this.dependencies.catalog.createCatalogItem({
          facilityId: actor.facilityId,
          transactionId: transaction.transactionId,
          correlationId: actor.correlationId,
          createdBy: actor.userId,
          updatedBy: actor.userId,
          ...this.catalogSnapshot(input),
          status: 'DRAFT',
          currentVersion: 0,
          latestVersionId: null,
          activatedAt: null,
          activatedBy: null,
          deactivatedAt: null,
          deactivatedBy: null,
          deactivationReason: null,
          retiredAt: null,
          retiredBy: null,
          retirementReason: null,
        }, transaction.session);
        const view = projectChargeCatalogItem(created, true);
        await this.appendAuditAndOutbox(
          actor,
          staff.staffId,
          transaction.transactionId,
          UNIFIED_BILLING_EVENT_TYPES.CATALOG_CREATED,
          'billing.charge_catalog.created',
          'ChargeCatalog',
          view.id,
          occurredAt,
          undefined,
          projectChargeCatalogItem(created, false),
          transaction.session,
        );
        return view;
      },
    });

    await this.publishCatalogChanged(actor.facilityId, result.id, 'CATALOG_ITEM');
    return result;
  }

  public async activateCatalogVersion(
    command: UnifiedBillingCatalogCommandContext,
    catalogItemId: string,
    input: ActivateChargeCatalogVersionInput,
  ): Promise<ChargeCatalogItemView> {
    const { actor } = command;
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'CATALOG_MANAGE',
      includeCost: true,
    }));
    const staff = await this.dependencies.context.requireActiveActorStaff(actor);
    await this.validateCatalogReferences(actor.facilityId, input);
    const occurredAt = this.dependencies.clock.now();
    const result = await this.dependencies.transactionManager.execute({
      transactionType: UNIFIED_BILLING_TRANSACTION_TYPES.ACTIVATE_CATALOG_VERSION,
      idempotencyKey: command.idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [unifiedBillingLockKey(
        UNIFIED_BILLING_LOCK_NAMESPACE.CATALOG_ITEM,
        actor.facilityId,
        catalogItemId,
      )],
      idempotencyPayload: { catalogItemId, ...input },
      journalPayload: { catalogItemId },
      execute: async (transaction) => {
        const existing = await this.dependencies.catalog.findCatalogItem(
          actor.facilityId,
          catalogItemId,
          { includeCost: true, session: transaction.session },
        );
        if (existing === null) {
          throw new BillingChargeCatalogItemNotFoundError();
        }
        if (existing.status === 'RETIRED') {
          throw new BillingFinalizedRecordImmutableError();
        }
        if (normalizeBillingCode(input.chargeCode) !== existing.chargeCode) {
          throw new BillingChargeRuleViolationError(
            'A charge code is immutable after catalog creation',
          );
        }
        const snapshot = this.catalogSnapshot(input);
        const nextVersion = existing.currentVersion + 1;
        const version = await this.dependencies.catalog.createCatalogVersion({
          facilityId: actor.facilityId,
          transactionId: transaction.transactionId,
          correlationId: actor.correlationId,
          createdBy: actor.userId,
          updatedBy: actor.userId,
          chargeCatalogItemId: existing._id,
          versionNumber: nextVersion,
          ...snapshot,
          statusSnapshot: 'ACTIVE',
          changeReason: normalizeBillingText(input.changeReason),
          recordedAt: occurredAt,
          recordedBy: toObjectId(actor.userId, 'actor.userId'),
        }, transaction.session);
        const updated = requireUpdated(await this.dependencies.catalog.updateCatalogItem(
          actor.facilityId,
          catalogItemId,
          input.expectedVersion,
          {
            ...snapshot,
            status: 'ACTIVE',
            currentVersion: nextVersion,
            latestVersionId: version._id,
            activatedAt: occurredAt,
            activatedBy: toObjectId(actor.userId, 'actor.userId'),
            deactivatedAt: null,
            deactivatedBy: null,
            deactivationReason: null,
            retiredAt: null,
            retiredBy: null,
            retirementReason: null,
            updatedBy: toObjectId(actor.userId, 'actor.userId'),
          },
          transaction.transactionId,
          actor.correlationId,
          transaction.session,
        ));
        const view = projectChargeCatalogItem(updated, true);
        await this.appendAuditAndOutbox(
          actor,
          staff.staffId,
          transaction.transactionId,
          UNIFIED_BILLING_EVENT_TYPES.CATALOG_VERSION_ACTIVATED,
          'billing.charge_catalog.version_activated',
          'ChargeCatalog',
          catalogItemId,
          occurredAt,
          projectChargeCatalogItem(existing, false),
          projectChargeCatalogItem(updated, false),
          transaction.session,
          input.changeReason,
        );
        return view;
      },
    });

    await this.publishCatalogChanged(actor.facilityId, result.id, 'CATALOG_ITEM');
    return result;
  }

  public async changeCatalogStatus(
    command: UnifiedBillingCatalogCommandContext,
    catalogItemId: string,
    input: ChangeChargeCatalogStatusInput,
  ): Promise<ChargeCatalogItemView> {
    const { actor } = command;
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'CATALOG_MANAGE',
      includeCost: true,
    }));
    const staff = await this.dependencies.context.requireActiveActorStaff(actor);
    const occurredAt = this.dependencies.clock.now();
    const result = await this.dependencies.transactionManager.execute({
      transactionType: UNIFIED_BILLING_TRANSACTION_TYPES.CHANGE_CATALOG_STATUS,
      idempotencyKey: command.idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [unifiedBillingLockKey(
        UNIFIED_BILLING_LOCK_NAMESPACE.CATALOG_ITEM,
        actor.facilityId,
        catalogItemId,
      )],
      idempotencyPayload: { catalogItemId, ...input },
      journalPayload: { catalogItemId, status: input.status },
      execute: async (transaction) => {
        const existing = await this.dependencies.catalog.findCatalogItem(
          actor.facilityId,
          catalogItemId,
          { includeCost: true, session: transaction.session },
        );
        if (existing === null) {
          throw new BillingChargeCatalogItemNotFoundError();
        }
        if (existing.status === 'RETIRED' && input.status !== 'RETIRED') {
          throw new BillingInvalidLifecycleTransitionError(
            'Charge catalog item',
            existing.status,
            input.status,
          );
        }
        if (input.status === 'ACTIVE' && existing.currentVersion < 1) {
          throw new BillingChargeRuleViolationError(
            'A draft catalog item must be activated through an immutable version',
          );
        }
        const actorId = toObjectId(actor.userId, 'actor.userId');
        const update = input.status === 'ACTIVE'
          ? {
              status: input.status,
              activatedAt: occurredAt,
              activatedBy: actorId,
              deactivatedAt: null,
              deactivatedBy: null,
              deactivationReason: null,
              retiredAt: null,
              retiredBy: null,
              retirementReason: null,
            }
          : input.status === 'INACTIVE'
            ? {
                status: input.status,
                deactivatedAt: occurredAt,
                deactivatedBy: actorId,
                deactivationReason: normalizeBillingText(input.reason),
              }
            : input.status === 'RETIRED'
              ? {
                  status: input.status,
                  retiredAt: occurredAt,
                  retiredBy: actorId,
                  retirementReason: normalizeBillingText(input.reason),
                }
              : { status: input.status };
        const updated = requireUpdated(await this.dependencies.catalog.updateCatalogItem(
          actor.facilityId,
          catalogItemId,
          input.expectedVersion,
          { ...update, updatedBy: actorId },
          transaction.transactionId,
          actor.correlationId,
          transaction.session,
        ));
        const view = projectChargeCatalogItem(updated, true);
        await this.appendAuditAndOutbox(
          actor,
          staff.staffId,
          transaction.transactionId,
          UNIFIED_BILLING_EVENT_TYPES.CATALOG_STATUS_CHANGED,
          'billing.charge_catalog.status_changed',
          'ChargeCatalog',
          catalogItemId,
          occurredAt,
          projectChargeCatalogItem(existing, false),
          projectChargeCatalogItem(updated, false),
          transaction.session,
          input.reason,
        );
        return view;
      },
    });

    await this.publishCatalogChanged(actor.facilityId, result.id, 'CATALOG_ITEM');
    return result;
  }

  public async createRule(
    command: UnifiedBillingCatalogCommandContext,
    input: CreateChargeRuleInput,
  ): Promise<ChargeRuleView> {
    const { actor } = command;
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'CATALOG_MANAGE',
    }));
    const staff = await this.dependencies.context.requireActiveActorStaff(actor);
    const source = await this.dependencies.catalog.findCatalogItem(
      actor.facilityId,
      input.chargeCatalogItemId,
    );
    if (source === null) {
      throw new BillingChargeCatalogItemNotFoundError();
    }
    if (input.relatedChargeCatalogItemId != null) {
      const related = await this.dependencies.catalog.findCatalogItem(
        actor.facilityId,
        input.relatedChargeCatalogItemId,
      );
      if (related === null) {
        throw new BillingChargeCatalogItemNotFoundError();
      }
      if (related._id.equals(source._id)) {
        throw new BillingChargeRuleViolationError(
          'A charge rule cannot reference the same item as its related item',
        );
      }
    }
    const occurredAt = this.dependencies.clock.now();
    const result = await this.dependencies.transactionManager.execute({
      transactionType: UNIFIED_BILLING_TRANSACTION_TYPES.CREATE_CATALOG_RULE,
      idempotencyKey: command.idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [unifiedBillingLockKey(
        UNIFIED_BILLING_LOCK_NAMESPACE.CATALOG_RULE,
        actor.facilityId,
        normalizeBillingCode(input.ruleCode),
      )],
      idempotencyPayload: input,
      journalPayload: { ruleCode: normalizeBillingCode(input.ruleCode) },
      execute: async (transaction) => {
        const created = await this.dependencies.catalog.createRule({
          facilityId: actor.facilityId,
          transactionId: transaction.transactionId,
          correlationId: actor.correlationId,
          createdBy: actor.userId,
          updatedBy: actor.userId,
          ruleCode: normalizeBillingCode(input.ruleCode),
          chargeCatalogItemId: toObjectId(input.chargeCatalogItemId, 'chargeCatalogItemId'),
          ruleType: input.ruleType,
          relatedChargeCatalogItemId: nullableBillingObjectId(
            input.relatedChargeCatalogItemId,
            'relatedChargeCatalogItemId',
          ),
          thresholdQuantity: nullableBillingDecimal128(
            input.thresholdQuantity,
            'thresholdQuantity',
          ),
          thresholdAmount: nullableBillingDecimal128(
            input.thresholdAmount,
            'thresholdAmount',
          ),
          effectiveFrom: new Date(input.effectiveFrom),
          effectiveThrough: input.effectiveThrough == null
            ? null
            : new Date(input.effectiveThrough),
          active: true,
          reason: normalizeBillingText(input.reason),
        }, transaction.session);
        const view = projectChargeRule(created);
        await this.appendAuditAndOutbox(
          actor,
          staff.staffId,
          transaction.transactionId,
          UNIFIED_BILLING_EVENT_TYPES.CATALOG_RULE_CHANGED,
          'billing.charge_rule.created',
          'ChargeRule',
          view.id,
          occurredAt,
          undefined,
          view,
          transaction.session,
          input.reason,
        );
        return view;
      },
    });

    await this.publishCatalogChanged(actor.facilityId, result.id, 'RULE');
    return result;
  }

  public async changeRuleStatus(
    command: UnifiedBillingCatalogCommandContext,
    ruleId: string,
    input: ChangeChargeRuleStatusInput,
  ): Promise<ChargeRuleView> {
    const { actor } = command;
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'CATALOG_MANAGE',
    }));
    const staff = await this.dependencies.context.requireActiveActorStaff(actor);
    const occurredAt = this.dependencies.clock.now();
    const result = await this.dependencies.transactionManager.execute({
      transactionType: UNIFIED_BILLING_TRANSACTION_TYPES.CHANGE_CATALOG_RULE_STATUS,
      idempotencyKey: command.idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [unifiedBillingLockKey(
        UNIFIED_BILLING_LOCK_NAMESPACE.CATALOG_RULE,
        actor.facilityId,
        ruleId,
      )],
      idempotencyPayload: { ruleId, ...input },
      journalPayload: { ruleId, active: input.active },
      execute: async (transaction) => {
        const existing = await this.dependencies.catalog.findRule(
          actor.facilityId,
          ruleId,
          transaction.session,
        );
        if (existing === null) {
          throw new BillingChargeRuleViolationError('Charge rule was not found');
        }
        const updated = requireUpdated(await this.dependencies.catalog.updateRule(
          actor.facilityId,
          ruleId,
          input.expectedVersion,
          {
            active: input.active,
            reason: normalizeBillingText(input.reason),
            updatedBy: toObjectId(actor.userId, 'actor.userId'),
          },
          transaction.transactionId,
          actor.correlationId,
          transaction.session,
        ));
        const view = projectChargeRule(updated);
        await this.appendAuditAndOutbox(
          actor,
          staff.staffId,
          transaction.transactionId,
          UNIFIED_BILLING_EVENT_TYPES.CATALOG_RULE_CHANGED,
          'billing.charge_rule.status_changed',
          'ChargeRule',
          ruleId,
          occurredAt,
          projectChargeRule(existing),
          view,
          transaction.session,
          input.reason,
        );
        return view;
      },
    });

    await this.publishCatalogChanged(actor.facilityId, result.id, 'RULE');
    return result;
  }

  public async listCatalog(
    actor: UnifiedBillingActorContext,
    query: UnifiedBillingCatalogListQuery,
  ) {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'CATALOG_READ',
      includeCost: query.includeCost === true,
    });
    requireAllowed(decision);
    return this.dependencies.catalog.listCatalog(
      actor.facilityId,
      query,
      query.includeCost === true && decision.includeCost,
    );
  }

  public async listCategories(
    actor: UnifiedBillingActorContext,
    includeInactive = false,
  ) {
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'CATALOG_READ',
    }));
    return this.dependencies.catalog.listCategories(actor.facilityId, includeInactive);
  }

  public async listRules(
    actor: UnifiedBillingActorContext,
    catalogItemId: string,
    at?: Date,
  ) {
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'CATALOG_READ',
    }));
    return this.dependencies.catalog.listRules(actor.facilityId, catalogItemId, at);
  }

  private catalogSnapshot(
    input: CreateChargeCatalogItemInput,
  ) {
    return {
      chargeCode: normalizeBillingCode(input.chargeCode),
      serviceCode: normalizeBillingCode(input.serviceCode),
      name: normalizeBillingText(input.name),
      description: normalizeNullableBillingText(input.description),
      categoryId: toObjectId(input.categoryId, 'categoryId'),
      chargeType: input.chargeType,
      clinical: input.clinical ?? false,
      departmentId: nullableBillingObjectId(input.departmentId, 'departmentId'),
      serviceLineCode: input.serviceLineCode == null
        ? null
        : normalizeBillingCode(input.serviceLineCode),
      revenueAccountCode: input.revenueAccountCode == null
        ? null
        : normalizeBillingCode(input.revenueAccountCode),
      ledgerAccountId: nullableBillingObjectId(input.ledgerAccountId, 'ledgerAccountId'),
      taxCategoryId: nullableBillingObjectId(input.taxCategoryId, 'taxCategoryId'),
      unitOfMeasureId: nullableBillingObjectId(input.unitOfMeasureId, 'unitOfMeasureId'),
      defaultQuantity: billingDecimal128(input.defaultQuantity ?? '1', 'defaultQuantity'),
      minimumQuantity: nullableBillingDecimal128(input.minimumQuantity, 'minimumQuantity'),
      maximumQuantity: nullableBillingDecimal128(input.maximumQuantity, 'maximumQuantity'),
      minimumPrice: nullableBillingDecimal128(input.minimumPrice, 'minimumPrice'),
      maximumPrice: nullableBillingDecimal128(input.maximumPrice, 'maximumPrice'),
      costAmount: billingDecimal128(input.costAmount ?? '0', 'costAmount'),
      manualPostingAllowed: input.manualPostingAllowed ?? false,
      recurringChargeAllowed: input.recurringChargeAllowed ?? false,
      timeBasedCharge: input.timeBasedCharge ?? false,
      effectiveFrom: new Date(input.effectiveFrom),
      effectiveThrough: input.effectiveThrough == null
        ? null
        : new Date(input.effectiveThrough),
    } as const;
  }

  private async validateCategoryReferences(
    facilityId: string,
    input: Pick<
      CreateChargeCategoryInput | UpdateChargeCategoryInput,
      'parentCategoryId' | 'departmentId'
    >,
    currentCategoryId?: string,
  ): Promise<void> {
    if (input.parentCategoryId != null) {
      if (input.parentCategoryId === currentCategoryId) {
        throw new BillingChargeRuleViolationError(
          'A category cannot be its own parent',
        );
      }
      const parent = await this.dependencies.catalog.findCategory(
        facilityId,
        input.parentCategoryId,
      );
      if (parent === null || parent.status !== 'ACTIVE') {
        throw new BillingChargeCategoryNotFoundError();
      }
    }
    await requireReference(
      input.departmentId,
      'Department',
      (id) => this.dependencies.references.departmentExists(facilityId, id),
    );
  }

  private async validateCatalogReferences(
    facilityId: string,
    input: CreateChargeCatalogItemInput,
  ): Promise<void> {
    const category = await this.dependencies.catalog.findCategory(
      facilityId,
      input.categoryId,
    );
    if (category === null || category.status !== 'ACTIVE') {
      throw new BillingChargeCategoryNotFoundError();
    }
    if (input.taxCategoryId != null) {
      const tax = await this.dependencies.pricing.findTaxCategory(
        facilityId,
        input.taxCategoryId,
      );
      if (tax === null || !tax.active) {
        throw new BillingTaxCategoryNotFoundError();
      }
    }
    await Promise.all([
      requireReference(input.departmentId, 'Department', (id) =>
        this.dependencies.references.departmentExists(facilityId, id)),
      requireReference(input.unitOfMeasureId, 'Unit of measure', (id) =>
        this.dependencies.references.unitOfMeasureExists(facilityId, id)),
      requireReference(input.ledgerAccountId, 'Ledger account', (id) =>
        this.dependencies.references.ledgerAccountExists(facilityId, id)),
    ]);
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

  private async publishCatalogChanged(
    facilityId: string,
    entityId: string,
    entityType: string,
  ): Promise<void> {
    await this.dependencies.realtime.publish({
      eventType: UNIFIED_BILLING_REALTIME_EVENTS.CATALOG_CHANGED,
      facilityId,
      payload: { entityId, entityType },
    });
  }
}