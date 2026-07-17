import type {
  Request,
  Response,
} from 'express';

import {
  createApiSuccess,
} from '@hospital-mis/shared';

import type {
  PatientApplication,
} from '../patient.application.js';

import {
  patientActorFromRequest,
  patientMutationContextFromRequest,
  patientReadAccessLevelFromRequest,
  validatedPatientPart,
} from '../patient.http-helpers.js';

import type {
  GuardianPathParams,
} from '../patient.http.validation.js';

import type {
  GuardianProfileHttpQuery,
  GuardianSearchHttpQuery,
} from '../patient.query.validation.js';

import type {
  UpdateGuardianBody,
} from '../patient.validation.js';

export class GuardianController {
  public constructor(
    private readonly application:
      PatientApplication,
  ) {}

  public search = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const result =
      await this.application
        .services
        .guardianQueryService
        .search(
          validatedPatientPart<
            GuardianSearchHttpQuery
          >(
            request,
            'query',
          ),

          patientReadAccessLevelFromRequest(
            request,
          ),

          patientActorFromRequest(
            request,
          ),
        );

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public getProfile = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPatientPart<
        GuardianPathParams
      >(
        request,
        'params',
      );

    const result =
      await this.application
        .services
        .guardianQueryService
        .getProfile(
          params.guardianId,

          validatedPatientPart<
            GuardianProfileHttpQuery
          >(
            request,
            'query',
          ),

          patientReadAccessLevelFromRequest(
            request,
          ),

          patientActorFromRequest(
            request,
          ),
        );

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public update = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPatientPart<
        GuardianPathParams
      >(
        request,
        'params',
      );

    const result =
      await this.application
        .workflows
        .updateGuardian
        .execute({
          guardianId:
            params.guardianId,

          input:
            validatedPatientPart<
              UpdateGuardianBody
            >(
              request,
              'body',
            ),

          ...patientMutationContextFromRequest(
            request,
          ),
        });

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };
}