import type {
  AllergySeverity,
  AllergyVerificationStatus,
} from '@hospital-mis/database';

import {
  NursingAdmissionNotFoundError,
  NursingClinicalContextMismatchError,
  NursingStaffAttributionError,
} from '../nursing-medication.errors.js';

import type {
  NursingAdmissionContext,
  NursingMedicationActorContext,
} from '../nursing-medication.contracts.js';

import type {
  NursingClockPort,
  NursingMedicationContextPort,
  NursingMedicationContextRepositoryPort,
} from '../nursing-medication.ports.js';

import {
  NursingMedicationContextRepository,
} from '../repositories/nursing-medication-context.repository.js';

export class NursingMedicationContextService
implements NursingMedicationContextPort {
  public constructor(
    private readonly repository:
      NursingMedicationContextRepositoryPort =
        new NursingMedicationContextRepository(),

    private readonly clock:
      NursingClockPort = {
        now: () => new Date(),
      },
  ) {}

  public async requireActiveActorStaffId(
    actor: Readonly<{
      userId: string;
      facilityId: string;
    }>,
  ): Promise<string> {
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
      throw new NursingStaffAttributionError();
    }

    const staff =
      await this.repository.findStaff(
        actor.facilityId,
        identity.staffId,
      );

    if (
      staff === null ||
      !staff.isActive ||
      !staff.isClinical ||
      staff.employmentStatus !==
        'ACTIVE'
    ) {
      throw new NursingStaffAttributionError();
    }

    return staff.staffId;
  }

  public async resolveAdmission(
    actor:
      NursingMedicationActorContext,

    admissionId: string,
  ): Promise<NursingAdmissionContext> {
    await this.requireActiveActorStaffId(
      actor,
    );

    const admission =
      await this.repository.findAdmission(
        actor.facilityId,
        admissionId,
      );

    if (
      admission === null
    ) {
      throw new NursingAdmissionNotFoundError();
    }

    if (
      admission.patientId.length ===
        0 ||
      admission.encounterId.length ===
        0
    ) {
      throw new NursingClinicalContextMismatchError(
        'The admission is missing its patient or encounter reference',
      );
    }

    const historicalLocation =
      admission.currentWardId ===
      null
        ? await this.repository.findLatestLocationAssignment(
            actor.facilityId,
            admission.admissionId,
          )
        : null;

    const wardId =
      admission.currentWardId ??
      historicalLocation
        ?.wardId ??
      null;

    const roomId =
      admission.currentRoomId ??
      historicalLocation
        ?.roomId ??
      null;

    const bedId =
      admission.currentBedId ??
      historicalLocation
        ?.bedId ??
      null;

    if (
      wardId === null
    ) {
      throw new NursingClinicalContextMismatchError(
        'Nursing documentation requires a current or historical ward assignment',
      );
    }

    const now =
      this.clock.now();

    const [
      patient,
      mrn,
      alerts,
      allergies,
      ward,
      room,
      bed,
    ] = await Promise.all([
      this.repository.findPatient(
        actor.facilityId,
        admission.patientId,
      ),

      this.repository.findPrimaryMrn(
        actor.facilityId,
        admission.patientId,
      ),

      this.repository.listActiveAlerts(
        actor.facilityId,
        admission.patientId,
        now,
      ),

      this.repository.listActiveAllergies(
        actor.facilityId,
        admission.patientId,
      ),

      this.repository.findWard(
        actor.facilityId,
        wardId,
      ),

      roomId === null
        ? Promise.resolve(
            null,
          )
        : this.repository.findRoom(
            actor.facilityId,
            roomId,
          ),

      bedId === null
        ? Promise.resolve(
            null,
          )
        : this.repository.findBed(
            actor.facilityId,
            bedId,
          ),
    ]);

    if (
      patient === null ||
      patient.facilityId !==
        actor.facilityId
    ) {
      throw new NursingClinicalContextMismatchError(
        'The admission patient was not found in the active facility',
      );
    }

    if (
      [
        'INACTIVE',
        'MERGED',
      ].includes(
        patient.status,
      )
    ) {
      throw new NursingClinicalContextMismatchError(
        'The admission references a patient who is not available for nursing documentation',
      );
    }

    if (
      ward === null ||
      ward.facilityId !==
        actor.facilityId
    ) {
      throw new NursingClinicalContextMismatchError(
        'The current ward is unavailable or belongs to another facility',
      );
    }

    if (
      room !== null &&
      (
        room.facilityId !==
          actor.facilityId ||
        room.wardId !==
          ward.wardId
      )
    ) {
      throw new NursingClinicalContextMismatchError(
        'The current room does not belong to the admission ward',
      );
    }

    if (
      bed !== null &&
      (
        bed.facilityId !==
          actor.facilityId ||
        bed.wardId !==
          ward.wardId ||
        (
          room !== null &&
          bed.roomId !==
            room.roomId
        ) ||
        (
          admission.isActive &&
          (
            bed.currentAdmissionId !==
              admission.admissionId ||
            bed.currentPatientId !==
              admission.patientId
          )
        )
      )
    ) {
      throw new NursingClinicalContextMismatchError(
        'The current bed does not match the active admission and patient',
      );
    }

    return {
      facilityId:
        admission.facilityId,

      admissionId:
        admission.admissionId,

      admissionNumber:
        admission.admissionNumber,

      admissionStatus:
        admission.status,

      isActive:
        admission.isActive,

      encounterId:
        admission.encounterId,

      admittedAt:
        admission.admittedAt
          ?.toISOString() ?? null,

      clinicallyDischargedAt:
        admission.clinicallyDischargedAt
          ?.toISOString() ?? null,

      dischargedAt:
        admission.dischargedAt
          ?.toISOString() ?? null,

      attendingConsultantUserId:
        admission.attendingConsultantUserId,

      attendingConsultantStaffId:
        admission.attendingConsultantStaffId,

      careTeam:
        admission.careTeam.map(
          (member) => ({
            staffId:
              member.staffId,

            userId:
              member.userId,

            role:
              member.role,

            startedAt:
              member.startedAt.toISOString(),

            endedAt:
              member.endedAt
                ?.toISOString() ?? null,
          }),
        ),

      patient: {
        patientId:
          patient.patientId,

        displayName:
          patient.displayName,

        mrn,

        birthDate:
          patient.birthDate
            ?.toISOString()
            .slice(
              0,
              10,
            ) ?? null,

        estimatedAgeYears:
          patient.estimatedAgeYears,

        sexAtBirth:
          patient.sexAtBirth,
      },

      location: {
        wardId:
          ward.wardId,

        wardCode:
          ward.wardCode,

        wardName:
          ward.name,

        wardType:
          ward.wardType,

        nursingStationCode:
          ward.nursingStationCode,

        departmentId:
          ward.departmentId,

        roomId:
          room?.roomId ?? null,

        roomNumber:
          room?.roomNumber ?? null,

        roomName:
          room?.name ?? null,

        bedId:
          bed?.bedId ?? null,

        bedNumber:
          bed?.bedNumber ?? null,

        bedLabel:
          bed?.label ?? null,

        bedCategory:
          bed?.bedCategory ?? null,
      },

      alerts:
        alerts.map(
          (alert) => ({
            alertId:
              alert.alertId,

            alertType:
              alert.alertType,

            severity:
              alert.severity,

            title:
              alert.title,

            details:
              alert.details,

            effectiveFrom:
              alert.effectiveFrom.toISOString(),

            effectiveTo:
              alert.effectiveTo
                ?.toISOString() ?? null,
          }),
        ),

      allergies:
        allergies.map(
          (allergy) => ({
            patientAllergyId:
              allergy.patientAllergyId,

            allergenText:
              allergy.allergenText,

            category:
              allergy.category,

            severity:
              allergy.severity as AllergySeverity,

            verificationStatus:
              allergy.verificationStatus as AllergyVerificationStatus,

            reactions:
              allergy.reactions,
          }),
        ),
    };
  }
}