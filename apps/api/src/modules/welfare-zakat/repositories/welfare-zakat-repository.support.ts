import type { Query } from 'mongoose';

import {
  decimalStringToDecimal128,
  toObjectId,
} from '@hospital-mis/database';

import {
  AssistanceDoubleFundingError,
  AssistanceDuplicateApplicationError,
  AssistanceDuplicateFundCodeError,
} from '../welfare-zakat.errors.js';
import type { WelfareZakatMongoSession } from '../welfare-zakat.persistence.types.js';

export function welfareZakatRecord<T>(value: unknown): T {
  return value as T;
}

export function welfareZakatObjectId(value: string, field: string) {
  return toObjectId(value, field);
}

export function nullableWelfareZakatObjectId(
  value: string | null | undefined,
  field: string,
) {
  return value == null ? null : toObjectId(value, field);
}

export function welfareZakatDecimal(value: string) {
  return decimalStringToDecimal128(value);
}

export function withWelfareZakatSession<
  Result,
  DocumentType,
  Helpers,
  RawDocumentType,
  Operation,
>(
  query: Query<Result, DocumentType, Helpers, RawDocumentType, Operation>,
  session?: WelfareZakatMongoSession,
): typeof query {
  return session === undefined ? query : query.session(session);
}

export function welfareZakatSortDirection(
  direction: 'asc' | 'desc' | undefined,
): 1 | -1 {
  return direction === 'asc' ? 1 : -1;
}

export function escapeWelfareZakatRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

interface MongoDuplicateKeyErrorShape {
  code?: unknown;
  keyPattern?: unknown;
  keyValue?: unknown;
}

function isDuplicateKeyError(
  error: unknown,
): error is MongoDuplicateKeyErrorShape {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as MongoDuplicateKeyErrorShape).code === 11000
  );
}

export function throwMappedWelfareZakatPersistenceError(
  error: unknown,
  duplicateKeyContext: 'APPLICATION' | 'ALLOCATION' = 'APPLICATION',
): never {
  if (!isDuplicateKeyError(error)) {
    throw error;
  }

  const serialized = JSON.stringify({
    keyPattern: error.keyPattern,
    keyValue: error.keyValue,
  });

  if (serialized.includes('fundCode')) {
    throw new AssistanceDuplicateFundCodeError();
  }

  if (serialized.includes('duplicateKey')) {
    if (duplicateKeyContext === 'ALLOCATION') {
      throw new AssistanceDoubleFundingError();
    }
    throw new AssistanceDuplicateApplicationError();
  }

  throw error;
}