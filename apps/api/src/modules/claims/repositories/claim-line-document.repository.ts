import {
  ClaimDocumentModel,
  ClaimLineModel,
  decimal128,
  toObjectId,
} from '@hospital-mis/database';

import type {
  ClaimDocumentRepositoryPort,
  ClaimLineRepositoryPort,
} from '../claims.ports.js';

import type {
  ClaimDocumentRecord,
  ClaimLineRecord,
  ClaimsMongoSession,
} from '../claims.persistence.types.js';

import {
  stableClaimPayloadHash,
} from '../claims.normalization.js';

import {
  claimRecord,
  throwMappedClaimsPersistenceError,
  withClaimsSession,
} from './claims-repository.support.js';

const decimalFields = new Set([
  'units',
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
]);

const objectIdFields = new Set([
  'invoiceLineId',
  'coverageAllocationId',
  'chargeCatalogItemId',
  'sourceRecordId',
  'encounterId',
  'admissionId',
  'procedureId',
  'laboratoryOrderId',
  'radiologyOrderId',
  'dispensationId',
  'packageEnrollmentId',
  'providerId',
  'departmentId',
  'preauthorizationId',
]);

function normalizeLine(
  actor: Parameters<ClaimLineRepositoryPort['createMany']>[0],
  claimId: string,
  line: Readonly<Record<string, unknown>>,
  transaction: Parameters<ClaimLineRepositoryPort['createMany']>[3],
): Readonly<Record<string, unknown>> {
  const normalized: Record<string, unknown> = {
    facilityId: toObjectId(actor.facilityId, 'facilityId'),
    transactionId: transaction.transactionId,
    correlationId: actor.correlationId,
    schemaVersion: 1,
    version: 0,
    createdBy: toObjectId(actor.userId, 'createdBy'),
    updatedBy: toObjectId(actor.userId, 'updatedBy'),
    claimId: toObjectId(claimId, 'claimId'),
  };

  for (const [key, value] of Object.entries(line)) {
    if (decimalFields.has(key) && typeof value === 'string') {
      normalized[key] = decimal128(value);
      continue;
    }

    if (objectIdFields.has(key)) {
      normalized[key] =
        typeof value === 'string'
          ? toObjectId(value, key)
          : value == null
            ? null
            : value;
      continue;
    }

    normalized[key] = value;
  }

  return normalized;
}

function normalizeFinancialUpdate(
  update: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(update).map(([key, value]) => [
      key,
      decimalFields.has(key) && typeof value === 'string'
        ? decimal128(value)
        : value,
    ]),
  );
}

