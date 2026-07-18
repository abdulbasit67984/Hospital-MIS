import type {
  RegistrationSource,
} from '@hospital-mis/database';

import {
  InactiveRegistrationContextError,
  OpdClinicNotFoundError,
  QueueDefinitionNotFoundError,
  RegistrationContextMismatchError,
  RegistrationQueueFacilityBoundaryError,
  ServiceCounterNotFoundError,
  ServicePointNotFoundError,
} from '../registration-queue.errors.js';

import type {
  CreateQueueEntryInput,
  CreateRegistrationInput,
  OpdClinicRecord,
  QueueDefinitionRecord,
  ServiceCounterRecord,
  ServicePointRecord,
} from '../registration-queue.types.js';

import type {
  RegistrationDepartmentContextRecord,
  RegistrationFacilityContextRecord,
  RegistrationProviderContextRecord,
} from '../repositories/registration-context.repository.js';

import {
  RegistrationContextRepository,
} from '../repositories/registration-context.repository.js';

export interface RegistrationContextReader {
  findFacility(
    facilityId: string,
  ): Promise<RegistrationFacilityContextRecord | null>;

  findDepartment(
    facilityId: string,
    departmentId: string,
  ): Promise<RegistrationDepartmentContextRecord | null>;

  findClinic(
    facilityId: string,
    clinicId: string,
  ): Promise<OpdClinicRecord | null>;

  findServicePoint(
    facilityId: string,
    servicePointId: string,
  ): Promise<ServicePointRecord | null>;

  findProvider(
    facilityId: string,
    providerId: string,
  ): Promise<RegistrationProviderContextRecord | null>;

  findQueueDefinition(
    facilityId: string,
    queueDefinitionId: string,
  ): Promise<QueueDefinitionRecord | null>;

  findCounter(
    facilityId: string,
    counterId: string,
  ): Promise<ServiceCounterRecord | null>;
}

export interface ResolvedRegistrationContext {
  facility: RegistrationFacilityContextRecord;
  department: RegistrationDepartmentContextRecord;
  clinic: OpdClinicRecord | null;
  servicePoint: ServicePointRecord | null;
  provider: RegistrationProviderContextRecord | null;
  counter: ServiceCounterRecord | null;
  assignedProviderId: string | null;
  assignedCounterId: string | null;
}

export interface ResolvedQueueContext {
  queueDefinition: QueueDefinitionRecord;
  provider: RegistrationProviderContextRecord | null;
  counter: ServiceCounterRecord | null;
  assignedProviderId: string | null;
  assignedCounterId: string | null;
}

function objectIdEquals(
  value: { toHexString(): string } | null,
  expected: string | null,
): boolean {
  return (
    value?.toHexString() ??
    null
  ) === expected;
}

function assertServicePointSourceAllowed(
  servicePoint: ServicePointRecord,
  source: RegistrationSource,
): void {
  const allowed =
    source === 'WALK_IN'
      ? servicePoint.allowsWalkIn
      : source === 'APPOINTMENT'
        ? servicePoint.allowsAppointment
        : source === 'REFERRAL'
          ? servicePoint.allowsReferral
          : source === 'EMERGENCY'
            ? servicePoint.allowsEmergency
            : source === 'FOLLOW_UP'
              ? servicePoint.allowsWalkIn ||
                servicePoint.allowsAppointment
              : true;

  if (!allowed) {
    throw new RegistrationContextMismatchError(
      `The selected service point does not accept ${source.toLocaleLowerCase('en-US')} registrations`,
    );
  }
}

export class RegistrationContextService {
  public constructor(
    private readonly repository:
      RegistrationContextReader =
        new RegistrationContextRepository(),
  ) {}

