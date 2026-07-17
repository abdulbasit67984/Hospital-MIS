import {
  Types,
} from 'mongoose';

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type {
  PatientSensitiveSnapshotCryptoPort,
  PatientTransactionRequest,
} from '../patient.ports.js';

import type {
  GuardianRecord,
  PatientGuardianRecord,
  PatientIdentifierRecord,
  PatientRecord,
} from '../patient.types.js';

import {
  AddPatientIdentifierWorkflow,
  RevokePatientIdentifierWorkflow,
  VerifyPatientIdentifierWorkflow,
} from '../workflows/patient-identifier.workflows.js';

import {
  LinkPatientGuardianWorkflow,
  VerifyPatientGuardianWorkflow,
} from '../workflows/patient-guardian.workflows.js';

const facilityId =
  '507f191e810c19729de860ea';

const actorUserId =
  '507f191e810c19729de860eb';

const patientId =
  '507f1f77bcf86cd799439011';

const guardianId =
  '507f1f77bcf86cd799439012';

const identifierId =
  '507f1f77bcf86cd799439013';

const relationshipId =
  '507f1f77bcf86cd799439014';

const now =
  new Date(
    '2026-07-17T10:00:00.000Z',
  );

function snapshotCrypto():
  PatientSensitiveSnapshotCryptoPort {
  return {
    protect:
      vi.fn()
        .mockReturnValue({
          encryptedValue: {
            algorithm:
              'AES-256-GCM',

            keyVersion:
              'test',

            initializationVector:
              Buffer.alloc(12)
                .toString('base64'),

            authenticationTag:
              Buffer.alloc(16)
                .toString('base64'),

            ciphertext:
              Buffer.from('encrypted')
                .toString('base64'),
          },

          valueHash:
            'a'.repeat(64),
        }),

    unprotect:
      vi.fn(),

    hash:
      vi.fn()
        .mockReturnValue(
          'a'.repeat(64),
        ),

    matchesHash:
      vi.fn()
        .mockReturnValue(true),

    needsRotation:
      vi.fn()
        .mockReturnValue(false),
  };
}

function transactionManager() {
  const compensations:
    Array<Record<string, unknown>> = [];

  return {
    compensations,

    manager: {
      execute:
        vi.fn(
          async <T>(
            request: PatientTransactionRequest<T>,
          ): Promise<T> =>
            request.execute({
              transactionId:
                'transaction-1',

              idempotencyKey:
                request.idempotencyKey,

              checkpoint:
                vi.fn()
                  .mockResolvedValue(undefined),

              registerCompensation:
                async (
                  compensation,
                ) => {
                  compensations.push(
                    compensation.payload,
                  );
                },
            }),
        ),
    },
  };
}

function patient(): PatientRecord {
  return {
    _id:
      new Types.ObjectId(
        patientId,
      ),

    facilityId:
      new Types.ObjectId(
        facilityId,
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
        actorUserId,
      ),

    updatedBy:
      new Types.ObjectId(
        actorUserId,
      ),

    createdAt:
      now,

    updatedAt:
      now,
  };
}

function guardian(
  hasCnic = true,
): GuardianRecord {
  return {
    _id:
      new Types.ObjectId(
        guardianId,
      ),

    facilityId:
      new Types.ObjectId(
        facilityId,
      ),

    enterpriseGuardianId:
      'e609594c-38b5-42b8-b028-8368cc550fe7',

    firstName:
      'Sara',

    middleName:
      null,

    lastName:
      'Khan',

    displayName:
      'Sara Khan',

    normalizedFullName:
      'sara khan',

    localizedNames:
      [],

    cnicNormalized:
      hasCnic
        ? '3520212345671'
        : null,

    cnicDisplayValue:
      hasCnic
        ? '*********5671'
        : null,

    dateOfBirth:
      null,

    sexAtBirth:
      'FEMALE',

    genderIdentity:
      'NOT_DISCLOSED',

    phoneNormalized:
      null,

    phoneDisplayValue:
      null,

    emailNormalized:
      null,

    address: {
      line1:
        null,

      line2:
        null,

      city:
        null,

      district:
        null,

      province:
        null,

      postalCode:
        null,

      countryCode:
        'PK',
    },

    preferredLocale:
      'en-PK',

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

    schemaVersion:
      1,

    version:
      0,

    createdBy:
      new Types.ObjectId(
        actorUserId,
      ),

    updatedBy:
      new Types.ObjectId(
        actorUserId,
      ),

    createdAt:
      now,

    updatedAt:
      now,
  };
}

