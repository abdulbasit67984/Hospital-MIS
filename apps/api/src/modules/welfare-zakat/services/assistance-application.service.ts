import Decimal from 'decimal.js';

import {
  WELFARE_ZAKAT_APPLICATION_NUMBER_SEQUENCE_KEY,
  WELFARE_ZAKAT_PERMISSION_KEYS,
  isAssistanceApplicationStatusTransitionAllowed,
} from '../welfare-zakat.constants.js';
import type {
  CreateAssistanceApplicationInput,
  RecordAssistanceReviewInput,
  RequestApplicationInformationInput,
  SubmitAssistanceApplicationInput,
  UpdateAssistanceApplicationInput,
  WelfareZakatActorContext,
  WelfareZakatListQuery,
  AssistanceAttachmentInput,
} from '../welfare-zakat.contracts.js';
import {
  AssistanceAccessDeniedError,
  AssistanceApplicationIncompleteError,
  AssistanceApplicationNotFoundError,
  AssistanceDuplicateApplicationError,
  AssistanceFundNotFoundError,
  AssistanceInvalidStateTransitionError,
  AssistanceVersionConflictError,
} from '../welfare-zakat.errors.js';
import {
  buildAssistanceApplicationDuplicateKey,
  safeWelfareZakatRealtimePayload,
  stableAssistancePayloadHash,
} from '../welfare-zakat.normalization.js';
import type {
  AssistanceApplicationHistoryRepositoryPort,
  AssistanceApplicationRepositoryPort,
  AssistanceFundRepositoryPort,
  AssistanceReviewRepositoryPort,
  AssistanceWorkQueueRepositoryPort,
  WelfareZakatAccessPolicyPort,
  WelfareZakatAttachmentPort,
  WelfareZakatAuditPort,
  WelfareZakatClockPort,
  WelfareZakatEncryptionPort,
  WelfareZakatNumberSequencePort,
  WelfareZakatOutboxPort,
  WelfareZakatPatientContextPort,
  WelfareZakatTransactionContext,
  WelfareZakatTransactionManagerPort,
} from '../welfare-zakat.ports.js';
import type { AssistanceApplicationRecord } from '../welfare-zakat.persistence.types.js';
import { projectAssistanceApplication } from '../welfare-zakat.projections.js';

export interface AssistanceApplicationServiceDependencies {
  applications: AssistanceApplicationRepositoryPort;
  histories: AssistanceApplicationHistoryRepositoryPort;
  reviews: AssistanceReviewRepositoryPort;
  funds: AssistanceFundRepositoryPort;
  workQueue: AssistanceWorkQueueRepositoryPort;
  patientContext: WelfareZakatPatientContextPort;
  accessPolicy: WelfareZakatAccessPolicyPort;
  transactionManager: WelfareZakatTransactionManagerPort;
  attachments: WelfareZakatAttachmentPort;
  audit: WelfareZakatAuditPort;
  outbox: WelfareZakatOutboxPort;
  clock: WelfareZakatClockPort;
  sequences: WelfareZakatNumberSequencePort;
  encryption: WelfareZakatEncryptionPort;
}

