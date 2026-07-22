import type {
  Db,
} from '@hospital-mis/database';

import {
  createObjectId,
  decimal128ToString,
  toObjectId,
} from '@hospital-mis/database';

import type {
  Document,
} from 'mongodb';

import {
  CLAIM_PERMISSION_KEYS,
} from '../claims.constants.js';

import type {
  ClaimsActorContext,
  ClaimsReportName,
  ClaimsReportPage,
  ClaimsReportQuery,
} from '../claims.contracts.js';

import {
  ClaimAccessDeniedError,
} from '../claims.errors.js';

import type {
  ClaimsAccessPolicyPort,
  ClaimsClockPort,
} from '../claims.ports.js';

import type {
  BackgroundJobService,
} from '../../../infrastructure/background-job.service.js';

export const CLAIM_REPORT_NAMES = [
  'claim-register',
  'claim-status',
  'claim-aging',
  'denials',
  'appeals',
  'payer-performance',
  'outstanding-sponsor-balances',
  'remittance-reconciliation',
] as const satisfies readonly ClaimsReportName[];

export interface ClaimsCsvExport {
  filename: string;
  contentType: 'text/csv';
  content: string;
}

export function claimsCsvCell(value: unknown): string {
  const raw = String(value ?? '');
  const formulaSafe = /^[=+\-@]/u.test(raw) ? `'${raw}` : raw;
  return `"${formulaSafe.replaceAll('"', '""')}"`;
}

