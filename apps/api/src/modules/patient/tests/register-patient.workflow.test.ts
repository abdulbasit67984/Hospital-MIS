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
  PatientTransactionRequest,
} from '../patient.ports.js';

import type {
  GuardianRecord,
  PatientAddressRecord,
  PatientContactRecord,
  PatientGuardianRecord,
  PatientIdentifierRecord,
  PatientRecord,
  RegisterPatientInput,
} from '../patient.types.js';

import {
  RegisterPatientWorkflow,
} from '../workflows/register-patient.workflow.js';

const facilityId =
  '507f191e810c19729de860ea';

const actorUserId =
  '507f191e810c19729de860eb';

const patientId =
  new Types.ObjectId(
    '507f1f77bcf86cd799439011',
  );

const guardianId =
  new Types.ObjectId(
    '507f1f77bcf86cd799439012',
  );

const now =
  new Date(
    '2026-07-17T10:00:00.000Z',
  );

function patientRecord(): PatientRecord {
  return {
    _id:
      patientId,
    facilityId:
      new Types.ObjectId(facilityId),
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
      new Types.ObjectId(actorUserId),
    updatedBy:
      new Types.ObjectId(actorUserId),
    createdAt:
      now,
    updatedAt:
      now,
  };
}

function identifierRecord(
  input: Readonly<{
    id: string;
    type: 'MRN' | 'B_FORM';
    displayValue: string;
    primaryMrn: boolean;
  }>,
): PatientIdentifierRecord {
  return {
    _id:
      new Types.ObjectId(input.id),
    facilityId:
      new Types.ObjectId(facilityId),
    patientId,
    issuingFacilityId:
      input.primaryMrn
        ? new Types.ObjectId(facilityId)
        : null,
    identifierType:
      input.type,
    scope:
      input.primaryMrn
        ? 'FACILITY'
        : 'ENTERPRISE',
    normalizedValue:
      input.displayValue,
    displayValue:
      input.displayValue,
    issuingCountryCode:
      'PK',
    issuingAuthority:
      null,
    isPrimaryIdentity:
      false,
    isPrimaryMrn:
      input.primaryMrn,
    verificationStatus:
      input.primaryMrn
        ? 'VERIFIED'
        : 'UNVERIFIED',
    verifiedAt:
      input.primaryMrn ? now : null,
    verifiedBy:
      input.primaryMrn
        ? new Types.ObjectId(actorUserId)
        : null,
    validFrom:
      input.primaryMrn ? now : null,
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
      new Types.ObjectId(actorUserId),
    updatedBy:
      new Types.ObjectId(actorUserId),
    createdAt:
      now,
    updatedAt:
      now,
  };
}

