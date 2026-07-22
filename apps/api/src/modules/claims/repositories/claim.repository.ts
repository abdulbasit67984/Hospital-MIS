import type {
  FilterQuery,
  UpdateQuery,
} from 'mongoose';

import {
  ClaimModel,
  decimal128,
  toObjectId,
} from '@hospital-mis/database';

import type {
  ClaimDiagnosisInput,
  ClaimsListQuery,
} from '../claims.contracts.js';

import type {
  ClaimsRepositoryPort,
} from '../claims.ports.js';

import type {
  ClaimRecord,
  ClaimsMongoSession,
} from '../claims.persistence.types.js';

import {
  normalizeClaimPagination,
  normalizeClaimReference,
} from '../claims.normalization.js';

import {
  claimRecord,
  claimSortDirection,
  escapeClaimRegex,
  nullableClaimObjectIdValue,
  throwMappedClaimsPersistenceError,
  withClaimsSession,
} from './claims-repository.support.js';

const financialFields = new Set([
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
]);

function diagnoses(values: readonly ClaimDiagnosisInput[]) {
  return values.map((value) => ({
    diagnosisId: nullableClaimObjectIdValue(
      value.diagnosisId,
      'diagnosisId',
    ),
    codeSystem: normalizeClaimReference(value.codeSystem),
    code: normalizeClaimReference(value.code),
    description: value.description,
    diagnosisType: value.diagnosisType,
    sequence: value.sequence,
    presentOnAdmission: value.presentOnAdmission ?? null,
  }));
}

function financialUpdate(
  values: Readonly<Record<string, string>>,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      financialFields.has(key) ? decimal128(value) : value,
    ]),
  );
}

function normalizeStatusUpdate(
  update: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(update)) {
    if (financialFields.has(key) && typeof value === 'string') {
      result[key] = decimal128(value);
      continue;
    }

    if (
      [
        'readinessSnapshotId',
        'readinessCheckedBy',
        'submittedBy',
        'cancelledBy',
        'reversedBy',
        'voidedBy',
        'assignedToUserId',
      ].includes(key) &&
      (typeof value === 'string' || value === null)
    ) {
      result[key] = nullableClaimObjectIdValue(value, key);
      continue;
    }

    result[key] = value;
  }

  return result;
}

export class MongoClaimsRepository implements ClaimsRepositoryPort {
  public async create(
    actor: Parameters<ClaimsRepositoryPort['create']>[0],
    input: Parameters<ClaimsRepositoryPort['create']>[1],
    authoritative: Parameters<ClaimsRepositoryPort['create']>[2],
    transaction: Parameters<ClaimsRepositoryPort['create']>[3],
  ): Promise<ClaimRecord> {
    try {
      const [created] = await ClaimModel.create(
        [{
          facilityId: toObjectId(actor.facilityId, 'facilityId'),
          transactionId: transaction.transactionId,
          correlationId: actor.correlationId,
          schemaVersion: 1,
          version: 0,
          createdBy: toObjectId(actor.userId, 'createdBy'),
          updatedBy: toObjectId(actor.userId, 'updatedBy'),
          operationKey: authoritative.operationKey,
          duplicateKey: authoritative.duplicateKey,
          claimNumber: authoritative.claimNumber,
          claimVersionNumber: authoritative.claimVersionNumber,
          claimVersionType: input.claimVersionType,
          originalClaimId: nullableClaimObjectIdValue(
            input.originalClaimId,
            'originalClaimId',
          ),
          priorClaimVersionId: nullableClaimObjectIdValue(
            authoritative.priorClaimVersionId,
            'priorClaimVersionId',
          ),
          patientId: toObjectId(authoritative.patientId, 'patientId'),
          patientAccountId: toObjectId(
            authoritative.patientAccountId,
            'patientAccountId',
          ),
          encounterId: nullableClaimObjectIdValue(
            authoritative.encounterId,
            'encounterId',
          ),
          admissionId: nullableClaimObjectIdValue(
            authoritative.admissionId,
            'admissionId',
          ),
          invoiceId: toObjectId(input.invoiceId, 'invoiceId'),
          coverageDeterminationId: toObjectId(
            input.coverageDeterminationId,
            'coverageDeterminationId',
          ),
          payerOrganizationId: toObjectId(
            input.payerOrganizationId,
            'payerOrganizationId',
          ),
          payerType: authoritative.payerType,
          panelPlanId: toObjectId(input.panelPlanId, 'panelPlanId'),
          patientCoverageId: toObjectId(
            input.patientCoverageId,
            'patientCoverageId',
          ),
          policyReferenceHash: authoritative.policyReferenceHash,
          policyReferenceMasked: authoritative.policyReferenceMasked,
          membershipReferenceHash: authoritative.membershipReferenceHash,
          membershipReferenceMasked: authoritative.membershipReferenceMasked,
          employerReferenceHash: authoritative.employerReferenceHash,
          authorizationReferenceHash:
            authoritative.authorizationReferenceHash,
          preauthorizationIds: (input.preauthorizationIds ?? []).map((id) =>
            toObjectId(id, 'preauthorizationId'),
          ),
          status: 'DRAFT',
          serviceFrom: authoritative.serviceFrom,
          serviceThrough: authoritative.serviceThrough,
          filingDeadline:
            input.filingDeadline == null
              ? null
              : new Date(input.filingDeadline),
          currency: authoritative.currency,
          ...financialUpdate(authoritative.financials),
          diagnoses: diagnoses(authoritative.diagnoses),
          readinessSnapshotId: null,
          readinessIssues: [],
          readinessCheckedAt: null,
          readinessCheckedBy: null,
          payerReferenceNumber: null,
          clearinghouseReference: null,
          assignedToUserId: null,
          followUpAt: null,
          agingAnchorAt: authoritative.agingAnchorAt,
          agingDays: 0,
          agingBucket: 'CURRENT',
          internalNoteEncrypted: authoritative.internalNoteEncrypted,
          payerNoteEncrypted: authoritative.payerNoteEncrypted,
          medicalNecessitySummaryEncrypted:
            authoritative.medicalNecessitySummaryEncrypted,
        }],
        { session: transaction.session },
      );

      return claimRecord<ClaimRecord>(created!.toObject());
    } catch (error) {
      throwMappedClaimsPersistenceError(error);
    }
  }

