import {
  randomBytes,
} from 'node:crypto';

import type {
  LaboratoryOrderPriority,
} from '@hospital-mis/database';

import {
  DEFAULT_LABORATORY_NUMBER_WIDTH,
  LABORATORY_LOCK_NAMESPACE,
} from './laboratory.constants.js';

import type {
  LaboratoryOrderRecord,
  LaboratoryTestCategoryRecord,
  LaboratoryTestRecord,
} from './laboratory.persistence.types.js';

export function newLaboratoryObjectIdString():
  string {
  return randomBytes(
    12,
  ).toString('hex');
}

export function laboratoryDeduplicationKey(
  transactionId: string,
  action: string,
  entityId: string,
): string {
  return [
    transactionId,
    action,
    entityId,
  ].join(':');
}

export function laboratoryLockKey(
  namespace: string,
  facilityId: string,
  ...parts: readonly string[]
): string {
  return [
    namespace,
    facilityId,
    ...parts,
  ]
    .map(
      (value) =>
        value
          .trim()
          .toLocaleLowerCase(
            'en-US',
          ),
    )
    .join(':');
}

export function laboratoryCategoryCreateLockKeys(
  facilityId: string,
  categoryCode: string,
  normalizedName: string,
): string[] {
  return [
    laboratoryLockKey(
      LABORATORY_LOCK_NAMESPACE
        .CATALOG_CATEGORY,
      facilityId,
      'code',
      categoryCode,
    ),

    laboratoryLockKey(
      LABORATORY_LOCK_NAMESPACE
        .CATALOG_CATEGORY,
      facilityId,
      'name',
      normalizedName,
    ),
  ];
}

export function laboratoryCategoryMutationLockKeys(
  facilityId: string,
  categoryId: string,
): string[] {
  return [
    laboratoryLockKey(
      LABORATORY_LOCK_NAMESPACE
        .CATALOG_CATEGORY,
      facilityId,
      categoryId,
    ),
  ];
}

export function laboratoryTestCreateLockKeys(
  facilityId: string,
  testCode: string,
  normalizedName: string,
): string[] {
  return [
    laboratoryLockKey(
      LABORATORY_LOCK_NAMESPACE
        .CATALOG_TEST,
      facilityId,
      'code',
      testCode,
    ),

    laboratoryLockKey(
      LABORATORY_LOCK_NAMESPACE
        .CATALOG_TEST,
      facilityId,
      'name',
      normalizedName,
    ),
  ];
}

export function laboratoryTestMutationLockKeys(
  facilityId: string,
  testId: string,
): string[] {
  return [
    laboratoryLockKey(
      LABORATORY_LOCK_NAMESPACE
        .CATALOG_TEST,
      facilityId,
      testId,
    ),
  ];
}

export function laboratoryOrderCreateLockKeys(
  facilityId: string,
  encounterId: string,
): string[] {
  return [
    laboratoryLockKey(
      LABORATORY_LOCK_NAMESPACE
        .ENCOUNTER_ORDERS,
      facilityId,
      encounterId,
    ),
  ];
}

export function laboratoryOrderMutationLockKeys(
  facilityId: string,
  order: LaboratoryOrderRecord,
): string[] {
  return [
    laboratoryLockKey(
      LABORATORY_LOCK_NAMESPACE
        .ORDER,
      facilityId,
      order._id.toHexString(),
    ),

    laboratoryLockKey(
      LABORATORY_LOCK_NAMESPACE
        .ENCOUNTER_ORDERS,
      facilityId,
      order.encounterId.toHexString(),
    ),
  ];
}

export function formatLaboratoryNumber(
  prefix: string,
  year: number,
  value: number,
  width =
    DEFAULT_LABORATORY_NUMBER_WIDTH,
): string {
  return [
    prefix,
    String(year),
    String(value).padStart(
      width,
      '0',
    ),
  ].join('-');
}

export function turnaroundMinutesForPriority(
  test: LaboratoryTestRecord,
  priority: LaboratoryOrderPriority,
): number {
  if (priority === 'STAT') {
    return (
      test.statTurnaroundMinutes ??
      test.urgentTurnaroundMinutes ??
      test.routineTurnaroundMinutes
    );
  }

  if (priority === 'URGENT') {
    return (
      test.urgentTurnaroundMinutes ??
      test.routineTurnaroundMinutes
    );
  }

  return test.routineTurnaroundMinutes;
}

