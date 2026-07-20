import {
  randomUUID,
} from 'node:crypto';

import {
  Types,
} from 'mongoose';

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  RequestValidationError,
} from '@hospital-mis/shared';

import {
  VitalSignModel,
} from '@hospital-mis/database';

import type {
  ClinicalEmrActorContext,
  EncounterRecord,
  VitalSignRecord,
} from '../clinical-emr.types.js';

import {
  StructuredEncounterSectionService,
} from '../services/structured-encounter-section.service.js';

import {
  safeVitalSignEventPayload,
  VitalSignCommandService,
} from '../services/vital-sign-command.service.js';

import {
  CorrectVitalSignsWorkflow,
  RecordStructuredEncounterSectionWorkflow,
  RecordVitalSignsWorkflow,
} from '../services/workflows/structured-section-and-vital-sign.workflows.js';

function actor(): ClinicalEmrActorContext {
  return {
    userId: new Types.ObjectId().toHexString(),
    facilityId: new Types.ObjectId().toHexString(),
    correlationId: randomUUID(),
    roleKeys: ['DOCTOR'],
    permissionKeys: [
      'encounters.read_assigned',
      'clinical_notes.create',
    ],
  };
}

function encounterRecord(
  actorContext: ClinicalEmrActorContext,
): EncounterRecord {
  const now = new Date('2026-07-18T08:00:00.000Z');
  const providerId = new Types.ObjectId();

  return {
    _id: new Types.ObjectId(),
    facilityId: new Types.ObjectId(actorContext.facilityId),
    encounterNumber: 'ENC-2026-000001',
    patientId: new Types.ObjectId(),
    requestedPatientId: new Types.ObjectId(),
    canonicalRedirected: false,
    registrationId: new Types.ObjectId(),
    opdVisitId: new Types.ObjectId(),
    queueTokenId: new Types.ObjectId(),
    emergencyCaseId: null,
    admissionId: null,
    referralId: null,
    encounterType: 'OPD',
    careContext: 'OPD_VISIT',
    status: 'IN_PROGRESS',
    serviceDate: '2026-07-18',
    departmentId: new Types.ObjectId(),
    clinicId: new Types.ObjectId(),
    servicePointId: new Types.ObjectId(),
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
    transactionId: randomUUID(),
    correlationId: actorContext.correlationId,
    schemaVersion: 1,
    version: 0,
    createdBy: new Types.ObjectId(actorContext.userId),
    updatedBy: new Types.ObjectId(actorContext.userId),
    createdAt: now,
    updatedAt: now,
  };
}

function vitalSignRecord(
  encounter: EncounterRecord,
  overrides: Partial<VitalSignRecord> = {},
): VitalSignRecord {
  const measuredAt = new Date('2026-07-18T08:05:00.000Z');
  const providerId = encounter.primaryProviderId;

  return {
    _id: new Types.ObjectId(),
    facilityId: encounter.facilityId,
    encounterId: encounter._id,
    patientId: encounter.patientId,
    admissionId: null,
    sourceClinicalNoteId: null,
    observerProviderId: providerId,
    source: 'MANUAL',
    deviceIdentifier: null,
    measuredAt,
    recordedAt: measuredAt,
    bodyPosition: 'SITTING',
    temperatureCelsius: Types.Decimal128.fromString('37.2'),
    temperatureSite: 'ORAL',
    pulsePerMinute: 84,
    respiratoryRatePerMinute: 18,
    systolicBloodPressureMmHg: 122,
    diastolicBloodPressureMmHg: 78,
    oxygenSaturationPercent: Types.Decimal128.fromString('98'),
    bloodGlucoseMgDl: null,
    painScore: 2,
    weightKg: Types.Decimal128.fromString('70'),
    heightCm: Types.Decimal128.fromString('175'),
    bmi: Types.Decimal128.fromString('22.86'),
    oxygenDeliveryMethod: null,
    oxygenFlowLitresPerMinute: null,
    notes: 'Sensitive clinical observation.',
    confidentiality: 'ROUTINE',
    restrictionReason: null,
    status: 'RECORDED',
    correctedAt: null,
    correctedBy: null,
    correctionReason: null,
    supersedesVitalSignId: null,
    supersededByVitalSignId: null,
    enteredInErrorAt: null,
    enteredInErrorBy: null,
    enteredInErrorReason: null,
    transactionId: randomUUID(),
    correlationId: randomUUID(),
    schemaVersion: 1,
    version: 0,
    createdBy: encounter.createdBy,
    updatedBy: encounter.updatedBy,
    createdAt: measuredAt,
    updatedAt: measuredAt,
    ...overrides,
  };
}

