import {
  randomUUID,
} from 'node:crypto';

import type {
  Request,
  Response,
} from 'express';

import {
  Router,
} from 'express';

import type {
  Db,
} from '@hospital-mis/database';

import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  PermissionKey,
} from '@hospital-mis/permissions';

import {
  ConflictError,
  ForbiddenError,
  ResourceNotFoundError,
  createApiSuccess,
} from '@hospital-mis/shared';

import {
  authenticate,
} from '../../middleware/authenticate.js';

import {
  validateRequest,
} from '../../middleware/validate-request.js';

import type {
  AuditRepository,
} from '../audit/audit.repository.js';

import type {
  AuthenticationService,
} from '../auth/auth.service.js';

import {
  requireAnyPermission,
  requirePermission,
} from '../authorization/authorization.middleware.js';

import type {
  AuthorizationService,
} from '../authorization/authorization.service.js';

import type {
  createOperationalInfrastructure,
} from '../../infrastructure/operational-infrastructure.js';

import {
  ClinicalEmrCompensationExecutor,
} from '../../infrastructure/clinical-emr-compensation.executor.js';

import {
  createClinicalEmrRuntimeAdapters,
} from '../../infrastructure/clinical-emr-runtime.adapters.js';

import type {
  ClinicalEmrEncryptedSnapshot,
  ClinicalEmrSnapshotCryptoPort,
} from './clinical-emr.ports.js';

import {
  MongoClinicalEmrTransactionManagerAdapter,
} from '../../infrastructure/clinical-emr-transaction-manager.adapter.js';

import {
  CLINICAL_EMR_PERMISSION_KEYS,
} from './clinical-emr.constants.js';

import {
  CLINICAL_EMR_AUDIT_ACTIONS,
  CLINICAL_EMR_OUTBOX_EVENTS,
  CLINICAL_EMR_REALTIME_EVENTS,
  CLINICAL_EMR_RECOVERY_MODES,
  CLINICAL_EMR_TRANSACTION_TYPES,
} from './clinical-emr.transaction.constants.js';

import {
  buildClinicalEmrAuditActorFields,
  type ClinicalAccessDecision,
  type ClinicalEmrMutationDependencies,
  type ClinicalEmrRealtimeMessage,
} from './clinical-emr.ports.js';

import type {
  ClinicalEmrActorContext,
  ClinicalNoteListQuery,
  ClinicalTimelineQuery,
  EncounterRecord,
  EncounterListQuery,
} from './clinical-emr.types.js';

import {
  deleteCreatedClinicalRecordCompensation,
} from './clinical-emr.mutation-snapshots.js';

import {
  clinicalNoteVersionAssociatedData,
  patientAllergyVersionAssociatedData,
  patientProblemVersionAssociatedData,
} from './clinical-emr.workflow-helpers.js';

import {
  allergyCatalogListQuerySchema,
  clinicalEmrActorFromRequest,
  clinicalEmrIdempotencyKeyFromRequest,
  clinicalEmrMutationHeadersSchema,
  clinicalEntityParamsSchema,
  clinicalPatientSummaryQuerySchema,
  clinicalProviderWorklistQuerySchema,
  clinicalTimelineRouteQuerySchema,
  clinicalReferralListQuerySchema,
  diagnosisCatalogListQuerySchema,
  encounterDiagnosisListQuerySchema,
  patientAllergyListQuerySchema,
  patientProblemListQuerySchema,
  vitalSignListQuerySchema,
  correctClinicalReferralBodySchema,
  correctEncounterDiagnosisBodySchema,
  correctPatientAllergyBodySchema,
  correctPatientProblemBodySchema,
  correctVitalSignsBodySchema,
  createClinicalReferralBodySchema,
  enterVitalSignsInErrorBodySchema,
  recordVitalSignsBodySchema,
  structuredEncounterSectionBodySchema,
  transitionClinicalReferralBodySchema,
  validatedClinicalEmrPart,
  verifyEncounterDiagnosisBodySchema,
  type AllergyCatalogRouteQuery,
  type ClinicalReferralListQuery,
  type ClinicalTimelineRouteQuery,
  type CorrectClinicalReferralBody,
  type DiagnosisCatalogRouteQuery,
  type EncounterDiagnosisRouteQuery,
  type PatientAllergyRouteQuery,
  type PatientProblemRouteQuery,
  type VitalSignRouteQuery,
  type CreateClinicalReferralBody,
  type TransitionClinicalReferralBody,
} from './clinical-emr.http-contracts.js';

import {
  addClinicalNoteAddendumBodySchema,
  amendClinicalNoteBodySchema,
  changeEncounterDiagnosisStatusBodySchema,
  changeEncounterStatusBodySchema,
  clinicalNoteListQuerySchema,
  correctClinicalNoteBodySchema,
  correctEncounterBodySchema,
  createClinicalNoteBodySchema,
  createEncounterBodySchema,
  createPatientProblemBodySchema,
  enterClinicalNoteInErrorBodySchema,
  finalizeClinicalNoteBodySchema,
  recordEncounterDiagnosisBodySchema,
  recordPatientAllergyBodySchema,
  reassignEncounterBodySchema,
  signEncounterBodySchema,
  updateClinicalNoteBodySchema,
  updatePatientAllergyBodySchema,
  updatePatientProblemBodySchema,
  encounterListQuerySchema,
} from './clinical-emr.validation.js';

import {
  ClinicalEmrAccessPolicyService,
} from './services/clinical-emr-access-policy.service.js';

import {
  ClinicalEmrContextService,
} from './services/clinical-emr-context.service.js';

import {
  ClinicalEmrNumberService,
} from './services/clinical-emr-number.service.js';

import {
  ClinicalEmrOpdLifecycleService,
} from './services/clinical-emr-opd-lifecycle.service.js';

import {
  ClinicalEmrPatientResolutionService,
} from './services/clinical-emr-patient-resolution.service.js';

import {
  ClinicalEmrSensitiveReadAuditor,
} from './services/clinical-emr-sensitive-read-auditor.service.js';

import {
  ClinicalListCommandService,
} from './services/clinical-list-command.service.js';

import {
  ClinicalNoteAttributionService,
} from './services/clinical-note-attribution.service.js';

import {
  ClinicalNoteCommandService,
} from './services/clinical-note-command.service.js';

import {
  DiagnosisCommandService,
} from './services/diagnosis-command.service.js';

import {
  PatientAllergyCommandService,
} from './services/patient-allergy-command.service.js';

import {
  PatientProblemCommandService,
} from './services/patient-problem-command.service.js';

import {
  StructuredEncounterSectionService,
} from './services/structured-encounter-section.service.js';

import {
  VitalSignCommandService,
} from './services/vital-sign-command.service.js';

import {
  AllergyRepository,
  PatientAllergyRepository,
  PatientAllergyVersionRepository,
} from './repositories/allergy.repository.js';

import {
  ClinicalEmrContextRepository,
} from './repositories/clinical-emr-context.repository.js';

import {
  ClinicalEmrReadRepository,
} from './repositories/clinical-emr-read.repository.js';

import {
  ClinicalNoteRepository,
  ClinicalNoteVersionRepository,
} from './repositories/clinical-note.repository.js';

import {
  ClinicalReferralConcurrencyError,
  ClinicalReferralRepository,
  type ClinicalReferralRecord,
  type ClinicalReferralTargetRecord,
} from './repositories/clinical-referral.repository.js';

import {
  DiagnosisRepository,
  EncounterDiagnosisRepository,
} from './repositories/diagnosis.repository.js';

import {
  EncounterRepository,
} from './repositories/encounter.repository.js';

import {
  EncounterStatusHistoryRepository,
} from './repositories/encounter-status-history.repository.js';

import {
  PatientProblemRepository,
  PatientProblemVersionRepository,
} from './repositories/patient-problem.repository.js';

import {
  VitalSignRepository,
} from './repositories/vital-sign.repository.js';

import {
  ChangeEncounterStatusWorkflow,
} from './services/workflows/change-encounter-status.workflow.js';

import {
  AddClinicalNoteAddendumWorkflow,
  CorrectClinicalNoteWorkflow,
  EnterClinicalNoteInErrorWorkflow,
} from './services/workflows/clinical-note-correction.workflows.js';

import {
  CreateClinicalNoteWorkflow,
  UpdateClinicalNoteDraftWorkflow,
} from './services/workflows/clinical-note-draft.workflows.js';

import {
  AmendClinicalNoteWorkflow,
  FinalizeClinicalNoteWorkflow,
} from './services/workflows/clinical-note-finalization.workflows.js';

import {
  CorrectEncounterWorkflow,
} from './services/workflows/correct-encounter.workflow.js';

import {
  CreateEncounterWorkflow,
} from './services/workflows/create-encounter.workflow.js';

import {
  ChangeEncounterDiagnosisStatusWorkflow,
  CorrectEncounterDiagnosisWorkflow,
  RecordEncounterDiagnosisWorkflow,
  VerifyEncounterDiagnosisWorkflow,
} from './services/workflows/diagnosis-command.workflows.js';

import {
  CorrectPatientAllergyWorkflow,
  RecordPatientAllergyWorkflow,
  UpdatePatientAllergyWorkflow,
} from './services/workflows/patient-allergy-command.workflows.js';

import {
  CorrectPatientProblemWorkflow,
  CreatePatientProblemWorkflow,
  UpdatePatientProblemWorkflow,
} from './services/workflows/patient-problem-command.workflows.js';

import {
  ReassignEncounterWorkflow,
} from './services/workflows/reassign-encounter.workflow.js';

import {
  SignEncounterWorkflow,
} from './services/workflows/sign-encounter.workflow.js';

import {
  CorrectVitalSignsWorkflow,
  EnterVitalSignsInErrorWorkflow,
  RecordStructuredEncounterSectionWorkflow,
  RecordVitalSignsWorkflow,
} from './services/workflows/structured-section-and-vital-sign.workflows.js';

const activeReferralStatuses = new Set([
  'REQUESTED',
  'ACCEPTED',
  'IN_PROGRESS',
]);

const referralTransitions = new Map<string, ReadonlySet<string>>([
  ['REQUESTED', new Set(['ACCEPTED', 'DECLINED', 'CANCELLED'])],
  ['ACCEPTED', new Set(['IN_PROGRESS', 'DECLINED', 'CANCELLED'])],
  ['IN_PROGRESS', new Set(['COMPLETED', 'CANCELLED'])],
  ['COMPLETED', new Set()],
  ['DECLINED', new Set()],
  ['CANCELLED', new Set()],
  ['CORRECTED', new Set()],
]);

function safeReferralResult(
  referral: ClinicalReferralRecord,
  includeSensitive: boolean,
): Record<string, unknown> {
  return {
    referralId: referral.id,
    referralNumber: referral.referralNumber,
    referralVersion: referral.referralVersion,
    previousVersionId: referral.previousVersionId,
    patientId: referral.patientId,
    sourceEncounterId: referral.sourceEncounterId,
    sourceClinicalNoteId: referral.sourceClinicalNoteId,
    requestingProviderId: referral.requestingProviderId,
    assignedProviderId: referral.assignedProviderId,
    referralType: referral.referralType,
    priority: referral.priority,
    status: referral.status,
    changeType: referral.changeType,
    target: referral.target,
    ...(includeSensitive
      ? {
          reason: referral.reason,
          clinicalQuestion: referral.clinicalQuestion,
          responseSummary: referral.responseSummary,
          decisionReason: referral.decisionReason,
          correctionReason: referral.correctionReason,
        }
      : {}),
    requestedAt: referral.requestedAt.toISOString(),
    acceptedAt: referral.acceptedAt?.toISOString() ?? null,
    startedAt: referral.startedAt?.toISOString() ?? null,
    completedAt: referral.completedAt?.toISOString() ?? null,
    declinedAt: referral.declinedAt?.toISOString() ?? null,
    cancelledAt: referral.cancelledAt?.toISOString() ?? null,
    changedAt: referral.changedAt.toISOString(),
    changedBy: referral.changedBy,
    replacesVersionId: referral.replacesVersionId,
    version: referral.version,
    createdAt: referral.createdAt.toISOString(),
  };
}

function serializeClinicalHistoryValue(
  value: unknown,
): unknown {
  if (value == null) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    typeof value === 'object' &&
    'toHexString' in value &&
    typeof value.toHexString === 'function'
  ) {
    return value.toHexString();
  }

  if (Array.isArray(value)) {
    return value.map(serializeClinicalHistoryValue);
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            ![
              'encryptedSnapshot',
              'ciphertext',
              'signatureDigest',
            ].includes(key),
        )
        .map(([key, nested]) => [
          key,
          serializeClinicalHistoryValue(nested),
        ]),
    );
  }

  return value;
}

function normalizeReferralTarget(
  target: CreateClinicalReferralBody['target'],
  referralType: CreateClinicalReferralBody['referralType'],
  facilityId: string,
): ClinicalReferralTargetRecord {
  return {
    facilityId:
      referralType === 'EXTERNAL_REFERRAL'
        ? target.facilityId ?? null
        : target.facilityId ?? facilityId,
    departmentId: target.departmentId ?? null,
    clinicId: target.clinicId ?? null,
    servicePointId: target.servicePointId ?? null,
    providerId: target.providerId ?? null,
    externalOrganization: target.externalOrganization ?? null,
    externalProviderName: target.externalProviderName ?? null,
  };
}

function clinicalReferralLockKey(
  facilityId: string,
  referralNumber: string,
): string {
  return `clinical-emr:referral:${facilityId}:${referralNumber}`;
}

function referralEventPayload(
  referral: ClinicalReferralRecord,
): Record<string, unknown> {
  return {
    referralNumber: referral.referralNumber,
    referralVersion: referral.referralVersion,
    referralType: referral.referralType,
    priority: referral.priority,
    status: referral.status,
    sourceEncounterId: referral.sourceEncounterId,
    requestingProviderId: referral.requestingProviderId,
    assignedProviderId: referral.assignedProviderId,
    targetDepartmentId: referral.target.departmentId,
  };
}

export class ClinicalReferralService {
  public constructor(
    private readonly context: ClinicalEmrContextRepository,
    private readonly referrals: ClinicalReferralRepository,
    private readonly encounters: EncounterRepository,
    private readonly notes: ClinicalNoteRepository,
    private readonly attribution: ClinicalNoteAttributionService,
    private readonly accessPolicy: ClinicalEmrAccessPolicyService,
    private readonly readAuditor: ClinicalEmrSensitiveReadAuditor,
    private readonly dependencies: ClinicalEmrMutationDependencies,
  ) {}

  private async requireEncounter(
    actor: ClinicalEmrActorContext,
    encounterId: string,
  ) {
    const encounter =
      await this.encounters.findById(
        actor.facilityId,
        encounterId,
        true,
      );

    if (encounter === null) {
      throw new ResourceNotFoundError('Clinical encounter was not found');
    }

    return encounter;
  }

  private async authorize(
    actor: ClinicalEmrActorContext,
    encounter: EncounterRecord,
    intendedAction: 'READ' | 'CREATE' | 'UPDATE' | 'CORRECT',
  ): Promise<ClinicalAccessDecision> {
    const decision =
      await this.accessPolicy.authorize({
        actor,
        patientId: encounter.patientId.toHexString(),
        encounterId: encounter._id.toHexString(),
        assignedProviderIds:
          encounter.assignedProviderIds.map((value) => value.toHexString()),
        confidentiality: encounter.confidentiality,
        intendedAction,
      });

    if (!decision.allowed) {
      throw new ForbiddenError(
        decision.denialReason ?? 'Clinical referral access was denied',
      );
    }

    return decision;
  }

  private async validateTarget(
    actor: ClinicalEmrActorContext,
    referralType: CreateClinicalReferralBody['referralType'],
    target: ClinicalReferralTargetRecord,
  ): Promise<void> {
    const hasInternalTarget =
      target.facilityId != null ||
      target.departmentId != null ||
      target.clinicId != null ||
      target.servicePointId != null ||
      target.providerId != null;
    const hasExternalTarget =
      target.externalOrganization != null ||
      target.externalProviderName != null;

    if (referralType === 'EXTERNAL_REFERRAL') {
      if (!hasExternalTarget || hasInternalTarget) {
        throw new ConflictError(
          'External referrals require an external target and cannot contain internal assignment fields',
        );
      }
      return;
    }

    if (hasExternalTarget) {
      throw new ConflictError(
        'Internal referrals cannot contain external target fields',
      );
    }

    if (target.facilityId !== actor.facilityId) {
      throw new ForbiddenError(
        'Cross-facility internal referrals are not permitted by this facility context',
      );
    }

    if (target.departmentId == null) {
      throw new ConflictError(
        'Internal consultation and transfer referrals require a target department',
      );
    }

    const department =
      await this.context.findDepartment(
        actor.facilityId,
        target.departmentId,
      );

    if (
      department === null ||
      department.status !== 'ACTIVE' ||
      !department.isClinical
    ) {
      throw new ConflictError(
        'The referral target department is not an active clinical department in this facility',
      );
    }

    if (target.clinicId != null) {
      const clinic =
        await this.context.findClinic(
          actor.facilityId,
          target.clinicId,
        );

      if (
        clinic === null ||
        clinic.status !== 'ACTIVE' ||
        clinic.departmentId !== target.departmentId
      ) {
        throw new ConflictError(
          'The referral target clinic is not active in the selected department',
        );
      }
    }

    if (target.servicePointId != null) {
      const servicePoint =
        await this.context.findServicePoint(
          actor.facilityId,
          target.servicePointId,
        );

      if (
        servicePoint === null ||
        servicePoint.status !== 'ACTIVE' ||
        servicePoint.departmentId !== target.departmentId ||
        (
          target.clinicId != null &&
          servicePoint.clinicId !== target.clinicId
        )
      ) {
        throw new ConflictError(
          'The referral target service point is not active in the selected department and clinic',
        );
      }
    }

    if (target.providerId != null) {
      const provider =
        await this.context.findProvider(
          actor.facilityId,
          target.providerId,
        );

      if (
        provider === null ||
        !provider.isActive ||
        !provider.isClinical ||
        (
          provider.departmentId != null &&
          provider.departmentId !== target.departmentId
        )
      ) {
        throw new ConflictError(
          'The referral target provider is not an active clinical provider in the selected department',
        );
      }
    }
  }

