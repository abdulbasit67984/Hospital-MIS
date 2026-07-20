import type {
  FilterQuery,
} from 'mongoose';

import {
  MedicationAdministrationAmendmentModel,
  MedicationAdministrationModel,
  MedicationScheduleModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  MedicationAdministrationListQuery,
  MedicationComplianceSummary,
  MedicationScheduleListQuery,
} from '../nursing-mar.contracts.js';

import type {
  MarMedicationAdministrationAmendmentRecord,
  MarMedicationAdministrationRecord,
  MarMedicationScheduleRecord,
  MarScheduleDerivedState,
} from '../nursing-mar.persistence.types.js';

import type {
  NursingMarRepositoryPort,
} from '../nursing-mar.ports.js';

const SCHEDULE_SELECT = [
  '_id',
  'facilityId',
  'admissionId',
  'patientId',
  'encounterId',
  'wardId',
  'roomId',
  'bedId',
  'scheduleNumber',
  'prescriptionId',
  'prescriptionItemId',
  'source',
  'medicineId',
  'formularyItemId',
  'medicineDisplay',
  'prescribedDose',
  'doseUnitCode',
  'route',
  'frequencyCode',
  'scheduledTimes',
  'prn',
  '+prnIndication',
  'startAt',
  'endAt',
  'status',
  '+holdReason',
  'orderedByUserId',
  'orderedByStaffId',
  'lastAdministrationAt',
  'nextScheduledAt',
  'version',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const ADMINISTRATION_SELECT = [
  '_id',
  'facilityId',
  'admissionId',
  'patientId',
  'encounterId',
  'wardId',
  'roomId',
  'bedId',
  'administrationNumber',
  'medicationScheduleId',
  'prescriptionId',
  'prescriptionItemId',
  'medicineId',
  'medicineDisplaySnapshot',
  'scheduledAt',
  'status',
  'prescribedDose',
  'administeredDose',
  'doseUnitCode',
  'prescribedRoute',
  'administeredRoute',
  'administeredAt',
  'administeringNurseUserId',
  'administeringNurseStaffId',
  'reasonCode',
  '+reason',
  '+notes',
  'delayedUntil',
  'statusChangedAt',
  'statusChangedBy',
  'correctionOfAdministrationId',
  'supersededByAdministrationId',
  'version',
  'transactionId',
  'correlationId',
  'schemaVersion',
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

function scheduleFilter(
  facilityId: string,
  query: MedicationScheduleListQuery,
): FilterQuery<MarMedicationScheduleRecord> {
  const filter:
    FilterQuery<MarMedicationScheduleRecord> = {
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    };

  if (
    query.admissionId !==
    undefined
  ) {
    filter.admissionId =
      toObjectId(
        query.admissionId,
        'admissionId',
      );
  }

  if (
    query.patientId !==
    undefined
  ) {
    filter.patientId =
      toObjectId(
        query.patientId,
        'patientId',
      );
  }

  if (
    query.wardId !==
    undefined
  ) {
    filter.wardId =
      toObjectId(
        query.wardId,
        'wardId',
      );
  }

  if (
    query.status !==
    undefined
  ) {
    filter.status =
      query.status;
  }

  if (
    query.medicineId !==
    undefined
  ) {
    filter.medicineId =
      toObjectId(
        query.medicineId,
        'medicineId',
      );
  }

  if (
    query.dueFrom !==
      undefined ||
    query.dueTo !==
      undefined
  ) {
    filter.nextScheduledAt = {};

    if (
      query.dueFrom !==
      undefined
    ) {
      filter.nextScheduledAt.$gte =
        new Date(
          query.dueFrom,
        );
    }

    if (
      query.dueTo !==
      undefined
    ) {
      filter.nextScheduledAt.$lte =
        new Date(
          query.dueTo,
        );
    }
  }

  return filter;
}

function administrationFilter(
  facilityId: string,
  query: MedicationAdministrationListQuery,
): FilterQuery<MarMedicationAdministrationRecord> {
  const filter:
    FilterQuery<MarMedicationAdministrationRecord> = {
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      admissionId:
        toObjectId(
          query.admissionId,
          'admissionId',
        ),

      supersededByAdministrationId:
        null,
    };

  if (
    query.scheduleId !==
    undefined
  ) {
    filter.medicationScheduleId =
      toObjectId(
        query.scheduleId,
        'scheduleId',
      );
  }

  if (
    query.status !==
    undefined
  ) {
    filter.status =
      query.status;
  }

  if (
    query.scheduledFrom !==
      undefined ||
    query.scheduledTo !==
      undefined
  ) {
    filter.scheduledAt = {};

    if (
      query.scheduledFrom !==
      undefined
    ) {
      filter.scheduledAt.$gte =
        new Date(
          query.scheduledFrom,
        );
    }

    if (
      query.scheduledTo !==
      undefined
    ) {
      filter.scheduledAt.$lte =
        new Date(
          query.scheduledTo,
        );
    }
  }

  return filter;
}

export class NursingMarRepository
implements NursingMarRepositoryPort {
  public async createSchedule(
    input: Omit<
      MarMedicationScheduleRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<MarMedicationScheduleRecord> {
    const created =
      await MedicationScheduleModel.create(
        input,
      );

    return record<MarMedicationScheduleRecord>(
      await MedicationScheduleModel.findById(
        created._id,
      )
        .select(
          SCHEDULE_SELECT,
        )
        .lean()
        .orFail()
        .exec(),
    );
  }

  public async findScheduleById(
    facilityId: string,
    scheduleId: string,
  ): Promise<MarMedicationScheduleRecord | null> {
    return record<
      MarMedicationScheduleRecord | null
    >(
      await MedicationScheduleModel.findOne({
        _id:
          toObjectId(
            scheduleId,
            'scheduleId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          SCHEDULE_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async findActiveScheduleForPrescriptionItem(
    facilityId: string,
    admissionId: string,
    prescriptionItemId: string,
  ): Promise<MarMedicationScheduleRecord | null> {
    return record<
      MarMedicationScheduleRecord | null
    >(
      await MedicationScheduleModel.findOne({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        admissionId:
          toObjectId(
            admissionId,
            'admissionId',
          ),

        prescriptionItemId:
          toObjectId(
            prescriptionItemId,
            'prescriptionItemId',
          ),

        status: {
          $in: [
            'ACTIVE',
            'HELD',
          ],
        },
      })
        .select(
          SCHEDULE_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async listSchedules(
    facilityId: string,
    query: MedicationScheduleListQuery,
  ): Promise<{
    items: MarMedicationScheduleRecord[];
    total: number;
  }> {
    const filter =
      scheduleFilter(
        facilityId,
        query,
      );

    const [
      items,
      total,
    ] = await Promise.all([
      MedicationScheduleModel.find(
        filter,
      )
        .select(
          SCHEDULE_SELECT,
        )
        .sort({
          nextScheduledAt:
            1,

          _id:
            1,
        })
        .skip(
          (
            query.page - 1
          ) *
            query.pageSize,
        )
        .limit(
          query.pageSize,
        )
        .lean()
        .exec(),

      MedicationScheduleModel.countDocuments(
        filter,
      ).exec(),
    ]);

    return {
      items:
        record<
          MarMedicationScheduleRecord[]
        >(
          items,
        ),

      total,
    };
  }

  public async updateSchedule(
    facilityId: string,
    scheduleId: string,
    expectedVersion: number,
    allowedStatuses:
      readonly MarMedicationScheduleRecord['status'][],
    update: Record<string, unknown>,
  ): Promise<MarMedicationScheduleRecord | null> {
    return record<
      MarMedicationScheduleRecord | null
    >(
      await MedicationScheduleModel.findOneAndUpdate(
        {
          _id:
            toObjectId(
              scheduleId,
              'scheduleId',
            ),

          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          version:
            expectedVersion,

          status: {
            $in:
              allowedStatuses,
          },
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
          SCHEDULE_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async createAdministration(
    input: Omit<
      MarMedicationAdministrationRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<MarMedicationAdministrationRecord> {
    const created =
      await MedicationAdministrationModel.create(
        input,
      );

    return record<MarMedicationAdministrationRecord>(
      await MedicationAdministrationModel.findById(
        created._id,
      )
        .select(
          ADMINISTRATION_SELECT,
        )
        .lean()
        .orFail()
        .exec(),
    );
  }

  public async findAdministrationById(
    facilityId: string,
    administrationId: string,
  ): Promise<MarMedicationAdministrationRecord | null> {
    return record<
      MarMedicationAdministrationRecord | null
    >(
      await MedicationAdministrationModel.findOne({
        _id:
          toObjectId(
            administrationId,
            'administrationId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          ADMINISTRATION_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async findCurrentAdministrationForDose(
    facilityId: string,
    scheduleId: string,
    scheduledAt: Date,
  ): Promise<MarMedicationAdministrationRecord | null> {
    return record<
      MarMedicationAdministrationRecord | null
    >(
      await MedicationAdministrationModel.findOne({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        medicationScheduleId:
          toObjectId(
            scheduleId,
            'scheduleId',
          ),

        scheduledAt,

        supersededByAdministrationId:
          null,
      })
        .select(
          ADMINISTRATION_SELECT,
        )
        .sort({
          createdAt:
            -1,

          _id:
            -1,
        })
        .lean()
        .exec(),
    );
  }

  public async listAdministrations(
    facilityId: string,
    query: MedicationAdministrationListQuery,
  ): Promise<{
    items: MarMedicationAdministrationRecord[];
    total: number;
  }> {
    const filter =
      administrationFilter(
        facilityId,
        query,
      );

    const [
      items,
      total,
    ] = await Promise.all([
      MedicationAdministrationModel.find(
        filter,
      )
        .select(
          ADMINISTRATION_SELECT,
        )
        .sort({
          scheduledAt:
            -1,

          _id:
            -1,
        })
        .skip(
          (
            query.page - 1
          ) *
            query.pageSize,
        )
        .limit(
          query.pageSize,
        )
        .lean()
        .exec(),

      MedicationAdministrationModel.countDocuments(
        filter,
      ).exec(),
    ]);

    return {
      items:
        record<
          MarMedicationAdministrationRecord[]
        >(
          items,
        ),

      total,
    };
  }

  public async updateAdministrationSupersession(
    facilityId: string,
    administrationId: string,
    expectedVersion: number,
    replacementAdministrationId: string,
    actorUserId: string,
  ): Promise<MarMedicationAdministrationRecord | null> {
    return record<
      MarMedicationAdministrationRecord | null
    >(
      await MedicationAdministrationModel.findOneAndUpdate(
        {
          _id:
            toObjectId(
              administrationId,
              'administrationId',
            ),

          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          version:
            expectedVersion,

          supersededByAdministrationId:
            null,
        },
        {
          $set: {
            supersededByAdministrationId:
              toObjectId(
                replacementAdministrationId,
                'replacementAdministrationId',
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
          ADMINISTRATION_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async createAdministrationAmendment(
    input: Omit<
      MarMedicationAdministrationAmendmentRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<MarMedicationAdministrationAmendmentRecord> {
    const created =
      await MedicationAdministrationAmendmentModel.create(
        input,
      );

    return record<
      MarMedicationAdministrationAmendmentRecord
    >(
      await MedicationAdministrationAmendmentModel.findById(
        created._id,
      )
        .select(
          '+reason',
        )
        .lean()
        .orFail()
        .exec(),
    );
  }

  public async deriveScheduleState(
    facilityId: string,
    scheduleId: string,
    at: Date,
  ): Promise<MarScheduleDerivedState> {
    const schedule =
      await this.findScheduleById(
        facilityId,
        scheduleId,
      );

    if (
      schedule === null
    ) {
      return {
        lastAdministrationAt:
          null,

        nextScheduledAt:
          null,
      };
    }

    const currentAdministrations =
      await MedicationAdministrationModel.find({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        medicationScheduleId:
          toObjectId(
            scheduleId,
            'scheduleId',
          ),

        supersededByAdministrationId:
          null,
      })
        .select(
          'scheduledAt status administeredAt delayedUntil',
        )
        .lean<{
          scheduledAt: Date;
          status: string;
          administeredAt: Date | null;
          delayedUntil: Date | null;
        }[]>()
        .exec();

    const completedSlots =
      new Set(
        currentAdministrations
          .filter(
            (record) =>
              [
                'ADMINISTERED',
                'OMITTED',
                'REFUSED',
                'CANCELLED',
              ].includes(
                record.status,
              ),
          )
          .map(
            (record) =>
              record.scheduledAt.toISOString(),
          ),
      );

    const delayedTimes =
      currentAdministrations
        .filter(
          (record) =>
            record.status ===
              'DELAYED' &&
            record.delayedUntil !==
              null,
        )
        .map(
          (record) =>
            record.delayedUntil!,
        );

    const pendingScheduled =
      schedule.scheduledTimes
        .filter(
          (scheduledAt) =>
            !completedSlots.has(
              scheduledAt.toISOString(),
            ),
        );

    const nextScheduledAt = [
      ...pendingScheduled,
      ...delayedTimes,
    ]
      .sort(
        (left, right) =>
          left.getTime() -
          right.getTime(),
      )[0] ?? null;

    const lastAdministrationAt =
      currentAdministrations
        .filter(
          (record) =>
            record.status ===
              'ADMINISTERED' &&
            record.administeredAt !==
              null,
        )
        .map(
          (record) =>
            record.administeredAt!,
        )
        .sort(
          (left, right) =>
            right.getTime() -
            left.getTime(),
        )[0] ?? null;

    return {
      lastAdministrationAt,

      nextScheduledAt,
    };
  }

  public async medicationCompliance(
    facilityId: string,
    admissionId: string,
    from: Date,
    to: Date,
  ): Promise<Omit<
    MedicationComplianceSummary,
    'admissionId' | 'from' | 'to' | 'compliancePercent'
  >> {
    const [
      rows,
      scheduledRows,
    ] = await Promise.all([
      MedicationAdministrationModel.aggregate<{
        _id: string;
        count: number;
      }>([
        {
          $match: {
            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),

            admissionId:
              toObjectId(
                admissionId,
                'admissionId',
              ),

            scheduledAt: {
              $gte:
                from,

              $lt:
                to,
            },

            supersededByAdministrationId:
              null,
          },
        },
        {
          $group: {
            _id:
              '$status',

            count: {
              $sum:
                1,
            },
          },
        },
      ]).exec(),

      MedicationScheduleModel.aggregate<{
        _id: null;
        count: number;
      }>([
        {
          $match: {
            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),

            admissionId:
              toObjectId(
                admissionId,
                'admissionId',
              ),
          },
        },
        {
          $unwind:
            '$scheduledTimes',
        },
        {
          $match: {
            scheduledTimes: {
              $gte:
                from,

              $lt:
                to,
            },
          },
        },
        {
          $count:
            'count',
        },
      ]).exec(),
    ]);

    const counts =
      new Map(
        rows.map(
          (row) => [
            row._id,
            row.count,
          ],
        ),
      );

    const administered =
      counts.get(
        'ADMINISTERED',
      ) ?? 0;

    const omitted =
      counts.get(
        'OMITTED',
      ) ?? 0;

    const refused =
      counts.get(
        'REFUSED',
      ) ?? 0;

    const delayed =
      counts.get(
        'DELAYED',
      ) ?? 0;

    const cancelled =
      counts.get(
        'CANCELLED',
      ) ?? 0;

    return {
      scheduled:
        scheduledRows[0]
          ?.count ?? 0,

      administered,

      omitted,

      refused,

      delayed,

      cancelled,

      completedDoses:
        administered +
        omitted +
        refused +
        cancelled,
    };
  }
}