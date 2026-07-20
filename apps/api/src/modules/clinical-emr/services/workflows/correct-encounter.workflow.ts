import {
  ClinicalCorrectionConflictError,
  ClinicalEmrMinimumNecessaryAccessError,
  ClinicalEncounterContextMismatchError,
  EncounterConcurrencyError,
  EncounterNotFoundError,
} from '../../clinical-emr.errors.js';

import {
  toEncounterMutationResult,
  type EncounterMutationResult,
} from '../../clinical-emr.mapper.js';

import {
  deleteCreatedClinicalRecordCompensation,
  encounterRestoreSnapshot,
  protectedClinicalEmrRestorePayload,
  restoreClinicalRecordCompensation,
} from '../../clinical-emr.mutation-snapshots.js';

import {
  buildClinicalEmrAuditActorFields,
  type ClinicalEmrMutationDependencies,
  type ClinicalEmrTransactionContext,
} from '../../clinical-emr.ports.js';

import {
  encounterAuditSnapshot,
} from '../../clinical-emr.projections.js';

import {
  CLINICAL_EMR_AUDIT_ACTIONS,
  CLINICAL_EMR_OUTBOX_EVENTS,
  CLINICAL_EMR_REALTIME_EVENTS,
  CLINICAL_EMR_TRANSACTION_STATES,
  CLINICAL_EMR_TRANSACTION_TYPES,
} from '../../clinical-emr.transaction.constants.js';

import type {
  ClinicalEmrActorContext,
  CorrectEncounterInput,
  EncounterRecord,
} from '../../clinical-emr.types.js';

import {
  clinicalEmrDeduplicationKey,
  encounterCreateLockKeys,
  encounterMutationLockKeys,
  newClinicalEmrObjectIdString,
  safeEncounterEventPayload,
} from '../../clinical-emr.workflow-helpers.js';

import {
  normalizeClinicalText,
  normalizeOptionalClinicalText,
  parseClinicalDateTime,
} from '../../clinical-emr.normalization.js';

import type {
  EncounterStatusHistoryRepository,
} from '../../repositories/encounter-status-history.repository.js';

import type {
  EncounterRepository,
} from '../../repositories/encounter.repository.js';

import type {
  ClinicalEmrContextService,
  ResolvedClinicalOpdContext,
} from '../clinical-emr-context.service.js';

import type {
  ClinicalEmrNumberService,
} from '../clinical-emr-number.service.js';

import type {
  ClinicalEmrPatientResolutionService,
} from '../clinical-emr-patient-resolution.service.js';

export interface CorrectEncounterCommand {
  encounterId: string;
  input: CorrectEncounterInput;
  actor: ClinicalEmrActorContext;
  idempotencyKey: string;
}

interface ReplacementResolution {
  context: ResolvedClinicalOpdContext;
  canonicalPatientId: string;
  requestedPatientId: string;
  redirected: boolean;
}

export class CorrectEncounterWorkflow {
  public constructor(
    private readonly encounters: EncounterRepository,
    private readonly history: EncounterStatusHistoryRepository,
    private readonly patientResolution: ClinicalEmrPatientResolutionService,
    private readonly contexts: ClinicalEmrContextService,
    private readonly numbers: ClinicalEmrNumberService,
    private readonly dependencies: ClinicalEmrMutationDependencies,
  ) {}

  public async execute(
    command: CorrectEncounterCommand,
  ): Promise<EncounterMutationResult> {
    const original = await this.requireEncounter(command);

    if (
      original.status === 'CANCELLED' ||
      original.status === 'CORRECTED'
    ) {
      throw new ClinicalCorrectionConflictError();
    }

    const replacement = await this.resolveReplacement(command, original);
    await this.assertAccess(command.actor, original);

    return this.dependencies.transactionManager.execute({
      transactionType: CLINICAL_EMR_TRANSACTION_TYPES.CORRECT_ENCOUNTER,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: [
        ...encounterMutationLockKeys(command.actor.facilityId, original),
        ...encounterCreateLockKeys(
          command.actor.facilityId,
          replacement.canonicalPatientId,
          command.input.replacement,
        ),
      ],
      idempotencyPayload: {
        facilityId: command.actor.facilityId,
        encounterId: command.encounterId,
        input: command.input,
      },
      journalPayload: {
        operation: 'CORRECT_ENCOUNTER',
        encounterId: command.encounterId,
        encounterNumber: original.encounterNumber,
        currentStatus: original.status,
        careContext: original.careContext,
        replacementCareContext: command.input.replacement.careContext,
        replacementServiceDate: command.input.replacement.serviceDate,
      },
      execute: async (transaction) => this.executeTransaction(
        command,
        transaction,
      ),
    });
  }

