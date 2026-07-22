import Decimal from 'decimal.js';

import {
  WELFARE_ZAKAT_MONEY_SCALE,
} from './welfare-zakat.constants.js';
import {
  AssistanceApprovalLimitExceededError,
  AssistanceFinancialReconciliationError,
  AssistanceFundBalanceExceededError,
  AssistanceInvalidDecimalError,
  AssistanceInvoiceBalanceExceededError,
  AssistanceNegativeAmountError,
  AssistanceNegativeFundBalanceError,
  AssistancePatientResponsibilityExceededError,
  AssistancePositiveAmountRequiredError,
  AssistanceReservationExceededError,
  AssistanceReversalExceededError,
} from './welfare-zakat.errors.js';

export interface FundPositionInput {
  openingBalance: string;
  inflowAmount: string;
  transferInAmount: string;
  adjustmentIncreaseAmount: string;
  utilizationReversalAmount: string;
  refundAmount: string;
  repaymentAmount: string;
  recoveryAmount: string;
  transferOutAmount: string;
  adjustmentDecreaseAmount: string;
  utilizationAmount: string;
  writeOffAmount: string;
  reservedAmount: string;
  committedAmount: string;
}

export interface FundPositionResult {
  totalCredits: string;
  totalDebits: string;
  ledgerBalance: string;
  reservedBalance: string;
  committedBalance: string;
  availableBalance: string;
  utilizedBalance: string;
  reversedBalance: string;
}

export interface AssistanceCapacityInput {
  requestedAmount: string;
  fundAvailableAmount: string;
  approvalRemainingAmount: string;
  patientResponsibilityAmount: string;
  invoiceOutstandingAmount: string;
  invoiceLineOutstandingAmount?: string | null;
  reservationRemainingAmount?: string | null;
  patientPeriodRemainingAmount?: string | null;
  patientLifetimeRemainingAmount?: string | null;
  perInvoiceRemainingAmount?: string | null;
  perServiceRemainingAmount?: string | null;
}

export interface AssistanceCapacityResult {
  requestedAmount: string;
  allowableAmount: string;
  fundAvailableAmount: string;
  approvalRemainingAmount: string;
  patientResponsibilityAmount: string;
  invoiceOutstandingAmount: string;
  invoiceLineOutstandingAmount: string | null;
  reservationRemainingAmount: string | null;
  patientPeriodRemainingAmount: string | null;
  patientLifetimeRemainingAmount: string | null;
  perInvoiceRemainingAmount: string | null;
  perServiceRemainingAmount: string | null;
  limitingFactors: readonly string[];
}

export interface InvoiceResponsibilityInput {
  netAmount: string;
  payerAmount: string;
  welfareAmount: string;
  patientAmount: string;
}

export interface InvoiceResponsibilityResult extends InvoiceResponsibilityInput {}

function decimal(field: string, value: Decimal.Value): Decimal {
  let parsed: Decimal;

  try {
    parsed = new Decimal(value);
  } catch {
    throw new AssistanceInvalidDecimalError(field);
  }

  if (!parsed.isFinite()) {
    throw new AssistanceInvalidDecimalError(field);
  }

  return parsed;
}

function money(field: string, value: Decimal.Value): Decimal {
  return decimal(field, value).toDecimalPlaces(
    WELFARE_ZAKAT_MONEY_SCALE,
    Decimal.ROUND_HALF_UP,
  );
}

function nonNegativeMoney(field: string, value: Decimal.Value): Decimal {
  const amount = money(field, value);
  if (amount.isNegative()) {
    throw new AssistanceNegativeAmountError(field);
  }
  return amount;
}

function positiveMoney(field: string, value: Decimal.Value): Decimal {
  const amount = nonNegativeMoney(field, value);
  if (!amount.greaterThan(0)) {
    throw new AssistancePositiveAmountRequiredError(field);
  }
  return amount;
}

function format(value: Decimal): string {
  return value.toFixed(WELFARE_ZAKAT_MONEY_SCALE);
}

function sum(values: readonly Decimal[]): Decimal {
  return values.reduce((total, value) => total.plus(value), new Decimal(0));
}

function optionalMoney(
  field: string,
  value: string | null | undefined,
): Decimal | null {
  return value == null ? null : nonNegativeMoney(field, value);
}

