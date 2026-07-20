import {
  activeEncounterStatusValues,
} from '@hospital-mis/database';

import {
  InpatientClinicalContextMismatchError,
  InpatientDepartmentUnavailableError,
  InpatientEncounterNotEligibleError,
  InpatientProviderNotAssignedError,
  InpatientServicePointMismatchError,
  InpatientStaffAttributionError,
} from '../inpatient.errors.js';

import type {
  InpatientCanonicalPatientPort,
  InpatientClockPort,
  InpatientContextPort,
} from '../inpatient.ports.js';

import type {
  InpatientActorContext,
  InpatientAdmissionContext,
  InpatientEncounterContext,
  InpatientPatientContext,
} from '../inpatient.types.js';

import {
  InpatientContextRepository,
} from '../repositories/inpatient-context.repository.js';

function calculateAgeYears(
  birthDate:
    Date,

  asOf:
    Date,
): number {
  let age =
    asOf.getUTCFullYear() -
    birthDate.getUTCFullYear();

  const monthDifference =
    asOf.getUTCMonth() -
    birthDate.getUTCMonth();

  if (
    monthDifference < 0 ||
    (
      monthDifference === 0 &&
      asOf.getUTCDate() <
        birthDate.getUTCDate()
    )
  ) {
    age -=
      1;
  }

  return Math.max(
    0,
    age,
  );
}

function mapSexAtBirth(
  value:
    | 'MALE'
    | 'FEMALE'
    | 'INTERSEX'
    | 'UNKNOWN',
): InpatientPatientContext[
  'sexAtBirth'
] {
  return value === 'INTERSEX'
    ? 'OTHER'
    : value;
}

function mismatch(
  message:
    string,
): never {
  throw new InpatientClinicalContextMismatchError(
    message,
  );
}

