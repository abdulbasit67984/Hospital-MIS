import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

import * as argon2 from 'argon2';

import {
  SignJWT,
  jwtVerify,
} from 'jose';

import {
  BadRequestError,
  UnauthorizedError,
} from './errors.js';

export type PasswordSecurityConfig = {
  passwordPepper: string;
  passwordMemoryKiB: number;
  passwordTimeCost: number;
  passwordParallelism: number;
  passwordHashLength: number;
  passwordMinLength: number;
  passwordMaxLength: number;
};

export type AccessTokenSecurityConfig = {
  accessTokenSecret: string;
  accessTokenKeyId: string;
  issuer: string;
  audience: string;
  accessTokenTtlSeconds: number;
};

export type RefreshTokenSecurityConfig = {
  refreshTokenHashSecret: string;
  refreshTokenTtlDays: number;
};

export type IssueAccessTokenInput = {
  userId: string;
  sessionId: string;
  facilityId: string;
  tokenVersion: number;
  now?: Date;
};

export type IssuedAccessToken = {
  token: string;
  tokenId: string;
  issuedAt: Date;
  expiresAt: Date;
};

export type VerifiedAccessToken = {
  userId: string;
  sessionId: string;
  facilityId: string;
  tokenId: string;
  tokenVersion: number;
  issuedAt: Date;
  expiresAt: Date;
};

export type GeneratedRefreshToken = {
  token: string;
  tokenId: string;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
};

export type ParsedRefreshToken = {
  tokenId: string;
  secret: string;
};

