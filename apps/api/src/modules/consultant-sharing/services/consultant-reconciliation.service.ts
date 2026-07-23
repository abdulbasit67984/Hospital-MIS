import Decimal from 'decimal.js';

import {
  ConsultantRevenueEntryModel,
  ConsultantSettlementItemModel,
  ConsultantSettlementModel,
  ConsultantSettlementPaymentModel,
  FinancialLedgerEntryModel,
  FinancialLedgerTransactionModel,
  decimal128ToString,
  toObjectId,
} from '@hospital-mis/database';

import type { ConsultantSharingActorContext } from '../consultant-sharing.contracts.js';
import { ConsultantSharingAccessDeniedError } from '../consultant-sharing.errors.js';
import { calculateConsultantSettlementTotals } from '../consultant-sharing.financial-math.js';
import type {
  ConsultantLedgerReconciliationLine,
  ConsultantReconciliationResult,
  ConsultantRevenueReconciliationLine,
  ConsultantSettlementReconciliationLine,
} from '../consultant-sharing.contracts.js';
import type {
  ConsultantAuditPort,
  ConsultantClockPort,
  ConsultantReconciliationRepositoryPort,
  ConsultantReconciliationServicePort,
  ConsultantSharingAccessPolicyPort,
} from '../consultant-sharing.ports.js';

