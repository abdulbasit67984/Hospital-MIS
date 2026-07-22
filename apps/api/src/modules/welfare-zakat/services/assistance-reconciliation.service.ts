import {
  WELFARE_ZAKAT_PERMISSION_KEYS,
} from '../welfare-zakat.constants.js';
import type {
  WelfareZakatActorContext,
} from '../welfare-zakat.contracts.js';
import {
  AssistanceAccessDeniedError,
  AssistanceAllocationNotFoundError,
  AssistanceFundNotFoundError,
} from '../welfare-zakat.errors.js';
import {
  safeWelfareZakatRealtimePayload,
} from '../welfare-zakat.normalization.js';
import type {
  AssistanceAllocationRepositoryPort,
  AssistanceFundRepositoryPort,
  WelfareZakatAccessPolicyPort,
  WelfareZakatAuditPort,
  WelfareZakatAuthoritativeBillingPort,
  WelfareZakatClockPort,
  WelfareZakatOutboxPort,
  WelfareZakatReconciliationPort,
  WelfareZakatTransactionManagerPort,
} from '../welfare-zakat.ports.js';

interface Dependencies {
  transactionManager: WelfareZakatTransactionManagerPort;
  accessPolicy: WelfareZakatAccessPolicyPort;
  clock: WelfareZakatClockPort;
  funds: AssistanceFundRepositoryPort;
  allocations: AssistanceAllocationRepositoryPort;
  billing: WelfareZakatAuthoritativeBillingPort;
  reconciliation: WelfareZakatReconciliationPort;
  audit: WelfareZakatAuditPort;
  outbox: WelfareZakatOutboxPort;
}

export class AssistanceReconciliationService {
  public constructor(private readonly dependencies: Dependencies) {}

  public async reconcileFund(
    actor: WelfareZakatActorContext,
    fundId: string,
    idempotencyKey: string,
    asOf = this.dependencies.clock.now(),
  ) {
    await this.requirePermission(actor);
    return this.dependencies.transactionManager.execute({
      transactionType: 'RECONCILE_ASSISTANCE_FUND',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`welfare-zakat:fund:${actor.facilityId}:${fundId}`],
      idempotencyPayload: { fundId, asOf: asOf.toISOString() },
      journalPayload: { fundId, asOf: asOf.toISOString() },
      execute: async (transaction) => {
        const fund = await this.dependencies.funds.findById(
          actor.facilityId,
          fundId,
          transaction.session,
        );
        if (fund === null) throw new AssistanceFundNotFoundError();

        const result = await this.dependencies.reconciliation.reconcileFund({
          facilityId: actor.facilityId,
          fundId,
          asOf,
          session: transaction.session,
        });
        await this.dependencies.audit.record({
          actor,
          action: result.reconciled
            ? 'ASSISTANCE_FUND_RECONCILED'
            : 'ASSISTANCE_FUND_RECONCILIATION_FAILED',
          entityType: 'AssistanceFund',
          entityId: fundId,
          reason: result.reconciled ? null : result.differences.join('; '),
          before: null,
          after: result,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType: 'welfare_zakat.reconciliation.completed',
          aggregateType: 'AssistanceFund',
          aggregateId: fundId,
          payload: safeWelfareZakatRealtimePayload({
            fundId,
            status: result.reconciled ? 'RECONCILED' : 'MISMATCH',
            version: fund.version,
            eventAt: this.dependencies.clock.now().toISOString(),
          }),
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        return result;
      },
    });
  }

  public async reconcileAllocation(
    actor: WelfareZakatActorContext,
    allocationId: string,
    idempotencyKey: string,
  ) {
    await this.requirePermission(actor);
    return this.dependencies.transactionManager.execute({
      transactionType: 'RECONCILE_ASSISTANCE_ALLOCATION',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`welfare-zakat:allocation:${actor.facilityId}:${allocationId}`],
      idempotencyPayload: { allocationId },
      journalPayload: { allocationId },
      execute: async (transaction) => {
        const allocation = await this.dependencies.allocations.findById(
          actor.facilityId,
          allocationId,
          transaction.session,
        );
        if (allocation === null) throw new AssistanceAllocationNotFoundError();

        const result = await this.dependencies.reconciliation.reconcileAllocation({
          facilityId: actor.facilityId,
          allocationId,
          session: transaction.session,
        });
        if (result.reconciled) {
          await this.dependencies.billing.assertAllocationReconciliation({
            facilityId: actor.facilityId,
            allocationId,
            invoiceId: allocation.invoiceId.toHexString(),
            session: transaction.session,
          });
        }
        await this.dependencies.audit.record({
          actor,
          action: result.reconciled
            ? 'ASSISTANCE_ALLOCATION_RECONCILED'
            : 'ASSISTANCE_ALLOCATION_RECONCILIATION_FAILED',
          entityType: 'InvoiceFundAllocation',
          entityId: allocationId,
          reason: result.reconciled ? null : result.differences.join('; '),
          before: null,
          after: result,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType: 'welfare_zakat.reconciliation.completed',
          aggregateType: 'InvoiceFundAllocation',
          aggregateId: allocationId,
          payload: safeWelfareZakatRealtimePayload({
            applicationId: allocation.applicationId.toHexString(),
            approvalId: allocation.approvalId.toHexString(),
            allocationId,
            fundId: allocation.fundId.toHexString(),
            status: result.reconciled ? 'RECONCILED' : 'MISMATCH',
            version: allocation.version,
            eventAt: this.dependencies.clock.now().toISOString(),
          }),
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        return result;
      },
    });
  }

  private async requirePermission(actor: WelfareZakatActorContext): Promise<void> {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      permission: WELFARE_ZAKAT_PERMISSION_KEYS.RECONCILE,
      resourceFacilityId: actor.facilityId,
      sensitiveFinancialAction: true,
    });
    if (!decision.allowed) {
      throw new AssistanceAccessDeniedError(decision.denialReason ?? undefined);
    }
  }
}