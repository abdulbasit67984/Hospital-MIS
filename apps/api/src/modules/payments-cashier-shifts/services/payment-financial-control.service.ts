import Decimal from 'decimal.js';

import {
  DepositModel,
  InvoiceModel,
  PatientAccountModel,
  PaymentAllocationModel,
  PaymentModel,
  RefundModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  DepositBalanceError,
  PaymentAllocationConflictError,
  PaymentCashierConcurrencyError,
  PaymentRefundableBalanceError,
} from '../payments-cashier-shifts.errors.js';

import type {
  DepositRecord,
  PaymentCashierMongoSession,
  PaymentRecord,
  RefundRecord,
} from '../payments-cashier-shifts.persistence.types.js';

import type {
  RefundAllocationEffectRecord,
} from '../payments-cashier-shifts.persistence-control-extensions.js';

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

interface MutationMetadata {
  actorUserId: string;
  transactionId: string;
  correlationId: string;
}

export interface AppliedPaymentRefund {
  unallocatedRefundAmount: string;
  allocationEffects: RefundAllocationEffectRecord[];
  updatedPayment: PaymentRecord;
}

export class PaymentFinancialControlService {
  public async applyPaymentRefund(
    facilityId: string,
    payment: PaymentRecord,
    refundAmountValue: string,
    metadata: MutationMetadata,
    session: PaymentCashierMongoSession,
  ): Promise<AppliedPaymentRefund> {
    const refundAmount = new Decimal(refundAmountValue);
    const currentRefunded = decimal(payment.refundedAmount);
    const currentReversed = decimal(payment.reversedAmount);
    const refundable = decimal(payment.amount)
      .minus(currentRefunded)
      .minus(currentReversed);

    if (
      !refundAmount.isPositive() ||
      refundAmount.greaterThan(refundable) ||
      !['POSTED', 'COMPLETED', 'PARTIALLY_REFUNDED'].includes(payment.status)
    ) {
      throw new PaymentRefundableBalanceError();
    }

    const unallocatedRefund = Decimal.min(
      refundAmount,
      decimal(payment.unallocatedAmount),
    );
    let remainingAllocatedRefund = refundAmount.minus(unallocatedRefund);

    const allocations = await PaymentAllocationModel.find({
      facilityId: toObjectId(facilityId, 'facilityId'),
      paymentId: payment._id,
      status: 'ACTIVE',
    })
      .sort({ allocatedAt: -1, _id: -1 })
      .session(session)
      .lean()
      .exec();

    const previousEffects = await RefundModel.find({
      facilityId: toObjectId(facilityId, 'facilityId'),
      paymentId: payment._id,
      status: 'POSTED',
    })
      .select('allocationEffects')
      .session(session)
      .lean()
      .exec();

    const alreadyRefundedByAllocation = new Map<string, Decimal>();

    for (const previousRefund of previousEffects) {
      for (const effect of previousRefund.allocationEffects ?? []) {
        const key = effect.paymentAllocationId.toHexString();
        alreadyRefundedByAllocation.set(
          key,
          (alreadyRefundedByAllocation.get(key) ?? new Decimal(0)).plus(
            decimal(effect.amount),
          ),
        );
      }
    }

    const effects: RefundAllocationEffectRecord[] = [];

    for (const allocation of allocations) {
      if (remainingAllocatedRefund.isZero()) {
        break;
      }

      const allocationId = allocation._id.toHexString();
      const remainingAllocationAmount = decimal(allocation.amount).minus(
        alreadyRefundedByAllocation.get(allocationId) ?? new Decimal(0),
      );

      if (!remainingAllocationAmount.isPositive()) {
        continue;
      }

      const effectAmount = Decimal.min(
        remainingAllocatedRefund,
        remainingAllocationAmount,
      );

      effects.push({
        paymentAllocationId: allocation._id,
        invoiceId: allocation.invoiceId ?? null,
        accountChargeId: allocation.accountChargeId ?? null,
        amount: paymentCashierDecimal128(
          effectAmount.toFixed(),
          'allocationEffect.amount',
        ),
      });
      remainingAllocatedRefund = remainingAllocatedRefund.minus(effectAmount);
    }

    if (!remainingAllocatedRefund.isZero()) {
      throw new PaymentRefundableBalanceError();
    }

    await this.applyInvoiceEffects(
      facilityId,
      effects,
      'REFUND',
      metadata,
      session,
    );

    const account = await PatientAccountModel.findOne({
      _id: payment.patientAccountId,
      facilityId: toObjectId(facilityId, 'facilityId'),
    })
      .session(session)
      .lean()
      .exec();

    if (account === null) {
      throw new PaymentAllocationConflictError(
        'The patient account no longer exists',
      );
    }

    const allocatedRefund = refundAmount.minus(unallocatedRefund);
    const nextPaymentsApplied = decimal(account.paymentsAppliedTotal).minus(
      refundAmount,
    );
    const nextRefundable = decimal(account.refundableBalance).minus(
      unallocatedRefund,
    );
    const nextOutstanding = decimal(account.outstandingBalance).plus(
      allocatedRefund,
    );

    if (nextPaymentsApplied.isNegative() || nextRefundable.isNegative()) {
      throw new PaymentRefundableBalanceError();
    }

    const actorId = toObjectId(metadata.actorUserId, 'actorUserId');
    const updatedAccount = await PatientAccountModel.findOneAndUpdate(
      {
        _id: account._id,
        facilityId: account.facilityId,
        version: account.version,
      },
      {
        $set: {
          paymentsAppliedTotal: paymentCashierDecimal128(
            nextPaymentsApplied.toFixed(),
            'paymentsAppliedTotal',
          ),
          refundableBalance: paymentCashierDecimal128(
            nextRefundable.toFixed(),
            'refundableBalance',
          ),
          outstandingBalance: paymentCashierDecimal128(
            nextOutstanding.toFixed(),
            'outstandingBalance',
          ),
          updatedBy: actorId,
          transactionId: metadata.transactionId,
          correlationId: metadata.correlationId,
        },
        $inc: { version: 1 },
      },
      {
        new: true,
        session,
        runValidators: true,
      },
    )
      .lean()
      .exec();

    if (updatedAccount === null) {
      throw new PaymentCashierConcurrencyError();
    }

    const nextAllocated = decimal(payment.allocatedAmount).minus(
      allocatedRefund,
    );
    const nextUnallocated = decimal(payment.unallocatedAmount).minus(
      unallocatedRefund,
    );
    const nextRefunded = currentRefunded.plus(refundAmount);
    const tenders = this.applyTenderRefund(
      payment.tenders,
      refundAmount,
      false,
    );
    const updatedPayment = await PaymentModel.findOneAndUpdate(
      {
        _id: payment._id,
        facilityId: payment.facilityId,
        version: payment.version,
      },
      {
        $set: {
          allocatedAmount: paymentCashierDecimal128(
            nextAllocated.toFixed(),
            'allocatedAmount',
          ),
          unallocatedAmount: paymentCashierDecimal128(
            nextUnallocated.toFixed(),
            'unallocatedAmount',
          ),
          refundedAmount: paymentCashierDecimal128(
            nextRefunded.toFixed(),
            'refundedAmount',
          ),
          tenders,
          status: nextRefunded.equals(decimal(payment.amount))
            ? 'REFUNDED'
            : 'PARTIALLY_REFUNDED',
          updatedBy: actorId,
          transactionId: metadata.transactionId,
          correlationId: metadata.correlationId,
        },
        $inc: { version: 1 },
      },
      {
        new: true,
        session,
        runValidators: true,
      },
    )
      .select('+tenders.externalReference +tenders.failureMessage')
      .lean()
      .exec();

    if (updatedPayment === null) {
      throw new PaymentCashierConcurrencyError();
    }

    return {
      unallocatedRefundAmount: unallocatedRefund.toFixed(),
      allocationEffects: effects,
      updatedPayment: updatedPayment as PaymentRecord,
    };
  }