function objectIdString(value: unknown): string | null {
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

function isoString(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === 'string' ? value : null;
}

function moneyString(value: unknown): string {
  if (value === null || value === undefined) {
    return '0.00';
  }
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

function pageSize(query: ClaimsReportQuery): number {
  return Math.max(1, Math.min(query.pageSize ?? 50, 1_000));
}

function pageNumber(query: ClaimsReportQuery): number {
  return Math.max(1, query.page ?? 1);
}

function baseClaimMatch(
  facilityId: string,
  query: ClaimsReportQuery,
): Document {
  const match: Document = {
    facilityId: toObjectId(facilityId, 'facilityId'),
  };

  if (query.from !== undefined || query.to !== undefined) {
    match['createdAt'] = {
      ...(query.from === undefined ? {} : { $gte: new Date(query.from) }),
      ...(query.to === undefined ? {} : { $lte: new Date(query.to) }),
    };
  }
  if (query.payerOrganizationId !== undefined) {
    match['payerOrganizationId'] = toObjectId(
      query.payerOrganizationId,
      'payerOrganizationId',
    );
  }
  if (query.panelPlanId !== undefined) {
    match['panelPlanId'] = toObjectId(query.panelPlanId, 'panelPlanId');
  }
  if (query.status !== undefined && query.status.length > 0) {
    match['status'] = { $in: [...query.status] };
  }
  if (query.agingBucket !== undefined && query.agingBucket.length > 0) {
    match['agingBucket'] = { $in: [...query.agingBucket] };
  }
  return match;
}

function claimDepartmentStages(query: ClaimsReportQuery): Document[] {
  if (query.departmentId === undefined) return [];
  return [
    {
      $lookup: {
        from: 'claimLines',
        localField: '_id',
        foreignField: 'claimId',
        as: '__reportDepartmentLines',
      },
    },
    {
      $match: {
        '__reportDepartmentLines.departmentId': toObjectId(
          query.departmentId,
          'departmentId',
        ),
      },
    },
    { $unset: '__reportDepartmentLines' },
  ];
}

function relatedClaimDepartmentStages(query: ClaimsReportQuery): Document[] {
  if (query.departmentId === undefined) return [];
  return [
    {
      $lookup: {
        from: 'claimLines',
        localField: 'claimId',
        foreignField: 'claimId',
        as: '__reportDepartmentLines',
      },
    },
    {
      $match: {
        '__reportDepartmentLines.departmentId': toObjectId(
          query.departmentId,
          'departmentId',
        ),
      },
    },
    { $unset: '__reportDepartmentLines' },
  ];
}

function remittanceDepartmentStages(query: ClaimsReportQuery): Document[] {
  if (query.departmentId === undefined) return [];
  return [
    {
      $lookup: {
        from: 'claimLines',
        localField: 'allocations.claimId',
        foreignField: 'claimId',
        as: '__reportDepartmentLines',
      },
    },
    {
      $match: {
        '__reportDepartmentLines.departmentId': toObjectId(
          query.departmentId,
          'departmentId',
        ),
      },
    },
    { $unset: '__reportDepartmentLines' },
  ];
}

function facet(query: ClaimsReportQuery): Document[] {
  const size = pageSize(query);
  const skip = (pageNumber(query) - 1) * size;
  return [
    {
      $facet: {
        items: [
          { $skip: skip },
          { $limit: size },
        ],
        total: [
          { $count: 'value' },
        ],
      },
    },
  ];
}

function reportPipeline(
  report: ClaimsReportName,
  facilityId: string,
  query: ClaimsReportQuery,
): Document[] {
  const match = baseClaimMatch(facilityId, query);

  switch (report) {
    case 'claim-register':
      return [
        { $match: match },
        ...claimDepartmentStages(query),
        { $sort: { createdAt: -1, _id: -1 } },
        ...facet(query),
      ];
    case 'claim-status':
      return [
        { $match: match },
        ...claimDepartmentStages(query),
        {
          $group: {
            _id: {
              payerOrganizationId: '$payerOrganizationId',
              status: '$status',
            },
            claimCount: { $sum: 1 },
            claimedAmount: { $sum: '$claimedAmount' },
            approvedAmount: { $sum: '$approvedAmount' },
            paidAmount: { $sum: '$paidAmount' },
            outstandingAmount: { $sum: '$outstandingAmount' },
          },
        },
        { $sort: { '_id.payerOrganizationId': 1, '_id.status': 1 } },
        ...facet(query),
      ];
    case 'claim-aging':
      return [
        {
          $match: {
            ...match,
            outstandingAmount: { $gt: 0 },
            status: {
              $nin: ['CANCELLED', 'REVERSED', 'VOIDED', 'CLOSED'],
            },
          },
        },
        ...claimDepartmentStages(query),
        {
          $group: {
            _id: {
              payerOrganizationId: '$payerOrganizationId',
              agingBucket: '$agingBucket',
            },
            claimCount: { $sum: 1 },
            claimedAmount: { $sum: '$claimedAmount' },
            paidAmount: { $sum: '$paidAmount' },
            outstandingAmount: { $sum: '$outstandingAmount' },
            oldestServiceDate: { $min: '$serviceFrom' },
          },
        },
        { $sort: { '_id.payerOrganizationId': 1, '_id.agingBucket': 1 } },
        ...facet(query),
      ];
    case 'denials':
      return [
        {
          $match: {
            facilityId: toObjectId(facilityId, 'facilityId'),
            ...(query.from === undefined && query.to === undefined
              ? {}
              : {
                  createdAt: {
                    ...(query.from === undefined ? {} : { $gte: new Date(query.from) }),
                    ...(query.to === undefined ? {} : { $lte: new Date(query.to) }),
                  },
                }),
            ...(query.denialCategory === undefined || query.denialCategory.length === 0
              ? {}
              : { category: { $in: [...query.denialCategory] } }),
          },
        },
        {
          $lookup: {
            from: 'claims',
            localField: 'claimId',
            foreignField: '_id',
            as: 'claim',
          },
        },
        { $unwind: '$claim' },
        ...(query.payerOrganizationId === undefined
          ? []
          : [{
              $match: {
                'claim.payerOrganizationId': toObjectId(
                  query.payerOrganizationId,
                  'payerOrganizationId',
                ),
              },
            }]),
        ...relatedClaimDepartmentStages(query),
        { $sort: { createdAt: -1, _id: -1 } },
        ...facet(query),
      ];
    case 'appeals':
      return [
        {
          $match: {
            facilityId: toObjectId(facilityId, 'facilityId'),
            ...(query.from === undefined && query.to === undefined
              ? {}
              : {
                  createdAt: {
                    ...(query.from === undefined ? {} : { $gte: new Date(query.from) }),
                    ...(query.to === undefined ? {} : { $lte: new Date(query.to) }),
                  },
                }),
            ...(query.appealStatus === undefined || query.appealStatus.length === 0
              ? {}
              : { status: { $in: [...query.appealStatus] } }),
          },
        },
        {
          $lookup: {
            from: 'claims',
            localField: 'claimId',
            foreignField: '_id',
            as: 'claim',
          },
        },
        { $unwind: '$claim' },
        ...(query.payerOrganizationId === undefined
          ? []
          : [{
              $match: {
                'claim.payerOrganizationId': toObjectId(
                  query.payerOrganizationId,
                  'payerOrganizationId',
                ),
              },
            }]),
        ...relatedClaimDepartmentStages(query),
        { $sort: { appealDeadline: 1, _id: 1 } },
        ...facet(query),
      ];
    case 'payer-performance':
      return [
        { $match: match },
        ...claimDepartmentStages(query),
        {
          $group: {
            _id: '$payerOrganizationId',
            claimCount: { $sum: 1 },
            submittedCount: {
              $sum: { $cond: [{ $ne: ['$submittedAt', null] }, 1, 0] },
            },
            approvedCount: {
              $sum: {
                $cond: [
                  { $in: ['$status', ['APPROVED', 'PARTIALLY_APPROVED', 'PAID', 'CLOSED']] },
                  1,
                  0,
                ],
              },
            },
            deniedCount: {
              $sum: { $cond: [{ $eq: ['$status', 'DENIED'] }, 1, 0] },
            },
            claimedAmount: { $sum: '$claimedAmount' },
            approvedAmount: { $sum: '$approvedAmount' },
            paidAmount: { $sum: '$paidAmount' },
            outstandingAmount: { $sum: '$outstandingAmount' },
            averageAdjudicationDays: {
              $avg: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$submittedAt', null] },
                      { $ne: ['$adjudicatedAt', null] },
                    ],
                  },
                  {
                    $dateDiff: {
                      startDate: '$submittedAt',
                      endDate: '$adjudicatedAt',
                      unit: 'day',
                    },
                  },
                  null,
                ],
              },
            },
          },
        },
        { $sort: { outstandingAmount: -1, _id: 1 } },
        ...facet(query),
      ];
    case 'outstanding-sponsor-balances':
      return [
        {
          $match: {
            ...match,
            outstandingAmount: { $gt: 0 },
            status: { $nin: ['CANCELLED', 'REVERSED', 'VOIDED', 'CLOSED'] },
          },
        },
        ...claimDepartmentStages(query),
        {
          $group: {
            _id: '$payerOrganizationId',
            claimCount: { $sum: 1 },
            approvedAmount: { $sum: '$approvedAmount' },
            paidAmount: { $sum: '$paidAmount' },
            adjustmentAmount: {
              $sum: {
                $add: [
                  '$contractualAdjustmentAmount',
                  '$writeOffAmount',
                  '$payerWithholdingAmount',
                ],
              },
            },
            outstandingAmount: { $sum: '$outstandingAmount' },
            oldestAgingAnchorAt: { $min: '$agingAnchorAt' },
          },
        },
        { $sort: { outstandingAmount: -1, _id: 1 } },
        ...facet(query),
      ];
    case 'remittance-reconciliation':
      return [
        {
          $match: {
            facilityId: toObjectId(facilityId, 'facilityId'),
            ...(query.from === undefined && query.to === undefined
              ? {}
              : {
                  remittanceDate: {
                    ...(query.from === undefined ? {} : { $gte: new Date(query.from) }),
                    ...(query.to === undefined ? {} : { $lte: new Date(query.to) }),
                  },
                }),
            ...(query.payerOrganizationId === undefined
              ? {}
              : {
                  payerOrganizationId: toObjectId(
                    query.payerOrganizationId,
                    'payerOrganizationId',
                  ),
                }),
          },
        },
        ...remittanceDepartmentStages(query),
        { $sort: { remittanceDate: -1, _id: -1 } },
        ...facet(query),
      ];
  }
}

