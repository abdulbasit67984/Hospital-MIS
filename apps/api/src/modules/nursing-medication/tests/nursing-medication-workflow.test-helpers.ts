import {
  Types,
} from 'mongoose';

import {
  vi,
} from 'vitest';

import type {
  NursingAdmissionContext,
  NursingMedicationActorContext,
} from '../nursing-medication.contracts.js';

import type {
  NursingAssessmentRecord,
  NursingCarePlanRecord,
  NursingTaskRecord,
} from '../nursing-medication.persistence.types.js';

import type {
  NursingMedicationCommandService,
} from '../services/nursing-medication-command.service.js';

import type {
  NursingMedicationTransactionContext,
  NursingMedicationTransactionRequest,
} from '../nursing-medication.workflow-ports.js';

export const TEST_IDS = {
  facilityId:
    '507f1f77bcf86cd799439001',
  admissionId:
    '507f1f77bcf86cd799439002',
  patientId:
    '507f1f77bcf86cd799439003',
  encounterId:
    '507f1f77bcf86cd799439004',
  wardId:
    '507f1f77bcf86cd799439005',
  roomId:
    '507f1f77bcf86cd799439006',
  bedId:
    '507f1f77bcf86cd799439007',
  userId:
    '507f1f77bcf86cd799439008',
  staffId:
    '507f1f77bcf86cd799439009',
  assessmentId:
    '507f1f77bcf86cd799439010',
  rootAssessmentId:
    '507f1f77bcf86cd799439011',
  carePlanId:
    '507f1f77bcf86cd799439012',
  rootCarePlanId:
    '507f1f77bcf86cd799439013',
  taskId:
    '507f1f77bcf86cd799439014',
} as const;

export const FIXED_NOW =
  new Date(
    '2026-07-20T10:00:00.000Z',
  );

export function actor(): NursingMedicationActorContext {
  return {
    userId:
      TEST_IDS.userId,
    facilityId:
      TEST_IDS.facilityId,
    correlationId:
      'correlation-test',
    roleKeys: [
      'WARD_NURSE',
    ],
    permissionKeys: [
      'nursing.read',
      'nursing.notes.create',
      'nursing.notes.amend',
    ],
  };
}

export function admissionContext(): NursingAdmissionContext {
  return {
    facilityId:
      TEST_IDS.facilityId,
    admissionId:
      TEST_IDS.admissionId,
    admissionNumber:
      'ADM-2026-0000001',
    admissionStatus:
      'ADMITTED',
    isActive:
      true,
    encounterId:
      TEST_IDS.encounterId,
    admittedAt:
      '2026-07-20T08:00:00.000Z',
    clinicallyDischargedAt:
      null,
    dischargedAt:
      null,
    attendingConsultantUserId:
      TEST_IDS.userId,
    attendingConsultantStaffId:
      TEST_IDS.staffId,
    careTeam: [],
    patient: {
      patientId:
        TEST_IDS.patientId,
      displayName:
        'Fictional Patient',
      mrn:
        'HOSP-2026-000001',
      birthDate:
        '1990-01-01',
      estimatedAgeYears:
        null,
      sexAtBirth:
        'FEMALE',
    },
    location: {
      wardId:
        TEST_IDS.wardId,
      wardCode:
        'WARD-A',
      wardName:
        'Ward A',
      wardType:
        'GENERAL',
      nursingStationCode:
        'NS-A',
      departmentId:
        '507f1f77bcf86cd799439099',
      roomId:
        TEST_IDS.roomId,
      roomNumber:
        '101',
      roomName:
        'Room 101',
      bedId:
        TEST_IDS.bedId,
      bedNumber:
        '1',
      bedLabel:
        '101-1',
      bedCategory:
        'GENERAL',
    },
    alerts: [],
    allergies: [],
  };
}

function objectId(
  value: string,
): Types.ObjectId {
  return new Types.ObjectId(
    value,
  );
}

