import { ROLE_SCOPE } from '../identity.constants.js';
import {
  IdentityConflictError,
  IdentityValidationError,
  InvalidRoleScopeError,
} from '../identity.errors.js';
import {
  nullableObjectIdToString,
  parseOptionalDate,
} from '../identity.mapper.js';
import type {
  IdentityPageResult,
  RoleRecord,
} from '../identity.types.js';

interface MongoDuplicateKeyError {
  code: number;
  keyPattern?: Record<string, number>;
  keyValue?: Record<string, unknown>;
  message?: string;
}

export interface NormalizedRoleAssignment {
  roleId: string;
  facilityId: string | null;
  expiresAt: Date | null;
}

export function mapPageResult<TSource, TResult>(
  source: IdentityPageResult<TSource>,
  mapper: (item: TSource) => TResult,
): IdentityPageResult<TResult> {
  return {
    items: source.items.map(mapper),
    page: source.page,
    pageSize: source.pageSize,
    totalItems: source.totalItems,
    totalPages: source.totalPages,
  };
}

export function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

export function difference(
  left: string[],
  right: string[],
): string[] {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item));
}

export function assertAllIdsResolved(input: {
  requestedIds: string[];
  resolvedIds: string[];
  entityName: string;
}): void {
  const requested = uniqueIds(input.requestedIds);
  const resolved = new Set(input.resolvedIds);

  const missing = requested.filter((id) => !resolved.has(id));

  if (missing.length > 0) {
    throw new IdentityValidationError(
      `One or more ${input.entityName} identifiers are invalid or inactive`,
      {
        missingIds: missing,
      },
    );
  }
}

export function isMongoDuplicateKeyError(
  error: unknown,
): error is MongoDuplicateKeyError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export function translateIdentityPersistenceError(
  error: unknown,
): never {
  if (!isMongoDuplicateKeyError(error)) {
    throw error;
  }

  const fields = Object.keys(error.keyPattern ?? {});
  const values = error.keyValue ?? {};

  throw new IdentityConflictError(
    'A record with the same unique identity value already exists',
    'IDENTITY_DUPLICATE_VALUE',
    {
      fields,
      values,
    },
  );
}

export function normalizeRoleAssignments(
  assignments: Array<{
    roleId: string;
    facilityId?: string | null;
    expiresAt?: string | Date | null;
  }>,
): NormalizedRoleAssignment[] {
  const normalized = assignments.map((assignment) => ({
    roleId: assignment.roleId,
    facilityId: assignment.facilityId ?? null,
    expiresAt: parseOptionalDate(assignment.expiresAt),
  }));

  const seen = new Set<string>();

  for (const assignment of normalized) {
    const key = roleAssignmentKey(assignment);

    if (seen.has(key)) {
      throw new IdentityValidationError(
        'Duplicate user-role assignment',
        {
          roleId: assignment.roleId,
          facilityId: assignment.facilityId,
        },
      );
    }

    seen.add(key);

    if (
      assignment.expiresAt &&
      assignment.expiresAt.getTime() <= Date.now()
    ) {
      throw new IdentityValidationError(
        'Role assignment expiry must be in the future',
        {
          roleId: assignment.roleId,
          expiresAt: assignment.expiresAt.toISOString(),
        },
      );
    }
  }

  return normalized;
}

export function validateRoleAssignmentScopes(input: {
  assignments: NormalizedRoleAssignment[];
  roles: RoleRecord[];
}): void {
  const rolesById = new Map(
    input.roles.map((role) => [
      role._id.toHexString(),
      role,
    ]),
  );

  assertAllIdsResolved({
    requestedIds: input.assignments.map(
      (assignment) => assignment.roleId,
    ),
    resolvedIds: input.roles.map((role) =>
      role._id.toHexString(),
    ),
    entityName: 'role',
  });

  for (const assignment of input.assignments) {
    const role = rolesById.get(assignment.roleId);

    if (!role) {
      continue;
    }

    if (
      role.scope === ROLE_SCOPE.GLOBAL &&
      assignment.facilityId !== null
    ) {
      throw new InvalidRoleScopeError(
        assignment.roleId,
        role.scope,
        assignment.facilityId,
      );
    }

    if (role.scope === ROLE_SCOPE.FACILITY) {
      const roleFacilityId = nullableObjectIdToString(
        role.facilityId,
      );

      if (
        !assignment.facilityId ||
        assignment.facilityId !== roleFacilityId
      ) {
        throw new InvalidRoleScopeError(
          assignment.roleId,
          role.scope,
          assignment.facilityId,
        );
      }
    }
  }
}

export function roleAssignmentKey(input: {
  roleId: string;
  facilityId?: string | null;
}): string {
  return `${input.roleId}:${input.facilityId ?? 'GLOBAL'}`;
}

export function datesEqual(
  left: Date | null | undefined,
  right: Date | null | undefined,
): boolean {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.getTime() === right.getTime();
}