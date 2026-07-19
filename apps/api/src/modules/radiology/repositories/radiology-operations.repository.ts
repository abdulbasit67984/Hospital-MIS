import {
  RadiologyAppointmentModel,
  RadiologyExaminationModel,
  RadiologyImagingSeriesModel,
  RadiologyImagingStudyModel,
  RadiologyResourceModel,
  RadiologyResourceReservationModel,
  RadiologySafetyScreeningModel,
  StaffModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  RadiologyAppointmentRecord,
  RadiologyExaminationRecord,
  RadiologyImagingSeriesRecord,
  RadiologyImagingStudyRecord,
  RadiologyOperationsRepositoryPort,
  RadiologyReservationSubject,
  RadiologyResourceRecord,
  RadiologyResourceReservationRecord,
  RadiologySafetyScreeningRecord,
  RadiologySchedulingConflict,
} from '../radiology-operations.ports.js';

function record<T>(value: unknown): T {
  return value as T;
}

const RESOURCE_SELECT = [
  '_id',
  'facilityId',
  'resourceCode',
  'name',
  'normalizedName',
  'resourceType',
  'departmentId',
  'modalityIds',
  'location',
  'capabilities',
  'manufacturer',
  'modelName',
  '+serialNumber',
  'externalResourceReference',
  'status',
  'effectiveFrom',
  'effectiveThrough',
  'deactivatedAt',
  'deactivatedBy',
  'deactivationReason',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const APPOINTMENT_SELECT = [
  '_id',
  'facilityId',
  'radiologyOrderId',
  'radiologyOrderItemId',
  'patientId',
  'encounterId',
  'procedureId',
  'modalityId',
  'departmentId',
  'scheduledStartAt',
  'scheduledEndAt',
  'timezone',
  'roomResourceId',
  'equipmentResourceIds',
  'technicianStaffIds',
  'preparationStatus',
  'safetyScreeningStatus',
  'status',
  'scheduledByStaffId',
  'scheduledAt',
  'checkedInAt',
  'checkedInByStaffId',
  'cancelledAt',
  'cancelledByStaffId',
  '+cancellationReason',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const RESERVATION_SELECT = [
  '_id',
  'facilityId',
  'appointmentId',
  'radiologyOrderItemId',
  'subjectType',
  'resourceId',
  'staffId',
  'reservedStartAt',
  'reservedEndAt',
  'status',
  'releasedAt',
  'releasedByStaffId',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const SCREENING_SELECT = [
  '_id',
  'facilityId',
  'radiologyOrderId',
  'radiologyOrderItemId',
  'appointmentId',
  'patientId',
  'encounterId',
  'requiredScreeningCodesSnapshot',
  'requirementsHash',
  '+responses',
  '+pregnancyStatus',
  '+contrastAllergyStatus',
  '+renalRiskStatus',
  '+implantDeviceStatus',
  '+estimatedGfr',
  '+serumCreatinine',
  '+renalLabObservedAt',
  'status',
  'preparationStatus',
  '+conditions',
  'screenedAt',
  'screenedByStaffId',
  'reviewedAt',
  'reviewedByStaffId',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const EXAMINATION_SELECT = [
  '_id',
  'facilityId',
  'radiologyOrderId',
  'radiologyOrderItemId',
  'appointmentId',
  'patientId',
  'encounterId',
  'modalityId',
  'procedureDefinitionHash',
  'status',
  'technicianStaffIds',
  'checkedInAt',
  'checkedInByStaffId',
  'startedAt',
  'startedByStaffId',
  'completedAt',
  'completedByStaffId',
  'contrastAdministered',
  'contrastUsageReference',
  '+technicianNotes',
  '+complications',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const STUDY_SELECT = [
  '_id',
  'facilityId',
  'studyNumber',
  'accessionNumber',
  'radiologyOrderId',
  'radiologyOrderItemId',
  'examinationId',
  'patientId',
  'encounterId',
  'modalityId',
  'modalityCodeSnapshot',
  'studyInstanceUid',
  'studyDateTime',
  'status',
  'externalReferences',
  'seriesCount',
  'instanceCount',
  'binaryStorageProhibited',
  'registeredAt',
  'registeredByStaffId',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

export class RadiologyOperationsRepository
  implements RadiologyOperationsRepositoryPort
{
  public async findResourceById(
    facilityId: string,
    resourceId: string,
  ): Promise<RadiologyResourceRecord | null> {
    return record<RadiologyResourceRecord | null>(
      await RadiologyResourceModel.findOne({
        _id: toObjectId(resourceId, 'resourceId'),
        facilityId: toObjectId(
          facilityId,
          'facilityId',
        ),
      })
        .select(RESOURCE_SELECT)
        .lean()
        .exec(),
    );
  }

  public async findResourcesByIds(
    facilityId: string,
    resourceIds: readonly string[],
  ): Promise<RadiologyResourceRecord[]> {
    if (resourceIds.length === 0) {
      return [];
    }

    return record<RadiologyResourceRecord[]>(
      await RadiologyResourceModel.find({
        facilityId: toObjectId(
          facilityId,
          'facilityId',
        ),
        _id: {
          $in: resourceIds.map((resourceId) =>
            toObjectId(resourceId, 'resourceIds'),
          ),
        },
      })
        .select(RESOURCE_SELECT)
        .lean()
        .exec(),
    );
  }

  public async findEligibleTechnicians(
    facilityId: string,
    staffIds: readonly string[],
  ): Promise<string[]> {
    if (staffIds.length === 0) {
      return [];
    }

    const records = await StaffModel.find({
      facilityId: toObjectId(
        facilityId,
        'facilityId',
      ),
      _id: {
        $in: staffIds.map((staffId) =>
          toObjectId(staffId, 'staffIds'),
        ),
      },
      employmentStatus: 'ACTIVE',
      isActive: true,
      isClinical: true,
    })
      .select('_id')
      .lean<
        Array<{
          _id: {
            toHexString(): string;
          };
        }>
      >()
      .exec();

    return records.map((item) =>
      item._id.toHexString(),
    );
  }

  public async createResource(
    input: Record<string, unknown>,
  ): Promise<RadiologyResourceRecord> {
    const document =
      await RadiologyResourceModel.create(input);

    return record<RadiologyResourceRecord>(
      document.toObject(),
    );
  }

  public async updateResource(
    facilityId: string,
    resourceId: string,
    expectedVersion: number,
    update: Record<string, unknown>,
  ): Promise<RadiologyResourceRecord | null> {
    return record<RadiologyResourceRecord | null>(
      await RadiologyResourceModel.findOneAndUpdate(
        {
          _id: toObjectId(resourceId, 'resourceId'),
          facilityId: toObjectId(
            facilityId,
            'facilityId',
          ),
          version: expectedVersion,
        },
        {
          $set: update,
          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
        .select(RESOURCE_SELECT)
        .lean()
        .exec(),
    );
  }

  public async findAppointmentById(
    facilityId: string,
    appointmentId: string,
  ): Promise<RadiologyAppointmentRecord | null> {
    return record<RadiologyAppointmentRecord | null>(
      await RadiologyAppointmentModel.findOne({
        _id: toObjectId(
          appointmentId,
          'appointmentId',
        ),
        facilityId: toObjectId(
          facilityId,
          'facilityId',
        ),
      })
        .select(APPOINTMENT_SELECT)
        .lean()
        .exec(),
    );
  }

  public async findAppointmentByOrderItem(
    facilityId: string,
    orderItemId: string,
  ): Promise<RadiologyAppointmentRecord | null> {
    return record<RadiologyAppointmentRecord | null>(
      await RadiologyAppointmentModel.findOne({
        facilityId: toObjectId(
          facilityId,
          'facilityId',
        ),
        radiologyOrderItemId: toObjectId(
          orderItemId,
          'orderItemId',
        ),
      })
        .select(APPOINTMENT_SELECT)
        .lean()
        .exec(),
    );
  }

  public async findReservationsByAppointment(
    facilityId: string,
    appointmentId: string,
  ): Promise<RadiologyResourceReservationRecord[]> {
    return record<
      RadiologyResourceReservationRecord[]
    >(
      await RadiologyResourceReservationModel.find({
        facilityId: toObjectId(
          facilityId,
          'facilityId',
        ),
        appointmentId: toObjectId(
          appointmentId,
          'appointmentId',
        ),
      })
        .select(RESERVATION_SELECT)
        .lean()
        .exec(),
    );
  }

  public async findSchedulingConflicts(
    facilityId: string,
    subjects: readonly RadiologyReservationSubject[],
    startAt: Date,
    endAt: Date,
    excludeAppointmentId?: string,
  ): Promise<RadiologySchedulingConflict[]> {
    if (subjects.length === 0) {
      return [];
    }

    const subjectClauses = subjects.map((subject) =>
      subject.subjectType === 'RESOURCE'
        ? {
            subjectType: 'RESOURCE',
            resourceId: toObjectId(
              subject.resourceId as string,
              'resourceId',
            ),
          }
        : {
            subjectType: 'STAFF',
            staffId: toObjectId(
              subject.staffId as string,
              'staffId',
            ),
          },
    );

    const records =
      await RadiologyResourceReservationModel.find({
        facilityId: toObjectId(
          facilityId,
          'facilityId',
        ),
        status: 'ACTIVE',
        reservedStartAt: {
          $lt: endAt,
        },
        reservedEndAt: {
          $gt: startAt,
        },
        $or: subjectClauses,
        ...(excludeAppointmentId === undefined
          ? {}
          : {
              appointmentId: {
                $ne: toObjectId(
                  excludeAppointmentId,
                  'excludeAppointmentId',
                ),
              },
            }),
      })
        .select(RESERVATION_SELECT)
        .lean()
        .exec();

    return record<
      RadiologyResourceReservationRecord[]
    >(records).map((reservation) => ({
      reservationId:
        reservation._id.toHexString(),
      appointmentId:
        reservation.appointmentId.toHexString(),
      subjectType: reservation.subjectType,
      resourceId:
        reservation.resourceId?.toHexString() ??
        null,
      staffId:
        reservation.staffId?.toHexString() ??
        null,
      reservedStartAt:
        reservation.reservedStartAt,
      reservedEndAt:
        reservation.reservedEndAt,
    }));
  }

  public async saveAppointmentSchedule(input: {
    appointment: Record<string, unknown>;
    expectedAppointmentVersion: number | null;
    previousAppointmentId: string | null;
    reservations: readonly Record<string, unknown>[];
    releasedAt: Date;
    releasedByStaffId: string;
  }): Promise<{
    appointment: RadiologyAppointmentRecord;
    reservations:
      RadiologyResourceReservationRecord[];
  } | null> {
    const session =
      await RadiologyAppointmentModel.db.startSession();

    let appointment:
      | RadiologyAppointmentRecord
      | null = null;

    let reservations:
      RadiologyResourceReservationRecord[] = [];

    try {
      await session.withTransaction(async () => {
        if (input.previousAppointmentId === null) {
          const [created] =
            await RadiologyAppointmentModel.create(
              [input.appointment],
              {
                session,
              },
            );

          if (created === undefined) {
            throw new Error(
              'Radiology appointment was not created',
            );
          }

          appointment =
            record<RadiologyAppointmentRecord>(
              created.toObject(),
            );
        } else {
          const appointmentUpdate = {
            ...input.appointment,
          };

          for (const immutableKey of [
            '_id',
            'facilityId',
            'radiologyOrderId',
            'radiologyOrderItemId',
            'patientId',
            'encounterId',
            'procedureId',
            'modalityId',
            'departmentId',
            'transactionId',
            'correlationId',
            'schemaVersion',
            'version',
            'createdBy',
            'createdAt',
          ]) {
            delete appointmentUpdate[immutableKey];
          }

          const updated =
            await RadiologyAppointmentModel.findOneAndUpdate(
              {
                _id: toObjectId(
                  input.previousAppointmentId,
                  'previousAppointmentId',
                ),
                facilityId:
                  input.appointment['facilityId'],
                version:
                  input.expectedAppointmentVersion,
                status: {
                  $in: [
                    'SCHEDULED',
                    'CANCELLED',
                    'NO_SHOW',
                  ],
                },
              },
              {
                $set: appointmentUpdate,
                $inc: {
                  version: 1,
                },
              },
              {
                new: true,
                runValidators: true,
                session,
              },
            )
              .select(APPOINTMENT_SELECT)
              .lean()
              .exec();

          if (updated === null) {
            return;
          }

          appointment =
            record<RadiologyAppointmentRecord>(
              updated,
            );

          await RadiologyResourceReservationModel.updateMany(
            {
              facilityId:
                input.appointment['facilityId'],
              appointmentId: toObjectId(
                input.previousAppointmentId,
                'previousAppointmentId',
              ),
              status: 'ACTIVE',
            },
            {
              $set: {
                status: 'RELEASED',
                releasedAt: input.releasedAt,
                releasedByStaffId: toObjectId(
                  input.releasedByStaffId,
                  'releasedByStaffId',
                ),
                updatedBy:
                  input.appointment['updatedBy'],
              },
              $inc: {
                version: 1,
              },
            },
            {
              session,
              runValidators: true,
            },
          ).exec();
        }

        const documents =
          await RadiologyResourceReservationModel.insertMany(
            input.reservations,
            {
              session,
              ordered: true,
            },
          );

        reservations = record<
          RadiologyResourceReservationRecord[]
        >(
          documents.map((document) =>
            document.toObject(),
          ),
        );
      });
    } finally {
      await session.endSession();
    }

    return appointment === null
      ? null
      : {
          appointment,
          reservations,
        };
  }

  public async cancelAppointment(input: {
    facilityId: string;
    appointmentId: string;
    expectedVersion: number;
    cancelledAt: Date;
    cancelledByStaffId: string;
    cancelledByUserId: string;
    reason: string;
  }): Promise<RadiologyAppointmentRecord | null> {
    const session =
      await RadiologyAppointmentModel.db.startSession();

    let appointment:
      | RadiologyAppointmentRecord
      | null = null;

    try {
      await session.withTransaction(async () => {
        const updated =
          await RadiologyAppointmentModel.findOneAndUpdate(
            {
              _id: toObjectId(
                input.appointmentId,
                'appointmentId',
              ),
              facilityId: toObjectId(
                input.facilityId,
                'facilityId',
              ),
              version: input.expectedVersion,
              status: 'SCHEDULED',
            },
            {
              $set: {
                status: 'CANCELLED',
                cancelledAt: input.cancelledAt,
                cancelledByStaffId: toObjectId(
                  input.cancelledByStaffId,
                  'cancelledByStaffId',
                ),
                cancellationReason: input.reason,
                updatedBy: toObjectId(
                  input.cancelledByUserId,
                  'cancelledByUserId',
                ),
              },
              $inc: {
                version: 1,
              },
            },
            {
              new: true,
              runValidators: true,
              session,
            },
          )
            .select(APPOINTMENT_SELECT)
            .lean()
            .exec();

        if (updated === null) {
          return;
        }

        appointment =
          record<RadiologyAppointmentRecord>(
            updated,
          );

        await RadiologyResourceReservationModel.updateMany(
          {
            facilityId: toObjectId(
              input.facilityId,
              'facilityId',
            ),
            appointmentId: toObjectId(
              input.appointmentId,
              'appointmentId',
            ),
            status: 'ACTIVE',
          },
          {
            $set: {
              status: 'CANCELLED',
              releasedAt: input.cancelledAt,
              releasedByStaffId: toObjectId(
                input.cancelledByStaffId,
                'cancelledByStaffId',
              ),
              updatedBy: toObjectId(
                input.cancelledByUserId,
                'cancelledByUserId',
              ),
            },
            $inc: {
              version: 1,
            },
          },
          {
            session,
            runValidators: true,
          },
        ).exec();
      });
    } finally {
      await session.endSession();
    }

    return appointment;
  }

  public async findSafetyScreeningByOrderItem(
    facilityId: string,
    orderItemId: string,
  ): Promise<RadiologySafetyScreeningRecord | null> {
    return record<
      RadiologySafetyScreeningRecord | null
    >(
      await RadiologySafetyScreeningModel.findOne({
        facilityId: toObjectId(
          facilityId,
          'facilityId',
        ),
        radiologyOrderItemId: toObjectId(
          orderItemId,
          'orderItemId',
        ),
      })
        .select(SCREENING_SELECT)
        .lean()
        .exec(),
    );
  }

  public async saveSafetyScreening(
    input: Record<string, unknown>,
    expectedVersion: number | null,
  ): Promise<RadiologySafetyScreeningRecord | null> {
    if (expectedVersion === null) {
      const document =
        await RadiologySafetyScreeningModel.create(
          input,
        );

      return record<RadiologySafetyScreeningRecord>(
        document.toObject(),
      );
    }

    const screeningUpdate = {
      ...input,
    };

    for (const immutableKey of [
      '_id',
      'facilityId',
      'radiologyOrderId',
      'radiologyOrderItemId',
      'patientId',
      'encounterId',
      'requiredScreeningCodesSnapshot',
      'requirementsHash',
      'transactionId',
      'correlationId',
      'schemaVersion',
      'version',
      'createdBy',
      'createdAt',
    ]) {
      delete screeningUpdate[immutableKey];
    }

    return record<
      RadiologySafetyScreeningRecord | null
    >(
      await RadiologySafetyScreeningModel.findOneAndUpdate(
        {
          _id: input['_id'],
          facilityId: input['facilityId'],
          version: expectedVersion,
        },
        {
          $set: screeningUpdate,
          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
        .select(SCREENING_SELECT)
        .lean()
        .exec(),
    );
  }

  public async findExaminationByOrderItem(
    facilityId: string,
    orderItemId: string,
  ): Promise<RadiologyExaminationRecord | null> {
    return record<
      RadiologyExaminationRecord | null
    >(
      await RadiologyExaminationModel.findOne({
        facilityId: toObjectId(
          facilityId,
          'facilityId',
        ),
        radiologyOrderItemId: toObjectId(
          orderItemId,
          'orderItemId',
        ),
      })
        .select(EXAMINATION_SELECT)
        .lean()
        .exec(),
    );
  }

  public async createExamination(
    input: Record<string, unknown>,
  ): Promise<RadiologyExaminationRecord> {
    const document =
      await RadiologyExaminationModel.create(input);

    return record<RadiologyExaminationRecord>(
      document.toObject(),
    );
  }

  public async updateExamination(
    facilityId: string,
    examinationId: string,
    expectedVersion: number,
    update: Record<string, unknown>,
  ): Promise<RadiologyExaminationRecord | null> {
    return record<
      RadiologyExaminationRecord | null
    >(
      await RadiologyExaminationModel.findOneAndUpdate(
        {
          _id: toObjectId(
            examinationId,
            'examinationId',
          ),
          facilityId: toObjectId(
            facilityId,
            'facilityId',
          ),
          version: expectedVersion,
        },
        {
          $set: update,
          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
        .select(EXAMINATION_SELECT)
        .lean()
        .exec(),
    );
  }

  public async updateAppointmentOperationalStatus(
    facilityId: string,
    appointmentId: string,
    expectedVersion: number,
    update: Record<string, unknown>,
  ): Promise<RadiologyAppointmentRecord | null> {
    return record<
      RadiologyAppointmentRecord | null
    >(
      await RadiologyAppointmentModel.findOneAndUpdate(
        {
          _id: toObjectId(
            appointmentId,
            'appointmentId',
          ),
          facilityId: toObjectId(
            facilityId,
            'facilityId',
          ),
          version: expectedVersion,
        },
        {
          $set: update,
          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
        .select(APPOINTMENT_SELECT)
        .lean()
        .exec(),
    );
  }

  public async findImagingStudyByOrderItem(
    facilityId: string,
    orderItemId: string,
  ): Promise<RadiologyImagingStudyRecord | null> {
    return record<
      RadiologyImagingStudyRecord | null
    >(
      await RadiologyImagingStudyModel.findOne({
        facilityId: toObjectId(
          facilityId,
          'facilityId',
        ),
        radiologyOrderItemId: toObjectId(
          orderItemId,
          'orderItemId',
        ),
      })
        .select(STUDY_SELECT)
        .lean()
        .exec(),
    );
  }

  public async createImagingStudy(input: {
    study: Record<string, unknown>;
    series: readonly Record<string, unknown>[];
  }): Promise<{
    study: RadiologyImagingStudyRecord;
    series: RadiologyImagingSeriesRecord[];
  }> {
    const session =
      await RadiologyImagingStudyModel.db.startSession();

    let study:
      | RadiologyImagingStudyRecord
      | null = null;

    let series:
      RadiologyImagingSeriesRecord[] = [];

    try {
      await session.withTransaction(async () => {
        const [studyDocument] =
          await RadiologyImagingStudyModel.create(
            [input.study],
            {
              session,
            },
          );

        if (studyDocument === undefined) {
          throw new Error(
            'Radiology imaging study was not created',
          );
        }

        study =
          record<RadiologyImagingStudyRecord>(
            studyDocument.toObject(),
          );

        const seriesDocuments =
          await RadiologyImagingSeriesModel.insertMany(
            input.series,
            {
              session,
              ordered: true,
            },
          );

        series = record<
          RadiologyImagingSeriesRecord[]
        >(
          seriesDocuments.map((document) =>
            document.toObject(),
          ),
        );
      });
    } finally {
      await session.endSession();
    }

    if (study === null) {
      throw new Error(
        'Radiology imaging-study transaction did not complete',
      );
    }

    return {
      study,
      series,
    };
  }
}