import {
  PANELS_PACKAGE_COVERAGE_EVENTS,
  PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS,
} from '../panels-packages-coverage.constants.js';

import type {
  CreatePanelInput,
  PanelsPackagesCoverageActorContext,
} from '../panels-packages-coverage.contracts.js';

import {
  PpcDuplicateCodeError,
} from '../panels-packages-coverage.errors.js';

import type {
  DiagnosticPanelRepositoryPort,
  PpcAccessPolicyPort,
  PpcAuditPort,
  PpcClockPort,
  PpcOutboxPort,
  PpcReferenceDataPort,
  PpcTransactionManagerPort,
} from '../panels-packages-coverage.ports.js';

import {
  normalizePpcCode,
} from '../panels-packages-coverage.normalization.js';

export interface DiagnosticPanelServiceDependencies {
  repository: DiagnosticPanelRepositoryPort;
  referenceData: PpcReferenceDataPort;
  accessPolicy: PpcAccessPolicyPort;
  transactionManager: PpcTransactionManagerPort;
  audit: PpcAuditPort;
  outbox: PpcOutboxPort;
  clock: PpcClockPort;
}

export class DiagnosticPanelService {
  public constructor(
    private readonly dependencies: DiagnosticPanelServiceDependencies,
  ) {}

  public async create(
    actor: PanelsPackagesCoverageActorContext,
    idempotencyKey: string,
    input: CreatePanelInput & Readonly<{ priceListId: string }>,
  ) {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      permission:
        PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS.PANEL_MANAGE,
    });

    if (!decision.allowed) {
      throw new Error(decision.denialReason ?? 'Panel access denied');
    }

    if (
      !(await this.dependencies.referenceData.priceListExists(
        actor.facilityId,
        input.priceListId,
      ))
    ) {
      throw new Error('Price list was not found');
    }

    const itemIds = input.items.map((item) => item.chargeCatalogItemId);
    if (
      !(await this.dependencies.referenceData.chargeCatalogItemsExist(
        actor.facilityId,
        itemIds,
      ))
    ) {
      throw new Error('One or more panel charge items were not found');
    }

    return this.dependencies.transactionManager.execute({
      transactionType: 'CREATE_DIAGNOSTIC_PANEL',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `ppc:panel:${actor.facilityId}:${normalizePpcCode(input.code)}`,
      ],
      idempotencyPayload: input,
      journalPayload: { panelCode: normalizePpcCode(input.code) },
      execute: async (transaction) => {
        try {
          const panel = await this.dependencies.repository.create(
            actor,
            input,
            input.priceListId,
            transaction,
          );
          const items = await this.dependencies.repository.insertItems(
            actor,
            panel._id.toHexString(),
            input.items,
            transaction,
          );

          await this.dependencies.audit.record({
            actor,
            action: 'CREATE_DIAGNOSTIC_PANEL',
            entityType: 'DiagnosticPanel',
            entityId: panel._id.toHexString(),
            reason: input.changeReason,
            before: null,
            after: { panel, items },
            transactionId: transaction.transactionId,
            session: transaction.session,
          });

          await this.dependencies.outbox.enqueue({
            facilityId: actor.facilityId,
            eventType:
              PANELS_PACKAGE_COVERAGE_EVENTS.PANEL_CREATED,
            aggregateType: 'DiagnosticPanel',
            aggregateId: panel._id.toHexString(),
            payload: {
              panelId: panel._id.toHexString(),
              panelCode: panel.panelCode,
              status: panel.status,
            },
            correlationId: actor.correlationId,
            transactionId: transaction.transactionId,
            session: transaction.session,
          });

          return { panel, items };
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.includes('duplicate key')
          ) {
            throw new PpcDuplicateCodeError('Diagnostic panel');
          }
          throw error;
        }
      },
    });
  }
}