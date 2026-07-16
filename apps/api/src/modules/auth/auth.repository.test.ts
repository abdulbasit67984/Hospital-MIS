import type { Db } from '@hospital-mis/database';

import {
  createObjectId,
} from '@hospital-mis/database';

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  MongoAuthRepository,
} from './auth.repository.js';

type FixtureOptions = Readonly<{
  assignmentScope:
    | 'GLOBAL'
    | 'FACILITY'
    | 'NONE';
}>;

function createFixture(
  options: FixtureOptions,
) {
  const userId =
    createObjectId();

  const homeFacilityId =
    createObjectId();

  const selectedFacilityId =
    createObjectId();

  const roleId =
    createObjectId();

  const storedUser = {
    _id:
      userId,

    facilityId:
      homeFacilityId,

    publicId:
      'USR-TEST-1',

    username:
      'multi.facility',

    normalizedUsername:
      'multi.facility',

    displayName:
      'Multi Facility User',

    passwordHash:
      'hash',

    status:
      'ACTIVE',

    failedLoginCount:
      0,

    passwordChangedAt:
      new Date(),

    tokenVersion:
      0,

    permissionVersion:
      0,

    version:
      0,

    schemaVersion:
      1,

    createdAt:
      new Date(),

    updatedAt:
      new Date(),
  };

  const assignment =
    options.assignmentScope ===
      'NONE'
      ? []
      : [
          {
            userId,
            roleId,

            facilityId:
              options.assignmentScope ===
              'GLOBAL'
                ? null
                : selectedFacilityId,

            isActive:
              true,

            expiresAt:
              null,
          },
        ];

  const userFindOne =
    vi.fn()
      .mockResolvedValue(
        storedUser,
      );

  const assignmentToArray =
    vi.fn()
      .mockResolvedValue(
        assignment,
      );

  const roleFindOne =
    vi.fn()
      .mockResolvedValue(
        options.assignmentScope ===
          'NONE'
          ? null
          : {
              _id:
                roleId,

              facilityId:
                options.assignmentScope ===
                'GLOBAL'
                  ? null
                  : selectedFacilityId,

              scope:
                options.assignmentScope,

              isActive:
                true,
            },
      );

  const database = {
    collection(
      name: string,
    ) {
      if (
        name ===
        'users'
      ) {
        return {
          findOne:
            userFindOne,
        };
      }

      if (
        name ===
        'userRoles'
      ) {
        return {
          find:
            vi.fn(
              () => ({
                project:
                  vi.fn(
                    () => ({
                      toArray:
                        assignmentToArray,
                    }),
                  ),
              }),
            ),
        };
      }

      if (
        name ===
        'roles'
      ) {
        return {
          findOne:
            roleFindOne,
        };
      }

      throw new Error(
        `Unexpected collection ${name}`,
      );
    },
  } as unknown as Db;

  return {
    repository:
      new MongoAuthRepository(
        database,
      ),

    userId,
    homeFacilityId,
    selectedFacilityId,
    userFindOne,
    roleFindOne,
  };
}

describe(
  'MongoAuthRepository facility authorization',
  () => {
    it(
      'authenticates through an active facility-scoped assignment rather than the home facility',
      async () => {
        const fixture =
          createFixture({
            assignmentScope:
              'FACILITY',
          });

        const user =
          await fixture.repository
            .findUserForLogin(
              fixture.selectedFacilityId
                .toHexString(),

              'multi.facility',
            );

        expect(
          user?.facilityId
            .toHexString(),
        ).toBe(
          fixture.selectedFacilityId
            .toHexString(),
        );

        expect(
          user?.facilityId
            .toHexString(),
        ).not.toBe(
          fixture.homeFacilityId
            .toHexString(),
        );

        expect(
          fixture.userFindOne,
        ).toHaveBeenCalledWith({
          $or: [
            {
              normalizedUsername:
                'multi.facility',
            },
            {
              normalizedEmail:
                'multi.facility',
            },
          ],
        });
      },
    );

    it(
      'permits a global role assignment in the selected facility context',
      async () => {
        const fixture =
          createFixture({
            assignmentScope:
              'GLOBAL',
          });

        const user =
          await fixture.repository
            .findUserById(
              fixture.selectedFacilityId
                .toHexString(),

              fixture.userId
                .toHexString(),
            );

        expect(
          user?.facilityId
            .toHexString(),
        ).toBe(
          fixture.selectedFacilityId
            .toHexString(),
        );

        expect(
          fixture.roleFindOne,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            isActive:
              true,
          }),
        );
      },
    );

    it(
      'denies a selected facility when no active role assignment grants access',
      async () => {
        const fixture =
          createFixture({
            assignmentScope:
              'NONE',
          });

        await expect(
          fixture.repository
            .findUserForLogin(
              fixture.selectedFacilityId
                .toHexString(),

              'multi.facility',
            ),
        ).resolves.toBeNull();
      },
    );
  },
);