import type {
  LaboratoryCatalogStatus,
  LaboratoryCommunicationChannel,
  LaboratoryCommunicationRecipientType,
  LaboratoryCriticalCommunicationType,
  LaboratoryOrderPriority,
  LaboratoryOrderStatus,
  LaboratoryReferenceRangeKind,
  LaboratoryReferenceSex,
  LaboratoryResultFlag,
  LaboratoryResultPublicationStatus,
  LaboratoryResultStatus,
  LaboratoryResultValueType,
  LaboratorySpecimenCollectionMethod,
  LaboratorySpecimenStatus,
} from '@hospital-mis/database';

import type {
  LaboratoryCatalogSortField,
  LaboratoryOrderSortField,
} from './laboratory.constants.js';

export type LaboratoryObjectIdString = string;
export type LaboratorySortDirection = 'asc' | 'desc';

export interface LaboratoryActorContext {
  userId: LaboratoryObjectIdString;
  facilityId: LaboratoryObjectIdString;
  correlationId: string;
  roleKeys: readonly string[];
  permissionKeys: readonly string[];
  ipAddress?: string;
  userAgent?: string;
  breakGlassReason?: string;
}

export interface CreateLaboratoryCategoryInput {
  categoryCode: string;
  name: string;
  description?: string | null;
  displayOrder?: number;
}

export interface UpdateLaboratoryCategoryInput {
  expectedVersion: number;
  name?: string;
  description?: string | null;
  displayOrder?: number;
}

export interface ChangeLaboratoryCatalogStatusInput {
  expectedVersion: number;
  status: LaboratoryCatalogStatus;
  reason: string;
}

export interface LaboratorySpecimenRequirementInput {
  requirementCode: string;
  specimenTypeCode: string;
  specimenTypeName: string;
  containerCode?: string | null;
  containerName?: string | null;
  minimumVolume?: string | null;
  volumeUnitCode?: string | null;
  fastingRequired?: boolean;
  collectionInstructions?: string | null;
  handlingInstructions?: string | null;
  maximumTransportMinutes?: number | null;
  preferred?: boolean;
}

export interface LaboratoryCodedReferenceValueInput {
  code: string;
  display: string;
  codingSystem?: string | null;
  normal?: boolean;
}

export interface LaboratoryReferenceRangeInput {
  rangeCode: string;
  kind: LaboratoryReferenceRangeKind;
  sex?: LaboratoryReferenceSex;
  minimumAgeDays?: number | null;
  maximumAgeDays?: number | null;
  lowerBound?: string | null;
  upperBound?: string | null;
  criticalLowerBound?: string | null;
  criticalUpperBound?: string | null;
  textualReference?: string | null;
  codedValues?: readonly LaboratoryCodedReferenceValueInput[];
  notes?: string | null;
}

export interface LaboratoryResultComponentDefinitionInput {
  componentCode: string;
  name: string;
  valueType: LaboratoryResultValueType;
  unitCode?: string | null;
  unitName?: string | null;
  decimalScale?: number;
  referenceRanges?: readonly LaboratoryReferenceRangeInput[];
  required?: boolean;
  displayOrder?: number;
  structuredSchemaKey?: string | null;
}

export interface CreateLaboratoryTestInput {
  testCode: string;
  name: string;
  aliases?: readonly string[];
  categoryId: LaboratoryObjectIdString;
  description?: string | null;
  methodCode?: string | null;
  methodName?: string | null;
  requiresSpecimen?: boolean;
  specimenRequirements?: readonly LaboratorySpecimenRequirementInput[];
  components: readonly LaboratoryResultComponentDefinitionInput[];
  routineTurnaroundMinutes: number;
  urgentTurnaroundMinutes?: number | null;
  statTurnaroundMinutes?: number | null;
  availableDepartmentIds?: readonly LaboratoryObjectIdString[];
  orderable?: boolean;
  requiresResultValidation?: boolean;
  requiresResultVerification?: boolean;
  criticalNotificationRequired?: boolean;
  chargeCatalogItemId?: LaboratoryObjectIdString | null;
  effectiveFrom?: string;
  effectiveThrough?: string | null;
}

