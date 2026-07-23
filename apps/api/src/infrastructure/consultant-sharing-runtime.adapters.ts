import { randomUUID } from 'node:crypto';

import Decimal from 'decimal.js';
import mongoose from 'mongoose';

import type { Db } from '@hospital-mis/database';
import {
  createObjectId,
  decimal128ToString,
  toObjectId,
} from '@hospital-mis/database';

import type { AuditRepository } from '../modules/audit/audit.repository.js';
import type {
  ConsultantPaymentExecutionGateway,
} from '../modules/consultant-sharing/integrations/consultant-financial-posting.adapter.js';
import type {
  ConsultantSharingActorIdentityResolver,
} from '../modules/consultant-sharing/consultant-sharing.http-contracts.js';
import type {
  ConsultantSharingActorContext,
} from '../modules/consultant-sharing/consultant-sharing.contracts.js';
import type {
  ConsultantApprovalPort,
  ConsultantAttachmentPort,
  ConsultantAuditPort,
  ConsultantClockPort,
  ConsultantEncryptionPort,
  ConsultantIdempotencyPort,
  ConsultantIdentityResolutionPort,
  ConsultantOperationLockPort,
  ConsultantOutboxPort,
  ConsultantPeriodCapPort,
  ConsultantSequencePort,
  ConsultantSharingTransactionContext,
  ConsultantSharingTransactionManagerPort,
} from '../modules/consultant-sharing/consultant-sharing.ports.js';
import type { IdempotencyService } from './idempotency.service.js';
import type { OperationLockService } from './operation-lock.service.js';
import type { SequenceService } from './sequence.service.js';
import type { SensitiveSettingCryptoService } from './sensitive-setting-crypto.service.js';

function jsonSafe(value: unknown): any {
  if (value === undefined) return null;
  const serialized = JSON.stringify(value, (_key, candidate) =>
    candidate instanceof Date
      ? candidate.toISOString()
      : typeof candidate === 'bigint'
        ? candidate.toString()
        : candidate,
  );
  return serialized === undefined ? null : JSON.parse(serialized) as unknown;
}

function objectIdString(value: unknown): string | null {
  if (
    typeof value === 'object'
    && value !== null
    && 'toHexString' in value
    && typeof value.toHexString === 'function'
  ) {
    return (value as { toHexString(): string }).toHexString();
  }
  return typeof value === 'string' && /^[a-f\d]{24}$/iu.test(value)
    ? value
    : null;
}

export class MongoConsultantSharingTransactionManagerAdapter
implements ConsultantSharingTransactionManagerPort {
  public async withTransaction<T>(
    operation: (
      transaction: ConsultantSharingTransactionContext,
    ) => Promise<T>,
  ): Promise<T> {
    const session = await mongoose.startSession();
    try {
      let result: T | undefined;
      await session.withTransaction(async () => {
        result = await operation({
          session,
          transactionId: randomUUID(),
          startedAt: new Date(),
        });
      });
      if (result === undefined) {
        throw new Error(
          'Consultant Sharing transaction completed without a result',
        );
      }
      return result;
    } finally {
      await session.endSession();
    }
  }
}

export class OperationalConsultantIdempotencyAdapter
implements ConsultantIdempotencyPort {
  public constructor(private readonly service: IdempotencyService) {}

  public async execute<T>(
    input: Readonly<{
      scope: string;
      actor: ConsultantSharingActorContext;
      idempotencyKey: string;
      requestHash: string;
      operation: () => Promise<T>;
    }>,
  ): Promise<T> {
    const claim = await this.service.begin({
      facilityId: input.actor.facilityId,
      scope: input.scope,
      key: input.idempotencyKey,
      requestPayload: { hash: input.requestHash },
    });
    if (claim.kind === 'REPLAY') return claim.response as T;
    try {
      const result = await input.operation();
      await this.service.complete({
        facilityId: input.actor.facilityId,
        scope: input.scope,
        key: input.idempotencyKey,
        ownerId: claim.ownerId,
        response: jsonSafe(result),
      });
      return result;
    } catch (error) {
      await this.service.fail({
        facilityId: input.actor.facilityId,
        scope: input.scope,
        key: input.idempotencyKey,
        ownerId: claim.ownerId,
        error: jsonSafe({
          message: error instanceof Error ? error.message : 'Unknown error',
        }),
      }).catch(() => undefined);
      throw error;
    }
  }
}

