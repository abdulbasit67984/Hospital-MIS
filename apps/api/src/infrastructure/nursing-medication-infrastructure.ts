import {
  randomUUID,
} from 'node:crypto';

import {
  Decimal128,
  type Db,
} from '@hospital-mis/database';

import {
  AdmissionModel,
  createObjectId,
  toObjectId,
} from '@hospital-mis/database';

import {
  ConflictError,
} from '@hospital-mis/shared';

import type {
  AuditRepository,
} from '../modules/audit/audit.repository.js';

import {
  sanitizeAuditSnapshot,
} from '../modules/audit/audit.sanitizer.js';

import type {
  ClinicalEmrApplication,
} from '../modules/clinical-emr/clinical-emr.module.js';

import type {
  ClinicalEmrEncryptedSnapshot,
  ClinicalEmrSnapshotCryptoPort,
} from '../modules/clinical-emr/clinical-emr.ports.js';

import {
  MongoClinicalEmrTransactionManagerAdapter,
} from './clinical-emr-transaction-manager.adapter.js';

import type {
  ClinicalEmrCompensationExecutorPort,
} from './clinical-emr-compensation.executor.js';

import {
  createOperationalInfrastructure,
} from './operational-infrastructure.js';

import {
  createNursingMedicationApplication,
} from '../modules/nursing-medication/nursing-medication.application.js';

import {
  MEDICATION_ADMINISTRATION_TRANSACTION_TYPES,
} from '../modules/nursing-medication/services/medication-administration.service.js';

import {
  NURSING_MEDICATION_TRANSACTION_TYPES,
} from '../modules/nursing-medication/nursing-medication.transaction.constants.js';

import {
  NURSING_OBSERVATION_TRANSACTION_TYPES,
} from '../modules/nursing-medication/nursing-observation.transaction-support.js';

import type {
  NursingMedicationCommandDependencies,
  NursingMedicationEncryptedValue,
  NursingMedicationSnapshotCryptoPort,
  NursingMedicationTransactionCompensation,
} from '../modules/nursing-medication/nursing-medication.workflow-ports.js';

import type {
  NursingMedicationAuditEntry,
  NursingMedicationOutboxMessage,
  NursingMedicationRealtimeMessage,
} from '../modules/nursing-medication/nursing-medication.workflow-ports.js';

import type {
  NursingVitalMutationResult,
} from '../modules/nursing-medication/nursing-observation.contracts.js';

import type {
  NursingVitalSignIntegrationPort,
} from '../modules/nursing-medication/nursing-observation.ports.js';

import type {
  NursingMedicationActorContext,
} from '../modules/nursing-medication/nursing-medication.contracts.js';

const nursingTransactionTypes = [
  ...Object.values(
    NURSING_MEDICATION_TRANSACTION_TYPES,
  ),
  ...Object.values(
    NURSING_OBSERVATION_TRANSACTION_TYPES,
  ),
  ...Object.values(
    MEDICATION_ADMINISTRATION_TRANSACTION_TYPES,
  ),
];

const compensatableCollections = new Set([
  'nursingAssessments',
  'nursingAssessmentVersions',
  'nursingCarePlans',
  'nursingCarePlanVersions',
  'nursingTasks',
  'intakeOutputEntries',
  'nursingDevices',
  'nursingDeviceObservations',
  'wardHandovers',
  'nursingEntryAmendments',
  'medicationSchedules',
  'medicationAdministrations',
  'medicationAdministrationAmendments',
]);

