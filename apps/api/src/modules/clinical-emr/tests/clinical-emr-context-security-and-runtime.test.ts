import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  ClinicalEmrBreakGlassReasonRequiredError,
  CanonicalClinicalPatientUnavailableError,
  ClinicalEncounterContextMismatchError,
} from '../clinical-emr.errors.js';

import {
  ClinicalEmrContextService,
  type ClinicalEmrContextReader,
} from '../services/clinical-emr-context.service.js';

import {
  ClinicalEmrPatientResolutionService,
} from '../services/clinical-emr-patient-resolution.service.js';

import {
  ClinicalEmrNumberService,
} from '../services/clinical-emr-number.service.js';

import {
  ClinicalEmrAccessPolicyService,
} from '../services/clinical-emr-access-policy.service.js';

import {
  ClinicalEmrSnapshotCryptoService,
} from '../../../infrastructure/clinical-emr-snapshot-crypto.service.js';

import {
  assertSafeClinicalEventPayload,
} from '../../../infrastructure/clinical-emr-runtime.adapters.js';

const facilityId = '64b64b64b64b64b64b64b641';
const patientId = '64b64b64b64b64b64b64b642';
const requestedPatientId = '64b64b64b64b64b64b64b643';
const registrationId = '64b64b64b64b64b64b64b644';
const visitId = '64b64b64b64b64b64b64b645';
const queueTokenId = '64b64b64b64b64b64b64b646';
const departmentId = '64b64b64b64b64b64b64b647';
const clinicId = '64b64b64b64b64b64b64b648';
const servicePointId = '64b64b64b64b64b64b64b649';
const providerId = '64b64b64b64b64b64b64b650';
const userId = '64b64b64b64b64b64b64b651';

interface ContextOverrides {
  visitStatus?: 'CHECKED_IN' | 'QUEUED' | 'IN_SERVICE' | 'COMPLETED';
  registrationStatus?: 'ACTIVE' | 'CANCELLED' | 'SUPERSEDED';
  providerId?: string | null;
}

function contextReader(
  overrides: ContextOverrides = {},
): ClinicalEmrContextReader {
  const queueProviderId = overrides.providerId ?? providerId;

  return {
    async findFacility() {
      return {
        id: facilityId,
        code: 'AKUH',
        name: 'Demo Hospital',
        timezone: 'Asia/Karachi',
        status: 'ACTIVE',
      };
    },

    async findDepartment() {
      return {
        id: departmentId,
        facilityId,
        code: 'MED',
        name: 'Medicine',
        isClinical: true,
        status: 'ACTIVE',
      };
    },

    async findClinic() {
      return {
        id: clinicId,
        facilityId,
        departmentId,
        code: 'MED-OPD',
        name: 'Medicine OPD',
        defaultProviderId: providerId,
        status: 'ACTIVE',
      };
    },

    async findServicePoint() {
      return {
        id: servicePointId,
        facilityId,
        departmentId,
        clinicId,
        code: 'ROOM-1',
        name: 'Consultation Room 1',
        servicePointType: 'CONSULTATION_ROOM',
        defaultProviderId: providerId,
        status: 'ACTIVE',
      };
    },

    async findProvider() {
      return {
        id: providerId,
        facilityId,
        departmentId,
        employeeNumber: 'DOC-001',
        displayName: 'Dr Fictional Provider',
        designation: 'Consultant',
        professionalType: 'DOCTOR',
        employmentStatus: 'ACTIVE',
        isClinical: true,
        isActive: true,
      };
    },

    async findRegistration() {
      return {
        id: registrationId,
        facilityId,
        patientId,
        requestedPatientId,
        status: overrides.registrationStatus ?? 'ACTIVE',
        serviceDate: '2026-07-18',
        departmentId,
        clinicId,
        servicePointId,
        assignedProviderId: providerId,
        emergencyCaseId: null,
        referralId: null,
      };
    },

    async findOpdVisit() {
      return {
        id: visitId,
        facilityId,
        registrationId,
        patientId,
        requestedPatientId,
        serviceDate: '2026-07-18',
        status: overrides.visitStatus ?? 'QUEUED',
        departmentId,
        clinicId,
        servicePointId,
        assignedProviderId: providerId,
        assignedCounterId: null,
        currentQueueTokenId: queueTokenId,
      };
    },

    async findQueueToken() {
      return {
        id: queueTokenId,
        facilityId,
        registrationId,
        opdVisitId: visitId,
        patientId,
        queueDefinitionId: '64b64b64b64b64b64b64b652',
        serviceDate: '2026-07-18',
        status: 'CALLED',
        assignedProviderId: queueProviderId,
        assignedCounterId: null,
        queuedAt: new Date('2026-07-18T04:00:00.000Z'),
        calledAt: new Date('2026-07-18T04:05:00.000Z'),
        servingAt: null,
      };
    },
  };
}

