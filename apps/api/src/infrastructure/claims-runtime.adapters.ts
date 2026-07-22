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
import { AppError, ConflictError } from '@hospital-mis/shared';

import type { AuditRepository } from '../modules/audit/audit.repository.js';
import {
  ClaimCoverageNotEligibleError,
  ClaimFinancialReconciliationError,
  ClaimInvoiceNotEligibleError,
  ClaimMakerCheckerError,
} from '../modules/claims/claims.errors.js';
import type {
  ClaimAttachmentInput,
} from '../modules/claims/claims.contracts.js';
import type {
  ClaimsApprovalPort,
  ClaimsAttachmentPort,
  ClaimsAuditPort,
  ClaimsAuthoritativeBillingPort,
  ClaimsClockPort,
  ClaimsCoverageUtilizationPort,
  ClaimsEncryptionPort,
  ClaimsNumberSequencePort,
  ClaimsOutboxPort,
  ClaimsTransactionContext,
  ClaimsTransactionManagerPort,
} from '../modules/claims/claims.ports.js';

import type { ApplicationTransactionRepository } from './application-transaction.js';
import type { IdempotencyService } from './idempotency.service.js';
import type { OperationLockService } from './operation-lock.service.js';
import type { OutboxService } from './outbox.service.js';
import type { SequenceService } from './sequence.service.js';
import type { SensitiveSettingCryptoService } from './sensitive-setting-crypto.service.js';

const transactionStorage = new AsyncLocalStorage<ClaimsTransactionContext>();

export function currentClaimsTransactionContext(): ClaimsTransactionContext {
  const context = transactionStorage.getStore();
  if (context === undefined) {
    throw new Error('Claims transaction context is unavailable');
  }
  return context;
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'code' in error && error.code === 11000;
}

function jsonSafe(value: unknown, depth = 0): unknown {
  if (depth > 24) return null;
  if (value == null || typeof value === 'string' || typeof value === 'boolean') {
    return value ?? null;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((entry) => jsonSafe(entry, depth + 1));
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
    return Object.fromEntries(
      Object.entries(record)
        .filter(([key]) => ![
          'policyReference',
          'membershipReference',
          'membershipReferenceEncrypted',
          'employerReference',
          'authorizationReference',
          'diagnoses',
          'internalNoteEncrypted',
          'payerNoteEncrypted',
          'medicalNecessitySummaryEncrypted',
        ].includes(key))
        .map(([key, nested]) => [key, jsonSafe(nested, depth + 1)]),
    );
  }
  return String(value);
}

function safeError(error: unknown): Readonly<{ name: string; message: string }> {
  return {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error
      ? error.message.slice(0, 2_000)
      : 'Unknown claims transaction failure',
  };
}

function objectIdString(value: unknown, field: string): string {
  if (typeof value === 'object' && value !== null && 'toHexString' in value) {
    const converter = (value as { toHexString(): string }).toHexString;
    return converter.call(value);
  }
  if (typeof value === 'string' && value.length > 0) return value;
  throw new ClaimFinancialReconciliationError(`${field} is unavailable`);
}

function nullableObjectIdString(value: unknown): string | null {
  return value == null ? null : objectIdString(value, 'reference');
}

function moneyString(value: unknown): string {
  if (value == null) return '0.00';
  try {
    return new Decimal(decimal128ToString(value as never)).toFixed(2);
  } catch {
    return new Decimal(String(value)).toFixed(2);
  }
}

function serviceCategory(sourceModule: string, categoryCode: string): string {
  const normalized = `${sourceModule}:${categoryCode}`.toUpperCase();
  if (normalized.includes('LAB')) return 'LABORATORY';
  if (normalized.includes('RADIO')) return 'RADIOLOGY';
  if (normalized.includes('PHARM')) return 'PHARMACY';
  if (normalized.includes('BED') || normalized.includes('ROOM')) return 'BED';
  if (normalized.includes('ADMISSION') || normalized.includes('IPD')) return 'ADMISSION';
  if (normalized.includes('SURGER')) return 'SURGERY';
  if (normalized.includes('PROCEDURE')) return 'PROCEDURE';
  if (normalized.includes('CONSULT')) return 'CONSULTATION';
  if (normalized.includes('REGISTRATION')) return 'REGISTRATION';
  if (normalized.includes('PACKAGE')) return 'PACKAGE';
  if (normalized.includes('ENCOUNTER')) return 'ENCOUNTER';
  return 'MISCELLANEOUS';
}

