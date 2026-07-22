import type {
  Query,
} from 'mongoose';

import {
  decimal128,
  toObjectId,
} from '@hospital-mis/database';

import {
  ClaimDuplicateError,
  ClaimDuplicateLineError,
} from '../claims.errors.js';

import type {
  ClaimsMongoSession,
} from '../claims.persistence.types.js';

export function claimRecord<T>(value: unknown): T {
  return value as T;
}

export function claimObjectId(
  value: string,
  field: string,
) {
  return toObjectId(value, field);
}

export function nullableClaimObjectIdValue(
  value: string | null | undefined,
  field: string,
) {
  return value == null ? null : toObjectId(value, field);
}

export function claimDecimal(value: string) {
  return decimal128(value);
}

export function withClaimsSession<
  Result,
  DocumentType,
  Helpers,
  RawDocumentType,
  Operation,
>(
  query: Query<
    Result,
    DocumentType,
    Helpers,
    RawDocumentType,
    Operation
  >,
  session?: ClaimsMongoSession,
): typeof query {
  return session === undefined ? query : query.session(session);
}

export function claimSortDirection(
  direction: 'asc' | 'desc' | undefined,
): 1 | -1 {
  return direction === 'asc' ? 1 : -1;
}

export function escapeClaimRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

interface MongoDuplicateKeyShape {
  code?: unknown;
  keyPattern?: unknown;
  keyValue?: unknown;
}

function isDuplicateKeyError(
  error: unknown,
): error is MongoDuplicateKeyShape {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as MongoDuplicateKeyShape).code === 11000
  );
}

export function throwMappedClaimsPersistenceError(
  error: unknown,
): never {
  if (isDuplicateKeyError(error)) {
    const serialized = JSON.stringify({
      keyPattern: error.keyPattern,
      keyValue: error.keyValue,
    });

    if (
      serialized.includes('invoiceLineId') ||
      serialized.includes('lineNumber') ||
      serialized.includes('duplicateKey') && serialized.includes('claimId')
    ) {
      throw new ClaimDuplicateLineError();
    }

    throw new ClaimDuplicateError();
  }

  throw error;
}