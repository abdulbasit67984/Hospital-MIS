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
  PatientMergeRecord,
} from '../patient.merge.js';

import type {
  PatientIdentifierRecord,
  PatientRecord,
} from '../patient.types.js';

import {
  PatientCanonicalizationService,
} from '../repositories/patient-merge.repository.js';

import {
  MergePatientsWorkflow,
} from '../workflows/merge-patients.workflow.js';

import {
  ResolveDuplicateReviewWorkflow,
} from '../workflows/resolve-duplicate-review.workflow.js';

const facilityId =
  '507f191e810c19729de860ea';

const actorUserId =
  '507f191e810c19729de860eb';

const sourcePatientId =
  '507f1f77bcf86cd799439011';

const targetPatientId =
  '507f1f77bcf86cd799439012';

const now =
  new Date(
    '2026-07-17T10:00:00.000Z',
  );

const actor = {
  userId:
    actorUserId,

  facilityId,

  correlationId:
    'correlation-merge-1',
};

function patientRecord(
  input: Readonly<{
    patientId: string;
    enterprisePatientId: string;
    firstName: string;
    version: number;
    duplicateReviewRequired?: boolean;
    mergeState?: PatientRecord['mergeState'];
    status?: PatientRecord['status'];
    mergedIntoPatientId?: Types.ObjectId | null;
    canonicalPatientId?: Types.ObjectId | null;
  }>,
): PatientRecord {
  return {
    _id:
      new Types.ObjectId(
        input.patientId,
      ),

    facilityId:
      new Types.ObjectId(
        facilityId,
      ),

    enterprisePatientId:
      input.enterprisePatientId,

    canonicalPatientId:
      input.canonicalPatientId ??
      null,

    firstName:
      input.firstName,

    middleName:
      null,

    lastName:
      'Khan',

    preferredName:
      null,

    displayName:
      `${input.firstName} Khan`,

    normalizedFullName:
      `${input.firstName.toLowerCase()} khan`,

    nameSearchTokens: [
      input.firstName.toLowerCase(),
      'khan',
    ],

    localizedNames:
      [],

    birthDate: {
      value:
        new Date(
          '1988-04-02T00:00:00.000Z',
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
      input.status ??
      'ACTIVE',

    mergeState:
      input.mergeState ??
      'DUPLICATE_SUSPECTED',

    mergedIntoPatientId:
      input.mergedIntoPatientId ??
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
      input.duplicateReviewRequired ??
      true,

    registrationSource:
      'RECEPTION',

    registeredAt:
      now,

    schemaVersion:
      1,

    version:
      input.version,

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

function primaryMrn(
  patientId: string,
  identifierId: string,
  displayValue: string,
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
      new Types.ObjectId(
        facilityId,
      ),

    identifierType:
      'MRN',

    scope:
      'FACILITY',

    normalizedValue:
      displayValue,

    displayValue,

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
      new Types.ObjectId(
        actorUserId,
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

function snapshotCrypto():
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
                'encrypted-patient-snapshot',
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
    Array<{
      type: string;
      payload: Record<string, unknown>;
    }> = [];

  let journalPayload:
    Record<string, unknown> | null =
      null;

  return {
    compensations,

    journal:
      () => journalPayload,

    manager: {
      execute:
        vi.fn(
          async <T>(
            request:
              PatientTransactionRequest<T>,
          ): Promise<T> => {
            journalPayload =
              request.journalPayload;

            return request.execute({
              transactionId:
                'transaction-merge-1',

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
                  compensations.push({
                    type:
                      compensation.type,

                    payload:
                      compensation.payload,
                  });
                },
            });
          },
        ),
    },
  };
}

function runtimeDependencies(
  transaction:
    ReturnType<
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
      snapshotCrypto(),
  };
}

describe(
  'patient merge workflows',
  () => {
    it(
      'merges a duplicate into a canonical patient with encrypted reversible state and immutable merge history',
      async () => {
        const source =
          patientRecord({
            patientId:
              sourcePatientId,

            enterprisePatientId:
              'f18b24b6-b960-42d5-a8c7-1d1346e13e20',

            firstName:
              'Ayesha',

            version:
              3,
          });

        const target =
          patientRecord({
            patientId:
              targetPatientId,

            enterprisePatientId:
              '604afdaf-d4a2-4b4f-8867-bb6d2d3f63ef',

            firstName:
              'Aisha',

            version:
              7,
          });

        const sourceAfter = {
          ...source,

          status:
            'MERGED',

          mergeState:
            'MERGED',

          mergedIntoPatientId:
            new Types.ObjectId(
              targetPatientId,
            ),

          canonicalPatientId:
            new Types.ObjectId(
              targetPatientId,
            ),

          duplicateReviewRequired:
            false,

          version:
            4,
        } satisfies PatientRecord;

        const targetAfter = {
          ...target,

          mergeState:
            'CANONICAL',

          duplicateReviewRequired:
            false,

          version:
            8,
        } satisfies PatientRecord;

        const sourceMrn =
          primaryMrn(
            sourcePatientId,
            '507f1f77bcf86cd799439021',
            'MAIN-2026-000101',
          );

        const targetMrn =
          primaryMrn(
            targetPatientId,
            '507f1f77bcf86cd799439022',
            'MAIN-2026-000087',
          );

        const mergeRecord = {
          _id:
            new Types.ObjectId(
              '507f1f77bcf86cd799439023',
            ),

          facilityId:
            new Types.ObjectId(
              facilityId,
            ),

          mergeId:
            'bc401615-90a2-4a95-b5dc-493b996f8497',

          sourcePatientId:
            new Types.ObjectId(
              sourcePatientId,
            ),

          targetPatientId:
            new Types.ObjectId(
              targetPatientId,
            ),

          sourceEnterprisePatientId:
            source.enterprisePatientId,

          targetEnterprisePatientId:
            target.enterprisePatientId,

          sourcePrimaryMrn:
            sourceMrn.displayValue,

          targetPrimaryMrn:
            targetMrn.displayValue,

          evidenceCodes: [
            'EXACT_CNIC',
            'NAME_AND_EXACT_BIRTH_DATE',
          ],

          reason:
            'The same identity document and demographic record were confirmed by medical records staff.',

          strategy:
            'CANONICAL_REDIRECT',

          status:
            'COMPLETED',

          sourceStatusBefore:
            source.status,

          targetStatusBefore:
            target.status,

          sourceVersionBefore:
            3,

          sourceVersionAfter:
            4,

          targetVersionBefore:
            7,

          targetVersionAfter:
            8,

          mergedAt:
            now,

          mergedBy:
            new Types.ObjectId(
              actorUserId,
            ),

          transactionId:
            'transaction-merge-1',

          correlationId:
            actor.correlationId,

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
        } satisfies PatientMergeRecord;

        const transaction =
          transactionFixture();

        const dependencies =
          runtimeDependencies(
            transaction,
          );

        const repository = {
          findPatientForMerge:
            vi.fn(
              async (
                _facilityId: string,
                patientId: string,
              ) =>
                patientId ===
                sourcePatientId
                  ? source
                  : target,
            ),

          findPrimaryMrn:
            vi.fn(
              async (
                _facilityId: string,
                patientId: string,
              ) =>
                patientId ===
                sourcePatientId
                  ? sourceMrn
                  : targetMrn,
            ),

          findCompletedBySource:
            vi.fn()
              .mockResolvedValue(
                null,
              ),

          markSourceMerged:
            vi.fn()
              .mockResolvedValue(
                sourceAfter,
              ),

          markTargetCanonical:
            vi.fn()
              .mockResolvedValue(
                targetAfter,
              ),

          createCompleted:
            vi.fn(
              async (
                input: Readonly<{
                  mergeDocumentId: string;
                }>,
              ) => ({
                ...mergeRecord,

                _id:
                  new Types.ObjectId(
                    input.mergeDocumentId,
                  ),
              }),
            ),
        };

        const workflow =
          new MergePatientsWorkflow(
            repository as never,
            dependencies,
          );

        const result =
          await workflow.execute({
            sourcePatientId,

            input: {
              targetPatientId,

              expectedSourceVersion:
                3,

              expectedTargetVersion:
                7,

              evidenceCodes: [
                'EXACT_CNIC',
                'NAME_AND_EXACT_BIRTH_DATE',
              ],

              reason:
                mergeRecord.reason,

              acknowledgement:
                'I_CONFIRM_PATIENT_MERGE',
            },

            actor,

            idempotencyKey:
              'merge-patient-0001',
          });

        expect(result).toEqual(
          expect.objectContaining({
            mergeId:
              mergeRecord.mergeId,

            source:
              expect.objectContaining({
                status:
                  'MERGED',

                mrn:
                  'MAIN-2026-000101',
              }),

            target:
              expect.objectContaining({
                mrn:
                  'MAIN-2026-000087',
              }),
          }),
        );

        expect(
          transaction.compensations.map(
            (compensation) =>
              compensation.type,
          ),
        ).toEqual([
          'PATIENT_GUARDIAN_RESTORE_PATIENT',
          'PATIENT_GUARDIAN_RESTORE_PATIENT',
          'PATIENT_GUARDIAN_DELETE_CREATED_PATIENT_MERGE',
        ]);

        const compensationPayload =
          JSON.stringify(
            transaction.compensations,
          );

        expect(
          compensationPayload,
        ).toContain(
          'ciphertext',
        );

        expect(
          compensationPayload,
        ).not.toContain(
          'Ayesha',
        );

        expect(
          compensationPayload,
        ).not.toContain(
          '1988-04-02',
        );

        const journal =
          JSON.stringify(
            transaction.journal(),
          );

        expect(journal).not.toContain(
          mergeRecord.reason,
        );

        expect(journal).not.toContain(
          'Ayesha',
        );

        const published =
          JSON.stringify({
            audit:
              vi.mocked(
                dependencies.audit.append,
              ).mock.calls,

            outbox:
              vi.mocked(
                dependencies.outbox.enqueue,
              ).mock.calls,
          });

        expect(published).not.toContain(
          '1988-04-02',
        );

        expect(
          dependencies.outbox.enqueue,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType:
              'patient.merged',

            aggregateId:
              targetPatientId,
          }),
        );
      },
    );

    it(
      'rejects merging a patient into itself before starting a durable transaction',
      async () => {
        const transaction =
          transactionFixture();

        const workflow =
          new MergePatientsWorkflow(
            {} as never,
            runtimeDependencies(
              transaction,
            ),
          );

        await expect(
          workflow.execute({
            sourcePatientId,

            input: {
              targetPatientId:
                sourcePatientId,

              expectedSourceVersion:
                0,

              expectedTargetVersion:
                0,

              evidenceCodes: [
                'MANUAL_RECORD_REVIEW',
              ],

              reason:
                'Medical records review confirmed a duplicate.',

              acknowledgement:
                'I_CONFIRM_PATIENT_MERGE',
            },

            actor,

            idempotencyKey:
              'merge-patient-0002',
          }),
        ).rejects.toMatchObject({
          code:
            'VALIDATION_ERROR',
        });

        expect(
          transaction.manager.execute,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'resolves a false-positive duplicate review with encrypted compensation state',
      async () => {
        const current =
          patientRecord({
            patientId:
              sourcePatientId,

            enterprisePatientId:
              'f18b24b6-b960-42d5-a8c7-1d1346e13e20',

            firstName:
              'Ayesha',

            version:
              2,
          });

        const updated = {
          ...current,

          duplicateReviewRequired:
            false,

          mergeState:
            'CANONICAL',

          version:
            3,
        } satisfies PatientRecord;

        const transaction =
          transactionFixture();

        const dependencies =
          runtimeDependencies(
            transaction,
          );

        const workflow =
          new ResolveDuplicateReviewWorkflow(
            {
              findPatientForMerge:
                vi.fn()
                  .mockResolvedValue(
                    current,
                  ),

              setDuplicateReviewState:
                vi.fn()
                  .mockResolvedValue(
                    updated,
                  ),
            } as never,

            dependencies,
          );

        const result =
          await workflow.execute({
            patientId:
              sourcePatientId,

            input: {
              expectedVersion:
                2,

              decision:
                'CONFIRMED_NOT_DUPLICATE',

              reason:
                'Identifiers and prior records belong to different people.',
            },

            actor,

            idempotencyKey:
              'duplicate-review-0001',
          });

        expect(result).toEqual(
          expect.objectContaining({
            patientId:
              sourcePatientId,

            decision:
              'CONFIRMED_NOT_DUPLICATE',

            duplicateReviewRequired:
              false,

            mergeState:
              'CANONICAL',

            version:
              3,
          }),
        );

        const compensationPayload =
          JSON.stringify(
            transaction.compensations,
          );

        expect(
          compensationPayload,
        ).toContain(
          'ciphertext',
        );

        expect(
          compensationPayload,
        ).not.toContain(
          'Ayesha',
        );
      },
    );

    it(
      'resolves a merged patient through the canonical redirect chain',
      async () => {
        const findPatientReference =
          vi.fn(
            async (
              _facilityId: string,
              patientId: string,
            ) => {
              if (
                patientId ===
                sourcePatientId
              ) {
                return {
                  patientId:
                    sourcePatientId,

                  facilityId,

                  enterprisePatientId:
                    'source-enterprise-id',

                  status:
                    'MERGED',

                  mergeState:
                    'MERGED',

                  canonicalPatientId:
                    targetPatientId,

                  mergedIntoPatientId:
                    targetPatientId,
                } as const;
              }

              return {
                patientId:
                  targetPatientId,

                facilityId,

                enterprisePatientId:
                  'target-enterprise-id',

                status:
                  'ACTIVE',

                mergeState:
                  'CANONICAL',

                canonicalPatientId:
                  null,

                mergedIntoPatientId:
                  null,
              } as const;
            },
          );

        const service =
          new PatientCanonicalizationService(
            {
              findPatientReference,
            } as never,
          );

        const result =
          await service.resolve(
            facilityId,
            sourcePatientId,
          );

        expect(result).toEqual({
          requestedPatientId:
            sourcePatientId,

          canonicalPatientId:
            targetPatientId,

          canonicalEnterprisePatientId:
            'target-enterprise-id',

          canonicalStatus:
            'ACTIVE',

          redirected:
            true,

          redirectPath: [
            sourcePatientId,
            targetPatientId,
          ],
        });
      },
    );
  },
);