export interface UpdateLaboratoryTestInput {
  expectedVersion: number;
  name?: string;
  aliases?: readonly string[];
  categoryId?: LaboratoryObjectIdString;
  description?: string | null;
  methodCode?: string | null;
  methodName?: string | null;
  requiresSpecimen?: boolean;
  specimenRequirements?: readonly LaboratorySpecimenRequirementInput[];
  components?: readonly LaboratoryResultComponentDefinitionInput[];
  routineTurnaroundMinutes?: number;
  urgentTurnaroundMinutes?: number | null;
  statTurnaroundMinutes?: number | null;
  availableDepartmentIds?: readonly LaboratoryObjectIdString[];
  orderable?: boolean;
  requiresResultValidation?: boolean;
  requiresResultVerification?: boolean;
  criticalNotificationRequired?: boolean;
  chargeCatalogItemId?: LaboratoryObjectIdString | null;
  effectiveFrom?: string;
  effectiveThrough?: string | null;
}

export interface LaboratoryCatalogSearchQuery {
  page: number;
  pageSize: number;
  search?: string;
  categoryId?: LaboratoryObjectIdString;
  departmentId?: LaboratoryObjectIdString;
  status?: LaboratoryCatalogStatus;
  orderable?: boolean;
  effectiveAt?: string;
  sortBy: LaboratoryCatalogSortField;
  sortDirection: LaboratorySortDirection;
}

export interface CreateLaboratoryOrderInput {
  encounterId: LaboratoryObjectIdString;
  priority: LaboratoryOrderPriority;
  clinicalIndication: string;
  orderingNotes?: string | null;
  testIds: readonly LaboratoryObjectIdString[];
}

export interface AcceptLaboratoryOrderInput {
  expectedVersion: number;
}

export interface CancelLaboratoryOrderInput {
  expectedVersion: number;
  reason: string;
}

export interface LaboratoryOrderListQuery {
  page: number;
  pageSize: number;
  patientId?: LaboratoryObjectIdString;
  encounterId?: LaboratoryObjectIdString;
  orderingProviderId?: LaboratoryObjectIdString;
  departmentId?: LaboratoryObjectIdString;
  status?: LaboratoryOrderStatus;
  priority?: LaboratoryOrderPriority;
  orderedFrom?: string;
  orderedTo?: string;
  sortBy: LaboratoryOrderSortField;
  sortDirection: LaboratorySortDirection;
}

export interface PrintLaboratorySpecimenLabelInput {
  expectedVersion: number;
}

export interface CollectLaboratorySpecimenInput {
  expectedVersion: number;
  collectionMethod: LaboratorySpecimenCollectionMethod;
  collectorStaffId: LaboratoryObjectIdString;
  collectedAt: string;
  collectedVolume?: string | null;
  collectedVolumeUnitCode?: string | null;
  collectionSite?: string | null;
}

export interface ReceiveLaboratorySpecimenInput {
  expectedVersion: number;
  receivedAt: string;
}

export interface RejectLaboratorySpecimenInput {
  expectedVersion: number;
  reasonCode: string;
  reason: string;
  requestRecollection?: boolean;
}

export interface LaboratoryNumericResultValueInput {
  componentCode: string;
  valueType: 'NUMERIC';
  numericValue: string;
  unitCode: string;
  unitName: string;
  flag?: LaboratoryResultFlag;
  interpretation?: string | null;
}

export interface LaboratoryTextResultValueInput {
  componentCode: string;
  valueType: 'TEXT';
  textValue: string;
  flag?: LaboratoryResultFlag;
  interpretation?: string | null;
}

export interface LaboratoryCodedResultValueInput {
  componentCode: string;
  valueType: 'CODED';
  codedValue: {
    code: string;
    display: string;
    codingSystem?: string | null;
  };
  flag?: LaboratoryResultFlag;
  interpretation?: string | null;
}

export interface LaboratoryQualitativeResultValueInput {
  componentCode: string;
  valueType: 'QUALITATIVE';
  qualitativeValue: string;
  flag?: LaboratoryResultFlag;
  interpretation?: string | null;
}

export interface LaboratoryStructuredResultValueInput {
  componentCode: string;
  valueType: 'STRUCTURED';
  structuredValue: Record<string, unknown>;
  flag?: LaboratoryResultFlag;
  interpretation?: string | null;
}

