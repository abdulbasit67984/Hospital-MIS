import {
  createHash,
} from 'node:crypto';

import {
  Decimal128,
} from 'mongodb';

import {
  VitalSignModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  AdmissionConcurrencyError,
  AdmissionNotFoundError,
  InpatientClinicalContextMismatchError,
  InpatientMinimumNecessaryAccessError,
} from '../inpatient.errors.js';

import {
  INPATIENT_NUMBER_SEQUENCE_NAMESPACE,
} from '../inpatient.constants.js';

import {
  buildInpatientSequenceKey,
  formatInpatientNumber,
  normalizeInpatientCode,
} from '../inpatient.normalization.js';

import type {
  AcknowledgeWardHandoverInput,
  CreateMedicationScheduleInput,
  CreateNursingNoteInput,
  CreateWardHandoverInput,
  NursingCommand,
  NursingEntityCommand,
  NursingRepositoryPort,
  RecordMedicationDoseInput,
  RecordNursingVitalSignInput,
} from '../inpatient-nursing.contracts.js';

import {
  acknowledgeWardHandoverBodySchema,
  createMedicationScheduleBodySchema,
  createNursingNoteBodySchema,
  createWardHandoverBodySchema,
  recordMedicationDoseBodySchema,
  recordNursingVitalSignBodySchema,
} from '../inpatient-nursing.validation.js';

import {
  InpatientCommandService,
} from './inpatient-command.service.js';

const nursingTransactionTypes = {
  RECORD_VITAL:
    'INPATIENT_NURSING_VITAL_RECORD',

  CREATE_NOTE:
    'INPATIENT_NURSING_NOTE_CREATE',

  CREATE_MEDICATION_SCHEDULE:
    'INPATIENT_MEDICATION_SCHEDULE_CREATE',

  RECORD_MEDICATION_DOSE:
    'INPATIENT_MEDICATION_DOSE_RECORD',

  CREATE_HANDOVER:
    'INPATIENT_WARD_HANDOVER_CREATE',

  ACKNOWLEDGE_HANDOVER:
    'INPATIENT_WARD_HANDOVER_ACKNOWLEDGE',
} as const;

function hash(
  value:
    unknown,
): string {
  return createHash(
    'sha256',
  )
    .update(
      JSON.stringify(
        value,
      ),
    )
    .digest(
      'hex',
    );
}

function decimal(
  value:
    string |
    null |
    undefined,
): Decimal128 | null {
  return value == null
    ? null
    : Decimal128.fromString(
        value,
      );
}

export class InpatientNursingService {
  public constructor(
    private readonly support:
      InpatientCommandService,

    private readonly repository:
      NursingRepositoryPort,
  ) {}

  private async requireActiveAdmission(
    actor:
      import('../inpatient.types.js')
        .InpatientActorContext,

    admissionId:
      string,
  ) {
    const admission =
      await this.support.admissions
        .findAdmissionById(
          actor.facilityId,
          admissionId,
        );

    if (
      admission === null
    ) {
      throw new AdmissionNotFoundError();
    }

    if (
      !admission.isActive ||
      ![
        'ADMITTED',
        'TRANSFER_PENDING',
        'DISCHARGE_INITIATED',
        'CLINICALLY_DISCHARGED',
        'FINANCIAL_CLEARANCE_PENDING',
      ].includes(
        admission.status,
      )
    ) {
      throw new InpatientClinicalContextMismatchError(
        'Nursing entries require an active admitted patient',
      );
    }

    if (
      admission.currentWardId ===
        null
    ) {
      throw new InpatientClinicalContextMismatchError(
        'The admitted patient is not assigned to a ward',
      );
    }

    return admission;
  }

  private async requireNursingAccess(
    actor:
      import('../inpatient.types.js')
        .InpatientActorContext,

    admission:
      Awaited<
        ReturnType<
          InpatientNursingService[
            'requireActiveAdmission'
          ]
        >
      >,
  ): Promise<string> {
    const decision =
      await this.support.accessPolicy
        .authorize({
          action:
            'ADMISSION_READ',

          actor,

          admission,
        });

    const operational =
      decision.allowed &&
      [
        'WARD_OPERATIONAL',
        'ASSIGNED_CLINICIAN',
        'BREAK_GLASS',
      ].includes(
        decision.accessMode,
      );

    if (
      !operational
    ) {
      throw new InpatientMinimumNecessaryAccessError();
    }

    return this.support.actorStaffId(
      actor,
    );
  }

