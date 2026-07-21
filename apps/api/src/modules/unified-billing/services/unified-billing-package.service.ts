import Decimal from 'decimal.js';

import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  ChangeTreatmentPackageStatusInput,
  CreateTreatmentPackageInput,
  TreatmentPackageView,
  UnifiedBillingActorContext,
} from '../unified-billing.contracts.js';

import {
  UNIFIED_BILLING_EVENT_TYPES,
  UNIFIED_BILLING_LOCK_NAMESPACE,
  UNIFIED_BILLING_REALTIME_EVENTS,
  UNIFIED_BILLING_TRANSACTION_TYPES,
} from '../unified-billing.constants.js';

import {
  BillingAccessDeniedError,
  BillingChargeCatalogItemNotFoundError,
  BillingChargeRuleViolationError,
  BillingInvalidLifecycleTransitionError,
  BillingPackageConcurrencyError,
  BillingPriceListNotFoundError,
  BillingServiceRateNotFoundError,
  BillingTreatmentPackageNotFoundError,
} from '../unified-billing.errors.js';

import type {
  ChargeCatalogRepositoryPort,
  PriceListRepositoryPort,
  TreatmentPackageRepositoryPort,
  UnifiedBillingAccessPolicyPort,
  UnifiedBillingAuditPort,
  UnifiedBillingClockPort,
  UnifiedBillingContextPort,
  UnifiedBillingOutboxPort,
  UnifiedBillingRealtimePort,
  UnifiedBillingTransactionManagerPort,
} from '../unified-billing.ports.js';

import {
  projectTreatmentPackage,
} from '../unified-billing.projections.js';

import {
  allocatePackageAmounts,
  billingDecimal128,
  decimal128ToDecimal,
  deriveTreatmentPackageType,
  normalizeBillingCode,
  normalizeBillingText,
  normalizeNullableBillingText,
  unifiedBillingLockKey,
} from '../unified-billing.normalization.js';

export interface UnifiedBillingPackageCommandContext {
  actor: UnifiedBillingActorContext;
  idempotencyKey: string;
}

export interface UnifiedBillingPackageServiceDependencies {
  catalog: ChargeCatalogRepositoryPort;
  pricing: PriceListRepositoryPort;
  packages: TreatmentPackageRepositoryPort;
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
    throw new BillingPackageConcurrencyError();
  }
  return value;
}

export class UnifiedBillingPackageService {
  public constructor(
    private readonly dependencies: UnifiedBillingPackageServiceDependencies,
  ) {}

