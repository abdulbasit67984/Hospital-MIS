import type { Db } from '@hospital-mis/database';
import {
  createObjectId,
  decimal128ToString,
  toObjectId,
} from '@hospital-mis/database';
import type { Document } from 'mongodb';

import type { BackgroundJobService } from '../../../infrastructure/background-job.service.js';
import {
  CONSULTANT_SHARING_PERMISSION_KEYS,
  CONSULTANT_SHARING_MAX_PAGE_SIZE,
} from '../consultant-sharing.constants.js';
import type { ConsultantSharingActorContext } from '../consultant-sharing.contracts.js';
import { ConsultantSharingAccessDeniedError } from '../consultant-sharing.errors.js';
import type {
  ConsultantAuditPort,
  ConsultantClockPort,
  ConsultantSharingAccessPolicyPort,
} from '../consultant-sharing.ports.js';
import {
  CONSULTANT_SHARING_REPORT_NAMES,
  type ConsultantSharingCsvExport,
  type ConsultantSharingReportName,
  type ConsultantSharingReportPage,
  type ConsultantSharingReportQuery,
} from '../consultant-sharing.reporting.contracts.js';

const DAY_MS = 86_400_000;

function objectIdString(value: unknown): string | null {
  if (
    typeof value === 'object'
    && value !== null
    && 'toHexString' in value
    && typeof value.toHexString === 'function'
  ) {
    return value.toHexString();
  }
  return typeof value === 'string' ? value : null;
}

function projectValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(projectValue);
  if (typeof value === 'object' && value !== null) {
    if ('_bsontype' in value && value._bsontype === 'Decimal128') {
      return decimal128ToString(value as never);
    }
    const objectId = objectIdString(value);
    if (objectId !== null) return objectId;
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, projectValue(nested)]),
    );
  }
  return value;
}

function projectDocument(document: Document): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(document).map(([key, value]) => [
      key === '_id' ? 'id' : key,
      projectValue(value),
    ]),
  );
}

export function consultantSharingCsvCell(value: unknown): string {
  const raw = typeof value === 'object' && value !== null
    ? JSON.stringify(value)
    : String(value ?? '');
  const formulaSafe = /^[=+\-@]/u.test(raw) ? `'${raw}` : raw;
  return `"${formulaSafe.replaceAll('"', '""')}"`;
}

function pageNumber(query: ConsultantSharingReportQuery): number {
  return Math.max(1, query.page ?? 1);
}

function pageSize(query: ConsultantSharingReportQuery): number {
  return Math.max(
    1,
    Math.min(query.pageSize ?? 50, CONSULTANT_SHARING_MAX_PAGE_SIZE),
  );
}

function dateMatch(
  query: ConsultantSharingReportQuery,
  field: string,
): Document {
  if (query.from === undefined && query.to === undefined) return {};
  return {
    [field]: {
      ...(query.from === undefined ? {} : { $gte: new Date(query.from) }),
      ...(query.to === undefined ? {} : { $lte: new Date(query.to) }),
    },
  };
}

function revenueIdentifierFilters(query: ConsultantSharingReportQuery): Document {
  return {
    ...(query.consultantId === undefined
      ? {}
      : { consultantId: toObjectId(query.consultantId, 'consultantId') }),
    ...(query.departmentId === undefined
      ? {}
      : { departmentId: toObjectId(query.departmentId, 'departmentId') }),
    ...(query.serviceId === undefined
      ? {}
      : { serviceId: toObjectId(query.serviceId, 'serviceId') }),
    ...(query.agreementId === undefined
      ? {}
      : { agreementId: toObjectId(query.agreementId, 'agreementId') }),
    ...(query.settlementId === undefined
      ? {}
      : { settlementId: toObjectId(query.settlementId, 'settlementId') }),
    ...(query.payerOrganizationId === undefined
      ? {}
      : { payerOrganizationId: toObjectId(query.payerOrganizationId, 'payerOrganizationId') }),
    ...(query.panelProgramId === undefined
      ? {}
      : { panelProgramId: toObjectId(query.panelProgramId, 'panelProgramId') }),
    ...(query.packageId === undefined
      ? {}
      : { packageId: toObjectId(query.packageId, 'packageId') }),
    ...(query.claimId === undefined
      ? {}
      : { claimId: toObjectId(query.claimId, 'claimId') }),
    ...(query.status === undefined || query.status.length === 0
      ? {}
      : { status: { $in: [...query.status] } }),
  };
}

