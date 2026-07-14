import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  loadApiConfig,
  loadAuthConfig,
} from './index.js';

describe(
  'loadApiConfig',
  () => {
    it(
      'validates and maps environment variables',
      () => {
        const config =
          loadApiConfig({
            NODE_ENV:
              'test',

            API_PORT:
              '4100',

            MONGODB_URI:
              'mongodb://localhost:27017/test',

            MONGODB_APP_NAME:
              'hospital-mis-test',

            MONGODB_SERVER_SELECTION_TIMEOUT_MS:
              '2000',

            LOG_LEVEL:
              'silent',

            CORS_ORIGINS:
              'http://localhost:5173, http://localhost:3000',

            SOCKET_IO_PATH:
              '/socket.io',

            READINESS_TIMEOUT_MS:
              '1000',
          });

        expect(
          config.apiPort,
        ).toBe(4100);

        expect(
          config.corsOrigins,
        ).toEqual([
          'http://localhost:5173',
          'http://localhost:3000',
        ]);

        expect(
          config.readinessTimeoutMs,
        ).toBe(1000);
      },
    );
  },
);

describe(
  'loadAuthConfig',
  () => {
    const validEnvironment = {
      NODE_ENV:
        'test',

      AUTH_ACCESS_TOKEN_SECRET:
        'access-token-secret-that-is-long-enough-001',

      AUTH_REFRESH_TOKEN_HASH_SECRET:
        'refresh-token-secret-that-is-long-enough-002',

      AUTH_PASSWORD_PEPPER:
        'password-pepper-that-is-long-enough-003',

      AUTH_ACCESS_TOKEN_KEY_ID:
        'test-key',

      AUTH_ISSUER:
        'hospital-mis-test',

      AUTH_AUDIENCE:
        'hospital-mis-test-client',

      AUTH_ACCESS_TOKEN_TTL_SECONDS:
        '600',

      AUTH_REFRESH_TOKEN_TTL_DAYS:
        '14',

      AUTH_SESSION_RETENTION_DAYS:
        '60',

      AUTH_PASSWORD_MEMORY_KIB:
        '4096',

      AUTH_PASSWORD_TIME_COST:
        '2',

      AUTH_PASSWORD_PARALLELISM:
        '1',

      AUTH_PASSWORD_HASH_LENGTH:
        '32',

      AUTH_PASSWORD_MIN_LENGTH:
        '12',

      AUTH_PASSWORD_MAX_LENGTH:
        '128',
    };

    it(
      'maps authentication settings',
      () => {
        const config =
          loadAuthConfig(
            validEnvironment,
          );

        expect(
          config.accessTokenTtlSeconds,
        ).toBe(600);

        expect(
          config.refreshTokenTtlDays,
        ).toBe(14);

        expect(
          config.passwordMemoryKiB,
        ).toBe(4096);

        expect(
          config.accessTokenKeyId,
        ).toBe(
          'test-key',
        );
      },
    );

    it(
      'rejects reused authentication secrets',
      () => {
        expect(
          () =>
            loadAuthConfig({
              ...validEnvironment,

              AUTH_REFRESH_TOKEN_HASH_SECRET:
                validEnvironment
                  .AUTH_ACCESS_TOKEN_SECRET,
            }),
        ).toThrow(
          'Authentication secrets must use different values',
        );
      },
    );

    it(
      'rejects production placeholder secrets',
      () => {
        expect(
          () =>
            loadAuthConfig({
              ...validEnvironment,

              NODE_ENV:
                'production',

              AUTH_PASSWORD_PEPPER:
                'production-password-pepper-change-me-now',
            }),
        ).toThrow(
          'unsafe production placeholder',
        );
      },
    );

    it(
      'rejects retention shorter than token lifetime',
      () => {
        expect(
          () =>
            loadAuthConfig({
              ...validEnvironment,

              AUTH_REFRESH_TOKEN_TTL_DAYS:
                '90',

              AUTH_SESSION_RETENTION_DAYS:
                '30',
            }),
        ).toThrow(
          'Session retention must not be shorter',
        );
      },
    );
  },
);