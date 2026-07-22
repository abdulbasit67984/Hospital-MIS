import Decimal from 'decimal.js';

import {
  CLAIM_MONEY_SCALE,
} from './claims.constants.js';

import {
  ClaimAdjudicationReconciliationError,
  ClaimFinancialReconciliationError,
  ClaimInvalidDecimalError,
  ClaimNegativeAmountError,
  ClaimPaymentOverAllocationError,
  ClaimRemittanceReconciliationError,
} from './claims.errors.js';

export interface AuthoritativeClaimLineAllocation {
  grossAmount: string;
  packageAmount: string;
  sponsorAmount: string;
  patientAmount: string;
  deductibleAmount: string;
  copaymentAmount: string;
  coinsuranceAmount: string;
  excludedAmount: string;
}

export interface DerivedClaimLineFinancials {
  grossAmount: string;
  packageAmount: string;
  deductibleAmount: string;
  copaymentAmount: string;
  coinsuranceAmount: string;
  excludedAmount: string;
  patientOtherAmount: string;
  patientResponsibilityAmount: string;
  claimedAmount: string;
}

export interface ClaimAdjudicationFinancials {
  claimedAmount: string;
  approvedAmount: string;
  deniedAmount: string;
  disallowedAmount: string;
  returnedAmount: string;
  contractualAdjustmentAmount: string;
  adjudicatedReceivableAmount: string;
}

export interface ClaimReceivableInput {
  approvedAmount: string;
  paidAmount: string;
  contractualAdjustmentAmount: string;
  writeOffAmount: string;
  payerWithholdingAmount?: string;
  debitNoteAmount?: string;
  creditNoteAmount?: string;
  refundAmount?: string;
  repaymentAmount?: string;
}

export interface ClaimReceivableResult extends ClaimReceivableInput {
  payerWithholdingAmount: string;
  debitNoteAmount: string;
  creditNoteAmount: string;
  refundAmount: string;
  repaymentAmount: string;
  settledAmount: string;
  outstandingAmount: string;
  overpaymentAmount: string;
}

export interface ClaimFinancialAggregateLine {
  grossAmount: string;
  packageAmount: string;
  deductibleAmount: string;
  copaymentAmount: string;
  coinsuranceAmount: string;
  excludedAmount: string;
  patientOtherAmount: string;
  patientResponsibilityAmount: string;
  claimedAmount: string;
  approvedAmount: string;
  deniedAmount: string;
  disallowedAmount: string;
  returnedAmount: string;
  contractualAdjustmentAmount: string;
  writeOffAmount: string;
  paidAmount: string;
  outstandingAmount: string;
}

export interface ClaimFinancialAggregate extends ClaimFinancialAggregateLine {
  lineCount: number;
}

function decimal(field: string, value: Decimal.Value): Decimal {
  let parsed: Decimal;

  try {
    parsed = new Decimal(value);
  } catch {
    throw new ClaimInvalidDecimalError(field);
  }

  if (!parsed.isFinite()) {
    throw new ClaimInvalidDecimalError(field);
  }

  return parsed;
}

function money(field: string, value: Decimal.Value): Decimal {
  return decimal(field, value).toDecimalPlaces(
    CLAIM_MONEY_SCALE,
    Decimal.ROUND_HALF_UP,
  );
}

function nonNegativeMoney(field: string, value: Decimal.Value): Decimal {
  const amount = money(field, value);
  if (amount.isNegative()) {
    throw new ClaimNegativeAmountError(field);
  }
  return amount;
}

function format(value: Decimal): string {
  return value.toFixed(CLAIM_MONEY_SCALE);
}

function sum(values: readonly Decimal[]): Decimal {
  return values.reduce((total, value) => total.plus(value), new Decimal(0));
}

