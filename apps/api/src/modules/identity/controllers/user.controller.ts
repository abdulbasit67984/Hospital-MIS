import type {
  Request,
  Response,
} from 'express';

import {
  createApiSuccess,
} from '@hospital-mis/shared';

import type {
  CreateUserInput,
  ReplaceUserRolesInput,
  UpdateUserInput,
  UserListQuery,
} from '../identity.types.js';

import type {
  UserService,
} from '../services/user.service.js';

import type {
  ResetUserPasswordInput,
} from '../workflows/reset-user-password.workflow.js';

import type {
  RevokeUserSessionsInput,
} from '../workflows/revoke-user-sessions.workflow.js';

import {
  identityMutationContextFromRequest,
  validatedPart,
} from './identity-controller.helpers.js';

interface UserIdParams {
  userId:
    string;
}

interface UserDetailsQuery {
  facilityId?:
    string;

  includeExpired?:
    boolean;

  activeOnly?:
    boolean;
}

export class UserController {
  public constructor(
    private readonly userService:
      UserService,
  ) {}

  public list = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const result =
      await this
        .userService
        .list(
          validatedPart<
            UserListQuery
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
        UserIdParams
      >(
        request,
        'params',
      );

    const query =
      validatedPart<
        UserDetailsQuery
      >(
        request,
        'query',
      );

    const result =
      await this
        .userService
        .getWithRoles(
          params.userId,
          query,
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
        .userService
        .create(
          validatedPart<
            CreateUserInput
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
        UserIdParams
      >(
        request,
        'params',
      );

    const result =
      await this
        .userService
        .update(
          params.userId,

          validatedPart<
            UpdateUserInput
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

  public replaceRoles = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPart<
        UserIdParams
      >(
        request,
        'params',
      );

    const result =
      await this
        .userService
        .replaceRoles(
          params.userId,

          validatedPart<
            ReplaceUserRolesInput
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

  public resetPassword = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPart<
        UserIdParams
      >(
        request,
        'params',
      );

    const result =
      await this
        .userService
        .resetPassword(
          params.userId,

          validatedPart<
            ResetUserPasswordInput
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

  public revokeSessions = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPart<
        UserIdParams
      >(
        request,
        'params',
      );

    const result =
      await this
        .userService
        .revokeSessions(
          params.userId,

          validatedPart<
            RevokeUserSessionsInput
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