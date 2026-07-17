import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  loadFacilityConfigurationConfig,
} from './facility-configuration.js';

function base64Key(
  byte: number,
): string {
  return Buffer
    .alloc(
      32,
      byte,
    )
    .toString(
      'base64',
    );
}

describe(
  'loadFacilityConfigurationConfig',
  () => {
    const validEnvironment = {
      NODE_ENV:
        'test',

      FACILITY_CONFIGURATION_ENCRYPTION_ACTIVE_KEY_VERSION:
        'v2',

      FACILITY_CONFIGURATION_ENCRYPTION_KEYS_JSON:
        JSON.stringify({
          v1:
            base64Key(
              1,
            ),

          v2:
            base64Key(
              2,
            ),
        }),

      FACILITY_CONFIGURATION_HASH_SECRET:
        'facility-configuration-hash-secret-with-more-than-thirty-two-characters',

      FACILITY_CONFIGURATION_CACHE_DEFAULT_TTL_SECONDS:
        '600',

      FACILITY_CONFIGURATION_CACHE_MAX_ENTRIES:
        '5000',
    };

    it(
      'maps encryption and cache settings',
      () => {
        const config =
          loadFacilityConfigurationConfig(
            validEnvironment,
          );

        expect(
          config.activeEncryptionKeyVersion,
        ).toBe(
          'v2',
        );

        expect(
          config.encryptionKeys.v1,
        ).toBe(
          base64Key(
            1,
          ),
        );

        expect(
          config.cacheDefaultTtlSeconds,
        ).toBe(
          600,
        );

        expect(
          config.cacheMaximumEntries,
        ).toBe(
          5000,
        );
      },
    );

    it(
      'rejects an active version that has no key',
      () => {
        expect(
          () =>
            loadFacilityConfigurationConfig({
              ...validEnvironment,

              FACILITY_CONFIGURATION_ENCRYPTION_ACTIVE_KEY_VERSION:
                'v3',
            }),
        ).toThrow(
          'active sensitive-setting key version is not present',
        );
      },
    );

    it(
      'rejects encryption keys that are not exactly 32 bytes',
      () => {
        expect(
          () =>
            loadFacilityConfigurationConfig({
              ...validEnvironment,

              FACILITY_CONFIGURATION_ENCRYPTION_KEYS_JSON:
                JSON.stringify({
                  v1:
                    Buffer
                      .alloc(
                        16,
                        1,
                      )
                      .toString(
                        'base64',
                      ),
                }),

              FACILITY_CONFIGURATION_ENCRYPTION_ACTIVE_KEY_VERSION:
                'v1',
            }),
        ).toThrow(
          'must decode to exactly 32 bytes',
        );
      },
    );

    it(
      'rejects duplicate key material across versions',
      () => {
        const duplicateKey =
          base64Key(
            4,
          );

        expect(
          () =>
            loadFacilityConfigurationConfig({
              ...validEnvironment,

              FACILITY_CONFIGURATION_ENCRYPTION_KEYS_JSON:
                JSON.stringify({
                  v1:
                    duplicateKey,

                  v2:
                    duplicateKey,
                }),
            }),
        ).toThrow(
          'must not reuse the same key material',
        );
      },
    );

    it(
      'rejects production placeholder secrets',
      () => {
        expect(
          () =>
            loadFacilityConfigurationConfig({
              ...validEnvironment,

              NODE_ENV:
                'production',

              FACILITY_CONFIGURATION_HASH_SECRET:
                'production-facility-hash-secret-change-me-now',
            }),
        ).toThrow(
          'unsafe production placeholder',
        );
      },
    );
  },
);