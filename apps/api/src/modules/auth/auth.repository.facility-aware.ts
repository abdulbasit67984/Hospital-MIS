import type {
  AuthRepository,
} from './auth.repository.js';

export interface AuthenticationFacilityAccessPort {
  assertAuthenticationAllowed(
    facilityId: string,
  ): Promise<unknown>;
}

export function withFacilityStatusEnforcement(
  repository:
    AuthRepository,

  facilityAccess:
    AuthenticationFacilityAccessPort,
): AuthRepository {
  return new Proxy(
    repository,
    {
      get(
        target,
        property,
        receiver,
      ) {
        if (
          property ===
          'findUserForLogin'
        ) {
          return async (
            facilityId:
              string,
            normalizedLogin:
              string,
          ) => {
            await facilityAccess
              .assertAuthenticationAllowed(
                facilityId,
              );

            return target.findUserForLogin(
              facilityId,
              normalizedLogin,
            );
          };
        }

        if (
          property ===
          'findUserById'
        ) {
          return async (
            facilityId:
              string,
            userId:
              string,
          ) => {
            /*
             * This path is used by refresh-token rotation and access-token
             * authentication, so deactivation invalidates both immediately.
             */
            await facilityAccess
              .assertAuthenticationAllowed(
                facilityId,
              );

            return target.findUserById(
              facilityId,
              userId,
            );
          };
        }

        const value =
          Reflect.get(
            target,
            property,
            receiver,
          );

        return typeof value ===
          'function'
          ? value.bind(target)
          : value;
      },
    },
  ) as AuthRepository;
}