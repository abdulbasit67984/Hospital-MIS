import {
  DepartmentModel,
  FacilityModel,
  StaffModel,
} from '@hospital-mis/database';

import {
  ConflictError,
} from '@hospital-mis/shared';

import {
  toNullableObjectId,
  toObjectId,
} from '../modules/facility/facility.mapper.js';

import type {
  FacilityTransactionCompensation,
} from '../modules/facility/facility.ports.js';

import {
  FACILITY_COMPENSATION_TYPES,
} from '../modules/facility/facility.transaction.constants.js';

type JsonObject =
  Record<string, unknown>;

export interface FacilityCompensationExecutorPort {
  execute(
    compensation:
      FacilityTransactionCompensation,
  ): Promise<void>;
}

function asObject(
  value: unknown,
  fieldName: string,
): JsonObject {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(
      `${fieldName} must be an object`,
    );
  }

  return value as JsonObject;
}

function asString(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== 'string' ||
    value.length === 0
  ) {
    throw new Error(
      `${fieldName} must be a non-empty string`,
    );
  }

  return value;
}

function asNumber(
  value: unknown,
  fieldName: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `${fieldName} must be a non-negative integer`,
    );
  }

  return value;
}

function asBoolean(
  value: unknown,
  fieldName: string,
): boolean {
  if (
    typeof value !== 'boolean'
  ) {
    throw new Error(
      `${fieldName} must be a boolean`,
    );
  }

  return value;
}

function asArray(
  value: unknown,
  fieldName: string,
): unknown[] {
  if (
    !Array.isArray(value)
  ) {
    throw new Error(
      `${fieldName} must be an array`,
    );
  }

  return value;
}

function asStringArray(
  value: unknown,
  fieldName: string,
): string[] {
  return asArray(
    value,
    fieldName,
  ).map(
    (
      item,
      index,
    ) =>
      asString(
        item,
        `${fieldName}.${index}`,
      ),
  );
}

function nullableString(
  value: unknown,
): string | null {
  return typeof value === 'string'
    ? value
    : null;
}

function nullableDate(
  value: unknown,
): Date | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const parsed =
    value instanceof Date
      ? value
      : new Date(
          asString(
            value,
            'date',
          ),
        );

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    throw new Error(
      'Date value is invalid',
    );
  }

  return parsed;
}

function requiredDate(
  value: unknown,
  fieldName: string,
): Date {
  const parsed =
    nullableDate(value);

  if (
    parsed === null
  ) {
    throw new Error(
      `${fieldName} is required`,
    );
  }

  return parsed;
}

