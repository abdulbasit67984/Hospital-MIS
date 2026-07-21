import {
  PaymentModel,
  RefundModel,
  PaymentReversalModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  PaymentCashierActorContext,
  PaymentCashierListQuery,
  PaymentCashierPage,
  PaymentReversalView,
  PaymentView,
  RefundView,
} from '../payments-cashier-shifts.contracts.js';

import {
  PaymentNotFoundError,
  PaymentReversalNotFoundError,
  RefundNotFoundError,
  ShiftReconciliationNotFoundError,
} from '../payments-cashier-shifts.errors.js';

import {
  projectPayment,
  projectPaymentReversal,
  projectRefund,
} from '../payments-cashier-shifts.projections.js';

import type {
  PaymentCashierAccessPolicyPort,
} from '../payments-cashier-shifts.ports.js';

import type {
  PaymentFinancialRepositoryPort,
} from '../repositories/payment-finance.repository.js';

import type {
  RefundReversalControlRepositoryPort,
} from '../repositories/refund-reversal.repository.js';

import type {
  CashierShiftService,
} from './cashier-shift.service.js';

import type {
  ShiftReconciliationService,
} from './shift-reconciliation.service.js';

export interface PaymentShiftSummaryReport {
  shift: Awaited<ReturnType<CashierShiftService['get']>>;
  reconciliation: Awaited<ReturnType<ShiftReconciliationService['get']>> | null;
}

export interface PaymentCsvExport {
  filename: string;
  contentType: 'text/csv';
  content: string;
}

export interface PaymentQueryReportServiceDependencies {
  payments: PaymentFinancialRepositoryPort;
  controls: RefundReversalControlRepositoryPort;
  shifts: CashierShiftService;
  reconciliations: ShiftReconciliationService;
  accessPolicy: PaymentCashierAccessPolicyPort;
  clock: Readonly<{ now(): Date }>;
}

function csvCell(value: unknown): string {
  const raw = String(value ?? '');
  const formulaSafe = /^[=+\-@]/u.test(raw) ? `'${raw}` : raw;
  return `"${formulaSafe.replaceAll('"', '""')}"`;
}

export class PaymentQueryReportService {
  public constructor(
    private readonly dependencies: PaymentQueryReportServiceDependencies,
  ) {}

  public async getPayment(
    actor: PaymentCashierActorContext,
    paymentId: string,
  ): Promise<PaymentView> {
    const payment = await this.dependencies.payments.findPaymentById(
      actor.facilityId,
      paymentId,
    );

    if (payment === null) {
      throw new PaymentNotFoundError();
    }

    this.dependencies.accessPolicy.require({
      actor,
      action: 'PAYMENT_READ',
      resourceFacilityId: actor.facilityId,
      counterId: payment.cashCounterId?.toHexString() ?? null,
      cashierUserId: null,
    });

    const [allocations, tenders] = await Promise.all([
      this.dependencies.payments.listAllocations(actor.facilityId, paymentId),
      this.dependencies.payments.listTenders(actor.facilityId, paymentId),
    ]);

    return projectPayment(payment, allocations, tenders);
  }

  public async listPayments(
    actor: PaymentCashierActorContext,
    query: PaymentCashierListQuery,
  ): Promise<PaymentCashierPage<PaymentView>> {
    this.dependencies.accessPolicy.require({
      actor,
      action: 'PAYMENT_READ',
      resourceFacilityId: actor.facilityId,
      counterId: query.counterId,
      cashierUserId: query.cashierUserId,
    });

    const page = await this.dependencies.payments.listPayments(
      actor.facilityId,
      query,
    );

    const items = await Promise.all(
      page.items.map(async (payment) => {
        const paymentId = payment._id.toHexString();
        const [allocations, tenders] = await Promise.all([
          this.dependencies.payments.listAllocations(actor.facilityId, paymentId),
          this.dependencies.payments.listTenders(actor.facilityId, paymentId),
        ]);
        return projectPayment(payment, allocations, tenders);
      }),
    );

    return {
      ...page,
      items,
    };
  }

