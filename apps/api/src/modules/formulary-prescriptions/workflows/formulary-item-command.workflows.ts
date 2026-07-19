import {
  toObjectId,
} from '@hospital-mis/database';

import {
  FormularyItemConcurrencyError,
  FormularyItemNotFoundError,
  InactiveMedicineError,
  InactiveMedicineFormError,
  InactiveMedicineRouteError,
  InactiveMedicineStrengthError,
  InactiveUnitOfMeasureError,
  MedicineFormNotFoundError,
  MedicineNotFoundError,
  MedicineRouteNotFoundError,
  MedicineStrengthNotFoundError,
  UnitOfMeasureNotFoundError,
} from '../formulary-prescriptions.errors.js';

import type {
  CreateFormularyItemInput,
  ChangeFormularyItemStatusInput,
  FormularyPrescriptionActorContext,
  UpdateFormularyItemInput,
} from '../formulary-prescriptions.types.js';

import {
  buildActiveFormularySelectionKey,
  buildFormularySearchText,
  normalizeFormularyCode,
  normalizeFormularyText,
  normalizeNullableFormularyText,
} from '../formulary-prescriptions.normalization.js';

import {
  deleteCreatedFormularyPrescriptionRecordCompensation,
  formularyItemRestoreSnapshot,
  protectFormularyPrescriptionRestorePayload,
  restoreFormularyPrescriptionRecordCompensation,
} from '../formulary-prescriptions.mutation-snapshots.js';

import {
  formularyItemCreateLockKeys,
  formularyItemMutationLockKeys,
  formularyPrescriptionDeduplicationKey,
  safeFormularyItemAuditSnapshot,
  safeFormularyItemEventPayload,
  safeFormularyJournalPayload,
} from '../formulary-prescriptions.workflow-helpers.js';

import {
  FORMULARY_PRESCRIPTION_AUDIT_ACTIONS,
  FORMULARY_PRESCRIPTION_OUTBOX_EVENTS,
  FORMULARY_PRESCRIPTION_REALTIME_EVENTS,
  FORMULARY_PRESCRIPTION_TRANSACTION_STATES,
} from '../formulary-prescriptions.transaction.constants.js';

import {
  FORMULARY_PRESCRIPTION_TRANSACTION_TYPES,
} from '../formulary-prescriptions.constants.js';

import type {
  FormularyItemRecord,
} from '../formulary-prescriptions.persistence.types.js';

import {
  FormularyPrescriptionCommandService,
} from '../services/formulary-prescription-command.service.js';

async function validateCatalogReferences(
  support: FormularyPrescriptionCommandService,
  actor: FormularyPrescriptionActorContext,
  input: Readonly<{
    medicineId: string;
    medicineFormId: string;
    medicineStrengthId: string;
    allowedRouteIds: readonly string[];
    defaultRouteId: string;
    doseUnitId: string;
    quantityUnitId: string;
  }>,
): Promise<{
  genericName: string;
  medicineCode: string;
  synonyms: readonly string[];
  medicineForm: string;
  strength: string;
}> {
  const [
    medicine,
    medicineForm,
    medicineStrength,
    doseUnit,
    quantityUnit,
  ] =
    await Promise.all([
      support.catalog.findMedicineById(
        actor.facilityId,
        input.medicineId,
      ),

      support.catalog.findMedicineFormById(
        actor.facilityId,
        input.medicineFormId,
      ),

      support.catalog.findMedicineStrengthById(
        actor.facilityId,
        input.medicineStrengthId,
      ),

      support.catalog.findUnitOfMeasureById(
        actor.facilityId,
        input.doseUnitId,
      ),

      support.catalog.findUnitOfMeasureById(
        actor.facilityId,
        input.quantityUnitId,
      ),
    ]);

  if (medicine === null) {
    throw new MedicineNotFoundError();
  }

  if (medicine.status !== 'ACTIVE') {
    throw new InactiveMedicineError();
  }

  if (medicineForm === null) {
    throw new MedicineFormNotFoundError();
  }

  if (medicineForm.status !== 'ACTIVE') {
    throw new InactiveMedicineFormError();
  }

  if (medicineStrength === null) {
    throw new MedicineStrengthNotFoundError();
  }

  if (medicineStrength.status !== 'ACTIVE') {
    throw new InactiveMedicineStrengthError();
  }

  if (
    medicineStrength.medicineId.toHexString() !==
      medicine._id.toHexString() ||
    medicineStrength.medicineFormId.toHexString() !==
      medicineForm._id.toHexString()
  ) {
    throw new MedicineStrengthNotFoundError();
  }

  if (
    doseUnit === null ||
    quantityUnit === null
  ) {
    throw new UnitOfMeasureNotFoundError();
  }

  if (
    doseUnit.status !== 'ACTIVE' ||
    quantityUnit.status !== 'ACTIVE'
  ) {
    throw new InactiveUnitOfMeasureError();
  }

  const routeIds =
    [
      ...new Set([
        ...input.allowedRouteIds,
        input.defaultRouteId,
      ]),
    ];

  for (const routeId of routeIds) {
    const route =
      await support.catalog.findMedicineRouteById(
        actor.facilityId,
        routeId,
      );

    if (route === null) {
      throw new MedicineRouteNotFoundError();
    }

    if (route.status !== 'ACTIVE') {
      throw new InactiveMedicineRouteError();
    }
  }

  return {
    genericName:
      medicine.genericName,

    medicineCode:
      medicine.medicineCode,

    synonyms:
      medicine.synonyms,

    medicineForm:
      medicineForm.name,

    strength:
      medicineStrength.displayText,
  };
}

