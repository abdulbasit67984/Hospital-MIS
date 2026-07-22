import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  collectionSpecs,
} from '../catalog/collection-specs.js';

import {
  assistanceApplicationSchema,
  assistanceApplicationHistorySchema,
  assistanceReviewSchema,
  eligibilityEvaluationSnapshotSchema,
} from '../models/assistance-application.model.js';

import {
  assistanceApprovalHistorySchema,
  assistanceApprovalSchema,
  assistanceReservationSchema,
} from '../models/assistance-approval.model.js';

import {
  fundAllocationReversalSchema,
  fundReturnSchema,
  invoiceFundAllocationSchema,
} from '../models/assistance-allocation.model.js';

import {
  assistanceFundSchema,
  fundTransactionSchema,
  fundTransferSchema,
} from '../models/assistance-fund.model.js';

import {
  assistanceWorkItemSchema,
} from '../models/assistance-work-item.model.js';

import {
  schemaForCollection,
  welfareZakatSchemas,
} from '../models/registry.js';

function indexNames(schema: { indexes(): Array<[unknown, { name?: string }]> }): string[] {
  return schema
    .indexes()
    .map(([, options]) => options.name)
    .filter((name): name is string => name != null);
}

describe('Welfare and Zakat persistence foundation', () => {
  it('registers all production assistance collections with explicit schemas', () => {
    expect(Object.keys(welfareZakatSchemas).sort()).toEqual([
      'assistanceApplicationHistories',
      'assistanceApplications',
      'assistanceApprovalHistories',
      'assistanceApprovals',
      'assistanceFunds',
      'assistanceReservations',
      'assistanceReviews',
      'assistanceWorkItems',
      'eligibilityEvaluationSnapshots',
      'fundAllocationReversals',
      'fundReturns',
      'fundTransactions',
      'fundTransfers',
      'invoiceFundAllocations',
    ]);

    for (const [name, schema] of Object.entries(welfareZakatSchemas)) {
      expect(schemaForCollection(name as keyof typeof welfareZakatSchemas)).toBe(schema);
    }
  });

  it('marks immutable ledgers and histories in the collection catalog', () => {
    const retention = new Map(
      collectionSpecs
        .filter((spec) => spec.domain === 'assistance')
        .map((spec) => [spec.name, spec.retention]),
    );

    expect(retention.get('fundTransactions')).toBe('immutable');
    expect(retention.get('assistanceApplicationHistories')).toBe('immutable');
    expect(retention.get('assistanceReviews')).toBe('immutable');
    expect(retention.get('eligibilityEvaluationSnapshots')).toBe('immutable');
    expect(retention.get('assistanceApprovalHistories')).toBe('immutable');
    expect(retention.get('fundReturns')).toBe('immutable');
  });

  it('defines concurrency, work-queue, expiry, and duplicate-funding indexes', () => {
    expect(indexNames(assistanceFundSchema)).toContain('uq_assistance_funds_code');
    expect(indexNames(fundTransactionSchema)).toContain('ix_fund_transactions_ledger');
    expect(indexNames(fundTransferSchema)).toContain('ix_fund_transfers_approval_queue');
    expect(indexNames(assistanceApplicationSchema)).toContain(
      'ix_assistance_applications_duplicate',
    );
    expect(indexNames(assistanceApprovalSchema)).toContain('ix_assistance_approvals_expiry');
    expect(indexNames(assistanceReservationSchema)).toContain(
      'ix_assistance_reservations_expiry',
    );
    expect(indexNames(invoiceFundAllocationSchema)).toContain(
      'uq_invoice_fund_allocations_duplicate',
    );
    expect(indexNames(assistanceWorkItemSchema)).toContain(
      'ix_assistance_work_items_escalation',
    );
  });

  it('indexes immutable history hashes and allocation recovery records', () => {
    expect(indexNames(assistanceApplicationHistorySchema)).toContain(
      'uq_assistance_application_histories_hash',
    );
    expect(indexNames(assistanceReviewSchema)).toContain('uq_assistance_reviews_hash');
    expect(indexNames(eligibilityEvaluationSnapshotSchema)).toContain(
      'uq_eligibility_evaluation_snapshots_hash',
    );
    expect(indexNames(assistanceApprovalHistorySchema)).toContain(
      'uq_assistance_approval_histories_hash',
    );
    expect(indexNames(fundAllocationReversalSchema)).toContain(
      'uq_fund_allocation_reversals_hash',
    );
    expect(indexNames(fundReturnSchema)).toContain('uq_fund_returns_hash');
  });

  it('excludes encrypted welfare evidence and assessments from default queries', () => {
    expect(assistanceApplicationSchema.path('applicantSnapshotEncrypted').options.select).toBe(
      false,
    );
    expect(assistanceApplicationSchema.path('zakatDeclarationSnapshotEncrypted').options.select).toBe(
      false,
    );
    expect(assistanceReviewSchema.path('assessmentEncrypted').options.select).toBe(false);
    expect(assistanceApprovalSchema.path('conditionsEncrypted').options.select).toBe(false);
  });
});