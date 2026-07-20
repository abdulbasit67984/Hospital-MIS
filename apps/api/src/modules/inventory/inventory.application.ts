import {
  InventoryCatalogRepository,
} from './repositories/inventory-catalog.repository.js';

import {
  InventoryContextRepository,
} from './repositories/inventory-context.repository.js';

import {
  InventoryStockQueryRepository,
} from './repositories/inventory-stock-query.repository.js';

import {
  InventoryProcurementRepository,
} from './repositories/inventory-procurement.repository.js';

import {
  InventoryStockOperationsRepository,
} from './repositories/inventory-stock-operations.repository.js';

import {
  InventoryControlRepository,
} from './repositories/inventory-control.repository.js';

import {
  InventoryMonitoringRepository,
} from './repositories/inventory-monitoring.repository.js';

import {
  InventoryAccessPolicyService,
} from './services/inventory-access-policy.service.js';

import {
  InventoryContextService,
} from './services/inventory-context.service.js';

import {
  InventoryUnitConversionService,
} from './services/inventory-unit-conversion.service.js';

import {
  InventoryCatalogService,
} from './services/inventory-catalog.service.js';

import {
  InventoryQueryService,
} from './services/inventory-query.service.js';

import {
  InventoryProcurementService,
} from './services/inventory-procurement.service.js';

import {
  InventoryFefoAllocationService,
  InventoryStockPostingService,
} from './services/inventory-stock-posting.service.js';

import {
  InventoryStockOperationsService,
} from './services/inventory-stock-operations.service.js';

import {
  InventoryControlService,
} from './services/inventory-control.service.js';

import type {
  InventoryProcurementApprovalLimitPort,
  InventoryProcurementAttachmentPort,
  InventoryProcurementAuditPort,
  InventoryProcurementOutboxPort,
  InventoryProcurementRealtimePort,
  InventoryProcurementSequencePort,
  InventoryProcurementTransactionManagerPort,
} from './inventory-procurement.ports.js';

import type {
  InventoryClockPort,
} from './inventory.ports.js';

export interface InventoryApplicationRuntimeDependencies {
  transactionManager: InventoryProcurementTransactionManagerPort;
  audit: InventoryProcurementAuditPort;
  outbox: InventoryProcurementOutboxPort;
  realtime: InventoryProcurementRealtimePort;
  sequence: InventoryProcurementSequencePort;
  approvalLimits: InventoryProcurementApprovalLimitPort;
  attachments: InventoryProcurementAttachmentPort;
  clock: InventoryClockPort;
}

export function createInventoryApplication(
  runtime: InventoryApplicationRuntimeDependencies,
) {
  const contextRepository =
    new InventoryContextRepository();
  const catalogRepository =
    new InventoryCatalogRepository();
  const stockQueryRepository =
    new InventoryStockQueryRepository();
  const procurementRepository =
    new InventoryProcurementRepository();
  const stockOperationsRepository =
    new InventoryStockOperationsRepository();
  const controlRepository =
    new InventoryControlRepository();
  const monitoringRepository =
    new InventoryMonitoringRepository();

  const context = new InventoryContextService(
    contextRepository,
  );
  const accessPolicy =
    new InventoryAccessPolicyService(
      contextRepository,
    );
  const unitConversion =
    new InventoryUnitConversionService();
  const stockPosting =
    new InventoryStockPostingService(
      stockOperationsRepository,
      catalogRepository,
    );
  const allocation =
    new InventoryFefoAllocationService(
      catalogRepository,
      stockQueryRepository,
    );

  const shared = {
    catalog: catalogRepository,
    context,
    accessPolicy,
    transactionManager: runtime.transactionManager,
    audit: runtime.audit,
    outbox: runtime.outbox,
    realtime: runtime.realtime,
    sequence: runtime.sequence,
    clock: runtime.clock,
  };

  const query = new InventoryQueryService(
    accessPolicy,
    context,
  );

  const catalog = new InventoryCatalogService({
    ...shared,
    stockQueries: stockQueryRepository,
    unitConversion,
  });

  const procurement = new InventoryProcurementService({
    ...shared,
    unitConversion,
    repository: procurementRepository,
    approvalLimits: runtime.approvalLimits,
    attachments: runtime.attachments,
    stockPosting,
  });

  const stock = new InventoryStockOperationsService({
    ...shared,
    stockQueries: stockQueryRepository,
    repository: stockOperationsRepository,
    stockPosting,
    allocation,
  });

  const controls = new InventoryControlService({
    ...shared,
    repository: controlRepository,
    monitoring: monitoringRepository,
    stockPosting,
    attachments: runtime.attachments,
  });

  return {
    repositories: {
      context: contextRepository,
      catalog: catalogRepository,
      stockQueries: stockQueryRepository,
      procurement: procurementRepository,
      stockOperations: stockOperationsRepository,
      controls: controlRepository,
      monitoring: monitoringRepository,
    },
    services: {
      context,
      accessPolicy,
      unitConversion,
      catalog,
      procurement,
      stockPosting,
      allocation,
      stock,
      controls,
      query,
    },
    integrations: {
      dispensing: stock,
      receiptStockPosting: stockPosting,
    },
  };
}

export type InventoryApplication = ReturnType<
  typeof createInventoryApplication
>;