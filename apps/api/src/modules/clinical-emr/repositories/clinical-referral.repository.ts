import type {
  FilterQuery,
} from 'mongoose';

import {
  ClinicalReferralModel,
  type ClinicalReferralChangeType,
  type ClinicalReferralPriority,
  type ClinicalReferralStatus,
  type ClinicalReferralType,
} from '@hospital-mis/database';

import {
  toObjectId,
} from '@hospital-mis/database';

import {
  ConflictError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

export interface ClinicalReferralTargetRecord {
  facilityId: string | null;
  departmentId: string | null;
  clinicId: string | null;
  servicePointId: string | null;
  providerId: string | null;
  externalOrganization: string | null;
  externalProviderName: string | null;
}

export interface ClinicalReferralRecord {
  id: string;
  facilityId: string;
  referralNumber: string;
  referralVersion: number;
  previousVersionId: string | null;
  patientId: string;
  sourceEncounterId: string;
  sourceClinicalNoteId: string | null;
  requestingProviderId: string;
  assignedProviderId: string | null;
  referralType: ClinicalReferralType;
  priority: ClinicalReferralPriority;
  status: ClinicalReferralStatus;
  changeType: ClinicalReferralChangeType;
  target: ClinicalReferralTargetRecord;
  reason: string | null;
  clinicalQuestion: string | null;
  responseSummary: string | null;
  decisionReason: string | null;
  requestedAt: Date;
  acceptedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  declinedAt: Date | null;
  cancelledAt: Date | null;
  changedAt: Date;
  changedBy: string;
  correctionReason: string | null;
  replacesVersionId: string | null;
  transactionId: string;
  correlationId: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateClinicalReferralVersionInput {
  facilityId: string;
  referralNumber: string;
  referralVersion: number;
  previousVersionId?: string | null;
  patientId: string;
  sourceEncounterId: string;
  sourceClinicalNoteId?: string | null;
  requestingProviderId: string;
  assignedProviderId?: string | null;
  referralType: ClinicalReferralType;
  priority: ClinicalReferralPriority;
  status: ClinicalReferralStatus;
  changeType: ClinicalReferralChangeType;
  target: ClinicalReferralTargetRecord;
  reason: string;
  clinicalQuestion?: string | null;
  responseSummary?: string | null;
  decisionReason?: string | null;
  requestedAt: Date;
  acceptedAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  declinedAt?: Date | null;
  cancelledAt?: Date | null;
  changedAt: Date;
  changedBy: string;
  correctionReason?: string | null;
  replacesVersionId?: string | null;
  transactionId: string;
  correlationId: string;
  actorUserId: string;
}

export interface ClinicalReferralListFilter {
  patientId?: string;
  encounterId?: string;
  assignedProviderId?: string;
  departmentId?: string;
  status?: ClinicalReferralStatus;
  priority?: ClinicalReferralPriority;
  referralType?: ClinicalReferralType;
  changedFrom?: Date;
  changedTo?: Date;
  page: number;
  pageSize: number;
}

function id(
  value: unknown,
): string | null {
  if (value == null) {
    return null;
  }

  if (
    typeof value === 'object' &&
    'toHexString' in value &&
    typeof value.toHexString === 'function'
  ) {
    return value.toHexString();
  }

  return String(value);
}

function recordFrom(
  value: Record<string, any>,
  includeSensitive: boolean,
): ClinicalReferralRecord {
  const target =
    (value.target ?? {}) as Record<string, unknown>;

  return {
    id: id(value._id)!,
    facilityId: id(value.facilityId)!,
    referralNumber: String(value.referralNumber),
    referralVersion: Number(value.referralVersion),
    previousVersionId: id(value.previousVersionId),
    patientId: id(value.patientId)!,
    sourceEncounterId: id(value.sourceEncounterId)!,
    sourceClinicalNoteId: id(value.sourceClinicalNoteId),
    requestingProviderId: id(value.requestingProviderId)!,
    assignedProviderId: id(value.assignedProviderId),
    referralType: value.referralType as ClinicalReferralType,
    priority: value.priority as ClinicalReferralPriority,
    status: value.status as ClinicalReferralStatus,
    changeType: value.changeType as ClinicalReferralChangeType,
    target: {
      facilityId: id(target.facilityId),
      departmentId: id(target.departmentId),
      clinicId: id(target.clinicId),
      servicePointId: id(target.servicePointId),
      providerId: id(target.providerId),
      externalOrganization:
        target.externalOrganization == null
          ? null
          : String(target.externalOrganization),
      externalProviderName:
        target.externalProviderName == null
          ? null
          : String(target.externalProviderName),
    },
    reason:
      includeSensitive && value.reason != null
        ? String(value.reason)
        : null,
    clinicalQuestion:
      includeSensitive && value.clinicalQuestion != null
        ? String(value.clinicalQuestion)
        : null,
    responseSummary:
      includeSensitive && value.responseSummary != null
        ? String(value.responseSummary)
        : null,
    decisionReason:
      includeSensitive && value.decisionReason != null
        ? String(value.decisionReason)
        : null,
    requestedAt: new Date(value.requestedAt),
    acceptedAt:
      value.acceptedAt == null ? null : new Date(value.acceptedAt),
    startedAt:
      value.startedAt == null ? null : new Date(value.startedAt),
    completedAt:
      value.completedAt == null ? null : new Date(value.completedAt),
    declinedAt:
      value.declinedAt == null ? null : new Date(value.declinedAt),
    cancelledAt:
      value.cancelledAt == null ? null : new Date(value.cancelledAt),
    changedAt: new Date(value.changedAt),
    changedBy: id(value.changedBy)!,
    correctionReason:
      includeSensitive && value.correctionReason != null
        ? String(value.correctionReason)
        : null,
    replacesVersionId: id(value.replacesVersionId),
    transactionId: String(value.transactionId),
    correlationId: String(value.correlationId),
    version: Number(value.version),
    createdAt: new Date(value.createdAt),
    updatedAt: new Date(value.updatedAt),
  };
}

function duplicateKey(
  error: unknown,
): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

export class ClinicalReferralNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Clinical referral was not found');
  }
}