  private async validateClinicalNote(
    actor: ClinicalEmrActorContext,
    encounterId: string,
    patientId: string,
    clinicalNoteId: string | null | undefined,
  ): Promise<void> {
    if (clinicalNoteId == null) {
      return;
    }

    const note =
      await this.notes.findById(
        actor.facilityId,
        clinicalNoteId,
        false,
      );

    if (
      note === null ||
      note.encounterId.toHexString() !== encounterId ||
      note.patientId.toHexString() !== patientId ||
      note.status === 'ENTERED_IN_ERROR'
    ) {
      throw new ConflictError(
        'The referral clinical-note reference is not valid for this encounter',
      );
    }
  }

  private async allocateNumber(
    facilityId: string,
    now: Date,
  ): Promise<string> {
    const year = now.getUTCFullYear();
    const allocation =
      await this.dependencies.sequence.next(
        facilityId,
        `clinical.referral.number:${year}`,
      );

    return `REF-${year}-${String(allocation.value).padStart(7, '0')}`;
  }

  public async create(
    actor: ClinicalEmrActorContext,
    idempotencyKey: string,
    input: CreateClinicalReferralBody,
  ): Promise<Record<string, unknown>> {
    const encounter =
      await this.requireEncounter(actor, input.sourceEncounterId);
    const providerId =
      await this.attribution.requireActorProvider(
        actor,
        input.requestingProviderId,
      );
    const target =
      normalizeReferralTarget(
        input.target,
        input.referralType,
        actor.facilityId,
      );

    if (encounter.patientId.toHexString() !== input.patientId) {
      throw new ConflictError(
        'The referral patient does not match the source encounter',
      );
    }

    await this.authorize(actor, encounter, 'CREATE');
    await this.validateClinicalNote(
      actor,
      input.sourceEncounterId,
      input.patientId,
      input.sourceClinicalNoteId,
    );
    await this.validateTarget(actor, input.referralType, target);

    const now = this.dependencies.clock.now();
    const referralNumber =
      await this.allocateNumber(actor.facilityId, now);

    return this.dependencies.transactionManager.execute({
      transactionType:
        CLINICAL_EMR_TRANSACTION_TYPES.CREATE_CLINICAL_REFERRAL,
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        clinicalReferralLockKey(actor.facilityId, referralNumber),
        `clinical-emr:encounter:${actor.facilityId}:${input.sourceEncounterId}`,
      ],
      idempotencyPayload: {
        input,
        facilityId: actor.facilityId,
      },
      journalPayload: {
        referralNumber,
        sourceEncounterId: input.sourceEncounterId,
        referralType: input.referralType,
        priority: input.priority,
        targetDepartmentId: target.departmentId,
        targetProviderId: target.providerId,
      },
      execute: async (transaction) => {
        const record =
          await this.referrals.createVersion({
            facilityId: actor.facilityId,
            referralNumber,
            referralVersion: 1,
            patientId: input.patientId,
            sourceEncounterId: input.sourceEncounterId,
            sourceClinicalNoteId:
              input.sourceClinicalNoteId ?? null,
            requestingProviderId: providerId,
            assignedProviderId:
              target.providerId,
            referralType: input.referralType,
            priority: input.priority,
            status: 'REQUESTED',
            changeType: 'CREATED',
            target,
            reason: input.reason,
            clinicalQuestion:
              input.clinicalQuestion ?? null,
            requestedAt: now,
            changedAt: now,
            changedBy: actor.userId,
            transactionId: transaction.transactionId,
            correlationId: actor.correlationId,
            actorUserId: actor.userId,
          });

        await transaction.registerCompensation(
          deleteCreatedClinicalRecordCompensation({
            key: `delete-clinical-referral:${record.id}`,
            collection: 'clinicalReferrals',
            entityId: record.id,
            expectedVersion: record.version,
            transactionId: transaction.transactionId,
          }),
        );

        await this.dependencies.audit.append({
          transactionId: transaction.transactionId,
          deduplicationKey: `clinical-referral-created:${record.id}`,
          action: CLINICAL_EMR_AUDIT_ACTIONS.REFERRAL_CREATED,
          entityType: 'clinicalReferral',
          entityId: record.id,
          ...buildClinicalEmrAuditActorFields(actor),
          occurredAt: now,
          before: null,
          after: referralEventPayload(record),
        });

        await this.publish(record, transaction.transactionId, actor);
        return safeReferralResult(record, true);
      },
    });
  }

  public async transition(
    actor: ClinicalEmrActorContext,
    idempotencyKey: string,
    referralNumber: string,
    input: TransitionClinicalReferralBody,
  ): Promise<Record<string, unknown>> {
    const current =
      await this.referrals.requireLatestByNumber(
        actor.facilityId,
        referralNumber,
        true,
      );

    if (current.version !== input.expectedVersion) {
      throw new ClinicalReferralConcurrencyError();
    }

    if (!activeReferralStatuses.has(current.status)) {
      throw new ConflictError(
        `Referral status ${current.status} cannot be changed`,
      );
    }

    if (!referralTransitions.get(current.status)?.has(input.status)) {
      throw new ConflictError(
        `Referral cannot transition from ${current.status} to ${input.status}`,
      );
    }

    const encounter =
      await this.requireEncounter(actor, current.sourceEncounterId);
    await this.authorize(actor, encounter, 'UPDATE');
    const actorProviderId =
      await this.attribution.resolveActorProvider(actor);

    const assignedProviderId =
      input.assignedProviderId ??
      current.assignedProviderId ??
      current.target.providerId;

    if (
      input.status !== 'CANCELLED' &&
      assignedProviderId !== actorProviderId
    ) {
      throw new ForbiddenError(
        'Referral acceptance, progress, completion, or decline requires the assigned provider',
      );
    }

    if (
      input.status === 'CANCELLED' &&
      actorProviderId !== current.requestingProviderId &&
      actorProviderId !== assignedProviderId
    ) {
      throw new ForbiddenError(
        'Only the requesting or assigned provider may cancel a referral',
      );
    }

    if (
      input.status === 'COMPLETED' &&
      (input.responseSummary?.trim().length ?? 0) < 3
    ) {
      throw new ConflictError(
        'Completed referrals require a response summary',
      );
    }

    if (
      ['DECLINED', 'CANCELLED'].includes(input.status) &&
      (input.reason?.trim().length ?? 0) < 5
    ) {
      throw new ConflictError(
        `${input.status} referrals require a documented reason`,
      );
    }

    const now = this.dependencies.clock.now();

    return this.dependencies.transactionManager.execute({
      transactionType:
        CLINICAL_EMR_TRANSACTION_TYPES.TRANSITION_CLINICAL_REFERRAL,
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        clinicalReferralLockKey(actor.facilityId, current.referralNumber),
      ],
      idempotencyPayload: {
        referralNumber: current.referralNumber,
        input,
      },
      journalPayload: {
        referralNumber: current.referralNumber,
        fromStatus: current.status,
        toStatus: input.status,
        expectedVersion: input.expectedVersion,
      },
      execute: async (transaction) => {
        const latest =
          await this.referrals.requireLatestByNumber(
            actor.facilityId,
            current.referralNumber,
            true,
          );

        if (latest.version !== input.expectedVersion) {
          throw new ClinicalReferralConcurrencyError();
        }

        const nextVersion = latest.referralVersion + 1;
        const record =
          await this.referrals.createVersion({
            facilityId: actor.facilityId,
            referralNumber: latest.referralNumber,
            referralVersion: nextVersion,
            previousVersionId: latest.id,
            patientId: latest.patientId,
            sourceEncounterId: latest.sourceEncounterId,
            sourceClinicalNoteId: latest.sourceClinicalNoteId,
            requestingProviderId: latest.requestingProviderId,
            assignedProviderId,
            referralType: latest.referralType,
            priority: latest.priority,
            status: input.status,
            changeType:
              input.status === 'ACCEPTED'
                ? 'ACCEPTED'
                : input.status === 'IN_PROGRESS'
                  ? 'STARTED'
                  : input.status === 'COMPLETED'
                    ? 'COMPLETED'
                    : input.status === 'DECLINED'
                      ? 'DECLINED'
                      : 'CANCELLED',
            target: latest.target,
            reason: latest.reason ?? 'Clinical referral',
            clinicalQuestion: latest.clinicalQuestion,
            responseSummary:
              input.responseSummary ?? latest.responseSummary,
            decisionReason:
              input.reason ?? latest.decisionReason,
            requestedAt: latest.requestedAt,
            acceptedAt:
              input.status === 'ACCEPTED'
                ? now
                : latest.acceptedAt,
            startedAt:
              input.status === 'IN_PROGRESS'
                ? now
                : latest.startedAt,
            completedAt:
              input.status === 'COMPLETED'
                ? now
                : latest.completedAt,
            declinedAt:
              input.status === 'DECLINED'
                ? now
                : latest.declinedAt,
            cancelledAt:
              input.status === 'CANCELLED'
                ? now
                : latest.cancelledAt,
            changedAt: now,
            changedBy: actor.userId,
            transactionId: transaction.transactionId,
            correlationId: actor.correlationId,
            actorUserId: actor.userId,
          });

        await transaction.registerCompensation(
          deleteCreatedClinicalRecordCompensation({
            key: `delete-clinical-referral:${record.id}`,
            collection: 'clinicalReferrals',
            entityId: record.id,
            expectedVersion: record.version,
            transactionId: transaction.transactionId,
          }),
        );

        await this.dependencies.audit.append({
          transactionId: transaction.transactionId,
          deduplicationKey: `clinical-referral-transition:${record.id}`,
          action: CLINICAL_EMR_AUDIT_ACTIONS.REFERRAL_STATUS_CHANGED,
          entityType: 'clinicalReferral',
          entityId: record.id,
          ...buildClinicalEmrAuditActorFields(actor),
          occurredAt: now,
          ...(input.reason === undefined || input.reason === null
            ? {}
            : {
                reason: input.reason,
              }),
          before: referralEventPayload(latest),
          after: referralEventPayload(record),
        });

        await this.publish(record, transaction.transactionId, actor);
        return safeReferralResult(record, true);
      },
    });
  }

  public async correct(
    actor: ClinicalEmrActorContext,
    idempotencyKey: string,
    referralNumber: string,
    input: CorrectClinicalReferralBody,
  ): Promise<Record<string, unknown>> {
    const current =
      await this.referrals.requireLatestByNumber(
        actor.facilityId,
        referralNumber,
        true,
      );

    if (current.version !== input.expectedVersion) {
      throw new ClinicalReferralConcurrencyError();
    }

    const replacementTarget =
      normalizeReferralTarget(
        input.replacement.target,
        input.replacement.referralType,
        actor.facilityId,
      );
    const encounter =
      await this.requireEncounter(actor, current.sourceEncounterId);
    await this.authorize(actor, encounter, 'CORRECT');
    await this.validateClinicalNote(
      actor,
      current.sourceEncounterId,
      current.patientId,
      input.replacement.sourceClinicalNoteId,
    );
    await this.validateTarget(
      actor,
      input.replacement.referralType,
      replacementTarget,
    );

    const now = this.dependencies.clock.now();

    return this.dependencies.transactionManager.execute({
      transactionType:
        CLINICAL_EMR_TRANSACTION_TYPES.CORRECT_CLINICAL_REFERRAL,
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        clinicalReferralLockKey(actor.facilityId, current.referralNumber),
      ],
      idempotencyPayload: {
        referralNumber: current.referralNumber,
        input,
      },
      journalPayload: {
        referralNumber: current.referralNumber,
        expectedVersion: input.expectedVersion,
        operation: 'CORRECT',
      },
      execute: async (transaction) => {
        const latest =
          await this.referrals.requireLatestByNumber(
            actor.facilityId,
            current.referralNumber,
            true,
          );

        if (latest.version !== input.expectedVersion) {
          throw new ClinicalReferralConcurrencyError();
        }

        const marker =
          await this.referrals.createVersion({
            facilityId: actor.facilityId,
            referralNumber: latest.referralNumber,
            referralVersion: latest.referralVersion + 1,
            previousVersionId: latest.id,
            patientId: latest.patientId,
            sourceEncounterId: latest.sourceEncounterId,
            sourceClinicalNoteId: latest.sourceClinicalNoteId,
            requestingProviderId: latest.requestingProviderId,
            assignedProviderId: latest.assignedProviderId,
            referralType: latest.referralType,
            priority: latest.priority,
            status: 'CORRECTED',
            changeType: 'CORRECTED',
            target: latest.target,
            reason: latest.reason ?? 'Clinical referral',
            clinicalQuestion: latest.clinicalQuestion,
            responseSummary: latest.responseSummary,
            decisionReason: latest.decisionReason,
            requestedAt: latest.requestedAt,
            acceptedAt: latest.acceptedAt,
            startedAt: latest.startedAt,
            completedAt: latest.completedAt,
            declinedAt: latest.declinedAt,
            cancelledAt: latest.cancelledAt,
            changedAt: now,
            changedBy: actor.userId,
            correctionReason: input.correctionReason,
            replacesVersionId: latest.id,
            transactionId: transaction.transactionId,
            correlationId: actor.correlationId,
            actorUserId: actor.userId,
          });

        await transaction.registerCompensation(
          deleteCreatedClinicalRecordCompensation({
            key: `delete-clinical-referral:${marker.id}`,
            collection: 'clinicalReferrals',
            entityId: marker.id,
            expectedVersion: marker.version,
            transactionId: transaction.transactionId,
          }),
        );

        const replacement =
          await this.referrals.createVersion({
            facilityId: actor.facilityId,
            referralNumber: latest.referralNumber,
            referralVersion: latest.referralVersion + 2,
            previousVersionId: marker.id,
            patientId: latest.patientId,
            sourceEncounterId: latest.sourceEncounterId,
            sourceClinicalNoteId:
              input.replacement.sourceClinicalNoteId ?? null,
            requestingProviderId: latest.requestingProviderId,
            assignedProviderId:
              replacementTarget.providerId,
            referralType: input.replacement.referralType,
            priority: input.replacement.priority,
            status: 'REQUESTED',
            changeType: 'CREATED',
            target: replacementTarget,
            reason: input.replacement.reason,
            clinicalQuestion:
              input.replacement.clinicalQuestion ?? null,
            requestedAt: latest.requestedAt,
            changedAt: now,
            changedBy: actor.userId,
            transactionId: transaction.transactionId,
            correlationId: actor.correlationId,
            actorUserId: actor.userId,
          });

        await transaction.registerCompensation(
          deleteCreatedClinicalRecordCompensation({
            key: `delete-clinical-referral:${replacement.id}`,
            collection: 'clinicalReferrals',
            entityId: replacement.id,
            expectedVersion: replacement.version,
            transactionId: transaction.transactionId,
          }),
        );

        await this.dependencies.audit.append({
          transactionId: transaction.transactionId,
          deduplicationKey: `clinical-referral-corrected:${replacement.id}`,
          action: CLINICAL_EMR_AUDIT_ACTIONS.REFERRAL_CORRECTED,
          entityType: 'clinicalReferral',
          entityId: replacement.id,
          ...buildClinicalEmrAuditActorFields(actor),
          occurredAt: now,
          reason: input.correctionReason,
          before: referralEventPayload(latest),
          after: referralEventPayload(replacement),
        });

        await this.publish(replacement, transaction.transactionId, actor);

        return {
          corrected: safeReferralResult(marker, false),
          replacement: safeReferralResult(replacement, true),
        };
      },
    });
  }

  public async get(
    actor: ClinicalEmrActorContext,
    referralNumber: string,
  ): Promise<Record<string, unknown>> {
    const referral =
      await this.referrals.requireLatestByNumber(
        actor.facilityId,
        referralNumber,
        true,
      );
    const encounter =
      await this.requireEncounter(actor, referral.sourceEncounterId);
    const decision =
      await this.authorize(actor, encounter, 'READ');

    await this.readAuditor.recordRead({
      actor,
      patientId: referral.patientId,
      encounterId: referral.sourceEncounterId,
      entityType: 'clinicalReferral',
      entityId: referral.id,
      resource: 'ENCOUNTER_DETAIL',
      accessDecision: decision,
      returnedFieldGroups: [
        'identity',
        'status',
        'target',
        'clinicalContent',
        'version',
      ],
      occurredAt: this.dependencies.clock.now(),
    });

    return safeReferralResult(referral, true);
  }

  public async history(
    actor: ClinicalEmrActorContext,
    referralNumber: string,
  ): Promise<Record<string, unknown>[]> {
    const latest =
      await this.referrals.requireLatestByNumber(
        actor.facilityId,
        referralNumber,
        true,
      );
    const encounter =
      await this.requireEncounter(actor, latest.sourceEncounterId);
    const decision =
      await this.authorize(actor, encounter, 'READ');
    const history =
      await this.referrals.listHistory(
        actor.facilityId,
        referralNumber,
        true,
      );

    await this.readAuditor.recordRead({
      actor,
      patientId: latest.patientId,
      encounterId: latest.sourceEncounterId,
      entityType: 'clinicalReferral',
      entityId: latest.id,
      resource: 'ENCOUNTER_DETAIL',
      accessDecision: decision,
      returnedFieldGroups: [
        'statusHistory',
        'clinicalContent',
        'attribution',
        'version',
      ],
      occurredAt: this.dependencies.clock.now(),
    });

    return history.map((record) => safeReferralResult(record, true));
  }

  public async list(
    actor: ClinicalEmrActorContext,
    query: ClinicalReferralListQuery,
  ) {
    const canReadAll =
      actor.permissionKeys.includes(
        CLINICAL_EMR_PERMISSION_KEYS.ENCOUNTER_READ_ALL,
      );
    const providerId =
      canReadAll
        ? query.assignedProviderId
        : await this.attribution.resolveActorProvider(actor);

    const result =
      await this.referrals.listLatest(
        actor.facilityId,
        {
          ...query,
          ...(providerId === undefined
            ? {}
            : {
                assignedProviderId: providerId,
              }),
          ...(query.changedFrom === undefined
            ? {}
            : {
                changedFrom: new Date(query.changedFrom),
              }),
          ...(query.changedTo === undefined
            ? {}
            : {
                changedTo: new Date(query.changedTo),
              }),
        },
        false,
      );

    return {
      items: result.items.map((record) => safeReferralResult(record, false)),
      page: query.page,
      pageSize: query.pageSize,
      totalItems: result.totalItems,
      totalPages:
        result.totalItems === 0
          ? 0
          : Math.ceil(result.totalItems / query.pageSize),
    };
  }

  private async publish(
    referral: ClinicalReferralRecord,
    transactionId: string,
    actor: ClinicalEmrActorContext,
  ): Promise<void> {
    const payload = referralEventPayload(referral);

    await this.dependencies.outbox.enqueue({
      transactionId,
      deduplicationKey: `clinical-referral-event:${referral.id}`,
      eventType: CLINICAL_EMR_OUTBOX_EVENTS.REFERRAL_CHANGED,
      aggregateType: 'clinicalReferral',
      aggregateId: referral.id,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      occurredAt: referral.changedAt,
      payload,
    });

    await this.dependencies.realtime.publish({
      eventType: CLINICAL_EMR_REALTIME_EVENTS.REFERRAL_CHANGED,
      facilityId: actor.facilityId,
      patientId: referral.patientId,
      encounterId: referral.sourceEncounterId,
      providerId:
        referral.assignedProviderId ?? referral.requestingProviderId,
      payload,
    });

    await this.dependencies.realtime.publish({
      eventType: CLINICAL_EMR_REALTIME_EVENTS.PATIENT_TIMELINE_CHANGED,
      facilityId: actor.facilityId,
      patientId: referral.patientId,
      encounterId: referral.sourceEncounterId,
      payload: {
        referralNumber: referral.referralNumber,
        status: referral.status,
      },
    });
  }
}

