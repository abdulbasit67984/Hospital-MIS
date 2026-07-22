import type { FilterQuery } from 'mongoose';

import {
  InvoiceFundAllocationModel,
  createObjectId,
  toObjectId,
} from '@hospital-mis/database';

import type { WelfareZakatListQuery } from '../welfare-zakat.contracts.js';
import type { AssistanceAllocationRepositoryPort } from '../welfare-zakat.ports.js';
import type {
  AssistanceAllocationRecord,
  WelfareZakatMongoSession,
} from '../welfare-zakat.persistence.types.js';
import { normalizeAssistancePagination } from '../welfare-zakat.normalization.js';
import {
  throwMappedWelfareZakatPersistenceError,
  welfareZakatDecimal,
  welfareZakatObjectId,
  welfareZakatRecord,
  welfareZakatSortDirection,
  withWelfareZakatSession,
} from './welfare-zakat-repository.support.js';

const allocationMoneyFields = new Set([
  'amount',
  'utilizedAmount',
  'reversedAmount',
  'refundedAmount',
  'repaidAmount',
  'recoveredAmount',
  'releasedAmount',
  'remainingAmount',
]);

function allocationFilter(
  facilityId: string,
  query: WelfareZakatListQuery,
): FilterQuery<unknown> {
  const filter: Record<string, unknown> = {
    facilityId: toObjectId(facilityId, 'facilityId'),
  };
  if (query.fundId != null) {
    filter.fundId = toObjectId(query.fundId, 'fundId');
  }
  if (query.patientId != null) {
    filter.patientId = toObjectId(query.patientId, 'patientId');
  }
  if (query.applicationId != null) {
    filter.applicationId = toObjectId(query.applicationId, 'applicationId');
  }
  if (query.approvalId != null) {
    filter.approvalId = toObjectId(query.approvalId, 'approvalId');
  }
  if (query.invoiceId != null) {
    filter.invoiceId = toObjectId(query.invoiceId, 'invoiceId');
  }
  if (query.allocationStatus != null && query.allocationStatus.length > 0) {
    filter.status = { $in: query.allocationStatus };
  }
  if (query.from != null || query.to != null) {
    filter.allocatedAt = {
      ...(query.from == null ? {} : { $gte: new Date(query.from) }),
      ...(query.to == null ? {} : { $lte: new Date(query.to) }),
    };
  }
  return filter;
}

function financialSet(values: Readonly<Record<string, string>>) {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([field]) => allocationMoneyFields.has(field))
      .map(([field, value]) => [field, welfareZakatDecimal(value)]),
  );
}

