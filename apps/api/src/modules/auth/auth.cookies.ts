import type {
  Request,
  Response,
} from 'express';

export const refreshCookieName =
  'hmis_refresh_token';

function parseCookieHeader(
  header: string | undefined,
): Record<string, string> {
  if (
    header === undefined
  ) {
    return {};
  }

  return Object.fromEntries(
    header
      .split(';')
      .map(
        (entry) =>
          entry.trim(),
      )
      .filter(Boolean)
      .map(
        (entry) => {
          const separator =
            entry.indexOf('=');

          if (
            separator < 0
          ) {
            return [
              entry,
              '',
            ];
          }

          const key =
            entry.slice(
              0,
              separator,
            );

          const value =
            entry.slice(
              separator + 1,
            );

          try {
            return [
              key,
              decodeURIComponent(
                value,
              ),
            ];
          } catch {
            return [
              key,
              value,
            ];
          }
        },
      ),
  );
}

export function readRefreshCookie(
  request: Request,
): string | undefined {
  return parseCookieHeader(
    request.header(
      'cookie',
    ),
  )[refreshCookieName];
}

export function setRefreshCookie(
  response: Response,
  input: {
    token: string;
    expiresAt: Date;
    production: boolean;
  },
): void {
  const maxAgeSeconds =
    Math.max(
      0,

      Math.floor(
        (
          input.expiresAt.getTime() -
          Date.now()
        ) /
          1000,
      ),
    );

  const parts = [
    `${refreshCookieName}=${encodeURIComponent(input.token)}`,
    'HttpOnly',
    'Path=/api/v1/auth',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (
    input.production
  ) {
    parts.push(
      'Secure',
    );
  }

  response.setHeader(
    'set-cookie',
    parts.join('; '),
  );
}

export function clearRefreshCookie(
  response: Response,
  production: boolean,
): void {
  const parts = [
    `${refreshCookieName}=`,
    'HttpOnly',
    'Path=/api/v1/auth',
    'SameSite=Strict',
    'Max-Age=0',
  ];

  if (
    production
  ) {
    parts.push(
      'Secure',
    );
  }

  response.setHeader(
    'set-cookie',
    parts.join('; '),
  );
}