import {
  Types,
} from 'mongoose';

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  FACILITY_TYPE,
} from '../facility.constants.js';

import {
  FacilityCodeConflictError,
} from '../facility.errors.js';

import type {
  FacilityMutationDependencies,
  FacilityTransactionManagerPort,
  FacilityTransactionRequest,
} from '../facility.ports.js';

import {
  FACILITY_COMPENSATION_TYPES,
  FACILITY_OUTBOX_EVENTS,
} from '../facility.transaction.constants.js';

import type {
  FacilityRecord,
} from '../facility.types.js';

import type {
  FacilityRepository,
} from '../repositories/facility.repository.js';

import {
  CreateFacilityWorkflow,
} from '../workflows/create-facility.workflow.js';

function facilityRecord():
  FacilityRecord {
  const now =
    new Date(
      '2026-07-17T10:00:00.000Z',
    );

  return {
    _id:
      new Types.ObjectId(
        '507f1f77bcf86cd799439011',
      ),

    code:
      'MAIN',

    name:
      'Main Hospital',

    legalName:
      'Main Hospital Limited',

    facilityType:
      FACILITY_TYPE.HOSPITAL,

    parentFacilityId:
      null,

    identifiers:
      [],

    timezone:
      'Asia/Karachi',

    currency:
      'PKR',

    locale:
      'en-PK',

    supportedLocales: [
      'en-PK',
    ],

    address: {
      line1:
        '1 Hospital Road',

      line2:
        null,

      city:
        'Lahore',

      district:
        'Lahore',

      province:
        'Punjab',

      postalCode:
        '54000',

      countryCode:
        'PK',
    },

    contact: {
      primaryPhone:
        '+924200000000',

      secondaryPhone:
        null,

      email:
        'contact@example.test',

      website:
        null,

      emergencyPhone:
        null,
    },

    status:
      'ACTIVE',

    allowsAuthentication:
      true,

    deactivatedAt:
      null,

    deactivatedBy:
      null,

    deactivationReason:
      null,

    schemaVersion:
      1,

    version:
      0,

    createdBy:
      new Types.ObjectId(
        '507f191e810c19729de860ea',
      ),

    updatedBy:
      new Types.ObjectId(
        '507f191e810c19729de860ea',
      ),

    createdAt:
      now,

    updatedAt:
      now,
  };
}

function dependencies() {
  const registerCompensation =
    vi.fn()
      .mockResolvedValue(
        undefined,
      );

  const checkpoint =
    vi.fn()
      .mockResolvedValue(
        undefined,
      );

  const execute =
    vi.fn(
      async (
        request:
          FacilityTransactionRequest<unknown>,
      ) =>
        request.execute({
          transactionId:
            'transaction-1',

          idempotencyKey:
            request.idempotencyKey,

          registerCompensation,

          checkpoint,
        }),
    );

  const auditAppend =
    vi.fn()
      .mockResolvedValue(
        undefined,
      );

  const outboxEnqueue =
    vi.fn()
      .mockResolvedValue(
        undefined,
      );

  const transactionManager = {
    execute,
  } as unknown as FacilityTransactionManagerPort;

  const result:
    FacilityMutationDependencies = {
    transactionManager,

    audit: {
      append:
        auditAppend,
    },

    outbox: {
      enqueue:
        outboxEnqueue,
    },

    clock: {
      now:
        () =>
          new Date(
            '2026-07-17T10:00:00.000Z',
          ),
    },
  };

  return {
    result,
    execute,
    registerCompensation,
    checkpoint,
    auditAppend,
    outboxEnqueue,
  };
}

const command = {
  input: {
    code:
      'main',

    name:
      'Main Hospital',

    legalName:
      'Main Hospital Limited',

    facilityType:
      FACILITY_TYPE.HOSPITAL,

    parentFacilityId:
      null,

    identifiers:
      [],

    timezone:
      'Asia/Karachi',

    currency:
      'pkr',

    locale:
      'en-pk',

    supportedLocales: [
      'en-pk',
    ],

    address: {
      line1:
        '1 Hospital Road',

      line2:
        null,

      city:
        'Lahore',

      district:
        'Lahore',

      province:
        'Punjab',

      postalCode:
        '54000',

      countryCode:
        'pk',
    },

    contact: {
      primaryPhone:
        '+924200000000',

      secondaryPhone:
        null,

      email:
        'CONTACT@EXAMPLE.TEST',

      website:
        null,

      emergencyPhone:
        null,
    },

    allowsAuthentication:
      true,
  },

  actor: {
    userId:
      '507f191e810c19729de860ea',

    facilityId:
      '507f1f77bcf86cd799439012',

    correlationId:
      'correlation-1',

    ipAddress:
      '127.0.0.1',

    userAgent:
      'vitest',
  },

  idempotencyKey:
    'create-facility-0001',
} as const;

describe(
  'facility mutation workflows',
  () => {
    it(
      'creates a normalized facility with compensation, audit, and outbox records',
      async () => {
        const fixture =
          dependencies();

        const repository = {
          findByCode:
            vi.fn()
              .mockResolvedValue(
                null,
              ),

          findById:
            vi.fn()
              .mockResolvedValue(
                null,
              ),

          create:
            vi.fn()
              .mockResolvedValue(
                facilityRecord(),
              ),
        } as unknown as FacilityRepository;

        const workflow =
          new CreateFacilityWorkflow(
            repository,
            fixture.result,
          );

        const result =
          await workflow.execute(
            command,
          );

        expect(result).toMatchObject({
          id:
            '507f1f77bcf86cd799439011',

          code:
            'MAIN',

          currency:
            'PKR',

          locale:
            'en-PK',
        });

        expect(
          repository.create,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            code:
              'MAIN',

            currency:
              'PKR',

            locale:
              'en-PK',

            createdBy:
              command.actor.userId,
          }),
        );

        expect(
          fixture.registerCompensation,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            type:
              FACILITY_COMPENSATION_TYPES
                .DELETE_CREATED_FACILITY,

            payload:
              expect.objectContaining({
                facilityId:
                  '507f1f77bcf86cd799439011',

                expectedVersion:
                  0,
              }),
          }),
        );

        expect(
          fixture.auditAppend,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            action:
              'facility.created',

            facilityId:
              '507f1f77bcf86cd799439011',
          }),
        );

        expect(
          fixture.outboxEnqueue,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType:
              FACILITY_OUTBOX_EVENTS
                .FACILITY_CREATED,

            aggregateId:
              '507f1f77bcf86cd799439011',
          }),
        );
      },
    );

    it(
      'maps MongoDB facility-code conflicts to the domain conflict error',
      async () => {
        const fixture =
          dependencies();

        const duplicateError = {
          code:
            11000,

          keyPattern: {
            code:
              1,
          },

          keyValue: {
            code:
              'MAIN',
          },
        };

        const repository = {
          findByCode:
            vi.fn()
              .mockResolvedValue(
                null,
              ),

          findById:
            vi.fn()
              .mockResolvedValue(
                null,
              ),

          create:
            vi.fn()
              .mockRejectedValue(
                duplicateError,
              ),
        } as unknown as FacilityRepository;

        const workflow =
          new CreateFacilityWorkflow(
            repository,
            fixture.result,
          );

        await expect(
          workflow.execute(
            command,
          ),
        ).rejects.toBeInstanceOf(
          FacilityCodeConflictError,
        );
      },
    );
  },
);