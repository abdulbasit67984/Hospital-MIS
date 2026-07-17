import {
  Types,
} from 'mongoose';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  toPatientProfileDto,
  toPatientSearchItemDto,
} from '../patient.query.mapper.js';

import type {
  PatientProfileRecords,
  PatientSearchCandidateRecord,
} from '../patient.query.types.js';

const facilityId =
  new Types.ObjectId(
    '507f191e810c19729de860ea',
  );

const patientId =
  new Types.ObjectId(
    '507f1f77bcf86cd799439011',
  );

const now =
  new Date(
    '2026-07-18T10:00:00.000Z',
  );

function records():
  PatientProfileRecords {
  const patient = {
    _id:
      patientId,
    facilityId,
    enterprisePatientId:
      'enterprise-patient-1',
    canonicalPatientId:
      null,
    firstName:
      'Ayesha',
    middleName:
      null,
    lastName:
      'Khan',
    preferredName:
      null,
    displayName:
      'Ayesha Khan',
    normalizedFullName:
      'ayesha khan',
    nameSearchTokens: [
      'ayesha',
      'khan',
    ],
    localizedNames:
      [],
    birthDate: {
      value:
        new Date(
          '1990-05-10T00:00:00.000Z',
        ),
      precision:
        'EXACT',
      isApproximate:
        false,
      estimatedAgeYears:
        null,
      estimatedAsOfDate:
        null,
    },
    isMinor:
      false,
    guardianRequirement:
      'NOT_REQUIRED',
    sexAtBirth:
      'FEMALE',
    genderIdentity:
      'NOT_DISCLOSED',
    genderDescription:
      null,
    preferredLocale:
      'en-PK',
    nationalityCountryCode:
      'PK',
    status:
      'ACTIVE',
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
    deceasedAt:
      null,
    statusReason:
      null,
    identityReviewRequired:
      false,
    duplicateReviewRequired:
      false,
    registrationSource:
      'RECEPTION',
    registeredAt:
      now,
    schemaVersion:
      1,
    version:
      2,
    createdBy:
      null,
    updatedBy:
      null,
    createdAt:
      now,
    updatedAt:
      now,
  } as PatientProfileRecords['patient'];

  const mrn = {
    _id:
      new Types.ObjectId(),
    facilityId,
    patientId,
    issuingFacilityId:
      facilityId,
    identifierType:
      'MRN',
    scope:
      'FACILITY',
    normalizedValue:
      'MAIN-2026-000001',
    displayValue:
      'MAIN-2026-000001',
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
      null,
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
    schemaVersion:
      1,
    version:
      0,
    createdBy:
      null,
    updatedBy:
      null,
    createdAt:
      now,
    updatedAt:
      now,
  } as PatientProfileRecords['identifiers'][number];

  const cnic = {
    ...mrn,
    _id:
      new Types.ObjectId(),
    identifierType:
      'CNIC',
    scope:
      'ENTERPRISE',
    normalizedValue:
      '3520212345671',
    displayValue:
      '*********5671',
    isPrimaryIdentity:
      true,
    isPrimaryMrn:
      false,
  } as PatientProfileRecords['identifiers'][number];

  const contact = {
    _id:
      new Types.ObjectId(),
    facilityId,
    patientId,
    contactType:
      'PHONE',
    purpose:
      'PRIMARY',
    normalizedValue:
      '+923001234567',
    displayValue:
      '*********4567',
    contactName:
      null,
    relationshipToPatient:
      null,
    relatedGuardianId:
      null,
    isPrimary:
      true,
    isEmergencyContact:
      false,
    consentToContact:
      true,
    isVerified:
      true,
    verifiedAt:
      now,
    verifiedBy:
      null,
    status:
      'ACTIVE',
    schemaVersion:
      1,
    version:
      0,
    createdBy:
      null,
    updatedBy:
      null,
    createdAt:
      now,
    updatedAt:
      now,
  } as PatientProfileRecords['contacts'][number];

  const restrictedAlert = {
    _id:
      new Types.ObjectId(),
    facilityId,
    patientId,
    alertType:
      'LEGAL',
    severity:
      'CRITICAL',
    visibility:
      'RESTRICTED',
    title:
      'Restricted disclosure',
    details:
      'Confidential legal instructions',
    effectiveFrom:
      now,
    effectiveTo:
      null,
    status:
      'ACTIVE',
    resolvedAt:
      null,
    resolvedBy:
      null,
    resolutionReason:
      null,
    schemaVersion:
      1,
    version:
      0,
    createdBy:
      null,
    updatedBy:
      null,
    createdAt:
      now,
    updatedAt:
      now,
  } as PatientProfileRecords['alerts'][number];

  return {
    patient,
    identifiers: [
      mrn,
      cnic,
    ],
    contacts: [
      contact,
    ],
    addresses:
      [],
    guardianRelationships:
      [],
    guardians:
      [],
    alerts: [
      restrictedAlert,
    ],
  };
}

