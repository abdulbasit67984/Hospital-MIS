import {
  DiagnosticPanelItemModel,
  DiagnosticPanelModel,
  decimal128,
  toObjectId,
} from '@hospital-mis/database';

import type {
  DiagnosticPanelRepositoryPort,
} from '../panels-packages-coverage.ports.js';

import type {
  DiagnosticPanelItemRecord,
  DiagnosticPanelRecord,
  PpcMongoSession,
} from '../panels-packages-coverage.persistence.types.js';

function record<T>(value: unknown): T {
  return value as T;
}

function withSession<T extends { session(session: PpcMongoSession): T }>(
  query: T,
  session?: PpcMongoSession,
): T {
  return session === undefined ? query : query.session(session);
}

export class DiagnosticPanelRepository
implements DiagnosticPanelRepositoryPort {
  public async create(
    actor: Parameters<DiagnosticPanelRepositoryPort['create']>[0],
    input: Parameters<DiagnosticPanelRepositoryPort['create']>[1],
    priceListId: string,
    transaction: Parameters<DiagnosticPanelRepositoryPort['create']>[3],
  ): Promise<DiagnosticPanelRecord> {
    const [created] = await DiagnosticPanelModel.create(
      [{
        facilityId: toObjectId(actor.facilityId, 'facilityId'),
        transactionId: transaction.transactionId,
        correlationId: actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: toObjectId(actor.userId, 'createdBy'),
        updatedBy: toObjectId(actor.userId, 'updatedBy'),
        panelCode: input.code,
        name: input.name,
        description: input.description ?? null,
        panelType: input.panelType,
        priceListId: toObjectId(priceListId, 'priceListId'),
        fixedPrice: decimal128(input.fixedPrice ?? '0'),
        currency: 'PKR',
        effectiveFrom: new Date(input.effectiveFrom),
        effectiveThrough:
          input.effectiveThrough === null
            ? null
            : new Date(input.effectiveThrough),
        status: 'DRAFT',
        currentVersion: 1,
      }],
      { session: transaction.session },
    );

    return record<DiagnosticPanelRecord>(created!.toObject());
  }

  public async insertItems(
    actor: Parameters<DiagnosticPanelRepositoryPort['insertItems']>[0],
    panelId: string,
    items: Parameters<DiagnosticPanelRepositoryPort['insertItems']>[2],
    transaction: Parameters<DiagnosticPanelRepositoryPort['insertItems']>[3],
  ): Promise<DiagnosticPanelItemRecord[]> {
    const created = await DiagnosticPanelItemModel.insertMany(
      items.map((item, index) => ({
        facilityId: toObjectId(actor.facilityId, 'facilityId'),
        transactionId: transaction.transactionId,
        correlationId: actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: toObjectId(actor.userId, 'createdBy'),
        updatedBy: toObjectId(actor.userId, 'updatedBy'),
        diagnosticPanelId: toObjectId(panelId, 'diagnosticPanelId'),
        lineNumber: index + 1,
        chargeCatalogItemId: toObjectId(
          item.chargeCatalogItemId,
          'chargeCatalogItemId',
        ),
        quantity: decimal128(item.quantity),
        requiredComponent: item.required,
        allocationAmount: decimal128('0'),
        active: true,
      })),
      { session: transaction.session, ordered: true },
    );

    return created.map((item) =>
      record<DiagnosticPanelItemRecord>(item.toObject()),
    );
  }

  public async findById(
    facilityId: string,
    panelId: string,
    session?: PpcMongoSession,
  ): Promise<DiagnosticPanelRecord | null> {
    return record<DiagnosticPanelRecord | null>(
      await withSession(
        DiagnosticPanelModel.findOne({
          _id: toObjectId(panelId, 'panelId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async listItems(
    facilityId: string,
    panelId: string,
    session?: PpcMongoSession,
  ): Promise<DiagnosticPanelItemRecord[]> {
    return record<DiagnosticPanelItemRecord[]>(
      await withSession(
        DiagnosticPanelItemModel.find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          diagnosticPanelId: toObjectId(panelId, 'panelId'),
          active: true,
        }).sort({ lineNumber: 1 }).lean(),
        session,
      ).exec(),
    );
  }

  public async updateStatus(
    facilityId: string,
    panelId: string,
    expectedVersion: number,
    update: Readonly<Record<string, unknown>>,
    transaction: Parameters<DiagnosticPanelRepositoryPort['updateStatus']>[4],
  ): Promise<DiagnosticPanelRecord | null> {
    return record<DiagnosticPanelRecord | null>(
      await DiagnosticPanelModel.findOneAndUpdate(
        {
          _id: toObjectId(panelId, 'panelId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: expectedVersion,
        },
        {
          $set: {
            ...update,
            transactionId: transaction.transactionId,
          },
          $inc: { version: 1 },
        },
        {
          new: true,
          runValidators: true,
          session: transaction.session,
        },
      ).lean().exec(),
    );
  }
}