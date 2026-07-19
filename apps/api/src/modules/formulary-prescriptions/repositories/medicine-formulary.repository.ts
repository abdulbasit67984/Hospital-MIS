import type {
  FilterQuery,
  UpdateQuery,
} from 'mongoose';

import {
  Types,
} from 'mongoose';

import {
  FormularyItemModel,
  MedicineFormModel,
  MedicineModel,
  MedicineRouteModel,
  MedicineStrengthModel,
  PrescriptionFrequencyModel,
  UnitOfMeasureModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  FormularyItemStatus,
  MedicineCatalogStatus,
} from '@hospital-mis/database';

import type {
  FormularyCatalogRepositoryPort,
  FormularyItemPersistenceUpdate,
} from '../formulary-prescriptions.ports.js';

import type {
  FormularyItemRecord,
  MedicineFormRecord,
  MedicineRecord,
  MedicineRouteRecord,
  MedicineStrengthRecord,
  PrescriptionFrequencyRecord,
  UnitOfMeasureRecord,
} from '../formulary-prescriptions.persistence.types.js';

import type {
  FormularySearchQuery,
} from '../formulary-prescriptions.types.js';

import {
  FORMULARY_ITEM_INTERNAL_SELECT,
  FORMULARY_ITEM_STANDARD_SELECT,
  MEDICINE_FORM_INTERNAL_SELECT,
  MEDICINE_INTERNAL_SELECT,
  MEDICINE_ROUTE_INTERNAL_SELECT,
  MEDICINE_STRENGTH_INTERNAL_SELECT,
  PRESCRIPTION_FREQUENCY_INTERNAL_SELECT,
  UNIT_OF_MEASURE_INTERNAL_SELECT,
} from '../formulary-prescriptions.projections.js';

import {
  normalizeFormularyCode,
  normalizeFormularyText,
  normalizeNullableFormularyText,
  uniqueNormalizedStrings,
  uniqueObjectIdStrings,
} from '../formulary-prescriptions.normalization.js';

import {
  throwMappedFormularyPrescriptionPersistenceError,
} from '../formulary-prescriptions.persistence-errors.js';

import type {
  CreateMedicineBody,
  CreateMedicineFormBody,
  CreateMedicineRouteBody,
  CreateMedicineStrengthBody,
  CreatePrescriptionFrequencyBody,
  CreateUnitOfMeasureBody,
  UpdateMedicineBody,
  UpdateMedicineFormBody,
  UpdateMedicineRouteBody,
  UpdateMedicineStrengthBody,
  UpdatePrescriptionFrequencyBody,
  UpdateUnitOfMeasureBody,
} from '../formulary-prescriptions.validation.js';

function record<T>(
  value: unknown,
): T {
  return value as T;
}

function lifecycleUpdate(
  status: MedicineCatalogStatus,
  actorUserId: string,
  reason: string,
  occurredAt: Date,
): Record<string, unknown> {
  return status === 'INACTIVE'
    ? {
        status,
        deactivatedAt:
          occurredAt,
        deactivatedBy:
          toObjectId(
            actorUserId,
            'actorUserId',
          ),
        deactivationReason:
          reason,
      }
    : {
        status,
        deactivatedAt:
          null,
        deactivatedBy:
          null,
        deactivationReason:
          null,
      };
}