function transaction() {
  return {
    transactionId: randomUUID(),
    idempotencyKey: randomUUID(),
    checkpoint: vi.fn(async () => undefined),
    registerCompensation: vi.fn(async () => undefined),
  };
}

describe('structured encounter sections and vital signs', () => {
  it('maps structured encounter sections to controlled clinical document types', async () => {
    const sections = new StructuredEncounterSectionService();
    const execute = vi.fn(async (command: unknown) => command);
    const workflow = new RecordStructuredEncounterSectionWorkflow(
      sections,
      {
        execute,
      } as never,
    );
    const currentActor = actor();

    await workflow.execute({
      actor: currentActor,
      idempotencyKey: 'section-1',
      input: {
        encounterId: new Types.ObjectId().toHexString(),
        authorProviderId: new Types.ObjectId().toHexString(),
        sectionKey: 'HISTORY_OF_PRESENTING_ILLNESS',
        structuredData: {
          chronology: 'Symptoms progressed over three days.',
          severity: 6,
          associatedSymptoms: ['Fever'],
        },
      },
    });

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'section-1',
        input: expect.objectContaining({
          documentType: 'HISTORY_OF_PRESENTING_ILLNESS',
          title: 'History of presenting illness',
        }),
      }),
    );
  });

  it('rejects unsafe or out-of-catalog structured clinical fields', () => {
    const sections = new StructuredEncounterSectionService();

    expect(() =>
      sections.buildClinicalNoteInput({
        encounterId: new Types.ObjectId().toHexString(),
        authorProviderId: new Types.ObjectId().toHexString(),
        sectionKey: 'PLAN',
        structuredData: {
          arbitrarySecretProjection: 'not permitted',
        },
      }),
    ).toThrow(RequestValidationError);
  });

  it('validates vital-sign measurement integrity at the database model boundary', async () => {
    const id = new Types.ObjectId();
    const empty = new VitalSignModel({
      facilityId: id,
      encounterId: new Types.ObjectId(),
      patientId: new Types.ObjectId(),
      observerProviderId: new Types.ObjectId(),
      source: 'MANUAL',
      measuredAt: new Date(),
      recordedAt: new Date(),
      bodyPosition: 'UNSPECIFIED',
      temperatureSite: 'UNSPECIFIED',
      confidentiality: 'ROUTINE',
      status: 'RECORDED',
      transactionId: randomUUID(),
      correlationId: randomUUID(),
      createdBy: id,
      updatedBy: id,
    });

    await expect(empty.validate()).rejects.toThrow(
      'At least one clinical measurement is required',
    );
  });

  it('normalizes decimal measurements and derives BMI without binary floating storage', () => {
    const support = {
      dependencies: {},
    } as never;
    const service = new VitalSignCommandService({} as never, support);
    const normalized = service.normalizeMeasurement(
      {
        measuredAt: '2026-07-18T08:05:00.000Z',
        weightKg: '70.000',
        heightCm: '175.00',
        pulsePerMinute: 84,
      },
      new Date('2026-07-18T08:00:00.000Z'),
      new Date('2026-07-18T08:10:00.000Z'),
    );

    expect(normalized.weightKg).toBe('70.000');
    expect(normalized.heightCm).toBe('175.00');
    expect(normalized.bmi).toBe('22.86');
  });

  it('records vital signs transactionally and keeps values out of events', async () => {
    const currentActor = actor();
    const encounter = encounterRecord(currentActor);
    const created = vitalSignRecord(encounter);
    const tx = transaction();
    const published: unknown[] = [];

    const support = {
      requireEncounter: vi.fn(async () => encounter),
      requireClinicalNoteReference: vi.fn(async () => null),
      requireProvider: vi.fn(async () => encounter.primaryProviderId.toHexString()),
      assertAccess: vi.fn(async () => undefined),
      newId: vi.fn(() => created._id.toHexString()),
      touchEncounter: vi.fn(async () => encounter),
      publishMutation: vi.fn(async (input: unknown) => {
        published.push(input);
      }),
      dependencies: {
        clock: {
          now: () => new Date('2026-07-18T08:10:00.000Z'),
        },
        transactionManager: {
          execute: vi.fn(async (input: { execute(value: typeof tx): Promise<unknown> }) =>
            input.execute(tx),
          ),
        },
      },
    };

    const repository = {
      create: vi.fn(async () => created),
    };
    const service = new VitalSignCommandService(
      repository as never,
      support as never,
    );
    const workflow = new RecordVitalSignsWorkflow(service);

    const result = await workflow.execute({
      actor: currentActor,
      idempotencyKey: 'vital-1',
      input: {
        encounterId: encounter._id.toHexString(),
        measuredAt: '2026-07-18T08:05:00.000Z',
        temperatureCelsius: '37.2',
        pulsePerMinute: 84,
        systolicBloodPressureMmHg: 122,
        diastolicBloodPressureMmHg: 78,
        notes: 'Sensitive clinical observation.',
      },
    });

    expect(result.temperatureCelsius).toBe('37.2');
    expect(tx.registerCompensation).toHaveBeenCalledTimes(1);
    expect(support.touchEncounter).toHaveBeenCalledTimes(1);
    expect(published).toHaveLength(1);

    const event = JSON.stringify(safeVitalSignEventPayload(created));
    expect(event).not.toContain('37.2');
    expect(event).not.toContain('122');
    expect(event).not.toContain('Sensitive clinical observation');
  });

  it('corrects vital signs by creating a linked replacement and preserving the original', async () => {
    const currentActor = actor();
    const encounter = encounterRecord(currentActor);
    const current = vitalSignRecord(encounter);
    const replacement = vitalSignRecord(encounter, {
      _id: new Types.ObjectId(),
      pulsePerMinute: 80,
      supersedesVitalSignId: current._id,
    });
    const corrected = vitalSignRecord(encounter, {
      ...current,
      status: 'CORRECTED',
      version: 1,
      correctedAt: new Date('2026-07-18T08:15:00.000Z'),
      correctedBy: new Types.ObjectId(currentActor.userId),
      correctionReason: 'Transcription error in pulse.',
      supersededByVitalSignId: replacement._id,
    });
    const tx = transaction();

    const support = {
      requireEncounter: vi.fn(async () => encounter),
      requireClinicalNoteReference: vi.fn(async () => null),
      requireProvider: vi.fn(async () => encounter.primaryProviderId.toHexString()),
      assertAccess: vi.fn(async () => undefined),
      newId: vi.fn(() => replacement._id.toHexString()),
      touchEncounter: vi.fn(async () => encounter),
      publishMutation: vi.fn(async () => undefined),
      dependencies: {
        clock: {
          now: () => new Date('2026-07-18T08:15:00.000Z'),
        },
        snapshotCrypto: {
          protect: vi.fn(() => ({
            encryptedValue: {
              algorithm: 'AES-256-GCM',
              keyVersion: 'v1',
              initializationVector: '0'.repeat(24),
              authenticationTag: '1'.repeat(32),
              ciphertext: 'encrypted',
            },
            valueHash: 'a'.repeat(64),
          })),
        },
        transactionManager: {
          execute: vi.fn(async (input: { execute(value: typeof tx): Promise<unknown> }) =>
            input.execute(tx),
          ),
        },
      },
    };

    const repository = {
      findById: vi.fn(async () => current),
      create: vi.fn(async () => replacement),
      markCorrectedWithVersion: vi.fn(async () => corrected),
    };
    const service = new VitalSignCommandService(
      repository as never,
      support as never,
    );
    const workflow = new CorrectVitalSignsWorkflow(service);

    const result = await workflow.execute({
      actor: currentActor,
      idempotencyKey: 'vital-correction-1',
      vitalSignId: current._id.toHexString(),
      input: {
        expectedVersion: 0,
        reason: 'Transcription error in pulse.',
        measuredAt: '2026-07-18T08:05:00.000Z',
        pulsePerMinute: 80,
      },
    });

    expect(result.vitalSignId).toBe(replacement._id.toHexString());
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        supersedesVitalSignId: current._id.toHexString(),
      }),
    );
    expect(repository.markCorrectedWithVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        vitalSignId: current._id.toHexString(),
        replacementVitalSignId: replacement._id.toHexString(),
      }),
    );
    expect(tx.registerCompensation).toHaveBeenCalledTimes(2);
    expect(support.publishMutation).toHaveBeenCalledTimes(2);
  });
});