import type {
  Types,
} from 'mongoose';

import type {
  ClinicStatus,
  OpdVisitStatus,
  PatientStatus,
  QueueDefinitionStatus,
  QueueEntryStatus,
  QueuePriorityClass,
  QueuePublicDisplayMode,
  QueueResetPolicy,
  QueueSpecialCategory,
  QueueStatusChangeSource,
  QueueTransferReason,
  RegistrationMode,
  RegistrationSource,
  RegistrationStatus,
  ServiceCounterStatus,
  ServiceCounterType,
  ServicePointStatus,
  ServicePointType,
  TriagePriority,
  VisitType,
} from '@hospital-mis/database';

import type {
  OpdVisitSortField,
  QueueEntrySortField,
  RegistrationSortField,
} from './registration-queue.constants.js';

export type RegistrationQueueObjectIdString =
  string;

export type RegistrationQueueSortDirection =
  | 'asc'
  | 'desc';

export interface RegistrationQueueActorContext {
  userId: RegistrationQueueObjectIdString;
  facilityId: RegistrationQueueObjectIdString;
  correlationId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface RegistrationContextInput {
  departmentId: RegistrationQueueObjectIdString;
  clinicId?: RegistrationQueueObjectIdString | null;
  servicePointId?: RegistrationQueueObjectIdString | null;
  assignedProviderId?: RegistrationQueueObjectIdString | null;
  assignedCounterId?: RegistrationQueueObjectIdString | null;
}

export interface CreateRegistrationInput
extends RegistrationContextInput {
  patientId: RegistrationQueueObjectIdString;
  registrationMode: RegistrationMode;
  registrationSource: RegistrationSource;
  visitType: VisitType;
  serviceDate: string;
  arrivedAt?: string;
  checkedInAt?: string | null;
  appointmentId?: RegistrationQueueObjectIdString | null;
  referralId?: RegistrationQueueObjectIdString | null;
  referralReference?: string | null;
  emergencyCaseId?: RegistrationQueueObjectIdString | null;
  registrationNotes?: string | null;
}

export interface CreateQueueEntryInput {
  queueDefinitionId: RegistrationQueueObjectIdString;
  assignedProviderId?: RegistrationQueueObjectIdString | null;
  assignedCounterId?: RegistrationQueueObjectIdString | null;
  priorityClass?: QueuePriorityClass;
  triagePriority?: TriagePriority;
  emergencyOverride?: boolean;
  emergencyOverrideReason?: string | null;
  specialCategories?: readonly QueueSpecialCategory[];
}

export interface RegisterOpdVisitInput {
  registration: CreateRegistrationInput;
  queue?: CreateQueueEntryInput | null;
}

export interface CancelRegistrationInput {
  expectedVersion: number;
  reason: string;
}

export interface CancelOpdVisitInput {
  expectedVersion: number;
  reason: string;
}

export interface MarkOpdVisitNoShowInput {
  expectedVersion: number;
  reason: string;
}

export interface CorrectOpdVisitInput {
  expectedVersion: number;
  reason: string;
  replacement: CreateRegistrationInput;
  queue?: CreateQueueEntryInput | null;
}

export interface UpdateQueueAssignmentInput {
  expectedVersion: number;
  assignedProviderId?: RegistrationQueueObjectIdString | null;
  assignedCounterId?: RegistrationQueueObjectIdString | null;
  reason: string;
}

export interface UpdateQueuePriorityInput {
  expectedVersion: number;
  priorityClass: QueuePriorityClass;
  triagePriority: TriagePriority;
  emergencyOverride: boolean;
  emergencyOverrideReason?: string | null;
  specialCategories: readonly QueueSpecialCategory[];
  reason: string;
}

export interface ChangeQueueStatusInput {
  expectedVersion: number;
  status: Exclude<
    QueueEntryStatus,
    'TRANSFERRED'
  >;
  reason?: string | null;
  counterId?: RegistrationQueueObjectIdString | null;
  providerId?: RegistrationQueueObjectIdString | null;
  changeSource: QueueStatusChangeSource;
}

export interface TransferQueueEntryInput {
  expectedVersion: number;
  destinationQueueDefinitionId: RegistrationQueueObjectIdString;
  destinationProviderId?: RegistrationQueueObjectIdString | null;
  destinationCounterId?: RegistrationQueueObjectIdString | null;
  transferReason: QueueTransferReason;
  reason: string;
}

export interface RegistrationListQuery {
  page: number;
  pageSize: number;
  sortBy: RegistrationSortField;
  sortDirection: RegistrationQueueSortDirection;
  patientId?: RegistrationQueueObjectIdString;
  serviceDateFrom?: string;
  serviceDateTo?: string;
  status?: RegistrationStatus;
  registrationSource?: RegistrationSource;
  visitType?: VisitType;
  departmentId?: RegistrationQueueObjectIdString;
  clinicId?: RegistrationQueueObjectIdString;
  servicePointId?: RegistrationQueueObjectIdString;
  assignedProviderId?: RegistrationQueueObjectIdString;
}

export interface OpdVisitListQuery {
  page: number;
  pageSize: number;
  sortBy: OpdVisitSortField;
  sortDirection: RegistrationQueueSortDirection;
  patientId?: RegistrationQueueObjectIdString;
  serviceDateFrom?: string;
  serviceDateTo?: string;
  status?: OpdVisitStatus;
  registrationSource?: RegistrationSource;
  visitType?: VisitType;
  departmentId?: RegistrationQueueObjectIdString;
  clinicId?: RegistrationQueueObjectIdString;
  servicePointId?: RegistrationQueueObjectIdString;
  assignedProviderId?: RegistrationQueueObjectIdString;
  assignedCounterId?: RegistrationQueueObjectIdString;
}

export interface QueueEntryListQuery {
  page: number;
  pageSize: number;
  sortBy: QueueEntrySortField;
  sortDirection: RegistrationQueueSortDirection;
  serviceDate: string;
  queueDefinitionId?: RegistrationQueueObjectIdString;
  status?: QueueEntryStatus;
  assignedProviderId?: RegistrationQueueObjectIdString;
  assignedCounterId?: RegistrationQueueObjectIdString;
  patientId?: RegistrationQueueObjectIdString;
  priorityClass?: QueuePriorityClass;
  triagePriority?: TriagePriority;
  emergencyOverride?: boolean;
}

export interface RegistrationQueuePageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface OpdClinicRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  departmentId: Types.ObjectId;
  code: string;
  name: string;
  description: string | null;
  location: string | null;
  defaultProviderId: Types.ObjectId | null;
  status: ClinicStatus;
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

export interface ServicePointRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  departmentId: Types.ObjectId;
  clinicId: Types.ObjectId | null;
  code: string;
  name: string;
  servicePointType: ServicePointType;
  location: string | null;
  defaultProviderId: Types.ObjectId | null;
  allowsWalkIn: boolean;
  allowsAppointment: boolean;
  allowsReferral: boolean;
  allowsEmergency: boolean;
  status: ServicePointStatus;
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

export interface QueueDefinitionRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  departmentId: Types.ObjectId;
  clinicId: Types.ObjectId | null;
  servicePointId: Types.ObjectId | null;
  providerId: Types.ObjectId | null;
  code: string;
  name: string;
  displayLabel: string;
  tokenPrefix: string;
  resetPolicy: QueueResetPolicy;
  timezone: string;
  estimatedServiceMinutes: number;
  maximumRecallCount: number;
  allowPriority: boolean;
  allowEmergencyOverride: boolean;
  publicDisplayEnabled: boolean;
  publicDisplayMode: QueuePublicDisplayMode;
  status: QueueDefinitionStatus;
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

export interface ServiceCounterRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  departmentId: Types.ObjectId;
  clinicId: Types.ObjectId | null;
  servicePointId: Types.ObjectId | null;
  code: string;
  name: string;
  counterType: ServiceCounterType;
  queueDefinitionIds: Types.ObjectId[];
  status: ServiceCounterStatus;
  activeUserId: Types.ObjectId | null;
  activeProviderId: Types.ObjectId | null;
  openedAt: Date | null;
  closedAt: Date | null;
  statusReason: string | null;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegistrationRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  registrationNumber: string;
  patientId: Types.ObjectId;
  requestedPatientId: Types.ObjectId;
  canonicalRedirected: boolean;
  registrationMode: RegistrationMode;
  registrationSource: RegistrationSource;
  visitType: VisitType;
  status: RegistrationStatus;
  serviceDate: string;
  arrivedAt: Date;
  checkedInAt: Date | null;
  appointmentId: Types.ObjectId | null;
  referralId: Types.ObjectId | null;
  referralReference: string | null;
  emergencyCaseId: Types.ObjectId | null;
  departmentId: Types.ObjectId;
  clinicId: Types.ObjectId | null;
  servicePointId: Types.ObjectId | null;
  assignedProviderId: Types.ObjectId | null;
  registrationNotes: string | null;
  cancelledAt: Date | null;
  cancelledBy: Types.ObjectId | null;
  cancellationReason: string | null;
  supersedesRegistrationId: Types.ObjectId | null;
  supersededByRegistrationId: Types.ObjectId | null;
  correctionReason: string | null;
  transactionId: string;
  correlationId: string;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface OpdVisitRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  visitNumber: string;
  registrationId: Types.ObjectId;
  patientId: Types.ObjectId;
  requestedPatientId: Types.ObjectId;
  canonicalRedirected: boolean;
  serviceDate: string;
  visitType: VisitType;
  registrationSource: RegistrationSource;
  status: OpdVisitStatus;
  departmentId: Types.ObjectId;
  clinicId: Types.ObjectId | null;
  servicePointId: Types.ObjectId | null;
  assignedProviderId: Types.ObjectId | null;
  assignedCounterId: Types.ObjectId | null;
  currentQueueTokenId: Types.ObjectId | null;
  activeVisitKey: string | null;
  arrivedAt: Date;
  checkedInAt: Date | null;
  queuedAt: Date | null;
  serviceStartedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancelledBy: Types.ObjectId | null;
  cancellationReason: string | null;
  noShowAt: Date | null;
  noShowMarkedBy: Types.ObjectId | null;
  supersedesVisitId: Types.ObjectId | null;
  supersededByVisitId: Types.ObjectId | null;
  correctionReason: string | null;
  transactionId: string;
  correlationId: string;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface QueueTokenRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  queueEntryId: string;
  registrationId: Types.ObjectId;
  opdVisitId: Types.ObjectId;
  patientId: Types.ObjectId;
  queueDefinitionId: Types.ObjectId;
  serviceDate: string;
  tokenNumber: number;
  tokenPrefix: string;
  tokenLabel: string;
  status: QueueEntryStatus;
  priorityClass: QueuePriorityClass;
  priorityScore: number;
  triagePriority: TriagePriority;
  emergencyOverride: boolean;
  emergencyOverrideReason: string | null;
  specialCategories: QueueSpecialCategory[];
  assignedProviderId: Types.ObjectId | null;
  assignedCounterId: Types.ObjectId | null;
  activeEntryKey: string | null;
  queuedAt: Date;
  calledAt: Date | null;
  servingAt: Date | null;
  skippedAt: Date | null;
  transferredAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  noShowAt: Date | null;
  skipCount: number;
  recallCount: number;
  transferCount: number;
  estimatedWaitMinutes: number | null;
  estimatedServiceAt: Date | null;
  transferredFromQueueTokenId: Types.ObjectId | null;
  transferredToQueueTokenId: Types.ObjectId | null;
  transferReason: QueueTransferReason | null;
  statusReason: string | null;
  lastStatusChangedAt: Date;
  lastStatusChangedBy: Types.ObjectId;
  transactionId: string;
  correlationId: string;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface QueueStatusHistoryRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  queueTokenId: Types.ObjectId;
  queueEntryId: string;
  opdVisitId: Types.ObjectId;
  patientId: Types.ObjectId;
  sequence: number;
  fromStatus: QueueEntryStatus | null;
  toStatus: QueueEntryStatus;
  queueDefinitionId: Types.ObjectId;
  destinationQueueDefinitionId: Types.ObjectId | null;
  providerId: Types.ObjectId | null;
  destinationProviderId: Types.ObjectId | null;
  counterId: Types.ObjectId | null;
  destinationCounterId: Types.ObjectId | null;
  changeSource: QueueStatusChangeSource;
  transferReason: QueueTransferReason | null;
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

export interface CanonicalPatientRegistrationResolution {
  requestedPatientId: string;
  canonicalPatientId: string;
  canonicalEnterprisePatientId: string;
  canonicalStatus: PatientStatus;
  redirected: boolean;
  redirectPath: string[];
}

export interface RegistrationNumberAllocation {
  facilityId: string;
  serviceDate: string;
  sequenceValue: number;
  registrationNumber: string;
}

export interface VisitNumberAllocation {
  facilityId: string;
  serviceDate: string;
  sequenceValue: number;
  visitNumber: string;
}

export interface QueueTokenNumberAllocation {
  facilityId: string;
  serviceDate: string;
  queueDefinitionId: string;
  sequenceValue: number;
  tokenNumber: number;
  tokenPrefix: string;
  tokenLabel: string;
}

export interface QueuePositionProjection {
  queueEntryId: string;
  position: number;
  patientsAhead: number;
  estimatedWaitMinutes: number;
  estimatedServiceAt: string | null;
  calculatedAt: string;
}

export interface QueuePublicDisplayProjection {
  queueEntryId: string;
  tokenLabel: string;
  status: QueueEntryStatus;
  queueDisplayLabel: string;
  counterCode: string | null;
  counterName: string | null;
  calledAt: string | null;
  servingAt: string | null;
  lastStatusChangedAt: string;
}

export interface RegistrationPrintProjection {
  registrationNumber: string;
  visitNumber: string;
  patientId: string;
  serviceDate: string;
  arrivedAt: string;
  departmentName: string;
  clinicName: string | null;
  servicePointName: string | null;
  providerName: string | null;
  tokenLabel: string | null;
}