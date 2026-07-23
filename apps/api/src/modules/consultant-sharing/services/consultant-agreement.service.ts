import {
  CONSULTANT_AGREEMENT_NUMBER_SEQUENCE_KEY,
  CONSULTANT_SHARING_PERMISSION_KEYS,
} from '../consultant-sharing.constants.js';
import type {
  ConsultantAgreementRuleDefinition,
  ConsultantSharingActorContext,
  ConsultantSharingListQuery,
} from '../consultant-sharing.contracts.js';
import {
  ConsultantAgreementConflictError,
  ConsultantAgreementNotFoundError,
  ConsultantSharingAccessDeniedError,
  ConsultantSharingConcurrencyError,
} from '../consultant-sharing.errors.js';
import { assertNoConsultantAgreementRuleConflicts } from '../consultant-sharing.agreement-matching.js';
import {
  normalizeConsultantSharingCode,
  stableConsultantSharingPayloadHash,
} from '../consultant-sharing.normalization.js';
import type {
  ConsultantAgreementHistoryRepositoryPort,
  ConsultantAgreementRepositoryPort,
  ConsultantAgreementRuleRepositoryPort,
  ConsultantAttachmentPort,
  ConsultantAuditPort,
  ConsultantClockPort,
  ConsultantEncryptionPort,
  ConsultantIdempotencyPort,
  ConsultantIdentityResolutionPort,
  ConsultantOperationLockPort,
  ConsultantOutboxPort,
  ConsultantSequencePort,
  ConsultantSharingAccessPolicyPort,
  ConsultantSharingTransactionManagerPort,
} from '../consultant-sharing.ports.js';

export type CreateConsultantAgreementRuleInput = Omit<
  ConsultantAgreementRuleDefinition,
  | 'id'
  | 'agreementId'
  | 'agreementVersion'
  | 'facilityId'
  | 'consultantId'
  | 'consultantGroupId'
  | 'status'
  | 'ruleVersion'
  | 'currency'
  | 'calculationFingerprint'
>;

export interface CreateConsultantAgreementInput {
  agreementName: string;
  description?: string | null;
  consultantId: string;
  consultantStaffId?: string | null;
  consultantGroupId?: string | null;
  engagementType: string;
  priority: number;
  effectiveFrom: string;
  effectiveThrough?: string | null;
  departmentIds?: readonly string[];
  serviceIds?: readonly string[];
  serviceCategories?: readonly string[];
  supportingAttachmentIds: readonly string[];
  internalNotes?: string | null;
  approvalMatrixCode?: string;
  taxProfileReferenceHash?: string | null;
  payoutProfileReferenceHash?: string | null;
  payoutProfileReferenceMasked?: string | null;
  rules: readonly CreateConsultantAgreementRuleInput[];
}

export interface AmendConsultantAgreementInput {
  expectedVersion: number;
  effectiveFrom: string;
  reason: string;
}

export interface UpdateConsultantAgreementInput {
  expectedVersion: number;
  agreementName?: string;
  description?: string | null;
  priority?: number;
  effectiveFrom?: string;
  effectiveThrough?: string | null;
  supportingAttachmentIds?: readonly string[];
  internalNotes?: string | null;
  reason: string;
}

export interface ConsultantAgreementServiceDependencies {
  agreements: ConsultantAgreementRepositoryPort;
  rules: ConsultantAgreementRuleRepositoryPort;
  history: ConsultantAgreementHistoryRepositoryPort;
  identity: ConsultantIdentityResolutionPort;
  attachments: ConsultantAttachmentPort;
  accessPolicy: ConsultantSharingAccessPolicyPort;
  transactions: ConsultantSharingTransactionManagerPort;
  idempotency: ConsultantIdempotencyPort;
  audit: ConsultantAuditPort;
  outbox: ConsultantOutboxPort;
  locks: ConsultantOperationLockPort;
  sequences: ConsultantSequencePort;
  encryption: ConsultantEncryptionPort;
  clock: ConsultantClockPort;
}

