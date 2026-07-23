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

  'formulary.read',
  'formulary.manage',

  'prescriptions.read',
  'prescriptions.create',
  'prescriptions.issue',
  'prescriptions.amend',
  'prescriptions.cancel',
  'prescriptions.print',

  'laboratory.catalog.read',
  'laboratory.catalog.manage',

  'laboratory.orders.read',
  'laboratory.orders.create',
  'laboratory.orders.manage',
  'laboratory.orders.cancel',

  'laboratory.specimens.read',
  'laboratory.specimens.collect',
  'laboratory.specimens.receive',
  'laboratory.specimens.reject',

  'laboratory.results.read',
  'laboratory.results.enter',
  'laboratory.results.validate',
  'laboratory.results.verify',
  'laboratory.results.amend',
  'laboratory.results.publish',
  'laboratory.results.print',

  'laboratory.critical_results.notify',
  'laboratory.critical_results.acknowledge',

  'radiology.catalog.read',
  'radiology.catalog.manage',

  'radiology.orders.read',
  'radiology.orders.create',
  'radiology.orders.manage',
  'radiology.orders.cancel',

  'radiology.schedules.read',
  'radiology.schedules.manage',

  'radiology.safety_screening.read',
  'radiology.safety_screening.manage',

  'radiology.examinations.read',
  'radiology.examinations.manage',

  'radiology.studies.read',
  'radiology.studies.manage',

  'radiology.reports.read',
  'radiology.reports.enter',
  'radiology.reports.review',
  'radiology.reports.verify',
  'radiology.reports.amend',
  'radiology.reports.publish',
  'radiology.reports.withdraw',
  'radiology.reports.print',

  'radiology.critical_findings.notify',
  'radiology.critical_findings.acknowledge',

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

  'pharmacy.read',
  'pharmacy.queue.read',
  'pharmacy.verify',
  'pharmacy.dispense',
  'pharmacy.controlled_dispense',
  'pharmacy.return',
  'pharmacy.reversal',
  'pharmacy.price_override',
  'pharmacy.view_cost',
  'pharmacy.override_fefo',
  'pharmacy.reports.read',
  'pharmacy.reports.export',
  'pharmacy.configuration.manage',

  'billing.catalog.read',
  'billing.catalog.manage',
  'billing.catalog.view_cost',
  'billing.pricing.read',
  'billing.pricing.manage',
  'billing.packages.read',
  'billing.packages.manage',

  'billing.accounts.read',
  'billing.accounts.create',
  'billing.accounts.manage',
  'billing.accounts.suspend',
  'billing.accounts.finalize',

  'billing.charges.read',
  'billing.charges.create',
  'billing.charges.post',
  'billing.charges.cancel',
  'billing.charges.reverse',
  'billing.charges.adjust',
  'billing.charges.write_off',
  'billing.charges.transfer',
  'billing.charges.manual',

  'billing.invoice.read',
  'billing.invoice.create',
  'billing.invoice.finalize',
  'billing.invoice.cancel',
  'billing.invoice.correct',
  'billing.invoice.print',

  'billing.discount.request',
  'billing.discount.approve',
  'billing.price_override.request',
  'billing.price_override.approve',

  'billing.payment.read',
  'billing.payment.receive',
  'billing.payment.allocate',
  'billing.payment.reverse',

  'billing.refund.request',
  'billing.refund.approve',
  'billing.refund.process',

  'billing.credit_note.create',
  'billing.credit_note.post',
  'billing.debit_note.create',
  'billing.debit_note.post',
  'billing.financial_discharge',

  'billing.reports.read',
  'billing.reports.export',
  'billing.reports.cost_margin',

  'payments.methods.read',
  'payments.methods.manage',
  'payments.counters.read',
  'payments.counters.manage',
  'payments.counters.assign',
  'payments.intents.create',
  'payments.intents.cancel',
  'payments.intents.recover',
  'payments.read',
  'payments.collect',
  'payments.collect_manual',
  'payments.collect_cash',
  'payments.collect_non_cash',
  'payments.collect_split_tender',
  'payments.allocate',
  'payments.reallocate',
  'payments.deposits.read',
  'payments.deposits.collect',
  'payments.deposits.apply',
  'payments.deposits.transfer',
  'payments.deposits.forfeit',
  'payments.receipts.read',
  'payments.receipts.print',
  'payments.receipts.reprint',
  'payments.refunds.request',
  'payments.refunds.approve',
  'payments.refunds.process',
  'payments.refunds.reverse',
  'payments.reversals.request',
  'payments.reversals.approve',
  'payments.reversals.process',
  'payments.cash_movements.read',
  'payments.cash_movements.create',
  'payments.cash_movements.approve',
  'payments.cash_movements.post',
  'payments.reconciliation.read',
  'payments.reconciliation.override',
  'payments.reports.read',
  'payments.reports.export',
  'payments.recovery.manage',

  'cash_shifts.read',
  'cash_shifts.open',
  'cash_shifts.suspend',
  'cash_shifts.resume',
  'cash_shifts.handover',
  'cash_shifts.reconcile',
  'cash_shifts.close',
  'cash_shifts.reopen',
  'cash_shifts.approve_variance',

  'panels.read',
  'panels.manage',
  'panels.activate',

  'packages.read',
  'packages.manage',
  'packages.activate',
  'packages.enroll',
  'packages.suspend',
  'packages.cancel',
  'packages.reverse',

  'coverage.read',
  'coverage.manage',
  'coverage.activate',
  'coverage.enroll',
  'coverage.verify',
  'coverage.estimate',
  'coverage.determine',
  'coverage.override',
  'coverage.utilization.read',
  'coverage.reports.read',
  'coverage.reports.export',

  'preauthorizations.manage',

  'claims.read',
  'claims.read_sensitive',
  'claims.prepare',
  'claims.update',
  'claims.validate',
  'claims.mark_ready',
  'claims.batches.manage',
  'claims.submission.request',
  'claims.submission.approve',
  'claims.submit',
  'claims.status_manage',
  'claims.acknowledgements.record',
  'claims.adjudications.record',
  'claims.remittances.import',
  'claims.payment_record',
  'claims.payments.match',
  'claims.adjustments.request',
  'claims.adjustments.approve',
  'claims.write_off.request',
  'claims.write_off.approve',
  'claims.denials.manage',
  'claims.appeals.prepare',
  'claims.appeals.approve',
  'claims.appeals.submit',
  'claims.assign',
  'claims.escalate',
  'claims.cancel.request',
  'claims.cancel.approve',
  'claims.reverse.request',
  'claims.reverse.approve',
  'claims.void.request',
  'claims.void.approve',
  'claims.recovery.manage',
  'claims.reports.read',
  'claims.reports.export',

  'assistance.read',
  'assistance.apply',
  'assistance.approve',
  'assistance.allocate',
  'assistance.reverse',

  'welfare_zakat.read',
  'welfare_zakat.read_sensitive',
  'welfare_zakat.funds.read',
  'welfare_zakat.funds.create',
  'welfare_zakat.funds.approve',
  'welfare_zakat.funds.status_manage',
  'welfare_zakat.fund_transactions.record',
  'welfare_zakat.fund_transactions.approve',
  'welfare_zakat.transfers.request',
  'welfare_zakat.transfers.approve',
  'welfare_zakat.donations.record',
  'welfare_zakat.donations.approve',
  'welfare_zakat.applications.create',
  'welfare_zakat.applications.update',
  'welfare_zakat.applications.submit',
  'welfare_zakat.applications.review',
  'welfare_zakat.applications.reopen',
  'welfare_zakat.applications.cancel',
  'welfare_zakat.assign',
  'welfare_zakat.escalate',
  'welfare_zakat.eligibility.evaluate',
  'welfare_zakat.approvals.request',
  'welfare_zakat.approvals.decide',
  'welfare_zakat.approvals.cancel',
  'welfare_zakat.approvals.reverse',
  'welfare_zakat.reservations.create',
  'welfare_zakat.reservations.release',
  'welfare_zakat.allocations.create',
  'welfare_zakat.allocations.approve',
  'welfare_zakat.allocations.confirm',
  'welfare_zakat.allocations.reverse.request',
  'welfare_zakat.allocations.reverse.approve',
  'welfare_zakat.refunds.request',
  'welfare_zakat.refunds.approve',
  'welfare_zakat.repayments.request',
  'welfare_zakat.repayments.approve',
  'welfare_zakat.recovery.manage',
  'welfare_zakat.reconcile',
  'welfare_zakat.reports.read',
  'welfare_zakat.reports.export',

  'consultants.read',
  'consultants.read_sensitive',
  'consultants.agreements.create',
  'consultants.agreements.update',
  'consultants.agreements.amend',
  'consultants.agreements.submit',
  'consultants.agreements.review',
  'consultants.agreements.approve',
  'consultants.agreements.activate',
  'consultants.agreements.suspend',
  'consultants.agreements.terminate',
  'consultants.agreements.reopen',
  'consultants.revenue.read',
  'consultants.revenue.calculate',
  'consultants.revenue.recalculate',
  'consultants.revenue.hold',
  'consultants.revenue.release',
  'consultants.revenue.manual.request',
  'consultants.revenue.manual.approve',
  'consultants.adjustments.request',
  'consultants.adjustments.approve',
  'consultants.reversals.request',
  'consultants.reversals.approve',
  'consultants.settlements.read',
  'consultants.settlements.create',
  'consultants.settlements.review',
  'consultants.settlements.calculate',
  'consultants.settlements.submit',
  'consultants.settlements.approve',
  'consultants.settlements.cancel',
  'consultants.settlements.reverse',
  'consultants.payouts.request',
  'consultants.payouts.approve',
  'consultants.payouts.reverse',
  'consultants.disputes.create',
  'consultants.disputes.review',
  'consultants.disputes.resolve',
  'consultants.assign',
  'consultants.escalate',
  'consultants.reconcile',
  'consultants.recovery.manage',
  'consultants.reports.read',
  'consultants.reports.export',

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

