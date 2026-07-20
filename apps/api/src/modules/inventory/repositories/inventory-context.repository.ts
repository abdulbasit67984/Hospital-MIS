import {
  DepartmentModel,
  StaffModel,
  StoreLocationModel,
  UserModel,
  WardModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  InventoryContextRepositoryPort,
} from '../inventory.ports.js';

import type {
  InventoryActorIdentityRecord,
  InventoryDepartmentRecord,
  InventoryStaffRecord,
  InventoryWardRecord,
  StoreLocationRecord,
} from '../inventory.persistence.types.js';

function record<T>(value: unknown): T {
  return value as T;
}

export class InventoryContextRepository
implements InventoryContextRepositoryPort {
  public async findActorIdentity(
    userId: string,
  ): Promise<InventoryActorIdentityRecord | null> {
    const user = await UserModel.findById(
      toObjectId(userId, 'userId'),
    )
      .select('_id facilityId staffId status')
      .lean()
      .exec();

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
  ): Promise<InventoryStaffRecord | null> {
    const staff = await StaffModel.findOne({
      _id: toObjectId(staffId, 'staffId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    })
      .select(
        '_id facilityId departmentId displayName professionalType employmentStatus isClinical isActive',
      )
      .lean()
      .exec();

    if (staff === null) {
      return null;
    }

    return {
      staffId: staff._id.toHexString(),
      facilityId: staff.facilityId.toHexString(),
      departmentId: staff.departmentId?.toHexString() ?? null,
      displayName: staff.displayName,
      professionalType: staff.professionalType ?? null,
      employmentStatus: staff.employmentStatus,
      isClinical: staff.isClinical,
      isActive: staff.isActive,
    };
  }

  public async findDepartment(
    facilityId: string,
    departmentId: string,
  ): Promise<InventoryDepartmentRecord | null> {
    const department = await DepartmentModel.findOne({
      _id: toObjectId(departmentId, 'departmentId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    })
      .select('_id facilityId departmentType name status')
      .lean()
      .exec();

    if (department === null) {
      return null;
    }

    return {
      departmentId: department._id.toHexString(),
      facilityId: department.facilityId.toHexString(),
      departmentType: department.departmentType,
      name: department.name,
      status: department.status,
    };
  }

  public async findWard(
    facilityId: string,
    wardId: string,
  ): Promise<InventoryWardRecord | null> {
    const ward = await WardModel.findOne({
      _id: toObjectId(wardId, 'wardId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    })
      .select('_id facilityId departmentId name status')
      .lean()
      .exec();

    if (ward === null) {
      return null;
    }

    return {
      wardId: ward._id.toHexString(),
      facilityId: ward.facilityId.toHexString(),
      departmentId: ward.departmentId.toHexString(),
      name: ward.name,
      status: ward.status,
    };
  }

  public async findLocation(
    facilityId: string,
    locationId: string,
  ): Promise<StoreLocationRecord | null> {
    return record<StoreLocationRecord | null>(
      await StoreLocationModel.findOne({
        _id: toObjectId(locationId, 'locationId'),
        facilityId: toObjectId(facilityId, 'facilityId'),
      })
        .select('+deactivationReason')
        .lean()
        .exec(),
    );
  }
}