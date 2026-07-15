import type {
  Db,
} from '@hospital-mis/database';

import {
  createObjectId,
  toObjectId,
} from '@hospital-mis/database';

import type {
  AuditSnapshot,
  CreateAuditEventInput,
  CreateSecurityEventInput,
} from './audit.types.js';

export interface AuditRepository {
  insertAuditEvent(
    input:
      CreateAuditEventInput & {
        eventId: string;
        beforeSnapshot?:
          AuditSnapshot;
        afterSnapshot?:
          AuditSnapshot;
        metadata?:
          AuditSnapshot;
      },
  ): Promise<void>;

  insertSecurityEvent(
    input:
      CreateSecurityEventInput & {
        eventId: string;
        details?:
          AuditSnapshot;
      },
  ): Promise<void>;
}

export class MongoAuditRepository
implements AuditRepository {
  constructor(
    private readonly database: Db,
  ) {}

  async insertAuditEvent(
    input:
      CreateAuditEventInput & {
        eventId: string;
        beforeSnapshot?:
          AuditSnapshot;
        afterSnapshot?:
          AuditSnapshot;
        metadata?:
          AuditSnapshot;
      },
  ): Promise<void> {
    const now =
      input.occurredAt ??
      new Date();

    await this.database
      .collection('auditLogs')
      .insertOne({
        _id:
          createObjectId(),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        eventId:
          input.eventId,

        ...(input.actorId === undefined
          ? {}
          : {
              actorId:
                toObjectId(
                  input.actorId,
                  'actorId',
                ),
            }),

        actorRoleIds:
          (
            input.actorRoleIds ??
            []
          ).map((roleId) =>
            toObjectId(
              roleId,
              'actorRoleIds',
            ),
          ),

        actorRoleCodes: [
          ...(
            input.actorRoleCodes ??
            []
          ),
        ],

        action:
          input.action,

        module:
          input.module,

        entityType:
          input.entityType,

        entityId:
          input.entityId,

        ...(input.reason === undefined
          ? {}
          : {
              reason:
                input.reason,
            }),

        ...(input.beforeSnapshot ===
        undefined
          ? {}
          : {
              beforeSnapshot:
                input.beforeSnapshot,
            }),

        ...(input.afterSnapshot ===
        undefined
          ? {}
          : {
              afterSnapshot:
                input.afterSnapshot,
            }),

        ...(input.metadata === undefined
          ? {}
          : {
              metadata:
                input.metadata,
            }),

        outcome:
          input.outcome,

        sensitivity:
          input.sensitivity,

        correlationId:
          input.correlationId,

        ...(input.transactionId ===
        undefined
          ? {}
          : {
              transactionId:
                input.transactionId,
            }),

        requestSource:
          input.requestSource,

        ...(input.requestMethod ===
        undefined
          ? {}
          : {
              requestMethod:
                input.requestMethod,
            }),

        ...(input.requestPath ===
        undefined
          ? {}
          : {
              requestPath:
                input.requestPath,
            }),

        ...(input.responseStatusCode ===
        undefined
          ? {}
          : {
              responseStatusCode:
                input.responseStatusCode,
            }),

        ...(input.ipAddress === undefined
          ? {}
          : {
              ipAddress:
                input.ipAddress,
            }),

        ...(input.userAgent === undefined
          ? {}
          : {
              userAgent:
                input.userAgent,
            }),

        occurredAt:
          now,

        schemaVersion:
          1,

        version:
          0,

        createdAt:
          now,

        updatedAt:
          now,
      });
  }

  async insertSecurityEvent(
    input:
      CreateSecurityEventInput & {
        eventId: string;
        details?:
          AuditSnapshot;
      },
  ): Promise<void> {
    const now =
      input.occurredAt ??
      new Date();

    await this.database
      .collection('securityEvents')
      .insertOne({
        _id:
          createObjectId(),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        eventId:
          input.eventId,

        eventType:
          input.eventType,

        severity:
          input.severity,

        outcome:
          input.outcome,

        ...(input.actorId === undefined
          ? {}
          : {
              actorId:
                toObjectId(
                  input.actorId,
                  'actorId',
                ),
            }),

        ...(input.sessionId === undefined
          ? {}
          : {
              sessionId:
                input.sessionId,
            }),

        ...(input.entityType ===
        undefined
          ? {}
          : {
              entityType:
                input.entityType,
            }),

        ...(input.entityId === undefined
          ? {}
          : {
              entityId:
                input.entityId,
            }),

        correlationId:
          input.correlationId,

        requestSource:
          input.requestSource,

        ...(input.ipAddress === undefined
          ? {}
          : {
              ipAddress:
                input.ipAddress,
            }),

        ...(input.userAgent === undefined
          ? {}
          : {
              userAgent:
                input.userAgent,
            }),

        ...(input.details === undefined
          ? {}
          : {
              details:
                input.details,
            }),

        occurredAt:
          now,

        schemaVersion:
          1,

        version:
          0,

        createdAt:
          now,

        updatedAt:
          now,
      });
  }
}