const mutableFields: Readonly<Record<string, ReadonlySet<string>>> = {
  nursingAssessments: new Set([
    'status',
    'signedAt',
    'signedByUserId',
    'signedByStaffId',
    'supersededByAssessmentId',
    'correctionReason',
    'enteredInErrorAt',
    'enteredInErrorByUserId',
    'enteredInErrorByStaffId',
    'enteredInErrorReason',
  ]),

  nursingCarePlans: new Set([
    'status',
    'problems',
    'assignedNurseStaffId',
    'assignedTeamCode',
    'targetCompletionAt',
    'nextReviewAt',
    'lastReviewedAt',
    'lastReviewedByStaffId',
    'outcomeEvaluation',
    'completedAt',
    'completedByStaffId',
    'cancellationReason',
    'revisionNumber',
    'supersededByCarePlanId',
    'correctionReason',
  ]),

  nursingTasks: new Set([
    'status',
    'assignedStaffId',
    'assignedTeamCode',
    'dueAt',
    'carriedForwardToTaskId',
    'startedAt',
    'completedAt',
    'completedByUserId',
    'completedByStaffId',
    'dispositionReasonCode',
    'dispositionReason',
    'escalatedAt',
    'escalatedToStaffId',
    'escalationReason',
  ]),

  intakeOutputEntries: new Set([
    'status',
    'supersededByEntryId',
    'correctionReason',
    'enteredInErrorAt',
    'enteredInErrorByUserId',
    'enteredInErrorByStaffId',
    'enteredInErrorReason',
  ]),

  nursingDevices: new Set([
    'status',
    'removedAt',
    'removedByStaffId',
    'removalReason',
  ]),

  wardHandovers: new Set([
    'status',
    'supersededByWardHandoverId',
  ]),

  medicationSchedules: new Set([
    'status',
    'holdReason',
    'nextScheduledAt',
    'lastAdministrationAt',
  ]),

  medicationAdministrations: new Set([
    'status',
    'reasonCode',
    'reason',
    'statusChangedAt',
    'statusChangedBy',
    'supersededByAdministrationId',
  ]),
};

const objectIdFields = new Set([
  'signedByUserId',
  'signedByStaffId',
  'supersededByAssessmentId',
  'enteredInErrorByUserId',
  'enteredInErrorByStaffId',
  'assignedNurseStaffId',
  'lastReviewedByStaffId',
  'completedByStaffId',
  'supersededByCarePlanId',
  'assignedStaffId',
  'carriedForwardToTaskId',
  'completedByUserId',
  'completedByStaffId',
  'escalatedToStaffId',
  'supersededByEntryId',
  'removedByStaffId',
  'supersededByWardHandoverId',
  'statusChangedBy',
  'supersededByAdministrationId',
  'updatedBy',
]);

const dateFields = new Set([
  'signedAt',
  'enteredInErrorAt',
  'targetCompletionAt',
  'nextReviewAt',
  'lastReviewedAt',
  'completedAt',
  'dueAt',
  'startedAt',
  'escalatedAt',
  'removedAt',
  'nextScheduledAt',
  'lastAdministrationAt',
  'statusChangedAt',
  'updatedAt',
]);

type JsonObject = Record<string, unknown>;

type RestoreSnapshot = {
  version: number;
  updatedBy: string;
  updatedAt: string;
  values: Record<string, unknown>;
};

function asObject(
  value: unknown,
  name: string,
): JsonObject {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new TypeError(
      `${name} must be an object`,
    );
  }

  return value as JsonObject;
}

function requiredString(
  object: JsonObject,
  field: string,
): string {
  const value = object[field];

  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new TypeError(
      `${field} must be a non-empty string`,
    );
  }

  return value;
}

function requiredInteger(
  object: JsonObject,
  field: string,
): number {
  const value = object[field];

  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new TypeError(
      `${field} must be a non-negative safe integer`,
    );
  }

  return value;
}

function supportedCollection(
  value: unknown,
): string {
  if (
    typeof value !== 'string' ||
    !compensatableCollections.has(
      value,
    )
  ) {
    throw new TypeError(
      'Unsupported nursing compensation collection',
    );
  }

  return value;
}

function encryptedSnapshot(
  value: unknown,
): ClinicalEmrEncryptedSnapshot {
  const object =
    asObject(
      value,
      'encryptedSnapshot',
    );

  const algorithm =
    requiredString(
      object,
      'algorithm',
    );

  if (
    algorithm !== 'AES-256-GCM'
  ) {
    throw new TypeError(
      'Unsupported nursing snapshot algorithm',
    );
  }

  const keyVersion =
    typeof object.keyVersion === 'string'
      ? object.keyVersion
      : requiredString(
          object,
          'keyId',
        );

  return {
    algorithm,
    keyVersion,
    initializationVector:
      requiredString(
        object,
        'initializationVector',
      ),
    authenticationTag:
      requiredString(
        object,
        'authenticationTag',
      ),
    ciphertext:
      requiredString(
        object,
        'ciphertext',
      ),
  };
}

function convertNested(
  value: unknown,
): unknown {
  if (
    value === null ||
    typeof value !== 'object'
  ) {
    return value;
  }

  if (
    Array.isArray(value)
  ) {
    return value.map(
      convertNested,
    );
  }

  const object =
    value as Record<string, unknown>;

  if (
    typeof object.$numberDecimal === 'string'
  ) {
    return Decimal128.fromString(
      object.$numberDecimal,
    );
  }

  return Object.fromEntries(
    Object.entries(
      object,
    ).map(
      ([field, nested]) => [
        field,
        convertRestoreValue(
          field,
          nested,
        ),
      ],
    ),
  );
}

