import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  assertAdmissionRecommendationTransition,
  assertAdmissionTransition,
  assertBedRateTransition,
  assertBedStatusTransition,
  evaluateInpatientBedCompatibility,
} from '../inpatient.lifecycle.js';

import {
  createAdmissionRecommendationBodySchema,
  createBedRateBodySchema,
  createWardBodySchema,
} from '../inpatient.validation.js';

import {
  InpatientAccessPolicyService,
  type InpatientIdentityReader,
} from '../services/inpatient-access-policy.service.js';

import type {
  InpatientActorIdentityRecord,
  InpatientStaffContextRecord,
} from '../repositories/inpatient-context.repository.js';

const facilityId =
  '64b000000000000000000001';

const userId =
  '64b000000000000000000002';

const staffId =
  '64b000000000000000000003';

const encounterId =
  '64b000000000000000000004';

const patientId =
  '64b000000000000000000005';

const departmentId =
  '64b000000000000000000006';

class IdentityReader
implements InpatientIdentityReader {
  public constructor(
    private readonly identity:
      InpatientActorIdentityRecord | null,

    private readonly staff:
      InpatientStaffContextRecord | null,
  ) {}

  public async findActorIdentity():
    Promise<
      InpatientActorIdentityRecord | null
    > {
    return this.identity;
  }

  public async findStaff():
    Promise<
      InpatientStaffContextRecord | null
    > {
    return this.staff;
  }
}

function activeIdentity():
  InpatientActorIdentityRecord {
  return {
    userId,
    facilityId,
    staffId,
    status:
      'ACTIVE',
  };
}

function activeDoctor():
  InpatientStaffContextRecord {
  return {
    id:
      staffId,

    facilityId,

    departmentId,

    displayName:
      'Dr Fictional',

    designation:
      'Consultant',

    professionalType:
      'DOCTOR',

    employmentStatus:
      'ACTIVE',

    isClinical:
      true,

    isActive:
      true,
  };
}

function actor(
  permissionKeys:
    readonly string[],
) {
  return {
    userId,

    facilityId,

    correlationId:
      'corr-inpatient-test',

    roleKeys:
      [
        'CLINICAL_DOCTOR',
      ],

    permissionKeys,
  };
}

function clinicalContext(
  assigned =
    true,
) {
  return {
    encounterId,

    facilityId,

    patientId,

    requestedPatientId:
      patientId,

    canonicalRedirected:
      false,

    confidentiality:
      'ROUTINE',

    status:
      'IN_PROGRESS',

    registrationId:
      null,

    opdVisitId:
      null,

    queueTokenId:
      null,

    departmentId,

    clinicId:
      null,

    servicePointId:
      null,

    primaryProviderStaffId:
      staffId,

    assignedProviderStaffIds:
      assigned
        ? [
            staffId,
          ]
        : [],
  };
}

