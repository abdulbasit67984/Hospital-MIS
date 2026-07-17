import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import {
  SensitiveSettingConfigurationError,
} from '../modules/facility/facility.errors.js';

import type {
  EncryptedSettingValue,
} from '../modules/facility/facility.types.js';

export interface SensitiveSettingCryptoOptions {
  activeKeyVersion:
    string;

  keys:
    Readonly<
      Record<
        string,
        string
      >
    >;

  hashSecret:
    string;

  randomBytes?:
    (
      size:
        number,
    ) => Buffer;
}

export interface ProtectedSensitiveSetting {
  encryptedValue:
    EncryptedSettingValue;

  valueHash:
    string;
}

const internalAlgorithm =
  'aes-256-gcm';

const externalAlgorithm =
  'AES-256-GCM';

function stableJsonValue(
  value: unknown,
): unknown {
  if (
    Array.isArray(
      value,
    )
  ) {
    return value.map(
      stableJsonValue,
    );
  }

  if (
    typeof value ===
      'object' &&
    value !== null
  ) {
    return Object.fromEntries(
      Object.entries(
        value,
      )
        .sort(
          (
            [left],
            [right],
          ) =>
            left.localeCompare(
              right,
            ),
        )
        .map(
          (
            [
              key,
              nestedValue,
            ],
          ) => [
            key,
            stableJsonValue(
              nestedValue,
            ),
          ],
        ),
    );
  }

  return value;
}

function serializePlaintext(
  value: unknown,
): string {
  try {
    const serialized =
      JSON.stringify(
        stableJsonValue(
          value,
        ),
      );

    if (
      serialized ===
      undefined
    ) {
      throw new Error(
        'Value is not JSON serializable',
      );
    }

    return serialized;
  } catch {
    throw new SensitiveSettingConfigurationError(
      'Sensitive setting value cannot be serialized',
    );
  }
}

function canonicalBase64(
  value: string,
): string {
  return value
    .trim()
    .replace(
      /\s+/gu,
      '',
    );
}

function decodeKey(
  version: string,
  encodedKey: string,
): Buffer {
  const normalized =
    canonicalBase64(
      encodedKey,
    );

  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      normalized,
    )
  ) {
    throw new SensitiveSettingConfigurationError(
      `Sensitive setting key ${version} is not valid base64`,
    );
  }

  const key =
    Buffer.from(
      normalized,
      'base64',
    );

  const canonical =
    key
      .toString(
        'base64',
      )
      .replace(
        /=+$/u,
        '',
      );

  if (
    canonical !==
    normalized.replace(
      /=+$/u,
      '',
    )
  ) {
    throw new SensitiveSettingConfigurationError(
      `Sensitive setting key ${version} is not canonical base64`,
    );
  }

  if (
    key.length !== 32
  ) {
    throw new SensitiveSettingConfigurationError(
      `Sensitive setting key ${version} must decode to exactly 32 bytes`,
    );
  }

  return key;
}

function decodeBase64Field(
  value: string,
  expectedLength: number,
  fieldName: string,
): Buffer {
  const normalized =
    canonicalBase64(
      value,
    );

  const decoded =
    Buffer.from(
      normalized,
      'base64',
    );

  if (
    decoded.length !==
    expectedLength
  ) {
    throw new SensitiveSettingConfigurationError(
      `${fieldName} has an invalid length`,
    );
  }

  return decoded;
}

export class SensitiveSettingCryptoService {
  readonly #activeKeyVersion:
    string;

  readonly #keys =
    new Map<
      string,
      Buffer
    >();

  readonly #hashSecret:
    Buffer;

  readonly #randomBytes:
    (
      size:
        number,
    ) => Buffer;

  public constructor(
    options:
      SensitiveSettingCryptoOptions,
  ) {
    this.#activeKeyVersion =
      options
        .activeKeyVersion
        .trim();

    if (
      !/^[A-Za-z0-9._-]{1,80}$/u.test(
        this.#activeKeyVersion,
      )
    ) {
      throw new SensitiveSettingConfigurationError(
        'A valid active sensitive-setting key version is required',
      );
    }

    for (
      const [
        rawVersion,
        encodedKey,
      ] of Object.entries(
        options.keys,
      )
    ) {
      const version =
        rawVersion.trim();

      if (
        !/^[A-Za-z0-9._-]{1,80}$/u.test(
          version,
        )
      ) {
        throw new SensitiveSettingConfigurationError(
          `Invalid sensitive-setting key version ${rawVersion}`,
        );
      }

      this.#keys.set(
        version,
        decodeKey(
          version,
          encodedKey,
        ),
      );
    }

