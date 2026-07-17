import {
  nativeDatabase,
  toObjectId,
} from '@hospital-mis/database';

import {
  ConflictError,
} from '@hospital-mis/shared';

import type {
  PatientEncryptedSnapshot,
  PatientSensitiveSnapshotCryptoPort,
  PatientTransactionCompensation,
} from '../modules/patient/patient.ports.js';

import {
  PATIENT_COMPENSATION_TYPES,
} from '../modules/patient/patient.transaction.constants.js';

import type {
  GuardianRestoreSnapshot,
  PatientAddressRestoreSnapshot,
  PatientAlertRestoreSnapshot,
  PatientContactRestoreSnapshot,
  PatientGuardianRestoreSnapshot,
  PatientIdentifierRestoreSnapshot,
  PatientRestoreSnapshot,
} from '../modules/patient/patient.mutation.workflow-helpers.js';

type JsonObject =
  Record<string, unknown>;

export interface PatientCompensationExecutorPort {
  execute(
    compensation: PatientTransactionCompensation,
  ): Promise<void>;
}

function asObject(
  value: unknown,
  fieldName: string,
): JsonObject {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(
      `${fieldName} must be an object`,
    );
  }

  return value as JsonObject;
}

function asString(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== 'string' ||
    value.length === 0
  ) {
    throw new Error(
      `${fieldName} must be a non-empty string`,
    );
  }

  return value;
}

function asNumber(
  value: unknown,
  fieldName: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `${fieldName} must be a non-negative safe integer`,
    );
  }

  return value;
}

function asDate(
  value: string,
  fieldName: string,
): Date {
  const parsed =
    new Date(value);

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    throw new Error(
      `${fieldName} must be a valid ISO date`,
    );
  }

  return parsed;
}

function nullableDate(
  value: string | null,
  fieldName: string,
): Date | null {
  return value === null
    ? null
    : asDate(
        value,
        fieldName,
      );
}

function nullableObjectId(
  value: string | null,
  fieldName: string,
) {
  return value === null
    ? null
    : toObjectId(
        value,
        fieldName,
      );
}

function encryptedSnapshot(
  value: unknown,
): PatientEncryptedSnapshot {
  const record =
    asObject(
      value,
      'encryptedSnapshot',
    );

  if (
    record['algorithm'] !==
    'AES-256-GCM'
  ) {
    throw new Error(
      'encryptedSnapshot.algorithm is invalid',
    );
  }

  return {
    algorithm:
      'AES-256-GCM',

    keyVersion:
      asString(
        record['keyVersion'],
        'encryptedSnapshot.keyVersion',
      ),

    initializationVector:
      asString(
        record['initializationVector'],
        'encryptedSnapshot.initializationVector',
      ),

    authenticationTag:
      asString(
        record['authenticationTag'],
        'encryptedSnapshot.authenticationTag',
      ),

    ciphertext:
      asString(
        record['ciphertext'],
        'encryptedSnapshot.ciphertext',
      ),
  };
}

interface RestorePayload<T> {
  entityId: string;
  expectedPostVersion: number;
  snapshot: T;
}