  public async reversePaymentRefund(
    facilityId: string,
    payment: PaymentRecord,
    refund: RefundRecord,
    metadata: MutationMetadata,
    session: PaymentCashierMongoSession,
  ): Promise<PaymentRecord> {
    if (refund.status !== 'POSTED') {
      throw new PaymentRefundableBalanceError();
    }

    const refundAmount = decimal(refund.amount);
    const unallocatedRefund = decimal(refund.unallocatedRefundAmount);
    const allocatedRefund = refundAmount.minus(unallocatedRefund);

    await this.applyInvoiceEffects(
      facilityId,
      refund.allocationEffects,
      'REFUND_REVERSAL',
      metadata,
      session,
    );

    const account = await PatientAccountModel.findOne({
      _id: payment.patientAccountId,
      facilityId: toObjectId(facilityId, 'facilityId'),
    })
      .session(session)
      .lean()
      .exec();

    if (account === null) {
      throw new PaymentAllocationConflictError(
        'The patient account no longer exists',
      );
    }

    const actorId = toObjectId(metadata.actorUserId, 'actorUserId');
    const updatedAccount = await PatientAccountModel.findOneAndUpdate(
      {
        _id: account._id,
        facilityId: account.facilityId,
        version: account.version,
      },
      {
        $set: {
          paymentsAppliedTotal: paymentCashierDecimal128(
            decimal(account.paymentsAppliedTotal).plus(refundAmount).toFixed(),
            'paymentsAppliedTotal',
          ),
          refundableBalance: paymentCashierDecimal128(
            decimal(account.refundableBalance).plus(unallocatedRefund).toFixed(),
            'refundableBalance',
          ),
          outstandingBalance: paymentCashierDecimal128(
            decimal(account.outstandingBalance).minus(allocatedRefund).toFixed(),
            'outstandingBalance',
          ),
          updatedBy: actorId,
          transactionId: metadata.transactionId,
          correlationId: metadata.correlationId,
        },
        $inc: { version: 1 },
      },
      {
        new: true,
        session,
        runValidators: true,
      },
    )
      .lean()
      .exec();

    if (updatedAccount === null) {
      throw new PaymentCashierConcurrencyError();
    }

    const nextRefunded = decimal(payment.refundedAmount).minus(refundAmount);
    const tenders = this.applyTenderRefund(
      payment.tenders,
      refundAmount,
      true,
    );
    const updatedPayment = await PaymentModel.findOneAndUpdate(
      {
        _id: payment._id,
        facilityId: payment.facilityId,
        version: payment.version,
      },
      {
        $set: {
          allocatedAmount: paymentCashierDecimal128(
            decimal(payment.allocatedAmount).plus(allocatedRefund).toFixed(),
            'allocatedAmount',
          ),
          unallocatedAmount: paymentCashierDecimal128(
            decimal(payment.unallocatedAmount).plus(unallocatedRefund).toFixed(),
            'unallocatedAmount',
          ),
          refundedAmount: paymentCashierDecimal128(
            nextRefunded.toFixed(),
            'refundedAmount',
          ),
          tenders,
          status: nextRefunded.isZero() ? 'COMPLETED' : 'PARTIALLY_REFUNDED',
          updatedBy: actorId,
          transactionId: metadata.transactionId,
          correlationId: metadata.correlationId,
        },
        $inc: { version: 1 },
      },
      {
        new: true,
        session,
        runValidators: true,
      },
    )
      .select('+tenders.externalReference +tenders.failureMessage')
      .lean()
      .exec();

    if (updatedPayment === null) {
      throw new PaymentCashierConcurrencyError();
    }

    return updatedPayment as PaymentRecord;
  }

