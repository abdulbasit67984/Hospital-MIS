import type {
  Db,
  IndexDescription,
} from 'mongodb';

import type {
  HospitalCollectionName,
} from '../catalog/collection-specs.js';

import {
  ClaimAdjudicationModel,
  ClaimAppealModel,
  ClaimDenialModel,
} from '../models/claims-adjudication.model.js';

import {
  ClaimDocumentModel,
  ClaimLineModel,
  ClaimModel,
  ClaimValidationSnapshotModel,
} from '../models/claims-core.model.js';

import {
  ClaimAdjustmentModel,
  ClaimPaymentModel,
  ClaimRemittanceModel,
} from '../models/claims-remittance.model.js';

import {
  ClaimBatchModel,
  ClaimStatusHistoryModel,
  ClaimSubmissionModel,
  ClaimVersionHistoryModel,
  ClaimWorkItemModel,
} from '../models/claims-workflow.model.js';

import type {
  Migration,
} from './types.js';

export const claimsFoundationCollections = [
  'claims',
  'claimLines',
  'claimDocuments',
  'claimValidationSnapshots',
  'claimStatusHistories',
  'claimVersionHistories',
  'claimBatches',
  'claimSubmissions',
  'claimAdjudications',
  'claimDenials',
  'claimAppeals',
  'claimRemittances',
  'claimPayments',
  'claimAdjustments',
  'claimWorkItems',
] as const satisfies readonly HospitalCollectionName[];

type ClaimsCollection =
  (typeof claimsFoundationCollections)[number];

const models = {
  claims: ClaimModel,
  claimLines: ClaimLineModel,
  claimDocuments: ClaimDocumentModel,
  claimValidationSnapshots: ClaimValidationSnapshotModel,
  claimStatusHistories: ClaimStatusHistoryModel,
  claimVersionHistories: ClaimVersionHistoryModel,
  claimBatches: ClaimBatchModel,
  claimSubmissions: ClaimSubmissionModel,
  claimAdjudications: ClaimAdjudicationModel,
  claimDenials: ClaimDenialModel,
  claimAppeals: ClaimAppealModel,
  claimRemittances: ClaimRemittanceModel,
  claimPayments: ClaimPaymentModel,
  claimAdjustments: ClaimAdjustmentModel,
  claimWorkItems: ClaimWorkItemModel,
} as const;

const requiredFields = {
  claims: [
    'operationKey',
    'duplicateKey',
    'claimNumber',
    'claimVersionNumber',
    'claimVersionType',
    'patientId',
    'patientAccountId',
    'invoiceId',
    'coverageDeterminationId',
    'payerOrganizationId',
    'payerType',
    'panelPlanId',
    'patientCoverageId',
    'preauthorizationIds',
    'status',
    'serviceFrom',
    'serviceThrough',
    'currency',
    'grossAmount',
    'packageAmount',
    'deductibleAmount',
    'copaymentAmount',
    'coinsuranceAmount',
    'excludedAmount',
    'patientOtherAmount',
    'patientResponsibilityAmount',
    'claimedAmount',
    'approvedAmount',
    'deniedAmount',
    'disallowedAmount',
    'returnedAmount',
    'contractualAdjustmentAmount',
    'writeOffAmount',
    'payerWithholdingAmount',
    'debitNoteAmount',
    'creditNoteAmount',
    'refundAmount',
    'repaymentAmount',
    'paidAmount',
    'unappliedPaymentAmount',
    'outstandingAmount',
    'overpaymentAmount',
    'diagnoses',
    'readinessIssues',
    'agingAnchorAt',
    'agingDays',
    'agingBucket',
  ],
  claimLines: [
    'claimId',
    'duplicateKey',
    'lineNumber',
    'invoiceLineId',
    'chargeCatalogItemId',
    'sourceModule',
    'serviceCategory',
    'serviceFrom',
    'chargeCatalogCode',
    'serviceCodeSystem',
    'serviceCode',
    'modifiers',
    'units',
    'diagnosisSequences',
    'status',
    'grossAmount',
    'packageAmount',
    'deductibleAmount',
    'copaymentAmount',
    'coinsuranceAmount',
    'excludedAmount',
    'patientOtherAmount',
    'patientResponsibilityAmount',
    'claimedAmount',
    'approvedAmount',
    'deniedAmount',
    'disallowedAmount',
    'returnedAmount',
    'contractualAdjustmentAmount',
    'writeOffAmount',
    'payerWithholdingAmount',
    'paidAmount',
    'outstandingAmount',
  ],
  claimDocuments: [
    'claimId',
    'attachmentId',
    'purpose',
    'required',
    'includedInLatestSubmission',
    'immutableSnapshotHash',
  ],
  claimValidationSnapshots: [
    'claimId',
    'claimVersion',
    'checkedAt',
    'checkedBy',
    'complete',
    'eligible',
    'duplicateFree',
    'scrubbed',
    'submissionReady',
    'authoritativePayloadHash',
    'issues',
  ],
  claimStatusHistories: [
    'claimId',
    'toStatus',
    'actorUserId',
    'occurredAt',
    'immutableHash',
  ],
  claimVersionHistories: [
    'claimId',
    'claimNumber',
    'versionNumber',
    'versionType',
    'snapshot',
    'snapshotHash',
    'reason',
    'actorUserId',
    'occurredAt',
  ],
  claimBatches: [
    'operationKey',
    'batchNumber',
    'payerOrganizationId',
    'submissionChannel',
    'status',
    'claimIds',
    'claimCount',
    'claimedAmount',
    'approvedAmount',
    'paidAmount',
  ],
  claimSubmissions: [
    'operationKey',
    'claimBatchId',
    'submissionAttempt',
    'submissionChannel',
    'status',
    'outboundPayloadHash',
    'retryCount',
    'submittedBy',
  ],
  claimAdjudications: [
    'claimId',
    'adjudicationSequence',
    'payerReferenceNumber',
    'claimedAmount',
    'approvedAmount',
    'deniedAmount',
    'disallowedAmount',
    'returnedAmount',
    'contractualAdjustmentAmount',
    'lines',
    'recordedBy',
    'adjudicatedAt',
    'recordedAt',
    'immutableHash',
  ],
  claimDenials: [
    'claimId',
    'adjudicationId',
    'category',
    'reasonDescription',
    'deniedAmount',
    'appealEligible',
    'resolved',
  ],
  claimAppeals: [
    'claimId',
    'appealNumber',
    'denialIds',
    'status',
    'appealDeadline',
    'groundsEncrypted',
    'requestedAmount',
    'approvedAdditionalAmount',
    'evidenceAttachmentIds',
  ],
  claimRemittances: [
    'operationKey',
    'remittanceNumber',
    'payerOrganizationId',
    'remittanceReference',
    'remittanceDate',
    'currency',
    'totalPaymentAmount',
    'allocatedAmount',
    'unappliedAmount',
    'allocations',
    'importedBy',
    'importedAt',
    'immutableHash',
  ],
  claimPayments: [
    'operationKey',
    'claimId',
    'remittanceId',
    'sponsorPaymentId',
    'amount',
    'postedBy',
    'postedAt',
    'immutableHash',
  ],
  claimAdjustments: [
    'claimId',
    'adjustmentType',
    'amount',
    'reason',
    'makerUserId',
    'status',
    'requestedAt',
    'immutableHash',
  ],
  claimWorkItems: [
    'claimId',
    'workQueueType',
    'status',
    'priority',
    'escalationLevel',
  ],
} as const satisfies Readonly<
  Record<ClaimsCollection, readonly string[]>
