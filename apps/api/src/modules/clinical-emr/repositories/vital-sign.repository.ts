import type {
  FilterQuery,
} from 'mongoose';

import {
  Decimal128,
  VitalSignModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  ClinicalEmrPageResult,
  VitalSignListQuery,
  VitalSignRecord,
} from '../clinical-emr.types.js';

const VITAL_SIGN_STANDARD_SELECT = [
  '_id',
  'facilityId',
  'encounterId',
  'patientId',
  'admissionId',
  'sourceClinicalNoteId',
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
  'confidentiality',
  'status',
  'correctedAt',
  'correctedBy',
  'supersedesVitalSignId',
  'supersededByVitalSignId',
  'enteredInErrorAt',
  'enteredInErrorBy',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const VITAL_SIGN_INTERNAL_SELECT = [
  VITAL_SIGN_STANDARD_SELECT,
  '+notes',
  '+restrictionReason',
  '+correctionReason',
  '+enteredInErrorReason',
].join(' ');

function nullableObjectId(
  value: string | null | undefined,
  path: string,
) {
  return value == null
    ? null
    : toObjectId(value, path);
}

function nullableDecimal(
  value: string | null | undefined,
): Decimal128 | null {
  return value == null
    ? null
    : Decimal128.fromString(value);
}

export interface CreateVitalSignRecordInput {
  vitalSignId: string;
  facilityId: string;
  encounterId: string;
  patientId: string;
  admissionId: string | null;
  sourceClinicalNoteId: string | null;
  observerProviderId: string;
  source: VitalSignRecord['source'];
  deviceIdentifier: string | null;
  measuredAt: Date;
  recordedAt: Date;
  bodyPosition: VitalSignRecord['bodyPosition'];
  temperatureCelsius: string | null;
  temperatureSite: VitalSignRecord['temperatureSite'];
  pulsePerMinute: number | null;
  respiratoryRatePerMinute: number | null;
  systolicBloodPressureMmHg: number | null;
  diastolicBloodPressureMmHg: number | null;
  oxygenSaturationPercent: string | null;
  bloodGlucoseMgDl: string | null;
  painScore: number | null;
  weightKg: string | null;
  heightCm: string | null;
  bmi: string | null;
  oxygenDeliveryMethod: string | null;
  oxygenFlowLitresPerMinute: string | null;
  notes: string | null;
  confidentiality: VitalSignRecord['confidentiality'];
  restrictionReason: string | null;
  supersedesVitalSignId?: string | null;
  transactionId: string;
  correlationId: string;
  actorUserId: string;
}

export class VitalSignRepository {
  public async create(
    input: CreateVitalSignRecordInput,
  ): Promise<VitalSignRecord> {
    const created = await VitalSignModel.create({
      _id: toObjectId(input.vitalSignId, 'vitalSignId'),
      facilityId: toObjectId(input.facilityId, 'facilityId'),
      encounterId: toObjectId(input.encounterId, 'encounterId'),
      patientId: toObjectId(input.patientId, 'patientId'),
      admissionId: nullableObjectId(input.admissionId, 'admissionId'),
      sourceClinicalNoteId: nullableObjectId(
        input.sourceClinicalNoteId,
        'sourceClinicalNoteId',
      ),
      observerProviderId: toObjectId(
        input.observerProviderId,
        'observerProviderId',
      ),
      source: input.source,
      deviceIdentifier: input.deviceIdentifier,
      measuredAt: input.measuredAt,
      recordedAt: input.recordedAt,
      bodyPosition: input.bodyPosition,
      temperatureCelsius: nullableDecimal(input.temperatureCelsius),
      temperatureSite: input.temperatureSite,
      pulsePerMinute: input.pulsePerMinute,
      respiratoryRatePerMinute: input.respiratoryRatePerMinute,
      systolicBloodPressureMmHg: input.systolicBloodPressureMmHg,
      diastolicBloodPressureMmHg: input.diastolicBloodPressureMmHg,
      oxygenSaturationPercent: nullableDecimal(
        input.oxygenSaturationPercent,
      ),
      bloodGlucoseMgDl: nullableDecimal(input.bloodGlucoseMgDl),
      painScore: input.painScore,
      weightKg: nullableDecimal(input.weightKg),
      heightCm: nullableDecimal(input.heightCm),
      bmi: nullableDecimal(input.bmi),
      oxygenDeliveryMethod: input.oxygenDeliveryMethod,
      oxygenFlowLitresPerMinute: nullableDecimal(
        input.oxygenFlowLitresPerMinute,
      ),
      notes: input.notes,
      confidentiality: input.confidentiality,
      restrictionReason: input.restrictionReason,
      status: 'RECORDED',
      correctedAt: null,
      correctedBy: null,
      correctionReason: null,
      supersedesVitalSignId: nullableObjectId(
        input.supersedesVitalSignId,
        'supersedesVitalSignId',
      ),
      supersededByVitalSignId: null,
      enteredInErrorAt: null,
      enteredInErrorBy: null,
      enteredInErrorReason: null,
      transactionId: input.transactionId,
      correlationId: input.correlationId,
      schemaVersion: 1,
      version: 0,
      createdBy: toObjectId(input.actorUserId, 'actorUserId'),
      updatedBy: toObjectId(input.actorUserId, 'actorUserId'),
    });

    return created.toObject() as VitalSignRecord;
  }

  public async findById(
    facilityId: string,
    vitalSignId: string,
    includeSensitive = false,
  ): Promise<VitalSignRecord | null> {
    return VitalSignModel.findOne({
      _id: toObjectId(vitalSignId, 'vitalSignId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    })
      .select(
        includeSensitive
          ? VITAL_SIGN_INTERNAL_SELECT
          : VITAL_SIGN_STANDARD_SELECT,
      )
      .lean<VitalSignRecord>()
      .exec();
  }

  public async list(
    facilityId: string,
    query: VitalSignListQuery,
    includeSensitive = false,
  ): Promise<ClinicalEmrPageResult<VitalSignRecord>> {
    const filter: FilterQuery<VitalSignRecord> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
    };

    if (query.encounterId !== undefined) {
      filter.encounterId = toObjectId(query.encounterId, 'encounterId');
    }

    if (query.patientId !== undefined) {
      filter.patientId = toObjectId(query.patientId, 'patientId');
    }

    if (query.admissionId !== undefined) {
      filter.admissionId = toObjectId(query.admissionId, 'admissionId');
    }

    if (query.status !== undefined) {
      filter.status = query.status;
    }

    if (
      query.measuredFrom !== undefined ||
      query.measuredTo !== undefined
    ) {
      filter.measuredAt = {
        ...(query.measuredFrom === undefined
          ? {}
          : {
              $gte: new Date(query.measuredFrom),
            }),
        ...(query.measuredTo === undefined
          ? {}
          : {
              $lte: new Date(query.measuredTo),
            }),
      };
    }

    const direction = query.sortDirection === 'asc'
      ? 1
      : -1;
    const skip = (query.page - 1) * query.pageSize;

    const [items, totalItems] = await Promise.all([
      VitalSignModel.find(filter)
        .select(
          includeSensitive
            ? VITAL_SIGN_INTERNAL_SELECT
            : VITAL_SIGN_STANDARD_SELECT,
        )
        .sort({
          measuredAt: direction,
          _id: direction,
        })
        .skip(skip)
        .limit(query.pageSize)
        .lean<VitalSignRecord[]>()
        .exec(),
      VitalSignModel.countDocuments(filter).exec(),
    ]);

    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    };
  }

  public async markCorrectedWithVersion(
    input: Readonly<{
      facilityId: string;
      vitalSignId: string;
      expectedVersion: number;
      replacementVitalSignId: string;
      reason: string;
      occurredAt: Date;
      actorUserId: string;
    }>,
  ): Promise<VitalSignRecord | null> {
    return VitalSignModel.findOneAndUpdate(
      {
        _id: toObjectId(input.vitalSignId, 'vitalSignId'),
        facilityId: toObjectId(input.facilityId, 'facilityId'),
        version: input.expectedVersion,
        status: 'RECORDED',
      },
      {
        $set: {
          status: 'CORRECTED',
          correctedAt: input.occurredAt,
          correctedBy: toObjectId(input.actorUserId, 'actorUserId'),
          correctionReason: input.reason,
          supersededByVitalSignId: toObjectId(
            input.replacementVitalSignId,
            'replacementVitalSignId',
          ),
          updatedBy: toObjectId(input.actorUserId, 'actorUserId'),
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
      .select(VITAL_SIGN_INTERNAL_SELECT)
      .lean<VitalSignRecord>()
      .exec();
  }

  public async markEnteredInErrorWithVersion(
    input: Readonly<{
      facilityId: string;
      vitalSignId: string;
      expectedVersion: number;
      reason: string;
      occurredAt: Date;
      actorUserId: string;
    }>,
  ): Promise<VitalSignRecord | null> {
    return VitalSignModel.findOneAndUpdate(
      {
        _id: toObjectId(input.vitalSignId, 'vitalSignId'),
        facilityId: toObjectId(input.facilityId, 'facilityId'),
        version: input.expectedVersion,
        status: 'RECORDED',
      },
      {
        $set: {
          status: 'ENTERED_IN_ERROR',
          enteredInErrorAt: input.occurredAt,
          enteredInErrorBy: toObjectId(input.actorUserId, 'actorUserId'),
          enteredInErrorReason: input.reason,
          updatedBy: toObjectId(input.actorUserId, 'actorUserId'),
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
      .select(VITAL_SIGN_INTERNAL_SELECT)
      .lean<VitalSignRecord>()
      .exec();
  }
}