export class PatientCompensationExecutor
implements PatientCompensationExecutorPort {
  public constructor(
    private readonly snapshotCrypto?:
      PatientSensitiveSnapshotCryptoPort,
  ) {}

  public async execute(
    compensation: PatientTransactionCompensation,
  ): Promise<void> {
    switch (compensation.type) {
      case PATIENT_COMPENSATION_TYPES
        .DELETE_CREATED_PATIENT:
        await this.deleteCreatedPatient(
          compensation.payload,
        );
        return;

      case PATIENT_COMPENSATION_TYPES
        .DELETE_CREATED_PATIENT_IDENTIFIER:
        await this.deleteVersioned(
          'patientIdentifiers',
          'Created patient identifier',
          compensation.payload,
        );
        return;

      case PATIENT_COMPENSATION_TYPES
        .DELETE_CREATED_GUARDIAN:
        await this.deleteCreatedGuardian(
          compensation.payload,
        );
        return;

      case PATIENT_COMPENSATION_TYPES
        .DELETE_CREATED_PATIENT_GUARDIAN:
        await this.deleteVersioned(
          'patientGuardians',
          'Created patient guardian relationship',
          compensation.payload,
        );
        return;

      case PATIENT_COMPENSATION_TYPES
        .DELETE_CREATED_PATIENT_CONTACT:
        await this.deleteVersioned(
          'patientContacts',
          'Created patient contact',
          compensation.payload,
        );
        return;

      case PATIENT_COMPENSATION_TYPES
        .DELETE_CREATED_PATIENT_ADDRESS:
        await this.deleteVersioned(
          'patientAddresses',
          'Created patient address',
          compensation.payload,
        );
        return;

      case PATIENT_COMPENSATION_TYPES
        .DELETE_CREATED_PATIENT_ALERT:
        await this.deleteVersioned(
          'patientAlerts',
          'Created patient alert',
          compensation.payload,
        );
        return;

      case PATIENT_COMPENSATION_TYPES
        .RESTORE_PATIENT:
        await this.restoreVersioned<
          PatientRestoreSnapshot
        >(
          'patients',
          'Patient',
          compensation.payload,
          patientDocument,
        );
        return;

      case PATIENT_COMPENSATION_TYPES
        .RESTORE_GUARDIAN:
        await this.restoreVersioned<
          GuardianRestoreSnapshot
        >(
          'guardians',
          'Guardian',
          compensation.payload,
          guardianDocument,
        );
        return;

      case PATIENT_COMPENSATION_TYPES
        .RESTORE_PATIENT_IDENTIFIER:
        await this.restoreVersioned<
          PatientIdentifierRestoreSnapshot
        >(
          'patientIdentifiers',
          'Patient identifier',
          compensation.payload,
          patientIdentifierDocument,
        );
        return;

      case PATIENT_COMPENSATION_TYPES
        .RESTORE_PATIENT_GUARDIAN:
        await this.restoreVersioned<
          PatientGuardianRestoreSnapshot
        >(
          'patientGuardians',
          'Patient guardian relationship',
          compensation.payload,
          patientGuardianDocument,
        );
        return;

      case PATIENT_COMPENSATION_TYPES
        .RESTORE_PATIENT_CONTACT:
        await this.restoreVersioned<
          PatientContactRestoreSnapshot
        >(
          'patientContacts',
          'Patient contact',
          compensation.payload,
          patientContactDocument,
        );
        return;

      case PATIENT_COMPENSATION_TYPES
        .RESTORE_PATIENT_ADDRESS:
        await this.restoreVersioned<
          PatientAddressRestoreSnapshot
        >(
          'patientAddresses',
          'Patient address',
          compensation.payload,
          patientAddressDocument,
        );
        return;

      case PATIENT_COMPENSATION_TYPES
        .RESTORE_PATIENT_ALERT:
        await this.restoreVersioned<
          PatientAlertRestoreSnapshot
        >(
          'patientAlerts',
          'Patient alert',
          compensation.payload,
          patientAlertDocument,
        );
        return;

      default:
        throw new Error(
          `Unsupported patient compensation type: ${compensation.type}`,
        );
    }
  }

  private requireSnapshotCrypto():
    PatientSensitiveSnapshotCryptoPort {
    if (
      this.snapshotCrypto ===
      undefined
    ) {
      throw new Error(
        'Patient compensation snapshot encryption is not configured',
      );
    }

    return this.snapshotCrypto;
  }

  private restorePayload<T>(
    payload: JsonObject,
  ): RestorePayload<T> {
    const entityId =
      asString(
        payload['entityId'],
        'entityId',
      );

    const expectedPostVersion =
      asNumber(
        payload['expectedPostVersion'],
        'expectedPostVersion',
      );

    const associatedData =
      asString(
        payload['associatedData'],
        'associatedData',
      );

    const snapshotHash =
      asString(
        payload['snapshotHash'],
        'snapshotHash',
      );

    const crypto =
      this.requireSnapshotCrypto();

    const snapshot =
      crypto.unprotect<T>(
        encryptedSnapshot(
          payload['encryptedSnapshot'],
        ),
        associatedData,
      );

    if (
      !crypto.matchesHash(
        snapshot,
        associatedData,
        snapshotHash,
      )
    ) {
      throw new ConflictError(
        'Patient compensation snapshot integrity verification failed',
      );
    }

    return {
      entityId,
      expectedPostVersion,
      snapshot,
    };
  }

  private async restoreVersioned<T>(
    collectionName: string,
    entityName: string,
    payload: JsonObject,
    toDocument: (
      snapshot: T,
    ) => Record<string, unknown>,
  ): Promise<void> {
    const input =
      this.restorePayload<T>(
        payload,
      );

    const document =
      toDocument(
        input.snapshot,
      );

    const previousVersion =
      asNumber(
        document['version'],
        'snapshot.version',
      );

    const entityId =
      toObjectId(
        input.entityId,
        'entityId',
      );

    const collection =
      nativeDatabase()
        .collection(
          collectionName,
        );

    const result =
      await collection.updateOne(
        {
          _id:
            entityId,

          version:
            input.expectedPostVersion,
        },
        {
          $set:
            document,
        },
      );

    if (
      result.matchedCount === 1
    ) {
      return;
    }

    const current =
      await collection.findOne(
        {
          _id:
            entityId,
        },
        {
          projection: {
            version:
              1,
          },
        },
      );

    if (
      current?.['version'] ===
      previousVersion
    ) {
      return;
    }

    throw new ConflictError(
      `${entityName} changed before compensation could restore it`,
    );
  }

  private deletionPayload(
    payload: JsonObject,
  ): Readonly<{
    entityId: string;
    expectedVersion: number;
  }> {
    return {
      entityId:
        asString(
          payload['entityId'],
          'entityId',
        ),

      expectedVersion:
        asNumber(
          payload['expectedVersion'],
          'expectedVersion',
        ),
    };
  }

  private async deleteVersioned(
    collectionName: string,
    entityName: string,
    payload: JsonObject,
  ): Promise<void> {
    const input =
      this.deletionPayload(
        payload,
      );

    const entityId =
      toObjectId(
        input.entityId,
        'entityId',
      );

    const collection =
      nativeDatabase()
        .collection(
          collectionName,
        );

    const current =
      await collection.findOne(
        {
          _id:
            entityId,
        },
        {
          projection: {
            version:
              1,
          },
        },
      );

    if (current === null) {
      return;
    }

    if (
      current['version'] !==
      input.expectedVersion
    ) {
      throw new ConflictError(
        `${entityName} changed before compensation could remove it`,
      );
    }

    const deleted =
      await collection.deleteOne({
        _id:
          entityId,

        version:
          input.expectedVersion,
      });

    if (
      deleted.deletedCount !== 1
    ) {
      throw new ConflictError(
        `${entityName} could not be removed during compensation`,
      );
    }
  }

  private async deleteCreatedPatient(
    payload: JsonObject,
  ): Promise<void> {
    const input =
      this.deletionPayload(
        payload,
      );

    const patientId =
      toObjectId(
        input.entityId,
        'entityId',
      );

    const database =
      nativeDatabase();

    const dependentCollections = [
      'patientIdentifiers',
      'patientGuardians',
      'patientContacts',
      'patientAddresses',
      'patientAlerts',
    ] as const;

    for (
      const collectionName of
      dependentCollections
    ) {
      const dependent =
        await database
          .collection(
            collectionName,
          )
          .findOne(
            {
              patientId,
            },
            {
              projection: {
                _id:
                  1,
              },
            },
          );

      if (
        dependent !== null
      ) {
        throw new ConflictError(
          'Created patient still has dependent records during compensation',
        );
      }
    }

    await this.deleteVersioned(
      'patients',
      'Created patient',
      payload,
    );
  }

  private async deleteCreatedGuardian(
    payload: JsonObject,
  ): Promise<void> {
    const input =
      this.deletionPayload(
        payload,
      );

    const guardianId =
      toObjectId(
        input.entityId,
        'entityId',
      );

    const relationship =
      await nativeDatabase()
        .collection(
          'patientGuardians',
        )
        .findOne(
          {
            guardianId,
          },
          {
            projection: {
              _id:
                1,
            },
          },
        );

    if (
      relationship !== null
    ) {
      throw new ConflictError(
        'Created guardian still has patient relationships during compensation',
      );
    }

    await this.deleteVersioned(
      'guardians',
      'Created guardian',
      payload,
    );
  }
}