function identifier(
  overrides:
    Partial<PatientIdentifierRecord> = {},
): PatientIdentifierRecord {
  return {
    _id:
      new Types.ObjectId(
        identifierId,
      ),

    facilityId:
      new Types.ObjectId(
        facilityId,
      ),

    patientId:
      new Types.ObjectId(
        patientId,
      ),

    issuingFacilityId:
      null,

    identifierType:
      'CNIC',

    scope:
      'ENTERPRISE',

    normalizedValue:
      '3520212345671',

    displayValue:
      '*********5671',

    issuingCountryCode:
      'PK',

    issuingAuthority:
      null,

    isPrimaryIdentity:
      true,

    isPrimaryMrn:
      false,

    verificationStatus:
      'UNVERIFIED',

    verifiedAt:
      null,

    verifiedBy:
      null,

    validFrom:
      null,

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
      new Types.ObjectId(
        actorUserId,
      ),

    updatedBy:
      new Types.ObjectId(
        actorUserId,
      ),

    createdAt:
      now,

    updatedAt:
      now,

    ...overrides,
  };
}

function relationship(
  overrides:
    Partial<PatientGuardianRecord> = {},
): PatientGuardianRecord {
  return {
    _id:
      new Types.ObjectId(
        relationshipId,
      ),

    facilityId:
      new Types.ObjectId(
        facilityId,
      ),

    patientId:
      new Types.ObjectId(
        patientId,
      ),

    guardianId:
      new Types.ObjectId(
        guardianId,
      ),

    relationshipType:
      'MOTHER',

    relationshipDescription:
      null,

    isPrimary:
      true,

    isEmergencyContact:
      true,

    livesWithPatient:
      true,

    isFinanciallyResponsible:
      false,

    legalAuthorityStatus:
      'DECLARED',

    canConsentToTreatment:
      true,

    canConsentToDisclosure:
      true,

    canReceiveClinicalInformation:
      true,

    authorityBasis:
      'Parent',

    authorityEffectiveFrom:
      null,

    authorityEffectiveTo:
      null,

    verificationStatus:
      'UNVERIFIED',

    verifiedAt:
      null,

    verifiedBy:
      null,

    verificationNotes:
      null,

    supportingAttachmentIds:
      [],

    isActive:
      true,

    endedAt:
      null,

    endedBy:
      null,

    endReason:
      null,

    schemaVersion:
      1,

    version:
      0,

    createdBy:
      new Types.ObjectId(
        actorUserId,
      ),

    updatedBy:
      new Types.ObjectId(
        actorUserId,
      ),

    createdAt:
      now,

    updatedAt:
      now,

    ...overrides,
  };
}

const actor = {
  userId:
    actorUserId,

  facilityId,

  correlationId:
    'correlation-1',
};

