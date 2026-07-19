import type {
  FilterQuery,
} from 'mongoose';

import {
  RadiologyModalityModel,
  RadiologyProcedureModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  RadiologyCatalogRepositoryPort,
  RadiologyModalityPersistenceUpdate,
  RadiologyProcedurePersistenceUpdate,
} from '../radiology.ports.js';

import type {
  RadiologyModalityRecord,
  RadiologyProcedureRecord,
} from '../radiology.persistence.types.js';

import type {
  RadiologyCatalogSearchQuery,
} from '../radiology.types.js';

import {
  throwMappedRadiologyPersistenceError,
} from '../radiology.errors.js';

const MODALITY_SELECT = [
  '_id',
  'facilityId',
  'modalityCode',
  'name',
  'normalizedName',
  'modalityType',
  'dicomModalityCode',
  'description',
  'availableDepartmentIds',
  'supportsContrast',
  'supportsPacsIntegration',
  'pacsRoutingCode',
  'orderable',
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

const PROCEDURE_SELECT = [
  '_id',
  'facilityId',
  'procedureCode',
  'name',
  'normalizedName',
  'aliases',
  'normalizedAliases',
  'description',
  'modalityId',
  'modalityCodeSnapshot',
  'modalityNameSnapshot',
  'modalityTypeSnapshot',
  'dicomModalityCodeSnapshot',
  'bodyRegions',
  'lateralityRequirement',
  'permittedLateralities',
  'contrastRequirement',
  'permittedContrastRoutes',
  'preparationInstructions',
  'contraindications',
  'safetyScreeningRequirements',
  'expectedDurationMinutes',
  'routineTurnaroundMinutes',
  'urgentTurnaroundMinutes',
  'statTurnaroundMinutes',
  'availableDepartmentIds',
  'schedulingRequired',
  'requiresTechnician',
  'requiresRadiologist',
  'orderable',
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
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export class RadiologyCatalogRepository
implements RadiologyCatalogRepositoryPort {
  public async findModalityById(
    facilityId: string,
    modalityId: string,
  ): Promise<RadiologyModalityRecord | null> {
    return record<RadiologyModalityRecord | null>(
      await RadiologyModalityModel.findOne({
        _id: toObjectId(modalityId, 'modalityId'),
        facilityId: toObjectId(facilityId, 'facilityId'),
      })
        .select(MODALITY_SELECT)
        .lean()
        .exec(),
    );
  }

  public async findProcedureById(
    facilityId: string,
    procedureId: string,
  ): Promise<RadiologyProcedureRecord | null> {
    return record<RadiologyProcedureRecord | null>(
      await RadiologyProcedureModel.findOne({
        _id: toObjectId(procedureId, 'procedureId'),
        facilityId: toObjectId(facilityId, 'facilityId'),
      })
        .select(PROCEDURE_SELECT)
        .lean()
        .exec(),
    );
  }

  public async findProceduresByIds(
    facilityId: string,
    procedureIds: readonly string[],
  ): Promise<RadiologyProcedureRecord[]> {
    if (procedureIds.length === 0) {
      return [];
    }

    return record<RadiologyProcedureRecord[]>(
      await RadiologyProcedureModel.find({
        facilityId: toObjectId(facilityId, 'facilityId'),
        _id: {
          $in: procedureIds.map((procedureId) =>
            toObjectId(procedureId, 'procedureIds'),
          ),
        },
      })
        .select(PROCEDURE_SELECT)
        .lean()
        .exec(),
    );
  }

  public async searchProcedures(
    facilityId: string,
    query: RadiologyCatalogSearchQuery,
  ): Promise<{
    items: RadiologyProcedureRecord[];
    total: number;
  }> {
    const filter: FilterQuery<unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
    };
    const andClauses: Record<string, unknown>[] = [];

    if (query.modalityId !== undefined) {
      filter['modalityId'] = toObjectId(query.modalityId, 'modalityId');
    }

    if (query.modalityType !== undefined) {
      filter['modalityTypeSnapshot'] = query.modalityType;
    }

    if (query.bodyRegionCode !== undefined) {
      filter['bodyRegions.code'] = query.bodyRegionCode
        .trim()
        .toUpperCase()
        .replaceAll(/[^A-Z0-9.-]+/gu, '_');
    }

    if (query.departmentId !== undefined) {
      filter['availableDepartmentIds'] = toObjectId(
        query.departmentId,
        'departmentId',
      );
    }

    if (query.contrastRequirement !== undefined) {
      filter['contrastRequirement'] = query.contrastRequirement;
    }

    if (query.status !== undefined) {
      filter['status'] = query.status;
    }

    if (query.orderable !== undefined) {
      filter['orderable'] = query.orderable;
    }

    if (query.effectiveAt !== undefined) {
      const effectiveAt = new Date(query.effectiveAt);
      filter['effectiveFrom'] = {
        $lte: effectiveAt,
      };
      andClauses.push({
        $or: [
          {
            effectiveThrough: null,
          },
          {
            effectiveThrough: {
              $gte: effectiveAt,
            },
          },
        ],
      });
    }

    if (query.search !== undefined) {
      const expression = new RegExp(
        escapeRegex(query.search.trim()),
        'iu',
      );
      andClauses.push({
        $or: [
          {
            procedureCode: expression,
          },
          {
            normalizedName: expression,
          },
          {
            normalizedAliases: expression,
          },
          {
            modalityNameSnapshot: expression,
          },
          {
            'bodyRegions.name': expression,
          },
        ],
      });
    }

    if (andClauses.length > 0) {
      filter['$and'] = andClauses;
    }

    const direction = query.sortDirection === 'asc' ? 1 : -1;
    const skip = (query.page - 1) * query.pageSize;

    const [items, total] = await Promise.all([
      RadiologyProcedureModel.find(filter)
        .select(PROCEDURE_SELECT)
        .sort({
          [query.sortBy]: direction,
          _id: direction,
        })
        .skip(skip)
        .limit(query.pageSize)
        .lean()
        .exec(),
      RadiologyProcedureModel.countDocuments(filter).exec(),
    ]);

    return {
      items: record<RadiologyProcedureRecord[]>(items),
      total,
    };
  }

  public async createModality(
    input: Omit<
      RadiologyModalityRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<RadiologyModalityRecord> {
    try {
      const document = await RadiologyModalityModel.create(input);
      return record<RadiologyModalityRecord>(document.toObject());
    } catch (error) {
      throwMappedRadiologyPersistenceError(error, 'CREATE_MODALITY');
    }
  }

  public async updateModality(
    facilityId: string,
    modalityId: string,
    expectedVersion: number,
    update: RadiologyModalityPersistenceUpdate,
  ): Promise<RadiologyModalityRecord | null> {
    const current = await RadiologyModalityModel.findOne({
      _id: toObjectId(modalityId, 'modalityId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
      version: expectedVersion,
    })
      .select(MODALITY_SELECT)
      .exec();

    if (current === null) {
      return null;
    }

    current.set(update);
    current.version = expectedVersion + 1;
    await current.validate();

    try {
      return record<RadiologyModalityRecord | null>(
        await RadiologyModalityModel.findOneAndUpdate(
          {
            _id: current._id,
            facilityId: current.facilityId,
            version: expectedVersion,
          },
          {
            $set: {
              name: current.name,
              normalizedName: current.normalizedName,
              modalityType: current.modalityType,
              dicomModalityCode: current.dicomModalityCode,
              description: current.description,
              availableDepartmentIds: current.availableDepartmentIds,
              supportsContrast: current.supportsContrast,
              supportsPacsIntegration: current.supportsPacsIntegration,
              pacsRoutingCode: current.pacsRoutingCode,
              orderable: current.orderable,
              effectiveFrom: current.effectiveFrom,
              effectiveThrough: current.effectiveThrough,
              updatedBy: current.updatedBy,
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
          .select(MODALITY_SELECT)
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedRadiologyPersistenceError(error, 'UPDATE_MODALITY');
    }
  }

  public async changeModalityStatus(
    facilityId: string,
    modalityId: string,
    expectedVersion: number,
    status: 'ACTIVE' | 'INACTIVE',
    actorUserId: string,
    reason: string,
    occurredAt: Date,
  ): Promise<RadiologyModalityRecord | null> {
    const inactive = status === 'INACTIVE';

    return record<RadiologyModalityRecord | null>(
      await RadiologyModalityModel.findOneAndUpdate(
        {
          _id: toObjectId(modalityId, 'modalityId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: expectedVersion,
        },
        {
          $set: {
            status,
            ...(inactive
              ? {
                  orderable: false,
                }
              : {}),
            deactivatedAt: inactive ? occurredAt : null,
            deactivatedBy: inactive
              ? toObjectId(actorUserId, 'actorUserId')
              : null,
            deactivationReason: inactive ? reason.trim() : null,
            updatedBy: toObjectId(actorUserId, 'actorUserId'),
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
        .select(MODALITY_SELECT)
        .lean()
        .exec(),
    );
  }

  public async createProcedure(
    input: Omit<
      RadiologyProcedureRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<RadiologyProcedureRecord> {
    try {
      const document = await RadiologyProcedureModel.create(input);
      return record<RadiologyProcedureRecord>(document.toObject());
    } catch (error) {
      throwMappedRadiologyPersistenceError(error, 'CREATE_PROCEDURE');
    }
  }

  public async updateProcedure(
    facilityId: string,
    procedureId: string,
    expectedVersion: number,
    update: RadiologyProcedurePersistenceUpdate,
  ): Promise<RadiologyProcedureRecord | null> {
    const current = await RadiologyProcedureModel.findOne({
      _id: toObjectId(procedureId, 'procedureId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
      version: expectedVersion,
    })
      .select(PROCEDURE_SELECT)
      .exec();

    if (current === null) {
      return null;
    }

    current.set(update);
    current.version = expectedVersion + 1;
    await current.validate();

    try {
      return record<RadiologyProcedureRecord | null>(
        await RadiologyProcedureModel.findOneAndUpdate(
          {
            _id: current._id,
            facilityId: current.facilityId,
            version: expectedVersion,
          },
          {
            $set: {
              name: current.name,
              normalizedName: current.normalizedName,
              aliases: current.aliases,
              normalizedAliases: current.normalizedAliases,
              description: current.description,
              modalityId: current.modalityId,
              modalityCodeSnapshot: current.modalityCodeSnapshot,
              modalityNameSnapshot: current.modalityNameSnapshot,
              modalityTypeSnapshot: current.modalityTypeSnapshot,
              dicomModalityCodeSnapshot:
                current.dicomModalityCodeSnapshot,
              bodyRegions: current.bodyRegions,
              lateralityRequirement: current.lateralityRequirement,
              permittedLateralities: current.permittedLateralities,
              contrastRequirement: current.contrastRequirement,
              permittedContrastRoutes: current.permittedContrastRoutes,
              preparationInstructions: current.preparationInstructions,
              contraindications: current.contraindications,
              safetyScreeningRequirements:
                current.safetyScreeningRequirements,
              expectedDurationMinutes: current.expectedDurationMinutes,
              routineTurnaroundMinutes: current.routineTurnaroundMinutes,
              urgentTurnaroundMinutes: current.urgentTurnaroundMinutes,
              statTurnaroundMinutes: current.statTurnaroundMinutes,
              availableDepartmentIds: current.availableDepartmentIds,
              schedulingRequired: current.schedulingRequired,
              requiresTechnician: current.requiresTechnician,
              requiresRadiologist: current.requiresRadiologist,
              orderable: current.orderable,
              chargeCatalogItemId: current.chargeCatalogItemId,
              effectiveFrom: current.effectiveFrom,
              effectiveThrough: current.effectiveThrough,
              updatedBy: current.updatedBy,
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
          .select(PROCEDURE_SELECT)
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedRadiologyPersistenceError(error, 'UPDATE_PROCEDURE');
    }
  }

  public async changeProcedureStatus(
    facilityId: string,
    procedureId: string,
    expectedVersion: number,
    status: 'ACTIVE' | 'INACTIVE',
    actorUserId: string,
    reason: string,
    occurredAt: Date,
  ): Promise<RadiologyProcedureRecord | null> {
    const inactive = status === 'INACTIVE';

    return record<RadiologyProcedureRecord | null>(
      await RadiologyProcedureModel.findOneAndUpdate(
        {
          _id: toObjectId(procedureId, 'procedureId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: expectedVersion,
        },
        {
          $set: {
            status,
            ...(inactive
              ? {
                  orderable: false,
                }
              : {}),
            deactivatedAt: inactive ? occurredAt : null,
            deactivatedBy: inactive
              ? toObjectId(actorUserId, 'actorUserId')
              : null,
            deactivationReason: inactive ? reason.trim() : null,
            updatedBy: toObjectId(actorUserId, 'actorUserId'),
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
        .select(PROCEDURE_SELECT)
        .lean()
        .exec(),
    );
  }
}