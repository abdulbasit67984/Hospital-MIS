import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type {
  AuthenticatedPrincipal,
} from '../auth/auth.types.js';

import type {
  AuthorizationRepository,
} from './authorization.repository.js';

import {
  AuthorizationService,
} from './authorization.service.js';

const principal:
  AuthenticatedPrincipal = {
    userId:
      '507f1f77bcf86cd799439011',

    facilityId:
      '507f191e810c19729de860ea',

    sessionId:
      '5de81ce9-845f-42e4-907f-c66503bdfd4a',

    accessTokenId:
      'b62ed1ac-13e9-450d-ab8a-28fe34038ed5',

    tokenVersion:
      0,

    permissionVersion:
      4,
  };

function repositoryMock():
  AuthorizationRepository {
  return {
    resolvePermissionKeys:
      vi.fn(),

    incrementUserPermissionVersion:
      vi.fn(),
  };
}

describe(
  'AuthorizationService',
  () => {
    let repository:
      AuthorizationRepository;

    beforeEach(() => {
      repository =
        repositoryMock();
    });

    it(
      'resolves configured permission keys',
      async () => {
        vi.mocked(
          repository.resolvePermissionKeys,
        ).mockResolvedValue([
          'patients.read',
          'patients.create',
          'unknown.permission',
        ]);

        const service =
          new AuthorizationService(
            repository,
          );

        const permissions =
          await service.permissionsFor(
            principal,
          );

        expect(
          permissions.has(
            'patients.read',
          ),
        ).toBe(true);

        expect(
          permissions.has(
            'patients.create',
          ),
        ).toBe(true);

        expect(
          permissions.size,
        ).toBe(2);
      },
    );

    it(
      'caches permissions for the same permission version',
      async () => {
        vi.mocked(
          repository.resolvePermissionKeys,
        ).mockResolvedValue([
          'patients.read',
        ]);

        const service =
          new AuthorizationService(
            repository,
            {
              cacheTtlMilliseconds:
                60_000,
            },
          );

        await service.permissionsFor(
          principal,
        );

        await service.permissionsFor(
          principal,
        );

        expect(
          repository.resolvePermissionKeys,
        ).toHaveBeenCalledTimes(1);
      },
    );

    it(
      'reloads permissions when permissionVersion changes',
      async () => {
        vi.mocked(
          repository.resolvePermissionKeys,
        )
          .mockResolvedValueOnce([
            'patients.read',
          ])
          .mockResolvedValueOnce([
            'patients.read',
            'patients.create',
          ]);

        const service =
          new AuthorizationService(
            repository,
          );

        await service.permissionsFor(
          principal,
        );

        await service.permissionsFor({
          ...principal,
          permissionVersion: 5,
        });

        expect(
          repository.resolvePermissionKeys,
        ).toHaveBeenCalledTimes(2);
      },
    );

    it(
      'rejects users without the required permission',
      async () => {
        vi.mocked(
          repository.resolvePermissionKeys,
        ).mockResolvedValue([
          'patients.read',
        ]);

        const service =
          new AuthorizationService(
            repository,
          );

        await expect(
          service.assertPermission(
            principal,
            'patients.merge',
          ),
        ).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      },
    );

    it(
      'rejects cross-facility access',
      () => {
        const service =
          new AuthorizationService(
            repository,
          );

        expect(() =>
          service.assertFacilityAccess(
            principal,
            '507f1f77bcf86cd799439012',
          ),
        ).toThrow(
          'Cross-facility access is not permitted',
        );
      },
    );
  },
);