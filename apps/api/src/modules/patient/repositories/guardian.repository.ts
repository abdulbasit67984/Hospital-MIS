import {
  GuardianModel,
  PatientGuardianModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  PATIENT_ACCESS_LEVEL,
  type PatientAccessLevel,
} from '../patient.constants.js';

import {
  buildLegalName,
  maskPatientIdentifier,
  maskPhoneNumber,
  normalizeCnic,
  normalizeCountryCode,
  normalizeEmailAddress,
  normalizeHumanName,
  normalizeLocale,
  normalizeOptionalText,
  normalizePakistanPhone,
  normalizeSearchText,
  parseNullableDate,
} from '../patient.normalization.js';

import {
  GUARDIAN_MATCHING_SELECT,
  GUARDIAN_SENSITIVE_SELECT,
  GUARDIAN_STANDARD_SELECT,
} from '../patient.projections.js';

import type {
  GuardianInput,
  GuardianRecord,
  PatientGuardianLinkInput,
  PatientGuardianRecord,
  UpdateGuardianInput,
} from '../patient.types.js';

function guardianSelect(
  access: PatientAccessLevel,
): string {
  switch (access) {
    case PATIENT_ACCESS_LEVEL.SENSITIVE:
      return GUARDIAN_SENSITIVE_SELECT;

    case PATIENT_ACCESS_LEVEL.MATCHING:
      return GUARDIAN_MATCHING_SELECT;

    case PATIENT_ACCESS_LEVEL.STANDARD:
      return GUARDIAN_STANDARD_SELECT;
  }
}

function normalizeLocalizedNames(
  names:
    | readonly {
        locale: string;
        fullName: string;
      }[]
    | undefined,
): Array<{
  locale: string;
  fullName: string;
  normalizedFullName: string;
}> {
  return (names ?? []).map(
    (name) => ({
      locale:
        normalizeLocale(
          name.locale,
          'localizedNames.locale',
        ),
      fullName:
        normalizeHumanName(
          name.fullName,
          'localizedNames.fullName',
        ),
      normalizedFullName:
        normalizeSearchText(
          name.fullName,
        ),
    }),
  );
}

export class GuardianRepository {
  public async create(
    input: GuardianInput & Readonly<{
      facilityId: string;
      createdBy: string;
    }>,
  ): Promise<GuardianRecord> {
    const firstName =
      normalizeHumanName(
        input.firstName,
        'guardian.firstName',
      );

    const middleName =
      normalizeOptionalText(
        input.middleName,
      );

    const lastName =
      normalizeOptionalText(
        input.lastName,
      );

    const displayName =
      buildLegalName({
        firstName,
        middleName,
        lastName,
      });

    const cnicNormalized =
      normalizeCnic(
        input.cnic,
        'guardian.cnic',
      );

    const phoneNormalized =
      input.phone === undefined ||
      input.phone === null ||
      input.phone.trim().length === 0
        ? null
        : normalizePakistanPhone(
            input.phone,
            'guardian.phone',
          );

    const emailNormalized =
      input.email === undefined ||
      input.email === null ||
      input.email.trim().length === 0
        ? null
        : normalizeEmailAddress(
            input.email,
            'guardian.email',
          );

    const created =
      await GuardianModel.create({
        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),
        firstName,
        middleName,
        lastName,
        displayName,
        normalizedFullName:
          normalizeSearchText(
            displayName,
          ),
        localizedNames:
          normalizeLocalizedNames(
            input.localizedNames,
          ),
        cnicNormalized,
        cnicDisplayValue:
          maskPatientIdentifier(
            'CNIC',
            cnicNormalized,
          ),
        dateOfBirth:
          parseNullableDate(
            input.dateOfBirth,
            'guardian.dateOfBirth',
          ),
        sexAtBirth:
          input.sexAtBirth ??
          'UNKNOWN',
        genderIdentity:
          input.genderIdentity ??
          'NOT_DISCLOSED',
        phoneNormalized,
        phoneDisplayValue:
          phoneNormalized === null
            ? null
            : maskPhoneNumber(
                phoneNormalized,
              ),
        emailNormalized,
        address: {
          line1:
            normalizeOptionalText(
              input.address?.line1,
            ),
          line2:
            normalizeOptionalText(
              input.address?.line2,
            ),
          city:
            normalizeOptionalText(
              input.address?.city,
            ),
          district:
            normalizeOptionalText(
              input.address?.district,
            ),
          province:
            normalizeOptionalText(
              input.address?.province,
            ),
          postalCode:
            normalizeOptionalText(
              input.address?.postalCode,
            ),
          countryCode:
            normalizeCountryCode(
              input.address?.countryCode ??
                'PK',
              'guardian.address.countryCode',
            ),
        },
        preferredLocale:
          normalizeLocale(
            input.preferredLocale ??
              'en-PK',
            'guardian.preferredLocale',
          ),
        status:
          'ACTIVE',
        mergedIntoGuardianId:
          null,
        mergedAt:
          null,
        mergedBy:
          null,
        statusReason:
          null,
        version:
          0,
        createdBy:
          toObjectId(
            input.createdBy,
            'createdBy',
          ),
        updatedBy:
          toObjectId(
            input.createdBy,
            'createdBy',
          ),
      });

