import {
  Types,
} from 'mongoose';

import {
  describe,
  expect,
  it,
} from 'vitest';

import type {
  RegistrationQueueAuditEntry,
  RegistrationQueueEncryptedSnapshot,
  RegistrationQueueOutboxMessage,
  RegistrationQueueRealtimeMessage,
  RegistrationQueueTransactionRequest,
} from '../registration-queue.ports.js';

import type {
  OpdVisitRecord,
  QueueDefinitionRecord,
  QueueStatusHistoryRecord,
  QueueTokenRecord,
} from '../registration-queue.types.js';

import {
  ChangeQueueStatusWorkflow,
} from '../workflows/change-queue-status.workflow.js';

import {
  UpdateQueueAssignmentWorkflow,
} from '../workflows/update-queue-assignment.workflow.js';

import {
  UpdateQueuePriorityWorkflow,
} from '../workflows/update-queue-priority.workflow.js';

const facilityId =
  '507f1f77bcf86cd799439011';

const queueTokenId =
  '507f191e810c19729de860e1';

const visitId =
  '507f191e810c19729de860e2';

const patientId =
  '507f191e810c19729de860e3';

const registrationId =
  '507f191e810c19729de860e4';

const queueDefinitionId =
  '507f191e810c19729de860e5';

const departmentId =
  '507f191e810c19729de860e6';

const providerId =
  '507f191e810c19729de860e7';

const replacementProviderId =
  '507f191e810c19729de860e8';

const counterId =
  '507f191e810c19729de860e9';

const replacementCounterId =
  '507f191e810c19729de860ea';

const actorUserId =
  '507f191e810c19729de860eb';

const queueEntryId =
  'd9428888-122b-4e4f-a61f-879cb972ec04';

function objectId(
  value: string,
): Types.ObjectId {
  return new Types.ObjectId(
    value,
  );
}

function queueRecord(
  overrides:
    Partial<QueueTokenRecord> = {},
): QueueTokenRecord {
  const queuedAt =
    new Date(
      '2026-07-18T04:00:00.000Z',
    );

  return {
    _id:
      objectId(
        queueTokenId,
      ),

    facilityId:
      objectId(
        facilityId,
      ),

    queueEntryId,

    registrationId:
      objectId(
        registrationId,
      ),

    opdVisitId:
      objectId(
        visitId,
      ),

    patientId:
      objectId(
        patientId,
      ),

    queueDefinitionId:
      objectId(
        queueDefinitionId,
      ),

    serviceDate:
      '2026-07-18',

    tokenNumber:
      1,

    tokenPrefix:
      'A',

    tokenLabel:
      'A1',

    status:
      'WAITING',

    priorityClass:
      'ROUTINE',

    priorityScore:
      0,

    triagePriority:
      'NOT_TRIAGED',

    emergencyOverride:
      false,

    emergencyOverrideReason:
      null,

    specialCategories:
      [],

    assignedProviderId:
      objectId(
        providerId,
      ),

    assignedCounterId:
      objectId(
        counterId,
      ),

    activeEntryKey:
      visitId,

    queuedAt,

    calledAt:
      null,

    servingAt:
      null,

    skippedAt:
      null,

    transferredAt:
      null,

    completedAt:
      null,

    cancelledAt:
      null,

    noShowAt:
      null,

    skipCount:
      0,

    recallCount:
      0,

    transferCount:
      0,

    estimatedWaitMinutes:
      null,

    estimatedServiceAt:
      null,

    transferredFromQueueTokenId:
      null,

    transferredToQueueTokenId:
      null,

    transferReason:
      null,

    statusReason:
      null,

    lastStatusChangedAt:
      queuedAt,

    lastStatusChangedBy:
      objectId(
        actorUserId,
      ),

    transactionId:
      'transaction-original',

    correlationId:
      'correlation-001',

    schemaVersion:
      1,

    version:
      0,

    createdBy:
      objectId(
        actorUserId,
      ),

    updatedBy:
      objectId(
        actorUserId,
      ),

    createdAt:
      queuedAt,

    updatedAt:
      queuedAt,

    ...overrides,
  };
}

