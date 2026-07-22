import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import Decimal from 'decimal.js';
import mongoose from 'mongoose';

import type { Db } from '@hospital-mis/database';
import {
  createObjectId,
  decimal128ToString,
  toObjectId,
} from '@hospital-mis/database';
import {
  AppError,
  ConflictError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import type { AuditRepository } from '../modules/audit/audit.repository.js';
import type {
  AssistanceAttachmentInput,
  EligibilityEvaluationContext,
  EligibilityScalar,
} from '../modules/welfare-zakat/welfare-zakat.contracts.js';
import {
  AssistanceFinancialReconciliationError,
  AssistanceMakerCheckerViolationError,
} from '../modules/welfare-zakat/welfare-zakat.errors.js';
import type {
  WelfareZakatAttachmentPort,
  WelfareZakatAuditPort,
  WelfareZakatClockPort,
  WelfareZakatEligibilityContextPort,
  WelfareZakatEncryptionPort,
  WelfareZakatFinancialApprovalPort,
  WelfareZakatNumberSequencePort,
  WelfareZakatOutboxPort,
  WelfareZakatPatientContextPort,
  WelfareZakatTransactionContext,
  WelfareZakatTransactionManagerPort,
} from '../modules/welfare-zakat/welfare-zakat.ports.js';
import type {
  AssistanceApplicationRecord,
  AssistanceFundRecord,
} from '../modules/welfare-zakat/welfare-zakat.persistence.types.js';
import type { ApplicationTransactionRepository } from './application-transaction.js';
import type { IdempotencyService } from './idempotency.service.js';
import type { OperationLockService } from './operation-lock.service.js';
import type { OutboxService } from './outbox.service.js';
import type { SequenceService } from './sequence.service.js';
import type { SensitiveSettingCryptoService } from './sensitive-setting-crypto.service.js';

const transactionStorage =
  new AsyncLocalStorage<WelfareZakatTransactionContext>();

export function currentWelfareZakatTransactionContext(): WelfareZakatTransactionContext {
  const context = transactionStorage.getStore();
  if (context === undefined) {
    throw new Error('Welfare and Zakat transaction context is unavailable');
  }
  return context;
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'code' in error && error.code === 11000;
}

function safeError(error: unknown): Readonly<{ name: string; message: string }> {
  return {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error
      ? error.message.slice(0, 2_000)
      : 'Unknown Welfare and Zakat transaction failure',
  };
}

function jsonSafe(value: unknown, depth = 0): unknown {
  if (depth > 20) return null;
  if (value == null || typeof value === 'string' || typeof value === 'boolean') {
    return value ?? null;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => jsonSafe(item, depth + 1));
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record['toHexString'] === 'function') {
      return (record['toHexString'] as () => string)();
    }
    if (record['_bsontype'] === 'Decimal128' && typeof record['toString'] === 'function') {
      return (record['toString'] as () => string)();
    }
    if (typeof record['toObject'] === 'function') {
      return jsonSafe((record['toObject'] as () => unknown)(), depth + 1);
    }
    const blocked = new Set([
      'applicantSnapshotEncrypted',
      'householdSnapshotEncrypted',
      'employmentSnapshotEncrypted',
      'financialConditionSnapshotEncrypted',
      'zakatDeclarationSnapshotEncrypted',
      'questionnaireSnapshotEncrypted',
      'requestedServicesSnapshotEncrypted',
      'notesEncrypted',
      'conditionsEncrypted',
      'assessmentEncrypted',
      'findingsEncrypted',
      'restrictionNarrativeEncrypted',
      'donorReferenceHash',
      'donationReferenceHash',
      'fundingSourceReferenceHash',
    ]);
    return Object.fromEntries(
      Object.entries(record)
        .filter(([key]) => !blocked.has(key))
        .map(([key, nested]) => [key, jsonSafe(nested, depth + 1)]),
    );
  }
  return String(value);
}

