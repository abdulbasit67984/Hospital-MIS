import type {
  RequestHandler,
} from 'express';

import {
  UnauthorizedError,
  updateRequestContext,
} from '@hospital-mis/shared';

import type {
  AuthenticationService,
} from '../modules/auth/auth.service.js';

function bearerToken(
  authorizationHeader:
    string | undefined,
): string {
  if (
    authorizationHeader ===
    undefined
  ) {
    throw new UnauthorizedError();
  }

  const match =
    /^Bearer\s+(.+)$/i.exec(
      authorizationHeader.trim(),
    );

  if (
    match === null ||
    match[1] === undefined ||
    match[1].length === 0
  ) {
    throw new UnauthorizedError(
      'Authorization header must contain a bearer token',
    );
  }

  return match[1];
}

export function authenticate(
  authenticationService:
    AuthenticationService,
): RequestHandler {
  return async (
    request,
    _response,
    next,
  ) => {
    try {
      const token =
        bearerToken(
          request.header(
            'authorization',
          ),
        );

      const principal =
        await authenticationService.authenticateAccessToken(
          token,
        );

      request.auth =
        principal;

      updateRequestContext({
        actorUserId:
          principal.userId,

        facilityId:
          principal.facilityId,

        sessionId:
          principal.sessionId,
      });

      next();
    } catch (error) {
      next(error);
    }
  };
}