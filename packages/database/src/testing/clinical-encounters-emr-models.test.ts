import {
  randomUUID,
} from 'node:crypto';

import {
  ObjectId,
} from 'mongodb';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  AllergyModel,
  ClinicalNoteModel,
  ClinicalNoteVersionModel,
  DiagnosisModel,
  EncounterDiagnosisModel,
  EncounterModel,
  EncounterStatusHistoryModel,
  PatientAllergyModel,
  PatientAllergyVersionModel,
  PatientProblemModel,
  PatientProblemVersionModel,
  clinicalEmrSchemas,
  collectionSpecs,
  schemaForCollection,
} from '../index.js';

import {
  clinicalEmrCollections,
  clinicalEmrValidators,
} from '../migrations/012-clinical-encounters-emr-foundation.js';

import {
  migrations,
} from '../migrations/index.js';

function indexNames(
  indexes:
    ReturnType<
      typeof EncounterModel.schema.indexes
    >,
): string[] {
  return indexes
    .map(
      ([, options]) =>
        options.name,
    )
    .filter(
      (name): name is string =>
        typeof name === 'string',
    );
}

function actorFields(
  actorId:
    ObjectId,
) {
  return {
    createdBy:
      actorId,

    updatedBy:
      actorId,
  };
}

function encryptedSnapshot() {
  return {
    algorithm:
      'AES-256-GCM' as const,

    keyVersion:
      'clinical-key-v1',

    initializationVector:
      '0123456789abcdef01234567',

    authenticationTag:
      '0123456789abcdef0123456789abcdef',

    ciphertext:
      'encrypted-clinical-payload',
  };
}