function money(value: unknown): Decimal {
  if (value == null) return new Decimal(0);
  try {
    return new Decimal(decimal128ToString(value as never));
  } catch {
    return new Decimal(String(value));
  }
}

function objectIdString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'toHexString' in value) {
    return (value as { toHexString(): string }).toHexString();
  }
  return null;
}

function parseEncryptedJson<T>(
  encryption: WelfareZakatEncryptionPort,
  value: string | null,
  fallback: T,
): Promise<T> {
  if (value === null) return Promise.resolve(fallback);
  return encryption.decrypt(value).then((plaintext) => {
    try {
      return JSON.parse(plaintext) as T;
    } catch {
      return fallback;
    }
  });
}

export class MongoWelfareZakatTransactionManagerAdapter
implements WelfareZakatTransactionManagerPort {
  public constructor(
    private readonly database: Db,
    private readonly transactions: ApplicationTransactionRepository,
    private readonly idempotency: IdempotencyService,
    private readonly locks: OperationLockService,
    private readonly outbox: OutboxService,
  ) {}

  public async execute<T>(
    input: Readonly<{
      transactionType: string;
      idempotencyKey: string;
      actorUserId: string;
      facilityId: string;
      correlationId: string;
      lockKeys: readonly string[];
      idempotencyPayload: unknown;
      journalPayload: unknown;
      execute(context: WelfareZakatTransactionContext): Promise<T>;
    }>,
  ): Promise<T> {
    const claim = await this.idempotency.begin({
      facilityId: input.facilityId,
      scope: input.transactionType,
      key: input.idempotencyKey,
      requestPayload: input.idempotencyPayload,
    });
    if (claim.kind === 'REPLAY') return claim.response as T;

    const transactionId = randomUUID();
    await this.transactions.create({
      facilityId: input.facilityId,
      transactionId,
      transactionType: input.transactionType,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      initiatedBy: input.actorUserId,
      contextSnapshot: jsonSafe(input.journalPayload),
      relatedEntities: { module: 'WELFARE_ZAKAT' },
      stepNames: ['MONGODB_WELFARE_ZAKAT_DOMAIN_TRANSACTION'],
    });

    const acquiredLocks = await this.locks.acquireMany({
      facilityId: input.facilityId,
      ownerId: transactionId,
      resources: input.lockKeys.map((resourceKey) => ({
        resourceType: 'WELFARE_ZAKAT',
        resourceKey,
      })),
    });

    const session = await mongoose.startSession();
    let committed = false;
    let result: T | undefined;
    try {
      await this.transactions.setStatus(transactionId, 'IN_PROGRESS');
      await this.transactions.setStepStatus(transactionId, 0, 'EXECUTING');
      await session.withTransaction(async () => {
        const context = { transactionId, session };
        result = await transactionStorage.run(
          context,
          () => input.execute(context),
        );
      });
      committed = true;
      await this.transactions.setStepStatus(transactionId, 0, 'EXECUTED');
      await this.transactions.setStepStatus(transactionId, 0, 'VERIFIED');
      await this.transactions.setStatus(transactionId, 'COMPLETED');
      await this.outbox.releaseTransactionEvents(transactionId);
      if (result === undefined) {
        throw new Error('Welfare and Zakat transaction completed without a result');
      }
      await this.idempotency.complete({
        facilityId: input.facilityId,
        scope: input.transactionType,
        key: input.idempotencyKey,
        ownerId: claim.ownerId,
        response: jsonSafe(result) as never,
      });
      return result;
    } catch (error) {
      if (committed) {
        await this.database.collection('applicationTransactions').updateOne(
          { transactionId },
          {
            $set: {
              status: 'RECOVERY_REQUIRED',
              recoveryStatus: 'WELFARE_ZAKAT_POST_COMMIT_FINALIZATION_PENDING',
              errorDetails: safeError(error),
            },
            $inc: { version: 1 },
            $currentDate: { updatedAt: true },
          },
        );
        throw new AppError({
          code: 'WELFARE_ZAKAT_TRANSACTION_RECOVERY_REQUIRED',
          message:
            'The Welfare and Zakat operation committed and requires finalization recovery',
          statusCode: 500,
          retryable: false,
          cause: error,
        });
      }
      await this.transactions.setStepStatus(
        transactionId,
        0,
        'FAILED',
        safeError(error),
      ).catch(() => undefined);
      await this.transactions.setStatus(
        transactionId,
        'FAILED',
        safeError(error),
      ).catch(() => undefined);
      await this.idempotency.fail({
        facilityId: input.facilityId,
        scope: input.transactionType,
        key: input.idempotencyKey,
        ownerId: claim.ownerId,
        error: safeError(error) as never,
      }).catch(() => undefined);
      throw error;
    } finally {
      await session.endSession().catch(() => undefined);
      await this.locks.releaseMany(acquiredLocks);
    }
  }
}

