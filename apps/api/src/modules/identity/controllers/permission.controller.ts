import type {
  Request,
  Response,
} from 'express';

import {
  createApiSuccess,
} from '@hospital-mis/shared';

import type {
  PermissionListQuery,
} from '../identity.types.js';

import type {
  PermissionService,
} from '../services/permission.service.js';

import {
  validatedPart,
} from './identity-controller.helpers.js';

interface PermissionIdParams {
  id:
    string;
}

export class PermissionController {
  public constructor(
    private readonly permissionService:
      PermissionService,
  ) {}

  public list = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const result =
      await this
        .permissionService
        .list(
          validatedPart<
            PermissionListQuery
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
        PermissionIdParams
      >(
        request,
        'params',
      );

    const result =
      await this
        .permissionService
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
}