import type {
  Types,
} from 'mongoose';

import type {
  AllergyCategory,
  AllergyReactionSeverity,
  AllergySeverity,
  AllergyVerificationStatus,
  ClinicalConfidentiality,
  ClinicalDocumentStatus,
  ClinicalDocumentType,
  DiagnosisCertainty,
  DiagnosisCodeSystem,
  EncounterCareContext,
  EncounterDiagnosisRole,
  EncounterDiagnosisStatus,
  EncounterOwnerRole,
  EncounterStatus,
  EncounterStatusChangeSource,
  EncounterType,
  PatientAllergyRecordType,
  PatientAllergyStatus,
  PatientProblemStatus,
  ProviderSignatureMethod,
  VitalSignBodyPosition,
  VitalSignSource,
  VitalSignStatus,
  VitalSignTemperatureSite,
} from '@hospital-mis/database';

import type {
  ClinicalNoteSortField,
  ClinicalTimelineSortField,
  EncounterSortField,
} from './clinical-emr.constants.js';

export type ClinicalEmrObjectIdString =
  string;

export type ClinicalEmrSortDirection =
  | 'asc'
  | 'desc';

export interface ClinicalEmrActorContext {
  userId: ClinicalEmrObjectIdString;
  facilityId: ClinicalEmrObjectIdString;
  correlationId: string;
  roleKeys: readonly string[];
  permissionKeys: readonly string[];
  ipAddress?: string;
  userAgent?: string;
  breakGlassReason?: string;
}

export interface ClinicalEncounterContextInput {
  patientId: ClinicalEmrObjectIdString;
  registrationId?: ClinicalEmrObjectIdString | null;
  opdVisitId?: ClinicalEmrObjectIdString | null;
  queueTokenId?: ClinicalEmrObjectIdString | null;
  emergencyCaseId?: ClinicalEmrObjectIdString | null;
  admissionId?: ClinicalEmrObjectIdString | null;
  referralId?: ClinicalEmrObjectIdString | null;
  encounterType: EncounterType;
  careContext: EncounterCareContext;
  serviceDate: string;
  departmentId: ClinicalEmrObjectIdString;
  clinicId?: ClinicalEmrObjectIdString | null;
  servicePointId?: ClinicalEmrObjectIdString | null;
  primaryProviderId: ClinicalEmrObjectIdString;
  currentOwnerId?: ClinicalEmrObjectIdString;
  currentOwnerRole?: EncounterOwnerRole;
  assignedProviderIds?: readonly ClinicalEmrObjectIdString[];
  confidentiality?: ClinicalConfidentiality;
  restrictionReason?: string | null;
  startedAt?: string;
}

export interface CreateEncounterInput
  extends ClinicalEncounterContextInput {}

export interface ChangeEncounterStatusInput {
  expectedVersion: number;
  status: EncounterStatus;
  changeSource: EncounterStatusChangeSource;
  reason?: string | null;
}

export interface ReassignEncounterInput {
  expectedVersion: number;
  currentOwnerId: ClinicalEmrObjectIdString;
  currentOwnerRole: EncounterOwnerRole;
  assignedProviderIds: readonly ClinicalEmrObjectIdString[];
  reason: string;
}

export interface SignEncounterInput {
  expectedVersion: number;
  signatureMethod: ProviderSignatureMethod;
  signatureDigest: string;
}

export interface CorrectEncounterInput {
  expectedVersion: number;
  reason: string;
  replacement: ClinicalEncounterContextInput;
}

export interface ClinicalDocumentContentInput {
  title?: string | null;
  narrativeText?: string | null;
  structuredData?:
    | Record<string, unknown>
    | readonly unknown[]
    | null;
  confidentiality?: ClinicalConfidentiality;
  restrictionReason?: string | null;
}

export interface CreateClinicalNoteInput
  extends ClinicalDocumentContentInput {
  encounterId: ClinicalEmrObjectIdString;
  documentType: ClinicalDocumentType;
  authorProviderId: ClinicalEmrObjectIdString;
}

export interface UpdateClinicalNoteInput
  extends ClinicalDocumentContentInput {
  expectedVersion: number;
}

