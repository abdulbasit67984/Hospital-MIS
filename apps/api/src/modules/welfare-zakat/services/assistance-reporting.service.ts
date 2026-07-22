import type { Db } from '@hospital-mis/database';
import {
  createObjectId,
  decimal128ToString,
  toObjectId,
} from '@hospital-mis/database';
import type { Document } from 'mongodb';

import type { BackgroundJobService } from '../../../infrastructure/background-job.service.js';
import { WELFARE_ZAKAT_PERMISSION_KEYS } from '../welfare-zakat.constants.js';
import type {
  WelfareZakatActorContext,
  WelfareZakatReportName,
  WelfareZakatReportPage,
  WelfareZakatReportQuery,
} from '../welfare-zakat.contracts.js';
import { AssistanceAccessDeniedError } from '../welfare-zakat.errors.js';
import { hashAssistanceSensitiveReference } from '../welfare-zakat.normalization.js';
import type {
  WelfareZakatAccessPolicyPort,
  WelfareZakatClockPort,
} from '../welfare-zakat.ports.js';

export const WELFARE_ZAKAT_REPORT_NAMES = [
  'fund-register',
  'fund-balances',
  'fund-transactions',
  'donations-inflows',
  'application-register',
  'application-status',
  'eligibility',
  'approvals',
  'allocations',
  'utilization',
  'remaining-balances',
  'reversals',
  'patient-assistance',
  'department-service-utilization',
  'donor-utilization',
  'restricted-funds',
  'expiring-approvals',
  'fund-reconciliation',
  'invoice-allocation-reconciliation',
] as const satisfies readonly WelfareZakatReportName[];

export interface WelfareZakatCsvExport {
  filename: string;
  contentType: 'text/csv';
  content: string;
}

function csvCell(value: unknown): string {
  const raw = String(value ?? '');
  const formulaSafe = /^[=+\-@]/u.test(raw) ? `'${raw}` : raw;
  return `"${formulaSafe.replaceAll('"', '""')}"`;
}

function objectId(value: unknown): string | null {
  if (
    typeof value === 'object' &&
    value !== null &&
    'toHexString' in value &&
    typeof value.toHexString === 'function'
  ) {
    return value.toHexString();
  }
  return typeof value === 'string' ? value : null;
}

function iso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : null;
}

function money(value: unknown): string {
  if (value == null) return '0.00';
  try {
    return decimal128ToString(value as never);
  } catch {
    return String(value);
  }
}

function integer(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.trunc(value)
    : 0;
}

function pageNumber(query: WelfareZakatReportQuery): number {
  return Math.max(1, query.page ?? 1);
}

function pageSize(query: WelfareZakatReportQuery): number {
  return Math.max(1, Math.min(query.pageSize ?? 50, 1_000));
}

function dateFilter(query: WelfareZakatReportQuery, field = 'createdAt'): Document {
  if (query.from == null && query.to == null) return {};
  return {
    [field]: {
      ...(query.from == null ? {} : { $gte: new Date(query.from) }),
      ...(query.to == null ? {} : { $lte: new Date(query.to) }),
    },
  };
}

function baseMatch(
  facilityId: string,
  query: WelfareZakatReportQuery,
  dateField = 'createdAt',
): Document {
  return {
    facilityId: toObjectId(facilityId, 'facilityId'),
    ...dateFilter(query, dateField),
  };
}

function facet(query: WelfareZakatReportQuery): Document[] {
  const size = pageSize(query);
  const skip = (pageNumber(query) - 1) * size;
  return [{
    $facet: {
      items: [{ $skip: skip }, { $limit: size }],
      total: [{ $count: 'value' }],
    },
  }];
}

function fundMatch(facilityId: string, query: WelfareZakatReportQuery): Document {
  return {
    ...baseMatch(facilityId, query),
    ...(query.fundId == null ? {} : { _id: toObjectId(query.fundId, 'fundId') }),
    ...(query.fundType == null || query.fundType.length === 0
      ? {}
      : { fundType: { $in: [...query.fundType] } }),
    ...(query.fundStatus == null || query.fundStatus.length === 0
      ? {}
      : { status: { $in: [...query.fundStatus] } }),
    ...(query.financialYearCode == null
      ? {}
      : { financialYearCode: query.financialYearCode }),
    ...(query.donorReference == null
      ? {}
      : { donorReferenceHash: hashAssistanceSensitiveReference(query.donorReference) }),
  };
}