export function deriveClaimLineFinancials(
  allocation: AuthoritativeClaimLineAllocation,
): DerivedClaimLineFinancials {
  const grossAmount = nonNegativeMoney('grossAmount', allocation.grossAmount);
  const packageAmount = nonNegativeMoney('packageAmount', allocation.packageAmount);
  const sponsorAmount = nonNegativeMoney('sponsorAmount', allocation.sponsorAmount);
  const patientAmount = nonNegativeMoney('patientAmount', allocation.patientAmount);
  const deductibleAmount = nonNegativeMoney('deductibleAmount', allocation.deductibleAmount);
  const copaymentAmount = nonNegativeMoney('copaymentAmount', allocation.copaymentAmount);
  const coinsuranceAmount = nonNegativeMoney('coinsuranceAmount', allocation.coinsuranceAmount);
  const excludedAmount = nonNegativeMoney('excludedAmount', allocation.excludedAmount);

  if (!packageAmount.plus(sponsorAmount).plus(patientAmount).equals(grossAmount)) {
    throw new ClaimFinancialReconciliationError(
      'Gross amount must equal package allocation plus sponsor responsibility plus patient responsibility',
    );
  }

  const identifiedPatientAmounts = deductibleAmount
    .plus(copaymentAmount)
    .plus(coinsuranceAmount)
    .plus(excludedAmount);

  if (identifiedPatientAmounts.greaterThan(patientAmount)) {
    throw new ClaimFinancialReconciliationError(
      'Patient financial components exceed authoritative patient responsibility',
    );
  }

  return {
    grossAmount: format(grossAmount),
    packageAmount: format(packageAmount),
    deductibleAmount: format(deductibleAmount),
    copaymentAmount: format(copaymentAmount),
    coinsuranceAmount: format(coinsuranceAmount),
    excludedAmount: format(excludedAmount),
    patientOtherAmount: format(patientAmount.minus(identifiedPatientAmounts)),
    patientResponsibilityAmount: format(patientAmount),
    claimedAmount: format(sponsorAmount),
  };
}

export function calculateClaimAdjudication(input: Readonly<{
  claimedAmount: string;
  approvedAmount: string;
  deniedAmount: string;
  disallowedAmount: string;
  returnedAmount: string;
  contractualAdjustmentAmount?: string;
}>): ClaimAdjudicationFinancials {
  const claimedAmount = nonNegativeMoney('claimedAmount', input.claimedAmount);
  const approvedAmount = nonNegativeMoney('approvedAmount', input.approvedAmount);
  const deniedAmount = nonNegativeMoney('deniedAmount', input.deniedAmount);
  const disallowedAmount = nonNegativeMoney('disallowedAmount', input.disallowedAmount);
  const returnedAmount = nonNegativeMoney('returnedAmount', input.returnedAmount);
  const contractualAdjustmentAmount = nonNegativeMoney(
    'contractualAdjustmentAmount',
    input.contractualAdjustmentAmount ?? '0',
  );

  if (!approvedAmount.plus(deniedAmount).plus(disallowedAmount).plus(returnedAmount).equals(claimedAmount)) {
    throw new ClaimAdjudicationReconciliationError();
  }

  if (contractualAdjustmentAmount.greaterThan(approvedAmount)) {
    throw new ClaimPaymentOverAllocationError();
  }

  return {
    claimedAmount: format(claimedAmount),
    approvedAmount: format(approvedAmount),
    deniedAmount: format(deniedAmount),
    disallowedAmount: format(disallowedAmount),
    returnedAmount: format(returnedAmount),
    contractualAdjustmentAmount: format(contractualAdjustmentAmount),
    adjudicatedReceivableAmount: format(approvedAmount.minus(contractualAdjustmentAmount)),
  };
}

