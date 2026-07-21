import Decimal from 'decimal.js';

import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  CreateInvoiceInput,
  FinalizeInvoiceInput,
  InvoiceView,
  UnifiedBillingActorContext,
  UnifiedBillingInvoiceListQuery,
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
  BillingInvoiceConcurrencyError,
  BillingInvoiceNotFoundError,
  BillingInvalidLifecycleTransitionError,
  BillingPatientAccountConcurrencyError,
  BillingPatientAccountNotFoundError,
} from '../unified-billing.errors.js';

import type {
  AccountChargeRepositoryPort,
  InvoiceRepositoryPort,
  PatientAccountRepositoryPort,
  UnifiedBillingAccessPolicyPort,
  UnifiedBillingAuditPort,
  UnifiedBillingClockPort,
  UnifiedBillingContextPort,
  UnifiedBillingOutboxPort,
  UnifiedBillingRealtimePort,
  UnifiedBillingSequencePort,
  UnifiedBillingTransactionManagerPort,
} from '../unified-billing.ports.js';

import type {
  AccountChargeRecord,
  BillingMoneyRecord,
  InvoiceLineRecord,
  InvoiceRecord,
} from '../unified-billing.persistence.types.js';

import {
  projectInvoice,
} from '../unified-billing.projections.js';

import {
  billingDecimal128,
  decimal128ToDecimal,
  normalizeBillingText,
  unifiedBillingLockKey,
} from '../unified-billing.normalization.js';

export interface UnifiedBillingInvoiceCommandContext {
  actor: UnifiedBillingActorContext;
  idempotencyKey: string;
}

export interface UnifiedBillingInvoiceServiceDependencies {
  accounts: PatientAccountRepositoryPort;
  charges: AccountChargeRepositoryPort;
  invoices: InvoiceRepositoryPort;
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

function formatInvoiceNumber(year: number, value: number): string {
  return `INV-${year}-${String(value).padStart(DEFAULT_BILLING_NUMBER_WIDTH, '0')}`;
}

function sumMoney(
  charges: readonly AccountChargeRecord[],
  field: keyof BillingMoneyRecord,
): Decimal {
  return charges.reduce(
    (total, charge) => total.plus(charge[field].toString()),
    new Decimal(0),
  );
}

function taxSummary(charges: readonly AccountChargeRecord[]) {
  const grouped = new Map<string, {
    taxCategoryId: AccountChargeRecord['taxCategoryId'];
    taxCodeSnapshot: string;
    taxableAmount: Decimal;
    taxAmount: Decimal;
  }>();
  for (const charge of charges) {
    const key = charge.taxCategoryId?.toHexString() ?? 'EXEMPT';
    const current = grouped.get(key) ?? {
      taxCategoryId: charge.taxCategoryId,
      taxCodeSnapshot: charge.taxCategoryCodeSnapshot ?? 'EXEMPT',
      taxableAmount: new Decimal(0),
      taxAmount: new Decimal(0),
    };
    current.taxableAmount = current.taxableAmount.plus(charge.grossAmount.toString());
    current.taxAmount = current.taxAmount.plus(charge.taxAmount.toString());
    grouped.set(key, current);
  }
  return [...grouped.values()].map((item) => ({
    taxCategoryId: item.taxCategoryId,
    taxCodeSnapshot: item.taxCodeSnapshot,
    taxableAmount: billingDecimal128(item.taxableAmount.toFixed(), 'taxableAmount'),
    taxAmount: billingDecimal128(item.taxAmount.toFixed(), 'taxAmount'),
  }));
}

export class UnifiedBillingInvoiceService {
  public constructor(
    private readonly dependencies: UnifiedBillingInvoiceServiceDependencies,
  ) {}

