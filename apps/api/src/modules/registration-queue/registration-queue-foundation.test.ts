import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  QUEUE_ENTRY_TRANSITIONS,
  REGISTRATION_QUEUE_PERMISSION_KEYS,
} from '../registration-queue.constants.js';

import {
  DuplicateActiveQueueEntryError,
  DuplicateActiveVisitError,
  QueueTokenNumberConflictError,
  RegistrationAppointmentConflictError,
} from '../registration-queue.errors.js';

import {
  buildActiveVisitKey,
  buildQueueTokenLabel,
  buildQueueTokenSequenceKey,
  calculateQueuePriorityScore,
  formatRegistrationNumber,
  normalizeServiceDate,
} from '../registration-queue.normalization.js';

import {
  mapRegistrationQueuePersistenceError,
} from '../registration-queue.persistence-errors.js';

import {
  QUEUE_PUBLIC_DISPLAY_SELECT,
} from '../registration-queue.projections.js';

import {
  createQueueEntryBodySchema,
  createRegistrationBodySchema,
  registerOpdVisitBodySchema,
} from '../registration-queue.validation.js';

describe(
  'registration and OPD queue Batch 2 foundation',
  () => {
    it(
      'uses the centralized registration and queue permissions',
      () => {
        expect(
          REGISTRATION_QUEUE_PERMISSION_KEYS,
        ).toMatchObject({
          REGISTRATION_READ:
            'registrations.read',

          REGISTRATION_CREATE:
            'registrations.create',

          QUEUE_READ:
            'queues.read',

          QUEUE_MANAGE:
            'queues.manage',

          QUEUE_PRIORITY:
            'queues.priority',

          QUEUE_TRANSFER:
            'queues.transfer',

          QUEUE_PUBLIC_DISPLAY:
            'queues.public_display',
        });
      },
    );

    it(
      'validates source-specific registration requirements',
      () => {
        const appointment =
          createRegistrationBodySchema.safeParse({
            patientId:
              '507f1f77bcf86cd799439011',

            registrationMode:
              'RETURNING_PATIENT',

            registrationSource:
              'APPOINTMENT',

            visitType:
              'RETURNING_PATIENT',

            serviceDate:
              '2026-07-18',

            departmentId:
              '507f191e810c19729de860ea',
          });

        expect(
          appointment.success,
        ).toBe(false);

        const referral =
          createRegistrationBodySchema.safeParse({
            patientId:
              '507f1f77bcf86cd799439011',

            registrationMode:
              'RETURNING_PATIENT',

            registrationSource:
              'REFERRAL',

            visitType:
              'RETURNING_PATIENT',

            serviceDate:
              '2026-07-18',

            departmentId:
              '507f191e810c19729de860ea',
          });

        expect(
          referral.success,
        ).toBe(false);

        const emergency =
          createRegistrationBodySchema.safeParse({
            patientId:
              '507f1f77bcf86cd799439011',

            registrationMode:
              'RETURNING_PATIENT',

            registrationSource:
              'EMERGENCY',

            visitType:
              'RETURNING_PATIENT',

            serviceDate:
              '2026-07-18',

            departmentId:
              '507f191e810c19729de860ea',
          });

        expect(
          emergency.success,
        ).toBe(false);
      },
    );

    it(
      'accepts a returning walk-in registration with a queue request',
      () => {
        const result =
          registerOpdVisitBodySchema.safeParse({
            registration: {
              patientId:
                '507f1f77bcf86cd799439011',

              registrationMode:
                'RETURNING_PATIENT',

              registrationSource:
                'WALK_IN',

              visitType:
                'RETURNING_PATIENT',

              serviceDate:
                '2026-07-18',

              arrivedAt:
                '2026-07-18T09:00:00+05:00',

              departmentId:
                '507f191e810c19729de860ea',

              clinicId:
                '507f191e810c19729de860eb',
            },

            queue: {
              queueDefinitionId:
                '507f191e810c19729de860ec',

              priorityClass:
                'ROUTINE',

              triagePriority:
                'NOT_TRIAGED',

              emergencyOverride:
                false,

              specialCategories:
                [],
            },
          });

        expect(
          result.success,
        ).toBe(true);
      },
    );

    it(
      'requires a reason for emergency queue override',
      () => {
        const result =
          createQueueEntryBodySchema.safeParse({
            queueDefinitionId:
              '507f191e810c19729de860ec',

            priorityClass:
              'EMERGENCY',

            triagePriority:
              'LEVEL_1_RESUSCITATION',

            emergencyOverride:
              true,

            specialCategories:
              [],
          });

        expect(
          result.success,
        ).toBe(false);
      },
    );

    it(
      'builds date-scoped numbers and queue keys deterministically',
      () => {
        expect(
          normalizeServiceDate(
            '2026-07-18',
          ),
        ).toBe(
          '2026-07-18',
        );

        expect(
          formatRegistrationNumber(
            'KTH',
            '2026-07-18',
            42,
            6,
          ),
        ).toBe(
          'REG-KTH-20260718-000042',
        );

        expect(
          buildQueueTokenSequenceKey(
            '507f191e810c19729de860ec',
            '2026-07-18',
          ),
        ).toBe(
          'opd.queue.token.507f191e810c19729de860ec.2026-07-18',
        );

        expect(
          buildQueueTokenLabel(
            'A',
            7,
          ),
        ).toBe(
          'A7',
        );
      },
    );

    it(
      'uses canonical patient and service context in active visit keys',
      () => {
        expect(
          buildActiveVisitKey({
            patientId:
              '507f1f77bcf86cd799439011',

            serviceDate:
              '2026-07-18',

            departmentId:
              '507f191e810c19729de860ea',

            clinicId:
              '507f191e810c19729de860eb',

            servicePointId:
              null,
          }),
        ).toBe(
          '507f1f77bcf86cd799439011:2026-07-18:507f191e810c19729de860ea:507f191e810c19729de860eb:-',
        );
      },
    );

    it(
      'ranks emergency and triage priorities above routine entries',
      () => {
        const routine =
          calculateQueuePriorityScore({
            priorityClass:
              'ROUTINE',

            triagePriority:
              'NOT_TRIAGED',

            emergencyOverride:
              false,

            specialCategories:
              [],
          });

        const emergency =
          calculateQueuePriorityScore({
            priorityClass:
              'EMERGENCY',

            triagePriority:
              'LEVEL_1_RESUSCITATION',

            emergencyOverride:
              true,

            specialCategories: [
              'CHILD',
            ],
          });

        expect(
          emergency,
        ).toBeGreaterThan(
          routine,
        );
      },
    );

    it(
      'keeps public display projection free of patient identifiers',
      () => {
        for (
          const forbidden of [
            'patientId',
            'registrationId',
            'opdVisitId',
            'patientName',
            'mrn',
            'cnic',
            'phone',
          ]
        ) {
          expect(
            QUEUE_PUBLIC_DISPLAY_SELECT,
          ).not.toContain(
            forbidden,
          );
        }
      },
    );

    it(
      'maps duplicate indexes to stable domain errors',
      () => {
        expect(
          mapRegistrationQueuePersistenceError(
            {
              code:
                11000,

              keyPattern: {
                facilityId:
                  1,

                appointmentId:
                  1,
              },
            },
            'CREATE_REGISTRATION',
          ),
        ).toBeInstanceOf(
          RegistrationAppointmentConflictError,
        );

        expect(
          mapRegistrationQueuePersistenceError(
            {
              code:
                11000,

              keyPattern: {
                facilityId:
                  1,

                activeVisitKey:
                  1,
              },
            },
            'CREATE_VISIT',
          ),
        ).toBeInstanceOf(
          DuplicateActiveVisitError,
        );

        expect(
          mapRegistrationQueuePersistenceError(
            {
              code:
                11000,

              keyPattern: {
                facilityId:
                  1,

                activeEntryKey:
                  1,
              },
            },
            'CREATE_QUEUE_ENTRY',
          ),
        ).toBeInstanceOf(
          DuplicateActiveQueueEntryError,
        );

        expect(
          mapRegistrationQueuePersistenceError(
            {
              code:
                11000,

              keyPattern: {
                facilityId:
                  1,

                serviceDate:
                  1,

                queueDefinitionId:
                  1,

                tokenNumber:
                  1,
              },
            },
            'CREATE_QUEUE_ENTRY',
          ),
        ).toBeInstanceOf(
          QueueTokenNumberConflictError,
        );
      },
    );

    it(
      'does not allow terminal queue states to transition again',
      () => {
        expect(
          QUEUE_ENTRY_TRANSITIONS
            .COMPLETED,
        ).toEqual([]);

        expect(
          QUEUE_ENTRY_TRANSITIONS
            .CANCELLED,
        ).toEqual([]);

        expect(
          QUEUE_ENTRY_TRANSITIONS
            .TRANSFERRED,
        ).toEqual([]);
      },
    );
  },
);