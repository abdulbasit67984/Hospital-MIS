import {
  DepartmentModel,
} from '@hospital-mis/database';

import type {
  FilterQuery,
  UpdateQuery,
} from 'mongoose';

import {
  DEPARTMENT_STATUS,
} from '../facility.constants.js';
import {
  escapeRegex,
  normalizeDepartmentCode,
  normalizeEmail,
  normalizeOptionalText,
  toNullableObjectId,
  toObjectId,
} from '../facility.mapper.js';
import type {
  CreateDepartmentInput,
  DepartmentListQuery,
  DepartmentRecord,
  PageResult,
  UpdateDepartmentInput,
} from '../facility.types.js';

export class DepartmentRepository {
  public async create(
    input: CreateDepartmentInput & {
      createdBy: string;
    },
  ): Promise<DepartmentRecord> {
    const created =
      await DepartmentModel.create({
        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        parentDepartmentId:
          toNullableObjectId(
            input.parentDepartmentId,
            'parentDepartmentId',
          ),

        managerStaffId:
          toNullableObjectId(
            input.managerStaffId,
            'managerStaffId',
          ),

        code:
          normalizeDepartmentCode(
            input.code,
          ),

        name:
          input.name.trim(),

        description:
          normalizeOptionalText(
            input.description,
          ),

        departmentType:
          input.departmentType,

        isClinical:
          input.isClinical,

        location:
          normalizeOptionalText(
            input.location,
          ),

        costCenterCode:
          normalizeOptionalText(
            input.costCenterCode,
          )?.toLocaleUpperCase(
            'en-US',
          ) ?? null,

        contact: {
          phone:
            normalizeOptionalText(
              input.contact.phone,
            ),

          extension:
            normalizeOptionalText(
              input.contact.extension,
            ),

          email:
            normalizeEmail(
              input.contact.email,
            ),
        },

        status:
          DEPARTMENT_STATUS.ACTIVE,

        deactivatedAt:
          null,

        deactivatedBy:
          null,

        deactivationReason:
          null,

        version:
          0,

        createdBy:
          toObjectId(
            input.createdBy,
            'createdBy',
          ),

        updatedBy:
          toObjectId(
            input.createdBy,
            'createdBy',
          ),
      });

    return created.toObject() as DepartmentRecord;
  }

  public async findById(
    departmentId: string,
  ): Promise<DepartmentRecord | null> {
    return DepartmentModel.findById(
      toObjectId(
        departmentId,
        'departmentId',
      ),
    )
      .lean<DepartmentRecord>()
      .exec();
  }

  public async findByIdInFacility(
    departmentId: string,
    facilityId: string,
  ): Promise<DepartmentRecord | null> {
    return DepartmentModel.findOne({
      _id:
        toObjectId(
          departmentId,
          'departmentId',
        ),

      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    })
      .lean<DepartmentRecord>()
      .exec();
  }

  public async findByCode(
    facilityId: string,
    code: string,
  ): Promise<DepartmentRecord | null> {
    return DepartmentModel.findOne({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      code:
        normalizeDepartmentCode(
          code,
        ),
    })
      .lean<DepartmentRecord>()
      .exec();
  }

  public async list(
    query: DepartmentListQuery,
  ): Promise<PageResult<DepartmentRecord>> {
    const filter:
      FilterQuery<DepartmentRecord> = {
        facilityId:
          toObjectId(
            query.facilityId,
            'facilityId',
          ),
      };

    if (
      query.parentDepartmentId !==
      undefined
    ) {
      filter.parentDepartmentId =
        toNullableObjectId(
          query.parentDepartmentId,
          'parentDepartmentId',
        );
    }

    if (query.departmentType) {
      filter.departmentType =
        query.departmentType;
    }

    if (query.status) {
      filter.status =
        query.status;
    }

    if (
      query.isClinical !==
      undefined
    ) {
      filter.isClinical =
        query.isClinical;
    }

    if (query.search) {
      const search =
        new RegExp(
          escapeRegex(
            query.search.trim(),
          ),
          'i',
        );

      filter.$or = [
        {
          code: search,
        },
        {
          name: search,
        },
        {
          description: search,
        },
        {
          location: search,
        },
        {
          costCenterCode: search,
        },
      ];
    }

    const page =
      Math.max(1, query.page);

    const pageSize =
      Math.max(
        1,
        query.pageSize,
      );

    const skip =
      (page - 1) * pageSize;

    const direction =
      query.sortDirection ===
      'desc'
        ? -1
        : 1;

    const [
      items,
      totalItems,
    ] = await Promise.all([
      DepartmentModel.find(
        filter,
      )
        .sort({
          [query.sortBy]:
            direction,
          code: 1,
          _id: 1,
        })
        .skip(skip)
        .limit(pageSize)
        .lean<DepartmentRecord[]>()
        .exec(),

      DepartmentModel.countDocuments(
        filter,
      ).exec(),
    ]);

    return {
      items,
      page,
      pageSize,
      totalItems,
      totalPages:
        totalItems === 0
          ? 0
          : Math.ceil(
              totalItems /
                pageSize,
            ),
    };
  }

