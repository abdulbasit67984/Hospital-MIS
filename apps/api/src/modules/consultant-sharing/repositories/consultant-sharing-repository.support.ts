import type { ClientSession, Query } from 'mongoose';

import { decimalStringToDecimal128, toObjectId } from '@hospital-mis/database';

import {
  ConsultantAgreementConflictError,
  ConsultantDuplicateCalculationError,
  ConsultantSharingConcurrencyError,
} from '../consultant-sharing.errors.js';

export type ConsultantSharingMongoSession = ClientSession;

export function consultantSharingObjectId(value: string, field: string) {
  return toObjectId(value, field);
}

export function nullableConsultantSharingObjectId(
  value: string | null | undefined,
  field: string,
) {
  return value == null ? null : toObjectId(value, field);
}

export function consultantSharingDecimal(value: string) {
  return decimalStringToDecimal128(value);
}

export function consultantSharingDecimalString(value: unknown): string {
  if (value == null) return '0.00';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'object' && 'toString' in value) {
    return String((value as { toString(): string }).toString());
  }
  throw new TypeError('Unsupported persisted decimal representation');
}

export function consultantSharingIdString(value: unknown): string {
  if (value == null) throw new TypeError('Expected persisted ObjectId');
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'toHexString' in value) {
    return (value as { toHexString(): string }).toHexString();
  }
  return String(value);
}

export function nullableConsultantSharingIdString(value: unknown): string | null {
  return value == null ? null : consultantSharingIdString(value);
}

export function consultantSharingIso(value: unknown): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError('Expected persisted Date');
  }
  return value.toISOString();
}

export function nullableConsultantSharingIso(value: unknown): string | null {
  return value == null ? null : consultantSharingIso(value);
}

export function withConsultantSharingSession<
  Result,
  DocumentType,
  Helpers,
  RawDocumentType,
  Operation,
>(
  query: Query<Result, DocumentType, Helpers, RawDocumentType, Operation>,
  session?: ConsultantSharingMongoSession,
): typeof query {
  return session === undefined ? query : query.session(session);
}

export function consultantSharingMongoSession(
  transaction: Readonly<{ session: unknown }> | undefined,
): ConsultantSharingMongoSession | undefined {
  return transaction?.session as ConsultantSharingMongoSession | undefined;
}

export function escapeConsultantSharingRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function consultantSharingSortDirection(
  direction: 'asc' | 'desc' | undefined,
): 1 | -1 {
  return direction === 'asc' ? 1 : -1;
}

interface MongoWriteErrorShape {
  code?: unknown;
  keyPattern?: unknown;
  keyValue?: unknown;
}

function isDuplicateKeyError(error: unknown): error is MongoWriteErrorShape {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as MongoWriteErrorShape).code === 11000
  );
}

export function throwMappedConsultantSharingPersistenceError(error: unknown): never {
  if (!isDuplicateKeyError(error)) throw error;

  const serialized = JSON.stringify({
    keyPattern: error.keyPattern,
    keyValue: error.keyValue,
  });

  if (
    serialized.includes('calculationHash') ||
    serialized.includes('sourceFinancialEventId') ||
    serialized.includes('recognition')
  ) {
    throw new ConsultantDuplicateCalculationError();
  }

  if (
    serialized.includes('agreementNumber') ||
    serialized.includes('fallback') ||
    serialized.includes('ruleCode')
  ) {
    throw new ConsultantAgreementConflictError();
  }

  if (serialized.includes('version')) {
    throw new ConsultantSharingConcurrencyError();
  }

  throw error;
}