function agreementIdentifierFilters(query: ConsultantSharingReportQuery): Document {
  return {
    ...(query.consultantId === undefined
      ? {}
      : { consultantId: toObjectId(query.consultantId, 'consultantId') }),
    ...(query.departmentId === undefined
      ? {}
      : { departmentIds: toObjectId(query.departmentId, 'departmentId') }),
    ...(query.serviceId === undefined
      ? {}
      : { serviceIds: toObjectId(query.serviceId, 'serviceId') }),
    ...(query.agreementId === undefined
      ? {}
      : { _id: toObjectId(query.agreementId, 'agreementId') }),
    ...(query.status === undefined || query.status.length === 0
      ? {}
      : { status: { $in: [...query.status] } }),
  };
}

function ruleIdentifierFilters(query: ConsultantSharingReportQuery): Document {
  return {
    ...(query.consultantId === undefined
      ? {}
      : { consultantId: toObjectId(query.consultantId, 'consultantId') }),
    ...(query.departmentId === undefined
      ? {}
      : { departmentId: toObjectId(query.departmentId, 'departmentId') }),
    ...(query.serviceId === undefined
      ? {}
      : { serviceId: toObjectId(query.serviceId, 'serviceId') }),
    ...(query.agreementId === undefined
      ? {}
      : { agreementId: toObjectId(query.agreementId, 'agreementId') }),
    ...(query.payerOrganizationId === undefined
      ? {}
      : { payerOrganizationId: toObjectId(query.payerOrganizationId, 'payerOrganizationId') }),
    ...(query.panelProgramId === undefined
      ? {}
      : { panelProgramId: toObjectId(query.panelProgramId, 'panelProgramId') }),
    ...(query.packageId === undefined
      ? {}
      : { packageId: toObjectId(query.packageId, 'packageId') }),
    ...(query.status === undefined || query.status.length === 0
      ? {}
      : { status: { $in: [...query.status] } }),
  };
}

function settlementIdentifierFilters(query: ConsultantSharingReportQuery): Document {
  return {
    ...(query.consultantId === undefined
      ? {}
      : { consultantId: toObjectId(query.consultantId, 'consultantId') }),
    ...(query.settlementId === undefined
      ? {}
      : { _id: toObjectId(query.settlementId, 'settlementId') }),
    ...(query.status === undefined || query.status.length === 0
      ? {}
      : { status: { $in: [...query.status] } }),
  };
}

function paymentIdentifierFilters(query: ConsultantSharingReportQuery): Document {
  return {
    ...(query.consultantId === undefined
      ? {}
      : { consultantId: toObjectId(query.consultantId, 'consultantId') }),
    ...(query.settlementId === undefined
      ? {}
      : { settlementId: toObjectId(query.settlementId, 'settlementId') }),
    ...(query.status === undefined || query.status.length === 0
      ? {}
      : { status: { $in: [...query.status] } }),
  };
}

function disputeIdentifierFilters(query: ConsultantSharingReportQuery): Document {
  return {
    ...(query.consultantId === undefined
      ? {}
      : { consultantId: toObjectId(query.consultantId, 'consultantId') }),
    ...(query.agreementId === undefined
      ? {}
      : { agreementId: toObjectId(query.agreementId, 'agreementId') }),
    ...(query.settlementId === undefined
      ? {}
      : { settlementId: toObjectId(query.settlementId, 'settlementId') }),
    ...(query.status === undefined || query.status.length === 0
      ? {}
      : { status: { $in: [...query.status] } }),
  };
}

function facet(query: ConsultantSharingReportQuery): Document[] {
  const size = pageSize(query);
  return [{
    $facet: {
      items: [
        { $skip: (pageNumber(query) - 1) * size },
        { $limit: size },
      ],
      total: [{ $count: 'value' }],
    },
  }];
}

function reportSort(
  query: ConsultantSharingReportQuery,
  allowedFields: readonly string[],
  fallback: Readonly<Record<string, 1 | -1>>,
): Document {
  const requested = query.sortBy;
  if (requested !== undefined && allowedFields.includes(requested)) {
    const direction: 1 | -1 = query.sortDirection === 'asc' ? 1 : -1;
    return { $sort: { [requested]: direction, _id: direction } };
  }
  return { $sort: fallback };
}

function signedRevenueAmount(field: string): Document {
  return {
    $cond: [
      { $eq: ['$direction', 'DEBIT'] },
      { $multiply: [`$${field}`, -1] },
      `$${field}`,
    ],
  };
}

