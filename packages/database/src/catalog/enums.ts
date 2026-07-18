export const transactionStatuses = [
  'PENDING',
  'IN_PROGRESS',
  'COMPENSATING',
  'COMPENSATED',
  'COMPLETED',
  'FAILED',
  'RECOVERY_REQUIRED',
  'MANUALLY_RESOLVED',
] as const;

export const queueStatuses = [
  'WAITING',
  'CALLED',
  'SERVING',
  'SKIPPED',
  'TRANSFERRED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;

export const bedStatuses = [
  'AVAILABLE',
  'RESERVED',
  'OCCUPIED',
  'CLEANING',
  'MAINTENANCE',
  'BLOCKED',
] as const;

export const invoiceStatuses = [
  'DRAFT',
  'ACTIVE',
  'FINALIZED',
  'PARTIALLY_PAID',
  'PAID',
  'CANCELLED',
  'REVERSED',
] as const;

export const prescriptionStatuses = [
  'DRAFT',
  'ISSUED',
  'PARTIALLY_DISPENSED',
  'DISPENSED',
  'CANCELLED',
  'EXPIRED',
] as const;

export const claimStatuses = [
  'DRAFT',
  'READY',
  'SUBMITTED',
  'UNDER_REVIEW',
  'PARTIALLY_APPROVED',
  'APPROVED',
  'REJECTED',
  'RESUBMITTED',
  'PAID',
  'CLOSED',
] as const;

export const jobStatuses = [
  'PENDING',
  'LEASED',
  'COMPLETED',
  'FAILED',
  'DEAD_LETTER',
] as const;