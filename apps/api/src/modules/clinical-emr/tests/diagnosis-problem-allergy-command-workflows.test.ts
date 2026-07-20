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

import {
  ClinicalNoKnownAllergyConflictError,
  EncounterDiagnosisConcurrencyError,
} from '../clinical-emr.errors.js';

import type {
  ClinicalEmrMutationDependencies,
  ClinicalEmrTransactionRequest,
} from '../clinical-emr.ports.js';

import type {
  ClinicalNoteRecord,
  EncounterDiagnosisRecord,
  EncounterRecord,
  PatientAllergyRecord,
  PatientProblemRecord,
} from '../clinical-emr.types.js';

import {
  safeEncounterDiagnosisEventPayload,
  safePatientAllergyEventPayload,
  safePatientProblemEventPayload,
} from '../clinical-emr.workflow-helpers.js';

import {
  ClinicalNoteAttributionService,
} from '../services/clinical-note-attribution.service.js';

import {
  ClinicalListCommandService,
} from '../services/clinical-list-command.service.js';

import {
  DiagnosisCommandService,
} from '../services/diagnosis-command.service.js';

import {
  PatientAllergyCommandService,
} from '../services/patient-allergy-command.service.js';

import {
  PatientProblemCommandService,
} from '../services/patient-problem-command.service.js';

import {
  ChangeEncounterDiagnosisStatusWorkflow,
  RecordEncounterDiagnosisWorkflow,
} from '../services/workflows/diagnosis-command.workflows.js';

import {
  RecordPatientAllergyWorkflow,
} from '../services/workflows/patient-allergy-command.workflows.js';

import {
  CreatePatientProblemWorkflow,
} from '../services/workflows/patient-problem-command.workflows.js';

function oid(): ObjectId {
  return new ObjectId();
}

