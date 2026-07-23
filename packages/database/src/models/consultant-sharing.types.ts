export const consultantSharingCurrencyValues = ['PKR'] as const;
export type ConsultantSharingCurrency =
  (typeof consultantSharingCurrencyValues)[number];

export const consultantEngagementTypeValues = [
  'INTERNAL',
  'VISITING',
  'EXTERNAL',
  'INDIVIDUAL',
  'GROUP',
] as const;
export type ConsultantEngagementType =
  (typeof consultantEngagementTypeValues)[number];

export const consultantAgreementStatusValues = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'ACTIVE',
  'SUSPENDED',
  'EXPIRED',
  'TERMINATED',
  'CANCELLED',
  'SUPERSEDED',
  'REOPENED',
] as const;
export type ConsultantAgreementStatus =
  (typeof consultantAgreementStatusValues)[number];

export const consultantAgreementRuleStatusValues = [
  'DRAFT',
  'ACTIVE',
  'INACTIVE',
  'SUPERSEDED',
] as const;
export type ConsultantAgreementRuleStatus =
  (typeof consultantAgreementRuleStatusValues)[number];

export const consultantAgreementHistoryTypeValues = [
  'CREATED',
  'SUBMITTED',
  'REVIEWED',
  'APPROVED',
  'ACTIVATED',
  'AMENDED',
  'SUSPENDED',
  'RESUMED',
  'EXPIRED',
  'TERMINATED',
  'CANCELLED',
  'REOPENED',
  'SUPERSEDED',
] as const;
export type ConsultantAgreementHistoryType =
  (typeof consultantAgreementHistoryTypeValues)[number];

export const consultantCalculationMethodValues = [
  'PERCENTAGE_OF_ELIGIBLE_REVENUE',
  'FIXED_PER_SERVICE',
  'FIXED_PER_PROCEDURE',
  'FIXED_PER_INVOICE_LINE',
  'FIXED_PER_CASE',
  'PERCENTAGE_PLUS_FIXED',
  'TIERED_PERCENTAGE',
  'SLAB_BASED',
  'THRESHOLD_BASED',
  'PROGRESSIVE_TIERS',
] as const;
export type ConsultantCalculationMethod =
  (typeof consultantCalculationMethodValues)[number];

export const consultantRecognitionBasisValues = [
  'ACCRUAL_ON_FINALIZATION',
  'ACCRUAL_ON_SERVICE_COMPLETION',
  'PAID_BASIS',
  'COLLECTION_BASIS',
  'FULL_PAYMENT_BASIS',
  'CLAIM_APPROVAL_BASIS',
  'CLAIM_PAYMENT_BASIS',
] as const;
export type ConsultantRecognitionBasis =
  (typeof consultantRecognitionBasisValues)[number];

export const consultantParticipantRoleValues = [
  'PRIMARY_CONSULTANT',
  'SECONDARY_CONSULTANT',
  'ASSISTING_CONSULTANT',
  'SURGEON',
  'ASSISTANT_SURGEON',
  'ANESTHETIST',
  'REFERRING_CONSULTANT',
  'REPORTING_CONSULTANT',
  'PERFORMING_CONSULTANT',
  'SUPERVISING_CONSULTANT',
  'CONSULTANT_GROUP',
  'CUSTOM',
] as const;
export type ConsultantParticipantRole =
  (typeof consultantParticipantRoleValues)[number];

export const consultantParticipantAllocationMethodValues = [
  'PERCENTAGE',
  'FIXED',
  'RESIDUAL',
] as const;
export type ConsultantParticipantAllocationMethod =
  (typeof consultantParticipantAllocationMethodValues)[number];

export const consultantPatientTypeValues = [
  'CASH',
  'CORPORATE_PANEL',
  'GOVERNMENT_PROGRAM',
  'INSURANCE',
  'WELFARE',
  'ZAKAT',
  'PACKAGE',
  'OTHER',
] as const;
export type ConsultantPatientType =
  (typeof consultantPatientTypeValues)[number];

