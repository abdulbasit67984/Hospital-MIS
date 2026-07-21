import Decimal from 'decimal.js';

import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  ChangePatientAccountStatusInput,
  CreatePatientAccountInput,
  PatientAccountView,
  UnifiedBillingActorContext,
  UnifiedBillingAccountListQuery,
} from '../unified-billing.contracts.js';

import {
  BILLING_CURRENCY,
  DEFAULT_BILLING_NUMBER_WIDTH,
  UNIFIED_BILLING_ACCOUNT_TRANSITIONS,
  UNIFIED_BILLING_EVENT_TYPES,
  UNIFIED_BILLING_LOCK_NAMESPACE,
  UNIFIED_BILLING_NUMBER_SEQUENCE_NAMESPACE,
  UNIFIED_BILLING_REALTIME_EVENTS,
  UNIFIED_BILLING_TRANSACTION_TYPES,
} from '../unified-billing.constants.js';

import {
  BillingAccessDeniedError,
  BillingApprovalRequiredError,
  BillingInvalidLifecycleTransitionError,
  BillingPatientAccountConcurrencyError,
  BillingPatientAccountNotFoundError,
} from '../unified-billing.errors.js';

import type {
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

import {
  projectPatientAccount,
} from '../unified-billing.projections.js';

import {
  billingDecimal128,
  normalizeBillingText,
  nullableBillingDecimal128,
  nullableBillingObjectId,
  unifiedBillingLockKey,
} from '../unified-billing.normalization.js';

export interface UnifiedBillingAccountCommandContext {
  actor: UnifiedBillingActorContext;
  idempotencyKey: string;
}

export interface UnifiedBillingAccountServiceDependencies {
  accounts: PatientAccountRepositoryPort;
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

export class UnifiedBillingAccountService {
  public constructor(
    private readonly dependencies: UnifiedBillingAccountServiceDependencies,
  ) {}

  public async createAccount(
    command: UnifiedBillingAccountCommandContext,
    input: CreatePatientAccountInput,
  ): Promise<PatientAccountView> {
    const { actor } = command;
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'ACCOUNT_CREATE',
    }));
    const authoritative = await this.dependencies.context.resolveAccountCreationContext(
      actor,
      input,
    );
    const existing = await this.dependencies.accounts.findOpenForSource(
      actor.facilityId,
      authoritative.source,
    );
    if (existing !== null) {
      return projectPatientAccount(existing);
    }

    const now = this.dependencies.clock.now();
    const staff = authoritative.actor;
    const result = await this.dependencies.transactionManager.execute({
      transactionType: UNIFIED_BILLING_TRANSACTION_TYPES.CREATE_ACCOUNT,
      idempotencyKey: command.idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [unifiedBillingLockKey(
        UNIFIED_BILLING_LOCK_NAMESPACE.PATIENT_ACCOUNT,
        actor.facilityId,
        authoritative.source.patient.patientId,
        authoritative.source.admissionId ??
          authoritative.source.encounterId ??
          authoritative.source.opdVisitId ??
          authoritative.source.registrationId ??
          authoritative.source.sourceRecordId,
      )],
      idempotencyPayload: input,
      journalPayload: {
        patientId: authoritative.source.patient.patientId,
        sourceModule: authoritative.source.sourceModule,
        sourceRecordId: authoritative.source.sourceRecordId,
      },
      execute: async (transaction) => {
        const replay = await this.dependencies.accounts.findOpenForSource(
          actor.facilityId,
          authoritative.source,
          transaction.session,
        );
        if (replay !== null) {
          return projectPatientAccount(replay);
        }
        const allocation = await this.dependencies.sequence.next(
          actor.facilityId,
          UNIFIED_BILLING_NUMBER_SEQUENCE_NAMESPACE.ACCOUNT,
        );
        const zero = billingDecimal128('0', 'zero');
        const created = await this.dependencies.accounts.create({
          facilityId: actor.facilityId,
          transactionId: transaction.transactionId,
          correlationId: actor.correlationId,
          createdBy: actor.userId,
          updatedBy: actor.userId,
          accountNumber: formatAccountNumber(now.getUTCFullYear(), allocation.value),
          patientId: toObjectId(authoritative.source.patient.patientId, 'patientId'),
          accountType: authoritative.accountType,
          billingContext: authoritative.source.billingContext,
          registrationId: nullableBillingObjectId(authoritative.source.registrationId, 'registrationId'),
          opdVisitId: nullableBillingObjectId(authoritative.source.opdVisitId, 'opdVisitId'),
          encounterId: nullableBillingObjectId(authoritative.source.encounterId, 'encounterId'),
          admissionId: nullableBillingObjectId(authoritative.source.admissionId, 'admissionId'),
          emergencyVisitId: nullableBillingObjectId(authoritative.source.emergencyVisitId, 'emergencyVisitId'),
          responsiblePartyType: authoritative.responsiblePartyType,
          guarantorId: nullableBillingObjectId(authoritative.guarantorId, 'guarantorId'),
          guarantorNameSnapshot: authoritative.guarantorName,
          payerSnapshots: authoritative.payerSnapshots.map((payer) => ({
            sequence: payer.sequence,
            payerOrganizationId: toObjectId(payer.payerOrganizationId, 'payerOrganizationId'),
            panelPlanId: nullableBillingObjectId(payer.panelPlanId, 'panelPlanId'),
            patientCoverageId: nullableBillingObjectId(payer.patientCoverageId, 'patientCoverageId'),
            payerNameSnapshot: payer.payerName,
            planNameSnapshot: payer.planName,
            membershipNumberSnapshot: payer.membershipNumber,
            authorizationReference: payer.authorizationReference,
            coverageLimitSnapshot: nullableBillingDecimal128(payer.coverageLimit, 'coverageLimit'),
            copaySnapshot: billingDecimal128(payer.copay, 'copay'),
            coinsurancePercentageSnapshot: billingDecimal128(
              payer.coinsurancePercentage,
              'coinsurancePercentage',
            ),
            deductibleSnapshot: billingDecimal128(payer.deductible, 'deductible'),
            coverageEffectiveFrom: payer.coverageEffectiveFrom === null
              ? null
              : new Date(payer.coverageEffectiveFrom),
            coverageEffectiveThrough: payer.coverageEffectiveThrough === null
              ? null
              : new Date(payer.coverageEffectiveThrough),
          })),
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
        }, transaction.session);
        await this.dependencies.accounts.appendStatusHistory({
          facilityId: actor.facilityId,
          patientAccountId: created._id.toHexString(),
          fromStatus: null,
          toStatus: 'OPEN',
          accountVersion: created.version,
          reason: 'Patient financial account opened',
          changedAt: now,
          changedBy: actor.userId,
          approvalRequestId: null,
          createdBy: actor.userId,
          updatedBy: actor.userId,
          transactionId: transaction.transactionId,
          correlationId: actor.correlationId,
        }, transaction.session);
        const view = projectPatientAccount(created);
        await this.appendAuditAndOutbox(
          actor,
          staff.staffId,
          transaction.transactionId,
          UNIFIED_BILLING_EVENT_TYPES.ACCOUNT_CREATED,
          'billing.patient_account.created',
          view.id,
          now,
          view,
          transaction.session,
        );
        return view;
      },
    });
    await this.publishChanged(actor.facilityId, result.id);
    return result;
  }

  public async changeStatus(
    command: UnifiedBillingAccountCommandContext,
    patientAccountId: string,
    input: ChangePatientAccountStatusInput,
  ): Promise<PatientAccountView> {
    const { actor } = command;
    const action = input.status === 'SUSPENDED'
      ? 'ACCOUNT_SUSPEND'
      : input.status === 'FINALIZED'
        ? 'ACCOUNT_FINALIZE'
        : 'ACCOUNT_MANAGE';
    requireAllowed(await this.dependencies.accessPolicy.authorize({ actor, action }));
    const staff = await this.dependencies.context.requireActiveActorStaff(actor);
    const now = this.dependencies.clock.now();
    const result = await this.dependencies.transactionManager.execute({
      transactionType: UNIFIED_BILLING_TRANSACTION_TYPES.CHANGE_ACCOUNT_STATUS,
      idempotencyKey: command.idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [unifiedBillingLockKey(
        UNIFIED_BILLING_LOCK_NAMESPACE.PATIENT_ACCOUNT,
        actor.facilityId,
        patientAccountId,
      )],
      idempotencyPayload: { patientAccountId, ...input },
      journalPayload: { patientAccountId, targetStatus: input.status },
      execute: async (transaction) => {
        const existing = await this.dependencies.accounts.findById(
          actor.facilityId,
          patientAccountId,
          transaction.session,
        );
        if (existing === null) {
          throw new BillingPatientAccountNotFoundError();
        }
        if (!(UNIFIED_BILLING_ACCOUNT_TRANSITIONS[existing.status] as readonly string[]).includes(input.status)) {
          throw new BillingInvalidLifecycleTransitionError(
            'PatientAccount',
            existing.status,
            input.status,
          );
        }
        if (
          ['WRITTEN_OFF'].includes(input.status) &&
          input.approvalRequestId == null
        ) {
          throw new BillingApprovalRequiredError();
        }
        if (
          input.status === 'FINALIZED' &&
          !new Decimal(existing.outstandingBalance.toString()).isZero()
        ) {
          throw new BillingInvalidLifecycleTransitionError(
            'PatientAccountWithOutstandingBalance',
            existing.status,
            input.status,
          );
        }
        const reason = normalizeBillingText(input.reason);
        const updated = await this.dependencies.accounts.update(
          actor.facilityId,
          patientAccountId,
          input.expectedVersion,
          {
            status: input.status,
            updatedBy: toObjectId(actor.userId, 'actor.userId'),
            ...(input.status === 'SUSPENDED'
              ? {
                  suspendedAt: now,
                  suspendedBy: toObjectId(actor.userId, 'actor.userId'),
                  suspensionReason: reason,
                }
              : {}),
            ...(input.status === 'OPEN'
              ? {
                  suspendedAt: null,
                  suspendedBy: null,
                  suspensionReason: null,
                  lockedAt: null,
                  lockedBy: null,
                  lockReason: null,
                }
              : {}),
            ...(input.status === 'FINALIZED'
              ? {
                  finalizedAt: now,
                  finalizedBy: toObjectId(actor.userId, 'actor.userId'),
                  lockedAt: now,
                  lockedBy: toObjectId(actor.userId, 'actor.userId'),
                  lockReason: reason,
                }
              : {}),
          },
          transaction.transactionId,
          actor.correlationId,
          transaction.session,
        );
        if (updated === null) {
          throw new BillingPatientAccountConcurrencyError();
        }
        await this.dependencies.accounts.appendStatusHistory({
          facilityId: actor.facilityId,
          patientAccountId,
          fromStatus: existing.status,
          toStatus: updated.status,
          accountVersion: updated.version,
          reason,
          changedAt: now,
          changedBy: actor.userId,
          approvalRequestId: nullableBillingObjectId(
            input.approvalRequestId,
            'approvalRequestId',
          ),
          createdBy: actor.userId,
          updatedBy: actor.userId,
          transactionId: transaction.transactionId,
          correlationId: actor.correlationId,
        }, transaction.session);
        const before = projectPatientAccount(existing);
        const after = projectPatientAccount(updated);
        await this.appendAuditAndOutbox(
          actor,
          staff.staffId,
          transaction.transactionId,
          UNIFIED_BILLING_EVENT_TYPES.ACCOUNT_STATUS_CHANGED,
          'billing.patient_account.status_changed',
          patientAccountId,
          now,
          after,
          transaction.session,
          reason,
          before,
        );
        return after;
      },
    });
    await this.publishChanged(actor.facilityId, patientAccountId);
    return result;
  }

  public async getAccount(
    actor: UnifiedBillingActorContext,
    patientAccountId: string,
  ): Promise<PatientAccountView> {
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'ACCOUNT_READ',
    }));
    const record = await this.dependencies.accounts.findById(
      actor.facilityId,
      patientAccountId,
    );
    if (record === null) {
      throw new BillingPatientAccountNotFoundError();
    }
    return projectPatientAccount(record);
  }

  public async listAccounts(
    actor: UnifiedBillingActorContext,
    query: UnifiedBillingAccountListQuery,
  ) {
    requireAllowed(await this.dependencies.accessPolicy.authorize({
      actor,
      action: 'ACCOUNT_READ',
    }));
    return this.dependencies.accounts.list(actor.facilityId, query);
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
        entityType: 'PatientAccount',
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
        aggregateType: 'PatientAccount',
        aggregateId: entityId,
        actorUserId: actor.userId,
        facilityId: actor.facilityId,
        correlationId: actor.correlationId,
        occurredAt,
        payload: { patientAccountId: entityId, action },
      }, session),
    ]);
  }

  private async publishChanged(facilityId: string, patientAccountId: string): Promise<void> {
    await this.dependencies.realtime.publish({
      eventType: UNIFIED_BILLING_REALTIME_EVENTS.ACCOUNT_CHANGED,
      facilityId,
      patientAccountId,
      payload: { patientAccountId },
    });
  }
}