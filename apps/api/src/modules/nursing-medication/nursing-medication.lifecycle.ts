import type {
  AdmissionStatus,
  IntakeOutputEntryStatus,
  NursingAssessmentStatus,
  NursingCarePlanStatus,
  NursingDeviceStatus,
  NursingTaskStatus,
} from '@hospital-mis/database';

import {
  InvalidIntakeOutputTransitionError,
  InvalidNursingAssessmentTransitionError,
  InvalidNursingCarePlanTransitionError,
  InvalidNursingDeviceTransitionError,
  InvalidNursingTaskTransitionError,
  NursingAdmissionDocumentationClosedError,
  NursingClinicalContextMismatchError,
  NursingLateEntryReasonRequiredError,
} from './nursing-medication.errors.js';

import type {
  NursingAdmissionContext,
} from './nursing-medication.contracts.js';

export const NURSING_ASSESSMENT_TRANSITIONS = {
  DRAFT: [
    'SIGNED',
    'ENTERED_IN_ERROR',
  ],

  SIGNED: [
    'CORRECTED',
    'ENTERED_IN_ERROR',
  ],

  CORRECTED: [],

  ENTERED_IN_ERROR: [],
} as const satisfies Record<
  NursingAssessmentStatus,
  readonly NursingAssessmentStatus[]
>;

export const NURSING_CARE_PLAN_TRANSITIONS = {
  DRAFT: [
    'ACTIVE',
    'CANCELLED',
    'ENTERED_IN_ERROR',
  ],

  ACTIVE: [
    'ON_HOLD',
    'COMPLETED',
    'CANCELLED',
    'CORRECTED',
    'ENTERED_IN_ERROR',
  ],

  ON_HOLD: [
    'ACTIVE',
    'CANCELLED',
    'CORRECTED',
    'ENTERED_IN_ERROR',
  ],

  COMPLETED: [
    'CORRECTED',
    'ENTERED_IN_ERROR',
  ],

  CANCELLED: [
    'CORRECTED',
    'ENTERED_IN_ERROR',
  ],

  CORRECTED: [],

  ENTERED_IN_ERROR: [],
} as const satisfies Record<
  NursingCarePlanStatus,
  readonly NursingCarePlanStatus[]
>;

export const NURSING_TASK_TRANSITIONS = {
  PENDING: [
    'IN_PROGRESS',
    'COMPLETED',
    'OMITTED',
    'DELAYED',
    'REFUSED',
    'CANCELLED',
    'ESCALATED',
  ],

  IN_PROGRESS: [
    'COMPLETED',
    'OMITTED',
    'DELAYED',
    'REFUSED',
    'CANCELLED',
    'ESCALATED',
  ],

  DELAYED: [
    'PENDING',
    'IN_PROGRESS',
    'COMPLETED',
    'OMITTED',
    'REFUSED',
    'CANCELLED',
    'ESCALATED',
  ],

  ESCALATED: [
    'PENDING',
    'IN_PROGRESS',
    'COMPLETED',
    'OMITTED',
    'DELAYED',
    'REFUSED',
    'CANCELLED',
  ],

  COMPLETED: [],

  OMITTED: [],

  REFUSED: [],

  CANCELLED: [],
} as const satisfies Record<
  NursingTaskStatus,
  readonly NursingTaskStatus[]
>;

export const INTAKE_OUTPUT_TRANSITIONS = {
  ACTIVE: [
    'CORRECTED',
    'ENTERED_IN_ERROR',
  ],

  CORRECTED: [],

  ENTERED_IN_ERROR: [],
} as const satisfies Record<
  IntakeOutputEntryStatus,
  readonly IntakeOutputEntryStatus[]
>;

export const NURSING_DEVICE_TRANSITIONS = {
  ACTIVE: [
    'REMOVED',
    'DISCONTINUED',
    'ENTERED_IN_ERROR',
  ],

  REMOVED: [],

  DISCONTINUED: [],

  ENTERED_IN_ERROR: [],
} as const satisfies Record<
  NursingDeviceStatus,
  readonly NursingDeviceStatus[]
>;

const openDocumentationStatuses =
  new Set<AdmissionStatus>([
    'ADMITTED',
    'TRANSFER_PENDING',
    'DISCHARGE_INITIATED',
  ]);

