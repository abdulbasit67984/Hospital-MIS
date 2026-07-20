import {
  BadRequestError,
  ConflictError,
} from '@hospital-mis/shared';

import type {
  NursingAdmissionContext,
  NursingMedicationActorContext,
} from '../nursing-medication.contracts.js';

import type {
  MedicationIndependentDoubleCheckInput,
  MedicationOrderTrace,
  RecordMedicationAdministrationInput,
} from '../medication-administration.contracts.js';

import type {
  MedicationScheduleRecord,
  MedicationTimingPolicy,
  MedicationTimingPolicyPort,
} from '../medication-administration.ports.js';

function normalized(
  value: string,
): string {
  return value
    .normalize('NFKC')
    .trim()
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]+/gu, ' ')
    .replaceAll(/\s+/gu, ' ');
}

function decimalEquals(
  left: string,
  right: unknown,
): boolean {
  return Number(left) ===
    Number(String(right));
}

function allergyValues(
  allergy: unknown,
): string[] {
  if (
    typeof allergy !==
      'object' ||
    allergy ===
      null
  ) {
    return [];
  }

  const record =
    allergy as Record<string, unknown>;

  return [
    record.medicineId,
    record.allergenText,
    record.display,
    record.genericName,
    record.allergyId,
  ]
    .filter(
      (value): value is string =>
        typeof value ===
          'string' &&
        value.trim().length >
          0,
    )
    .map(
      normalized,
    );
}

function assertPatientConfirmation(
  context: NursingAdmissionContext,
  input: RecordMedicationAdministrationInput,
): void {
  if (
    input.patientConfirmation.patientId !==
    context.patient.patientId
  ) {
    throw new ConflictError(
      'Medication administration patient confirmation failed',
    );
  }

  if (
    normalized(
      input.patientConfirmation.mrn,
    ) !==
    normalized(
      context.patient.mrn,
    )
  ) {
    throw new ConflictError(
      'Medication administration MRN confirmation failed',
    );
  }

  const expectedBirthDate =
    context.patient.birthDate ??
    null;

  if (
    input.patientConfirmation.birthDate !==
    expectedBirthDate
  ) {
    throw new ConflictError(
      'Medication administration birth-date confirmation failed',
    );
  }
}

function assertIndependentDoubleCheck(
  actor: NursingMedicationActorContext,
  check: MedicationIndependentDoubleCheckInput | null | undefined,
  now: Date,
  policy: MedicationTimingPolicy,
): void {
  if (
    check == null
  ) {
    throw new ConflictError(
      'High-alert medication administration requires an independent double-check',
    );
  }

  if (
    check.performedByUserId ===
    actor.userId
  ) {
    throw new ConflictError(
      'The independent double-check must be performed by another user',
    );
  }

  const confirmedAt =
    new Date(
      check.confirmedAt,
    );

  const ageMilliseconds =
    Math.abs(
      now.getTime() -
      confirmedAt.getTime(),
    );

  if (
    ageMilliseconds >
    policy.doubleCheckMaximumAgeMinutes *
      60 *
      1_000
  ) {
    throw new ConflictError(
      'The high-alert independent double-check is stale',
    );
  }
}

export class DefaultMedicationTimingPolicy
implements MedicationTimingPolicyPort {
  public constructor(
    private readonly reader?: Readonly<{
      find(
        facilityId: string,
        wardId: string,
        route: string,
      ): Promise<MedicationTimingPolicy | null>;
    }>,
  ) {}

  public async resolve(
    facilityId: string,
    wardId: string,
    route: MedicationScheduleRecord['route'],
  ): Promise<MedicationTimingPolicy> {
    return (
      await this.reader?.find(
        facilityId,
        wardId,
        route,
      )
    ) ?? {
      earlyWindowMinutes:
        route ===
        'INTRAVENOUS'
          ? 15
          : 30,

      lateWindowMinutes:
        route ===
        'INTRAVENOUS'
          ? 30
          : 60,

      highAlertEarlyWindowMinutes:
        15,

      highAlertLateWindowMinutes:
        30,

      doubleCheckMaximumAgeMinutes:
        15,
    };
  }
}

export class MedicationSafetyPolicyService {
  public constructor(
    private readonly timing:
      MedicationTimingPolicyPort,
  ) {}

  public async assertScheduleMayBeUsed(
    schedule: MedicationScheduleRecord,
    orderTrace: MedicationOrderTrace,
  ): Promise<void> {
    if (
      schedule.status !==
      'ACTIVE'
    ) {
      throw new ConflictError(
        `Medication schedule is ${schedule.status.toLowerCase()}`,
      );
    }

    if (
      !orderTrace.valid
    ) {
      throw new ConflictError(
        orderTrace.blockingReasons.join(
          '; ',
        ),
      );
    }
  }