  public async applyDepositRefund(
    facilityId: string,
    deposit: DepositRecord,
    amountValue: string,
    metadata: MutationMetadata,
    session: PaymentCashierMongoSession,
  ): Promise<DepositRecord> {
    const amount = new Decimal(amountValue);
    const available = decimal(deposit.availableAmount);

    if (!amount.isPositive() || amount.greaterThan(available)) {
      throw new DepositBalanceError();
    }

    const actorId = toObjectId(metadata.actorUserId, 'actorUserId');
    const nextAvailable = available.minus(amount);
    const nextRefunded = decimal(deposit.refundedAmount).plus(amount);
    const updatedDeposit = await DepositModel.findOneAndUpdate(
      {
        _id: deposit._id,
        facilityId: deposit.facilityId,
        version: deposit.version,
      },
      {
        $set: {
          availableAmount: paymentCashierDecimal128(
            nextAvailable.toFixed(),
            'availableAmount',
          ),
          refundedAmount: paymentCashierDecimal128(
            nextRefunded.toFixed(),
            'refundedAmount',
          ),
          status: nextAvailable.isZero() ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          updatedBy: actorId,
          transactionId: metadata.transactionId,
          correlationId: metadata.correlationId,
        },
        $inc: { version: 1 },
      },
      {
        new: true,
        session,
        runValidators: true,
      },
    )
      .lean()
      .exec();

    if (updatedDeposit === null) {
      throw new PaymentCashierConcurrencyError();
    }

    if (deposit.patientAccountId !== null) {
      await this.changeAccountCredit(
        facilityId,
        deposit.patientAccountId.toHexString(),
        amount.negated(),
        amount.negated(),
        new Decimal(0),
        metadata,
        session,
      );
    }

    return updatedDeposit as DepositRecord;
  }