function asSnapshot(value: unknown): Readonly<Record<string, unknown>> {
  return value as Readonly<Record<string, unknown>>;
}

export class ConsultantAgreementService {
  public constructor(
    private readonly dependencies: ConsultantAgreementServiceDependencies,
  ) {}

  public async get(actor: ConsultantSharingActorContext, agreementId: string) {
    await this.requireAccess(actor, 'READ');
    const agreement = await this.dependencies.agreements.findById({
      facilityId: actor.facilityId,
      agreementId,
    });
    if (agreement == null) throw new ConsultantAgreementNotFoundError();
    const rules = await this.dependencies.rules.listByAgreement({
      facilityId: actor.facilityId,
      agreementId,
    });
    return { agreement, rules } as const;
  }

  public async list(
    actor: ConsultantSharingActorContext,
    query: ConsultantSharingListQuery,
  ) {
    await this.requireAccess(actor, 'READ');
    return this.dependencies.agreements.list({ facilityId: actor.facilityId, query });
  }

  public async create(
    actor: ConsultantSharingActorContext,
    idempotencyKey: string,
    input: CreateConsultantAgreementInput,
  ) {
    await this.requireAccess(actor, 'AGREEMENT_CREATE');
    await this.dependencies.attachments.assertAttachmentIdsUsable({
      facilityId: actor.facilityId,
      actorUserId: actor.userId,
      attachmentIds: input.supportingAttachmentIds,
    });

    const consultant = await this.dependencies.identity.resolveConsultant({
      facilityId: actor.facilityId,
      consultantId: input.consultantId,
    });
    if (consultant == null || !consultant.active) {
      throw new ConsultantAgreementConflictError('Consultant is not active in the facility');
    }
    if (
      input.consultantStaffId != null &&
      consultant.staffId != null &&
      input.consultantStaffId !== consultant.staffId
    ) {
      throw new ConsultantAgreementConflictError(
        'Consultant staff reference does not match the authoritative consultant identity',
      );
    }

    this.assertRuleConflicts(actor.facilityId, input, consultant.consultantGroupId);
    const requestHash = stableConsultantSharingPayloadHash(input);

    return this.dependencies.idempotency.execute({
      scope: 'CONSULTANT_AGREEMENT_CREATE',
      actor,
      idempotencyKey,
      requestHash,
      operation: () =>
        this.withOperationLock(
          actor,
          `create:${input.consultantId}`,
          () => this.dependencies.transactions.withTransaction(async (transaction) => {
          const now = this.dependencies.clock.now();
          const agreementNumber = await this.dependencies.sequences.next({
            facilityId: actor.facilityId,
            sequenceKey: CONSULTANT_AGREEMENT_NUMBER_SEQUENCE_KEY,
            occurredAt: now,
            transaction,
          });
          const internalNotesEncrypted = input.internalNotes == null
            ? null
            : await this.dependencies.encryption.encrypt(input.internalNotes);
          const operationKey = stableConsultantSharingPayloadHash({
            action: 'CREATE_CONSULTANT_AGREEMENT',
            facilityId: actor.facilityId,
            idempotencyKey,
          });

          const agreement = await this.dependencies.agreements.create({
            actor,
            agreementNumber,
            agreementName: input.agreementName,
            description: input.description ?? null,
            consultantId: input.consultantId,
            consultantStaffId: consultant.staffId,
            consultantUserId: consultant.userId,
            consultantGroupId: input.consultantGroupId ?? consultant.consultantGroupId,
            engagementType: input.engagementType,
            priority: input.priority,
            effectiveFrom: new Date(input.effectiveFrom),
            effectiveThrough: input.effectiveThrough == null
              ? null
              : new Date(input.effectiveThrough),
            departmentIds: input.departmentIds ?? consultant.departmentIds,
            serviceIds: input.serviceIds ?? [],
            serviceCategories: input.serviceCategories ?? [],
            supportingAttachmentIds: input.supportingAttachmentIds,
            internalNotesEncrypted,
            approvalMatrixCode: input.approvalMatrixCode ?? 'CONSULTANT_AGREEMENT',
            taxProfileReferenceHash: input.taxProfileReferenceHash ?? null,
            payoutProfileReferenceHash: input.payoutProfileReferenceHash ?? null,
            payoutProfileReferenceMasked: input.payoutProfileReferenceMasked ?? null,
            operationKey,
            transaction,
          });

          const rules = await this.dependencies.rules.createMany({
            actor,
            agreement,
            rules: input.rules.map((rule) => ({
              ...rule,
              ruleCode: normalizeConsultantSharingCode(rule.ruleCode),
              ruleVersion: 1,
              currency: 'PKR',
            })),
            transaction,
          });
          await this.dependencies.history.appendRuleVersions({
            actor,
            rules,
            occurredAt: now,
            transaction,
          });
          await this.dependencies.history.append({
            actor,
            agreementId: agreement.id,
            agreementVersion: agreement.agreementVersion,
            historyType: 'CREATED',
            fromStatus: null,
            toStatus: agreement.status,
            reasonEncrypted: await this.dependencies.encryption.encrypt(
              'Consultant agreement created',
            ),
            snapshot: asSnapshot({ agreement, rules }),
            immutableHash: stableConsultantSharingPayloadHash({ agreement, rules }),
            occurredAt: now,
            approvalRequestId: null,
            transaction,
          });
          await this.dependencies.audit.record({
            actor,
            action: 'CONSULTANT_AGREEMENT_CREATED',
            entityType: 'ConsultantAgreement',
            entityId: agreement.id,
            after: asSnapshot(agreement),
            transaction,
          });
          await this.dependencies.outbox.publish({
            aggregateType: 'ConsultantAgreement',
            aggregateId: agreement.id,
            eventType: 'consultant.agreement.created',
            payload: { agreementId: agreement.id, status: agreement.status },
            correlationId: actor.correlationId,
            occurredAt: now,
            transaction,
          });
          return { agreement, rules } as const;
          }),
        ),
    });
  }

