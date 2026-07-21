import {
  PaymentIntentModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  RecoverableInfrastructure,
} from '../../../infrastructure/recovery-loop.js';

import type {
  PaymentCashierActorContext,
} from '../payments-cashier-shifts.contracts.js';

import type {
  PaymentCashierAccessPolicyPort,
  PaymentCashierRealtimePort,
} from '../payments-cashier-shifts.ports.js';

import {
  PAYMENT_CASHIER_REALTIME_EVENTS,
} from '../payments-cashier-shifts.operations.js';

export interface PaymentRecoveryResult {
  expiredPaymentIntents: number;
  markedStaleTransactions: number;
  recoveredTransactions: number;
  failedRecoveries: number;
}

export interface PaymentRecoveryServiceDependencies {
  accessPolicy: PaymentCashierAccessPolicyPort;
  recovery: RecoverableInfrastructure;
  realtime: PaymentCashierRealtimePort;
  clock: Readonly<{ now(): Date }>;
}

export class PaymentRecoveryService {
  public constructor(
    private readonly dependencies: PaymentRecoveryServiceDependencies,
  ) {}

  public async run(
    actor: PaymentCashierActorContext,
    limit = 100,
  ): Promise<PaymentRecoveryResult> {
    this.dependencies.accessPolicy.require({
      actor,
      action: 'RECOVERY_MANAGE',
      resourceFacilityId: actor.facilityId,
    });

    const now = this.dependencies.clock.now();
    const expiredPaymentIntents = await this.expirePaymentIntents(
      now,
      limit,
      actor.facilityId,
    );

    const markedStaleTransactions = await this.dependencies.recovery.markStaleTransactions(
      new Date(now.getTime() - 5 * 60_000),
    );

    const recovered = await this.dependencies.recovery.recoverAvailable({
      workerId: `manual-payments-recovery:${actor.userId}`,
      maxTransactions: Math.max(1, Math.min(limit, 500)),
      now,
    });

    return {
      expiredPaymentIntents,
      markedStaleTransactions,
      recoveredTransactions: recovered.recovered,
      failedRecoveries: recovered.failed,
    };
  }

  public async expirePaymentIntents(
    now: Date,
    limit = 500,
    facilityIdValue?: string,
  ): Promise<number> {
    const filter = {
      ...(facilityIdValue === undefined
        ? {}
        : {
            facilityId: toObjectId(facilityIdValue, 'facilityId'),
          }),
      status: {
        $in: ['PENDING', 'AUTHORIZED'],
      },
      expiresAt: {
        $lte: now,
      },
    } as const;

    const candidates = await PaymentIntentModel.find(filter)
      .select('_id facilityId cashCounterId cashShiftId')
      .sort({ expiresAt: 1, _id: 1 })
      .limit(Math.max(1, Math.min(limit, 2_000)))
      .lean()
      .exec();

    let expired = 0;

    for (const candidate of candidates) {
      const updated = await PaymentIntentModel.updateOne(
        {
          _id: candidate._id,
          status: {
            $in: ['PENDING', 'AUTHORIZED'],
          },
          expiresAt: {
            $lte: now,
          },
        },
        {
          $set: {
            status: 'EXPIRED',
            failureCode: 'INTENT_EXPIRED',
            failureMessage: 'Payment intent expired before completion',
            updatedAt: now,
          },
          $inc: {
            version: 1,
          },
        },
      ).exec();

      if (updated.modifiedCount !== 1) {
        continue;
      }

      expired += 1;

      await this.dependencies.realtime.publishMinimumNecessary({
        facilityId: candidate.facilityId.toHexString(),
        eventType: PAYMENT_CASHIER_REALTIME_EVENTS.PAYMENT_INTENT_CHANGED,
        entityId: candidate._id.toHexString(),
        counterId: candidate.cashCounterId?.toHexString() ?? null,
        shiftId: candidate.cashShiftId?.toHexString() ?? null,
        status: 'EXPIRED',
        occurredAt: now.toISOString(),
      });
    }

    return expired;
  }
}