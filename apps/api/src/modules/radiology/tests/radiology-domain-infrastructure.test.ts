import {
  Types,
} from 'mongoose';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  isPermissionKey,
  permissionDefinitions,
  permissionKeys,
} from '@hospital-mis/permissions';

import {
  assertRadiologyExaminationReady,
  assertRadiologyOrderItemTransition,
  assertRadiologyOrderTransition,
  assertRadiologyProcedureOrderable,
  assertRadiologyProcedureRequest,
  canTransitionRadiologyOrder,
  canTransitionRadiologyOrderItem,
} from '../radiology.lifecycle.js';

import {
  buildRadiologySequenceKey,
  formatRadiologyNumber,
  radiologyContentHash,
  turnaroundMinutesForRadiologyPriority,
} from '../radiology.normalization.js';

import {
  createRadiologyOrderBodySchema,
  createRadiologyProcedureBodySchema,
} from '../radiology.validation.js';

import {
  RadiologyAccessPolicyService,
  type RadiologyActorIdentityReader,
} from '../services/radiology-access-policy.service.js';

import type {
  RadiologyActorIdentityRecord,
} from '../repositories/radiology-context.repository.js';

import type {
  RadiologyClinicalContext,
} from '../radiology.types.js';

import type {
  RadiologyProcedureRecord,
} from '../radiology.persistence.types.js';

function identity(
  input: Partial<RadiologyActorIdentityRecord> = {},
): RadiologyActorIdentityRecord {
  return {
    userId: new Types.ObjectId().toHexString(),
    facilityId: null,
    staffId: new Types.ObjectId().toHexString(),
    status: 'ACTIVE',
    ...input,
  };
}

class IdentityReader
implements RadiologyActorIdentityReader {
  public constructor(
    private readonly value: RadiologyActorIdentityRecord | null,
  ) {}

  public async findActorIdentity(): Promise<RadiologyActorIdentityRecord | null> {
    return this.value;
  }
}

function clinicalContext(
  facilityId: string,
  assignedProviderIds: readonly string[],
): RadiologyClinicalContext {
  return {
    encounterId: new Types.ObjectId().toHexString(),
    facilityId,
    patientId: new Types.ObjectId().toHexString(),
    requestedPatientId: new Types.ObjectId().toHexString(),
    canonicalRedirected: false,
    confidentiality: 'STANDARD',
    registrationId: null,
    opdVisitId: null,
    queueTokenId: null,
    departmentId: new Types.ObjectId().toHexString(),
    clinicId: null,
    servicePointId: null,
    orderingProviderId: assignedProviderIds[0] ??
      new Types.ObjectId().toHexString(),
    assignedProviderIds,
  };
}

const radiologyPermissionKeys = [
  'radiology.catalog.read',
  'radiology.catalog.manage',
  'radiology.orders.read',
  'radiology.orders.create',
  'radiology.orders.manage',
  'radiology.orders.cancel',
  'radiology.schedules.read',
  'radiology.schedules.manage',
  'radiology.safety_screening.read',
  'radiology.safety_screening.manage',
  'radiology.examinations.read',
  'radiology.examinations.manage',
  'radiology.studies.read',
  'radiology.studies.manage',
  'radiology.reports.read',
  'radiology.reports.enter',
  'radiology.reports.review',
  'radiology.reports.verify',
  'radiology.reports.amend',
  'radiology.reports.publish',
  'radiology.reports.withdraw',
  'radiology.reports.print',
  'radiology.critical_findings.notify',
  'radiology.critical_findings.acknowledge',
] as const;

