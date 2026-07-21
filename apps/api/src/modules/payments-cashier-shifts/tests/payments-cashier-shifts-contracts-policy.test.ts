import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  PAYMENT_CASHIER_PERMISSION_KEYS,
} from '../payments-cashier-shifts.constants.js';

import {
  PaymentCashierBreakGlassProhibitedError,
  PaymentCashierCounterScopeError,
  PaymentCashierFacilityMismatchError,
  PaymentCashierMakerCheckerError,
} from '../payments-cashier-shifts.errors.js';

import {
  collectPaymentSchema,
  createCashMovementSchema,
  createPaymentMethodConfigurationSchema,
  createRefundRequestSchema,
} from '../payments-cashier-shifts.validation.js';

import {
  maskPaymentReference,
} from '../payments-cashier-shifts.projections.js';

import {
  PaymentsCashierShiftsAccessPolicyService,
} from '../services/payments-cashier-shifts-access-policy.service.js';

import type {
  PaymentCashierActorContext,
} from '../payments-cashier-shifts.contracts.js';

const objectIdA =
  '64b000000000000000000001';

const objectIdB =
  '64b000000000000000000002';

const objectIdC =
  '64b000000000000000000003';

const objectIdD =
  '64b000000000000000000004';

const objectIdE =
  '64b000000000000000000005';

function actor(
  permissions:
    readonly string[],

  overrides:
    Partial<PaymentCashierActorContext> = {},
): PaymentCashierActorContext {
  return {
    userId:
      objectIdA,

    facilityId:
      objectIdB,

    correlationId:
      'corr-payments-0001',

    roleKeys:
      ['CASHIER'],

    permissionKeys:
      new Set(
        permissions,
      ),

    staffId:
      objectIdC,

    departmentId:
      null,

    displayName:
      'Fictional Cashier',

    active:
      true,

    assignedCounterIds:
      [objectIdD],

    ...overrides,
  };
}