function visitRecord(
  overrides:
    Partial<OpdVisitRecord> = {},
): OpdVisitRecord {
  const arrivedAt =
    new Date(
      '2026-07-18T03:55:00.000Z',
    );

  return {
    _id:
      objectId(
        visitId,
      ),

    facilityId:
      objectId(
        facilityId,
      ),

    visitNumber:
      'OPD-KTH-20260718-000001',

    registrationId:
      objectId(
        registrationId,
      ),

    patientId:
      objectId(
        patientId,
      ),

    requestedPatientId:
      objectId(
        patientId,
      ),

    canonicalRedirected:
      false,

    serviceDate:
      '2026-07-18',

    visitType:
      'RETURNING_PATIENT',

    registrationSource:
      'WALK_IN',

    status:
      'QUEUED',

    departmentId:
      objectId(
        departmentId,
      ),

    clinicId:
      null,

    servicePointId:
      null,

    assignedProviderId:
      objectId(
        providerId,
      ),

    assignedCounterId:
      objectId(
        counterId,
      ),

    currentQueueTokenId:
      objectId(
        queueTokenId,
      ),

    activeVisitKey:
      `${patientId}:2026-07-18:${departmentId}:-:-`,

    arrivedAt,

    checkedInAt:
      null,

    queuedAt:
      new Date(
        '2026-07-18T04:00:00.000Z',
      ),

    serviceStartedAt:
      null,

    completedAt:
      null,

    cancelledAt:
      null,

    cancelledBy:
      null,

    cancellationReason:
      null,

    noShowAt:
      null,

    noShowMarkedBy:
      null,

    supersedesVisitId:
      null,

    supersededByVisitId:
      null,

    correctionReason:
      null,

    transactionId:
      'transaction-original',

    correlationId:
      'correlation-001',

    schemaVersion:
      1,

    version:
      0,

    createdBy:
      objectId(
        actorUserId,
      ),

    updatedBy:
      objectId(
        actorUserId,
      ),

    createdAt:
      arrivedAt,

    updatedAt:
      arrivedAt,

    ...overrides,
  };
}

function queueDefinition(): QueueDefinitionRecord {
  return {
    _id:
      objectId(
        queueDefinitionId,
      ),

    facilityId:
      objectId(
        facilityId,
      ),

    departmentId:
      objectId(
        departmentId,
      ),

    clinicId:
      null,

    servicePointId:
      null,

    providerId:
      null,

    code:
      'MED_OPD',

    name:
      'Medicine OPD',

    displayLabel:
      'Medicine',

    tokenPrefix:
      'A',

    resetPolicy:
      'SERVICE_DATE',

    timezone:
      'Asia/Karachi',

    estimatedServiceMinutes:
      15,

    maximumRecallCount:
      2,

    allowPriority:
      true,

    allowEmergencyOverride:
      true,

    publicDisplayEnabled:
      true,

    publicDisplayMode:
      'TOKEN_AND_COUNTER',

    status:
      'ACTIVE',

    deactivatedAt:
      null,

    deactivatedBy:
      null,

    deactivationReason:
      null,

    schemaVersion:
      1,

    version:
      0,

    createdBy:
      objectId(
        actorUserId,
      ),

    updatedBy:
      objectId(
        actorUserId,
      ),

    createdAt:
      new Date(
        '2026-07-18T00:00:00.000Z',
      ),

    updatedAt:
      new Date(
        '2026-07-18T00:00:00.000Z',
      ),
  };
}