export class ClinicalEmrQueryService {
  public constructor(
    private readonly reads: ClinicalEmrReadRepository,
    private readonly encounters: EncounterRepository,
    private readonly encounterHistory: EncounterStatusHistoryRepository,
    private readonly notes: ClinicalNoteRepository,
    private readonly noteVersions: ClinicalNoteVersionRepository,
    private readonly diagnosisCatalog: DiagnosisRepository,
    private readonly encounterDiagnoses: EncounterDiagnosisRepository,
    private readonly problems: PatientProblemRepository,
    private readonly problemVersions: PatientProblemVersionRepository,
    private readonly allergyCatalog: AllergyRepository,
    private readonly allergies: PatientAllergyRepository,
    private readonly allergyVersions: PatientAllergyVersionRepository,
    private readonly vitalSigns: VitalSignRepository,
    private readonly attribution: ClinicalNoteAttributionService,
    private readonly accessPolicy: ClinicalEmrAccessPolicyService,
    private readonly readAuditor: ClinicalEmrSensitiveReadAuditor,
    private readonly snapshotCrypto: ClinicalEmrSnapshotCryptoPort,
    private readonly now: () => Date,
  ) {}

  private async authorizeEncounter(
    actor: ClinicalEmrActorContext,
    encounterId: string,
  ) {
    const encounter =
      await this.encounters.findById(
        actor.facilityId,
        encounterId,
        true,
      );

    if (encounter === null) {
      throw new ResourceNotFoundError('Clinical encounter was not found');
    }

    const decision =
      await this.accessPolicy.authorize({
        actor,
        patientId: encounter.patientId.toHexString(),
        encounterId,
        assignedProviderIds:
          encounter.assignedProviderIds.map((value) => value.toHexString()),
        confidentiality: encounter.confidentiality,
        intendedAction: 'READ',
      });

    if (!decision.allowed) {
      throw new ForbiddenError(
        decision.denialReason ?? 'Clinical read access was denied',
      );
    }

    return {
      encounter,
      decision,
    };
  }

  private async authorizePatient(
    actor: ClinicalEmrActorContext,
    patientId: string,
  ) {
    const canReadAll =
      actor.permissionKeys.includes(
        CLINICAL_EMR_PERMISSION_KEYS.ENCOUNTER_READ_ALL,
      );
    const providerId =
      canReadAll
        ? undefined
        : await this.attribution.resolveActorProvider(actor);
    const page =
      await this.reads.listEncounters(actor.facilityId, {
        page: 1,
        pageSize: 1,
        patientId,
        ...(providerId === undefined
          ? {}
          : {
              providerId,
            }),
        sortBy: 'startedAt',
        sortDirection: 'desc',
      });
    const encounter = page.items[0];

    if (encounter === undefined) {
      throw new ResourceNotFoundError(
        'No accessible clinical encounter was found for this patient',
      );
    }

    return this.authorizeEncounter(
      actor,
      String(encounter['id']),
    );
  }

  private decryptVersionSnapshot(
    encryptedSnapshot: ClinicalEmrEncryptedSnapshot,
    associatedData: string,
    expectedHash: string,
  ): unknown {
    const snapshot =
      this.snapshotCrypto.unprotect<unknown>(
        encryptedSnapshot,
        associatedData,
      );

    if (
      !this.snapshotCrypto.matchesHash(
        snapshot,
        associatedData,
        expectedHash,
      )
    ) {
      throw new ConflictError(
        'The immutable clinical history snapshot failed integrity verification',
      );
    }

    return serializeClinicalHistoryValue(snapshot);
  }

  public async listDiagnosisCatalog(
    actor: ClinicalEmrActorContext,
    query: DiagnosisCatalogRouteQuery,
  ) {
    return this.diagnosisCatalog.list(actor.facilityId, query);
  }

  public async listAllergyCatalog(
    actor: ClinicalEmrActorContext,
    query: AllergyCatalogRouteQuery,
  ) {
    return this.allergyCatalog.list(actor.facilityId, query);
  }

  public async listEncounterDiagnoses(
    actor: ClinicalEmrActorContext,
    query: EncounterDiagnosisRouteQuery,
  ) {
    const access =
      query.encounterId === undefined
        ? await this.authorizePatient(actor, query.patientId as string)
        : await this.authorizeEncounter(actor, query.encounterId);
    const records =
      query.encounterId === undefined
        ? await this.encounterDiagnoses.listForPatient(
            actor.facilityId,
            query.patientId as string,
            true,
          )
        : await this.encounterDiagnoses.listForEncounter(
            actor.facilityId,
            query.encounterId,
            false,
          );
    const filtered =
      query.status === undefined
        ? records
        : records.filter((record) => record.status === query.status);
    const offset = (query.page - 1) * query.pageSize;
    const ordered = [...filtered].sort((left, right) => {
      const comparison =
        left.recordedAt.getTime() - right.recordedAt.getTime();
      return query.sortDirection === 'asc' ? comparison : -comparison;
    });
    const items = ordered.slice(offset, offset + query.pageSize);

    await this.readAuditor.recordRead({
      actor,
      patientId: access.encounter.patientId.toHexString(),
      encounterId: access.encounter._id.toHexString(),
      entityType: 'patient',
      entityId: access.encounter.patientId.toHexString(),
      resource: 'DIAGNOSIS_HISTORY',
      accessDecision: access.decision,
      returnedFieldGroups: [
        'diagnosisCodes',
        'diagnosisStatus',
        'certainty',
        'attribution',
      ],
      occurredAt: this.now(),
    });

    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      totalItems: ordered.length,
      totalPages:
        ordered.length === 0
          ? 0
          : Math.ceil(ordered.length / query.pageSize),
    };
  }

  public async listPatientProblems(
    actor: ClinicalEmrActorContext,
    query: PatientProblemRouteQuery,
  ) {
    const access = await this.authorizePatient(actor, query.patientId);
    const result =
      await this.problems.list(actor.facilityId, query, true);

    await this.readAuditor.recordRead({
      actor,
      patientId: query.patientId,
      encounterId: access.encounter._id.toHexString(),
      entityType: 'patient',
      entityId: query.patientId,
      resource: 'PROBLEM_LIST',
      accessDecision: access.decision,
      returnedFieldGroups: [
        'problemList',
        'status',
        'clinicalSummary',
        'attribution',
      ],
      occurredAt: this.now(),
    });

    return result;
  }

  public async listPatientAllergies(
    actor: ClinicalEmrActorContext,
    query: PatientAllergyRouteQuery,
  ) {
    const access = await this.authorizePatient(actor, query.patientId);
    const result =
      await this.allergies.list(actor.facilityId, query, true);

    await this.readAuditor.recordRead({
      actor,
      patientId: query.patientId,
      encounterId: access.encounter._id.toHexString(),
      entityType: 'patient',
      entityId: query.patientId,
      resource: 'ALLERGY_HISTORY',
      accessDecision: access.decision,
      returnedFieldGroups: [
        'allergies',
        'adverseReactions',
        'severity',
        'verification',
      ],
      occurredAt: this.now(),
    });

    return result;
  }

  public async listVitalSigns(
    actor: ClinicalEmrActorContext,
    query: VitalSignRouteQuery,
  ) {
    const access =
      query.encounterId === undefined
        ? await this.authorizePatient(actor, query.patientId as string)
        : await this.authorizeEncounter(actor, query.encounterId);
    const result =
      await this.vitalSigns.list(actor.facilityId, query, false);

    await this.readAuditor.recordRead({
      actor,
      patientId: access.encounter.patientId.toHexString(),
      encounterId: access.encounter._id.toHexString(),
      entityType: 'patient',
      entityId: access.encounter.patientId.toHexString(),
      resource: 'ENCOUNTER_DETAIL',
      accessDecision: access.decision,
      returnedFieldGroups: [
        'vitalSigns',
        'measurements',
        'attribution',
        'correctionStatus',
      ],
      occurredAt: this.now(),
    });

    return result;
  }

  public async encounterHistoryById(
    actor: ClinicalEmrActorContext,
    encounterId: string,
  ) {
    const access =
      await this.authorizeEncounter(actor, encounterId);
    const history =
      await this.encounterHistory.listForEncounter(
        actor.facilityId,
        encounterId,
        true,
      );

    await this.readAuditor.recordRead({
      actor,
      patientId: access.encounter.patientId.toHexString(),
      encounterId,
      entityType: 'encounter',
      entityId: encounterId,
      resource: 'ENCOUNTER_DETAIL',
      accessDecision: access.decision,
      returnedFieldGroups: [
        'statusHistory',
        'ownershipHistory',
        'reasons',
      ],
      occurredAt: this.now(),
    });

    return history.map(serializeClinicalHistoryValue);
  }

  public async clinicalNoteHistory(
    actor: ClinicalEmrActorContext,
    clinicalNoteId: string,
  ) {
    const note =
      await this.notes.findById(
        actor.facilityId,
        clinicalNoteId,
        true,
      );

    if (note === null) {
      throw new ResourceNotFoundError('Clinical note was not found');
    }

    const access =
      await this.authorizeEncounter(
        actor,
        note.encounterId.toHexString(),
      );
    const decision =
      await this.accessPolicy.authorize({
        actor,
        patientId: note.patientId.toHexString(),
        encounterId: note.encounterId.toHexString(),
        assignedProviderIds:
          access.encounter.assignedProviderIds.map(
            (value) => value.toHexString(),
          ),
        confidentiality: note.confidentiality,
        documentType: note.documentType,
        intendedAction: 'READ',
      });

    if (!decision.allowed) {
      throw new ForbiddenError(
        decision.denialReason ?? 'Clinical note history access was denied',
      );
    }

    const versions =
      await this.noteVersions.listForNote(
        actor.facilityId,
        clinicalNoteId,
        true,
      );
    const history =
      versions.map((version) => ({
        versionId: version._id.toHexString(),
        versionNumber: version.versionNumber,
        previousVersionId:
          version.previousVersionId?.toHexString() ?? null,
        changeType: version.changeType,
        status: version.statusSnapshot,
        documentType: version.documentTypeSnapshot,
        confidentiality: version.confidentialitySnapshot,
        changeReason: version.changeReason,
        authorProviderId: version.authorProviderId.toHexString(),
        signedBy: version.signedBy?.toHexString() ?? null,
        signatureMethod: version.signatureMethod,
        recordedAt: version.recordedAt.toISOString(),
        recordedBy: version.recordedBy.toHexString(),
        snapshot:
          this.decryptVersionSnapshot(
            version.encryptedSnapshot,
            clinicalNoteVersionAssociatedData(
              actor.facilityId,
              clinicalNoteId,
              version.versionNumber,
            ),
            version.snapshotHash,
          ),
      }));

    await this.readAuditor.recordRead({
      actor,
      patientId: note.patientId.toHexString(),
      encounterId: note.encounterId.toHexString(),
      entityType: 'clinicalNote',
      entityId: clinicalNoteId,
      resource: 'CLINICAL_NOTE_VERSION',
      accessDecision: decision,
      returnedFieldGroups: [
        'versionMetadata',
        'clinicalContent',
        'attribution',
        'correctionReasons',
      ],
      occurredAt: this.now(),
    });

    return history;
  }

  public async patientProblemHistory(
    actor: ClinicalEmrActorContext,
    patientProblemId: string,
  ) {
    const problem =
      await this.problems.findById(
        actor.facilityId,
        patientProblemId,
        true,
      );

    if (problem === null) {
      throw new ResourceNotFoundError('Patient problem was not found');
    }

    const access =
      await this.authorizeEncounter(
        actor,
        problem.sourceEncounterId.toHexString(),
      );
    const versions =
      await this.problemVersions.listForProblem(
        actor.facilityId,
        patientProblemId,
        true,
      );
    const history =
      versions.map((version) => ({
        versionId: version._id.toHexString(),
        versionNumber: version.versionNumber,
        previousVersionId:
          version.previousVersionId?.toHexString() ?? null,
        changeType: version.changeType,
        status: version.statusSnapshot,
        changeReason: version.changeReason,
        recordedAt: version.recordedAt.toISOString(),
        recordedBy: version.recordedBy.toHexString(),
        snapshot:
          this.decryptVersionSnapshot(
            version.encryptedSnapshot,
            patientProblemVersionAssociatedData(
              actor.facilityId,
              patientProblemId,
              version.versionNumber,
            ),
            version.snapshotHash,
          ),
      }));

    await this.readAuditor.recordRead({
      actor,
      patientId: problem.patientId.toHexString(),
      encounterId: problem.sourceEncounterId.toHexString(),
      entityType: 'patientProblem',
      entityId: patientProblemId,
      resource: 'PROBLEM_LIST',
      accessDecision: access.decision,
      returnedFieldGroups: [
        'versionMetadata',
        'problemContent',
        'correctionReasons',
      ],
      occurredAt: this.now(),
    });

    return history;
  }

  public async patientAllergyHistory(
    actor: ClinicalEmrActorContext,
    patientAllergyId: string,
  ) {
    const allergy =
      await this.allergies.findById(
        actor.facilityId,
        patientAllergyId,
        true,
      );

    if (allergy === null || allergy.sourceEncounterId === null) {
      throw new ResourceNotFoundError(
        'Patient allergy history or source encounter was not found',
      );
    }

    const access =
      await this.authorizeEncounter(
        actor,
        allergy.sourceEncounterId.toHexString(),
      );
    const versions =
      await this.allergyVersions.listForAllergy(
        actor.facilityId,
        patientAllergyId,
        true,
      );
    const history =
      versions.map((version) => ({
        versionId: version._id.toHexString(),
        versionNumber: version.versionNumber,
        previousVersionId:
          version.previousVersionId?.toHexString() ?? null,
        status: version.statusSnapshot,
        changeReason: version.changeReason,
        recordedAt: version.recordedAt.toISOString(),
        recordedBy: version.recordedBy.toHexString(),
        snapshot:
          this.decryptVersionSnapshot(
            version.encryptedSnapshot,
            patientAllergyVersionAssociatedData(
              actor.facilityId,
              patientAllergyId,
              version.versionNumber,
            ),
            version.snapshotHash,
          ),
      }));

    await this.readAuditor.recordRead({
      actor,
      patientId: allergy.patientId.toHexString(),
      encounterId: allergy.sourceEncounterId.toHexString(),
      entityType: 'patientAllergy',
      entityId: patientAllergyId,
      resource: 'ALLERGY_HISTORY',
      accessDecision: access.decision,
      returnedFieldGroups: [
        'versionMetadata',
        'allergyContent',
        'adverseReactions',
        'correctionReasons',
      ],
      occurredAt: this.now(),
    });

    return history;
  }

  public async vitalSignHistory(
    actor: ClinicalEmrActorContext,
    vitalSignId: string,
  ) {
    const vitalSign =
      await this.vitalSigns.findById(
        actor.facilityId,
        vitalSignId,
        true,
      );

    if (vitalSign === null) {
      throw new ResourceNotFoundError('Vital-sign record was not found');
    }

    const access =
      await this.authorizeEncounter(
        actor,
        vitalSign.encounterId.toHexString(),
      );
    const history =
      await this.reads.vitalSignHistory(
        actor.facilityId,
        vitalSignId,
      );

    await this.readAuditor.recordRead({
      actor,
      patientId: vitalSign.patientId.toHexString(),
      encounterId: vitalSign.encounterId.toHexString(),
      entityType: 'vitalSign',
      entityId: vitalSignId,
      resource: 'ENCOUNTER_DETAIL',
      accessDecision: access.decision,
      returnedFieldGroups: [
        'measurements',
        'correctionChain',
        'attribution',
        'correctionReasons',
      ],
      occurredAt: this.now(),
    });

    return history;
  }

  public async listEncounters(
    actor: ClinicalEmrActorContext,
    query: EncounterListQuery,
  ) {
    const canReadAll =
      actor.permissionKeys.includes(
        CLINICAL_EMR_PERMISSION_KEYS.ENCOUNTER_READ_ALL,
      );

    const providerId =
      canReadAll
        ? query.providerId
        : await this.attribution.resolveActorProvider(actor);

    return this.reads.listEncounters(
      actor.facilityId,
      {
        ...query,
        ...(providerId === undefined
          ? {}
          : {
              providerId,
            }),
      },
    );
  }

  public async getEncounter(
    actor: ClinicalEmrActorContext,
    encounterId: string,
  ) {
    const access =
      await this.authorizeEncounter(actor, encounterId);
    const record =
      await this.reads.findEncounterById(
        actor.facilityId,
        encounterId,
      );

    await this.readAuditor.recordRead({
      actor,
      patientId: access.encounter.patientId.toHexString(),
      encounterId,
      entityType: 'encounter',
      entityId: encounterId,
      resource: 'ENCOUNTER_DETAIL',
      accessDecision: access.decision,
      returnedFieldGroups: access.decision.minimumNecessaryFields,
      occurredAt: this.now(),
    });

    return record;
  }

  public async listClinicalNotes(
    actor: ClinicalEmrActorContext,
    query: ClinicalNoteListQuery,
  ) {
    if (query.encounterId != null) {
      await this.authorizeEncounter(actor, query.encounterId);
    } else if (
      !actor.permissionKeys.includes(
        CLINICAL_EMR_PERMISSION_KEYS.ENCOUNTER_READ_ALL,
      )
    ) {
      throw new ForbiddenError(
        'Assigned-only clinical note reads require an encounter filter',
      );
    }

    return this.reads.listClinicalNotes(actor.facilityId, query);
  }

  public async getClinicalNote(
    actor: ClinicalEmrActorContext,
    clinicalNoteId: string,
  ) {
    const summary =
      await this.reads.findClinicalNoteById(
        actor.facilityId,
        clinicalNoteId,
        false,
      );

    if (summary === null) {
      throw new ResourceNotFoundError('Clinical note was not found');
    }

    const encounterId = String(summary['encounterId']);
    const access =
      await this.authorizeEncounter(actor, encounterId);
    const decision =
      await this.accessPolicy.authorize({
        actor,
        patientId: String(summary['patientId']),
        encounterId,
        assignedProviderIds:
          access.encounter.assignedProviderIds.map((value) => value.toHexString()),
        confidentiality:
          summary['confidentiality'] as 'ROUTINE' | 'RESTRICTED' | 'HIGHLY_RESTRICTED',
        documentType: summary['documentType'],
        intendedAction: 'READ',
      });

    if (!decision.allowed) {
      throw new ForbiddenError(
        decision.denialReason ?? 'Clinical note access was denied',
      );
    }

    const record =
      await this.reads.findClinicalNoteById(
        actor.facilityId,
        clinicalNoteId,
        true,
      );

    await this.readAuditor.recordRead({
      actor,
      patientId: String(summary['patientId']),
      encounterId,
      entityType: 'clinicalNote',
      entityId: clinicalNoteId,
      resource: 'CLINICAL_NOTE',
      accessDecision: decision,
      returnedFieldGroups: decision.minimumNecessaryFields,
      occurredAt: this.now(),
    });

    return record;
  }

  public async patientSummary(
    actor: ClinicalEmrActorContext,
    patientId: string,
    query: {
      encounterLimit: number;
      timelineLimit: number;
      includeEnteredInError: boolean;
    },
  ) {
    const canReadAll =
      actor.permissionKeys.includes(
        CLINICAL_EMR_PERMISSION_KEYS.ENCOUNTER_READ_ALL,
      );
    const providerId =
      canReadAll
        ? undefined
        : await this.attribution.resolveActorProvider(actor);
    const page =
      await this.reads.listEncounters(actor.facilityId, {
        page: 1,
        pageSize: 1,
        patientId,
        ...(providerId === undefined
          ? {}
          : {
              providerId,
            }),
        sortBy: 'startedAt',
        sortDirection: 'desc',
      });

    const latest = page.items[0];
    if (latest === undefined) {
      throw new ResourceNotFoundError(
        'No clinical encounter was found for this patient',
      );
    }

    const access =
      await this.authorizeEncounter(actor, String(latest['id']));
    const [summary, timeline] =
      await Promise.all([
        this.reads.patientSummary(
          actor.facilityId,
          patientId,
          query.encounterLimit,
        ),
        this.reads.timeline(
          actor.facilityId,
          patientId,
          {
            includeEnteredInError: query.includeEnteredInError,
            limit: query.timelineLimit,
          },
        ),
      ]);

    await this.readAuditor.recordRead({
      actor,
      patientId,
      encounterId: String(latest['id']),
      entityType: 'patient',
      entityId: patientId,
      resource: 'EMR_TIMELINE',
      accessDecision: access.decision,
      returnedFieldGroups: [
        'encounters',
        'problems',
        'allergies',
        'latestVitals',
        'referrals',
        'timeline',
      ],
      occurredAt: this.now(),
    });

    return {
      ...summary,
      timeline,
    };
  }

  public async timeline(
    actor: ClinicalEmrActorContext,
    query: ClinicalTimelineQuery,
  ) {
    const canReadAll =
      actor.permissionKeys.includes(
        CLINICAL_EMR_PERMISSION_KEYS.ENCOUNTER_READ_ALL,
      );
    const providerId =
      canReadAll
        ? undefined
        : await this.attribution.resolveActorProvider(actor);
    const accessibleEncounters =
      await this.reads.listEncounters(actor.facilityId, {
        page: 1,
        pageSize: 1,
        patientId: query.patientId,
        ...(providerId === undefined
          ? {}
          : {
              providerId,
            }),
        sortBy: 'startedAt',
        sortDirection: 'desc',
      });
    const latest = accessibleEncounters.items[0];

    if (latest === undefined) {
      throw new ResourceNotFoundError(
        'No accessible clinical encounter was found for this patient',
      );
    }

    const access =
      await this.authorizeEncounter(actor, String(latest['id']));
    const offset = (query.page - 1) * query.pageSize;
    const fetchLimit =
      Math.min(offset + query.pageSize + 1, 500);
    const entries =
      await this.reads.timeline(
        actor.facilityId,
        query.patientId,
        {
          ...(query.dateFrom === undefined
            ? {}
            : {
                dateFrom: new Date(query.dateFrom),
              }),
          ...(query.dateTo === undefined
            ? {}
            : {
                dateTo: new Date(query.dateTo),
              }),
          includeEnteredInError:
            query.includeEnteredInError ?? false,
          ...(query.encounterType === undefined
            ? {}
            : {
                encounterType: query.encounterType,
              }),
          sortDirection: query.sortDirection,
          limit: fetchLimit,
        },
      );
    const hasMore = entries.length > offset + query.pageSize;
    const items = entries.slice(offset, offset + query.pageSize);
    const totalItems = hasMore
      ? offset + query.pageSize + 1
      : entries.length;

    await this.readAuditor.recordRead({
      actor,
      patientId: query.patientId,
      encounterId: String(latest['id']),
      entityType: 'patient',
      entityId: query.patientId,
      resource: 'EMR_TIMELINE',
      accessDecision: access.decision,
      returnedFieldGroups: [
        'encounters',
        'clinicalNotes',
        'diagnoses',
        'problems',
        'allergies',
        'vitalSigns',
        'referrals',
      ],
      occurredAt: this.now(),
    });

    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages:
        totalItems === 0
          ? 0
          : Math.ceil(totalItems / query.pageSize),
      hasMore,
      truncated:
        fetchLimit === 500 && entries.length === fetchLimit,
    };
  }

  public async providerWorklist(
    actor: ClinicalEmrActorContext,
    providerId: string,
    query: {
      page: number;
      pageSize: number;
      serviceDate?: string;
      status?: string;
    },
  ) {
    const actorProviderId =
      await this.attribution.resolveActorProvider(actor);

    if (
      actorProviderId !== providerId &&
      !actor.permissionKeys.includes(
        CLINICAL_EMR_PERMISSION_KEYS.ENCOUNTER_READ_ALL,
      )
    ) {
      throw new ForbiddenError(
        'Assigned-only users may open only their own clinical worklist',
      );
    }

    return this.reads.providerWorklist(
      actor.facilityId,
      providerId,
      query,
    );
  }
}

