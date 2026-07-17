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
  PatientQueryService,
} from '../services/patient-query.service.js';

import type {
  PatientProfileRecords,
  PatientSearchCandidateRecord,
} from '../patient.query.types.js';

const facilityId =
  '507f191e810c19729de860ea';

const sourcePatientId =
  '507f1f77bcf86cd799439011';

const targetPatientId =
  '507f1f77bcf86cd799439012';

const actor = {
  userId:
    '507f191e810c19729de860eb',
  facilityId,
  correlationId:
    'correlation-query-1',
};

const now =
  new Date(
    '2026-07-18T10:00:00.000Z',
  );

function profileRecords(
  patientId: string,
  mrn: string,
): PatientProfileRecords {
  const objectId =
    new Types.ObjectId(
      patientId,
    );

  const patient = {
    _id:
      objectId,
    facilityId:
      new Types.ObjectId(
        facilityId,
      ),
    enterprisePatientId:
      `enterprise-${patientId}`,
    canonicalPatientId:
      null,
    firstName:
      'Ayesha',
    middleName:
      null,
    lastName:
      'Khan',
    preferredName:
      null,
    displayName:
      'Ayesha Khan',
    normalizedFullName:
      'ayesha khan',
    nameSearchTokens: [
      'ayesha',
      'khan',
    ],
    localizedNames:
      [],
    birthDate: {
      value:
        new Date(
          '1990-05-10T00:00:00.000Z',
        ),
      precision:
        'EXACT',
      isApproximate:
        false,
      estimatedAgeYears:
        null,
      estimatedAsOfDate:
        null,
    },
    isMinor:
      false,
    guardianRequirement:
      'NOT_REQUIRED',
    sexAtBirth:
      'FEMALE',
    genderIdentity:
      'NOT_DISCLOSED',
    genderDescription:
      null,
    preferredLocale:
      'en-PK',
    nationalityCountryCode:
      'PK',
    status:
      'ACTIVE',
    mergeState:
      'CANONICAL',
    mergedIntoPatientId:
      null,
    mergedAt:
      null,
    mergedBy:
      null,
    mergeReason:
      null,
    deceasedAt:
      null,
    statusReason:
      null,
    identityReviewRequired:
      false,
    duplicateReviewRequired:
      false,
    registrationSource:
      'RECEPTION',
    registeredAt:
      now,
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
  } as PatientProfileRecords['patient'];

  const identifier = {
    _id:
      new Types.ObjectId(),
    facilityId:
      patient.facilityId,
    patientId:
      objectId,
    issuingFacilityId:
      patient.facilityId,
    identifierType:
      'MRN',
    scope:
      'FACILITY',
    normalizedValue:
      mrn,
    displayValue:
      mrn,
    issuingCountryCode:
      'PK',
    issuingAuthority:
      null,
    isPrimaryIdentity:
      false,
    isPrimaryMrn:
      true,
    verificationStatus:
      'VERIFIED',
    verifiedAt:
      now,
    verifiedBy:
      null,
    validFrom:
      now,
    expiresAt:
      null,
    status:
      'ACTIVE',
    replacedByIdentifierId:
      null,
    statusReason:
      null,
    schemaVersion:
      1,
    version:
      0,
    createdBy:
      null,
    updatedBy:
      null,
    createdAt:
      now,
    updatedAt:
      now,
  } as PatientProfileRecords['identifiers'][number];

  return {
    patient,
    identifiers: [
      identifier,
    ],
    contacts:
      [],
    addresses:
      [],
    guardianRelationships:
      [],
    guardians:
      [],
    alerts:
      [],
  };
}

describe(
  'PatientQueryService',
  () => {
    it(
      'deduplicates merged search hits into the canonical patient',
      async () => {
        const sourceRecords =
          profileRecords(
            sourcePatientId,
            'MAIN-2026-000101',
          );

        sourceRecords.patient.status =
          'MERGED';
        sourceRecords.patient.mergeState =
          'MERGED';
        sourceRecords.patient.mergedIntoPatientId =
          new Types.ObjectId(
            targetPatientId,
          );

        const targetRecords =
          profileRecords(
            targetPatientId,
            'MAIN-2026-000087',
          );

        const candidate = {
          patient:
            sourceRecords.patient,
          primaryMrn:
            sourceRecords.identifiers[0]!,
          primaryContact:
            null,
          matchedBy: [
            'MRN',
          ],
          activeAlertCount:
            0,
          highestAlertSeverity:
            null,
        } satisfies PatientSearchCandidateRecord;

        const service =
          new PatientQueryService(
            {
              findSearchCandidates:
                vi.fn()
                  .mockResolvedValue([
                    candidate,
                  ]),
              loadProfile:
                vi.fn()
                  .mockResolvedValue(
                    targetRecords,
                  ),
            } as never,
            {
              resolve:
                vi.fn()
                  .mockResolvedValue({
                    requestedPatientId:
                      sourcePatientId,
                    canonicalPatientId:
                      targetPatientId,
                    canonicalEnterprisePatientId:
                      targetRecords.patient
                        .enterprisePatientId,
                    canonicalStatus:
                      'ACTIVE',
                    redirected:
                      true,
                    redirectPath: [
                      sourcePatientId,
                      targetPatientId,
                    ],
                  }),
            } as never,
            {
              recordPatientRead:
                vi.fn(),
            } as never,
            {
              clock: {
                now:
                  () => now,
              },
            },
          );

        const result =
          await service.search(
            {
              term:
                'MAIN-2026-000101',
              mode:
                'MRN',
              includeMerged:
                false,
              page:
                1,
              pageSize:
                20,
            },
            'STANDARD',
            actor,
          );

        expect(result.items).toEqual([
          expect.objectContaining({
            id:
              targetPatientId,
            mrn:
              'MAIN-2026-000087',
            redirectedFromPatientIds: [
              sourcePatientId,
            ],
          }),
        ]);
      },
    );

    it(
      'audits sensitive profile access after canonical resolution',
      async () => {
        const records =
          profileRecords(
            targetPatientId,
            'MAIN-2026-000087',
          );

        const recordPatientRead =
          vi.fn()
            .mockResolvedValue(
              undefined,
            );

        const service =
          new PatientQueryService(
            {
              loadProfile:
                vi.fn()
                  .mockResolvedValue(
                    records,
                  ),
            } as never,
            {
              resolve:
                vi.fn()
                  .mockResolvedValue({
                    requestedPatientId:
                      sourcePatientId,
                    canonicalPatientId:
                      targetPatientId,
                    canonicalEnterprisePatientId:
                      records.patient
                        .enterprisePatientId,
                    canonicalStatus:
                      'ACTIVE',
                    redirected:
                      true,
                    redirectPath: [
                      sourcePatientId,
                      targetPatientId,
                    ],
                  }),
            } as never,
            {
              recordPatientRead,
            } as never,
            {
              clock: {
                now:
                  () => now,
              },
            },
          );

        await service.getProfile(
          sourcePatientId,
          {
            includeInactiveContacts:
              false,
            includeInactiveAddresses:
              false,
            includeInactiveGuardians:
              false,
            includeResolvedAlerts:
              false,
          },
          'SENSITIVE',
          actor,
        );

        expect(
          recordPatientRead,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            patientId:
              sourcePatientId,
            canonicalPatientId:
              targetPatientId,
            redirected:
              true,
            resource:
              'PROFILE',
          }),
        );
      },
    );
  },
);