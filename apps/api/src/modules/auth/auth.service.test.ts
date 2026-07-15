import {
  Types,
} from 'mongoose';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type {
  AuthConfig,
} from '@hospital-mis/config';

import {
  hashPassword,
  issueDeterministicRefreshToken,
} from '@hospital-mis/shared';

import type {
  AuthRepository,
  RefreshTokenRecord,
  SessionRecord,
  UserRecord,
} from './auth.repository.js';

import {
  AuthenticationService,
} from './auth.service.js';

const authConfig:
  AuthConfig = {
    nodeEnv:
      'test',

    accessTokenSecret:
      'access-token-secret-that-is-long-enough-001',

    refreshTokenHashSecret:
      'refresh-token-hash-secret-that-is-long-enough-002',

    passwordPepper:
      'password-pepper-that-is-long-enough-003',

    accessTokenKeyId:
      'test-key',

    issuer:
      'hospital-mis-test',

    audience:
      'hospital-mis-test-client',

    accessTokenTtlSeconds:
      900,

    refreshTokenTtlDays:
      30,

    sessionRetentionDays:
      90,

    passwordMemoryKiB:
      4096,

    passwordTimeCost:
      2,

    passwordParallelism:
      1,

    passwordHashLength:
      32,

    passwordMinLength:
      12,

    passwordMaxLength:
      128,
  };

function repositoryMock():
  AuthRepository {
  return {
    findUserForLogin:
      vi.fn(),

    findUserById:
      vi.fn(),

    recordFailedLogin:
      vi.fn(),

    recordSuccessfulLogin:
      vi.fn(),

    createSession:
      vi.fn(),

    deleteSessionAfterFailedCreation:
      vi.fn(),

    insertRefreshToken:
      vi.fn(),

    deleteActiveRefreshToken:
      vi.fn(),

    findRefreshTokenByTokenId:
      vi.fn(),

    findSessionBySessionId:
      vi.fn(),

    rotateRefreshToken:
      vi.fn(),

    touchSession:
      vi.fn(),

    revokeSession:
      vi.fn(),

    revokeAllUserSessions:
      vi.fn(),

    compromiseTokenFamily:
      vi.fn(),

    listUserSessions:
      vi.fn(),
  };
}

async function activeUser():
  Promise<UserRecord> {
  const now =
    new Date(
      '2026-07-15T10:00:00.000Z',
    );

  return {
    _id:
      new Types.ObjectId(),

    facilityId:
      new Types.ObjectId(),

    publicId:
      'USR-000001',

    username:
      'admin',

    normalizedUsername:
      'admin',

    displayName:
      'System Administrator',

    passwordHash:
      await hashPassword(
        'Strong password 123',
        authConfig,
      ),

    status:
      'ACTIVE',

    failedLoginCount:
      0,

    passwordChangedAt:
      now,

    tokenVersion:
      0,

    permissionVersion:
      0,

    version:
      0,

    schemaVersion:
      1,

    createdAt:
      now,

    updatedAt:
      now,
  };
}

