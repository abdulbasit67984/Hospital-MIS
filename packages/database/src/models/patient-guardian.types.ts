export const patientStatusValues = [
  'ACTIVE',
  'INACTIVE',
  'DECEASED',
  'MERGED',
  'RESTRICTED',
] as const;

export const patientMergeStateValues = [
  'CANONICAL',
  'DUPLICATE_SUSPECTED',
  'MERGED',
] as const;

export const patientSexAtBirthValues = [
  'MALE',
  'FEMALE',
  'INTERSEX',
  'UNKNOWN',
] as const;

export const patientGenderIdentityValues = [
  'MALE',
  'FEMALE',
  'NON_BINARY',
  'OTHER',
  'UNKNOWN',
  'NOT_DISCLOSED',
] as const;

export const patientBirthDatePrecisionValues = [
  'EXACT',
  'MONTH',
  'YEAR',
  'APPROXIMATE',
  'UNKNOWN',
] as const;

export const patientGuardianRequirementValues = [
  'REQUIRED',
  'NOT_REQUIRED',
  'REVIEW_REQUIRED',
] as const;

export const patientRegistrationSourceValues = [
  'RECEPTION',
  'EMERGENCY',
  'IMPORT',
  'MIGRATION',
  'OTHER',
] as const;

export const patientIdentifierTypeValues = [
  'MRN',
  'CNIC',
  'B_FORM',
  'PASSPORT',
  'OTHER',
] as const;

export const patientIdentifierScopeValues = [
  'FACILITY',
  'ENTERPRISE',
] as const;

export const patientIdentifierStatusValues = [
  'ACTIVE',
  'REPLACED',
  'REVOKED',
  'EXPIRED',
] as const;

export const patientIdentifierVerificationValues = [
  'UNVERIFIED',
  'VERIFIED',
  'REJECTED',
] as const;

export const guardianStatusValues = [
  'ACTIVE',
  'INACTIVE',
  'DECEASED',
  'MERGED',
] as const;

export const guardianRelationshipTypeValues = [
  'MOTHER',
  'FATHER',
  'LEGAL_GUARDIAN',
  'SPOUSE',
  'ADULT_CHILD',
  'SIBLING',
  'GRANDPARENT',
  'OTHER_RELATIVE',
  'CAREGIVER',
  'OTHER',
] as const;

export const guardianLegalAuthorityStatusValues = [
  'NONE',
  'DECLARED',
  'VERIFIED',
  'EXPIRED',
  'REVOKED',
] as const;

export const guardianVerificationStatusValues = [
  'UNVERIFIED',
  'PENDING',
  'VERIFIED',
  'REJECTED',
] as const;

export const patientContactTypeValues = [
  'PHONE',
  'EMAIL',
] as const;

export const patientContactPurposeValues = [
  'PRIMARY',
  'SECONDARY',
  'EMERGENCY',
  'BILLING',
  'OTHER',
] as const;

export const patientContactStatusValues = [
  'ACTIVE',
  'INACTIVE',
  'INVALID',
] as const;

export const patientAddressTypeValues = [
  'HOME',
  'MAILING',
  'TEMPORARY',
  'WORK',
  'OTHER',
] as const;

export const patientAddressStatusValues = [
  'ACTIVE',
  'INACTIVE',
] as const;

export const patientAlertTypeValues = [
  'IDENTITY',
  'ADMINISTRATIVE',
  'LEGAL',
  'SAFETY',
  'CLINICAL',
  'OTHER',
] as const;

export const patientAlertSeverityValues = [
  'INFO',
  'WARNING',
  'CRITICAL',
] as const;

export const patientAlertVisibilityValues = [
  'STANDARD',
  'RESTRICTED',
] as const;

export const patientAlertStatusValues = [
  'ACTIVE',
  'RESOLVED',
  'EXPIRED',
] as const;

export type PatientStatus = (typeof patientStatusValues)[number];
export type PatientMergeState = (typeof patientMergeStateValues)[number];
export type PatientSexAtBirth = (typeof patientSexAtBirthValues)[number];
export type PatientGenderIdentity = (typeof patientGenderIdentityValues)[number];
export type PatientBirthDatePrecision =
  (typeof patientBirthDatePrecisionValues)[number];
export type PatientGuardianRequirement =
  (typeof patientGuardianRequirementValues)[number];
export type PatientRegistrationSource =
  (typeof patientRegistrationSourceValues)[number];
export type PatientIdentifierType =
  (typeof patientIdentifierTypeValues)[number];
export type PatientIdentifierScope =
  (typeof patientIdentifierScopeValues)[number];
export type PatientIdentifierStatus =
  (typeof patientIdentifierStatusValues)[number];
export type GuardianStatus = (typeof guardianStatusValues)[number];
export type GuardianRelationshipType =
  (typeof guardianRelationshipTypeValues)[number];
export type PatientIdentifierVerification =
  (typeof patientIdentifierVerificationValues)[number];
export type GuardianLegalAuthorityStatus =
  (typeof guardianLegalAuthorityStatusValues)[number];
export type GuardianVerificationStatus =
  (typeof guardianVerificationStatusValues)[number];
export type PatientContactType = (typeof patientContactTypeValues)[number];
export type PatientContactPurpose =
  (typeof patientContactPurposeValues)[number];
export type PatientContactStatus = (typeof patientContactStatusValues)[number];
export type PatientAddressType = (typeof patientAddressTypeValues)[number];
export type PatientAddressStatus = (typeof patientAddressStatusValues)[number];
export type PatientAlertType = (typeof patientAlertTypeValues)[number];
export type PatientAlertSeverity = (typeof patientAlertSeverityValues)[number];
export type PatientAlertVisibility =
  (typeof patientAlertVisibilityValues)[number];
export type PatientAlertStatus = (typeof patientAlertStatusValues)[number];