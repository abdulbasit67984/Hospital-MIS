import type {
  GuardianRecord,
  PatientIdentifierRecord,
  PatientRecord,
  PatientSummaryDto,
} from './patient.types.js';

export const PATIENT_STANDARD_SELECT = [
  '_id',
  'facilityId',
  'enterprisePatientId',
  'canonicalPatientId',
  'firstName',
  'middleName',
  'lastName',
  'preferredName',
  'displayName',
  'localizedNames.locale',
  'localizedNames.fullName',
  'birthDate.precision',
  'birthDate.isApproximate',
  'birthDate.estimatedAgeYears',
  'birthDate.estimatedAsOfDate',
  'isMinor',
  'guardianRequirement',
  'sexAtBirth',
  'genderIdentity',
  'preferredLocale',
  'nationalityCountryCode',
  'status',
  'mergeState',
  'deceasedAt',
  'identityReviewRequired',
  'duplicateReviewRequired',
  'registrationSource',
  'registeredAt',
  'version',
  'createdAt',
  'updatedAt',
].join(' ');

export const PATIENT_SENSITIVE_SELECT = [
  PATIENT_STANDARD_SELECT,
  '+birthDate.value',
  '+genderDescription',
  '+statusReason',
].join(' ');

export const PATIENT_MATCHING_SELECT = [
  PATIENT_STANDARD_SELECT,
  '+birthDate.value',
  '+normalizedFullName',
  '+nameSearchTokens',
].join(' ');

export const PATIENT_IDENTIFIER_STANDARD_SELECT = [
  '_id',
  'facilityId',
  'patientId',
  'issuingFacilityId',
  'identifierType',
  'scope',
  'displayValue',
  'issuingCountryCode',
  'issuingAuthority',
  'isPrimaryIdentity',
  'isPrimaryMrn',
  'verificationStatus',
  'validFrom',
  'expiresAt',
  'status',
  'version',
  'createdAt',
  'updatedAt',
].join(' ');

export const PATIENT_IDENTIFIER_INTERNAL_SELECT = [
  PATIENT_IDENTIFIER_STANDARD_SELECT,
  '+normalizedValue',
].join(' ');

export const GUARDIAN_STANDARD_SELECT = [
  '_id',
  'facilityId',
  'enterpriseGuardianId',
  'firstName',
  'middleName',
  'lastName',
  'displayName',
  'localizedNames.locale',
  'localizedNames.fullName',
  'cnicDisplayValue',
  'sexAtBirth',
  'genderIdentity',
  'phoneDisplayValue',
  'address.city',
  'address.district',
  'address.province',
  'address.countryCode',
  'preferredLocale',
  'status',
  'version',
  'createdAt',
  'updatedAt',
].join(' ');

export const GUARDIAN_SENSITIVE_SELECT = [
  GUARDIAN_STANDARD_SELECT,
  '+cnicNormalized',
  '+dateOfBirth',
  '+phoneNormalized',
  '+emailNormalized',
  '+address.line1',
  '+address.line2',
  '+address.postalCode',
  '+statusReason',
].join(' ');

export const GUARDIAN_MATCHING_SELECT = [
  GUARDIAN_STANDARD_SELECT,
  '+cnicNormalized',
  '+phoneNormalized',
  '+normalizedFullName',
].join(' ');

export const PATIENT_CONTACT_STANDARD_SELECT = [
  '_id',
  'facilityId',
  'patientId',
  'contactType',
  'purpose',
  'displayValue',
  'contactName',
  'relationshipToPatient',
  'relatedGuardianId',
  'isPrimary',
  'isEmergencyContact',
  'consentToContact',
  'isVerified',
  'status',
  'version',
  'createdAt',
  'updatedAt',
].join(' ');

export const PATIENT_CONTACT_INTERNAL_SELECT = [
  PATIENT_CONTACT_STANDARD_SELECT,
  '+normalizedValue',
].join(' ');

