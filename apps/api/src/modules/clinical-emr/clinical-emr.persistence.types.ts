import type {
  Types,
} from 'mongoose';

import type {
  AllergyCatalogStatus,
  AllergyCategory,
  ClinicalConfidentiality,
  ClinicalDocumentStatus,
  ClinicalDocumentType,
  ClinicalDocumentVersionChangeType,
  DiagnosisCatalogStatus,
  DiagnosisCodeSystem,
  EncounterOwnerRole,
  EncounterStatus,
  EncounterStatusChangeSource,
  PatientAllergyStatus,
  PatientProblemStatus,
  PatientProblemVersionChangeType,
  ProviderSignatureMethod,
} from '@hospital-mis/database';

export interface EncryptedClinicalSnapshotRecord {
  algorithm: 'AES-256-GCM';
  keyVersion: string;
  initializationVector: string;
  authenticationTag: string;
  ciphertext: string;
}

export interface EncounterStatusHistoryRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  encounterId: Types.ObjectId;
  patientId: Types.ObjectId;
  sequence: number;
  fromStatus: EncounterStatus | null;
  toStatus: EncounterStatus;
  previousOwnerId: Types.ObjectId | null;
  newOwnerId: Types.ObjectId;
  previousOwnerRole: EncounterOwnerRole | null;
  newOwnerRole: EncounterOwnerRole;
  changeSource: EncounterStatusChangeSource;
  reason: string | null;
  occurredAt: Date;
  changedBy: Types.ObjectId;
  transactionId: string;
  correlationId: string;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClinicalNoteVersionRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  clinicalNoteId: Types.ObjectId;
  encounterId: Types.ObjectId;
  patientId: Types.ObjectId;
  versionNumber: number;
  previousVersionId: Types.ObjectId | null;
  changeType: ClinicalDocumentVersionChangeType;
  statusSnapshot: ClinicalDocumentStatus;
  documentTypeSnapshot: ClinicalDocumentType;
  confidentialitySnapshot: ClinicalConfidentiality;
  encryptedSnapshot: EncryptedClinicalSnapshotRecord;
  snapshotHash: string;
  contentHash: string;
  changeReason: string | null;
  authorProviderId: Types.ObjectId;
  signedBy: Types.ObjectId | null;
  signatureMethod: ProviderSignatureMethod | null;
  signatureDigest: string | null;
  recordedAt: Date;
  recordedBy: Types.ObjectId;
  transactionId: string;
  correlationId: string;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface DiagnosisRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  codeSystem: DiagnosisCodeSystem;
  code: string;
  normalizedCode: string;
  display: string;
  normalizedDisplay: string;
  synonyms: string[];
  description: string | null;
  parentDiagnosisId: Types.ObjectId | null;
  billable: boolean;
  status: DiagnosisCatalogStatus;
  deactivatedAt: Date | null;
  deactivatedBy: Types.ObjectId | null;
  deactivationReason: string | null;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface PatientProblemVersionRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  patientProblemId: Types.ObjectId;
  patientId: Types.ObjectId;
  versionNumber: number;
  previousVersionId: Types.ObjectId | null;
  changeType: PatientProblemVersionChangeType;
  statusSnapshot: PatientProblemStatus;
  encryptedSnapshot: EncryptedClinicalSnapshotRecord;
  snapshotHash: string;
  changeReason: string | null;
  recordedAt: Date;
  recordedBy: Types.ObjectId;
  transactionId: string;
  correlationId: string;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface AllergyRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  code: string;
  category: AllergyCategory;
  name: string;
  normalizedName: string;
  synonyms: string[];
  description: string | null;
  status: AllergyCatalogStatus;
  deactivatedAt: Date | null;
  deactivatedBy: Types.ObjectId | null;
  deactivationReason: string | null;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface PatientAllergyVersionRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  patientAllergyId: Types.ObjectId;
  patientId: Types.ObjectId;
  versionNumber: number;
  previousVersionId: Types.ObjectId | null;
  statusSnapshot: PatientAllergyStatus;
  encryptedSnapshot: EncryptedClinicalSnapshotRecord;
  snapshotHash: string;
  changeReason: string | null;
  recordedAt: Date;
  recordedBy: Types.ObjectId;
  transactionId: string;
  correlationId: string;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClinicalCatalogListQuery {
  page: number;
  pageSize: number;
  sortDirection: 'asc' | 'desc';
  search?: string;
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface DiagnosisCatalogListQuery
  extends ClinicalCatalogListQuery {
  codeSystem?: DiagnosisCodeSystem;
}

export interface AllergyCatalogListQuery
  extends ClinicalCatalogListQuery {
  category?: AllergyCategory;
}

export interface EncounterDiagnosisListQuery {
  encounterId?: string;
  patientId?: string;
  status?: string;
  page: number;
  pageSize: number;
  sortDirection: 'asc' | 'desc';
}

export interface PatientProblemListQuery {
  patientId: string;
  status?: PatientProblemStatus;
  page: number;
  pageSize: number;
  sortDirection: 'asc' | 'desc';
}

export interface PatientAllergyListQuery {
  patientId: string;
  status?: PatientAllergyStatus;
  category?: AllergyCategory;
  page: number;
  pageSize: number;
  sortDirection: 'asc' | 'desc';
}