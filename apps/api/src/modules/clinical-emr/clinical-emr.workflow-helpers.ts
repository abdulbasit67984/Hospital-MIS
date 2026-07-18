import {
  randomBytes,
} from 'node:crypto';

import type {
  ClinicalDocumentStatus,
  EncounterStatus,
  PatientAllergyStatus,
  PatientProblemStatus,
} from '@hospital-mis/database';

import {
  CLINICAL_DOCUMENT_TRANSITIONS,
  CLINICAL_EMR_LOCK_NAMESPACE,
  ENCOUNTER_TRANSITIONS,
  PATIENT_ALLERGY_TRANSITIONS,
  PATIENT_PROBLEM_TRANSITIONS,
} from './clinical-emr.constants.js';

import {
  InvalidClinicalDocumentTransitionError,
  InvalidEncounterTransitionError,
  InvalidPatientAllergyTransitionError,
  InvalidPatientProblemTransitionError,
} from './clinical-emr.errors.js';

import {
  clinicalEmrLockKey,
} from './clinical-emr.normalization.js';

import type {
  ClinicalNoteRecord,
  CreateEncounterInput,
  EncounterDiagnosisRecord,
  EncounterRecord,
  PatientAllergyRecord,
  PatientProblemRecord,
} from './clinical-emr.types.js';

export function newClinicalEmrObjectIdString(): string {
  return randomBytes(12).toString('hex');
}

export function clinicalEmrDeduplicationKey(
  transactionId: string,
  action: string,
  entityId: string,
): string {
  return [transactionId, action, entityId].join(':');
}

export function encounterCreateLockKeys(
  facilityId: string,
  canonicalPatientId: string,
  input: CreateEncounterInput,
): string[] {
  return [
    clinicalEmrLockKey(
      CLINICAL_EMR_LOCK_NAMESPACE.ENCOUNTER_CONTEXT,
      facilityId,
      input.opdVisitId ?? input.admissionId ?? input.emergencyCaseId ?? input.referralId ?? canonicalPatientId,
    ),
    clinicalEmrLockKey(
      CLINICAL_EMR_LOCK_NAMESPACE.PATIENT_TIMELINE,
      facilityId,
      canonicalPatientId,
    ),
  ];
}

export function encounterMutationLockKeys(
  facilityId: string,
  record: EncounterRecord,
): string[] {
  return [
    clinicalEmrLockKey(
      CLINICAL_EMR_LOCK_NAMESPACE.ENCOUNTER,
      facilityId,
      record._id.toHexString(),
    ),
    clinicalEmrLockKey(
      CLINICAL_EMR_LOCK_NAMESPACE.PATIENT_TIMELINE,
      facilityId,
      record.patientId.toHexString(),
    ),
    ...(record.opdVisitId === null
      ? []
      : [
          clinicalEmrLockKey(
            CLINICAL_EMR_LOCK_NAMESPACE.ENCOUNTER_CONTEXT,
            facilityId,
            record.opdVisitId.toHexString(),
          ),
        ]),
  ];
}

export function clinicalNoteCreateLockKeys(
  facilityId: string,
  encounter: EncounterRecord,
): string[] {
  return [
    ...encounterMutationLockKeys(facilityId, encounter),
    clinicalEmrLockKey(
      CLINICAL_EMR_LOCK_NAMESPACE.CLINICAL_NOTE,
      facilityId,
      encounter._id.toHexString(),
      'new',
    ),
  ];
}

export function clinicalNoteMutationLockKeys(
  facilityId: string,
  encounter: EncounterRecord,
  note: ClinicalNoteRecord,
): string[] {
  return [
    ...encounterMutationLockKeys(facilityId, encounter),
    clinicalEmrLockKey(
      CLINICAL_EMR_LOCK_NAMESPACE.CLINICAL_NOTE,
      facilityId,
      note._id.toHexString(),
    ),
  ];
}


export function encounterDiagnosisCreateLockKeys(
  facilityId: string,
  encounter: EncounterRecord,
  codeSystem: EncounterDiagnosisRecord['codeSystem'],
  code: string,
): string[] {
  return [
    ...encounterMutationLockKeys(facilityId, encounter),
    clinicalEmrLockKey(
      CLINICAL_EMR_LOCK_NAMESPACE.DIAGNOSIS,
      facilityId,
      encounter._id.toHexString(),
      codeSystem,
      code,
    ),
  ];
}

