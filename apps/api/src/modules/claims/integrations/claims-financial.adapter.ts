import Decimal from 'decimal.js';

import {
  ClaimModel,
  FinancialLedgerAccountModel,
  FinancialLedgerEntryModel,
  FinancialLedgerTransactionModel,
  InvoiceModel,
  PatientAccountModel,
  createObjectId,
  decimal128,
  decimal128ToString,
  toObjectId,
} from '@hospital-mis/database';

import {
  ClaimFinancialReconciliationError,
  ClaimVersionConflictError,
} from '../claims.errors.js';

import {
  stableClaimPayloadHash,
} from '../claims.normalization.js';

import type {
  ClaimsFinancialDischargePort,
  ClaimsFinancialLedgerPort,
  ClaimsTransactionContext,
} from '../claims.ports.js';

export interface ClaimLedgerPostingRule {
  debitAccountCode: string;
  creditAccountCode: string;
  description: string;
}

export interface ClaimsFinancialAdapterConfiguration {
  claimReceivable: ClaimLedgerPostingRule;
  eventRules: Readonly<Record<string, ClaimLedgerPostingRule>>;
}

interface FinancialPostingInput {
  operationKey: string;
  eventType: string;
  sourceRecordId: string;
  facilityId: string;
  actorUserId: string;
  correlationId: string;
  patientId: string;
  patientAccountId: string;
  invoiceId: string;
  paymentId?: string | null;
  currency: string;
  amount: string;
  rule: ClaimLedgerPostingRule;
  transaction: ClaimsTransactionContext;
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

export class MongoClaimsFinancialAdapter
implements ClaimsFinancialLedgerPort, ClaimsFinancialDischargePort {
  public constructor(
    private readonly configuration: ClaimsFinancialAdapterConfiguration,
  ) {}

  public async postClaimReceivable(
    input: Parameters<ClaimsFinancialLedgerPort['postClaimReceivable']>[0],
  ): Promise<void> {
    const claim = await ClaimModel.findOne({
      _id: toObjectId(input.claimId, 'claimId'),
      facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
      patientAccountId: toObjectId(
        input.patientAccountId,
        'patientAccountId',
      ),
      invoiceId: toObjectId(input.invoiceId, 'invoiceId'),
    })
      .session(input.transaction.session)
      .lean()
      .exec();
    if (claim === null) {
      throw new ClaimFinancialReconciliationError(
        'Claim receivable context was not found',
      );
    }

    await this.postBalanced({
      operationKey: `${input.transaction.transactionId}:claim-receivable:${input.claimId}`,
      eventType: 'CLAIM_RECEIVABLE_RECOGNIZED',
      sourceRecordId: input.claimId,
      facilityId: input.actor.facilityId,
      actorUserId: input.actor.userId,
      correlationId: input.actor.correlationId,
      patientId: claim.patientId.toHexString(),
      patientAccountId: input.patientAccountId,
      invoiceId: input.invoiceId,
      currency: claim.currency,
      amount: input.amount,
      rule: this.configuration.claimReceivable,
      transaction: input.transaction,
    });
  }

  public async postClaimFinancialEvent(
    input: Parameters<ClaimsFinancialLedgerPort['postClaimFinancialEvent']>[0],
  ): Promise<void> {
    const rule = this.configuration.eventRules[input.eventType];
    if (rule === undefined) {
      throw new ClaimFinancialReconciliationError(
        `No financial ledger rule is configured for ${input.eventType}`,
      );
    }

    await this.postBalanced({
      operationKey: `${input.transaction.transactionId}:${input.eventType}:${input.sourceRecordId}`,
      eventType: input.eventType,
      sourceRecordId: input.sourceRecordId,
      facilityId: input.actor.facilityId,
      actorUserId: input.actor.userId,
      correlationId: input.actor.correlationId,
      patientId: input.patientId,
      patientAccountId: input.patientAccountId,
      invoiceId: input.invoiceId,
      ...(input.paymentId === undefined
        ? {}
        : { paymentId: input.paymentId }),
      currency: input.currency,
      amount: input.amount,
      rule,
      transaction: input.transaction,
    });
  }

  public async refreshClearance(
    input: Parameters<ClaimsFinancialDischargePort['refreshClearance']>[0],
  ): Promise<void> {
    const [invoice, account] = await Promise.all([
      InvoiceModel.findOne({
        _id: toObjectId(input.invoiceId, 'invoiceId'),
        facilityId: toObjectId(input.facilityId, 'facilityId'),
        patientAccountId: toObjectId(
          input.patientAccountId,
          'patientAccountId',
        ),
      })
        .session(input.transaction.session)
        .lean()
        .exec(),
      PatientAccountModel.findOne({
        _id: toObjectId(input.patientAccountId, 'patientAccountId'),
        facilityId: toObjectId(input.facilityId, 'facilityId'),
      })
        .session(input.transaction.session)
        .lean()
        .exec(),
    ]);

    if (invoice === null || account === null) {
      throw new ClaimFinancialReconciliationError(
        'Financial discharge context was not found',
      );
    }
    if (!invoice.patientId.equals(account.patientId)) {
      throw new ClaimFinancialReconciliationError(
        'Invoice and patient account do not belong to the same patient',
      );
    }

    const outstanding = new Decimal(
      decimal128ToString(invoice.outstandingAmount),
    );
    let targetStatus = invoice.status;
    if (
      outstanding.isZero() &&
      ['FINALIZED', 'PARTIALLY_PAID'].includes(invoice.status)
    ) {
      targetStatus = 'PAID';
    } else if (
      outstanding.isPositive() &&
      invoice.status === 'PAID'
    ) {
      targetStatus = decimal128ToString(invoice.paymentsAppliedAmount) === '0.00'
        ? 'FINALIZED'
        : 'PARTIALLY_PAID';
    }

    if (targetStatus === invoice.status) {
      return;
    }

    const updated = await InvoiceModel.updateOne(
      {
        _id: invoice._id,
        facilityId: invoice.facilityId,
        version: invoice.version,
      },
      {
        $set: {
          status: targetStatus,
          updatedBy: toObjectId(input.actorUserId, 'updatedBy'),
          transactionId: input.transaction.transactionId,
        },
        $inc: { version: 1 },
      },
      {
        session: input.transaction.session,
        runValidators: true,
      },
    ).exec();

    if (updated.modifiedCount !== 1) {
      throw new ClaimVersionConflictError();
    }
  }

  private async postBalanced(input: FinancialPostingInput): Promise<void> {
    const amount = new Decimal(input.amount).toDecimalPlaces(
      2,
      Decimal.ROUND_HALF_UP,
    );
    if (amount.isZero()) {
      return;
    }
    if (amount.isNegative()) {
      throw new ClaimFinancialReconciliationError(
        'Claim ledger postings cannot contain a negative amount',
      );
    }

    const facilityId = toObjectId(input.facilityId, 'facilityId');
    const existing = await FinancialLedgerTransactionModel.findOne({
      facilityId,
      operationKey: input.operationKey,
    })
      .session(input.transaction.session)
      .lean()
      .exec();
    if (existing !== null) {
      return;
    }

    const debitCode = normalizeCode(input.rule.debitAccountCode);
    const creditCode = normalizeCode(input.rule.creditAccountCode);
    if (debitCode === creditCode) {
      throw new ClaimFinancialReconciliationError(
        'Claim ledger debit and credit accounts must be different',
      );
    }
    const accounts = await FinancialLedgerAccountModel.find({
      facilityId,
      accountCode: { $in: [debitCode, creditCode] },
      active: true,
      allowDirectPosting: true,
    })
      .session(input.transaction.session)
      .lean()
      .exec();
    if (accounts.length !== 2) {
      throw new ClaimFinancialReconciliationError(
        'A configured claim ledger account is inactive or unavailable',
      );
    }
    const accountByCode = new Map<string, Readonly<{ _id: unknown }>>(
      accounts.map((account): [string, Readonly<{ _id: unknown }>] => [
        String(account.accountCode),
        account as Readonly<{ _id: unknown }>,
      ]),
    );
    const debitAccount = accountByCode.get(debitCode);
    const creditAccount = accountByCode.get(creditCode);
    if (debitAccount === undefined || creditAccount === undefined) {
      throw new ClaimFinancialReconciliationError(
        'Claim ledger account resolution failed',
      );
    }

    const actorId = toObjectId(input.actorUserId, 'postedBy');
    const ledgerTransactionId = createObjectId();
    const postedAt = new Date();
    const journalHash = stableClaimPayloadHash({
      facilityId: input.facilityId,
      operationKey: input.operationKey,
    }).slice(0, 24).toUpperCase();
    const description = input.rule.description.trim();

    await FinancialLedgerTransactionModel.create(
      [{
        _id: ledgerTransactionId,
        facilityId,
        transactionId: input.transaction.transactionId,
        correlationId: input.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: actorId,
        updatedBy: actorId,
        operationKey: input.operationKey,
        journalNumber: `CLM-${journalHash}`,
        sourceModule: 'CLAIMS',
        sourceEntityType: input.eventType,
        sourceEntityId: toObjectId(
          input.sourceRecordId,
          'sourceRecordId',
        ),
        patientId: toObjectId(input.patientId, 'patientId'),
        patientAccountId: toObjectId(
          input.patientAccountId,
          'patientAccountId',
        ),
        invoiceId: toObjectId(input.invoiceId, 'invoiceId'),
        paymentId:
          input.paymentId == null
            ? null
            : toObjectId(input.paymentId, 'paymentId'),
        cashShiftId: null,
        cashCounterId: null,
        currency: input.currency,
        totalDebit: decimal128(amount.toFixed(2)),
        totalCredit: decimal128(amount.toFixed(2)),
        entryCount: 2,
        status: 'POSTED',
        postedAt,
        postedBy: actorId,
        description,
        reversalOfTransactionId: null,
        reversedByTransactionId: null,
        reversalReason: null,
        closedPeriodCode: null,
      }],
      { session: input.transaction.session },
    );

    await FinancialLedgerEntryModel.create(
      [
        {
          facilityId,
          transactionId: input.transaction.transactionId,
          correlationId: input.correlationId,
          schemaVersion: 1,
          version: 0,
          createdBy: actorId,
          updatedBy: actorId,
          ledgerTransactionId,
          lineNumber: 1,
          ledgerAccountId: debitAccount._id,
          ledgerAccountCodeSnapshot: debitCode,
          direction: 'DEBIT',
          amount: decimal128(amount.toFixed(2)),
          currency: input.currency,
          patientId: toObjectId(input.patientId, 'patientId'),
          patientAccountId: toObjectId(
            input.patientAccountId,
            'patientAccountId',
          ),
          invoiceId: toObjectId(input.invoiceId, 'invoiceId'),
          paymentId:
            input.paymentId == null
              ? null
              : toObjectId(input.paymentId, 'paymentId'),
          departmentId: null,
          serviceLineCode: null,
          chargeCatalogItemId: null,
          description,
          postedAt,
        },
        {
          facilityId,
          transactionId: input.transaction.transactionId,
          correlationId: input.correlationId,
          schemaVersion: 1,
          version: 0,
          createdBy: actorId,
          updatedBy: actorId,
          ledgerTransactionId,
          lineNumber: 2,
          ledgerAccountId: creditAccount._id,
          ledgerAccountCodeSnapshot: creditCode,
          direction: 'CREDIT',
          amount: decimal128(amount.toFixed(2)),
          currency: input.currency,
          patientId: toObjectId(input.patientId, 'patientId'),
          patientAccountId: toObjectId(
            input.patientAccountId,
            'patientAccountId',
          ),
          invoiceId: toObjectId(input.invoiceId, 'invoiceId'),
          paymentId:
            input.paymentId == null
              ? null
              : toObjectId(input.paymentId, 'paymentId'),
          departmentId: null,
          serviceLineCode: null,
          chargeCatalogItemId: null,
          description,
          postedAt,
        },
      ],
      {
        session: input.transaction.session,
        ordered: true,
      },
    );
  }
}