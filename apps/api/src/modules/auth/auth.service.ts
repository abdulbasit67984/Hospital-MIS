import {
  createHmac,
  randomUUID,
} from 'node:crypto';

import type {
  AuthConfig,
} from '@hospital-mis/config';

import {
  ConcurrencyConflictError,
  UnauthorizedError,
  calculateSessionPurgeAt,
  hashPassword,
  issueAccessToken,
  issueDeterministicRefreshToken,
  parseRefreshToken,
  reconstructRefreshToken,
  refreshTokenHashMatches,
  verifyAccessToken,
  verifyPassword,
} from '@hospital-mis/shared';

import type {
  AuthRepository,
  RefreshTokenRecord,
  SessionRecord,
  UserRecord,
} from './auth.repository.js';

import type {
  AuthenticatedPrincipal,
  AuthenticationResult,
  AuthenticatedUserSummary,
  SessionSummary,
} from './auth.types.js';

export type AuthenticationPolicy = {
  maxFailedLoginAttempts: number;
  lockoutMilliseconds: number;
  refreshRetryGraceMilliseconds: number;
  sessionTouchIntervalMilliseconds: number;
};

export const defaultAuthenticationPolicy:
  AuthenticationPolicy = {
    maxFailedLoginAttempts:
      5,

    lockoutMilliseconds:
      15 * 60 * 1000,

    refreshRetryGraceMilliseconds:
      30 * 1000,

    sessionTouchIntervalMilliseconds:
      5 * 60 * 1000,
  };

export type LoginInput = {
  facilityId: string;
  login: string;
  password: string;
  userAgent?: string;
  ipAddress?: string;
  now?: Date;
};

export type RefreshInput = {
  refreshToken: string;
  userAgent?: string;
  ipAddress?: string;
  now?: Date;
};

function normalizeLogin(
  login: string,
): string {
  return login
    .normalize('NFKC')
    .trim()
    .toLowerCase();
}

function userSummary(
  user: UserRecord,
): AuthenticatedUserSummary {
  return {
    userId:
      user._id.toHexString(),

    publicId:
      user.publicId,

    facilityId:
      user.facilityId.toHexString(),

    username:
      user.username,

    displayName:
      user.displayName,

    ...(user.email === undefined
      ? {}
      : {
          email:
            user.email,
        }),
  };
}

function hashIpAddress(
  ipAddress: string | undefined,
  secret: string,
): string | undefined {
  if (
    ipAddress === undefined ||
    ipAddress.length === 0
  ) {
    return undefined;
  }

  return createHmac(
    'sha256',
    secret,
  )
    .update(
      ipAddress,
      'utf8',
    )
    .digest(
      'hex',
    );
}

export class AuthenticationService {
  private readonly dummyPasswordHash:
    Promise<string>;

  constructor(
    private readonly repository:
      AuthRepository,

    private readonly config:
      AuthConfig,

    private readonly policy:
      AuthenticationPolicy =
        defaultAuthenticationPolicy,
  ) {
    this.dummyPasswordHash =
      hashPassword(
        'Hospital MIS nonexistent account password 2026',
        config,
      );
  }

