import type {
  RadiologyAppointment,
  RadiologyExamination,
  RadiologyImagingSeries,
  RadiologyImagingStudy,
  RadiologyResource,
  RadiologyResourceReservation,
  RadiologySafetyScreening,
} from '@hospital-mis/database';

import type {
  RadiologyExternalStudyReferenceInput,
  RadiologyImagingSeriesInput,
} from './radiology-operations.types.js';

export type RadiologyResourceRecord =
  RadiologyResource & {
    _id: {
      toHexString(): string;
    };
    facilityId: {
      toHexString(): string;
    };
    departmentId: {
      toHexString(): string;
    };
    modalityIds: Array<{
      toHexString(): string;
    }>;
    createdAt: Date;
    updatedAt: Date;
  };

export type RadiologyAppointmentRecord =
  RadiologyAppointment & {
    _id: {
      toHexString(): string;
    };
    facilityId: {
      toHexString(): string;
    };
    radiologyOrderId: {
      toHexString(): string;
    };
    radiologyOrderItemId: {
      toHexString(): string;
    };
    patientId: {
      toHexString(): string;
    };
    encounterId: {
      toHexString(): string;
    };
    procedureId: {
      toHexString(): string;
    };
    modalityId: {
      toHexString(): string;
    };
    departmentId: {
      toHexString(): string;
    };
    roomResourceId: {
      toHexString(): string;
    } | null;
    equipmentResourceIds: Array<{
      toHexString(): string;
    }>;
    technicianStaffIds: Array<{
      toHexString(): string;
    }>;
    createdAt: Date;
    updatedAt: Date;
  };

export type RadiologyResourceReservationRecord =
  RadiologyResourceReservation & {
    _id: {
      toHexString(): string;
    };
    facilityId: {
      toHexString(): string;
    };
    appointmentId: {
      toHexString(): string;
    };
    radiologyOrderItemId: {
      toHexString(): string;
    };
    resourceId: {
      toHexString(): string;
    } | null;
    staffId: {
      toHexString(): string;
    } | null;
    createdAt: Date;
    updatedAt: Date;
  };

export type RadiologySafetyScreeningRecord =
  RadiologySafetyScreening & {
    _id: {
      toHexString(): string;
    };
    facilityId: {
      toHexString(): string;
    };
    radiologyOrderId: {
      toHexString(): string;
    };
    radiologyOrderItemId: {
      toHexString(): string;
    };
    patientId: {
      toHexString(): string;
    };
    encounterId: {
      toHexString(): string;
    };
    appointmentId: {
      toHexString(): string;
    } | null;
    createdAt: Date;
    updatedAt: Date;
  };

export type RadiologyExaminationRecord =
  RadiologyExamination & {
    _id: {
      toHexString(): string;
    };
    facilityId: {
      toHexString(): string;
    };
    radiologyOrderId: {
      toHexString(): string;
    };
    radiologyOrderItemId: {
      toHexString(): string;
    };
    appointmentId: {
      toHexString(): string;
    } | null;
    patientId: {
      toHexString(): string;
    };
    encounterId: {
      toHexString(): string;
    };
    modalityId: {
      toHexString(): string;
    };
    technicianStaffIds: Array<{
      toHexString(): string;
    }>;
    createdAt: Date;
    updatedAt: Date;
  };

export type RadiologyImagingStudyRecord =
  RadiologyImagingStudy & {
    _id: {
      toHexString(): string;
    };
    facilityId: {
      toHexString(): string;
    };
    radiologyOrderId: {
      toHexString(): string;
    };
    radiologyOrderItemId: {
      toHexString(): string;
    };
    examinationId: {
      toHexString(): string;
    };
    patientId: {
      toHexString(): string;
    };
    encounterId: {
      toHexString(): string;
    };
    modalityId: {
      toHexString(): string;
    };
    createdAt: Date;
    updatedAt: Date;
  };

export type RadiologyImagingSeriesRecord =
  RadiologyImagingSeries & {
    _id: {
      toHexString(): string;
    };
    facilityId: {
      toHexString(): string;
    };
    imagingStudyId: {
      toHexString(): string;
    };
    patientId: {
      toHexString(): string;
    };
    createdAt: Date;
    updatedAt: Date;
  };

export interface RadiologyReservationSubject {
  subjectType: 'RESOURCE' | 'STAFF';
  resourceId: string | null;
  staffId: string | null;
}

export interface RadiologySchedulingConflict {
  reservationId: string;
  appointmentId: string;
  subjectType: 'RESOURCE' | 'STAFF';
  resourceId: string | null;
  staffId: string | null;
  reservedStartAt: Date;
  reservedEndAt: Date;
}

