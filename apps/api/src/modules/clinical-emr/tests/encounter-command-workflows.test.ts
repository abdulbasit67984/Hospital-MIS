import {
  ObjectId,
} from '@hospital-mis/database';

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type {
  ClinicalEmrMutationDependencies,
  ClinicalEmrTransactionCompensation,
  ClinicalEmrTransactionContext,
  ClinicalEmrTransactionRequest,
} from '../clinical-emr.ports.js';

import type {
  ClinicalEmrActorContext,
  EncounterRecord,
} from '../clinical-emr.types.js';

import {
  safeEncounterEventPayload,
} from '../clinical-emr.workflow-helpers.js';

import {
  ChangeEncounterStatusWorkflow,
} from '../workflows/change-encounter-status.workflow.js';

import {
  SignEncounterWorkflow,
} from '../workflows/sign-encounter.workflow.js';

function encounter(
  overrides: Partial<EncounterRecord> = {},
): EncounterRecord {
  const now = new Date('2026-07-18T08:00:00.000Z');
  const providerId = new ObjectId();

  return {
    _id: new ObjectId(),
    facilityId: new ObjectId(),
    encounterNumber: 'ENC-HOSP-2026-000001',
    patientId: new ObjectId(),
    requestedPatientId: new ObjectId(),
    canonicalRedirected: false,
    registrationId: new ObjectId(),
    opdVisitId: new ObjectId(),
    queueTokenId: new ObjectId(),
    emergencyCaseId: null,
    admissionId: null,
    referralId: null,
    encounterType: 'OPD',
    careContext: 'OPD_VISIT',
    status: 'CREATED',
    serviceDate: '2026-07-18',
    departmentId: new ObjectId(),
    clinicId: new ObjectId(),
    servicePointId: new ObjectId(),
    primaryProviderId: providerId,
    currentOwnerId: providerId,
    currentOwnerRole: 'PRIMARY_PROVIDER',
    assignedProviderIds: [providerId],
    confidentiality: 'ROUTINE',
    restrictionReason: null,
    startedAt: now,
    lastClinicalActivityAt: now,
    completedAt: null,
    signedAt: null,
    signedBy: null,
    signatureDigest: null,
    closedAt: null,
    closedBy: null,
    cancelledAt: null,
    cancelledBy: null,
    cancellationReason: null,
    supersedesEncounterId: null,
    supersededByEncounterId: null,
    correctionReason: null,
    amendmentCount: 0,
    latestClinicalNoteId: null,
    latestDiagnosisAt: null,
    transactionId: 'tx-original',
    correlationId: 'corr-original',
    schemaVersion: 1,
    version: 0,
    createdBy: new ObjectId(),
    updatedBy: new ObjectId(),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function actor(
  facilityId: string,
): ClinicalEmrActorContext {
  return {
    userId: new ObjectId().toHexString(),
    facilityId,
    correlationId: 'corr-workflow',
    roleKeys: ['doctor'],
    permissionKeys: [
      'encounters.read_assigned',
      'encounters.create',
      'encounters.finalize',
      'encounters.amend',
    ],
  };
}

function dependencies() {
  const compensations: unknown[] = [];
  const checkpoints: unknown[] = [];
  const transaction: ClinicalEmrTransactionContext = {
    transactionId: 'tx-workflow',
    idempotencyKey: 'idem-workflow',
    checkpoint: vi.fn(async (state: string, data?: Record<string, unknown>) => {
      checkpoints.push({ state, data });
    }),
    registerCompensation: vi.fn(async (compensation: ClinicalEmrTransactionCompensation) => {
      compensations.push(compensation);
    }),
  };

  const auditAppend = vi.fn(async () => undefined);
  const outboxEnqueue = vi.fn(async () => undefined);
  const realtimePublish = vi.fn(async () => undefined);
  const startConsultation = vi.fn(async () => ({
    opdVisitId: 'visit',
    visitStatus: 'IN_SERVICE',
    visitVersion: 1,
    queueTokenId: 'queue',
    queueStatus: 'SERVING',
    queueVersion: 1,
  }));
  const completeConsultation = vi.fn(async () => ({
    opdVisitId: 'visit',
    visitStatus: 'COMPLETED',
    visitVersion: 2,
    queueTokenId: 'queue',
    queueStatus: 'COMPLETED',
    queueVersion: 2,
  }));

  const value: ClinicalEmrMutationDependencies = {
    transactionManager: {
      execute: vi.fn(async <T>(request: ClinicalEmrTransactionRequest<T>) =>
        request.execute(transaction)),
    },
    audit: { append: auditAppend },
    outbox: { enqueue: outboxEnqueue },
    realtime: { publish: realtimePublish },
    clock: {
      now: () => new Date('2026-07-18T08:05:00.000Z'),
    },
    sequence: {
      next: vi.fn(async () => ({ key: 'sequence', value: 1 })),
    },
    canonicalPatient: {
      resolve: vi.fn(async (_facilityId: string, patientId: string) => ({
        requestedPatientId: patientId,
        canonicalPatientId: patientId,
        redirected: false,
        mergeChain: [],
      })),
    },
    accessPolicy: {
      authorize: vi.fn(async () => ({
        allowed: true,
        accessMode: 'ASSIGNED',
        minimumNecessaryFields: ['identity'],
        auditSensitiveRead: false,
      })),
    },
    snapshotCrypto: {
      protect: vi.fn((value: unknown, associatedData: string) => ({
        encryptedValue: {
          algorithm: 'AES-256-GCM' as const,
          keyVersion: 'v1',
          initializationVector: '0123456789abcdef01234567',
          authenticationTag: '0123456789abcdef0123456789abcdef',
          ciphertext: JSON.stringify(value),
        },
        valueHash: `hash:${associatedData}`,
      })),
      unprotect: vi.fn(),
      hash: vi.fn(() => 'hash'),
      matchesHash: vi.fn(() => true),
      needsRotation: vi.fn(() => false),
    },
    opdLifecycle: {
      startConsultation,
      completeConsultation,
    },
  };

  return {
    value,
    transaction,
    compensations,
    checkpoints,
    auditAppend,
    outboxEnqueue,
    realtimePublish,
    startConsultation,
    completeConsultation,
  };
}

describe('Clinical encounter command workflows', () => {
  it('starts an OPD encounter, synchronizes queue state, appends history, and publishes safe events', async () => {
    const current = encounter();
    const updated = encounter({
      ...current,
      status: 'IN_PROGRESS',
      version: 1,
      lastClinicalActivityAt: new Date('2026-07-18T08:05:00.000Z'),
      updatedAt: new Date('2026-07-18T08:05:00.000Z'),
    });
    const encounterRepository = {
      findById: vi.fn(async () => current),
      startWithVersion: vi.fn(async () => updated),
    };
    const historyRepository = {
      nextSequence: vi.fn(async () => 2),
      create: vi.fn(async (input) => input),
    };
    const runtime = dependencies();
    const workflow = new ChangeEncounterStatusWorkflow(
      encounterRepository as never,
      historyRepository as never,
      runtime.value,
    );

    const result = await workflow.execute({
      encounterId: current._id.toHexString(),
      actor: actor(current.facilityId.toHexString()),
      idempotencyKey: 'start-encounter',
      input: {
        expectedVersion: 0,
        status: 'IN_PROGRESS',
        changeSource: 'PROVIDER',
      },
    });

    expect(result.status).toBe('IN_PROGRESS');
    expect(runtime.startConsultation).toHaveBeenCalledTimes(1);
    expect(historyRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatus: 'CREATED',
        toStatus: 'IN_PROGRESS',
        sequence: 2,
      }),
    );
    expect(runtime.compensations).toHaveLength(2);
    expect(runtime.auditAppend).toHaveBeenCalledTimes(1);
    expect(runtime.outboxEnqueue).toHaveBeenCalledTimes(1);
    expect(runtime.realtimePublish).toHaveBeenCalledTimes(3);
  });

  it('signs only completed encounters and records signature method without publishing the digest', async () => {
    const current = encounter({
      status: 'COMPLETED',
      version: 4,
      completedAt: new Date('2026-07-18T08:10:00.000Z'),
    });
    const updated = encounter({
      ...current,
      status: 'SIGNED',
      version: 5,
      signedAt: new Date('2026-07-18T08:15:00.000Z'),
      signedBy: new ObjectId(),
      signatureDigest: 'd'.repeat(64),
    });
    const encounterRepository = {
      findById: vi.fn(async () => current),
      signWithVersion: vi.fn(async () => updated),
    };
    const historyRepository = {
      nextSequence: vi.fn(async () => 5),
      create: vi.fn(async (input) => input),
    };
    const runtime = dependencies();
    const workflow = new SignEncounterWorkflow(
      encounterRepository as never,
      historyRepository as never,
      runtime.value,
    );

    const result = await workflow.execute({
      encounterId: current._id.toHexString(),
      actor: actor(current.facilityId.toHexString()),
      idempotencyKey: 'sign-encounter',
      input: {
        expectedVersion: 4,
        signatureMethod: 'AUTHENTICATED_SESSION',
        signatureDigest: 'd'.repeat(64),
      },
    });

    expect(result.status).toBe('SIGNED');
    expect(runtime.auditAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          signatureMethod: 'AUTHENTICATED_SESSION',
        },
      }),
    );

    const event = safeEncounterEventPayload(updated);
    expect(event).not.toHaveProperty('signatureDigest');
    expect(event).not.toHaveProperty('patientId');
    expect(JSON.stringify(event)).not.toContain('dddddddd');
  });

  it('rejects stale encounter versions before mutation', async () => {
    const current = encounter({ version: 3 });
    const encounterRepository = {
      findById: vi.fn(async () => current),
      startWithVersion: vi.fn(),
    };
    const runtime = dependencies();
    const workflow = new ChangeEncounterStatusWorkflow(
      encounterRepository as never,
      {
        nextSequence: vi.fn(),
        create: vi.fn(),
      } as never,
      runtime.value,
    );

    await expect(
      workflow.execute({
        encounterId: current._id.toHexString(),
        actor: actor(current.facilityId.toHexString()),
        idempotencyKey: 'stale-encounter',
        input: {
          expectedVersion: 2,
          status: 'IN_PROGRESS',
          changeSource: 'PROVIDER',
        },
      }),
    ).rejects.toThrow(
      'The encounter changed before the operation could be completed',
    );

    expect(encounterRepository.startWithVersion).not.toHaveBeenCalled();
  });
});