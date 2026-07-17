import {
  Types,
} from 'mongoose';

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  PATIENT_DUPLICATE_MATCH_LEVEL,
  PATIENT_DUPLICATE_REASON,
} from '../patient.constants.js';

import {
  maskPatientIdentifier,
  normalizeCnic,
  normalizePakistanPhone,
} from '../patient.normalization.js';

import {
  PATIENT_IDENTIFIER_STANDARD_SELECT,
  patientAuditSnapshot,
} from '../patient.projections.js';

import {
  PatientRecordPolicy,
  PatientSensitiveRecordPolicy,
} from '../patient.policy.js';

import type {
  PatientDuplicateCheckInput,
  PatientRecord,
} from '../patient.types.js';

import {
  registerPatientBodySchema,
} from '../patient.validation.js';

import {
  MedicalRecordNumberService,
} from '../services/medical-record-number.service.js';

import {
  PatientDuplicateMatcherService,
} from '../services/patient-duplicate-matcher.service.js';

function patientRecord(
  overrides: Partial<PatientRecord> = {},
): PatientRecord {
  const now =
    new Date(
      '2026-07-17T10:00:00.000Z',
    );

  return {
    _id:
      new Types.ObjectId(
        '507f1f77bcf86cd799439011',
      ),
    facilityId:
      new Types.ObjectId(
        '507f191e810c19729de860ea',
      ),
    enterprisePatientId:
      'df813c04-c7a6-4e20-861c-95ea2f5d8044',
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
          '2015-04-02T00:00:00.000Z',
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
      true,
    guardianRequirement:
      'REQUIRED',
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
      0,
    createdBy:
      new Types.ObjectId(
        '507f191e810c19729de860eb',
      ),
    updatedBy:
      new Types.ObjectId(
        '507f191e810c19729de860eb',
      ),
    createdAt:
      now,
    updatedAt:
      now,
    ...overrides,
  };
}

