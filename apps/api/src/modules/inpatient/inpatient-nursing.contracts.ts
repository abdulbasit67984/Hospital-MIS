import type {
  Types,
} from 'mongoose';

import type {
  MedicationAdministrationRoute,
  MedicationAdministrationSource,
  MedicationDoseStatus,
  MedicationScheduleStatus,
  NursingAmendmentType,
  NursingEntryStatus,
  NursingIntakeOutputDirection,
  NursingIntakeOutputRoute,
  NursingNoteType,
  NursingObservationSeverity,
  WardHandoverStatus,
  WardHandoverType,
} from '@hospital-mis/database';

import type {
  InpatientActorContext,
} from './inpatient.types.js';

export interface RecordNursingVitalSignInput {
  admissionId:
    string;

  measuredAt:
    string;

  bodyPosition?:
    'SITTING' |
    'SUPINE' |
    'STANDING' |
    'PRONE' |
    'LATERAL' |
    'UNSPECIFIED';

  temperatureCelsius?:
    string | null;

  temperatureSite?:
    'ORAL' |
    'AXILLARY' |
    'TYMPANIC' |
    'RECTAL' |
    'TEMPORAL' |
    'OTHER' |
    'UNSPECIFIED';

  pulsePerMinute?:
    number | null;

  respiratoryRatePerMinute?:
    number | null;

  systolicBloodPressureMmHg?:
    number | null;

  diastolicBloodPressureMmHg?:
    number | null;

  oxygenSaturationPercent?:
    string | null;

  bloodGlucoseMgDl?:
    string | null;

  painScore?:
    number | null;

  weightKg?:
    string | null;

  oxygenDeliveryMethod?:
    string | null;

  oxygenFlowLitresPerMinute?:
    string | null;

  notes?:
    string | null;
}

export interface CreateNursingNoteInput {
  admissionId:
    string;

  noteType:
    NursingNoteType;

  observationSeverity:
    NursingObservationSeverity;

  title:
    string;

  content:
    string;

  recordedAt?:
    string | null;

  intakeOutput?:
    {
      direction:
        NursingIntakeOutputDirection;

      route:
        NursingIntakeOutputRoute;

      amountMillilitres:
        string;

      description?:
        string | null;
    } | null;

  requiresEscalation?:
    boolean;

  escalationRecipientStaffId?:
    string | null;
}

export interface CorrectNursingNoteInput {
  expectedVersion:
    number;

  reason:
    string;

  replacement:
    Omit<
      CreateNursingNoteInput,
      'admissionId'
    >;
}

export interface CreateMedicationScheduleInput {
  admissionId:
    string;

  prescriptionId?:
    string | null;

  prescriptionItemId?:
    string | null;

  source:
    MedicationAdministrationSource;

  medicineId:
    string;

  formularyItemId?:
    string | null;

  medicineDisplay:
    string;

  prescribedDose:
    string;

  doseUnitCode:
    string;

  route:
    MedicationAdministrationRoute;

  frequencyCode:
    string;

  scheduledTimes:
    readonly string[];

  prn?:
    boolean;

  prnIndication?:
    string | null;

  startAt:
    string;

  endAt?:
    string | null;

  orderedByUserId:
    string;

  orderedByStaffId:
    string;
}

export interface RecordMedicationDoseInput {
  expectedScheduleVersion:
    number;

  scheduledAt:
    string;

  status:
    Extract<
      MedicationDoseStatus,
      | 'ADMINISTERED'
      | 'OMITTED'
      | 'REFUSED'
      | 'DELAYED'
      | 'CANCELLED'
    >;

  administeredDose?:
    string | null;

  administeredRoute?:
    MedicationAdministrationRoute |
    null;

  administeredAt?:
    string | null;

  reasonCode?:
    string | null;

  reason?:
    string | null;

  notes?:
    string | null;

  delayedUntil?:
    string | null;
}

export interface CorrectMedicationAdministrationInput {
  expectedAdministrationVersion:
    number;

  reason:
    string;

  replacement:
    RecordMedicationDoseInput;
}

export interface CreateWardHandoverInput {
  admissionId:
    string;

  handoverType:
    WardHandoverType;

  shiftCode:
    string;

  summary:
    string;

  activeConcerns?:
    readonly string[];

  pendingTasks?:
    readonly string[];

  medicationConcerns?:
    readonly string[];

  safetyConcerns?:
    readonly string[];

  toNurseUserId:
    string;

  toNurseStaffId:
    string;

  handedOverAt?:
    string | null;
}

export interface AcknowledgeWardHandoverInput {
  expectedVersion:
    number;
}