export function calculateFundPosition(
  input: FundPositionInput,
): FundPositionResult {
  const openingBalance = nonNegativeMoney('openingBalance', input.openingBalance);
  const inflowAmount = nonNegativeMoney('inflowAmount', input.inflowAmount);
  const transferInAmount = nonNegativeMoney(
    'transferInAmount',
    input.transferInAmount,
  );
  const adjustmentIncreaseAmount = nonNegativeMoney(
    'adjustmentIncreaseAmount',
    input.adjustmentIncreaseAmount,
  );
  const utilizationReversalAmount = nonNegativeMoney(
    'utilizationReversalAmount',
    input.utilizationReversalAmount,
  );
  const refundAmount = nonNegativeMoney('refundAmount', input.refundAmount);
  const repaymentAmount = nonNegativeMoney(
    'repaymentAmount',
    input.repaymentAmount,
  );
  const recoveryAmount = nonNegativeMoney('recoveryAmount', input.recoveryAmount);
  const transferOutAmount = nonNegativeMoney(
    'transferOutAmount',
    input.transferOutAmount,
  );
  const adjustmentDecreaseAmount = nonNegativeMoney(
    'adjustmentDecreaseAmount',
    input.adjustmentDecreaseAmount,
  );
  const utilizationAmount = nonNegativeMoney(
    'utilizationAmount',
    input.utilizationAmount,
  );
  const writeOffAmount = nonNegativeMoney('writeOffAmount', input.writeOffAmount);
  const reservedAmount = nonNegativeMoney('reservedAmount', input.reservedAmount);
  const committedAmount = nonNegativeMoney(
    'committedAmount',
    input.committedAmount,
  );

  const reversedBalance = sum([
    utilizationReversalAmount,
    refundAmount,
    repaymentAmount,
    recoveryAmount,
  ]);

  if (reversedBalance.greaterThan(utilizationAmount)) {
    throw new AssistanceFinancialReconciliationError(
      'Cumulative utilization reversals, refunds, repayments, and recoveries cannot exceed cumulative utilization',
    );
  }

  const totalCredits = sum([
    openingBalance,
    inflowAmount,
    transferInAmount,
    adjustmentIncreaseAmount,
    reversedBalance,
  ]);
  const totalDebits = sum([
    transferOutAmount,
    adjustmentDecreaseAmount,
    utilizationAmount,
    writeOffAmount,
  ]);
  const ledgerBalance = totalCredits.minus(totalDebits);

  if (ledgerBalance.isNegative()) {
    throw new AssistanceNegativeFundBalanceError();
  }

  const availableBalance = ledgerBalance.minus(reservedAmount).minus(committedAmount);
  if (availableBalance.isNegative()) {
    throw new AssistanceNegativeFundBalanceError();
  }

  return {
    totalCredits: format(totalCredits),
    totalDebits: format(totalDebits),
    ledgerBalance: format(ledgerBalance),
    reservedBalance: format(reservedAmount),
    committedBalance: format(committedAmount),
    availableBalance: format(availableBalance),
    utilizedBalance: format(utilizationAmount.minus(reversedBalance)),
    reversedBalance: format(reversedBalance),
  };
}

export function calculateApprovalRemaining(input: Readonly<{
  approvedAmount: string;
  reservedAmount: string;
  committedAmount: string;
  utilizedAmount: string;
  reversedAmount: string;
  releasedAmount: string;
}>): string {
  const approvedAmount = nonNegativeMoney('approvedAmount', input.approvedAmount);
  const reservedAmount = nonNegativeMoney('reservedAmount', input.reservedAmount);
  const committedAmount = nonNegativeMoney('committedAmount', input.committedAmount);
  const utilizedAmount = nonNegativeMoney('utilizedAmount', input.utilizedAmount);
  const reversedAmount = nonNegativeMoney('reversedAmount', input.reversedAmount);
  const releasedAmount = nonNegativeMoney('releasedAmount', input.releasedAmount);

  const consumed = reservedAmount
    .plus(committedAmount)
    .plus(utilizedAmount)
    .minus(reversedAmount)
    .minus(releasedAmount);

  if (consumed.isNegative() || consumed.greaterThan(approvedAmount)) {
    throw new AssistanceFinancialReconciliationError(
      'Approval reservations, commitments, utilization, reversals, and releases do not reconcile',
    );
  }

  return format(approvedAmount.minus(consumed));
}

