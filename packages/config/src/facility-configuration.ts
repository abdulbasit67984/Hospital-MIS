import {
  z,
} from 'zod';

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

function normalizeBase64(
  value: string,
): string {
  return value
    .trim()
    .replace(
      /\s+/gu,
      '',
    );
}

function isCanonicalBase64(
  value: string,
): boolean {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      value,
    )
  ) {
    return false;
  }

  const decoded =
    Buffer.from(
      value,
      'base64',
    );

  return (
    decoded
      .toString('base64')
      .replace(
        /=+$/u,
        '',
      ) ===
    value.replace(
      /=+$/u,
      '',
    )
  );
}

const encryptionKeyMapSchema =
  z
    .string()
    .trim()
    .min(2)
    .transform(
      (
        serialized,
        context,
      ) => {
        let parsed:
          unknown;

        try {
          parsed =
            JSON.parse(
              serialized,
            ) as unknown;
        } catch {
          context.addIssue({
            code: 'custom',
            message:
              'FACILITY_CONFIGURATION_ENCRYPTION_KEYS_JSON must contain valid JSON',
          });

          return z.NEVER;
        }

        if (
          typeof parsed !==
            'object' ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
          context.addIssue({
            code: 'custom',
            message:
              'FACILITY_CONFIGURATION_ENCRYPTION_KEYS_JSON must contain an object',
          });

          return z.NEVER;
        }

        const entries =
          Object.entries(
            parsed,
          );

        if (
          entries.length === 0
        ) {
          context.addIssue({
            code: 'custom',
            message:
              'At least one sensitive-setting encryption key is required',
          });

          return z.NEVER;
        }

        const result:
          Record<
            string,
            string
          > = {};

        for (
          const [
            rawVersion,
            rawEncodedKey,
          ] of entries
        ) {
          const version =
            rawVersion.trim();

          if (
            !/^[A-Za-z0-9._-]{1,80}$/u.test(
              version,
            )
          ) {
            context.addIssue({
              code: 'custom',
              message:
                `Invalid sensitive-setting key version: ${rawVersion}`,
            });

            return z.NEVER;
          }

          if (
            typeof rawEncodedKey !==
            'string'
          ) {
            context.addIssue({
              code: 'custom',
              message:
                `Sensitive-setting key ${version} must be a base64 string`,
            });

            return z.NEVER;
          }

          const encodedKey =
            normalizeBase64(
              rawEncodedKey,
            );

          if (
            !isCanonicalBase64(
              encodedKey,
            )
          ) {
            context.addIssue({
              code: 'custom',
              message:
                `Sensitive-setting key ${version} is not valid canonical base64`,
            });

            return z.NEVER;
          }

          const decoded =
            Buffer.from(
              encodedKey,
              'base64',
            );

          if (
            decoded.length !== 32
          ) {
            context.addIssue({
              code: 'custom',
              message:
                `Sensitive-setting key ${version} must decode to exactly 32 bytes`,
            });

            return z.NEVER;
          }

          result[version] =
            encodedKey;
        }

        return result;
      },
    );

