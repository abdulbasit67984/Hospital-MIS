import Decimal from 'decimal.js';

import {
  DateTime,
  IANAZone,
} from 'luxon';

import {
  SETTING_DATA_TYPE,
  SETTING_SCOPE,
  type SettingScope,
} from './facility.constants.js';

import {
  InvalidSettingValueError,
  UnsupportedSettingScopeError,
} from './facility.errors.js';

import type {
  SettingDefinitionRecord,
} from './facility.types.js';

export interface ValidatedSettingValue {
  normalizedValue: unknown;
  serializedValue: string;
}

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

export function stableSerializeSettingValue(
  value: unknown,
): string {
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
    throw new InvalidSettingValueError(
      'The setting must contain a JSON-compatible value',
    );
  }

  return serialized;
}

function assertRequired(
  definition:
    SettingDefinitionRecord,
  value: unknown,
): void {
  if (
    !definition
      .validation
      .required
  ) {
    return;
  }

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    throw new InvalidSettingValueError(
      `${definition.key} is required`,
    );
  }
}

function assertStringRules(
  definition:
    SettingDefinitionRecord,
  value: string,
): void {
  const {
    minLength,
    maxLength,
    pattern,
  } =
    definition.validation;

  const length =
    Array.from(
      value,
    ).length;

  if (
    minLength !== null &&
    length < minLength
  ) {
    throw new InvalidSettingValueError(
      `${definition.key} must contain at least ${minLength} characters`,
    );
  }

  if (
    maxLength !== null &&
    length > maxLength
  ) {
    throw new InvalidSettingValueError(
      `${definition.key} cannot exceed ${maxLength} characters`,
    );
  }

  if (
    pattern !== null
  ) {
    let expression:
      RegExp;

    try {
      expression =
        new RegExp(
          pattern,
        );
    } catch {
      throw new InvalidSettingValueError(
        `${definition.key} has an invalid configured validation pattern`,
      );
    }

    if (
      !expression.test(
        value,
      )
    ) {
      throw new InvalidSettingValueError(
        `${definition.key} does not match the configured format`,
      );
    }
  }
}

function assertAllowedValue(
  definition:
    SettingDefinitionRecord,
  value: unknown,
): void {
  const allowed =
    definition
      .validation
      .allowedValues;

  if (
    allowed.length === 0
  ) {
    return;
  }

  const serialized =
    stableSerializeSettingValue(
      value,
    );

  const isAllowed =
    allowed.some(
      (candidate) =>
        stableSerializeSettingValue(
          candidate,
        ) ===
        serialized,
    );

  if (
    !isAllowed
  ) {
    throw new InvalidSettingValueError(
      `${definition.key} must contain one of the configured allowed values`,
    );
  }
}

function parseConfiguredDecimal(
  value: string,
  fieldName: string,
): Decimal {
  try {
    const parsed =
      new Decimal(
        value,
      );

    if (
      !parsed.isFinite()
    ) {
      throw new Error(
        'Decimal is not finite',
      );
    }

    return parsed;
  } catch {
    throw new InvalidSettingValueError(
      `${fieldName} contains an invalid decimal validation boundary`,
    );
  }
}

function assertNumericRange(
  definition:
    SettingDefinitionRecord,
  value: Decimal,
): void {
  const {
    minimum,
    maximum,
  } =
    definition.validation;

  if (
    minimum !== null &&
    value.lt(
      parseConfiguredDecimal(
        minimum,
        `${definition.key}.minimum`,
      ),
    )
  ) {
    throw new InvalidSettingValueError(
      `${definition.key} must be greater than or equal to ${minimum}`,
    );
  }

  if (
    maximum !== null &&
    value.gt(
      parseConfiguredDecimal(
        maximum,
        `${definition.key}.maximum`,
      ),
    )
  ) {
    throw new InvalidSettingValueError(
      `${definition.key} must be less than or equal to ${maximum}`,
    );
  }
}

function validateLocale(
  value: string,
): string {
  try {
    return new Intl.Locale(
      value,
    ).toString();
  } catch {
    throw new InvalidSettingValueError(
      'The setting must contain a valid BCP 47 locale',
    );
  }
}

