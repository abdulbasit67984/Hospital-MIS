import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  ChangeLaboratoryCatalogStatusInput,
  CreateLaboratoryCategoryInput,
  CreateLaboratoryTestInput,
  LaboratoryActorContext,
  UpdateLaboratoryCategoryInput,
  UpdateLaboratoryTestInput,
} from '../laboratory.types.js';

import type {
  LaboratoryTestCategoryRecord,
  LaboratoryTestRecord,
} from '../laboratory.persistence.types.js';

import {
  LABORATORY_TRANSACTION_TYPES,
} from '../laboratory.constants.js';

import {
  LABORATORY_AUDIT_ACTIONS,
  LABORATORY_OUTBOX_EVENTS,
  LABORATORY_REALTIME_EVENTS,
  LABORATORY_TRANSACTION_STATES,
} from '../laboratory.transaction.constants.js';

import {
  deleteCreatedLaboratoryRecordCompensation,
  laboratoryCategoryRestoreSnapshot,
  laboratoryTestRestoreSnapshot,
  protectLaboratoryRestorePayload,
  restoreLaboratoryRecordCompensation,
} from '../laboratory.mutation-snapshots.js';

import {
  normalizeLaboratoryCode,
  normalizeLaboratoryText,
  normalizeNullableLaboratoryText,
} from '../laboratory.normalization.js';

import {
  laboratoryCategoryCreateLockKeys,
  laboratoryCategoryMutationLockKeys,
  laboratoryTestCreateLockKeys,
  laboratoryTestMutationLockKeys,
  safeLaboratoryCatalogJournalPayload,
  safeLaboratoryCategoryAuditSnapshot,
  safeLaboratoryCategoryEventPayload,
  safeLaboratoryTestAuditSnapshot,
  safeLaboratoryTestEventPayload,
} from '../laboratory.workflow-helpers.js';

import {
  LaboratoryCommandService,
} from '../services/laboratory-command.service.js';

import {
  LaboratoryInactiveCategoryError,
  LaboratoryTestCategoryConcurrencyError,
  LaboratoryTestConcurrencyError,
} from '../laboratory.errors.js';

interface MutationCommand<T> {
  actor: LaboratoryActorContext;
  input: T;
  idempotencyKey: string;
}

interface EntityMutationCommand<T> extends MutationCommand<T> {
  entityId: string;
}

export class CreateLaboratoryCategoryWorkflow {
  public constructor(
    private readonly support: LaboratoryCommandService,
  ) {}
   public async execute(
    command: MutationCommand<CreateLaboratoryCategoryInput>,
  ): Promise<LaboratoryTestCategoryRecord> {
    await this.support.assertAccess(
      command.actor,
      'CATALOG_MANAGE',
    );

    const categoryCode =
      normalizeLaboratoryCode(command.input.categoryCode);

    const normalizedName =
      normalizeLaboratoryText(command.input.name);

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        LABORATORY_TRANSACTION_TYPES.CREATE_CATEGORY,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: laboratoryCategoryCreateLockKeys(
        command.actor.facilityId,
        categoryCode,
        normalizedName,
      ),
      idempotencyPayload: command.input,
      journalPayload: safeLaboratoryCatalogJournalPayload(
        'CREATE_CATEGORY',
        {
          categoryCode,
        },
      ),

      execute: async (transaction) => {
        const occurredAt =
          this.support.dependencies.clock.now();

        const actorId = toObjectId(
          command.actor.userId,
          'actorUserId',
        );

        const category =
          await this.support.catalog.createCategory({
            facilityId: toObjectId(
              command.actor.facilityId,
              'facilityId',
            ),
            categoryCode,
            name: command.input.name.trim(),
            normalizedName,
            description:
              normalizeNullableLaboratoryText(
                command.input.description,
              ),
            displayOrder:
              command.input.displayOrder ?? 0,
            status: 'ACTIVE',
            deactivatedAt: null,
            deactivatedBy: null,
            deactivationReason: null,
            schemaVersion: 1,
            version: 0,
            createdBy: actorId,
            updatedBy: actorId,
          });

        await transaction.registerCompensation(
          deleteCreatedLaboratoryRecordCompensation(
            `delete-lab-category:${category._id.toHexString()}`,
            {
              collection: 'labTestCategories',
              entityId: category._id.toHexString(),
              transactionId: transaction.transactionId,
            },
          ),
        );

        await transaction.checkpoint(
          LABORATORY_TRANSACTION_STATES.CURRENT_PROJECTION_CREATED,
          {
            categoryId: category._id.toHexString(),
          },
        );

        await this.support.dependencies.audit.append({
          transactionId: transaction.transactionId,
          deduplicationKey:
            this.support.deduplicationKey(
              transaction.transactionId,
              LABORATORY_AUDIT_ACTIONS.CATEGORY_CREATED,
              category._id.toHexString(),
            ),
          action:
            LABORATORY_AUDIT_ACTIONS.CATEGORY_CREATED,
          entityType: 'LabTestCategory',
          entityId: category._id.toHexString(),
          ...this.support.auditActorFields(command.actor),
          occurredAt,
          before: null,
          after:
            safeLaboratoryCategoryAuditSnapshot(category),
        });

        await this.support.dependencies.outbox.enqueue({
          transactionId: transaction.transactionId,
          deduplicationKey:
            this.support.deduplicationKey(
              transaction.transactionId,
              LABORATORY_OUTBOX_EVENTS.CATEGORY_CREATED,
              category._id.toHexString(),
            ),
          eventType:
            LABORATORY_OUTBOX_EVENTS.CATEGORY_CREATED,
          aggregateType: 'LabTestCategory',
          aggregateId: category._id.toHexString(),
          actorUserId: command.actor.userId,
          facilityId: command.actor.facilityId,
          correlationId: command.actor.correlationId,
          occurredAt,
          payload:
            safeLaboratoryCategoryEventPayload(category),
        });

        await this.support.dependencies.realtime.publish({
          eventType:
            LABORATORY_REALTIME_EVENTS.CATALOG_CHANGED,
          facilityId: command.actor.facilityId,
          payload:
            safeLaboratoryCategoryEventPayload(category),
        });

        return category;
      },
    });
  }
}

