import {
  Types,
} from 'mongoose';

import {
  Decimal128,
  toObjectId,
} from '@hospital-mis/database';

import {
  ConcurrencyConflictError,
  ConflictError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import {
  RADIOLOGY_LOCK_NAMESPACE,
  RADIOLOGY_NUMBER_SEQUENCE_NAMESPACE,
  RADIOLOGY_TRANSACTION_TYPES,
} from '../radiology.constants.js';

import {
  assertRadiologyExaminationReady,
  assertRadiologyOrderItemTransition,
  assertRadiologyOrderTransition,
} from '../radiology.lifecycle.js';

import {
  buildRadiologySequenceKey,
  formatRadiologyNumber,
  normalizeRadiologyCode,
  normalizeRadiologyText,
  radiologyContentHash,
  uniqueRadiologyObjectIdStrings,
  uniqueRadiologyStrings,
} from '../radiology.normalization.js';

import type {
  RadiologyOrderItemRecord,
  RadiologyOrderRecord,
} from '../radiology.persistence.types.js';

import type {
  RadiologyActorContext,
} from '../radiology.types.js';

import type {
  RadiologyImagingGatewayPort,
  RadiologyInventoryUsageBoundaryPort,
  RadiologyOperationsRepositoryPort,
  RadiologyReservationSubject,
  RadiologyResourceReservationRecord,
} from '../radiology-operations.ports.js';

import type {
  CancelRadiologyAppointmentInput,
  ChangeRadiologyResourceStatusInput,
  CheckInRadiologyExaminationInput,
  CompleteRadiologyExaminationInput,
  CreateRadiologyResourceInput,
  RadiologyAppointmentCommand,
  RadiologyOperationsCommand,
  RadiologyResourceCommand,
  RecordRadiologySafetyScreeningInput,
  RegisterRadiologyImagingStudyInput,
  ScheduleRadiologyAppointmentInput,
  StartRadiologyExaminationInput,
} from '../radiology-operations.types.js';

import {
  cancelRadiologyAppointmentBodySchema,
  changeRadiologyResourceStatusBodySchema,
  checkInRadiologyExaminationBodySchema,
  completeRadiologyExaminationBodySchema,
  createRadiologyResourceBodySchema,
  recordRadiologySafetyScreeningBodySchema,
  registerRadiologyImagingStudyBodySchema,
  scheduleRadiologyAppointmentBodySchema,
  startRadiologyExaminationBodySchema,
} from '../radiology-operations.validation.js';

import {
  deleteCreatedRadiologyRecordCompensation,
  deleteCreatedRadiologyRecordSetCompensation,
  protectRadiologyRestorePayload,
  radiologyOrderItemRestoreSnapshot,
  radiologyOrderRestoreSnapshot,
  restoreRadiologyRecordCompensation,
} from '../radiology.mutation-snapshots.js';

import {
  RADIOLOGY_AUDIT_ACTIONS,
  RADIOLOGY_OUTBOX_EVENTS,
  RADIOLOGY_REALTIME_EVENTS,
  RADIOLOGY_TRANSACTION_STATES,
} from '../radiology.transaction.constants.js';

import {
  radiologyLockKey,
  safeRadiologyOrderEventPayload,
  safeRadiologyOrderJournalPayload,
} from '../radiology.workflow-helpers.js';

import {
  RadiologyCommandService,
} from './radiology-command.service.js';

class RadiologyResourceNotFoundError
  extends ResourceNotFoundError
{
  public constructor() {
    super('Radiology resource was not found');
  }
}

class RadiologyAppointmentNotFoundError
  extends ResourceNotFoundError
{
  public constructor() {
    super('Radiology appointment was not found');
  }
}

class RadiologyExaminationNotFoundError
  extends ResourceNotFoundError
{
  public constructor() {
    super('Radiology examination was not found');
  }
}

class RadiologySchedulingConflictError
  extends ConflictError
{
  public constructor() {
    super(
      'The requested Radiology room, equipment, or technician allocation conflicts with an active reservation',
    );
  }
}

class RadiologyOperationsConcurrencyError
  extends ConcurrencyConflictError
{
  public constructor() {
    super(
      'The Radiology operational record changed before the operation could be completed',
    );
  }
}

class RadiologyExternalStudyConflictError
  extends ConflictError
{
  public constructor(message: string) {
    super(message);
  }
}

function recordSnapshot(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const snapshot = {
    ...record,
  };

  delete snapshot['_id'];
  delete snapshot['createdAt'];

  return snapshot;
}

function safeResourceSnapshot(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const modalityIds =
    record['modalityIds'] as Array<{
      toHexString(): string;
    }>;

  return {
    resourceId: (
      record['_id'] as {
        toHexString(): string;
      }
    ).toHexString(),
    resourceCode: record['resourceCode'],
    name: record['name'],
    resourceType: record['resourceType'],
    departmentId: (
      record['departmentId'] as {
        toHexString(): string;
      }
    ).toHexString(),
    modalityIds: modalityIds.map((id) =>
      id.toHexString(),
    ),
    status: record['status'],
    version: record['version'],
  };
}

function safeAppointmentSnapshot(
  record: Record<string, unknown>,
): Record<string, unknown> {
  return {
    appointmentId: (
      record['_id'] as {
        toHexString(): string;
      }
    ).toHexString(),
    orderId: (
      record['radiologyOrderId'] as {
        toHexString(): string;
      }
    ).toHexString(),
    orderItemId: (
      record['radiologyOrderItemId'] as {
        toHexString(): string;
      }
    ).toHexString(),
    modalityId: (
      record['modalityId'] as {
        toHexString(): string;
      }
    ).toHexString(),
    departmentId: (
      record['departmentId'] as {
        toHexString(): string;
      }
    ).toHexString(),
    scheduledStartAt: (
      record['scheduledStartAt'] as Date
    ).toISOString(),
    scheduledEndAt: (
      record['scheduledEndAt'] as Date
    ).toISOString(),
    resourceCount:
      (record['roomResourceId'] == null ? 0 : 1) +
      (
        record[
          'equipmentResourceIds'
        ] as unknown[]
      ).length,
    technicianCount: (
      record['technicianStaffIds'] as unknown[]
    ).length,
    status: record['status'],
    version: record['version'],
  };
}

function safeScreeningSnapshot(
  record: Record<string, unknown>,
): Record<string, unknown> {
  return {
    screeningId: (
      record['_id'] as {
        toHexString(): string;
      }
    ).toHexString(),
    orderItemId: (
      record['radiologyOrderItemId'] as {
        toHexString(): string;
      }
    ).toHexString(),
    requiredScreeningCount: (
      record[
        'requiredScreeningCodesSnapshot'
      ] as unknown[]
    ).length,
    responseCount: (
      record['responses'] as unknown[]
    ).length,
    conditionCount: (
      record['conditions'] as unknown[]
    ).length,
    status: record['status'],
    preparationStatus:
      record['preparationStatus'],
    reviewed: record['reviewedAt'] != null,
    version: record['version'],
  };
}

function safeExaminationSnapshot(
  record: Record<string, unknown>,
): Record<string, unknown> {
  return {
    examinationId: (
      record['_id'] as {
        toHexString(): string;
      }
    ).toHexString(),
    orderItemId: (
      record['radiologyOrderItemId'] as {
        toHexString(): string;
      }
    ).toHexString(),
    status: record['status'],
    technicianCount: (
      record['technicianStaffIds'] as unknown[]
    ).length,
    contrastAdministered:
      record['contrastAdministered'],
    contrastUsageLinked:
      record['contrastUsageReference'] != null,
    version: record['version'],
  };
}

function safeStudySnapshot(
  record: Record<string, unknown>,
): Record<string, unknown> {
  return {
    studyId: (
      record['_id'] as {
        toHexString(): string;
      }
    ).toHexString(),
    orderItemId: (
      record['radiologyOrderItemId'] as {
        toHexString(): string;
      }
    ).toHexString(),
    status: record['status'],
    modalityCode:
      record['modalityCodeSnapshot'],
    seriesCount: record['seriesCount'],
    instanceCount: record['instanceCount'],
    externalReferenceCount: (
      record['externalReferences'] as unknown[]
    ).length,
    binaryStorageProhibited:
      record['binaryStorageProhibited'],
    version: record['version'],
  };
}

export class RadiologyImagingOperationsService {
  public constructor(
    private readonly support:
      RadiologyCommandService,

    private readonly operations:
      RadiologyOperationsRepositoryPort,

    private readonly imagingGateway:
      RadiologyImagingGatewayPort,

    private readonly inventoryUsage:
      RadiologyInventoryUsageBoundaryPort,
  ) {}

  public async createResource(
    command:
      RadiologyOperationsCommand<CreateRadiologyResourceInput>,
  ) {
    const input =
      createRadiologyResourceBodySchema.parse(
        command.input,
      );

    await this.support.assertAccess(
      command.actor,
      'SCHEDULE_MANAGE',
    );

    const resourceCode =
      normalizeRadiologyCode(
        input.resourceCode,
      );

    const normalizedName =
      normalizeRadiologyText(
        input.name,
      );

    return this.support.dependencies.transactionManager.execute(
      {
        transactionType:
          'RADIOLOGY_RESOURCE_CREATE',

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          radiologyLockKey(
            RADIOLOGY_LOCK_NAMESPACE.RESOURCE,
            command.actor.facilityId,
            'code',
            resourceCode,
          ),

          radiologyLockKey(
            RADIOLOGY_LOCK_NAMESPACE.RESOURCE,
            command.actor.facilityId,
            'name',
            normalizedName,
          ),
        ],

        idempotencyPayload: {
          resourceCode,
          normalizedName,
        },

        journalPayload: {
          operation:
            'CREATE_RESOURCE',

          resourceCode,

          resourceType:
            input.resourceType,
        },

        execute: async (transaction) => {
          const occurredAt =
            this.support.dependencies.clock.now();

          const actorId =
            toObjectId(
              command.actor.userId,
              'actorUserId',
            );

          const resource =
            await this.operations.createResource(
              {
                _id:
                  new Types.ObjectId(),

                facilityId:
                  toObjectId(
                    command.actor.facilityId,
                    'facilityId',
                  ),

                resourceCode,

                name:
                  input.name.trim(),

                normalizedName,

                resourceType:
                  input.resourceType,

                departmentId:
                  toObjectId(
                    input.departmentId,
                    'departmentId',
                  ),

                modalityIds:
                  uniqueRadiologyObjectIdStrings(
                    input.modalityIds,
                  ).map(
                    (id) =>
                      toObjectId(
                        id,
                        'modalityIds',
                      ),
                  ),

                location:
                  input.location?.trim() ??
                  null,

                capabilities:
                  uniqueRadiologyStrings(
                    input.capabilities,
                  ).map(
                    normalizeRadiologyCode,
                  ),

                manufacturer:
                  input.manufacturer?.trim() ??
                  null,

                modelName:
                  input.modelName?.trim() ??
                  null,

                serialNumber:
                  input.serialNumber?.trim() ??
                  null,

                externalResourceReference:
                  input.externalResourceReference?.trim() ??
                  null,

                status:
                  'ACTIVE',

                effectiveFrom:
                  input.effectiveFrom ===
                  undefined
                    ? occurredAt
                    : new Date(
                        input.effectiveFrom,
                      ),

                effectiveThrough:
                  input.effectiveThrough ==
                  null
                    ? null
                    : new Date(
                        input.effectiveThrough,
                      ),

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
                  actorId,

                updatedBy:
                  actorId,
              },
            );

          await transaction.registerCompensation(
            deleteCreatedRadiologyRecordCompensation(
              `delete-radiology-resource:${resource._id.toHexString()}`,
              {
                facilityId:
                  command.actor.facilityId,

                collection:
                  'radiologyResources',

                entityId:
                  resource._id.toHexString(),

                transactionId:
                  transaction.transactionId,
              },
            ),
          );

          await this.emit(
            command.actor,
            transaction.transactionId,
            occurredAt,
            RADIOLOGY_AUDIT_ACTIONS.RESOURCE_CREATED,
            RADIOLOGY_OUTBOX_EVENTS.RESOURCE_CREATED,
            'RadiologyResource',
            resource._id.toHexString(),
            safeResourceSnapshot(
              resource as unknown as Record<
                string,
                unknown
              >,
            ),
            RADIOLOGY_REALTIME_EVENTS.SCHEDULE_CHANGED,
          );

          return resource;
        },
      },
    );
  }

  public async changeResourceStatus(
    command:
      RadiologyResourceCommand<ChangeRadiologyResourceStatusInput>,
  ) {
    const input =
      changeRadiologyResourceStatusBodySchema.parse(
        command.input,
      );

    await this.support.assertAccess(
      command.actor,
      'SCHEDULE_MANAGE',
    );

    const current =
      await this.operations.findResourceById(
        command.actor.facilityId,
        command.resourceId,
      );

    if (current === null) {
      throw new RadiologyResourceNotFoundError();
    }

    if (
      current.version !==
      input.expectedVersion
    ) {
      throw new RadiologyOperationsConcurrencyError();
    }

    return this.support.dependencies.transactionManager.execute(
      {
        transactionType:
          'RADIOLOGY_RESOURCE_STATUS_CHANGE',

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          radiologyLockKey(
            RADIOLOGY_LOCK_NAMESPACE.RESOURCE,
            command.actor.facilityId,
            command.resourceId,
          ),
        ],

        idempotencyPayload: {
          resourceId:
            command.resourceId,

          expectedVersion:
            input.expectedVersion,

          status:
            input.status,
        },

        journalPayload: {
          operation:
            'CHANGE_RESOURCE_STATUS',

          resourceId:
            command.resourceId,

          status:
            input.status,
        },

        execute: async (transaction) => {
          const occurredAt =
            this.support.dependencies.clock.now();

          const actorId =
            toObjectId(
              command.actor.userId,
              'actorUserId',
            );

          const restore =
            protectRadiologyRestorePayload(
              {
                facilityId:
                  command.actor.facilityId,

                collection:
                  'radiologyResources',

                entityId:
                  command.resourceId,

                expectedPostVersion:
                  current.version + 1,

                transactionId:
                  transaction.transactionId,

                snapshot:
                  recordSnapshot(
                    current as unknown as Record<
                      string,
                      unknown
                    >,
                  ),

                snapshotCrypto:
                  this.support.dependencies
                    .snapshotCrypto,
              },
            );

          const updated =
            await this.operations.updateResource(
              command.actor.facilityId,
              command.resourceId,
              input.expectedVersion,
              {
                status:
                  input.status,

                deactivatedAt:
                  input.status === 'ACTIVE'
                    ? null
                    : occurredAt,

                deactivatedBy:
                  input.status === 'ACTIVE'
                    ? null
                    : actorId,

                deactivationReason:
                  input.status === 'ACTIVE'
                    ? null
                    : input.reason.trim(),

                updatedBy:
                  actorId,
              },
            );

          if (updated === null) {
            throw new RadiologyOperationsConcurrencyError();
          }

          await transaction.registerCompensation(
            restoreRadiologyRecordCompensation(
              `restore-radiology-resource:${command.resourceId}`,
              restore,
            ),
          );

          await this.emit(
            command.actor,
            transaction.transactionId,
            occurredAt,
            RADIOLOGY_AUDIT_ACTIONS.RESOURCE_STATUS_CHANGED,
            RADIOLOGY_OUTBOX_EVENTS.RESOURCE_STATUS_CHANGED,
            'RadiologyResource',
            command.resourceId,
            safeResourceSnapshot(
              updated as unknown as Record<
                string,
                unknown
              >,
            ),
            RADIOLOGY_REALTIME_EVENTS.SCHEDULE_CHANGED,
            input.reason,
          );

          return updated;
        },
      },
    );
  }

  public async scheduleAppointment(
    command:
      RadiologyOperationsCommand<ScheduleRadiologyAppointmentInput>,
  ) {
    const input =
      scheduleRadiologyAppointmentBodySchema.parse(
        command.input,
      );

    const item =
      await this.support.requireOrderItem(
        command.actor,
        input.orderItemId,
      );

    const order =
      await this.support.requireOrder(
        command.actor,
        item.radiologyOrderId.toHexString(),
      );

    await this.support.assertAccess(
      command.actor,
      'SCHEDULE_MANAGE',
      {
        order,
        orderItem: item,
      },
    );

    this.support.assertExpectedVersion(
      item,
      input.expectedOrderItemVersion,
      'ORDER_ITEM',
    );

    if (
      ![
        'ACCEPTED',
        'SCHEDULED',
      ].includes(item.status)
    ) {
      throw new ConflictError(
        'Only accepted or already scheduled Radiology order items can be scheduled',
      );
    }

    const currentAppointment =
      await this.operations.findAppointmentByOrderItem(
        command.actor.facilityId,
        input.orderItemId,
      );

    if (
      currentAppointment === null &&
      input.expectedAppointmentVersion !==
        undefined
    ) {
      throw new RadiologyOperationsConcurrencyError();
    }

    if (
      currentAppointment !== null &&
      currentAppointment.version !==
        input.expectedAppointmentVersion
    ) {
      throw new RadiologyOperationsConcurrencyError();
    }

    const resourceIds =
      uniqueRadiologyObjectIdStrings([
        ...(input.roomResourceId ==
        null
          ? []
          : [input.roomResourceId]),

        ...input.equipmentResourceIds,
      ]);

    const resources =
      await this.operations.findResourcesByIds(
        command.actor.facilityId,
        resourceIds,
      );

    const resourcesById =
      new Map(
        resources.map(
          (resource) => [
            resource._id.toHexString(),
            resource,
          ],
        ),
      );

    const modalityId =
      item.procedureDefinitionSnapshot.modalityId.toHexString();

    const departmentId =
      order.departmentId.toHexString();

    const occurredAt =
      this.support.dependencies.clock.now();

    for (
      const resourceId of
      resourceIds
    ) {
      const resource =
        resourcesById.get(
          resourceId,
        );

      if (
        resource === undefined
      ) {
        throw new RadiologyResourceNotFoundError();
      }

      const supportsModality =
        resource.modalityIds.some(
          (id) =>
            id.toHexString() ===
            modalityId,
        );

      const effective =
        resource.effectiveFrom <=
          occurredAt &&
        (
          resource.effectiveThrough ===
            null ||
          resource.effectiveThrough >=
            occurredAt
        );

      if (
        resource.status !== 'ACTIVE' ||
        resource.departmentId.toHexString() !==
          departmentId ||
        !supportsModality ||
        !effective
      ) {
        throw new ConflictError(
          'The selected Radiology resource is not active and compatible with this procedure',
        );
      }
    }

    if (
      input.roomResourceId != null &&
      resourcesById.get(
        input.roomResourceId,
      )?.resourceType !== 'ROOM'
    ) {
      throw new ConflictError(
        'The selected room allocation is not a room',
      );
    }

    for (
      const equipmentId of
      input.equipmentResourceIds
    ) {
      if (
        resourcesById.get(
          equipmentId,
        )?.resourceType !==
        'EQUIPMENT'
      ) {
        throw new ConflictError(
          'Every equipment allocation must reference Radiology equipment',
        );
      }
    }

    const technicianIds =
      uniqueRadiologyObjectIdStrings(
        input.technicianStaffIds,
      );

    const eligibleTechnicians =
      await this.operations.findEligibleTechnicians(
        command.actor.facilityId,
        technicianIds,
      );

    if (
      eligibleTechnicians.length !==
      technicianIds.length
    ) {
      throw new ConflictError(
        'One or more allocated Radiology technicians are inactive, non-clinical, or outside the facility',
      );
    }

    if (
      item.procedureDefinitionSnapshot
        .requiresTechnician &&
      technicianIds.length < 1
    ) {
      throw new ConflictError(
        'The selected Radiology procedure requires at least one technician',
      );
    }

    const subjects =
      this.reservationSubjects(
        resourceIds,
        technicianIds,
      );

    const startAt =
      new Date(
        input.scheduledStartAt,
      );

    const endAt =
      new Date(
        input.scheduledEndAt,
      );

    const conflicts =
      await this.operations.findSchedulingConflicts(
        command.actor.facilityId,
        subjects,
        startAt,
        endAt,
        currentAppointment?._id.toHexString(),
      );

    if (conflicts.length > 0) {
      throw new RadiologySchedulingConflictError();
    }

    const previousReservations =
      currentAppointment === null
        ? []
        : await this.operations.findReservationsByAppointment(
            command.actor.facilityId,
            currentAppointment._id.toHexString(),
          );

    return this.support.dependencies.transactionManager.execute(
      {
        transactionType:
          RADIOLOGY_TRANSACTION_TYPES.SCHEDULE_EXAMINATION,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          radiologyLockKey(
            RADIOLOGY_LOCK_NAMESPACE.ORDER_ITEM,
            command.actor.facilityId,
            input.orderItemId,
          ),

          ...subjects.map(
            (subject) =>
              radiologyLockKey(
                RADIOLOGY_LOCK_NAMESPACE.RESOURCE,
                command.actor.facilityId,
                subject.subjectType,
                subject.resourceId ??
                  subject.staffId ??
                  'unknown',
              ),
          ),
        ].sort(),

        idempotencyPayload: {
          orderItemId:
            input.orderItemId,

          expectedOrderItemVersion:
            input.expectedOrderItemVersion,

          scheduleHash:
            radiologyContentHash(
              input,
            ),
        },

        journalPayload: {
          operation:
            'SCHEDULE_EXAMINATION',

          orderId:
            order._id.toHexString(),

          orderItemId:
            input.orderItemId,

          resourceCount:
            resourceIds.length,

          technicianCount:
            technicianIds.length,
        },

        execute: async (transaction) => {
          const actionAt =
            this.support.dependencies.clock.now();

          const staffId =
            await this.support.accessPolicy.requireActiveActorStaffId(
              command.actor,
            );

          const actorId =
            toObjectId(
              command.actor.userId,
              'actorUserId',
            );

          const staffObjectId =
            toObjectId(
              staffId,
              'staffId',
            );

          const appointmentId =
            currentAppointment?._id.toHexString() ??
            new Types.ObjectId().toHexString();

          const appointmentObjectId =
            toObjectId(
              appointmentId,
              'appointmentId',
            );

          const appointmentInput = {
            _id:
              appointmentObjectId,

            facilityId:
              order.facilityId,

            radiologyOrderId:
              order._id,

            radiologyOrderItemId:
              item._id,

            patientId:
              item.patientId,

            encounterId:
              item.encounterId,

            procedureId:
              item.radiologyProcedureId,

            modalityId:
              item.procedureDefinitionSnapshot.modalityId,

            departmentId:
              order.departmentId,

            scheduledStartAt:
              startAt,

            scheduledEndAt:
              endAt,

            timezone:
              input.timezone,

            roomResourceId:
              input.roomResourceId ==
              null
                ? null
                : toObjectId(
                    input.roomResourceId,
                    'roomResourceId',
                  ),

            equipmentResourceIds:
              input.equipmentResourceIds.map(
                (id) =>
                  toObjectId(
                    id,
                    'equipmentResourceIds',
                  ),
              ),

            technicianStaffIds:
              technicianIds.map(
                (id) =>
                  toObjectId(
                    id,
                    'technicianStaffIds',
                  ),
              ),

            preparationStatus:
              item.preparationStatus,

            safetyScreeningStatus:
              item.safetyScreeningStatus,

            status:
              'SCHEDULED',

            scheduledByStaffId:
              staffObjectId,

            scheduledAt:
              actionAt,

            checkedInAt:
              null,

            checkedInByStaffId:
              null,

            cancelledAt:
              null,

            cancelledByStaffId:
              null,

            cancellationReason:
              null,

            transactionId:
              currentAppointment?.transactionId ??
              transaction.transactionId,

            correlationId:
              currentAppointment?.correlationId ??
              command.actor.correlationId,

            schemaVersion:
              1,

            version:
              currentAppointment?.version ??
              0,

            createdBy:
              currentAppointment?.createdBy ??
              actorId,

            updatedBy:
              actorId,
          };

          const reservationInputs =
            subjects.map(
              (subject) => ({
                _id:
                  new Types.ObjectId(),

                facilityId:
                  order.facilityId,

                appointmentId:
                  appointmentObjectId,

                radiologyOrderItemId:
                  item._id,

                subjectType:
                  subject.subjectType,

                resourceId:
                  subject.resourceId ==
                  null
                    ? null
                    : toObjectId(
                        subject.resourceId,
                        'resourceId',
                      ),

                staffId:
                  subject.staffId ==
                  null
                    ? null
                    : toObjectId(
                        subject.staffId,
                        'staffId',
                      ),

                reservedStartAt:
                  startAt,

                reservedEndAt:
                  endAt,

                status:
                  'ACTIVE',

                releasedAt:
                  null,

                releasedByStaffId:
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
                  actorId,

                updatedBy:
                  actorId,
              }),
            );

          const saved =
            await this.operations.saveAppointmentSchedule(
              {
                appointment:
                  appointmentInput,

                expectedAppointmentVersion:
                  currentAppointment?.version ??
                  null,

                previousAppointmentId:
                  currentAppointment?._id.toHexString() ??
                  null,

                reservations:
                  reservationInputs,

                releasedAt:
                  actionAt,

                releasedByStaffId:
                  staffId,
              },
            );

          if (saved === null) {
            throw new RadiologyOperationsConcurrencyError();
          }

          await transaction.registerCompensation(
            deleteCreatedRadiologyRecordSetCompensation(
              `delete-radiology-reservations:${appointmentId}`,
              {
                facilityId:
                  command.actor.facilityId,

                collection:
                  'radiologyResourceReservations',

                entityIds:
                  saved.reservations.map(
                    (reservation) =>
                      reservation._id.toHexString(),
                  ),

                transactionId:
                  transaction.transactionId,
              },
            ),
          );

          if (
            currentAppointment ===
            null
          ) {
            await transaction.registerCompensation(
              deleteCreatedRadiologyRecordCompensation(
                `delete-radiology-appointment:${appointmentId}`,
                {
                  facilityId:
                    command.actor.facilityId,

                  collection:
                    'radiologyAppointments',

                  entityId:
                    appointmentId,

                  transactionId:
                    transaction.transactionId,
                },
              ),
            );
          } else {
            await transaction.registerCompensation(
              restoreRadiologyRecordCompensation(
                `restore-radiology-appointment:${appointmentId}`,
                protectRadiologyRestorePayload(
                  {
                    facilityId:
                      command.actor.facilityId,

                    collection:
                      'radiologyAppointments',

                    entityId:
                      appointmentId,

                    expectedPostVersion:
                      saved.appointment.version,

                    transactionId:
                      transaction.transactionId,

                    snapshot:
                      recordSnapshot(
                        currentAppointment as unknown as Record<
                          string,
                          unknown
                        >,
                      ),

                    snapshotCrypto:
                      this.support.dependencies
                        .snapshotCrypto,
                  },
                ),
              ),
            );

            for (
              const reservation of
              previousReservations
            ) {
              await this.registerReservationRestore(
                command.actor,
                transaction.transactionId,
                reservation,
                reservation.version + 1,
                transaction.registerCompensation.bind(
                  transaction,
                ),
              );
            }
          }

          let scheduledItem:
            RadiologyOrderItemRecord;

          if (
            item.status === 'ACCEPTED'
          ) {
            scheduledItem =
              await this.transitionOrderItem(
                command.actor,
                transaction.transactionId,
                item,
                'SCHEDULED',
                {
                  appointmentId:
                    appointmentObjectId,

                  scheduledAt:
                    startAt,

                  updatedBy:
                    actorId,
                },
                actionAt,
                staffObjectId,
                actorId,
                transaction.registerCompensation.bind(
                  transaction,
                ),
              );
          } else {
            const itemRestore =
              protectRadiologyRestorePayload(
                {
                  facilityId:
                    command.actor.facilityId,

                  collection:
                    'radiologyOrderItems',

                  entityId:
                    item._id.toHexString(),

                  expectedPostVersion:
                    item.version + 1,

                  transactionId:
                    transaction.transactionId,

                  snapshot:
                    radiologyOrderItemRestoreSnapshot(
                      item,
                    ),

                  snapshotCrypto:
                    this.support.dependencies
                      .snapshotCrypto,
                },
              );

            const rescheduledItem =
              await this.support.orders.transitionItem(
                command.actor.facilityId,
                item._id.toHexString(),
                item.version,
                ['SCHEDULED'],
                {
                  status:
                    'SCHEDULED',

                  appointmentId:
                    appointmentObjectId,

                  scheduledAt:
                    startAt,

                  updatedBy:
                    actorId,
                },
              );

            if (
              rescheduledItem ===
              null
            ) {
              throw new RadiologyOperationsConcurrencyError();
            }

            scheduledItem =
              rescheduledItem;

            await transaction.registerCompensation(
              restoreRadiologyRecordCompensation(
                `restore-rescheduled-order-item:${item._id.toHexString()}`,
                itemRestore,
              ),
            );
          }

          let scheduledOrder =
            order;

          if (
            order.status ===
            'ACCEPTED'
          ) {
            assertRadiologyOrderTransition(
              order.status,
              'SCHEDULED',
            );

            const orderRestore =
              protectRadiologyRestorePayload(
                {
                  facilityId:
                    command.actor.facilityId,

                  collection:
                    'radiologyOrders',

                  entityId:
                    order._id.toHexString(),

                  expectedPostVersion:
                    order.version + 1,

                  transactionId:
                    transaction.transactionId,

                  snapshot:
                    radiologyOrderRestoreSnapshot(
                      order,
                    ),

                  snapshotCrypto:
                    this.support.dependencies
                      .snapshotCrypto,
                },
              );

            const updatedOrder =
              await this.support.orders.transitionStatus(
                command.actor.facilityId,
                order._id.toHexString(),
                order.version,
                ['ACCEPTED'],
                {
                  status:
                    'SCHEDULED',

                  scheduledAt:
                    startAt,

                  scheduledItemCount:
                    Math.max(
                      order.scheduledItemCount,
                      1,
                    ),

                  lastStatusChangedAt:
                    actionAt,

                  lastStatusChangedBy:
                    staffObjectId,

                  updatedBy:
                    actorId,
                },
              );

            if (
              updatedOrder === null
            ) {
              throw new RadiologyOperationsConcurrencyError();
            }

            scheduledOrder =
              updatedOrder;

            await transaction.registerCompensation(
              restoreRadiologyRecordCompensation(
                `restore-scheduled-order:${order._id.toHexString()}`,
                orderRestore,
              ),
            );

            const histories =
              await this.support.orders.listHistory(
                command.actor.facilityId,
                order._id.toHexString(),
              );

            const history =
              await this.support.orders.appendHistory(
                {
                  facilityId:
                    order.facilityId,

                  radiologyOrderId:
                    order._id,

                  patientId:
                    order.patientId,

                  encounterId:
                    order.encounterId,

                  sequence:
                    histories.length + 1,

                  fromStatus:
                    order.status,

                  toStatus:
                    'SCHEDULED',

                  changeSource:
                    'RADIOLOGY_STAFF',

                  reasonCode:
                    null,

                  reason:
                    null,

                  occurredAt:
                    actionAt,

                  changedBy:
                    staffObjectId,

                  transactionId:
                    transaction.transactionId,

                  correlationId:
                    command.actor.correlationId,

                  schemaVersion:
                    1,

                  version:
                    0,

                  createdBy:
                    actorId,

                  updatedBy:
                    actorId,
                },
              );

            await transaction.registerCompensation(
              deleteCreatedRadiologyRecordCompensation(
                `delete-scheduled-order-history:${history._id.toHexString()}`,
                {
                  facilityId:
                    command.actor.facilityId,

                  collection:
                    'radiologyOrderStatusHistories',

                  entityId:
                    history._id.toHexString(),

                  transactionId:
                    transaction.transactionId,
                },
              ),
            );
          }

          void scheduledItem;

          await transaction.checkpoint(
            RADIOLOGY_TRANSACTION_STATES.RESERVATIONS_CREATED,
            {
              appointmentId,

              reservationCount:
                saved.reservations.length,
            },
          );

          await this.emit(
            command.actor,
            transaction.transactionId,
            actionAt,
            currentAppointment === null
              ? RADIOLOGY_AUDIT_ACTIONS.APPOINTMENT_SCHEDULED
              : RADIOLOGY_AUDIT_ACTIONS.APPOINTMENT_RESCHEDULED,
            currentAppointment === null
              ? RADIOLOGY_OUTBOX_EVENTS.APPOINTMENT_SCHEDULED
              : RADIOLOGY_OUTBOX_EVENTS.APPOINTMENT_RESCHEDULED,
            'RadiologyAppointment',
            appointmentId,
            safeAppointmentSnapshot(
              saved.appointment as unknown as Record<
                string,
                unknown
              >,
            ),
            RADIOLOGY_REALTIME_EVENTS.SCHEDULE_CHANGED,
          );

          await this.support.publishOrderRealtime(
            command.actor,
            scheduledOrder,
            RADIOLOGY_REALTIME_EVENTS.ORDER_WORKLIST_CHANGED,
          );

          return saved;
        },
      },
    );
  }

  public async cancelAppointment(
    command:
      RadiologyAppointmentCommand<CancelRadiologyAppointmentInput>,
  ) {
    const input =
      cancelRadiologyAppointmentBodySchema.parse(
        command.input,
      );

    const current =
      await this.operations.findAppointmentById(
        command.actor.facilityId,
        command.appointmentId,
      );

    if (current === null) {
      throw new RadiologyAppointmentNotFoundError();
    }

    const item =
      await this.support.requireOrderItem(
        command.actor,
        current.radiologyOrderItemId.toHexString(),
      );

    const order =
      await this.support.requireOrder(
        command.actor,
        current.radiologyOrderId.toHexString(),
      );

    await this.support.assertAccess(
      command.actor,
      'SCHEDULE_MANAGE',
      {
        order,
        orderItem: item,
      },
    );

    if (
      current.version !==
      input.expectedAppointmentVersion
    ) {
      throw new RadiologyOperationsConcurrencyError();
    }

    const reservations =
      await this.operations.findReservationsByAppointment(
        command.actor.facilityId,
        command.appointmentId,
      );

    return this.support.dependencies.transactionManager.execute(
      {
        transactionType:
          'RADIOLOGY_APPOINTMENT_CANCEL',

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          radiologyLockKey(
            RADIOLOGY_LOCK_NAMESPACE.SCHEDULE,
            command.actor.facilityId,
            command.appointmentId,
          ),
        ],

        idempotencyPayload: {
          appointmentId:
            command.appointmentId,

          expectedVersion:
            input.expectedAppointmentVersion,

          reasonHash:
            radiologyContentHash(
              input.reason,
            ),
        },

        journalPayload: {
          operation:
            'CANCEL_APPOINTMENT',

          appointmentId:
            command.appointmentId,

          orderItemId:
            item._id.toHexString(),
        },

        execute: async (transaction) => {
          const occurredAt =
            this.support.dependencies.clock.now();

          const staffId =
            await this.support.accessPolicy.requireActiveActorStaffId(
              command.actor,
            );

          const updated =
            await this.operations.cancelAppointment(
              {
                facilityId:
                  command.actor.facilityId,

                appointmentId:
                  command.appointmentId,

                expectedVersion:
                  input.expectedAppointmentVersion,

                cancelledAt:
                  occurredAt,

                cancelledByStaffId:
                  staffId,

                cancelledByUserId:
                  command.actor.userId,

                reason:
                  input.reason.trim(),
              },
            );

          if (updated === null) {
            throw new RadiologyOperationsConcurrencyError();
          }

          await transaction.registerCompensation(
            restoreRadiologyRecordCompensation(
              `restore-cancelled-appointment:${command.appointmentId}`,
              protectRadiologyRestorePayload(
                {
                  facilityId:
                    command.actor.facilityId,

                  collection:
                    'radiologyAppointments',

                  entityId:
                    command.appointmentId,

                  expectedPostVersion:
                    updated.version,

                  transactionId:
                    transaction.transactionId,

                  snapshot:
                    recordSnapshot(
                      current as unknown as Record<
                        string,
                        unknown
                      >,
                    ),

                  snapshotCrypto:
                    this.support.dependencies
                      .snapshotCrypto,
                },
              ),
            ),
          );

          for (
            const reservation of
            reservations
          ) {
            await this.registerReservationRestore(
              command.actor,
              transaction.transactionId,
              reservation,
              reservation.version + 1,
              transaction.registerCompensation.bind(
                transaction,
              ),
            );
          }

          await this.emit(
            command.actor,
            transaction.transactionId,
            occurredAt,
            RADIOLOGY_AUDIT_ACTIONS.APPOINTMENT_CANCELLED,
            RADIOLOGY_OUTBOX_EVENTS.APPOINTMENT_CANCELLED,
            'RadiologyAppointment',
            command.appointmentId,
            safeAppointmentSnapshot(
              updated as unknown as Record<
                string,
                unknown
              >,
            ),
            RADIOLOGY_REALTIME_EVENTS.SCHEDULE_CHANGED,
            input.reason,
          );

          return updated;
        },
      },
    );
  }

  public async recordSafetyScreening(
    command:
      RadiologyOperationsCommand<RecordRadiologySafetyScreeningInput>,
  ) {
    const input =
      recordRadiologySafetyScreeningBodySchema.parse(
        command.input,
      );

    const item =
      await this.support.requireOrderItem(
        command.actor,
        input.orderItemId,
      );

    const order =
      await this.support.requireOrder(
        command.actor,
        item.radiologyOrderId.toHexString(),
      );

    await this.support.assertAccess(
      command.actor,
      'SAFETY_MANAGE',
      {
        order,
        orderItem: item,
      },
    );

    this.support.assertExpectedVersion(
      item,
      input.expectedOrderItemVersion,
      'ORDER_ITEM',
    );

    const current =
      await this.operations.findSafetyScreeningByOrderItem(
        command.actor.facilityId,
        input.orderItemId,
      );

    if (
      current === null &&
      input.expectedScreeningVersion !==
        undefined
    ) {
      throw new RadiologyOperationsConcurrencyError();
    }

    if (
      current !== null &&
      current.version !==
        input.expectedScreeningVersion
    ) {
      throw new RadiologyOperationsConcurrencyError();
    }

    const requiredCodes = [
      ...item.procedureDefinitionSnapshot
        .safetyScreeningRequirements,
    ].map(normalizeRadiologyCode);

    const responseCodes =
      new Set(
        input.responses.map(
          (response) =>
            normalizeRadiologyCode(
              response.requirementCode,
            ),
        ),
      );

    if (
      input.status === 'CLEARED' &&
      requiredCodes.some(
        (code) =>
          !responseCodes.has(code),
      )
    ) {
      throw new ConflictError(
        'All required Radiology safety-screening items must be answered before clearance',
      );
    }

    return this.support.dependencies.transactionManager.execute(
      {
        transactionType:
          RADIOLOGY_TRANSACTION_TYPES.RECORD_SAFETY_SCREENING,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          radiologyLockKey(
            RADIOLOGY_LOCK_NAMESPACE.ORDER_ITEM,
            command.actor.facilityId,
            input.orderItemId,
            'safety-screening',
          ),
        ],

        idempotencyPayload: {
          orderItemId:
            input.orderItemId,

          expectedOrderItemVersion:
            input.expectedOrderItemVersion,

          screeningHash:
            radiologyContentHash(
              input,
            ),
        },

        journalPayload: {
          operation:
            'RECORD_SAFETY_SCREENING',

          orderItemId:
            input.orderItemId,

          status:
            input.status,

          preparationStatus:
            input.preparationStatus,

          responseCount:
            input.responses.length,
        },

        execute: async (transaction) => {
          const occurredAt =
            this.support.dependencies.clock.now();

          const staffId =
            await this.support.accessPolicy.requireActiveActorStaffId(
              command.actor,
            );

          const actorId =
            toObjectId(
              command.actor.userId,
              'actorUserId',
            );

          const screeningId =
            current?._id.toHexString() ??
            new Types.ObjectId().toHexString();

          const appointment =
            await this.operations.findAppointmentByOrderItem(
              command.actor.facilityId,
              input.orderItemId,
            );

          const screening =
            await this.operations.saveSafetyScreening(
              {
                _id:
                  toObjectId(
                    screeningId,
                    'screeningId',
                  ),

                facilityId:
                  item.facilityId,

                radiologyOrderId:
                  order._id,

                radiologyOrderItemId:
                  item._id,

                appointmentId:
                  appointment?._id ??
                  null,

                patientId:
                  item.patientId,

                encounterId:
                  item.encounterId,

                requiredScreeningCodesSnapshot:
                  requiredCodes,

                requirementsHash:
                  radiologyContentHash(
                    requiredCodes,
                  ),

                responses:
                  input.responses.map(
                    (response) => ({
                      requirementCode:
                        normalizeRadiologyCode(
                          response.requirementCode,
                        ),

                      response:
                        response.response,

                      details:
                        response.details?.trim() ??
                        null,
                    }),
                  ),

                pregnancyStatus:
                  input.pregnancyStatus,

                contrastAllergyStatus:
                  input.contrastAllergyStatus,

                renalRiskStatus:
                  input.renalRiskStatus,

                implantDeviceStatus:
                  input.implantDeviceStatus,

                estimatedGfr:
                  input.estimatedGfr ==
                  null
                    ? null
                    : Decimal128.fromString(
                        input.estimatedGfr,
                      ),

                serumCreatinine:
                  input.serumCreatinine ==
                  null
                    ? null
                    : Decimal128.fromString(
                        input.serumCreatinine,
                      ),

                renalLabObservedAt:
                  input.renalLabObservedAt ==
                  null
                    ? null
                    : new Date(
                        input.renalLabObservedAt,
                      ),

                status:
                  input.status,

                preparationStatus:
                  input.preparationStatus,

                conditions:
                  uniqueRadiologyStrings(
                    input.conditions,
                  ),

                screenedAt:
                  occurredAt,

                screenedByStaffId:
                  toObjectId(
                    staffId,
                    'staffId',
                  ),

                reviewedAt:
                  input.status === 'CLEARED'
                    ? occurredAt
                    : null,

                reviewedByStaffId:
                  input.status === 'CLEARED'
                    ? toObjectId(
                        staffId,
                        'staffId',
                      )
                    : null,

                transactionId:
                  current?.transactionId ??
                  transaction.transactionId,

                correlationId:
                  current?.correlationId ??
                  command.actor.correlationId,

                schemaVersion:
                  1,

                version:
                  current?.version ??
                  0,

                createdBy:
                  current?.createdBy ??
                  actorId,

                updatedBy:
                  actorId,
              },
              current?.version ??
                null,
            );

          if (
            screening === null
          ) {
            throw new RadiologyOperationsConcurrencyError();
          }

          if (current === null) {
            await transaction.registerCompensation(
              deleteCreatedRadiologyRecordCompensation(
                `delete-radiology-screening:${screeningId}`,
                {
                  facilityId:
                    command.actor.facilityId,

                  collection:
                    'radiologySafetyScreenings',

                  entityId:
                    screeningId,

                  transactionId:
                    transaction.transactionId,
                },
              ),
            );
          } else {
            await transaction.registerCompensation(
              restoreRadiologyRecordCompensation(
                `restore-radiology-screening:${screeningId}`,
                protectRadiologyRestorePayload(
                  {
                    facilityId:
                      command.actor.facilityId,

                    collection:
                      'radiologySafetyScreenings',

                    entityId:
                      screeningId,

                    expectedPostVersion:
                      screening.version,

                    transactionId:
                      transaction.transactionId,

                    snapshot:
                      recordSnapshot(
                        current as unknown as Record<
                          string,
                          unknown
                        >,
                      ),

                    snapshotCrypto:
                      this.support.dependencies
                        .snapshotCrypto,
                  },
                ),
              ),
            );
          }

          const itemRestore =
            protectRadiologyRestorePayload(
              {
                facilityId:
                  command.actor.facilityId,

                collection:
                  'radiologyOrderItems',

                entityId:
                  item._id.toHexString(),

                expectedPostVersion:
                  item.version + 1,

                transactionId:
                  transaction.transactionId,

                snapshot:
                  radiologyOrderItemRestoreSnapshot(
                    item,
                  ),

                snapshotCrypto:
                  this.support.dependencies
                    .snapshotCrypto,
              },
            );

          const updatedItem =
            await this.support.orders.updateItemScreening(
              command.actor.facilityId,
              input.orderItemId,
              input.expectedOrderItemVersion,
              input.status,
              input.preparationStatus,
              command.actor.userId,
            );

          if (
            updatedItem === null
          ) {
            throw new RadiologyOperationsConcurrencyError();
          }

          await transaction.registerCompensation(
            restoreRadiologyRecordCompensation(
              `restore-screened-order-item:${input.orderItemId}`,
              itemRestore,
            ),
          );

          await this.emit(
            command.actor,
            transaction.transactionId,
            occurredAt,
            RADIOLOGY_AUDIT_ACTIONS.SAFETY_SCREENING_RECORDED,
            RADIOLOGY_OUTBOX_EVENTS.SAFETY_SCREENING_STATUS_CHANGED,
            'RadiologySafetyScreening',
            screeningId,
            safeScreeningSnapshot(
              screening as unknown as Record<
                string,
                unknown
              >,
            ),
            RADIOLOGY_REALTIME_EVENTS.EXAMINATION_WORKLIST_CHANGED,
          );

          return screening;
        },
      },
    );
  }

  public async checkIn(
    command:
      RadiologyOperationsCommand<CheckInRadiologyExaminationInput>,
  ) {
    const input =
      checkInRadiologyExaminationBodySchema.parse(
        command.input,
      );

    const item =
      await this.support.requireOrderItem(
        command.actor,
        input.orderItemId,
      );

    const order =
      await this.support.requireOrder(
        command.actor,
        item.radiologyOrderId.toHexString(),
      );

    await this.support.assertAccess(
      command.actor,
      'EXAMINATION_MANAGE',
      {
        order,
        orderItem: item,
      },
    );

    this.support.assertExpectedVersion(
      item,
      input.expectedOrderItemVersion,
      'ORDER_ITEM',
    );

    assertRadiologyExaminationReady(
      item.safetyScreeningStatus,
      item.preparationStatus,
    );

    assertRadiologyOrderItemTransition(
      item.status,
      'CHECKED_IN',
    );

    const appointment =
      await this.operations.findAppointmentByOrderItem(
        command.actor.facilityId,
        input.orderItemId,
      );

    if (
      appointment !== null &&
      appointment.version !==
        input.expectedAppointmentVersion
    ) {
      throw new RadiologyOperationsConcurrencyError();
    }

    return this.support.dependencies.transactionManager.execute(
      {
        transactionType:
          RADIOLOGY_TRANSACTION_TYPES.CHECK_IN,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          radiologyLockKey(
            RADIOLOGY_LOCK_NAMESPACE.ORDER_ITEM,
            command.actor.facilityId,
            input.orderItemId,
          ),
        ],

        idempotencyPayload: {
          orderItemId:
            input.orderItemId,

          expectedOrderItemVersion:
            input.expectedOrderItemVersion,
        },

        journalPayload: {
          operation:
            'CHECK_IN',

          orderId:
            order._id.toHexString(),

          orderItemId:
            input.orderItemId,
        },

        execute: async (transaction) => {
          const occurredAt =
            this.support.dependencies.clock.now();

          const staffId =
            await this.support.accessPolicy.requireActiveActorStaffId(
              command.actor,
            );

          const actorId =
            toObjectId(
              command.actor.userId,
              'actorUserId',
            );

          const staffObjectId =
            toObjectId(
              staffId,
              'staffId',
            );

          const examinationId =
            new Types.ObjectId();

          const examination =
            await this.operations.createExamination(
              {
                _id:
                  examinationId,

                facilityId:
                  item.facilityId,

                radiologyOrderId:
                  order._id,

                radiologyOrderItemId:
                  item._id,

                appointmentId:
                  appointment?._id ??
                  null,

                patientId:
                  item.patientId,

                encounterId:
                  item.encounterId,

                modalityId:
                  item.procedureDefinitionSnapshot.modalityId,

                procedureDefinitionHash:
                  item.procedureDefinitionHash,

                status:
                  'CHECKED_IN',

                technicianStaffIds:
                  appointment?.technicianStaffIds ??
                  [],

                checkedInAt:
                  occurredAt,

                checkedInByStaffId:
                  staffObjectId,

                startedAt:
                  null,

                startedByStaffId:
                  null,

                completedAt:
                  null,

                completedByStaffId:
                  null,

                contrastAdministered:
                  false,

                contrastUsageReference:
                  null,

                technicianNotes:
                  null,

                complications:
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
                  actorId,

                updatedBy:
                  actorId,
              },
            );

          await transaction.registerCompensation(
            deleteCreatedRadiologyRecordCompensation(
              `delete-radiology-examination:${examinationId.toHexString()}`,
              {
                facilityId:
                  command.actor.facilityId,

                collection:
                  'radiologyExaminations',

                entityId:
                  examinationId.toHexString(),

                transactionId:
                  transaction.transactionId,
              },
            ),
          );

          const updatedItem =
            await this.transitionOrderItem(
              command.actor,
              transaction.transactionId,
              item,
              'CHECKED_IN',
              {
                checkedInAt:
                  occurredAt,

                updatedBy:
                  actorId,
              },
              occurredAt,
              staffObjectId,
              actorId,
              transaction.registerCompensation.bind(
                transaction,
              ),
            );

          if (appointment !== null) {
            const updatedAppointment =
              await this.operations.updateAppointmentOperationalStatus(
                command.actor.facilityId,
                appointment._id.toHexString(),
                appointment.version,
                {
                  status:
                    'CHECKED_IN',

                  checkedInAt:
                    occurredAt,

                  checkedInByStaffId:
                    staffObjectId,

                  updatedBy:
                    actorId,
                },
              );

            if (
              updatedAppointment ===
              null
            ) {
              throw new RadiologyOperationsConcurrencyError();
            }
          }

          await this.transitionOrderIfNeeded(
            command.actor,
            transaction.transactionId,
            order,
            'CHECKED_IN',
            occurredAt,
            staffObjectId,
            actorId,
            transaction.registerCompensation.bind(
              transaction,
            ),
          );

          await this.emit(
            command.actor,
            transaction.transactionId,
            occurredAt,
            RADIOLOGY_AUDIT_ACTIONS.PATIENT_CHECKED_IN,
            RADIOLOGY_OUTBOX_EVENTS.PATIENT_CHECKED_IN,
            'RadiologyExamination',
            examinationId.toHexString(),
            safeExaminationSnapshot(
              examination as unknown as Record<
                string,
                unknown
              >,
            ),
            RADIOLOGY_REALTIME_EVENTS.EXAMINATION_WORKLIST_CHANGED,
          );

          return {
            examination,
            orderItem:
              updatedItem,
          };
        },
      },
    );
  }

  public async startExamination(
    command:
      RadiologyOperationsCommand<StartRadiologyExaminationInput>,
  ) {
    const input =
      startRadiologyExaminationBodySchema.parse(
        command.input,
      );

    const item =
      await this.support.requireOrderItem(
        command.actor,
        input.orderItemId,
      );

    const order =
      await this.support.requireOrder(
        command.actor,
        item.radiologyOrderId.toHexString(),
      );

    const examination =
      await this.operations.findExaminationByOrderItem(
        command.actor.facilityId,
        input.orderItemId,
      );

    if (examination === null) {
      throw new RadiologyExaminationNotFoundError();
    }

    await this.support.assertAccess(
      command.actor,
      'EXAMINATION_MANAGE',
      {
        order,
        orderItem: item,
      },
    );

    this.support.assertExpectedVersion(
      item,
      input.expectedOrderItemVersion,
      'ORDER_ITEM',
    );

    if (
      examination.version !==
      input.expectedExaminationVersion
    ) {
      throw new RadiologyOperationsConcurrencyError();
    }

    assertRadiologyExaminationReady(
      item.safetyScreeningStatus,
      item.preparationStatus,
    );

    assertRadiologyOrderItemTransition(
      item.status,
      'IN_PROGRESS',
    );

    return this.support.dependencies.transactionManager.execute(
      {
        transactionType:
          RADIOLOGY_TRANSACTION_TYPES.START_EXAMINATION,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          radiologyLockKey(
            RADIOLOGY_LOCK_NAMESPACE.ORDER_ITEM,
            command.actor.facilityId,
            input.orderItemId,
          ),
        ],

        idempotencyPayload: {
          orderItemId:
            input.orderItemId,

          expectedExaminationVersion:
            input.expectedExaminationVersion,
        },

        journalPayload: {
          operation:
            'START_EXAMINATION',

          orderId:
            order._id.toHexString(),

          orderItemId:
            input.orderItemId,
        },

        execute: async (transaction) => {
          const occurredAt =
            this.support.dependencies.clock.now();

          const staffId =
            await this.support.accessPolicy.requireActiveActorStaffId(
              command.actor,
            );

          const actorId =
            toObjectId(
              command.actor.userId,
              'actorUserId',
            );

          const staffObjectId =
            toObjectId(
              staffId,
              'staffId',
            );

          const technicianIds =
            uniqueRadiologyObjectIdStrings(
              input.technicianStaffIds.length ===
              0
                ? examination.technicianStaffIds.map(
                    (id) =>
                      id.toHexString(),
                  )
                : input.technicianStaffIds,
            );

          const eligible =
            await this.operations.findEligibleTechnicians(
              command.actor.facilityId,
              technicianIds,
            );

          if (
            eligible.length !==
            technicianIds.length
          ) {
            throw new ConflictError(
              'One or more examination technicians are not eligible',
            );
          }

          const updatedExamination =
            await this.operations.updateExamination(
              command.actor.facilityId,
              examination._id.toHexString(),
              examination.version,
              {
                status:
                  'IN_PROGRESS',

                technicianStaffIds:
                  technicianIds.map(
                    (id) =>
                      toObjectId(
                        id,
                        'technicianStaffIds',
                      ),
                  ),

                startedAt:
                  occurredAt,

                startedByStaffId:
                  staffObjectId,

                updatedBy:
                  actorId,
              },
            );

          if (
            updatedExamination ===
            null
          ) {
            throw new RadiologyOperationsConcurrencyError();
          }

          await transaction.registerCompensation(
            restoreRadiologyRecordCompensation(
              `restore-started-examination:${examination._id.toHexString()}`,
              protectRadiologyRestorePayload(
                {
                  facilityId:
                    command.actor.facilityId,

                  collection:
                    'radiologyExaminations',

                  entityId:
                    examination._id.toHexString(),

                  expectedPostVersion:
                    updatedExamination.version,

                  transactionId:
                    transaction.transactionId,

                  snapshot:
                    recordSnapshot(
                      examination as unknown as Record<
                        string,
                        unknown
                      >,
                    ),

                  snapshotCrypto:
                    this.support.dependencies
                      .snapshotCrypto,
                },
              ),
            ),
          );

          const updatedItem =
            await this.transitionOrderItem(
              command.actor,
              transaction.transactionId,
              item,
              'IN_PROGRESS',
              {
                examinationStartedAt:
                  occurredAt,

                updatedBy:
                  actorId,
              },
              occurredAt,
              staffObjectId,
              actorId,
              transaction.registerCompensation.bind(
                transaction,
              ),
            );

          await this.transitionOrderIfNeeded(
            command.actor,
            transaction.transactionId,
            order,
            'IN_PROGRESS',
            occurredAt,
            staffObjectId,
            actorId,
            transaction.registerCompensation.bind(
              transaction,
            ),
          );

          await this.emit(
            command.actor,
            transaction.transactionId,
            occurredAt,
            RADIOLOGY_AUDIT_ACTIONS.EXAMINATION_STARTED,
            RADIOLOGY_OUTBOX_EVENTS.EXAMINATION_STARTED,
            'RadiologyExamination',
            examination._id.toHexString(),
            safeExaminationSnapshot(
              updatedExamination as unknown as Record<
                string,
                unknown
              >,
            ),
            RADIOLOGY_REALTIME_EVENTS.EXAMINATION_WORKLIST_CHANGED,
          );

          return {
            examination:
              updatedExamination,

            orderItem:
              updatedItem,
          };
        },
      },
    );
  }

  public async completeExamination(
    command:
      RadiologyOperationsCommand<CompleteRadiologyExaminationInput>,
  ) {
    const input =
      completeRadiologyExaminationBodySchema.parse(
        command.input,
      );

    const item =
      await this.support.requireOrderItem(
        command.actor,
        input.orderItemId,
      );

    const order =
      await this.support.requireOrder(
        command.actor,
        item.radiologyOrderId.toHexString(),
      );

    const examination =
      await this.operations.findExaminationByOrderItem(
        command.actor.facilityId,
        input.orderItemId,
      );

    if (examination === null) {
      throw new RadiologyExaminationNotFoundError();
    }

    await this.support.assertAccess(
      command.actor,
      'EXAMINATION_MANAGE',
      {
        order,
        orderItem: item,
      },
    );

    this.support.assertExpectedVersion(
      item,
      input.expectedOrderItemVersion,
      'ORDER_ITEM',
    );

    if (
      examination.version !==
      input.expectedExaminationVersion
    ) {
      throw new RadiologyOperationsConcurrencyError();
    }

    assertRadiologyOrderItemTransition(
      item.status,
      'COMPLETED',
    );

    return this.support.dependencies.transactionManager.execute(
      {
        transactionType:
          RADIOLOGY_TRANSACTION_TYPES.COMPLETE_EXAMINATION,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          radiologyLockKey(
            RADIOLOGY_LOCK_NAMESPACE.ORDER_ITEM,
            command.actor.facilityId,
            input.orderItemId,
          ),
        ],

        idempotencyPayload: {
          orderItemId:
            input.orderItemId,

          expectedExaminationVersion:
            input.expectedExaminationVersion,

          completionHash:
            radiologyContentHash(
              input,
            ),
        },

        journalPayload: {
          operation:
            'COMPLETE_EXAMINATION',

          orderId:
            order._id.toHexString(),

          orderItemId:
            input.orderItemId,

          contrastAdministered:
            input.contrastAdministered,

          technicianCount:
            input.technicianStaffIds.length,
        },

        execute: async (transaction) => {
          const occurredAt =
            this.support.dependencies.clock.now();

          const staffId =
            await this.support.accessPolicy.requireActiveActorStaffId(
              command.actor,
            );

          const actorId =
            toObjectId(
              command.actor.userId,
              'actorUserId',
            );

          const staffObjectId =
            toObjectId(
              staffId,
              'staffId',
            );

          const eligible =
            await this.operations.findEligibleTechnicians(
              command.actor.facilityId,
              input.technicianStaffIds,
            );

          if (
            eligible.length !==
            input.technicianStaffIds.length
          ) {
            throw new ConflictError(
              'One or more completing technicians are not eligible',
            );
          }

          let contrastUsageReference:
            string | null = null;

          if (
            input.contrastAdministered
          ) {
            const usage =
              await this.inventoryUsage.recordContrastUsage(
                {
                  facilityId:
                    command.actor.facilityId,

                  patientId:
                    item.patientId.toHexString(),

                  encounterId:
                    item.encounterId.toHexString(),

                  radiologyOrderId:
                    order._id.toHexString(),

                  radiologyOrderItemId:
                    item._id.toHexString(),

                  examinationId:
                    examination._id.toHexString(),

                  productReference:
                    input.contrastProductReference as string,

                  quantity:
                    input.contrastQuantity as string,

                  unitCode:
                    input.contrastUnitCode as string,

                  requestedBy:
                    command.actor.userId,

                  requestedAt:
                    occurredAt,

                  transactionId:
                    transaction.transactionId,

                  correlationId:
                    command.actor.correlationId,
                },
              );

            contrastUsageReference =
              usage.usageReference;

            await transaction.checkpoint(
              RADIOLOGY_TRANSACTION_STATES.INVENTORY_USAGE_REQUESTED,
              {
                orderItemId:
                  item._id.toHexString(),

                usageLinked:
                  true,
              },
            );
          }

          const updatedExamination =
            await this.operations.updateExamination(
              command.actor.facilityId,
              examination._id.toHexString(),
              examination.version,
              {
                status:
                  'COMPLETED',

                technicianStaffIds:
                  input.technicianStaffIds.map(
                    (id) =>
                      toObjectId(
                        id,
                        'technicianStaffIds',
                      ),
                  ),

                completedAt:
                  occurredAt,

                completedByStaffId:
                  staffObjectId,

                contrastAdministered:
                  input.contrastAdministered,

                contrastUsageReference,

                technicianNotes:
                  input.technicianNotes?.trim() ??
                  null,

                complications:
                  input.complications?.trim() ??
                  null,

                updatedBy:
                  actorId,
              },
            );

          if (
            updatedExamination ===
            null
          ) {
            throw new RadiologyOperationsConcurrencyError();
          }

          await transaction.registerCompensation(
            restoreRadiologyRecordCompensation(
              `restore-completed-examination:${examination._id.toHexString()}`,
              protectRadiologyRestorePayload(
                {
                  facilityId:
                    command.actor.facilityId,

                  collection:
                    'radiologyExaminations',

                  entityId:
                    examination._id.toHexString(),

                  expectedPostVersion:
                    updatedExamination.version,

                  transactionId:
                    transaction.transactionId,

                  snapshot:
                    recordSnapshot(
                      examination as unknown as Record<
                        string,
                        unknown
                      >,
                    ),

                  snapshotCrypto:
                    this.support.dependencies
                      .snapshotCrypto,
                },
              ),
            ),
          );

          const updatedItem =
            await this.transitionOrderItem(
              command.actor,
              transaction.transactionId,
              item,
              'COMPLETED',
              {
                examinationCompletedAt:
                  occurredAt,

                updatedBy:
                  actorId,
              },
              occurredAt,
              staffObjectId,
              actorId,
              transaction.registerCompensation.bind(
                transaction,
              ),
            );

          const allItems =
            await this.support.orders.listItems(
              command.actor.facilityId,
              order._id.toHexString(),
            );

          const completedCount =
            allItems.filter(
              (candidate) =>
                [
                  'COMPLETED',
                  'PRELIMINARY_REPORTED',
                  'FINAL_REPORTED',
                  'VERIFIED',
                ].includes(
                  candidate.status,
                ),
            ).length;

          const unfinished =
            allItems.some(
              (candidate) =>
                [
                  'ORDERED',
                  'ACCEPTED',
                  'SCHEDULED',
                  'CHECKED_IN',
                  'IN_PROGRESS',
                ].includes(
                  candidate.status,
                ),
            );

          if (
            !unfinished &&
            order.status === 'IN_PROGRESS'
          ) {
            assertRadiologyOrderTransition(
              order.status,
              'COMPLETED',
            );

            await this.support.orders.transitionStatus(
              command.actor.facilityId,
              order._id.toHexString(),
              order.version,
              ['IN_PROGRESS'],
              {
                status:
                  'COMPLETED',

                examinationCompletedAt:
                  occurredAt,

                completedItemCount:
                  completedCount,

                lastStatusChangedAt:
                  occurredAt,

                lastStatusChangedBy:
                  staffObjectId,

                updatedBy:
                  actorId,
              },
            );
          }

          const appointment =
            await this.operations.findAppointmentByOrderItem(
              command.actor.facilityId,
              input.orderItemId,
            );

          if (
            appointment !== null &&
            appointment.status ===
              'IN_PROGRESS'
          ) {
            await this.operations.updateAppointmentOperationalStatus(
              command.actor.facilityId,
              appointment._id.toHexString(),
              appointment.version,
              {
                status:
                  'COMPLETED',

                updatedBy:
                  actorId,
              },
            );
          }

          await this.emit(
            command.actor,
            transaction.transactionId,
            occurredAt,
            RADIOLOGY_AUDIT_ACTIONS.EXAMINATION_COMPLETED,
            RADIOLOGY_OUTBOX_EVENTS.EXAMINATION_COMPLETED,
            'RadiologyExamination',
            examination._id.toHexString(),
            safeExaminationSnapshot(
              updatedExamination as unknown as Record<
                string,
                unknown
              >,
            ),
            RADIOLOGY_REALTIME_EVENTS.EXAMINATION_WORKLIST_CHANGED,
          );

          return {
            examination:
              updatedExamination,

            orderItem:
              updatedItem,
          };
        },
      },
    );
  }

  public async registerImagingStudy(
    command:
      RadiologyOperationsCommand<RegisterRadiologyImagingStudyInput>,
  ) {
    const input =
      registerRadiologyImagingStudyBodySchema.parse(
        command.input,
      );

    const item =
      await this.support.requireOrderItem(
        command.actor,
        input.orderItemId,
      );

    const order =
      await this.support.requireOrder(
        command.actor,
        item.radiologyOrderId.toHexString(),
      );

    const examination =
      await this.operations.findExaminationByOrderItem(
        command.actor.facilityId,
        input.orderItemId,
      );

    if (examination === null) {
      throw new RadiologyExaminationNotFoundError();
    }

    await this.support.assertAccess(
      command.actor,
      'STUDY_MANAGE',
      {
        order,
        orderItem: item,
      },
    );

    this.support.assertExpectedVersion(
      item,
      input.expectedOrderItemVersion,
      'ORDER_ITEM',
    );

    if (
      examination.version !==
        input.expectedExaminationVersion ||
      examination.status !==
        'COMPLETED' ||
      item.status !==
        'COMPLETED'
    ) {
      throw new ConflictError(
        'Imaging study registration requires a completed Radiology examination and order item',
      );
    }

    if (
      item.accessionNumber ===
      null
    ) {
      throw new RadiologyExternalStudyConflictError(
        'Imaging study registration requires an accession number',
      );
    }

    const existing =
      await this.operations.findImagingStudyByOrderItem(
        command.actor.facilityId,
        input.orderItemId,
      );

    if (existing !== null) {
      throw new RadiologyExternalStudyConflictError(
        'An imaging study is already registered for this Radiology order item',
      );
    }

    return this.support.dependencies.transactionManager.execute(
      {
        transactionType:
          RADIOLOGY_TRANSACTION_TYPES.REGISTER_STUDY,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          radiologyLockKey(
            RADIOLOGY_LOCK_NAMESPACE.STUDY,
            command.actor.facilityId,
            input.orderItemId,
          ),

          radiologyLockKey(
            RADIOLOGY_LOCK_NAMESPACE.STUDY,
            command.actor.facilityId,
            'uid',
            input.studyInstanceUid,
          ),
        ],

        idempotencyPayload: {
          orderItemId:
            input.orderItemId,

          studyInstanceUid:
            input.studyInstanceUid,

          studyHash:
            radiologyContentHash(
              input,
            ),
        },

        journalPayload: {
          operation:
            'REGISTER_STUDY',

          orderId:
            order._id.toHexString(),

          orderItemId:
            input.orderItemId,

          status:
            input.status,

          seriesCount:
            input.series.length,
        },

        execute: async (transaction) => {
          const occurredAt =
            this.support.dependencies.clock.now();

          const staffId =
            await this.support.accessPolicy.requireActiveActorStaffId(
              command.actor,
            );

          const verified =
            await this.imagingGateway.verifyExternalStudy(
              {
                facilityId:
                  command.actor.facilityId,

                patientId:
                  item.patientId.toHexString(),

                accessionNumber:
                  item.accessionNumber as string,

                studyInstanceUid:
                  input.studyInstanceUid,

                studyDateTime:
                  new Date(
                    input.studyDateTime,
                  ),

                externalReferences:
                  input.externalReferences,

                series:
                  input.series,

                correlationId:
                  command.actor.correlationId,
              },
            );

          if (
            verified.studyInstanceUid !==
            input.studyInstanceUid
          ) {
            throw new RadiologyExternalStudyConflictError(
              'The external imaging system returned a different Study Instance UID',
            );
          }

          await transaction.checkpoint(
            RADIOLOGY_TRANSACTION_STATES.EXTERNAL_REFERENCE_VALIDATED,
            {
              orderItemId:
                item._id.toHexString(),

              externalReferenceCount:
                verified.references.length,

              seriesCount:
                verified.series.length,
            },
          );

          const year =
            occurredAt.getUTCFullYear();

          const allocation =
            await this.support.dependencies.sequence.next(
              command.actor.facilityId,
              buildRadiologySequenceKey(
                RADIOLOGY_NUMBER_SEQUENCE_NAMESPACE.STUDY,
                year,
              ),
            );

          const studyId =
            new Types.ObjectId();

          const actorId =
            toObjectId(
              command.actor.userId,
              'actorUserId',
            );

          const study =
            await this.operations.createImagingStudy(
              {
                study: {
                  _id:
                    studyId,

                  facilityId:
                    item.facilityId,

                  studyNumber:
                    formatRadiologyNumber(
                      'RDS',
                      year,
                      allocation.value,
                    ),

                  accessionNumber:
                    item.accessionNumber,

                  radiologyOrderId:
                    order._id,

                  radiologyOrderItemId:
                    item._id,

                  examinationId:
                    examination._id,

                  patientId:
                    item.patientId,

                  encounterId:
                    item.encounterId,

                  modalityId:
                    item.procedureDefinitionSnapshot.modalityId,

                  modalityCodeSnapshot:
                    item.procedureDefinitionSnapshot.modalityCode,

                  studyInstanceUid:
                    verified.studyInstanceUid,

                  studyDateTime:
                    verified.studyDateTime,

                  status:
                    input.status,

                  externalReferences:
                    verified.references,

                  seriesCount:
                    verified.series.length,

                  instanceCount:
                    verified.series.reduce(
                      (
                        total,
                        series,
                      ) =>
                        total +
                        series.instanceCount,
                      0,
                    ),

                  binaryStorageProhibited:
                    true,

                  registeredAt:
                    occurredAt,

                  registeredByStaffId:
                    toObjectId(
                      staffId,
                      'staffId',
                    ),

                  transactionId:
                    transaction.transactionId,

                  correlationId:
                    command.actor.correlationId,

                  schemaVersion:
                    1,

                  version:
                    0,

                  createdBy:
                    actorId,

                  updatedBy:
                    actorId,
                },

                series:
                  verified.series.map(
                    (series) => ({
                      _id:
                        new Types.ObjectId(),

                      facilityId:
                        item.facilityId,

                      imagingStudyId:
                        studyId,

                      patientId:
                        item.patientId,

                      seriesInstanceUid:
                        series.seriesInstanceUid,

                      seriesNumber:
                        series.seriesNumber,

                      modalityCodeSnapshot:
                        normalizeRadiologyCode(
                          series.modalityCode,
                        ),

                      bodyRegionCode:
                        series.bodyRegionCode ==
                        null
                          ? null
                          : normalizeRadiologyCode(
                              series.bodyRegionCode,
                            ),

                      laterality:
                        series.laterality ??
                        'NOT_APPLICABLE',

                      description:
                        series.description?.trim() ??
                        null,

                      protocolName:
                        series.protocolName?.trim() ??
                        null,

                      instanceCount:
                        series.instanceCount,

                      externalSeriesId:
                        series.externalSeriesId?.trim() ??
                        null,

                      storageReference:
                        series.storageReference?.trim() ??
                        null,

                      binaryStorageProhibited:
                        true,

                      transactionId:
                        transaction.transactionId,

                      correlationId:
                        command.actor.correlationId,

                      schemaVersion:
                        1,

                      version:
                        0,

                      createdBy:
                        actorId,

                      updatedBy:
                        actorId,
                    }),
                  ),
              },
            );

          await transaction.registerCompensation(
            deleteCreatedRadiologyRecordSetCompensation(
              `delete-radiology-series:${studyId.toHexString()}`,
              {
                facilityId:
                  command.actor.facilityId,

                collection:
                  'radiologyImagingSeries',

                entityIds:
                  study.series.map(
                    (series) =>
                      series._id.toHexString(),
                  ),

                transactionId:
                  transaction.transactionId,
              },
            ),
          );

          await transaction.registerCompensation(
            deleteCreatedRadiologyRecordCompensation(
              `delete-radiology-study:${studyId.toHexString()}`,
              {
                facilityId:
                  command.actor.facilityId,

                collection:
                  'radiologyImagingStudies',

                entityId:
                  studyId.toHexString(),

                transactionId:
                  transaction.transactionId,
              },
            ),
          );

          const itemRestore =
            protectRadiologyRestorePayload(
              {
                facilityId:
                  command.actor.facilityId,

                collection:
                  'radiologyOrderItems',

                entityId:
                  item._id.toHexString(),

                expectedPostVersion:
                  item.version + 1,

                transactionId:
                  transaction.transactionId,

                snapshot:
                  radiologyOrderItemRestoreSnapshot(
                    item,
                  ),

                snapshotCrypto:
                  this.support.dependencies
                    .snapshotCrypto,
              },
            );

          const updatedItem =
            await this.support.orders.transitionItem(
              command.actor.facilityId,
              item._id.toHexString(),
              item.version,
              ['COMPLETED'],
              {
                imagingStudyId:
                  studyId,

                externalStudyIdentifier:
                  verified.studyInstanceUid,

                updatedBy:
                  actorId,
              },
            );

          if (
            updatedItem === null
          ) {
            throw new RadiologyOperationsConcurrencyError();
          }

          await transaction.registerCompensation(
            restoreRadiologyRecordCompensation(
              `restore-study-order-item:${item._id.toHexString()}`,
              itemRestore,
            ),
          );

          await this.emit(
            command.actor,
            transaction.transactionId,
            occurredAt,
            RADIOLOGY_AUDIT_ACTIONS.IMAGING_STUDY_REGISTERED,
            RADIOLOGY_OUTBOX_EVENTS.IMAGING_STUDY_REGISTERED,
            'RadiologyImagingStudy',
            studyId.toHexString(),
            safeStudySnapshot(
              study.study as unknown as Record<
                string,
                unknown
              >,
            ),
            RADIOLOGY_REALTIME_EVENTS.STUDY_CHANGED,
          );

          return {
            ...study,
            orderItem:
              updatedItem,
          };
        },
      },
    );
  }

  private reservationSubjects(
    resourceIds:
      readonly string[],

    staffIds:
      readonly string[],
  ): RadiologyReservationSubject[] {
    return [
      ...resourceIds.map(
        (resourceId) => ({
          subjectType:
            'RESOURCE' as const,

          resourceId,

          staffId:
            null,
        }),
      ),

      ...staffIds.map(
        (staffId) => ({
          subjectType:
            'STAFF' as const,

          resourceId:
            null,

          staffId,
        }),
      ),
    ];
  }

  private async registerReservationRestore(
    actor:
      RadiologyActorContext,

    transactionId:
      string,

    reservation:
      RadiologyResourceReservationRecord,

    expectedPostVersion:
      number,

    register: (
      compensation: {
        key: string;
        type: string;
        payload: Record<
          string,
          unknown
        >;
      },
    ) => Promise<void>,
  ): Promise<void> {
    await register(
      restoreRadiologyRecordCompensation(
        `restore-radiology-reservation:${reservation._id.toHexString()}`,
        protectRadiologyRestorePayload(
          {
            facilityId:
              actor.facilityId,

            collection:
              'radiologyResourceReservations',

            entityId:
              reservation._id.toHexString(),

            expectedPostVersion,

            transactionId,

            snapshot:
              recordSnapshot(
                reservation as unknown as Record<
                  string,
                  unknown
                >,
              ),

            snapshotCrypto:
              this.support.dependencies
                .snapshotCrypto,
          },
        ),
      ),
    );
  }

  private async transitionOrderItem(
    actor:
      RadiologyActorContext,

    transactionId:
      string,

    item:
      RadiologyOrderItemRecord,

    toStatus:
      RadiologyOrderItemRecord['status'],

    update:
      Record<string, unknown>,

    occurredAt:
      Date,

    changedByStaffId:
      Types.ObjectId,

    actorId:
      Types.ObjectId,

    register: (
      compensation: {
        key: string;
        type: string;
        payload: Record<
          string,
          unknown
        >;
      },
    ) => Promise<void>,
  ): Promise<RadiologyOrderItemRecord> {
    const restore =
      protectRadiologyRestorePayload(
        {
          facilityId:
            actor.facilityId,

          collection:
            'radiologyOrderItems',

          entityId:
            item._id.toHexString(),

          expectedPostVersion:
            item.version + 1,

          transactionId,

          snapshot:
            radiologyOrderItemRestoreSnapshot(
              item,
            ),

          snapshotCrypto:
            this.support.dependencies
              .snapshotCrypto,
        },
      );

    const updated =
      await this.support.orders.transitionItem(
        actor.facilityId,
        item._id.toHexString(),
        item.version,
        [item.status],
        {
          ...update,
          status:
            toStatus,
        },
      );

    if (updated === null) {
      throw new RadiologyOperationsConcurrencyError();
    }

    await register(
      restoreRadiologyRecordCompensation(
        `restore-radiology-order-item:${item._id.toHexString()}:${toStatus}`,
        restore,
      ),
    );

    const existingHistory =
      await this.support.orders.listItemHistory(
        actor.facilityId,
        item._id.toHexString(),
      );

    const history =
      await this.support.orders.appendItemHistory(
        {
          facilityId:
            item.facilityId,

          radiologyOrderId:
            item.radiologyOrderId,

          radiologyOrderItemId:
            item._id,

          patientId:
            item.patientId,

          encounterId:
            item.encounterId,

          sequence:
            existingHistory.length + 1,

          fromStatus:
            item.status,

          toStatus,

          changeSource:
            'RADIOLOGY_STAFF',

          reasonCode:
            null,

          reason:
            null,

          occurredAt,

          changedBy:
            changedByStaffId,

          transactionId,

          correlationId:
            actor.correlationId,

          schemaVersion:
            1,

          version:
            0,

          createdBy:
            actorId,

          updatedBy:
            actorId,
        },
      );

    await register(
      deleteCreatedRadiologyRecordCompensation(
        `delete-radiology-order-item-history:${history._id.toHexString()}`,
        {
          facilityId:
            actor.facilityId,

          collection:
            'radiologyOrderItemStatusHistories',

          entityId:
            history._id.toHexString(),

          transactionId,
        },
      ),
    );

    return updated;
  }

  private async transitionOrderIfNeeded(
    actor:
      RadiologyActorContext,

    transactionId:
      string,

    order:
      RadiologyOrderRecord,

    toStatus:
      RadiologyOrderRecord['status'],

    occurredAt:
      Date,

    staffObjectId:
      Types.ObjectId,

    actorId:
      Types.ObjectId,

    register: (
      compensation: {
        key: string;
        type: string;
        payload: Record<
          string,
          unknown
        >;
      },
    ) => Promise<void>,
  ): Promise<RadiologyOrderRecord> {
    if (
      order.status ===
      toStatus
    ) {
      return order;
    }

    assertRadiologyOrderTransition(
      order.status,
      toStatus,
    );

    const restore =
      protectRadiologyRestorePayload(
        {
          facilityId:
            actor.facilityId,

          collection:
            'radiologyOrders',

          entityId:
            order._id.toHexString(),

          expectedPostVersion:
            order.version + 1,

          transactionId,

          snapshot:
            radiologyOrderRestoreSnapshot(
              order,
            ),

          snapshotCrypto:
            this.support.dependencies
              .snapshotCrypto,
        },
      );

    const updated =
      await this.support.orders.transitionStatus(
        actor.facilityId,
        order._id.toHexString(),
        order.version,
        [order.status],
        {
          status:
            toStatus,

          ...(toStatus === 'CHECKED_IN'
            ? {
                checkedInAt:
                  occurredAt,
              }
            : {}),

          ...(toStatus === 'IN_PROGRESS'
            ? {
                examinationStartedAt:
                  occurredAt,
              }
            : {}),

          lastStatusChangedAt:
            occurredAt,

          lastStatusChangedBy:
            staffObjectId,

          updatedBy:
            actorId,
        },
      );

    if (updated === null) {
      throw new RadiologyOperationsConcurrencyError();
    }

    await register(
      restoreRadiologyRecordCompensation(
        `restore-radiology-order:${order._id.toHexString()}:${toStatus}`,
        restore,
      ),
    );

    const existingHistory =
      await this.support.orders.listHistory(
        actor.facilityId,
        order._id.toHexString(),
      );

    const history =
      await this.support.orders.appendHistory(
        {
          facilityId:
            order.facilityId,

          radiologyOrderId:
            order._id,

          patientId:
            order.patientId,

          encounterId:
            order.encounterId,

          sequence:
            existingHistory.length + 1,

          fromStatus:
            order.status,

          toStatus,

          changeSource:
            'RADIOLOGY_STAFF',

          reasonCode:
            null,

          reason:
            null,

          occurredAt,

          changedBy:
            staffObjectId,

          transactionId,

          correlationId:
            actor.correlationId,

          schemaVersion:
            1,

          version:
            0,

          createdBy:
            actorId,

          updatedBy:
            actorId,
        },
      );

    await register(
      deleteCreatedRadiologyRecordCompensation(
        `delete-radiology-order-history:${history._id.toHexString()}`,
        {
          facilityId:
            actor.facilityId,

          collection:
            'radiologyOrderStatusHistories',

          entityId:
            history._id.toHexString(),

          transactionId,
        },
      ),
    );

    return updated;
  }

  private async emit(
    actor:
      RadiologyActorContext,

    transactionId:
      string,

    occurredAt:
      Date,

    auditAction:
      string,

    outboxEvent:
      string,

    entityType:
      string,

    entityId:
      string,

    payload:
      Record<string, unknown>,

    realtimeEvent:
      string,

    reason?:
      string,
  ): Promise<void> {
    await this.support.dependencies.audit.append(
      {
        transactionId,

        deduplicationKey:
          this.support.deduplicationKey(
            transactionId,
            auditAction,
            entityId,
          ),

        action:
          auditAction,

        entityType,

        entityId,

        ...this.support.auditActorFields(
          actor,
        ),

        occurredAt,

        ...(reason === undefined
          ? {}
          : {
              reason,
            }),

        metadata:
          payload,
      },
    );

    await this.support.dependencies.outbox.enqueue(
      {
        transactionId,

        deduplicationKey:
          this.support.deduplicationKey(
            transactionId,
            outboxEvent,
            entityId,
          ),

        eventType:
          outboxEvent,

        aggregateType:
          entityType,

        aggregateId:
          entityId,

        actorUserId:
          actor.userId,

        facilityId:
          actor.facilityId,

        correlationId:
          actor.correlationId,

        occurredAt,

        payload,
      },
    );

    await this.support.dependencies.realtime.publish(
      {
        eventType:
          realtimeEvent,

        facilityId:
          actor.facilityId,

        payload,
      },
    );
  }
}