export function assessmentRecord(
  overrides: Partial<NursingAssessmentRecord> = {},
): NursingAssessmentRecord {
  return {
    _id:
      objectId(
        TEST_IDS.assessmentId,
      ),
    facilityId:
      objectId(
        TEST_IDS.facilityId,
      ),
    admissionId:
      objectId(
        TEST_IDS.admissionId,
      ),
    patientId:
      objectId(
        TEST_IDS.patientId,
      ),
    encounterId:
      objectId(
        TEST_IDS.encounterId,
      ),
    wardId:
      objectId(
        TEST_IDS.wardId,
      ),
    roomId:
      objectId(
        TEST_IDS.roomId,
      ),
    bedId:
      objectId(
        TEST_IDS.bedId,
      ),
    assessmentNumber:
      'NAS-2026-0000001',
    assessmentType:
      'INITIAL',
    templateCode:
      null,
    templateVersion:
      null,
    sections: [
      {
        sectionCode:
          'GENERAL',
        sectionLabel:
          'General',
        values: {
          alert:
            true,
        },
        narrative:
          null,
        riskLevel:
          'LOW',
        score:
          null,
      },
    ],
    summary:
      null,
    overallRiskLevel:
      'LOW',
    requiresEscalation:
      false,
    escalationReason:
      null,
    assessedAt:
      new Date(
        '2026-07-20T09:55:00.000Z',
      ),
    recordedAt:
      FIXED_NOW,
    backdatedEntryReason:
      null,
    assessedByUserId:
      objectId(
        TEST_IDS.userId,
      ),
    assessedByStaffId:
      objectId(
        TEST_IDS.staffId,
      ),
    status:
      'DRAFT',
    signedAt:
      null,
    signedByUserId:
      null,
    signedByStaffId:
      null,
    revisionNumber:
      1,
    rootAssessmentId:
      objectId(
        TEST_IDS.rootAssessmentId,
      ),
    supersedesAssessmentId:
      null,
    supersededByAssessmentId:
      null,
    correctionReason:
      null,
    enteredInErrorAt:
      null,
    enteredInErrorByUserId:
      null,
    enteredInErrorByStaffId:
      null,
    enteredInErrorReason:
      null,
    transactionId:
      'transaction-test',
    correlationId:
      'correlation-test',
    idempotencyKey:
      'idempotency-test',
    schemaVersion:
      1,
    version:
      0,
    createdBy:
      objectId(
        TEST_IDS.userId,
      ),
    updatedBy:
      objectId(
        TEST_IDS.userId,
      ),
    createdAt:
      FIXED_NOW,
    updatedAt:
      FIXED_NOW,
    ...overrides,
  };
}

export function carePlanRecord(
  overrides: Partial<NursingCarePlanRecord> = {},
): NursingCarePlanRecord {
  return {
    _id:
      objectId(
        TEST_IDS.carePlanId,
      ),
    facilityId:
      objectId(
        TEST_IDS.facilityId,
      ),
    admissionId:
      objectId(
        TEST_IDS.admissionId,
      ),
    patientId:
      objectId(
        TEST_IDS.patientId,
      ),
    encounterId:
      objectId(
        TEST_IDS.encounterId,
      ),
    wardId:
      objectId(
        TEST_IDS.wardId,
      ),
    roomId:
      objectId(
        TEST_IDS.roomId,
      ),
    bedId:
      objectId(
        TEST_IDS.bedId,
      ),
    carePlanNumber:
      'NCP-2026-0000001',
    title:
      'Mobility support',
    status:
      'ACTIVE',
    problems: [],
    assignedNurseStaffId:
      objectId(
        TEST_IDS.staffId,
      ),
    assignedTeamCode:
      null,
    startedAt:
      FIXED_NOW,
    targetCompletionAt:
      null,
    nextReviewAt:
      null,
    lastReviewedAt:
      FIXED_NOW,
    lastReviewedByStaffId:
      objectId(
        TEST_IDS.staffId,
      ),
    outcomeEvaluation:
      null,
    completedAt:
      null,
    completedByStaffId:
      null,
    cancellationReason:
      null,
    revisionNumber:
      1,
    rootCarePlanId:
      objectId(
        TEST_IDS.rootCarePlanId,
      ),
    supersedesCarePlanId:
      null,
    supersededByCarePlanId:
      null,
    correctionReason:
      null,
    transactionId:
      'transaction-test',
    correlationId:
      'correlation-test',
    idempotencyKey:
      'idempotency-test',
    schemaVersion:
      1,
    version:
      0,
    createdBy:
      objectId(
        TEST_IDS.userId,
      ),
    updatedBy:
      objectId(
        TEST_IDS.userId,
      ),
    createdAt:
      FIXED_NOW,
    updatedAt:
      FIXED_NOW,
    ...overrides,
  };
}

