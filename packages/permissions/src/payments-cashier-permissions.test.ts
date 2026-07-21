import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  isPermissionKey,
  permissionDefinitions,
  permissionKeys,
  requirePermissionKey,
} from './index.js';

const paymentPermissionKeys = [
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
] as const;

const highlySensitiveKeys = [
  'payments.methods.manage',
  'payments.counters.manage',
  'payments.collect_manual',
  'payments.reallocate',
  'payments.deposits.transfer',
  'payments.deposits.forfeit',
  'payments.receipts.reprint',
  'payments.refunds.approve',
  'payments.refunds.process',
  'payments.refunds.reverse',
  'payments.reversals.approve',
  'payments.reversals.process',
  'payments.cash_movements.approve',
  'payments.cash_movements.post',
  'payments.reconciliation.override',
  'payments.recovery.manage',
  'cash_shifts.reopen',
  'cash_shifts.approve_variance',
] as const;

describe(
  'Payments and cashier-shift permissions',
  () => {
    it(
      'registers every granular permission exactly once',
      () => {
        for (
          const permission of
          paymentPermissionKeys
        ) {
          expect(
            permissionKeys,
          ).toContain(
            permission,
          );

          expect(
            isPermissionKey(
              permission,
            ),
          ).toBe(
            true,
          );

          expect(
            requirePermissionKey(
              permission,
            ),
          ).toBe(
            permission,
          );

          expect(
            permissionKeys.filter(
              (candidate) =>
                candidate ===
                permission,
            ),
          ).toHaveLength(
            1,
          );
        }
      },
    );

    it(
      'maps payment and cashier-shift permissions to the payments module',
      () => {
        const definitions =
          permissionDefinitions.filter(
            (definition) =>
              paymentPermissionKeys.includes(
                definition.key as
                  (typeof paymentPermissionKeys)[number],
              ),
          );

        expect(
          definitions,
        ).toHaveLength(
          paymentPermissionKeys.length,
        );

        expect(
          new Set(
            definitions.map(
              (definition) =>
                definition.module,
            ),
          ),
        ).toEqual(
          new Set([
            'payments',
          ]),
        );
      },
    );

    it(
      'marks approvals, corrections, reprints, overrides, and recovery highly sensitive',
      () => {
        const sensitivity =
          new Map(
            permissionDefinitions.map(
              (definition) => [
                definition.key,
                definition.sensitivity,
              ],
            ),
          );

        for (
          const permission of
          highlySensitiveKeys
        ) {
          expect(
            sensitivity.get(
              permission,
            ),
          ).toBe(
            'HIGHLY_SENSITIVE',
          );
        }
      },
    );

    it(
      'does not register destructive payment-history permissions',
      () => {
        expect(
          isPermissionKey(
            'payments.delete',
          ),
        ).toBe(
          false,
        );

        expect(
          isPermissionKey(
            'payments.receipts.edit',
          ),
        ).toBe(
          false,
        );

        expect(
          isPermissionKey(
            'cash_shifts.delete',
          ),
        ).toBe(
          false,
        );

        expect(
          isPermissionKey(
            'payments.refunds.self_approve',
          ),
        ).toBe(
          false,
        );
      },
    );
  },
);