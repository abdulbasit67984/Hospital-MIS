import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  radiologyActorFromRequest,
  requireRadiologyIdempotencyKey,
} from '../radiology.http.js';

import {
  registerRadiologyImagingStudyBodySchema,
  scheduleRadiologyAppointmentBodySchema,
} from '../radiology.http.validation.js';

import {
  PacsRisRadiologyImagingGatewayAdapter,
} from '../../../infrastructure/radiology-platform.adapters.js';

import {
  MongoRadiologyTransactionManagerAdapter,
} from '../../../infrastructure/radiology-transaction-manager.adapter.js';

function objectId(
  suffix:
    string,
): string {
  return `64b000000000000000000${suffix.padStart(3, '0')}`;
}

describe(
  'Radiology HTTP security boundary',
  () => {
    it(
      'requires a non-trivial idempotency key for mutations',
      () => {
        expect(
          () =>
            requireRadiologyIdempotencyKey(
              {
                headers:
                  {},
              } as never,
            ),
        ).toThrow(
          'A valid Idempotency-Key header is required',
        );

        expect(
          requireRadiologyIdempotencyKey(
            {
              headers: {
                'idempotency-key':
                  'radiology-order-00001',
              },
            } as never,
          ),
        ).toBe(
          'radiology-order-00001',
        );
      },
    );

    it(
      'builds actor and facility attribution only from authenticated request context',
      () => {
        const actor =
          radiologyActorFromRequest(
            {
              id:
                'request-correlation',

              ip:
                '127.0.0.1',

              headers: {
                'user-agent':
                  'vitest',

                'x-correlation-id':
                  'external-correlation',
              },

              user: {
                userId:
                  objectId(
                    '1',
                  ),

                facilityId:
                  objectId(
                    '2',
                  ),

                roleKeys: [
                  'RADIOLOGIST',
                ],

                permissionKeys: [
                  'radiology.reports.verify',
                ],
              },

              body: {
                userId:
                  objectId(
                    '9',
                  ),

                facilityId:
                  objectId(
                    '8',
                  ),
              },
            } as never,
          );

        expect(
          actor,
        ).toMatchObject({
          userId:
            objectId(
              '1',
            ),

          facilityId:
            objectId(
              '2',
            ),

          correlationId:
            'external-correlation',

          ipAddress:
            '127.0.0.1',

          userAgent:
            'vitest',
        });
      },
    );

    it(
      'rejects overlapping scheduling semantics and binary study payloads before workflows',
      () => {
        const resourceId =
          objectId(
            '3',
          );

        expect(
          scheduleRadiologyAppointmentBodySchema.safeParse(
            {
              orderItemId:
                objectId(
                  '4',
                ),

              expectedOrderItemVersion:
                0,

              scheduledStartAt:
                '2026-07-20T10:00:00.000+05:00',

              scheduledEndAt:
                '2026-07-20T09:00:00.000+05:00',

              roomResourceId:
                resourceId,

              equipmentResourceIds: [
                resourceId,
              ],

              technicianStaffIds:
                [],
            },
          ).success,
        ).toBe(
          false,
        );

        expect(
          registerRadiologyImagingStudyBodySchema.safeParse(
            {
              orderItemId:
                objectId(
                  '4',
                ),

              expectedOrderItemVersion:
                4,

              expectedExaminationVersion:
                2,

              studyInstanceUid:
                '1.2.840.113619.2.55.3.1',

              studyDateTime:
                '2026-07-20T10:30:00.000+05:00',

              status:
                'AVAILABLE',

              externalReferences: [
                {
                  systemType:
                    'PACS',

                  systemName:
                    'Fictional PACS',

                  endpointAlias:
                    'PRIMARY',

                  externalStudyId:
                    'STUDY-1',
                },
              ],

              series: [
                {
                  seriesInstanceUid:
                    '1.2.840.113619.2.55.3.1.1',

                  seriesNumber:
                    1,

                  modalityCode:
                    'CT',

                  instanceCount:
                    10,
                },
              ],

              imageBinary:
                Buffer.from(
                  'not-permitted',
                ),
            },
          ).success,
        ).toBe(
          false,
        );
      },
    );
  },
);