function guardianRecord(): GuardianRecord {
  return {
    _id:
      guardianId,
    facilityId:
      new Types.ObjectId(facilityId),
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
      '3520212345671',
    cnicDisplayValue:
      '*********5671',
    dateOfBirth:
      null,
    sexAtBirth:
      'FEMALE',
    genderIdentity:
      'NOT_DISCLOSED',
    phoneNormalized:
      '+923001234567',
    phoneDisplayValue:
      '*********4567',
    emailNormalized:
      null,
    address: {
      line1:
        null,
      line2:
        null,
      city:
        'Lahore',
      district:
        'Lahore',
      province:
        'Punjab',
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
      new Types.ObjectId(actorUserId),
    updatedBy:
      new Types.ObjectId(actorUserId),
    createdAt:
      now,
    updatedAt:
      now,
  };
}

function registrationInput(): RegisterPatientInput {
  return {
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
    identifiers: [
      {
        identifierType:
          'B_FORM',
        value:
          '35202-7654321-4',
        issuingCountryCode:
          'PK',
      },
    ],
    contacts: [
      {
        contactType:
          'PHONE',
        purpose:
          'PRIMARY',
        value:
          '0300-1234567',
        isPrimary:
          true,
      },
    ],
    addresses: [
      {
        addressType:
          'HOME',
        line1:
          'House 1',
        city:
          'Lahore',
        countryCode:
          'PK',
        isPrimary:
          true,
      },
    ],
    guardian: {
      firstName:
        'Sara',
      lastName:
        'Khan',
      cnic:
        '35202-1234567-1',
      phone:
        '0300-1234567',
    },
    guardianRelationship: {
      relationshipType:
        'MOTHER',
      isPrimary:
        true,
      isEmergencyContact:
        true,
      canConsentToTreatment:
        true,
    },
  };
}

describe(
  'RegisterPatientWorkflow',
  () => {
    it(
      'registers a minor through one durable idempotent workflow without journaling sensitive values',
      async () => {
        const patient =
          patientRecord();

        const mrn =
          identifierRecord({
            id:
              '507f1f77bcf86cd799439013',
            type:
              'MRN',
            displayValue:
              'MAIN-2026-000001',
            primaryMrn:
              true,
          });

        const bForm =
          identifierRecord({
            id:
              '507f1f77bcf86cd799439014',
            type:
              'B_FORM',
            displayValue:
              '*********3214',
            primaryMrn:
              false,
          });

        const guardian =
          guardianRecord();

        const relationship = {
          _id:
            new Types.ObjectId(
              '507f1f77bcf86cd799439015',
            ),
          facilityId:
            new Types.ObjectId(facilityId),
          patientId,
          guardianId,
          relationshipType:
            'MOTHER',
          relationshipDescription:
            null,
          isPrimary:
            true,
          isEmergencyContact:
            true,
          livesWithPatient:
            false,
          isFinanciallyResponsible:
            false,
          legalAuthorityStatus:
            'DECLARED',
          canConsentToTreatment:
            true,
          canConsentToDisclosure:
            false,
          canReceiveClinicalInformation:
            false,
          authorityBasis:
            null,
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
            new Types.ObjectId(actorUserId),
          updatedBy:
            new Types.ObjectId(actorUserId),
          createdAt:
            now,
          updatedAt:
            now,
        } satisfies PatientGuardianRecord;

        const contact = {
          _id:
            new Types.ObjectId(
              '507f1f77bcf86cd799439016',
            ),
          version:
            0,
          contactType:
            'PHONE',
        } as unknown as PatientContactRecord;

        const address = {
          _id:
            new Types.ObjectId(
              '507f1f77bcf86cd799439017',
            ),
          version:
            0,
          addressType:
            'HOME',
        } as unknown as PatientAddressRecord;

        const compensations:
          Array<{
            key: string;
            type: string;
          }> = [];

        let journalPayload:
          Record<string, unknown> | undefined;

        const transactionManager = {
          execute:
            vi.fn(
              async <T>(
                request: PatientTransactionRequest<T>,
              ): Promise<T> => {
                journalPayload =
                  request.journalPayload;

                return request.execute({
                  transactionId:
                    'transaction-1',
                  idempotencyKey:
                    request.idempotencyKey,
                  checkpoint:
                    vi.fn()
                      .mockResolvedValue(undefined),
                  registerCompensation:
                    async (compensation) => {
                      compensations.push({
                        key:
                          compensation.key,
                        type:
                          compensation.type,
                      });
                    },
                });
              },
            ),
        };

        const audit = {
          append:
            vi.fn()
              .mockResolvedValue(undefined),
        };

        const outbox = {
          enqueue:
            vi.fn()
              .mockResolvedValue(undefined),
        };

        const workflow =
          new RegisterPatientWorkflow(
            {
              create:
                vi.fn()
                  .mockResolvedValue(patient),
              setDuplicateReview:
                vi.fn(),
            } as never,
            {
              createMedicalRecordNumber:
                vi.fn()
                  .mockResolvedValue(mrn),
              createIdentity:
                vi.fn()
                  .mockResolvedValue(bForm),
            } as never,
            {
              findByCnic:
                vi.fn()
                  .mockResolvedValue(null),
              create:
                vi.fn()
                  .mockResolvedValue(guardian),
              linkToPatient:
                vi.fn()
                  .mockResolvedValue(relationship),
            } as never,
            {
              createContact:
                vi.fn()
                  .mockResolvedValue(contact),
              createAddress:
                vi.fn()
                  .mockResolvedValue(address),
            } as never,
            {
              assess:
                vi.fn()
                  .mockResolvedValue({
                    blocked:
                      false,
                    highestLevel:
                      'NONE',
                    candidates:
                      [],
                  }),
            } as never,
            {
              allocate:
                vi.fn()
                  .mockResolvedValue({
                    facilityId,
                    facilityCode:
                      'MAIN',
                    year:
                      2026,
                    sequenceValue:
                      1,
                    mrn:
                      'MAIN-2026-000001',
                    normalizedMrn:
                      'MAIN-2026-000001',
                  }),
            } as never,
            {
              transactionManager:
                transactionManager as never,
              audit:
                audit as never,
              outbox:
                outbox as never,
              clock: {
                now:
                  () => now,
              },
            },
          );

        const result =
          await workflow.execute({
            input:
              registrationInput(),
            actor: {
              userId:
                actorUserId,
              facilityId,
              correlationId:
                'correlation-1',
            },
            idempotencyKey:
              'register-patient-1',
          });

        expect(result.patient).toEqual(
          expect.objectContaining({
            id:
              patientId.toHexString(),
            mrn:
              'MAIN-2026-000001',
          }),
        );

        expect(result.guardian).toEqual(
          expect.objectContaining({
            id:
              guardianId.toHexString(),
            createdDuringRegistration:
              true,
          }),
        );

        expect(compensations).toHaveLength(7);

        const journal =
          JSON.stringify(
            journalPayload,
          );

        expect(journal).not.toContain(
          '3520212345671',
        );
        expect(journal).not.toContain(
          '0300-1234567',
        );
        expect(journal).not.toContain(
          'Ayesha',
        );
        expect(journal).not.toContain(
          '2015-04-02',
        );

        expect(audit.append).toHaveBeenCalledWith(
          expect.objectContaining({
            action:
              'patient.registered',
            after:
              expect.not.objectContaining({
                cnic:
                  expect.anything(),
                phone:
                  expect.anything(),
                birthDate:
                  expect.anything(),
              }),
          }),
        );

        expect(outbox.enqueue).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType:
              'patient.registered',
          }),
        );
      },
    );

    it(
      'blocks an exact duplicate before creating a durable transaction',
      async () => {
        const execute =
          vi.fn();

        const workflow =
          new RegisterPatientWorkflow(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {
              assess:
                vi.fn()
                  .mockResolvedValue({
                    blocked:
                      true,
                    highestLevel:
                      'BLOCK',
                    candidates: [
                      {
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
                        score:
                          100,
                        level:
                          'BLOCK',
                        reasons: [
                          'EXACT_B_FORM',
                        ],
                      },
                    ],
                  }),
            } as never,
            {} as never,
            {
              transactionManager: {
                execute,
              },
              audit:
                {} as never,
              outbox:
                {} as never,
              clock: {
                now:
                  () => now,
              },
            },
          );

        await expect(
          workflow.execute({
            input:
              registrationInput(),
            actor: {
              userId:
                actorUserId,
              facilityId,
              correlationId:
                'correlation-1',
            },
            idempotencyKey:
              'register-patient-1',
          }),
        ).rejects.toMatchObject({
          code:
            'CONFLICT',
        });

        expect(execute).not.toHaveBeenCalled();
      },
    );
  },
);