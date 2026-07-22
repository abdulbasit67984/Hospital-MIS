import Decimal from 'decimal.js';

import {
  PpcInvalidFinancialAllocationError,
} from './panels-packages-coverage.errors.js';

export interface CoverageFinancialTerms {
  deductibleRemaining: string;
  copaymentAmount: string;
  coinsurancePercentage: string;
  coveragePercentage: string;
  benefitRemaining: string | null;
}

export interface CoverageFinancialResult {
  grossAmount: string;
  packageAmount: string;
  eligibleAmount: string;
  deductibleAmount: string;
  copaymentAmount: string;
  coinsuranceAmount: string;
  sponsorAmount: string;
  patientAmount: string;
  deniedAmount: string;
}

function money(value: Decimal.Value): Decimal {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function minimum(...values: readonly Decimal[]): Decimal {
  return Decimal.min(...values);
}

export function calculateCoverageFinancialAllocation(
  grossAmountValue: string,
  packageAmountValue: string,
  terms: CoverageFinancialTerms,
): CoverageFinancialResult {
  const grossAmount = money(grossAmountValue);
  const packageAmount = minimum(
    grossAmount,
    money(packageAmountValue),
  );

  if (grossAmount.isNegative() || packageAmount.isNegative()) {
    throw new PpcInvalidFinancialAllocationError();
  }

  const afterPackage = money(grossAmount.minus(packageAmount));
  const deductibleAmount = minimum(
    afterPackage,
    money(terms.deductibleRemaining),
  );
  const afterDeductible = money(afterPackage.minus(deductibleAmount));
  const copaymentAmount = minimum(
    afterDeductible,
    money(terms.copaymentAmount),
  );
  const afterCopayment = money(afterDeductible.minus(copaymentAmount));

  const coinsuranceAmount = money(
    afterCopayment.mul(terms.coinsurancePercentage).div(100),
  );
  const afterCoinsurance = money(
    afterCopayment.minus(coinsuranceAmount),
  );
  const calculatedSponsor = money(
    afterCoinsurance.mul(terms.coveragePercentage).div(100),
  );
  const sponsorAmount =
    terms.benefitRemaining === null
      ? calculatedSponsor
      : minimum(calculatedSponsor, money(terms.benefitRemaining));

  const deniedAmount = money(calculatedSponsor.minus(sponsorAmount));
  const patientAmount = money(
    deductibleAmount
      .plus(copaymentAmount)
      .plus(coinsuranceAmount)
      .plus(afterCoinsurance.minus(calculatedSponsor))
      .plus(deniedAmount),
  );

  const reconciliation = money(
    packageAmount.plus(sponsorAmount).plus(patientAmount),
  );

  if (!reconciliation.equals(grossAmount)) {
    throw new PpcInvalidFinancialAllocationError();
  }

  return {
    grossAmount: grossAmount.toFixed(2),
    packageAmount: packageAmount.toFixed(2),
    eligibleAmount: afterPackage.toFixed(2),
    deductibleAmount: deductibleAmount.toFixed(2),
    copaymentAmount: copaymentAmount.toFixed(2),
    coinsuranceAmount: coinsuranceAmount.toFixed(2),
    sponsorAmount: sponsorAmount.toFixed(2),
    patientAmount: patientAmount.toFixed(2),
    deniedAmount: deniedAmount.toFixed(2),
  };
}