export interface FinalizeClinicalNoteInput {
  expectedVersion: number;
  signatureMethod?: ProviderSignatureMethod | null;
  signatureDigest?: string | null;
}

export interface AmendClinicalNoteInput
  extends ClinicalDocumentContentInput {
  expectedVersion: number;
  reason: string;
}

export interface CorrectClinicalNoteInput
  extends ClinicalDocumentContentInput {
  expectedVersion: number;
  reason: string;
}

export interface AddClinicalNoteAddendumInput
  extends ClinicalDocumentContentInput {
  parentNoteId: ClinicalEmrObjectIdString;
  authorProviderId: ClinicalEmrObjectIdString;
}

export interface EnterClinicalNoteInErrorInput {
  expectedVersion: number;
  reason: string;
}

export interface RecordEncounterDiagnosisInput {
  encounterId: ClinicalEmrObjectIdString;
  diagnosisId?: ClinicalEmrObjectIdString | null;
  codeSystem: DiagnosisCodeSystem;
  code: string;
  display: string;
  role: EncounterDiagnosisRole;
  certainty: DiagnosisCertainty;
  clinicalNoteId?: ClinicalEmrObjectIdString | null;
  onsetDate?: string | null;
  isChronic?: boolean;
  presentOnAdmission?: boolean | null;
  evidence?: string | null;
}

export interface ChangeEncounterDiagnosisStatusInput {
  expectedVersion: number;
  status:
    Exclude<
      EncounterDiagnosisStatus,
      'ACTIVE'
    >;
  reason: string;
  resolvedAt?: string | null;
}

export interface VerifyEncounterDiagnosisInput {
  expectedVersion: number;
}

export interface CorrectEncounterDiagnosisInput {
  expectedVersion: number;
  reason: string;
  replacement: Omit<RecordEncounterDiagnosisInput, 'encounterId'>;
}

export interface CreatePatientProblemInput {
  sourceEncounterId: ClinicalEmrObjectIdString;
  sourceEncounterDiagnosisId?: ClinicalEmrObjectIdString | null;
  diagnosisId?: ClinicalEmrObjectIdString | null;
  codeSystem: DiagnosisCodeSystem;
  code: string;
  display: string;
  onsetDate?: string | null;
  summary?: string | null;
}

export interface UpdatePatientProblemInput {
  expectedVersion: number;
  status: PatientProblemStatus;
  summary?: string | null;
  onsetDate?: string | null;
  resolvedAt?: string | null;
  reason?: string | null;
}

export interface CorrectPatientProblemInput {
  expectedVersion: number;
  reason: string;
  replacement: Omit<
    CreatePatientProblemInput,
    'sourceEncounterId' | 'sourceEncounterDiagnosisId'
  >;
}

export interface AllergyReactionInput {
  manifestation: string;
  severity: AllergyReactionSeverity;
  occurredAt?: string | null;
  notes?: string | null;
}

export interface RecordPatientAllergyInput {
  patientId: ClinicalEmrObjectIdString;
  sourceEncounterId?: ClinicalEmrObjectIdString | null;
  clinicalNoteId?: ClinicalEmrObjectIdString | null;
  recordType: PatientAllergyRecordType;
  allergyId?: ClinicalEmrObjectIdString | null;
  category: AllergyCategory;
  allergenText: string;
  verificationStatus?: AllergyVerificationStatus;
  severity?: AllergySeverity;
  reactions?: readonly AllergyReactionInput[];
  onsetDate?: string | null;
  lastReactionAt?: string | null;
  notes?: string | null;
}

export interface UpdatePatientAllergyInput {
  expectedVersion: number;
  status: PatientAllergyStatus;
  verificationStatus: AllergyVerificationStatus;
  severity: AllergySeverity;
  reactions: readonly AllergyReactionInput[];
  onsetDate?: string | null;
  lastReactionAt?: string | null;
  notes?: string | null;
  reason?: string | null;
}

export interface CorrectPatientAllergyInput {
  expectedVersion: number;
  reason: string;
  replacement: Omit<
    RecordPatientAllergyInput,
    'patientId' | 'sourceEncounterId'
  >;
}


