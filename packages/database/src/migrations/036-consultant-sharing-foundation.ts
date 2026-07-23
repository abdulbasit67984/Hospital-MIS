import type {
  Db,
  IndexDescription,
} from 'mongodb';

import type {
  HospitalCollectionName,
} from '../catalog/collection-specs.js';

import {
  ConsultantAgreementHistoryModel,
  ConsultantAgreementModel,
  ConsultantAgreementRuleHistoryModel,
  ConsultantAgreementRuleModel,
} from '../models/consultant-agreement.model.js';

import {
  ConsultantDisputeHistoryModel,
  ConsultantDisputeModel,
  ConsultantWorkItemModel,
} from '../models/consultant-dispute.model.js';

import {
  ConsultantCalculationRunModel,
  ConsultantRevenueAdjustmentModel,
  ConsultantRevenueEntryModel,
  ConsultantRevenueParticipantModel,
  ConsultantRevenueReversalModel,
} from '../models/consultant-revenue.model.js';

import {
  ConsultantSettlementItemModel,
  ConsultantSettlementModel,
  ConsultantSettlementPaymentModel,
} from '../models/consultant-settlement.model.js';

import type {
  Migration,
} from './types.js';

export const consultantSharingFoundationCollections = [
  'consultantAgreements',
  'consultantAgreementRules',
  'consultantAgreementHistories',
  'consultantAgreementRuleHistories',
  'consultantCalculationRuns',
  'consultantRevenueEntries',
  'consultantRevenueParticipants',
  'consultantRevenueAdjustments',
  'consultantRevenueReversals',
  'consultantSettlements',
  'consultantSettlementItems',
  'consultantSettlementPayments',
  'consultantDisputes',
  'consultantDisputeHistories',
  'consultantWorkItems',
] as const satisfies readonly HospitalCollectionName[];

type ConsultantSharingCollection =
  (typeof consultantSharingFoundationCollections)[number];

const models = {
  consultantAgreements: ConsultantAgreementModel,
  consultantAgreementRules: ConsultantAgreementRuleModel,
  consultantAgreementHistories: ConsultantAgreementHistoryModel,
  consultantAgreementRuleHistories: ConsultantAgreementRuleHistoryModel,
  consultantCalculationRuns: ConsultantCalculationRunModel,
  consultantRevenueEntries: ConsultantRevenueEntryModel,
  consultantRevenueParticipants: ConsultantRevenueParticipantModel,
  consultantRevenueAdjustments: ConsultantRevenueAdjustmentModel,
  consultantRevenueReversals: ConsultantRevenueReversalModel,
  consultantSettlements: ConsultantSettlementModel,
  consultantSettlementItems: ConsultantSettlementItemModel,
  consultantSettlementPayments: ConsultantSettlementPaymentModel,
  consultantDisputes: ConsultantDisputeModel,
  consultantDisputeHistories: ConsultantDisputeHistoryModel,
  consultantWorkItems: ConsultantWorkItemModel,
} as const;