    if (
      !this.#keys.has(
        this.#activeKeyVersion,
      )
    ) {
      throw new SensitiveSettingConfigurationError(
        `Active sensitive-setting key ${this.#activeKeyVersion} was not supplied`,
      );
    }

    if (
      Buffer.byteLength(
        options.hashSecret,
        'utf8',
      ) < 32
    ) {
      throw new SensitiveSettingConfigurationError(
        'Sensitive-setting hash secret must contain at least 32 bytes',
      );
    }

    this.#hashSecret =
      Buffer.from(
        options.hashSecret,
        'utf8',
      );

    this.#randomBytes =
      options.randomBytes ??
      randomBytes;
  }

  public protect(
    value: unknown,
    associatedData:
      string,
  ): ProtectedSensitiveSetting {
    const plaintext =
      serializePlaintext(
        value,
      );

    const key =
      this.#keys.get(
        this.#activeKeyVersion,
      );

    if (
      key === undefined
    ) {
      throw new SensitiveSettingConfigurationError(
        'Active sensitive-setting encryption key is unavailable',
      );
    }

    const initializationVector =
      this.#randomBytes(
        12,
      );

    if (
      initializationVector.length !==
      12
    ) {
      throw new SensitiveSettingConfigurationError(
        'Sensitive-setting random-byte provider returned an invalid initialization vector',
      );
    }

    const cipher =
      createCipheriv(
        internalAlgorithm,
        key,
        initializationVector,
      );

    cipher.setAAD(
      Buffer.from(
        associatedData,
        'utf8',
      ),
    );

    const ciphertext =
      Buffer.concat([
        cipher.update(
          plaintext,
          'utf8',
        ),

        cipher.final(),
      ]);

    const authenticationTag =
      cipher.getAuthTag();

    return {
      encryptedValue: {
        algorithm:
          externalAlgorithm,

        keyVersion:
          this.#activeKeyVersion,

        initializationVector:
          initializationVector.toString(
            'base64',
          ),

        authenticationTag:
          authenticationTag.toString(
            'base64',
          ),

        ciphertext:
          ciphertext.toString(
            'base64',
          ),
      },

      valueHash:
        this.hash(
          value,
          associatedData,
        ),
    };
  }

  public unprotect<T>(
    encryptedValue:
      EncryptedSettingValue,
    associatedData:
      string,
  ): T {
    if (
      encryptedValue.algorithm !==
      externalAlgorithm
    ) {
      throw new SensitiveSettingConfigurationError(
        `Unsupported sensitive-setting algorithm ${encryptedValue.algorithm}`,
      );
    }

    const key =
      this.#keys.get(
        encryptedValue.keyVersion,
      );

    if (
      key === undefined
    ) {
      throw new SensitiveSettingConfigurationError(
        `Sensitive-setting key ${encryptedValue.keyVersion} is unavailable`,
      );
    }

    try {
      const initializationVector =
        decodeBase64Field(
          encryptedValue.initializationVector,
          12,
          'Sensitive-setting initialization vector',
        );

      const authenticationTag =
        decodeBase64Field(
          encryptedValue.authenticationTag,
          16,
          'Sensitive-setting authentication tag',
        );

      const ciphertext =
        Buffer.from(
          canonicalBase64(
            encryptedValue.ciphertext,
          ),
          'base64',
        );

      const decipher =
        createDecipheriv(
          internalAlgorithm,
          key,
          initializationVector,
        );

      decipher.setAAD(
        Buffer.from(
          associatedData,
          'utf8',
        ),
      );

      decipher.setAuthTag(
        authenticationTag,
      );

      const plaintext =
        Buffer.concat([
          decipher.update(
            ciphertext,
          ),

          decipher.final(),
        ]).toString(
          'utf8',
        );

      return JSON.parse(
        plaintext,
      ) as T;
    } catch (
      error
    ) {
      if (
        error instanceof
        SensitiveSettingConfigurationError
      ) {
        throw error;
      }

      throw new SensitiveSettingConfigurationError(
        'Sensitive setting could not be decrypted or failed integrity verification',
      );
    }
  }

  public hash(
    value: unknown,
    associatedData:
      string,
  ): string {
    const plaintext =
      serializePlaintext(
        value,
      );

    return createHmac(
      'sha256',
      this.#hashSecret,
    )
      .update(
        associatedData,
        'utf8',
      )
      .update(
        '\u0000',
        'utf8',
      )
      .update(
        plaintext,
        'utf8',
      )
      .digest(
        'hex',
      );
  }

  public matchesHash(
    value: unknown,
    associatedData:
      string,
    expectedHash:
      string,
  ): boolean {
    if (
      !/^[a-f\d]{64}$/iu.test(
        expectedHash,
      )
    ) {
      return false;
    }

    const actual =
      Buffer.from(
        this.hash(
          value,
          associatedData,
        ),
        'hex',
      );

    const expected =
      Buffer.from(
        expectedHash,
        'hex',
      );

    return (
      actual.length ===
        expected.length &&
      timingSafeEqual(
        actual,
        expected,
      )
    );
  }

  public needsRotation(
    encryptedValue:
      EncryptedSettingValue,
  ): boolean {
    return (
      encryptedValue.keyVersion !==
      this.#activeKeyVersion
    );
  }

  public fingerprint():
    string {
    const activeKey =
      this.#keys.get(
        this.#activeKeyVersion,
      );

    if (
      activeKey === undefined
    ) {
      throw new SensitiveSettingConfigurationError(
        'Active sensitive-setting encryption key is unavailable',
      );
    }

    return createHash(
      'sha256',
    )
      .update(
        activeKey,
      )
      .digest(
        'hex',
      )
      .slice(
        0,
        16,
      );
  }

  public static associatedData(
    input:
      Readonly<{
        key:
          string;

        scope:
          string;

        facilityId:
          string | null;
      }>,
  ): string {
    return [
      'hospital-mis',
      'system-setting',
      input.key,
      input.scope,
      input.facilityId ??
        'global',
    ].join(
      ':',
    );
  }
}