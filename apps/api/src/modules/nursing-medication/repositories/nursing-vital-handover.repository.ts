import {
  createHash,
} from 'node:crypto';

import type {
  FilterQuery,
} from 'mongoose';

import {
  NursingEntryAmendmentModel,
  VitalSignModel,
  WardHandoverModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  NursingVitalMutationResult,
  NursingVitalTrendQuery,
  WardHandoverListQuery,
} from '../nursing-observation.contracts.js';

import type {
  CreateNursingWardHandoverRecordInput,
  NursingHandoverRepositoryPort,
  NursingVitalSignQueryPort,
  NursingWardHandoverRecord,
} from '../nursing-observation.ports.js';

const VITAL_SELECT = [
  '_id',
  'facilityId',
  'admissionId',
  'encounterId',
  'patientId',
  'observerProviderId',
  'source',
  'deviceIdentifier',
  'measuredAt',
  'recordedAt',
  'bodyPosition',
  'temperatureCelsius',
  'temperatureSite',
  'pulsePerMinute',
  'respiratoryRatePerMinute',
  'systolicBloodPressureMmHg',
  'diastolicBloodPressureMmHg',
  'oxygenSaturationPercent',
  'bloodGlucoseMgDl',
  'painScore',
  'weightKg',
  'heightCm',
  'bmi',
  'oxygenDeliveryMethod',
  'oxygenFlowLitresPerMinute',
  'status',
  'supersedesVitalSignId',
  'supersededByVitalSignId',
  'version',
].join(' ');

