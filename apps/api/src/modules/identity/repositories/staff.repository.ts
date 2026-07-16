import {
  StaffModel,
} from '@hospital-mis/database';
import type { FilterQuery, UpdateQuery } from 'mongoose';

import {
  buildStaffDisplayName,
  escapeRegex,
  normalizeCnic,
  normalizeEmail,
  normalizeEmployeeNumber,
  normalizeOptionalText,
  parseOptionalDate,
  toNullableObjectId,
  toObjectId,
} from '../identity.mapper.js';
import type {
  CreateStaffPersistenceInput,
  IdentityPageResult,
  StaffListQuery,
  StaffRecord,
  UpdateStaffInput,
} from '../identity.types.js';

export class StaffRepository {
  public async create(
    input: CreateStaffPersistenceInput,
  ): Promise<StaffRecord> {
    const created = await StaffModel.create({
      facilityId: input.facilityId,
      departmentId: input.departmentId ?? null,
      employeeNumber: normalizeEmployeeNumber(
        input.employeeNumber,
      ),
      firstName: input.firstName.trim(),
      middleName: normalizeOptionalText(input.middleName),
      lastName: input.lastName.trim(),
      displayName: input.displayName,
      cnic: normalizeCnic(input.cnic),
      phone: normalizeOptionalText(input.phone),
      email: normalizeEmail(input.email),
      designation: normalizeOptionalText(input.designation),
      professionalType: normalizeOptionalText(
        input.professionalType,
      ),
      professionalRegistrationNumber: normalizeOptionalText(
        input.professionalRegistrationNumber,
      ),
      joiningDate: input.joiningDate ?? null,
      employmentStatus: input.employmentStatus,
      isClinical: input.isClinical,
      isActive: true,
      version: 0,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    });

    return created.toObject() as StaffRecord;
  }

  public async findById(
    staffId: string,
  ): Promise<StaffRecord | null> {
    return StaffModel.findById(toObjectId(staffId, 'staffId'))
      .lean<StaffRecord>()
      .exec();
  }

  public async findByEmployeeNumber(input: {
    facilityId: string;
    employeeNumber: string;
  }): Promise<StaffRecord | null> {
    return StaffModel.findOne({
      facilityId: toObjectId(input.facilityId, 'facilityId'),
      employeeNumber: normalizeEmployeeNumber(
        input.employeeNumber,
      ),
    })
      .lean<StaffRecord>()
      .exec();
  }

  public async findByCnic(
    cnic: string,
  ): Promise<StaffRecord | null> {
    const normalizedCnic = normalizeCnic(cnic);

    if (!normalizedCnic) {
      return null;
    }

    return StaffModel.findOne({
      cnic: normalizedCnic,
    })
      .lean<StaffRecord>()
      .exec();
  }