function patientDocument(
  snapshot: PatientRestoreSnapshot,
): Record<string, unknown> {
  return {
    firstName:
      snapshot.firstName,

    middleName:
      snapshot.middleName,

    lastName:
      snapshot.lastName,

    preferredName:
      snapshot.preferredName,

    displayName:
      snapshot.displayName,

    normalizedFullName:
      snapshot.normalizedFullName,

    nameSearchTokens:
      snapshot.nameSearchTokens,

    localizedNames:
      snapshot.localizedNames,

    birthDate: {
      value:
        nullableDate(
          snapshot.birthDate.value,
          'birthDate.value',
        ),

      precision:
        snapshot.birthDate.precision,

      isApproximate:
        snapshot.birthDate.isApproximate,

      estimatedAgeYears:
        snapshot.birthDate
          .estimatedAgeYears,

      estimatedAsOfDate:
        nullableDate(
          snapshot.birthDate
            .estimatedAsOfDate,
          'birthDate.estimatedAsOfDate',
        ),
    },

    isMinor:
      snapshot.isMinor,

    guardianRequirement:
      snapshot.guardianRequirement,

    sexAtBirth:
      snapshot.sexAtBirth,

    genderIdentity:
      snapshot.genderIdentity,

    genderDescription:
      snapshot.genderDescription,

    preferredLocale:
      snapshot.preferredLocale,

    nationalityCountryCode:
      snapshot.nationalityCountryCode,

    status:
      snapshot.status,

    mergeState:
      snapshot.mergeState,

    mergedIntoPatientId:
      nullableObjectId(
        snapshot.mergedIntoPatientId,
        'mergedIntoPatientId',
      ),

    mergedAt:
      nullableDate(
        snapshot.mergedAt,
        'mergedAt',
      ),

    mergedBy:
      nullableObjectId(
        snapshot.mergedBy,
        'mergedBy',
      ),

    mergeReason:
      snapshot.mergeReason,

    deceasedAt:
      nullableDate(
        snapshot.deceasedAt,
        'deceasedAt',
      ),

    statusReason:
      snapshot.statusReason,

    identityReviewRequired:
      snapshot.identityReviewRequired,

    duplicateReviewRequired:
      snapshot.duplicateReviewRequired,

    version:
      snapshot.version,

    updatedBy:
      nullableObjectId(
        snapshot.updatedBy,
        'updatedBy',
      ),

    updatedAt:
      asDate(
        snapshot.updatedAt,
        'updatedAt',
      ),
  };
}

