import type {
  BackgroundJobRunner,
  LeasedBackgroundJob,
} from '../../../infrastructure/background-job.service.js';
import { CONSULTANT_SHARING_PERMISSION_KEYS } from '../consultant-sharing.constants.js';
import type {
  ConsultantFinancialChangeReference,
  ConsultantSharingActorContext,
} from '../consultant-sharing.contracts.js';
import type {
  ConsultantSharingReportName,
  ConsultantSharingReportQuery,
} from '../consultant-sharing.reporting.contracts.js';
import type { ConsultantAgreementApprovalService } from '../services/consultant-agreement-approval.service.js';
import type { ConsultantRecalculationService } from '../services/consultant-recalculation.service.js';
import type { ConsultantReconciliationService } from '../services/consultant-reconciliation.service.js';
import type { ConsultantRevenueCalculationService } from '../services/consultant-revenue-calculation.service.js';
import type { ConsultantSettlementService } from '../services/consultant-settlement.service.js';
import type { ConsultantSharingRecoveryService } from '../services/consultant-sharing-recovery.service.js';
import type { ConsultantSharingReportingService } from '../services/consultant-sharing-reporting.service.js';

export const CONSULTANT_SHARING_BACKGROUND_JOB_TYPES = [
  'CONSULTANT_SHARING_REPORT_EXPORT',
  'CONSULTANT_SHARING_REVENUE_RECOGNITION',
  'CONSULTANT_SHARING_CALCULATION_RECOVERY',
  'CONSULTANT_SHARING_FINANCIAL_CHANGE_RECALCULATION',
  'CONSULTANT_SHARING_SETTLEMENT_CALCULATION',
  'CONSULTANT_SHARING_AGREEMENT_ACTIVATION',
  'CONSULTANT_SHARING_AGREEMENT_EXPIRY',
  'CONSULTANT_SHARING_SETTLEMENT_FINALIZATION',
  'CONSULTANT_SHARING_RECONCILIATION',
  'CONSULTANT_SHARING_RECOVERY_SWEEP',
] as const;

export interface ConsultantSharingBackgroundJobsOptions {
  reports: ConsultantSharingReportingService;
  recovery: ConsultantSharingRecoveryService;
  agreementApprovals: ConsultantAgreementApprovalService;
  revenueCalculation: ConsultantRevenueCalculationService;
  recalculation: ConsultantRecalculationService;
  settlements: ConsultantSettlementService;
  reconciliation: ConsultantReconciliationService;
  jobRunner: BackgroundJobRunner;
  intervalMilliseconds?: number;
  sweepLimit?: number;
}