function convertRestoreValue(
  field: string,
  value: unknown,
): unknown {
  if (
    value === null
  ) {
    return null;
  }

  if (
    objectIdFields.has(
      field,
    )
  ) {
    if (
      typeof value !== 'string'
    ) {
      throw new TypeError(
        `${field} must be an ObjectId string`,
      );
    }

    return toObjectId(
      value,
      field,
    );
  }

  if (
    dateFields.has(
      field,
    )
  ) {
    if (
      typeof value !== 'string'
    ) {
      throw new TypeError(
        `${field} must be an ISO date-time string`,
      );
    }

    const parsed =
      new Date(
        value,
      );

    if (
      Number.isNaN(
        parsed.valueOf(),
      )
    ) {
      throw new TypeError(
        `${field} contains an invalid date`,
      );
    }

    return parsed;
  }

  return convertNested(
    value,
  );
}

class NursingMedicationSnapshotCryptoAdapter
implements NursingMedicationSnapshotCryptoPort {
  public constructor(
    private readonly delegate:
      ClinicalEmrSnapshotCryptoPort,
  ) {}

  public protect(
    value: unknown,
    associatedData: string,
  ) {
    const protectedValue =
      this.delegate.protect(
        value,
        associatedData,
      );

    return {
      encryptedValue: {
        algorithm:
          protectedValue.encryptedValue.algorithm,
        keyId:
          protectedValue.encryptedValue.keyVersion,
        initializationVector:
          protectedValue.encryptedValue.initializationVector,
        authenticationTag:
          protectedValue.encryptedValue.authenticationTag,
        ciphertext:
          protectedValue.encryptedValue.ciphertext,
      } satisfies NursingMedicationEncryptedValue,
      valueHash:
        protectedValue.valueHash,
    };
  }
}