export class MedicineFormularyRepository
implements FormularyCatalogRepositoryPort {
  public async findMedicineById(
    facilityId: string,
    medicineId: string,
  ): Promise<MedicineRecord | null> {
    return record<MedicineRecord | null>(
      await MedicineModel.findOne({
        _id:
          toObjectId(
            medicineId,
            'medicineId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          MEDICINE_INTERNAL_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async findMedicineFormById(
    facilityId: string,
    medicineFormId: string,
  ): Promise<MedicineFormRecord | null> {
    return record<MedicineFormRecord | null>(
      await MedicineFormModel.findOne({
        _id:
          toObjectId(
            medicineFormId,
            'medicineFormId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          MEDICINE_FORM_INTERNAL_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async findMedicineRouteById(
    facilityId: string,
    medicineRouteId: string,
  ): Promise<MedicineRouteRecord | null> {
    return record<MedicineRouteRecord | null>(
      await MedicineRouteModel.findOne({
        _id:
          toObjectId(
            medicineRouteId,
            'medicineRouteId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          MEDICINE_ROUTE_INTERNAL_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async findMedicineRoutesByIds(
    facilityId: string,
    medicineRouteIds:
      readonly string[],
  ): Promise<MedicineRouteRecord[]> {
    const uniqueIds =
      uniqueObjectIdStrings(
        medicineRouteIds,
      );

    if (uniqueIds.length === 0) {
      return [];
    }

    return record<MedicineRouteRecord[]>(
      await MedicineRouteModel.find({
        _id: {
          $in:
            uniqueIds.map(
              (medicineRouteId) =>
                toObjectId(
                  medicineRouteId,
                  'medicineRouteIds',
                ),
            ),
        },

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          MEDICINE_ROUTE_INTERNAL_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async findUnitOfMeasureById(
    facilityId: string,
    unitOfMeasureId: string,
  ): Promise<UnitOfMeasureRecord | null> {
    return record<UnitOfMeasureRecord | null>(
      await UnitOfMeasureModel.findOne({
        _id:
          toObjectId(
            unitOfMeasureId,
            'unitOfMeasureId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          UNIT_OF_MEASURE_INTERNAL_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async findMedicineStrengthById(
    facilityId: string,
    medicineStrengthId: string,
  ): Promise<MedicineStrengthRecord | null> {
    return record<MedicineStrengthRecord | null>(
      await MedicineStrengthModel.findOne({
        _id:
          toObjectId(
            medicineStrengthId,
            'medicineStrengthId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          MEDICINE_STRENGTH_INTERNAL_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async findPrescriptionFrequencyById(
    facilityId: string,
    prescriptionFrequencyId: string,
  ): Promise<PrescriptionFrequencyRecord | null> {
    return record<PrescriptionFrequencyRecord | null>(
      await PrescriptionFrequencyModel.findOne({
        _id:
          toObjectId(
            prescriptionFrequencyId,
            'prescriptionFrequencyId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          PRESCRIPTION_FREQUENCY_INTERNAL_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async findFormularyItemById(
    facilityId: string,
    formularyItemId: string,
  ): Promise<FormularyItemRecord | null> {
    return record<FormularyItemRecord | null>(
      await FormularyItemModel.findOne({
        _id:
          toObjectId(
            formularyItemId,
            'formularyItemId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          FORMULARY_ITEM_INTERNAL_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async findFormularyItemsByIds(
    facilityId: string,
    formularyItemIds:
      readonly string[],
  ): Promise<FormularyItemRecord[]> {
    const uniqueIds =
      uniqueObjectIdStrings(
        formularyItemIds,
      );

    if (uniqueIds.length === 0) {
      return [];
    }

    return record<FormularyItemRecord[]>(
      await FormularyItemModel.find({
        _id: {
          $in:
            uniqueIds.map(
              (formularyItemId) =>
                toObjectId(
                  formularyItemId,
                  'formularyItemIds',
                ),
            ),
        },

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          FORMULARY_ITEM_INTERNAL_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async searchFormulary(
    facilityId: string,
    query: FormularySearchQuery,
  ): Promise<{
    items: FormularyItemRecord[];
    total: number;
  }> {
    const filter:
      FilterQuery<unknown> = {
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      };

    if (query.status !== undefined) {
      filter['status'] =
        query.status;
    }

    if (query.medicineId !== undefined) {
      filter['medicineId'] =
        toObjectId(
          query.medicineId,
          'medicineId',
        );
    }

    if (query.medicineFormId !== undefined) {
      filter['medicineFormId'] =
        toObjectId(
          query.medicineFormId,
          'medicineFormId',
        );
    }

    if (query.routeId !== undefined) {
      filter['allowedRouteIds'] =
        toObjectId(
          query.routeId,
          'routeId',
        );
    }

    if (query.departmentId !== undefined) {
      filter['$or'] = [
        {
          restrictionType: {
            $ne:
              'DEPARTMENT_ONLY',
          },
        },
        {
          restrictedDepartmentIds:
            toObjectId(
              query.departmentId,
              'departmentId',
            ),
        },
      ];
    }

    if (
      query.search !== undefined &&
      query.search.length > 0
    ) {
      const searchTerms =
        normalizeFormularyText(
          query.search,
        )
          .split(' ')
          .filter(Boolean);

      filter['$and'] =
        searchTerms.map(
          (term) => ({
            searchText: {
              $regex:
                term.replaceAll(
                  /[.*+?^${}()|[\]\\]/gu,
                  '\\$&',
                ),

              $options:
                'i',
            },
          }),
        );
    }

    const sortField =
      query.sortBy === 'genericName'
        ? 'searchText'
        : query.sortBy === 'brandName'
          ? 'normalizedBrandName'
          : query.sortBy === 'form'
            ? 'medicineFormId'
            : query.sortBy === 'strength'
              ? 'medicineStrengthId'
              : query.sortBy;

    const sortDirection =
      query.sortDirection === 'asc'
        ? 1
        : -1;

    const skip =
      (query.page - 1) *
      query.pageSize;

    const [
      items,
      total,
    ] =
      await Promise.all([
        FormularyItemModel.find(
          filter,
        )
          .select(
            FORMULARY_ITEM_STANDARD_SELECT,
          )
          .sort({
            [sortField]:
              sortDirection,

            _id:
              1,
          })
          .skip(
            skip,
          )
          .limit(
            query.pageSize,
          )
          .lean()
          .exec(),

        FormularyItemModel.countDocuments(
          filter,
        )
          .exec(),
      ]);

    return {
      items:
        record<FormularyItemRecord[]>(
          items,
        ),

      total,
    };
  }

  public async createMedicine(
    facilityId: string,
    actorUserId: string,
    input: CreateMedicineBody,
  ): Promise<MedicineRecord> {
    try {
      const created =
        await MedicineModel.create({
          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          medicineCode:
            normalizeFormularyCode(
              input.medicineCode,
            ),

          genericName:
            input.genericName,

          normalizedGenericName:
            normalizeFormularyText(
              input.genericName,
            ),

          brandNames:
            input.brandNames.map(
              (brand) => ({
                name:
                  brand.name,

                normalizedName:
                  normalizeFormularyText(
                    brand.name,
                  ),

                manufacturerName:
                  normalizeNullableFormularyText(
                    brand.manufacturerName,
                  ),

                status:
                  brand.status,
              }),
            ),

          synonyms:
            uniqueNormalizedStrings(
              input.synonyms,
            ),

          therapeuticClass:
            normalizeNullableFormularyText(
              input.therapeuticClass,
            ),

          atcCode:
            normalizeNullableFormularyText(
              input.atcCode,
            ),

          description:
            normalizeNullableFormularyText(
              input.description,
            ),

          status:
            'ACTIVE',

          deactivatedAt:
            null,

          deactivatedBy:
            null,

          deactivationReason:
            null,

          schemaVersion:
            1,

          version:
            0,

          createdBy:
            toObjectId(
              actorUserId,
              'actorUserId',
            ),

          updatedBy:
            toObjectId(
              actorUserId,
              'actorUserId',
            ),
        });

      return record<MedicineRecord>(
        created.toObject(),
      );
    } catch (error) {
      throwMappedFormularyPrescriptionPersistenceError(
        error,
        'CREATE_MEDICINE',
      );
    }
  }

  public async updateMedicine(
    facilityId: string,
    medicineId: string,
    actorUserId: string,
    input: UpdateMedicineBody,
  ): Promise<MedicineRecord | null> {
    const update:
      UpdateQuery<unknown> = {
        updatedBy:
          toObjectId(
            actorUserId,
            'actorUserId',
          ),
      };

    if (input.genericName !== undefined) {
      update['genericName'] =
        input.genericName;

      update['normalizedGenericName'] =
        normalizeFormularyText(
          input.genericName,
        );
    }

    if (input.brandNames !== undefined) {
      update['brandNames'] =
        input.brandNames.map(
          (brand) => ({
            name:
              brand.name,

            normalizedName:
              normalizeFormularyText(
                brand.name,
              ),

            manufacturerName:
              normalizeNullableFormularyText(
                brand.manufacturerName,
              ),

            status:
              brand.status,
          }),
        );
    }

    if (input.synonyms !== undefined) {
      update['synonyms'] =
        uniqueNormalizedStrings(
          input.synonyms,
        );
    }

    if (input.therapeuticClass !== undefined) {
      update['therapeuticClass'] =
        normalizeNullableFormularyText(
          input.therapeuticClass,
        );
    }

    if (input.atcCode !== undefined) {
      update['atcCode'] =
        normalizeNullableFormularyText(
          input.atcCode,
        );
    }

    if (input.description !== undefined) {
      update['description'] =
        normalizeNullableFormularyText(
          input.description,
        );
    }

    try {
      return record<MedicineRecord | null>(
        await MedicineModel.findOneAndUpdate(
          {
            _id:
              toObjectId(
                medicineId,
                'medicineId',
              ),

            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),

            version:
              input.expectedVersion,
          },
          {
            $set:
              update,

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
            MEDICINE_INTERNAL_SELECT,
          )
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedFormularyPrescriptionPersistenceError(
        error,
        'CREATE_MEDICINE',
      );
    }
  }

  public async changeMedicineStatus(
    facilityId: string,
    medicineId: string,
    expectedVersion: number,
    status: MedicineCatalogStatus,
    actorUserId: string,
    reason: string,
    occurredAt: Date,
  ): Promise<MedicineRecord | null> {
    return record<MedicineRecord | null>(
      await MedicineModel.findOneAndUpdate(
        {
          _id:
            toObjectId(
              medicineId,
              'medicineId',
            ),

          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          version:
            expectedVersion,
        },
        {
          $set: {
            ...lifecycleUpdate(
              status,
              actorUserId,
              reason,
              occurredAt,
            ),

            updatedBy:
              toObjectId(
                actorUserId,
                'actorUserId',
              ),
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
          MEDICINE_INTERNAL_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async createMedicineForm(
    facilityId: string,
    actorUserId: string,
    input: CreateMedicineFormBody,
  ): Promise<MedicineFormRecord> {
    try {
      const created =
        await MedicineFormModel.create({
          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          code:
            normalizeFormularyCode(
              input.code,
            ),

          name:
            input.name,

          normalizedName:
            normalizeFormularyText(
              input.name,
            ),

          category:
            input.category,

          status:
            'ACTIVE',

          deactivatedAt:
            null,

          deactivatedBy:
            null,

          deactivationReason:
            null,

          schemaVersion:
            1,

          version:
            0,

          createdBy:
            toObjectId(
              actorUserId,
              'actorUserId',
            ),

          updatedBy:
            toObjectId(
              actorUserId,
              'actorUserId',
            ),
        });

      return record<MedicineFormRecord>(
        created.toObject(),
      );
    } catch (error) {
      throwMappedFormularyPrescriptionPersistenceError(
        error,
        'CREATE_MEDICINE_FORM',
      );
    }
  }

  public async updateMedicineForm(
    facilityId: string,
    medicineFormId: string,
    actorUserId: string,
    input: UpdateMedicineFormBody,
  ): Promise<MedicineFormRecord | null> {
    const update:
      Record<string, unknown> = {
        updatedBy:
          toObjectId(
            actorUserId,
            'actorUserId',
          ),
      };

    if (input.name !== undefined) {
      update['name'] =
        input.name;

      update['normalizedName'] =
        normalizeFormularyText(
          input.name,
        );
    }

    if (input.category !== undefined) {
      update['category'] =
        input.category;
    }

    try {
      return record<MedicineFormRecord | null>(
        await MedicineFormModel.findOneAndUpdate(
          {
            _id:
              toObjectId(
                medicineFormId,
                'medicineFormId',
              ),

            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),

            version:
              input.expectedVersion,
          },
          {
            $set:
              update,

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
            MEDICINE_FORM_INTERNAL_SELECT,
          )
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedFormularyPrescriptionPersistenceError(
        error,
        'CREATE_MEDICINE_FORM',
      );
    }
  }

  public async createMedicineRoute(
    facilityId: string,
    actorUserId: string,
    input: CreateMedicineRouteBody,
  ): Promise<MedicineRouteRecord> {
    try {
      const created =
        await MedicineRouteModel.create({
          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          code:
            input.code,

          name:
            input.name,

          normalizedName:
            normalizeFormularyText(
              input.name,
            ),

          status:
            'ACTIVE',

          deactivatedAt:
            null,

          deactivatedBy:
            null,

          deactivationReason:
            null,

          schemaVersion:
            1,

          version:
            0,

          createdBy:
            toObjectId(
              actorUserId,
              'actorUserId',
            ),

          updatedBy:
            toObjectId(
              actorUserId,
              'actorUserId',
            ),
        });

      return record<MedicineRouteRecord>(
        created.toObject(),
      );
    } catch (error) {
      throwMappedFormularyPrescriptionPersistenceError(
        error,
        'CREATE_MEDICINE_ROUTE',
      );
    }
  }

  public async updateMedicineRoute(
    facilityId: string,
    medicineRouteId: string,
    actorUserId: string,
    input: UpdateMedicineRouteBody,
  ): Promise<MedicineRouteRecord | null> {
    try {
      return record<MedicineRouteRecord | null>(
        await MedicineRouteModel.findOneAndUpdate(
          {
            _id:
              toObjectId(
                medicineRouteId,
                'medicineRouteId',
              ),

            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),

            version:
              input.expectedVersion,
          },
          {
            $set: {
              name:
                input.name,

              normalizedName:
                normalizeFormularyText(
                  input.name,
                ),

              updatedBy:
                toObjectId(
                  actorUserId,
                  'actorUserId',
                ),
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
            MEDICINE_ROUTE_INTERNAL_SELECT,
          )
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedFormularyPrescriptionPersistenceError(
        error,
        'CREATE_MEDICINE_ROUTE',
      );
    }
  }

  public async createUnitOfMeasure(
    facilityId: string,
    actorUserId: string,
    input: CreateUnitOfMeasureBody,
  ): Promise<UnitOfMeasureRecord> {
    try {
      const created =
        await UnitOfMeasureModel.create({
          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          code:
            normalizeFormularyCode(
              input.code,
            ),

          name:
            input.name,

          normalizedName:
            normalizeFormularyText(
              input.name,
            ),

          symbol:
            input.symbol,

          dimension:
            input.dimension,

          decimalScale:
            input.decimalScale,

          status:
            'ACTIVE',

          deactivatedAt:
            null,

          deactivatedBy:
            null,

          deactivationReason:
            null,

          schemaVersion:
            1,

          version:
            0,

          createdBy:
            toObjectId(
              actorUserId,
              'actorUserId',
            ),

          updatedBy:
            toObjectId(
              actorUserId,
              'actorUserId',
            ),
        });

      return record<UnitOfMeasureRecord>(
        created.toObject(),
      );
    } catch (error) {
      throwMappedFormularyPrescriptionPersistenceError(
        error,
        'CREATE_UNIT_OF_MEASURE',
      );
    }
  }

  public async updateUnitOfMeasure(
    facilityId: string,
    unitOfMeasureId: string,
    actorUserId: string,
    input: UpdateUnitOfMeasureBody,
  ): Promise<UnitOfMeasureRecord | null> {
    const update:
      Record<string, unknown> = {
        updatedBy:
          toObjectId(
            actorUserId,
            'actorUserId',
          ),
      };

    if (input.name !== undefined) {
      update['name'] =
        input.name;

      update['normalizedName'] =
        normalizeFormularyText(
          input.name,
        );
    }

    if (input.symbol !== undefined) {
      update['symbol'] =
        input.symbol;
    }

    if (input.dimension !== undefined) {
      update['dimension'] =
        input.dimension;
    }

    if (input.decimalScale !== undefined) {
      update['decimalScale'] =
        input.decimalScale;
    }

    try {
      return record<UnitOfMeasureRecord | null>(
        await UnitOfMeasureModel.findOneAndUpdate(
          {
            _id:
              toObjectId(
                unitOfMeasureId,
                'unitOfMeasureId',
              ),

            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),

            version:
              input.expectedVersion,
          },
          {
            $set:
              update,

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
            UNIT_OF_MEASURE_INTERNAL_SELECT,
          )
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedFormularyPrescriptionPersistenceError(
        error,
        'CREATE_UNIT_OF_MEASURE',
      );
    }
  }

  public async createMedicineStrength(
    facilityId: string,
    actorUserId: string,
    input: CreateMedicineStrengthBody,
  ): Promise<MedicineStrengthRecord> {
    try {
      const created =
        await MedicineStrengthModel.create({
          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          medicineId:
            toObjectId(
              input.medicineId,
              'medicineId',
            ),

          medicineFormId:
            toObjectId(
              input.medicineFormId,
              'medicineFormId',
            ),

          displayText:
            input.displayText,

          normalizedDisplayText:
            normalizeFormularyText(
              input.displayText,
            ),

          numeratorValue:
            Types.Decimal128.fromString(
              input.numeratorValue,
            ),

          numeratorUnitId:
            toObjectId(
              input.numeratorUnitId,
              'numeratorUnitId',
            ),

          denominatorValue:
            input.denominatorValue == null
              ? null
              : Types.Decimal128.fromString(
                  input.denominatorValue,
                ),

          denominatorUnitId:
            input.denominatorUnitId == null
              ? null
              : toObjectId(
                  input.denominatorUnitId,
                  'denominatorUnitId',
                ),

          status:
            'ACTIVE',

          deactivatedAt:
            null,

          deactivatedBy:
            null,

          deactivationReason:
            null,

          schemaVersion:
            1,

          version:
            0,

          createdBy:
            toObjectId(
              actorUserId,
              'actorUserId',
            ),

          updatedBy:
            toObjectId(
              actorUserId,
              'actorUserId',
            ),
        });

      return record<MedicineStrengthRecord>(
        created.toObject(),
      );
    } catch (error) {
      throwMappedFormularyPrescriptionPersistenceError(
        error,
        'CREATE_MEDICINE_STRENGTH',
      );
    }
  }

  public async updateMedicineStrength(
    facilityId: string,
    medicineStrengthId: string,
    actorUserId: string,
    input: UpdateMedicineStrengthBody,
  ): Promise<MedicineStrengthRecord | null> {
    const update:
      Record<string, unknown> = {
        updatedBy:
          toObjectId(
            actorUserId,
            'actorUserId',
          ),
      };

    if (input.displayText !== undefined) {
      update['displayText'] =
        input.displayText;

      update['normalizedDisplayText'] =
        normalizeFormularyText(
          input.displayText,
        );
    }

    if (input.numeratorValue !== undefined) {
      update['numeratorValue'] =
        Types.Decimal128.fromString(
          input.numeratorValue,
        );
    }

    if (
      Object.prototype.hasOwnProperty.call(
        input,
        'denominatorValue',
      )
    ) {
      update['denominatorValue'] =
        input.denominatorValue == null
          ? null
          : Types.Decimal128.fromString(
              input.denominatorValue,
            );
    }

    if (
      Object.prototype.hasOwnProperty.call(
        input,
        'denominatorUnitId',
      )
    ) {
      update['denominatorUnitId'] =
        input.denominatorUnitId == null
          ? null
          : toObjectId(
              input.denominatorUnitId,
              'denominatorUnitId',
            );
    }

    try {
      return record<MedicineStrengthRecord | null>(
        await MedicineStrengthModel.findOneAndUpdate(
          {
            _id:
              toObjectId(
                medicineStrengthId,
                'medicineStrengthId',
              ),

            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),

            version:
              input.expectedVersion,
          },
          {
            $set:
              update,

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
            MEDICINE_STRENGTH_INTERNAL_SELECT,
          )
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedFormularyPrescriptionPersistenceError(
        error,
        'CREATE_MEDICINE_STRENGTH',
      );
    }
  }

  public async createPrescriptionFrequency(
    facilityId: string,
    actorUserId: string,
    input: CreatePrescriptionFrequencyBody,
  ): Promise<PrescriptionFrequencyRecord> {
    try {
      const created =
        await PrescriptionFrequencyModel.create({
          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          code:
            normalizeFormularyCode(
              input.code,
            ),

          name:
            input.name,

          normalizedName:
            normalizeFormularyText(
              input.name,
            ),

          kind:
            input.kind,

          timesPerDay:
            input.timesPerDay ??
            null,

          intervalMinutes:
            input.intervalMinutes ??
            null,

          defaultAdministrationTimes:
            uniqueNormalizedStrings(
              input.defaultAdministrationTimes,
            ),

          allowsAsNeeded:
            input.allowsAsNeeded,

          maxAdministrationsPerDay:
            input.maxAdministrationsPerDay ??
            null,

          patientInstructionTemplate:
            normalizeNullableFormularyText(
              input.patientInstructionTemplate,
            ),

          status:
            'ACTIVE',

          deactivatedAt:
            null,

          deactivatedBy:
            null,

          deactivationReason:
            null,

          schemaVersion:
            1,

          version:
            0,

          createdBy:
            toObjectId(
              actorUserId,
              'actorUserId',
            ),

          updatedBy:
            toObjectId(
              actorUserId,
              'actorUserId',
            ),
        });

      return record<PrescriptionFrequencyRecord>(
        created.toObject(),
      );
    } catch (error) {
      throwMappedFormularyPrescriptionPersistenceError(
        error,
        'CREATE_PRESCRIPTION_FREQUENCY',
      );
    }
  }

  public async updatePrescriptionFrequency(
    facilityId: string,
    prescriptionFrequencyId: string,
    actorUserId: string,
    input: UpdatePrescriptionFrequencyBody,
  ): Promise<PrescriptionFrequencyRecord | null> {
    const update:
      Record<string, unknown> = {
        updatedBy:
          toObjectId(
            actorUserId,
            'actorUserId',
          ),
      };

    if (input.name !== undefined) {
      update['name'] =
        input.name;

      update['normalizedName'] =
        normalizeFormularyText(
          input.name,
        );
    }

    if (input.kind !== undefined) {
      update['kind'] =
        input.kind;
    }

    if (input.timesPerDay !== undefined) {
      update['timesPerDay'] =
        input.timesPerDay;
    }

    if (input.intervalMinutes !== undefined) {
      update['intervalMinutes'] =
        input.intervalMinutes;
    }

    if (
      input.defaultAdministrationTimes !==
      undefined
    ) {
      update['defaultAdministrationTimes'] =
        uniqueNormalizedStrings(
          input.defaultAdministrationTimes,
        );
    }

    if (input.allowsAsNeeded !== undefined) {
      update['allowsAsNeeded'] =
        input.allowsAsNeeded;
    }

    if (
      input.maxAdministrationsPerDay !==
      undefined
    ) {
      update['maxAdministrationsPerDay'] =
        input.maxAdministrationsPerDay;
    }

    if (
      input.patientInstructionTemplate !==
      undefined
    ) {
      update['patientInstructionTemplate'] =
        normalizeNullableFormularyText(
          input.patientInstructionTemplate,
        );
    }

    try {
      return record<PrescriptionFrequencyRecord | null>(
        await PrescriptionFrequencyModel.findOneAndUpdate(
          {
            _id:
              toObjectId(
                prescriptionFrequencyId,
                'prescriptionFrequencyId',
              ),

            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),

            version:
              input.expectedVersion,
          },
          {
            $set:
              update,

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
            PRESCRIPTION_FREQUENCY_INTERNAL_SELECT,
          )
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedFormularyPrescriptionPersistenceError(
        error,
        'CREATE_PRESCRIPTION_FREQUENCY',
      );
    }
  }

  public async createFormularyItem(
    input: Omit<
      FormularyItemRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<FormularyItemRecord> {
    try {
      const created =
        await FormularyItemModel.create(
          input,
        );

      return record<FormularyItemRecord>(
        created.toObject(),
      );
    } catch (error) {
      throwMappedFormularyPrescriptionPersistenceError(
        error,
        'CREATE_FORMULARY_ITEM',
      );
    }
  }

  public async updateFormularyItem(
    facilityId: string,
    formularyItemId: string,
    expectedVersion: number,
    update: FormularyItemPersistenceUpdate,
  ): Promise<FormularyItemRecord | null> {
    const {
      version:
        _ignoredVersion,
      ...safeUpdate
    } = update;

    try {
      return record<FormularyItemRecord | null>(
        await FormularyItemModel.findOneAndUpdate(
          {
            _id:
              toObjectId(
                formularyItemId,
                'formularyItemId',
              ),

            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),

            version:
              expectedVersion,
          },
          {
            $set:
              safeUpdate,

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
            FORMULARY_ITEM_INTERNAL_SELECT,
          )
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedFormularyPrescriptionPersistenceError(
        error,
        'CREATE_FORMULARY_ITEM',
      );
    }
  }

  public async changeFormularyItemStatus(
    facilityId: string,
    formularyItemId: string,
    expectedVersion: number,
    status: FormularyItemStatus,
    actorUserId: string,
    reason: string,
    occurredAt: Date,
  ): Promise<FormularyItemRecord | null> {
    const existing =
      await this.findFormularyItemById(
        facilityId,
        formularyItemId,
      );

    if (existing === null) {
      return null;
    }

    const activeSelectionKey =
      status === 'ACTIVE'
        ? [
            existing.medicineId.toHexString(),
            existing.medicineFormId.toHexString(),
            existing.medicineStrengthId.toHexString(),
            existing.normalizedBrandName ??
              '-',
          ].join(':')
        : null;

    const lifecycle =
      status === 'INACTIVE'
        ? {
            deactivatedAt:
              occurredAt,

            deactivatedBy:
              toObjectId(
                actorUserId,
                'actorUserId',
              ),

            deactivationReason:
              reason,
          }
        : {
            deactivatedAt:
              null,

            deactivatedBy:
              null,

            deactivationReason:
              null,
          };

    try {
      return record<FormularyItemRecord | null>(
        await FormularyItemModel.findOneAndUpdate(
          {
            _id:
              toObjectId(
                formularyItemId,
                'formularyItemId',
              ),

            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),

            version:
              expectedVersion,
          },
          {
            $set: {
              status,
              activeSelectionKey,
              ...lifecycle,

              updatedBy:
                toObjectId(
                  actorUserId,
                  'actorUserId',
                ),
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
            FORMULARY_ITEM_INTERNAL_SELECT,
          )
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedFormularyPrescriptionPersistenceError(
        error,
        'CREATE_FORMULARY_ITEM',
      );
    }
  }
}