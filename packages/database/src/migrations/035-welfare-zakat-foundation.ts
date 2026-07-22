import type {
  Db,
  IndexDescription,
} from 'mongodb';

import type {
  HospitalCollectionName,
} from '../catalog/collection-specs.js';

import {
  FundAllocationReversalModel,
  FundReturnModel,
  InvoiceFundAllocationModel,
} from '../models/assistance-allocation.model.js';

import {
  AssistanceApplicationHistoryModel,
  AssistanceApplicationModel,
  AssistanceReviewModel,
  EligibilityEvaluationSnapshotModel,
} from '../models/assistance-application.model.js';

import {
  AssistanceApprovalHistoryModel,
  AssistanceApprovalModel,
  AssistanceReservationModel,
} from '../models/assistance-approval.model.js';

import {
  AssistanceFundModel,
  FundTransactionModel,
  FundTransferModel,
} from '../models/assistance-fund.model.js';

import {
  AssistanceWorkItemModel,
} from '../models/assistance-work-item.model.js';

import type {
  Migration,
} from './types.js';

export const welfareZakatFoundationCollections = [
  'assistanceFunds',
  'fundTransactions',
  'fundTransfers',
  'assistanceApplications',
  'assistanceApplicationHistories',
  'assistanceReviews',
  'eligibilityEvaluationSnapshots',
  'assistanceApprovals',
  'assistanceApprovalHistories',
  'assistanceReservations',
  'invoiceFundAllocations',
  'fundAllocationReversals',
  'fundReturns',
  'assistanceWorkItems',
] as const satisfies readonly HospitalCollectionName[];

type WelfareZakatCollection =
  (typeof welfareZakatFoundationCollections)[number];

const models = {
  assistanceFunds: AssistanceFundModel,
  fundTransactions: FundTransactionModel,
  fundTransfers: FundTransferModel,
  assistanceApplications: AssistanceApplicationModel,
  assistanceApplicationHistories: AssistanceApplicationHistoryModel,
  assistanceReviews: AssistanceReviewModel,
  eligibilityEvaluationSnapshots: EligibilityEvaluationSnapshotModel,
  assistanceApprovals: AssistanceApprovalModel,
  assistanceApprovalHistories: AssistanceApprovalHistoryModel,
  assistanceReservations: AssistanceReservationModel,
  invoiceFundAllocations: InvoiceFundAllocationModel,
  fundAllocationReversals: FundAllocationReversalModel,
  fundReturns: FundReturnModel,
  assistanceWorkItems: AssistanceWorkItemModel,
} as const;

