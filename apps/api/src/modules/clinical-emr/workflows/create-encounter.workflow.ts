import {
  ClinicalEmrMinimumNecessaryAccessError,
  ClinicalEncounterContextMismatchError,
  DuplicateActiveEncounterError,
} from '../clinical-emr.errors.js';

import {
  toEncounterMutationResult,
  type EncounterMutationResult,
} from '../clinical-emr.mapper.js';

import {
  deleteCreatedClinicalRecordCompensation,
} from '../clinical-emr.mutation-snapshots.js';

import {
  buildClinicalEmrAuditActorFields,
  type ClinicalEmrMutationDependencies,
  type ClinicalEmrTransactionContext,
} from '../clinical-emr.ports.js';

import {
  encounterAuditSnapshot,
} from '../clinical-emr.projections.js';

import {
  CLINICAL_EMR_AUDIT_ACTIONS,
  CLINICAL_EMR_OUTBOX_EVENTS,
  CLINICAL_EMR_REALTIME_EVENTS,
  CLINICAL_EMR_TRANSACTION_STATES,
  CLINICAL_EMR_TRANSACTION_TYPES,
} from '../clinical-emr.transaction.constants.js';

import type {
  ClinicalEmrActorContext,
  CreateEncounterInput,
} from '../clinical-emr.types.js';

import {
  encounterCreateLockKeys,
  clinicalEmrDeduplicationKey,
  newClinicalEmrObjectIdString,
  safeCreateEncounterJournalPayload,
  safeEncounterEventPayload,
} from '../clinical-emr.workflow-helpers.js';

import {
  normalizeOptionalClinicalText,
  parseClinicalDateTime,
} from '../clinical-emr.normalization.js';

import type {
  EncounterStatusHistoryRepository,
} from '../repositories/encounter-status-history.repository.js';

import type {
  EncounterRepository,
} from '../repositories/encounter.repository.js';

import type {
  ClinicalEmrContextService,
  ResolvedClinicalOpdContext,
} from '../services/clinical-emr-context.service.js';

import type {
  ClinicalEmrNumberService,
} from '../services/clinical-emr-number.service.js';

import type {
  ClinicalEmrPatientResolutionService,
} from '../services/clinical-emr-patient-resolution.service.js';

export interface CreateEncounterCommand {
  input: CreateEncounterInput;
  actor: ClinicalEmrActorContext;
  idempotencyKey: string;
}

function assertNullableEqual(
  name: string,
  supplied: string | null | undefined,
  resolved: string | null,
): void {
  if ((supplied ?? null) !== resolved) {
    throw new ClinicalEncounterContextMismatchError(
      `${name} does not match the resolved OPD visit context`,
    );
  }
}

function assertOpdInput(
  input: CreateEncounterInput,
  context: ResolvedClinicalOpdContext,
  canonicalPatientId: string,
): void {
  if (
    input.careContext !== 'OPD_VISIT' ||
    input.encounterType !== 'OPD' ||
    input.opdVisitId == null ||
    input.registrationId == null
  ) {
    throw new ClinicalEncounterContextMismatchError(
      'This encounter workflow requires an OPD encounter linked to a registration and OPD visit',
    );
  }

  const linkage = context.linkage;

  if (
    linkage.patientId !== canonicalPatientId ||
    input.serviceDate !== context.visit.serviceDate ||
    input.departmentId !== linkage.departmentId ||
    input.primaryProviderId !== linkage.assignedProviderId
  ) {
    throw new ClinicalEncounterContextMismatchError();
  }

  assertNullableEqual('registrationId', input.registrationId, linkage.registrationId);
  assertNullableEqual('opdVisitId', input.opdVisitId, linkage.opdVisitId);
  assertNullableEqual('queueTokenId', input.queueTokenId, linkage.queueTokenId);
  assertNullableEqual('clinicId', input.clinicId, linkage.clinicId);
  assertNullableEqual('servicePointId', input.servicePointId, linkage.servicePointId);
}

export class CreateEncounterWorkflow {
  public constructor(
    private readonly encounters: EncounterRepository,
    private readonly history: EncounterStatusHistoryRepository,
    private readonly patientResolution: ClinicalEmrPatientResolutionService,
    private readonly contexts: ClinicalEmrContextService,
    private readonly numbers: ClinicalEmrNumberService,
    private readonly dependencies: ClinicalEmrMutationDependencies,
  ) {}

