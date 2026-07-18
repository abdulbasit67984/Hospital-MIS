import Decimal from 'decimal.js';

import {
  RequestValidationError,
} from '@hospital-mis/shared';

import {
  VitalSignConcurrencyError,
  VitalSignCorrectionConflictError,
  VitalSignNotFoundError,
} from '../clinical-emr.errors.js';

import {
  protectedClinicalEmrRestorePayload,
  restoreClinicalRecordCompensation,
} from '../clinical-emr.mutation-snapshots.js';

import type {
  ClinicalEmrTransactionContext,
} from '../clinical-emr.ports.js';

import {
  CLINICAL_EMR_OUTBOX_EVENTS,
  CLINICAL_EMR_REALTIME_EVENTS,
} from '../clinical-emr.transaction.constants.js';

import type {
  ClinicalEmrActorContext,
  CorrectVitalSignsInput,
  RecordVitalSignsInput,
  VitalSignMeasurementInput,
  VitalSignRecord,
} from '../clinical-emr.types.js';

import {
  normalizeOptionalClinicalText,
} from '../clinical-emr.normalization.js';

import type {
  CreateVitalSignRecordInput,
  VitalSignRepository,
} from '../repositories/vital-sign.repository.js';

import type {
  ClinicalListCommandService,
} from './clinical-list-command.service.js';

export interface VitalSignMutationResult {
  vitalSignId: string;
  encounterId: string;
  patientId: string;
  admissionId: string | null;
  sourceClinicalNoteId: string | null;
  observerProviderId: string;
  source: VitalSignRecord['source'];
  deviceIdentifier: string | null;
  measuredAt: string;
  recordedAt: string;
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
  status: VitalSignRecord['status'];
  correctedAt: string | null;
  correctedBy: string | null;
  supersedesVitalSignId: string | null;
  supersededByVitalSignId: string | null;
  enteredInErrorAt: string | null;
  enteredInErrorBy: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface NormalizedVitalSignMeasurement {
  source: VitalSignRecord['source'];
  deviceIdentifier: string | null;
  measuredAt: Date;
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
}

function validationError(
  path: string,
  message: string,
): RequestValidationError {
  return new RequestValidationError([
    {
      code: 'invalid_vital_sign',
      message,
      path,
    },
  ]);
}

function decimalString(
  value: string | null | undefined,
  path: string,
  minimum: number,
  maximum: number,
  maximumScale = 3,
): string | null {
  if (value == null) {
    return null;
  }

  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/u.test(normalized)) {
    throw validationError(path, 'A positive decimal string is required');
  }

  const fraction = normalized.split('.')[1] ?? '';
  if (fraction.length > maximumScale) {
    throw validationError(
      path,
      `No more than ${maximumScale} decimal places are permitted`,
    );
  }

  const decimal = new Decimal(normalized);
  if (decimal.lt(minimum) || decimal.gt(maximum)) {
    throw validationError(
      path,
      `Value must be between ${minimum} and ${maximum}`,
    );
  }

  return decimal.toFixed(fraction.length);
}

function integerValue(
  value: number | null | undefined,
  path: string,
  minimum: number,
  maximum: number,
): number | null {
  if (value == null) {
    return null;
  }

  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw validationError(
      path,
      `An integer between ${minimum} and ${maximum} is required`,
    );
  }

  return value;
}

function id(
  value: { toHexString(): string } | null,
): string | null {
  return value?.toHexString() ?? null;
}

function decimal(
  value: { toString(): string } | null,
): string | null {
  return value?.toString() ?? null;
}

