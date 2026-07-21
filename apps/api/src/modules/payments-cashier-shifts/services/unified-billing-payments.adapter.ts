import Decimal from 'decimal.js';

import {
  AccountChargeModel,
  InvoiceModel,
  PatientAccountModel,
  decimal128ToString,
  toObjectId,
} from '@hospital-mis/database';

import {
  PaymentAllocationConflictError,
  PaymentCashierConcurrencyError,
  PaymentFinalizedInvoiceError,
  PaymentOutstandingBalanceError,
} from '../payments-cashier-shifts.errors.js';

import type {
  UnifiedBillingPaymentsPort,
} from '../payments-cashier-shifts.ports.js';

import type {
  InvoiceFinancialRecord,
  PatientAccountFinancialRecord,
  PaymentAllocationRecord,
  PaymentCashierMongoSession,
  PaymentRecord,
  RefundRecord,
} from '../payments-cashier-shifts.persistence.types.js';

import {
  paymentCashierDecimal128,
} from '../payments-cashier-shifts.normalization.js';

function record<T>(
  value: unknown,
): T {
  return value as T;
}

function decimal(
  value:
    Parameters<
      typeof decimal128ToString
    >[0],
): Decimal {
  return new Decimal(
    decimal128ToString(
      value,
    ),
  );
}

function allocationTotalByInvoice(
  allocations:
    readonly PaymentAllocationRecord[],
): Map<string, Decimal> {
  const result =
    new Map<string, Decimal>();

  for (const allocation of allocations) {
    if (
      allocation.invoiceId === null ||
      allocation.status !== 'ACTIVE'
    ) {
      continue;
    }

    const invoiceId =
      allocation.invoiceId.toHexString();

    result.set(
      invoiceId,
      (
        result.get(
          invoiceId,
        ) ??
        new Decimal(0)
      ).plus(
        decimal(
          allocation.amount,
        ),
      ),
    );
  }

  return result;
}

function allocationTotalByInvoiceIncludingReversed(
  allocations:
    readonly PaymentAllocationRecord[],
): Map<string, Decimal> {
  const result =
    new Map<string, Decimal>();

  for (const allocation of allocations) {
    if (allocation.invoiceId === null) {
      continue;
    }

    const invoiceId =
      allocation.invoiceId.toHexString();

    result.set(
      invoiceId,
      (
        result.get(
          invoiceId,
        ) ??
        new Decimal(0)
      ).plus(
        decimal(
          allocation.amount,
        ),
      ),
    );
  }

  return result;
}

