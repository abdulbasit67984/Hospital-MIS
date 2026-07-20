import type {
  AdmissionRecommendationStatus,
  AdmissionStatus,
  BedRateStatus,
  InpatientBedStatus,
  InpatientCatalogStatus,
} from '@hospital-mis/database';

import type {
  AdmissionBedAssignmentRecord,
  AdmissionRecommendationRecord,
  AdmissionRecord,
  AdmissionStatusHistoryRecord,
  BedChargeSegmentRecord,
  BedHoldRecord,
  BedRateRecord,
  BedRateVersionRecord,
  BedRecord,
  BedStatusHistoryRecord,
  RoomRecord,
  WardRecord,
} from './inpatient.persistence.types.js';

import type {
  InpatientActorContext,
  InpatientAdmissionContext,
  InpatientAdmissionListQuery,
  InpatientBedRateResolution,
  InpatientBedRateResolutionQuery,
  InpatientEncounterContext,
  InpatientLocationListQuery,
  InpatientPatientContext,
} from './inpatient.types.js';

export type WardPersistenceUpdate =
  Partial<
    Pick<
      WardRecord,
      | 'name'
      | 'normalizedName'
      | 'wardType'
      | 'departmentId'
      | 'servicePointId'
      | 'nursingStationCode'
      | 'description'
      | 'displayOrder'
      | 'permittedSexes'
      | 'minimumAgeYears'
      | 'maximumAgeYears'
      | 'specialtyCodes'
      | 'isolationCapabilities'
      | 'infectionControlTags'
      | 'negativePressureCapable'
      | 'cohortingAllowed'
      | 'updatedBy'
    >
  >;

export type RoomPersistenceUpdate =
  Partial<
    Pick<
      RoomRecord,
      | 'departmentId'
      | 'servicePointId'
      | 'roomNumber'
      | 'name'
      | 'normalizedName'
      | 'roomType'
      | 'roomClass'
      | 'capacity'
      | 'floorCode'
      | 'description'
      | 'displayOrder'
      | 'permittedSexes'
      | 'minimumAgeYears'
      | 'maximumAgeYears'
      | 'specialtyCodes'
      | 'isolationCapabilities'
      | 'infectionControlTags'
      | 'negativePressureCapable'
      | 'cohortingAllowed'
      | 'updatedBy'
    >
  >;

export type BedPersistenceUpdate =
  Partial<
    Pick<
      BedRecord,
      | 'departmentId'
      | 'servicePointId'
      | 'bedNumber'
      | 'label'
      | 'normalizedLabel'
      | 'bedCategory'
      | 'turnaroundRequiredAfterRelease'
      | 'displayOrder'
      | 'permittedSexes'
      | 'minimumAgeYears'
      | 'maximumAgeYears'
      | 'specialtyCodes'
      | 'isolationCapabilities'
      | 'infectionControlTags'
      | 'negativePressureCapable'
      | 'cohortingAllowed'
      | 'updatedBy'
    >
  >;

export type BedRatePersistenceUpdate =
  Partial<
    Pick<
      BedRateRecord,
      | 'status'
      | 'currentVersion'
      | 'latestVersionId'
      | 'activatedAt'
      | 'activatedBy'
      | 'supersededAt'
      | 'supersededBy'
      | 'supersededByRateId'
      | 'cancelledAt'
      | 'cancelledBy'
      | 'cancellationReason'
      | 'updatedBy'
    >
  >;

export type AdmissionRecommendationPersistenceUpdate =
  Partial<
    Pick<
      AdmissionRecommendationRecord,
      | 'status'
      | 'acceptedAt'
      | 'acceptedBy'
      | 'acceptedByStaffId'
      | 'rejectedAt'
      | 'rejectedBy'
      | 'rejectedByStaffId'
      | 'rejectionReason'
      | 'cancelledAt'
      | 'cancelledBy'
      | 'cancelledByStaffId'
      | 'cancellationReason'
      | 'admissionId'
      | 'convertedAt'
      | 'convertedBy'
      | 'updatedBy'
    >
  >;

export type AdmissionPersistenceUpdate =
  Partial<
    Pick<
      AdmissionRecord,
      | 'status'
      | 'isActive'
      | 'acceptedAt'
      | 'acceptedBy'
      | 'acceptedByStaffId'
      | 'admittedAt'
      | 'admittedBy'
      | 'admittedByStaffId'
      | 'clinicallyDischargedAt'
      | 'financiallyClearedAt'
      | 'dischargedAt'
      | 'cancelledAt'
      | 'cancelledBy'
      | 'cancelledByStaffId'
      | 'cancellationReason'
      | 'currentWardId'
      | 'currentRoomId'
      | 'currentBedId'
      | 'currentBedAssignmentId'
      | 'currentBedAssignedAt'
      | 'currentStatusSequence'
      | 'latestStatusHistoryId'
      | 'dischargeId'
      | 'careTeam'
      | 'updatedBy'
    >
  >;

