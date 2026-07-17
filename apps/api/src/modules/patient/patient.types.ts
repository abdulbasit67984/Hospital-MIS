import type {
  Types,
} from 'mongoose';

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
  PatientIdentifierScope,
  PatientIdentifierStatus,
  PatientIdentifierType,
  PatientIdentifierVerification,
  PatientMergeState,
  PatientRegistrationSource,
  PatientSexAtBirth,
  PatientStatus,
} from '@hospital-mis/database';

import type {
  PatientDuplicateMatchLevel,
  PatientDuplicateReason,
  PatientSortField,
} from './patient.constants.js';

export type ObjectIdString =
  string;

export type SortDirection =
  | 'asc'
  | 'desc';

export interface PatientActorContext {
  userId: ObjectIdString;
  facilityId: ObjectIdString;
  correlationId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface PatientLocalizedNameInput {
  locale: string;
  fullName: string;
}

export interface PatientBirthDateInput {
  value: string | null;
  precision: PatientBirthDatePrecision;
  isApproximate: boolean;
  estimatedAgeYears: number | null;
  estimatedAsOfDate: string | null;
}

export interface PatientBirthDateRecord {
  value: Date | null;
  precision: PatientBirthDatePrecision;
  isApproximate: boolean;
  estimatedAgeYears: number | null;
  estimatedAsOfDate: Date | null;
}

export interface PatientIdentifierInput {
  identifierType: Exclude<
    PatientIdentifierType,
    'MRN'
  >;
  value: string;
  issuingCountryCode: string;
  issuingAuthority?: string | null;
  isPrimaryIdentity?: boolean;
  validFrom?: string | null;
  expiresAt?: string | null;
}

export interface PatientContactInput {
  contactType: PatientContactType;
  purpose: PatientContactPurpose;
  value: string;
  contactName?: string | null;
  relationshipToPatient?: string | null;
  relatedGuardianId?: ObjectIdString | null;
  isPrimary?: boolean;
  isEmergencyContact?: boolean;
  consentToContact?: boolean;
}

export interface PatientAddressInput {
  addressType: PatientAddressType;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  district?: string | null;
  province?: string | null;
  postalCode?: string | null;
  countryCode: string;
  isPrimary?: boolean;
  validFrom?: string | null;
  validTo?: string | null;
}

export interface GuardianInput {
  firstName: string;
  middleName?: string | null;
  lastName?: string | null;
  localizedNames?: readonly PatientLocalizedNameInput[];
  cnic: string;
  dateOfBirth?: string | null;
  sexAtBirth?: PatientSexAtBirth;
  genderIdentity?: PatientGenderIdentity;
  phone?: string | null;
  email?: string | null;
  address?: Readonly<{
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    district?: string | null;
    province?: string | null;
    postalCode?: string | null;
    countryCode?: string;
  }>;
  preferredLocale?: string;
}

export interface PatientGuardianLinkInput {
  guardianId: ObjectIdString;
  relationshipType: GuardianRelationshipType;
  relationshipDescription?: string | null;
  isPrimary?: boolean;
  isEmergencyContact?: boolean;
  livesWithPatient?: boolean;
  isFinanciallyResponsible?: boolean;
  legalAuthorityStatus?: GuardianLegalAuthorityStatus;
  canConsentToTreatment?: boolean;
  canConsentToDisclosure?: boolean;
  canReceiveClinicalInformation?: boolean;
  authorityBasis?: string | null;
  authorityEffectiveFrom?: string | null;
  authorityEffectiveTo?: string | null;
  supportingAttachmentIds?: readonly ObjectIdString[];
}

export interface RegisterPatientInput {
  firstName: string;
  middleName?: string | null;
  lastName?: string | null;
  preferredName?: string | null;
  localizedNames?: readonly PatientLocalizedNameInput[];
  birthDate: PatientBirthDateInput;
  isMinor: boolean;
  sexAtBirth: PatientSexAtBirth;
  genderIdentity?: PatientGenderIdentity;
  genderDescription?: string | null;
  preferredLocale?: string;
  nationalityCountryCode?: string;
  registrationSource?: PatientRegistrationSource;
  identifiers?: readonly PatientIdentifierInput[];
  contacts?: readonly PatientContactInput[];
  addresses?: readonly PatientAddressInput[];
  guardian?: GuardianInput;
  guardianRelationship?: Omit<
    PatientGuardianLinkInput,
    'guardianId'
  >;
}

export interface UpdatePatientInput {
  firstName?: string;
  middleName?: string | null;
  lastName?: string | null;
  preferredName?: string | null;
  localizedNames?: readonly PatientLocalizedNameInput[];
  birthDate?: PatientBirthDateInput;
  isMinor?: boolean;
  guardianRequirement?: PatientGuardianRequirement;
  sexAtBirth?: PatientSexAtBirth;
  genderIdentity?: PatientGenderIdentity;
  genderDescription?: string | null;
  preferredLocale?: string;
  nationalityCountryCode?: string;
  status?: Exclude<PatientStatus, 'MERGED'>;
  statusReason?: string | null;
  identityReviewRequired?: boolean;
  duplicateReviewRequired?: boolean;
  expectedVersion: number;
  reason: string;
}

export interface UpdateGuardianInput {
  firstName?: string;
  middleName?: string | null;
  lastName?: string | null;
  localizedNames?: readonly PatientLocalizedNameInput[];
  cnic?: string | null;
  dateOfBirth?: string | null;
  sexAtBirth?: PatientSexAtBirth;
  genderIdentity?: PatientGenderIdentity;
  phone?: string | null;
  email?: string | null;
  address?: GuardianInput['address'];
  preferredLocale?: string;
  status?: Exclude<GuardianStatus, 'MERGED'>;
  statusReason?: string | null;
  expectedVersion: number;
  reason: string;
}

export interface PatientListQuery {
  page: number;
  pageSize: number;
  sortBy: PatientSortField;
  sortDirection: SortDirection;
  search?: string;
  status?: PatientStatus;
  isMinor?: boolean;
}

export interface PatientPageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PatientRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  enterprisePatientId: string;
  canonicalPatientId: Types.ObjectId | null;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  preferredName: string | null;
  displayName: string;
  normalizedFullName: string;
  nameSearchTokens: string[];
  localizedNames: Array<{
    locale: string;
    fullName: string;
    normalizedFullName: string;
  }>;
  birthDate: PatientBirthDateRecord;
  isMinor: boolean;
  guardianRequirement: PatientGuardianRequirement;
  sexAtBirth: PatientSexAtBirth;
  genderIdentity: PatientGenderIdentity;
  genderDescription: string | null;
  preferredLocale: string;
  nationalityCountryCode: string;
  status: PatientStatus;
  mergeState: PatientMergeState;
  mergedIntoPatientId: Types.ObjectId | null;
  mergedAt: Date | null;
  mergedBy: Types.ObjectId | null;
  mergeReason: string | null;
  deceasedAt: Date | null;
  statusReason: string | null;
  identityReviewRequired: boolean;
  duplicateReviewRequired: boolean;
  registrationSource: PatientRegistrationSource;
  registeredAt: Date;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PatientIdentifierRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  patientId: Types.ObjectId;
  issuingFacilityId: Types.ObjectId | null;
  identifierType: PatientIdentifierType;
  scope: PatientIdentifierScope;
  normalizedValue: string;
  displayValue: string;
  issuingCountryCode: string;
  issuingAuthority: string | null;
  isPrimaryIdentity: boolean;
  isPrimaryMrn: boolean;
  verificationStatus: PatientIdentifierVerification;
  verifiedAt: Date | null;
  verifiedBy: Types.ObjectId | null;
  validFrom: Date | null;
  expiresAt: Date | null;
  status: PatientIdentifierStatus;
  replacedByIdentifierId: Types.ObjectId | null;
  statusReason: string | null;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GuardianRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  enterpriseGuardianId: string;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  displayName: string;
  normalizedFullName: string;
  localizedNames: Array<{
    locale: string;
    fullName: string;
    normalizedFullName: string;
  }>;
  cnicNormalized: string | null;
  cnicDisplayValue: string | null;
  dateOfBirth: Date | null;
  sexAtBirth: PatientSexAtBirth;
  genderIdentity: PatientGenderIdentity;
  phoneNormalized: string | null;
  phoneDisplayValue: string | null;
  emailNormalized: string | null;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    district: string | null;
    province: string | null;
    postalCode: string | null;
    countryCode: string;
  };
  preferredLocale: string;
  status: GuardianStatus;
  mergedIntoGuardianId: Types.ObjectId | null;
  mergedAt: Date | null;
  mergedBy: Types.ObjectId | null;
  statusReason: string | null;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PatientGuardianRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  patientId: Types.ObjectId;
  guardianId: Types.ObjectId;
  relationshipType: GuardianRelationshipType;
  relationshipDescription: string | null;
  isPrimary: boolean;
  isEmergencyContact: boolean;
  livesWithPatient: boolean;
  isFinanciallyResponsible: boolean;
  legalAuthorityStatus: GuardianLegalAuthorityStatus;
  canConsentToTreatment: boolean;
  canConsentToDisclosure: boolean;
  canReceiveClinicalInformation: boolean;
  authorityBasis: string | null;
  authorityEffectiveFrom: Date | null;
  authorityEffectiveTo: Date | null;
  verificationStatus: GuardianVerificationStatus;
  verifiedAt: Date | null;
  verifiedBy: Types.ObjectId | null;
  verificationNotes: string | null;
  supportingAttachmentIds: Types.ObjectId[];
  isActive: boolean;
  endedAt: Date | null;
  endedBy: Types.ObjectId | null;
  endReason: string | null;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PatientContactRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  patientId: Types.ObjectId;
  contactType: PatientContactType;
  purpose: PatientContactPurpose;
  normalizedValue: string;
  displayValue: string;
  contactName: string | null;
  relationshipToPatient: string | null;
  relatedGuardianId: Types.ObjectId | null;
  isPrimary: boolean;
  isEmergencyContact: boolean;
  consentToContact: boolean;
  isVerified: boolean;
  verifiedAt: Date | null;
  verifiedBy: Types.ObjectId | null;
  status: PatientContactStatus;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PatientAddressRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  patientId: Types.ObjectId;
  addressType: PatientAddressType;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  district: string | null;
  province: string | null;
  postalCode: string | null;
  countryCode: string;
  isPrimary: boolean;
  validFrom: Date | null;
  validTo: Date | null;
  status: PatientAddressStatus;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PatientAlertRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  patientId: Types.ObjectId;
  alertType: PatientAlertType;
  severity: PatientAlertSeverity;
  visibility: PatientAlertVisibility;
  title: string;
  details: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  status: PatientAlertStatus;
  resolvedAt: Date | null;
  resolvedBy: Types.ObjectId | null;
  resolutionReason: string | null;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PatientSummaryDto {
  id: ObjectIdString;
  facilityId: ObjectIdString;
  enterprisePatientId: string;
  mrn: string | null;
  displayName: string;
  preferredName: string | null;
  birthDate: string | null;
  birthDatePrecision: PatientBirthDatePrecision;
  estimatedAgeYears: number | null;
  isMinor: boolean;
  sexAtBirth: PatientSexAtBirth;
  genderIdentity: PatientGenderIdentity;
  status: PatientStatus;
  identityReviewRequired: boolean;
  duplicateReviewRequired: boolean;
  version: number;
  registeredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PatientIdentifierMatch {
  patientId: ObjectIdString;
  facilityId: ObjectIdString;
  identifierType: PatientIdentifierType;
}

export interface PatientDuplicateCandidate {
  patientId: ObjectIdString | null;
  facilityId: ObjectIdString | null;
  displayName: string | null;
  mrn: string | null;
  crossFacility: boolean;
  score: number;
  level: PatientDuplicateMatchLevel;
  reasons: PatientDuplicateReason[];
}

export interface PatientDuplicateAssessment {
  blocked: boolean;
  highestLevel: PatientDuplicateMatchLevel;
  candidates: PatientDuplicateCandidate[];
}

export interface PatientDuplicateCheckInput {
  facilityId: ObjectIdString;
  excludePatientId?: ObjectIdString;
  firstName: string;
  middleName?: string | null;
  lastName?: string | null;
  birthDate: PatientBirthDateInput;
  isMinor: boolean;
  identifiers: readonly PatientIdentifierInput[];
  phones: readonly string[];
  guardianCnic?: string | null;
}

export interface MedicalRecordNumberAllocation {
  facilityId: ObjectIdString;
  facilityCode: string;
  year: number;
  sequenceValue: number;
  mrn: string;
  normalizedMrn: string;
}