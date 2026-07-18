import type {
  OpdVisitRecord,
  QueueStatusHistoryRecord,
  QueueTokenRecord,
  RegistrationRecord,
} from './registration-queue.types.js';

export interface RegisteredOpdVisitResult {
  registration: {
    id: string;
    registrationNumber: string;
    patientId: string;
    requestedPatientId: string;
    canonicalRedirected: boolean;
    registrationMode: RegistrationRecord['registrationMode'];
    registrationSource: RegistrationRecord['registrationSource'];
    visitType: RegistrationRecord['visitType'];
    status: RegistrationRecord['status'];
    serviceDate: string;
    arrivedAt: string;
    checkedInAt: string | null;
    departmentId: string;
    clinicId: string | null;
    servicePointId: string | null;
    assignedProviderId: string | null;
    version: number;
  };

  visit: {
    id: string;
    visitNumber: string;
    registrationId: string;
    patientId: string;
    status: OpdVisitRecord['status'];
    serviceDate: string;
    departmentId: string;
    clinicId: string | null;
    servicePointId: string | null;
    assignedProviderId: string | null;
    assignedCounterId: string | null;
    queueTokenId: string | null;
    arrivedAt: string;
    checkedInAt: string | null;
    queuedAt: string | null;
    version: number;
  };

  queue: {
    id: string;
    queueEntryId: string;
    queueDefinitionId: string;
    tokenNumber: number;
    tokenLabel: string;
    status: QueueTokenRecord['status'];
    priorityClass: QueueTokenRecord['priorityClass'];
    priorityScore: number;
    triagePriority: QueueTokenRecord['triagePriority'];
    emergencyOverride: boolean;
    specialCategories: QueueTokenRecord['specialCategories'];
    assignedProviderId: string | null;
    assignedCounterId: string | null;
    queuedAt: string;
    version: number;
    initialHistorySequence: number;
  } | null;
}

export function toRegisteredOpdVisitResult(
  input: Readonly<{
    registration: RegistrationRecord;
    visit: OpdVisitRecord;
    queueToken: QueueTokenRecord | null;
    queueHistory: QueueStatusHistoryRecord | null;
  }>,
): RegisteredOpdVisitResult {
  return {
    registration: {
      id:
        input.registration._id.toHexString(),

      registrationNumber:
        input.registration.registrationNumber,

      patientId:
        input.registration.patientId.toHexString(),

      requestedPatientId:
        input.registration.requestedPatientId.toHexString(),

      canonicalRedirected:
        input.registration.canonicalRedirected,

      registrationMode:
        input.registration.registrationMode,

      registrationSource:
        input.registration.registrationSource,

      visitType:
        input.registration.visitType,

      status:
        input.registration.status,

      serviceDate:
        input.registration.serviceDate,

      arrivedAt:
        input.registration.arrivedAt.toISOString(),

      checkedInAt:
        input.registration.checkedInAt
          ?.toISOString() ??
        null,

      departmentId:
        input.registration.departmentId.toHexString(),

      clinicId:
        input.registration.clinicId
          ?.toHexString() ??
        null,

      servicePointId:
        input.registration.servicePointId
          ?.toHexString() ??
        null,

      assignedProviderId:
        input.registration.assignedProviderId
          ?.toHexString() ??
        null,

      version:
        input.registration.version,
    },

    visit: {
      id:
        input.visit._id.toHexString(),

      visitNumber:
        input.visit.visitNumber,

      registrationId:
        input.visit.registrationId.toHexString(),

      patientId:
        input.visit.patientId.toHexString(),

      status:
        input.visit.status,

      serviceDate:
        input.visit.serviceDate,

      departmentId:
        input.visit.departmentId.toHexString(),

      clinicId:
        input.visit.clinicId
          ?.toHexString() ??
        null,

      servicePointId:
        input.visit.servicePointId
          ?.toHexString() ??
        null,

      assignedProviderId:
        input.visit.assignedProviderId
          ?.toHexString() ??
        null,

      assignedCounterId:
        input.visit.assignedCounterId
          ?.toHexString() ??
        null,

      queueTokenId:
        input.visit.currentQueueTokenId
          ?.toHexString() ??
        null,

      arrivedAt:
        input.visit.arrivedAt.toISOString(),

      checkedInAt:
        input.visit.checkedInAt
          ?.toISOString() ??
        null,

      queuedAt:
        input.visit.queuedAt
          ?.toISOString() ??
        null,

      version:
        input.visit.version,
    },

    queue:
      input.queueToken === null
        ? null
        : {
            id:
              input.queueToken._id.toHexString(),

            queueEntryId:
              input.queueToken.queueEntryId,

            queueDefinitionId:
              input.queueToken.queueDefinitionId.toHexString(),

            tokenNumber:
              input.queueToken.tokenNumber,

            tokenLabel:
              input.queueToken.tokenLabel,

            status:
              input.queueToken.status,

            priorityClass:
              input.queueToken.priorityClass,

            priorityScore:
              input.queueToken.priorityScore,

            triagePriority:
              input.queueToken.triagePriority,

            emergencyOverride:
              input.queueToken.emergencyOverride,

            specialCategories: [
              ...input.queueToken.specialCategories,
            ],

            assignedProviderId:
              input.queueToken.assignedProviderId
                ?.toHexString() ??
              null,

            assignedCounterId:
              input.queueToken.assignedCounterId
                ?.toHexString() ??
              null,

            queuedAt:
              input.queueToken.queuedAt.toISOString(),

            version:
              input.queueToken.version,

            initialHistorySequence:
              input.queueHistory?.sequence ??
              1,
          },
  };
}