export const CLINICAL_EMR_TRANSACTION_TYPES = {
  CREATE_ENCOUNTER: 'CREATE_ENCOUNTER',
  CHANGE_ENCOUNTER_STATUS: 'CHANGE_ENCOUNTER_STATUS',
  REASSIGN_ENCOUNTER: 'REASSIGN_ENCOUNTER',
  SIGN_ENCOUNTER: 'SIGN_ENCOUNTER',
  CORRECT_ENCOUNTER: 'CORRECT_ENCOUNTER',

  CREATE_CLINICAL_NOTE: 'CREATE_CLINICAL_NOTE',
  UPDATE_CLINICAL_NOTE_DRAFT: 'UPDATE_CLINICAL_NOTE_DRAFT',
  FINALIZE_CLINICAL_NOTE: 'FINALIZE_CLINICAL_NOTE',
  AMEND_CLINICAL_NOTE: 'AMEND_CLINICAL_NOTE',
  CORRECT_CLINICAL_NOTE: 'CORRECT_CLINICAL_NOTE',
  ADD_CLINICAL_NOTE_ADDENDUM: 'ADD_CLINICAL_NOTE_ADDENDUM',
  ENTER_CLINICAL_NOTE_IN_ERROR: 'ENTER_CLINICAL_NOTE_IN_ERROR',

  RECORD_ENCOUNTER_DIAGNOSIS: 'RECORD_ENCOUNTER_DIAGNOSIS',
  CHANGE_ENCOUNTER_DIAGNOSIS_STATUS:
    'CHANGE_ENCOUNTER_DIAGNOSIS_STATUS',
  VERIFY_ENCOUNTER_DIAGNOSIS: 'VERIFY_ENCOUNTER_DIAGNOSIS',
  CORRECT_ENCOUNTER_DIAGNOSIS: 'CORRECT_ENCOUNTER_DIAGNOSIS',

  CREATE_PATIENT_PROBLEM: 'CREATE_PATIENT_PROBLEM',
  UPDATE_PATIENT_PROBLEM: 'UPDATE_PATIENT_PROBLEM',
  CORRECT_PATIENT_PROBLEM: 'CORRECT_PATIENT_PROBLEM',

  RECORD_PATIENT_ALLERGY: 'RECORD_PATIENT_ALLERGY',
  UPDATE_PATIENT_ALLERGY: 'UPDATE_PATIENT_ALLERGY',
  CORRECT_PATIENT_ALLERGY: 'CORRECT_PATIENT_ALLERGY',

  RECORD_VITAL_SIGNS: 'RECORD_VITAL_SIGNS',
  CORRECT_VITAL_SIGNS: 'CORRECT_VITAL_SIGNS',
  ENTER_VITAL_SIGNS_IN_ERROR: 'ENTER_VITAL_SIGNS_IN_ERROR',

  CREATE_CLINICAL_REFERRAL: 'CREATE_CLINICAL_REFERRAL',
  TRANSITION_CLINICAL_REFERRAL: 'TRANSITION_CLINICAL_REFERRAL',
  CORRECT_CLINICAL_REFERRAL: 'CORRECT_CLINICAL_REFERRAL',
} as const;

export type ClinicalEmrTransactionType =
  (typeof CLINICAL_EMR_TRANSACTION_TYPES)[keyof typeof CLINICAL_EMR_TRANSACTION_TYPES];

export const CLINICAL_EMR_TRANSACTION_STATES = {
  CANONICAL_PATIENT_RESOLVED: 'CANONICAL_PATIENT_RESOLVED',
  ENCOUNTER_CONTEXT_VALIDATED: 'ENCOUNTER_CONTEXT_VALIDATED',
  ACCESS_AUTHORIZED: 'ACCESS_AUTHORIZED',
  NUMBER_ALLOCATED: 'NUMBER_ALLOCATED',
  CURRENT_PROJECTION_CREATED: 'CURRENT_PROJECTION_CREATED',
  CURRENT_PROJECTION_UPDATED: 'CURRENT_PROJECTION_UPDATED',
  IMMUTABLE_VERSION_APPENDED: 'IMMUTABLE_VERSION_APPENDED',
  STATUS_HISTORY_APPENDED: 'STATUS_HISTORY_APPENDED',
  SNAPSHOT_ENCRYPTED: 'SNAPSHOT_ENCRYPTED',
  COMPENSATION_REGISTERED: 'COMPENSATION_REGISTERED',
  AUDIT_APPENDED: 'AUDIT_APPENDED',
  OUTBOX_ENQUEUED: 'OUTBOX_ENQUEUED',
  OPD_LIFECYCLE_SYNCHRONIZED: 'OPD_LIFECYCLE_SYNCHRONIZED',
  REALTIME_PUBLISHED: 'REALTIME_PUBLISHED',
} as const;

