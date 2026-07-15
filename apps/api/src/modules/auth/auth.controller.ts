import type {
  Request,
  Response,
} from 'express';

import type {
  ApiConfig,
} from '@hospital-mis/config';

import {
  UnauthorizedError,
  createApiSuccess,
} from '@hospital-mis/shared';

import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './auth.cookies.js';

import type {
  AuthenticationService,
} from './auth.service.js';

type LoginBody = {
  facilityId: string;
  login: string;
  password: string;
};

type RevokeSessionParams = {
  sessionId: string;
};

function requirePrincipal(
  request: Request,
) {
  if (
    request.auth ===
    undefined
  ) {
    throw new UnauthorizedError();
  }

  return request.auth;
}

export class AuthenticationController {
  constructor(
    private readonly service:
      AuthenticationService,

    private readonly apiConfig:
      ApiConfig,
  ) {}

  login = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const body =
      request.validated
        .body as LoginBody;

    const result =
      await this.service.login({
        facilityId:
          body.facilityId,

        login:
          body.login,

        password:
          body.password,

        userAgent:
          request.header(
            'user-agent',
          ),

        ipAddress:
          request.ip,
      });

    setRefreshCookie(
      response,
      {
        token:
          result.refreshToken,

        expiresAt:
          new Date(
            result.refreshTokenExpiresAt,
          ),

        production:
          this.apiConfig
            .nodeEnv ===
          'production',
      },
    );

    const {
      refreshToken:
        _refreshToken,

      refreshTokenExpiresAt:
        _refreshTokenExpiresAt,

      ...responseData
    } = result;

    response
      .status(200)
      .json(
        createApiSuccess(
          responseData,
          request.correlationId,
        ),
      );
  };

  refresh = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const refreshToken =
      readRefreshCookie(
        request,
      );

    if (
      refreshToken ===
      undefined
    ) {
      throw new UnauthorizedError(
        'Refresh cookie is missing',
      );
    }

    const result =
      await this.service.refresh({
        refreshToken,

        userAgent:
          request.header(
            'user-agent',
          ),

        ipAddress:
          request.ip,
      });

    setRefreshCookie(
      response,
      {
        token:
          result.refreshToken,

        expiresAt:
          new Date(
            result.refreshTokenExpiresAt,
          ),

        production:
          this.apiConfig
            .nodeEnv ===
          'production',
      },
    );

    const {
      refreshToken:
        _refreshToken,

      refreshTokenExpiresAt:
        _refreshTokenExpiresAt,

      ...responseData
    } = result;

    response
      .status(200)
      .json(
        createApiSuccess(
          responseData,
          request.correlationId,
        ),
      );
  };

  logout = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    await this.service.logout(
      requirePrincipal(
        request,
      ),
    );

    clearRefreshCookie(
      response,
      this.apiConfig.nodeEnv ===
        'production',
    );

    response
      .status(200)
      .json(
        createApiSuccess(
          {
            signedOut:
              true,
          },

          request.correlationId,
        ),
      );
  };

  logoutAll = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const revokedCount =
      await this.service.logoutAll(
        requirePrincipal(
          request,
        ),
      );

    clearRefreshCookie(
      response,
      this.apiConfig.nodeEnv ===
        'production',
    );

    response
      .status(200)
      .json(
        createApiSuccess(
          {
            revokedCount,
          },

          request.correlationId,
        ),
      );
  };

  listSessions = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const sessions =
      await this.service.listSessions(
        requirePrincipal(
          request,
        ),
      );

    response
      .status(200)
      .json(
        createApiSuccess(
          sessions,
          request.correlationId,
        ),
      );
  };

  revokeSession = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const params =
      request.validated
        .params as RevokeSessionParams;

    const revoked =
      await this.service.revokeSession(
        requirePrincipal(
          request,
        ),

        params.sessionId,
      );

    if (
      params.sessionId ===
      request.auth?.sessionId
    ) {
      clearRefreshCookie(
        response,
        this.apiConfig.nodeEnv ===
          'production',
      );
    }

    response
      .status(200)
      .json(
        createApiSuccess(
          {
            revoked,
          },

          request.correlationId,
        ),
      );
  };
}