export class ClinicalReferralConcurrencyError extends ConflictError {
  public constructor() {
    super(
      'The clinical referral changed before the operation could be completed',
    );
  }
}

export class ClinicalReferralRepository {
  public async createVersion(
    input: CreateClinicalReferralVersionInput,
  ): Promise<ClinicalReferralRecord> {
    try {
      const document =
        await ClinicalReferralModel.create({
          facilityId: toObjectId(input.facilityId, 'facilityId'),
          referralNumber: input.referralNumber,
          referralVersion: input.referralVersion,
          previousVersionId:
            input.previousVersionId == null
              ? null
              : toObjectId(input.previousVersionId, 'previousVersionId'),
          patientId: toObjectId(input.patientId, 'patientId'),
          sourceEncounterId:
            toObjectId(input.sourceEncounterId, 'sourceEncounterId'),
          sourceClinicalNoteId:
            input.sourceClinicalNoteId == null
              ? null
              : toObjectId(
                  input.sourceClinicalNoteId,
                  'sourceClinicalNoteId',
                ),
          requestingProviderId:
            toObjectId(
              input.requestingProviderId,
              'requestingProviderId',
            ),
          assignedProviderId:
            input.assignedProviderId == null
              ? null
              : toObjectId(
                  input.assignedProviderId,
                  'assignedProviderId',
                ),
          referralType: input.referralType,
          priority: input.priority,
          status: input.status,
          changeType: input.changeType,
          target: {
            facilityId:
              input.target.facilityId == null
                ? null
                : toObjectId(input.target.facilityId, 'target.facilityId'),
            departmentId:
              input.target.departmentId == null
                ? null
                : toObjectId(
                    input.target.departmentId,
                    'target.departmentId',
                  ),
            clinicId:
              input.target.clinicId == null
                ? null
                : toObjectId(input.target.clinicId, 'target.clinicId'),
            servicePointId:
              input.target.servicePointId == null
                ? null
                : toObjectId(
                    input.target.servicePointId,
                    'target.servicePointId',
                  ),
            providerId:
              input.target.providerId == null
                ? null
                : toObjectId(input.target.providerId, 'target.providerId'),
            externalOrganization:
              input.target.externalOrganization ?? null,
            externalProviderName:
              input.target.externalProviderName ?? null,
          },
          reason: input.reason,
          clinicalQuestion: input.clinicalQuestion ?? null,
          responseSummary: input.responseSummary ?? null,
          decisionReason: input.decisionReason ?? null,
          requestedAt: input.requestedAt,
          acceptedAt: input.acceptedAt ?? null,
          startedAt: input.startedAt ?? null,
          completedAt: input.completedAt ?? null,
          declinedAt: input.declinedAt ?? null,
          cancelledAt: input.cancelledAt ?? null,
          changedAt: input.changedAt,
          changedBy: toObjectId(input.changedBy, 'changedBy'),
          correctionReason: input.correctionReason ?? null,
          replacesVersionId:
            input.replacesVersionId == null
              ? null
              : toObjectId(
                  input.replacesVersionId,
                  'replacesVersionId',
                ),
          transactionId: input.transactionId,
          correlationId: input.correlationId,
          schemaVersion: 1,
          version: input.referralVersion - 1,
          createdBy: toObjectId(input.actorUserId, 'actorUserId'),
          updatedBy: toObjectId(input.actorUserId, 'actorUserId'),
        });

      return recordFrom(
        document.toObject(),
        true,
      );
    } catch (error) {
      if (duplicateKey(error)) {
        throw new ClinicalReferralConcurrencyError();
      }

      throw error;
    }
  }