export class UpdateLaboratoryCategoryWorkflow {
  public constructor(
    private readonly support: LaboratoryCommandService,
  ) {}

  public async execute(
    command: EntityMutationCommand<UpdateLaboratoryCategoryInput>,
  ): Promise<LaboratoryTestCategoryRecord> {
    await this.support.assertAccess(
      command.actor,
      'CATALOG_MANAGE',
    );

    const current = await this.support.requireCategory(
      command.actor,
      command.entityId,
    );

    this.support.assertExpectedVersion(
      current,
      command.input.expectedVersion,
      'CATEGORY',
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        LABORATORY_TRANSACTION_TYPES.UPDATE_CATEGORY,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: laboratoryCategoryMutationLockKeys(
        command.actor.facilityId,
        command.entityId,
      ),
      idempotencyPayload: command.input,
      journalPayload: safeLaboratoryCatalogJournalPayload(
        'UPDATE_CATEGORY',
        {
          categoryId: command.entityId,
        },
      ),

      execute: async (transaction) => {
        const actorId = toObjectId(
          command.actor.userId,
          'actorUserId',
        );

        const restorePayload =
          protectLaboratoryRestorePayload({
            facilityId: command.actor.facilityId,
            collection: 'labTestCategories',
            entityId: command.entityId,
            expectedPostVersion: current.version + 1,
            transactionId: transaction.transactionId,
            snapshot:
              laboratoryCategoryRestoreSnapshot(current),
            snapshotCrypto:
              this.support.dependencies.snapshotCrypto,
          });

        await transaction.registerCompensation(
          restoreLaboratoryRecordCompensation(
            `restore-lab-category:${command.entityId}`,
            restorePayload,
          ),
        );

        const updated =
          await this.support.catalog.updateCategory(
            command.actor.facilityId,
            command.entityId,
            command.input.expectedVersion,
            {
              ...(command.input.name === undefined
                ? {}
                : {
                    name: command.input.name.trim(),
                    normalizedName:
                      normalizeLaboratoryText(
                        command.input.name,
                      ),
                  }),
              ...(command.input.description === undefined
                ? {}
                : {
                    description:
                      normalizeNullableLaboratoryText(
                        command.input.description,
                      ),
                  }),
              ...(command.input.displayOrder === undefined
                ? {}
                : {
                    displayOrder:
                      command.input.displayOrder,
                  }),
              updatedBy: actorId,
            },
          );

        if (updated === null) {
          throw new LaboratoryTestCategoryConcurrencyError();
        }

        return updated;
      },
    });
  }
}

