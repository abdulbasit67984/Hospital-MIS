import type {
  FilterQuery,
} from 'mongoose';

import {
  FormularyItemModel,
  MedicationAdministrationAmendmentModel,
  MedicationAdministrationModel,
  MedicationScheduleModel,
  PrescriptionItemModel,
  PrescriptionModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  MedicationAdministrationHistoryQuery,
  MedicationDueBoardQuery,
  MedicationOrderTrace,
} from '../medication-administration.contracts.js';

import type {
  CreateMedicationAdministrationRecordInput,
  CreateMedicationScheduleRecordInput,
  MedicationAdministrationRecord,
  MedicationAdministrationRepositoryPort,
  MedicationScheduleRecord,
} from '../medication-administration.ports.js';

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

function scheduleRecord(
  value: MedicationScheduleRecord | null,
): MedicationScheduleRecord | null {
  return value;
}

function administrationRecord(
  value: MedicationAdministrationRecord | null,
): MedicationAdministrationRecord | null {
  return value;
}

function normalizeRoute(
  value: string,
): string {
  return value
    .trim()
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '');
}

function sameDecimal(
  left: unknown,
  right: unknown,
): boolean {
  return Number(String(left)) === Number(String(right));
}

export class MedicationAdministrationRepository
implements MedicationAdministrationRepositoryPort {
  public async createSchedule(
    input: CreateMedicationScheduleRecordInput,
  ): Promise<MedicationScheduleRecord> {
    const created =
      await MedicationScheduleModel.create(
        input,
      );

    return await MedicationScheduleModel.findById(
      created._id,
    )
      .select(
        SCHEDULE_SELECT,
      )
      .lean<MedicationScheduleRecord>()
      .orFail()
      .exec();
  }

  public async findScheduleById(
    facilityId: string,
    scheduleId: string,
  ): Promise<MedicationScheduleRecord | null> {
    return scheduleRecord(
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
        .lean<MedicationScheduleRecord>()
        .exec(),
    );
  }

  public async updateSchedule(
    facilityId: string,
    scheduleId: string,
    expectedVersion: number,
    allowedStatuses: readonly MedicationScheduleRecord['status'][],
    update: Record<string, unknown>,
  ): Promise<MedicationScheduleRecord | null> {
    return scheduleRecord(
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

          status: {
            $in:
              allowedStatuses,
          },
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
        .lean<MedicationScheduleRecord>()
        .exec(),
    );
  }

  public async listSchedulesForDueBoard(
    facilityId: string,
    query: MedicationDueBoardQuery,
  ): Promise<MedicationScheduleRecord[]> {
    const filter:
      FilterQuery<MedicationScheduleRecord> = {
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ) as never,

        status: {
          $in:
            query.includeHeld
              ? [
                  'ACTIVE',
                  'HELD',
                ]
              : [
                  'ACTIVE',
                ],
        },

        startAt: {
          $lte:
            new Date(
              query.dueUntil,
            ),
        },
      };

    if (
      query.admissionId != null
    ) {
      filter.admissionId =
        toObjectId(
          query.admissionId,
          'admissionId',
        ) as never;
    }

    if (
      query.wardId != null
    ) {
      filter.wardId =
        toObjectId(
          query.wardId,
          'wardId',
        ) as never;
    }

    return await MedicationScheduleModel.find(
      filter,
    )
      .select(
        SCHEDULE_SELECT,
      )
      .sort({
        nextScheduledAt:
          1,

        scheduleNumber:
          1,
      })
      .lean<MedicationScheduleRecord[]>()
      .exec();
  }

  public async listSchedulesForCompliance(
    facilityId: string,
    admissionId: string,
    from: Date,
    to: Date,
  ): Promise<MedicationScheduleRecord[]> {
    return await MedicationScheduleModel.find({
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

      startAt: {
        $lte:
          to,
      },

      $or: [
        {
          endAt:
            null,
        },
        {
          endAt: {
            $gte:
              from,
          },
        },
      ],

      status: {
        $in: [
          'ACTIVE',
          'HELD',
          'COMPLETED',
          'CANCELLED',
        ],
      },
    })
      .select(
        SCHEDULE_SELECT,
      )
      .sort({
        scheduleNumber:
          1,
      })
      .lean<MedicationScheduleRecord[]>()
      .exec();
  }

  public async createAdministration(
    input: CreateMedicationAdministrationRecordInput,
  ): Promise<MedicationAdministrationRecord> {
    const created =
      await MedicationAdministrationModel.create(
        input,
      );

    return await MedicationAdministrationModel.findById(
      created._id,
    )
      .select(
        ADMINISTRATION_SELECT,
      )
      .lean<MedicationAdministrationRecord>()
      .orFail()
      .exec();
  }

  public async findAdministrationById(
    facilityId: string,
    administrationId: string,
  ): Promise<MedicationAdministrationRecord | null> {
    return administrationRecord(
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
        .lean<MedicationAdministrationRecord>()
        .exec(),
    );
  }

  public async findCurrentAdministrationForDose(
    facilityId: string,
    scheduleId: string,
    scheduledAt: Date,
  ): Promise<MedicationAdministrationRecord | null> {
    return administrationRecord(
      await MedicationAdministrationModel.findOne({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        medicationScheduleId:
          toObjectId(
            scheduleId,
            'scheduleId',
          ),

        scheduledAt,

        supersededByAdministrationId:
          null,
      })
        .select(
          ADMINISTRATION_SELECT,
        )
        .sort({
          createdAt:
            -1,
        })
        .lean<MedicationAdministrationRecord>()
        .exec(),
    );
  }

  public async findDelayedAdministrationByRevisedTime(
    facilityId: string,
    scheduleId: string,
    delayedUntil: Date,
  ): Promise<MedicationAdministrationRecord | null> {
    return administrationRecord(
      await MedicationAdministrationModel.findOne({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        medicationScheduleId:
          toObjectId(
            scheduleId,
            'scheduleId',
          ),

        status:
          'DELAYED',

        delayedUntil,

        supersededByAdministrationId:
          null,
      })
        .select(
          ADMINISTRATION_SELECT,
        )
        .sort({
          createdAt:
            -1,
        })
        .lean<MedicationAdministrationRecord>()
        .exec(),
    );
  }

  public async updateAdministration(
    facilityId: string,
    administrationId: string,
    expectedVersion: number,
    update: Record<string, unknown>,
  ): Promise<MedicationAdministrationRecord | null> {
    return administrationRecord(
      await MedicationAdministrationModel.findOneAndUpdate(
        {
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
          ADMINISTRATION_SELECT,
        )
        .lean<MedicationAdministrationRecord>()
        .exec(),
    );
  }

  public async createAmendment(
    input: Parameters<
      MedicationAdministrationRepositoryPort['createAmendment']
    >[0],
  ): Promise<string> {
    const created =
      await MedicationAdministrationAmendmentModel.create(
        input,
      );

    return created._id.toHexString();
  }

  public async listAdministrations(
    facilityId: string,
    query: MedicationAdministrationHistoryQuery,
  ): Promise<{
    items: MedicationAdministrationRecord[];
    total: number;
  }> {
    const filter:
      FilterQuery<MedicationAdministrationRecord> = {
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ) as never,

        admissionId:
          toObjectId(
            query.admissionId,
            'admissionId',
          ) as never,
      };

    if (
      query.medicationScheduleId != null
    ) {
      filter.medicationScheduleId =
        toObjectId(
          query.medicationScheduleId,
          'medicationScheduleId',
        ) as never;
    }

    if (
      query.status != null
    ) {
      filter.status =
        query.status;
    }

    if (
      query.scheduledFrom != null ||
      query.scheduledTo != null
    ) {
      filter.scheduledAt =
        {} as never;

      const range =
        filter.scheduledAt as unknown as {
          $gte?: Date;
          $lte?: Date;
        };

      if (
        query.scheduledFrom != null
      ) {
        range.$gte =
          new Date(
            query.scheduledFrom,
          );
      }

      if (
        query.scheduledTo != null
      ) {
        range.$lte =
          new Date(
            query.scheduledTo,
          );
      }
    }

    const [
      items,
      total,
    ] = await Promise.all([
      MedicationAdministrationModel.find(
        filter,
      )
        .select(
          ADMINISTRATION_SELECT,
        )
        .sort({
          scheduledAt:
            -1,

          createdAt:
            -1,
        })
        .skip(
          (
            query.page - 1
          ) *
            query.pageSize,
        )
        .limit(
          query.pageSize,
        )
        .lean<MedicationAdministrationRecord[]>()
        .exec(),

      MedicationAdministrationModel.countDocuments(
        filter,
      ).exec(),
    ]);

    return {
      items,
      total,
    };
  }

  public async listCurrentAdministrationsForSchedules(
    facilityId: string,
    scheduleIds: readonly string[],
    from: Date,
    to: Date,
  ): Promise<MedicationAdministrationRecord[]> {
    if (
      scheduleIds.length ===
      0
    ) {
      return [];
    }

    return await MedicationAdministrationModel.find({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      medicationScheduleId: {
        $in:
          scheduleIds.map(
            (scheduleId) =>
              toObjectId(
                scheduleId,
                'scheduleId',
              ),
          ),
      },

      scheduledAt: {
        $gte:
          from,

        $lte:
          to,
      },

      supersededByAdministrationId:
        null,
    })
      .select(
        ADMINISTRATION_SELECT,
      )
      .sort({
        scheduledAt:
          1,

        createdAt:
          1,
      })
      .lean<MedicationAdministrationRecord[]>()
      .exec();
  }

  public async resolveOrderTrace(
    schedule: MedicationScheduleRecord,
  ): Promise<MedicationOrderTrace> {
    const blockingReasons:
      string[] = [];

    const formulary =
      schedule.formularyItemId == null
        ? null
        : await FormularyItemModel.findOne({
            _id:
              schedule.formularyItemId,

            facilityId:
              schedule.facilityId,
          })
            .select(
              '_id medicineId status highAlert controlledMedicine effectiveFrom effectiveUntil',
            )
            .lean<{
              medicineId: {
                toHexString(): string;
              };
              status: string;
              highAlert: boolean;
              controlledMedicine: boolean;
              effectiveFrom: Date;
              effectiveUntil: Date | null;
            }>()
            .exec();

    if (
      formulary != null &&
      formulary.medicineId.toHexString() !==
        schedule.medicineId.toHexString()
    ) {
      blockingReasons.push(
        'The formulary item no longer references the scheduled medicine',
      );
    }

    if (
      formulary != null &&
      formulary.status !==
        'ACTIVE'
    ) {
      blockingReasons.push(
        'The formulary item is not active',
      );
    }

    if (
      schedule.source !==
        'PRESCRIPTION'
    ) {
      return {
        valid:
          blockingReasons.length ===
          0,

        prescriptionStatus:
          null,

        prescriptionItemStatus:
          null,

        highAlert:
          formulary?.highAlert ??
          false,

        controlledMedicine:
          formulary?.controlledMedicine ??
          false,

        blockingReasons,
      };
    }

    if (
      schedule.prescriptionId == null ||
      schedule.prescriptionItemId == null
    ) {
      return {
        valid:
          false,

        prescriptionStatus:
          null,

        prescriptionItemStatus:
          null,

        highAlert:
          formulary?.highAlert ??
          false,

        controlledMedicine:
          formulary?.controlledMedicine ??
          false,

        blockingReasons: [
          ...blockingReasons,
          'Prescription schedule is missing its prescription trace',
        ],
      };
    }

    const [
      prescription,
      item,
    ] = await Promise.all([
      PrescriptionModel.findOne({
        _id:
          schedule.prescriptionId,

        facilityId:
          schedule.facilityId,
      })
        .select(
          '_id patientId encounterId status expiresAt supersededByPrescriptionId unresolvedBlockingWarningCount',
        )
        .lean<{
          patientId: {
            toHexString(): string;
          };
          encounterId: {
            toHexString(): string;
          };
          status: string;
          expiresAt: Date | null;
          supersededByPrescriptionId: unknown;
          unresolvedBlockingWarningCount: number;
        }>()
        .exec(),

      PrescriptionItemModel.findOne({
        _id:
          schedule.prescriptionItemId,

        prescriptionId:
          schedule.prescriptionId,

        facilityId:
          schedule.facilityId,
      })
        .select(
          '_id patientId encounterId formularyItemId medicineId dose doseUnitSnapshot routeSnapshot status asNeeded',
        )
        .lean<{
          patientId: {
            toHexString(): string;
          };
          encounterId: {
            toHexString(): string;
          };
          formularyItemId: {
            toHexString(): string;
          };
          medicineId: {
            toHexString(): string;
          };
          dose: unknown;
          doseUnitSnapshot: string;
          routeSnapshot: string;
          status: string;
          asNeeded: boolean;
        }>()
        .exec(),
    ]);

    if (
      prescription == null
    ) {
      blockingReasons.push(
        'The linked prescription was not found',
      );
    } else {
      if (
        ![
          'ISSUED',
          'PARTIALLY_DISPENSED',
          'DISPENSED',
        ].includes(
          prescription.status,
        )
      ) {
        blockingReasons.push(
          `Prescription status ${prescription.status} does not permit administration`,
        );
      }

      if (
        prescription.patientId.toHexString() !==
        schedule.patientId.toHexString()
      ) {
        blockingReasons.push(
          'The prescription belongs to another patient',
        );
      }

      if (
        prescription.encounterId.toHexString() !==
        schedule.encounterId.toHexString()
      ) {
        blockingReasons.push(
          'The prescription belongs to another encounter',
        );
      }

      if (
        prescription.expiresAt != null &&
        prescription.expiresAt <
          new Date()
      ) {
        blockingReasons.push(
          'The prescription has expired',
        );
      }

      if (
        prescription.supersededByPrescriptionId != null
      ) {
        blockingReasons.push(
          'The prescription has been superseded',
        );
      }

      if (
        prescription.unresolvedBlockingWarningCount >
        0
      ) {
        blockingReasons.push(
          'The prescription has unresolved blocking safety warnings',
        );
      }
    }

    if (
      item == null
    ) {
      blockingReasons.push(
        'The linked prescription item was not found',
      );
    } else {
      if (
        item.status !==
        'ACTIVE'
      ) {
        blockingReasons.push(
          `Prescription item status ${item.status} does not permit administration`,
        );
      }

      if (
        item.patientId.toHexString() !==
        schedule.patientId.toHexString() ||
        item.encounterId.toHexString() !==
        schedule.encounterId.toHexString()
      ) {
        blockingReasons.push(
          'The prescription item clinical context does not match the schedule',
        );
      }

      if (
        item.medicineId.toHexString() !==
        schedule.medicineId.toHexString()
      ) {
        blockingReasons.push(
          'The prescription item medicine does not match the schedule',
        );
      }

      if (
        schedule.formularyItemId != null &&
        item.formularyItemId.toHexString() !==
          schedule.formularyItemId.toHexString()
      ) {
        blockingReasons.push(
          'The prescription item formulary selection does not match the schedule',
        );
      }

      if (
        !sameDecimal(
          item.dose,
          schedule.prescribedDose,
        )
      ) {
        blockingReasons.push(
          'The prescription dose does not match the schedule',
        );
      }

      if (
        normalizeRoute(
          item.routeSnapshot,
        ) !==
        normalizeRoute(
          schedule.route,
        )
      ) {
        blockingReasons.push(
          'The prescription route does not match the schedule',
        );
      }

      if (
        item.asNeeded !==
        schedule.prn
      ) {
        blockingReasons.push(
          'The prescription PRN setting does not match the schedule',
        );
      }
    }

    return {
      valid:
        blockingReasons.length ===
        0,

      prescriptionStatus:
        prescription?.status ??
        null,

      prescriptionItemStatus:
        item?.status ??
        null,

      highAlert:
        formulary?.highAlert ??
        false,

      controlledMedicine:
        formulary?.controlledMedicine ??
        false,

      blockingReasons,
    };
  }
}