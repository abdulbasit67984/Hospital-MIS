import {
  Types,
} from 'mongoose';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  CanonicalPatientUnavailableError,
  RegistrationContextMismatchError,
} from '../registration-queue.errors.js';

import type {
  CanonicalPatientRegistrationResolution,
  OpdClinicRecord,
  QueueDefinitionRecord,
  ServiceCounterRecord,
  ServicePointRecord,
} from '../registration-queue.types.js';

import type {
  RegistrationQueueSequencePort,
} from '../registration-queue.ports.js';

import type {
  RegistrationDepartmentContextRecord,
  RegistrationFacilityContextRecord,
  RegistrationProviderContextRecord,
} from '../repositories/registration-context.repository.js';

import type {
  RegistrationContextReader,
} from '../services/registration-context.service.js';

import {
  RegistrationContextService,
} from '../services/registration-context.service.js';

import type {
  PatientCanonicalizationReader,
} from '../services/registration-patient-resolution.service.js';

import {
  RegistrationPatientResolutionService,
} from '../services/registration-patient-resolution.service.js';

import type {
  RegistrationQueueNumberingContextReader,
} from '../services/registration-queue-number.service.js';

import {
  RegistrationQueueNumberService,
} from '../services/registration-queue-number.service.js';

function objectId(
  value: string,
): Types.ObjectId {
  return new Types.ObjectId(
    value,
  );
}

class InMemorySequence
implements RegistrationQueueSequencePort {
  private readonly values =
    new Map<string, number>();

  public async next(
    facilityId: string,
    key: string,
  ): Promise<{
    key: string;
    value: number;
  }> {
    const scopedKey =
      `${facilityId}:${key}`;

    const value =
      (this.values.get(
        scopedKey,
      ) ?? 0) + 1;

    this.values.set(
      scopedKey,
      value,
    );

    return {
      key,
      value,
    };
  }
}

class NumberingContexts
implements RegistrationQueueNumberingContextReader {
  public async findFacility() {
    return {
      code:
        'KTH',

      status:
        'ACTIVE' as const,
    };
  }

  public async findQueueDefinition() {
    return {
      tokenPrefix:
        'A',

      status:
        'ACTIVE' as const,
    };
  }
}

class CanonicalizationReader
implements PatientCanonicalizationReader {
  public constructor(
    private readonly resolution:
      CanonicalPatientRegistrationResolution,
  ) {}

  public async resolve() {
    return this.resolution;
  }
}

interface ContextRecords {
  facility: RegistrationFacilityContextRecord;
  department: RegistrationDepartmentContextRecord;
  clinic: OpdClinicRecord;
  servicePoint: ServicePointRecord;
  provider: RegistrationProviderContextRecord;
  queueDefinition: QueueDefinitionRecord;
  counter: ServiceCounterRecord;
}

class ContextReader
implements RegistrationContextReader {
  public constructor(
    private readonly records:
      ContextRecords,
  ) {}

  public async findFacility() {
    return this.records.facility;
  }

  public async findDepartment() {
    return this.records.department;
  }

  public async findClinic() {
    return this.records.clinic;
  }

  public async findServicePoint() {
    return this.records.servicePoint;
  }

  public async findProvider() {
    return this.records.provider;
  }

  public async findQueueDefinition() {
    return this.records.queueDefinition;
  }

  public async findCounter() {
    return this.records.counter;
  }
}

function contextRecords(): ContextRecords {
  const facilityId =
    objectId(
      '507f1f77bcf86cd799439011',
    );

  const departmentId =
    objectId(
      '507f191e810c19729de860ea',
    );

  const clinicId =
    objectId(
      '507f191e810c19729de860eb',
    );

  const servicePointId =
    objectId(
      '507f191e810c19729de860ec',
    );

  const providerId =
    objectId(
      '507f191e810c19729de860ed',
    );

  const queueDefinitionId =
    objectId(
      '507f191e810c19729de860ee',
    );

  const counterId =
    objectId(
      '507f191e810c19729de860ef',
    );

  return {
    facility: {
      _id:
        facilityId,

      code:
        'KTH',

      name:
        'Khyber Teaching Hospital',

      timezone:
        'Asia/Karachi',

      status:
        'ACTIVE',

      allowsAuthentication:
        true,
    },

    department: {
      _id:
        departmentId,

      facilityId,

      code:
        'MED',

      name:
        'Medicine',

      isClinical:
        true,

      status:
        'ACTIVE',
    },

    clinic: {
      _id:
        clinicId,

      facilityId,

      departmentId,

      defaultProviderId:
        providerId,

      status:
        'ACTIVE',
    } as unknown as OpdClinicRecord,

    servicePoint: {
      _id:
        servicePointId,

      facilityId,

      departmentId,

      clinicId,

      defaultProviderId:
        providerId,

      allowsWalkIn:
        true,

      allowsAppointment:
        true,

      allowsReferral:
        true,

      allowsEmergency:
        false,

      status:
        'ACTIVE',
    } as unknown as ServicePointRecord,

    provider: {
      _id:
        providerId,

      facilityId,

      departmentId,

      employeeNumber:
        'DR-001',

      displayName:
        'Dr Fictional Provider',

      designation:
        'Consultant',

      professionalType:
        'DOCTOR',

      employmentStatus:
        'ACTIVE',

      isClinical:
        true,

      isActive:
        true,
    },

    queueDefinition: {
      _id:
        queueDefinitionId,

      facilityId,

      departmentId,

      clinicId,

      servicePointId,

      providerId:
        null,

      status:
        'ACTIVE',
    } as unknown as QueueDefinitionRecord,

    counter: {
      _id:
        counterId,

      facilityId,

      departmentId,

      clinicId,

      servicePointId,

      queueDefinitionIds: [
        queueDefinitionId,
      ],

      status:
        'ACTIVE',
    } as unknown as ServiceCounterRecord,
  };
}

