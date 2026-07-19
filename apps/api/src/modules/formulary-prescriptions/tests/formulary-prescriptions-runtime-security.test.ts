import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  PrescriptionSnapshotIntegrityError,
} from '../formulary-prescriptions.errors.js';

import {
  FormularyPrescriptionSnapshotCryptoAdapter,
  type CompatibleFormularyPrescriptionSnapshotCrypto,
} from '../../../infrastructure/formulary-prescription-snapshot-crypto.adapter.js';

import {
  FormularyPrescriptionPatientResolutionAdapter,
} from '../../../infrastructure/formulary-prescription-patient-resolution.adapter.js';

const facilityId =
  '64b64b64b64b64b64b64b641';

const requestedPatientId =
  '64b64b64b64b64b64b64b642';

const canonicalPatientId =
  '64b64b64b64b64b64b64b643';

function cryptoFixture():
  CompatibleFormularyPrescriptionSnapshotCrypto {
  return {
    protect(
      value,
      associatedData,
    ) {
      return {
        encryptedValue: {
          algorithm:
            'AES-256-GCM',

          keyVersion:
            'test-key-v1',

          initializationVector:
            Buffer
              .from(
                'initialization-vector',
              )
              .toString(
                'base64',
              ),

          authenticationTag:
            Buffer
              .from(
                'authentication-tag',
              )
              .toString(
                'base64',
              ),

          ciphertext:
            Buffer
              .from(
                JSON.stringify({
                  associatedData,
                  value,
                }),
              )
              .toString(
                'base64',
              ),
        },

        valueHash:
          `hash:${associatedData}`,
      };
    },

    unprotect<T>(
      encryptedValue,
      associatedData,
    ): T {
      const decoded =
        JSON.parse(
          Buffer
            .from(
              encryptedValue.ciphertext,
              'base64',
            )
            .toString(
              'utf8',
            ),
        ) as {
          associatedData:
            string;

          value:
            T;
        };

      if (
        decoded.associatedData !==
        associatedData
      ) {
        throw new Error(
          'Associated data mismatch',
        );
      }

      return decoded.value;
    },

    hash(
      _value,
      associatedData,
    ) {
      return `hash:${associatedData}`;
    },

    matchesHash(
      _value,
      associatedData,
      expectedHash,
    ) {
      return (
        expectedHash ===
        `hash:${associatedData}`
      );
    },

    needsRotation(
      encryptedValue,
    ) {
      return (
        encryptedValue.keyVersion !==
        'test-key-v1'
      );
    },
  };
}

describe(
  'Formulary and prescription runtime security',
  () => {
    it(
      'protects and verifies encrypted prescription snapshots with associated data',
      () => {
        const crypto =
          new FormularyPrescriptionSnapshotCryptoAdapter(
            cryptoFixture(),
          );

        const protectedValue =
          crypto.protect(
            {
              prescriptionId:
                'prescription-1',

              status:
                'ISSUED',
            },

            'facility:prescription:1',
          );

        expect(
          protectedValue.encryptedValue.algorithm,
        ).toBe(
          'AES-256-GCM',
        );

        expect(
          crypto.unprotect(
            protectedValue.encryptedValue,
            'facility:prescription:1',
          ),
        ).toEqual({
          prescriptionId:
            'prescription-1',

          status:
            'ISSUED',
        });

        expect(
          crypto.matchesHash(
            {
              prescriptionId:
                'prescription-1',
            },

            'facility:prescription:1',

            protectedValue.valueHash,
          ),
        ).toBe(
          true,
        );
      },
    );

    it(
      'rejects snapshot decryption with incorrect associated data',
      () => {
        const crypto =
          new FormularyPrescriptionSnapshotCryptoAdapter(
            cryptoFixture(),
          );

        const protectedValue =
          crypto.protect(
            {
              prescriptionId:
                'prescription-1',
            },

            'facility:prescription:1',
          );

        expect(
          () =>
            crypto.unprotect(
              protectedValue.encryptedValue,
              'facility:prescription:2',
            ),
        ).toThrow(
          PrescriptionSnapshotIntegrityError,
        );
      },
    );

    it(
      'resolves active canonical patients and preserves merge attribution',
      async () => {
        const adapter =
          new FormularyPrescriptionPatientResolutionAdapter({
            async resolve() {
              return {
                requestedPatientId,

                canonicalPatientId,

                canonicalEnterprisePatientId:
                  'EPI-000001',

                canonicalStatus:
                  'ACTIVE',

                redirected:
                  true,

                redirectPath: [
                  requestedPatientId,
                  canonicalPatientId,
                ],
              };
            },
          });

        await expect(
          adapter.resolve(
            facilityId,
            requestedPatientId,
          ),
        ).resolves.toEqual({
          requestedPatientId,

          canonicalPatientId,

          redirected:
            true,

          mergeChain: [
            requestedPatientId,
            canonicalPatientId,
          ],
        });
      },
    );

    it(
      'rejects unavailable canonical patients',
      async () => {
        const adapter =
          new FormularyPrescriptionPatientResolutionAdapter({
            async resolve() {
              return {
                requestedPatientId,

                canonicalPatientId,

                canonicalEnterprisePatientId:
                  'EPI-000001',

                canonicalStatus:
                  'DECEASED',

                redirected:
                  true,

                redirectPath: [
                  requestedPatientId,
                  canonicalPatientId,
                ],
              };
            },
          });

        await expect(
          adapter.resolve(
            facilityId,
            requestedPatientId,
          ),
        ).rejects.toThrow(
          'canonical patient is not active',
        );
      },
    );
  },
);