function guardianDocument(
  snapshot: GuardianRestoreSnapshot,
): Record<string, unknown> {
  return {
    firstName:
      snapshot.firstName,

    middleName:
      snapshot.middleName,

    lastName:
      snapshot.lastName,

    displayName:
      snapshot.displayName,

    normalizedFullName:
      snapshot.normalizedFullName,

    localizedNames:
      snapshot.localizedNames,

    cnicNormalized:
      snapshot.cnicNormalized,

    cnicDisplayValue:
      snapshot.cnicDisplayValue,

    dateOfBirth:
      nullableDate(
        snapshot.dateOfBirth,
        'dateOfBirth',
      ),

    sexAtBirth:
      snapshot.sexAtBirth,

    genderIdentity:
      snapshot.genderIdentity,

    phoneNormalized:
      snapshot.phoneNormalized,

    phoneDisplayValue:
      snapshot.phoneDisplayValue,

    emailNormalized:
      snapshot.emailNormalized,

    address:
      snapshot.address,

    preferredLocale:
      snapshot.preferredLocale,

    status:
      snapshot.status,

    mergedIntoGuardianId:
      nullableObjectId(
        snapshot.mergedIntoGuardianId,
        'mergedIntoGuardianId',
      ),

    mergedAt:
      nullableDate(
        snapshot.mergedAt,
        'mergedAt',
      ),

    mergedBy:
      nullableObjectId(
        snapshot.mergedBy,
        'mergedBy',
      ),

    statusReason:
      snapshot.statusReason,

    version:
      snapshot.version,

    updatedBy:
      nullableObjectId(
        snapshot.updatedBy,
        'updatedBy',
      ),

    updatedAt:
      asDate(
        snapshot.updatedAt,
        'updatedAt',
      ),
  };
}