  public async updateWithVersion(
    departmentId: string,
    facilityId: string,
    input: UpdateDepartmentInput,
    actorUserId: string,
  ): Promise<DepartmentRecord | null> {
    const setValues:
      Record<string, unknown> = {
        updatedBy:
          toObjectId(
            actorUserId,
            'actorUserId',
          ),
      };

    if (
      input.parentDepartmentId !==
      undefined
    ) {
      setValues.parentDepartmentId =
        toNullableObjectId(
          input.parentDepartmentId,
          'parentDepartmentId',
        );
    }

    if (
      input.managerStaffId !==
      undefined
    ) {
      setValues.managerStaffId =
        toNullableObjectId(
          input.managerStaffId,
          'managerStaffId',
        );
    }

    if (input.name !== undefined) {
      setValues.name =
        input.name.trim();
    }

    if (
      input.description !==
      undefined
    ) {
      setValues.description =
        normalizeOptionalText(
          input.description,
        );
    }

    if (
      input.departmentType !==
      undefined
    ) {
      setValues.departmentType =
        input.departmentType;
    }

    if (
      input.isClinical !==
      undefined
    ) {
      setValues.isClinical =
        input.isClinical;
    }

    if (
      input.location !==
      undefined
    ) {
      setValues.location =
        normalizeOptionalText(
          input.location,
        );
    }

    if (
      input.costCenterCode !==
      undefined
    ) {
      setValues.costCenterCode =
        normalizeOptionalText(
          input.costCenterCode,
        )?.toLocaleUpperCase(
          'en-US',
        ) ?? null;
    }

    if (
      input.contact !==
      undefined
    ) {
      setValues.contact = {
        phone:
          normalizeOptionalText(
            input.contact.phone,
          ),

        extension:
          normalizeOptionalText(
            input.contact.extension,
          ),

        email:
          normalizeEmail(
            input.contact.email,
          ),
      };
    }

    const update:
      UpdateQuery<DepartmentRecord> = {
        $set: setValues,

        $inc: {
          version: 1,
        },
      };

    return DepartmentModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            departmentId,
            'departmentId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,
      },
      update,
      {
        new: true,
        runValidators: true,
      },
    )
      .lean<DepartmentRecord>()
      .exec();
  }

  public async changeStatus(
    input: {
      departmentId: string;
      facilityId: string;
      expectedVersion: number;
      status:
        DepartmentRecord['status'];
      actorUserId: string;
      reason: string;
      changedAt: Date;
    },
  ): Promise<DepartmentRecord | null> {
    const isInactive =
      input.status ===
      DEPARTMENT_STATUS.INACTIVE;

    return DepartmentModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.departmentId,
            'departmentId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,
      },
      {
        $set: {
          status:
            input.status,

          deactivatedAt:
            isInactive
              ? input.changedAt
              : null,

          deactivatedBy:
            isInactive
              ? toObjectId(
                  input.actorUserId,
                  'actorUserId',
                )
              : null,

          deactivationReason:
            isInactive
              ? input.reason.trim()
              : null,

          updatedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),
        },

        $inc: {
          version: 1,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    )
      .lean<DepartmentRecord>()
      .exec();
  }

  public async countActiveChildren(
    departmentId: string,
    facilityId: string,
  ): Promise<number> {
    return DepartmentModel.countDocuments({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      parentDepartmentId:
        toObjectId(
          departmentId,
          'departmentId',
        ),

      status:
        DEPARTMENT_STATUS.ACTIVE,
    }).exec();
  }
}