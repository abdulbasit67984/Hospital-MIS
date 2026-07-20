import {
  Decimal128,
} from 'mongodb';

import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  ActivateBedRateInput,
  CreateBedRateInput,
  InpatientActorContext,
  SupersedeBedRateInput,
} from '../inpatient.types.js';

import type {
  BedRateRecord,
  BedRateVersionRecord,
} from '../inpatient.persistence.types.js';

import {
  INPATIENT_TRANSACTION_TYPES,
} from '../inpatient.constants.js';

import {
  INPATIENT_AUDIT_ACTIONS,
  INPATIENT_OUTBOX_EVENTS,
  INPATIENT_REALTIME_EVENTS,
  INPATIENT_TRANSACTION_STATES,
} from '../inpatient.transaction.constants.js';

import {
  assertBedRateTransition,
} from '../inpatient.lifecycle.js';

import {
  InpatientBedRateConcurrencyError,
  InpatientBedRateOverlapError,
} from '../inpatient.errors.js';

import {
  buildBedRateScopeKey,
  inpatientContentHash,
} from '../inpatient.normalization.js';

import {
  bedRateRestoreSnapshot,
  deleteCreatedInpatientRecordCompensation,
  protectInpatientRestorePayload,
  restoreInpatientRecordCompensation,
} from '../inpatient.mutation-snapshots.js';

import {
  bedRateCreateLockKeys,
  bedRateMutationLockKeys,
  safeBedRateSnapshot,
  safeInpatientJournalPayload,
} from '../inpatient.workflow-helpers.js';

import {
  activateBedRateBodySchema,
  createBedRateBodySchema,
  supersedeBedRateBodySchema,
} from '../inpatient.validation.js';

import {
  InpatientCommandService,
} from '../services/inpatient-command.service.js';

interface BedRateCommand<T> {
  actor:
    InpatientActorContext;

  input:
    T;

  idempotencyKey:
    string;
}

interface BedRateEntityCommand<T>
extends BedRateCommand<T> {
  bedRateId:
    string;
}

function dateOrNull(
  value:
    string |
    null |
    undefined,
): Date | null {
  return value == null
    ? null
    : new Date(
        value,
      );
}

function chargingPolicy(
  support:
    InpatientCommandService,

  input:
    CreateBedRateInput[
      'chargingPolicy'
    ],
) {
  return {
    policyCode:
      support.normalizedCode(
        input.policyCode,
      ),

    billingUnit:
      input.billingUnit,

    partialDayPolicy:
      input.partialDayPolicy,

    sameDayDischargePolicy:
      input.sameDayDischargePolicy,

    transferChargingPolicy:
      input.transferChargingPolicy,

    roundingIncrementMinutes:
      input
        .roundingIncrementMinutes ??
      null,

    minimumChargeMinutes:
      input.minimumChargeMinutes ??
      0,

    dayBoundaryTimezone:
      input.dayBoundaryTimezone ??
      'Asia/Karachi',

    dayBoundaryHour:
      input.dayBoundaryHour ??
      0,

    gracePeriodMinutes:
      input.gracePeriodMinutes ??
      0,
  };
}

function scopeReferenceId(
  support:
    InpatientCommandService,

  input:
    CreateBedRateInput,
) {
  return input.scopeReferenceId ==
    null
    ? null
    : support.objectId(
        input.scopeReferenceId,
        'scopeReferenceId',
      );
}

async function validateRateScopeReference(
  support:
    InpatientCommandService,

  actor:
    InpatientActorContext,

  input:
    CreateBedRateInput,
): Promise<void> {
  switch (
    input.scope
  ) {
    case 'WARD':
      await support.requireWard(
        actor,
        input.scopeReferenceId ??
          '',
      );
      break;

    case 'ROOM':
      await support.requireRoom(
        actor,
        input.scopeReferenceId ??
          '',
      );
      break;

    case 'BED':
      await support.requireBed(
        actor,
        input.scopeReferenceId ??
          '',
      );
      break;

    case 'BED_CATEGORY':
      break;
  }
}