function applicationMatch(facilityId: string, query: WelfareZakatReportQuery): Document {
  return {
    ...baseMatch(facilityId, query),
    ...(query.patientId == null
      ? {}
      : { patientId: toObjectId(query.patientId, 'patientId') }),
    ...(query.fundId == null
      ? {}
      : { preferredFundId: toObjectId(query.fundId, 'fundId') }),
    ...(query.applicationStatus == null || query.applicationStatus.length === 0
      ? {}
      : { status: { $in: [...query.applicationStatus] } }),
    ...(query.financialYearCode == null
      ? {}
      : { financialYearCode: query.financialYearCode }),
  };
}

function approvalMatch(facilityId: string, query: WelfareZakatReportQuery): Document {
  return {
    ...baseMatch(facilityId, query),
    ...(query.fundId == null
      ? {}
      : { fundId: toObjectId(query.fundId, 'fundId') }),
    ...(query.approvalStatus == null || query.approvalStatus.length === 0
      ? {}
      : { status: { $in: [...query.approvalStatus] } }),
  };
}

function allocationMatch(facilityId: string, query: WelfareZakatReportQuery): Document {
  return {
    ...baseMatch(facilityId, query, 'allocatedAt'),
    ...(query.fundId == null
      ? {}
      : { fundId: toObjectId(query.fundId, 'fundId') }),
    ...(query.patientId == null
      ? {}
      : { patientId: toObjectId(query.patientId, 'patientId') }),
    ...(query.allocationStatus == null || query.allocationStatus.length === 0
      ? {}
      : { status: { $in: [...query.allocationStatus] } }),
  };
}

function source(report: WelfareZakatReportName): string {
  switch (report) {
    case 'fund-register':
    case 'fund-balances':
    case 'restricted-funds':
    case 'fund-reconciliation':
      return 'assistanceFunds';
    case 'fund-transactions':
    case 'donations-inflows':
      return 'fundTransactions';
    case 'application-register':
    case 'application-status':
    case 'eligibility':
    case 'patient-assistance':
      return 'assistanceApplications';
    case 'approvals':
    case 'remaining-balances':
    case 'expiring-approvals':
      return 'assistanceApprovals';
    case 'reversals':
      return 'fundAllocationReversals';
    default:
      return 'invoiceFundAllocations';
  }
}

