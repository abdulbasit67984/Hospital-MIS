import {
  randomUUID,
} from 'node:crypto';

import {
  getRequestContext,
} from '@hospital-mis/shared';

import {
  sanitizeAuditSnapshot,
} from './audit.sanitizer.js';

import type {
  AuditRepository,
} from './audit.repository.js';

import type {
  CreateAuditEventInput,
  CreateSecurityEventInput,
} from './audit.types.js';

export class AuditService {
  constructor(
    private readonly repository:
      AuditRepository,
  ) {}

  async record(
    input:
      CreateAuditEventInput,
  ): Promise<string> {
    const eventId =
      randomUUID();

    await this.repository
      .insertAuditEvent({
        ...input,
        eventId,

        ...(input.beforeSnapshot ===
        undefined
          ? {}
          : {
              beforeSnapshot:
                sanitizeAuditSnapshot(
                  input.beforeSnapshot,
                ),
            }),

        ...(input.afterSnapshot ===
        undefined
          ? {}
          : {
              afterSnapshot:
                sanitizeAuditSnapshot(
                  input.afterSnapshot,
                ),
            }),

        ...(input.metadata === undefined
          ? {}
          : {
              metadata:
                sanitizeAuditSnapshot(
                  input.metadata,
                ),
            }),
      });

    return eventId;
  }

  async recordFromContext(
    input:
      Omit<
        CreateAuditEventInput,
        | 'facilityId'
        | 'actorId'
        | 'correlationId'
      > & {
        facilityId?: string;
        actorId?: string;
        correlationId?: string;
      },
  ): Promise<string> {
    const context =
      getRequestContext();

    const facilityId =
      input.facilityId ??
      context?.facilityId;

    const correlationId =
      input.correlationId ??
      context?.correlationId;

    if (
      facilityId === undefined
    ) {
      throw new Error(
        'Audit facility context is required',
      );
    }

    if (
      correlationId === undefined
    ) {
      throw new Error(
        'Audit correlation context is required',
      );
    }

    return this.record({
      ...input,

      facilityId,

      correlationId,

      actorId:
        input.actorId ??
        context?.actorUserId,
    });
  }

  async recordSecurityEvent(
    input:
      CreateSecurityEventInput,
  ): Promise<string> {
    const eventId =
      randomUUID();

    await this.repository
      .insertSecurityEvent({
        ...input,
        eventId,

        ...(input.details === undefined
          ? {}
          : {
              details:
                sanitizeAuditSnapshot(
                  input.details,
                ),
            }),
      });

    return eventId;
  }

  async recordSecurityEventFromContext(
    input:
      Omit<
        CreateSecurityEventInput,
        | 'facilityId'
        | 'actorId'
        | 'sessionId'
        | 'correlationId'
      > & {
        facilityId?: string;
        actorId?: string;
        sessionId?: string;
        correlationId?: string;
      },
  ): Promise<string> {
    const context =
      getRequestContext();

    const facilityId =
      input.facilityId ??
      context?.facilityId;

    const correlationId =
      input.correlationId ??
      context?.correlationId;

    if (
      facilityId === undefined ||
      correlationId === undefined
    ) {
      throw new Error(
        'Security-event request context is incomplete',
      );
    }

    return this.recordSecurityEvent({
      ...input,

      facilityId,

      correlationId,

      actorId:
        input.actorId ??
        context?.actorUserId,

      sessionId:
        input.sessionId ??
        context?.sessionId,
    });
  }
}