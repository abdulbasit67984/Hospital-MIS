import Decimal from 'decimal.js';

import {
  AssistanceReservationModel,
  decimal128ToString,
  toObjectId,
} from '@hospital-mis/database';

import type { AssistanceReservationRepositoryPort } from '../welfare-zakat.ports.js';
import type {
  AssistanceReservationRecord,
  WelfareZakatMongoSession,
} from '../welfare-zakat.persistence.types.js';
import {
  throwMappedWelfareZakatPersistenceError,
  welfareZakatDecimal,
  welfareZakatObjectId,
  welfareZakatRecord,
  withWelfareZakatSession,
} from './welfare-zakat-repository.support.js';

function money(value: Decimal.Value): string {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

export class MongoAssistanceReservationRepository
implements AssistanceReservationRepositoryPort {
  public async create(
    input: Parameters<AssistanceReservationRepositoryPort['create']>[0],
  ): Promise<AssistanceReservationRecord> {
    try {
      const now = new Date();
      const [created] = await AssistanceReservationModel.create(
        [{
          facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
          transactionId: input.transaction.transactionId,
          correlationId: input.actor.correlationId,
          schemaVersion: 1,
          version: 0,
          createdBy: toObjectId(input.actor.userId, 'createdBy'),
          updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
          operationKey: input.operationKey,
          applicationId: toObjectId(input.applicationId, 'applicationId'),
          approvalId: toObjectId(input.approvalId, 'approvalId'),
          fundId: toObjectId(input.fundId, 'fundId'),
          patientId: toObjectId(input.patientId, 'patientId'),
          patientAccountId: toObjectId(input.patientAccountId, 'patientAccountId'),
          invoiceId: toObjectId(input.invoiceId, 'invoiceId'),
          status: 'ACTIVE',
          reservedAmount: welfareZakatDecimal(input.amount),
          consumedAmount: welfareZakatDecimal('0.00'),
          releasedAmount: welfareZakatDecimal('0.00'),
          remainingAmount: welfareZakatDecimal(input.amount),
          priority: input.priority,
          expiresAt: input.expiresAt,
          reservedAt: now,
          reservedBy: toObjectId(input.actor.userId, 'reservedBy'),
          releasedAt: null,
          releasedBy: null,
          releaseReason: null,
        }],
        { session: input.transaction.session },
      );
      return welfareZakatRecord<AssistanceReservationRecord>(created!.toObject());
    } catch (error) {
      throwMappedWelfareZakatPersistenceError(error);
    }
  }

  public async findById(
    facilityId: string,
    reservationId: string,
    session?: WelfareZakatMongoSession,
  ): Promise<AssistanceReservationRecord | null> {
    return welfareZakatRecord<AssistanceReservationRecord | null>(
      await withWelfareZakatSession(
        AssistanceReservationModel.findOne({
          _id: welfareZakatObjectId(reservationId, 'reservationId'),
          facilityId: welfareZakatObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async consume(
    input: Parameters<AssistanceReservationRepositoryPort['consume']>[0],
  ): Promise<AssistanceReservationRecord | null> {
    const current = await this.findById(
      input.actor.facilityId,
      input.reservationId,
      input.transaction.session,
    );
    if (current === null || current.version !== input.expectedVersion) {
      return null;
    }
    if (!['ACTIVE', 'PARTIALLY_CONSUMED'].includes(current.status)) {
      return null;
    }

    const amount = new Decimal(input.amount);
    const remaining = new Decimal(decimal128ToString(current.remainingAmount));
    if (!amount.isPositive() || amount.greaterThan(remaining)) {
      return null;
    }
    const nextRemaining = remaining.minus(amount);
    const nextConsumed = new Decimal(
      decimal128ToString(current.consumedAmount),
    ).plus(amount);

    const updated = await AssistanceReservationModel.findOneAndUpdate(
      {
        _id: current._id,
        facilityId: current.facilityId,
        version: input.expectedVersion,
        status: current.status,
      },
      {
        $set: {
          status: nextRemaining.isZero() ? 'CONSUMED' : 'PARTIALLY_CONSUMED',
          consumedAmount: welfareZakatDecimal(money(nextConsumed)),
          remainingAmount: welfareZakatDecimal(money(nextRemaining)),
          updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
          transactionId: input.transaction.transactionId,
          correlationId: input.actor.correlationId,
          updatedAt: input.consumedAt,
        },
        $inc: { version: 1 },
      },
      {
        session: input.transaction.session,
        returnDocument: 'after',
        runValidators: true,
      },
    ).lean().exec();

    return welfareZakatRecord<AssistanceReservationRecord | null>(updated);
  }

  public async release(
    input: Parameters<AssistanceReservationRepositoryPort['release']>[0],
  ): Promise<AssistanceReservationRecord | null> {
    const current = await this.findById(
      input.actor.facilityId,
      input.reservationId,
      input.transaction.session,
    );
    if (current === null || current.version !== input.expectedVersion) {
      return null;
    }
    if (!['ACTIVE', 'PARTIALLY_CONSUMED'].includes(current.status)) {
      return null;
    }

    const amount = new Decimal(input.amount);
    const remaining = new Decimal(decimal128ToString(current.remainingAmount));
    if (!amount.isPositive() || amount.greaterThan(remaining)) {
      return null;
    }
    const nextRemaining = remaining.minus(amount);
    const nextReleased = new Decimal(
      decimal128ToString(current.releasedAmount),
    ).plus(amount);
    const terminal = nextRemaining.isZero();

    const updated = await AssistanceReservationModel.findOneAndUpdate(
      {
        _id: current._id,
        facilityId: current.facilityId,
        version: input.expectedVersion,
        status: current.status,
      },
      {
        $set: {
          status: terminal ? input.status : current.status,
          releasedAmount: welfareZakatDecimal(money(nextReleased)),
          remainingAmount: welfareZakatDecimal(money(nextRemaining)),
          releasedAt: terminal ? input.releasedAt : null,
          releasedBy: terminal
            ? toObjectId(input.actor.userId, 'releasedBy')
            : null,
          releaseReason: terminal ? input.reason : null,
          updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
          transactionId: input.transaction.transactionId,
          correlationId: input.actor.correlationId,
          updatedAt: input.releasedAt,
        },
        $inc: { version: 1 },
      },
      {
        session: input.transaction.session,
        returnDocument: 'after',
        runValidators: true,
      },
    ).lean().exec();

    return welfareZakatRecord<AssistanceReservationRecord | null>(updated);
  }

  public async listExpired(
    facilityId: string,
    now: Date,
    limit: number,
  ): Promise<readonly AssistanceReservationRecord[]> {
    return welfareZakatRecord<readonly AssistanceReservationRecord[]>(
      await AssistanceReservationModel.find({
        facilityId: welfareZakatObjectId(facilityId, 'facilityId'),
        status: { $in: ['ACTIVE', 'PARTIALLY_CONSUMED'] },
        expiresAt: { $lte: now },
      })
        .sort({ expiresAt: 1, _id: 1 })
        .limit(Math.max(1, Math.min(limit, 500)))
        .lean()
        .exec(),
    );
  }
}