  public async amend(
    actor: ConsultantSharingActorContext,
    agreementId: string,
    idempotencyKey: string,
    input: AmendConsultantAgreementInput,
  ) {
    await this.requireAccess(actor, 'AGREEMENT_AMEND');
    const requestHash = stableConsultantSharingPayloadHash({ agreementId, input });
    return this.dependencies.idempotency.execute({
      scope: 'CONSULTANT_AGREEMENT_AMEND',
      actor,
      idempotencyKey,
      requestHash,
      operation: () =>
        this.withOperationLock(
          actor,
          `amend:${agreementId}`,
          () => this.dependencies.transactions.withTransaction(async (transaction) => {
          const source = await this.dependencies.agreements.findById({
            facilityId: actor.facilityId,
            agreementId,
            transaction,
          });
          if (source == null) throw new ConsultantAgreementNotFoundError();
          if (!['APPROVED', 'ACTIVE', 'SUSPENDED'].includes(source.status)) {
            throw new ConsultantAgreementConflictError(
              'Only approved, active, or suspended agreements can be amended',
            );
          }
          const amendmentEffectiveFrom = new Date(input.effectiveFrom);
          if (
            Number.isNaN(amendmentEffectiveFrom.getTime()) ||
            amendmentEffectiveFrom <= new Date(source.effectiveFrom) ||
            (source.effectiveThrough != null &&
              amendmentEffectiveFrom > new Date(source.effectiveThrough))
          ) {
            throw new ConsultantAgreementConflictError(
              'Amendment effective date must be within the source agreement effective period',
            );
          }
          const now = this.dependencies.clock.now();
          const amendmentAgreementNumber = await this.dependencies.sequences.next({
            facilityId: actor.facilityId,
            sequenceKey: CONSULTANT_AGREEMENT_NUMBER_SEQUENCE_KEY,
            occurredAt: now,
            transaction,
          });
          const amendment = await this.dependencies.agreements.createAmendment({
            actor,
            sourceAgreementId: agreementId,
            expectedVersion: input.expectedVersion,
            amendmentAgreementNumber,
            effectiveFrom: amendmentEffectiveFrom,
            reason: input.reason,
            operationKey: stableConsultantSharingPayloadHash({
              action: 'AMEND_CONSULTANT_AGREEMENT',
              facilityId: actor.facilityId,
              agreementId,
              idempotencyKey,
            }),
            transaction,
          });
          if (amendment == null) throw new ConsultantSharingConcurrencyError();
          const sourceRules = await this.dependencies.rules.listByAgreement({
            facilityId: actor.facilityId,
            agreementId,
            transaction,
          });
          const eligibleSourceRules = sourceRules.filter((rule) =>
            rule.effectiveThrough == null ||
            new Date(rule.effectiveThrough) >= amendmentEffectiveFrom,
          );
          if (eligibleSourceRules.length === 0) {
            throw new ConsultantAgreementConflictError(
              'The source agreement has no rules effective on or after the amendment date',
            );
          }
          const amendmentRules = await this.dependencies.rules.createMany({
            actor,
            agreement: amendment,
            rules: eligibleSourceRules
              .map(({
                id: _id,
                agreementId: _agreementId,
                agreementVersion: _agreementVersion,
                facilityId: _facilityId,
                consultantId: _consultantId,
                consultantGroupId: _consultantGroupId,
                status: _status,
                calculationFingerprint: _calculationFingerprint,
                ...rule
              }) => ({
                ...rule,
                ruleVersion: rule.ruleVersion + 1,
                effectiveFrom:
                  new Date(rule.effectiveFrom) < amendmentEffectiveFrom
                    ? amendmentEffectiveFrom.toISOString()
                    : rule.effectiveFrom,
              })),
            transaction,
          });
          await this.dependencies.history.appendRuleVersions({ actor, rules: amendmentRules, occurredAt: now, transaction });
          await this.dependencies.history.append({
            actor, agreementId: amendment.id, agreementVersion: amendment.agreementVersion,
            historyType: 'AMENDED', fromStatus: source.status, toStatus: amendment.status,
            reasonEncrypted: await this.dependencies.encryption.encrypt(input.reason),
            snapshot: asSnapshot({ sourceAgreementId: source.id, amendment, rules: amendmentRules }),
            immutableHash: stableConsultantSharingPayloadHash({ sourceAgreementId: source.id, amendment, rules: amendmentRules }),
            occurredAt: now, approvalRequestId: null, transaction,
          });
          await this.dependencies.audit.record({
            actor, action: 'CONSULTANT_AGREEMENT_AMENDED', entityType: 'ConsultantAgreement',
            entityId: amendment.id, before: asSnapshot(source), after: asSnapshot(amendment),
            reason: input.reason, transaction,
          });
          await this.dependencies.outbox.publish({
            aggregateType: 'ConsultantAgreement', aggregateId: amendment.id,
            eventType: 'consultant.agreement.amended',
            payload: { agreementId: amendment.id, supersedesAgreementId: source.id, status: amendment.status },
            correlationId: actor.correlationId, occurredAt: now, transaction,
          });
          return { agreement: amendment, rules: amendmentRules } as const;
          }),
        ),
    });
  }