  public async list(
    query: StaffListQuery,
  ): Promise<IdentityPageResult<StaffRecord>> {
    const filter: FilterQuery<StaffRecord> = {
      facilityId: toObjectId(query.facilityId, 'facilityId'),
    };

    if (query.departmentId) {
      filter.departmentId = toObjectId(
        query.departmentId,
        'departmentId',
      );
    }

    if (query.employmentStatus) {
      filter.employmentStatus = query.employmentStatus;
    }

    if (query.isClinical !== undefined) {
      filter.isClinical = query.isClinical;
    }

    if (query.activeOnly ?? true) {
      filter.isActive = true;
    }

    if (query.search) {
      const searchRegex = new RegExp(
        escapeRegex(query.search.trim()),
        'i',
      );

      filter.$or = [
        { employeeNumber: searchRegex },
        { displayName: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex },
        { designation: searchRegex },
        { professionalRegistrationNumber: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
      ];
    }

    const page = Math.max(1, query.page);
    const pageSize = Math.max(1, query.pageSize);
    const skip = (page - 1) * pageSize;
    const sortBy = query.sortBy ?? 'displayName';
    const sortDirection = query.sortDirection === 'desc' ? -1 : 1;

    const [items, totalItems] = await Promise.all([
      StaffModel.find(filter)
        .sort({
          [sortBy]: sortDirection,
          employeeNumber: 1,
          _id: 1,
        })
        .skip(skip)
        .limit(pageSize)
        .lean<StaffRecord[]>()
        .exec(),
      StaffModel.countDocuments(filter).exec(),
    ]);

    return {
      items,
      page,
      pageSize,
      totalItems,
      totalPages:
        totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
    };
  }

  public async updateWithVersion(
    staffId: string,
    input: UpdateStaffInput,
    actorUserId: string,
  ): Promise<StaffRecord | null> {
    const existing = await StaffModel.findOne(
      {
        _id: toObjectId(staffId, 'staffId'),
        version: input.expectedVersion,
      },
      {
        firstName: 1,
        middleName: 1,
        lastName: 1,
      },
    )
      .lean<
        Pick<
          StaffRecord,
          'firstName' | 'middleName' | 'lastName'
        >
      >()
      .exec();

    if (!existing) {
      return null;
    }

    const setValues: Record<string, unknown> = {
      updatedBy: toObjectId(actorUserId, 'actorUserId'),
    };

    if (input.departmentId !== undefined) {
      setValues.departmentId = toNullableObjectId(
        input.departmentId,
        'departmentId',
      );
    }

    if (input.firstName !== undefined) {
      setValues.firstName = input.firstName.trim();
    }

    if (input.middleName !== undefined) {
      setValues.middleName = normalizeOptionalText(
        input.middleName,
      );
    }

    if (input.lastName !== undefined) {
      setValues.lastName = input.lastName.trim();
    }

    if (input.cnic !== undefined) {
      setValues.cnic = normalizeCnic(input.cnic);
    }

    if (input.phone !== undefined) {
      setValues.phone = normalizeOptionalText(input.phone);
    }

    if (input.email !== undefined) {
      setValues.email = normalizeEmail(input.email);
    }

    if (input.designation !== undefined) {
      setValues.designation = normalizeOptionalText(
        input.designation,
      );
    }

    if (input.professionalType !== undefined) {
      setValues.professionalType = normalizeOptionalText(
        input.professionalType,
      );
    }

    if (
      input.professionalRegistrationNumber !== undefined
    ) {
      setValues.professionalRegistrationNumber =
        normalizeOptionalText(
          input.professionalRegistrationNumber,
        );
    }

    if (input.joiningDate !== undefined) {
      setValues.joiningDate = parseOptionalDate(
        input.joiningDate,
      );
    }

    if (input.employmentStatus !== undefined) {
      setValues.employmentStatus = input.employmentStatus;
    }

    if (input.isClinical !== undefined) {
      setValues.isClinical = input.isClinical;
    }

    if (input.isActive !== undefined) {
      setValues.isActive = input.isActive;
    }

    const firstName =
      input.firstName?.trim() ?? existing.firstName;
    const middleName =
      input.middleName !== undefined
        ? normalizeOptionalText(input.middleName)
        : existing.middleName;
    const lastName =
      input.lastName?.trim() ?? existing.lastName;

    setValues.displayName = buildStaffDisplayName({
      firstName,
      middleName,
      lastName,
    });

    const update: UpdateQuery<StaffRecord> = {
      $set: setValues,
      $inc: {
        version: 1,
      },
    };

    return StaffModel.findOneAndUpdate(
      {
        _id: toObjectId(staffId, 'staffId'),
        version: input.expectedVersion,
      },
      update,
      {
        new: true,
        runValidators: true,
      },
    )
      .lean<StaffRecord>()
      .exec();
  }

  public async existsInFacility(input: {
    staffId: string;
    facilityId: string;
    activeOnly?: boolean;
  }): Promise<boolean> {
    const filter: FilterQuery<StaffRecord> = {
      _id: toObjectId(input.staffId, 'staffId'),
      facilityId: toObjectId(input.facilityId, 'facilityId'),
    };

    if (input.activeOnly ?? true) {
      filter.isActive = true;
    }

    return Boolean(
      await StaffModel.exists(filter).exec(),
    );
  }
}