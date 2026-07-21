import Decimal from 'decimal.js';

import {
  CashMovementModel,
  DepositModel,
  FinancialLedgerTransactionModel,
  PaymentMethodConfigurationModel,
  PaymentModel,
  PaymentReceiptModel,
  PaymentReversalModel,
  RefundModel,
  RefundRequestModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  PaymentCashierMongoSession,
  PaymentMethodTotalRecord,
} from '../payments-cashier-shifts.persistence.types.js';

import {
  paymentCashierDecimal128,
} from '../payments-cashier-shifts.normalization.js';

function decimal(value: unknown): Decimal {
  if (
    value !== null &&
    typeof value === 'object' &&
    'toString' in value
  ) {
    return new Decimal(String(value));
  }

  return new Decimal(String(value ?? '0'));
}

interface MethodAccumulator {
  paymentMethodConfigurationId: string;
  paymentMethodCodeSnapshot: string;
  cashEquivalent: boolean;
  collectedAmount: Decimal;
  refundedAmount: Decimal;
  reversedAmount: Decimal;
  transactionCount: number;
}

export interface ShiftFinancialSnapshot {
  cashCollections: string;
  cashRefunds: string;
  cashPaidOut: string;
  cashDrops: string;
  safeDeposits: string;
  cashTransfersIn: string;
  cashTransfersOut: string;
  nonCashTotal: string;
  paymentMethodTotals: PaymentMethodTotalRecord[];
  paymentCount: number;
  receiptCount: number;
  failedPaymentCount: number;
  unallocatedPaymentCount: number;
  unresolvedRefundCount: number;
  incompleteJournalCount: number;
  refundTotal: string;
  reversalTotal: string;
  depositTotal: string;
  advanceTotal: string;
  firstReceiptNumber: string | null;
  lastReceiptNumber: string | null;
}

export interface ShiftReconciliationQueryRepositoryPort {
  calculate(
    facilityId: string,
    shiftId: string,
    session: PaymentCashierMongoSession,
  ): Promise<ShiftFinancialSnapshot>;
}

