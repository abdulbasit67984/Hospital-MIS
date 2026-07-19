import type {
  Db,
} from '@hospital-mis/database';

import {
  toObjectId,
} from '@hospital-mis/database';

import {
  ConflictError,
} from '@hospital-mis/shared';

import {
  Types,
} from 'mongoose';

import type {
  FormularyPrescriptionEncryptedSnapshot,
  FormularyPrescriptionSnapshotCryptoPort,
  FormularyPrescriptionTransactionCompensation,
} from '../modules/formulary-prescriptions/formulary-prescriptions.ports.js';

import {
  FORMULARY_PRESCRIPTION_COMPENSATABLE_COLLECTIONS,
  FORMULARY_PRESCRIPTION_COMPENSATION_TYPES,
  type FormularyPrescriptionCompensatableCollection,
} from '../modules/formulary-prescriptions/formulary-prescriptions.transaction.constants.js';

export interface FormularyPrescriptionCompensationExecutorPort {
  execute(
    compensation:
      FormularyPrescriptionTransactionCompensation,
  ): Promise<void>;

  cleanupTransactionArtifacts(
    transactionId:
      string,
  ): Promise<void>;
}

type JsonObject =
  Record<string, unknown>;

type RestoreSnapshot = {
  version:
    number;

  updatedBy:
    string;

  updatedAt:
    string;

  values:
    Record<string, unknown>;
};

const mutableFields: Readonly<
  Record<
    string,
    ReadonlySet<string>
  >
> = {
  formularyItems:
    new Set([
      'brandName',
      'normalizedBrandName',
      'allowedRouteIds',
      'defaultRouteId',
      'inventoryItemId',
      'stockTracked',
      'restrictionType',
      'restrictedDepartmentIds',
      'minimumAgeYears',
      'maximumAgeYears',
      'highAlert',
      'controlledMedicine',
      'prescribingNotes',
      'searchText',
      'activeSelectionKey',
      'effectiveFrom',
      'effectiveUntil',
      'status',
      'deactivatedAt',
      'deactivatedBy',
      'deactivationReason',
    ]),

  prescriptions:
    new Set([
      'status',
      'supersededByPrescriptionId',
      'issuedAt',
      'expiresAt',
      'signedBy',
      'signatureMethod',
      'signatureDigest',
      'lockedAt',
      'lockedBy',
      'issuedSnapshotHash',
      'cancelledAt',
      'cancelledBy',
      'cancellationReason',
      'interactionCheckStatus',
      'interactionCheckProvider',
      'interactionCheckedAt',
      'itemCount',
      'activeItemCount',
      'dispensedItemCount',
      'safetyWarningCount',
      'unresolvedBlockingWarningCount',
      'printRevision',
      'lastPrintedAt',
      'lastPrintedBy',
    ]),

  prescriptionSafetyWarnings:
    new Set([
      'status',
      'acknowledgedAt',
      'acknowledgedBy',
      'acknowledgementReason',
      'overriddenAt',
      'overriddenBy',
      'overrideReason',
      'resolvedAt',
      'resolvedBy',
      'resolutionReason',
    ]),
};

const objectIdFields =
  new Set([
    'defaultRouteId',
    'inventoryItemId',
    'deactivatedBy',
    'supersededByPrescriptionId',
    'signedBy',
    'lockedBy',
    'cancelledBy',
    'lastPrintedBy',
    'acknowledgedBy',
    'overriddenBy',
    'resolvedBy',
  ]);

const objectIdArrayFields =
  new Set([
    'allowedRouteIds',
    'restrictedDepartmentIds',
  ]);

const dateFields =
  new Set([
    'effectiveFrom',
    'effectiveUntil',
    'deactivatedAt',
    'issuedAt',
    'expiresAt',
    'lockedAt',
    'cancelledAt',
    'interactionCheckedAt',
    'lastPrintedAt',
    'acknowledgedAt',
    'overriddenAt',
    'resolvedAt',
  ]);

const prescriptionItemObjectIdFields =
  new Set([
    '_id',
    'facilityId',
    'prescriptionId',
    'patientId',
    'encounterId',
    'formularyItemId',
    'medicineId',
    'medicineFormId',
    'medicineStrengthId',
    'doseUnitId',
    'routeId',
    'frequencyId',
    'quantityUnitId',
    'cancelledBy',
    'lastDispensationId',
    'createdBy',
    'updatedBy',
  ]);

const prescriptionItemDateFields =
  new Set([
    'cancelledAt',
    'lastDispensedAt',
    'createdAt',
    'updatedAt',
  ]);

const prescriptionItemDecimalFields =
  new Set([
    'dose',
    'durationValue',
    'quantity',
    'dispensedQuantity',
  ]);