function runtime() {
  const audits:
    RegistrationQueueAuditEntry[] = [];

  const outbox:
    RegistrationQueueOutboxMessage[] = [];

  const realtime:
    RegistrationQueueRealtimeMessage[] = [];

  const compensations:
    unknown[] = [];

  const checkpoints:
    string[] = [];

  const transactionManager = {
    async execute<T>(
      request: RegistrationQueueTransactionRequest<T>,
    ): Promise<T> {
      return request.execute({
        transactionId:
          'transaction-queue-001',

        idempotencyKey:
          request.idempotencyKey,

        async checkpoint(
          state,
        ) {
          checkpoints.push(
            state,
          );
        },

        async registerCompensation(
          compensation,
        ) {
          compensations.push(
            compensation,
          );
        },
      });
    },
  };

  const encryptedSnapshot:
    RegistrationQueueEncryptedSnapshot = {
      algorithm:
        'AES-256-GCM',

      keyVersion:
        'v1',

      initializationVector:
        'initialization-vector',

      authenticationTag:
        'authentication-tag',

      ciphertext:
        'encrypted-ciphertext',
    };

  return {
    dependencies: {
      transactionManager,

      audit: {
        async append(
          entry: RegistrationQueueAuditEntry,
        ) {
          audits.push(
            entry,
          );
        },
      },

      outbox: {
        async enqueue(
          message: RegistrationQueueOutboxMessage,
        ) {
          outbox.push(
            message,
          );
        },
      },

      realtime: {
        async publish(
          message: RegistrationQueueRealtimeMessage,
        ) {
          realtime.push(
            message,
          );
        },
      },

      clock: {
        now() {
          return new Date(
            '2026-07-18T04:05:00.000Z',
          );
        },
      },

      snapshotCrypto: {
        protect() {
          return {
            encryptedValue:
              encryptedSnapshot,

            valueHash:
              'snapshot-hash',
          };
        },

        unprotect<T>() {
          return {} as T;
        },

        hash() {
          return 'snapshot-hash';
        },

        matchesHash() {
          return true;
        },

        needsRotation() {
          return false;
        },
      },
    },

    audits,
    outbox,
    realtime,
    compensations,
    checkpoints,
  };
}

