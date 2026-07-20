import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  ChangeInpatientCatalogStatusInput,
  CreateBedInput,
  CreateRoomInput,
  CreateWardInput,
  InpatientActorContext,
  UpdateBedInput,
  UpdateRoomInput,
  UpdateWardInput,
} from '../inpatient.types.js';

import type {
  BedRecord,
  RoomRecord,
  WardRecord,
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
  bedRestoreSnapshot,
  deleteCreatedInpatientRecordCompensation,
  protectInpatientRestorePayload,
  restoreInpatientRecordCompensation,
  roomRestoreSnapshot,
  wardRestoreSnapshot,
} from '../inpatient.mutation-snapshots.js';

import {
  bedCreateLockKeys,
  bedMutationLockKeys,
  roomCreateLockKeys,
  roomMutationLockKeys,
  safeBedSnapshot,
  safeInpatientJournalPayload,
  safeRoomSnapshot,
  safeWardSnapshot,
  wardCreateLockKeys,
  wardMutationLockKeys,
} from '../inpatient.workflow-helpers.js';

import {
  InpatientBedConcurrencyError,
  InpatientLocationHierarchyError,
  InpatientLocationInUseError,
  InpatientRoomConcurrencyError,
  InpatientWardConcurrencyError,
} from '../inpatient.errors.js';

import {
  changeInpatientCatalogStatusBodySchema,
  createBedBodySchema,
  createRoomBodySchema,
  createWardBodySchema,
  updateBedBodySchema,
  updateRoomBodySchema,
  updateWardBodySchema,
} from '../inpatient.validation.js';

import {
  InpatientCommandService,
} from '../services/inpatient-command.service.js';

interface LocationCommand<T> {
  actor:
    InpatientActorContext;

  input:
    T;

  idempotencyKey:
    string;
}

interface LocationEntityCommand<T>
extends LocationCommand<T> {
  entityId:
    string;
}

function restrictionValues(
  support:
    InpatientCommandService,

  input:
    Readonly<{
      permittedSexes:
        readonly (
          'MALE' |
          'FEMALE' |
          'OTHER' |
          'UNKNOWN'
        )[];

      minimumAgeYears?:
        number | null;

      maximumAgeYears?:
        number | null;

      specialtyCodes?:
        readonly string[];

      isolationCapabilities?:
        readonly (
          'STANDARD_PRECAUTIONS' |
          'CONTACT' |
          'DROPLET' |
          'AIRBORNE' |
          'PROTECTIVE' |
          'NEGATIVE_PRESSURE'
        )[];

      infectionControlTags?:
        readonly string[];

      negativePressureCapable?:
        boolean;

      cohortingAllowed?:
        boolean;
    }>,
) {
  return {
    permittedSexes: [
      ...input.permittedSexes,
    ],

    minimumAgeYears:
      input.minimumAgeYears ??
      null,

    maximumAgeYears:
      input.maximumAgeYears ??
      null,

    specialtyCodes:
      support.normalizedCodes(
        input.specialtyCodes ??
          [],
      ),

    isolationCapabilities: [
      ...(
        input.isolationCapabilities ??
        [
          'STANDARD_PRECAUTIONS',
        ]
      ),
    ],

    infectionControlTags:
      support.normalizedCodes(
        input.infectionControlTags ??
          [],
      ),

    negativePressureCapable:
      input.negativePressureCapable ??
      false,

    cohortingAllowed:
      input.cohortingAllowed ??
      true,
  };
}

async function completeLocationMutation(
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

      entityType:
        string;

      entityId:
        string;

      occurredAt:
        Date;

      before:
        Record<string, unknown> |
        null;

      after:
        Record<string, unknown>;

      wardId?:
        string;

      roomId?:
        string;

      bedId?:
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
      input.entityType,

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
      input.entityType,

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
      input.bedId === undefined
        ? INPATIENT_REALTIME_EVENTS
            .LOCATION_CATALOG_CHANGED
        : INPATIENT_REALTIME_EVENTS
            .BED_MAP_CHANGED,

    facilityId:
      input.actor.facilityId,

    ...(
      input.wardId ===
      undefined
        ? {}
        : {
            wardId:
              input.wardId,
          }
    ),

    ...(
      input.roomId ===
      undefined
        ? {}
        : {
            roomId:
              input.roomId,
          }
    ),

    ...(
      input.bedId ===
      undefined
        ? {}
        : {
            bedId:
              input.bedId,
          }
    ),

    payload:
      input.after,
  });
}

export class CreateWardWorkflow {
  public constructor(
    private readonly support:
      InpatientCommandService,
  ) {}

