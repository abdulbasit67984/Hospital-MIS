import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  AllergyCatalogConflictError,
  ClinicalNoteVersionConflictError,
  DuplicateActiveEncounterError,
  DuplicateActivePatientAllergyError,
  EncounterNumberConflictError,
} from '../clinical-emr.errors.js';

import {
  buildActiveAllergyKey,
  buildActiveClinicalCodeKey,
  buildClinicalNoteNumberSequenceKey,
  buildEncounterNumberSequenceKey,
  buildPatientProblemNumberSequenceKey,
  clinicalEmrLockKey,
  formatClinicalNoteNumber,
  formatEncounterNumber,
  formatPatientProblemNumber,
  normalizeClinicalCode,
  normalizeClinicalSearchText,
} from '../clinical-emr.normalization.js';

import {
  mapClinicalEmrPersistenceError,
} from '../clinical-emr.persistence-errors.js';

import {
  CLINICAL_NOTE_CONTENT_SELECT,
  CLINICAL_NOTE_STANDARD_SELECT,
  CLINICAL_NOTE_VERSION_INTERNAL_SELECT,
  CLINICAL_NOTE_VERSION_STANDARD_SELECT,
  ENCOUNTER_INTERNAL_SELECT,
  ENCOUNTER_STANDARD_SELECT,
  PATIENT_ALLERGY_CONTENT_SELECT,
  PATIENT_ALLERGY_STANDARD_SELECT,
} from '../clinical-emr.projections.js';

import {
  createClinicalNoteBodySchema,
  createEncounterBodySchema,
  recordPatientAllergyBodySchema,
  updatePatientProblemBodySchema,
} from '../clinical-emr.validation.js';

function objectId(
  digit: string,
): string {
  return digit.repeat(24);
}

