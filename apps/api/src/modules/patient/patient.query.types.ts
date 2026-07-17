import type {
  GuardianLegalAuthorityStatus,
  GuardianRelationshipType,
  GuardianStatus,
  GuardianVerificationStatus,
  PatientAddressStatus,
  PatientAddressType,
  PatientAlertSeverity,
  PatientAlertStatus,
  PatientAlertType,
  PatientAlertVisibility,
  PatientBirthDatePrecision,
  PatientContactPurpose,
  PatientContactStatus,
  PatientContactType,
  PatientGenderIdentity,
  PatientGuardianRequirement,
  PatientIdentifierStatus,
  PatientIdentifierType,
  PatientIdentifierVerification,
  PatientMergeState,
  PatientRegistrationSource,
  PatientSexAtBirth,
  PatientStatus,
} from '@hospital-mis/database';

import type {
  CanonicalPatientResolution,
} from './patient.merge.js';

import type {
  GuardianRecord,
  PatientAddressRecord,
  PatientAlertRecord,
  PatientContactRecord,
  PatientGuardianRecord,
  PatientIdentifierRecord,
  PatientRecord,
} from './patient.types.js';

export const patientSearchModeValues = [
  'AUTO',
  'MRN',
  'CNIC',
  'B_FORM',
  'GUARDIAN_CNIC',
  'PHONE',
  'NAME',
] as const;

export type PatientSearchMode =
  (typeof patientSearchModeValues)[number];

export const patientQueryAccessLevelValues = [
  'STANDARD',
  'SENSITIVE',
] as const;

export type PatientQueryAccessLevel =
  (typeof patientQueryAccessLevelValues)[number];

export const patientSearchMatchValues = [
  'MRN',
  'CNIC',
  'B_FORM',
  'GUARDIAN_CNIC',
  'PHONE',
  'NAME',
] as const;

export type PatientSearchMatch =
  (typeof patientSearchMatchValues)[number];

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PatientSearchQuery {
  term: string;
  mode: PatientSearchMode;
  status?: PatientStatus;
  sexAtBirth?: PatientSexAtBirth;
  isMinor?: boolean;
  duplicateReviewRequired?: boolean;
  includeMerged: boolean;
  page: number;
  pageSize: number;
}

export interface PatientProfileQuery {
  includeInactiveContacts: boolean;
  includeInactiveAddresses: boolean;
  includeInactiveGuardians: boolean;
  includeResolvedAlerts: boolean;
}

export interface GuardianSearchQuery {
  term?: string;
  status?: GuardianStatus;
  page: number;
  pageSize: number;
}

export interface GuardianProfileQuery {
  includeInactiveRelationships: boolean;
}

export interface PatientSearchCandidateRecord {
  patient: PatientRecord;
  primaryMrn: PatientIdentifierRecord;
  primaryContact: PatientContactRecord | null;
  matchedBy: PatientSearchMatch[];
  activeAlertCount: number;
  highestAlertSeverity: PatientAlertSeverity | null;
}

export interface PatientProfileRecords {
  patient: PatientRecord;
  identifiers: PatientIdentifierRecord[];
  contacts: PatientContactRecord[];
  addresses: PatientAddressRecord[];
  guardianRelationships: PatientGuardianRecord[];
  guardians: GuardianRecord[];
  alerts: PatientAlertRecord[];
}

export interface GuardianSearchCandidateRecord {
  guardian: GuardianRecord;
  activeRelationshipCount: number;
  minorPatientCount: number;
}

export interface GuardianProfileRecords {
  guardian: GuardianRecord;
  relationships: PatientGuardianRecord[];
  patients: PatientRecord[];
  primaryMrns: PatientIdentifierRecord[];
}

export interface PatientBirthSummaryDto {
  value: string | null;
  year: number | null;
  precision: PatientBirthDatePrecision;
  isApproximate: boolean;
  estimatedAgeYears: number | null;
  ageYears: number | null;
}

export interface PatientSearchItemDto {
  id: string;
  enterprisePatientId: string;
  mrn: string;
  displayName: string;
  preferredName: string | null;
  birth: PatientBirthSummaryDto;
  sexAtBirth: PatientSexAtBirth;
  genderIdentity: PatientGenderIdentity;
  isMinor: boolean;
  guardianRequirement: PatientGuardianRequirement;
  status: PatientStatus;
  mergeState: PatientMergeState;
  duplicateReviewRequired: boolean;
  primaryContact: string | null;
  activeAlertCount: number;
  highestAlertSeverity: PatientAlertSeverity | null;
  matchedBy: PatientSearchMatch[];
  redirectedFromPatientIds: string[];
}

export interface PatientIdentifierDto {
  id: string;
  identifierType: PatientIdentifierType;
  value: string;
  displayValue: string;
  verificationStatus: PatientIdentifierVerification;
  status: PatientIdentifierStatus;
  isPrimaryIdentity: boolean;
  isPrimaryMrn: boolean;
  validFrom: string | null;
  expiresAt: string | null;
}

