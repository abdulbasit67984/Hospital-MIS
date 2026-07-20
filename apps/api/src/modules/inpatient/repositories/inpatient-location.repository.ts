import type {
  FilterQuery,
} from 'mongoose';

import {
  BedModel,
  BedRateModel,
  BedRateVersionModel,
  RoomModel,
  WardModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  throwMappedInpatientPersistenceError,
} from '../inpatient.errors.js';

import type {
  BedRatePersistenceUpdate,
  BedPersistenceUpdate,
  InpatientLocationRepositoryPort,
  RoomPersistenceUpdate,
  WardPersistenceUpdate,
} from '../inpatient.ports.js';

import type {
  BedRateRecord,
  BedRateVersionRecord,
  BedRecord,
  RoomRecord,
  WardRecord,
} from '../inpatient.persistence.types.js';

import type {
  InpatientBedRateResolution,
  InpatientBedRateResolutionQuery,
  InpatientLocationListQuery,
} from '../inpatient.types.js';

const WARD_SELECT = [
  '_id',
  'facilityId',
  'wardCode',
  'name',
  'normalizedName',
  'wardType',
  'departmentId',
  'servicePointId',
  'nursingStationCode',
  'description',
  'displayOrder',
  'permittedSexes',
  'minimumAgeYears',
  'maximumAgeYears',
  'specialtyCodes',
  'isolationCapabilities',
  'infectionControlTags',
  'negativePressureCapable',
  'cohortingAllowed',
  'status',
  'activatedAt',
  'activatedBy',
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

const ROOM_SELECT = [
  '_id',
  'facilityId',
  'wardId',
  'departmentId',
  'servicePointId',
  'roomCode',
  'roomNumber',
  'name',
  'normalizedName',
  'roomType',
  'roomClass',
  'capacity',
  'floorCode',
  'description',
  'displayOrder',
  'permittedSexes',
  'minimumAgeYears',
  'maximumAgeYears',
  'specialtyCodes',
  'isolationCapabilities',
  'infectionControlTags',
  'negativePressureCapable',
  'cohortingAllowed',
  'status',
  'activatedAt',
  'activatedBy',
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

const BED_SELECT = [
  '_id',
  'facilityId',
  'wardId',
  'roomId',
  'departmentId',
  'servicePointId',
  'bedCode',
  'bedNumber',
  'label',
  'normalizedLabel',
  'bedCategory',
  'operationalStatus',
  'operationalStatusChangedAt',
  'operationalStatusChangedBy',
  'operationalStatusReasonCode',
  '+operationalStatusReason',
  'currentAdmissionId',
  'currentAssignmentId',
  '+currentPatientId',
  'activeHoldId',
  'lastReleasedAt',
  'turnaroundRequiredAfterRelease',
  'maintenanceReference',
  'displayOrder',
  'permittedSexes',
  'minimumAgeYears',
  'maximumAgeYears',
  'specialtyCodes',
  'isolationCapabilities',
  'infectionControlTags',
  'negativePressureCapable',
  'cohortingAllowed',
  'status',
  'activatedAt',
  'activatedBy',
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

const BED_RATE_SELECT = [
  '_id',
  'facilityId',
  'rateCode',
  'name',
  'scope',
  'scopeKey',
  'scopeReferenceId',
  'scopeCode',
  'currencyCode',
  'amount',
  'chargingPolicy',
  'chargeCatalogItemId',
  'priceListId',
  'payerOrganizationId',
  'panelPlanId',
  'treatmentPackageId',
  'effectiveFrom',
  'effectiveThrough',
  'status',
  'currentVersion',
  'latestVersionId',
  'activatedAt',
  'activatedBy',
  'supersededAt',
  'supersededBy',
  'supersededByRateId',
  'cancelledAt',
  'cancelledBy',
  '+cancellationReason',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const BED_RATE_VERSION_SELECT = [
  '_id',
  'facilityId',
  'bedRateId',
  'versionNumber',
  'previousVersionId',
  'changeType',
  'rateCodeSnapshot',
  'nameSnapshot',
  'scopeSnapshot',
  'scopeKeySnapshot',
  'scopeReferenceIdSnapshot',
  'scopeCodeSnapshot',
  'currencyCodeSnapshot',
  'amountSnapshot',
  'chargingPolicySnapshot',
  'chargeCatalogItemIdSnapshot',
  'priceListIdSnapshot',
  'payerOrganizationIdSnapshot',
  'panelPlanIdSnapshot',
  'treatmentPackageIdSnapshot',
  'effectiveFromSnapshot',
  'effectiveThroughSnapshot',
  'statusSnapshot',
  'snapshotHash',
  '+changeReason',
  'recordedAt',
  'recordedBy',
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
  value:
    unknown,
): T {
  return value as T;
}

function escapeRegex(
  value:
    string,
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/gu,
    '\\$&',
  );
}

function paging(
  query:
    InpatientLocationListQuery,
) {
  return {
    skip:
      (
        query.page -
        1
      ) *
      query.pageSize,

    limit:
      query.pageSize,
  };
}

function sortDirection(
  direction:
    'asc' | 'desc',
): 1 | -1 {
  return direction === 'asc'
    ? 1
    : -1;
}

function nullableObjectId(
  value:
    string |
    null |
    undefined,
) {
  return value == null
    ? null
    : toObjectId(
        value,
        'referenceId',
      );
}

export class InpatientLocationRepository
implements InpatientLocationRepositoryPort {
  public async findWardById(
    facilityId:
      string,

    wardId:
      string,
  ): Promise<
    WardRecord | null
  > {
    return record<
      WardRecord | null
    >(
      await WardModel.findOne({
        _id:
          toObjectId(
            wardId,
            'wardId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          WARD_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async findRoomById(
    facilityId:
      string,

    roomId:
      string,
  ): Promise<
    RoomRecord | null
  > {
    return record<
      RoomRecord | null
    >(
      await RoomModel.findOne({
        _id:
          toObjectId(
            roomId,
            'roomId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          ROOM_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async findBedById(
    facilityId:
      string,

    bedId:
      string,
  ): Promise<
    BedRecord | null
  > {
    return record<
      BedRecord | null
    >(
      await BedModel.findOne({
        _id:
          toObjectId(
            bedId,
            'bedId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          BED_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async listWards(
    facilityId:
      string,

    query:
      InpatientLocationListQuery,
  ): Promise<{
    items:
      WardRecord[];

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

    if (
      query.departmentId !==
      undefined
    ) {
      filter[
        'departmentId'
      ] =
        toObjectId(
          query.departmentId,
          'departmentId',
        );
    }

    if (
      query.servicePointId !==
      undefined
    ) {
      filter[
        'servicePointId'
      ] =
        toObjectId(
          query.servicePointId,
          'servicePointId',
        );
    }

    if (
      query.status !==
      undefined
    ) {
      filter[
        'status'
      ] =
        query.status;
    }

    if (
      query.wardType !==
      undefined
    ) {
      filter[
        'wardType'
      ] =
        query.wardType;
    }

    if (
      query.specialtyCode !==
      undefined
    ) {
      filter[
        'specialtyCodes'
      ] =
        query
          .specialtyCode
          .trim()
          .toUpperCase();
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

      filter[
        '$or'
      ] = [
        {
          wardCode:
            expression,
        },
        {
          name:
            expression,
        },
      ];
    }

    const {
      skip,
      limit,
    } =
      paging(
        query,
      );

    const sortField =
      query.sortBy === 'code'
        ? 'wardCode'
        : query.sortBy ===
            'displayOrder'
          ? 'displayOrder'
          : query.sortBy;

    const [
      items,
      total,
    ] =
      await Promise.all([
        WardModel.find(
          filter,
        )
          .select(
            WARD_SELECT,
          )
          .sort({
            [
              sortField
            ]:
              sortDirection(
                query
                  .sortDirection,
              ),

            _id:
              1,
          })
          .skip(
            skip,
          )
          .limit(
            limit,
          )
          .lean()
          .exec(),

        WardModel
          .countDocuments(
            filter,
          )
          .exec(),
      ]);

    return {
      items:
        record<
          WardRecord[]
        >(
          items,
        ),

      total,
    };
  }

  public async listRooms(
    facilityId:
      string,

    query:
      InpatientLocationListQuery,
  ): Promise<{
    items:
      RoomRecord[];

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

    if (
      query.wardId !==
      undefined
    ) {
      filter[
        'wardId'
      ] =
        toObjectId(
          query.wardId,
          'wardId',
        );
    }

    if (
      query.departmentId !==
      undefined
    ) {
      filter[
        'departmentId'
      ] =
        toObjectId(
          query.departmentId,
          'departmentId',
        );
    }

    if (
      query.servicePointId !==
      undefined
    ) {
      filter[
        'servicePointId'
      ] =
        toObjectId(
          query.servicePointId,
          'servicePointId',
        );
    }

    if (
      query.status !==
      undefined
    ) {
      filter[
        'status'
      ] =
        query.status;
    }

    if (
      query.roomType !==
      undefined
    ) {
      filter[
        'roomType'
      ] =
        query.roomType;
    }

    if (
      query.roomClass !==
      undefined
    ) {
      filter[
        'roomClass'
      ] =
        query.roomClass;
    }

    if (
      query.specialtyCode !==
      undefined
    ) {
      filter[
        'specialtyCodes'
      ] =
        query
          .specialtyCode
          .trim()
          .toUpperCase();
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

      filter[
        '$or'
      ] = [
        {
          roomCode:
            expression,
        },
        {
          roomNumber:
            expression,
        },
        {
          name:
            expression,
        },
      ];
    }

    const {
      skip,
      limit,
    } =
      paging(
        query,
      );

    const sortField =
      query.sortBy === 'code'
        ? 'roomCode'
        : query.sortBy ===
            'displayOrder'
          ? 'displayOrder'
          : query.sortBy;

    const [
      items,
      total,
    ] =
      await Promise.all([
        RoomModel.find(
          filter,
        )
          .select(
            ROOM_SELECT,
          )
          .sort({
            [
              sortField
            ]:
              sortDirection(
                query
                  .sortDirection,
              ),

            _id:
              1,
          })
          .skip(
            skip,
          )
          .limit(
            limit,
          )
          .lean()
          .exec(),

        RoomModel
          .countDocuments(
            filter,
          )
          .exec(),
      ]);

    return {
      items:
        record<
          RoomRecord[]
        >(
          items,
        ),

      total,
    };
  }

  public async listBeds(
    facilityId:
      string,

    query:
      InpatientLocationListQuery,
  ): Promise<{
    items:
      BedRecord[];

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

    if (
      query.wardId !==
      undefined
    ) {
      filter[
        'wardId'
      ] =
        toObjectId(
          query.wardId,
          'wardId',
        );
    }

    if (
      query.roomId !==
      undefined
    ) {
      filter[
        'roomId'
      ] =
        toObjectId(
          query.roomId,
          'roomId',
        );
    }

    if (
      query.departmentId !==
      undefined
    ) {
      filter[
        'departmentId'
      ] =
        toObjectId(
          query.departmentId,
          'departmentId',
        );
    }

    if (
      query.servicePointId !==
      undefined
    ) {
      filter[
        'servicePointId'
      ] =
        toObjectId(
          query.servicePointId,
          'servicePointId',
        );
    }

    if (
      query.status !==
      undefined
    ) {
      filter[
        'status'
      ] =
        query.status;
    }

    if (
      query.bedStatus !==
      undefined
    ) {
      filter[
        'operationalStatus'
      ] =
        query.bedStatus;
    }

    if (
      query.bedCategory !==
      undefined
    ) {
      filter[
        'bedCategory'
      ] =
        query.bedCategory;
    }

    if (
      query.specialtyCode !==
      undefined
    ) {
      filter[
        'specialtyCodes'
      ] =
        query
          .specialtyCode
          .trim()
          .toUpperCase();
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

      filter[
        '$or'
      ] = [
        {
          bedCode:
            expression,
        },
        {
          bedNumber:
            expression,
        },
        {
          label:
            expression,
        },
      ];
    }

    const {
      skip,
      limit,
    } =
      paging(
        query,
      );

    const sortField =
      query.sortBy === 'code'
        ? 'bedCode'
        : query.sortBy ===
            'displayOrder'
          ? 'displayOrder'
          : query.sortBy;

    const [
      items,
      total,
    ] =
      await Promise.all([
        BedModel.find(
          filter,
        )
          .select(
            BED_SELECT,
          )
          .sort({
            [
              sortField
            ]:
              sortDirection(
                query
                  .sortDirection,
              ),

            _id:
              1,
          })
          .skip(
            skip,
          )
          .limit(
            limit,
          )
          .lean()
          .exec(),

        BedModel
          .countDocuments(
            filter,
          )
          .exec(),
      ]);

    return {
      items:
        record<
          BedRecord[]
        >(
          items,
        ),

      total,
    };
  }

  public async createWard(
    input:
      Omit<
        WardRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<
    WardRecord
  > {
    try {
      const created =
        await WardModel.create(
          input,
        );

      return record<
        WardRecord
      >(
        await WardModel.findById(
          created._id,
        )
          .select(
            WARD_SELECT,
          )
          .lean()
          .orFail()
          .exec(),
      );
    } catch (
      error
    ) {
      throwMappedInpatientPersistenceError(
        error,
        'CREATE_WARD',
      );
    }
  }

  public async updateWard(
    facilityId:
      string,

    wardId:
      string,

    expectedVersion:
      number,

    update:
      WardPersistenceUpdate,
  ): Promise<
    WardRecord | null
  > {
    try {
      return record<
        WardRecord | null
      >(
        await WardModel
          .findOneAndUpdate(
            {
              _id:
                toObjectId(
                  wardId,
                  'wardId',
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
            WARD_SELECT,
          )
          .lean()
          .exec(),
      );
    } catch (
      error
    ) {
      throwMappedInpatientPersistenceError(
        error,
        'UPDATE_WARD',
      );
    }
  }

  public async changeWardStatus(
    facilityId:
      string,

    wardId:
      string,

    expectedVersion:
      number,

    status:
      WardRecord[
        'status'
      ],

    actorUserId:
      string,

    reason:
      string,

    occurredAt:
      Date,
  ): Promise<
    WardRecord | null
  > {
    const active =
      status === 'ACTIVE';

    return this.updateWard(
      facilityId,
      wardId,
      expectedVersion,
      {
        status,

        activatedAt:
          active
            ? occurredAt
            : undefined,

        activatedBy:
          active
            ? toObjectId(
                actorUserId,
                'actorUserId',
              )
            : undefined,

        deactivatedAt:
          active
            ? null
            : occurredAt,

        deactivatedBy:
          active
            ? null
            : toObjectId(
                actorUserId,
                'actorUserId',
              ),

        deactivationReason:
          active
            ? null
            : reason,

        updatedBy:
          toObjectId(
            actorUserId,
            'actorUserId',
          ),
      } as WardPersistenceUpdate,
    );
  }

  public async createRoom(
    input:
      Omit<
        RoomRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<
    RoomRecord
  > {
    try {
      const created =
        await RoomModel.create(
          input,
        );

      return record<
        RoomRecord
      >(
        await RoomModel.findById(
          created._id,
        )
          .select(
            ROOM_SELECT,
          )
          .lean()
          .orFail()
          .exec(),
      );
    } catch (
      error
    ) {
      throwMappedInpatientPersistenceError(
        error,
        'CREATE_ROOM',
      );
    }
  }

  public async updateRoom(
    facilityId:
      string,

    roomId:
      string,

    expectedVersion:
      number,

    update:
      RoomPersistenceUpdate,
  ): Promise<
    RoomRecord | null
  > {
    try {
      return record<
        RoomRecord | null
      >(
        await RoomModel
          .findOneAndUpdate(
            {
              _id:
                toObjectId(
                  roomId,
                  'roomId',
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
            ROOM_SELECT,
          )
          .lean()
          .exec(),
      );
    } catch (
      error
    ) {
      throwMappedInpatientPersistenceError(
        error,
        'UPDATE_ROOM',
      );
    }
  }

  public async changeRoomStatus(
    facilityId:
      string,

    roomId:
      string,

    expectedVersion:
      number,

    status:
      RoomRecord[
        'status'
      ],

    actorUserId:
      string,

    reason:
      string,

    occurredAt:
      Date,
  ): Promise<
    RoomRecord | null
  > {
    const active =
      status === 'ACTIVE';

    return this.updateRoom(
      facilityId,
      roomId,
      expectedVersion,
      {
        status,

        activatedAt:
          active
            ? occurredAt
            : undefined,

        activatedBy:
          active
            ? toObjectId(
                actorUserId,
                'actorUserId',
              )
            : undefined,

        deactivatedAt:
          active
            ? null
            : occurredAt,

        deactivatedBy:
          active
            ? null
            : toObjectId(
                actorUserId,
                'actorUserId',
              ),

        deactivationReason:
          active
            ? null
            : reason,

        updatedBy:
          toObjectId(
            actorUserId,
            'actorUserId',
          ),
      } as RoomPersistenceUpdate,
    );
  }

  public async createBed(
    input:
      Omit<
        BedRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<
    BedRecord
  > {
    try {
      const created =
        await BedModel.create(
          input,
        );

      return record<
        BedRecord
      >(
        await BedModel.findById(
          created._id,
        )
          .select(
            BED_SELECT,
          )
          .lean()
          .orFail()
          .exec(),
      );
    } catch (
      error
    ) {
      throwMappedInpatientPersistenceError(
        error,
        'CREATE_BED',
      );
    }
  }

  public async updateBed(
    facilityId:
      string,

    bedId:
      string,

    expectedVersion:
      number,

    update:
      BedPersistenceUpdate,
  ): Promise<
    BedRecord | null
  > {
    try {
      return record<
        BedRecord | null
      >(
        await BedModel
          .findOneAndUpdate(
            {
              _id:
                toObjectId(
                  bedId,
                  'bedId',
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
            BED_SELECT,
          )
          .lean()
          .exec(),
      );
    } catch (
      error
    ) {
      throwMappedInpatientPersistenceError(
        error,
        'UPDATE_BED',
      );
    }
  }

  public async changeBedCatalogStatus(
    facilityId:
      string,

    bedId:
      string,

    expectedVersion:
      number,

    status:
      BedRecord[
        'status'
      ],

    actorUserId:
      string,

    reason:
      string,

    occurredAt:
      Date,
  ): Promise<
    BedRecord | null
  > {
    const active =
      status === 'ACTIVE';

    return this.updateBed(
      facilityId,
      bedId,
      expectedVersion,
      {
        status,

        activatedAt:
          active
            ? occurredAt
            : undefined,

        activatedBy:
          active
            ? toObjectId(
                actorUserId,
                'actorUserId',
              )
            : undefined,

        deactivatedAt:
          active
            ? null
            : occurredAt,

        deactivatedBy:
          active
            ? null
            : toObjectId(
                actorUserId,
                'actorUserId',
              ),

        deactivationReason:
          active
            ? null
            : reason,

        updatedBy:
          toObjectId(
            actorUserId,
            'actorUserId',
          ),
      } as BedPersistenceUpdate,
    );
  }

  public async findBedRateById(
    facilityId:
      string,

    bedRateId:
      string,
  ): Promise<
    BedRateRecord | null
  > {
    return record<
      BedRateRecord | null
    >(
      await BedRateModel.findOne({
        _id:
          toObjectId(
            bedRateId,
            'bedRateId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          BED_RATE_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async createBedRate(
    input:
      Omit<
        BedRateRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<
    BedRateRecord
  > {
    try {
      const created =
        await BedRateModel.create(
          input,
        );

      return record<
        BedRateRecord
      >(
        await BedRateModel
          .findById(
            created._id,
          )
          .select(
            BED_RATE_SELECT,
          )
          .lean()
          .orFail()
          .exec(),
      );
    } catch (
      error
    ) {
      throwMappedInpatientPersistenceError(
        error,
        'CREATE_BED_RATE',
      );
    }
  }

  public async updateBedRate(
    facilityId:
      string,

    bedRateId:
      string,

    expectedVersion:
      number,

    update:
      BedRatePersistenceUpdate,
  ): Promise<
    BedRateRecord | null
  > {
    try {
      return record<
        BedRateRecord | null
      >(
        await BedRateModel
          .findOneAndUpdate(
            {
              _id:
                toObjectId(
                  bedRateId,
                  'bedRateId',
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
            BED_RATE_SELECT,
          )
          .lean()
          .exec(),
      );
    } catch (
      error
    ) {
      throwMappedInpatientPersistenceError(
        error,
        'UPDATE_BED_RATE',
      );
    }
  }

  public async createBedRateVersion(
    input:
      Omit<
        BedRateVersionRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<
    BedRateVersionRecord
  > {
    try {
      const created =
        await BedRateVersionModel.create(
          input,
        );

      return record<
        BedRateVersionRecord
      >(
        await BedRateVersionModel
          .findById(
            created._id,
          )
          .select(
            BED_RATE_VERSION_SELECT,
          )
          .lean()
          .orFail()
          .exec(),
      );
    } catch (
      error
    ) {
      throwMappedInpatientPersistenceError(
        error,
        'CREATE_BED_RATE_VERSION',
      );
    }
  }

  public async findOverlappingBedRate(
    facilityId:
      string,

    scopeKey:
      string,

    effectiveFrom:
      Date,

    effectiveThrough:
      Date | null,

    excludedBedRateId?:
      string,
  ): Promise<
    BedRateRecord | null
  > {
    const filter:
      FilterQuery<unknown> = {
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        scopeKey:
          scopeKey
            .trim()
            .toUpperCase(),

        status: {
          $in: [
            'DRAFT',
            'ACTIVE',
          ],
        },

        effectiveFrom: {
          $lt:
            effectiveThrough ??
            new Date(
              '9999-12-31T23:59:59.999Z',
            ),
        },

        $or: [
          {
            effectiveThrough:
              null,
          },
          {
            effectiveThrough: {
              $gt:
                effectiveFrom,
            },
          },
        ],
      };

    if (
      excludedBedRateId !==
      undefined
    ) {
      filter[
        '_id'
      ] = {
        $ne:
          toObjectId(
            excludedBedRateId,
            'excludedBedRateId',
          ),
      };
    }

    return record<
      BedRateRecord | null
    >(
      await BedRateModel.findOne(
        filter,
      )
        .select(
          BED_RATE_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async resolveEffectiveBedRate(
    query:
      InpatientBedRateResolutionQuery,
  ): Promise<
    InpatientBedRateResolution | null
  > {
    const facilityId =
      toObjectId(
        query.facilityId,
        'facilityId',
      );

    const wardId =
      toObjectId(
        query.wardId,
        'wardId',
      );

    const roomId =
      toObjectId(
        query.roomId,
        'roomId',
      );

    const bedId =
      toObjectId(
        query.bedId,
        'bedId',
      );

    const candidates =
      record<
        BedRateRecord[]
      >(
        await BedRateModel.find({
          facilityId,

          status:
            'ACTIVE',

          effectiveFrom: {
            $lte:
              query.occurredAt,
          },

          $and: [
            {
              $or: [
                {
                  effectiveThrough:
                    null,
                },
                {
                  effectiveThrough: {
                    $gt:
                      query.occurredAt,
                  },
                },
              ],
            },
            {
              $or: [
                {
                  scope:
                    'BED',

                  scopeReferenceId:
                    bedId,
                },
                {
                  scope:
                    'ROOM',

                  scopeReferenceId:
                    roomId,
                },
                {
                  scope:
                    'WARD',

                  scopeReferenceId:
                    wardId,
                },
                {
                  scope:
                    'BED_CATEGORY',

                  scopeCode:
                    query
                      .bedCategory,
                },
              ],
            },
            {
              payerOrganizationId: {
                $in: [
                  null,
                  nullableObjectId(
                    query
                      .payerOrganizationId,
                  ),
                ],
              },
            },
            {
              panelPlanId: {
                $in: [
                  null,
                  nullableObjectId(
                    query.panelPlanId,
                  ),
                ],
              },
            },
            {
              treatmentPackageId: {
                $in: [
                  null,
                  nullableObjectId(
                    query
                      .treatmentPackageId,
                  ),
                ],
              },
            },
          ],
        })
          .select(
            BED_RATE_SELECT,
          )
          .lean()
          .exec(),
      );

    if (
      candidates.length ===
      0
    ) {
      return null;
    }

    const scopeWeight:
      Record<
        BedRateRecord[
          'scope'
        ],
        number
      > = {
        BED:
          400,

        ROOM:
          300,

        WARD:
          200,

        BED_CATEGORY:
          100,
      };

    const financialWeight = (
      candidate:
        BedRateRecord,
    ): number => {
      let score =
        0;

      if (
        query
          .payerOrganizationId !=
          null &&
        candidate
          .payerOrganizationId
          ?.toHexString() ===
          query
            .payerOrganizationId
      ) {
        score +=
          40;
      }

      if (
        query.panelPlanId !=
          null &&
        candidate
          .panelPlanId
          ?.toHexString() ===
          query.panelPlanId
      ) {
        score +=
          20;
      }

      if (
        query
          .treatmentPackageId !=
          null &&
        candidate
          .treatmentPackageId
          ?.toHexString() ===
          query
            .treatmentPackageId
      ) {
        score +=
          10;
      }

      return score;
    };

    candidates.sort(
      (
        left,
        right,
      ) => {
        const scoreDifference =
          scopeWeight[
            right.scope
          ] +
          financialWeight(
            right,
          ) -
          (
            scopeWeight[
              left.scope
            ] +
            financialWeight(
              left,
            )
          );

        if (
          scoreDifference !==
          0
        ) {
          return scoreDifference;
        }

        return (
          right
            .effectiveFrom
            .getTime() -
          left
            .effectiveFrom
            .getTime()
        );
      },
    );

    const selected =
      candidates[0];

    if (
      selected === undefined ||
      selected.latestVersionId ===
        null
    ) {
      return null;
    }

    const version =
      record<
        BedRateVersionRecord | null
      >(
        await BedRateVersionModel.findOne({
          _id:
            selected
              .latestVersionId,

          facilityId,

          bedRateId:
            selected._id,

          versionNumber:
            selected
              .currentVersion,
        })
          .select(
            BED_RATE_VERSION_SELECT,
          )
          .lean()
          .exec(),
      );

    if (
      version === null
    ) {
      return null;
    }

    return {
      bedRateId:
        selected
          ._id
          .toHexString(),

      versionId:
        version
          ._id
          .toHexString(),

      versionNumber:
        version.versionNumber,

      rateCode:
        version
          .rateCodeSnapshot,

      status:
        selected.status,

      amount:
        version
          .amountSnapshot
          .toString(),

      currencyCode:
        version
          .currencyCodeSnapshot,

      scope:
        version
          .scopeSnapshot,

      scopeReferenceId:
        version
          .scopeReferenceIdSnapshot
          ?.toHexString() ??
        null,

      scopeCode:
        version
          .scopeCodeSnapshot,

      chargingPolicy: {
        ...version
          .chargingPolicySnapshot,
      },
    };
  }
}