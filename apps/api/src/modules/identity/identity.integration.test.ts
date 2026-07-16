import request from 'supertest';

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';

import {
  loadApiConfig,
  loadAuthConfig,
} from '@hospital-mis/config';

import {
  connectDatabase,
  createObjectId,
  disconnectDatabase,
  nativeDatabase,
} from '@hospital-mis/database';

import {
  hashPassword,
} from '@hospital-mis/shared';

import {
  createApp,
} from '../../app.js';

import {
  createOperationalInfrastructure,
} from '../../infrastructure/operational-infrastructure.js';

import {
  createAuditModule,
} from '../audit/index.js';

import {
  createAuthenticationModule,
} from '../auth/index.js';

import {
  createAuthorizationModule,
} from '../authorization/index.js';

import {
  createIdentityInfrastructure,
  createIdentityModule,
} from './index.js';

const shouldRun =
  process.env[
    'RUN_IDENTITY_INTEGRATION_TESTS'
  ] ===
  'true';

const suite =
  shouldRun
    ? describe
    : describe.skip;

suite(
  'identity module database-backed HTTP workflow',
  () => {
    const apiConfig =
      loadApiConfig();

    const authConfig =
      loadAuthConfig();

    const suffix =
      createObjectId()
        .toHexString()
        .slice(
          -8,
        );

    const selectedFacilityId =
      createObjectId();

    const differentHomeFacilityId =
      createObjectId();

    const userId =
      createObjectId();

    const accessRoleId =
      createObjectId();

    const username =
      `identity.integration.${suffix}`;

    const password =
      'IdentityIntegration!123';

    const createdRoleCode =
      `TEST_ROLE_${suffix.toUpperCase()}`;

    const permissionCodes = [
      'identity.permissions.read',
      'identity.roles.read',
      'identity.roles.create',
    ] as const;

    beforeAll(
      async () => {
        await connectDatabase({
          uri:
            apiConfig.mongodbUri,

          appName:
            `${apiConfig.mongodbAppName}-identity-integration`,

          serverSelectionTimeoutMs:
            apiConfig.mongodbServerSelectionTimeoutMs,
        });

        const database =
          nativeDatabase();

        const now =
          new Date();

        const passwordHash =
          await hashPassword(
            password,
            authConfig,
          );

        await database
          .collection(
            'users',
          )
          .insertOne({
            _id:
              userId,

            facilityId:
              differentHomeFacilityId,

            publicId:
              `USR-INTEGRATION-${suffix}`,

            staffId:
              null,

            username,

            normalizedUsername:
              username,

            email:
              null,

            normalizedEmail:
              null,

            displayName:
              'Identity Integration User',

            passwordHash,

            status:
              'ACTIVE',

            mustChangePassword:
              false,

            failedLoginCount:
              0,

            lockedUntil:
              null,

            lastLoginAt:
              null,

            passwordChangedAt:
              now,

            tokenVersion:
              0,

            permissionVersion:
              0,

            schemaVersion:
              1,

            version:
              0,

            createdBy:
              null,

            updatedBy:
              null,

            disabledAt:
              null,

            disabledBy:
              null,

            disabledReason:
              null,

            createdAt:
              now,

            updatedAt:
              now,
          });

        const permissionIds =
          new Map<
            string,
            ReturnType<
              typeof createObjectId
            >
          >();

        for (
          const code of
          permissionCodes
        ) {
          await database
            .collection(
              'permissions',
            )
            .updateOne(
              {
                code,
              },
              {
                $set: {
                  name:
                    code,

                  module:
                    'identity',

                  description:
                    'Identity integration permission',

                  sensitivity:
                    'SENSITIVE',

                  isSystem:
                    true,

                  isActive:
                    true,

                  updatedAt:
                    now,
                },

                $setOnInsert: {
                  _id:
                    createObjectId(),

                  code,

                  schemaVersion:
                    1,

                  version:
                    0,

                  createdAt:
                    now,
                },
              },
              {
                upsert:
                  true,
              },
            );

          const permission =
            await database
              .collection<
                Record<string, unknown> & {
                  _id:
                    ReturnType<
                      typeof createObjectId
                    >;
                }
              >(
                'permissions',
              )
              .findOne({
                code,
              });

          if (
            permission ===
            null
          ) {
            throw new Error(
              `Permission ${code} was not created`,
            );
          }

          permissionIds.set(
            code,
            permission._id,
          );
        }

        await database
          .collection(
            'roles',
          )
          .insertOne({
            _id:
              accessRoleId,

            facilityId:
              selectedFacilityId,

            code:
              `INTEGRATION_ACCESS_${suffix.toUpperCase()}`,

            name:
              'Integration Access',

            description:
              'Temporary integration-test role',

            scope:
              'FACILITY',

            isSystem:
              false,

            isActive:
              true,

            schemaVersion:
              1,

            version:
              0,

            createdBy:
              userId,

            updatedBy:
              userId,

            createdAt:
              now,

            updatedAt:
              now,
          });

        await database
          .collection(
            'rolePermissions',
          )
          .insertMany(
            permissionCodes.map(
              (
                code,
              ) => ({
                _id:
                  createObjectId(),

                roleId:
                  accessRoleId,

                permissionId:
                  permissionIds.get(
                    code,
                  )!,

                grantedBy:
                  userId,

                grantedAt:
                  now,

                schemaVersion:
                  1,

                version:
                  0,

                createdAt:
                  now,

                updatedAt:
                  now,
              }),
            ),
          );

        await database
          .collection(
            'userRoles',
          )
          .insertOne({
            _id:
              createObjectId(),

            userId,

            roleId:
              accessRoleId,

            facilityId:
              selectedFacilityId,

            assignedBy:
              userId,

            assignedAt:
              now,

            expiresAt:
              null,

            isActive:
              true,

            revokedAt:
              null,

            revokedBy:
              null,

            revocationReason:
              null,

            schemaVersion:
              1,

            version:
              0,

            createdAt:
              now,

            updatedAt:
              now,
          });
      },
      30_000,
    );

    afterAll(
      async () => {
        const database =
          nativeDatabase();

        const transactions =
          await database
            .collection<
              Record<string, unknown> & {
                transactionId:
                  string;
              }
            >(
              'applicationTransactions',
            )
            .find({
              initiatedBy:
                userId,
            })
            .project({
              transactionId:
                1,
            })
            .toArray();

        const transactionIds =
          transactions.map(
            (
              transaction,
            ) =>
              transaction.transactionId,
          );

        await Promise.all([
          database
            .collection(
              'sessions',
            )
            .deleteMany({
              userId,
            }),

          database
            .collection(
              'refreshTokens',
            )
            .deleteMany({
              userId,
            }),

          database
            .collection(
              'userRoles',
            )
            .deleteMany({
              userId,
            }),

          database
            .collection(
              'rolePermissions',
            )
            .deleteMany({
              roleId: {
                $in: [
                  accessRoleId,
                ],
              },
            }),

          database
            .collection(
              'roles',
            )
            .deleteMany({
              $or: [
                {
                  _id:
                    accessRoleId,
                },
                {
                  code:
                    createdRoleCode,
                },
              ],
            }),

          database
            .collection(
              'users',
            )
            .deleteOne({
              _id:
                userId,
            }),

          database
            .collection(
              'applicationTransactionSteps',
            )
            .deleteMany({
              transactionId: {
                $in:
                  transactionIds,
              },
            }),

          database
            .collection(
              'applicationTransactions',
            )
            .deleteMany({
              transactionId: {
                $in:
                  transactionIds,
              },
            }),

          database
            .collection(
              'idempotencyKeys',
            )
            .deleteMany({
              facilityId:
                selectedFacilityId,

              key: {
                $regex:
                  suffix,
              },
            }),

          database
            .collection(
              'operationLocks',
            )
            .deleteMany({
              facilityId:
                selectedFacilityId,
            }),

          database
            .collection(
              'auditLogs',
            )
            .deleteMany({
              actorId:
                userId,
            }),

          database
            .collection(
              'outboxEvents',
            )
            .deleteMany({
              transactionId: {
                $in:
                  transactionIds,
              },
            }),
        ]);

        await disconnectDatabase();
      },
      30_000,
    );

    it(
      'logs into an assigned facility and creates an audited role through the real HTTP stack',
      async () => {
        const database =
          nativeDatabase();

        const authenticationModule =
          createAuthenticationModule({
            database,
            apiConfig,
            authConfig,
          });

        const authorizationModule =
          createAuthorizationModule(
            database,
          );

        const auditModule =
          createAuditModule(
            database,
          );

        const operationalInfrastructure =
          createOperationalInfrastructure({
            database,

            async publishEvent() {
              return undefined;
            },
          });

        const identityInfrastructure =
          createIdentityInfrastructure({
            database,
            authConfig,

            auditRepository:
              auditModule.repository,

            operationalInfrastructure,
          });

        const identityModule =
          createIdentityModule({
            application:
              identityInfrastructure.application,

            authenticationService:
              authenticationModule.service,

            authorizationService:
              authorizationModule.service,
          });

        const application =
          createApp({
            config:
              apiConfig,

            async readinessProbe() {
              return {
                status:
                  'ready',

                checks:
                  [],
              };
            },

            registerRoutes(
              app,
            ) {
              app.use(
                '/api/v1/auth',
                authenticationModule.router,
              );

              app.use(
                '/api/v1/identity',
                identityModule.router,
              );
            },
          });

        const loginResponse =
          await request(
            application,
          )
            .post(
              '/api/v1/auth/login',
            )
            .send({
              facilityId:
                selectedFacilityId
                  .toHexString(),

              login:
                username,

              password,
            })
            .expect(
              200,
            );

        expect(
          loginResponse.body.data.user
            .facilityId,
        ).toBe(
          selectedFacilityId
            .toHexString(),
        );

        expect(
          loginResponse.body.data.user
            .facilityId,
        ).not.toBe(
          differentHomeFacilityId
            .toHexString(),
        );

        const accessToken =
          loginResponse.body.data
            .accessToken as string;

        await request(
          application,
        )
          .get(
            '/api/v1/identity/permissions',
          )
          .set(
            'Authorization',
            `Bearer ${accessToken}`,
          )
          .expect(
            200,
          );

        const idempotencyKey =
          `identity-role-${suffix}`;

        const createResponse =
          await request(
            application,
          )
            .post(
              '/api/v1/identity/roles',
            )
            .set(
              'Authorization',
              `Bearer ${accessToken}`,
            )
            .set(
              'Idempotency-Key',
              idempotencyKey,
            )
            .send({
              facilityId:
                selectedFacilityId
                  .toHexString(),

              code:
                createdRoleCode,

              name:
                'Integration Created Role',

              description:
                'Created by the identity HTTP integration test',

              scope:
                'FACILITY',

              permissionIds:
                [],
            })
            .expect(
              201,
            );

        const createdRoleId =
          createResponse.body.data.role
            .id as string;

        expect(
          createResponse.body.data.role,
        ).toMatchObject({
          code:
            createdRoleCode,

          facilityId:
            selectedFacilityId
              .toHexString(),

          scope:
            'FACILITY',
        });

        await expect(
          database
            .collection(
              'auditLogs',
            )
            .findOne({
              actorId:
                userId,

              action:
                'identity.role.created',

              entityId:
                createdRoleId,
            }),
        ).resolves.not.toBeNull();

        await expect(
          database
            .collection(
              'outboxEvents',
            )
            .findOne({
              eventType:
                'identity.role.created.v1',

              aggregateId:
                createdRoleId,

              status: {
                $in: [
                  'PENDING',
                  'PROCESSING',
                  'PUBLISHED',
                ],
              },
            }),
        ).resolves.not.toBeNull();

        const replayResponse =
          await request(
            application,
          )
            .post(
              '/api/v1/identity/roles',
            )
            .set(
              'Authorization',
              `Bearer ${accessToken}`,
            )
            .set(
              'Idempotency-Key',
              idempotencyKey,
            )
            .send({
              facilityId:
                selectedFacilityId
                  .toHexString(),

              code:
                createdRoleCode,

              name:
                'Integration Created Role',

              description:
                'Created by the identity HTTP integration test',

              scope:
                'FACILITY',

              permissionIds:
                [],
            })
            .expect(
              201,
            );

        expect(
          replayResponse.body.data.role
            .id,
        ).toBe(
          createdRoleId,
        );
      },
      30_000,
    );
  },
);