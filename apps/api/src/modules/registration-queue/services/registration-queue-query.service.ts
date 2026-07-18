import {
  OpdVisitNotFoundError,
  QueueEntryNotFoundError,
  RegistrationNotFoundError,
} from '../registration-queue.errors.js';

import type {
  QueueStatusHistoryRecord,
  QueueTokenRecord,
  RegistrationRecord,
  OpdVisitRecord,
  RegistrationListQuery,
  OpdVisitListQuery,
  QueueEntryListQuery,
} from '../registration-queue.types.js';

import type {
  QueueDashboardQuery,
  QueueDashboardResult,
  RegistrationQueueBundleResult,
  RegistrationQueueConfigurationQuery,
  RegistrationQueueConfigurationResult,
  RegistrationQueueCounterOption,
  RegistrationQueueDefinitionOption,
  RegistrationQueueEntryBundleResult,
  RegistrationQueueEntryProjection,
  RegistrationQueueHistoryProjection,
  RegistrationQueuePageProjection,
  RegistrationQueueRegistrationProjection,
  RegistrationQueueServicePointOption,
  RegistrationQueueClinicOption,
  RegistrationQueueVisitBundleResult,
  RegistrationQueueVisitProjection,
} from '../registration-queue.query.types.js';

import type {
  OpdVisitRepository,
} from '../repositories/opd-visit.repository.js';

import type {
  QueueStatusHistoryRepository,
} from '../repositories/queue-status-history.repository.js';

import type {
  QueueTokenRepository,
} from '../repositories/queue-token.repository.js';

import type {
  RegistrationQueueReadRepository,
  QueueReadMetadata,
} from '../repositories/registration-queue-read.repository.js';

import type {
  RegistrationRepository,
} from '../repositories/registration.repository.js';

import {
  QueueWaitEstimateService,
} from './queue-wait-estimate.service.js';

function objectIdString(
  value: {
    toHexString(): string;
  } | null,
): string | null {
  return value?.toHexString() ??
    null;
}

function dateString(
  value: Date | null,
): string | null {
  return value?.toISOString() ??
    null;
}

function registrationProjection(
  record: RegistrationRecord,
): RegistrationQueueRegistrationProjection {
  return {
    id:
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
      dateString(
        record.checkedInAt,
      ),

    appointmentId:
      objectIdString(
        record.appointmentId,
      ),

    referralId:
      objectIdString(
        record.referralId,
      ),

    emergencyCaseId:
      objectIdString(
        record.emergencyCaseId,
      ),

    departmentId:
      record.departmentId.toHexString(),

    clinicId:
      objectIdString(
        record.clinicId,
      ),

    servicePointId:
      objectIdString(
        record.servicePointId,
      ),

    assignedProviderId:
      objectIdString(
        record.assignedProviderId,
      ),

    cancelledAt:
      dateString(
        record.cancelledAt,
      ),

    version:
      record.version,

    createdAt:
      record.createdAt.toISOString(),

    updatedAt:
      record.updatedAt.toISOString(),
  };
}

function visitProjection(
  record: OpdVisitRecord,
): RegistrationQueueVisitProjection {
  return {
    id:
      record._id.toHexString(),

    visitNumber:
      record.visitNumber,

    registrationId:
      record.registrationId.toHexString(),

    patientId:
      record.patientId.toHexString(),

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
      objectIdString(
        record.clinicId,
      ),

    servicePointId:
      objectIdString(
        record.servicePointId,
      ),

    assignedProviderId:
      objectIdString(
        record.assignedProviderId,
      ),

    assignedCounterId:
      objectIdString(
        record.assignedCounterId,
      ),

    currentQueueTokenId:
      objectIdString(
        record.currentQueueTokenId,
      ),

    arrivedAt:
      record.arrivedAt.toISOString(),

    checkedInAt:
      dateString(
        record.checkedInAt,
      ),

    queuedAt:
      dateString(
        record.queuedAt,
      ),

    serviceStartedAt:
      dateString(
        record.serviceStartedAt,
      ),

    completedAt:
      dateString(
        record.completedAt,
      ),

    cancelledAt:
      dateString(
        record.cancelledAt,
      ),

    noShowAt:
      dateString(
        record.noShowAt,
      ),

    version:
      record.version,

    createdAt:
      record.createdAt.toISOString(),

    updatedAt:
      record.updatedAt.toISOString(),
  };
}