export function calculateClaimReceivable(
  input: ClaimReceivableInput,
): ClaimReceivableResult {
  const approvedAmount = nonNegativeMoney('approvedAmount', input.approvedAmount);
  const paidAmount = nonNegativeMoney('paidAmount', input.paidAmount);
  const contractualAdjustmentAmount = nonNegativeMoney(
    'contractualAdjustmentAmount',
    input.contractualAdjustmentAmount,
  );
  const writeOffAmount = nonNegativeMoney('writeOffAmount', input.writeOffAmount);
  const payerWithholdingAmount = nonNegativeMoney(
    'payerWithholdingAmount',
    input.payerWithholdingAmount ?? '0',
  );
  const debitNoteAmount = nonNegativeMoney('debitNoteAmount', input.debitNoteAmount ?? '0');
  const creditNoteAmount = nonNegativeMoney('creditNoteAmount', input.creditNoteAmount ?? '0');
  const refundAmount = nonNegativeMoney('refundAmount', input.refundAmount ?? '0');
  const repaymentAmount = nonNegativeMoney('repaymentAmount', input.repaymentAmount ?? '0');

  const receivable = approvedAmount
    .plus(debitNoteAmount)
    .plus(refundAmount)
    .minus(creditNoteAmount)
    .minus(repaymentAmount);

  if (receivable.isNegative()) {
    throw new ClaimFinancialReconciliationError('Claim credits and repayments exceed the receivable basis');
  }

  const settledAmount = paidAmount
    .plus(contractualAdjustmentAmount)
    .plus(writeOffAmount)
    .plus(payerWithholdingAmount);
  const residual = receivable.minus(settledAmount);

  return {
    approvedAmount: format(approvedAmount),
    paidAmount: format(paidAmount),
    contractualAdjustmentAmount: format(contractualAdjustmentAmount),
    writeOffAmount: format(writeOffAmount),
    payerWithholdingAmount: format(payerWithholdingAmount),
    debitNoteAmount: format(debitNoteAmount),
    creditNoteAmount: format(creditNoteAmount),
    refundAmount: format(refundAmount),
    repaymentAmount: format(repaymentAmount),
    settledAmount: format(settledAmount),
    outstandingAmount: format(Decimal.max(residual, 0)),
    overpaymentAmount: format(Decimal.max(residual.negated(), 0)),
  };
}

export function reconcileRemittance(input: Readonly<{
  sponsorPaymentAmount: string;
  allocatedAmount: string;
  unappliedAmount: string;
}>): Readonly<{
  sponsorPaymentAmount: string;
  allocatedAmount: string;
  unappliedAmount: string;
}> {
  const sponsorPaymentAmount = nonNegativeMoney(
    'sponsorPaymentAmount',
    input.sponsorPaymentAmount,
  );
  const allocatedAmount = nonNegativeMoney('allocatedAmount', input.allocatedAmount);
  const unappliedAmount = nonNegativeMoney('unappliedAmount', input.unappliedAmount);

  if (!allocatedAmount.plus(unappliedAmount).equals(sponsorPaymentAmount)) {
    throw new ClaimRemittanceReconciliationError();
  }

  return {
    sponsorPaymentAmount: format(sponsorPaymentAmount),
    allocatedAmount: format(allocatedAmount),
    unappliedAmount: format(unappliedAmount),
  };
}

export function aggregateClaimFinancials(
  lines: readonly ClaimFinancialAggregateLine[],
): ClaimFinancialAggregate {
  const keys = [
    'grossAmount',
    'packageAmount',
    'deductibleAmount',
    'copaymentAmount',
    'coinsuranceAmount',
    'excludedAmount',
    'patientOtherAmount',
    'patientResponsibilityAmount',
    'claimedAmount',
    'approvedAmount',
    'deniedAmount',
    'disallowedAmount',
    'returnedAmount',
    'contractualAdjustmentAmount',
    'writeOffAmount',
    'paidAmount',
    'outstandingAmount',
  ] as const satisfies readonly (keyof ClaimFinancialAggregateLine)[];

  const aggregate = Object.fromEntries(
    keys.map((key) => [
      key,
      format(sum(lines.map((line) => nonNegativeMoney(key, line[key])))),
    ]),
  ) as unknown as ClaimFinancialAggregateLine;

  if (!new Decimal(aggregate.packageAmount)
    .plus(aggregate.patientResponsibilityAmount)
    .plus(aggregate.claimedAmount)
    .equals(aggregate.grossAmount)) {
    throw new ClaimFinancialReconciliationError('Aggregated source allocations do not reconcile');
  }

  return {
    ...aggregate,
    lineCount: lines.length,
  };
}