function projectReportItem(
  report: ClaimsReportName,
  document: Document,
): Readonly<Record<string, unknown>> {
  const claim = document['claim'] as Document | undefined;
  const groupedId = document['_id'] as Document | undefined;

  switch (report) {
    case 'claim-register':
      return {
        claimId: objectIdString(document['_id']),
        claimNumber: document['claimNumber'],
        claimVersionNumber: document['claimVersionNumber'],
        claimVersionType: document['claimVersionType'],
        payerOrganizationId: objectIdString(document['payerOrganizationId']),
        panelPlanId: objectIdString(document['panelPlanId']),
        invoiceId: objectIdString(document['invoiceId']),
        status: document['status'],
        serviceFrom: isoString(document['serviceFrom']),
        serviceThrough: isoString(document['serviceThrough']),
        claimedAmount: moneyString(document['claimedAmount']),
        approvedAmount: moneyString(document['approvedAmount']),
        paidAmount: moneyString(document['paidAmount']),
        outstandingAmount: moneyString(document['outstandingAmount']),
        agingBucket: document['agingBucket'],
        submittedAt: isoString(document['submittedAt']),
        adjudicatedAt: isoString(document['adjudicatedAt']),
      };
    case 'claim-status':
      return {
        payerOrganizationId: objectIdString(groupedId?.['payerOrganizationId']),
        status: groupedId?.['status'] ?? null,
        claimCount: integer(document['claimCount']),
        claimedAmount: moneyString(document['claimedAmount']),
        approvedAmount: moneyString(document['approvedAmount']),
        paidAmount: moneyString(document['paidAmount']),
        outstandingAmount: moneyString(document['outstandingAmount']),
      };
    case 'claim-aging':
      return {
        payerOrganizationId: objectIdString(groupedId?.['payerOrganizationId']),
        agingBucket: groupedId?.['agingBucket'] ?? null,
        claimCount: integer(document['claimCount']),
        claimedAmount: moneyString(document['claimedAmount']),
        paidAmount: moneyString(document['paidAmount']),
        outstandingAmount: moneyString(document['outstandingAmount']),
        oldestServiceDate: isoString(document['oldestServiceDate']),
      };
    case 'denials':
      return {
        denialId: objectIdString(document['_id']),
        claimId: objectIdString(document['claimId']),
        claimNumber: claim?.['claimNumber'] ?? null,
        payerOrganizationId: objectIdString(claim?.['payerOrganizationId']),
        claimLineId: objectIdString(document['claimLineId']),
        category: document['category'],
        reasonCode: document['reasonCode'],
        deniedAmount: moneyString(document['deniedAmount']),
        appealEligible: document['appealEligible'] === true,
        appealDeadline: isoString(document['appealDeadline']),
        resolved: document['resolved'] === true,
        createdAt: isoString(document['createdAt']),
      };
    case 'appeals':
      return {
        appealId: objectIdString(document['_id']),
        appealNumber: document['appealNumber'],
        claimId: objectIdString(document['claimId']),
        claimNumber: claim?.['claimNumber'] ?? null,
        payerOrganizationId: objectIdString(claim?.['payerOrganizationId']),
        status: document['status'],
        appealDeadline: isoString(document['appealDeadline']),
        requestedAmount: moneyString(document['requestedAmount']),
        approvedAdditionalAmount: moneyString(document['approvedAdditionalAmount']),
        submittedAt: isoString(document['submittedAt']),
        decidedAt: isoString(document['decidedAt']),
      };
    case 'payer-performance': {
      const claimCount = Math.max(1, integer(document['claimCount']));
      const approvedCount = integer(document['approvedCount']);
      const deniedCount = integer(document['deniedCount']);
      return {
        payerOrganizationId: objectIdString(document['_id']),
        claimCount: integer(document['claimCount']),
        submittedCount: integer(document['submittedCount']),
        approvedCount,
        deniedCount,
        approvalRatePercent: ((approvedCount / claimCount) * 100).toFixed(2),
        denialRatePercent: ((deniedCount / claimCount) * 100).toFixed(2),
        claimedAmount: moneyString(document['claimedAmount']),
        approvedAmount: moneyString(document['approvedAmount']),
        paidAmount: moneyString(document['paidAmount']),
        outstandingAmount: moneyString(document['outstandingAmount']),
        averageAdjudicationDays:
          typeof document['averageAdjudicationDays'] === 'number'
            ? Number(document['averageAdjudicationDays'].toFixed(2))
            : null,
      };
    }
    case 'outstanding-sponsor-balances':
      return {
        payerOrganizationId: objectIdString(document['_id']),
        claimCount: integer(document['claimCount']),
        approvedAmount: moneyString(document['approvedAmount']),
        paidAmount: moneyString(document['paidAmount']),
        adjustmentAmount: moneyString(document['adjustmentAmount']),
        outstandingAmount: moneyString(document['outstandingAmount']),
        oldestAgingAnchorAt: isoString(document['oldestAgingAnchorAt']),
      };
    case 'remittance-reconciliation':
      return {
        remittanceId: objectIdString(document['_id']),
        remittanceNumber: document['remittanceNumber'],
        payerOrganizationId: objectIdString(document['payerOrganizationId']),
        remittanceReference: document['remittanceReference'],
        remittanceDate: isoString(document['remittanceDate']),
        sponsorPaymentId: objectIdString(document['sponsorPaymentId']),
        totalPaymentAmount: moneyString(document['totalPaymentAmount']),
        allocatedAmount: moneyString(document['allocatedAmount']),
        unappliedAmount: moneyString(document['unappliedAmount']),
        allocationCount: Array.isArray(document['allocations'])
          ? document['allocations'].length
          : 0,
        reversedAt: isoString(document['reversedAt']),
      };
  }
}