export class NursingMedicationCompensationExecutor
implements ClinicalEmrCompensationExecutorPort {
  public constructor(
    private readonly database:
      Db,
    private readonly crypto:
      ClinicalEmrSnapshotCryptoPort,
  ) {}

  public async execute(
    compensation:
      NursingMedicationTransactionCompensation,
  ): Promise<void> {
    switch (
      compensation.type
    ) {
      case 'nursing.record.delete_created':
      case 'nursing.observation.delete_created':
        await this.deleteCreatedRecord(
          compensation.payload,
        );
        return;

      case 'nursing.record.restore_encrypted':
      case 'nursing.observation.restore_encrypted':
        await this.restoreEncryptedRecord(
          compensation.payload,
        );
        return;

      default:
        throw new Error(
          `Unsupported nursing compensation type: ${compensation.type}`,
        );
    }
  }

  private async deleteCreatedRecord(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const object =
      asObject(
        payload,
        'payload',
      );

    const collectionName =
      supportedCollection(
        object.collection,
      );

    const entityId =
      requiredString(
        object,
        'entityId',
      );

    const transactionId =
      requiredString(
        object,
        'transactionId',
      );

    const expectedVersion =
      object.expectedVersion;

    if (
      expectedVersion !== null &&
      (
        typeof expectedVersion !== 'number' ||
        !Number.isSafeInteger(
          expectedVersion,
        ) ||
        expectedVersion < 0
      )
    ) {
      throw new TypeError(
        'expectedVersion must be null or a non-negative safe integer',
      );
    }

    const filter: Record<string, unknown> = {
      _id:
        toObjectId(
          entityId,
          'entityId',
        ),
      transactionId,
    };

    if (
      typeof expectedVersion === 'number'
    ) {
      filter.version =
        expectedVersion;
    }

    const collection =
      this.database.collection(
        collectionName,
      );

    const result =
      await collection.deleteOne(
        filter,
      );

    if (
      result.deletedCount === 1
    ) {
      return;
    }

    const existing =
      await collection.findOne({
        _id:
          toObjectId(
            entityId,
            'entityId',
          ),
      });

    if (
      existing === null
    ) {
      return;
    }

    throw new ConflictError(
      `Created ${collectionName} record changed before compensation`,
    );
  }

  private async restoreEncryptedRecord(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const object =
      asObject(
        payload,
        'payload',
      );

    const collectionName =
      supportedCollection(
        object.collection,
      );

    const allowed =
      mutableFields[
        collectionName
      ];

    if (
      allowed === undefined
    ) {
      throw new TypeError(
        `${collectionName} is append-only and cannot be restored`,
      );
    }

    const entityId =
      requiredString(
        object,
        'entityId',
      );

    const expectedPostVersion =
      requiredInteger(
        object,
        'expectedPostVersion',
      );

    const associatedData =
      requiredString(
        object,
        'associatedData',
      );

    const snapshotHash =
      requiredString(
        object,
        'snapshotHash',
      );

    const encrypted =
      encryptedSnapshot(
        object.encryptedSnapshot,
      );

    const snapshot =
      this.crypto.unprotect<RestoreSnapshot>(
        encrypted,
        associatedData,
      );

    if (
      !this.crypto.matchesHash(
        snapshot,
        associatedData,
        snapshotHash,
      )
    ) {
      throw new ConflictError(
        'Nursing compensation snapshot integrity check failed',
      );
    }

    if (
      !Number.isSafeInteger(
        snapshot.version,
      ) ||
      snapshot.version < 0 ||
      typeof snapshot.updatedBy !== 'string' ||
      typeof snapshot.updatedAt !== 'string' ||
      snapshot.values === null ||
      typeof snapshot.values !== 'object' ||
      Array.isArray(
        snapshot.values,
      )
    ) {
      throw new TypeError(
        'Nursing restore snapshot is malformed',
      );
    }

    const values:
      Record<string, unknown> = {};

    for (
      const [field, value] of
      Object.entries(
        snapshot.values,
      )
    ) {
      if (
        !allowed.has(
          field,
        )
      ) {
        throw new TypeError(
          `${field} is not an allowed ${collectionName} recovery field`,
        );
      }

      values[field] =
        convertRestoreValue(
          field,
          value,
        );
    }

    const updatedAt =
      new Date(
        snapshot.updatedAt,
      );

    if (
      Number.isNaN(
        updatedAt.valueOf(),
      )
    ) {
      throw new TypeError(
        'Nursing restore snapshot updatedAt is invalid',
      );
    }

    const collection =
      this.database.collection(
        collectionName,
      );

    const result =
      await collection.updateOne(
        {
          _id:
            toObjectId(
              entityId,
              'entityId',
            ),
          version:
            expectedPostVersion,
        },
        {
          $set: {
            ...values,
            version:
              snapshot.version,
            updatedBy:
              toObjectId(
                snapshot.updatedBy,
                'updatedBy',
              ),
            updatedAt,
          },
        },
      );

    if (
      result.matchedCount === 1
    ) {
      return;
    }

    const alreadyRestored =
      await collection.findOne({
        _id:
          toObjectId(
            entityId,
            'entityId',
          ),
        version:
          snapshot.version,
      });

    if (
      alreadyRestored !== null
    ) {
      return;
    }

    throw new ConflictError(
      `${collectionName} changed before recovery could restore it`,
    );
  }
}

class NursingMedicationAuditAdapter {
  public constructor(
    private readonly repository:
      AuditRepository,
  ) {}

  public async append(
    entry:
      NursingMedicationAuditEntry,
  ): Promise<void> {
    try {
      await this.repository.insertAuditEvent({
        eventId:
          entry.deduplicationKey,
        facilityId:
          entry.facilityId,
        actorId:
          entry.actorUserId,
        actorRoleIds:
          [],
        actorRoleCodes:
          [],
        action:
          entry.action,
        module:
          'nursing_medication_administration',
        entityType:
          entry.entityType,
        entityId:
          entry.entityId,
        ...(entry.reason === undefined
          ? {}
          : {
              reason:
                entry.reason,
            }),
        beforeSnapshot:
          sanitizeAuditSnapshot(
            entry.before ??
              null,
          ),
        afterSnapshot:
          sanitizeAuditSnapshot(
            entry.after ??
              null,
          ),
        metadata:
          sanitizeAuditSnapshot({
            ...(entry.metadata ?? {}),
            deduplicationKey:
              entry.deduplicationKey,
          }),
        outcome:
          'SUCCESS',
        sensitivity:
          'HIGHLY_SENSITIVE',
        correlationId:
          entry.correlationId,
        transactionId:
          entry.transactionId,
        requestSource:
          'API',
        ...(entry.ipAddress === undefined
          ? {}
          : {
              ipAddress:
                entry.ipAddress,
            }),
        ...(entry.userAgent === undefined
          ? {}
          : {
              userAgent:
                entry.userAgent,
            }),
        occurredAt:
          entry.occurredAt,
      });
    } catch (
      error
    ) {
      if (
        !(
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 11000
        )
      ) {
        throw error;
      }
    }
  }
}