describe(
  'AuthenticationService',
  () => {
    let repository:
      AuthRepository;

    beforeEach(
      () => {
        repository =
          repositoryMock();
      },
    );

    it(
      'creates a session and tokens after valid login',
      async () => {
        const user =
          await activeUser();

        vi.mocked(
          repository.findUserForLogin,
        ).mockResolvedValue(
          user,
        );

        vi.mocked(
          repository.recordSuccessfulLogin,
        ).mockResolvedValue(
          true,
        );

        const service =
          new AuthenticationService(
            repository,
            authConfig,
          );

        const result =
          await service.login({
            facilityId:
              user.facilityId.toHexString(),

            login:
              'ADMIN',

            password:
              'Strong password 123',

            now:
              new Date(
                '2026-07-15T12:00:00.000Z',
              ),
          });

        expect(
          result.accessToken,
        ).toBeTruthy();

        expect(
          result.refreshToken,
        ).toMatch(
          /^rt_/,
        );

        expect(
          result.user.username,
        ).toBe(
          'admin',
        );

        expect(
          repository.createSession,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          repository.insertRefreshToken,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      'records a failed login without revealing account existence',
      async () => {
        const user =
          await activeUser();

        vi.mocked(
          repository.findUserForLogin,
        ).mockResolvedValue(
          user,
        );

        vi.mocked(
          repository.recordFailedLogin,
        ).mockResolvedValue(
          true,
        );

        const service =
          new AuthenticationService(
            repository,
            authConfig,
          );

        await expect(
          service.login({
            facilityId:
              user.facilityId.toHexString(),

            login:
              'admin',

            password:
              'Wrong password 123',

            now:
              new Date(),
          }),
        ).rejects.toMatchObject({
          code:
            'UNAUTHORIZED',

          message:
            'Invalid username or password',
        });

        expect(
          repository.recordFailedLogin,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      'rotates an active refresh token',
      async () => {
        const user =
          await activeUser();

        const now =
          new Date(
            '2026-07-15T12:00:00.000Z',
          );

        const original =
          issueDeterministicRefreshToken(
            authConfig,
            now,
          );

        const sessionId =
          '5de81ce9-845f-42e4-907f-c66503bdfd4a';

        const familyId =
          '65bf76b3-d2e4-49ab-b852-2607196aba8e';

        const storedToken:
          RefreshTokenRecord = {
          _id:
            new Types.ObjectId(),

          facilityId:
            user.facilityId,

          tokenId:
            original.tokenId,

          tokenHash:
            original.tokenHash,

          sessionId,
          familyId,

          userId:
            user._id,

          status:
            'ACTIVE',

          issuedAt:
            original.issuedAt,

          expiresAt:
            original.expiresAt,

          purgeAt:
            new Date(
              '2026-11-11T12:00:00.000Z',
            ),

          version:
            0,

          schemaVersion:
            1,

          createdAt:
            now,

          updatedAt:
            now,
        };

        const session:
          SessionRecord = {
          _id:
            new Types.ObjectId(),

          facilityId:
            user.facilityId,

          sessionId,
          familyId,

          userId:
            user._id,

          status:
            'ACTIVE',

          lastSeenAt:
            now,

          expiresAt:
            original.expiresAt,

          purgeAt:
            new Date(
              '2026-11-11T12:00:00.000Z',
            ),

          version:
            0,

          schemaVersion:
            1,

          createdAt:
            now,

          updatedAt:
            now,
        };

        vi.mocked(
          repository.findRefreshTokenByTokenId,
        ).mockResolvedValue(
          storedToken,
        );

        vi.mocked(
          repository.findSessionBySessionId,
        ).mockResolvedValue(
          session,
        );

        vi.mocked(
          repository.findUserById,
        ).mockResolvedValue(
          user,
        );

        vi.mocked(
          repository.rotateRefreshToken,
        ).mockResolvedValue(
          true,
        );

        const service =
          new AuthenticationService(
            repository,
            authConfig,
          );

        const result =
          await service.refresh({
            refreshToken:
              original.token,

            now:
              new Date(
                '2026-07-15T12:05:00.000Z',
              ),
          });

        expect(
          result.refreshToken,
        ).not.toBe(
          original.token,
        );

        expect(
          repository.rotateRefreshToken,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      'marks a token family compromised when an old token is reused outside grace',
      async () => {
        const user =
          await activeUser();

        const issuedAt =
          new Date(
            '2026-07-15T12:00:00.000Z',
          );

        const original =
          issueDeterministicRefreshToken(
            authConfig,
            issuedAt,
          );

        const storedToken:
          RefreshTokenRecord = {
          _id:
            new Types.ObjectId(),

          facilityId:
            user.facilityId,

          tokenId:
            original.tokenId,

          tokenHash:
            original.tokenHash,

          sessionId:
            '5de81ce9-845f-42e4-907f-c66503bdfd4a',

          familyId:
            '65bf76b3-d2e4-49ab-b852-2607196aba8e',

          userId:
            user._id,

          status:
            'ROTATED',

          issuedAt:
            original.issuedAt,

          expiresAt:
            original.expiresAt,

          rotatedAt:
            new Date(
              '2026-07-15T12:01:00.000Z',
            ),

          replacedByTokenId:
            '0d8be96d-e985-4a7e-8ac6-1626bb687873',

          purgeAt:
            new Date(
              '2026-11-11T12:00:00.000Z',
            ),

          version:
            1,

          schemaVersion:
            1,

          createdAt:
            issuedAt,

          updatedAt:
            issuedAt,
        };

        const session:
          SessionRecord = {
          _id:
            new Types.ObjectId(),

          facilityId:
            user.facilityId,

          sessionId:
            storedToken.sessionId,

          familyId:
            storedToken.familyId,

          userId:
            user._id,

          status:
            'ACTIVE',

          lastSeenAt:
            issuedAt,

          expiresAt:
            original.expiresAt,

          purgeAt:
            storedToken.purgeAt,

          version:
            0,

          schemaVersion:
            1,

          createdAt:
            issuedAt,

          updatedAt:
            issuedAt,
        };

        vi.mocked(
          repository.findRefreshTokenByTokenId,
        ).mockResolvedValue(
          storedToken,
        );

        vi.mocked(
          repository.findSessionBySessionId,
        ).mockResolvedValue(
          session,
        );

        vi.mocked(
          repository.findUserById,
        ).mockResolvedValue(
          user,
        );

        const service =
          new AuthenticationService(
            repository,
            authConfig,
          );

        await expect(
          service.refresh({
            refreshToken:
              original.token,

            now:
              new Date(
                '2026-07-15T12:10:00.000Z',
              ),
          }),
        ).rejects.toMatchObject({
          code:
            'UNAUTHORIZED',
        });

        expect(
          repository.compromiseTokenFamily,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );
  },
);