    return created.toObject() as GuardianRecord;
  }

  public async findById(
    facilityId: string,
    guardianId: string,
    access: PatientAccessLevel =
      PATIENT_ACCESS_LEVEL.STANDARD,
  ): Promise<GuardianRecord | null> {
    return GuardianModel.findOne({
      _id:
        toObjectId(
          guardianId,
          'guardianId',
        ),
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    })
      .select(guardianSelect(access))
      .lean<GuardianRecord>()
      .exec();
  }

  public async findByCnic(
    facilityId: string,
    cnic: string,
  ): Promise<GuardianRecord | null> {
    return GuardianModel.findOne({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
      cnicNormalized:
        normalizeCnic(
          cnic,
          'guardianCnic',
        ),
      status:
        'ACTIVE',
    })
      .select(GUARDIAN_MATCHING_SELECT)
      .lean<GuardianRecord>()
      .exec();
  }

  public async findPatientIdsByGuardianCnic(
    facilityId: string,
    cnic: string,
    excludePatientId?: string,
  ): Promise<string[]> {
    const guardian =
      await this.findByCnic(
        facilityId,
        cnic,
      );

    if (guardian === null) {
      return [];
    }

    const filter:
      Record<string, unknown> = {
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
        guardianId:
          guardian._id,
        isActive:
          true,
      };

    if (excludePatientId !== undefined) {
      filter['patientId'] = {
        $ne:
          toObjectId(
            excludePatientId,
            'excludePatientId',
          ),
      };
    }

    const relationships =
      await PatientGuardianModel.find(filter)
        .select('patientId')
        .lean<
          Array<
            Pick<
              PatientGuardianRecord,
              'patientId'
            >
          >
        >()
        .exec();

    return relationships.map(
      (relationship: Pick<
        PatientGuardianRecord,
        'patientId'
      >) =>
        relationship.patientId.toHexString(),
    );
  }

  public async linkToPatient(
    input: PatientGuardianLinkInput & Readonly<{
      facilityId: string;
      patientId: string;
      createdBy: string;
    }>,
  ): Promise<PatientGuardianRecord> {
    const created =
      await PatientGuardianModel.create({
        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),
        patientId:
          toObjectId(
            input.patientId,
            'patientId',
          ),
        guardianId:
          toObjectId(
            input.guardianId,
            'guardianId',
          ),
        relationshipType:
          input.relationshipType,
        relationshipDescription:
          normalizeOptionalText(
            input.relationshipDescription,
          ),
        isPrimary:
          input.isPrimary ??
          false,
        isEmergencyContact:
          input.isEmergencyContact ??
          false,
        livesWithPatient:
          input.livesWithPatient ??
          false,
        isFinanciallyResponsible:
          input.isFinanciallyResponsible ??
          false,
        legalAuthorityStatus:
          input.legalAuthorityStatus ??
          'DECLARED',
        canConsentToTreatment:
          input.canConsentToTreatment ??
          false,
        canConsentToDisclosure:
          input.canConsentToDisclosure ??
          false,
        canReceiveClinicalInformation:
          input.canReceiveClinicalInformation ??
          false,
        authorityBasis:
          normalizeOptionalText(
            input.authorityBasis,
          ),
        authorityEffectiveFrom:
          parseNullableDate(
            input.authorityEffectiveFrom,
            'authorityEffectiveFrom',
          ),
        authorityEffectiveTo:
          parseNullableDate(
            input.authorityEffectiveTo,
            'authorityEffectiveTo',
          ),
        verificationStatus:
          'UNVERIFIED',
        verifiedAt:
          null,
        verifiedBy:
          null,
        verificationNotes:
          null,
        supportingAttachmentIds:
          (input.supportingAttachmentIds ?? []).map(
            (attachmentId) =>
              toObjectId(
                attachmentId,
                'supportingAttachmentIds',
              ),
          ),
        isActive:
          true,
        endedAt:
          null,
        endedBy:
          null,
        endReason:
          null,
        version:
          0,
        createdBy:
          toObjectId(
            input.createdBy,
            'createdBy',
          ),
        updatedBy:
          toObjectId(
            input.createdBy,
            'createdBy',
          ),
      });

    return created.toObject() as PatientGuardianRecord;
  }

  public async listRelationshipsForPatient(
    facilityId: string,
    patientId: string,
    activeOnly = true,
  ): Promise<PatientGuardianRecord[]> {
    return PatientGuardianModel.find({
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
      ...(activeOnly
        ? {
            isActive:
              true,
          }
        : {}),
    })
      .sort({
        isPrimary:
          -1,
        createdAt:
          1,
      })
      .lean<PatientGuardianRecord[]>()
      .exec();
  }

  public async listGuardiansForPatient(
    facilityId: string,
    patientId: string,
    access: PatientAccessLevel =
      PATIENT_ACCESS_LEVEL.STANDARD,
  ): Promise<GuardianRecord[]> {
    const relationships =
      await this.listRelationshipsForPatient(
        facilityId,
        patientId,
        true,
      );

    if (relationships.length === 0) {
      return [];
    }

    return GuardianModel.find({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
      _id: {
        $in:
          relationships.map(
            (relationship) =>
              relationship.guardianId,
          ),
      },
    })
      .select(guardianSelect(access))
      .lean<GuardianRecord[]>()
      .exec();
  }

  public async updateWithVersion(
    facilityId: string,
    guardianId: string,
    input: UpdateGuardianInput,
    actorUserId: string,
  ): Promise<GuardianRecord | null> {
    const existing =
      await this.findById(
        facilityId,
        guardianId,
        PATIENT_ACCESS_LEVEL.MATCHING,
      );

    if (existing === null) {
      return null;
    }

    const setValues:
      Record<string, unknown> = {
        updatedBy:
          toObjectId(
            actorUserId,
            'actorUserId',
          ),
      };

    const firstName =
      input.firstName === undefined
        ? existing.firstName
        : normalizeHumanName(
            input.firstName,
            'guardian.firstName',
          );

    const middleName =
      input.middleName === undefined
        ? existing.middleName
        : normalizeOptionalText(
            input.middleName,
          );

    const lastName =
      input.lastName === undefined
        ? existing.lastName
        : normalizeOptionalText(
            input.lastName,
          );

    if (
      input.firstName !== undefined ||
      input.middleName !== undefined ||
      input.lastName !== undefined
    ) {
      const displayName =
        buildLegalName({
          firstName,
          middleName,
          lastName,
        });

      setValues.firstName =
        firstName;
      setValues.middleName =
        middleName;
      setValues.lastName =
        lastName;
      setValues.displayName =
        displayName;
      setValues.normalizedFullName =
        normalizeSearchText(
          displayName,
        );
    }

    if (input.localizedNames !== undefined) {
      setValues.localizedNames =
        normalizeLocalizedNames(
          input.localizedNames,
        );
    }

    if (input.cnic !== undefined) {
      const cnicNormalized =
        input.cnic === null ||
        input.cnic.trim().length === 0
          ? null
          : normalizeCnic(
              input.cnic,
              'guardian.cnic',
            );

      setValues.cnicNormalized =
        cnicNormalized;
      setValues.cnicDisplayValue =
        cnicNormalized === null
          ? null
          : maskPatientIdentifier(
              'CNIC',
              cnicNormalized,
            );
    }

    if (input.dateOfBirth !== undefined) {
      setValues.dateOfBirth =
        parseNullableDate(
          input.dateOfBirth,
          'guardian.dateOfBirth',
        );
    }

    if (input.sexAtBirth !== undefined) {
      setValues.sexAtBirth =
        input.sexAtBirth;
    }

    if (input.genderIdentity !== undefined) {
      setValues.genderIdentity =
        input.genderIdentity;
    }

    if (input.phone !== undefined) {
      const phoneNormalized =
        input.phone === null ||
        input.phone.trim().length === 0
          ? null
          : normalizePakistanPhone(
              input.phone,
              'guardian.phone',
            );

      setValues.phoneNormalized =
        phoneNormalized;
      setValues.phoneDisplayValue =
        phoneNormalized === null
          ? null
          : maskPhoneNumber(
              phoneNormalized,
            );
    }

    if (input.email !== undefined) {
      setValues.emailNormalized =
        input.email === null ||
        input.email.trim().length === 0
          ? null
          : normalizeEmailAddress(
              input.email,
              'guardian.email',
            );
    }

    if (input.address !== undefined) {
      setValues.address = {
        line1:
          normalizeOptionalText(
            input.address?.line1,
          ),
        line2:
          normalizeOptionalText(
            input.address?.line2,
          ),
        city:
          normalizeOptionalText(
            input.address?.city,
          ),
        district:
          normalizeOptionalText(
            input.address?.district,
          ),
        province:
          normalizeOptionalText(
            input.address?.province,
          ),
        postalCode:
          normalizeOptionalText(
            input.address?.postalCode,
          ),
        countryCode:
          normalizeCountryCode(
            input.address?.countryCode ??
              'PK',
            'guardian.address.countryCode',
          ),
      };
    }

    if (input.preferredLocale !== undefined) {
      setValues.preferredLocale =
        normalizeLocale(
          input.preferredLocale,
          'guardian.preferredLocale',
        );
    }

    if (input.status !== undefined) {
      setValues.status =
        input.status;
    }

    if (input.statusReason !== undefined) {
      setValues.statusReason =
        normalizeOptionalText(
          input.statusReason,
        );
    }

    return GuardianModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            guardianId,
            'guardianId',
          ),
        facilityId:
          toObjectId(
            facilityId,
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
        $set:
          setValues,
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
      .select(GUARDIAN_SENSITIVE_SELECT)
      .lean<GuardianRecord>()
      .exec();
  }
}