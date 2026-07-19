import type {
  FilterQuery,
} from 'mongoose';

import {
  LabTestCategoryModel,
  LabTestModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  LaboratoryCatalogRepositoryPort,
  LaboratoryCategoryPersistenceUpdate,
  LaboratoryTestPersistenceUpdate,
} from '../laboratory.ports.js';

import type {
  LaboratoryTestCategoryRecord,
  LaboratoryTestRecord,
} from '../laboratory.persistence.types.js';

import type {
  LaboratoryCatalogSearchQuery,
} from '../laboratory.types.js';

import {
  throwMappedLaboratoryPersistenceError,
} from '../laboratory.persistence-errors.js';

const CATEGORY_SELECT = [
  '_id',
  'facilityId',
  'categoryCode',
  'name',
  'normalizedName',
  'description',
  'displayOrder',
  'status',
  'deactivatedAt',
  'deactivatedBy',
  '+deactivationReason',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const TEST_SELECT = [
  '_id',
  'facilityId',
  'testCode',
  'name',
  'normalizedName',
  'aliases',
  'normalizedAliases',
  'categoryId',
  'categoryCodeSnapshot',
  'categoryNameSnapshot',
  'description',
  'methodCode',
  'methodName',
  'requiresSpecimen',
  'specimenRequirements',
  '+specimenRequirements.collectionInstructions',
  '+specimenRequirements.handlingInstructions',
  'components',
  'routineTurnaroundMinutes',
  'urgentTurnaroundMinutes',
  'statTurnaroundMinutes',
  'availableDepartmentIds',
  'orderable',
  'requiresResultValidation',
  'requiresResultVerification',
  'criticalNotificationRequired',
  'chargeCatalogItemId',
  'effectiveFrom',
  'effectiveThrough',
  'status',
  'deactivatedAt',
  'deactivatedBy',
  '+deactivationReason',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

function record<T>(
  value: unknown,
): T {
  return value as T;
}

function escapeRegex(
  value: string,
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/gu,
    '\\$&',
  );
}

export class LaboratoryCatalogRepository
implements LaboratoryCatalogRepositoryPort {
  public async findCategoryById(
    facilityId: string,
    categoryId: string,
  ): Promise<
    LaboratoryTestCategoryRecord |
    null
  > {
    return record<
      LaboratoryTestCategoryRecord |
      null
    >(
      await LabTestCategoryModel
        .findOne({
          _id:
            toObjectId(
              categoryId,
              'categoryId',
            ),

          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),
        })
        .select(
          CATEGORY_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async findTestById(
    facilityId: string,
    testId: string,
  ): Promise<
    LaboratoryTestRecord |
    null
  > {
    return record<
      LaboratoryTestRecord |
      null
    >(
      await LabTestModel
        .findOne({
          _id:
            toObjectId(
              testId,
              'testId',
            ),

          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),
        })
        .select(
          TEST_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async findTestsByIds(
    facilityId: string,
    testIds:
      readonly string[],
  ): Promise<
    LaboratoryTestRecord[]
  > {
    if (
      testIds.length ===
      0
    ) {
      return [];
    }

    return record<
      LaboratoryTestRecord[]
    >(
      await LabTestModel
        .find({
          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          _id: {
            $in:
              testIds.map(
                (testId) =>
                  toObjectId(
                    testId,
                    'testIds',
                  ),
              ),
          },
        })
        .select(
          TEST_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async searchTests(
    facilityId: string,
    query:
      LaboratoryCatalogSearchQuery,
  ): Promise<{
    items:
      LaboratoryTestRecord[];

    total:
      number;
  }> {
    const filter:
      FilterQuery<unknown> = {
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    };

    const andClauses:
      Record<
        string,
        unknown
      >[] = [];

    if (
      query.categoryId !==
      undefined
    ) {
      filter['categoryId'] =
        toObjectId(
          query.categoryId,
          'categoryId',
        );
    }

    if (
      query.departmentId !==
      undefined
    ) {
      andClauses.push({
        $or: [
          {
            availableDepartmentIds: {
              $size:
                0,
            },
          },

          {
            availableDepartmentIds:
              toObjectId(
                query.departmentId,
                'departmentId',
              ),
          },
        ],
      });
    }

    if (
      query.status !==
      undefined
    ) {
      filter['status'] =
        query.status;
    }

    if (
      query.orderable !==
      undefined
    ) {
      filter['orderable'] =
        query.orderable;
    }

    if (
      query.effectiveAt !==
      undefined
    ) {
      const effectiveAt =
        new Date(
          query.effectiveAt,
        );

      filter['effectiveFrom'] = {
        $lte:
          effectiveAt,
      };

      andClauses.push({
        $or: [
          {
            effectiveThrough:
              null,
          },

          {
            effectiveThrough: {
              $gte:
                effectiveAt,
            },
          },
        ],
      });
    }

    if (
      query.search !==
      undefined
    ) {
      const expression =
        new RegExp(
          escapeRegex(
            query
              .search
              .trim(),
          ),
          'iu',
        );

      andClauses.push({
        $or: [
          {
            testCode:
              expression,
          },

          {
            normalizedName:
              expression,
          },

          {
            normalizedAliases:
              expression,
          },

          {
            categoryNameSnapshot:
              expression,
          },
        ],
      });
    }

    if (
      andClauses.length >
      0
    ) {
      filter['$and'] =
        andClauses;
    }

    const direction =
      query.sortDirection ===
        'asc'
        ? 1
        : -1;

    const skip =
      (
        query.page -
        1
      ) *
      query.pageSize;

    const [
      items,
      total,
    ] =
      await Promise.all([
        LabTestModel
          .find(
            filter,
          )
          .select(
            TEST_SELECT,
          )
          .sort({
            [query.sortBy]:
              direction,

            _id:
              direction,
          })
          .skip(
            skip,
          )
          .limit(
            query.pageSize,
          )
          .lean()
          .exec(),

        LabTestModel
          .countDocuments(
            filter,
          )
          .exec(),
      ]);

    return {
      items:
        record<
          LaboratoryTestRecord[]
        >(
          items,
        ),

      total,
    };
  }

  public async createCategory(
    input: Omit<
      LaboratoryTestCategoryRecord,
      | '_id'
      | 'createdAt'
      | 'updatedAt'
    >,
  ): Promise<
    LaboratoryTestCategoryRecord
  > {
    try {
      const document =
        await LabTestCategoryModel
          .create(
            input,
          );

      return record<
        LaboratoryTestCategoryRecord
      >(
        document.toObject(),
      );
    } catch (error) {
      throwMappedLaboratoryPersistenceError(
        error,
        'CREATE_CATEGORY',
      );
    }
  }

  public async updateCategory(
    facilityId:
      string,

    categoryId:
      string,

    expectedVersion:
      number,

    update:
      LaboratoryCategoryPersistenceUpdate,
  ): Promise<
    LaboratoryTestCategoryRecord |
    null
  > {
    const current =
      await LabTestCategoryModel
        .findOne({
          _id:
            toObjectId(
              categoryId,
              'categoryId',
            ),

          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          version:
            expectedVersion,
        })
        .select(
          CATEGORY_SELECT,
        )
        .exec();

    if (
      current ===
      null
    ) {
      return null;
    }

    current.set(
      update,
    );

    current.version =
      expectedVersion +
      1;

    await current.validate();

    try {
      return record<
        LaboratoryTestCategoryRecord |
        null
      >(
        await LabTestCategoryModel
          .findOneAndUpdate(
            {
              _id:
                current._id,

              facilityId:
                current.facilityId,

              version:
                expectedVersion,
            },

            {
              $set: {
                name:
                  current.name,

                normalizedName:
                  current.normalizedName,

                description:
                  current.description,

                displayOrder:
                  current.displayOrder,

                updatedBy:
                  current.updatedBy,
              },

              $inc: {
                version:
                  1,
              },
            },

            {
              new:
                true,

              runValidators:
                true,
            },
          )
          .select(
            CATEGORY_SELECT,
          )
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedLaboratoryPersistenceError(
        error,
        'CREATE_CATEGORY',
      );
    }
  }

  public async changeCategoryStatus(
    facilityId:
      string,

    categoryId:
      string,

    expectedVersion:
      number,

    status:
      | 'ACTIVE'
      | 'INACTIVE',

    actorUserId:
      string,

    reason:
      string,

    occurredAt:
      Date,
  ): Promise<
    LaboratoryTestCategoryRecord |
    null
  > {
    const current =
      await LabTestCategoryModel
        .findOne({
          _id:
            toObjectId(
              categoryId,
              'categoryId',
            ),

          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          version:
            expectedVersion,
        })
        .select(
          CATEGORY_SELECT,
        )
        .exec();

    if (
      current ===
      null
    ) {
      return null;
    }

    const inactive =
      status ===
      'INACTIVE';

    current.status =
      status;

    current.deactivatedAt =
      inactive
        ? occurredAt
        : null;

    current.deactivatedBy =
      inactive
        ? toObjectId(
            actorUserId,
            'actorUserId',
          )
        : null;

    current.deactivationReason =
      inactive
        ? reason
        : null;

    current.updatedBy =
      toObjectId(
        actorUserId,
        'actorUserId',
      );

    current.version =
      expectedVersion +
      1;

    await current.validate();

    return record<
      LaboratoryTestCategoryRecord |
      null
    >(
      await LabTestCategoryModel
        .findOneAndUpdate(
          {
            _id:
              current._id,

            facilityId:
              current.facilityId,

            version:
              expectedVersion,
          },

          {
            $set: {
              status:
                current.status,

              deactivatedAt:
                current.deactivatedAt,

              deactivatedBy:
                current.deactivatedBy,

              deactivationReason:
                current.deactivationReason,

              updatedBy:
                current.updatedBy,
            },

            $inc: {
              version:
                1,
            },
          },

          {
            new:
              true,

            runValidators:
              true,
          },
        )
        .select(
          CATEGORY_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async createTest(
    input: Omit<
      LaboratoryTestRecord,
      | '_id'
      | 'createdAt'
      | 'updatedAt'
    >,
  ): Promise<
    LaboratoryTestRecord
  > {
    try {
      const document =
        await LabTestModel
          .create(
            input,
          );

      return record<
        LaboratoryTestRecord
      >(
        document.toObject(),
      );
    } catch (error) {
      throwMappedLaboratoryPersistenceError(
        error,
        'CREATE_TEST',
      );
    }
  }

  public async updateTest(
    facilityId:
      string,

    testId:
      string,

    expectedVersion:
      number,

    update:
      LaboratoryTestPersistenceUpdate,
  ): Promise<
    LaboratoryTestRecord |
    null
  > {
    const current =
      await LabTestModel
        .findOne({
          _id:
            toObjectId(
              testId,
              'testId',
            ),

          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          version:
            expectedVersion,
        })
        .select(
          TEST_SELECT,
        )
        .exec();

    if (
      current ===
      null
    ) {
      return null;
    }

    current.set(
      update,
    );

    current.version =
      expectedVersion +
      1;

    await current.validate();

    try {
      return record<
        LaboratoryTestRecord |
        null
      >(
        await LabTestModel
          .findOneAndUpdate(
            {
              _id:
                current._id,

              facilityId:
                current.facilityId,

              version:
                expectedVersion,
            },

            {
              $set: {
                name:
                  current.name,

                normalizedName:
                  current.normalizedName,

                aliases:
                  current.aliases,

                normalizedAliases:
                  current.normalizedAliases,

                categoryId:
                  current.categoryId,

                categoryCodeSnapshot:
                  current.categoryCodeSnapshot,

                categoryNameSnapshot:
                  current.categoryNameSnapshot,

                description:
                  current.description,

                methodCode:
                  current.methodCode,

                methodName:
                  current.methodName,

                requiresSpecimen:
                  current.requiresSpecimen,

                specimenRequirements:
                  current.specimenRequirements,

                components:
                  current.components,

                routineTurnaroundMinutes:
                  current.routineTurnaroundMinutes,

                urgentTurnaroundMinutes:
                  current.urgentTurnaroundMinutes,

                statTurnaroundMinutes:
                  current.statTurnaroundMinutes,

                availableDepartmentIds:
                  current.availableDepartmentIds,

                orderable:
                  current.orderable,

                requiresResultValidation:
                  current.requiresResultValidation,

                requiresResultVerification:
                  current.requiresResultVerification,

                criticalNotificationRequired:
                  current.criticalNotificationRequired,

                chargeCatalogItemId:
                  current.chargeCatalogItemId,

                effectiveFrom:
                  current.effectiveFrom,

                effectiveThrough:
                  current.effectiveThrough,

                updatedBy:
                  current.updatedBy,
              },

              $inc: {
                version:
                  1,
              },
            },

            {
              new:
                true,

              runValidators:
                true,
            },
          )
          .select(
            TEST_SELECT,
          )
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedLaboratoryPersistenceError(
        error,
        'CREATE_TEST',
      );
    }
  }

  public async changeTestStatus(
    facilityId:
      string,

    testId:
      string,

    expectedVersion:
      number,

    status:
      | 'ACTIVE'
      | 'INACTIVE',

    actorUserId:
      string,

    reason:
      string,

    occurredAt:
      Date,
  ): Promise<
    LaboratoryTestRecord |
    null
  > {
    const current =
      await LabTestModel
        .findOne({
          _id:
            toObjectId(
              testId,
              'testId',
            ),

          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          version:
            expectedVersion,
        })
        .select(
          TEST_SELECT,
        )
        .exec();

    if (
      current ===
      null
    ) {
      return null;
    }

    const inactive =
      status ===
      'INACTIVE';

    current.status =
      status;

    current.orderable =
      inactive
        ? false
        : true;

    current.deactivatedAt =
      inactive
        ? occurredAt
        : null;

    current.deactivatedBy =
      inactive
        ? toObjectId(
            actorUserId,
            'actorUserId',
          )
        : null;

    current.deactivationReason =
      inactive
        ? reason
        : null;

    current.updatedBy =
      toObjectId(
        actorUserId,
        'actorUserId',
      );

    current.version =
      expectedVersion +
      1;

    await current.validate();

    return record<
      LaboratoryTestRecord |
      null
    >(
      await LabTestModel
        .findOneAndUpdate(
          {
            _id:
              current._id,

            facilityId:
              current.facilityId,

            version:
              expectedVersion,
          },

          {
            $set: {
              status:
                current.status,

              orderable:
                current.orderable,

              deactivatedAt:
                current.deactivatedAt,

              deactivatedBy:
                current.deactivatedBy,

              deactivationReason:
                current.deactivationReason,

              updatedBy:
                current.updatedBy,
            },

            $inc: {
              version:
                1,
            },
          },

          {
            new:
              true,

            runValidators:
              true,
          },
        )
        .select(
          TEST_SELECT,
        )
        .lean()
        .exec(),
    );
  }
}