class NursingMedicationOutboxAdapter {
  public constructor(
    private readonly database:
      Db,
  ) {}

  public async enqueue(
    message:
      NursingMedicationOutboxMessage,
  ): Promise<void> {
    try {
      await this.database.collection(
        'outboxEvents',
      ).insertOne({
        _id:
          createObjectId(),
        facilityId:
          toObjectId(
            message.facilityId,
            'facilityId',
          ),
        eventId:
          message.deduplicationKey,
        transactionId:
          message.transactionId,
        eventType:
          message.eventType,
        aggregateType:
          message.aggregateType,
        aggregateId:
          message.aggregateId,
        payload: {
          ...message.payload,
          actorUserId:
            message.actorUserId,
          correlationId:
            message.correlationId,
          occurredAt:
            message.occurredAt.toISOString(),
        },
        status:
          'BLOCKED',
        availableAt:
          message.occurredAt,
        attemptCount:
          0,
        schemaVersion:
          1,
        version:
          0,
        createdAt:
          message.occurredAt,
        updatedAt:
          message.occurredAt,
      });
    } catch (
      error
    ) {
      if (
        !(
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 11000
        )
      ) {
        throw error;
      }
    }
  }
}

class NursingMedicationSequenceAdapter {
  public constructor(
    private readonly sequences:
      ReturnType<
        typeof createOperationalInfrastructure
      >['sequences'],
  ) {}

  public next(
    facilityId: string,
    key: string,
  ) {
    return this.sequences.next(
      facilityId,
      key,
    );
  }
}

