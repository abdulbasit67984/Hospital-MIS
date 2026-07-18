import type {
  OpdVisitRecord,
  QueueTokenRecord,
  RegistrationRecord,
} from './registration-queue.types.js';

export const REGISTRATION_STANDARD_SELECT = [
  '_id',
  'facilityId',
  'registrationNumber',
  'patientId',
  'requestedPatientId',
  'canonicalRedirected',
  'registrationMode',
  'registrationSource',
  'visitType',
  'status',
  'serviceDate',
  'arrivedAt',
  'checkedInAt',
  'appointmentId',
  'referralId',
  'referralReference',
  'emergencyCaseId',
  'departmentId',
  'clinicId',
  'servicePointId',
  'assignedProviderId',
  'cancelledAt',
  'cancelledBy',
  'supersedesRegistrationId',
  'supersededByRegistrationId',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

export const REGISTRATION_INTERNAL_SELECT = [
  REGISTRATION_STANDARD_SELECT,
  '+registrationNotes',
  '+cancellationReason',
  '+correctionReason',
].join(' ');

export const OPD_VISIT_STANDARD_SELECT = [
  '_id',
  'facilityId',
  'visitNumber',
  'registrationId',
  'patientId',
  'requestedPatientId',
  'canonicalRedirected',
  'serviceDate',
  'visitType',
  'registrationSource',
  'status',
  'departmentId',
  'clinicId',
  'servicePointId',
  'assignedProviderId',
  'assignedCounterId',
  'currentQueueTokenId',
  'arrivedAt',
  'checkedInAt',
  'queuedAt',
  'serviceStartedAt',
  'completedAt',
  'cancelledAt',
  'cancelledBy',
  'noShowAt',
  'noShowMarkedBy',
  'supersedesVisitId',
  'supersededByVisitId',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

export const OPD_VISIT_INTERNAL_SELECT = [
  OPD_VISIT_STANDARD_SELECT,
  '+activeVisitKey',
  '+cancellationReason',
  '+correctionReason',
].join(' ');

export const QUEUE_TOKEN_STANDARD_SELECT = [
  '_id',
  'facilityId',
  'queueEntryId',
  'registrationId',
  'opdVisitId',
  'patientId',
  'queueDefinitionId',
  'serviceDate',
  'tokenNumber',
  'tokenPrefix',
  'tokenLabel',
  'status',
  'priorityClass',
  'priorityScore',
  'triagePriority',
  'emergencyOverride',
  'specialCategories',
  'assignedProviderId',
  'assignedCounterId',
  'queuedAt',
  'calledAt',
  'servingAt',
  'skippedAt',
  'transferredAt',
  'completedAt',
  'cancelledAt',
  'noShowAt',
  'skipCount',
  'recallCount',
  'transferCount',
  'estimatedWaitMinutes',
  'estimatedServiceAt',
  'transferredFromQueueTokenId',
  'transferredToQueueTokenId',
  'transferReason',
  'lastStatusChangedAt',
  'lastStatusChangedBy',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

export const QUEUE_TOKEN_INTERNAL_SELECT = [
  QUEUE_TOKEN_STANDARD_SELECT,
  '+activeEntryKey',
  '+emergencyOverrideReason',
  '+statusReason',
].join(' ');

export const QUEUE_PUBLIC_DISPLAY_SELECT = [
  'queueEntryId',
  'queueDefinitionId',
  'tokenLabel',
  'status',
  'assignedCounterId',
  'calledAt',
  'servingAt',
  'lastStatusChangedAt',
].join(' ');

export function registrationAuditSnapshot(
  record: RegistrationRecord,
): Record<string, unknown> {
  return {
    registrationId:
      record._id.toHexString(),

    registrationNumber:
      record.registrationNumber,

    patientId:
      record.patientId.toHexString(),

    requestedPatientId:
      record.requestedPatientId.toHexString(),

    canonicalRedirected:
      record.canonicalRedirected,

    registrationMode:
      record.registrationMode,

    registrationSource:
      record.registrationSource,

    visitType:
      record.visitType,

    status:
      record.status,

    serviceDate:
      record.serviceDate,

    arrivedAt:
      record.arrivedAt.toISOString(),

    checkedInAt:
      record.checkedInAt
        ?.toISOString() ??
      null,

    departmentId:
      record.departmentId.toHexString(),

    clinicId:
      record.clinicId
        ?.toHexString() ??
      null,

    servicePointId:
      record.servicePointId
        ?.toHexString() ??
      null,

    assignedProviderId:
      record.assignedProviderId
        ?.toHexString() ??
      null,

    version:
      record.version,
  };
}

export function opdVisitAuditSnapshot(
  record: OpdVisitRecord,
): Record<string, unknown> {
  return {
    visitId:
      record._id.toHexString(),

    visitNumber:
      record.visitNumber,

    registrationId:
      record.registrationId.toHexString(),

    patientId:
      record.patientId.toHexString(),

    requestedPatientId:
      record.requestedPatientId.toHexString(),

    canonicalRedirected:
      record.canonicalRedirected,

    serviceDate:
      record.serviceDate,

    visitType:
      record.visitType,

    registrationSource:
      record.registrationSource,

    status:
      record.status,

    departmentId:
      record.departmentId.toHexString(),

    clinicId:
      record.clinicId
        ?.toHexString() ??
      null,

    servicePointId:
      record.servicePointId
        ?.toHexString() ??
      null,

    assignedProviderId:
      record.assignedProviderId
        ?.toHexString() ??
      null,

    assignedCounterId:
      record.assignedCounterId
        ?.toHexString() ??
      null,

    currentQueueTokenId:
      record.currentQueueTokenId
        ?.toHexString() ??
      null,

    arrivedAt:
      record.arrivedAt.toISOString(),

    checkedInAt:
      record.checkedInAt
        ?.toISOString() ??
      null,

    queuedAt:
      record.queuedAt
        ?.toISOString() ??
      null,

    serviceStartedAt:
      record.serviceStartedAt
        ?.toISOString() ??
      null,

    completedAt:
      record.completedAt
        ?.toISOString() ??
      null,

    version:
      record.version,
  };
}

export function queueTokenAuditSnapshot(
  record: QueueTokenRecord,
): Record<string, unknown> {
  return {
    queueTokenId:
      record._id.toHexString(),

    queueEntryId:
      record.queueEntryId,

    registrationId:
      record.registrationId.toHexString(),

    opdVisitId:
      record.opdVisitId.toHexString(),

    patientId:
      record.patientId.toHexString(),

    queueDefinitionId:
      record.queueDefinitionId.toHexString(),

    serviceDate:
      record.serviceDate,

    tokenNumber:
      record.tokenNumber,

    tokenLabel:
      record.tokenLabel,

    status:
      record.status,

    priorityClass:
      record.priorityClass,

    priorityScore:
      record.priorityScore,

    triagePriority:
      record.triagePriority,

    emergencyOverride:
      record.emergencyOverride,

    specialCategories: [
      ...record.specialCategories,
    ],

    assignedProviderId:
      record.assignedProviderId
        ?.toHexString() ??
      null,

    assignedCounterId:
      record.assignedCounterId
        ?.toHexString() ??
      null,

    queuedAt:
      record.queuedAt.toISOString(),

    calledAt:
      record.calledAt
        ?.toISOString() ??
      null,

    servingAt:
      record.servingAt
        ?.toISOString() ??
      null,

    completedAt:
      record.completedAt
        ?.toISOString() ??
      null,

    skipCount:
      record.skipCount,

    recallCount:
      record.recallCount,

    transferCount:
      record.transferCount,

    version:
      record.version,
  };
}