export class OperationalConsultantLockAdapter
implements ConsultantOperationLockPort {
  public constructor(private readonly locks: OperationLockService) {}

  public async withLock<T>(
    input: Readonly<{
      lockKey: string;
      ownerId: string;
      ttlMs: number;
      operation: () => Promise<T>;
    }>,
  ): Promise<T> {
    const facilityId = input.lockKey.match(/[a-f\d]{24}/iu)?.[0];
    if (facilityId === undefined) {
      throw new Error(
        'Consultant Sharing lock key must include a facility identifier',
      );
    }
    const lock = await this.locks.acquire({
      facilityId,
      resourceType: 'CONSULTANT_SHARING',
      resourceKey: input.lockKey,
      ownerId: input.ownerId,
      leaseMilliseconds: input.ttlMs,
    });
    try {
      return await input.operation();
    } finally {
      await this.locks.release(lock);
    }
  }
}

export class SystemConsultantClock implements ConsultantClockPort {
  public now(): Date {
    return new Date();
  }
}

export class OperationalConsultantSequenceAdapter
implements ConsultantSequencePort {
  public constructor(private readonly sequences: SequenceService) {}

  public async next(
    input: Parameters<ConsultantSequencePort['next']>[0],
  ): Promise<string> {
    const prefixes: Readonly<Record<string, string>> = {
      CONSULTANT_AGREEMENT_NUMBER: 'CAG',
      CONSULTANT_SETTLEMENT_NUMBER: 'CST',
      CONSULTANT_DISPUTE_NUMBER: 'CDP',
      CONSULTANT_ADJUSTMENT_NUMBER: 'CAD',
      CONSULTANT_REVERSAL_NUMBER: 'CRV',
      CONSULTANT_PAYOUT_NUMBER: 'CPY',
      CONSULTANT_PAYOUT_REVERSAL_NUMBER: 'CPR',
    };
    return this.sequences.formatted({
      facilityId: input.facilityId,
      key: `consultant-sharing.${input.sequenceKey.toLowerCase()}`,
      prefix: prefixes[input.sequenceKey] ?? 'CSH',
      year: input.occurredAt.getUTCFullYear(),
    });
  }
}

export class ConsultantSensitiveEncryptionAdapter
implements ConsultantEncryptionPort {
  private readonly aad = 'consultant-sharing:sensitive';

  public constructor(private readonly crypto: SensitiveSettingCryptoService) {}

  public async encrypt(value: string): Promise<string> {
    return JSON.stringify(this.crypto.protect(value, this.aad).encryptedValue);
  }

  public async decrypt(value: string): Promise<string> {
    return this.crypto.unprotect<string>(JSON.parse(value), this.aad);
  }
}

export class MongoConsultantAttachmentAdapter
implements ConsultantAttachmentPort {
  public constructor(private readonly database: Db) {}

  public async assertAttachmentIdsUsable(
    input: Parameters<ConsultantAttachmentPort['assertAttachmentIdsUsable']>[0],
  ): Promise<void> {
    if (input.attachmentIds.length === 0) return;
    const count = await this.database.collection('attachments').countDocuments({
      _id: {
        $in: input.attachmentIds.map((value) =>
          toObjectId(value, 'attachmentId'),
        ),
      },
      facilityId: toObjectId(input.facilityId, 'facilityId'),
      status: { $nin: ['DELETED', 'QUARANTINED'] },
    });
    if (count !== input.attachmentIds.length) {
      throw new Error(
        'One or more Consultant Sharing attachments are unavailable',
      );
    }
  }
}