  private async requireEncounter(
    command: CorrectEncounterCommand,
  ): Promise<EncounterRecord> {
    const record = await this.encounters.findById(
      command.actor.facilityId,
      command.encounterId,
      true,
    );

    if (record === null) {
      throw new EncounterNotFoundError();
    }

    return record;
  }

  private async assertAccess(
    actor: ClinicalEmrActorContext,
    encounter: EncounterRecord,
  ): Promise<void> {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      patientId: encounter.patientId.toHexString(),
      encounterId: encounter._id.toHexString(),
      assignedProviderIds: encounter.assignedProviderIds.map(
        (providerId) => providerId.toHexString(),
      ),
      confidentiality: encounter.confidentiality,
      intendedAction: 'CORRECT',
    });

    if (!decision.allowed) {
      throw new ClinicalEmrMinimumNecessaryAccessError();
    }
  }

  private async resolveReplacement(
    command: CorrectEncounterCommand,
    original: EncounterRecord,
  ): Promise<ReplacementResolution> {
    const replacement = command.input.replacement;

    if (
      replacement.careContext !== 'OPD_VISIT' ||
      replacement.encounterType !== 'OPD' ||
      replacement.opdVisitId == null ||
      replacement.registrationId == null
    ) {
      throw new ClinicalEncounterContextMismatchError(
        'Batch 4 encounter correction requires an OPD replacement context',
      );
    }

    const patient = await this.patientResolution.resolve(
      command.actor.facilityId,
      replacement.patientId,
    );

    if (patient.canonicalPatientId !== original.patientId.toHexString()) {
      throw new ClinicalEncounterContextMismatchError(
        'An encounter correction cannot move clinical history to another patient',
      );
    }

    const context = await this.contexts.resolveOpdContext(
      command.actor.facilityId,
      replacement.opdVisitId,
    );

    if (
      context.linkage.patientId !== patient.canonicalPatientId ||
      context.registration.id !== replacement.registrationId ||
      context.visit.id !== replacement.opdVisitId ||
      context.linkage.queueTokenId !== (replacement.queueTokenId ?? null) ||
      context.department.id !== replacement.departmentId ||
      context.clinic?.id !== (replacement.clinicId ?? null) ||
      context.servicePoint?.id !== (replacement.servicePointId ?? null) ||
      context.provider.id !== replacement.primaryProviderId ||
      context.visit.serviceDate !== replacement.serviceDate
    ) {
      throw new ClinicalEncounterContextMismatchError(
        'The replacement encounter does not match its resolved OPD context',
      );
    }

    return {
      context,
      canonicalPatientId: patient.canonicalPatientId,
      requestedPatientId: patient.requestedPatientId,
      redirected: patient.redirected,
    };
  }

  private async executeTransaction(
    command: CorrectEncounterCommand,
    transaction: ClinicalEmrTransactionContext,
  ): Promise<EncounterMutationResult> {
    const original = await this.requireEncounter(command);

    if (original.version !== command.input.expectedVersion) {
      throw new EncounterConcurrencyError();
    }

    if (
      original.status === 'CANCELLED' ||
      original.status === 'CORRECTED'
    ) {
      throw new ClinicalCorrectionConflictError();
    }

    await this.assertAccess(command.actor, original);
    const replacementResolution = await this.resolveReplacement(command, original);
    const replacementInput = command.input.replacement;
    const reason = normalizeClinicalText(command.input.reason, 'reason');
    const occurredAt = this.dependencies.clock.now();
    const replacementEncounterId = newClinicalEmrObjectIdString();

    const originalRestore = protectedClinicalEmrRestorePayload({
      collection: 'encounters',
      entityId: command.encounterId,
      expectedPostVersion: original.version + 1,
      snapshot: encounterRestoreSnapshot(original),
      transactionId: transaction.transactionId,
      snapshotCrypto: this.dependencies.snapshotCrypto,
    });

    const correctedOriginal = await this.encounters.markCorrectedWithVersion({
      facilityId: command.actor.facilityId,
      encounterId: command.encounterId,
      expectedVersion: original.version,
      replacementEncounterId,
      reason,
      occurredAt,
      actorUserId: command.actor.userId,
    });

    if (correctedOriginal === null) {
      throw new EncounterConcurrencyError();
    }

    await transaction.registerCompensation(
      restoreClinicalRecordCompensation(
        `restore-encounter:${command.encounterId}`,
        originalRestore,
      ),
    );

    const number = await this.numbers.allocateEncounterNumber({
      facilityId: command.actor.facilityId,
      serviceDate: replacementResolution.context.visit.serviceDate,
    });

    const assignedProviderIds = [
      ...new Set([
        replacementResolution.context.provider.id,
        replacementInput.currentOwnerId ?? replacementResolution.context.provider.id,
        ...(replacementInput.assignedProviderIds ?? []),
      ]),
    ];

    const replacement = await this.encounters.create({
      encounterId: replacementEncounterId,
      facilityId: command.actor.facilityId,
      encounterNumber: number.number,
      patientId: replacementResolution.canonicalPatientId,
      requestedPatientId: replacementResolution.requestedPatientId,
      canonicalRedirected: replacementResolution.redirected,
      registrationId: replacementResolution.context.registration.id,
      opdVisitId: replacementResolution.context.visit.id,
      queueTokenId: replacementResolution.context.queueToken?.id ?? null,
      emergencyCaseId: null,
      admissionId: null,
      referralId: null,
      encounterType: 'OPD',
      careContext: 'OPD_VISIT',
      serviceDate: replacementResolution.context.visit.serviceDate,
      departmentId: replacementResolution.context.department.id,
      clinicId: replacementResolution.context.clinic?.id ?? null,
      servicePointId: replacementResolution.context.servicePoint?.id ?? null,
      primaryProviderId: replacementResolution.context.provider.id,
      currentOwnerId:
        replacementInput.currentOwnerId ?? replacementResolution.context.provider.id,
      currentOwnerRole: replacementInput.currentOwnerRole ?? 'PRIMARY_PROVIDER',
      assignedProviderIds,
      confidentiality: replacementInput.confidentiality ?? original.confidentiality,
      restrictionReason: normalizeOptionalClinicalText(
        replacementInput.restrictionReason,
        'replacement.restrictionReason',
      ),
      startedAt: replacementInput.startedAt === undefined
        ? occurredAt
        : parseClinicalDateTime(
            replacementInput.startedAt,
            'replacement.startedAt',
          ),
      supersedesEncounterId: command.encounterId,
      correctionReason: reason,
      transactionId: transaction.transactionId,
      correlationId: command.actor.correlationId,
      actorUserId: command.actor.userId,
    });

    await transaction.registerCompensation(
      deleteCreatedClinicalRecordCompensation({
        key: `delete-replacement-encounter:${replacementEncounterId}`,
        collection: 'encounters',
        entityId: replacementEncounterId,
        expectedVersion: 0,
        transactionId: transaction.transactionId,
      }),
    );

    const originalSequence = await this.history.nextSequence(
      command.actor.facilityId,
      command.encounterId,
    );
    const originalHistoryId = newClinicalEmrObjectIdString();

    await this.history.create({
      historyId: originalHistoryId,
      facilityId: command.actor.facilityId,
      encounterId: command.encounterId,
      patientId: original.patientId.toHexString(),
      sequence: originalSequence,
      fromStatus: original.status,
      toStatus: 'CORRECTED',
      previousOwnerId: original.currentOwnerId.toHexString(),
      newOwnerId: correctedOriginal.currentOwnerId.toHexString(),
      previousOwnerRole: original.currentOwnerRole,
      newOwnerRole: correctedOriginal.currentOwnerRole,
      changeSource: 'PROVIDER',
      reason,
      occurredAt,
      changedBy: command.actor.userId,
      transactionId: transaction.transactionId,
      correlationId: command.actor.correlationId,
    });

    const replacementHistoryId = newClinicalEmrObjectIdString();

    await this.history.create({
      historyId: replacementHistoryId,
      facilityId: command.actor.facilityId,
      encounterId: replacementEncounterId,
      patientId: replacement.patientId.toHexString(),
      sequence: 1,
      fromStatus: null,
      toStatus: 'CREATED',
      previousOwnerId: null,
      newOwnerId: replacement.currentOwnerId.toHexString(),
      previousOwnerRole: null,
      newOwnerRole: replacement.currentOwnerRole,
      changeSource: 'PROVIDER',
      reason,
      occurredAt,
      changedBy: command.actor.userId,
      transactionId: transaction.transactionId,
      correlationId: command.actor.correlationId,
    });

    for (const [key, historyId] of [
      ['delete-original-correction-history', originalHistoryId],
      ['delete-replacement-creation-history', replacementHistoryId],
    ] as const) {
      await transaction.registerCompensation(
        deleteCreatedClinicalRecordCompensation({
          key: `${key}:${historyId}`,
          collection: 'encounterStatusHistories',
          entityId: historyId,
          expectedVersion: 0,
          transactionId: transaction.transactionId,
        }),
      );
    }

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.STATUS_HISTORY_APPENDED,
      {
        originalEncounterId: command.encounterId,
        replacementEncounterId,
      },
    );

    await this.dependencies.audit.append({
      transactionId: transaction.transactionId,
      deduplicationKey: clinicalEmrDeduplicationKey(
        transaction.transactionId,
        CLINICAL_EMR_AUDIT_ACTIONS.ENCOUNTER_CORRECTED,
        command.encounterId,
      ),
      action: CLINICAL_EMR_AUDIT_ACTIONS.ENCOUNTER_CORRECTED,
      entityType: 'Encounter',
      entityId: command.encounterId,
      ...buildClinicalEmrAuditActorFields(command.actor),
      occurredAt,
      reason,
      before: encounterAuditSnapshot(original),
      after: encounterAuditSnapshot(correctedOriginal),
      metadata: {
        replacementEncounterId,
        replacementEncounterNumber: replacement.encounterNumber,
      },
    });

    const originalPayload = safeEncounterEventPayload(correctedOriginal);
    const replacementPayload = safeEncounterEventPayload(replacement);

    await Promise.all([
      this.dependencies.outbox.enqueue({
        transactionId: transaction.transactionId,
        deduplicationKey: clinicalEmrDeduplicationKey(
          transaction.transactionId,
          CLINICAL_EMR_OUTBOX_EVENTS.ENCOUNTER_CORRECTED,
          command.encounterId,
        ),
        eventType: CLINICAL_EMR_OUTBOX_EVENTS.ENCOUNTER_CORRECTED,
        aggregateType: 'Encounter',
        aggregateId: command.encounterId,
        actorUserId: command.actor.userId,
        facilityId: command.actor.facilityId,
        correlationId: command.actor.correlationId,
        occurredAt,
        payload: {
          ...originalPayload,
          replacementEncounterId,
        },
      }),
      this.dependencies.outbox.enqueue({
        transactionId: transaction.transactionId,
        deduplicationKey: clinicalEmrDeduplicationKey(
          transaction.transactionId,
          CLINICAL_EMR_OUTBOX_EVENTS.ENCOUNTER_CREATED,
          replacementEncounterId,
        ),
        eventType: CLINICAL_EMR_OUTBOX_EVENTS.ENCOUNTER_CREATED,
        aggregateType: 'Encounter',
        aggregateId: replacementEncounterId,
        actorUserId: command.actor.userId,
        facilityId: command.actor.facilityId,
        correlationId: command.actor.correlationId,
        occurredAt,
        payload: replacementPayload,
      }),
    ]);

    await Promise.all([
      this.dependencies.realtime.publish({
        eventType: CLINICAL_EMR_REALTIME_EVENTS.ENCOUNTER_CHANGED,
        facilityId: command.actor.facilityId,
        patientId: original.patientId.toHexString(),
        encounterId: command.encounterId,
        providerId: correctedOriginal.currentOwnerId.toHexString(),
        payload: originalPayload,
      }),
      this.dependencies.realtime.publish({
        eventType: CLINICAL_EMR_REALTIME_EVENTS.ENCOUNTER_CHANGED,
        facilityId: command.actor.facilityId,
        patientId: replacement.patientId.toHexString(),
        encounterId: replacementEncounterId,
        providerId: replacement.currentOwnerId.toHexString(),
        payload: replacementPayload,
      }),
      this.dependencies.realtime.publish({
        eventType: CLINICAL_EMR_REALTIME_EVENTS.PATIENT_TIMELINE_CHANGED,
        facilityId: command.actor.facilityId,
        patientId: replacement.patientId.toHexString(),
        encounterId: replacementEncounterId,
        payload: {
          replacementEncounterId,
          correctedEncounterId: command.encounterId,
        },
      }),
    ]);

    return toEncounterMutationResult(replacement);
  }
}