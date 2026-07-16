import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  USER_STATUS,
} from './identity.constants.js';

import {
  changeUserPasswordBodySchema,
  identityMutationHeadersSchema,
  permissionListQuerySchema,
  revokeUserSessionsBodySchema,
  userDetailsQuerySchema,
  userListQuerySchema,
} from './identity.validation.js';

describe(
  'identity request validation',
  () => {
    it(
      'parses false query-string values as false',
      () => {
        const result =
          permissionListQuerySchema
            .parse({
              activeOnly:
                'false',
            });

        expect(
          result.activeOnly,
        ).toBe(
          false,
        );
      },
    );

    it(
      'applies safe user-detail defaults',
      () => {
        expect(
          userDetailsQuerySchema
            .parse({}),
        ).toEqual({
          activeOnly:
            true,

          includeExpired:
            false,
        });
      },
    );

    it(
      'accepts disabled users in administrative filters',
      () => {
        const result =
          userListQuerySchema
            .parse({
              status:
                USER_STATUS.DISABLED,
            });

        expect(
          result.status,
        ).toBe(
          USER_STATUS.DISABLED,
        );
      },
    );

    it(
      'requires a valid idempotency header',
      () => {
        expect(
          identityMutationHeadersSchema
            .safeParse({
              'idempotency-key':
                'role-create-0001',
            }).success,
        ).toBe(
          true,
        );

        expect(
          identityMutationHeadersSchema
            .safeParse({}).success,
        ).toBe(
          false,
        );

        expect(
          identityMutationHeadersSchema
            .safeParse({
              'idempotency-key':
                'not valid spaces',
            }).success,
        ).toBe(
          false,
        );
      },
    );

    it(
      'defaults password reset to revoke sessions',
      () => {
        const result =
          changeUserPasswordBodySchema
            .parse({
              password:
                'StrongPassword!123',

              reason:
                'Approved administrative reset',
            });

        expect(
          result,
        ).toMatchObject({
          mustChangePassword:
            true,

          revokeSessions:
            true,
        });
      },
    );

    it(
      'validates an optional excluded session identifier',
      () => {
        const result =
          revokeUserSessionsBodySchema
            .parse({
              reason:
                'Security review',

              excludeSessionId:
                '25da21e9-d661-41dc-b2e8-734f30f3f5a8',
            });

        expect(
          result.excludeSessionId,
        ).toBe(
          '25da21e9-d661-41dc-b2e8-734f30f3f5a8',
        );
      },
    );
  },
);