export class MongoConsultantIdentityAdapter
implements ConsultantIdentityResolutionPort {
  public constructor(private readonly database: Db) {}

  public async resolveConsultant(
    input: Parameters<ConsultantIdentityResolutionPort['resolveConsultant']>[0],
  ) {
    const consultantId = toObjectId(input.consultantId, 'consultantId');
    const facilityId = toObjectId(input.facilityId, 'facilityId');
    const staff = await this.database.collection<Record<string, unknown>>('staff')
      .findOne({ _id: consultantId, facilityId });
    if (staff === null) return null;
    const user = await this.database.collection<Record<string, unknown>>('users')
      .findOne({ staffId: consultantId, facilityId });
    const departmentIds = Array.isArray(staff['departmentIds'])
      ? staff['departmentIds']
        .map(objectIdString)
        .filter((value): value is string => value !== null)
      : [];
    return {
      consultantId: input.consultantId,
      staffId: input.consultantId,
      userId: objectIdString(user?.['_id']) ?? null,
      consultantGroupId: null,
      departmentIds,
      active: staff['status'] === 'ACTIVE' || staff['isActive'] === true,
    };
  }
}

export class MongoConsultantActorIdentityResolver
implements ConsultantSharingActorIdentityResolver {
  public constructor(private readonly database: Db) {}

  public async resolve(input: Readonly<{ facilityId: string; userId: string }>) {
    const facilityId = toObjectId(input.facilityId, 'facilityId');
    const userId = toObjectId(input.userId, 'userId');
    const user = await this.database.collection<Record<string, unknown>>('users')
      .findOne(
        { _id: userId, facilityId },
        { projection: { staffId: 1 } },
      );
    const now = new Date();
    const assignments = await this.database
      .collection<Record<string, unknown>>('userRoles')
      .find({
        userId,
        isActive: true,
        $and: [
          { $or: [{ facilityId: null }, { facilityId }] },
          { $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }] },
        ],
      }, { projection: { roleId: 1 } })
      .toArray();
    const roleIds = assignments
      .map((record) => objectIdString(record['roleId']))
      .filter((value): value is string => value !== null)
      .map((value) => toObjectId(value, 'roleId'));
    const roles = roleIds.length === 0
      ? []
      : await this.database.collection<Record<string, unknown>>('roles')
        .find({
          _id: { $in: roleIds },
          isActive: true,
          $or: [
            { scope: 'GLOBAL', facilityId: null },
            { scope: 'FACILITY', facilityId },
          ],
        }, { projection: { code: 1 } })
        .toArray();
    return {
      staffId: objectIdString(user?.['staffId']),
      roleKeys: roles
        .map((role) => String(role['code'] ?? '').trim().toUpperCase())
        .filter((code) => code.length > 0),
    };
  }
}

export class MongoConsultantApprovalAdapter implements ConsultantApprovalPort {
  public constructor(private readonly database: Db) {}

  public async requireApproved(
    input: Parameters<ConsultantApprovalPort['requireApproved']>[0],
  ): Promise<void> {
    const actorUserId = toObjectId(input.actor.userId, 'actorUserId');
    const makerUserId = toObjectId(input.makerUserId, 'makerUserId');
    if (actorUserId.equals(makerUserId)) {
      throw new Error('Maker-checker separation is required');
    }
    const approval = await this.database
      .collection<Record<string, unknown>>('financialApprovalRequests')
      .findOne({
        _id: toObjectId(input.approvalRequestId, 'approvalRequestId'),
        facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
        status: 'APPROVED',
        $and: [
          { $or: [{ requestedBy: makerUserId }, { requestedByUserId: makerUserId }] },
          { $or: [{ decidedBy: actorUserId }, { decidedByUserId: actorUserId }] },
          { $or: [{ entityId: toObjectId(input.entityId, 'entityId') }, { entityId: { $exists: false } }] },
          { $or: [{ action: input.action }, { action: { $exists: false } }] },
          { $or: [{ makerCheckerSatisfied: true }, { makerCheckerSatisfied: { $exists: false } }] },
          { $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }] },
        ],
      }, { session: input.transaction.session });
    if (approval === null) {
      throw new Error(
        'An independently approved financial approval request is required',
      );
    }
    if (input.amount !== undefined) {
      const approvedAmount = approval['approvedAmount'] ?? approval['amount'];
      if (
        approvedAmount !== undefined
        && new Decimal(decimal128ToString(approvedAmount as never))
          .lessThan(new Decimal(input.amount))
      ) {
        throw new Error('The approval amount is below the requested amount');
      }
    }
  }
}