  public async getRefund(
    actor: PaymentCashierActorContext,
    refundId: string,
  ): Promise<RefundView> {
    this.dependencies.accessPolicy.require({
      actor,
      action: 'PAYMENT_READ',
      resourceFacilityId: actor.facilityId,
    });

    const refund = await this.dependencies.controls.findRefundById(
      actor.facilityId,
      refundId,
    );

    if (refund === null) {
      throw new RefundNotFoundError();
    }

    return projectRefund(refund);
  }

  public async getReversal(
    actor: PaymentCashierActorContext,
    reversalId: string,
  ): Promise<PaymentReversalView> {
    this.dependencies.accessPolicy.require({
      actor,
      action: 'PAYMENT_READ',
      resourceFacilityId: actor.facilityId,
    });

    const reversal = await this.dependencies.controls.findReversalById(
      actor.facilityId,
      reversalId,
    );

    if (reversal === null) {
      throw new PaymentReversalNotFoundError();
    }

    return projectPaymentReversal(reversal);
  }

  public async shiftSummary(
    actor: PaymentCashierActorContext,
    shiftId: string,
  ): Promise<PaymentShiftSummaryReport> {
    this.dependencies.accessPolicy.require({
      actor,
      action: 'REPORT_READ',
      resourceFacilityId: actor.facilityId,
    });

    const shift = await this.dependencies.shifts.get(actor, shiftId);
    let reconciliation: PaymentShiftSummaryReport['reconciliation'] = null;

    try {
      reconciliation = await this.dependencies.reconciliations.get(actor, shiftId);
    } catch (error) {
      if (!(error instanceof ShiftReconciliationNotFoundError)) {
        throw error;
      }
    }

    return {
      shift,
      reconciliation,
    };
  }

  public async exportPaymentsCsv(
    actor: PaymentCashierActorContext,
    query: PaymentCashierListQuery,
  ): Promise<PaymentCsvExport> {
    this.dependencies.accessPolicy.require({
      actor,
      action: 'REPORT_EXPORT',
      resourceFacilityId: actor.facilityId,
      counterId: query.counterId,
      cashierUserId: query.cashierUserId,
    });

    const page = await this.listPayments(actor, {
      ...query,
      page: 1,
      pageSize: Math.min(query.pageSize ?? 200, 200),
    });

    const headers = [
      'paymentNumber',
      'receiptNumber',
      'patientAccountId',
      'invoiceId',
      'amount',
      'allocatedAmount',
      'unallocatedAmount',
      'refundedAmount',
      'currency',
      'paymentMethod',
      'status',
      'receivedAt',
      'postedAt',
      'cashCounterId',
      'cashShiftId',
    ];

    const lines = [
      headers.map(csvCell).join(','),
      ...page.items.map((payment) => [
        payment.paymentNumber,
        payment.receiptNumber,
        payment.patientAccountId,
        payment.invoiceId ?? '',
        payment.amount,
        payment.allocatedAmount,
        payment.unallocatedAmount,
        payment.refundedAmount,
        payment.currency,
        payment.paymentMethod,
        payment.status,
        payment.receivedAt,
        payment.postedAt ?? '',
        payment.cashCounterId ?? '',
        payment.cashShiftId ?? '',
      ].map(csvCell).join(',')),
    ];

    return {
      filename: `payments-${this.dependencies.clock.now().toISOString().slice(0, 10)}.csv`,
      contentType: 'text/csv',
      content: `${lines.join('\n')}\n`,
    };
  }

  public async countOperationalExceptions(
    actor: PaymentCashierActorContext,
  ): Promise<Readonly<{
    failedPayments: number;
    pendingRefunds: number;
    pendingReversals: number;
  }>> {
    this.dependencies.accessPolicy.require({
      actor,
      action: 'REPORT_READ',
      resourceFacilityId: actor.facilityId,
    });

    const facilityId = toObjectId(actor.facilityId, 'facilityId');
    const [failedPayments, pendingRefunds, pendingReversals] = await Promise.all([
      PaymentModel.countDocuments({ facilityId, status: 'FAILED' }),
      RefundModel.countDocuments({ facilityId, status: 'PENDING' }),
      PaymentReversalModel.countDocuments({ facilityId, status: { $in: ['REQUESTED', 'APPROVED'] } }),
    ]);

    return {
      failedPayments,
      pendingRefunds,
      pendingReversals,
    };
  }
}