  public async resolveRegistrationContext(
    facilityId: string,
    input: CreateRegistrationInput,
  ): Promise<ResolvedRegistrationContext> {
    const facility =
      await this.repository.findFacility(
        facilityId,
      );

    if (facility === null) {
      throw new RegistrationQueueFacilityBoundaryError();
    }

    if (facility.status !== 'ACTIVE') {
      throw new InactiveRegistrationContextError(
        'Facility',
      );
    }

    const department =
      await this.repository.findDepartment(
        facilityId,
        input.departmentId,
      );

    if (department === null) {
      throw new RegistrationContextMismatchError(
        'The selected department was not found in the active facility',
      );
    }

    if (department.status !== 'ACTIVE') {
      throw new InactiveRegistrationContextError(
        'Department',
      );
    }

    if (!department.isClinical) {
      throw new RegistrationContextMismatchError(
        'OPD registration requires a clinical department',
      );
    }

    const clinic =
      input.clinicId == null
        ? null
        : await this.repository.findClinic(
            facilityId,
            input.clinicId,
          );

    if (
      input.clinicId != null &&
      clinic === null
    ) {
      throw new OpdClinicNotFoundError();
    }

    if (clinic !== null) {
      if (clinic.status !== 'ACTIVE') {
        throw new InactiveRegistrationContextError(
          'OPD clinic',
        );
      }

      if (
        clinic.departmentId.toHexString() !==
        input.departmentId
      ) {
        throw new RegistrationContextMismatchError(
          'The selected clinic does not belong to the selected department',
        );
      }
    }

    const servicePoint =
      input.servicePointId == null
        ? null
        : await this.repository.findServicePoint(
            facilityId,
            input.servicePointId,
          );

    if (
      input.servicePointId != null &&
      servicePoint === null
    ) {
      throw new ServicePointNotFoundError();
    }

    if (servicePoint !== null) {
      if (servicePoint.status !== 'ACTIVE') {
        throw new InactiveRegistrationContextError(
          'Service point',
        );
      }

      if (
        servicePoint.departmentId.toHexString() !==
        input.departmentId
      ) {
        throw new RegistrationContextMismatchError(
          'The selected service point does not belong to the selected department',
        );
      }

      if (
        servicePoint.clinicId !== null &&
        !objectIdEquals(
          servicePoint.clinicId,
          input.clinicId ?? null,
        )
      ) {
        throw new RegistrationContextMismatchError(
          'The selected service point does not belong to the selected clinic context',
        );
      }

      assertServicePointSourceAllowed(
        servicePoint,
        input.registrationSource,
      );
    }

    const assignedProviderId =
      input.assignedProviderId ??
      servicePoint?.defaultProviderId
        ?.toHexString() ??
      clinic?.defaultProviderId
        ?.toHexString() ??
      null;

    const provider =
      assignedProviderId === null
        ? null
        : await this.repository.findProvider(
            facilityId,
            assignedProviderId,
          );

    if (
      assignedProviderId !== null &&
      provider === null
    ) {
      throw new RegistrationContextMismatchError(
        'The selected provider was not found in the active facility',
      );
    }

    if (provider !== null) {
      if (
        !provider.isActive ||
        provider.employmentStatus !== 'ACTIVE'
      ) {
        throw new InactiveRegistrationContextError(
          'Provider',
        );
      }

      if (!provider.isClinical) {
        throw new RegistrationContextMismatchError(
          'The selected provider is not registered as clinical staff',
        );
      }

      if (
        provider.departmentId !== null &&
        provider.departmentId.toHexString() !==
          input.departmentId
      ) {
        throw new RegistrationContextMismatchError(
          'The selected provider does not belong to the selected department',
        );
      }
    }

    const assignedCounterId =
      input.assignedCounterId ??
      null;

    const counter =
      assignedCounterId === null
        ? null
        : await this.repository.findCounter(
            facilityId,
            assignedCounterId,
          );

    if (
      assignedCounterId !== null &&
      counter === null
    ) {
      throw new ServiceCounterNotFoundError();
    }

    if (counter !== null) {
      this.assertCounterContext(
        counter,
        input.departmentId,
        input.clinicId ?? null,
        input.servicePointId ?? null,
      );
    }

    return {
      facility,
      department,
      clinic,
      servicePoint,
      provider,
      counter,
      assignedProviderId,
      assignedCounterId,
    };
  }

