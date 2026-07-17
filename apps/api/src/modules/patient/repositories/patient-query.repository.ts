import {
  GuardianModel,
  PatientAddressModel,
  PatientAlertModel,
  PatientContactModel,
  PatientGuardianModel,
  PatientIdentifierModel,
  PatientModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  normalizeCnic,
  normalizePatientIdentifier,
  normalizePakistanPhone,
  normalizeSearchText,
} from '../patient.normalization.js';

import {
  highestAlertSeverity,
} from '../patient.query.mapper.js';

import type {
  PatientProfileQuery,
  PatientProfileRecords,
  PatientQueryAccessLevel,
  PatientSearchCandidateRecord,
  PatientSearchMatch,
  PatientSearchMode,
  PatientSearchQuery,
} from '../patient.query.types.js';

import type {
  GuardianRecord,
  PatientAddressRecord,
  PatientAlertRecord,
  PatientContactRecord,
  PatientGuardianRecord,
  PatientIdentifierRecord,
  PatientRecord,
} from '../patient.types.js';

const MAX_SEARCH_CANDIDATES =
  500;

const PATIENT_QUERY_SELECT = [
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

const IDENTIFIER_QUERY_SELECT = [
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
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const CONTACT_QUERY_SELECT = [
  '_id',
  'facilityId',
  'patientId',
  'contactType',
  'purpose',
  '+normalizedValue',
  'displayValue',
  'contactName',
  'relationshipToPatient',
  'relatedGuardianId',
  'isPrimary',
  'isEmergencyContact',
  'consentToContact',
  'isVerified',
  'verifiedAt',
  'verifiedBy',
  'status',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const ADDRESS_QUERY_SELECT = [
  '_id',
  'facilityId',
  'patientId',
  'addressType',
  '+line1',
  '+line2',
  '+landmark',
  'city',
  'district',
  'province',
  '+postalCode',
  'countryCode',
  'isPrimary',
  'validFrom',
  'validTo',
  'status',
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

const ALERT_QUERY_SELECT = [
  '_id',
  'facilityId',
  'patientId',
  'alertType',
  'severity',
  'visibility',
  'title',
  '+details',
  'effectiveFrom',
  'effectiveTo',
  'status',
  'resolvedAt',
  'resolvedBy',
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

function searchModes(
  query: PatientSearchQuery,
): PatientSearchMode[] {
  if (query.mode !== 'AUTO') {
    return [
      query.mode,
    ];
  }

  const digits =
    query.term.replace(/\D/gu, '');

  const modes:
    PatientSearchMode[] = [
      'MRN',
      'NAME',
    ];

  if (digits.length === 13) {
    modes.unshift(
      'CNIC',
      'B_FORM',
      'GUARDIAN_CNIC',
    );
  }

  if (
    digits.length >= 10 &&
    digits.length <= 12 &&
    /^\+?[\d\s()-]{7,20}$/u.test(
      query.term,
    )
  ) {
    modes.unshift(
      'PHONE',
    );
  }

  return [
    ...new Set(modes),
  ];
}

export class PatientQueryRepository {
  public async findSearchCandidates(
    facilityId: string,
    query: PatientSearchQuery,
  ): Promise<PatientSearchCandidateRecord[]> {
    const facilityObjectId =
      toObjectId(
        facilityId,
        'facilityId',
      );

    const matches =
      new Map<
        string,
        Set<PatientSearchMatch>
      >();

    const addMatch = (
      patientId: string,
      matchedBy: PatientSearchMatch,
    ): void => {
      const values =
        matches.get(patientId) ??
        new Set<PatientSearchMatch>();

      values.add(
        matchedBy,
      );

      matches.set(
        patientId,
        values,
      );
    };

    for (
      const mode of searchModes(query)
    ) {
      if (
        mode === 'MRN' ||
        mode === 'CNIC' ||
        mode === 'B_FORM'
      ) {
        const normalized =
          normalizePatientIdentifier(
            mode,
            query.term,
          );

        const identifiers =
          await PatientIdentifierModel.find({
            facilityId:
              facilityObjectId,

            identifierType:
              mode,

            normalizedValue:
              normalized,

            status:
              'ACTIVE',
          })
            .select('patientId')
            .limit(
              MAX_SEARCH_CANDIDATES,
            )
            .lean<
              Array<
                Pick<
                  PatientIdentifierRecord,
                  'patientId'
                >
              >
            >()
            .exec();

        for (const identifier of identifiers) {
          addMatch(
            identifier.patientId
              .toHexString(),
            mode,
          );
        }

        continue;
      }

      if (mode === 'GUARDIAN_CNIC') {
        const guardians =
          await GuardianModel.find({
            facilityId:
              facilityObjectId,

            cnicNormalized:
              normalizeCnic(
                query.term,
                'query.term',
              ),

            status:
              'ACTIVE',
          })
            .select('_id')
            .limit(
              MAX_SEARCH_CANDIDATES,
            )
            .lean<
              Array<
                Pick<
                  GuardianRecord,
                  '_id'
                >
              >
            >()
            .exec();

        if (guardians.length > 0) {
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
              .select('patientId')
              .limit(
                MAX_SEARCH_CANDIDATES,
              )
              .lean<
                Array<
                  Pick<
                    PatientGuardianRecord,
                    'patientId'
                  >
                >
              >()
              .exec();

          for (const relationship of relationships) {
            addMatch(
              relationship.patientId
                .toHexString(),
              'GUARDIAN_CNIC',
            );
          }
        }

        continue;
      }

      if (mode === 'PHONE') {
        const contacts =
          await PatientContactModel.find({
            facilityId:
              facilityObjectId,

            contactType:
              'PHONE',

            normalizedValue:
              normalizePakistanPhone(
                query.term,
                'query.term',
              ),

            status:
              'ACTIVE',
          })
            .select('patientId')
            .limit(
              MAX_SEARCH_CANDIDATES,
            )
            .lean<
              Array<
                Pick<
                  PatientContactRecord,
                  'patientId'
                >
              >
            >()
            .exec();

        for (const contact of contacts) {
          addMatch(
            contact.patientId
              .toHexString(),
            'PHONE',
          );
        }

        continue;
      }

      const normalizedName =
        normalizeSearchText(
          query.term,
        );

      if (normalizedName.length === 0) {
        continue;
      }

      const patients =
        await PatientModel.find({
          facilityId:
            facilityObjectId,

          $or: [
            {
              normalizedFullName: {
                $regex:
                  `^${escapeRegularExpression(normalizedName)}`,
              },
            },
            {
              nameSearchTokens: {
                $all:
                  normalizedName.split(' '),
              },
            },
          ],
        })
          .select('_id')
          .limit(
            MAX_SEARCH_CANDIDATES,
          )
          .lean<
            Array<
              Pick<
                PatientRecord,
                '_id'
              >
            >
          >()
          .exec();

      for (const patient of patients) {
        addMatch(
          patient._id.toHexString(),
          'NAME',
        );
      }
    }

    if (matches.size === 0) {
      return [];
    }

    const patientFilter:
      Record<string, unknown> = {
      _id: {
        $in:
          [...matches.keys()].map(
            (patientId) =>
              toObjectId(
                patientId,
                'patientId',
              ),
          ),
      },

      facilityId:
        facilityObjectId,
    };

    if (query.status !== undefined) {
      patientFilter['status'] =
        query.status;
    } else if (!query.includeMerged) {
      patientFilter['status'] = {
        $ne:
          'MERGED',
      };
    }

    if (query.sexAtBirth !== undefined) {
      patientFilter['sexAtBirth'] =
        query.sexAtBirth;
    }

    if (query.isMinor !== undefined) {
      patientFilter['isMinor'] =
        query.isMinor;
    }

    if (
      query.duplicateReviewRequired !==
      undefined
    ) {
      patientFilter[
        'duplicateReviewRequired'
      ] =
        query.duplicateReviewRequired;
    }

    const patients =
      await PatientModel.find(
        patientFilter,
      )
        .select(
          PATIENT_QUERY_SELECT,
        )
        .sort({
          registeredAt:
            -1,

          _id:
            1,
        })
        .limit(
          MAX_SEARCH_CANDIDATES,
        )
        .lean<PatientRecord[]>()
        .exec();

    if (patients.length === 0) {
      return [];
    }

    const patientObjectIds =
      patients.map(
        (patient) =>
          patient._id,
      );

    const [
      mrns,
      contacts,
      alerts,
    ] = await Promise.all([
      PatientIdentifierModel.find({
        facilityId:
          facilityObjectId,

        patientId: {
          $in:
            patientObjectIds,
        },

        identifierType:
          'MRN',

        isPrimaryMrn:
          true,

        status:
          'ACTIVE',
      })
        .select(
          IDENTIFIER_QUERY_SELECT,
        )
        .lean<PatientIdentifierRecord[]>()
        .exec(),

      PatientContactModel.find({
        facilityId:
          facilityObjectId,

        patientId: {
          $in:
            patientObjectIds,
        },

        isPrimary:
          true,

        status:
          'ACTIVE',
      })
        .select(
          CONTACT_QUERY_SELECT,
        )
        .sort({
          createdAt:
            1,
        })
        .lean<PatientContactRecord[]>()
        .exec(),

      PatientAlertModel.find({
        facilityId:
          facilityObjectId,

        patientId: {
          $in:
            patientObjectIds,
        },

        status:
          'ACTIVE',

        effectiveFrom: {
          $lte:
            new Date(),
        },

        $or: [
          {
            effectiveTo:
              null,
          },
          {
            effectiveTo: {
              $gt:
                new Date(),
            },
          },
        ],
      })
        .select(
          'patientId severity',
        )
        .lean<
          Array<
            Pick<
              PatientAlertRecord,
              | 'patientId'
              | 'severity'
            >
          >
        >()
        .exec(),
    ]);

    const mrnByPatientId =
      new Map(
        mrns.map(
          (mrn) => [
            mrn.patientId
              .toHexString(),
            mrn,
          ],
        ),
      );

    const contactByPatientId =
      new Map<string, PatientContactRecord>();

    for (const contact of contacts) {
      const patientId =
        contact.patientId
          .toHexString();

      if (
        !contactByPatientId.has(
          patientId,
        )
      ) {
        contactByPatientId.set(
          patientId,
          contact,
        );
      }
    }

    const alertsByPatientId =
      new Map<
        string,
        PatientAlertRecord['severity'][]
      >();

    for (const alert of alerts) {
      const patientId =
        alert.patientId
          .toHexString();

      const values =
        alertsByPatientId.get(
          patientId,
        ) ?? [];

      values.push(
        alert.severity,
      );

      alertsByPatientId.set(
        patientId,
        values,
      );
    }

    return patients.flatMap(
      (patient) => {
        const patientId =
          patient._id.toHexString();

        const mrn =
          mrnByPatientId.get(
            patientId,
          );

        if (mrn === undefined) {
          return [];
        }

        const severities =
          alertsByPatientId.get(
            patientId,
          ) ?? [];

        return [
          {
            patient,
            primaryMrn:
              mrn,
            primaryContact:
              contactByPatientId.get(
                patientId,
              ) ?? null,
            matchedBy: [
              ...(matches.get(
                patientId,
              ) ?? []),
            ],
            activeAlertCount:
              severities.length,
            highestAlertSeverity:
              highestAlertSeverity(
                severities,
              ),
          },
        ];
      },
    );
  }

  public async loadProfile(
    facilityId: string,
    patientId: string,
    accessLevel: PatientQueryAccessLevel,
    query: PatientProfileQuery,
  ): Promise<PatientProfileRecords | null> {
    const facilityObjectId =
      toObjectId(
        facilityId,
        'facilityId',
      );

    const patientObjectId =
      toObjectId(
        patientId,
        'patientId',
      );

    const patient =
      await PatientModel.findOne({
        _id:
          patientObjectId,

        facilityId:
          facilityObjectId,
      })
        .select(
          PATIENT_QUERY_SELECT,
        )
        .lean<PatientRecord>()
        .exec();

    if (patient === null) {
      return null;
    }

    const contactFilter:
      Record<string, unknown> = {
      facilityId:
        facilityObjectId,

      patientId:
        patientObjectId,
    };

    if (!query.includeInactiveContacts) {
      contactFilter['status'] =
        'ACTIVE';
    }

    const addressFilter:
      Record<string, unknown> = {
      facilityId:
        facilityObjectId,

      patientId:
        patientObjectId,
    };

    if (!query.includeInactiveAddresses) {
      addressFilter['status'] =
        'ACTIVE';
    }

    const relationshipFilter:
      Record<string, unknown> = {
      facilityId:
        facilityObjectId,

      patientId:
        patientObjectId,
    };

    if (!query.includeInactiveGuardians) {
      relationshipFilter['isActive'] =
        true;
    }

    const alertFilter:
      Record<string, unknown> = {
      facilityId:
        facilityObjectId,

      patientId:
        patientObjectId,
    };

    if (!query.includeResolvedAlerts) {
      alertFilter['status'] =
        'ACTIVE';
    }

    const [
      identifiers,
      contacts,
      addresses,
      guardianRelationships,
      alerts,
    ] = await Promise.all([
      PatientIdentifierModel.find({
        facilityId:
          facilityObjectId,

        patientId:
          patientObjectId,
      })
        .select(
          IDENTIFIER_QUERY_SELECT,
        )
        .sort({
          isPrimaryMrn:
            -1,

          isPrimaryIdentity:
            -1,

          identifierType:
            1,
        })
        .lean<PatientIdentifierRecord[]>()
        .exec(),

      PatientContactModel.find(
        contactFilter,
      )
        .select(
          CONTACT_QUERY_SELECT,
        )
        .sort({
          isPrimary:
            -1,

          isEmergencyContact:
            -1,

          createdAt:
            1,
        })
        .lean<PatientContactRecord[]>()
        .exec(),

      PatientAddressModel.find(
        addressFilter,
      )
        .select(
          ADDRESS_QUERY_SELECT,
        )
        .sort({
          isPrimary:
            -1,

          createdAt:
            1,
        })
        .lean<PatientAddressRecord[]>()
        .exec(),

      PatientGuardianModel.find(
        relationshipFilter,
      )
        .select(
          RELATIONSHIP_QUERY_SELECT,
        )
        .sort({
          isPrimary:
            -1,

          isEmergencyContact:
            -1,

          createdAt:
            1,
        })
        .lean<PatientGuardianRecord[]>()
        .exec(),

      PatientAlertModel.find(
        alertFilter,
      )
        .select(
          ALERT_QUERY_SELECT,
        )
        .sort({
          severity:
            -1,

          effectiveFrom:
            -1,
        })
        .lean<PatientAlertRecord[]>()
        .exec(),
    ]);

    const guardians =
      guardianRelationships.length === 0
        ? []
        : await GuardianModel.find({
            facilityId:
              facilityObjectId,

            _id: {
              $in:
                guardianRelationships.map(
                  (relationship) =>
                    relationship.guardianId,
                ),
            },
          })
            .select(
              GUARDIAN_QUERY_SELECT,
            )
            .lean<GuardianRecord[]>()
            .exec();

    if (
      accessLevel === 'STANDARD'
    ) {
      for (const identifier of identifiers) {
        identifier.normalizedValue =
          identifier.displayValue;
      }

      for (const contact of contacts) {
        contact.normalizedValue =
          contact.displayValue;
      }
    }

    return {
      patient,
      identifiers,
      contacts,
      addresses,
      guardianRelationships,
      guardians,
      alerts,
    };
  }