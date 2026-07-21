import {
  CashCounterModel,
  RoleModel,
  StaffModel,
  UserModel,
  UserRoleModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  PaymentCashierContextRepositoryPort,
} from '../payments-cashier-shifts.ports.js';

import type {
  PaymentActorIdentityRecord,
  PaymentStaffRecord,
} from '../payments-cashier-shifts.persistence.types.js';

function record<T>(value: unknown): T {
  return value as T;
}

export interface PaymentCashierRoleContextRepositoryPort
extends PaymentCashierContextRepositoryPort {
  listRoleKeys(
    facilityId: string,
    userId: string,
  ): Promise<string[]>;
}

export class MongoPaymentCashierContextRepository
implements PaymentCashierRoleContextRepositoryPort {
  public async findActorIdentity(
    userId: string,
  ): Promise<PaymentActorIdentityRecord | null> {
    const user = record<
      | {
          _id: { toHexString(): string };
          facilityId: { toHexString(): string } | null;
          staffId: { toHexString(): string } | null;
          status: string;
        }
      | null
    >(
      await UserModel.findOne({
        _id: toObjectId(userId, 'userId'),
      })
        .select('_id facilityId staffId status')
        .lean()
        .exec(),
    );

    if (user === null) {
      return null;
    }

    return {
      userId: user._id.toHexString(),
      facilityId: user.facilityId?.toHexString() ?? null,
      staffId: user.staffId?.toHexString() ?? null,
      status: user.status,
    };
  }

  public async findStaff(
    facilityId: string,
    staffId: string,
  ): Promise<PaymentStaffRecord | null> {
    const staff = record<
      | {
          _id: { toHexString(): string };
          facilityId: { toHexString(): string };
          departmentId: { toHexString(): string } | null;
          displayName: string;
          employmentStatus: string;
          isActive: boolean;
        }
      | null
    >(
      await StaffModel.findOne({
        _id: toObjectId(staffId, 'staffId'),
        facilityId: toObjectId(facilityId, 'facilityId'),
      })
        .select(
          '_id facilityId departmentId displayName employmentStatus isActive',
        )
        .lean()
        .exec(),
    );

    if (staff === null) {
      return null;
    }

    return {
      staffId: staff._id.toHexString(),
      userId: '',
      facilityId: staff.facilityId.toHexString(),
      departmentId: staff.departmentId?.toHexString() ?? null,
      displayName: staff.displayName,
      employmentStatus: staff.employmentStatus,
      isActive: staff.isActive,
    };
  }

  public async listAssignedCounterIds(
    facilityId: string,
    userId: string,
  ): Promise<string[]> {
    const counters = record<
      Array<{
        _id: { toHexString(): string };
      }>
    >(
      await CashCounterModel.find({
        facilityId: toObjectId(facilityId, 'facilityId'),
        active: true,
        assignedUserIds: toObjectId(userId, 'userId'),
      })
        .select('_id')
        .lean()
        .exec(),
    );

    return counters.map((counter) => counter._id.toHexString());
  }

  public async listRoleKeys(
    facilityId: string,
    userId: string,
  ): Promise<string[]> {
    const facilityObjectId = toObjectId(facilityId, 'facilityId');
    const now = new Date();

    const assignments = record<
      Array<{
        roleId: { toHexString(): string };
      }>
    >(
      await UserRoleModel.find({
        userId: toObjectId(userId, 'userId'),
        isActive: true,
        $and: [
          {
            $or: [
              { facilityId: null },
              { facilityId: facilityObjectId },
            ],
          },
          {
            $or: [
              { expiresAt: null },
              { expiresAt: { $gt: now } },
            ],
          },
        ],
      })
        .select('roleId')
        .lean()
        .exec(),
    );

    if (assignments.length === 0) {
      return [];
    }

    const roleIds = assignments.map((assignment) =>
      toObjectId(assignment.roleId.toHexString(), 'roleId'),
    );

    const roles = record<Array<{ code: string }>>(
      await RoleModel.find({
        _id: { $in: roleIds },
        isActive: true,
        $or: [
          { scope: 'GLOBAL', facilityId: null },
          { scope: 'FACILITY', facilityId: facilityObjectId },
        ],
      })
        .select('code')
        .lean()
        .exec(),
    );

    return [...new Set(roles.map((role) => role.code))].sort();
  }
}