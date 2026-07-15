import {
  createHmac,
  randomUUID,
} from 'node:crypto';

import {
  hashRefreshToken,
} from './security.js';

export type DeterministicRefreshTokenConfig = {
  refreshTokenHashSecret: string;
  refreshTokenTtlDays: number;
};

export type IssuedDeterministicRefreshToken = {
  token: string;
  tokenId: string;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
};

function addDays(
  date: Date,
  days: number,
): Date {
  return new Date(
    date.getTime() +
      days *
        24 *
        60 *
        60 *
        1000,
  );
}

function tokenSecret(
  tokenId: string,
  secret: string,
): string {
  return createHmac(
    'sha256',
    secret,
  )
    .update(
      `hospital-mis-refresh:${tokenId}`,
      'utf8',
    )
    .digest(
      'base64url',
    );
}

export function reconstructRefreshToken(
  tokenId: string,
  hashSecret: string,
): string {
  return [
    `rt_${tokenId}`,
    tokenSecret(
      tokenId,
      hashSecret,
    ),
  ].join('.');
}

export function issueDeterministicRefreshToken(
  config: DeterministicRefreshTokenConfig,
  now: Date = new Date(),
  tokenId: string = randomUUID(),
): IssuedDeterministicRefreshToken {
  const token =
    reconstructRefreshToken(
      tokenId,
      config.refreshTokenHashSecret,
    );

  return {
    token,
    tokenId,

    tokenHash:
      hashRefreshToken(
        token,
        config.refreshTokenHashSecret,
      ),

    issuedAt:
      now,

    expiresAt:
      addDays(
        now,
        config.refreshTokenTtlDays,
      ),
  };
}