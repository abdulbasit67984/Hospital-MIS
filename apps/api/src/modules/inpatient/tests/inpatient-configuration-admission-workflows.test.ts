import {
  ObjectId,
} from 'mongodb';

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  buildBedRateScopeKey,
  buildInpatientSequenceKey,
  formatInpatientNumber,
  inpatientContentHash,
  normalizeInpatientCode,
  normalizeInpatientText,
} from '../inpatient.normalization.js';

import {
  bedCreateLockKeys,
  recommendationCreateLockKeys,
  roomCreateLockKeys,
  wardCreateLockKeys,
} from '../inpatient.workflow-helpers.js';

import {
  protectInpatientRestorePayload,
} from '../inpatient.mutation-snapshots.js';

import {
  CreateWardWorkflow,
} from '../workflows/inpatient-location.workflows.js';

const facilityId =
  new ObjectId().toHexString();

const userId =
  new ObjectId().toHexString();

const departmentId =
  new ObjectId().toHexString();

const servicePointId =
  new ObjectId().toHexString();

const actor = {
  userId,

  facilityId,

  correlationId:
    'corr-inpatient-batch-3',

  roleKeys: [
    'SYSTEM_ADMINISTRATOR',
  ],

  permissionKeys: [
    'beds.manage',
  ],
};

function fakeWardRecord() {
  const now =
    new Date(
      '2026-07-20T10:00:00.000Z',
    );

  return {
    _id:
      new ObjectId(),

    facilityId:
      new ObjectId(
        facilityId,
      ),

    wardCode:
      'MEDICAL_1',

    name:
      'Medical Ward 1',

    normalizedName:
      'medical ward 1',

    wardType:
      'GENERAL',

    departmentId:
      new ObjectId(
        departmentId,
      ),

    servicePointId:
      new ObjectId(
        servicePointId,
      ),

    nursingStationCode:
      'NS_1',

    description:
      null,

    displayOrder:
      1,

    permittedSexes: [
      'MALE',
      'FEMALE',
      'OTHER',
      'UNKNOWN',
    ],

    minimumAgeYears:
      18,

    maximumAgeYears:
      null,

    specialtyCodes: [
      'INTERNAL_MEDICINE',
    ],

    isolationCapabilities: [
      'STANDARD_PRECAUTIONS',
    ],

    infectionControlTags:
      [],

    negativePressureCapable:
      false,

    cohortingAllowed:
      true,

    status:
      'ACTIVE',

    activatedAt:
      now,

    activatedBy:
      new ObjectId(
        userId,
      ),

    deactivatedAt:
      null,

    deactivatedBy:
      null,

    deactivationReason:
      null,

    transactionId:
      'tx-inpatient-ward',

    correlationId:
      actor.correlationId,

    schemaVersion:
      1,

    version:
      0,

    createdBy:
      new ObjectId(
        userId,
      ),

    updatedBy:
      new ObjectId(
        userId,
      ),

    createdAt:
      now,

    updatedAt:
      now,
  };
}