describe(
  'patient identifier and guardian relationship workflows',
  () => {
    it(
      'adds an identifier with delete compensation and without exposing its normalized value',
      async () => {
        const transaction =
          transactionManager();

        const created =
          identifier();

        const workflow =
          new AddPatientIdentifierWorkflow(
            {
              findById:
                vi.fn()
                  .mockResolvedValue(
                    patient(),
                  ),
            } as never,

            {
              findExactMatches:
                vi.fn()
                  .mockResolvedValue([]),

              createIdentity:
                vi.fn()
                  .mockResolvedValue(
                    created,
                  ),
            } as never,

            {
              transactionManager:
                transaction.manager as never,

              audit: {
                append:
                  vi.fn()
                    .mockResolvedValue(undefined),
              },

              outbox: {
                enqueue:
                  vi.fn()
                    .mockResolvedValue(undefined),
              },

              clock: {
                now:
                  () => now,
              },

              snapshotCrypto:
                snapshotCrypto(),
            },
          );

        const result =
          await workflow.execute({
            patientId,

            input: {
              identifierType:
                'CNIC',

              value:
                '35202-1234567-1',

              issuingCountryCode:
                'PK',

              isPrimaryIdentity:
                true,
            },

            actor,

            idempotencyKey:
              'add-identifier-1',
          });

        expect(result).toMatchObject({
          identifierType:
            'CNIC',

          displayValue:
            '*********5671',
        });

        expect(
          JSON.stringify(result),
        ).not.toContain(
          '3520212345671',
        );

        expect(
          transaction.compensations,
        ).toEqual([
          expect.objectContaining({
            entityId:
              identifierId,

            expectedVersion:
              0,
          }),
        ]);
      },
    );

    it(
      'verifies and revokes identifiers using encrypted restore compensations',
      async () => {
        const current =
          identifier();

        const verified =
          identifier({
            verificationStatus:
              'VERIFIED',

            verifiedAt:
              now,

            verifiedBy:
              new Types.ObjectId(
                actorUserId,
              ),

            version:
              1,
          });

        const verifyTransaction =
          transactionManager();

        const verifyWorkflow =
          new VerifyPatientIdentifierWorkflow(
            {
              findById:
                vi.fn()
                  .mockResolvedValue(
                    current,
                  ),

              verifyWithVersion:
                vi.fn()
                  .mockResolvedValue(
                    verified,
                  ),
            } as never,

            {
              transactionManager:
                verifyTransaction.manager as never,

              audit: {
                append:
                  vi.fn()
                    .mockResolvedValue(undefined),
              },

              outbox: {
                enqueue:
                  vi.fn()
                    .mockResolvedValue(undefined),
              },

              clock: {
                now:
                  () => now,
              },

              snapshotCrypto:
                snapshotCrypto(),
            },
          );

        const verifyResult =
          await verifyWorkflow.execute({
            identifierId,

            expectedVersion:
              0,

            reason:
              'Identity document reviewed',

            actor,

            idempotencyKey:
              'verify-identifier-1',
          });

        expect(
          verifyResult.verificationStatus,
        ).toBe(
          'VERIFIED',
        );

        expect(
          JSON.stringify(
            verifyTransaction.compensations,
          ),
        ).not.toContain(
          '3520212345671',
        );

        const revoked =
          identifier({
            status:
              'REVOKED',

            verificationStatus:
              'VERIFIED',

            version:
              2,
          });

        const revokeTransaction =
          transactionManager();

        const revokeWorkflow =
          new RevokePatientIdentifierWorkflow(
            {
              findById:
                vi.fn()
                  .mockResolvedValue(
                    verified,
                  ),

              revokeWithVersion:
                vi.fn()
                  .mockResolvedValue(
                    revoked,
                  ),
            } as never,

            {
              transactionManager:
                revokeTransaction.manager as never,

              audit: {
                append:
                  vi.fn()
                    .mockResolvedValue(undefined),
              },

              outbox: {
                enqueue:
                  vi.fn()
                    .mockResolvedValue(undefined),
              },

              clock: {
                now:
                  () => now,
              },

              snapshotCrypto:
                snapshotCrypto(),
            },
          );

        const revokeResult =
          await revokeWorkflow.execute({
            identifierId,

            expectedVersion:
              1,

            reason:
              'Identity replaced',

            actor,

            idempotencyKey:
              'revoke-identifier-1',
          });

        expect(
          revokeResult.status,
        ).toBe(
          'REVOKED',
        );

        expect(
          JSON.stringify(
            revokeTransaction.compensations,
          ),
        ).not.toContain(
          '3520212345671',
        );
      },
    );

    it(
      'requires guardian CNIC when linking a guardian to a minor',
      async () => {
        const workflow =
          new LinkPatientGuardianWorkflow(
            {
              findById:
                vi.fn()
                  .mockResolvedValue(
                    patient(),
                  ),
            } as never,

            {
              findById:
                vi.fn()
                  .mockResolvedValue(
                    guardian(false),
                  ),
            } as never,

            {
              transactionManager:
                {} as never,

              audit:
                {} as never,

              outbox:
                {} as never,

              clock: {
                now:
                  () => now,
              },

              snapshotCrypto:
                snapshotCrypto(),
            },
          );

        await expect(
          workflow.execute({
            patientId,

            guardianId,

            input: {
              relationshipType:
                'MOTHER',

              isPrimary:
                true,
            },

            actor,

            idempotencyKey:
              'link-guardian-1',
          }),
        ).rejects.toMatchObject({
          code:
            'CONFLICT',
        });
      },
    );

    it(
      'verifies guardian legal authority with encrypted recovery state',
      async () => {
        const current =
          relationship();

        const verified =
          relationship({
            legalAuthorityStatus:
              'VERIFIED',

            verificationStatus:
              'VERIFIED',

            verifiedAt:
              now,

            verifiedBy:
              new Types.ObjectId(
                actorUserId,
              ),

            verificationNotes:
              'Documents reviewed',

            version:
              1,
          });

        const transaction =
          transactionManager();

        const workflow =
          new VerifyPatientGuardianWorkflow(
            {
              findById:
                vi.fn()
                  .mockResolvedValue(
                    current,
                  ),

              verifyWithVersion:
                vi.fn()
                  .mockResolvedValue(
                    verified,
                  ),
            } as never,

            {
              transactionManager:
                transaction.manager as never,

              audit: {
                append:
                  vi.fn()
                    .mockResolvedValue(undefined),
              },

              outbox: {
                enqueue:
                  vi.fn()
                    .mockResolvedValue(undefined),
              },

              clock: {
                now:
                  () => now,
              },

              snapshotCrypto:
                snapshotCrypto(),
            },
          );

        const result =
          await workflow.execute({
            relationshipId,

            expectedVersion:
              0,

            reason:
              'Legal authority confirmed',

            verificationNotes:
              'Documents reviewed',

            actor,

            idempotencyKey:
              'verify-guardian-1',
          });

        expect(result).toMatchObject({
          legalAuthorityStatus:
            'VERIFIED',

          verificationStatus:
            'VERIFIED',

          version:
            1,
        });

        const compensation =
          JSON.stringify(
            transaction.compensations,
          );

        expect(
          compensation,
        ).toContain(
          'ciphertext',
        );

        expect(
          compensation,
        ).not.toContain(
          'Parent',
        );

        expect(
          compensation,
        ).not.toContain(
          'Documents reviewed',
        );
      },
    );
  },
);