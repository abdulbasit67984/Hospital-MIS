import type {
  EncounterLinkageSnapshot,
  ClinicalEmrEncounterContextPort,
} from '../clinical-emr.ports.js';

import {
  ClinicalEmrFacilityBoundaryError,
  ClinicalEncounterContextMismatchError,
} from '../clinical-emr.errors.js';

import type {
  ClinicalDepartmentContextRecord,
  ClinicalFacilityContextRecord,
  ClinicalOpdVisitContextRecord,
  ClinicalProviderContextRecord,
  ClinicalQueueContextRecord,
  ClinicalRegistrationContextRecord,
  ClinicalClinicContextRecord,
  ClinicalServicePointContextRecord,
} from '../repositories/clinical-emr-context.repository.js';

import {
  ClinicalEmrContextRepository,
} from '../repositories/clinical-emr-context.repository.js';

export interface ClinicalEmrContextReader {
  findFacility(
    facilityId: string,
  ): Promise<ClinicalFacilityContextRecord | null>;

  findDepartment(
    facilityId: string,
    departmentId: string,
  ): Promise<ClinicalDepartmentContextRecord | null>;

  findClinic(
    facilityId: string,
    clinicId: string,
  ): Promise<ClinicalClinicContextRecord | null>;

  findServicePoint(
    facilityId: string,
    servicePointId: string,
  ): Promise<ClinicalServicePointContextRecord | null>;

  findProvider(
    facilityId: string,
    providerId: string,
  ): Promise<ClinicalProviderContextRecord | null>;

  findRegistration(
    facilityId: string,
    registrationId: string,
  ): Promise<ClinicalRegistrationContextRecord | null>;

  findOpdVisit(
    facilityId: string,
    opdVisitId: string,
  ): Promise<ClinicalOpdVisitContextRecord | null>;

  findQueueToken(
    facilityId: string,
    queueTokenId: string,
  ): Promise<ClinicalQueueContextRecord | null>;
}

export interface ResolvedClinicalOpdContext {
  linkage: EncounterLinkageSnapshot;
  facility: ClinicalFacilityContextRecord;
  department: ClinicalDepartmentContextRecord;
  clinic: ClinicalClinicContextRecord | null;
  servicePoint: ClinicalServicePointContextRecord | null;
  provider: ClinicalProviderContextRecord;
  registration: ClinicalRegistrationContextRecord;
  visit: ClinicalOpdVisitContextRecord;
  queueToken: ClinicalQueueContextRecord | null;
}

const encounterEligibleVisitStatuses = new Set([
  'CHECKED_IN',
  'QUEUED',
  'IN_SERVICE',
]);

const encounterEligibleQueueStatuses = new Set([
  'WAITING',
  'CALLED',
  'SERVING',
  'SKIPPED',
]);

function equalNullable(
  left: string | null,
  right: string | null,
): boolean {
  return left === right;
}

function mismatch(
  message: string,
): never {
  throw new ClinicalEncounterContextMismatchError(message);
}

