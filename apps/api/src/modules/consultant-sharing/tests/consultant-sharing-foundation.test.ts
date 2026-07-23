import { describe, expect, it } from 'vitest';

import {
  CONSULTANT_SHARING_SAFE_REALTIME_FIELDS,
  CONSULTANT_SHARING_SENSITIVE_APPROVAL_ACTIONS,
  isConsultantAgreementStatusTransitionAllowed,
  isConsultantDisputeStatusTransitionAllowed,
  isConsultantSettlementStatusTransitionAllowed,
} from '../consultant-sharing.constants.js';
import {
  buildConsultantCalculationDuplicateKey,
  buildConsultantParticipantDuplicateKey,
  buildConsultantSettlementDuplicateKey,
  maskConsultantFinancialReference,
  normalizeConsultantSharingCode,
  normalizeConsultantSharingPagination,
  safeConsultantSharingRealtimePayload,
  stableConsultantSharingPayloadHash,
} from '../consultant-sharing.normalization.js';

const id = (digit: string): string => digit.repeat(24);

describe('consultant sharing domain foundation', () => {
  it('defines controlled agreement, settlement, and dispute transitions', () => {
    expect(isConsultantAgreementStatusTransitionAllowed('DRAFT', 'SUBMITTED')).toBe(
      true,
    );
    expect(isConsultantAgreementStatusTransitionAllowed('ACTIVE', 'DRAFT')).toBe(
      false,
    );
    expect(
      isConsultantSettlementStatusTransitionAllowed('APPROVED', 'PARTIALLY_PAID'),
    ).toBe(true);
    expect(isConsultantSettlementStatusTransitionAllowed('PAID', 'DRAFT')).toBe(
      false,
    );
    expect(isConsultantDisputeStatusTransitionAllowed('OPEN', 'UNDER_REVIEW')).toBe(
      true,
    );
    expect(isConsultantDisputeStatusTransitionAllowed('RESOLVED', 'OPEN')).toBe(
      false,
    );
  });

  it('requires independent approval for sensitive actions and minimizes realtime fields', () => {
    expect(
      CONSULTANT_SHARING_SENSITIVE_APPROVAL_ACTIONS.has('AGREEMENT_APPROVE'),
    ).toBe(true);
    expect(
      CONSULTANT_SHARING_SENSITIVE_APPROVAL_ACTIONS.has('PAYOUT_APPROVE'),
    ).toBe(true);
    expect(CONSULTANT_SHARING_SAFE_REALTIME_FIELDS).not.toContain('consultantShare');
    expect(CONSULTANT_SHARING_SAFE_REALTIME_FIELDS).not.toContain('patientId');
    expect(CONSULTANT_SHARING_SAFE_REALTIME_FIELDS).not.toContain('paymentReference');
  });

  it('normalizes codes, masks references, and creates stable duplicate keys', () => {
    expect(normalizeConsultantSharingCode(' Surgery consultant / private ')).toBe(
      'SURGERY_CONSULTANT_/_PRIVATE',
    );
    expect(maskConsultantFinancialReference('PK00-BANK-99887766')).toBe(
      '**************7766',
    );

    const first = buildConsultantCalculationDuplicateKey({
      facilityId: id('1'),
      consultantId: id('2'),
      agreementId: id('3'),
      agreementVersion: 2,
      agreementRuleId: id('4'),
      ruleVersion: 3,
      sourceFinancialEventId: 'ledger-event-1',
      invoiceLineId: id('5'),
    });
    const second = buildConsultantCalculationDuplicateKey({
      invoiceLineId: id('5'),
      sourceFinancialEventId: 'ledger-event-1',
      ruleVersion: 3,
      agreementRuleId: id('4'),
      agreementVersion: 2,
      agreementId: id('3'),
      consultantId: id('2'),
      facilityId: id('1'),
    });

    expect(first).toBe(second);
    expect(first).toHaveLength(64);
    expect(
      buildConsultantParticipantDuplicateKey({
        participantId: id('6'),
        participantRole: 'surgeon',
      }),
    ).toHaveLength(64);
    expect(
      buildConsultantSettlementDuplicateKey({
        facilityId: id('1'),
        consultantId: id('2'),
        periodFrom: '2026-07-01T00:00:00.000Z',
        periodThrough: '2026-07-31T23:59:59.999Z',
        currency: 'pkr',
      }),
    ).toHaveLength(64);
    expect(stableConsultantSharingPayloadHash({ b: 2, a: 1 })).toBe(
      stableConsultantSharingPayloadHash({ a: 1, b: 2 }),
    );
  });

  it('normalizes pagination and strips sensitive realtime values', () => {
    expect(
      normalizeConsultantSharingPagination({ page: -2, pageSize: 99_999 }),
    ).toEqual({ page: 1, pageSize: 200, skip: 0 });

    expect(
      safeConsultantSharingRealtimePayload({
        agreementId: id('3'),
        settlementId: id('4'),
        status: 'APPROVED',
        previousStatus: 'UNDER_REVIEW',
        version: 8,
        eventAt: '2026-07-23T01:00:00.000Z',
        consultantShare: '999999.00',
        patientId: id('5'),
        paymentReference: 'SENSITIVE',
      }),
    ).toEqual({
      agreementId: id('3'),
      ruleId: null,
      revenueEntryId: null,
      settlementId: id('4'),
      disputeId: null,
      status: 'APPROVED',
      previousStatus: 'UNDER_REVIEW',
      version: 8,
      eventAt: '2026-07-23T01:00:00.000Z',
    });
  });
});