>;

function schemaValidator(
  required: readonly string[],
): Record<string, unknown> {
  return {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'facilityId',
        'transactionId',
        'correlationId',
        'schemaVersion',
        'version',
        'createdBy',
        'updatedBy',
        'createdAt',
        'updatedAt',
        ...required,
      ],
      properties: {
        facilityId: { bsonType: 'objectId' },
        transactionId: { bsonType: 'string' },
        correlationId: { bsonType: 'string' },
        schemaVersion: { bsonType: 'number', minimum: 1 },
        version: { bsonType: 'number', minimum: 0 },
        createdBy: { bsonType: 'objectId' },
        updatedBy: { bsonType: 'objectId' },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' },
      },
    },
  };
}

export const claimsFoundationValidators: Readonly<
  Record<ClaimsCollection, Record<string, unknown>>
> = Object.fromEntries(
  claimsFoundationCollections.map((collectionName) => [
    collectionName,
    schemaValidator(requiredFields[collectionName]),
  ]),
) as unknown as Readonly<
  Record<ClaimsCollection, Record<string, unknown>>
>;

function indexesFor(
  collectionName: ClaimsCollection,
): readonly IndexDescription[] {
  const model = models[collectionName];

  return model.schema.indexes().map(([key, options]) => ({
    key,
    ...options,
  })) as readonly IndexDescription[];
}

async function removeLegacyClaimIndexes(database: Db): Promise<void> {
  const claims = database.collection('claims');

  for (const indexName of [
    'facilityId_1_claimNumber_1',
    'facilityId_1_payerOrganizationId_1_status_1_createdAt_-1',
  ]) {
    await claims.dropIndex(indexName).catch(() => undefined);
  }
}

export const claimsFoundation: Migration = {
  id: '034-claims-foundation',
  description:
    'Creates production claims, submission, adjudication, denial, appeal, remittance, payment, adjustment, and work-queue persistence',

  async up(database: Db): Promise<void> {
    const existingCollections = new Set(
      (
        await database
          .listCollections({}, { nameOnly: true })
          .toArray()
      ).map((collection) => collection.name),
    );

    for (const collectionName of claimsFoundationCollections) {
      const validator = claimsFoundationValidators[collectionName];

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

    await removeLegacyClaimIndexes(database);

    for (const collectionName of claimsFoundationCollections) {
      const indexes = indexesFor(collectionName);

      if (indexes.length > 0) {
        await database.collection(collectionName).createIndexes(indexes);
      }
    }
  },

  async down(database: Db): Promise<void> {
    const newlyIntroducedCollections = claimsFoundationCollections.filter(
      (collectionName) =>
        ![
          'claims',
          'claimLines',
          'claimDocuments',
          'claimStatusHistories',
          'claimPayments',
        ].includes(collectionName),
    );

    for (const collectionName of [...newlyIntroducedCollections].reverse()) {
      await database
        .collection(collectionName)
        .drop()
        .catch(() => undefined);
    }
  },
};