import {
  PrescriptionSnapshotIntegrityError,
} from '../modules/formulary-prescriptions/formulary-prescriptions.errors.js';

import type {
  FormularyPrescriptionEncryptedSnapshot,
  FormularyPrescriptionSnapshotCryptoPort,
  ProtectedFormularyPrescriptionSnapshot,
} from '../modules/formulary-prescriptions/formulary-prescriptions.ports.js';

export interface CompatibleFormularyPrescriptionSnapshotCrypto {
  protect(
    value:
      unknown,

    associatedData:
      string,
  ): {
    encryptedValue: {
      algorithm:
        'AES-256-GCM';

      keyVersion:
        string;

      initializationVector:
        string;

      authenticationTag:
        string;

      ciphertext:
        string;
    };

    valueHash:
      string;
  };

  unprotect<T>(
    encryptedValue: {
      algorithm:
        'AES-256-GCM';

      keyVersion:
        string;

      initializationVector:
        string;

      authenticationTag:
        string;

      ciphertext:
        string;
    },

    associatedData:
      string,
  ): T;

  hash(
    value:
      unknown,

    associatedData:
      string,
  ): string;

  matchesHash(
    value:
      unknown,

    associatedData:
      string,

    expectedHash:
      string,
  ): boolean;

  needsRotation(
    encryptedValue: {
      algorithm:
        'AES-256-GCM';

      keyVersion:
        string;

      initializationVector:
        string;

      authenticationTag:
        string;

      ciphertext:
        string;
    },
  ): boolean;
}

function asDomainSnapshot(
  value:
    CompatibleFormularyPrescriptionSnapshotCrypto extends never
      ? never
      : ReturnType<CompatibleFormularyPrescriptionSnapshotCrypto['protect']>['encryptedValue'],
): FormularyPrescriptionEncryptedSnapshot {
  return {
    algorithm:
      value.algorithm,

    keyVersion:
      value.keyVersion,

    initializationVector:
      value.initializationVector,

    authenticationTag:
      value.authenticationTag,

    ciphertext:
      value.ciphertext,
  };
}

export class FormularyPrescriptionSnapshotCryptoAdapter
implements FormularyPrescriptionSnapshotCryptoPort {
  public constructor(
    private readonly crypto:
      CompatibleFormularyPrescriptionSnapshotCrypto,
  ) {}

  public protect(
    value:
      unknown,

    associatedData:
      string,
  ): ProtectedFormularyPrescriptionSnapshot {
    try {
      const protectedValue =
        this.crypto.protect(
          value,
          associatedData,
        );

      return {
        encryptedValue:
          asDomainSnapshot(
            protectedValue.encryptedValue,
          ),

        valueHash:
          protectedValue.valueHash,
      };
    } catch (error) {
      throw new PrescriptionSnapshotIntegrityError(
        error instanceof Error
          ? error.message
          : 'Prescription snapshot could not be encrypted',
      );
    }
  }

  public unprotect<T>(
    encryptedValue:
      FormularyPrescriptionEncryptedSnapshot,

    associatedData:
      string,
  ): T {
    try {
      return this.crypto.unprotect<T>(
        encryptedValue,
        associatedData,
      );
    } catch (error) {
      throw new PrescriptionSnapshotIntegrityError(
        error instanceof Error
          ? error.message
          : 'Prescription snapshot could not be decrypted',
      );
    }
  }

  public hash(
    value:
      unknown,

    associatedData:
      string,
  ): string {
    try {
      return this.crypto.hash(
        value,
        associatedData,
      );
    } catch (error) {
      throw new PrescriptionSnapshotIntegrityError(
        error instanceof Error
          ? error.message
          : 'Prescription snapshot hash could not be calculated',
      );
    }
  }

  public matchesHash(
    value:
      unknown,

    associatedData:
      string,

    expectedHash:
      string,
  ): boolean {
    try {
      return this.crypto.matchesHash(
        value,
        associatedData,
        expectedHash,
      );
    } catch (error) {
      throw new PrescriptionSnapshotIntegrityError(
        error instanceof Error
          ? error.message
          : 'Prescription snapshot hash could not be verified',
      );
    }
  }

  public needsRotation(
    encryptedValue:
      FormularyPrescriptionEncryptedSnapshot,
  ): boolean {
    try {
      return this.crypto.needsRotation(
        encryptedValue,
      );
    } catch (error) {
      throw new PrescriptionSnapshotIntegrityError(
        error instanceof Error
          ? error.message
          : 'Prescription snapshot key rotation could not be evaluated',
      );
    }
  }
}