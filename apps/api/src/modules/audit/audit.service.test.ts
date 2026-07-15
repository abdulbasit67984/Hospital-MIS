import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  runWithRequestContext,
} from '@hospital-mis/shared';

import {
  sanitizeAuditSnapshot,
} from './audit.sanitizer.js';

import type {
  AuditRepository,
} from './audit.repository.js';

import {
  AuditService,
} from './audit.service.js';

function repositoryMock():
  AuditRepository {
  return {
    insertAuditEvent:
      vi.fn(),

    insertSecurityEvent:
      vi.fn(),
  };
}

describe(
  'sanitizeAuditSnapshot',
  () => {
    it(
      'redacts secrets and sensitive identifiers',
      () => {
        const sanitized =
          sanitizeAuditSnapshot({
            username:
              'admin',

            password:
              'Secret password',

            normalizedCnic:
              '1234567890123',

            nested: {
              refreshToken:
                'private token',

              safe:
                'visible',
            },
          });

        expect(
          sanitized,
        ).toEqual({
          username:
            'admin',

          password:
            '[REDACTED]',

          normalizedCnic:
            '[REDACTED]',

          nested: {
            refreshToken:
              '[REDACTED]',

            safe:
              'visible',
          },
        });
      },
    );

    it(
      'handles circular values and truncates large arrays',
      () => {
        const circular:
          Record<string, unknown> = {
          values:
            Array.from(
              {
                length: 55,
              },

              (_, index) =>
                index,
            ),
        };

        circular['self'] =
          circular;

        const sanitized =
          sanitizeAuditSnapshot(
            circular,
          ) as Record<
            string,
            unknown
          >;

        expect(
          sanitized['self'],
        ).toBe(
          '[CIRCULAR]',
        );

        expect(
          (
            sanitized[
              'values'
            ] as unknown[]
          ).at(-1),
        ).toBe(
          '[5 MORE ITEMS]',
        );
      },
    );

    it(
      'represents binary data without storing it',
      () => {
        const sanitized =
          sanitizeAuditSnapshot({
            payload:
              Buffer.from(
                'private binary data',
              ),
          });

        expect(
          sanitized,
        ).toEqual({
          payload:
            '[BINARY:19 bytes]',
        });
      },
    );
  },
);

describe(
  'AuditService',
  () => {
    it(
      'sanitizes snapshots before repository insertion',
      async () => {
        const repository =
          repositoryMock();

        const service =
          new AuditService(
            repository,
          );

        const eventId =
          await service.record({
            facilityId:
              '507f191e810c19729de860ea',

            actorId:
              '507f1f77bcf86cd799439011',

            action:
              'patient.updated',

            module:
              'patients',

            entityType:
              'patient',

            entityId:
              'PAT-000001',

            beforeSnapshot: {
              phone:
                '03001234567',

              password:
                'must not appear',
            },

            afterSnapshot: {
              phone:
                '03007654321',

              accessToken:
                'must not appear',
            },

            outcome:
              'SUCCESS',

            sensitivity:
              'SENSITIVE',

            correlationId:
              '5de81ce9-845f-42e4-907f-c66503bdfd4a',

            requestSource:
              'API',
          });

        expect(
          eventId,
        ).toMatch(
          /^[0-9a-f-]{36}$/i,
        );

        expect(
          repository.insertAuditEvent,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            eventId,

            beforeSnapshot: {
              phone:
                '03001234567',

              password:
                '[REDACTED]',
            },

            afterSnapshot: {
              phone:
                '03007654321',

              accessToken:
                '[REDACTED]',
            },
          }),
        );
      },
    );

    it(
      'uses the current request context',
      async () => {
        const repository =
          repositoryMock();

        const service =
          new AuditService(
            repository,
          );

        await runWithRequestContext(
          {
            correlationId:
              '5de81ce9-845f-42e4-907f-c66503bdfd4a',

            actorUserId:
              '507f1f77bcf86cd799439011',

            facilityId:
              '507f191e810c19729de860ea',

            sessionId:
              '65bf76b3-d2e4-49ab-b852-2607196aba8e',
          },

          async () => {
            await service
              .recordFromContext({
                action:
                  'report.exported',

                module:
                  'reports',

                entityType:
                  'report',

                entityId:
                  'daily-cash-flow',

                outcome:
                  'SUCCESS',

                sensitivity:
                  'HIGHLY_SENSITIVE',

                requestSource:
                  'API',
              });
          },
        );

        expect(
          repository.insertAuditEvent,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            facilityId:
              '507f191e810c19729de860ea',

            actorId:
              '507f1f77bcf86cd799439011',

            correlationId:
              '5de81ce9-845f-42e4-907f-c66503bdfd4a',
          }),
        );
      },
    );

    it(
      'records sanitized security-event details',
      async () => {
        const repository =
          repositoryMock();

        const service =
          new AuditService(
            repository,
          );

        await service
          .recordSecurityEvent({
            facilityId:
              '507f191e810c19729de860ea',

            eventType:
              'authentication.refresh_token_reuse',

            severity:
              'CRITICAL',

            outcome:
              'DENIED',

            correlationId:
              '5de81ce9-845f-42e4-907f-c66503bdfd4a',

            requestSource:
              'API',

            details: {
              refreshToken:
                'must not be stored',

              tokenId:
                'token-public-id',
            },
          });

        expect(
          repository.insertSecurityEvent,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            details: {
              refreshToken:
                '[REDACTED]',

              tokenId:
                'token-public-id',
            },
          }),
        );
      },
    );
  },
);