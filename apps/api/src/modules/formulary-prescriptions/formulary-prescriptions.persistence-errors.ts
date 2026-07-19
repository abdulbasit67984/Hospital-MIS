import {
  ActiveFormularySelectionConflictError,
  FormularyCodeConflictError,
  MedicineCodeConflictError,
  MedicineFormConflictError,
  MedicineGenericNameConflictError,
  MedicineRouteConflictError,
  MedicineStrengthConflictError,
  PrescriptionFrequencyConflictError,
  PrescriptionItemSequenceConflictError,
  PrescriptionNumberConflictError,
  PrescriptionRevisionConflictError,
  PrescriptionStatusHistorySequenceConflictError,
  PrescriptionWarningFingerprintConflictError,
  UnitOfMeasureConflictError,
} from './formulary-prescriptions.errors.js';

interface MongoLikeError {
  code?: unknown;
  keyPattern?: Record<string, unknown>;
  keyValue?: Record<string, unknown>;
  message?: unknown;
  cause?: unknown;
}

export type FormularyPrescriptionPersistenceOperation =
  | 'CREATE_MEDICINE'
  | 'CREATE_MEDICINE_FORM'
  | 'CREATE_MEDICINE_ROUTE'
  | 'CREATE_UNIT_OF_MEASURE'
  | 'CREATE_MEDICINE_STRENGTH'
  | 'CREATE_PRESCRIPTION_FREQUENCY'
  | 'CREATE_FORMULARY_ITEM'
  | 'CREATE_PRESCRIPTION'
  | 'CREATE_PRESCRIPTION_ITEM'
  | 'CREATE_PRESCRIPTION_HISTORY'
  | 'CREATE_PRESCRIPTION_WARNING';

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
    asMongoLikeError(
      error,
    );

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

