import Decimal from 'decimal.js';

import {
  CONSULTANT_SHARING_MONEY_SCALE,
  CONSULTANT_SHARING_PERCENTAGE_SCALE,
  CONSULTANT_SHARING_RATE_SCALE,
  type ConsultantRecognitionBasis,
} from './consultant-sharing.constants.js';
import type {
  AuthoritativeConsultantFinancialActivity,
  ConsultantAgreementTier,
  ConsultantEligibleRevenueBreakdown,
  ConsultantParticipantAllocationInput,
  ConsultantParticipantShare,
  ConsultantRecognitionResult,
  ConsultantRevenueEligibilityPolicy,
  ConsultantSettlementTotalsInput,
  ConsultantSettlementTotalsResult,
  ConsultantShareCalculationInput,
  ConsultantShareCalculationResult,
} from './consultant-sharing.contracts.js';
import {
  ConsultantInvalidDecimalError,
  ConsultantNegativeAmountError,
  ConsultantNegativeHospitalShareError,
  ConsultantParticipantDuplicateError,
  ConsultantParticipantReconciliationError,
  ConsultantPercentageOutOfRangeError,
  ConsultantPositiveAmountRequiredError,
  ConsultantRecognitionPreconditionError,
  ConsultantRevenueReconciliationError,
  ConsultantSettlementReconciliationError,
  ConsultantShareExceedsEligibleRevenueError,
  ConsultantTierConfigurationError,
  ConsultantUnsupportedCalculationMethodError,
} from './consultant-sharing.errors.js';

function decimal(field: string, value: Decimal.Value): Decimal {
  let parsed: Decimal;

  try {
    parsed = new Decimal(value);
  } catch {
    throw new ConsultantInvalidDecimalError(field);
  }

  if (!parsed.isFinite()) {
    throw new ConsultantInvalidDecimalError(field);
  }

  return parsed;
}

function money(field: string, value: Decimal.Value): Decimal {
  return decimal(field, value).toDecimalPlaces(
    CONSULTANT_SHARING_MONEY_SCALE,
    Decimal.ROUND_HALF_UP,
  );
}

function nonNegativeMoney(field: string, value: Decimal.Value): Decimal {
  const amount = money(field, value);
  if (amount.isNegative()) {
    throw new ConsultantNegativeAmountError(field);
  }
  return amount;
}

function positiveMoney(field: string, value: Decimal.Value): Decimal {
  const amount = nonNegativeMoney(field, value);
  if (!amount.greaterThan(0)) {
    throw new ConsultantPositiveAmountRequiredError(field);
  }
  return amount;
}

function nonNegativeQuantity(field: string, value: Decimal.Value): Decimal {
  const quantity = decimal(field, value).toDecimalPlaces(
    CONSULTANT_SHARING_RATE_SCALE,
    Decimal.ROUND_HALF_UP,
  );
  if (quantity.isNegative()) {
    throw new ConsultantNegativeAmountError(field);
  }
  return quantity;
}

function percentage(field: string, value: Decimal.Value): Decimal {
  const amount = decimal(field, value).toDecimalPlaces(
    CONSULTANT_SHARING_PERCENTAGE_SCALE,
    Decimal.ROUND_HALF_UP,
  );
  if (amount.isNegative() || amount.greaterThan(100)) {
    throw new ConsultantPercentageOutOfRangeError(field);
  }
  return amount;
}

function formatMoney(value: Decimal): string {
  return value.toDecimalPlaces(
    CONSULTANT_SHARING_MONEY_SCALE,
    Decimal.ROUND_HALF_UP,
  ).toFixed(CONSULTANT_SHARING_MONEY_SCALE);
}

