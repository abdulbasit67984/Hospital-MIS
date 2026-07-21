import type {
  PaymentRecoveryService,
} from '../modules/payments-cashier-shifts/services/payment-recovery.service.js';

export interface PaymentsCashierShiftsBackgroundJobsOptions {
  recovery: PaymentRecoveryService;
  intervalMilliseconds?: number;
}

export class PaymentsCashierShiftsBackgroundJobs {
  private interval: NodeJS.Timeout | null = null;
  private running = false;

  public constructor(
    private readonly options: PaymentsCashierShiftsBackgroundJobsOptions,
  ) {}

  public start(): void {
    if (this.interval !== null) {
      return;
    }

    const intervalMilliseconds = this.options.intervalMilliseconds ?? 60_000;

    this.interval = setInterval(() => {
      void this.runOnce();
    }, intervalMilliseconds);

    this.interval.unref();
    void this.runOnce();
  }

  public stop(): void {
    if (this.interval === null) {
      return;
    }

    clearInterval(this.interval);
    this.interval = null;
  }

  public async runOnce(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      await this.options.recovery.expirePaymentIntents(new Date(), 500);
    } finally {
      this.running = false;
    }
  }
}