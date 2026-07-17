import {
  Types,
} from 'mongoose';

import type {
  DepartmentDto,
  DepartmentRecord,
  FacilityDto,
  FacilityIdentifier,
  FacilityRecord,
  ObjectIdString,
  SettingDefinitionDto,
  SettingDefinitionRecord,
  SystemSettingDto,
  SystemSettingRecord,
  SystemSettingVersionDto,
  SystemSettingVersionRecord,
} from './facility.types.js';

export function toObjectId(
  value: string | Types.ObjectId,
  fieldName = 'id',
): Types.ObjectId {
  if (value instanceof Types.ObjectId) {
    return value;
  }

  if (!Types.ObjectId.isValid(value)) {
    throw new TypeError(
      `${fieldName} must be a valid MongoDB ObjectId`,
    );
  }

  return new Types.ObjectId(value);
}

export function toNullableObjectId(
  value:
    | string
    | Types.ObjectId
    | null
    | undefined,
  fieldName = 'id',
): Types.ObjectId | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  return toObjectId(value, fieldName);
}

export function objectIdToString(
  value: Types.ObjectId | string,
): ObjectIdString {
  return typeof value === 'string'
    ? value
    : value.toHexString();
}

export function nullableObjectIdToString(
  value:
    | Types.ObjectId
    | string
    | null
    | undefined,
): ObjectIdString | null {
  return value
    ? objectIdToString(value)
    : null;
}

export function normalizeOptionalText(
  value: string | null | undefined,
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const normalized = value
    .normalize('NFKC')
    .trim();

  return normalized.length > 0
    ? normalized
    : null;
}

export function normalizeFacilityCode(
  value: string,
): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleUpperCase('en-US');
}

export function normalizeDepartmentCode(
  value: string,
): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleUpperCase('en-US');
}

export function normalizeSettingKey(
  value: string,
): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US');
}

export function normalizeEmail(
  value: string | null | undefined,
): string | null {
  const normalized =
    normalizeOptionalText(value);

  return normalized === null
    ? null
    : normalized.toLocaleLowerCase('en-US');
}

export function normalizeCurrency(
  value: string,
): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleUpperCase('en-US');
}

export function normalizeCountryCode(
  value: string,
): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleUpperCase('en-US');
}

export function normalizeLocales(
  primaryLocale: string,
  supportedLocales: readonly string[],
): string[] {
  return [
    ...new Set([
      primaryLocale.trim(),
      ...supportedLocales.map(
        (locale) => locale.trim(),
      ),
    ]),
  ];
}

export function normalizeFacilityIdentifiers(
  identifiers:
    | readonly {
        type: string;
        value: string;
        issuingAuthority?: string | null;
        isPrimary?: boolean;
      }[]
    | undefined,
): FacilityIdentifier[] {
  if (identifiers === undefined) {
    return [];
  }

  return identifiers.map(
    (identifier) => ({
      type: identifier.type
        .normalize('NFKC')
        .trim()
        .toLocaleUpperCase('en-US'),

      value: identifier.value
        .normalize('NFKC')
        .trim(),

      normalizedValue: identifier.value
        .normalize('NFKC')
        .trim()
        .toLocaleLowerCase('en-US'),

      issuingAuthority:
        normalizeOptionalText(
          identifier.issuingAuthority,
        ),

      isPrimary:
        identifier.isPrimary ?? false,
    }),
  );
}

export function escapeRegex(
  value: string,
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
}

export function toFacilityDto(
  record: FacilityRecord,
): FacilityDto {
  return {
    id: objectIdToString(record._id),
    code: record.code,
    name: record.name,
    legalName: record.legalName ?? null,
    facilityType: record.facilityType,
    parentFacilityId:
      nullableObjectIdToString(
        record.parentFacilityId,
      ),
    identifiers: record.identifiers,
    timezone: record.timezone,
    currency: record.currency,
    locale: record.locale,
    supportedLocales: record.supportedLocales,
    address: record.address,
    contact: record.contact,
    status: record.status,
    allowsAuthentication:
      record.allowsAuthentication,
    deactivatedAt:
      record.deactivatedAt?.toISOString() ??
      null,
    deactivationReason:
      record.deactivationReason ?? null,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toDepartmentDto(
  record: DepartmentRecord,
): DepartmentDto {
  return {
    id: objectIdToString(record._id),
    facilityId:
      objectIdToString(record.facilityId),
    parentDepartmentId:
      nullableObjectIdToString(
        record.parentDepartmentId,
      ),
    managerStaffId:
      nullableObjectIdToString(
        record.managerStaffId,
      ),
    code: record.code,
    name: record.name,
    description: record.description ?? null,
    departmentType: record.departmentType,
    isClinical: record.isClinical,
    location: record.location ?? null,
    costCenterCode:
      record.costCenterCode ?? null,
    contact: record.contact,
    status: record.status,
    deactivatedAt:
      record.deactivatedAt?.toISOString() ??
      null,
    deactivationReason:
      record.deactivationReason ?? null,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toSettingDefinitionDto(
  record: SettingDefinitionRecord,
): SettingDefinitionDto {
  return {
    id: objectIdToString(record._id),
    key: record.key,
    category: record.category,
    dataType: record.dataType,
    allowedScopes: record.allowedScopes,
    defaultValue: record.isSensitive
      ? null
      : record.defaultValue,
    labels: record.labels,
    validation: record.validation,
    isSensitive: record.isSensitive,
    isMutable: record.isMutable,
    isActive: record.isActive,
    cacheTtlSeconds:
      record.cacheTtlSeconds,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toSystemSettingDto(
  record: SystemSettingRecord,
): SystemSettingDto {
  return {
    id: objectIdToString(record._id),
    key: record.key,
    scope: record.scope,
    facilityId:
      nullableObjectIdToString(
        record.facilityId,
      ),
    value: record.isSensitive
      ? null
      : record.value,
    isSensitive: record.isSensitive,
    isConfigured: record.isSensitive
      ? record.encryptedValue !== null ||
        record.valueHash !== null
      : record.value !== undefined,
    revision: record.revision,
    isActive: record.isActive,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toSystemSettingVersionDto(
  record: SystemSettingVersionRecord,
): SystemSettingVersionDto {
  return {
    id: objectIdToString(record._id),
    settingId:
      objectIdToString(record.settingId),
    key: record.key,
    scope: record.scope,
    facilityId:
      nullableObjectIdToString(
        record.facilityId,
      ),
    revision: record.revision,
    changeType: record.changeType,
    changeSource: record.changeSource,
    value: record.isSensitive
      ? null
      : record.value,
    isSensitive: record.isSensitive,
    isConfigured: record.isSensitive
      ? record.encryptedValue !== null ||
        record.valueHash !== null
      : record.value !== undefined,
    isActive: record.isActive,
    changedBy:
      nullableObjectIdToString(
        record.changedBy,
      ),
    changeReason: record.changeReason,
    correlationId:
      record.correlationId ?? null,
    changedAt:
      record.changedAt.toISOString(),
  };
}