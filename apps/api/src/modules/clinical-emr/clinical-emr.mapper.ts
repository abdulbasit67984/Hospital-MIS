import type {
  ClinicalNoteRecord,
  EncounterDiagnosisRecord,
  EncounterRecord,
  PatientAllergyRecord,
  PatientProblemRecord,
} from './clinical-emr.types.js';

export interface EncounterMutationResult {
  encounterId: string;
  encounterNumber: string;
  patientId: string;
  requestedPatientId: string;
  canonicalRedirected: boolean;
  registrationId: string | null;
  opdVisitId: string | null;
  queueTokenId: string | null;
  encounterType: EncounterRecord['encounterType'];
  careContext: EncounterRecord['careContext'];
  status: EncounterRecord['status'];
  serviceDate: string;
  departmentId: string;
  clinicId: string | null;
  servicePointId: string | null;
  primaryProviderId: string;
  currentOwnerId: string;
  currentOwnerRole: EncounterRecord['currentOwnerRole'];
  assignedProviderIds: string[];
  confidentiality: EncounterRecord['confidentiality'];
  startedAt: string;
  lastClinicalActivityAt: string;
  completedAt: string | null;
  signedAt: string | null;
  signedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
  cancelledAt: string | null;
  supersedesEncounterId: string | null;
  supersededByEncounterId: string | null;
  amendmentCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicalNoteMutationResult {
  clinicalNoteId: string;
  noteNumber: string;
  encounterId: string;
  patientId: string;
  authorProviderId: string;
  documentType: ClinicalNoteRecord['documentType'];
  title: string | null;
  narrativeText: string | null;
  structuredData: Record<string, unknown> | readonly unknown[] | null;
  status: ClinicalNoteRecord['status'];
  confidentiality: ClinicalNoteRecord['confidentiality'];
  currentVersion: number;
  latestVersionId: string | null;
  finalizedAt: string | null;
  finalizedBy: string | null;
  signedAt: string | null;
  signedBy: string | null;
  signatureMethod: ClinicalNoteRecord['signatureMethod'];
  amendedAt: string | null;
  amendedBy: string | null;
  correctedAt: string | null;
  correctedBy: string | null;
  enteredInErrorAt: string | null;
  enteredInErrorBy: string | null;
  addendumToNoteId: string | null;
  supersedesNoteId: string | null;
  supersededByNoteId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

function id(
  value: { toHexString(): string } | null,
): string | null {
  return value?.toHexString() ?? null;
}

export function toEncounterMutationResult(
  record: EncounterRecord,
): EncounterMutationResult {
  return {
    encounterId: record._id.toHexString(),
    encounterNumber: record.encounterNumber,
    patientId: record.patientId.toHexString(),
    requestedPatientId: record.requestedPatientId.toHexString(),
    canonicalRedirected: record.canonicalRedirected,
    registrationId: id(record.registrationId),
    opdVisitId: id(record.opdVisitId),
    queueTokenId: id(record.queueTokenId),
    encounterType: record.encounterType,
    careContext: record.careContext,
    status: record.status,
    serviceDate: record.serviceDate,
    departmentId: record.departmentId.toHexString(),
    clinicId: id(record.clinicId),
    servicePointId: id(record.servicePointId),
    primaryProviderId: record.primaryProviderId.toHexString(),
    currentOwnerId: record.currentOwnerId.toHexString(),
    currentOwnerRole: record.currentOwnerRole,
    assignedProviderIds: record.assignedProviderIds.map(
      (providerId) => providerId.toHexString(),
    ),
    confidentiality: record.confidentiality,
    startedAt: record.startedAt.toISOString(),
    lastClinicalActivityAt: record.lastClinicalActivityAt.toISOString(),
    completedAt: record.completedAt?.toISOString() ?? null,
    signedAt: record.signedAt?.toISOString() ?? null,
    signedBy: id(record.signedBy),
    closedAt: record.closedAt?.toISOString() ?? null,
    closedBy: id(record.closedBy),
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
    supersedesEncounterId: id(record.supersedesEncounterId),
    supersededByEncounterId: id(record.supersededByEncounterId),
    amendmentCount: record.amendmentCount,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toClinicalNoteMutationResult(
  record: ClinicalNoteRecord,
): ClinicalNoteMutationResult {
  return {
    clinicalNoteId: record._id.toHexString(),
    noteNumber: record.noteNumber,
    encounterId: record.encounterId.toHexString(),
    patientId: record.patientId.toHexString(),
    authorProviderId: record.authorProviderId.toHexString(),
    documentType: record.documentType,
    title: record.title,
    narrativeText: record.narrativeText,
    structuredData:
      record.structuredData as
        | Record<string, unknown>
        | readonly unknown[]
        | null,
    status: record.status,
    confidentiality: record.confidentiality,
    currentVersion: record.currentVersion,
    latestVersionId: id(record.latestVersionId),
    finalizedAt: record.finalizedAt?.toISOString() ?? null,
    finalizedBy: id(record.finalizedBy),
    signedAt: record.signedAt?.toISOString() ?? null,
    signedBy: id(record.signedBy),
    signatureMethod: record.signatureMethod,
    amendedAt: record.amendedAt?.toISOString() ?? null,
    amendedBy: id(record.amendedBy),
    correctedAt: record.correctedAt?.toISOString() ?? null,
    correctedBy: id(record.correctedBy),
    enteredInErrorAt: record.enteredInErrorAt?.toISOString() ?? null,
    enteredInErrorBy: id(record.enteredInErrorBy),
    addendumToNoteId: id(record.addendumToNoteId),
    supersedesNoteId: id(record.supersedesNoteId),
    supersededByNoteId: id(record.supersededByNoteId),
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export interface EncounterDiagnosisMutationResult {
  encounterDiagnosisId: string;
  encounterId: string;
  patientId: string;
  diagnosisId: string | null;
  codeSystem: EncounterDiagnosisRecord['codeSystem'];
  code: string;
  display: string;
  role: EncounterDiagnosisRecord['role'];
  certainty: EncounterDiagnosisRecord['certainty'];
  status: EncounterDiagnosisRecord['status'];
  clinicalNoteId: string | null;
  onsetDate: string | null;
  resolvedAt: string | null;
  isChronic: boolean;
  presentOnAdmission: boolean | null;
  evidence: string | null;
  recordedAt: string;
  recordedBy: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
  supersedesEncounterDiagnosisId: string | null;
  supersededByEncounterDiagnosisId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PatientProblemMutationResult {
  patientProblemId: string;
  problemNumber: string;
  patientId: string;
  diagnosisId: string | null;
  sourceEncounterId: string;
  sourceEncounterDiagnosisId: string | null;
  codeSystem: PatientProblemRecord['codeSystem'];
  code: string;
  display: string;
  status: PatientProblemRecord['status'];
  onsetDate: string | null;
  resolvedAt: string | null;
  summary: string | null;
  currentVersion: number;
  latestVersionId: string | null;
  supersedesProblemId: string | null;
  supersededByProblemId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PatientAllergyMutationResult {
  patientAllergyId: string;
  patientId: string;
  recordType: PatientAllergyRecord['recordType'];
  allergyId: string | null;
  category: PatientAllergyRecord['category'];
  allergenText: string;
  status: PatientAllergyRecord['status'];
  verificationStatus: PatientAllergyRecord['verificationStatus'];
  severity: PatientAllergyRecord['severity'];
  reactions: PatientAllergyRecord['reactions'];
  onsetDate: string | null;
  lastReactionAt: string | null;
  clinicalNoteId: string | null;
  sourceEncounterId: string | null;
  notes: string | null;
  currentVersion: number;
  latestVersionId: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  supersedesPatientAllergyId: string | null;
  supersededByPatientAllergyId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export function toEncounterDiagnosisMutationResult(
  record: EncounterDiagnosisRecord,
): EncounterDiagnosisMutationResult {
  return {
    encounterDiagnosisId: record._id.toHexString(),
    encounterId: record.encounterId.toHexString(),
    patientId: record.patientId.toHexString(),
    diagnosisId: id(record.diagnosisId),
    codeSystem: record.codeSystem,
    code: record.code,
    display: record.display,
    role: record.role,
    certainty: record.certainty,
    status: record.status,
    clinicalNoteId: id(record.clinicalNoteId),
    onsetDate: record.onsetDate,
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
    isChronic: record.isChronic,
    presentOnAdmission: record.presentOnAdmission,
    evidence: record.evidence,
    recordedAt: record.recordedAt.toISOString(),
    recordedBy: record.recordedBy.toHexString(),
    verifiedAt: record.verifiedAt?.toISOString() ?? null,
    verifiedBy: id(record.verifiedBy),
    supersedesEncounterDiagnosisId: id(
      record.supersedesEncounterDiagnosisId,
    ),
    supersededByEncounterDiagnosisId: id(
      record.supersededByEncounterDiagnosisId,
    ),
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toPatientProblemMutationResult(
  record: PatientProblemRecord,
): PatientProblemMutationResult {
  return {
    patientProblemId: record._id.toHexString(),
    problemNumber: record.problemNumber,
    patientId: record.patientId.toHexString(),
    diagnosisId: id(record.diagnosisId),
    sourceEncounterId: record.sourceEncounterId.toHexString(),
    sourceEncounterDiagnosisId: id(record.sourceEncounterDiagnosisId),
    codeSystem: record.codeSystem,
    code: record.code,
    display: record.display,
    status: record.status,
    onsetDate: record.onsetDate,
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
    summary: record.summary,
    currentVersion: record.currentVersion,
    latestVersionId: id(record.latestVersionId),
    supersedesProblemId: id(record.supersedesProblemId),
    supersededByProblemId: id(record.supersededByProblemId),
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toPatientAllergyMutationResult(
  record: PatientAllergyRecord,
): PatientAllergyMutationResult {
  return {
    patientAllergyId: record._id.toHexString(),
    patientId: record.patientId.toHexString(),
    recordType: record.recordType,
    allergyId: id(record.allergyId),
    category: record.category,
    allergenText: record.allergenText,
    status: record.status,
    verificationStatus: record.verificationStatus,
    severity: record.severity,
    reactions: record.reactions,
    onsetDate: record.onsetDate,
    lastReactionAt: record.lastReactionAt?.toISOString() ?? null,
    clinicalNoteId: id(record.clinicalNoteId),
    sourceEncounterId: id(record.sourceEncounterId),
    notes: record.notes,
    currentVersion: record.currentVersion,
    latestVersionId: id(record.latestVersionId),
    verifiedAt: record.verifiedAt?.toISOString() ?? null,
    verifiedBy: id(record.verifiedBy),
    supersedesPatientAllergyId: id(record.supersedesPatientAllergyId),
    supersededByPatientAllergyId: id(
      record.supersededByPatientAllergyId,
    ),
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}