export interface CreateClinicalEmrApplicationOptions {
  database: Db;
  dependencies: ClinicalEmrMutationDependencies;
  numbers: ClinicalEmrNumberService;
}

export function createClinicalEmrApplication(
  options: CreateClinicalEmrApplicationOptions,
) {
  const contextRepository =
    new ClinicalEmrContextRepository();
  const encounterRepository =
    new EncounterRepository();
  const historyRepository =
    new EncounterStatusHistoryRepository();
  const noteRepository =
    new ClinicalNoteRepository();
  const noteVersionRepository =
    new ClinicalNoteVersionRepository();
  const diagnosisRepository =
    new DiagnosisRepository();
  const encounterDiagnosisRepository =
    new EncounterDiagnosisRepository();
  const problemRepository =
    new PatientProblemRepository();
  const problemVersionRepository =
    new PatientProblemVersionRepository();
  const allergyCatalogRepository =
    new AllergyRepository();
  const allergyRepository =
    new PatientAllergyRepository();
  const allergyVersionRepository =
    new PatientAllergyVersionRepository();
  const vitalSignRepository =
    new VitalSignRepository();
  const referralRepository =
    new ClinicalReferralRepository();
  const readRepository =
    new ClinicalEmrReadRepository(options.database);

  const contextService =
    new ClinicalEmrContextService(contextRepository);
  const attributionService =
    new ClinicalNoteAttributionService(contextRepository);
  const accessPolicy =
    new ClinicalEmrAccessPolicyService(contextRepository);
  const sensitiveReadAuditor =
    new ClinicalEmrSensitiveReadAuditor(options.dependencies.audit);
  const patientResolution =
    new ClinicalEmrPatientResolutionService();

  const noteSupport =
    new ClinicalNoteCommandService(
      noteRepository,
      noteVersionRepository,
      encounterRepository,
      options.numbers,
      attributionService,
      options.dependencies,
    );

  const listSupport =
    new ClinicalListCommandService(
      encounterRepository,
      noteRepository,
      attributionService,
      options.dependencies,
    );

  const diagnosisSupport =
    new DiagnosisCommandService(
      encounterDiagnosisRepository,
      diagnosisRepository,
      listSupport,
    );

  const problemSupport =
    new PatientProblemCommandService(
      problemRepository,
      problemVersionRepository,
      diagnosisRepository,
      encounterDiagnosisRepository,
      options.numbers,
      listSupport,
    );

  const allergySupport =
    new PatientAllergyCommandService(
      allergyRepository,
      allergyVersionRepository,
      allergyCatalogRepository,
      listSupport,
    );

  const vitalSignSupport =
    new VitalSignCommandService(
      vitalSignRepository,
      listSupport,
    );

  const createClinicalNote =
    new CreateClinicalNoteWorkflow(
      noteRepository,
      noteSupport,
    );

  const workflows = {
    createEncounter:
      new CreateEncounterWorkflow(
        encounterRepository,
        historyRepository,
        patientResolution,
        contextService,
        options.numbers,
        options.dependencies,
      ),
    changeEncounterStatus:
      new ChangeEncounterStatusWorkflow(
        encounterRepository,
        historyRepository,
        options.dependencies,
      ),
    reassignEncounter:
      new ReassignEncounterWorkflow(
        encounterRepository,
        historyRepository,
        contextRepository,
        options.dependencies,
      ),
    signEncounter:
      new SignEncounterWorkflow(
        encounterRepository,
        historyRepository,
        options.dependencies,
      ),
    correctEncounter:
      new CorrectEncounterWorkflow(
        encounterRepository,
        historyRepository,
        patientResolution,
        contextService,
        options.numbers,
        options.dependencies,
      ),
    createClinicalNote,
    updateClinicalNoteDraft:
      new UpdateClinicalNoteDraftWorkflow(
        noteRepository,
        noteSupport,
      ),
    finalizeClinicalNote:
      new FinalizeClinicalNoteWorkflow(
        noteRepository,
        noteSupport,
      ),
    amendClinicalNote:
      new AmendClinicalNoteWorkflow(
        noteRepository,
        noteSupport,
      ),
    correctClinicalNote:
      new CorrectClinicalNoteWorkflow(
        noteRepository,
        noteSupport,
      ),
    addClinicalNoteAddendum:
      new AddClinicalNoteAddendumWorkflow(
        noteRepository,
        noteSupport,
      ),
    enterClinicalNoteInError:
      new EnterClinicalNoteInErrorWorkflow(
        noteRepository,
        noteSupport,
      ),
    recordEncounterDiagnosis:
      new RecordEncounterDiagnosisWorkflow(diagnosisSupport),
    verifyEncounterDiagnosis:
      new VerifyEncounterDiagnosisWorkflow(diagnosisSupport),
    changeEncounterDiagnosisStatus:
      new ChangeEncounterDiagnosisStatusWorkflow(diagnosisSupport),
    correctEncounterDiagnosis:
      new CorrectEncounterDiagnosisWorkflow(diagnosisSupport),
    createPatientProblem:
      new CreatePatientProblemWorkflow(problemSupport),
    updatePatientProblem:
      new UpdatePatientProblemWorkflow(problemSupport),
    correctPatientProblem:
      new CorrectPatientProblemWorkflow(problemSupport),
    recordPatientAllergy:
      new RecordPatientAllergyWorkflow(allergySupport),
    updatePatientAllergy:
      new UpdatePatientAllergyWorkflow(allergySupport),
    correctPatientAllergy:
      new CorrectPatientAllergyWorkflow(allergySupport),
    recordStructuredSection:
      new RecordStructuredEncounterSectionWorkflow(
        new StructuredEncounterSectionService(),
        createClinicalNote,
      ),
    recordVitalSigns:
      new RecordVitalSignsWorkflow(vitalSignSupport),
    correctVitalSigns:
      new CorrectVitalSignsWorkflow(vitalSignSupport),
    enterVitalSignsInError:
      new EnterVitalSignsInErrorWorkflow(vitalSignSupport),
  };

  const referrals =
    new ClinicalReferralService(
      contextRepository,
      referralRepository,
      encounterRepository,
      noteRepository,
      attributionService,
      accessPolicy,
      sensitiveReadAuditor,
      options.dependencies,
    );

  const queries =
    new ClinicalEmrQueryService(
      readRepository,
      encounterRepository,
      historyRepository,
      noteRepository,
      noteVersionRepository,
      diagnosisRepository,
      encounterDiagnosisRepository,
      problemRepository,
      problemVersionRepository,
      allergyCatalogRepository,
      allergyRepository,
      allergyVersionRepository,
      vitalSignRepository,
      attributionService,
      accessPolicy,
      sensitiveReadAuditor,
      options.dependencies.snapshotCrypto,
      () => options.dependencies.clock.now(),
    );

  return {
    repositories: {
      encounterRepository,
      historyRepository,
      noteRepository,
      noteVersionRepository,
      diagnosisRepository,
      encounterDiagnosisRepository,
      problemRepository,
      problemVersionRepository,
      allergyCatalogRepository,
      allergyRepository,
      allergyVersionRepository,
      vitalSignRepository,
      referralRepository,
      readRepository,
    },
    services: {
      contextService,
      attributionService,
      accessPolicy,
      sensitiveReadAuditor,
      referrals,
      queries,
    },
    workflows,
  };
}

export type ClinicalEmrApplication =
  ReturnType<typeof createClinicalEmrApplication>;

export interface ClinicalEmrDemoSeedInput {
  application: ClinicalEmrApplication;
  actor: ClinicalEmrActorContext;
  patientId: string;
  registrationId: string;
  opdVisitId: string;
  queueTokenId?: string | null;
  departmentId: string;
  clinicId?: string | null;
  servicePointId?: string | null;
  providerId: string;
  serviceDate: string;
  consultationDepartmentId?: string;
  consultationProviderId?: string | null;
}

export interface ClinicalEmrDemoSeedResult {
  encounterId: string;
  encounterNumber: string;
  clinicalNoteId: string;
  noteNumber: string;
  encounterDiagnosisId: string;
  patientProblemId: string;
  patientAllergyId: string;
  vitalSignId: string;
  referralNumber: string;
}

/**
 * Creates a deterministic, fictional clinical record set for an existing OPD
 * visit. The caller supplies only existing facility-safe references; all writes
 * still pass through normal authorization, idempotency, transaction, audit,
 * outbox, encryption, and compensation workflows.
 */