describe(
  'registration and OPD queue domain infrastructure',
  () => {
    it(
      'allocates date-scoped registration, visit, and queue numbers',
      async () => {
        const service =
          new RegistrationQueueNumberService(
            new InMemorySequence(),
            new NumberingContexts(),
          );

        const registration =
          await service.allocateRegistrationNumber({
            facilityId:
              '507f1f77bcf86cd799439011',

            serviceDate:
              '2026-07-18',
          });

        const visit =
          await service.allocateVisitNumber({
            facilityId:
              '507f1f77bcf86cd799439011',

            serviceDate:
              '2026-07-18',
          });

        const token =
          await service.allocateQueueTokenNumber({
            facilityId:
              '507f1f77bcf86cd799439011',

            queueDefinitionId:
              '507f191e810c19729de860ee',

            serviceDate:
              '2026-07-18',
          });

        expect(
          registration.registrationNumber,
        ).toBe(
          'REG-KTH-20260718-000001',
        );

        expect(
          visit.visitNumber,
        ).toBe(
          'OPD-KTH-20260718-000001',
        );

        expect(
          token,
        ).toMatchObject({
          tokenNumber:
            1,

          tokenPrefix:
            'A',

          tokenLabel:
            'A1',
        });
      },
    );

    it(
      'resolves merged patients only when the canonical record is active',
      async () => {
        const active =
          new RegistrationPatientResolutionService(
            new CanonicalizationReader({
              requestedPatientId:
                '507f1f77bcf86cd799439011',

              canonicalPatientId:
                '507f191e810c19729de860ea',

              canonicalEnterprisePatientId:
                'EP-000001',

              canonicalStatus:
                'ACTIVE',

              redirected:
                true,

              redirectPath: [
                '507f1f77bcf86cd799439011',
                '507f191e810c19729de860ea',
              ],
            }),
          );

        await expect(
          active.resolve(
            '507f1f77bcf86cd799439012',
            '507f1f77bcf86cd799439011',
          ),
        ).resolves.toMatchObject({
          canonicalPatientId:
            '507f191e810c19729de860ea',

          redirected:
            true,
        });

        const inactive =
          new RegistrationPatientResolutionService(
            new CanonicalizationReader({
              requestedPatientId:
                '507f1f77bcf86cd799439011',

              canonicalPatientId:
                '507f191e810c19729de860ea',

              canonicalEnterprisePatientId:
                'EP-000001',

              canonicalStatus:
                'INACTIVE',

              redirected:
                true,

              redirectPath: [
                '507f1f77bcf86cd799439011',
                '507f191e810c19729de860ea',
              ],
            }),
          );

        await expect(
          inactive.resolve(
            '507f1f77bcf86cd799439012',
            '507f1f77bcf86cd799439011',
          ),
        ).rejects.toBeInstanceOf(
          CanonicalPatientUnavailableError,
        );
      },
    );

    it(
      'resolves a consistent registration and queue service context',
      async () => {
        const records =
          contextRecords();

        const service =
          new RegistrationContextService(
            new ContextReader(
              records,
            ),
          );

        const registrationContext =
          await service.resolveRegistrationContext(
            records.facility._id.toHexString(),
            {
              patientId:
                '507f1f77bcf86cd799439013',

              registrationMode:
                'RETURNING_PATIENT',

              registrationSource:
                'WALK_IN',

              visitType:
                'RETURNING_PATIENT',

              serviceDate:
                '2026-07-18',

              departmentId:
                records.department._id.toHexString(),

              clinicId:
                records.clinic._id.toHexString(),

              servicePointId:
                records.servicePoint._id.toHexString(),

              assignedCounterId:
                records.counter._id.toHexString(),
            },
          );

        const queueContext =
          await service.resolveQueueContext(
            records.facility._id.toHexString(),
            registrationContext,
            {
              queueDefinitionId:
                records.queueDefinition._id.toHexString(),
            },
          );

        expect(
          registrationContext.assignedProviderId,
        ).toBe(
          records.provider._id.toHexString(),
        );

        expect(
          queueContext.assignedCounterId,
        ).toBe(
          records.counter._id.toHexString(),
        );
      },
    );

    it(
      'rejects a registration source not supported by the service point',
      async () => {
        const records =
          contextRecords();

        const service =
          new RegistrationContextService(
            new ContextReader(
              records,
            ),
          );

        await expect(
          service.resolveRegistrationContext(
            records.facility._id.toHexString(),
            {
              patientId:
                '507f1f77bcf86cd799439013',

              registrationMode:
                'RETURNING_PATIENT',

              registrationSource:
                'EMERGENCY',

              visitType:
                'EMERGENCY',

              serviceDate:
                '2026-07-18',

              departmentId:
                records.department._id.toHexString(),

              clinicId:
                records.clinic._id.toHexString(),

              servicePointId:
                records.servicePoint._id.toHexString(),
            },
          ),
        ).rejects.toBeInstanceOf(
          RegistrationContextMismatchError,
        );
      },
    );
  },
);