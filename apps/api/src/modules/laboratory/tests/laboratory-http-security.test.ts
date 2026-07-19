import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  laboratoryActorFromRequest,
  parseLaboratoryInput,
  requireIdempotencyKey,
} from '../laboratory.http.js';

import {
  createLaboratoryOrderHttpSchema,
  enterLaboratoryResultHttpSchema,
} from '../laboratory.http.validation.js';

describe(
  'Laboratory HTTP security boundaries',
  () => {
    it(
      'requires a non-trivial idempotency key for every mutation',
      () => {
        expect(() =>
          requireIdempotencyKey({
            headers: {},
          } as never),
        ).toThrow(
          'A valid Idempotency-Key header is required',
        );

        expect(() =>
          requireIdempotencyKey({
            headers: {
              'idempotency-key': 'short',
            },
          } as never),
        ).toThrow(
          'A valid Idempotency-Key header is required',
        );

        expect(
          requireIdempotencyKey({
            headers: {
              'idempotency-key':
                'laboratory-order-00001',
            },
          } as never),
        ).toBe(
          'laboratory-order-00001',
        );
      },
    );

    it(
      'builds facility-scoped actor context only from authenticated request identity',
      () => {
        const actor =
          laboratoryActorFromRequest({
            id: 'correlation-1',
            ip: '127.0.0.1',
            headers: {
              'user-agent': 'vitest',
            },
            user: {
              userId:
                '64b000000000000000000001',
              facilityId:
                '64b000000000000000000002',
              roleKeys: [
                'LABORATORY_STAFF',
              ],
              permissionKeys: [
                'laboratory.orders.read',
              ],
            },
          } as never);

        expect(actor).toEqual({
          userId:
            '64b000000000000000000001',
          facilityId:
            '64b000000000000000000002',
          roleKeys: [
            'LABORATORY_STAFF',
          ],
          permissionKeys: [
            'laboratory.orders.read',
          ],
          correlationId:
            'correlation-1',
          ipAddress:
            '127.0.0.1',
          userAgent:
            'vitest',
        });
      },
    );

    it(
      'rejects duplicate or malformed order identifiers before reaching workflows',
      () => {
        expect(() =>
          parseLaboratoryInput(
            createLaboratoryOrderHttpSchema,
            {
              encounterId:
                'not-an-object-id',
              priority:
                'ROUTINE',
              clinicalIndication:
                'Investigation',
              testIds: [],
            },
          ),
        ).toThrow();
      },
    );

    it(
      'validates result values by their declared discriminated value type',
      () => {
        expect(() =>
          parseLaboratoryInput(
            enterLaboratoryResultHttpSchema,
            {
              labOrderItemId:
                '64b000000000000000000001',
              technicianStaffId:
                '64b000000000000000000002',
              components: [
                {
                  componentCode:
                    'HGB',
                  valueType:
                    'NUMERIC',
                  textValue:
                    'Invalid numeric value',
                },
              ],
            },
          ),
        ).toThrow();

        const parsed =
          parseLaboratoryInput(
            enterLaboratoryResultHttpSchema,
            {
              labOrderItemId:
                '64b000000000000000000001',
              technicianStaffId:
                '64b000000000000000000002',
              components: [
                {
                  componentCode:
                    'HGB',
                  valueType:
                    'NUMERIC',
                  numericValue:
                    '12.7',
                  unitCode:
                    'G_DL',
                  unitName:
                    'g/dL',
                },
              ],
            },
          );

        expect(
          parsed.components,
        ).toHaveLength(1);
      },
    );
  },
);