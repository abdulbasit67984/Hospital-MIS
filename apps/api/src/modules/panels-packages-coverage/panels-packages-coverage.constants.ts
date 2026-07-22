export const PANEL_PACKAGE_COVERAGE_CURRENCY = 'PKR' as const;

export const panelTypeValues = [
  'LABORATORY',
  'RADIOLOGY',
  'CLINICAL',
  'MIXED',
] as const;

export const panelStatusValues = [
  'DRAFT',
  'ACTIVE',
  'SUSPENDED',
  'RETIRED',
] as const;

export const packageTypeValues = [
  'PROCEDURE',
  'ADMISSION',
  'MATERNITY',
  'SURGERY',
  'DIAGNOSTIC',
  'WELLNESS',
  'CUSTOM',
] as const;

export const packagePricingModeValues = [
  'FIXED_PRICE',
  'DISCOUNTED',
] as const;

export const packageStatusValues = [
  'DRAFT',
  'ACTIVE',
  'SUSPENDED',
  'EXPIRED',
  'RETIRED',
] as const;

export const packageEnrollmentStatusValues = [
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'REVERSED',
] as const;

export const packageUtilizationStatusValues = [
  'RESERVED',
  'CONSUMED',
  'REVERSED',
  'CANCELLED',
] as const;

export const payerOrganizationTypeValues = [
  'EMPLOYER',
  'INSURANCE',
  'GOVERNMENT',
  'CHARITY',
  'SELF_PAY',
] as const;

export const coveragePlanStatusValues = [
  'DRAFT',
  'ACTIVE',
  'SUSPENDED',
  'EXPIRED',
  'RETIRED',
] as const;

export const coverageEnrollmentStatusValues = [
  'PENDING_VERIFICATION',
  'ACTIVE',
  'SUSPENDED',
  'EXPIRED',
  'CANCELLED',
] as const;

export const coveragePriorityValues = [
  'PRIMARY',
  'SECONDARY',
] as const;

export const coverageRuleEffectValues = [
  'COVER',
  'EXCLUDE',
  'REQUIRE_PREAUTHORIZATION',
  'RESTRICT_NETWORK',
] as const;

export const coverageLimitPeriodValues = [
  'PER_SERVICE',
  'PER_VISIT',
  'ANNUAL',
  'LIFETIME',
  'AGGREGATE',
] as const;

export const coverageDeterminationStatusValues = [
  'ESTIMATED',
  'APPROVED',
  'PARTIALLY_APPROVED',
  'DENIED',
  'OVERRIDDEN',
  'REVERSED',
] as const;

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

export const PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS = {
  PANEL_READ: 'panels.read',
  PANEL_MANAGE: 'panels.manage',
  PANEL_ACTIVATE: 'panels.activate',
  PACKAGE_READ: 'packages.read',
  PACKAGE_MANAGE: 'packages.manage',
  PACKAGE_ACTIVATE: 'packages.activate',
  PACKAGE_ENROLL: 'packages.enroll',
  PACKAGE_SUSPEND: 'packages.suspend',
  PACKAGE_CANCEL: 'packages.cancel',
  PACKAGE_REVERSE: 'packages.reverse',
  COVERAGE_READ: 'coverage.read',
  COVERAGE_MANAGE: 'coverage.manage',
  COVERAGE_ACTIVATE: 'coverage.activate',
  COVERAGE_ENROLL: 'coverage.enroll',
  COVERAGE_VERIFY: 'coverage.verify',
  COVERAGE_ESTIMATE: 'coverage.estimate',
  COVERAGE_DETERMINE: 'coverage.determine',
  COVERAGE_OVERRIDE: 'coverage.override',
  UTILIZATION_READ: 'coverage.utilization.read',
  REPORT_READ: 'coverage.reports.read',
  REPORT_EXPORT: 'coverage.reports.export',
} as const;

export const PANEL_PACKAGE_COVERAGE_EVENTS = {
  PANEL_CREATED: 'panels-packages-coverage.panel.created',
  PANEL_ACTIVATED: 'panels-packages-coverage.panel.activated',
  PACKAGE_CREATED: 'panels-packages-coverage.package.created',
  PACKAGE_ACTIVATED: 'panels-packages-coverage.package.activated',
  PACKAGE_ENROLLED: 'panels-packages-coverage.package.enrolled',
  PACKAGE_UTILIZED: 'panels-packages-coverage.package.utilized',
  PACKAGE_UTILIZATION_REVERSED:
    'panels-packages-coverage.package.utilization_reversed',
  COVERAGE_PLAN_CREATED: 'panels-packages-coverage.coverage_plan.created',
  COVERAGE_PLAN_ACTIVATED: 'panels-packages-coverage.coverage_plan.activated',
  COVERAGE_ENROLLED: 'panels-packages-coverage.coverage.enrolled',
  COVERAGE_VERIFIED: 'panels-packages-coverage.coverage.verified',
  COVERAGE_DETERMINED: 'panels-packages-coverage.coverage.determined',
  COVERAGE_UTILIZED: 'panels-packages-coverage.coverage.utilized',
  COVERAGE_UTILIZATION_REVERSED:
    'panels-packages-coverage.coverage.utilization_reversed',
} as const;

export const DEFAULT_PANEL_PACKAGE_COVERAGE_PAGE_SIZE = 25;
export const MAX_PANEL_PACKAGE_COVERAGE_PAGE_SIZE = 100;
export const MAX_PANEL_ITEMS = 250;
export const MAX_PACKAGE_ITEMS = 500;
export const MAX_COVERAGE_RULES = 1_000;
export const MAX_COORDINATED_COVERAGES = 2;