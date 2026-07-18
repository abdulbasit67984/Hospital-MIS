import type {
  FilterQuery,
} from 'mongoose';

import {
  EncounterModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  EncounterStatus,
} from '@hospital-mis/database';

import {
  throwMappedClinicalEmrPersistenceError,
} from '../clinical-emr.persistence-errors.js';

import {
  ENCOUNTER_INTERNAL_SELECT,
  ENCOUNTER_STANDARD_SELECT,
} from '../clinical-emr.projections.js';

import type {
  ClinicalEmrPageResult,
  EncounterListQuery,
  EncounterRecord,
} from '../clinical-emr.types.js';

export interface CreateEncounterRecordInput {
  encounterId: string;
  facilityId: string;
  encounterNumber: string;
  patientId: string;
  requestedPatientId: string;
  canonicalRedirected: boolean;
  registrationId: string | null;
  opdVisitId: string | null;
  queueTokenId: string | null;
  emergencyCaseId: string | null;
  admissionId: string | null;
  referralId: string | null;
  encounterType: EncounterRecord['encounterType'];
  careContext: EncounterRecord['careContext'];
  serviceDate: string;
  departmentId: string;
  clinicId: string | null;
  servicePointId: string | null;
  primaryProviderId: string;
  currentOwnerId: string;
  currentOwnerRole: EncounterRecord['currentOwnerRole'];
  assignedProviderIds: readonly string[];
  confidentiality: EncounterRecord['confidentiality'];
  restrictionReason: string | null;
  startedAt: Date;
  supersedesEncounterId?: string | null;
  correctionReason?: string | null;
  transactionId: string;
  correlationId: string;
  actorUserId: string;
}

function nullableObjectId(
  value: string | null | undefined,
  path: string,
) {
  return value == null
    ? null
    : toObjectId(
        value,
        path,
      );
}

export class EncounterRepository {
  public async create(
    input: CreateEncounterRecordInput,
  ): Promise<EncounterRecord> {
    try {
      const created =
        await EncounterModel.create({
          _id:
            toObjectId(
              input.encounterId,
              'encounterId',
            ),

          facilityId:
            toObjectId(
              input.facilityId,
              'facilityId',
            ),

          encounterNumber:
            input.encounterNumber,

          patientId:
            toObjectId(
              input.patientId,
              'patientId',
            ),

          requestedPatientId:
            toObjectId(
              input.requestedPatientId,
              'requestedPatientId',
            ),

          canonicalRedirected:
            input.canonicalRedirected,

          registrationId:
            nullableObjectId(
              input.registrationId,
              'registrationId',
            ),

          opdVisitId:
            nullableObjectId(
              input.opdVisitId,
              'opdVisitId',
            ),

          queueTokenId:
            nullableObjectId(
              input.queueTokenId,
              'queueTokenId',
            ),

          emergencyCaseId:
            nullableObjectId(
              input.emergencyCaseId,
              'emergencyCaseId',
            ),

          admissionId:
            nullableObjectId(
              input.admissionId,
              'admissionId',
            ),

          referralId:
            nullableObjectId(
              input.referralId,
              'referralId',
            ),

          encounterType:
            input.encounterType,

          careContext:
            input.careContext,

          status:
            'CREATED',

          serviceDate:
            input.serviceDate,

          departmentId:
            toObjectId(
              input.departmentId,
              'departmentId',
            ),

          clinicId:
            nullableObjectId(
              input.clinicId,
              'clinicId',
            ),

          servicePointId:
            nullableObjectId(
              input.servicePointId,
              'servicePointId',
            ),

          primaryProviderId:
            toObjectId(
              input.primaryProviderId,
              'primaryProviderId',
            ),

          currentOwnerId:
            toObjectId(
              input.currentOwnerId,
              'currentOwnerId',
            ),

          currentOwnerRole:
            input.currentOwnerRole,

          assignedProviderIds:
            input.assignedProviderIds.map(
              (providerId) =>
                toObjectId(
                  providerId,
                  'assignedProviderIds',
                ),
            ),

          confidentiality:
            input.confidentiality,

          restrictionReason:
            input.restrictionReason,

          startedAt:
            input.startedAt,

          lastClinicalActivityAt:
            input.startedAt,

          completedAt:
            null,

          signedAt:
            null,

          signedBy:
            null,

          signatureDigest:
            null,

          closedAt:
            null,

          closedBy:
            null,

          cancelledAt:
            null,

          cancelledBy:
            null,

          cancellationReason:
            null,

          supersedesEncounterId:
            nullableObjectId(
              input.supersedesEncounterId,
              'supersedesEncounterId',
            ),

          supersededByEncounterId:
            null,

          correctionReason:
            input.correctionReason ??
            null,

          amendmentCount:
            0,

          latestClinicalNoteId:
            null,

          latestDiagnosisAt:
            null,

          transactionId:
            input.transactionId,

          correlationId:
            input.correlationId,

          schemaVersion:
            1,

          version:
            0,

          createdBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),

          updatedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),
        });