function validateCurrency(
  value: string,
): string {
  const normalized =
    value
      .trim()
      .toLocaleUpperCase(
        'en-US',
      );

  if (
    !/^[A-Z]{3}$/u.test(
      normalized,
    )
  ) {
    throw new InvalidSettingValueError(
      'The setting must contain a three-letter ISO currency code',
    );
  }

  try {
    new Intl.NumberFormat(
      'en',
      {
        style:
          'currency',

        currency:
          normalized,
      },
    ).format(0);
  } catch {
    throw new InvalidSettingValueError(
      'The setting must contain a supported ISO currency code',
    );
  }

  return normalized;
}

function validateDate(
  value: unknown,
): string {
  if (
    typeof value !==
    'string'
  ) {
    throw new InvalidSettingValueError(
      'The setting must contain an ISO date string',
    );
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(
      value,
    )
  ) {
    throw new InvalidSettingValueError(
      'The setting must contain an ISO date in YYYY-MM-DD format',
    );
  }

  const parsed =
    DateTime.fromISO(
      value,
      {
        zone:
          'utc',
      },
    );

  if (
    !parsed.isValid
  ) {
    throw new InvalidSettingValueError(
      'The setting must contain a valid ISO date',
    );
  }

  const normalized =
    parsed.toISODate();

  if (
    normalized === null ||
    normalized !== value
  ) {
    throw new InvalidSettingValueError(
      'The setting must contain a valid calendar date',
    );
  }

  return normalized;
}

function validateDateTime(
  value: unknown,
): string {
  if (
    typeof value !==
    'string'
  ) {
    throw new InvalidSettingValueError(
      'The setting must contain an ISO datetime string',
    );
  }

  if (
    !/T.*(?:Z|[+-]\d{2}:\d{2})$/u.test(
      value,
    )
  ) {
    throw new InvalidSettingValueError(
      'The setting datetime must include an explicit UTC offset',
    );
  }

  const parsed =
    DateTime.fromISO(
      value,
      {
        setZone:
          true,
      },
    );

  if (
    !parsed.isValid
  ) {
    throw new InvalidSettingValueError(
      'The setting must contain a valid ISO datetime',
    );
  }

  const normalized =
    parsed
      .toUTC()
      .toISO();

  if (
    normalized === null
  ) {
    throw new InvalidSettingValueError(
      'The setting datetime could not be normalized',
    );
  }

  return normalized;
}

function validateJsonValue(
  value: unknown,
): unknown {
  if (
    value === undefined ||
    typeof value ===
      'function' ||
    typeof value ===
      'symbol' ||
    typeof value ===
      'bigint'
  ) {
    throw new InvalidSettingValueError(
      'The setting must contain a JSON-compatible value',
    );
  }

  try {
    const serialized =
      JSON.stringify(
        value,
      );

    if (
      serialized ===
      undefined
    ) {
      throw new Error(
        'Value is not JSON serializable',
      );
    }

    return JSON.parse(
      serialized,
    ) as unknown;
  } catch {
    throw new InvalidSettingValueError(
      'The setting must contain a JSON-compatible value',
    );
  }
}

export function assertSettingScopeAllowed(
  definition:
    SettingDefinitionRecord,
  scope:
    SettingScope,
): void {
  if (
    scope !==
      SETTING_SCOPE.GLOBAL &&
    scope !==
      SETTING_SCOPE.FACILITY
  ) {
    throw new UnsupportedSettingScopeError(
      definition.key,
      scope,
    );
  }

  if (
    !definition
      .allowedScopes
      .includes(
        scope,
      )
  ) {
    throw new UnsupportedSettingScopeError(
      definition.key,
      scope,
    );
  }
}