  async login(
    input: LoginInput,
  ): Promise<AuthenticationResult> {
    const now =
      input.now ??
      new Date();

    const normalizedLogin =
      normalizeLogin(
        input.login,
      );

    const user =
      await this.repository.findUserForLogin(
        input.facilityId,
        normalizedLogin,
      );

    if (
      user === null
    ) {
      await verifyPassword(
        input.password,
        await this.dummyPasswordHash,
        this.config,
      );

      throw new UnauthorizedError(
        'Invalid username or password',
      );
    }

    const passwordMatches =
      await verifyPassword(
        input.password,
        user.passwordHash,
        this.config,
      );

    if (
      !passwordMatches
    ) {
      await this.repository.recordFailedLogin(
        user,
        {
          now,

          maxAttempts:
            this.policy
              .maxFailedLoginAttempts,

          lockedUntil:
            new Date(
              now.getTime() +
                this.policy
                  .lockoutMilliseconds,
            ),
        },
      );

      throw new UnauthorizedError(
        'Invalid username or password',
      );
    }

    if (
      user.status ===
        'DISABLED' ||
      (
        user.status ===
          'LOCKED' &&
        user.lockedUntil !==
          undefined &&
        user.lockedUntil >
          now
      )
    ) {
      throw new UnauthorizedError(
        'Invalid username or password',
      );
    }

    const userUpdated =
      await this.repository.recordSuccessfulLogin(
        user,
        now,
      );

    if (
      !userUpdated
    ) {
      throw new ConcurrencyConflictError(
        'The user account changed during authentication',
      );
    }

    const sessionId =
      randomUUID();

    const familyId =
      randomUUID();

    const refreshToken =
      issueDeterministicRefreshToken(
        this.config,
        now,
      );

    const purgeAt =
      calculateSessionPurgeAt(
        refreshToken.expiresAt,
        this.config
          .sessionRetentionDays,
      );

    await this.repository.createSession({
      facilityId:
        user.facilityId.toHexString(),

      sessionId,
      familyId,

      userId:
        user._id.toHexString(),

      ...(input.userAgent === undefined
        ? {}
        : {
            userAgent:
              input.userAgent.slice(
                0,
                1000,
              ),
          }),

      ipAddressHash:
        hashIpAddress(
          input.ipAddress,
          this.config
            .refreshTokenHashSecret,
        ),

      expiresAt:
        refreshToken.expiresAt,

      purgeAt,
      now,
    });

    try {
      await this.repository.insertRefreshToken({
        facilityId:
          user.facilityId.toHexString(),

        tokenId:
          refreshToken.tokenId,

        tokenHash:
          refreshToken.tokenHash,

        sessionId,
        familyId,

        userId:
          user._id.toHexString(),

        issuedAt:
          refreshToken.issuedAt,

        expiresAt:
          refreshToken.expiresAt,

        purgeAt,
      });
    } catch (error) {
      await this.repository.deleteSessionAfterFailedCreation(
        sessionId,
      );

      throw error;
    }

    try {
      const accessToken =
        await issueAccessToken(
          {
            userId:
              user._id.toHexString(),

            sessionId,

            facilityId:
              user.facilityId.toHexString(),

            tokenVersion:
              user.tokenVersion,

            now,
          },

          this.config,
        );

      return {
        accessToken:
          accessToken.token,

        accessTokenExpiresAt:
          accessToken.expiresAt.toISOString(),

        refreshToken:
          refreshToken.token,

        refreshTokenExpiresAt:
          refreshToken.expiresAt.toISOString(),

        user:
          userSummary(
            user,
          ),
      };
    } catch (error) {
      await this.repository.revokeSession({
        sessionId,

        userId:
          user._id.toHexString(),

        now,

        reason:
          'Access-token issuance failed',
      });

      throw error;
    }
  }

  async refresh(
    input: RefreshInput,
  ): Promise<AuthenticationResult> {
    return this.refreshInternal(
      input,
      0,
    );
  }

