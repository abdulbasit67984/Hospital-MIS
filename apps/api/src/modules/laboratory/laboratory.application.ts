import type {
  LaboratoryAuditPort,
  LaboratoryCanonicalPatientPort,
  LaboratoryClockPort,
  LaboratoryOutboxPort,
  LaboratoryRealtimePort,
  LaboratorySequencePort,
  LaboratorySnapshotCryptoPort,
  LaboratoryTransactionManagerPort,
} from './laboratory.ports.js';

import {
  LaboratoryCatalogRepository,
} from './repositories/laboratory-catalog.repository.js';

import {
  LaboratoryContextRepository,
} from './repositories/laboratory-context.repository.js';

import {
  LaboratoryOrderRepository,
} from './repositories/laboratory-order.repository.js';

import {
  LaboratoryResultRepository,
} from './repositories/laboratory-result.repository.js';

import {
  LaboratorySpecimenRepository,
} from './repositories/laboratory-specimen.repository.js';

import {
  LaboratoryAccessPolicyService,
} from './services/laboratory-access-policy.service.js';

import {
  LaboratoryCommandService,
  LaboratoryQueryService,
  type LaboratoryChargeBridgePort,
} from './services/laboratory-command.service.js';

import {
  LaboratoryContextService,
} from './services/laboratory-context.service.js';

import {
  LaboratoryReportRenderer,
} from './services/laboratory-report.renderer.js';

import {
  LaboratoryResultCommandService,
} from './services/laboratory-result-command.service.js';

import {
  LaboratoryResultQueryService,
} from './services/laboratory-result-query.service.js';

import {
  LaboratorySpecimenService,
} from './services/laboratory-specimen.service.js';

import {
  CreateLaboratoryOrderWorkflow,
} from './workflows/create-laboratory-order.workflow.js';

import {
  AcceptLaboratoryOrderWorkflow,
  CancelLaboratoryOrderWorkflow,
} from './workflows/laboratory-order-lifecycle.workflows.js';

import {
  ChangeLaboratoryCategoryStatusWorkflow,
  ChangeLaboratoryTestStatusWorkflow,
  CreateLaboratoryCategoryWorkflow,
  CreateLaboratoryTestWorkflow,
  UpdateLaboratoryCategoryWorkflow,
  UpdateLaboratoryTestWorkflow,
} from './workflows/laboratory-catalog.workflows.js';

export interface LaboratoryApplicationDependencies {
  transactionManager:
    LaboratoryTransactionManagerPort;

  audit:
    LaboratoryAuditPort;

  outbox:
    LaboratoryOutboxPort;

  realtime:
    LaboratoryRealtimePort;

  clock:
    LaboratoryClockPort;

  sequence:
    LaboratorySequencePort;

  canonicalPatient:
    LaboratoryCanonicalPatientPort;

  snapshotCrypto:
    LaboratorySnapshotCryptoPort;

  charges:
    LaboratoryChargeBridgePort;
}

export function createLaboratoryApplication(
  dependencies:
    LaboratoryApplicationDependencies,
) {
  const catalogRepository =
    new LaboratoryCatalogRepository();

  const orderRepository =
    new LaboratoryOrderRepository();

  const specimenRepository =
    new LaboratorySpecimenRepository();

  const resultRepository =
    new LaboratoryResultRepository();

  const contextRepository =
    new LaboratoryContextRepository();

  const accessPolicy =
    new LaboratoryAccessPolicyService(
      contextRepository,
    );

  const contextService =
    new LaboratoryContextService(
      contextRepository,
    );

  const commandSupport =
    new LaboratoryCommandService(
      catalogRepository,
      orderRepository,
      contextService,
      accessPolicy,
      dependencies,
    );

  const reportRenderer =
    new LaboratoryReportRenderer();

  const resultCommands =
    new LaboratoryResultCommandService(
      commandSupport,
      resultRepository,
      specimenRepository,
    );

  const resultQueries =
    new LaboratoryResultQueryService(
      commandSupport,
      resultRepository,
      reportRenderer,
    );

  return {
    repositories: {
      catalog:
        catalogRepository,

      orders:
        orderRepository,

      specimens:
        specimenRepository,

      results:
        resultRepository,

      context:
        contextRepository,
    },

    services: {
      accessPolicy,

      context:
        contextService,

      commandSupport,

      query:
        new LaboratoryQueryService(
          catalogRepository,
          orderRepository,
          accessPolicy,
          dependencies.audit,
          dependencies.clock,
        ),

      specimens:
        new LaboratorySpecimenService(
          commandSupport,
          specimenRepository,
        ),

      resultCommands,

      resultQueries,

      reportRenderer,
    },

    workflows: {
      createCategory:
        new CreateLaboratoryCategoryWorkflow(
          commandSupport,
        ),

      updateCategory:
        new UpdateLaboratoryCategoryWorkflow(
          commandSupport,
        ),

      changeCategoryStatus:
        new ChangeLaboratoryCategoryStatusWorkflow(
          commandSupport,
        ),

      createTest:
        new CreateLaboratoryTestWorkflow(
          commandSupport,
        ),

      updateTest:
        new UpdateLaboratoryTestWorkflow(
          commandSupport,
        ),

      changeTestStatus:
        new ChangeLaboratoryTestStatusWorkflow(
          commandSupport,
        ),

      createOrder:
        new CreateLaboratoryOrderWorkflow(
          commandSupport,
        ),

      acceptOrder:
        new AcceptLaboratoryOrderWorkflow(
          commandSupport,
        ),

      cancelOrder:
        new CancelLaboratoryOrderWorkflow(
          commandSupport,
        ),

      enterResult:
        resultCommands.enter.bind(
          resultCommands,
        ),

      validateResult:
        resultCommands.validate.bind(
          resultCommands,
        ),

      verifyResult:
        resultCommands.verify.bind(
          resultCommands,
        ),

      correctResult:
        resultCommands.correct.bind(
          resultCommands,
        ),

      changeResultPublication:
        resultCommands.changePublication.bind(
          resultCommands,
        ),

      recordCriticalResultCommunication:
        resultCommands.recordCriticalCommunication.bind(
          resultCommands,
        ),
    },
  };
}

export type LaboratoryApplication =
  ReturnType<
    typeof createLaboratoryApplication
  >;