export class SystemWelfareZakatClock implements WelfareZakatClockPort {
  public now(): Date {
    return new Date();
  }
}

export class MongoWelfareZakatNumberSequenceAdapter
implements WelfareZakatNumberSequencePort {
  public constructor(private readonly sequences: SequenceService) {}

  public next(
    input: Parameters<WelfareZakatNumberSequencePort['next']>[0],
  ): Promise<string> {
    const definitions: Readonly<
      Record<string, Readonly<{ prefix: string; key: string }>>
    > = {
      ASSISTANCE_APPLICATION_NUMBER: { prefix: 'WZA', key: 'welfare-zakat.application' },
      FUND_TRANSACTION_NUMBER: { prefix: 'WZT', key: 'welfare-zakat.fund-transaction' },
      ASSISTANCE_APPROVAL_NUMBER: { prefix: 'WZP', key: 'welfare-zakat.approval' },
      ASSISTANCE_ALLOCATION_NUMBER: { prefix: 'WZL', key: 'welfare-zakat.allocation' },
      FUND_TRANSFER_NUMBER: { prefix: 'WZX', key: 'welfare-zakat.transfer' },
    };
    const definition = definitions[input.sequenceKey];
    if (definition === undefined) {
      throw new ConflictError(
        `Unsupported Welfare and Zakat sequence ${input.sequenceKey}`,
      );
    }
    return this.sequences.formatted({
      facilityId: input.facilityId,
      key: definition.key,
      prefix: definition.prefix,
      width: 8,
      year: input.effectiveAt.getUTCFullYear(),
    });
  }
}

export class WelfareZakatSensitiveEncryptionAdapter
implements WelfareZakatEncryptionPort {
  private readonly associatedData = 'welfare-zakat:sensitive-snapshot';

  public constructor(private readonly crypto: SensitiveSettingCryptoService) {}

  public async encrypt(value: string): Promise<string> {
    const protectedValue = this.crypto.protect(value, this.associatedData);
    return JSON.stringify(protectedValue.encryptedValue);
  }

  public async decrypt(value: string): Promise<string> {
    return this.crypto.unprotect<string>(
      JSON.parse(value) as Parameters<SensitiveSettingCryptoService['unprotect']>[0],
      this.associatedData,
    );
  }
}

export class MongoWelfareZakatAttachmentAdapter
implements WelfareZakatAttachmentPort {
  public constructor(private readonly database: Db) {}

  public assertAttachmentsUsable(
    input: Readonly<{
      facilityId: string;
      actorUserId: string;
      attachments: readonly AssistanceAttachmentInput[];
    }>,
  ): Promise<void> {
    return this.assertAttachmentIdsUsable({
      facilityId: input.facilityId,
      actorUserId: input.actorUserId,
      attachmentIds: input.attachments.map((item) => item.attachmentId),
    });
  }

  public async assertAttachmentIdsUsable(
    input: Parameters<WelfareZakatAttachmentPort['assertAttachmentIdsUsable']>[0],
  ): Promise<void> {
    const ids = [...new Set(input.attachmentIds)];
    if (ids.length === 0) return;
    const records = await this.database.collection('attachments').find({
      _id: { $in: ids.map((id) => toObjectId(id, 'attachmentId')) },
      facilityId: toObjectId(input.facilityId, 'facilityId'),
      $and: [
        { $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] },
        { $or: [{ malwareScanStatus: 'CLEAN' }, { malwareScanStatus: { $exists: false } }] },
        { $or: [{ status: { $in: ['AVAILABLE', 'ACTIVE'] } }, { status: { $exists: false } }] },
      ],
    }).project({ _id: 1 }).toArray();
    if (records.length !== ids.length) {
      throw new ConflictError(
        'One or more assistance attachments are missing, unsafe, deleted, or outside the active facility',
      );
    }
  }
}

