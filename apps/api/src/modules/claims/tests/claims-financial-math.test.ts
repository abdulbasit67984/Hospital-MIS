import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  aggregateClaimFinancials,
  calculateClaimAdjudication,
  calculateClaimReceivable,
  deriveClaimLineFinancials,
  reconcileRemittance,
} from '../claims.financial-math.js';

import {
  ClaimAdjudicationReconciliationError,
  ClaimFinancialReconciliationError,
  ClaimRemittanceReconciliationError,
} from '../claims.errors.js';

describe('claims exact financial calculations', () => {
  it('derives the claimable sponsor portion only from authoritative allocation values', () => {
    expect(
      deriveClaimLineFinancials({
        grossAmount: '10000.00',
        packageAmount: '1000.00',
        sponsorAmount: '5940.00',
        patientAmount: '3060.00',
        deductibleAmount: '500.00',
        copaymentAmount: '250.00',
        coinsuranceAmount: '825.00',
        excludedAmount: '300.00',
      }),
    ).toEqual({
      grossAmount: '10000.00',
      packageAmount: '1000.00',
      deductibleAmount: '500.00',
      copaymentAmount: '250.00',
      coinsuranceAmount: '825.00',
      excludedAmount: '300.00',
      patientOtherAmount: '1185.00',
      patientResponsibilityAmount: '3060.00',
      claimedAmount: '5940.00',
    });
  });

  it('rejects a coverage allocation that does not reconcile to gross charges', () => {
    expect(() =>
      deriveClaimLineFinancials({
        grossAmount: '100.00',
        packageAmount: '0.00',
        sponsorAmount: '80.00',
        patientAmount: '10.00',
        deductibleAmount: '0.00',
        copaymentAmount: '0.00',
        coinsuranceAmount: '0.00',
        excludedAmount: '0.00',
      }),
    ).toThrow(ClaimFinancialReconciliationError);
  });

  it('reconciles an adjudication exactly to the submitted claim amount', () => {
    expect(
      calculateClaimAdjudication({
        claimedAmount: '1000.00',
        approvedAmount: '700.00',
        deniedAmount: '200.00',
        disallowedAmount: '75.00',
        returnedAmount: '25.00',
        contractualAdjustmentAmount: '50.00',
      }),
    ).toEqual({
      claimedAmount: '1000.00',
      approvedAmount: '700.00',
      deniedAmount: '200.00',
      disallowedAmount: '75.00',
      returnedAmount: '25.00',
      contractualAdjustmentAmount: '50.00',
      adjudicatedReceivableAmount: '650.00',
    });

    expect(() =>
      calculateClaimAdjudication({
        claimedAmount: '1000.00',
        approvedAmount: '700.00',
        deniedAmount: '100.00',
        disallowedAmount: '0.00',
        returnedAmount: '0.00',
      }),
    ).toThrow(ClaimAdjudicationReconciliationError);
  });

  it('calculates outstanding and overpayment balances without floating-point arithmetic', () => {
    expect(
      calculateClaimReceivable({
        approvedAmount: '500.10',
        paidAmount: '300.05',
        contractualAdjustmentAmount: '25.00',
        writeOffAmount: '10.00',
        payerWithholdingAmount: '5.00',
        debitNoteAmount: '20.00',
        creditNoteAmount: '10.00',
        refundAmount: '15.00',
        repaymentAmount: '5.00',
      }),
    ).toMatchObject({
      settledAmount: '340.05',
      outstandingAmount: '180.05',
      overpaymentAmount: '0.00',
    });
  });

  it('aggregates line values and preserves source-allocation reconciliation', () => {
    const result = aggregateClaimFinancials([
      {
        grossAmount: '100.10',
        packageAmount: '10.01',
        deductibleAmount: '5.00',
        copaymentAmount: '0.00',
        coinsuranceAmount: '0.00',
        excludedAmount: '0.00',
        patientOtherAmount: '5.00',
        patientResponsibilityAmount: '10.00',
        claimedAmount: '80.09',
        approvedAmount: '70.07',
        deniedAmount: '10.02',
        disallowedAmount: '0.00',
        returnedAmount: '0.00',
        contractualAdjustmentAmount: '5.00',
        writeOffAmount: '0.00',
        paidAmount: '60.00',
        outstandingAmount: '5.07',
      },
      {
        grossAmount: '200.20',
        packageAmount: '10.01',
        deductibleAmount: '10.00',
        copaymentAmount: '5.00',
        coinsuranceAmount: '0.00',
        excludedAmount: '0.00',
        patientOtherAmount: '25.05',
        patientResponsibilityAmount: '40.05',
        claimedAmount: '150.14',
        approvedAmount: '140.14',
        deniedAmount: '10.00',
        disallowedAmount: '0.00',
        returnedAmount: '0.00',
        contractualAdjustmentAmount: '0.00',
        writeOffAmount: '0.00',
        paidAmount: '100.00',
        outstandingAmount: '40.14',
      },
    ]);

    expect(result).toMatchObject({
      lineCount: 2,
      grossAmount: '300.30',
      packageAmount: '20.02',
      patientResponsibilityAmount: '50.05',
      claimedAmount: '230.23',
      approvedAmount: '210.21',
      paidAmount: '160.00',
      outstandingAmount: '45.21',
    });
  });

  it('requires remittance allocations plus unapplied funds to equal the sponsor payment', () => {
    expect(
      reconcileRemittance({
        sponsorPaymentAmount: '1000.00',
        allocatedAmount: '925.50',
        unappliedAmount: '74.50',
      }),
    ).toEqual({
      sponsorPaymentAmount: '1000.00',
      allocatedAmount: '925.50',
      unappliedAmount: '74.50',
    });

    expect(() =>
      reconcileRemittance({
        sponsorPaymentAmount: '1000.00',
        allocatedAmount: '900.00',
        unappliedAmount: '50.00',
      }),
    ).toThrow(ClaimRemittanceReconciliationError);
  });
});