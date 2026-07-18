import type {
  PermissionKey,
} from '@hospital-mis/permissions';

import type {
  ClinicalDocumentStatus,
  EncounterStatus,
  PatientAllergyStatus,
  PatientProblemStatus,
} from '@hospital-mis/database';

export const CLINICAL_EMR_PERMISSION_KEYS = {
  ENCOUNTER_READ_ASSIGNED:
    'encounters.read_assigned',

  ENCOUNTER_READ_ALL:
    'encounters.read_all',

  ENCOUNTER_CREATE:
    'encounters.create',

  ENCOUNTER_FINALIZE:
    'encounters.finalize',

  ENCOUNTER_AMEND:
    'encounters.amend',

  CLINICAL_NOTE_CREATE:
    'clinical_notes.create',

  CLINICAL_NOTE_AMEND:
    'clinical_notes.amend',

  BREAK_GLASS:
    'security.break_glass',
} as const satisfies Record<
  string,
  PermissionKey
>;

export type ClinicalEmrPermissionKey =
  (typeof CLINICAL_EMR_PERMISSION_KEYS)[
    keyof typeof CLINICAL_EMR_PERMISSION_KEYS
  ];

export const ENCOUNTER_SORT_FIELDS = [
  'serviceDate',
  'startedAt',
  'lastClinicalActivityAt',
  'createdAt',
  'updatedAt',
] as const;

export type EncounterSortField =
  (typeof ENCOUNTER_SORT_FIELDS)[number];

export const CLINICAL_NOTE_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'finalizedAt',
  'signedAt',
] as const;

export type ClinicalNoteSortField =
  (typeof CLINICAL_NOTE_SORT_FIELDS)[number];

export const CLINICAL_TIMELINE_SORT_FIELDS = [
  'occurredAt',
  'createdAt',
] as const;

export type ClinicalTimelineSortField =
  (typeof CLINICAL_TIMELINE_SORT_FIELDS)[number];

export const DEFAULT_CLINICAL_EMR_PAGE_SIZE =
  25;

export const MAX_CLINICAL_EMR_PAGE_SIZE =
  100;

export const DEFAULT_ENCOUNTER_NUMBER_WIDTH =
  6;

export const DEFAULT_CLINICAL_NOTE_NUMBER_WIDTH =
  7;

export const DEFAULT_PATIENT_PROBLEM_NUMBER_WIDTH =
  7;

export const ENCOUNTER_NUMBER_SEQUENCE_NAMESPACE =
  'clinical.encounter.number';

export const CLINICAL_NOTE_NUMBER_SEQUENCE_NAMESPACE =
  'clinical.note.number';

export const PATIENT_PROBLEM_NUMBER_SEQUENCE_NAMESPACE =
  'clinical.problem.number';

export const CLINICAL_EMR_LOCK_NAMESPACE = {
  ENCOUNTER_CONTEXT:
    'clinical-emr:encounter-context',

  ENCOUNTER:
    'clinical-emr:encounter',

  CLINICAL_NOTE:
    'clinical-emr:clinical-note',

  DIAGNOSIS:
    'clinical-emr:diagnosis',

  PATIENT_PROBLEM:
    'clinical-emr:patient-problem',

  PATIENT_ALLERGY:
    'clinical-emr:patient-allergy',

  VITAL_SIGN:
    'clinical-emr:vital-sign',

  PATIENT_TIMELINE:
    'clinical-emr:patient-timeline',
} as const;

export const ENCOUNTER_TRANSITIONS = {
  CREATED: [
    'IN_PROGRESS',
    'CANCELLED',
    'CORRECTED',
  ],

  IN_PROGRESS: [
    'ON_HOLD',
    'COMPLETED',
    'CANCELLED',
    'CORRECTED',
  ],

  ON_HOLD: [
    'IN_PROGRESS',
    'CANCELLED',
    'CORRECTED',
  ],

  COMPLETED: [
    'SIGNED',
    'CORRECTED',
  ],

  SIGNED: [
    'CLOSED',
    'CORRECTED',
  ],

  CLOSED: [
    'CORRECTED',
  ],

  CANCELLED:
    [],

  CORRECTED:
    [],
} as const satisfies Record<
  EncounterStatus,
  readonly EncounterStatus[]
>;

export const CLINICAL_DOCUMENT_TRANSITIONS = {
  DRAFT: [
    'FINAL',
    'ENTERED_IN_ERROR',
  ],

  FINAL: [
    'AMENDED',
    'CORRECTED',
    'ENTERED_IN_ERROR',
  ],

  AMENDED: [
    'AMENDED',
    'CORRECTED',
    'ENTERED_IN_ERROR',
  ],

  CORRECTED:
    [],

  ENTERED_IN_ERROR:
    [],
} as const satisfies Record<
  ClinicalDocumentStatus,
  readonly ClinicalDocumentStatus[]
>;

export const PATIENT_PROBLEM_TRANSITIONS = {
  ACTIVE: [
    'INACTIVE',
    'RESOLVED',
    'ENTERED_IN_ERROR',
  ],

  INACTIVE: [
    'ACTIVE',
    'RESOLVED',
    'ENTERED_IN_ERROR',
  ],

  RESOLVED: [
    'ACTIVE',
    'ENTERED_IN_ERROR',
  ],

  ENTERED_IN_ERROR:
    [],
} as const satisfies Record<
  PatientProblemStatus,
  readonly PatientProblemStatus[]
>;

export const PATIENT_ALLERGY_TRANSITIONS = {
  ACTIVE: [
    'INACTIVE',
    'RESOLVED',
    'ENTERED_IN_ERROR',
  ],

  INACTIVE: [
    'ACTIVE',
    'RESOLVED',
    'ENTERED_IN_ERROR',
  ],

  RESOLVED: [
    'ACTIVE',
    'ENTERED_IN_ERROR',
  ],

  ENTERED_IN_ERROR:
    [],
} as const satisfies Record<
  PatientAllergyStatus,
  readonly PatientAllergyStatus[]
>;