function stringField(
  payload: Readonly<Record<string, unknown>>,
  field: string,
): string {
  const value = payload[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Consultant Sharing background payload requires ${field}`);
  }
  return value;
}

function integerField(
  payload: Readonly<Record<string, unknown>>,
  field: string,
): number {
  const value = payload[field];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`Consultant Sharing background payload requires integer ${field}`);
  }
  return value;
}

function backgroundActor(
  job: LeasedBackgroundJob,
  correlationId?: string,
): ConsultantSharingActorContext {
  return {
    userId: '000000000000000000000001',
    staffId: null,
    facilityId: job.facilityId,
    correlationId: correlationId ?? `consultant-job:${job.jobId}`,
    permissionKeys: new Set(Object.values(CONSULTANT_SHARING_PERMISSION_KEYS)),
    roleKeys: ['BACKGROUND_JOB'],
  };
}

export class ConsultantSharingBackgroundJobs {
  private interval: NodeJS.Timeout | null = null;
  private running = false;

  public constructor(private readonly options: ConsultantSharingBackgroundJobsOptions) {
    this.registerHandlers();
  }

  public start(): void {
    if (this.interval !== null) return;
    this.interval = setInterval(
      () => void this.runOnce(),
      this.options.intervalMilliseconds ?? 60_000,
    );
    this.interval.unref();
    void this.runOnce();
  }

  public stop(): void {
    if (this.interval === null) return;
    clearInterval(this.interval);
    this.interval = null;
  }

  public async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.options.recovery.deadLetterExhaustedRuns(new Date());
      await this.options.recovery.recoverApplicationTransactions(
        new Date(),
        this.options.sweepLimit ?? 200,
      );
      await this.options.recovery.sweep(
        new Date(),
        this.options.sweepLimit ?? 200,
      );
      for (let processed = 0; processed < 50; processed += 1) {
        const found = await this.options.jobRunner.runOnce(
          `consultant-sharing-background:${process.pid}`,
        );
        if (!found) break;
      }
    } finally {
      this.running = false;
    }
  }

  private registerHandlers(): void {
    this.options.jobRunner.register(
      'CONSULTANT_SHARING_REPORT_EXPORT',
      async (job) => {
        const payload = job.payload as Readonly<Record<string, unknown>>;
        await this.options.reports.generateQueuedExport({
          facilityId: job.facilityId,
          actorUserId: stringField(payload, 'actorUserId'),
          actorStaffId: typeof payload['actorStaffId'] === 'string'
            ? payload['actorStaffId']
            : null,
          correlationId: stringField(payload, 'correlationId'),
          report: stringField(payload, 'report') as ConsultantSharingReportName,
          query: payload['query'] as ConsultantSharingReportQuery,
        });
      },
    );

    const calculationHandler = async (job: LeasedBackgroundJob): Promise<void> => {
      const payload = job.payload as Readonly<Record<string, unknown>>;
      const actor = backgroundActor(job);
      try {
        const entry = await this.options.revenueCalculation.calculate(
          actor,
          `consultant-calculation-job:${job.jobId}`,
          {
            sourceFinancialEventId: stringField(payload, 'sourceFinancialEventId'),
            invoiceLineId: stringField(payload, 'invoiceLineId'),
            consultantId: stringField(payload, 'consultantId'),
            runType: job.jobType === 'CONSULTANT_SHARING_CALCULATION_RECOVERY'
              ? 'MANUAL_RECOVERY'
              : 'INITIAL_RECOGNITION',
            reason: job.jobType === 'CONSULTANT_SHARING_CALCULATION_RECOVERY'
              ? 'Recovered interrupted Consultant Sharing calculation'
              : 'Authoritative financial event recognition',
          },
        );
        if (job.jobType === 'CONSULTANT_SHARING_CALCULATION_RECOVERY') {
          await this.options.recovery.completeCalculationRecovery(
            job.facilityId,
            stringField(payload, 'calculationRunId'),
            entry.calculationHash,
            new Date(),
          );
        }
      } catch (error) {
        if (job.jobType === 'CONSULTANT_SHARING_CALCULATION_RECOVERY') {
          await this.options.recovery.failCalculationRecovery(
            job.facilityId,
            stringField(payload, 'calculationRunId'),
            job.attemptCount,
            job.maxAttempts,
            error,
            new Date(),
          );
        }
        throw error;
      }
    };
    this.options.jobRunner.register(
      'CONSULTANT_SHARING_REVENUE_RECOGNITION',
      calculationHandler,
    );
    this.options.jobRunner.register(
      'CONSULTANT_SHARING_CALCULATION_RECOVERY',
      calculationHandler,
    );

    this.options.jobRunner.register(
      'CONSULTANT_SHARING_FINANCIAL_CHANGE_RECALCULATION',
      async (job) => {
        const payload = job.payload as Readonly<Record<string, unknown>>;
        await this.options.recalculation.recalculate(
          backgroundActor(job),
          `consultant-recalculation-job:${job.jobId}`,
          {
            source: payload['source'] as ConsultantFinancialChangeReference,
            approvalRequestId: stringField(payload, 'approvalRequestId'),
            attachmentIds: Array.isArray(payload['attachmentIds'])
              ? payload['attachmentIds'].filter(
                  (value): value is string => typeof value === 'string',
                )
              : [],
          },
        );
      },
    );

    this.options.jobRunner.register(
      'CONSULTANT_SHARING_SETTLEMENT_CALCULATION',
      async (job) => {
        const payload = job.payload as Readonly<Record<string, unknown>>;
        await this.options.settlements.calculate(
          backgroundActor(job),
          `consultant-settlement-job:${job.jobId}`,
          {
            consultantId: stringField(payload, 'consultantId'),
            periodType: stringField(payload, 'periodType') as never,
            periodFrom: new Date(stringField(payload, 'periodFrom')),
            periodThrough: new Date(stringField(payload, 'periodThrough')),
            openingBalance: typeof payload['openingBalance'] === 'string'
              ? payload['openingBalance']
              : '0.00',
            broughtForwardBalance: typeof payload['broughtForwardBalance'] === 'string'
              ? payload['broughtForwardBalance']
              : '0.00',
            adjustmentAmount: typeof payload['adjustmentAmount'] === 'string'
              ? payload['adjustmentAmount']
              : '0.00',
            taxWithholding: typeof payload['taxWithholding'] === 'string'
              ? payload['taxWithholding']
              : '0.00',
            otherDeductions: typeof payload['otherDeductions'] === 'string'
              ? payload['otherDeductions']
              : '0.00',
            advanceRecovery: typeof payload['advanceRecovery'] === 'string'
              ? payload['advanceRecovery']
              : '0.00',
            overpaymentRecovery: typeof payload['overpaymentRecovery'] === 'string'
              ? payload['overpaymentRecovery']
              : '0.00',
          },
        );
      },
    );

    const agreementTransition = (
      targetStatus: 'ACTIVE' | 'EXPIRED',
    ) => async (job: LeasedBackgroundJob): Promise<void> => {
      const payload = job.payload as Readonly<Record<string, unknown>>;
      const agreementId = stringField(payload, 'agreementId');
      await this.options.agreementApprovals.changeStatus(
        backgroundActor(job),
        agreementId,
        `consultant-agreement-${targetStatus.toLowerCase()}:${job.jobId}`,
        {
          expectedVersion: integerField(payload, 'expectedVersion'),
          targetStatus,
          reason: typeof payload['reason'] === 'string'
            ? payload['reason']
            : `Background agreement transition to ${targetStatus}`,
          approvalRequestId: typeof payload['approvalRequestId'] === 'string'
            ? payload['approvalRequestId']
            : undefined,
        },
      );
    };
    this.options.jobRunner.register(
      'CONSULTANT_SHARING_AGREEMENT_ACTIVATION',
      agreementTransition('ACTIVE'),
    );
    this.options.jobRunner.register(
      'CONSULTANT_SHARING_AGREEMENT_EXPIRY',
      agreementTransition('EXPIRED'),
    );

    this.options.jobRunner.register(
      'CONSULTANT_SHARING_SETTLEMENT_FINALIZATION',
      async (job) => {
        const payload = job.payload as Readonly<Record<string, unknown>>;
        await this.options.settlements.transition(
          backgroundActor(job),
          `consultant-settlement-finalization:${job.jobId}`,
          {
            settlementId: stringField(payload, 'settlementId'),
            expectedVersion: integerField(payload, 'expectedVersion'),
            toStatus: stringField(payload, 'toStatus') as never,
            reason: typeof payload['reason'] === 'string'
              ? payload['reason']
              : 'Background settlement finalization',
            approvalRequestId: typeof payload['approvalRequestId'] === 'string'
              ? payload['approvalRequestId']
              : undefined,
          },
        );
      },
    );

    this.options.jobRunner.register(
      'CONSULTANT_SHARING_RECONCILIATION',
      async (job) => {
        const payload = job.payload as Readonly<Record<string, unknown>>;
        await this.options.reconciliation.run({
          actor: backgroundActor(job),
          from: new Date(stringField(payload, 'from')),
          through: new Date(stringField(payload, 'through')),
        });
      },
    );

    this.options.jobRunner.register(
      'CONSULTANT_SHARING_RECOVERY_SWEEP',
      async (job) => {
        const payload = job.payload as Readonly<Record<string, unknown>>;
        await this.options.recovery.sweep(
          typeof payload['asOf'] === 'string'
            ? new Date(payload['asOf'])
            : new Date(),
          typeof payload['limit'] === 'number'
            ? payload['limit']
            : this.options.sweepLimit ?? 200,
          job.facilityId,
          {
            includeAgreementExpiry: payload['includeAgreementExpiry'] !== false,
            includeCalculationRecovery: payload['includeCalculationRecovery'] !== false,
            includeSettlementReconciliation:
              payload['includeSettlementReconciliation'] === true,
            includeLedgerReconciliation:
              payload['includeLedgerReconciliation'] === true,
          },
        );
      },
    );
  }
}