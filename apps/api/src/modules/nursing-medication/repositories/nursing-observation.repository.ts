import Decimal from 'decimal.js';

import type {
  FilterQuery,
} from 'mongoose';

import {
  IntakeOutputEntryModel,
  NursingDeviceModel,
  NursingDeviceObservationModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  IntakeOutputListQuery,
  NursingDeviceListQuery,
} from '../nursing-medication.contracts.js';

import type {
  IntakeOutputPersistenceUpdate,
  NursingDevicePersistenceUpdate,
  NursingObservationRepositoryPort,
} from '../nursing-medication.ports.js';

import type {
  IntakeOutputEntryRecord,
  NursingDeviceObservationRecord,
  NursingDeviceRecord,
} from '../nursing-medication.persistence.types.js';

const INTAKE_OUTPUT_SELECT = [
  '_id',
  'facilityId',
  'admissionId',
  'patientId',
  'encounterId',
  'wardId',
  'roomId',
  'bedId',
  'entryNumber',
  'direction',
  'category',
  'sourceDescription',
  'volumeMillilitres',
  'originalQuantity',
  'originalUnitCode',
  'conversionFactorToMillilitres',
  'occurredAt',
  'recordedAt',
  'shiftCode',
  'recordedByUserId',
  'recordedByStaffId',
  'status',
  'rootEntryId',
  'revisionNumber',
  'supersedesEntryId',
  'supersededByEntryId',
  '+correctionReason',
  'enteredInErrorAt',
  'enteredInErrorByUserId',
  'enteredInErrorByStaffId',
  '+enteredInErrorReason',
  'transactionId',
  'correlationId',
  'idempotencyKey',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const DEVICE_SELECT = [
  '_id',
  'facilityId',
  'admissionId',
  'patientId',
  'encounterId',
  'wardId',
  'roomId',
  'bedId',
  'deviceNumber',
  'deviceType',
  'deviceName',
  'anatomicalSite',
  'laterality',
  'woundDetails',
  'insertedAt',
  'insertedByStaffId',
  'status',
  'removedAt',
  'removedByStaffId',
  '+removalReason',
  'transactionId',
  'correlationId',
  'idempotencyKey',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const DEVICE_OBSERVATION_SELECT = [
  '_id',
  'facilityId',
  'admissionId',
  'patientId',
  'encounterId',
  'wardId',
  'roomId',
  'bedId',
  'nursingDeviceId',
  'observationNumber',
  'observationType',
  'observedAt',
  'recordedAt',
  'observedByUserId',
  'observedByStaffId',
  '+siteCondition',
  'dressingType',
  'outputMillilitres',
  'infectionIndicators',
  'findings',
  '+narrative',
  'requiresEscalation',
  '+escalationReason',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'createdBy',
  'createdAt',
].join(' ');

function record<T>(
  value: unknown,
): T {
  return value as T;
}

function direction(
  value:
    | 'asc'
    | 'desc',
): 1 | -1 {
  return value ===
    'asc'
    ? 1
    : -1;
}

function intakeOutputFilter(
  facilityId: string,
  query: IntakeOutputListQuery,
): FilterQuery<IntakeOutputEntryRecord> {
  const filter:
    FilterQuery<IntakeOutputEntryRecord> = {
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
    query.shiftCode !==
    undefined
  ) {
    filter.shiftCode =
      query.shiftCode
        .trim()
        .toUpperCase();
  }

  if (
    query.direction !==
    undefined
  ) {
    filter.direction =
      query.direction;
  }

  if (
    query.category !==
    undefined
  ) {
    filter.category =
      query.category;
  }

  if (
    query.status !==
    undefined
  ) {
    filter.status =
      query.status;
  }

  if (
    query.occurredFrom !==
      undefined ||
    query.occurredTo !==
      undefined
  ) {
    filter.occurredAt = {};

    if (
      query.occurredFrom !==
      undefined
    ) {
      filter.occurredAt.$gte =
        new Date(
          query.occurredFrom,
        );
    }

    if (
      query.occurredTo !==
      undefined
    ) {
      filter.occurredAt.$lte =
        new Date(
          query.occurredTo,
        );
    }
  }

  return filter;
}

function deviceFilter(
  facilityId: string,
  query: NursingDeviceListQuery,
): FilterQuery<NursingDeviceRecord> {
  const filter:
    FilterQuery<NursingDeviceRecord> = {
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
    query.deviceType !==
    undefined
  ) {
    filter.deviceType =
      query.deviceType;
  }

  if (
    query.status !==
    undefined
  ) {
    filter.status =
      query.status;
  }

  return filter;
}

function decimalString(
  value: unknown,
): string {
  if (
    value !== null &&
    typeof value ===
      'object' &&
    'toString' in value &&
    typeof value.toString ===
      'function'
  ) {
    return value.toString();
  }

  return String(
    value ?? '0',
  );
}

export class NursingObservationRepository
implements NursingObservationRepositoryPort {
  public async createIntakeOutput(
    input: Omit<
      IntakeOutputEntryRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<IntakeOutputEntryRecord> {
    const created =
      await IntakeOutputEntryModel.create(
        input,
      );

    return record<IntakeOutputEntryRecord>(
      await IntakeOutputEntryModel.findById(
        created._id,
      )
        .select(
          INTAKE_OUTPUT_SELECT,
        )
        .lean()
        .orFail()
        .exec(),
    );
  }

  public async findIntakeOutputById(
    facilityId: string,
    entryId: string,
  ): Promise<IntakeOutputEntryRecord | null> {
    return record<
      IntakeOutputEntryRecord | null
    >(
      await IntakeOutputEntryModel.findOne({
        _id:
          toObjectId(
            entryId,
            'entryId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          INTAKE_OUTPUT_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async listIntakeOutput(
    facilityId: string,
    query: IntakeOutputListQuery,
  ): Promise<{
    items: IntakeOutputEntryRecord[];
    total: number;
  }> {
    const filter =
      intakeOutputFilter(
        facilityId,
        query,
      );

    const sort = {
      [query.sortBy]:
        direction(
          query.sortDirection,
        ),

      _id:
        direction(
          query.sortDirection,
        ),
    };

    const [
      items,
      total,
    ] = await Promise.all([
      IntakeOutputEntryModel.find(
        filter,
      )
        .select(
          INTAKE_OUTPUT_SELECT,
        )
        .sort(sort)
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

      IntakeOutputEntryModel.countDocuments(
        filter,
      ).exec(),
    ]);

    return {
      items:
        record<
          IntakeOutputEntryRecord[]
        >(items),

      total,
    };
  }

  public async updateIntakeOutput(
    facilityId: string,
    entryId: string,
    expectedVersion: number,
    allowedStatuses:
      readonly IntakeOutputEntryRecord['status'][],
    update:
      IntakeOutputPersistenceUpdate,
  ): Promise<IntakeOutputEntryRecord | null> {
    return record<
      IntakeOutputEntryRecord | null
    >(
      await IntakeOutputEntryModel.findOneAndUpdate(
        {
          _id:
            toObjectId(
              entryId,
              'entryId',
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
            version: 1,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
        .select(
          INTAKE_OUTPUT_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async calculateFluidBalance(
    facilityId: string,
    admissionId: string,
    from: Date,
    to: Date,
  ): Promise<{
    intakeMillilitres: string;
    outputMillilitres: string;
    balanceMillilitres: string;
  }> {
    const rows =
      await IntakeOutputEntryModel.aggregate<{
        _id:
          | 'INTAKE'
          | 'OUTPUT';

        total: unknown;
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

            status:
              'ACTIVE',

            occurredAt: {
              $gte: from,
              $lt: to,
            },
          },
        },

        {
          $group: {
            _id:
              '$direction',

            total: {
              $sum:
                '$volumeMillilitres',
            },
          },
        },
      ]).exec();

    const intake =
      decimalString(
        rows.find(
          (row) =>
            row._id ===
            'INTAKE',
        )?.total ?? 0,
      );

    const output =
      decimalString(
        rows.find(
          (row) =>
            row._id ===
            'OUTPUT',
        )?.total ?? 0,
      );

    const balance =
      new Decimal(
        intake,
      )
        .minus(
          output,
        )
        .toDecimalPlaces(4)
        .toFixed(4);

    return {
      intakeMillilitres:
        intake,

      outputMillilitres:
        output,

      balanceMillilitres:
        balance,
    };
  }

  public async createDevice(
    input: Omit<
      NursingDeviceRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<NursingDeviceRecord> {
    const created =
      await NursingDeviceModel.create(
        input,
      );

    return record<NursingDeviceRecord>(
      await NursingDeviceModel.findById(
        created._id,
      )
        .select(
          DEVICE_SELECT,
        )
        .lean()
        .orFail()
        .exec(),
    );
  }

  public async findDeviceById(
    facilityId: string,
    deviceId: string,
  ): Promise<NursingDeviceRecord | null> {
    return record<
      NursingDeviceRecord | null
    >(
      await NursingDeviceModel.findOne({
        _id:
          toObjectId(
            deviceId,
            'deviceId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          DEVICE_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async listDevices(
    facilityId: string,
    query: NursingDeviceListQuery,
  ): Promise<{
    items: NursingDeviceRecord[];
    total: number;
  }> {
    const filter =
      deviceFilter(
        facilityId,
        query,
      );

    const sort = {
      [query.sortBy]:
        direction(
          query.sortDirection,
        ),

      _id:
        direction(
          query.sortDirection,
        ),
    };

    const [
      items,
      total,
    ] = await Promise.all([
      NursingDeviceModel.find(
        filter,
      )
        .select(
          DEVICE_SELECT,
        )
        .sort(sort)
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

      NursingDeviceModel.countDocuments(
        filter,
      ).exec(),
    ]);

    return {
      items:
        record<
          NursingDeviceRecord[]
        >(items),

      total,
    };
  }

  public async updateDevice(
    facilityId: string,
    deviceId: string,
    expectedVersion: number,
    allowedStatuses:
      readonly NursingDeviceRecord['status'][],
    update:
      NursingDevicePersistenceUpdate,
  ): Promise<NursingDeviceRecord | null> {
    return record<
      NursingDeviceRecord | null
    >(
      await NursingDeviceModel.findOneAndUpdate(
        {
          _id:
            toObjectId(
              deviceId,
              'deviceId',
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
            version: 1,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
        .select(
          DEVICE_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async createDeviceObservation(
    input: Omit<
      NursingDeviceObservationRecord,
      '_id' | 'createdAt'
    >,
  ): Promise<NursingDeviceObservationRecord> {
    const created =
      await NursingDeviceObservationModel.create(
        input,
      );

    return record<
      NursingDeviceObservationRecord
    >(
      await NursingDeviceObservationModel.findById(
        created._id,
      )
        .select(
          DEVICE_OBSERVATION_SELECT,
        )
        .lean()
        .orFail()
        .exec(),
    );
  }

  public async listDeviceObservations(
    facilityId: string,
    deviceId: string,
  ): Promise<
    NursingDeviceObservationRecord[]
  > {
    return record<
      NursingDeviceObservationRecord[]
    >(
      await NursingDeviceObservationModel.find({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        nursingDeviceId:
          toObjectId(
            deviceId,
            'deviceId',
          ),
      })
        .select(
          DEVICE_OBSERVATION_SELECT,
        )
        .sort({
          observedAt: -1,
          _id: -1,
        })
        .lean()
        .exec(),
    );
  }
}