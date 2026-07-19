import type {
  Types,
} from 'mongoose';

import type {
  RadiologyBillingStatus,
  RadiologyCatalogStatus,
  RadiologyContrastRequirement,
  RadiologyContrastRoute,
  RadiologyLaterality,
  RadiologyLateralityRequirement,
  RadiologyModalityType,
  RadiologyOrderItemStatus,
  RadiologyOrderPriority,
  RadiologyOrderStatus,
  RadiologyOrderStatusChangeSource,
  RadiologyPreparationStatus,
  RadiologySafetyRequirement,
  RadiologySafetyScreeningStatus,
} from '@hospital-mis/database';

export interface RadiologyPersistenceMetadata {
  facilityId: Types.ObjectId;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface RadiologyCatalogLifecycleRecord {
  status: RadiologyCatalogStatus;
  deactivatedAt: Date | null;
  deactivatedBy: Types.ObjectId | null;
  deactivationReason: string | null;
}

export interface RadiologyModalityRecord
extends RadiologyPersistenceMetadata,
  RadiologyCatalogLifecycleRecord {
  _id: Types.ObjectId;
  modalityCode: string;
  name: string;
  normalizedName: string;
  modalityType: RadiologyModalityType;
  dicomModalityCode: string;
  description: string | null;
  availableDepartmentIds: Types.ObjectId[];
  supportsContrast: boolean;
  supportsPacsIntegration: boolean;
  pacsRoutingCode: string | null;
  orderable: boolean;
  effectiveFrom: Date;
  effectiveThrough: Date | null;
  transactionId: string;
  correlationId: string;
}

export interface RadiologyBodyRegionRecord {
  code: string;
  name: string;
}

export interface RadiologyProcedureRecord
extends RadiologyPersistenceMetadata,
  RadiologyCatalogLifecycleRecord {
  _id: Types.ObjectId;
  procedureCode: string;
  name: string;
  normalizedName: string;
  aliases: string[];
  normalizedAliases: string[];
  description: string | null;
  modalityId: Types.ObjectId;
  modalityCodeSnapshot: string;
  modalityNameSnapshot: string;
  modalityTypeSnapshot: RadiologyModalityType;
  dicomModalityCodeSnapshot: string;
  bodyRegions: RadiologyBodyRegionRecord[];
  lateralityRequirement: RadiologyLateralityRequirement;
  permittedLateralities: RadiologyLaterality[];
  contrastRequirement: RadiologyContrastRequirement;
  permittedContrastRoutes: RadiologyContrastRoute[];
  preparationInstructions: string[];
  contraindications: string[];
  safetyScreeningRequirements: RadiologySafetyRequirement[];
  expectedDurationMinutes: number;
  routineTurnaroundMinutes: number;
  urgentTurnaroundMinutes: number | null;
  statTurnaroundMinutes: number | null;
  availableDepartmentIds: Types.ObjectId[];
  schedulingRequired: boolean;
  requiresTechnician: boolean;
  requiresRadiologist: boolean;
  orderable: boolean;
  chargeCatalogItemId: Types.ObjectId | null;
  effectiveFrom: Date;
  effectiveThrough: Date | null;
  transactionId: string;
  correlationId: string;
}

export interface RadiologyProcedureDefinitionSnapshotRecord {
  procedureId: Types.ObjectId;
  procedureVersion: number;
  procedureCode: string;
  procedureName: string;
  description: string | null;
  modalityId: Types.ObjectId;
  modalityCode: string;
  modalityName: string;
  modalityType: RadiologyModalityType;
  dicomModalityCode: string;
  bodyRegions: RadiologyBodyRegionRecord[];
  lateralityRequirement: RadiologyLateralityRequirement;
  permittedLateralities: RadiologyLaterality[];
  contrastRequirement: RadiologyContrastRequirement;
  permittedContrastRoutes: RadiologyContrastRoute[];
  preparationInstructions: string[];
  contraindications: string[];
  safetyScreeningRequirements: RadiologySafetyRequirement[];
  expectedDurationMinutes: number;
  routineTurnaroundMinutes: number;
  urgentTurnaroundMinutes: number | null;
  statTurnaroundMinutes: number | null;
  availableDepartmentIds: Types.ObjectId[];
  schedulingRequired: boolean;
  requiresTechnician: boolean;
  requiresRadiologist: boolean;
  chargeCatalogItemId: Types.ObjectId | null;
  effectiveFrom: Date;
  effectiveThrough: Date | null;
  capturedAt: Date;
}

export interface RadiologyOrderRecord
extends RadiologyPersistenceMetadata {
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
  priority: RadiologyOrderPriority;
  status: RadiologyOrderStatus;
  clinicalIndication: string;
  orderingNotes: string | null;
  orderedAt: Date;
  acceptedAt: Date | null;
  acceptedBy: Types.ObjectId | null;
  scheduledAt: Date | null;
  checkedInAt: Date | null;
  examinationStartedAt: Date | null;
  examinationCompletedAt: Date | null;
  verifiedAt: Date | null;
  rejectedAt: Date | null;
  rejectedBy: Types.ObjectId | null;
  rejectionReasonCode: string | null;
  rejectionReason: string | null;
  cancelledAt: Date | null;
  cancelledBy: Types.ObjectId | null;
  cancellationReason: string | null;
  itemCount: number;
  activeItemCount: number;
  scheduledItemCount: number;
  completedItemCount: number;
  reportedItemCount: number;
  verifiedItemCount: number;
  rejectedItemCount: number;
  lastStatusChangedAt: Date;
  lastStatusChangedBy: Types.ObjectId;
  transactionId: string;
  correlationId: string;
}

export interface RadiologyOrderItemRecord
extends RadiologyPersistenceMetadata {
  _id: Types.ObjectId;
  radiologyOrderId: Types.ObjectId;
  patientId: Types.ObjectId;
  encounterId: Types.ObjectId;
  sequence: number;
  radiologyProcedureId: Types.ObjectId;
  procedureDefinitionSnapshot: RadiologyProcedureDefinitionSnapshotRecord;
  procedureDefinitionHash: string;
  requestedLaterality: RadiologyLaterality;
  contrastRequested: boolean;
  requestedContrastRoute: RadiologyContrastRoute | null;
  specialInstructions: string | null;
  priority: RadiologyOrderPriority;
  status: RadiologyOrderItemStatus;
  orderedAt: Date;
  dueAt: Date;
  preparationStatus: RadiologyPreparationStatus;
  safetyScreeningStatus: RadiologySafetyScreeningStatus;
  appointmentId: Types.ObjectId | null;
  imagingStudyId: Types.ObjectId | null;
  reportId: Types.ObjectId | null;
  accessionNumber: string | null;
  externalStudyIdentifier: string | null;
  acceptedAt: Date | null;
  acceptedBy: Types.ObjectId | null;
  scheduledAt: Date | null;
  checkedInAt: Date | null;
  examinationStartedAt: Date | null;
  examinationCompletedAt: Date | null;
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
  billingStatus: RadiologyBillingStatus;
  billingFailureCode: string | null;
  transactionId: string;
  correlationId: string;
}

export interface RadiologyOrderStatusHistoryRecord
extends RadiologyPersistenceMetadata {
  _id: Types.ObjectId;
  radiologyOrderId: Types.ObjectId;
  patientId: Types.ObjectId;
  encounterId: Types.ObjectId;
  sequence: number;
  fromStatus: RadiologyOrderStatus | null;
  toStatus: RadiologyOrderStatus;
  changeSource: RadiologyOrderStatusChangeSource;
  reasonCode: string | null;
  reason: string | null;
  occurredAt: Date;
  changedBy: Types.ObjectId;
  transactionId: string;
  correlationId: string;
}

export interface RadiologyOrderItemStatusHistoryRecord
extends RadiologyPersistenceMetadata {
  _id: Types.ObjectId;
  radiologyOrderId: Types.ObjectId;
  radiologyOrderItemId: Types.ObjectId;
  patientId: Types.ObjectId;
  encounterId: Types.ObjectId;
  sequence: number;
  fromStatus: RadiologyOrderItemStatus | null;
  toStatus: RadiologyOrderItemStatus;
  changeSource: RadiologyOrderStatusChangeSource;
  reasonCode: string | null;
  reason: string | null;
  occurredAt: Date;
  changedBy: Types.ObjectId;
  transactionId: string;
  correlationId: string;
}