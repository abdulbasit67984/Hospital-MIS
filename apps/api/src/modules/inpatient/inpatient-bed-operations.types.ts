import type {
  BedHoldType,
  BedReleaseReason,
  InpatientBedStatus,
} from '@hospital-mis/database';

import type {
  InpatientActorContext,
} from './inpatient.types.js';

export interface ReserveBedInput {
  admissionId:
    string;

  bedId:
    string;

  holdType:
    BedHoldType;

  holdMinutes:
    number;

  reasonCode:
    string;

  reason:
    string;

  expectedBedVersion:
    number;
}

export interface ReleaseBedHoldInput {
  expectedHoldVersion:
    number;

  expectedBedVersion:
    number;

  reason:
    string;
}

export interface AssignBedInput {
  admissionId:
    string;

  bedId:
    string;

  bedHoldId?:
    string | null;

  expectedAdmissionVersion:
    number;

  expectedBedVersion:
    number;

  expectedHoldVersion?:
    number | null;

  assignedAt?:
    string | null;
}

export interface TransferBedInput {
  admissionId:
    string;

  destinationBedId:
    string;

  destinationBedHoldId?:
    string | null;

  expectedAdmissionVersion:
    number;

  expectedSourceBedVersion:
    number;

  expectedDestinationBedVersion:
    number;

  expectedSourceAssignmentVersion:
    number;

  expectedDestinationHoldVersion?:
    number | null;

  reason:
    string;

  transferredAt?:
    string | null;
}

export interface ReleaseBedInput {
  admissionId:
    string;

  expectedAdmissionVersion:
    number;

  expectedBedVersion:
    number;

  expectedAssignmentVersion:
    number;

  releaseReasonCode:
    BedReleaseReason;

  releaseReason?:
    string | null;

  releasedAt?:
    string | null;

  startTurnaround?:
    boolean;
}

export interface ChangeBedOperationalStatusCommandInput {
  expectedBedVersion:
    number;

  status:
    InpatientBedStatus;

  reasonCode:
    string;

  reason?:
    string | null;

  maintenanceReference?:
    string | null;
}

export interface CompleteBedTurnaroundInput {
  expectedBedVersion:
    number;

  reason?:
    string | null;
}

export interface SubmitBedChargeInput {
  expectedChargeSegmentVersion:
    number;
}

export interface ReverseBedChargeInput {
  expectedChargeSegmentVersion:
    number;

  reason:
    string;
}

export interface ReconcileBedStateInput {
  expectedBedVersion:
    number;

  reason:
    string;

  dryRun?:
    boolean;
}

export interface InpatientBedOperationCommand<T> {
  actor:
    InpatientActorContext;

  input:
    T;

  idempotencyKey:
    string;
}

export interface InpatientBedEntityCommand<T>
extends InpatientBedOperationCommand<T> {
  bedId:
    string;
}

export interface InpatientBedHoldEntityCommand<T>
extends InpatientBedOperationCommand<T> {
  bedHoldId:
    string;
}

export interface InpatientChargeSegmentEntityCommand<T>
extends InpatientBedOperationCommand<T> {
  chargeSegmentId:
    string;
}

export interface InpatientBedChargeCalculation {
  billableMinutes:
    number;

  quantity:
    string;

  grossAmount:
    string;

  currencyCode:
    string;
}

export interface InpatientBedStateReconciliationIssue {
  code:
    string;

  message:
    string;

  currentValue:
    unknown;

  expectedValue:
    unknown;
}

export interface InpatientBedStateReconciliationResult {
  bedId:
    string;

  admissionId:
    string | null;

  assignmentId:
    string | null;

  holdId:
    string | null;

  issues:
    InpatientBedStateReconciliationIssue[];

  repaired:
    boolean;
}