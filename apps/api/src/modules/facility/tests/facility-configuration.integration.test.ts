import {
  randomUUID,
} from 'node:crypto';

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  createObjectId,
  type Db,
} from '@hospital-mis/database';

import type {
  AuthRepository,
} from '../../auth/auth.repository.js';

import {
  withFacilityStatusEnforcement,
} from '../../auth/auth.repository.facility-aware.js';

import {
  createAuditModule,
} from '../../audit/index.js';

import {
  createOperationalInfrastructure,
} from '../../../infrastructure/operational-infrastructure.js';

import {
  createFacilityInfrastructure,
} from '../../../infrastructure/facility-infrastructure.js';

import {
  FacilityAuthenticationDisabledError,
  InactiveFacilityError,
  SystemSettingConcurrencyError,
} from '../facility.errors.js';

import {
  FACILITY_COMPENSATION_TYPES,
  FACILITY_RECOVERY_MODES,
  FACILITY_TRANSACTION_TYPES,
} from '../facility.transaction.constants.js';

import {
  FACILITY_TYPE,
  SETTING_CATEGORY,
  SETTING_DATA_TYPE,
  SETTING_SCOPE,
} from '../facility.constants.js';

import {
  seedFacilityConfiguration,
  type FacilityConfigurationSeedResult,
} from '../facility.seed.js';

import {
  cleanupFacilityIntegrationData,
  connectFacilityIntegrationDatabase,
  createFacilityIntegrationConfiguration,
  createFacilityIntegrationNamespace,
  disconnectFacilityIntegrationDatabase,
} from './facility-configuration.integration.helpers.js';

const shouldRun =
  process.env[
    'RUN_FACILITY_CONFIGURATION_INTEGRATION_TESTS'
  ] ===
  'true';

const suite =
  shouldRun
    ? describe.sequential
    : describe.skip;

