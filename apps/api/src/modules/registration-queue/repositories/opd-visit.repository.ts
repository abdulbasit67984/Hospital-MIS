import type {
  FilterQuery,
} from 'mongoose';

import {
  OpdVisitModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  throwMappedRegistrationQueuePersistenceError,
} from '../registration-queue.persistence-errors.js';

import {
  OPD_VISIT_INTERNAL_SELECT,
  OPD_VISIT_STANDARD_SELECT,
} from '../registration-queue.projections.js';

import type {
  OpdVisitListQuery,
  OpdVisitRecord,
  RegistrationQueuePageResult,
} from '../registration-queue.types.js';

export interface CreateOpdVisitRecordInput {
  visitId: string;
  facilityId: string;
  visitNumber: string;
  registrationId: string;
  patientId: string;
  requestedPatientId: string;
  canonicalRedirected: boolean;
  serviceDate: string;
  visitType: OpdVisitRecord['visitType'];
  registrationSource: OpdVisitRecord['registrationSource'];
  status: OpdVisitRecord['status'];
  departmentId: string;
  clinicId: string | null;
  servicePointId: string | null;
  assignedProviderId: string | null;
  assignedCounterId: string | null;
  currentQueueTokenId: string | null;
  arrivedAt: Date;
  checkedInAt: Date | null;
  queuedAt: Date | null;
  supersedesVisitId?: string | null;
  correctionReason?: string | null;
  transactionId: string;
  correlationId: string;
  actorUserId: string;
}

