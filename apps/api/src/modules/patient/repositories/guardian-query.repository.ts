import {
  GuardianModel,
  PatientGuardianModel,
  PatientIdentifierModel,
  PatientModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  normalizeCnic,
  normalizePakistanPhone,
  normalizeSearchText,
} from '../patient.normalization.js';

import type {
  GuardianProfileQuery,
  GuardianProfileRecords,
  GuardianSearchCandidateRecord,
  GuardianSearchQuery,
} from '../patient.query.types.js';

import type {
  GuardianRecord,
  PatientGuardianRecord,
  PatientIdentifierRecord,
  PatientRecord,
} from '../patient.types.js';

const GUARDIAN_QUERY_SELECT = [
  '_id',
  'facilityId',
  'enterpriseGuardianId',
  'firstName',
  'middleName',
  'lastName',
  'displayName',
  '+normalizedFullName',
  'localizedNames',
  '+cnicNormalized',
  'cnicDisplayValue',
  '+dateOfBirth',
  'sexAtBirth',
  'genderIdentity',
  '+phoneNormalized',
  'phoneDisplayValue',
  '+emailNormalized',
  '+address.line1',
  '+address.line2',
  'address.city',
  'address.district',
  'address.province',
  '+address.postalCode',
  'address.countryCode',
  'preferredLocale',
  'status',
  'mergedIntoGuardianId',
  'mergedAt',
  'mergedBy',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const RELATIONSHIP_QUERY_SELECT = [
  '_id',
  'facilityId',
  'patientId',
  'guardianId',
  'relationshipType',
  '+relationshipDescription',
  'isPrimary',
  'isEmergencyContact',
  'livesWithPatient',
  'isFinanciallyResponsible',
  'legalAuthorityStatus',
  'canConsentToTreatment',
  'canConsentToDisclosure',
  'canReceiveClinicalInformation',
  'authorityEffectiveFrom',
  'authorityEffectiveTo',
  'verificationStatus',
  'verifiedAt',
  'verifiedBy',
  'isActive',
  'endedAt',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const PATIENT_SUMMARY_SELECT = [
  '_id',
  'facilityId',
  'enterprisePatientId',
  'canonicalPatientId',
  'firstName',
  'middleName',
  'lastName',
  'preferredName',
  'displayName',
  'localizedNames',
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
  'deceasedAt',
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

function escapeRegularExpression(
  value: string,
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/gu,
    '\\$&',
  );
}

export class GuardianQueryRepository {
  public async findSearchCandidates(
    facilityId: string,
    query: GuardianSearchQuery,
  ): Promise<GuardianSearchCandidateRecord[]> {
    const facilityObjectId =
      toObjectId(
        facilityId,
        'facilityId',
      );

    const filter:
      Record<string, unknown> = {
      facilityId:
        facilityObjectId,
    };

    if (query.status !== undefined) {
      filter['status'] =
        query.status;
    }

    if (
      query.term !== undefined
    ) {
      const digits =
        query.term.replace(/\D/gu, '');

      const alternatives:
        Record<string, unknown>[] = [];

      if (digits.length === 13) {
        alternatives.push({
          cnicNormalized:
            normalizeCnic(
              query.term,
              'query.term',
            ),
        });
      }

      if (
        digits.length >= 10 &&
        digits.length <= 12 &&
        /^\+?[\d\s()-]{7,20}$/u.test(
          query.term,
        )
      ) {
        alternatives.push({
          phoneNormalized:
            normalizePakistanPhone(
              query.term,
              'query.term',
            ),
        });
      }

      const normalizedName =
        normalizeSearchText(
          query.term,
        );

      if (normalizedName.length > 0) {
        alternatives.push({
          normalizedFullName: {
            $regex:
              `^${escapeRegularExpression(normalizedName)}`,
          },
        });
      }

      filter['$or'] =
        alternatives;
    }

    const guardians =
      await GuardianModel.find(
        filter,
      )
        .select(
          GUARDIAN_QUERY_SELECT,
        )
        .sort({
          displayName:
            1,

          _id:
            1,
        })
        .skip(
          (query.page - 1) *
            query.pageSize,
        )
        .limit(
          query.pageSize,
        )
        .lean<GuardianRecord[]>()
        .exec();

    if (guardians.length === 0) {
      return [];
    }

    const relationships =
      await PatientGuardianModel.find({
        facilityId:
          facilityObjectId,

        guardianId: {
          $in:
            guardians.map(
              (guardian) =>
                guardian._id,
            ),
        },

        isActive:
          true,
      })
        .select('guardianId patientId')
        .lean<
          Array<
            Pick<
              PatientGuardianRecord,
              | 'guardianId'
              | 'patientId'
            >
          >
        >()
        .exec();

    const minorPatientIds =
      relationships.length === 0
        ? new Set<string>()
        : new Set(
            (
              await PatientModel.find({
                facilityId:
                  facilityObjectId,

                _id: {
                  $in:
                    relationships.map(
                      (relationship) =>
                        relationship.patientId,
                    ),
                },

                isMinor:
                  true,

                status: {
                  $ne:
                    'MERGED',
                },
              })
                .select('_id')
                .lean<
                  Array<
                    Pick<
                      PatientRecord,
                      '_id'
                    >
                  >
                >()
                .exec()
            ).map(
              (patient) =>
                patient._id.toHexString(),
            ),
          );

    const relationshipCounts =
      new Map<string, number>();

    const minorCounts =
      new Map<string, number>();

    for (const relationship of relationships) {
      const guardianId =
        relationship.guardianId
          .toHexString();

      relationshipCounts.set(
        guardianId,
        (relationshipCounts.get(
          guardianId,
        ) ?? 0) + 1,
      );

      if (
        minorPatientIds.has(
          relationship.patientId
            .toHexString(),
        )
      ) {
        minorCounts.set(
          guardianId,
          (minorCounts.get(
            guardianId,
          ) ?? 0) + 1,
        );
      }
    }

    return guardians.map(
      (guardian) => {
        const guardianId =
          guardian._id.toHexString();

        return {
          guardian,

          activeRelationshipCount:
            relationshipCounts.get(
              guardianId,
            ) ?? 0,

          minorPatientCount:
            minorCounts.get(
              guardianId,
            ) ?? 0,
        };
      },
    );
  }

  public async count(
    facilityId: string,
    query: GuardianSearchQuery,
  ): Promise<number> {
    const filter:
      Record<string, unknown> = {
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    };

    if (query.status !== undefined) {
      filter['status'] =
        query.status;
    }

    if (query.term !== undefined) {
      const normalized =
        normalizeSearchText(
          query.term,
        );

      const digits =
        query.term.replace(/\D/gu, '');

      const alternatives:
        Record<string, unknown>[] = [
          {
            normalizedFullName: {
              $regex:
                `^${escapeRegularExpression(normalized)}`,
            },
          },
        ];

      if (digits.length === 13) {
        alternatives.push({
          cnicNormalized:
            normalizeCnic(
              query.term,
              'query.term',
            ),
        });
      }

      if (
        digits.length >= 10 &&
        digits.length <= 12 &&
        /^\+?[\d\s()-]{7,20}$/u.test(
          query.term,
        )
      ) {
        alternatives.push({
          phoneNormalized:
            normalizePakistanPhone(
              query.term,
              'query.term',
            ),
        });
      }

      filter['$or'] =
        alternatives;
    }

    return GuardianModel.countDocuments(
      filter,
    ).exec();
  }

  public async loadProfile(
    facilityId: string,
    guardianId: string,
    query: GuardianProfileQuery,
  ): Promise<GuardianProfileRecords | null> {
    const facilityObjectId =
      toObjectId(
        facilityId,
        'facilityId',
      );

    const guardianObjectId =
      toObjectId(
        guardianId,
        'guardianId',
      );

    const guardian =
      await GuardianModel.findOne({
        _id:
          guardianObjectId,

        facilityId:
          facilityObjectId,
      })
        .select(
          GUARDIAN_QUERY_SELECT,
        )
        .lean<GuardianRecord>()
        .exec();

    if (guardian === null) {
      return null;
    }

    const relationshipFilter:
      Record<string, unknown> = {
      facilityId:
        facilityObjectId,

      guardianId:
        guardianObjectId,
    };

    if (!query.includeInactiveRelationships) {
      relationshipFilter['isActive'] =
        true;
    }

    const relationships =
      await PatientGuardianModel.find(
        relationshipFilter,
      )
        .select(
          RELATIONSHIP_QUERY_SELECT,
        )
        .sort({
          isPrimary:
            -1,

          createdAt:
            1,
        })
        .lean<PatientGuardianRecord[]>()
        .exec();

    if (relationships.length === 0) {
      return {
        guardian,
        relationships: [],
        patients: [],
        primaryMrns: [],
      };
    }

    const patientIds =
      relationships.map(
        (relationship) =>
          relationship.patientId,
      );

    const [
      patients,
      primaryMrns,
    ] = await Promise.all([
      PatientModel.find({
        facilityId:
          facilityObjectId,

        _id: {
          $in:
            patientIds,
        },
      })
        .select(
          PATIENT_SUMMARY_SELECT,
        )
        .lean<PatientRecord[]>()
        .exec(),

      PatientIdentifierModel.find({
        facilityId:
          facilityObjectId,

        patientId: {
          $in:
            patientIds,
        },

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
            'schemaVersion',
            'version',
            'createdBy',
            'updatedBy',
            'createdAt',
            'updatedAt',
          ].join(' '),
        )
        .lean<PatientIdentifierRecord[]>()
        .exec(),
    ]);

    return {
      guardian,
      relationships,
      patients,
      primaryMrns,
    };
  }
}