async function publishFormularyMutation(
  input: Readonly<{
    support: FormularyPrescriptionCommandService;
    actor: FormularyPrescriptionActorContext;
    transactionId: string;
    transaction: Parameters<
      FormularyPrescriptionCommandService['publishPrescriptionMutation']
    >[0]['transaction'];
    occurredAt: Date;
    auditAction: string;
    outboxEventType: string;
    before: FormularyItemRecord | null;
    after: FormularyItemRecord;
    reason?: string;
  }>,
): Promise<void> {
  const entityId =
    input.after._id.toHexString();

  await input.support.dependencies.audit.append({
    transactionId:
      input.transactionId,

    deduplicationKey:
      formularyPrescriptionDeduplicationKey(
        input.transactionId,
        input.auditAction,
        entityId,
      ),

    action:
      input.auditAction,

    entityType:
      'FormularyItem',

    entityId,

    actorUserId:
      input.actor.userId,

    facilityId:
      input.actor.facilityId,

    correlationId:
      input.actor.correlationId,

    ...(input.actor.ipAddress === undefined
      ? {}
      : {
          ipAddress:
            input.actor.ipAddress,
        }),

    ...(input.actor.userAgent === undefined
      ? {}
      : {
          userAgent:
            input.actor.userAgent,
        }),

    occurredAt:
      input.occurredAt,

    ...(input.reason === undefined
      ? {}
      : {
          reason:
            input.reason,
        }),

    ...(input.before === null
      ? {}
      : {
          before:
            safeFormularyItemAuditSnapshot(
              input.before,
            ),
        }),

    after:
      safeFormularyItemAuditSnapshot(
        input.after,
      ),
  });

  await input.transaction.checkpoint(
    FORMULARY_PRESCRIPTION_TRANSACTION_STATES.AUDIT_APPENDED,
    {
      formularyItemId:
        entityId,
    },
  );

  await input.support.dependencies.outbox.enqueue({
    transactionId:
      input.transactionId,

    deduplicationKey:
      formularyPrescriptionDeduplicationKey(
        input.transactionId,
        input.outboxEventType,
        entityId,
      ),

    eventType:
      input.outboxEventType,

    aggregateType:
      'FormularyItem',

    aggregateId:
      entityId,

    actorUserId:
      input.actor.userId,

    facilityId:
      input.actor.facilityId,

    correlationId:
      input.actor.correlationId,

    occurredAt:
      input.occurredAt,

    payload:
      safeFormularyItemEventPayload(
        input.after,
      ),
  });

  await input.transaction.checkpoint(
    FORMULARY_PRESCRIPTION_TRANSACTION_STATES.OUTBOX_ENQUEUED,
    {
      formularyItemId:
        entityId,
    },
  );

  await input.support.dependencies.realtime.publish({
    eventType:
      FORMULARY_PRESCRIPTION_REALTIME_EVENTS.FORMULARY_CHANGED,

    facilityId:
      input.actor.facilityId,

    payload:
      safeFormularyItemEventPayload(
        input.after,
      ),
  });

  await input.transaction.checkpoint(
    FORMULARY_PRESCRIPTION_TRANSACTION_STATES.REALTIME_PUBLISHED,
    {
      formularyItemId:
        entityId,
    },
  );
}