export class OpdVisitRepository {
  public async create(
    input: CreateOpdVisitRecordInput,
  ): Promise<OpdVisitRecord> {
    try {
      const created =
        await OpdVisitModel.create({
          _id:
            toObjectId(
              input.visitId,
              'visitId',
            ),

          facilityId:
            toObjectId(
              input.facilityId,
              'facilityId',
            ),

          visitNumber:
            input.visitNumber,

          registrationId:
            toObjectId(
              input.registrationId,
              'registrationId',
            ),

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

          serviceDate:
            input.serviceDate,

          visitType:
            input.visitType,

          registrationSource:
            input.registrationSource,

          status:
            input.status,

          departmentId:
            toObjectId(
              input.departmentId,
              'departmentId',
            ),

          clinicId:
            input.clinicId === null
              ? null
              : toObjectId(
                  input.clinicId,
                  'clinicId',
                ),

          servicePointId:
            input.servicePointId === null
              ? null
              : toObjectId(
                  input.servicePointId,
                  'servicePointId',
                ),

          assignedProviderId:
            input.assignedProviderId ===
            null
              ? null
              : toObjectId(
                  input.assignedProviderId,
                  'assignedProviderId',
                ),

          assignedCounterId:
            input.assignedCounterId ===
            null
              ? null
              : toObjectId(
                  input.assignedCounterId,
                  'assignedCounterId',
                ),

          currentQueueTokenId:
            input.currentQueueTokenId ===
            null
              ? null
              : toObjectId(
                  input.currentQueueTokenId,
                  'currentQueueTokenId',
                ),

          activeVisitKey:
            null,

          arrivedAt:
            input.arrivedAt,

          checkedInAt:
            input.checkedInAt,

          queuedAt:
            input.queuedAt,

          serviceStartedAt:
            null,

          completedAt:
            null,

          cancelledAt:
            null,

          cancelledBy:
            null,

          cancellationReason:
            null,

          noShowAt:
            null,

          noShowMarkedBy:
            null,

          supersedesVisitId:
            input.supersedesVisitId ===
              undefined ||
            input.supersedesVisitId ===
              null
              ? null
              : toObjectId(
                  input.supersedesVisitId,
                  'supersedesVisitId',
                ),

          supersededByVisitId:
            null,

          correctionReason:
            input.correctionReason ??
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

      return created.toObject() as OpdVisitRecord;
    } catch (error) {
      throwMappedRegistrationQueuePersistenceError(
        error,
        'CREATE_VISIT',
      );
    }
  }

  public async findById(
    facilityId: string,
    visitId: string,
    includeInternal = false,
  ): Promise<OpdVisitRecord | null> {
    return OpdVisitModel.findOne({
      _id:
        toObjectId(
          visitId,
          'visitId',
        ),

      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    })
      .select(
        includeInternal
          ? OPD_VISIT_INTERNAL_SELECT
          : OPD_VISIT_STANDARD_SELECT,
      )
      .lean<OpdVisitRecord>()
      .exec();
  }

  public async findByRegistrationId(
    facilityId: string,
    registrationId: string,
    includeInternal = false,
  ): Promise<OpdVisitRecord | null> {
    return OpdVisitModel.findOne({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      registrationId:
        toObjectId(
          registrationId,
          'registrationId',
        ),
    })
      .select(
        includeInternal
          ? OPD_VISIT_INTERNAL_SELECT
          : OPD_VISIT_STANDARD_SELECT,
      )
      .lean<OpdVisitRecord>()
      .exec();
  }

  public async findByNumber(
    facilityId: string,
    visitNumber: string,
    includeInternal = false,
  ): Promise<OpdVisitRecord | null> {
    return OpdVisitModel.findOne({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      visitNumber:
        visitNumber
          .trim()
          .toLocaleUpperCase(
            'en-US',
          ),
    })
      .select(
        includeInternal
          ? OPD_VISIT_INTERNAL_SELECT
          : OPD_VISIT_STANDARD_SELECT,
      )
      .lean<OpdVisitRecord>()
      .exec();
  }

  public async findActiveByKey(
    facilityId: string,
    activeVisitKey: string,
  ): Promise<OpdVisitRecord | null> {
    return OpdVisitModel.findOne({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      activeVisitKey,
    })
      .select(
        OPD_VISIT_INTERNAL_SELECT,
      )
      .lean<OpdVisitRecord>()
      .exec();
  }

  public async list(
    facilityId: string,
    query: OpdVisitListQuery,
  ): Promise<
    RegistrationQueuePageResult<OpdVisitRecord>
  > {
    const filter:
      FilterQuery<OpdVisitRecord> = {
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

    if (
      query.serviceDateFrom !==
        undefined ||
      query.serviceDateTo !==
        undefined
    ) {
      filter.serviceDate = {
        ...(query.serviceDateFrom ===
        undefined
          ? {}
          : {
              $gte:
                query.serviceDateFrom,
            }),

        ...(query.serviceDateTo ===
        undefined
          ? {}
          : {
              $lte:
                query.serviceDateTo,
            }),
      };
    }

    if (query.status !== undefined) {
      filter.status =
        query.status;
    }

    if (
      query.registrationSource !==
      undefined
    ) {
      filter.registrationSource =
        query.registrationSource;
    }

    if (query.visitType !== undefined) {
      filter.visitType =
        query.visitType;
    }

    if (
      query.departmentId !==
      undefined
    ) {
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

    if (
      query.servicePointId !==
      undefined
    ) {
      filter.servicePointId =
        toObjectId(
          query.servicePointId,
          'servicePointId',
        );
    }

    if (
      query.assignedProviderId !==
      undefined
    ) {
      filter.assignedProviderId =
        toObjectId(
          query.assignedProviderId,
          'assignedProviderId',
        );
    }

    if (
      query.assignedCounterId !==
      undefined
    ) {
      filter.assignedCounterId =
        toObjectId(
          query.assignedCounterId,
          'assignedCounterId',
        );
    }

    const skip =
      (query.page - 1) *
      query.pageSize;

    const direction =
      query.sortDirection ===
      'asc'
        ? 1
        : -1;

    const [
      items,
      totalItems,
    ] =
      await Promise.all([
        OpdVisitModel.find(
          filter,
        )
          .select(
            OPD_VISIT_STANDARD_SELECT,
          )
          .sort({
            [query.sortBy]:
              direction,

            _id:
              direction,
          })
          .skip(
            skip,
          )
          .limit(
            query.pageSize,
          )
          .lean<OpdVisitRecord[]>()
          .exec(),

        OpdVisitModel.countDocuments(
          filter,
        ).exec(),
      ]);

    return {
      items,

      page:
        query.page,

      pageSize:
        query.pageSize,

      totalItems,

      totalPages:
        Math.ceil(
          totalItems /
            query.pageSize,
        ),
    };
  }

  public async transitionWithVersion(
    input: Readonly<{
      facilityId: string;
      visitId: string;
      expectedVersion: number;
      fromStatuses: readonly OpdVisitRecord['status'][];
      status: OpdVisitRecord['status'];
      actorUserId: string;
      occurredAt: Date;
      cancellationReason?: string | null;
      noShowReason?: string | null;
    }>,
  ): Promise<OpdVisitRecord | null> {
    const setValues:
      Record<string, unknown> = {
        status:
          input.status,

        updatedBy:
          toObjectId(
            input.actorUserId,
            'actorUserId',
          ),
      };

    if (
      input.status ===
      'CHECKED_IN'
    ) {
      setValues.checkedInAt =
        input.occurredAt;
    }

    if (input.status === 'QUEUED') {
      setValues.queuedAt =
        input.occurredAt;
    }

    if (
      input.status ===
      'IN_SERVICE'
    ) {
      setValues.serviceStartedAt =
        input.occurredAt;
    }

    if (
      input.status ===
      'COMPLETED'
    ) {
      setValues.completedAt =
        input.occurredAt;
    }

    if (
      input.status ===
      'CANCELLED'
    ) {
      setValues.cancelledAt =
        input.occurredAt;

      setValues.cancelledBy =
        toObjectId(
          input.actorUserId,
          'actorUserId',
        );

      setValues.cancellationReason =
        input.cancellationReason ??
        null;
    }

    if (input.status === 'NO_SHOW') {
      setValues.noShowAt =
        input.occurredAt;

      setValues.noShowMarkedBy =
        toObjectId(
          input.actorUserId,
          'actorUserId',
        );

      setValues.correctionReason =
        input.noShowReason ??
        null;
    }

    return OpdVisitModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.visitId,
            'visitId',
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
            ...input.fromStatuses,
          ],
        },
      },
      {
        $set:
          setValues,

        $inc: {
          version:
            1,
        },
      },
      {
        new:
          true,

        runValidators:
          true,
      },
    )
      .select(
        OPD_VISIT_INTERNAL_SELECT,
      )
      .lean<OpdVisitRecord>()
      .exec();
  }

  public async markCorrectedWithVersion(
    input: Readonly<{
      facilityId: string;
      visitId: string;
      expectedVersion: number;
      replacementVisitId: string;
      reason: string;
      actorUserId: string;
    }>,
  ): Promise<OpdVisitRecord | null> {
    return OpdVisitModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.visitId,
            'visitId',
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
            'REGISTERED',
            'CHECKED_IN',
            'QUEUED',
            'IN_SERVICE',
          ],
        },
      },
      {
        $set: {
          status:
            'CORRECTED',

          supersededByVisitId:
            toObjectId(
              input.replacementVisitId,
              'replacementVisitId',
            ),

          correctionReason:
            input.reason,

          updatedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),
        },

        $inc: {
          version:
            1,
        },
      },
      {
        new:
          true,

        runValidators:
          true,
      },
    )
      .select(
        OPD_VISIT_INTERNAL_SELECT,
      )
      .lean<OpdVisitRecord>()
      .exec();
  }
}