export class ClinicalEmrContextService
implements ClinicalEmrEncounterContextPort {
  public constructor(
    private readonly repository: ClinicalEmrContextReader =
      new ClinicalEmrContextRepository(),
  ) {}

  public async resolveFromOpdVisit(
    facilityId: string,
    opdVisitId: string,
  ): Promise<EncounterLinkageSnapshot> {
    const resolved = await this.resolveOpdContext(
      facilityId,
      opdVisitId,
    );

    return resolved.linkage;
  }

  public async resolveOpdContext(
    facilityId: string,
    opdVisitId: string,
  ): Promise<ResolvedClinicalOpdContext> {
    const facility = await this.repository.findFacility(facilityId);

    if (facility === null) {
      throw new ClinicalEmrFacilityBoundaryError();
    }

    if (facility.status !== 'ACTIVE') {
      mismatch('Clinical documentation requires an active facility');
    }

    const visit = await this.repository.findOpdVisit(
      facilityId,
      opdVisitId,
    );

    if (visit === null) {
      throw new ClinicalEmrFacilityBoundaryError();
    }

    if (!encounterEligibleVisitStatuses.has(visit.status)) {
      mismatch(
        `OPD visit status ${visit.status} cannot be used to open a clinical encounter`,
      );
    }

    const registration = await this.repository.findRegistration(
      facilityId,
      visit.registrationId,
    );

    if (registration === null) {
      mismatch('The OPD visit registration could not be resolved');
    }

    if (registration.status !== 'ACTIVE') {
      mismatch('The OPD visit registration is not active');
    }

    if (
      registration.patientId !== visit.patientId ||
      registration.requestedPatientId !== visit.requestedPatientId ||
      registration.serviceDate !== visit.serviceDate ||
      registration.departmentId !== visit.departmentId ||
      !equalNullable(registration.clinicId, visit.clinicId) ||
      !equalNullable(registration.servicePointId, visit.servicePointId)
    ) {
      mismatch(
        'The OPD visit does not match its patient, registration, date, department, clinic, or service-point context',
      );
    }

    const department = await this.repository.findDepartment(
      facilityId,
      visit.departmentId,
    );

    if (department === null) {
      mismatch('The OPD department was not found in the active facility');
    }

    if (department.status !== 'ACTIVE' || !department.isClinical) {
      mismatch('Clinical encounters require an active clinical department');
    }

    const clinic =
      visit.clinicId === null
        ? null
        : await this.repository.findClinic(facilityId, visit.clinicId);

    if (visit.clinicId !== null && clinic === null) {
      mismatch('The OPD clinic was not found in the active facility');
    }

    if (clinic !== null) {
      if (clinic.status !== 'ACTIVE') {
        mismatch('The OPD clinic is inactive');
      }

      if (clinic.departmentId !== visit.departmentId) {
        mismatch('The OPD clinic does not belong to the visit department');
      }
    }

    const servicePoint =
      visit.servicePointId === null
        ? null
        : await this.repository.findServicePoint(
            facilityId,
            visit.servicePointId,
          );

    if (visit.servicePointId !== null && servicePoint === null) {
      mismatch('The OPD service point was not found in the active facility');
    }

    if (servicePoint !== null) {
      if (servicePoint.status !== 'ACTIVE') {
        mismatch('The OPD service point is inactive');
      }

      if (servicePoint.departmentId !== visit.departmentId) {
        mismatch('The OPD service point does not belong to the visit department');
      }

      if (!equalNullable(servicePoint.clinicId, visit.clinicId)) {
        mismatch('The OPD service point does not belong to the visit clinic context');
      }

      if (
        ![
          'TRIAGE',
          'CLINIC',
          'CONSULTATION_ROOM',
          'PROCEDURE_ROOM',
          'EMERGENCY',
          'OTHER',
        ].includes(servicePoint.servicePointType)
      ) {
        mismatch('The selected service point cannot own clinical documentation');
      }
    }

    const assignedProviderId =
      visit.assignedProviderId ??
      servicePoint?.defaultProviderId ??
      clinic?.defaultProviderId ??
      registration.assignedProviderId;

    if (assignedProviderId === null) {
      mismatch('The OPD visit does not have a clinical provider assignment');
    }

    const provider = await this.repository.findProvider(
      facilityId,
      assignedProviderId,
    );

    if (provider === null) {
      mismatch('The assigned provider was not found in the active facility');
    }

    if (
      !provider.isClinical ||
      !provider.isActive ||
      provider.employmentStatus !== 'ACTIVE'
    ) {
      mismatch('The assigned provider is not an active clinical staff member');
    }

    if (
      provider.departmentId !== null &&
      provider.departmentId !== visit.departmentId
    ) {
      mismatch('The assigned provider does not belong to the visit department');
    }

    const queueToken =
      visit.currentQueueTokenId === null
        ? null
        : await this.repository.findQueueToken(
            facilityId,
            visit.currentQueueTokenId,
          );

    if (visit.currentQueueTokenId !== null && queueToken === null) {
      mismatch('The visit queue token could not be resolved');
    }

    if (queueToken !== null) {
      if (
        queueToken.opdVisitId !== visit.id ||
        queueToken.registrationId !== registration.id ||
        queueToken.patientId !== visit.patientId ||
        queueToken.serviceDate !== visit.serviceDate
      ) {
        mismatch('The queue token does not belong to the OPD visit context');
      }

      if (!encounterEligibleQueueStatuses.has(queueToken.status)) {
        mismatch(
          `Queue status ${queueToken.status} cannot be used to open a clinical encounter`,
        );
      }

      if (
        queueToken.assignedProviderId !== null &&
        queueToken.assignedProviderId !== assignedProviderId
      ) {
        mismatch('The queue token provider does not match the OPD visit provider');
      }

      if (
        visit.assignedCounterId !== null &&
        queueToken.assignedCounterId !== null &&
        visit.assignedCounterId !== queueToken.assignedCounterId
      ) {
        mismatch('The queue token counter does not match the OPD visit counter');
      }
    }

    return {
      linkage: {
        facilityId,
        patientId: visit.patientId,
        registrationId: registration.id,
        opdVisitId: visit.id,
        queueTokenId: queueToken?.id ?? null,
        departmentId: visit.departmentId,
        clinicId: visit.clinicId,
        servicePointId: visit.servicePointId,
        assignedProviderId,
        visitStatus: visit.status,
        queueStatus: queueToken?.status ?? null,
      },
      facility,
      department,
      clinic,
      servicePoint,
      provider,
      registration,
      visit,
      queueToken,
    };
  }
}