export function encounterDiagnosisMutationLockKeys(
  facilityId: string,
  encounter: EncounterRecord,
  diagnosis: EncounterDiagnosisRecord,
): string[] {
  return [
    ...encounterMutationLockKeys(facilityId, encounter),
    clinicalEmrLockKey(
      CLINICAL_EMR_LOCK_NAMESPACE.DIAGNOSIS,
      facilityId,
      diagnosis._id.toHexString(),
    ),
  ];
}

export function patientProblemCreateLockKeys(
  facilityId: string,
  encounter: EncounterRecord,
  codeSystem: PatientProblemRecord['codeSystem'],
  code: string,
): string[] {
  return [
    ...encounterMutationLockKeys(facilityId, encounter),
    clinicalEmrLockKey(
      CLINICAL_EMR_LOCK_NAMESPACE.PATIENT_PROBLEM,
      facilityId,
      encounter.patientId.toHexString(),
      codeSystem,
      code,
    ),
  ];
}

export function patientProblemMutationLockKeys(
  facilityId: string,
  problem: PatientProblemRecord,
): string[] {
  return [
    clinicalEmrLockKey(
      CLINICAL_EMR_LOCK_NAMESPACE.PATIENT_PROBLEM,
      facilityId,
      problem._id.toHexString(),
    ),
    clinicalEmrLockKey(
      CLINICAL_EMR_LOCK_NAMESPACE.PATIENT_TIMELINE,
      facilityId,
      problem.patientId.toHexString(),
    ),
  ];
}

export function patientAllergyCreateLockKeys(
  facilityId: string,
  patientId: string,
  recordType: PatientAllergyRecord['recordType'],
  category: PatientAllergyRecord['category'],
  allergenText: string,
): string[] {
  return [
    clinicalEmrLockKey(
      CLINICAL_EMR_LOCK_NAMESPACE.PATIENT_ALLERGY,
      facilityId,
      patientId,
      recordType,
      category,
      allergenText,
    ),
    clinicalEmrLockKey(
      CLINICAL_EMR_LOCK_NAMESPACE.PATIENT_TIMELINE,
      facilityId,
      patientId,
    ),
  ];
}

export function patientAllergyMutationLockKeys(
  facilityId: string,
  allergy: PatientAllergyRecord,
): string[] {
  return [
    clinicalEmrLockKey(
      CLINICAL_EMR_LOCK_NAMESPACE.PATIENT_ALLERGY,
      facilityId,
      allergy._id.toHexString(),
    ),
    clinicalEmrLockKey(
      CLINICAL_EMR_LOCK_NAMESPACE.PATIENT_TIMELINE,
      facilityId,
      allergy.patientId.toHexString(),
    ),
  ];
}

export function assertEncounterTransition(
  fromStatus: EncounterStatus,
  toStatus: EncounterStatus,
): void {
  const allowed = ENCOUNTER_TRANSITIONS[fromStatus] as readonly EncounterStatus[];

  if (!allowed.includes(toStatus)) {
    throw new InvalidEncounterTransitionError(fromStatus, toStatus);
  }
}

export function assertClinicalDocumentTransition(
  fromStatus: ClinicalDocumentStatus,
  toStatus: ClinicalDocumentStatus,
): void {
  const allowed = CLINICAL_DOCUMENT_TRANSITIONS[
    fromStatus
  ] as readonly ClinicalDocumentStatus[];

  if (!allowed.includes(toStatus)) {
    throw new InvalidClinicalDocumentTransitionError(
      fromStatus,
      toStatus,
    );
  }
}


export function assertPatientProblemTransition(
  fromStatus: PatientProblemStatus,
  toStatus: PatientProblemStatus,
): void {
  if (fromStatus === toStatus) {
    return;
  }

  const allowed = PATIENT_PROBLEM_TRANSITIONS[
    fromStatus
  ] as readonly PatientProblemStatus[];

  if (!allowed.includes(toStatus)) {
    throw new InvalidPatientProblemTransitionError(
      fromStatus,
      toStatus,
    );
  }
}

export function assertPatientAllergyTransition(
  fromStatus: PatientAllergyStatus,
  toStatus: PatientAllergyStatus,
): void {
  if (fromStatus === toStatus) {
    return;
  }

  const allowed = PATIENT_ALLERGY_TRANSITIONS[
    fromStatus
  ] as readonly PatientAllergyStatus[];

  if (!allowed.includes(toStatus)) {
    throw new InvalidPatientAllergyTransitionError(
      fromStatus,
      toStatus,
    );
  }
}