function versionSnapshot(
  rate:
    BedRateRecord,

  changeType:
    BedRateVersionRecord[
      'changeType'
    ],

  versionNumber:
    number,

  previousVersionId:
    BedRateVersionRecord[
      'previousVersionId'
    ],

  statusSnapshot:
    BedRateVersionRecord[
      'statusSnapshot'
    ],

  recordedAt:
    Date,

  actorId:
    BedRateVersionRecord[
      'recordedBy'
    ],

  transactionId:
    string,

  correlationId:
    string,

  reason:
    string |
    null,
) {
  const snapshot = {
    rateCodeSnapshot:
      rate.rateCode,

    nameSnapshot:
      rate.name,

    scopeSnapshot:
      rate.scope,

    scopeKeySnapshot:
      rate.scopeKey,

    scopeReferenceIdSnapshot:
      rate.scopeReferenceId,

    scopeCodeSnapshot:
      rate.scopeCode,

    currencyCodeSnapshot:
      rate.currencyCode,

    amountSnapshot:
      rate.amount,

    chargingPolicySnapshot:
      rate.chargingPolicy,

    chargeCatalogItemIdSnapshot:
      rate.chargeCatalogItemId,

    priceListIdSnapshot:
      rate.priceListId,

    payerOrganizationIdSnapshot:
      rate.payerOrganizationId,

    panelPlanIdSnapshot:
      rate.panelPlanId,

    treatmentPackageIdSnapshot:
      rate.treatmentPackageId,

    effectiveFromSnapshot:
      rate.effectiveFrom,

    effectiveThroughSnapshot:
      rate.effectiveThrough,

    statusSnapshot,
  };

  return {
    facilityId:
      rate.facilityId,

    bedRateId:
      rate._id,

    versionNumber,

    previousVersionId,

    changeType,

    ...snapshot,

    snapshotHash:
      inpatientContentHash(
        snapshot,
      ),

    changeReason:
      reason,

    recordedAt,

    recordedBy:
      actorId,

    transactionId,

    correlationId,

    schemaVersion:
      1,

    version:
      0,

    createdBy:
      actorId,

    updatedBy:
      actorId,
  };
}

async function publishRateMutation(
  support:
    InpatientCommandService,

  input:
    Readonly<{
      actor:
        InpatientActorContext;

      transactionId:
        string;

      action:
        string;

      eventType:
        string;

      occurredAt:
        Date;

      before:
        Record<string, unknown> |
        null;

      after:
        Record<string, unknown>;

      entityId:
        string;
    }>,
): Promise<void> {
  await support.dependencies.audit.append({
    transactionId:
      input.transactionId,

    deduplicationKey:
      support.deduplicationKey(
        input.transactionId,
        input.action,
        input.entityId,
      ),

    action:
      input.action,

    entityType:
      'BedRate',

    entityId:
      input.entityId,

    ...support.auditActorFields(
      input.actor,
    ),

    occurredAt:
      input.occurredAt,

    before:
      input.before,

    after:
      input.after,
  });

  await support.dependencies.outbox.enqueue({
    transactionId:
      input.transactionId,

    deduplicationKey:
      support.deduplicationKey(
        input.transactionId,
        input.eventType,
        input.entityId,
      ),

    eventType:
      input.eventType,

    aggregateType:
      'BedRate',

    aggregateId:
      input.entityId,

    actorUserId:
      input.actor.userId,

    facilityId:
      input.actor.facilityId,

    correlationId:
      input.actor.correlationId,

    occurredAt:
      input.occurredAt,

    payload:
      input.after,
  });

  await support.dependencies.realtime.publish({
    eventType:
      INPATIENT_REALTIME_EVENTS
        .BED_RATE_CATALOG_CHANGED,

    facilityId:
      input.actor.facilityId,

    payload:
      input.after,
  });
}

export class CreateBedRateWorkflow {
  public constructor(
    private readonly support:
      InpatientCommandService,
  ) {}

