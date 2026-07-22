import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  AssistanceApprovalLimitExceededError,
  AssistanceFinancialReconciliationError,
  AssistanceFundBalanceExceededError,
  AssistanceInvoiceBalanceExceededError,
  AssistancePatientResponsibilityExceededError,
  AssistanceReservationExceededError,
  AssistanceReversalExceededError,
} from '../welfare-zakat.errors.js';
import {
  applyAssistanceToResponsibility,
  assertAssistanceAllocation,
  calculateApprovalRemaining,
  calculateAssistanceCapacity,
  calculateFundPosition,
  reconcileFundTransfer,
  reconcileInvoiceResponsibility,
  reverseAssistanceFromResponsibility,
} from '../welfare-zakat.financial-math.js';

describe('welfare and Zakat exact financial calculations', () => {
  it('derives fund balances without floating-point arithmetic', () => {
    expect(
      calculateFundPosition({
        openingBalance: '1000.00',
        inflowAmount: '500.10',
        transferInAmount: '100.00',
        adjustmentIncreaseAmount: '25.00',
        utilizationReversalAmount: '50.00',
        refundAmount: '20.00',
        repaymentAmount: '10.00',
        recoveryAmount: '5.00',
        transferOutAmount: '100.00',
        adjustmentDecreaseAmount: '15.00',
        utilizationAmount: '400.00',
        writeOffAmount: '0.00',
        reservedAmount: '200.00',
        committedAmount: '100.00',
      }),
    ).toEqual({
      totalCredits: '1710.10',
      totalDebits: '515.00',
      ledgerBalance: '1195.10',
      reservedBalance: '200.00',
      committedBalance: '100.00',
      availableBalance: '895.10',
      utilizedBalance: '315.00',
      reversedBalance: '85.00',
    });
  });

  it('rejects fund positions whose returns exceed utilization', () => {
    expect(() =>
      calculateFundPosition({
        openingBalance: '100.00',
        inflowAmount: '0.00',
        transferInAmount: '0.00',
        adjustmentIncreaseAmount: '0.00',
        utilizationReversalAmount: '60.00',
        refundAmount: '50.00',
        repaymentAmount: '0.00',
        recoveryAmount: '0.00',
        transferOutAmount: '0.00',
        adjustmentDecreaseAmount: '0.00',
        utilizationAmount: '100.00',
        writeOffAmount: '0.00',
        reservedAmount: '0.00',
        committedAmount: '0.00',
      }),
    ).toThrow(AssistanceFinancialReconciliationError);
  });

  it('calculates approval remaining amounts exactly', () => {
    expect(
      calculateApprovalRemaining({
        approvedAmount: '1000.00',
        reservedAmount: '200.00',
        committedAmount: '150.00',
        utilizedAmount: '400.00',
        reversedAmount: '50.00',
        releasedAmount: '25.00',
      }),
    ).toBe('325.00');
  });

  it('calculates the authoritative allocation capacity and identifies limiting factors', () => {
    expect(
      calculateAssistanceCapacity({
        requestedAmount: '300.00',
        fundAvailableAmount: '1000.00',
        approvalRemainingAmount: '500.00',
        patientResponsibilityAmount: '450.00',
        invoiceOutstandingAmount: '425.00',
        invoiceLineOutstandingAmount: '325.00',
        reservationRemainingAmount: '325.00',
        patientPeriodRemainingAmount: '400.00',
        patientLifetimeRemainingAmount: '800.00',
        perInvoiceRemainingAmount: '350.00',
        perServiceRemainingAmount: '325.00',
      }),
    ).toMatchObject({
      requestedAmount: '300.00',
      allowableAmount: '325.00',
      limitingFactors: [
        'INVOICE_LINE_OUTSTANDING',
        'RESERVATION_REMAINING',
        'PER_SERVICE_REMAINING',
      ],
    });
  });

  it('enforces every authoritative allocation ceiling', () => {
    const base = {
      requestedAmount: '101.00',
      fundAvailableAmount: '100.00',
      approvalRemainingAmount: '1000.00',
      patientResponsibilityAmount: '1000.00',
      invoiceOutstandingAmount: '1000.00',
    };

    expect(() => assertAssistanceAllocation(base)).toThrow(
      AssistanceFundBalanceExceededError,
    );
    expect(() =>
      assertAssistanceAllocation({
        ...base,
        fundAvailableAmount: '1000.00',
        approvalRemainingAmount: '100.00',
      }),
    ).toThrow(AssistanceApprovalLimitExceededError);
    expect(() =>
      assertAssistanceAllocation({
        ...base,
        fundAvailableAmount: '1000.00',
        approvalRemainingAmount: '1000.00',
        patientResponsibilityAmount: '100.00',
      }),
    ).toThrow(AssistancePatientResponsibilityExceededError);
    expect(() =>
      assertAssistanceAllocation({
        ...base,
        fundAvailableAmount: '1000.00',
        approvalRemainingAmount: '1000.00',
        invoiceOutstandingAmount: '100.00',
      }),
    ).toThrow(AssistanceInvoiceBalanceExceededError);
    expect(() =>
      assertAssistanceAllocation({
        ...base,
        fundAvailableAmount: '1000.00',
        approvalRemainingAmount: '1000.00',
        reservationRemainingAmount: '100.00',
      }),
    ).toThrow(AssistanceReservationExceededError);
  });

  it('moves responsibility from patient to assistance without changing invoice net amount', () => {
    expect(
      applyAssistanceToResponsibility({
        netAmount: '1000.00',
        payerAmount: '500.00',
        welfareAmount: '100.00',
        patientAmount: '400.00',
        allocationAmount: '125.00',
      }),
    ).toEqual({
      netAmount: '1000.00',
      payerAmount: '500.00',
      welfareAmount: '225.00',
      patientAmount: '275.00',
    });

    expect(
      reverseAssistanceFromResponsibility({
        netAmount: '1000.00',
        payerAmount: '500.00',
        welfareAmount: '225.00',
        patientAmount: '275.00',
        reversalAmount: '125.00',
      }),
    ).toEqual({
      netAmount: '1000.00',
      payerAmount: '500.00',
      welfareAmount: '100.00',
      patientAmount: '400.00',
    });
  });

  it('rejects unreconciled invoice responsibility and excessive reversals', () => {
    expect(() =>
      reconcileInvoiceResponsibility({
        netAmount: '100.00',
        payerAmount: '25.00',
        welfareAmount: '25.00',
        patientAmount: '25.00',
      }),
    ).toThrow(AssistanceFinancialReconciliationError);

    expect(() =>
      reverseAssistanceFromResponsibility({
        netAmount: '100.00',
        payerAmount: '20.00',
        welfareAmount: '10.00',
        patientAmount: '70.00',
        reversalAmount: '11.00',
      }),
    ).toThrow(AssistanceReversalExceededError);
  });

  it('requires balanced source and destination entries for transfers', () => {
    expect(
      reconcileFundTransfer({
        requestedAmount: '500.00',
        sourceAvailableAmount: '1000.00',
        sourceDebitAmount: '500.00',
        destinationCreditAmount: '500.00',
      }),
    ).toEqual({
      requestedAmount: '500.00',
      sourceDebitAmount: '500.00',
      destinationCreditAmount: '500.00',
    });

    expect(() =>
      reconcileFundTransfer({
        requestedAmount: '500.00',
        sourceAvailableAmount: '1000.00',
        sourceDebitAmount: '500.00',
        destinationCreditAmount: '499.99',
      }),
    ).toThrow(AssistanceFinancialReconciliationError);
  });
});