export class MongoWelfareZakatAuditAdapter implements WelfareZakatAuditPort {
  public constructor(
    private readonly database: Db,
    private readonly auditRepository?: AuditRepository,
  ) {}

  public async record(
    input: Parameters<WelfareZakatAuditPort['record']>[0],
  ): Promise<void> {
    const now = new Date();
    try {
      await this.database.collection('auditLogs').insertOne({
        _id: createObjectId(),
        facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
        eventId: [
          input.transactionId,
          input.action,
          input.entityType,
          input.entityId,
        ].join(':'),
        actorId: toObjectId(input.actor.userId, 'actorUserId'),
        action: input.action,
        module: 'WELFARE_ZAKAT',
        entityType: input.entityType,
        entityId: input.entityId,
        ...(input.reason === null ? {} : { reason: input.reason }),
        beforeSnapshot: jsonSafe(input.before),
        afterSnapshot: jsonSafe(input.after),
        metadata: { actorStaffId: input.actor.staffId },
        outcome: 'SUCCESS',
        sensitivity: 'HIGHLY_SENSITIVE',
        correlationId: input.actor.correlationId,
        transactionId: input.transactionId,
        requestSource: 'API',
        ...(input.actor.ipAddress === undefined ? {} : { ipAddress: input.actor.ipAddress }),
        ...(input.actor.userAgent === undefined ? {} : { userAgent: input.actor.userAgent }),
        occurredAt: now,
        schemaVersion: 1,
        version: 0,
        createdAt: now,
        updatedAt: now,
      }, { session: input.session });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
    void this.auditRepository;
  }
}

export class MongoWelfareZakatOutboxAdapter implements WelfareZakatOutboxPort {
  public constructor(private readonly database: Db) {}

  public async enqueue(
    input: Parameters<WelfareZakatOutboxPort['enqueue']>[0],
  ): Promise<void> {
    const now = new Date();
    await this.database.collection('outboxEvents').insertOne({
      _id: createObjectId(),
      facilityId: toObjectId(input.facilityId, 'facilityId'),
      eventId: randomUUID(),
      transactionId: input.transactionId,
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      payload: jsonSafe(input.payload),
      status: 'BLOCKED',
      availableAt: now,
      attemptCount: 0,
      schemaVersion: 1,
      version: 0,
      createdAt: now,
      updatedAt: now,
    }, { session: input.session });
  }
}

export class MongoWelfareZakatFinancialApprovalAdapter
implements WelfareZakatFinancialApprovalPort {
  public constructor(private readonly database: Db) {}

  public async assertApproved(
    input: Parameters<WelfareZakatFinancialApprovalPort['assertApproved']>[0],
  ): Promise<void> {
    if (input.makerUserId === input.checkerUserId) {
      throw new AssistanceMakerCheckerViolationError();
    }
    const makerUserId = toObjectId(input.makerUserId, 'makerUserId');
    const checkerUserId = toObjectId(input.checkerUserId, 'checkerUserId');
    const approval = await this.database.collection('financialApprovalRequests').findOne({
      _id: toObjectId(input.approvalRequestId, 'approvalRequestId'),
      facilityId: toObjectId(input.facilityId, 'facilityId'),
      status: 'APPROVED',
      $and: [
        { $or: [{ requestedBy: makerUserId }, { requestedByUserId: makerUserId }] },
        { $or: [{ decidedBy: checkerUserId }, { decidedByUserId: checkerUserId }] },
        { $or: [{ entityId: toObjectId(input.entityId, 'entityId') }, { entityId: { $exists: false } }] },
        { $or: [{ action: input.action }, { action: { $exists: false } }] },
        { $or: [{ makerCheckerSatisfied: true }, { makerCheckerSatisfied: { $exists: false } }] },
        { $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }] },
      ],
    }, { session: input.session });
    if (approval === null) throw new AssistanceMakerCheckerViolationError();
    const approvedAmount = approval['approvedAmount'] ?? approval['amount'];
    if (
      approvedAmount !== undefined &&
      money(approvedAmount).lessThan(money(input.amount))
    ) {
      throw new AssistanceFinancialReconciliationError(
        'The independent approval amount is below the requested financial operation',
      );
    }
  }
}

