import type {
  IntakeOutputEntryStatus,
  NursingDeviceStatus,
  NursingTaskPriority,
  WardHandoverStatus,
} from '@hospital-mis/database';

import type {
  NursingAdmissionContext,
  NursingMedicationActorContext,
} from './nursing-medication.contracts.js';

import type {
  IntakeOutputEntryRecord,
  NursingDeviceObservationRecord,
  NursingDeviceRecord,
} from './nursing-medication.persistence.types.js';

import type {
  CorrectNursingVitalObservationInput,
  EnterNursingVitalObservationInErrorInput,
  NursingDeteriorationEvaluation,
  NursingObservationThresholdConfiguration,
  NursingVitalMeasurementInput,
  NursingVitalMutationResult,
  NursingVitalTrendQuery,
  WardHandoverListQuery,
} from './nursing-observation.contracts.js';

export interface NursingVitalSignIntegrationPort {
  record(
    input: Readonly<{
      actor: NursingMedicationActorContext;
      idempotencyKey: string;
      measurement: NursingVitalMeasurementInput;
    }>,
  ): Promise<NursingVitalMutationResult>;

  correct(
    input: Readonly<{
      actor: NursingMedicationActorContext;
      idempotencyKey: string;
      vitalSignId: string;
      measurement: CorrectNursingVitalObservationInput;
    }>,
  ): Promise<NursingVitalMutationResult>;

  enterInError(
    input: Readonly<{
      actor: NursingMedicationActorContext;
      idempotencyKey: string;
      vitalSignId: string;
      change: EnterNursingVitalObservationInErrorInput;
    }>,
  ): Promise<NursingVitalMutationResult>;
}

export interface NursingVitalSignQueryPort {
  list(
    facilityId: string,
    query: NursingVitalTrendQuery,
  ): Promise<{
    items: NursingVitalMutationResult[];
    total: number;
  }>;
}

export interface NursingObservationThresholdPolicyPort {
  resolve(
    facilityId: string,
    wardId: string,
  ): Promise<NursingObservationThresholdConfiguration>;

  evaluate(
    configuration: NursingObservationThresholdConfiguration,
    vitalSign: NursingVitalMutationResult,
  ): NursingDeteriorationEvaluation;
}

export interface NursingDeteriorationTaskPort {
  create(
    input: Readonly<{
      actor: NursingMedicationActorContext;
      context: NursingAdmissionContext;
      idempotencyKey: string;
      vitalSignId: string;
      evaluation: NursingDeteriorationEvaluation;
      dueAt: Date;
      priority: NursingTaskPriority;
    }>,
  ): Promise<string>;
}

export interface NursingWardHandoverRecord {
  _id: {
    toHexString(): string;
  };

  facilityId: {
    toHexString(): string;
  };

  admissionId: {
    toHexString(): string;
  };

  patientId: {
    toHexString(): string;
  };

  encounterId: {
    toHexString(): string;
  };

  wardId: {
    toHexString(): string;
  };

  roomId: {
    toHexString(): string;
  } | null;

  bedId: {
    toHexString(): string;
  } | null;

  handoverNumber: string;
  handoverType: string;
  shiftCode: string;
  summary: string;
  activeConcerns: string[];
  pendingTasks: string[];
  medicationConcerns: string[];
  safetyConcerns: string[];

  fromNurseUserId: {
    toHexString(): string;
  };

  fromNurseStaffId: {
    toHexString(): string;
  };

  toNurseUserId: {
    toHexString(): string;
  };

  toNurseStaffId: {
    toHexString(): string;
  };

  handedOverAt: Date;
  status: WardHandoverStatus;
  signedAt: Date | null;
  acknowledgedAt: Date | null;

  acknowledgedByUserId: {
    toHexString(): string;
  } | null;

  acknowledgedByStaffId: {
    toHexString(): string;
  } | null;

  supersedesWardHandoverId: {
    toHexString(): string;
  } | null;

