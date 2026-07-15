export type AuditSensitivity =
  | 'STANDARD'
  | 'SENSITIVE'
  | 'HIGHLY_SENSITIVE';

export type AuditOutcome =
  | 'ATTEMPTED'
  | 'SUCCESS'
  | 'FAILURE'
  | 'DENIED';

export type AuditRequestSource =
  | 'API'
  | 'WORKER'
  | 'SCRIPT'
  | 'SYSTEM';

export type SecurityEventSeverity =
  | 'INFO'
  | 'WARNING'
  | 'HIGH'
  | 'CRITICAL';

export type AuditSnapshot =
  | null
  | boolean
  | number
  | string
  | readonly AuditSnapshot[]
  | Readonly<{
      [key: string]:
        AuditSnapshot;
    }>;

export type CreateAuditEventInput = {
  facilityId: string;
  actorId?: string;

  actorRoleIds?: readonly string[];
  actorRoleCodes?: readonly string[];

  action: string;
  module: string;
  entityType: string;
  entityId: string;

  reason?: string;

  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
  metadata?: unknown;

  outcome: AuditOutcome;
  sensitivity: AuditSensitivity;

  correlationId: string;
  transactionId?: string;

  requestSource:
    AuditRequestSource;

  requestMethod?: string;
  requestPath?: string;
  responseStatusCode?: number;

  ipAddress?: string;
  userAgent?: string;

  occurredAt?: Date;
};

export type CreateSecurityEventInput = {
  facilityId: string;
  actorId?: string;
  sessionId?: string;

  eventType: string;
  severity:
    SecurityEventSeverity;
  outcome: AuditOutcome;

  entityType?: string;
  entityId?: string;

  correlationId: string;

  requestSource:
    AuditRequestSource;

  ipAddress?: string;
  userAgent?: string;

  details?: unknown;
  occurredAt?: Date;
};