export class MongoWelfareZakatPatientContextAdapter
implements WelfareZakatPatientContextPort {
  public constructor(private readonly database: Db) {}

  public async loadApplicationContext(
    input: Parameters<WelfareZakatPatientContextPort['loadApplicationContext']>[0],
  ): ReturnType<WelfareZakatPatientContextPort['loadApplicationContext']> {
    const facilityId = toObjectId(input.facilityId, 'facilityId');
    const patientId = toObjectId(input.patientId, 'patientId');
    const patient = await this.database.collection('patients').findOne(
      { _id: patientId, facilityId },
      { session: input.session },
    );
    if (patient === null) throw new ResourceNotFoundError('Patient was not found');

    const birthDateValue = patient['dateOfBirth'] ?? patient['birthDate'];
    const birthDate = birthDateValue instanceof Date ? birthDateValue : null;
    const ageYears = birthDate === null
      ? null
      : Math.max(
          0,
          Math.floor(
            (Date.now() - birthDate.getTime()) / (365.2425 * 24 * 60 * 60 * 1_000),
          ),
        );
    const guardianRequired =
      patient['isMinor'] === true || (ageYears !== null && ageYears < 18);
    const guardianId = input.guardianId == null
      ? null
      : toObjectId(input.guardianId, 'guardianId');
    const guardian = guardianId === null
      ? null
      : await this.database.collection('guardians').findOne(
          { _id: guardianId, facilityId, status: { $ne: 'MERGED' } },
          { session: input.session },
        );

    const encounterId = input.encounterId == null
      ? null
      : toObjectId(input.encounterId, 'encounterId');
    const encounter = encounterId === null
      ? null
      : await this.database.collection('encounters').findOne(
          { _id: encounterId, facilityId, patientId },
          { session: input.session },
        );
    if (encounterId !== null && encounter === null) {
      throw new ResourceNotFoundError('Encounter was not found for this patient');
    }

    const admissionId = input.admissionId == null
      ? null
      : toObjectId(input.admissionId, 'admissionId');
    const admission = admissionId === null
      ? null
      : await this.database.collection('admissions').findOne(
          { _id: admissionId, facilityId, patientId },
          { session: input.session },
        );
    if (admissionId !== null && admission === null) {
      throw new ResourceNotFoundError('Admission was not found for this patient');
    }

    if (input.invoiceId != null) {
      const invoice = await this.database.collection('invoices').findOne(
        {
          _id: toObjectId(input.invoiceId, 'invoiceId'),
          facilityId,
          patientId,
        },
        { session: input.session },
      );
      if (invoice === null) throw new ResourceNotFoundError('Invoice was not found for this patient');
    }
    if (input.claimId != null) {
      const claim = await this.database.collection('claims').findOne(
        {
          _id: toObjectId(input.claimId, 'claimId'),
          facilityId,
          patientId,
        },
        { session: input.session },
      );
      if (claim === null) throw new ResourceNotFoundError('Claim was not found for this patient');
    }

    const diagnosisDocuments = encounterId === null
      ? []
      : await this.database.collection('encounterDiagnoses').find({
          facilityId,
          encounterId,
        }, { session: input.session }).toArray();

    return {
      patientId: input.patientId,
      patientStatus: String(patient['status'] ?? 'ACTIVE'),
      patientCategoryCode:
        typeof patient['patientCategoryCode'] === 'string'
          ? patient['patientCategoryCode']
          : null,
      ageYears,
      guardianId: objectIdString(guardian?._id),
      guardianRequired,
      guardianValid: !guardianRequired || guardian !== null,
      encounterId: objectIdString(encounter?._id),
      admissionId: objectIdString(admission?._id),
      departmentId:
        objectIdString(encounter?.['departmentId']) ??
        objectIdString(admission?.['departmentId']) ??
        objectIdString(admission?.['wardId']),
      diagnosisCodes: diagnosisDocuments
        .map((item) => item['diagnosisCode'] ?? item['code'])
        .filter((value): value is string => typeof value === 'string'),
    };
  }

  public async assertRecordAccess(
    input: Parameters<WelfareZakatPatientContextPort['assertRecordAccess']>[0],
  ): Promise<void> {
    const exists = await this.database.collection('patients').findOne(
      {
        _id: toObjectId(input.patientId, 'patientId'),
        facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
        status: { $ne: 'MERGED' },
      },
      { projection: { _id: 1 }, session: input.session },
    );
    if (exists === null) {
      throw new ResourceNotFoundError(
        'The patient is unavailable in the active facility',
      );
    }
  }
}