export async function seedClinicalEmrDemoData(
  input: ClinicalEmrDemoSeedInput,
): Promise<ClinicalEmrDemoSeedResult> {
  if (input.actor.facilityId.length !== 24) {
    throw new ConflictError(
      'The clinical demo seed actor requires a valid facility context',
    );
  }

  const seedScope =
    `${input.actor.facilityId}:${input.opdVisitId}`;
  const measuredAt =
    `${input.serviceDate}T09:00:00.000Z`;

  const encounter =
    await input.application.workflows.createEncounter.execute({
      actor: input.actor,
      idempotencyKey: `clinical-demo:encounter:${seedScope}`,
      input: {
        patientId: input.patientId,
        registrationId: input.registrationId,
        opdVisitId: input.opdVisitId,
        queueTokenId: input.queueTokenId ?? null,
        encounterType: 'OPD',
        careContext: 'OPD_VISIT',
        serviceDate: input.serviceDate,
        departmentId: input.departmentId,
        clinicId: input.clinicId ?? null,
        servicePointId: input.servicePointId ?? null,
        primaryProviderId: input.providerId,
        currentOwnerId: input.providerId,
        currentOwnerRole: 'PRIMARY_PROVIDER',
        assignedProviderIds: [input.providerId],
        confidentiality: 'ROUTINE',
        startedAt: measuredAt,
      },
    });

  const draftNote =
    await input.application.workflows.createClinicalNote.execute({
      actor: input.actor,
      idempotencyKey: `clinical-demo:note:${seedScope}`,
      input: {
        encounterId: encounter.encounterId,
        authorProviderId: input.providerId,
        documentType: 'GENERAL_CLINICAL_NOTE',
        title: 'Demonstration consultation note',
        narrativeText:
          'Fictional demonstration record. The patient reports a mild headache for two days without red-flag symptoms.',
        structuredData: {
          demonstrationRecord: true,
          chiefComplaint: 'Mild headache',
          duration: 'Two days',
        },
        confidentiality: 'ROUTINE',
      },
    });

  const finalNote =
    await input.application.workflows.finalizeClinicalNote.execute({
      actor: input.actor,
      idempotencyKey: `clinical-demo:finalize-note:${seedScope}`,
      clinicalNoteId: draftNote.clinicalNoteId,
      input: {
        expectedVersion: draftNote.version,
      },
    });

  const diagnosis =
    await input.application.workflows.recordEncounterDiagnosis.execute({
      actor: input.actor,
      idempotencyKey: `clinical-demo:diagnosis:${seedScope}`,
      input: {
        encounterId: encounter.encounterId,
        codeSystem: 'LOCAL',
        code: 'DEMO-HEADACHE',
        display: 'Demonstration headache diagnosis',
        role: 'PRIMARY',
        certainty: 'PROVISIONAL',
        clinicalNoteId: finalNote.clinicalNoteId,
        isChronic: false,
        evidence:
          'Fictional demonstration finding recorded for local development data only.',
      },
    });

  const problem =
    await input.application.workflows.createPatientProblem.execute({
      actor: input.actor,
      idempotencyKey: `clinical-demo:problem:${seedScope}`,
      input: {
        sourceEncounterId: encounter.encounterId,
        sourceEncounterDiagnosisId:
          diagnosis.encounterDiagnosisId,
        codeSystem: 'LOCAL',
        code: 'DEMO-HEADACHE',
        display: 'Demonstration headache problem',
        onsetDate: input.serviceDate,
        summary:
          'Fictional active problem created by the Clinical EMR demo seed.',
      },
    });

  const allergy =
    await input.application.workflows.recordPatientAllergy.execute({
      actor: input.actor,
      idempotencyKey: `clinical-demo:allergy:${seedScope}`,
      input: {
        patientId: input.patientId,
        sourceEncounterId: encounter.encounterId,
        clinicalNoteId: finalNote.clinicalNoteId,
        recordType: 'ALLERGY',
        category: 'MEDICATION',
        allergenText: 'Demonstration penicillin allergy',
        verificationStatus: 'CONFIRMED',
        severity: 'MILD',
        reactions: [
          {
            manifestation: 'Demonstration rash',
            severity: 'MILD',
            notes:
              'Fictional reaction for development and demonstration use only.',
          },
        ],
        notes:
          'Fictional allergy record. Never use this seed data for real care.',
      },
    });

  const vitalSign =
    await input.application.workflows.recordVitalSigns.execute({
      actor: input.actor,
      idempotencyKey: `clinical-demo:vitals:${seedScope}`,
      input: {
        encounterId: encounter.encounterId,
        sourceClinicalNoteId: finalNote.clinicalNoteId,
        measuredAt,
        source: 'MANUAL',
        bodyPosition: 'SITTING',
        temperatureCelsius: '36.8',
        pulsePerMinute: 78,
        respiratoryRatePerMinute: 16,
        systolicBloodPressureMmHg: 118,
        diastolicBloodPressureMmHg: 76,
        oxygenSaturationPercent: '98',
        painScore: 2,
        weightKg: '68.5',
        confidentiality: 'ROUTINE',
        notes:
          'Fictional demonstration measurements.',
      },
    });

  const referral =
    await input.application.services.referrals.create(
      input.actor,
      `clinical-demo:referral:${seedScope}`,
      {
        patientId: input.patientId,
        sourceEncounterId: encounter.encounterId,
        sourceClinicalNoteId: finalNote.clinicalNoteId,
        requestingProviderId: input.providerId,
        referralType: 'INTERNAL_CONSULTATION',
        priority: 'ROUTINE',
        target: {
          facilityId: input.actor.facilityId,
          departmentId:
            input.consultationDepartmentId ?? input.departmentId,
          clinicId: null,
          servicePointId: null,
          providerId: input.consultationProviderId ?? input.providerId,
          externalOrganization: null,
          externalProviderName: null,
        },
        reason:
          'Fictional demonstration request for a routine clinical opinion.',
        clinicalQuestion:
          'Please review the demonstration headache assessment and provide a fictional opinion.',
      },
    );

  const referralNumber = referral['referralNumber'];

  if (typeof referralNumber !== 'string') {
    throw new ConflictError(
      'The clinical demo referral did not return a referral number',
    );
  }

  return {
    encounterId: encounter.encounterId,
    encounterNumber: encounter.encounterNumber,
    clinicalNoteId: finalNote.clinicalNoteId,
    noteNumber: finalNote.noteNumber,
    encounterDiagnosisId: diagnosis.encounterDiagnosisId,
    patientProblemId: problem.patientProblemId,
    patientAllergyId: allergy.patientAllergyId,
    vitalSignId: vitalSign.vitalSignId,
    referralNumber,
  };
}

type RecoveryCompensation = {
  key: string;
  type: string;
  payload: Record<string, unknown>;
  status: string;
};

type RecoveryTransaction = {
  _id: unknown;
  facilityId: unknown;
  transactionId: string;
  transactionType: string;
  idempotencyKey: string;
  status: string;
  clinicalEmrRecoveryMode?: string;
  clinicalEmrIdempotencyOwnerId?: string;
  clinicalEmrResultSnapshot?: Record<string, unknown>;
  clinicalEmrCompensations?: RecoveryCompensation[];
  updatedAt: Date;
};

export class ClinicalEmrRecoveryService {
  private readonly transactionTypes =
    Object.values(CLINICAL_EMR_TRANSACTION_TYPES);

  public constructor(
    private readonly database: Db,
    private readonly compensationExecutor: ClinicalEmrCompensationExecutor,
    private readonly idempotency:
      ReturnType<typeof createOperationalInfrastructure>['idempotency'],
    private readonly outbox:
      ReturnType<typeof createOperationalInfrastructure>['outbox'],
  ) {}

  public async markStaleTransactions(
    staleBefore: Date,
  ): Promise<number> {
    const collection =
      this.database.collection<RecoveryTransaction>(
        'applicationTransactions',
      );

    const incomplete =
      await collection.updateMany(
        {
          transactionType: {
            $in: this.transactionTypes,
          },
          status: {
            $in: [
              'PENDING',
              'IN_PROGRESS',
              'COMPENSATING',
            ],
          },
          updatedAt: {
            $lt: staleBefore,
          },
          clinicalEmrDomainCompletedAt: {
            $exists: false,
          },
        } as never,
        {
          $set: {
            status: 'RECOVERY_REQUIRED',
            recoveryStatus: 'PENDING',
            clinicalEmrRecoveryMode:
              CLINICAL_EMR_RECOVERY_MODES.COMPENSATE,
          },
          $inc: {
            retryCount: 1,
            version: 1,
          },
          $currentDate: {
            updatedAt: true,
          },
        } as never,
      );

    const completed =
      await collection.updateMany(
        {
          transactionType: {
            $in: this.transactionTypes,
          },
          status: {
            $in: [
              'PENDING',
              'IN_PROGRESS',
              'COMPENSATING',
            ],
          },
          updatedAt: {
            $lt: staleBefore,
          },
          clinicalEmrDomainCompletedAt: {
            $type: 'date',
          },
        } as never,
        {
          $set: {
            status: 'RECOVERY_REQUIRED',
            recoveryStatus: 'PENDING',
            clinicalEmrRecoveryMode:
              CLINICAL_EMR_RECOVERY_MODES.FINALIZE_COMPLETED,
          },
          $inc: {
            retryCount: 1,
            version: 1,
          },
          $currentDate: {
            updatedAt: true,
          },
        } as never,
      );

    return incomplete.modifiedCount + completed.modifiedCount;
  }

  public async recoverAvailable(
    input: {
      workerId: string;
      maxTransactions?: number;
      now?: Date;
    },
  ): Promise<{
    recovered: number;
    failed: number;
  }> {
    const max = Math.max(1, Math.min(input.maxTransactions ?? 20, 100));
    let recovered = 0;
    let failed = 0;

    for (let index = 0; index < max; index += 1) {
      const now = input.now ?? new Date();
      const leaseToken = randomUUID();
      const transaction =
        await this.database
          .collection<RecoveryTransaction>('applicationTransactions')
          .findOneAndUpdate(
            {
              transactionType: {
                $in: this.transactionTypes,
              },
              status: 'RECOVERY_REQUIRED',
              recoveryStatus: {
                $in: [
                  'PENDING',
                  'FAILED',
                ],
              },
              $or: [
                {
                  clinicalEmrRecoveryLeaseExpiresAt: {
                    $exists: false,
                  },
                },
                {
                  clinicalEmrRecoveryLeaseExpiresAt: {
                    $lte: now,
                  },
                },
              ],
            } as never,
            {
              $set: {
                recoveryStatus: 'IN_PROGRESS',
                clinicalEmrRecoveryLeaseOwner: input.workerId,
                clinicalEmrRecoveryLeaseToken: leaseToken,
                clinicalEmrRecoveryLeaseExpiresAt:
                  new Date(now.getTime() + 60_000),
              },
              $inc: {
                version: 1,
              },
              $currentDate: {
                updatedAt: true,
              },
            } as never,
            {
              returnDocument: 'after',
            },
          );

      if (transaction === null) {
        break;
      }

      try {
        await this.recoverTransaction(transaction);
        recovered += 1;
      } catch (error) {
        failed += 1;
        await this.database
          .collection('applicationTransactions')
          .updateOne(
            {
              transactionId: transaction.transactionId,
            },
            {
              $set: {
                recoveryStatus: 'FAILED',
                errorDetails: {
                  message:
                    error instanceof Error
                      ? error.message.slice(0, 1_500)
                      : 'Unknown clinical EMR recovery error',
                },
              },
              $inc: {
                retryCount: 1,
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

  private async recoverTransaction(
    transaction: RecoveryTransaction,
  ): Promise<void> {
    const facilityId = String(transaction.facilityId);

    if (
      transaction.clinicalEmrRecoveryMode ===
      CLINICAL_EMR_RECOVERY_MODES.FINALIZE_COMPLETED
    ) {
      if (
        transaction.clinicalEmrResultSnapshot == null ||
        transaction.clinicalEmrIdempotencyOwnerId == null
      ) {
        throw new Error(
          'Completed clinical transaction recovery is missing its encrypted result or idempotency owner',
        );
      }

      await this.idempotency.complete({
        facilityId,
        scope: transaction.transactionType,
        key: transaction.idempotencyKey,
        ownerId: transaction.clinicalEmrIdempotencyOwnerId,
        response: transaction.clinicalEmrResultSnapshot as never,
      });

      await this.outbox.releaseTransactionEvents(
        transaction.transactionId,
      );
    } else {
      for (
        const compensation of
        [...(transaction.clinicalEmrCompensations ?? [])].reverse()
      ) {
        if (compensation.status === 'COMPENSATED') {
          continue;
        }

        await this.compensationExecutor.execute({
          key: compensation.key,
          type: compensation.type,
          payload: compensation.payload,
        });
      }

      if (transaction.clinicalEmrIdempotencyOwnerId != null) {
        await this.idempotency.fail({
          facilityId,
          scope: transaction.transactionType,
          key: transaction.idempotencyKey,
          ownerId: transaction.clinicalEmrIdempotencyOwnerId,
          error: {
            code: 'CLINICAL_EMR_TRANSACTION_COMPENSATED',
          },
        });
      }
    }

    await this.database
      .collection('applicationTransactions')
      .updateOne(
        {
          transactionId: transaction.transactionId,
        },
        {
          $set: {
            status:
              transaction.clinicalEmrRecoveryMode ===
              CLINICAL_EMR_RECOVERY_MODES.FINALIZE_COMPLETED
                ? 'COMPLETED'
                : 'COMPENSATED',
            recoveryStatus: 'COMPLETED',
          },
          $unset: {
            clinicalEmrRecoveryLeaseOwner: '',
            clinicalEmrRecoveryLeaseToken: '',
            clinicalEmrRecoveryLeaseExpiresAt: '',
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

export interface CreateClinicalEmrInfrastructureOptions {
  database: Db;
  auditRepository: AuditRepository;
  operationalInfrastructure:
    ReturnType<typeof createOperationalInfrastructure>;
  snapshotCrypto: ClinicalEmrSnapshotCryptoPort;
  publishRealtime(
    message: ClinicalEmrRealtimeMessage,
  ): Promise<void>;
}

export function createClinicalEmrInfrastructure(
  options: CreateClinicalEmrInfrastructureOptions,
) {
  const compensationExecutor =
    new ClinicalEmrCompensationExecutor(
      options.database,
      options.snapshotCrypto,
    );

  const transactionManager =
    new MongoClinicalEmrTransactionManagerAdapter({
      database: options.database,
      transactions:
        options.operationalInfrastructure.transactionRepository,
      idempotency:
        options.operationalInfrastructure.idempotency,
      locks: options.operationalInfrastructure.locks,
      outbox: options.operationalInfrastructure.outbox,
      compensationExecutor,
      snapshotCrypto: options.snapshotCrypto,
    });

  const runtime =
    createClinicalEmrRuntimeAdapters({
      database: options.database,
      auditRepository: options.auditRepository,
      sequence: options.operationalInfrastructure.sequences,
      publishRealtime: options.publishRealtime,
    });

  const numbers =
    ClinicalEmrNumberService.fromSequenceService(
      options.operationalInfrastructure.sequences,
    );

  const opdLifecycle =
    new ClinicalEmrOpdLifecycleService(options.snapshotCrypto);

  const dependencies: ClinicalEmrMutationDependencies = {
    transactionManager,
    audit: runtime.audit,
    outbox: runtime.outbox,
    realtime: runtime.realtime,
    clock: runtime.clock,
    sequence: runtime.sequence,
    canonicalPatient: new ClinicalEmrPatientResolutionService(),
    accessPolicy: new ClinicalEmrAccessPolicyService(),
    snapshotCrypto: options.snapshotCrypto,
    opdLifecycle,
  };

  const application =
    createClinicalEmrApplication({
      database: options.database,
      dependencies,
      numbers,
    });

  const recovery =
    new ClinicalEmrRecoveryService(
      options.database,
      compensationExecutor,
      options.operationalInfrastructure.idempotency,
      options.operationalInfrastructure.outbox,
    );

  return {
    application,
    dependencies,
    numbers,
    transactionManager,
    compensationExecutor,
    recovery,
    runtime,
  };
}

export class ClinicalEmrController {
  public constructor(
    private readonly application: ClinicalEmrApplication,
    private readonly authorization: AuthorizationService,
  ) {}

  private async actor(
    request: Request,
  ): Promise<ClinicalEmrActorContext> {
    return clinicalEmrActorFromRequest(
      request,
      this.authorization,
    );
  }

  private send(
    request: Request,
    response: Response,
    status: number,
    result: unknown,
  ): void {
    response
      .status(status)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  }

  private parameter(
    request: Request,
    key: string,
  ): string {
    const params =
      validatedClinicalEmrPart<Record<string, string>>(
        request,
        'params',
      );
    const value = params[key];

    if (value === undefined) {
      throw new ResourceNotFoundError(
        `Clinical route parameter ${key} is unavailable`,
      );
    }

    return value;
  }

  private async mutation(
    request: Request,
  ) {
    return {
      actor: await this.actor(request),
      idempotencyKey:
        clinicalEmrIdempotencyKeyFromRequest(request),
    };
  }

  public listDiagnosisCatalog = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result =
      await this.application.services.queries.listDiagnosisCatalog(
        await this.actor(request),
        validatedClinicalEmrPart<DiagnosisCatalogRouteQuery>(
          request,
          'query',
        ),
      );
    this.send(request, response, 200, result);
  };

  public listAllergyCatalog = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result =
      await this.application.services.queries.listAllergyCatalog(
        await this.actor(request),
        validatedClinicalEmrPart<AllergyCatalogRouteQuery>(
          request,
          'query',
        ),
      );
    this.send(request, response, 200, result);
  };

  public listEncounterDiagnoses = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result =
      await this.application.services.queries.listEncounterDiagnoses(
        await this.actor(request),
        validatedClinicalEmrPart<EncounterDiagnosisRouteQuery>(
          request,
          'query',
        ),
      );
    this.send(request, response, 200, result);
  };

  public listPatientProblems = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result =
      await this.application.services.queries.listPatientProblems(
        await this.actor(request),
        validatedClinicalEmrPart<PatientProblemRouteQuery>(
          request,
          'query',
        ),
      );
    this.send(request, response, 200, result);
  };

  public listPatientAllergies = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result =
      await this.application.services.queries.listPatientAllergies(
        await this.actor(request),
        validatedClinicalEmrPart<PatientAllergyRouteQuery>(
          request,
          'query',
        ),
      );
    this.send(request, response, 200, result);
  };

  public listVitalSigns = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result =
      await this.application.services.queries.listVitalSigns(
        await this.actor(request),
        validatedClinicalEmrPart<VitalSignRouteQuery>(
          request,
          'query',
        ),
      );
    this.send(request, response, 200, result);
  };

  public listEncounters = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result =
      await this.application.services.queries.listEncounters(
        await this.actor(request),
        validatedClinicalEmrPart<EncounterListQuery>(request, 'query'),
      );
    this.send(request, response, 200, result);
  };

  public getEncounter = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result =
      await this.application.services.queries.getEncounter(
        await this.actor(request),
        this.parameter(request, 'encounterId'),
      );
    this.send(request, response, 200, result);
  };

  public getEncounterHistory = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result =
      await this.application.services.queries.encounterHistoryById(
        await this.actor(request),
        this.parameter(request, 'encounterId'),
      );
    this.send(request, response, 200, result);
  };

  public createEncounter = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.workflows.createEncounter.execute({
        ...context,
        input: validatedClinicalEmrPart(request, 'body'),
      } as never);
    this.send(request, response, 201, result);
  };

  public changeEncounterStatus = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.workflows.changeEncounterStatus.execute({
        ...context,
        encounterId: this.parameter(request, 'encounterId'),
        input: validatedClinicalEmrPart(request, 'body'),
      } as never);
    this.send(request, response, 200, result);
  };

