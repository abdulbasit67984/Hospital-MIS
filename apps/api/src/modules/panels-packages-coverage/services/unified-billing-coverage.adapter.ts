import Decimal from 'decimal.js';

import {
  CoverageDeterminationModel,
  InvoiceLineModel,
  InvoiceModel,
  decimal128,
  decimal128ToString,
  toObjectId,
} from '@hospital-mis/database';

import {
  PpcConcurrencyConflictError,
  PpcInvalidFinancialAllocationError,
} from '../panels-packages-coverage.errors.js';

import type {
  UnifiedBillingCoveragePort,
} from '../panels-packages-coverage.ports.js';

import {
  currentPpcTransactionContext,
} from '../../../infrastructure/panels-packages-coverage-transaction-manager.adapter.js';

function money(value: unknown): Decimal {
  return new Decimal(String(value ?? '0')).toDecimalPlaces(
    2,
    Decimal.ROUND_HALF_UP,
  );
}

export interface CoverageOverrideBillingInput {
  actorUserId: string;
  facilityId: string;
  invoiceId: string;
  determinationId: string;
  expectedInvoiceVersion: number;
}

export interface CoverageReversalBillingInput {
  actorUserId: string;
  facilityId: string;
  invoiceId: string;
  expectedInvoiceVersion: number;
}

