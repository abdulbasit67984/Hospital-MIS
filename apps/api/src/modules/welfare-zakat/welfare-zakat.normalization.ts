import {
  createHash,
} from 'node:crypto';

import {
  WELFARE_ZAKAT_DEFAULT_PAGE_SIZE,
  WELFARE_ZAKAT_MAX_PAGE_SIZE,
} from './welfare-zakat.constants.js';

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

export function normalizeAssistanceCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/gu, '_');
}

export function normalizeAssistanceText(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

export function normalizeOptionalAssistanceText(
  value: string | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }

  const normalized = normalizeAssistanceText(value);
  return normalized.length === 0 ? null : normalized;
}

export function normalizeAssistanceReference(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeOptionalAssistanceText(value);
  return normalized === null ? null : normalized.toUpperCase();
}

export function maskAssistanceReference(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeOptionalAssistanceText(value);
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

export function hashAssistanceSensitiveReference(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeAssistanceReference(value);
  if (normalized === null) {
    return null;
  }

  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export function stableAssistancePayloadHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)), 'utf8')
    .digest('hex');
}

export function buildAssistanceApplicationDuplicateKey(input: Readonly<{
  facilityId: string;
  patientId: string;
  applicationType: string;
  invoiceId?: string | null;
  admissionId?: string | null;
  financialYearCode?: string | null;
}>): string {
  return stableAssistancePayloadHash({
    admissionId: input.admissionId ?? null,
    applicationType: normalizeAssistanceCode(input.applicationType),
    facilityId: input.facilityId,
    financialYearCode:
      normalizeAssistanceReference(input.financialYearCode) ?? null,
    invoiceId: input.invoiceId ?? null,
    patientId: input.patientId,
  });
}

export function buildAssistanceAllocationDuplicateKey(input: Readonly<{
  facilityId: string;
  fundId: string;
  patientId: string;
  applicationId: string;
  approvalId: string;
  invoiceId: string;
  invoiceLineId?: string | null;
  operationReference?: string | null;
}>): string {
  return stableAssistancePayloadHash({
    applicationId: input.applicationId,
    approvalId: input.approvalId,
    facilityId: input.facilityId,
    fundId: input.fundId,
    invoiceId: input.invoiceId,
    invoiceLineId: input.invoiceLineId ?? null,
    operationReference:
      normalizeAssistanceReference(input.operationReference) ?? null,
    patientId: input.patientId,
  });
}

export function normalizeAssistancePagination(input: Readonly<{
  page?: number;
  pageSize?: number;
}>): Readonly<{
  page: number;
  pageSize: number;
  skip: number;
}> {
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const pageSize = Math.min(
    WELFARE_ZAKAT_MAX_PAGE_SIZE,
    Math.max(
      1,
      Math.trunc(input.pageSize ?? WELFARE_ZAKAT_DEFAULT_PAGE_SIZE),
    ),
  );

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
  };
}

export function uniqueSortedStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right),
  );
}

export function safeWelfareZakatRealtimePayload(input: Readonly<{
  fundId?: string | null;
  applicationId?: string | null;
  approvalId?: string | null;
  allocationId?: string | null;
  status: string;
  previousStatus?: string | null;
  version: number;
  eventAt: string;
}>): Readonly<Record<string, string | number | null>> {
  return {
    fundId: input.fundId ?? null,
    applicationId: input.applicationId ?? null,
    approvalId: input.approvalId ?? null,
    allocationId: input.allocationId ?? null,
    status: input.status,
    previousStatus: input.previousStatus ?? null,
    version: input.version,
    eventAt: input.eventAt,
  };
}