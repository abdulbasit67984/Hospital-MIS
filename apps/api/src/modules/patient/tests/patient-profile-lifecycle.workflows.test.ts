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
  PatientAddressRecord,
  PatientAlertRecord,
  PatientContactRecord,
  PatientGuardianRecord,
  PatientRecord,
} from '../patient.types.js';

import {
  updatePatientContactBodySchema,
} from '../patient-profile.validation.js';

import {
  AddPatientContactWorkflow,
} from '../workflows/patient-contact.workflows.js';

import {
  UpdatePatientAddressWorkflow,
} from '../workflows/patient-address.workflows.js';

import {
  CreatePatientAlertWorkflow,
} from '../workflows/patient-alert.workflows.js';

import {
  EndPatientGuardianWorkflow,
} from '../workflows/end-patient-guardian.workflow.js';

const facilityId =
  '507f191e810c19729de860ea';

const actorUserId =
  '507f191e810c19729de860eb';

const patientId =
  '507f1f77bcf86cd799439011';

const guardianId =
  '507f1f77bcf86cd799439012';

const relationshipId =
  '507f1f77bcf86cd799439013';

const now =
  new Date(
    '2026-07-17T10:00:00.000Z',
  );

const actor = {
  userId:
    actorUserId,

  facilityId,

  correlationId:
    'correlation-1',
};

