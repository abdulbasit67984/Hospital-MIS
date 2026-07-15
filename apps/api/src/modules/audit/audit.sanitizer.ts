import {
  Types,
} from 'mongoose';

import type {
  AuditSnapshot,
} from './audit.types.js';

const redactedFieldNames =
  new Set([
    'password',
    'passwordhash',
    'passwordpepper',

    'token',
    'accesstoken',
    'refreshtoken',
    'tokenhash',

    'authorization',
    'cookie',
    'set-cookie',

    'cnic',
    'normalizedcnic',
    'bform',
    'bformnumber',

    'secret',
    'privatekey',

    'clinicalnotes',
    'clinicalnarrative',
  ]);

const forbiddenObjectKeys =
  new Set([
    '__proto__',
    'constructor',
    'prototype',
  ]);

export type AuditSanitizerOptions = {
  maxDepth: number;
  maxArrayItems: number;
  maxObjectKeys: number;
  maxStringLength: number;
};

export const defaultAuditSanitizerOptions:
  AuditSanitizerOptions = {
    maxDepth: 6,
    maxArrayItems: 50,
    maxObjectKeys: 100,
    maxStringLength: 2000,
  };

function normalizedFieldName(
  value: string,
): string {
  return value
    .replaceAll('_', '')
    .replaceAll('-', '')
    .replaceAll('.', '')
    .toLowerCase();
}

function shouldRedact(
  key: string,
): boolean {
  return redactedFieldNames.has(
    normalizedFieldName(key),
  );
}

function sanitizeString(
  value: string,
  maxLength: number,
): string {
  if (
    value.length <= maxLength
  ) {
    return value;
  }

  return `${value.slice(
    0,
    maxLength,
  )}…[TRUNCATED]`;
}

function sanitizeInternal(
  value: unknown,
  options:
    AuditSanitizerOptions,
  depth: number,
  seen: WeakSet<object>,
): AuditSnapshot {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return Number.isFinite(value)
      ? value
      : String(value);
  }

  if (
    typeof value === 'bigint'
  ) {
    return value.toString();
  }

  if (
    typeof value === 'string'
  ) {
    return sanitizeString(
      value,
      options.maxStringLength,
    );
  }

  if (
    typeof value === 'symbol' ||
    typeof value === 'function'
  ) {
    return `[${typeof value}]`;
  }

  if (
    value instanceof Date
  ) {
    return value.toISOString();
  }

  if (
    value instanceof Types.ObjectId
  ) {
    return value.toHexString();
  }

  if (
    Buffer.isBuffer(value)
  ) {
    return `[BINARY:${value.length} bytes]`;
  }

  if (
    depth >= options.maxDepth
  ) {
    return '[MAX_DEPTH]';
  }

  if (
    typeof value !== 'object'
  ) {
    return String(value);
  }

  if (
    seen.has(value)
  ) {
    return '[CIRCULAR]';
  }

  seen.add(value);

  try {
    if (
      Array.isArray(value)
    ) {
      const limited =
        value.slice(
          0,
          options.maxArrayItems,
        );

      const result =
        limited.map((item) =>
          sanitizeInternal(
            item,
            options,
            depth + 1,
            seen,
          ),
        );

      if (
        value.length >
        options.maxArrayItems
      ) {
        result.push(
          `[${value.length - options.maxArrayItems} MORE ITEMS]`,
        );
      }

      return result;
    }

    const result:
      Record<string, AuditSnapshot> =
      Object.create(null) as Record<
        string,
        AuditSnapshot
      >;

    const entries =
      Object.entries(value).slice(
        0,
        options.maxObjectKeys,
      );

    for (
      const [key, item] of entries
    ) {
      if (
        forbiddenObjectKeys.has(key)
      ) {
        continue;
      }

      result[key] =
        shouldRedact(key)
          ? '[REDACTED]'
          : sanitizeInternal(
              item,
              options,
              depth + 1,
              seen,
            );
    }

    const totalKeys =
      Object.keys(value).length;

    if (
      totalKeys >
      options.maxObjectKeys
    ) {
      result['_truncatedKeys'] =
        totalKeys -
        options.maxObjectKeys;
    }

    return result;
  } finally {
    seen.delete(value);
  }
}

export function sanitizeAuditSnapshot(
  value: unknown,
  options:
    AuditSanitizerOptions =
      defaultAuditSanitizerOptions,
): AuditSnapshot {
  return sanitizeInternal(
    value,
    options,
    0,
    new WeakSet<object>(),
  );
}