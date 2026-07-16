import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  createObjectId,
  type Db,
} from '@hospital-mis/database';

import {
  MongoAuthorizationRepository,
} from './authorization.repository.js';

type CapturedFind = {
  collection: string;
  filter: Record<string, unknown>;
};

type CapturedUpdate = {
  collection: string;
  filter: Record<string, unknown>;
  update: Record<string, unknown>;
};

function createDatabaseFixture() {
  const userId = createObjectId();
  const facilityId = createObjectId();
  const globalRoleId =
    createObjectId();
  const facilityRoleId =
    createObjectId();
  const firstPermissionId =
    createObjectId();
  const secondPermissionId =
    createObjectId();

  const records: Record<
    string,
    unknown[]
  > = {
    userRoles: [
      {
        userId,
        roleId: globalRoleId,
        facilityId: null,
        isActive: true,
        expiresAt: null,
      },
      {
        userId,
        roleId: facilityRoleId,
        facilityId,
        isActive: true,
        expiresAt: null,
      },
    ],
    roles: [
      {
        _id: globalRoleId,
        facilityId: null,
        scope: 'GLOBAL',
        isActive: true,
      },
      {
        _id: facilityRoleId,
        facilityId,
        scope: 'FACILITY',
        isActive: true,
      },
    ],
    rolePermissions: [
      {
        roleId: globalRoleId,
        permissionId:
          firstPermissionId,
      },
      {
        roleId: facilityRoleId,
        permissionId:
          secondPermissionId,
      },
      {
        roleId: facilityRoleId,
        permissionId:
          firstPermissionId,
      },
    ],
    permissions: [
      {
        _id: firstPermissionId,
        code: 'identity.users.read',
        isActive: true,
      },
      {
        _id: secondPermissionId,
        code: 'identity.roles.read',
        isActive: true,
      },
    ],
  };

  const finds: CapturedFind[] = [];
  const updates: CapturedUpdate[] = [];

  const database = {
    collection(
      collectionName: string,
    ) {
      return {
        find(
          filter:
            Record<string, unknown>,
        ) {
          finds.push({
            collection:
              collectionName,
            filter,
          });

          return {
            async toArray() {
              return (
                records[
                  collectionName
                ] ?? []
              );
            },
          };
        },

        async updateOne(
          filter:
            Record<string, unknown>,
          update:
            Record<string, unknown>,
        ) {
          updates.push({
            collection:
              collectionName,
            filter,
            update,
          });

          return {
            modifiedCount: 1,
          };
        },
      };
    },
  } as unknown as Db;

  return {
    database,
    userId,
    facilityId,
    finds,
    updates,
  };
}

describe(
  'MongoAuthorizationRepository',
  () => {
    it(
      'resolves active permission codes through Phase 4 references',
      async () => {
        const fixture =
          createDatabaseFixture();
        const repository =
          new MongoAuthorizationRepository(
            fixture.database,
          );

        const result =
          await repository.resolvePermissionKeys(
            fixture.facilityId.toHexString(),
            fixture.userId.toHexString(),
          );

        expect(result).toEqual([
          'identity.roles.read',
          'identity.users.read',
        ]);

        expect(
          fixture.finds.map(
            (call) =>
              call.collection,
          ),
        ).toEqual([
          'userRoles',
          'roles',
          'rolePermissions',
          'permissions',
        ]);

        expect(
          fixture.finds[0]?.filter,
        ).toMatchObject({
          isActive: true,
        });

        expect(
          fixture.finds[2]?.filter,
        ).not.toHaveProperty(
          'permissionKey',
        );

        expect(
          fixture.finds[3]?.filter,
        ).toMatchObject({
          isActive: true,
        });
      },
    );

    it(
      'increments the global user permission version without requiring a home-facility match',
      async () => {
        const fixture =
          createDatabaseFixture();
        const repository =
          new MongoAuthorizationRepository(
            fixture.database,
          );

        await expect(
          repository.incrementUserPermissionVersion(
            fixture.facilityId.toHexString(),
            fixture.userId.toHexString(),
          ),
        ).resolves.toBe(true);

        expect(
          fixture.updates[0]?.filter,
        ).not.toHaveProperty(
          'facilityId',
        );

        expect(
          fixture.updates[0]?.update,
        ).toMatchObject({
          $inc: {
            permissionVersion: 1,
            version: 1,
          },
        });
      },
    );
  },
);