export interface InpatientTransactionCompensation {
  key:
    string;

  type:
    string;

  payload:
    Record<string, unknown>;
}

export interface InpatientTransactionContext {
  transactionId:
    string;

  idempotencyKey:
    string;

  checkpoint(
    state:
      string,

    data?:
      Record<string, unknown>,
  ): Promise<void>;

  registerCompensation(
    compensation:
      InpatientTransactionCompensation,
  ): Promise<void>;
}

export interface InpatientTransactionRequest<T> {
  transactionType:
    string;

  idempotencyKey:
    string;

  actorUserId:
    string;

  facilityId:
    string;

  correlationId:
    string;

  lockKeys:
    string[];

  idempotencyPayload:
    unknown;

  journalPayload:
    Record<string, unknown>;

  execute(
    context:
      InpatientTransactionContext,
  ): Promise<T>;
}

export interface InpatientTransactionManagerPort {
  execute<T>(
    request:
      InpatientTransactionRequest<T>,
  ): Promise<T>;
}

export interface InpatientAuditEntry {
  transactionId:
    string;

  deduplicationKey:
    string;

  action:
    string;

  entityType:
    string;

  entityId:
    string;

  actorUserId:
    string;

  facilityId:
    string;

  correlationId:
    string;

  ipAddress?:
    string;

  userAgent?:
    string;

  occurredAt:
    Date;

  reason?:
    string;

  before?:
    unknown;

  after?:
    unknown;

  metadata?:
    Record<string, unknown>;
}

export interface InpatientAuditPort {
  append(
    entry:
      InpatientAuditEntry,
  ): Promise<void>;
}

export interface InpatientOutboxMessage {
  transactionId:
    string;

  deduplicationKey:
    string;

  eventType:
    string;

  aggregateType:
    string;

  aggregateId:
    string;

  actorUserId:
    string;

  facilityId:
    string;

  correlationId:
    string;

  occurredAt:
    Date;

  payload:
    Record<string, unknown>;
}

export interface InpatientOutboxPort {
  enqueue(
    message:
      InpatientOutboxMessage,
  ): Promise<void>;
}

export interface InpatientRealtimeMessage {
  eventType:
    string;

  facilityId:
    string;

  wardId?:
    string;

  roomId?:
    string;

  bedId?:
    string;

  admissionId?:
    string;

  payload:
    Record<string, unknown>;
}

export interface InpatientRealtimePort {
  publish(
    message:
      InpatientRealtimeMessage,
  ): Promise<void>;
}

export interface InpatientClockPort {
  now():
    Date;
}

export interface InpatientSequenceAllocation {
  key:
    string;

  value:
    number;
}

export interface InpatientSequencePort {
  next(
    facilityId:
      string,

    key:
      string,
  ): Promise<
    InpatientSequenceAllocation
  >;
}

export interface CanonicalInpatientPatientResolution {
  requestedPatientId:
    string;

  canonicalPatientId:
    string;

  redirected:
    boolean;

  mergeChain:
    readonly string[];
}

export interface InpatientCanonicalPatientPort {
  resolve(
    facilityId:
      string,

    patientId:
      string,
  ): Promise<
    CanonicalInpatientPatientResolution
  >;
}

export interface InpatientContextPort {
  resolveRecommendationContext(
    actor:
      InpatientActorContext,

    encounterId:
      string,

    orderingProviderStaffId:
      string,
  ): Promise<
    InpatientAdmissionContext
  >;

  resolvePatient(
    facilityId:
      string,

    patientId:
      string,
  ): Promise<
    InpatientPatientContext
  >;

  resolveEncounter(
    facilityId:
      string,

    encounterId:
      string,
  ): Promise<
    InpatientEncounterContext
  >;
}

export interface InpatientLocationRepositoryPort {
  findWardById(
    facilityId:
      string,

    wardId:
      string,
  ): Promise<
    WardRecord | null
  >;

  findRoomById(
    facilityId:
      string,

    roomId:
      string,
  ): Promise<
    RoomRecord | null
  >;

  findBedById(
    facilityId:
      string,

    bedId:
      string,
  ): Promise<
    BedRecord | null
  >;

  listWards(
    facilityId:
      string,

    query:
      InpatientLocationListQuery,
  ): Promise<{
    items:
      WardRecord[];

    total:
      number;
  }>;

