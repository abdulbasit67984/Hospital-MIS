import type {
  RadiologyAppointmentStatus,
  RadiologyExternalSystemType,
  RadiologyImagingStudyStatus,
  RadiologyLaterality,
  RadiologyPreparationStatus,
  RadiologyResourceStatus,
  RadiologyResourceType,
  RadiologySafetyScreeningStatus,
  RadiologyScreeningResponse,
} from '@hospital-mis/database';

import type {
  RadiologyActorContext,
} from './radiology.types.js';

export interface CreateRadiologyResourceInput {
  resourceCode: string;
  name: string;
  resourceType: RadiologyResourceType;
  departmentId: string;
  modalityIds: readonly string[];
  location?: string | null;
  capabilities?: readonly string[];
  manufacturer?: string | null;
  modelName?: string | null;
  serialNumber?: string | null;
  externalResourceReference?: string | null;
  effectiveFrom?: string;
  effectiveThrough?: string | null;
}

export interface UpdateRadiologyResourceInput {
  expectedVersion: number;
  name?: string;
  departmentId?: string;
  modalityIds?: readonly string[];
  location?: string | null;
  capabilities?: readonly string[];
  manufacturer?: string | null;
  modelName?: string | null;
  serialNumber?: string | null;
  externalResourceReference?: string | null;
  effectiveFrom?: string;
  effectiveThrough?: string | null;
}

export interface ChangeRadiologyResourceStatusInput {
  expectedVersion: number;
  status: RadiologyResourceStatus;
  reason: string;
}

export interface ScheduleRadiologyAppointmentInput {
  orderItemId: string;
  expectedOrderItemVersion: number;
  expectedAppointmentVersion?: number;
  scheduledStartAt: string;
  scheduledEndAt: string;
  timezone?: string;
  roomResourceId?: string | null;
  equipmentResourceIds?: readonly string[];
  technicianStaffIds?: readonly string[];
}

export interface CancelRadiologyAppointmentInput {
  expectedAppointmentVersion: number;
  reason: string;
}

export interface RadiologySafetyResponseInput {
  requirementCode: string;
  response: RadiologyScreeningResponse;
  details?: string | null;
}

export interface RecordRadiologySafetyScreeningInput {
  orderItemId: string;
  expectedOrderItemVersion: number;
  expectedScreeningVersion?: number;
  responses: readonly RadiologySafetyResponseInput[];
  pregnancyStatus: RadiologyScreeningResponse;
  contrastAllergyStatus: RadiologyScreeningResponse;
  renalRiskStatus: RadiologyScreeningResponse;
  implantDeviceStatus: RadiologyScreeningResponse;
  estimatedGfr?: string | null;
  serumCreatinine?: string | null;
  renalLabObservedAt?: string | null;
  status: RadiologySafetyScreeningStatus;
  preparationStatus: RadiologyPreparationStatus;
  conditions?: readonly string[];
}

export interface CheckInRadiologyExaminationInput {
  orderItemId: string;
  expectedOrderItemVersion: number;
  expectedAppointmentVersion?: number;
}

export interface StartRadiologyExaminationInput {
  orderItemId: string;
  expectedOrderItemVersion: number;
  expectedExaminationVersion: number;
  technicianStaffIds?: readonly string[];
}

export interface CompleteRadiologyExaminationInput {
  orderItemId: string;
  expectedOrderItemVersion: number;
  expectedExaminationVersion: number;
  technicianStaffIds: readonly string[];
  contrastAdministered: boolean;
  contrastProductReference?: string | null;
  contrastQuantity?: string | null;
  contrastUnitCode?: string | null;
  technicianNotes?: string | null;
  complications?: string | null;
}

export interface RadiologyExternalStudyReferenceInput {
  systemType: RadiologyExternalSystemType;
  systemName: string;
  endpointAlias: string;
  externalStudyId: string;
  viewerReference?: string | null;
}

export interface RadiologyImagingSeriesInput {
  seriesInstanceUid: string;
  seriesNumber: number;
  modalityCode: string;
  bodyRegionCode?: string | null;
  laterality?: RadiologyLaterality;
  description?: string | null;
  protocolName?: string | null;
  instanceCount: number;
  externalSeriesId?: string | null;
  storageReference?: string | null;
}

export interface RegisterRadiologyImagingStudyInput {
  orderItemId: string;
  expectedOrderItemVersion: number;
  expectedExaminationVersion: number;
  studyInstanceUid: string;
  studyDateTime: string;
  status: RadiologyImagingStudyStatus;
  externalReferences:
    readonly RadiologyExternalStudyReferenceInput[];
  series: readonly RadiologyImagingSeriesInput[];
}

export interface RadiologyOperationsCommand<T> {
  actor: RadiologyActorContext;
  input: T;
  idempotencyKey: string;
}

export interface RadiologyAppointmentCommand<T>
  extends RadiologyOperationsCommand<T> {
  appointmentId: string;
}

export interface RadiologyResourceCommand<T>
  extends RadiologyOperationsCommand<T> {
  resourceId: string;
}

export interface RadiologyOperationsReadQuery {
  scheduledFrom?: string;
  scheduledTo?: string;
  departmentId?: string;
  modalityId?: string;
  resourceId?: string;
  technicianStaffId?: string;
  appointmentStatus?: RadiologyAppointmentStatus;
}