import {
  Types,
} from 'mongoose';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  assertLaboratoryOrderTransition,
  assertLaboratoryResultEditable,
  assertLaboratoryResultVerificationReady,
  assertLaboratorySpecimenTransition,
  canTransitionLaboratoryOrder,
  canTransitionLaboratoryPublication,
  canTransitionLaboratoryResult,
  canTransitionLaboratorySpecimen,
} from '../laboratory.lifecycle.js';

import {
  createLaboratoryOrderBodySchema,
  createLaboratoryTestBodySchema,
  recordCriticalResultCommunicationBodySchema,
} from '../laboratory.validation.js';

import {
  LaboratoryAccessPolicyService,
  type LaboratoryActorIdentityReader,
} from '../services/laboratory-access-policy.service.js';

import type {
  LaboratoryActorIdentityRecord,
} from '../repositories/laboratory-context.repository.js';

import type {
  LaboratoryOrderRecord,
} from '../laboratory.persistence.types.js';

function actorIdentity(
  staffId: string | null,
): LaboratoryActorIdentityRecord {
  return {
    userId: new Types.ObjectId().toHexString(),
    facilityId: null,
    staffId,
    status: 'ACTIVE',
  };
}

class IdentityReader
implements LaboratoryActorIdentityReader {
  public constructor(
    private readonly identity: LaboratoryActorIdentityRecord | null,
  ) {}

  public async findActorIdentity(): Promise<LaboratoryActorIdentityRecord | null> {
    return this.identity;
  }
}

function orderRecord(
  facilityId: Types.ObjectId,
  providerId: Types.ObjectId,
): LaboratoryOrderRecord {
  const now = new Date();

  return {
    _id: new Types.ObjectId(),
    facilityId,
    orderNumber: 'LAB-2026-0000001',
    patientId: new Types.ObjectId(),
    requestedPatientId: new Types.ObjectId(),
    canonicalRedirected: false,
    encounterId: new Types.ObjectId(),
    registrationId: null,
    opdVisitId: null,
    queueTokenId: null,
    departmentId: new Types.ObjectId(),
    clinicId: null,
    servicePointId: null,
    orderingProviderId: providerId,
    priority: 'ROUTINE',
    status: 'ORDERED',
    clinicalIndication: 'Fictional clinical indication',
    orderingNotes: null,
    orderedAt: now,
    acceptedAt: null,
    acceptedBy: null,
    collectionCompletedAt: null,
    processingStartedAt: null,
    completedAt: null,
    verifiedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    cancellationReason: null,
    itemCount: 1,
    activeItemCount: 1,
    collectedItemCount: 0,
    completedItemCount: 0,
    verifiedItemCount: 0,
    rejectedItemCount: 0,
    criticalResultCount: 0,
    lastStatusChangedAt: now,
    lastStatusChangedBy: new Types.ObjectId(),
    transactionId: 'transaction-id',
    correlationId: 'correlation-id',
    schemaVersion: 1,
    version: 0,
    createdBy: new Types.ObjectId(),
    updatedBy: new Types.ObjectId(),
    createdAt: now,
    updatedAt: now,
  };
}