function queueProjection(
  record: QueueTokenRecord,
  metadata: QueueReadMetadata,
  position:
    | {
        position: number;
        patientsAhead: number;
        estimatedWaitMinutes: number;
        estimatedServiceAt: string | null;
      }
    | undefined,
): RegistrationQueueEntryProjection {
  const queueDefinition =
    metadata.queueDefinitions.get(
      record.queueDefinitionId.toHexString(),
    );

  const counterId =
    objectIdString(
      record.assignedCounterId,
    );

  const providerId =
    objectIdString(
      record.assignedProviderId,
    );

  const counter =
    counterId === null
      ? undefined
      : metadata.counters.get(
          counterId,
        );

  const provider =
    providerId === null
      ? undefined
      : metadata.providers.get(
          providerId,
        );

  return {
    id:
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

    queueCode:
      queueDefinition?.code ??
      null,

    queueName:
      queueDefinition?.name ??
      null,

    queueDisplayLabel:
      queueDefinition
        ?.displayLabel ??
      null,

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
      providerId,

    assignedProviderName:
      provider?.displayName ??
      null,

    assignedCounterId:
      counterId,

    assignedCounterCode:
      counter?.code ??
      null,

    assignedCounterName:
      counter?.name ??
      null,

    queuedAt:
      record.queuedAt.toISOString(),

    calledAt:
      dateString(
        record.calledAt,
      ),

    servingAt:
      dateString(
        record.servingAt,
      ),

    skippedAt:
      dateString(
        record.skippedAt,
      ),

    transferredAt:
      dateString(
        record.transferredAt,
      ),

    completedAt:
      dateString(
        record.completedAt,
      ),

    cancelledAt:
      dateString(
        record.cancelledAt,
      ),

    noShowAt:
      dateString(
        record.noShowAt,
      ),

    skipCount:
      record.skipCount,

    recallCount:
      record.recallCount,

    transferCount:
      record.transferCount,

    position:
      position?.position ??
      null,

    patientsAhead:
      position?.patientsAhead ??
      null,

    estimatedWaitMinutes:
      position
        ?.estimatedWaitMinutes ??
      record.estimatedWaitMinutes,

    estimatedServiceAt:
      position
        ?.estimatedServiceAt ??
      dateString(
        record.estimatedServiceAt,
      ),

    lastStatusChangedAt:
      record.lastStatusChangedAt.toISOString(),

    version:
      record.version,
  };
}

function historyProjection(
  record: QueueStatusHistoryRecord,
  includeReason: boolean,
): RegistrationQueueHistoryProjection {
  return {
    id:
      record._id.toHexString(),

    sequence:
      record.sequence,

    fromStatus:
      record.fromStatus,

    toStatus:
      record.toStatus,

    queueDefinitionId:
      record.queueDefinitionId.toHexString(),

    destinationQueueDefinitionId:
      objectIdString(
        record.destinationQueueDefinitionId,
      ),

    providerId:
      objectIdString(
        record.providerId,
      ),

    destinationProviderId:
      objectIdString(
        record.destinationProviderId,
      ),

    counterId:
      objectIdString(
        record.counterId,
      ),

    destinationCounterId:
      objectIdString(
        record.destinationCounterId,
      ),

    changeSource:
      record.changeSource,

    transferReason:
      record.transferReason,

    ...(includeReason
      ? {
          reason:
            record.reason,
        }
      : {}),

    occurredAt:
      record.occurredAt.toISOString(),

    changedBy:
      record.changedBy.toHexString(),
  };
}

export class RegistrationQueueQueryService {
  public constructor(
    private readonly registrations:
      RegistrationRepository,

    private readonly visits:
      OpdVisitRepository,

    private readonly queueTokens:
      QueueTokenRepository,

    private readonly queueHistory:
      QueueStatusHistoryRepository,

    private readonly readRepository:
      RegistrationQueueReadRepository,

    private readonly waits:
      QueueWaitEstimateService,

    private readonly clock: {
      now(): Date;
    } = {
      now(): Date {
        return new Date();
      },
    },
  ) {}