function pipeline(
  report: WelfareZakatReportName,
  facilityId: string,
  query: WelfareZakatReportQuery,
): Document[] {
  switch (report) {
    case 'fund-register':
    case 'fund-balances':
      return [{ $match: fundMatch(facilityId, query) }, { $sort: { fundCode: 1, _id: 1 } }, ...facet(query)];
    case 'restricted-funds':
      return [
        { $match: { ...fundMatch(facilityId, query), restriction: 'RESTRICTED' } },
        { $sort: { effectiveThrough: 1, fundCode: 1 } },
        ...facet(query),
      ];
    case 'fund-reconciliation':
      return [
        { $match: fundMatch(facilityId, query) },
        {
          $addFields: {
            expectedLedgerBalance: {
              $subtract: [
                {
                  $add: [
                    '$openingBalance', '$inflowAmount', '$transferInAmount',
                    '$adjustmentIncreaseAmount', '$reversedBalance',
                  ],
                },
                {
                  $add: [
                    '$transferOutAmount', '$adjustmentDecreaseAmount',
                    '$utilizedBalance', '$writeOffAmount',
                  ],
                },
              ],
            },
            expectedAvailableBalance: {
              $subtract: ['$ledgerBalance', { $add: ['$reservedBalance', '$committedBalance'] }],
            },
          },
        },
        { $sort: { fundCode: 1, _id: 1 } },
        ...facet(query),
      ];
    case 'fund-transactions':
    case 'donations-inflows': {
      const match: Document = {
        ...baseMatch(facilityId, query, 'occurredAt'),
        ...(query.fundId == null
          ? {}
          : { fundId: toObjectId(query.fundId, 'fundId') }),
        ...(report === 'donations-inflows'
          ? { transactionType: { $in: ['DONATION', 'GRANT', 'OTHER_INFLOW'] } }
          : {}),
        ...(query.donorReference == null
          ? {}
          : { donorReferenceHash: hashAssistanceSensitiveReference(query.donorReference) }),
      };
      return [
        { $match: match },
        { $lookup: { from: 'assistanceFunds', localField: 'fundId', foreignField: '_id', as: 'fund' } },
        { $unwind: { path: '$fund', preserveNullAndEmptyArrays: true } },
        { $sort: { occurredAt: -1, _id: -1 } },
        ...facet(query),
      ];
    }
    case 'application-register':
      return [{ $match: applicationMatch(facilityId, query) }, { $sort: { createdAt: -1, _id: -1 } }, ...facet(query)];
    case 'application-status':
      return [
        { $match: applicationMatch(facilityId, query) },
        { $group: { _id: { applicationType: '$applicationType', status: '$status' }, applicationCount: { $sum: 1 }, requestedAmount: { $sum: { $ifNull: ['$requestedAmount', 0] } }, approvedAmount: { $sum: '$approvedAmount' }, utilizedAmount: { $sum: '$utilizedAmount' } } },
        { $sort: { '_id.applicationType': 1, '_id.status': 1 } },
        ...facet(query),
      ];
    case 'eligibility':
      return [
        { $match: applicationMatch(facilityId, query) },
        { $group: { _id: { applicationType: '$applicationType', eligibilityOutcome: '$eligibilityOutcome' }, applicationCount: { $sum: 1 }, averagePerCapitaIncome: { $avg: '$perCapitaIncome' }, averageDisposableIncome: { $avg: '$monthlyDisposableIncome' } } },
        { $sort: { '_id.applicationType': 1, '_id.eligibilityOutcome': 1 } },
        ...facet(query),
      ];
    case 'patient-assistance':
      return [
        { $match: applicationMatch(facilityId, query) },
        { $group: { _id: '$patientId', applicationCount: { $sum: 1 }, requestedAmount: { $sum: { $ifNull: ['$requestedAmount', 0] } }, approvedAmount: { $sum: '$approvedAmount' }, reservedAmount: { $sum: '$reservedAmount' }, utilizedAmount: { $sum: '$utilizedAmount' }, reversedAmount: { $sum: '$reversedAmount' }, remainingApprovedAmount: { $sum: '$remainingApprovedAmount' } } },
        { $sort: { utilizedAmount: -1, _id: 1 } },
        ...facet(query),
      ];
    case 'approvals':
      return [
        { $match: approvalMatch(facilityId, query) },
        { $lookup: { from: 'assistanceFunds', localField: 'fundId', foreignField: '_id', as: 'fund' } },
        { $unwind: { path: '$fund', preserveNullAndEmptyArrays: true } },
        { $sort: { createdAt: -1, _id: -1 } },
        ...facet(query),
      ];
    case 'remaining-balances':
      return [
        { $match: approvalMatch(facilityId, query) },
        { $group: { _id: '$fundId', approvalCount: { $sum: 1 }, approvedAmount: { $sum: '$approvedAmount' }, reservedAmount: { $sum: '$reservedAmount' }, committedAmount: { $sum: '$committedAmount' }, utilizedAmount: { $sum: '$utilizedAmount' }, reversedAmount: { $sum: '$reversedAmount' }, releasedAmount: { $sum: '$releasedAmount' }, remainingAmount: { $sum: '$remainingAmount' } } },
        { $sort: { remainingAmount: -1, _id: 1 } },
        ...facet(query),
      ];
    case 'expiring-approvals':
      return [
        {
          $match: {
            ...approvalMatch(facilityId, query),
            status: { $in: ['PENDING', 'APPROVED', 'PARTIALLY_APPROVED'] },
            expiresAt: {
              $ne: null,
              $lte: query.to == null
                ? new Date(Date.now() + 30 * 86_400_000)
                : new Date(query.to),
            },
          },
        },
        { $sort: { expiresAt: 1, _id: 1 } },
        ...facet(query),
      ];
    case 'reversals':
      return [
        {
          $match: {
            ...baseMatch(facilityId, query, 'requestedAt'),
          },
        },
        { $lookup: { from: 'invoiceFundAllocations', localField: 'allocationId', foreignField: '_id', as: 'allocation' } },
        { $unwind: { path: '$allocation', preserveNullAndEmptyArrays: true } },
        ...(query.fundId == null
          ? []
          : [{ $match: { 'allocation.fundId': toObjectId(query.fundId, 'fundId') } }]),
        ...(query.patientId == null
          ? []
          : [{ $match: { 'allocation.patientId': toObjectId(query.patientId, 'patientId') } }]),
        { $sort: { requestedAt: -1, _id: -1 } },
        ...facet(query),
      ];
    case 'donor-utilization':
      return [
        { $match: allocationMatch(facilityId, query) },
        { $lookup: { from: 'assistanceFunds', localField: 'fundId', foreignField: '_id', as: 'fund' } },
        { $unwind: '$fund' },
        ...(query.donorReference == null
          ? []
          : [{ $match: { 'fund.donorReferenceHash': hashAssistanceSensitiveReference(query.donorReference) } }]),
        { $group: { _id: { fundId: '$fundId', donorReferenceMasked: '$fund.donorReferenceMasked', fundCode: '$fund.fundCode' }, allocationCount: { $sum: 1 }, allocatedAmount: { $sum: '$amount' }, utilizedAmount: { $sum: '$utilizedAmount' }, reversedAmount: { $sum: '$reversedAmount' }, refundedAmount: { $sum: '$refundedAmount' }, repaidAmount: { $sum: '$repaidAmount' }, recoveredAmount: { $sum: '$recoveredAmount' } } },
        { $sort: { utilizedAmount: -1, '_id.fundCode': 1 } },
        ...facet(query),
      ];
    case 'department-service-utilization':
      return [
        { $match: allocationMatch(facilityId, query) },
        { $unwind: '$lines' },
        { $lookup: { from: 'invoiceLines', localField: 'lines.invoiceLineId', foreignField: '_id', as: 'invoiceLine' } },
        { $unwind: { path: '$invoiceLine', preserveNullAndEmptyArrays: true } },
        ...(query.departmentId == null
          ? []
          : [{ $match: { 'invoiceLine.departmentId': toObjectId(query.departmentId, 'departmentId') } }]),
        ...(query.serviceCategory == null || query.serviceCategory.length === 0
          ? []
          : [{ $match: { 'invoiceLine.serviceCategory': { $in: [...query.serviceCategory] } } }]),
        { $group: { _id: { departmentId: '$invoiceLine.departmentId', serviceCategory: '$invoiceLine.serviceCategory', serviceCode: '$invoiceLine.serviceCode' }, allocationCount: { $sum: 1 }, allocatedAmount: { $sum: '$lines.amount' }, utilizedAmount: { $sum: '$lines.utilizedAmount' }, reversedAmount: { $sum: '$lines.reversedAmount' }, recoveredAmount: { $sum: '$lines.recoveredAmount' } } },
        { $sort: { utilizedAmount: -1, '_id.serviceCode': 1 } },
        ...facet(query),
      ];
    case 'invoice-allocation-reconciliation':
      return [
        { $match: allocationMatch(facilityId, query) },
        { $unwind: '$lines' },
        { $lookup: { from: 'invoiceLines', localField: 'lines.invoiceLineId', foreignField: '_id', as: 'invoiceLine' } },
        { $unwind: { path: '$invoiceLine', preserveNullAndEmptyArrays: true } },
        { $addFields: { authoritativeWelfareAmount: { $ifNull: ['$invoiceLine.welfareZakatAmount', { $ifNull: ['$invoiceLine.welfareAmount', 0] }] }, allocationLineNet: { $subtract: ['$lines.utilizedAmount', { $add: ['$lines.reversedAmount', '$lines.refundedAmount', '$lines.repaidAmount', '$lines.recoveredAmount'] }] } } },
        { $sort: { allocatedAt: -1, _id: -1 } },
        ...facet(query),
      ];
    case 'allocations':
    case 'utilization':
      return [
        { $match: allocationMatch(facilityId, query) },
        { $lookup: { from: 'assistanceFunds', localField: 'fundId', foreignField: '_id', as: 'fund' } },
        { $unwind: { path: '$fund', preserveNullAndEmptyArrays: true } },
        { $sort: { allocatedAt: -1, _id: -1 } },
        ...facet(query),
      ];
  }
}