export const PATIENT_ADDRESS_STANDARD_SELECT = [
  '_id',
  'facilityId',
  'patientId',
  'addressType',
  'city',
  'district',
  'province',
  'countryCode',
  'isPrimary',
  'validFrom',
  'validTo',
  'status',
  'version',
  'createdAt',
  'updatedAt',
].join(' ');

export const PATIENT_ADDRESS_SENSITIVE_SELECT = [
  PATIENT_ADDRESS_STANDARD_SELECT,
  '+line1',
  '+line2',
  '+landmark',
  '+postalCode',
].join(' ');

export const PATIENT_ALERT_STANDARD_SELECT = [
  '_id',
  'facilityId',
  'patientId',
  'alertType',
  'severity',
  'visibility',
  'title',
  'effectiveFrom',
  'effectiveTo',
  'status',
  'version',
  'createdAt',
  'updatedAt',
].join(' ');

export const PATIENT_ALERT_SENSITIVE_SELECT = [
  PATIENT_ALERT_STANDARD_SELECT,
  '+details',
  '+resolutionReason',
].join(' ');

export function toPatientSummaryDto(
  patient: PatientRecord,
  primaryMrn: PatientIdentifierRecord | null,
): PatientSummaryDto {
  return {
    id:
      patient._id.toHexString(),
    facilityId:
      patient.facilityId.toHexString(),
    enterprisePatientId:
      patient.enterprisePatientId,
    mrn:
      primaryMrn?.displayValue ?? null,
    displayName:
      patient.displayName,
    preferredName:
      patient.preferredName,
    birthDate:
      patient.birthDate.value?.toISOString() ?? null,
    birthDatePrecision:
      patient.birthDate.precision,
    estimatedAgeYears:
      patient.birthDate.estimatedAgeYears,
    isMinor:
      patient.isMinor,
    sexAtBirth:
      patient.sexAtBirth,
    genderIdentity:
      patient.genderIdentity,
    status:
      patient.status,
    identityReviewRequired:
      patient.identityReviewRequired,
    duplicateReviewRequired:
      patient.duplicateReviewRequired,
    version:
      patient.version,
    registeredAt:
      patient.registeredAt.toISOString(),
    createdAt:
      patient.createdAt.toISOString(),
    updatedAt:
      patient.updatedAt.toISOString(),
  };
}

export function patientAuditSnapshot(
  patient: PatientRecord,
): Record<string, unknown> {
  return {
    patientId:
      patient._id.toHexString(),
    facilityId:
      patient.facilityId.toHexString(),
    status:
      patient.status,
    mergeState:
      patient.mergeState,
    isMinor:
      patient.isMinor,
    guardianRequirement:
      patient.guardianRequirement,
    identityReviewRequired:
      patient.identityReviewRequired,
    duplicateReviewRequired:
      patient.duplicateReviewRequired,
    version:
      patient.version,
  };
}

export function guardianAuditSnapshot(
  guardian: GuardianRecord,
): Record<string, unknown> {
  return {
    guardianId:
      guardian._id.toHexString(),
    facilityId:
      guardian.facilityId.toHexString(),
    status:
      guardian.status,
    hasCnic:
      guardian.cnicNormalized !== null,
    hasPhone:
      guardian.phoneNormalized !== null,
    version:
      guardian.version,
  };
}

export function identifierAuditSnapshot(
  identifier: PatientIdentifierRecord,
): Record<string, unknown> {
  return {
    identifierId:
      identifier._id.toHexString(),
    patientId:
      identifier.patientId.toHexString(),
    facilityId:
      identifier.facilityId.toHexString(),
    identifierType:
      identifier.identifierType,
    scope:
      identifier.scope,
    status:
      identifier.status,
    verificationStatus:
      identifier.verificationStatus,
    isPrimaryIdentity:
      identifier.isPrimaryIdentity,
    isPrimaryMrn:
      identifier.isPrimaryMrn,
    version:
      identifier.version,
  };
}