describe(
  'inpatient Batch 3 workflows',
  () => {
    it(
      'normalizes identifiers and creates stable scope and sequence keys',
      () => {
        expect(
          normalizeInpatientCode(
            ' Medical Ward 1 ',
          ),
        ).toBe(
          'MEDICAL_WARD_1',
        );

        expect(
          normalizeInpatientText(
            ' Medical   Ward 1 ',
          ),
        ).toBe(
          'medical ward 1',
        );

        const date =
          new Date(
            '2026-07-20T10:00:00.000Z',
          );

        expect(
          buildInpatientSequenceKey(
            'inpatient.admission.number',
            date,
          ),
        ).toBe(
          'inpatient.admission.number:2026',
        );

        expect(
          formatInpatientNumber(
            'IPD',
            date,
            42,
          ),
        ).toBe(
          'IPD-2026-0000042',
        );

        expect(
          buildBedRateScopeKey(
            'BED_CATEGORY',
            null,
            'general',
            null,
            null,
            null,
          ),
        ).toBe(
          'BED_CATEGORY:GENERAL:DEFAULT_PAYER:DEFAULT_PLAN:DEFAULT_PACKAGE',
        );
      },
    );

    it(
      'generates deterministic content hashes',
      () => {
        const first =
          inpatientContentHash({
            amount:
              '7500.00',

            scope:
              'GENERAL',
          });

        const second =
          inpatientContentHash({
            scope:
              'GENERAL',

            amount:
              '7500.00',
          });

        expect(
          first,
        ).toBe(
          second,
        );

        expect(
          first,
        ).toMatch(
          /^[a-f\d]{64}$/u,
        );
      },
    );

    it(
      'creates conflict-safe location and admission locks',
      () => {
        expect(
          wardCreateLockKeys(
            facilityId,
            'MEDICAL_1',
            'medical ward 1',
          ),
        ).toHaveLength(
          2,
        );

        expect(
          roomCreateLockKeys(
            facilityId,
            new ObjectId()
              .toHexString(),
            'ROOM_101',
            '101',
          ),
        ).toHaveLength(
          3,
        );

        expect(
          bedCreateLockKeys(
            facilityId,
            new ObjectId()
              .toHexString(),
            new ObjectId()
              .toHexString(),
            'BED_101_A',
            'A',
          ),
        ).toHaveLength(
          4,
        );

        expect(
          recommendationCreateLockKeys(
            facilityId,
            new ObjectId()
              .toHexString(),
            new ObjectId()
              .toHexString(),
          ),
        ).toHaveLength(
          2,
        );
      },
    );

    it(
      'protects compensation snapshots with bound associated data',
      () => {
        const entityId =
          new ObjectId()
            .toHexString();

        const protect =
          vi.fn(
            (
              _value:
                unknown,

              associatedData:
                string,
            ) => ({
              encryptedValue: {
                algorithm:
                  'AES-256-GCM',

                keyId:
                  'test-key',

                initializationVector:
                  'iv',

                authenticationTag:
                  'tag',

                ciphertext:
                  'ciphertext',
              },

              valueHash:
                'a'.repeat(
                  64,
                ),

              associatedData,
            }),
          );

        const payload =
          protectInpatientRestorePayload({
            facilityId,
            collection:
              'wards',
            entityId,
            expectedPostVersion:
              2,
            transactionId:
              'tx-1',
            snapshot: {
              name:
                'Medical Ward',
            },
            snapshotCrypto: {
              protect,
            },
          });

        expect(
          protect,
        ).toHaveBeenCalledWith(
          {
            name:
              'Medical Ward',
          },

          `inpatient-restore:${facilityId}:wards:${entityId}:2`,
        );

        expect(
          payload.snapshotHash,
        ).toBe(
          'a'.repeat(
            64,
          ),
        );
      },
    );

    it(
      'creates a ward through transaction, compensation, audit, outbox, and realtime boundaries',
      async () => {
        const createdWard =
          fakeWardRecord();

        const checkpoints:
          string[] = [];

        const compensations:
          unknown[] = [];

        const execute =
          vi.fn(
            async (
              request:
                {
                  execute(
                    transaction:
                      {
                        transactionId:
                          string;

                        checkpoint(
                          state:
                            string,
                        ):
                          Promise<void>;

                        registerCompensation(
                          compensation:
                            unknown,
                        ):
                          Promise<void>;
                      },
                  ):
                    Promise<unknown>;
                },
            ) =>
              request.execute({
                transactionId:
                  'tx-inpatient-ward',

                async checkpoint(
                  state:
                    string,
                ) {
                  checkpoints.push(
                    state,
                  );
                },

                async registerCompensation(
                  compensation:
                    unknown,
                ) {
                  compensations.push(
                    compensation,
                  );
                },
              }),
          );

        const createWard =
          vi.fn(
            async () =>
              createdWard,
          );

        const auditAppend =
          vi.fn(
            async () => {},
          );

        const outboxEnqueue =
          vi.fn(
            async () => {},
          );

        const realtimePublish =
          vi.fn(
            async () => {},
          );

        const support =
          {
            locations: {
              createWard,
            },

            admissions: {},

            context: {},

            configurationContext: {
              async findDepartment() {
                return {
                  id:
                    departmentId,

                  facilityId,

                  isClinical:
                    true,

                  status:
                    'ACTIVE' as const,
                };
              },

              async findServicePoint() {
                return {
                  id:
                    servicePointId,

                  facilityId,

                  departmentId,

                  status:
                    'ACTIVE' as const,
                };
              },
            },

            accessPolicy: {
              async authorize() {
                return {
                  allowed:
                    true,

                  accessMode:
                    'WARD_OPERATIONAL' as const,

                  minimumNecessaryFields:
                    [],

                  auditSensitiveRead:
                    false,
                };
              },
            },

            dependencies: {
              transactionManager: {
                execute,
              },

              audit: {
                append:
                  auditAppend,
              },

              outbox: {
                enqueue:
                  outboxEnqueue,
              },

              realtime: {
                publish:
                  realtimePublish,
              },

              clock: {
                now:
                  () =>
                    new Date(
                      '2026-07-20T10:00:00.000Z',
                    ),
              },

              sequence: {
                async next() {
                  return {
                    key:
                      'unused',

                    value:
                      1,
                  };
                },
              },

              snapshotCrypto: {
                protect() {
                  return {
                    encryptedValue: {
                      algorithm:
                        'AES-256-GCM',

                      keyId:
                        'test',

                      initializationVector:
                        'iv',

                      authenticationTag:
                        'tag',

                      ciphertext:
                        'cipher',
                    },

                    valueHash:
                      'a'.repeat(
                        64,
                      ),
                  };
                },
              },
            },

            normalizedCode:
              normalizeInpatientCode,

            normalizedCodes(
              values:
                readonly string[],
            ) {
              return values.map(
                normalizeInpatientCode,
              );
            },

            normalizedText:
              normalizeInpatientText,

            displayText(
              value:
                string,
            ) {
              return value.trim();
            },

            nullableText(
              value:
                string |
                null |
                undefined,
            ) {
              return value == null
                ? null
                : value.trim();
            },

            async assertAccess() {},

            async assertClinicalDepartment() {},

            async assertServicePoint() {},

            auditActorFields() {
              return {
                actorUserId:
                  userId,

                facilityId,

                correlationId:
                  actor
                    .correlationId,
              };
            },

            deduplicationKey(
              transactionId:
                string,

              action:
                string,

              entityId:
                string,
            ) {
              return [
                transactionId,
                action,
                entityId,
              ].join(':');
            },
          };

        const workflow =
          new CreateWardWorkflow(
            support as never,
          );

        const result =
          await workflow.execute({
            actor,

            idempotencyKey:
              'inpatient-ward-create-1',

            input: {
              wardCode:
                ' Medical 1 ',

              name:
                'Medical Ward 1',

              wardType:
                'GENERAL',

              departmentId,

              servicePointId,

              nursingStationCode:
                'NS 1',

              description:
                null,

              displayOrder:
                1,

              permittedSexes: [
                'MALE',
                'FEMALE',
                'OTHER',
                'UNKNOWN',
              ],

              minimumAgeYears:
                18,

              maximumAgeYears:
                null,

              specialtyCodes: [
                'internal medicine',
              ],

              isolationCapabilities: [
                'STANDARD_PRECAUTIONS',
              ],

              infectionControlTags:
                [],

              negativePressureCapable:
                false,

              cohortingAllowed:
                true,
            },
          });

        expect(
          result,
        ).toBe(
          createdWard,
        );

        expect(
          execute,
        ).toHaveBeenCalledOnce();

        expect(
          createWard,
        ).toHaveBeenCalledOnce();

        expect(
          compensations,
        ).toHaveLength(
          1,
        );

        expect(
          checkpoints,
        ).toContain(
          'CURRENT_PROJECTION_CREATED',
        );

        expect(
          auditAppend,
        ).toHaveBeenCalledOnce();

        expect(
          outboxEnqueue,
        ).toHaveBeenCalledOnce();

        expect(
          realtimePublish,
        ).toHaveBeenCalledOnce();
      },
    );
  },
);