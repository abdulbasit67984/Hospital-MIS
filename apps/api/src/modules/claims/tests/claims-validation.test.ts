import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  createClaimBatchSchema,
  createClaimSchema,
  recordClaimAdjudicationSchema,
} from '../claims.validation.js';

const objectIds = {
  invoice: '507f1f77bcf86cd799439011',
  determination: '507f191e810c19729de860ea',
  payer: '507f1f77bcf86cd799439012',
  plan: '507f1f77bcf86cd799439013',
  coverage: '507f1f77bcf86cd799439014',
  originalClaim: '507f1f77bcf86cd799439015',
  invoiceLine: '507f1f77bcf86cd799439016',
  secondInvoiceLine: '507f1f77bcf86cd799439017',
  claimLine: '507f1f77bcf86cd799439018',
  claim: '507f1f77bcf86cd799439019',
} as const;

function originalClaimPayload() {
  return {
    invoiceId: objectIds.invoice,
    coverageDeterminationId: objectIds.determination,
    payerOrganizationId: objectIds.payer,
    panelPlanId: objectIds.plan,
    patientCoverageId: objectIds.coverage,
    claimVersionType: 'ORIGINAL',
    diagnoses: [
      {
        codeSystem: 'ICD10',
        code: 'J18.9',
        description: 'Pneumonia, unspecified organism',
        diagnosisType: 'PRIMARY',
        sequence: 1,
      },
      {
        codeSystem: 'ICD10',
        code: 'E11.9',
        description: 'Type 2 diabetes mellitus',
        diagnosisType: 'SECONDARY',
        sequence: 2,
      },
    ],
    lines: [
      {
        invoiceLineId: objectIds.invoiceLine,
        diagnosisSequences: [1, 2],
      },
    ],
  };
}

describe('claims request validation', () => {
  it('accepts a claim-source selection without client-calculated financial totals', () => {
    expect(createClaimSchema.safeParse(originalClaimPayload()).success).toBe(true);
  });

  it('rejects client-supplied authoritative claim totals through strict DTO validation', () => {
    expect(
      createClaimSchema.safeParse({
        ...originalClaimPayload(),
        claimedAmount: '999999.00',
      }).success,
    ).toBe(false);
  });

  it('requires corrected and replacement claims to reference the original claim', () => {
    expect(
      createClaimSchema.safeParse({
        ...originalClaimPayload(),
        claimVersionType: 'CORRECTED',
      }).success,
    ).toBe(false);

    expect(
      createClaimSchema.safeParse({
        ...originalClaimPayload(),
        claimVersionType: 'REPLACEMENT',
        originalClaimId: objectIds.originalClaim,
      }).success,
    ).toBe(true);
  });

  it('requires exactly one primary diagnosis and valid line diagnosis ordering', () => {
    const payload = originalClaimPayload();

    expect(
      createClaimSchema.safeParse({
        ...payload,
        diagnoses: payload.diagnoses.map((diagnosis) => ({
          ...diagnosis,
          diagnosisType: 'SECONDARY',
        })),
      }).success,
    ).toBe(false);

    expect(
      createClaimSchema.safeParse({
        ...payload,
        lines: [
          {
            invoiceLineId: objectIds.invoiceLine,
            diagnosisSequences: [3],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('blocks duplicate service lines in a claim version', () => {
    const payload = originalClaimPayload();
    expect(
      createClaimSchema.safeParse({
        ...payload,
        lines: [
          payload.lines[0]!,
          {
            invoiceLineId: objectIds.invoiceLine,
            diagnosisSequences: [1],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('requires channel-specific claim batch references and unique claim membership', () => {
    expect(
      createClaimBatchSchema.safeParse({
        payerOrganizationId: objectIds.payer,
        submissionChannel: 'CLEARINGHOUSE',
        clearinghouseReference: 'CH-PRIMARY',
        claimIds: [objectIds.claim],
      }).success,
    ).toBe(true);

    expect(
      createClaimBatchSchema.safeParse({
        payerOrganizationId: objectIds.payer,
        submissionChannel: 'CLEARINGHOUSE',
        claimIds: [objectIds.claim],
      }).success,
    ).toBe(false);

    expect(
      createClaimBatchSchema.safeParse({
        payerOrganizationId: objectIds.payer,
        submissionChannel: 'EMAIL',
        destinationReference: 'payer-claims-channel',
        claimIds: [objectIds.claim, objectIds.claim],
      }).success,
    ).toBe(false);
  });

  it('prevents duplicate line decisions in one immutable adjudication', () => {
    const line = {
      claimLineId: objectIds.claimLine,
      decision: 'APPROVED',
      approvedAmount: '100.00',
      deniedAmount: '0.00',
      disallowedAmount: '0.00',
      returnedAmount: '0.00',
    };

    expect(
      recordClaimAdjudicationSchema.safeParse({
        expectedVersion: 1,
        payerReferenceNumber: 'PAYER-REF-1',
        adjudicatedAt: '2026-07-22T10:00:00+05:00',
        lines: [line, line],
      }).success,
    ).toBe(false);
  });
});