import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  ChangeRadiologyCatalogStatusInput,
  CreateRadiologyModalityInput,
  CreateRadiologyProcedureInput,
  RadiologyActorContext,
  UpdateRadiologyModalityInput,
  UpdateRadiologyProcedureInput,
} from '../radiology.types.js';

import type {
  RadiologyModalityRecord,
  RadiologyProcedureRecord,
} from '../radiology.persistence.types.js';

import {
  RADIOLOGY_TRANSACTION_TYPES,
} from '../radiology.constants.js';

import {
  RADIOLOGY_AUDIT_ACTIONS,
  RADIOLOGY_OUTBOX_EVENTS,
  RADIOLOGY_REALTIME_EVENTS,
  RADIOLOGY_TRANSACTION_STATES,
} from '../radiology.transaction.constants.js';

import {
  deleteCreatedRadiologyRecordCompensation,
  protectRadiologyRestorePayload,
  radiologyModalityRestoreSnapshot,
  radiologyProcedureRestoreSnapshot,
  restoreRadiologyRecordCompensation,
} from '../radiology.mutation-snapshots.js';

import {
  radiologyModalityCreateLockKeys,
  radiologyModalityMutationLockKeys,
  radiologyProcedureCreateLockKeys,
  radiologyProcedureMutationLockKeys,
  safeRadiologyCatalogJournalPayload,
  safeRadiologyModalityAuditSnapshot,
  safeRadiologyModalityEventPayload,
  safeRadiologyProcedureAuditSnapshot,
  safeRadiologyProcedureEventPayload,
} from '../radiology.workflow-helpers.js';

import {
  RadiologyInactiveModalityError,
  RadiologyModalityConcurrencyError,
  RadiologyProcedureConcurrencyError,
  RadiologyProcedureRequestConflictError,
} from '../radiology.errors.js';

import {
  changeRadiologyCatalogStatusBodySchema,
  createRadiologyModalityBodySchema,
  createRadiologyProcedureBodySchema,
  updateRadiologyModalityBodySchema,
  updateRadiologyProcedureBodySchema,
} from '../radiology.validation.js';

import {
  RadiologyCommandService,
} from '../services/radiology-command.service.js';

interface CatalogCommand<T> {
  actor: RadiologyActorContext;
  input: T;
  idempotencyKey: string;
}

interface CatalogEntityCommand<T> extends CatalogCommand<T> {
  entityId: string;
}

function effectiveDate(
  value: string | undefined,
  fallback: Date,
): Date {
  return value === undefined ? fallback : new Date(value);
}

function effectiveThrough(
  value: string | null | undefined,
  fallback: Date | null,
): Date | null {
  if (value === undefined) {
    return fallback;
  }

  return value === null ? null : new Date(value);
}

async function publishCatalogRealtime(
  support: RadiologyCommandService,
  actor: RadiologyActorContext,
  payload: Record<string, unknown>,
): Promise<void> {
  await support.dependencies.realtime.publish({
    eventType: RADIOLOGY_REALTIME_EVENTS.CATALOG_CHANGED,
    facilityId: actor.facilityId,
    payload,
  });
}

function assertModalityAvailableForProcedure(
  modality: RadiologyModalityRecord,
  departmentIds: readonly string[],
  requiresContrast: boolean,
  occurredAt: Date,
): void {
  const availableDepartments = new Set(
    modality.availableDepartmentIds.map((id) => id.toHexString()),
  );
  const effective =
    modality.effectiveFrom <= occurredAt &&
    (modality.effectiveThrough === null ||
      modality.effectiveThrough >= occurredAt);

  if (
    modality.status !== 'ACTIVE' ||
    !modality.orderable ||
    !effective ||
    departmentIds.some((departmentId) =>
      !availableDepartments.has(departmentId),
    )
  ) {
    throw new RadiologyInactiveModalityError();
  }

  if (requiresContrast && !modality.supportsContrast) {
    throw new RadiologyProcedureRequestConflictError(
      'A contrast-capable procedure cannot use a modality that does not support contrast',
    );
  }
}

export class CreateRadiologyModalityWorkflow {
  public constructor(
    private readonly support: RadiologyCommandService,
  ) {}