export const structuredEncounterSectionKeys = [
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
  'PROCEDURES_AND_INTERVENTIONS',
  'FOLLOW_UP_INSTRUCTIONS',
] as const;

export type StructuredEncounterSectionKey =
  (typeof structuredEncounterSectionKeys)[number];

export interface RecordStructuredEncounterSectionInput {
  encounterId: ClinicalEmrObjectIdString;
  authorProviderId: ClinicalEmrObjectIdString;
  sectionKey: StructuredEncounterSectionKey;
  narrativeText?: string | null;
  structuredData?: Record<string, unknown> | null;
  confidentiality?: ClinicalConfidentiality;
  restrictionReason?: string | null;
}

export interface VitalSignMeasurementInput {
  measuredAt: string;
  source?: VitalSignSource;
  deviceIdentifier?: string | null;
  bodyPosition?: VitalSignBodyPosition;
  temperatureCelsius?: string | null;
  temperatureSite?: VitalSignTemperatureSite;
  pulsePerMinute?: number | null;
  respiratoryRatePerMinute?: number | null;
  systolicBloodPressureMmHg?: number | null;
  diastolicBloodPressureMmHg?: number | null;
  oxygenSaturationPercent?: string | null;
  bloodGlucoseMgDl?: string | null;
  painScore?: number | null;
  weightKg?: string | null;
  heightCm?: string | null;
  bmi?: string | null;
  oxygenDeliveryMethod?: string | null;
  oxygenFlowLitresPerMinute?: string | null;
  notes?: string | null;
  confidentiality?: ClinicalConfidentiality;
  restrictionReason?: string | null;
}

export interface RecordVitalSignsInput
  extends VitalSignMeasurementInput {
  encounterId: ClinicalEmrObjectIdString;
  sourceClinicalNoteId?: ClinicalEmrObjectIdString | null;
}

export interface CorrectVitalSignsInput
  extends VitalSignMeasurementInput {
  expectedVersion: number;
  reason: string;
  sourceClinicalNoteId?: ClinicalEmrObjectIdString | null;
}

export interface EnterVitalSignsInErrorInput {
  expectedVersion: number;
  reason: string;
}

export interface VitalSignListQuery {
  encounterId?: ClinicalEmrObjectIdString;
  patientId?: ClinicalEmrObjectIdString;
  admissionId?: ClinicalEmrObjectIdString;
  status?: VitalSignStatus;
  measuredFrom?: string;
  measuredTo?: string;
  page: number;
  pageSize: number;
  sortDirection: ClinicalEmrSortDirection;
}

export interface EncounterListQuery {
  page: number;
  pageSize: number;
  sortBy: EncounterSortField;
  sortDirection: ClinicalEmrSortDirection;
  patientId?: ClinicalEmrObjectIdString;
  providerId?: ClinicalEmrObjectIdString;
  departmentId?: ClinicalEmrObjectIdString;
  clinicId?: ClinicalEmrObjectIdString;
  servicePointId?: ClinicalEmrObjectIdString;
  encounterType?: EncounterType;
  careContext?: EncounterCareContext;
  status?: EncounterStatus;
  serviceDateFrom?: string;
  serviceDateTo?: string;
}

export interface ClinicalNoteListQuery {
  page: number;
  pageSize: number;
  sortBy: ClinicalNoteSortField;
  sortDirection: ClinicalEmrSortDirection;
  encounterId?: ClinicalEmrObjectIdString;
  patientId?: ClinicalEmrObjectIdString;
  authorProviderId?: ClinicalEmrObjectIdString;
  documentType?: ClinicalDocumentType;
  status?: ClinicalDocumentStatus;
  confidentiality?: ClinicalConfidentiality;
}

export interface ClinicalTimelineQuery {
  page: number;
  pageSize: number;
  sortBy: ClinicalTimelineSortField;
  sortDirection: ClinicalEmrSortDirection;
  patientId: ClinicalEmrObjectIdString;
  dateFrom?: string;
  dateTo?: string;
  encounterType?: EncounterType;
  includeEnteredInError?: boolean;
}