const requiredFields = {
  assistanceFunds: [
    'operationKey',
    'fundCode',
    'name',
    'fundType',
    'categoryCode',
    'restriction',
    'effectiveFrom',
    'status',
    'currency',
    'openingBalance',
    'inflowAmount',
    'transferInAmount',
    'transferOutAmount',
    'adjustmentIncreaseAmount',
    'adjustmentDecreaseAmount',
    'ledgerBalance',
    'reservedBalance',
    'committedBalance',
    'availableBalance',
    'utilizedBalance',
    'reversedBalance',
    'refundAmount',
    'repaymentAmount',
    'recoveryAmount',
    'writeOffAmount',
    'defaultEligibilityOutcome',
    'eligibilityRules',
    'limits',
    'approvalMatrixCode',
  ],
  fundTransactions: [
    'operationKey',
    'transactionNumber',
    'fundId',
    'transactionType',
    'direction',
    'amount',
    'currency',
    'balanceBefore',
    'balanceAfter',
    'reason',
    'actorUserId',
    'transactionId',
    'correlationId',
    'occurredAt',
    'immutableHash',
  ],
  fundTransfers: [
    'operationKey',
    'transferNumber',
    'sourceFundId',
    'destinationFundId',
    'amount',
    'currency',
    'status',
    'approvalRequestId',
    'makerUserId',
    'reason',
  ],
  assistanceApplications: [
    'operationKey',
    'duplicateKey',
    'applicationNumber',
    'applicationType',
    'patientId',
    'status',
    'applicantSnapshotEncrypted',
    'householdSnapshotEncrypted',
    'employmentSnapshotEncrypted',
    'financialConditionSnapshotEncrypted',
    'questionnaireSnapshotEncrypted',
    'householdSize',
    'dependantCount',
    'monthlyHouseholdIncome',
    'monthlyHouseholdExpenses',
    'monthlyDisposableIncome',
    'perCapitaIncome',
    'approvedAmount',
    'reservedAmount',
    'committedAmount',
    'utilizedAmount',
    'reversedAmount',
    'releasedAmount',
    'remainingApprovedAmount',
    'completenessSatisfied',
    'missingItems',
    'financialYearCode',
  ],
  assistanceApplicationHistories: [
    'applicationId',
    'toStatus',
    'applicationVersion',
    'snapshot',
    'snapshotHash',
    'reason',
    'actorUserId',
    'transactionId',
    'correlationId',
    'occurredAt',
    'immutableHash',
  ],
  assistanceReviews: [
    'applicationId',
    'reviewType',
    'reviewSequence',
    'outcome',
    'assessmentEncrypted',
    'findingsEncrypted',
    'attachmentIds',
    'reviewerUserId',
    'transactionId',
    'correlationId',
    'reviewedAt',
    'immutableHash',
  ],
  eligibilityEvaluationSnapshots: [
    'applicationId',
    'fundId',
    'applicationVersion',
    'fundVersion',
    'outcome',
    'eligible',
    'manualReviewRequired',
    'matchedRuleCodes',
    'failedRuleCodes',
    'reasons',
    'contextHash',
    'evaluatedBy',
    'evaluatedAt',
    'transactionId',
    'correlationId',
    'immutableHash',
  ],
  assistanceApprovals: [
    'operationKey',
    'approvalNumber',
    'applicationId',
    'fundId',
    'status',
    'requestedAmount',
    'approvedAmount',
    'reservedAmount',
    'committedAmount',
    'utilizedAmount',
    'reversedAmount',
    'releasedAmount',
    'remainingAmount',
    'approvedFrom',
    'approvalMatrixCode',
    'approvalRequestId',
    'makerUserId',
    'checkerUserIds',
  ],
  assistanceApprovalHistories: [
    'approvalId',
    'toStatus',
    'requestedAmount',
    'approvedAmount',
    'remainingAmount',
    'makerUserId',
    'approvalRequestId',
    'reason',
    'transactionId',
    'correlationId',
    'occurredAt',
    'immutableHash',
  ],
  assistanceReservations: [
    'operationKey',
    'applicationId',
    'approvalId',
    'fundId',
    'patientId',
    'patientAccountId',
    'invoiceId',
    'status',
    'reservedAmount',
    'consumedAmount',
    'releasedAmount',
    'remainingAmount',
    'priority',
    'expiresAt',
    'reservedAt',
    'reservedBy',
  ],
  invoiceFundAllocations: [
    'operationKey',
    'duplicateKey',
    'allocationNumber',
    'fundId',
    'patientId',
    'applicationId',
    'approvalId',
    'patientAccountId',
    'invoiceId',
    'status',
    'currency',
    'amount',
    'utilizedAmount',
    'reversedAmount',
    'refundedAmount',
    'repaidAmount',
    'recoveredAmount',
    'releasedAmount',
    'remainingAmount',
    'priority',
    'reason',
    'supportingAttachmentIds',
    'lines',
    'allocatedBy',
    'allocatedAt',
  ],
  fundAllocationReversals: [
    'operationKey',
    'allocationId',
    'amount',
    'status',
    'reason',
    'supportingAttachmentIds',
    'makerUserId',
    'approvalRequestId',
    'transactionId',
    'correlationId',
    'requestedAt',
    'immutableHash',
  ],
  fundReturns: [
    'operationKey',
    'returnType',
    'allocationId',
    'fundId',
    'amount',
    'approvalRequestId',
    'makerUserId',
    'reason',
    'attachmentIds',
    'transactionId',
    'correlationId',
    'postedAt',
    'immutableHash',
  ],
  assistanceWorkItems: [
    'applicationId',
    'workQueueType',
    'status',
    'priority',
    'escalationLevel',
  ],
} as const satisfies Readonly<
  Record<WelfareZakatCollection, readonly string[]>
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

export const welfareZakatFoundationValidators: Readonly<
  Record<WelfareZakatCollection, Record<string, unknown>>
> = Object.fromEntries(
  welfareZakatFoundationCollections.map((collectionName) => [
    collectionName,
    schemaValidator(requiredFields[collectionName]),
  ]),
) as unknown as Readonly<
  Record<WelfareZakatCollection, Record<string, unknown>>
>;

function indexesFor(
  collectionName: WelfareZakatCollection,
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

async function removeGenericAssistanceIndexes(database: Db): Promise<void> {
  for (const collectionName of [
    'assistanceFunds',
    'fundTransactions',
    'assistanceApplications',
    'assistanceApprovals',
    'invoiceFundAllocations',
    'fundAllocationReversals',
  ] as const) {
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

export const welfareZakatFoundation: Migration = {
  id: '035-welfare-zakat-foundation',
  description:
    'Creates production Welfare and Zakat fund, immutable ledger, application, review, eligibility, approval, reservation, allocation, reversal, return, transfer, and work-queue persistence',

  async up(database: Db): Promise<void> {
    const existingCollections = new Set(
      (
        await database
          .listCollections({}, { nameOnly: true })
          .toArray()
      ).map((collection: { name: string }) => collection.name),
    );

    for (const collectionName of welfareZakatFoundationCollections) {
      const validator = welfareZakatFoundationValidators[collectionName];

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

    await removeGenericAssistanceIndexes(database);

    for (const collectionName of welfareZakatFoundationCollections) {
      const indexes = indexesFor(collectionName);
      if (indexes.length > 0) {
        await database.collection(collectionName).createIndexes(indexes);
      }
    }
  },

};