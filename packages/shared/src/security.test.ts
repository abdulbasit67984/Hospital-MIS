import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  calculateSessionPurgeAt,
  generateRefreshToken,
  hashPassword,
  issueAccessToken,
  parseRefreshToken,
  refreshTokenHashMatches,
  verifyAccessToken,
  verifyPassword,
  type AccessTokenSecurityConfig,
  type PasswordSecurityConfig,
  type RefreshTokenSecurityConfig,
} from './security.js';

const passwordConfig:
  PasswordSecurityConfig = {
    passwordPepper:
      'test-password-pepper-that-is-long-enough',

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

const accessTokenConfig:
  AccessTokenSecurityConfig = {
    accessTokenSecret:
      'test-access-token-secret-that-is-long-enough',

    accessTokenKeyId:
      'test-access-key',

    issuer:
      'hospital-mis-test',

    audience:
      'hospital-mis-test-client',

    accessTokenTtlSeconds:
      900,
  };

const refreshTokenConfig:
  RefreshTokenSecurityConfig = {
    refreshTokenHashSecret:
      'test-refresh-token-hash-secret-that-is-long-enough',

    refreshTokenTtlDays:
      30,
  };

describe(
  'password security',
  () => {
    it(
      'hashes and verifies a valid password',
      async () => {
        const password =
          'Strong test password 123';

        const hash =
          await hashPassword(
            password,
            passwordConfig,
          );

        expect(
          hash,
        ).toContain(
          '$argon2id$',
        );

        await expect(
          verifyPassword(
            password,
            hash,
            passwordConfig,
          ),
        ).resolves.toBe(
          true,
        );

        await expect(
          verifyPassword(
            'Incorrect password 123',
            hash,
            passwordConfig,
          ),
        ).resolves.toBe(
          false,
        );
      },
    );

    it(
      'uses a different salt for each password hash',
      async () => {
        const password =
          'Strong test password 123';

        const first =
          await hashPassword(
            password,
            passwordConfig,
          );

        const second =
          await hashPassword(
            password,
            passwordConfig,
          );

        expect(
          first,
        ).not.toBe(
          second,
        );
      },
    );

    it(
      'rejects passwords shorter than policy',
      async () => {
        await expect(
          hashPassword(
            'too-short',
            passwordConfig,
          ),
        ).rejects.toMatchObject({
          code:
            'BAD_REQUEST',
        });
      },
    );

    it(
      'returns false for a malformed stored hash',
      async () => {
        await expect(
          verifyPassword(
            'Strong test password 123',
            'not-an-argon-hash',
            passwordConfig,
          ),
        ).resolves.toBe(
          false,
        );
      },
    );
  },
);

describe(
  'access-token security',
  () => {
    it(
      'issues and verifies an access token',
      async () => {
        const now =
          new Date();

        const issued =
          await issueAccessToken(
            {
              userId:
                '507f1f77bcf86cd799439011',

              sessionId:
                '17d270bc-b8e9-4800-87fa-8c438a2d70ed',

              facilityId:
                '507f191e810c19729de860ea',

              tokenVersion:
                3,

              now,
            },

            accessTokenConfig,
          );

        const verified =
          await verifyAccessToken(
            issued.token,
            accessTokenConfig,
          );

        expect(
          verified.userId,
        ).toBe(
          '507f1f77bcf86cd799439011',
        );

        expect(
          verified.sessionId,
        ).toBe(
          '17d270bc-b8e9-4800-87fa-8c438a2d70ed',
        );

        expect(
          verified.facilityId,
        ).toBe(
          '507f191e810c19729de860ea',
        );

        expect(
          verified.tokenVersion,
        ).toBe(3);

        expect(
          verified.tokenId,
        ).toBe(
          issued.tokenId,
        );
      },
    );

    it(
      'rejects a token signed with another secret',
      async () => {
        const issued =
          await issueAccessToken(
            {
              userId:
                '507f1f77bcf86cd799439011',

              sessionId:
                '17d270bc-b8e9-4800-87fa-8c438a2d70ed',

              facilityId:
                '507f191e810c19729de860ea',

              tokenVersion:
                0,
            },

            accessTokenConfig,
          );

        await expect(
          verifyAccessToken(
            issued.token,
            {
              ...accessTokenConfig,

              accessTokenSecret:
                'different-access-token-secret-that-is-long-enough',
            },
          ),
        ).rejects.toMatchObject({
          code:
            'UNAUTHORIZED',
        });
      },
    );
  },
);

describe(
  'refresh-token security',
  () => {
    it(
      'generates an opaque token and stores only its hash',
      () => {
        const now =
          new Date(
            '2026-07-14T12:00:00.000Z',
          );

        const generated =
          generateRefreshToken(
            refreshTokenConfig,
            now,
          );

        expect(
          generated.token,
        ).toMatch(
          /^rt_[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/i,
        );

        expect(
          generated.tokenHash,
        ).toMatch(
          /^[a-f\d]{64}$/i,
        );

        expect(
          generated.tokenHash,
        ).not.toContain(
          generated.token,
        );

        expect(
          generated.expiresAt.toISOString(),
        ).toBe(
          '2026-08-13T12:00:00.000Z',
        );
      },
    );

    it(
      'parses and verifies a generated refresh token',
      () => {
        const generated =
          generateRefreshToken(
            refreshTokenConfig,
          );

        const parsed =
          parseRefreshToken(
            generated.token,
          );

        expect(
          parsed.tokenId,
        ).toBe(
          generated.tokenId,
        );

        expect(
          refreshTokenHashMatches(
            generated.token,
            generated.tokenHash,
            refreshTokenConfig
              .refreshTokenHashSecret,
          ),
        ).toBe(true);

        expect(
          refreshTokenHashMatches(
            `${generated.token}changed`,
            generated.tokenHash,
            refreshTokenConfig
              .refreshTokenHashSecret,
          ),
        ).toBe(false);
      },
    );

    it(
      'rejects malformed refresh tokens',
      () => {
        expect(
          () =>
            parseRefreshToken(
              'invalid-refresh-token',
            ),
        ).toThrow(
          'Refresh token is invalid',
        );
      },
    );

    it(
      'calculates delayed session cleanup',
      () => {
        const purgeAt =
          calculateSessionPurgeAt(
            new Date(
              '2026-08-13T12:00:00.000Z',
            ),

            90,
          );

        expect(
          purgeAt.toISOString(),
        ).toBe(
          '2026-11-11T12:00:00.000Z',
        );
      },
    );
  },
);