  private async refreshInternal(
    input: RefreshInput,
    attempt: number,
  ): Promise<AuthenticationResult> {
    const now =
      input.now ??
      new Date();

    const parsed =
      parseRefreshToken(
        input.refreshToken,
      );

    const stored =
      await this.repository.findRefreshTokenByTokenId(
        parsed.tokenId,
      );

    if (
      stored === null ||
      !refreshTokenHashMatches(
        input.refreshToken,
        stored.tokenHash,
        this.config
          .refreshTokenHashSecret,
      )
    ) {
      throw new UnauthorizedError(
        'Refresh token is invalid',
      );
    }

    const [
      session,
      user,
    ] =
      await Promise.all([
        this.repository.findSessionBySessionId(
          stored.sessionId,
        ),

        this.repository.findUserById(
          stored.facilityId.toHexString(),
          stored.userId.toHexString(),
        ),
      ]);

    this.assertRefreshContext(
      stored,
      session,
      user,
      now,
    );

    if (
      stored.status ===
      'ROTATED'
    ) {
      return this.handleRotatedToken(
        stored,
        session!,
        user!,
        now,
      );
    }

    if (
      stored.status !==
      'ACTIVE'
    ) {
      throw new UnauthorizedError(
        'Refresh token is no longer active',
      );
    }

    const replacement =
      issueDeterministicRefreshToken(
        this.config,
        now,
      );

    const purgeAt =
      calculateSessionPurgeAt(
        replacement.expiresAt,
        this.config
          .sessionRetentionDays,
      );

    await this.repository.insertRefreshToken({
      facilityId:
        stored.facilityId.toHexString(),

      tokenId:
        replacement.tokenId,

      tokenHash:
        replacement.tokenHash,

      sessionId:
        stored.sessionId,

      familyId:
        stored.familyId,

      userId:
        stored.userId.toHexString(),

      issuedAt:
        replacement.issuedAt,

      expiresAt:
        replacement.expiresAt,

      purgeAt,
    });

    const rotated =
      await this.repository.rotateRefreshToken({
        tokenId:
          stored.tokenId,

        tokenHash:
          stored.tokenHash,

        replacementTokenId:
          replacement.tokenId,

        now,
      });

    if (
      !rotated
    ) {
      await this.repository.deleteActiveRefreshToken(
        replacement.tokenId,
      );

      if (
        attempt < 1
      ) {
        return this.refreshInternal(
          input,
          attempt + 1,
        );
      }

      throw new ConcurrencyConflictError(
        'Refresh-token rotation conflicted with another request',
      );
    }

    const accessToken =
      await issueAccessToken(
        {
          userId:
            user!._id.toHexString(),

          sessionId:
            session!.sessionId,

          facilityId:
            user!.facilityId.toHexString(),

          tokenVersion:
            user!.tokenVersion,

          now,
        },

        this.config,
      );

    return {
      accessToken:
        accessToken.token,

      accessTokenExpiresAt:
        accessToken.expiresAt.toISOString(),

      refreshToken:
        replacement.token,

      refreshTokenExpiresAt:
        replacement.expiresAt.toISOString(),

      user:
        userSummary(
          user!,
        ),
    };
  }

  private assertRefreshContext(
    token: RefreshTokenRecord,
    session: SessionRecord | null,
    user: UserRecord | null,
    now: Date,
  ): void {
    if (
      session === null ||
      user === null
    ) {
      throw new UnauthorizedError(
        'Refresh session is invalid',
      );
    }

    if (
      session.sessionId !==
        token.sessionId ||
      session.familyId !==
        token.familyId ||
      session.userId.toHexString() !==
        token.userId.toHexString()
    ) {
      throw new UnauthorizedError(
        'Refresh session is invalid',
      );
    }

    if (
      session.status !==
        'ACTIVE' ||
      session.expiresAt <=
        now
    ) {
      throw new UnauthorizedError(
        'Refresh session has expired or was revoked',
      );
    }

    if (
      user.status !==
        'ACTIVE'
    ) {
      throw new UnauthorizedError(
        'User account is not active',
      );
    }

    if (
      token.expiresAt <=
      now
    ) {
      throw new UnauthorizedError(
        'Refresh token has expired',
      );
    }
  }

  private async handleRotatedToken(
    stored: RefreshTokenRecord,
    session: SessionRecord,
    user: UserRecord,
    now: Date,
  ): Promise<AuthenticationResult> {
    const withinGrace =
      stored.rotatedAt !==
        undefined &&
      stored.replacedByTokenId !==
        undefined &&
      now.getTime() -
        stored.rotatedAt.getTime() <=
        this.policy
          .refreshRetryGraceMilliseconds;

    if (
      withinGrace &&
      stored.replacedByTokenId !==
        undefined
    ) {
      const replacement =
        await this.repository.findRefreshTokenByTokenId(
          stored.replacedByTokenId,
        );

      if (
        replacement !== null &&
        replacement.status ===
          'ACTIVE' &&
        replacement.sessionId ===
          stored.sessionId &&
        replacement.familyId ===
          stored.familyId &&
        replacement.expiresAt >
          now
      ) {
        const accessToken =
          await issueAccessToken(
            {
              userId:
                user._id.toHexString(),

              sessionId:
                session.sessionId,

              facilityId:
                user.facilityId.toHexString(),

              tokenVersion:
                user.tokenVersion,

              now,
            },

            this.config,
          );

        return {
          accessToken:
            accessToken.token,

          accessTokenExpiresAt:
            accessToken.expiresAt.toISOString(),

          refreshToken:
            reconstructRefreshToken(
              replacement.tokenId,
              this.config
                .refreshTokenHashSecret,
            ),

          refreshTokenExpiresAt:
            replacement.expiresAt.toISOString(),

          user:
            userSummary(
              user,
            ),
        };
      }
    }

    await this.repository.compromiseTokenFamily({
      sessionId:
        stored.sessionId,

      familyId:
        stored.familyId,

      presentedTokenId:
        stored.tokenId,

      now,
    });

    throw new UnauthorizedError(
      'Refresh-token reuse was detected and the session was revoked',
    );
  }