  public async createInvoice(
    command: UnifiedBillingInvoiceCommandContext,
    input: CreateInvoiceInput,
  ): Promise<InvoiceView> {
    const { actor } = command;
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'INVOICE_CREATE',
    }));
    const staff = await this.dependencies.context.requireActiveActorStaff(actor);
    const now = this.dependencies.clock.now();
    const result = await this.dependencies.transactionManager.execute({
      transactionType: UNIFIED_BILLING_TRANSACTION_TYPES.CREATE_INVOICE,
      idempotencyKey: command.idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [unifiedBillingLockKey(
        UNIFIED_BILLING_LOCK_NAMESPACE.INVOICE,
        actor.facilityId,
        input.patientAccountId,
      )],
      idempotencyPayload: input,
      journalPayload: {
        patientAccountId: input.patientAccountId,
        invoiceType: input.invoiceType,
      },
      execute: async (transaction) => {
        const account = await this.dependencies.accounts.findById(
          actor.facilityId,
          input.patientAccountId,
          transaction.session,
        );
        if (account === null) {
          throw new BillingPatientAccountNotFoundError();
        }
        if (account.status !== 'OPEN' || account.lockedAt !== null) {
          throw new BillingAccountLockedError();
        }
        const charges = await this.dependencies.charges.listPostedUninvoiced(
          actor.facilityId,
          input.patientAccountId,
          input.chargeIds,
          transaction.session,
        );
        if (charges.length === 0) {
          throw new BillingInvalidLifecycleTransitionError(
            'Invoice',
            'EMPTY',
            'DRAFT',
          );
        }
        if (
          input.chargeIds !== undefined &&
          new Set(charges.map((charge) => charge._id.toHexString())).size !==
            new Set(input.chargeIds).size
        ) {
          throw new BillingInvalidLifecycleTransitionError(
            'InvoiceChargeSelection',
            'INVALID',
            'DRAFT',
          );
        }
        const allocation = await this.dependencies.sequence.next(
          actor.facilityId,
          UNIFIED_BILLING_NUMBER_SEQUENCE_NAMESPACE.INVOICE,
        );
        const gross = sumMoney(charges, 'grossAmount');
        const discount = sumMoney(charges, 'discountAmount');
        const tax = sumMoney(charges, 'taxAmount');
        const welfare = sumMoney(charges, 'welfareAmount');
        const payer = sumMoney(charges, 'payerAmount');
        const patient = sumMoney(charges, 'patientAmount');
        const net = sumMoney(charges, 'netAmount');
        const zero = billingDecimal128('0', 'zero');
        const invoice = await this.dependencies.invoices.create({
          facilityId: actor.facilityId,
          transactionId: transaction.transactionId,
          correlationId: actor.correlationId,
          createdBy: actor.userId,
          updatedBy: actor.userId,
          invoiceNumber: formatInvoiceNumber(now.getUTCFullYear(), allocation.value),
          patientAccountId: account._id,
          patientId: account.patientId,
          invoiceType: input.invoiceType,
          currency: BILLING_CURRENCY,
          status: 'DRAFT',
          lineCount: charges.length,
          grossAmount: billingDecimal128(gross.toFixed(), 'grossAmount'),
          discountAmount: billingDecimal128(discount.toFixed(), 'discountAmount'),
          taxAmount: billingDecimal128(tax.toFixed(), 'taxAmount'),
          welfareAmount: billingDecimal128(welfare.toFixed(), 'welfareAmount'),
          payerAmount: billingDecimal128(payer.toFixed(), 'payerAmount'),
          patientAmount: billingDecimal128(patient.toFixed(), 'patientAmount'),
          netAmount: billingDecimal128(net.toFixed(), 'netAmount'),
          paymentsAppliedAmount: zero,
          creditsAppliedAmount: zero,
          outstandingAmount: billingDecimal128(patient.toFixed(), 'outstandingAmount'),
          refundableAmount: zero,
          issuedAt: null,
          finalizedAt: null,
          finalizedBy: null,
          lockedAccountVersion: null,
          cancelledAt: null,
          cancelledBy: null,
          cancellationReason: null,
          originalInvoiceId: null,
          replacementInvoiceId: null,
          taxSummary: taxSummary(charges),
          discountIds: [],
          creditNoteIds: [],
          debitNoteIds: [],
          printableSnapshotVersion: 0,
        }, transaction.session);
        const lineInputs: Omit<InvoiceLineRecord, '_id'>[] = charges.map(
          (charge, index) => ({
            facilityId: toObjectId(actor.facilityId, 'facilityId'),
            version: 0,
            transactionId: transaction.transactionId,
            correlationId: actor.correlationId,
            createdBy: toObjectId(actor.userId, 'actor.userId'),
            updatedBy: toObjectId(actor.userId, 'actor.userId'),
            createdAt: now,
            updatedAt: now,
            invoiceId: invoice._id,
            patientAccountId: account._id,
            accountChargeId: charge._id,
            lineNumber: index + 1,
            sourceModuleSnapshot: charge.source.sourceModule,
            sourceRecordTypeSnapshot: charge.source.sourceRecordType,
            sourceRecordId: charge.source.sourceRecordId,
            sourceLineId: charge.source.sourceLineId,
            chargeCatalogItemId: charge.chargeCatalogItemId,
            chargeCatalogVersionId: charge.chargeCatalogVersionId,
            priceListId: charge.priceListId,
            priceListVersionId: charge.priceListVersionId,
            serviceRateId: charge.serviceRateId,
            chargeCodeSnapshot: charge.chargeCodeSnapshot,
            serviceCodeSnapshot: charge.serviceCodeSnapshot,
            chargeNameSnapshot: charge.chargeNameSnapshot,
            categoryCodeSnapshot: charge.categoryCodeSnapshot,
            departmentId: charge.departmentId,
            serviceLineCodeSnapshot: charge.serviceLineCodeSnapshot,
            quantity: charge.quantity,
            originalRate: charge.originalUnitPrice,
            authoritativeRate: charge.authoritativeUnitPrice,
            currency: BILLING_CURRENCY,
            grossAmount: charge.grossAmount,
            discountAmount: charge.discountAmount,
            taxAmount: charge.taxAmount,
            welfareAmount: charge.welfareAmount,
            payerAmount: charge.payerAmount,
            patientAmount: charge.patientAmount,
            netAmount: charge.netAmount,
            packageEnrollmentId: charge.packageEnrollmentId,
            payerOrganizationId: charge.payerOrganizationId,
            patientCoverageId: charge.patientCoverageId,
            taxCategoryCodeSnapshot: charge.taxCategoryCodeSnapshot,
            discountIds: [],
          }),
        );
        const lines = await this.dependencies.invoices.insertLines(
          lineInputs,
          transaction.session,
        );
        await this.dependencies.invoices.appendStatusHistory({
          facilityId: actor.facilityId,
          invoiceId: invoice._id.toHexString(),
          action: 'CREATED',
          fromStatus: null,
          toStatus: 'DRAFT',
          invoiceVersion: invoice.version,
          reason: 'Invoice created from posted account charges',
          originalInvoiceId: null,
          replacementInvoiceId: null,
          changedAt: now,
          changedBy: actor.userId,
          createdBy: actor.userId,
          updatedBy: actor.userId,
          transactionId: transaction.transactionId,
          correlationId: actor.correlationId,
        }, transaction.session);
        const view = projectInvoice(invoice, lines);
        await this.appendAuditAndOutbox(
          actor,
          staff.staffId,
          transaction.transactionId,
          UNIFIED_BILLING_EVENT_TYPES.INVOICE_CREATED,
          'billing.invoice.created',
          view.id,
          now,
          view,
          transaction.session,
        );
        return view;
      },
    });
    await this.publishChanged(actor.facilityId, result.patientAccountId, result.id);
    return result;
  }

  public async finalizeInvoice(
    command: UnifiedBillingInvoiceCommandContext,
    invoiceId: string,
    input: FinalizeInvoiceInput,
  ): Promise<InvoiceView> {
    const { actor } = command;
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'INVOICE_FINALIZE',
    }));
    const staff = await this.dependencies.context.requireActiveActorStaff(actor);
    const now = this.dependencies.clock.now();
    const reason = normalizeBillingText(input.reason);
    const result = await this.dependencies.transactionManager.execute({
      transactionType: UNIFIED_BILLING_TRANSACTION_TYPES.FINALIZE_INVOICE,
      idempotencyKey: command.idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [unifiedBillingLockKey(
        UNIFIED_BILLING_LOCK_NAMESPACE.INVOICE,
        actor.facilityId,
        invoiceId,
      )],
      idempotencyPayload: { invoiceId, ...input },
      journalPayload: { invoiceId },
      execute: async (transaction) => {
        const existing = await this.dependencies.invoices.findById(
          actor.facilityId,
          invoiceId,
          transaction.session,
        );
        if (existing === null) {
          throw new BillingInvoiceNotFoundError();
        }
        if (existing.status === 'FINALIZED') {
          return projectInvoice(
            existing,
            await this.dependencies.invoices.listLines(
              actor.facilityId,
              invoiceId,
              transaction.session,
            ),
          );
        }
        if (existing.status !== 'DRAFT') {
          throw new BillingInvalidLifecycleTransitionError(
            `Invoice ${existing.invoiceNumber}`,
            existing.status,
            'FINALIZED',
          );
        }
        const account = await this.dependencies.accounts.findById(
          actor.facilityId,
          existing.patientAccountId.toHexString(),
          transaction.session,
        );
        if (account === null) {
          throw new BillingPatientAccountNotFoundError();
        }
        if (account.status !== 'OPEN' || account.lockedAt !== null) {
          throw new BillingAccountLockedError();
        }
        const lockedAccount = await this.dependencies.accounts.update(
          actor.facilityId,
          account._id.toHexString(),
          account.version,
          {
            lockedAt: now,
            lockedBy: toObjectId(actor.userId, 'actor.userId'),
            lockReason: `Invoice ${existing.invoiceNumber} finalized: ${reason}`,
            updatedBy: toObjectId(actor.userId, 'actor.userId'),
          },
          transaction.transactionId,
          actor.correlationId,
          transaction.session,
        );
        if (lockedAccount === null) {
          throw new BillingPatientAccountConcurrencyError();
        }
        const finalized = await this.dependencies.invoices.update(
          actor.facilityId,
          invoiceId,
          input.expectedVersion,
          {
            status: 'FINALIZED',
            issuedAt: now,
            finalizedAt: now,
            finalizedBy: toObjectId(actor.userId, 'actor.userId'),
            lockedAccountVersion: lockedAccount.version,
            printableSnapshotVersion: existing.printableSnapshotVersion + 1,
            updatedBy: toObjectId(actor.userId, 'actor.userId'),
          },
          transaction.transactionId,
          actor.correlationId,
          transaction.session,
        );
        if (finalized === null) {
          throw new BillingInvoiceConcurrencyError();
        }
        await this.dependencies.invoices.appendStatusHistory({
          facilityId: actor.facilityId,
          invoiceId,
          action: 'FINALIZED',
          fromStatus: existing.status,
          toStatus: finalized.status,
          invoiceVersion: finalized.version,
          reason,
          originalInvoiceId: null,
          replacementInvoiceId: null,
          changedAt: now,
          changedBy: actor.userId,
          createdBy: actor.userId,
          updatedBy: actor.userId,
          transactionId: transaction.transactionId,
          correlationId: actor.correlationId,
        }, transaction.session);
        const lines = await this.dependencies.invoices.listLines(
          actor.facilityId,
          invoiceId,
          transaction.session,
        );
        const before = projectInvoice(existing, lines);
        const after = projectInvoice(finalized, lines);
        await this.appendAuditAndOutbox(
          actor,
          staff.staffId,
          transaction.transactionId,
          UNIFIED_BILLING_EVENT_TYPES.INVOICE_FINALIZED,
          'billing.invoice.finalized',
          invoiceId,
          now,
          after,
          transaction.session,
          reason,
          before,
        );
        return after;
      },
    });
    await this.publishChanged(actor.facilityId, result.patientAccountId, invoiceId);
    return result;
  }

  public async getInvoice(
    actor: UnifiedBillingActorContext,
    invoiceId: string,
  ): Promise<InvoiceView> {
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'INVOICE_READ',
    }));
    const record = await this.dependencies.invoices.findById(actor.facilityId, invoiceId);
    if (record === null) {
      throw new BillingInvoiceNotFoundError();
    }
    const lines = await this.dependencies.invoices.listLines(actor.facilityId, invoiceId);
    return projectInvoice(record, lines);
  }

  public async listInvoices(
    actor: UnifiedBillingActorContext,
    query: UnifiedBillingInvoiceListQuery,
  ) {
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'INVOICE_READ',
    }));
    return this.dependencies.invoices.list(actor.facilityId, query);
  }

  private async appendAuditAndOutbox(
    actor: UnifiedBillingActorContext,
    staffId: string,
    transactionId: string,
    eventType: string,
    action: string,
    entityId: string,
    occurredAt: Date,
    after: unknown,
    session: Parameters<UnifiedBillingAuditPort['append']>[1],
    reason?: string,
    before?: unknown,
  ): Promise<void> {
    await Promise.all([
      this.dependencies.audit.append({
        transactionId,
        deduplicationKey: `${transactionId}:audit:${action}:${entityId}`,
        action,
        entityType: 'Invoice',
        entityId,
        actorUserId: actor.userId,
        actorStaffId: staffId,
        facilityId: actor.facilityId,
        correlationId: actor.correlationId,
        ...(actor.ipAddress === undefined ? {} : { ipAddress: actor.ipAddress }),
        ...(actor.userAgent === undefined ? {} : { userAgent: actor.userAgent }),
        occurredAt,
        ...(reason === undefined ? {} : { reason }),
        ...(before === undefined ? {} : { before }),
        after,
      }, session),
      this.dependencies.outbox.enqueue({
        transactionId,
        deduplicationKey: `${transactionId}:outbox:${eventType}:${entityId}`,
        eventType,
        aggregateType: 'Invoice',
        aggregateId: entityId,
        actorUserId: actor.userId,
        facilityId: actor.facilityId,
        correlationId: actor.correlationId,
        occurredAt,
        payload: { invoiceId: entityId, action },
      }, session),
    ]);
  }

  private async publishChanged(
    facilityId: string,
    patientAccountId: string,
    invoiceId: string,
  ): Promise<void> {
    await Promise.all([
      this.dependencies.realtime.publish({
        eventType: UNIFIED_BILLING_REALTIME_EVENTS.INVOICE_CHANGED,
        facilityId,
        patientAccountId,
        payload: { invoiceId, patientAccountId },
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