      return created.toObject() as EncounterRecord;
    } catch (error) {
      throwMappedClinicalEmrPersistenceError(
        error,
        'CREATE_ENCOUNTER',
      );
    }
  }

  public async findById(
    facilityId: string,
    encounterId: string,
    includeInternal = false,
  ): Promise<EncounterRecord | null> {
    return EncounterModel.findOne({
      _id:
        toObjectId(
          encounterId,
          'encounterId',
        ),

      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    })
      .select(
        includeInternal
          ? ENCOUNTER_INTERNAL_SELECT
          : ENCOUNTER_STANDARD_SELECT,
      )
      .lean<EncounterRecord>()
      .exec();
  }

  public async findByNumber(
    facilityId: string,
    encounterNumber: string,
    includeInternal = false,
  ): Promise<EncounterRecord | null> {
    return EncounterModel.findOne({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      encounterNumber:
        encounterNumber
          .trim()
          .toLocaleUpperCase('en-US'),
    })
      .select(
        includeInternal
          ? ENCOUNTER_INTERNAL_SELECT
          : ENCOUNTER_STANDARD_SELECT,
      )
      .lean<EncounterRecord>()
      .exec();
  }

  public async findActiveByOpdVisit(
    facilityId: string,
    opdVisitId: string,
    includeInternal = false,
  ): Promise<EncounterRecord | null> {
    return EncounterModel.findOne({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      opdVisitId:
        toObjectId(
          opdVisitId,
          'opdVisitId',
        ),

      status: {
        $in: [
          'CREATED',
          'IN_PROGRESS',
          'ON_HOLD',
        ],
      },
    })
      .select(
        includeInternal
          ? ENCOUNTER_INTERNAL_SELECT
          : ENCOUNTER_STANDARD_SELECT,
      )
      .lean<EncounterRecord>()
      .exec();
  }

  public async list(
    facilityId: string,
    query: EncounterListQuery,
  ): Promise<ClinicalEmrPageResult<EncounterRecord>> {
    const filter:
      FilterQuery<EncounterRecord> = {
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      };

    if (query.patientId !== undefined) {
      filter.patientId =
        toObjectId(
          query.patientId,
          'patientId',
        );
    }

    if (query.providerId !== undefined) {
      filter.assignedProviderIds =
        toObjectId(
          query.providerId,
          'providerId',
        );
    }

    if (query.departmentId !== undefined) {
      filter.departmentId =
        toObjectId(
          query.departmentId,
          'departmentId',
        );
    }

    if (query.clinicId !== undefined) {
      filter.clinicId =
        toObjectId(
          query.clinicId,
          'clinicId',
        );
    }

    if (query.servicePointId !== undefined) {
      filter.servicePointId =
        toObjectId(
          query.servicePointId,
          'servicePointId',
        );
    }

    if (query.encounterType !== undefined) {
      filter.encounterType =
        query.encounterType;
    }

    if (query.careContext !== undefined) {
      filter.careContext =
        query.careContext;
    }

    if (query.status !== undefined) {
      filter.status =
        query.status;
    }

    if (
      query.serviceDateFrom !== undefined ||
      query.serviceDateTo !== undefined
    ) {
      filter.serviceDate = {
        ...(query.serviceDateFrom === undefined
          ? {}
          : {
              $gte: query.serviceDateFrom,
            }),

        ...(query.serviceDateTo === undefined
          ? {}
          : {
              $lte: query.serviceDateTo,
            }),
      };
    }

    const skip =
      (query.page - 1) *
      query.pageSize;

    const direction =
      query.sortDirection === 'asc'
        ? 1
        : -1;

    const [
      items,
      totalItems,
    ] =
      await Promise.all([
        EncounterModel.find(filter)
          .select(ENCOUNTER_STANDARD_SELECT)
          .sort({
            [query.sortBy]: direction,
            _id: direction,
          })
          .skip(skip)
          .limit(query.pageSize)
          .lean<EncounterRecord[]>()
          .exec(),

        EncounterModel.countDocuments(filter).exec(),
      ]);

    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages:
        Math.ceil(
          totalItems /
          query.pageSize,
        ),
    };
  }

  public async startWithVersion(
    input: Readonly<{
      facilityId: string;
      encounterId: string;
      expectedVersion: number;
      occurredAt: Date;
      actorUserId: string;
    }>,
  ): Promise<EncounterRecord | null> {
    return this.changeSimpleStatusWithVersion({
      ...input,
      fromStatuses: [
        'CREATED',
        'ON_HOLD',
      ],
      toStatus: 'IN_PROGRESS',
    });
  }

  public async holdWithVersion(
    input: Readonly<{
      facilityId: string;
      encounterId: string;
      expectedVersion: number;
      occurredAt: Date;
      actorUserId: string;
    }>,
  ): Promise<EncounterRecord | null> {
    return this.changeSimpleStatusWithVersion({
      ...input,
      fromStatuses: [
        'IN_PROGRESS',
      ],
      toStatus: 'ON_HOLD',
    });
  }

  public async completeWithVersion(
    input: Readonly<{
      facilityId: string;
      encounterId: string;
      expectedVersion: number;
      occurredAt: Date;
      actorUserId: string;
    }>,
  ): Promise<EncounterRecord | null> {
    return EncounterModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.encounterId,
            'encounterId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,

        status:
          'IN_PROGRESS',
      },
      {
        $set: {
          status:
            'COMPLETED',

          activeContextKey:
            null,

          completedAt:
            input.occurredAt,

          lastClinicalActivityAt:
            input.occurredAt,

          updatedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),
        },

        $inc: {
          version: 1,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    )
      .select(ENCOUNTER_INTERNAL_SELECT)
      .lean<EncounterRecord>()
      .exec();
  }

  public async signWithVersion(
    input: Readonly<{
      facilityId: string;
      encounterId: string;
      expectedVersion: number;
      occurredAt: Date;
      actorUserId: string;
      signatureDigest: string;
    }>,
  ): Promise<EncounterRecord | null> {
    return EncounterModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.encounterId,
            'encounterId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,

        status:
          'COMPLETED',
      },
      {
        $set: {
          status:
            'SIGNED',

          signedAt:
            input.occurredAt,

          signedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),

          signatureDigest:
            input.signatureDigest,

          lastClinicalActivityAt:
            input.occurredAt,

          updatedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),
        },

        $inc: {
          version: 1,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    )
      .select(ENCOUNTER_INTERNAL_SELECT)
      .lean<EncounterRecord>()
      .exec();
  }

  public async closeWithVersion(
    input: Readonly<{
      facilityId: string;
      encounterId: string;
      expectedVersion: number;
      occurredAt: Date;
      actorUserId: string;
    }>,
  ): Promise<EncounterRecord | null> {
    return EncounterModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.encounterId,
            'encounterId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,

        status:
          'SIGNED',
      },
      {
        $set: {
          status:
            'CLOSED',

          closedAt:
            input.occurredAt,

          closedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),

          lastClinicalActivityAt:
            input.occurredAt,

          updatedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),
        },

        $inc: {
          version: 1,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    )
      .select(ENCOUNTER_INTERNAL_SELECT)
      .lean<EncounterRecord>()
      .exec();
  }

  public async cancelWithVersion(
    input: Readonly<{
      facilityId: string;
      encounterId: string;
      expectedVersion: number;
      reason: string;
      occurredAt: Date;
      actorUserId: string;
    }>,
  ): Promise<EncounterRecord | null> {
    return EncounterModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.encounterId,
            'encounterId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,

        status: {
          $in: [
            'CREATED',
            'IN_PROGRESS',
            'ON_HOLD',
          ],
        },
      },
      {
        $set: {
          status:
            'CANCELLED',

          activeContextKey:
            null,

          cancelledAt:
            input.occurredAt,

          cancelledBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),

          cancellationReason:
            input.reason,

          lastClinicalActivityAt:
            input.occurredAt,

          updatedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),
        },

        $inc: {
          version: 1,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    )
      .select(ENCOUNTER_INTERNAL_SELECT)
      .lean<EncounterRecord>()
      .exec();
  }

  public async reassignWithVersion(
    input: Readonly<{
      facilityId: string;
      encounterId: string;
      expectedVersion: number;
      currentOwnerId: string;
      currentOwnerRole: EncounterRecord['currentOwnerRole'];
      assignedProviderIds: readonly string[];
      occurredAt: Date;
      actorUserId: string;
    }>,
  ): Promise<EncounterRecord | null> {
    const assignedProviderIds =
      new Set([
        ...input.assignedProviderIds,
        input.currentOwnerId,
      ]);

    return EncounterModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.encounterId,
            'encounterId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,

        status: {
          $in: [
            'CREATED',
            'IN_PROGRESS',
            'ON_HOLD',
          ],
        },
      },
      {
        $set: {
          currentOwnerId:
            toObjectId(
              input.currentOwnerId,
              'currentOwnerId',
            ),

          currentOwnerRole:
            input.currentOwnerRole,

          assignedProviderIds:
            [...assignedProviderIds].map(
              (providerId) =>
                toObjectId(
                  providerId,
                  'assignedProviderIds',
                ),
            ),

          lastClinicalActivityAt:
            input.occurredAt,

          updatedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),
        },

        $inc: {
          version: 1,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    )
      .select(ENCOUNTER_INTERNAL_SELECT)
      .lean<EncounterRecord>()
      .exec();
  }

  public async markCorrectedWithVersion(
    input: Readonly<{
      facilityId: string;
      encounterId: string;
      expectedVersion: number;
      replacementEncounterId: string;
      reason: string;
      occurredAt: Date;
      actorUserId: string;
    }>,
  ): Promise<EncounterRecord | null> {
    return EncounterModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.encounterId,
            'encounterId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,

        status: {
          $nin: [
            'CANCELLED',
            'CORRECTED',
          ],
        },
      },
      {
        $set: {
          status:
            'CORRECTED',

          activeContextKey:
            null,

          supersededByEncounterId:
            toObjectId(
              input.replacementEncounterId,
              'replacementEncounterId',
            ),

          correctionReason:
            input.reason,

          lastClinicalActivityAt:
            input.occurredAt,

          updatedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),
        },

        $inc: {
          amendmentCount: 1,
          version: 1,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    )
      .select(ENCOUNTER_INTERNAL_SELECT)
      .lean<EncounterRecord>()
      .exec();
  }

  public async touchClinicalActivityWithVersion(
    input: Readonly<{
      facilityId: string;
      encounterId: string;
      expectedVersion: number;
      occurredAt: Date;
      actorUserId: string;
      latestClinicalNoteId?: string;
      latestDiagnosisAt?: Date;
    }>,
  ): Promise<EncounterRecord | null> {
    return EncounterModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.encounterId,
            'encounterId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,

        status: {
          $in: [
            'CREATED',
            'IN_PROGRESS',
            'ON_HOLD',
          ],
        },
      },
      {
        $set: {
          lastClinicalActivityAt:
            input.occurredAt,

          ...(input.latestClinicalNoteId === undefined
            ? {}
            : {
                latestClinicalNoteId:
                  toObjectId(
                    input.latestClinicalNoteId,
                    'latestClinicalNoteId',
                  ),
              }),

          ...(input.latestDiagnosisAt === undefined
            ? {}
            : {
                latestDiagnosisAt:
                  input.latestDiagnosisAt,
              }),

          updatedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),
        },

        $inc: {
          version: 1,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    )
      .select(ENCOUNTER_INTERNAL_SELECT)
      .lean<EncounterRecord>()
      .exec();
  }

  public async touchClinicalDocumentActivityWithVersion(
    input: Readonly<{
      facilityId: string;
      encounterId: string;
      expectedVersion: number;
      occurredAt: Date;
      actorUserId: string;
      latestClinicalNoteId: string;
      incrementAmendmentCount?: boolean;
    }>,
  ): Promise<EncounterRecord | null> {
    return EncounterModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.encounterId,
            'encounterId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,

        status: {
          $nin: [
            'CANCELLED',
            'CORRECTED',
          ],
        },
      },
      {
        $set: {
          lastClinicalActivityAt:
            input.occurredAt,

          latestClinicalNoteId:
            toObjectId(
              input.latestClinicalNoteId,
              'latestClinicalNoteId',
            ),

          updatedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),
        },

        $inc: {
          version: 1,
          ...(input.incrementAmendmentCount === true
            ? {
                amendmentCount: 1,
              }
            : {}),
        },
      },
      {
        new: true,
        runValidators: true,
      },
    )
      .select(ENCOUNTER_INTERNAL_SELECT)
      .lean<EncounterRecord>()
      .exec();
  }

  private async changeSimpleStatusWithVersion(
    input: Readonly<{
      facilityId: string;
      encounterId: string;
      expectedVersion: number;
      fromStatuses: readonly EncounterStatus[];
      toStatus: EncounterStatus;
      occurredAt: Date;
      actorUserId: string;
    }>,
  ): Promise<EncounterRecord | null> {
    return EncounterModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.encounterId,
            'encounterId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,

        status: {
          $in:
            input.fromStatuses,
        },
      },
      {
        $set: {
          status:
            input.toStatus,

          lastClinicalActivityAt:
            input.occurredAt,

          updatedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),
        },

        $inc: {
          version: 1,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    )
      .select(ENCOUNTER_INTERNAL_SELECT)
      .lean<EncounterRecord>()
      .exec();
  }
}