export interface ClinicalEmrPageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface EncounterRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  encounterNumber: string;
  patientId: Types.ObjectId;
  requestedPatientId: Types.ObjectId;
  canonicalRedirected: boolean;
  registrationId: Types.ObjectId | null;
  opdVisitId: Types.ObjectId | null;
  queueTokenId: Types.ObjectId | null;
  emergencyCaseId: Types.ObjectId | null;
  admissionId: Types.ObjectId | null;
  referralId: Types.ObjectId | null;
  encounterType: EncounterType;
  careContext: EncounterCareContext;
  status: EncounterStatus;
  serviceDate: string;
  departmentId: Types.ObjectId;
  clinicId: Types.ObjectId | null;
  servicePointId: Types.ObjectId | null;
  primaryProviderId: Types.ObjectId;
  currentOwnerId: Types.ObjectId;
  currentOwnerRole: EncounterOwnerRole;
  assignedProviderIds: Types.ObjectId[];
  confidentiality: ClinicalConfidentiality;
  restrictionReason: string | null;
  startedAt: Date;
  lastClinicalActivityAt: Date;
  completedAt: Date | null;
  signedAt: Date | null;
  signedBy: Types.ObjectId | null;
  signatureDigest: string | null;
  closedAt: Date | null;
  closedBy: Types.ObjectId | null;
  cancelledAt: Date | null;
  cancelledBy: Types.ObjectId | null;
  cancellationReason: string | null;
  supersedesEncounterId: Types.ObjectId | null;
  supersededByEncounterId: Types.ObjectId | null;
  correctionReason: string | null;
  amendmentCount: number;
  latestClinicalNoteId: Types.ObjectId | null;
  latestDiagnosisAt: Date | null;
  transactionId: string;
  correlationId: string;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClinicalNoteRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  noteNumber: string;
  encounterId: Types.ObjectId;
  patientId: Types.ObjectId;
  authorProviderId: Types.ObjectId;
  documentType: ClinicalDocumentType;
  title: string | null;
  narrativeText: string | null;
  structuredData: unknown;
  status: ClinicalDocumentStatus;
  confidentiality: ClinicalConfidentiality;
  restrictionReason: string | null;
  currentVersion: number;
  latestVersionId: Types.ObjectId | null;
  finalizedAt: Date | null;
  finalizedBy: Types.ObjectId | null;
  signedAt: Date | null;
  signedBy: Types.ObjectId | null;
  signatureMethod: ProviderSignatureMethod | null;
  signatureDigest: string | null;
  amendedAt: Date | null;
  amendedBy: Types.ObjectId | null;
  amendmentReason: string | null;
  correctedAt: Date | null;
  correctedBy: Types.ObjectId | null;
  correctionReason: string | null;
  enteredInErrorAt: Date | null;
  enteredInErrorBy: Types.ObjectId | null;
  enteredInErrorReason: string | null;
  addendumToNoteId: Types.ObjectId | null;
  supersedesNoteId: Types.ObjectId | null;
  supersededByNoteId: Types.ObjectId | null;
  transactionId: string;
  correlationId: string;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface EncounterDiagnosisRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  encounterId: Types.ObjectId;
  patientId: Types.ObjectId;
  diagnosisId: Types.ObjectId | null;
  codeSystem: DiagnosisCodeSystem;
  code: string;
  normalizedCode: string;
  display: string;
  role: EncounterDiagnosisRole;
  certainty: DiagnosisCertainty;
  status: EncounterDiagnosisStatus;
  activeDiagnosisKey: string | null;
  clinicalNoteId: Types.ObjectId | null;
  onsetDate: string | null;
  resolvedAt: Date | null;
  isChronic: boolean;
  presentOnAdmission: boolean | null;
  evidence: string | null;
  recordedAt: Date;
  recordedBy: Types.ObjectId;
  verifiedAt: Date | null;
  verifiedBy: Types.ObjectId | null;
  statusReason: string | null;
  supersedesEncounterDiagnosisId: Types.ObjectId | null;
  supersededByEncounterDiagnosisId: Types.ObjectId | null;
  transactionId: string;
  correlationId: string;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface PatientProblemRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  problemNumber: string;
  patientId: Types.ObjectId;
  diagnosisId: Types.ObjectId | null;
  sourceEncounterId: Types.ObjectId;
  sourceEncounterDiagnosisId: Types.ObjectId | null;
  codeSystem: DiagnosisCodeSystem;
  code: string;
  normalizedCode: string;
  display: string;
  status: PatientProblemStatus;
  activeProblemKey: string | null;
  onsetDate: string | null;
  resolvedAt: Date | null;
  summary: string | null;
  currentVersion: number;
  latestVersionId: Types.ObjectId | null;
  statusReason: string | null;
  supersedesProblemId: Types.ObjectId | null;
  supersededByProblemId: Types.ObjectId | null;
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

