import {
  ConcurrencyConflictError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import type {
  NursingAdmissionContext,
  NursingMedicationActorContext,
} from '../nursing-medication.contracts.js';

import type {
  IntakeOutputEntryRecord,
  NursingDeviceRecord,
} from '../nursing-medication.persistence.types.js';

import type {
  NursingDeteriorationTaskPort,
  NursingHandoverRepositoryPort,
  NursingObservationRepositoryPort,
  NursingObservationThresholdPolicyPort,
  NursingVitalSignIntegrationPort,
  NursingVitalSignQueryPort,
  NursingWardHandoverRecord,
} from '../nursing-observation.ports.js';

import {
  NursingMedicationCommandService,
} from './nursing-medication-command.service.js';

export class NursingObservationCommandService {
  public constructor(
    public readonly support:
      NursingMedicationCommandService,

    public readonly observations:
      NursingObservationRepositoryPort,

    public readonly handovers:
      NursingHandoverRepositoryPort,

    public readonly vitalCommands:
      NursingVitalSignIntegrationPort,

    public readonly vitalQueries:
      NursingVitalSignQueryPort,

    public readonly thresholds:
      NursingObservationThresholdPolicyPort,

    public readonly escalationTasks:
      NursingDeteriorationTaskPort,
  ) {}

  public async resolveAdmission(
    actor:
      NursingMedicationActorContext,

    admissionId:
      string,
  ): Promise<NursingAdmissionContext> {
    return this.support.resolveAdmission(
      actor,
      admissionId,
    );
  }

  public async requireIntakeOutput(
    actor:
      NursingMedicationActorContext,

    entryId:
      string,
  ): Promise<IntakeOutputEntryRecord> {
    const record =
      await this.observations
        .findIntakeOutputById(
          actor.facilityId,
          entryId,
        );

    if (
      record === null
    ) {
      throw new ResourceNotFoundError(
        'The intake/output entry was not found',
      );
    }

    return record;
  }

  public async requireDevice(
    actor:
      NursingMedicationActorContext,

    deviceId:
      string,
  ): Promise<NursingDeviceRecord> {
    const record =
      await this.observations
        .findDeviceById(
          actor.facilityId,
          deviceId,
        );

    if (
      record === null
    ) {
      throw new ResourceNotFoundError(
        'The nursing device record was not found',
      );
    }

    return record;
  }

  public async requireHandover(
    actor:
      NursingMedicationActorContext,

    handoverId:
      string,
  ): Promise<NursingWardHandoverRecord> {
    const record =
      await this.handovers.findById(
        actor.facilityId,
        handoverId,
      );

    if (
      record === null
    ) {
      throw new ResourceNotFoundError(
        'The ward handover was not found',
      );
    }

    return record;
  }

  public assertVersion(
    record:
      Readonly<{
        version: number;
      }>,

    expectedVersion:
      number,

    label:
      string,
  ): void {
    if (
      record.version !==
      expectedVersion
    ) {
      throw new ConcurrencyConflictError(
        `${label} changed before the operation completed`,
      );
    }
  }

  public handoverProjection(
    record:
      NursingWardHandoverRecord,
  ) {
    return {
      id:
        record._id.toHexString(),

      handoverNumber:
        record.handoverNumber,

      admissionId:
        record.admissionId.toHexString(),

      patientId:
        record.patientId.toHexString(),

      wardId:
        record.wardId.toHexString(),

      handoverType:
        record.handoverType,

      shiftCode:
        record.shiftCode,

      summary:
        record.summary,

      activeConcerns:
        record.activeConcerns,

      pendingTasks:
        record.pendingTasks,

      medicationConcerns:
        record.medicationConcerns,

      safetyConcerns:
        record.safetyConcerns,

      fromNurseStaffId:
        record.fromNurseStaffId
          .toHexString(),

      toNurseStaffId:
        record.toNurseStaffId
          .toHexString(),

      handedOverAt:
        record.handedOverAt
          .toISOString(),

      status:
        record.status,

      supersedesWardHandoverId:
        record.supersedesWardHandoverId
          ?.toHexString() ?? null,

      supersededByWardHandoverId:
        record.supersededByWardHandoverId
          ?.toHexString() ?? null,

      version:
        record.version,
    };
  }
}