  public async execute(
    command: CatalogCommand<CreateRadiologyModalityInput>,
  ): Promise<RadiologyModalityRecord> {
    const input = createRadiologyModalityBodySchema.parse(command.input);
    await this.support.assertAccess(command.actor, 'CATALOG_MANAGE');

    const modalityCode = this.support.normalizedCode(input.modalityCode);
    const normalizedName = this.support.normalizedText(input.name);

    return this.support.dependencies.transactionManager.execute({
      transactionType: RADIOLOGY_TRANSACTION_TYPES.CREATE_MODALITY,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: radiologyModalityCreateLockKeys(
        command.actor.facilityId,
        modalityCode,
        normalizedName,
      ),
      idempotencyPayload: {
        modalityCode,
        normalizedName,
      },
      journalPayload: safeRadiologyCatalogJournalPayload(
        'CREATE_MODALITY',
        { modalityCode, status: 'ACTIVE' },
      ),
      execute: async (transaction) => {
        const occurredAt = this.support.dependencies.clock.now();
        const actorId = toObjectId(command.actor.userId, 'actorUserId');
        const created = await this.support.catalog.createModality({
          facilityId: toObjectId(command.actor.facilityId, 'facilityId'),
          modalityCode,
          name: this.support.displayText(input.name),
          normalizedName,
          modalityType: input.modalityType,
          dicomModalityCode: this.support.normalizedCode(
            input.dicomModalityCode,
          ),
          description: this.support.nullableText(input.description),
          availableDepartmentIds: this.support.objectIds(
            input.availableDepartmentIds,
            'availableDepartmentIds',
          ),
          supportsContrast: input.supportsContrast,
          supportsPacsIntegration: input.supportsPacsIntegration,
          pacsRoutingCode:
            input.pacsRoutingCode == null
              ? null
              : this.support.normalizedCode(input.pacsRoutingCode),
          orderable: input.orderable,
          effectiveFrom: effectiveDate(input.effectiveFrom, occurredAt),
          effectiveThrough: effectiveThrough(
            input.effectiveThrough,
            null,
          ),
          status: 'ACTIVE',
          deactivatedAt: null,
          deactivatedBy: null,
          deactivationReason: null,
          transactionId: transaction.transactionId,
          correlationId: command.actor.correlationId,
          schemaVersion: 1,
          version: 0,
          createdBy: actorId,
          updatedBy: actorId,
        });

        await transaction.registerCompensation(
          deleteCreatedRadiologyRecordCompensation(
            `delete-modality:${created._id.toHexString()}`,
            {
              facilityId: command.actor.facilityId,
              collection: 'radiologyModalities',
              entityId: created._id.toHexString(),
              transactionId: transaction.transactionId,
            },
          ),
        );

        await transaction.checkpoint(
          RADIOLOGY_TRANSACTION_STATES.CURRENT_PROJECTION_CREATED,
          { modalityId: created._id.toHexString() },
        );

        await this.support.dependencies.audit.append({
          transactionId: transaction.transactionId,
          deduplicationKey: this.support.deduplicationKey(
            transaction.transactionId,
            RADIOLOGY_AUDIT_ACTIONS.MODALITY_CREATED,
            created._id.toHexString(),
          ),
          action: RADIOLOGY_AUDIT_ACTIONS.MODALITY_CREATED,
          entityType: 'RadiologyModality',
          entityId: created._id.toHexString(),
          ...this.support.auditActorFields(command.actor),
          occurredAt,
          before: null,
          after: safeRadiologyModalityAuditSnapshot(created),
        });

        await this.support.dependencies.outbox.enqueue({
          transactionId: transaction.transactionId,
          deduplicationKey: this.support.deduplicationKey(
            transaction.transactionId,
            RADIOLOGY_OUTBOX_EVENTS.MODALITY_CREATED,
            created._id.toHexString(),
          ),
          eventType: RADIOLOGY_OUTBOX_EVENTS.MODALITY_CREATED,
          aggregateType: 'RadiologyModality',
          aggregateId: created._id.toHexString(),
          actorUserId: command.actor.userId,
          facilityId: command.actor.facilityId,
          correlationId: command.actor.correlationId,
          occurredAt,
          payload: safeRadiologyModalityEventPayload(created),
        });

        await publishCatalogRealtime(
          this.support,
          command.actor,
          safeRadiologyModalityEventPayload(created),
        );

        return created;
      },
    });
  }
}

export class UpdateRadiologyModalityWorkflow {
  public constructor(
    private readonly support: RadiologyCommandService,
  ) {}

