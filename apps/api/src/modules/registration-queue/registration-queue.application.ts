import type {
  RegistrationQueueAuditPort,
  RegistrationQueueClockPort,
  RegistrationQueueOutboxPort,
  RegistrationQueueRealtimePort,
  RegistrationQueueSnapshotCryptoPort,
  RegistrationQueueTransactionManagerPort,
} from './registration-queue.ports.js';

import {
  OpdVisitLifecycleRepository,
} from './repositories/opd-visit-lifecycle.repository.js';

import {
  OpdVisitQueueMutationRepository,
} from './repositories/opd-visit-queue-mutation.repository.js';

import {
  OpdVisitRepository,
} from './repositories/opd-visit.repository.js';

import {
  QueueStatusHistoryRepository,
} from './repositories/queue-status-history.repository.js';

import {
  QueueTokenMutationRepository,
} from './repositories/queue-token-mutation.repository.js';

import {
  QueueTokenRepository,
} from './repositories/queue-token.repository.js';

import {
  QueueTransferRepository,
} from './repositories/queue-transfer.repository.js';

import {
  RegistrationContextRepository,
} from './repositories/registration-context.repository.js';

import {
  RegistrationQueueReadRepository,
} from './repositories/registration-queue-read.repository.js';

import {
  RegistrationRepository,
} from './repositories/registration.repository.js';

import {
  QueueMutationContextService,
} from './services/queue-mutation-context.service.js';

import {
  QueuePublicDisplayService,
} from './services/queue-public-display.service.js';

import {
  QueueWaitEstimateService,
} from './services/queue-wait-estimate.service.js';

import {
  RegistrationContextService,
} from './services/registration-context.service.js';

import {
  RegistrationPatientResolutionService,
} from './services/registration-patient-resolution.service.js';

import {
  RegistrationQueueNumberService,
} from './services/registration-queue-number.service.js';

import {
  RegistrationQueueQueryService,
} from './services/registration-queue-query.service.js';

import {
  CancelOpdVisitWorkflow,
} from './workflows/cancel-opd-visit.workflow.js';

import {
  CancelRegistrationWorkflow,
} from './workflows/cancel-registration.workflow.js';

import {
  ChangeQueueStatusWorkflow,
} from './workflows/change-queue-status.workflow.js';

import {
  CorrectOpdVisitWorkflow,
} from './workflows/correct-opd-visit.workflow.js';

import {
  MarkOpdVisitNoShowWorkflow,
} from './workflows/mark-opd-visit-no-show.workflow.js';

import {
  RegisterOpdVisitWorkflow,
} from './workflows/register-opd-visit.workflow.js';

import {
  TransferQueueEntryWorkflow,
} from './workflows/transfer-queue-entry.workflow.js';

import {
  UpdateQueueAssignmentWorkflow,
} from './workflows/update-queue-assignment.workflow.js';

import {
  UpdateQueuePriorityWorkflow,
} from './workflows/update-queue-priority.workflow.js';

export interface CreateRegistrationQueueApplicationOptions {
  transactionManager:
    RegistrationQueueTransactionManagerPort;

  audit:
    RegistrationQueueAuditPort;

  outbox:
    RegistrationQueueOutboxPort;

  realtime:
    RegistrationQueueRealtimePort;

  clock:
    RegistrationQueueClockPort;

  snapshotCrypto:
    RegistrationQueueSnapshotCryptoPort;

  numbers:
    RegistrationQueueNumberService;
}