const lateEntryStatuses =
  new Set<AdmissionStatus>([
    'CLINICALLY_DISCHARGED',
    'FINANCIAL_CLEARANCE_PENDING',
    'DISCHARGED',
  ]);

export type NursingDocumentationMode =
  | 'NEW_ENTRY'
  | 'LATE_ENTRY'
  | 'CORRECTION';

export function assertNursingDocumentationAllowed(
  context: NursingAdmissionContext,
  mode: NursingDocumentationMode,
  reason?: string | null,
): void {
  if (
    context.admissionStatus ===
    'CANCELLED'
  ) {
    throw new NursingAdmissionDocumentationClosedError();
  }

  if (
    mode ===
    'NEW_ENTRY'
  ) {
    if (
      !openDocumentationStatuses.has(
        context.admissionStatus,
      )
    ) {
      throw new NursingAdmissionDocumentationClosedError();
    }

    return;
  }

  if (
    mode ===
    'LATE_ENTRY'
  ) {
    if (
      !lateEntryStatuses.has(
        context.admissionStatus,
      )
    ) {
      if (
        !openDocumentationStatuses.has(
          context.admissionStatus,
        )
      ) {
        throw new NursingAdmissionDocumentationClosedError();
      }

      return;
    }

    if (
      (
        reason
          ?.trim()
          .length ?? 0
      ) < 5
    ) {
      throw new NursingLateEntryReasonRequiredError();
    }

    return;
  }

  if (
    !openDocumentationStatuses.has(
      context.admissionStatus,
    ) &&
    !lateEntryStatuses.has(
      context.admissionStatus,
    )
  ) {
    throw new NursingAdmissionDocumentationClosedError();
  }

  if (
    (
      reason
        ?.trim()
        .length ?? 0
    ) < 5
  ) {
    throw new NursingLateEntryReasonRequiredError();
  }
}

export function assertNursingRecordContext(
  context: NursingAdmissionContext,
  record: Readonly<{
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
  }>,
): void {
  if (
    record.facilityId.toHexString() !==
      context.facilityId ||
    record.admissionId.toHexString() !==
      context.admissionId ||
    record.patientId.toHexString() !==
      context.patient.patientId ||
    record.encounterId.toHexString() !==
      context.encounterId
  ) {
    throw new NursingClinicalContextMismatchError();
  }
}

export function assertNursingAssessmentTransition(
  fromStatus: NursingAssessmentStatus,
  toStatus: NursingAssessmentStatus,
): void {
  if (
    !NURSING_ASSESSMENT_TRANSITIONS[
      fromStatus
    ].includes(
      toStatus as never,
    )
  ) {
    throw new InvalidNursingAssessmentTransitionError(
      fromStatus,
      toStatus,
    );
  }
}

export function assertNursingCarePlanTransition(
  fromStatus: NursingCarePlanStatus,
  toStatus: NursingCarePlanStatus,
): void {
  if (
    !NURSING_CARE_PLAN_TRANSITIONS[
      fromStatus
    ].includes(
      toStatus as never,
    )
  ) {
    throw new InvalidNursingCarePlanTransitionError(
      fromStatus,
      toStatus,
    );
  }
}

export function assertNursingTaskTransition(
  fromStatus: NursingTaskStatus,
  toStatus: NursingTaskStatus,
): void {
  if (
    !NURSING_TASK_TRANSITIONS[
      fromStatus
    ].includes(
      toStatus as never,
    )
  ) {
    throw new InvalidNursingTaskTransitionError(
      fromStatus,
      toStatus,
    );
  }
}

export function assertIntakeOutputTransition(
  fromStatus: IntakeOutputEntryStatus,
  toStatus: IntakeOutputEntryStatus,
): void {
  if (
    !INTAKE_OUTPUT_TRANSITIONS[
      fromStatus
    ].includes(
      toStatus as never,
    )
  ) {
    throw new InvalidIntakeOutputTransitionError(
      fromStatus,
      toStatus,
    );
  }
}

export function assertNursingDeviceTransition(
  fromStatus: NursingDeviceStatus,
  toStatus: NursingDeviceStatus,
): void {
  if (
    !NURSING_DEVICE_TRANSITIONS[
      fromStatus
    ].includes(
      toStatus as never,
    )
  ) {
    throw new InvalidNursingDeviceTransitionError(
      fromStatus,
      toStatus,
    );
  }
}