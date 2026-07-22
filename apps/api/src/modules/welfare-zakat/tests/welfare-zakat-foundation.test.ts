import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  WELFARE_ZAKAT_SAFE_REALTIME_FIELDS,
  WELFARE_ZAKAT_SENSITIVE_APPROVAL_ACTIONS,
  isAssistanceAllocationStatusTransitionAllowed,
  isAssistanceApplicationStatusTransitionAllowed,
  isAssistanceApprovalStatusTransitionAllowed,
  isAssistanceFundStatusTransitionAllowed,
} from '../welfare-zakat.constants.js';
import {
  buildAssistanceAllocationDuplicateKey,
  buildAssistanceApplicationDuplicateKey,
  maskAssistanceReference,
  normalizeAssistanceCode,
  normalizeAssistancePagination,
  safeWelfareZakatRealtimePayload,
  stableAssistancePayloadHash,
} from '../welfare-zakat.normalization.js';

describe('welfare and Zakat domain foundation', () => {
  it('defines controlled lifecycle transitions for funds, applications, approvals, and allocations', () => {
    expect(isAssistanceFundStatusTransitionAllowed('DRAFT', 'APPROVAL_PENDING')).toBe(
      true,
    );
    expect(isAssistanceFundStatusTransitionAllowed('ACTIVE', 'DRAFT')).toBe(false);

    expect(
      isAssistanceApplicationStatusTransitionAllowed('UNDER_REVIEW', 'ELIGIBLE'),
    ).toBe(true);
    expect(
      isAssistanceApplicationStatusTransitionAllowed('APPROVED', 'DRAFT'),
    ).toBe(false);

    expect(isAssistanceApprovalStatusTransitionAllowed('PENDING', 'APPROVED')).toBe(
      true,
    );
    expect(isAssistanceApprovalStatusTransitionAllowed('REJECTED', 'APPROVED')).toBe(
      false,
    );

    expect(
      isAssistanceAllocationStatusTransitionAllowed('CONFIRMED', 'UTILIZED'),
    ).toBe(true);
    expect(isAssistanceAllocationStatusTransitionAllowed('REVERSED', 'UTILIZED')).toBe(
      false,
    );
  });

  it('marks sensitive actions as independently approved and keeps realtime fields minimal', () => {
    expect(WELFARE_ZAKAT_SENSITIVE_APPROVAL_ACTIONS.has('FUND_TRANSFER_APPROVE')).toBe(
      true,
    );
    expect(
      WELFARE_ZAKAT_SENSITIVE_APPROVAL_ACTIONS.has(
        'ALLOCATION_REVERSE_APPROVE',
      ),
    ).toBe(true);
    expect(WELFARE_ZAKAT_SAFE_REALTIME_FIELDS).not.toContain('patientId');
    expect(WELFARE_ZAKAT_SAFE_REALTIME_FIELDS).not.toContain('amount');
    expect(WELFARE_ZAKAT_SAFE_REALTIME_FIELDS).not.toContain('donorReference');
  });

  it('normalizes codes, masks references, and creates stable duplicate keys', () => {
    expect(normalizeAssistanceCode(' zakat patient fund ')).toBe(
      'ZAKAT_PATIENT_FUND',
    );
    expect(maskAssistanceReference('DONOR-REFERENCE-9988')).toBe('********9988');

    const first = buildAssistanceApplicationDuplicateKey({
      facilityId: 'facility-1',
      patientId: 'patient-1',
      applicationType: 'zakat',
      invoiceId: 'invoice-1',
      financialYearCode: 'fy-2026',
    });
    const second = buildAssistanceApplicationDuplicateKey({
      financialYearCode: 'FY-2026',
      invoiceId: 'invoice-1',
      applicationType: 'ZAKAT',
      patientId: 'patient-1',
      facilityId: 'facility-1',
    });

    expect(first).toBe(second);
    expect(first).toHaveLength(64);

    expect(
      buildAssistanceAllocationDuplicateKey({
        facilityId: 'facility-1',
        fundId: 'fund-1',
        patientId: 'patient-1',
        applicationId: 'application-1',
        approvalId: 'approval-1',
        invoiceId: 'invoice-1',
        invoiceLineId: 'line-1',
      }),
    ).toHaveLength(64);

    expect(stableAssistancePayloadHash({ b: 2, a: 1 })).toBe(
      stableAssistancePayloadHash({ a: 1, b: 2 }),
    );
  });

  it('normalizes pagination and produces a safe realtime event payload', () => {
    expect(normalizeAssistancePagination({ page: -5, pageSize: 10_000 })).toEqual({
      page: 1,
      pageSize: 200,
      skip: 0,
    });

    expect(
      safeWelfareZakatRealtimePayload({
        fundId: 'fund-1',
        applicationId: 'application-1',
        allocationId: 'allocation-1',
        status: 'CONFIRMED',
        previousStatus: 'RESERVED',
        version: 4,
        eventAt: '2026-07-22T10:00:00.000Z',
      }),
    ).toEqual({
      fundId: 'fund-1',
      applicationId: 'application-1',
      approvalId: null,
      allocationId: 'allocation-1',
      status: 'CONFIRMED',
      previousStatus: 'RESERVED',
      version: 4,
      eventAt: '2026-07-22T10:00:00.000Z',
    });
  });
});