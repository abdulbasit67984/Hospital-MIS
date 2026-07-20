import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  createNursingAssessmentBodySchema,
  createNursingCarePlanBodySchema,
  createNursingDeviceBodySchema,
  recordIntakeOutputBodySchema,
} from '../nursing-medication.validation.js';

import {
  assertNursingAssessmentTransition,
  assertNursingDocumentationAllowed,
  assertNursingTaskTransition,
} from '../nursing-medication.lifecycle.js';

import {
  NursingMedicationAccessPolicyService,
} from '../services/nursing-medication-access-policy.service.js';

import type {
  NursingAdmissionContext,
  NursingMedicationActorContext,
} from '../nursing-medication.contracts.js';

import type {
  NursingAccessIdentityReader,
} from '../services/nursing-medication-access-policy.service.js';

const objectId =
  '507f1f77bcf86cd799439011';

const facilityId =
  '507f1f77bcf86cd799439012';

const staffId =
  '507f1f77bcf86cd799439013';

const departmentId =
  '507f1f77bcf86cd799439014';

function context():
NursingAdmissionContext {
  return {
    facilityId,

    admissionId:
      '507f1f77bcf86cd799439015',

    admissionNumber:
      'ADM-2026-0000001',

    admissionStatus:
      'ADMITTED',

    isActive:
      true,

    encounterId:
      '507f1f77bcf86cd799439016',

    admittedAt:
      '2026-07-20T08:00:00.000Z',

    clinicallyDischargedAt:
      null,

    dischargedAt:
      null,

    attendingConsultantUserId:
      '507f1f77bcf86cd799439017',

    attendingConsultantStaffId:
      '507f1f77bcf86cd799439018',

    careTeam: [],

    patient: {
      patientId:
        '507f1f77bcf86cd799439019',

      displayName:
        'Fictional Patient',

      mrn:
        'HOSP-2026-000001',

      birthDate:
        '1990-01-01',

      estimatedAgeYears:
        null,

      sexAtBirth:
        'FEMALE',
    },

    location: {
      wardId:
        '507f1f77bcf86cd799439020',

      wardCode:
        'MED-A',

      wardName:
        'Medical Ward A',

      wardType:
        'GENERAL',

      nursingStationCode:
        'NS-A',

      departmentId,

      roomId:
        '507f1f77bcf86cd799439021',

      roomNumber:
        '101',

      roomName:
        'Room 101',

      bedId:
        '507f1f77bcf86cd799439022',

      bedNumber:
        '1',

      bedLabel:
        '101-1',

      bedCategory:
        'GENERAL',
    },

    alerts: [],

    allergies: [],
  };
}

function actor(
  overrides: Partial<
    NursingMedicationActorContext
  > = {},
): NursingMedicationActorContext {
  return {
    userId:
      objectId,

    facilityId,

    correlationId:
      'correlation-1',

    roleKeys: [
      'WARD_NURSE',
    ],

    permissionKeys: [
      'nursing.read',
      'nursing.notes.create',
      'nursing.notes.amend',
      'nursing.vitals.create',
      'nursing.vitals.amend',
      'nursing.medication_administer',
      'nursing.handover.manage',
    ],

    ...overrides,
  };
}

const identityReader:
NursingAccessIdentityReader = {
  async findActorIdentity() {
    return {
      userId:
        objectId,

      facilityId,

      staffId,

      status:
        'ACTIVE',
    };
  },

  async findStaff() {
    return {
      staffId,

      facilityId,

      departmentId,

      displayName:
        'Fictional Nurse',

      professionalType:
        'NURSE',

      employmentStatus:
        'ACTIVE',

      isClinical:
        true,

      isActive:
        true,
    };
  },
};

describe(
  'nursing and medication contracts',
  () => {
    it(
      'requires a template code for custom assessments',
      () => {
        const parsed =
          createNursingAssessmentBodySchema.safeParse({
            admissionId:
              objectId,

            assessmentType:
              'CUSTOM',

            sections: [
              {
                sectionCode:
                  'CUSTOM_SECTION',

                sectionLabel:
                  'Custom section',

                values: {
                  answer:
                    true,
                },
              },
            ],

            assessedAt:
              '2026-07-20T08:00:00.000Z',
          });

        expect(
          parsed.success,
        ).toBe(false);
      },
    );

    it(
      'rejects care-plan review dates before the start date',
      () => {
        const parsed =
          createNursingCarePlanBodySchema.safeParse({
            admissionId:
              objectId,

            title:
              'Mobility plan',

            problems: [
              {
                description:
                  'Reduced mobility',

                identifiedAt:
                  '2026-07-20T08:00:00.000Z',
              },
            ],

            startedAt:
              '2026-07-20T08:00:00.000Z',

            nextReviewAt:
              '2026-07-19T08:00:00.000Z',
          });

        expect(
          parsed.success,
        ).toBe(false);
      },
    );

    it(
      'enforces intake and output category direction',
      () => {
        const parsed =
          recordIntakeOutputBodySchema.safeParse({
            admissionId:
              objectId,

            direction:
              'OUTPUT',

            category:
              'ORAL',

            quantity:
              '250',

            unitCode:
              'ML',

            conversionFactorToMillilitres:
              '1',

            occurredAt:
              '2026-07-20T08:00:00.000Z',

            shiftCode:
              'DAY',
          });

        expect(
          parsed.success,
        ).toBe(false);
      },
    );

    it(
      'requires wound details only for wound records',
      () => {
        const parsed =
          createNursingDeviceBodySchema.safeParse({
            admissionId:
              objectId,

            deviceType:
              'WOUND',

            deviceName:
              'Sacral wound',

            anatomicalSite:
              'Sacral region',
          });

        expect(
          parsed.success,
        ).toBe(false);
      },
    );
  },
);