export function calculateAssistanceCapacity(
  input: AssistanceCapacityInput,
): AssistanceCapacityResult {
  const requestedAmount = positiveMoney('requestedAmount', input.requestedAmount);
  const candidates: readonly Readonly<{
    name: string;
    value: Decimal;
  }>[] = [
    {
      name: 'FUND_AVAILABLE',
      value: nonNegativeMoney('fundAvailableAmount', input.fundAvailableAmount),
    },
    {
      name: 'APPROVAL_REMAINING',
      value: nonNegativeMoney(
        'approvalRemainingAmount',
        input.approvalRemainingAmount,
      ),
    },
    {
      name: 'PATIENT_RESPONSIBILITY',
      value: nonNegativeMoney(
        'patientResponsibilityAmount',
        input.patientResponsibilityAmount,
      ),
    },
    {
      name: 'INVOICE_OUTSTANDING',
      value: nonNegativeMoney(
        'invoiceOutstandingAmount',
        input.invoiceOutstandingAmount,
      ),
    },
    ...(input.invoiceLineOutstandingAmount == null
      ? []
      : [
          {
            name: 'INVOICE_LINE_OUTSTANDING',
            value: nonNegativeMoney(
              'invoiceLineOutstandingAmount',
              input.invoiceLineOutstandingAmount,
            ),
          },
        ]),
    ...(input.reservationRemainingAmount == null
      ? []
      : [
          {
            name: 'RESERVATION_REMAINING',
            value: nonNegativeMoney(
              'reservationRemainingAmount',
              input.reservationRemainingAmount,
            ),
          },
        ]),
    ...(input.patientPeriodRemainingAmount == null
      ? []
      : [
          {
            name: 'PATIENT_PERIOD_REMAINING',
            value: nonNegativeMoney(
              'patientPeriodRemainingAmount',
              input.patientPeriodRemainingAmount,
            ),
          },
        ]),
    ...(input.patientLifetimeRemainingAmount == null
      ? []
      : [
          {
            name: 'PATIENT_LIFETIME_REMAINING',
            value: nonNegativeMoney(
              'patientLifetimeRemainingAmount',
              input.patientLifetimeRemainingAmount,
            ),
          },
        ]),
    ...(input.perInvoiceRemainingAmount == null
      ? []
      : [
          {
            name: 'PER_INVOICE_REMAINING',
            value: nonNegativeMoney(
              'perInvoiceRemainingAmount',
              input.perInvoiceRemainingAmount,
            ),
          },
        ]),
    ...(input.perServiceRemainingAmount == null
      ? []
      : [
          {
            name: 'PER_SERVICE_REMAINING',
            value: nonNegativeMoney(
              'perServiceRemainingAmount',
              input.perServiceRemainingAmount,
            ),
          },
        ]),
  ];

  const allowableAmount = Decimal.min(...candidates.map((item) => item.value));
  const limitingFactors = candidates
    .filter((item) => item.value.equals(allowableAmount))
    .map((item) => item.name);

  return {
    requestedAmount: format(requestedAmount),
    allowableAmount: format(allowableAmount),
    fundAvailableAmount: format(candidates[0]!.value),
    approvalRemainingAmount: format(candidates[1]!.value),
    patientResponsibilityAmount: format(candidates[2]!.value),
    invoiceOutstandingAmount: format(candidates[3]!.value),
    invoiceLineOutstandingAmount:
      optionalMoney(
        'invoiceLineOutstandingAmount',
        input.invoiceLineOutstandingAmount,
      )?.toFixed(WELFARE_ZAKAT_MONEY_SCALE) ?? null,
    reservationRemainingAmount:
      optionalMoney(
        'reservationRemainingAmount',
        input.reservationRemainingAmount,
      )?.toFixed(WELFARE_ZAKAT_MONEY_SCALE) ?? null,
    patientPeriodRemainingAmount:
      optionalMoney(
        'patientPeriodRemainingAmount',
        input.patientPeriodRemainingAmount,
      )?.toFixed(WELFARE_ZAKAT_MONEY_SCALE) ?? null,
    patientLifetimeRemainingAmount:
      optionalMoney(
        'patientLifetimeRemainingAmount',
        input.patientLifetimeRemainingAmount,
      )?.toFixed(WELFARE_ZAKAT_MONEY_SCALE) ?? null,
    perInvoiceRemainingAmount:
      optionalMoney(
        'perInvoiceRemainingAmount',
        input.perInvoiceRemainingAmount,
      )?.toFixed(WELFARE_ZAKAT_MONEY_SCALE) ?? null,
    perServiceRemainingAmount:
      optionalMoney(
        'perServiceRemainingAmount',
        input.perServiceRemainingAmount,
      )?.toFixed(WELFARE_ZAKAT_MONEY_SCALE) ?? null,
    limitingFactors,
  };
}