export function createRegistrationQueueApplication(
  options:
    CreateRegistrationQueueApplicationOptions,
) {
  const registrationRepository =
    new RegistrationRepository();

  const visitRepository =
    new OpdVisitRepository();

  const queueTokenRepository =
    new QueueTokenRepository();

  const queueStatusHistoryRepository =
    new QueueStatusHistoryRepository();

  const registrationContextRepository =
    new RegistrationContextRepository();

  const queueTokenMutationRepository =
    new QueueTokenMutationRepository();

  const visitQueueMutationRepository =
    new OpdVisitQueueMutationRepository();

  const visitLifecycleRepository =
    new OpdVisitLifecycleRepository();

  const queueTransferRepository =
    new QueueTransferRepository();

  const readRepository =
    new RegistrationQueueReadRepository();

  const patientResolution =
    new RegistrationPatientResolutionService();

  const registrationContexts =
    new RegistrationContextService(
      registrationContextRepository,
    );

  const queueMutationContexts =
    new QueueMutationContextService(
      registrationContextRepository,
    );

  const waits =
    new QueueWaitEstimateService();

  const queryService =
    new RegistrationQueueQueryService(
      registrationRepository,
      visitRepository,
      queueTokenRepository,
      queueStatusHistoryRepository,
      readRepository,
      waits,
      options.clock,
    );

  const publicDisplayService =
    new QueuePublicDisplayService(
      readRepository,
      options.clock,
    );

  const mutationDependencies = {
    transactionManager:
      options.transactionManager,

    audit:
      options.audit,

    outbox:
      options.outbox,

    realtime:
      options.realtime,

    clock:
      options.clock,

    snapshotCrypto:
      options.snapshotCrypto,
  };

  const registerOpdVisit =
    new RegisterOpdVisitWorkflow(
      registrationRepository,
      visitRepository,
      queueTokenRepository,
      queueStatusHistoryRepository,
      patientResolution,
      registrationContexts,
      options.numbers,
      mutationDependencies,
    );

  const cancelRegistration =
    new CancelRegistrationWorkflow(
      registrationRepository,
      visitRepository,
      mutationDependencies,
    );

  const cancelOpdVisit =
    new CancelOpdVisitWorkflow(
      registrationRepository,
      visitRepository,
      visitLifecycleRepository,
      queueTokenRepository,
      queueTokenMutationRepository,
      queueStatusHistoryRepository,
      mutationDependencies,
    );

  const markOpdVisitNoShow =
    new MarkOpdVisitNoShowWorkflow(
      visitRepository,
      visitLifecycleRepository,
      queueTokenRepository,
      queueTokenMutationRepository,
      queueStatusHistoryRepository,
      mutationDependencies,
    );

  const correctOpdVisit =
    new CorrectOpdVisitWorkflow(
      registrationRepository,
      visitRepository,
      queueTokenRepository,
      queueTokenMutationRepository,
      queueStatusHistoryRepository,
      patientResolution,
      registrationContexts,
      options.numbers,
      mutationDependencies,
    );

  const changeQueueStatus =
    new ChangeQueueStatusWorkflow(
      queueTokenRepository,
      queueTokenMutationRepository,
      visitRepository,
      visitQueueMutationRepository,
      queueStatusHistoryRepository,
      queueMutationContexts,
      mutationDependencies,
    );

  const updateQueueAssignment =
    new UpdateQueueAssignmentWorkflow(
      queueTokenRepository,
      queueTokenMutationRepository,
      visitRepository,
      visitQueueMutationRepository,
      queueMutationContexts,
      mutationDependencies,
    );

  const updateQueuePriority =
    new UpdateQueuePriorityWorkflow(
      queueTokenRepository,
      queueTokenMutationRepository,
      queueMutationContexts,
      mutationDependencies,
    );

  const transferQueueEntry =
    new TransferQueueEntryWorkflow(
      queueTokenRepository,
      queueTransferRepository,
      visitRepository,
      visitLifecycleRepository,
      queueStatusHistoryRepository,
      queueMutationContexts,
      options.numbers,
      mutationDependencies,
    );

  return {
    repositories: {
      registrationRepository,
      visitRepository,
      queueTokenRepository,
      queueStatusHistoryRepository,
      registrationContextRepository,
      queueTokenMutationRepository,
      visitQueueMutationRepository,
      visitLifecycleRepository,
      queueTransferRepository,
      readRepository,
    },

    services: {
      patientResolution,
      registrationContexts,
      queueMutationContexts,
      waits,
      queryService,
      publicDisplayService,
      numbers:
        options.numbers,
    },

    workflows: {
      registerOpdVisit,
      cancelRegistration,
      cancelOpdVisit,
      markOpdVisitNoShow,
      correctOpdVisit,
      changeQueueStatus,
      updateQueueAssignment,
      updateQueuePriority,
      transferQueueEntry,
    },
  };
}

export type RegistrationQueueApplication =
  ReturnType<
    typeof createRegistrationQueueApplication
  >;