  public async execute(
    command: CatalogEntityCommand<UpdateRadiologyModalityInput>,
  ): Promise<RadiologyModalityRecord> {
    const input = updateRadiologyModalityBodySchema.parse(command.input);
    const current = await this.support.requireModality(
      command.actor,
      command.entityId,
    );
    await this.support.assertAccess(command.actor, 'CATALOG_MANAGE');
    this.support.assertExpectedVersion(
      current,
      input.expectedVersion,
      'MODALITY',
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType: RADIOLOGY_TRANSACTION_TYPES.UPDATE_MODALITY,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: radiologyModalityMutationLockKeys(
        command.actor.facilityId,
        command.entityId,
      ),
      idempotencyPayload: {
        modalityId: command.entityId,
        expectedVersion: input.expectedVersion,
        updateHash: this.support.dependencies.snapshotCrypto.hash(
          input,
          `radiology:modality-update:${command.actor.facilityId}:${command.entityId}`,
        ),
      },
      journalPayload: safeRadiologyCatalogJournalPayload(
        'UPDATE_MODALITY',
        { modalityId: command.entityId, status: current.status },
      ),
      execute: async (transaction) => {
        const occurredAt = this.support.dependencies.clock.now();
        const actorId = toObjectId(command.actor.userId, 'actorUserId');
        const restorePayload = protectRadiologyRestorePayload({
          facilityId: command.actor.facilityId,
          collection: 'radiologyModalities',
          entityId: command.entityId,
          expectedPostVersion: current.version + 1,
          transactionId: transaction.transactionId,
          snapshot: radiologyModalityRestoreSnapshot(current),
          snapshotCrypto: this.support.dependencies.snapshotCrypto,
        });
        const updated = await this.support.catalog.updateModality(
          command.actor.facilityId,
          command.entityId,
          input.expectedVersion,
          {
            ...(input.name === undefined
              ? {}
              : {
                  name: this.support.displayText(input.name),
                  normalizedName: this.support.normalizedText(input.name),
                }),
            ...(input.modalityType === undefined
              ? {}
              : { modalityType: input.modalityType }),
            ...(input.dicomModalityCode === undefined
              ? {}
              : {
                  dicomModalityCode: this.support.normalizedCode(
                    input.dicomModalityCode,
                  ),
                }),
            ...(input.description === undefined
              ? {}
              : { description: this.support.nullableText(input.description) }),
            ...(input.availableDepartmentIds === undefined
              ? {}
              : {
                  availableDepartmentIds: this.support.objectIds(
                    input.availableDepartmentIds,
                    'availableDepartmentIds',
                  ),
                }),
            ...(input.supportsContrast === undefined
              ? {}
              : { supportsContrast: input.supportsContrast }),
            ...(input.supportsPacsIntegration === undefined
              ? {}
              : {
                  supportsPacsIntegration: input.supportsPacsIntegration,
                }),
            ...(input.pacsRoutingCode === undefined
              ? {}
              : {
                  pacsRoutingCode:
                    input.pacsRoutingCode === null
                      ? null
                      : this.support.normalizedCode(input.pacsRoutingCode),
                }),
            ...(input.orderable === undefined
              ? {}
              : { orderable: input.orderable }),
            ...(input.effectiveFrom === undefined
              ? {}
              : { effectiveFrom: new Date(input.effectiveFrom) }),
            ...(input.effectiveThrough === undefined
              ? {}
              : {
                  effectiveThrough:
                    input.effectiveThrough === null
                      ? null
                      : new Date(input.effectiveThrough),
                }),
            updatedBy: actorId,
          },
        );

        if (updated === null) {
          throw new RadiologyModalityConcurrencyError();
        }

        await transaction.registerCompensation(
          restoreRadiologyRecordCompensation(
            `restore-modality:${command.entityId}`,
            restorePayload,
          ),
        );

        await transaction.checkpoint(
          RADIOLOGY_TRANSACTION_STATES.CURRENT_PROJECTION_UPDATED,
          { modalityId: command.entityId, version: updated.version },
        );

        await this.support.dependencies.audit.append({
          transactionId: transaction.transactionId,
          deduplicationKey: this.support.deduplicationKey(
            transaction.transactionId,
            RADIOLOGY_AUDIT_ACTIONS.MODALITY_UPDATED,
            command.entityId,
          ),
          action: RADIOLOGY_AUDIT_ACTIONS.MODALITY_UPDATED,
          entityType: 'RadiologyModality',
          entityId: command.entityId,
          ...this.support.auditActorFields(command.actor),
          occurredAt,
          before: safeRadiologyModalityAuditSnapshot(current),
          after: safeRadiologyModalityAuditSnapshot(updated),
        });

        await this.support.dependencies.outbox.enqueue({
          transactionId: transaction.transactionId,
          deduplicationKey: this.support.deduplicationKey(
            transaction.transactionId,
            RADIOLOGY_OUTBOX_EVENTS.MODALITY_UPDATED,
            command.entityId,
          ),
          eventType: RADIOLOGY_OUTBOX_EVENTS.MODALITY_UPDATED,
          aggregateType: 'RadiologyModality',
          aggregateId: command.entityId,
          actorUserId: command.actor.userId,
          facilityId: command.actor.facilityId,
          correlationId: command.actor.correlationId,
          occurredAt,
          payload: safeRadiologyModalityEventPayload(updated),
        });

        await publishCatalogRealtime(
          this.support,
          command.actor,
          safeRadiologyModalityEventPayload(updated),
        );

        return updated;
      },
    });
  }
}

