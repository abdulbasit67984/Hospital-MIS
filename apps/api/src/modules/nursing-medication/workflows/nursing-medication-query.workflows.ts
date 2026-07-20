import {
  ConflictError,
} from '@hospital-mis/shared';

import type {
  MedicationAdministrationListQuery,
  MedicationComplianceQuery,
  MedicationDueDoseView,
  MedicationScheduleListQuery,
  NursingMarCommand,
} from '../nursing-mar.contracts.js';

import {
  projectMedicationAdministration,
  projectMedicationSchedule,
} from '../nursing-mar.projections.js';

import {
  medicationAdministrationListQuerySchema,
  medicationComplianceQuerySchema,
  medicationScheduleListQuerySchema,
} from '../nursing-mar.validation.js';

import {
  NursingMarCommandService,
} from '../services/nursing-mar-command.service.js';

function dueState(
  now:
    Date,

  scheduledAt:
    Date,

  administration:
    ReturnType<
      typeof projectMedicationAdministration
    > | null,
): MedicationDueDoseView['dueState'] {
  if (
    administration !==
      null &&
    [
      'ADMINISTERED',
      'OMITTED',
      'REFUSED',
      'CANCELLED',
    ].includes(
      administration.status,
    )
  ) {
    return 'COMPLETED';
  }

  const effectiveDueAt =
    administration?.status ===
      'DELAYED' &&
    administration.delayedUntil !==
      null
      ? new Date(
          administration.delayedUntil,
        )
      : scheduledAt;

  if (
    effectiveDueAt >
    now
  ) {
    return 'UPCOMING';
  }

  if (
    now.getTime() -
      effectiveDueAt.getTime() <=
    60 *
      60 *
      1_000
  ) {
    return 'DUE';
  }

  return 'OVERDUE';
}

export class ListMedicationSchedulesWorkflow {
  public constructor(
    private readonly service:
      NursingMarCommandService,
  ) {}

  public async execute(
    actor:
      NursingMarCommand<unknown>['actor'],

    query:
      MedicationScheduleListQuery,
  ) {
    const parsed =
      medicationScheduleListQuerySchema.parse(
        query,
      );

    if (
      parsed.admissionId ===
      undefined
    ) {
      throw new ConflictError(
        'Medication schedule queries require an admissionId for minimum-necessary access',
      );
    }

    const context =
      await this.service.support.resolveAdmission(
        actor,
        parsed.admissionId,
      );

    await this.service.support.assertAccess(
      'MEDICATION_SCHEDULE_READ',
      actor,
      context,
    );

    const page =
      await this.service.repository.listSchedules(
        actor.facilityId,
        parsed,
      );

    return {
      ...page,

      items:
        page.items.map(
          projectMedicationSchedule,
        ),
    };
  }
}

export class ListMedicationAdministrationHistoryWorkflow {
  public constructor(
    private readonly service:
      NursingMarCommandService,
  ) {}

  public async execute(
    actor:
      NursingMarCommand<unknown>['actor'],

    query:
      MedicationAdministrationListQuery,
  ) {
    const parsed =
      medicationAdministrationListQuerySchema.parse(
        query,
      );

    const context =
      await this.service.support.resolveAdmission(
        actor,
        parsed.admissionId,
      );

    await this.service.support.assertAccess(
      'MEDICATION_SCHEDULE_READ',
      actor,
      context,
    );

    const page =
      await this.service.repository.listAdministrations(
        actor.facilityId,
        parsed,
      );

    return {
      ...page,

      items:
        page.items.map(
          projectMedicationAdministration,
        ),
    };
  }
}

export class GetMedicationDueBoardWorkflow {
  public constructor(
    private readonly service:
      NursingMarCommandService,
  ) {}

  public async execute(
    actor:
      NursingMarCommand<unknown>['actor'],

    input: Readonly<{
      admissionId: string;
      from: string;
      to: string;
    }>,
  ): Promise<MedicationDueDoseView[]> {
    const range =
      medicationComplianceQuerySchema.parse(
        input,
      );

    const context =
      await this.service.support.resolveAdmission(
        actor,
        range.admissionId,
      );

    await this.service.support.assertAccess(
      'MEDICATION_SCHEDULE_READ',
      actor,
      context,
    );

    const schedules =
      await this.service.repository.listSchedules(
        actor.facilityId,
        {
          admissionId:
            range.admissionId,

          status:
            'ACTIVE',

          page:
            1,

          pageSize:
            100,
        },
      );

    const administrations =
      await this.service.repository.listAdministrations(
        actor.facilityId,
        {
          admissionId:
            range.admissionId,

          scheduledFrom:
            range.from,

          scheduledTo:
            range.to,

          page:
            1,

          pageSize:
            200,
        },
      );

    const administrationByDose =
      new Map(
        administrations.items.map(
          (record) => [
            `${record.medicationScheduleId.toHexString()}:${record.scheduledAt.toISOString()}`,

            projectMedicationAdministration(
              record,
            ),
          ],
        ),
      );

    const from =
      new Date(
        range.from,
      );

    const to =
      new Date(
        range.to,
      );

    const now =
      this.service.support.dependencies
        .clock.now();

    return schedules.items
      .flatMap(
        (schedule) =>
          schedule.scheduledTimes
            .filter(
              (scheduledAt) =>
                scheduledAt >= from &&
                scheduledAt < to,
            )
            .map(
              (scheduledAt) => {
                const currentAdministration =
                  administrationByDose.get(
                    `${schedule._id.toHexString()}:${scheduledAt.toISOString()}`,
                  ) ?? null;

                return {
                  schedule:
                    projectMedicationSchedule(
                      schedule,
                    ),

                  scheduledAt:
                    scheduledAt.toISOString(),

                  currentAdministration,

                  dueState:
                    dueState(
                      now,
                      scheduledAt,
                      currentAdministration,
                    ),
                };
              },
            ),
      )
      .sort(
        (left, right) =>
          left.scheduledAt.localeCompare(
            right.scheduledAt,
          ),
      );
  }
}

export class GetMedicationComplianceWorkflow {
  public constructor(
    private readonly service:
      NursingMarCommandService,
  ) {}

  public async execute(
    actor:
      NursingMarCommand<unknown>['actor'],

    query:
      MedicationComplianceQuery,
  ) {
    const parsed =
      medicationComplianceQuerySchema.parse(
        query,
      );

    const context =
      await this.service.support.resolveAdmission(
        actor,
        parsed.admissionId,
      );

    await this.service.support.assertAccess(
      'REPORT_READ',
      actor,
      context,
    );

    const counts =
      await this.service.repository.medicationCompliance(
        actor.facilityId,
        parsed.admissionId,
        new Date(
          parsed.from,
        ),
        new Date(
          parsed.to,
        ),
      );

    const compliancePercent =
      counts.scheduled ===
      0
        ? '0.00'
        : (
            counts.administered /
            counts.scheduled *
            100
          ).toFixed(2);

    return {
      admissionId:
        parsed.admissionId,

      from:
        parsed.from,

      to:
        parsed.to,

      ...counts,

      compliancePercent,
    };
  }
}