  public async reverseDepositRefund(
    facilityId: string,
    deposit: DepositRecord,
    amountValue: string,
    metadata: MutationMetadata,
    session: PaymentCashierMongoSession,
  ): Promise<DepositRecord> {
    const amount = new Decimal(amountValue);

    if (amount.greaterThan(decimal(deposit.refundedAmount))) {
      throw new DepositBalanceError();
    }

    const actorId = toObjectId(metadata.actorUserId, 'actorUserId');
    const nextAvailable = decimal(deposit.availableAmount).plus(amount);
    const nextRefunded = decimal(deposit.refundedAmount).minus(amount);
    const updatedDeposit = await DepositModel.findOneAndUpdate(
      {
        _id: deposit._id,
        facilityId: deposit.facilityId,
        version: deposit.version,
      },
      {
        $set: {
          availableAmount: paymentCashierDecimal128(
            nextAvailable.toFixed(),
            'availableAmount',
          ),
          refundedAmount: paymentCashierDecimal128(
            nextRefunded.toFixed(),
            'refundedAmount',
          ),
          status: nextRefunded.isZero() ? 'AVAILABLE' : 'PARTIALLY_REFUNDED',
          updatedBy: actorId,
          transactionId: metadata.transactionId,
          correlationId: metadata.correlationId,
        },
        $inc: { version: 1 },
      },
      {
        new: true,
        session,
        runValidators: true,
      },
    )
      .lean()
      .exec();

    if (updatedDeposit === null) {
      throw new PaymentCashierConcurrencyError();
    }

    if (deposit.patientAccountId !== null) {
      await this.changeAccountCredit(
        facilityId,
        deposit.patientAccountId.toHexString(),
        amount,
        amount,
        new Decimal(0),
        metadata,
        session,
      );
    }

    return updatedDeposit as DepositRecord;
  }

  public async applyCreditNoteRefund(
    facilityId: string,
    patientAccountId: string,
    amountValue: string,
    metadata: MutationMetadata,
    session: PaymentCashierMongoSession,
  ): Promise<void> {
    const amount = new Decimal(amountValue);
    await this.changeAccountCredit(
      facilityId,
      patientAccountId,
      new Decimal(0),
      amount.negated(),
      amount.negated(),
      metadata,
      session,
    );
  }

  public async reverseCreditNoteRefund(
    facilityId: string,
    patientAccountId: string,
    amountValue: string,
    metadata: MutationMetadata,
    session: PaymentCashierMongoSession,
  ): Promise<void> {
    const amount = new Decimal(amountValue);
    await this.changeAccountCredit(
      facilityId,
      patientAccountId,
      new Decimal(0),
      amount,
      amount,
      metadata,
      session,
    );
  }