describe(
  'nursing lifecycle rules',
  () => {
    it(
      'allows signing a draft assessment and blocks reverting a signed assessment',
      () => {
        expect(
          () =>
            assertNursingAssessmentTransition(
              'DRAFT',
              'SIGNED',
            ),
        ).not.toThrow();

        expect(
          () =>
            assertNursingAssessmentTransition(
              'SIGNED',
              'DRAFT',
            ),
        ).toThrow(
          /cannot transition/iu,
        );
      },
    );

    it(
      'allows delayed tasks to return to pending but blocks completed task mutation',
      () => {
        expect(
          () =>
            assertNursingTaskTransition(
              'DELAYED',
              'PENDING',
            ),
        ).not.toThrow();

        expect(
          () =>
            assertNursingTaskTransition(
              'COMPLETED',
              'PENDING',
            ),
        ).toThrow(
          /cannot transition/iu,
        );
      },
    );

    it(
      'blocks new documentation after final discharge and permits reasoned correction',
      () => {
        const discharged = {
          ...context(),

          admissionStatus:
            'DISCHARGED' as const,

          isActive:
            false,

          dischargedAt:
            '2026-07-20T10:00:00.000Z',
        };

        expect(
          () =>
            assertNursingDocumentationAllowed(
              discharged,
              'NEW_ENTRY',
            ),
        ).toThrow(
          /not permitted/iu,
        );

        expect(
          () =>
            assertNursingDocumentationAllowed(
              discharged,
              'CORRECTION',
              'Correcting an authenticated transcription error',
            ),
        ).not.toThrow();
      },
    );
  },
);

describe(
  'nursing minimum-necessary access policy',
  () => {
    it(
      'authorizes a ward nurse in the same ward department',
      async () => {
        const policy =
          new NursingMedicationAccessPolicyService(
            identityReader,
          );

        const decision =
          await policy.authorize({
            action:
              'ASSESSMENT_CREATE',

            actor:
              actor(),

            context:
              context(),
          });

        expect(
          decision.allowed,
        ).toBe(true);

        expect(
          decision.accessMode,
        ).toBe(
          'WARD_ASSIGNED',
        );

        expect(
          decision.auditSensitiveRead,
        ).toBe(false);
      },
    );

    it(
      'denies a nursing mutation without the required permission',
      async () => {
        const policy =
          new NursingMedicationAccessPolicyService(
            identityReader,
          );

        const decision =
          await policy.authorize({
            action:
              'MEDICATION_ADMINISTER',

            actor:
              actor({
                permissionKeys: [
                  'nursing.read',
                ],
              }),

            context:
              context(),
          });

        expect(
          decision.allowed,
        ).toBe(false);

        expect(
          decision.denialReason,
        ).toContain(
          'nursing.medication_administer',
        );
      },
    );

    it(
      'requires a documented reason for break-glass reads',
      async () => {
        const crossDepartmentReader:
        NursingAccessIdentityReader = {
          ...identityReader,

          async findStaff() {
            return {
              staffId,

              facilityId,

              departmentId:
                '507f1f77bcf86cd799439099',

              displayName:
                'Fictional Nurse',

              professionalType:
                'NURSE',

              employmentStatus:
                'ACTIVE',

              isClinical:
                true,

              isActive:
                true,
            };
          },
        };

        const policy =
          new NursingMedicationAccessPolicyService(
            crossDepartmentReader,
          );

        await expect(
          policy.authorize({
            action:
              'WORKSPACE_READ',

            actor:
              actor({
                roleKeys: [],

                permissionKeys: [
                  'nursing.read',
                  'security.break_glass',
                ],
              }),

            context:
              context(),
          }),
        ).rejects.toThrow(
          /break-glass reason/iu,
        );
      },
    );
  },
);