export class MongoClaimLineRepository
implements ClaimLineRepositoryPort {
  public async createMany(
    actor: Parameters<ClaimLineRepositoryPort['createMany']>[0],
    claimId: string,
    lines: readonly Readonly<Record<string, unknown>>[],
    transaction: Parameters<ClaimLineRepositoryPort['createMany']>[3],
  ): Promise<readonly ClaimLineRecord[]> {
    if (lines.length === 0) {
      return [];
    }

    try {
      const created = await ClaimLineModel.insertMany(
        lines.map((line) =>
          normalizeLine(actor, claimId, line, transaction),
        ),
        {
          ordered: true,
          session: transaction.session,
        },
      );

      return created.map((line) =>
        claimRecord<ClaimLineRecord>(line.toObject()),
      );
    } catch (error) {
      throwMappedClaimsPersistenceError(error);
    }
  }

  public async replaceForDraft(
    actor: Parameters<ClaimLineRepositoryPort['replaceForDraft']>[0],
    claimId: string,
    lines: readonly Readonly<Record<string, unknown>>[],
    transaction: Parameters<ClaimLineRepositoryPort['replaceForDraft']>[3],
  ): Promise<readonly ClaimLineRecord[]> {
    await ClaimLineModel.deleteMany({
      facilityId: toObjectId(actor.facilityId, 'facilityId'),
      claimId: toObjectId(claimId, 'claimId'),
      status: { $in: ['DRAFT', 'RETURNED', 'REJECTED'] },
    })
      .session(transaction.session)
      .exec();

    return this.createMany(actor, claimId, lines, transaction);
  }

  public async listByClaim(
    facilityId: string,
    claimId: string,
    session?: ClaimsMongoSession,
  ): Promise<readonly ClaimLineRecord[]> {
    return claimRecord<ClaimLineRecord[]>(
      await withClaimsSession(
        ClaimLineModel.find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          claimId: toObjectId(claimId, 'claimId'),
        })
          .sort({ lineNumber: 1 })
          .lean(),
        session,
      ).exec(),
    );
  }

  public async findByIds(
    facilityId: string,
    claimId: string,
    lineIds: readonly string[],
    session?: ClaimsMongoSession,
  ): Promise<readonly ClaimLineRecord[]> {
    if (lineIds.length === 0) {
      return [];
    }

    return claimRecord<ClaimLineRecord[]>(
      await withClaimsSession(
        ClaimLineModel.find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          claimId: toObjectId(claimId, 'claimId'),
          _id: {
            $in: lineIds.map((lineId) =>
              toObjectId(lineId, 'claimLineId'),
            ),
          },
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async updateStatusesForClaim(
    facilityId: string,
    claimId: string,
    status: string,
    actorUserId: string,
    transaction: Parameters<ClaimLineRepositoryPort['updateStatusesForClaim']>[4],
  ): Promise<number> {
    const result = await ClaimLineModel.updateMany(
      {
        facilityId: toObjectId(facilityId, 'facilityId'),
        claimId: toObjectId(claimId, 'claimId'),
      },
      {
        $set: {
          status,
          updatedBy: toObjectId(actorUserId, 'updatedBy'),
          transactionId: transaction.transactionId,
        },
        $inc: { version: 1 },
      },
      {
        runValidators: true,
        session: transaction.session,
      },
    ).exec();

    return result.modifiedCount;
  }

  public async updateFinancials(
    facilityId: string,
    claimLineId: string,
    expectedVersion: number,
    update: Readonly<Record<string, unknown>>,
    actorUserId: string,
    transaction: Parameters<ClaimLineRepositoryPort['updateFinancials']>[5],
  ): Promise<ClaimLineRecord | null> {
    try {
      return claimRecord<ClaimLineRecord | null>(
        await ClaimLineModel.findOneAndUpdate(
          {
            _id: toObjectId(claimLineId, 'claimLineId'),
            facilityId: toObjectId(facilityId, 'facilityId'),
            version: expectedVersion,
          },
          {
            $set: {
              ...normalizeFinancialUpdate(update),
              updatedBy: toObjectId(actorUserId, 'updatedBy'),
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
    } catch (error) {
      throwMappedClaimsPersistenceError(error);
    }
  }
}

export class MongoClaimDocumentRepository
implements ClaimDocumentRepositoryPort {
  public async replaceForDraft(
    actor: Parameters<ClaimDocumentRepositoryPort['replaceForDraft']>[0],
    claimId: string,
    attachments: Parameters<ClaimDocumentRepositoryPort['replaceForDraft']>[2],
    transaction: Parameters<ClaimDocumentRepositoryPort['replaceForDraft']>[3],
  ): Promise<readonly ClaimDocumentRecord[]> {
    await ClaimDocumentModel.deleteMany({
      facilityId: toObjectId(actor.facilityId, 'facilityId'),
      claimId: toObjectId(claimId, 'claimId'),
      includedInLatestSubmission: false,
    })
      .session(transaction.session)
      .exec();

    if (attachments.length === 0) {
      return [];
    }

    const invoiceLineIds = attachments
      .map((attachment) => attachment.lineInvoiceId)
      .filter((value): value is string => value != null);

    const claimLines = invoiceLineIds.length === 0
      ? []
      : await ClaimLineModel.find({
          facilityId: toObjectId(actor.facilityId, 'facilityId'),
          claimId: toObjectId(claimId, 'claimId'),
          invoiceLineId: {
            $in: invoiceLineIds.map((invoiceLineId) =>
              toObjectId(invoiceLineId, 'lineInvoiceId'),
            ),
          },
        })
          .session(transaction.session)
          .lean()
          .exec();

    const typedClaimLines = claimRecord<
      readonly Pick<ClaimLineRecord, '_id' | 'invoiceLineId'>[]
    >(claimLines);
    const lineByInvoiceId = new Map(
      typedClaimLines.map((line) => [
        line.invoiceLineId.toHexString(),
        line._id,
      ]),
    );

    const created = await ClaimDocumentModel.insertMany(
      attachments.map((attachment) => {
        const claimLineId = attachment.lineInvoiceId == null
          ? null
          : lineByInvoiceId.get(attachment.lineInvoiceId) ?? null;

        return {
          facilityId: toObjectId(actor.facilityId, 'facilityId'),
          transactionId: transaction.transactionId,
          correlationId: actor.correlationId,
          schemaVersion: 1,
          version: 0,
          createdBy: toObjectId(actor.userId, 'createdBy'),
          updatedBy: toObjectId(actor.userId, 'updatedBy'),
          claimId: toObjectId(claimId, 'claimId'),
          claimLineId,
          attachmentId: toObjectId(
            attachment.attachmentId,
            'attachmentId',
          ),
          purpose: attachment.purpose,
          description: attachment.description ?? null,
          required: false,
          includedInLatestSubmission: false,
          immutableSnapshotHash: stableClaimPayloadHash({
            claimId,
            claimLineId: claimLineId?.toHexString() ?? null,
            attachmentId: attachment.attachmentId,
            purpose: attachment.purpose,
            description: attachment.description ?? null,
          }),
        };
      }),
      {
        ordered: true,
        session: transaction.session,
      },
    );

    return created.map((document) =>
      claimRecord<ClaimDocumentRecord>(document.toObject()),
    );
  }

  public async appendForSubmission(
    actor: Parameters<ClaimDocumentRepositoryPort['appendForSubmission']>[0],
    claimIds: readonly string[],
    attachmentId: string,
    description: string,
    transaction: Parameters<ClaimDocumentRepositoryPort['appendForSubmission']>[4],
  ): Promise<readonly ClaimDocumentRecord[]> {
    if (claimIds.length === 0) {
      return [];
    }

    const created = await ClaimDocumentModel.insertMany(
      claimIds.map((claimId) => ({
        facilityId: toObjectId(actor.facilityId, 'facilityId'),
        transactionId: transaction.transactionId,
        correlationId: actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: toObjectId(actor.userId, 'createdBy'),
        updatedBy: toObjectId(actor.userId, 'updatedBy'),
        claimId: toObjectId(claimId, 'claimId'),
        claimLineId: null,
        attachmentId: toObjectId(attachmentId, 'attachmentId'),
        purpose: 'OTHER',
        description,
        required: false,
        includedInLatestSubmission: true,
        immutableSnapshotHash: stableClaimPayloadHash({
          claimId,
          attachmentId,
          purpose: 'OTHER',
          description,
          transactionId: transaction.transactionId,
        }),
      })),
      { ordered: true, session: transaction.session },
    );

    return created.map((document) =>
      claimRecord<ClaimDocumentRecord>(document.toObject()),
    );
  }

  public async listByClaim(
    facilityId: string,
    claimId: string,
    session?: ClaimsMongoSession,
  ): Promise<readonly ClaimDocumentRecord[]> {
    return claimRecord<ClaimDocumentRecord[]>(
      await withClaimsSession(
        ClaimDocumentModel.find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          claimId: toObjectId(claimId, 'claimId'),
        })
          .sort({ createdAt: 1 })
          .lean(),
        session,
      ).exec(),
    );
  }
}