  public async execute(
    command:
      BedRateCommand<CreateBedRateInput>,
  ): Promise<
    BedRateRecord
  > {
    const input =
      createBedRateBodySchema.parse(
        command.input,
      );

    await this.support.assertAccess(
      command.actor,
      'BED_MANAGE',
    );

    await validateRateScopeReference(
      this.support,
      command.actor,
      input,
    );

    const scopeKey =
      buildBedRateScopeKey(
        input.scope,

        input.scopeReferenceId ??
          null,

        input.scopeCode ??
          null,

        input.payerOrganizationId ??
          null,

        input.panelPlanId ??
          null,

        input.treatmentPackageId ??
          null,
      );

    const effectiveFrom =
      new Date(
        input.effectiveFrom,
      );

    const effectiveThrough =
      dateOrNull(
        input.effectiveThrough,
      );

    const overlap =
      await this.support.locations
        .findOverlappingBedRate(
          command.actor.facilityId,
          scopeKey,
          effectiveFrom,
          effectiveThrough,
        );

    if (
      overlap !== null
    ) {
      throw new InpatientBedRateOverlapError();
    }

    const rateCode =
      this.support.normalizedCode(
        input.rateCode,
      );

    return this.support.dependencies
      .transactionManager.execute({
        transactionType:
          INPATIENT_TRANSACTION_TYPES
            .CREATE_BED_RATE,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys:
          bedRateCreateLockKeys(
            command.actor.facilityId,
            rateCode,
            scopeKey,
          ),

        idempotencyPayload: {
          rateCode,
          scopeKey,
          effectiveFrom:
            effectiveFrom.toISOString(),
        },

        journalPayload:
          safeInpatientJournalPayload(
            'CREATE_BED_RATE',
            {
              rateCode,
              scopeKey,
              effectiveFrom:
                effectiveFrom.toISOString(),
            },
          ),

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              this.support.dependencies
                .clock.now();

            const actorId =
              toObjectId(
                command.actor.userId,
                'actorUserId',
              );

            const created =
              await this.support.locations
                .createBedRate({
                  facilityId:
                    toObjectId(
                      command.actor
                        .facilityId,
                      'facilityId',
                    ),

                  rateCode,

                  name:
                    this.support.displayText(
                      input.name,
                    ),

                  scope:
                    input.scope,

                  scopeKey,

                  scopeReferenceId:
                    scopeReferenceId(
                      this.support,
                      input,
                    ),

                  scopeCode:
                    input.scopeCode ==
                    null
                      ? null
                      : this.support
                          .normalizedCode(
                            input.scopeCode,
                          ),

                  currencyCode:
                    this.support.normalizedCode(
                      input.currencyCode ??
                        'PKR',
                    ),

                  amount:
                    Decimal128.fromString(
                      input.amount,
                    ),

                  chargingPolicy:
                    chargingPolicy(
                      this.support,
                      input.chargingPolicy,
                    ),

                  chargeCatalogItemId:
                    input.chargeCatalogItemId ==
                    null
                      ? null
                      : toObjectId(
                          input
                            .chargeCatalogItemId,
                          'chargeCatalogItemId',
                        ),

                  priceListId:
                    input.priceListId ==
                    null
                      ? null
                      : toObjectId(
                          input.priceListId,
                          'priceListId',
                        ),

                  payerOrganizationId:
                    input
                      .payerOrganizationId ==
                    null
                      ? null
                      : toObjectId(
                          input
                            .payerOrganizationId,
                          'payerOrganizationId',
                        ),

                  panelPlanId:
                    input.panelPlanId ==
                    null
                      ? null
                      : toObjectId(
                          input.panelPlanId,
                          'panelPlanId',
                        ),

                  treatmentPackageId:
                    input
                      .treatmentPackageId ==
                    null
                      ? null
                      : toObjectId(
                          input
                            .treatmentPackageId,
                          'treatmentPackageId',
                        ),

                  effectiveFrom,

                  effectiveThrough,

                  status:
                    'DRAFT',

                  currentVersion:
                    0,

                  latestVersionId:
                    null,

                  activatedAt:
                    null,

                  activatedBy:
                    null,

                  supersededAt:
                    null,

                  supersededBy:
                    null,

                  supersededByRateId:
                    null,

                  cancelledAt:
                    null,

                  cancelledBy:
                    null,

                  cancellationReason:
                    null,

                  transactionId:
                    transaction
                      .transactionId,

                  correlationId:
                    command.actor
                      .correlationId,

                  schemaVersion:
                    1,

                  version:
                    0,

                  createdBy:
                    actorId,

                  updatedBy:
                    actorId,
                });

            await transaction
              .registerCompensation(
                deleteCreatedInpatientRecordCompensation(
                  `delete-bed-rate:${created._id.toHexString()}`,
                  {
                    facilityId:
                      command.actor
                        .facilityId,

                    collection:
                      'bedRates',

                    entityId:
                      created._id
                        .toHexString(),

                    transactionId:
                      transaction
                        .transactionId,
                  },
                ),
              );

            await publishRateMutation(
              this.support,
              {
                actor:
                  command.actor,

                transactionId:
                  transaction
                    .transactionId,

                action:
                  INPATIENT_AUDIT_ACTIONS
                    .BED_RATE_CREATED,

                eventType:
                  INPATIENT_OUTBOX_EVENTS
                    .BED_RATE_CREATED,

                occurredAt,

                before:
                  null,

                after:
                  safeBedRateSnapshot(
                    created,
                  ),

                entityId:
                  created._id
                    .toHexString(),
              },
            );

            return created;
          },
      });
  }
}