const HANDOVER_SELECT = [
  '_id',
  'facilityId',
  'admissionId',
  'patientId',
  'encounterId',
  'wardId',
  'roomId',
  'bedId',
  'handoverNumber',
  'handoverType',
  'shiftCode',
  '+summary',
  '+activeConcerns',
  '+pendingTasks',
  '+medicationConcerns',
  '+safetyConcerns',
  'fromNurseUserId',
  'fromNurseStaffId',
  'toNurseUserId',
  'toNurseStaffId',
  'handedOverAt',
  'status',
  'signedAt',
  'acknowledgedAt',
  'acknowledgedByUserId',
  'acknowledgedByStaffId',
  'supersedesWardHandoverId',
  'supersededByWardHandoverId',
  'version',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

function decimal(
  value: unknown,
): string | null {
  if (
    value == null
  ) {
    return null;
  }

  return String(
    value,
  );
}

function oid(
  value: unknown,
): string | null {
  if (
    value == null ||
    typeof value !==
      'object' ||
    !(
      'toHexString' in
      value
    )
  ) {
    return null;
  }

  return (
    value as {
      toHexString(): string;
    }
  ).toHexString();
}

function toVital(
  record:
    Record<string, unknown>,
): NursingVitalMutationResult {
  return {
    vitalSignId:
      oid(record._id)!,

    facilityId:
      oid(
        record.facilityId,
      )!,

    admissionId:
      oid(
        record.admissionId,
      ),

    encounterId:
      oid(
        record.encounterId,
      )!,

    patientId:
      oid(
        record.patientId,
      )!,

    observerProviderId:
      oid(
        record.observerProviderId,
      )!,

    source:
      record.source as
        NursingVitalMutationResult['source'],

    deviceIdentifier:
      (
        record.deviceIdentifier as
          | string
          | null
      ) ?? null,

    measuredAt:
      (
        record.measuredAt as Date
      ).toISOString(),

    recordedAt:
      (
        record.recordedAt as Date
      ).toISOString(),

    bodyPosition:
      record.bodyPosition as
        NursingVitalMutationResult['bodyPosition'],

    temperatureCelsius:
      decimal(
        record.temperatureCelsius,
      ),

    temperatureSite:
      record.temperatureSite as
        NursingVitalMutationResult['temperatureSite'],

    pulsePerMinute:
      (
        record.pulsePerMinute as
          | number
          | null
      ) ?? null,

    respiratoryRatePerMinute:
      (
        record.respiratoryRatePerMinute as
          | number
          | null
      ) ?? null,

    systolicBloodPressureMmHg:
      (
        record.systolicBloodPressureMmHg as
          | number
          | null
      ) ?? null,

    diastolicBloodPressureMmHg:
      (
        record.diastolicBloodPressureMmHg as
          | number
          | null
      ) ?? null,

    oxygenSaturationPercent:
      decimal(
        record.oxygenSaturationPercent,
      ),

    bloodGlucoseMgDl:
      decimal(
        record.bloodGlucoseMgDl,
      ),

    painScore:
      (
        record.painScore as
          | number
          | null
      ) ?? null,

    weightKg:
      decimal(
        record.weightKg,
      ),

    heightCm:
      decimal(
        record.heightCm,
      ),

    bmi:
      decimal(
        record.bmi,
      ),

    oxygenDeliveryMethod:
      (
        record.oxygenDeliveryMethod as
          | string
          | null
      ) ?? null,

    oxygenFlowLitresPerMinute:
      decimal(
        record.oxygenFlowLitresPerMinute,
      ),

    status:
      record.status as
        NursingVitalMutationResult['status'],

    supersedesVitalSignId:
      oid(
        record.supersedesVitalSignId,
      ),

    supersededByVitalSignId:
      oid(
        record.supersededByVitalSignId,
      ),

    version:
      record.version as number,
  };
}

export class NursingVitalSignQueryRepository
implements NursingVitalSignQueryPort {
  public async list(
    facilityId: string,
    query: NursingVitalTrendQuery,
  ): Promise<{
    items: NursingVitalMutationResult[];
    total: number;
  }> {
    const filter:
      FilterQuery<
        Record<string, unknown>
      > = {
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
      };

    if (
      query.status != null
    ) {
      filter.status =
        query.status;
    }

    if (
      query.measuredFrom != null ||
      query.measuredTo != null
    ) {
      filter.measuredAt = {};

      if (
        query.measuredFrom != null
      ) {
        filter.measuredAt.$gte =
          new Date(
            query.measuredFrom,
          );
      }

      if (
        query.measuredTo != null
      ) {
        filter.measuredAt.$lte =
          new Date(
            query.measuredTo,
          );
      }
    }

    const [
      records,
      total,
    ] = await Promise.all([
      VitalSignModel.find(
        filter,
      )
        .select(
          VITAL_SELECT,
        )
        .sort({
          measuredAt:
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
        .lean<
          Record<
            string,
            unknown
          >[]
        >()
        .exec(),

      VitalSignModel.countDocuments(
        filter,
      ).exec(),
    ]);

    return {
      items:
        records.map(
          toVital,
        ),

      total,
    };
  }
}

export class NursingHandoverRepository
implements NursingHandoverRepositoryPort {
  public async findById(
    facilityId: string,
    handoverId: string,
  ): Promise<NursingWardHandoverRecord | null> {
    return await WardHandoverModel.findOne({
      _id:
        toObjectId(
          handoverId,
          'handoverId',
        ),

      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    })
      .select(
        HANDOVER_SELECT,
      )
      .lean<NursingWardHandoverRecord>()
      .exec();
  }

  public async list(
    facilityId: string,
    query: WardHandoverListQuery,
  ): Promise<{
    items: NursingWardHandoverRecord[];
    total: number;
  }> {
    const filter:
      FilterQuery<NursingWardHandoverRecord> = {
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      };

    if (
      query.admissionId != null
    ) {
      filter.admissionId =
        toObjectId(
          query.admissionId,
          'admissionId',
        ) as never;
    }

    if (
      query.wardId != null
    ) {
      filter.wardId =
        toObjectId(
          query.wardId,
          'wardId',
        ) as never;
    }

    if (
      query.toNurseStaffId != null
    ) {
      filter.toNurseStaffId =
        toObjectId(
          query.toNurseStaffId,
          'toNurseStaffId',
        ) as never;
    }

    if (
      query.status != null
    ) {
      filter.status =
        query.status;
    }

    if (
      query.handedOverFrom != null ||
      query.handedOverTo != null
    ) {
      filter.handedOverAt =
        {} as never;

      const range =
        filter.handedOverAt as unknown as {
          $gte?: Date;
          $lte?: Date;
        };

      if (
        query.handedOverFrom != null
      ) {
        range.$gte =
          new Date(
            query.handedOverFrom,
          );
      }

      if (
        query.handedOverTo != null
      ) {
        range.$lte =
          new Date(
            query.handedOverTo,
          );
      }
    }

    const [
      items,
      total,
    ] = await Promise.all([
      WardHandoverModel.find(
        filter,
      )
        .select(
          HANDOVER_SELECT,
        )
        .sort({
          handedOverAt:
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
        .lean<
          NursingWardHandoverRecord[]
        >()
        .exec(),

      WardHandoverModel.countDocuments(
        filter,
      ).exec(),
    ]);

    return {
      items,
      total,
    };
  }

  public async createReplacement(
    input:
      CreateNursingWardHandoverRecordInput,
  ): Promise<NursingWardHandoverRecord> {
    const created =
      await WardHandoverModel.create({
        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        admissionId:
          toObjectId(
            input.admissionId,
            'admissionId',
          ),

        patientId:
          toObjectId(
            input.patientId,
            'patientId',
          ),

        encounterId:
          toObjectId(
            input.encounterId,
            'encounterId',
          ),

        wardId:
          toObjectId(
            input.wardId,
            'wardId',
          ),

        roomId:
          input.roomId == null
            ? null
            : toObjectId(
                input.roomId,
                'roomId',
              ),

        bedId:
          input.bedId == null
            ? null
            : toObjectId(
                input.bedId,
                'bedId',
              ),

        handoverNumber:
          input.handoverNumber,

        handoverType:
          input.handoverType,

        shiftCode:
          input.shiftCode,

        summary:
          input.summary,

        activeConcerns: [
          ...input.activeConcerns,
        ],

        pendingTasks: [
          ...input.pendingTasks,
        ],

        medicationConcerns: [
          ...input.medicationConcerns,
        ],

        safetyConcerns: [
          ...input.safetyConcerns,
        ],

        fromNurseUserId:
          toObjectId(
            input.fromNurseUserId,
            'fromNurseUserId',
          ),

        fromNurseStaffId:
          toObjectId(
            input.fromNurseStaffId,
            'fromNurseStaffId',
          ),

        toNurseUserId:
          toObjectId(
            input.toNurseUserId,
            'toNurseUserId',
          ),

        toNurseStaffId:
          toObjectId(
            input.toNurseStaffId,
            'toNurseStaffId',
          ),

        handedOverAt:
          input.handedOverAt,

        status:
          input.status,

        signedAt:
          input.signedAt,

        acknowledgedAt:
          null,

        acknowledgedByUserId:
          null,

        acknowledgedByStaffId:
          null,

        supersedesWardHandoverId:
          input.supersedesWardHandoverId ==
          null
            ? null
            : toObjectId(
                input.supersedesWardHandoverId,
                'supersedesWardHandoverId',
              ),

        supersededByWardHandoverId:
          null,

        transactionId:
          input.transactionId,

        correlationId:
          input.correlationId,

        schemaVersion:
          1,

        version:
          0,

        createdBy:
          toObjectId(
            input.actorUserId,
            'actorUserId',
          ),

        updatedBy:
          toObjectId(
            input.actorUserId,
            'actorUserId',
          ),
      });

    return await WardHandoverModel.findById(
      created._id,
    )
      .select(
        HANDOVER_SELECT,
      )
      .lean<NursingWardHandoverRecord>()
      .orFail()
      .exec();
  }

  public async updateStatus(
    input: Readonly<{
      facilityId: string;
      handoverId: string;
      expectedVersion: number;
      allowedStatuses: readonly NursingWardHandoverRecord['status'][];
      status: NursingWardHandoverRecord['status'];
      supersededByWardHandoverId?: string | null;
      actorUserId: string;
    }>,
  ): Promise<NursingWardHandoverRecord | null> {
    return await WardHandoverModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.handoverId,
            'handoverId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,

        status: {
          $in:
            input.allowedStatuses,
        },
      },
      {
        $set: {
          status:
            input.status,

          ...(
            input.supersededByWardHandoverId ===
            undefined
              ? {}
              : {
                  supersededByWardHandoverId:
                    input.supersededByWardHandoverId ==
                    null
                      ? null
                      : toObjectId(
                          input.supersededByWardHandoverId,
                          'supersededByWardHandoverId',
                        ),
                }
          ),

          updatedBy:
            toObjectId(
              input.actorUserId,
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
        HANDOVER_SELECT,
      )
      .lean<NursingWardHandoverRecord>()
      .exec();
  }

  public async createAmendment(
    input: Readonly<{
      facilityId: string;
      admissionId: string;
      patientId: string;
      handoverId: string;
      amendmentSequence: number;
      amendmentType:
        | 'CORRECTION'
        | 'ENTERED_IN_ERROR';
      previousSnapshotHash: string;
      replacementHandoverId: string | null;
      reason: string;
      occurredAt: Date;
      actorUserId: string;
      actorStaffId: string;
      transactionId: string;
      correlationId: string;
    }>,
  ): Promise<string> {
    const created =
      await NursingEntryAmendmentModel.create({
        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        admissionId:
          toObjectId(
            input.admissionId,
            'admissionId',
          ),

        patientId:
          toObjectId(
            input.patientId,
            'patientId',
          ),

        entityType:
          'WARD_HANDOVER',

        entityId:
          toObjectId(
            input.handoverId,
            'handoverId',
          ),

        amendmentSequence:
          input.amendmentSequence,

        amendmentType:
          input.amendmentType,

        previousSnapshotHash:
          input.previousSnapshotHash,

        replacementEntityId:
          input.replacementHandoverId ==
          null
            ? null
            : toObjectId(
                input.replacementHandoverId,
                'replacementHandoverId',
              ),

        reason:
          input.reason,

        occurredAt:
          input.occurredAt,

        performedByUserId:
          toObjectId(
            input.actorUserId,
            'actorUserId',
          ),

        performedByStaffId:
          toObjectId(
            input.actorStaffId,
            'actorStaffId',
          ),

        transactionId:
          input.transactionId,

        correlationId:
          input.correlationId,

        schemaVersion:
          1,

        version:
          0,

        createdBy:
          toObjectId(
            input.actorUserId,
            'actorUserId',
          ),

        updatedBy:
          toObjectId(
            input.actorUserId,
            'actorUserId',
          ),
      });

    return created._id.toHexString();
  }

  public static snapshotHash(
    record:
      NursingWardHandoverRecord,
  ): string {
    return createHash(
      'sha256',
    )
      .update(
        JSON.stringify({
          id:
            record._id.toHexString(),

          version:
            record.version,

          status:
            record.status,

          summary:
            record.summary,

          activeConcerns:
            record.activeConcerns,

          pendingTasks:
            record.pendingTasks,

          medicationConcerns:
            record.medicationConcerns,

          safetyConcerns:
            record.safetyConcerns,
        }),
      )
      .digest(
        'hex',
      );
  }
}