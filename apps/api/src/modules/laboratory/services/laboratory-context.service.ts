import {
  activeEncounterStatusValues,
} from '@hospital-mis/database';

import type {
  LaboratoryClinicalContextPort,
} from '../laboratory.ports.js';

import type {
  LaboratoryClinicalContext,
} from '../laboratory.types.js';

import {
  LaboratoryClinicalContextMismatchError,
  LaboratoryEncounterNotActiveError,
  LaboratoryOrderingProviderNotAssignedError,
} from '../laboratory.errors.js';

import {
  ClinicalEmrContextRepository,
} from '../../clinical-emr/repositories/clinical-emr-context.repository.js';

import {
  LaboratoryContextRepository,
} from '../repositories/laboratory-context.repository.js';

function equalNullable(
  left: string | null,
  right: string | null,
): boolean {
  return left === right;
}

function mismatch(
  message: string,
): never {
  throw new LaboratoryClinicalContextMismatchError(message);
}

export class LaboratoryContextService
implements LaboratoryClinicalContextPort {
  public constructor(
    private readonly repository:
      LaboratoryContextRepository =
        new LaboratoryContextRepository(),

    private readonly clinicalContext:
      ClinicalEmrContextRepository =
        new ClinicalEmrContextRepository(),
  ) {}

  public async resolveActiveEncounter(
    facilityId: string,
    encounterId: string,
  ): Promise<LaboratoryClinicalContext> {
    const encounter =
      await this.repository.findEncounter(
        facilityId,
        encounterId,
      );

    if (encounter === null) {
      mismatch(
        'The clinical encounter was not found in the active facility',
      );
    }

    if (
      !activeEncounterStatusValues.includes(
        encounter.status as
          (typeof activeEncounterStatusValues)[number],
      )
    ) {
      throw new LaboratoryEncounterNotActiveError();
    }

    const department =
      await this.clinicalContext.findDepartment(
        facilityId,
        encounter.departmentId,
      );

    if (
      department === null ||
      department.status !== 'ACTIVE' ||
      !department.isClinical
    ) {
      mismatch(
        'The encounter department is not an active clinical department',
      );
    }

    const clinic =
      encounter.clinicId === null
        ? null
        : await this.clinicalContext.findClinic(
            facilityId,
            encounter.clinicId,
          );

    if (
      encounter.clinicId !== null &&
      clinic === null
    ) {
      mismatch(
        'The encounter clinic was not found in the active facility',
      );
    }

    if (clinic !== null) {
      if (clinic.status !== 'ACTIVE') {
        mismatch('The encounter clinic is inactive');
      }

      if (clinic.departmentId !== encounter.departmentId) {
        mismatch(
          'The encounter clinic does not belong to the encounter department',
        );
      }
    }

    const servicePoint =
      encounter.servicePointId === null
        ? null
        : await this.clinicalContext.findServicePoint(
            facilityId,
            encounter.servicePointId,
          );

    if (
      encounter.servicePointId !== null &&
      servicePoint === null
    ) {
      mismatch(
        'The encounter service point was not found in the active facility',
      );
    }

    if (servicePoint !== null) {
      if (servicePoint.status !== 'ACTIVE') {
        mismatch('The encounter service point is inactive');
      }

      if (servicePoint.departmentId !== encounter.departmentId) {
        mismatch(
          'The encounter service point does not belong to the encounter department',
        );
      }

      if (!equalNullable(servicePoint.clinicId, encounter.clinicId)) {
        mismatch(
          'The encounter service point does not belong to the encounter clinic',
        );
      }
    }

    const provider =
      await this.clinicalContext.findProvider(
        facilityId,
        encounter.primaryProviderId,
      );

    if (
      provider === null ||
      !provider.isActive ||
      !provider.isClinical ||
      provider.employmentStatus !== 'ACTIVE'
    ) {
      mismatch(
        'The encounter primary provider is not an active clinical staff member',
      );
    }

    if (
      provider.departmentId !== null &&
      provider.departmentId !== encounter.departmentId
    ) {
      mismatch(
        'The encounter primary provider does not belong to the encounter department',
      );
    }

    if (encounter.registrationId !== null) {
      const registration =
        await this.clinicalContext.findRegistration(
          facilityId,
          encounter.registrationId,
        );

      if (
        registration === null ||
        registration.status !== 'ACTIVE'
      ) {
        mismatch(
          'The encounter registration is unavailable or inactive',
        );
      }

      if (
        registration.patientId !== encounter.patientId ||
        registration.requestedPatientId !== encounter.requestedPatientId ||
        registration.departmentId !== encounter.departmentId ||
        !equalNullable(registration.clinicId, encounter.clinicId) ||
        !equalNullable(
          registration.servicePointId,
          encounter.servicePointId,
        )
      ) {
        mismatch(
          'The registration does not match the clinical encounter context',
        );
      }
    }

    if (encounter.opdVisitId !== null) {
      if (encounter.registrationId === null) {
        mismatch(
          'An OPD-linked encounter requires a registration',
        );
      }

      const visit =
        await this.clinicalContext.findOpdVisit(
          facilityId,
          encounter.opdVisitId,
        );

      if (visit === null) {
        mismatch(
          'The OPD visit was not found in the active facility',
        );
      }

      if (
        [
          'CANCELLED',
          'NO_SHOW',
          'CORRECTED',
        ].includes(visit.status)
      ) {
        mismatch(
          'The OPD visit is not eligible for Laboratory ordering',
        );
      }

      if (
        visit.registrationId !== encounter.registrationId ||
        visit.patientId !== encounter.patientId ||
        visit.requestedPatientId !== encounter.requestedPatientId ||
        visit.departmentId !== encounter.departmentId ||
        !equalNullable(visit.clinicId, encounter.clinicId) ||
        !equalNullable(visit.servicePointId, encounter.servicePointId)
      ) {
        mismatch(
          'The OPD visit does not match the clinical encounter context',
        );
      }
    }

    if (encounter.queueTokenId !== null) {
      if (
        encounter.registrationId === null ||
        encounter.opdVisitId === null
      ) {
        mismatch(
          'A queue-linked encounter requires registration and OPD visit linkage',
        );
      }

      const queueToken =
        await this.clinicalContext.findQueueToken(
          facilityId,
          encounter.queueTokenId,
        );

      if (queueToken === null) {
        mismatch(
          'The encounter queue token was not found in the active facility',
        );
      }

      if (
        queueToken.registrationId !== encounter.registrationId ||
        queueToken.opdVisitId !== encounter.opdVisitId ||
        queueToken.patientId !== encounter.patientId
      ) {
        mismatch(
          'The queue token does not match the clinical encounter context',
        );
      }
    }

    return {
      encounterId: encounter.id,
      facilityId: encounter.facilityId,
      patientId: encounter.patientId,
      requestedPatientId: encounter.requestedPatientId,
      canonicalRedirected: encounter.canonicalRedirected,
      confidentiality: encounter.confidentiality,
      registrationId: encounter.registrationId,
      opdVisitId: encounter.opdVisitId,
      queueTokenId: encounter.queueTokenId,
      departmentId: encounter.departmentId,
      clinicId: encounter.clinicId,
      servicePointId: encounter.servicePointId,
      orderingProviderId: encounter.primaryProviderId,
      assignedProviderIds: encounter.assignedProviderIds,
    };
  }

  public assertOrderingProviderAssigned(
    context: LaboratoryClinicalContext,
    orderingProviderId: string,
  ): void {
    if (!context.assignedProviderIds.includes(orderingProviderId)) {
      throw new LaboratoryOrderingProviderNotAssignedError();
    }
  }
}