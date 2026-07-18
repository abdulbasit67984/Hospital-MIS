import type {
  FilterQuery,
} from 'mongoose';

import {
  RegistrationModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  throwMappedRegistrationQueuePersistenceError,
} from '../registration-queue.persistence-errors.js';

import {
  REGISTRATION_INTERNAL_SELECT,
  REGISTRATION_STANDARD_SELECT,
} from '../registration-queue.projections.js';

import type {
  RegistrationListQuery,
  RegistrationQueuePageResult,
  RegistrationRecord,
} from '../registration-queue.types.js';

export interface CreateRegistrationRecordInput {
  registrationId: string;
  facilityId: string;
  registrationNumber: string;
  patientId: string;
  requestedPatientId: string;
  canonicalRedirected: boolean;
  registrationMode: RegistrationRecord['registrationMode'];
  registrationSource: RegistrationRecord['registrationSource'];
  visitType: RegistrationRecord['visitType'];
  serviceDate: string;
  arrivedAt: Date;
  checkedInAt: Date | null;
  appointmentId: string | null;
  referralId: string | null;
  referralReference: string | null;
  emergencyCaseId: string | null;
  departmentId: string;
  clinicId: string | null;
  servicePointId: string | null;
  assignedProviderId: string | null;
  registrationNotes: string | null;
  supersedesRegistrationId?: string | null;
  correctionReason?: string | null;
  transactionId: string;
  correlationId: string;
  actorUserId: string;
}

export class RegistrationRepository {
  public async create(
    input: CreateRegistrationRecordInput,
  ): Promise<RegistrationRecord> {
    try {
      const created =
        await RegistrationModel.create({
          _id:
            toObjectId(
              input.registrationId,
              'registrationId',
            ),

          facilityId:
            toObjectId(
              input.facilityId,
              'facilityId',
            ),

          registrationNumber:
            input.registrationNumber,

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

          registrationMode:
            input.registrationMode,

          registrationSource:
            input.registrationSource,

          visitType:
            input.visitType,

          status:
            'ACTIVE',

          serviceDate:
            input.serviceDate,

          arrivedAt:
            input.arrivedAt,

          checkedInAt:
            input.checkedInAt,

          appointmentId:
            input.appointmentId === null
              ? null
              : toObjectId(
                  input.appointmentId,
                  'appointmentId',
                ),

          referralId:
            input.referralId === null
              ? null
              : toObjectId(
                  input.referralId,
                  'referralId',
                ),

          referralReference:
            input.referralReference,

          emergencyCaseId:
            input.emergencyCaseId === null
              ? null
              : toObjectId(
                  input.emergencyCaseId,
                  'emergencyCaseId',
                ),

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
            input.assignedProviderId === null
              ? null
              : toObjectId(
                  input.assignedProviderId,
                  'assignedProviderId',
                ),

          registrationNotes:
            input.registrationNotes,

          cancelledAt:
            null,

          cancelledBy:
            null,

          cancellationReason:
            null,

          supersedesRegistrationId:
            input.supersedesRegistrationId ===
              undefined ||
            input.supersedesRegistrationId ===
              null
              ? null
              : toObjectId(
                  input.supersedesRegistrationId,
                  'supersedesRegistrationId',
                ),

          supersededByRegistrationId:
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

      return created.toObject() as RegistrationRecord;
    } catch (error) {
      throwMappedRegistrationQueuePersistenceError(
        error,
        'CREATE_REGISTRATION',
      );
    }
  }

  public async findById(
    facilityId: string,
    registrationId: string,
    includeInternal = false,
  ): Promise<RegistrationRecord | null> {
    return RegistrationModel.findOne({
      _id:
        toObjectId(
          registrationId,
          'registrationId',
        ),

      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    })
      .select(
        includeInternal
          ? REGISTRATION_INTERNAL_SELECT
          : REGISTRATION_STANDARD_SELECT,
      )
      .lean<RegistrationRecord>()
      .exec();
  }

  public async findByNumber(
    facilityId: string,
    registrationNumber: string,
    includeInternal = false,
  ): Promise<RegistrationRecord | null> {
    return RegistrationModel.findOne({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      registrationNumber:
        registrationNumber
          .trim()
          .toLocaleUpperCase(
            'en-US',
          ),
    })
      .select(
        includeInternal
          ? REGISTRATION_INTERNAL_SELECT
          : REGISTRATION_STANDARD_SELECT,
      )
      .lean<RegistrationRecord>()
      .exec();
  }

  public async list(
    facilityId: string,
    query: RegistrationListQuery,
  ): Promise<
    RegistrationQueuePageResult<RegistrationRecord>
  > {
    const filter:
      FilterQuery<RegistrationRecord> = {
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
        RegistrationModel.find(
          filter,
        )
          .select(
            REGISTRATION_STANDARD_SELECT,
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
          .lean<RegistrationRecord[]>()
          .exec(),

        RegistrationModel.countDocuments(
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

  public async cancelWithVersion(
    input: Readonly<{
      facilityId: string;
      registrationId: string;
      expectedVersion: number;
      cancelledAt: Date;
      cancelledBy: string;
      reason: string;
    }>,
  ): Promise<RegistrationRecord | null> {
    return RegistrationModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.registrationId,
            'registrationId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,

        status:
          'ACTIVE',
      },
      {
        $set: {
          status:
            'CANCELLED',

          cancelledAt:
            input.cancelledAt,

          cancelledBy:
            toObjectId(
              input.cancelledBy,
              'cancelledBy',
            ),

          cancellationReason:
            input.reason,

          updatedBy:
            toObjectId(
              input.cancelledBy,
              'cancelledBy',
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
        REGISTRATION_INTERNAL_SELECT,
      )
      .lean<RegistrationRecord>()
      .exec();
  }

  public async markSupersededWithVersion(
    input: Readonly<{
      facilityId: string;
      registrationId: string;
      expectedVersion: number;
      replacementRegistrationId: string;
      reason: string;
      actorUserId: string;
    }>,
  ): Promise<RegistrationRecord | null> {
    return RegistrationModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.registrationId,
            'registrationId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,

        status:
          'ACTIVE',
      },
      {
        $set: {
          status:
            'SUPERSEDED',

          supersededByRegistrationId:
            toObjectId(
              input.replacementRegistrationId,
              'replacementRegistrationId',
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
        REGISTRATION_INTERNAL_SELECT,
      )
      .lean<RegistrationRecord>()
      .exec();
  }
}