export class MongoClaimsTransactionManagerAdapter
implements ClaimsTransactionManagerPort {
  public constructor(
    private readonly database: Db,
    private readonly transactions: ApplicationTransactionRepository,
    private readonly idempotency: IdempotencyService,
    private readonly locks: OperationLockService,
    private readonly outbox: OutboxService,
  ) {}

  public async execute<T>(
    input: Parameters<ClaimsTransactionManagerPort['execute']>[0],
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
      relatedEntities: { module: 'CLAIMS' },
      stepNames: ['MONGODB_CLAIMS_DOMAIN_TRANSACTION'],
    });

    const acquiredLocks = await this.locks.acquireMany({
      facilityId: input.facilityId,
      ownerId: transactionId,
      resources: input.lockKeys.map((resourceKey) => ({
        resourceType: 'CLAIMS',
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
        result = await transactionStorage.run(context, () => input.execute(context));
      });
      committed = true;
      await this.transactions.setStepStatus(transactionId, 0, 'EXECUTED');
      await this.transactions.setStepStatus(transactionId, 0, 'VERIFIED');
      await this.transactions.setStatus(transactionId, 'COMPLETED');
      await this.outbox.releaseTransactionEvents(transactionId);
      if (result === undefined) {
        throw new Error('Claims transaction completed without a result');
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
              recoveryStatus: 'CLAIMS_POST_COMMIT_FINALIZATION_PENDING',
              errorDetails: safeError(error),
            },
            $inc: { version: 1 },
            $currentDate: { updatedAt: true },
          },
        );
        throw new AppError({
          code: 'CLAIMS_TRANSACTION_RECOVERY_REQUIRED',
          message: 'The claims operation committed and requires finalization recovery',
          statusCode: 500,
          retryable: false,
          cause: error,
        });
      }
      await this.transactions.setStepStatus(transactionId, 0, 'FAILED', safeError(error)).catch(() => undefined);
      await this.transactions.setStatus(transactionId, 'FAILED', safeError(error)).catch(() => undefined);
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

export class SystemClaimsClock implements ClaimsClockPort {
  public now(): Date {
    return new Date();
  }
}

export class MongoClaimsNumberSequenceAdapter implements ClaimsNumberSequencePort {
  public constructor(private readonly sequences: SequenceService) {}

