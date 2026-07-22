import mongoose from 'mongoose';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  collectionSpecs,
} from '../catalog/collection-specs.js';

import {
  claimAdjudicationSchema,
  claimAppealSchema,
} from '../models/claims-adjudication.model.js';

import {
  claimLineSchema,
  claimSchema,
  claimValidationSnapshotSchema,
} from '../models/claims-core.model.js';

import {
  claimAdjustmentSchema,
  claimPaymentSchema,
  claimRemittanceSchema,
} from '../models/claims-remittance.model.js';

import {
  claimBatchSchema,
  claimStatusHistorySchema,
  claimSubmissionSchema,
  claimVersionHistorySchema,
  claimWorkItemSchema,
} from '../models/claims-workflow.model.js';

import {
  claimsSchemas,
  schemaForCollection,
} from '../models/registry.js';

import {
  claimsFoundation,
  claimsFoundationCollections,
  claimsFoundationValidators,
} from '../migrations/034-claims-foundation.js';

import {
  migrations,
} from '../migrations/index.js';

function indexNames(schema: mongoose.Schema): string[] {
  return schema.indexes().flatMap(([, options]) =>
    typeof options.name === 'string' ? [options.name] : [],
  );
}

describe('claims database foundation', () => {
  it('registers migration 034 after panels, packages, and coverage', () => {
    expect(migrations.at(-1)).toBe(claimsFoundation);
  });

  it('registers every claims collection, validator, and schema', () => {
    const registered = new Set(collectionSpecs.map((spec) => spec.name));

    for (const collectionName of claimsFoundationCollections) {
      expect(registered.has(collectionName)).toBe(true);
      expect(claimsFoundationValidators[collectionName]).toBeDefined();
      expect(schemaForCollection(collectionName)).toBe(
        claimsSchemas[collectionName],
      );
    }
  });

  it('marks financial and workflow history collections immutable', () => {
    const retentionByName = new Map(
      collectionSpecs.map((spec) => [spec.name, spec.retention]),
    );

    for (const collectionName of [
      'claimValidationSnapshots',
      'claimStatusHistories',
      'claimVersionHistories',
      'claimAdjudications',
      'claimRemittances',
      'claimPayments',
    ] as const) {
      expect(retentionByName.get(collectionName)).toBe('immutable');
    }
  });

  it('defines claim-number, operation, duplicate, and aging indexes', () => {
    const names = indexNames(claimSchema);

    expect(names).toContain('uq_claims_number');
    expect(names).toContain('uq_claims_operation');
    expect(names).toContain('ix_claims_duplicate_status');
    expect(names).toContain('ix_claims_payer_status_aging');
    expect(names).toContain('ix_claims_assignment_follow_up');
  });

  it('prevents duplicate invoice lines inside a claim version', () => {
    const names = indexNames(claimLineSchema);

    expect(names).toContain('uq_claim_lines_invoice_line');
    expect(names).toContain('uq_claim_lines_duplicate');
  });

  it('protects sensitive references and clinical notes from default queries', () => {
    expect(claimSchema.path('policyReferenceHash').options.select).toBe(false);
    expect(claimSchema.path('membershipReferenceHash').options.select).toBe(
      false,
    );
    expect(claimSchema.path('internalNoteEncrypted').options.select).toBe(
      false,
    );
    expect(
      claimSchema.path('medicalNecessitySummaryEncrypted').options.select,
    ).toBe(false);
    expect(claimAppealSchema.path('groundsEncrypted').options.select).toBe(
      false,
    );
  });

  it('indexes immutable validation, status, version, and adjudication history', () => {
    expect(indexNames(claimValidationSnapshotSchema)).toContain(
      'uq_claim_validation_snapshots_payload',
    );
    expect(indexNames(claimStatusHistorySchema)).toContain(
      'uq_claim_status_histories_hash',
    );
    expect(indexNames(claimVersionHistorySchema)).toContain(
      'uq_claim_version_histories_number',
    );
    expect(indexNames(claimAdjudicationSchema)).toContain(
      'uq_claim_adjudications_sequence',
    );
  });

  it('indexes submission retry, remittance matching, and sponsor allocations', () => {
    expect(indexNames(claimBatchSchema)).toContain(
      'uq_claim_batches_operation',
    );
    expect(indexNames(claimSubmissionSchema)).toContain(
      'ix_claim_submissions_retry',
    );
    expect(indexNames(claimRemittanceSchema)).toContain(
      'uq_claim_remittances_payer_reference',
    );
    expect(indexNames(claimPaymentSchema)).toContain(
      'uq_claim_payments_remittance_target',
    );
  });

  it('indexes maker-checker approvals and operational work queues', () => {
    expect(indexNames(claimAdjustmentSchema)).toContain(
      'ix_claim_adjustments_approval_queue',
    );
    expect(indexNames(claimWorkItemSchema)).toContain(
      'ix_claim_work_items_assignee_queue',
    );
    expect(indexNames(claimWorkItemSchema)).toContain(
      'ix_claim_work_items_escalation',
    );
  });
});