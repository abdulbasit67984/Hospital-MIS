import { describe, expect, it } from 'vitest';

import {
  CONSULTANT_SHARING_REPORT_NAMES,
  type ConsultantSharingReportName,
} from '../consultant-sharing.reporting.contracts.js';
import {
  buildConsultantSharingReportSource,
  consultantSharingCsvCell,
} from '../services/consultant-sharing-reporting.service.js';

const facilityId = '507f1f77bcf86cd799439011';

describe('Consultant Sharing reporting', () => {
  it('registers the complete unique production report catalog', () => {
    expect(CONSULTANT_SHARING_REPORT_NAMES).toHaveLength(29);
    expect(new Set(CONSULTANT_SHARING_REPORT_NAMES).size).toBe(29);
    expect(CONSULTANT_SHARING_REPORT_NAMES).toEqual(expect.arrayContaining([
      'agreement-register',
      'revenue-by-consultant',
      'settlement-outstanding',
      'unpaid-settlement-aging',
      'unmatched-invoice-lines',
      'ambiguous-agreements',
      'consultant-revenue-reconciliation',
      'settlement-reconciliation',
      'financial-ledger-reconciliation',
    ]));
  });

  it.each(CONSULTANT_SHARING_REPORT_NAMES)(
    'builds a facility-scoped source for %s',
    (report: ConsultantSharingReportName) => {
      const source = buildConsultantSharingReportSource(
        report,
        facilityId,
        { page: 1, pageSize: 50 },
        new Date('2026-07-23T00:00:00.000Z'),
      );
      expect(source.collection.length).toBeGreaterThan(0);
      expect(source.pipeline.length).toBeGreaterThan(0);
      expect(JSON.stringify(source.pipeline)).toContain('facilityId');
    },
  );

  it('prevents spreadsheet formula execution in CSV cells', () => {
    expect(consultantSharingCsvCell('=2+2')).toBe('"\'=2+2"');
    expect(consultantSharingCsvCell('+SUM(A1:A2)')).toBe('"\'+SUM(A1:A2)"');
    expect(consultantSharingCsvCell('Safe "value"')).toBe('"Safe ""value"""');
  });

  it('reconciles settlements and ledger entries using persisted schema fields', () => {
    const settlement = buildConsultantSharingReportSource(
      'settlement-reconciliation',
      facilityId,
      {},
      new Date('2026-07-23T00:00:00.000Z'),
    );
    const settlementPipeline = JSON.stringify(settlement.pipeline);
    expect(settlementPipeline).toContain('consultantShare');
    expect(settlementPipeline).not.toContain('consultantShareAmount');

    const ledger = buildConsultantSharingReportSource(
      'financial-ledger-reconciliation',
      facilityId,
      {},
      new Date('2026-07-23T00:00:00.000Z'),
    );
    expect(JSON.stringify(ledger.pipeline)).toContain('financialLedgerTransactions');
    expect(JSON.stringify(ledger.pipeline)).toContain('sourceEntityId');
  });
});