describe('Laboratory domain infrastructure', () => {
  it('enforces explicit order, specimen, result, and publication transitions', () => {
    expect(
      canTransitionLaboratoryOrder('ORDERED', 'ACCEPTED'),
    ).toBe(true);

    expect(
      canTransitionLaboratoryOrder('VERIFIED', 'CANCELLED'),
    ).toBe(false);

    expect(
      canTransitionLaboratorySpecimen('COLLECTED', 'RECEIVED'),
    ).toBe(true);

    expect(
      canTransitionLaboratorySpecimen('COMPLETED', 'PROCESSING'),
    ).toBe(false);

    expect(
      canTransitionLaboratoryResult('VALIDATED', 'VERIFIED'),
    ).toBe(true);

    expect(
      canTransitionLaboratoryPublication('PUBLISHED', 'WITHDRAWN'),
    ).toBe(true);

    expect(() =>
      assertLaboratoryOrderTransition('VERIFIED', 'CANCELLED'),
    ).toThrow(
      'Laboratory order cannot transition from VERIFIED to CANCELLED',
    );

    expect(() =>
      assertLaboratorySpecimenTransition('COMPLETED', 'REJECTED'),
    ).toThrow(
      'Laboratory specimen cannot transition from COMPLETED to REJECTED',
    );
  });

  it('blocks in-place mutation of finalized Laboratory results', () => {
    expect(() =>
      assertLaboratoryResultEditable('VERIFIED'),
    ).toThrow(
      'Verified or corrected Laboratory results cannot be edited in place',
    );

    expect(() =>
      assertLaboratoryResultEditable('CORRECTED'),
    ).toThrow();

    expect(() =>
      assertLaboratoryResultEditable('ENTERED'),
    ).not.toThrow();
  });

  it('requires complete attribution and components before verification', () => {
    expect(() =>
      assertLaboratoryResultVerificationReady({
        status: 'VALIDATED',
        componentCount: 2,
        requiredComponentCount: 2,
        populatedRequiredComponentCount: 2,
        requiresValidation: true,
        validatedAt: new Date(),
        technicianStaffId: 'technician',
        validatorStaffId: 'validator',
        verifierStaffId: 'verifier',
      }),
    ).not.toThrow();

    expect(() =>
      assertLaboratoryResultVerificationReady({
        status: 'VALIDATED',
        componentCount: 2,
        requiredComponentCount: 2,
        populatedRequiredComponentCount: 1,
        requiresValidation: true,
        validatedAt: new Date(),
        technicianStaffId: 'technician',
        validatorStaffId: 'validator',
        verifierStaffId: 'verifier',
      }),
    ).toThrow(
      'All required Laboratory result components must be populated',
    );
  });

  it('rejects duplicate standardized test selection at the DTO boundary', () => {
    const testId = new Types.ObjectId().toHexString();

    const result = createLaboratoryOrderBodySchema.safeParse({
      encounterId: new Types.ObjectId().toHexString(),
      priority: 'URGENT',
      clinicalIndication: 'Fictional urgent clinical indication',
      testIds: [
        testId,
        testId,
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects inconsistent specimen and reference-range definitions', () => {
    const result = createLaboratoryTestBodySchema.safeParse({
      testCode: 'CBC',
      name: 'Complete Blood Count',
      categoryId: new Types.ObjectId().toHexString(),
      requiresSpecimen: true,
      specimenRequirements: [],
      components: [
        {
          componentCode: 'HGB',
          name: 'Hemoglobin',
          valueType: 'NUMERIC',
          unitCode: 'G_DL',
          unitName: 'g/dL',
          referenceRanges: [
            {
              rangeCode: 'ADULT',
              kind: 'NUMERIC_INTERVAL',
              lowerBound: '17',
              upperBound: '12',
            },
          ],
        },
      ],
      routineTurnaroundMinutes: 240,
    });

    expect(result.success).toBe(false);
  });

  it('requires internal recipient attribution for critical-result acknowledgement', () => {
    const result =
      recordCriticalResultCommunicationBodySchema.safeParse({
        expectedVersion: 1,
        componentCode: 'HGB',
        communicationType: 'ACKNOWLEDGED',
        channel: 'PHONE',
        recipientType: 'ORDERING_PROVIDER',
        recipientDisplay: 'Ordering provider',
        acknowledgedAt: new Date().toISOString(),
        acknowledgedBy: new Types.ObjectId().toHexString(),
      });

    expect(result.success).toBe(false);
  });

  it('authorizes assigned clinicians and Laboratory operational staff centrally', async () => {
    const facilityId = new Types.ObjectId();
    const providerId = new Types.ObjectId();
    const order = orderRecord(facilityId, providerId);

    const clinicianPolicy =
      new LaboratoryAccessPolicyService(
        new IdentityReader(
          actorIdentity(providerId.toHexString()),
        ),
      );

    const clinicianDecision =
      await clinicianPolicy.authorize({
        actor: {
          userId: new Types.ObjectId().toHexString(),
          facilityId: facilityId.toHexString(),
          correlationId: 'correlation-id',
          roleKeys: ['CLINICAL_DOCTOR'],
          permissionKeys: ['laboratory.orders.create'],
        },
        action: 'ORDER_CREATE',
        clinicalContext: {
          encounterId: order.encounterId.toHexString(),
          facilityId: facilityId.toHexString(),
          patientId: order.patientId.toHexString(),
          requestedPatientId: order.requestedPatientId.toHexString(),
          canonicalRedirected: false,
          confidentiality: 'STANDARD',
          registrationId: null,
          opdVisitId: null,
          queueTokenId: null,
          departmentId: order.departmentId.toHexString(),
          clinicId: null,
          servicePointId: null,
          orderingProviderId: providerId.toHexString(),
          assignedProviderIds: [providerId.toHexString()],
        },
      });

    expect(clinicianDecision.allowed).toBe(true);
    expect(clinicianDecision.accessMode).toBe('ASSIGNED_CLINICIAN');

    const laboratoryPolicy =
      new LaboratoryAccessPolicyService(
        new IdentityReader(
          actorIdentity(new Types.ObjectId().toHexString()),
        ),
      );

    const laboratoryDecision =
      await laboratoryPolicy.authorize({
        actor: {
          userId: new Types.ObjectId().toHexString(),
          facilityId: facilityId.toHexString(),
          correlationId: 'correlation-id',
          roleKeys: ['LABORATORY_STAFF'],
          permissionKeys: ['laboratory.results.verify'],
        },
        action: 'RESULT_VERIFY',
        order,
      });

    expect(laboratoryDecision.allowed).toBe(true);
    expect(laboratoryDecision.accessMode).toBe(
      'LABORATORY_OPERATIONAL',
    );
  });

  it('requires a documented reason for break-glass Laboratory reads', async () => {
    const policy =
      new LaboratoryAccessPolicyService(
        new IdentityReader(
          actorIdentity(new Types.ObjectId().toHexString()),
        ),
      );

    await expect(
      policy.authorize({
        actor: {
          userId: new Types.ObjectId().toHexString(),
          facilityId: new Types.ObjectId().toHexString(),
          correlationId: 'correlation-id',
          roleKeys: [],
          permissionKeys: [
            'laboratory.results.read',
            'security.break_glass',
          ],
        },
        action: 'RESULT_READ',
      }),
    ).rejects.toThrow(
      'Emergency Laboratory access requires a documented break-glass reason',
    );
  });
});