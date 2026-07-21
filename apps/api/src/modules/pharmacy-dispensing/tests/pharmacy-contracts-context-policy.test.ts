import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  permissionKeys,
} from '@hospital-mis/permissions';

import {
  PharmacyContextMismatchError,
} from '../pharmacy-dispensing.errors.js';

import type {
  PharmacyDispensingContextRepositoryPort,
} from '../pharmacy-dispensing.ports.js';

import {
  completeDispensationBodySchema,
  createDispensationIntakeBodySchema,
  recordPharmacyCounsellingBodySchema,
} from '../pharmacy-dispensing.validation.js';

import {
  PharmacyDispensingAccessPolicyService,
} from '../services/pharmacy-dispensing-access-policy.service.js';

import {
  PharmacyDispensingContextService,
} from '../services/pharmacy-dispensing-context.service.js';

const facilityId = '64b64b64b64b64b64b64b641';
const userId = '64b64b64b64b64b64b64b642';
const staffId = '64b64b64b64b64b64b64b643';
const patientId = '64b64b64b64b64b64b64b644';
const otherPatientId = '64b64b64b64b64b64b64b645';
const locationId = '64b64b64b64b64b64b64b646';
const admissionId = '64b64b64b64b64b64b64b647';
const wardId = '64b64b64b64b64b64b64b648';
const encounterId = '64b64b64b64b64b64b64b649';

function repository(
  overrides: Partial<PharmacyDispensingContextRepositoryPort> = {},
): PharmacyDispensingContextRepositoryPort {
  return {
    async findActorIdentity() {
      return {
        userId,
        facilityId,
        staffId,
        status: 'ACTIVE',
      };
    },

    async findStaff() {
      return {
        staffId,
        facilityId,
        departmentId: null,
        displayName: 'Test Pharmacist',
        professionalType: 'PHARMACIST',
        employmentStatus: 'ACTIVE',
        isActive: true,
      };
    },

    async findPatient(_facilityId, requestedPatientId) {
      return {
        patientId: requestedPatientId,
        facilityId,
        status: 'ACTIVE',
        mrn: 'FAC-2026-000001',
        displayName: 'Test Patient',
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
        birthDatePrecision: 'DAY',
        estimatedAgeYears: null,
        sexAtBirth: 'FEMALE',
      };
    },

    async findEncounter() {
      return {
        encounterId,
        facilityId,
        patientId,
        departmentId: '64b64b64b64b64b64b64b650',
        servicePointId: null,
        providerId: '64b64b64b64b64b64b64b651',
        status: 'IN_PROGRESS',
      };
    },

    async findAdmission() {
      return {
        admissionId,
        facilityId,
        patientId,
        encounterId,
        wardId,
        status: 'ADMITTED',
      };
    },

    async findWard() {
      return {
        wardId,
        facilityId,
        departmentId: '64b64b64b64b64b64b64b650',
        name: 'Medical Ward',
        status: 'ACTIVE',
      };
    },

    async findLocation() {
      return {
        locationId,
        facilityId,
        locationCode: 'PHARM-01',
        name: 'Main Pharmacy',
        locationType: 'PHARMACY',
        departmentId: null,
        wardId: null,
        servicePointId: null,
        supportsDispensing: true,
        allowsControlledMedicine: true,
        allowsGeneralStock: true,
        status: 'ACTIVE',
      };
    },

    ...overrides,
  };
}

function actor(permissionKeys: readonly string[]) {
  return {
    userId,
    facilityId,
    correlationId: 'corr-pharmacy-test',
    roleKeys: [],
    permissionKeys,
  };
}

describe('pharmacy dispensing Batch 2 contracts and policy', () => {
  it('registers the granular pharmacy permission keys', () => {
    expect(permissionKeys).toEqual(
      expect.arrayContaining([
        'pharmacy.read',
        'pharmacy.verify',
        'pharmacy.controlled_dispense',
        'pharmacy.reversal',
        'pharmacy.price_override',
        'pharmacy.view_cost',
        'pharmacy.reports.read',
        'pharmacy.reports.export',
        'pharmacy.configuration.manage',
      ]),
    );
  });

  it('enforces inpatient context and unique atomic dispensing lines', () => {
    const inpatient = createDispensationIntakeBodySchema.safeParse({
      prescriptionId: '64b64b64b64b64b64b64b660',
      expectedPrescriptionVersion: 1,
      context: 'INPATIENT',
      pharmacyLocationId: locationId,
    });

    expect(inpatient.success).toBe(false);

    const duplicateItems = completeDispensationBodySchema.safeParse({
      expectedVersion: 1,
      items: [
        {
          dispensationItemId: '64b64b64b64b64b64b64b661',
          expectedVersion: 0,
          quantity: '1',
          quantityUnitId: '64b64b64b64b64b64b64b662',
          allocations: [
            {
              allocationId: '64b64b64b64b64b64b64b663',
              stockQuantity: '1',
            },
          ],
        },
        {
          dispensationItemId: '64b64b64b64b64b64b64b661',
          expectedVersion: 0,
          quantity: '1',
          quantityUnitId: '64b64b64b64b64b64b64b662',
          allocations: [
            {
              allocationId: '64b64b64b64b64b64b64b664',
              stockQuantity: '1',
            },
          ],
        },
      ],
    });

    expect(duplicateItems.success).toBe(false);
  });

  it('requires complete counselling attribution', () => {
    const invalid = recordPharmacyCounsellingBodySchema.safeParse({
      status: 'COMPLETED',
      topics: [],
      languageCode: 'en-PK',
      acknowledgementMethod: null,
    });

    expect(invalid.success).toBe(false);
  });

  it('authorizes active pharmacy staff by permission and location', async () => {
    const service = new PharmacyDispensingAccessPolicyService(repository());
    const location = await repository().findLocation(facilityId, locationId);

    expect(location).not.toBeNull();

    const decision = await service.authorize({
      actor: actor(['pharmacy.verify']),
      action: 'VERIFY',
      location: location!,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.accessMode).toBe('PHARMACY_OPERATIONAL');
    expect(decision.includeCost).toBe(false);
  });

  it('blocks controlled dispensing without explicit controlled permission', async () => {
    const service = new PharmacyDispensingAccessPolicyService(repository());
    const location = await repository().findLocation(facilityId, locationId);

    const decision = await service.authorize({
      actor: actor(['pharmacy.dispense']),
      action: 'DISPENSE',
      location: location!,
      dispensation: {
        facilityId: {
          toHexString: () => facilityId,
        },
        controlledMedicine: true,
      } as never,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.denialReason).toContain('controlled_dispense');
  });

  it('resolves matching inpatient context and rejects a patient mismatch', async () => {
    const service = new PharmacyDispensingContextService(repository());

    await expect(
      service.resolveOperationalContext(
        actor(['pharmacy.dispense']),
        locationId,
        {
          patientId,
          encounterId,
          admissionId,
          wardId,
          requireControlledMedicine: true,
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        actor: expect.objectContaining({ staffId }),
        location: expect.objectContaining({ locationId }),
      }),
    );

    await expect(
      service.resolveOperationalContext(
        actor(['pharmacy.dispense']),
        locationId,
        {
          patientId: otherPatientId,
          admissionId,
        },
      ),
    ).rejects.toBeInstanceOf(PharmacyContextMismatchError);
  });
});