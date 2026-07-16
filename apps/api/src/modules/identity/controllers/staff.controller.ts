import type {
  Request,
  Response,
} from 'express';

import {
  createApiSuccess,
} from '@hospital-mis/shared';

import type {
  CreateStaffInput,
  StaffListQuery,
  UpdateStaffInput,
} from '../identity.types.js';

import type {
  StaffService,
} from '../services/staff.service.js';

import {
  identityMutationContextFromRequest,
  validatedPart,
} from './identity-controller.helpers.js';

interface StaffIdParams {
  id:
    string;
}

export class StaffController {
  public constructor(
    private readonly staffService:
      StaffService,
  ) {}

  public list = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const result =
      await this
        .staffService
        .list(
          validatedPart<
            StaffListQuery
          >(
            request,
            'query',
          ),
        );

    response
      .status(
        200,
      )
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
      validatedPart<
        StaffIdParams
      >(
        request,
        'params',
      );

    const result =
      await this
        .staffService
        .getById(
          params.id,
        );

    response
      .status(
        200,
      )
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
    const result =
      await this
        .staffService
        .create(
          validatedPart<
            CreateStaffInput
          >(
            request,
            'body',
          ),

          identityMutationContextFromRequest(
            request,
          ),
        );

    response
      .status(
        201,
      )
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
      validatedPart<
        StaffIdParams
      >(
        request,
        'params',
      );

    const result =
      await this
        .staffService
        .update(
          params.id,

          validatedPart<
            UpdateStaffInput
          >(
            request,
            'body',
          ),

          identityMutationContextFromRequest(
            request,
          ),
        );

    response
      .status(
        200,
      )
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };
}