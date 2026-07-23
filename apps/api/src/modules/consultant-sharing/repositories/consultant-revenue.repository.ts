import Decimal from 'decimal.js';
import type { FilterQuery } from 'mongoose';

import {
  ConsultantCalculationRunModel,
  ConsultantRevenueEntryModel,
  ConsultantRevenueParticipantModel,
} from '@hospital-mis/database';

import type {
  ConsultantRevenueEntryView,
  ConsultantSharingListQuery,
} from '../consultant-sharing.contracts.js';
import type {
  ConsultantCalculationRunRepositoryPort,
  ConsultantRevenueEntryRepositoryPort,
} from '../consultant-sharing.ports.js';
import { stableConsultantSharingPayloadHash } from '../consultant-sharing.normalization.js';
import { projectConsultantRevenueEntry } from '../consultant-sharing.projections.js';
import {
  consultantSharingDecimal,
  consultantSharingMongoSession,
  consultantSharingObjectId,
  consultantSharingSortDirection,
  nullableConsultantSharingObjectId,
  throwMappedConsultantSharingPersistenceError,
  withConsultantSharingSession,
} from './consultant-sharing-repository.support.js';

function revenueFilter(
  facilityId: string,
  query: ConsultantSharingListQuery,
): FilterQuery<unknown> {
  const filter: Record<string, unknown> = {
    facilityId: consultantSharingObjectId(facilityId, 'facilityId'),
  };
  if (query.consultantId != null) filter.consultantId = consultantSharingObjectId(query.consultantId, 'consultantId');
  if (query.departmentId != null) filter.departmentId = consultantSharingObjectId(query.departmentId, 'departmentId');
  if (query.serviceId != null) filter.serviceId = consultantSharingObjectId(query.serviceId, 'serviceId');
  if (query.agreementId != null) filter.agreementId = consultantSharingObjectId(query.agreementId, 'agreementId');
  if (query.payerOrganizationId != null) filter.payerOrganizationId = consultantSharingObjectId(query.payerOrganizationId, 'payerOrganizationId');
  if (query.panelProgramId != null) filter.panelProgramId = consultantSharingObjectId(query.panelProgramId, 'panelProgramId');
  if (query.packageId != null) filter.packageId = consultantSharingObjectId(query.packageId, 'packageId');
  if (query.claimId != null) filter.claimId = consultantSharingObjectId(query.claimId, 'claimId');
  if (query.status != null && query.status.length > 0) filter.status = { $in: query.status };
  if (query.from != null || query.to != null) {
    filter.occurredAt = {
      ...(query.from == null ? {} : { $gte: new Date(query.from) }),
      ...(query.to == null ? {} : { $lte: new Date(query.to) }),
    };
  }
  return filter;
}

export class MongoConsultantCalculationRunRepository
  implements ConsultantCalculationRunRepositoryPort {
  public async start(
    input: Parameters<ConsultantCalculationRunRepositoryPort['start']>[0],
  ): Promise<string> {
    try {
      const [run] = await ConsultantCalculationRunModel.create(
        [{
          facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
          transactionId: input.transaction.transactionId,
          correlationId: input.actor.correlationId,
          schemaVersion: 1,
          version: 0,
          createdBy: consultantSharingObjectId(input.actor.userId, 'createdBy'),
          updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
          operationKey: input.operationKey,
          runType: input.runType,
          status: 'RUNNING',
          sourceFinancialEventId: input.sourceFinancialEventId,
          sourceFinancialEventType: input.sourceFinancialEventType,
          sourceModule: input.sourceModule,
          sourceRecordId: consultantSharingObjectId(input.sourceRecordId, 'sourceRecordId'),
          invoiceLineId: consultantSharingObjectId(input.invoiceLineId, 'invoiceLineId'),
          consultantId: consultantSharingObjectId(input.consultantId, 'consultantId'),
          requestedBy: consultantSharingObjectId(input.actor.userId, 'requestedBy'),
          requestedAt: input.startedAt,
          startedAt: input.startedAt,
          completedAt: null,
          failedAt: null,
          attemptCount: 1,
          maxAttempts: 10,
          nextAttemptAt: null,
          leaseOwner: `consultant-sharing:${input.operationKey}`.slice(0, 240),
          leaseExpiresAt: new Date(input.startedAt.getTime() + 5 * 60_000),
          processedEntryCount: 0,
          createdEntryCount: 0,
          adjustedEntryCount: 0,
          skippedEntryCount: 0,
          failedEntryCount: 0,
          inputHash: input.inputHash,
          outputCalculationHash: null,
          previousCalculationHash: null,
          errorCode: null,
          errorMessageSanitized: null,
          deadLetterReason: null,
          recoveryOfRunId: null,
        }],
        { session: consultantSharingMongoSession(input.transaction) },
      );
      return run._id.toHexString();
    } catch (error) {
      throwMappedConsultantSharingPersistenceError(error);
    }
  }

  public async complete(
    input: Parameters<ConsultantCalculationRunRepositoryPort['complete']>[0],
  ): Promise<void> {
    await ConsultantCalculationRunModel.updateOne(
      {
        _id: consultantSharingObjectId(input.runId, 'runId'),
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        status: 'RUNNING',
      },
      {
        $set: {
          status: 'COMPLETED',
          outputCalculationHash: input.resultHash,
          completedAt: input.completedAt,
          failedAt: null,
          nextAttemptAt: null,
          errorCode: null,
          errorMessageSanitized: null,
          deadLetterReason: null,
          updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
        },
        $unset: { leaseOwner: '', leaseExpiresAt: '' },
        $inc: { version: 1 },
      },
      { session: consultantSharingMongoSession(input.transaction), runValidators: true },
    ).exec();
  }

  public async fail(
    input: Parameters<ConsultantCalculationRunRepositoryPort['fail']>[0],
  ): Promise<void> {
    await ConsultantCalculationRunModel.updateOne(
      {
        _id: consultantSharingObjectId(input.runId, 'runId'),
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        status: 'RUNNING',
      },
      {
        $set: {
          status: input.deadLetter ? 'DEAD_LETTERED' : 'FAILED',
          errorCode: input.errorCode,
          errorMessageSanitized: input.errorMessage,
          nextAttemptAt: input.retryAt,
          failedAt: input.failedAt,
          completedAt: input.failedAt,
          deadLetterReason: input.deadLetter
            ? 'Automatic calculation recovery attempts were exhausted'
            : null,
          updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
        },
        $unset: { leaseOwner: '', leaseExpiresAt: '' },
        $inc: { version: 1 },
      },
      { session: consultantSharingMongoSession(input.transaction), runValidators: true },
    ).exec();
  }
}

