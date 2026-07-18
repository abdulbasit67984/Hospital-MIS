import type {
  FilterQuery,
  Types,
} from 'mongoose';

import {
  OpdClinicModel,
  QueueDefinitionModel,
  QueueTokenModel,
  ServiceCounterModel,
  ServicePointModel,
  StaffModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  QUEUE_PUBLIC_DISPLAY_SELECT,
} from '../registration-queue.projections.js';

import type {
  OpdClinicRecord,
  QueueDefinitionRecord,
  QueueTokenRecord,
  ServiceCounterRecord,
  ServicePointRecord,
} from '../registration-queue.types.js';

import type {
  QueueDashboardQuery,
  RegistrationQueueConfigurationQuery,
} from '../registration-queue.query.types.js';

export interface QueueReadProviderRecord {
  _id: Types.ObjectId;
  displayName: string;
}

export interface QueueReadMetadata {
  queueDefinitions:
    Map<string, QueueDefinitionRecord>;

  counters:
    Map<string, ServiceCounterRecord>;

  providers:
    Map<string, QueueReadProviderRecord>;
}

export interface QueueMetricRecord {
  status: QueueTokenRecord['status'];
  queuedAt: Date;
  calledAt: Date | null;
  servingAt: Date | null;
  completedAt: Date | null;
}

export interface RegistrationQueueConfigurationRecords {
  clinics: OpdClinicRecord[];
  servicePoints: ServicePointRecord[];
  queueDefinitions: QueueDefinitionRecord[];
  counters: ServiceCounterRecord[];
}