function patientRecord(): PatientRecord {
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

function contactRecord():
  PatientContactRecord {
  return {
    _id:
      new Types.ObjectId(
        '507f1f77bcf86cd799439014',
      ),

    facilityId:
      new Types.ObjectId(
        facilityId,
      ),

    patientId:
      new Types.ObjectId(
        patientId,
      ),

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
      false,

    verifiedAt:
      null,

    verifiedBy:
      null,

    status:
      'ACTIVE',

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

function addressRecord(
  version = 0,
): PatientAddressRecord {
  return {
    _id:
      new Types.ObjectId(
        '507f1f77bcf86cd799439015',
      ),

    facilityId:
      new Types.ObjectId(
        facilityId,
      ),

    patientId:
      new Types.ObjectId(
        patientId,
      ),

    addressType:
      'HOME',

    line1:
      'House 1, Street 2',

    line2:
      null,

    landmark:
      null,

    city:
      'Lahore',

    district:
      'Lahore',

    province:
      'Punjab',

    postalCode:
      '54000',

    countryCode:
      'PK',

    isPrimary:
      true,

    validFrom:
      null,

    validTo:
      null,

    status:
      'ACTIVE',

    schemaVersion:
      1,

    version,

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

function alertRecord():
  PatientAlertRecord {
  return {
    _id:
      new Types.ObjectId(
        '507f1f77bcf86cd799439016',
      ),

    facilityId:
      new Types.ObjectId(
        facilityId,
      ),

    patientId:
      new Types.ObjectId(
        patientId,
      ),

    alertType:
      'LEGAL',

    severity:
      'CRITICAL',

    visibility:
      'RESTRICTED',

    title:
      'Restricted disclosure',

    details:
      'Do not disclose information without legal review.',

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

function relationshipRecord():
  PatientGuardianRecord {
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
      'VERIFIED',

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
      'VERIFIED',

    verifiedAt:
      now,

    verifiedBy:
      new Types.ObjectId(
        actorUserId,
      ),

    verificationNotes:
      'Reviewed',

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
  };
}

function crypto():
  PatientSensitiveSnapshotCryptoPort {
  return {
    protect:
      vi.fn(
        (
          value: unknown,
          associatedData: string,
        ) => ({
          encryptedValue: {
            algorithm:
              'AES-256-GCM',

            keyVersion:
              'test-key',

            initializationVector:
              Buffer.alloc(12)
                .toString('base64'),

            authenticationTag:
              Buffer.alloc(16)
                .toString('base64'),

            ciphertext:
              Buffer.from(
                'encrypted',
              ).toString('base64'),
          },

          valueHash:
            `${associatedData}:${JSON.stringify(value).length}`,
        }),
      ),

    unprotect:
      vi.fn(),

    hash:
      vi.fn(),

    matchesHash:
      vi.fn()
        .mockReturnValue(true),

    needsRotation:
      vi.fn()
        .mockReturnValue(false),
  };
}

function transactionFixture() {
  const compensations:
    Array<Record<string, unknown>> = [];

  let journal:
    Record<string, unknown> | null =
      null;

  return {
    compensations,

    journal:
      () => journal,

    manager: {
      execute:
        vi.fn(
          async <T>(
            request:
              PatientTransactionRequest<T>,
          ): Promise<T> => {
            journal =
              request.journalPayload;

            return request.execute({
              transactionId:
                'transaction-1',

              idempotencyKey:
                request.idempotencyKey,

              checkpoint:
                vi.fn()
                  .mockResolvedValue(
                    undefined,
                  ),

              registerCompensation:
                async (
                  compensation,
                ) => {
                  compensations.push(
                    compensation.payload,
                  );
                },
            });
          },
        ),
    },
  };
}

function dependencies(
  transaction: ReturnType<
    typeof transactionFixture
  >,
) {
  return {
    transactionManager:
      transaction.manager as never,

    audit: {
      append:
        vi.fn()
          .mockResolvedValue(
            undefined,
          ),
    },

    outbox: {
      enqueue:
        vi.fn()
          .mockResolvedValue(
            undefined,
          ),
    },

    clock: {
      now:
        () => now,
    },

    snapshotCrypto:
      crypto(),
  };
}

describe(
  'patient profile and guardian lifecycle workflows',
  () => {
    it(
      'rejects an empty contact update',
      () => {
        const result =
          updatePatientContactBodySchema
            .safeParse({
              expectedVersion:
                0,

              reason:
                'No-op change',
            });

        expect(
          result.success,
        ).toBe(false);
      },
    );

    it(
      'adds a contact without journaling or publishing the normalized phone number',
      async () => {
        const transaction =
          transactionFixture();

        const runtime =
          dependencies(
            transaction,
          );

        const workflow =
          new AddPatientContactWorkflow(
            {
              findById:
                vi.fn()
                  .mockResolvedValue(
                    patientRecord(),
                  ),
            } as never,

            {
              createContact:
                vi.fn()
                  .mockResolvedValue(
                    contactRecord(),
                  ),
            } as never,

            {
              hasActivePatientGuardian:
                vi.fn()
                  .mockResolvedValue(
                    true,
                  ),
            } as never,

            runtime,
          );

        const result =
          await workflow.execute({
            patientId,

            input: {
              contactType:
                'PHONE',

              purpose:
                'PRIMARY',

              value:
                '0300-1234567',

              isPrimary:
                true,
            },

            actor,

            idempotencyKey:
              'add-contact-1',
          });

        expect(
          result.displayValue,
        ).toBe(
          '*********4567',
        );

        expect(
          JSON.stringify(
            transaction.journal(),
          ),
        ).not.toContain(
          '0300-1234567',
        );

        expect(
          JSON.stringify(
            vi.mocked(
              runtime.outbox.enqueue,
            ).mock.calls,
          ),
        ).not.toContain(
          '+923001234567',
        );

        expect(
          transaction.compensations,
        ).toEqual([
          expect.objectContaining({
            entityId:
              contactRecord()
                ._id.toHexString(),

            expectedVersion:
              0,
          }),
        ]);
      },
    );

    it(
      'updates an address with an encrypted restore snapshot',
      async () => {
        const transaction =
          transactionFixture();

        const runtime =
          dependencies(
            transaction,
          );

        const current =
          addressRecord();

        const updated = {
          ...addressRecord(1),

          city:
            'Islamabad',
        };

        const workflow =
          new UpdatePatientAddressWorkflow(
            {
              findAddressById:
                vi.fn()
                  .mockResolvedValue(
                    current,
                  ),

              updateAddressWithVersion:
                vi.fn()
                  .mockResolvedValue(
                    updated,
                  ),
            } as never,

            runtime,
          );

        const result =
          await workflow.execute({
            addressId:
              current._id.toHexString(),

            input: {
              city:
                'Islamabad',

              expectedVersion:
                0,

              reason:
                'Patient moved',
            },

            actor,

            idempotencyKey:
              'update-address-1',
          });

        expect(
          result.city,
        ).toBe(
          'Islamabad',
        );

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
          'House 1, Street 2',
        );

        expect(
          compensation,
        ).not.toContain(
          '54000',
        );
      },
    );

    it(
      'creates a restricted alert without exposing alert details in audit or outbox records',
      async () => {
        const transaction =
          transactionFixture();

        const runtime =
          dependencies(
            transaction,
          );

        const workflow =
          new CreatePatientAlertWorkflow(
            {
              findById:
                vi.fn()
                  .mockResolvedValue(
                    patientRecord(),
                  ),
            } as never,

            {
              createAlert:
                vi.fn()
                  .mockResolvedValue(
                    alertRecord(),
                  ),
            } as never,

            runtime,
          );

        await workflow.execute({
          patientId,

          input: {
            alertType:
              'LEGAL',

            severity:
              'CRITICAL',

            visibility:
              'RESTRICTED',

            title:
              'Restricted disclosure',

            details:
              'Do not disclose information without legal review.',
          },

          actor,

          idempotencyKey:
            'create-alert-1',
        });

        const externalRecords =
          JSON.stringify({
            audit:
              vi.mocked(
                runtime.audit.append,
              ).mock.calls,

            outbox:
              vi.mocked(
                runtime.outbox.enqueue,
              ).mock.calls,

            journal:
              transaction.journal(),
          });

        expect(
          externalRecords,
        ).not.toContain(
          'Do not disclose information without legal review.',
        );

        expect(
          externalRecords,
        ).not.toContain(
          'Restricted disclosure',
        );
      },
    );

    it(
      'prevents ending the final valid guardian relationship for a minor',
      async () => {
        const workflow =
          new EndPatientGuardianWorkflow(
            {
              findById:
                vi.fn()
                  .mockResolvedValue(
                    patientRecord(),
                  ),
            } as never,

            {
              findById:
                vi.fn()
                  .mockResolvedValue(
                    relationshipRecord(),
                  ),

              hasAlternativeActiveGuardianWithCnic:
                vi.fn()
                  .mockResolvedValue(
                    false,
                  ),
            } as never,

            dependencies(
              transactionFixture(),
            ),
          );

        await expect(
          workflow.execute({
            relationshipId,

            input: {
              expectedVersion:
                0,

              reason:
                'Guardian no longer responsible',
            },

            actor,

            idempotencyKey:
              'end-guardian-1',
          }),
        ).rejects.toMatchObject({
          code:
            'CONFLICT',
        });
      },
    );
  },
);