const refreshTokenPattern =
  /^rt_([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/i;

function passwordLength(
  password: string,
): number {
  return Array.from(
    password,
  ).length;
}

function preparePassword(
  password: string,
  pepper: string,
): string {
  return createHmac(
    'sha256',
    pepper,
  )
    .update(
      password,
      'utf8',
    )
    .digest(
      'base64url',
    );
}

function signingKey(
  secret: string,
): Uint8Array {
  return new TextEncoder().encode(
    secret,
  );
}

function secondsSinceEpoch(
  date: Date,
): number {
  return Math.floor(
    date.getTime() /
      1000,
  );
}

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

export function assertPasswordPolicy(
  password: string,
  config:
    PasswordSecurityConfig,
): void {
  const length =
    passwordLength(
      password,
    );

  if (
    length <
    config.passwordMinLength
  ) {
    throw new BadRequestError(
      `Password must contain at least ${config.passwordMinLength} characters`,
      [
        {
          code:
            'password_too_short',

          message:
            `Password must contain at least ${config.passwordMinLength} characters`,

          path:
            'body.password',
        },
      ],
    );
  }

  if (
    length >
    config.passwordMaxLength
  ) {
    throw new BadRequestError(
      `Password cannot exceed ${config.passwordMaxLength} characters`,
      [
        {
          code:
            'password_too_long',

          message:
            `Password cannot exceed ${config.passwordMaxLength} characters`,

          path:
            'body.password',
        },
      ],
    );
  }
}

export async function hashPassword(
  password: string,
  config:
    PasswordSecurityConfig,
): Promise<string> {
  assertPasswordPolicy(
    password,
    config,
  );

  const prepared =
    preparePassword(
      password,
      config.passwordPepper,
    );

  return argon2.hash(
    prepared,
    {
      type:
        argon2.argon2id,

      memoryCost:
        config.passwordMemoryKiB,

      timeCost:
        config.passwordTimeCost,

      parallelism:
        config.passwordParallelism,

      hashLength:
        config.passwordHashLength,
    },
  );
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  config:
    Pick<
      PasswordSecurityConfig,
      'passwordPepper'
    >,
): Promise<boolean> {
  try {
    const prepared =
      preparePassword(
        password,
        config.passwordPepper,
      );

    return await argon2.verify(
      storedHash,
      prepared,
    );
  } catch {
    return false;
  }
}

export async function issueAccessToken(
  input:
    IssueAccessTokenInput,
  config:
    AccessTokenSecurityConfig,
): Promise<IssuedAccessToken> {
  const issuedAt =
    input.now ??
    new Date();

  const issuedAtSeconds =
    secondsSinceEpoch(
      issuedAt,
    );

  const expiresAtSeconds =
    issuedAtSeconds +
    config.accessTokenTtlSeconds;

  const expiresAt =
    new Date(
      expiresAtSeconds *
        1000,
    );

  const tokenId =
    randomUUID();

  const token =
    await new SignJWT({
      sid:
        input.sessionId,

      fid:
        input.facilityId,

      ver:
        input.tokenVersion,
    })
      .setProtectedHeader({
        alg:
          'HS256',

        typ:
          'JWT',

        kid:
          config.accessTokenKeyId,
      })
      .setSubject(
        input.userId,
      )
      .setIssuer(
        config.issuer,
      )
      .setAudience(
        config.audience,
      )
      .setJti(
        tokenId,
      )
      .setIssuedAt(
        issuedAtSeconds,
      )
      .setExpirationTime(
        expiresAtSeconds,
      )
      .sign(
        signingKey(
          config.accessTokenSecret,
        ),
      );

  return {
    token,
    tokenId,
    issuedAt,
    expiresAt,
  };
}

export async function verifyAccessToken(
  token: string,
  config:
    AccessTokenSecurityConfig,
): Promise<VerifiedAccessToken> {
  try {
    const result =
      await jwtVerify(
        token,

        signingKey(
          config.accessTokenSecret,
        ),

        {
          algorithms: [
            'HS256',
          ],

          issuer:
            config.issuer,

          audience:
            config.audience,
        },
      );

    if (
      result.protectedHeader
        .kid !==
      config.accessTokenKeyId
    ) {
      throw new Error(
        'Unexpected signing-key identifier',
      );
    }

    const {
      payload,
    } = result;

    if (
      typeof payload.sub !==
        'string' ||
      typeof payload.jti !==
        'string' ||
      typeof payload.sid !==
        'string' ||
      typeof payload.fid !==
        'string' ||
      typeof payload.ver !==
        'number' ||
      !Number.isSafeInteger(
        payload.ver,
      ) ||
      typeof payload.iat !==
        'number' ||
      typeof payload.exp !==
        'number'
    ) {
      throw new Error(
        'Required access-token claims are missing',
      );
    }

    return {
      userId:
        payload.sub,

      sessionId:
        payload.sid,

      facilityId:
        payload.fid,

      tokenId:
        payload.jti,

      tokenVersion:
        payload.ver,

      issuedAt:
        new Date(
          payload.iat *
            1000,
        ),

      expiresAt:
        new Date(
          payload.exp *
            1000,
        ),
    };
  } catch {
    throw new UnauthorizedError(
      'Access token is invalid or expired',
    );
  }
}

export function parseRefreshToken(
  token: string,
): ParsedRefreshToken {
  const match =
    refreshTokenPattern.exec(
      token,
    );

  if (
    match === null
  ) {
    throw new UnauthorizedError(
      'Refresh token is invalid',
    );
  }

  const tokenId =
    match[1];

  const secret =
    match[2];

  if (
    tokenId === undefined ||
    secret === undefined
  ) {
    throw new UnauthorizedError(
      'Refresh token is invalid',
    );
  }

  return {
    tokenId,
    secret,
  };
}

export function hashRefreshToken(
  token: string,
  hashSecret: string,
): string {
  return createHmac(
    'sha256',
    hashSecret,
  )
    .update(
      token,
      'utf8',
    )
    .digest(
      'hex',
    );
}

export function refreshTokenHashMatches(
  token: string,
  storedHash: string,
  hashSecret: string,
): boolean {
  if (
    !/^[a-f\d]{64}$/i.test(
      storedHash,
    )
  ) {
    return false;
  }

  const calculated =
    Buffer.from(
      hashRefreshToken(
        token,
        hashSecret,
      ),
      'hex',
    );

  const stored =
    Buffer.from(
      storedHash,
      'hex',
    );

  if (
    calculated.length !==
    stored.length
  ) {
    return false;
  }

  return timingSafeEqual(
    calculated,
    stored,
  );
}

export function generateRefreshToken(
  config:
    RefreshTokenSecurityConfig,
  now:
    Date =
      new Date(),
): GeneratedRefreshToken {
  const tokenId =
    randomUUID();

  const secret =
    randomBytes(
      32,
    ).toString(
      'base64url',
    );

  const token =
    `rt_${tokenId}.${secret}`;

  const expiresAt =
    addDays(
      now,
      config.refreshTokenTtlDays,
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

    expiresAt,
  };
}

export function calculateSessionPurgeAt(
  expiresAt: Date,
  retentionDays: number,
): Date {
  return addDays(
    expiresAt,
    retentionDays,
  );
}