export interface RadiologyOperationsRepositoryPort {
  findResourceById(
    facilityId: string,
    resourceId: string,
  ): Promise<RadiologyResourceRecord | null>;

  findResourcesByIds(
    facilityId: string,
    resourceIds: readonly string[],
  ): Promise<RadiologyResourceRecord[]>;

  findEligibleTechnicians(
    facilityId: string,
    staffIds: readonly string[],
  ): Promise<string[]>;

  createResource(
    input: Record<string, unknown>,
  ): Promise<RadiologyResourceRecord>;

  updateResource(
    facilityId: string,
    resourceId: string,
    expectedVersion: number,
    update: Record<string, unknown>,
  ): Promise<RadiologyResourceRecord | null>;

  findAppointmentById(
    facilityId: string,
    appointmentId: string,
  ): Promise<RadiologyAppointmentRecord | null>;

  findAppointmentByOrderItem(
    facilityId: string,
    orderItemId: string,
  ): Promise<RadiologyAppointmentRecord | null>;

  findReservationsByAppointment(
    facilityId: string,
    appointmentId: string,
  ): Promise<RadiologyResourceReservationRecord[]>;

  findSchedulingConflicts(
    facilityId: string,
    subjects: readonly RadiologyReservationSubject[],
    startAt: Date,
    endAt: Date,
    excludeAppointmentId?: string,
  ): Promise<RadiologySchedulingConflict[]>;

  saveAppointmentSchedule(input: {
    appointment: Record<string, unknown>;
    expectedAppointmentVersion: number | null;
    previousAppointmentId: string | null;
    reservations: readonly Record<string, unknown>[];
    releasedAt: Date;
    releasedByStaffId: string;
  }): Promise<{
    appointment: RadiologyAppointmentRecord;
    reservations:
      RadiologyResourceReservationRecord[];
  } | null>;

  cancelAppointment(input: {
    facilityId: string;
    appointmentId: string;
    expectedVersion: number;
    cancelledAt: Date;
    cancelledByStaffId: string;
    cancelledByUserId: string;
    reason: string;
  }): Promise<RadiologyAppointmentRecord | null>;

  findSafetyScreeningByOrderItem(
    facilityId: string,
    orderItemId: string,
  ): Promise<RadiologySafetyScreeningRecord | null>;

  saveSafetyScreening(
    input: Record<string, unknown>,
    expectedVersion: number | null,
  ): Promise<RadiologySafetyScreeningRecord | null>;

  findExaminationByOrderItem(
    facilityId: string,
    orderItemId: string,
  ): Promise<RadiologyExaminationRecord | null>;

  createExamination(
    input: Record<string, unknown>,
  ): Promise<RadiologyExaminationRecord>;

  updateExamination(
    facilityId: string,
    examinationId: string,
    expectedVersion: number,
    update: Record<string, unknown>,
  ): Promise<RadiologyExaminationRecord | null>;

  updateAppointmentOperationalStatus(
    facilityId: string,
    appointmentId: string,
    expectedVersion: number,
    update: Record<string, unknown>,
  ): Promise<RadiologyAppointmentRecord | null>;

  findImagingStudyByOrderItem(
    facilityId: string,
    orderItemId: string,
  ): Promise<RadiologyImagingStudyRecord | null>;

  createImagingStudy(input: {
    study: Record<string, unknown>;
    series: readonly Record<string, unknown>[];
  }): Promise<{
    study: RadiologyImagingStudyRecord;
    series: RadiologyImagingSeriesRecord[];
  }>;
}

export interface RadiologyVerifiedExternalStudy {
  studyInstanceUid: string;
  studyDateTime: Date;
  references:
    RadiologyExternalStudyReferenceInput[];
  series: RadiologyImagingSeriesInput[];
}

export interface RadiologyImagingGatewayPort {
  verifyExternalStudy(input: {
    facilityId: string;
    patientId: string;
    accessionNumber: string;
    studyInstanceUid: string;
    studyDateTime: Date;
    externalReferences:
      readonly RadiologyExternalStudyReferenceInput[];
    series:
      readonly RadiologyImagingSeriesInput[];
    correlationId: string;
  }): Promise<RadiologyVerifiedExternalStudy>;
}

export interface RadiologyContrastUsageRequest {
  facilityId: string;
  patientId: string;
  encounterId: string;
  radiologyOrderId: string;
  radiologyOrderItemId: string;
  examinationId: string;
  productReference: string;
  quantity: string;
  unitCode: string;
  requestedBy: string;
  requestedAt: Date;
  transactionId: string;
  correlationId: string;
}

export interface RadiologyInventoryUsageBoundaryPort {
  recordContrastUsage(
    request: RadiologyContrastUsageRequest,
  ): Promise<{
    usageReference: string;
  }>;
}