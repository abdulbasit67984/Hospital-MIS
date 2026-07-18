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
  RegistrationRecord,
} from '../registration-queue.types.js';

import {
  CancelOpdVisitWorkflow,
} from '../workflows/cancel-opd-visit.workflow.js';

import {
  MarkOpdVisitNoShowWorkflow,
} from '../workflows/mark-opd-visit-no-show.workflow.js';

import {
  TransferQueueEntryWorkflow,
} from '../workflows/transfer-queue-entry.workflow.js';

const facilityId =
  '507f1f77bcf86cd799439011';

const registrationId =
  '507f191e810c19729de860e1';

const visitId =
  '507f191e810c19729de860e2';

const patientId =
  '507f191e810c19729de860e3';

const sourceQueueTokenId =
  '507f191e810c19729de860e4';

const sourceQueueDefinitionId =
  '507f191e810c19729de860e5';

const destinationQueueDefinitionId =
  '507f191e810c19729de860e6';

const sourceDepartmentId =
  '507f191e810c19729de860e7';

const destinationDepartmentId =
  '507f191e810c19729de860e8';

const sourceProviderId =
  '507f191e810c19729de860e9';

const destinationProviderId =
  '507f191e810c19729de860ea';

const sourceCounterId =
  '507f191e810c19729de860eb';

const destinationCounterId =
  '507f191e810c19729de860ec';

const actorUserId =
  '507f191e810c19729de860ed';

const sourceQueueEntryId =
  'd9428888-122b-4e4f-a61f-879cb972ec04';

function objectId(
  value: string,
): Types.ObjectId {
  return new Types.ObjectId(
    value,
  );
}

function registrationRecord(
  overrides:
    Partial<RegistrationRecord> = {},
): RegistrationRecord {
  const createdAt =
    new Date(
      '2026-07-18T03:50:00.000Z',
    );

  return {
    _id:
      objectId(
        registrationId,
      ),

    facilityId:
      objectId(
        facilityId,
      ),

    registrationNumber:
      'REG-KTH-20260718-000001',

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

    registrationMode:
      'RETURNING_PATIENT',

    registrationSource:
      'WALK_IN',

    visitType:
      'RETURNING_PATIENT',

    status:
      'ACTIVE',

    serviceDate:
      '2026-07-18',

    arrivedAt:
      createdAt,

    checkedInAt:
      null,

    appointmentId:
      null,

    referralId:
      null,

    referralReference:
      null,

    emergencyCaseId:
      null,

    departmentId:
      objectId(
        sourceDepartmentId,
      ),

    clinicId:
      null,

    servicePointId:
      null,

    assignedProviderId:
      objectId(
        sourceProviderId,
      ),

    registrationNotes:
      null,

    cancelledAt:
      null,

    cancelledBy:
      null,

    cancellationReason:
      null,

    supersedesRegistrationId:
      null,

    supersededByRegistrationId:
      null,

    correctionReason:
      null,

    transactionId:
      'original-registration-transaction',

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

    createdAt,

    updatedAt:
      createdAt,

    ...overrides,
  };
}

