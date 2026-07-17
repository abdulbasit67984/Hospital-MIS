import {
  PatientIdentifierModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  maskPatientIdentifier,
  normalizeCountryCode,
  normalizeOptionalText,
  normalizePatientIdentifier,
  parseNullableDate,
} from '../patient.normalization.js';

import {
  PATIENT_IDENTIFIER_INTERNAL_SELECT,
  PATIENT_IDENTIFIER_STANDARD_SELECT,
} from '../patient.projections.js';

import type {
  PatientIdentifierInput,
  PatientIdentifierMatch,
  PatientIdentifierRecord,
} from '../patient.types.js';

export class PatientIdentifierRepository {
  public async createIdentity(
    input: PatientIdentifierInput & Readonly<{
      facilityId: string;
      patientId: string;
      createdBy: string;
    }>,
  ): Promise<PatientIdentifierRecord> {
    const normalizedValue =
      normalizePatientIdentifier(
        input.identifierType,
        input.value,
      );

    const created =
      await PatientIdentifierModel.create({
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
        issuingFacilityId:
          null,
        identifierType:
          input.identifierType,
        scope:
          'ENTERPRISE',
        normalizedValue,
        displayValue:
          maskPatientIdentifier(
            input.identifierType,
            normalizedValue,
          ),
        issuingCountryCode:
          normalizeCountryCode(
            input.issuingCountryCode,
            'issuingCountryCode',
          ),
        issuingAuthority:
          normalizeOptionalText(
            input.issuingAuthority,
          ),
        isPrimaryIdentity:
          input.isPrimaryIdentity ??
          false,
        isPrimaryMrn:
          false,
        verificationStatus:
          'UNVERIFIED',
        verifiedAt:
          null,
        verifiedBy:
          null,
        validFrom:
          parseNullableDate(
            input.validFrom,
            'validFrom',
          ),
        expiresAt:
          parseNullableDate(
            input.expiresAt,
            'expiresAt',
          ),
        status:
          'ACTIVE',
        replacedByIdentifierId:
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

    return created.toObject() as PatientIdentifierRecord;
  }

  public async createMedicalRecordNumber(
    input: Readonly<{
      facilityId: string;
      patientId: string;
      mrn: string;
      createdBy: string;
    }>,
  ): Promise<PatientIdentifierRecord> {
    const normalizedValue =
      normalizePatientIdentifier(
        'MRN',
        input.mrn,
        'mrn',
      );

    const now =
      new Date();

    const created =
      await PatientIdentifierModel.create({
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
        issuingFacilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),
        identifierType:
          'MRN',
        scope:
          'FACILITY',
        normalizedValue,
        displayValue:
          normalizedValue,
        issuingCountryCode:
          'PK',
        issuingAuthority:
          null,
        isPrimaryIdentity:
          false,
        isPrimaryMrn:
          true,
        verificationStatus:
          'VERIFIED',
        verifiedAt:
          now,
        verifiedBy:
          toObjectId(
            input.createdBy,
            'createdBy',
          ),
        validFrom:
          now,
        expiresAt:
          null,
        status:
          'ACTIVE',
        replacedByIdentifierId:
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

    return created.toObject() as PatientIdentifierRecord;
  }

  public async findById(
    facilityId: string,
    identifierId: string,
    includeNormalizedValue = false,
  ): Promise<PatientIdentifierRecord | null> {
    return PatientIdentifierModel.findOne({
      _id:
        toObjectId(
          identifierId,
          'identifierId',
        ),
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    })
      .select(
        includeNormalizedValue
          ? PATIENT_IDENTIFIER_INTERNAL_SELECT
          : PATIENT_IDENTIFIER_STANDARD_SELECT,
      )
      .lean<PatientIdentifierRecord>()
      .exec();
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
      .select(PATIENT_IDENTIFIER_STANDARD_SELECT)
      .lean<PatientIdentifierRecord>()
      .exec();
  }

  public async listForPatient(
    facilityId: string,
    patientId: string,
  ): Promise<PatientIdentifierRecord[]> {
    return PatientIdentifierModel.find({
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
    })
      .select(PATIENT_IDENTIFIER_STANDARD_SELECT)
      .sort({
        isPrimaryMrn:
          -1,
        isPrimaryIdentity:
          -1,
        createdAt:
          1,
      })
      .lean<PatientIdentifierRecord[]>()
      .exec();
  }

  public async findExactMatches(
    input: Readonly<{
      facilityId: string;
      identifiers: readonly Readonly<{
        identifierType: PatientIdentifierInput['identifierType'];
        value: string;
      }>[];
      excludePatientId?: string;
    }>,
  ): Promise<PatientIdentifierMatch[]> {
    if (input.identifiers.length === 0) {
      return [];
    }

    const filters =
      input.identifiers.map(
        (identifier) => ({
          identifierType:
            identifier.identifierType,
          scope:
            'ENTERPRISE' as const,
          issuingFacilityId:
            null,
          normalizedValue:
            normalizePatientIdentifier(
              identifier.identifierType,
              identifier.value,
            ),
        }),
      );

    const query:
      Record<string, unknown> = {
        status:
          'ACTIVE',
        $or:
          filters,
      };

    if (input.excludePatientId !== undefined) {
      query['patientId'] = {
        $ne:
          toObjectId(
            input.excludePatientId,
            'excludePatientId',
          ),
      };
    }

    const matches =
      await PatientIdentifierModel.find(query)
        .select(
          'patientId facilityId identifierType',
        )
        .lean<
          Array<
            Pick<
              PatientIdentifierRecord,
              | 'patientId'
              | 'facilityId'
              | 'identifierType'
            >
          >
        >()
        .exec();

    return matches.map(
      (match: Pick<
        PatientIdentifierRecord,
        | 'patientId'
        | 'facilityId'
        | 'identifierType'
      >) => ({
        patientId:
          match.patientId.toHexString(),
        facilityId:
          match.facilityId.toHexString(),
        identifierType:
          match.identifierType,
      }),
    );
  }

  public async findPatientByMrn(
    facilityId: string,
    mrn: string,
  ): Promise<string | null> {
    const normalizedValue =
      normalizePatientIdentifier(
        'MRN',
        mrn,
        'mrn',
      );

    const identifier =
      await PatientIdentifierModel.findOne({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
        issuingFacilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
        identifierType:
          'MRN',
        normalizedValue,
        status:
          'ACTIVE',
      })
        .select('patientId')
        .lean<Pick<
          PatientIdentifierRecord,
          'patientId'
        >>()
        .exec();

    return identifier?.patientId.toHexString() ??
      null;
  }

  public async verifyWithVersion(
    input: Readonly<{
      facilityId: string;
      identifierId: string;
      expectedVersion: number;
      verifiedBy: string;
      verifiedAt: Date;
    }>,
  ): Promise<PatientIdentifierRecord | null> {
    return PatientIdentifierModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.identifierId,
            'identifierId',
          ),
        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),
        version:
          input.expectedVersion,
        status:
          'ACTIVE',
      },
      {
        $set: {
          verificationStatus:
            'VERIFIED',
          verifiedAt:
            input.verifiedAt,
          verifiedBy:
            toObjectId(
              input.verifiedBy,
              'verifiedBy',
            ),
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
      .select(PATIENT_IDENTIFIER_STANDARD_SELECT)
      .lean<PatientIdentifierRecord>()
      .exec();
  }

  public async revokeWithVersion(
    input: Readonly<{
      facilityId: string;
      identifierId: string;
      expectedVersion: number;
      reason: string;
      actorUserId: string;
    }>,
  ): Promise<PatientIdentifierRecord | null> {
    return PatientIdentifierModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.identifierId,
            'identifierId',
          ),
        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),
        version:
          input.expectedVersion,
        status:
          'ACTIVE',
      },
      {
        $set: {
          status:
            'REVOKED',
          isPrimaryIdentity:
            false,
          isPrimaryMrn:
            false,
          statusReason:
            input.reason.trim(),
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
      .select(PATIENT_IDENTIFIER_STANDARD_SELECT)
      .lean<PatientIdentifierRecord>()
      .exec();
  }
}