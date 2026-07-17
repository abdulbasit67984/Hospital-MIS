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
  DEPARTMENT_STATUS,
  DEPARTMENT_TYPE,
  FACILITY_STATUS,
  FACILITY_TYPE,
} from '../facility.constants.js';

import {
  InvalidFacilityHierarchyError,
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
  DepartmentRecord,
  FacilityRecord,
} from '../facility.types.js';

import type {
  DepartmentRepository,
} from '../repositories/department.repository.js';

import type {
  FacilityRepository,
} from '../repositories/facility.repository.js';

import {
  ActivateDepartmentWorkflow,
} from '../workflows/activate-department.workflow.js';

import {
  DeactivateFacilityWorkflow,
  type FacilitySessionRevocationPort,
} from '../workflows/deactivate-facility.workflow.js';

function facilityRecord(
  overrides:
    Partial<FacilityRecord> = {},
): FacilityRecord {
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
      FACILITY_STATUS.ACTIVE,

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
      4,

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

    ...overrides,
  };
}

function departmentRecord(
  overrides:
    Partial<DepartmentRecord> = {},
): DepartmentRecord {
  const now =
    new Date(
      '2026-07-17T10:00:00.000Z',
    );

  return {
    _id:
      new Types.ObjectId(
        '507f1f77bcf86cd799439021',
      ),

    facilityId:
      new Types.ObjectId(
        '507f1f77bcf86cd799439011',
      ),

    parentDepartmentId:
      null,

    managerStaffId:
      null,

    code:
      'OPD',

    name:
      'Outpatient Department',

    description:
      null,

    departmentType:
      DEPARTMENT_TYPE.CLINICAL,

    isClinical:
      true,

    location:
      'Ground Floor',

    costCenterCode:
      null,

    contact: {
      phone:
        null,

      extension:
        null,

      email:
        null,
    },

    status:
      DEPARTMENT_STATUS.INACTIVE,

    deactivatedAt:
      new Date(
        '2026-07-16T10:00:00.000Z',
      ),

    deactivatedBy:
      new Types.ObjectId(
        '507f191e810c19729de860ea',
      ),

    deactivationReason:
      'Temporary closure',

    schemaVersion:
      1,

    version:
      2,

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

    ...overrides,
  };
}

function mutationDependencies() {
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

  const audit =
    vi.fn()
      .mockResolvedValue(
        undefined,
      );

  const outbox =
    vi.fn()
      .mockResolvedValue(
        undefined,
      );

  const dependencies:
    FacilityMutationDependencies = {
    transactionManager: {
      execute,
    } as FacilityTransactionManagerPort,

    audit: {
      append:
        audit,
    },

    outbox: {
      enqueue:
        outbox,
    },

    clock: {
      now:
        () =>
          new Date(
            '2026-07-17T10:30:00.000Z',
          ),
    },
  };

  return {
    dependencies,
    execute,
    registerCompensation,
    checkpoint,
    audit,
    outbox,
  };
}

const actor = {
  userId:
    '507f191e810c19729de860ea',

  facilityId:
    '507f1f77bcf86cd799439011',

  correlationId:
    'correlation-1',

  ipAddress:
    '127.0.0.1',

  userAgent:
    'vitest',
} as const;