const QUEUE_DEFINITION_SELECT = [
  '_id',
  'facilityId',
  'departmentId',
  'clinicId',
  'servicePointId',
  'providerId',
  'code',
  'name',
  'displayLabel',
  'tokenPrefix',
  'resetPolicy',
  'timezone',
  'estimatedServiceMinutes',
  'maximumRecallCount',
  'allowPriority',
  'allowEmergencyOverride',
  'publicDisplayEnabled',
  'publicDisplayMode',
  'status',
  'deactivatedAt',
  'deactivatedBy',
  'deactivationReason',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const COUNTER_SELECT = [
  '_id',
  'facilityId',
  'departmentId',
  'clinicId',
  'servicePointId',
  'code',
  'name',
  'counterType',
  'queueDefinitionIds',
  'status',
  'activeUserId',
  'activeProviderId',
  'openedAt',
  'closedAt',
  'statusReason',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const CLINIC_SELECT = [
  '_id',
  'facilityId',
  'departmentId',
  'code',
  'name',
  'description',
  'location',
  'defaultProviderId',
  'status',
  'deactivatedAt',
  'deactivatedBy',
  'deactivationReason',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const SERVICE_POINT_SELECT = [
  '_id',
  'facilityId',
  'departmentId',
  'clinicId',
  'code',
  'name',
  'servicePointType',
  'location',
  'defaultProviderId',
  'allowsWalkIn',
  'allowsAppointment',
  'allowsReferral',
  'allowsEmergency',
  'status',
  'deactivatedAt',
  'deactivatedBy',
  'deactivationReason',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

function uniqueObjectIds(
  values: readonly (
    | Types.ObjectId
    | null
  )[],
): Types.ObjectId[] {
  const result =
    new Map<
      string,
      Types.ObjectId
    >();

  for (const value of values) {
    if (value !== null) {
      result.set(
        value.toHexString(),
        value,
      );
    }
  }

  return [
    ...result.values(),
  ];
}

function queueDashboardFilter(
  facilityId: string,
  query: QueueDashboardQuery,
): FilterQuery<QueueTokenRecord> {
  const filter:
    FilterQuery<QueueTokenRecord> = {
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      serviceDate:
        query.serviceDate,
    };

  if (
    query.queueDefinitionId !==
    undefined
  ) {
    filter.queueDefinitionId =
      toObjectId(
        query.queueDefinitionId,
        'queueDefinitionId',
      );
  }

  if (
    query.assignedProviderId !==
    undefined
  ) {
    filter.assignedProviderId =
      toObjectId(
        query.assignedProviderId,
        'assignedProviderId',
      );
  }

  if (
    query.assignedCounterId !==
    undefined
  ) {
    filter.assignedCounterId =
      toObjectId(
        query.assignedCounterId,
        'assignedCounterId',
      );
  }

  return filter;
}

export class RegistrationQueueReadRepository {
  public async loadMetadata(
    facilityId: string,
    queueTokens: readonly QueueTokenRecord[],
  ): Promise<QueueReadMetadata> {
    const queueDefinitionIds =
      uniqueObjectIds(
        queueTokens.map(
          (item) =>
            item.queueDefinitionId,
        ),
      );

    const counterIds =
      uniqueObjectIds(
        queueTokens.map(
          (item) =>
            item.assignedCounterId,
        ),
      );

    const providerIds =
      uniqueObjectIds(
        queueTokens.map(
          (item) =>
            item.assignedProviderId,
        ),
      );

    const [
      queueDefinitions,
      counters,
      providers,
    ] =
      await Promise.all([
        queueDefinitionIds.length ===
        0
          ? []
          : QueueDefinitionModel.find({
              _id: {
                $in:
                  queueDefinitionIds,
              },

              facilityId:
                toObjectId(
                  facilityId,
                  'facilityId',
                ),
            })
              .select(
                QUEUE_DEFINITION_SELECT,
              )
              .lean<
                QueueDefinitionRecord[]
              >()
              .exec(),

        counterIds.length ===
        0
          ? []
          : ServiceCounterModel.find({
              _id: {
                $in:
                  counterIds,
              },

              facilityId:
                toObjectId(
                  facilityId,
                  'facilityId',
                ),
            })
              .select(
                COUNTER_SELECT,
              )
              .lean<
                ServiceCounterRecord[]
              >()
              .exec(),

        providerIds.length ===
        0
          ? []
          : StaffModel.find({
              _id: {
                $in:
                  providerIds,
              },

              facilityId:
                toObjectId(
                  facilityId,
                  'facilityId',
                ),
            })
              .select(
                '_id displayName',
              )
              .lean<
                QueueReadProviderRecord[]
              >()
              .exec(),
      ]);

    return {
      queueDefinitions:
        new Map(
          queueDefinitions.map(
            (item) => [
              item._id.toHexString(),
              item,
            ],
          ),
        ),

      counters:
        new Map(
          counters.map(
            (item) => [
              item._id.toHexString(),
              item,
            ],
          ),
        ),

      providers:
        new Map(
          providers.map(
            (item) => [
              item._id.toHexString(),
              item,
            ],
          ),
        ),
    };
  }

  public async findQueueDefinition(
    facilityId: string,
    queueDefinitionId: string,
  ): Promise<QueueDefinitionRecord | null> {
    return QueueDefinitionModel.findOne({
      _id:
        toObjectId(
          queueDefinitionId,
          'queueDefinitionId',
        ),

      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    })
      .select(
        QUEUE_DEFINITION_SELECT,
      )
      .lean<QueueDefinitionRecord>()
      .exec();
  }

  public async findPublicDisplayEntries(
    facilityId: string,
    serviceDate: string,
    queueDefinitionId: string,
    maximumEntries: number,
  ): Promise<QueueTokenRecord[]> {
    return QueueTokenModel.find({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      serviceDate,

      queueDefinitionId:
        toObjectId(
          queueDefinitionId,
          'queueDefinitionId',
        ),

      status: {
        $in: [
          'WAITING',
          'CALLED',
          'SERVING',
          'SKIPPED',
        ],
      },
    })
      .select(
        QUEUE_PUBLIC_DISPLAY_SELECT,
      )
      .sort({
        priorityScore:
          -1,

        queuedAt:
          1,

        tokenNumber:
          1,

        _id:
          1,
      })
      .limit(
        maximumEntries,
      )
      .lean<QueueTokenRecord[]>()
      .exec();
  }

  public async loadPublicCounters(
    facilityId: string,
    entries: readonly QueueTokenRecord[],
  ): Promise<Map<string, ServiceCounterRecord>> {
    const counterIds =
      uniqueObjectIds(
        entries.map(
          (item) =>
            item.assignedCounterId,
        ),
      );

    if (counterIds.length === 0) {
      return new Map();
    }

    const counters =
      await ServiceCounterModel.find({
        _id: {
          $in:
            counterIds,
        },

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          COUNTER_SELECT,
        )
        .lean<
          ServiceCounterRecord[]
        >()
        .exec();

    return new Map(
      counters.map(
        (item) => [
          item._id.toHexString(),
          item,
        ],
      ),
    );
  }

  public async listDashboardEntries(
    facilityId: string,
    query: QueueDashboardQuery,
  ): Promise<QueueTokenRecord[]> {
    const filter =
      queueDashboardFilter(
        facilityId,
        query,
      );

    if (
      query.departmentId !==
        undefined ||
      query.clinicId !==
        undefined ||
      query.servicePointId !==
        undefined
    ) {
      const definitionFilter:
        FilterQuery<QueueDefinitionRecord> = {
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
        definitionFilter.departmentId =
          toObjectId(
            query.departmentId,
            'departmentId',
          );
      }

      if (
        query.clinicId !==
        undefined
      ) {
        definitionFilter.clinicId =
          toObjectId(
            query.clinicId,
            'clinicId',
          );
      }

      if (
        query.servicePointId !==
        undefined
      ) {
        definitionFilter.servicePointId =
          toObjectId(
            query.servicePointId,
            'servicePointId',
          );
      }

      const definitionIds =
        await QueueDefinitionModel.find(
          definitionFilter,
        )
          .select(
            '_id',
          )
          .lean<
            Array<{
              _id: Types.ObjectId;
            }>
          >()
          .exec();

      filter.queueDefinitionId = {
        $in:
          definitionIds.map(
            (item) =>
              item._id,
          ),
      };
    }

    return QueueTokenModel.find(
      filter,
    )
      .sort({
        priorityScore:
          -1,

        queuedAt:
          1,

        tokenNumber:
          1,

        _id:
          1,
      })
      .lean<QueueTokenRecord[]>()
      .exec();
  }

  public async listMetricRecords(
    facilityId: string,
    query: QueueDashboardQuery,
  ): Promise<QueueMetricRecord[]> {
    const entries =
      await this.listDashboardEntries(
        facilityId,
        query,
      );

    return entries.map(
      (entry) => ({
        status:
          entry.status,

        queuedAt:
          entry.queuedAt,

        calledAt:
          entry.calledAt,

        servingAt:
          entry.servingAt,

        completedAt:
          entry.completedAt,
      }),
    );
  }

  public async listConfiguration(
    facilityId: string,
    query: RegistrationQueueConfigurationQuery,
  ): Promise<RegistrationQueueConfigurationRecords> {
    const facilityObjectId =
      toObjectId(
        facilityId,
        'facilityId',
      );

    const statusFilter =
      query.includeInactive
        ? {}
        : {
            status:
              'ACTIVE',
          };

    const clinicFilter:
      Record<string, unknown> = {
        facilityId:
          facilityObjectId,

        ...statusFilter,
      };

    const servicePointFilter:
      Record<string, unknown> = {
        facilityId:
          facilityObjectId,

        ...statusFilter,
      };

    const definitionFilter:
      Record<string, unknown> = {
        facilityId:
          facilityObjectId,

        ...statusFilter,
      };

    const counterFilter:
      Record<string, unknown> = {
        facilityId:
          facilityObjectId,

        ...statusFilter,
      };

    if (
      query.departmentId !==
      undefined
    ) {
      const departmentId =
        toObjectId(
          query.departmentId,
          'departmentId',
        );

      clinicFilter['departmentId'] =
        departmentId;

      servicePointFilter['departmentId'] =
        departmentId;

      definitionFilter['departmentId'] =
        departmentId;

      counterFilter['departmentId'] =
        departmentId;
    }

    if (query.clinicId !== undefined) {
      const clinicId =
        toObjectId(
          query.clinicId,
          'clinicId',
        );

      servicePointFilter['clinicId'] =
        clinicId;

      definitionFilter['clinicId'] =
        clinicId;

      counterFilter['clinicId'] =
        clinicId;
    }

    if (
      query.servicePointId !==
      undefined
    ) {
      const servicePointId =
        toObjectId(
          query.servicePointId,
          'servicePointId',
        );

      definitionFilter['servicePointId'] =
        servicePointId;

      counterFilter['servicePointId'] =
        servicePointId;
    }

    const [
      clinics,
      servicePoints,
      queueDefinitions,
      counters,
    ] =
      await Promise.all([
        OpdClinicModel.find(
          clinicFilter,
        )
          .select(
            CLINIC_SELECT,
          )
          .sort({
            name:
              1,

            code:
              1,
          })
          .lean<OpdClinicRecord[]>()
          .exec(),

        ServicePointModel.find(
          servicePointFilter,
        )
          .select(
            SERVICE_POINT_SELECT,
          )
          .sort({
            name:
              1,

            code:
              1,
          })
          .lean<ServicePointRecord[]>()
          .exec(),

        QueueDefinitionModel.find(
          definitionFilter,
        )
          .select(
            QUEUE_DEFINITION_SELECT,
          )
          .sort({
            name:
              1,

            code:
              1,
          })
          .lean<
            QueueDefinitionRecord[]
          >()
          .exec(),

        ServiceCounterModel.find(
          counterFilter,
        )
          .select(
            COUNTER_SELECT,
          )
          .sort({
            name:
              1,

            code:
              1,
          })
          .lean<
            ServiceCounterRecord[]
          >()
          .exec(),
      ]);

    return {
      clinics,
      servicePoints,
      queueDefinitions,
      counters,
    };
  }
}