export class MongoUnifiedBillingCoverageAdapter
implements UnifiedBillingCoveragePort {
  public async assertInvoiceEditable(
    facilityId: string,
    invoiceId: string,
  ): Promise<void> {
    const invoice = await InvoiceModel.findOne({
      _id: toObjectId(invoiceId, 'invoiceId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    }).lean().exec();

    if (
      invoice === null ||
      !['DRAFT', 'ACTIVE'].includes(invoice.status)
    ) {
      throw new Error('Invoice is not editable');
    }
  }

  public async applyPackageAndCoverageAllocations(
    input: Parameters<
      UnifiedBillingCoveragePort['applyPackageAndCoverageAllocations']
    >[0],
  ): Promise<void> {
    await this.applyDetermination({
      actorUserId: input.actor.userId,
      facilityId: input.actor.facilityId,
      invoiceId: input.invoiceId,
      determinationId: input.determinationId,
      expectedInvoiceVersion: input.expectedInvoiceVersion,
    });
  }

  public async applyOverride(
    input: CoverageOverrideBillingInput,
  ): Promise<void> {
    await this.applyDetermination(input);
  }

  public async reverseDetermination(
    input: CoverageReversalBillingInput,
  ): Promise<void> {
    const transaction = currentPpcTransactionContext();
    const session = transaction.session;

    const invoice = await InvoiceModel.findOne({
      _id: toObjectId(input.invoiceId, 'invoiceId'),
      facilityId: toObjectId(input.facilityId, 'facilityId'),
      version: input.expectedInvoiceVersion,
      status: {
        $in: ['DRAFT', 'ACTIVE'],
      },
    }).session(session).lean().exec();

    if (invoice === null) {
      throw new PpcConcurrencyConflictError();
    }

    const lines = await InvoiceLineModel.find({
      facilityId: invoice.facilityId,
      invoiceId: invoice._id,
    }).session(session).lean().exec();

    let patientTotal = new Decimal(0);
    let welfareTotal = new Decimal(0);

    for (const line of lines) {
      const net = money(decimal128ToString(line.netAmount));
      const welfare = money(decimal128ToString(line.welfareAmount));
      const patient = Decimal.max(0, net.minus(welfare));

      const updated = await InvoiceLineModel.updateOne(
        {
          _id: line._id,
          facilityId: line.facilityId,
          version: line.version,
        },
        {
          $set: {
            payerAmount: decimal128('0.00'),
            patientAmount: decimal128(patient.toFixed(2)),
            packageEnrollmentId: null,
            payerOrganizationId: null,
            patientCoverageId: null,
            updatedBy: toObjectId(input.actorUserId, 'updatedBy'),
            transactionId: transaction.transactionId,
          },
          $inc: {
            version: 1,
          },
        },
        {
          session,
          runValidators: true,
        },
      ).exec();

      if (updated.modifiedCount !== 1) {
        throw new PpcConcurrencyConflictError();
      }

      patientTotal = patientTotal.plus(patient);
      welfareTotal = welfareTotal.plus(welfare);
    }

    const outstanding = Decimal.max(
      0,
      patientTotal
        .plus(decimal128ToString(invoice.refundableAmount))
        .minus(decimal128ToString(invoice.paymentsAppliedAmount))
        .minus(decimal128ToString(invoice.creditsAppliedAmount)),
    );

    const updatedInvoice = await InvoiceModel.updateOne(
      {
        _id: invoice._id,
        facilityId: invoice.facilityId,
        version: invoice.version,
      },
      {
        $set: {
          payerAmount: decimal128('0.00'),
          patientAmount: decimal128(patientTotal.toFixed(2)),
          welfareAmount: decimal128(welfareTotal.toFixed(2)),
          outstandingAmount: decimal128(outstanding.toFixed(2)),
          updatedBy: toObjectId(input.actorUserId, 'updatedBy'),
          transactionId: transaction.transactionId,
        },
        $inc: {
          version: 1,
        },
      },
      {
        session,
        runValidators: true,
      },
    ).exec();

    if (updatedInvoice.modifiedCount !== 1) {
      throw new PpcConcurrencyConflictError();
    }
  }

  private async applyDetermination(
    input: CoverageOverrideBillingInput,
  ): Promise<void> {
    const transaction = currentPpcTransactionContext();
    const session = transaction.session;

    const determination = await CoverageDeterminationModel.findOne({
      _id: toObjectId(input.determinationId, 'determinationId'),
      facilityId: toObjectId(input.facilityId, 'facilityId'),
      invoiceId: toObjectId(input.invoiceId, 'invoiceId'),
      status: {
        $in: [
          'APPROVED',
          'PARTIALLY_APPROVED',
          'DENIED',
          'OVERRIDDEN',
        ],
      },
    }).session(session).lean().exec();

    if (determination === null) {
      throw new Error('Coverage determination was not found');
    }

    const invoice = await InvoiceModel.findOne({
      _id: toObjectId(input.invoiceId, 'invoiceId'),
      facilityId: toObjectId(input.facilityId, 'facilityId'),
      version: input.expectedInvoiceVersion,
      status: {
        $in: ['DRAFT', 'ACTIVE'],
      },
    }).session(session).lean().exec();

    if (invoice === null) {
      throw new PpcConcurrencyConflictError();
    }

    let payerTotal = new Decimal(0);
    let patientTotal = new Decimal(0);
    let welfareTotal = new Decimal(0);

    for (const allocation of determination.allocations) {
      const line = await InvoiceLineModel.findOne({
        _id: allocation.invoiceLineId,
        facilityId: invoice.facilityId,
        invoiceId: invoice._id,
      }).session(session).lean().exec();

      if (line === null) {
        throw new Error('Coverage invoice line was not found');
      }

      const net = money(decimal128ToString(line.netAmount));
      const welfare = money(decimal128ToString(line.welfareAmount));
      const payerAmount = money(
        decimal128ToString(allocation.packageAmount),
      ).plus(decimal128ToString(allocation.sponsorAmount));
      const patientAmount = money(
        decimal128ToString(allocation.patientAmount),
      );

      if (
        !payerAmount
          .plus(patientAmount)
          .plus(welfare)
          .equals(net)
      ) {
        throw new PpcInvalidFinancialAllocationError();
      }

      const updated = await InvoiceLineModel.updateOne(
        {
          _id: line._id,
          facilityId: line.facilityId,
          version: line.version,
        },
        {
          $set: {
            payerAmount: decimal128(payerAmount.toFixed(2)),
            patientAmount: decimal128(patientAmount.toFixed(2)),
            packageEnrollmentId: allocation.packageEnrollmentId,
            patientCoverageId: allocation.patientCoverageId,
            updatedBy: toObjectId(input.actorUserId, 'updatedBy'),
            transactionId: transaction.transactionId,
          },
          $inc: {
            version: 1,
          },
        },
        {
          session,
          runValidators: true,
        },
      ).exec();

      if (updated.modifiedCount !== 1) {
        throw new PpcConcurrencyConflictError();
      }

      payerTotal = payerTotal.plus(payerAmount);
      patientTotal = patientTotal.plus(patientAmount);
      welfareTotal = welfareTotal.plus(welfare);
    }

    const outstanding = Decimal.max(
      0,
      patientTotal
        .plus(decimal128ToString(invoice.refundableAmount))
        .minus(decimal128ToString(invoice.paymentsAppliedAmount))
        .minus(decimal128ToString(invoice.creditsAppliedAmount)),
    );

    const updatedInvoice = await InvoiceModel.updateOne(
      {
        _id: invoice._id,
        facilityId: invoice.facilityId,
        version: invoice.version,
      },
      {
        $set: {
          payerAmount: decimal128(payerTotal.toFixed(2)),
          patientAmount: decimal128(patientTotal.toFixed(2)),
          welfareAmount: decimal128(welfareTotal.toFixed(2)),
          outstandingAmount: decimal128(outstanding.toFixed(2)),
          updatedBy: toObjectId(input.actorUserId, 'updatedBy'),
          transactionId: transaction.transactionId,
        },
        $inc: {
          version: 1,
        },
      },
      {
        session,
        runValidators: true,
      },
    ).exec();

    if (updatedInvoice.modifiedCount !== 1) {
      throw new PpcConcurrencyConflictError();
    }
  }
}