describe(
  'inpatient domain infrastructure',
  () => {
    it(
      'enforces admission, recommendation, bed, and rate lifecycle transitions',
      () => {
        expect(
          () =>
            assertAdmissionRecommendationTransition(
              'ORDERED',
              'ACCEPTED',
            ),
        ).not.toThrow();

        expect(
          () =>
            assertAdmissionRecommendationTransition(
              'REJECTED',
              'ACCEPTED',
            ),
        ).toThrow(
          'Admission recommendation cannot transition',
        );

        expect(
          () =>
            assertAdmissionTransition(
              'ADMITTED',
              'DISCHARGE_INITIATED',
            ),
        ).not.toThrow();

        expect(
          () =>
            assertAdmissionTransition(
              'DISCHARGED',
              'ADMITTED',
            ),
        ).toThrow(
          'Admission cannot transition',
        );

        expect(
          () =>
            assertBedStatusTransition(
              'AVAILABLE',
              'RESERVED',
            ),
        ).not.toThrow();

        expect(
          () =>
            assertBedStatusTransition(
              'OCCUPIED',
              'AVAILABLE',
            ),
        ).toThrow(
          'Bed status cannot transition',
        );

        expect(
          () =>
            assertBedRateTransition(
              'DRAFT',
              'ACTIVE',
            ),
        ).not.toThrow();

        expect(
          () =>
            assertBedRateTransition(
              'SUPERSEDED',
              'ACTIVE',
            ),
        ).toThrow(
          'Bed rate cannot transition',
        );
      },
    );

    it(
      'evaluates sex, age, specialty, isolation, and infection-control compatibility',
      () => {
        const result =
          evaluateInpatientBedCompatibility(
            {
              patientSex:
                'FEMALE',

              ageYears:
                42,

              specialtyCodes:
                [
                  'CARDIOLOGY',
                ],

              requiredIsolationCapabilities:
                [
                  'AIRBORNE',
                ],

              infectionControlTags:
                [
                  'TB',
                ],
            },
            {
              permittedSexes:
                [
                  'MALE',
                ],

              minimumAgeYears:
                18,

              maximumAgeYears:
                65,

              specialtyCodes:
                [
                  'MEDICINE',
                ],

              isolationCapabilities:
                [
                  'STANDARD_PRECAUTIONS',
                ],

              infectionControlTags:
                [
                  'MRSA',
                ],

              negativePressureCapable:
                false,

              cohortingAllowed:
                false,
            },
          );

        expect(
          result.compatible,
        ).toBe(
          false,
        );

        expect(
          result.reasons,
        ).toEqual(
          expect.arrayContaining([
            expect.stringContaining(
              'sex',
            ),
            expect.stringContaining(
              'specialty',
            ),
            expect.stringContaining(
              'AIRBORNE',
            ),
            expect.stringContaining(
              'TB',
            ),
          ]),
        );
      },
    );

    it(
      'validates location restrictions, charging policy, and recommendation snapshots',
      () => {
        const invalidWard =
          createWardBodySchema.safeParse({
            wardCode:
              'ISO-1',

            name:
              'Isolation Ward',

            wardType:
              'ISOLATION',

            departmentId,

            permittedSexes:
              [
                'MALE',
                'FEMALE',
              ],

            minimumAgeYears:
              65,

            maximumAgeYears:
              18,

            isolationCapabilities:
              [
                'STANDARD_PRECAUTIONS',
              ],

            negativePressureCapable:
              true,
          });

        expect(
          invalidWard.success,
        ).toBe(
          false,
        );

        const validRate =
          createBedRateBodySchema.safeParse({
            rateCode:
              'GENERAL-DAY',

            name:
              'General Bed Daily Rate',

            scope:
              'BED_CATEGORY',

            scopeCode:
              'GENERAL',

            currencyCode:
              'PKR',

            amount:
              '7500.00',

            chargingPolicy: {
              policyCode:
                'STANDARD-DAY',

              billingUnit:
                'PER_24_HOURS',

              partialDayPolicy:
                'ROUND_TO_INCREMENT',

              sameDayDischargePolicy:
                'MINIMUM_ONE_UNIT',

              transferChargingPolicy:
                'SPLIT_AT_TRANSFER_TIME',

              roundingIncrementMinutes:
                60,
            },

            effectiveFrom:
              '2026-07-20T00:00:00.000+05:00',
          });

        expect(
          validRate.success,
        ).toBe(
          true,
        );

        const invalidRecommendation =
          createAdmissionRecommendationBodySchema.safeParse({
            encounterId,

            orderingProviderStaffId:
              staffId,

            admissionType:
              'EMERGENCY',

            priority:
              'URGENT',

            clinicalIndication:
              'Requires inpatient monitoring',

            diagnosisSnapshots: [
              {
                diagnosisCode:
                  'J18.9',

                diagnosisSystem:
                  'ICD-10',

                diagnosisDisplay:
                  'Pneumonia',

                primary:
                  true,
              },
              {
                diagnosisCode:
                  'R06.0',

                diagnosisSystem:
                  'ICD-10',

                diagnosisDisplay:
                  'Dyspnea',

                primary:
                  true,
              },
            ],
          });

        expect(
          invalidRecommendation.success,
        ).toBe(
          false,
        );
      },
    );

    it(
      'allows assigned clinicians to recommend admission and denies unassigned clinicians',
      async () => {
        const policy =
          new InpatientAccessPolicyService(
            new IdentityReader(
              activeIdentity(),
              activeDoctor(),
            ),
          );

        const allowed =
          await policy.authorize({
            action:
              'ADMISSION_RECOMMEND',

            actor:
              actor([
                'admissions.create',
              ]),

            clinicalContext:
              clinicalContext(
                true,
              ),
          });

        expect(
          allowed,
        ).toMatchObject({
          allowed:
            true,

          accessMode:
            'ASSIGNED_CLINICIAN',
        });

        const denied =
          await policy.authorize({
            action:
              'ADMISSION_RECOMMEND',

            actor:
              actor([
                'admissions.create',
              ]),

            clinicalContext:
              clinicalContext(
                false,
              ),
          });

        expect(
          denied,
        ).toMatchObject({
          allowed:
            false,

          accessMode:
            'DENIED',
        });
      },
    );

    it(
      'requires a documented reason for break-glass inpatient reads',
      async () => {
        const policy =
          new InpatientAccessPolicyService(
            new IdentityReader(
              activeIdentity(),
              activeDoctor(),
            ),
          );

        await expect(
          policy.authorize({
            action:
              'ADMISSION_READ',

            actor: {
              ...actor([
                'admissions.read',
                'security.break_glass',
              ]),

              roleKeys:
                [],
            },

            clinicalContext:
              clinicalContext(
                false,
              ),
          }),
        ).rejects.toThrow(
          'break-glass reason',
        );

        const decision =
          await policy.authorize({
            action:
              'ADMISSION_READ',

            actor: {
              ...actor([
                'admissions.read',
                'security.break_glass',
              ]),

              roleKeys:
                [],

              breakGlassReason:
                'Emergency access for immediate patient safety',
            },

            clinicalContext:
              clinicalContext(
                false,
              ),
          });

        expect(
          decision,
        ).toMatchObject({
          allowed:
            true,

          accessMode:
            'BREAK_GLASS',

          auditSensitiveRead:
            true,
        });
      },
    );
  },
);