  public async listRegistrations(
    facilityId: string,
    query: RegistrationListQuery,
  ): Promise<
    RegistrationQueuePageProjection<
      RegistrationQueueRegistrationProjection
    >
  > {
    const result =
      await this.registrations.list(
        facilityId,
        query,
      );

    return {
      ...result,

      items:
        result.items.map(
          registrationProjection,
        ),
    };
  }

  public async listVisits(
    facilityId: string,
    query: OpdVisitListQuery,
  ): Promise<
    RegistrationQueuePageProjection<
      RegistrationQueueVisitProjection
    >
  > {
    const result =
      await this.visits.list(
        facilityId,
        query,
      );

    return {
      ...result,

      items:
        result.items.map(
          visitProjection,
        ),
    };
  }

  public async listQueueEntries(
    facilityId: string,
    query: QueueEntryListQuery,
  ): Promise<
    RegistrationQueuePageProjection<
      RegistrationQueueEntryProjection
    >
  > {
    const result =
      await this.queueTokens.list(
        facilityId,
        query,
      );

    const metadata =
      await this.readRepository
        .loadMetadata(
          facilityId,
          result.items,
        );

    const positions =
      this.waits
        .positionsForOrderedEntries({
          entries:
            result.items,

          definitions:
            metadata.queueDefinitions,

          now:
            this.clock.now(),
        });

    return {
      ...result,

      items:
        result.items.map(
          (entry) =>
            queueProjection(
              entry,
              metadata,
              positions.get(
                entry.queueEntryId,
              ),
            ),
        ),
    };
  }

  public async getRegistrationById(
    facilityId: string,
    registrationId: string,
    includeHistoryReason = false,
  ): Promise<RegistrationQueueBundleResult> {
    const registration =
      await this.registrations.findById(
        facilityId,
        registrationId,
        false,
      );

    if (registration === null) {
      throw new RegistrationNotFoundError();
    }

    return this.registrationBundle(
      facilityId,
      registration,
      includeHistoryReason,
    );
  }

  public async getRegistrationByNumber(
    facilityId: string,
    registrationNumber: string,
    includeHistoryReason = false,
  ): Promise<RegistrationQueueBundleResult> {
    const registration =
      await this.registrations.findByNumber(
        facilityId,
        registrationNumber,
        false,
      );

    if (registration === null) {
      throw new RegistrationNotFoundError();
    }

    return this.registrationBundle(
      facilityId,
      registration,
      includeHistoryReason,
    );
  }

  public async getVisitById(
    facilityId: string,
    visitId: string,
    includeHistoryReason = false,
  ): Promise<RegistrationQueueVisitBundleResult> {
    const visit =
      await this.visits.findById(
        facilityId,
        visitId,
        false,
      );

    if (visit === null) {
      throw new OpdVisitNotFoundError();
    }

    return this.visitBundle(
      facilityId,
      visit,
      includeHistoryReason,
    );
  }

  public async getVisitByNumber(
    facilityId: string,
    visitNumber: string,
    includeHistoryReason = false,
  ): Promise<RegistrationQueueVisitBundleResult> {
    const visit =
      await this.visits.findByNumber(
        facilityId,
        visitNumber,
        false,
      );

    if (visit === null) {
      throw new OpdVisitNotFoundError();
    }

    return this.visitBundle(
      facilityId,
      visit,
      includeHistoryReason,
    );
  }

  public async getQueueEntry(
    facilityId: string,
    queueEntryId: string,
    includeHistoryReason = false,
  ): Promise<RegistrationQueueEntryBundleResult> {
    const queue =
      await this.queueTokens.findByEntryId(
        facilityId,
        queueEntryId,
        false,
      );

    if (queue === null) {
      throw new QueueEntryNotFoundError();
    }

    const [
      visit,
      registration,
      history,
      metadata,
    ] =
      await Promise.all([
        this.visits.findById(
          facilityId,
          queue.opdVisitId.toHexString(),
          false,
        ),

        this.registrations.findById(
          facilityId,
          queue.registrationId.toHexString(),
          false,
        ),

        this.queueHistory.listForQueueEntry(
          facilityId,
          queue._id.toHexString(),
          includeHistoryReason,
        ),

        this.readRepository.loadMetadata(
          facilityId,
          [
            queue,
          ],
        ),
      ]);

    const positions =
      this.waits
        .positionsForOrderedEntries({
          entries: [
            queue,
          ],

          definitions:
            metadata.queueDefinitions,

          now:
            this.clock.now(),
        });

    return {
      registration:
        registration === null
          ? null
          : registrationProjection(
              registration,
            ),

      visit:
        visit === null
          ? null
          : visitProjection(
              visit,
            ),

      queue:
        queueProjection(
          queue,
          metadata,
          positions.get(
            queue.queueEntryId,
          ),
        ),

      history:
        history.map(
          (item) =>
            historyProjection(
              item,
              includeHistoryReason,
            ),
        ),
    };
  }

