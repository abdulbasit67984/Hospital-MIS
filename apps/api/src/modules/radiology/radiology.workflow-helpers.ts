import {
  RADIOLOGY_LOCK_NAMESPACE,
} from './radiology.constants.js';

import type {
  RadiologyModalityRecord,
  RadiologyOrderItemRecord,
  RadiologyOrderRecord,
  RadiologyProcedureRecord,
} from './radiology.persistence.types.js';

export function radiologyDeduplicationKey(
  transactionId: string,
  action: string,
  entityId: string,
): string {
  return [transactionId, action, entityId].join(':');
}

export function radiologyLockKey(
  namespace: string,
  facilityId: string,
  ...parts: readonly string[]
): string {
  return [namespace, facilityId, ...parts]
    .map((value) => value.trim().toLocaleLowerCase('en-US'))
    .join(':');
}

export function radiologyModalityCreateLockKeys(
  facilityId: string,
  modalityCode: string,
  normalizedName: string,
): string[] {
  return [
    radiologyLockKey(
      RADIOLOGY_LOCK_NAMESPACE.MODALITY,
      facilityId,
      'code',
      modalityCode,
    ),
    radiologyLockKey(
      RADIOLOGY_LOCK_NAMESPACE.MODALITY,
      facilityId,
      'name',
      normalizedName,
    ),
  ];
}

export function radiologyModalityMutationLockKeys(
  facilityId: string,
  modalityId: string,
): string[] {
  return [
    radiologyLockKey(
      RADIOLOGY_LOCK_NAMESPACE.MODALITY,
      facilityId,
      modalityId,
    ),
  ];
}

export function radiologyProcedureCreateLockKeys(
  facilityId: string,
  procedureCode: string,
  normalizedName: string,
): string[] {
  return [
    radiologyLockKey(
      RADIOLOGY_LOCK_NAMESPACE.PROCEDURE,
      facilityId,
      'code',
      procedureCode,
    ),
    radiologyLockKey(
      RADIOLOGY_LOCK_NAMESPACE.PROCEDURE,
      facilityId,
      'name',
      normalizedName,
    ),
  ];
}

export function radiologyProcedureMutationLockKeys(
  facilityId: string,
  procedureId: string,
): string[] {
  return [
    radiologyLockKey(
      RADIOLOGY_LOCK_NAMESPACE.PROCEDURE,
      facilityId,
      procedureId,
    ),
  ];
}

export function radiologyOrderCreateLockKeys(
  facilityId: string,
  encounterId: string,
): string[] {
  return [
    radiologyLockKey(
      RADIOLOGY_LOCK_NAMESPACE.ENCOUNTER_ORDERS,
      facilityId,
      encounterId,
    ),
  ];
}

export function radiologyOrderMutationLockKeys(
  facilityId: string,
  order: RadiologyOrderRecord,
): string[] {
  return [
    radiologyLockKey(
      RADIOLOGY_LOCK_NAMESPACE.ORDER,
      facilityId,
      order._id.toHexString(),
    ),
    radiologyLockKey(
      RADIOLOGY_LOCK_NAMESPACE.ENCOUNTER_ORDERS,
      facilityId,
      order.encounterId.toHexString(),
    ),
  ];
}

export function safeRadiologyModalityAuditSnapshot(
  record: RadiologyModalityRecord,
): Record<string, unknown> {
  return {
    modalityId: record._id.toHexString(),
    modalityCode: record.modalityCode,
    name: record.name,
    modalityType: record.modalityType,
    dicomModalityCode: record.dicomModalityCode,
    availableDepartmentIds: record.availableDepartmentIds.map((id) =>
      id.toHexString(),
    ),
    supportsContrast: record.supportsContrast,
    supportsPacsIntegration: record.supportsPacsIntegration,
    orderable: record.orderable,
    status: record.status,
    effectiveFrom: record.effectiveFrom.toISOString(),
    effectiveThrough: record.effectiveThrough?.toISOString() ?? null,
    version: record.version,
  };
}

export function safeRadiologyModalityEventPayload(
  record: RadiologyModalityRecord,
): Record<string, unknown> {
  return {
    modalityId: record._id.toHexString(),
    modalityCode: record.modalityCode,
    modalityType: record.modalityType,
    orderable: record.orderable,
    status: record.status,
    version: record.version,
  };
}