  public async findLatestByNumber(
    facilityId: string,
    referralNumber: string,
    includeSensitive = false,
  ): Promise<ClinicalReferralRecord | null> {
    let query =
      ClinicalReferralModel
        .findOne({
          facilityId: toObjectId(facilityId, 'facilityId'),
          referralNumber: referralNumber.trim().toUpperCase(),
        })
        .sort({
          referralVersion: -1,
        });

    if (includeSensitive) {
      query = query.select(
        '+reason +clinicalQuestion +responseSummary +decisionReason +correctionReason',
      );
    }

    const document =
      await query.lean().exec();

    return document == null
      ? null
      : recordFrom(document as Record<string, any>, includeSensitive);
  }

  public async requireLatestByNumber(
    facilityId: string,
    referralNumber: string,
    includeSensitive = false,
  ): Promise<ClinicalReferralRecord> {
    const record =
      await this.findLatestByNumber(
        facilityId,
        referralNumber,
        includeSensitive,
      );

    if (record === null) {
      throw new ClinicalReferralNotFoundError();
    }

    return record;
  }

  public async listHistory(
    facilityId: string,
    referralNumber: string,
    includeSensitive = false,
  ): Promise<ClinicalReferralRecord[]> {
    let query =
      ClinicalReferralModel
        .find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          referralNumber: referralNumber.trim().toUpperCase(),
        })
        .sort({
          referralVersion: 1,
        });

    if (includeSensitive) {
      query = query.select(
        '+reason +clinicalQuestion +responseSummary +decisionReason +correctionReason',
      );
    }

    const documents =
      await query.lean().exec();

    return documents.map((document) =>
      recordFrom(
        document as Record<string, any>,
        includeSensitive,
      ),
    );
  }

  public async listLatest(
    facilityId: string,
    filter: ClinicalReferralListFilter,
    includeSensitive = false,
  ): Promise<{
    items: ClinicalReferralRecord[];
    totalItems: number;
  }> {
    const baseMatch: Record<string, unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
      ...(filter.patientId === undefined
        ? {}
        : {
            patientId: toObjectId(filter.patientId, 'patientId'),
          }),
      ...(filter.encounterId === undefined
        ? {}
        : {
            sourceEncounterId:
              toObjectId(filter.encounterId, 'encounterId'),
          }),
    };

    const latestMatch: Record<string, unknown> = {
      ...(filter.assignedProviderId === undefined
        ? {}
        : {
            assignedProviderId:
              toObjectId(
                filter.assignedProviderId,
                'assignedProviderId',
              ),
          }),
      ...(filter.departmentId === undefined
        ? {}
        : {
            'target.departmentId':
              toObjectId(filter.departmentId, 'departmentId'),
          }),
      ...(filter.status === undefined
        ? {}
        : {
            status: filter.status,
          }),
      ...(filter.priority === undefined
        ? {}
        : {
            priority: filter.priority,
          }),
      ...(filter.referralType === undefined
        ? {}
        : {
            referralType: filter.referralType,
          }),
      ...(
        filter.changedFrom === undefined &&
        filter.changedTo === undefined
          ? {}
          : {
              changedAt: {
                ...(filter.changedFrom === undefined
                  ? {}
                  : {
                      $gte: filter.changedFrom,
                    }),
                ...(filter.changedTo === undefined
                  ? {}
                  : {
                      $lte: filter.changedTo,
                    }),
              },
            }
      ),
    };

    const skip =
      (filter.page - 1) * filter.pageSize;

    const pipeline: Record<string, unknown>[] = [
      {
        $match: baseMatch,
      },
      {
        $sort: {
          referralNumber: 1,
          referralVersion: -1,
        },
      },
      {
        $group: {
          _id: '$referralNumber',
          record: {
            $first: '$$ROOT',
          },
        },
      },
      {
        $replaceRoot: {
          newRoot: '$record',
        },
      },
      {
        $match: latestMatch,
      },
      {
        $sort: {
          priority: 1,
          changedAt: -1,
          referralNumber: 1,
        },
      },
      {
        $facet: {
          items: [
            {
              $skip: skip,
            },
            {
              $limit: filter.pageSize,
            },
          ],
          count: [
            {
              $count: 'value',
            },
          ],
        },
      },
    ];

    const [result] =
      await ClinicalReferralModel
        .aggregate(pipeline)
        .exec() as Array<{
          items: Record<string, any>[];
          count: Array<{
            value: number;
          }>;
        }>;

    return {
      items: (result?.items ?? []).map((item) =>
        recordFrom(item, includeSensitive),
      ),
      totalItems: result?.count[0]?.value ?? 0,
    };
  }

  public async countVersions(
    facilityId: string,
    referralNumber: string,
  ): Promise<number> {
    const filter: FilterQuery<unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
      referralNumber: referralNumber.trim().toUpperCase(),
    };

    return ClinicalReferralModel.countDocuments(filter).exec();
  }
}