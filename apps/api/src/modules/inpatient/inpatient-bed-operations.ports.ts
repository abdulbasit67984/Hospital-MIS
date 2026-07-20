import type {
  AdmissionBedAssignmentRecord,
  BedChargeSegmentRecord,
  BedHoldRecord,
  BedRecord,
  BedStatusHistoryRecord,
} from './inpatient.persistence.types.js';

import type {
  InpatientBedChargeCalculation,
} from './inpatient-bed-operations.types.js';

export type BedHoldPersistenceUpdate =
  Partial<
    Pick<
      BedHoldRecord,
      | 'status'
      | 'isActive'
      | 'consumedAt'
      | 'consumedBy'
      | 'admissionBedAssignmentId'
      | 'endedAt'
      | 'endedBy'
      | 'endingReason'
      | 'updatedBy'
    >
  >;

export type BedAssignmentPersistenceUpdate =
  Partial<
    Pick<
      AdmissionBedAssignmentRecord,
      | 'status'
      | 'isActive'
      | 'releasedAt'
      | 'releasedBy'
      | 'releasedByStaffId'
      | 'releaseReasonCode'
      | 'releaseReason'
      | 'nextAssignmentId'
      | 'bedChargeSegmentId'
      | 'updatedBy'
    >
  >;

export type BedChargeSegmentPersistenceUpdate =
  Partial<
    Pick<
      BedChargeSegmentRecord,
      | 'endedAt'
      | 'isOpen'
      | 'billableMinutes'
      | 'quantity'
      | 'grossAmount'
      | 'status'
      | 'billingRequestId'
      | 'billingChargeReference'
      | 'billedAt'
      | 'reversalRequestId'
      | 'reversalReference'
      | 'reversedAt'
      | 'correctionReason'
      | 'updatedBy'
    >
  >;

export interface InpatientBedOperationRepositoryPort {
  findBedHoldById(
    facilityId:
      string,

    bedHoldId:
      string,
  ): Promise<
    BedHoldRecord | null
  >;

  findAssignmentById(
    facilityId:
      string,

    assignmentId:
      string,
  ): Promise<
    AdmissionBedAssignmentRecord | null
  >;

  findChargeSegmentById(
    facilityId:
      string,

    chargeSegmentId:
      string,
  ): Promise<
    BedChargeSegmentRecord | null
  >;

  findOpenChargeSegmentForAssignment(
    facilityId:
      string,

    assignmentId:
      string,
  ): Promise<
    BedChargeSegmentRecord | null
  >;

  createBedHold(
    input:
      Omit<
        BedHoldRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<
    BedHoldRecord
  >;

  updateBedHold(
    facilityId:
      string,

    bedHoldId:
      string,

    expectedVersion:
      number,

    update:
      BedHoldPersistenceUpdate,
  ): Promise<
    BedHoldRecord | null
  >;

  createAssignment(
    input:
      Omit<
        AdmissionBedAssignmentRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<
    AdmissionBedAssignmentRecord
  >;

  updateAssignment(
    facilityId:
      string,

    assignmentId:
      string,

    expectedVersion:
      number,

    update:
      BedAssignmentPersistenceUpdate,
  ): Promise<
    AdmissionBedAssignmentRecord | null
  >;

  createBedStatusHistory(
    input:
      Omit<
        BedStatusHistoryRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<
    BedStatusHistoryRecord
  >;

  findLatestBedStatusHistory(
    facilityId:
      string,

    bedId:
      string,
  ): Promise<
    BedStatusHistoryRecord | null
  >;

  createChargeSegment(
    input:
      Omit<
        BedChargeSegmentRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<
    BedChargeSegmentRecord
  >;

  updateChargeSegment(
    facilityId:
      string,

    chargeSegmentId:
      string,

    expectedVersion:
      number,

    update:
      BedChargeSegmentPersistenceUpdate,
  ): Promise<
    BedChargeSegmentRecord | null
  >;

  expireActiveHolds(
    facilityId:
      string,

    occurredAt:
      Date,

    actorUserId:
      string,

    limit:
      number,
  ): Promise<
    BedHoldRecord[]
  >;

  projectBedState(
    facilityId:
      string,

    bedId:
      string,

    expectedVersion:
      number,

    update:
      Partial<
        Pick<
          BedRecord,
          | 'operationalStatus'
          | 'operationalStatusChangedAt'
          | 'operationalStatusChangedBy'
          | 'operationalStatusReasonCode'
          | 'operationalStatusReason'
          | 'currentAdmissionId'
          | 'currentAssignmentId'
          | 'currentPatientId'
          | 'activeHoldId'
          | 'lastReleasedAt'
          | 'maintenanceReference'
          | 'updatedBy'
        >
      >,
  ): Promise<
    BedRecord | null
  >;
}

export interface InpatientBedBillingSubmission {
  idempotencyKey:
    string;

  facilityId:
    string;

  patientId:
    string;

  admissionId:
    string;

  accountReference:
    string | null;

  chargeSegmentId:
    string;

  assignmentId:
    string;

  bedId:
    string;

  wardId:
    string;

  roomId:
    string;

  rateCode:
    string;

  bedRateId:
    string;

  bedRateVersionId:
    string;

  currencyCode:
    string;

  unitRate:
    string;

  quantity:
    string;

  grossAmount:
    string;

  startedAt:
    string;

  endedAt:
    string;

  correlationId:
    string;
}

export interface InpatientBedBillingResult {
  requestId:
    string;

  chargeReference:
    string;

  acceptedAt:
    Date;
}

export interface InpatientBedBillingReversal {
  idempotencyKey:
    string;

  facilityId:
    string;

  admissionId:
    string;

  chargeSegmentId:
    string;

  billingChargeReference:
    string;

  reason:
    string;

  correlationId:
    string;
}

export interface InpatientBedBillingReversalResult {
  requestId:
    string;

  reversalReference:
    string;

  reversedAt:
    Date;
}

export interface InpatientBedBillingPort {
  submitBedCharge(
    input:
      InpatientBedBillingSubmission,
  ): Promise<
    InpatientBedBillingResult
  >;

  reverseBedCharge(
    input:
      InpatientBedBillingReversal,
  ): Promise<
    InpatientBedBillingReversalResult
  >;
}

export interface InpatientBedChargeCalculatorPort {
  calculate(
    segment:
      Pick<
        BedChargeSegmentRecord,
        | 'startedAt'
        | 'endedAt'
        | 'unitRate'
        | 'currencyCode'
        | 'chargingPolicySnapshot'
      >,
  ): InpatientBedChargeCalculation;
}