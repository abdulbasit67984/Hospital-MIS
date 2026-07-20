import {
  ObjectId,
} from '@hospital-mis/database';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type {
  ClinicalEmrMutationDependencies,
  ClinicalEmrTransactionRequest,
} from '../clinical-emr.ports.js';

import type {
  ClinicalNoteRecord,
  EncounterRecord,
} from '../clinical-emr.types.js';

import {
  ClinicalNoteAttributionService,
} from '../services/clinical-note-attribution.service.js';

import {
  ClinicalNoteCommandService,
} from '../services/clinical-note-command.service.js';

import {
  CreateClinicalNoteWorkflow,
  UpdateClinicalNoteDraftWorkflow,
} from '../services/workflows/clinical-note-draft.workflows.js';

import {
  FinalizeClinicalNoteWorkflow,
} from '../services/workflows/clinical-note-finalization.workflows.js';

import {
  CorrectClinicalNoteWorkflow,
  EnterClinicalNoteInErrorWorkflow,
} from '../services/workflows/clinical-note-correction.workflows.js';

function oid(): ObjectId {
  return new ObjectId();
}

function encounterRecord(
  overrides: Partial<EncounterRecord> = {},
): EncounterRecord {
  const now = new Date('2026-07-18T08:00:00.000Z');
  const providerId = oid();

  return {
    _id: oid() as never,
    facilityId: oid() as never,
    encounterNumber: 'ENC-H001-2026-000001',
    patientId: oid() as never,
    requestedPatientId: oid() as never,
    canonicalRedirected: false,
    registrationId: oid() as never,
    opdVisitId: oid() as never,
    queueTokenId: oid() as never,
    emergencyCaseId: null,
    admissionId: null,
    referralId: null,
    encounterType: 'OPD',
    careContext: 'OPD_VISIT',
    status: 'IN_PROGRESS',
    serviceDate: '2026-07-18',
    departmentId: oid() as never,
    clinicId: oid() as never,
    servicePointId: oid() as never,
    primaryProviderId: providerId as never,
    currentOwnerId: providerId as never,
    currentOwnerRole: 'PRIMARY_PROVIDER',
    assignedProviderIds: [providerId as never],
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
    transactionId: 'encounter-transaction',
    correlationId: 'encounter-correlation',
    schemaVersion: 1,
    version: 0,
    createdBy: oid() as never,
    updatedBy: oid() as never,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function clinicalNoteRecord(
  encounter: EncounterRecord,
  overrides: Partial<ClinicalNoteRecord> = {},
): ClinicalNoteRecord {
  const now = new Date('2026-07-18T08:05:00.000Z');

  return {
    _id: oid() as never,
    facilityId: encounter.facilityId,
    noteNumber: 'CLN-H001-2026-0000001',
    encounterId: encounter._id,
    patientId: encounter.patientId,
    authorProviderId: encounter.currentOwnerId,
    documentType: 'GENERAL_CLINICAL_NOTE',
    title: 'Consultation note',
    narrativeText: 'Patient reports fever for two days.',
    structuredData: {
      durationDays: 2,
    },
    status: 'DRAFT',
    confidentiality: 'ROUTINE',
    restrictionReason: null,
    currentVersion: 1,
    latestVersionId: oid() as never,
    finalizedAt: null,
    finalizedBy: null,
    signedAt: null,
    signedBy: null,
    signatureMethod: null,
    signatureDigest: null,
    amendedAt: null,
    amendedBy: null,
    amendmentReason: null,
    correctedAt: null,
    correctedBy: null,
    correctionReason: null,
    enteredInErrorAt: null,
    enteredInErrorBy: null,
    enteredInErrorReason: null,
    addendumToNoteId: null,
    supersedesNoteId: null,
    supersededByNoteId: null,
    transactionId: 'note-transaction',
    correlationId: 'note-correlation',
    schemaVersion: 1,
    version: 0,
    createdBy: oid() as never,
    updatedBy: oid() as never,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function cloneNote(
  note: ClinicalNoteRecord,
  overrides: Partial<ClinicalNoteRecord>,
): ClinicalNoteRecord {
  return {
    ...note,
    ...overrides,
    updatedAt: new Date('2026-07-18T08:10:00.000Z'),
  };
}

describe('Clinical note command workflows', () => {
  const actorUserId = oid().toHexString();
  const facilityId = oid().toHexString();
  const providerId = oid().toHexString();
  const occurredAt = new Date('2026-07-18T09:00:00.000Z');

  let encounter: EncounterRecord;
  let noteStore: Map<string, ClinicalNoteRecord>;
  let versionCreates: ReturnType<typeof vi.fn>;
  let compensations: unknown[];
  let checkpoints: unknown[];
  let auditEntries: unknown[];
  let outboxMessages: unknown[];
  let realtimeMessages: unknown[];

  let notes: {
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    updateDraftWithVersion: ReturnType<typeof vi.fn>;
    finalizeWithVersion: ReturnType<typeof vi.fn>;
    amendWithVersion: ReturnType<typeof vi.fn>;
    markCorrectedWithVersion: ReturnType<typeof vi.fn>;
    markEnteredInErrorWithVersion: ReturnType<typeof vi.fn>;
  };

  let encounters: {
    findById: ReturnType<typeof vi.fn>;
    touchClinicalDocumentActivityWithVersion: ReturnType<typeof vi.fn>;
  };

  let dependencies: ClinicalEmrMutationDependencies;
  let support: ClinicalNoteCommandService;

  beforeEach(() => {
    const providerObjectId = new ObjectId(providerId);
    const facilityObjectId = new ObjectId(facilityId);

    encounter = encounterRecord({
      facilityId: facilityObjectId as never,
      primaryProviderId: providerObjectId as never,
      currentOwnerId: providerObjectId as never,
      assignedProviderIds: [providerObjectId as never],
    });

    noteStore = new Map();
    versionCreates = vi.fn(async (input: Record<string, unknown>) => input);
    compensations = [];
    checkpoints = [];
    auditEntries = [];
    outboxMessages = [];
    realtimeMessages = [];

    notes = {
      create: vi.fn(async (input: Record<string, unknown>) => {
        const created = clinicalNoteRecord(encounter, {
          _id: new ObjectId(String(input['noteId'])) as never,
          noteNumber: String(input['noteNumber']),
          authorProviderId:
            new ObjectId(String(input['authorProviderId'])) as never,
          documentType:
            input['documentType'] as ClinicalNoteRecord['documentType'],
          title: input['title'] as string | null,
          narrativeText: input['narrativeText'] as string | null,
          structuredData: input['structuredData'],
          confidentiality:
            input['confidentiality'] as ClinicalNoteRecord['confidentiality'],
          restrictionReason: input['restrictionReason'] as string | null,
          latestVersionId:
            new ObjectId(String(input['initialVersionId'])) as never,
          addendumToNoteId:
            input['addendumToNoteId'] == null
              ? null
              : new ObjectId(String(input['addendumToNoteId'])) as never,
          supersedesNoteId:
            input['supersedesNoteId'] == null
              ? null
              : new ObjectId(String(input['supersedesNoteId'])) as never,
          transactionId: String(input['transactionId']),
          correlationId: String(input['correlationId']),
          createdBy: new ObjectId(String(input['actorUserId'])) as never,
          updatedBy: new ObjectId(String(input['actorUserId'])) as never,
        });

        noteStore.set(created._id.toHexString(), created);
        return created;
      }),

      findById: vi.fn(async (_facilityId: string, noteId: string) =>
        noteStore.get(noteId) ?? null),

      updateDraftWithVersion: vi.fn(async (input: Record<string, unknown>) => {
        const current = noteStore.get(String(input['clinicalNoteId']));

        if (
          current === undefined ||
          current.version !== input['expectedVersion'] ||
          current.status !== 'DRAFT'
        ) {
          return null;
        }

        const updated = cloneNote(current, {
          title: input['title'] as string | null,
          narrativeText: input['narrativeText'] as string | null,
          structuredData: input['structuredData'],
          confidentiality:
            input['confidentiality'] as ClinicalNoteRecord['confidentiality'],
          restrictionReason: input['restrictionReason'] as string | null,
          currentVersion: Number(input['nextClinicalVersion']),
          latestVersionId:
            new ObjectId(String(input['versionId'])) as never,
          version: current.version + 1,
        });

        noteStore.set(updated._id.toHexString(), updated);
        return updated;
      }),

      finalizeWithVersion: vi.fn(async (input: Record<string, unknown>) => {
        const current = noteStore.get(String(input['clinicalNoteId']));

        if (
          current === undefined ||
          current.version !== input['expectedVersion'] ||
          current.status !== 'DRAFT'
        ) {
          return null;
        }

        const signed = input['signatureDigest'] != null;
        const updated = cloneNote(current, {
          status: 'FINAL',
          currentVersion: Number(input['nextClinicalVersion']),
          latestVersionId:
            new ObjectId(String(input['versionId'])) as never,
          finalizedAt: occurredAt,
          finalizedBy: new ObjectId(String(input['actorUserId'])) as never,
          signedAt: signed ? occurredAt : null,
          signedBy:
            signed
              ? new ObjectId(String(input['actorUserId'])) as never
              : null,
          signatureMethod:
            input['signatureMethod'] as ClinicalNoteRecord['signatureMethod'],
          signatureDigest: input['signatureDigest'] as string | null,
          version: current.version + 1,
        });

        noteStore.set(updated._id.toHexString(), updated);
        return updated;
      }),

      amendWithVersion: vi.fn(),

      markCorrectedWithVersion: vi.fn(async (input: Record<string, unknown>) => {
        const current = noteStore.get(String(input['clinicalNoteId']));

        if (current === undefined || current.version !== input['expectedVersion']) {
          return null;
        }

        const updated = cloneNote(current, {
          status: 'CORRECTED',
          currentVersion: Number(input['nextClinicalVersion']),
          latestVersionId:
            new ObjectId(String(input['versionId'])) as never,
          correctedAt: occurredAt,
          correctedBy: new ObjectId(String(input['actorUserId'])) as never,
          correctionReason: String(input['reason']),
          supersededByNoteId:
            new ObjectId(String(input['replacementNoteId'])) as never,
          version: current.version + 1,
        });

        noteStore.set(updated._id.toHexString(), updated);
        return updated;
      }),

      markEnteredInErrorWithVersion: vi.fn(async (input: Record<string, unknown>) => {
        const current = noteStore.get(String(input['clinicalNoteId']));

        if (current === undefined || current.version !== input['expectedVersion']) {
          return null;
        }

        const updated = cloneNote(current, {
          status: 'ENTERED_IN_ERROR',
          currentVersion: Number(input['nextClinicalVersion']),
          latestVersionId:
            new ObjectId(String(input['versionId'])) as never,
          enteredInErrorAt: occurredAt,
          enteredInErrorBy:
            new ObjectId(String(input['actorUserId'])) as never,
          enteredInErrorReason: String(input['reason']),
          version: current.version + 1,
        });

        noteStore.set(updated._id.toHexString(), updated);
        return updated;
      }),
    };

    encounters = {
      findById: vi.fn(async () => encounter),
      touchClinicalDocumentActivityWithVersion: vi.fn(
        async (input: Record<string, unknown>) => {
          if (encounter.version !== input['expectedVersion']) {
            return null;
          }

          encounter = {
            ...encounter,
            latestClinicalNoteId:
              new ObjectId(String(input['latestClinicalNoteId'])) as never,
            lastClinicalActivityAt: occurredAt,
            amendmentCount:
              encounter.amendmentCount +
              (input['incrementAmendmentCount'] === true ? 1 : 0),
            version: encounter.version + 1,
            updatedAt: occurredAt,
          };

          return encounter;
        },
      ),
    };

    dependencies = {
      transactionManager: {
        execute: vi.fn(
          async <T>(request: ClinicalEmrTransactionRequest<T>) =>
            request.execute({
              transactionId: 'clinical-note-transaction',
              idempotencyKey: request.idempotencyKey,
              checkpoint: async (state, data) => {
                checkpoints.push({ state, data });
              },
              registerCompensation: async (compensation) => {
                compensations.push(compensation);
              },
            }),
        ),
      },
      audit: {
        append: async (entry) => {
          auditEntries.push(entry);
        },
      },
      outbox: {
        enqueue: async (message) => {
          outboxMessages.push(message);
        },
      },
      realtime: {
        publish: async (message) => {
          realtimeMessages.push(message);
        },
      },
      clock: {
        now: () => occurredAt,
      },
      sequence: {
        next: async () => ({
          key: 'clinical.note.number.2026',
          value: 1,
        }),
      },
      canonicalPatient: {
        resolve: async (_facilityId, patientId) => ({
          requestedPatientId: patientId,
          canonicalPatientId: patientId,
          redirected: false,
          mergeChain: [],
        }),
      },
      accessPolicy: {
        authorize: async () => ({
          allowed: true,
          accessMode: 'ASSIGNED',
          minimumNecessaryFields: ['clinicalContent'],
          auditSensitiveRead: false,
        }),
      },
      opdLifecycle: {
        startConsultation: async () => ({
          opdVisitId: encounter.opdVisitId?.toHexString() ?? '',
          visitStatus: 'IN_CONSULTATION',
          visitVersion: 1,
          queueTokenId: encounter.queueTokenId?.toHexString() ?? null,
          queueStatus: 'IN_CONSULTATION',
          queueVersion: 1,
        }),
        completeConsultation: async () => ({
          opdVisitId: encounter.opdVisitId?.toHexString() ?? '',
          visitStatus: 'COMPLETED',
          visitVersion: 2,
          queueTokenId: encounter.queueTokenId?.toHexString() ?? null,
          queueStatus: 'COMPLETED',
          queueVersion: 2,
        }),
      },
      snapshotCrypto: {
        protect: (value) => ({
          encryptedValue: {
            algorithm: 'AES-256-GCM',
            keyVersion: 'clinical-v1',
            initializationVector: '0123456789abcdef01234567',
            authenticationTag: '0123456789abcdef0123456789abcdef',
            ciphertext: `encrypted:${JSON.stringify(value)}`,
          },
          valueHash: 'a'.repeat(64),
        }),
        unprotect: <T>() => ({} as T),
        hash: () => 'b'.repeat(64),
        matchesHash: () => true,
        needsRotation: () => false,
      },
    };

    const attribution = new ClinicalNoteAttributionService({
      findActorIdentity: async () => ({
        userId: actorUserId,
        facilityId,
        staffId: providerId,
        status: 'ACTIVE',
      }),
    });

    support = new ClinicalNoteCommandService(
      notes as never,
      {
        create: versionCreates,
      } as never,
      encounters as never,
      {
        allocateClinicalNoteNumber: async () => ({
          facilityId,
          serviceDate: encounter.serviceDate,
          sequenceKey: 'clinical.note.number.2026',
          sequenceValue: 1,
          number: 'CLN-H001-2026-0000001',
        }),
      } as never,
      attribution,
      dependencies,
    );
  });

  const actor = () => ({
    userId: actorUserId,
    facilityId,
    correlationId: 'clinical-note-correlation',
    roleKeys: ['DOCTOR'],
    permissionKeys: [
      'encounters.read_assigned',
      'clinical_notes.create',
      'clinical_notes.amend',
      'encounters.finalize',
    ],
  });

  it('creates a draft, appends an encrypted immutable version, and emits only safe event metadata', async () => {
    const workflow = new CreateClinicalNoteWorkflow(
      notes as never,
      support,
    );

    const result = await workflow.execute({
      actor: actor(),
      idempotencyKey: 'create-note-1',
      input: {
        encounterId: encounter._id.toHexString(),
        documentType: 'HISTORY_OF_PRESENTING_ILLNESS',
        authorProviderId: providerId,
        narrativeText: 'Fever and cough for two days.',
        structuredData: {
          durationDays: 2,
        },
        confidentiality: 'ROUTINE',
      },
    });

    expect(result.status).toBe('DRAFT');
    expect(versionCreates).toHaveBeenCalledTimes(1);
    expect(encounter.latestClinicalNoteId?.toHexString()).toBe(
      result.clinicalNoteId,
    );
    expect(compensations).toHaveLength(3);

    const serializedEvents = JSON.stringify([
      ...outboxMessages,
      ...realtimeMessages,
    ]);

    expect(serializedEvents).not.toContain('Fever and cough');
    expect(serializedEvents).not.toContain('durationDays');
    expect(serializedEvents).not.toContain('ciphertext');
  });

  it('finalizes and signs a draft without publishing the signature digest', async () => {
    const existing = clinicalNoteRecord(encounter, {
      authorProviderId: new ObjectId(providerId) as never,
    });
    noteStore.set(existing._id.toHexString(), existing);

    const workflow = new FinalizeClinicalNoteWorkflow(
      notes as never,
      support,
    );

    const signatureDigest = 'c'.repeat(64);
    const result = await workflow.execute({
      clinicalNoteId: existing._id.toHexString(),
      actor: actor(),
      idempotencyKey: 'finalize-note-1',
      input: {
        expectedVersion: 0,
        signatureMethod: 'AUTHENTICATED_SESSION',
        signatureDigest,
      },
    });

    expect(result.status).toBe('FINAL');
    expect(result.signedAt).toBe(occurredAt.toISOString());
    expect(versionCreates).toHaveBeenCalledWith(
      expect.objectContaining({
        changeType: 'SIGNED',
        versionNumber: 2,
      }),
    );
    expect(JSON.stringify(outboxMessages)).not.toContain(signatureDigest);
  });

  it('corrects a finalized note by creating a finalized replacement and preserving both immutable histories', async () => {
    const original = clinicalNoteRecord(encounter, {
      status: 'FINAL',
      finalizedAt: occurredAt,
      finalizedBy: new ObjectId(actorUserId) as never,
      authorProviderId: new ObjectId(providerId) as never,
      currentVersion: 2,
      version: 1,
    });
    noteStore.set(original._id.toHexString(), original);

    const workflow = new CorrectClinicalNoteWorkflow(
      notes as never,
      support,
    );

    const result = await workflow.execute({
      clinicalNoteId: original._id.toHexString(),
      actor: actor(),
      idempotencyKey: 'correct-note-1',
      input: {
        expectedVersion: 1,
        reason: 'Incorrect duration documented in the finalized note',
        narrativeText: 'Fever and cough for three days.',
        structuredData: {
          durationDays: 3,
        },
        confidentiality: 'ROUTINE',
      },
    });

    expect(result.corrected.status).toBe('CORRECTED');
    expect(result.replacement.status).toBe('FINAL');
    expect(result.corrected.supersededByNoteId).toBe(
      result.replacement.clinicalNoteId,
    );
    expect(result.replacement.supersedesNoteId).toBe(
      result.corrected.clinicalNoteId,
    );
    expect(versionCreates).toHaveBeenCalledTimes(3);
    expect(encounter.amendmentCount).toBe(1);
  });

  it('rejects a stale entered-in-error request before opening a transaction', async () => {
    const existing = clinicalNoteRecord(encounter, {
      version: 4,
    });
    noteStore.set(existing._id.toHexString(), existing);

    const workflow = new EnterClinicalNoteInErrorWorkflow(
      notes as never,
      support,
    );

    await expect(
      workflow.execute({
        clinicalNoteId: existing._id.toHexString(),
        actor: actor(),
        idempotencyKey: 'error-note-stale',
        input: {
          expectedVersion: 3,
          reason: 'The note was created for the wrong patient encounter',
        },
      }),
    ).rejects.toThrow(
      'The clinical note changed before the operation could be completed',
    );

    expect(
      dependencies.transactionManager.execute,
    ).not.toHaveBeenCalled();
  });

  it('keeps finalized content immutable during ordinary draft update attempts', async () => {
    const existing = clinicalNoteRecord(encounter, {
      status: 'FINAL',
      finalizedAt: occurredAt,
      finalizedBy: new ObjectId(actorUserId) as never,
    });
    noteStore.set(existing._id.toHexString(), existing);

    const workflow = new UpdateClinicalNoteDraftWorkflow(
      notes as never,
      support,
    );

    await expect(
      workflow.execute({
        clinicalNoteId: existing._id.toHexString(),
        actor: actor(),
        idempotencyKey: 'update-final-note',
        input: {
          expectedVersion: 0,
          narrativeText: 'Attempted silent edit.',
          confidentiality: 'ROUTINE',
        },
      }),
    ).rejects.toThrow(
      'Finalized clinical content cannot be edited in place',
    );
  });
});