export class ChangeRadiologyModalityStatusWorkflow {
  public constructor(
    private readonly support: RadiologyCommandService,
  ) {}

  public async execute(
    command: CatalogEntityCommand<ChangeRadiologyCatalogStatusInput>,
  ): Promise<RadiologyModalityRecord> {
    const input = changeRadiologyCatalogStatusBodySchema.parse(command.input);
    const current = await this.support.requireModality(
      command.actor,
      command.entityId,
    );
    await this.support.assertAccess(command.actor, 'CATALOG_MANAGE');
    this.support.assertExpectedVersion(
      current,
      input.expectedVersion,
      'MODALITY',
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType: RADIOLOGY_TRANSACTION_TYPES.CHANGE_MODALITY_STATUS,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: radiologyModalityMutationLockKeys(
        command.actor.facilityId,
        command.entityId,
      ),
      idempotencyPayload: {
        modalityId: command.entityId,
        expectedVersion: input.expectedVersion,
        status: input.status,
      },
      journalPayload: safeRadiologyCatalogJournalPayload(
        'CHANGE_MODALITY_STATUS',
        { modalityId: command.entityId, status: input.status },
      ),
      execute: async (transaction) => {
        const occurredAt = this.support.dependencies.clock.now();
        const restorePayload = protectRadiologyRestorePayload({
          facilityId: command.actor.facilityId,
          collection: 'radiologyModalities',
          entityId: command.entityId,
          expectedPostVersion: current.version + 1,
          transactionId: transaction.transactionId,
          snapshot: radiologyModalityRestoreSnapshot(current),
          snapshotCrypto: this.support.dependencies.snapshotCrypto,
        });
        const updated = await this.support.catalog.changeModalityStatus(
          command.actor.facilityId,
          command.entityId,
          input.expectedVersion,
          input.status,
          command.actor.userId,
          input.reason,
          occurredAt,
        );

        if (updated === null) {
          throw new RadiologyModalityConcurrencyError();
        }

        await transaction.registerCompensation(
          restoreRadiologyRecordCompensation(
            `restore-modality-status:${command.entityId}`,
            restorePayload,
          ),
        );

        await this.support.dependencies.audit.append({
          transactionId: transaction.transactionId,
          deduplicationKey: this.support.deduplicationKey(
            transaction.transactionId,
            RADIOLOGY_AUDIT_ACTIONS.MODALITY_STATUS_CHANGED,
            command.entityId,
          ),
          action: RADIOLOGY_AUDIT_ACTIONS.MODALITY_STATUS_CHANGED,
          entityType: 'RadiologyModality',
          entityId: command.entityId,
          ...this.support.auditActorFields(command.actor),
          occurredAt,
          reason: input.reason,
          before: safeRadiologyModalityAuditSnapshot(current),
          after: safeRadiologyModalityAuditSnapshot(updated),
        });

        await this.support.dependencies.outbox.enqueue({
          transactionId: transaction.transactionId,
          deduplicationKey: this.support.deduplicationKey(
            transaction.transactionId,
            RADIOLOGY_OUTBOX_EVENTS.MODALITY_STATUS_CHANGED,
            command.entityId,
          ),
          eventType: RADIOLOGY_OUTBOX_EVENTS.MODALITY_STATUS_CHANGED,
          aggregateType: 'RadiologyModality',
          aggregateId: command.entityId,
          actorUserId: command.actor.userId,
          facilityId: command.actor.facilityId,
          correlationId: command.actor.correlationId,
          occurredAt,
          payload: safeRadiologyModalityEventPayload(updated),
        });

        await publishCatalogRealtime(
          this.support,
          command.actor,
          safeRadiologyModalityEventPayload(updated),
        );

        return updated;
      },
    });
  }
}