  public async markPaymentReversed(
    facilityId: string,
    payment: PaymentRecord,
    reversalId: string,
    metadata: MutationMetadata,
    session: PaymentCashierMongoSession,
  ): Promise<PaymentRecord> {
    if (
      !decimal(payment.refundedAmount).isZero() ||
      !decimal(payment.reversedAmount).isZero()
    ) {
      throw new PaymentRefundableBalanceError();
    }

    const actorId = toObjectId(metadata.actorUserId, 'actorUserId');
    const tenders = payment.tenders.map((tender) => ({
      ...tender,
      status: 'REVERSED',
    }));
    const updated = await PaymentModel.findOneAndUpdate(
      {
        _id: payment._id,
        facilityId: toObjectId(facilityId, 'facilityId'),
        version: payment.version,
      },
      {
        $set: {
          allocatedAmount: paymentCashierDecimal128('0', 'allocatedAmount'),
          unallocatedAmount: paymentCashierDecimal128('0', 'unallocatedAmount'),
          refundedAmount: paymentCashierDecimal128('0', 'refundedAmount'),
          reversedAmount: payment.amount,
          tenders,
          status: 'REVERSED',
          reversalId: toObjectId(reversalId, 'reversalId'),
          updatedBy: actorId,
          transactionId: metadata.transactionId,
          correlationId: metadata.correlationId,
        },
        $inc: { version: 1 },
      },
      {
        new: true,
        session,
        runValidators: true,
      },
    )
      .select('+tenders.externalReference +tenders.failureMessage')
      .lean()
      .exec();

    if (updated === null) {
      throw new PaymentCashierConcurrencyError();
    }

    return updated as PaymentRecord;
  }

  private async applyInvoiceEffects(
    facilityId: string,
    effects: readonly RefundAllocationEffectRecord[],
    direction: 'REFUND' | 'REFUND_REVERSAL',
    metadata: MutationMetadata,
    session: PaymentCashierMongoSession,
  ): Promise<void> {
    const invoiceTotals = new Map<string, Decimal>();

    for (const effect of effects) {
      if (effect.invoiceId === null) {
        continue;
      }

      const invoiceId = effect.invoiceId.toHexString();
      invoiceTotals.set(
        invoiceId,
        (invoiceTotals.get(invoiceId) ?? new Decimal(0)).plus(
          decimal(effect.amount),
        ),
      );
    }

    for (const [invoiceId, amount] of invoiceTotals) {
      const invoice = await InvoiceModel.findOne({
        _id: toObjectId(invoiceId, 'invoiceId'),
        facilityId: toObjectId(facilityId, 'facilityId'),
      })
        .session(session)
        .lean()
        .exec();

      if (invoice === null) {
        throw new PaymentAllocationConflictError(
          'A refund allocation references a missing invoice',
        );
      }

      const nextApplied = direction === 'REFUND'
        ? decimal(invoice.paymentsAppliedAmount).minus(amount)
        : decimal(invoice.paymentsAppliedAmount).plus(amount);
      const nextOutstanding = direction === 'REFUND'
        ? decimal(invoice.outstandingAmount).plus(amount)
        : decimal(invoice.outstandingAmount).minus(amount);

      if (nextApplied.isNegative() || nextOutstanding.isNegative()) {
        throw new PaymentAllocationConflictError(
          'The invoice totals cannot become negative during refund processing',
        );
      }

      const actorId = toObjectId(metadata.actorUserId, 'actorUserId');
      const updated = await InvoiceModel.findOneAndUpdate(
        {
          _id: invoice._id,
          facilityId: invoice.facilityId,
          version: invoice.version,
        },
        {
          $set: {
            paymentsAppliedAmount: paymentCashierDecimal128(
              nextApplied.toFixed(),
              'paymentsAppliedAmount',
            ),
            outstandingAmount: paymentCashierDecimal128(
              nextOutstanding.toFixed(),
              'outstandingAmount',
            ),
            status: nextOutstanding.isZero()
              ? 'PAID'
              : nextApplied.isZero()
                ? 'FINALIZED'
                : 'PARTIALLY_PAID',
            updatedBy: actorId,
            transactionId: metadata.transactionId,
            correlationId: metadata.correlationId,
          },
          $inc: { version: 1 },
        },
        {
          new: true,
          session,
          runValidators: true,
        },
      )
        .lean()
        .exec();

      if (updated === null) {
        throw new PaymentCashierConcurrencyError();
      }
    }
  }