class ClinicalEmrVitalSignIntegrationAdapter
implements NursingVitalSignIntegrationPort {
  public constructor(
    private readonly clinicalEmr:
      ClinicalEmrApplication,
  ) {}

  private async encounterId(
    actor:
      NursingMedicationActorContext,
    admissionId:
      string,
  ): Promise<string> {
    const admission =
      await AdmissionModel.findOne({
        _id:
          toObjectId(
            admissionId,
            'admissionId',
          ),
        facilityId:
          toObjectId(
            actor.facilityId,
            'facilityId',
          ),
      })
        .select(
          'encounterId',
        )
        .lean<{
          encounterId: {
            toHexString(): string;
          };
        }>()
        .exec();

    if (
      admission === null
    ) {
      throw new ConflictError(
        'The admission is unavailable for vital-sign documentation',
      );
    }

    return admission.encounterId.toHexString();
  }

  private actor(
    actor:
      NursingMedicationActorContext,
  ) {
    return actor as never;
  }

  private result(
    actor:
      NursingMedicationActorContext,
    value:
      Record<string, unknown>,
  ): NursingVitalMutationResult {
    return {
      vitalSignId:
        String(
          value.vitalSignId ??
          value.id,
        ),
      facilityId:
        actor.facilityId,
      admissionId:
        value.admissionId == null
          ? null
          : String(
              value.admissionId,
            ),
      encounterId:
        String(
          value.encounterId,
        ),
      patientId:
        String(
          value.patientId,
        ),
      observerProviderId:
        String(
          value.observerProviderId,
        ),
      source:
        value.source as NursingVitalMutationResult['source'],
      deviceIdentifier:
        value.deviceIdentifier == null
          ? null
          : String(
              value.deviceIdentifier,
            ),
      measuredAt:
        String(
          value.measuredAt,
        ),
      recordedAt:
        String(
          value.recordedAt,
        ),
      bodyPosition:
        value.bodyPosition as NursingVitalMutationResult['bodyPosition'],
      temperatureCelsius:
        value.temperatureCelsius == null
          ? null
          : String(
              value.temperatureCelsius,
            ),
      temperatureSite:
        value.temperatureSite as NursingVitalMutationResult['temperatureSite'],
      pulsePerMinute:
        value.pulsePerMinute as number | null,
      respiratoryRatePerMinute:
        value.respiratoryRatePerMinute as number | null,
      systolicBloodPressureMmHg:
        value.systolicBloodPressureMmHg as number | null,
      diastolicBloodPressureMmHg:
        value.diastolicBloodPressureMmHg as number | null,
      oxygenSaturationPercent:
        value.oxygenSaturationPercent == null
          ? null
          : String(
              value.oxygenSaturationPercent,
            ),
      bloodGlucoseMgDl:
        value.bloodGlucoseMgDl == null
          ? null
          : String(
              value.bloodGlucoseMgDl,
            ),
      painScore:
        value.painScore as number | null,
      weightKg:
        value.weightKg == null
          ? null
          : String(
              value.weightKg,
            ),
      heightCm:
        value.heightCm == null
          ? null
          : String(
              value.heightCm,
            ),
      bmi:
        value.bmi == null
          ? null
          : String(
              value.bmi,
            ),
      oxygenDeliveryMethod:
        value.oxygenDeliveryMethod == null
          ? null
          : String(
              value.oxygenDeliveryMethod,
            ),
      oxygenFlowLitresPerMinute:
        value.oxygenFlowLitresPerMinute == null
          ? null
          : String(
              value.oxygenFlowLitresPerMinute,
            ),
      status:
        value.status as NursingVitalMutationResult['status'],
      supersedesVitalSignId:
        value.supersedesVitalSignId == null
          ? null
          : String(
              value.supersedesVitalSignId,
            ),
      supersededByVitalSignId:
        value.supersededByVitalSignId == null
          ? null
          : String(
              value.supersededByVitalSignId,
            ),
      version:
        Number(
          value.version,
        ),
    };
  }

  public async record(
    input: Parameters<NursingVitalSignIntegrationPort['record']>[0],
  ): Promise<NursingVitalMutationResult> {
    const encounterId =
      await this.encounterId(
        input.actor,
        input.measurement.admissionId,
      );

    const result =
      await this.clinicalEmr.workflows.recordVitalSigns.execute({
        actor:
          this.actor(
            input.actor,
          ),
        idempotencyKey:
          input.idempotencyKey,
        input: {
          ...input.measurement,
          encounterId,
          sourceClinicalNoteId:
            null,
          admissionId:
            undefined,
          backdatedEntryReason:
            undefined,
        },
      } as never);

    return this.result(
      input.actor,
      result as unknown as Record<string, unknown>,
    );
  }

  public async correct(
    input: Parameters<NursingVitalSignIntegrationPort['correct']>[0],
  ): Promise<NursingVitalMutationResult> {
    const result =
      await this.clinicalEmr.workflows.correctVitalSigns.execute({
        actor:
          this.actor(
            input.actor,
          ),
        idempotencyKey:
          input.idempotencyKey,
        entityId:
          input.vitalSignId,
        input: {
          ...input.measurement,
          admissionId:
            undefined,
          backdatedEntryReason:
            undefined,
          sourceClinicalNoteId:
            null,
        },
      } as never);

    return this.result(
      input.actor,
      result as unknown as Record<string, unknown>,
    );
  }

  public async enterInError(
    input: Parameters<NursingVitalSignIntegrationPort['enterInError']>[0],
  ): Promise<NursingVitalMutationResult> {
    const result =
      await this.clinicalEmr.workflows.enterVitalSignsInError.execute({
        actor:
          this.actor(
            input.actor,
          ),
        idempotencyKey:
          input.idempotencyKey,
        entityId:
          input.vitalSignId,
        input:
          input.change,
      } as never);

    return this.result(
      input.actor,
      result as unknown as Record<string, unknown>,
    );
  }
}

type RecoveryTransaction = Record<string, unknown> & {
  transactionId: string;
  transactionType: string;
  idempotencyKey: string;
  facilityId: unknown;
  clinicalEmrRecoveryMode?: string;
  clinicalEmrResultSnapshot?: unknown;
  clinicalEmrIdempotencyOwnerId?: string;
  clinicalEmrCompensations?: Array<{
    key: string;
    type: string;
    payload: Record<string, unknown>;
    status: string;
  }>;
};

export class NursingMedicationRecoveryService {
  public constructor(
    private readonly database:
      Db,
    private readonly compensationExecutor:
      NursingMedicationCompensationExecutor,
    private readonly idempotency:
      ReturnType<
        typeof createOperationalInfrastructure
      >['idempotency'],
    private readonly outbox:
      ReturnType<
        typeof createOperationalInfrastructure
      >['outbox'],
  ) {}