export class CreateRadiologyProcedureWorkflow {
  public constructor(
    private readonly support: RadiologyCommandService,
  ) {}

  public async execute(
    command: CatalogCommand<CreateRadiologyProcedureInput>,
  ): Promise<RadiologyProcedureRecord> {
    const input = createRadiologyProcedureBodySchema.parse(command.input);
    await this.support.assertAccess(command.actor, 'CATALOG_MANAGE');

    const procedureCode = this.support.normalizedCode(input.procedureCode);
    const normalizedName = this.support.normalizedText(input.name);

    return this.support.dependencies.transactionManager.execute({
      transactionType: RADIOLOGY_TRANSACTION_TYPES.CREATE_PROCEDURE,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: radiologyProcedureCreateLockKeys(
        command.actor.facilityId,
        procedureCode,
        normalizedName,
      ),
      idempotencyPayload: {
        procedureCode,
        normalizedName,
        modalityId: input.modalityId,
      },
      journalPayload: safeRadiologyCatalogJournalPayload(
        'CREATE_PROCEDURE',
        { procedureCode, status: 'ACTIVE' },
      ),
      execute: async (transaction) => {
        const occurredAt = this.support.dependencies.clock.now();
        const modality = await this.support.requireModality(
          command.actor,
          input.modalityId,
        );
        assertModalityAvailableForProcedure(
          modality,
          input.availableDepartmentIds,
          input.contrastRequirement !== 'NONE',
          occurredAt,
        );
        const actorId = toObjectId(command.actor.userId, 'actorUserId');
        const aliases = this.support.normalizedAliases(input.aliases);
        const created = await this.support.catalog.createProcedure({
          facilityId: toObjectId(command.actor.facilityId, 'facilityId'),
          procedureCode,
          name: this.support.displayText(input.name),
          normalizedName,
          aliases: aliases.aliases,
          normalizedAliases: aliases.normalizedAliases,
          description: this.support.nullableText(input.description),
          modalityId: modality._id,
          modalityCodeSnapshot: modality.modalityCode,
          modalityNameSnapshot: modality.name,
          modalityTypeSnapshot: modality.modalityType,
          dicomModalityCodeSnapshot: modality.dicomModalityCode,
          bodyRegions: this.support.bodyRegions(input.bodyRegions),
          lateralityRequirement: input.lateralityRequirement,
          permittedLateralities: [...input.permittedLateralities],
          contrastRequirement: input.contrastRequirement,
          permittedContrastRoutes: [...input.permittedContrastRoutes],
          preparationInstructions: uniqueStrings(
            input.preparationInstructions,
          ),
          contraindications: uniqueStrings(input.contraindications),
          safetyScreeningRequirements: [
            ...new Set(input.safetyScreeningRequirements),
          ],
          expectedDurationMinutes: input.expectedDurationMinutes,
          routineTurnaroundMinutes: input.routineTurnaroundMinutes,
          urgentTurnaroundMinutes: input.urgentTurnaroundMinutes ?? null,
          statTurnaroundMinutes: input.statTurnaroundMinutes ?? null,
          availableDepartmentIds: this.support.objectIds(
            input.availableDepartmentIds,
            'availableDepartmentIds',
          ),
          schedulingRequired: input.schedulingRequired,
          requiresTechnician: input.requiresTechnician,
          requiresRadiologist: input.requiresRadiologist,
          orderable: input.orderable,
          chargeCatalogItemId: this.support.nullableObjectId(
            input.chargeCatalogItemId,
            'chargeCatalogItemId',
          ),
          effectiveFrom: effectiveDate(input.effectiveFrom, occurredAt),
          effectiveThrough: effectiveThrough(
            input.effectiveThrough,
            null,
          ),
          status: 'ACTIVE',
          deactivatedAt: null,
          deactivatedBy: null,
          deactivationReason: null,
          transactionId: transaction.transactionId,
          correlationId: command.actor.correlationId,
          schemaVersion: 1,
          version: 0,
          createdBy: actorId,
          updatedBy: actorId,
        });

        await transaction.registerCompensation(
          deleteCreatedRadiologyRecordCompensation(
            `delete-procedure:${created._id.toHexString()}`,
            {
              facilityId: command.actor.facilityId,
              collection: 'radiologyProcedures',
              entityId: created._id.toHexString(),
              transactionId: transaction.transactionId,
            },
          ),
        );

        await transaction.checkpoint(
          RADIOLOGY_TRANSACTION_STATES.CURRENT_PROJECTION_CREATED,
          { procedureId: created._id.toHexString() },
        );

        await this.support.dependencies.audit.append({
          transactionId: transaction.transactionId,
          deduplicationKey: this.support.deduplicationKey(
            transaction.transactionId,
            RADIOLOGY_AUDIT_ACTIONS.PROCEDURE_CREATED,
            created._id.toHexString(),
          ),
          action: RADIOLOGY_AUDIT_ACTIONS.PROCEDURE_CREATED,
          entityType: 'RadiologyProcedure',
          entityId: created._id.toHexString(),
          ...this.support.auditActorFields(command.actor),
          occurredAt,
          before: null,
          after: safeRadiologyProcedureAuditSnapshot(created),
        });

        await this.support.dependencies.outbox.enqueue({
          transactionId: transaction.transactionId,
          deduplicationKey: this.support.deduplicationKey(
            transaction.transactionId,
            RADIOLOGY_OUTBOX_EVENTS.PROCEDURE_CREATED,
            created._id.toHexString(),
          ),
          eventType: RADIOLOGY_OUTBOX_EVENTS.PROCEDURE_CREATED,
          aggregateType: 'RadiologyProcedure',
          aggregateId: created._id.toHexString(),
          actorUserId: command.actor.userId,
          facilityId: command.actor.facilityId,
          correlationId: command.actor.correlationId,
          occurredAt,
          payload: safeRadiologyProcedureEventPayload(created),
        });

        await publishCatalogRealtime(
          this.support,
          command.actor,
          safeRadiologyProcedureEventPayload(created),
        );

        return created;
      },
    });
  }
}

