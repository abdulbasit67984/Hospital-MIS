export type UserStatus =
  | 'ACTIVE'
  | 'LOCKED'
  | 'DISABLED';

export type SessionStatus =
  | 'ACTIVE'
  | 'REVOKED'
  | 'COMPROMISED'
  | 'EXPIRED';

export type RefreshTokenStatus =
  | 'ACTIVE'
  | 'ROTATED'
  | 'REVOKED'
  | 'REUSED'
  | 'EXPIRED';

export type AuthenticatedPrincipal = {
  userId: string;
  sessionId: string;
  facilityId: string;
  accessTokenId: string;
  tokenVersion: number;
  permissionVersion: number;
};

export type AuthenticatedUserSummary = {
  userId: string;
  publicId: string;
  facilityId: string;
  username: string;
  displayName: string;
  email?: string;
};

export type AuthenticationResult = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: AuthenticatedUserSummary;
};

export type SessionSummary = {
  sessionId: string;
  current: boolean;
  status: SessionStatus;
  userAgent?: string;
  lastSeenAt: string;
  createdAt: string;
  expiresAt: string;
};