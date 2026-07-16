import { Types } from 'mongoose';

import type {
  ObjectIdString,
  PermissionDto,
  PermissionRecord,
  RoleDto,
  RoleRecord,
  StaffDto,
  StaffRecord,
  UserDto,
  UserRecord,
  UserRoleDto,
  UserRoleRecord,
} from './identity.types.js';

export function toObjectId(
  value: string | Types.ObjectId,
  fieldName = 'id',
): Types.ObjectId {
  if (value instanceof Types.ObjectId) {
    return value;
  }

  if (!Types.ObjectId.isValid(value)) {
    throw new TypeError(`${fieldName} must be a valid MongoDB ObjectId`);
  }

  return new Types.ObjectId(value);
}

export function toNullableObjectId(
  value: string | Types.ObjectId | null | undefined,
  fieldName = 'id',
): Types.ObjectId | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return toObjectId(value, fieldName);
}

export function objectIdToString(
  value: Types.ObjectId | string,
): ObjectIdString {
  return typeof value === 'string' ? value : value.toHexString();
}

export function nullableObjectIdToString(
  value: Types.ObjectId | string | null | undefined,
): ObjectIdString | null {
  return value ? objectIdToString(value) : null;
}

export function normalizeUsername(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

export function normalizeEmail(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeOptionalText(value);

  return normalized
    ? normalized.toLocaleLowerCase('en-US')
    : null;
}

export function normalizeOptionalText(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeEmployeeNumber(value: string): string {
  return value.trim().toLocaleUpperCase('en-US');
}

export function normalizeRoleCode(value: string): string {
  return value.trim().toLocaleUpperCase('en-US');
}

export function normalizeCnic(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeOptionalText(value);
  return normalized ? normalized.replace(/\D/g, '') : null;
}

export function buildStaffDisplayName(input: {
  firstName: string;
  middleName?: string | null;
  lastName: string;
}): string {
  return [input.firstName, input.middleName, input.lastName]
    .map((part) => normalizeOptionalText(part))
    .filter((part): part is string => Boolean(part))
    .join(' ');
}

export function parseOptionalDate(
  value: string | Date | null | undefined,
): Date | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError('Invalid date value');
  }

  return date;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function toPermissionDto(record: PermissionRecord): PermissionDto {
  return {
    id: objectIdToString(record._id),
    code: record.code,
    name: record.name,
    module: record.module,
    description: record.description ?? null,
    isSystem: record.isSystem,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toRoleDto(record: RoleRecord): RoleDto {
  return {
    id: objectIdToString(record._id),
    facilityId: nullableObjectIdToString(record.facilityId),
    code: record.code,
    name: record.name,
    description: record.description ?? null,
    scope: record.scope,
    isSystem: record.isSystem,
    isActive: record.isActive,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toStaffDto(record: StaffRecord): StaffDto {
  return {
    id: objectIdToString(record._id),
    facilityId: objectIdToString(record.facilityId),
    departmentId: nullableObjectIdToString(record.departmentId),
    employeeNumber: record.employeeNumber,
    firstName: record.firstName,
    middleName: record.middleName ?? null,
    lastName: record.lastName,
    displayName: record.displayName,
    cnic: record.cnic ?? null,
    phone: record.phone ?? null,
    email: record.email ?? null,
    designation: record.designation ?? null,
    professionalType: record.professionalType ?? null,
    professionalRegistrationNumber:
      record.professionalRegistrationNumber ?? null,
    joiningDate: record.joiningDate?.toISOString() ?? null,
    employmentStatus: record.employmentStatus,
    isClinical: record.isClinical,
    isActive: record.isActive,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toUserDto(record: UserRecord): UserDto {
  return {
    id: objectIdToString(record._id),
    staffId: nullableObjectIdToString(record.staffId),
    username: record.username,
    email: record.email ?? null,
    status: record.status,
    mustChangePassword: record.mustChangePassword,
    failedLoginAttempts: record.failedLoginAttempts,
    lockedUntil: record.lockedUntil?.toISOString() ?? null,
    lastLoginAt: record.lastLoginAt?.toISOString() ?? null,
    passwordChangedAt: record.passwordChangedAt?.toISOString() ?? null,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toUserRoleDto(
  record: UserRoleRecord,
): UserRoleDto {
  return {
    id: objectIdToString(record._id),
    userId: objectIdToString(record.userId),
    roleId: objectIdToString(record.roleId),
    facilityId: nullableObjectIdToString(record.facilityId),
    assignedBy: objectIdToString(record.assignedBy),
    assignedAt: record.assignedAt.toISOString(),
    expiresAt: record.expiresAt?.toISOString() ?? null,
    isActive: record.isActive,
    revokedAt: record.revokedAt?.toISOString() ?? null,
    revokedBy: nullableObjectIdToString(record.revokedBy),
    revocationReason: record.revocationReason ?? null,
  };
}