export class MongoWelfareZakatEligibilityContextAdapter
implements WelfareZakatEligibilityContextPort {
  public constructor(
    private readonly database: Db,
    private readonly encryption: WelfareZakatEncryptionPort,
  ) {}

  public async build(
    input: Parameters<WelfareZakatEligibilityContextPort['build']>[0],
  ): Promise<EligibilityEvaluationContext> {
    const facilityId = toObjectId(input.actor.facilityId, 'facilityId');
    const patientId = input.application.patientId;
    const [employment, zakatDeclaration, questionnaire, patient, reviews] =
      await Promise.all([
        parseEncryptedJson<Record<string, unknown>>(
          this.encryption,
          input.application.employmentSnapshotEncrypted,
          {},
        ),
        parseEncryptedJson<Record<string, unknown>>(
          this.encryption,
          input.application.zakatDeclarationSnapshotEncrypted,
          {},
        ),
        parseEncryptedJson<Record<string, EligibilityScalar | readonly EligibilityScalar[]>>(
          this.encryption,
          input.application.questionnaireSnapshotEncrypted,
          {},
        ),
        this.database.collection('patients').findOne(
          { _id: patientId, facilityId },
          { session: input.session },
        ),
        this.database.collection('assistanceReviews').find({
          facilityId,
          applicationId: input.application._id,
        }, { session: input.session }).toArray(),
      ]);
    if (patient === null) throw new ResourceNotFoundError('Patient was not found');

    const invoice = input.application.invoiceId === null
      ? null
      : await this.database.collection('invoices').findOne(
          { _id: input.application.invoiceId, facilityId, patientId },
          { session: input.session },
        );
    const invoiceLines = input.application.invoiceId === null
      ? []
      : await this.database.collection('invoiceLines').find({
          facilityId,
          invoiceId: input.application.invoiceId,
        }, { session: input.session }).sort({ lineNumber: 1 }).limit(1).toArray();
    const firstLine = invoiceLines[0];

    const context = await new MongoWelfareZakatPatientContextAdapter(
      this.database,
    ).loadApplicationContext({
      facilityId: input.actor.facilityId,
      patientId: patientId.toHexString(),
      guardianId: input.application.guardianId?.toHexString() ?? null,
      encounterId: input.application.encounterId?.toHexString() ?? null,
      admissionId: input.application.admissionId?.toHexString() ?? null,
      invoiceId: input.application.invoiceId?.toHexString() ?? null,
      claimId: input.application.claimId?.toHexString() ?? null,
      session: input.session,
    });

    const allocations = await this.database.collection('invoiceFundAllocations').find({
      facilityId,
      patientId,
      fundId: input.fund._id,
      status: { $in: ['CONFIRMED', 'UTILIZED', 'PARTIALLY_REVERSED'] },
    }, { session: input.session }).toArray();
    const lifetimeUtilization = allocations.reduce(
      (total, allocation) => total
        .plus(money(allocation['utilizedAmount']))
        .minus(money(allocation['reversedAmount']))
        .minus(money(allocation['refundedAmount']))
        .minus(money(allocation['repaidAmount']))
        .minus(money(allocation['recoveredAmount'])),
      new Decimal(0),
    );
    const yearStart = new Date(Date.UTC(input.asOf.getUTCFullYear(), 0, 1));
    const currentPeriodUtilization = allocations
      .filter((allocation) =>
        allocation['allocatedAt'] instanceof Date &&
        allocation['allocatedAt'] >= yearStart &&
        allocation['allocatedAt'] <= input.asOf)
      .reduce(
        (total, allocation) => total
          .plus(money(allocation['utilizedAmount']))
          .minus(money(allocation['reversedAmount']))
          .minus(money(allocation['refundedAmount']))
          .minus(money(allocation['repaidAmount']))
          .minus(money(allocation['recoveredAmount'])),
        new Decimal(0),
      );

    return {
      patientId: patientId.toHexString(),
      patientCategoryCode: context.patientCategoryCode,
      ageYears: context.ageYears,
      guardianPresent: context.guardianId !== null,
      householdSize: input.application.householdSize,
      dependants: input.application.dependantCount,
      monthlyHouseholdIncome:
        decimal128ToString(input.application.monthlyHouseholdIncome),
      monthlyHouseholdExpenses:
        decimal128ToString(input.application.monthlyHouseholdExpenses),
      monthlyDisposableIncome:
        decimal128ToString(input.application.monthlyDisposableIncome),
      perCapitaIncome: decimal128ToString(input.application.perCapitaIncome),
      employmentStatus:
        typeof employment['employmentStatus'] === 'string'
          ? employment['employmentStatus']
          : null,
      zakatDeclaredEligible:
        typeof zakatDeclaration['declaresEligible'] === 'boolean'
          ? zakatDeclaration['declaresEligible']
          : null,
      socialWelfareAssessmentCompleted: reviews.some(
        (review) => review['reviewType'] === 'SOCIAL_WELFARE',
      ),
      clinicalReviewCompleted: reviews.some(
        (review) => review['reviewType'] === 'CLINICAL',
      ),
      departmentId:
        context.departmentId ?? objectIdString(firstLine?.['departmentId']),
      serviceCategory:
        typeof firstLine?.['serviceCategory'] === 'string'
          ? firstLine['serviceCategory'] as EligibilityEvaluationContext['serviceCategory']
          : null,
      serviceCode:
        typeof firstLine?.['serviceCodeSnapshot'] === 'string'
          ? firstLine['serviceCodeSnapshot']
          : null,
      diagnosisCodes: context.diagnosisCodes,
      invoiceAmount: money(invoice?.['netAmount']).toFixed(2),
      patientResponsibilityAmount: money(
        invoice?.['patientAmount'] ?? invoice?.['patientResponsibilityAmount'],
      ).toFixed(2),
      currentPeriodUtilization: currentPeriodUtilization.toFixed(2),
      lifetimeUtilization: lifetimeUtilization.toFixed(2),
      attributes: {
        ...questionnaire,
        patientStatus: String(patient['status'] ?? 'ACTIVE'),
        financialYearCode: input.application.financialYearCode,
      },
    };
  }

  public async calculateLimitRemaining(
    input: Parameters<WelfareZakatEligibilityContextPort['calculateLimitRemaining']>[0],
  ): ReturnType<WelfareZakatEligibilityContextPort['calculateLimitRemaining']> {
    const facilityId = toObjectId(input.facilityId, 'facilityId');
    const fundId = toObjectId(input.fundId, 'fundId');
    const patientId = toObjectId(input.patientId, 'patientId');
    const fund = await this.database.collection('assistanceFunds').findOne(
      { _id: fundId, facilityId },
      { session: input.session },
    );
    if (fund === null) throw new ResourceNotFoundError('Assistance fund was not found');

    const allocations = await this.database.collection('invoiceFundAllocations').find({
      facilityId,
      fundId,
      patientId,
      status: { $nin: ['CANCELLED', 'EXPIRED'] },
    }, { session: input.session }).toArray();

    const net = (allocation: Record<string, unknown>): Decimal => money(
      allocation['utilizedAmount'] ?? allocation['amount'],
    )
      .minus(money(allocation['reversedAmount']))
      .minus(money(allocation['refundedAmount']))
      .minus(money(allocation['repaidAmount']))
      .minus(money(allocation['recoveredAmount']));

    const yearStart = new Date(Date.UTC(input.asOf.getUTCFullYear(), 0, 1));
    const periodUsed = allocations
      .filter((allocation) =>
        !(allocation['allocatedAt'] instanceof Date) ||
        allocation['allocatedAt'] >= yearStart)
      .reduce((total, allocation) => total.plus(net(allocation)), new Decimal(0));
    const lifetimeUsed = allocations.reduce(
      (total, allocation) => total.plus(net(allocation)),
      new Decimal(0),
    );
    const invoiceUsed = input.invoiceId == null
      ? new Decimal(0)
      : allocations
          .filter((allocation) =>
            objectIdString(allocation['invoiceId']) === input.invoiceId)
          .reduce((total, allocation) => total.plus(net(allocation)), new Decimal(0));
    const serviceUsed = allocations.reduce((total, allocation) => {
      const lines = Array.isArray(allocation['lines'])
        ? allocation['lines'] as readonly Record<string, unknown>[]
        : [];
      return total.plus(lines.reduce((lineTotal, line) => {
        if (
          input.invoiceLineId != null &&
          objectIdString(line['invoiceLineId']) !== input.invoiceLineId
        ) return lineTotal;
        return lineTotal
          .plus(money(line['utilizedAmount'] ?? line['amount']))
          .minus(money(line['reversedAmount']))
          .minus(money(line['refundedAmount']))
          .minus(money(line['repaidAmount']))
          .minus(money(line['recoveredAmount']));
      }, new Decimal(0)));
    }, new Decimal(0));

    const limits = Array.isArray(fund['limits'])
      ? fund['limits'] as readonly Record<string, unknown>[]
      : [];
    const remainingFor = (
      scopes: readonly string[],
      used: Decimal,
    ): string | null => {
      const matching = limits.filter((limit) => {
        if (!scopes.includes(String(limit['scope']))) return false;
        if (
          limit['serviceCategory'] != null &&
          input.serviceCategory != null &&
          limit['serviceCategory'] !== input.serviceCategory
        ) return false;
        if (
          limit['serviceCode'] != null &&
          input.serviceCode != null &&
          limit['serviceCode'] !== input.serviceCode
        ) return false;
        return true;
      });
      if (matching.length === 0) return null;
      return Decimal.min(
        ...matching.map((limit) =>
          Decimal.max(0, money(limit['amount']).minus(used))),
      ).toFixed(2);
    };

    return {
      patientPeriodRemainingAmount: remainingFor(
        ['PER_PATIENT_PERIOD', 'FINANCIAL_YEAR'],
        periodUsed,
      ),
      patientLifetimeRemainingAmount: remainingFor(
        ['PER_PATIENT_LIFETIME', 'LIFETIME'],
        lifetimeUsed,
      ),
      perInvoiceRemainingAmount: remainingFor(['PER_INVOICE'], invoiceUsed),
      perServiceRemainingAmount: remainingFor(['PER_SERVICE'], serviceUsed),
    };
  }
}