export interface CreateFormularyItemCommand {
  actor: FormularyPrescriptionActorContext;
  input: CreateFormularyItemInput;
  idempotencyKey: string;
}

export class CreateFormularyItemWorkflow {
  public constructor(
    private readonly support:
      FormularyPrescriptionCommandService,
  ) {}

  public async execute(
    command: CreateFormularyItemCommand,
  ): Promise<FormularyItemRecord> {
    await this.support.assertAccess(
      command.actor,
      'FORMULARY_MANAGE',
    );

    const catalog =
      await validateCatalogReferences(
        this.support,
        command.actor,
        command.input,
      );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        FORMULARY_PRESCRIPTION_TRANSACTION_TYPES.CREATE_FORMULARY_ITEM,

      idempotencyKey:
        command.idempotencyKey,

      actorUserId:
        command.actor.userId,

      facilityId:
        command.actor.facilityId,

      correlationId:
        command.actor.correlationId,

      lockKeys:
        formularyItemCreateLockKeys(
          command.actor.facilityId,
          command.input,
        ),

      idempotencyPayload: {
        facilityId:
          command.actor.facilityId,

        input:
          command.input,
      },

      journalPayload:
        safeFormularyJournalPayload(
          'CREATE_FORMULARY_ITEM',
          command.input,
        ),

      execute: async (transaction) => {
        const occurredAt =
          this.support.dependencies.clock.now();

        const formularyItemId =
          this.support.newId();

        const brandName =
          normalizeNullableFormularyText(
            command.input.brandName,
          );

        const created =
          await this.support.catalog.createFormularyItem({
            facilityId:
              toObjectId(
                command.actor.facilityId,
                'facilityId',
              ),

            formularyCode:
              normalizeFormularyCode(
                command.input.formularyCode,
              ),

            medicineId:
              toObjectId(
                command.input.medicineId,
                'medicineId',
              ),

            medicineFormId:
              toObjectId(
                command.input.medicineFormId,
                'medicineFormId',
              ),

            medicineStrengthId:
              toObjectId(
                command.input.medicineStrengthId,
                'medicineStrengthId',
              ),

            brandName,

            normalizedBrandName:
              brandName === null
                ? null
                : normalizeFormularyText(
                    brandName,
                  ),

            allowedRouteIds:
              [
                ...new Set([
                  ...command.input.allowedRouteIds,
                  command.input.defaultRouteId,
                ]),
              ].map(
                (routeId) =>
                  toObjectId(
                    routeId,
                    'allowedRouteIds',
                  ),
              ),

            defaultRouteId:
              toObjectId(
                command.input.defaultRouteId,
                'defaultRouteId',
              ),

            doseUnitId:
              toObjectId(
                command.input.doseUnitId,
                'doseUnitId',
              ),

            quantityUnitId:
              toObjectId(
                command.input.quantityUnitId,
                'quantityUnitId',
              ),

            inventoryItemId:
              command.input.inventoryItemId == null
                ? null
                : toObjectId(
                    command.input.inventoryItemId,
                    'inventoryItemId',
                  ),

            stockTracked:
              command.input.stockTracked ??
              false,

            restrictionType:
              command.input.restrictionType ??
              'NONE',

            restrictedDepartmentIds:
              (
                command.input.restrictedDepartmentIds ??
                []
              ).map(
                (departmentId) =>
                  toObjectId(
                    departmentId,
                    'restrictedDepartmentIds',
                  ),
              ),

            minimumAgeYears:
              command.input.minimumAgeYears ??
              null,

            maximumAgeYears:
              command.input.maximumAgeYears ??
              null,

            highAlert:
              command.input.highAlert ??
              false,

            controlledMedicine:
              command.input.controlledMedicine ??
              false,

            prescribingNotes:
              normalizeNullableFormularyText(
                command.input.prescribingNotes,
              ),

            searchText:
              buildFormularySearchText({
                genericName:
                  catalog.genericName,

                brandName,

                medicineForm:
                  catalog.medicineForm,

                strength:
                  catalog.strength,

                medicineCode:
                  catalog.medicineCode,

                formularyCode:
                  command.input.formularyCode,

                synonyms:
                  catalog.synonyms,
              }),

            activeSelectionKey:
              buildActiveFormularySelectionKey({
                medicineId:
                  command.input.medicineId,

                medicineFormId:
                  command.input.medicineFormId,

                medicineStrengthId:
                  command.input.medicineStrengthId,

                brandName,
              }),

            effectiveFrom:
              command.input.effectiveFrom == null
                ? occurredAt
                : new Date(
                    command.input.effectiveFrom,
                  ),

            effectiveUntil:
              command.input.effectiveUntil == null
                ? null
                : new Date(
                    command.input.effectiveUntil,
                  ),

            status:
              'ACTIVE',

            deactivatedAt:
              null,

            deactivatedBy:
              null,

            deactivationReason:
              null,

            transactionId:
              transaction.transactionId,

            correlationId:
              command.actor.correlationId,

            schemaVersion:
              1,

            version:
              0,

            createdBy:
              toObjectId(
                command.actor.userId,
                'actorUserId',
              ),

            updatedBy:
              toObjectId(
                command.actor.userId,
                'actorUserId',
              ),

            _id:
              toObjectId(
                formularyItemId,
                'formularyItemId',
              ),
          } as never);

        await transaction.registerCompensation(
          deleteCreatedFormularyPrescriptionRecordCompensation({
            key:
              `delete-formulary-item:${created._id.toHexString()}`,

            collection:
              'formularyItems',

            entityId:
              created._id.toHexString(),

            expectedVersion:
              created.version,

            transactionId:
              transaction.transactionId,
          }),
        );

        await transaction.checkpoint(
          FORMULARY_PRESCRIPTION_TRANSACTION_STATES.CURRENT_PROJECTION_CREATED,
          {
            formularyItemId:
              created._id.toHexString(),
          },
        );

        await publishFormularyMutation({
          support:
            this.support,

          actor:
            command.actor,

          transactionId:
            transaction.transactionId,

          transaction,

          occurredAt,

          auditAction:
            FORMULARY_PRESCRIPTION_AUDIT_ACTIONS.FORMULARY_ITEM_CREATED,

          outboxEventType:
            FORMULARY_PRESCRIPTION_OUTBOX_EVENTS.FORMULARY_ITEM_CREATED,

          before:
            null,

          after:
            created,
        });

        return created;
      },
    });
  }
}