describe(
  'Payments and cashier-shifts contracts and policy',
  () => {
    it(
      'validates an exactly reconciled split-tender payment',
      () => {
        const parsed =
          collectPaymentSchema.parse({
            patientAccountId:
              objectIdA,

            invoiceId:
              objectIdB,

            cashCounterId:
              objectIdC,

            cashShiftId:
              objectIdD,

            totalAmount:
              '1000.00',

            currency:
              'PKR',

            tenders: [
              {
                paymentMethodConfigurationId:
                  objectIdA,

                amount:
                  '600',
              },
              {
                paymentMethodConfigurationId:
                  objectIdB,

                amount:
                  '400.00',

                externalReference:
                  'AUTH-889900',

                maskedReference:
                  '****9900',

                referenceType:
                  'CARD_AUTHORIZATION',
              },
            ],

            allocations: [
              {
                invoiceId:
                  objectIdB,

                amount:
                  '750',
              },
            ],
          });

        expect(
          parsed.totalAmount,
        ).toBe(
          '1000',
        );

        expect(
          parsed.tenders.map(
            (tender) =>
              tender.amount,
          ),
        ).toEqual([
          '600',
          '400',
        ]);
      },
    );

    it(
      'rejects split tenders that do not equal the payment total',
      () => {
        const result =
          collectPaymentSchema.safeParse({
            patientAccountId:
              objectIdA,

            cashCounterId:
              objectIdC,

            cashShiftId:
              objectIdD,

            totalAmount:
              '1000',

            tenders: [
              {
                paymentMethodConfigurationId:
                  objectIdA,

                amount:
                  '999.99',
              },
            ],
          });

        expect(
          result.success,
        ).toBe(
          false,
        );

        if (!result.success) {
          expect(
            result.error.issues.some(
              (issue) =>
                issue.message.includes(
                  'Tender amounts',
                ),
            ),
          ).toBe(
            true,
          );
        }
      },
    );

    it(
      'rejects prohibited card data through strict tender validation',
      () => {
        const result =
          collectPaymentSchema.safeParse({
            patientAccountId:
              objectIdA,

            cashCounterId:
              objectIdC,

            cashShiftId:
              objectIdD,

            totalAmount:
              '1000',

            tenders: [
              {
                paymentMethodConfigurationId:
                  objectIdA,

                amount:
                  '1000',

                cardNumber:
                  '4111111111111111',

                cvv:
                  '123',
              },
            ],
          });

        expect(
          result.success,
        ).toBe(
          false,
        );
      },
    );

    it(
      'enforces payment-method configuration invariants',
      () => {
        const result =
          createPaymentMethodConfigurationSchema
            .safeParse({
              code:
                'CARD-MAIN',

              name:
                'Main card terminal',

              methodCode:
                'CREDIT_CARD',

              methodKind:
                'CARD',

              effectiveFrom:
                '2026-07-21T00:00:00.000Z',

              allowedCurrencies:
                ['PKR'],

              cashEquivalent:
                false,

              cardReferenceRequired:
                true,

              settlementMode:
                'DELAYED',
            });

        expect(
          result.success,
        ).toBe(
          false,
        );

        if (!result.success) {
          expect(
            result.error.issues.some(
              (issue) =>
                issue.path.includes(
                  'settlementDelayHours',
                ),
            ),
          ).toBe(
            true,
          );
        }
      },
    );

    it(
      'requires exactly one authoritative refund source',
      () => {
        const result =
          createRefundRequestSchema.safeParse({
            patientAccountId:
              objectIdA,

            paymentId:
              objectIdB,

            depositId:
              objectIdC,

            amount:
              '100',

            reasonCode:
              'DUPLICATE_PAYMENT',

            reason:
              'Duplicate payment was confirmed',
          });

        expect(
          result.success,
        ).toBe(
          false,
        );
      },
    );

    it(
      'validates cash-transfer destinations',
      () => {
        const result =
          createCashMovementSchema.safeParse({
            movementType:
              'SHIFT_TRANSFER',

            amount:
              '500',

            sourceCounterId:
              objectIdA,

            sourceShiftId:
              objectIdB,

            reasonCode:
              'HANDOVER',

            reason:
              'Cash transferred during authorized handover',
          });

        expect(
          result.success,
        ).toBe(
          false,
        );
      },
    );

    it(
      'masks external payment references in projections',
      () => {
        expect(
          maskPaymentReference(
            'AUTH-123456789',
          ),
        ).toBe(
          '**********6789',
        );

        expect(
          maskPaymentReference(
            null,
          ),
        ).toBeNull();
      },
    );

    it(
      'allows assigned cashiers with the required permission',
      () => {
        const policy =
          new PaymentsCashierShiftsAccessPolicyService();

        const decision =
          policy.require({
            actor:
              actor([
                PAYMENT_CASHIER_PERMISSION_KEYS
                  .PAYMENT_COLLECT,
              ]),

            action:
              'PAYMENT_COLLECT',

            resourceFacilityId:
              objectIdB,

            counterId:
              objectIdD,

            cashierUserId:
              objectIdA,
          });

        expect(
          decision.allowed,
        ).toBe(
          true,
        );

        expect(
          decision.accessMode,
        ).toBe(
          'COUNTER_SCOPED',
        );
      },
    );

    it(
      'blocks cross-facility access',
      () => {
        const policy =
          new PaymentsCashierShiftsAccessPolicyService();

        expect(
          () =>
            policy.require({
              actor:
                actor([
                  PAYMENT_CASHIER_PERMISSION_KEYS
                    .PAYMENT_READ,
                ]),

              action:
                'PAYMENT_READ',

              resourceFacilityId:
                objectIdE,
            }),
        ).toThrow(
          PaymentCashierFacilityMismatchError,
        );
      },
    );

    it(
      'enforces counter assignment for ordinary cashiers',
      () => {
        const policy =
          new PaymentsCashierShiftsAccessPolicyService();

        expect(
          () =>
            policy.require({
              actor:
                actor([
                  PAYMENT_CASHIER_PERMISSION_KEYS
                    .PAYMENT_COLLECT,
                ]),

              action:
                'PAYMENT_COLLECT',

              counterId:
                objectIdE,

              cashierUserId:
                objectIdA,
            }),
        ).toThrow(
          PaymentCashierCounterScopeError,
        );
      },
    );

    it(
      'blocks makers from approving their own refunds',
      () => {
        const policy =
          new PaymentsCashierShiftsAccessPolicyService();

        expect(
          () =>
            policy.require({
              actor:
                actor([
                  PAYMENT_CASHIER_PERMISSION_KEYS
                    .REFUND_APPROVE,
                ]),

              action:
                'REFUND_APPROVE',

              makerUserId:
                objectIdA,
            }),
        ).toThrow(
          PaymentCashierMakerCheckerError,
        );
      },
    );

    it(
      'does not allow break-glass to bypass sensitive approvals',
      () => {
        const policy =
          new PaymentsCashierShiftsAccessPolicyService();

        expect(
          () =>
            policy.require({
              actor:
                actor(
                  [
                    PAYMENT_CASHIER_PERMISSION_KEYS
                      .SHIFT_REOPEN,
                  ],

                  {
                    breakGlassReason:
                      'Emergency administrative access',
                  },
                ),

              action:
                'SHIFT_REOPEN',

              makerUserId:
                objectIdE,
            }),
        ).toThrow(
          PaymentCashierBreakGlassProhibitedError,
        );
      },
    );
  },
);