function projection(report: WelfareZakatReportName, document: Document): Readonly<Record<string, unknown>> {
  const grouped = document['_id'] as Document | undefined;
  const fund = document['fund'] as Document | undefined;
  const allocation = document['allocation'] as Document | undefined;
  const invoiceLine = document['invoiceLine'] as Document | undefined;
  const allocationLine = document['lines'] as Document | undefined;

  switch (report) {
    case 'fund-register':
    case 'fund-balances':
    case 'restricted-funds':
      return {
        fundId: objectId(document['_id']),
        fundCode: document['fundCode'],
        fundName: document['name'],
        fundType: document['fundType'],
        categoryCode: document['categoryCode'],
        restriction: document['restriction'],
        status: document['status'],
        donorReferenceMasked: document['donorReferenceMasked'] ?? null,
        effectiveFrom: iso(document['effectiveFrom']),
        effectiveThrough: iso(document['effectiveThrough']),
        openingBalance: money(document['openingBalance']),
        inflowAmount: money(document['inflowAmount']),
        transferInAmount: money(document['transferInAmount']),
        transferOutAmount: money(document['transferOutAmount']),
        ledgerBalance: money(document['ledgerBalance']),
        reservedBalance: money(document['reservedBalance']),
        committedBalance: money(document['committedBalance']),
        availableBalance: money(document['availableBalance']),
        utilizedBalance: money(document['utilizedBalance']),
        reversedBalance: money(document['reversedBalance']),
        refundAmount: money(document['refundAmount']),
        repaymentAmount: money(document['repaymentAmount']),
        recoveryAmount: money(document['recoveryAmount']),
      };
    case 'fund-reconciliation':
      return {
        fundId: objectId(document['_id']),
        fundCode: document['fundCode'],
        status: document['status'],
        ledgerBalance: money(document['ledgerBalance']),
        expectedLedgerBalance: money(document['expectedLedgerBalance']),
        availableBalance: money(document['availableBalance']),
        expectedAvailableBalance: money(document['expectedAvailableBalance']),
        reconciled:
          money(document['ledgerBalance']) === money(document['expectedLedgerBalance']) &&
          money(document['availableBalance']) === money(document['expectedAvailableBalance']),
      };
    case 'fund-transactions':
    case 'donations-inflows':
      return {
        transactionId: objectId(document['_id']),
        transactionNumber: document['transactionNumber'],
        fundId: objectId(document['fundId']),
        fundCode: fund?.['fundCode'] ?? null,
        transactionType: document['transactionType'],
        direction: document['direction'],
        amount: money(document['amount']),
        balanceBefore: money(document['balanceBefore']),
        balanceAfter: money(document['balanceAfter']),
        donorReferenceMasked: document['donorReferenceMasked'] ?? null,
        receiptReferenceMasked: document['receiptReferenceMasked'] ?? null,
        occurredAt: iso(document['occurredAt']),
      };
    case 'application-register':
      return {
        applicationId: objectId(document['_id']),
        applicationNumber: document['applicationNumber'],
        applicationType: document['applicationType'],
        patientId: objectId(document['patientId']),
        preferredFundId: objectId(document['preferredFundId']),
        status: document['status'],
        completenessSatisfied: document['completenessSatisfied'] === true,
        eligibilityOutcome: document['eligibilityOutcome'] ?? null,
        requestedAmount: money(document['requestedAmount']),
        approvedAmount: money(document['approvedAmount']),
        utilizedAmount: money(document['utilizedAmount']),
        remainingApprovedAmount: money(document['remainingApprovedAmount']),
        submittedAt: iso(document['submittedAt']),
        expiresAt: iso(document['expiresAt']),
      };
    case 'application-status':
      return {
        applicationType: grouped?.['applicationType'] ?? null,
        status: grouped?.['status'] ?? null,
        applicationCount: integer(document['applicationCount']),
        requestedAmount: money(document['requestedAmount']),
        approvedAmount: money(document['approvedAmount']),
        utilizedAmount: money(document['utilizedAmount']),
      };
    case 'eligibility':
      return {
        applicationType: grouped?.['applicationType'] ?? null,
        eligibilityOutcome: grouped?.['eligibilityOutcome'] ?? null,
        applicationCount: integer(document['applicationCount']),
        averagePerCapitaIncome: money(document['averagePerCapitaIncome']),
        averageDisposableIncome: money(document['averageDisposableIncome']),
      };
    case 'patient-assistance':
      return {
        patientId: objectId(document['_id']),
        applicationCount: integer(document['applicationCount']),
        requestedAmount: money(document['requestedAmount']),
        approvedAmount: money(document['approvedAmount']),
        reservedAmount: money(document['reservedAmount']),
        utilizedAmount: money(document['utilizedAmount']),
        reversedAmount: money(document['reversedAmount']),
        remainingApprovedAmount: money(document['remainingApprovedAmount']),
      };
    case 'approvals':
      return {
        approvalId: objectId(document['_id']),
        approvalNumber: document['approvalNumber'],
        applicationId: objectId(document['applicationId']),
        fundId: objectId(document['fundId']),
        fundCode: fund?.['fundCode'] ?? null,
        status: document['status'],
        requestedAmount: money(document['requestedAmount']),
        approvedAmount: money(document['approvedAmount']),
        reservedAmount: money(document['reservedAmount']),
        utilizedAmount: money(document['utilizedAmount']),
        remainingAmount: money(document['remainingAmount']),
        approvedAt: iso(document['approvedAt']),
        expiresAt: iso(document['expiresAt']),
      };
    case 'remaining-balances':
      return {
        fundId: objectId(document['_id']),
        approvalCount: integer(document['approvalCount']),
        approvedAmount: money(document['approvedAmount']),
        reservedAmount: money(document['reservedAmount']),
        committedAmount: money(document['committedAmount']),
        utilizedAmount: money(document['utilizedAmount']),
        reversedAmount: money(document['reversedAmount']),
        releasedAmount: money(document['releasedAmount']),
        remainingAmount: money(document['remainingAmount']),
      };
    case 'expiring-approvals':
      return {
        approvalId: objectId(document['_id']),
        approvalNumber: document['approvalNumber'],
        applicationId: objectId(document['applicationId']),
        fundId: objectId(document['fundId']),
        status: document['status'],
        remainingAmount: money(document['remainingAmount']),
        expiresAt: iso(document['expiresAt']),
      };
    case 'reversals':
      return {
        reversalId: objectId(document['_id']),
        allocationId: objectId(document['allocationId']),
        allocationNumber: allocation?.['allocationNumber'] ?? null,
        fundId: objectId(allocation?.['fundId']),
        patientId: objectId(allocation?.['patientId']),
        invoiceLineId: objectId(document['invoiceLineId']),
        amount: money(document['amount']),
        status: document['status'],
        requestedAt: iso(document['requestedAt']),
        postedAt: iso(document['postedAt']),
      };
    case 'donor-utilization':
      return {
        fundId: objectId(grouped?.['fundId']),
        fundCode: grouped?.['fundCode'] ?? null,
        donorReferenceMasked: grouped?.['donorReferenceMasked'] ?? null,
        allocationCount: integer(document['allocationCount']),
        allocatedAmount: money(document['allocatedAmount']),
        utilizedAmount: money(document['utilizedAmount']),
        reversedAmount: money(document['reversedAmount']),
        refundedAmount: money(document['refundedAmount']),
        repaidAmount: money(document['repaidAmount']),
        recoveredAmount: money(document['recoveredAmount']),
      };
    case 'department-service-utilization':
      return {
        departmentId: objectId(grouped?.['departmentId']),
        serviceCategory: grouped?.['serviceCategory'] ?? null,
        serviceCode: grouped?.['serviceCode'] ?? null,
        allocationCount: integer(document['allocationCount']),
        allocatedAmount: money(document['allocatedAmount']),
        utilizedAmount: money(document['utilizedAmount']),
        reversedAmount: money(document['reversedAmount']),
        recoveredAmount: money(document['recoveredAmount']),
      };
    case 'invoice-allocation-reconciliation':
      return {
        allocationId: objectId(document['_id']),
        allocationNumber: document['allocationNumber'],
        invoiceId: objectId(document['invoiceId']),
        invoiceLineId: objectId(allocationLine?.['invoiceLineId']),
        serviceCode: invoiceLine?.['serviceCode'] ?? null,
        allocationLineNet: money(document['allocationLineNet']),
        authoritativeWelfareAmount: money(document['authoritativeWelfareAmount']),
        reconciled: money(document['allocationLineNet']) === money(document['authoritativeWelfareAmount']),
      };
    case 'allocations':
    case 'utilization':
      return {
        allocationId: objectId(document['_id']),
        allocationNumber: document['allocationNumber'],
        fundId: objectId(document['fundId']),
        fundCode: fund?.['fundCode'] ?? null,
        patientId: objectId(document['patientId']),
        applicationId: objectId(document['applicationId']),
        approvalId: objectId(document['approvalId']),
        invoiceId: objectId(document['invoiceId']),
        claimId: objectId(document['claimId']),
        status: document['status'],
        amount: money(document['amount']),
        utilizedAmount: money(document['utilizedAmount']),
        reversedAmount: money(document['reversedAmount']),
        refundedAmount: money(document['refundedAmount']),
        repaidAmount: money(document['repaidAmount']),
        recoveredAmount: money(document['recoveredAmount']),
        remainingAmount: money(document['remainingAmount']),
        allocatedAt: iso(document['allocatedAt']),
        utilizedAt: iso(document['utilizedAt']),
      };
  }
}

