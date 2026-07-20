import type {
  MedicationDoseStatus,
  MedicationScheduleStatus,
} from '@hospital-mis/database';

import type {
  MedicationAdministrationListQuery,
  MedicationAdministrationSafetyConfiguration,
  MedicationAdministrationSafetyResult,
  MedicationComplianceSummary,
  MedicationOrderTrace,
  MedicationScheduleListQuery,
} from './nursing-mar.contracts.js';

import type {
  MarMedicationAdministrationAmendmentRecord,
  MarMedicationAdministrationRecord,
  MarMedicationScheduleRecord,
  MarScheduleDerivedState,
} from './nursing-mar.persistence.types.js';

import type {
  NursingAdmissionContext,
} from './nursing-medication.contracts.js';

export interface NursingMarRepositoryPort {
  createSchedule(
    input: Omit<
      MarMedicationScheduleRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<MarMedicationScheduleRecord>;

  findScheduleById(
    facilityId: string,
    scheduleId: string,
  ): Promise<MarMedicationScheduleRecord | null>;

  findActiveScheduleForPrescriptionItem(
    facilityId: string,
    admissionId: string,
    prescriptionItemId: string,
  ): Promise<MarMedicationScheduleRecord | null>;

  listSchedules(
    facilityId: string,
    query: MedicationScheduleListQuery,
  ): Promise<{
    items: MarMedicationScheduleRecord[];
    total: number;
  }>;

  updateSchedule(
    facilityId: string,
    scheduleId: string,
    expectedVersion: number,
    allowedStatuses: readonly MedicationScheduleStatus[],
    update: Record<string, unknown>,
  ): Promise<MarMedicationScheduleRecord | null>;

  createAdministration(
    input: Omit<
      MarMedicationAdministrationRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<MarMedicationAdministrationRecord>;

  findAdministrationById(
    facilityId: string,
    administrationId: string,
  ): Promise<MarMedicationAdministrationRecord | null>;

  findCurrentAdministrationForDose(
    facilityId: string,
    scheduleId: string,
    scheduledAt: Date,
  ): Promise<MarMedicationAdministrationRecord | null>;

  listAdministrations(
    facilityId: string,
    query: MedicationAdministrationListQuery,
  ): Promise<{
    items: MarMedicationAdministrationRecord[];
    total: number;
  }>;

  updateAdministrationSupersession(
    facilityId: string,
    administrationId: string,
    expectedVersion: number,
    replacementAdministrationId: string,
    actorUserId: string,
  ): Promise<MarMedicationAdministrationRecord | null>;

  createAdministrationAmendment(
    input: Omit<
      MarMedicationAdministrationAmendmentRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<MarMedicationAdministrationAmendmentRecord>;

  deriveScheduleState(
    facilityId: string,
    scheduleId: string,
    at: Date,
  ): Promise<MarScheduleDerivedState>;

  medicationCompliance(
    facilityId: string,
    admissionId: string,
    from: Date,
    to: Date,
  ): Promise<Omit<
    MedicationComplianceSummary,
    'admissionId' | 'from' | 'to' | 'compliancePercent'
  >>;
}

export interface NursingMedicationOrderRepositoryPort {
  findOrderTrace(
    facilityId: string,
    prescriptionId: string,
    prescriptionItemId: string,
  ): Promise<MedicationOrderTrace | null>;
}

export interface MedicationAdministrationSafetyRequest {
  context: NursingAdmissionContext;
  schedule: MarMedicationScheduleRecord;
  orderTrace: MedicationOrderTrace | null;
  scheduledAt: Date;
  administeredAt: Date;
  administeredDose: string;
  administeredRoute: MarMedicationScheduleRecord['route'];
}

export interface NursingMedicationSafetyPolicyPort {
  configuration(
    facilityId: string,
    wardId: string,
  ): Promise<MedicationAdministrationSafetyConfiguration>;

  evaluate(
    configuration: MedicationAdministrationSafetyConfiguration,
    request: MedicationAdministrationSafetyRequest,
  ): MedicationAdministrationSafetyResult;
}

export interface NursingMarStatusCount {
  status: MedicationDoseStatus;
  count: number;
}