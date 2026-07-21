import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  PAYMENT_CASHIER_PERMISSION_KEYS,
} from '../payments-cashier-shifts.constants.js';

import {
  PAYMENTS_CASHIER_ROUTE_MANIFEST,
} from '../payments-cashier-shifts.routes.js';

import {
  paymentCashierIdempotencyHeadersSchema,
  reprintReceiptSchema,
} from '../payments-cashier-shifts.validation.js';

import {
  PaymentCashierRealtimeAdapter,
} from '../../../infrastructure/payments-cashier-shifts-runtime.adapters.js';

const requiredDomains = [
  '/payment-methods',
  '/counters',
  '/shifts',
  '/payment-intents',
  '/payments',
  '/deposits',
  '/refund-requests',
  '/payment-reversals',
  '/cash-movements',
  '/reports/operational-exceptions',
  '/recovery/run',
] as const;

describe('Payments and cashier-shifts HTTP completion', () => {
  it('publishes a unique authenticated route manifest for every major domain', () => {
    const routeKeys = PAYMENTS_CASHIER_ROUTE_MANIFEST.map(
      ([method, path]) => `${method}:${path}`,
    );

    expect(new Set(routeKeys).size).toBe(routeKeys.length);

    for (const domain of requiredDomains) {
      expect(
        PAYMENTS_CASHIER_ROUTE_MANIFEST.some(([, path]) => path.startsWith(domain)),
      ).toBe(true);
    }
  });

  it('requires idempotency for every manifest mutation except controlled recovery', () => {
    for (const [method, path, , idempotent] of PAYMENTS_CASHIER_ROUTE_MANIFEST) {
      if (method === 'POST' && path !== '/recovery/run') {
        expect(idempotent).toBe(true);
      }
    }
  });

  it('registers the final module permissions used by receipts, reports, and recovery', () => {
    expect(PAYMENT_CASHIER_PERMISSION_KEYS.RECEIPT_REPRINT).toBe('payments.receipts.reprint');
    expect(PAYMENT_CASHIER_PERMISSION_KEYS.REPORT_EXPORT).toBe('payments.reports.export');
    expect(PAYMENT_CASHIER_PERMISSION_KEYS.RECOVERY_MANAGE).toBe('payments.recovery.manage');
  });

  it('validates strict receipt reprint reasons and output formats', () => {
    expect(reprintReceiptSchema.safeParse({
      copyType: 'DUPLICATE',
      outputFormat: 'PDF',
      reason: 'Patient requested an authorized duplicate receipt',
    }).success).toBe(true);

    expect(reprintReceiptSchema.safeParse({
      copyType: 'DUPLICATE',
      outputFormat: 'EMAIL',
      reason: 'Invalid output format',
    }).success).toBe(false);
  });

  it('rejects mutation headers without an idempotency key', () => {
    expect(paymentCashierIdempotencyHeadersSchema.safeParse({}).success).toBe(false);
    expect(paymentCashierIdempotencyHeadersSchema.safeParse({
      'idempotency-key': 'payments-test-0001',
    }).success).toBe(true);
  });

  it('blocks sensitive data from realtime payment messages', async () => {
    const adapter = new PaymentCashierRealtimeAdapter(async () => undefined);

    await expect(adapter.publishMinimumNecessary({
      facilityId: '64b000000000000000000001',
      eventType: 'payments.payment.changed',
      entityId: '64b000000000000000000002',
      occurredAt: '2026-07-21T00:00:00.000Z',
    })).resolves.toBeUndefined();

    await expect(adapter.publishMinimumNecessary({
      facilityId: '64b000000000000000000001',
      eventType: 'payments.payment.changed',
      entityId: '64b000000000000000000002',
      occurredAt: '2026-07-21T00:00:00.000Z',
      externalReference: 'BANK-SECRET',
    } as never)).rejects.toThrow(/prohibited field/iu);
  });
});