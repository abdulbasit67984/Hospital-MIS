import {
  AllergyCatalogConflictError,
  ClinicalNoteNumberConflictError,
  ClinicalNoteVersionConflictError,
  DiagnosisCodeConflictError,
  DuplicateActiveEncounterDiagnosisError,
  DuplicateActiveEncounterError,
  DuplicateActivePatientAllergyError,
  DuplicateActivePatientProblemError,
  EncounterNumberConflictError,
  EncounterStatusHistorySequenceConflictError,
  PatientAllergyVersionConflictError,
  PatientProblemNumberConflictError,
  PatientProblemVersionConflictError,
} from './clinical-emr.errors.js';

interface MongoLikeError {
  code?: unknown;
  keyPattern?: Record<string, unknown>;
  keyValue?: Record<string, unknown>;
  message?: unknown;
  cause?: unknown;
}

export type ClinicalEmrPersistenceOperation =
  | 'CREATE_ENCOUNTER'
  | 'CREATE_ENCOUNTER_HISTORY'
  | 'CREATE_CLINICAL_NOTE'
  | 'CREATE_CLINICAL_NOTE_VERSION'
  | 'CREATE_DIAGNOSIS'
  | 'CREATE_ENCOUNTER_DIAGNOSIS'
  | 'CREATE_PATIENT_PROBLEM'
  | 'CREATE_PATIENT_PROBLEM_VERSION'
  | 'CREATE_ALLERGY'
  | 'CREATE_PATIENT_ALLERGY'
  | 'CREATE_PATIENT_ALLERGY_VERSION';

function asMongoLikeError(
  error: unknown,
): MongoLikeError | null {
  if (
    error === null ||
    typeof error !== 'object'
  ) {
    return null;
  }

  return error as MongoLikeError;
}

function findDuplicateKeyError(
  error: unknown,
  depth = 0,
): MongoLikeError | null {
  if (depth > 5) {
    return null;
  }

  const candidate =
    asMongoLikeError(error);

  if (candidate === null) {
    return null;
  }

  if (candidate.code === 11000) {
    return candidate;
  }

  return candidate.cause === undefined
    ? null
    : findDuplicateKeyError(
        candidate.cause,
        depth + 1,
      );
}

function duplicateFields(
  error: MongoLikeError,
): Set<string> {
  return new Set(
    Object.keys(
      error.keyPattern ??
      error.keyValue ??
      {},
    ),
  );
}

function messageContains(
  error: MongoLikeError,
  value: string,
): boolean {
  return (
    typeof error.message === 'string' &&
    error.message.includes(value)
  );
}

function hasFields(
  fields: ReadonlySet<string>,
  ...required: readonly string[]
): boolean {
  return required.every(
    (field) => fields.has(field),
  );
}

export function isClinicalEmrDuplicateKeyError(
  error: unknown,
): boolean {
  return findDuplicateKeyError(error) !== null;
}