export class InpatientContextService
implements InpatientContextPort {
  public constructor(
    private readonly repository:
      InpatientContextRepository =
        new InpatientContextRepository(),

    private readonly canonicalPatients?:
      InpatientCanonicalPatientPort,

    private readonly clock:
      InpatientClockPort = {
        now:
          () =>
            new Date(),
      },
  ) {}

  public async resolvePatient(
    facilityId:
      string,

    patientId:
      string,
  ): Promise<
    InpatientPatientContext
  > {
    const resolution =
      this.canonicalPatients ===
      undefined
        ? {
            requestedPatientId:
              patientId,

            canonicalPatientId:
              patientId,

            redirected:
              false,
          }
        : await this
            .canonicalPatients
            .resolve(
              facilityId,
              patientId,
            );

    const patient =
      await this.repository.findPatient(
        facilityId,
        resolution
          .canonicalPatientId,
      );

    if (
      patient === null
    ) {
      mismatch(
        'The patient was not found in the active facility',
      );
    }

    if (
      patient.status ===
        'INACTIVE' ||
      patient.status ===
        'DECEASED' ||
      patient.status ===
        'MERGED'
    ) {
      mismatch(
        'The patient is not eligible for a new inpatient admission',
      );
    }

    const ageYears =
      patient.birthDateValue ===
      null
        ? patient
            .estimatedAgeYears
        : calculateAgeYears(
            patient
              .birthDateValue,

            this.clock.now(),
          );

    return {
      patientId:
        patient.id,

      requestedPatientId:
        resolution
          .requestedPatientId,

      canonicalRedirected:
        resolution.redirected,

      facilityId:
        patient.facilityId,

      status:
        patient.status,

      sexAtBirth:
        mapSexAtBirth(
          patient.sexAtBirth,
        ),

      ageYears,

      isMinor:
        patient.isMinor,
    };
  }

  public async resolveEncounter(
    facilityId:
      string,

    encounterId:
      string,
  ): Promise<
    InpatientEncounterContext
  > {
    const encounter =
      await this.repository.findEncounter(
        facilityId,
        encounterId,
      );

    if (
      encounter === null
    ) {
      mismatch(
        'The clinical encounter was not found in the active facility',
      );
    }

    if (
      !activeEncounterStatusValues.includes(
        encounter.status as
          (
            typeof activeEncounterStatusValues
          )[number],
      )
    ) {
      throw new InpatientEncounterNotEligibleError();
    }

    return {
      encounterId:
        encounter.id,

      facilityId:
        encounter.facilityId,

      patientId:
        encounter.patientId,

      requestedPatientId:
        encounter
          .requestedPatientId,

      canonicalRedirected:
        encounter
          .canonicalRedirected,

      confidentiality:
        encounter
          .confidentiality,

      status:
        encounter.status,

      registrationId:
        encounter.registrationId,

      opdVisitId:
        encounter.opdVisitId,

      queueTokenId:
        encounter.queueTokenId,

      departmentId:
        encounter.departmentId,

      clinicId:
        encounter.clinicId,

      servicePointId:
        encounter.servicePointId,

      primaryProviderStaffId:
        encounter
          .primaryProviderId,

      assignedProviderStaffIds:
        encounter
          .assignedProviderIds,
    };
  }

  public async resolveRecommendationContext(
    actor:
      InpatientActorContext,

    encounterId:
      string,

    orderingProviderStaffId:
      string,
  ): Promise<
    InpatientAdmissionContext
  > {
    const identity =
      await this.repository.findActorIdentity(
        actor.userId,
      );

    if (
      identity === null ||
      identity.status !==
        'ACTIVE' ||
      identity.staffId ===
        null ||
      (
        identity.facilityId !==
          null &&
        identity.facilityId !==
          actor.facilityId
      )
    ) {
      throw new InpatientStaffAttributionError();
    }

    if (
      identity.staffId !==
      orderingProviderStaffId
    ) {
      throw new InpatientStaffAttributionError();
    }

    const encounter =
      await this.resolveEncounter(
        actor.facilityId,
        encounterId,
      );

    if (
      !encounter
        .assignedProviderStaffIds
        .includes(
          orderingProviderStaffId,
        )
    ) {
      throw new InpatientProviderNotAssignedError();
    }

    const provider =
      await this.repository.findStaff(
        actor.facilityId,
        orderingProviderStaffId,
      );

    if (
      provider === null ||
      !provider.isActive ||
      !provider.isClinical ||
      provider
        .employmentStatus !==
        'ACTIVE'
    ) {
      throw new InpatientStaffAttributionError();
    }

    if (
      provider.departmentId !==
        null &&
      provider.departmentId !==
        encounter.departmentId
    ) {
      mismatch(
        'The recommending provider does not belong to the encounter department',
      );
    }

    const department =
      await this.repository.findDepartment(
        actor.facilityId,
        encounter.departmentId,
      );

    if (
      department === null ||
      department.status !==
        'ACTIVE' ||
      !department.isClinical
    ) {
      throw new InpatientDepartmentUnavailableError();
    }

    if (
      encounter.servicePointId !==
      null
    ) {
      const servicePoint =
        await this.repository.findServicePoint(
          actor.facilityId,
          encounter
            .servicePointId,
        );

      if (
        servicePoint === null ||
        servicePoint.status !==
          'ACTIVE' ||
        servicePoint.departmentId !==
          encounter.departmentId
      ) {
        throw new InpatientServicePointMismatchError();
      }
    }

    const resolvedPatient =
      await this.resolvePatient(
        actor.facilityId,
        encounter.patientId,
      );

    if (
      resolvedPatient.patientId !==
      encounter.patientId
    ) {
      mismatch(
        'The resolved patient does not match the clinical encounter',
      );
    }

    const patient:
      InpatientPatientContext = {
        ...resolvedPatient,

        requestedPatientId:
          encounter
            .requestedPatientId,

        canonicalRedirected:
          encounter
            .canonicalRedirected,
      };

    return {
      patient,

      encounter,

      orderingProviderStaffId,

      orderingProviderUserId:
        actor.userId,

      departmentId:
        encounter.departmentId,

      servicePointId:
        encounter.servicePointId,
    };
  }
}