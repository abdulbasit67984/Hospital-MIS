import type {
  Db,
} from '@hospital-mis/database';

import {
  createObjectId,
  decimal128ToString,
  toObjectId,
} from '@hospital-mis/database';

import {
  PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS,
} from '../panels-packages-coverage.constants.js';

import type {
  PanelsPackagesCoverageActorContext,
} from '../panels-packages-coverage.contracts.js';

import type {
  PpcAccessPolicyPort,
  PpcClockPort,
} from '../panels-packages-coverage.ports.js';

import type {
  BackgroundJobService,
} from '../../../infrastructure/background-job.service.js';

export interface PpcReportQuery {
  from?: string;
  to?: string;
  patientId?: string;
  payerOrganizationId?: string;
  status?: string;
  page: number;
  pageSize: number;
  async?: boolean;
}

export interface PpcReportPage {
  items: readonly Readonly<Record<string, unknown>>[];
  page: number;
  pageSize: number;
  total: number;
}

export interface PpcCsvExport {
  filename: string;
  contentType: 'text/csv';
  content: string;
}

function csvCell(value: unknown): string {
  const raw = String(value ?? '');
  const formulaSafe = /^[=+\-@]/u.test(raw) ? `'${raw}` : raw;
  return `"${formulaSafe.replaceAll('"', '""')}"`;
}

function dateRange(query: PpcReportQuery): Record<string, unknown> {
  if (query.from === undefined && query.to === undefined) {
    return {};
  }

  return {
    createdAt: {
      ...(query.from === undefined
        ? {}
        : { $gte: new Date(query.from) }),
      ...(query.to === undefined
        ? {}
        : { $lte: new Date(query.to) }),
    },
  };
}

export class PanelsPackagesCoverageReportService {
  public constructor(
    private readonly dependencies: Readonly<{
      database: Db;
      accessPolicy: PpcAccessPolicyPort;
      jobs: BackgroundJobService;
      clock: PpcClockPort;
    }>,
  ) {}

  public packageUtilization(
    actor: PanelsPackagesCoverageActorContext,
    query: PpcReportQuery,
  ): Promise<PpcReportPage> {
    return this.report(
      actor,
      'packageUtilizations',
      query,
      (documents) =>
        documents.map((document) => ({
          utilizationId: document['_id'].toHexString(),
          enrollmentId:
            document['packageEnrollmentId'].toHexString(),
          packageItemId:
            document['treatmentPackageItemId'].toHexString(),
          accountChargeId:
            document['accountChargeId'].toHexString(),
          quantity: decimal128ToString(
            document['consumedQuantity'],
          ),
          packageAmount: decimal128ToString(
            document['packageAllocatedAmount'],
          ),
          status: document['status'],
          consumedAt:
            document['consumedAt']?.toISOString() ?? null,
          reversedAt:
            document['reversedAt']?.toISOString() ?? null,
          createdAt: document['createdAt'].toISOString(),
        })),
    );
  }

  public coverageUtilization(
    actor: PanelsPackagesCoverageActorContext,
    query: PpcReportQuery,
  ): Promise<PpcReportPage> {
    return this.report(
      actor,
      'coverageUtilizations',
      query,
      (documents) =>
        documents.map((document) => ({
          utilizationId: document['_id'].toHexString(),
          patientCoverageId:
            document['patientCoverageId'].toHexString(),
          determinationId:
            document['coverageDeterminationId'].toHexString(),
          invoiceId: document['invoiceId'].toHexString(),
          invoiceLineId:
            document['invoiceLineId'].toHexString(),
          chargeCatalogItemId:
            document['chargeCatalogItemId'].toHexString(),
          quantity: decimal128ToString(document['quantity']),
          sponsorAmount: decimal128ToString(
            document['sponsorAmount'],
          ),
          status: document['status'],
          consumedAt:
            document['consumedAt']?.toISOString() ?? null,
          reversedAt:
            document['reversedAt']?.toISOString() ?? null,
          createdAt: document['createdAt'].toISOString(),
        })),
    );
  }

  public benefitBalances(
    actor: PanelsPackagesCoverageActorContext,
    query: PpcReportQuery,
  ): Promise<PpcReportPage> {
    return this.report(
      actor,
      'coverageBenefitBalances',
      query,
      (documents) =>
        documents.map((document) => ({
          balanceId: document['_id'].toHexString(),
          patientCoverageId:
            document['patientCoverageId'].toHexString(),
          panelPlanId: document['panelPlanId'].toHexString(),
          ruleCode: document['ruleCode'],
          limitPeriod: document['limitPeriod'],
          quantityLimit:
            document['quantityLimit'] === null
              ? null
              : decimal128ToString(document['quantityLimit']),
          amountLimit:
            document['amountLimit'] === null
              ? null
              : decimal128ToString(document['amountLimit']),
          reservedQuantity: decimal128ToString(
            document['reservedQuantity'],
          ),
          consumedQuantity: decimal128ToString(
            document['consumedQuantity'],
          ),
          reversedQuantity: decimal128ToString(
            document['reversedQuantity'],
          ),
          reservedAmount: decimal128ToString(
            document['reservedAmount'],
          ),
          consumedAmount: decimal128ToString(
            document['consumedAmount'],
          ),
          reversedAmount: decimal128ToString(
            document['reversedAmount'],
          ),
          periodStart: document['periodStart'].toISOString(),
          periodEnd:
            document['periodEnd']?.toISOString() ?? null,
        })),
    );
  }

