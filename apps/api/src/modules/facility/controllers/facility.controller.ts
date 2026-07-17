import type {
  Request,
  Response,
} from 'express';

import {
  createApiSuccess,
} from '@hospital-mis/shared';

import type {
  AuthorizationService,
} from '../../authorization/authorization.service.js';

import {
  canManageAllFacilities,
  facilityMutationContextFromRequest,
  requireFacilityPrincipal,
  validatedFacilityPart,
} from '../facility.http-helpers.js';

import type {
  FacilityLifecycleService,
} from '../facility.lifecycle.service.js';

import type {
  CreateFacilityInput,
  FacilityDto,
  FacilityListQuery,
  UpdateFacilityInput,
} from '../facility.types.js';

import type {
  FacilityService,
} from '../services/facility.service.js';

interface FacilityIdParams {
  facilityId:
    string;
}

interface FacilityStatusBody {
  expectedVersion:
    number;

  reason:
    string;
}

function matchesFacilityQuery(
  facility:
    FacilityDto,

  query:
    FacilityListQuery,
): boolean {
  if (
    query.facilityType !==
      undefined &&
    facility.facilityType !==
      query.facilityType
  ) {
    return false;
  }

  if (
    query.status !==
      undefined &&
    facility.status !==
      query.status
  ) {
    return false;
  }

  if (
    query.allowsAuthentication !==
      undefined &&
    facility.allowsAuthentication !==
      query.allowsAuthentication
  ) {
    return false;
  }

  if (
    query.parentFacilityId !==
    undefined
  ) {
    if (
      query.parentFacilityId ===
      null
    ) {
      if (
        facility.parentFacilityId !==
        null
      ) {
        return false;
      }
    } else if (
      facility.parentFacilityId !==
      query.parentFacilityId
    ) {
      return false;
    }
  }

  if (
    query.search !==
    undefined
  ) {
    const search =
      query.search
        .trim()
        .toLocaleLowerCase(
          'en-US',
        );

    const searchable =
      [
        facility.code,
        facility.name,
        facility.legalName ??
          '',
      ]
        .join(' ')
        .toLocaleLowerCase(
          'en-US',
        );

    if (
      !searchable.includes(
        search,
      )
    ) {
      return false;
    }
  }

  return true;
}

export class FacilityController {
  public constructor(
    private readonly facilityService:
      FacilityService,

    private readonly lifecycleService:
      FacilityLifecycleService,

    private readonly authorization:
      AuthorizationService,
  ) {}

  public list = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const query =
      validatedFacilityPart<
        FacilityListQuery
      >(
        request,
        'query',
      );

    const manageAll =
      await canManageAllFacilities(
        request,
        this.authorization,
      );

    if (
      manageAll
    ) {
      const result =
        await this.facilityService
          .list(
            query,
          );

      response
        .status(200)
        .json(
          createApiSuccess(
            result,
            request.correlationId,
          ),
        );

      return;
    }

    const principal =
      requireFacilityPrincipal(
        request,
      );

    const facility =
      await this.facilityService
        .getById(
          principal.facilityId,
        );

    const matches =
      matchesFacilityQuery(
        facility,
        query,
      );

    const totalItems =
      matches
        ? 1
        : 0;

    const items =
      matches &&
      query.page ===
        1
        ? [
            facility,
          ]
        : [];

    response
      .status(200)
      .json(
        createApiSuccess(
          {
            items,

            page:
              query.page,

            pageSize:
              query.pageSize,

            totalItems,

            totalPages:
              totalItems ===
              0
                ? 0
                : 1,
          },
          request.correlationId,
        ),
      );
  };

  public create = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const context =
      facilityMutationContextFromRequest(
        request,
      );

    const result =
      await this.facilityService
        .create(
          validatedFacilityPart<
            CreateFacilityInput
          >(
            request,
            'body',
          ),

          context.actor,
          context.idempotencyKey,
        );

    response
      .status(201)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public getById = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedFacilityPart<
        FacilityIdParams
      >(
        request,
        'params',
      );

    const result =
      await this.facilityService
        .getById(
          params.facilityId,
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
      validatedFacilityPart<
        FacilityIdParams
      >(
        request,
        'params',
      );

    const context =
      facilityMutationContextFromRequest(
        request,
      );

    const result =
      await this.facilityService
        .update(
          params.facilityId,

          validatedFacilityPart<
            UpdateFacilityInput
          >(
            request,
            'body',
          ),

          context.actor,
          context.idempotencyKey,
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

  public activate = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedFacilityPart<
        FacilityIdParams
      >(
        request,
        'params',
      );

    const body =
      validatedFacilityPart<
        FacilityStatusBody
      >(
        request,
        'body',
      );

    const context =
      facilityMutationContextFromRequest(
        request,
      );

    const result =
      await this.lifecycleService
        .activateFacility({
          facilityId:
            params.facilityId,

          expectedVersion:
            body.expectedVersion,

          reason:
            body.reason,

          actor:
            context.actor,

          idempotencyKey:
            context.idempotencyKey,
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

  public deactivate = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedFacilityPart<
        FacilityIdParams
      >(
        request,
        'params',
      );

    const body =
      validatedFacilityPart<
        FacilityStatusBody
      >(
        request,
        'body',
      );

    const context =
      facilityMutationContextFromRequest(
        request,
      );

    const result =
      await this.lifecycleService
        .deactivateFacility({
          facilityId:
            params.facilityId,

          expectedVersion:
            body.expectedVersion,

          reason:
            body.reason,

          actor:
            context.actor,

          idempotencyKey:
            context.idempotencyKey,
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