  public async createPackage(
    command: UnifiedBillingPackageCommandContext,
    input: CreateTreatmentPackageInput,
  ): Promise<TreatmentPackageView> {
    const { actor } = command;
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'PACKAGE_MANAGE',
    }));
    const staff = await this.dependencies.context.requireActiveActorStaff(actor);
    this.validateUniqueItems(input);
    const priceList = await this.dependencies.pricing.findPriceList(
      actor.facilityId,
      input.priceListId,
    );
    if (priceList === null || priceList.status !== 'ACTIVE') {
      throw new BillingPriceListNotFoundError();
    }
    const effectiveFrom = new Date(input.effectiveFrom);
    const preparedItems = await Promise.all(
      input.items
        .slice()
        .sort((left, right) => left.sequence - right.sequence)
        .map(async (item) => {
          const catalog = await this.dependencies.catalog.findCatalogItem(
            actor.facilityId,
            item.chargeCatalogItemId,
          );
          if (
            catalog === null ||
            catalog.status !== 'ACTIVE' ||
            catalog.latestVersionId === null
          ) {
            throw new BillingChargeCatalogItemNotFoundError();
          }
          const allocationRate = await this.dependencies.pricing.findCurrentServiceRate(
            actor.facilityId,
            item.chargeCatalogItemId,
            input.priceListId,
            effectiveFrom,
          );
          if (allocationRate === null) {
            throw new BillingServiceRateNotFoundError();
          }
          const overagePriceListId = item.overagePriceListId ?? input.priceListId;
          const overageRate = item.overageAllowed === false
            ? null
            : await this.dependencies.pricing.findCurrentServiceRate(
                actor.facilityId,
                item.chargeCatalogItemId,
                overagePriceListId,
                effectiveFrom,
              );
          if (item.overageAllowed !== false && overageRate === null) {
            throw new BillingServiceRateNotFoundError();
          }
          const quantity = new Decimal(item.includedQuantity);
          const weight = quantity.times(decimal128ToDecimal(allocationRate.amount));
          return {
            input: item,
            catalog,
            overageRate,
            weight,
          };
        }),
    );
    const allocations = allocatePackageAmounts(
      input.fixedPrice,
      preparedItems.map((item) => ({ weight: item.weight })),
    );
    const occurredAt = this.dependencies.clock.now();
    const result = await this.dependencies.transactionManager.execute({
      transactionType: UNIFIED_BILLING_TRANSACTION_TYPES.CREATE_PACKAGE,
      idempotencyKey: command.idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [unifiedBillingLockKey(
        UNIFIED_BILLING_LOCK_NAMESPACE.PACKAGE,
        actor.facilityId,
        normalizeBillingCode(input.packageCode),
      )],
      idempotencyPayload: input,
      journalPayload: { packageCode: normalizeBillingCode(input.packageCode) },
      execute: async (transaction) => {
        const created = await this.dependencies.packages.createPackage({
          facilityId: actor.facilityId,
          transactionId: transaction.transactionId,
          correlationId: actor.correlationId,
          createdBy: actor.userId,
          updatedBy: actor.userId,
          packageCode: normalizeBillingCode(input.packageCode),
          name: normalizeBillingText(input.name),
          description: normalizeNullableBillingText(input.description),
          priceListId: toObjectId(input.priceListId, 'priceListId'),
          packageType: deriveTreatmentPackageType(input),
          fixedPrice: billingDecimal128(input.fixedPrice, 'fixedPrice'),
          currency: 'PKR',
          validityDays: input.validityDays,
          payerOrganizationId: priceList.payerOrganizationId,
          panelPlanId: priceList.panelPlanId,
          patientCategoryCode: priceList.patientCategoryCode,
          billingContext: input.billingContext ?? priceList.billingContext,
          effectiveFrom,
          effectiveThrough: input.effectiveThrough == null
            ? null
            : new Date(input.effectiveThrough),
          status: 'DRAFT',
        }, transaction.session);
        const items = await this.dependencies.packages.insertItems(
          preparedItems.map((item, index) => ({
            facilityId: actor.facilityId,
            transactionId: transaction.transactionId,
            correlationId: actor.correlationId,
            createdBy: actor.userId,
            updatedBy: actor.userId,
            treatmentPackageId: created._id,
            lineNumber: item.input.sequence,
            chargeCatalogItemId: item.catalog._id,
            includedQuantity: billingDecimal128(
              item.input.includedQuantity,
              `items[${index}].includedQuantity`,
            ),
            overageAllowed: item.input.overageAllowed ?? true,
            overageRateId: item.overageRate?._id ?? null,
            allocationAmount: billingDecimal128(
              allocations[index]!,
              `items[${index}].allocationAmount`,
            ),
            requiredComponent: true,
            active: true,
          })),
          transaction.session,
        );
        const view = projectTreatmentPackage(created, items);
        await this.appendAuditAndOutbox(
          actor,
          staff.staffId,
          transaction.transactionId,
          'billing.package.created',
          view.id,
          occurredAt,
          undefined,
          view,
          transaction.session,
        );
        return view;
      },
    });

    await this.publishPackageChanged(actor.facilityId, result.id);
    return result;
  }

  public async changePackageStatus(
    command: UnifiedBillingPackageCommandContext,
    treatmentPackageId: string,
    input: ChangeTreatmentPackageStatusInput,
  ): Promise<TreatmentPackageView> {
    const { actor } = command;
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'PACKAGE_MANAGE',
    }));
    const staff = await this.dependencies.context.requireActiveActorStaff(actor);
    const occurredAt = this.dependencies.clock.now();
    const result = await this.dependencies.transactionManager.execute({
      transactionType: UNIFIED_BILLING_TRANSACTION_TYPES.CHANGE_PACKAGE_STATUS,
      idempotencyKey: command.idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [unifiedBillingLockKey(
        UNIFIED_BILLING_LOCK_NAMESPACE.PACKAGE,
        actor.facilityId,
        treatmentPackageId,
      )],
      idempotencyPayload: { treatmentPackageId, ...input },
      journalPayload: { treatmentPackageId, status: input.status },
      execute: async (transaction) => {
        const existing = await this.dependencies.packages.findPackage(
          actor.facilityId,
          treatmentPackageId,
          transaction.session,
        );
        if (existing === null) {
          throw new BillingTreatmentPackageNotFoundError();
        }
        this.assertStatusTransition(existing.status, input.status);
        const existingItems = await this.dependencies.packages.listItems(
          actor.facilityId,
          treatmentPackageId,
          transaction.session,
        );
        if (input.status === 'ACTIVE' && existingItems.length === 0) {
          throw new BillingChargeRuleViolationError(
            'A treatment package cannot be activated without components',
          );
        }
        const updated = requireUpdated(await this.dependencies.packages.updatePackage(
          actor.facilityId,
          treatmentPackageId,
          input.expectedVersion,
          {
            status: input.status,
            updatedBy: toObjectId(actor.userId, 'actor.userId'),
          },
          transaction.transactionId,
          actor.correlationId,
          transaction.session,
        ));
        const view = projectTreatmentPackage(updated, existingItems);
        await this.appendAuditAndOutbox(
          actor,
          staff.staffId,
          transaction.transactionId,
          'billing.package.status_changed',
          treatmentPackageId,
          occurredAt,
          projectTreatmentPackage(existing, existingItems),
          view,
          transaction.session,
          input.reason,
        );
        return view;
      },
    });

    await this.publishPackageChanged(actor.facilityId, result.id);
    return result;
  }

  public async getPackage(
    actor: UnifiedBillingActorContext,
    treatmentPackageId: string,
  ): Promise<TreatmentPackageView> {
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'PACKAGE_READ',
    }));
    const record = await this.dependencies.packages.findPackage(
      actor.facilityId,
      treatmentPackageId,
    );
    if (record === null) {
      throw new BillingTreatmentPackageNotFoundError();
    }
    const items = await this.dependencies.packages.listItems(
      actor.facilityId,
      treatmentPackageId,
    );
    return projectTreatmentPackage(record, items);
  }

  public async listPackages(
    actor: UnifiedBillingActorContext,
    includeInactive = false,
  ): Promise<TreatmentPackageView[]> {
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'PACKAGE_READ',
    }));
    return this.dependencies.packages.listPackages(
      actor.facilityId,
      includeInactive,
    );
  }

  private validateUniqueItems(input: CreateTreatmentPackageInput): void {
    const ids = new Set<string>();
    const sequences = new Set<number>();

    for (const item of input.items) {
      if (ids.has(item.chargeCatalogItemId)) {
        throw new BillingChargeRuleViolationError(
          'A treatment package cannot contain the same charge component twice',
        );
      }
      if (sequences.has(item.sequence)) {
        throw new BillingChargeRuleViolationError(
          'Treatment package component sequences must be unique',
        );
      }
      ids.add(item.chargeCatalogItemId);
      sequences.add(item.sequence);
    }
  }

  private assertStatusTransition(
    fromStatus: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'RETIRED',
    toStatus: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'RETIRED',
  ): void {
    const transitions = {
      DRAFT: ['ACTIVE', 'RETIRED'],
      ACTIVE: ['INACTIVE', 'RETIRED'],
      INACTIVE: ['ACTIVE', 'RETIRED'],
      RETIRED: [],
    } as const;

    if (
      fromStatus !== toStatus &&
      !(transitions[fromStatus] as readonly string[]).includes(toStatus)
    ) {
      throw new BillingInvalidLifecycleTransitionError(
        'Treatment package',
        fromStatus,
        toStatus,
      );
    }
  }

  private async appendAuditAndOutbox(
    actor: UnifiedBillingActorContext,
    staffId: string,
    transactionId: string,
    action: string,
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
        entityType: 'TreatmentPackage',
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
        deduplicationKey: `${transactionId}:outbox:${UNIFIED_BILLING_EVENT_TYPES.PACKAGE_CHANGED}:${entityId}`,
        eventType: UNIFIED_BILLING_EVENT_TYPES.PACKAGE_CHANGED,
        aggregateType: 'TreatmentPackage',
        aggregateId: entityId,
        actorUserId: actor.userId,
        facilityId: actor.facilityId,
        correlationId: actor.correlationId,
        occurredAt,
        payload: { entityId, action },
      }, session),
    ]);
  }

  private async publishPackageChanged(
    facilityId: string,
    packageId: string,
  ): Promise<void> {
    await this.dependencies.realtime.publish({
      eventType: UNIFIED_BILLING_REALTIME_EVENTS.PACKAGE_CHANGED,
      facilityId,
      payload: { packageId },
    });
  }
}