  listRooms(
    facilityId:
      string,

    query:
      InpatientLocationListQuery,
  ): Promise<{
    items:
      RoomRecord[];

    total:
      number;
  }>;

  listBeds(
    facilityId:
      string,

    query:
      InpatientLocationListQuery,
  ): Promise<{
    items:
      BedRecord[];

    total:
      number;
  }>;

  createWard(
    input:
      Omit<
        WardRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<
    WardRecord
  >;

  updateWard(
    facilityId:
      string,

    wardId:
      string,

    expectedVersion:
      number,

    update:
      WardPersistenceUpdate,
  ): Promise<
    WardRecord | null
  >;

  changeWardStatus(
    facilityId:
      string,

    wardId:
      string,

    expectedVersion:
      number,

    status:
      InpatientCatalogStatus,

    actorUserId:
      string,

    reason:
      string,

    occurredAt:
      Date,
  ): Promise<
    WardRecord | null
  >;

  createRoom(
    input:
      Omit<
        RoomRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<
    RoomRecord
  >;

  updateRoom(
    facilityId:
      string,

    roomId:
      string,

    expectedVersion:
      number,

    update:
      RoomPersistenceUpdate,
  ): Promise<
    RoomRecord | null
  >;

  changeRoomStatus(
    facilityId:
      string,

    roomId:
      string,

    expectedVersion:
      number,

    status:
      InpatientCatalogStatus,

    actorUserId:
      string,

    reason:
      string,

    occurredAt:
      Date,
  ): Promise<
    RoomRecord | null
  >;

  createBed(
    input:
      Omit<
        BedRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<
    BedRecord
  >;

  updateBed(
    facilityId:
      string,

    bedId:
      string,

    expectedVersion:
      number,

    update:
      BedPersistenceUpdate,
  ): Promise<
    BedRecord | null
  >;

  changeBedCatalogStatus(
    facilityId:
      string,

    bedId:
      string,

    expectedVersion:
      number,

    status:
      InpatientCatalogStatus,

    actorUserId:
      string,

    reason:
      string,

    occurredAt:
      Date,
  ): Promise<
    BedRecord | null
  >;

  findBedRateById(
    facilityId:
      string,

    bedRateId:
      string,
  ): Promise<
    BedRateRecord | null
  >;

  createBedRate(
    input:
      Omit<
        BedRateRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<
    BedRateRecord
  >;

  updateBedRate(
    facilityId:
      string,

    bedRateId:
      string,

    expectedVersion:
      number,

    update:
      BedRatePersistenceUpdate,
  ): Promise<
    BedRateRecord | null
  >;

  createBedRateVersion(
    input:
      Omit<
        BedRateVersionRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<
    BedRateVersionRecord
  >;

  findOverlappingBedRate(
    facilityId:
      string,

    scopeKey:
      string,

    effectiveFrom:
      Date,

    effectiveThrough:
      Date | null,

    excludedBedRateId?:
      string,
  ): Promise<
    BedRateRecord | null
  >;

  resolveEffectiveBedRate(
    query:
      InpatientBedRateResolutionQuery,
  ): Promise<
    InpatientBedRateResolution | null
  >;
}

export interface InpatientAdmissionRepositoryPort {
  findRecommendationById(
    facilityId:
      string,

    recommendationId:
      string,
  ): Promise<
    AdmissionRecommendationRecord | null
  >;

  createRecommendation(
    input:
      Omit<
        AdmissionRecommendationRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<
    AdmissionRecommendationRecord
  >;

  updateRecommendation(
    facilityId:
      string,

    recommendationId:
      string,

    expectedVersion:
      number,

    update:
      AdmissionRecommendationPersistenceUpdate,
  ): Promise<
    AdmissionRecommendationRecord | null
  >;

  findAdmissionById(
    facilityId:
      string,

    admissionId:
      string,
  ): Promise<
    AdmissionRecord | null
  >;

  findActiveAdmissionByPatient(
    facilityId:
      string,

    patientId:
      string,
  ): Promise<
    AdmissionRecord | null
  >;

  listAdmissions(
    facilityId:
      string,

    query:
      InpatientAdmissionListQuery,
  ): Promise<{
    items:
      AdmissionRecord[];

    total:
      number;
  }>;

  createAdmission(
    input:
      Omit<
        AdmissionRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<
    AdmissionRecord
  >;

  updateAdmission(
    facilityId:
      string,

    admissionId:
      string,

    expectedVersion:
      number,

    update:
      AdmissionPersistenceUpdate,
  ): Promise<
    AdmissionRecord | null
  >;

  createAdmissionStatusHistory(
    input:
      Omit<
        AdmissionStatusHistoryRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<
    AdmissionStatusHistoryRecord
  >;

  listAdmissionStatusHistory(
    facilityId:
      string,

    admissionId:
      string,
  ): Promise<
    AdmissionStatusHistoryRecord[]
  >;

  findActiveBedHold(
    facilityId:
      string,

    bedId:
      string,
  ): Promise<
    BedHoldRecord | null
  >;

  findActiveBedAssignment(
    facilityId:
      string,

    bedId:
      string,
  ): Promise<
    AdmissionBedAssignmentRecord | null
  >;

  findActiveAssignmentForAdmission(
    facilityId:
      string,

    admissionId:
      string,
  ): Promise<
    AdmissionBedAssignmentRecord | null
  >;

  listAssignments(
    facilityId:
      string,

    admissionId:
      string,
  ): Promise<
    AdmissionBedAssignmentRecord[]
  >;

  listBedStatusHistory(
    facilityId:
      string,

    bedId:
      string,
  ): Promise<
    BedStatusHistoryRecord[]
  >;

  listBedChargeSegments(
    facilityId:
      string,

    admissionId:
      string,
  ): Promise<
    BedChargeSegmentRecord[]
  >;
}

export type InpatientAccessAction =
  | 'WARD_READ'
  | 'WARD_MANAGE'
  | 'BED_READ'
  | 'BED_MANAGE'
  | 'BED_ASSIGN'
  | 'BED_TRANSFER'
  | 'BED_STATUS_MANAGE'
  | 'ADMISSION_READ'
  | 'ADMISSION_RECOMMEND'
  | 'ADMISSION_CREATE'
  | 'ADMISSION_ACCEPT'
  | 'ADMISSION_REJECT'
  | 'ADMISSION_CANCEL';

export type InpatientAccessMode =
  | 'CATALOG'
  | 'WARD_OPERATIONAL'
  | 'ASSIGNED_CLINICIAN'
  | 'MEDICAL_RECORDS'
  | 'BREAK_GLASS'
  | 'DENIED';

export interface InpatientAccessDecision {
  allowed:
    boolean;

  accessMode:
    InpatientAccessMode;

  minimumNecessaryFields:
    readonly string[];

  auditSensitiveRead:
    boolean;

  denialReason?:
    string;
}

export interface InpatientAccessRequest {
  action:
    InpatientAccessAction;

  actor:
    InpatientActorContext;

  clinicalContext?:
    InpatientEncounterContext;

  ward?:
    WardRecord;

  room?:
    RoomRecord;

  bed?:
    BedRecord;

  recommendation?:
    AdmissionRecommendationRecord;

  admission?:
    AdmissionRecord;
}

export interface InpatientAccessPolicyPort {
  requireActiveActorStaffId(
    actor:
      Readonly<{
        userId:
          string;

        facilityId:
          string;
      }>,
  ): Promise<string>;

  authorize(
    request:
      InpatientAccessRequest,
  ): Promise<
    InpatientAccessDecision
  >;
}

export interface InpatientLifecycleRepositoryPort {
  changeBedOperationalStatus(
    facilityId:
      string,

    bedId:
      string,

    expectedVersion:
      number,

    fromStatus:
      InpatientBedStatus,

    toStatus:
      InpatientBedStatus,

    actorUserId:
      string,

    reasonCode:
      string,

    reason:
      string | null,

    maintenanceReference:
      string | null,

    occurredAt:
      Date,
  ): Promise<
    BedRecord | null
  >;

  changeRecommendationStatus(
    facilityId:
      string,

    recommendationId:
      string,

    expectedVersion:
      number,

    fromStatus:
      AdmissionRecommendationStatus,

    toStatus:
      AdmissionRecommendationStatus,

    update:
      AdmissionRecommendationPersistenceUpdate,
  ): Promise<
    AdmissionRecommendationRecord | null
  >;

  changeAdmissionStatus(
    facilityId:
      string,

    admissionId:
      string,

    expectedVersion:
      number,

    fromStatus:
      AdmissionStatus,

    toStatus:
      AdmissionStatus,

    update:
      AdmissionPersistenceUpdate,
  ): Promise<
    AdmissionRecord | null
  >;

  changeBedRateStatus(
    facilityId:
      string,

    bedRateId:
      string,

    expectedVersion:
      number,

    fromStatus:
      BedRateStatus,

    toStatus:
      BedRateStatus,

    update:
      BedRatePersistenceUpdate,
  ): Promise<
    BedRateRecord | null
  >;
}