function money(value: unknown): Decimal {
  return new Decimal(value == null ? 0 : decimal128ToString(value as never))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function moneyString(value: Decimal.Value): string {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

function id(value: unknown): string {
  if (typeof value === 'object' && value != null && 'toHexString' in value) {
    return (value as { toHexString(): string }).toHexString();
  }
  return String(value);
}


export class MongoConsultantReconciliationRepository
implements ConsultantReconciliationRepositoryPort {
  public async reconcileRevenue(
    input: Parameters<ConsultantReconciliationRepositoryPort['reconcileRevenue']>[0],
  ): Promise<readonly ConsultantRevenueReconciliationLine[]> {
    const entries = await ConsultantRevenueEntryModel.find({
      facilityId: toObjectId(input.facilityId, 'facilityId'),
      occurredAt: { $gte: input.from, $lte: input.through },
    }).sort({ occurredAt: 1, _id: 1 }).lean().exec();

    return entries.map((entry) => {
      const record = entry as unknown as Record<string, unknown>;
      const netPayable = money(record['netPayableAmount']);
      const settled = money(record['settledAmount']);
      const expectedOutstanding = Decimal.max(0, netPayable.minus(settled));
      const persistedOutstanding = money(record['outstandingAmount']);
      const settlementId = record['settlementId'] == null ? null : id(record['settlementId']);
      const persistedStatus = String(record['status']) as ConsultantRevenueReconciliationLine['expectedStatus'];
      const expectedStatus: ConsultantRevenueReconciliationLine['expectedStatus'] =
        String(record['reversedByEntryId'] ?? '') !== '' || String(record['entryType']) === 'REVERSAL'
          ? persistedStatus
          : settlementId != null && expectedOutstanding.isZero()
            ? 'SETTLED'
            : persistedStatus === 'SETTLED' && settlementId == null
              ? 'POSTED'
              : persistedStatus;
      return {
        revenueEntryId: id(record['_id']),
        consultantId: id(record['consultantId']),
        expectedStatus,
        expectedOutstandingAmount: expectedOutstanding.toFixed(2),
        persistedOutstandingAmount: persistedOutstanding.toFixed(2),
        variance: expectedOutstanding.minus(persistedOutstanding).toFixed(2),
        settlementId,
      };
    });
  }

  public async reconcileSettlements(
    input: Parameters<ConsultantReconciliationRepositoryPort['reconcileSettlements']>[0],
  ): Promise<readonly ConsultantSettlementReconciliationLine[]> {
    const settlements = await ConsultantSettlementModel.find({
      facilityId: toObjectId(input.facilityId, 'facilityId'),
      createdAt: { $gte: input.from, $lte: input.through },
    }).sort({ createdAt: 1, _id: 1 }).lean().exec();
    const lines: ConsultantSettlementReconciliationLine[] = [];
    for (const settlement of settlements) {
      const record = settlement as unknown as Record<string, unknown>;
      const settlementId = id(record['_id']);
      const [items, payments] = await Promise.all([
        ConsultantSettlementItemModel.find({
          facilityId: toObjectId(input.facilityId, 'facilityId'),
          settlementId: record['_id'],
        }).lean().exec(),
        ConsultantSettlementPaymentModel.find({
          facilityId: toObjectId(input.facilityId, 'facilityId'),
          settlementId: record['_id'],
          status: 'PAID',
          reversedByPaymentId: null,
        }).lean().exec(),
      ]);
      const eligibleRevenue = items.reduce(
        (sum, item) => sum.plus(money((item as unknown as Record<string, unknown>)['eligibleRevenue'])),
        new Decimal(0),
      );
      const consultantShare = items.reduce(
        (sum, item) => sum.plus(money((item as unknown as Record<string, unknown>)['consultantShare'])),
        new Decimal(0),
      );
      const paidAmount = payments.reduce(
        (sum, payment) => sum.plus(money((payment as unknown as Record<string, unknown>)['amount'])),
        new Decimal(0),
      );
      const persistedNet = money(record['netPayableAmount']);
      const persistedOutstanding = money(record['outstandingAmount']);
      const expectedTotals = calculateConsultantSettlementTotals({
        openingBalance: moneyString(record['openingBalance']),
        broughtForwardBalance: moneyString(record['broughtForwardBalance']),
        eligibleRevenue: eligibleRevenue.toFixed(2),
        consultantShare: consultantShare.toFixed(2),
        adjustments: moneyString(record['adjustmentAmount']),
        refundDeductions: moneyString(record['refundDeductionAmount']),
        creditNoteDeductions: moneyString(record['creditNoteDeductionAmount']),
        debitNoteAdditions: moneyString(record['debitNoteAdditionAmount']),
        claimDeductions: moneyString(money(record['claimEffectAmount']).negated()),
        welfareZakatDeductions: moneyString(money(record['welfareZakatEffectAmount']).negated()),
        taxWithholding: moneyString(record['taxWithholdingAmount']),
        otherDeductions: moneyString(record['otherDeductionAmount']),
        advanceRecovery: moneyString(record['advanceRecoveryAmount']),
        overpaymentRecovery: moneyString(record['overpaymentRecoveryAmount']),
        paidAmount: paidAmount.toFixed(2),
      });
      const expectedOutstanding = new Decimal(expectedTotals.outstandingAmount);
      const expectedStatus: ConsultantSettlementReconciliationLine['expectedStatus'] =
        expectedOutstanding.isZero() && new Decimal(expectedTotals.netPayable).greaterThan(0)
          ? 'PAID'
          : paidAmount.greaterThan(0)
            ? 'PARTIALLY_PAID'
            : record['status'] as ConsultantSettlementReconciliationLine['expectedStatus'];
      const persistedTotals = {
        openingBalance: moneyString(record['openingBalance']),
        broughtForwardBalance: moneyString(record['broughtForwardBalance']),
        eligibleRevenue: moneyString(record['eligibleRevenue']),
        consultantShare: moneyString(record['consultantShare']),
        adjustments: moneyString(record['adjustmentAmount']),
        refundDeductions: moneyString(record['refundDeductionAmount']),
        creditNoteDeductions: moneyString(record['creditNoteDeductionAmount']),
        debitNoteAdditions: moneyString(record['debitNoteAdditionAmount']),
        claimDeductions: moneyString(money(record['claimEffectAmount']).negated()),
        welfareZakatDeductions: moneyString(money(record['welfareZakatEffectAmount']).negated()),
        taxWithholding: moneyString(record['taxWithholdingAmount']),
        otherDeductions: moneyString(record['otherDeductionAmount']),
        advanceRecovery: moneyString(record['advanceRecoveryAmount']),
        overpaymentRecovery: moneyString(record['overpaymentRecoveryAmount']),
        paidAmount: moneyString(record['paidAmount']),
        grossPayable: moneyString(record['grossPayableAmount']),
        totalDeductions: moneyString(record['totalDeductionAmount']),
        netPayable: persistedNet.toFixed(2),
        outstandingAmount: persistedOutstanding.toFixed(2),
      };
      lines.push({
        settlementId,
        consultantId: id(record['consultantId']),
        expectedStatus,
        expectedTotals,
        persistedTotals,
        netPayableVariance: new Decimal(expectedTotals.netPayable).minus(persistedNet).toFixed(2),
        paidVariance: paidAmount.minus(record['paidAmount'] == null ? 0 : money(record['paidAmount'])).toFixed(2),
        outstandingVariance: expectedOutstanding.minus(persistedOutstanding).toFixed(2),
      });
    }
    return lines;
  }

  public async reconcileLedger(
    input: Parameters<ConsultantReconciliationRepositoryPort['reconcileLedger']>[0],
  ): Promise<readonly ConsultantLedgerReconciliationLine[]> {
    const facilityId = toObjectId(input.facilityId, 'facilityId');
    const transactions = await FinancialLedgerTransactionModel.find({
      facilityId,
      sourceModule: 'CONSULTANT_SHARING',
      postedAt: { $gte: input.from, $lte: input.through },
      status: 'POSTED',
    }).sort({ postedAt: 1, _id: 1 }).lean().exec();
    const results: ConsultantLedgerReconciliationLine[] = [];
    for (const transaction of transactions) {
      const record = transaction as unknown as Record<string, unknown>;
      const entries = await FinancialLedgerEntryModel.find({
        facilityId,
        ledgerTransactionId: record['_id'],
      }).lean().exec();
      const debit = entries
        .filter((entry) => String((entry as unknown as Record<string, unknown>)['direction']) === 'DEBIT')
        .reduce((sum, entry) => sum.plus(money((entry as unknown as Record<string, unknown>)['amount'])), new Decimal(0));
      const credit = entries
        .filter((entry) => String((entry as unknown as Record<string, unknown>)['direction']) === 'CREDIT')
        .reduce((sum, entry) => sum.plus(money((entry as unknown as Record<string, unknown>)['amount'])), new Decimal(0));
      const expected = money(record['totalDebit']);
      const ledger = Decimal.min(debit, credit);
      const sourceType = String(record['sourceEntityType']);
      results.push({
        entityType: sourceType.includes('PAYOUT') ? 'PAYOUT' : sourceType.includes('SETTLEMENT') ? 'SETTLEMENT' : 'REVENUE_ENTRY',
        entityId: id(record['sourceEntityId']),
        expectedAmount: expected.toFixed(2),
        ledgerAmount: ledger.toFixed(2),
        variance: expected.minus(ledger).toFixed(2),
        ledgerTransactionIds: [id(record['_id'])],
      });
    }
    return results;
  }
}

export interface ConsultantReconciliationServiceDependencies {
  repository: ConsultantReconciliationRepositoryPort;
  accessPolicy: ConsultantSharingAccessPolicyPort;
  audit: ConsultantAuditPort;
  clock: ConsultantClockPort;
}

export class ConsultantReconciliationService
implements ConsultantReconciliationServicePort {
  public constructor(private readonly dependencies: ConsultantReconciliationServiceDependencies) {}

  public async run(
    input: Parameters<ConsultantReconciliationServicePort['run']>[0],
  ): Promise<ConsultantReconciliationResult> {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor: input.actor,
      action: 'RECONCILE',
      resourceFacilityId: input.actor.facilityId,
      sensitiveFinancialAction: false,
    });
    if (!decision.allowed) throw new ConsultantSharingAccessDeniedError(decision.denialReason);
    const [revenue, settlements, ledger] = await Promise.all([
      this.dependencies.repository.reconcileRevenue({ facilityId: input.actor.facilityId, from: input.from, through: input.through }),
      this.dependencies.repository.reconcileSettlements({ facilityId: input.actor.facilityId, from: input.from, through: input.through }),
      this.dependencies.repository.reconcileLedger({ facilityId: input.actor.facilityId, from: input.from, through: input.through }),
    ]);
    const totalVariance = [
      ...revenue.map((line) => line.variance),
      ...settlements.flatMap((line) => [line.netPayableVariance, line.paidVariance, line.outstandingVariance]),
      ...ledger.map((line) => line.variance),
    ].reduce((sum, value) => sum.plus(new Decimal(value).abs()), new Decimal(0));
    const generatedAt = this.dependencies.clock.now();
    const result: ConsultantReconciliationResult = {
      facilityId: input.actor.facilityId,
      from: input.from.toISOString(),
      through: input.through.toISOString(),
      revenue,
      settlements,
      ledger,
      totalVariance: totalVariance.toFixed(2),
      reconciled: totalVariance.isZero(),
      generatedAt: generatedAt.toISOString(),
    };
    await this.dependencies.audit.record({
      actor: input.actor,
      action: 'CONSULTANT_RECONCILIATION_RUN',
      entityType: 'ConsultantReconciliation',
      entityId: `${input.from.toISOString()}:${input.through.toISOString()}`,
      after: {
        reconciled: result.reconciled,
        totalVariance: result.totalVariance,
        revenueVarianceCount: revenue.filter((line) => new Decimal(line.variance).abs().greaterThan(0)).length,
        settlementVarianceCount: settlements.filter((line) => [line.netPayableVariance, line.paidVariance, line.outstandingVariance].some((value) => new Decimal(value).abs().greaterThan(0))).length,
        ledgerVarianceCount: ledger.filter((line) => new Decimal(line.variance).abs().greaterThan(0)).length,
      },
      reason: 'Consultant revenue, settlement, payout, and ledger reconciliation',
    });
    return result;
  }
}