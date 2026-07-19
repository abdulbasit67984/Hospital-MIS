import {
  randomUUID,
} from 'node:crypto';

import type {
  DatabaseObjectId,
  Db,
} from '@hospital-mis/database';

import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  RadiologyTransactionCompensation,
} from '../modules/radiology/radiology.ports.js';

import type {
  RadiologyCompensationExecutor,
} from '../modules/radiology/radiology-compensation.executor.js';

import type {
  IdempotencyService,
} from './idempotency.service.js';

import type {
  OutboxService,
} from './outbox.service.js';

interface PersistedCompensation
  extends RadiologyTransactionCompensation
{
  status:
    | 'PENDING'
    | 'COMPENSATING'
    | 'COMPENSATED'
    | 'FAILED';

  registeredAt:
    Date;

  completedAt?:
    | Date
    | null;

  error?:
    | Record<
        string,
        string
      >
    | null;
}

interface RecoveryTransaction {
  facilityId:
    DatabaseObjectId;

  transactionId:
    string;

  idempotencyKey:
    string;

  transactionType:
    string;

  status:
    string;

  recoveryStatus?:
    string;

  updatedAt:
    Date;

  radiologyDomainCompletedAt?:
    Date;

  radiologyResultEnvelope?:
    unknown;

  radiologyIdempotencyOwnerId?:
    string;

  radiologyCompensations?:
    PersistedCompensation[];

  radiologyRecoveryLeaseOwner?:
    string;

  radiologyRecoveryLeaseToken?:
    string;

  radiologyRecoveryLeaseExpiresAt?:
    Date;

  retryCount:
    number;

  completionTimestamp?:
    Date;

  errorDetails?:
    unknown;

  version:
    number;
}

function safeError(
  error:
    unknown,
): Record<
  string,
  string
> {
  return {
    name:
      error instanceof
      Error
        ? error.name
        : typeof error,

    message:
      error instanceof
      Error
        ? error.message.slice(
            0,
            1_500,
          )
        : 'Unknown Radiology recovery error',
  };
}

export interface RadiologyRecoveryServiceOptions {
  database:
    Db;

  compensationExecutor:
    RadiologyCompensationExecutor;

  outbox:
    OutboxService;

  idempotency:
    IdempotencyService;

  leaseMilliseconds?:
    number;
}

export class RadiologyRecoveryService {
  private readonly leaseMilliseconds:
    number;

  public constructor(
    private readonly options:
      RadiologyRecoveryServiceOptions,
  ) {
    this.leaseMilliseconds =
      options.leaseMilliseconds ??
      60_000;

    if (
      !Number.isSafeInteger(
        this.leaseMilliseconds,
      ) ||
      this.leaseMilliseconds <=
        0
    ) {
      throw new TypeError(
        'Radiology recovery lease must be a positive safe integer',
      );
    }
  }

  public async markStaleTransactions(
    staleBefore:
      Date,
  ): Promise<number> {
    const result =
      await this.options.database
        .collection<RecoveryTransaction>(
          'applicationTransactions',
        )
        .updateMany(
          {
            transactionType: {
              $regex:
                /^RADIOLOGY_/u,
            },

            status: {
              $in: [
                'PENDING',
                'IN_PROGRESS',
                'COMPENSATING',
              ],
            },

            updatedAt: {
              $lt:
                staleBefore,
            },
          },
          {
            $set: {
              status:
                'RECOVERY_REQUIRED',

              recoveryStatus:
                'PENDING',
            },

            $inc: {
              retryCount:
                1,

              version:
                1,
            },

            $currentDate: {
              updatedAt:
                true,
            },
          },
        );

    return result.modifiedCount;
  }

