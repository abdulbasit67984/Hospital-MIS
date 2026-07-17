import type {
  Request,
  Response,
} from 'express';

import {
  createApiSuccess,
} from '@hospital-mis/shared';

import {
  facilityMutationContextFromRequest,
  validatedFacilityPart,
} from '../facility.http-helpers.js';

import type {
  FacilityLifecycleService,
} from '../facility.lifecycle.service.js';

import type {
  CreateDepartmentInput,
  DepartmentListQuery,
  UpdateDepartmentInput,
} from '../facility.types.js';

import type {
  DepartmentService,
} from '../services/department.service.js';

interface FacilityIdParams {
  facilityId:
    string;
}

interface DepartmentIdParams {
  facilityId:
    string;

  departmentId:
    string;
}

interface DepartmentStatusBody {
  expectedVersion:
    number;

  reason:
    string;
}

type DepartmentRouteListQuery =
  Omit<
    DepartmentListQuery,
    'facilityId'
  >;

type DepartmentRouteCreateBody =
  Omit<
    CreateDepartmentInput,
    'facilityId'
  >;

export class DepartmentController {
  public constructor(
    private readonly departmentService:
      DepartmentService,

    private readonly lifecycleService:
      FacilityLifecycleService,
  ) {}

  public list = async (
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

    const query =
      validatedFacilityPart<
        DepartmentRouteListQuery
      >(
        request,
        'query',
      );

    const result =
      await this.departmentService
        .list({
          ...query,

          facilityId:
            params.facilityId,
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

  public create = async (
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
        DepartmentRouteCreateBody
      >(
        request,
        'body',
      );

    const context =
      facilityMutationContextFromRequest(
        request,
      );

    const result =
      await this.departmentService
        .create(
          {
            ...body,

            facilityId:
              params.facilityId,
          },

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
        DepartmentIdParams
      >(
        request,
        'params',
      );

    const result =
      await this.departmentService
        .getByIdInFacility(
          params.departmentId,
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
        DepartmentIdParams
      >(
        request,
        'params',
      );

    const context =
      facilityMutationContextFromRequest(
        request,
      );

    const result =
      await this.departmentService
        .update(
          params.facilityId,
          params.departmentId,

          validatedFacilityPart<
            UpdateDepartmentInput
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
        DepartmentIdParams
      >(
        request,
        'params',
      );

    const body =
      validatedFacilityPart<
        DepartmentStatusBody
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
        .activateDepartment({
          facilityId:
            params.facilityId,

          departmentId:
            params.departmentId,

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
        DepartmentIdParams
      >(
        request,
        'params',
      );

    const body =
      validatedFacilityPart<
        DepartmentStatusBody
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
        .deactivateDepartment({
          facilityId:
            params.facilityId,

          departmentId:
            params.departmentId,

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