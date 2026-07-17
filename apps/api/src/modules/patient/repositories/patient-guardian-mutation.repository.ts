import {
  GuardianModel,
  PatientGuardianModel,
  PatientModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  GuardianRecord,
  PatientGuardianRecord,
} from '../patient.types.js';

const PATIENT_GUARDIAN_INTERNAL_SELECT = [
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
  '+authorityBasis',
  'authorityEffectiveFrom',
  'authorityEffectiveTo',
  'verificationStatus',
  'verifiedAt',
  'verifiedBy',
  '+verificationNotes',
  'supportingAttachmentIds',
  'isActive',
  'endedAt',
  'endedBy',
  '+endReason',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

export class PatientGuardianMutationRepository {
  public async findById(
    facilityId: string,
    relationshipId: string,
  ): Promise<PatientGuardianRecord | null> {
    return PatientGuardianModel.findOne({
      _id:
        toObjectId(
          relationshipId,
          'relationshipId',
        ),

      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    })
      .select(
        PATIENT_GUARDIAN_INTERNAL_SELECT,
      )
      .lean<PatientGuardianRecord>()
      .exec();
  }

  public async hasActiveGuardianWithCnic(
    facilityId: string,
    patientId: string,
  ): Promise<boolean> {
    return this.hasAlternativeActiveGuardianWithCnic(
      facilityId,
      patientId,
    );
  }

  public async hasAlternativeActiveGuardianWithCnic(
    facilityId: string,
    patientId: string,
    excludedRelationshipId?: string,
  ): Promise<boolean> {
    const relationships =
      await PatientGuardianModel.find({
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

        isActive:
          true,

        ...(excludedRelationshipId ===
        undefined
          ? {}
          : {
              _id: {
                $ne:
                  toObjectId(
                    excludedRelationshipId,
                    'excludedRelationshipId',
                  ),
              },
            }),
      })
        .select('guardianId')
        .lean<
          Array<
            Pick<
              PatientGuardianRecord,
              'guardianId'
            >
          >
        >()
        .exec();

    if (
      relationships.length === 0
    ) {
      return false;
    }

    const guardian =
      await GuardianModel.exists({
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

        status:
          'ACTIVE',

        cnicNormalized: {
          $type:
            'string',
        },
      });

    return guardian !== null;
  }

  public async hasActiveMinorRelationship(
    facilityId: string,
    guardianId: string,
  ): Promise<boolean> {
    const relationships =
      await PatientGuardianModel.find({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        guardianId:
          toObjectId(
            guardianId,
            'guardianId',
          ),

        isActive:
          true,
      })
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

    if (
      relationships.length === 0
    ) {
      return false;
    }

    const patient =
      await PatientModel.exists({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

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
      });

    return patient !== null;
  }

  public async hasActivePatientGuardian(
    facilityId: string,
    patientId: string,
    guardianId: string,
  ): Promise<boolean> {
    const relationship =
      await PatientGuardianModel.exists({
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

        guardianId:
          toObjectId(
            guardianId,
            'guardianId',
          ),

        isActive:
          true,
      });

    return relationship !== null;
  }

  public async findGuardianForRelationship(
    facilityId: string,
    relationshipId: string,
  ): Promise<GuardianRecord | null> {
    const relationship =
      await this.findById(
        facilityId,
        relationshipId,
      );

    if (relationship === null) {
      return null;
    }

    return GuardianModel.findOne({
      _id:
        relationship.guardianId,

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
          '+statusReason',
          'schemaVersion',
          'version',
          'createdBy',
          'updatedBy',
          'createdAt',
          'updatedAt',
        ].join(' '),
      )
      .lean<GuardianRecord>()
      .exec();
  }

  public async verifyWithVersion(
    input: Readonly<{
      facilityId: string;
      relationshipId: string;
      expectedVersion: number;
      verifiedBy: string;
      verifiedAt: Date;
      verificationNotes: string | null;
    }>,
  ): Promise<PatientGuardianRecord | null> {
    return PatientGuardianModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.relationshipId,
            'relationshipId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,

        isActive:
          true,
      },
      {
        $set: {
          legalAuthorityStatus:
            'VERIFIED',

          verificationStatus:
            'VERIFIED',

          verifiedAt:
            input.verifiedAt,

          verifiedBy:
            toObjectId(
              input.verifiedBy,
              'verifiedBy',
            ),

          verificationNotes:
            input.verificationNotes,

          updatedBy:
            toObjectId(
              input.verifiedBy,
              'verifiedBy',
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
        PATIENT_GUARDIAN_INTERNAL_SELECT,
      )
      .lean<PatientGuardianRecord>()
      .exec();
  }

  public async endWithVersion(
    input: Readonly<{
      facilityId: string;
      relationshipId: string;
      expectedVersion: number;
      endedBy: string;
      endedAt: Date;
      endReason: string;
    }>,
  ): Promise<PatientGuardianRecord | null> {
    return PatientGuardianModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.relationshipId,
            'relationshipId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,

        isActive:
          true,
      },
      {
        $set: {
          isActive:
            false,

          isPrimary:
            false,

          isEmergencyContact:
            false,

          legalAuthorityStatus:
            'REVOKED',

          canConsentToTreatment:
            false,

          canConsentToDisclosure:
            false,

          canReceiveClinicalInformation:
            false,

          endedAt:
            input.endedAt,

          endedBy:
            toObjectId(
              input.endedBy,
              'endedBy',
            ),

          endReason:
            input.endReason
              .normalize('NFKC')
              .trim(),

          updatedBy:
            toObjectId(
              input.endedBy,
              'endedBy',
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
        PATIENT_GUARDIAN_INTERNAL_SELECT,
      )
      .lean<PatientGuardianRecord>()
      .exec();
  }
}