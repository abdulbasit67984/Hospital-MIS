import type {
  RadiologyOrderItemStatus,
  RadiologyOrderStatus,
  RadiologyPreparationStatus,
  RadiologySafetyScreeningStatus,
} from '@hospital-mis/database';

import {
  RADIOLOGY_ORDER_ITEM_TRANSITIONS,
  RADIOLOGY_ORDER_TRANSITIONS,
  RADIOLOGY_PREPARATION_TRANSITIONS,
  RADIOLOGY_SAFETY_SCREENING_TRANSITIONS,
} from './radiology.constants.js';

import {
  RadiologyInvalidOrderItemTransitionError,
  RadiologyInvalidOrderTransitionError,
  RadiologyInvalidPreparationTransitionError,
  RadiologyInvalidSafetyScreeningTransitionError,
  RadiologyPreparationIncompleteError,
  RadiologyProcedureNotOrderableError,
  RadiologyProcedureRequestConflictError,
  RadiologySafetyClearanceRequiredError,
} from './radiology.errors.js';

import type {
  RadiologyProcedureRecord,
} from './radiology.persistence.types.js';

import type {
  CreateRadiologyOrderItemInput,
} from './radiology.types.js';

export function canTransitionRadiologyOrder(
  fromStatus: RadiologyOrderStatus,
  toStatus: RadiologyOrderStatus,
): boolean {
  const transitions: readonly RadiologyOrderStatus[] =
    RADIOLOGY_ORDER_TRANSITIONS[fromStatus];

  return transitions.includes(toStatus);
}

export function assertRadiologyOrderTransition(
  fromStatus: RadiologyOrderStatus,
  toStatus: RadiologyOrderStatus,
): void {
  if (!canTransitionRadiologyOrder(fromStatus, toStatus)) {
    throw new RadiologyInvalidOrderTransitionError(
      fromStatus,
      toStatus,
    );
  }
}

export function canTransitionRadiologyOrderItem(
  fromStatus: RadiologyOrderItemStatus,
  toStatus: RadiologyOrderItemStatus,
): boolean {
  const transitions: readonly RadiologyOrderItemStatus[] =
    RADIOLOGY_ORDER_ITEM_TRANSITIONS[fromStatus];

  return transitions.includes(toStatus);
}

export function assertRadiologyOrderItemTransition(
  fromStatus: RadiologyOrderItemStatus,
  toStatus: RadiologyOrderItemStatus,
): void {
  if (!canTransitionRadiologyOrderItem(fromStatus, toStatus)) {
    throw new RadiologyInvalidOrderItemTransitionError(
      fromStatus,
      toStatus,
    );
  }
}

export function canTransitionRadiologySafetyScreening(
  fromStatus: RadiologySafetyScreeningStatus,
  toStatus: RadiologySafetyScreeningStatus,
): boolean {
  const transitions: readonly RadiologySafetyScreeningStatus[] =
    RADIOLOGY_SAFETY_SCREENING_TRANSITIONS[fromStatus];

  return transitions.includes(toStatus);
}

export function assertRadiologySafetyScreeningTransition(
  fromStatus: RadiologySafetyScreeningStatus,
  toStatus: RadiologySafetyScreeningStatus,
): void {
  if (!canTransitionRadiologySafetyScreening(fromStatus, toStatus)) {
    throw new RadiologyInvalidSafetyScreeningTransitionError(
      fromStatus,
      toStatus,
    );
  }
}

export function canTransitionRadiologyPreparation(
  fromStatus: RadiologyPreparationStatus,
  toStatus: RadiologyPreparationStatus,
): boolean {
  const transitions: readonly RadiologyPreparationStatus[] =
    RADIOLOGY_PREPARATION_TRANSITIONS[fromStatus];

  return transitions.includes(toStatus);
}