export function safeRadiologyProcedureAuditSnapshot(
  record: RadiologyProcedureRecord,
): Record<string, unknown> {
  return {
    procedureId: record._id.toHexString(),
    procedureCode: record.procedureCode,
    name: record.name,
    modalityId: record.modalityId.toHexString(),
    modalityCode: record.modalityCodeSnapshot,
    bodyRegionCodes: record.bodyRegions.map((region) => region.code),
    lateralityRequirement: record.lateralityRequirement,
    contrastRequirement: record.contrastRequirement,
    expectedDurationMinutes: record.expectedDurationMinutes,
    routineTurnaroundMinutes: record.routineTurnaroundMinutes,
    urgentTurnaroundMinutes: record.urgentTurnaroundMinutes,
    statTurnaroundMinutes: record.statTurnaroundMinutes,
    availableDepartmentIds: record.availableDepartmentIds.map((id) =>
      id.toHexString(),
    ),
    schedulingRequired: record.schedulingRequired,
    orderable: record.orderable,
    status: record.status,
    effectiveFrom: record.effectiveFrom.toISOString(),
    effectiveThrough: record.effectiveThrough?.toISOString() ?? null,
    billingLinked: record.chargeCatalogItemId !== null,
    version: record.version,
  };
}

export function safeRadiologyProcedureEventPayload(
  record: RadiologyProcedureRecord,
): Record<string, unknown> {
  return {
    procedureId: record._id.toHexString(),
    procedureCode: record.procedureCode,
    modalityId: record.modalityId.toHexString(),
    modalityType: record.modalityTypeSnapshot,
    contrastRequirement: record.contrastRequirement,
    orderable: record.orderable,
    status: record.status,
    version: record.version,
  };
}

export function safeRadiologyOrderAuditSnapshot(
  record: RadiologyOrderRecord,
): Record<string, unknown> {
  return {
    orderId: record._id.toHexString(),
    orderNumber: record.orderNumber,
    encounterId: record.encounterId.toHexString(),
    patientId: record.patientId.toHexString(),
    orderingProviderId: record.orderingProviderId.toHexString(),
    departmentId: record.departmentId.toHexString(),
    priority: record.priority,
    status: record.status,
    itemCount: record.itemCount,
    activeItemCount: record.activeItemCount,
    scheduledItemCount: record.scheduledItemCount,
    completedItemCount: record.completedItemCount,
    reportedItemCount: record.reportedItemCount,
    verifiedItemCount: record.verifiedItemCount,
    rejectedItemCount: record.rejectedItemCount,
    orderedAt: record.orderedAt.toISOString(),
    version: record.version,
  };
}

export function safeRadiologyOrderItemAuditSnapshot(
  record: RadiologyOrderItemRecord,
): Record<string, unknown> {
  return {
    orderItemId: record._id.toHexString(),
    orderId: record.radiologyOrderId.toHexString(),
    procedureId: record.radiologyProcedureId.toHexString(),
    procedureCode: record.procedureDefinitionSnapshot.procedureCode,
    requestedLaterality: record.requestedLaterality,
    contrastRequested: record.contrastRequested,
    priority: record.priority,
    status: record.status,
    preparationStatus: record.preparationStatus,
    safetyScreeningStatus: record.safetyScreeningStatus,
    accessionAssigned: record.accessionNumber !== null,
    billingStatus: record.billingStatus,
    version: record.version,
  };
}

export function safeRadiologyOrderEventPayload(
  record: RadiologyOrderRecord,
): Record<string, unknown> {
  return {
    orderId: record._id.toHexString(),
    encounterId: record.encounterId.toHexString(),
    departmentId: record.departmentId.toHexString(),
    priority: record.priority,
    status: record.status,
    itemCount: record.itemCount,
    version: record.version,
  };
}

export function safeRadiologyCatalogJournalPayload(
  operation: string,
  input: Readonly<{
    modalityId?: string;
    procedureId?: string;
    modalityCode?: string;
    procedureCode?: string;
    status?: string;
  }>,
): Record<string, unknown> {
  return {
    operation,
    modalityId: input.modalityId ?? null,
    procedureId: input.procedureId ?? null,
    modalityCode: input.modalityCode ?? null,
    procedureCode: input.procedureCode ?? null,
    status: input.status ?? null,
  };
}

export function safeRadiologyOrderJournalPayload(
  operation: string,
  input: Readonly<{
    orderId?: string;
    encounterId: string;
    status?: string;
    priority?: string;
    itemCount?: number;
  }>,
): Record<string, unknown> {
  return {
    operation,
    orderId: input.orderId ?? null,
    encounterId: input.encounterId,
    status: input.status ?? null,
    priority: input.priority ?? null,
    itemCount: input.itemCount ?? null,
  };
}