export class UpdateRadiologyProcedureWorkflow {
  public constructor(
    private readonly support: RadiologyCommandService,
  ) {}

  public async execute(
    command: CatalogEntityCommand<UpdateRadiologyProcedureInput>,
  ): Promise<RadiologyProcedureRecord> {
    const input = updateRadiologyProcedureBodySchema.parse(command.input);
    const current = await this.support.requireProcedure(
      command.actor,
      command.entityId,
    );
    await this.support.assertAccess(command.actor, 'CATALOG_MANAGE');
    this.support.assertExpectedVersion(
      current,
      input.expectedVersion,
      'PROCEDURE',
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType: RADIOLOGY_TRANSACTION_TYPES.UPDATE_PROCEDURE,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: radiologyProcedureMutationLockKeys(
        command.actor.facilityId,
        command.entityId,
      ),
      idempotencyPayload: {
        procedureId: command.entityId,
        expectedVersion: input.expectedVersion,
        updateHash: this.support.dependencies.snapshotCrypto.hash(
          input,
          `radiology:procedure-update:${command.actor.facilityId}:${command.entityId}`,
        ),
      },
      journalPayload: safeRadiologyCatalogJournalPayload(
        'UPDATE_PROCEDURE',
        { procedureId: command.entityId, status: current.status },
      ),
      execute: async (transaction) => {
        const occurredAt = this.support.dependencies.clock.now();
        const modality = await this.support.requireModality(
          command.actor,
          input.modalityId ?? current.modalityId.toHexString(),
        );
        const availableDepartmentIds =
          input.availableDepartmentIds ??
          current.availableDepartmentIds.map((id) => id.toHexString());
        const contrastRequirement =
          input.contrastRequirement ?? current.contrastRequirement;
        assertModalityAvailableForProcedure(
          modality,
          availableDepartmentIds,
          contrastRequirement !== 'NONE',
          occurredAt,
        );
        const actorId = toObjectId(command.actor.userId, 'actorUserId');
        const aliases = this.support.normalizedAliases(
          input.aliases ?? current.aliases,
        );
        const restorePayload = protectRadiologyRestorePayload({
          facilityId: command.actor.facilityId,
          collection: 'radiologyProcedures',
          entityId: command.entityId,
          expectedPostVersion: current.version + 1,
          transactionId: transaction.transactionId,
          snapshot: radiologyProcedureRestoreSnapshot(current),
          snapshotCrypto: this.support.dependencies.snapshotCrypto,
        });
        const updated = await this.support.catalog.updateProcedure(
          command.actor.facilityId,
          command.entityId,
          input.expectedVersion,
          {
            name: this.support.displayText(input.name ?? current.name),
            normalizedName: this.support.normalizedText(
              input.name ?? current.name,
            ),
            aliases: aliases.aliases,
            normalizedAliases: aliases.normalizedAliases,
            description:
              input.description === undefined
                ? current.description
                : this.support.nullableText(input.description),
            modalityId: modality._id,
            modalityCodeSnapshot: modality.modalityCode,
            modalityNameSnapshot: modality.name,
            modalityTypeSnapshot: modality.modalityType,
            dicomModalityCodeSnapshot: modality.dicomModalityCode,
            bodyRegions: this.support.bodyRegions(
              input.bodyRegions ?? current.bodyRegions,
            ),
            lateralityRequirement:
              input.lateralityRequirement ?? current.lateralityRequirement,
            permittedLateralities: [
              ...(input.permittedLateralities ??
                current.permittedLateralities),
            ],
            contrastRequirement,
            permittedContrastRoutes: [
              ...(input.permittedContrastRoutes ??
                current.permittedContrastRoutes),
            ],
            preparationInstructions: uniqueStrings(
              input.preparationInstructions ??
                current.preparationInstructions,
            ),
            contraindications: uniqueStrings(
              input.contraindications ?? current.contraindications,
            ),
            safetyScreeningRequirements: [
              ...new Set(
                input.safetyScreeningRequirements ??
                  current.safetyScreeningRequirements,
              ),
            ],
            expectedDurationMinutes:
              input.expectedDurationMinutes ??
              current.expectedDurationMinutes,
            routineTurnaroundMinutes:
              input.routineTurnaroundMinutes ??
              current.routineTurnaroundMinutes,
            urgentTurnaroundMinutes:
              input.urgentTurnaroundMinutes === undefined
                ? current.urgentTurnaroundMinutes
                : input.urgentTurnaroundMinutes,
            statTurnaroundMinutes:
              input.statTurnaroundMinutes === undefined
                ? current.statTurnaroundMinutes
                : input.statTurnaroundMinutes,
            availableDepartmentIds: this.support.objectIds(
              availableDepartmentIds,
              'availableDepartmentIds',
            ),
            schedulingRequired:
              input.schedulingRequired ?? current.schedulingRequired,
            requiresTechnician:
              input.requiresTechnician ?? current.requiresTechnician,
            requiresRadiologist:
              input.requiresRadiologist ?? current.requiresRadiologist,
            orderable: input.orderable ?? current.orderable,
            chargeCatalogItemId:
              input.chargeCatalogItemId === undefined
                ? current.chargeCatalogItemId
                : this.support.nullableObjectId(
                    input.chargeCatalogItemId,
                    'chargeCatalogItemId',
                  ),
            effectiveFrom:
              input.effectiveFrom === undefined
                ? current.effectiveFrom
                : new Date(input.effectiveFrom),
            effectiveThrough:
              input.effectiveThrough === undefined
                ? current.effectiveThrough
                : input.effectiveThrough === null
                  ? null
                  : new Date(input.effectiveThrough),
            updatedBy: actorId,
          },
        );

        if (updated === null) {
          throw new RadiologyProcedureConcurrencyError();
        }

        await transaction.registerCompensation(
          restoreRadiologyRecordCompensation(
            `restore-procedure:${command.entityId}`,
            restorePayload,
          ),
        );

        await transaction.checkpoint(
          RADIOLOGY_TRANSACTION_STATES.CURRENT_PROJECTION_UPDATED,
          { procedureId: command.entityId, version: updated.version },
        );

        await this.support.dependencies.audit.append({
          transactionId: transaction.transactionId,
          deduplicationKey: this.support.deduplicationKey(
            transaction.transactionId,
            RADIOLOGY_AUDIT_ACTIONS.PROCEDURE_UPDATED,
            command.entityId,
          ),
          action: RADIOLOGY_AUDIT_ACTIONS.PROCEDURE_UPDATED,
          entityType: 'RadiologyProcedure',
          entityId: command.entityId,
          ...this.support.auditActorFields(command.actor),
          occurredAt,
          before: safeRadiologyProcedureAuditSnapshot(current),
          after: safeRadiologyProcedureAuditSnapshot(updated),
        });

        await this.support.dependencies.outbox.enqueue({
          transactionId: transaction.transactionId,
          deduplicationKey: this.support.deduplicationKey(
            transaction.transactionId,
            RADIOLOGY_OUTBOX_EVENTS.PROCEDURE_UPDATED,
            command.entityId,
          ),
          eventType: RADIOLOGY_OUTBOX_EVENTS.PROCEDURE_UPDATED,
          aggregateType: 'RadiologyProcedure',
          aggregateId: command.entityId,
          actorUserId: command.actor.userId,
          facilityId: command.actor.facilityId,
          correlationId: command.actor.correlationId,
          occurredAt,
          payload: safeRadiologyProcedureEventPayload(updated),
        });

        await publishCatalogRealtime(
          this.support,
          command.actor,
          safeRadiologyProcedureEventPayload(updated),
        );

        return updated;
      },
    });
  }
}