export interface PatientAllergyRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  patientId: Types.ObjectId;
  recordType: PatientAllergyRecordType;
  allergyId: Types.ObjectId | null;
  category: AllergyCategory;
  allergenText: string;
  normalizedAllergenText: string;
  status: PatientAllergyStatus;
  verificationStatus: AllergyVerificationStatus;
  severity: AllergySeverity;
  reactions: AllergyReactionInput[];
  onsetDate: string | null;
  lastReactionAt: Date | null;
  clinicalNoteId: Types.ObjectId | null;
  sourceEncounterId: Types.ObjectId | null;
  activeAllergyKey: string | null;
  notes: string | null;
  currentVersion: number;
  latestVersionId: Types.ObjectId | null;
  recordedAt: Date;
  recordedBy: Types.ObjectId;
  verifiedAt: Date | null;
  verifiedBy: Types.ObjectId | null;
  statusReason: string | null;
  supersedesPatientAllergyId: Types.ObjectId | null;
  supersededByPatientAllergyId: Types.ObjectId | null;
  transactionId: string;
  correlationId: string;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}


export interface VitalSignRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  encounterId: Types.ObjectId;
  patientId: Types.ObjectId;
  admissionId: Types.ObjectId | null;
  sourceClinicalNoteId: Types.ObjectId | null;
  observerProviderId: Types.ObjectId;
  source: VitalSignSource;
  deviceIdentifier: string | null;
  measuredAt: Date;
  recordedAt: Date;
  bodyPosition: VitalSignBodyPosition;
  temperatureCelsius: Types.Decimal128 | null;
  temperatureSite: VitalSignTemperatureSite;
  pulsePerMinute: number | null;
  respiratoryRatePerMinute: number | null;
  systolicBloodPressureMmHg: number | null;
  diastolicBloodPressureMmHg: number | null;
  oxygenSaturationPercent: Types.Decimal128 | null;
  bloodGlucoseMgDl: Types.Decimal128 | null;
  painScore: number | null;
  weightKg: Types.Decimal128 | null;
  heightCm: Types.Decimal128 | null;
  bmi: Types.Decimal128 | null;
  oxygenDeliveryMethod: string | null;
  oxygenFlowLitresPerMinute: Types.Decimal128 | null;
  notes: string | null;
  confidentiality: ClinicalConfidentiality;
  restrictionReason: string | null;
  status: VitalSignStatus;
  correctedAt: Date | null;
  correctedBy: Types.ObjectId | null;
  correctionReason: string | null;
  supersedesVitalSignId: Types.ObjectId | null;
  supersededByVitalSignId: Types.ObjectId | null;
  enteredInErrorAt: Date | null;
  enteredInErrorBy: Types.ObjectId | null;
  enteredInErrorReason: string | null;
  transactionId: string;
  correlationId: string;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClinicalTimelineEntry {
  id: string;
  facilityId: string;
  patientId: string;
  encounterId: string | null;
  entryType:
    | 'ENCOUNTER'
    | 'CLINICAL_NOTE'
    | 'DIAGNOSIS'
    | 'PROBLEM'
    | 'ALLERGY'
    | 'VITAL_SIGN';
  occurredAt: string;
  title: string;
  summary: string | null;
  providerId: string | null;
  departmentId: string | null;
  confidentiality: ClinicalConfidentiality;
  sourceVersion: number;
}