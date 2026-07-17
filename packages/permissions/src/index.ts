export const permissionKeys = [
  'patients.read',
  'patients.read_sensitive',
  'patients.create',
  'patients.update',
  'patients.merge',

  'guardians.read',
  'guardians.manage',

  'registrations.read',
  'registrations.create',
  'registrations.collect_payment',

  'queues.read',
  'queues.manage',
  'queues.priority',
  'queues.transfer',
  'queues.public_display',

  'encounters.read_assigned',
  'encounters.read_all',
  'encounters.create',
  'encounters.finalize',
  'encounters.amend',

  'clinical_notes.create',
  'clinical_notes.amend',

  'prescriptions.read',
  'prescriptions.issue',
  'prescriptions.cancel',

  'laboratory.orders.read',
  'laboratory.orders.manage',
  'laboratory.results.enter',
  'laboratory.results.verify',
  'laboratory.results.amend',

  'radiology.orders.read',
  'radiology.orders.manage',
  'radiology.reports.enter',
  'radiology.reports.verify',
  'radiology.reports.amend',

  'admissions.read',
  'admissions.create',
  'admissions.transfer',
  'admissions.clinical_discharge',
  'admissions.financial_discharge',

  'beds.read',
  'beds.manage',
  'beds.assign',
  'beds.transfer',
  'beds.status_manage',

  'nursing.read',
  'nursing.vitals.create',
  'nursing.vitals.amend',
  'nursing.notes.create',
  'nursing.notes.amend',
  'nursing.medication_administer',
  'nursing.handover.manage',

  'inventory.read',
  'inventory.view_cost',
  'inventory.items.manage',
  'inventory.batches.manage',
  'inventory.procure',
  'inventory.receive',
  'inventory.transfer',
  'inventory.adjust',
  'inventory.count',

  'pharmacy.queue.read',
  'pharmacy.dispense',
  'pharmacy.return',
  'pharmacy.override_fefo',

  'billing.accounts.read',
  'billing.charges.create',
  'billing.invoice.create',
  'billing.invoice.finalize',
  'billing.discount.request',
  'billing.discount.approve',
  'billing.payment.receive',
  'billing.refund.process',
  'billing.credit_note.create',
  'billing.financial_discharge',

  'cash_shifts.open',
  'cash_shifts.close',
  'cash_shifts.reconcile',

  'panels.read',
  'panels.manage',
  'coverage.evaluate',
  'preauthorizations.manage',
  'packages.manage',

  'claims.read',
  'claims.prepare',
  'claims.submit',
  'claims.status_manage',
  'claims.payment_record',

  'assistance.read',
  'assistance.apply',
  'assistance.approve',
  'assistance.allocate',
  'assistance.reverse',

  'consultants.read',
  'consultants.agreements.manage',
  'consultants.settlements.manage',

  'reports.operational.read',
  'reports.clinical.read',
  'reports.financial.read',
  'reports.inventory.read',
  'reports.export',

  'audit.read',
  'audit.export',

  /*
   * Phase 4 identity and access-control permissions.
   *
   * These granular permissions are used by the identity routes. The broader
   * legacy users.* and roles.* keys remain temporarily for compatibility
   * with previously seeded installations.
   */
  'identity.permissions.read',

  'identity.roles.read',
  'identity.roles.create',
  'identity.roles.update',
  'identity.roles.deactivate',
  'identity.roles.assign_permissions',

  'identity.staff.read',
  'identity.staff.create',
  'identity.staff.update',
  'identity.staff.change_status',

  'identity.users.read',
  'identity.users.create',
  'identity.users.update',
  'identity.users.change_status',
  'identity.users.assign_roles',
  'identity.users.reset_password',
  'identity.users.revoke_sessions',

  'users.read',
  'users.manage',
  'users.sessions.revoke',

  'roles.read',
  'roles.manage',
  'roles.assign',

  'facilities.read',
  'facilities.create',
  'facilities.update',
  'facilities.activate',
  'facilities.deactivate',
  'facilities.manage_all',

  'departments.read',
  'departments.create',
  'departments.update',
  'departments.activate',
  'departments.deactivate',

  'configuration.definitions.read',
  'configuration.read',
  'configuration.manage',
  'configuration.manage_global',
  'configuration.manage_sensitive',
  'configuration.read_history',

  'security.break_glass',
  'security.sessions.revoke_all',
] as const;

export type PermissionKey =
  (typeof permissionKeys)[number];

export type PermissionSensitivity =
  | 'STANDARD'
  | 'SENSITIVE'
  | 'HIGHLY_SENSITIVE';

export type PermissionDefinition = Readonly<{
  key: PermissionKey;
  module: string;
  description: string;
  sensitivity: PermissionSensitivity;
}>;

const permissionKeySet =
  new Set<string>(
    permissionKeys,
  );

function humanizePermission(
  key: PermissionKey,
): string {
  return key
    .replaceAll('.', ' ')
    .replaceAll('_', ' ')
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase(),
    );
}

function sensitivityFor(
  key: PermissionKey,
): PermissionSensitivity {
  if (
    key.startsWith('audit.') ||
    key.startsWith('security.') ||
    key ===
      'patients.read_sensitive' ||
    key ===
      'inventory.view_cost' ||
    key ===
      'billing.discount.approve' ||
    key ===
      'billing.refund.process' ||
    key ===
      'assistance.approve' ||
    key ===
      'identity.roles.assign_permissions' ||
    key ===
      'identity.users.assign_roles' ||
    key ===
      'identity.users.reset_password' ||
    key ===
      'identity.users.revoke_sessions' ||
    key ===
      'facilities.deactivate' ||
    key ===
      'facilities.manage_all' ||
    key ===
      'departments.deactivate' ||
    key ===
      'configuration.manage_global' ||
    key ===
      'configuration.manage_sensitive'
  ) {
    return 'HIGHLY_SENSITIVE';
  }

  if (
    key.startsWith('billing.') ||
    key.startsWith('claims.') ||
    key.startsWith('assistance.') ||
    key.startsWith('clinical_notes.') ||
    key.startsWith('encounters.') ||
    key.startsWith(
      'laboratory.results.',
    ) ||
    key.startsWith(
      'radiology.reports.',
    ) ||
    key.startsWith('identity.') ||
    key.startsWith('facilities.') ||
    key.startsWith('departments.') ||
    key ===
      'configuration.manage' ||
    key ===
      'configuration.read_history'
  ) {
    return 'SENSITIVE';
  }

  return 'STANDARD';
}

export const permissionDefinitions:
  readonly PermissionDefinition[] =
  permissionKeys.map(
    (key) => ({
      key,

      module:
        key.startsWith('identity.')
          ? 'identity'
          : key.startsWith('facilities.') ||
              key.startsWith('departments.')
            ? 'facility'
            : (key.split('.')[0] ?? 'unknown'),

      description:
        humanizePermission(
          key,
        ),

      sensitivity:
        sensitivityFor(
          key,
        ),
    }),
  );

export function isPermissionKey(
  value: string,
): value is PermissionKey {
  return permissionKeySet.has(
    value,
  );
}

export function requirePermissionKey(
  value: string,
): PermissionKey {
  if (
    !isPermissionKey(
      value,
    )
  ) {
    throw new Error(
      `Unknown permission key: ${value}`,
    );
  }

  return value;
}