  public async execute(
    command:
      LocationCommand<CreateWardInput>,
  ): Promise<
    WardRecord
  > {
    const input =
      createWardBodySchema.parse(
        command.input,
      );

    await this.support.assertAccess(
      command.actor,
      'WARD_MANAGE',
    );

    await this.support.assertClinicalDepartment(
      command.actor.facilityId,
      input.departmentId,
    );

    await this.support.assertServicePoint(
      command.actor.facilityId,
      input.departmentId,
      input.servicePointId,
    );

    const wardCode =
      this.support.normalizedCode(
        input.wardCode,
      );

    const normalizedName =
      this.support.normalizedText(
        input.name,
      );

    return this.support.dependencies
      .transactionManager.execute({
        transactionType:
          INPATIENT_TRANSACTION_TYPES
            .CREATE_WARD,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys:
          wardCreateLockKeys(
            command.actor.facilityId,
            wardCode,
            normalizedName,
          ),

        idempotencyPayload: {
          wardCode,
          normalizedName,
          departmentId:
            input.departmentId,
        },

        journalPayload:
          safeInpatientJournalPayload(
            'CREATE_WARD',
            {
              wardCode,
              departmentId:
                input.departmentId,
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
                .createWard({
                  facilityId:
                    toObjectId(
                      command.actor
                        .facilityId,
                      'facilityId',
                    ),

                  wardCode,

                  name:
                    this.support.displayText(
                      input.name,
                    ),

                  normalizedName,

                  wardType:
                    input.wardType,

                  departmentId:
                    toObjectId(
                      input.departmentId,
                      'departmentId',
                    ),

                  servicePointId:
                    input.servicePointId ==
                    null
                      ? null
                      : toObjectId(
                          input
                            .servicePointId,
                          'servicePointId',
                        ),

                  nursingStationCode:
                    input
                      .nursingStationCode ==
                    null
                      ? null
                      : this.support
                          .normalizedCode(
                            input
                              .nursingStationCode,
                          ),

                  description:
                    this.support.nullableText(
                      input.description,
                    ),

                  displayOrder:
                    input.displayOrder,

                  ...restrictionValues(
                    this.support,
                    input,
                  ),

                  status:
                    'ACTIVE',

                  activatedAt:
                    occurredAt,

                  activatedBy:
                    actorId,

                  deactivatedAt:
                    null,

                  deactivatedBy:
                    null,

                  deactivationReason:
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
                  `delete-ward:${created._id.toHexString()}`,
                  {
                    facilityId:
                      command.actor
                        .facilityId,

                    collection:
                      'wards',

                    entityId:
                      created._id
                        .toHexString(),

                    transactionId:
                      transaction
                        .transactionId,
                  },
                ),
              );

            await transaction.checkpoint(
              INPATIENT_TRANSACTION_STATES
                .CURRENT_PROJECTION_CREATED,
              {
                wardId:
                  created._id
                    .toHexString(),
              },
            );

            await completeLocationMutation(
              this.support,
              {
                actor:
                  command.actor,

                transactionId:
                  transaction
                    .transactionId,

                action:
                  INPATIENT_AUDIT_ACTIONS
                    .WARD_CREATED,

                eventType:
                  INPATIENT_OUTBOX_EVENTS
                    .WARD_CREATED,

                entityType:
                  'Ward',

                entityId:
                  created._id
                    .toHexString(),

                occurredAt,

                before:
                  null,

                after:
                  safeWardSnapshot(
                    created,
                  ),

                wardId:
                  created._id
                    .toHexString(),
              },
            );

            return created;
          },
      });
  }
}

export class UpdateWardWorkflow {
  public constructor(
    private readonly support:
      InpatientCommandService,
  ) {}