function encounterRecord(
  facilityId: string,
  providerId: string,
  overrides: Partial<EncounterRecord> = {},
): EncounterRecord {
  const now = new Date('2026-07-18T08:00:00.000Z');

  return {
    _id: oid() as never,
    facilityId: new ObjectId(facilityId) as never,
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
    primaryProviderId: new ObjectId(providerId) as never,
    currentOwnerId: new ObjectId(providerId) as never,
    currentOwnerRole: 'PRIMARY_PROVIDER',
    assignedProviderIds: [new ObjectId(providerId) as never],
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

function diagnosisRecord(
  encounter: EncounterRecord,
  overrides: Partial<EncounterDiagnosisRecord> = {},
): EncounterDiagnosisRecord {
  const now = new Date('2026-07-18T08:05:00.000Z');

  return {
    _id: oid() as never,
    facilityId: encounter.facilityId,
    encounterId: encounter._id,
    patientId: encounter.patientId,
    diagnosisId: null,
    codeSystem: 'ICD_10',
    code: 'J06.9',
    normalizedCode: 'J06.9',
    display: 'Acute upper respiratory infection',
    role: 'PRIMARY',
    certainty: 'CONFIRMED',
    status: 'ACTIVE',
    activeDiagnosisKey: 'ICD_10:J06.9',
    clinicalNoteId: null,
    onsetDate: '2026-07-17',
    resolvedAt: null,
    isChronic: false,
    presentOnAdmission: null,
    evidence: 'Clinical examination supports diagnosis',
    recordedAt: now,
    recordedBy: oid() as never,
    verifiedAt: null,
    verifiedBy: null,
    statusReason: null,
    supersedesEncounterDiagnosisId: null,
    supersededByEncounterDiagnosisId: null,
    transactionId: 'diagnosis-transaction',
    correlationId: 'diagnosis-correlation',
    schemaVersion: 1,
    version: 0,
    createdBy: oid() as never,
    updatedBy: oid() as never,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function problemRecord(
  encounter: EncounterRecord,
  overrides: Partial<PatientProblemRecord> = {},
): PatientProblemRecord {
  const now = new Date('2026-07-18T08:10:00.000Z');

  return {
    _id: oid() as never,
    facilityId: encounter.facilityId,
    problemNumber: 'PRB-H001-2026-0000001',
    patientId: encounter.patientId,
    diagnosisId: null,
    sourceEncounterId: encounter._id,
    sourceEncounterDiagnosisId: null,
    codeSystem: 'ICD_10',
    code: 'I10',
    normalizedCode: 'I10',
    display: 'Essential hypertension',
    status: 'ACTIVE',
    activeProblemKey: 'ICD_10:I10',
    onsetDate: '2024-01-01',
    resolvedAt: null,
    summary: 'Long-standing hypertension controlled with treatment.',
    currentVersion: 1,
    latestVersionId: oid() as never,
    statusReason: null,
    supersedesProblemId: null,
    supersededByProblemId: null,
    recordedAt: now,
    recordedBy: oid() as never,
    transactionId: 'problem-transaction',
    correlationId: 'problem-correlation',
    schemaVersion: 1,
    version: 0,
    createdBy: oid() as never,
    updatedBy: oid() as never,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function allergyRecord(
  encounter: EncounterRecord,
  overrides: Partial<PatientAllergyRecord> = {},
): PatientAllergyRecord {
  const now = new Date('2026-07-18T08:15:00.000Z');

  return {
    _id: oid() as never,
    facilityId: encounter.facilityId,
    patientId: encounter.patientId,
    recordType: 'ALLERGY',
    allergyId: null,
    category: 'MEDICATION',
    allergenText: 'Penicillin',
    normalizedAllergenText: 'penicillin',
    status: 'ACTIVE',
    activeAllergyKey: 'ALLERGY:MEDICATION:penicillin',
    verificationStatus: 'CONFIRMED',
    severity: 'SEVERE',
    reactions: [
      {
        manifestation: 'Generalized urticaria',
        severity: 'SEVERE',
        occurredAt: '2025-03-02T10:00:00.000Z',
        notes: 'Required emergency treatment',
      },
    ],
    onsetDate: '2025-03-02',
    lastReactionAt: new Date('2025-03-02T10:00:00.000Z'),
    clinicalNoteId: null,
    sourceEncounterId: encounter._id,
    notes: 'Avoid all penicillin-class medicines.',
    currentVersion: 1,
    latestVersionId: oid() as never,
    recordedAt: now,
    recordedBy: oid() as never,
    verifiedAt: now,
    verifiedBy: oid() as never,
    statusReason: null,
    supersedesPatientAllergyId: null,
    supersededByPatientAllergyId: null,
    transactionId: 'allergy-transaction',
    correlationId: 'allergy-correlation',
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
): ClinicalNoteRecord {
  const now = new Date('2026-07-18T08:03:00.000Z');

  return {
    _id: oid() as never,
    facilityId: encounter.facilityId,
    noteNumber: 'CLN-H001-2026-0000001',
    encounterId: encounter._id,
    patientId: encounter.patientId,
    authorProviderId: encounter.currentOwnerId,
    documentType: 'ASSESSMENT',
    title: 'Assessment',
    narrativeText: null,
    structuredData: null,
    status: 'FINAL',
    confidentiality: 'ROUTINE',
    restrictionReason: null,
    currentVersion: 1,
    latestVersionId: oid() as never,
    finalizedAt: now,
    finalizedBy: oid() as never,
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
  };
}

describe('Diagnosis, problem-list, and allergy command workflows', () => {
  const actorUserId = oid().toHexString();
  const facilityId = oid().toHexString();
  const providerId = oid().toHexString();
  const occurredAt = new Date('2026-07-18T09:00:00.000Z');

  let encounter: EncounterRecord;
  let diagnoses: Map<string, EncounterDiagnosisRecord>;
  let problems: Map<string, PatientProblemRecord>;
  let allergies: Map<string, PatientAllergyRecord>;
  let compensations: unknown[];
  let auditEntries: unknown[];
  let outboxMessages: unknown[];
  let realtimeMessages: unknown[];
  let problemVersions: unknown[];
  let allergyVersions: unknown[];
  let dependencies: ClinicalEmrMutationDependencies;
  let common: ClinicalListCommandService;

  beforeEach(() => {
    encounter = encounterRecord(facilityId, providerId);
    diagnoses = new Map();
    problems = new Map();
    allergies = new Map();
    compensations = [];
    auditEntries = [];
    outboxMessages = [];
    realtimeMessages = [];
    problemVersions = [];
    allergyVersions = [];

    dependencies = {
      transactionManager: {
        execute: vi.fn(
          async <T>(request: ClinicalEmrTransactionRequest<T>) =>
            request.execute({
              transactionId: 'clinical-list-transaction',
              idempotencyKey: request.idempotencyKey,
              checkpoint: async () => undefined,
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
          key: 'clinical.sequence.2026',
          value: 1,
        }),
      },
      canonicalPatient: {
        resolve: async (_requestedFacilityId, patientId) => ({
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

    const encounters = {
      findById: vi.fn(async () => encounter),
      touchClinicalActivityWithVersion: vi.fn(
        async (input: Record<string, unknown>) => {
          if (encounter.version !== input['expectedVersion']) {
            return null;
          }

          encounter = {
            ...encounter,
            lastClinicalActivityAt: occurredAt,
            latestDiagnosisAt:
              input['latestDiagnosisAt'] instanceof Date
                ? input['latestDiagnosisAt']
                : encounter.latestDiagnosisAt,
            version: encounter.version + 1,
            updatedAt: occurredAt,
          };

          return encounter;
        },
      ),
    };

    const notes = {
      findById: vi.fn(async () => clinicalNoteRecord(encounter)),
    };

    const attribution = new ClinicalNoteAttributionService({
      findActorIdentity: async () => ({
        userId: actorUserId,
        facilityId,
        staffId: providerId,
        status: 'ACTIVE',
      }),
    });

    common = new ClinicalListCommandService(
      encounters as never,
      notes as never,
      attribution,
      dependencies,
    );
  });

  const actor = () => ({
    userId: actorUserId,
    facilityId,
    correlationId: 'clinical-list-correlation',
    roleKeys: ['DOCTOR'],
    permissionKeys: [
      'encounters.read_assigned',
      'encounters.create',
      'encounters.finalize',
      'encounters.amend',
    ],
  });

  it('records an encounter diagnosis, updates encounter activity, and keeps evidence out of events', async () => {
    const repository = {
      create: vi.fn(async (input: Record<string, unknown>) => {
        const created = diagnosisRecord(encounter, {
          _id: new ObjectId(String(input['encounterDiagnosisId'])) as never,
          codeSystem:
            input['codeSystem'] as EncounterDiagnosisRecord['codeSystem'],
          code: String(input['code']),
          normalizedCode: String(input['code']),
          display: String(input['display']),
          evidence: input['evidence'] as string | null,
          recordedAt: input['recordedAt'] as Date,
          recordedBy: new ObjectId(String(input['recordedBy'])) as never,
        });
        diagnoses.set(created._id.toHexString(), created);
        return created;
      }),
      findById: vi.fn(async (_facility: string, id: string) =>
        diagnoses.get(id) ?? null),
      verifyWithVersion: vi.fn(),
      changeStatusWithVersion: vi.fn(),
    };

    const support = new DiagnosisCommandService(
      repository as never,
      {
        findById: async () => null,
      } as never,
      common,
    );

    const workflow = new RecordEncounterDiagnosisWorkflow(support);
    const result = await workflow.execute({
      actor: actor(),
      idempotencyKey: 'diagnosis-create-1',
      input: {
        encounterId: encounter._id.toHexString(),
        codeSystem: 'ICD_10',
        code: 'J06.9',
        display: 'Acute upper respiratory infection',
        role: 'PRIMARY',
        certainty: 'CONFIRMED',
        evidence: 'Sensitive clinical evidence must remain private.',
      },
    });

    expect(result.status).toBe('ACTIVE');
    expect(encounter.latestDiagnosisAt).toEqual(occurredAt);
    expect(compensations).toHaveLength(2);
    expect(auditEntries).toHaveLength(1);

    const published = JSON.stringify([
      ...outboxMessages,
      ...realtimeMessages,
    ]);
    expect(published).not.toContain('Sensitive clinical evidence');
  });

  it('rejects a stale diagnosis status mutation before persistence', async () => {
    const existing = diagnosisRecord(encounter, {
      version: 2,
    });
    diagnoses.set(existing._id.toHexString(), existing);

    const repository = {
      findById: vi.fn(async () => existing),
      create: vi.fn(),
      verifyWithVersion: vi.fn(),
      changeStatusWithVersion: vi.fn(),
    };

    const workflow = new ChangeEncounterDiagnosisStatusWorkflow(
      new DiagnosisCommandService(
        repository as never,
        {
          findById: async () => null,
        } as never,
        common,
      ),
    );

    await expect(
      workflow.execute({
        encounterDiagnosisId: existing._id.toHexString(),
        actor: actor(),
        idempotencyKey: 'diagnosis-status-stale',
        input: {
          expectedVersion: 1,
          status: 'RESOLVED',
          reason: 'Condition resolved',
        },
      }),
    ).rejects.toBeInstanceOf(EncounterDiagnosisConcurrencyError);

    expect(repository.changeStatusWithVersion).not.toHaveBeenCalled();
  });

  it('creates a longitudinal problem with an encrypted immutable version', async () => {
    const repository = {
      create: vi.fn(async (input: Record<string, unknown>) => {
        const created = problemRecord(encounter, {
          _id: new ObjectId(String(input['patientProblemId'])) as never,
          problemNumber: String(input['problemNumber']),
          code: String(input['code']),
          normalizedCode: String(input['code']),
          display: String(input['display']),
          summary: input['summary'] as string | null,
          latestVersionId:
            new ObjectId(String(input['initialVersionId'])) as never,
          recordedAt: input['recordedAt'] as Date,
        });
        problems.set(created._id.toHexString(), created);
        return created;
      }),
      findById: vi.fn(async (_facility: string, id: string) =>
        problems.get(id) ?? null),
      updateWithVersion: vi.fn(),
      markCorrectedWithVersion: vi.fn(),
    };

    const support = new PatientProblemCommandService(
      repository as never,
      {
        create: vi.fn(async (input: unknown) => {
          problemVersions.push(input);
          return input;
        }),
      } as never,
      {
        findById: async () => null,
      } as never,
      {
        findById: async () => null,
      } as never,
      {
        allocatePatientProblemNumber: async () => ({
          facilityId,
          serviceDate: encounter.serviceDate,
          sequenceKey: 'clinical.problem.number.2026',
          sequenceValue: 1,
          number: 'PRB-H001-2026-0000001',
        }),
      } as never,
      common,
    );

    const result = await new CreatePatientProblemWorkflow(support).execute({
      actor: actor(),
      idempotencyKey: 'problem-create-1',
      input: {
        sourceEncounterId: encounter._id.toHexString(),
        codeSystem: 'ICD_10',
        code: 'I10',
        display: 'Essential hypertension',
        onsetDate: '2024-01-01',
        summary: 'Sensitive longitudinal summary.',
      },
    });

    expect(result.currentVersion).toBe(1);
    expect(problemVersions).toHaveLength(1);
    expect(JSON.stringify(problemVersions)).toContain('ciphertext');
    expect(JSON.stringify(outboxMessages)).not.toContain(
      'Sensitive longitudinal summary',
    );
  });

  it('blocks a no-known-allergy declaration when active allergies exist', async () => {
    const active = allergyRecord(encounter);
    allergies.set(active._id.toHexString(), active);

    const support = new PatientAllergyCommandService(
      {
        list: async () => ({
          items: [active],
          page: 1,
          pageSize: 100,
          totalItems: 1,
          totalPages: 1,
        }),
      } as never,
      {
        create: vi.fn(),
      } as never,
      {
        findById: async () => null,
      } as never,
      common,
    );

    const normalized = await support.normalizeInput(actor(), {
      recordType: 'NO_KNOWN_ALLERGIES',
      category: 'OTHER',
      allergenText: 'No known allergies',
      severity: 'UNKNOWN',
      reactions: [],
    });

    await expect(
      support.assertNoKnownConflict(
        actor(),
        encounter.patientId.toHexString(),
        normalized,
      ),
    ).rejects.toBeInstanceOf(ClinicalNoKnownAllergyConflictError);
  });

  it('records an allergy, encrypts its immutable version, and emits a safe realtime warning', async () => {
    const repository = {
      create: vi.fn(async (input: Record<string, unknown>) => {
        const created = allergyRecord(encounter, {
          _id: new ObjectId(String(input['patientAllergyId'])) as never,
          allergenText: String(input['allergenText']),
          normalizedAllergenText: String(input['allergenText']).toLowerCase(),
          reactions: input['reactions'] as PatientAllergyRecord['reactions'],
          notes: input['notes'] as string | null,
          latestVersionId:
            new ObjectId(String(input['initialVersionId'])) as never,
          recordedAt: input['recordedAt'] as Date,
        });
        allergies.set(created._id.toHexString(), created);
        return created;
      }),
      findById: vi.fn(async (_facility: string, id: string) =>
        allergies.get(id) ?? null),
      list: vi.fn(async () => ({
        items: [],
        page: 1,
        pageSize: 100,
        totalItems: 0,
        totalPages: 0,
      })),
      updateWithVersion: vi.fn(),
      markCorrectedWithVersion: vi.fn(),
    };

    const support = new PatientAllergyCommandService(
      repository as never,
      {
        create: vi.fn(async (input: unknown) => {
          allergyVersions.push(input);
          return input;
        }),
      } as never,
      {
        findById: async () => null,
      } as never,
      common,
    );

    const result = await new RecordPatientAllergyWorkflow(support).execute({
      actor: actor(),
      idempotencyKey: 'allergy-create-1',
      input: {
        patientId: encounter.patientId.toHexString(),
        sourceEncounterId: encounter._id.toHexString(),
        recordType: 'ALLERGY',
        category: 'MEDICATION',
        allergenText: 'Penicillin',
        verificationStatus: 'CONFIRMED',
        severity: 'SEVERE',
        reactions: [
          {
            manifestation: 'Generalized urticaria',
            severity: 'SEVERE',
            notes: 'Sensitive reaction narrative.',
          },
        ],
        notes: 'Sensitive allergy notes.',
      },
    });

    expect(result.status).toBe('ACTIVE');
    expect(allergyVersions).toHaveLength(1);
    expect(
      realtimeMessages.some(
        (message) =>
          (message as { eventType?: string }).eventType ===
          'clinical.allergy_warning.changed',
      ),
    ).toBe(true);

    const published = JSON.stringify([
      ...outboxMessages,
      ...realtimeMessages,
    ]);
    expect(published).not.toContain('Sensitive reaction narrative');
    expect(published).not.toContain('Sensitive allergy notes');
  });

  it('keeps safe event projections free of clinical narratives', () => {
    const diagnosis = diagnosisRecord(encounter);
    const problem = problemRecord(encounter);
    const allergy = allergyRecord(encounter);

    expect(JSON.stringify(safeEncounterDiagnosisEventPayload(diagnosis)))
      .not.toContain(diagnosis.evidence);
    expect(JSON.stringify(safePatientProblemEventPayload(problem)))
      .not.toContain(problem.summary);
    expect(JSON.stringify(safePatientAllergyEventPayload(allergy)))
      .not.toContain('Generalized urticaria');
  });
});