  private async publish(
    actor:
      import('../inpatient.types.js')
        .InpatientActorContext,

    transactionId:
      string,

    eventType:
      string,

    entityType:
      string,

    entityId:
      string,

    occurredAt:
      Date,

    payload:
      Record<string, unknown>,
  ): Promise<void> {
    await this.support.dependencies.audit.append({
      transactionId,

      deduplicationKey:
        this.support.deduplicationKey(
          transactionId,
          eventType,
          entityId,
        ),

      action:
        eventType,

      entityType,

      entityId,

      ...this.support.auditActorFields(
        actor,
      ),

      occurredAt,

      after:
        payload,
    });

    await this.support.dependencies.outbox.enqueue({
      transactionId,

      deduplicationKey:
        this.support.deduplicationKey(
          transactionId,
          eventType,
          entityId,
        ),

      eventType:
        `${eventType}.v1`,

      aggregateType:
        entityType,

      aggregateId:
        entityId,

      actorUserId:
        actor.userId,

      facilityId:
        actor.facilityId,

      correlationId:
        actor.correlationId,

      occurredAt,

      payload,
    });

    await this.support.dependencies.realtime.publish({
      eventType:
        'inpatient.nursing_workspace.changed',

      facilityId:
        actor.facilityId,

      admissionId:
        typeof payload.admissionId ===
        'string'
          ? payload.admissionId
          : undefined,

      wardId:
        typeof payload.wardId ===
        'string'
          ? payload.wardId
          : undefined,

      payload,
    });
  }