export function mapClinicalEmrPersistenceError(
  error: unknown,
  operation: ClinicalEmrPersistenceOperation,
): Error {
  const duplicateError =
    findDuplicateKeyError(error);

  if (duplicateError === null) {
    return error instanceof Error
      ? error
      : new Error(
          'Unknown clinical EMR persistence error',
          {
            cause: error,
          },
        );
  }

  const fields =
    duplicateFields(duplicateError);

  if (
    operation === 'CREATE_ENCOUNTER' &&
    (
      hasFields(
        fields,
        'facilityId',
        'encounterNumber',
      ) ||
      messageContains(
        duplicateError,
        'uq_encounters_facility_number',
      )
    )
  ) {
    return new EncounterNumberConflictError();
  }

  if (
    operation === 'CREATE_ENCOUNTER' &&
    (
      hasFields(
        fields,
        'facilityId',
        'opdVisitId',
      ) ||
      hasFields(
        fields,
        'facilityId',
        'activeContextKey',
      ) ||
      messageContains(
        duplicateError,
        'uq_encounters_facility_opd_visit',
      ) ||
      messageContains(
        duplicateError,
        'uq_encounters_facility_active_context',
      )
    )
  ) {
    return new DuplicateActiveEncounterError();
  }

  if (
    operation === 'CREATE_ENCOUNTER_HISTORY' &&
    (
      hasFields(
        fields,
        'facilityId',
        'encounterId',
        'sequence',
      ) ||
      messageContains(
        duplicateError,
        'uq_encounter_status_histories_sequence',
      )
    )
  ) {
    return new EncounterStatusHistorySequenceConflictError();
  }

  if (
    operation === 'CREATE_CLINICAL_NOTE' &&
    (
      hasFields(
        fields,
        'facilityId',
        'noteNumber',
      ) ||
      messageContains(
        duplicateError,
        'uq_clinical_notes_facility_number',
      )
    )
  ) {
    return new ClinicalNoteNumberConflictError();
  }

  if (
    operation === 'CREATE_CLINICAL_NOTE_VERSION' &&
    (
      hasFields(
        fields,
        'facilityId',
        'clinicalNoteId',
        'versionNumber',
      ) ||
      messageContains(
        duplicateError,
        'uq_clinical_note_versions_note_version',
      )
    )
  ) {
    return new ClinicalNoteVersionConflictError();
  }

  if (
    operation === 'CREATE_DIAGNOSIS' &&
    (
      hasFields(
        fields,
        'facilityId',
        'codeSystem',
        'normalizedCode',
      ) ||
      messageContains(
        duplicateError,
        'uq_diagnoses_facility_system_code',
      )
    )
  ) {
    return new DiagnosisCodeConflictError();
  }

  if (
    operation === 'CREATE_ENCOUNTER_DIAGNOSIS' &&
    (
      hasFields(
        fields,
        'facilityId',
        'encounterId',
        'activeDiagnosisKey',
      ) ||
      messageContains(
        duplicateError,
        'uq_encounter_diagnoses_active_code',
      )
    )
  ) {
    return new DuplicateActiveEncounterDiagnosisError();
  }

  if (
    operation === 'CREATE_PATIENT_PROBLEM' &&
    (
      hasFields(
        fields,
        'facilityId',
        'problemNumber',
      ) ||
      messageContains(
        duplicateError,
        'uq_patient_problems_facility_number',
      )
    )
  ) {
    return new PatientProblemNumberConflictError();
  }

  if (
    operation === 'CREATE_PATIENT_PROBLEM' &&
    (
      hasFields(
        fields,
        'facilityId',
        'patientId',
        'activeProblemKey',
      ) ||
      messageContains(
        duplicateError,
        'uq_patient_problems_active_code',
      )
    )
  ) {
    return new DuplicateActivePatientProblemError();
  }

  if (
    operation === 'CREATE_PATIENT_PROBLEM_VERSION' &&
    (
      hasFields(
        fields,
        'facilityId',
        'patientProblemId',
        'versionNumber',
      ) ||
      messageContains(
        duplicateError,
        'uq_patient_problem_versions_problem_version',
      )
    )
  ) {
    return new PatientProblemVersionConflictError();
  }

  if (
    operation === 'CREATE_ALLERGY' &&
    (
      hasFields(
        fields,
        'facilityId',
        'code',
      ) ||
      hasFields(
        fields,
        'facilityId',
        'category',
        'normalizedName',
      ) ||
      messageContains(
        duplicateError,
        'uq_allergies_facility_code',
      ) ||
      messageContains(
        duplicateError,
        'uq_allergies_facility_category_name',
      )
    )
  ) {
    return new AllergyCatalogConflictError();
  }

  if (
    operation === 'CREATE_PATIENT_ALLERGY' &&
    (
      hasFields(
        fields,
        'facilityId',
        'patientId',
        'activeAllergyKey',
      ) ||
      messageContains(
        duplicateError,
        'uq_patient_allergies_active_key',
      )
    )
  ) {
    return new DuplicateActivePatientAllergyError();
  }

  if (
    operation === 'CREATE_PATIENT_ALLERGY_VERSION' &&
    (
      hasFields(
        fields,
        'facilityId',
        'patientAllergyId',
        'versionNumber',
      ) ||
      messageContains(
        duplicateError,
        'uq_patient_allergy_versions_allergy_version',
      )
    )
  ) {
    return new PatientAllergyVersionConflictError();
  }

  return error instanceof Error
    ? error
    : new Error(
        'Clinical EMR persistence conflict',
        {
          cause: error,
        },
      );
}

export function throwMappedClinicalEmrPersistenceError(
  error: unknown,
  operation: ClinicalEmrPersistenceOperation,
): never {
  throw mapClinicalEmrPersistenceError(
    error,
    operation,
  );
}