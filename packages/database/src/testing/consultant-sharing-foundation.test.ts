import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  collectionSpecs,
} from '../catalog/collection-specs.js';

import {
  consultantAgreementHistorySchema,
  consultantAgreementRuleHistorySchema,
  consultantAgreementRuleSchema,
  consultantAgreementSchema,
} from '../models/consultant-agreement.model.js';

import {
  consultantDisputeHistorySchema,
  consultantDisputeSchema,
  consultantWorkItemSchema,
} from '../models/consultant-dispute.model.js';

import {
  consultantCalculationRunSchema,
  consultantRevenueAdjustmentSchema,
  consultantRevenueEntrySchema,
  consultantRevenueParticipantSchema,
  consultantRevenueReversalSchema,
} from '../models/consultant-revenue.model.js';

import {
  consultantSettlementItemSchema,
  consultantSettlementPaymentSchema,
  consultantSettlementSchema,
} from '../models/consultant-settlement.model.js';

import {
  consultantSharingSchemas,
  schemaForCollection,
} from '../models/registry.js';

function indexNames(
  schema: { indexes(): Array<[unknown, { name?: string }]> },
): string[] {
  return schema
    .indexes()
    .map(([, options]) => options.name)
    .filter((name): name is string => name != null);
}

describe('Consultant sharing persistence foundation', () => {
  it('registers all production consultant-sharing collections with explicit schemas', () => {
    expect(Object.keys(consultantSharingSchemas).sort()).toEqual([
      'consultantAgreementHistories',
      'consultantAgreementRuleHistories',
      'consultantAgreementRules',
      'consultantAgreements',
      'consultantCalculationRuns',
      'consultantDisputeHistories',
      'consultantDisputes',
      'consultantRevenueAdjustments',
      'consultantRevenueEntries',
      'consultantRevenueParticipants',
      'consultantRevenueReversals',
      'consultantSettlementItems',
      'consultantSettlementPayments',
      'consultantSettlements',
      'consultantWorkItems',
    ]);

    for (const [name, schema] of Object.entries(consultantSharingSchemas)) {
      expect(
        schemaForCollection(name as keyof typeof consultantSharingSchemas),
      ).toBe(schema);
    }
  });

  it('marks calculation evidence and financial histories as immutable', () => {
    const retention = new Map(
      collectionSpecs
        .filter((spec) => spec.domain === 'consultantSharing')
        .map((spec) => [spec.name, spec.retention]),
    );

    expect(retention.get('consultantAgreementHistories')).toBe('immutable');
    expect(retention.get('consultantAgreementRuleHistories')).toBe('immutable');
    expect(retention.get('consultantRevenueEntries')).toBe('immutable');
    expect(retention.get('consultantRevenueParticipants')).toBe('immutable');
    expect(retention.get('consultantSettlementItems')).toBe('immutable');
    expect(retention.get('consultantDisputeHistories')).toBe('immutable');
  });

  it('defines agreement matching, fallback, version, and expiry indexes', () => {
    expect(indexNames(consultantAgreementSchema)).toEqual(
      expect.arrayContaining([
        'uq_consultant_agreements_number',
        'ix_consultant_agreements_matching',
        'ix_consultant_agreements_expiry',
        'uq_consultant_agreements_version_lineage',
      ]),
    );
    expect(indexNames(consultantAgreementRuleSchema)).toEqual(
      expect.arrayContaining([
        'uq_consultant_agreement_rules_version',
        'uq_consultant_agreement_rules_fingerprint',
        'ix_consultant_agreement_rules_matching',
        'uq_consultant_agreement_rules_active_fallback',
      ]),
    );
    expect(indexNames(consultantAgreementHistorySchema)).toContain(
      'uq_consultant_agreement_histories_hash',
    );
    expect(indexNames(consultantAgreementRuleHistorySchema)).toContain(
      'uq_consultant_agreement_rule_histories_hash',
    );
  });

  it('defines idempotency, duplicate-recognition, reversal, and recovery indexes', () => {
    expect(indexNames(consultantCalculationRunSchema)).toEqual(
      expect.arrayContaining([
        'uq_consultant_calculation_runs_operation',
        'uq_consultant_calculation_runs_input',
        'ix_consultant_calculation_runs_recovery',
      ]),
    );
    expect(indexNames(consultantRevenueEntrySchema)).toEqual(
      expect.arrayContaining([
        'uq_consultant_revenue_entries_operation',
        'uq_consultant_revenue_entries_calculation_hash',
        'uq_consultant_revenue_entries_recognition',
        'ix_consultant_revenue_entries_ledger_trace',
      ]),
    );
    expect(indexNames(consultantRevenueParticipantSchema)).toContain(
      'uq_consultant_revenue_participants_entry_role',
    );
    expect(indexNames(consultantRevenueAdjustmentSchema)).toContain(
      'ix_consultant_revenue_adjustments_approval_queue',
    );
    expect(indexNames(consultantRevenueReversalSchema)).toContain(
      'uq_consultant_revenue_reversals_source',
    );
  });

  it('defines settlement, payout, dispute, and work-queue integrity indexes', () => {
    expect(indexNames(consultantSettlementSchema)).toEqual(
      expect.arrayContaining([
        'uq_consultant_settlements_active_period',
        'ix_consultant_settlements_payable_queue',
      ]),
    );
    expect(indexNames(consultantSettlementItemSchema)).toEqual(
      expect.arrayContaining([
        'uq_consultant_settlement_items_source',
        'uq_consultant_settlement_items_revenue_entry',
      ]),
    );
    expect(indexNames(consultantSettlementPaymentSchema)).toEqual(
      expect.arrayContaining([
        'uq_consultant_settlement_payments_reference',
        'ix_consultant_settlement_payments_approval_queue',
      ]),
    );
    expect(indexNames(consultantDisputeSchema)).toContain(
      'ix_consultant_disputes_deadline',
    );
    expect(indexNames(consultantDisputeHistorySchema)).toContain(
      'uq_consultant_dispute_histories_hash',
    );
    expect(indexNames(consultantWorkItemSchema)).toContain(
      'ix_consultant_work_items_escalation',
    );
  });

  it('excludes sensitive agreement, dispute, payout, and tax data from default queries', () => {
    expect(consultantAgreementSchema.path('internalNotesEncrypted').options.select).toBe(false);
    expect(consultantAgreementSchema.path('taxProfileReferenceHash').options.select).toBe(false);
    expect(consultantDisputeSchema.path('evidenceEncrypted').options.select).toBe(false);
    expect(
      consultantSettlementPaymentSchema.path('paymentReferenceHash').options.select,
    ).toBe(false);
    expect(
      consultantSettlementPaymentSchema.path('payoutProfileReferenceHash').options.select,
    ).toBe(false);
  });
});