  private applyTenderRefund(
    tenders: PaymentRecord['tenders'],
    refundAmount: Decimal,
    reverse: boolean,
  ): PaymentRecord['tenders'] {
    let remaining = refundAmount;
    const ordered = [...tenders].sort((left, right) =>
      reverse
        ? right.sequence - left.sequence
        : left.sequence - right.sequence,
    );

    const updated = ordered.map((tender) => {
      if (remaining.isZero()) {
        return tender;
      }

      const currentRefunded = decimal(tender.refundedAmount);
      const capacity = reverse
        ? currentRefunded
        : decimal(tender.amount).minus(currentRefunded);
      const change = Decimal.min(remaining, capacity);
      const nextRefunded = reverse
        ? currentRefunded.minus(change)
        : currentRefunded.plus(change);
      remaining = remaining.minus(change);

      return {
        ...tender,
        refundedAmount: paymentCashierDecimal128(
          nextRefunded.toFixed(),
          'tender.refundedAmount',
        ),
        status: nextRefunded.isZero()
          ? 'POSTED'
          : nextRefunded.equals(decimal(tender.amount))
            ? 'REFUNDED'
            : 'PARTIALLY_REFUNDED',
      };
    });

    if (!remaining.isZero()) {
      throw new PaymentRefundableBalanceError();
    }

    return updated.sort((left, right) => left.sequence - right.sequence);
  }

  private async changeAccountCredit(
    facilityId: string,
    patientAccountId: string,
    paymentsAppliedDelta: Decimal,
    refundableDelta: Decimal,
    creditsDelta: Decimal,
    metadata: MutationMetadata,
    session: PaymentCashierMongoSession,
  ): Promise<void> {
    const account = await PatientAccountModel.findOne({
      _id: toObjectId(patientAccountId, 'patientAccountId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    })
      .session(session)
      .lean()
      .exec();

    if (account === null) {
      throw new PaymentAllocationConflictError(
        'The patient account no longer exists',
      );
    }

    const nextPayments = decimal(account.paymentsAppliedTotal).plus(
      paymentsAppliedDelta,
    );
    const nextRefundable = decimal(account.refundableBalance).plus(
      refundableDelta,
    );
    const nextCredits = decimal(account.creditsTotal).plus(creditsDelta);

    if (
      nextPayments.isNegative() ||
      nextRefundable.isNegative() ||
      nextCredits.isNegative()
    ) {
      throw new PaymentRefundableBalanceError();
    }

    const updated = await PatientAccountModel.findOneAndUpdate(
      {
        _id: account._id,
        facilityId: account.facilityId,
        version: account.version,
      },
      {
        $set: {
          paymentsAppliedTotal: paymentCashierDecimal128(
            nextPayments.toFixed(),
            'paymentsAppliedTotal',
          ),
          refundableBalance: paymentCashierDecimal128(
            nextRefundable.toFixed(),
            'refundableBalance',
          ),
          creditsTotal: paymentCashierDecimal128(
            nextCredits.toFixed(),
            'creditsTotal',
          ),
          updatedBy: toObjectId(metadata.actorUserId, 'actorUserId'),
          transactionId: metadata.transactionId,
          correlationId: metadata.correlationId,
        },
        $inc: { version: 1 },
      },
      {
        new: true,
        session,
        runValidators: true,
      },
    )
      .lean()
      .exec();

    if (updated === null) {
      throw new PaymentCashierConcurrencyError();
    }
  }
}