  async authenticateAccessToken(
    token: string,
    now: Date = new Date(),
  ): Promise<AuthenticatedPrincipal> {
    const verified =
      await verifyAccessToken(
        token,
        this.config,
      );

    const [
      user,
      session,
    ] =
      await Promise.all([
        this.repository.findUserById(
          verified.facilityId,
          verified.userId,
        ),

        this.repository.findSessionBySessionId(
          verified.sessionId,
        ),
      ]);

    if (
      user === null ||
      session === null
    ) {
      throw new UnauthorizedError(
        'Authentication session was not found',
      );
    }

    if (
      user.status !==
        'ACTIVE' ||
      user.tokenVersion !==
        verified.tokenVersion
    ) {
      throw new UnauthorizedError(
        'Authentication session is no longer valid',
      );
    }

    if (
      session.status !==
        'ACTIVE' ||
      session.userId.toHexString() !==
        user._id.toHexString() ||
      session.facilityId.toHexString() !==
        user.facilityId.toHexString() ||
      session.expiresAt <=
        now
    ) {
      throw new UnauthorizedError(
        'Authentication session is no longer valid',
      );
    }

    const touchedBefore =
      new Date(
        now.getTime() -
          this.policy
            .sessionTouchIntervalMilliseconds,
      );

    await this.repository.touchSession(
      session.sessionId,
      touchedBefore,
      now,
    );

    return {
      userId:
        user._id.toHexString(),

      sessionId:
        session.sessionId,

      facilityId:
        user.facilityId.toHexString(),

      accessTokenId:
        verified.tokenId,

      tokenVersion:
        user.tokenVersion,

      permissionVersion:
        user.permissionVersion,
    };
  }

  async logout(
    principal: AuthenticatedPrincipal,
    now: Date = new Date(),
  ): Promise<void> {
    await this.repository.revokeSession({
      sessionId:
        principal.sessionId,

      userId:
        principal.userId,

      now,

      reason:
        'User signed out',
    });
  }

  async logoutAll(
    principal: AuthenticatedPrincipal,
    now: Date = new Date(),
  ): Promise<number> {
    return this.repository.revokeAllUserSessions({
      facilityId:
        principal.facilityId,

      userId:
        principal.userId,

      now,

      reason:
        'User revoked all sessions',
    });
  }

  async revokeSession(
    principal: AuthenticatedPrincipal,
    sessionId: string,
    now: Date = new Date(),
  ): Promise<boolean> {
    return this.repository.revokeSession({
      sessionId,

      userId:
        principal.userId,

      now,

      reason:
        sessionId ===
        principal.sessionId
          ? 'Current session revoked'
          : 'Session remotely revoked',
    });
  }

  async listSessions(
    principal: AuthenticatedPrincipal,
  ): Promise<SessionSummary[]> {
    const sessions =
      await this.repository.listUserSessions(
        principal.facilityId,
        principal.userId,
      );

    return sessions.map(
      (session) => ({
        sessionId:
          session.sessionId,

        current:
          session.sessionId ===
          principal.sessionId,

        status:
          session.status,

        ...(session.userAgent === undefined
          ? {}
          : {
              userAgent:
                session.userAgent,
            }),

        lastSeenAt:
          session.lastSeenAt.toISOString(),

        createdAt:
          session.createdAt.toISOString(),

        expiresAt:
          session.expiresAt.toISOString(),
      }),
    );
  }
}