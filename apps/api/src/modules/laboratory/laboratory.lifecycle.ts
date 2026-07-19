import type {
  LaboratoryOrderStatus,
  LaboratoryResultPublicationStatus,
  LaboratoryResultStatus,
  LaboratorySpecimenStatus,
} from '@hospital-mis/database';

import {
  LABORATORY_ORDER_TRANSITIONS,
  LABORATORY_PUBLICATION_TRANSITIONS,
  LABORATORY_RESULT_TRANSITIONS,
  LABORATORY_SPECIMEN_TRANSITIONS,
} from './laboratory.constants.js';

import {
  LaboratoryFinalizedResultMutationError,
  LaboratoryInvalidOrderTransitionError,
  LaboratoryInvalidPublicationTransitionError,
  LaboratoryInvalidResultTransitionError,
  LaboratoryInvalidSpecimenTransitionError,
  LaboratoryResultVerificationPreconditionError,
} from './laboratory.errors.js';

export function canTransitionLaboratoryOrder(
  fromStatus: LaboratoryOrderStatus,
  toStatus: LaboratoryOrderStatus,
): boolean {
  return LABORATORY_ORDER_TRANSITIONS[fromStatus].includes(toStatus);
}

export function assertLaboratoryOrderTransition(
  fromStatus: LaboratoryOrderStatus,
  toStatus: LaboratoryOrderStatus,
): void {
  if (!canTransitionLaboratoryOrder(fromStatus, toStatus)) {
    throw new LaboratoryInvalidOrderTransitionError(
      fromStatus,
      toStatus,
    );
  }
}

export function canTransitionLaboratorySpecimen(
  fromStatus: LaboratorySpecimenStatus,
  toStatus: LaboratorySpecimenStatus,
): boolean {
  return LABORATORY_SPECIMEN_TRANSITIONS[fromStatus].includes(toStatus);
}

export function assertLaboratorySpecimenTransition(
  fromStatus: LaboratorySpecimenStatus,
  toStatus: LaboratorySpecimenStatus,
): void {
  if (!canTransitionLaboratorySpecimen(fromStatus, toStatus)) {
    throw new LaboratoryInvalidSpecimenTransitionError(
      fromStatus,
      toStatus,
    );
  }
}

export function canTransitionLaboratoryResult(
  fromStatus: LaboratoryResultStatus,
  toStatus: LaboratoryResultStatus,
): boolean {
  return LABORATORY_RESULT_TRANSITIONS[fromStatus].includes(toStatus);
}

export function assertLaboratoryResultTransition(
  fromStatus: LaboratoryResultStatus,
  toStatus: LaboratoryResultStatus,
): void {
  if (!canTransitionLaboratoryResult(fromStatus, toStatus)) {
    throw new LaboratoryInvalidResultTransitionError(
      fromStatus,
      toStatus,
    );
  }
}

export function canTransitionLaboratoryPublication(
  fromStatus: LaboratoryResultPublicationStatus,
  toStatus: LaboratoryResultPublicationStatus,
): boolean {
  return LABORATORY_PUBLICATION_TRANSITIONS[fromStatus].includes(toStatus);
}

export function assertLaboratoryPublicationTransition(
  fromStatus: LaboratoryResultPublicationStatus,
  toStatus: LaboratoryResultPublicationStatus,
): void {
  if (!canTransitionLaboratoryPublication(fromStatus, toStatus)) {
    throw new LaboratoryInvalidPublicationTransitionError(
      fromStatus,
      toStatus,
    );
  }
}

export function assertLaboratoryResultEditable(
  status: LaboratoryResultStatus,
): void {
  if (
    status === 'VERIFIED' ||
    status === 'CORRECTED'
  ) {
    throw new LaboratoryFinalizedResultMutationError();
  }
}

export function assertLaboratoryResultVerificationReady(input: {
  status: LaboratoryResultStatus;
  componentCount: number;
  requiredComponentCount: number;
  populatedRequiredComponentCount: number;
  requiresValidation: boolean;
  validatedAt: Date | null;
  technicianStaffId: string | null;
  validatorStaffId: string | null;
  verifierStaffId: string;
}): void {
  if (input.status !== 'VALIDATED' && input.requiresValidation) {
    throw new LaboratoryResultVerificationPreconditionError(
      'Laboratory result must be validated before verification',
    );
  }

  if (
    !input.requiresValidation &&
    ![
      'ENTERED',
      'VALIDATED',
    ].includes(input.status)
  ) {
    throw new LaboratoryResultVerificationPreconditionError(
      'Laboratory result is not in a verifiable state',
    );
  }

  if (input.componentCount < 1) {
    throw new LaboratoryResultVerificationPreconditionError(
      'Laboratory result requires at least one result component',
    );
  }

  if (
    input.populatedRequiredComponentCount !==
    input.requiredComponentCount
  ) {
    throw new LaboratoryResultVerificationPreconditionError(
      'All required Laboratory result components must be populated before verification',
    );
  }

  if (input.technicianStaffId === null) {
    throw new LaboratoryResultVerificationPreconditionError(
      'Laboratory result requires technician attribution before verification',
    );
  }

  if (
    input.requiresValidation &&
    (
      input.validatedAt === null ||
      input.validatorStaffId === null
    )
  ) {
    throw new LaboratoryResultVerificationPreconditionError(
      'Laboratory result requires validator attribution before verification',
    );
  }

  if (
    input.technicianStaffId === input.verifierStaffId &&
    input.requiresValidation
  ) {
    throw new LaboratoryResultVerificationPreconditionError(
      'The verifier must be distinct from the result-entering technician when validation is required',
    );
  }
}