function visitRecord(
  overrides:
    Partial<OpdVisitRecord> = {},
): OpdVisitRecord {
  const arrivedAt =
    new Date(
      '2026-07-18T03:50:00.000Z',
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
        sourceDepartmentId,
      ),

    clinicId:
      null,

    servicePointId:
      null,

    assignedProviderId:
      objectId(
        sourceProviderId,
      ),

    assignedCounterId:
      objectId(
        sourceCounterId,
      ),

    currentQueueTokenId:
      objectId(
        sourceQueueTokenId,
      ),

    activeVisitKey:
      `${patientId}:2026-07-18:${sourceDepartmentId}:-:-`,

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
      'original-visit-transaction',

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
        sourceQueueTokenId,
      ),

    facilityId:
      objectId(
        facilityId,
      ),

    queueEntryId:
      sourceQueueEntryId,

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
        sourceQueueDefinitionId,
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
        sourceProviderId,
      ),

    assignedCounterId:
      objectId(
        sourceCounterId,
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
      'original-queue-transaction',

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

function destinationDefinition(): QueueDefinitionRecord {
  return {
    _id:
      objectId(
        destinationQueueDefinitionId,
      ),

    facilityId:
      objectId(
        facilityId,
      ),

    departmentId:
      objectId(
        destinationDepartmentId,
      ),

    clinicId:
      null,

    servicePointId:
      null,

    providerId:
      null,

    code:
      'SURG_OPD',

    name:
      'Surgery OPD',

    displayLabel:
      'Surgery',

    tokenPrefix:
      'S',

    resetPolicy:
      'SERVICE_DATE',

    timezone:
      'Asia/Karachi',

    estimatedServiceMinutes:
      20,

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

function historyRecord(
  input: Readonly<{
    historyId: string;
    queueTokenId: string;
    queueEntryId: string;
    sequence: number;
    fromStatus: QueueStatusHistoryRecord['fromStatus'];
    toStatus: QueueStatusHistoryRecord['toStatus'];
    queueDefinitionId: string;
    destinationQueueDefinitionId?: string | null;
    occurredAt: Date;
  }>,
): QueueStatusHistoryRecord {
  return {
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
        input.queueTokenId,
      ),

    queueEntryId:
      input.queueEntryId,

    opdVisitId:
      objectId(
        visitId,
      ),

    patientId:
      objectId(
        patientId,
      ),

    sequence:
      input.sequence,

    fromStatus:
      input.fromStatus,

    toStatus:
      input.toStatus,

    queueDefinitionId:
      objectId(
        input.queueDefinitionId,
      ),

    destinationQueueDefinitionId:
      input.destinationQueueDefinitionId ===
        undefined ||
      input.destinationQueueDefinitionId ===
        null
        ? null
        : objectId(
            input.destinationQueueDefinitionId,
          ),

    providerId:
      null,

    destinationProviderId:
      null,

    counterId:
      null,

    destinationCounterId:
      null,

    changeSource:
      'RECEPTION',

    transferReason:
      input.toStatus ===
      'TRANSFERRED'
        ? 'CLINIC_REASSIGNMENT'
        : null,

    reason:
      'Workflow test reason',

    occurredAt:
      input.occurredAt,

    changedBy:
      objectId(
        actorUserId,
      ),

    transactionId:
      'transaction-registration-queue-001',

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
        'ciphertext',
    };

  return {
    dependencies: {
      transactionManager: {
        async execute<T>(
          request: RegistrationQueueTransactionRequest<T>,
        ): Promise<T> {
          return request.execute({
            transactionId:
              'transaction-registration-queue-001',

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
      },

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
            '2026-07-18T04:10:00.000Z',
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
  'queue transfer and OPD visit lifecycle workflows',
  () => {
    it(
      'transfers an active queue entry and reassigns the OPD visit',
      async () => {
        let sourceQueue =
          queueRecord();

        let currentVisit =
          visitRecord();

        let destinationQueue:
          QueueTokenRecord | null =
            null;

        const state =
          runtime();

        const workflow =
          new TransferQueueEntryWorkflow(
            {
              async findByEntryId() {
                return sourceQueue;
              },

              async create(
                input: Record<string, unknown>,
              ) {
                destinationQueue =
                  queueRecord({
                    _id:
                      objectId(
                        String(
                          input['queueTokenId'],
                        ),
                      ),

                    queueEntryId:
                      String(
                        input['queueEntryId'],
                      ),

                    queueDefinitionId:
                      objectId(
                        destinationQueueDefinitionId,
                      ),

                    tokenNumber:
                      1,

                    tokenPrefix:
                      'S',

                    tokenLabel:
                      'S1',

                    assignedProviderId:
                      objectId(
                        destinationProviderId,
                      ),

                    assignedCounterId:
                      objectId(
                        destinationCounterId,
                      ),

                    transferredFromQueueTokenId:
                      objectId(
                        sourceQueueTokenId,
                      ),

                    transferCount:
                      1,

                    transactionId:
                      'transaction-registration-queue-001',

                    queuedAt:
                      input['queuedAt'] as Date,

                    lastStatusChangedAt:
                      input['queuedAt'] as Date,
                  });

                return destinationQueue;
              },
            } as never,
            {
              async markTransferredWithVersion(
                input: {
                  destinationQueueTokenId: string;
                  occurredAt: Date;
                },
              ) {
                sourceQueue =
                  queueRecord({
                    status:
                      'TRANSFERRED',

                    activeEntryKey:
                      null,

                    transferredAt:
                      input.occurredAt,

                    transferredToQueueTokenId:
                      objectId(
                        input.destinationQueueTokenId,
                      ),

                    transferReason:
                      'CLINIC_REASSIGNMENT',

                    transferCount:
                      1,

                    lastStatusChangedAt:
                      input.occurredAt,

                    version:
                      1,
                  });

                return sourceQueue;
              },
            } as never,
            {
              async findById() {
                return currentVisit;
              },
            } as never,
            {
              async transferWithVersion(
                input: {
                  destinationQueueTokenId: string;
                  occurredAt: Date;
                },
              ) {
                currentVisit =
                  visitRecord({
                    status:
                      'QUEUED',

                    departmentId:
                      objectId(
                        destinationDepartmentId,
                      ),

                    assignedProviderId:
                      objectId(
                        destinationProviderId,
                      ),

                    assignedCounterId:
                      objectId(
                        destinationCounterId,
                      ),

                    currentQueueTokenId:
                      objectId(
                        input.destinationQueueTokenId,
                      ),

                    activeVisitKey:
                      `${patientId}:2026-07-18:${destinationDepartmentId}:-:-`,

                    queuedAt:
                      input.occurredAt,

                    version:
                      1,
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
                  queueTokenId: string;
                  queueEntryId: string;
                  sequence: number;
                  fromStatus: QueueStatusHistoryRecord['fromStatus'];
                  toStatus: QueueStatusHistoryRecord['toStatus'];
                  queueDefinitionId: string;
                  destinationQueueDefinitionId?: string | null;
                  occurredAt: Date;
                },
              ) {
                return historyRecord(
                  input,
                );
              },
            } as never,
            {
              async resolve() {
                return {
                  queueDefinition:
                    destinationDefinition(),

                  provider:
                    null,

                  counter:
                    null,

                  assignedProviderId:
                    destinationProviderId,

                  assignedCounterId:
                    destinationCounterId,
                };
              },
            } as never,
            {
              async allocateQueueTokenNumber() {
                return {
                  facilityId,

                  serviceDate:
                    '2026-07-18',

                  queueDefinitionId:
                    destinationQueueDefinitionId,

                  sequenceValue:
                    1,

                  tokenNumber:
                    1,

                  tokenPrefix:
                    'S',

                  tokenLabel:
                    'S1',
                };
              },
            } as never,
            state.dependencies,
          );

        const result =
          await workflow.execute({
            queueEntryId:
              sourceQueueEntryId,

            input: {
              expectedVersion:
                0,

              destinationQueueDefinitionId,

              destinationProviderId,

              destinationCounterId,

              transferReason:
                'CLINIC_REASSIGNMENT',

              reason:
                'Transferred to surgery clinic',
            },

            actor: {
              userId:
                actorUserId,

              facilityId,

              correlationId:
                'correlation-001',
            },

            idempotencyKey:
              'queue-transfer-001',
          });

        expect(
          result.sourceQueue.status,
        ).toBe(
          'TRANSFERRED',
        );

        expect(
          result.destinationQueue,
        ).toMatchObject({
          status:
            'WAITING',

          tokenLabel:
            'S1',

          queueDefinitionId:
            destinationQueueDefinitionId,

          assignedProviderId:
            destinationProviderId,

          assignedCounterId:
            destinationCounterId,
        });

        expect(
          result.visit,
        ).toMatchObject({
          status:
            'QUEUED',

          departmentId:
            destinationDepartmentId,

          assignedProviderId:
            destinationProviderId,

          assignedCounterId:
            destinationCounterId,
        });

        expect(
          result.sourceHistory,
        ).toMatchObject({
          fromStatus:
            'WAITING',

          toStatus:
            'TRANSFERRED',

          destinationQueueDefinitionId,
        });

        expect(
          result.destinationHistory,
        ).toMatchObject({
          fromStatus:
            null,

          toStatus:
            'WAITING',
        });

        expect(
          destinationQueue,
        ).not.toBeNull();

        expect(
          state.compensations,
        ).toHaveLength(
          5,
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
      'cancels registration, visit, and active queue together',
      async () => {
        let registration =
          registrationRecord();

        let visit =
          visitRecord();

        let queue =
          queueRecord();

        const state =
          runtime();

        const workflow =
          new CancelOpdVisitWorkflow(
            {
              async findById() {
                return registration;
              },

              async cancelWithVersion(
                input: {
                  cancelledAt: Date;
                },
              ) {
                registration =
                  registrationRecord({
                    status:
                      'CANCELLED',

                    cancelledAt:
                      input.cancelledAt,

                    cancelledBy:
                      objectId(
                        actorUserId,
                      ),

                    cancellationReason:
                      'Patient requested cancellation',

                    version:
                      1,
                  });

                return registration;
              },
            } as never,
            {
              async findById() {
                return visit;
              },
            } as never,
            {
              async cancelWithVersion(
                input: {
                  occurredAt: Date;
                },
              ) {
                visit =
                  visitRecord({
                    status:
                      'CANCELLED',

                    activeVisitKey:
                      null,

                    cancelledAt:
                      input.occurredAt,

                    cancelledBy:
                      objectId(
                        actorUserId,
                      ),

                    cancellationReason:
                      'Patient requested cancellation',

                    version:
                      1,
                  });

                return visit;
              },
            } as never,
            {
              async findActiveByVisitId() {
                return queue;
              },
            } as never,
            {
              async transitionWithVersion(
                input: {
                  occurredAt: Date;
                },
              ) {
                queue =
                  queueRecord({
                    status:
                      'CANCELLED',

                    activeEntryKey:
                      null,

                    cancelledAt:
                      input.occurredAt,

                    lastStatusChangedAt:
                      input.occurredAt,

                    version:
                      1,
                  });

                return queue;
              },
            } as never,
            {
              async nextSequence() {
                return 2;
              },

              async append(
                input: {
                  historyId: string;
                  sequence: number;
                  fromStatus: QueueStatusHistoryRecord['fromStatus'];
                  toStatus: QueueStatusHistoryRecord['toStatus'];
                  occurredAt: Date;
                },
              ) {
                return historyRecord({
                  historyId:
                    input.historyId,

                  queueTokenId:
                    sourceQueueTokenId,

                  queueEntryId:
                    sourceQueueEntryId,

                  sequence:
                    input.sequence,

                  fromStatus:
                    input.fromStatus,

                  toStatus:
                    input.toStatus,

                  queueDefinitionId:
                    sourceQueueDefinitionId,

                  occurredAt:
                    input.occurredAt,
                });
              },
            } as never,
            state.dependencies,
          );

        const result =
          await workflow.execute({
            visitId,

            input: {
              expectedVersion:
                0,

              reason:
                'Patient requested cancellation',
            },

            actor: {
              userId:
                actorUserId,

              facilityId,

              correlationId:
                'correlation-001',
            },

            idempotencyKey:
              'visit-cancellation-001',
          });

        expect(
          result.registration?.status,
        ).toBe(
          'CANCELLED',
        );

        expect(
          result.visit.status,
        ).toBe(
          'CANCELLED',
        );

        expect(
          result.queue?.status,
        ).toBe(
          'CANCELLED',
        );

        expect(
          result.history,
        ).toMatchObject({
          fromStatus:
            'WAITING',

          toStatus:
            'CANCELLED',
        });

        expect(
          state.compensations,
        ).toHaveLength(
          4,
        );

        expect(
          state.audits,
        ).toHaveLength(
          2,
        );

        expect(
          state.outbox,
        ).toHaveLength(
          3,
        );

        expect(
          state.realtime,
        ).toHaveLength(
          1,
        );
      },
    );

    it(
      'marks the active queue entry and OPD visit as no-show',
      async () => {
        let visit =
          visitRecord();

        let queue =
          queueRecord();

        const state =
          runtime();

        const workflow =
          new MarkOpdVisitNoShowWorkflow(
            {
              async findById() {
                return visit;
              },
            } as never,
            {
              async markNoShowWithVersion(
                input: {
                  occurredAt: Date;
                },
              ) {
                visit =
                  visitRecord({
                    status:
                      'NO_SHOW',

                    activeVisitKey:
                      null,

                    noShowAt:
                      input.occurredAt,

                    noShowMarkedBy:
                      objectId(
                        actorUserId,
                      ),

                    version:
                      1,
                  });

                return visit;
              },
            } as never,
            {
              async findActiveByVisitId() {
                return queue;
              },
            } as never,
            {
              async transitionWithVersion(
                input: {
                  occurredAt: Date;
                },
              ) {
                queue =
                  queueRecord({
                    status:
                      'NO_SHOW',

                    activeEntryKey:
                      null,

                    noShowAt:
                      input.occurredAt,

                    lastStatusChangedAt:
                      input.occurredAt,

                    version:
                      1,
                  });

                return queue;
              },
            } as never,
            {
              async nextSequence() {
                return 2;
              },

              async append(
                input: {
                  historyId: string;
                  sequence: number;
                  fromStatus: QueueStatusHistoryRecord['fromStatus'];
                  toStatus: QueueStatusHistoryRecord['toStatus'];
                  occurredAt: Date;
                },
              ) {
                return historyRecord({
                  historyId:
                    input.historyId,

                  queueTokenId:
                    sourceQueueTokenId,

                  queueEntryId:
                    sourceQueueEntryId,

                  sequence:
                    input.sequence,

                  fromStatus:
                    input.fromStatus,

                  toStatus:
                    input.toStatus,

                  queueDefinitionId:
                    sourceQueueDefinitionId,

                  occurredAt:
                    input.occurredAt,
                });
              },
            } as never,
            state.dependencies,
          );

        const result =
          await workflow.execute({
            visitId,

            input: {
              expectedVersion:
                0,

              reason:
                'Patient did not respond after repeated calls',
            },

            actor: {
              userId:
                actorUserId,

              facilityId,

              correlationId:
                'correlation-001',
            },

            idempotencyKey:
              'visit-no-show-001',
          });

        expect(
          result.visit.status,
        ).toBe(
          'NO_SHOW',
        );

        expect(
          result.queue?.status,
        ).toBe(
          'NO_SHOW',
        );

        expect(
          result.history,
        ).toMatchObject({
          fromStatus:
            'WAITING',

          toStatus:
            'NO_SHOW',
        });

        expect(
          result.registration,
        ).toBeNull();

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
          2,
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