export interface NursingCommand<T> {
  actor:
    InpatientActorContext;

  input:
    T;

  idempotencyKey:
    string;
}

export interface NursingEntityCommand<T>
extends NursingCommand<T> {
  entityId:
    string;
}

export interface NursingNoteRecord {
  _id:
    Types.ObjectId;

  facilityId:
    Types.ObjectId;

  admissionId:
    Types.ObjectId;

  patientId:
    Types.ObjectId;

  encounterId:
    Types.ObjectId;

  wardId:
    Types.ObjectId;

  roomId:
    Types.ObjectId | null;

  bedId:
    Types.ObjectId | null;

  noteNumber:
    string;

  noteType:
    NursingNoteType;

  observationSeverity:
    NursingObservationSeverity;

  title:
    string;

  content:
    string;

  intakeOutput: {
    direction:
      NursingIntakeOutputDirection;

    route:
      NursingIntakeOutputRoute;

    amountMillilitres:
      Types.Decimal128;

    description:
      string | null;
  } | null;

  requiresEscalation:
    boolean;

  escalationRecipientStaffId:
    Types.ObjectId | null;

  escalatedAt:
    Date | null;

  acknowledgedAt:
    Date | null;

  acknowledgedByStaffId:
    Types.ObjectId | null;

  recordedAt:
    Date;

  recordedByUserId:
    Types.ObjectId;

  recordedByStaffId:
    Types.ObjectId;

  status:
    NursingEntryStatus;

  revisionNumber:
    number;

  rootNursingNoteId:
    Types.ObjectId;

  supersedesNursingNoteId:
    Types.ObjectId | null;

  supersededByNursingNoteId:
    Types.ObjectId | null;

  version:
    number;

  transactionId:
    string;

  correlationId:
    string;

  schemaVersion:
    number;

  createdBy:
    Types.ObjectId;

  updatedBy:
    Types.ObjectId;

  createdAt:
    Date;

  updatedAt:
    Date;
}

export interface MedicationScheduleRecord {
  _id:
    Types.ObjectId;

  facilityId:
    Types.ObjectId;

  admissionId:
    Types.ObjectId;

  patientId:
    Types.ObjectId;

  encounterId:
    Types.ObjectId;

  wardId:
    Types.ObjectId;

  roomId:
    Types.ObjectId | null;

  bedId:
    Types.ObjectId | null;

  scheduleNumber:
    string;

  prescriptionId:
    Types.ObjectId | null;

  prescriptionItemId:
    Types.ObjectId | null;

  source:
    MedicationAdministrationSource;

  medicineId:
    Types.ObjectId;

  formularyItemId:
    Types.ObjectId | null;

  medicineDisplay:
    string;

  prescribedDose:
    Types.Decimal128;

  doseUnitCode:
    string;

  route:
    MedicationAdministrationRoute;

  frequencyCode:
    string;

  scheduledTimes:
    Date[];

  prn:
    boolean;

  prnIndication:
    string | null;

  startAt:
    Date;

  endAt:
    Date | null;

  status:
    MedicationScheduleStatus;

  holdReason:
    string | null;

  orderedByUserId:
    Types.ObjectId;

  orderedByStaffId:
    Types.ObjectId;

  lastAdministrationAt:
    Date | null;

  nextScheduledAt:
    Date | null;

  version:
    number;

  transactionId:
    string;

  correlationId:
    string;

  schemaVersion:
    number;

  createdBy:
    Types.ObjectId;

  updatedBy:
    Types.ObjectId;

  createdAt:
    Date;

  updatedAt:
    Date;
}

export interface MedicationAdministrationRecord {
  _id:
    Types.ObjectId;

  facilityId:
    Types.ObjectId;

  admissionId:
    Types.ObjectId;

  patientId:
    Types.ObjectId;

  encounterId:
    Types.ObjectId;

  wardId:
    Types.ObjectId;

  roomId:
    Types.ObjectId | null;

  bedId:
    Types.ObjectId | null;

  administrationNumber:
    string;

  medicationScheduleId:
    Types.ObjectId;

  medicineId:
    Types.ObjectId;

  medicineDisplaySnapshot:
    string;

  scheduledAt:
    Date;

  status:
    MedicationDoseStatus;

  prescribedDose:
    Types.Decimal128;

  administeredDose:
    Types.Decimal128 | null;

  doseUnitCode:
    string;

  prescribedRoute:
    MedicationAdministrationRoute;

  administeredRoute:
    MedicationAdministrationRoute | null;

  administeredAt:
    Date | null;

  administeringNurseUserId:
    Types.ObjectId | null;