export const consultantEncounterTypeValues = [
  'OUTPATIENT',
  'INPATIENT',
  'EMERGENCY',
  'DAY_CASE',
  'SURGERY',
  'LABORATORY',
  'RADIOLOGY',
  'PHARMACY',
  'OTHER',
] as const;
export type ConsultantEncounterType =
  (typeof consultantEncounterTypeValues)[number];

export const consultantServiceCategoryValues = [
  'REGISTRATION',
  'CONSULTATION',
  'ENCOUNTER',
  'ADMISSION',
  'BED',
  'ROOM',
  'ICU',
  'PROCEDURE',
  'SURGERY',
  'LABORATORY',
  'RADIOLOGY',
  'PHARMACY',
  'PACKAGE',
  'MISCELLANEOUS',
] as const;
export type ConsultantServiceCategory =
  (typeof consultantServiceCategoryValues)[number];

export const consultantResponsibilityTreatmentValues = [
  'INCLUDE',
  'EXCLUDE',
] as const;
export type ConsultantResponsibilityTreatment =
  (typeof consultantResponsibilityTreatmentValues)[number];

export const consultantDiscountTreatmentValues = [
  'DEDUCT_FROM_ELIGIBLE',
  'SHARE_ON_GROSS',
] as const;
export type ConsultantDiscountTreatment =
  (typeof consultantDiscountTreatmentValues)[number];

export const consultantCalculationRunTypeValues = [
  'INITIAL_RECOGNITION',
  'RECALCULATION',
  'REFUND_RECALCULATION',
  'CLAIM_RECALCULATION',
  'PACKAGE_RECALCULATION',
  'WELFARE_ZAKAT_RECALCULATION',
  'MANUAL_RECOVERY',
] as const;
export type ConsultantCalculationRunType =
  (typeof consultantCalculationRunTypeValues)[number];

export const consultantCalculationRunStatusValues = [
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'PARTIALLY_COMPLETED',
  'FAILED',
  'DEAD_LETTERED',
  'CANCELLED',
] as const;
export type ConsultantCalculationRunStatus =
  (typeof consultantCalculationRunStatusValues)[number];

export const consultantRevenueEntryTypeValues = [
  'EARNED',
  'ACCRUED',
  'COLLECTED',
  'PENDING',
  'HELD',
  'DISPUTED',
  'ADJUSTMENT',
  'REVERSAL',
  'REFUND',
  'WRITE_OFF',
  'CLAIM_DEPENDENT',
  'PACKAGE_DEPENDENT',
  'WELFARE_ZAKAT_ADJUSTMENT',
  'TAX_WITHHOLDING',
  'DEDUCTION',
] as const;
export type ConsultantRevenueEntryType =
  (typeof consultantRevenueEntryTypeValues)[number];

export const consultantRevenueDirectionValues = [
  'CREDIT',
  'DEBIT',
] as const;
export type ConsultantRevenueDirection =
  (typeof consultantRevenueDirectionValues)[number];

export const consultantRevenueEntryStatusValues = [
  'PENDING',
  'POSTED',
  'HELD',
  'DISPUTED',
  'ADJUSTED',
  'REVERSED',
  'SETTLED',
  'CANCELLED',
] as const;
export type ConsultantRevenueEntryStatus =
  (typeof consultantRevenueEntryStatusValues)[number];

export const consultantAdjustmentStatusValues = [
  'REQUESTED',
  'APPROVAL_PENDING',
  'APPROVED',
  'POSTED',
  'REJECTED',
  'CANCELLED',
  'REVERSED',
] as const;
export type ConsultantAdjustmentStatus =
  (typeof consultantAdjustmentStatusValues)[number];