export class MongoConsultantRevenueEntryRepository
  implements ConsultantRevenueEntryRepositoryPort {
  public async findById(
    input: Parameters<ConsultantRevenueEntryRepositoryPort['findById']>[0],
  ): Promise<ConsultantRevenueEntryView | null> {
    const query = ConsultantRevenueEntryModel.findOne({
      _id: consultantSharingObjectId(input.revenueEntryId, 'revenueEntryId'),
      facilityId: consultantSharingObjectId(input.facilityId, 'facilityId'),
    }).lean();
    const record = await withConsultantSharingSession(
      query,
      consultantSharingMongoSession(input.transaction),
    ).exec();
    return record == null ? null : projectConsultantRevenueEntry(record as never);
  }

  public async findByCalculationKey(
    input: Parameters<ConsultantRevenueEntryRepositoryPort['findByCalculationKey']>[0],
  ): Promise<ConsultantRevenueEntryView | null> {
    const query = ConsultantRevenueEntryModel.findOne({
      facilityId: consultantSharingObjectId(input.facilityId, 'facilityId'),
      calculationHash: input.calculationKey,
    }).lean();
    const record = await withConsultantSharingSession(
      query,
      consultantSharingMongoSession(input.transaction),
    ).exec();
    return record == null ? null : projectConsultantRevenueEntry(record as never);
  }

  public async append(
    input: Parameters<ConsultantRevenueEntryRepositoryPort['append']>[0],
  ): Promise<ConsultantRevenueEntryView> {
    const trace = input.trace;
    const activity = input.activity;
    const session = consultantSharingMongoSession(input.transaction);
    try {
      const [created] = await ConsultantRevenueEntryModel.create(
        [{
          facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
          transactionId: input.transaction.transactionId,
          correlationId: input.actor.correlationId,
          schemaVersion: 1,
          version: 0,
          createdBy: consultantSharingObjectId(input.actor.userId, 'createdBy'),
          updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
          operationKey: input.operationKey,
          calculationRunId: consultantSharingObjectId(input.calculationRunId, 'calculationRunId'),
          consultantId: consultantSharingObjectId(trace.consultantId, 'consultantId'),
          consultantStaffId: nullableConsultantSharingObjectId(input.consultantStaffId, 'consultantStaffId'),
          consultantGroupId: nullableConsultantSharingObjectId(input.consultantGroupId, 'consultantGroupId'),
          agreementId: consultantSharingObjectId(trace.agreementId, 'agreementId'),
          agreementVersion: trace.agreementVersion,
          agreementRuleId: consultantSharingObjectId(trace.agreementRuleId, 'agreementRuleId'),
          ruleVersion: trace.ruleVersion,
          patientId: consultantSharingObjectId(trace.patientId, 'patientId'),
          encounterId: nullableConsultantSharingObjectId(trace.encounterId, 'encounterId'),
          admissionId: nullableConsultantSharingObjectId(trace.admissionId, 'admissionId'),
          invoiceId: consultantSharingObjectId(trace.invoiceId, 'invoiceId'),
          invoiceLineId: consultantSharingObjectId(trace.invoiceLineId, 'invoiceLineId'),
          paymentAllocationId: nullableConsultantSharingObjectId(activity.paymentAllocationId, 'paymentAllocationId'),
          refundId: nullableConsultantSharingObjectId(activity.refundId, 'refundId'),
          creditNoteId: nullableConsultantSharingObjectId(activity.creditNoteId, 'creditNoteId'),
          debitNoteId: nullableConsultantSharingObjectId(activity.debitNoteId, 'debitNoteId'),
          claimId: nullableConsultantSharingObjectId(trace.claimId, 'claimId'),
          packageId: nullableConsultantSharingObjectId(trace.packageId, 'packageId'),
          payerOrganizationId: nullableConsultantSharingObjectId(trace.payerOrganizationId, 'payerOrganizationId'),
          panelProgramId: nullableConsultantSharingObjectId(trace.panelProgramId, 'panelProgramId'),
          departmentId: nullableConsultantSharingObjectId(trace.departmentId, 'departmentId'),
          serviceId: nullableConsultantSharingObjectId(trace.serviceId, 'serviceId'),
          serviceCategory: activity.serviceCategory,
          chargeCatalogItemId: consultantSharingObjectId(activity.chargeCatalogItemId, 'chargeCatalogItemId'),
          procedureId: nullableConsultantSharingObjectId(trace.procedureId, 'procedureId'),
          sourceFinancialEventId: activity.sourceFinancialEventId,
          sourceFinancialEventType: activity.sourceFinancialEventType,
          sourceLedgerEntryId: nullableConsultantSharingObjectId(trace.sourceLedgerEntryId, 'sourceLedgerEntryId'),
          sourceModule: activity.sourceModule,
          sourceRecordId: consultantSharingObjectId(activity.sourceRecordId, 'sourceRecordId'),
          direction: input.direction,
          entryType: input.entryType,
          status: input.status,
          recognitionBasis: trace.recognition.recognitionBasis,
          calculationMethod: trace.shares.calculationMethod,
          currency: activity.currency,
          grossAmount: consultantSharingDecimal(activity.grossAmount),
          discountAmount: consultantSharingDecimal(activity.discountAmount),
          welfareZakatAmount: consultantSharingDecimal(activity.welfareZakatAmount),
          panelSponsorAmount: consultantSharingDecimal(activity.sponsorResponsibilityAmount),
          patientAmount: consultantSharingDecimal(activity.patientResponsibilityAmount),
          packageAmount: consultantSharingDecimal(activity.packageResponsibilityAmount),
          refundAmount: consultantSharingDecimal(activity.refundAmount),
          creditNoteAmount: consultantSharingDecimal(activity.creditNoteAmount),
          debitNoteAmount: consultantSharingDecimal(activity.debitNoteAmount),
          writeOffAmount: consultantSharingDecimal(activity.writeOffAmount),
          claimAdjustmentAmount: consultantSharingDecimal(activity.claimAdjustmentAmount),
          nonShareableAmount: consultantSharingDecimal(activity.nonShareableAmount),
          costDeductionAmount: consultantSharingDecimal(activity.costDeductionAmount),
          consumableDeductionAmount: consultantSharingDecimal(activity.consumableDeductionAmount),
          otherEligibilityDeductionAmount: consultantSharingDecimal(activity.otherApprovedDeductionAmount),
          eligibleRevenueBeforeRecognition: consultantSharingDecimal(trace.recognition.eligibleRevenueBeforeRecognition),
          recognitionRatio: consultantSharingDecimal(
            new Decimal(trace.recognition.recognitionRatio).div(100).toFixed(6),
          ),
          eligibleRevenue: consultantSharingDecimal(trace.recognition.recognizedEligibleRevenue),
          pendingEligibleRevenue: consultantSharingDecimal(trace.recognition.pendingEligibleRevenue),
          percentage: trace.shares.percentage == null ? null : consultantSharingDecimal(trace.shares.percentage),
          fixedAmount: trace.shares.fixedAmount == null ? null : consultantSharingDecimal(trace.shares.fixedAmount),
          selectedTierCode: trace.shares.selectedTierCode,
          consultantShare: consultantSharingDecimal(trace.shares.consultantShare),
          hospitalShare: consultantSharingDecimal(trace.shares.hospitalShare),
          otherParticipantShare: consultantSharingDecimal(input.otherParticipantShare),
          taxWithholdingAmount: consultantSharingDecimal(input.taxWithholdingAmount),
          deductionAmount: consultantSharingDecimal(input.deductionAmount),
          netPayableAmount: consultantSharingDecimal(input.netPayableAmount),
          settledAmount: consultantSharingDecimal('0.00'),
          outstandingAmount: consultantSharingDecimal(input.netPayableAmount),
          settlementId: null,
          inputHash: trace.inputHash,
          calculationHash: input.calculationKey,
          immutableHash: stableConsultantSharingPayloadHash({ trace, activity, entryType: input.entryType }),
          matchReason: trace.matchReason,
          calculationTrace: trace,
          calculatedBy: trace.calculatedBy === 'SYSTEM'
            ? 'SYSTEM'
            : consultantSharingObjectId(trace.calculatedBy, 'calculatedBy'),
          calculatedAt: new Date(trace.calculatedAt),
          occurredAt: input.occurredAt,
          postedAt: input.status === 'POSTED' ? input.occurredAt : null,
          heldAt: null,
          heldBy: null,
          holdReason: null,
          reversalOfEntryId: nullableConsultantSharingObjectId(input.reversalOfEntryId, 'reversalOfEntryId'),
          reversedByEntryId: null,
          adjustmentOfEntryId: nullableConsultantSharingObjectId(input.adjustmentOfEntryId, 'adjustmentOfEntryId'),
          supersedesEntryId: null,
        }],
        { session },
      );

      if (trace.shares.participantShares.length > 0) {
        await ConsultantRevenueParticipantModel.insertMany(
          trace.shares.participantShares.map((participant) => ({
            facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
            transactionId: input.transaction.transactionId,
            correlationId: input.actor.correlationId,
            schemaVersion: 1,
            version: 0,
            createdBy: consultantSharingObjectId(input.actor.userId, 'createdBy'),
            updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
            revenueEntryId: created._id,
            consultantId: consultantSharingObjectId(trace.consultantId, 'consultantId'),
            participantId: consultantSharingObjectId(participant.participantId, 'participantId'),
            participantRole: participant.participantRole,
            customRoleCode: participant.customRoleCode,
            allocationMethod: participant.allocationMethod,
            percentage: participant.percentage == null ? null : consultantSharingDecimal(participant.percentage),
            fixedAmount: participant.fixedAmount == null ? null : consultantSharingDecimal(participant.fixedAmount),
            shareAmount: consultantSharingDecimal(participant.shareAmount),
            priority: participant.priority,
            residual: participant.residual,
            duplicateKey: stableConsultantSharingPayloadHash({
              revenueEntryId: created._id.toHexString(),
              participantId: participant.participantId,
              role: participant.participantRole,
            }),
            immutableHash: stableConsultantSharingPayloadHash(participant),
          })),
          { session },
        );
      }

      return projectConsultantRevenueEntry(created.toObject() as never);
    } catch (error) {
      throwMappedConsultantSharingPersistenceError(error);
    }
  }

  public async list(
    input: Parameters<ConsultantRevenueEntryRepositoryPort['list']>[0],
  ) {
    const page = Math.max(1, Math.trunc(input.query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(input.query.pageSize ?? 25)));
    const filter = revenueFilter(input.facilityId, input.query);
    const sortField = input.query.sortBy ?? 'occurredAt';
    const [records, totalItems] = await Promise.all([
      ConsultantRevenueEntryModel.find(filter)
        .sort({ [sortField]: consultantSharingSortDirection(input.query.sortDirection), _id: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
        .exec(),
      ConsultantRevenueEntryModel.countDocuments(filter).exec(),
    ]);
    return {
      items: records.map((record) => projectConsultantRevenueEntry(record as never)),
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    };
  }

  public async markStatus(
    input: Parameters<ConsultantRevenueEntryRepositoryPort['markStatus']>[0],
  ): Promise<ConsultantRevenueEntryView | null> {
    const record = await ConsultantRevenueEntryModel.findOneAndUpdate(
      {
        _id: consultantSharingObjectId(input.revenueEntryId, 'revenueEntryId'),
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        version: input.expectedVersion,
        status: input.fromStatus,
      },
      {
        $set: {
          status: input.toStatus,
          updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
          ...(input.toStatus === 'HELD'
            ? {
                heldAt: input.occurredAt,
                heldBy: consultantSharingObjectId(input.actor.userId, 'heldBy'),
                holdReason: input.reason,
              }
            : {}),
        },
        $inc: { version: 1 },
      },
      {
        new: true,
        runValidators: true,
        session: consultantSharingMongoSession(input.transaction),
      },
    ).lean().exec();
    return record == null ? null : projectConsultantRevenueEntry(record as never);
  }
}