function money(value: string | number | Decimal): string {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

function financialSummary(input: Readonly<{
  householdMembers: readonly Readonly<{ dependant: boolean }>[];
  monthlyHouseholdIncome: string;
  monthlyHouseholdExpenses: string;
}>) {
  const householdSize = Math.max(1, input.householdMembers.length);
  const dependantCount = input.householdMembers.filter((member) => member.dependant).length;
  const income = new Decimal(input.monthlyHouseholdIncome);
  const expenses = new Decimal(input.monthlyHouseholdExpenses);
  return {
    householdSize,
    dependantCount,
    monthlyHouseholdIncome: money(income),
    monthlyHouseholdExpenses: money(expenses),
    monthlyDisposableIncome: money(income.minus(expenses)),
    perCapitaIncome: money(income.dividedBy(householdSize)),
  };
}

function requiredAttachmentPurposes(
  application: AssistanceApplicationRecord,
  guardianRequired: boolean,
): AssistanceAttachmentInput['purpose'][] {
  const required: AssistanceAttachmentInput['purpose'][] = ['IDENTITY_EVIDENCE', 'INCOME_EVIDENCE'];
  if (guardianRequired) required.push('GUARDIAN_EVIDENCE');
  if (application.applicationType === 'ZAKAT') required.push('ZAKAT_DECLARATION');
  return required;
}

function completeness(
  application: AssistanceApplicationRecord,
  guardianRequired: boolean,
  guardianValid: boolean,
): Readonly<{ satisfied: boolean; missingItems: readonly string[] }> {
  const available = new Set(application.attachments.map((attachment) => attachment.purpose));
  const missingItems: string[] = requiredAttachmentPurposes(application, guardianRequired)
    .filter((purpose) => !available.has(purpose));
  if (guardianRequired && !guardianValid) missingItems.push('VALID_GUARDIAN_REFERENCE');
  if (application.applicationType === 'ZAKAT' && application.zakatDeclarationSnapshotEncrypted == null) {
    missingItems.push('ZAKAT_DECLARATION_DETAILS');
  }
  return { satisfied: missingItems.length === 0, missingItems };
}

export class AssistanceApplicationService {
  public constructor(
    private readonly dependencies: AssistanceApplicationServiceDependencies,
  ) {}

  public async get(actor: WelfareZakatActorContext, applicationId: string) {
    await this.requirePermission(actor, WELFARE_ZAKAT_PERMISSION_KEYS.READ);
    const application = await this.dependencies.applications.findById(actor.facilityId, applicationId);
    if (application === null) throw new AssistanceApplicationNotFoundError();
    return projectAssistanceApplication(application);
  }

  public async list(actor: WelfareZakatActorContext, query: WelfareZakatListQuery) {
    await this.requirePermission(actor, WELFARE_ZAKAT_PERMISSION_KEYS.READ);
    const { records, total } = await this.dependencies.applications.list(actor.facilityId, query);
    const page = Math.max(1, Math.trunc(query.page ?? 1));
    const pageSize = Math.max(1, Math.trunc(query.pageSize ?? 25));
    return {
      items: records.map(projectAssistanceApplication),
      page,
      pageSize,
      totalItems: total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  public async create(
    actor: WelfareZakatActorContext,
    idempotencyKey: string,
    input: CreateAssistanceApplicationInput,
  ) {
    await this.requirePermission(actor, WELFARE_ZAKAT_PERMISSION_KEYS.APPLICATION_CREATE);
    await this.dependencies.attachments.assertAttachmentsUsable({
      facilityId: actor.facilityId,
      actorUserId: actor.userId,
      attachments: input.attachments ?? [],
    });
    const encrypted = await this.encryptApplicationInput(input);
    const summary = financialSummary({
      householdMembers: input.householdMembers,
      monthlyHouseholdIncome: input.financialCondition.monthlyHouseholdIncome,
      monthlyHouseholdExpenses: input.financialCondition.monthlyHouseholdExpenses,
    });

    return this.dependencies.transactionManager.execute({
      transactionType: 'CREATE_ASSISTANCE_APPLICATION',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`welfare-zakat:patient-applications:${actor.facilityId}:${input.patientId}`],
      idempotencyPayload: input,
      journalPayload: { patientId: input.patientId, applicationType: input.applicationType },
      execute: async (transaction) => {
        const patient = await this.dependencies.patientContext.loadApplicationContext({
          facilityId: actor.facilityId,
          patientId: input.patientId,
          ...(input.guardianId === undefined ? {} : { guardianId: input.guardianId }),
          ...(input.encounterId === undefined ? {} : { encounterId: input.encounterId }),
          ...(input.admissionId === undefined ? {} : { admissionId: input.admissionId }),
          ...(input.invoiceId === undefined ? {} : { invoiceId: input.invoiceId }),
          ...(input.claimId === undefined ? {} : { claimId: input.claimId }),
          session: transaction.session,
        });
        await this.dependencies.patientContext.assertRecordAccess({ actor, patientId: input.patientId, session: transaction.session });
        if (patient.guardianRequired && !patient.guardianValid) {
          throw new AssistanceApplicationIncompleteError();
        }
        if (input.preferredFundId != null) {
          const preferredFund = await this.dependencies.funds.findById(actor.facilityId, input.preferredFundId, transaction.session);
          if (preferredFund === null) throw new AssistanceFundNotFoundError();
        }
        const duplicateKey = buildAssistanceApplicationDuplicateKey({
          facilityId: actor.facilityId,
          patientId: input.patientId,
          applicationType: input.applicationType,
          ...(input.invoiceId === undefined ? {} : { invoiceId: input.invoiceId }),
          ...(input.admissionId === undefined ? {} : { admissionId: input.admissionId }),
          financialYearCode: input.financialYearCode,
        });
        const duplicate = await this.dependencies.applications.findDuplicate(actor.facilityId, duplicateKey, transaction.session);
        if (duplicate !== null) throw new AssistanceDuplicateApplicationError();
        const now = this.dependencies.clock.now();
        const applicationNumber = await this.dependencies.sequences.next({
          facilityId: actor.facilityId,
          sequenceKey: WELFARE_ZAKAT_APPLICATION_NUMBER_SEQUENCE_KEY,
          effectiveAt: now,
          actorUserId: actor.userId,
          transaction,
        });
        const operationKey = stableAssistancePayloadHash({ action: 'CREATE_ASSISTANCE_APPLICATION', facilityId: actor.facilityId, idempotencyKey });
        const application = await this.dependencies.applications.create(
          actor,
          input,
          {
            operationKey,
            duplicateKey,
            applicationNumber,
            ...encrypted,
            ...summary,
          },
          transaction,
        );
        await this.appendHistory(actor, application, null, 'DRAFT', input.notes ?? 'Assistance application created', transaction);
        await this.dependencies.audit.record({
          actor,
          action: 'ASSISTANCE_APPLICATION_CREATED',
          entityType: 'AssistanceApplication',
          entityId: application._id.toHexString(),
          reason: input.notes ?? null,
          before: null,
          after: projectAssistanceApplication(application),
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.enqueueApplicationEvent(actor, application, null, transaction);
        return projectAssistanceApplication(application);
      },
    });
  }

  public async update(
    actor: WelfareZakatActorContext,
    applicationId: string,
    idempotencyKey: string,
    input: UpdateAssistanceApplicationInput,
  ) {
    await this.requirePermission(actor, WELFARE_ZAKAT_PERMISSION_KEYS.APPLICATION_UPDATE);
    if (input.attachments !== undefined) {
      await this.dependencies.attachments.assertAttachmentsUsable({ facilityId: actor.facilityId, actorUserId: actor.userId, attachments: input.attachments });
    }
    const encrypted = await this.encryptApplicationUpdate(input);
    return this.dependencies.transactionManager.execute({
      transactionType: 'UPDATE_ASSISTANCE_APPLICATION',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`welfare-zakat:application:${actor.facilityId}:${applicationId}`],
      idempotencyPayload: input,
      journalPayload: { applicationId, expectedVersion: input.expectedVersion },
      execute: async (transaction) => {
        const before = await this.loadApplication(actor, applicationId, transaction);
        const derived: Record<string, string | null> = { ...encrypted };
        if (input.financialCondition !== undefined || input.householdMembers !== undefined) {
          const householdMembers = input.householdMembers ?? Array.from({ length: before.householdSize }, () => ({ dependant: false }));
          const summary = financialSummary({
            householdMembers,
            monthlyHouseholdIncome: input.financialCondition?.monthlyHouseholdIncome ?? before.monthlyHouseholdIncome.toString(),
            monthlyHouseholdExpenses: input.financialCondition?.monthlyHouseholdExpenses ?? before.monthlyHouseholdExpenses.toString(),
          });
          Object.assign(derived, summary);
        }
        const updated = await this.dependencies.applications.updateDraft(actor, applicationId, input.expectedVersion, input, derived, transaction);
        if (updated === null) throw new AssistanceVersionConflictError();
        await this.dependencies.audit.record({
          actor,
          action: 'ASSISTANCE_APPLICATION_UPDATED',
          entityType: 'AssistanceApplication',
          entityId: applicationId,
          reason: input.reason,
          before: projectAssistanceApplication(before),
          after: projectAssistanceApplication(updated),
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.enqueueApplicationEvent(actor, updated, before.status, transaction);
        return projectAssistanceApplication(updated);
      },
    });
  }

  public async submit(
    actor: WelfareZakatActorContext,
    applicationId: string,
    idempotencyKey: string,
    input: SubmitAssistanceApplicationInput,
  ) {
    await this.requirePermission(actor, WELFARE_ZAKAT_PERMISSION_KEYS.APPLICATION_SUBMIT);
    if (!input.completenessAttestation) throw new AssistanceApplicationIncompleteError();
    return this.dependencies.transactionManager.execute({
      transactionType: 'SUBMIT_ASSISTANCE_APPLICATION',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`welfare-zakat:application:${actor.facilityId}:${applicationId}`],
      idempotencyPayload: input,
      journalPayload: { applicationId },
      execute: async (transaction) => {
        const application = await this.loadApplication(actor, applicationId, transaction);
        if (!isAssistanceApplicationStatusTransitionAllowed(application.status, 'SUBMITTED')) {
          throw new AssistanceInvalidStateTransitionError('Assistance application', application.status, 'SUBMITTED');
        }
        const patient = await this.dependencies.patientContext.loadApplicationContext({
          facilityId: actor.facilityId,
          patientId: application.patientId.toHexString(),
          guardianId: application.guardianId?.toHexString() ?? null,
          encounterId: application.encounterId?.toHexString() ?? null,
          admissionId: application.admissionId?.toHexString() ?? null,
          invoiceId: application.invoiceId?.toHexString() ?? null,
          claimId: application.claimId?.toHexString() ?? null,
          session: transaction.session,
        });
        const check = completeness(application, patient.guardianRequired, patient.guardianValid);
        if (!check.satisfied) throw new AssistanceApplicationIncompleteError();
        const now = this.dependencies.clock.now();
        const updated = await this.dependencies.applications.transition({
          actor,
          applicationId,
          expectedVersion: input.expectedVersion,
          fromStatus: application.status,
          toStatus: 'SUBMITTED',
          reason: input.reason,
          occurredAt: now,
          updates: {
            completenessSatisfied: true,
            missingItems: [],
            reviewDeadlineAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
          },
          transaction,
        });
        if (updated === null) throw new AssistanceVersionConflictError();
        await this.appendHistory(actor, updated, application.status, updated.status, input.reason, transaction);
        await this.dependencies.workQueue.create({
          actor,
          applicationId,
          workQueueType: 'ELIGIBILITY_REVIEW',
          priority: 100,
          followUpAt: updated.reviewDeadlineAt,
          transaction,
        });
        await this.dependencies.audit.record({ actor, action: 'ASSISTANCE_APPLICATION_SUBMITTED', entityType: 'AssistanceApplication', entityId: applicationId, reason: input.reason, before: { status: application.status, version: application.version }, after: { status: updated.status, version: updated.version }, transactionId: transaction.transactionId, session: transaction.session });
        await this.enqueueApplicationEvent(actor, updated, application.status, transaction);
        return projectAssistanceApplication(updated);
      },
    });
  }

  public async requestInformation(
    actor: WelfareZakatActorContext,
    applicationId: string,
    idempotencyKey: string,
    input: RequestApplicationInformationInput,
  ) {
    await this.requirePermission(actor, WELFARE_ZAKAT_PERMISSION_KEYS.APPLICATION_REVIEW);
    return this.dependencies.transactionManager.execute({
      transactionType: 'REQUEST_ASSISTANCE_APPLICATION_INFORMATION',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`welfare-zakat:application:${actor.facilityId}:${applicationId}`],
      idempotencyPayload: input,
      journalPayload: { applicationId, requestedItems: input.requestedItems },
      execute: async (transaction) => {
        const application = await this.loadApplication(actor, applicationId, transaction);
        if (!isAssistanceApplicationStatusTransitionAllowed(application.status, 'INFORMATION_REQUESTED')) {
          throw new AssistanceInvalidStateTransitionError('Assistance application', application.status, 'INFORMATION_REQUESTED');
        }
        const updated = await this.dependencies.applications.transition({
          actor,
          applicationId,
          expectedVersion: input.expectedVersion,
          fromStatus: application.status,
          toStatus: 'INFORMATION_REQUESTED',
          reason: input.reason,
          occurredAt: this.dependencies.clock.now(),
          updates: { completenessSatisfied: false, missingItems: input.requestedItems, followUpAt: new Date(input.responseDueAt) },
          transaction,
        });
        if (updated === null) throw new AssistanceVersionConflictError();
        const reasonEncrypted = await this.dependencies.encryption.encrypt(input.reason);
        await this.dependencies.workQueue.create({ actor, applicationId, workQueueType: 'INFORMATION_FOLLOW_UP', priority: 50, followUpAt: new Date(input.responseDueAt), reasonEncrypted, transaction });
        await this.appendHistory(actor, updated, application.status, updated.status, input.reason, transaction);
        await this.dependencies.audit.record({ actor, action: 'ASSISTANCE_APPLICATION_INFORMATION_REQUESTED', entityType: 'AssistanceApplication', entityId: applicationId, reason: input.reason, before: { status: application.status }, after: { status: updated.status, missingItems: input.requestedItems }, transactionId: transaction.transactionId, session: transaction.session });
        await this.enqueueApplicationEvent(actor, updated, application.status, transaction);
        return projectAssistanceApplication(updated);
      },
    });
  }

  public async recordReview(
    actor: WelfareZakatActorContext,
    applicationId: string,
    idempotencyKey: string,
    input: RecordAssistanceReviewInput,
  ) {
    await this.requirePermission(actor, WELFARE_ZAKAT_PERMISSION_KEYS.APPLICATION_REVIEW);
    await this.dependencies.attachments.assertAttachmentIdsUsable({ facilityId: actor.facilityId, actorUserId: actor.userId, attachmentIds: input.attachmentIds ?? [] });
    const assessmentEncrypted = await this.dependencies.encryption.encrypt(input.assessment.trim());
    const findingsEncrypted = await this.dependencies.encryption.encrypt(JSON.stringify(input.findings));
    return this.dependencies.transactionManager.execute({
      transactionType: 'RECORD_ASSISTANCE_REVIEW',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`welfare-zakat:application:${actor.facilityId}:${applicationId}`],
      idempotencyPayload: input,
      journalPayload: { applicationId, reviewType: input.reviewType, outcome: input.outcome },
      execute: async (transaction) => {
        let application = await this.loadApplication(actor, applicationId, transaction);
        if (application.version !== input.expectedVersion) {
          throw new AssistanceVersionConflictError();
        }
        if (!['SUBMITTED', 'UNDER_REVIEW', 'REOPENED'].includes(application.status)) {
          throw new AssistanceInvalidStateTransitionError('Assistance application review', application.status, 'UNDER_REVIEW');
        }
        if (application.status !== 'UNDER_REVIEW') {
          const underReview = await this.dependencies.applications.transition({
            actor,
            applicationId,
            expectedVersion: application.version,
            fromStatus: application.status,
            toStatus: 'UNDER_REVIEW',
            reason: `${input.reviewType} review started`,
            occurredAt: this.dependencies.clock.now(),
            transaction,
          });
          if (underReview === null) throw new AssistanceVersionConflictError();
          await this.appendHistory(
            actor,
            underReview,
            application.status,
            underReview.status,
            `${input.reviewType} review started`,
            transaction,
          );
          application = underReview;
        }
        if (input.recommendedFundId != null) {
          const fund = await this.dependencies.funds.findById(actor.facilityId, input.recommendedFundId, transaction.session);
          if (fund === null) throw new AssistanceFundNotFoundError();
        }
        const reviewedAt = this.dependencies.clock.now();
        const review = await this.dependencies.reviews.appendReview({
          actor,
          applicationId,
          reviewSequence: application.version + 1,
          input,
          assessmentEncrypted,
          findingsEncrypted,
          reviewedAt,
          immutableHash: stableAssistancePayloadHash({ applicationId, reviewType: input.reviewType, outcome: input.outcome, reviewedAt: reviewedAt.toISOString(), transactionId: transaction.transactionId }),
          transaction,
        });
        if (input.recommendedAmount != null) {
          const withRecommendation = await this.dependencies.applications.updateFinancialSummary({
            actor,
            applicationId,
            expectedVersion: application.version,
            amounts: { recommendedAmount: input.recommendedAmount },
            transaction,
          });
          if (withRecommendation === null) throw new AssistanceVersionConflictError();
          application = withRecommendation;
        }
        if (input.followUpAt != null) {
          const reasonEncrypted = await this.dependencies.encryption.encrypt(input.assessment.trim());
          await this.dependencies.workQueue.create({
            actor,
            applicationId,
            workQueueType: input.reviewType === 'CLINICAL'
              ? 'CLINICAL_REVIEW'
              : input.reviewType === 'FINANCIAL'
                ? 'FINANCIAL_REVIEW'
                : input.reviewType === 'SOCIAL_WELFARE'
                  ? 'SOCIAL_WELFARE_REVIEW'
                  : 'ELIGIBILITY_REVIEW',
            priority: 75,
            followUpAt: new Date(input.followUpAt),
            reasonEncrypted,
            transaction,
          });
        }
        await this.dependencies.audit.record({ actor, action: 'ASSISTANCE_APPLICATION_REVIEW_RECORDED', entityType: 'AssistanceReview', entityId: review._id.toHexString(), reason: input.assessment, before: null, after: { applicationId, reviewType: review.reviewType, outcome: review.outcome, reviewedAt: review.reviewedAt.toISOString() }, transactionId: transaction.transactionId, session: transaction.session });
        return { application: projectAssistanceApplication(application), reviewId: review._id.toHexString(), outcome: review.outcome };
      },
    });
  }

  private async encryptApplicationInput(input: CreateAssistanceApplicationInput) {
    return {
      applicantSnapshotEncrypted: await this.dependencies.encryption.encrypt(JSON.stringify(input.applicant)),
      householdSnapshotEncrypted: await this.dependencies.encryption.encrypt(JSON.stringify(input.householdMembers)),
      employmentSnapshotEncrypted: await this.dependencies.encryption.encrypt(JSON.stringify(input.employment)),
      financialConditionSnapshotEncrypted: await this.dependencies.encryption.encrypt(JSON.stringify(input.financialCondition)),
      zakatDeclarationSnapshotEncrypted: input.zakatDeclaration == null ? null : await this.dependencies.encryption.encrypt(JSON.stringify(input.zakatDeclaration)),
      questionnaireSnapshotEncrypted: await this.dependencies.encryption.encrypt(JSON.stringify(input.questionnaireAnswers)),
      requestedServicesSnapshotEncrypted: input.requestedServices == null ? null : await this.dependencies.encryption.encrypt(JSON.stringify(input.requestedServices)),
      notesEncrypted: input.notes == null ? null : await this.dependencies.encryption.encrypt(input.notes),
    };
  }

  private async encryptApplicationUpdate(input: UpdateAssistanceApplicationInput) {
    const encrypted: Record<string, string | null> = {};
    if (input.applicant !== undefined) encrypted.applicantSnapshotEncrypted = await this.dependencies.encryption.encrypt(JSON.stringify(input.applicant));
    if (input.householdMembers !== undefined) encrypted.householdSnapshotEncrypted = await this.dependencies.encryption.encrypt(JSON.stringify(input.householdMembers));
    if (input.employment !== undefined) encrypted.employmentSnapshotEncrypted = await this.dependencies.encryption.encrypt(JSON.stringify(input.employment));
    if (input.financialCondition !== undefined) encrypted.financialConditionSnapshotEncrypted = await this.dependencies.encryption.encrypt(JSON.stringify(input.financialCondition));
    if (input.zakatDeclaration !== undefined) encrypted.zakatDeclarationSnapshotEncrypted = input.zakatDeclaration == null ? null : await this.dependencies.encryption.encrypt(JSON.stringify(input.zakatDeclaration));
    if (input.questionnaireAnswers !== undefined) encrypted.questionnaireSnapshotEncrypted = await this.dependencies.encryption.encrypt(JSON.stringify(input.questionnaireAnswers));
    if (input.notes !== undefined) encrypted.notesEncrypted = input.notes == null ? null : await this.dependencies.encryption.encrypt(input.notes);
    return encrypted;
  }

  private async loadApplication(actor: WelfareZakatActorContext, applicationId: string, transaction: WelfareZakatTransactionContext) {
    const application = await this.dependencies.applications.findById(actor.facilityId, applicationId, transaction.session);
    if (application === null) throw new AssistanceApplicationNotFoundError();
    await this.dependencies.patientContext.assertRecordAccess({ actor, patientId: application.patientId.toHexString(), session: transaction.session });
    return application;
  }

  private async appendHistory(
    actor: WelfareZakatActorContext,
    application: AssistanceApplicationRecord,
    fromStatus: AssistanceApplicationRecord['status'] | null,
    toStatus: AssistanceApplicationRecord['status'],
    reason: string,
    transaction: WelfareZakatTransactionContext,
  ) {
    const snapshot = projectAssistanceApplication(application);
    const snapshotHash = stableAssistancePayloadHash(snapshot);
    await this.dependencies.histories.append({ actor, application, fromStatus, toStatus, reason, snapshot: snapshot as unknown as Readonly<Record<string, unknown>>, snapshotHash, immutableHash: stableAssistancePayloadHash({ applicationId: application._id.toHexString(), applicationVersion: application.version, fromStatus, toStatus, snapshotHash, transactionId: transaction.transactionId }), occurredAt: this.dependencies.clock.now(), transaction });
  }

  private async requirePermission(actor: WelfareZakatActorContext, permission: string) {
    const decision = await this.dependencies.accessPolicy.authorize({ actor, permission, resourceFacilityId: actor.facilityId });
    if (!decision.allowed) throw new AssistanceAccessDeniedError(decision.denialReason ?? undefined);
  }

  private async enqueueApplicationEvent(actor: WelfareZakatActorContext, application: AssistanceApplicationRecord, previousStatus: string | null, transaction: WelfareZakatTransactionContext) {
    await this.dependencies.outbox.enqueue({
      facilityId: actor.facilityId,
      eventType: 'welfare_zakat.application.changed',
      aggregateType: 'AssistanceApplication',
      aggregateId: application._id.toHexString(),
      payload: safeWelfareZakatRealtimePayload({ applicationId: application._id.toHexString(), status: application.status, previousStatus, version: application.version, eventAt: this.dependencies.clock.now().toISOString() }),
      correlationId: actor.correlationId,
      transactionId: transaction.transactionId,
      session: transaction.session,
    });
  }
}