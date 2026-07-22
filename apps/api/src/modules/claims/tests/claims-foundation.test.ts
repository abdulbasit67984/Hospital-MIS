import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  CLAIM_PERMISSION_KEYS,
  CLAIM_SAFE_REALTIME_FIELDS,
  CLAIM_TERMINAL_STATUSES,
  isClaimStatusTransitionAllowed,
} from '../claims.constants.js';

import {
  buildClaimDuplicateKey,
  maskClaimReference,
  normalizeClaimCode,
  normalizeClaimPagination,
  safeClaimRealtimePayload,
  stableClaimPayloadHash,
} from '../claims.normalization.js';

describe('claims foundational controls', () => {
  it('defines independent permissions for sensitive maker-checker actions', () => {
    expect(CLAIM_PERMISSION_KEYS.SUBMISSION_REQUEST).not.toBe(
      CLAIM_PERMISSION_KEYS.SUBMISSION_APPROVE,
    );
    expect(CLAIM_PERMISSION_KEYS.WRITE_OFF_REQUEST).not.toBe(
      CLAIM_PERMISSION_KEYS.WRITE_OFF_APPROVE,
    );
    expect(CLAIM_PERMISSION_KEYS.APPEAL_PREPARE).not.toBe(
      CLAIM_PERMISSION_KEYS.APPEAL_APPROVE,
    );
    expect(CLAIM_PERMISSION_KEYS.REVERSE_REQUEST).not.toBe(
      CLAIM_PERMISSION_KEYS.REVERSE_APPROVE,
    );
  });

  it('allows only explicit claim lifecycle transitions and keeps terminal states closed', () => {
    expect(isClaimStatusTransitionAllowed('DRAFT', 'READY')).toBe(true);
    expect(isClaimStatusTransitionAllowed('DRAFT', 'PAID')).toBe(false);
    expect(isClaimStatusTransitionAllowed('SUBMITTED', 'ACKNOWLEDGED')).toBe(true);
    expect(CLAIM_TERMINAL_STATUSES.has('CLOSED')).toBe(true);
    expect(isClaimStatusTransitionAllowed('CLOSED', 'DRAFT')).toBe(false);
  });

  it('creates stable idempotency and duplicate hashes independent of object key order', () => {
    expect(stableClaimPayloadHash({ b: 2, a: 1 })).toBe(
      stableClaimPayloadHash({ a: 1, b: 2 }),
    );

    expect(
      buildClaimDuplicateKey({
        facilityId: 'facility',
        payerOrganizationId: 'payer',
        invoiceId: 'invoice',
        patientCoverageId: 'coverage',
      }),
    ).toHaveLength(64);
  });

  it('normalizes codes and masks policy or membership references', () => {
    expect(normalizeClaimCode(' icd 10 ')).toBe('ICD_10');
    expect(maskClaimReference('MEMBERSHIP-123456')).toBe('********3456');
    expect(maskClaimReference('1234')).toBe('****');
  });

  it('caps claim pagination at the module maximum', () => {
    expect(normalizeClaimPagination({ page: 0, pageSize: 10_000 })).toEqual({
      page: 1,
      pageSize: 200,
      skip: 0,
    });
  });

  it('emits only safe realtime workflow metadata', () => {
    const payload = safeClaimRealtimePayload({
      claimId: 'claim-id',
      claimBatchId: null,
      status: 'READY',
      previousStatus: 'DRAFT',
      version: 2,
      eventAt: '2026-07-22T10:00:00.000Z',
    });

    expect(Object.keys(payload).sort()).toEqual([...CLAIM_SAFE_REALTIME_FIELDS].sort());
    expect(JSON.stringify(payload)).not.toContain('patient');
    expect(JSON.stringify(payload)).not.toContain('membership');
    expect(JSON.stringify(payload)).not.toContain('amount');
  });
});