  public reassignEncounter = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.workflows.reassignEncounter.execute({
        ...context,
        encounterId: this.parameter(request, 'encounterId'),
        input: validatedClinicalEmrPart(request, 'body'),
      } as never);
    this.send(request, response, 200, result);
  };

  public signEncounter = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.workflows.signEncounter.execute({
        ...context,
        encounterId: this.parameter(request, 'encounterId'),
        input: validatedClinicalEmrPart(request, 'body'),
      } as never);
    this.send(request, response, 200, result);
  };

  public correctEncounter = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.workflows.correctEncounter.execute({
        ...context,
        encounterId: this.parameter(request, 'encounterId'),
        input: validatedClinicalEmrPart(request, 'body'),
      } as never);
    this.send(request, response, 201, result);
  };

  public listClinicalNotes = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result =
      await this.application.services.queries.listClinicalNotes(
        await this.actor(request),
        validatedClinicalEmrPart<ClinicalNoteListQuery>(request, 'query'),
      );
    this.send(request, response, 200, result);
  };

  public getClinicalNote = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result =
      await this.application.services.queries.getClinicalNote(
        await this.actor(request),
        this.parameter(request, 'clinicalNoteId'),
      );
    this.send(request, response, 200, result);
  };

  public getClinicalNoteHistory = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result =
      await this.application.services.queries.clinicalNoteHistory(
        await this.actor(request),
        this.parameter(request, 'clinicalNoteId'),
      );
    this.send(request, response, 200, result);
  };

  public createClinicalNote = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.workflows.createClinicalNote.execute({
        ...context,
        input: validatedClinicalEmrPart(request, 'body'),
      } as never);
    this.send(request, response, 201, result);
  };

  public updateClinicalNoteDraft = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.workflows.updateClinicalNoteDraft.execute({
        ...context,
        clinicalNoteId: this.parameter(request, 'clinicalNoteId'),
        input: validatedClinicalEmrPart(request, 'body'),
      } as never);
    this.send(request, response, 200, result);
  };

  public finalizeClinicalNote = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.workflows.finalizeClinicalNote.execute({
        ...context,
        clinicalNoteId: this.parameter(request, 'clinicalNoteId'),
        input: validatedClinicalEmrPart(request, 'body'),
      } as never);
    this.send(request, response, 200, result);
  };

  public amendClinicalNote = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.workflows.amendClinicalNote.execute({
        ...context,
        clinicalNoteId: this.parameter(request, 'clinicalNoteId'),
        input: validatedClinicalEmrPart(request, 'body'),
      } as never);
    this.send(request, response, 200, result);
  };

  public correctClinicalNote = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.workflows.correctClinicalNote.execute({
        ...context,
        clinicalNoteId: this.parameter(request, 'clinicalNoteId'),
        input: validatedClinicalEmrPart(request, 'body'),
      } as never);
    this.send(request, response, 201, result);
  };

  public addClinicalNoteAddendum = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.workflows.addClinicalNoteAddendum.execute({
        ...context,
        input: validatedClinicalEmrPart(request, 'body'),
      } as never);
    this.send(request, response, 201, result);
  };

  public enterClinicalNoteInError = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.workflows.enterClinicalNoteInError.execute({
        ...context,
        clinicalNoteId: this.parameter(request, 'clinicalNoteId'),
        input: validatedClinicalEmrPart(request, 'body'),
      } as never);
    this.send(request, response, 200, result);
  };

  public recordDiagnosis = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.workflows.recordEncounterDiagnosis.execute({
        ...context,
        input: validatedClinicalEmrPart(request, 'body'),
      } as never);
    this.send(request, response, 201, result);
  };

  public verifyDiagnosis = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.workflows.verifyEncounterDiagnosis.execute({
        ...context,
        encounterDiagnosisId:
          this.parameter(request, 'encounterDiagnosisId'),
        input: validatedClinicalEmrPart(request, 'body'),
      } as never);
    this.send(request, response, 200, result);
  };

  public changeDiagnosisStatus = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.workflows.changeEncounterDiagnosisStatus.execute({
        ...context,
        encounterDiagnosisId:
          this.parameter(request, 'encounterDiagnosisId'),
        input: validatedClinicalEmrPart(request, 'body'),
      } as never);
    this.send(request, response, 200, result);
  };

  public correctDiagnosis = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.workflows.correctEncounterDiagnosis.execute({
        ...context,
        encounterDiagnosisId:
          this.parameter(request, 'encounterDiagnosisId'),
        input: validatedClinicalEmrPart(request, 'body'),
      } as never);
    this.send(request, response, 201, result);
  };

  public createProblem = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.workflows.createPatientProblem.execute({
        ...context,
        input: validatedClinicalEmrPart(request, 'body'),
      } as never);
    this.send(request, response, 201, result);
  };

  public updateProblem = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.workflows.updatePatientProblem.execute({
        ...context,
        patientProblemId: this.parameter(request, 'patientProblemId'),
        input: validatedClinicalEmrPart(request, 'body'),
      } as never);
    this.send(request, response, 200, result);
  };

  public correctProblem = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.workflows.correctPatientProblem.execute({
        ...context,
        patientProblemId: this.parameter(request, 'patientProblemId'),
        input: validatedClinicalEmrPart(request, 'body'),
      } as never);
    this.send(request, response, 201, result);
  };

  public recordAllergy = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.workflows.recordPatientAllergy.execute({
        ...context,
        input: validatedClinicalEmrPart(request, 'body'),
      } as never);
    this.send(request, response, 201, result);
  };

  public updateAllergy = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.workflows.updatePatientAllergy.execute({
        ...context,
        patientAllergyId: this.parameter(request, 'patientAllergyId'),
        input: validatedClinicalEmrPart(request, 'body'),
      } as never);
    this.send(request, response, 200, result);
  };

  public correctAllergy = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.workflows.correctPatientAllergy.execute({
        ...context,
        patientAllergyId: this.parameter(request, 'patientAllergyId'),
        input: validatedClinicalEmrPart(request, 'body'),
      } as never);
    this.send(request, response, 201, result);
  };

  public getProblemHistory = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result =
      await this.application.services.queries.patientProblemHistory(
        await this.actor(request),
        this.parameter(request, 'patientProblemId'),
      );
    this.send(request, response, 200, result);
  };

  public getAllergyHistory = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result =
      await this.application.services.queries.patientAllergyHistory(
        await this.actor(request),
        this.parameter(request, 'patientAllergyId'),
      );
    this.send(request, response, 200, result);
  };

  public getVitalSignHistory = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result =
      await this.application.services.queries.vitalSignHistory(
        await this.actor(request),
        this.parameter(request, 'vitalSignId'),
      );
    this.send(request, response, 200, result);
  };

  public recordStructuredSection = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.workflows.recordStructuredSection.execute({
        ...context,
        input: validatedClinicalEmrPart(request, 'body'),
      } as never);
    this.send(request, response, 201, result);
  };

  public recordVitalSigns = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.workflows.recordVitalSigns.execute({
        ...context,
        input: validatedClinicalEmrPart(request, 'body'),
      } as never);
    this.send(request, response, 201, result);
  };

  public correctVitalSigns = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.workflows.correctVitalSigns.execute({
        ...context,
        vitalSignId: this.parameter(request, 'vitalSignId'),
        input: validatedClinicalEmrPart(request, 'body'),
      } as never);
    this.send(request, response, 201, result);
  };

  public enterVitalSignsInError = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.workflows.enterVitalSignsInError.execute({
        ...context,
        vitalSignId: this.parameter(request, 'vitalSignId'),
        input: validatedClinicalEmrPart(request, 'body'),
      } as never);
    this.send(request, response, 200, result);
  };

  public createReferral = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.services.referrals.create(
        context.actor,
        context.idempotencyKey,
        validatedClinicalEmrPart<CreateClinicalReferralBody>(
          request,
          'body',
        ),
      );
    this.send(request, response, 201, result);
  };

  public transitionReferral = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.services.referrals.transition(
        context.actor,
        context.idempotencyKey,
        this.parameter(request, 'referralNumber'),
        validatedClinicalEmrPart<TransitionClinicalReferralBody>(
          request,
          'body',
        ),
      );
    this.send(request, response, 200, result);
  };

  public correctReferral = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutation(request);
    const result =
      await this.application.services.referrals.correct(
        context.actor,
        context.idempotencyKey,
        this.parameter(request, 'referralNumber'),
        validatedClinicalEmrPart<CorrectClinicalReferralBody>(
          request,
          'body',
        ),
      );
    this.send(request, response, 201, result);
  };

  public listReferrals = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result =
      await this.application.services.referrals.list(
        await this.actor(request),
        validatedClinicalEmrPart<ClinicalReferralListQuery>(
          request,
          'query',
        ),
      );
    this.send(request, response, 200, result);
  };

  public getReferral = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result =
      await this.application.services.referrals.get(
        await this.actor(request),
        this.parameter(request, 'referralNumber'),
      );
    this.send(request, response, 200, result);
  };

  public referralHistory = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result =
      await this.application.services.referrals.history(
        await this.actor(request),
        this.parameter(request, 'referralNumber'),
      );
    this.send(request, response, 200, result);
  };

  public patientSummary = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result =
      await this.application.services.queries.patientSummary(
        await this.actor(request),
        this.parameter(request, 'patientId'),
        validatedClinicalEmrPart(request, 'query'),
      );
    this.send(request, response, 200, result);
  };

  public timeline = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const query =
      validatedClinicalEmrPart<ClinicalTimelineRouteQuery>(request, 'query');
    const result =
      await this.application.services.queries.timeline(
        await this.actor(request),
        {
          ...query,
          patientId: this.parameter(request, 'patientId'),
        },
      );
    this.send(request, response, 200, result);
  };

  public providerWorklist = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result =
      await this.application.services.queries.providerWorklist(
        await this.actor(request),
        this.parameter(request, 'providerId'),
        validatedClinicalEmrPart(request, 'query'),
      );
    this.send(request, response, 200, result);
  };
}

const clinicalReadPermissions = [
  CLINICAL_EMR_PERMISSION_KEYS.ENCOUNTER_READ_ASSIGNED,
  CLINICAL_EMR_PERMISSION_KEYS.ENCOUNTER_READ_ALL,
] as const satisfies readonly PermissionKey[];

export interface CreateClinicalEmrRouterOptions {
  application: ClinicalEmrApplication;
  authenticationService: AuthenticationService;
  authorizationService: AuthorizationService;
}