describe(
  'patient query mapping',
  () => {
    it(
      'masks identifiers, contacts, birth date, and restricted alerts for standard access',
      () => {
        const source =
          records();

        const profile =
          toPatientProfileDto(
            source,
            {
              accessLevel:
                'STANDARD',
              canonicalization: {
                requestedPatientId:
                  patientId.toHexString(),
                canonicalPatientId:
                  patientId.toHexString(),
                canonicalEnterprisePatientId:
                  'enterprise-patient-1',
                canonicalStatus:
                  'ACTIVE',
                redirected:
                  false,
                redirectPath: [
                  patientId.toHexString(),
                ],
              },
              now,
            },
          );

        expect(
          profile.patient.birth.value,
        ).toBeNull();

        expect(
          profile.identifiers[1]?.value,
        ).toBe(
          '*********5671',
        );

        expect(
          profile.contacts[0]?.value,
        ).toBe(
          '*********4567',
        );

        expect(
          profile.alerts,
        ).toEqual([]);
      },
    );

    it(
      'returns sensitive values only for sensitive access',
      () => {
        const source =
          records();

        const profile =
          toPatientProfileDto(
            source,
            {
              accessLevel:
                'SENSITIVE',
              canonicalization: {
                requestedPatientId:
                  patientId.toHexString(),
                canonicalPatientId:
                  patientId.toHexString(),
                canonicalEnterprisePatientId:
                  'enterprise-patient-1',
                canonicalStatus:
                  'ACTIVE',
                redirected:
                  false,
                redirectPath: [
                  patientId.toHexString(),
                ],
              },
              now,
            },
          );

        expect(
          profile.identifiers[1]?.value,
        ).toBe(
          '3520212345671',
        );

        expect(
          profile.contacts[0]?.value,
        ).toBe(
          '+923001234567',
        );

        expect(
          profile.alerts[0]?.details,
        ).toBe(
          'Confidential legal instructions',
        );
      },
    );

    it(
      'maps canonicalized search results without exposing the matched identity value',
      () => {
        const source =
          records();

        const candidate = {
          patient:
            source.patient,
          primaryMrn:
            source.identifiers[0]!,
          primaryContact:
            source.contacts[0]!,
          matchedBy: [
            'CNIC',
          ],
          activeAlertCount:
            1,
          highestAlertSeverity:
            'CRITICAL',
        } satisfies PatientSearchCandidateRecord;

        const item =
          toPatientSearchItemDto(
            candidate,
            {
              accessLevel:
                'STANDARD',
              now,
              redirectedFromPatientIds: [
                '507f1f77bcf86cd799439099',
              ],
            },
          );

        expect(item.matchedBy).toEqual([
          'CNIC',
        ]);

        expect(
          JSON.stringify(item),
        ).not.toContain(
          '3520212345671',
        );
      },
    );
  },
);