function patientIdentifierDocument(
  snapshot: PatientIdentifierRestoreSnapshot,
): Record<string, unknown> {
  return {
    issuingFacilityId:
      nullableObjectId(
        snapshot.issuingFacilityId,
        'issuingFacilityId',
      ),

    identifierType:
      snapshot.identifierType,

    scope:
      snapshot.scope,

    normalizedValue:
      snapshot.normalizedValue,

    displayValue:
      snapshot.displayValue,

    issuingCountryCode:
      snapshot.issuingCountryCode,

    issuingAuthority:
      snapshot.issuingAuthority,

    isPrimaryIdentity:
      snapshot.isPrimaryIdentity,

    isPrimaryMrn:
      snapshot.isPrimaryMrn,

    verificationStatus:
      snapshot.verificationStatus,

    verifiedAt:
      nullableDate(
        snapshot.verifiedAt,
        'verifiedAt',
      ),

    verifiedBy:
      nullableObjectId(
        snapshot.verifiedBy,
        'verifiedBy',
      ),

    validFrom:
      nullableDate(
        snapshot.validFrom,
        'validFrom',
      ),

    expiresAt:
      nullableDate(
        snapshot.expiresAt,
        'expiresAt',
      ),

    status:
      snapshot.status,

    replacedByIdentifierId:
      nullableObjectId(
        snapshot.replacedByIdentifierId,
        'replacedByIdentifierId',
      ),

    statusReason:
      snapshot.statusReason,

    version:
      snapshot.version,

    updatedBy:
      nullableObjectId(
        snapshot.updatedBy,
        'updatedBy',
      ),

    updatedAt:
      asDate(
        snapshot.updatedAt,
        'updatedAt',
      ),
  };
}

function patientGuardianDocument(
  snapshot: PatientGuardianRestoreSnapshot,
): Record<string, unknown> {
  return {
    relationshipType:
      snapshot.relationshipType,

    relationshipDescription:
      snapshot.relationshipDescription,

    isPrimary:
      snapshot.isPrimary,

    isEmergencyContact:
      snapshot.isEmergencyContact,

    livesWithPatient:
      snapshot.livesWithPatient,

    isFinanciallyResponsible:
      snapshot.isFinanciallyResponsible,

    legalAuthorityStatus:
      snapshot.legalAuthorityStatus,

    canConsentToTreatment:
      snapshot.canConsentToTreatment,

    canConsentToDisclosure:
      snapshot.canConsentToDisclosure,

    canReceiveClinicalInformation:
      snapshot.canReceiveClinicalInformation,

    authorityBasis:
      snapshot.authorityBasis,

    authorityEffectiveFrom:
      nullableDate(
        snapshot.authorityEffectiveFrom,
        'authorityEffectiveFrom',
      ),

    authorityEffectiveTo:
      nullableDate(
        snapshot.authorityEffectiveTo,
        'authorityEffectiveTo',
      ),

    verificationStatus:
      snapshot.verificationStatus,

    verifiedAt:
      nullableDate(
        snapshot.verifiedAt,
        'verifiedAt',
      ),

    verifiedBy:
      nullableObjectId(
        snapshot.verifiedBy,
        'verifiedBy',
      ),

    verificationNotes:
      snapshot.verificationNotes,

    supportingAttachmentIds:
      snapshot.supportingAttachmentIds.map(
        (attachmentId) =>
          toObjectId(
            attachmentId,
            'supportingAttachmentId',
          ),
      ),

    isActive:
      snapshot.isActive,

    endedAt:
      nullableDate(
        snapshot.endedAt,
        'endedAt',
      ),

    endedBy:
      nullableObjectId(
        snapshot.endedBy,
        'endedBy',
      ),

    endReason:
      snapshot.endReason,

    version:
      snapshot.version,

    updatedBy:
      nullableObjectId(
        snapshot.updatedBy,
        'updatedBy',
      ),

    updatedAt:
      asDate(
        snapshot.updatedAt,
        'updatedAt',
      ),
  };
}