describe(
  'Radiology external-boundary and transaction integration',
  () => {
    it(
      'rejects PACS responses that attempt to return image binaries',
      async () => {
        const adapter =
          new PacsRisRadiologyImagingGatewayAdapter(
            {
              verifyStudy:
                async (
                  input,
                ) => ({
                  studyInstanceUid:
                    input.studyInstanceUid,

                  studyDateTime:
                    input.studyDateTime,

                  externalReferences: [
                    {
                      systemType:
                        'PACS',
                    },
                  ],

                  series: [
                    {
                      seriesInstanceUid:
                        '1.2.3.4.5',
                    },
                  ],

                  containsBinaryPayload:
                    true,
                }),
            },
          );

        await expect(
          adapter.verifyExternalStudy(
            {
              facilityId:
                objectId(
                  '1',
                ),

              patientId:
                objectId(
                  '2',
                ),

              accessionNumber:
                'ACC-2026-0000001',

              studyInstanceUid:
                '1.2.840.113619.2.55.3.1',

              studyDateTime:
                new Date(),

              externalReferences:
                [],

              series:
                [],

              correlationId:
                'corr-pacs-test',
            },
          ),
        ).rejects.toThrow(
          'Radiology accepts metadata references only',
        );
      },
    );

    it(
      'executes registered compensation when a domain mutation fails',
      async () => {
        const executedCompensations:
          string[] =
            [];

        const transactionStatuses:
          string[] =
            [];

        const adapter =
          new MongoRadiologyTransactionManagerAdapter(
            {
              database: {
                collection:
                  () => ({
                    updateOne:
                      async () => ({
                        matchedCount:
                          1,

                        modifiedCount:
                          1,
                      }),
                  }),
              } as never,

              transactions: {
                create:
                  async () =>
                    undefined,

                setStatus:
                  async (
                    _id,
                    status,
                  ) => {
                    transactionStatuses.push(
                      status,
                    );
                  },

                setStepStatus:
                  async () =>
                    undefined,

                markStaleForRecovery:
                  async () =>
                    0,
              },

              idempotency: {
                begin:
                  async () => ({
                    kind:
                      'ACQUIRED' as const,

                    ownerId:
                      'owner-1',
                  }),

                complete:
                  async () =>
                    undefined,

                fail:
                  async () =>
                    undefined,
              } as never,

              locks: {
                acquireMany:
                  async () =>
                    [],

                releaseMany:
                  async () =>
                    undefined,
              } as never,

              outbox: {
                releaseTransactionEvents:
                  async () =>
                    0,
              } as never,

              compensationExecutor: {
                execute:
                  async (
                    compensation,
                  ) => {
                    executedCompensations.push(
                      compensation.key,
                    );
                  },
              } as never,

              snapshotCrypto: {
                protect:
                  (
                    value,
                  ) => ({
                    encryptedValue: {
                      algorithm:
                        'AES-256-GCM',

                      keyVersion:
                        'test',

                      initializationVector:
                        'test-initialization-vector',

                      authenticationTag:
                        'test-authentication-tag',

                      ciphertext:
                        Buffer.from(
                          JSON.stringify(
                            value,
                          ),
                        ).toString(
                          'base64',
                        ),
                    },

                    valueHash:
                      'a'.repeat(
                        64,
                      ),
                  }),

                unprotect:
                  () =>
                    ({}),

                hash:
                  () =>
                    'a'.repeat(
                      64,
                    ),

                matchesHash:
                  () =>
                    true,

                needsRotation:
                  () =>
                    false,
              } as never,
            },
          );

        await expect(
          adapter.execute({
            transactionType:
              'RADIOLOGY_TEST_FAILURE',

            idempotencyKey:
              'radiology-test-failure-1',

            actorUserId:
              objectId(
                '1',
              ),

            facilityId:
              objectId(
                '2',
              ),

            correlationId:
              'corr-transaction-test',

            lockKeys: [
              'order-item:1',
            ],

            idempotencyPayload: {
              test:
                true,
            },

            journalPayload: {
              operation:
                'TEST_FAILURE',
            },

            execute:
              async (
                context,
              ) => {
                await context.registerCompensation(
                  {
                    key:
                      'undo-test-record',

                    type:
                      'radiology.record.delete-created',

                    payload: {
                      entityId:
                        objectId(
                          '3',
                        ),
                    },
                  },
                );

                throw new Error(
                  'simulated failure',
                );
              },
          }),
        ).rejects.toThrow(
          'simulated failure',
        );

        expect(
          executedCompensations,
        ).toEqual([
          'undo-test-record',
        ]);

        expect(
          transactionStatuses,
        ).toContain(
          'COMPENSATED',
        );
      },
    );
  },
);