export function assertRadiologyPreparationTransition(
  fromStatus: RadiologyPreparationStatus,
  toStatus: RadiologyPreparationStatus,
): void {
  if (!canTransitionRadiologyPreparation(fromStatus, toStatus)) {
    throw new RadiologyInvalidPreparationTransitionError(
      fromStatus,
      toStatus,
    );
  }
}

export function assertRadiologyProcedureOrderable(
  procedure: Pick<
    RadiologyProcedureRecord,
    | 'status'
    | 'orderable'
    | 'availableDepartmentIds'
    | 'effectiveFrom'
    | 'effectiveThrough'
  >,
  departmentId: string,
  occurredAt: Date,
): void {
  const available = procedure.availableDepartmentIds.some(
    (candidate) => candidate.toHexString() === departmentId,
  );

  if (
    procedure.status !== 'ACTIVE' ||
    !procedure.orderable ||
    !available ||
    procedure.effectiveFrom > occurredAt ||
    (
      procedure.effectiveThrough !== null &&
      procedure.effectiveThrough < occurredAt
    )
  ) {
    throw new RadiologyProcedureNotOrderableError();
  }
}

export function assertRadiologyProcedureRequest(
  procedure: Pick<
    RadiologyProcedureRecord,
    | 'lateralityRequirement'
    | 'permittedLateralities'
    | 'contrastRequirement'
    | 'permittedContrastRoutes'
  >,
  request: Pick<
    CreateRadiologyOrderItemInput,
    | 'requestedLaterality'
    | 'contrastRequested'
    | 'requestedContrastRoute'
  >,
): void {
  if (procedure.lateralityRequirement === 'NOT_APPLICABLE') {
    if (request.requestedLaterality !== 'NOT_APPLICABLE') {
      throw new RadiologyProcedureRequestConflictError(
        'The selected Radiology procedure does not accept laterality',
      );
    }
  } else {
    if (!procedure.permittedLateralities.includes(request.requestedLaterality)) {
      throw new RadiologyProcedureRequestConflictError(
        'The requested laterality is not permitted for the selected Radiology procedure',
      );
    }

    if (
      procedure.lateralityRequirement === 'REQUIRED' &&
      request.requestedLaterality === 'UNSPECIFIED'
    ) {
      throw new RadiologyProcedureRequestConflictError(
        'The selected Radiology procedure requires an explicit laterality',
      );
    }
  }

  if (
    procedure.contrastRequirement === 'NONE' &&
    request.contrastRequested
  ) {
    throw new RadiologyProcedureRequestConflictError(
      'The selected Radiology procedure does not permit contrast',
    );
  }

  if (
    procedure.contrastRequirement === 'REQUIRED' &&
    !request.contrastRequested
  ) {
    throw new RadiologyProcedureRequestConflictError(
      'The selected Radiology procedure requires contrast',
    );
  }

  if (request.contrastRequested) {
    if (request.requestedContrastRoute == null) {
      throw new RadiologyProcedureRequestConflictError(
        'A contrast route is required for the selected Radiology procedure',
      );
    }

    if (
      !procedure.permittedContrastRoutes.includes(
        request.requestedContrastRoute,
      )
    ) {
      throw new RadiologyProcedureRequestConflictError(
        'The requested contrast route is not permitted for the selected Radiology procedure',
      );
    }
  } else if (request.requestedContrastRoute != null) {
    throw new RadiologyProcedureRequestConflictError(
      'A non-contrast Radiology request cannot retain a contrast route',
    );
  }
}

export function assertRadiologyExaminationReady(
  safetyScreeningStatus: RadiologySafetyScreeningStatus,
  preparationStatus: RadiologyPreparationStatus,
): void {
  if (
    safetyScreeningStatus !== 'NOT_REQUIRED' &&
    safetyScreeningStatus !== 'CLEARED'
  ) {
    throw new RadiologySafetyClearanceRequiredError();
  }

  if (
    preparationStatus !== 'NOT_REQUIRED' &&
    preparationStatus !== 'CONFIRMED'
  ) {
    throw new RadiologyPreparationIncompleteError();
  }
}