suite(
  'facility and configuration database-backed integration',
  () => {
    const namespace =
      createFacilityIntegrationNamespace();

    const configuration =
      createFacilityIntegrationConfiguration(
        namespace,
      );

    let database:
      Db;

    let infrastructure:
      ReturnType<
        typeof createFacilityInfrastructure
      >;

    let seedResult:
      FacilityConfigurationSeedResult;

    const mainFacilityCode =
      `${namespace.codePrefix}MAIN`;

    const correlationId =
      (
        operation:
          string,
      ) =>
        `${namespace.correlationPrefix}-${operation}`;

    const idempotencyKey =
      (
        operation:
          string,
      ) =>
        `${namespace.idempotencyPrefix}:${operation}`;

    beforeAll(
      async () => {
        database =
          await connectFacilityIntegrationDatabase();

        const audit =
          createAuditModule(
            database,
          );

        const operational =
          createOperationalInfrastructure({
            database,

            async publishEvent() {
              return;
            },
          });

        infrastructure =
          createFacilityInfrastructure({
            database,

            auditRepository:
              audit.repository,

            operationalInfrastructure:
              operational,

            configuration,
          });

        seedResult =
          await seedFacilityConfiguration({
            database,

            configuration,

            actorUserId:
              namespace.actorUserId,

            facilityCode:
              mainFacilityCode,

            facilityName:
              `Integration Hospital ${namespace.suffix}`,

            legalName:
              `Integration Hospital ${namespace.suffix} Limited`,

            keyPrefix:
              namespace.keyPrefix,
          });
      },
      30_000,
    );

    afterAll(
      async () => {
        if (
          database !==
          undefined
        ) {
          await cleanupFacilityIntegrationData(
            database,
            namespace,
          );
        }

        await disconnectFacilityIntegrationDatabase();
      },
      30_000,
    );

    it(
      'runs the production seed repeatedly without duplicate records or history',
      async () => {
        const repeated =
          await seedFacilityConfiguration({
            database,

            configuration,

            actorUserId:
              namespace.actorUserId,

            facilityCode:
              mainFacilityCode,

            facilityName:
              `Integration Hospital ${namespace.suffix}`,

            legalName:
              `Integration Hospital ${namespace.suffix} Limited`,

            keyPrefix:
              namespace.keyPrefix,
          });

        expect(
          repeated.facility.id,
        ).toBe(
          seedResult.facility.id,
        );

        expect(
          repeated.departments.total,
        ).toBe(
          13,
        );

        expect(
          repeated.definitions.total,
        ).toBe(
          12,
        );

        expect(
          repeated.settings.total,
        ).toBe(
          11,
        );

        expect(
          repeated.settings.created,
        ).toBe(
          0,
        );

        expect(
          repeated.settings.updated,
        ).toBe(
          0,
        );

        expect(
          repeated.settings.unchanged,
        ).toBe(
          11,
        );

        const facilityId =
          createObjectId(
            seedResult.facility.id,
          );

        const [
          facilities,
          departments,
          definitions,
          settings,
          versions,
        ] = await Promise.all([
          database
            .collection(
              'facilities',
            )
            .countDocuments({
              code:
                mainFacilityCode,
            }),

          database
            .collection(
              'departments',
            )
            .countDocuments({
              facilityId,
            }),

          database
            .collection(
              'settingDefinitions',
            )
            .countDocuments({
              key: {
                $regex:
                  `^${namespace.keyPrefix}`,
              },
            }),

          database
            .collection(
              'systemSettings',
            )
            .countDocuments({
              key: {
                $regex:
                  `^${namespace.keyPrefix}`,
              },
            }),

          database
            .collection(
              'systemSettingVersions',
            )
            .countDocuments({
              key: {
                $regex:
                  `^${namespace.keyPrefix}`,
              },
            }),
        ]);

        expect(
          facilities,
        ).toBe(1);

        expect(
          departments,
        ).toBe(13);

        expect(
          definitions,
        ).toBe(12);

        expect(
          settings,
        ).toBe(11);

        expect(
          versions,
        ).toBe(11);
      },
      30_000,
    );

    it(
      'executes facility, department, configuration, encryption, history, and concurrency workflows',
      async () => {
        const actor = {
          userId:
            namespace.actorUserId,

          facilityId:
            seedResult.facility.id,

          correlationId:
            correlationId(
              'workflow',
            ),

          ipAddress:
            '127.0.0.1',

          userAgent:
            'vitest-integration',
        };

        const branch =
          await infrastructure
            .application
            .facilityService
            .create(
              {
                code:
                  `${namespace.codePrefix}B1`,

                name:
                  `Integration Branch ${namespace.suffix}`,

                legalName:
                  null,

                facilityType:
                  FACILITY_TYPE.BRANCH,

                parentFacilityId:
                  seedResult.facility.id,

                identifiers:
                  [],

                timezone:
                  'Asia/Karachi',

                currency:
                  'PKR',

                locale:
                  'en-PK',

                supportedLocales: [
                  'en-PK',
                  'ur-PK',
                ],

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

                contact: {
                  primaryPhone:
                    null,

                  secondaryPhone:
                    null,

                  email:
                    null,

                  website:
                    null,

                  emergencyPhone:
                    null,
                },

                allowsAuthentication:
                  true,
              },
              actor,
              idempotencyKey(
                'branch-create',
              ),
            );

        const department =
          await infrastructure
            .application
            .departmentService
            .create(
              {
                facilityId:
                  branch.id,

                parentDepartmentId:
                  null,

                managerStaffId:
                  null,

                code:
                  'TEST',

                name:
                  'Integration Department',

                description:
                  'Database-backed integration department.',

                departmentType:
                  'ADMINISTRATIVE',

                isClinical:
                  false,

                location:
                  null,

                costCenterCode:
                  'TEST',

                contact: {
                  phone:
                    null,

                  extension:
                    null,

                  email:
                    null,
                },
              },
              actor,
              idempotencyKey(
                'department-create',
              ),
            );

        expect(
          department.facilityId,
        ).toBe(
          branch.id,
        );

        const currencyKey =
          `${namespace.keyPrefix}workflow.currency`;

        await infrastructure
          .application
          .settingDefinitionMutationService
          .create(
            {
              key:
                currencyKey,

              category:
                SETTING_CATEGORY.REGIONAL,

              dataType:
                SETTING_DATA_TYPE.CURRENCY,

              allowedScopes: [
                SETTING_SCOPE.GLOBAL,
                SETTING_SCOPE.FACILITY,
              ],

              defaultValue:
                'PKR',

              labels: [
                {
                  locale:
                    'en-PK',

                  label:
                    'Integration currency',

                  description:
                    'Integration-test currency definition.',
                },
              ],

              validation: {
                required:
                  true,

                minLength:
                  3,

                maxLength:
                  3,

                pattern:
                  '^[A-Z]{3}$',

                minimum:
                  null,

                maximum:
                  null,

                allowedValues:
                  [],

                jsonSchema:
                  null,
              },

              isSensitive:
                false,

              isMutable:
                true,

              isActive:
                true,

              cacheTtlSeconds:
                30,
            },
            actor,
            idempotencyKey(
              'currency-definition',
            ),
          );

        await infrastructure
          .application
          .systemSettingService
          .upsert(
            currencyKey,
            {
              scope:
                SETTING_SCOPE.GLOBAL,

              facilityId:
                null,

              value:
                'PKR',

              expectedVersion:
                null,

              expectedRevision:
                null,

              reason:
                'Create integration global currency',
            },
            actor,
            idempotencyKey(
              'currency-global',
            ),
          );

        const facilityCurrency =
          await infrastructure
            .application
            .systemSettingService
            .upsert(
              currencyKey,
              {
                scope:
                  SETTING_SCOPE.FACILITY,

                facilityId:
                  branch.id,

                value:
                  'USD',

                expectedVersion:
                  null,

                expectedRevision:
                  null,

                reason:
                  'Create integration facility currency',
              },
              actor,
              idempotencyKey(
                'currency-facility',
              ),
            );

        const effective =
          await infrastructure
            .application
            .systemSettingService
            .resolveEffective(
              currencyKey,
              branch.id,
            );

        expect(
          effective.source,
        ).toBe(
          'FACILITY',
        );

        expect(
          effective.value,
        ).toBe(
          'USD',
        );

        const updated =
          await infrastructure
            .application
            .systemSettingService
            .upsert(
              currencyKey,
              {
                scope:
                  SETTING_SCOPE.FACILITY,

                facilityId:
                  branch.id,

                value:
                  'EUR',

                expectedVersion:
                  facilityCurrency.version,

                expectedRevision:
                  facilityCurrency.revision,

                reason:
                  'Update integration facility currency',
              },
              actor,
              idempotencyKey(
                'currency-facility-update',
              ),
            );

        expect(
          updated.revision,
        ).toBe(
          facilityCurrency.revision +
          1,
        );

        await expect(
          infrastructure
            .application
            .systemSettingService
            .upsert(
              currencyKey,
              {
                scope:
                  SETTING_SCOPE.FACILITY,

                facilityId:
                  branch.id,

                value:
                  'GBP',

                expectedVersion:
                  facilityCurrency.version,

                expectedRevision:
                  facilityCurrency.revision,

                reason:
                  'Attempt stale update',
              },
              actor,
              idempotencyKey(
                'currency-stale-update',
              ),
            ),
        ).rejects.toBeInstanceOf(
          SystemSettingConcurrencyError,
        );

        const history =
          await infrastructure
            .application
            .systemSettingService
            .listHistory(
              updated.id,
              {
                page:
                  1,

                pageSize:
                  20,

                sortDirection:
                  'asc',
              },
            );

        expect(
          history.totalItems,
        ).toBe(
          2,
        );

        expect(
          history.items.map(
            (
              version,
            ) =>
              version.revision,
          ),
        ).toEqual([
          1,
          2,
        ]);

        const secretKey =
          `${namespace.keyPrefix}workflow.secret`;

        await infrastructure
          .application
          .settingDefinitionMutationService
          .create(
            {
              key:
                secretKey,

              category:
                SETTING_CATEGORY.INTEGRATIONS,

              dataType:
                SETTING_DATA_TYPE.SECRET,

              allowedScopes: [
                SETTING_SCOPE.FACILITY,
              ],

              defaultValue:
                null,

              labels: [
                {
                  locale:
                    'en-PK',

                  label:
                    'Integration secret',

                  description:
                    'Encrypted integration-test setting.',
                },
              ],

              validation: {
                required:
                  true,

                minLength:
                  8,

                maxLength:
                  500,

                pattern:
                  null,

                minimum:
                  null,

                maximum:
                  null,

                allowedValues:
                  [],

                jsonSchema:
                  null,
              },

              isSensitive:
                true,

              isMutable:
                true,

              isActive:
                true,

              cacheTtlSeconds:
                30,
            },
            actor,
            idempotencyKey(
              'secret-definition',
            ),
          );

        const plaintext =
          `secret-${namespace.suffix}-not-for-storage`;

        const secretSetting =
          await infrastructure
            .application
            .systemSettingService
            .upsert(
              secretKey,
              {
                scope:
                  SETTING_SCOPE.FACILITY,

                facilityId:
                  branch.id,

                value:
                  plaintext,

                expectedVersion:
                  null,

                expectedRevision:
                  null,

                reason:
                  'Create encrypted integration setting',
              },
              actor,
              idempotencyKey(
                'secret-upsert',
              ),
            );

        expect(
          secretSetting.value,
        ).toBeNull();

        expect(
          secretSetting.isConfigured,
        ).toBe(true);

        const runtimeSecret =
          await infrastructure
            .application
            .systemSettingService
            .resolveEffectiveRuntime<string>(
              secretKey,
              branch.id,
            );

        expect(
          runtimeSecret,
        ).toBe(
          plaintext,
        );

        const transaction =
          await database
            .collection<{
              transactionId:
                string;
            }>(
              'applicationTransactions',
            )
            .findOne({
              idempotencyKey:
                idempotencyKey(
                  'secret-upsert',
                ),
            });

        expect(
          transaction,
        ).not.toBeNull();

        const [
          storedSetting,
          storedVersions,
          auditEvents,
          outboxEvents,
        ] = await Promise.all([
          database
            .collection(
              'systemSettings',
            )
            .findOne({
              key:
                secretKey,

              facilityId:
                createObjectId(
                  branch.id,
                ),
            }),

          database
            .collection(
              'systemSettingVersions',
            )
            .find({
              key:
                secretKey,
            })
            .toArray(),

          database
            .collection(
              'auditEvents',
            )
            .find({
              transactionId:
                transaction!
                  .transactionId,
            })
            .toArray(),

          database
            .collection(
              'outboxEvents',
            )
            .find({
              transactionId:
                transaction!
                  .transactionId,
            })
            .toArray(),
        ]);

        expect(
          storedSetting?.[
            'value'
          ],
        ).toBeNull();

        expect(
          storedSetting?.[
            'encryptedValue'
          ],
        ).toBeTruthy();

        const persistedCorpus =
          JSON.stringify({
            storedSetting,
            storedVersions,
            auditEvents,
            outboxEvents,
            transaction,
          });

        expect(
          persistedCorpus,
        ).not.toContain(
          plaintext,
        );
      },
      30_000,
    );

    it(
      'enforces facility status and authentication flags for login and token refresh lookups',
      async () => {
        const actor = {
          userId:
            namespace.actorUserId,

          facilityId:
            seedResult.facility.id,

          correlationId:
            correlationId(
              'authentication',
            ),
        };

        const inactiveFacility =
          await infrastructure
            .application
            .facilityService
            .create(
              {
                code:
                  `${namespace.codePrefix}AUTHOFF`,

                name:
                  'Inactive Authentication Branch',

                legalName:
                  null,

                facilityType:
                  FACILITY_TYPE.BRANCH,

                parentFacilityId:
                  seedResult.facility.id,

                identifiers:
                  [],

                timezone:
                  'Asia/Karachi',

                currency:
                  'PKR',

                locale:
                  'en-PK',

                supportedLocales: [
                  'en-PK',
                ],

                address: {
                  line1:
                    null,

                  line2:
                    null,

                  city:
                    'Lahore',

                  district:
                    null,

                  province:
                    'Punjab',

                  postalCode:
                    null,

                  countryCode:
                    'PK',
                },

                contact: {
                  primaryPhone:
                    null,

                  secondaryPhone:
                    null,

                  email:
                    null,

                  website:
                    null,

                  emergencyPhone:
                    null,
                },

                allowsAuthentication:
                  true,
              },
              actor,
              idempotencyKey(
                'inactive-auth-facility-create',
              ),
            );

        await infrastructure
          .lifecycleService
          .deactivateFacility({
            facilityId:
              inactiveFacility.id,

            expectedVersion:
              inactiveFacility.version,

            reason:
              'Authentication integration test',

            actor,

            idempotencyKey:
              idempotencyKey(
                'inactive-auth-facility-deactivate',
              ),
          });

        const authenticationDisabledFacility =
          await infrastructure
            .application
            .facilityService
            .create(
              {
                code:
                  `${namespace.codePrefix}AUTHNO`,

                name:
                  'Authentication Disabled Branch',

                legalName:
                  null,

                facilityType:
                  FACILITY_TYPE.BRANCH,

                parentFacilityId:
                  seedResult.facility.id,

                identifiers:
                  [],

                timezone:
                  'Asia/Karachi',

                currency:
                  'PKR',

                locale:
                  'en-PK',

                supportedLocales: [
                  'en-PK',
                ],

                address: {
                  line1:
                    null,

                  line2:
                    null,

                  city:
                    'Lahore',

                  district:
                    null,

                  province:
                    'Punjab',

                  postalCode:
                    null,

                  countryCode:
                    'PK',
                },

                contact: {
                  primaryPhone:
                    null,

                  secondaryPhone:
                    null,

                  email:
                    null,

                  website:
                    null,

                  emergencyPhone:
                    null,
                },

                allowsAuthentication:
                  false,
              },
              actor,
              idempotencyKey(
                'disabled-auth-facility-create',
              ),
            );

        const findUserForLogin =
          vi.fn(
            async (
              facilityId:
                string,
            ) => ({
              facilityId,
            }),
          );

        const findUserById =
          vi.fn(
            async (
              facilityId:
                string,
            ) => ({
              facilityId,
            }),
          );

        const repository =
          withFacilityStatusEnforcement(
            {
              findUserForLogin,
              findUserById,
            } as unknown as AuthRepository,

            infrastructure
              .application
              .facilityService,
          );

        await expect(
          repository.findUserForLogin(
            seedResult.facility.id,
            'integration-user',
          ),
        ).resolves.toEqual({
          facilityId:
            seedResult.facility.id,
        });

        await expect(
          repository.findUserForLogin(
            inactiveFacility.id,
            'integration-user',
          ),
        ).rejects.toBeInstanceOf(
          InactiveFacilityError,
        );

        await expect(
          repository.findUserById(
            authenticationDisabledFacility.id,
            namespace.actorUserId,
          ),
        ).rejects.toBeInstanceOf(
          FacilityAuthenticationDisabledError,
        );

        expect(
          findUserForLogin,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          findUserById,
        ).not.toHaveBeenCalled();
      },
      30_000,
    );

    it(
      'recovers an interrupted lifecycle transaction and suppresses its blocked outbox event',
      async () => {
        const facilityId =
          createObjectId();

        const transactionId =
          randomUUID();

        const eventId =
          randomUUID();

        const createdAt =
          new Date(
            '2026-07-17T08:00:00.000Z',
          );

        const deactivatedAt =
          new Date(
            '2026-07-17T08:05:00.000Z',
          );

        await database
          .collection(
            'facilities',
          )
          .insertOne({
            _id:
              facilityId,

            code:
              `${namespace.codePrefix}RECOVERY`,

            name:
              'Recovery Integration Facility',

            legalName:
              null,

            facilityType:
              FACILITY_TYPE.BRANCH,

            parentFacilityId:
              null,

            identifiers:
              [],

            timezone:
              'Asia/Karachi',

            currency:
              'PKR',

            locale:
              'en-PK',

            supportedLocales: [
              'en-PK',
            ],

            address: {
              line1:
                null,

              line2:
                null,

              city:
                'Lahore',

              district:
                null,

              province:
                'Punjab',

              postalCode:
                null,

              countryCode:
                'PK',
            },

            contact: {
              primaryPhone:
                null,

              secondaryPhone:
                null,

              email:
                null,

              website:
                null,

              emergencyPhone:
                null,
            },

            /*
             * Simulates a lifecycle write that completed before the process
             * failed and before the transaction could finish.
             */
            status:
              'ACTIVE',

            allowsAuthentication:
              true,

            deactivatedAt:
              null,

            deactivatedBy:
              null,

            deactivationReason:
              null,

            schemaVersion:
              1,

            version:
              1,

            createdBy:
              createObjectId(
                namespace.actorUserId,
              ),

            updatedBy:
              createObjectId(
                namespace.actorUserId,
              ),

            createdAt,

            updatedAt:
              deactivatedAt,
          });

        await database
          .collection(
            'applicationTransactions',
          )
          .insertOne({
            _id:
              createObjectId(),

            facilityId,

            transactionId,

            transactionType:
              FACILITY_TRANSACTION_TYPES
                .ACTIVATE_FACILITY,

            idempotencyKey:
              idempotencyKey(
                'recovery',
              ),

            correlationId:
              correlationId(
                'recovery',
              ),

            initiatedBy:
              createObjectId(
                namespace.actorUserId,
              ),

            status:
              'RECOVERY_REQUIRED',

            recoveryStatus:
              'PENDING',

            facilityRecoveryMode:
              FACILITY_RECOVERY_MODES
                .COMPENSATE,

            retryCount:
              1,

            facilityCompensations: [
              {
                key:
                  `restore-facility-lifecycle:${facilityId.toHexString()}`,

                type:
                  FACILITY_COMPENSATION_TYPES
                    .RESTORE_FACILITY_LIFECYCLE,

                payload: {
                  facilityId:
                    facilityId.toHexString(),

                  expectedPostVersion:
                    1,

                  previous: {
                    status:
                      'INACTIVE',

                    allowsAuthentication:
                      false,

                    deactivatedAt:
                      deactivatedAt
                        .toISOString(),

                    deactivatedBy:
                      namespace.actorUserId,

                    deactivationReason:
                      'Previous inactive state',

                    version:
                      0,

                    updatedBy:
                      namespace.actorUserId,

                    updatedAt:
                      createdAt
                        .toISOString(),
                  },
                },

                status:
                  'PENDING',

                registeredAt:
                  createdAt,
              },
            ],

            schemaVersion:
              1,

            version:
              0,

            createdAt,

            updatedAt:
              createdAt,
          });

        await database
          .collection(
            'applicationTransactionSteps',
          )
          .insertOne({
            _id:
              createObjectId(),

            facilityId,

            transactionId,

            sequence:
              0,

            name:
              'facility-domain-operation',

            status:
              'FAILED',

            attemptCount:
              1,

            schemaVersion:
              1,

            version:
              0,

            createdAt,

            updatedAt:
              createdAt,
          });

        await database
          .collection(
            'outboxEvents',
          )
          .insertOne({
            _id:
              createObjectId(),

            facilityId,

            eventId,

            transactionId,

            eventType:
              'facility.activated',

            aggregateType:
              'Facility',

            aggregateId:
              facilityId.toHexString(),

            payload: {
              correlationId:
                correlationId(
                  'recovery',
                ),
            },

            status:
              'BLOCKED',

            availableAt:
              createdAt,

            attemptCount:
              0,

            schemaVersion:
              1,

            version:
              0,

            createdAt,

            updatedAt:
              createdAt,
          });

        const result =
          await infrastructure
            .recovery
            .recoverAvailable({
              workerId:
                `${namespace.correlationPrefix}-recovery-worker`,

              maxTransactions:
                1,

              now:
                new Date(
                  '2026-07-17T09:00:00.000Z',
                ),
            });

        expect(
          result,
        ).toEqual({
          recovered:
            1,

          failed:
            0,
        });

        const [
          facility,
          transaction,
          outbox,
        ] = await Promise.all([
          database
            .collection(
              'facilities',
            )
            .findOne({
              _id:
                facilityId,
            }),

          database
            .collection(
              'applicationTransactions',
            )
            .findOne({
              transactionId,
            }),

          database
            .collection(
              'outboxEvents',
            )
            .findOne({
              eventId,
            }),
        ]);

        expect(
          facility?.[
            'status'
          ],
        ).toBe(
          'INACTIVE',
        );

        expect(
          facility?.[
            'allowsAuthentication'
          ],
        ).toBe(
          false,
        );

        expect(
          facility?.[
            'version'
          ],
        ).toBe(
          0,
        );

        expect(
          transaction?.[
            'status'
          ],
        ).toBe(
          'COMPENSATED',
        );

        expect(
          transaction?.[
            'recoveryStatus'
          ],
        ).toBe(
          'COMPLETED',
        );

        expect(
          outbox?.[
            'status'
          ],
        ).toBe(
          'DEAD_LETTER',
        );

        expect(
          outbox?.[
            'lastError'
          ],
        ).toMatchObject({
          code:
            'TRANSACTION_COMPENSATED',
        });
      },
      30_000,
    );
  },
);