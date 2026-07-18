import express, {
  type ErrorRequestHandler,
} from 'express';

import request from 'supertest';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  correlationIdMiddleware,
} from '../../../middleware/correlation-id.js';

import {
  createRegistrationQueueRouter,
} from '../registration-queue.routes.js';

const facilityId =
  '507f1f77bcf86cd799439011';

const userId =
  '507f191e810c19729de860e1';

const patientId =
  '507f191e810c19729de860e2';

const departmentId =
  '507f191e810c19729de860e3';

const queueDefinitionId =
  '507f191e810c19729de860e4';

function testRuntime() {
  const permissions:
    string[] = [];

  let registerCommand:
    unknown = null;

  const emptyPage = {
    items:
      [],

    page:
      1,

    pageSize:
      25,

    totalItems:
      0,

    totalPages:
      0,
  };

  const application = {
    services: {
      queryService: {
        async listRegistrations() {
          return emptyPage;
        },

        async listVisits() {
          return emptyPage;
        },

        async listQueueEntries() {
          return emptyPage;
        },

        async getRegistrationById() {
          return {
            registration: {
              id:
                '507f191e810c19729de860e5',
            },

            visit:
              null,

            queue:
              null,

            history:
              [],
          };
        },

        async getRegistrationByNumber() {
          return this.getRegistrationById();
        },

        async getVisitById() {
          return {
            registration:
              null,

            visit: {
              id:
                '507f191e810c19729de860e6',
            },

            queue:
              null,

            history:
              [],
          };
        },

        async getVisitByNumber() {
          return this.getVisitById();
        },

        async getQueueEntry() {
          return {
            registration:
              null,

            visit:
              null,

            queue: {
              queueEntryId:
                'd9428888-122b-4e4f-a61f-879cb972ec04',
            },

            history:
              [],
          };
        },

        async dashboard(
          resolvedFacilityId:
            string,

          query: {
            serviceDate:
              string;
          },
        ) {
          return {
            generatedAt:
              '2026-07-18T04:00:00.000Z',

            query,

            facilityId:
              resolvedFacilityId,

            metrics: {
              serviceDate:
                query.serviceDate,

              totalEntries:
                0,

              activeEntries:
                0,

              waitingEntries:
                0,

              calledEntries:
                0,

              servingEntries:
                0,

              skippedEntries:
                0,

              completedEntries:
                0,

              transferredEntries:
                0,

              cancelledEntries:
                0,

              noShowEntries:
                0,

              averageWaitMinutes:
                null,

              averageServiceMinutes:
                null,

              longestCurrentWaitMinutes:
                null,
            },

            statusCounts:
              [],

            entries:
              [],
          };
        },

        async configuration() {
          return {
            clinics:
              [],

            servicePoints:
              [],

            queueDefinitions:
              [],

            counters:
              [],
          };
        },
      },

      publicDisplayService: {
        async getDisplay() {
          return {
            generatedAt:
              '2026-07-18T04:00:00.000Z',

            facilityId,

            serviceDate:
              '2026-07-18',

            queueDefinitionId,

            queueCode:
              'MED_OPD',

            queueDisplayLabel:
              'Medicine',

            publicDisplayMode:
              'TOKEN_AND_COUNTER',

            entries: [
              {
                queueEntryId:
                  'd9428888-122b-4e4f-a61f-879cb972ec04',

                tokenLabel:
                  'A1',

                status:
                  'CALLED',

                queueDisplayLabel:
                  'Medicine',

                counterCode:
                  'C1',

                counterName:
                  'Counter 1',

                calledAt:
                  '2026-07-18T04:00:00.000Z',

                servingAt:
                  null,

                lastStatusChangedAt:
                  '2026-07-18T04:00:00.000Z',
              },
            ],
          };
        },
      },
    },

    workflows: {
      registerOpdVisit: {
        async execute(
          command:
            unknown,
        ) {
          registerCommand =
            command;

          return {
            registration: {
              id:
                '507f191e810c19729de860e5',

              registrationNumber:
                'REG-KTH-20260718-000001',
            },

            visit: {
              id:
                '507f191e810c19729de860e6',

              visitNumber:
                'OPD-KTH-20260718-000001',
            },

            queue:
              null,
          };
        },
      },

      cancelRegistration: {
        async execute() {
          return {};
        },
      },

      cancelOpdVisit: {
        async execute() {
          return {};
        },
      },

      markOpdVisitNoShow: {
        async execute() {
          return {};
        },
      },

      correctOpdVisit: {
        async execute() {
          return {};
        },
      },

      changeQueueStatus: {
        async execute() {
          return {};
        },
      },

      updateQueueAssignment: {
        async execute() {
          return {};
        },
      },

      updateQueuePriority: {
        async execute() {
          return {};
        },
      },

      transferQueueEntry: {
        async execute() {
          return {};
        },
      },
    },
  };

  const app =
    express();

  app.use(
    correlationIdMiddleware,
  );

  app.use(
    express.json(),
  );

  app.use(
    '/api/v1/opd',

    createRegistrationQueueRouter({
      application:
        application as never,

      authenticationService: {
        async authenticateAccessToken(
          token:
            string,
        ) {
          if (
            token !==
            'valid-token'
          ) {
            const error =
              new Error(
                'Unauthorized',
              ) as Error & {
                statusCode:
                  number;
              };

            error.statusCode =
              401;

            throw error;
          }

          return {
            userId,
            facilityId,

            sessionId:
              'session-001',

            accessTokenId:
              'access-token-001',

            tokenVersion:
              1,

            permissionVersion:
              1,
          };
        },
      } as never,

      authorizationService: {
        async assertPermission(
          _principal:
            unknown,

          permission:
            string,
        ) {
          permissions.push(
            permission,
          );
        },
      } as never,
    }),
  );

  const errorHandler:
    ErrorRequestHandler = (
      error,
      request,
      response,
      _next,
    ) => {
      const statusCode =
        typeof error ===
          'object' &&
        error !==
          null &&
        'statusCode' in
          error &&
        typeof error.statusCode ===
          'number'
          ? error.statusCode
          : 500;

      response
        .status(
          statusCode,
        )
        .json({
          success:
            false,

          message:
            error instanceof Error
              ? error.message
              : 'Unknown error',

          correlationId:
            request.correlationId,
        });
    };

  app.use(
    errorHandler,
  );

  return {
    app,
    permissions,

    registerCommand:
      () =>
        registerCommand,
  };
}