  public async execute(
    command: CreateEncounterCommand,
  ): Promise<EncounterMutationResult> {
    if (command.input.opdVisitId == null) {
      throw new ClinicalEncounterContextMismatchError(
        'OPD encounter creation requires opdVisitId',
      );
    }

    const preflightPatient = await this.patientResolution.resolve(
      command.actor.facilityId,
      command.input.patientId,
    );

    const preflightContext = await this.contexts.resolveOpdContext(
      command.actor.facilityId,
      command.input.opdVisitId,
    );

    assertOpdInput(
      command.input,
      preflightContext,
      preflightPatient.canonicalPatientId,
    );

    const assignedProviderIds = [
      ...new Set([
        command.input.primaryProviderId,
        command.input.currentOwnerId ?? command.input.primaryProviderId,
        ...(command.input.assignedProviderIds ?? []),
      ]),
    ];

    const access = await this.dependencies.accessPolicy.authorize({
      actor: command.actor,
      patientId: preflightPatient.canonicalPatientId,
      assignedProviderIds,
      confidentiality: command.input.confidentiality ?? 'ROUTINE',
      intendedAction: 'CREATE',
    });

    if (!access.allowed) {
      throw new ClinicalEmrMinimumNecessaryAccessError();
    }

    return this.dependencies.transactionManager.execute({
      transactionType: CLINICAL_EMR_TRANSACTION_TYPES.CREATE_ENCOUNTER,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: encounterCreateLockKeys(
        command.actor.facilityId,
        preflightPatient.canonicalPatientId,
        command.input,
      ),
      idempotencyPayload: {
        facilityId: command.actor.facilityId,
        input: command.input,
      },
      journalPayload: safeCreateEncounterJournalPayload(command.input),
      execute: async (transaction) => this.executeTransaction(
        command,
        transaction,
      ),
    });
  }

  private async executeTransaction(
    command: CreateEncounterCommand,
    transaction: ClinicalEmrTransactionContext,
  ): Promise<EncounterMutationResult> {
    const patient = await this.patientResolution.resolve(
      command.actor.facilityId,
      command.input.patientId,
    );

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.CANONICAL_PATIENT_RESOLVED,
      {
        canonicalRedirected: patient.redirected,
        mergeDepth: patient.mergeChain.length,
      },
    );

    const context = await this.contexts.resolveOpdContext(
      command.actor.facilityId,
      command.input.opdVisitId as string,
    );