export function validateSettingValue(
  definition:
    SettingDefinitionRecord,
  input: unknown,
): ValidatedSettingValue {
  assertRequired(
    definition,
    input,
  );

  if (
    input === null ||
    input === undefined ||
    input === ''
  ) {
    return {
      normalizedValue:
        null,

      serializedValue:
        'null',
    };
  }

  let normalizedValue:
    unknown;

  switch (
    definition.dataType
  ) {
    case SETTING_DATA_TYPE.STRING:
    case SETTING_DATA_TYPE.SECRET: {
      if (
        typeof input !==
        'string'
      ) {
        throw new InvalidSettingValueError(
          `${definition.key} must contain text`,
        );
      }

      const value =
        input.trim();

      assertStringRules(
        definition,
        value,
      );

      normalizedValue =
        value;

      break;
    }

    case SETTING_DATA_TYPE.INTEGER: {
      if (
        typeof input !==
          'number' ||
        !Number.isSafeInteger(
          input,
        )
      ) {
        throw new InvalidSettingValueError(
          `${definition.key} must contain a safe integer`,
        );
      }

      assertNumericRange(
        definition,
        new Decimal(
          input,
        ),
      );

      normalizedValue =
        input;

      break;
    }

    case SETTING_DATA_TYPE.NUMBER: {
      if (
        typeof input !==
          'number' ||
        !Number.isFinite(
          input,
        )
      ) {
        throw new InvalidSettingValueError(
          `${definition.key} must contain a finite number`,
        );
      }

      assertNumericRange(
        definition,
        new Decimal(
          input,
        ),
      );

      normalizedValue =
        input;

      break;
    }

    case SETTING_DATA_TYPE.DECIMAL: {
      if (
        typeof input !==
          'string' &&
        typeof input !==
          'number'
      ) {
        throw new InvalidSettingValueError(
          `${definition.key} must contain a decimal string`,
        );
      }

      let decimal:
        Decimal;

      try {
        decimal =
          new Decimal(
            input,
          );
      } catch {
        throw new InvalidSettingValueError(
          `${definition.key} must contain a valid decimal value`,
        );
      }

      if (
        !decimal.isFinite()
      ) {
        throw new InvalidSettingValueError(
          `${definition.key} must contain a finite decimal value`,
        );
      }

      assertNumericRange(
        definition,
        decimal,
      );

      normalizedValue =
        decimal.toString();

      break;
    }

    case SETTING_DATA_TYPE.BOOLEAN: {
      if (
        typeof input !==
        'boolean'
      ) {
        throw new InvalidSettingValueError(
          `${definition.key} must contain true or false`,
        );
      }

      normalizedValue =
        input;

      break;
    }

    case SETTING_DATA_TYPE.DATE: {
      normalizedValue =
        validateDate(
          input,
        );

      break;
    }

    case SETTING_DATA_TYPE.DATETIME: {
      normalizedValue =
        validateDateTime(
          input,
        );

      break;
    }

    case SETTING_DATA_TYPE.TIMEZONE: {
      if (
        typeof input !==
        'string'
      ) {
        throw new InvalidSettingValueError(
          `${definition.key} must contain an IANA timezone`,
        );
      }

      const timezone =
        input.trim();

      if (
        !IANAZone.isValidZone(
          timezone,
        )
      ) {
        throw new InvalidSettingValueError(
          `${definition.key} must contain a valid IANA timezone`,
        );
      }

      normalizedValue =
        timezone;

      break;
    }

    case SETTING_DATA_TYPE.CURRENCY: {
      if (
        typeof input !==
        'string'
      ) {
        throw new InvalidSettingValueError(
          `${definition.key} must contain a currency code`,
        );
      }

      normalizedValue =
        validateCurrency(
          input,
        );

      break;
    }

    case SETTING_DATA_TYPE.LOCALE: {
      if (
        typeof input !==
        'string'
      ) {
        throw new InvalidSettingValueError(
          `${definition.key} must contain a locale`,
        );
      }

      normalizedValue =
        validateLocale(
          input.trim(),
        );

      break;
    }

    case SETTING_DATA_TYPE.ENUM: {
      normalizedValue =
        validateJsonValue(
          input,
        );

      break;
    }

    case SETTING_DATA_TYPE.JSON: {
      normalizedValue =
        validateJsonValue(
          input,
        );

      break;
    }

    default: {
      const exhaustive:
        never =
        definition.dataType;

      throw new InvalidSettingValueError(
        `Unsupported setting data type: ${String(
          exhaustive,
        )}`,
      );
    }
  }

  assertAllowedValue(
    definition,
    normalizedValue,
  );

  return {
    normalizedValue,

    serializedValue:
      stableSerializeSettingValue(
        normalizedValue,
      ),
  };
}