import mongoose from 'mongoose';

import {
  baseSchema,
  objectId,
} from './common.js';

export const auditSensitivityLevels = [
  'STANDARD',
  'SENSITIVE',
  'HIGHLY_SENSITIVE',
] as const;

export const auditOutcomes = [
  'ATTEMPTED',
  'SUCCESS',
  'FAILURE',
  'DENIED',
] as const;

export const auditRequestSources = [
  'API',
  'WORKER',
  'SCRIPT',
  'SYSTEM',
] as const;

export const securityEventSeverities = [
  'INFO',
  'WARNING',
  'HIGH',
  'CRITICAL',
] as const;

const auditLogSchema = baseSchema(
  {
    eventId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
    },

    actorId: {
      type: objectId,
      immutable: true,
    },

    actorRoleIds: {
      type: [objectId],
      required: true,
      default: [],
      immutable: true,
    },

    actorRoleCodes: {
      type: [String],
      required: true,
      default: [],
      immutable: true,
    },

    action: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 200,
    },

    module: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 100,
    },

    entityType: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 100,
    },

    entityId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 200,
    },

    reason: {
      type: String,
      immutable: true,
      trim: true,
      maxlength: 1000,
    },

    beforeSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      immutable: true,
    },

    afterSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      immutable: true,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      immutable: true,
    },

    outcome: {
      type: String,
      required: true,
      immutable: true,
      enum: auditOutcomes,
    },

    sensitivity: {
      type: String,
      required: true,
      immutable: true,
      enum: auditSensitivityLevels,
    },

    correlationId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
    },

    transactionId: {
      type: String,
      immutable: true,
      trim: true,
    },

    requestSource: {
      type: String,
      required: true,
      immutable: true,
      enum: auditRequestSources,
    },

    requestMethod: {
      type: String,
      immutable: true,
      trim: true,
      maxlength: 20,
    },

    requestPath: {
      type: String,
      immutable: true,
      trim: true,
      maxlength: 500,
    },

    responseStatusCode: {
      type: Number,
      immutable: true,
      min: 100,
      max: 599,
    },

    ipAddress: {
      type: String,
      immutable: true,
      trim: true,
      maxlength: 64,
    },

    userAgent: {
      type: String,
      immutable: true,
      trim: true,
      maxlength: 1000,
    },

    occurredAt: {
      type: Date,
      required: true,
      immutable: true,
      default: Date.now,
    },
  },
  {
    collection: 'auditLogs',
  },
);

auditLogSchema.index(
  {
    eventId: 1,
  },
  {
    unique: true,
  },
);

auditLogSchema.index({
  facilityId: 1,
  occurredAt: -1,
});

auditLogSchema.index({
  facilityId: 1,
  actorId: 1,
  occurredAt: -1,
});

auditLogSchema.index({
  facilityId: 1,
  module: 1,
  action: 1,
  occurredAt: -1,
});

auditLogSchema.index({
  facilityId: 1,
  entityType: 1,
  entityId: 1,
  occurredAt: -1,
});

auditLogSchema.index({
  facilityId: 1,
  correlationId: 1,
});

auditLogSchema.index({
  facilityId: 1,
  transactionId: 1,
});

auditLogSchema.index({
  facilityId: 1,
  sensitivity: 1,
  occurredAt: -1,
});

const securityEventSchema = baseSchema(
  {
    eventId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
    },

    eventType: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 200,
    },

    severity: {
      type: String,
      required: true,
      immutable: true,
      enum: securityEventSeverities,
    },

    outcome: {
      type: String,
      required: true,
      immutable: true,
      enum: auditOutcomes,
    },

    actorId: {
      type: objectId,
      immutable: true,
    },

    sessionId: {
      type: String,
      immutable: true,
      trim: true,
    },

    entityType: {
      type: String,
      immutable: true,
      trim: true,
      maxlength: 100,
    },

    entityId: {
      type: String,
      immutable: true,
      trim: true,
      maxlength: 200,
    },

    correlationId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
    },

    requestSource: {
      type: String,
      required: true,
      immutable: true,
      enum: auditRequestSources,
    },

    ipAddress: {
      type: String,
      immutable: true,
      trim: true,
      maxlength: 64,
    },

    userAgent: {
      type: String,
      immutable: true,
      trim: true,
      maxlength: 1000,
    },

    details: {
      type: mongoose.Schema.Types.Mixed,
      immutable: true,
    },

    occurredAt: {
      type: Date,
      required: true,
      immutable: true,
      default: Date.now,
    },
  },
  {
    collection: 'securityEvents',
  },
);

securityEventSchema.index(
  {
    eventId: 1,
  },
  {
    unique: true,
  },
);

securityEventSchema.index({
  facilityId: 1,
  occurredAt: -1,
});

securityEventSchema.index({
  facilityId: 1,
  severity: 1,
  occurredAt: -1,
});

securityEventSchema.index({
  facilityId: 1,
  eventType: 1,
  occurredAt: -1,
});

securityEventSchema.index({
  facilityId: 1,
  actorId: 1,
  occurredAt: -1,
});

securityEventSchema.index({
  facilityId: 1,
  sessionId: 1,
  occurredAt: -1,
});

securityEventSchema.index({
  facilityId: 1,
  correlationId: 1,
});

export const auditSchemas = {
  auditLogs: auditLogSchema,
  securityEvents: securityEventSchema,
} as const;

export type AuditModelName =
  keyof typeof auditSchemas;

export function registerAuditModels(
  connection:
    mongoose.Connection =
      mongoose.connection,
) {
  return Object.fromEntries(
    Object.entries(auditSchemas).map(
      ([name, schema]) => [
        name,

        connection.models[name] ??
          connection.model(
            name,
            schema,
            name,
          ),
      ],
    ),
  );
}