export function createClinicalEmrRouter(
  options: CreateClinicalEmrRouterOptions,
): Router {
  const router = Router();
  const controller =
    new ClinicalEmrController(
      options.application,
      options.authorizationService,
    );
  const mutationHeaders = {
    headers: clinicalEmrMutationHeadersSchema,
  };

  router.use(authenticate(options.authenticationService));

  router.get(
    '/diagnosis-catalog',
    validateRequest({ query: diagnosisCatalogListQuerySchema }),
    requireAnyPermission(
      options.authorizationService,
      clinicalReadPermissions,
    ),
    controller.listDiagnosisCatalog,
  );
  router.get(
    '/allergy-catalog',
    validateRequest({ query: allergyCatalogListQuerySchema }),
    requireAnyPermission(
      options.authorizationService,
      clinicalReadPermissions,
    ),
    controller.listAllergyCatalog,
  );

  router.get(
    '/encounters',
    validateRequest({ query: encounterListQuerySchema }),
    requireAnyPermission(
      options.authorizationService,
      clinicalReadPermissions,
    ),
    controller.listEncounters,
  );
  router.get(
    '/encounters/:encounterId',
    validateRequest({ params: clinicalEntityParamsSchema }),
    requireAnyPermission(
      options.authorizationService,
      clinicalReadPermissions,
    ),
    controller.getEncounter,
  );
  router.get(
    '/encounters/:encounterId/history',
    validateRequest({ params: clinicalEntityParamsSchema }),
    requireAnyPermission(
      options.authorizationService,
      clinicalReadPermissions,
    ),
    controller.getEncounterHistory,
  );
  router.post(
    '/encounters',
    validateRequest({
      ...mutationHeaders,
      body: createEncounterBodySchema,
    }),
    requirePermission(
      options.authorizationService,
      CLINICAL_EMR_PERMISSION_KEYS.ENCOUNTER_CREATE,
    ),
    controller.createEncounter,
  );
  router.post(
    '/encounters/:encounterId/status',
    validateRequest({
      ...mutationHeaders,
      params: clinicalEntityParamsSchema,
      body: changeEncounterStatusBodySchema,
    }),
    requirePermission(
      options.authorizationService,
      CLINICAL_EMR_PERMISSION_KEYS.ENCOUNTER_FINALIZE,
    ),
    controller.changeEncounterStatus,
  );
  router.post(
    '/encounters/:encounterId/reassign',
    validateRequest({
      ...mutationHeaders,
      params: clinicalEntityParamsSchema,
      body: reassignEncounterBodySchema,
    }),
    requirePermission(
      options.authorizationService,
      CLINICAL_EMR_PERMISSION_KEYS.ENCOUNTER_CREATE,
    ),
    controller.reassignEncounter,
  );
  router.post(
    '/encounters/:encounterId/sign',
    validateRequest({
      ...mutationHeaders,
      params: clinicalEntityParamsSchema,
      body: signEncounterBodySchema,
    }),
    requirePermission(
      options.authorizationService,
      CLINICAL_EMR_PERMISSION_KEYS.ENCOUNTER_FINALIZE,
    ),
    controller.signEncounter,
  );
  router.post(
    '/encounters/:encounterId/correct',
    validateRequest({
      ...mutationHeaders,
      params: clinicalEntityParamsSchema,
      body: correctEncounterBodySchema,
    }),
    requirePermission(
      options.authorizationService,
      CLINICAL_EMR_PERMISSION_KEYS.ENCOUNTER_AMEND,
    ),
    controller.correctEncounter,
  );

  router.get(
    '/notes',
    validateRequest({ query: clinicalNoteListQuerySchema }),
    requireAnyPermission(
      options.authorizationService,
      clinicalReadPermissions,
    ),
    controller.listClinicalNotes,
  );
  router.get(
    '/notes/:clinicalNoteId',
    validateRequest({ params: clinicalEntityParamsSchema }),
    requireAnyPermission(
      options.authorizationService,
      clinicalReadPermissions,
    ),
    controller.getClinicalNote,
  );
  router.get(
    '/notes/:clinicalNoteId/history',
    validateRequest({ params: clinicalEntityParamsSchema }),
    requireAnyPermission(
      options.authorizationService,
      clinicalReadPermissions,
    ),
    controller.getClinicalNoteHistory,
  );
  router.post(
    '/notes',
    validateRequest({
      ...mutationHeaders,
      body: createClinicalNoteBodySchema,
    }),
    requirePermission(
      options.authorizationService,
      CLINICAL_EMR_PERMISSION_KEYS.CLINICAL_NOTE_CREATE,
    ),
    controller.createClinicalNote,
  );
  router.patch(
    '/notes/:clinicalNoteId/draft',
    validateRequest({
      ...mutationHeaders,
      params: clinicalEntityParamsSchema,
      body: updateClinicalNoteBodySchema,
    }),
    requirePermission(
      options.authorizationService,
      CLINICAL_EMR_PERMISSION_KEYS.CLINICAL_NOTE_CREATE,
    ),
    controller.updateClinicalNoteDraft,
  );
  router.post(
    '/notes/:clinicalNoteId/finalize',
    validateRequest({
      ...mutationHeaders,
      params: clinicalEntityParamsSchema,
      body: finalizeClinicalNoteBodySchema,
    }),
    requirePermission(
      options.authorizationService,
      CLINICAL_EMR_PERMISSION_KEYS.ENCOUNTER_FINALIZE,
    ),
    controller.finalizeClinicalNote,
  );
  router.post(
    '/notes/:clinicalNoteId/amend',
    validateRequest({
      ...mutationHeaders,
      params: clinicalEntityParamsSchema,
      body: amendClinicalNoteBodySchema,
    }),
    requirePermission(
      options.authorizationService,
      CLINICAL_EMR_PERMISSION_KEYS.CLINICAL_NOTE_AMEND,
    ),
    controller.amendClinicalNote,
  );
  router.post(
    '/notes/:clinicalNoteId/correct',
    validateRequest({
      ...mutationHeaders,
      params: clinicalEntityParamsSchema,
      body: correctClinicalNoteBodySchema,
    }),
    requirePermission(
      options.authorizationService,
      CLINICAL_EMR_PERMISSION_KEYS.CLINICAL_NOTE_AMEND,
    ),
    controller.correctClinicalNote,
  );
  router.post(
    '/notes/addenda',
    validateRequest({
      ...mutationHeaders,
      body: addClinicalNoteAddendumBodySchema,
    }),
    requirePermission(
      options.authorizationService,
      CLINICAL_EMR_PERMISSION_KEYS.CLINICAL_NOTE_AMEND,
    ),
    controller.addClinicalNoteAddendum,
  );
  router.post(
    '/notes/:clinicalNoteId/entered-in-error',
    validateRequest({
      ...mutationHeaders,
      params: clinicalEntityParamsSchema,
      body: enterClinicalNoteInErrorBodySchema,
    }),
    requirePermission(
      options.authorizationService,
      CLINICAL_EMR_PERMISSION_KEYS.CLINICAL_NOTE_AMEND,
    ),
    controller.enterClinicalNoteInError,
  );

  router.get(
    '/diagnoses',
    validateRequest({ query: encounterDiagnosisListQuerySchema }),
    requireAnyPermission(
      options.authorizationService,
      clinicalReadPermissions,
    ),
    controller.listEncounterDiagnoses,
  );
  router.post(
    '/diagnoses',
    validateRequest({
      ...mutationHeaders,
      body: recordEncounterDiagnosisBodySchema,
    }),
    requirePermission(
      options.authorizationService,
      CLINICAL_EMR_PERMISSION_KEYS.CLINICAL_NOTE_CREATE,
    ),
    controller.recordDiagnosis,
  );
  router.post(
    '/diagnoses/:encounterDiagnosisId/verify',
    validateRequest({
      ...mutationHeaders,
      params: clinicalEntityParamsSchema,
      body: verifyEncounterDiagnosisBodySchema,
    }),
    requirePermission(
      options.authorizationService,
      CLINICAL_EMR_PERMISSION_KEYS.CLINICAL_NOTE_CREATE,
    ),
    controller.verifyDiagnosis,
  );
  router.post(
    '/diagnoses/:encounterDiagnosisId/status',
    validateRequest({
      ...mutationHeaders,
      params: clinicalEntityParamsSchema,
      body: changeEncounterDiagnosisStatusBodySchema,
    }),
    requirePermission(
      options.authorizationService,
      CLINICAL_EMR_PERMISSION_KEYS.CLINICAL_NOTE_AMEND,
    ),
    controller.changeDiagnosisStatus,
  );
  router.post(
    '/diagnoses/:encounterDiagnosisId/correct',
    validateRequest({
      ...mutationHeaders,
      params: clinicalEntityParamsSchema,
      body: correctEncounterDiagnosisBodySchema,
    }),
    requirePermission(
      options.authorizationService,
      CLINICAL_EMR_PERMISSION_KEYS.CLINICAL_NOTE_AMEND,
    ),
    controller.correctDiagnosis,
  );

  router.get(
    '/problems',
    validateRequest({ query: patientProblemListQuerySchema }),
    requireAnyPermission(
      options.authorizationService,
      clinicalReadPermissions,
    ),
    controller.listPatientProblems,
  );
  router.post(
    '/problems',
    validateRequest({
      ...mutationHeaders,
      body: createPatientProblemBodySchema,
    }),
    requirePermission(
      options.authorizationService,
      CLINICAL_EMR_PERMISSION_KEYS.CLINICAL_NOTE_CREATE,
    ),
    controller.createProblem,
  );
  router.patch(
    '/problems/:patientProblemId',
    validateRequest({
      ...mutationHeaders,
      params: clinicalEntityParamsSchema,
      body: updatePatientProblemBodySchema,
    }),
    requirePermission(
      options.authorizationService,
      CLINICAL_EMR_PERMISSION_KEYS.CLINICAL_NOTE_CREATE,
    ),
    controller.updateProblem,
  );
  router.get(
    '/problems/:patientProblemId/history',
    validateRequest({ params: clinicalEntityParamsSchema }),
    requireAnyPermission(
      options.authorizationService,
      clinicalReadPermissions,
    ),
    controller.getProblemHistory,
  );
  router.post(
    '/problems/:patientProblemId/correct',
    validateRequest({
      ...mutationHeaders,
      params: clinicalEntityParamsSchema,
      body: correctPatientProblemBodySchema,
    }),
    requirePermission(
      options.authorizationService,
      CLINICAL_EMR_PERMISSION_KEYS.CLINICAL_NOTE_AMEND,
    ),
    controller.correctProblem,
  );

  router.get(
    '/allergies',
    validateRequest({ query: patientAllergyListQuerySchema }),
    requireAnyPermission(
      options.authorizationService,
      clinicalReadPermissions,
    ),
    controller.listPatientAllergies,
  );
  router.post(
    '/allergies',
    validateRequest({
      ...mutationHeaders,
      body: recordPatientAllergyBodySchema,
    }),
    requirePermission(
      options.authorizationService,
      CLINICAL_EMR_PERMISSION_KEYS.CLINICAL_NOTE_CREATE,
    ),
    controller.recordAllergy,
  );
  router.patch(
    '/allergies/:patientAllergyId',
    validateRequest({
      ...mutationHeaders,
      params: clinicalEntityParamsSchema,
      body: updatePatientAllergyBodySchema,
    }),
    requirePermission(
      options.authorizationService,
      CLINICAL_EMR_PERMISSION_KEYS.CLINICAL_NOTE_CREATE,
    ),
    controller.updateAllergy,
  );
  router.get(
    '/allergies/:patientAllergyId/history',
    validateRequest({ params: clinicalEntityParamsSchema }),
    requireAnyPermission(
      options.authorizationService,
      clinicalReadPermissions,
    ),
    controller.getAllergyHistory,
  );
  router.post(
    '/allergies/:patientAllergyId/correct',
    validateRequest({
      ...mutationHeaders,
      params: clinicalEntityParamsSchema,
      body: correctPatientAllergyBodySchema,
    }),
    requirePermission(
      options.authorizationService,
      CLINICAL_EMR_PERMISSION_KEYS.CLINICAL_NOTE_AMEND,
    ),
    controller.correctAllergy,
  );

  router.post(
    '/sections',
    validateRequest({
      ...mutationHeaders,
      body: structuredEncounterSectionBodySchema,
    }),
    requirePermission(
      options.authorizationService,
      CLINICAL_EMR_PERMISSION_KEYS.CLINICAL_NOTE_CREATE,
    ),
    controller.recordStructuredSection,
  );
  router.get(
    '/vital-signs',
    validateRequest({ query: vitalSignListQuerySchema }),
    requireAnyPermission(
      options.authorizationService,
      clinicalReadPermissions,
    ),
    controller.listVitalSigns,
  );
  router.post(
    '/vital-signs',
    validateRequest({
      ...mutationHeaders,
      body: recordVitalSignsBodySchema,
    }),
    requireAnyPermission(
      options.authorizationService,
      [
        CLINICAL_EMR_PERMISSION_KEYS.CLINICAL_NOTE_CREATE,
        'nursing.vitals.create',
      ],
    ),
    controller.recordVitalSigns,
  );
  router.get(
    '/vital-signs/:vitalSignId/history',
    validateRequest({ params: clinicalEntityParamsSchema }),
    requireAnyPermission(
      options.authorizationService,
      clinicalReadPermissions,
    ),
    controller.getVitalSignHistory,
  );
  router.post(
    '/vital-signs/:vitalSignId/correct',
    validateRequest({
      ...mutationHeaders,
      params: clinicalEntityParamsSchema,
      body: correctVitalSignsBodySchema,
    }),
    requireAnyPermission(
      options.authorizationService,
      [
        CLINICAL_EMR_PERMISSION_KEYS.CLINICAL_NOTE_AMEND,
        'nursing.vitals.amend',
      ],
    ),
    controller.correctVitalSigns,
  );
  router.post(
    '/vital-signs/:vitalSignId/entered-in-error',
    validateRequest({
      ...mutationHeaders,
      params: clinicalEntityParamsSchema,
      body: enterVitalSignsInErrorBodySchema,
    }),
    requireAnyPermission(
      options.authorizationService,
      [
        CLINICAL_EMR_PERMISSION_KEYS.CLINICAL_NOTE_AMEND,
        'nursing.vitals.amend',
      ],
    ),
    controller.enterVitalSignsInError,
  );

  router.get(
    '/referrals',
    validateRequest({ query: clinicalReferralListQuerySchema }),
    requireAnyPermission(
      options.authorizationService,
      clinicalReadPermissions,
    ),
    controller.listReferrals,
  );
  router.post(
    '/referrals',
    validateRequest({
      ...mutationHeaders,
      body: createClinicalReferralBodySchema,
    }),
    requirePermission(
      options.authorizationService,
      CLINICAL_EMR_PERMISSION_KEYS.ENCOUNTER_CREATE,
    ),
    controller.createReferral,
  );
  router.get(
    '/referrals/:referralNumber',
    validateRequest({ params: clinicalEntityParamsSchema }),
    requireAnyPermission(
      options.authorizationService,
      clinicalReadPermissions,
    ),
    controller.getReferral,
  );
  router.get(
    '/referrals/:referralNumber/history',
    validateRequest({ params: clinicalEntityParamsSchema }),
    requireAnyPermission(
      options.authorizationService,
      clinicalReadPermissions,
    ),
    controller.referralHistory,
  );
  router.post(
    '/referrals/:referralNumber/status',
    validateRequest({
      ...mutationHeaders,
      params: clinicalEntityParamsSchema,
      body: transitionClinicalReferralBodySchema,
    }),
    requirePermission(
      options.authorizationService,
      CLINICAL_EMR_PERMISSION_KEYS.ENCOUNTER_CREATE,
    ),
    controller.transitionReferral,
  );
  router.post(
    '/referrals/:referralNumber/correct',
    validateRequest({
      ...mutationHeaders,
      params: clinicalEntityParamsSchema,
      body: correctClinicalReferralBodySchema,
    }),
    requirePermission(
      options.authorizationService,
      CLINICAL_EMR_PERMISSION_KEYS.ENCOUNTER_AMEND,
    ),
    controller.correctReferral,
  );

  router.get(
    '/patients/:patientId/summary',
    validateRequest({
      params: clinicalEntityParamsSchema,
      query: clinicalPatientSummaryQuerySchema,
    }),
    requireAnyPermission(
      options.authorizationService,
      clinicalReadPermissions,
    ),
    controller.patientSummary,
  );
  router.get(
    '/patients/:patientId/timeline',
    validateRequest({
      params: clinicalEntityParamsSchema,
      query: clinicalTimelineRouteQuerySchema,
    }),
    requireAnyPermission(
      options.authorizationService,
      clinicalReadPermissions,
    ),
    controller.timeline,
  );
  router.get(
    '/providers/:providerId/worklist',
    validateRequest({
      params: clinicalEntityParamsSchema,
      query: clinicalProviderWorklistQuerySchema,
    }),
    requireAnyPermission(
      options.authorizationService,
      clinicalReadPermissions,
    ),
    controller.providerWorklist,
  );

  return router;
}

export interface CreateClinicalEmrModuleOptions {
  infrastructure:
    ReturnType<typeof createClinicalEmrInfrastructure>;
  authenticationService: AuthenticationService;
  authorizationService: AuthorizationService;
}

export function createClinicalEmrModule(
  options: CreateClinicalEmrModuleOptions,
) {
  const router =
    createClinicalEmrRouter({
      application: options.infrastructure.application,
      authenticationService: options.authenticationService,
      authorizationService: options.authorizationService,
    });

  return {
    ...options.infrastructure,
    router,
  };
}

const clinicalEmrBearerSecurity = [
  {
    bearerAuth: [],
  },
] as const;

function clinicalPathParameter(
  name: string,
): Record<string, unknown> {
  return {
    name,
    in: 'path',
    required: true,
    schema: {
      type: 'string',
      pattern: '^[a-fA-F0-9]{24}$',
    },
  };
}

function clinicalReferralNumberParameter(): Record<string, unknown> {
  return {
    name: 'referralNumber',
    in: 'path',
    required: true,
    schema: {
      type: 'string',
      example: 'REF-2026-0000042',
    },
  };
}

function clinicalReadOperation(
  summary: string,
  permission: string,
  parameters: readonly Record<string, unknown>[] = [],
): Record<string, unknown> {
  return {
    tags: ['Clinical EMR'],
    summary,
    description: `Requires ${permission}. Restricted records are filtered through the minimum-necessary clinical access policy and sensitive reads are audited.`,
    security: clinicalEmrBearerSecurity,
    parameters,
    responses: {
      '200': {
        description: 'Clinical EMR response',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ClinicalEmrSuccess',
            },
          },
        },
      },
      '401': {
        description: 'Authentication required',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiError',
            },
          },
        },
      },
      '403': {
        description: 'Permission or record-level access denied',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiError',
            },
          },
        },
      },
    },
  };
}

function clinicalMutationOperation(
  summary: string,
  permission: string,
  requestSchema: string,
  successStatus = '200',
  parameters: readonly Record<string, unknown>[] = [],
): Record<string, unknown> {
  return {
    tags: ['Clinical EMR'],
    summary,
    description: `Requires ${permission}. The operation is idempotent, facility-scoped, audited, journaled, recoverable, and protected by optimistic concurrency where an expectedVersion is supplied.`,
    security: clinicalEmrBearerSecurity,
    parameters: [
      ...parameters,
      {
        name: 'idempotency-key',
        in: 'header',
        required: true,
        schema: {
          type: 'string',
          minLength: 8,
          maxLength: 200,
        },
        example: 'clinical-emr-20260718-0001',
      },
      {
        name: 'x-break-glass-reason',
        in: 'header',
        required: false,
        schema: {
          type: 'string',
          minLength: 10,
          maxLength: 1000,
        },
      },
    ],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            $ref: `#/components/schemas/${requestSchema}`,
          },
        },
      },
    },
    responses: {
      [successStatus]: {
        description: 'Clinical mutation completed',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ClinicalEmrSuccess',
            },
          },
        },
      },
      '400': {
        description: 'Request validation failed',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiError',
            },
          },
        },
      },
      '409': {
        description: 'Optimistic concurrency, duplicate, or lifecycle conflict',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiError',
            },
          },
        },
      },
    },
  };
}