  public async validateAdministration(
    input: Readonly<{
      actor: NursingMedicationActorContext;
      context: NursingAdmissionContext;
      schedule: MedicationScheduleRecord;
      orderTrace: MedicationOrderTrace;
      command: RecordMedicationAdministrationInput;
      now: Date;
      delayedSourceExists: boolean;
    }>,
  ): Promise<MedicationTimingPolicy> {
    await this.assertScheduleMayBeUsed(
      input.schedule,
      input.orderTrace,
    );

    assertPatientConfirmation(
      input.context,
      input.command,
    );

    const scheduledAt =
      new Date(
        input.command.scheduledAt,
      );

    if (
      scheduledAt <
      input.schedule.startAt ||
      (
        input.schedule.endAt != null &&
        scheduledAt >
          input.schedule.endAt
      )
    ) {
      throw new ConflictError(
        'The requested dose falls outside the medication schedule interval',
      );
    }

    if (
      !input.schedule.prn &&
      !input.delayedSourceExists &&
      !input.schedule.scheduledTimes.some(
        (value) =>
          value.getTime() ===
          scheduledAt.getTime(),
      )
    ) {
      throw new ConflictError(
        'The requested dose is not a valid scheduled dose slot',
      );
    }

    if (
      input.schedule.prn &&
      input.command.indicationConfirmed !==
      true
    ) {
      throw new BadRequestError(
        'PRN administration requires indication confirmation',
      );
    }

    const allergyTokens =
      (
        input.context.allergies as
        readonly unknown[]
      )
        .flatMap(
          allergyValues,
        );

    const medicineId =
      normalized(
        input.schedule.medicineId.toHexString(),
      );

    const medicineDisplay =
      normalized(
        input.schedule.medicineDisplay,
      );

    if (
      allergyTokens.some(
        (value) =>
          value ===
            medicineId ||
          (
            value.length >=
              4 &&
            medicineDisplay.includes(
              value,
            )
          ),
      )
    ) {
      throw new ConflictError(
        'An active patient allergy conflicts with the scheduled medication',
      );
    }

    const policy =
      await this.timing.resolve(
        input.context.facilityId,
        input.context.location.wardId,
        input.schedule.route,
      );

    if (
      input.command.status ===
      'ADMINISTERED'
    ) {
      const administeredAt =
        input.command.administeredAt ==
        null
          ? input.now
          : new Date(
              input.command.administeredAt,
            );

      const earlyMinutes =
        input.orderTrace.highAlert
          ? policy.highAlertEarlyWindowMinutes
          : policy.earlyWindowMinutes;

      const lateMinutes =
        input.orderTrace.highAlert
          ? policy.highAlertLateWindowMinutes
          : policy.lateWindowMinutes;

      const earliest =
        scheduledAt.getTime() -
        earlyMinutes *
          60 *
          1_000;

      const latest =
        scheduledAt.getTime() +
        lateMinutes *
          60 *
          1_000;

      if (
        (
          administeredAt.getTime() <
            earliest ||
          administeredAt.getTime() >
            latest
        ) &&
        input.command.varianceReason ==
          null
      ) {
        throw new ConflictError(
          'Administration outside the configured medication window requires a variance reason',
        );
      }

      if (
        !decimalEquals(
          input.command.administeredDose!,
          input.schedule.prescribedDose,
        ) &&
        input.command.varianceReason ==
          null
      ) {
        throw new ConflictError(
          'Dose variance requires a documented reason',
        );
      }

      if (
        input.command.administeredRoute !==
          input.schedule.route &&
        input.command.varianceReason ==
          null
      ) {
        throw new ConflictError(
          'Route variance requires a documented reason',
        );
      }

      if (
        input.orderTrace.highAlert ||
        input.orderTrace.controlledMedicine
      ) {
        if (
          !decimalEquals(
            input.command.administeredDose!,
            input.schedule.prescribedDose,
          ) ||
          input.command.administeredRoute !==
            input.schedule.route
        ) {
          throw new ConflictError(
            'High-alert or controlled medication dose and route must exactly match the active order',
          );
        }

        assertIndependentDoubleCheck(
          input.actor,
          input.command.independentDoubleCheck,
          input.now,
          policy,
        );
      }
    }

    if (
      input.command.status ===
      'DELAYED'
    ) {
      const delayedUntil =
        new Date(
          input.command.delayedUntil!,
        );

      if (
        delayedUntil <=
        input.now
      ) {
        throw new BadRequestError(
          'A delayed dose must have a future revised due time',
        );
      }

      if (
        input.schedule.endAt != null &&
        delayedUntil >
          input.schedule.endAt
      ) {
        throw new ConflictError(
          'The delayed time exceeds the medication schedule end',
        );
      }
    }

    return policy;
  }
}