import {
  createHash,
} from 'node:crypto';

import {
  Types,
} from 'mongoose';

import type {
  RadiologyOrderPriority,
} from '@hospital-mis/database';

import {
  DEFAULT_RADIOLOGY_NUMBER_WIDTH,
} from './radiology.constants.js';

import type {
  RadiologyProcedureRecord,
} from './radiology.persistence.types.js';

import type {
  CreateRadiologyOrderItemInput,
} from './radiology.types.js';

export function normalizeRadiologyCode(
  value: string,
): string {
  return value
    .normalize('NFKC')
    .trim()
    .toUpperCase()
    .replaceAll(/[^A-Z0-9.-]+/gu, '_');
}

export function normalizeRadiologyText(
  value: string,
): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US')
    .replaceAll(/\s+/gu, ' ');
}

export function normalizeNullableRadiologyText(
  value: string | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }

  const normalized = value.normalize('NFKC').trim();

  return normalized.length === 0
    ? null
    : normalized;
}

export function uniqueRadiologyStrings(
  values: readonly string[],
): string[] {
  const unique = new Map<string, string>();

  for (const value of values) {
    const display = value.normalize('NFKC').trim();

    if (display.length > 0) {
      unique.set(normalizeRadiologyText(display), display);
    }
  }

  return [...unique.values()];
}

export function uniqueRadiologyObjectIdStrings(
  values: readonly string[],
): string[] {
  return [...new Set(values.map((value) => value.toLowerCase()))];
}

function canonicalValue(
  value: unknown,
): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Types.ObjectId) {
    return value.toHexString();
  }

  if (value instanceof Types.Decimal128) {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalValue(nested)]),
    );
  }

  return value;
}

export function radiologyContentHash(
  value: unknown,
): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalValue(value)))
    .digest('hex');
}

export function buildRadiologySequenceKey(
  namespace: string,
  year: number,
): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new RangeError('Radiology sequence year is invalid');
  }

  return `${namespace}:${year}`;
}

export function formatRadiologyNumber(
  prefix: string,
  year: number,
  sequenceValue: number,
  width = DEFAULT_RADIOLOGY_NUMBER_WIDTH,
): string {
  if (!Number.isSafeInteger(sequenceValue) || sequenceValue < 1) {
    throw new RangeError('Radiology sequence value must be a positive safe integer');
  }

  if (!Number.isInteger(width) || width < 4 || width > 12) {
    throw new RangeError('Radiology number width must be between 4 and 12');
  }

  return [
    normalizeRadiologyCode(prefix),
    String(year),
    String(sequenceValue).padStart(width, '0'),
  ].join('-');
}

export function turnaroundMinutesForRadiologyPriority(
  procedure: Pick<
    RadiologyProcedureRecord,
    | 'routineTurnaroundMinutes'
    | 'urgentTurnaroundMinutes'
    | 'statTurnaroundMinutes'
  >,
  priority: RadiologyOrderPriority,
): number {
  switch (priority) {
    case 'STAT':
      return (
        procedure.statTurnaroundMinutes ??
        procedure.urgentTurnaroundMinutes ??
        procedure.routineTurnaroundMinutes
      );

    case 'URGENT':
      return (
        procedure.urgentTurnaroundMinutes ??
        procedure.routineTurnaroundMinutes
      );

    case 'ROUTINE':
      return procedure.routineTurnaroundMinutes;
  }
}

export function radiologyProcedureSelectionKey(
  item: Pick<
    CreateRadiologyOrderItemInput,
    | 'procedureId'
    | 'requestedLaterality'
    | 'contrastRequested'
    | 'requestedContrastRoute'
  >,
): string {
  return [
    item.procedureId.toLowerCase(),
    item.requestedLaterality,
    item.contrastRequested ? 'CONTRAST' : 'NO_CONTRAST',
    item.requestedContrastRoute ?? 'NO_ROUTE',
  ].join(':');
}

export function radiologyRestoreAssociatedData(
  facilityId: string,
  collection: string,
  entityId: string,
  expectedPostVersion: number,
): string {
  return [
    'hospital-mis',
    'radiology',
    'restore',
    facilityId,
    collection,
    entityId,
    String(expectedPostVersion),
  ].join(':');
}