import type {
  Db,
} from '@hospital-mis/database';

import {
  PackageEnrollmentModel,
  PatientCoverageModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  BackgroundJobRunner,
  LeasedBackgroundJob,
} from '../../../infrastructure/background-job.service.js';

import type {
  OutboxService,
} from '../../../infrastructure/outbox.service.js';

import type {
  RecoverableInfrastructure,
  RecoveryCycleResult,
} from '../../../infrastructure/recovery-loop.js';

import type {
  PanelsPackagesCoverageReportService,
  PpcReportQuery,
} from './panels-packages-coverage-report.service.js';

const transactionTypes = [
  'CREATE_DIAGNOSTIC_PANEL',
  'CREATE_PAYER_ORGANIZATION',
  'CREATE_COVERAGE_PLAN',
  'ENROLL_PATIENT_COVERAGE',
  'VERIFY_PATIENT_COVERAGE',
  'ENROLL_PATIENT_PACKAGE',
  'RESERVE_PACKAGE_UTILIZATION',
  'REVERSE_PACKAGE_UTILIZATION',
  'DETERMINE_COVERAGE',
  'OVERRIDE_COVERAGE_DETERMINATION',
  'REVERSE_COVERAGE_DETERMINATION',
  'APPLY_PPC_REFUND_EFFECTS',
] as const;

export class PanelsPackagesCoverageRecoveryService
implements RecoverableInfrastructure {
  public constructor(
    private readonly database: Db,
    private readonly outbox: OutboxService,
  ) {}

  public async markStaleTransactions(
    staleBefore: Date,
  ): Promise<number> {
    const result = await this.database
      .collection('applicationTransactions')
      .updateMany(
        {
          transactionType: {
            $in: transactionTypes,
          },
          status: {
            $in: ['PENDING', 'IN_PROGRESS'],
          },
          updatedAt: {
            $lte: staleBefore,
          },
        },
        {
          $set: {
            status: 'RECOVERY_REQUIRED',
            recoveryStatus:
              'PPC_ABANDONED_TRANSACTION_DETECTED',
          },
          $inc: {
            version: 1,
          },
          $currentDate: {
            updatedAt: true,
          },
        },
      );

    return result.modifiedCount;
  }

  public async recoverAvailable(
    input: Readonly<{
      workerId: string;
      maxTransactions: number;
      now: Date;
    }>,
  ): Promise<RecoveryCycleResult> {
    let recovered = 0;
    let failed = 0;

    for (
      let count = 0;
      count < input.maxTransactions;
      count += 1
    ) {
      const transaction = await this.database
        .collection<Record<string, any>>(
          'applicationTransactions',
        )
        .findOneAndUpdate(
          {
            transactionType: {
              $in: transactionTypes,
            },
            status: 'RECOVERY_REQUIRED',
            $or: [
              {
                recoveryLeaseExpiresAt: {
                  $exists: false,
                },
              },
              {
                recoveryLeaseExpiresAt: {
                  $lte: input.now,
                },
              },
            ],
          },
          {
            $set: {
              recoveryLeaseOwner: input.workerId,
              recoveryLeaseExpiresAt: new Date(
                input.now.getTime() + 60_000,
              ),
              recoveryStatus: 'PPC_RECOVERY_IN_PROGRESS',
            },
            $inc: {
              retryCount: 1,
              version: 1,
            },
            $currentDate: {
              updatedAt: true,
            },
          },
          {
            sort: {
              updatedAt: 1,
            },
            returnDocument: 'after',
          },
        );

      if (transaction === null) {
        break;
      }

      try {
        const domainEvidence = await this.findDomainEvidence(
          transaction.transactionType,
          transaction.contextSnapshot,
        );

        await this.database
          .collection('applicationTransactions')
          .updateOne(
            {
              _id: transaction._id,
              recoveryLeaseOwner: input.workerId,
            },
            {
              $set: {
                status: domainEvidence ? 'COMPLETED' : 'FAILED',
                recoveryStatus: domainEvidence
                  ? 'PPC_RECOVERED_FROM_DOMAIN_EVIDENCE'
                  : 'PPC_NO_COMMITTED_DOMAIN_EVIDENCE',
                ...(domainEvidence
                  ? { completionTimestamp: new Date() }
                  : {}),
              },
              $unset: {
                recoveryLeaseOwner: '',
                recoveryLeaseExpiresAt: '',
              },
              $inc: {
                version: 1,
              },
              $currentDate: {
                updatedAt: true,
              },
            },
          );

        if (domainEvidence) {
          await this.outbox.releaseTransactionEvents(
            transaction.transactionId,
          );
        }

        recovered += 1;
      } catch (error) {
        failed += 1;

        await this.database
          .collection('applicationTransactions')
          .updateOne(
            {
              _id: transaction._id,
              recoveryLeaseOwner: input.workerId,
            },
            {
              $set: {
                recoveryStatus: 'PPC_RECOVERY_FAILED',
                errorDetails: {
                  name:
                    error instanceof Error
                      ? error.name
                      : typeof error,
                  message:
                    error instanceof Error
                      ? error.message.slice(0, 2_000)
                      : 'Unknown recovery failure',
                },
              },
              $unset: {
                recoveryLeaseOwner: '',
                recoveryLeaseExpiresAt: '',
              },
              $inc: {
                version: 1,
              },
              $currentDate: {
                updatedAt: true,
              },
            },
          );
      }
    }

    return {
      recovered,
      failed,
    };
  }

  public async expireEligibility(
    now: Date,
  ): Promise<Readonly<{
    expiredCoverages: number;
    expiredPackages: number;
  }>> {
    const [coverages, packages] = await Promise.all([
      PatientCoverageModel.updateMany(
        {
          status: 'ACTIVE',
          eligibleThrough: {
            $lt: now,
          },
        },
        {
          $set: {
            status: 'EXPIRED',
            updatedAt: now,
          },
          $inc: {
            version: 1,
          },
        },
      ).exec(),
      PackageEnrollmentModel.updateMany(
        {
          status: 'ACTIVE',
          validThrough: {
            $lt: now,
          },
        },
        {
          $set: {
            status: 'EXPIRED',
            updatedAt: now,
          },
          $inc: {
            version: 1,
          },
        },
      ).exec(),
    ]);

    return {
      expiredCoverages: coverages.modifiedCount,
      expiredPackages: packages.modifiedCount,
    };
  }

  private async findDomainEvidence(
    transactionType: string,
    context: Record<string, unknown> | undefined,
  ): Promise<boolean> {
    const collectionByType: Readonly<Record<string, string>> = {
      CREATE_DIAGNOSTIC_PANEL: 'diagnosticPanels',
      CREATE_PAYER_ORGANIZATION: 'payerOrganizations',
      CREATE_COVERAGE_PLAN: 'panelPlans',
      ENROLL_PATIENT_COVERAGE: 'patientCoverages',
      VERIFY_PATIENT_COVERAGE: 'patientCoverageVerifications',
      ENROLL_PATIENT_PACKAGE: 'packageEnrollments',
      RESERVE_PACKAGE_UTILIZATION: 'packageUtilizations',
      REVERSE_PACKAGE_UTILIZATION: 'packageUtilizations',
      DETERMINE_COVERAGE: 'coverageDeterminations',
      OVERRIDE_COVERAGE_DETERMINATION:
        'coverageDeterminations',
      REVERSE_COVERAGE_DETERMINATION:
        'coverageDeterminations',
      APPLY_PPC_REFUND_EFFECTS: 'coverageOperationalHistories',
    };

    const collectionName = collectionByType[transactionType];

    if (collectionName === undefined || context === undefined) {
      return false;
    }

    const identifiers = Object.values(context).filter(
      (value): value is string =>
        typeof value === 'string' &&
        /^[a-f\d]{24}$/iu.test(value),
    );

    if (identifiers.length === 0) {
      return false;
    }

    return (
      await this.database
        .collection(collectionName)
        .findOne({
          $or: identifiers.map((identifier) => ({
            _id: toObjectId(identifier),
          })),
        })
    ) !== null;
  }
}

