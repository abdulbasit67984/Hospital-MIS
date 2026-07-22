import type {
  BackgroundJobRunner,
  LeasedBackgroundJob,
} from './background-job.service.js';

import type {
  ClaimsReportName,
  ClaimsReportQuery,
} from '../modules/claims/claims.contracts.js';

import type {
  ClaimRecoveryService,
} from '../modules/claims/services/claim-recovery.service.js';

import type {
  ClaimReportingService,
} from '../modules/claims/services/claim-reporting.service.js';

export interface ClaimsBackgroundJobsOptions {
  recovery: ClaimRecoveryService;
  reports: ClaimReportingService;
  jobRunner: BackgroundJobRunner;
  intervalMilliseconds?: number;
}

export class ClaimsBackgroundJobs {
  private interval: NodeJS.Timeout | null = null;
  private running = false;

  public constructor(
    private readonly options: ClaimsBackgroundJobsOptions,
  ) {
    this.options.jobRunner.register(
      'CLAIM_REPORT_EXPORT',
      async (job: LeasedBackgroundJob) => {
        const payload = job.payload as Readonly<{
          actorUserId: string;
          correlationId: string;
          report: ClaimsReportName;
          query: ClaimsReportQuery;
        }>;
        await this.options.reports.generateQueuedExport({
          facilityId: job.facilityId,
          actorUserId: payload.actorUserId,
          correlationId: payload.correlationId,
          report: payload.report,
          query: payload.query,
        });
      },
    );

    this.options.jobRunner.register(
      'CLAIM_SUBMISSION_DISPATCH',
      (job) => this.options.recovery.dispatchSubmissionJob(job),
    );
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
      await this.options.recovery.sweep(new Date(), 500);
      for (let processed = 0; processed < 50; processed += 1) {
        const found = await this.options.jobRunner.runOnce(
          `claims-background:${process.pid}`,
        );
        if (!found) break;
      }
    } finally {
      this.running = false;
    }
  }
}