describe(
  'registration and OPD queue lifecycle workflows',
  () => {
    it(
      'calls a waiting token and synchronizes the OPD visit',
      async () => {
        let currentQueue =
          queueRecord();

        let currentVisit =
          visitRecord();

        const history:
          QueueStatusHistoryRecord[] = [];

        const state =
          runtime();

        const workflow =
          new ChangeQueueStatusWorkflow(
            {
              async findByEntryId() {
                return currentQueue;
              },
            } as never,
            {
              async transitionWithVersion(
                input: {
                  status: QueueTokenRecord['status'];
                  occurredAt: Date;
                  assignedProviderId: string | null;
                  assignedCounterId: string | null;
                },
              ) {
                currentQueue =
                  queueRecord({
                    status:
                      input.status,

                    calledAt:
                      input.occurredAt,

                    assignedProviderId:
                      input.assignedProviderId ===
                      null
                        ? null
                        : objectId(
                            input.assignedProviderId,
                          ),

                    assignedCounterId:
                      input.assignedCounterId ===
                      null
                        ? null
                        : objectId(
                            input.assignedCounterId,
                          ),

                    lastStatusChangedAt:
                      input.occurredAt,

                    version:
                      1,

                    updatedAt:
                      input.occurredAt,
                  });

                return currentQueue;
              },
            } as never,
            {
              async findById() {
                return currentVisit;
              },
            } as never,
            {
              async applyQueueStatusWithVersion(
                input: {
                  queueStatus: QueueTokenRecord['status'];
                  occurredAt: Date;
                },
              ) {
                currentVisit =
                  visitRecord({
                    status:
                      input.queueStatus ===
                      'CALLED'
                        ? 'QUEUED'
                        : currentVisit.status,

                    version:
                      1,

                    updatedAt:
                      input.occurredAt,
                  });

                return currentVisit;
              },
            } as never,
            {
              async nextSequence() {
                return 2;
              },

              async append(
                input: {
                  historyId: string;
                  occurredAt: Date;
                  fromStatus: QueueStatusHistoryRecord['fromStatus'];
                  toStatus: QueueStatusHistoryRecord['toStatus'];
                },
              ) {
                const item = {
                  _id:
                    objectId(
                      input.historyId,
                    ),

                  facilityId:
                    objectId(
                      facilityId,
                    ),

                  queueTokenId:
                    objectId(
                      queueTokenId,
                    ),

                  queueEntryId,

                  opdVisitId:
                    objectId(
                      visitId,
                    ),

                  patientId:
                    objectId(
                      patientId,
                    ),

                  sequence:
                    2,

                  fromStatus:
                    input.fromStatus,

                  toStatus:
                    input.toStatus,

                  queueDefinitionId:
                    objectId(
                      queueDefinitionId,
                    ),

                  destinationQueueDefinitionId:
                    null,

                  providerId:
                    objectId(
                      providerId,
                    ),

                  destinationProviderId:
                    null,

                  counterId:
                    objectId(
                      counterId,
                    ),

                  destinationCounterId:
                    null,

                  changeSource:
                    'RECEPTION',

                  transferReason:
                    null,

                  reason:
                    null,

                  occurredAt:
                    input.occurredAt,

                  changedBy:
                    objectId(
                      actorUserId,
                    ),

                  transactionId:
                    'transaction-queue-001',

                  correlationId:
                    'correlation-001',

                  schemaVersion:
                    1,

                  version:
                    0,

                  createdBy:
                    objectId(
                      actorUserId,
                    ),

                  updatedBy:
                    objectId(
                      actorUserId,
                    ),

                  createdAt:
                    input.occurredAt,

                  updatedAt:
                    input.occurredAt,
                } satisfies QueueStatusHistoryRecord;

                history.push(
                  item,
                );

                return item;
              },
            } as never,
            {
              async resolve() {
                return {
                  queueDefinition:
                    queueDefinition(),

                  provider:
                    null,

                  counter:
                    null,

                  assignedProviderId:
                    providerId,

                  assignedCounterId:
                    counterId,
                };
              },
            } as never,
            state.dependencies,
          );

        const result =
          await workflow.execute({
            queueEntryId,

            input: {
              expectedVersion:
                0,

              status:
                'CALLED',

              counterId,

              providerId,

              changeSource:
                'RECEPTION',
            },

            actor: {
              userId:
                actorUserId,

              facilityId,

              correlationId:
                'correlation-001',
            },

            idempotencyKey:
              'queue-call-001',
          });

        expect(
          result.queue.status,
        ).toBe(
          'CALLED',
        );

        expect(
          result.visit?.status,
        ).toBe(
          'QUEUED',
        );

        expect(
          result.history,
        ).toMatchObject({
          sequence:
            2,

          fromStatus:
            'WAITING',

          toStatus:
            'CALLED',
        });

        expect(
          history,
        ).toHaveLength(
          1,
        );

        expect(
          state.compensations,
        ).toHaveLength(
          3,
        );

        expect(
          state.audits,
        ).toHaveLength(
          1,
        );

        expect(
          state.outbox,
        ).toHaveLength(
          1,
        );

        expect(
          state.realtime,
        ).toHaveLength(
          1,
        );
      },
    );

    it(
      'updates provider and counter assignments with visit synchronization',
      async () => {
        let currentQueue =
          queueRecord();

        let currentVisit =
          visitRecord();

        const state =
          runtime();

        const workflow =
          new UpdateQueueAssignmentWorkflow(
            {
              async findByEntryId() {
                return currentQueue;
              },
            } as never,
            {
              async updateAssignmentWithVersion(
                input: {
                  assignedProviderId: string | null;
                  assignedCounterId: string | null;
                  occurredAt: Date;
                },
              ) {
                currentQueue =
                  queueRecord({
                    assignedProviderId:
                      input.assignedProviderId ===
                      null
                        ? null
                        : objectId(
                            input.assignedProviderId,
                          ),

                    assignedCounterId:
                      input.assignedCounterId ===
                      null
                        ? null
                        : objectId(
                            input.assignedCounterId,
                          ),

                    lastStatusChangedAt:
                      input.occurredAt,

                    version:
                      1,

                    updatedAt:
                      input.occurredAt,
                  });

                return currentQueue;
              },
            } as never,
            {
              async findById() {
                return currentVisit;
              },
            } as never,
            {
              async updateQueueAssignmentWithVersion(
                input: {
                  assignedProviderId: string | null;
                  assignedCounterId: string | null;
                },
              ) {
                currentVisit =
                  visitRecord({
                    assignedProviderId:
                      input.assignedProviderId ===
                      null
                        ? null
                        : objectId(
                            input.assignedProviderId,
                          ),

                    assignedCounterId:
                      input.assignedCounterId ===
                      null
                        ? null
                        : objectId(
                            input.assignedCounterId,
                          ),

                    version:
                      1,
                  });

                return currentVisit;
              },
            } as never,
            {
              async resolve() {
                return {
                  queueDefinition:
                    queueDefinition(),

                  provider:
                    null,

                  counter:
                    null,

                  assignedProviderId:
                    replacementProviderId,

                  assignedCounterId:
                    replacementCounterId,
                };
              },
            } as never,
            state.dependencies,
          );

        const result =
          await workflow.execute({
            queueEntryId,

            input: {
              expectedVersion:
                0,

              assignedProviderId:
                replacementProviderId,

              assignedCounterId:
                replacementCounterId,

              reason:
                'Operational queue reassignment',
            },

            actor: {
              userId:
                actorUserId,

              facilityId,

              correlationId:
                'correlation-001',
            },

            idempotencyKey:
              'queue-assignment-001',
          });

        expect(
          result.queue.assignedProviderId,
        ).toBe(
          replacementProviderId,
        );

        expect(
          result.queue.assignedCounterId,
        ).toBe(
          replacementCounterId,
        );

        expect(
          result.visit?.assignedProviderId,
        ).toBe(
          replacementProviderId,
        );

        expect(
          state.compensations,
        ).toHaveLength(
          2,
        );

        expect(
          state.audits,
        ).toHaveLength(
          1,
        );

        expect(
          state.outbox,
        ).toHaveLength(
          1,
        );
      },
    );

    it(
      'updates queue priority with emergency and special-category scoring',
      async () => {
        let currentQueue =
          queueRecord();

        const state =
          runtime();

        const workflow =
          new UpdateQueuePriorityWorkflow(
            {
              async findByEntryId() {
                return currentQueue;
              },
            } as never,
            {
              async updatePriorityWithVersion(
                input: {
                  priorityClass: QueueTokenRecord['priorityClass'];
                  priorityScore: number;
                  triagePriority: QueueTokenRecord['triagePriority'];
                  emergencyOverride: boolean;
                  emergencyOverrideReason: string | null;
                  specialCategories: QueueTokenRecord['specialCategories'];
                  occurredAt: Date;
                },
              ) {
                currentQueue =
                  queueRecord({
                    priorityClass:
                      input.priorityClass,

                    priorityScore:
                      input.priorityScore,

                    triagePriority:
                      input.triagePriority,

                    emergencyOverride:
                      input.emergencyOverride,

                    emergencyOverrideReason:
                      input.emergencyOverrideReason,

                    specialCategories: [
                      ...input.specialCategories,
                    ],

                    lastStatusChangedAt:
                      input.occurredAt,

                    version:
                      1,

                    updatedAt:
                      input.occurredAt,
                  });

                return currentQueue;
              },
            } as never,
            {
              async resolve() {
                return {
                  queueDefinition:
                    queueDefinition(),

                  provider:
                    null,

                  counter:
                    null,

                  assignedProviderId:
                    providerId,

                  assignedCounterId:
                    counterId,
                };
              },
            } as never,
            state.dependencies,
          );

        const result =
          await workflow.execute({
            queueEntryId,

            input: {
              expectedVersion:
                0,

              priorityClass:
                'EMERGENCY',

              triagePriority:
                'LEVEL_1_RESUSCITATION',

              emergencyOverride:
                true,

              emergencyOverrideReason:
                'Immediate resuscitation required',

              specialCategories: [
                'CHILD',
              ],

              reason:
                'Emergency triage escalation',
            },

            actor: {
              userId:
                actorUserId,

              facilityId,

              correlationId:
                'correlation-001',
            },

            idempotencyKey:
              'queue-priority-001',
          });

        expect(
          result.queue.priorityClass,
        ).toBe(
          'EMERGENCY',
        );

        expect(
          result.queue.triagePriority,
        ).toBe(
          'LEVEL_1_RESUSCITATION',
        );

        expect(
          result.queue.emergencyOverride,
        ).toBe(
          true,
        );

        expect(
          result.queue.priorityScore,
        ).toBeGreaterThan(
          100_000,
        );

        expect(
          state.compensations,
        ).toHaveLength(
          1,
        );

        expect(
          state.audits,
        ).toHaveLength(
          1,
        );

        expect(
          state.outbox,
        ).toHaveLength(
          1,
        );

        expect(
          state.realtime,
        ).toHaveLength(
          1,
        );
      },
    );
  },
);