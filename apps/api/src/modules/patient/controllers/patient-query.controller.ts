import type {
  Request,
  Response,
} from 'express';

import {
  ResourceNotFoundError,
  createApiSuccess,
} from '@hospital-mis/shared';

import type {
  PatientApplication,
} from '../patient.application.js';

import {
  patientActorFromRequest,
  patientReadAccessLevelFromRequest,
  validatedPatientPart,
} from '../patient.http-helpers.js';

import type {
  PatientMergePathParams,
  PatientPathParams,
} from '../patient.http.validation.js';

import type {
  PatientDuplicateCheckBody,
} from '../patient.validation.js';

import type {
  PatientProfileHttpQuery,
  PatientSearchHttpQuery,
} from '../patient.query.validation.js';

export class PatientQueryController {
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
        .patientQueryService
        .search(
          validatedPatientPart<
            PatientSearchHttpQuery
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
        PatientPathParams
      >(
        request,
        'params',
      );

    const result =
      await this.application
        .services
        .patientQueryService
        .getProfile(
          params.patientId,

          validatedPatientPart<
            PatientProfileHttpQuery
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

  public resolveCanonical = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPatientPart<
        PatientPathParams
      >(
        request,
        'params',
      );

    const actor =
      patientActorFromRequest(
        request,
      );

    const result =
      await this.application
        .services
        .canonicalization
        .resolve(
          actor.facilityId,
          params.patientId,
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

  public registrationSlip = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPatientPart<
        PatientPathParams
      >(
        request,
        'params',
      );

    const result =
      await this.application
        .services
        .registrationSlipService
        .generate(
          params.patientId,
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

  public duplicateCheck = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const actor =
      patientActorFromRequest(
        request,
      );

    const body =
      validatedPatientPart<
        PatientDuplicateCheckBody
      >(
        request,
        'body',
      );

    const result =
      await this.application
        .services
        .duplicateMatcher
        .assess({
          ...body,

          facilityId:
            actor.facilityId,
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

  public getMerge = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPatientPart<
        PatientMergePathParams
      >(
        request,
        'params',
      );

    const actor =
      patientActorFromRequest(
        request,
      );

    const merge =
      await this.application
        .repositories
        .patientMergeRepository
        .findByMergeId(
          actor.facilityId,
          params.mergeId,
        );

    if (merge === null) {
      throw new ResourceNotFoundError(
        'Patient merge record was not found',
      );
    }

    response
      .status(200)
      .json(
        createApiSuccess(
          {
            mergeId:
              merge.mergeId,

            status:
              merge.status,

            strategy:
              merge.strategy,

            source: {
              patientId:
                merge.sourcePatientId
                  .toHexString(),

              enterprisePatientId:
                merge.sourceEnterprisePatientId,

              mrn:
                merge.sourcePrimaryMrn,

              statusBefore:
                merge.sourceStatusBefore,

              versionBefore:
                merge.sourceVersionBefore,

              versionAfter:
                merge.sourceVersionAfter,
            },

            target: {
              patientId:
                merge.targetPatientId
                  .toHexString(),

              enterprisePatientId:
                merge.targetEnterprisePatientId,

              mrn:
                merge.targetPrimaryMrn,

              statusBefore:
                merge.targetStatusBefore,

              versionBefore:
                merge.targetVersionBefore,

              versionAfter:
                merge.targetVersionAfter,
            },

            evidenceCodes: [
              ...merge.evidenceCodes,
            ],

            reason:
              merge.reason,

            mergedAt:
              merge.mergedAt
                .toISOString(),

            mergedBy:
              merge.mergedBy
                .toHexString(),

            transactionId:
              merge.transactionId,

            correlationId:
              merge.correlationId,
          },
          request.correlationId,
        ),
      );
  };
}