export interface UpdateFormularyItemCommand {
  actor: FormularyPrescriptionActorContext;
  formularyItemId: string;
  input: UpdateFormularyItemInput;
  idempotencyKey: string;
}

export class UpdateFormularyItemWorkflow {
  public constructor(
    private readonly support:
      FormularyPrescriptionCommandService,
  ) {}

  public async execute(
    command: UpdateFormularyItemCommand,
  ): Promise<FormularyItemRecord> {
    await this.support.assertAccess(
      command.actor,
      'FORMULARY_MANAGE',
    );

    const current =
      await this.support.catalog.findFormularyItemById(
        command.actor.facilityId,
        command.formularyItemId,
      );

    if (current === null) {
      throw new FormularyItemNotFoundError();
    }

    if (
      current.version !==
      command.input.expectedVersion
    ) {
      throw new FormularyItemConcurrencyError();
    }

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        FORMULARY_PRESCRIPTION_TRANSACTION_TYPES.UPDATE_FORMULARY_ITEM,

      idempotencyKey:
        command.idempotencyKey,

      actorUserId:
        command.actor.userId,

      facilityId:
        command.actor.facilityId,

      correlationId:
        command.actor.correlationId,

      lockKeys:
        formularyItemMutationLockKeys(
          command.actor.facilityId,
          command.formularyItemId,
        ),

      idempotencyPayload: {
        facilityId:
          command.actor.facilityId,

        formularyItemId:
          command.formularyItemId,

        input:
          command.input,
      },

      journalPayload:
        safeFormularyJournalPayload(
          'UPDATE_FORMULARY_ITEM',
          {
            formularyItemId:
              command.formularyItemId,

            medicineId:
              current.medicineId.toHexString(),

            medicineFormId:
              current.medicineFormId.toHexString(),

            medicineStrengthId:
              current.medicineStrengthId.toHexString(),

            status:
              current.status,
          },
        ),

      execute: async (transaction) => {
        const fresh =
          await this.support.catalog.findFormularyItemById(
            command.actor.facilityId,
            command.formularyItemId,
          );

        if (fresh === null) {
          throw new FormularyItemNotFoundError();
        }

        if (
          fresh.version !==
          command.input.expectedVersion
        ) {
          throw new FormularyItemConcurrencyError();
        }

        const restorePayload =
          protectFormularyPrescriptionRestorePayload({
            collection:
              'formularyItems',

            entityId:
              command.formularyItemId,

            expectedPostVersion:
              fresh.version + 1,

            transactionId:
              transaction.transactionId,

            snapshot:
              formularyItemRestoreSnapshot(
                fresh,
              ),

            snapshotCrypto:
              this.support.dependencies.snapshotCrypto,
          });

        await transaction.registerCompensation(
          restoreFormularyPrescriptionRecordCompensation(
            `restore-formulary-item:${command.formularyItemId}:${fresh.version + 1}`,
            restorePayload,
          ),
        );

        const updated =
          await this.support.catalog.updateFormularyItem(
            command.actor.facilityId,
            command.formularyItemId,
            command.input.expectedVersion,
            {
              ...(command.input.brandName === undefined
                ? {}
                : {
                    brandName:
                      normalizeNullableFormularyText(
                        command.input.brandName,
                      ),

                    normalizedBrandName:
                      command.input.brandName == null
                        ? null
                        : normalizeFormularyText(
                            command.input.brandName,
                          ),
                  }),

              ...(command.input.allowedRouteIds === undefined
                ? {}
                : {
                    allowedRouteIds:
                      command.input.allowedRouteIds.map(
                        (routeId) =>
                          toObjectId(
                            routeId,
                            'allowedRouteIds',
                          ),
                      ),
                  }),

              ...(command.input.defaultRouteId === undefined
                ? {}
                : {
                    defaultRouteId:
                      toObjectId(
                        command.input.defaultRouteId,
                        'defaultRouteId',
                      ),
                  }),

              ...(command.input.inventoryItemId === undefined
                ? {}
                : {
                    inventoryItemId:
                      command.input.inventoryItemId === null
                        ? null
                        : toObjectId(
                            command.input.inventoryItemId,
                            'inventoryItemId',
                          ),
                  }),

              ...(command.input.stockTracked === undefined
                ? {}
                : {
                    stockTracked:
                      command.input.stockTracked,
                  }),

              ...(command.input.restrictionType === undefined
                ? {}
                : {
                    restrictionType:
                      command.input.restrictionType,
                  }),

              ...(command.input.restrictedDepartmentIds === undefined
                ? {}
                : {
                    restrictedDepartmentIds:
                      command.input.restrictedDepartmentIds.map(
                        (departmentId) =>
                          toObjectId(
                            departmentId,
                            'restrictedDepartmentIds',
                          ),
                      ),
                  }),

              ...(command.input.minimumAgeYears === undefined
                ? {}
                : {
                    minimumAgeYears:
                      command.input.minimumAgeYears,
                  }),

              ...(command.input.maximumAgeYears === undefined
                ? {}
                : {
                    maximumAgeYears:
                      command.input.maximumAgeYears,
                  }),

              ...(command.input.highAlert === undefined
                ? {}
                : {
                    highAlert:
                      command.input.highAlert,
                  }),

              ...(command.input.controlledMedicine === undefined
                ? {}
                : {
                    controlledMedicine:
                      command.input.controlledMedicine,
                  }),

              ...(command.input.prescribingNotes === undefined
                ? {}
                : {
                    prescribingNotes:
                      normalizeNullableFormularyText(
                        command.input.prescribingNotes,
                      ),
                  }),

              ...(command.input.effectiveFrom === undefined
                ? {}
                : {
                    effectiveFrom:
                      new Date(
                        command.input.effectiveFrom,
                      ),
                  }),

              ...(command.input.effectiveUntil === undefined
                ? {}
                : {
                    effectiveUntil:
                      command.input.effectiveUntil === null
                        ? null
                        : new Date(
                            command.input.effectiveUntil,
                          ),
                  }),

              updatedBy:
                toObjectId(
                  command.actor.userId,
                  'actorUserId',
                ),
            },
          );

        if (updated === null) {
          throw new FormularyItemConcurrencyError();
        }

        const occurredAt =
          this.support.dependencies.clock.now();

        await transaction.checkpoint(
          FORMULARY_PRESCRIPTION_TRANSACTION_STATES.CURRENT_PROJECTION_UPDATED,
          {
            formularyItemId:
              command.formularyItemId,
          },
        );

        await publishFormularyMutation({
          support:
            this.support,

          actor:
            command.actor,

          transactionId:
            transaction.transactionId,

          transaction,

          occurredAt,

          auditAction:
            FORMULARY_PRESCRIPTION_AUDIT_ACTIONS.FORMULARY_ITEM_UPDATED,

          outboxEventType:
            FORMULARY_PRESCRIPTION_OUTBOX_EVENTS.FORMULARY_ITEM_UPDATED,

          before:
            fresh,

          after:
            updated,
        });

        return updated;
      },
    });
  }
}