export class ChangeLaboratoryCategoryStatusWorkflow {
  public constructor(
    private readonly support: LaboratoryCommandService,
  ) {}

  public async execute(
    command: EntityMutationCommand<ChangeLaboratoryCatalogStatusInput>,
  ): Promise<LaboratoryTestCategoryRecord> {
    await this.support.assertAccess(
      command.actor,
      'CATALOG_MANAGE',
    );

    const current = await this.support.requireCategory(
      command.actor,
      command.entityId,
    );

    this.support.assertExpectedVersion(
      current,
      command.input.expectedVersion,
      'CATEGORY',
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        LABORATORY_TRANSACTION_TYPES.UPDATE_CATEGORY,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: laboratoryCategoryMutationLockKeys(
        command.actor.facilityId,
        command.entityId,
      ),
      idempotencyPayload: command.input,
      journalPayload: safeLaboratoryCatalogJournalPayload(
        'CHANGE_CATEGORY_STATUS',
        {
          categoryId: command.entityId,
          status: command.input.status,
        },
      ),

      execute: async (transaction) => {
        const occurredAt =
          this.support.dependencies.clock.now();

        const updated =
          await this.support.catalog.changeCategoryStatus(
            command.actor.facilityId,
            command.entityId,
            command.input.expectedVersion,
            command.input.status,
            command.actor.userId,
            command.input.reason,
            occurredAt,
          );

        if (updated === null) {
          throw new LaboratoryTestCategoryConcurrencyError();
        }

        return updated;
      },
    });
  }
}

export class CreateLaboratoryTestWorkflow {
  public constructor(
    private readonly support: LaboratoryCommandService,
  ) {}

  public async execute(
    command: MutationCommand<CreateLaboratoryTestInput>,
  ): Promise<LaboratoryTestRecord> {
    await this.support.assertAccess(
      command.actor,
      'CATALOG_MANAGE',
    );
     const category = await this.support.requireCategory(
      command.actor,
      command.input.categoryId,
    );

    if (category.status !== 'ACTIVE') {
      throw new LaboratoryInactiveCategoryError();
    }

    const testCode =
      normalizeLaboratoryCode(command.input.testCode);

    const normalizedName =
      normalizeLaboratoryText(command.input.name);

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        LABORATORY_TRANSACTION_TYPES.CREATE_TEST,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: laboratoryTestCreateLockKeys(
        command.actor.facilityId,
        testCode,
        normalizedName,
      ),
      idempotencyPayload: command.input,
      journalPayload: safeLaboratoryCatalogJournalPayload(
        'CREATE_TEST',
        {
          testCode,
        },
      ),

      execute: async (transaction) => {
        const occurredAt =
          this.support.dependencies.clock.now();

        const actorId = toObjectId(
          command.actor.userId,
          'actorUserId',
        );

        const aliases =
          this.support.normalizedAliases(
            command.input.aliases ?? [],
          );

        const test = await this.support.catalog.createTest({
          facilityId: toObjectId(
            command.actor.facilityId,
            'facilityId',
          ),
          testCode,
          name: command.input.name.trim(),
          normalizedName,
          aliases: aliases.aliases,
          normalizedAliases:
            aliases.normalizedAliases,
          categoryId: category._id,
          categoryCodeSnapshot:
            category.categoryCode,
          categoryNameSnapshot:
            category.name,
          description:
            normalizeNullableLaboratoryText(
              command.input.description,
            ),
          methodCode:
            command.input.methodCode == null
              ? null
              : normalizeLaboratoryCode(
                  command.input.methodCode,
                ),
          methodName:
            normalizeNullableLaboratoryText(
              command.input.methodName,
            ),
          requiresSpecimen:
            command.input.requiresSpecimen ?? true,
          specimenRequirements:
            this.support.specimenRequirementRecords(
              command.input.specimenRequirements ?? [],
            ),
          components:
            this.support.resultComponentDefinitionRecords(
              command.input.components,
            ),
          routineTurnaroundMinutes:
            command.input.routineTurnaroundMinutes,
          urgentTurnaroundMinutes:
            command.input.urgentTurnaroundMinutes ?? null,
          statTurnaroundMinutes:
            command.input.statTurnaroundMinutes ?? null,
          availableDepartmentIds:
            this.support.objectIds(
              command.input.availableDepartmentIds ?? [],
              'availableDepartmentIds',
            ),
          orderable:
            command.input.orderable ?? true,
          requiresResultValidation:
            command.input.requiresResultValidation ?? true,
          requiresResultVerification:
            command.input.requiresResultVerification ?? true,
          criticalNotificationRequired:
            command.input.criticalNotificationRequired ?? true,
          chargeCatalogItemId:
            command.input.chargeCatalogItemId == null
              ? null
              : toObjectId(
                  command.input.chargeCatalogItemId,
                  'chargeCatalogItemId',
                ),
          effectiveFrom:
            command.input.effectiveFrom === undefined
              ? occurredAt
              : new Date(command.input.effectiveFrom),
          effectiveThrough:
            command.input.effectiveThrough == null
              ? null
              : new Date(command.input.effectiveThrough),
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
          deleteCreatedLaboratoryRecordCompensation(
            `delete-lab-test:${test._id.toHexString()}`,
            {
              collection: 'labTests',
              entityId: test._id.toHexString(),
              transactionId: transaction.transactionId,
            },
          ),
        );

        await this.support.dependencies.audit.append({
          transactionId: transaction.transactionId,
          deduplicationKey:
            this.support.deduplicationKey(
              transaction.transactionId,
              LABORATORY_AUDIT_ACTIONS.TEST_CREATED,
              test._id.toHexString(),
            ),
          action: LABORATORY_AUDIT_ACTIONS.TEST_CREATED,
          entityType: 'LabTest',
          entityId: test._id.toHexString(),
          ...this.support.auditActorFields(command.actor),
          occurredAt,
          before: null,
          after: safeLaboratoryTestAuditSnapshot(test),
        });

        await this.support.dependencies.outbox.enqueue({
          transactionId: transaction.transactionId,
          deduplicationKey:
            this.support.deduplicationKey(
              transaction.transactionId,
              LABORATORY_OUTBOX_EVENTS.TEST_CREATED,
              test._id.toHexString(),
            ),
          eventType:
            LABORATORY_OUTBOX_EVENTS.TEST_CREATED,
          aggregateType: 'LabTest',
          aggregateId: test._id.toHexString(),
          actorUserId: command.actor.userId,
          facilityId: command.actor.facilityId,
          correlationId: command.actor.correlationId,
          occurredAt,
          payload: safeLaboratoryTestEventPayload(test),
        });

        return test;
      },
    });
  }
}