export class FacilityCompensationExecutor
implements FacilityCompensationExecutorPort {
  public async execute(
    compensation:
      FacilityTransactionCompensation,
  ): Promise<void> {
    switch (
      compensation.type
    ) {
      case FACILITY_COMPENSATION_TYPES
        .DELETE_CREATED_FACILITY:
        await this.deleteCreatedFacility(
          compensation.payload,
        );
        return;

      case FACILITY_COMPENSATION_TYPES
        .RESTORE_FACILITY:
        await this.restoreFacility(
          compensation.payload,
        );
        return;

      case FACILITY_COMPENSATION_TYPES
        .RESTORE_FACILITY_LIFECYCLE:
        await this.restoreFacilityLifecycle(
          compensation.payload,
        );
        return;

      case FACILITY_COMPENSATION_TYPES
        .DELETE_CREATED_DEPARTMENT:
        await this.deleteCreatedDepartment(
          compensation.payload,
        );
        return;

      case FACILITY_COMPENSATION_TYPES
        .RESTORE_DEPARTMENT:
        await this.restoreDepartment(
          compensation.payload,
        );
        return;

      case FACILITY_COMPENSATION_TYPES
        .RESTORE_DEPARTMENT_LIFECYCLE:
        await this.restoreDepartmentLifecycle(
          compensation.payload,
        );
        return;

      default:
        throw new Error(
          `Unsupported facility compensation type: ${compensation.type}`,
        );
    }
  }

  private async deleteCreatedFacility(
    payload: JsonObject,
  ): Promise<void> {
    const facilityId =
      asString(
        payload['facilityId'],
        'facilityId',
      );

    const expectedVersion =
      asNumber(
        payload['expectedVersion'],
        'expectedVersion',
      );

    const objectId =
      toObjectId(
        facilityId,
        'facilityId',
      );

    const facility =
      await FacilityModel.findById(
        objectId,
      )
        .select(
          'version',
        )
        .lean<{
          version: number;
        }>()
        .exec();

    if (
      facility === null
    ) {
      return;
    }

    if (
      facility.version !==
      expectedVersion
    ) {
      throw new ConflictError(
        'Created facility changed before compensation could remove it',
      );
    }

    const [
      childFacility,
      department,
    ] = await Promise.all([
      FacilityModel.exists({
        parentFacilityId:
          objectId,
      }),

      DepartmentModel.exists({
        facilityId:
          objectId,
      }),
    ]);

    if (
      childFacility !== null ||
      department !== null
    ) {
      throw new ConflictError(
        'Created facility acquired dependent records before compensation',
      );
    }

    const deleted =
      await FacilityModel.deleteOne({
        _id:
          objectId,

        version:
          expectedVersion,
      }).exec();

    if (
      deleted.deletedCount !==
      1
    ) {
      throw new ConflictError(
        'Created facility could not be removed during compensation',
      );
    }
  }

  private async restoreFacility(
    payload: JsonObject,
  ): Promise<void> {
    const facilityId =
      asString(
        payload['facilityId'],
        'facilityId',
      );

    const expectedPostVersion =
      asNumber(
        payload[
          'expectedPostVersion'
        ],
        'expectedPostVersion',
      );

    const previous =
      asObject(
        payload['previous'],
        'previous',
      );

    const previousVersion =
      asNumber(
        previous['version'],
        'previous.version',
      );

    const result =
      await FacilityModel.updateOne(
        {
          _id:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          version:
            expectedPostVersion,
        },
        {
          $set: {
            name:
              asString(
                previous['name'],
                'previous.name',
              ),

            legalName:
              nullableString(
                previous['legalName'],
              ),

            parentFacilityId:
              toNullableObjectId(
                nullableString(
                  previous[
                    'parentFacilityId'
                  ],
                ),
                'previous.parentFacilityId',
              ),

            identifiers:
              asArray(
                previous[
                  'identifiers'
                ],
                'previous.identifiers',
              ),

            timezone:
              asString(
                previous['timezone'],
                'previous.timezone',
              ),

            currency:
              asString(
                previous['currency'],
                'previous.currency',
              ),

            locale:
              asString(
                previous['locale'],
                'previous.locale',
              ),

            supportedLocales:
              asStringArray(
                previous[
                  'supportedLocales'
                ],
                'previous.supportedLocales',
              ),

            address:
              asObject(
                previous['address'],
                'previous.address',
              ),

            contact:
              asObject(
                previous['contact'],
                'previous.contact',
              ),

            allowsAuthentication:
              asBoolean(
                previous[
                  'allowsAuthentication'
                ],
                'previous.allowsAuthentication',
              ),

            version:
              previousVersion,

            updatedBy:
              toNullableObjectId(
                nullableString(
                  previous[
                    'updatedBy'
                  ],
                ),
                'previous.updatedBy',
              ),

            updatedAt:
              requiredDate(
                previous[
                  'updatedAt'
                ],
                'previous.updatedAt',
              ),
          },
        },
        {
          runValidators:
            true,

          timestamps:
            false,
        },
      ).exec();

    await this.assertRestoredVersion(
      'Facility',
      facilityId,
      previousVersion,
      result.matchedCount,
      async () => {
        const current =
          await FacilityModel.findById(
            toObjectId(
              facilityId,
              'facilityId',
            ),
          )
            .select(
              'version',
            )
            .lean<{
              version: number;
            }>()
            .exec();

        return (
          current?.version ??
          null
        );
      },
    );
  }

  private async restoreFacilityLifecycle(
    payload: JsonObject,
  ): Promise<void> {
    const facilityId =
      asString(
        payload['facilityId'],
        'facilityId',
      );

    const expectedPostVersion =
      asNumber(
        payload[
          'expectedPostVersion'
        ],
        'expectedPostVersion',
      );

    const previous =
      asObject(
        payload['previous'],
        'previous',
      );

    const previousVersion =
      asNumber(
        previous['version'],
        'previous.version',
      );

    const result =
      await FacilityModel.updateOne(
        {
          _id:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          version:
            expectedPostVersion,
        },
        {
          $set: {
            status:
              asString(
                previous['status'],
                'previous.status',
              ),

            allowsAuthentication:
              asBoolean(
                previous[
                  'allowsAuthentication'
                ],
                'previous.allowsAuthentication',
              ),

            deactivatedAt:
              nullableDate(
                previous[
                  'deactivatedAt'
                ],
              ),

            deactivatedBy:
              toNullableObjectId(
                nullableString(
                  previous[
                    'deactivatedBy'
                  ],
                ),
                'previous.deactivatedBy',
              ),

            deactivationReason:
              nullableString(
                previous[
                  'deactivationReason'
                ],
              ),

            version:
              previousVersion,

            updatedBy:
              toNullableObjectId(
                nullableString(
                  previous[
                    'updatedBy'
                  ],
                ),
                'previous.updatedBy',
              ),

            updatedAt:
              requiredDate(
                previous[
                  'updatedAt'
                ],
                'previous.updatedAt',
              ),
          },
        },
        {
          runValidators:
            true,

          timestamps:
            false,
        },
      ).exec();

    await this.assertRestoredVersion(
      'Facility',
      facilityId,
      previousVersion,
      result.matchedCount,
      async () => {
        const current =
          await FacilityModel.findById(
            toObjectId(
              facilityId,
              'facilityId',
            ),
          )
            .select(
              'version',
            )
            .lean<{
              version: number;
            }>()
            .exec();

        return (
          current?.version ??
          null
        );
      },
    );
  }

  private async deleteCreatedDepartment(
    payload: JsonObject,
  ): Promise<void> {
    const departmentId =
      asString(
        payload['departmentId'],
        'departmentId',
      );

    const expectedVersion =
      asNumber(
        payload['expectedVersion'],
        'expectedVersion',
      );

    const objectId =
      toObjectId(
        departmentId,
        'departmentId',
      );

    const department =
      await DepartmentModel.findById(
        objectId,
      )
        .select(
          'version',
        )
        .lean<{
          version: number;
        }>()
        .exec();

    if (
      department === null
    ) {
      return;
    }

    if (
      department.version !==
      expectedVersion
    ) {
      throw new ConflictError(
        'Created department changed before compensation could remove it',
      );
    }

    const [
      childDepartment,
      assignedStaff,
    ] = await Promise.all([
      DepartmentModel.exists({
        parentDepartmentId:
          objectId,
      }),

      StaffModel.exists({
        departmentId:
          objectId,
      }),
    ]);

    if (
      childDepartment !== null ||
      assignedStaff !== null
    ) {
      throw new ConflictError(
        'Created department acquired dependent records before compensation',
      );
    }

    const deleted =
      await DepartmentModel.deleteOne({
        _id:
          objectId,

        version:
          expectedVersion,
      }).exec();

    if (
      deleted.deletedCount !==
      1
    ) {
      throw new ConflictError(
        'Created department could not be removed during compensation',
      );
    }
  }

  private async restoreDepartment(
    payload: JsonObject,
  ): Promise<void> {
    const departmentId =
      asString(
        payload['departmentId'],
        'departmentId',
      );

    const expectedPostVersion =
      asNumber(
        payload[
          'expectedPostVersion'
        ],
        'expectedPostVersion',
      );

    const previous =
      asObject(
        payload['previous'],
        'previous',
      );

    const previousVersion =
      asNumber(
        previous['version'],
        'previous.version',
      );

    const result =
      await DepartmentModel.updateOne(
        {
          _id:
            toObjectId(
              departmentId,
              'departmentId',
            ),

          version:
            expectedPostVersion,
        },
        {
          $set: {
            parentDepartmentId:
              toNullableObjectId(
                nullableString(
                  previous[
                    'parentDepartmentId'
                  ],
                ),
                'previous.parentDepartmentId',
              ),

            managerStaffId:
              toNullableObjectId(
                nullableString(
                  previous[
                    'managerStaffId'
                  ],
                ),
                'previous.managerStaffId',
              ),

            name:
              asString(
                previous['name'],
                'previous.name',
              ),

            description:
              nullableString(
                previous[
                  'description'
                ],
              ),

            departmentType:
              asString(
                previous[
                  'departmentType'
                ],
                'previous.departmentType',
              ),

            isClinical:
              asBoolean(
                previous[
                  'isClinical'
                ],
                'previous.isClinical',
              ),

            location:
              nullableString(
                previous['location'],
              ),

            costCenterCode:
              nullableString(
                previous[
                  'costCenterCode'
                ],
              ),

            contact:
              asObject(
                previous['contact'],
                'previous.contact',
              ),

            version:
              previousVersion,

            updatedBy:
              toNullableObjectId(
                nullableString(
                  previous[
                    'updatedBy'
                  ],
                ),
                'previous.updatedBy',
              ),

            updatedAt:
              requiredDate(
                previous[
                  'updatedAt'
                ],
                'previous.updatedAt',
              ),
          },
        },
        {
          runValidators:
            true,

          timestamps:
            false,
        },
      ).exec();

    await this.assertRestoredVersion(
      'Department',
      departmentId,
      previousVersion,
      result.matchedCount,
      async () => {
        const current =
          await DepartmentModel.findById(
            toObjectId(
              departmentId,
              'departmentId',
            ),
          )
            .select(
              'version',
            )
            .lean<{
              version: number;
            }>()
            .exec();

        return (
          current?.version ??
          null
        );
      },
    );
  }

  private async restoreDepartmentLifecycle(
    payload: JsonObject,
  ): Promise<void> {
    const departmentId =
      asString(
        payload['departmentId'],
        'departmentId',
      );

    const expectedPostVersion =
      asNumber(
        payload[
          'expectedPostVersion'
        ],
        'expectedPostVersion',
      );

    const previous =
      asObject(
        payload['previous'],
        'previous',
      );

    const previousVersion =
      asNumber(
        previous['version'],
        'previous.version',
      );

    const result =
      await DepartmentModel.updateOne(
        {
          _id:
            toObjectId(
              departmentId,
              'departmentId',
            ),

          version:
            expectedPostVersion,
        },
        {
          $set: {
            status:
              asString(
                previous['status'],
                'previous.status',
              ),

            deactivatedAt:
              nullableDate(
                previous[
                  'deactivatedAt'
                ],
              ),

            deactivatedBy:
              toNullableObjectId(
                nullableString(
                  previous[
                    'deactivatedBy'
                  ],
                ),
                'previous.deactivatedBy',
              ),

            deactivationReason:
              nullableString(
                previous[
                  'deactivationReason'
                ],
              ),

            version:
              previousVersion,

            updatedBy:
              toNullableObjectId(
                nullableString(
                  previous[
                    'updatedBy'
                  ],
                ),
                'previous.updatedBy',
              ),

            updatedAt:
              requiredDate(
                previous[
                  'updatedAt'
                ],
                'previous.updatedAt',
              ),
          },
        },
        {
          runValidators:
            true,

          timestamps:
            false,
        },
      ).exec();

    await this.assertRestoredVersion(
      'Department',
      departmentId,
      previousVersion,
      result.matchedCount,
      async () => {
        const current =
          await DepartmentModel.findById(
            toObjectId(
              departmentId,
              'departmentId',
            ),
          )
            .select(
              'version',
            )
            .lean<{
              version: number;
            }>()
            .exec();

        return (
          current?.version ??
          null
        );
      },
    );
  }

  private async assertRestoredVersion(
    entityName: string,
    entityId: string,
    expectedVersion: number,
    matchedCount: number,
    readCurrentVersion:
      () => Promise<number | null>,
  ): Promise<void> {
    if (
      matchedCount === 1
    ) {
      return;
    }

    const currentVersion =
      await readCurrentVersion();

    if (
      currentVersion ===
      expectedVersion
    ) {
      return;
    }

    throw new ConflictError(
      `${entityName} ${entityId} could not be restored during compensation`,
    );
  }
}