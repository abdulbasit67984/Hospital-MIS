import Decimal from 'decimal.js';
import { isValidObjectId } from 'mongoose';

import {
  ClaimAdjustmentModel,
  ClaimLineModel,
  ClaimModel,
  CreditNoteModel,
  DebitNoteModel,
  FinancialLedgerEntryModel,
  InvoiceFundAllocationModel,
  InvoiceLineModel,
  InvoiceModel,
  PackageEnrollmentModel,
  PaymentAllocationModel,
  RefundModel,
  decimal128ToString,
  toObjectId,
} from '@hospital-mis/database';

import type {
  AuthoritativeConsultantFinancialActivity,
  ConsultantRevenueEntryView,
} from '../consultant-sharing.contracts.js';
import {
  ConsultantRevenueReconciliationError,
  ConsultantSharingFacilityMismatchError,
} from '../consultant-sharing.errors.js';
import type {
  ConsultantFinancialChangeReference,
} from '../consultant-sharing.contracts.js';
import type {
  ConsultantAuthoritativeFinancialChangePort,
  ConsultantFinancialActivityPort,
  ConsultantSharingTransactionContext,
} from '../consultant-sharing.ports.js';
import { MongoConsultantRevenueEntryRepository } from '../repositories/consultant-revenue.repository.js';