export class UpdateLaboratoryTestWorkflow {
  public constructor(
    private readonly support: LaboratoryCommandService,
  ) {}

  public async execute(
    command: EntityMutationCommand<UpdateLaboratoryTestInput>,
  ): Promise<LaboratoryTestRecord> {
    await this.support.assertAccess(
      command.actor,
      'CATALOG_MANAGE',
    );

    const current = await this.support.requireTest(
      command.actor,
      command.entityId,
    );

    this.support.assertExpectedVersion(
      current,
      command.input.expectedVersion,
      'TEST',
    );

    const category =
      command.input.categoryId === undefined
        ? null
        : await this.support.requireCategory(
            command.actor,
            command.input.categoryId,
          );

    if (category !== null && category.status !== 'ACTIVE') {
      throw new LaboratoryInactiveCategoryError();
    }

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        LABORATORY_TRANSACTION_TYPES.UPDATE_TEST,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: laboratoryTestMutationLockKeys(
        command.actor.facilityId,
        command.entityId,
      ),
      idempotencyPayload: command.input,
      journalPayload: safeLaboratoryCatalogJournalPayload(
        'UPDATE_TEST',
        {
          testId: command.entityId,
        },
      ),

      execute: async (transaction) => {
        const aliases =
          command.input.aliases === undefined
            ? null
            : this.support.normalizedAliases(
                command.input.aliases,
              );

        const updated = await this.support.catalog.updateTest(
          command.actor.facilityId,
          command.entityId,
          command.input.expectedVersion,
          {
            ...(command.input.name === undefined
              ? {}
              : {
                  name: command.input.name.trim(),
                  normalizedName:
                    normalizeLaboratoryText(
                      command.input.name,
                    ),
                }),
            ...(aliases === null
              ? {}
              : aliases),
            ...(category === null
              ? {}
              : {
                  categoryId: category._id,
                  categoryCodeSnapshot:
                    category.categoryCode,
                  categoryNameSnapshot:
                    category.name,
                }),
            ...(command.input.description === undefined
              ? {}
              : {
                  description:
                    normalizeNullableLaboratoryText(
                      command.input.description,
                    ),
                }),
            ...(command.input.specimenRequirements === undefined
              ? {}
              : {
                  specimenRequirements:
                    this.support.specimenRequirementRecords(
                      command.input.specimenRequirements,
                    ),
                }),
            ...(command.input.components === undefined
              ? {}
              : {
                  components:
                    this.support.resultComponentDefinitionRecords(
                      command.input.components,
                    ),
                }),
            ...(command.input.availableDepartmentIds === undefined
              ? {}
              : {
                  availableDepartmentIds:
                    this.support.objectIds(
                      command.input.availableDepartmentIds,
                      'availableDepartmentIds',
                    ),
                }),
            ...(command.input.routineTurnaroundMinutes === undefined
              ? {}
              : {
                  routineTurnaroundMinutes:
                    command.input.routineTurnaroundMinutes,
                }),
            ...(command.input.urgentTurnaroundMinutes === undefined
              ? {}
              : {
                  urgentTurnaroundMinutes:
                    command.input.urgentTurnaroundMinutes,
                }),
            ...(command.input.statTurnaroundMinutes === undefined
              ? {}
              : {
                  statTurnaroundMinutes:
                    command.input.statTurnaroundMinutes,
                }),
            ...(command.input.orderable === undefined
              ? {}
              : {
                  orderable: command.input.orderable,
                }),
            ...(command.input.requiresSpecimen === undefined
              ? {}
              : {
                  requiresSpecimen:
                    command.input.requiresSpecimen,
                }),
            ...(command.input.requiresResultValidation === undefined
              ? {}
              : {
                  requiresResultValidation:
                    command.input.requiresResultValidation,
                }),
            ...(command.input.requiresResultVerification === undefined
              ? {}
              : {
                  requiresResultVerification:
                    command.input.requiresResultVerification,
                }),
            ...(command.input.criticalNotificationRequired === undefined
              ? {}
              : {
                  criticalNotificationRequired:
                    command.input.criticalNotificationRequired,
                }),
            ...(command.input.effectiveFrom === undefined
              ? {}
              : {
                  effectiveFrom:
                    new Date(command.input.effectiveFrom),
                }),
            ...(command.input.effectiveThrough === undefined
              ? {}
              : {
                  effectiveThrough:
                    command.input.effectiveThrough === null
                      ? null
                      : new Date(
                          command.input.effectiveThrough,
                        ),
                }),
            updatedBy: toObjectId(
              command.actor.userId,
              'actorUserId',
            ),
          },
        );

        if (updated === null) {
          throw new LaboratoryTestConcurrencyError();
        }

        return updated;
      },
    });
  }
}

