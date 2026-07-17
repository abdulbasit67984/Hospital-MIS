import type {
  GuardianRecord,
  PatientAddressRecord,
  PatientAlertRecord,
  PatientContactRecord,
  PatientGuardianRecord,
  PatientIdentifierRecord,
  PatientRecord,
} from './patient.types.js';

export interface PatientMutationDto {
  id: string;
  facilityId: string;
  status: PatientRecord['status'];
  mergeState: PatientRecord['mergeState'];
  isMinor: boolean;
  guardianRequirement: PatientRecord['guardianRequirement'];
  identityReviewRequired: boolean;
  duplicateReviewRequired: boolean;
  version: number;
  updatedAt: string;
}

export interface GuardianMutationDto {
  id: string;
  facilityId: string;
  status: GuardianRecord['status'];
  hasCnic: boolean;
  hasPhone: boolean;
  version: number;
  updatedAt: string;
}

export interface PatientIdentifierMutationDto {
  id: string;
  patientId: string;
  facilityId: string;
  identifierType: PatientIdentifierRecord['identifierType'];
  displayValue: string;
  scope: PatientIdentifierRecord['scope'];
  status: PatientIdentifierRecord['status'];
  verificationStatus: PatientIdentifierRecord['verificationStatus'];
  isPrimaryIdentity: boolean;
  isPrimaryMrn: boolean;
  version: number;
  updatedAt: string;
}

export interface PatientGuardianMutationDto {
  id: string;
  patientId: string;
  guardianId: string;
  facilityId: string;
  relationshipType: PatientGuardianRecord['relationshipType'];
  isPrimary: boolean;
  isEmergencyContact: boolean;
  legalAuthorityStatus: PatientGuardianRecord['legalAuthorityStatus'];
  verificationStatus: PatientGuardianRecord['verificationStatus'];
  canConsentToTreatment: boolean;
  canConsentToDisclosure: boolean;
  canReceiveClinicalInformation: boolean;
  isActive: boolean;
  version: number;
  updatedAt: string;
}

export interface PatientContactMutationDto {
  id: string;
  patientId: string;
  facilityId: string;
  contactType: PatientContactRecord['contactType'];
  purpose: PatientContactRecord['purpose'];
  displayValue: string;
  contactName: string | null;
  relationshipToPatient: string | null;
  relatedGuardianId: string | null;
  isPrimary: boolean;
  isEmergencyContact: boolean;
  consentToContact: boolean;
  isVerified: boolean;
  status: PatientContactRecord['status'];
  version: number;
  updatedAt: string;
}

export interface PatientAddressMutationDto {
  id: string;
  patientId: string;
  facilityId: string;
  addressType: PatientAddressRecord['addressType'];
  city: string;
  district: string | null;
  province: string | null;
  countryCode: string;
  isPrimary: boolean;
  validFrom: string | null;
  validTo: string | null;
  status: PatientAddressRecord['status'];
  version: number;
  updatedAt: string;
}

export interface PatientAlertMutationDto {
  id: string;
  patientId: string;
  facilityId: string;
  alertType: PatientAlertRecord['alertType'];
  severity: PatientAlertRecord['severity'];
  visibility: PatientAlertRecord['visibility'];
  title: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: PatientAlertRecord['status'];
  resolvedAt: string | null;
  version: number;
  updatedAt: string;
}

export function toPatientMutationDto(
  patient: PatientRecord,
): PatientMutationDto {
  return {
    id:
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
    updatedAt:
      patient.updatedAt.toISOString(),
  };
}

export function toGuardianMutationDto(
  guardian: GuardianRecord,
): GuardianMutationDto {
  return {
    id:
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
    updatedAt:
      guardian.updatedAt.toISOString(),
  };
}

export function toPatientIdentifierMutationDto(
  identifier: PatientIdentifierRecord,
): PatientIdentifierMutationDto {
  return {
    id:
      identifier._id.toHexString(),
    patientId:
      identifier.patientId.toHexString(),
    facilityId:
      identifier.facilityId.toHexString(),
    identifierType:
      identifier.identifierType,
    displayValue:
      identifier.displayValue,
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
    updatedAt:
      identifier.updatedAt.toISOString(),
  };
}

export function toPatientGuardianMutationDto(
  relationship: PatientGuardianRecord,
): PatientGuardianMutationDto {
  return {
    id:
      relationship._id.toHexString(),
    patientId:
      relationship.patientId.toHexString(),
    guardianId:
      relationship.guardianId.toHexString(),
    facilityId:
      relationship.facilityId.toHexString(),
    relationshipType:
      relationship.relationshipType,
    isPrimary:
      relationship.isPrimary,
    isEmergencyContact:
      relationship.isEmergencyContact,
    legalAuthorityStatus:
      relationship.legalAuthorityStatus,
    verificationStatus:
      relationship.verificationStatus,
    canConsentToTreatment:
      relationship.canConsentToTreatment,
    canConsentToDisclosure:
      relationship.canConsentToDisclosure,
    canReceiveClinicalInformation:
      relationship.canReceiveClinicalInformation,
    isActive:
      relationship.isActive,
    version:
      relationship.version,
    updatedAt:
      relationship.updatedAt.toISOString(),
  };
}