export function taskRecord(
  overrides: Partial<NursingTaskRecord> = {},
): NursingTaskRecord {
  return {
    _id:
      objectId(
        TEST_IDS.taskId,
      ),
    facilityId:
      objectId(
        TEST_IDS.facilityId,
      ),
    admissionId:
      objectId(
        TEST_IDS.admissionId,
      ),
    patientId:
      objectId(
        TEST_IDS.patientId,
      ),
    encounterId:
      objectId(
        TEST_IDS.encounterId,
      ),
    wardId:
      objectId(
        TEST_IDS.wardId,
      ),
    roomId:
      objectId(
        TEST_IDS.roomId,
      ),
    bedId:
      objectId(
        TEST_IDS.bedId,
      ),
    taskNumber:
      'NTK-2026-0000001',
    sourceType:
      'MANUAL',
    sourceRecordId:
      null,
    carePlanId:
      null,
    carePlanInterventionId:
      null,
    title:
      'Reposition patient',
    instructions:
      null,
    priority:
      'ROUTINE',
    status:
      'PENDING',
    assignedStaffId:
      objectId(
        TEST_IDS.staffId,
      ),
    assignedTeamCode:
      null,
    scheduledAt:
      FIXED_NOW,
    dueAt:
      new Date(
        '2026-07-20T11:00:00.000Z',
      ),
    recurrenceKey:
      null,
    carriedForwardFromTaskId:
      null,
    carriedForwardToTaskId:
      null,
    startedAt:
      null,
    completedAt:
      null,
    completedByUserId:
      null,
    completedByStaffId:
      null,
    dispositionReasonCode:
      null,
    dispositionReason:
      null,
    escalatedAt:
      null,
    escalatedToStaffId:
      null,
    escalationReason:
      null,
    transactionId:
      'transaction-test',
    correlationId:
      'correlation-test',
    idempotencyKey:
      'idempotency-test',
    schemaVersion:
      1,
    version:
      0,
    createdBy:
      objectId(
        TEST_IDS.userId,
      ),
    updatedBy:
      objectId(
        TEST_IDS.userId,
      ),
    createdAt:
      FIXED_NOW,
    updatedAt:
      FIXED_NOW,
    ...overrides,
  };
}

export interface WorkflowHarness {
  support: NursingMedicationCommandService;
  requests: NursingMedicationTransactionRequest<unknown>[];
  checkpoints: string[];
  compensations: Record<string, unknown>[];
  publishMutation: ReturnType<typeof vi.fn>;
  assessments: {
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    createVersion: ReturnType<typeof vi.fn>;
  };
  care: {
    createCarePlan: ReturnType<typeof vi.fn>;
    findCarePlanById: ReturnType<typeof vi.fn>;
    updateCarePlan: ReturnType<typeof vi.fn>;
    createCarePlanVersion: ReturnType<typeof vi.fn>;
    createTask: ReturnType<typeof vi.fn>;
    findTaskById: ReturnType<typeof vi.fn>;
    updateTask: ReturnType<typeof vi.fn>;
  };
}

