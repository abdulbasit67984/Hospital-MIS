import {
  ConcurrencyConflictError,
  ConflictError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import type {
  MedicationAdministrationSafetyResult,
  MedicationOrderTrace,
  NursingMarCommand,
} from '../nursing-mar.contracts.js';

import type {
  MarMedicationAdministrationRecord,
  MarMedicationScheduleRecord,
} from '../nursing-mar.persistence.types.js';

import type {
  NursingMarRepositoryPort,
  NursingMedicationOrderRepositoryPort,
  NursingMedicationSafetyPolicyPort,
} from '../nursing-mar.ports.js';

import type {
  NursingAdmissionContext,
} from '../nursing-medication.contracts.js';

import {
  NursingMedicationCommandService,
} from './nursing-medication-command.service.js';

export class NursingMarCommandService {
  public constructor(
    public readonly support:
      NursingMedicationCommandService,

    public readonly repository:
      NursingMarRepositoryPort,

    public readonly orders:
      NursingMedicationOrderRepositoryPort,

    public readonly safety:
      NursingMedicationSafetyPolicyPort,
  ) {}

  public async requireSchedule(
    actor:
      NursingMarCommand<unknown>['actor'],

    scheduleId:
      string,
  ): Promise<MarMedicationScheduleRecord> {
    const schedule =
      await this.repository.findScheduleById(
        actor.facilityId,
        scheduleId,
      );

    if (
      schedule === null
    ) {
      throw new ResourceNotFoundError(
        'The medication schedule was not found',
      );
    }

    return schedule;
  }

  public async requireAdministration(
    actor:
      NursingMarCommand<unknown>['actor'],

    administrationId:
      string,
  ): Promise<MarMedicationAdministrationRecord> {
    const administration =
      await this.repository.findAdministrationById(
        actor.facilityId,
        administrationId,
      );

    if (
      administration ===
      null
    ) {
      throw new ResourceNotFoundError(
        'The medication administration record was not found',
      );
    }

    return administration;
  }

  public assertVersion(
    record: Readonly<{
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
        `${label} changed before the operation could be completed`,
      );
    }
  }

  public async resolveContextForSchedule(
    actor:
      NursingMarCommand<unknown>['actor'],

    schedule:
      MarMedicationScheduleRecord,
  ): Promise<NursingAdmissionContext> {
    const context =
      await this.support.resolveAdmission(
        actor,
        schedule.admissionId.toHexString(),
      );

    if (
      schedule.facilityId.toHexString() !==
        context.facilityId ||
      schedule.patientId.toHexString() !==
        context.patient.patientId ||
      schedule.encounterId.toHexString() !==
        context.encounterId
    ) {
      throw new ConflictError(
        'The medication schedule does not match the active admission context',
      );
    }

    return context;
  }

  public async orderTraceForSchedule(
    schedule:
      MarMedicationScheduleRecord,
  ): Promise<MedicationOrderTrace | null> {
    if (
      schedule.prescriptionId ===
        null ||
      schedule.prescriptionItemId ===
        null
    ) {
      return null;
    }

    return this.orders.findOrderTrace(
      schedule.facilityId.toHexString(),
      schedule.prescriptionId.toHexString(),
      schedule.prescriptionItemId.toHexString(),
    );
  }

  public async evaluateAdministrationSafety(
    context:
      NursingAdmissionContext,

    schedule:
      MarMedicationScheduleRecord,

    input: Readonly<{
      scheduledAt: Date;
      administeredAt: Date;
      administeredDose: string;
      administeredRoute:
        MarMedicationScheduleRecord['route'];
    }>,
  ): Promise<MedicationAdministrationSafetyResult> {
    const orderTrace =
      await this.orderTraceForSchedule(
        schedule,
      );

    const configuration =
      await this.safety.configuration(
        context.facilityId,
        context.location.wardId,
      );

    return this.safety.evaluate(
      configuration,
      {
        context,
        schedule,
        orderTrace,

        scheduledAt:
          input.scheduledAt,

        administeredAt:
          input.administeredAt,

        administeredDose:
          input.administeredDose,

        administeredRoute:
          input.administeredRoute,
      },
    );
  }

  public assertSafetyAllowed(
    safety:
      MedicationAdministrationSafetyResult,
  ): void {
    if (
      safety.allowed
    ) {
      return;
    }

    throw new ConflictError(
      safety.findings
        .filter(
          (item) =>
            item.severity ===
            'BLOCKING',
        )
        .map(
          (item) =>
            item.message,
        )
        .join('; ') ||
        'Medication administration safety validation failed',
    );
  }

  public scheduleEventPayload(
    schedule:
      MarMedicationScheduleRecord,
  ): Record<string, unknown> {
    return {
      medicationScheduleId:
        schedule._id.toHexString(),

      scheduleNumber:
        schedule.scheduleNumber,

      admissionId:
        schedule.admissionId.toHexString(),

      patientId:
        schedule.patientId.toHexString(),

      wardId:
        schedule.wardId.toHexString(),

      medicineId:
        schedule.medicineId.toHexString(),

      status:
        schedule.status,

      nextScheduledAt:
        schedule.nextScheduledAt
          ?.toISOString() ?? null,

      version:
        schedule.version,
    };
  }

  public administrationEventPayload(
    administration:
      MarMedicationAdministrationRecord,
  ): Record<string, unknown> {
    return {
      medicationAdministrationId:
        administration._id.toHexString(),

      medicationScheduleId:
        administration.medicationScheduleId.toHexString(),

      admissionId:
        administration.admissionId.toHexString(),

      patientId:
        administration.patientId.toHexString(),

      wardId:
        administration.wardId.toHexString(),

      medicineId:
        administration.medicineId.toHexString(),

      scheduledAt:
        administration.scheduledAt.toISOString(),

      status:
        administration.status,

      administeredAt:
        administration.administeredAt
          ?.toISOString() ?? null,

      administeringNurseStaffId:
        administration.administeringNurseStaffId
          ?.toHexString() ?? null,

      correctionOfAdministrationId:
        administration.correctionOfAdministrationId
          ?.toHexString() ?? null,

      version:
        administration.version,
    };
  }
}