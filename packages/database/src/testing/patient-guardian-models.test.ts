import {
  describe,
  expect,
  it,
} from 'vitest';

import type {
  IndexDefinition,
} from 'mongoose';

import {
  GuardianModel,
  PatientAddressModel,
  PatientAlertModel,
  PatientContactModel,
  PatientGuardianModel,
  PatientIdentifierModel,
  PatientModel,
  createObjectId,
  registerAllModels,
} from '../index.js';

type ModelIndexes = ReturnType<
  typeof PatientModel.schema.indexes
>;

function containsFields(
  definition: IndexDefinition,
  fields: readonly string[],
): boolean {
  const keys = Object.keys(definition);

  return (
    keys.length === fields.length &&
    fields.every(
      (field, index) => keys[index] === field,
    )
  );
}

function hasUniqueIndex(
  indexes: ModelIndexes,
  fields: readonly string[],
): boolean {
  return indexes.some(
    ([definition, options]) =>
      options.unique === true &&
      containsFields(definition, fields),
  );
}

describe(
  'patient and guardian persistence models',
  () => {
    it(
      'registers all dedicated patient and guardian models',
      () => {
        const models = registerAllModels();

        expect(models['patients']).toBeDefined();
        expect(
          models['patientIdentifiers'],
        ).toBeDefined();
        expect(models['guardians']).toBeDefined();
        expect(
          models['patientGuardians'],
        ).toBeDefined();
        expect(
          models['patientContacts'],
        ).toBeDefined();
        expect(
          models['patientAddresses'],
        ).toBeDefined();
        expect(
          models['patientAlerts'],
        ).toBeDefined();
      },
    );

    it(
      'defines patient identity and guardian uniqueness boundaries',
      () => {
        expect(
          hasUniqueIndex(
            PatientModel.schema.indexes(),
            [
              'enterprisePatientId',
            ],
          ),
        ).toBe(true);

        expect(
          hasUniqueIndex(
            PatientIdentifierModel.schema.indexes(),
            [
              'scope',
              'identifierType',
              'issuingFacilityId',
              'normalizedValue',
            ],
          ),
        ).toBe(true);

        expect(
          hasUniqueIndex(
            GuardianModel.schema.indexes(),
            [
              'facilityId',
              'cnicNormalized',
            ],
          ),
        ).toBe(true);

        expect(
          hasUniqueIndex(
            PatientGuardianModel.schema.indexes(),
            [
              'facilityId',
              'patientId',
              'isPrimary',
            ],
          ),
        ).toBe(true);
      },
    );

    it(
      'requires minors to use the mandatory guardian state',
      async () => {
        const patient = new PatientModel({
          facilityId: createObjectId(),
          firstName: 'Ayesha',
          lastName: 'Khan',
          birthDate: {
            value: new Date(
              '2015-04-02T00:00:00.000Z',
            ),
            precision: 'EXACT',
            isApproximate: false,
            estimatedAgeYears: null,
            estimatedAsOfDate: null,
          },
          isMinor: true,
          guardianRequirement: 'NOT_REQUIRED',
          sexAtBirth: 'FEMALE',
          genderIdentity: 'NOT_DISCLOSED',
        });

        await expect(
          patient.validate(),
        ).rejects.toMatchObject({
          errors: {
            guardianRequirement:
              expect.anything(),
          },
        });
      },
    );

    it(
      'keeps patient merge status and state synchronized',
      async () => {
        const patient = new PatientModel({
          facilityId: createObjectId(),
          firstName: 'Zainab',
          birthDate: {
            value: new Date(
              '1990-01-01T00:00:00.000Z',
            ),
            precision: 'EXACT',
            isApproximate: false,
            estimatedAgeYears: null,
            estimatedAsOfDate: null,
          },
          isMinor: false,
          guardianRequirement: 'NOT_REQUIRED',
          sexAtBirth: 'FEMALE',
          genderIdentity: 'NOT_DISCLOSED',
          status: 'ACTIVE',
          mergeState: 'MERGED',
          mergedIntoPatientId:
            createObjectId(),
          mergedAt: new Date(),
          mergedBy: createObjectId(),
        });

        await expect(
          patient.validate(),
        ).rejects.toMatchObject({
          errors: {
            mergeState: expect.anything(),
          },
        });
      },
    );

    it(
      'enforces identifier scope and Pakistan identity formats',
      async () => {
        const invalidEnterpriseMrn =
          new PatientIdentifierModel({
            facilityId: createObjectId(),
            patientId: createObjectId(),
            issuingFacilityId: null,
            identifierType: 'MRN',
            scope: 'ENTERPRISE',
            normalizedValue:
              'MAIN-2026-000001',
            displayValue:
              'MAIN-2026-000001',
            isPrimaryMrn: true,
          });

        await expect(
          invalidEnterpriseMrn.validate(),
        ).rejects.toMatchObject({
          errors: {
            scope: expect.anything(),
          },
        });

        const invalidCnic =
          new PatientIdentifierModel({
            facilityId: createObjectId(),
            patientId: createObjectId(),
            issuingFacilityId: null,
            identifierType: 'CNIC',
            scope: 'ENTERPRISE',
            normalizedValue:
              '12345-1234567-1',
            displayValue:
              '*********5671',
          });

        await expect(
          invalidCnic.validate(),
        ).rejects.toMatchObject({
          errors: {
            normalizedValue:
              expect.anything(),
          },
        });
      },
    );

    it(
      'requires verified legal authority to retain verification metadata',
      async () => {
        const relationship =
          new PatientGuardianModel({
            facilityId: createObjectId(),
            patientId: createObjectId(),
            guardianId: createObjectId(),
            relationshipType:
              'LEGAL_GUARDIAN',
            legalAuthorityStatus:
              'VERIFIED',
            verificationStatus:
              'UNVERIFIED',
            canConsentToTreatment: true,
          });

        await expect(
          relationship.validate(),
        ).rejects.toMatchObject({
          errors: {
            verificationStatus:
              expect.anything(),
            verifiedAt: expect.anything(),
            verifiedBy: expect.anything(),
          },
        });
      },
    );

    it(
      'excludes sensitive search and detail fields from ordinary queries',
      () => {
        expect(
          PatientIdentifierModel.schema.path(
            'normalizedValue',
          ).options.select,
        ).toBe(false);

        expect(
          GuardianModel.schema.path(
            'cnicNormalized',
          ).options.select,
        ).toBe(false);

        expect(
          PatientContactModel.schema.path(
            'normalizedValue',
          ).options.select,
        ).toBe(false);

        expect(
          PatientAddressModel.schema.path(
            'line1',
          ).options.select,
        ).toBe(false);

        expect(
          PatientAlertModel.schema.path(
            'details',
          ).options.select,
        ).toBe(false);
      },
    );
  },
);