function hasFields(
  fields: ReadonlySet<string>,
  ...required: readonly string[]
): boolean {
  return required.every(
    (field) =>
      fields.has(field),
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

export function isFormularyPrescriptionDuplicateKeyError(
  error: unknown,
): boolean {
  return findDuplicateKeyError(error) !== null;
}

export function mapFormularyPrescriptionPersistenceError(
  error: unknown,
  operation: FormularyPrescriptionPersistenceOperation,
): Error {
  const duplicateError =
    findDuplicateKeyError(
      error,
    );

  if (duplicateError === null) {
    return error instanceof Error
      ? error
      : new Error(
          'Unknown formulary and prescription persistence error',
          {
            cause: error,
          },
        );
  }

  const fields =
    duplicateFields(
      duplicateError,
    );

  if (
    operation === 'CREATE_MEDICINE' &&
    (
      hasFields(
        fields,
        'facilityId',
        'medicineCode',
      ) ||
      messageContains(
        duplicateError,
        'uq_medicines_facility_code',
      )
    )
  ) {
    return new MedicineCodeConflictError();
  }

  if (
    operation === 'CREATE_MEDICINE' &&
    (
      hasFields(
        fields,
        'facilityId',
        'normalizedGenericName',
      ) ||
      messageContains(
        duplicateError,
        'uq_medicines_facility_generic_name',
      )
    )
  ) {
    return new MedicineGenericNameConflictError();
  }

  if (
    operation === 'CREATE_MEDICINE_FORM' &&
    (
      hasFields(
        fields,
        'facilityId',
        'code',
      ) ||
      hasFields(
        fields,
        'facilityId',
        'normalizedName',
      ) ||
      messageContains(
        duplicateError,
        'uq_medicine_forms_facility_code',
      ) ||
      messageContains(
        duplicateError,
        'uq_medicine_forms_facility_name',
      )
    )
  ) {
    return new MedicineFormConflictError();
  }

  if (
    operation === 'CREATE_MEDICINE_ROUTE' &&
    (
      hasFields(
        fields,
        'facilityId',
        'code',
      ) ||
      hasFields(
        fields,
        'facilityId',
        'normalizedName',
      ) ||
      messageContains(
        duplicateError,
        'uq_medicine_routes_facility_code',
      ) ||
      messageContains(
        duplicateError,
        'uq_medicine_routes_facility_name',
      )
    )
  ) {
    return new MedicineRouteConflictError();
  }

  if (
    operation === 'CREATE_UNIT_OF_MEASURE' &&
    (
      hasFields(
        fields,
        'facilityId',
        'code',
      ) ||
      messageContains(
        duplicateError,
        'uq_units_of_measure_facility_code',
      )
    )
  ) {
    return new UnitOfMeasureConflictError();
  }

  if (
    operation === 'CREATE_MEDICINE_STRENGTH' &&
    (
      hasFields(
        fields,
        'facilityId',
        'medicineId',
        'medicineFormId',
        'normalizedDisplayText',
      ) ||
      messageContains(
        duplicateError,
        'uq_medicine_strengths_selection',
      )
    )
  ) {
    return new MedicineStrengthConflictError();
  }

  if (
    operation === 'CREATE_PRESCRIPTION_FREQUENCY' &&
    (
      hasFields(
        fields,
        'facilityId',
        'code',
      ) ||
      hasFields(
        fields,
        'facilityId',
        'normalizedName',
      ) ||
      messageContains(
        duplicateError,
        'uq_prescription_frequencies_facility_code',
      ) ||
      messageContains(
        duplicateError,
        'uq_prescription_frequencies_facility_name',
      )
    )
  ) {
    return new PrescriptionFrequencyConflictError();
  }

  if (
    operation === 'CREATE_FORMULARY_ITEM' &&
    (
      hasFields(
        fields,
        'facilityId',
        'formularyCode',
      ) ||
      messageContains(
        duplicateError,
        'uq_formulary_items_facility_code',
      )
    )
  ) {
    return new FormularyCodeConflictError();
  }

  if (
    operation === 'CREATE_FORMULARY_ITEM' &&
    (
      hasFields(
        fields,
        'facilityId',
        'activeSelectionKey',
      ) ||
      messageContains(
        duplicateError,
        'uq_formulary_items_active_selection',
      )
    )
  ) {
    return new ActiveFormularySelectionConflictError();
  }

  if (
    operation === 'CREATE_PRESCRIPTION' &&
    (
      hasFields(
        fields,
        'facilityId',
        'prescriptionNumber',
      ) ||
      messageContains(
        duplicateError,
        'uq_prescriptions_facility_number',
      )
    )
  ) {
    return new PrescriptionNumberConflictError();
  }

  if (
    operation === 'CREATE_PRESCRIPTION' &&
    (
      hasFields(
        fields,
        'facilityId',
        'rootPrescriptionId',
        'revisionNumber',
      ) ||
      messageContains(
        duplicateError,
        'uq_prescriptions_root_revision',
      )
    )
  ) {
    return new PrescriptionRevisionConflictError();
  }

  if (
    operation === 'CREATE_PRESCRIPTION_ITEM' &&
    (
      hasFields(
        fields,
        'facilityId',
        'prescriptionId',
        'sequence',
      ) ||
      messageContains(
        duplicateError,
        'uq_prescription_items_sequence',
      )
    )
  ) {
    return new PrescriptionItemSequenceConflictError();
  }

  if (
    operation === 'CREATE_PRESCRIPTION_HISTORY' &&
    (
      hasFields(
        fields,
        'facilityId',
        'prescriptionId',
        'sequence',
      ) ||
      messageContains(
        duplicateError,
        'uq_prescription_status_histories_sequence',
      )
    )
  ) {
    return new PrescriptionStatusHistorySequenceConflictError();
  }

  if (
    operation === 'CREATE_PRESCRIPTION_WARNING' &&
    (
      hasFields(
        fields,
        'facilityId',
        'prescriptionId',
        'warningFingerprint',
      ) ||
      messageContains(
        duplicateError,
        'uq_prescription_warnings_fingerprint',
      )
    )
  ) {
    return new PrescriptionWarningFingerprintConflictError();
  }

  return error instanceof Error
    ? error
    : new Error(
        'Formulary and prescription persistence conflict',
        {
          cause: error,
        },
      );
}

export function throwMappedFormularyPrescriptionPersistenceError(
  error: unknown,
  operation: FormularyPrescriptionPersistenceOperation,
): never {
  throw mapFormularyPrescriptionPersistenceError(
    error,
    operation,
  );
}