import {
  INVENTORY_OPERATIONAL_ROLE_KEYS,
  INVENTORY_PERMISSION_KEYS,
} from '../inventory.constants.js';

import {
  InventoryBreakGlassReasonRequiredError,
} from '../inventory.errors.js';

import type {
  InventoryAccessDecision,
  InventoryAccessPolicyPort,
  InventoryAccessRequest,
  InventoryContextRepositoryPort,
} from '../inventory.ports.js';

import {
  InventoryContextRepository,
} from '../repositories/inventory-context.repository.js';

function denied(reason: string): InventoryAccessDecision {
  return {
    allowed: false,
    accessMode: 'DENIED',
    includeCost: false,
    minimumNecessaryFields: [],
    auditSensitiveRead: false,
    denialReason: reason,
  };
}

function allowed(
  accessMode: InventoryAccessDecision['accessMode'],
  includeCost: boolean,
  minimumNecessaryFields: readonly string[],
  auditSensitiveRead: boolean,
): InventoryAccessDecision {
  return {
    allowed: true,
    accessMode,
    includeCost,
    minimumNecessaryFields,
    auditSensitiveRead,
  };
}

function requiredPermission(
  action: InventoryAccessRequest['action'],
): string {
  switch (action) {
    case 'CATALOG_READ':
    case 'STOCK_READ':
      return INVENTORY_PERMISSION_KEYS.READ;

    case 'COST_READ':
      return INVENTORY_PERMISSION_KEYS.VIEW_COST;

    case 'ITEM_MANAGE':
    case 'LOCATION_MANAGE':
      return INVENTORY_PERMISSION_KEYS.ITEMS_MANAGE;

    case 'SUPPLIER_MANAGE':
    case 'PROCURE':
      return INVENTORY_PERMISSION_KEYS.PROCURE;

    case 'BATCH_MANAGE':
      return INVENTORY_PERMISSION_KEYS.BATCHES_MANAGE;

    case 'RECEIVE':
      return INVENTORY_PERMISSION_KEYS.RECEIVE;

    case 'TRANSFER':
      return INVENTORY_PERMISSION_KEYS.TRANSFER;

    case 'ADJUST':
      return INVENTORY_PERMISSION_KEYS.ADJUST;

    case 'COUNT':
      return INVENTORY_PERMISSION_KEYS.COUNT;

    case 'DISPENSE':
      return INVENTORY_PERMISSION_KEYS.PHARMACY_DISPENSE;

    case 'RETURN':
      return INVENTORY_PERMISSION_KEYS.PHARMACY_RETURN;

    case 'REPORT_READ':
      return INVENTORY_PERMISSION_KEYS.REPORTS_READ;

    case 'REPORT_EXPORT':
      return INVENTORY_PERMISSION_KEYS.REPORTS_EXPORT;
  }
}

function isMutation(
  action: InventoryAccessRequest['action'],
): boolean {
  return ![
    'CATALOG_READ',
    'STOCK_READ',
    'COST_READ',
    'REPORT_READ',
    'REPORT_EXPORT',
  ].includes(action);
}

function minimumFields(
  action: InventoryAccessRequest['action'],
  includeCost: boolean,
): readonly string[] {
  const fields = [
    'identity',
    'classification',
    'units',
    'storageRules',
    'batchExpiryRules',
    'location',
    'status',
    'version',
  ];

  if (
    action === 'STOCK_READ' ||
    action === 'DISPENSE' ||
    action === 'TRANSFER'
  ) {
    fields.push(
      'onHandQuantity',
      'availableQuantity',
      'reservedQuantity',
      'restrictedQuantities',
      'batchTraceability',
    );
  }

  if (includeCost) {
    fields.push(
      'costPrice',
      'supplierQuotes',
      'valuation',
    );
  }

  return fields;
}

export class InventoryAccessPolicyService
implements InventoryAccessPolicyPort {
  public constructor(
    private readonly identities: InventoryContextRepositoryPort =
      new InventoryContextRepository(),
  ) {}

  public async authorize(
    request: InventoryAccessRequest,
  ): Promise<InventoryAccessDecision> {
    const identity = await this.identities.findActorIdentity(
      request.actor.userId,
    );

    if (
      identity === null ||
      identity.status !== 'ACTIVE'
    ) {
      return denied('The authenticated inventory actor is not active');
    }

    if (
      identity.facilityId !== null &&
      identity.facilityId !== request.actor.facilityId
    ) {
      return denied('The authenticated inventory actor belongs to another facility');
    }

    if (
      request.location !== undefined &&
      request.location.facilityId.toHexString() !== request.actor.facilityId
    ) {
      return denied('The inventory location belongs to another facility');
    }

    if (
      request.item !== undefined &&
      request.item.facilityId.toHexString() !== request.actor.facilityId
    ) {
      return denied('The inventory item belongs to another facility');
    }

    const permission = requiredPermission(request.action);

    if (!request.actor.permissionKeys.includes(permission)) {
      return denied(`The operation requires ${permission}`);
    }

    const includeCost = request.actor.permissionKeys.includes(
      INVENTORY_PERMISSION_KEYS.VIEW_COST,
    );

    const staff = identity.staffId === null
      ? null
      : await this.identities.findStaff(
          request.actor.facilityId,
          identity.staffId,
        );

    if (
      isMutation(request.action) &&
      (
        staff === null ||
        !staff.isActive ||
        staff.employmentStatus !== 'ACTIVE'
      )
    ) {
      return denied('Inventory mutations require active staff attribution');
    }

    const hasOperationalRole = request.actor.roleKeys.some(
      (roleKey) =>
        INVENTORY_OPERATIONAL_ROLE_KEYS.includes(
          roleKey as (typeof INVENTORY_OPERATIONAL_ROLE_KEYS)[number],
        ),
    );

    if (hasOperationalRole) {
      const mode = request.location?.locationType === 'PHARMACY'
        ? 'PHARMACY'
        : request.location?.managerStaffId?.toHexString() === staff?.staffId
          ? 'LOCATION_MANAGER'
          : 'FACILITY_INVENTORY';

      return allowed(
        mode,
        includeCost,
        minimumFields(request.action, includeCost),
        request.action === 'COST_READ' ||
          request.action.startsWith('REPORT_'),
      );
    }

    if (
      staff !== null &&
      request.location !== undefined &&
      request.location.managerStaffId?.toHexString() === staff.staffId
    ) {
      return allowed(
        'LOCATION_MANAGER',
        includeCost,
        minimumFields(request.action, includeCost),
        request.action === 'COST_READ',
      );
    }

    if (
      staff !== null &&
      request.location !== undefined &&
      staff.departmentId !== null &&
      request.location.departmentId?.toHexString() === staff.departmentId &&
      [
        'CATALOG_READ',
        'STOCK_READ',
        'TRANSFER',
      ].includes(request.action)
    ) {
      return allowed(
        request.location.locationType === 'WARD_STORE'
          ? 'WARD_REQUESTOR'
          : 'DEPARTMENT_LOCATION',
        false,
        minimumFields(request.action, false),
        request.action === 'STOCK_READ',
      );
    }

    const mayBreakGlass = request.actor.permissionKeys.includes(
      INVENTORY_PERMISSION_KEYS.BREAK_GLASS,
    );

    if (mayBreakGlass) {
      if (request.actor.breakGlassReason === undefined) {
        throw new InventoryBreakGlassReasonRequiredError();
      }

      return allowed(
        'BREAK_GLASS',
        includeCost,
        minimumFields(request.action, includeCost),
        true,
      );
    }

    return denied('The actor is outside the minimum-necessary inventory scope');
  }
}