import {
  MedicationAdministrationAmendmentModel,
  MedicationAdministrationModel,
  MedicationScheduleModel,
  NursingNoteModel,
  NursingNoteVersionModel,
  WardHandoverModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  MedicationAdministrationRecord,
  MedicationScheduleRecord,
  NursingNoteRecord,
  NursingRepositoryPort,
  WardHandoverRecord,
} from '../inpatient-nursing.contracts.js';

function record<T>(
  value:
    unknown,
): T {
  return value as T;
}

const NURSING_NOTE_SELECT = [
  '_id',
  'facilityId',
  'admissionId',
  'patientId',
  'encounterId',
  'wardId',
  'roomId',
  'bedId',
  'noteNumber',
  'noteType',
  'observationSeverity',
  'title',
  '+content',
  'intakeOutput',
  'requiresEscalation',
  'escalationRecipientStaffId',
  'escalatedAt',
  'acknowledgedAt',
  'acknowledgedByStaffId',
  'recordedAt',
  'recordedByUserId',
  'recordedByStaffId',
  'status',
  'revisionNumber',
  'rootNursingNoteId',
  'supersedesNursingNoteId',
  'supersededByNursingNoteId',
  'version',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const SCHEDULE_SELECT = [
  '_id',
  'facilityId',
  'admissionId',
  'patientId',
  'encounterId',
  'wardId',
  'roomId',
  'bedId',
  'scheduleNumber',
  'prescriptionId',
  'prescriptionItemId',
  'source',
  'medicineId',
  'formularyItemId',
  'medicineDisplay',
  'prescribedDose',
  'doseUnitCode',
  'route',
  'frequencyCode',
  'scheduledTimes',
  'prn',
  '+prnIndication',
  'startAt',
  'endAt',
  'status',
  '+holdReason',
  'orderedByUserId',
  'orderedByStaffId',
  'lastAdministrationAt',
  'nextScheduledAt',
  'version',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const ADMINISTRATION_SELECT = [
  '_id',
  'facilityId',
  'admissionId',
  'patientId',
  'encounterId',
  'wardId',
  'roomId',
  'bedId',
  'administrationNumber',
  'medicationScheduleId',
  'prescriptionId',
  'prescriptionItemId',
  'medicineId',
  'medicineDisplaySnapshot',
  'scheduledAt',
  'status',
  'prescribedDose',
  'administeredDose',
  'doseUnitCode',
  'prescribedRoute',
  'administeredRoute',
  'administeredAt',
  'administeringNurseUserId',
  'administeringNurseStaffId',
  'reasonCode',
  '+reason',
  '+notes',
  'delayedUntil',
  'statusChangedAt',
  'statusChangedBy',
  'correctionOfAdministrationId',
  'supersededByAdministrationId',
  'version',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const HANDOVER_SELECT = [
  '_id',
  'facilityId',
  'admissionId',
  'patientId',
  'encounterId',
  'wardId',
  'roomId',
  'bedId',
  'handoverNumber',
  'handoverType',
  'shiftCode',
  '+summary',
  '+activeConcerns',
  '+pendingTasks',
  '+medicationConcerns',
  '+safetyConcerns',
  'fromNurseUserId',
  'fromNurseStaffId',
  'toNurseUserId',
  'toNurseStaffId',
  'handedOverAt',
  'status',
  'signedAt',
  'acknowledgedAt',
  'acknowledgedByUserId',
  'acknowledgedByStaffId',
  'supersedesWardHandoverId',
  'supersededByWardHandoverId',
  'version',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

export class InpatientNursingRepository
implements NursingRepositoryPort {
  public async createNursingNote(
    input:
      Omit<
        NursingNoteRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<NursingNoteRecord> {
    const created =
      await NursingNoteModel.create(
        input,
      );

    return record<NursingNoteRecord>(
      await NursingNoteModel.findById(
        created._id,
      )
        .select(
          NURSING_NOTE_SELECT,
        )
        .lean()
        .orFail()
        .exec(),
    );
  }

  public async findNursingNote(
    facilityId:
      string,

    nursingNoteId:
      string,
  ): Promise<NursingNoteRecord | null> {
    return record<NursingNoteRecord | null>(
      await NursingNoteModel.findOne({
        _id:
          toObjectId(
            nursingNoteId,
            'nursingNoteId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          NURSING_NOTE_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async correctNursingNote(
    facilityId:
      string,

    nursingNoteId:
      string,

    expectedVersion:
      number,

    replacementId:
      string,

    occurredAt:
      Date,

    actorUserId:
      string,

    reason:
      string,
  ): Promise<NursingNoteRecord | null> {
    return record<NursingNoteRecord | null>(
      await NursingNoteModel.findOneAndUpdate(
        {
          _id:
            toObjectId(
              nursingNoteId,
              'nursingNoteId',
            ),

          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          version:
            expectedVersion,

          status:
            'ACTIVE',
        },

        {
          $set: {
            status:
              'CORRECTED',

            supersededByNursingNoteId:
              toObjectId(
                replacementId,
                'replacementId',
              ),

            correctedAt:
              occurredAt,

            correctedBy:
              toObjectId(
                actorUserId,
                'actorUserId',
              ),

            correctionReason:
              reason,

            updatedBy:
              toObjectId(
                actorUserId,
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
          NURSING_NOTE_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async createNursingNoteVersion(
    input:
      Record<string, unknown>,
  ): Promise<void> {
    await NursingNoteVersionModel.create(
      input,
    );
  }

  public async createMedicationSchedule(
    input:
      Omit<
        MedicationScheduleRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<MedicationScheduleRecord> {
    const created =
      await MedicationScheduleModel.create(
        input,
      );

    return record<MedicationScheduleRecord>(
      await MedicationScheduleModel.findById(
        created._id,
      )
        .select(
          SCHEDULE_SELECT,
        )
        .lean()
        .orFail()
        .exec(),
    );
  }

  public async findMedicationSchedule(
    facilityId:
      string,

    scheduleId:
      string,
  ): Promise<MedicationScheduleRecord | null> {
    return record<MedicationScheduleRecord | null>(
      await MedicationScheduleModel.findOne({
        _id:
          toObjectId(
            scheduleId,
            'scheduleId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          SCHEDULE_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async updateMedicationSchedule(
    facilityId:
      string,

    scheduleId:
      string,

    expectedVersion:
      number,

    update:
      Record<string, unknown>,
  ): Promise<MedicationScheduleRecord | null> {
    return record<MedicationScheduleRecord | null>(
      await MedicationScheduleModel.findOneAndUpdate(
        {
          _id:
            toObjectId(
              scheduleId,
              'scheduleId',
            ),

          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          version:
            expectedVersion,
        },

        {
          $set:
            update,

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
          SCHEDULE_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async createMedicationAdministration(
    input:
      Omit<
        MedicationAdministrationRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<MedicationAdministrationRecord> {
    const created =
      await MedicationAdministrationModel.create(
        input,
      );

    return record<MedicationAdministrationRecord>(
      await MedicationAdministrationModel.findById(
        created._id,
      )
        .select(
          ADMINISTRATION_SELECT,
        )
        .lean()
        .orFail()
        .exec(),
    );
  }

  public async findMedicationAdministration(
    facilityId:
      string,

    administrationId:
      string,
  ): Promise<MedicationAdministrationRecord | null> {
    return record<
      MedicationAdministrationRecord | null
    >(
      await MedicationAdministrationModel.findOne({
        _id:
          toObjectId(
            administrationId,
            'administrationId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          ADMINISTRATION_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async createMedicationAdministrationAmendment(
    input:
      Record<string, unknown>,
  ): Promise<void> {
    await MedicationAdministrationAmendmentModel.create(
      input,
    );
  }

  public async createWardHandover(
    input:
      Omit<
        WardHandoverRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<WardHandoverRecord> {
    const created =
      await WardHandoverModel.create(
        input,
      );

    return record<WardHandoverRecord>(
      await WardHandoverModel.findById(
        created._id,
      )
        .select(
          HANDOVER_SELECT,
        )
        .lean()
        .orFail()
        .exec(),
    );
  }

  public async findWardHandover(
    facilityId:
      string,

    handoverId:
      string,
  ): Promise<WardHandoverRecord | null> {
    return record<WardHandoverRecord | null>(
      await WardHandoverModel.findOne({
        _id:
          toObjectId(
            handoverId,
            'handoverId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          HANDOVER_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async acknowledgeWardHandover(
    facilityId:
      string,

    handoverId:
      string,

    expectedVersion:
      number,

    actorUserId:
      string,

    actorStaffId:
      string,

    occurredAt:
      Date,
  ): Promise<WardHandoverRecord | null> {
    return record<WardHandoverRecord | null>(
      await WardHandoverModel.findOneAndUpdate(
        {
          _id:
            toObjectId(
              handoverId,
              'handoverId',
            ),

          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          version:
            expectedVersion,

          status:
            'SIGNED',

          toNurseUserId:
            toObjectId(
              actorUserId,
              'actorUserId',
            ),

          toNurseStaffId:
            toObjectId(
              actorStaffId,
              'actorStaffId',
            ),
        },

        {
          $set: {
            status:
              'ACKNOWLEDGED',

            acknowledgedAt:
              occurredAt,

            acknowledgedByUserId:
              toObjectId(
                actorUserId,
                'actorUserId',
              ),

            acknowledgedByStaffId:
              toObjectId(
                actorStaffId,
                'actorStaffId',
              ),

            updatedBy:
              toObjectId(
                actorUserId,
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
          HANDOVER_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async medicationCompliance(
    facilityId:
      string,

    admissionId:
      string,

    from:
      Date,

    to:
      Date,
  ) {
    const result =
      await MedicationAdministrationModel.aggregate<{
        _id:
          string;

        count:
          number;
      }>([
        {
          $match: {
            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),

            admissionId:
              toObjectId(
                admissionId,
                'admissionId',
              ),

            scheduledAt: {
              $gte:
                from,

              $lte:
                to,
            },

            correctionOfAdministrationId:
              null,
          },
        },
        {
          $group: {
            _id:
              '$status',

            count: {
              $sum:
                1,
            },
          },
        },
      ]);

    const counts =
      new Map(
        result.map(
          (row) => [
            row._id,
            row.count,
          ],
        ),
      );

    const administered =
      counts.get(
        'ADMINISTERED',
      ) ?? 0;

    const omitted =
      counts.get(
        'OMITTED',
      ) ?? 0;

    const refused =
      counts.get(
        'REFUSED',
      ) ?? 0;

    const delayed =
      counts.get(
        'DELAYED',
      ) ?? 0;

    const cancelled =
      counts.get(
        'CANCELLED',
      ) ?? 0;

    return {
      scheduled:
        administered +
        omitted +
        refused +
        delayed +
        cancelled,

      administered,
      omitted,
      refused,
      delayed,
      cancelled,
    };
  }
}