export const CLINICAL_EMR_AUDIT_ACTIONS = {
  ENCOUNTER_CREATED: 'clinical.encounter.created',
  ENCOUNTER_STATUS_CHANGED: 'clinical.encounter.status_changed',
  ENCOUNTER_REASSIGNED: 'clinical.encounter.reassigned',
  ENCOUNTER_SIGNED: 'clinical.encounter.signed',
  ENCOUNTER_CORRECTED: 'clinical.encounter.corrected',
  CLINICAL_NOTE_CREATED: 'clinical.note.created',
  CLINICAL_NOTE_UPDATED: 'clinical.note.updated',
  CLINICAL_NOTE_FINALIZED: 'clinical.note.finalized',
  CLINICAL_NOTE_AMENDED: 'clinical.note.amended',
  CLINICAL_NOTE_CORRECTED: 'clinical.note.corrected',
  CLINICAL_NOTE_ADDENDUM_CREATED: 'clinical.note.addendum_created',
  CLINICAL_NOTE_ENTERED_IN_ERROR: 'clinical.note.entered_in_error',
  DIAGNOSIS_RECORDED: 'clinical.diagnosis.recorded',
  DIAGNOSIS_STATUS_CHANGED: 'clinical.diagnosis.status_changed',
  DIAGNOSIS_VERIFIED: 'clinical.diagnosis.verified',
  DIAGNOSIS_CORRECTED: 'clinical.diagnosis.corrected',
  PROBLEM_CREATED: 'clinical.problem.created',
  PROBLEM_UPDATED: 'clinical.problem.updated',
  PROBLEM_CORRECTED: 'clinical.problem.corrected',
  ALLERGY_RECORDED: 'clinical.allergy.recorded',
  ALLERGY_UPDATED: 'clinical.allergy.updated',
  ALLERGY_CORRECTED: 'clinical.allergy.corrected',
  VITAL_SIGNS_RECORDED: 'clinical.vital_signs.recorded',
  VITAL_SIGNS_CORRECTED: 'clinical.vital_signs.corrected',
  VITAL_SIGNS_ENTERED_IN_ERROR: 'clinical.vital_signs.entered_in_error',
  REFERRAL_CREATED: 'clinical.referral.created',
  REFERRAL_STATUS_CHANGED: 'clinical.referral.status_changed',
  REFERRAL_CORRECTED: 'clinical.referral.corrected',
  SENSITIVE_READ: 'clinical.sensitive_read',
  BREAK_GLASS_READ: 'clinical.break_glass_read',
} as const;

export const CLINICAL_EMR_OUTBOX_EVENTS = {
  ENCOUNTER_CREATED: 'clinical.encounter.created',
  ENCOUNTER_STATUS_CHANGED: 'clinical.encounter.status_changed',
  ENCOUNTER_REASSIGNED: 'clinical.encounter.reassigned',
  ENCOUNTER_SIGNED: 'clinical.encounter.signed',
  ENCOUNTER_CORRECTED: 'clinical.encounter.corrected',
  CLINICAL_NOTE_CREATED: 'clinical.note.created',
  CLINICAL_NOTE_DRAFT_UPDATED: 'clinical.note.draft_updated',
  CLINICAL_NOTE_FINALIZED: 'clinical.note.finalized',
  CLINICAL_NOTE_AMENDED: 'clinical.note.amended',
  CLINICAL_NOTE_CORRECTED: 'clinical.note.corrected',
  CLINICAL_NOTE_ADDENDUM_CREATED: 'clinical.note.addendum_created',
  CLINICAL_NOTE_ENTERED_IN_ERROR: 'clinical.note.entered_in_error',
  DIAGNOSIS_CHANGED: 'clinical.diagnosis.changed',
  PROBLEM_LIST_CHANGED: 'clinical.problem_list.changed',
  ALLERGY_LIST_CHANGED: 'clinical.allergy_list.changed',
  VITAL_SIGNS_CHANGED: 'clinical.vital_signs.changed',
  REFERRAL_CHANGED: 'clinical.referral.changed',
  TIMELINE_CHANGED: 'clinical.timeline.changed',
} as const;

export const CLINICAL_EMR_REALTIME_EVENTS = {
  ENCOUNTER_CHANGED: 'clinical.encounter.changed',
  CLINICAL_NOTE_CHANGED: 'clinical.note.changed',
  DIAGNOSIS_CHANGED: 'clinical.diagnosis.changed',
  PROBLEM_LIST_CHANGED: 'clinical.problem_list.changed',
  PROVIDER_WORKLIST_CHANGED: 'clinical.provider_worklist.changed',
  PATIENT_TIMELINE_CHANGED: 'clinical.patient_timeline.changed',
  ALLERGY_WARNING_CHANGED: 'clinical.allergy_warning.changed',
  VITAL_SIGNS_CHANGED: 'clinical.vital_signs.changed',
  REFERRAL_CHANGED: 'clinical.referral.changed',
} as const;

export const CLINICAL_EMR_RECOVERY_MODES = {
  COMPENSATE: 'COMPENSATE',
  FINALIZE_COMPLETED: 'FINALIZE_COMPLETED',
} as const;

export type ClinicalEmrRecoveryMode =
  (typeof CLINICAL_EMR_RECOVERY_MODES)[keyof typeof CLINICAL_EMR_RECOVERY_MODES];

export const CLINICAL_EMR_COMPENSATION_TYPES = {
  DELETE_CREATED_RECORD: 'clinical-emr.record.delete-created',
  RESTORE_ENCRYPTED_RECORD: 'clinical-emr.record.restore-encrypted',
} as const;

export type ClinicalEmrCompensationType =
  (typeof CLINICAL_EMR_COMPENSATION_TYPES)[keyof typeof CLINICAL_EMR_COMPENSATION_TYPES];

export const CLINICAL_EMR_COMPENSATABLE_COLLECTIONS = [
  'encounters',
  'encounterStatusHistories',
  'clinicalNotes',
  'clinicalNoteVersions',
  'encounterDiagnoses',
  'patientProblems',
  'patientProblemVersions',
  'patientAllergies',
  'patientAllergyVersions',
  'vitalSigns',
  'clinicalReferrals',
  'opdVisits',
  'queueTokens',
  'queueStatusHistories',
] as const;

export type ClinicalEmrCompensatableCollection =
  (typeof CLINICAL_EMR_COMPENSATABLE_COLLECTIONS)[number];