export class MongoConsultantAuditAdapter implements ConsultantAuditPort {
  public constructor(
    private readonly database: Db,
    private readonly auditRepository?: AuditRepository,
  ) {}

  public async record(
    input: Parameters<ConsultantAuditPort['record']>[0],
  ): Promise<void> {
    const now = new Date();
    const eventId = input.transaction === undefined
      ? randomUUID()
      : [
          input.transaction.transactionId,
          input.action,
          input.entityType,
          input.entityId,
        ].join(':');
    try {
      const document = {
        _id: createObjectId(),
        facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
        eventId,
        actorId: toObjectId(input.actor.userId, 'actorUserId'),
        actorRoleCodes: input.actor.roleKeys,
        action: input.action,
        module: 'CONSULTANT_SHARING',
        entityType: input.entityType,
        entityId: input.entityId,
        beforeSnapshot: jsonSafe(input.before),
        afterSnapshot: jsonSafe(input.after),
        metadata: { actorStaffId: input.actor.staffId },
        ...(input.reason === undefined ? {} : { reason: input.reason }),
        outcome: 'SUCCESS',
        sensitivity: 'HIGHLY_SENSITIVE',
        correlationId: input.actor.correlationId,
        ...(input.transaction === undefined
          ? {}
          : { transactionId: input.transaction.transactionId }),
        requestSource: 'API',
        ...(input.actor.ipAddress === undefined
          ? {}
          : { ipAddress: input.actor.ipAddress }),
        ...(input.actor.userAgent === undefined
          ? {}
          : { userAgent: input.actor.userAgent }),
        occurredAt: now,
        schemaVersion: 1,
        version: 0,
        createdAt: now,
        updatedAt: now,
      };
      const collection = this.database.collection('auditLogs');
      if (input.transaction === undefined) {
        await collection.insertOne(document);
      } else {
        await collection.insertOne(document, { session: input.transaction.session });
      }
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
    void this.auditRepository;
  }
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 11000;
}

const aggregateCollections: Readonly<Record<string, string>> = {
  ConsultantAgreement: 'consultantAgreements',
  ConsultantAgreementRule: 'consultantAgreementRules',
  ConsultantRevenueEntry: 'consultantRevenueEntries',
  ConsultantRevenueAdjustment: 'consultantRevenueAdjustments',
  ConsultantRevenueReversal: 'consultantRevenueReversals',
  ConsultantSettlement: 'consultantSettlements',
  ConsultantSettlementPayment: 'consultantSettlementPayments',
  ConsultantDispute: 'consultantDisputes',
  ConsultantWorkItem: 'consultantWorkItems',
};

export class OperationalConsultantOutboxAdapter
implements ConsultantOutboxPort {
  public constructor(private readonly database: Db) {}

  public async publish(
    input: Parameters<ConsultantOutboxPort['publish']>[0],
  ): Promise<void> {
    const collectionName = aggregateCollections[input.aggregateType];
    if (collectionName === undefined) {
      throw new Error(
        `Unsupported Consultant Sharing outbox aggregate ${input.aggregateType}`,
      );
    }
    const aggregate = await this.database
      .collection<Record<string, unknown>>(collectionName)
      .findOne(
        { _id: toObjectId(input.aggregateId, 'aggregateId') },
        {
          projection: { facilityId: 1 },
          session: input.transaction.session,
        },
      );
    const facilityId = objectIdString(aggregate?.['facilityId']);
    if (facilityId === null) {
      throw new Error(
        'Consultant Sharing outbox aggregate is missing its facility scope',
      );
    }
    const now = new Date();
    await this.database.collection('outboxEvents').insertOne({
      _id: createObjectId(),
      facilityId: toObjectId(facilityId, 'facilityId'),
      eventId: randomUUID(),
      transactionId: input.transaction.transactionId,
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      payload: jsonSafe(input.payload),
      status: 'BLOCKED',
      availableAt: input.occurredAt,
      attemptCount: 0,
      schemaVersion: 1,
      version: 0,
      createdAt: now,
      updatedAt: now,
    }, { session: input.transaction.session });
  }
}

export class MongoConsultantPeriodCapAdapter
implements ConsultantPeriodCapPort {
  public constructor(private readonly database: Db) {}

  public async getRemainingCap(
    input: Parameters<ConsultantPeriodCapPort['getRemainingCap']>[0],
  ): Promise<string | null> {
    if (input.configuredPeriodCap === null) return null;
    const records = await this.database
      .collection<Record<string, unknown>>('consultantRevenueEntries')
      .find({
        facilityId: toObjectId(input.facilityId, 'facilityId'),
        consultantId: toObjectId(input.consultantId, 'consultantId'),
        agreementRuleId: toObjectId(input.agreementRuleId, 'agreementRuleId'),
        status: { $in: ['POSTED', 'SETTLED'] },
      }, {
        projection: { consultantShare: 1, entryDirection: 1 },
        session: input.transaction.session,
      })
      .toArray();
    const used = records.reduce((sum, record) => {
      const share = new Decimal(
        decimal128ToString(record['consultantShare'] as never),
      );
      return record['entryDirection'] === 'DEBIT'
        ? sum.minus(share)
        : sum.plus(share);
    }, new Decimal(0));
    return Decimal.max(
      0,
      new Decimal(input.configuredPeriodCap).minus(used),
    ).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  }
}

export class MongoConsultantPayoutExecutionGateway
implements ConsultantPaymentExecutionGateway {
  public constructor(private readonly database: Db) {}

  public async execute(
    input: Parameters<ConsultantPaymentExecutionGateway['execute']>[0],
  ) {
    await this.assertPaymentMethod(
      input.facilityId,
      input.paymentMethodId,
      input.cashierShiftId,
      input.transaction,
    );
    return {
      paymentId: createObjectId().toHexString(),
      status: 'POSTED',
      amount: new Decimal(input.amount)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toFixed(2),
      occurredAt: new Date().toISOString(),
    };
  }

  public async reverse(
    input: Parameters<ConsultantPaymentExecutionGateway['reverse']>[0],
  ) {
    const originalPayment = await this.database
      .collection<Record<string, unknown>>('consultantSettlementPayments')
      .findOne({
        facilityId: toObjectId(input.facilityId, 'facilityId'),
        settlementId: toObjectId(input.settlementId, 'settlementId'),
        paymentId: toObjectId(input.paymentId, 'paymentId'),
        status: 'PAID',
      }, { session: input.transaction.session });
    if (originalPayment === null) {
      throw new Error('The consultant payout is not eligible for reversal');
    }
    return {
      paymentReversalId: createObjectId().toHexString(),
      status: 'REVERSED',
      amount: new Decimal(input.amount)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toFixed(2),
      occurredAt: new Date().toISOString(),
    };
  }

  private async assertPaymentMethod(
    facilityIdValue: string,
    paymentMethodIdValue: string,
    cashierShiftIdValue: string | null,
    transaction: ConsultantSharingTransactionContext,
  ): Promise<void> {
    const now = new Date();
    const method = await this.database
      .collection<Record<string, unknown>>('paymentMethodConfigurations')
      .findOne({
        _id: toObjectId(paymentMethodIdValue, 'paymentMethodId'),
        facilityId: toObjectId(facilityIdValue, 'facilityId'),
        active: true,
        effectiveFrom: { $lte: now },
        $or: [
          { effectiveThrough: null },
          { effectiveThrough: { $exists: false } },
          { effectiveThrough: { $gte: now } },
        ],
        allowedCurrencies: 'PKR',
      }, { session: transaction.session });
    if (method === null) {
      throw new Error(
        'The selected consultant payout method is inactive or unavailable',
      );
    }
    if (method['methodCode'] === 'CASH') {
      if (cashierShiftIdValue === null) {
        throw new Error('Cash consultant payouts require an open cashier shift');
      }
      const shift = await this.database
        .collection('cashierShifts')
        .findOne({
          _id: toObjectId(cashierShiftIdValue, 'cashierShiftId'),
          facilityId: toObjectId(facilityIdValue, 'facilityId'),
          status: 'OPEN',
        }, { session: transaction.session });
      if (shift === null) {
        throw new Error('The cashier shift is not open for consultant payout');
      }
    }
  }
}