export class MongoAssistanceAllocationRepository
implements AssistanceAllocationRepositoryPort {
  public async create(
    input: Parameters<AssistanceAllocationRepositoryPort['create']>[0],
  ): Promise<AssistanceAllocationRecord> {
    try {
      const zero = welfareZakatDecimal('0.00');
      const status = input.input.reservationId == null
        ? 'APPROVAL_PENDING'
        : 'RESERVED';
      const [created] = await InvoiceFundAllocationModel.create(
        [{
          facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
          transactionId: input.transaction.transactionId,
          correlationId: input.actor.correlationId,
          schemaVersion: 1,
          version: 0,
          createdBy: toObjectId(input.actor.userId, 'createdBy'),
          updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
          operationKey: input.operationKey,
          duplicateKey: input.duplicateKey,
          allocationNumber: input.allocationNumber,
          fundId: toObjectId(input.input.fundId, 'fundId'),
          patientId: toObjectId(input.input.patientId, 'patientId'),
          applicationId: toObjectId(input.input.applicationId, 'applicationId'),
          approvalId: toObjectId(input.input.approvalId, 'approvalId'),
          reservationId: input.input.reservationId == null
            ? null
            : toObjectId(input.input.reservationId, 'reservationId'),
          patientAccountId: toObjectId(
            input.input.patientAccountId,
            'patientAccountId',
          ),
          invoiceId: toObjectId(input.input.invoiceId, 'invoiceId'),
          claimId: input.input.claimId == null
            ? null
            : toObjectId(input.input.claimId, 'claimId'),
          status,
          currency: 'PKR',
          amount: welfareZakatDecimal(input.authoritativeAmount),
          utilizedAmount: zero,
          reversedAmount: zero,
          refundedAmount: zero,
          repaidAmount: zero,
          recoveredAmount: zero,
          releasedAmount: zero,
          remainingAmount: welfareZakatDecimal(input.authoritativeAmount),
          priority: input.input.priority,
          reason: input.input.reason,
          supportingAttachmentIds: (input.input.supportingAttachmentIds ?? []).map(
            (id) => toObjectId(id, 'supportingAttachmentId'),
          ),
          lines: input.input.lines.map((line) => ({
            _id: createObjectId(),
            invoiceLineId: toObjectId(line.invoiceLineId, 'invoiceLineId'),
            amount: welfareZakatDecimal(line.amount),
            utilizedAmount: zero,
            reversedAmount: zero,
            refundedAmount: zero,
            repaidAmount: zero,
            recoveredAmount: zero,
            remainingAmount: welfareZakatDecimal(line.amount),
            reason: line.reason,
            supportingAttachmentIds: (line.supportingAttachmentIds ?? []).map(
              (id) => toObjectId(id, 'supportingAttachmentId'),
            ),
          })),
          allocatedBy: toObjectId(input.actor.userId, 'allocatedBy'),
          approvedBy: null,
          approvalRequestId: null,
          allocatedAt: input.allocatedAt,
          confirmedAt: null,
          utilizedAt: null,
          expiresAt: null,
          reversalStatus: null,
        }],
        { session: input.transaction.session },
      );
      return welfareZakatRecord<AssistanceAllocationRecord>(created!.toObject());
    } catch (error) {
      throwMappedWelfareZakatPersistenceError(error, 'ALLOCATION');
    }
  }

  public async findById(
    facilityId: string,
    allocationId: string,
    session?: WelfareZakatMongoSession,
  ): Promise<AssistanceAllocationRecord | null> {
    return welfareZakatRecord<AssistanceAllocationRecord | null>(
      await withWelfareZakatSession(
        InvoiceFundAllocationModel.findOne({
          _id: welfareZakatObjectId(allocationId, 'allocationId'),
          facilityId: welfareZakatObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async findDuplicate(
    facilityId: string,
    duplicateKey: string,
    session?: WelfareZakatMongoSession,
  ): Promise<AssistanceAllocationRecord | null> {
    return welfareZakatRecord<AssistanceAllocationRecord | null>(
      await withWelfareZakatSession(
        InvoiceFundAllocationModel.findOne({
          facilityId: welfareZakatObjectId(facilityId, 'facilityId'),
          duplicateKey,
          status: {
            $in: [
              'RESERVED',
              'APPROVAL_PENDING',
              'CONFIRMED',
              'PARTIALLY_UTILIZED',
              'UTILIZED',
              'PARTIALLY_REVERSED',
              'RECOVERY_PENDING',
            ],
          },
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async list(
    facilityId: string,
    query: WelfareZakatListQuery,
    session?: WelfareZakatMongoSession,
  ): Promise<Readonly<{ records: readonly AssistanceAllocationRecord[]; total: number }>> {
    const pagination = normalizeAssistancePagination(query);
    const filter = allocationFilter(facilityId, query);
    const sort = {
      allocatedAt: welfareZakatSortDirection(query.sortDirection),
      _id: -1 as const,
    };
    const [records, total] = await Promise.all([
      withWelfareZakatSession(
        InvoiceFundAllocationModel.find(filter)
          .sort(sort)
          .skip(pagination.skip)
          .limit(pagination.pageSize)
          .lean(),
        session,
      ).exec(),
      withWelfareZakatSession(
        InvoiceFundAllocationModel.countDocuments(filter),
        session,
      ).exec(),
    ]);
    return {
      records: welfareZakatRecord<readonly AssistanceAllocationRecord[]>(records),
      total: Number(total),
    };
  }

  public async transition(
    input: Parameters<AssistanceAllocationRepositoryPort['transition']>[0],
  ): Promise<AssistanceAllocationRecord | null> {
    const updated = await InvoiceFundAllocationModel.findOneAndUpdate(
      {
        _id: welfareZakatObjectId(input.allocationId, 'allocationId'),
        facilityId: welfareZakatObjectId(input.actor.facilityId, 'facilityId'),
        version: input.expectedVersion,
        status: input.fromStatus,
      },
      {
        $set: {
          status: input.toStatus,
          reason: input.reason,
          ...(input.approvedBy === undefined
            ? {}
            : {
                approvedBy: input.approvedBy == null
                  ? null
                  : toObjectId(input.approvedBy, 'approvedBy'),
              }),
          ...(input.approvalRequestId === undefined
            ? {}
            : {
                approvalRequestId: input.approvalRequestId == null
                  ? null
                  : toObjectId(input.approvalRequestId, 'approvalRequestId'),
              }),
          ...(input.toStatus === 'CONFIRMED'
            ? { confirmedAt: input.occurredAt }
            : {}),
          ...(input.toStatus === 'UTILIZED'
            ? { utilizedAt: input.occurredAt }
            : {}),
          ...(input.financialUpdates == null
            ? {}
            : financialSet(input.financialUpdates)),
          updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
          transactionId: input.transaction.transactionId,
          correlationId: input.actor.correlationId,
          updatedAt: input.occurredAt,
        },
        $inc: { version: 1 },
      },
      {
        session: input.transaction.session,
        returnDocument: 'after',
        runValidators: true,
      },
    ).lean().exec();
    return welfareZakatRecord<AssistanceAllocationRecord | null>(updated);
  }

  public async applyFinancialSummary(
    input: Parameters<AssistanceAllocationRepositoryPort['applyFinancialSummary']>[0],
  ): Promise<AssistanceAllocationRecord | null> {
    const set: Record<string, unknown> = {
      ...financialSet(input.amounts),
      status: input.status,
      updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
      transactionId: input.transaction.transactionId,
      correlationId: input.actor.correlationId,
      updatedAt: new Date(),
    };
    if (input.reversalStatus !== undefined) {
      set.reversalStatus = input.reversalStatus;
    }
    for (const [index, line] of (input.lineAmounts ?? []).entries()) {
      const alias = `allocationLine${index}`;
      for (const [field, value] of Object.entries(line.amounts)) {
        if (allocationMoneyFields.has(field)) {
          set[`lines.$[${alias}].${field}`] = welfareZakatDecimal(value);
        }
      }
    }
    const arrayFilters = (input.lineAmounts ?? []).map((line, index) => ({
      [`allocationLine${index}.invoiceLineId`]: toObjectId(
        line.invoiceLineId,
        'invoiceLineId',
      ),
    }));

    const updated = await InvoiceFundAllocationModel.findOneAndUpdate(
      {
        _id: welfareZakatObjectId(input.allocationId, 'allocationId'),
        facilityId: welfareZakatObjectId(input.actor.facilityId, 'facilityId'),
        version: input.expectedVersion,
      },
      {
        $set: set,
        $inc: { version: 1 },
      },
      {
        session: input.transaction.session,
        returnDocument: 'after',
        runValidators: true,
        ...(arrayFilters.length === 0 ? {} : { arrayFilters }),
      },
    ).lean().exec();
    return welfareZakatRecord<AssistanceAllocationRecord | null>(updated);
  }
}