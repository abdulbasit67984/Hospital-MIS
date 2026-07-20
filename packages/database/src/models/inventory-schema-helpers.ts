import {
  Schema,
  type SchemaDefinition,
} from 'mongoose';

import {
  inventoryCatalogStatusValues,
} from './inventory.types.js';

export function normalizeInventoryText(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/gu, ' ');
}

export function normalizeInventoryCode(
  value: string,
): string {
  return value
    .trim()
    .toUpperCase()
    .replaceAll(/[^A-Z0-9._/-]+/gu, '_');
}

export const inventoryCommonFields = {
  facilityId: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
  },

  transactionId: {
    type: String,
    required: true,
    immutable: true,
    trim: true,
    minlength: 1,
    maxlength: 200,
  },

  correlationId: {
    type: String,
    required: true,
    immutable: true,
    trim: true,
    minlength: 1,
    maxlength: 200,
  },

  schemaVersion: {
    type: Number,
    required: true,
    immutable: true,
    default: 1,
    min: 1,
  },

  version: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },

  createdBy: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
  },

  updatedBy: {
    type: Schema.Types.ObjectId,
    required: true,
  },
} as const satisfies SchemaDefinition;

export const inventoryCatalogLifecycleFields = {
  status: {
    type: String,
    required: true,
    enum: inventoryCatalogStatusValues,
    default: 'ACTIVE',
  },

  activatedAt: {
    type: Date,
    required: true,
    default: Date.now,
  },

  activatedBy: {
    type: Schema.Types.ObjectId,
    required: true,
  },

  deactivatedAt: {
    type: Date,
    default: null,
  },

  deactivatedBy: {
    type: Schema.Types.ObjectId,
    default: null,
  },

  deactivationReason: {
    type: String,
    default: null,
    trim: true,
    minlength: 5,
    maxlength: 2_000,
  },
} as const satisfies SchemaDefinition;

export interface InventoryLifecycleDocument {
  status: string;
  activatedAt: Date;
  activatedBy: unknown;
  deactivatedAt?: Date | null;
  deactivatedBy?: unknown | null;
  deactivationReason?: string | null;
  invalidate(
    path: string,
    message: string,
  ): void;
}

export function validateInventoryCatalogLifecycle(
  document: InventoryLifecycleDocument,
  subject: string,
): void {
  if (document.status === 'INACTIVE') {
    if (
      document.deactivatedAt == null ||
      document.deactivatedBy == null ||
      document.deactivationReason == null
    ) {
      document.invalidate(
        'status',
        `Inactive ${subject} require deactivation attribution and reason`,
      );
    }

    return;
  }

  if (
    document.deactivatedAt != null ||
    document.deactivatedBy != null ||
    document.deactivationReason != null
  ) {
    document.invalidate(
      'status',
      `Active ${subject} cannot retain deactivation metadata`,
    );
  }
}

export interface DecimalParts {
  coefficient: bigint;
  scale: number;
}

function decimalParts(
  value: unknown,
  field: string,
): DecimalParts {
  const source =
    typeof value === 'string'
      ? value
      : value != null &&
          typeof value === 'object' &&
          'toString' in value
        ? String(value)
        : String(value);

  const match =
    /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/u.exec(
      source.trim(),
    );

  if (match == null) {
    throw new TypeError(
      `${field} must be a valid decimal value`,
    );
  }

  const sign =
    match[1] === '-' ? -1n : 1n;
  const integer = match[2] ?? '0';
  const fraction = match[3] ?? '';
  const exponent = Number(match[4] ?? '0');

  if (!Number.isSafeInteger(exponent)) {
    throw new TypeError(
      `${field} has an unsupported decimal exponent`,
    );
  }

  let coefficient =
    BigInt(`${integer}${fraction}`) * sign;
  let scale = fraction.length - exponent;

  if (scale < 0) {
    coefficient *= 10n ** BigInt(-scale);
    scale = 0;
  }

  while (
    scale > 0 &&
    coefficient % 10n === 0n
  ) {
    coefficient /= 10n;
    scale -= 1;
  }

  return {
    coefficient,
    scale,
  };
}

function align(
  value: DecimalParts,
  scale: number,
): bigint {
  return (
    value.coefficient *
    10n ** BigInt(scale - value.scale)
  );
}

export function compareInventoryDecimals(
  left: unknown,
  right: unknown,
): number {
  const leftParts = decimalParts(
    left,
    'left decimal',
  );
  const rightParts = decimalParts(
    right,
    'right decimal',
  );
  const scale = Math.max(
    leftParts.scale,
    rightParts.scale,
  );
  const difference =
    align(leftParts, scale) -
    align(rightParts, scale);

  return difference < 0n
    ? -1
    : difference > 0n
      ? 1
      : 0;
}

export function sumInventoryDecimals(
  values: readonly unknown[],
): DecimalParts {
  const parts = values.map(
    (value, index) =>
      decimalParts(
        value,
        `decimal[${index}]`,
      ),
  );
  const scale = parts.reduce(
    (current, value) =>
      Math.max(current, value.scale),
    0,
  );

  return {
    coefficient: parts.reduce(
      (total, value) =>
        total + align(value, scale),
      0n,
    ),
    scale,
  };
}

export function decimalPartsEqual(
  left: DecimalParts,
  right: DecimalParts,
): boolean {
  const scale = Math.max(
    left.scale,
    right.scale,
  );

  return (
    align(left, scale) ===
    align(right, scale)
  );
}

export function inventoryDecimalParts(
  value: unknown,
  field: string,
): DecimalParts {
  return decimalParts(value, field);
}

export function validateNonNegativeInventoryDecimal(
  document: {
    invalidate(
      path: string,
      message: string,
    ): void;
  },
  path: string,
  value: unknown,
): void {
  try {
    if (
      compareInventoryDecimals(
        value,
        '0',
      ) < 0
    ) {
      document.invalidate(
        path,
        `${path} cannot be negative`,
      );
    }
  } catch (error) {
    document.invalidate(
      path,
      error instanceof Error
        ? error.message
        : `${path} must be a valid decimal value`,
    );
  }
}

export function validatePositiveInventoryDecimal(
  document: {
    invalidate(
      path: string,
      message: string,
    ): void;
  },
  path: string,
  value: unknown,
): void {
  try {
    if (
      compareInventoryDecimals(
        value,
        '0',
      ) <= 0
    ) {
      document.invalidate(
        path,
        `${path} must be greater than zero`,
      );
    }
  } catch (error) {
    document.invalidate(
      path,
      error instanceof Error
        ? error.message
        : `${path} must be a valid decimal value`,
    );
  }
}