export class ChangeRadiologyProcedureStatusWorkflow {
  public constructor(
    private readonly support: RadiologyCommandService,
  ) {}

  public async execute(
    command: CatalogEntityCommand<ChangeRadiologyCatalogStatusInput>,
  ): Promise<RadiologyProcedureRecord> {
    const input = changeRadiologyCatalogStatusBodySchema.parse(command.input);
    const current = await this.support.requireProcedure(
      command.actor,
      command.entityId,
    );
    await this.support.assertAccess(command.actor, 'CATALOG_MANAGE');
    this.support.assertExpectedVersion(
      current,
      input.expectedVersion,
      'PROCEDURE',
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType: RADIOLOGY_TRANSACTION_TYPES.CHANGE_PROCEDURE_STATUS,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: radiologyProcedureMutationLockKeys(
        command.actor.facilityId,
        command.entityId,
      ),
      idempotencyPayload: {
        procedureId: command.entityId,
        expectedVersion: input.expectedVersion,
        status: input.status,
      },
      journalPayload: safeRadiologyCatalogJournalPayload(
        'CHANGE_PROCEDURE_STATUS',
        { procedureId: command.entityId, status: input.status },
      ),
      execute: async (transaction) => {
        const occurredAt = this.support.dependencies.clock.now();
        const restorePayload = protectRadiologyRestorePayload({
          facilityId: command.actor.facilityId,
          collection: 'radiologyProcedures',
          entityId: command.entityId,
          expectedPostVersion: current.version + 1,
          transactionId: transaction.transactionId,
          snapshot: radiologyProcedureRestoreSnapshot(current),
          snapshotCrypto: this.support.dependencies.snapshotCrypto,
        });
        const updated = await this.support.catalog.changeProcedureStatus(
          command.actor.facilityId,
          command.entityId,
          input.expectedVersion,
          input.status,
          command.actor.userId,
          input.reason,
          occurredAt,
        );

        if (updated === null) {
          throw new RadiologyProcedureConcurrencyError();
        }

        await transaction.registerCompensation(
          restoreRadiologyRecordCompensation(
            `restore-procedure-status:${command.entityId}`,
            restorePayload,
          ),
        );

        await this.support.dependencies.audit.append({
          transactionId: transaction.transactionId,
          deduplicationKey: this.support.deduplicationKey(
            transaction.transactionId,
            RADIOLOGY_AUDIT_ACTIONS.PROCEDURE_STATUS_CHANGED,
            command.entityId,
          ),
          action: RADIOLOGY_AUDIT_ACTIONS.PROCEDURE_STATUS_CHANGED,
          entityType: 'RadiologyProcedure',
          entityId: command.entityId,
          ...this.support.auditActorFields(command.actor),
          occurredAt,
          reason: input.reason,
          before: safeRadiologyProcedureAuditSnapshot(current),
          after: safeRadiologyProcedureAuditSnapshot(updated),
        });

        await this.support.dependencies.outbox.enqueue({
          transactionId: transaction.transactionId,
          deduplicationKey: this.support.deduplicationKey(
            transaction.transactionId,
            RADIOLOGY_OUTBOX_EVENTS.PROCEDURE_STATUS_CHANGED,
            command.entityId,
          ),
          eventType: RADIOLOGY_OUTBOX_EVENTS.PROCEDURE_STATUS_CHANGED,
          aggregateType: 'RadiologyProcedure',
          aggregateId: command.entityId,
          actorUserId: command.actor.userId,
          facilityId: command.actor.facilityId,
          correlationId: command.actor.correlationId,
          occurredAt,
          payload: safeRadiologyProcedureEventPayload(updated),
        });

        await publishCatalogRealtime(
          this.support,
          command.actor,
          safeRadiologyProcedureEventPayload(updated),
        );

        return updated;
      },
    });
  }
}

function uniqueStrings(values: readonly string[]): string[] {
  const valuesByNormalized = new Map<string, string>();

  for (const value of values) {
    const display = value.normalize('NFKC').trim();

    if (display.length > 0) {
      valuesByNormalized.set(
        display.toLocaleLowerCase('en-US').replaceAll(/\s+/gu, ' '),
        display,
      );
    }
  }

  return [...valuesByNormalized.values()];
}