describe(
  'facility lifecycle workflows',
  () => {
    it(
      'deactivates a facility, writes audit/outbox records, and revokes sessions',
      async () => {
        const fixture =
          mutationDependencies();

        const current =
          facilityRecord();

        const inactive =
          facilityRecord({
            status:
              FACILITY_STATUS.INACTIVE,

            allowsAuthentication:
              false,

            deactivatedAt:
              new Date(
                '2026-07-17T10:30:00.000Z',
              ),

            deactivatedBy:
              new Types.ObjectId(
                actor.userId,
              ),

            deactivationReason:
              'Branch closed',

            version:
              5,
          });

        const facilityRepository = {
          findById:
            vi.fn()
              .mockResolvedValue(
                current,
              ),

          countActiveChildren:
            vi.fn()
              .mockResolvedValue(
                0,
              ),

          changeStatus:
            vi.fn()
              .mockResolvedValue(
                inactive,
              ),
        } as unknown as FacilityRepository;

        const departmentRepository = {
          list:
            vi.fn()
              .mockResolvedValue({
                items:
                  [],

                page:
                  1,

                pageSize:
                  1,

                totalItems:
                  0,

                totalPages:
                  0,
              }),
        } as unknown as DepartmentRepository;

        const revokeFacilitySessions =
          vi.fn()
            .mockResolvedValue({
              sessionsRevoked:
                3,

              refreshTokensRevoked:
                4,
            });

        const sessions = {
          revokeFacilitySessions,
        } as FacilitySessionRevocationPort;

        const workflow =
          new DeactivateFacilityWorkflow(
            facilityRepository,
            departmentRepository,
            sessions,
            fixture.dependencies,
          );

        const result =
          await workflow.execute({
            facilityId:
              current._id.toHexString(),

            expectedVersion:
              4,

            reason:
              'Branch closed',

            actor,

            idempotencyKey:
              'deactivate-facility-0001',
          });

        expect(
          result.status,
        ).toBe(
          FACILITY_STATUS.INACTIVE,
        );

        expect(
          result.allowsAuthentication,
        ).toBe(
          false,
        );

        expect(
          fixture.registerCompensation,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            type:
              FACILITY_COMPENSATION_TYPES
                .RESTORE_FACILITY_LIFECYCLE,

            payload:
              expect.objectContaining({
                facilityId:
                  current._id.toHexString(),

                expectedPostVersion:
                  5,
              }),
          }),
        );

        expect(
          fixture.outbox,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType:
              FACILITY_OUTBOX_EVENTS
                .FACILITY_DEACTIVATED,
          }),
        );

        expect(
          revokeFacilitySessions,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            facilityId:
              current._id.toHexString(),

            revokedBy:
              actor.userId,
          }),
        );
      },
    );

    it(
      'blocks facility deactivation while an active department exists',
      async () => {
        const fixture =
          mutationDependencies();

        const current =
          facilityRecord();

        const facilityRepository = {
          findById:
            vi.fn()
              .mockResolvedValue(
                current,
              ),

          countActiveChildren:
            vi.fn()
              .mockResolvedValue(
                0,
              ),
        } as unknown as FacilityRepository;

        const departmentRepository = {
          list:
            vi.fn()
              .mockResolvedValue({
                items:
                  [
                    departmentRecord({
                      status:
                        DEPARTMENT_STATUS.ACTIVE,
                    }),
                  ],

                page:
                  1,

                pageSize:
                  1,

                totalItems:
                  1,

                totalPages:
                  1,
              }),
        } as unknown as DepartmentRepository;

        const workflow =
          new DeactivateFacilityWorkflow(
            facilityRepository,
            departmentRepository,
            {
              revokeFacilitySessions:
                vi.fn(),
            },
            fixture.dependencies,
          );

        await expect(
          workflow.execute({
            facilityId:
              current._id.toHexString(),

            expectedVersion:
              4,

            reason:
              'Branch closed',

            actor,

            idempotencyKey:
              'deactivate-facility-0002',
          }),
        ).rejects.toBeInstanceOf(
          InvalidFacilityHierarchyError,
        );

        expect(
          fixture.execute,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'activates a department only inside an active facility',
      async () => {
        const fixture =
          mutationDependencies();

        const facility =
          facilityRecord();

        const current =
          departmentRecord();

        const active =
          departmentRecord({
            status:
              DEPARTMENT_STATUS.ACTIVE,

            deactivatedAt:
              null,

            deactivatedBy:
              null,

            deactivationReason:
              null,

            version:
              3,
          });

        const facilityRepository = {
          findById:
            vi.fn()
              .mockResolvedValue(
                facility,
              ),
        } as unknown as FacilityRepository;

        const departmentRepository = {
          findByIdInFacility:
            vi.fn()
              .mockResolvedValue(
                current,
              ),

          changeStatus:
            vi.fn()
              .mockResolvedValue(
                active,
              ),
        } as unknown as DepartmentRepository;

        const workflow =
          new ActivateDepartmentWorkflow(
            departmentRepository,
            facilityRepository,
            fixture.dependencies,
          );

        const result =
          await workflow.execute({
            facilityId:
              facility._id.toHexString(),

            departmentId:
              current._id.toHexString(),

            expectedVersion:
              2,

            reason:
              'Department reopened',

            actor,

            idempotencyKey:
              'activate-department-0001',
          });

        expect(
          result.status,
        ).toBe(
          DEPARTMENT_STATUS.ACTIVE,
        );

        expect(
          fixture.audit,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            action:
              'department.activated',
          }),
        );
      },
    );
  },
);