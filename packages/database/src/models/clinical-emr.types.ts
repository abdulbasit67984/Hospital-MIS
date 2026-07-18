export const encounterTypeValues = [
  'OPD',
  'EMERGENCY',
  'INPATIENT',
  'DAY_CARE',
  'TELEMEDICINE',
  'PROCEDURE',
  'CONSULTATION',
  'OTHER',
] as const;

export const encounterCareContextValues = [
  'OPD_VISIT',
  'EMERGENCY_CASE',
  'ADMISSION',
  'REFERRAL',
  'FOLLOW_UP',
  'DIRECT',
  'OTHER',
] as const;

export const encounterStatusValues = [
  'CREATED',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
  'SIGNED',
  'CLOSED',
  'CANCELLED',
  'CORRECTED',
] as const;

export const activeEncounterStatusValues = [
  'CREATED',
  'IN_PROGRESS',
  'ON_HOLD',
] as const;

export const terminalEncounterStatusValues = [
  'CLOSED',
  'CANCELLED',
  'CORRECTED',
] as const;

export const encounterOwnerRoleValues = [
  'PRIMARY_PROVIDER',
  'CONSULTING_PROVIDER',
  'SUPERVISING_PROVIDER',
  'COVERING_PROVIDER',
  'CLINICAL_TEAM',
] as const;

export const encounterStatusChangeSourceValues = [
  'PROVIDER',
  'NURSE',
  'MEDICAL_RECORDS',
  'SYSTEM',
  'RECOVERY',
] as const;

export const clinicalConfidentialityValues = [
  'ROUTINE',
  'RESTRICTED',
  'HIGHLY_RESTRICTED',
] as const;

export const clinicalDocumentTypeValues = [
  'CHIEF_COMPLAINT',
  'HISTORY_OF_PRESENTING_ILLNESS',
  'PAST_MEDICAL_HISTORY',
  'PAST_SURGICAL_HISTORY',
  'FAMILY_HISTORY',
  'SOCIAL_HISTORY',
  'CURRENT_MEDICATIONS',
  'REVIEW_OF_SYSTEMS',
  'PHYSICAL_EXAMINATION',
  'ASSESSMENT',
  'PLAN',
  'FOLLOW_UP_INSTRUCTIONS',
  'PROCEDURE_NOTE',
  'CONSULTATION_NOTE',
  'PROGRESS_NOTE',
  'GENERAL_CLINICAL_NOTE',
  'ADDENDUM',
] as const;

export const clinicalDocumentStatusValues = [
  'DRAFT',
  'FINAL',
  'AMENDED',
  'CORRECTED',
  'ENTERED_IN_ERROR',
] as const;

export const clinicalDocumentVersionChangeTypeValues = [
  'CREATED',
  'UPDATED',
  'FINALIZED',
  'SIGNED',
  'AMENDED',
  'CORRECTED',
  'ADDENDUM',
  'ENTERED_IN_ERROR',
] as const;

export const providerSignatureMethodValues = [
  'AUTHENTICATED_SESSION',
  'PIN_REAUTHENTICATION',
  'DIGITAL_CERTIFICATE',
] as const;

export const diagnosisCodeSystemValues = [
  'ICD_10',
  'SNOMED_CT',
  'LOCAL',
  'OTHER',
] as const;

export const diagnosisCatalogStatusValues = [
  'ACTIVE',
  'INACTIVE',
] as const;

export const encounterDiagnosisRoleValues = [
  'PRIMARY',
  'SECONDARY',
  'COMORBIDITY',
  'COMPLICATION',
  'RULE_OUT',
] as const;

export const diagnosisCertaintyValues = [
  'CONFIRMED',
  'PROVISIONAL',
  'DIFFERENTIAL',
  'SUSPECTED',
] as const;

export const encounterDiagnosisStatusValues = [
  'ACTIVE',
  'RESOLVED',
  'RULED_OUT',
  'ENTERED_IN_ERROR',
] as const;