  public async execute(
    command:
      LocationEntityCommand<UpdateWardInput>,
  ): Promise<
    WardRecord
  > {
    const input =
      updateWardBodySchema.parse(
        command.input,
      );

    const current =
      await this.support.requireWard(
        command.actor,
        command.entityId,
      );

    this.support.assertExpectedVersion(
      current,
      input.expectedVersion,
      'WARD',
    );

    await this.support.assertAccess(
      command.actor,
      'WARD_MANAGE',
      {
        ward:
          current,
      },
    );

    const departmentId =
      input.departmentId ??
      current.departmentId.toHexString();

    await this.support.assertClinicalDepartment(
      command.actor.facilityId,
      departmentId,
    );

    await this.support.assertServicePoint(
      command.actor.facilityId,
      departmentId,
      input.servicePointId ===
        undefined
        ? current.servicePointId
            ?.toHexString() ??
          null
        : input.servicePointId,
    );

    return this.support.dependencies
      .transactionManager.execute({
        transactionType:
          INPATIENT_TRANSACTION_TYPES
            .UPDATE_WARD,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys:
          wardMutationLockKeys(
            command.actor.facilityId,
            command.entityId,
          ),

        idempotencyPayload: {
          wardId:
            command.entityId,

          expectedVersion:
            input.expectedVersion,

          input,
        },

        journalPayload:
          safeInpatientJournalPayload(
            'UPDATE_WARD',
            {
              wardId:
                command.entityId,

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

            await transaction
              .registerCompensation(
                restoreInpatientRecordCompensation(
                  `restore-ward:${current._id.toHexString()}`,
                  protectInpatientRestorePayload(
                    {
                      facilityId:
                        command.actor
                          .facilityId,

                      collection:
                        'wards',

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
                        wardRestoreSnapshot(
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

            const updated =
              await this.support.locations
                .updateWard(
                  command.actor
                    .facilityId,

                  command.entityId,

                  input.expectedVersion,

                  {
                    ...(
                      input.name ===
                      undefined
                        ? {}
                        : {
                            name:
                              this.support
                                .displayText(
                                  input.name,
                                ),

                            normalizedName:
                              this.support
                                .normalizedText(
                                  input.name,
                                ),
                          }
                    ),

                    ...(
                      input.wardType ===
                      undefined
                        ? {}
                        : {
                            wardType:
                              input
                                .wardType,
                          }
                    ),

                    ...(
                      input.departmentId ===
                      undefined
                        ? {}
                        : {
                            departmentId:
                              toObjectId(
                                input
                                  .departmentId,
                                'departmentId',
                              ),
                          }
                    ),

                    ...(
                      input.servicePointId ===
                      undefined
                        ? {}
                        : {
                            servicePointId:
                              input
                                .servicePointId ===
                              null
                                ? null
                                : toObjectId(
                                    input
                                      .servicePointId,
                                    'servicePointId',
                                  ),
                          }
                    ),

                    ...(
                      input
                        .nursingStationCode ===
                      undefined
                        ? {}
                        : {
                            nursingStationCode:
                              input
                                .nursingStationCode ===
                              null
                                ? null
                                : this.support
                                    .normalizedCode(
                                      input
                                        .nursingStationCode,
                                    ),
                          }
                    ),

                    ...(
                      input.description ===
                      undefined
                        ? {}
                        : {
                            description:
                              this.support
                                .nullableText(
                                  input
                                    .description,
                                ),
                          }
                    ),

                    ...(
                      input.displayOrder ===
                      undefined
                        ? {}
                        : {
                            displayOrder:
                              input
                                .displayOrder,
                          }
                    ),

                    ...(
                      input.permittedSexes ===
                      undefined
                        ? {}
                        : {
                            permittedSexes: [
                              ...input
                                .permittedSexes,
                            ],
                          }
                    ),

                    ...(
                      input.minimumAgeYears ===
                      undefined
                        ? {}
                        : {
                            minimumAgeYears:
                              input
                                .minimumAgeYears,
                          }
                    ),

                    ...(
                      input.maximumAgeYears ===
                      undefined
                        ? {}
                        : {
                            maximumAgeYears:
                              input
                                .maximumAgeYears,
                          }
                    ),

                    ...(
                      input.specialtyCodes ===
                      undefined
                        ? {}
                        : {
                            specialtyCodes:
                              this.support
                                .normalizedCodes(
                                  input
                                    .specialtyCodes,
                                ),
                          }
                    ),

                    ...(
                      input
                        .isolationCapabilities ===
                      undefined
                        ? {}
                        : {
                            isolationCapabilities: [
                              ...input
                                .isolationCapabilities,
                            ],
                          }
                    ),

                    ...(
                      input.infectionControlTags ===
                      undefined
                        ? {}
                        : {
                            infectionControlTags:
                              this.support
                                .normalizedCodes(
                                  input
                                    .infectionControlTags,
                                ),
                          }
                    ),

                    ...(
                      input.negativePressureCapable ===
                      undefined
                        ? {}
                        : {
                            negativePressureCapable:
                              input
                                .negativePressureCapable,
                          }
                    ),

                    ...(
                      input.cohortingAllowed ===
                      undefined
                        ? {}
                        : {
                            cohortingAllowed:
                              input
                                .cohortingAllowed,
                          }
                    ),

                    updatedBy:
                      toObjectId(
                        command.actor
                          .userId,
                        'actorUserId',
                      ),
                  },
                );

            if (
              updated === null
            ) {
              throw new InpatientWardConcurrencyError();
            }

            await transaction.checkpoint(
              INPATIENT_TRANSACTION_STATES
                .CURRENT_PROJECTION_UPDATED,
              {
                wardId:
                  updated._id
                    .toHexString(),
              },
            );

            await completeLocationMutation(
              this.support,
              {
                actor:
                  command.actor,

                transactionId:
                  transaction
                    .transactionId,

                action:
                  INPATIENT_AUDIT_ACTIONS
                    .WARD_UPDATED,

                eventType:
                  INPATIENT_OUTBOX_EVENTS
                    .WARD_UPDATED,

                entityType:
                  'Ward',

                entityId:
                  updated._id
                    .toHexString(),

                occurredAt,

                before:
                  safeWardSnapshot(
                    current,
                  ),

                after:
                  safeWardSnapshot(
                    updated,
                  ),

                wardId:
                  updated._id
                    .toHexString(),
              },
            );

            return updated;
          },
      });
  }
}

export class ChangeWardStatusWorkflow {
  public constructor(
    private readonly support:
      InpatientCommandService,
  ) {}

  public async execute(
    command:
      LocationEntityCommand<ChangeInpatientCatalogStatusInput>,
  ): Promise<
    WardRecord
  > {
    const input =
      changeInpatientCatalogStatusBodySchema
        .parse(
          command.input,
        );

    const current =
      await this.support.requireWard(
        command.actor,
        command.entityId,
      );

    this.support.assertExpectedVersion(
      current,
      input.expectedVersion,
      'WARD',
    );

    await this.support.assertAccess(
      command.actor,
      'WARD_MANAGE',
      {
        ward:
          current,
      },
    );

    if (
      current.status ===
      input.status
    ) {
      return current;
    }

    if (
      input.status ===
      'INACTIVE'
    ) {
      const [
        activeRooms,
        activeBeds,
      ] =
        await Promise.all([
          this.support.locations
            .listRooms(
              command.actor
                .facilityId,
              {
                page:
                  1,

                pageSize:
                  1,

                wardId:
                  current._id
                    .toHexString(),

                status:
                  'ACTIVE',

                sortBy:
                  'displayOrder',

                sortDirection:
                  'asc',
              },
            ),

          this.support.locations
            .listBeds(
              command.actor
                .facilityId,
              {
                page:
                  1,

                pageSize:
                  1,

                wardId:
                  current._id
                    .toHexString(),

                status:
                  'ACTIVE',

                sortBy:
                  'displayOrder',

                sortDirection:
                  'asc',
              },
            ),
        ]);

      if (
        activeRooms.total >
          0 ||
        activeBeds.total >
          0
      ) {
        throw new InpatientLocationInUseError(
          'ward',
        );
      }
    }

    return this.support.dependencies
      .transactionManager.execute({
        transactionType:
          INPATIENT_TRANSACTION_TYPES
            .CHANGE_WARD_STATUS,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys:
          wardMutationLockKeys(
            command.actor.facilityId,
            command.entityId,
          ),

        idempotencyPayload: {
          wardId:
            command.entityId,

          expectedVersion:
            input.expectedVersion,

          status:
            input.status,

          reason:
            input.reason,
        },

        journalPayload:
          safeInpatientJournalPayload(
            'CHANGE_WARD_STATUS',
            {
              wardId:
                command.entityId,

              fromStatus:
                current.status,

              toStatus:
                input.status,
            },
          ),

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              this.support.dependencies
                .clock.now();

            await transaction
              .registerCompensation(
                restoreInpatientRecordCompensation(
                  `restore-ward-status:${current._id.toHexString()}`,
                  protectInpatientRestorePayload(
                    {
                      facilityId:
                        command.actor
                          .facilityId,

                      collection:
                        'wards',

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
                        wardRestoreSnapshot(
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

            const updated =
              await this.support.locations
                .changeWardStatus(
                  command.actor
                    .facilityId,

                  command.entityId,

                  input.expectedVersion,

                  input.status,

                  command.actor
                    .userId,

                  input.reason,

                  occurredAt,
                );

            if (
              updated === null
            ) {
              throw new InpatientWardConcurrencyError();
            }

            await completeLocationMutation(
              this.support,
              {
                actor:
                  command.actor,

                transactionId:
                  transaction
                    .transactionId,

                action:
                  INPATIENT_AUDIT_ACTIONS
                    .WARD_STATUS_CHANGED,

                eventType:
                  INPATIENT_OUTBOX_EVENTS
                    .WARD_STATUS_CHANGED,

                entityType:
                  'Ward',

                entityId:
                  updated._id
                    .toHexString(),

                occurredAt,

                before:
                  safeWardSnapshot(
                    current,
                  ),

                after:
                  safeWardSnapshot(
                    updated,
                  ),

                wardId:
                  updated._id
                    .toHexString(),
              },
            );

            return updated;
          },
      });
  }
}

export class CreateRoomWorkflow {
  public constructor(
    private readonly support:
      InpatientCommandService,
  ) {}

  public async execute(
    command:
      LocationCommand<CreateRoomInput>,
  ): Promise<
    RoomRecord
  > {
    const input =
      createRoomBodySchema.parse(
        command.input,
      );

    const ward =
      await this.support.requireWard(
        command.actor,
        input.wardId,
      );

    await this.support.assertAccess(
      command.actor,
      'WARD_MANAGE',
      {
        ward,
      },
    );

    if (
      ward.status !==
      'ACTIVE'
    ) {
      throw new InpatientLocationHierarchyError(
        'Rooms may only be added to active wards',
      );
    }

    if (
      ward.departmentId.toHexString() !==
      input.departmentId
    ) {
      throw new InpatientLocationHierarchyError(
        'The room department must match the ward department',
      );
    }

    await this.support.assertServicePoint(
      command.actor.facilityId,
      input.departmentId,
      input.servicePointId,
    );

    const roomCode =
      this.support.normalizedCode(
        input.roomCode,
      );

    const roomNumber =
      this.support.normalizedCode(
        input.roomNumber,
      );

    return this.support.dependencies
      .transactionManager.execute({
        transactionType:
          INPATIENT_TRANSACTION_TYPES
            .CREATE_ROOM,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys:
          roomCreateLockKeys(
            command.actor.facilityId,
            input.wardId,
            roomCode,
            roomNumber,
          ),

        idempotencyPayload: {
          wardId:
            input.wardId,

          roomCode,

          roomNumber,
        },

        journalPayload:
          safeInpatientJournalPayload(
            'CREATE_ROOM',
            {
              wardId:
                input.wardId,

              roomCode,

              roomNumber,
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
                .createRoom({
                  facilityId:
                    toObjectId(
                      command.actor
                        .facilityId,
                      'facilityId',
                    ),

                  wardId:
                    ward._id,

                  departmentId:
                    ward.departmentId,

                  servicePointId:
                    input.servicePointId ==
                    null
                      ? null
                      : toObjectId(
                          input
                            .servicePointId,
                          'servicePointId',
                        ),

                  roomCode,

                  roomNumber,

                  name:
                    this.support.displayText(
                      input.name,
                    ),

                  normalizedName:
                    this.support.normalizedText(
                      input.name,
                    ),

                  roomType:
                    input.roomType,

                  roomClass:
                    input.roomClass,

                  capacity:
                    input.capacity,

                  floorCode:
                    input.floorCode ==
                    null
                      ? null
                      : this.support
                          .normalizedCode(
                            input
                              .floorCode,
                          ),

                  description:
                    this.support.nullableText(
                      input.description,
                    ),

                  displayOrder:
                    input.displayOrder,

                  ...restrictionValues(
                    this.support,
                    input,
                  ),

                  status:
                    'ACTIVE',

                  activatedAt:
                    occurredAt,

                  activatedBy:
                    actorId,

                  deactivatedAt:
                    null,

                  deactivatedBy:
                    null,

                  deactivationReason:
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
                  `delete-room:${created._id.toHexString()}`,
                  {
                    facilityId:
                      command.actor
                        .facilityId,

                    collection:
                      'rooms',

                    entityId:
                      created._id
                        .toHexString(),

                    transactionId:
                      transaction
                        .transactionId,
                  },
                ),
              );

            await completeLocationMutation(
              this.support,
              {
                actor:
                  command.actor,

                transactionId:
                  transaction
                    .transactionId,

                action:
                  INPATIENT_AUDIT_ACTIONS
                    .ROOM_CREATED,

                eventType:
                  INPATIENT_OUTBOX_EVENTS
                    .ROOM_CREATED,

                entityType:
                  'Room',

                entityId:
                  created._id
                    .toHexString(),

                occurredAt,

                before:
                  null,

                after:
                  safeRoomSnapshot(
                    created,
                  ),

                wardId:
                  created.wardId
                    .toHexString(),

                roomId:
                  created._id
                    .toHexString(),
              },
            );

            return created;
          },
      });
  }
}

export class UpdateRoomWorkflow {
  public constructor(
    private readonly support:
      InpatientCommandService,
  ) {}

  public async execute(
    command:
      LocationEntityCommand<UpdateRoomInput>,
  ): Promise<
    RoomRecord
  > {
    const input =
      updateRoomBodySchema.parse(
        command.input,
      );

    const current =
      await this.support.requireRoom(
        command.actor,
        command.entityId,
      );

    const ward =
      await this.support.requireWard(
        command.actor,
        current.wardId.toHexString(),
      );

    this.support.assertExpectedVersion(
      current,
      input.expectedVersion,
      'ROOM',
    );

    await this.support.assertAccess(
      command.actor,
      'WARD_MANAGE',
      {
        ward,
        room:
          current,
      },
    );

    const departmentId =
      input.departmentId ??
      current.departmentId.toHexString();

    if (
      departmentId !==
      ward.departmentId.toHexString()
    ) {
      throw new InpatientLocationHierarchyError(
        'The room department must match its ward department',
      );
    }

    await this.support.assertServicePoint(
      command.actor.facilityId,
      departmentId,
      input.servicePointId ===
        undefined
        ? current.servicePointId
            ?.toHexString() ??
          null
        : input.servicePointId,
    );

    return this.support.dependencies
      .transactionManager.execute({
        transactionType:
          INPATIENT_TRANSACTION_TYPES
            .UPDATE_ROOM,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys:
          roomMutationLockKeys(
            command.actor.facilityId,
            ward._id.toHexString(),
            current._id.toHexString(),
          ),

        idempotencyPayload: {
          roomId:
            command.entityId,

          expectedVersion:
            input.expectedVersion,

          input,
        },

        journalPayload:
          safeInpatientJournalPayload(
            'UPDATE_ROOM',
            {
              roomId:
                command.entityId,

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

            await transaction
              .registerCompensation(
                restoreInpatientRecordCompensation(
                  `restore-room:${current._id.toHexString()}`,
                  protectInpatientRestorePayload(
                    {
                      facilityId:
                        command.actor
                          .facilityId,

                      collection:
                        'rooms',

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
                        roomRestoreSnapshot(
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

            const updated =
              await this.support.locations
                .updateRoom(
                  command.actor
                    .facilityId,

                  command.entityId,

                  input.expectedVersion,

                  {
                    ...(
                      input.departmentId ===
                      undefined
                        ? {}
                        : {
                            departmentId:
                              toObjectId(
                                input
                                  .departmentId,
                                'departmentId',
                              ),
                          }
                    ),

                    ...(
                      input.servicePointId ===
                      undefined
                        ? {}
                        : {
                            servicePointId:
                              input
                                .servicePointId ===
                              null
                                ? null
                                : toObjectId(
                                    input
                                      .servicePointId,
                                    'servicePointId',
                                  ),
                          }
                    ),

                    ...(
                      input.roomNumber ===
                      undefined
                        ? {}
                        : {
                            roomNumber:
                              this.support
                                .normalizedCode(
                                  input
                                    .roomNumber,
                                ),
                          }
                    ),

                    ...(
                      input.name ===
                      undefined
                        ? {}
                        : {
                            name:
                              this.support
                                .displayText(
                                  input.name,
                                ),

                            normalizedName:
                              this.support
                                .normalizedText(
                                  input.name,
                                ),
                          }
                    ),

                    ...(
                      input.roomType ===
                      undefined
                        ? {}
                        : {
                            roomType:
                              input.roomType,
                          }
                    ),

                    ...(
                      input.roomClass ===
                      undefined
                        ? {}
                        : {
                            roomClass:
                              input.roomClass,
                          }
                    ),

                    ...(
                      input.capacity ===
                      undefined
                        ? {}
                        : {
                            capacity:
                              input.capacity,
                          }
                    ),

                    ...(
                      input.floorCode ===
                      undefined
                        ? {}
                        : {
                            floorCode:
                              input.floorCode ===
                              null
                                ? null
                                : this.support
                                    .normalizedCode(
                                      input
                                        .floorCode,
                                    ),
                          }
                    ),

                    ...(
                      input.description ===
                      undefined
                        ? {}
                        : {
                            description:
                              this.support
                                .nullableText(
                                  input
                                    .description,
                                ),
                          }
                    ),

                    ...(
                      input.displayOrder ===
                      undefined
                        ? {}
                        : {
                            displayOrder:
                              input
                                .displayOrder,
                          }
                    ),

                    ...(
                      input.permittedSexes ===
                      undefined
                        ? {}
                        : {
                            permittedSexes: [
                              ...input
                                .permittedSexes,
                            ],
                          }
                    ),

                    ...(
                      input.minimumAgeYears ===
                      undefined
                        ? {}
                        : {
                            minimumAgeYears:
                              input
                                .minimumAgeYears,
                          }
                    ),

                    ...(
                      input.maximumAgeYears ===
                      undefined
                        ? {}
                        : {
                            maximumAgeYears:
                              input
                                .maximumAgeYears,
                          }
                    ),

                    ...(
                      input.specialtyCodes ===
                      undefined
                        ? {}
                        : {
                            specialtyCodes:
                              this.support
                                .normalizedCodes(
                                  input
                                    .specialtyCodes,
                                ),
                          }
                    ),

                    ...(
                      input
                        .isolationCapabilities ===
                      undefined
                        ? {}
                        : {
                            isolationCapabilities: [
                              ...input
                                .isolationCapabilities,
                            ],
                          }
                    ),

                    ...(
                      input.infectionControlTags ===
                      undefined
                        ? {}
                        : {
                            infectionControlTags:
                              this.support
                                .normalizedCodes(
                                  input
                                    .infectionControlTags,
                                ),
                          }
                    ),

                    ...(
                      input.negativePressureCapable ===
                      undefined
                        ? {}
                        : {
                            negativePressureCapable:
                              input
                                .negativePressureCapable,
                          }
                    ),

                    ...(
                      input.cohortingAllowed ===
                      undefined
                        ? {}
                        : {
                            cohortingAllowed:
                              input
                                .cohortingAllowed,
                          }
                    ),

                    updatedBy:
                      toObjectId(
                        command.actor
                          .userId,
                        'actorUserId',
                      ),
                  },
                );

            if (
              updated === null
            ) {
              throw new InpatientRoomConcurrencyError();
            }

            await completeLocationMutation(
              this.support,
              {
                actor:
                  command.actor,

                transactionId:
                  transaction
                    .transactionId,

                action:
                  INPATIENT_AUDIT_ACTIONS
                    .ROOM_UPDATED,

                eventType:
                  INPATIENT_OUTBOX_EVENTS
                    .ROOM_UPDATED,

                entityType:
                  'Room',

                entityId:
                  updated._id
                    .toHexString(),

                occurredAt,

                before:
                  safeRoomSnapshot(
                    current,
                  ),

                after:
                  safeRoomSnapshot(
                    updated,
                  ),

                wardId:
                  updated.wardId
                    .toHexString(),

                roomId:
                  updated._id
                    .toHexString(),
              },
            );

            return updated;
          },
      });
  }
}

export class ChangeRoomStatusWorkflow {
  public constructor(
    private readonly support:
      InpatientCommandService,
  ) {}

  public async execute(
    command:
      LocationEntityCommand<ChangeInpatientCatalogStatusInput>,
  ): Promise<
    RoomRecord
  > {
    const input =
      changeInpatientCatalogStatusBodySchema
        .parse(
          command.input,
        );

    const current =
      await this.support.requireRoom(
        command.actor,
        command.entityId,
      );

    const ward =
      await this.support.requireWard(
        command.actor,
        current.wardId.toHexString(),
      );

    this.support.assertExpectedVersion(
      current,
      input.expectedVersion,
      'ROOM',
    );

    await this.support.assertAccess(
      command.actor,
      'WARD_MANAGE',
      {
        ward,
        room:
          current,
      },
    );

    if (
      current.status ===
      input.status
    ) {
      return current;
    }

    if (
      input.status ===
      'ACTIVE' &&
      ward.status !==
      'ACTIVE'
    ) {
      throw new InpatientLocationHierarchyError(
        'A room cannot be activated while its ward is inactive',
      );
    }

    if (
      input.status ===
      'INACTIVE'
    ) {
      const activeBeds =
        await this.support.locations
          .listBeds(
            command.actor.facilityId,
            {
              page:
                1,

              pageSize:
                1,

              roomId:
                current._id
                  .toHexString(),

              status:
                'ACTIVE',

              sortBy:
                'displayOrder',

              sortDirection:
                'asc',
            },
          );

      if (
        activeBeds.total >
        0
      ) {
        throw new InpatientLocationInUseError(
          'room',
        );
      }
    }

    return this.support.dependencies
      .transactionManager.execute({
        transactionType:
          INPATIENT_TRANSACTION_TYPES
            .CHANGE_ROOM_STATUS,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys:
          roomMutationLockKeys(
            command.actor.facilityId,
            ward._id.toHexString(),
            current._id.toHexString(),
          ),

        idempotencyPayload: {
          roomId:
            command.entityId,

          expectedVersion:
            input.expectedVersion,

          status:
            input.status,

          reason:
            input.reason,
        },

        journalPayload:
          safeInpatientJournalPayload(
            'CHANGE_ROOM_STATUS',
            {
              roomId:
                command.entityId,

              fromStatus:
                current.status,

              toStatus:
                input.status,
            },
          ),

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              this.support.dependencies
                .clock.now();

            await transaction
              .registerCompensation(
                restoreInpatientRecordCompensation(
                  `restore-room-status:${current._id.toHexString()}`,
                  protectInpatientRestorePayload(
                    {
                      facilityId:
                        command.actor
                          .facilityId,

                      collection:
                        'rooms',

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
                        roomRestoreSnapshot(
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

            const updated =
              await this.support.locations
                .changeRoomStatus(
                  command.actor
                    .facilityId,

                  current._id
                    .toHexString(),

                  input.expectedVersion,

                  input.status,

                  command.actor
                    .userId,

                  input.reason,

                  occurredAt,
                );

            if (
              updated === null
            ) {
              throw new InpatientRoomConcurrencyError();
            }

            await completeLocationMutation(
              this.support,
              {
                actor:
                  command.actor,

                transactionId:
                  transaction
                    .transactionId,

                action:
                  INPATIENT_AUDIT_ACTIONS
                    .ROOM_STATUS_CHANGED,

                eventType:
                  INPATIENT_OUTBOX_EVENTS
                    .ROOM_STATUS_CHANGED,

                entityType:
                  'Room',

                entityId:
                  updated._id
                    .toHexString(),

                occurredAt,

                before:
                  safeRoomSnapshot(
                    current,
                  ),

                after:
                  safeRoomSnapshot(
                    updated,
                  ),

                wardId:
                  updated.wardId
                    .toHexString(),

                roomId:
                  updated._id
                    .toHexString(),
              },
            );

            return updated;
          },
      });
  }
}

export class CreateBedWorkflow {
  public constructor(
    private readonly support:
      InpatientCommandService,
  ) {}

  public async execute(
    command:
      LocationCommand<CreateBedInput>,
  ): Promise<
    BedRecord
  > {
    const input =
      createBedBodySchema.parse(
        command.input,
      );

    const [
      ward,
      room,
    ] =
      await Promise.all([
        this.support.requireWard(
          command.actor,
          input.wardId,
        ),

        this.support.requireRoom(
          command.actor,
          input.roomId,
        ),
      ]);

    this.support.assertRoomHierarchy(
      ward,
      room,
    );

    await this.support.assertAccess(
      command.actor,
      'BED_MANAGE',
      {
        ward,
        room,
      },
    );

    if (
      ward.status !==
        'ACTIVE' ||
      room.status !==
        'ACTIVE'
    ) {
      throw new InpatientLocationHierarchyError(
        'Beds may only be added to active rooms and wards',
      );
    }

    if (
      input.departmentId !==
      ward.departmentId.toHexString()
    ) {
      throw new InpatientLocationHierarchyError(
        'The bed department must match the ward and room department',
      );
    }

    await this.support.assertServicePoint(
      command.actor.facilityId,
      input.departmentId,
      input.servicePointId,
    );

    const bedCode =
      this.support.normalizedCode(
        input.bedCode,
      );

    const bedNumber =
      this.support.normalizedCode(
        input.bedNumber,
      );

    return this.support.dependencies
      .transactionManager.execute({
        transactionType:
          INPATIENT_TRANSACTION_TYPES
            .CREATE_BED,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys:
          bedCreateLockKeys(
            command.actor.facilityId,
            input.wardId,
            input.roomId,
            bedCode,
            bedNumber,
          ),

        idempotencyPayload: {
          wardId:
            input.wardId,

          roomId:
            input.roomId,

          bedCode,

          bedNumber,
        },

        journalPayload:
          safeInpatientJournalPayload(
            'CREATE_BED',
            {
              wardId:
                input.wardId,

              roomId:
                input.roomId,

              bedCode,

              bedNumber,
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
                .createBed({
                  facilityId:
                    toObjectId(
                      command.actor
                        .facilityId,
                      'facilityId',
                    ),

                  wardId:
                    ward._id,

                  roomId:
                    room._id,

                  departmentId:
                    ward.departmentId,

                  servicePointId:
                    input.servicePointId ==
                    null
                      ? null
                      : toObjectId(
                          input
                            .servicePointId,
                          'servicePointId',
                        ),

                  bedCode,

                  bedNumber,

                  label:
                    this.support.displayText(
                      input.label,
                    ),

                  normalizedLabel:
                    this.support.normalizedText(
                      input.label,
                    ),

                  bedCategory:
                    input.bedCategory,

                  operationalStatus:
                    'AVAILABLE',

                  operationalStatusChangedAt:
                    occurredAt,

                  operationalStatusChangedBy:
                    actorId,

                  operationalStatusReasonCode:
                    'ACTIVATED',

                  operationalStatusReason:
                    null,

                  currentAdmissionId:
                    null,

                  currentAssignmentId:
                    null,

                  currentPatientId:
                    null,

                  activeHoldId:
                    null,

                  lastReleasedAt:
                    null,

                  turnaroundRequiredAfterRelease:
                    input
                      .turnaroundRequiredAfterRelease,

                  maintenanceReference:
                    null,

                  displayOrder:
                    input.displayOrder,

                  ...restrictionValues(
                    this.support,
                    input,
                  ),

                  status:
                    'ACTIVE',

                  activatedAt:
                    occurredAt,

                  activatedBy:
                    actorId,

                  deactivatedAt:
                    null,

                  deactivatedBy:
                    null,

                  deactivationReason:
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
                  `delete-bed:${created._id.toHexString()}`,
                  {
                    facilityId:
                      command.actor
                        .facilityId,

                    collection:
                      'beds',

                    entityId:
                      created._id
                        .toHexString(),

                    transactionId:
                      transaction
                        .transactionId,
                  },
                ),
              );

            await completeLocationMutation(
              this.support,
              {
                actor:
                  command.actor,

                transactionId:
                  transaction
                    .transactionId,

                action:
                  INPATIENT_AUDIT_ACTIONS
                    .BED_CREATED,

                eventType:
                  INPATIENT_OUTBOX_EVENTS
                    .BED_CREATED,

                entityType:
                  'Bed',

                entityId:
                  created._id
                    .toHexString(),

                occurredAt,

                before:
                  null,

                after:
                  safeBedSnapshot(
                    created,
                  ),

                wardId:
                  created.wardId
                    .toHexString(),

                roomId:
                  created.roomId
                    .toHexString(),

                bedId:
                  created._id
                    .toHexString(),
              },
            );

            return created;
          },
      });
  }
}

export class UpdateBedWorkflow {
  public constructor(
    private readonly support:
      InpatientCommandService,
  ) {}

  public async execute(
    command:
      LocationEntityCommand<UpdateBedInput>,
  ): Promise<
    BedRecord
  > {
    const input =
      updateBedBodySchema.parse(
        command.input,
      );

    const current =
      await this.support.requireBed(
        command.actor,
        command.entityId,
      );

    const [
      ward,
      room,
    ] =
      await Promise.all([
        this.support.requireWard(
          command.actor,
          current.wardId.toHexString(),
        ),

        this.support.requireRoom(
          command.actor,
          current.roomId.toHexString(),
        ),
      ]);

    this.support.assertBedHierarchy(
      ward,
      room,
      current,
    );

    this.support.assertExpectedVersion(
      current,
      input.expectedVersion,
      'BED',
    );

    await this.support.assertAccess(
      command.actor,
      'BED_MANAGE',
      {
        ward,
        room,
        bed:
          current,
      },
    );

    const departmentId =
      input.departmentId ??
      current.departmentId.toHexString();

    if (
      departmentId !==
      ward.departmentId.toHexString()
    ) {
      throw new InpatientLocationHierarchyError(
        'The bed department must match its ward and room department',
      );
    }

    await this.support.assertServicePoint(
      command.actor.facilityId,
      departmentId,
      input.servicePointId ===
        undefined
        ? current.servicePointId
            ?.toHexString() ??
          null
        : input.servicePointId,
    );

    return this.support.dependencies
      .transactionManager.execute({
        transactionType:
          INPATIENT_TRANSACTION_TYPES
            .UPDATE_BED,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys:
          bedMutationLockKeys(
            command.actor.facilityId,
            ward._id.toHexString(),
            room._id.toHexString(),
            current._id.toHexString(),
          ),

        idempotencyPayload: {
          bedId:
            command.entityId,

          expectedVersion:
            input.expectedVersion,

          input,
        },

        journalPayload:
          safeInpatientJournalPayload(
            'UPDATE_BED',
            {
              bedId:
                command.entityId,

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

            await transaction
              .registerCompensation(
                restoreInpatientRecordCompensation(
                  `restore-bed:${current._id.toHexString()}`,
                  protectInpatientRestorePayload(
                    {
                      facilityId:
                        command.actor
                          .facilityId,

                      collection:
                        'beds',

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
                        bedRestoreSnapshot(
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

            const updated =
              await this.support.locations
                .updateBed(
                  command.actor
                    .facilityId,

                  command.entityId,

                  input.expectedVersion,

                  {
                    ...(
                      input.departmentId ===
                      undefined
                        ? {}
                        : {
                            departmentId:
                              toObjectId(
                                input
                                  .departmentId,
                                'departmentId',
                              ),
                          }
                    ),

                    ...(
                      input.servicePointId ===
                      undefined
                        ? {}
                        : {
                            servicePointId:
                              input
                                .servicePointId ===
                              null
                                ? null
                                : toObjectId(
                                    input
                                      .servicePointId,
                                    'servicePointId',
                                  ),
                          }
                    ),

                    ...(
                      input.bedNumber ===
                      undefined
                        ? {}
                        : {
                            bedNumber:
                              this.support
                                .normalizedCode(
                                  input
                                    .bedNumber,
                                ),
                          }
                    ),

                    ...(
                      input.label ===
                      undefined
                        ? {}
                        : {
                            label:
                              this.support
                                .displayText(
                                  input.label,
                                ),

                            normalizedLabel:
                              this.support
                                .normalizedText(
                                  input.label,
                                ),
                          }
                    ),

                    ...(
                      input.bedCategory ===
                      undefined
                        ? {}
                        : {
                            bedCategory:
                              input
                                .bedCategory,
                          }
                    ),

                    ...(
                      input
                        .turnaroundRequiredAfterRelease ===
                      undefined
                        ? {}
                        : {
                            turnaroundRequiredAfterRelease:
                              input
                                .turnaroundRequiredAfterRelease,
                          }
                    ),

                    ...(
                      input.displayOrder ===
                      undefined
                        ? {}
                        : {
                            displayOrder:
                              input
                                .displayOrder,
                          }
                    ),

                    ...(
                      input.permittedSexes ===
                      undefined
                        ? {}
                        : {
                            permittedSexes: [
                              ...input
                                .permittedSexes,
                            ],
                          }
                    ),

                    ...(
                      input.minimumAgeYears ===
                      undefined
                        ? {}
                        : {
                            minimumAgeYears:
                              input
                                .minimumAgeYears,
                          }
                    ),

                    ...(
                      input.maximumAgeYears ===
                      undefined
                        ? {}
                        : {
                            maximumAgeYears:
                              input
                                .maximumAgeYears,
                          }
                    ),

                    ...(
                      input.specialtyCodes ===
                      undefined
                        ? {}
                        : {
                            specialtyCodes:
                              this.support
                                .normalizedCodes(
                                  input
                                    .specialtyCodes,
                                ),
                          }
                    ),

                    ...(
                      input
                        .isolationCapabilities ===
                      undefined
                        ? {}
                        : {
                            isolationCapabilities: [
                              ...input
                                .isolationCapabilities,
                            ],
                          }
                    ),

                    ...(
                      input.infectionControlTags ===
                      undefined
                        ? {}
                        : {
                            infectionControlTags:
                              this.support
                                .normalizedCodes(
                                  input
                                    .infectionControlTags,
                                ),
                          }
                    ),

                    ...(
                      input.negativePressureCapable ===
                      undefined
                        ? {}
                        : {
                            negativePressureCapable:
                              input
                                .negativePressureCapable,
                          }
                    ),

                    ...(
                      input.cohortingAllowed ===
                      undefined
                        ? {}
                        : {
                            cohortingAllowed:
                              input
                                .cohortingAllowed,
                          }
                    ),

                    updatedBy:
                      toObjectId(
                        command.actor
                          .userId,
                        'actorUserId',
                      ),
                  },
                );

            if (
              updated === null
            ) {
              throw new InpatientBedConcurrencyError();
            }

            await completeLocationMutation(
              this.support,
              {
                actor:
                  command.actor,

                transactionId:
                  transaction
                    .transactionId,

                action:
                  INPATIENT_AUDIT_ACTIONS
                    .BED_UPDATED,

                eventType:
                  INPATIENT_OUTBOX_EVENTS
                    .BED_UPDATED,

                entityType:
                  'Bed',

                entityId:
                  updated._id
                    .toHexString(),

                occurredAt,

                before:
                  safeBedSnapshot(
                    current,
                  ),

                after:
                  safeBedSnapshot(
                    updated,
                  ),

                wardId:
                  updated.wardId
                    .toHexString(),

                roomId:
                  updated.roomId
                    .toHexString(),

                bedId:
                  updated._id
                    .toHexString(),
              },
            );

            return updated;
          },
      });
  }
}

export class ChangeBedCatalogStatusWorkflow {
  public constructor(
    private readonly support:
      InpatientCommandService,
  ) {}

  public async execute(
    command:
      LocationEntityCommand<ChangeInpatientCatalogStatusInput>,
  ): Promise<
    BedRecord
  > {
    const input =
      changeInpatientCatalogStatusBodySchema
        .parse(
          command.input,
        );

    const current =
      await this.support.requireBed(
        command.actor,
        command.entityId,
      );

    const [
      ward,
      room,
    ] =
      await Promise.all([
        this.support.requireWard(
          command.actor,
          current.wardId.toHexString(),
        ),

        this.support.requireRoom(
          command.actor,
          current.roomId.toHexString(),
        ),
      ]);

    this.support.assertBedHierarchy(
      ward,
      room,
      current,
    );

    this.support.assertExpectedVersion(
      current,
      input.expectedVersion,
      'BED',
    );

    await this.support.assertAccess(
      command.actor,
      'BED_MANAGE',
      {
        ward,
        room,
        bed:
          current,
      },
    );

    if (
      current.status ===
      input.status
    ) {
      return current;
    }

    if (
      input.status ===
      'ACTIVE' &&
      (
        ward.status !==
          'ACTIVE' ||
        room.status !==
          'ACTIVE'
      )
    ) {
      throw new InpatientLocationHierarchyError(
        'A bed cannot be activated while its room or ward is inactive',
      );
    }

    if (
      input.status ===
        'INACTIVE' &&
      (
        current.operationalStatus ===
          'RESERVED' ||
        current.operationalStatus ===
          'OCCUPIED' ||
        current.currentAdmissionId !==
          null ||
        current.currentAssignmentId !==
          null ||
        current.activeHoldId !==
          null
      )
    ) {
      throw new InpatientLocationInUseError(
        'bed',
      );
    }

    return this.support.dependencies
      .transactionManager.execute({
        transactionType:
          INPATIENT_TRANSACTION_TYPES
            .CHANGE_BED_CATALOG_STATUS,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys:
          bedMutationLockKeys(
            command.actor.facilityId,
            ward._id.toHexString(),
            room._id.toHexString(),
            current._id.toHexString(),
          ),

        idempotencyPayload: {
          bedId:
            command.entityId,

          expectedVersion:
            input.expectedVersion,

          status:
            input.status,

          reason:
            input.reason,
        },

        journalPayload:
          safeInpatientJournalPayload(
            'CHANGE_BED_CATALOG_STATUS',
            {
              bedId:
                command.entityId,

              fromStatus:
                current.status,

              toStatus:
                input.status,
            },
          ),

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              this.support.dependencies
                .clock.now();

            await transaction
              .registerCompensation(
                restoreInpatientRecordCompensation(
                  `restore-bed-status:${current._id.toHexString()}`,
                  protectInpatientRestorePayload(
                    {
                      facilityId:
                        command.actor
                          .facilityId,

                      collection:
                        'beds',

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
                        bedRestoreSnapshot(
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

            const updated =
              await this.support.locations
                .changeBedCatalogStatus(
                  command.actor
                    .facilityId,

                  current._id
                    .toHexString(),

                  input.expectedVersion,

                  input.status,

                  command.actor
                    .userId,

                  input.reason,

                  occurredAt,
                );

            if (
              updated === null
            ) {
              throw new InpatientBedConcurrencyError();
            }

            await completeLocationMutation(
              this.support,
              {
                actor:
                  command.actor,

                transactionId:
                  transaction
                    .transactionId,

                action:
                  INPATIENT_AUDIT_ACTIONS
                    .BED_CATALOG_STATUS_CHANGED,

                eventType:
                  INPATIENT_OUTBOX_EVENTS
                    .BED_CATALOG_STATUS_CHANGED,

                entityType:
                  'Bed',

                entityId:
                  updated._id
                    .toHexString(),

                occurredAt,

                before:
                  safeBedSnapshot(
                    current,
                  ),

                after:
                  safeBedSnapshot(
                    updated,
                  ),

                wardId:
                  updated.wardId
                    .toHexString(),

                roomId:
                  updated.roomId
                    .toHexString(),

                bedId:
                  updated._id
                    .toHexString(),
              },
            );

            return updated;
          },
      });
  }
}