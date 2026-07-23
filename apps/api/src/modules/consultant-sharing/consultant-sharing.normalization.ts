import { createHash } from 'node:crypto';

import { CONSULTANT_SHARING_MAX_PAGE_SIZE } from './consultant-sharing.constants.js';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Readonly<Record<string, unknown>>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }

  return value;
}

export function stableConsultantSharingPayloadHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

export function normalizeConsultantSharingCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._/-]+/gu, '_')
    .replace(/_+/gu, '_')
    .replace(/^_+|_+$/gu, '');
}

export function normalizeConsultantSharingName(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

export function maskConsultantFinancialReference(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= 4) {
    return '*'.repeat(normalized.length);
  }
  return `${'*'.repeat(normalized.length - 4)}${normalized.slice(-4)}`;
}

export function buildConsultantCalculationDuplicateKey(input: Readonly<{
  facilityId: string;
  consultantId: string;
  agreementId: string;
  agreementVersion: number;
  agreementRuleId: string;
  ruleVersion: number;
  sourceFinancialEventId: string;
  invoiceLineId: string;
}>): string {
  return stableConsultantSharingPayloadHash({
    facilityId: input.facilityId,
    consultantId: input.consultantId,
    agreementId: input.agreementId,
    agreementVersion: input.agreementVersion,
    agreementRuleId: input.agreementRuleId,
    ruleVersion: input.ruleVersion,
    sourceFinancialEventId: input.sourceFinancialEventId,
    invoiceLineId: input.invoiceLineId,
  });
}

export function buildConsultantParticipantDuplicateKey(input: Readonly<{
  participantId: string;
  participantRole: string;
  customRoleCode?: string | null;
}>): string {
  return stableConsultantSharingPayloadHash({
    participantId: input.participantId,
    participantRole: input.participantRole.toUpperCase(),
    customRoleCode: input.customRoleCode?.trim().toUpperCase() ?? null,
  });
}

export function buildConsultantSettlementDuplicateKey(input: Readonly<{
  facilityId: string;
  consultantId: string;
  periodFrom: string;
  periodThrough: string;
  currency: string;
}>): string {
  return stableConsultantSharingPayloadHash({
    facilityId: input.facilityId,
    consultantId: input.consultantId,
    periodFrom: new Date(input.periodFrom).toISOString(),
    periodThrough: new Date(input.periodThrough).toISOString(),
    currency: input.currency.toUpperCase(),
  });
}

export function normalizeConsultantSharingPagination(input: Readonly<{
  page?: number;
  pageSize?: number;
}>): Readonly<{
  page: number;
  pageSize: number;
  skip: number;
}> {
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const pageSize = Math.min(
    CONSULTANT_SHARING_MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(input.pageSize ?? 50)),
  );

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
  };
}

export interface ConsultantSharingRealtimePayloadInput {
  agreementId?: string | null;
  ruleId?: string | null;
  revenueEntryId?: string | null;
  settlementId?: string | null;
  disputeId?: string | null;
  status: string;
  previousStatus?: string | null;
  version: number;
  eventAt: string;
  [key: string]: unknown;
}

export function safeConsultantSharingRealtimePayload(
  input: ConsultantSharingRealtimePayloadInput,
): Readonly<{
  agreementId: string | null;
  ruleId: string | null;
  revenueEntryId: string | null;
  settlementId: string | null;
  disputeId: string | null;
  status: string;
  previousStatus: string | null;
  version: number;
  eventAt: string;
}> {
  return {
    agreementId: input.agreementId ?? null,
    ruleId: input.ruleId ?? null,
    revenueEntryId: input.revenueEntryId ?? null,
    settlementId: input.settlementId ?? null,
    disputeId: input.disputeId ?? null,
    status: input.status,
    previousStatus: input.previousStatus ?? null,
    version: input.version,
    eventAt: input.eventAt,
  };
}