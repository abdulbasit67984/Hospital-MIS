import {
  PatientAddressModel,
  PatientAlertModel,
  PatientContactModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  maskEmailAddress,
  maskPhoneNumber,
  normalizeCountryCode,
  normalizeEmailAddress,
  normalizeOptionalText,
  normalizePakistanPhone,
  parseNullableDate,
} from '../patient.normalization.js';

import {
  PATIENT_ADDRESS_SENSITIVE_SELECT,
  PATIENT_ADDRESS_STANDARD_SELECT,
  PATIENT_ALERT_SENSITIVE_SELECT,
  PATIENT_ALERT_STANDARD_SELECT,
  PATIENT_CONTACT_INTERNAL_SELECT,
  PATIENT_CONTACT_STANDARD_SELECT,
} from '../patient.projections.js';

import type {
  CreatePatientAlertInput,
  UpdatePatientAddressInput,
  UpdatePatientContactInput,
} from '../patient-profile.mutation.types.js';

import type {
  PatientAddressInput,
  PatientAddressRecord,
  PatientAlertRecord,
  PatientContactInput,
  PatientContactRecord,
} from '../patient.types.js';

const PATIENT_CONTACT_MUTATION_SELECT = [
  PATIENT_CONTACT_INTERNAL_SELECT,
  'verifiedAt',
  'verifiedBy',
  'updatedBy',
].join(' ');

const PATIENT_ADDRESS_MUTATION_SELECT = [
  PATIENT_ADDRESS_SENSITIVE_SELECT,
  'updatedBy',
].join(' ');

const PATIENT_ALERT_MUTATION_SELECT = [
  PATIENT_ALERT_SENSITIVE_SELECT,
  'resolvedAt',
  'resolvedBy',
  'updatedBy',
].join(' ');

function normalizedContactValue(
  contactType: PatientContactRecord['contactType'],
  value: string,
): string {
  return contactType === 'PHONE'
    ? normalizePakistanPhone(
        value,
        'contact.value',
      )
    : normalizeEmailAddress(
        value,
        'contact.value',
      );
}

function maskedContactValue(
  contactType: PatientContactRecord['contactType'],
  normalizedValue: string,
): string {
  return contactType === 'PHONE'
    ? maskPhoneNumber(
        normalizedValue,
      )
    : maskEmailAddress(
        normalizedValue,
      );
}