function asObject(
  value:
    unknown,

  fieldName:
    string,
): JsonObject {
  if (
    typeof value !==
      'object' ||
    value ===
      null ||
    Array.isArray(
      value,
    )
  ) {
    throw new TypeError(
      `${fieldName} must be an object`,
    );
  }

  return value as
    JsonObject;
}

function requiredString(
  object:
    JsonObject,

  fieldName:
    string,
): string {
  const value =
    object[
      fieldName
    ];

  if (
    typeof value !==
      'string' ||
    value.trim().length ===
      0
  ) {
    throw new TypeError(
      `${fieldName} must be a non-empty string`,
    );
  }

  return value;
}

function requiredInteger(
  object:
    JsonObject,

  fieldName:
    string,
): number {
  const value =
    object[
      fieldName
    ];

  if (
    typeof value !==
      'number' ||
    !Number.isSafeInteger(
      value,
    ) ||
    value <
      0
  ) {
    throw new TypeError(
      `${fieldName} must be a non-negative safe integer`,
    );
  }

  return value;
}

function supportedCollection(
  value:
    unknown,
): FormularyPrescriptionCompensatableCollection {
  if (
    typeof value !==
      'string' ||
    !FORMULARY_PRESCRIPTION_COMPENSATABLE_COLLECTIONS.includes(
      value as
        FormularyPrescriptionCompensatableCollection,
    )
  ) {
    throw new TypeError(
      'collection must be a supported formulary and prescription collection',
    );
  }

  return value as
    FormularyPrescriptionCompensatableCollection;
}