export class AssistanceReportingService {
  public constructor(
    private readonly dependencies: Readonly<{
      database: Db;
      accessPolicy: WelfareZakatAccessPolicyPort;
      jobs: BackgroundJobService;
      clock: WelfareZakatClockPort;
    }>,
  ) {}

  public async run(
    actor: WelfareZakatActorContext,
    report: WelfareZakatReportName,
    query: WelfareZakatReportQuery,
  ): Promise<WelfareZakatReportPage> {
    await this.require(actor, WELFARE_ZAKAT_PERMISSION_KEYS.REPORT_READ);
    const [result] = await this.dependencies.database
      .collection<Document>(source(report))
      .aggregate<Document>(pipeline(report, actor.facilityId, query), {
        allowDiskUse: true,
      })
      .toArray();
    const items = Array.isArray(result?.['items'])
      ? result['items'] as Document[]
      : [];
    const totals = Array.isArray(result?.['total'])
      ? result['total'] as Document[]
      : [];
    return {
      report,
      items: items.map((item) => projection(report, item)),
      page: pageNumber(query),
      pageSize: pageSize(query),
      total: integer(totals[0]?.['value']),
      generatedAt: this.dependencies.clock.now().toISOString(),
    };
  }

  public async exportCsv(
    actor: WelfareZakatActorContext,
    report: WelfareZakatReportName,
    query: WelfareZakatReportQuery,
  ): Promise<WelfareZakatCsvExport> {
    await this.require(actor, WELFARE_ZAKAT_PERMISSION_KEYS.REPORT_EXPORT);
    const items: Readonly<Record<string, unknown>>[] = [];
    let page = 1;
    let total = 0;
    do {
      const result = await this.run(actor, report, { ...query, page, pageSize: 1_000 });
      total = result.total;
      items.push(...result.items);
      page += 1;
    } while (items.length < total && items.length < 100_000);

    const headers = [...new Set(items.flatMap((item) => Object.keys(item)))];
    const lines = [
      headers.map(csvCell).join(','),
      ...items.map((item) => headers.map((header) => csvCell(item[header])).join(',')),
    ];
    await this.recordExport(actor, report, query, items.length);
    return {
      filename: `welfare-zakat-${report}-${this.dependencies.clock.now().toISOString().slice(0, 10)}.csv`,
      contentType: 'text/csv',
      content: `${lines.join('\n')}\n`,
    };
  }

