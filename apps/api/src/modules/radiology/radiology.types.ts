import type {
  ClinicalConfidentiality,
  RadiologyCatalogStatus,
  RadiologyContrastRequirement,
  RadiologyContrastRoute,
  RadiologyLaterality,
  RadiologyLateralityRequirement,
  RadiologyModalityType,
  RadiologyOrderPriority,
  RadiologyOrderStatus,
  RadiologySafetyRequirement,
} from '@hospital-mis/database';

import type {
  RadiologyCatalogSortField,
  RadiologyOrderSortField,
} from './radiology.constants.js';

export type RadiologyObjectIdString = string;
export type RadiologySortDirection = 'asc' | 'desc';

export interface RadiologyActorContext {
  userId: RadiologyObjectIdString;
  facilityId: RadiologyObjectIdString;
  correlationId: string;
  roleKeys: readonly string[];
  permissionKeys: readonly string[];
  ipAddress?: string;
  userAgent?: string;
  breakGlassReason?: string;
}

export interface CreateRadiologyModalityInput {
  modalityCode: string;
  name: string;
  modalityType: RadiologyModalityType;
  dicomModalityCode: string;
  description?: string | null;
  availableDepartmentIds: readonly RadiologyObjectIdString[];
  supportsContrast?: boolean;
  supportsPacsIntegration?: boolean;
  pacsRoutingCode?: string | null;
  orderable?: boolean;
  effectiveFrom?: string;
  effectiveThrough?: string | null;
}

export interface UpdateRadiologyModalityInput {
  expectedVersion: number;
  name?: string;
  modalityType?: RadiologyModalityType;
  dicomModalityCode?: string;
  description?: string | null;
  availableDepartmentIds?: readonly RadiologyObjectIdString[];
  supportsContrast?: boolean;
  supportsPacsIntegration?: boolean;
  pacsRoutingCode?: string | null;
  orderable?: boolean;
  effectiveFrom?: string;
  effectiveThrough?: string | null;
}

export interface ChangeRadiologyCatalogStatusInput {
  expectedVersion: number;
  status: RadiologyCatalogStatus;
  reason: string;
}

export interface RadiologyBodyRegionInput {
  code: string;
  name: string;
}

export interface CreateRadiologyProcedureInput {
  procedureCode: string;
  name: string;
  aliases?: readonly string[];
  description?: string | null;
  modalityId: RadiologyObjectIdString;
  bodyRegions: readonly RadiologyBodyRegionInput[];
  lateralityRequirement: RadiologyLateralityRequirement;
  permittedLateralities: readonly RadiologyLaterality[];
  contrastRequirement: RadiologyContrastRequirement;
  permittedContrastRoutes?: readonly RadiologyContrastRoute[];
  preparationInstructions?: readonly string[];
  contraindications?: readonly string[];
  safetyScreeningRequirements?: readonly RadiologySafetyRequirement[];
  expectedDurationMinutes: number;
  routineTurnaroundMinutes: number;
  urgentTurnaroundMinutes?: number | null;
  statTurnaroundMinutes?: number | null;
  availableDepartmentIds: readonly RadiologyObjectIdString[];
  schedulingRequired?: boolean;
  requiresTechnician?: boolean;
  requiresRadiologist?: boolean;
  orderable?: boolean;
  chargeCatalogItemId?: RadiologyObjectIdString | null;
  effectiveFrom?: string;
  effectiveThrough?: string | null;
}

export interface UpdateRadiologyProcedureInput {
  expectedVersion: number;
  name?: string;
  aliases?: readonly string[];
  description?: string | null;
  modalityId?: RadiologyObjectIdString;
  bodyRegions?: readonly RadiologyBodyRegionInput[];
  lateralityRequirement?: RadiologyLateralityRequirement;
  permittedLateralities?: readonly RadiologyLaterality[];
  contrastRequirement?: RadiologyContrastRequirement;
  permittedContrastRoutes?: readonly RadiologyContrastRoute[];
  preparationInstructions?: readonly string[];
  contraindications?: readonly string[];
  safetyScreeningRequirements?: readonly RadiologySafetyRequirement[];
  expectedDurationMinutes?: number;
  routineTurnaroundMinutes?: number;
  urgentTurnaroundMinutes?: number | null;
  statTurnaroundMinutes?: number | null;
  availableDepartmentIds?: readonly RadiologyObjectIdString[];
  schedulingRequired?: boolean;
  requiresTechnician?: boolean;
  requiresRadiologist?: boolean;
  orderable?: boolean;
  chargeCatalogItemId?: RadiologyObjectIdString | null;
  effectiveFrom?: string;
  effectiveThrough?: string | null;
}

export interface RadiologyCatalogSearchQuery {
  page: number;
  pageSize: number;
  search?: string;
  modalityId?: RadiologyObjectIdString;
  modalityType?: RadiologyModalityType;
  bodyRegionCode?: string;
  departmentId?: RadiologyObjectIdString;
  contrastRequirement?: RadiologyContrastRequirement;
  status?: RadiologyCatalogStatus;
  orderable?: boolean;
  effectiveAt?: string;
  sortBy: RadiologyCatalogSortField;
  sortDirection: RadiologySortDirection;
}

export interface CreateRadiologyOrderItemInput {
  procedureId: RadiologyObjectIdString;
  requestedLaterality: RadiologyLaterality;
  contrastRequested: boolean;
  requestedContrastRoute?: RadiologyContrastRoute | null;
  specialInstructions?: string | null;
}

export interface CreateRadiologyOrderInput {
  encounterId: RadiologyObjectIdString;
  priority: RadiologyOrderPriority;
  clinicalIndication: string;
  orderingNotes?: string | null;
  items: readonly CreateRadiologyOrderItemInput[];
}

export interface AcceptRadiologyOrderInput {
  expectedVersion: number;
}

export interface RejectRadiologyOrderInput {
  expectedVersion: number;
  reasonCode: string;
  reason: string;
}

export interface CancelRadiologyOrderInput {
  expectedVersion: number;
  reason: string;
}

export interface RadiologyOrderListQuery {
  page: number;
  pageSize: number;
  patientId?: RadiologyObjectIdString;
  encounterId?: RadiologyObjectIdString;
  orderingProviderId?: RadiologyObjectIdString;
  departmentId?: RadiologyObjectIdString;
  procedureId?: RadiologyObjectIdString;
  status?: RadiologyOrderStatus;
  priority?: RadiologyOrderPriority;
  orderedFrom?: string;
  orderedTo?: string;
  sortBy: RadiologyOrderSortField;
  sortDirection: RadiologySortDirection;
}

export interface RadiologyClinicalContext {
  encounterId: RadiologyObjectIdString;
  facilityId: RadiologyObjectIdString;
  patientId: RadiologyObjectIdString;
  requestedPatientId: RadiologyObjectIdString;
  canonicalRedirected: boolean;
  confidentiality: ClinicalConfidentiality;
  registrationId: RadiologyObjectIdString | null;
  opdVisitId: RadiologyObjectIdString | null;
  queueTokenId: RadiologyObjectIdString | null;
  departmentId: RadiologyObjectIdString;
  clinicId: RadiologyObjectIdString | null;
  servicePointId: RadiologyObjectIdString | null;
  orderingProviderId: RadiologyObjectIdString;
  assignedProviderIds: readonly RadiologyObjectIdString[];
}

export interface RadiologyNumberAllocation {
  facilityId: RadiologyObjectIdString;
  year: number;
  sequenceKey: string;
  sequenceValue: number;
  number: string;
}