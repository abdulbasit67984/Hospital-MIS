import {
  createHash,
} from 'node:crypto';

import {
  CLAIM_DEFAULT_PAGE_SIZE,
  CLAIM_MAX_PAGE_SIZE,
} from './claims.constants.js';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === 'object') {
    const source = value as Readonly<Record<string, unknown>>;
    const result: Record<string, unknown> = {};

    for (const key of Object.keys(source).sort()) {
      const child = source[key];
      if (child !== undefined) {
        result[key] = canonicalize(child);
      }
    }

    return result;
  }

  return value;
}

export function normalizeClaimCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/gu, '_');
}

export function normalizeClaimText(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

export function normalizeOptionalClaimText(
  value: string | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }

  const normalized = normalizeClaimText(value);
  return normalized.length === 0 ? null : normalized;
}

export function normalizeClaimReference(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeOptionalClaimText(value);
  return normalized === null ? null : normalized.toUpperCase();
}

export function maskClaimReference(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeOptionalClaimText(value);
  if (normalized === null) {
    return null;
  }

  if (normalized.length <= 4) {
    return '*'.repeat(normalized.length);
  }

  const visible = normalized.slice(-4);
  const maskLength = Math.min(8, normalized.length - 4);
  return `${'*'.repeat(maskLength)}${visible}`;
}

export function hashClaimSensitiveReference(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeClaimReference(value);
  if (normalized === null) {
    return null;
  }

  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export function stableClaimPayloadHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)), 'utf8')
    .digest('hex');
}

export function buildClaimDuplicateKey(input: Readonly<{
  facilityId: string;
  payerOrganizationId: string;
  invoiceId: string;
  patientCoverageId: string;
  originalClaimId?: string | null;
}>): string {
  return stableClaimPayloadHash({
    facilityId: input.facilityId,
    invoiceId: input.invoiceId,
    originalClaimId: input.originalClaimId ?? null,
    patientCoverageId: input.patientCoverageId,
    payerOrganizationId: input.payerOrganizationId,
  });
}

export function buildClaimLineDuplicateKey(input: Readonly<{
  facilityId: string;
  payerOrganizationId: string;
  patientCoverageId: string;
  invoiceLineId: string;
  serviceFrom: string;
  serviceThrough: string | null;
  serviceCodeSystem: string;
  serviceCode: string;
}>): string {
  return stableClaimPayloadHash({
    facilityId: input.facilityId,
    invoiceLineId: input.invoiceLineId,
    patientCoverageId: input.patientCoverageId,
    payerOrganizationId: input.payerOrganizationId,
    serviceCode: normalizeClaimCode(input.serviceCode),
    serviceCodeSystem: normalizeClaimCode(input.serviceCodeSystem),
    serviceFrom: input.serviceFrom,
    serviceThrough: input.serviceThrough,
  });
}

export function normalizeClaimPagination(input: Readonly<{
  page?: number;
  pageSize?: number;
}>): Readonly<{
  page: number;
  pageSize: number;
  skip: number;
}> {
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const pageSize = Math.min(
    CLAIM_MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(input.pageSize ?? CLAIM_DEFAULT_PAGE_SIZE)),
  );

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
  };
}

export function uniqueSortedNumbers(values: readonly number[]): readonly number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

export function safeClaimRealtimePayload(input: Readonly<{
  claimId: string;
  claimBatchId?: string | null;
  status: string;
  previousStatus?: string | null;
  version: number;
  eventAt: string;
}>): Readonly<Record<string, string | number | null>> {
  return {
    claimId: input.claimId,
    claimBatchId: input.claimBatchId ?? null,
    status: input.status,
    previousStatus: input.previousStatus ?? null,
    version: input.version,
    eventAt: input.eventAt,
  };
}