export class PanelsPackagesCoverageBackgroundJobs {
  private interval: NodeJS.Timeout | null = null;
  private running = false;

  public constructor(
    private readonly dependencies: Readonly<{
      recovery: PanelsPackagesCoverageRecoveryService;
      jobRunner: BackgroundJobRunner;
      reports: PanelsPackagesCoverageReportService;
      intervalMilliseconds?: number;
    }>,
  ) {
    this.dependencies.jobRunner.register(
      'PPC_REPORT_EXPORT',
      async (job: LeasedBackgroundJob) => {
        const payload = job.payload as Readonly<{
          actorUserId: string;
          correlationId: string;
          report:
            | 'package-utilization'
            | 'coverage-utilization'
            | 'benefit-balances';
          query: PpcReportQuery;
        }>;

        await this.dependencies.reports.generateQueuedExport({
          facilityId: job.facilityId,
          actorUserId: payload.actorUserId,
          correlationId: payload.correlationId,
          report: payload.report,
          query: payload.query,
        });
      },
    );
  }

  public start(): void {
    if (this.interval !== null) {
      return;
    }

    this.interval = setInterval(
      () => {
        void this.runOnce();
      },
      this.dependencies.intervalMilliseconds ?? 60_000,
    );

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
      await this.dependencies.recovery.expireEligibility(new Date());

      for (let processed = 0; processed < 25; processed += 1) {
        const found = await this.dependencies.jobRunner.runOnce(
          `ppc-background:${process.pid}`,
        );

        if (!found) {
          break;
        }
      }
    } finally {
      this.running = false;
    }
  }
}