function revenueGroup(
  field: string,
  query: ConsultantSharingReportQuery,
): Document[] {
  return [
    {
      $group: {
        _id: `$${field}`,
        entryCount: { $sum: 1 },
        grossRevenue: {
          $sum: {
            $cond: [
              { $eq: ['$direction', 'CREDIT'] },
              '$grossAmount',
              0,
            ],
          },
        },
        discounts: { $sum: '$discountAmount' },
        welfareZakat: { $sum: '$welfareZakatAmount' },
        refunds: { $sum: '$refundAmount' },
        creditNotes: { $sum: '$creditNoteAmount' },
        debitNotes: { $sum: '$debitNoteAmount' },
        eligibleRevenue: { $sum: signedRevenueAmount('eligibleRevenue') },
        consultantShare: { $sum: signedRevenueAmount('consultantShare') },
        hospitalShare: { $sum: signedRevenueAmount('hospitalShare') },
        netPayable: { $sum: signedRevenueAmount('netPayableAmount') },
        settledAmount: { $sum: signedRevenueAmount('settledAmount') },
        outstandingAmount: { $sum: signedRevenueAmount('outstandingAmount') },
      },
    },
    reportSort(query, ['consultantShare', 'eligibleRevenue'], { consultantShare: -1, _id: 1 }),
  ];
}