export class MongoUnifiedBillingPaymentsAdapter
implements UnifiedBillingPaymentsPort {
  public async resolvePatientAccount(
    facilityId: string,
    patientAccountId: string,
    session:
      PaymentCashierMongoSession,
  ): Promise<PatientAccountFinancialRecord | null> {
    return record<PatientAccountFinancialRecord | null>(
      await PatientAccountModel.findOne({
        _id:
          toObjectId(
            patientAccountId,
            'patientAccountId',
          ),
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .session(
          session,
        )
        .lean()
        .exec(),
    );
  }

  public async resolveInvoice(
    facilityId: string,
    invoiceId: string,
    session:
      PaymentCashierMongoSession,
  ): Promise<InvoiceFinancialRecord | null> {
    return record<InvoiceFinancialRecord | null>(
      await InvoiceModel.findOne({
        _id:
          toObjectId(
            invoiceId,
            'invoiceId',
          ),
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .session(
          session,
        )
        .lean()
        .exec(),
    );
  }

  public async validateAllocations(
    facilityId: string,
    patientAccountId: string,
    allocations:
      readonly Readonly<{
        invoiceId?: string | null;
        accountChargeId?: string | null;
        amount: string;
      }>[],
    session:
      PaymentCashierMongoSession,
  ) {
    const account =
      await this.resolvePatientAccount(
        facilityId,
        patientAccountId,
        session,
      );

    if (
      account === null ||
      ![
        'OPEN',
        'FINALIZED',
      ].includes(
        account.status,
      )
    ) {
      throw new PaymentAllocationConflictError(
        'The patient account is not eligible for payment allocation',
      );
    }

    const invoiceRequested =
      new Map<string, Decimal>();
    let accountChargeTotal =
      new Decimal(0);
    let total =
      new Decimal(0);

    for (const allocation of allocations) {
      const amount =
        new Decimal(
          allocation.amount,
        );
      total =
        total.plus(
          amount,
        );

      if (allocation.invoiceId != null) {
        invoiceRequested.set(
          allocation.invoiceId,
          (
            invoiceRequested.get(
              allocation.invoiceId,
            ) ??
            new Decimal(0)
          ).plus(
            amount,
          ),
        );
      } else if (
        allocation.accountChargeId != null
      ) {
        const charge =
          await AccountChargeModel.findOne({
            _id:
              toObjectId(
                allocation.accountChargeId,
                'accountChargeId',
              ),
            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),
            patientAccountId:
              toObjectId(
                patientAccountId,
                'patientAccountId',
              ),
            status:
              'POSTED',
          })
            .session(
              session,
            )
            .lean()
            .exec();

        if (charge === null) {
          throw new PaymentAllocationConflictError(
            'The account charge is not eligible for payment allocation',
          );
        }

        accountChargeTotal =
          accountChargeTotal.plus(
            amount,
          );
      }
    }

    const invoices:
      InvoiceFinancialRecord[] = [];

    for (const [
      invoiceId,
      requestedAmount,
    ] of invoiceRequested) {
      const invoice =
        await this.resolveInvoice(
          facilityId,
          invoiceId,
          session,
        );

      if (
        invoice === null ||
        invoice.patientAccountId.toHexString() !==
          patientAccountId ||
        ![
          'FINALIZED',
          'PARTIALLY_PAID',
        ].includes(
          invoice.status,
        )
      ) {
        throw new PaymentFinalizedInvoiceError();
      }

      if (
        requestedAmount.greaterThan(
          decimal(
            invoice.outstandingAmount,
          ),
        )
      ) {
        throw new PaymentOutstandingBalanceError();
      }

      invoices.push(
        invoice,
      );
    }

    if (
      total.greaterThan(
        decimal(
          account.outstandingBalance,
        ),
      ) &&
      accountChargeTotal.greaterThan(0)
    ) {
      throw new PaymentOutstandingBalanceError();
    }

    return {
      authoritativeAllocationTotal:
        total.toFixed(),
      account,
      invoices,
    };
  }


  public async planAccountAllocation(
    facilityId: string,
    patientAccountId: string,
    amount: string,
    session: PaymentCashierMongoSession,
  ): Promise<readonly Readonly<{
    invoiceId: string;
    accountChargeId: null;
    amount: string;
  }>[]> {
    let remaining = new Decimal(amount);
    const invoices = await InvoiceModel.find({
      facilityId: toObjectId(facilityId, 'facilityId'),
      patientAccountId: toObjectId(
        patientAccountId,
        'patientAccountId',
      ),
      status: { $in: ['FINALIZED', 'PARTIALLY_PAID'] },
      outstandingAmount: { $gt: paymentCashierDecimal128('0', 'zero') },
    })
      .sort({ finalizedAt: 1, createdAt: 1, _id: 1 })
      .session(session)
      .lean()
      .exec();

    const result: Array<{
      invoiceId: string;
      accountChargeId: null;
      amount: string;
    }> = [];

    for (const invoice of invoices) {
      if (remaining.isZero()) {
        break;
      }

      const outstanding = decimal(invoice.outstandingAmount);
      const applied = Decimal.min(remaining, outstanding);

      if (applied.isPositive()) {
        result.push({
          invoiceId: invoice._id.toHexString(),
          accountChargeId: null,
          amount: applied.toFixed(),
        });
        remaining = remaining.minus(applied);
      }
    }

    if (!remaining.isZero()) {
      throw new PaymentOutstandingBalanceError();
    }

    return result;
  }

  public async applyPayment(
    facilityId: string,
    payment:
      PaymentRecord,
    allocations:
      readonly PaymentAllocationRecord[],
    session:
      PaymentCashierMongoSession,
  ): Promise<void> {
    const invoiceAmounts =
      allocationTotalByInvoice(
        allocations,
      );

    for (const [
      invoiceId,
      amount,
    ] of invoiceAmounts) {
      const invoice =
        await this.resolveInvoice(
          facilityId,
          invoiceId,
          session,
        );

      if (invoice === null) {
        throw new PaymentFinalizedInvoiceError();
      }

      const outstanding =
        decimal(
          invoice.outstandingAmount,
        );
      const applied =
        decimal(
          invoice.paymentsAppliedAmount,
        );
      const nextOutstanding =
        outstanding.minus(
          amount,
        );

      if (nextOutstanding.isNegative()) {
        throw new PaymentOutstandingBalanceError();
      }

      const updated =
        await InvoiceModel.findOneAndUpdate(
          {
            _id:
              invoice._id,
            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),
            version:
              invoice.version,
            status: {
              $in: [
                'FINALIZED',
                'PARTIALLY_PAID',
              ],
            },
          },
          {
            $set: {
              paymentsAppliedAmount:
                paymentCashierDecimal128(
                  applied.plus(
                    amount,
                  ).toFixed(),
                  'paymentsAppliedAmount',
                ),
              outstandingAmount:
                paymentCashierDecimal128(
                  nextOutstanding.toFixed(),
                  'outstandingAmount',
                ),
              status:
                nextOutstanding.isZero()
                  ? 'PAID'
                  : 'PARTIALLY_PAID',
              updatedBy:
                payment.updatedBy,
              transactionId:
                payment.transactionId,
              correlationId:
                payment.correlationId,
            },
            $inc: {
              version:
                1,
            },
          },
          {
            new:
              true,
            session,
            runValidators:
              true,
          },
        )
          .lean()
          .exec();

      if (updated === null) {
        throw new PaymentCashierConcurrencyError(
          'The invoice changed while the payment was being allocated',
        );
      }
    }

    const account =
      await this.resolvePatientAccount(
        facilityId,
        payment.patientAccountId.toHexString(),
        session,
      );

    if (account === null) {
      throw new PaymentAllocationConflictError(
        'The patient account no longer exists',
      );
    }

    const allocated =
      decimal(
        payment.allocatedAmount,
      );
    const unallocated =
      decimal(
        payment.unallocatedAmount,
      );
    const total =
      decimal(
        payment.amount,
      );
    const nextOutstanding =
      Decimal.max(
        new Decimal(0),
        decimal(
          account.outstandingBalance,
        ).minus(
          allocated,
        ),
      );

    const updatedAccount =
      await PatientAccountModel.findOneAndUpdate(
        {
          _id:
            account._id,
          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),
          version:
            account.version,
          status: {
            $in: [
              'OPEN',
              'FINALIZED',
            ],
          },
        },
        {
          $set: {
            paymentsAppliedTotal:
              paymentCashierDecimal128(
                decimal(
                  account.paymentsAppliedTotal,
                )
                  .plus(
                    total,
                  )
                  .toFixed(),
                'paymentsAppliedTotal',
              ),
            refundableBalance:
              paymentCashierDecimal128(
                decimal(
                  account.refundableBalance,
                )
                  .plus(
                    unallocated,
                  )
                  .toFixed(),
                'refundableBalance',
              ),
            outstandingBalance:
              paymentCashierDecimal128(
                nextOutstanding.toFixed(),
                'outstandingBalance',
              ),
            updatedBy:
              payment.updatedBy,
            transactionId:
              payment.transactionId,
            correlationId:
              payment.correlationId,
          },
          $inc: {
            version:
              1,
          },
        },
        {
          new:
            true,
          session,
          runValidators:
            true,
        },
      )
        .lean()
        .exec();

    if (updatedAccount === null) {
      throw new PaymentCashierConcurrencyError(
        'The patient account changed while the payment was being posted',
      );
    }
  }


  public async applyAdditionalAllocations(
    facilityId: string,
    payment: PaymentRecord,
    allocations: readonly PaymentAllocationRecord[],
    session: PaymentCashierMongoSession,
  ): Promise<void> {
    const allocationAmount = allocations.reduce(
      (sum, allocation) =>
        allocation.status === 'ACTIVE'
          ? sum.plus(decimal(allocation.amount))
          : sum,
      new Decimal(0),
    );

    if (allocationAmount.isZero()) {
      return;
    }

    const invoiceAmounts = allocationTotalByInvoice(allocations);

    for (const [invoiceId, amount] of invoiceAmounts) {
      const invoice = await this.resolveInvoice(
        facilityId,
        invoiceId,
        session,
      );

      if (
        invoice === null ||
        !['FINALIZED', 'PARTIALLY_PAID'].includes(invoice.status)
      ) {
        throw new PaymentFinalizedInvoiceError();
      }

      const nextOutstanding = decimal(
        invoice.outstandingAmount,
      ).minus(amount);

      if (nextOutstanding.isNegative()) {
        throw new PaymentOutstandingBalanceError();
      }

      const updated = await InvoiceModel.findOneAndUpdate(
        {
          _id: invoice._id,
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: invoice.version,
        },
        {
          $set: {
            paymentsAppliedAmount: paymentCashierDecimal128(
              decimal(invoice.paymentsAppliedAmount)
                .plus(amount)
                .toFixed(),
              'paymentsAppliedAmount',
            ),
            outstandingAmount: paymentCashierDecimal128(
              nextOutstanding.toFixed(),
              'outstandingAmount',
            ),
            status: nextOutstanding.isZero()
              ? 'PAID'
              : 'PARTIALLY_PAID',
            updatedBy: payment.updatedBy,
            transactionId: payment.transactionId,
            correlationId: payment.correlationId,
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
        throw new PaymentCashierConcurrencyError(
          'The invoice changed while unallocated funds were being applied',
        );
      }
    }

    const account = await this.resolvePatientAccount(
      facilityId,
      payment.patientAccountId.toHexString(),
      session,
    );

    if (account === null) {
      throw new PaymentAllocationConflictError(
        'The patient account no longer exists',
      );
    }

    const nextRefundable = decimal(account.refundableBalance).minus(
      allocationAmount,
    );
    const nextOutstanding = decimal(account.outstandingBalance).minus(
      allocationAmount,
    );

    if (nextRefundable.isNegative() || nextOutstanding.isNegative()) {
      throw new PaymentOutstandingBalanceError();
    }

    const updatedAccount = await PatientAccountModel.findOneAndUpdate(
      {
        _id: account._id,
        facilityId: toObjectId(facilityId, 'facilityId'),
        version: account.version,
      },
      {
        $set: {
          refundableBalance: paymentCashierDecimal128(
            nextRefundable.toFixed(),
            'refundableBalance',
          ),
          outstandingBalance: paymentCashierDecimal128(
            nextOutstanding.toFixed(),
            'outstandingBalance',
          ),
          updatedBy: payment.updatedBy,
          transactionId: payment.transactionId,
          correlationId: payment.correlationId,
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
      throw new PaymentCashierConcurrencyError(
        'The patient account changed while unallocated funds were being applied',
      );
    }
  }

  public async reversePaymentEffects(
    facilityId: string,
    payment:
      PaymentRecord,
    allocations:
      readonly PaymentAllocationRecord[],
    amount:
      string,
    session:
      PaymentCashierMongoSession,
  ): Promise<void> {
    const requested =
      new Decimal(
        amount,
      );
    const paymentAmount =
      decimal(
        payment.amount,
      );

    if (
      !requested.equals(
        paymentAmount,
      )
    ) {
      throw new PaymentAllocationConflictError(
        'Partial payment reversals must be processed through the refund workflow',
      );
    }

    const invoiceAmounts =
      allocationTotalByInvoiceIncludingReversed(
        allocations,
      );
    let reversedAllocationTotal =
      new Decimal(0);

    for (const [invoiceId, allocationAmount] of invoiceAmounts) {
      const invoice =
        await this.resolveInvoice(
          facilityId,
          invoiceId,
          session,
        );

      if (invoice === null) {
        throw new PaymentFinalizedInvoiceError();
      }

      const nextOutstanding =
        decimal(
          invoice.outstandingAmount,
        ).plus(
          allocationAmount,
        );
      const nextApplied =
        decimal(
          invoice.paymentsAppliedAmount,
        ).minus(
          allocationAmount,
        );

      if (nextApplied.isNegative()) {
        throw new PaymentAllocationConflictError(
          'The invoice payment total cannot become negative during reversal',
        );
      }

      const updated =
        await InvoiceModel.findOneAndUpdate(
          {
            _id:
              invoice._id,
            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),
            version:
              invoice.version,
          },
          {
            $set: {
              paymentsAppliedAmount:
                paymentCashierDecimal128(
                  nextApplied.toFixed(),
                  'paymentsAppliedAmount',
                ),
              outstandingAmount:
                paymentCashierDecimal128(
                  nextOutstanding.toFixed(),
                  'outstandingAmount',
                ),
              status:
                nextApplied.isZero()
                  ? 'FINALIZED'
                  : 'PARTIALLY_PAID',
              updatedBy:
                payment.updatedBy,
              transactionId:
                payment.transactionId,
              correlationId:
                payment.correlationId,
            },
            $inc: {
              version:
                1,
            },
          },
          {
            new:
              true,
            session,
            runValidators:
              true,
          },
        )
          .lean()
          .exec();

      if (updated === null) {
        throw new PaymentCashierConcurrencyError();
      }

      reversedAllocationTotal =
        reversedAllocationTotal.plus(
          allocationAmount,
        );
    }

    const unallocatedReversal =
      paymentAmount.minus(
        reversedAllocationTotal,
      );

    if (unallocatedReversal.isNegative()) {
      throw new PaymentAllocationConflictError(
        'Reversed allocations exceed the payment amount',
      );
    }

    const account =
      await this.resolvePatientAccount(
        facilityId,
        payment.patientAccountId.toHexString(),
        session,
      );

    if (account === null) {
      throw new PaymentAllocationConflictError(
        'The patient account no longer exists',
      );
    }

    const nextPaymentsApplied =
      decimal(
        account.paymentsAppliedTotal,
      ).minus(
        paymentAmount,
      );
    const nextRefundable =
      decimal(
        account.refundableBalance,
      ).minus(
        unallocatedReversal,
      );
    const nextOutstanding =
      decimal(
        account.outstandingBalance,
      ).plus(
        reversedAllocationTotal,
      );

    if (
      nextPaymentsApplied.isNegative() ||
      nextRefundable.isNegative()
    ) {
      throw new PaymentAllocationConflictError(
        'The patient-account payment balances cannot become negative during reversal',
      );
    }

    const updatedAccount =
      await PatientAccountModel.findOneAndUpdate(
        {
          _id:
            account._id,
          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),
          version:
            account.version,
        },
        {
          $set: {
            paymentsAppliedTotal:
              paymentCashierDecimal128(
                nextPaymentsApplied.toFixed(),
                'paymentsAppliedTotal',
              ),
            refundableBalance:
              paymentCashierDecimal128(
                nextRefundable.toFixed(),
                'refundableBalance',
              ),
            outstandingBalance:
              paymentCashierDecimal128(
                nextOutstanding.toFixed(),
                'outstandingBalance',
              ),
            updatedBy:
              payment.updatedBy,
            transactionId:
              payment.transactionId,
            correlationId:
              payment.correlationId,
          },
          $inc: {
            version:
              1,
          },
        },
        {
          new:
            true,
          session,
          runValidators:
            true,
        },
      )
        .lean()
        .exec();

    if (updatedAccount === null) {
      throw new PaymentCashierConcurrencyError(
        'The patient account changed while the payment was being reversed',
      );
    }
  }

  public async applyRefundEffects(
    facilityId: string,
    refund:
      RefundRecord,
    reversedAllocations:
      readonly PaymentAllocationRecord[],
    session:
      PaymentCashierMongoSession,
  ): Promise<void> {
    const refundAmount =
      decimal(
        refund.amount,
      );
    const invoiceAmounts =
      allocationTotalByInvoiceIncludingReversed(
        reversedAllocations,
      );
    let reversedAllocationTotal =
      new Decimal(0);

    for (const [invoiceId, allocationAmount] of invoiceAmounts) {
      const invoice =
        await this.resolveInvoice(
          facilityId,
          invoiceId,
          session,
        );

      if (invoice === null) {
        throw new PaymentFinalizedInvoiceError();
      }

      const nextApplied =
        decimal(
          invoice.paymentsAppliedAmount,
        ).minus(
          allocationAmount,
        );
      const nextOutstanding =
        decimal(
          invoice.outstandingAmount,
        ).plus(
          allocationAmount,
        );

      if (nextApplied.isNegative()) {
        throw new PaymentAllocationConflictError(
          'Refund allocation reversal exceeds the invoice payment total',
        );
      }

      const updatedInvoice =
        await InvoiceModel.findOneAndUpdate(
          {
            _id:
              invoice._id,
            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),
            version:
              invoice.version,
          },
          {
            $set: {
              paymentsAppliedAmount:
                paymentCashierDecimal128(
                  nextApplied.toFixed(),
                  'paymentsAppliedAmount',
                ),
              outstandingAmount:
                paymentCashierDecimal128(
                  nextOutstanding.toFixed(),
                  'outstandingAmount',
                ),
              status:
                nextApplied.isZero()
                  ? 'FINALIZED'
                  : 'PARTIALLY_PAID',
              updatedBy:
                refund.updatedBy,
              transactionId:
                refund.transactionId,
              correlationId:
                refund.correlationId,
            },
            $inc: {
              version:
                1,
            },
          },
          {
            new:
              true,
            session,
            runValidators:
              true,
          },
        )
          .lean()
          .exec();

      if (updatedInvoice === null) {
        throw new PaymentCashierConcurrencyError(
          'The invoice changed while the refund was being applied',
        );
      }

      reversedAllocationTotal =
        reversedAllocationTotal.plus(
          allocationAmount,
        );
    }

    const unallocatedRefund =
      refundAmount.minus(
        reversedAllocationTotal,
      );

    if (unallocatedRefund.isNegative()) {
      throw new PaymentAllocationConflictError(
        'Refund allocation reversals exceed the refund amount',
      );
    }

    const account =
      await this.resolvePatientAccount(
        facilityId,
        refund.patientAccountId.toHexString(),
        session,
      );

    if (account === null) {
      throw new PaymentAllocationConflictError(
        'The patient account no longer exists',
      );
    }

    const nextPaymentsApplied =
      decimal(
        account.paymentsAppliedTotal,
      ).minus(
        refundAmount,
      );
    const nextRefundable =
      decimal(
        account.refundableBalance,
      ).minus(
        unallocatedRefund,
      );
    const nextOutstanding =
      decimal(
        account.outstandingBalance,
      ).plus(
        reversedAllocationTotal,
      );

    if (
      nextPaymentsApplied.isNegative() ||
      nextRefundable.isNegative()
    ) {
      throw new PaymentAllocationConflictError(
        'The patient-account refund balances cannot become negative',
      );
    }

    const updatedAccount =
      await PatientAccountModel.findOneAndUpdate(
        {
          _id:
            account._id,
          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),
          version:
            account.version,
        },
        {
          $set: {
            paymentsAppliedTotal:
              paymentCashierDecimal128(
                nextPaymentsApplied.toFixed(),
                'paymentsAppliedTotal',
              ),
            refundableBalance:
              paymentCashierDecimal128(
                nextRefundable.toFixed(),
                'refundableBalance',
              ),
            outstandingBalance:
              paymentCashierDecimal128(
                nextOutstanding.toFixed(),
                'outstandingBalance',
              ),
            updatedBy:
              refund.updatedBy,
            transactionId:
              refund.transactionId,
            correlationId:
              refund.correlationId,
          },
          $inc: {
            version:
              1,
          },
        },
        {
          new:
            true,
          session,
          runValidators:
            true,
        },
      )
        .lean()
        .exec();

    if (updatedAccount === null) {
      throw new PaymentCashierConcurrencyError(
        'The patient account changed while the refund was being applied',
      );
    }
  }

  public async assertFinancialDischargeEligibility(
    facilityId: string,
    patientAccountId: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<void> {
    const query =
      PatientAccountModel.findOne({
        _id:
          toObjectId(
            patientAccountId,
            'patientAccountId',
          ),
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      }).lean();

    if (session !== undefined) {
      query.session(
        session,
      );
    }

    const account =
      await query.exec();

    if (
      account === null ||
      !decimal(
        account.outstandingBalance,
      ).isZero()
    ) {
      throw new PaymentOutstandingBalanceError();
    }
  }
}