function formatPercentage(value: Decimal): string {
  return value.toDecimalPlaces(
    CONSULTANT_SHARING_PERCENTAGE_SCALE,
    Decimal.ROUND_HALF_UP,
  ).toFixed(CONSULTANT_SHARING_PERCENTAGE_SCALE);
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

function included(
  treatment: 'INCLUDE' | 'EXCLUDE',
  amount: Decimal,
): Decimal {
  return treatment === 'INCLUDE' ? amount : new Decimal(0);
}

export function deriveConsultantEligibleRevenue(
  activity: AuthoritativeConsultantFinancialActivity,
  policy: ConsultantRevenueEligibilityPolicy,
): ConsultantEligibleRevenueBreakdown {
  const grossAmount = nonNegativeMoney('grossAmount', activity.grossAmount);
  const discountAmount = nonNegativeMoney(
    'discountAmount',
    activity.discountAmount,
  );
  const taxAmount = nonNegativeMoney('taxAmount', activity.taxAmount);
  const netAmount = nonNegativeMoney('netAmount', activity.netAmount);
  const patientResponsibility = nonNegativeMoney(
    'patientResponsibilityAmount',
    activity.patientResponsibilityAmount,
  );
  const sponsorResponsibility = nonNegativeMoney(
    'sponsorResponsibilityAmount',
    activity.sponsorResponsibilityAmount,
  );
  const packageResponsibility = nonNegativeMoney(
    'packageResponsibilityAmount',
    activity.packageResponsibilityAmount,
  );
  const welfareZakatAmount = nonNegativeMoney(
    'welfareZakatAmount',
    activity.welfareZakatAmount,
  );
  const serviceChargeAmount = nonNegativeMoney(
    'serviceChargeAmount',
    activity.serviceChargeAmount,
  );

  const expectedNet = grossAmount.minus(discountAmount).plus(taxAmount);
  if (!expectedNet.equals(netAmount)) {
    throw new ConsultantRevenueReconciliationError(
      'Authoritative invoice-line gross, discount, tax, and net amounts do not reconcile',
    );
  }

  const responsibilityTotal = patientResponsibility
    .plus(sponsorResponsibility)
    .plus(packageResponsibility)
    .plus(welfareZakatAmount);
  if (!responsibilityTotal.equals(netAmount)) {
    throw new ConsultantRevenueReconciliationError(
      'Patient, sponsor, package, and Welfare/Zakat responsibility must reconcile to invoice-line net amount',
    );
  }

  const includedPatientResponsibility = included(
    policy.patientResponsibilityTreatment,
    patientResponsibility,
  );
  const includedSponsorResponsibility = included(
    policy.sponsorResponsibilityTreatment,
    sponsorResponsibility,
  );
  const includedPackageResponsibility = included(
    policy.packageResponsibilityTreatment,
    packageResponsibility,
  );
  const includedWelfareZakatAmount = included(
    policy.welfareZakatTreatment,
    welfareZakatAmount,
  );
  const grossBasisAdjustment =
    policy.discountTreatment === 'SHARE_ON_GROSS'
      ? discountAmount
      : new Decimal(0);
  const taxDeduction =
    policy.taxTreatment === 'EXCLUDE' ? taxAmount : new Decimal(0);
  const serviceChargeDeduction =
    policy.serviceChargeTreatment === 'EXCLUDE'
      ? serviceChargeAmount
      : new Decimal(0);
  const refundDeduction = policy.deductRefunds
    ? nonNegativeMoney('refundAmount', activity.refundAmount)
    : new Decimal(0);
  const creditNoteDeduction = policy.deductCreditNotes
    ? nonNegativeMoney('creditNoteAmount', activity.creditNoteAmount)
    : new Decimal(0);
  const debitNoteAddition = policy.includeDebitNotes
    ? nonNegativeMoney('debitNoteAmount', activity.debitNoteAmount)
    : new Decimal(0);
  const writeOffDeduction = policy.deductWriteOffs
    ? nonNegativeMoney('writeOffAmount', activity.writeOffAmount)
    : new Decimal(0);
  const claimAdjustment = policy.applyClaimAdjustments
    ? money('claimAdjustmentAmount', activity.claimAdjustmentAmount)
    : new Decimal(0);
  const nonShareableDeduction = policy.deductNonShareableCharges
    ? nonNegativeMoney('nonShareableAmount', activity.nonShareableAmount)
    : new Decimal(0);
  const costDeduction = policy.deductCosts
    ? nonNegativeMoney('costDeductionAmount', activity.costDeductionAmount)
    : new Decimal(0);
  const consumableDeduction = policy.deductConsumables
    ? nonNegativeMoney(
        'consumableDeductionAmount',
        activity.consumableDeductionAmount,
      )
    : new Decimal(0);
  const otherApprovedDeduction = policy.deductOtherApprovedDeductions
    ? nonNegativeMoney(
        'otherApprovedDeductionAmount',
        activity.otherApprovedDeductionAmount,
      )
    : new Decimal(0);

  const includedResponsibilities = sum([
    includedPatientResponsibility,
    includedSponsorResponsibility,
    includedPackageResponsibility,
    includedWelfareZakatAmount,
  ]);

  const eligibleRevenue = includedResponsibilities
    .plus(grossBasisAdjustment)
    .plus(debitNoteAddition)
    .plus(claimAdjustment)
    .minus(taxDeduction)
    .minus(serviceChargeDeduction)
    .minus(refundDeduction)
    .minus(creditNoteDeduction)
    .minus(writeOffDeduction)
    .minus(nonShareableDeduction)
    .minus(costDeduction)
    .minus(consumableDeduction)
    .minus(otherApprovedDeduction);

  if (eligibleRevenue.isNegative()) {
    throw new ConsultantRevenueReconciliationError(
      'Consultant-eligible deductions exceed the included authoritative revenue basis',
    );
  }

  return {
    grossAmount: formatMoney(grossAmount),
    discountAmount: formatMoney(discountAmount),
    netAmount: formatMoney(netAmount),
    includedPatientResponsibility: formatMoney(
      includedPatientResponsibility,
    ),
    includedSponsorResponsibility: formatMoney(
      includedSponsorResponsibility,
    ),
    includedPackageResponsibility: formatMoney(
      includedPackageResponsibility,
    ),
    includedWelfareZakatAmount: formatMoney(includedWelfareZakatAmount),
    grossBasisAdjustment: formatMoney(grossBasisAdjustment),
    taxDeduction: formatMoney(taxDeduction),
    serviceChargeDeduction: formatMoney(serviceChargeDeduction),
    refundDeduction: formatMoney(refundDeduction),
    creditNoteDeduction: formatMoney(creditNoteDeduction),
    debitNoteAddition: formatMoney(debitNoteAddition),
    writeOffDeduction: formatMoney(writeOffDeduction),
    claimAdjustment: formatMoney(claimAdjustment),
    nonShareableDeduction: formatMoney(nonShareableDeduction),
    costDeduction: formatMoney(costDeduction),
    consumableDeduction: formatMoney(consumableDeduction),
    otherApprovedDeduction: formatMoney(otherApprovedDeduction),
    eligibleRevenueBeforeRecognition: formatMoney(eligibleRevenue),
  };
}

export function calculateConsultantRecognition(
  activity: AuthoritativeConsultantFinancialActivity,
  eligibleRevenueBeforeRecognition: string,
  basis: ConsultantRecognitionBasis,
): ConsultantRecognitionResult {
  const eligible = nonNegativeMoney(
    'eligibleRevenueBeforeRecognition',
    eligibleRevenueBeforeRecognition,
  );
  let ratio = new Decimal(0);
  let satisfied = false;

  switch (basis) {
    case 'ACCRUAL_ON_FINALIZATION':
      satisfied = activity.invoiceFinalized;
      ratio = satisfied ? new Decimal(1) : new Decimal(0);
      break;
    case 'ACCRUAL_ON_SERVICE_COMPLETION':
      satisfied = activity.serviceCompleted;
      ratio = satisfied ? new Decimal(1) : new Decimal(0);
      break;
    case 'PAID_BASIS':
    case 'COLLECTION_BASIS': {
      const collectionBasis = nonNegativeMoney(
        'collectionBasisAmount',
        activity.collectionBasisAmount,
      );
      const collected = nonNegativeMoney(
        'collectedAmount',
        activity.collectedAmount,
      );
      if (collectionBasis.isZero()) {
        satisfied = eligible.isZero();
        ratio = satisfied ? new Decimal(1) : new Decimal(0);
      } else {
        ratio = Decimal.min(collected.div(collectionBasis), 1);
        satisfied = ratio.greaterThan(0);
      }
      break;
    }
    case 'FULL_PAYMENT_BASIS':
      satisfied = activity.invoiceFullyPaid;
      ratio = satisfied ? new Decimal(1) : new Decimal(0);
      break;
    case 'CLAIM_APPROVAL_BASIS': {
      const claimBasis = nonNegativeMoney(
        'claimBasisAmount',
        activity.claimBasisAmount,
      );
      const approved = nonNegativeMoney(
        'claimApprovedAmount',
        activity.claimApprovedAmount,
      );
      if (claimBasis.isZero()) {
        satisfied = eligible.isZero();
        ratio = satisfied ? new Decimal(1) : new Decimal(0);
      } else {
        ratio = Decimal.min(approved.div(claimBasis), 1);
        satisfied = ratio.greaterThan(0);
      }
      break;
    }
    case 'CLAIM_PAYMENT_BASIS': {
      const claimBasis = nonNegativeMoney(
        'claimBasisAmount',
        activity.claimBasisAmount,
      );
      const paid = nonNegativeMoney('claimPaidAmount', activity.claimPaidAmount);
      if (claimBasis.isZero()) {
        satisfied = eligible.isZero();
        ratio = satisfied ? new Decimal(1) : new Decimal(0);
      } else {
        ratio = Decimal.min(paid.div(claimBasis), 1);
        satisfied = ratio.greaterThan(0);
      }
      break;
    }
  }

  if (ratio.isNegative() || ratio.greaterThan(1)) {
    throw new ConsultantRevenueReconciliationError(
      'Consultant revenue recognition ratio must remain between zero and one',
    );
  }

  const recognized = eligible.mul(ratio);
  return {
    recognitionBasis: basis,
    eligibleRevenueBeforeRecognition: formatMoney(eligible),
    recognitionRatio: formatPercentage(ratio.mul(100)),
    recognizedEligibleRevenue: formatMoney(recognized),
    pendingEligibleRevenue: formatMoney(eligible.minus(recognized)),
    recognitionSatisfied: satisfied,
  };
}

function validateAndSortTiers(
  tiers: readonly ConsultantAgreementTier[],
): readonly Readonly<{
  tierCode: string;
  fromInclusive: Decimal;
  toInclusive: Decimal | null;
  percentage: Decimal | null;
  fixedAmount: Decimal | null;
  priority: number;
}>[] {
  if (tiers.length === 0) {
    throw new ConsultantTierConfigurationError(
      'Tiered consultant-sharing methods require at least one tier',
    );
  }

  const normalized = tiers
    .map((tier) => ({
      tierCode: tier.tierCode,
      fromInclusive: nonNegativeMoney(
        `${tier.tierCode}.fromInclusive`,
        tier.fromInclusive,
      ),
      toInclusive:
        tier.toInclusive === null
          ? null
          : nonNegativeMoney(`${tier.tierCode}.toInclusive`, tier.toInclusive),
      percentage:
        tier.percentage === null
          ? null
          : percentage(`${tier.tierCode}.percentage`, tier.percentage),
      fixedAmount:
        tier.fixedAmount === null
          ? null
          : nonNegativeMoney(`${tier.tierCode}.fixedAmount`, tier.fixedAmount),
      priority: tier.priority,
    }))
    .sort((left, right) => {
      const lowerBound = left.fromInclusive.comparedTo(right.fromInclusive);
      return lowerBound !== 0 ? lowerBound : right.priority - left.priority;
    });

  for (let index = 0; index < normalized.length; index += 1) {
    const current = normalized[index];
    if (current === undefined) {
      continue;
    }
    if (current.percentage === null && current.fixedAmount === null) {
      throw new ConsultantTierConfigurationError(
        `Tier ${current.tierCode} must define a percentage, a fixed amount, or both`,
      );
    }
    if (
      current.toInclusive !== null &&
      current.toInclusive.lessThan(current.fromInclusive)
    ) {
      throw new ConsultantTierConfigurationError(
        `Tier ${current.tierCode} has an upper bound below its lower bound`,
      );
    }

    const next = normalized[index + 1];
    if (next !== undefined) {
      if (current.toInclusive === null) {
        throw new ConsultantTierConfigurationError(
          `Open-ended tier ${current.tierCode} must be the final tier`,
        );
      }
      if (next.fromInclusive.lessThanOrEqualTo(current.toInclusive)) {
        throw new ConsultantTierConfigurationError(
          `Tier ${current.tierCode} overlaps tier ${next.tierCode}`,
        );
      }
    }
  }

  return normalized;
}

function calculateFlatTierShare(
  eligibleRevenue: Decimal,
  tiers: readonly ConsultantAgreementTier[],
): Readonly<{ share: Decimal; tierCode: string }> {
  const normalized = validateAndSortTiers(tiers);
  const selected = normalized.find(
    (tier) =>
      eligibleRevenue.greaterThanOrEqualTo(tier.fromInclusive) &&
      (tier.toInclusive === null ||
        eligibleRevenue.lessThanOrEqualTo(tier.toInclusive)),
  );

  if (selected === undefined) {
    throw new ConsultantTierConfigurationError(
      'No tier covers the eligible revenue amount',
    );
  }

  const percentageShare =
    selected.percentage === null
      ? new Decimal(0)
      : eligibleRevenue.mul(selected.percentage).div(100);
  return {
    share: percentageShare.plus(selected.fixedAmount ?? 0),
    tierCode: selected.tierCode,
  };
}

function calculateProgressiveTierShare(
  eligibleRevenue: Decimal,
  tiers: readonly ConsultantAgreementTier[],
): Readonly<{ share: Decimal; tierCode: string | null }> {
  const normalized = validateAndSortTiers(tiers);
  let share = new Decimal(0);
  let lastTierCode: string | null = null;

  for (const tier of normalized) {
    if (eligibleRevenue.lessThan(tier.fromInclusive)) {
      break;
    }
    const upper = tier.toInclusive === null
      ? eligibleRevenue
      : Decimal.min(eligibleRevenue, tier.toInclusive);
    const taxableSlice = Decimal.max(upper.minus(tier.fromInclusive), 0);
    if (taxableSlice.isZero() && !eligibleRevenue.equals(tier.fromInclusive)) {
      continue;
    }
    const percentageShare =
      tier.percentage === null
        ? new Decimal(0)
        : taxableSlice.mul(tier.percentage).div(100);
    share = share.plus(percentageShare).plus(tier.fixedAmount ?? 0);
    lastTierCode = tier.tierCode;
  }

  if (lastTierCode === null) {
    throw new ConsultantTierConfigurationError(
      'No progressive tier covers the eligible revenue amount',
    );
  }

  return { share, tierCode: lastTierCode };
}

export function allocateConsultantParticipantShares(
  consultantPool: string,
  inputs: readonly ConsultantParticipantAllocationInput[],
): readonly ConsultantParticipantShare[] {
  const pool = nonNegativeMoney('consultantPool', consultantPool);
  if (inputs.length === 0) {
    return [];
  }

  const duplicateKeys = new Set<string>();
  for (const participant of inputs) {
    const duplicateKey = [
      participant.participantId,
      participant.participantRole,
      participant.customRoleCode ?? '',
    ].join(':');
    if (duplicateKeys.has(duplicateKey)) {
      throw new ConsultantParticipantDuplicateError(participant.participantId);
    }
    duplicateKeys.add(duplicateKey);
  }

  const residualParticipants = inputs.filter(
    (participant) =>
      participant.allocationMethod === 'RESIDUAL' ||
      participant.receivesResidual === true,
  );
  if (residualParticipants.length > 1) {
    throw new ConsultantParticipantReconciliationError(
      'Only one participant may receive the residual consultant share',
    );
  }

  const ordered = [...inputs].sort((left, right) => {
    if (left.priority !== right.priority) {
      return right.priority - left.priority;
    }
    return left.participantId.localeCompare(right.participantId);
  });

  let allocated = new Decimal(0);
  const interim: ConsultantParticipantShare[] = [];

  for (const participant of ordered) {
    if (
      participant.allocationMethod === 'RESIDUAL' ||
      participant.receivesResidual === true
    ) {
      continue;
    }

    let share: Decimal;
    if (participant.allocationMethod === 'PERCENTAGE') {
      if (participant.percentage == null) {
        throw new ConsultantParticipantReconciliationError(
          'Percentage participant allocation requires percentage',
        );
      }
      share = pool.mul(percentage('participant.percentage', participant.percentage)).div(100);
    } else if (participant.allocationMethod === 'FIXED') {
      if (participant.fixedAmount == null) {
        throw new ConsultantParticipantReconciliationError(
          'Fixed participant allocation requires fixedAmount',
        );
      }
      share = nonNegativeMoney('participant.fixedAmount', participant.fixedAmount);
    } else {
      throw new ConsultantParticipantReconciliationError(
        'Residual participant must be processed after fixed and percentage allocations',
      );
    }

    share = money('participant.share', share);
    allocated = allocated.plus(share);
    if (allocated.greaterThan(pool)) {
      throw new ConsultantShareExceedsEligibleRevenueError();
    }

    interim.push({
      participantId: participant.participantId,
      participantRole: participant.participantRole,
      customRoleCode: participant.customRoleCode ?? null,
      allocationMethod: participant.allocationMethod,
      percentage:
        participant.percentage == null
          ? null
          : formatPercentage(percentage('participant.percentage', participant.percentage)),
      fixedAmount:
        participant.fixedAmount == null
          ? null
          : formatMoney(
              nonNegativeMoney('participant.fixedAmount', participant.fixedAmount),
            ),
      shareAmount: formatMoney(share),
      priority: participant.priority,
      residual: false,
    });
  }

  const residual = pool.minus(allocated);
  const residualParticipant = residualParticipants[0];
  if (residualParticipant !== undefined) {
    interim.push({
      participantId: residualParticipant.participantId,
      participantRole: residualParticipant.participantRole,
      customRoleCode: residualParticipant.customRoleCode ?? null,
      allocationMethod: 'RESIDUAL',
      percentage: null,
      fixedAmount: null,
      shareAmount: formatMoney(residual),
      priority: residualParticipant.priority,
      residual: true,
    });
    allocated = allocated.plus(residual);
  }

  if (!allocated.equals(pool)) {
    throw new ConsultantParticipantReconciliationError();
  }

  return interim.sort((left, right) => {
    if (left.priority !== right.priority) {
      return right.priority - left.priority;
    }
    return left.participantId.localeCompare(right.participantId);
  });
}

function lowestCap(
  share: Decimal,
  caps: readonly Readonly<{ name: string; amount: Decimal | null }>[],
): Readonly<{ amount: Decimal; capApplied: string | null }> {
  let result = share;
  let capApplied: string | null = null;

  for (const cap of caps) {
    if (cap.amount !== null && cap.amount.lessThan(result)) {
      result = cap.amount;
      capApplied = cap.name;
    }
  }

  return { amount: result, capApplied };
}

export function calculateConsultantShare(
  input: ConsultantShareCalculationInput,
): ConsultantShareCalculationResult {
  const eligibleRevenue = nonNegativeMoney(
    'eligibleRevenue',
    input.eligibleRevenue,
  );
  const quantity = nonNegativeQuantity('unitQuantity', input.unitQuantity ?? '1');
  const percentageValue =
    input.percentage == null
      ? null
      : percentage('percentage', input.percentage);
  const fixedAmount = optionalMoney('fixedAmount', input.fixedAmount);
  let selectedTierCode: string | null = null;
  let uncappedShare: Decimal;

  switch (input.method) {
    case 'PERCENTAGE_OF_ELIGIBLE_REVENUE':
      if (percentageValue === null) {
        throw new ConsultantRevenueReconciliationError(
          'Percentage calculation requires percentage',
        );
      }
      uncappedShare = eligibleRevenue.mul(percentageValue).div(100);
      break;
    case 'FIXED_PER_SERVICE':
    case 'FIXED_PER_PROCEDURE':
    case 'FIXED_PER_INVOICE_LINE':
    case 'FIXED_PER_CASE':
      if (fixedAmount === null) {
        throw new ConsultantRevenueReconciliationError(
          'Fixed calculation requires fixedAmount',
        );
      }
      uncappedShare = fixedAmount.mul(quantity);
      break;
    case 'PERCENTAGE_PLUS_FIXED':
      if (percentageValue === null || fixedAmount === null) {
        throw new ConsultantRevenueReconciliationError(
          'Percentage-plus-fixed calculation requires percentage and fixedAmount',
        );
      }
      uncappedShare = eligibleRevenue
        .mul(percentageValue)
        .div(100)
        .plus(fixedAmount.mul(quantity));
      break;
    case 'TIERED_PERCENTAGE':
    case 'SLAB_BASED': {
      const tierResult = calculateFlatTierShare(
        eligibleRevenue,
        input.tiers ?? [],
      );
      uncappedShare = tierResult.share;
      selectedTierCode = tierResult.tierCode;
      break;
    }
    case 'PROGRESSIVE_TIERS': {
      const tierResult = calculateProgressiveTierShare(
        eligibleRevenue,
        input.tiers ?? [],
      );
      uncappedShare = tierResult.share;
      selectedTierCode = tierResult.tierCode;
      break;
    }
    case 'THRESHOLD_BASED': {
      const threshold = optionalMoney('thresholdAmount', input.thresholdAmount);
      if (threshold === null) {
        throw new ConsultantRevenueReconciliationError(
          'Threshold calculation requires thresholdAmount',
        );
      }
      if (eligibleRevenue.lessThan(threshold)) {
        uncappedShare = new Decimal(0);
      } else {
        const percentageShare =
          percentageValue === null
            ? new Decimal(0)
            : eligibleRevenue.mul(percentageValue).div(100);
        uncappedShare = percentageShare.plus(
          fixedAmount === null ? 0 : fixedAmount.mul(quantity),
        );
      }
      break;
    }
    default:
      throw new ConsultantUnsupportedCalculationMethodError(input.method);
  }

  uncappedShare = money('uncappedConsultantPool', uncappedShare);
  let consultantPool = uncappedShare;
  let minimumApplied = false;
  let guaranteedAmountApplied = false;
  const minimumShare = optionalMoney('minimumShare', input.minimumShare);
  const guaranteedAmount = optionalMoney(
    'guaranteedAmount',
    input.guaranteedAmount,
  );

  if (minimumShare !== null && consultantPool.lessThan(minimumShare)) {
    consultantPool = minimumShare;
    minimumApplied = true;
  }
  if (
    guaranteedAmount !== null &&
    consultantPool.lessThan(guaranteedAmount)
  ) {
    consultantPool = guaranteedAmount;
    guaranteedAmountApplied = true;
  }

  const capped = lowestCap(consultantPool, [
    { name: 'MAXIMUM_SHARE', amount: optionalMoney('maximumShare', input.maximumShare) },
    { name: 'PER_SERVICE_CAP', amount: optionalMoney('perServiceCap', input.perServiceCap) },
    { name: 'PER_CASE_CAP', amount: optionalMoney('perCaseCap', input.perCaseCap) },
    {
      name: 'PERIOD_REMAINING_CAP',
      amount: optionalMoney('periodRemainingCap', input.periodRemainingCap),
    },
  ]);
  consultantPool = money('consultantPool', capped.amount);

  if (consultantPool.greaterThan(eligibleRevenue)) {
    throw new ConsultantShareExceedsEligibleRevenueError();
  }

  const participantShares = allocateConsultantParticipantShares(
    formatMoney(consultantPool),
    input.participantRules ?? [],
  );
  const consultantShare =
    participantShares.length === 0
      ? consultantPool
      : sum(
          participantShares.map((participant) =>
            nonNegativeMoney('participant.shareAmount', participant.shareAmount),
          ),
        );
  const hospitalShare = eligibleRevenue.minus(consultantShare);

  if (hospitalShare.isNegative()) {
    throw new ConsultantNegativeHospitalShareError();
  }
  if (!consultantShare.plus(hospitalShare).equals(eligibleRevenue)) {
    throw new ConsultantRevenueReconciliationError(
      'Consultant and hospital shares do not reconcile to eligible revenue',
    );
  }

  return {
    eligibleRevenue: formatMoney(eligibleRevenue),
    calculationMethod: input.method,
    percentage:
      percentageValue === null ? null : formatPercentage(percentageValue),
    fixedAmount: fixedAmount === null ? null : formatMoney(fixedAmount),
    selectedTierCode,
    uncappedConsultantPool: formatMoney(uncappedShare),
    consultantPool: formatMoney(consultantPool),
    participantShares,
    consultantShare: formatMoney(consultantShare),
    hospitalShare: formatMoney(hospitalShare),
    capApplied: capped.capApplied,
    minimumApplied,
    guaranteedAmountApplied,
  };
}

export function calculateConsultantSettlementTotals(
  input: ConsultantSettlementTotalsInput,
): ConsultantSettlementTotalsResult {
  const openingBalance = nonNegativeMoney('openingBalance', input.openingBalance);
  const broughtForwardBalance = nonNegativeMoney(
    'broughtForwardBalance',
    input.broughtForwardBalance,
  );
  const eligibleRevenue = nonNegativeMoney(
    'eligibleRevenue',
    input.eligibleRevenue,
  );
  const consultantShare = nonNegativeMoney(
    'consultantShare',
    input.consultantShare,
  );
  if (consultantShare.greaterThan(eligibleRevenue)) {
    throw new ConsultantShareExceedsEligibleRevenueError();
  }

  const adjustments = money('adjustments', input.adjustments);
  const refundDeductions = nonNegativeMoney(
    'refundDeductions',
    input.refundDeductions,
  );
  const creditNoteDeductions = nonNegativeMoney(
    'creditNoteDeductions',
    input.creditNoteDeductions,
  );
  const debitNoteAdditions = nonNegativeMoney(
    'debitNoteAdditions',
    input.debitNoteAdditions,
  );
  const claimDeductions = nonNegativeMoney(
    'claimDeductions',
    input.claimDeductions,
  );
  const welfareZakatDeductions = nonNegativeMoney(
    'welfareZakatDeductions',
    input.welfareZakatDeductions,
  );
  const taxWithholding = nonNegativeMoney(
    'taxWithholding',
    input.taxWithholding,
  );
  const otherDeductions = nonNegativeMoney(
    'otherDeductions',
    input.otherDeductions,
  );
  const advanceRecovery = nonNegativeMoney(
    'advanceRecovery',
    input.advanceRecovery,
  );
  const overpaymentRecovery = nonNegativeMoney(
    'overpaymentRecovery',
    input.overpaymentRecovery,
  );
  const paidAmount = nonNegativeMoney('paidAmount', input.paidAmount);

  const grossPayable = openingBalance
    .plus(broughtForwardBalance)
    .plus(consultantShare)
    .plus(debitNoteAdditions)
    .plus(adjustments);
  if (grossPayable.isNegative()) {
    throw new ConsultantSettlementReconciliationError(
      'Negative manual adjustments exceed the consultant payable basis',
    );
  }

  const totalDeductions = sum([
    refundDeductions,
    creditNoteDeductions,
    claimDeductions,
    welfareZakatDeductions,
    taxWithholding,
    otherDeductions,
    advanceRecovery,
    overpaymentRecovery,
  ]);
  const netPayable = grossPayable.minus(totalDeductions);
  if (netPayable.isNegative()) {
    throw new ConsultantSettlementReconciliationError(
      'Settlement deductions exceed the gross consultant payable',
    );
  }
  if (paidAmount.greaterThan(netPayable)) {
    throw new ConsultantSettlementReconciliationError(
      'Paid amount exceeds the authoritative net consultant payable',
    );
  }

  return {
    openingBalance: formatMoney(openingBalance),
    broughtForwardBalance: formatMoney(broughtForwardBalance),
    eligibleRevenue: formatMoney(eligibleRevenue),
    consultantShare: formatMoney(consultantShare),
    adjustments: formatMoney(adjustments),
    refundDeductions: formatMoney(refundDeductions),
    creditNoteDeductions: formatMoney(creditNoteDeductions),
    debitNoteAdditions: formatMoney(debitNoteAdditions),
    claimDeductions: formatMoney(claimDeductions),
    welfareZakatDeductions: formatMoney(welfareZakatDeductions),
    taxWithholding: formatMoney(taxWithholding),
    otherDeductions: formatMoney(otherDeductions),
    advanceRecovery: formatMoney(advanceRecovery),
    overpaymentRecovery: formatMoney(overpaymentRecovery),
    paidAmount: formatMoney(paidAmount),
    grossPayable: formatMoney(grossPayable),
    totalDeductions: formatMoney(totalDeductions),
    netPayable: formatMoney(netPayable),
    outstandingAmount: formatMoney(netPayable.minus(paidAmount)),
  };
}

export function calculateConsultantDeltaAdjustment(input: Readonly<{
  originalConsultantShare: string;
  recalculatedConsultantShare: string;
  originalHospitalShare: string;
  recalculatedHospitalShare: string;
}>): Readonly<{
  consultantDelta: string;
  hospitalDelta: string;
}> {
  const consultantDelta = money(
    'consultantDelta',
    decimal('recalculatedConsultantShare', input.recalculatedConsultantShare).minus(
      decimal('originalConsultantShare', input.originalConsultantShare),
    ),
  );
  const hospitalDelta = money(
    'hospitalDelta',
    decimal('recalculatedHospitalShare', input.recalculatedHospitalShare).minus(
      decimal('originalHospitalShare', input.originalHospitalShare),
    ),
  );

  if (!consultantDelta.plus(hospitalDelta).isZero()) {
    throw new ConsultantRevenueReconciliationError(
      'Recalculation deltas must preserve the original eligible-revenue total',
    );
  }

  return {
    consultantDelta: formatMoney(consultantDelta),
    hospitalDelta: formatMoney(hospitalDelta),
  };
}

export function requireRecognizedConsultantRevenue(
  result: ConsultantRecognitionResult,
): void {
  if (!result.recognitionSatisfied) {
    throw new ConsultantRecognitionPreconditionError(
      `Recognition precondition is not satisfied for ${result.recognitionBasis}`,
    );
  }
  positiveMoney('recognizedEligibleRevenue', result.recognizedEligibleRevenue);
}