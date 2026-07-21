import {
  Types,
  type ClientSession,
} from 'mongoose';

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  PAYMENT_CASHIER_PERMISSION_KEYS,
} from '../payments-cashier-shifts.constants.js';

import {
  ActiveCashierShiftConflictError,
  PaymentCashierAccessDeniedError,
} from '../payments-cashier-shifts.errors.js';

import type {
  PaymentCashierActorContext,
} from '../payments-cashier-shifts.contracts.js';

import type {
  CashCounterRecord,
  CashierShiftRecord,
  PaymentMethodConfigurationRecord,
} from '../payments-cashier-shifts.persistence.types.js';

import type {
  CashierShiftExtendedRepositoryPort,
} from '../repositories/cashier-shift.repository.js';

import type {
  PaymentConfigurationRepository,
} from '../repositories/payment-configuration.repository.js';

import {
  PaymentsCashierShiftsAccessPolicyService,
} from '../services/payments-cashier-shifts-access-policy.service.js';

import {
  CashierShiftStateMachineService,
} from '../services/cashier-shift-state-machine.service.js';

import {
  PaymentCashierCommandSupport,
} from '../services/payment-cashier-command-support.js';

import {
  PaymentMethodConfigurationService,
} from '../services/payment-method-configuration.service.js';

import {
  CashCounterService,
} from '../services/cash-counter.service.js';

import {
  CashierShiftService,
} from '../services/cashier-shift.service.js';

const facilityId = '64b000000000000000000001';
const actorUserId = '64b000000000000000000002';
const actorStaffId = '64b000000000000000000003';
const counterId = '64b000000000000000000004';
const paymentMethodId = '64b000000000000000000005';
const supervisorId = '64b000000000000000000006';

function objectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

function metadata() {
  return {
    facilityId: objectId(facilityId),
    transactionId: 'tx-test-0001',
    correlationId: 'corr-test-0001',
    schemaVersion: 1,
    version: 0,
    createdBy: objectId(actorUserId),
    updatedBy: objectId(actorUserId),
    createdAt: new Date('2026-07-21T08:00:00.000Z'),
    updatedAt: new Date('2026-07-21T08:00:00.000Z'),
  };
}

function actor(
  permissions: readonly string[],
): PaymentCashierActorContext {
  return {
    userId: actorUserId,
    facilityId,
    correlationId: 'corr-test-0001',
    roleKeys: ['CASHIER'],
    permissionKeys: new Set(permissions),
    staffId: actorStaffId,
    departmentId: null,
    displayName: 'Fictional Cashier',
    active: true,
    assignedCounterIds: [counterId],
  };
}

function paymentMethodRecord(): PaymentMethodConfigurationRecord {
  return {
    ...metadata(),
    _id: objectId(paymentMethodId),
    code: 'CASH',
    name: 'Cash',
    description: null,
    methodCode: 'CASH',
    methodKind: 'CASH',
    active: true,
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveThrough: null,
    allowedCurrencies: ['PKR'],
    externalReferenceRequired: false,
    bankReferenceRequired: false,
    cardReferenceRequired: false,
    cashEquivalent: true,
    refundEligible: true,
    reversalEligible: true,
    settlementMode: 'IMMEDIATE',
    settlementDelayHours: null,
    permissionCodes: [],
    cashLedgerAccountId: null,
    clearingLedgerAccountId: null,
    receivableLedgerAccountId: null,
    externalProviderCode: null,
    requiresOpenCashierShift: true,
    deactivatedAt: null,
    deactivatedBy: null,
    deactivationReason: null,
  };
}

function counterRecord(): CashCounterRecord {
  return {
    ...metadata(),
    _id: objectId(counterId),
    counterCode: 'BILLING-01',
    name: 'Main Billing Counter',
    location: 'Ground Floor',
    departmentId: null,
    counterType: 'BILLING',
    active: true,
    assignedUserIds: [objectId(actorUserId)],
    allowedPaymentMethodConfigurationIds: [objectId(paymentMethodId)],
    currency: 'PKR',
    cashHoldingLimit: Types.Decimal128.fromString('500000'),
    openingFloatRequired: true,
    minimumOpeningFloat: Types.Decimal128.fromString('1000'),
    maximumOpeningFloat: Types.Decimal128.fromString('10000'),
    activeShiftPolicy: 'CASHIER_AND_COUNTER',
    supervisorApprovalRequiredForClose: true,
    negativeExpectedCashAllowed: false,
    deactivatedAt: null,
    deactivatedBy: null,
    deactivationReason: null,
  };
}

