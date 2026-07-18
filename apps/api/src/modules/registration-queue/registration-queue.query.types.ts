import type {
  OpdVisitStatus,
  QueueEntryStatus,
  QueuePriorityClass,
  QueuePublicDisplayMode,
  TriagePriority,
} from '@hospital-mis/database';

import type {
  OpdVisitListQuery,
  QueueEntryListQuery,
  RegistrationListQuery,
} from './registration-queue.types.js';

export interface QueueDashboardQuery {
  serviceDate: string;
  queueDefinitionId?: string;
  departmentId?: string;
  clinicId?: string;
  servicePointId?: string;
  assignedProviderId?: string;
  assignedCounterId?: string;
}

export interface QueueHistoryQuery {
  includeReason: boolean;
}

export interface PublicQueueDisplayQuery {
  serviceDate: string;
  queueDefinitionId: string;
  maximumEntries: number;
}

export interface RegistrationQueueConfigurationQuery {
  departmentId?: string;
  clinicId?: string;
  servicePointId?: string;
  includeInactive: boolean;
}

export interface RegistrationQueueRegistrationProjection {
  id: string;
  registrationNumber: string;
  patientId: string;
  requestedPatientId: string;
  canonicalRedirected: boolean;
  registrationMode: string;
  registrationSource: string;
  visitType: string;
  status: string;
  serviceDate: string;
  arrivedAt: string;
  checkedInAt: string | null;
  appointmentId: string | null;
  referralId: string | null;
  emergencyCaseId: string | null;
  departmentId: string;
  clinicId: string | null;
  servicePointId: string | null;
  assignedProviderId: string | null;
  cancelledAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RegistrationQueueVisitProjection {
  id: string;
  visitNumber: string;
  registrationId: string;
  patientId: string;
  serviceDate: string;
  visitType: string;
  registrationSource: string;
  status: OpdVisitStatus;
  departmentId: string;
  clinicId: string | null;
  servicePointId: string | null;
  assignedProviderId: string | null;
  assignedCounterId: string | null;
  currentQueueTokenId: string | null;
  arrivedAt: string;
  checkedInAt: string | null;
  queuedAt: string | null;
  serviceStartedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  noShowAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RegistrationQueueEntryProjection {
  id: string;
  queueEntryId: string;
  registrationId: string;
  opdVisitId: string;
  patientId: string;
  queueDefinitionId: string;
  queueCode: string | null;
  queueName: string | null;
  queueDisplayLabel: string | null;
  serviceDate: string;
  tokenNumber: number;
  tokenLabel: string;
  status: QueueEntryStatus;
  priorityClass: QueuePriorityClass;
  priorityScore: number;
  triagePriority: TriagePriority;
  emergencyOverride: boolean;
  specialCategories: readonly string[];
  assignedProviderId: string | null;
  assignedProviderName: string | null;
  assignedCounterId: string | null;
  assignedCounterCode: string | null;
  assignedCounterName: string | null;
  queuedAt: string;
  calledAt: string | null;
  servingAt: string | null;
  skippedAt: string | null;
  transferredAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  noShowAt: string | null;
  skipCount: number;
  recallCount: number;
  transferCount: number;
  position: number | null;
  patientsAhead: number | null;
  estimatedWaitMinutes: number | null;
  estimatedServiceAt: string | null;
  lastStatusChangedAt: string;
  version: number;
}

export interface RegistrationQueueHistoryProjection {
  id: string;
  sequence: number;
  fromStatus: QueueEntryStatus | null;
  toStatus: QueueEntryStatus;
  queueDefinitionId: string;
  destinationQueueDefinitionId: string | null;
  providerId: string | null;
  destinationProviderId: string | null;
  counterId: string | null;
  destinationCounterId: string | null;
  changeSource: string;
  transferReason: string | null;
  reason?: string | null;
  occurredAt: string;
  changedBy: string;
}

export interface RegistrationQueueBundleResult {
  registration: RegistrationQueueRegistrationProjection;
  visit: RegistrationQueueVisitProjection | null;
  queue: RegistrationQueueEntryProjection | null;
  history: RegistrationQueueHistoryProjection[];
}

export interface RegistrationQueueVisitBundleResult {
  registration: RegistrationQueueRegistrationProjection | null;
  visit: RegistrationQueueVisitProjection;
  queue: RegistrationQueueEntryProjection | null;
  history: RegistrationQueueHistoryProjection[];
}

export interface RegistrationQueueEntryBundleResult {
  registration: RegistrationQueueRegistrationProjection | null;
  visit: RegistrationQueueVisitProjection | null;
  queue: RegistrationQueueEntryProjection;
  history: RegistrationQueueHistoryProjection[];
}

export interface RegistrationQueuePageProjection<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface QueueStatusCountProjection {
  status: QueueEntryStatus;
  count: number;
}

export interface QueueOperationalMetricsProjection {
  serviceDate: string;
  totalEntries: number;
  activeEntries: number;
  waitingEntries: number;
  calledEntries: number;
  servingEntries: number;
  skippedEntries: number;
  completedEntries: number;
  transferredEntries: number;
  cancelledEntries: number;
  noShowEntries: number;
  averageWaitMinutes: number | null;
  averageServiceMinutes: number | null;
  longestCurrentWaitMinutes: number | null;
}

export interface QueueDashboardResult {
  generatedAt: string;
  query: QueueDashboardQuery;
  metrics: QueueOperationalMetricsProjection;
  statusCounts: QueueStatusCountProjection[];
  entries: RegistrationQueueEntryProjection[];
}

export interface QueuePublicDisplayEntry {
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

export interface QueuePublicDisplayResult {
  generatedAt: string;
  facilityId: string;
  serviceDate: string;
  queueDefinitionId: string;
  queueCode: string;
  queueDisplayLabel: string;
  publicDisplayMode: QueuePublicDisplayMode;
  entries: QueuePublicDisplayEntry[];
}

export interface RegistrationQueueClinicOption {
  id: string;
  departmentId: string;
  code: string;
  name: string;
  location: string | null;
  defaultProviderId: string | null;
  status: string;
}

export interface RegistrationQueueServicePointOption {
  id: string;
  departmentId: string;
  clinicId: string | null;
  code: string;
  name: string;
  servicePointType: string;
  location: string | null;
  defaultProviderId: string | null;
  allowsWalkIn: boolean;
  allowsAppointment: boolean;
  allowsReferral: boolean;
  allowsEmergency: boolean;
  status: string;
}

export interface RegistrationQueueDefinitionOption {
  id: string;
  departmentId: string;
  clinicId: string | null;
  servicePointId: string | null;
  providerId: string | null;
  code: string;
  name: string;
  displayLabel: string;
  tokenPrefix: string;
  estimatedServiceMinutes: number;
  maximumRecallCount: number;
  allowPriority: boolean;
  allowEmergencyOverride: boolean;
  publicDisplayEnabled: boolean;
  publicDisplayMode: QueuePublicDisplayMode;
  status: string;
}

export interface RegistrationQueueCounterOption {
  id: string;
  departmentId: string;
  clinicId: string | null;
  servicePointId: string | null;
  code: string;
  name: string;
  counterType: string;
  queueDefinitionIds: string[];
  status: string;
  activeUserId: string | null;
  activeProviderId: string | null;
  openedAt: string | null;
  closedAt: string | null;
}

export interface RegistrationQueueConfigurationResult {
  clinics: RegistrationQueueClinicOption[];
  servicePoints: RegistrationQueueServicePointOption[];
  queueDefinitions: RegistrationQueueDefinitionOption[];
  counters: RegistrationQueueCounterOption[];
}

export interface RegistrationQueueReadService {
  listRegistrations(
    facilityId: string,
    query: RegistrationListQuery,
  ): Promise<
    RegistrationQueuePageProjection<
      RegistrationQueueRegistrationProjection
    >
  >;

  listVisits(
    facilityId: string,
    query: OpdVisitListQuery,
  ): Promise<
    RegistrationQueuePageProjection<
      RegistrationQueueVisitProjection
    >
  >;

  listQueueEntries(
    facilityId: string,
    query: QueueEntryListQuery,
  ): Promise<
    RegistrationQueuePageProjection<
      RegistrationQueueEntryProjection
    >
  >;
}