export interface ChangeFormularyItemStatusCommand {
  actor: FormularyPrescriptionActorContext;
  formularyItemId: string;
  input: ChangeFormularyItemStatusInput;
  idempotencyKey: string;
}

export class ChangeFormularyItemStatusWorkflow {
  public constructor(
    private readonly support:
      FormularyPrescriptionCommandService,
  ) {}

  public async execute(
    command: ChangeFormularyItemStatusCommand,
  ): Promise<FormularyItemRecord> {
    await this.support.assertAccess(
      command.actor,
      'FORMULARY_MANAGE',
    );

    const current =
      await this.support.catalog.findFormularyItemById(
        command.actor.facilityId,
        command.formularyItemId,
      );

    if (current === null) {
      throw new FormularyItemNotFoundError();
    }

    if (
      current.version !==
      command.input.expectedVersion
    ) {
      throw new FormularyItemConcurrencyError();
    }

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        FORMULARY_PRESCRIPTION_TRANSACTION_TYPES.CHANGE_FORMULARY_ITEM_STATUS,

      idempotencyKey:
        command.idempotencyKey,

      actorUserId:
        command.actor.userId,

      facilityId:
        command.actor.facilityId,

      correlationId:
        command.actor.correlationId,

      lockKeys:
        formularyItemMutationLockKeys(
          command.actor.facilityId,
          command.formularyItemId,
        ),

      idempotencyPayload: {
        facilityId:
          command.actor.facilityId,

        formularyItemId:
          command.formularyItemId,

        input:
          command.input,
      },

      journalPayload:
        safeFormularyJournalPayload(
          'CHANGE_FORMULARY_ITEM_STATUS',
          {
            formularyItemId:
              command.formularyItemId,

            medicineId:
              current.medicineId.toHexString(),

            medicineFormId:
              current.medicineFormId.toHexString(),

            medicineStrengthId:
              current.medicineStrengthId.toHexString(),

            status:
              command.input.status,
          },
        ),

      execute: async (transaction) => {
        const fresh =
          await this.support.catalog.findFormularyItemById(
            command.actor.facilityId,
            command.formularyItemId,
          );

        if (fresh === null) {
          throw new FormularyItemNotFoundError();
        }

        if (
          fresh.version !==
          command.input.expectedVersion
        ) {
          throw new FormularyItemConcurrencyError();
        }

        const restorePayload =
          protectFormularyPrescriptionRestorePayload({
            collection:
              'formularyItems',

            entityId:
              command.formularyItemId,

            expectedPostVersion:
              fresh.version + 1,

            transactionId:
              transaction.transactionId,

            snapshot:
              formularyItemRestoreSnapshot(
                fresh,
              ),

            snapshotCrypto:
              this.support.dependencies.snapshotCrypto,
          });

        await transaction.registerCompensation(
          restoreFormularyPrescriptionRecordCompensation(
            `restore-formulary-item:${command.formularyItemId}:${fresh.version + 1}`,
            restorePayload,
          ),
        );

        const occurredAt =
          this.support.dependencies.clock.now();

        const updated =
          await this.support.catalog.changeFormularyItemStatus(
            command.actor.facilityId,
            command.formularyItemId,
            command.input.expectedVersion,
            command.input.status,
            command.actor.userId,
            command.input.reason,
            occurredAt,
          );

        if (updated === null) {
          throw new FormularyItemConcurrencyError();
        }

        await transaction.checkpoint(
          FORMULARY_PRESCRIPTION_TRANSACTION_STATES.CURRENT_PROJECTION_UPDATED,
          {
            formularyItemId:
              command.formularyItemId,
          },
        );

        await publishFormularyMutation({
          support:
            this.support,

          actor:
            command.actor,

          transactionId:
            transaction.transactionId,

          transaction,

          occurredAt,

          auditAction:
            FORMULARY_PRESCRIPTION_AUDIT_ACTIONS.FORMULARY_ITEM_STATUS_CHANGED,

          outboxEventType:
            FORMULARY_PRESCRIPTION_OUTBOX_EVENTS.FORMULARY_ITEM_STATUS_CHANGED,

          before:
            fresh,

          after:
            updated,

          reason:
            command.input.reason,
        });

        return updated;
      },
    });
  }
}