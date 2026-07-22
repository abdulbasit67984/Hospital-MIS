export const diagnosticPanelTypeValues = [
  'LABORATORY',
  'RADIOLOGY',
  'CLINICAL',
  'MIXED',
] as const;

export type DiagnosticPanelType =
  (typeof diagnosticPanelTypeValues)[number];

export const diagnosticPanelStatusValues = [
  'DRAFT',
  'ACTIVE',
  'SUSPENDED',
  'RETIRED',
] as const;

export type DiagnosticPanelStatus =
  (typeof diagnosticPanelStatusValues)[number];

export const payerOrganizationTypeValues = [
  'EMPLOYER',
  'INSURANCE',
  'GOVERNMENT',
  'CHARITY',
  'SELF_PAY',
] as const;

export type PayerOrganizationType =
  (typeof payerOrganizationTypeValues)[number];

export const payerRecordStatusValues = [
  'DRAFT',
  'ACTIVE',
  'SUSPENDED',
  'EXPIRED',
  'RETIRED',
] as const;

export type PayerRecordStatus =
  (typeof payerRecordStatusValues)[number];

export const panelProgramTypeValues = [
  'EMPLOYER',
  'INSURANCE',
  'GOVERNMENT',
  'CHARITY',
  'CORPORATE',
  'OTHER',
] as const;

export type PanelProgramType =
  (typeof panelProgramTypeValues)[number];

export const coverageEnrollmentStatusValues = [
  'PENDING_VERIFICATION',
  'ACTIVE',
  'SUSPENDED',
  'EXPIRED',
  'CANCELLED',
] as const;

export type CoverageEnrollmentStatus =
  (typeof coverageEnrollmentStatusValues)[number];

export const coveragePriorityValues = [
  'PRIMARY',
  'SECONDARY',
] as const;

export type CoveragePriority =
  (typeof coveragePriorityValues)[number];

export const coverageRuleEffectValues = [
  'COVER',
  'EXCLUDE',
  'REQUIRE_PREAUTHORIZATION',
  'RESTRICT_NETWORK',
] as const;

export type CoverageRuleEffect =
  (typeof coverageRuleEffectValues)[number];

export const coverageLimitPeriodValues = [
  'PER_SERVICE',
  'PER_VISIT',
  'ANNUAL',
  'LIFETIME',
  'AGGREGATE',
] as const;

export type CoverageLimitPeriod =
  (typeof coverageLimitPeriodValues)[number];

export const coverageVerificationStatusValues = [
  'VERIFIED',
  'INELIGIBLE',
] as const;

export type CoverageVerificationStatus =
  (typeof coverageVerificationStatusValues)[number];

export const preauthorizationStatusValues = [
  'DRAFT',
  'PENDING',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'PARTIALLY_APPROVED',
  'DENIED',
  'EXPIRED',
  'CANCELLED',
] as const;

export type PreauthorizationStatus =
  (typeof preauthorizationStatusValues)[number];

export const coverageDeterminationStatusValues = [
  'ESTIMATED',
  'APPROVED',
  'PARTIALLY_APPROVED',
  'DENIED',
  'OVERRIDDEN',
  'REVERSED',
] as const;

export type CoverageDeterminationStatus =
  (typeof coverageDeterminationStatusValues)[number];

export const coverageDenialReasonValues = [
  'NOT_ELIGIBLE',
  'SERVICE_EXCLUDED',
  'LIMIT_EXHAUSTED',
  'WAITING_PERIOD',
  'PREAUTHORIZATION_REQUIRED',
  'OUT_OF_NETWORK',
  'COVERAGE_INACTIVE',
  'INVALID_MEMBERSHIP',
  'COORDINATION_OF_BENEFITS',
  'OTHER',
] as const;

export type CoverageDenialReason =
  (typeof coverageDenialReasonValues)[number];

export const coverageUtilizationStatusValues = [
  'RESERVED',
  'CONSUMED',
  'REVERSED',
  'CANCELLED',
] as const;

export type CoverageUtilizationStatus =
  (typeof coverageUtilizationStatusValues)[number];

export const coverageHistoryActionValues = [
  'CREATED',
  'ACTIVATED',
  'SUSPENDED',
  'VERIFIED',
  'DETERMINED',
  'OVERRIDDEN',
  'UTILIZED',
  'REFUND_APPLIED',
  'REVERSED',
  'EXPIRED',
  'CANCELLED',
] as const;

export type CoverageHistoryAction =
  (typeof coverageHistoryActionValues)[number];