export function toVitalSignMutationResult(
  record: VitalSignRecord,
): VitalSignMutationResult {
  return {
    vitalSignId: record._id.toHexString(),
    encounterId: record.encounterId.toHexString(),
    patientId: record.patientId.toHexString(),
    admissionId: id(record.admissionId),
    sourceClinicalNoteId: id(record.sourceClinicalNoteId),
    observerProviderId: record.observerProviderId.toHexString(),
    source: record.source,
    deviceIdentifier: record.deviceIdentifier,
    measuredAt: record.measuredAt.toISOString(),
    recordedAt: record.recordedAt.toISOString(),
    bodyPosition: record.bodyPosition,
    temperatureCelsius: decimal(record.temperatureCelsius),
    temperatureSite: record.temperatureSite,
    pulsePerMinute: record.pulsePerMinute,
    respiratoryRatePerMinute: record.respiratoryRatePerMinute,
    systolicBloodPressureMmHg: record.systolicBloodPressureMmHg,
    diastolicBloodPressureMmHg: record.diastolicBloodPressureMmHg,
    oxygenSaturationPercent: decimal(record.oxygenSaturationPercent),
    bloodGlucoseMgDl: decimal(record.bloodGlucoseMgDl),
    painScore: record.painScore,
    weightKg: decimal(record.weightKg),
    heightCm: decimal(record.heightCm),
    bmi: decimal(record.bmi),
    oxygenDeliveryMethod: record.oxygenDeliveryMethod,
    oxygenFlowLitresPerMinute: decimal(
      record.oxygenFlowLitresPerMinute,
    ),
    notes: record.notes,
    confidentiality: record.confidentiality,
    status: record.status,
    correctedAt: record.correctedAt?.toISOString() ?? null,
    correctedBy: id(record.correctedBy),
    supersedesVitalSignId: id(record.supersedesVitalSignId),
    supersededByVitalSignId: id(record.supersededByVitalSignId),
    enteredInErrorAt: record.enteredInErrorAt?.toISOString() ?? null,
    enteredInErrorBy: id(record.enteredInErrorBy),
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function vitalSignAuditSnapshot(
  record: VitalSignRecord,
): Record<string, unknown> {
  return {
    vitalSignId: record._id.toHexString(),
    encounterId: record.encounterId.toHexString(),
    patientId: record.patientId.toHexString(),
    observerProviderId: record.observerProviderId.toHexString(),
    measuredAt: record.measuredAt.toISOString(),
    status: record.status,
    confidentiality: record.confidentiality,
    measurementTypes: measurementTypes(record),
    supersedesVitalSignId: id(record.supersedesVitalSignId),
    supersededByVitalSignId: id(record.supersededByVitalSignId),
    version: record.version,
  };
}

export function safeVitalSignEventPayload(
  record: VitalSignRecord,
): Record<string, unknown> {
  return {
    vitalSignId: record._id.toHexString(),
    encounterId: record.encounterId.toHexString(),
    patientId: record.patientId.toHexString(),
    observerProviderId: record.observerProviderId.toHexString(),
    measuredAt: record.measuredAt.toISOString(),
    status: record.status,
    measurementTypes: measurementTypes(record),
    supersedesVitalSignId: id(record.supersedesVitalSignId),
    supersededByVitalSignId: id(record.supersededByVitalSignId),
    version: record.version,
  };
}

function measurementTypes(
  record: VitalSignRecord,
): string[] {
  const values: Array<[string, unknown]> = [
    ['TEMPERATURE', record.temperatureCelsius],
    ['PULSE', record.pulsePerMinute],
    ['RESPIRATORY_RATE', record.respiratoryRatePerMinute],
    ['BLOOD_PRESSURE', record.systolicBloodPressureMmHg],
    ['OXYGEN_SATURATION', record.oxygenSaturationPercent],
    ['BLOOD_GLUCOSE', record.bloodGlucoseMgDl],
    ['PAIN_SCORE', record.painScore],
    ['WEIGHT', record.weightKg],
    ['HEIGHT', record.heightCm],
    ['BMI', record.bmi],
  ];

  return values
    .filter(([, value]) => value != null)
    .map(([name]) => name);
}

export function vitalSignRestoreSnapshot(
  record: VitalSignRecord,
) {
  return {
    version: record.version,
    updatedBy: record.updatedBy.toHexString(),
    updatedAt: record.updatedAt.toISOString(),
    values: {
      status: record.status,
      correctedAt: record.correctedAt?.toISOString() ?? null,
      correctedBy: id(record.correctedBy),
      correctionReason: record.correctionReason,
      supersededByVitalSignId: id(record.supersededByVitalSignId),
      enteredInErrorAt: record.enteredInErrorAt?.toISOString() ?? null,
      enteredInErrorBy: id(record.enteredInErrorBy),
      enteredInErrorReason: record.enteredInErrorReason,
    },
  };
}

export class VitalSignCommandService {
  public constructor(
    public readonly repository: VitalSignRepository,
    public readonly support: ClinicalListCommandService,
  ) {}

  public normalizeMeasurement(
    input: VitalSignMeasurementInput,
    encounterStartedAt: Date,
    now: Date,
  ): NormalizedVitalSignMeasurement {
    const measuredAt = new Date(input.measuredAt);
    if (Number.isNaN(measuredAt.getTime())) {
      throw validationError('body.measuredAt', 'A valid timestamp is required');
    }

    if (measuredAt.getTime() > now.getTime() + 5 * 60_000) {
      throw validationError(
        'body.measuredAt',
        'Measurement time cannot be more than five minutes in the future',
      );
    }

    if (measuredAt.getTime() < encounterStartedAt.getTime() - 12 * 60 * 60_000) {
      throw validationError(
        'body.measuredAt',
        'Measurement time falls outside the supported encounter window',
      );
    }

    const source = input.source ?? 'MANUAL';
    const deviceIdentifier = normalizeOptionalClinicalText(
      input.deviceIdentifier,
      'deviceIdentifier',
    );

    if (source === 'DEVICE' && deviceIdentifier === null) {
      throw validationError(
        'body.deviceIdentifier',
        'Device-originated measurements require deviceIdentifier',
      );
    }

    if (source !== 'DEVICE' && deviceIdentifier !== null) {
      throw validationError(
        'body.deviceIdentifier',
        'deviceIdentifier is only valid when source is DEVICE',
      );
    }

    const temperatureCelsius = decimalString(
      input.temperatureCelsius,
      'body.temperatureCelsius',
      20,
      50,
      2,
    );
    const oxygenSaturationPercent = decimalString(
      input.oxygenSaturationPercent,
      'body.oxygenSaturationPercent',
      0,
      100,
      2,
    );
    const bloodGlucoseMgDl = decimalString(
      input.bloodGlucoseMgDl,
      'body.bloodGlucoseMgDl',
      0,
      2_500,
      2,
    );
    const weightKg = decimalString(
      input.weightKg,
      'body.weightKg',
      0.1,
      1_000,
      3,
    );
    const heightCm = decimalString(
      input.heightCm,
      'body.heightCm',
      10,
      300,
      2,
    );
    let bmi = decimalString(input.bmi, 'body.bmi', 1, 150, 2);

    if (bmi === null && weightKg !== null && heightCm !== null) {
      const metres = new Decimal(heightCm).dividedBy(100);
      bmi = new Decimal(weightKg)
        .dividedBy(metres.times(metres))
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toFixed(2);
    }

    const pulsePerMinute = integerValue(
      input.pulsePerMinute,
      'body.pulsePerMinute',
      0,
      400,
    );
    const respiratoryRatePerMinute = integerValue(
      input.respiratoryRatePerMinute,
      'body.respiratoryRatePerMinute',
      0,
      150,
    );
    const systolicBloodPressureMmHg = integerValue(
      input.systolicBloodPressureMmHg,
      'body.systolicBloodPressureMmHg',
      20,
      350,
    );
    const diastolicBloodPressureMmHg = integerValue(
      input.diastolicBloodPressureMmHg,
      'body.diastolicBloodPressureMmHg',
      10,
      250,
    );
    const painScore = integerValue(
      input.painScore,
      'body.painScore',
      0,
      10,
    );

    if (
      (systolicBloodPressureMmHg === null) !==
      (diastolicBloodPressureMmHg === null)
    ) {
      throw validationError(
        'body.systolicBloodPressureMmHg',
        'Systolic and diastolic blood pressure must be recorded together',
      );
    }

    if (
      systolicBloodPressureMmHg !== null &&
      diastolicBloodPressureMmHg !== null &&
      systolicBloodPressureMmHg <= diastolicBloodPressureMmHg
    ) {
      throw validationError(
        'body.systolicBloodPressureMmHg',
        'Systolic blood pressure must exceed diastolic blood pressure',
      );
    }

    const measurementValues = [
      temperatureCelsius,
      pulsePerMinute,
      respiratoryRatePerMinute,
      systolicBloodPressureMmHg,
      oxygenSaturationPercent,
      bloodGlucoseMgDl,
      painScore,
      weightKg,
      heightCm,
      bmi,
    ];

    if (measurementValues.every((value) => value === null)) {
      throw validationError(
        'body',
        'At least one vital sign or clinical measurement is required',
      );
    }

    const confidentiality = input.confidentiality ?? 'ROUTINE';
    const restrictionReason = normalizeOptionalClinicalText(
      input.restrictionReason,
      'restrictionReason',
    );

    if (confidentiality !== 'ROUTINE' && restrictionReason === null) {
      throw validationError(
        'body.restrictionReason',
        'Restricted vital signs require restrictionReason',
      );
    }

    if (confidentiality === 'ROUTINE' && restrictionReason !== null) {
      throw validationError(
        'body.restrictionReason',
        'restrictionReason is only valid for restricted vital signs',
      );
    }

    return {
      source,
      deviceIdentifier,
      measuredAt,
      bodyPosition: input.bodyPosition ?? 'UNSPECIFIED',
      temperatureCelsius,
      temperatureSite: input.temperatureSite ?? 'UNSPECIFIED',
      pulsePerMinute,
      respiratoryRatePerMinute,
      systolicBloodPressureMmHg,
      diastolicBloodPressureMmHg,
      oxygenSaturationPercent,
      bloodGlucoseMgDl,
      painScore,
      weightKg,
      heightCm,
      bmi,
      oxygenDeliveryMethod: normalizeOptionalClinicalText(
        input.oxygenDeliveryMethod,
        'oxygenDeliveryMethod',
      ),
      oxygenFlowLitresPerMinute: decimalString(
        input.oxygenFlowLitresPerMinute,
        'body.oxygenFlowLitresPerMinute',
        0,
        100,
        2,
      ),
      notes: normalizeOptionalClinicalText(input.notes, 'notes'),
      confidentiality,
      restrictionReason,
    };
  }

  public async requireRecord(
    actor: ClinicalEmrActorContext,
    vitalSignId: string,
  ): Promise<VitalSignRecord> {
    const record = await this.repository.findById(
      actor.facilityId,
      vitalSignId,
      true,
    );

    if (record === null) {
      throw new VitalSignNotFoundError();
    }

    return record;
  }

  public assertExpectedVersion(
    record: VitalSignRecord,
    expectedVersion: number,
  ): void {
    if (record.version !== expectedVersion) {
      throw new VitalSignConcurrencyError();
    }
  }

  public assertCorrectable(record: VitalSignRecord): void {
    if (record.status !== 'RECORDED') {
      throw new VitalSignCorrectionConflictError();
    }
  }

  public async createRecord(
    input: Readonly<{
      actor: ClinicalEmrActorContext;
      transaction: ClinicalEmrTransactionContext;
      encounterId: string;
      patientId: string;
      admissionId: string | null;
      observerProviderId: string;
      sourceClinicalNoteId: string | null;
      measurement: NormalizedVitalSignMeasurement;
      recordedAt: Date;
      supersedesVitalSignId?: string | null;
    }>,
  ): Promise<VitalSignRecord> {
    const createInput: CreateVitalSignRecordInput = {
      vitalSignId: this.support.newId(),
      facilityId: input.actor.facilityId,
      encounterId: input.encounterId,
      patientId: input.patientId,
      admissionId: input.admissionId,
      sourceClinicalNoteId: input.sourceClinicalNoteId,
      observerProviderId: input.observerProviderId,
      ...input.measurement,
      recordedAt: input.recordedAt,
      supersedesVitalSignId: input.supersedesVitalSignId ?? null,
      transactionId: input.transaction.transactionId,
      correlationId: input.actor.correlationId,
      actorUserId: input.actor.userId,
    };

    return this.repository.create(createInput);
  }

  public async registerRestoreCompensation(
    input: Readonly<{
      actor: ClinicalEmrActorContext;
      transaction: ClinicalEmrTransactionContext;
      before: VitalSignRecord;
      expectedPostVersion: number;
    }>,
  ): Promise<void> {
    const vitalSignId = input.before._id.toHexString();
    const restorePayload = protectedClinicalEmrRestorePayload({
      collection: 'vitalSigns',
      entityId: vitalSignId,
      expectedPostVersion: input.expectedPostVersion,
      snapshot: vitalSignRestoreSnapshot(input.before),
      transactionId: input.transaction.transactionId,
      snapshotCrypto: this.support.dependencies.snapshotCrypto,
    });

    await input.transaction.registerCompensation(
      restoreClinicalRecordCompensation(
        `restore-vital-sign:${vitalSignId}:${input.expectedPostVersion}`,
        restorePayload,
      ),
    );
  }

  public async publishMutation(
    input: Readonly<{
      transaction: ClinicalEmrTransactionContext;
      actor: ClinicalEmrActorContext;
      occurredAt: Date;
      auditAction: string;
      before: VitalSignRecord | null;
      after: VitalSignRecord;
      reason?: string;
      metadata?: Record<string, unknown>;
    }>,
  ): Promise<void> {
    await this.support.publishMutation({
      transaction: input.transaction,
      actor: input.actor,
      occurredAt: input.occurredAt,
      auditAction: input.auditAction,
      outboxEventType: CLINICAL_EMR_OUTBOX_EVENTS.VITAL_SIGNS_CHANGED,
      realtimeEventTypes: [
        CLINICAL_EMR_REALTIME_EVENTS.VITAL_SIGNS_CHANGED,
        CLINICAL_EMR_REALTIME_EVENTS.PATIENT_TIMELINE_CHANGED,
      ],
      aggregateType: 'VITAL_SIGN',
      entityType: 'VitalSign',
      entityId: input.after._id.toHexString(),
      patientId: input.after.patientId.toHexString(),
      encounterId: input.after.encounterId.toHexString(),
      providerId: input.after.observerProviderId.toHexString(),
      before: input.before,
      after: input.after,
      beforeSnapshot: vitalSignAuditSnapshot,
      afterSnapshot: vitalSignAuditSnapshot,
      eventPayload: safeVitalSignEventPayload,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    });
  }

  public safeJournalPayload(
    operation: string,
    input: (RecordVitalSignsInput | CorrectVitalSignsInput) & {
      encounterId?: string;
    },
  ): Record<string, unknown> {
    return {
      operation,
      encounterId: input.encounterId ?? null,
      hasSourceClinicalNote: input.sourceClinicalNoteId != null,
      source: input.source ?? 'MANUAL',
      confidentiality: input.confidentiality ?? 'ROUTINE',
      measurementTypes: [
        input.temperatureCelsius == null ? null : 'TEMPERATURE',
        input.pulsePerMinute == null ? null : 'PULSE',
        input.respiratoryRatePerMinute == null
          ? null
          : 'RESPIRATORY_RATE',
        input.systolicBloodPressureMmHg == null
          ? null
          : 'BLOOD_PRESSURE',
        input.oxygenSaturationPercent == null
          ? null
          : 'OXYGEN_SATURATION',
        input.bloodGlucoseMgDl == null ? null : 'BLOOD_GLUCOSE',
        input.painScore == null ? null : 'PAIN_SCORE',
        input.weightKg == null ? null : 'WEIGHT',
        input.heightCm == null ? null : 'HEIGHT',
      ].filter((value): value is string => value !== null),
    };
  }
}