  public async findById(
    facilityId: string,
    claimId: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimRecord | null> {
    return claimRecord<ClaimRecord | null>(
      await withClaimsSession(
        ClaimModel.findOne({
          _id: toObjectId(claimId, 'claimId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async findByNumber(
    facilityId: string,
    claimNumber: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimRecord | null> {
    return claimRecord<ClaimRecord | null>(
      await withClaimsSession(
        ClaimModel.findOne({
          facilityId: toObjectId(facilityId, 'facilityId'),
          claimNumber: normalizeClaimReference(claimNumber) ?? claimNumber,
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async findByIds(
    facilityId: string,
    claimIds: readonly string[],
    session?: ClaimsMongoSession,
  ): Promise<readonly ClaimRecord[]> {
    if (claimIds.length === 0) {
      return [];
    }

    return claimRecord<ClaimRecord[]>(
      await withClaimsSession(
        ClaimModel.find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          _id: {
            $in: claimIds.map((claimId) =>
              toObjectId(claimId, 'claimId'),
            ),
          },
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async findActiveByDuplicateKey(
    facilityId: string,
    duplicateKey: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimRecord | null> {
    return claimRecord<ClaimRecord | null>(
      await withClaimsSession(
        ClaimModel.findOne({
          facilityId: toObjectId(facilityId, 'facilityId'),
          duplicateKey,
          status: { $nin: ['CANCELLED', 'REVERSED', 'VOIDED'] },
        })
          .sort({ createdAt: -1 })
          .lean(),
        session,
      ).exec(),
    );
  }

  public async list(
    facilityId: string,
    query: ClaimsListQuery,
  ): Promise<Readonly<{
    records: readonly ClaimRecord[];
    totalItems: number;
  }>> {
    const { pageSize, skip } = normalizeClaimPagination(query);
    const filter: FilterQuery<unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
      ...(query.payerOrganizationId === undefined
        ? {}
        : {
            payerOrganizationId: toObjectId(
              query.payerOrganizationId,
              'payerOrganizationId',
            ),
          }),
      ...(query.panelPlanId === undefined
        ? {}
        : { panelPlanId: toObjectId(query.panelPlanId, 'panelPlanId') }),
      ...(query.patientId === undefined
        ? {}
        : { patientId: toObjectId(query.patientId, 'patientId') }),
      ...(query.patientCoverageId === undefined
        ? {}
        : {
            patientCoverageId: toObjectId(
              query.patientCoverageId,
              'patientCoverageId',
            ),
          }),
      ...(query.invoiceId === undefined
        ? {}
        : { invoiceId: toObjectId(query.invoiceId, 'invoiceId') }),
      ...(query.status === undefined || query.status.length === 0
        ? query.includeClosed === true
          ? {}
          : { status: { $nin: ['CLOSED', 'CANCELLED', 'REVERSED', 'VOIDED'] } }
        : { status: { $in: query.status } }),
      ...(query.payerType === undefined || query.payerType.length === 0
        ? {}
        : { payerType: { $in: query.payerType } }),
      ...(query.agingBucket === undefined || query.agingBucket.length === 0
        ? {}
        : { agingBucket: { $in: query.agingBucket } }),
      ...(query.assignedToUserId === undefined
        ? {}
        : {
            assignedToUserId: toObjectId(
              query.assignedToUserId,
              'assignedToUserId',
            ),
          }),
      ...(query.followUpDueBefore === undefined
        ? {}
        : { followUpAt: { $lte: new Date(query.followUpDueBefore) } }),
      ...(query.from === undefined && query.to === undefined
        ? {}
        : {
            serviceFrom: {
              ...(query.from === undefined
                ? {}
                : { $gte: new Date(query.from) }),
              ...(query.to === undefined
                ? {}
                : { $lte: new Date(query.to) }),
            },
          }),
      ...(query.search === undefined
        ? {}
        : {
            $or: [
              {
                claimNumber: {
                  $regex: escapeClaimRegex(query.search),
                  $options: 'i',
                },
              },
              {
                payerReferenceNumber: {
                  $regex: escapeClaimRegex(query.search),
                  $options: 'i',
                },
              },
            ],
          }),
    };

    if (query.claimBatchId !== undefined) {
      const claimIds = await ClaimModel.db.collection('claimBatches')
        .findOne(
          {
            _id: toObjectId(query.claimBatchId, 'claimBatchId'),
            facilityId: toObjectId(facilityId, 'facilityId'),
          },
          { projection: { claimIds: 1 } },
        );
      filter['_id'] = {
        $in: Array.isArray(claimIds?.claimIds) ? claimIds.claimIds : [],
      };
    }

    const [records, totalItems] = await Promise.all([
      ClaimModel.find(filter)
        .sort({
          [query.sortBy ?? 'updatedAt']:
            claimSortDirection(query.sortDirection),
        })
        .skip(skip)
        .limit(pageSize)
        .lean()
        .exec(),
      ClaimModel.countDocuments(filter).exec(),
    ]);

    return {
      records: claimRecord<ClaimRecord[]>(records),
      totalItems,
    };
  }

  public async updateDraft(
    facilityId: string,
    claimId: string,
    expectedVersion: number,
    update: Parameters<ClaimsRepositoryPort['updateDraft']>[3],
    actorUserId: string,
    transaction: Parameters<ClaimsRepositoryPort['updateDraft']>[5],
  ): Promise<ClaimRecord | null> {
    const set: Record<string, unknown> = {
      updatedBy: toObjectId(actorUserId, 'updatedBy'),
      transactionId: transaction.transactionId,
    };

    if (update.diagnoses !== undefined) {
      set['diagnoses'] = diagnoses(update.diagnoses);
    }
    if (update.preauthorizationIds !== undefined) {
      set['preauthorizationIds'] = update.preauthorizationIds.map((id) =>
        toObjectId(id, 'preauthorizationId'),
      );
    }
    if (update.filingDeadline !== undefined) {
      set['filingDeadline'] = update.filingDeadline;
    }
    if (update.internalNoteEncrypted !== undefined) {
      set['internalNoteEncrypted'] = update.internalNoteEncrypted;
    }
    if (update.payerNoteEncrypted !== undefined) {
      set['payerNoteEncrypted'] = update.payerNoteEncrypted;
    }
    if (update.medicalNecessitySummaryEncrypted !== undefined) {
      set['medicalNecessitySummaryEncrypted'] =
        update.medicalNecessitySummaryEncrypted;
    }
    if (update.financials !== undefined) {
      Object.assign(set, financialUpdate(update.financials));
    }

    Object.assign(set, {
      readinessSnapshotId: null,
      readinessIssues: [],
      readinessCheckedAt: null,
      readinessCheckedBy: null,
    });

    try {
      return claimRecord<ClaimRecord | null>(
        await ClaimModel.findOneAndUpdate(
          {
            _id: toObjectId(claimId, 'claimId'),
            facilityId: toObjectId(facilityId, 'facilityId'),
            version: expectedVersion,
            status: { $in: ['DRAFT', 'RETURNED', 'REJECTED'] },
          },
          {
            $set: set,
            $inc: { version: 1 },
          } satisfies UpdateQuery<unknown>,
          {
            new: true,
            runValidators: true,
            session: transaction.session,
          },
        ).lean().exec(),
      );
    } catch (error) {
      throwMappedClaimsPersistenceError(error);
    }
  }

  public async updateStatus(
    facilityId: string,
    claimId: string,
    expectedVersion: number,
    update: Readonly<Record<string, unknown>>,
    actorUserId: string,
    transaction: Parameters<ClaimsRepositoryPort['updateStatus']>[5],
  ): Promise<ClaimRecord | null> {
    try {
      return claimRecord<ClaimRecord | null>(
        await ClaimModel.findOneAndUpdate(
          {
            _id: toObjectId(claimId, 'claimId'),
            facilityId: toObjectId(facilityId, 'facilityId'),
            version: expectedVersion,
          },
          {
            $set: {
              ...normalizeStatusUpdate(update),
              updatedBy: toObjectId(actorUserId, 'updatedBy'),
              transactionId: transaction.transactionId,
            },
            $inc: { version: 1 },
          } satisfies UpdateQuery<unknown>,
          {
            new: true,
            runValidators: true,
            session: transaction.session,
          },
        ).lean().exec(),
      );
    } catch (error) {
      throwMappedClaimsPersistenceError(error);
    }
  }

  public async updateFinancials(
    facilityId: string,
    claimId: string,
    expectedVersion: number,
    financials: Readonly<Record<string, string>>,
    actorUserId: string,
    transaction: Parameters<ClaimsRepositoryPort['updateFinancials']>[5],
  ): Promise<ClaimRecord | null> {
    return this.updateStatus(
      facilityId,
      claimId,
      expectedVersion,
      financialUpdate(financials),
      actorUserId,
      transaction,
    );
  }
}