export function buildConsultantSharingReportSource(
  report: ConsultantSharingReportName,
  facilityId: string,
  query: ConsultantSharingReportQuery,
  now: Date,
): Readonly<{ collection: string; pipeline: readonly Document[] }> {
  const facility = toObjectId(facilityId, 'facilityId');
  const revenueIds = revenueIdentifierFilters(query);
  const agreementIds = agreementIdentifierFilters(query);
  const ruleIds = ruleIdentifierFilters(query);
  const settlementIds = settlementIdentifierFilters(query);
  const paymentIds = paymentIdentifierFilters(query);
  const disputeIds = disputeIdentifierFilters(query);
  const revenueMatch = {
    facilityId: facility,
    ...revenueIds,
    ...dateMatch(query, 'occurredAt'),
  };
  const settlementMatch = {
    facilityId: facility,
    ...settlementIds,
    ...dateMatch(query, 'periodThrough'),
  };

  const revenueDimension: Partial<Record<ConsultantSharingReportName, string>> = {
    'revenue-by-consultant': 'consultantId',
    'revenue-by-department': 'departmentId',
    'revenue-by-service': 'serviceId',
    'revenue-by-procedure': 'procedureId',
    'revenue-by-payer': 'payerOrganizationId',
    'revenue-by-package': 'packageId',
    'revenue-by-claim': 'claimId',
  };
  const dimension = revenueDimension[report];
  if (dimension !== undefined) {
    return {
      collection: 'consultantRevenueEntries',
      pipeline: [
        { $match: revenueMatch },
        ...revenueGroup(dimension, query),
        ...facet(query),
      ],
    };
  }

  switch (report) {
    case 'agreement-register':
      return {
        collection: 'consultantAgreements',
        pipeline: [
          {
            $match: {
              facilityId: facility,
              ...agreementIds,
              ...dateMatch(query, 'effectiveFrom'),
            },
          },
          reportSort(
            query,
            ['agreementNumber', 'agreementName', 'effectiveFrom', 'effectiveThrough', 'createdAt', 'updatedAt'],
            { effectiveFrom: -1, agreementNumber: 1 },
          ),
          ...facet(query),
        ],
      };
    case 'active-expiring-agreements': {
      const through = new Date(
        now.getTime() + (query.expiringWithinDays ?? 30) * DAY_MS,
      );
      return {
        collection: 'consultantAgreements',
        pipeline: [
          {
            $match: {
              facilityId: facility,
              ...agreementIds,
              status: { $in: ['ACTIVE', 'SUSPENDED', 'APPROVED'] },
              effectiveFrom: { $lte: now },
              $or: [
                { effectiveThrough: null },
                { effectiveThrough: { $gte: now } },
              ],
            },
          },
          {
            $addFields: {
              isExpiring: {
                $and: [
                  { $ne: ['$effectiveThrough', null] },
                  { $lte: ['$effectiveThrough', through] },
                ],
              },
              daysToExpiry: {
                $cond: [
                  { $eq: ['$effectiveThrough', null] },
                  null,
                  {
                    $dateDiff: {
                      startDate: now,
                      endDate: '$effectiveThrough',
                      unit: 'day',
                    },
                  },
                ],
              },
            },
          },
          reportSort(
            query,
            ['agreementNumber', 'agreementName', 'effectiveFrom', 'effectiveThrough', 'createdAt', 'updatedAt'],
            { isExpiring: -1, effectiveThrough: 1, consultantId: 1 },
          ),
          ...facet(query),
        ],
      };
    }
    case 'agreement-amendment-history':
      return {
        collection: 'consultantAgreementHistories',
        pipeline: [
          {
            $match: {
              facilityId: facility,
              ...dateMatch(query, 'occurredAt'),
              historyType: {
                $in: ['AMENDED', 'SUPERSEDED', 'RULE_VERSION_CREATED'],
              },
              ...(query.agreementId === undefined
                ? {}
                : { agreementId: toObjectId(query.agreementId, 'agreementId') }),
            },
          },
          reportSort(query, ['createdAt', 'updatedAt'], { occurredAt: -1, _id: -1 }),
          ...facet(query),
        ],
      };
    case 'revenue-summary':
      return {
        collection: 'consultantRevenueEntries',
        pipeline: [
          { $match: revenueMatch },
          ...revenueGroup('entryType', query),
          ...facet(query),
        ],
      };
    case 'pending-accrued-collected-revenue':
      return {
        collection: 'consultantRevenueEntries',
        pipeline: [
          {
            $match: {
              ...revenueMatch,
              entryType: { $in: ['PENDING', 'ACCRUED', 'COLLECTED'] },
            },
          },
          ...revenueGroup('entryType', query),
          ...facet(query),
        ],
      };
    case 'reversed-adjusted-revenue':
      return {
        collection: 'consultantRevenueEntries',
        pipeline: [
          {
            $match: {
              ...revenueMatch,
              entryType: { $in: ['ADJUSTMENT', 'REVERSAL', 'REFUND', 'WRITE_OFF'] },
            },
          },
          reportSort(
            query,
            ['consultantShare', 'eligibleRevenue', 'createdAt', 'updatedAt'],
            { occurredAt: -1, _id: -1 },
          ),
          ...facet(query),
        ],
      };
    case 'consultant-liabilities':
      return {
        collection: 'consultantRevenueEntries',
        pipeline: [
          {
            $match: {
              ...revenueMatch,
              status: { $in: ['POSTED', 'HELD', 'DISPUTED', 'ADJUSTED'] },
            },
          },
          ...revenueGroup('consultantId', query),
          ...facet(query),
        ],
      };
    case 'settlement-register':
      return {
        collection: 'consultantSettlements',
        pipeline: [
          { $match: settlementMatch },
          reportSort(
            query,
            ['settlementNumber', 'periodFrom', 'periodThrough', 'consultantShare', 'createdAt', 'updatedAt'],
            { periodThrough: -1, settlementNumber: 1 },
          ),
          ...facet(query),
        ],
      };
    case 'settlement-status':
      return {
        collection: 'consultantSettlements',
        pipeline: [
          { $match: settlementMatch },
          {
            $group: {
              _id: '$status',
              settlementCount: { $sum: 1 },
              netPayableAmount: { $sum: '$netPayableAmount' },
              paidAmount: { $sum: '$paidAmount' },
              outstandingAmount: { $sum: '$outstandingAmount' },
            },
          },
          { $sort: { _id: 1 } },
          ...facet(query),
        ],
      };
    case 'settlement-outstanding':
      return {
        collection: 'consultantSettlements',
        pipeline: [
          {
            $match: {
              ...settlementMatch,
              outstandingAmount: { $gt: 0 },
              status: { $nin: ['CANCELLED', 'REVERSED', 'CLOSED'] },
            },
          },
          reportSort(
            query,
            ['settlementNumber', 'periodFrom', 'periodThrough', 'consultantShare', 'createdAt', 'updatedAt'],
            { periodThrough: 1, consultantId: 1 },
          ),
          ...facet(query),
        ],
      };
    case 'unpaid-settlement-aging':
      return {
        collection: 'consultantSettlements',
        pipeline: [
          {
            $match: {
              ...settlementMatch,
              outstandingAmount: { $gt: 0 },
              status: { $in: ['APPROVED', 'PARTIALLY_PAID', 'PAID', 'DISPUTED'] },
            },
          },
          {
            $addFields: {
              ageDays: {
                $dateDiff: {
                  startDate: '$periodThrough',
                  endDate: now,
                  unit: 'day',
                },
              },
            },
          },
          {
            $addFields: {
              agingBucket: {
                $switch: {
                  branches: [
                    { case: { $lte: ['$ageDays', 30] }, then: '0-30' },
                    { case: { $lte: ['$ageDays', 60] }, then: '31-60' },
                    { case: { $lte: ['$ageDays', 90] }, then: '61-90' },
                  ],
                  default: '90+',
                },
              },
            },
          },
          ...(query.agingBucket === undefined || query.agingBucket.length === 0
            ? []
            : [{ $match: { agingBucket: { $in: [...query.agingBucket] } } }]),
          {
            $group: {
              _id: { consultantId: '$consultantId', agingBucket: '$agingBucket' },
              settlementCount: { $sum: 1 },
              outstandingAmount: { $sum: '$outstandingAmount' },
              oldestPeriodThrough: { $min: '$periodThrough' },
            },
          },
          { $sort: { '_id.consultantId': 1, '_id.agingBucket': 1 } },
          ...facet(query),
        ],
      };
    case 'consultant-payments':
      return {
        collection: 'consultantSettlementPayments',
        pipeline: [
          {
            $match: {
              facilityId: facility,
              ...paymentIds,
              ...dateMatch(query, 'requestedAt'),
            },
          },
          reportSort(query, ['createdAt', 'updatedAt'], { requestedAt: -1, _id: -1 }),
          ...facet(query),
        ],
      };
    case 'tax-withholding':
      return {
        collection: 'consultantSettlementPayments',
        pipeline: [
          {
            $match: {
              facilityId: facility,
              ...paymentIds,
              ...dateMatch(query, 'requestedAt'),
              status: 'PAID',
              reversedByPaymentId: null,
            },
          },
          {
            $group: {
              _id: '$consultantId',
              paymentCount: { $sum: 1 },
              grossAmount: { $sum: '$amount' },
              taxWithholdingAmount: { $sum: '$taxWithholdingAmount' },
              netDisbursedAmount: { $sum: '$netDisbursedAmount' },
            },
          },
          { $sort: { taxWithholdingAmount: -1 } },
          ...facet(query),
        ],
      };
    case 'deductions':
      return {
        collection: 'consultantSettlementPayments',
        pipeline: [
          {
            $match: {
              facilityId: facility,
              ...paymentIds,
              ...dateMatch(query, 'requestedAt'),
              status: 'PAID',
              reversedByPaymentId: null,
            },
          },
          {
            $group: {
              _id: '$consultantId',
              paymentCount: { $sum: 1 },
              advanceRecoveryAmount: { $sum: '$advanceRecoveryAmount' },
              overpaymentRecoveryAmount: { $sum: '$overpaymentRecoveryAmount' },
              otherDeductionAmount: { $sum: '$otherDeductionAmount' },
            },
          },
          { $sort: { otherDeductionAmount: -1 } },
          ...facet(query),
        ],
      };
    case 'disputes':
      return {
        collection: 'consultantDisputes',
        pipeline: [
          {
            $match: {
              facilityId: facility,
              ...disputeIds,
              ...dateMatch(query, 'createdAt'),
            },
          },
          reportSort(query, ['createdAt', 'updatedAt'], { createdAt: -1, _id: -1 }),
          ...facet(query),
        ],
      };
    case 'refund-and-reversal':
      return {
        collection: 'consultantRevenueEntries',
        pipeline: [
          {
            $match: {
              ...revenueMatch,
              entryType: { $in: ['REFUND', 'REVERSAL', 'WRITE_OFF'] },
            },
          },
          reportSort(
            query,
            ['consultantShare', 'eligibleRevenue', 'createdAt', 'updatedAt'],
            { occurredAt: -1, _id: -1 },
          ),
          ...facet(query),
        ],
      };
    case 'agreement-rule-utilization':
      return {
        collection: 'consultantRevenueEntries',
        pipeline: [
          { $match: revenueMatch },
          {
            $group: {
              _id: {
                agreementId: '$agreementId',
                agreementRuleId: '$agreementRuleId',
                agreementVersion: '$agreementVersion',
                ruleVersion: '$ruleVersion',
              },
              entryCount: { $sum: 1 },
              eligibleRevenue: { $sum: '$eligibleRevenue' },
              consultantShare: { $sum: '$consultantShare' },
              hospitalShare: { $sum: '$hospitalShare' },
              firstUsedAt: { $min: '$occurredAt' },
              lastUsedAt: { $max: '$occurredAt' },
            },
          },
          { $sort: { entryCount: -1 } },
          ...facet(query),
        ],
      };
    case 'unmatched-invoice-lines':
      return {
        collection: 'invoiceLines',
        pipeline: [
          {
            $match: {
              facilityId: facility,
              ...dateMatch(query, 'createdAt'),
              ...(query.departmentId === undefined
                ? {}
                : { departmentId: toObjectId(query.departmentId, 'departmentId') }),
              ...(query.payerOrganizationId === undefined
                ? {}
                : {
                    payerOrganizationId: toObjectId(
                      query.payerOrganizationId,
                      'payerOrganizationId',
                    ),
                  }),
              ...(query.packageId === undefined
                ? {}
                : { packageEnrollmentId: toObjectId(query.packageId, 'packageId') }),
            },
          },
          {
            $lookup: {
              from: 'invoices',
              let: { invoiceId: '$invoiceId', facilityId: '$facilityId' },
              pipeline: [{
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$_id', '$$invoiceId'] },
                      { $eq: ['$facilityId', '$$facilityId'] },
                      { $in: ['$status', ['FINALIZED', 'PARTIALLY_PAID', 'PAID']] },
                    ],
                  },
                },
              }],
              as: '__finalizedInvoice',
            },
          },
          { $match: { '__finalizedInvoice.0': { $exists: true } } },
          {
            $lookup: {
              from: 'consultantAgreementRules',
              let: {
                facilityId: '$facilityId',
                chargeCatalogItemId: '$chargeCatalogItemId',
                departmentId: '$departmentId',
                occurredAt: '$createdAt',
              },
              pipeline: [{
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$facilityId', '$$facilityId'] },
                      { $eq: ['$status', 'ACTIVE'] },
                      { $lte: ['$effectiveFrom', '$$occurredAt'] },
                      {
                        $or: [
                          { $eq: ['$effectiveThrough', null] },
                          { $gte: ['$effectiveThrough', '$$occurredAt'] },
                        ],
                      },
                      {
                        $or: [
                          { $eq: ['$chargeCatalogItemId', null] },
                          { $eq: ['$chargeCatalogItemId', '$$chargeCatalogItemId'] },
                        ],
                      },
                      {
                        $or: [
                          { $eq: ['$departmentId', null] },
                          { $eq: ['$departmentId', '$$departmentId'] },
                        ],
                      },
                    ],
                  },
                },
              }],
              as: '__eligibleRules',
            },
          },
          { $match: { '__eligibleRules.0': { $exists: true } } },
          {
            $lookup: {
              from: 'consultantRevenueEntries',
              let: { lineId: '$_id', facilityId: '$facilityId' },
              pipeline: [{
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$invoiceLineId', '$$lineId'] },
                      { $eq: ['$facilityId', '$$facilityId'] },
                      { $ne: ['$status', 'CANCELLED'] },
                    ],
                  },
                },
              }],
              as: '__consultantEntries',
            },
          },
          { $match: { '__consultantEntries.0': { $exists: false } } },
          { $unset: ['__finalizedInvoice', '__eligibleRules', '__consultantEntries'] },
          reportSort(query, ['createdAt', 'updatedAt'], { createdAt: -1 }),
          ...facet(query),
        ],
      };
    case 'ambiguous-agreements':
      return {
        collection: 'consultantAgreementRules',
        pipeline: [
          {
            $match: {
              facilityId: facility,
              ...ruleIds,
              status: 'ACTIVE',
              effectiveFrom: { $lte: now },
              $or: [{ effectiveThrough: null }, { effectiveThrough: { $gte: now } }],
            },
          },
          {
            $group: {
              _id: {
                consultantId: '$consultantId',
                departmentId: '$departmentId',
                serviceId: '$serviceId',
                serviceCategory: '$serviceCategory',
                chargeCatalogItemId: '$chargeCatalogItemId',
                procedureId: '$procedureId',
                payerOrganizationId: '$payerOrganizationId',
                panelProgramId: '$panelProgramId',
                packageId: '$packageId',
                priority: '$priority',
              },
              count: { $sum: 1 },
              ruleIds: { $push: '$_id' },
              agreementIds: { $addToSet: '$agreementId' },
            },
          },
          { $match: { count: { $gt: 1 } } },
          { $sort: { count: -1 } },
          ...facet(query),
        ],
      };
    case 'consultant-revenue-reconciliation':
      return {
        collection: 'consultantRevenueEntries',
        pipeline: [
          { $match: revenueMatch },
          {
            $group: {
              _id: '$consultantId',
              consultantShare: { $sum: '$consultantShare' },
              settledAmount: { $sum: '$settledAmount' },
              outstandingAmount: { $sum: '$outstandingAmount' },
              entryCount: { $sum: 1 },
            },
          },
          {
            $addFields: {
              calculatedOutstanding: {
                $subtract: ['$consultantShare', '$settledAmount'],
              },
              variance: {
                $subtract: [
                  '$outstandingAmount',
                  { $subtract: ['$consultantShare', '$settledAmount'] },
                ],
              },
            },
          },
          { $sort: { variance: -1 } },
          ...facet(query),
        ],
      };
    case 'settlement-reconciliation':
      return {
        collection: 'consultantSettlements',
        pipeline: [
          { $match: settlementMatch },
          {
            $lookup: {
              from: 'consultantSettlementItems',
              localField: '_id',
              foreignField: 'settlementId',
              as: '__items',
            },
          },
          {
            $addFields: {
              itemConsultantShare: { $sum: '$__items.consultantShare' },
              itemCountComputed: { $size: '$__items' },
              amountVariance: {
                $subtract: [
                  '$consultantShare',
                  { $sum: '$__items.consultantShare' },
                ],
              },
              itemCountVariance: {
                $subtract: ['$itemCount', { $size: '$__items' }],
              },
            },
          },
          { $unset: '__items' },
          { $sort: { amountVariance: -1 } },
          ...facet(query),
        ],
      };
    case 'financial-ledger-reconciliation':
      return {
        collection: 'consultantRevenueEntries',
        pipeline: [
          { $match: revenueMatch },
          {
            $lookup: {
              from: 'financialLedgerTransactions',
              let: {
                revenueEntryId: '$_id',
                adjustmentId: {
                  $convert: {
                    input: '$calculationTrace.adjustmentId',
                    to: 'objectId',
                    onError: null,
                    onNull: null,
                  },
                },
                facilityId: '$facilityId',
              },
              pipeline: [{
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$facilityId', '$$facilityId'] },
                      { $eq: ['$sourceModule', 'CONSULTANT_SHARING'] },
                      { $eq: ['$status', 'POSTED'] },
                      {
                        $or: [
                          {
                            $and: [
                              {
                                $in: [
                                  '$sourceEntityType',
                                  [
                                    'CONSULTANT_REVENUE_ENTRY',
                                    'CONSULTANT_REVENUE_REVERSAL',
                                  ],
                                ],
                              },
                              { $eq: ['$sourceEntityId', '$$revenueEntryId'] },
                            ],
                          },
                          {
                            $and: [
                              { $eq: ['$sourceEntityType', 'CONSULTANT_REVENUE_ADJUSTMENT'] },
                              { $eq: ['$sourceEntityId', '$$adjustmentId'] },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                },
              }],
              as: '__ledger',
            },
          },
          {
            $addFields: {
              ledgerTransactionCount: { $size: '$__ledger' },
              ledgerMissing: { $eq: [{ $size: '$__ledger' }, 0] },
              ledgerUnbalanced: {
                $anyElementTrue: {
                  $map: {
                    input: '$__ledger',
                    as: 'ledger',
                    in: { $ne: ['$$ledger.totalDebit', '$$ledger.totalCredit'] },
                  },
                },
              },
            },
          },
          { $unset: '__ledger' },
          { $sort: { ledgerMissing: -1, ledgerUnbalanced: -1, occurredAt: -1 } },
          ...facet(query),
        ],
      };
  }
  throw new Error(`Unsupported Consultant Sharing report ${String(report)}`);
}

export class ConsultantSharingReportingService {
  public constructor(
    private readonly dependencies: Readonly<{
      database: Db;
      accessPolicy: ConsultantSharingAccessPolicyPort;
      audit: ConsultantAuditPort;
      jobs: BackgroundJobService;
      clock: ConsultantClockPort;
    }>,
  ) {}

  public async run(
    actor: ConsultantSharingActorContext,
    report: ConsultantSharingReportName,
    query: ConsultantSharingReportQuery,
  ): Promise<ConsultantSharingReportPage> {
    await this.require(actor, 'REPORT_READ', query.consultantId ?? null);
    const effectiveQuery = this.selfScope(actor, query);
    const source = buildConsultantSharingReportSource(
      report,
      actor.facilityId,
      effectiveQuery,
      this.dependencies.clock.now(),
    );
    const rows = await this.dependencies.database
      .collection(source.collection)
      .aggregate(source.pipeline)
      .toArray();
    const facetResult = rows[0] as Document | undefined;
    const items = Array.isArray(facetResult?.['items'])
      ? facetResult['items'] as Document[]
      : [];
    const totals = Array.isArray(facetResult?.['total'])
      ? facetResult['total'] as Document[]
      : [];
    const total = typeof totals[0]?.['value'] === 'number'
      ? totals[0]['value'] as number
      : 0;

    await this.dependencies.audit.record({
      actor,
      action: 'VIEW_CONSULTANT_SHARING_REPORT',
      entityType: 'REPORT',
      entityId: report,
      after: { filters: effectiveQuery, rowCount: total },
    });

    return {
      report,
      items: items.map(projectDocument),
      page: pageNumber(effectiveQuery),
      pageSize: pageSize(effectiveQuery),
      total,
      generatedAt: this.dependencies.clock.now().toISOString(),
    };
  }

  public async exportCsv(
    actor: ConsultantSharingActorContext,
    report: ConsultantSharingReportName,
    query: ConsultantSharingReportQuery,
  ): Promise<ConsultantSharingCsvExport> {
    await this.require(actor, 'REPORT_EXPORT', query.consultantId ?? null);
    const rows: Readonly<Record<string, unknown>>[] = [];
    let page = 1;
    let total = 0;
    do {
      const result = await this.run(actor, report, {
        ...query,
        page,
        pageSize: CONSULTANT_SHARING_MAX_PAGE_SIZE,
      });
      total = result.total;
      rows.push(...result.items);
      page += 1;
    } while (rows.length < total);

    const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const content = [
      headers.map(consultantSharingCsvCell).join(','),
      ...rows.map((row) =>
        headers.map((header) => consultantSharingCsvCell(row[header])).join(','),
      ),
    ].join('\n');

    await this.dependencies.audit.record({
      actor,
      action: 'EXPORT_CONSULTANT_SHARING_REPORT',
      entityType: 'REPORT',
      entityId: report,
      after: { filters: this.selfScope(actor, query), rowCount: total },
    });

    return {
      filename: `consultant-sharing-${report}-${this.dependencies.clock.now().toISOString().slice(0, 10)}.csv`,
      contentType: 'text/csv',
      content: `${content}\n`,
    };
  }

  public async queueCsvExport(
    actor: ConsultantSharingActorContext,
    idempotencyKey: string,
    report: ConsultantSharingReportName,
    query: ConsultantSharingReportQuery,
  ): Promise<Readonly<{ jobId: string; status: string }>> {
    await this.require(actor, 'REPORT_EXPORT', query.consultantId ?? null);
    const existing = await this.dependencies.database.collection('backgroundJobs').findOne({
      facilityId: toObjectId(actor.facilityId, 'facilityId'),
      jobType: 'CONSULTANT_SHARING_REPORT_EXPORT',
      status: { $in: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] },
      'payload.idempotencyKey': idempotencyKey,
    });
    if (typeof existing?.['jobId'] === 'string') {
      return { jobId: existing['jobId'], status: String(existing['status']) };
    }

    const jobId = await this.dependencies.jobs.enqueue({
      facilityId: actor.facilityId,
      jobType: 'CONSULTANT_SHARING_REPORT_EXPORT',
      payload: {
        actorUserId: actor.userId,
        actorStaffId: actor.staffId,
        correlationId: actor.correlationId,
        idempotencyKey,
        report,
        query: this.selfScope(actor, query),
      },
      maxAttempts: 5,
    });
    return { jobId, status: 'PENDING' };
  }

  public async generateQueuedExport(payload: Readonly<{
    facilityId: string;
    actorUserId: string;
    actorStaffId: string | null;
    correlationId: string;
    report: ConsultantSharingReportName;
    query: ConsultantSharingReportQuery;
  }>): Promise<void> {
    const actor: ConsultantSharingActorContext = {
      userId: payload.actorUserId,
      staffId: payload.actorStaffId,
      facilityId: payload.facilityId,
      correlationId: payload.correlationId,
      permissionKeys: new Set([
        CONSULTANT_SHARING_PERMISSION_KEYS.REPORT_READ,
        CONSULTANT_SHARING_PERMISSION_KEYS.REPORT_EXPORT,
      ]),
      roleKeys: ['BACKGROUND_JOB'],
    };
    const exported = await this.exportCsv(actor, payload.report, payload.query);
    const now = this.dependencies.clock.now();
    await this.dependencies.database.collection('reportArtifacts').insertOne({
      _id: createObjectId(),
      facilityId: toObjectId(payload.facilityId, 'facilityId'),
      reportType: `CONSULTANT_SHARING_${payload.report.toUpperCase().replaceAll('-', '_')}`,
      filename: exported.filename,
      contentType: exported.contentType,
      content: exported.content,
      generatedBy: toObjectId(payload.actorUserId, 'generatedBy'),
      generatedAt: now,
      purgeAt: new Date(now.getTime() + 7 * DAY_MS),
      schemaVersion: 1,
      version: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  public isSupportedReport(value: string): value is ConsultantSharingReportName {
    return (CONSULTANT_SHARING_REPORT_NAMES as readonly string[]).includes(value);
  }

  private selfScope(
    actor: ConsultantSharingActorContext,
    query: ConsultantSharingReportQuery,
  ): ConsultantSharingReportQuery {
    if (!actor.roleKeys.includes('CONSULTANT')) return query;
    if (actor.permissionKeys.has(CONSULTANT_SHARING_PERMISSION_KEYS.READ_SENSITIVE)) {
      return query;
    }
    if (actor.staffId === null) {
      throw new ConsultantSharingAccessDeniedError(
        'Consultant report access requires a linked staff record',
      );
    }
    if (query.consultantId !== undefined && query.consultantId !== actor.staffId) {
      throw new ConsultantSharingAccessDeniedError(
        'Consultants may only report on their own financial activity',
      );
    }
    return { ...query, consultantId: actor.staffId };
  }

  private async require(
    actor: ConsultantSharingActorContext,
    action: 'REPORT_READ' | 'REPORT_EXPORT',
    consultantId: string | null,
  ): Promise<void> {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      action,
      consultantId,
      consultantStaffId: consultantId,
      resourceFacilityId: actor.facilityId,
    });
    if (!decision.allowed) {
      throw new ConsultantSharingAccessDeniedError(
        decision.denialReason ?? `Missing ${decision.requiredPermission}`,
      );
    }
  }
}