export class MongoShiftReconciliationQueryRepository
implements ShiftReconciliationQueryRepositoryPort {
  public async calculate(
    facilityId: string,
    shiftId: string,
    session: PaymentCashierMongoSession,
  ): Promise<ShiftFinancialSnapshot> {
    const facilityObjectId = toObjectId(facilityId, 'facilityId');
    const shiftObjectId = toObjectId(shiftId, 'shiftId');

    const [
      payments,
      refunds,
      reversals,
      movements,
      receipts,
      ledgerTransactions,
    ] = await Promise.all([
      PaymentModel.find({
        facilityId: facilityObjectId,
        cashShiftId: shiftObjectId,
      })
        .select('+tenders.externalReference +tenders.failureMessage')
        .session(session)
        .lean()
        .exec(),
      RefundModel.find({
        facilityId: facilityObjectId,
        cashShiftId: shiftObjectId,
        status: 'POSTED',
      })
        .session(session)
        .lean()
        .exec(),
      PaymentReversalModel.find({
        facilityId: facilityObjectId,
        cashShiftId: shiftObjectId,
        status: 'POSTED',
      })
        .session(session)
        .lean()
        .exec(),
      CashMovementModel.find({
        facilityId: facilityObjectId,
        status: 'POSTED',
        $or: [
          { sourceShiftId: shiftObjectId },
          { destinationShiftId: shiftObjectId },
        ],
      })
        .session(session)
        .lean()
        .exec(),
      PaymentReceiptModel.find({
        facilityId: facilityObjectId,
        cashShiftId: shiftObjectId,
      })
        .sort({ issuedAt: 1, _id: 1 })
        .session(session)
        .lean()
        .exec(),
      FinancialLedgerTransactionModel.find({
        facilityId: facilityObjectId,
        cashShiftId: shiftObjectId,
        status: 'POSTED',
      })
        .session(session)
        .lean()
        .exec(),
    ]);

    const paymentIds = payments.map((payment) => payment._id);
    const deposits = paymentIds.length === 0
      ? []
      : await DepositModel.find({
          facilityId: facilityObjectId,
          paymentId: { $in: paymentIds },
        })
          .session(session)
          .lean()
          .exec();

    const depositIds = deposits.map((deposit) => deposit._id);
    const unresolvedRefundCount = paymentIds.length === 0 && depositIds.length === 0
      ? 0
      : await RefundRequestModel.countDocuments({
          facilityId: facilityObjectId,
          status: { $in: ['PENDING', 'APPROVED'] },
          $or: [
            ...(paymentIds.length === 0
              ? []
              : [{ paymentId: { $in: paymentIds } }]),
            ...(depositIds.length === 0
              ? []
              : [{ depositId: { $in: depositIds } }]),
          ],
        })
          .session(session)
          .exec();

    const methodIds = new Set<string>();

    for (const payment of payments) {
      for (const tender of payment.tenders ?? []) {
        methodIds.add(tender.paymentMethodConfigurationId.toHexString());
      }
    }

    for (const refund of refunds) {
      if (refund.paymentMethodConfigurationId != null) {
        methodIds.add(refund.paymentMethodConfigurationId.toHexString());
      }
    }

    const methodConfigurations = methodIds.size === 0
      ? []
      : await PaymentMethodConfigurationModel.find({
          facilityId: facilityObjectId,
          _id: {
            $in: [...methodIds].map((id) => toObjectId(id, 'methodId')),
          },
        })
          .session(session)
          .lean()
          .exec();

    const methodById = new Map(
      methodConfigurations.map((method) => [
        method._id.toHexString(),
        method,
      ]),
    );
    const aggregates = new Map<string, MethodAccumulator>();

    const aggregateFor = (
      methodId: string,
      code: string,
      cashEquivalent: boolean,
    ): MethodAccumulator => {
      const existing = aggregates.get(methodId);

      if (existing !== undefined) {
        return existing;
      }

      const created: MethodAccumulator = {
        paymentMethodConfigurationId: methodId,
        paymentMethodCodeSnapshot: code,
        cashEquivalent,
        collectedAmount: new Decimal(0),
        refundedAmount: new Decimal(0),
        reversedAmount: new Decimal(0),
        transactionCount: 0,
      };
      aggregates.set(methodId, created);
      return created;
    };

    let cashCollections = new Decimal(0);
    let failedPaymentCount = 0;
    let unallocatedPaymentCount = 0;
    const depositedPaymentIds = new Set(
      deposits.map((deposit) => deposit.paymentId.toHexString()),
    );

    for (const payment of payments) {
      if (payment.status === 'FAILED') {
        failedPaymentCount += 1;
      }

      if (
        decimal(payment.unallocatedAmount).greaterThan(0) &&
        !depositedPaymentIds.has(payment._id.toHexString())
      ) {
        unallocatedPaymentCount += 1;
      }

      if (!['POSTED', 'COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REVERSED'].includes(payment.status)) {
        continue;
      }

      for (const tender of payment.tenders ?? []) {
        const methodId = tender.paymentMethodConfigurationId.toHexString();
        const configuration = methodById.get(methodId);
        const cashEquivalent = tender.paymentMethodKindSnapshot === 'CASH' ||
          configuration?.cashEquivalent === true;
        const aggregate = aggregateFor(
          methodId,
          tender.paymentMethodCodeSnapshot,
          cashEquivalent,
        );
        const amount = decimal(tender.amount);
        aggregate.collectedAmount = aggregate.collectedAmount.plus(amount);
        aggregate.transactionCount += 1;

        if (cashEquivalent) {
          cashCollections = cashCollections.plus(amount);
        }
      }
    }

    let cashRefunds = new Decimal(0);
    let refundTotal = new Decimal(0);

    for (const refund of refunds) {
      const amount = decimal(refund.amount);
      refundTotal = refundTotal.plus(amount);
      const methodId = refund.paymentMethodConfigurationId?.toHexString() ??
        `LEGACY:${refund.paymentMethod}`;
      const configuration = refund.paymentMethodConfigurationId == null
        ? undefined
        : methodById.get(refund.paymentMethodConfigurationId.toHexString());
      const cashEquivalent = configuration?.cashEquivalent === true ||
        refund.paymentMethod === 'CASH';
      const aggregate = aggregateFor(
        methodId,
        configuration?.methodCode ?? refund.paymentMethod,
        cashEquivalent,
      );
      aggregate.refundedAmount = aggregate.refundedAmount.plus(amount);

      if (cashEquivalent) {
        cashRefunds = cashRefunds.plus(amount);
      }
    }

    let reversalTotal = new Decimal(0);

    for (const reversal of reversals) {
      const amount = decimal(reversal.amount);
      reversalTotal = reversalTotal.plus(amount);
      const payment = payments.find(
        (candidate) => candidate._id.equals(reversal.paymentId),
      );

      for (const tender of payment?.tenders ?? []) {
        const methodId = tender.paymentMethodConfigurationId.toHexString();
        const tenderAmount = decimal(tender.amount);
        const configuration = methodById.get(methodId);
        const cashEquivalent = tender.paymentMethodKindSnapshot === 'CASH' ||
          configuration?.cashEquivalent === true;
        const aggregate = aggregateFor(
          methodId,
          tender.paymentMethodCodeSnapshot,
          cashEquivalent,
        );
        aggregate.reversedAmount = aggregate.reversedAmount.plus(tenderAmount);

        if (cashEquivalent) {
          cashRefunds = cashRefunds.plus(tenderAmount);
        }
      }
    }

    let cashPaidOut = new Decimal(0);
    let cashDrops = new Decimal(0);
    let safeDeposits = new Decimal(0);
    let cashTransfersIn = new Decimal(0);
    let cashTransfersOut = new Decimal(0);

    for (const movement of movements) {
      const amount = decimal(movement.amount);
      const isSource = movement.sourceShiftId?.equals(shiftObjectId) === true;
      const isDestination = movement.destinationShiftId?.equals(shiftObjectId) === true;

      if (isSource && movement.movementType === 'CASH_PAID_OUT') {
        cashPaidOut = cashPaidOut.plus(amount);
      }
      if (isSource && movement.movementType === 'CASH_DROP') {
        cashDrops = cashDrops.plus(amount);
      }
      if (isSource && movement.movementType === 'SAFE_DEPOSIT') {
        safeDeposits = safeDeposits.plus(amount);
      }
      if (
        isSource &&
        ['COUNTER_TRANSFER', 'SHIFT_TRANSFER'].includes(movement.movementType)
      ) {
        cashTransfersOut = cashTransfersOut.plus(amount);
      }
      if (
        isDestination &&
        ['COUNTER_TRANSFER', 'SHIFT_TRANSFER'].includes(movement.movementType)
      ) {
        cashTransfersIn = cashTransfersIn.plus(amount);
      }
    }

    const paymentMethodTotals = [...aggregates.values()]
      .sort((left, right) =>
        left.paymentMethodCodeSnapshot.localeCompare(
          right.paymentMethodCodeSnapshot,
        ),
      )
      .map((aggregate) => {
        const netAmount = aggregate.collectedAmount
          .minus(aggregate.refundedAmount)
          .minus(aggregate.reversedAmount);

        return {
          paymentMethodConfigurationId: toObjectId(
            aggregate.paymentMethodConfigurationId.startsWith('LEGACY:')
              ? '000000000000000000000000'
              : aggregate.paymentMethodConfigurationId,
            'paymentMethodConfigurationId',
          ),
          paymentMethodCodeSnapshot: aggregate.paymentMethodCodeSnapshot,
          collectedAmount: paymentCashierDecimal128(
            aggregate.collectedAmount.toFixed(),
            'collectedAmount',
          ),
          refundedAmount: paymentCashierDecimal128(
            aggregate.refundedAmount.toFixed(),
            'refundedAmount',
          ),
          reversedAmount: paymentCashierDecimal128(
            aggregate.reversedAmount.toFixed(),
            'reversedAmount',
          ),
          netAmount: paymentCashierDecimal128(
            netAmount.toFixed(),
            'netAmount',
          ),
          transactionCount: aggregate.transactionCount,
        };
      });

    const nonCashTotal = [...aggregates.values()]
      .filter((aggregate) => !aggregate.cashEquivalent)
      .reduce(
        (sum, aggregate) => sum
          .plus(aggregate.collectedAmount)
          .minus(aggregate.refundedAmount)
          .minus(aggregate.reversedAmount),
        new Decimal(0),
      );

    const expectedJournalCount = payments.filter((payment) =>
      ['POSTED', 'COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REVERSED'].includes(
        payment.status,
      ),
    ).length + refunds.length + reversals.length;
    const incompleteJournalCount = Math.max(
      0,
      expectedJournalCount - ledgerTransactions.length,
    );

    const depositTotal = deposits.reduce(
      (sum, deposit) => sum.plus(decimal(deposit.originalAmount)),
      new Decimal(0),
    );
    const advanceTotal = deposits
      .filter((deposit) => deposit.depositType === 'GENERAL_ADVANCE')
      .reduce(
        (sum, deposit) => sum.plus(decimal(deposit.originalAmount)),
        new Decimal(0),
      );

    return {
      cashCollections: cashCollections.toFixed(),
      cashRefunds: cashRefunds.toFixed(),
      cashPaidOut: cashPaidOut.toFixed(),
      cashDrops: cashDrops.toFixed(),
      safeDeposits: safeDeposits.toFixed(),
      cashTransfersIn: cashTransfersIn.toFixed(),
      cashTransfersOut: cashTransfersOut.toFixed(),
      nonCashTotal: nonCashTotal.toFixed(),
      paymentMethodTotals,
      paymentCount: payments.filter((payment) => payment.status !== 'FAILED').length,
      receiptCount: receipts.length,
      failedPaymentCount,
      unallocatedPaymentCount,
      unresolvedRefundCount,
      incompleteJournalCount,
      refundTotal: refundTotal.toFixed(),
      reversalTotal: reversalTotal.toFixed(),
      depositTotal: depositTotal.toFixed(),
      advanceTotal: advanceTotal.toFixed(),
      firstReceiptNumber: receipts[0]?.receiptNumber ?? null,
      lastReceiptNumber: receipts.at(-1)?.receiptNumber ?? null,
    };
  }
}