  public async markStaleTransactions(
    staleBefore:
      Date,
  ): Promise<number> {
    const collection =
      this.database.collection(
        'applicationTransactions',
      );

    const common = {
      transactionType: {
        $in:
          nursingTransactionTypes,
      },
      status: {
        $in: [
          'PENDING',
          'IN_PROGRESS',
          'COMPENSATING',
        ],
      },
      updatedAt: {
        $lt:
          staleBefore,
      },
    };

    const incomplete =
      await collection.updateMany(
        {
          ...common,
          clinicalEmrDomainCompletedAt: {
            $exists:
              false,
          },
        },
        {
          $set: {
            status:
              'RECOVERY_REQUIRED',
            recoveryStatus:
              'PENDING',
            clinicalEmrRecoveryMode:
              'COMPENSATE',
          },
          $inc: {
            retryCount:
              1,
            version:
              1,
          },
          $currentDate: {
            updatedAt:
              true,
          },
        },
      );

    const completed =
      await collection.updateMany(
        {
          ...common,
          clinicalEmrDomainCompletedAt: {
            $type:
              'date',
          },
        },
        {
          $set: {
            status:
              'RECOVERY_REQUIRED',
            recoveryStatus:
              'PENDING',
            clinicalEmrRecoveryMode:
              'FINALIZE_COMPLETED',
          },
          $inc: {
            retryCount:
              1,
            version:
              1,
          },
          $currentDate: {
            updatedAt:
              true,
          },
        },
      );

    return incomplete.modifiedCount +
      completed.modifiedCount;
  }

  public async recoverAvailable(
    input: Readonly<{
      workerId: string;
      maxTransactions: number;
      now: Date;
    }>,
  ): Promise<{
    recovered: number;
    failed: number;
  }> {
    let recovered =
      0;
    let failed =
      0;

    const maximum =
      Math.max(
        1,
        Math.min(
          input.maxTransactions,
          100,
        ),
      );

    for (
      let index = 0;
      index < maximum;
      index += 1
    ) {
      const leaseToken =
        randomUUID();

      const transaction =
        await this.database.collection<RecoveryTransaction>(
          'applicationTransactions',
        ).findOneAndUpdate(
          {
            transactionType: {
              $in:
                nursingTransactionTypes,
            },
            status:
              'RECOVERY_REQUIRED',
            recoveryStatus: {
              $in: [
                'PENDING',
                'FAILED',
              ],
            },
            $or: [
              {
                clinicalEmrRecoveryLeaseExpiresAt: {
                  $exists:
                    false,
                },
              },
              {
                clinicalEmrRecoveryLeaseExpiresAt: {
                  $lte:
                    input.now,
                },
              },
            ],
          },
          {
            $set: {
              recoveryStatus:
                'IN_PROGRESS',
              clinicalEmrRecoveryLeaseOwner:
                input.workerId,
              clinicalEmrRecoveryLeaseToken:
                leaseToken,
              clinicalEmrRecoveryLeaseExpiresAt:
                new Date(
                  input.now.getTime() +
                  60_000,
                ),
            },
            $inc: {
              version:
                1,
            },
            $currentDate: {
              updatedAt:
                true,
            },
          },
          {
            returnDocument:
              'after',
          },
        );

      if (
        transaction === null
      ) {
        break;
      }

      try {
        await this.recoverTransaction(
          transaction,
        );
        recovered +=
          1;
      } catch (
        error
      ) {
        failed +=
          1;

        await this.database.collection(
          'applicationTransactions',
        ).updateOne(
          {
            transactionId:
              transaction.transactionId,
          },
          {
            $set: {
              recoveryStatus:
                'FAILED',
              errorDetails: {
                message:
                  error instanceof Error
                    ? error.message.slice(
                        0,
                        1_500,
                      )
                    : 'Unknown nursing medication recovery error',
              },
            },
            $inc: {
              retryCount:
                1,
              version:
                1,
            },
            $currentDate: {
              updatedAt:
                true,
            },
          },
        );
      }
    }

    return {
      recovered,
      failed,
    };
  }