const requiredFields = {
  consultantAgreements: [
    'operationKey',
    'agreementNumber',
    'agreementName',
    'consultantId',
    'engagementType',
    'status',
    'priority',
    'effectiveFrom',
    'agreementVersion',
    'departmentIds',
    'serviceIds',
    'serviceCategories',
    'supportingAttachmentIds',
    'approvalMatrixCode',
    'makerUserId',
    'transactionId',
    'correlationId',
    'schemaVersion',
    'version',
    'createdBy',
    'updatedBy',
  ],
  consultantAgreementRules: [
    'operationKey',
    'agreementId',
    'agreementVersion',
    'ruleVersion',
    'ruleCode',
    'ruleName',
    'status',
    'priority',
    'specificityRank',
    'isFallback',
    'effectiveFrom',
    'consultantId',
    'calculationMethod',
    'recognitionBasis',
    'tiers',
    'participants',
    'eligibilityPolicy',
    'excludedDepartmentIds',
    'excludedServiceIds',
    'excludedPayerOrganizationIds',
    'excludedPackageIds',
    'excludedInvoiceLineTypes',
    'currency',
    'calculationFingerprint',
    'makerUserId',
    'transactionId',
    'correlationId',
    'schemaVersion',
    'version',
    'createdBy',
    'updatedBy',
  ],
  consultantAgreementHistories: [
    'agreementId',
    'agreementNumber',
    'agreementVersion',
    'historySequence',
    'historyType',
    'toStatus',
    'snapshot',
    'snapshotHash',
    'reason',
    'attachmentIds',
    'actorUserId',
    'occurredAt',
    'immutableHash',
    'transactionId',
    'correlationId',
    'schemaVersion',
    'version',
    'createdBy',
    'updatedBy',
  ],
  consultantAgreementRuleHistories: [
    'agreementId',
    'ruleId',
    'agreementVersion',
    'ruleVersion',
    'historySequence',
    'toStatus',
    'snapshot',
    'snapshotHash',
    'reason',
    'actorUserId',
    'occurredAt',
    'immutableHash',
    'transactionId',
    'correlationId',
    'schemaVersion',
    'version',
    'createdBy',
    'updatedBy',
  ],
  consultantCalculationRuns: [
    'operationKey',
    'runType',
    'status',
    'sourceFinancialEventId',
    'sourceFinancialEventType',
    'sourceModule',
    'sourceRecordId',
    'inputHash',
    'requestedBy',
    'requestedAt',
    'attemptCount',
    'maxAttempts',
    'processedEntryCount',
    'createdEntryCount',
    'adjustedEntryCount',
    'skippedEntryCount',
    'failedEntryCount',
    'transactionId',
    'correlationId',
    'schemaVersion',
    'version',
    'createdBy',
    'updatedBy',
  ],
  consultantRevenueEntries: [
    'operationKey',
    'calculationRunId',
    'consultantId',
    'agreementId',
    'agreementVersion',
    'agreementRuleId',
    'ruleVersion',
    'patientId',
    'invoiceId',
    'invoiceLineId',
    'serviceCategory',
    'chargeCatalogItemId',
    'sourceFinancialEventId',
    'sourceFinancialEventType',
    'sourceModule',
    'sourceRecordId',
    'direction',
    'entryType',
    'status',
    'recognitionBasis',
    'calculationMethod',
    'currency',
    'grossAmount',
    'discountAmount',
    'welfareZakatAmount',
    'panelSponsorAmount',
    'patientAmount',
    'packageAmount',
    'refundAmount',
    'creditNoteAmount',
    'debitNoteAmount',
    'writeOffAmount',
    'claimAdjustmentAmount',
    'nonShareableAmount',
    'costDeductionAmount',
    'consumableDeductionAmount',
    'otherEligibilityDeductionAmount',
    'eligibleRevenueBeforeRecognition',
    'recognitionRatio',
    'eligibleRevenue',
    'pendingEligibleRevenue',
    'consultantShare',
    'hospitalShare',
    'otherParticipantShare',
    'taxWithholdingAmount',
    'deductionAmount',
    'netPayableAmount',
    'settledAmount',
    'outstandingAmount',
    'inputHash',
    'calculationHash',
    'immutableHash',
    'matchReason',
    'calculationTrace',
    'calculatedBy',
    'calculatedAt',
    'occurredAt',
    'transactionId',
    'correlationId',
    'schemaVersion',
    'version',
    'createdBy',
    'updatedBy',
  ],
  consultantRevenueParticipants: [
    'revenueEntryId',
    'participantId',
    'participantRole',
    'allocationMethod',
    'shareAmount',
    'priority',
    'residual',
    'allocationHash',
    'occurredAt',
    'immutableHash',
    'transactionId',
    'correlationId',
    'schemaVersion',
    'version',
    'createdBy',
    'updatedBy',
  ],
  consultantRevenueAdjustments: [
    'operationKey',
    'adjustmentNumber',
    'revenueEntryId',
    'consultantId',
    'status',
    'eligibleRevenueDelta',
    'consultantShareDelta',
    'hospitalShareDelta',
    'taxWithholdingDelta',
    'deductionDelta',
    'netPayableDelta',
    'reasonCode',
    'reason',
    'supportingAttachmentIds',
    'makerUserId',
    'approvalRequestId',
    'requestedAt',
    'immutableHash',
    'transactionId',
    'correlationId',
    'schemaVersion',
    'version',
    'createdBy',
    'updatedBy',
  ],
  consultantRevenueReversals: [
    'operationKey',
    'reversalNumber',
    'revenueEntryId',
    'consultantId',
    'status',
    'eligibleRevenueAmount',
    'consultantShareAmount',
    'hospitalShareAmount',
    'taxWithholdingAmount',
    'deductionAmount',
    'netPayableAmount',
    'sourceFinancialEventId',
    'reasonCode',
    'reason',
    'supportingAttachmentIds',
    'makerUserId',
    'approvalRequestId',
    'requestedAt',
    'immutableHash',
    'transactionId',
    'correlationId',
    'schemaVersion',
    'version',
    'createdBy',
    'updatedBy',
  ],
  consultantSettlements: [
    'operationKey',
    'settlementNumber',
    'consultantId',
    'periodType',
    'periodFrom',
    'periodThrough',
    'status',
    'currency',
    'openingBalance',
    'broughtForwardBalance',
    'eligibleRevenue',
    'consultantShare',
    'hospitalRetainedAmount',
    'adjustmentAmount',
    'refundDeductionAmount',
    'creditNoteDeductionAmount',
    'debitNoteAdditionAmount',
    'claimEffectAmount',
    'welfareZakatEffectAmount',
    'taxWithholdingAmount',
    'otherDeductionAmount',
    'advanceRecoveryAmount',
    'overpaymentRecoveryAmount',
    'grossPayableAmount',
    'totalDeductionAmount',
    'netPayableAmount',
    'paidAmount',
    'outstandingAmount',
    'itemCount',
    'revenueEntryCount',
    'calculationHash',
    'inputHash',
    'approvalMatrixCode',
    'makerUserId',
    'supportingAttachmentIds',
    'transactionId',
    'correlationId',
    'schemaVersion',
    'version',
    'createdBy',
    'updatedBy',
  ],
  consultantSettlementItems: [
    'settlementId',
    'consultantId',
    'itemSequence',
    'sourceKey',
    'itemType',
    'eligibleRevenue',
    'consultantShare',
    'hospitalShare',
    'withholdingAmount',
    'deductionAmount',
    'signedSettlementImpact',
    'description',
    'sourceOccurredAt',
    'immutableHash',
    'transactionId',
    'correlationId',
    'schemaVersion',
    'version',
    'createdBy',
    'updatedBy',
  ],
  consultantSettlementPayments: [
    'operationKey',
    'payoutNumber',
    'settlementId',
    'consultantId',
    'status',
    'paymentMethod',
    'currency',
    'amount',
    'approvedSettlementBalanceSnapshot',
    'taxWithholdingAmount',
    'advanceRecoveryAmount',
    'overpaymentRecoveryAmount',
    'otherDeductionAmount',
    'netDisbursedAmount',
    'paymentReferenceHash',
    'makerUserId',
    'approvalRequestId',
    'requestedAt',
    'immutableHash',
    'transactionId',
    'correlationId',
    'schemaVersion',
    'version',
    'createdBy',
    'updatedBy',
  ],
  consultantDisputes: [
    'operationKey',
    'disputeNumber',
    'consultantId',
    'targetType',
    'status',
    'reasonCode',
    'reason',
    'supportingAttachmentIds',
    'requestedAdjustmentAmount',
    'approvedAdjustmentAmount',
    'escalationLevel',
    'createdByConsultant',
    'makerUserId',
    'openedAt',
    'transactionId',
    'correlationId',
    'schemaVersion',
    'version',
    'createdBy',
    'updatedBy',
  ],
  consultantDisputeHistories: [
    'disputeId',
    'historySequence',
    'toStatus',
    'requestedAdjustmentAmount',
    'approvedAdjustmentAmount',
    'reason',
    'snapshot',
    'snapshotHash',
    'attachmentIds',
    'actorUserId',
    'occurredAt',
    'immutableHash',
    'transactionId',
    'correlationId',
    'schemaVersion',
    'version',
    'createdBy',
    'updatedBy',
  ],
  consultantWorkItems: [
    'workQueueType',
    'status',
    'priority',
    'escalationLevel',
    'transactionId',
    'correlationId',
    'schemaVersion',
    'version',
    'createdBy',
    'updatedBy',
  ],
} as const satisfies Readonly<
  Record<ConsultantSharingCollection, readonly string[]>