export class ActivateBedRateWorkflow {
  public constructor(
    private readonly support:
      InpatientCommandService,
  ) {}

  public async execute(
    command:
      BedRateEntityCommand<ActivateBedRateInput>,
  ): Promise<
    BedRateRecord
  > {
    const input =
      activateBedRateBodySchema.parse(
        command.input,
      );

    const current =
      await this.support.requireBedRate(
        command.actor,
        command.bedRateId,
      );

    this.support.assertExpectedVersion(
      current,
      input.expectedVersion,
      'BED_RATE',
    );

    await this.support.assertAccess(
      command.actor,
      'BED_MANAGE',
    );

    assertBedRateTransition(
      current.status,
      'ACTIVE',
    );

    const overlap =
      await this.support.locations
        .findOverlappingBedRate(
          command.actor.facilityId,
          current.scopeKey,
          current.effectiveFrom,
          current.effectiveThrough,
          current._id.toHexString(),
        );

    if (
      overlap !== null
    ) {
      throw new InpatientBedRateOverlapError();
    }

    return this.support.dependencies
      .transactionManager.execute({
        transactionType:
          INPATIENT_TRANSACTION_TYPES
            .ACTIVATE_BED_RATE,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys:
          bedRateMutationLockKeys(
            command.actor.facilityId,
            current,
          ),

        idempotencyPayload: {
          bedRateId:
            command.bedRateId,

          expectedVersion:
            input.expectedVersion,
        },

        journalPayload:
          safeInpatientJournalPayload(
            'ACTIVATE_BED_RATE',
            {
              bedRateId:
                command.bedRateId,

              expectedVersion:
                input.expectedVersion,
            },
          ),

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              this.support.dependencies
                .clock.now();

            const actorId =
              toObjectId(
                command.actor.userId,
                'actorUserId',
              );

            await transaction
              .registerCompensation(
                restoreInpatientRecordCompensation(
                  `restore-bed-rate:${current._id.toHexString()}`,
                  protectInpatientRestorePayload(
                    {
                      facilityId:
                        command.actor
                          .facilityId,

                      collection:
                        'bedRates',

                      entityId:
                        current._id
                          .toHexString(),

                      expectedPostVersion:
                        current.version +
                        1,

                      transactionId:
                        transaction
                          .transactionId,

                      snapshot:
                        bedRateRestoreSnapshot(
                          current,
                        ),

                      snapshotCrypto:
                        this.support
                          .dependencies
                          .snapshotCrypto,
                    },
                  ),
                ),
              );

            const version =
              await this.support.locations
                .createBedRateVersion(
                  versionSnapshot(
                    current,
                    'ACTIVATED',
                    1,
                    null,
                    'ACTIVE',
                    occurredAt,
                    actorId,
                    transaction
                      .transactionId,
                    command.actor
                      .correlationId,
                    this.support
                      .nullableText(
                        input.reason,
                      ),
                  ),
                );

            await transaction
              .registerCompensation(
                deleteCreatedInpatientRecordCompensation(
                  `delete-bed-rate-version:${version._id.toHexString()}`,
                  {
                    facilityId:
                      command.actor
                        .facilityId,

                    collection:
                      'bedRateVersions',

                    entityId:
                      version._id
                        .toHexString(),

                    transactionId:
                      transaction
                        .transactionId,
                  },
                ),
              );

            const updated =
              await this.support.locations
                .updateBedRate(
                  command.actor
                    .facilityId,

                  current._id
                    .toHexString(),

                  input.expectedVersion,

                  {
                    status:
                      'ACTIVE',

                    currentVersion:
                      version.versionNumber,

                    latestVersionId:
                      version._id,

                    activatedAt:
                      occurredAt,

                    activatedBy:
                      actorId,

                    updatedBy:
                      actorId,
                  },
                );

            if (
              updated === null
            ) {
              throw new InpatientBedRateConcurrencyError();
            }

            await transaction.checkpoint(
              INPATIENT_TRANSACTION_STATES
                .IMMUTABLE_VERSION_APPENDED,
              {
                bedRateId:
                  updated._id
                    .toHexString(),

                versionId:
                  version._id
                    .toHexString(),

                versionNumber:
                  version.versionNumber,
              },
            );

            await publishRateMutation(
              this.support,
              {
                actor:
                  command.actor,

                transactionId:
                  transaction
                    .transactionId,

                action:
                  INPATIENT_AUDIT_ACTIONS
                    .BED_RATE_ACTIVATED,

                eventType:
                  INPATIENT_OUTBOX_EVENTS
                    .BED_RATE_ACTIVATED,

                occurredAt,

                before:
                  safeBedRateSnapshot(
                    current,
                  ),

                after:
                  safeBedRateSnapshot(
                    updated,
                  ),

                entityId:
                  updated._id
                    .toHexString(),
              },
            );

            return updated;
          },
      });
  }
}