function patientContactDocument(
  snapshot: PatientContactRestoreSnapshot,
): Record<string, unknown> {
  return {
    contactType:
      snapshot.contactType,

    purpose:
      snapshot.purpose,

    normalizedValue:
      snapshot.normalizedValue,

    displayValue:
      snapshot.displayValue,

    contactName:
      snapshot.contactName,

    relationshipToPatient:
      snapshot.relationshipToPatient,

    relatedGuardianId:
      nullableObjectId(
        snapshot.relatedGuardianId,
        'relatedGuardianId',
      ),

    isPrimary:
      snapshot.isPrimary,

    isEmergencyContact:
      snapshot.isEmergencyContact,

    consentToContact:
      snapshot.consentToContact,

    isVerified:
      snapshot.isVerified,

    verifiedAt:
      nullableDate(
        snapshot.verifiedAt,
        'verifiedAt',
      ),

    verifiedBy:
      nullableObjectId(
        snapshot.verifiedBy,
        'verifiedBy',
      ),

    status:
      snapshot.status,

    version:
      snapshot.version,

    updatedBy:
      nullableObjectId(
        snapshot.updatedBy,
        'updatedBy',
      ),

    updatedAt:
      asDate(
        snapshot.updatedAt,
        'updatedAt',
      ),
  };
}

function patientAddressDocument(
  snapshot: PatientAddressRestoreSnapshot,
): Record<string, unknown> {
  return {
    addressType:
      snapshot.addressType,

    line1:
      snapshot.line1,

    line2:
      snapshot.line2,

    landmark:
      snapshot.landmark,

    city:
      snapshot.city,

    district:
      snapshot.district,

    province:
      snapshot.province,

    postalCode:
      snapshot.postalCode,

    countryCode:
      snapshot.countryCode,

    isPrimary:
      snapshot.isPrimary,

    validFrom:
      nullableDate(
        snapshot.validFrom,
        'validFrom',
      ),

    validTo:
      nullableDate(
        snapshot.validTo,
        'validTo',
      ),

    status:
      snapshot.status,

    version:
      snapshot.version,

    updatedBy:
      nullableObjectId(
        snapshot.updatedBy,
        'updatedBy',
      ),

    updatedAt:
      asDate(
        snapshot.updatedAt,
        'updatedAt',
      ),
  };
}

function patientAlertDocument(
  snapshot: PatientAlertRestoreSnapshot,
): Record<string, unknown> {
  return {
    alertType:
      snapshot.alertType,

    severity:
      snapshot.severity,

    visibility:
      snapshot.visibility,

    title:
      snapshot.title,

    details:
      snapshot.details,

    effectiveFrom:
      asDate(
        snapshot.effectiveFrom,
        'effectiveFrom',
      ),

    effectiveTo:
      nullableDate(
        snapshot.effectiveTo,
        'effectiveTo',
      ),

    status:
      snapshot.status,

    resolvedAt:
      nullableDate(
        snapshot.resolvedAt,
        'resolvedAt',
      ),

    resolvedBy:
      nullableObjectId(
        snapshot.resolvedBy,
        'resolvedBy',
      ),

    resolutionReason:
      snapshot.resolutionReason,

    version:
      snapshot.version,

    updatedBy:
      nullableObjectId(
        snapshot.updatedBy,
        'updatedBy',
      ),

    updatedAt:
      asDate(
        snapshot.updatedAt,
        'updatedAt',
      ),
  };
}