  public async updateDraft(
    actor: ConsultantSharingActorContext,
    agreementId: string,
    idempotencyKey: string,
    input: UpdateConsultantAgreementInput,
  ) {
    await this.requireAccess(actor, 'AGREEMENT_UPDATE');
    if (input.supportingAttachmentIds != null) {
      await this.dependencies.attachments.assertAttachmentIdsUsable({
        facilityId: actor.facilityId,
        actorUserId: actor.userId,
        attachmentIds: input.supportingAttachmentIds,
      });
    }
    const requestHash = stableConsultantSharingPayloadHash({ agreementId, input });
    return this.dependencies.idempotency.execute({
      scope: 'CONSULTANT_AGREEMENT_UPDATE',
      actor,
      idempotencyKey,
      requestHash,
      operation: () =>
        this.withOperationLock(
          actor,
          `update:${agreementId}`,
          () => this.dependencies.transactions.withTransaction(async (transaction) => {
          const before = await this.dependencies.agreements.findById({
            facilityId: actor.facilityId,
            agreementId,
            transaction,
          });
          if (before == null) throw new ConsultantAgreementNotFoundError();
          const internalNotesEncrypted = input.internalNotes === undefined
            ? undefined
            : input.internalNotes == null
              ? null
              : await this.dependencies.encryption.encrypt(input.internalNotes);
          const updated = await this.dependencies.agreements.updateDraft({
            actor,
            agreementId,
            expectedVersion: input.expectedVersion,
            changes: {
              ...(input.agreementName === undefined ? {} : { agreementName: input.agreementName }),
              ...(input.description === undefined ? {} : { description: input.description }),
              ...(input.priority === undefined ? {} : { priority: input.priority }),
              ...(input.effectiveFrom === undefined ? {} : { effectiveFrom: new Date(input.effectiveFrom) }),
              ...(input.effectiveThrough === undefined
                ? {}
                : { effectiveThrough: input.effectiveThrough == null ? null : new Date(input.effectiveThrough) }),
              ...(input.supportingAttachmentIds === undefined
                ? {}
                : { supportingAttachmentIds: input.supportingAttachmentIds }),
              ...(internalNotesEncrypted === undefined ? {} : { internalNotesEncrypted }),
            },
            transaction,
          });
          if (updated == null) throw new ConsultantSharingConcurrencyError();
          const now = this.dependencies.clock.now();
          await this.dependencies.history.append({
            actor,
            agreementId,
            agreementVersion: updated.agreementVersion,
            historyType: 'AMENDED',
            fromStatus: before.status,
            toStatus: updated.status,
            reasonEncrypted: await this.dependencies.encryption.encrypt(input.reason),
            snapshot: asSnapshot(updated),
            immutableHash: stableConsultantSharingPayloadHash(updated),
            occurredAt: now,
            approvalRequestId: null,
            transaction,
          });
          await this.dependencies.audit.record({
            actor,
            action: 'CONSULTANT_AGREEMENT_UPDATED',
            entityType: 'ConsultantAgreement',
            entityId: agreementId,
            before: asSnapshot(before),
            after: asSnapshot(updated),
            reason: input.reason,
            transaction,
          });
          return updated;
          }),
        ),
    });
  }