function duplicateInput(): PatientDuplicateCheckInput {
  return {
    facilityId:
      '507f191e810c19729de860ea',
    firstName:
      'Ayesha',
    middleName:
      null,
    lastName:
      'Khan',
    birthDate: {
      value:
        '2015-04-02T00:00:00.000Z',
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
      true,
    identifiers:
      [],
    phones:
      [],
    guardianCnic:
      '3520212345671',
  };
}

describe(
  'patient and guardian Batch 2 foundation',
  () => {
    it(
      'normalizes Pakistan identity and contact values without retaining formatting',
      () => {
        expect(
          normalizeCnic(
            '35202-1234567-1',
          ),
        ).toBe(
          '3520212345671',
        );

        expect(
          normalizePakistanPhone(
            '0300-1234567',
          ),
        ).toBe(
          '+923001234567',
        );

        expect(
          maskPatientIdentifier(
            'CNIC',
            '3520212345671',
          ),
        ).toBe(
          '*********5671',
        );
      },
    );

    it(
      'requires guardian information for minor registration',
      () => {
        const result =
          registerPatientBodySchema.safeParse({
            firstName:
              'Ayesha',
            lastName:
              'Khan',
            birthDate: {
              value:
                '2015-04-02T00:00:00.000Z',
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
              true,
            sexAtBirth:
              'FEMALE',
          });

        expect(result.success).toBe(false);

        if (!result.success) {
          expect(
            result.error.issues.map(
              (issue) =>
                issue.path.join('.'),
            ),
          ).toEqual(
            expect.arrayContaining([
              'guardian',
              'guardianRelationship',
            ]),
          );
        }
      },
    );

    it(
      'does not expose normalized identifier values in the standard projection',
      () => {
        expect(
          PATIENT_IDENTIFIER_STANDARD_SELECT,
        ).not.toContain(
          'normalizedValue',
        );

        expect(
          patientAuditSnapshot(
            patientRecord(),
          ),
        ).not.toHaveProperty(
          'displayName',
        );
      },
    );

    it(
      'blocks an enterprise CNIC match without exposing cross-facility patient details',
      async () => {
        const service =
          new PatientDuplicateMatcherService(
            {
              findByIds:
                vi.fn()
                  .mockResolvedValue([]),
              findMatchingCandidates:
                vi.fn()
                  .mockResolvedValue([]),
            },
            {
              findExactMatches:
                vi.fn()
                  .mockResolvedValue([
                    {
                      patientId:
                        '507f1f77bcf86cd799439012',
                      facilityId:
                        '507f191e810c19729de860ff',
                      identifierType:
                        'CNIC',
                    },
                  ]),
              findPrimaryMrn:
                vi.fn()
                  .mockResolvedValue(null),
            },
            {
              findPatientIdsByGuardianCnic:
                vi.fn()
                  .mockResolvedValue([]),
            },
            {
              findPatientIdsByPhone:
                vi.fn()
                  .mockResolvedValue([]),
            },
          );

        const assessment =
          await service.assess({
            ...duplicateInput(),
            isMinor:
              false,
            guardianCnic:
              null,
            identifiers: [
              {
                identifierType:
                  'CNIC',
                value:
                  '35202-1234567-1',
                issuingCountryCode:
                  'PK',
              },
            ],
          });

        expect(assessment.blocked).toBe(true);
        expect(
          assessment.highestLevel,
        ).toBe(
          PATIENT_DUPLICATE_MATCH_LEVEL.BLOCK,
        );
        expect(
          assessment.candidates[0],
        ).toMatchObject({
          patientId:
            null,
          facilityId:
            null,
          displayName:
            null,
          mrn:
            null,
          crossFacility:
            true,
          reasons: [
            PATIENT_DUPLICATE_REASON.EXACT_CNIC,
          ],
        });
      },
    );

    it(
      'blocks a minor composite match using guardian, name, and birth date',
      async () => {
        const patient =
          patientRecord();

        const service =
          new PatientDuplicateMatcherService(
            {
              findByIds:
                vi.fn()
                  .mockResolvedValue([
                    patient,
                  ]),
              findMatchingCandidates:
                vi.fn()
                  .mockResolvedValue([
                    patient,
                  ]),
            },
            {
              findExactMatches:
                vi.fn()
                  .mockResolvedValue([]),
              findPrimaryMrn:
                vi.fn()
                  .mockResolvedValue({
                    displayValue:
                      'MAIN-2026-000001',
                  }),
            },
            {
              findPatientIdsByGuardianCnic:
                vi.fn()
                  .mockResolvedValue([
                    patient._id.toHexString(),
                  ]),
            },
            {
              findPatientIdsByPhone:
                vi.fn()
                  .mockResolvedValue([]),
            },
          );

        const assessment =
          await service.assess(
            duplicateInput(),
          );

        expect(assessment.blocked).toBe(true);
        expect(
          assessment.candidates[0],
        ).toMatchObject({
          patientId:
            patient._id.toHexString(),
          score:
            120,
          level:
            PATIENT_DUPLICATE_MATCH_LEVEL.BLOCK,
          reasons:
            expect.arrayContaining([
              PATIENT_DUPLICATE_REASON.SAME_GUARDIAN_CNIC,
              PATIENT_DUPLICATE_REASON.EXACT_NAME,
              PATIENT_DUPLICATE_REASON.EXACT_BIRTH_DATE,
            ]),
        });
      },
    );

    it(
      'allocates a concurrency-safe MRN using the facility local year',
      async () => {
        const next =
          vi.fn()
            .mockResolvedValue({
              key:
                'patient.mrn.2027',
              value:
                12,
            });

        const service =
          new MedicalRecordNumberService(
            {
              next,
            },
            {
              findContext:
                vi.fn()
                  .mockResolvedValue({
                    code:
                      'MAIN',
                    timezone:
                      'Asia/Karachi',
                    status:
                      'ACTIVE',
                  }),
            },
            () =>
              new Date(
                '2026-12-31T20:30:00.000Z',
              ),
          );

        const allocation =
          await service.allocate({
            facilityId:
              '507f191e810c19729de860ea',
          });

        expect(next).toHaveBeenCalledWith(
          '507f191e810c19729de860ea',
          'patient.mrn.2027',
        );
        expect(allocation).toMatchObject({
          year:
            2027,
          sequenceValue:
            12,
          mrn:
            'MAIN-2027-000012',
          normalizedMrn:
            'MAIN-2027-000012',
        });
      },
    );

    it(
      'enforces facility boundaries and sensitive-read permission',
      async () => {
        const ownPatient =
          patientRecord();

        const otherPatient =
          patientRecord({
            facilityId:
              new Types.ObjectId(
                '507f191e810c19729de860ff',
              ),
          });

        const principal = {
          userId:
            '507f191e810c19729de860eb',
          sessionId:
            'session-1',
          facilityId:
            '507f191e810c19729de860ea',
          accessTokenId:
            'access-1',
          tokenVersion:
            0,
          permissionVersion:
            0,
        };

        const request =
          {} as never;

        const standardPolicy =
          new PatientRecordPolicy();

        await expect(
          standardPolicy.evaluate({
            principal,
            record:
              ownPatient,
            request,
          }),
        ).resolves.toEqual({
          allowed:
            true,
        });

        await expect(
          standardPolicy.evaluate({
            principal,
            record:
              otherPatient,
            request,
          }),
        ).resolves.toMatchObject({
          allowed:
            false,
        });

        const authorization = {
          hasPermission:
            vi.fn()
              .mockResolvedValue(false),
        };

        const sensitivePolicy =
          new PatientSensitiveRecordPolicy(
            authorization as never,
          );

        await expect(
          sensitivePolicy.evaluate({
            principal,
            record:
              ownPatient,
            request,
          }),
        ).resolves.toMatchObject({
          allowed:
            false,
        });

        authorization.hasPermission
          .mockResolvedValue(true);

        await expect(
          sensitivePolicy.evaluate({
            principal,
            record:
              ownPatient,
            request,
          }),
        ).resolves.toEqual({
          allowed:
            true,
        });
      },
    );
  },
);