import type {
  RadiologyAccessPolicyPort,
  RadiologyAuditPort,
  RadiologyCanonicalPatientPort,
  RadiologyClockPort,
  RadiologyOutboxPort,
  RadiologyRealtimePort,
  RadiologySequencePort,
  RadiologySnapshotCryptoPort,
  RadiologyTransactionManagerPort,
} from './radiology.ports.js';

import type {
  RadiologyImagingGatewayPort,
  RadiologyInventoryUsageBoundaryPort,
} from './radiology-operations.ports.js';

import type {
  RadiologyCriticalNotificationPort,
  RadiologyReportArtifactPort,
  RadiologyReportAttachmentPort,
  RadiologyReportRendererPort,
  RadiologyReportingStaffPort,
} from './radiology-reporting.contracts.js';

import {
  RadiologyClinicalIntegration,
} from './radiology-clinical.integration.js';

import {
  RadiologyCatalogRepository,
} from './repositories/radiology-catalog.repository.js';

import {
  RadiologyContextRepository,
} from './repositories/radiology-context.repository.js';

import {
  RadiologyOperationsRepository,
} from './repositories/radiology-operations.repository.js';

import {
  RadiologyOrderRepository,
} from './repositories/radiology-order.repository.js';

import {
  RadiologyReportRepository,
} from './repositories/radiology-report.repository.js';

import {
  RadiologyAccessPolicyService,
} from './services/radiology-access-policy.service.js';

import {
  type RadiologyChargeBridgePort,
  RadiologyCommandService,
} from './services/radiology-command.service.js';

import {
  RadiologyContextService,
} from './services/radiology-context.service.js';

import {
  RadiologyImagingOperationsService,
} from './services/radiology-imaging-operations.service.js';

import {
  RadiologyQueryService,
} from './services/radiology-query.service.js';

import {
  RadiologyReportRenderer,
} from './services/radiology-report.renderer.js';

import {
  RadiologyReportingService,
} from './services/radiology-reporting.service.js';

import {
  CreateRadiologyOrderWorkflow,
} from './workflows/create-radiology-order.workflow.js';

import {
  AcceptRadiologyOrderWorkflow,
  CancelRadiologyOrderWorkflow,
  RejectRadiologyOrderWorkflow,
} from './workflows/radiology-order-lifecycle.workflows.js';

import {
  ChangeRadiologyModalityStatusWorkflow,
  ChangeRadiologyProcedureStatusWorkflow,
  CreateRadiologyModalityWorkflow,
  CreateRadiologyProcedureWorkflow,
  UpdateRadiologyModalityWorkflow,
  UpdateRadiologyProcedureWorkflow,
} from './workflows/radiology-catalog.workflows.js';

export interface RadiologyApplicationDependencies {
  transactionManager:
    RadiologyTransactionManagerPort;

  audit:
    RadiologyAuditPort;

  outbox:
    RadiologyOutboxPort;

  realtime:
    RadiologyRealtimePort;

  clock:
    RadiologyClockPort;

  sequence:
    RadiologySequencePort;

  canonicalPatient:
    RadiologyCanonicalPatientPort;

  snapshotCrypto:
    RadiologySnapshotCryptoPort;

  charges:
    RadiologyChargeBridgePort;

  imagingGateway:
    RadiologyImagingGatewayPort;

  inventoryUsage:
    RadiologyInventoryUsageBoundaryPort;

  reportingStaff:
    RadiologyReportingStaffPort;

  reportAttachments:
    RadiologyReportAttachmentPort;

  criticalNotifications:
    RadiologyCriticalNotificationPort;

  reportArtifacts:
    RadiologyReportArtifactPort;

  reportRenderer?:
    RadiologyReportRendererPort;
}

export function createRadiologyApplication(
  dependencies:
    RadiologyApplicationDependencies,
) {
  const catalogRepository =
    new RadiologyCatalogRepository();

  const orderRepository =
    new RadiologyOrderRepository();

  const contextRepository =
    new RadiologyContextRepository();

  const operationsRepository =
    new RadiologyOperationsRepository();

  const reportRepository =
    new RadiologyReportRepository();

  const accessPolicy:
    RadiologyAccessPolicyPort =
      new RadiologyAccessPolicyService(
        contextRepository,
      );

  const contextService =
    new RadiologyContextService(
      contextRepository,
    );

  const commandSupport =
    new RadiologyCommandService(
      catalogRepository,
      orderRepository,
      contextService,
      accessPolicy,
      dependencies,
    );

  const imagingOperations =
    new RadiologyImagingOperationsService(
      commandSupport,
      operationsRepository,
      dependencies.imagingGateway,
      dependencies.inventoryUsage,
    );

  const reporting =
    new RadiologyReportingService(
      commandSupport,
      operationsRepository,
      reportRepository,
      dependencies.reportingStaff,
      dependencies.reportAttachments,
      dependencies.criticalNotifications,
      dependencies.reportRenderer ??
        new RadiologyReportRenderer(),
      dependencies.reportArtifacts,
    );

  const query =
    new RadiologyQueryService(
      commandSupport,
      reportRepository,
    );

  const clinicalIntegration =
    new RadiologyClinicalIntegration(
      reporting,
    );

  return {
    repositories: {
      catalog:
        catalogRepository,

      orders:
        orderRepository,

      context:
        contextRepository,

      operations:
        operationsRepository,

      reports:
        reportRepository,
    },

    services: {
      accessPolicy,

      context:
        contextService,

      commandSupport,

      query,

      imagingOperations,

      reporting,
    },

    clinicalIntegration,

    workflows: {
      createModality:
        new CreateRadiologyModalityWorkflow(
          commandSupport,
        ),

      updateModality:
        new UpdateRadiologyModalityWorkflow(
          commandSupport,
        ),

      changeModalityStatus:
        new ChangeRadiologyModalityStatusWorkflow(
          commandSupport,
        ),

      createProcedure:
        new CreateRadiologyProcedureWorkflow(
          commandSupport,
        ),

      updateProcedure:
        new UpdateRadiologyProcedureWorkflow(
          commandSupport,
        ),

      changeProcedureStatus:
        new ChangeRadiologyProcedureStatusWorkflow(
          commandSupport,
        ),

      createOrder:
        new CreateRadiologyOrderWorkflow(
          commandSupport,
        ),

      acceptOrder:
        new AcceptRadiologyOrderWorkflow(
          commandSupport,
        ),

      rejectOrder:
        new RejectRadiologyOrderWorkflow(
          commandSupport,
        ),

      cancelOrder:
        new CancelRadiologyOrderWorkflow(
          commandSupport,
        ),
    },
  };
}

export type RadiologyApplication =
  ReturnType<
    typeof createRadiologyApplication
  >;