export class ClaimReportingService {
  public constructor(
    private readonly dependencies: Readonly<{
      database: Db;
      accessPolicy: ClaimsAccessPolicyPort;
      jobs: BackgroundJobService;
      clock: ClaimsClockPort;
    }>,
  ) {}

  public async run(
    actor: ClaimsActorContext,
    report: ClaimsReportName,
    query: ClaimsReportQuery,
  ): Promise<ClaimsReportPage> {
    await this.require(actor, CLAIM_PERMISSION_KEYS.REPORT_READ);

    const collectionName = report === 'denials'
      ? 'claimDenials'
      : report === 'appeals'
        ? 'claimAppeals'
        : report === 'remittance-reconciliation'
          ? 'claimRemittances'
          : 'claims';

    const [result] = await this.dependencies.database
      .collection<Document>(collectionName)
      .aggregate<Document>(reportPipeline(report, actor.facilityId, query), {
        allowDiskUse: true,
      })
      .toArray();

    const items = Array.isArray(result?.['items'])
      ? result['items'] as Document[]
      : [];
    const totalRows = Array.isArray(result?.['total'])
      ? result['total'] as Document[]
      : [];
    const total = integer(totalRows[0]?.['value']);

    return {
      report,
      items: items.map((item) => projectReportItem(report, item)),
      page: pageNumber(query),
      pageSize: pageSize(query),
      total,
      generatedAt: this.dependencies.clock.now().toISOString(),
    };
  }