    assertOpdInput(command.input, context, patient.canonicalPatientId);

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.ENCOUNTER_CONTEXT_VALIDATED,
      {
        careContext: 'OPD_VISIT',
        hasQueueToken: context.linkage.queueTokenId !== null,
      },
    );

    const existing = await this.encounters.findActiveByOpdVisit(
      command.actor.facilityId,
      context.visit.id,
      true,
    );

    if (existing !== null) {
      throw new DuplicateActiveEncounterError();
    }

    const assignedProviderIds = [
      ...new Set([
        context.provider.id,
        command.input.currentOwnerId ?? context.provider.id,
        ...(command.input.assignedProviderIds ?? []),
      ]),
    ];

    const access = await this.dependencies.accessPolicy.authorize({
      actor: command.actor,
      patientId: patient.canonicalPatientId,
      assignedProviderIds,
      confidentiality: command.input.confidentiality ?? 'ROUTINE',
      intendedAction: 'CREATE',
    });

    if (!access.allowed) {
      throw new ClinicalEmrMinimumNecessaryAccessError();
    }

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.ACCESS_AUTHORIZED,
      {
        accessMode: access.accessMode,
      },
    );

    const number = await this.numbers.allocateEncounterNumber({
      facilityId: command.actor.facilityId,
      serviceDate: context.visit.serviceDate,
    });

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.NUMBER_ALLOCATED,
      {
        sequenceKey: number.sequenceKey,
        sequenceValue: number.sequenceValue,
      },
    );

    const encounterId = newClinicalEmrObjectIdString();
    const occurredAt = command.input.startedAt === undefined
      ? this.dependencies.clock.now()
      : parseClinicalDateTime(command.input.startedAt, 'startedAt');

    const created = await this.encounters.create({
      encounterId,
      facilityId: command.actor.facilityId,
      encounterNumber: number.number,
      patientId: patient.canonicalPatientId,
      requestedPatientId: patient.requestedPatientId,
      canonicalRedirected: patient.redirected,
      registrationId: context.registration.id,
      opdVisitId: context.visit.id,
      queueTokenId: context.queueToken?.id ?? null,
      emergencyCaseId: null,
      admissionId: null,
      referralId: null,
      encounterType: 'OPD',
      careContext: 'OPD_VISIT',
      serviceDate: context.visit.serviceDate,
      departmentId: context.department.id,
      clinicId: context.clinic?.id ?? null,
      servicePointId: context.servicePoint?.id ?? null,
      primaryProviderId: context.provider.id,
      currentOwnerId: command.input.currentOwnerId ?? context.provider.id,
      currentOwnerRole: command.input.currentOwnerRole ?? 'PRIMARY_PROVIDER',
      assignedProviderIds,
      confidentiality: command.input.confidentiality ?? 'ROUTINE',
      restrictionReason: normalizeOptionalClinicalText(
        command.input.restrictionReason,
        'restrictionReason',
      ),
      startedAt: occurredAt,
      transactionId: transaction.transactionId,
      correlationId: command.actor.correlationId,
      actorUserId: command.actor.userId,
    });

    await transaction.registerCompensation(
      deleteCreatedClinicalRecordCompensation({
        key: `delete-encounter:${encounterId}`,
        collection: 'encounters',
        entityId: encounterId,
        expectedVersion: 0,
        transactionId: transaction.transactionId,
      }),
    );

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.CURRENT_PROJECTION_CREATED,
      {
        encounterId,
        encounterNumber: created.encounterNumber,
      },
    );

    const historyId = newClinicalEmrObjectIdString();

    await this.history.create({
      historyId,
      facilityId: command.actor.facilityId,
      encounterId,
      patientId: patient.canonicalPatientId,
      sequence: 1,
      fromStatus: null,
      toStatus: 'CREATED',
      previousOwnerId: null,
      newOwnerId: created.currentOwnerId.toHexString(),
      previousOwnerRole: null,
      newOwnerRole: created.currentOwnerRole,
      changeSource: 'PROVIDER',
      reason: null,
      occurredAt,
      changedBy: command.actor.userId,
      transactionId: transaction.transactionId,
      correlationId: command.actor.correlationId,
    });

    await transaction.registerCompensation(
      deleteCreatedClinicalRecordCompensation({
        key: `delete-encounter-history:${historyId}`,
        collection: 'encounterStatusHistories',
        entityId: historyId,
        expectedVersion: 0,
        transactionId: transaction.transactionId,
      }),
    );

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.STATUS_HISTORY_APPENDED,
      {
        encounterId,
        sequence: 1,
        status: 'CREATED',
      },
    );

    const auditSnapshot = encounterAuditSnapshot(created);

    await this.dependencies.audit.append({
      transactionId: transaction.transactionId,
      deduplicationKey: clinicalEmrDeduplicationKey(
        transaction.transactionId,
        CLINICAL_EMR_AUDIT_ACTIONS.ENCOUNTER_CREATED,
        encounterId,
      ),
      action: CLINICAL_EMR_AUDIT_ACTIONS.ENCOUNTER_CREATED,
      entityType: 'Encounter',
      entityId: encounterId,
      ...buildClinicalEmrAuditActorFields(command.actor),
      occurredAt,
      after: auditSnapshot,
      metadata: {
        careContext: created.careContext,
        canonicalRedirected: created.canonicalRedirected,
      },
    });

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.AUDIT_APPENDED,
      { encounterId },
    );

    const eventPayload = safeEncounterEventPayload(created);

    await this.dependencies.outbox.enqueue({
      transactionId: transaction.transactionId,
      deduplicationKey: clinicalEmrDeduplicationKey(
        transaction.transactionId,
        CLINICAL_EMR_OUTBOX_EVENTS.ENCOUNTER_CREATED,
        encounterId,
      ),
      eventType: CLINICAL_EMR_OUTBOX_EVENTS.ENCOUNTER_CREATED,
      aggregateType: 'Encounter',
      aggregateId: encounterId,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      occurredAt,
      payload: eventPayload,
    });

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.OUTBOX_ENQUEUED,
      { encounterId },
    );

    await Promise.all([
      this.dependencies.realtime.publish({
        eventType: CLINICAL_EMR_REALTIME_EVENTS.ENCOUNTER_CHANGED,
        facilityId: command.actor.facilityId,
        patientId: created.patientId.toHexString(),
        encounterId,
        providerId: created.currentOwnerId.toHexString(),
        payload: eventPayload,
      }),
      this.dependencies.realtime.publish({
        eventType: CLINICAL_EMR_REALTIME_EVENTS.PROVIDER_WORKLIST_CHANGED,
        facilityId: command.actor.facilityId,
        encounterId,
        providerId: created.currentOwnerId.toHexString(),
        payload: eventPayload,
      }),
      this.dependencies.realtime.publish({
        eventType: CLINICAL_EMR_REALTIME_EVENTS.PATIENT_TIMELINE_CHANGED,
        facilityId: command.actor.facilityId,
        patientId: created.patientId.toHexString(),
        encounterId,
        payload: eventPayload,
      }),
    ]);

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.REALTIME_PUBLISHED,
      { encounterId },
    );

    return toEncounterMutationResult(created);
  }
}