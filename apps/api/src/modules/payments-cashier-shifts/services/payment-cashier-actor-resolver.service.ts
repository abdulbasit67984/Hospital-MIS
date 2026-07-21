import {
  PaymentCashierActorInactiveError,
  PaymentCashierFacilityMismatchError,
} from '../payments-cashier-shifts.errors.js';

import type {
  PaymentCashierActorResolverInput,
  PaymentCashierActorResolverPort,
} from '../payments-cashier-shifts.ports.js';

import type {
  PaymentCashierActorContext,
} from '../payments-cashier-shifts.contracts.js';

import type {
  PaymentCashierRoleContextRepositoryPort,
} from '../repositories/payment-cashier-context.repository.js';

export class PaymentCashierActorResolverService
implements PaymentCashierActorResolverPort {
  public constructor(
    private readonly repository:
      PaymentCashierRoleContextRepositoryPort,
  ) {}

  public async resolve(
    input: PaymentCashierActorResolverInput,
  ): Promise<PaymentCashierActorContext> {
    const identity = await this.repository.findActorIdentity(input.userId);

    if (
      identity === null ||
      identity.status !== 'ACTIVE' ||
      identity.staffId === null
    ) {
      throw new PaymentCashierActorInactiveError();
    }

    if (
      identity.facilityId !== null &&
      identity.facilityId !== input.facilityId
    ) {
      throw new PaymentCashierFacilityMismatchError();
    }

    const staff = await this.repository.findStaff(
      input.facilityId,
      identity.staffId,
    );

    if (
      staff === null ||
      staff.facilityId !== input.facilityId ||
      !staff.isActive ||
      staff.employmentStatus !== 'ACTIVE'
    ) {
      throw new PaymentCashierActorInactiveError();
    }

    const [roleKeys, assignedCounterIds] = await Promise.all([
      this.repository.listRoleKeys(input.facilityId, input.userId),
      this.repository.listAssignedCounterIds(input.facilityId, input.userId),
    ]);

    return {
      userId: input.userId,
      facilityId: input.facilityId,
      correlationId: input.correlationId,
      roleKeys,
      permissionKeys: new Set(input.permissions),
      staffId: staff.staffId,
      departmentId: staff.departmentId,
      displayName: staff.displayName,
      active: true,
      assignedCounterIds,
      ...(input.ipAddress === undefined
        ? {}
        : { ipAddress: input.ipAddress }),
      ...(input.userAgent === undefined
        ? {}
        : { userAgent: input.userAgent }),
      ...(input.breakGlassReason === undefined
        ? {}
        : { breakGlassReason: input.breakGlassReason }),
    };
  }
}