  supersededByWardHandoverId: {
    toHexString(): string;
  } | null;

  version: number;
  transactionId: string;
  correlationId: string;
  schemaVersion: number;

  createdBy: {
    toHexString(): string;
  };

  updatedBy: {
    toHexString(): string;
  };

  createdAt: Date;
  updatedAt: Date;
}

export interface CreateNursingWardHandoverRecordInput {
  facilityId: string;
  admissionId: string;
  patientId: string;
  encounterId: string;
  wardId: string;
  roomId: string | null;
  bedId: string | null;
  handoverNumber: string;
  handoverType: string;
  shiftCode: string;
  summary: string;
  activeConcerns: readonly string[];
  pendingTasks: readonly string[];
  medicationConcerns: readonly string[];
  safetyConcerns: readonly string[];
  fromNurseUserId: string;
  fromNurseStaffId: string;
  toNurseUserId: string;
  toNurseStaffId: string;
  handedOverAt: Date;
  status: WardHandoverStatus;
  signedAt: Date | null;
  supersedesWardHandoverId: string | null;
  transactionId: string;
  correlationId: string;
  actorUserId: string;
}

export interface NursingHandoverRepositoryPort {
  findById(
    facilityId: string,
    handoverId: string,
  ): Promise<NursingWardHandoverRecord | null>;

  list(
    facilityId: string,
    query: WardHandoverListQuery,
  ): Promise<{
    items: NursingWardHandoverRecord[];
    total: number;
  }>;

  createReplacement(
    input: CreateNursingWardHandoverRecordInput,
  ): Promise<NursingWardHandoverRecord>;

  updateStatus(
    input: Readonly<{
      facilityId: string;
      handoverId: string;
      expectedVersion: number;
      allowedStatuses: readonly WardHandoverStatus[];
      status: WardHandoverStatus;
      supersededByWardHandoverId?: string | null;
      actorUserId: string;
    }>,
  ): Promise<NursingWardHandoverRecord | null>;

  createAmendment(
    input: Readonly<{
      facilityId: string;
      admissionId: string;
      patientId: string;
      handoverId: string;
      amendmentSequence: number;

      amendmentType:
        | 'CORRECTION'
        | 'ENTERED_IN_ERROR';

      previousSnapshotHash: string;
      replacementHandoverId: string | null;
      reason: string;
      occurredAt: Date;
      actorUserId: string;
      actorStaffId: string;
      transactionId: string;
      correlationId: string;
    }>,
  ): Promise<string>;
}

export interface NursingObservationRepositoryPort {
  createIntakeOutput(
    input: Omit<
      IntakeOutputEntryRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<IntakeOutputEntryRecord>;

  findIntakeOutputById(
    facilityId: string,
    entryId: string,
  ): Promise<IntakeOutputEntryRecord | null>;

  updateIntakeOutput(
    facilityId: string,
    entryId: string,
    expectedVersion: number,
    allowedStatuses: readonly IntakeOutputEntryStatus[],
    update: Record<string, unknown>,
  ): Promise<IntakeOutputEntryRecord | null>;

  calculateFluidBalance(
    facilityId: string,
    admissionId: string,
    from: Date,
    to: Date,
  ): Promise<{
    intakeMillilitres: string;
    outputMillilitres: string;
    balanceMillilitres: string;
  }>;

  createDevice(
    input: Omit<
      NursingDeviceRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<NursingDeviceRecord>;

  findDeviceById(
    facilityId: string,
    deviceId: string,
  ): Promise<NursingDeviceRecord | null>;

  updateDevice(
    facilityId: string,
    deviceId: string,
    expectedVersion: number,
    allowedStatuses: readonly NursingDeviceStatus[],
    update: Record<string, unknown>,
  ): Promise<NursingDeviceRecord | null>;

  createDeviceObservation(
    input: Omit<
      NursingDeviceObservationRecord,
      '_id' | 'createdAt'
    >,
  ): Promise<NursingDeviceObservationRecord>;
}