import pino, {
  type Logger,
  type LoggerOptions,
} from 'pino';
import { getRequestContext } from './request-context.js';

const redactedPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'request.headers.authorization',
  'request.headers.cookie',

  'password',
  '*.password',

  'token',
  '*.token',

  'accessToken',
  '*.accessToken',

  'refreshToken',
  '*.refreshToken',

  'cnic',
  '*.cnic',

  'normalizedCnic',
  '*.normalizedCnic',

  'bFormNumber',
  '*.bFormNumber',

  'clinicalNotes',
  '*.clinicalNotes',

  'diagnosis',
  '*.diagnosis',
] as const;

export function createLogger(
  name: string,
  level: LoggerOptions['level'] = 'info',
): Logger {
  return pino({
    name,
    level,

    redact: {
      paths: [...redactedPaths],
      censor: '[REDACTED]',
    },

    base: {
      service: name,
    },

    mixin() {
      const context = getRequestContext();

      if (context === undefined) {
        return {};
      }

      return {
        correlationId: context.correlationId,
        ...(context.actorUserId === undefined
          ? {}
          : {
              actorUserId: context.actorUserId,
            }),
        ...(context.facilityId === undefined
          ? {}
          : {
              facilityId: context.facilityId,
            }),
      };
    },

    timestamp: pino.stdTimeFunctions.isoTime,
  });
}