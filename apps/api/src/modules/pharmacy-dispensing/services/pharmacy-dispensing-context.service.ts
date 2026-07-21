import {
  PharmacyActorInactiveError,
  PharmacyAdmissionNotFoundError,
  PharmacyContextMismatchError,
  PharmacyLocationNotFoundError,
  PharmacyPatientNotFoundError,
  PharmacyStaffAttributionError,
} from '../pharmacy-dispensing.errors.js';

import type {
  PharmacyDispensingActorContext,
  PharmacyOperationalContext,
} from '../pharmacy-dispensing.contracts.js';

import type {
  PharmacyDispensingContextPort,
  PharmacyDispensingContextRepositoryPort,
} from '../pharmacy-dispensing.ports.js';

import {
  PharmacyDispensingContextRepository,
} from '../repositories/pharmacy-dispensing-context.repository.js';

export class PharmacyDispensingContextService
implements PharmacyDispensingContextPort {
  public constructor(
    private readonly repository: PharmacyDispensingContextRepositoryPort =
      new PharmacyDispensingContextRepository(),
  ) {}

  public async requireActiveActorStaff(
    actor: Readonly<{ userId: string; facilityId: string }>,
  ): Promise<PharmacyOperationalContext['actor']> {
    const identity = await this.repository.findActorIdentity(actor.userId);

    if (identity === null || identity.status !== 'ACTIVE') {
      throw new PharmacyActorInactiveError();
    }

    if (
      identity.facilityId !== null &&
      identity.facilityId !== actor.facilityId
    ) {
      throw new PharmacyStaffAttributionError();
    }

    if (identity.staffId === null) {
      throw new PharmacyStaffAttributionError();
    }

    const staff = await this.repository.findStaff(
      actor.facilityId,
      identity.staffId,
    );

    if (
      staff === null ||
      !staff.isActive ||
      staff.employmentStatus !== 'ACTIVE'
    ) {
      throw new PharmacyStaffAttributionError();
    }

    return {
      userId: identity.userId,
      staffId: staff.staffId,
      facilityId: staff.facilityId,
      departmentId: staff.departmentId,
      displayName: staff.displayName,
      professionalType: staff.professionalType,
    };
  }

  public async resolveOperationalContext(
    actor: PharmacyDispensingActorContext,
    locationId: string,
    options: Readonly<{
      requireControlledMedicine?: boolean;
      admissionId?: string | null;
      wardId?: string | null;
      patientId?: string | null;
      encounterId?: string | null;
    }> = {},
  ): Promise<PharmacyOperationalContext> {
    const actorStaff = await this.requireActiveActorStaff(actor);
    const location = await this.repository.findLocation(
      actor.facilityId,
      locationId,
    );

    if (location === null) {
      throw new PharmacyLocationNotFoundError();
    }

    if (location.facilityId !== actor.facilityId) {
      throw new PharmacyContextMismatchError(
        'The selected pharmacy location belongs to another facility',
      );
    }

    if (location.status !== 'ACTIVE') {
      throw new PharmacyContextMismatchError(
        'The selected pharmacy location is inactive',
      );
    }

    if (!location.supportsDispensing) {
      throw new PharmacyContextMismatchError(
        'The selected inventory location is not configured for dispensing',
      );
    }

    if (
      options.requireControlledMedicine === true &&
      !location.allowsControlledMedicine
    ) {
      throw new PharmacyContextMismatchError(
        'The selected pharmacy location is not approved for controlled medicines',
      );
    }

    if (options.patientId !== undefined && options.patientId !== null) {
      const patient = await this.repository.findPatient(
        actor.facilityId,
        options.patientId,
      );

      if (patient === null) {
        throw new PharmacyPatientNotFoundError();
      }

      if (patient.status !== 'ACTIVE') {
        throw new PharmacyContextMismatchError(
          'The patient is not eligible for pharmacy operations',
        );
      }
    }

    if (options.encounterId !== undefined && options.encounterId !== null) {
      const encounter = await this.repository.findEncounter(
        actor.facilityId,
        options.encounterId,
      );

      if (encounter === null) {
        throw new PharmacyContextMismatchError(
          'The source encounter was not found in this facility',
        );
      }

      if (
        options.patientId !== undefined &&
        options.patientId !== null &&
        encounter.patientId !== options.patientId
      ) {
        throw new PharmacyContextMismatchError(
          'The encounter does not belong to the prescription patient',
        );
      }
    }

    if (options.admissionId !== undefined && options.admissionId !== null) {
      const admission = await this.repository.findAdmission(
        actor.facilityId,
        options.admissionId,
      );

      if (admission === null) {
        throw new PharmacyAdmissionNotFoundError();
      }

      if (admission.status === 'INACTIVE') {
        throw new PharmacyContextMismatchError(
          'The selected admission is not active',
        );
      }

      if (
        options.patientId !== undefined &&
        options.patientId !== null &&
        admission.patientId !== options.patientId
      ) {
        throw new PharmacyContextMismatchError(
          'The admission does not belong to the prescription patient',
        );
      }

      if (
        options.encounterId !== undefined &&
        options.encounterId !== null &&
        admission.encounterId !== options.encounterId
      ) {
        throw new PharmacyContextMismatchError(
          'The admission does not belong to the source encounter',
        );
      }

      if (
        options.wardId !== undefined &&
        options.wardId !== null &&
        admission.wardId !== options.wardId
      ) {
        throw new PharmacyContextMismatchError(
          'The requested ward does not match the active admission ward',
        );
      }
    }

    if (options.wardId !== undefined && options.wardId !== null) {
      const ward = await this.repository.findWard(
        actor.facilityId,
        options.wardId,
      );

      if (ward === null || ward.status !== 'ACTIVE') {
        throw new PharmacyContextMismatchError(
          'The selected ward is unavailable',
        );
      }

      if (
        location.wardId !== null &&
        location.wardId !== ward.wardId
      ) {
        throw new PharmacyContextMismatchError(
          'The selected pharmacy location is linked to another ward',
        );
      }
    }

    return {
      actor: actorStaff,
      location: {
        locationId: location.locationId,
        facilityId: location.facilityId,
        locationCode: location.locationCode,
        name: location.name,
        locationType: location.locationType,
        departmentId: location.departmentId,
        wardId: location.wardId,
        servicePointId: location.servicePointId,
        supportsDispensing: location.supportsDispensing,
        allowsControlledMedicine: location.allowsControlledMedicine,
        status: location.status,
      },
    };
  }
}