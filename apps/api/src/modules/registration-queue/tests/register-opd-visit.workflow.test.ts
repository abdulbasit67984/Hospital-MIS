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
  RegistrationQueueOutboxMessage,
  RegistrationQueueRealtimeMessage,
  RegistrationQueueTransactionRequest,
} from '../registration-queue.ports.js';

import type {
  OpdClinicRecord,
  OpdVisitRecord,
  QueueDefinitionRecord,
  QueueStatusHistoryRecord,
  QueueTokenRecord,
  RegistrationRecord,
  ServiceCounterRecord,
  ServicePointRecord,
} from '../registration-queue.types.js';

import {
  RegisterOpdVisitWorkflow,
} from '../workflows/register-opd-visit.workflow.js';

function objectId(
  value: string,
): Types.ObjectId {
  return new Types.ObjectId(
    value,
  );
}

const facilityId =
  '507f1f77bcf86cd799439011';

const requestedPatientId =
  '507f191e810c19729de860e1';

const canonicalPatientId =
  '507f191e810c19729de860e2';

const departmentId =
  '507f191e810c19729de860e3';

const clinicId =
  '507f191e810c19729de860e4';

const servicePointId =
  '507f191e810c19729de860e5';

const providerId =
  '507f191e810c19729de860e6';

const queueDefinitionId =
  '507f191e810c19729de860e7';

const counterId =
  '507f191e810c19729de860e8';

const actorUserId =
  '507f191e810c19729de860e9';

function registrationRecord(
  input: Record<string, unknown>,
): RegistrationRecord {
  return {
    _id:
      objectId(
        String(
          input['registrationId'],
        ),
      ),

    facilityId:
      objectId(
        facilityId,
      ),

    registrationNumber:
      String(
        input['registrationNumber'],
      ),

    patientId:
      objectId(
        String(
          input['patientId'],
        ),
      ),

    requestedPatientId:
      objectId(
        String(
          input['requestedPatientId'],
        ),
      ),

    canonicalRedirected:
      Boolean(
        input['canonicalRedirected'],
      ),

    registrationMode:
      input['registrationMode'] as RegistrationRecord['registrationMode'],

    registrationSource:
      input['registrationSource'] as RegistrationRecord['registrationSource'],

    visitType:
      input['visitType'] as RegistrationRecord['visitType'],

    status:
      'ACTIVE',

    serviceDate:
      String(
        input['serviceDate'],
      ),

    arrivedAt:
      input['arrivedAt'] as Date,

    checkedInAt:
      input['checkedInAt'] as Date | null,

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
        departmentId,
      ),

    clinicId:
      objectId(
        clinicId,
      ),

    servicePointId:
      objectId(
        servicePointId,
      ),

    assignedProviderId:
      objectId(
        providerId,
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
      String(
        input['transactionId'],
      ),

    correlationId:
      String(
        input['correlationId'],
      ),

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
        '2026-07-18T04:00:00.000Z',
      ),

    updatedAt:
      new Date(
        '2026-07-18T04:00:00.000Z',
      ),
  };
}

function visitRecord(
  input: Record<string, unknown>,
): OpdVisitRecord {
  return {
    _id:
      objectId(
        String(
          input['visitId'],
        ),
      ),

    facilityId:
      objectId(
        facilityId,
      ),

    visitNumber:
      String(
        input['visitNumber'],
      ),

    registrationId:
      objectId(
        String(
          input['registrationId'],
        ),
      ),

    patientId:
      objectId(
        canonicalPatientId,
      ),

    requestedPatientId:
      objectId(
        requestedPatientId,
      ),

    canonicalRedirected:
      true,

    serviceDate:
      '2026-07-18',

    visitType:
      'RETURNING_PATIENT',

    registrationSource:
      'WALK_IN',

    status:
      input['status'] as OpdVisitRecord['status'],

    departmentId:
      objectId(
        departmentId,
      ),

    clinicId:
      objectId(
        clinicId,
      ),

    servicePointId:
      objectId(
        servicePointId,
      ),

    assignedProviderId:
      objectId(
        providerId,
      ),

    assignedCounterId:
      objectId(
        counterId,
      ),

    currentQueueTokenId:
      input['currentQueueTokenId'] ===
      null
        ? null
        : objectId(
            String(
              input['currentQueueTokenId'],
            ),
          ),

    activeVisitKey:
      `${canonicalPatientId}:2026-07-18:${departmentId}:${clinicId}:${servicePointId}`,

    arrivedAt:
      input['arrivedAt'] as Date,

    checkedInAt:
      null,

    queuedAt:
      input['queuedAt'] as Date,

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
      String(
        input['transactionId'],
      ),

    correlationId:
      String(
        input['correlationId'],
      ),

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
        '2026-07-18T04:00:00.000Z',
      ),

    updatedAt:
      new Date(
        '2026-07-18T04:00:00.000Z',
      ),
  };
}