function encryptedSnapshot(
  value:
    unknown,
): FormularyPrescriptionEncryptedSnapshot {
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
    algorithm !==
    'AES-256-GCM'
  ) {
    throw new TypeError(
      'encryptedSnapshot.algorithm is unsupported',
    );
  }

  return {
    algorithm,

    keyVersion:
      requiredString(
        object,
        'keyVersion',
      ),

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

function parseDate(
  value:
    unknown,

  fieldName:
    string,
): Date {
  if (
    typeof value !==
    'string'
  ) {
    throw new TypeError(
      `${fieldName} must be an ISO date-time string`,
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
      `${fieldName} must contain a valid ISO date-time`,
    );
  }

  return parsed;
}

function convertRestoreValue(
  field:
    string,

  value:
    unknown,
): unknown {
  if (
    value ===
    null
  ) {
    return null;
  }

  if (
    objectIdFields.has(
      field,
    )
  ) {
    if (
      typeof value !==
      'string'
    ) {
      throw new TypeError(
        `${field} must be an ObjectId string or null`,
      );
    }

    return toObjectId(
      value,
      field,
    );
  }

  if (
    objectIdArrayFields.has(
      field,
    )
  ) {
    if (
      !Array.isArray(
        value,
      )
    ) {
      throw new TypeError(
        `${field} must be an array`,
      );
    }

    return value.map(
      (
        item,
        index,
      ) => {
        if (
          typeof item !==
          'string'
        ) {
          throw new TypeError(
            `${field}.${index} must be an ObjectId string`,
          );
        }

        return toObjectId(
          item,
          `${field}.${index}`,
        );
      },
    );
  }

  if (
    dateFields.has(
      field,
    )
  ) {
    return parseDate(
      value,
      field,
    );
  }

  return value;
}

function transactionIdFromAssociatedData(
  associatedData:
    string,
): string {
  const transactionId =
    associatedData
      .split(':')
      .at(-1)
      ?.trim();

  if (
    transactionId ===
      undefined ||
    transactionId.length ===
      0
  ) {
    throw new TypeError(
      'Compensation associatedData does not contain a transaction identifier',
    );
  }

  return transactionId;
}

function restorePrescriptionItem(
  value:
    unknown,

  index:
    number,
): Record<string, unknown> {
  const object =
    asObject(
      value,
      `items.${index}`,
    );

  const restored:
    Record<string, unknown> = {};

  for (
    const [
      field,
      fieldValue,
    ] of Object.entries(
      object,
    )
  ) {
    if (
      fieldValue ===
      null
    ) {
      restored[
        field
      ] = null;

      continue;
    }

    if (
      prescriptionItemObjectIdFields.has(
        field,
      )
    ) {
      if (
        typeof fieldValue !==
        'string'
      ) {
        throw new TypeError(
          `items.${index}.${field} must be an ObjectId string`,
        );
      }

      restored[
        field
      ] =
        toObjectId(
          fieldValue,
          `items.${index}.${field}`,
        );

      continue;
    }

    if (
      prescriptionItemDateFields.has(
        field,
      )
    ) {
      restored[
        field
      ] =
        parseDate(
          fieldValue,
          `items.${index}.${field}`,
        );

      continue;
    }

    if (
      prescriptionItemDecimalFields.has(
        field,
      )
    ) {
      if (
        typeof fieldValue !==
        'string'
      ) {
        throw new TypeError(
          `items.${index}.${field} must be a decimal string`,
        );
      }

      restored[
        field
      ] =
        Types.Decimal128.fromString(
          fieldValue,
        );

      continue;
    }

    restored[
      field
    ] =
      fieldValue;
  }

  return restored;
}

export class FormularyPrescriptionCompensationExecutor
implements FormularyPrescriptionCompensationExecutorPort {
  public constructor(
    private readonly database:
      Db,

    private readonly crypto:
      FormularyPrescriptionSnapshotCryptoPort,
  ) {}

  public async execute(
    compensation:
      FormularyPrescriptionTransactionCompensation,
  ): Promise<void> {
    switch (
      compensation.type
    ) {
      case FORMULARY_PRESCRIPTION_COMPENSATION_TYPES.DELETE_CREATED_RECORD:
        await this.deleteCreatedRecord(
          compensation.payload,
        );
        return;

      case FORMULARY_PRESCRIPTION_COMPENSATION_TYPES.RESTORE_ENCRYPTED_RECORD:
        await this.restoreEncryptedRecord(
          compensation.payload,
        );
        return;

      case FORMULARY_PRESCRIPTION_COMPENSATION_TYPES.RESTORE_ENCRYPTED_RECORD_SET:
        await this.restoreEncryptedRecordSet(
          compensation.payload,
        );
        return;

      default:
        throw new Error(
          `Unsupported formulary and prescription compensation type: ${compensation.type}`,
        );
    }
  }

  public async cleanupTransactionArtifacts(
    transactionId:
      string,
  ): Promise<void> {
    await Promise.all([
      this.database
        .collection(
          'prescriptionStatusHistories',
        )
        .deleteMany({
          transactionId,
        }),

      this.database
        .collection(
          'prescriptionSafetyWarnings',
        )
        .deleteMany({
          transactionId,
        }),

      this.database
        .collection(
          'outboxEvents',
        )
        .updateMany(
          {
            transactionId,

            status:
              'BLOCKED',
          },
          {
            $set: {
              status:
                'DEAD_LETTER',

              lastError: {
                code:
                  'TRANSACTION_COMPENSATED',

                message:
                  'The formulary and prescription transaction was compensated',
              },
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
        ),
    ]);
  }

  private async deleteCreatedRecord(
    payload:
      Record<string, unknown>,
  ): Promise<void> {
    const object =
      asObject(
        payload,
        'payload',
      );

    const collectionName =
      supportedCollection(
        object[
          'collection'
        ],
      );

    const entityId =
      requiredString(
        object,
        'entityId',
      );

    const expectedVersion =
      requiredInteger(
        object,
        'expectedVersion',
      );

    const transactionId =
      requiredString(
        object,
        'transactionId',
      );

    const collection =
      this.database
        .collection(
          collectionName,
        );

    const result =
      await collection.deleteOne({
        _id:
          toObjectId(
            entityId,
            'entityId',
          ),

        version:
          expectedVersion,

        transactionId,
      });

    if (
      result.deletedCount ===
      1
    ) {
      if (
        collectionName ===
        'prescriptions'
      ) {
        const prescriptionId =
          toObjectId(
            entityId,
            'prescriptionId',
          );

        await Promise.all([
          this.database
            .collection(
              'prescriptionItems',
            )
            .deleteMany({
              prescriptionId,
              transactionId,
            }),

          this.database
            .collection(
              'prescriptionSafetyWarnings',
            )
            .deleteMany({
              prescriptionId,
              transactionId,
            }),

          this.database
            .collection(
              'prescriptionStatusHistories',
            )
            .deleteMany({
              prescriptionId,
              transactionId,
            }),
        ]);
      }

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
      existing ===
      null
    ) {
      return;
    }

    throw new ConflictError(
      `Created ${collectionName} record changed before compensation`,
    );
  }

  private async restoreEncryptedRecord(
    payload:
      Record<string, unknown>,
  ): Promise<void> {
    const object =
      asObject(
        payload,
        'payload',
      );

    const collectionName =
      supportedCollection(
        object[
          'collection'
        ],
      );

    const allowed =
      mutableFields[
        collectionName
      ];

    if (
      allowed ===
      undefined
    ) {
      throw new TypeError(
        `${collectionName} does not support mutable-record restoration`,
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
        object[
          'encryptedSnapshot'
        ],
      );

    const snapshot =
      this.crypto
        .unprotect<RestoreSnapshot>(
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
        'Formulary and prescription compensation snapshot integrity validation failed',
      );
    }

    if (
      !Number.isSafeInteger(
        snapshot.version,
      ) ||
      snapshot.version <
        0 ||
      typeof snapshot.updatedBy !==
        'string' ||
      typeof snapshot.updatedAt !==
        'string' ||
      typeof snapshot.values !==
        'object' ||
      snapshot.values ===
        null ||
      Array.isArray(
        snapshot.values,
      )
    ) {
      throw new TypeError(
        'Formulary and prescription restore snapshot is malformed',
      );
    }

    const updateValues:
      Record<string, unknown> = {};

    for (
      const [
        field,
        value,
      ] of Object.entries(
        snapshot.values,
      )
    ) {
      if (
        !allowed.has(
          field,
        )
      ) {
        throw new TypeError(
          `${field} is not an allowed ${collectionName} compensation field`,
        );
      }

      updateValues[
        field
      ] =
        convertRestoreValue(
          field,
          value,
        );
    }

    const updatedAt =
      parseDate(
        snapshot.updatedAt,
        'updatedAt',
      );

    const result =
      await this.database
        .collection(
          collectionName,
        )
        .updateOne(
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
              ...updateValues,

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
      result.matchedCount ===
      1
    ) {
      return;
    }

    const alreadyRestored =
      await this.database
        .collection(
          collectionName,
        )
        .findOne({
          _id:
            toObjectId(
              entityId,
              'entityId',
            ),

          version:
            snapshot.version,
        });

    if (
      alreadyRestored !==
      null
    ) {
      return;
    }

    throw new ConflictError(
      `${collectionName} changed before encrypted compensation could restore it`,
    );
  }

  private async restoreEncryptedRecordSet(
    payload:
      Record<string, unknown>,
  ): Promise<void> {
    const object =
      asObject(
        payload,
        'payload',
      );

    const collectionName =
      supportedCollection(
        object[
          'collection'
        ],
      );

    if (
      collectionName !==
      'prescriptionItems'
    ) {
      throw new TypeError(
        'Only prescriptionItems support encrypted record-set restoration',
      );
    }

    const parentField =
      requiredString(
        object,
        'parentField',
      );

    if (
      parentField !==
      'prescriptionId'
    ) {
      throw new TypeError(
        'Prescription-item restoration requires parentField prescriptionId',
      );
    }

    const parentId =
      requiredString(
        object,
        'parentId',
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
        object[
          'encryptedSnapshot'
        ],
      );

    const rawItems =
      this.crypto
        .unprotect<unknown>(
          encrypted,
          associatedData,
        );

    if (
      !this.crypto.matchesHash(
        rawItems,
        associatedData,
        snapshotHash,
      )
    ) {
      throw new ConflictError(
        'Prescription-item compensation snapshot integrity validation failed',
      );
    }

    if (
      !Array.isArray(
        rawItems,
      )
    ) {
      throw new TypeError(
        'Prescription-item compensation snapshot must contain an array',
      );
    }

    const transactionId =
      transactionIdFromAssociatedData(
        associatedData,
      );

    const prescriptionId =
      toObjectId(
        parentId,
        'parentId',
      );

    const currentItems =
      await this.database
        .collection(
          'prescriptionItems',
        )
        .find({
          prescriptionId,
        })
        .project({
          transactionId:
            1,
        })
        .toArray();

    if (
      currentItems.some(
        (item) =>
          item[
            'transactionId'
          ] !==
          transactionId,
      )
    ) {
      throw new ConflictError(
        'Prescription items changed after the failed transaction and cannot be safely restored',
      );
    }

    await this.database
      .collection(
        'prescriptionItems',
      )
      .deleteMany({
        prescriptionId,

        transactionId,
      });

    const restoredItems =
      rawItems.map(
        (
          item,
          index,
        ) =>
          restorePrescriptionItem(
            item,
            index,
          ),
      );

    if (
      restoredItems.length ===
      0
    ) {
      return;
    }

    try {
      await this.database
        .collection(
          'prescriptionItems',
        )
        .insertMany(
          restoredItems,
          {
            ordered:
              true,
          },
        );
    } catch (error) {
      const restoredIds =
        restoredItems.map(
          (item) =>
            item[
              '_id'
            ],
        );

      const restoredCount =
        await this.database
          .collection(
            'prescriptionItems',
          )
          .countDocuments({
            _id: {
              $in:
                restoredIds,
            },
          });

      if (
        restoredCount !==
        restoredItems.length
      ) {
        throw error;
      }
    }
  }
}