  administeringNurseStaffId:
    Types.ObjectId | null;

  reasonCode:
    string | null;

  reason:
    string | null;

  notes:
    string | null;

  delayedUntil:
    Date | null;

  statusChangedAt:
    Date;

  statusChangedBy:
    Types.ObjectId;

  correctionOfAdministrationId:
    Types.ObjectId | null;

  supersededByAdministrationId:
    Types.ObjectId | null;

  version:
    number;

  transactionId:
    string;

  correlationId:
    string;

  schemaVersion:
    number;

  createdBy:
    Types.ObjectId;

  updatedBy:
    Types.ObjectId;

  createdAt:
    Date;

  updatedAt:
    Date;
}

export interface WardHandoverRecord {
  _id:
    Types.ObjectId;

  facilityId:
    Types.ObjectId;

  admissionId:
    Types.ObjectId;

  patientId:
    Types.ObjectId;

  encounterId:
    Types.ObjectId;

  wardId:
    Types.ObjectId;

  roomId:
    Types.ObjectId | null;

  bedId:
    Types.ObjectId | null;

  handoverNumber:
    string;

  handoverType:
    WardHandoverType;

  shiftCode:
    string;

  summary:
    string;

  activeConcerns:
    string[];

  pendingTasks:
    string[];

  medicationConcerns:
    string[];

  safetyConcerns:
    string[];

  fromNurseUserId:
    Types.ObjectId;

  fromNurseStaffId:
    Types.ObjectId;

  toNurseUserId:
    Types.ObjectId;

  toNurseStaffId:
    Types.ObjectId;

  handedOverAt:
    Date;

  status:
    WardHandoverStatus;

  signedAt:
    Date | null;

  acknowledgedAt:
    Date | null;

  acknowledgedByUserId:
    Types.ObjectId | null;

  acknowledgedByStaffId:
    Types.ObjectId | null;

  supersedesWardHandoverId:
    Types.ObjectId | null;

  supersededByWardHandoverId:
    Types.ObjectId | null;

  version:
    number;

  transactionId:
    string;

  correlationId:
    string;

  schemaVersion:
    number;

  createdBy:
    Types.ObjectId;

  updatedBy:
    Types.ObjectId;

  createdAt:
    Date;

  updatedAt:
    Date;
}

export interface NursingRepositoryPort {
  createNursingNote(
    input:
      Omit<
        NursingNoteRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<NursingNoteRecord>;

  findNursingNote(
    facilityId:
      string,

    nursingNoteId:
      string,
  ): Promise<NursingNoteRecord | null>;

  correctNursingNote(
    facilityId:
      string,

    nursingNoteId:
      string,

    expectedVersion:
      number,

    replacementId:
      string,

    occurredAt:
      Date,

    actorUserId:
      string,

    reason:
      string,
  ): Promise<NursingNoteRecord | null>;

  createNursingNoteVersion(
    input:
      Record<string, unknown>,
  ): Promise<void>;

  createMedicationSchedule(
    input:
      Omit<
        MedicationScheduleRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<MedicationScheduleRecord>;

  findMedicationSchedule(
    facilityId:
      string,

    scheduleId:
      string,
  ): Promise<MedicationScheduleRecord | null>;

  updateMedicationSchedule(
    facilityId:
      string,

    scheduleId:
      string,

    expectedVersion:
      number,

    update:
      Record<string, unknown>,
  ): Promise<MedicationScheduleRecord | null>;

  createMedicationAdministration(
    input:
      Omit<
        MedicationAdministrationRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<MedicationAdministrationRecord>;

  findMedicationAdministration(
    facilityId:
      string,

    administrationId:
      string,
  ): Promise<MedicationAdministrationRecord | null>;

  createMedicationAdministrationAmendment(
    input:
      Record<string, unknown>,
  ): Promise<void>;

  createWardHandover(
    input:
      Omit<
        WardHandoverRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<WardHandoverRecord>;

  findWardHandover(
    facilityId:
      string,

    handoverId:
      string,
  ): Promise<WardHandoverRecord | null>;

  acknowledgeWardHandover(
    facilityId:
      string,

    handoverId:
      string,

    expectedVersion:
      number,

    actorUserId:
      string,

    actorStaffId:
      string,

    occurredAt:
      Date,
  ): Promise<WardHandoverRecord | null>;

  medicationCompliance(
    facilityId:
      string,

    admissionId:
      string,

    from:
      Date,

    to:
      Date,
  ): Promise<{
    scheduled:
      number;

    administered:
      number;

    omitted:
      number;

    refused:
      number;

    delayed:
      number;

    cancelled:
      number;
  }>;
}