const facilityConfigurationSchema =
  z
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

      FACILITY_CONFIGURATION_ENCRYPTION_ACTIVE_KEY_VERSION:
        z
          .string()
          .trim()
          .min(1)
          .max(80)
          .regex(
            /^[A-Za-z0-9._-]+$/,
          ),

      FACILITY_CONFIGURATION_ENCRYPTION_KEYS_JSON:
        encryptionKeyMapSchema,

      FACILITY_CONFIGURATION_HASH_SECRET:
        z
          .string()
          .min(
            32,
            'FACILITY_CONFIGURATION_HASH_SECRET must contain at least 32 characters',
          ),

      FACILITY_CONFIGURATION_CACHE_DEFAULT_TTL_SECONDS:
        positiveIntegerFromString(
          300,
        ),

      FACILITY_CONFIGURATION_CACHE_MAX_ENTRIES:
        positiveIntegerFromString(
          10_000,
        ),
    })
    .superRefine(
      (
        value,
        context,
      ) => {
        const activeKey =
          value
            .FACILITY_CONFIGURATION_ENCRYPTION_KEYS_JSON[
            value
              .FACILITY_CONFIGURATION_ENCRYPTION_ACTIVE_KEY_VERSION
          ];

        if (
          activeKey ===
          undefined
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'FACILITY_CONFIGURATION_ENCRYPTION_ACTIVE_KEY_VERSION',
            ],
            message:
              'The active sensitive-setting key version is not present in FACILITY_CONFIGURATION_ENCRYPTION_KEYS_JSON',
          });
        }

        const decodedFingerprints =
          Object.values(
            value
              .FACILITY_CONFIGURATION_ENCRYPTION_KEYS_JSON,
          ).map(
            (encodedKey) =>
              Buffer.from(
                encodedKey,
                'base64',
              ).toString(
                'hex',
              ),
          );

        if (
          new Set(
            decodedFingerprints,
          ).size !==
          decodedFingerprints.length
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'FACILITY_CONFIGURATION_ENCRYPTION_KEYS_JSON',
            ],
            message:
              'Different sensitive-setting key versions must not reuse the same key material',
          });
        }

        if (
          value.NODE_ENV !==
          'production'
        ) {
          return;
        }

        const unsafeIndicators = [
          'change-me',
          'development',
          'example',
          'replace-me',
          '0123456789abcdef',
        ];

        const normalizedHashSecret =
          value
            .FACILITY_CONFIGURATION_HASH_SECRET
            .toLocaleLowerCase(
              'en-US',
            );

        if (
          unsafeIndicators.some(
            (indicator) =>
              normalizedHashSecret.includes(
                indicator,
              ),
          )
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'FACILITY_CONFIGURATION_HASH_SECRET',
            ],
            message:
              'FACILITY_CONFIGURATION_HASH_SECRET contains an unsafe production placeholder',
          });
        }

        for (
          const [
            version,
            encodedKey,
          ] of Object.entries(
            value
              .FACILITY_CONFIGURATION_ENCRYPTION_KEYS_JSON,
          )
        ) {
          const decodedText =
            Buffer.from(
              encodedKey,
              'base64',
            )
              .toString(
                'utf8',
              )
              .toLocaleLowerCase(
                'en-US',
              );

          if (
            unsafeIndicators.some(
              (indicator) =>
                decodedText.includes(
                  indicator,
                ),
            )
          ) {
            context.addIssue({
              code: 'custom',
              path: [
                'FACILITY_CONFIGURATION_ENCRYPTION_KEYS_JSON',
              ],
              message:
                `Sensitive-setting key ${version} contains unsafe production placeholder material`,
            });
          }
        }
      },
    );

export type FacilityConfigurationConfig =
  Readonly<{
    nodeEnv:
      | 'development'
      | 'test'
      | 'production';

    activeEncryptionKeyVersion:
      string;

    encryptionKeys:
      Readonly<
        Record<
          string,
          string
        >
      >;

    hashSecret:
      string;

    cacheDefaultTtlSeconds:
      number;

    cacheMaximumEntries:
      number;
  }>;

export function loadFacilityConfigurationConfig(
  environment:
    NodeJS.ProcessEnv =
      process.env,
): FacilityConfigurationConfig {
  const parsed =
    facilityConfigurationSchema.parse(
      environment,
    );

  return {
    nodeEnv:
      parsed.NODE_ENV,

    activeEncryptionKeyVersion:
      parsed
        .FACILITY_CONFIGURATION_ENCRYPTION_ACTIVE_KEY_VERSION,

    encryptionKeys:
      Object.freeze({
        ...parsed
          .FACILITY_CONFIGURATION_ENCRYPTION_KEYS_JSON,
      }),

    hashSecret:
      parsed
        .FACILITY_CONFIGURATION_HASH_SECRET,

    cacheDefaultTtlSeconds:
      parsed
        .FACILITY_CONFIGURATION_CACHE_DEFAULT_TTL_SECONDS,

    cacheMaximumEntries:
      parsed
        .FACILITY_CONFIGURATION_CACHE_MAX_ENTRIES,
  };
}