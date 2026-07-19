import type {
  Types,
} from 'mongoose';

import type {
  LaboratoryBillingStatus,
  LaboratoryCatalogStatus,
  LaboratoryCommunicationChannel,
  LaboratoryCommunicationRecipientType,
  LaboratoryCriticalCommunicationType,
  LaboratoryOrderItemStatus,
  LaboratoryOrderPriority,
  LaboratoryOrderStatus,
  LaboratoryOrderStatusChangeSource,
  LaboratoryReferenceRangeKind,
  LaboratoryReferenceSex,
  LaboratoryResultFlag,
  LaboratoryResultPublicationStatus,
  LaboratoryResultStatus,
  LaboratoryResultValueType,
  LaboratoryResultVersionChangeType,
  LaboratorySpecimenCollectionMethod,
  LaboratorySpecimenStatus,
  LaboratorySpecimenStatusChangeSource,
} from '@hospital-mis/database';

export interface LaboratoryPersistenceMetadata {
  facilityId: Types.ObjectId;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface LaboratorySpecimenRequirementRecord {
  requirementCode: string;
  specimenTypeCode: string;
  specimenTypeName: string;
  containerCode: string | null;
  containerName: string | null;
  minimumVolume: Types.Decimal128 | null;
  volumeUnitCode: string | null;
  fastingRequired: boolean;
  collectionInstructions: string | null;
  handlingInstructions: string | null;
  maximumTransportMinutes: number | null;
  preferred: boolean;
}

export interface LaboratoryCodedReferenceValueRecord {
  code: string;
  display: string;
  codingSystem: string | null;
  normal: boolean;
}

export interface LaboratoryReferenceRangeRecord {
  rangeCode: string;
  kind: LaboratoryReferenceRangeKind;
  sex: LaboratoryReferenceSex;
  minimumAgeDays: number | null;
  maximumAgeDays: number | null;
  lowerBound: Types.Decimal128 | null;
  upperBound: Types.Decimal128 | null;
  criticalLowerBound: Types.Decimal128 | null;
  criticalUpperBound: Types.Decimal128 | null;
  textualReference: string | null;
  codedValues: LaboratoryCodedReferenceValueRecord[];
  notes: string | null;
}

export interface LaboratoryResultComponentDefinitionRecord {
  componentCode: string;
  name: string;
  normalizedName: string;
  valueType: LaboratoryResultValueType;
  unitCode: string | null;
  unitName: string | null;
  decimalScale: number;
  referenceRanges: LaboratoryReferenceRangeRecord[];
  required: boolean;
  displayOrder: number;
  structuredSchemaKey: string | null;
}

export interface LaboratoryTestCategoryRecord
extends LaboratoryPersistenceMetadata {
  _id: Types.ObjectId;
  categoryCode: string;
  name: string;
  normalizedName: string;
  description: string | null;
  displayOrder: number;
  status: LaboratoryCatalogStatus;
  deactivatedAt: Date | null;
  deactivatedBy: Types.ObjectId | null;
  deactivationReason: string | null;
}

export interface LaboratoryTestRecord
extends LaboratoryPersistenceMetadata {
  _id: Types.ObjectId;
  testCode: string;
  name: string;
  normalizedName: string;
  aliases: string[];
  normalizedAliases: string[];
  categoryId: Types.ObjectId;
  categoryCodeSnapshot: string;
  categoryNameSnapshot: string;
  description: string | null;
  methodCode: string | null;
  methodName: string | null;
  requiresSpecimen: boolean;
  specimenRequirements: LaboratorySpecimenRequirementRecord[];
  components: LaboratoryResultComponentDefinitionRecord[];
  routineTurnaroundMinutes: number;
  urgentTurnaroundMinutes: number | null;
  statTurnaroundMinutes: number | null;
  availableDepartmentIds: Types.ObjectId[];
  orderable: boolean;
  requiresResultValidation: boolean;
  requiresResultVerification: boolean;
  criticalNotificationRequired: boolean;
  chargeCatalogItemId: Types.ObjectId | null;
  effectiveFrom: Date;
  effectiveThrough: Date | null;
  status: LaboratoryCatalogStatus;
  deactivatedAt: Date | null;
  deactivatedBy: Types.ObjectId | null;
  deactivationReason: string | null;
  transactionId: string;
  correlationId: string;
}

export interface LaboratoryOrderRecord
extends LaboratoryPersistenceMetadata {
  _id: Types.ObjectId;
  orderNumber: string;
  patientId: Types.ObjectId;
  requestedPatientId: Types.ObjectId;
  canonicalRedirected: boolean;
  encounterId: Types.ObjectId;
  registrationId: Types.ObjectId | null;
  opdVisitId: Types.ObjectId | null;
  queueTokenId: Types.ObjectId | null;
  departmentId: Types.ObjectId;
  clinicId: Types.ObjectId | null;
  servicePointId: Types.ObjectId | null;
  orderingProviderId: Types.ObjectId;
  priority: LaboratoryOrderPriority;
  status: LaboratoryOrderStatus;
  clinicalIndication: string;
  orderingNotes: string | null;
  orderedAt: Date;
  acceptedAt: Date | null;
  acceptedBy: Types.ObjectId | null;
  collectionCompletedAt: Date | null;
  processingStartedAt: Date | null;
  completedAt: Date | null;
  verifiedAt: Date | null;
  cancelledAt: Date | null;
  cancelledBy: Types.ObjectId | null;
  cancellationReason: string | null;
  itemCount: number;
  activeItemCount: number;
  collectedItemCount: number;
  completedItemCount: number;
  verifiedItemCount: number;
  rejectedItemCount: number;
  criticalResultCount: number;
  lastStatusChangedAt: Date;
  lastStatusChangedBy: Types.ObjectId;
  transactionId: string;
  correlationId: string;
}

export interface LaboratoryOrderItemRecord
extends LaboratoryPersistenceMetadata {
  _id: Types.ObjectId;
  labOrderId: Types.ObjectId;
  patientId: Types.ObjectId;
  encounterId: Types.ObjectId;
  sequence: number;
  labTestId: Types.ObjectId;
  testCodeSnapshot: string;
  testNameSnapshot: string;
  categoryCodeSnapshot: string;
  categoryNameSnapshot: string;
  methodCodeSnapshot: string | null;
  methodNameSnapshot: string | null;
  requiresSpecimen: boolean;
  specimenRequirementsSnapshot: LaboratorySpecimenRequirementRecord[];
  resultComponentsSnapshot: LaboratoryResultComponentDefinitionRecord[];
  testDefinitionHash: string;
  turnaroundMinutes: number;
  dueAt: Date;
  status: LaboratoryOrderItemStatus;
  activeSpecimenId: Types.ObjectId | null;
  specimenCount: number;
  recollectionCount: number;
  resultId: Types.ObjectId | null;
  acceptedAt: Date | null;
  acceptedBy: Types.ObjectId | null;
  processingStartedAt: Date | null;
  completedAt: Date | null;
  verifiedAt: Date | null;
  rejectedAt: Date | null;
  rejectedBy: Types.ObjectId | null;
  rejectionReasonCode: string | null;
  rejectionReason: string | null;
  cancelledAt: Date | null;
  cancelledBy: Types.ObjectId | null;
  cancellationReason: string | null;
  chargeCatalogItemId: Types.ObjectId | null;
  accountChargeId: Types.ObjectId | null;
  billingStatus: LaboratoryBillingStatus;
  billingFailureCode: string | null;
  transactionId: string;
  correlationId: string;
}

export interface LaboratoryOrderStatusHistoryRecord
extends LaboratoryPersistenceMetadata {
  _id: Types.ObjectId;
  labOrderId: Types.ObjectId;
  patientId: Types.ObjectId;
  encounterId: Types.ObjectId;
  sequence: number;
  fromStatus: LaboratoryOrderStatus | null;
  toStatus: LaboratoryOrderStatus;
  changeSource: LaboratoryOrderStatusChangeSource;
  reasonCode: string | null;
  reason: string | null;
  occurredAt: Date;
  changedBy: Types.ObjectId;
  transactionId: string;
  correlationId: string;
}

export interface LaboratorySpecimenRecord
extends LaboratoryPersistenceMetadata {
  _id: Types.ObjectId;
  accessionNumber: string;
  specimenIdentifier: string;
  labelCode: string;
  labOrderId: Types.ObjectId;
  labOrderItemIds: Types.ObjectId[];
  patientId: Types.ObjectId;
  encounterId: Types.ObjectId;
  requirementCodeSnapshot: string;
  specimenTypeCodeSnapshot: string;
  specimenTypeNameSnapshot: string;
  containerCodeSnapshot: string | null;
  containerNameSnapshot: string | null;
  expectedMinimumVolume: Types.Decimal128 | null;
  expectedVolumeUnitCode: string | null;
  collectedVolume: Types.Decimal128 | null;
  collectedVolumeUnitCode: string | null;
  collectionMethod: LaboratorySpecimenCollectionMethod | null;
  collectionSite: string | null;
  status: LaboratorySpecimenStatus;
  labelPrintCount: number;
  labelPrintedAt: Date | null;
  labelPrintedBy: Types.ObjectId | null;
  collectedAt: Date | null;
  collectedBy: Types.ObjectId | null;
  collectorStaffId: Types.ObjectId | null;
  receivedAt: Date | null;
  receivedBy: Types.ObjectId | null;
  processingStartedAt: Date | null;
  processingStartedBy: Types.ObjectId | null;
  completedAt: Date | null;
  completedBy: Types.ObjectId | null;
  rejectedAt: Date | null;
  rejectedBy: Types.ObjectId | null;
  rejectionReasonCode: string | null;
  rejectionReason: string | null;
  recollectionRequestedAt: Date | null;
  recollectionRequestedBy: Types.ObjectId | null;
  recollectionReason: string | null;
  recollectionOfSpecimenId: Types.ObjectId | null;
  replacementSpecimenId: Types.ObjectId | null;
  collectionAttempt: number;
  cancelledAt: Date | null;
  cancelledBy: Types.ObjectId | null;
  cancellationReason: string | null;
  lastStatusChangedAt: Date;
  lastStatusChangedBy: Types.ObjectId;
  transactionId: string;
  correlationId: string;
}

export interface LaboratorySpecimenStatusHistoryRecord
extends LaboratoryPersistenceMetadata {
  _id: Types.ObjectId;
  labSpecimenId: Types.ObjectId;
  labOrderId: Types.ObjectId;
  patientId: Types.ObjectId;
  encounterId: Types.ObjectId;
  sequence: number;
  fromStatus: LaboratorySpecimenStatus | null;
  toStatus: LaboratorySpecimenStatus;
  changeSource: LaboratorySpecimenStatusChangeSource;
  reasonCode: string | null;
  reason: string | null;
  stateHash: string;
  occurredAt: Date;
  changedBy: Types.ObjectId;
  transactionId: string;
  correlationId: string;
}

export interface LaboratoryCodedResultValueRecord {
  code: string;
  display: string;
  codingSystem: string | null;
}

export interface LaboratoryReferenceRangeSnapshotRecord {
  rangeCode: string;
  displayText: string;
  lowerBound: Types.Decimal128 | null;
  upperBound: Types.Decimal128 | null;
  criticalLowerBound: Types.Decimal128 | null;
  criticalUpperBound: Types.Decimal128 | null;
}

export interface LaboratoryResultComponentRecord {
  componentCode: string;
  componentNameSnapshot: string;
  valueType: LaboratoryResultValueType;
  numericValue: Types.Decimal128 | null;
  textValue: string | null;
  codedValue: LaboratoryCodedResultValueRecord | null;
  qualitativeValue: string | null;
  structuredValue: Record<string, unknown> | null;
  unitCodeSnapshot: string | null;
  unitNameSnapshot: string | null;
  referenceRangeSnapshot: LaboratoryReferenceRangeSnapshotRecord | null;
  flag: LaboratoryResultFlag;
  interpretation: string | null;
  displayOrder: number;
}

export interface LaboratoryResultRecord
extends LaboratoryPersistenceMetadata {
  _id: Types.ObjectId;
  resultNumber: string;
  labOrderId: Types.ObjectId;
  labOrderItemId: Types.ObjectId;
  labTestId: Types.ObjectId;
  specimenId: Types.ObjectId | null;
  patientId: Types.ObjectId;
  encounterId: Types.ObjectId;
  testCodeSnapshot: string;
  testNameSnapshot: string;
  methodCodeSnapshot: string | null;
  methodNameSnapshot: string | null;
  status: LaboratoryResultStatus;
  components: LaboratoryResultComponentRecord[];
  overallFlag: LaboratoryResultFlag;
  criticalComponentCount: number;
  unresolvedCriticalComponentCount: number;
  conclusion: string | null;
  technicalNotes: string | null;
  enteredAt: Date | null;
  enteredBy: Types.ObjectId | null;
  technicianStaffId: Types.ObjectId | null;
  validatedAt: Date | null;
  validatedBy: Types.ObjectId | null;
  validatorStaffId: Types.ObjectId | null;
  verifiedAt: Date | null;
  verifiedBy: Types.ObjectId | null;
  verifierStaffId: Types.ObjectId | null;
  currentVersion: number;
  latestVersionId: Types.ObjectId | null;
  correctedAt: Date | null;
  correctedBy: Types.ObjectId | null;
  correctionReason: string | null;
  supersedesResultVersionId: Types.ObjectId | null;
  cancelledAt: Date | null;
  cancelledBy: Types.ObjectId | null;
  cancellationReason: string | null;
  publicationStatus: LaboratoryResultPublicationStatus;
  publishedAt: Date | null;
  publishedBy: Types.ObjectId | null;
  withdrawnAt: Date | null;
  withdrawnBy: Types.ObjectId | null;
  withdrawalReason: string | null;
  transactionId: string;
  correlationId: string;
}

export interface EncryptedLaboratorySnapshotRecord {
  algorithm: 'AES-256-GCM';
  keyVersion: string;
  initializationVector: string;
  authenticationTag: string;
  ciphertext: string;
}

export interface LaboratoryResultVersionRecord
extends LaboratoryPersistenceMetadata {
  _id: Types.ObjectId;
  labResultId: Types.ObjectId;
  labOrderId: Types.ObjectId;
  labOrderItemId: Types.ObjectId;
  patientId: Types.ObjectId;
  encounterId: Types.ObjectId;
  versionNumber: number;
  previousVersionId: Types.ObjectId | null;
  changeType: LaboratoryResultVersionChangeType;
  statusSnapshot: LaboratoryResultStatus;
  overallFlagSnapshot: LaboratoryResultFlag;
  criticalComponentCountSnapshot: number;
  encryptedSnapshot: EncryptedLaboratorySnapshotRecord;
  snapshotHash: string;
  contentHash: string;
  changeReason: string | null;
  technicianStaffId: Types.ObjectId;
  validatorStaffId: Types.ObjectId;
  verifierStaffId: Types.ObjectId;
  recordedAt: Date;
  recordedBy: Types.ObjectId;
  transactionId: string;
  correlationId: string;
}

export interface LaboratoryCriticalResultCommunicationRecord
extends LaboratoryPersistenceMetadata {
  _id: Types.ObjectId;
  labResultId: Types.ObjectId;
  labResultVersionId: Types.ObjectId;
  labOrderId: Types.ObjectId;
  patientId: Types.ObjectId;
  encounterId: Types.ObjectId;
  sequence: number;
  componentCodeSnapshot: string;
  resultFlagSnapshot:
    | 'CRITICAL'
    | 'CRITICAL_HIGH'
    | 'CRITICAL_LOW';
  communicationType: LaboratoryCriticalCommunicationType;
  channel: LaboratoryCommunicationChannel;
  recipientType: LaboratoryCommunicationRecipientType;
  recipientUserId: Types.ObjectId | null;
  recipientStaffId: Types.ObjectId | null;
  recipientDisplaySnapshot: string;
  communicationNotes: string | null;
  occurredAt: Date;
  performedBy: Types.ObjectId;
  acknowledgedAt: Date | null;
  acknowledgedBy: Types.ObjectId | null;
  acknowledgementNotes: string | null;
  transactionId: string;
  correlationId: string;
}