  private async recoverTransaction(
    transaction:
      RecoveryTransaction,
  ): Promise<void> {
    const facilityId =
      String(
        transaction.facilityId,
      );

    if (
      transaction.clinicalEmrRecoveryMode ===
      'FINALIZE_COMPLETED'
    ) {
      if (
        transaction.clinicalEmrResultSnapshot == null ||
        transaction.clinicalEmrIdempotencyOwnerId == null
      ) {
        throw new Error(
          'Completed nursing transaction is missing its durable result or idempotency owner',
        );
      }

      await this.idempotency.complete({
        facilityId,
        scope:
          transaction.transactionType,
        key:
          transaction.idempotencyKey,
        ownerId:
          transaction.clinicalEmrIdempotencyOwnerId,
        response:
          transaction.clinicalEmrResultSnapshot as never,
      });

      await this.outbox.releaseTransactionEvents(
        transaction.transactionId,
      );
    } else {
      for (
        const compensation of
        [
          ...(transaction.clinicalEmrCompensations ?? []),
        ].reverse()
      ) {
        if (
          compensation.status ===
          'COMPENSATED'
        ) {
          continue;
        }

        await this.compensationExecutor.execute({
          key:
            compensation.key,
          type:
            compensation.type,
          payload:
            compensation.payload,
        });
      }

      if (
        transaction.clinicalEmrIdempotencyOwnerId != null
      ) {
        await this.idempotency.fail({
          facilityId,
          scope:
            transaction.transactionType,
          key:
            transaction.idempotencyKey,
          ownerId:
            transaction.clinicalEmrIdempotencyOwnerId,
          error: {
            code:
              'NURSING_MEDICATION_TRANSACTION_COMPENSATED',
          },
        });
      }
    }

    await this.database.collection(
      'applicationTransactions',
    ).updateOne(
      {
        transactionId:
          transaction.transactionId,
      },
      {
        $set: {
          status:
            transaction.clinicalEmrRecoveryMode ===
            'FINALIZE_COMPLETED'
              ? 'COMPLETED'
              : 'COMPENSATED',
          recoveryStatus:
            'COMPLETED',
        },
        $unset: {
          clinicalEmrRecoveryLeaseOwner:
            '',
          clinicalEmrRecoveryLeaseToken:
            '',
          clinicalEmrRecoveryLeaseExpiresAt:
            '',
        },
        $inc: {
          version:
            1,
        },
        $currentDate: {
          updatedAt:
            true,
        },
      },
    );
  }
}

export interface CreateNursingMedicationInfrastructureOptions {
  database: Db;
  auditRepository: AuditRepository;
  operationalInfrastructure:
    ReturnType<
      typeof createOperationalInfrastructure
    >;
  snapshotCrypto:
    ClinicalEmrSnapshotCryptoPort;
  clinicalEmrApplication:
    ClinicalEmrApplication;
  publishRealtime(
    message:
      NursingMedicationRealtimeMessage,
  ): Promise<void>;
}

export function createNursingMedicationInfrastructure(
  options:
    CreateNursingMedicationInfrastructureOptions,
) {
  const snapshotCrypto =
    new NursingMedicationSnapshotCryptoAdapter(
      options.snapshotCrypto,
    );

  const compensationExecutor =
    new NursingMedicationCompensationExecutor(
      options.database,
      options.snapshotCrypto,
    );

  const transactionManager =
    new MongoClinicalEmrTransactionManagerAdapter({
      database:
        options.database,
      transactions:
        options.operationalInfrastructure.transactionRepository,
      idempotency:
        options.operationalInfrastructure.idempotency,
      locks:
        options.operationalInfrastructure.locks,
      outbox:
        options.operationalInfrastructure.outbox,
      compensationExecutor,
      snapshotCrypto:
        options.snapshotCrypto,
    });

  const dependencies: NursingMedicationCommandDependencies = {
    transactionManager:
      transactionManager as never,
    audit:
      new NursingMedicationAuditAdapter(
        options.auditRepository,
      ),
    outbox:
      new NursingMedicationOutboxAdapter(
        options.database,
      ),
    realtime: {
      publish:
        options.publishRealtime,
    },
    clock: {
      now() {
        return new Date();
      },
    },
    sequence:
      new NursingMedicationSequenceAdapter(
        options.operationalInfrastructure.sequences,
      ),
    snapshotCrypto,
  };

  const application =
    createNursingMedicationApplication({
      dependencies,
      vitalCommands:
        new ClinicalEmrVitalSignIntegrationAdapter(
          options.clinicalEmrApplication,
        ),
    });

  const recovery =
    new NursingMedicationRecoveryService(
      options.database,
      compensationExecutor,
      options.operationalInfrastructure.idempotency,
      options.operationalInfrastructure.outbox,
    );

  return {
    application,
    dependencies,
    transactionManager,
    compensationExecutor,
    recovery,
  };
}