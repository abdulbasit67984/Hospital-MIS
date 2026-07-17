import express, {
  type ErrorRequestHandler,
} from 'express';

import request from 'supertest';

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  AppError,
  ForbiddenError,
} from '@hospital-mis/shared';

import type {
  AuthenticationService,
} from '../../auth/auth.service.js';

import type {
  AuthorizationService,
} from '../../authorization/authorization.service.js';

import type {
  PatientApplication,
} from '../patient.application.js';

import {
  PATIENT_PERMISSION_KEYS,
} from '../patient.constants.js';

import {
  createGuardianRouter,
} from '../guardian.routes.js';

import {
  createPatientRouter,
} from '../patient.routes.js';

const facilityId =
  '507f191e810c19729de860ea';

const patientId =
  '507f1f77bcf86cd799439011';

const targetPatientId =
  '507f1f77bcf86cd799439012';

const guardianId =
  '507f1f77bcf86cd799439013';

const principal = {
  userId:
    '507f1f77bcf86cd799439014',

  sessionId:
    '25da21e9-d661-41dc-b2e8-734f30f3f5a8',

  facilityId,

  accessTokenId:
    'access-token-1',

  tokenVersion:
    0,

  permissionVersion:
    0,
};

function createFixture(
  allowSensitive =
    true,
) {
  const authenticationService = {
    authenticateAccessToken:
      vi.fn()
        .mockResolvedValue(
          principal,
        ),
  } as unknown as AuthenticationService;

  const assertPermission =
    vi.fn(
      async (
        _principal,
        permission:
          string,
      ) => {
        if (
          permission ===
            PATIENT_PERMISSION_KEYS
              .READ_SENSITIVE &&
          !allowSensitive
        ) {
          throw new ForbiddenError(
            'Sensitive patient information is not permitted',
          );
        }
      },
    );

  const authorizationService = {
    assertPermission,

    hasPermission:
      vi.fn()
        .mockResolvedValue(
          allowSensitive,
        ),
  } as unknown as AuthorizationService;

  const patientSearch =
    vi.fn()
      .mockResolvedValue({
        items: [
          {
            id:
              patientId,

            enterprisePatientId:
              'df813c04-c7a6-4e20-861c-95ea2f5d8044',

            mrn:
              'MAIN-2026-000087',

            displayName:
              'Ayesha Khan',

            matchedBy: [
              'MRN',
            ],
          },
        ],

        page:
          1,

        pageSize:
          20,

        totalItems:
          1,

        totalPages:
          1,
      });

  const registerPatient =
    vi.fn()
      .mockResolvedValue({
        patientId,
        enterprisePatientId:
          'df813c04-c7a6-4e20-861c-95ea2f5d8044',
        mrn:
          'MAIN-2026-000087',
        status:
          'ACTIVE',
      });

  const mergePatients =
    vi.fn()
      .mockResolvedValue({
        mergeId:
          'bc401615-90a2-4a95-b5dc-493b996f8497',

        status:
          'COMPLETED',

        strategy:
          'CANONICAL_REDIRECT',
      });

  const updateGuardian =
    vi.fn()
      .mockResolvedValue({
        id:
          guardianId,

        status:
          'ACTIVE',

        version:
          2,
      });

  const application = {
    services: {
      patientQueryService: {
        search:
          patientSearch,

        getProfile:
          vi.fn(),
      },

      guardianQueryService: {
        search:
          vi.fn(),

        getProfile:
          vi.fn(),
      },

      registrationSlipService: {
        generate:
          vi.fn(),
      },

      canonicalization: {
        resolve:
          vi.fn(),
      },

      duplicateMatcher: {
        assess:
          vi.fn(),
      },
    },

    repositories: {
      patientMergeRepository: {
        findByMergeId:
          vi.fn(),
      },
    },

    workflows: {
      registerPatient: {
        execute:
          registerPatient,
      },

      updatePatient: {
        execute:
          vi.fn(),
      },

      updateGuardian: {
        execute:
          updateGuardian,
      },

      addPatientIdentifier: {
        execute:
          vi.fn(),
      },

      verifyPatientIdentifier: {
        execute:
          vi.fn(),
      },

      revokePatientIdentifier: {
        execute:
          vi.fn(),
      },

      linkPatientGuardian: {
        execute:
          vi.fn(),
      },

      verifyPatientGuardian: {
        execute:
          vi.fn(),
      },

      endPatientGuardian: {
        execute:
          vi.fn(),
      },

      addPatientContact: {
        execute:
          vi.fn(),
      },

      updatePatientContact: {
        execute:
          vi.fn(),
      },

      verifyPatientContact: {
        execute:
          vi.fn(),
      },

      deactivatePatientContact: {
        execute:
          vi.fn(),
      },

      addPatientAddress: {
        execute:
          vi.fn(),
      },

      updatePatientAddress: {
        execute:
          vi.fn(),
      },

      deactivatePatientAddress: {
        execute:
          vi.fn(),
      },

      createPatientAlert: {
        execute:
          vi.fn(),
      },

      resolvePatientAlert: {
        execute:
          vi.fn(),
      },

      resolveDuplicateReview: {
        execute:
          vi.fn(),
      },

      mergePatients: {
        execute:
          mergePatients,
      },
    },
  } as unknown as PatientApplication;

  const app =
    express();

  app.use(
    (
      request,
      _response,
      next,
    ) => {
      request.correlationId =
        'test-correlation-id';

      next();
    },
  );

  app.use(
    express.json(),
  );

  app.use(
    '/api/v1/patients',

    createPatientRouter({
      application,
      authenticationService,
      authorizationService,
    }),
  );

  app.use(
    '/api/v1/guardians',

    createGuardianRouter({
      application,
      authenticationService,
      authorizationService,
    }),
  );

  const errorHandler:
    ErrorRequestHandler =
    (
      error:
        unknown,
      request,
      response,
      _next,
    ) => {
      if (
        error instanceof
        AppError
      ) {
        response
          .status(
            error.statusCode,
          )
          .json({
            success:
              false,

            error: {
              code:
                error.code,

              message:
                error.message,

              correlationId:
                request.correlationId,
            },
          });

        return;
      }

      response
        .status(500)
        .json({
          success:
            false,
        });
    };

  app.use(
    errorHandler,
  );

  return {
    app,
    assertPermission,
    patientSearch,
    registerPatient,
    mergePatients,
    updateGuardian,
  };
}