describe(
  'Clinical EMR domain infrastructure',
  () => {
    it(
      'validates strict OPD encounter linkage and care-context consistency',
      () => {
        const invalid =
          createEncounterBodySchema.safeParse({
            patientId:
              objectId('1'),

            encounterType:
              'OPD',

            careContext:
              'OPD_VISIT',

            serviceDate:
              '2026-07-18',

            departmentId:
              objectId('2'),

            primaryProviderId:
              objectId('3'),

            assignedProviderIds:
              [],

            confidentiality:
              'ROUTINE',
          });

        expect(
          invalid.success,
        ).toBe(false);

        if (invalid.success) {
          throw new Error(
            'Expected OPD linkage validation to fail',
          );
        }

        expect(
          invalid.error.issues.some(
            (issue) =>
              issue.path.join('.') === 'opdVisitId',
          ),
        ).toBe(true);

        const valid =
          createEncounterBodySchema.safeParse({
            patientId:
              objectId('1'),

            registrationId:
              objectId('4'),

            opdVisitId:
              objectId('5'),

            queueTokenId:
              objectId('6'),

            encounterType:
              'OPD',

            careContext:
              'OPD_VISIT',

            serviceDate:
              '2026-07-18',

            departmentId:
              objectId('2'),

            primaryProviderId:
              objectId('3'),

            assignedProviderIds: [
              objectId('3'),
            ],

            confidentiality:
              'ROUTINE',
          });

        expect(
          valid.success,
        ).toBe(true);
      },
    );

    it(
      'requires clinical content and a reason for restricted documentation',
      () => {
        const missingContent =
          createClinicalNoteBodySchema.safeParse({
            encounterId:
              objectId('1'),

            documentType:
              'GENERAL_CLINICAL_NOTE',

            authorProviderId:
              objectId('2'),

            confidentiality:
              'ROUTINE',
          });

        expect(
          missingContent.success,
        ).toBe(false);

        const missingRestrictionReason =
          createClinicalNoteBodySchema.safeParse({
            encounterId:
              objectId('1'),

            documentType:
              'GENERAL_CLINICAL_NOTE',

            authorProviderId:
              objectId('2'),

            narrativeText:
              'Restricted clinical content',

            confidentiality:
              'RESTRICTED',
          });

        expect(
          missingRestrictionReason.success,
        ).toBe(false);

        const valid =
          createClinicalNoteBodySchema.safeParse({
            encounterId:
              objectId('1'),

            documentType:
              'GENERAL_CLINICAL_NOTE',

            authorProviderId:
              objectId('2'),

            narrativeText:
              'Restricted clinical content',

            confidentiality:
              'RESTRICTED',

            restrictionReason:
              'Specialty care team access only',
          });

        expect(
          valid.success,
        ).toBe(true);
      },
    );

    it(
      'rejects reaction details on no-known-allergy declarations',
      () => {
        const result =
          recordPatientAllergyBodySchema.safeParse({
            patientId:
              objectId('1'),

            recordType:
              'NO_KNOWN_ALLERGIES',

            category:
              'OTHER',

            allergenText:
              'No known allergies',

            verificationStatus:
              'CONFIRMED',

            severity:
              'MILD',

            reactions: [
              {
                manifestation:
                  'Rash',

                severity:
                  'MILD',
              },
            ],
          });

        expect(
          result.success,
        ).toBe(false);

        if (result.success) {
          throw new Error(
            'Expected no-known-allergy validation to fail',
          );
        }

        expect(
          result.error.issues.map(
            (issue) => issue.path.join('.'),
          ),
        ).toEqual(
          expect.arrayContaining([
            'reactions',
            'severity',
          ]),
        );
      },
    );

    it(
      'requires resolution attribution for resolved problem-list entries',
      () => {
        expect(
          updatePatientProblemBodySchema.safeParse({
            expectedVersion:
              0,

            status:
              'RESOLVED',
          }).success,
        ).toBe(false);

        expect(
          updatePatientProblemBodySchema.safeParse({
            expectedVersion:
              0,

            status:
              'RESOLVED',

            resolvedAt:
              '2026-07-18T10:00:00+05:00',
          }).success,
        ).toBe(true);
      },
    );

    it(
      'normalizes clinical codes, keys, locks, and document numbers deterministically',
      () => {
        expect(
          normalizeClinicalCode(
            '  i10  ',
          ),
        ).toBe('I10');

        expect(
          normalizeClinicalSearchText(
            '  Essential   Hypertension ',
          ),
        ).toBe('essential hypertension');

        expect(
          buildActiveClinicalCodeKey(
            'icd_10',
            ' i10 ',
          ),
        ).toBe('ICD_10:I10');

        expect(
          buildActiveAllergyKey(
            'allergy',
            'medication',
            '  Penicillin  ',
          ),
        ).toBe('ALLERGY:MEDICATION:penicillin');

        expect(
          buildEncounterNumberSequenceKey(
            '2026-07-18',
          ),
        ).toBe('clinical.encounter.number.2026');

        expect(
          buildClinicalNoteNumberSequenceKey(
            '2026-07-18',
          ),
        ).toBe('clinical.note.number.2026');

        expect(
          buildPatientProblemNumberSequenceKey(
            '2026-07-18',
          ),
        ).toBe('clinical.problem.number.2026');

        expect(
          formatEncounterNumber(
            'kh-01',
            '2026-07-18',
            42,
            6,
          ),
        ).toBe('ENC-KH01-2026-000042');

        expect(
          formatClinicalNoteNumber(
            'kh-01',
            '2026-07-18',
            42,
            7,
          ),
        ).toBe('CLN-KH01-2026-0000042');

        expect(
          formatPatientProblemNumber(
            'kh-01',
            '2026-07-18',
            42,
            7,
          ),
        ).toBe('PRB-KH01-2026-0000042');

        expect(
          clinicalEmrLockKey(
            'clinical-emr:encounter',
            objectId('1'),
            objectId('2'),
            '2026-07-18',
          ),
        ).toBe(
          `clinical-emr:encounter:${objectId('1')}:${objectId('2')}:2026-07-18`,
        );
      },
    );

    it(
      'keeps sensitive clinical fields out of standard projections',
      () => {
        expect(
          ENCOUNTER_STANDARD_SELECT,
        ).not.toContain('restrictionReason');

        expect(
          ENCOUNTER_INTERNAL_SELECT,
        ).toContain('+restrictionReason');

        expect(
          CLINICAL_NOTE_STANDARD_SELECT,
        ).not.toContain('narrativeText');

        expect(
          CLINICAL_NOTE_CONTENT_SELECT,
        ).toContain('+narrativeText');

        expect(
          CLINICAL_NOTE_VERSION_STANDARD_SELECT,
        ).not.toContain('encryptedSnapshot');

        expect(
          CLINICAL_NOTE_VERSION_INTERNAL_SELECT,
        ).toContain('+encryptedSnapshot');

        expect(
          PATIENT_ALLERGY_STANDARD_SELECT,
        ).not.toContain('reactions');

        expect(
          PATIENT_ALLERGY_CONTENT_SELECT,
        ).toContain('+reactions');
      },
    );

    it(
      'maps MongoDB duplicate-key conflicts to stable clinical domain errors',
      () => {
        expect(
          mapClinicalEmrPersistenceError(
            {
              code: 11000,
              keyPattern: {
                facilityId: 1,
                encounterNumber: 1,
              },
            },
            'CREATE_ENCOUNTER',
          ),
        ).toBeInstanceOf(
          EncounterNumberConflictError,
        );

        expect(
          mapClinicalEmrPersistenceError(
            {
              code: 11000,
              message:
                'duplicate key index uq_encounters_facility_active_context',
            },
            'CREATE_ENCOUNTER',
          ),
        ).toBeInstanceOf(
          DuplicateActiveEncounterError,
        );

        expect(
          mapClinicalEmrPersistenceError(
            {
              code: 11000,
              message:
                'duplicate key index uq_clinical_note_versions_note_version',
            },
            'CREATE_CLINICAL_NOTE_VERSION',
          ),
        ).toBeInstanceOf(
          ClinicalNoteVersionConflictError,
        );

        expect(
          mapClinicalEmrPersistenceError(
            {
              code: 11000,
              message:
                'duplicate key index uq_allergies_facility_category_name',
            },
            'CREATE_ALLERGY',
          ),
        ).toBeInstanceOf(
          AllergyCatalogConflictError,
        );

        expect(
          mapClinicalEmrPersistenceError(
            {
              code: 11000,
              message:
                'duplicate key index uq_patient_allergies_active_key',
            },
            'CREATE_PATIENT_ALLERGY',
          ),
        ).toBeInstanceOf(
          DuplicateActivePatientAllergyError,
        );
      },
    );
  },
);