export const clinicalEmrOpenApi = {
  tags: [
    {
      name: 'Clinical EMR',
      description:
        'Facility-scoped clinical encounters, versioned notes, diagnoses, problem lists, allergies, structured sections, vital signs, referrals, longitudinal summaries, and timelines.',
    },
  ],
  components: {
    schemas: {
      ClinicalEmrSuccess: {
        type: 'object',
        required: ['success', 'data', 'correlationId'],
        properties: {
          success: {
            type: 'boolean',
            const: true,
          },
          data: {
            type: ['object', 'array'],
          },
          correlationId: {
            type: 'string',
            format: 'uuid',
          },
        },
      },
      ClinicalExpectedVersion: {
        type: 'object',
        required: ['expectedVersion'],
        properties: {
          expectedVersion: {
            type: 'integer',
            minimum: 0,
            example: 2,
          },
          reason: {
            type: ['string', 'null'],
            minLength: 5,
            maxLength: 5000,
          },
        },
      },
      ClinicalEncounterCreate: {
        type: 'object',
        required: [
          'patientId',
          'encounterType',
          'careContext',
          'serviceDate',
          'departmentId',
          'primaryProviderId',
        ],
        properties: {
          patientId: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{24}$',
          },
          registrationId: {
            type: ['string', 'null'],
          },
          opdVisitId: {
            type: ['string', 'null'],
          },
          queueTokenId: {
            type: ['string', 'null'],
          },
          encounterType: {
            type: 'string',
            enum: [
              'OPD',
              'EMERGENCY',
              'INPATIENT',
              'DAY_CARE',
              'TELEMEDICINE',
              'PROCEDURE',
              'CONSULTATION',
              'OTHER',
            ],
            example: 'OPD',
          },
          careContext: {
            type: 'string',
            example: 'OPD_VISIT',
          },
          serviceDate: {
            type: 'string',
            format: 'date',
            example: '2026-07-18',
          },
          departmentId: {
            type: 'string',
          },
          clinicId: {
            type: ['string', 'null'],
          },
          servicePointId: {
            type: ['string', 'null'],
          },
          primaryProviderId: {
            type: 'string',
          },
          confidentiality: {
            type: 'string',
            enum: ['ROUTINE', 'RESTRICTED', 'HIGHLY_RESTRICTED'],
            default: 'ROUTINE',
          },
        },
      },
      ClinicalNoteMutation: {
        type: 'object',
        properties: {
          encounterId: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{24}$',
          },
          documentType: {
            type: 'string',
            example: 'GENERAL_CLINICAL_NOTE',
          },
          authorProviderId: {
            type: 'string',
          },
          title: {
            type: ['string', 'null'],
            example: 'Consultation note',
          },
          narrativeText: {
            type: ['string', 'null'],
            example: 'Patient reviewed. Clinical narrative is returned only to authorized readers.',
          },
          structuredData: {
            type: ['object', 'array', 'null'],
          },
          expectedVersion: {
            type: 'integer',
            minimum: 0,
          },
          reason: {
            type: ['string', 'null'],
          },
        },
      },
      ClinicalDiagnosisMutation: {
        type: 'object',
        properties: {
          encounterId: {
            type: 'string',
          },
          codeSystem: {
            type: 'string',
            enum: ['ICD_10', 'SNOMED_CT', 'LOCAL', 'OTHER'],
          },
          code: {
            type: 'string',
            example: 'I10',
          },
          display: {
            type: 'string',
            example: 'Essential hypertension',
          },
          role: {
            type: 'string',
            example: 'PRIMARY',
          },
          certainty: {
            type: 'string',
            example: 'CONFIRMED',
          },
          expectedVersion: {
            type: 'integer',
            minimum: 0,
          },
          reason: {
            type: ['string', 'null'],
          },
        },
      },
      ClinicalListMutation: {
        type: 'object',
        properties: {
          expectedVersion: {
            type: 'integer',
            minimum: 0,
          },
          status: {
            type: 'string',
          },
          reason: {
            type: ['string', 'null'],
          },
          replacement: {
            type: 'object',
          },
        },
      },
      ClinicalStructuredSection: {
        type: 'object',
        required: ['encounterId', 'authorProviderId', 'sectionKey'],
        properties: {
          encounterId: {
            type: 'string',
          },
          authorProviderId: {
            type: 'string',
          },
          sectionKey: {
            type: 'string',
            enum: [
              'CHIEF_COMPLAINT',
              'HISTORY_OF_PRESENTING_ILLNESS',
              'PAST_MEDICAL_HISTORY',
              'PAST_SURGICAL_HISTORY',
              'FAMILY_HISTORY',
              'SOCIAL_HISTORY',
              'CURRENT_MEDICATIONS',
              'REVIEW_OF_SYSTEMS',
              'PHYSICAL_EXAMINATION',
              'ASSESSMENT',
              'PLAN',
              'PROCEDURES_AND_INTERVENTIONS',
              'FOLLOW_UP_INSTRUCTIONS',
            ],
          },
          narrativeText: {
            type: ['string', 'null'],
          },
          structuredData: {
            type: ['object', 'null'],
          },
        },
      },
      ClinicalVitalSigns: {
        type: 'object',
        required: ['encounterId', 'measuredAt'],
        properties: {
          encounterId: {
            type: 'string',
          },
          measuredAt: {
            type: 'string',
            format: 'date-time',
          },
          temperatureCelsius: {
            type: ['string', 'null'],
            example: '37.2',
          },
          pulsePerMinute: {
            type: ['integer', 'null'],
            example: 84,
          },
          systolicBloodPressureMmHg: {
            type: ['integer', 'null'],
            example: 120,
          },
          diastolicBloodPressureMmHg: {
            type: ['integer', 'null'],
            example: 80,
          },
          oxygenSaturationPercent: {
            type: ['string', 'null'],
            example: '98',
          },
          painScore: {
            type: ['integer', 'null'],
            minimum: 0,
            maximum: 10,
          },
          expectedVersion: {
            type: 'integer',
            minimum: 0,
          },
          reason: {
            type: ['string', 'null'],
          },
        },
      },
      ClinicalReferralCreate: {
        type: 'object',
        required: [
          'patientId',
          'sourceEncounterId',
          'requestingProviderId',
          'referralType',
          'target',
          'reason',
        ],
        properties: {
          patientId: {
            type: 'string',
          },
          sourceEncounterId: {
            type: 'string',
          },
          sourceClinicalNoteId: {
            type: ['string', 'null'],
          },
          requestingProviderId: {
            type: 'string',
          },
          referralType: {
            type: 'string',
            enum: [
              'INTERNAL_CONSULTATION',
              'EXTERNAL_REFERRAL',
              'TRANSFER_OF_CARE',
            ],
          },
          priority: {
            type: 'string',
            enum: ['ROUTINE', 'URGENT', 'EMERGENCY'],
            default: 'ROUTINE',
          },
          target: {
            type: 'object',
            properties: {
              facilityId: {
                type: ['string', 'null'],
              },
              departmentId: {
                type: ['string', 'null'],
              },
              providerId: {
                type: ['string', 'null'],
              },
              externalOrganization: {
                type: ['string', 'null'],
              },
              externalProviderName: {
                type: ['string', 'null'],
              },
            },
          },
          reason: {
            type: 'string',
            example: 'Cardiology consultation requested',
          },
          clinicalQuestion: {
            type: ['string', 'null'],
          },
        },
      },
      ClinicalReferralTransition: {
        type: 'object',
        required: ['expectedVersion', 'status'],
        properties: {
          expectedVersion: {
            type: 'integer',
            minimum: 0,
          },
          status: {
            type: 'string',
            enum: [
              'ACCEPTED',
              'IN_PROGRESS',
              'COMPLETED',
              'DECLINED',
              'CANCELLED',
            ],
          },
          assignedProviderId: {
            type: ['string', 'null'],
          },
          responseSummary: {
            type: ['string', 'null'],
          },
          reason: {
            type: ['string', 'null'],
          },
        },
      },
      ClinicalReferralCorrection: {
        type: 'object',
        required: ['expectedVersion', 'correctionReason', 'replacement'],
        properties: {
          expectedVersion: {
            type: 'integer',
            minimum: 0,
          },
          correctionReason: {
            type: 'string',
            minLength: 5,
          },
          replacement: {
            allOf: [
              {
                $ref: '#/components/schemas/ClinicalReferralCreate',
              },
            ],
          },
        },
      },
    },
  },
  paths: {
    '/clinical-emr/diagnosis-catalog': {
      get: clinicalReadOperation(
        'Search the facility diagnosis catalog',
        'encounters.read_assigned or encounters.read_all',
      ),
    },
    '/clinical-emr/allergy-catalog': {
      get: clinicalReadOperation(
        'Search the facility allergen catalog',
        'encounters.read_assigned or encounters.read_all',
      ),
    },
    '/clinical-emr/encounters': {
      get: clinicalReadOperation(
        'List clinical encounters',
        'encounters.read_assigned or encounters.read_all',
      ),
      post: clinicalMutationOperation(
        'Create a clinical encounter',
        'encounters.create',
        'ClinicalEncounterCreate',
        '201',
      ),
    },
    '/clinical-emr/encounters/{encounterId}': {
      get: clinicalReadOperation(
        'Read a clinical encounter',
        'encounters.read_assigned or encounters.read_all',
        [clinicalPathParameter('encounterId')],
      ),
    },
    '/clinical-emr/encounters/{encounterId}/history': {
      get: clinicalReadOperation(
        'Read immutable encounter status and ownership history',
        'encounters.read_assigned or encounters.read_all',
        [clinicalPathParameter('encounterId')],
      ),
    },
    '/clinical-emr/encounters/{encounterId}/status': {
      post: clinicalMutationOperation(
        'Change encounter lifecycle status',
        'encounters.finalize',
        'ClinicalExpectedVersion',
        '200',
        [clinicalPathParameter('encounterId')],
      ),
    },
    '/clinical-emr/encounters/{encounterId}/reassign': {
      post: clinicalMutationOperation(
        'Reassign clinical ownership',
        'encounters.create',
        'ClinicalExpectedVersion',
        '200',
        [clinicalPathParameter('encounterId')],
      ),
    },
    '/clinical-emr/encounters/{encounterId}/sign': {
      post: clinicalMutationOperation(
        'Sign a completed encounter',
        'encounters.finalize',
        'ClinicalExpectedVersion',
        '200',
        [clinicalPathParameter('encounterId')],
      ),
    },
    '/clinical-emr/encounters/{encounterId}/correct': {
      post: clinicalMutationOperation(
        'Correct an encounter through replacement',
        'encounters.amend',
        'ClinicalExpectedVersion',
        '201',
        [clinicalPathParameter('encounterId')],
      ),
    },
    '/clinical-emr/notes': {
      get: clinicalReadOperation(
        'List clinical notes',
        'encounters.read_assigned or encounters.read_all',
      ),
      post: clinicalMutationOperation(
        'Create a clinical note draft',
        'clinical_notes.create',
        'ClinicalNoteMutation',
        '201',
      ),
    },
    '/clinical-emr/notes/{clinicalNoteId}': {
      get: clinicalReadOperation(
        'Read a clinical note',
        'encounters.read_assigned or encounters.read_all',
        [clinicalPathParameter('clinicalNoteId')],
      ),
    },
    '/clinical-emr/notes/{clinicalNoteId}/history': {
      get: clinicalReadOperation(
        'Read and integrity-check immutable clinical note versions',
        'encounters.read_assigned or encounters.read_all',
        [clinicalPathParameter('clinicalNoteId')],
      ),
    },
    '/clinical-emr/notes/{clinicalNoteId}/draft': {
      patch: clinicalMutationOperation(
        'Update a clinical note draft',
        'clinical_notes.create',
        'ClinicalNoteMutation',
        '200',
        [clinicalPathParameter('clinicalNoteId')],
      ),
    },
    '/clinical-emr/notes/{clinicalNoteId}/finalize': {
      post: clinicalMutationOperation(
        'Finalize or sign a clinical note',
        'encounters.finalize',
        'ClinicalNoteMutation',
        '200',
        [clinicalPathParameter('clinicalNoteId')],
      ),
    },
    '/clinical-emr/notes/{clinicalNoteId}/amend': {
      post: clinicalMutationOperation(
        'Amend a finalized clinical note',
        'clinical_notes.amend',
        'ClinicalNoteMutation',
        '200',
        [clinicalPathParameter('clinicalNoteId')],
      ),
    },
    '/clinical-emr/notes/{clinicalNoteId}/correct': {
      post: clinicalMutationOperation(
        'Correct a clinical note through replacement',
        'clinical_notes.amend',
        'ClinicalNoteMutation',
        '201',
        [clinicalPathParameter('clinicalNoteId')],
      ),
    },
    '/clinical-emr/notes/addenda': {
      post: clinicalMutationOperation(
        'Add an addendum to a finalized clinical note',
        'clinical_notes.amend',
        'ClinicalNoteMutation',
        '201',
      ),
    },
    '/clinical-emr/notes/{clinicalNoteId}/entered-in-error': {
      post: clinicalMutationOperation(
        'Mark a clinical note entered in error',
        'clinical_notes.amend',
        'ClinicalExpectedVersion',
        '200',
        [clinicalPathParameter('clinicalNoteId')],
      ),
    },
    '/clinical-emr/diagnoses': {
      get: clinicalReadOperation(
        'List authorized encounter or patient diagnoses',
        'encounters.read_assigned or encounters.read_all',
      ),
      post: clinicalMutationOperation(
        'Record an encounter diagnosis',
        'clinical_notes.create',
        'ClinicalDiagnosisMutation',
        '201',
      ),
    },
    '/clinical-emr/diagnoses/{encounterDiagnosisId}/verify': {
      post: clinicalMutationOperation(
        'Verify an encounter diagnosis',
        'clinical_notes.create',
        'ClinicalExpectedVersion',
        '200',
        [clinicalPathParameter('encounterDiagnosisId')],
      ),
    },
    '/clinical-emr/diagnoses/{encounterDiagnosisId}/status': {
      post: clinicalMutationOperation(
        'Change an encounter diagnosis status',
        'clinical_notes.amend',
        'ClinicalDiagnosisMutation',
        '200',
        [clinicalPathParameter('encounterDiagnosisId')],
      ),
    },
    '/clinical-emr/diagnoses/{encounterDiagnosisId}/correct': {
      post: clinicalMutationOperation(
        'Correct an encounter diagnosis',
        'clinical_notes.amend',
        'ClinicalDiagnosisMutation',
        '201',
        [clinicalPathParameter('encounterDiagnosisId')],
      ),
    },
    '/clinical-emr/problems': {
      get: clinicalReadOperation(
        'List the authorized longitudinal problem list',
        'encounters.read_assigned or encounters.read_all',
      ),
      post: clinicalMutationOperation(
        'Create a longitudinal problem',
        'clinical_notes.create',
        'ClinicalListMutation',
        '201',
      ),
    },
    '/clinical-emr/problems/{patientProblemId}': {
      patch: clinicalMutationOperation(
        'Update a longitudinal problem',
        'clinical_notes.create',
        'ClinicalListMutation',
        '200',
        [clinicalPathParameter('patientProblemId')],
      ),
    },
    '/clinical-emr/problems/{patientProblemId}/history': {
      get: clinicalReadOperation(
        'Read and integrity-check immutable problem-list versions',
        'encounters.read_assigned or encounters.read_all',
        [clinicalPathParameter('patientProblemId')],
      ),
    },
    '/clinical-emr/problems/{patientProblemId}/correct': {
      post: clinicalMutationOperation(
        'Correct a longitudinal problem',
        'clinical_notes.amend',
        'ClinicalListMutation',
        '201',
        [clinicalPathParameter('patientProblemId')],
      ),
    },
    '/clinical-emr/allergies': {
      get: clinicalReadOperation(
        'List authorized allergies and adverse reactions',
        'encounters.read_assigned or encounters.read_all',
      ),
      post: clinicalMutationOperation(
        'Record an allergy or adverse reaction',
        'clinical_notes.create',
        'ClinicalListMutation',
        '201',
      ),
    },
    '/clinical-emr/allergies/{patientAllergyId}': {
      patch: clinicalMutationOperation(
        'Update an allergy or adverse reaction',
        'clinical_notes.create',
        'ClinicalListMutation',
        '200',
        [clinicalPathParameter('patientAllergyId')],
      ),
    },
    '/clinical-emr/allergies/{patientAllergyId}/history': {
      get: clinicalReadOperation(
        'Read and integrity-check immutable allergy and adverse-reaction versions',
        'encounters.read_assigned or encounters.read_all',
        [clinicalPathParameter('patientAllergyId')],
      ),
    },
    '/clinical-emr/allergies/{patientAllergyId}/correct': {
      post: clinicalMutationOperation(
        'Correct an allergy or adverse reaction',
        'clinical_notes.amend',
        'ClinicalListMutation',
        '201',
        [clinicalPathParameter('patientAllergyId')],
      ),
    },
    '/clinical-emr/sections': {
      post: clinicalMutationOperation(
        'Record a structured encounter section',
        'clinical_notes.create',
        'ClinicalStructuredSection',
        '201',
      ),
    },
    '/clinical-emr/vital-signs': {
      get: clinicalReadOperation(
        'List authorized vital signs and measurements',
        'encounters.read_assigned or encounters.read_all',
      ),
      post: clinicalMutationOperation(
        'Record vital signs and measurements',
        'clinical_notes.create or nursing.vitals.create',
        'ClinicalVitalSigns',
        '201',
      ),
    },
    '/clinical-emr/vital-signs/{vitalSignId}/history': {
      get: clinicalReadOperation(
        'Read an append-only vital-sign correction chain',
        'encounters.read_assigned or encounters.read_all',
        [clinicalPathParameter('vitalSignId')],
      ),
    },
    '/clinical-emr/vital-signs/{vitalSignId}/correct': {
      post: clinicalMutationOperation(
        'Correct vital signs through an append-only replacement',
        'clinical_notes.amend or nursing.vitals.amend',
        'ClinicalVitalSigns',
        '201',
        [clinicalPathParameter('vitalSignId')],
      ),
    },
    '/clinical-emr/vital-signs/{vitalSignId}/entered-in-error': {
      post: clinicalMutationOperation(
        'Mark vital signs entered in error',
        'clinical_notes.amend or nursing.vitals.amend',
        'ClinicalExpectedVersion',
        '200',
        [clinicalPathParameter('vitalSignId')],
      ),
    },
    '/clinical-emr/referrals': {
      get: clinicalReadOperation(
        'List referral and consultation requests',
        'encounters.read_assigned or encounters.read_all',
      ),
      post: clinicalMutationOperation(
        'Create a referral or consultation request',
        'encounters.create',
        'ClinicalReferralCreate',
        '201',
      ),
    },
    '/clinical-emr/referrals/{referralNumber}': {
      get: clinicalReadOperation(
        'Read the current referral version',
        'encounters.read_assigned or encounters.read_all',
        [clinicalReferralNumberParameter()],
      ),
    },
    '/clinical-emr/referrals/{referralNumber}/history': {
      get: clinicalReadOperation(
        'Read immutable referral history',
        'encounters.read_assigned or encounters.read_all',
        [clinicalReferralNumberParameter()],
      ),
    },
    '/clinical-emr/referrals/{referralNumber}/status': {
      post: clinicalMutationOperation(
        'Transition referral lifecycle status',
        'encounters.create',
        'ClinicalReferralTransition',
        '200',
        [clinicalReferralNumberParameter()],
      ),
    },
    '/clinical-emr/referrals/{referralNumber}/correct': {
      post: clinicalMutationOperation(
        'Correct a referral through immutable replacement versions',
        'encounters.amend',
        'ClinicalReferralCorrection',
        '201',
        [clinicalReferralNumberParameter()],
      ),
    },
    '/clinical-emr/patients/{patientId}/summary': {
      get: clinicalReadOperation(
        'Read a minimum-necessary longitudinal patient summary',
        'encounters.read_assigned or encounters.read_all',
        [clinicalPathParameter('patientId')],
      ),
    },
    '/clinical-emr/patients/{patientId}/timeline': {
      get: clinicalReadOperation(
        'Read the patient EMR timeline',
        'encounters.read_assigned or encounters.read_all',
        [clinicalPathParameter('patientId')],
      ),
    },
    '/clinical-emr/providers/{providerId}/worklist': {
      get: clinicalReadOperation(
        'Read a provider clinical worklist',
        'encounters.read_assigned or encounters.read_all',
        [clinicalPathParameter('providerId')],
      ),
    },
  },
} as const;