import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  GuardianModel,
  PatientAddressModel,
  PatientAlertModel,
  PatientContactModel,
  PatientGuardianModel,
  PatientIdentifierModel,
  PatientModel,
  collectionSpecs,
  criticalSchemas,
  patientGuardianSchemas,
  schemaForCollection,
} from '../index.js';

import {
  patientGuardianCollections,
  patientGuardianFoundation,
  patientGuardianValidators,
} from '../migrations/009-patient-guardian-foundation.js';

import {
  migrations,
} from '../migrations/index.js';

function jsonSchema(
  collection: (typeof patientGuardianCollections)[number],
): Record<string, unknown> {
  return patientGuardianValidators[
    collection
  ]['$jsonSchema'] as Record<string, unknown>;
}

function indexNames(
  indexes: ReturnType<
    typeof PatientModel.schema.indexes
  >,
): string[] {
  return indexes
    .map(([, options]) => options.name)
    .filter(
      (name): name is string =>
        typeof name === 'string',
    );
}

describe(
  'Phase 4 patient and guardian persistence foundation',
  () => {
    it(
      'uses the existing patient collection catalog specifications',
      () => {
        const byName = new Map(
          collectionSpecs.map(
            (specification) => [
              specification.name,
              specification,
            ],
          ),
        );

        for (
          const collection of
          patientGuardianCollections
        ) {
          expect(
            byName.get(collection)?.domain,
          ).toBe('patient');

          expect(
            byName.get(collection)
              ?.facilityScoped,
          ).toBe(true);
        }
      },
    );

    it(
      'registers every dedicated schema in the central registry',
      () => {
        expect(
          patientGuardianSchemas.patients,
        ).toBe(PatientModel.schema);

        expect(
          patientGuardianSchemas
            .patientIdentifiers,
        ).toBe(
          PatientIdentifierModel.schema,
        );

        expect(
          patientGuardianSchemas.guardians,
        ).toBe(GuardianModel.schema);

        expect(
          patientGuardianSchemas
            .patientGuardians,
        ).toBe(
          PatientGuardianModel.schema,
        );

        expect(
          patientGuardianSchemas
            .patientContacts,
        ).toBe(
          PatientContactModel.schema,
        );

        expect(
          patientGuardianSchemas
            .patientAddresses,
        ).toBe(
          PatientAddressModel.schema,
        );

        expect(
          patientGuardianSchemas
            .patientAlerts,
        ).toBe(PatientAlertModel.schema);

        for (
          const collection of
          patientGuardianCollections
        ) {
          expect(
            schemaForCollection(collection),
          ).toBe(
            patientGuardianSchemas[
              collection
            ],
          );
        }
      },
    );

    it(
      'keeps critical patient schemas aligned with the dedicated models',
      () => {
        expect(
          criticalSchemas.patients,
        ).toBe(PatientModel.schema);

        expect(
          criticalSchemas
            .patientIdentifiers,
        ).toBe(
          PatientIdentifierModel.schema,
        );
      },
    );

    it(
      'defines required duplicate-prevention and primary-guardian indexes',
      () => {
        expect(
          indexNames(
            PatientModel.schema.indexes(),
          ),
        ).toContain(
          'uq_patients_enterprise_patient_id',
        );

        expect(
          indexNames(
            PatientIdentifierModel.schema.indexes(),
          ),
        ).toContain(
          'uq_patient_identifiers_active_scope_type_facility_value',
        );

        expect(
          indexNames(
            PatientGuardianModel.schema.indexes(),
          ),
        ).toContain(
          'uq_patient_guardians_active_primary',
        );

        expect(
          indexNames(
            PatientContactModel.schema.indexes(),
          ),
        ).toContain(
          'ix_patient_contacts_facility_type_value_status',
        );
      },
    );

    it(
      'registers migration 009 with strict validators for every collection',
      () => {
        expect(
          migrations.at(-1),
        ).toBe(patientGuardianFoundation);

        expect(
          patientGuardianFoundation.id,
        ).toBe(
          '009-patient-guardian-foundation',
        );

        for (
          const collection of
          patientGuardianCollections
        ) {
          expect(
            jsonSchema(collection),
          ).toHaveProperty(
            'bsonType',
            'object',
          );
        }
      },
    );

    it(
      'requires patient identity, guardian authority, and concurrency metadata',
      () => {
        expect(
          jsonSchema('patients')[
            'required'
          ],
        ).toEqual(
          expect.arrayContaining([
            'facilityId',
            'enterprisePatientId',
            'birthDate',
            'guardianRequirement',
            'status',
            'mergeState',
            'version',
          ]),
        );

        expect(
          jsonSchema(
            'patientIdentifiers',
          )['required'],
        ).toEqual(
          expect.arrayContaining([
            'patientId',
            'identifierType',
            'scope',
            'normalizedValue',
            'status',
            'version',
          ]),
        );

        expect(
          jsonSchema(
            'patientGuardians',
          )['required'],
        ).toEqual(
          expect.arrayContaining([
            'patientId',
            'guardianId',
            'legalAuthorityStatus',
            'verificationStatus',
            'isActive',
            'version',
          ]),
        );
      },
    );
  },
);