>;

function schemaValidator(
  required: readonly string[],
): Record<string, unknown> {
  return {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'facilityId',
        'createdAt',
        'updatedAt',
        ...required,
      ],
      properties: {
        facilityId: { bsonType: 'objectId' },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' },
      },
    },
  };
}

export const consultantSharingFoundationValidators: Readonly<
  Record<ConsultantSharingCollection, Record<string, unknown>>
> = Object.fromEntries(
  consultantSharingFoundationCollections.map((collectionName) => [
    collectionName,
    schemaValidator(requiredFields[collectionName]),
  ]),
) as unknown as Readonly<
  Record<ConsultantSharingCollection, Record<string, unknown>>
>;

function indexesFor(
  collectionName: ConsultantSharingCollection,
): readonly IndexDescription[] {
  const model = models[collectionName];
  const indexes = model.schema.indexes() as Array<
    [Record<string, 1 | -1>, Record<string, unknown>]
  >;

  return indexes.map(([key, options]) => ({
    key,
    ...options,
  })) as readonly IndexDescription[];
}

async function removeGenericConsultantIndexes(database: Db): Promise<void> {
  for (const collectionName of consultantSharingFoundationCollections) {
    const collection = database.collection(collectionName);
    const indexes = await collection.indexes().catch(() => []);

    for (const index of indexes) {
      const name = index.name;
      if (
        name != null &&
        name !== '_id_' &&
        !name.startsWith('uq_') &&
        !name.startsWith('ix_')
      ) {
        await collection.dropIndex(name).catch(() => undefined);
      }
    }
  }
}

export const consultantSharingFoundation: Migration = {
  id: '036-consultant-sharing-foundation',
  description:
    'Creates production consultant agreement versions, calculation runs, immutable revenue and participant ledgers, adjustments, reversals, settlements, payouts, disputes, histories, indexes, validators, and work queues',

  async up(database: Db): Promise<void> {
    const existingCollections = new Set(
      (
        await database
          .listCollections({}, { nameOnly: true })
          .toArray()
      ).map((collection: { name: string }) => collection.name),
    );

    for (const collectionName of consultantSharingFoundationCollections) {
      const validator = consultantSharingFoundationValidators[collectionName];

      if (!existingCollections.has(collectionName)) {
        await database.createCollection(collectionName, {
          validator,
          validationLevel: 'strict',
          validationAction: 'error',
        });
      } else {
        await database.command({
          collMod: collectionName,
          validator,
          validationLevel: 'strict',
          validationAction: 'error',
        });
      }
    }

    await removeGenericConsultantIndexes(database);

    for (const collectionName of consultantSharingFoundationCollections) {
      const indexes = indexesFor(collectionName);
      if (indexes.length > 0) {
        await database.collection(collectionName).createIndexes(indexes);
      }
    }
  },
};