export function safeLaboratoryCategoryAuditSnapshot(
  record: LaboratoryTestCategoryRecord,
): Record<string, unknown> {
  return {
    categoryId:
      record._id.toHexString(),

    categoryCode:
      record.categoryCode,

    name:
      record.name,

    displayOrder:
      record.displayOrder,

    status:
      record.status,

    version:
      record.version,
  };
}

export function safeLaboratoryCategoryEventPayload(
  record: LaboratoryTestCategoryRecord,
): Record<string, unknown> {
  return {
    categoryId:
      record._id.toHexString(),

    categoryCode:
      record.categoryCode,

    status:
      record.status,

    version:
      record.version,
  };
}

export function safeLaboratoryTestAuditSnapshot(
  record: LaboratoryTestRecord,
): Record<string, unknown> {
  return {
    testId:
      record._id.toHexString(),

    testCode:
      record.testCode,

    name:
      record.name,

    categoryId:
      record.categoryId.toHexString(),

    methodCode:
      record.methodCode,

    requiresSpecimen:
      record.requiresSpecimen,

    specimenRequirementCount:
      record
        .specimenRequirements
        .length,

    componentCount:
      record.components.length,

    routineTurnaroundMinutes:
      record.routineTurnaroundMinutes,

    urgentTurnaroundMinutes:
      record.urgentTurnaroundMinutes,

    statTurnaroundMinutes:
      record.statTurnaroundMinutes,

    availableDepartmentIds:
      record
        .availableDepartmentIds
        .map(
          (departmentId) =>
            departmentId.toHexString(),
        ),

    orderable:
      record.orderable,

    status:
      record.status,

    effectiveFrom:
      record.effectiveFrom.toISOString(),

    effectiveThrough:
      record
        .effectiveThrough
        ?.toISOString() ??
      null,

    version:
      record.version,
  };
}

export function safeLaboratoryTestEventPayload(
  record: LaboratoryTestRecord,
): Record<string, unknown> {
  return {
    testId:
      record._id.toHexString(),

    testCode:
      record.testCode,

    categoryId:
      record.categoryId.toHexString(),

    orderable:
      record.orderable,

    status:
      record.status,

    version:
      record.version,
  };
}

export function safeLaboratoryOrderAuditSnapshot(
  record: LaboratoryOrderRecord,
): Record<string, unknown> {
  return {
    orderId:
      record._id.toHexString(),

    orderNumber:
      record.orderNumber,

    encounterId:
      record.encounterId.toHexString(),

    patientId:
      record.patientId.toHexString(),

    orderingProviderId:
      record
        .orderingProviderId
        .toHexString(),

    departmentId:
      record.departmentId.toHexString(),

    priority:
      record.priority,

    status:
      record.status,

    itemCount:
      record.itemCount,

    activeItemCount:
      record.activeItemCount,

    collectedItemCount:
      record.collectedItemCount,

    completedItemCount:
      record.completedItemCount,

    verifiedItemCount:
      record.verifiedItemCount,

    rejectedItemCount:
      record.rejectedItemCount,

    criticalResultCount:
      record.criticalResultCount,

    orderedAt:
      record.orderedAt.toISOString(),

    acceptedAt:
      record
        .acceptedAt
        ?.toISOString() ??
      null,

    cancelledAt:
      record
        .cancelledAt
        ?.toISOString() ??
      null,

    version:
      record.version,
  };
}

export function safeLaboratoryOrderEventPayload(
  record: LaboratoryOrderRecord,
): Record<string, unknown> {
  return {
    orderId:
      record._id.toHexString(),

    encounterId:
      record.encounterId.toHexString(),

    departmentId:
      record.departmentId.toHexString(),

    priority:
      record.priority,

    status:
      record.status,

    itemCount:
      record.itemCount,

    version:
      record.version,
  };
}

export function safeLaboratoryCatalogJournalPayload(
  operation: string,
  input: Readonly<{
    categoryId?: string;
    testId?: string;
    categoryCode?: string;
    testCode?: string;
    status?: string;
  }>,
): Record<string, unknown> {
  return {
    operation,

    categoryId:
      input.categoryId ??
      null,

    testId:
      input.testId ??
      null,

    categoryCode:
      input.categoryCode ??
      null,

    testCode:
      input.testCode ??
      null,

    status:
      input.status ??
      null,
  };
}

export function safeLaboratoryOrderJournalPayload(
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

    orderId:
      input.orderId ??
      null,

    encounterId:
      input.encounterId,

    status:
      input.status ??
      null,

    priority:
      input.priority ??
      null,

    itemCount:
      input.itemCount ??
      null,
  };
}