  public async recordVitalSign(
    command:
      NursingCommand<RecordNursingVitalSignInput>,
  ) {
    const input =
      recordNursingVitalSignBodySchema.parse(
        command.input,
      );

    const admission =
      await this.requireActiveAdmission(
        command.actor,
        input.admissionId,
      );

    const staffId =
      await this.requireNursingAccess(
        command.actor,
        admission,
      );

    return this.support.dependencies
      .transactionManager.execute({
        transactionType:
          nursingTransactionTypes
            .RECORD_VITAL,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          `inpatient:nursing:vital:${command.actor.facilityId}:${admission._id.toHexString()}:${input.measuredAt}`,
        ],

        idempotencyPayload:
          input,

        journalPayload: {
          admissionId:
            admission._id.toHexString(),

          measuredAt:
            input.measuredAt,
        },

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              this.support.dependencies
                .clock.now();

            const created =
              await VitalSignModel.create({
                facilityId:
                  admission.facilityId,

                encounterId:
                  admission.encounterId,

                patientId:
                  admission.patientId,

                admissionId:
                  admission._id,

                sourceClinicalNoteId:
                  null,

                observerProviderId:
                  toObjectId(
                    staffId,
                    'staffId',
                  ),

                source:
                  'MANUAL',

                deviceIdentifier:
                  null,

                measuredAt:
                  new Date(
                    input.measuredAt,
                  ),

                recordedAt:
                  occurredAt,

                bodyPosition:
                  input.bodyPosition,

                temperatureCelsius:
                  decimal(
                    input.temperatureCelsius,
                  ),

                temperatureSite:
                  input.temperatureSite,

                pulsePerMinute:
                  input.pulsePerMinute ??
                  null,

                respiratoryRatePerMinute:
                  input.respiratoryRatePerMinute ??
                  null,

                systolicBloodPressureMmHg:
                  input.systolicBloodPressureMmHg ??
                  null,

                diastolicBloodPressureMmHg:
                  input.diastolicBloodPressureMmHg ??
                  null,

                oxygenSaturationPercent:
                  decimal(
                    input.oxygenSaturationPercent,
                  ),

                bloodGlucoseMgDl:
                  decimal(
                    input.bloodGlucoseMgDl,
                  ),

                painScore:
                  input.painScore ??
                  null,

                weightKg:
                  decimal(
                    input.weightKg,
                  ),

                heightCm:
                  null,

                bmi:
                  null,

                oxygenDeliveryMethod:
                  input.oxygenDeliveryMethod ??
                  null,

                oxygenFlowLitresPerMinute:
                  decimal(
                    input.oxygenFlowLitresPerMinute,
                  ),

                notes:
                  input.notes ??
                  null,

                confidentiality:
                  'ROUTINE',

                restrictionReason:
                  null,

                status:
                  'RECORDED',

                correctedAt:
                  null,

                correctedBy:
                  null,

                correctionReason:
                  null,

                supersedesVitalSignId:
                  null,

                supersededByVitalSignId:
                  null,

                enteredInErrorAt:
                  null,

                enteredInErrorBy:
                  null,

                enteredInErrorReason:
                  null,

                transactionId:
                  transaction.transactionId,

                correlationId:
                  command.actor.correlationId,

                schemaVersion:
                  1,

                version:
                  0,

                createdBy:
                  toObjectId(
                    command.actor.userId,
                    'actorUserId',
                  ),

                updatedBy:
                  toObjectId(
                    command.actor.userId,
                    'actorUserId',
                  ),
              });

            await this.publish(
              command.actor,
              transaction.transactionId,
              'inpatient.nursing.vital_recorded',
              'VitalSign',
              created._id.toHexString(),
              occurredAt,
              {
                vitalSignId:
                  created._id.toHexString(),

                admissionId:
                  admission._id.toHexString(),

                patientId:
                  admission.patientId.toHexString(),

                wardId:
                  admission.currentWardId?.toHexString() ??
                  null,

                measuredAt:
                  input.measuredAt,
              },
            );

            return created;
          },
      });
  }

  public async createNursingNote(
    command:
      NursingCommand<CreateNursingNoteInput>,
  ) {
    const input =
      createNursingNoteBodySchema.parse(
        command.input,
      );

    const admission =
      await this.requireActiveAdmission(
        command.actor,
        input.admissionId,
      );

    const staffId =
      await this.requireNursingAccess(
        command.actor,
        admission,
      );

    return this.support.dependencies
      .transactionManager.execute({
        transactionType:
          nursingTransactionTypes
            .CREATE_NOTE,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          `inpatient:nursing:note:${command.actor.facilityId}:${admission._id.toHexString()}`,
        ],

        idempotencyPayload:
          input,

        journalPayload: {
          admissionId:
            admission._id.toHexString(),

          noteType:
            input.noteType,
        },

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              input.recordedAt ==
              null
                ? this.support.dependencies
                    .clock.now()
                : new Date(
                    input.recordedAt,
                  );

            const sequence =
              await this.support.dependencies
                .sequence.next(
                  command.actor.facilityId,

                  buildInpatientSequenceKey(
                    'inpatient.nursing_note.number',
                    occurredAt,
                  ),
                );

            const noteId =
              this.support.newId();

            const actorId =
              toObjectId(
                command.actor.userId,
                'actorUserId',
              );

            const note =
              await this.repository.createNursingNote({
                facilityId:
                  admission.facilityId,

                admissionId:
                  admission._id,

                patientId:
                  admission.patientId,

                encounterId:
                  admission.encounterId,

                wardId:
                  admission.currentWardId!,

                roomId:
                  admission.currentRoomId,

                bedId:
                  admission.currentBedId,

                noteNumber:
                  formatInpatientNumber(
                    'NUR',
                    occurredAt,
                    sequence.value,
                  ),

                noteType:
                  input.noteType,

                observationSeverity:
                  input.observationSeverity,

                title:
                  this.support.displayText(
                    input.title,
                  ),

                content:
                  this.support.displayText(
                    input.content,
                  ),

                intakeOutput:
                  input.intakeOutput ==
                  null
                    ? null
                    : {
                        direction:
                          input.intakeOutput.direction,

                        route:
                          input.intakeOutput.route,

                        amountMillilitres:
                          Decimal128.fromString(
                            input.intakeOutput
                              .amountMillilitres,
                          ),

                        description:
                          this.support.nullableText(
                            input.intakeOutput
                              .description,
                          ),
                      },

                requiresEscalation:
                  input.requiresEscalation,

                escalationRecipientStaffId:
                  input.escalationRecipientStaffId ==
                  null
                    ? null
                    : toObjectId(
                        input.escalationRecipientStaffId,
                        'escalationRecipientStaffId',
                      ),

                escalatedAt:
                  input.requiresEscalation
                    ? occurredAt
                    : null,

                acknowledgedAt:
                  null,

                acknowledgedByStaffId:
                  null,

                recordedAt:
                  occurredAt,

                recordedByUserId:
                  actorId,

                recordedByStaffId:
                  toObjectId(
                    staffId,
                    'staffId',
                  ),

                status:
                  'ACTIVE',

                revisionNumber:
                  1,

                rootNursingNoteId:
                  toObjectId(
                    noteId,
                    'noteId',
                  ),

                supersedesNursingNoteId:
                  null,

                supersededByNursingNoteId:
                  null,

                version:
                  0,

                transactionId:
                  transaction.transactionId,

                correlationId:
                  command.actor.correlationId,

                schemaVersion:
                  1,

                createdBy:
                  actorId,

                updatedBy:
                  actorId,
              });

            await this.repository
              .createNursingNoteVersion({
                facilityId:
                  admission.facilityId,

                admissionId:
                  admission._id,

                patientId:
                  admission.patientId,

                encounterId:
                  admission.encounterId,

                wardId:
                  admission.currentWardId,

                roomId:
                  admission.currentRoomId,

                bedId:
                  admission.currentBedId,

                nursingNoteId:
                  note._id,

                rootNursingNoteId:
                  note.rootNursingNoteId,

                revisionNumber:
                  note.revisionNumber,

                snapshotHash:
                  hash({
                    noteType:
                      note.noteType,

                    severity:
                      note.observationSeverity,

                    title:
                      note.title,

                    content:
                      note.content,

                    intakeOutput:
                      note.intakeOutput,
                  }),

                noteTypeSnapshot:
                  note.noteType,

                observationSeveritySnapshot:
                  note.observationSeverity,

                titleSnapshot:
                  note.title,

                contentSnapshot:
                  note.content,

                intakeOutputSnapshot:
                  note.intakeOutput,

                statusSnapshot:
                  note.status,

                changeReason:
                  null,

                recordedAt:
                  occurredAt,

                recordedByUserId:
                  actorId,

                recordedByStaffId:
                  toObjectId(
                    staffId,
                    'staffId',
                  ),

                transactionId:
                  transaction.transactionId,

                correlationId:
                  command.actor.correlationId,

                schemaVersion:
                  1,

                version:
                  0,

                createdBy:
                  actorId,

                updatedBy:
                  actorId,
              });

            await this.publish(
              command.actor,
              transaction.transactionId,
              'inpatient.nursing.note_created',
              'NursingNote',
              note._id.toHexString(),
              occurredAt,
              {
                nursingNoteId:
                  note._id.toHexString(),

                admissionId:
                  admission._id.toHexString(),

                patientId:
                  admission.patientId.toHexString(),

                wardId:
                  admission.currentWardId?.toHexString() ??
                  null,

                noteType:
                  note.noteType,

                observationSeverity:
                  note.observationSeverity,

                requiresEscalation:
                  note.requiresEscalation,
              },
            );

            return note;
          },
      });
  }

  public async createMedicationSchedule(
    command:
      NursingCommand<CreateMedicationScheduleInput>,
  ) {
    const input =
      createMedicationScheduleBodySchema.parse(
        command.input,
      );

    const admission =
      await this.requireActiveAdmission(
        command.actor,
        input.admissionId,
      );

    await this.requireNursingAccess(
      command.actor,
      admission,
    );

    return this.support.dependencies
      .transactionManager.execute({
        transactionType:
          nursingTransactionTypes
            .CREATE_MEDICATION_SCHEDULE,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          `inpatient:medication-schedule:${command.actor.facilityId}:${admission._id.toHexString()}:${input.prescriptionItemId ?? input.medicineId}`,
        ],

        idempotencyPayload:
          input,

        journalPayload: {
          admissionId:
            admission._id.toHexString(),

          prescriptionItemId:
            input.prescriptionItemId,

          medicineId:
            input.medicineId,
        },

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              this.support.dependencies
                .clock.now();

            const sequence =
              await this.support.dependencies
                .sequence.next(
                  command.actor.facilityId,

                  buildInpatientSequenceKey(
                    'inpatient.medication_schedule.number',
                    occurredAt,
                  ),
                );

            const actorId =
              toObjectId(
                command.actor.userId,
                'actorUserId',
              );

            const scheduledTimes =
              input.scheduledTimes
                .map(
                  (value) =>
                    new Date(
                      value,
                    ),
                )
                .sort(
                  (left, right) =>
                    left.getTime() -
                    right.getTime(),
                );

            const schedule =
              await this.repository
                .createMedicationSchedule({
                  facilityId:
                    admission.facilityId,

                  admissionId:
                    admission._id,

                  patientId:
                    admission.patientId,

                  encounterId:
                    admission.encounterId,

                  wardId:
                    admission.currentWardId!,

                  roomId:
                    admission.currentRoomId,

                  bedId:
                    admission.currentBedId,

                  scheduleNumber:
                    formatInpatientNumber(
                      'MAR-SCH',
                      occurredAt,
                      sequence.value,
                    ),

                  prescriptionId:
                    input.prescriptionId ==
                    null
                      ? null
                      : toObjectId(
                          input.prescriptionId,
                          'prescriptionId',
                        ),

                  prescriptionItemId:
                    input.prescriptionItemId ==
                    null
                      ? null
                      : toObjectId(
                          input.prescriptionItemId,
                          'prescriptionItemId',
                        ),

                  source:
                    input.source,

                  medicineId:
                    toObjectId(
                      input.medicineId,
                      'medicineId',
                    ),

                  formularyItemId:
                    input.formularyItemId ==
                    null
                      ? null
                      : toObjectId(
                          input.formularyItemId,
                          'formularyItemId',
                        ),

                  medicineDisplay:
                    this.support.displayText(
                      input.medicineDisplay,
                    ),

                  prescribedDose:
                    Decimal128.fromString(
                      input.prescribedDose,
                    ),

                  doseUnitCode:
                    normalizeInpatientCode(
                      input.doseUnitCode,
                    ),

                  route:
                    input.route,

                  frequencyCode:
                    normalizeInpatientCode(
                      input.frequencyCode,
                    ),

                  scheduledTimes,

                  prn:
                    input.prn,

                  prnIndication:
                    this.support.nullableText(
                      input.prnIndication,
                    ),

                  startAt:
                    new Date(
                      input.startAt,
                    ),

                  endAt:
                    input.endAt ==
                    null
                      ? null
                      : new Date(
                          input.endAt,
                        ),

                  status:
                    'ACTIVE',

                  holdReason:
                    null,

                  orderedByUserId:
                    toObjectId(
                      input.orderedByUserId,
                      'orderedByUserId',
                    ),

                  orderedByStaffId:
                    toObjectId(
                      input.orderedByStaffId,
                      'orderedByStaffId',
                    ),

                  lastAdministrationAt:
                    null,

                  nextScheduledAt:
                    scheduledTimes[0] ??
                    null,

                  version:
                    0,

                  transactionId:
                    transaction.transactionId,

                  correlationId:
                    command.actor.correlationId,

                  schemaVersion:
                    1,

                  createdBy:
                    actorId,

                  updatedBy:
                    actorId,
                });

            await this.publish(
              command.actor,
              transaction.transactionId,
              'inpatient.medication_schedule.created',
              'MedicationSchedule',
              schedule._id.toHexString(),
              occurredAt,
              {
                medicationScheduleId:
                  schedule._id.toHexString(),

                admissionId:
                  admission._id.toHexString(),

                patientId:
                  admission.patientId.toHexString(),

                wardId:
                  admission.currentWardId?.toHexString() ??
                  null,

                medicineId:
                  schedule.medicineId.toHexString(),

                nextScheduledAt:
                  schedule.nextScheduledAt?.toISOString() ??
                  null,
              },
            );

            return schedule;
          },
      });
  }

  public async recordMedicationDose(
    command:
      NursingEntityCommand<RecordMedicationDoseInput>,
  ) {
    const input =
      recordMedicationDoseBodySchema.parse(
        command.input,
      );

    const schedule =
      await this.repository
        .findMedicationSchedule(
          command.actor.facilityId,
          command.entityId,
        );

    if (
      schedule === null ||
      schedule.status !==
        'ACTIVE'
    ) {
      throw new InpatientClinicalContextMismatchError(
        'The medication schedule is not active',
      );
    }

    if (
      schedule.version !==
      input.expectedScheduleVersion
    ) {
      throw new AdmissionConcurrencyError();
    }

    const admission =
      await this.requireActiveAdmission(
        command.actor,
        schedule.admissionId.toHexString(),
      );

    const staffId =
      await this.requireNursingAccess(
        command.actor,
        admission,
      );

    return this.support.dependencies
      .transactionManager.execute({
        transactionType:
          nursingTransactionTypes
            .RECORD_MEDICATION_DOSE,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          `inpatient:medication-dose:${command.actor.facilityId}:${schedule._id.toHexString()}:${input.scheduledAt}`,
        ],

        idempotencyPayload:
          input,

        journalPayload: {
          scheduleId:
            schedule._id.toHexString(),

          admissionId:
            admission._id.toHexString(),

          scheduledAt:
            input.scheduledAt,

          status:
            input.status,
        },

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              this.support.dependencies
                .clock.now();

            const sequence =
              await this.support.dependencies
                .sequence.next(
                  command.actor.facilityId,

                  buildInpatientSequenceKey(
                    'inpatient.medication_administration.number',
                    occurredAt,
                  ),
                );

            const actorId =
              toObjectId(
                command.actor.userId,
                'actorUserId',
              );

            const administration =
              await this.repository
                .createMedicationAdministration({
                  facilityId:
                    schedule.facilityId,

                  admissionId:
                    schedule.admissionId,

                  patientId:
                    schedule.patientId,

                  encounterId:
                    schedule.encounterId,

                  wardId:
                    admission.currentWardId!,

                  roomId:
                    admission.currentRoomId,

                  bedId:
                    admission.currentBedId,

                  administrationNumber:
                    formatInpatientNumber(
                      'MAR',
                      occurredAt,
                      sequence.value,
                    ),

                  medicationScheduleId:
                    schedule._id,

                  prescriptionId:
                    schedule.prescriptionId,

                  prescriptionItemId:
                    schedule.prescriptionItemId,

                  medicineId:
                    schedule.medicineId,

                  medicineDisplaySnapshot:
                    schedule.medicineDisplay,

                  scheduledAt:
                    new Date(
                      input.scheduledAt,
                    ),

                  status:
                    input.status,

                  prescribedDose:
                    schedule.prescribedDose,

                  administeredDose:
                    decimal(
                      input.administeredDose,
                    ),

                  doseUnitCode:
                    schedule.doseUnitCode,

                  prescribedRoute:
                    schedule.route,

                  administeredRoute:
                    input.administeredRoute ??
                    null,

                  administeredAt:
                    input.administeredAt ==
                    null
                      ? (
                          input.status ===
                          'ADMINISTERED'
                            ? occurredAt
                            : null
                        )
                      : new Date(
                          input.administeredAt,
                        ),

                  administeringNurseUserId:
                    input.status ===
                    'ADMINISTERED'
                      ? actorId
                      : null,

                  administeringNurseStaffId:
                    input.status ===
                    'ADMINISTERED'
                      ? toObjectId(
                          staffId,
                          'staffId',
                        )
                      : null,

                  reasonCode:
                    input.reasonCode ==
                    null
                      ? null
                      : normalizeInpatientCode(
                          input.reasonCode,
                        ),

                  reason:
                    this.support.nullableText(
                      input.reason,
                    ),

                  notes:
                    this.support.nullableText(
                      input.notes,
                    ),

                  delayedUntil:
                    input.delayedUntil ==
                    null
                      ? null
                      : new Date(
                          input.delayedUntil,
                        ),

                  statusChangedAt:
                    occurredAt,

                  statusChangedBy:
                    actorId,

                  correctionOfAdministrationId:
                    null,

                  supersededByAdministrationId:
                    null,

                  version:
                    0,

                  transactionId:
                    transaction.transactionId,

                  correlationId:
                    command.actor.correlationId,

                  schemaVersion:
                    1,

                  createdBy:
                    actorId,

                  updatedBy:
                    actorId,
                });

            const futureTimes =
              schedule.scheduledTimes.filter(
                (scheduledAt) =>
                  scheduledAt >
                  new Date(
                    input.scheduledAt,
                  ),
              );

            const updatedSchedule =
              await this.repository
                .updateMedicationSchedule(
                  command.actor.facilityId,
                  schedule._id.toHexString(),
                  input.expectedScheduleVersion,
                  {
                    lastAdministrationAt:
                      input.status ===
                      'ADMINISTERED'
                        ? administration.administeredAt
                        : schedule.lastAdministrationAt,

                    nextScheduledAt:
                      input.status ===
                        'DELAYED'
                        ? administration.delayedUntil
                        : futureTimes[0] ??
                          null,

                    updatedBy:
                      actorId,
                  },
                );

            if (
              updatedSchedule ===
              null
            ) {
              throw new AdmissionConcurrencyError();
            }

            await this.publish(
              command.actor,
              transaction.transactionId,
              'inpatient.medication_administration.recorded',
              'MedicationAdministration',
              administration._id.toHexString(),
              occurredAt,
              {
                medicationAdministrationId:
                  administration._id.toHexString(),

                medicationScheduleId:
                  schedule._id.toHexString(),

                admissionId:
                  admission._id.toHexString(),

                patientId:
                  admission.patientId.toHexString(),

                wardId:
                  admission.currentWardId?.toHexString() ??
                  null,

                medicineId:
                  schedule.medicineId.toHexString(),

                scheduledAt:
                  administration.scheduledAt.toISOString(),

                status:
                  administration.status,
              },
            );

            return {
              administration,
              schedule:
                updatedSchedule,
            };
          },
      });
  }

  public async createWardHandover(
    command:
      NursingCommand<CreateWardHandoverInput>,
  ) {
    const input =
      createWardHandoverBodySchema.parse(
        command.input,
      );

    const admission =
      await this.requireActiveAdmission(
        command.actor,
        input.admissionId,
      );

    const staffId =
      await this.requireNursingAccess(
        command.actor,
        admission,
      );

    return this.support.dependencies
      .transactionManager.execute({
        transactionType:
          nursingTransactionTypes
            .CREATE_HANDOVER,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          `inpatient:ward-handover:${command.actor.facilityId}:${admission._id.toHexString()}`,
        ],

        idempotencyPayload:
          input,

        journalPayload: {
          admissionId:
            admission._id.toHexString(),

          toNurseStaffId:
            input.toNurseStaffId,

          shiftCode:
            input.shiftCode,
        },

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              input.handedOverAt ==
              null
                ? this.support.dependencies
                    .clock.now()
                : new Date(
                    input.handedOverAt,
                  );

            const sequence =
              await this.support.dependencies
                .sequence.next(
                  command.actor.facilityId,

                  buildInpatientSequenceKey(
                    'inpatient.ward_handover.number',
                    occurredAt,
                  ),
                );

            const actorId =
              toObjectId(
                command.actor.userId,
                'actorUserId',
              );

            const handover =
              await this.repository
                .createWardHandover({
                  facilityId:
                    admission.facilityId,

                  admissionId:
                    admission._id,

                  patientId:
                    admission.patientId,

                  encounterId:
                    admission.encounterId,

                  wardId:
                    admission.currentWardId!,

                  roomId:
                    admission.currentRoomId,

                  bedId:
                    admission.currentBedId,

                  handoverNumber:
                    formatInpatientNumber(
                      'HND',
                      occurredAt,
                      sequence.value,
                    ),

                  handoverType:
                    input.handoverType,

                  shiftCode:
                    normalizeInpatientCode(
                      input.shiftCode,
                    ),

                  summary:
                    this.support.displayText(
                      input.summary,
                    ),

                  activeConcerns: [
                    ...input.activeConcerns,
                  ],

                  pendingTasks: [
                    ...input.pendingTasks,
                  ],

                  medicationConcerns: [
                    ...input.medicationConcerns,
                  ],

                  safetyConcerns: [
                    ...input.safetyConcerns,
                  ],

                  fromNurseUserId:
                    actorId,

                  fromNurseStaffId:
                    toObjectId(
                      staffId,
                      'staffId',
                    ),

                  toNurseUserId:
                    toObjectId(
                      input.toNurseUserId,
                      'toNurseUserId',
                    ),

                  toNurseStaffId:
                    toObjectId(
                      input.toNurseStaffId,
                      'toNurseStaffId',
                    ),

                  handedOverAt:
                    occurredAt,

                  status:
                    'SIGNED',

                  signedAt:
                    occurredAt,

                  acknowledgedAt:
                    null,

                  acknowledgedByUserId:
                    null,

                  acknowledgedByStaffId:
                    null,

                  supersedesWardHandoverId:
                    null,

                  supersededByWardHandoverId:
                    null,

                  version:
                    0,

                  transactionId:
                    transaction.transactionId,

                  correlationId:
                    command.actor.correlationId,

                  schemaVersion:
                    1,

                  createdBy:
                    actorId,

                  updatedBy:
                    actorId,
                });

            await this.publish(
              command.actor,
              transaction.transactionId,
              'inpatient.ward_handover.created',
              'WardHandover',
              handover._id.toHexString(),
              occurredAt,
              {
                wardHandoverId:
                  handover._id.toHexString(),

                admissionId:
                  admission._id.toHexString(),

                patientId:
                  admission.patientId.toHexString(),

                wardId:
                  admission.currentWardId?.toHexString() ??
                  null,

                toNurseStaffId:
                  handover.toNurseStaffId.toHexString(),

                status:
                  handover.status,
              },
            );

            return handover;
          },
      });
  }

  public async acknowledgeWardHandover(
    command:
      NursingEntityCommand<AcknowledgeWardHandoverInput>,
  ) {
    const input =
      acknowledgeWardHandoverBodySchema.parse(
        command.input,
      );

    const handover =
      await this.repository
        .findWardHandover(
          command.actor.facilityId,
          command.entityId,
        );

    if (
      handover === null
    ) {
      throw new InpatientClinicalContextMismatchError(
        'The ward handover was not found',
      );
    }

    const admission =
      await this.requireActiveAdmission(
        command.actor,
        handover.admissionId.toHexString(),
      );

    const staffId =
      await this.requireNursingAccess(
        command.actor,
        admission,
      );

    const occurredAt =
      this.support.dependencies
        .clock.now();

    const acknowledged =
      await this.repository
        .acknowledgeWardHandover(
          command.actor.facilityId,
          handover._id.toHexString(),
          input.expectedVersion,
          command.actor.userId,
          staffId,
          occurredAt,
        );

    if (
      acknowledged ===
      null
    ) {
      throw new AdmissionConcurrencyError();
    }

    await this.publish(
      command.actor,
      `handover-ack:${acknowledged._id.toHexString()}:${acknowledged.version}`,
      'inpatient.ward_handover.acknowledged',
      'WardHandover',
      acknowledged._id.toHexString(),
      occurredAt,
      {
        wardHandoverId:
          acknowledged._id.toHexString(),

        admissionId:
          acknowledged.admissionId.toHexString(),

        patientId:
          acknowledged.patientId.toHexString(),

        wardId:
          acknowledged.wardId.toHexString(),

        acknowledgedByStaffId:
          staffId,

        status:
          acknowledged.status,
      },
    );

    return acknowledged;
  }

  public async medicationCompliance(
    actor:
      import('../inpatient.types.js')
        .InpatientActorContext,

    admissionId:
      string,

    from:
      Date,

    to:
      Date,
  ) {
    const admission =
      await this.requireActiveAdmission(
        actor,
        admissionId,
      );

    await this.requireNursingAccess(
      actor,
      admission,
    );

    const counts =
      await this.repository
        .medicationCompliance(
          actor.facilityId,
          admissionId,
          from,
          to,
        );

    const compliancePercent =
      counts.scheduled ===
      0
        ? 100
        : Number(
            (
              (
                counts.administered /
                counts.scheduled
              ) *
              100
            ).toFixed(
              2,
            ),
          );

    return {
      ...counts,
      compliancePercent,
      from:
        from.toISOString(),

      to:
        to.toISOString(),
    };
  }
}