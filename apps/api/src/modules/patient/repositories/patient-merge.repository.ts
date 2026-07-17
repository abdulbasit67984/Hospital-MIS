import {
  PatientIdentifierModel,
  PatientMergeModel,
  PatientModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  PatientMergeEvidenceCode,
} from '@hospital-mis/database';

import {
  ConflictError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import type {
  CanonicalPatientResolution,
  PatientMergeRecord,
} from '../patient.merge.js';

import type {
  PatientIdentifierRecord,
  PatientRecord,
} from '../patient.types.js';

const PATIENT_MERGE_INTERNAL_SELECT = [
  '_id',
  'facilityId',
  'enterprisePatientId',
  'canonicalPatientId',
  'firstName',
  'middleName',
  'lastName',
  'preferredName',
  'displayName',
  '+normalizedFullName',
  '+nameSearchTokens',
  'localizedNames',
  '+birthDate.value',
  'birthDate.precision',
  'birthDate.isApproximate',
  'birthDate.estimatedAgeYears',
  'birthDate.estimatedAsOfDate',
  'isMinor',
  'guardianRequirement',
  'sexAtBirth',
  'genderIdentity',
  'genderDescription',
  'preferredLocale',
  'nationalityCountryCode',
  'status',
  'mergeState',
  'mergedIntoPatientId',
  'mergedAt',
  'mergedBy',
  '+mergeReason',
  'deceasedAt',
  '+statusReason',
  'identityReviewRequired',
  'duplicateReviewRequired',
  'registrationSource',
  'registeredAt',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const PATIENT_MERGE_RECORD_SELECT = [
  '_id',
  'facilityId',
  'mergeId',
  'sourcePatientId',
  'targetPatientId',
  'sourceEnterprisePatientId',
  'targetEnterprisePatientId',
  'sourcePrimaryMrn',
  'targetPrimaryMrn',
  'evidenceCodes',
  '+reason',
  'strategy',
  'status',
  'sourceStatusBefore',
  'targetStatusBefore',
  'sourceVersionBefore',
  'sourceVersionAfter',
  'targetVersionBefore',
  'targetVersionAfter',
  'mergedAt',
  'mergedBy',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

export interface PatientReferenceRecord {
  patientId: string;
  facilityId: string;
  enterprisePatientId: string;
  status: PatientRecord['status'];
  mergeState: PatientRecord['mergeState'];
  canonicalPatientId: string | null;
  mergedIntoPatientId: string | null;
}

export class PatientMergeRepository {
  public async findPatientForMerge(
    facilityId: string,
    patientId: string,
  ): Promise<PatientRecord | null> {
    return PatientModel.findOne({
      _id:
        toObjectId(
          patientId,
          'patientId',
        ),

      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    })
      .select(
        PATIENT_MERGE_INTERNAL_SELECT,
      )
      .lean<PatientRecord>()
      .exec();
  }

  public async findPatientReference(
    facilityId: string,
    patientId: string,
  ): Promise<PatientReferenceRecord | null> {
    const record =
      await PatientModel.findOne({
        _id:
          toObjectId(
            patientId,
            'patientId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          [
            '_id',
            'facilityId',
            'enterprisePatientId',
            'status',
            'mergeState',
            'canonicalPatientId',
            'mergedIntoPatientId',
          ].join(' '),
        )
        .lean<
          Pick<
            PatientRecord,
            | '_id'
            | 'facilityId'
            | 'enterprisePatientId'
            | 'status'
            | 'mergeState'
            | 'canonicalPatientId'
            | 'mergedIntoPatientId'
          >
        >()
        .exec();

    if (record === null) {
      return null;
    }

    return {
      patientId:
        record._id.toHexString(),

      facilityId:
        record.facilityId.toHexString(),

      enterprisePatientId:
        record.enterprisePatientId,

      status:
        record.status,

      mergeState:
        record.mergeState,

      canonicalPatientId:
        record.canonicalPatientId
          ?.toHexString() ??
        null,

      mergedIntoPatientId:
        record.mergedIntoPatientId
          ?.toHexString() ??
        null,
    };
  }

  public async findPrimaryMrn(
    facilityId: string,
    patientId: string,
  ): Promise<PatientIdentifierRecord | null> {
    return PatientIdentifierModel.findOne({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      patientId:
        toObjectId(
          patientId,
          'patientId',
        ),

      identifierType:
        'MRN',

      isPrimaryMrn:
        true,

      status:
        'ACTIVE',
    })
      .select(
        [
          '_id',
          'facilityId',
          'patientId',
          'issuingFacilityId',
          'identifierType',
          'scope',
          '+normalizedValue',
          'displayValue',
          'issuingCountryCode',
          'issuingAuthority',
          'isPrimaryIdentity',
          'isPrimaryMrn',
          'verificationStatus',
          'verifiedAt',
          'verifiedBy',
          'validFrom',
          'expiresAt',
          'status',
          'replacedByIdentifierId',
          '+statusReason',
          'schemaVersion',
          'version',
          'createdBy',
          'updatedBy',
          'createdAt',
          'updatedAt',
        ].join(' '),
      )
      .lean<PatientIdentifierRecord>()
      .exec();
  }

  public async findCompletedBySource(
    facilityId: string,
    sourcePatientId: string,
  ): Promise<PatientMergeRecord | null> {
    return PatientMergeModel.findOne({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      sourcePatientId:
        toObjectId(
          sourcePatientId,
          'sourcePatientId',
        ),

      status:
        'COMPLETED',
    })
      .select(
        PATIENT_MERGE_RECORD_SELECT,
      )
      .lean<PatientMergeRecord>()
      .exec();
  }

  public async findByMergeId(
    facilityId: string,
    mergeId: string,
  ): Promise<PatientMergeRecord | null> {
    return PatientMergeModel.findOne({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      mergeId,
    })
      .select(
        PATIENT_MERGE_RECORD_SELECT,
      )
      .lean<PatientMergeRecord>()
      .exec();
  }

  public async markSourceMerged(
    input: Readonly<{
      facilityId: string;
      sourcePatientId: string;
      targetPatientId: string;
      expectedVersion: number;
      mergedAt: Date;
      mergedBy: string;
      reason: string;
    }>,
  ): Promise<PatientRecord | null> {
    return PatientModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.sourcePatientId,
            'sourcePatientId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,

        status: {
          $ne:
            'MERGED',
        },
      },
      {
        $set: {
          canonicalPatientId:
            toObjectId(
              input.targetPatientId,
              'targetPatientId',
            ),

          status:
            'MERGED',

          mergeState:
            'MERGED',

          mergedIntoPatientId:
            toObjectId(
              input.targetPatientId,
              'targetPatientId',
            ),

          mergedAt:
            input.mergedAt,

          mergedBy:
            toObjectId(
              input.mergedBy,
              'mergedBy',
            ),

          mergeReason:
            input.reason
              .normalize('NFKC')
              .trim(),

          duplicateReviewRequired:
            false,

          identityReviewRequired:
            false,

          updatedBy:
            toObjectId(
              input.mergedBy,
              'mergedBy',
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
        PATIENT_MERGE_INTERNAL_SELECT,
      )
      .lean<PatientRecord>()
      .exec();
  }

  public async markTargetCanonical(
    input: Readonly<{
      facilityId: string;
      targetPatientId: string;
      expectedVersion: number;
      actorUserId: string;
    }>,
  ): Promise<PatientRecord | null> {
    return PatientModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.targetPatientId,
            'targetPatientId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,

        status: {
          $ne:
            'MERGED',
        },
      },
      {
        $set: {
          canonicalPatientId:
            null,

          mergeState:
            'CANONICAL',

          mergedIntoPatientId:
            null,

          mergedAt:
            null,

          mergedBy:
            null,

          mergeReason:
            null,

          duplicateReviewRequired:
            false,

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
        PATIENT_MERGE_INTERNAL_SELECT,
      )
      .lean<PatientRecord>()
      .exec();
  }

  public async setDuplicateReviewState(
    input: Readonly<{
      facilityId: string;
      patientId: string;
      expectedVersion: number;
      required: boolean;
      actorUserId: string;
    }>,
  ): Promise<PatientRecord | null> {
    return PatientModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.patientId,
            'patientId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,

        status: {
          $ne:
            'MERGED',
        },
      },
      {
        $set: {
          duplicateReviewRequired:
            input.required,

          mergeState:
            input.required
              ? 'DUPLICATE_SUSPECTED'
              : 'CANONICAL',

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
        PATIENT_MERGE_INTERNAL_SELECT,
      )
      .lean<PatientRecord>()
      .exec();
  }

  public async createCompleted(
    input: Readonly<{
      mergeDocumentId: string;
      facilityId: string;
      sourcePatientId: string;
      targetPatientId: string;
      sourceEnterprisePatientId: string;
      targetEnterprisePatientId: string;
      sourcePrimaryMrn: string;
      targetPrimaryMrn: string;
      evidenceCodes: readonly PatientMergeEvidenceCode[];
      reason: string;
      sourceStatusBefore: PatientRecord['status'];
      targetStatusBefore: PatientRecord['status'];
      sourceVersionBefore: number;
      sourceVersionAfter: number;
      targetVersionBefore: number;
      targetVersionAfter: number;
      mergedAt: Date;
      mergedBy: string;
      transactionId: string;
      correlationId: string;
    }>,
  ): Promise<PatientMergeRecord> {
    const created =
      await PatientMergeModel.create({
        _id:
          toObjectId(
            input.mergeDocumentId,
            'mergeDocumentId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        sourcePatientId:
          toObjectId(
            input.sourcePatientId,
            'sourcePatientId',
          ),

        targetPatientId:
          toObjectId(
            input.targetPatientId,
            'targetPatientId',
          ),

        sourceEnterprisePatientId:
          input.sourceEnterprisePatientId,

        targetEnterprisePatientId:
          input.targetEnterprisePatientId,

        sourcePrimaryMrn:
          input.sourcePrimaryMrn,

        targetPrimaryMrn:
          input.targetPrimaryMrn,

        evidenceCodes: [
          ...new Set(
            input.evidenceCodes,
          ),
        ],

        reason:
          input.reason
            .normalize('NFKC')
            .trim(),

        strategy:
          'CANONICAL_REDIRECT',

        status:
          'COMPLETED',

        sourceStatusBefore:
          input.sourceStatusBefore,

        targetStatusBefore:
          input.targetStatusBefore,

        sourceVersionBefore:
          input.sourceVersionBefore,

        sourceVersionAfter:
          input.sourceVersionAfter,

        targetVersionBefore:
          input.targetVersionBefore,

        targetVersionAfter:
          input.targetVersionAfter,

        mergedAt:
          input.mergedAt,

        mergedBy:
          toObjectId(
            input.mergedBy,
            'mergedBy',
          ),

        transactionId:
          input.transactionId,

        correlationId:
          input.correlationId,

        version:
          0,

        createdBy:
          toObjectId(
            input.mergedBy,
            'mergedBy',
          ),

        updatedBy:
          toObjectId(
            input.mergedBy,
            'mergedBy',
          ),
      });

    return created.toObject() as PatientMergeRecord;
  }
}

export class PatientCanonicalizationService {
  public constructor(
    private readonly merges:
      PatientMergeRepository,

    private readonly maximumRedirectDepth =
      20,
  ) {
    if (
      !Number.isSafeInteger(
        maximumRedirectDepth,
      ) ||
      maximumRedirectDepth < 1 ||
      maximumRedirectDepth > 100
    ) {
      throw new TypeError(
        'Patient canonicalization redirect depth must be between 1 and 100',
      );
    }
  }

  public async resolve(
    facilityId: string,
    patientId: string,
  ): Promise<CanonicalPatientResolution> {
    const visited =
      new Set<string>();

    const redirectPath:
      string[] = [];

    let currentPatientId =
      patientId;

    for (
      let depth = 0;
      depth <= this.maximumRedirectDepth;
      depth += 1
    ) {
      if (
        visited.has(
          currentPatientId,
        )
      ) {
        throw new ConflictError(
          'Patient canonicalization contains a merge cycle',
        );
      }

      visited.add(
        currentPatientId,
      );

      const patient =
        await this.merges
          .findPatientReference(
            facilityId,
            currentPatientId,
          );

      if (patient === null) {
        if (
          currentPatientId ===
          patientId
        ) {
          throw new ResourceNotFoundError(
            'Patient was not found',
          );
        }

        throw new ConflictError(
          'Patient canonicalization points to a missing patient',
        );
      }

      redirectPath.push(
        currentPatientId,
      );

      const redirectTarget =
        patient.mergedIntoPatientId ??
        patient.canonicalPatientId;

      const isMerged =
        patient.status === 'MERGED' ||
        patient.mergeState === 'MERGED';

      if (!isMerged) {
        if (
          redirectTarget !== null &&
          redirectTarget !==
            currentPatientId
        ) {
          throw new ConflictError(
            'A canonical patient has an unexpected redirect target',
          );
        }

        return {
          requestedPatientId:
            patientId,

          canonicalPatientId:
            patient.patientId,

          canonicalEnterprisePatientId:
            patient.enterprisePatientId,

          canonicalStatus:
            patient.status,

          redirected:
            patient.patientId !==
            patientId,

          redirectPath,
        };
      }

      if (
        redirectTarget === null
      ) {
        throw new ConflictError(
          'Merged patient does not identify a canonical target',
        );
      }

      currentPatientId =
        redirectTarget;
    }

    throw new ConflictError(
      'Patient canonicalization exceeded the maximum redirect depth',
    );
  }

  public async resolveMany(
    facilityId: string,
    patientIds: readonly string[],
  ): Promise<CanonicalPatientResolution[]> {
    return Promise.all(
      [
        ...new Set(
          patientIds,
        ),
      ].map(
        (patientId) =>
          this.resolve(
            facilityId,
            patientId,
          ),
      ),
    );
  }
}