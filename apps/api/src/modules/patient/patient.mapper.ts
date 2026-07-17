import type {
  GuardianRecord,
  PatientDuplicateAssessment,
  PatientGuardianRecord,
  PatientIdentifierRecord,
  PatientRecord,
} from './patient.types.js';

export interface PatientRegistrationIdentifierDto {
  id: string;
  identifierType: PatientIdentifierRecord['identifierType'];
  displayValue: string;
  verificationStatus: PatientIdentifierRecord['verificationStatus'];
  status: PatientIdentifierRecord['status'];
  isPrimaryIdentity: boolean;
  isPrimaryMrn: boolean;
}

export interface PatientRegistrationGuardianDto {
  id: string;
  relationshipId: string;
  relationshipType: PatientGuardianRecord['relationshipType'];
  isPrimary: boolean;
  legalAuthorityStatus: PatientGuardianRecord['legalAuthorityStatus'];
  verificationStatus: PatientGuardianRecord['verificationStatus'];
  createdDuringRegistration: boolean;
}

export interface PatientRegistrationResult {
  patient: {
    id: string;
    facilityId: string;
    enterprisePatientId: string;
    mrn: string;
    status: PatientRecord['status'];
    version: number;
    registeredAt: string;
  };
  identifiers: PatientRegistrationIdentifierDto[];
  guardian: PatientRegistrationGuardianDto | null;
  duplicateReviewRequired: boolean;
  duplicateCandidateCount: number;
}

export function toPatientRegistrationResult(
  input: Readonly<{
    patient: PatientRecord;
    primaryMrn: PatientIdentifierRecord;
    identifiers: readonly PatientIdentifierRecord[];
    guardian: GuardianRecord | null;
    relationship: PatientGuardianRecord | null;
    guardianCreated: boolean;
    duplicateAssessment: PatientDuplicateAssessment;
  }>,
): PatientRegistrationResult {
  const allIdentifiers = [
    input.primaryMrn,
    ...input.identifiers,
  ];

  return {
    patient: {
      id:
        input.patient._id.toHexString(),
      facilityId:
        input.patient.facilityId.toHexString(),
      enterprisePatientId:
        input.patient.enterprisePatientId,
      mrn:
        input.primaryMrn.displayValue,
      status:
        input.patient.status,
      version:
        input.patient.version,
      registeredAt:
        input.patient.registeredAt.toISOString(),
    },
    identifiers:
      allIdentifiers.map(
        (identifier) => ({
          id:
            identifier._id.toHexString(),
          identifierType:
            identifier.identifierType,
          displayValue:
            identifier.displayValue,
          verificationStatus:
            identifier.verificationStatus,
          status:
            identifier.status,
          isPrimaryIdentity:
            identifier.isPrimaryIdentity,
          isPrimaryMrn:
            identifier.isPrimaryMrn,
        }),
      ),
    guardian:
      input.guardian === null ||
      input.relationship === null
        ? null
        : {
            id:
              input.guardian._id.toHexString(),
            relationshipId:
              input.relationship._id.toHexString(),
            relationshipType:
              input.relationship.relationshipType,
            isPrimary:
              input.relationship.isPrimary,
            legalAuthorityStatus:
              input.relationship.legalAuthorityStatus,
            verificationStatus:
              input.relationship.verificationStatus,
            createdDuringRegistration:
              input.guardianCreated,
          },
    duplicateReviewRequired:
      input.patient.duplicateReviewRequired,
    duplicateCandidateCount:
      input.duplicateAssessment.candidates.length,
  };
}

export function patientRegistrationAuditSnapshot(
  input: Readonly<{
    patient: PatientRecord;
    primaryMrn: PatientIdentifierRecord;
    identifiers: readonly PatientIdentifierRecord[];
    guardian: GuardianRecord | null;
    relationship: PatientGuardianRecord | null;
    guardianCreated: boolean;
    duplicateAssessment: PatientDuplicateAssessment;
  }>,
): Record<string, unknown> {
  return {
    patientId:
      input.patient._id.toHexString(),
    facilityId:
      input.patient.facilityId.toHexString(),
    mrn:
      input.primaryMrn.displayValue,
    status:
      input.patient.status,
    identifierTypes:
      input.identifiers.map(
        (identifier) =>
          identifier.identifierType,
      ),
    guardianId:
      input.guardian?._id.toHexString() ?? null,
    guardianRelationshipId:
      input.relationship?._id.toHexString() ?? null,
    guardianCreated:
      input.guardianCreated,
    duplicateReviewRequired:
      input.patient.duplicateReviewRequired,
    duplicateMatchLevel:
      input.duplicateAssessment.highestLevel,
    duplicateCandidateCount:
      input.duplicateAssessment.candidates.length,
    version:
      input.patient.version,
  };
}

export function patientRegistrationOutboxPayload(
  input: Readonly<{
    patient: PatientRecord;
    primaryMrn: PatientIdentifierRecord;
    identifiers: readonly PatientIdentifierRecord[];
    guardian: GuardianRecord | null;
    relationship: PatientGuardianRecord | null;
    duplicateAssessment: PatientDuplicateAssessment;
  }>,
): Record<string, unknown> {
  return {
    patientId:
      input.patient._id.toHexString(),
    facilityId:
      input.patient.facilityId.toHexString(),
    enterprisePatientId:
      input.patient.enterprisePatientId,
    mrn:
      input.primaryMrn.displayValue,
    status:
      input.patient.status,
    identifierTypes:
      input.identifiers.map(
        (identifier) =>
          identifier.identifierType,
      ),
    guardianRelationshipId:
      input.relationship?._id.toHexString() ?? null,
    guardianId:
      input.guardian?._id.toHexString() ?? null,
    duplicateReviewRequired:
      input.patient.duplicateReviewRequired,
    duplicateMatchLevel:
      input.duplicateAssessment.highestLevel,
  };
}