describe('Radiology domain infrastructure', () => {
  it('registers granular Radiology permissions as sensitive clinical access', () => {
    for (const permission of radiologyPermissionKeys) {
      expect(permissionKeys).toContain(permission);
      expect(isPermissionKey(permission)).toBe(true);
      expect(
        permissionKeys.filter((candidate) => candidate === permission),
      ).toHaveLength(1);
    }

    const definitions = permissionDefinitions.filter((definition) =>
      definition.key.startsWith('radiology.'),
    );

    expect(definitions.map((definition) => definition.key)).toEqual(
      expect.arrayContaining([...radiologyPermissionKeys]),
    );

    for (const definition of definitions) {
      expect(definition.module).toBe('radiology');
      expect(definition.sensitivity).toBe('SENSITIVE');
    }
  });

  it('enforces explicit order and order-item lifecycle transitions', () => {
    expect(canTransitionRadiologyOrder('ORDERED', 'ACCEPTED')).toBe(true);
    expect(canTransitionRadiologyOrder('VERIFIED', 'CANCELLED')).toBe(false);
    expect(
      canTransitionRadiologyOrderItem(
        'COMPLETED',
        'PRELIMINARY_REPORTED',
      ),
    ).toBe(true);
    expect(
      canTransitionRadiologyOrderItem('VERIFIED', 'FINAL_REPORTED'),
    ).toBe(false);

    expect(() =>
      assertRadiologyOrderTransition('VERIFIED', 'CANCELLED'),
    ).toThrow(
      'Radiology order cannot transition from VERIFIED to CANCELLED',
    );

    expect(() =>
      assertRadiologyOrderItemTransition(
        'FINAL_REPORTED',
        'IN_PROGRESS',
      ),
    ).toThrow(
      'Radiology order item cannot transition from FINAL_REPORTED to IN_PROGRESS',
    );
  });

  it('validates orderability, laterality, contrast, and examination readiness', () => {
    const departmentId = new Types.ObjectId();
    const now = new Date();
    const procedure: Pick<
      RadiologyProcedureRecord,
      | 'status'
      | 'orderable'
      | 'availableDepartmentIds'
      | 'effectiveFrom'
      | 'effectiveThrough'
      | 'lateralityRequirement'
      | 'permittedLateralities'
      | 'contrastRequirement'
      | 'permittedContrastRoutes'
      | 'routineTurnaroundMinutes'
      | 'urgentTurnaroundMinutes'
      | 'statTurnaroundMinutes'
    > = {
      status: 'ACTIVE',
      orderable: true,
      availableDepartmentIds: [departmentId],
      effectiveFrom: new Date(now.getTime() - 60_000),
      effectiveThrough: null,
      lateralityRequirement: 'REQUIRED',
      permittedLateralities: ['LEFT', 'RIGHT'],
      contrastRequirement: 'REQUIRED',
      permittedContrastRoutes: ['INTRAVENOUS'],
      routineTurnaroundMinutes: 1_440,
      urgentTurnaroundMinutes: 240,
      statTurnaroundMinutes: 60,
    };

    expect(() =>
      assertRadiologyProcedureOrderable(
        procedure,
        departmentId.toHexString(),
        now,
      ),
    ).not.toThrow();

    expect(() =>
      assertRadiologyProcedureRequest(procedure, {
        requestedLaterality: 'LEFT',
        contrastRequested: true,
        requestedContrastRoute: 'INTRAVENOUS',
      }),
    ).not.toThrow();

    expect(() =>
      assertRadiologyProcedureRequest(procedure, {
        requestedLaterality: 'BILATERAL',
        contrastRequested: true,
        requestedContrastRoute: 'INTRAVENOUS',
      }),
    ).toThrow(
      'The requested laterality is not permitted for the selected Radiology procedure',
    );

    expect(
      turnaroundMinutesForRadiologyPriority(procedure, 'STAT'),
    ).toBe(60);

    expect(() =>
      assertRadiologyExaminationReady('CLEARED', 'CONFIRMED'),
    ).not.toThrow();

    expect(() =>
      assertRadiologyExaminationReady('HOLD', 'CONFIRMED'),
    ).toThrow(
      'Radiology examination cannot start until required safety screening is cleared',
    );
  });

  it('rejects inconsistent procedure definitions and duplicate order selections', () => {
    const modalityId = new Types.ObjectId().toHexString();
    const departmentId = new Types.ObjectId().toHexString();

    const procedure = createRadiologyProcedureBodySchema.safeParse({
      procedureCode: 'CT_CHEST_CONTRAST',
      name: 'CT Chest with Contrast',
      modalityId,
      bodyRegions: [
        {
          code: 'CHEST',
          name: 'Chest',
        },
      ],
      lateralityRequirement: 'NOT_APPLICABLE',
      permittedLateralities: ['NOT_APPLICABLE'],
      contrastRequirement: 'REQUIRED',
      permittedContrastRoutes: ['INTRAVENOUS'],
      safetyScreeningRequirements: ['PREGNANCY', 'RENAL_RISK'],
      expectedDurationMinutes: 30,
      routineTurnaroundMinutes: 1_440,
      urgentTurnaroundMinutes: 240,
      statTurnaroundMinutes: 60,
      availableDepartmentIds: [departmentId],
    });

    expect(procedure.success).toBe(false);

    const procedureId = new Types.ObjectId().toHexString();
    const selection = {
      procedureId,
      requestedLaterality: 'NOT_APPLICABLE',
      contrastRequested: true,
      requestedContrastRoute: 'INTRAVENOUS',
    } as const;

    const order = createRadiologyOrderBodySchema.safeParse({
      encounterId: new Types.ObjectId().toHexString(),
      priority: 'URGENT',
      clinicalIndication: 'Fictional urgent imaging indication',
      items: [selection, selection],
    });

    expect(order.success).toBe(false);
  });

  it('formats sequence-backed identifiers and hashes canonical snapshots', () => {
    expect(buildRadiologySequenceKey('radiology.order.number', 2026)).toBe(
      'radiology.order.number:2026',
    );
    expect(formatRadiologyNumber('RAD', 2026, 41)).toBe(
      'RAD-2026-0000041',
    );
    expect(
      radiologyContentHash({
        b: 2,
        a: 1,
      }),
    ).toBe(
      radiologyContentHash({
        a: 1,
        b: 2,
      }),
    );
  });

  it('allows assigned clinicians, isolates facilities, and requires active staff attribution', async () => {
    const facilityId = new Types.ObjectId().toHexString();
    const actorIdentity = identity({
      facilityId,
    });
    const policy = new RadiologyAccessPolicyService(
      new IdentityReader(actorIdentity),
    );
    const context = clinicalContext(
      facilityId,
      [actorIdentity.staffId as string],
    );

    await expect(
      policy.authorize({
        actor: {
          userId: actorIdentity.userId,
          facilityId,
          correlationId: 'correlation-id',
          roleKeys: ['CLINICAL_MANAGEMENT_DOCTOR'],
          permissionKeys: ['radiology.orders.create'],
        },
        action: 'ORDER_CREATE',
        clinicalContext: context,
      }),
    ).resolves.toMatchObject({
      allowed: true,
      accessMode: 'ASSIGNED_CLINICIAN',
    });

    await expect(
      policy.authorize({
        actor: {
          userId: actorIdentity.userId,
          facilityId,
          correlationId: 'correlation-id',
          roleKeys: ['CLINICAL_MANAGEMENT_DOCTOR'],
          permissionKeys: ['radiology.orders.create'],
        },
        action: 'ORDER_CREATE',
        clinicalContext: {
          ...context,
          facilityId: new Types.ObjectId().toHexString(),
        },
      }),
    ).resolves.toMatchObject({
      allowed: false,
      accessMode: 'DENIED',
      denialReason: 'The clinical encounter belongs to another facility',
    });

    await expect(
      policy.requireActiveActorStaffId({
        userId: actorIdentity.userId,
        facilityId,
      }),
    ).resolves.toBe(actorIdentity.staffId);
  });
});