export function assertAssistanceAllocation(
  input: AssistanceCapacityInput,
): AssistanceCapacityResult {
  const result = calculateAssistanceCapacity(input);
  const requested = new Decimal(result.requestedAmount);

  if (requested.greaterThan(result.fundAvailableAmount)) {
    throw new AssistanceFundBalanceExceededError();
  }
  if (requested.greaterThan(result.approvalRemainingAmount)) {
    throw new AssistanceApprovalLimitExceededError();
  }
  if (requested.greaterThan(result.patientResponsibilityAmount)) {
    throw new AssistancePatientResponsibilityExceededError();
  }
  if (requested.greaterThan(result.invoiceOutstandingAmount)) {
    throw new AssistanceInvoiceBalanceExceededError();
  }
  if (
    result.invoiceLineOutstandingAmount !== null &&
    requested.greaterThan(result.invoiceLineOutstandingAmount)
  ) {
    throw new AssistanceInvoiceBalanceExceededError();
  }
  if (
    result.reservationRemainingAmount !== null &&
    requested.greaterThan(result.reservationRemainingAmount)
  ) {
    throw new AssistanceReservationExceededError();
  }

  for (const limit of [
    result.patientPeriodRemainingAmount,
    result.patientLifetimeRemainingAmount,
    result.perInvoiceRemainingAmount,
    result.perServiceRemainingAmount,
  ]) {
    if (limit !== null && requested.greaterThan(limit)) {
      throw new AssistanceApprovalLimitExceededError();
    }
  }

  return result;
}

export function reconcileInvoiceResponsibility(
  input: InvoiceResponsibilityInput,
): InvoiceResponsibilityResult {
  const netAmount = nonNegativeMoney('netAmount', input.netAmount);
  const payerAmount = nonNegativeMoney('payerAmount', input.payerAmount);
  const welfareAmount = nonNegativeMoney('welfareAmount', input.welfareAmount);
  const patientAmount = nonNegativeMoney('patientAmount', input.patientAmount);

  if (!sum([payerAmount, welfareAmount, patientAmount]).equals(netAmount)) {
    throw new AssistanceFinancialReconciliationError(
      'Payer, welfare or Zakat, and patient responsibility must equal invoice net amount',
    );
  }

  return {
    netAmount: format(netAmount),
    payerAmount: format(payerAmount),
    welfareAmount: format(welfareAmount),
    patientAmount: format(patientAmount),
  };
}

export function applyAssistanceToResponsibility(input: Readonly<
  InvoiceResponsibilityInput & {
    allocationAmount: string;
  }
>): InvoiceResponsibilityResult {
  const before = reconcileInvoiceResponsibility(input);
  const allocationAmount = positiveMoney(
    'allocationAmount',
    input.allocationAmount,
  );
  const patientAmount = new Decimal(before.patientAmount);

  if (allocationAmount.greaterThan(patientAmount)) {
    throw new AssistancePatientResponsibilityExceededError();
  }

  return reconcileInvoiceResponsibility({
    netAmount: before.netAmount,
    payerAmount: before.payerAmount,
    welfareAmount: format(new Decimal(before.welfareAmount).plus(allocationAmount)),
    patientAmount: format(patientAmount.minus(allocationAmount)),
  });
}

export function reverseAssistanceFromResponsibility(input: Readonly<
  InvoiceResponsibilityInput & {
    reversalAmount: string;
  }
>): InvoiceResponsibilityResult {
  const before = reconcileInvoiceResponsibility(input);
  const reversalAmount = positiveMoney('reversalAmount', input.reversalAmount);
  const welfareAmount = new Decimal(before.welfareAmount);

  if (reversalAmount.greaterThan(welfareAmount)) {
    throw new AssistanceReversalExceededError();
  }

  return reconcileInvoiceResponsibility({
    netAmount: before.netAmount,
    payerAmount: before.payerAmount,
    welfareAmount: format(welfareAmount.minus(reversalAmount)),
    patientAmount: format(new Decimal(before.patientAmount).plus(reversalAmount)),
  });
}

export function reconcileFundTransfer(input: Readonly<{
  requestedAmount: string;
  sourceAvailableAmount: string;
  sourceDebitAmount: string;
  destinationCreditAmount: string;
}>): Readonly<{
  requestedAmount: string;
  sourceDebitAmount: string;
  destinationCreditAmount: string;
}> {
  const requestedAmount = positiveMoney('requestedAmount', input.requestedAmount);
  const sourceAvailableAmount = nonNegativeMoney(
    'sourceAvailableAmount',
    input.sourceAvailableAmount,
  );
  const sourceDebitAmount = nonNegativeMoney(
    'sourceDebitAmount',
    input.sourceDebitAmount,
  );
  const destinationCreditAmount = nonNegativeMoney(
    'destinationCreditAmount',
    input.destinationCreditAmount,
  );

  if (requestedAmount.greaterThan(sourceAvailableAmount)) {
    throw new AssistanceFundBalanceExceededError();
  }
  if (
    !sourceDebitAmount.equals(requestedAmount) ||
    !destinationCreditAmount.equals(requestedAmount)
  ) {
    throw new AssistanceFinancialReconciliationError(
      'Fund transfer source debit and destination credit must equal the approved transfer amount',
    );
  }

  return {
    requestedAmount: format(requestedAmount),
    sourceDebitAmount: format(sourceDebitAmount),
    destinationCreditAmount: format(destinationCreditAmount),
  };
}