export class ChangeLaboratoryTestStatusWorkflow {
  public constructor(
    private readonly support: LaboratoryCommandService,
  ) {}

  public async execute(
    command: EntityMutationCommand<ChangeLaboratoryCatalogStatusInput>,
  ): Promise<LaboratoryTestRecord> {
    await this.support.assertAccess(
      command.actor,
      'CATALOG_MANAGE',
    );

    const current = await this.support.requireTest(
      command.actor,
      command.entityId,
    );

    this.support.assertExpectedVersion(
      current,
      command.input.expectedVersion,
      'TEST',
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        LABORATORY_TRANSACTION_TYPES.CHANGE_TEST_STATUS,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: laboratoryTestMutationLockKeys(
        command.actor.facilityId,
        command.entityId,
      ),
      idempotencyPayload: command.input,
      journalPayload: safeLaboratoryCatalogJournalPayload(
        'CHANGE_TEST_STATUS',
        {
          testId: command.entityId,
          status: command.input.status,
        },
      ),

      execute: async () => {
        const updated =
          await this.support.catalog.changeTestStatus(
            command.actor.facilityId,
            command.entityId,
            command.input.expectedVersion,
            command.input.status,
            command.actor.userId,
            command.input.reason,
            this.support.dependencies.clock.now(),
          );

        if (updated === null) {
          throw new LaboratoryTestConcurrencyError();
        }

        return updated;
      },
    });
  }
}