export type PermissionDefinition =
  Readonly<{
    key: PermissionKey;
    module: string;
    description: string;
    sensitivity:
      PermissionSensitivity;
  }>;

const permissionKeySet =
  new Set<string>(
    permissionKeys,
  );

function humanizePermission(
  key: PermissionKey,
): string {
  return key
    .replaceAll(
      '.',
      ' ',
    )
    .replaceAll(
      '_',
      ' ',
    )
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
    key.startsWith(
      'audit.',
    ) ||
    key.startsWith(
      'security.',
    ) ||
    key ===
      'patients.read_sensitive' ||
    key ===
      'inventory.view_cost' ||
    key ===
      'pharmacy.controlled_dispense' ||
    key ===
      'pharmacy.reversal' ||
    key ===
      'pharmacy.price_override' ||
    key ===
      'pharmacy.view_cost' ||
    key ===
      'pharmacy.configuration.manage' ||
    key ===
      'billing.catalog.view_cost' ||
    key ===
      'billing.accounts.finalize' ||
    key ===
      'billing.charges.reverse' ||
    key ===
      'billing.charges.adjust' ||
    key ===
      'billing.charges.write_off' ||
    key ===
      'billing.charges.transfer' ||
    key ===
      'billing.discount.approve' ||
    key ===
      'billing.price_override.approve' ||
    key ===
      'billing.payment.reverse' ||
    key ===
      'billing.refund.approve' ||
    key ===
      'billing.refund.process' ||
    key ===
      'billing.credit_note.post' ||
    key ===
      'billing.debit_note.post' ||
    key ===
      'billing.reports.cost_margin' ||
    key ===
      'payments.methods.manage' ||
    key ===
      'payments.counters.manage' ||
    key ===
      'payments.counters.assign' ||
    key ===
      'payments.intents.recover' ||
    key ===
      'payments.collect_manual' ||
    key ===
      'payments.reallocate' ||
    key ===
      'payments.deposits.transfer' ||
    key ===
      'payments.deposits.forfeit' ||
    key ===
      'payments.receipts.reprint' ||
    key ===
      'payments.refunds.approve' ||
    key ===
      'payments.refunds.process' ||
    key ===
      'payments.refunds.reverse' ||
    key ===
      'payments.reversals.approve' ||
    key ===
      'payments.reversals.process' ||
    key ===
      'payments.cash_movements.approve' ||
    key ===
      'payments.cash_movements.post' ||
    key ===
      'payments.reconciliation.override' ||
    key ===
      'payments.recovery.manage' ||
    key ===
      'cash_shifts.reopen' ||
    key ===
      'cash_shifts.approve_variance' ||
    key ===
      'panels.activate' ||
    key ===
      'packages.activate' ||
    key ===
      'packages.cancel' ||
    key ===
      'packages.reverse' ||
    key ===
      'coverage.activate' ||
    key ===
      'coverage.override' ||
    key ===
      'claims.read_sensitive' ||
    key ===
      'claims.submission.approve' ||
    key ===
      'claims.adjudications.record' ||
    key ===
      'claims.remittances.import' ||
    key ===
      'claims.payments.match' ||
    key ===
      'claims.adjustments.approve' ||
    key ===
      'claims.write_off.approve' ||
    key ===
      'claims.appeals.approve' ||
    key ===
      'claims.cancel.approve' ||
    key ===
      'claims.reverse.approve' ||
    key ===
      'claims.void.approve' ||
    key ===
      'claims.recovery.manage' ||
    key ===
      'assistance.approve' ||
    key ===
      'welfare_zakat.read_sensitive' ||
    key ===
      'welfare_zakat.funds.approve' ||
    key ===
      'welfare_zakat.funds.status_manage' ||
    key ===
      'welfare_zakat.fund_transactions.approve' ||
    key ===
      'welfare_zakat.transfers.approve' ||
    key ===
      'welfare_zakat.donations.approve' ||
    key ===
      'welfare_zakat.approvals.decide' ||
    key ===
      'welfare_zakat.approvals.cancel' ||
    key ===
      'welfare_zakat.approvals.reverse' ||
    key ===
      'welfare_zakat.allocations.approve' ||
    key ===
      'welfare_zakat.allocations.reverse.approve' ||
    key ===
      'welfare_zakat.refunds.approve' ||
    key ===
      'welfare_zakat.repayments.approve' ||
    key ===
      'welfare_zakat.recovery.manage' ||
    key ===
      'welfare_zakat.reconcile' ||
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
      'configuration.manage_sensitive' ||
    key === 'consultants.agreements.approve' ||
    key === 'consultants.agreements.activate' ||
    key === 'consultants.agreements.suspend' ||
    key === 'consultants.agreements.terminate' ||
    key === 'consultants.revenue.manual.approve' ||
    key === 'consultants.adjustments.approve' ||
    key === 'consultants.reversals.approve' ||
    key === 'consultants.settlements.approve' ||
    key === 'consultants.settlements.cancel' ||
    key === 'consultants.settlements.reverse' ||
    key === 'consultants.payouts.approve' ||
    key === 'consultants.payouts.reverse' ||
    key === 'consultants.disputes.resolve' ||
    key === 'consultants.reconcile' ||
    key === 'consultants.recovery.manage'
  ) {
    return 'HIGHLY_SENSITIVE';
  }

  if (
    key.startsWith(
      'billing.',
    ) ||
    key.startsWith(
      'payments.',
    ) ||
    key.startsWith(
      'cash_shifts.',
    ) ||
    key.startsWith(
      'panels.',
    ) ||
    key.startsWith(
      'packages.',
    ) ||
    key.startsWith(
      'coverage.',
    ) ||
    key.startsWith(
      'claims.',
    ) ||
    key.startsWith(
      'assistance.',
    ) ||
    key.startsWith(
      'welfare_zakat.',
    ) ||
    key.startsWith(
      'consultants.',
    ) ||
    key.startsWith(
      'clinical_notes.',
    ) ||
    key.startsWith(
      'encounters.',
    ) ||
    key.startsWith(
      'prescriptions.',
    ) ||
    key.startsWith(
      'pharmacy.',
    ) ||
    key ===
      'formulary.manage' ||
    key.startsWith(
      'laboratory.',
    ) ||
    key.startsWith(
      'radiology.',
    ) ||
    key.startsWith(
      'identity.',
    ) ||
    key.startsWith(
      'facilities.',
    ) ||
    key.startsWith(
      'departments.',
    ) ||
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
        key.startsWith(
          'identity.',
        )
          ? 'identity'
          : key.startsWith(
                'payments.',
              ) ||
              key.startsWith(
                'cash_shifts.',
              )
            ? 'payments'
            : key.startsWith(
                  'facilities.',
                ) ||
                key.startsWith(
                  'departments.',
                )
              ? 'facility'
              : (
                  key.split(
                    '.',
                  )[0] ??
                  'unknown'
                ),

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