  public async queueCsvExport(
    actor: WelfareZakatActorContext,
    idempotencyKey: string,
    report: WelfareZakatReportName,
    query: WelfareZakatReportQuery,
  ): Promise<Readonly<{ jobId: string; status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' }>> {
    await this.require(actor, WELFARE_ZAKAT_PERMISSION_KEYS.REPORT_EXPORT);
    const existing = await this.dependencies.database.collection('backgroundJobs').findOne({
      facilityId: toObjectId(actor.facilityId, 'facilityId'),
      jobType: 'WELFARE_ZAKAT_REPORT_EXPORT',
      status: { $in: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] },
      'payload.idempotencyKey': idempotencyKey,
    });
    if (typeof existing?.['jobId'] === 'string') {
      return {
        jobId: existing['jobId'],
        status: existing['status'] as 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
      };
    }
    const jobId = await this.dependencies.jobs.enqueue({
      facilityId: actor.facilityId,
      jobType: 'WELFARE_ZAKAT_REPORT_EXPORT',
      payload: {
        actorUserId: actor.userId,
        correlationId: actor.correlationId,
        idempotencyKey,
        report,
        query,
      },
      maxAttempts: 5,
    });
    return { jobId, status: 'PENDING' };
  }

  public async generateQueuedExport(payload: Readonly<{
    facilityId: string;
    actorUserId: string;
    correlationId: string;
    report: WelfareZakatReportName;
    query: WelfareZakatReportQuery;
  }>): Promise<void> {
    const actor: WelfareZakatActorContext = {
      userId: payload.actorUserId,
      staffId: null,
      facilityId: payload.facilityId,
      correlationId: payload.correlationId,
      permissionKeys: new Set([
        WELFARE_ZAKAT_PERMISSION_KEYS.REPORT_READ,
        WELFARE_ZAKAT_PERMISSION_KEYS.REPORT_EXPORT,
      ]),
      roleKeys: ['BACKGROUND_JOB'],
    };
    const exported = await this.exportCsv(actor, payload.report, payload.query);
    const now = this.dependencies.clock.now();
    await this.dependencies.database.collection('reportArtifacts').insertOne({
      _id: createObjectId(),
      facilityId: toObjectId(payload.facilityId, 'facilityId'),
      reportType: `WELFARE_ZAKAT_${payload.report.toUpperCase().replaceAll('-', '_')}`,
      filename: exported.filename,
      contentType: exported.contentType,
      content: exported.content,
      generatedBy: toObjectId(payload.actorUserId, 'generatedBy'),
      generatedAt: now,
      purgeAt: new Date(now.getTime() + 7 * 86_400_000),
      schemaVersion: 1,
      version: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  private async recordExport(
    actor: WelfareZakatActorContext,
    report: WelfareZakatReportName,
    query: WelfareZakatReportQuery,
    rowCount: number,
  ): Promise<void> {
    const now = this.dependencies.clock.now();
    await this.dependencies.database.collection('auditLogs').insertOne({
      _id: createObjectId(),
      facilityId: toObjectId(actor.facilityId, 'facilityId'),
      eventId: `welfare-zakat-report:${actor.correlationId}:${report}`,
      actorId: toObjectId(actor.userId, 'actorUserId'),
      action: 'EXPORT_WELFARE_ZAKAT_REPORT',
      module: 'WELFARE_ZAKAT',
      entityType: 'REPORT',
      entityId: report,
      metadata: { filters: query, rowCount },
      outcome: 'SUCCESS',
      sensitivity: 'SENSITIVE',
      correlationId: actor.correlationId,
      transactionId: `report:${actor.correlationId}`,
      requestSource: 'API',
      occurredAt: now,
      schemaVersion: 1,
      version: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  private async require(actor: WelfareZakatActorContext, permission: string): Promise<void> {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      permission,
      resourceFacilityId: actor.facilityId,
      sensitiveFinancialAction: false,
    });
    if (!decision.allowed) {
      throw new AssistanceAccessDeniedError(decision.denialReason ?? undefined);
    }
  }
}