export class PatientProfileRepository {
  public async createContact(
    input: PatientContactInput & Readonly<{
      facilityId: string;
      patientId: string;
      createdBy: string;
    }>,
  ): Promise<PatientContactRecord> {
    const normalizedValue =
      normalizedContactValue(
        input.contactType,
        input.value,
      );

    const created =
      await PatientContactModel.create({
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

        contactType:
          input.contactType,

        purpose:
          input.purpose,

        normalizedValue,

        displayValue:
          maskedContactValue(
            input.contactType,
            normalizedValue,
          ),

        contactName:
          normalizeOptionalText(
            input.contactName,
          ),

        relationshipToPatient:
          normalizeOptionalText(
            input.relationshipToPatient,
          ),

        relatedGuardianId:
          input.relatedGuardianId ===
            undefined ||
          input.relatedGuardianId === null
            ? null
            : toObjectId(
                input.relatedGuardianId,
                'relatedGuardianId',
              ),

        isPrimary:
          input.isPrimary ??
          false,

        isEmergencyContact:
          input.isEmergencyContact ??
          false,

        consentToContact:
          input.consentToContact ??
          true,

        isVerified:
          false,

        verifiedAt:
          null,

        verifiedBy:
          null,

        status:
          'ACTIVE',

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

    return created.toObject() as PatientContactRecord;
  }

  public async findContactById(
    facilityId: string,
    contactId: string,
    includeNormalizedValue = false,
  ): Promise<PatientContactRecord | null> {
    return PatientContactModel.findOne({
      _id:
        toObjectId(
          contactId,
          'contactId',
        ),

      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    })
      .select(
        includeNormalizedValue
          ? PATIENT_CONTACT_MUTATION_SELECT
          : PATIENT_CONTACT_STANDARD_SELECT,
      )
      .lean<PatientContactRecord>()
      .exec();
  }

  public async updateContactWithVersion(
    input: Readonly<{
      facilityId: string;
      contactId: string;
      update: UpdatePatientContactInput;
      actorUserId: string;
    }>,
  ): Promise<PatientContactRecord | null> {
    const existing =
      await this.findContactById(
        input.facilityId,
        input.contactId,
        true,
      );

    if (existing === null) {
      return null;
    }

    const resultingType =
      input.update.contactType ??
      existing.contactType;

    const valueChanged =
      input.update.value !== undefined ||
      input.update.contactType !== undefined;

    const resultingNormalizedValue =
      valueChanged
        ? normalizedContactValue(
            resultingType,
            input.update.value ??
              existing.normalizedValue,
          )
        : existing.normalizedValue;

    const setValues:
      Record<string, unknown> = {
        updatedBy:
          toObjectId(
            input.actorUserId,
            'actorUserId',
          ),
      };

    if (
      input.update.contactType !==
      undefined
    ) {
      setValues['contactType'] =
        resultingType;
    }

    if (
      input.update.purpose !==
      undefined
    ) {
      setValues['purpose'] =
        input.update.purpose;
    }

    if (valueChanged) {
      setValues['normalizedValue'] =
        resultingNormalizedValue;

      setValues['displayValue'] =
        maskedContactValue(
          resultingType,
          resultingNormalizedValue,
        );

      setValues['isVerified'] =
        false;

      setValues['verifiedAt'] =
        null;

      setValues['verifiedBy'] =
        null;
    }

    if (
      input.update.contactName !==
      undefined
    ) {
      setValues['contactName'] =
        normalizeOptionalText(
          input.update.contactName,
        );
    }

    if (
      input.update.relationshipToPatient !==
      undefined
    ) {
      setValues['relationshipToPatient'] =
        normalizeOptionalText(
          input.update.relationshipToPatient,
        );
    }

    if (
      input.update.relatedGuardianId !==
      undefined
    ) {
      setValues['relatedGuardianId'] =
        input.update.relatedGuardianId ===
        null
          ? null
          : toObjectId(
              input.update.relatedGuardianId,
              'relatedGuardianId',
            );
    }

    if (
      input.update.isPrimary !==
      undefined
    ) {
      setValues['isPrimary'] =
        input.update.isPrimary;
    }

    if (
      input.update.isEmergencyContact !==
      undefined
    ) {
      setValues['isEmergencyContact'] =
        input.update.isEmergencyContact;
    }

    if (
      input.update.consentToContact !==
      undefined
    ) {
      setValues['consentToContact'] =
        input.update.consentToContact;
    }

    return PatientContactModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.contactId,
            'contactId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.update.expectedVersion,

        status:
          'ACTIVE',
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
      .select(
        PATIENT_CONTACT_MUTATION_SELECT,
      )
      .lean<PatientContactRecord>()
      .exec();
  }

  public async verifyContactWithVersion(
    input: Readonly<{
      facilityId: string;
      contactId: string;
      expectedVersion: number;
      verifiedBy: string;
      verifiedAt: Date;
    }>,
  ): Promise<PatientContactRecord | null> {
    return PatientContactModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.contactId,
            'contactId',
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
          isVerified:
            true,

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
      .select(
        PATIENT_CONTACT_MUTATION_SELECT,
      )
      .lean<PatientContactRecord>()
      .exec();
  }

  public async deactivateContactWithVersion(
    input: Readonly<{
      facilityId: string;
      contactId: string;
      expectedVersion: number;
      actorUserId: string;
    }>,
  ): Promise<PatientContactRecord | null> {
    return PatientContactModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.contactId,
            'contactId',
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
            'INACTIVE',

          isPrimary:
            false,

          isEmergencyContact:
            false,

          consentToContact:
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
        PATIENT_CONTACT_MUTATION_SELECT,
      )
      .lean<PatientContactRecord>()
      .exec();
  }

  public async createAddress(
    input: PatientAddressInput & Readonly<{
      facilityId: string;
      patientId: string;
      createdBy: string;
    }>,
  ): Promise<PatientAddressRecord> {
    const created =
      await PatientAddressModel.create({
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

        addressType:
          input.addressType,

        line1:
          input.line1
            .normalize('NFKC')
            .trim(),

        line2:
          normalizeOptionalText(
            input.line2,
          ),

        landmark:
          normalizeOptionalText(
            input.landmark,
          ),

        city:
          input.city
            .normalize('NFKC')
            .trim(),

        district:
          normalizeOptionalText(
            input.district,
          ),

        province:
          normalizeOptionalText(
            input.province,
          ),

        postalCode:
          normalizeOptionalText(
            input.postalCode,
          ),

        countryCode:
          normalizeCountryCode(
            input.countryCode,
            'address.countryCode',
          ),

        isPrimary:
          input.isPrimary ??
          false,

        validFrom:
          parseNullableDate(
            input.validFrom,
            'address.validFrom',
          ),

        validTo:
          parseNullableDate(
            input.validTo,
            'address.validTo',
          ),

        status:
          'ACTIVE',

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

    return created.toObject() as PatientAddressRecord;
  }

  public async findAddressById(
    facilityId: string,
    addressId: string,
    includeSensitive = false,
  ): Promise<PatientAddressRecord | null> {
    return PatientAddressModel.findOne({
      _id:
        toObjectId(
          addressId,
          'addressId',
        ),

      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    })
      .select(
        includeSensitive
          ? PATIENT_ADDRESS_MUTATION_SELECT
          : PATIENT_ADDRESS_STANDARD_SELECT,
      )
      .lean<PatientAddressRecord>()
      .exec();
  }

  public async updateAddressWithVersion(
    input: Readonly<{
      facilityId: string;
      addressId: string;
      update: UpdatePatientAddressInput;
      actorUserId: string;
    }>,
  ): Promise<PatientAddressRecord | null> {
    const setValues:
      Record<string, unknown> = {
        updatedBy:
          toObjectId(
            input.actorUserId,
            'actorUserId',
          ),
      };

    if (
      input.update.addressType !==
      undefined
    ) {
      setValues['addressType'] =
        input.update.addressType;
    }

    if (
      input.update.line1 !==
      undefined
    ) {
      setValues['line1'] =
        input.update.line1
          .normalize('NFKC')
          .trim();
    }

    for (
      const field of [
        'line2',
        'landmark',
        'district',
        'province',
        'postalCode',
      ] as const
    ) {
      if (
        input.update[field] !==
        undefined
      ) {
        setValues[field] =
          normalizeOptionalText(
            input.update[field],
          );
      }
    }

    if (
      input.update.city !==
      undefined
    ) {
      setValues['city'] =
        input.update.city
          .normalize('NFKC')
          .trim();
    }

    if (
      input.update.countryCode !==
      undefined
    ) {
      setValues['countryCode'] =
        normalizeCountryCode(
          input.update.countryCode,
          'address.countryCode',
        );
    }

    if (
      input.update.isPrimary !==
      undefined
    ) {
      setValues['isPrimary'] =
        input.update.isPrimary;
    }

    if (
      input.update.validFrom !==
      undefined
    ) {
      setValues['validFrom'] =
        parseNullableDate(
          input.update.validFrom,
          'address.validFrom',
        );
    }

    if (
      input.update.validTo !==
      undefined
    ) {
      setValues['validTo'] =
        parseNullableDate(
          input.update.validTo,
          'address.validTo',
        );
    }

    return PatientAddressModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.addressId,
            'addressId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.update.expectedVersion,

        status:
          'ACTIVE',
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
      .select(
        PATIENT_ADDRESS_MUTATION_SELECT,
      )
      .lean<PatientAddressRecord>()
      .exec();
  }

  public async deactivateAddressWithVersion(
    input: Readonly<{
      facilityId: string;
      addressId: string;
      expectedVersion: number;
      actorUserId: string;
    }>,
  ): Promise<PatientAddressRecord | null> {
    return PatientAddressModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.addressId,
            'addressId',
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
            'INACTIVE',

          isPrimary:
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
        PATIENT_ADDRESS_MUTATION_SELECT,
      )
      .lean<PatientAddressRecord>()
      .exec();
  }

  public async createAlert(
    input: CreatePatientAlertInput & Readonly<{
      facilityId: string;
      patientId: string;
      createdBy: string;
      defaultEffectiveFrom: Date;
    }>,
  ): Promise<PatientAlertRecord> {
    const created =
      await PatientAlertModel.create({
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

        alertType:
          input.alertType,

        severity:
          input.severity,

        visibility:
          input.visibility,

        title:
          input.title
            .normalize('NFKC')
            .trim(),

        details:
          input.details
            .normalize('NFKC')
            .trim(),

        effectiveFrom:
          input.effectiveFrom ===
          undefined
            ? input.defaultEffectiveFrom
            : parseNullableDate(
                input.effectiveFrom,
                'alert.effectiveFrom',
              ) ??
              input.defaultEffectiveFrom,

        effectiveTo:
          parseNullableDate(
            input.effectiveTo,
            'alert.effectiveTo',
          ),

        status:
          'ACTIVE',

        resolvedAt:
          null,

        resolvedBy:
          null,

        resolutionReason:
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

    return created.toObject() as PatientAlertRecord;
  }

  public async findAlertById(
    facilityId: string,
    alertId: string,
    includeDetails = false,
  ): Promise<PatientAlertRecord | null> {
    return PatientAlertModel.findOne({
      _id:
        toObjectId(
          alertId,
          'alertId',
        ),

      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    })
      .select(
        includeDetails
          ? PATIENT_ALERT_MUTATION_SELECT
          : PATIENT_ALERT_STANDARD_SELECT,
      )
      .lean<PatientAlertRecord>()
      .exec();
  }

  public async resolveAlertWithVersion(
    input: Readonly<{
      facilityId: string;
      alertId: string;
      expectedVersion: number;
      resolutionReason: string;
      resolvedBy: string;
      resolvedAt: Date;
    }>,
  ): Promise<PatientAlertRecord | null> {
    return PatientAlertModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.alertId,
            'alertId',
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
            'RESOLVED',

          resolvedAt:
            input.resolvedAt,

          resolvedBy:
            toObjectId(
              input.resolvedBy,
              'resolvedBy',
            ),

          resolutionReason:
            input.resolutionReason
              .normalize('NFKC')
              .trim(),

          updatedBy:
            toObjectId(
              input.resolvedBy,
              'resolvedBy',
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
        PATIENT_ALERT_MUTATION_SELECT,
      )
      .lean<PatientAlertRecord>()
      .exec();
  }

  public async findPatientIdsByPhone(
    facilityId: string,
    phones: readonly string[],
    excludePatientId?: string,
  ): Promise<string[]> {
    if (phones.length === 0) {
      return [];
    }

    const normalizedPhones = [
      ...new Set(
        phones.map(
          (phone) =>
            normalizePakistanPhone(
              phone,
              'phones',
            ),
        ),
      ),
    ];

    const query:
      Record<string, unknown> = {
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        contactType:
          'PHONE',

        normalizedValue: {
          $in:
            normalizedPhones,
        },

        status:
          'ACTIVE',
      };

    if (
      excludePatientId !== undefined
    ) {
      query['patientId'] = {
        $ne:
          toObjectId(
            excludePatientId,
            'excludePatientId',
          ),
      };
    }

    const contacts =
      await PatientContactModel.find(query)
        .select('patientId')
        .lean<
          Array<
            Pick<
              PatientContactRecord,
              'patientId'
            >
          >
        >()
        .exec();

    return [
      ...new Set(
        contacts.map(
          (contact) =>
            contact.patientId.toHexString(),
        ),
      ),
    ];
  }

  public async listContacts(
    facilityId: string,
    patientId: string,
    includeNormalizedValue = false,
  ): Promise<PatientContactRecord[]> {
    return PatientContactModel.find({
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

      status:
        'ACTIVE',
    })
      .select(
        includeNormalizedValue
          ? PATIENT_CONTACT_MUTATION_SELECT
          : PATIENT_CONTACT_STANDARD_SELECT,
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
      .exec();
  }

  public async listAddresses(
    facilityId: string,
    patientId: string,
    includeSensitive = false,
  ): Promise<PatientAddressRecord[]> {
    return PatientAddressModel.find({
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

      status:
        'ACTIVE',
    })
      .select(
        includeSensitive
          ? PATIENT_ADDRESS_MUTATION_SELECT
          : PATIENT_ADDRESS_STANDARD_SELECT,
      )
      .sort({
        isPrimary:
          -1,

        createdAt:
          1,
      })
      .lean<PatientAddressRecord[]>()
      .exec();
  }

  public async listActiveAlerts(
    facilityId: string,
    patientId: string,
    includeDetails = false,
    at = new Date(),
  ): Promise<PatientAlertRecord[]> {
    return PatientAlertModel.find({
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

      status:
        'ACTIVE',

      effectiveFrom: {
        $lte:
          at,
      },

      $or: [
        {
          effectiveTo:
            null,
        },
        {
          effectiveTo: {
            $gt:
              at,
          },
        },
      ],
    })
      .select(
        includeDetails
          ? PATIENT_ALERT_MUTATION_SELECT
          : PATIENT_ALERT_STANDARD_SELECT,
      )
      .sort({
        severity:
          -1,

        effectiveFrom:
          -1,
      })
      .lean<PatientAlertRecord[]>()
      .exec();
  }
}