  public async exportCsv(
    actor: ClaimsActorContext,
    report: ClaimsReportName,
    query: ClaimsReportQuery,
  ): Promise<ClaimsCsvExport> {
    await this.require(actor, CLAIM_PERMISSION_KEYS.REPORT_EXPORT);

    const items: Readonly<Record<string, unknown>>[] = [];
    let page = 1;
    let total = 0;
    do {
      const result = await this.run(actor, report, {
        ...query,
        page,
        pageSize: 1_000,
      });
      total = result.total;
      if (result.items.length === 0) break;
      items.push(...result.items);
      page += 1;
    } while (items.length < total);

    const headers = [
      ...new Set(items.flatMap((item) => Object.keys(item))),
    ];
    const lines = [
      headers.map(claimsCsvCell).join(','),
      ...items.map((item) =>
        headers.map((header) => claimsCsvCell(item[header])).join(','),
      ),
    ];

    await this.recordExport(actor, report, query, total);

    return {
      filename: `claims-${report}-${this.dependencies.clock.now().toISOString().slice(0, 10)}.csv`,
      contentType: 'text/csv',
      content: `${lines.join('\n')}\n`,
    };
  }

  public async queueCsvExport(
    actor: ClaimsActorContext,
    idempotencyKey: string,
    report: ClaimsReportName,
    query: ClaimsReportQuery,
  ): Promise<Readonly<{
    jobId: string;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  }>> {
    await this.require(actor, CLAIM_PERMISSION_KEYS.REPORT_EXPORT);

    const existing = await this.dependencies.database.collection('backgroundJobs').findOne({
      facilityId: toObjectId(actor.facilityId, 'facilityId'),
      jobType: 'CLAIM_REPORT_EXPORT',
      status: { $in: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] },
      'payload.idempotencyKey': idempotencyKey,
    });
    if (
      typeof existing?.['jobId'] === 'string' &&
      ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'].includes(
        String(existing['status']),
      )
    ) {
      return {
        jobId: existing['jobId'],
        status: existing['status'] as
          | 'PENDING'
          | 'PROCESSING'
          | 'COMPLETED'
          | 'FAILED',
      };
    }

    const jobId = await this.dependencies.jobs.enqueue({
      facilityId: actor.facilityId,
      jobType: 'CLAIM_REPORT_EXPORT',
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
    report: ClaimsReportName;
    query: ClaimsReportQuery;
  }>): Promise<void> {
    const actor: ClaimsActorContext = {
      userId: payload.actorUserId,
      staffId: null,
      facilityId: payload.facilityId,
      correlationId: payload.correlationId,
      permissionKeys: new Set([
        CLAIM_PERMISSION_KEYS.REPORT_READ,
        CLAIM_PERMISSION_KEYS.REPORT_EXPORT,
      ]),
      roleKeys: ['BACKGROUND_JOB'],
    };
    const exported = await this.exportCsv(actor, payload.report, payload.query);
    const now = this.dependencies.clock.now();

    await this.dependencies.database.collection('reportArtifacts').insertOne({
      _id: createObjectId(),
      facilityId: toObjectId(payload.facilityId, 'facilityId'),
      reportType: `CLAIMS_${payload.report.toUpperCase().replaceAll('-', '_')}`,
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
    actor: ClaimsActorContext,
    report: ClaimsReportName,
    query: ClaimsReportQuery,
    rowCount: number,
  ): Promise<void> {
    const now = this.dependencies.clock.now();
    await this.dependencies.database.collection('auditLogs').insertOne({
      _id: createObjectId(),
      facilityId: toObjectId(actor.facilityId, 'facilityId'),
      eventId: `claims-report:${actor.correlationId}:${report}`,
      actorId: toObjectId(actor.userId, 'actorUserId'),
      action: 'EXPORT_CLAIMS_REPORT',
      module: 'CLAIMS',
      entityType: 'REPORT',
      entityId: report,
      metadata: {
        filters: query,
        rowCount,
      },
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

  private async require(actor: ClaimsActorContext, permission: string): Promise<void> {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      permission,
      resourceFacilityId: actor.facilityId,
    });
    if (!decision.allowed) {
      throw new ClaimAccessDeniedError(decision.denialReason ?? undefined);
    }
  }
}