  public async dashboard(
    facilityId: string,
    query: QueueDashboardQuery,
  ): Promise<QueueDashboardResult> {
    const entries =
      await this.readRepository
        .listDashboardEntries(
          facilityId,
          query,
        );

    const metadata =
      await this.readRepository
        .loadMetadata(
          facilityId,
          entries,
        );

    const now =
      this.clock.now();

    const positions =
      this.waits
        .positionsForOrderedEntries({
          entries,

          definitions:
            metadata.queueDefinitions,

          now,
        });

    const metrics =
      this.waits
        .operationalMetrics({
          serviceDate:
            query.serviceDate,

          entries,

          now,
        });

    const statusCounts =
      [
        'WAITING',
        'CALLED',
        'SERVING',
        'SKIPPED',
        'TRANSFERRED',
        'COMPLETED',
        'CANCELLED',
        'NO_SHOW',
      ].map(
        (status) => ({
          status:
            status as QueueTokenRecord['status'],

          count:
            entries.filter(
              (entry) =>
                entry.status ===
                status,
            ).length,
        }),
      );

    return {
      generatedAt:
        now.toISOString(),

      query,

      metrics,

      statusCounts,

      entries:
        entries.map(
          (entry) =>
            queueProjection(
              entry,
              metadata,
              positions.get(
                entry.queueEntryId,
              ),
            ),
        ),
    };
  }

  public async configuration(
    facilityId: string,
    query: RegistrationQueueConfigurationQuery,
  ): Promise<RegistrationQueueConfigurationResult> {
    const records =
      await this.readRepository
        .listConfiguration(
          facilityId,
          query,
        );

    const clinics:
      RegistrationQueueClinicOption[] =
      records.clinics.map(
        (item) => ({
          id:
            item._id.toHexString(),

          departmentId:
            item.departmentId.toHexString(),

          code:
            item.code,

          name:
            item.name,

          location:
            item.location,

          defaultProviderId:
            objectIdString(
              item.defaultProviderId,
            ),

          status:
            item.status,
        }),
      );

    const servicePoints:
      RegistrationQueueServicePointOption[] =
      records.servicePoints.map(
        (item) => ({
          id:
            item._id.toHexString(),

          departmentId:
            item.departmentId.toHexString(),

          clinicId:
            objectIdString(
              item.clinicId,
            ),

          code:
            item.code,

          name:
            item.name,

          servicePointType:
            item.servicePointType,

          location:
            item.location,

          defaultProviderId:
            objectIdString(
              item.defaultProviderId,
            ),

          allowsWalkIn:
            item.allowsWalkIn,

          allowsAppointment:
            item.allowsAppointment,

          allowsReferral:
            item.allowsReferral,

          allowsEmergency:
            item.allowsEmergency,

          status:
            item.status,
        }),
      );

    const queueDefinitions:
      RegistrationQueueDefinitionOption[] =
      records.queueDefinitions.map(
        (item) => ({
          id:
            item._id.toHexString(),

          departmentId:
            item.departmentId.toHexString(),

          clinicId:
            objectIdString(
              item.clinicId,
            ),

          servicePointId:
            objectIdString(
              item.servicePointId,
            ),

          providerId:
            objectIdString(
              item.providerId,
            ),

          code:
            item.code,

          name:
            item.name,

          displayLabel:
            item.displayLabel,

          tokenPrefix:
            item.tokenPrefix,

          estimatedServiceMinutes:
            item.estimatedServiceMinutes,

          maximumRecallCount:
            item.maximumRecallCount,

          allowPriority:
            item.allowPriority,

          allowEmergencyOverride:
            item.allowEmergencyOverride,

          publicDisplayEnabled:
            item.publicDisplayEnabled,

          publicDisplayMode:
            item.publicDisplayMode,

          status:
            item.status,
        }),
      );

    const counters:
      RegistrationQueueCounterOption[] =
      records.counters.map(
        (item) => ({
          id:
            item._id.toHexString(),

          departmentId:
            item.departmentId.toHexString(),

          clinicId:
            objectIdString(
              item.clinicId,
            ),

          servicePointId:
            objectIdString(
              item.servicePointId,
            ),

          code:
            item.code,

          name:
            item.name,

          counterType:
            item.counterType,

          queueDefinitionIds:
            item.queueDefinitionIds.map(
              (queueId) =>
                queueId.toHexString(),
            ),

          status:
            item.status,

          activeUserId:
            objectIdString(
              item.activeUserId,
            ),

          activeProviderId:
            objectIdString(
              item.activeProviderId,
            ),

          openedAt:
            dateString(
              item.openedAt,
            ),

          closedAt:
            dateString(
              item.closedAt,
            ),
        }),
      );

    return {
      clinics,
      servicePoints,
      queueDefinitions,
      counters,
    };
  }