export const patientProblemStatusValues = [
  'ACTIVE',
  'INACTIVE',
  'RESOLVED',
  'ENTERED_IN_ERROR',
] as const;

export const patientProblemVersionChangeTypeValues = [
  'CREATED',
  'UPDATED',
  'RESOLVED',
  'REOPENED',
  'CORRECTED',
  'ENTERED_IN_ERROR',
] as const;

export const allergyCategoryValues = [
  'MEDICATION',
  'FOOD',
  'ENVIRONMENT',
  'BIOLOGIC',
  'CONTRAST_MEDIA',
  'OTHER',
] as const;

export const allergyCatalogStatusValues = [
  'ACTIVE',
  'INACTIVE',
] as const;

export const patientAllergyRecordTypeValues = [
  'ALLERGY',
  'INTOLERANCE',
  'NO_KNOWN_ALLERGIES',
  'NO_KNOWN_DRUG_ALLERGIES',
] as const;

export const patientAllergyStatusValues = [
  'ACTIVE',
  'INACTIVE',
  'RESOLVED',
  'ENTERED_IN_ERROR',
] as const;

export const allergyVerificationStatusValues = [
  'UNCONFIRMED',
  'CONFIRMED',
  'REFUTED',
] as const;

export const allergySeverityValues = [
  'MILD',
  'MODERATE',
  'SEVERE',
  'LIFE_THREATENING',
  'UNKNOWN',
] as const;

export const allergyReactionSeverityValues = [
  'MILD',
  'MODERATE',
  'SEVERE',
  'LIFE_THREATENING',
  'UNKNOWN',
] as const;

export type EncounterType =
  (typeof encounterTypeValues)[number];

export type EncounterCareContext =
  (typeof encounterCareContextValues)[number];

export type EncounterStatus =
  (typeof encounterStatusValues)[number];

export type EncounterOwnerRole =
  (typeof encounterOwnerRoleValues)[number];

export type EncounterStatusChangeSource =
  (typeof encounterStatusChangeSourceValues)[number];

export type ClinicalConfidentiality =
  (typeof clinicalConfidentialityValues)[number];

export type ClinicalDocumentType =
  (typeof clinicalDocumentTypeValues)[number];

export type ClinicalDocumentStatus =
  (typeof clinicalDocumentStatusValues)[number];

export type ClinicalDocumentVersionChangeType =
  (typeof clinicalDocumentVersionChangeTypeValues)[number];

export type ProviderSignatureMethod =
  (typeof providerSignatureMethodValues)[number];

export type DiagnosisCodeSystem =
  (typeof diagnosisCodeSystemValues)[number];

export type DiagnosisCatalogStatus =
  (typeof diagnosisCatalogStatusValues)[number];

export type EncounterDiagnosisRole =
  (typeof encounterDiagnosisRoleValues)[number];

export type DiagnosisCertainty =
  (typeof diagnosisCertaintyValues)[number];

export type EncounterDiagnosisStatus =
  (typeof encounterDiagnosisStatusValues)[number];

export type PatientProblemStatus =
  (typeof patientProblemStatusValues)[number];

export type PatientProblemVersionChangeType =
  (typeof patientProblemVersionChangeTypeValues)[number];

export type AllergyCategory =
  (typeof allergyCategoryValues)[number];

export type AllergyCatalogStatus =
  (typeof allergyCatalogStatusValues)[number];

export type PatientAllergyRecordType =
  (typeof patientAllergyRecordTypeValues)[number];

export type PatientAllergyStatus =
  (typeof patientAllergyStatusValues)[number];

export type AllergyVerificationStatus =
  (typeof allergyVerificationStatusValues)[number];

export type AllergySeverity =
  (typeof allergySeverityValues)[number];

export type AllergyReactionSeverity =
  (typeof allergyReactionSeverityValues)[number];