describe(
  'Clinical encounters and EMR persistence foundation',
  () => {
    it(
      'catalogs and registers every dedicated clinical EMR collection',
      () => {
        const specs =
          new Map(
            collectionSpecs.map(
              (spec) => [
                spec.name,
                spec,
              ],
            ),
          );

        for (
          const collection of
          clinicalEmrCollections
        ) {
          expect(
            specs.get(
              collection,
            )?.domain,
          ).toBe(
            'clinical',
          );

          expect(
            specs.get(
              collection,
            )?.facilityScoped,
          ).toBe(
            true,
          );

          expect(
            schemaForCollection(
              collection,
            ),
          ).toBe(
            clinicalEmrSchemas[
              collection
            ],
          );

          expect(
            clinicalEmrValidators[
              collection
            ],
          ).toHaveProperty(
            '$jsonSchema',
          );
        }

        for (
          const immutableCollection of
          [
            'encounterStatusHistories',
            'clinicalNoteVersions',
            'patientProblemVersions',
            'patientAllergyVersions',
          ] as const
        ) {
          expect(
            specs.get(
              immutableCollection,
            )?.retention,
          ).toBe(
            'immutable',
          );
        }
      },
    );

    it(
      'registers the clinical migration after registration and queue persistence',
      () => {
        expect(
          migrations.at(
            -1,
          )?.id,
        ).toBe(
          '012-clinical-encounters-emr-foundation',
        );
      },
    );

    it(
      'defines facility, concurrency, append-only, and longitudinal-read indexes',
      () => {
        expect(
          indexNames(
            EncounterModel.schema.indexes(),
          ),
        ).toEqual(
          expect.arrayContaining([
            'uq_encounters_facility_number',
            'uq_encounters_facility_opd_visit',
            'uq_encounters_facility_active_context',
            'ix_encounters_facility_patient_started',
            'ix_encounters_facility_owner_status_date',
          ]),
        );

        expect(
          indexNames(
            EncounterStatusHistoryModel.schema.indexes(),
          ),
        ).toContain(
          'uq_encounter_status_histories_sequence',
        );

        expect(
          indexNames(
            ClinicalNoteModel.schema.indexes(),
          ),
        ).toContain(
          'uq_clinical_notes_facility_number',
        );

        expect(
          indexNames(
            ClinicalNoteVersionModel.schema.indexes(),
          ),
        ).toContain(
          'uq_clinical_note_versions_note_version',
        );

        expect(
          indexNames(
            DiagnosisModel.schema.indexes(),
          ),
        ).toContain(
          'uq_diagnoses_facility_system_code',
        );

        expect(
          indexNames(
            EncounterDiagnosisModel.schema.indexes(),
          ),
        ).toContain(
          'uq_encounter_diagnoses_active_code',
        );

        expect(
          indexNames(
            PatientProblemModel.schema.indexes(),
          ),
        ).toContain(
          'uq_patient_problems_active_code',
        );

        expect(
          indexNames(
            PatientProblemVersionModel.schema.indexes(),
          ),
        ).toContain(
          'uq_patient_problem_versions_problem_version',
        );

        expect(
          indexNames(
            AllergyModel.schema.indexes(),
          ),
        ).toContain(
          'uq_allergies_facility_code',
        );

        expect(
          indexNames(
            PatientAllergyModel.schema.indexes(),
          ),
        ).toContain(
          'uq_patient_allergies_active_key',
        );

        expect(
          indexNames(
            PatientAllergyVersionModel.schema.indexes(),
          ),
        ).toContain(
          'uq_patient_allergy_versions_allergy_version',
        );
      },
    );

    it(
      'requires strict OPD linkage and derives an active encounter context key',
      async () => {
        const facilityId =
          new ObjectId();

        const actorId =
          new ObjectId();

        const patientId =
          new ObjectId();

        const providerId =
          new ObjectId();

        const registrationId =
          new ObjectId();

        const opdVisitId =
          new ObjectId();

        const departmentId =
          new ObjectId();

        const now =
          new Date();

        const encounter =
          new EncounterModel({
            facilityId,
            encounterNumber:
              'ENC-2026-000001',
            patientId,
            requestedPatientId:
              patientId,
            canonicalRedirected:
              false,
            registrationId,
            opdVisitId,
            encounterType:
              'OPD',
            careContext:
              'OPD_VISIT',
            status:
              'IN_PROGRESS',
            serviceDate:
              '2026-07-18',
            departmentId,
            primaryProviderId:
              providerId,
            currentOwnerId:
              providerId,
            currentOwnerRole:
              'PRIMARY_PROVIDER',
            assignedProviderIds:
              [],
            confidentiality:
              'ROUTINE',
            startedAt:
              now,
            lastClinicalActivityAt:
              now,
            transactionId:
              randomUUID(),
            correlationId:
              randomUUID(),
            ...actorFields(
              actorId,
            ),
          });

        await expect(
          encounter.validate(),
        ).resolves.toBeUndefined();

        expect(
          encounter.activeContextKey,
        ).toBe(
          `opd:${opdVisitId.toHexString()}`,
        );

        expect(
          encounter.assignedProviderIds.map(
            String,
          ),
        ).toEqual([
          providerId.toHexString(),
        ]);

        encounter.opdVisitId =
          null;

        await expect(
          encounter.validate(),
        ).rejects.toThrow(
          'OPD encounters require both registrationId and opdVisitId',
        );
      },
    );

    it(
      'requires encrypted immutable snapshots for finalized clinical history',
      async () => {
        const facilityId =
          new ObjectId();

        const actorId =
          new ObjectId();

        const patientId =
          new ObjectId();

        const providerId =
          new ObjectId();

        const encounterId =
          new ObjectId();

        const clinicalNoteId =
          new ObjectId();

        const recordedAt =
          new Date();

        const version =
          new ClinicalNoteVersionModel({
            facilityId,
            clinicalNoteId,
            encounterId,
            patientId,
            versionNumber:
              1,
            changeType:
              'FINALIZED',
            statusSnapshot:
              'FINAL',
            documentTypeSnapshot:
              'GENERAL_CLINICAL_NOTE',
            confidentialitySnapshot:
              'RESTRICTED',
            encryptedSnapshot:
              encryptedSnapshot(),
            snapshotHash:
              'a'.repeat(
                64,
              ),
            contentHash:
              'b'.repeat(
                64,
              ),
            authorProviderId:
              providerId,
            recordedAt,
            recordedBy:
              actorId,
            transactionId:
              randomUUID(),
            correlationId:
              randomUUID(),
            ...actorFields(
              actorId,
            ),
          });

        await expect(
          version.validate(),
        ).resolves.toBeUndefined();

        expect(
          version.encryptedSnapshot.algorithm,
        ).toBe(
          'AES-256-GCM',
        );

        version.versionNumber =
          2;

        await expect(
          version.validate(),
        ).rejects.toThrow(
          'Subsequent note versions require previousVersionId',
        );
      },
    );

    it(
      'enforces safe no-known-allergy declarations and derives active allergy keys',
      async () => {
        const facilityId =
          new ObjectId();

        const actorId =
          new ObjectId();

        const patientId =
          new ObjectId();

        const now =
          new Date();

        const declaration =
          new PatientAllergyModel({
            facilityId,
            patientId,
            recordType:
              'NO_KNOWN_ALLERGIES',
            category:
              'OTHER',
            allergenText:
              'No known allergies',
            status:
              'ACTIVE',
            verificationStatus:
              'CONFIRMED',
            severity:
              'UNKNOWN',
            reactions:
              [],
            recordedAt:
              now,
            recordedBy:
              actorId,
            verifiedAt:
              now,
            verifiedBy:
              actorId,
            transactionId:
              randomUUID(),
            correlationId:
              randomUUID(),
            ...actorFields(
              actorId,
            ),
          });

        await expect(
          declaration.validate(),
        ).resolves.toBeUndefined();

        expect(
          declaration.activeAllergyKey,
        ).toBe(
          'NO_KNOWN_ALLERGIES:OTHER:no known allergies',
        );

        declaration.reactions = [
          {
            manifestation:
              'Rash',

            severity:
              'MILD',

            occurredAt:
              null,

            notes:
              null,
          },
        ];

        await expect(
          declaration.validate(),
        ).rejects.toThrow(
          'No-known-allergy declarations cannot reference an allergen, reactions, or severity',
        );
      },
    );

    it(
      'derives active problem keys without overwriting versioned clinical history',
      async () => {
        const facilityId =
          new ObjectId();

        const actorId =
          new ObjectId();

        const patientId =
          new ObjectId();

        const encounterId =
          new ObjectId();

        const problem =
          new PatientProblemModel({
            facilityId,
            problemNumber:
              'PRB-2026-0000001',
            patientId,
            sourceEncounterId:
              encounterId,
            codeSystem:
              'ICD_10',
            code:
              'I10',
            normalizedCode:
              'I10',
            display:
              'Essential hypertension',
            status:
              'ACTIVE',
            currentVersion:
              1,
            recordedAt:
              new Date(),
            recordedBy:
              actorId,
            transactionId:
              randomUUID(),
            correlationId:
              randomUUID(),
            ...actorFields(
              actorId,
            ),
          });

        await expect(
          problem.validate(),
        ).resolves.toBeUndefined();

        expect(
          problem.activeProblemKey,
        ).toBe(
          'ICD_10:I10',
        );
      },
    );
  },
);