  public async recoverAvailable(
    input: {
      workerId:
        string;

      maxTransactions:
        number;

      now:
        Date;
    },
  ): Promise<{
    recovered: number;
    failed: number;
  }> {
    const maximum =
      Math.max(
        1,
        Math.min(
          input.maxTransactions,
          100,
        ),
      );

    let recovered =
      0;

    let failed =
      0;

    for (
      let index =
        0;

      index <
      maximum;

      index +=
        1
    ) {
      const transaction =
        await this.leaseNext(
          input.workerId,
          input.now,
        );

      if (
        transaction ===
        null
      ) {
        break;
      }

      try {
        await this.recoverTransaction(
          transaction,
        );

        recovered +=
          1;
      } catch (
        error
      ) {
        failed +=
          1;

        await this.options.database
          .collection<RecoveryTransaction>(
            'applicationTransactions',
          )
          .updateOne(
            {
              transactionId:
                transaction.transactionId,

              radiologyRecoveryLeaseToken:
                transaction.radiologyRecoveryLeaseToken,
            },
            {
              $set: {
                recoveryStatus:
                  'FAILED',

                errorDetails: {
                  recoveryError:
                    safeError(
                      error,
                    ),
                },
              },

              $inc: {
                version:
                  1,
              },

              $unset: {
                radiologyRecoveryLeaseOwner:
                  '',

                radiologyRecoveryLeaseToken:
                  '',

                radiologyRecoveryLeaseExpiresAt:
                  '',
              },

              $currentDate: {
                updatedAt:
                  true,
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

  private async leaseNext(
    workerId:
      string,

    now:
      Date,
  ): Promise<
    | RecoveryTransaction
    | null
  > {
    const leaseToken =
      randomUUID();

    const leaseExpiresAt =
      new Date(
        now.getTime() +
          this.leaseMilliseconds,
      );

    return this.options.database
      .collection<RecoveryTransaction>(
        'applicationTransactions',
      )
      .findOneAndUpdate(
        {
          transactionType: {
            $regex:
              /^RADIOLOGY_/u,
          },

          status:
            'RECOVERY_REQUIRED',

          recoveryStatus: {
            $in: [
              'PENDING',
              'FAILED',
            ],
          },

          $or: [
            {
              radiologyRecoveryLeaseExpiresAt:
                {
                  $exists:
                    false,
                },
            },
            {
              radiologyRecoveryLeaseExpiresAt:
                {
                  $lte:
                    now,
                },
            },
          ],
        },
        {
          $set: {
            recoveryStatus:
              'IN_PROGRESS',

            radiologyRecoveryLeaseOwner:
              workerId,

            radiologyRecoveryLeaseToken:
              leaseToken,

            radiologyRecoveryLeaseExpiresAt:
              leaseExpiresAt,
          },

          $inc: {
            version:
              1,
          },

          $currentDate: {
            updatedAt:
              true,
          },
        },
        {
          sort: {
            updatedAt:
              1,
          },

          returnDocument:
            'after',
        },
      );
  }

  private async recoverTransaction(
    transaction:
      RecoveryTransaction,
  ): Promise<void> {
    if (
      transaction.radiologyDomainCompletedAt !==
      undefined
    ) {
      if (
        transaction.radiologyIdempotencyOwnerId ===
          undefined ||
        transaction.radiologyResultEnvelope ===
          undefined
      ) {
        throw new Error(
          'Completed Radiology transaction is missing encrypted idempotency recovery data',
        );
      }

      await this.options.idempotency.complete(
        {
          facilityId:
            transaction.facilityId.toHexString(),

          scope:
            transaction.transactionType,

          key:
            transaction.idempotencyKey,

          ownerId:
            transaction.radiologyIdempotencyOwnerId,

          response:
            transaction.radiologyResultEnvelope as never,
        },
      );

      await this.options.database
        .collection<RecoveryTransaction>(
          'applicationTransactions',
        )
        .updateOne(
          {
            transactionId:
              transaction.transactionId,

            radiologyRecoveryLeaseToken:
              transaction.radiologyRecoveryLeaseToken,
          },
          {
            $set: {
              status:
                'COMPLETED',

              recoveryStatus:
                'COMPLETED',

              completionTimestamp:
                new Date(),
            },

            $unset: {
              radiologyRecoveryLeaseOwner:
                '',

              radiologyRecoveryLeaseToken:
                '',

              radiologyRecoveryLeaseExpiresAt:
                '',
            },

            $inc: {
              version:
                1,
            },

            $currentDate: {
              updatedAt:
                true,
            },
          },
        );

      await this.options.outbox.releaseTransactionEvents(
        transaction.transactionId,
      );

      return;
    }

    const compensations = [
      ...(
        transaction.radiologyCompensations ??
        []
      ),
    ].reverse();

    for (
      const compensation of
      compensations
    ) {
      if (
        compensation.status ===
        'COMPENSATED'
      ) {
        continue;
      }

      await this.setCompensationStatus(
        transaction.transactionId,
        compensation.key,
        'COMPENSATING',
      );

      try {
        await this.options.compensationExecutor.execute(
          compensation,
        );

        await this.setCompensationStatus(
          transaction.transactionId,
          compensation.key,
          'COMPENSATED',
        );
      } catch (
        error
      ) {
        await this.setCompensationStatus(
          transaction.transactionId,
          compensation.key,
          'FAILED',
          safeError(
            error,
          ),
        );

        throw error;
      }
    }

    if (
      transaction.radiologyIdempotencyOwnerId !==
      undefined
    ) {
      await this.options.idempotency.fail(
        {
          facilityId:
            transaction.facilityId.toHexString(),

          scope:
            transaction.transactionType,

          key:
            transaction.idempotencyKey,

          ownerId:
            transaction.radiologyIdempotencyOwnerId,

          error: {
            name:
              'RadiologyRecoveryCompensated',

            message:
              'Radiology transaction was compensated during recovery',
          },
        },
      );
    }

    await this.options.database
      .collection<RecoveryTransaction>(
        'applicationTransactions',
      )
      .updateOne(
        {
          transactionId:
            transaction.transactionId,

          radiologyRecoveryLeaseToken:
            transaction.radiologyRecoveryLeaseToken,
        },
        {
          $set: {
            status:
              'COMPENSATED',

            recoveryStatus:
              'COMPLETED',

            completionTimestamp:
              new Date(),
          },

          $unset: {
            radiologyRecoveryLeaseOwner:
              '',

            radiologyRecoveryLeaseToken:
              '',

            radiologyRecoveryLeaseExpiresAt:
              '',
          },

          $inc: {
            version:
              1,
          },

          $currentDate: {
            updatedAt:
              true,
          },
        },
      );
  }

  private async setCompensationStatus(
    transactionId:
      string,

    key:
      string,

    status:
      PersistedCompensation['status'],

    error?:
      Record<
        string,
        string
      >,
  ): Promise<void> {
    await this.options.database
      .collection<RecoveryTransaction>(
        'applicationTransactions',
      )
      .updateOne(
        {
          transactionId,

          'radiologyCompensations.key':
            key,
        },
        {
          $set: {
            'radiologyCompensations.$[item].status':
              status,

            'radiologyCompensations.$[item].completedAt':
              status ===
              'COMPENSATED'
                ? new Date()
                : null,

            'radiologyCompensations.$[item].error':
              error ??
              null,
          },

          $inc: {
            version:
              1,
          },

          $currentDate: {
            updatedAt:
              true,
          },
        },
        {
          arrayFilters: [
            {
              'item.key':
                key,
            },
          ],
        },
      );
  }
}

export type RadiologyReconciliationIssueCode =
  | 'ORDER_ITEM_REPORT_MISSING'
  | 'REPORT_VERSION_MISSING'
  | 'REPORT_VERSION_NUMBER_MISMATCH'
  | 'PUBLISHED_REPORT_HAS_UNRESOLVED_CRITICAL_FINDINGS'
  | 'STUDY_BINARY_STORAGE_FLAG_INVALID'
  | 'STUDY_ORDER_ITEM_MISMATCH'
  | 'ACTIVE_RESERVATION_WITHOUT_APPOINTMENT';

export interface RadiologyReconciliationIssue {
  code:
    RadiologyReconciliationIssueCode;

  entityType:
    string;

  entityId:
    string;

  details:
    Record<
      string,
      unknown
    >;
}

export class RadiologyReconciliationService {
  public constructor(
    private readonly database:
      Db,
  ) {}

  public async runFacility(
    facilityId:
      string,

    maximumIssues =
      500,
  ): Promise<{
    checkedAt: Date;
    issueCount: number;
    truncated: boolean;
    issues: RadiologyReconciliationIssue[];
  }> {
    const facilityObjectId =
      toObjectId(
        facilityId,
        'facilityId',
      );

    const limit =
      Math.max(
        1,
        Math.min(
          maximumIssues,
          5_000,
        ),
      );

    const issues:
      RadiologyReconciliationIssue[] =
        [];

    const push = (
      issue:
        RadiologyReconciliationIssue,
    ): void => {
      if (
        issues.length <
        limit
      ) {
        issues.push(
          issue,
        );
      }
    };

    const orphanedReportItems =
      await this.database
        .collection(
          'radiologyOrderItems',
        )
        .aggregate([
          {
            $match: {
              facilityId:
                facilityObjectId,

              reportId: {
                $type:
                  'objectId',
              },
            },
          },
          {
            $lookup: {
              from:
                'radiologyReports',

              localField:
                'reportId',

              foreignField:
                '_id',

              as:
                'report',
            },
          },
          {
            $match: {
              report: {
                $size:
                  0,
              },
            },
          },
          {
            $limit:
              limit,
          },
        ])
        .toArray();

    for (
      const item of
      orphanedReportItems
    ) {
      push({
        code:
          'ORDER_ITEM_REPORT_MISSING',

        entityType:
          'RadiologyOrderItem',

        entityId:
          String(
            item['_id'],
          ),

        details: {
          reportId:
            String(
              item['reportId'],
            ),
        },
      });
    }

    const reports =
      await this.database
        .collection(
          'radiologyReports',
        )
        .find({
          facilityId:
            facilityObjectId,

          currentVersion: {
            $gt:
              0,
          },
        })
        .project({
          _id:
            1,

          latestVersionId:
            1,

          currentVersion:
            1,

          publicationStatus:
            1,

          unresolvedCriticalFindingCount:
            1,
        })
        .limit(
          limit,
        )
        .toArray();

    for (
      const report of
      reports
    ) {
      const version =
        await this.database
          .collection(
            'radiologyReportVersions',
          )
          .findOne(
            {
              _id:
                report[
                  'latestVersionId'
                ],

              facilityId:
                facilityObjectId,

              radiologyReportId:
                report[
                  '_id'
                ],
            },
            {
              projection: {
                versionNumber:
                  1,
              },
            },
          );

      if (
        version ===
        null
      ) {
        push({
          code:
            'REPORT_VERSION_MISSING',

          entityType:
            'RadiologyReport',

          entityId:
            String(
              report[
                '_id'
              ],
            ),

          details: {
            latestVersionId:
              String(
                report[
                  'latestVersionId'
                ],
              ),
          },
        });
      } else if (
        version[
          'versionNumber'
        ] !==
        report[
          'currentVersion'
        ]
      ) {
        push({
          code:
            'REPORT_VERSION_NUMBER_MISMATCH',

          entityType:
            'RadiologyReport',

          entityId:
            String(
              report[
                '_id'
              ],
            ),

          details: {
            reportVersion:
              report[
                'currentVersion'
              ],

            immutableVersion:
              version[
                'versionNumber'
              ],
          },
        });
      }

      if (
        report[
          'publicationStatus'
        ] ===
          'PUBLISHED' &&
        Number(
          report[
            'unresolvedCriticalFindingCount'
          ],
        ) >
          0
      ) {
        push({
          code:
            'PUBLISHED_REPORT_HAS_UNRESOLVED_CRITICAL_FINDINGS',

          entityType:
            'RadiologyReport',

          entityId:
            String(
              report[
                '_id'
              ],
            ),

          details: {
            unresolvedCriticalFindingCount:
              report[
                'unresolvedCriticalFindingCount'
              ],
          },
        });
      }
    }

    const invalidStudies =
      await this.database
        .collection(
          'radiologyImagingStudies',
        )
        .find({
          facilityId:
            facilityObjectId,

          binaryStorageProhibited: {
            $ne:
              true,
          },
        })
        .project({
          _id:
            1,

          radiologyOrderItemId:
            1,
        })
        .limit(
          limit,
        )
        .toArray();

    for (
      const study of
      invalidStudies
    ) {
      push({
        code:
          'STUDY_BINARY_STORAGE_FLAG_INVALID',

        entityType:
          'RadiologyImagingStudy',

        entityId:
          String(
            study[
              '_id'
            ],
          ),

        details: {
          orderItemId:
            String(
              study[
                'radiologyOrderItemId'
              ],
            ),
        },
      });
    }

    const mismatchedStudies =
      await this.database
        .collection(
          'radiologyImagingStudies',
        )
        .aggregate([
          {
            $match: {
              facilityId:
                facilityObjectId,
            },
          },
          {
            $lookup: {
              from:
                'radiologyOrderItems',

              localField:
                'radiologyOrderItemId',

              foreignField:
                '_id',

              as:
                'item',
            },
          },
          {
            $unwind:
              '$item',
          },
          {
            $match: {
              $expr: {
                $or: [
                  {
                    $ne: [
                      '$patientId',
                      '$item.patientId',
                    ],
                  },
                  {
                    $ne: [
                      '$encounterId',
                      '$item.encounterId',
                    ],
                  },
                ],
              },
            },
          },
          {
            $limit:
              limit,
          },
        ])
        .toArray();

    for (
      const study of
      mismatchedStudies
    ) {
      push({
        code:
          'STUDY_ORDER_ITEM_MISMATCH',

        entityType:
          'RadiologyImagingStudy',

        entityId:
          String(
            study[
              '_id'
            ],
          ),

        details: {
          orderItemId:
            String(
              study[
                'radiologyOrderItemId'
              ],
            ),
        },
      });
    }

    const orphanedReservations =
      await this.database
        .collection(
          'radiologyResourceReservations',
        )
        .aggregate([
          {
            $match: {
              facilityId:
                facilityObjectId,

              status:
                'ACTIVE',
            },
          },
          {
            $lookup: {
              from:
                'radiologyAppointments',

              localField:
                'appointmentId',

              foreignField:
                '_id',

              as:
                'appointment',
            },
          },
          {
            $match: {
              appointment: {
                $size:
                  0,
              },
            },
          },
          {
            $limit:
              limit,
          },
        ])
        .toArray();

    for (
      const reservation of
      orphanedReservations
    ) {
      push({
        code:
          'ACTIVE_RESERVATION_WITHOUT_APPOINTMENT',

        entityType:
          'RadiologyResourceReservation',

        entityId:
          String(
            reservation[
              '_id'
            ],
          ),

        details: {
          appointmentId:
            String(
              reservation[
                'appointmentId'
              ],
            ),
        },
      });
    }

    return {
      checkedAt:
        new Date(),

      issueCount:
        issues.length,

      truncated:
        issues.length >=
        limit,

      issues,
    };
  }
}