function queueTokenRecord(
  input: Record<string, unknown>,
): QueueTokenRecord {
  return {
    _id:
      objectId(
        String(
          input['queueTokenId'],
        ),
      ),

    facilityId:
      objectId(
        facilityId,
      ),

    queueEntryId:
      String(
        input['queueEntryId'],
      ),

    registrationId:
      objectId(
        String(
          input['registrationId'],
        ),
      ),

    opdVisitId:
      objectId(
        String(
          input['opdVisitId'],
        ),
      ),

    patientId:
      objectId(
        canonicalPatientId,
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
      'PRIORITY',

    priorityScore:
      1_100,

    triagePriority:
      'LEVEL_5_NON_URGENT',

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
      String(
        input['opdVisitId'],
      ),

    queuedAt:
      input['queuedAt'] as Date,

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
      input['queuedAt'] as Date,

    lastStatusChangedBy:
      objectId(
        actorUserId,
      ),

    transactionId:
      String(
        input['transactionId'],
      ),

    correlationId:
      String(
        input['correlationId'],
      ),

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
        '2026-07-18T04:00:00.000Z',
      ),

    updatedAt:
      new Date(
        '2026-07-18T04:00:00.000Z',
      ),
  };
}

describe(
  'RegisterOpdVisitWorkflow',
  () => {
    it(
      'creates canonical registration, OPD visit, token, history, audit, and outbox records',
      async () => {
        const compensations:
          unknown[] = [];

        const checkpoints:
          string[] = [];

        const audits:
          RegistrationQueueAuditEntry[] = [];

        const events:
          RegistrationQueueOutboxMessage[] = [];

        const realtime:
          RegistrationQueueRealtimeMessage[] = [];

        const transactionManager = {
          async execute<T>(
            request: RegistrationQueueTransactionRequest<T>,
          ): Promise<T> {
            return request.execute({
              transactionId:
                'txn-registration-001',

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

        const registrations = {
          async create(
            input: Record<string, unknown>,
          ) {
            return registrationRecord(
              input,
            );
          },
        };

        const visits = {
          async findActiveByKey() {
            return null;
          },

          async create(
            input: Record<string, unknown>,
          ) {
            return visitRecord(
              input,
            );
          },
        };

        const queueTokens = {
          async create(
            input: Record<string, unknown>,
          ) {
            return queueTokenRecord(
              input,
            );
          },
        };

        const queueHistory = {
          async append(
            input: Record<string, unknown>,
          ): Promise<QueueStatusHistoryRecord> {
            return {
              _id:
                objectId(
                  String(
                    input['historyId'],
                  ),
                ),

              facilityId:
                objectId(
                  facilityId,
                ),

              queueTokenId:
                objectId(
                  String(
                    input['queueTokenId'],
                  ),
                ),

              queueEntryId:
                String(
                  input['queueEntryId'],
                ),

              opdVisitId:
                objectId(
                  String(
                    input['opdVisitId'],
                  ),
                ),

              patientId:
                objectId(
                  canonicalPatientId,
                ),

              sequence:
                1,

              fromStatus:
                null,

              toStatus:
                'WAITING',

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
                'Initial OPD queue entry',

              occurredAt:
                input['occurredAt'] as Date,

              changedBy:
                objectId(
                  actorUserId,
                ),

              transactionId:
                'txn-registration-001',

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
                new Date(
                  '2026-07-18T04:00:00.000Z',
                ),

              updatedAt:
                new Date(
                  '2026-07-18T04:00:00.000Z',
                ),
            };
          },
        };

        const context = {
          facility: {
            _id:
              objectId(
                facilityId,
              ),

            code:
              'KTH',

            name:
              'Khyber Teaching Hospital',

            timezone:
              'Asia/Karachi',

            status:
              'ACTIVE' as const,

            allowsAuthentication:
              true,
          },

          department: {
            _id:
              objectId(
                departmentId,
              ),

            facilityId:
              objectId(
                facilityId,
              ),

            code:
              'MED',

            name:
              'Medicine',

            isClinical:
              true,

            status:
              'ACTIVE' as const,
          },

          clinic: {
            _id:
              objectId(
                clinicId,
              ),
          } as OpdClinicRecord,

          servicePoint: {
            _id:
              objectId(
                servicePointId,
              ),
          } as ServicePointRecord,

          provider:
            null,

          counter:
            null,

          assignedProviderId:
            providerId,

          assignedCounterId:
            counterId,
        };

        const queueContext = {
          queueDefinition: {
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
              objectId(
                clinicId,
              ),

            servicePointId:
              objectId(
                servicePointId,
              ),

            providerId:
              null,

            allowPriority:
              true,

            allowEmergencyOverride:
              true,

            status:
              'ACTIVE',
          } as QueueDefinitionRecord,

          provider:
            null,

          counter: {
            _id:
              objectId(
                counterId,
              ),
          } as ServiceCounterRecord,

          assignedProviderId:
            providerId,

          assignedCounterId:
            counterId,
        };

        const workflow =
          new RegisterOpdVisitWorkflow(
            registrations as never,
            visits as never,
            queueTokens as never,
            queueHistory as never,
            {
              async resolve() {
                return {
                  requestedPatientId,

                  canonicalPatientId,

                  canonicalEnterprisePatientId:
                    'EP-000001',

                  canonicalStatus:
                    'ACTIVE',

                  redirected:
                    true,

                  redirectPath: [
                    requestedPatientId,
                    canonicalPatientId,
                  ],
                };
              },
            } as never,
            {
              async resolveRegistrationContext() {
                return context;
              },

              async resolveQueueContext() {
                return queueContext;
              },
            } as never,
            {
              async allocateRegistrationNumber() {
                return {
                  facilityId,

                  serviceDate:
                    '2026-07-18',

                  sequenceValue:
                    1,

                  registrationNumber:
                    'REG-KTH-20260718-000001',
                };
              },

              async allocateVisitNumber() {
                return {
                  facilityId,

                  serviceDate:
                    '2026-07-18',

                  sequenceValue:
                    1,

                  visitNumber:
                    'OPD-KTH-20260718-000001',
                };
              },

              async allocateQueueTokenNumber() {
                return {
                  facilityId,

                  serviceDate:
                    '2026-07-18',

                  queueDefinitionId,

                  sequenceValue:
                    1,

                  tokenNumber:
                    1,

                  tokenPrefix:
                    'A',

                  tokenLabel:
                    'A1',
                };
              },
            } as never,
            {
              transactionManager,

              audit: {
                async append(
                  entry,
                ) {
                  audits.push(
                    entry,
                  );
                },
              },

              outbox: {
                async enqueue(
                  message,
                ) {
                  events.push(
                    message,
                  );
                },
              },

              realtime: {
                async publish(
                  message,
                ) {
                  realtime.push(
                    message,
                  );
                },
              },

              clock: {
                now() {
                  return new Date(
                    '2026-07-18T04:00:00.000Z',
                  );
                },
              },
            },
          );

        const result =
          await workflow.execute({
            input: {
              registration: {
                patientId:
                  requestedPatientId,

                registrationMode:
                  'RETURNING_PATIENT',

                registrationSource:
                  'WALK_IN',

                visitType:
                  'RETURNING_PATIENT',

                serviceDate:
                  '2026-07-18',

                arrivedAt:
                  '2026-07-18T09:00:00+05:00',

                departmentId,

                clinicId,

                servicePointId,

                assignedProviderId:
                  providerId,

                assignedCounterId:
                  counterId,
              },

              queue: {
                queueDefinitionId,

                assignedProviderId:
                  providerId,

                assignedCounterId:
                  counterId,

                priorityClass:
                  'PRIORITY',

                triagePriority:
                  'LEVEL_5_NON_URGENT',

                emergencyOverride:
                  false,

                specialCategories:
                  [],
              },
            },

            actor: {
              userId:
                actorUserId,

              facilityId,

              correlationId:
                'correlation-001',
            },

            idempotencyKey:
              'register-opd-001',
          });

        expect(
          result.registration,
        ).toMatchObject({
          registrationNumber:
            'REG-KTH-20260718-000001',

          patientId:
            canonicalPatientId,

          requestedPatientId,

          canonicalRedirected:
            true,
        });

        expect(
          result.visit,
        ).toMatchObject({
          visitNumber:
            'OPD-KTH-20260718-000001',

          status:
            'QUEUED',
        });

        expect(
          result.queue,
        ).toMatchObject({
          tokenLabel:
            'A1',

          status:
            'WAITING',

          priorityScore:
            1_100,
        });

        expect(
          compensations,
        ).toHaveLength(
          4,
        );

        expect(
          events,
        ).toHaveLength(
          3,
        );

        expect(
          audits,
        ).toHaveLength(
          3,
        );

        expect(
          realtime,
        ).toHaveLength(
          1,
        );

        expect(
          checkpoints,
        ).toEqual(
          expect.arrayContaining([
            'CANONICAL_PATIENT_RESOLVED',
            'SERVICE_CONTEXT_VALIDATED',
            'REGISTRATION_CREATED',
            'OPD_VISIT_CREATED',
            'QUEUE_ENTRY_CREATED',
            'QUEUE_HISTORY_APPENDED',
            'OUTBOX_ENQUEUED',
            'AUDIT_APPENDED',
            'REALTIME_PUBLISHED',
          ]),
        );
      },
    );
  },
);