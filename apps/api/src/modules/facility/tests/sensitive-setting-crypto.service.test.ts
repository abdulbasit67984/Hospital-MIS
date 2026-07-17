import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  SensitiveSettingCryptoService,
} from '../../../infrastructure/sensitive-setting-crypto.service.js';

function base64Key(
  byte:
    number,
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
  'SensitiveSettingCryptoService',
  () => {
    it(
      'encrypts, authenticates, hashes, and decrypts values',
      () => {
        const service =
          new SensitiveSettingCryptoService({
            activeKeyVersion:
              'v2',

            keys: {
              v1:
                base64Key(
                  1,
                ),

              v2:
                base64Key(
                  2,
                ),
            },

            hashSecret:
              'configuration-hash-secret-that-is-longer-than-thirty-two-characters',

            randomBytes:
              (size) =>
                Buffer.alloc(
                  size,
                  7,
                ),
          });

        const associatedData =
          SensitiveSettingCryptoService.associatedData({
            key:
              'integrations.sms.api_key',

            scope:
              'FACILITY',

            facilityId:
              '507f1f77bcf86cd799439011',
          });

        const protectedValue =
          service.protect(
            {
              token:
                'secret-token',

              endpoint:
                'gateway-1',
            },
            associatedData,
          );

        expect(
          protectedValue
            .encryptedValue
            .ciphertext,
        ).not.toContain(
          'secret-token',
        );

        expect(
          protectedValue
            .encryptedValue
            .keyVersion,
        ).toBe(
          'v2',
        );

        expect(
          service.unprotect(
            protectedValue
              .encryptedValue,
            associatedData,
          ),
        ).toEqual({
          endpoint:
            'gateway-1',

          token:
            'secret-token',
        });

        expect(
          service.matchesHash(
            {
              endpoint:
                'gateway-1',

              token:
                'secret-token',
            },
            associatedData,
            protectedValue
              .valueHash,
          ),
        ).toBe(
          true,
        );

        expect(
          service.matchesHash(
            {
              token:
                'different-token',
            },
            associatedData,
            protectedValue
              .valueHash,
          ),
        ).toBe(
          false,
        );
      },
    );

    it(
      'uses canonical serialization for object hashes',
      () => {
        const service =
          new SensitiveSettingCryptoService({
            activeKeyVersion:
              'v1',

            keys: {
              v1:
                base64Key(
                  3,
                ),
            },

            hashSecret:
              'canonical-hash-secret-that-is-longer-than-thirty-two-characters',
          });

        const associatedData =
          SensitiveSettingCryptoService.associatedData({
            key:
              'integrations.example.credentials',

            scope:
              'GLOBAL',

            facilityId:
              null,
          });

        const left =
          service.hash(
            {
              b:
                2,

              a: {
                d:
                  4,

                c:
                  3,
              },
            },
            associatedData,
          );

        const right =
          service.hash(
            {
              a: {
                c:
                  3,

                d:
                  4,
              },

              b:
                2,
            },
            associatedData,
          );

        expect(
          left,
        ).toBe(
          right,
        );
      },
    );

    it(
      'rejects modified associated data or authentication tags',
      () => {
        const service =
          new SensitiveSettingCryptoService({
            activeKeyVersion:
              'v1',

            keys: {
              v1:
                base64Key(
                  4,
                ),
            },

            hashSecret:
              'another-configuration-hash-secret-with-at-least-thirty-two-characters',

            randomBytes:
              (size) =>
                Buffer.alloc(
                  size,
                  5,
                ),
          });

        const associatedData =
          SensitiveSettingCryptoService.associatedData({
            key:
              'integrations.email.password',

            scope:
              'GLOBAL',

            facilityId:
              null,
          });

        const protectedValue =
          service.protect(
            'password',
            associatedData,
          );

        expect(
          () =>
            service.unprotect(
              protectedValue
                .encryptedValue,
              `${associatedData}:modified`,
            ),
        ).toThrow(
          'failed integrity verification',
        );

        expect(
          () =>
            service.unprotect(
              {
                ...protectedValue
                  .encryptedValue,

                authenticationTag:
                  Buffer
                    .alloc(
                      16,
                      9,
                    )
                    .toString(
                      'base64',
                    ),
              },
              associatedData,
            ),
        ).toThrow(
          'failed integrity verification',
        );
      },
    );

    it(
      'detects values encrypted with an older key version',
      () => {
        const oldService =
          new SensitiveSettingCryptoService({
            activeKeyVersion:
              'v1',

            keys: {
              v1:
                base64Key(
                  5,
                ),
            },

            hashSecret:
              'rotation-hash-secret-that-is-longer-than-thirty-two-characters',
          });

        const associatedData =
          SensitiveSettingCryptoService.associatedData({
            key:
              'security.integration_secret',

            scope:
              'GLOBAL',

            facilityId:
              null,
          });

        const oldValue =
          oldService.protect(
            'secret',
            associatedData,
          );

        const rotatedService =
          new SensitiveSettingCryptoService({
            activeKeyVersion:
              'v2',

            keys: {
              v1:
                base64Key(
                  5,
                ),

              v2:
                base64Key(
                  6,
                ),
            },

            hashSecret:
              'rotation-hash-secret-that-is-longer-than-thirty-two-characters',
          });

        expect(
          rotatedService.needsRotation(
            oldValue
              .encryptedValue,
          ),
        ).toBe(
          true,
        );

        expect(
          rotatedService.unprotect(
            oldValue
              .encryptedValue,
            associatedData,
          ),
        ).toBe(
          'secret',
        );
      },
    );

    it(
      'rejects malformed key material and random-byte providers',
      () => {
        expect(
          () =>
            new SensitiveSettingCryptoService({
              activeKeyVersion:
                'v1',

              keys: {
                v1:
                  Buffer
                    .alloc(
                      16,
                      1,
                    )
                    .toString(
                      'base64',
                    ),
              },

              hashSecret:
                'configuration-hash-secret-that-is-longer-than-thirty-two-characters',
            }),
        ).toThrow(
          'exactly 32 bytes',
        );

        const service =
          new SensitiveSettingCryptoService({
            activeKeyVersion:
              'v1',

            keys: {
              v1:
                base64Key(
                  7,
                ),
            },

            hashSecret:
              'configuration-hash-secret-that-is-longer-than-thirty-two-characters',

            randomBytes:
              () =>
                Buffer.alloc(
                  8,
                  1,
                ),
          });

        expect(
          () =>
            service.protect(
              'secret',
              'associated-data',
            ),
        ).toThrow(
          'invalid initialization vector',
        );
      },
    );
  },
);