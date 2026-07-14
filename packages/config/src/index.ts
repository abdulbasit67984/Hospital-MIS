import { z } from 'zod';

const positiveIntegerFromString = (
  defaultValue: number,
) =>
  z
    .string()
    .default(
      String(defaultValue),
    )
    .transform(
      (
        value,
        context,
      ) => {
        const parsed =
          Number.parseInt(
            value,
            10,
          );

        if (
          !Number.isSafeInteger(
            parsed,
          ) ||
          parsed <= 0
        ) {
          context.addIssue({
            code: 'custom',
            message:
              `Expected a positive integer, received ${value}`,
          });

          return z.NEVER;
        }

        return parsed;
      },
    );

const commonSchema = z.object({
  NODE_ENV: z
    .enum([
      'development',
      'test',
      'production',
    ])
    .default(
      'development',
    ),

  MONGODB_URI:
    z.string().min(1),

  MONGODB_APP_NAME:
    z
      .string()
      .min(1)
      .default(
        'hospital-mis',
      ),

  MONGODB_SERVER_SELECTION_TIMEOUT_MS:
    positiveIntegerFromString(
      5_000,
    ),

  LOG_LEVEL: z
    .enum([
      'fatal',
      'error',
      'warn',
      'info',
      'debug',
      'trace',
      'silent',
    ])
    .default('info'),

  READINESS_TIMEOUT_MS:
    positiveIntegerFromString(
      3_000,
    ),
});

const apiSchema =
  commonSchema.extend({
    API_PORT:
      positiveIntegerFromString(
        4_000,
      ),

    CORS_ORIGINS:
      z
        .string()
        .default(
          'http://localhost:5173',
        ),

    SOCKET_IO_PATH:
      z
        .string()
        .startsWith('/')
        .default(
          '/socket.io',
        ),
  });

const workerSchema =
  commonSchema.extend({
    WORKER_ID:
      z
        .string()
        .min(1)
        .default(
          'worker-1',
        ),

    WORKER_HEALTH_INTERVAL_MS:
      positiveIntegerFromString(
        15_000,
      ),

    WORKER_SHUTDOWN_TIMEOUT_MS:
      positiveIntegerFromString(
        10_000,
      ),
  });

const authSchema = z
  .object({
    NODE_ENV: z
      .enum([
        'development',
        'test',
        'production',
      ])
      .default(
        'development',
      ),

    AUTH_ACCESS_TOKEN_SECRET:
      z
        .string()
        .min(
          32,
          'AUTH_ACCESS_TOKEN_SECRET must contain at least 32 characters',
        ),

    AUTH_REFRESH_TOKEN_HASH_SECRET:
      z
        .string()
        .min(
          32,
          'AUTH_REFRESH_TOKEN_HASH_SECRET must contain at least 32 characters',
        ),

    AUTH_PASSWORD_PEPPER:
      z
        .string()
        .min(
          32,
          'AUTH_PASSWORD_PEPPER must contain at least 32 characters',
        ),

    AUTH_ACCESS_TOKEN_KEY_ID:
      z
        .string()
        .trim()
        .min(1)
        .max(64)
        .default(
          'hmis-access-v1',
        ),

    AUTH_ISSUER:
      z
        .string()
        .trim()
        .min(1)
        .default(
          'hospital-mis-api',
        ),

    AUTH_AUDIENCE:
      z
        .string()
        .trim()
        .min(1)
        .default(
          'hospital-mis-web',
        ),

    AUTH_ACCESS_TOKEN_TTL_SECONDS:
      positiveIntegerFromString(
        900,
      ),

    AUTH_REFRESH_TOKEN_TTL_DAYS:
      positiveIntegerFromString(
        30,
      ),

    AUTH_SESSION_RETENTION_DAYS:
      positiveIntegerFromString(
        90,
      ),

    AUTH_PASSWORD_MEMORY_KIB:
      positiveIntegerFromString(
        65_536,
      ),

    AUTH_PASSWORD_TIME_COST:
      positiveIntegerFromString(
        3,
      ),

    AUTH_PASSWORD_PARALLELISM:
      positiveIntegerFromString(
        1,
      ),

    AUTH_PASSWORD_HASH_LENGTH:
      positiveIntegerFromString(
        32,
      ),

    AUTH_PASSWORD_MIN_LENGTH:
      positiveIntegerFromString(
        12,
      ),

    AUTH_PASSWORD_MAX_LENGTH:
      positiveIntegerFromString(
        128,
      ),
  })
  .superRefine(
    (
      value,
      context,
    ) => {
      const secrets = [
        value.AUTH_ACCESS_TOKEN_SECRET,
        value.AUTH_REFRESH_TOKEN_HASH_SECRET,
        value.AUTH_PASSWORD_PEPPER,
      ];

      if (
        new Set(
          secrets,
        ).size !== secrets.length
      ) {
        context.addIssue({
          code: 'custom',
          path: [
            'AUTH_ACCESS_TOKEN_SECRET',
          ],
          message:
            'Authentication secrets must use different values',
        });
      }

      if (
        value.AUTH_PASSWORD_MIN_LENGTH >
        value.AUTH_PASSWORD_MAX_LENGTH
      ) {
        context.addIssue({
          code: 'custom',
          path: [
            'AUTH_PASSWORD_MIN_LENGTH',
          ],
          message:
            'Minimum password length cannot exceed maximum password length',
        });
      }

      if (
        value.AUTH_SESSION_RETENTION_DAYS <
        value.AUTH_REFRESH_TOKEN_TTL_DAYS
      ) {
        context.addIssue({
          code: 'custom',
          path: [
            'AUTH_SESSION_RETENTION_DAYS',
          ],
          message:
            'Session retention must not be shorter than refresh-token lifetime',
        });
      }

      if (
        value.NODE_ENV ===
        'production'
      ) {
        const unsafeIndicators = [
          'change-me',
          'development',
          'example',
          'replace-me',
        ];

        for (
          const [
            field,
            secret,
          ] of [
            [
              'AUTH_ACCESS_TOKEN_SECRET',
              value.AUTH_ACCESS_TOKEN_SECRET,
            ],
            [
              'AUTH_REFRESH_TOKEN_HASH_SECRET',
              value.AUTH_REFRESH_TOKEN_HASH_SECRET,
            ],
            [
              'AUTH_PASSWORD_PEPPER',
              value.AUTH_PASSWORD_PEPPER,
            ],
          ] as const
        ) {
          const normalized =
            secret.toLowerCase();

          if (
            unsafeIndicators.some(
              (indicator) =>
                normalized.includes(
                  indicator,
                ),
            )
          ) {
            context.addIssue({
              code: 'custom',
              path: [
                field,
              ],
              message:
                `${field} contains an unsafe production placeholder`,
            });
          }
        }
      }
    },
  );