export class SupersedeBedRateWorkflow {
  public constructor(
    private readonly support:
      InpatientCommandService,
  ) {}

  public async execute(
    command:
      BedRateEntityCommand<SupersedeBedRateInput>,
  ): Promise<{
    superseded:
      BedRateRecord;

    replacement:
      BedRateRecord;
  }> {
    const input =
      supersedeBedRateBodySchema.parse(
        command.input,
      );

    const current =
      await this.support.requireBedRate(
        command.actor,
        command.bedRateId,
      );

    this.support.assertExpectedVersion(
      current,
      input.expectedVersion,
      'BED_RATE',
    );

    await this.support.assertAccess(
      command.actor,
      'BED_MANAGE',
    );

    assertBedRateTransition(
      current.status,
      'SUPERSEDED',
    );

    await validateRateScopeReference(
      this.support,
      command.actor,
      input.replacement,
    );

    const replacementScopeKey =
      buildBedRateScopeKey(
        input.replacement.scope,

        input.replacement
          .scopeReferenceId ??
          null,

        input.replacement.scopeCode ??
          null,

        input.replacement
          .payerOrganizationId ??
          null,

        input.replacement.panelPlanId ??
          null,

        input.replacement
          .treatmentPackageId ??
          null,
      );

    if (
      replacementScopeKey !==
      current.scopeKey
    ) {
      throw new InpatientBedRateOverlapError();
    }

    const replacementFrom =
      new Date(
        input.replacement
          .effectiveFrom,
      );

    const replacementThrough =
      dateOrNull(
        input.replacement
          .effectiveThrough,
      );

    const overlap =
      await this.support.locations
        .findOverlappingBedRate(
          command.actor.facilityId,
          replacementScopeKey,
          replacementFrom,
          replacementThrough,
          current._id.toHexString(),
        );

    if (
      overlap !== null
    ) {
      throw new InpatientBedRateOverlapError();
    }

    return this.support.dependencies
      .transactionManager.execute({
        transactionType:
          INPATIENT_TRANSACTION_TYPES
            .SUPERSEDE_BED_RATE,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          ...bedRateMutationLockKeys(
            command.actor.facilityId,
            current,
          ),

          ...bedRateCreateLockKeys(
            command.actor.facilityId,
            this.support
              .normalizedCode(
                input.replacement
                  .rateCode,
              ),
            replacementScopeKey,
          ),
        ],

        idempotencyPayload: {
          bedRateId:
            command.bedRateId,

          expectedVersion:
            input.expectedVersion,

          replacement:
            input.replacement,
        },

        journalPayload:
          safeInpatientJournalPayload(
            'SUPERSEDE_BED_RATE',
            {
              bedRateId:
                command.bedRateId,

              replacementScopeKey,
            },
          ),

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              this.support.dependencies
                .clock.now();

            const actorId =
              toObjectId(
                command.actor.userId,
                'actorUserId',
              );

            const replacement =
              await this.support.locations
                .createBedRate({
                  facilityId:
                    current.facilityId,

                  rateCode:
                    this.support
                      .normalizedCode(
                        input.replacement
                          .rateCode,
                      ),

                  name:
                    this.support
                      .displayText(
                        input.replacement
                          .name,
                      ),

                  scope:
                    input.replacement
                      .scope,

                  scopeKey:
                    replacementScopeKey,

                  scopeReferenceId:
                    scopeReferenceId(
                      this.support,
                      input.replacement,
                    ),

                  scopeCode:
                    input.replacement
                      .scopeCode ==
                    null
                      ? null
                      : this.support
                          .normalizedCode(
                            input.replacement
                              .scopeCode,
                          ),

                  currencyCode:
                    this.support
                      .normalizedCode(
                        input.replacement
                          .currencyCode ??
                          'PKR',
                      ),

                  amount:
                    Decimal128.fromString(
                      input.replacement
                        .amount,
                    ),

                  chargingPolicy:
                    chargingPolicy(
                      this.support,
                      input.replacement
                        .chargingPolicy,
                    ),

                  chargeCatalogItemId:
                    input.replacement
                      .chargeCatalogItemId ==
                    null
                      ? null
                      : toObjectId(
                          input.replacement
                            .chargeCatalogItemId,
                          'chargeCatalogItemId',
                        ),

                  priceListId:
                    input.replacement
                      .priceListId ==
                    null
                      ? null
                      : toObjectId(
                          input.replacement
                            .priceListId,
                          'priceListId',
                        ),

                  payerOrganizationId:
                    input.replacement
                      .payerOrganizationId ==
                    null
                      ? null
                      : toObjectId(
                          input.replacement
                            .payerOrganizationId,
                          'payerOrganizationId',
                        ),

                  panelPlanId:
                    input.replacement
                      .panelPlanId ==
                    null
                      ? null
                      : toObjectId(
                          input.replacement
                            .panelPlanId,
                          'panelPlanId',
                        ),

                  treatmentPackageId:
                    input.replacement
                      .treatmentPackageId ==
                    null
                      ? null
                      : toObjectId(
                          input.replacement
                            .treatmentPackageId,
                          'treatmentPackageId',
                        ),

                  effectiveFrom:
                    replacementFrom,

                  effectiveThrough:
                    replacementThrough,

                  status:
                    'DRAFT',

                  currentVersion:
                    0,

                  latestVersionId:
                    null,

                  activatedAt:
                    null,

                  activatedBy:
                    null,

                  supersededAt:
                    null,

                  supersededBy:
                    null,

                  supersededByRateId:
                    null,

                  cancelledAt:
                    null,

                  cancelledBy:
                    null,

                  cancellationReason:
                    null,

                  transactionId:
                    transaction
                      .transactionId,

                  correlationId:
                    command.actor
                      .correlationId,

                  schemaVersion:
                    1,

                  version:
                    0,

                  createdBy:
                    actorId,

                  updatedBy:
                    actorId,
                });

            await transaction
              .registerCompensation(
                deleteCreatedInpatientRecordCompensation(
                  `delete-replacement-rate:${replacement._id.toHexString()}`,
                  {
                    facilityId:
                      command.actor
                        .facilityId,

                    collection:
                      'bedRates',

                    entityId:
                      replacement._id
                        .toHexString(),

                    transactionId:
                      transaction
                        .transactionId,
                  },
                ),
              );

            const replacementVersion =
              await this.support.locations
                .createBedRateVersion(
                  versionSnapshot(
                    replacement,
                    'ACTIVATED',
                    1,
                    null,
                    'ACTIVE',
                    occurredAt,
                    actorId,
                    transaction
                      .transactionId,
                    command.actor
                      .correlationId,
                    input.reason,
                  ),
                );

            await transaction
              .registerCompensation(
                deleteCreatedInpatientRecordCompensation(
                  `delete-replacement-version:${replacementVersion._id.toHexString()}`,
                  {
                    facilityId:
                      command.actor
                        .facilityId,

                    collection:
                      'bedRateVersions',

                    entityId:
                      replacementVersion
                        ._id
                        .toHexString(),

                    transactionId:
                      transaction
                        .transactionId,
                  },
                ),
              );

            const activatedReplacement =
              await this.support.locations
                .updateBedRate(
                  command.actor
                    .facilityId,

                  replacement._id
                    .toHexString(),

                  0,

                  {
                    status:
                      'ACTIVE',

                    currentVersion:
                      1,

                    latestVersionId:
                      replacementVersion
                        ._id,

                    activatedAt:
                      occurredAt,

                    activatedBy:
                      actorId,

                    updatedBy:
                      actorId,
                  },
                );

            if (
              activatedReplacement ===
              null
            ) {
              throw new InpatientBedRateConcurrencyError();
            }

            await transaction
              .registerCompensation(
                restoreInpatientRecordCompensation(
                  `restore-superseded-rate:${current._id.toHexString()}`,
                  protectInpatientRestorePayload(
                    {
                      facilityId:
                        command.actor
                          .facilityId,

                      collection:
                        'bedRates',

                      entityId:
                        current._id
                          .toHexString(),

                      expectedPostVersion:
                        current.version +
                        1,

                      transactionId:
                        transaction
                          .transactionId,

                      snapshot:
                        bedRateRestoreSnapshot(
                          current,
                        ),

                      snapshotCrypto:
                        this.support
                          .dependencies
                          .snapshotCrypto,
                    },
                  ),
                ),
              );

            const superseded =
              await this.support.locations
                .updateBedRate(
                  command.actor
                    .facilityId,

                  current._id
                    .toHexString(),

                  input.expectedVersion,

                  {
                    status:
                      'SUPERSEDED',

                    supersededAt:
                      occurredAt,

                    supersededBy:
                      actorId,

                    supersededByRateId:
                      activatedReplacement
                        ._id,

                    updatedBy:
                      actorId,
                  },
                );

            if (
              superseded ===
              null
            ) {
              throw new InpatientBedRateConcurrencyError();
            }

            await publishRateMutation(
              this.support,
              {
                actor:
                  command.actor,

                transactionId:
                  transaction
                    .transactionId,

                action:
                  INPATIENT_AUDIT_ACTIONS
                    .BED_RATE_SUPERSEDED,

                eventType:
                  INPATIENT_OUTBOX_EVENTS
                    .BED_RATE_SUPERSEDED,

                occurredAt,

                before:
                  safeBedRateSnapshot(
                    current,
                  ),

                after: {
                  superseded:
                    safeBedRateSnapshot(
                      superseded,
                    ),

                  replacement:
                    safeBedRateSnapshot(
                      activatedReplacement,
                    ),
                },

                entityId:
                  superseded._id
                    .toHexString(),
              },
            );

            return {
              superseded,

              replacement:
                activatedReplacement,
            };
          },
      });
  }
}