export function workflowHarness(
  options: Readonly<{
    assessment?: NursingAssessmentRecord;
    carePlan?: NursingCarePlanRecord;
    task?: NursingTaskRecord;
  }> = {},
): WorkflowHarness {
  const requests:
    NursingMedicationTransactionRequest<unknown>[] = [];

  const checkpoints: string[] = [];
  const compensations:
    Record<string, unknown>[] = [];

  const transaction:
    NursingMedicationTransactionContext = {
      transactionId:
        'transaction-test',
      idempotencyKey:
        'idempotency-test',
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
    };

  const assessment =
    options.assessment ??
    assessmentRecord();

  const carePlan =
    options.carePlan ??
    carePlanRecord();

  const task =
    options.task ??
    taskRecord();

  const assessments = {
    create:
      vi.fn(
        async () => assessment,
      ),
    findById:
      vi.fn(
        async () => assessment,
      ),
    update:
      vi.fn(
        async (
          _facilityId,
          _assessmentId,
          _version,
          _statuses,
          update,
        ) =>
          assessmentRecord({
            ...assessment,
            ...update,
            version:
              assessment.version + 1,
            updatedAt:
              FIXED_NOW,
          }),
      ),
    createVersion:
      vi.fn(
        async (input) => ({
          _id:
            new Types.ObjectId(),
          createdAt:
            FIXED_NOW,
          ...input,
        }),
      ),
    list:
      vi.fn(),
  };

  const care = {
    createCarePlan:
      vi.fn(
        async () => carePlan,
      ),
    findCarePlanById:
      vi.fn(
        async () => carePlan,
      ),
    updateCarePlan:
      vi.fn(
        async (
          _facilityId,
          _carePlanId,
          _version,
          _statuses,
          update,
        ) =>
          carePlanRecord({
            ...carePlan,
            ...update,
            version:
              carePlan.version + 1,
            updatedAt:
              FIXED_NOW,
          }),
      ),
    createCarePlanVersion:
      vi.fn(
        async (input) => ({
          _id:
            new Types.ObjectId(),
          createdAt:
            FIXED_NOW,
          ...input,
        }),
      ),
    createTask:
      vi.fn(
        async () => task,
      ),
    findTaskById:
      vi.fn(
        async () => task,
      ),
    updateTask:
      vi.fn(
        async (
          _facilityId,
          _taskId,
          _version,
          _statuses,
          update,
        ) =>
          taskRecord({
            ...task,
            ...update,
            version:
              task.version + 1,
            updatedAt:
              FIXED_NOW,
          }),
      ),
    listCarePlans:
      vi.fn(),
    listTasks:
      vi.fn(),
  };

  const publishMutation =
    vi.fn(
      async () => undefined,
    );

  const support = {
    assessments,
    care,
    context: {
      resolveAdmission:
        vi.fn(
          async () =>
            admissionContext(),
        ),
      requireActiveActorStaffId:
        vi.fn(
          async () =>
            TEST_IDS.staffId,
        ),
    },
    accessPolicy: {
      authorize:
        vi.fn(
          async () => ({
            allowed:
              true,
            accessMode:
              'WARD_ASSIGNED',
            minimumNecessaryFields: [],
            auditSensitiveRead:
              false,
          }),
        ),
    },
    dependencies: {
      transactionManager: {
        execute:
          vi.fn(
            async <T>(
              request: NursingMedicationTransactionRequest<T>,
            ): Promise<T> => {
              requests.push(
                request as NursingMedicationTransactionRequest<unknown>,
              );

              return request.execute(
                transaction,
              );
            },
          ),
      },
      audit: {
        append:
          vi.fn(),
      },
      outbox: {
        enqueue:
          vi.fn(),
      },
      realtime: {
        publish:
          vi.fn(),
      },
      clock: {
        now: () =>
          FIXED_NOW,
      },
      sequence: {
        next:
          vi.fn(
            async (
              _facilityId,
              key,
            ) => ({
              key,
              value:
                1,
            }),
          ),
      },
      snapshotCrypto: {
        protect:
          vi.fn(
            () => ({
              encryptedValue: {
                algorithm:
                  'AES-256-GCM',
                keyId:
                  'test-key',
                initializationVector:
                  'iv',
                authenticationTag:
                  'tag',
                ciphertext:
                  'ciphertext',
              },
              valueHash:
                'a'.repeat(
                  64,
                ),
            }),
          ),
      },
    },
    newId: () =>
      new Types.ObjectId()
        .toHexString(),
    objectId,
    normalizedCode: (
      value: string,
    ) =>
      value
        .trim()
        .toUpperCase(),
    normalizedText: (
      value: string,
    ) =>
      value
        .trim()
        .replace(
          /\s+/gu,
          ' ',
        ),
    nullableText: (
      value:
        | string
        | null
        | undefined,
    ) =>
      value == null ||
      value.trim().length ===
        0
        ? null
        : value.trim(),
    resolveAdmission:
      vi.fn(
        async () =>
          admissionContext(),
      ),
    actorStaffId:
      vi.fn(
        async () =>
          TEST_IDS.staffId,
      ),
    assertAccess:
      vi.fn(
        async () => ({
          allowed:
            true,
          accessMode:
            'WARD_ASSIGNED',
          minimumNecessaryFields: [],
          auditSensitiveRead:
            false,
        }),
      ),
    requireAssessment:
      vi.fn(
        async () => assessment,
      ),
    requireCarePlan:
      vi.fn(
        async () => carePlan,
      ),
    requireTask:
      vi.fn(
        async () => task,
      ),
    assertExpectedVersion: (
      record: {
        version: number;
      },
      expectedVersion: number,
    ) => {
      if (
        record.version !==
        expectedVersion
      ) {
        throw new Error(
          'Concurrency conflict',
        );
      }
    },
    allocateNumber:
      vi.fn(
        async (
          _facilityId,
          _namespace,
          prefix,
        ) => ({
          number:
            `${prefix}-2026-0000001`,
          sequenceKey:
            `${prefix}:2026`,
          sequenceValue:
            1,
        }),
      ),
    publishMutation,
  } as unknown as NursingMedicationCommandService;

  return {
    support,
    requests,
    checkpoints,
    compensations,
    publishMutation,
    assessments,
    care,
  };
}