function bearer<T extends Readonly<{
  set(
    name: string,
    value: string,
  ): T;
}>>(
  requestBuilder:
    T,
): T {
  return requestBuilder.set(
    'Authorization',
    'Bearer test-token',
  );
}

describe(
  'patient HTTP boundary',
  () => {
    it(
      'uses standard masked access by default for patient search',
      async () => {
        const fixture =
          createFixture();

        const response =
          await bearer(
            request(
              fixture.app,
            ).get(
              '/api/v1/patients/search?term=MAIN-2026-000087&mode=MRN',
            ),
          );

        expect(
          response.status,
        ).toBe(200);

        expect(
          fixture.patientSearch,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            term:
              'MAIN-2026-000087',

            mode:
              'MRN',

            page:
              1,

            pageSize:
              20,
          }),
          'STANDARD',
          expect.objectContaining({
            facilityId,

            userId:
              principal.userId,
          }),
        );

        expect(
          fixture.assertPermission,
        ).toHaveBeenCalledWith(
          principal,
          PATIENT_PERMISSION_KEYS.READ,
        );

        expect(
          fixture.assertPermission,
        ).not.toHaveBeenCalledWith(
          principal,
          PATIENT_PERMISSION_KEYS
            .READ_SENSITIVE,
        );
      },
    );

    it(
      'blocks a requested sensitive read before invoking the query service',
      async () => {
        const fixture =
          createFixture(
            false,
          );

        const response =
          await bearer(
            request(
              fixture.app,
            )
              .get(
                '/api/v1/patients/search?term=Ayesha&mode=NAME',
              )
              .set(
                'X-Patient-Access-Level',
                'SENSITIVE',
              ),
          );

        expect(
          response.status,
        ).toBe(403);

        expect(
          fixture.patientSearch,
        ).not.toHaveBeenCalled();

        expect(
          fixture.assertPermission,
        ).toHaveBeenCalledWith(
          principal,
          PATIENT_PERMISSION_KEYS
            .READ_SENSITIVE,
        );
      },
    );

    it(
      'passes validated registration data, actor context, and idempotency key to the durable workflow',
      async () => {
        const fixture =
          createFixture();

        const response =
          await bearer(
            request(
              fixture.app,
            )
              .post(
                '/api/v1/patients',
              )
              .set(
                'Idempotency-Key',
                'patient-register-0001',
              )
              .send({
                firstName:
                  'Ayesha',

                lastName:
                  'Khan',

                birthDate: {
                  value:
                    '1988-04-02T00:00:00.000Z',

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

                sexAtBirth:
                  'FEMALE',

                identifiers: [
                  {
                    identifierType:
                      'CNIC',

                    value:
                      '35202-1234567-1',

                    issuingCountryCode:
                      'PK',

                    isPrimaryIdentity:
                      true,
                  },
                ],
              }),
          );

        expect(
          response.status,
        ).toBe(201);

        expect(
          fixture.registerPatient,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            input:
              expect.objectContaining({
                firstName:
                  'Ayesha',

                isMinor:
                  false,
              }),

            actor:
              expect.objectContaining({
                userId:
                  principal.userId,

                facilityId,
              }),

            idempotencyKey:
              'patient-register-0001',
          }),
        );

        expect(
          fixture.assertPermission,
        ).toHaveBeenCalledWith(
          principal,
          PATIENT_PERMISSION_KEYS.CREATE,
        );

        expect(
          fixture.assertPermission,
        ).not.toHaveBeenCalledWith(
          principal,
          PATIENT_PERMISSION_KEYS
            .GUARDIAN_MANAGE,
        );
      },
    );

    it(
      'restricts merge execution to the centralized merge permission',
      async () => {
        const fixture =
          createFixture();

        const response =
          await bearer(
            request(
              fixture.app,
            )
              .post(
                `/api/v1/patients/${patientId}/merge`,
              )
              .set(
                'Idempotency-Key',
                'patient-merge-0001',
              )
              .send({
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
                  'The same identity document and demographic record were confirmed by medical records staff.',

                acknowledgement:
                  'I_CONFIRM_PATIENT_MERGE',
              }),
          );

        expect(
          response.status,
        ).toBe(200);

        expect(
          fixture.assertPermission,
        ).toHaveBeenCalledWith(
          principal,
          PATIENT_PERMISSION_KEYS.MERGE,
        );

        expect(
          fixture.mergePatients,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            sourcePatientId:
              patientId,

            input:
              expect.objectContaining({
                targetPatientId,

                acknowledgement:
                  'I_CONFIRM_PATIENT_MERGE',
              }),

            idempotencyKey:
              'patient-merge-0001',
          }),
        );
      },
    );

    it(
      'uses the guardian management permission for guardian updates',
      async () => {
        const fixture =
          createFixture();

        const response =
          await bearer(
            request(
              fixture.app,
            )
              .patch(
                `/api/v1/guardians/${guardianId}`,
              )
              .set(
                'Idempotency-Key',
                'guardian-update-0001',
              )
              .send({
                phone:
                  '0302-5555555',

                expectedVersion:
                  1,

                reason:
                  'Guardian provided an updated contact number.',
              }),
          );

        expect(
          response.status,
        ).toBe(200);

        expect(
          fixture.assertPermission,
        ).toHaveBeenCalledWith(
          principal,
          PATIENT_PERMISSION_KEYS
            .GUARDIAN_MANAGE,
        );

        expect(
          fixture.updateGuardian,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            guardianId,

            idempotencyKey:
              'guardian-update-0001',
          }),
        );
      },
    );
  },
);