  private withOperationLock<T>(
    actor: ConsultantSharingActorContext,
    resourceKey: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    return this.dependencies.locks.withLock({
      lockKey: `consultant-agreement:${actor.facilityId}:${resourceKey}`,
      ownerId: `${actor.userId}:${actor.correlationId}`,
      ttlMs: 30_000,
      operation,
    });
  }

  private assertRuleConflicts(
    facilityId: string,
    input: CreateConsultantAgreementInput,
    consultantGroupId: string | null,
  ): void {
    const candidates = input.rules.map((rule, index) => {
      const fingerprint = stableConsultantSharingPayloadHash(rule);
      const id = stableConsultantSharingPayloadHash({ index, fingerprint }).slice(0, 24);
      return {
        agreementId: '000000000000000000000000',
        agreementNumber: 'PENDING',
        agreementVersion: 1,
        agreementStatus: 'ACTIVE' as const,
        agreementPriority: input.priority,
        rule: {
          ...rule,
          id,
          agreementId: '000000000000000000000000',
          agreementVersion: 1,
          ruleVersion: 1,
          facilityId,
          consultantId: input.consultantId,
          consultantGroupId: input.consultantGroupId ?? consultantGroupId,
          status: 'ACTIVE' as const,
          calculationFingerprint: fingerprint,
          currency: 'PKR' as const,
        },
      };
    });
    assertNoConsultantAgreementRuleConflicts(candidates);
  }

  private async requireAccess(
    actor: ConsultantSharingActorContext,
    action: keyof typeof CONSULTANT_SHARING_PERMISSION_KEYS,
  ): Promise<void> {
    const decision = await this.dependencies.accessPolicy.authorize({ actor, action });
    if (!decision.allowed) {
      throw new ConsultantSharingAccessDeniedError(decision.denialReason);
    }
  }
}