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
  PatientRecord,
} from '../patient.types.js';

import {
  UpdateGuardianWorkflow,
} from '../workflows/update-guardian.workflow.js';

import {
  UpdatePatientWorkflow,
} from '../workflows/update-patient.workflow.js';

const facilityId =
  '507f191e810c19729de860ea';

const actorUserId =
  '507f191e810c19729de860eb';

const patientId =
  '507f1f77bcf86cd799439011';

const guardianId =
  '507f1f77bcf86cd799439012';

const now =
  new Date(
    '2026-07-17T10:00:00.000Z',
  );

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
              Buffer.from('123456789012')
                .toString('base64'),

            authenticationTag:
              Buffer.alloc(16)
                .toString('base64'),

            ciphertext:
              Buffer.from(
                JSON.stringify({
                  protected:
                    true,
                }),
              ).toString('base64'),
          },

          valueHash:
            `hash:${associatedData}:${JSON.stringify(value).length}`,
        }),
      ),

    unprotect:
      vi.fn(),

    hash:
      vi.fn(
        (
          value: unknown,
          associatedData: string,
        ) =>
          `hash:${associatedData}:${JSON.stringify(value).length}`,
      ),

    matchesHash:
      vi.fn()
        .mockReturnValue(true),

    needsRotation:
      vi.fn()
        .mockReturnValue(false),
  };
}

function patient(
  version = 2,
): PatientRecord {
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

function guardian(
  version = 1,
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
        'House 1',

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

function transactionManager() {
  const compensations:
    Array<Record<string, unknown>> = [];

  let journalPayload:
    Record<string, unknown> | null = null;

  return {
    compensations,

    journal:
      () => journalPayload,

    manager: {
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

describe(
  'patient and guardian update workflows',
  () => {
    it(
      'updates a patient using an encrypted compensation snapshot and safe audit data',
      async () => {
        const current =
          patient();

        const updated = {
          ...patient(3),

          preferredName:
            'Ashi',

          displayName:
            'Ashi',

          updatedAt:
            new Date(
              '2026-07-17T10:01:00.000Z',
            ),
        };

        const transaction =
          transactionManager();

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

        const snapshotCrypto =
          crypto();

        const workflow =
          new UpdatePatientWorkflow(
            {
              findById:
                vi.fn()
                  .mockResolvedValue(current),

              updateWithVersion:
                vi.fn()
                  .mockResolvedValue(updated),
            } as never,

            {
              hasActiveGuardianWithCnic:
                vi.fn()
                  .mockResolvedValue(true),
            } as never,

            {
              transactionManager:
                transaction.manager as never,

              audit:
                audit as never,

              outbox:
                outbox as never,

              clock: {
                now:
                  () => now,
              },

              snapshotCrypto,
            },
          );

        const result =
          await workflow.execute({
            patientId,

            input: {
              preferredName:
                'Ashi',

              expectedVersion:
                2,

              reason:
                'Correct preferred name',
            },

            actor: {
              userId:
                actorUserId,

              facilityId,

              correlationId:
                'correlation-1',
            },

            idempotencyKey:
              'update-patient-1',
          });

        expect(result).toMatchObject({
          id:
            patientId,

          version:
            3,
        });

        expect(
          snapshotCrypto.protect,
        ).toHaveBeenCalledTimes(1);

        expect(
          transaction.compensations,
        ).toHaveLength(1);

        const serializedCompensation =
          JSON.stringify(
            transaction.compensations[0],
          );

        expect(
          serializedCompensation,
        ).toContain(
          'ciphertext',
        );

        expect(
          serializedCompensation,
        ).not.toContain(
          'Ayesha',
        );

        expect(
          serializedCompensation,
        ).not.toContain(
          '2015-04-02',
        );

        expect(
          JSON.stringify(
            transaction.journal(),
          ),
        ).not.toContain(
          'Ashi',
        );

        expect(
          audit.append,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            action:
              'patient.updated',

            before:
              expect.not.objectContaining({
                firstName:
                  expect.anything(),

                birthDate:
                  expect.anything(),
              }),

            after:
              expect.not.objectContaining({
                firstName:
                  expect.anything(),

                birthDate:
                  expect.anything(),
              }),
          }),
        );

        expect(
          outbox.enqueue,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            payload:
              expect.not.objectContaining({
                firstName:
                  expect.anything(),

                preferredName:
                  expect.anything(),

                birthDate:
                  expect.anything(),
              }),
          }),
        );
      },
    );

    it(
      'blocks converting a patient to minor without an active guardian CNIC',
      async () => {
        const workflow =
          new UpdatePatientWorkflow(
            {
              findById:
                vi.fn()
                  .mockResolvedValue(
                    patient(),
                  ),
            } as never,

            {
              hasActiveGuardianWithCnic:
                vi.fn()
                  .mockResolvedValue(false),
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
                crypto(),
            },
          );

        await expect(
          workflow.execute({
            patientId,

            input: {
              expectedVersion:
                2,

              reason:
                'Confirm minor status',
            },

            actor: {
              userId:
                actorUserId,

              facilityId,

              correlationId:
                'correlation-1',
            },

            idempotencyKey:
              'update-patient-2',
          }),
        ).rejects.toMatchObject({
          code:
            'CONFLICT',
        });
      },
    );

    it(
      'blocks removal of guardian CNIC while the guardian represents an active minor',
      async () => {
        const workflow =
          new UpdateGuardianWorkflow(
            {
              findById:
                vi.fn()
                  .mockResolvedValue(
                    guardian(),
                  ),
            } as never,

            {
              hasActiveMinorRelationship:
                vi.fn()
                  .mockResolvedValue(true),
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
                crypto(),
            },
          );

        await expect(
          workflow.execute({
            guardianId,

            input: {
              cnic:
                null,

              expectedVersion:
                1,

              reason:
                'Remove invalid identity',
            },

            actor: {
              userId:
                actorUserId,

              facilityId,

              correlationId:
                'correlation-2',
            },

            idempotencyKey:
              'update-guardian-1',
          }),
        ).rejects.toMatchObject({
          code:
            'CONFLICT',
        });
      },
    );
  },
);