  private async registrationBundle(
    facilityId: string,
    registration: RegistrationRecord,
    includeHistoryReason: boolean,
  ): Promise<RegistrationQueueBundleResult> {
    const visit =
      await this.visits.findByRegistrationId(
        facilityId,
        registration._id.toHexString(),
        false,
      );

    const queue =
      visit === null
        ? null
        : await this.queueTokens.findActiveByVisitId(
            facilityId,
            visit._id.toHexString(),
          );

    const history =
      queue === null
        ? []
        : await this.queueHistory.listForQueueEntry(
            facilityId,
            queue._id.toHexString(),
            includeHistoryReason,
          );

    const metadata =
      await this.readRepository
        .loadMetadata(
          facilityId,
          queue === null
            ? []
            : [
                queue,
              ],
        );

    const positions =
      this.waits
        .positionsForOrderedEntries({
          entries:
            queue === null
              ? []
              : [
                  queue,
                ],

          definitions:
            metadata.queueDefinitions,

          now:
            this.clock.now(),
        });

    return {
      registration:
        registrationProjection(
          registration,
        ),

      visit:
        visit === null
          ? null
          : visitProjection(
              visit,
            ),

      queue:
        queue === null
          ? null
          : queueProjection(
              queue,
              metadata,
              positions.get(
                queue.queueEntryId,
              ),
            ),

      history:
        history.map(
          (item) =>
            historyProjection(
              item,
              includeHistoryReason,
            ),
        ),
    };
  }

  private async visitBundle(
    facilityId: string,
    visit: OpdVisitRecord,
    includeHistoryReason: boolean,
  ): Promise<RegistrationQueueVisitBundleResult> {
    const [
      registration,
      queue,
    ] =
      await Promise.all([
        this.registrations.findById(
          facilityId,
          visit.registrationId.toHexString(),
          false,
        ),

        this.queueTokens.findActiveByVisitId(
          facilityId,
          visit._id.toHexString(),
        ),
      ]);

    const history =
      queue === null
        ? []
        : await this.queueHistory.listForQueueEntry(
            facilityId,
            queue._id.toHexString(),
            includeHistoryReason,
          );

    const metadata =
      await this.readRepository
        .loadMetadata(
          facilityId,
          queue === null
            ? []
            : [
                queue,
              ],
        );

    const positions =
      this.waits
        .positionsForOrderedEntries({
          entries:
            queue === null
              ? []
              : [
                  queue,
                ],

          definitions:
            metadata.queueDefinitions,

          now:
            this.clock.now(),
        });

    return {
      registration:
        registration === null
          ? null
          : registrationProjection(
              registration,
            ),

      visit:
        visitProjection(
          visit,
        ),

      queue:
        queue === null
          ? null
          : queueProjection(
              queue,
              metadata,
              positions.get(
                queue.queueEntryId,
              ),
            ),

      history:
        history.map(
          (item) =>
            historyProjection(
              item,
              includeHistoryReason,
            ),
        ),
    };
  }
}