export type CommonConfig = {
  nodeEnv:
    | 'development'
    | 'test'
    | 'production';

  mongodbUri: string;
  mongodbAppName: string;
  mongodbServerSelectionTimeoutMs: number;

  logLevel:
    | 'fatal'
    | 'error'
    | 'warn'
    | 'info'
    | 'debug'
    | 'trace'
    | 'silent';

  readinessTimeoutMs: number;
};

export type ApiConfig =
  CommonConfig & {
    apiPort: number;
    corsOrigins: string[];
    socketIoPath: string;
  };

export type WorkerConfig =
  CommonConfig & {
    workerId: string;
    healthIntervalMs: number;
    shutdownTimeoutMs: number;
  };

export type AuthConfig = {
  nodeEnv:
    | 'development'
    | 'test'
    | 'production';

  accessTokenSecret: string;
  refreshTokenHashSecret: string;
  passwordPepper: string;

  accessTokenKeyId: string;
  issuer: string;
  audience: string;

  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  sessionRetentionDays: number;

  passwordMemoryKiB: number;
  passwordTimeCost: number;
  passwordParallelism: number;
  passwordHashLength: number;
  passwordMinLength: number;
  passwordMaxLength: number;
};

function mapCommon(
  parsed: z.infer<
    typeof commonSchema
  >,
): CommonConfig {
  return {
    nodeEnv:
      parsed.NODE_ENV,

    mongodbUri:
      parsed.MONGODB_URI,

    mongodbAppName:
      parsed.MONGODB_APP_NAME,

    mongodbServerSelectionTimeoutMs:
      parsed.MONGODB_SERVER_SELECTION_TIMEOUT_MS,

    logLevel:
      parsed.LOG_LEVEL,

    readinessTimeoutMs:
      parsed.READINESS_TIMEOUT_MS,
  };
}

export function loadApiConfig(
  environment:
    NodeJS.ProcessEnv =
      process.env,
): ApiConfig {
  const parsed =
    apiSchema.parse(
      environment,
    );

  return {
    ...mapCommon(parsed),

    apiPort:
      parsed.API_PORT,

    corsOrigins:
      parsed.CORS_ORIGINS
        .split(',')
        .map(
          (origin) =>
            origin.trim(),
        )
        .filter(Boolean),

    socketIoPath:
      parsed.SOCKET_IO_PATH,
  };
}

export function loadWorkerConfig(
  environment:
    NodeJS.ProcessEnv =
      process.env,
): WorkerConfig {
  const parsed =
    workerSchema.parse(
      environment,
    );

  return {
    ...mapCommon(parsed),

    workerId:
      parsed.WORKER_ID,

    healthIntervalMs:
      parsed.WORKER_HEALTH_INTERVAL_MS,

    shutdownTimeoutMs:
      parsed.WORKER_SHUTDOWN_TIMEOUT_MS,
  };
}

export function loadAuthConfig(
  environment:
    NodeJS.ProcessEnv =
      process.env,
): AuthConfig {
  const parsed =
    authSchema.parse(
      environment,
    );

  return {
    nodeEnv:
      parsed.NODE_ENV,

    accessTokenSecret:
      parsed.AUTH_ACCESS_TOKEN_SECRET,

    refreshTokenHashSecret:
      parsed.AUTH_REFRESH_TOKEN_HASH_SECRET,

    passwordPepper:
      parsed.AUTH_PASSWORD_PEPPER,

    accessTokenKeyId:
      parsed.AUTH_ACCESS_TOKEN_KEY_ID,

    issuer:
      parsed.AUTH_ISSUER,

    audience:
      parsed.AUTH_AUDIENCE,

    accessTokenTtlSeconds:
      parsed.AUTH_ACCESS_TOKEN_TTL_SECONDS,

    refreshTokenTtlDays:
      parsed.AUTH_REFRESH_TOKEN_TTL_DAYS,

    sessionRetentionDays:
      parsed.AUTH_SESSION_RETENTION_DAYS,

    passwordMemoryKiB:
      parsed.AUTH_PASSWORD_MEMORY_KIB,

    passwordTimeCost:
      parsed.AUTH_PASSWORD_TIME_COST,

    passwordParallelism:
      parsed.AUTH_PASSWORD_PARALLELISM,

    passwordHashLength:
      parsed.AUTH_PASSWORD_HASH_LENGTH,

    passwordMinLength:
      parsed.AUTH_PASSWORD_MIN_LENGTH,

    passwordMaxLength:
      parsed.AUTH_PASSWORD_MAX_LENGTH,
  };
}