function money(value: unknown): Decimal {
  const parsed = new Decimal(value == null ? 0 : decimal128ToString(value as never));
  if (!parsed.isFinite()) {
    throw new ConsultantRevenueReconciliationError('Authoritative financial data contains an invalid decimal');
  }
  return parsed.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function moneyString(value: Decimal.Value): string {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

function id(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'toHexString' in value) {
    return (value as { toHexString(): string }).toHexString();
  }
  return String(value);
}

function record(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

function date(value: unknown, fallback: Date): Date {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value : fallback;
}

function normalizeServiceCategory(line: Record<string, unknown>): AuthoritativeConsultantFinancialActivity['serviceCategory'] {
  const raw = String(
    line['categoryCodeSnapshot'] ?? line['sourceModuleSnapshot'] ?? 'MISCELLANEOUS',
  ).trim().toUpperCase();
  const mapping: Readonly<Record<string, AuthoritativeConsultantFinancialActivity['serviceCategory']>> = {
    REGISTRATION: 'REGISTRATION',
    CONSULTATION: 'CONSULTATION',
    ENCOUNTER: 'CONSULTATION',
    ADMISSION: 'ADMISSION',
    BED: 'BED',
    ROOM: 'ROOM',
    ICU: 'ICU',
    PROCEDURE: 'PROCEDURE',
    SURGERY: 'SURGERY',
    LAB: 'LABORATORY',
    LABORATORY: 'LABORATORY',
    RADIOLOGY: 'RADIOLOGY',
    PHARMACY: 'PHARMACY',
    PACKAGE: 'PACKAGE',
  };
  return mapping[raw] ?? 'MISCELLANEOUS';
}

function ratio(numerator: Decimal, denominator: Decimal): Decimal {
  if (denominator.lte(0) || numerator.lte(0)) return new Decimal(0);
  return Decimal.min(1, numerator.div(denominator));
}

function proportional(amount: Decimal, numerator: Decimal, denominator: Decimal): Decimal {
  return amount.mul(ratio(numerator, denominator)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function session(transaction?: ConsultantSharingTransactionContext) {
  return transaction?.session as never;
}

function lineWelfareAmount(
  allocations: readonly Record<string, unknown>[],
  invoiceLineId: string,
): Decimal {
  return allocations.reduce((total, allocation) => {
    const lines = Array.isArray(allocation['lines'])
      ? allocation['lines'] as readonly Record<string, unknown>[]
      : [];
    const allocationStatus = String(allocation['status'] ?? '');
    if (!['CONFIRMED', 'PARTIALLY_UTILIZED', 'UTILIZED'].includes(allocationStatus)) {
      return total;
    }
    return lines.reduce((lineTotal, allocationLine) => {
      if (id(allocationLine['invoiceLineId']) !== invoiceLineId) return lineTotal;
      const utilized = money(allocationLine['utilizedAmount'] ?? allocationLine['amount']);
      const reversed = money(allocationLine['reversedAmount']);
      const refunded = money(allocationLine['refundedAmount']);
      const repaid = money(allocationLine['repaidAmount']);
      const recovered = money(allocationLine['recoveredAmount']);
      return lineTotal.plus(Decimal.max(0, utilized.minus(reversed).minus(refunded).minus(repaid).minus(recovered)));
    }, total);
  }, new Decimal(0)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export class MongoConsultantFinancialActivityAdapter
implements ConsultantFinancialActivityPort, ConsultantAuthoritativeFinancialChangePort {
  private readonly revenueEntries = new MongoConsultantRevenueEntryRepository();

  public async getAuthoritativeActivity(
    input: Parameters<ConsultantFinancialActivityPort['getAuthoritativeActivity']>[0],
  ): Promise<AuthoritativeConsultantFinancialActivity | null> {
    return this.loadActivity(
      input.actor.facilityId,
      input.sourceFinancialEventId,
      input.invoiceLineId,
      input.transaction,
    );
  }

  public async listEligibleActivities(
    input: Parameters<ConsultantFinancialActivityPort['listEligibleActivities']>[0],
  ): Promise<readonly AuthoritativeConsultantFinancialActivity[]> {
    const facilityId = toObjectId(input.facilityId, 'facilityId');
    const invoices = await InvoiceModel.find({
      facilityId,
      status: { $in: ['FINALIZED', 'PARTIALLY_PAID', 'PAID'] },
      finalizedAt: { $gte: input.from, $lte: input.through },
    })
      .sort({ finalizedAt: 1, _id: 1 })
      .limit(input.limit)
      .lean()
      .exec();
    if (invoices.length === 0) return [];

    const lines = await InvoiceLineModel.find({
      facilityId,
      invoiceId: { $in: invoices.map((invoice) => invoice._id) },
      ...(input.afterSourceFinancialEventId != null && isValidObjectId(input.afterSourceFinancialEventId)
        ? { _id: { $gt: toObjectId(input.afterSourceFinancialEventId, 'afterSourceFinancialEventId') } }
        : {}),
    })
      .sort({ _id: 1 })
      .limit(input.limit)
      .lean()
      .exec();

    const results: AuthoritativeConsultantFinancialActivity[] = [];
    for (const line of lines) {
      const lineId = line._id.toHexString();
      const activity = await this.loadActivity(
        input.facilityId,
        lineId,
        lineId,
        undefined,
      );
      if (activity != null) results.push(activity);
    }
    return results;
  }

  public async loadChange(
    input: Parameters<ConsultantAuthoritativeFinancialChangePort['loadChange']>[0],
  ): Promise<Readonly<{
    originalEntry: ConsultantRevenueEntryView;
    changedActivity: AuthoritativeConsultantFinancialActivity;
  }> | null> {
    const originalEntry = await this.revenueEntries.findById({
      facilityId: input.actor.facilityId,
      revenueEntryId: input.source.sourceRecordId,
      transaction: input.transaction,
    });
    if (originalEntry == null) return null;
    if (originalEntry.facilityId !== input.actor.facilityId) {
      throw new ConsultantSharingFacilityMismatchError();
    }
    const changedActivity = await this.loadActivity(
      input.actor.facilityId,
      input.source.sourceFinancialEventId,
      input.source.invoiceLineId,
      input.transaction,
      input.source,
    );
    return changedActivity == null ? null : { originalEntry, changedActivity };
  }

  private async loadActivity(
    facilityIdValue: string,
    sourceFinancialEventId: string,
    invoiceLineIdValue: string,
    transaction?: ConsultantSharingTransactionContext,
    change?: ConsultantFinancialChangeReference,
  ): Promise<AuthoritativeConsultantFinancialActivity | null> {
    const facilityId = toObjectId(facilityIdValue, 'facilityId');
    const invoiceLineId = toObjectId(invoiceLineIdValue, 'invoiceLineId');
    const lineDocument = await InvoiceLineModel.findOne({ _id: invoiceLineId, facilityId })
      .session(session(transaction))
      .lean()
      .exec();
    if (lineDocument == null) return null;
    const line = record(lineDocument);
    const invoiceDocument = await InvoiceModel.findOne({
      _id: line['invoiceId'],
      facilityId,
    })
      .session(session(transaction))
      .lean()
      .exec();
    if (invoiceDocument == null) return null;
    const invoice = record(invoiceDocument);
    const invoiceStatus = String(invoice['status'] ?? '');
    const invoiceFinalized = ['FINALIZED', 'PARTIALLY_PAID', 'PAID'].includes(invoiceStatus);

    const [allocations, refunds, creditNotes, debitNotes, welfareAllocations, claimLines] = await Promise.all([
      PaymentAllocationModel.find({
        facilityId,
        invoiceId: invoiceDocument._id,
        status: 'ACTIVE',
      }).session(session(transaction)).lean().exec(),
      RefundModel.find({
        facilityId,
        'allocationEffects.invoiceId': invoiceDocument._id,
        status: 'POSTED',
      }).session(session(transaction)).lean().exec(),
      CreditNoteModel.find({
        facilityId,
        invoiceId: invoiceDocument._id,
        status: 'POSTED',
      }).session(session(transaction)).lean().exec(),
      DebitNoteModel.find({
        facilityId,
        invoiceId: invoiceDocument._id,
        status: 'POSTED',
      }).session(session(transaction)).lean().exec(),
      InvoiceFundAllocationModel.find({
        facilityId,
        invoiceId: invoiceDocument._id,
        'lines.invoiceLineId': invoiceLineId,
      }).session(session(transaction)).lean().exec(),
      ClaimLineModel.find({ facilityId, invoiceLineId })
        .session(session(transaction)).lean().exec(),
    ]);

    const linePatientAmount = money(line['patientAmount']);
    const invoicePatientAmount = money(invoice['patientAmount']);
    const allocatedInvoiceAmount = allocations.reduce(
      (sum, allocation) => sum.plus(money(record(allocation)['amount'])),
      new Decimal(0),
    );
    const refundedInvoiceAmount = refunds.reduce(
      (sum, refund) => sum.plus(money(record(refund)['amount'])),
      new Decimal(0),
    );
    const creditInvoiceAmount = creditNotes.reduce(
      (sum, note) => sum.plus(money(record(note)['amount'])),
      new Decimal(0),
    );
    const debitInvoiceAmount = debitNotes.reduce(
      (sum, note) => sum.plus(money(record(note)['amount'])),
      new Decimal(0),
    );
    const collectedAmount = proportional(
      allocatedInvoiceAmount,
      linePatientAmount,
      invoicePatientAmount,
    );
    const refundAmount = proportional(
      refundedInvoiceAmount,
      linePatientAmount,
      invoicePatientAmount,
    );
    const creditNoteAmount = proportional(
      creditInvoiceAmount,
      money(line['netAmount']),
      money(invoice['netAmount']),
    );
    const debitNoteAmount = proportional(
      debitInvoiceAmount,
      money(line['netAmount']),
      money(invoice['netAmount']),
    );
    const welfareZakatAmount = lineWelfareAmount(
      welfareAllocations.map(record),
      invoiceLineIdValue,
    );

    const firstClaimLine = claimLines[0] == null ? null : record(claimLines[0]);
    const claimId = id(firstClaimLine?.['claimId']);
    const claim = claimId == null
      ? null
      : await ClaimModel.findOne({ _id: toObjectId(claimId, 'claimId'), facilityId })
          .session(session(transaction)).lean().exec();
    const claimRecord = record(claim);
    const claimAdjustments = claimId == null
      ? []
      : await ClaimAdjustmentModel.find({
          facilityId,
          claimId: toObjectId(claimId, 'claimId'),
          status: { $in: ['POSTED', 'APPROVED'] },
        }).session(session(transaction)).lean().exec();
    const claimAdjustmentAmount = claimAdjustments.reduce(
      (sum, adjustment) => sum.plus(money(record(adjustment)['amount'])),
      new Decimal(0),
    );

    const packageEnrollmentId = id(line['packageEnrollmentId']);
    const packageEnrollment = packageEnrollmentId == null
      ? null
      : await PackageEnrollmentModel.findOne({
          _id: toObjectId(packageEnrollmentId, 'packageEnrollmentId'),
          facilityId,
        }).session(session(transaction)).lean().exec();
    const packageRecord = record(packageEnrollment);

    const sourceLedger = isValidObjectId(sourceFinancialEventId)
      ? await FinancialLedgerEntryModel.findOne({
          _id: toObjectId(sourceFinancialEventId, 'sourceFinancialEventId'),
          facilityId,
        }).session(session(transaction)).lean().exec()
      : null;

    const sourceOccurredAt = change == null
      ? date(sourceLedger?.postedAt, date(invoice['finalizedAt'], date(invoice['issuedAt'], new Date())))
      : new Date(change.occurredAt);
    const lineNet = money(line['netAmount']);
    const patientAmount = money(line['patientAmount']);
    const payerAmount = money(line['payerAmount']);
    const packageAmount = packageEnrollment == null ? new Decimal(0) : payerAmount;
    const sponsorAmount = Decimal.max(0, payerAmount.minus(packageAmount));
    const claimApprovedAmount = money(firstClaimLine?.['approvedAmount'] ?? claimRecord['approvedAmount']);
    const claimPaidAmount = money(firstClaimLine?.['paidAmount'] ?? claimRecord['paidAmount']);
    const invoiceOutstanding = money(invoice['outstandingAmount']);

    return {
      sourceFinancialEventId,
      sourceFinancialEventType: change?.kind ?? (sourceLedger == null ? 'INVOICE_FINALIZED' : 'FINANCIAL_LEDGER_POSTED'),
      sourceLedgerEntryId: id(sourceLedger?._id),
      sourceModule: String(line['sourceModuleSnapshot'] ?? 'UNIFIED_BILLING').toUpperCase(),
      sourceRecordId: id(line['sourceRecordId']) ?? invoiceLineIdValue,
      facilityId: facilityIdValue,
      patientId: id(invoice['patientId']) ?? '',
      encounterId: id(line['encounterId']),
      admissionId: id(line['admissionId']),
      invoiceId: id(invoiceDocument._id) ?? '',
      invoiceLineId: invoiceLineIdValue,
      paymentAllocationId: id(allocations[0]?._id),
      refundId: change?.refundId ?? id(refunds[0]?._id),
      creditNoteId: change?.creditNoteId ?? id(creditNotes[0]?._id),
      debitNoteId: change?.debitNoteId ?? id(debitNotes[0]?._id),
      claimId,
      packageId: id(packageRecord['treatmentPackageId']) ?? packageEnrollmentId,
      payerOrganizationId: id(line['payerOrganizationId']),
      panelProgramId: id(packageRecord['panelProgramId']) ?? id(claimRecord['panelProgramId']),
      departmentId: id(line['departmentId']),
      serviceId: id(line['serviceId']),
      serviceCategory: normalizeServiceCategory(line),
      chargeCatalogItemId: id(line['chargeCatalogItemId']) ?? '',
      procedureId: id(line['procedureId']) ?? id(line['sourceLineId']),
      currency: String(invoice['currency'] ?? line['currency'] ?? 'PKR').toUpperCase() as 'PKR',
      financialEventAt: sourceOccurredAt.toISOString(),
      invoiceFinalized,
      serviceCompleted: invoiceFinalized,
      invoiceFullyPaid: invoiceStatus === 'PAID' || invoiceOutstanding.isZero(),
      unitQuantity: moneyString(line['quantity'] == null ? 1 : money(line['quantity'])),
      grossAmount: moneyString(money(line['grossAmount'])),
      discountAmount: moneyString(money(line['discountAmount'])),
      netAmount: moneyString(lineNet),
      patientResponsibilityAmount: moneyString(patientAmount),
      sponsorResponsibilityAmount: moneyString(sponsorAmount),
      packageResponsibilityAmount: moneyString(packageAmount),
      welfareZakatAmount: moneyString(welfareZakatAmount),
      taxAmount: moneyString(money(line['taxAmount'])),
      serviceChargeAmount: '0.00',
      refundAmount: moneyString(refundAmount),
      creditNoteAmount: moneyString(creditNoteAmount),
      debitNoteAmount: moneyString(debitNoteAmount),
      writeOffAmount: moneyString(money(line['writeOffAmount'])),
      claimAdjustmentAmount: moneyString(claimAdjustmentAmount),
      nonShareableAmount: moneyString(money(line['nonShareableAmount'])),
      costDeductionAmount: moneyString(money(line['costAmount'])),
      consumableDeductionAmount: moneyString(money(line['consumableCostAmount'])),
      otherApprovedDeductionAmount: moneyString(money(line['otherDeductionAmount'])),
      collectedAmount: moneyString(Decimal.max(0, collectedAmount.minus(refundAmount))),
      collectionBasisAmount: moneyString(Decimal.max(0, collectedAmount.minus(refundAmount))),
      claimApprovedAmount: moneyString(claimApprovedAmount),
      claimBasisAmount: moneyString(claimApprovedAmount),
      claimPaidAmount: moneyString(claimPaidAmount),
    };
  }
}