function commandSupport(): PaymentCashierCommandSupport {
  return new PaymentCashierCommandSupport(
    {
      begin: vi.fn(async () => ({
        state: 'ACQUIRED' as const,
        operationKey: 'operation-key',
      })),
      complete: vi.fn(async () => undefined),
      fail: vi.fn(async () => undefined),
    },
    {
      withLock: vi.fn(async (_resource, _owner, work) => work()),
    },
    {
      run: vi.fn(async (_context, work) =>
        work({} as ClientSession, 'tx-test-0001'),
      ),
    },
    {
      append: vi.fn(async (input) => ({
        ...input,
        _id: new Types.ObjectId(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    },
    {
      next: vi.fn(async (_facility, key) =>
        key.includes('history') ? 'HIST-000001' : 'SHIFT-000001',
      ),
    },
  );
}

function commonInfrastructure() {
  return {
    accessPolicy: new PaymentsCashierShiftsAccessPolicyService(),
    commandSupport: commandSupport(),
    audit: {
      record: vi.fn(async () => undefined),
    },
    outbox: {
      publish: vi.fn(async () => undefined),
    },
    realtime: {
      publishMinimumNecessary: vi.fn(async () => undefined),
    },
    clock: {
      now: () => new Date('2026-07-21T08:00:00.000Z'),
    },
  };
}

function configurationRepository(): PaymentConfigurationRepository {
  const method = paymentMethodRecord();
  const counter = counterRecord();

  return {
    findPaymentMethodById: vi.fn(async () => method),
    findPaymentMethodByCode: vi.fn(async () => method),
    listPaymentMethods: vi.fn(async () => ({
      items: [method],
      page: 1,
      pageSize: 25,
      totalItems: 1,
      totalPages: 1,
    })),
    createPaymentMethod: vi.fn(async () => method),
    updatePaymentMethod: vi.fn(async () => method),
    updatePaymentMethodWithMetadata: vi.fn(async () => ({
      ...method,
      version: method.version + 1,
      updatedAt: new Date(),
    })),
    findCounterById: vi.fn(async () => counter),
    findCounterByCode: vi.fn(async () => counter),
    listCounters: vi.fn(async () => ({
      items: [counter],
      page: 1,
      pageSize: 25,
      totalItems: 1,
      totalPages: 1,
    })),
    createCounter: vi.fn(async () => counter),
    updateCounter: vi.fn(async () => counter),
    updateCounterWithMetadata: vi.fn(async () => ({
      ...counter,
      version: counter.version + 1,
      updatedAt: new Date(),
    })),
    departmentExists: vi.fn(async () => true),
    ledgerAccountsExist: vi.fn(async () => true),
    activeUsersExist: vi.fn(async () => true),
    activePaymentMethodsExist: vi.fn(async () => true),
  };
}

function shiftsRepository(): CashierShiftExtendedRepositoryPort {
  const shifts: CashierShiftRecord[] = [];

  return {
    findById: vi.fn(async (_facility, shiftId) =>
      shifts.find((shift) => shift._id.toHexString() === shiftId) ?? null,
    ),
    findActiveForPolicy: vi.fn(async () =>
      shifts.find((shift) =>
        ['OPEN', 'SUSPENDED', 'CLOSING_IN_PROGRESS'].includes(shift.status),
      ) ?? null,
    ),
    list: vi.fn(async () => ({
      items: shifts,
      page: 1,
      pageSize: 25,
      totalItems: shifts.length,
      totalPages: shifts.length === 0 ? 0 : 1,
    })),
    create: vi.fn(async (input) => {
      const created: CashierShiftRecord = {
        ...input,
        _id: new Types.ObjectId(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      shifts.push(created);
      return created;
    }),
    update: vi.fn(async () => null),
    updateWithMetadata: vi.fn(async (
      _facility,
      shiftId,
      expectedVersion,
      update,
    ) => {
      const index = shifts.findIndex(
        (shift) => shift._id.toHexString() === shiftId,
      );
      const current = shifts[index];

      if (current === undefined || current.version !== expectedVersion) {
        return null;
      }

      const updated = {
        ...current,
        ...update,
        version: current.version + 1,
        updatedAt: new Date(),
      } as CashierShiftRecord;
      shifts[index] = updated;
      return updated;
    }),
    createReconciliation: vi.fn(async () => {
      throw new Error('Not used in Batch 3 tests');
    }),
    findReconciliationByShift: vi.fn(async () => null),
    updateReconciliation: vi.fn(async () => null),
    countActiveForCounter: vi.fn(async () =>
      shifts.filter((shift) =>
        ['OPEN', 'SUSPENDED', 'CLOSING_IN_PROGRESS'].includes(shift.status),
      ).length,
    ),
    countActiveForCashier: vi.fn(async () =>
      shifts.filter((shift) =>
        ['OPEN', 'SUSPENDED', 'CLOSING_IN_PROGRESS'].includes(shift.status),
      ).length,
    ),
  };
}

describe('payment configuration, counters, and cashier shifts', () => {
  it('creates a facility payment method through an audited transaction', async () => {
    const infrastructure = commonInfrastructure();
    const service = new PaymentMethodConfigurationService({
      repository: configurationRepository(),
      ...infrastructure,
    });

    const result = await service.create(
      {
        actor: actor([
          PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_METHOD_MANAGE,
        ]),
        idempotencyKey: 'payment-method-create-0001',
      },
      {
        code: 'CASH',
        name: 'Cash',
        methodCode: 'CASH',
        methodKind: 'CASH',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        allowedCurrencies: ['PKR'],
        cashEquivalent: true,
        settlementMode: 'IMMEDIATE',
      },
    );

    expect(result.code).toBe('CASH');
    expect(infrastructure.audit.record).toHaveBeenCalledOnce();
    expect(infrastructure.outbox.publish).toHaveBeenCalledOnce();
  });

  it('creates a counter only after authoritative references are accepted', async () => {
    const infrastructure = commonInfrastructure();
    const repository = configurationRepository();
    const service = new CashCounterService({
      repository,
      shifts: shiftsRepository(),
      ...infrastructure,
    });

    const result = await service.create(
      {
        actor: actor([
          PAYMENT_CASHIER_PERMISSION_KEYS.COUNTER_MANAGE,
        ]),
        idempotencyKey: 'counter-create-0001',
      },
      {
        counterCode: 'BILLING-01',
        name: 'Main Billing Counter',
        location: 'Ground Floor',
        counterType: 'BILLING',
        assignedUserIds: [actorUserId],
        allowedPaymentMethodConfigurationIds: [paymentMethodId],
        cashHoldingLimit: '500000',
        minimumOpeningFloat: '1000',
        maximumOpeningFloat: '10000',
      },
    );

    expect(result.counterCode).toBe('BILLING-01');
    expect(repository.activeUsersExist).toHaveBeenCalled();
    expect(repository.activePaymentMethodsExist).toHaveBeenCalled();
  });

  it('opens a cashier shift with server-authoritative counter policy', async () => {
    const infrastructure = commonInfrastructure();
    const shifts = shiftsRepository();
    const service = new CashierShiftService({
      configuration: configurationRepository(),
      shifts,
      approvals: {
        createRequest: vi.fn(),
        requireApproved: vi.fn(),
      },
      sequences: {
        next: vi.fn(async () => 'SHIFT-000001'),
      },
      stateMachine: new CashierShiftStateMachineService(),
      ...infrastructure,
    });

    const result = await service.open(
      {
        actor: actor([
          PAYMENT_CASHIER_PERMISSION_KEYS.SHIFT_OPEN,
        ]),
        idempotencyKey: 'shift-open-0001',
      },
      {
        cashCounterId: counterId,
        openingFloat: '5000',
        currency: 'PKR',
        supervisorUserId: supervisorId,
      },
    );

    expect(result.status).toBe('OPEN');
    expect(result.openingFloat).toBe('5000');
    expect(result.expectedCash).toBe('5000');
    expect(result.cashCounterId).toBe(counterId);
  });

  it('prevents unauthorized users from opening a shift', async () => {
    const infrastructure = commonInfrastructure();
    const service = new CashierShiftService({
      configuration: configurationRepository(),
      shifts: shiftsRepository(),
      approvals: {
        createRequest: vi.fn(),
        requireApproved: vi.fn(),
      },
      sequences: {
        next: vi.fn(async () => 'SHIFT-000001'),
      },
      stateMachine: new CashierShiftStateMachineService(),
      ...infrastructure,
    });

    await expect(
      service.open(
        {
          actor: actor([]),
          idempotencyKey: 'shift-open-unauthorized-0001',
        },
        {
          cashCounterId: counterId,
          openingFloat: '5000',
        },
      ),
    ).rejects.toThrow(PaymentCashierAccessDeniedError);
  });

  it('prevents duplicate active shifts under the configured policy', async () => {
    const infrastructure = commonInfrastructure();
    const shifts = shiftsRepository();
    const service = new CashierShiftService({
      configuration: configurationRepository(),
      shifts,
      approvals: {
        createRequest: vi.fn(),
        requireApproved: vi.fn(),
      },
      sequences: {
        next: vi.fn(async () => 'SHIFT-000001'),
      },
      stateMachine: new CashierShiftStateMachineService(),
      ...infrastructure,
    });
    const commandActor = actor([
      PAYMENT_CASHIER_PERMISSION_KEYS.SHIFT_OPEN,
    ]);

    await service.open(
      {
        actor: commandActor,
        idempotencyKey: 'shift-open-first-0001',
      },
      {
        cashCounterId: counterId,
        openingFloat: '5000',
      },
    );

    await expect(
      service.open(
        {
          actor: commandActor,
          idempotencyKey: 'shift-open-second-0001',
        },
        {
          cashCounterId: counterId,
          openingFloat: '5000',
        },
      ),
    ).rejects.toThrow(ActiveCashierShiftConflictError);
  });

  it('suspends and resumes a shift through explicit lifecycle transitions', async () => {
    const infrastructure = commonInfrastructure();
    const shifts = shiftsRepository();
    const service = new CashierShiftService({
      configuration: configurationRepository(),
      shifts,
      approvals: {
        createRequest: vi.fn(),
        requireApproved: vi.fn(),
      },
      sequences: {
        next: vi.fn(async () => 'SHIFT-000001'),
      },
      stateMachine: new CashierShiftStateMachineService(),
      ...infrastructure,
    });
    const commandActor = actor([
      PAYMENT_CASHIER_PERMISSION_KEYS.SHIFT_OPEN,
      PAYMENT_CASHIER_PERMISSION_KEYS.SHIFT_SUSPEND,
      PAYMENT_CASHIER_PERMISSION_KEYS.SHIFT_RESUME,
    ]);

    const opened = await service.open(
      {
        actor: commandActor,
        idempotencyKey: 'shift-open-lifecycle-0001',
      },
      {
        cashCounterId: counterId,
        openingFloat: '5000',
      },
    );

    const suspended = await service.suspend(
      {
        actor: commandActor,
        idempotencyKey: 'shift-suspend-0001',
      },
      opened.id,
      {
        expectedVersion: opened.version,
        reason: 'Cashier temporarily leaving the counter',
      },
    );

    const resumed = await service.resume(
      {
        actor: commandActor,
        idempotencyKey: 'shift-resume-0001',
      },
      opened.id,
      {
        expectedVersion: suspended.version,
        reason: 'Cashier returned to the assigned counter',
      },
    );

    expect(suspended.status).toBe('SUSPENDED');
    expect(resumed.status).toBe('OPEN');
  });
});