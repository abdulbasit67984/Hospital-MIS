import type {
  PermissionKey,
} from '@hospital-mis/permissions';

export const PATIENT_PERMISSION_KEYS = {
  READ:
    'patients.read',

  READ_SENSITIVE:
    'patients.read_sensitive',

  CREATE:
    'patients.create',

  UPDATE:
    'patients.update',

  MERGE:
    'patients.merge',

  GUARDIAN_READ:
    'guardians.read',

  GUARDIAN_MANAGE:
    'guardians.manage',
} as const satisfies Record<
  string,
  PermissionKey
>;

export type PatientPermissionKey =
  (typeof PATIENT_PERMISSION_KEYS)[keyof typeof PATIENT_PERMISSION_KEYS];

export const PATIENT_ACCESS_LEVEL = {
  STANDARD:
    'STANDARD',

  SENSITIVE:
    'SENSITIVE',

  MATCHING:
    'MATCHING',
} as const;

export type PatientAccessLevel =
  (typeof PATIENT_ACCESS_LEVEL)[keyof typeof PATIENT_ACCESS_LEVEL];

export const PATIENT_DUPLICATE_MATCH_LEVEL = {
  NONE:
    'NONE',

  POSSIBLE:
    'POSSIBLE',

  HIGH:
    'HIGH',

  BLOCK:
    'BLOCK',
} as const;

export type PatientDuplicateMatchLevel =
  (typeof PATIENT_DUPLICATE_MATCH_LEVEL)[keyof typeof PATIENT_DUPLICATE_MATCH_LEVEL];

export const PATIENT_DUPLICATE_REASON = {
  EXACT_CNIC:
    'EXACT_CNIC',

  EXACT_B_FORM:
    'EXACT_B_FORM',

  EXACT_PASSPORT:
    'EXACT_PASSPORT',

  SAME_GUARDIAN_CNIC:
    'SAME_GUARDIAN_CNIC',

  EXACT_PHONE:
    'EXACT_PHONE',

  EXACT_NAME:
    'EXACT_NAME',

  EXACT_BIRTH_DATE:
    'EXACT_BIRTH_DATE',

  APPROXIMATE_BIRTH_YEAR:
    'APPROXIMATE_BIRTH_YEAR',
} as const;

export type PatientDuplicateReason =
  (typeof PATIENT_DUPLICATE_REASON)[keyof typeof PATIENT_DUPLICATE_REASON];

export const PATIENT_DUPLICATE_SCORE = {
  EXACT_CNIC:
    100,

  EXACT_B_FORM:
    100,

  EXACT_PASSPORT:
    85,

  SAME_GUARDIAN_CNIC:
    45,

  EXACT_PHONE:
    25,

  EXACT_NAME:
    25,

  EXACT_BIRTH_DATE:
    30,

  APPROXIMATE_BIRTH_YEAR:
    15,

  MINOR_COMPOSITE_BONUS:
    20,
} as const;

export const PATIENT_DUPLICATE_THRESHOLD = {
  POSSIBLE:
    40,

  HIGH:
    70,

  BLOCK:
    100,
} as const;

export const PATIENT_SORT_FIELDS = [
  'displayName',
  'registeredAt',
  'createdAt',
  'updatedAt',
] as const;

export type PatientSortField =
  (typeof PATIENT_SORT_FIELDS)[number];

export const DEFAULT_PATIENT_PAGE_SIZE =
  20;

export const MAX_PATIENT_PAGE_SIZE =
  100;

export const DEFAULT_MRN_SEQUENCE_WIDTH =
  6;

export const PATIENT_MRN_SEQUENCE_NAMESPACE =
  'patient.mrn';