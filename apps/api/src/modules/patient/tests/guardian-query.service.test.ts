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
  GuardianQueryService,
} from '../services/guardian-query.service.js';

const facilityId =
  '507f191e810c19729de860ea';

const guardianId =
  '507f1f77bcf86cd799439012';

const actor = {
  userId:
    '507f191e810c19729de860eb',
  facilityId,
  correlationId:
    'correlation-guardian-1',
};

const now =
  new Date(
    '2026-07-18T10:00:00.000Z',
  );

function guardianRecord() {
  return {
    _id:
      new Types.ObjectId(
        guardianId,
      ),
    facilityId:
      new Types.ObjectId(
        facilityId,
      ),
    enterpriseGuardianId:
      'guardian-enterprise-1',
    firstName:
      'Sara',
    middleName:
      null,
    lastName:
      'Khan',
    displayName:
      'Sara Khan',
    normalizedFullName:
      'sara khan',
    localizedNames:
      [],
    cnicNormalized:
      '3520212345671',
    cnicDisplayValue:
      '*********5671',
    dateOfBirth:
      null,
    sexAtBirth:
      'FEMALE',
    genderIdentity:
      'NOT_DISCLOSED',
    phoneNormalized:
      '+923001234567',
    phoneDisplayValue:
      '*********4567',
    emailNormalized:
      'sara@example.test',
    address: {
      line1:
        'House 1',
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
    preferredLocale:
      'en-PK',
    status:
      'ACTIVE',
    mergedIntoGuardianId:
      null,
    mergedAt:
      null,
    mergedBy:
      null,
    statusReason:
      null,
    schemaVersion:
      1,
    version:
      1,
    createdBy:
      null,
    updatedBy:
      null,
    createdAt:
      now,
    updatedAt:
      now,
  };
}

describe(
  'GuardianQueryService',
  () => {
    it(
      'returns paginated guardian summaries',
      async () => {
        const service =
          new GuardianQueryService(
            {
              findSearchCandidates:
                vi.fn()
                  .mockResolvedValue([
                    {
                      guardian:
                        guardianRecord(),
                      activeRelationshipCount:
                        2,
                      minorPatientCount:
                        2,
                    },
                  ]),
              count:
                vi.fn()
                  .mockResolvedValue(
                    1,
                  ),
            } as never,
            {
              recordGuardianRead:
                vi.fn(),
            } as never,
          );

        const result =
          await service.search(
            {
              page:
                1,
              pageSize:
                20,
            },
            'STANDARD',
            actor,
          );

        expect(result).toEqual(
          expect.objectContaining({
            totalItems:
              1,
            items: [
              expect.objectContaining({
                id:
                  guardianId,
                cnicDisplayValue:
                  '*********5671',
                minorPatientCount:
                  2,
              }),
            ],
          }),
        );
      },
    );

    it(
      'audits sensitive guardian profiles',
      async () => {
        const recordGuardianRead =
          vi.fn()
            .mockResolvedValue(
              undefined,
            );

        const service =
          new GuardianQueryService(
            {
              loadProfile:
                vi.fn()
                  .mockResolvedValue({
                    guardian:
                      guardianRecord(),
                    relationships:
                      [],
                    patients:
                      [],
                    primaryMrns:
                      [],
                  }),
            } as never,
            {
              recordGuardianRead,
            } as never,
            {
              clock: {
                now:
                  () => now,
              },
            },
          );

        const result =
          await service.getProfile(
            guardianId,
            {
              includeInactiveRelationships:
                false,
            },
            'SENSITIVE',
            actor,
          );

        expect(
          result.guardian.cnic,
        ).toBe(
          '3520212345671',
        );

        expect(
          recordGuardianRead,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            guardianId,
            resource:
              'PROFILE',
          }),
        );
      },
    );
  },
);