describe('Clinical EMR context, security, and runtime foundation', () => {
  it('resolves a strictly linked OPD encounter context', async () => {
    const service = new ClinicalEmrContextService(contextReader());

    const resolved = await service.resolveOpdContext(
      facilityId,
      visitId,
    );

    expect(resolved.linkage).toEqual({
      facilityId,
      patientId,
      registrationId,
      opdVisitId: visitId,
      queueTokenId,
      departmentId,
      clinicId,
      servicePointId,
      assignedProviderId: providerId,
      visitStatus: 'QUEUED',
      queueStatus: 'CALLED',
    });
  });

  it('rejects a queue provider that differs from the visit provider', async () => {
    const service = new ClinicalEmrContextService(
      contextReader({
        providerId: '64b64b64b64b64b64b64b699',
      }),
    );

    await expect(
      service.resolveOpdContext(facilityId, visitId),
    ).rejects.toBeInstanceOf(ClinicalEncounterContextMismatchError);
  });

  it('rejects terminal OPD visits', async () => {
    const service = new ClinicalEmrContextService(
      contextReader({
        visitStatus: 'COMPLETED',
      }),
    );

    await expect(
      service.resolveOpdContext(facilityId, visitId),
    ).rejects.toThrow('cannot be used to open a clinical encounter');
  });

  it('resolves canonical active patients and blocks unavailable statuses', async () => {
    const active = new ClinicalEmrPatientResolutionService({
      async resolve() {
        return {
          requestedPatientId,
          canonicalPatientId: patientId,
          canonicalEnterprisePatientId: 'fictional-enterprise-id',
          canonicalStatus: 'ACTIVE',
          redirected: true,
          redirectPath: [requestedPatientId, patientId],
        };
      },
    });

    await expect(active.resolve(facilityId, requestedPatientId)).resolves.toEqual({
      requestedPatientId,
      canonicalPatientId: patientId,
      redirected: true,
      mergeChain: [requestedPatientId, patientId],
    });

    const deceased = new ClinicalEmrPatientResolutionService({
      async resolve() {
        return {
          requestedPatientId: patientId,
          canonicalPatientId: patientId,
          canonicalEnterprisePatientId: 'fictional-enterprise-id',
          canonicalStatus: 'DECEASED',
          redirected: false,
          redirectPath: [patientId],
        };
      },
    });

    await expect(
      deceased.resolve(facilityId, patientId),
    ).rejects.toBeInstanceOf(CanonicalClinicalPatientUnavailableError);
  });

  it('allocates facility-scoped clinical numbers through the shared sequence port', async () => {
    let current = 40;

    const service = new ClinicalEmrNumberService(
      {
        async next(_facilityId, key) {
          current += 1;
          return {
            key,
            value: current,
          };
        },
      },
      {
        async findFacility() {
          return {
            code: 'HSP-01',
            status: 'ACTIVE',
          };
        },
      },
    );

    await expect(
      service.allocateEncounterNumber({
        facilityId,
        serviceDate: '2026-07-18',
      }),
    ).resolves.toMatchObject({
      sequenceValue: 41,
      number: 'ENC-HSP01-2026-000041',
    });

    await expect(
      service.allocateClinicalNoteNumber({
        facilityId,
        serviceDate: '2026-07-18',
      }),
    ).resolves.toMatchObject({
      sequenceValue: 42,
      number: 'CLN-HSP01-2026-0000042',
    });
  });

  it('enforces assigned, facility-wide, and break-glass clinical access', async () => {
    const assignedPolicy = new ClinicalEmrAccessPolicyService({
      async findActorIdentity() {
        return {
          userId,
          facilityId,
          staffId: providerId,
          status: 'ACTIVE',
        };
      },
    });

    await expect(
      assignedPolicy.authorize({
        actor: {
          userId,
          facilityId,
          correlationId: 'correlation-1',
          roleKeys: ['DOCTOR'],
          permissionKeys: ['encounters.read_assigned'],
        },
        patientId,
        encounterId: '64b64b64b64b64b64b64b653',
        assignedProviderIds: [providerId],
        confidentiality: 'ROUTINE',
        intendedAction: 'READ',
      }),
    ).resolves.toMatchObject({
      allowed: true,
      accessMode: 'ASSIGNED',
      auditSensitiveRead: true,
    });

    const facilityWidePolicy = new ClinicalEmrAccessPolicyService({
      async findActorIdentity() {
        return {
          userId,
          facilityId,
          staffId: null,
          status: 'ACTIVE',
        };
      },
    });

    await expect(
      facilityWidePolicy.authorize({
        actor: {
          userId,
          facilityId,
          correlationId: 'correlation-2',
          roleKeys: ['MEDICAL_RECORDS'],
          permissionKeys: ['encounters.read_all'],
        },
        patientId,
        assignedProviderIds: [providerId],
        confidentiality: 'RESTRICTED',
        intendedAction: 'READ',
      }),
    ).resolves.toMatchObject({
      allowed: true,
      accessMode: 'FACILITY_WIDE',
    });

    await expect(
      facilityWidePolicy.authorize({
        actor: {
          userId,
          facilityId,
          correlationId: 'correlation-3',
          roleKeys: ['AUDITOR'],
          permissionKeys: ['encounters.read_all', 'security.break_glass'],
        },
        patientId,
        assignedProviderIds: [providerId],
        confidentiality: 'HIGHLY_RESTRICTED',
        intendedAction: 'READ',
      }),
    ).rejects.toBeInstanceOf(ClinicalEmrBreakGlassReasonRequiredError);

    await expect(
      facilityWidePolicy.authorize({
        actor: {
          userId,
          facilityId,
          correlationId: 'correlation-4',
          roleKeys: ['AUDITOR'],
          permissionKeys: ['encounters.read_all', 'security.break_glass'],
          breakGlassReason: 'Emergency continuity of care review',
        },
        patientId,
        assignedProviderIds: [providerId],
        confidentiality: 'HIGHLY_RESTRICTED',
        intendedAction: 'READ',
      }),
    ).resolves.toMatchObject({
      allowed: true,
      accessMode: 'BREAK_GLASS',
    });
  });

  it('encrypts, authenticates, hashes, and decrypts clinical snapshots', () => {
    const key = Buffer.alloc(32, 9).toString('base64');
    const crypto = new ClinicalEmrSnapshotCryptoService({
      activeKeyVersion: 'clinical-v1',
      keys: {
        'clinical-v1': key,
      },
      hashSecret: 'clinical-hash-secret-with-more-than-32-bytes',
      randomBytes: () => Buffer.alloc(12, 7),
    });

    const associatedData = ClinicalEmrSnapshotCryptoService.associatedData({
      facilityId,
      patientId,
      entityType: 'clinical-note',
      entityId: '64b64b64b64b64b64b64b654',
      version: 1,
    });

    const value = {
      narrativeText: 'Sensitive fictional clinical narrative',
      structuredData: {
        severity: 'MODERATE',
      },
    };

    const protectedValue = crypto.protect(value, associatedData);

    expect(protectedValue.encryptedValue.ciphertext).not.toContain(
      'Sensitive fictional clinical narrative',
    );

    expect(
      crypto.unprotect(protectedValue.encryptedValue, associatedData),
    ).toEqual(value);

    expect(
      crypto.matchesHash(
        value,
        associatedData,
        protectedValue.valueHash,
      ),
    ).toBe(true);

    expect(() =>
      crypto.unprotect(
        protectedValue.encryptedValue,
        `${associatedData}:wrong`,
      ),
    ).toThrow();
  });

  it('rejects clinical narratives and direct identifiers in event payloads', () => {
    expect(() =>
      assertSafeClinicalEventPayload({
        encounterNumber: 'ENC-HSP01-2026-000001',
        status: 'IN_PROGRESS',
      }),
    ).not.toThrow();

    expect(() =>
      assertSafeClinicalEventPayload({
        narrativeText: 'Do not publish this',
      }),
    ).toThrow('cannot be published');

    expect(() =>
      assertSafeClinicalEventPayload({
        patient: {
          cnic: '0000000000000',
        },
      }),
    ).toThrow('cannot be published');
  });
});