export function safeCreateEncounterJournalPayload(
  input: CreateEncounterInput,
): Record<string, unknown> {
  return {
    operation: 'CREATE_ENCOUNTER',
    encounterType: input.encounterType,
    careContext: input.careContext,
    serviceDate: input.serviceDate,
    hasRegistration: input.registrationId != null,
    hasOpdVisit: input.opdVisitId != null,
    hasQueueToken: input.queueTokenId != null,
    hasAdmission: input.admissionId != null,
    hasEmergencyCase: input.emergencyCaseId != null,
    hasReferral: input.referralId != null,
    confidentiality: input.confidentiality ?? 'ROUTINE',
  };
}

export function safeEncounterMutationJournalPayload(
  operation: string,
  record: EncounterRecord,
  targetStatus?: EncounterStatus,
): Record<string, unknown> {
  return {
    operation,
    encounterId: record._id.toHexString(),
    encounterNumber: record.encounterNumber,
    currentStatus: record.status,
    targetStatus: targetStatus ?? null,
    careContext: record.careContext,
    serviceDate: record.serviceDate,
    hasOpdVisit: record.opdVisitId !== null,
  };
}

export function safeClinicalNoteJournalPayload(
  operation: string,
  input: Readonly<{
    encounter: EncounterRecord;
    note?: ClinicalNoteRecord;
    documentType?: ClinicalNoteRecord['documentType'];
    targetStatus?: ClinicalNoteRecord['status'];
    confidentiality?: ClinicalNoteRecord['confidentiality'];
  }>,
): Record<string, unknown> {
  return {
    operation,
    encounterId: input.encounter._id.toHexString(),
    encounterNumber: input.encounter.encounterNumber,
    patientId: input.encounter.patientId.toHexString(),
    clinicalNoteId: input.note?._id.toHexString() ?? null,
    noteNumber: input.note?.noteNumber ?? null,
    documentType: input.note?.documentType ?? input.documentType ?? null,
    currentStatus: input.note?.status ?? null,
    targetStatus: input.targetStatus ?? null,
    confidentiality:
      input.note?.confidentiality ?? input.confidentiality ?? 'ROUTINE',
    serviceDate: input.encounter.serviceDate,
  };
}

export function safeEncounterEventPayload(
  record: EncounterRecord,
): Record<string, unknown> {
  return {
    encounterId: record._id.toHexString(),
    encounterNumber: record.encounterNumber,
    encounterStatus: record.status,
    departmentId: record.departmentId.toHexString(),
    clinicId: record.clinicId?.toHexString() ?? null,
    servicePointId: record.servicePointId?.toHexString() ?? null,
    ownerProviderId: record.currentOwnerId.toHexString(),
    serviceDate: record.serviceDate,
    version: record.version,
  };
}

export function safeClinicalNoteEventPayload(
  record: ClinicalNoteRecord,
): Record<string, unknown> {
  return {
    clinicalNoteId: record._id.toHexString(),
    noteNumber: record.noteNumber,
    encounterId: record.encounterId.toHexString(),
    patientId: record.patientId.toHexString(),
    authorProviderId: record.authorProviderId.toHexString(),
    documentType: record.documentType,
    status: record.status,
    confidentiality: record.confidentiality,
    currentVersion: record.currentVersion,
    finalizedAt: record.finalizedAt?.toISOString() ?? null,
    signedAt: record.signedAt?.toISOString() ?? null,
    amendedAt: record.amendedAt?.toISOString() ?? null,
    correctedAt: record.correctedAt?.toISOString() ?? null,
    enteredInErrorAt: record.enteredInErrorAt?.toISOString() ?? null,
    addendumToNoteId: record.addendumToNoteId?.toHexString() ?? null,
    supersedesNoteId: record.supersedesNoteId?.toHexString() ?? null,
    supersededByNoteId: record.supersededByNoteId?.toHexString() ?? null,
    version: record.version,
  };
}

export function clinicalNoteVersionAssociatedData(
  facilityId: string,
  clinicalNoteId: string,
  versionNumber: number,
): string {
  return [
    'hospital-mis',
    'clinical-emr',
    'clinical-note-version',
    facilityId,
    clinicalNoteId,
    String(versionNumber),
  ].join(':');
}

export function clinicalNoteContentAssociatedData(
  facilityId: string,
  clinicalNoteId: string,
  versionNumber: number,
): string {
  return [
    'hospital-mis',
    'clinical-emr',
    'clinical-note-content',
    facilityId,
    clinicalNoteId,
    String(versionNumber),
  ].join(':');
}

