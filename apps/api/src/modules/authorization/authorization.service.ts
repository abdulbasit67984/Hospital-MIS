import {
  ForbiddenError,
} from '@hospital-mis/shared';

import {
  isPermissionKey,
  type PermissionKey,
} from '@hospital-mis/permissions';

import type {
  AuthenticatedPrincipal,
} from '../auth/auth.types.js';

import type {
  AuthorizationRepository,
} from './authorization.repository.js';

type PermissionCacheEntry = {
  permissions:
    ReadonlySet<PermissionKey>;

  expiresAt:
    number;
};

export type AuthorizationServiceOptions = {
  cacheTtlMilliseconds: number;
};

export const defaultAuthorizationServiceOptions:
  AuthorizationServiceOptions = {
    cacheTtlMilliseconds:
      30_000,
  };

export class AuthorizationService {
  private readonly cache =
    new Map<
      string,
      PermissionCacheEntry
    >();

  constructor(
    private readonly repository:
      AuthorizationRepository,

    private readonly options:
      AuthorizationServiceOptions =
        defaultAuthorizationServiceOptions,
  ) {}

  private cacheKey(
    principal:
      AuthenticatedPrincipal,
  ): string {
    return [
      principal.facilityId,
      principal.userId,
      principal.permissionVersion,
    ].join(':');
  }

  async permissionsFor(
    principal:
      AuthenticatedPrincipal,
  ): Promise<
    ReadonlySet<PermissionKey>
  > {
    const key =
      this.cacheKey(
        principal,
      );

    const cached =
      this.cache.get(key);

    if (
      cached !== undefined &&
      cached.expiresAt >
        Date.now()
    ) {
      return cached.permissions;
    }

    const resolved =
      await this.repository
        .resolvePermissionKeys(
          principal.facilityId,
          principal.userId,
        );

    const permissions =
      new Set<PermissionKey>();

    for (const candidate of resolved) {
      if (
        isPermissionKey(candidate)
      ) {
        permissions.add(candidate);
      }
    }

    this.removeStaleEntries(
      principal.facilityId,
      principal.userId,
    );

    this.cache.set(
      key,
      {
        permissions,

        expiresAt:
          Date.now() +
          this.options
            .cacheTtlMilliseconds,
      },
    );

    return permissions;
  }

  async hasPermission(
    principal:
      AuthenticatedPrincipal,
    permission:
      PermissionKey,
  ): Promise<boolean> {
    const permissions =
      await this.permissionsFor(
        principal,
      );

    return permissions.has(
      permission,
    );
  }

  async hasAnyPermission(
    principal:
      AuthenticatedPrincipal,
    required:
      readonly PermissionKey[],
  ): Promise<boolean> {
    const permissions =
      await this.permissionsFor(
        principal,
      );

    return required.some(
      (permission) =>
        permissions.has(
          permission,
        ),
    );
  }

  async hasAllPermissions(
    principal:
      AuthenticatedPrincipal,
    required:
      readonly PermissionKey[],
  ): Promise<boolean> {
    const permissions =
      await this.permissionsFor(
        principal,
      );

    return required.every(
      (permission) =>
        permissions.has(
          permission,
        ),
    );
  }

  async assertPermission(
    principal:
      AuthenticatedPrincipal,
    permission:
      PermissionKey,
  ): Promise<void> {
    if (
      !(await this.hasPermission(
        principal,
        permission,
      ))
    ) {
      throw new ForbiddenError(
        `Permission ${permission} is required`,
      );
    }
  }

  async assertAnyPermission(
    principal:
      AuthenticatedPrincipal,
    required:
      readonly PermissionKey[],
  ): Promise<void> {
    if (
      !(await this.hasAnyPermission(
        principal,
        required,
      ))
    ) {
      throw new ForbiddenError(
        'The current user does not have any required permission',
      );
    }
  }

  assertFacilityAccess(
    principal:
      AuthenticatedPrincipal,
    facilityId: string,
  ): void {
    if (
      principal.facilityId !==
      facilityId
    ) {
      throw new ForbiddenError(
        'Cross-facility access is not permitted',
      );
    }
  }

  invalidateUser(
    facilityId: string,
    userId: string,
  ): void {
    this.removeStaleEntries(
      facilityId,
      userId,
    );
  }

  clearCache(): void {
    this.cache.clear();
  }

  private removeStaleEntries(
    facilityId: string,
    userId: string,
  ): void {
    const prefix =
      `${facilityId}:${userId}:`;

    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }
}