export function toPatientContactMutationDto(
  contact: PatientContactRecord,
): PatientContactMutationDto {
  return {
    id:
      contact._id.toHexString(),
    patientId:
      contact.patientId.toHexString(),
    facilityId:
      contact.facilityId.toHexString(),
    contactType:
      contact.contactType,
    purpose:
      contact.purpose,
    displayValue:
      contact.displayValue,
    contactName:
      contact.contactName,
    relationshipToPatient:
      contact.relationshipToPatient,
    relatedGuardianId:
      contact.relatedGuardianId?.toHexString() ??
      null,
    isPrimary:
      contact.isPrimary,
    isEmergencyContact:
      contact.isEmergencyContact,
    consentToContact:
      contact.consentToContact,
    isVerified:
      contact.isVerified,
    status:
      contact.status,
    version:
      contact.version,
    updatedAt:
      contact.updatedAt.toISOString(),
  };
}

export function toPatientAddressMutationDto(
  address: PatientAddressRecord,
): PatientAddressMutationDto {
  return {
    id:
      address._id.toHexString(),
    patientId:
      address.patientId.toHexString(),
    facilityId:
      address.facilityId.toHexString(),
    addressType:
      address.addressType,
    city:
      address.city,
    district:
      address.district,
    province:
      address.province,
    countryCode:
      address.countryCode,
    isPrimary:
      address.isPrimary,
    validFrom:
      address.validFrom?.toISOString() ??
      null,
    validTo:
      address.validTo?.toISOString() ??
      null,
    status:
      address.status,
    version:
      address.version,
    updatedAt:
      address.updatedAt.toISOString(),
  };
}

export function toPatientAlertMutationDto(
  alert: PatientAlertRecord,
): PatientAlertMutationDto {
  return {
    id:
      alert._id.toHexString(),
    patientId:
      alert.patientId.toHexString(),
    facilityId:
      alert.facilityId.toHexString(),
    alertType:
      alert.alertType,
    severity:
      alert.severity,
    visibility:
      alert.visibility,
    title:
      alert.title,
    effectiveFrom:
      alert.effectiveFrom.toISOString(),
    effectiveTo:
      alert.effectiveTo?.toISOString() ??
      null,
    status:
      alert.status,
    resolvedAt:
      alert.resolvedAt?.toISOString() ??
      null,
    version:
      alert.version,
    updatedAt:
      alert.updatedAt.toISOString(),
  };
}

export function patientMutationAuditSnapshot(
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

export function guardianMutationAuditSnapshot(
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

export function identifierMutationAuditSnapshot(
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

export function patientGuardianMutationAuditSnapshot(
  relationship: PatientGuardianRecord,
): Record<string, unknown> {
  return {
    relationshipId:
      relationship._id.toHexString(),
    patientId:
      relationship.patientId.toHexString(),
    guardianId:
      relationship.guardianId.toHexString(),
    facilityId:
      relationship.facilityId.toHexString(),
    relationshipType:
      relationship.relationshipType,
    isPrimary:
      relationship.isPrimary,
    isEmergencyContact:
      relationship.isEmergencyContact,
    legalAuthorityStatus:
      relationship.legalAuthorityStatus,
    verificationStatus:
      relationship.verificationStatus,
    canConsentToTreatment:
      relationship.canConsentToTreatment,
    canConsentToDisclosure:
      relationship.canConsentToDisclosure,
    canReceiveClinicalInformation:
      relationship.canReceiveClinicalInformation,
    isActive:
      relationship.isActive,
    version:
      relationship.version,
  };
}

export function patientContactMutationAuditSnapshot(
  contact: PatientContactRecord,
): Record<string, unknown> {
  return {
    contactId:
      contact._id.toHexString(),
    patientId:
      contact.patientId.toHexString(),
    facilityId:
      contact.facilityId.toHexString(),
    contactType:
      contact.contactType,
    purpose:
      contact.purpose,
    isPrimary:
      contact.isPrimary,
    isEmergencyContact:
      contact.isEmergencyContact,
    consentToContact:
      contact.consentToContact,
    isVerified:
      contact.isVerified,
    status:
      contact.status,
    hasRelatedGuardian:
      contact.relatedGuardianId !== null,
    version:
      contact.version,
  };
}

export function patientAddressMutationAuditSnapshot(
  address: PatientAddressRecord,
): Record<string, unknown> {
  return {
    addressId:
      address._id.toHexString(),
    patientId:
      address.patientId.toHexString(),
    facilityId:
      address.facilityId.toHexString(),
    addressType:
      address.addressType,
    countryCode:
      address.countryCode,
    isPrimary:
      address.isPrimary,
    status:
      address.status,
    hasValidityEnd:
      address.validTo !== null,
    version:
      address.version,
  };
}

export function patientAlertMutationAuditSnapshot(
  alert: PatientAlertRecord,
): Record<string, unknown> {
  return {
    alertId:
      alert._id.toHexString(),
    patientId:
      alert.patientId.toHexString(),
    facilityId:
      alert.facilityId.toHexString(),
    alertType:
      alert.alertType,
    severity:
      alert.severity,
    visibility:
      alert.visibility,
    status:
      alert.status,
    hasExpiry:
      alert.effectiveTo !== null,
    resolved:
      alert.resolvedAt !== null,
    version:
      alert.version,
  };
}