export function safeDiagnosisJournalPayload(
  operation: string,
  encounter: EncounterRecord,
  diagnosis?: EncounterDiagnosisRecord,
): Record<string, unknown> {
  return {
    operation,
    encounterId: encounter._id.toHexString(),
    encounterNumber: encounter.encounterNumber,
    patientId: encounter.patientId.toHexString(),
    encounterDiagnosisId: diagnosis?._id.toHexString() ?? null,
    currentStatus: diagnosis?.status ?? null,
    role: diagnosis?.role ?? null,
    certainty: diagnosis?.certainty ?? null,
    serviceDate: encounter.serviceDate,
  };
}

export function safePatientProblemJournalPayload(
  operation: string,
  problem?: PatientProblemRecord,
  encounter?: EncounterRecord,
): Record<string, unknown> {
  return {
    operation,
    patientProblemId: problem?._id.toHexString() ?? null,
    problemNumber: problem?.problemNumber ?? null,
    patientId:
      problem?.patientId.toHexString() ??
      encounter?.patientId.toHexString() ??
      null,
    sourceEncounterId:
      problem?.sourceEncounterId.toHexString() ??
      encounter?._id.toHexString() ??
      null,
    currentStatus: problem?.status ?? null,
    currentVersion: problem?.currentVersion ?? null,
  };
}

export function safePatientAllergyJournalPayload(
  operation: string,
  patientId: string,
  allergy?: PatientAllergyRecord,
): Record<string, unknown> {
  return {
    operation,
    patientAllergyId: allergy?._id.toHexString() ?? null,
    patientId,
    recordType: allergy?.recordType ?? null,
    category: allergy?.category ?? null,
    currentStatus: allergy?.status ?? null,
    verificationStatus: allergy?.verificationStatus ?? null,
    severity: allergy?.severity ?? null,
    currentVersion: allergy?.currentVersion ?? null,
  };
}

export function safeEncounterDiagnosisEventPayload(
  record: EncounterDiagnosisRecord,
): Record<string, unknown> {
  return {
    encounterDiagnosisId: record._id.toHexString(),
    encounterId: record.encounterId.toHexString(),
    patientId: record.patientId.toHexString(),
    diagnosisId: record.diagnosisId?.toHexString() ?? null,
    role: record.role,
    certainty: record.certainty,
    status: record.status,
    isChronic: record.isChronic,
    verifiedAt: record.verifiedAt?.toISOString() ?? null,
    supersedesEncounterDiagnosisId:
      record.supersedesEncounterDiagnosisId?.toHexString() ?? null,
    supersededByEncounterDiagnosisId:
      record.supersededByEncounterDiagnosisId?.toHexString() ?? null,
    version: record.version,
  };
}

export function safePatientProblemEventPayload(
  record: PatientProblemRecord,
): Record<string, unknown> {
  return {
    patientProblemId: record._id.toHexString(),
    problemNumber: record.problemNumber,
    patientId: record.patientId.toHexString(),
    diagnosisId: record.diagnosisId?.toHexString() ?? null,
    sourceEncounterId: record.sourceEncounterId.toHexString(),
    status: record.status,
    currentVersion: record.currentVersion,
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
    supersedesProblemId: record.supersedesProblemId?.toHexString() ?? null,
    supersededByProblemId:
      record.supersededByProblemId?.toHexString() ?? null,
    version: record.version,
  };
}

export function safePatientAllergyEventPayload(
  record: PatientAllergyRecord,
): Record<string, unknown> {
  return {
    patientAllergyId: record._id.toHexString(),
    patientId: record.patientId.toHexString(),
    recordType: record.recordType,
    allergyId: record.allergyId?.toHexString() ?? null,
    category: record.category,
    status: record.status,
    verificationStatus: record.verificationStatus,
    severity: record.severity,
    reactionCount: record.reactions.length,
    sourceEncounterId: record.sourceEncounterId?.toHexString() ?? null,
    currentVersion: record.currentVersion,
    verifiedAt: record.verifiedAt?.toISOString() ?? null,
    supersedesPatientAllergyId:
      record.supersedesPatientAllergyId?.toHexString() ?? null,
    supersededByPatientAllergyId:
      record.supersededByPatientAllergyId?.toHexString() ?? null,
    version: record.version,
  };
}

export function patientProblemVersionAssociatedData(
  facilityId: string,
  patientProblemId: string,
  versionNumber: number,
): string {
  return [
    'hospital-mis',
    'clinical-emr',
    'patient-problem-version',
    facilityId,
    patientProblemId,
    String(versionNumber),
  ].join(':');
}

export function patientAllergyVersionAssociatedData(
  facilityId: string,
  patientAllergyId: string,
  versionNumber: number,
): string {
  return [
    'hospital-mis',
    'clinical-emr',
    'patient-allergy-version',
    facilityId,
    patientAllergyId,
    String(versionNumber),
  ].join(':');
}