  public next(
    input: Parameters<ClaimsNumberSequencePort['next']>[0],
  ): Promise<string> {
    const definitions: Readonly<Record<string, { prefix: string; key: string }>> = {
      CLAIM_NUMBER: { prefix: 'CLM', key: 'claims.claim' },
      CLAIM_BATCH_NUMBER: { prefix: 'CLB', key: 'claims.batch' },
      CLAIM_APPEAL_NUMBER: { prefix: 'CLA', key: 'claims.appeal' },
      CLAIM_REMITTANCE_NUMBER: { prefix: 'CLR', key: 'claims.remittance' },
    };
    const definition = definitions[input.sequenceKey];
    if (definition === undefined) {
      throw new ConflictError(`Unsupported claims sequence ${input.sequenceKey}`);
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

export class ClaimsSensitiveEncryptionAdapter implements ClaimsEncryptionPort {
  public constructor(private readonly crypto: SensitiveSettingCryptoService) {}

  public async encrypt(value: string): Promise<string> {
    const protectedValue = this.crypto.protect(value, 'claims:sensitive-snapshot');
    return JSON.stringify(protectedValue.encryptedValue);
  }
}

interface AttachmentDocument {
  _id: unknown;
}

export class MongoClaimsAttachmentAdapter implements ClaimsAttachmentPort {
  public constructor(private readonly database: Db) {}

  public async assertAttachmentsUsable(input: Readonly<{
    facilityId: string;
    actorUserId: string;
    attachments: readonly ClaimAttachmentInput[];
  }>): Promise<void> {
    const ids = [...new Set(input.attachments.map((item) => item.attachmentId))];
    if (ids.length === 0) return;
    const records = await this.database.collection<AttachmentDocument>('attachments')
      .find({
        _id: { $in: ids.map((id) => toObjectId(id, 'attachmentId')) },
        facilityId: toObjectId(input.facilityId, 'facilityId'),
        $and: [
          { $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] },
          { $or: [{ malwareScanStatus: 'CLEAN' }, { malwareScanStatus: { $exists: false } }] },
          { $or: [{ status: { $in: ['AVAILABLE', 'ACTIVE'] } }, { status: { $exists: false } }] },
        ],
      })
      .project({ _id: 1 })
      .toArray();
    if (records.length !== ids.length) {
      throw new ConflictError(
        'One or more claim attachments are missing, unsafe, deleted, or outside the active facility',
      );
    }
  }
}


function approvalEntityType(action: string): string {
  if (action === 'CLAIM_BATCH_SUBMISSION') return 'CLAIM_BATCH';
  if (action === 'CLAIM_APPEAL_SUBMISSION') return 'CLAIM_APPEAL';
  if (
    action === 'CLAIM_CANCELLED' ||
    action === 'CLAIM_REVERSED' ||
    action === 'CLAIM_VOIDED'
  ) {
    return 'CLAIM';
  }
  if (action.startsWith('CLAIM_')) return 'CLAIM_ADJUSTMENT';
  return 'CLAIM';
}

export class MongoClaimsApprovalAdapter implements ClaimsApprovalPort {
  public constructor(private readonly database: Db) {}

  public async assertApproved(
    input: Parameters<ClaimsApprovalPort['assertApproved']>[0],
  ): Promise<void> {
    if (input.makerUserId === input.checkerUserId) {
      throw new ClaimMakerCheckerError();
    }
    const makerUserId = toObjectId(input.makerUserId, 'makerUserId');
    const checkerUserId = toObjectId(input.checkerUserId, 'checkerUserId');
    const approval = await this.database.collection('financialApprovalRequests').findOne(
      {
        _id: toObjectId(input.approvalRequestId, 'approvalRequestId'),
        facilityId: toObjectId(input.facilityId, 'facilityId'),
        entityType: approvalEntityType(input.action),
        entityId: toObjectId(input.entityId, 'entityId'),
        status: 'APPROVED',
        $and: [
          {
            $or: [
              { requestedBy: makerUserId },
              { requestedByUserId: makerUserId },
            ],
          },
          {
            $or: [
              { decidedBy: checkerUserId },
              { decidedByUserId: checkerUserId },
            ],
          },
          {
            $or: [
              { makerCheckerSatisfied: true },
              { makerCheckerSatisfied: { $exists: false } },
            ],
          },
          {
            $or: [
              { action: input.action },
              { action: { $exists: false } },
            ],
          },
          {
            $or: [
              { expiresAt: null },
              { expiresAt: { $exists: false } },
              { expiresAt: { $gt: new Date() } },
            ],
          },
        ],
      },
      { session: input.session },
    );
    if (approval === null) {
      throw new ClaimMakerCheckerError();
    }
  }
}

export class MongoClaimsAuditAdapter implements ClaimsAuditPort {
  public constructor(
    private readonly database: Db,
    private readonly auditRepository?: AuditRepository,
  ) {}

  public async record(input: Parameters<ClaimsAuditPort['record']>[0]): Promise<void> {
    const now = new Date();
    try {
      await this.database.collection('auditLogs').insertOne({
        _id: createObjectId(),
        facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
        eventId: [input.transactionId, input.action, input.entityType, input.entityId].join(':'),
        actorId: toObjectId(input.actor.userId, 'actorUserId'),
        action: input.action,
        module: 'CLAIMS',
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

export class MongoClaimsOutboxAdapter implements ClaimsOutboxPort {
  public constructor(private readonly database: Db) {}

  public async enqueue(input: Parameters<ClaimsOutboxPort['enqueue']>[0]): Promise<void> {
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

interface InvoiceDocument {
  _id: unknown;
  patientId: unknown;
  patientAccountId: unknown;
  status: string;
  currency: string;
  finalizedAt?: Date | null;
}

interface InvoiceLineDocument {
  _id: unknown;
  accountChargeId: unknown;
  chargeCatalogItemId: unknown;
  chargeCodeSnapshot: string;
  serviceCodeSnapshot: string;
  categoryCodeSnapshot: string;
  sourceModuleSnapshot: string;
  sourceRecordId?: unknown;
  departmentId?: unknown;
  serviceLineCodeSnapshot?: string | null;
  quantity: unknown;
  lineNumber: number;
}

interface AccountChargeDocument {
  _id: unknown;
  encounterId?: unknown;
  admissionId?: unknown;
  source?: { sourceModule?: string; sourceRecordId?: unknown };
  serviceFrom: Date;
  serviceThrough?: Date | null;
  preauthorizationId?: unknown;
}

interface CoverageAllocationDocument {
  _id?: unknown;
  invoiceLineId: unknown;
  patientCoverageId?: unknown;
  packageEnrollmentId?: unknown;
  grossAmount: unknown;
  packageAmount: unknown;
  deductibleAmount: unknown;
  copaymentAmount: unknown;
  coinsuranceAmount: unknown;
  sponsorAmount: unknown;
  patientAmount: unknown;
  deniedAmount: unknown;
}

interface CoverageDeterminationDocument {
  _id: unknown;
  invoiceId: unknown;
  patientId: unknown;
  status: string;
  coverageIds: readonly unknown[];
  allocations: readonly CoverageAllocationDocument[];
}

interface PatientCoverageDocument {
  _id: unknown;
  patientId: unknown;
  panelPlanId: unknown;
  status: string;
  policyReference?: string | null;
  membershipReferenceHash?: string | null;
  employerReference?: string | null;
  authorizationReference?: string | null;
}

interface PanelPlanDocument {
  _id: unknown;
  payerOrganizationId: unknown;
  status: string;
}

interface PayerDocument {
  _id: unknown;
  organizationType: string;
  status: string;
}

export class MongoClaimsAuthoritativeBillingAdapter
implements ClaimsAuthoritativeBillingPort {
  public constructor(private readonly database: Db) {}

  public async loadClaimSource(
    input: Parameters<ClaimsAuthoritativeBillingPort['loadClaimSource']>[0],
  ): Promise<Awaited<ReturnType<ClaimsAuthoritativeBillingPort['loadClaimSource']>>> {
    const facilityId = toObjectId(input.facilityId, 'facilityId');
    const invoiceId = toObjectId(input.invoiceId, 'invoiceId');
    const selectedLineIds = input.selectedInvoiceLineIds.map((id) =>
      toObjectId(id, 'invoiceLineId'));

    const [invoice, determination, patientCoverage, plan, payer] = await Promise.all([
      this.database.collection<InvoiceDocument>('invoices').findOne(
        { _id: invoiceId, facilityId },
        { session: input.session },
      ),
      this.database.collection<CoverageDeterminationDocument>('coverageDeterminations').findOne(
        {
          _id: toObjectId(input.coverageDeterminationId, 'coverageDeterminationId'),
          facilityId,
          invoiceId,
          status: { $in: ['APPROVED', 'PARTIALLY_APPROVED', 'OVERRIDDEN'] },
        },
        { session: input.session },
      ),
      this.database.collection<PatientCoverageDocument>('patientCoverages').findOne(
        {
          _id: toObjectId(input.patientCoverageId, 'patientCoverageId'),
          facilityId,
          panelPlanId: toObjectId(input.panelPlanId, 'panelPlanId'),
          status: 'ACTIVE',
        },
        { session: input.session },
      ),
      this.database.collection<PanelPlanDocument>('panelPlans').findOne(
        {
          _id: toObjectId(input.panelPlanId, 'panelPlanId'),
          facilityId,
          payerOrganizationId: toObjectId(input.payerOrganizationId, 'payerOrganizationId'),
          status: 'ACTIVE',
        },
        { session: input.session },
      ),
      this.database.collection<PayerDocument>('payerOrganizations').findOne(
        {
          _id: toObjectId(input.payerOrganizationId, 'payerOrganizationId'),
          facilityId,
          status: 'ACTIVE',
        },
        { session: input.session },
      ),
    ]);

    if (invoice === null ||
      !['FINALIZED', 'PARTIALLY_PAID', 'PAID'].includes(invoice.status) ||
      invoice.finalizedAt == null) {
      throw new ClaimInvoiceNotEligibleError();
    }
    if (determination === null || patientCoverage === null || plan === null || payer === null) {
      throw new ClaimCoverageNotEligibleError();
    }
    if (objectIdString(patientCoverage.patientId, 'patientCoverage.patientId') !==
      objectIdString(invoice.patientId, 'invoice.patientId')) {
      throw new ClaimCoverageNotEligibleError();
    }
    if (!determination.coverageIds.some((id) =>
      objectIdString(id, 'coverageId') === input.patientCoverageId)) {
      throw new ClaimCoverageNotEligibleError();
    }

    const invoiceLines = await this.database.collection<InvoiceLineDocument>('invoiceLines')
      .find({ _id: { $in: selectedLineIds }, facilityId, invoiceId }, { session: input.session })
      .sort({ lineNumber: 1 })
      .toArray();
    if (invoiceLines.length !== selectedLineIds.length) {
      throw new ClaimInvoiceNotEligibleError();
    }

    const chargeIds = invoiceLines.map((line) => line.accountChargeId);
    const charges = await this.database.collection<AccountChargeDocument>('accountCharges')
      .find({ _id: { $in: chargeIds }, facilityId }, { session: input.session })
      .toArray();
    const chargeMap = new Map(charges.map((charge) => [
      objectIdString(charge._id, 'accountChargeId'),
      charge,
    ]));
    const allocationMap = new Map(
      determination.allocations.map((allocation) => [
        objectIdString(allocation.invoiceLineId, 'allocation.invoiceLineId'),
        allocation,
      ]),
    );

    const firstCharge = charges[0];
    return {
      invoice: {
        id: input.invoiceId,
        patientId: objectIdString(invoice.patientId, 'patientId'),
        patientAccountId: objectIdString(invoice.patientAccountId, 'patientAccountId'),
        encounterId: nullableObjectIdString(firstCharge?.encounterId),
        admissionId: nullableObjectIdString(firstCharge?.admissionId),
        status: invoice.status,
        currency: invoice.currency,
        finalizedAt: invoice.finalizedAt,
      },
      coverage: {
        id: input.coverageDeterminationId,
        status: determination.status,
        payerOrganizationId: input.payerOrganizationId,
        payerType: payer.organizationType,
        panelPlanId: input.panelPlanId,
        patientCoverageId: input.patientCoverageId,
        policyReference: patientCoverage.policyReference ?? null,
        membershipReference: null,
        employerReference: patientCoverage.employerReference ?? null,
        authorizationReference: patientCoverage.authorizationReference ?? null,
      },
      lines: invoiceLines.map((line) => {
        const lineId = objectIdString(line._id, 'invoiceLineId');
        const charge = chargeMap.get(objectIdString(line.accountChargeId, 'accountChargeId'));
        const allocation = allocationMap.get(lineId);
        if (charge === undefined || allocation === undefined) {
          throw new ClaimFinancialReconciliationError(
            `Invoice line ${lineId} has no authoritative charge or coverage allocation`,
          );
        }
        const sourceModule = charge.source?.sourceModule ?? line.sourceModuleSnapshot;
        const serviceFrom = charge.serviceFrom;
        return {
          invoiceLineId: lineId,
          chargeCatalogItemId: objectIdString(line.chargeCatalogItemId, 'chargeCatalogItemId'),
          chargeCatalogCode: line.chargeCodeSnapshot,
          sourceModule,
          sourceRecordId: nullableObjectIdString(
            charge.source?.sourceRecordId ?? line.sourceRecordId,
          ),
          serviceCategory: serviceCategory(sourceModule, line.categoryCodeSnapshot),
          serviceFrom,
          serviceThrough: charge.serviceThrough ?? null,
          providerId: null,
          departmentId: nullableObjectIdString(line.departmentId),
          serviceCodeSystem: 'HOSPITAL_CHARGE_CATALOG',
          serviceCode: line.serviceCodeSnapshot,
          revenueCode: line.serviceLineCodeSnapshot ?? null,
          units: moneyString(line.quantity),
          allocation: {
            coverageAllocationId: nullableObjectIdString(allocation._id),
            packageEnrollmentId: nullableObjectIdString(allocation.packageEnrollmentId),
            grossAmount: moneyString(allocation.grossAmount),
            packageAmount: moneyString(allocation.packageAmount),
            sponsorAmount: moneyString(allocation.sponsorAmount),
            patientAmount: moneyString(allocation.patientAmount),
            deductibleAmount: moneyString(allocation.deductibleAmount),
            copaymentAmount: moneyString(allocation.copaymentAmount),
            coinsuranceAmount: moneyString(allocation.coinsuranceAmount),
            excludedAmount: moneyString(allocation.deniedAmount),
          },
          preauthorizationId: nullableObjectIdString(charge.preauthorizationId),
          preauthorizationRequired: charge.preauthorizationId != null,
        };
      }),
    };
  }

  public async assertInvoiceClaimReconciliation(
    input: Parameters<ClaimsAuthoritativeBillingPort['assertInvoiceClaimReconciliation']>[0],
  ): Promise<void> {
    const facilityId = toObjectId(input.facilityId, 'facilityId');
    const [invoice, claim, lines] = await Promise.all([
      this.database.collection<InvoiceDocument>('invoices').findOne(
        { _id: toObjectId(input.invoiceId, 'invoiceId'), facilityId },
        { session: input.session },
      ),
      this.database.collection('claims').findOne(
        {
          _id: toObjectId(input.claimId, 'claimId'),
          facilityId,
          invoiceId: toObjectId(input.invoiceId, 'invoiceId'),
        },
        { session: input.session },
      ),
      this.database.collection('claimLines').find({
        facilityId,
        claimId: toObjectId(input.claimId, 'claimId'),
      }, { session: input.session }).toArray(),
    ]);
    if (invoice === null || claim === null || lines.length === 0) {
      throw new ClaimFinancialReconciliationError(
        'Claim, invoice, and claim-line reconciliation context is incomplete',
      );
    }
  }
}

export class MongoClaimsCoverageUtilizationAdapter
implements ClaimsCoverageUtilizationPort {
  public constructor(private readonly database: Db) {}

  public async reserveForClaim(
    input: Parameters<ClaimsCoverageUtilizationPort['reserveForClaim']>[0],
  ): Promise<void> {
    const facilityId = toObjectId(input.actor.facilityId, 'facilityId');
    const determination = await this.database.collection<CoverageDeterminationDocument>(
      'coverageDeterminations',
    ).findOne({
      _id: toObjectId(input.coverageDeterminationId, 'coverageDeterminationId'),
      facilityId,
      status: { $in: ['APPROVED', 'PARTIALLY_APPROVED', 'OVERRIDDEN'] },
      'allocations.invoiceLineId': {
        $all: input.invoiceLineIds.map((id) => toObjectId(id, 'invoiceLineId')),
      },
    }, { session: input.transaction.session });
    if (determination === null) throw new ClaimCoverageNotEligibleError();

    const existing = await this.database.collection('coverageOperationalHistories').findOne({
      facilityId,
      transactionId: input.transaction.transactionId,
      action: 'UTILIZED',
      entityType: 'CLAIM',
      entityId: toObjectId(input.claimId, 'claimId'),
    }, { session: input.transaction.session });
    if (existing !== null) return;

    const now = new Date();
    await this.database.collection('coverageOperationalHistories').insertOne({
      _id: createObjectId(),
      facilityId,
      transactionId: input.transaction.transactionId,
      correlationId: input.actor.correlationId,
      schemaVersion: 1,
      version: 0,
      createdBy: toObjectId(input.actor.userId, 'createdBy'),
      updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
      action: 'UTILIZED',
      entityType: 'CLAIM',
      entityId: toObjectId(input.claimId, 'claimId'),
      patientId: determination.patientId,
      invoiceId: determination.invoiceId,
      beforeSnapshot: null,
      afterSnapshot: {
        claimId: input.claimId,
        coverageDeterminationId: input.coverageDeterminationId,
        invoiceLineCount: input.invoiceLineIds.length,
      },
      reason: 'Coverage determination reserved for claim preparation',
      createdAt: now,
      updatedAt: now,
    }, { session: input.transaction.session });
  }

  public async reverseClaimReservation(
    input: Parameters<ClaimsCoverageUtilizationPort['reverseClaimReservation']>[0],
  ): Promise<void> {
    const facilityId = toObjectId(input.actor.facilityId, 'facilityId');
    const claim = await this.database.collection('claims').findOne({
      _id: toObjectId(input.claimId, 'claimId'),
      facilityId,
    }, { session: input.transaction.session });
    if (claim === null) return;
    const now = new Date();
    await this.database.collection('coverageOperationalHistories').insertOne({
      _id: createObjectId(),
      facilityId,
      transactionId: input.transaction.transactionId,
      correlationId: input.actor.correlationId,
      schemaVersion: 1,
      version: 0,
      createdBy: toObjectId(input.actor.userId, 'createdBy'),
      updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
      action: 'REVERSED',
      entityType: 'CLAIM',
      entityId: toObjectId(input.claimId, 'claimId'),
      patientId: claim['patientId'] ?? null,
      invoiceId: claim['invoiceId'] ?? null,
      beforeSnapshot: { status: claim['status'] ?? null },
      afterSnapshot: { reservationReversed: true },
      reason: input.reason,
      createdAt: now,
      updatedAt: now,
    }, { session: input.transaction.session });
  }
}