  public async resolveQueueContext(
    facilityId: string,
    registrationContext: ResolvedRegistrationContext,
    input: CreateQueueEntryInput,
  ): Promise<ResolvedQueueContext> {
    const queueDefinition =
      await this.repository.findQueueDefinition(
        facilityId,
        input.queueDefinitionId,
      );

    if (queueDefinition === null) {
      throw new QueueDefinitionNotFoundError();
    }

    if (queueDefinition.status !== 'ACTIVE') {
      throw new InactiveRegistrationContextError(
        'Queue definition',
      );
    }

    if (
      queueDefinition.departmentId.toHexString() !==
      registrationContext.department._id.toHexString()
    ) {
      throw new RegistrationContextMismatchError(
        'The selected queue does not belong to the registration department',
      );
    }

    if (
      queueDefinition.clinicId !== null &&
      !objectIdEquals(
        queueDefinition.clinicId,
        registrationContext.clinic?._id.toHexString() ??
          null,
      )
    ) {
      throw new RegistrationContextMismatchError(
        'The selected queue does not belong to the registration clinic context',
      );
    }

    if (
      queueDefinition.servicePointId !== null &&
      !objectIdEquals(
        queueDefinition.servicePointId,
        registrationContext.servicePoint?._id.toHexString() ??
          null,
      )
    ) {
      throw new RegistrationContextMismatchError(
        'The selected queue does not belong to the registration service-point context',
      );
    }

    const assignedProviderId =
      input.assignedProviderId ??
      queueDefinition.providerId
        ?.toHexString() ??
      registrationContext.assignedProviderId;

    if (
      queueDefinition.providerId !== null &&
      assignedProviderId !==
        queueDefinition.providerId.toHexString()
    ) {
      throw new RegistrationContextMismatchError(
        'The selected queue is restricted to another provider',
      );
    }

    const provider =
      assignedProviderId === null
        ? null
        : await this.repository.findProvider(
            facilityId,
            assignedProviderId,
          );

    if (
      assignedProviderId !== null &&
      provider === null
    ) {
      throw new RegistrationContextMismatchError(
        'The queue provider was not found in the active facility',
      );
    }

    if (provider !== null) {
      if (
        !provider.isActive ||
        provider.employmentStatus !== 'ACTIVE' ||
        !provider.isClinical
      ) {
        throw new InactiveRegistrationContextError(
          'Queue provider',
        );
      }

      if (
        provider.departmentId !== null &&
        provider.departmentId.toHexString() !==
          registrationContext.department._id.toHexString()
      ) {
        throw new RegistrationContextMismatchError(
          'The queue provider does not belong to the registration department',
        );
      }
    }

    const assignedCounterId =
      input.assignedCounterId ??
      registrationContext.assignedCounterId;

    const counter =
      assignedCounterId === null
        ? null
        : await this.repository.findCounter(
            facilityId,
            assignedCounterId,
          );

    if (
      assignedCounterId !== null &&
      counter === null
    ) {
      throw new ServiceCounterNotFoundError();
    }

    if (counter !== null) {
      this.assertCounterContext(
        counter,
        registrationContext.department._id.toHexString(),
        registrationContext.clinic?._id.toHexString() ??
          null,
        registrationContext.servicePoint?._id.toHexString() ??
          null,
      );

      if (
        !counter.queueDefinitionIds.some(
          (queueId) =>
            queueId.toHexString() ===
            input.queueDefinitionId,
        )
      ) {
        throw new RegistrationContextMismatchError(
          'The selected counter is not configured to serve the selected queue',
        );
      }
    }

    return {
      queueDefinition,
      provider,
      counter,
      assignedProviderId,
      assignedCounterId,
    };
  }

  private assertCounterContext(
    counter: ServiceCounterRecord,
    departmentId: string,
    clinicId: string | null,
    servicePointId: string | null,
  ): void {
    if (counter.status !== 'ACTIVE') {
      throw new InactiveRegistrationContextError(
        'Service counter',
      );
    }

    if (
      counter.departmentId.toHexString() !==
      departmentId
    ) {
      throw new RegistrationContextMismatchError(
        'The selected counter does not belong to the selected department',
      );
    }

    if (
      counter.clinicId !== null &&
      !objectIdEquals(
        counter.clinicId,
        clinicId,
      )
    ) {
      throw new RegistrationContextMismatchError(
        'The selected counter does not belong to the selected clinic context',
      );
    }

    if (
      counter.servicePointId !== null &&
      !objectIdEquals(
        counter.servicePointId,
        servicePointId,
      )
    ) {
      throw new RegistrationContextMismatchError(
        'The selected counter does not belong to the selected service-point context',
      );
    }
  }
}