export type LaboratoryResultValueInput =
  | LaboratoryNumericResultValueInput
  | LaboratoryTextResultValueInput
  | LaboratoryCodedResultValueInput
  | LaboratoryQualitativeResultValueInput
  | LaboratoryStructuredResultValueInput;

export interface EnterLaboratoryResultInput {
  expectedVersion?: number;
  labOrderItemId: LaboratoryObjectIdString;
  specimenId?: LaboratoryObjectIdString | null;
  technicianStaffId: LaboratoryObjectIdString;
  components: readonly LaboratoryResultValueInput[];
  conclusion?: string | null;
  technicalNotes?: string | null;
}

export interface ValidateLaboratoryResultInput {
  expectedVersion: number;
  validatorStaffId: LaboratoryObjectIdString;
}

export interface VerifyLaboratoryResultInput {
  expectedVersion: number;
  verifierStaffId: LaboratoryObjectIdString;
}

export interface CorrectLaboratoryResultInput {
  expectedVersion: number;
  technicianStaffId: LaboratoryObjectIdString;
  validatorStaffId: LaboratoryObjectIdString;
  verifierStaffId: LaboratoryObjectIdString;
  components: readonly LaboratoryResultValueInput[];
  conclusion?: string | null;
  technicalNotes?: string | null;
  reason: string;
}

export interface ChangeLaboratoryPublicationInput {
  expectedVersion: number;
  publicationStatus: LaboratoryResultPublicationStatus;
  reason?: string;
}

export interface RecordCriticalResultCommunicationInput {
  expectedVersion: number;
  componentCode: string;
  communicationType: LaboratoryCriticalCommunicationType;
  channel: LaboratoryCommunicationChannel;
  recipientType: LaboratoryCommunicationRecipientType;
  recipientUserId?: LaboratoryObjectIdString | null;
  recipientStaffId?: LaboratoryObjectIdString | null;
  recipientDisplay: string;
  communicationNotes?: string | null;
  acknowledgedAt?: string | null;
  acknowledgedBy?: LaboratoryObjectIdString | null;
  acknowledgementNotes?: string | null;
}

export interface LaboratoryClinicalContext {
  encounterId: LaboratoryObjectIdString;
  facilityId: LaboratoryObjectIdString;
  patientId: LaboratoryObjectIdString;
  requestedPatientId: LaboratoryObjectIdString;
  canonicalRedirected: boolean;
  confidentiality: string;
  registrationId: LaboratoryObjectIdString | null;
  opdVisitId: LaboratoryObjectIdString | null;
  queueTokenId: LaboratoryObjectIdString | null;
  departmentId: LaboratoryObjectIdString;
  clinicId: LaboratoryObjectIdString | null;
  servicePointId: LaboratoryObjectIdString | null;
  orderingProviderId: LaboratoryObjectIdString;
  assignedProviderIds: readonly LaboratoryObjectIdString[];
}

export interface LaboratoryOrderSummaryView {
  id: LaboratoryObjectIdString;
  orderNumber: string;
  patientId: LaboratoryObjectIdString;
  encounterId: LaboratoryObjectIdString;
  orderingProviderId: LaboratoryObjectIdString;
  departmentId: LaboratoryObjectIdString;
  priority: LaboratoryOrderPriority;
  status: LaboratoryOrderStatus;
  itemCount: number;
  orderedAt: string;
  version: number;
}

export interface LaboratorySpecimenSummaryView {
  id: LaboratoryObjectIdString;
  accessionNumber: string;
  specimenIdentifier: string;
  labOrderId: LaboratoryObjectIdString;
  status: LaboratorySpecimenStatus;
  collectedAt: string | null;
  receivedAt: string | null;
  version: number;
}

export interface LaboratoryResultSummaryView {
  id: LaboratoryObjectIdString;
  resultNumber: string;
  labOrderId: LaboratoryObjectIdString;
  labOrderItemId: LaboratoryObjectIdString;
  patientId: LaboratoryObjectIdString;
  encounterId: LaboratoryObjectIdString;
  status: LaboratoryResultStatus;
  publicationStatus: LaboratoryResultPublicationStatus;
  overallFlag: LaboratoryResultFlag;
  verifiedAt: string | null;
  currentVersion: number;
  version: number;
}