export interface PatientContactDto {
  id: string;
  contactType: PatientContactType;
  purpose: PatientContactPurpose;
  value: string;
  displayValue: string;
  contactName: string | null;
  relationshipToPatient: string | null;
  relatedGuardianId: string | null;
  isPrimary: boolean;
  isEmergencyContact: boolean;
  consentToContact: boolean;
  isVerified: boolean;
  status: PatientContactStatus;
}

export interface PatientAddressDto {
  id: string;
  addressType: PatientAddressType;
  line1: string | null;
  line2: string | null;
  landmark: string | null;
  city: string;
  district: string | null;
  province: string | null;
  postalCode: string | null;
  countryCode: string;
  isPrimary: boolean;
  validFrom: string | null;
  validTo: string | null;
  status: PatientAddressStatus;
}

export interface PatientGuardianDto {
  relationshipId: string;
  guardianId: string;
  displayName: string;
  relationshipType: GuardianRelationshipType;
  relationshipDescription: string | null;
  cnic: string | null;
  cnicDisplayValue: string | null;
  phone: string | null;
  phoneDisplayValue: string | null;
  isPrimary: boolean;
  isEmergencyContact: boolean;
  livesWithPatient: boolean;
  isFinanciallyResponsible: boolean;
  legalAuthorityStatus: GuardianLegalAuthorityStatus;
  verificationStatus: GuardianVerificationStatus;
  canConsentToTreatment: boolean;
  canConsentToDisclosure: boolean;
  canReceiveClinicalInformation: boolean;
  authorityEffectiveFrom: string | null;
  authorityEffectiveTo: string | null;
  isActive: boolean;
}

export interface PatientAlertDto {
  id: string;
  alertType: PatientAlertType;
  severity: PatientAlertSeverity;
  visibility: PatientAlertVisibility;
  title: string;
  details: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: PatientAlertStatus;
  resolvedAt: string | null;
}

export interface PatientProfileDto {
  canonicalization: CanonicalPatientResolution;
  patient: {
    id: string;
    enterprisePatientId: string;
    mrn: string;
    displayName: string;
    preferredName: string | null;
    firstName: string;
    middleName: string | null;
    lastName: string | null;
    birth: PatientBirthSummaryDto;
    sexAtBirth: PatientSexAtBirth;
    genderIdentity: PatientGenderIdentity;
    genderDescription: string | null;
    preferredLocale: string;
    nationalityCountryCode: string;
    isMinor: boolean;
    guardianRequirement: PatientGuardianRequirement;
    status: PatientStatus;
    mergeState: PatientMergeState;
    identityReviewRequired: boolean;
    duplicateReviewRequired: boolean;
    registrationSource: PatientRegistrationSource;
    registeredAt: string;
    version: number;
  };
  identifiers: PatientIdentifierDto[];
  contacts: PatientContactDto[];
  addresses: PatientAddressDto[];
  guardians: PatientGuardianDto[];
  alerts: PatientAlertDto[];
}

export interface GuardianSearchItemDto {
  id: string;
  enterpriseGuardianId: string;
  displayName: string;
  cnicDisplayValue: string | null;
  phoneDisplayValue: string | null;
  status: GuardianStatus;
  activeRelationshipCount: number;
  minorPatientCount: number;
  version: number;
}

export interface GuardianPatientSummaryDto {
  relationshipId: string;
  patientId: string;
  mrn: string;
  displayName: string;
  relationshipType: GuardianRelationshipType;
  isPrimary: boolean;
  legalAuthorityStatus: GuardianLegalAuthorityStatus;
  verificationStatus: GuardianVerificationStatus;
  isActive: boolean;
  patientStatus: PatientStatus;
  isMinor: boolean;
}

export interface GuardianProfileDto {
  guardian: {
    id: string;
    enterpriseGuardianId: string;
    displayName: string;
    firstName: string;
    middleName: string | null;
    lastName: string | null;
    cnic: string | null;
    cnicDisplayValue: string | null;
    phone: string | null;
    phoneDisplayValue: string | null;
    email: string | null;
    dateOfBirth: string | null;
    sexAtBirth: PatientSexAtBirth;
    genderIdentity: PatientGenderIdentity;
    preferredLocale: string;
    address: {
      line1: string | null;
      line2: string | null;
      city: string | null;
      district: string | null;
      province: string | null;
      postalCode: string | null;
      countryCode: string;
    };
    status: GuardianStatus;
    version: number;
  };
  patients: GuardianPatientSummaryDto[];
}

export interface PatientRegistrationSlipDto {
  documentType: 'PATIENT_REGISTRATION_SLIP';
  mrn: string;
  displayName: string;
  birthYear: number | null;
  sexAtBirth: PatientSexAtBirth;
  isMinor: boolean;
  guardianNames: string[];
  primaryContact: string | null;
  registrationSource: PatientRegistrationSource;
  registeredAt: string;
  machineReadableValue: string;
  generatedAt: string;
}