describe(
  'registration and OPD queue module integration',
  () => {
    it(
      'wires authenticated reads, idempotent registration, and privacy-safe display',
      async () => {
        const runtime =
          testRuntime();

        const dashboard =
          await request(
            runtime.app,
          )
            .get(
              '/api/v1/opd/dashboard?serviceDate=2026-07-18',
            )
            .set(
              'Authorization',
              'Bearer valid-token',
            );

        expect(
          dashboard.status,
        ).toBe(
          200,
        );

        expect(
          dashboard.body
            .data
            .metrics
            .totalEntries,
        ).toBe(
          0,
        );

        expect(
          runtime.permissions,
        ).toContain(
          'queues.read',
        );

        const missingIdempotency =
          await request(
            runtime.app,
          )
            .post(
              '/api/v1/opd/registrations',
            )
            .set(
              'Authorization',
              'Bearer valid-token',
            )
            .send({
              registration: {
                patientId,

                registrationMode:
                  'RETURNING_PATIENT',

                registrationSource:
                  'WALK_IN',

                visitType:
                  'RETURNING_PATIENT',

                serviceDate:
                  '2026-07-18',

                arrivedAt:
                  '2026-07-18T09:00:00+05:00',

                departmentId,
              },
            });

        expect(
          missingIdempotency.status,
        ).toBe(
          400,
        );

        const created =
          await request(
            runtime.app,
          )
            .post(
              '/api/v1/opd/registrations',
            )
            .set(
              'Authorization',
              'Bearer valid-token',
            )
            .set(
              'Idempotency-Key',
              'registration-create-001',
            )
            .send({
              registration: {
                patientId,

                registrationMode:
                  'RETURNING_PATIENT',

                registrationSource:
                  'WALK_IN',

                visitType:
                  'RETURNING_PATIENT',

                serviceDate:
                  '2026-07-18',

                arrivedAt:
                  '2026-07-18T09:00:00+05:00',

                departmentId,
              },
            });

        expect(
          created.status,
        ).toBe(
          201,
        );

        expect(
          runtime.registerCommand(),
        ).toMatchObject({
          idempotencyKey:
            'registration-create-001',

          actor: {
            userId,
            facilityId,
          },
        });

        expect(
          runtime.permissions,
        ).toContain(
          'registrations.create',
        );

        const display =
          await request(
            runtime.app,
          )
            .get(
              `/api/v1/opd/public-display?serviceDate=2026-07-18&queueDefinitionId=${queueDefinitionId}`,
            )
            .set(
              'Authorization',
              'Bearer valid-token',
            );

        expect(
          display.status,
        ).toBe(
          200,
        );

        expect(
          display.body
            .data
            .entries[0],
        ).toMatchObject({
          tokenLabel:
            'A1',

          status:
            'CALLED',

          counterCode:
            'C1',
        });

        const serialized =
          JSON.stringify(
            display.body.data,
          ).toLocaleLowerCase(
            'en-US',
          );

        for (
          const forbidden of
          [
            'patientname',
            'mrn',
            'cnic',
            'phone',
          ]
        ) {
          expect(
            serialized,
          ).not.toContain(
            forbidden,
          );
        }

        expect(
          runtime.permissions,
        ).toContain(
          'queues.public_display',
        );
      },
    );
  },
);