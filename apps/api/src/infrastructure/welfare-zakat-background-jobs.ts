import type {
  BackgroundJobRunner,
  LeasedBackgroundJob,
} from './background-job.service.js';
import type {
  WelfareZakatReportName,
  WelfareZakatReportQuery,
} from '../modules/welfare-zakat/welfare-zakat.contracts.js';
import type { AssistanceMaintenanceService } from '../modules/welfare-zakat/services/assistance-maintenance.service.js';
import type { AssistanceReportingService } from '../modules/welfare-zakat/services/assistance-reporting.service.js';

export interface WelfareZakatBackgroundJobsOptions {
  maintenance: AssistanceMaintenanceService;
  reports: AssistanceReportingService;
  jobRunner: BackgroundJobRunner;
  intervalMilliseconds?: number;
}

export class WelfareZakatBackgroundJobs {
  private interval: NodeJS.Timeout | null = null;
  private running = false;

  public constructor(
    private readonly options: WelfareZakatBackgroundJobsOptions,
  ) {
    this.options.jobRunner.register(
      'WELFARE_ZAKAT_REPORT_EXPORT',
      async (job: LeasedBackgroundJob) => {
        const payload = job.payload as Readonly<{
          actorUserId: string;
          correlationId: string;
          report: WelfareZakatReportName;
          query: WelfareZakatReportQuery;
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
      'WELFARE_ZAKAT_MAINTENANCE_SWEEP',
      async (job: LeasedBackgroundJob) => {
        const payload = job.payload as Readonly<{
          limit?: number;
          asOf?: string;
        }>;
        await this.options.maintenance.sweep(
          payload.asOf == null ? new Date() : new Date(payload.asOf),
          payload.limit ?? 200,
          job.facilityId,
        );
      },
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
      await this.options.maintenance.sweep(new Date(), 200);
      for (let processed = 0; processed < 50; processed += 1) {
        const found = await this.options.jobRunner.runOnce(
          `welfare-zakat-background:${process.pid}`,
        );
        if (!found) break;
      }
    } finally {
      this.running = false;
    }
  }
}