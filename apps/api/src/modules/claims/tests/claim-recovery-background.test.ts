import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  CLAIM_BACKGROUND_JOB_TYPES,
  CLAIM_RECOVERABLE_TRANSACTION_TYPES,
  claimAgingBucketForDays,
  claimSubmissionFailureState,
} from '../services/claim-recovery.service.js';

describe('claims recovery and background processing', () => {
  it('maps receivable age to stable aging buckets', () => {
    expect(claimAgingBucketForDays(0)).toBe('CURRENT');
    expect(claimAgingBucketForDays(30)).toBe('DAYS_1_30');
    expect(claimAgingBucketForDays(31)).toBe('DAYS_31_60');
    expect(claimAgingBucketForDays(181)).toBe('DAYS_181_PLUS');
  });

  it('moves exhausted submission retries to dead letter', () => {
    expect(claimSubmissionFailureState(0, 5)).toBe('FAILED_RETRYABLE');
    expect(claimSubmissionFailureState(4, 5)).toBe('DEAD_LETTER');
  });

  it('registers unique job and recovery transaction types', () => {
    expect(new Set(CLAIM_BACKGROUND_JOB_TYPES).size).toBe(
      CLAIM_BACKGROUND_JOB_TYPES.length,
    );
    expect(new Set(CLAIM_RECOVERABLE_TRANSACTION_TYPES).size).toBe(
      CLAIM_RECOVERABLE_TRANSACTION_TYPES.length,
    );
    expect(CLAIM_BACKGROUND_JOB_TYPES).toContain('CLAIM_REPORT_EXPORT');
    expect(CLAIM_BACKGROUND_JOB_TYPES).toContain('CLAIM_SUBMISSION_DISPATCH');
  });
});