  public async exportCsv(
    actor: PanelsPackagesCoverageActorContext,
    report:
      | 'package-utilization'
      | 'coverage-utilization'
      | 'benefit-balances',
    query: PpcReportQuery,
  ): Promise<PpcCsvExport> {
    await this.require(
      actor,
      PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS.REPORT_EXPORT,
    );

    const page =
      report === 'package-utilization'
        ? await this.packageUtilization(actor, {
            ...query,
            page: 1,
            pageSize: Math.min(query.pageSize, 1_000),
          })
        : report === 'coverage-utilization'
          ? await this.coverageUtilization(actor, {
              ...query,
              page: 1,
              pageSize: Math.min(query.pageSize, 1_000),
            })
          : await this.benefitBalances(actor, {
              ...query,
              page: 1,
              pageSize: Math.min(query.pageSize, 1_000),
            });

    const headers = [
      ...new Set(
        page.items.flatMap((item) => Object.keys(item)),
      ),
    ];

    const lines = [
      headers.map(csvCell).join(','),
      ...page.items.map((item) =>
        headers.map((header) => csvCell(item[header])).join(','),
      ),
    ];

    await this.recordExport(actor, report, query, page.total);

    return {
      filename:
        `${report}-${this.dependencies.clock.now().toISOString().slice(0, 10)}.csv`,
      contentType: 'text/csv',
      content: `${lines.join('\n')}\n`,
    };
  }

  public async queueCsvExport(
    actor: PanelsPackagesCoverageActorContext,
    report:
      | 'package-utilization'
      | 'coverage-utilization'
      | 'benefit-balances',
    query: PpcReportQuery,
  ): Promise<Readonly<{
    jobId: string;
    status: 'PENDING';
  }>> {
    await this.require(
      actor,
      PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS.REPORT_EXPORT,
    );

    const jobId = await this.dependencies.jobs.enqueue({
      facilityId: actor.facilityId,
      jobType: 'PPC_REPORT_EXPORT',
      payload: {
        actorUserId: actor.userId,
        correlationId: actor.correlationId,
        report,
        query,
      },
      priority: 0,
      maxAttempts: 5,
    });

    return {
      jobId,
      status: 'PENDING',
    };
  }

  public async generateQueuedExport(
    payload: Readonly<{
      facilityId: string;
      actorUserId: string;
      correlationId: string;
      report:
        | 'package-utilization'
        | 'coverage-utilization'
        | 'benefit-balances';
      query: PpcReportQuery;
    }>,
  ): Promise<void> {
    const actor: PanelsPackagesCoverageActorContext = {
      userId: payload.actorUserId,
      staffId: null,
      facilityId: payload.facilityId,
      correlationId: payload.correlationId,
      permissionKeys: [
        PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS.REPORT_READ,
        PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS.REPORT_EXPORT,
      ],
      roleKeys: ['BACKGROUND_JOB'],
    };

    const exported = await this.exportCsv(
      actor,
      payload.report,
      payload.query,
    );

    const now = this.dependencies.clock.now();

    await this.dependencies.database
      .collection('reportArtifacts')
      .insertOne({
        _id: createObjectId(),
        facilityId: toObjectId(payload.facilityId, 'facilityId'),
        reportType:
          `PPC_${payload.report.toUpperCase().replaceAll('-', '_')}`,
        filename: exported.filename,
        contentType: exported.contentType,
        content: exported.content,
        generatedBy: toObjectId(
          payload.actorUserId,
          'generatedBy',
        ),
        generatedAt: now,
        purgeAt: new Date(now.getTime() + 7 * 86_400_000),
        schemaVersion: 1,
        version: 0,
        createdAt: now,
        updatedAt: now,
      });
  }

  private async report(
    actor: PanelsPackagesCoverageActorContext,
    collectionName: string,
    query: PpcReportQuery,
    project: (
      documents: readonly Record<string, any>[],
    ) => readonly Readonly<Record<string, unknown>>[],
  ): Promise<PpcReportPage> {
    await this.require(
      actor,
      PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS.REPORT_READ,
    );

    const filter: Record<string, unknown> = {
      facilityId: toObjectId(actor.facilityId, 'facilityId'),
      ...dateRange(query),
      ...(query.status === undefined
        ? {}
        : { status: query.status }),
      ...(query.patientId === undefined
        ? {}
        : {
            patientId: toObjectId(query.patientId, 'patientId'),
          }),
    };

    const collection =
      this.dependencies.database.collection<Record<string, any>>(
        collectionName,
      );
    const skip = (query.page - 1) * query.pageSize;

    const [documents, total] = await Promise.all([
      collection
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(query.pageSize)
        .toArray(),
      collection.countDocuments(filter),
    ]);

    return {
      items: project(documents),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  private async recordExport(
    actor: PanelsPackagesCoverageActorContext,
    report: string,
    query: PpcReportQuery,
    rowCount: number,
  ): Promise<void> {
    const now = this.dependencies.clock.now();

    await this.dependencies.database.collection('auditLogs').insertOne({
      _id: createObjectId(),
      facilityId: toObjectId(actor.facilityId, 'facilityId'),
      eventId: `ppc-report:${actor.correlationId}:${report}`,
      actorId: toObjectId(actor.userId, 'actorUserId'),
      action: 'EXPORT_PPC_REPORT',
      module: 'PANELS_PACKAGES_COVERAGE',
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

  private async require(
    actor: PanelsPackagesCoverageActorContext,
    permission: string,
  ): Promise<void> {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      permission,
    });

    if (!decision.allowed) {
      throw new Error(
        decision.denialReason ?? 'Coverage report access denied',
      );
    }
  }
}