export const consultantReversalStatusValues = [
  'REQUESTED',
  'APPROVAL_PENDING',
  'APPROVED',
  'POSTED',
  'REJECTED',
  'CANCELLED',
  'REVERSED',
] as const;
export type ConsultantReversalStatus =
  (typeof consultantReversalStatusValues)[number];

export const consultantSettlementPeriodTypeValues = [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'CUSTOM',
] as const;
export type ConsultantSettlementPeriodType =
  (typeof consultantSettlementPeriodTypeValues)[number];

export const consultantSettlementStatusValues = [
  'DRAFT',
  'CALCULATED',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'PARTIALLY_PAID',
  'PAID',
  'DISPUTED',
  'CANCELLED',
  'REVERSED',
  'CLOSED',
] as const;
export type ConsultantSettlementStatus =
  (typeof consultantSettlementStatusValues)[number];

export const consultantSettlementItemTypeValues = [
  'REVENUE',
  'ADJUSTMENT',
  'REFUND_DEDUCTION',
  'CREDIT_NOTE_DEDUCTION',
  'DEBIT_NOTE_ADDITION',
  'CLAIM_ADJUSTMENT',
  'WELFARE_ZAKAT_ADJUSTMENT',
  'TAX_WITHHOLDING',
  'OTHER_DEDUCTION',
  'ADVANCE_RECOVERY',
  'OVERPAYMENT_RECOVERY',
  'OPENING_BALANCE',
  'BROUGHT_FORWARD',
] as const;
export type ConsultantSettlementItemType =
  (typeof consultantSettlementItemTypeValues)[number];

export const consultantSettlementPaymentStatusValues = [
  'REQUESTED',
  'APPROVAL_PENDING',
  'APPROVED',
  'PROCESSING',
  'PAID',
  'FAILED',
  'RETURNED',
  'CANCELLED',
  'REVERSED',
] as const;
export type ConsultantSettlementPaymentStatus =
  (typeof consultantSettlementPaymentStatusValues)[number];

export const consultantSettlementPaymentMethodValues = [
  'BANK_TRANSFER',
  'CASH',
  'DIGITAL_PAYMENT',
  'CHEQUE',
  'OTHER',
] as const;
export type ConsultantSettlementPaymentMethod =
  (typeof consultantSettlementPaymentMethodValues)[number];

export const consultantDisputeTargetTypeValues = [
  'REVENUE_ENTRY',
  'SETTLEMENT',
  'SETTLEMENT_ITEM',
  'PAYMENT',
  'AGREEMENT',
  'AGREEMENT_RULE',
] as const;
export type ConsultantDisputeTargetType =
  (typeof consultantDisputeTargetTypeValues)[number];

export const consultantDisputeStatusValues = [
  'OPEN',
  'UNDER_REVIEW',
  'INFORMATION_REQUESTED',
  'APPROVED',
  'PARTIALLY_APPROVED',
  'REJECTED',
  'RESOLVED',
  'CANCELLED',
] as const;
export type ConsultantDisputeStatus =
  (typeof consultantDisputeStatusValues)[number];

export const consultantWorkQueueTypeValues = [
  'AGREEMENT_REVIEW',
  'AGREEMENT_APPROVAL',
  'REVENUE_REVIEW',
  'MANUAL_ADJUSTMENT',
  'REVERSAL_APPROVAL',
  'SETTLEMENT_REVIEW',
  'SETTLEMENT_APPROVAL',
  'PAYOUT_APPROVAL',
  'DISPUTE_REVIEW',
  'RECONCILIATION',
  'RECOVERY',
  'EXPIRY',
] as const;
export type ConsultantWorkQueueType =
  (typeof consultantWorkQueueTypeValues)[number];

export const consultantWorkQueueStatusValues = [
  'OPEN',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_ON_INTERNAL',
  'WAITING_ON_CONSULTANT',
  'ESCALATED',
  'RESOLVED',
  'CANCELLED',
] as const;
export type ConsultantWorkQueueStatus =
  (typeof consultantWorkQueueStatusValues)[number];