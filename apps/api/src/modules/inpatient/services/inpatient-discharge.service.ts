import {
  createHash,
} from 'node:crypto';

import {
  Decimal128,
} from 'mongodb';

import {
  toObjectId,
} from '@hospital-mis/database';

import {
  AdmissionConcurrencyError,
  AdmissionNotFoundError,
  InpatientClinicalContextMismatchError,
} from '../inpatient.errors.js';

import {
  assertAdmissionTransition,
} from '../inpatient.lifecycle.js';

import {
  buildInpatientSequenceKey,
  formatInpatientNumber,
  normalizeInpatientCode,
} from '../inpatient.normalization.js';

import type {
  CancelDischargeInput,
  ClinicallyClearDischargeInput,
  CompleteDischargeInput,
  ConfirmFinancialClearanceInput,
  DischargeCommand,
  DischargeEntityCommand,
  DischargeRepositoryPort,
  FinancialDischargePort,
  InitiateDischargeInput,
  PrepareDischargeSummaryInput,
  UpdateDischargeReadinessInput,
} from '../inpatient-discharge.contracts.js';

import {
  cancelDischargeBodySchema,
  clinicallyClearDischargeBodySchema,
  completeDischargeBodySchema,
  confirmFinancialClearanceBodySchema,
  initiateDischargeBodySchema,
  prepareDischargeSummaryBodySchema,
  updateDischargeReadinessBodySchema,
} from '../inpatient-discharge.validation.js';

import type {
  InpatientBedOperationService,
} from './inpatient-bed-operation.service.js';

import {
  InpatientCommandService,
} from './inpatient-command.service.js';

const transactionTypes = {
  INITIATE:
    'INPATIENT_DISCHARGE_INITIATE',

  UPDATE_READINESS:
    'INPATIENT_DISCHARGE_READINESS_UPDATE',

  PREPARE_SUMMARY:
    'INPATIENT_DISCHARGE_SUMMARY_PREPARE',

  CLINICAL_CLEARANCE:
    'INPATIENT_DISCHARGE_CLINICAL_CLEARANCE',

  FINANCIAL_CLEARANCE:
    'INPATIENT_DISCHARGE_FINANCIAL_CLEARANCE',

  COMPLETE:
    'INPATIENT_DISCHARGE_COMPLETE',

  CANCEL:
    'INPATIENT_DISCHARGE_CANCEL',
} as const;

const defaultChecklist = [
  {
    code:
      'CLINICAL_SUMMARY',

    label:
      'Discharge summary completed',

    status:
      'PENDING' as const,
  },

  {
    code:
      'MEDICATION_RECONCILIATION',

    label:
      'Medication reconciliation completed',

    status:
      'PENDING' as const,
  },

  {
    code:
      'PENDING_RESULTS_REVIEWED',

    label:
      'Pending laboratory and radiology results reviewed',

    status:
      'PENDING' as const,
  },

  {
    code:
      'FOLLOW_UP_PLAN',

    label:
      'Follow-up plan documented',

    status:
      'PENDING' as const,
  },

  {
    code:
      'PATIENT_EDUCATION',

    label:
      'Patient or caregiver education completed',

    status:
      'PENDING' as const,
  },

  {
    code:
      'BED_RELEASE',

    label:
      'Bed released or ready for release',

    status:
      'PENDING' as const,
  },
];

function snapshotHash(
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

export class InpatientDischargeService {
  public constructor(
    private readonly support:
      InpatientCommandService,

    private readonly repository:
      DischargeRepositoryPort,

    private readonly bedOperations:
      InpatientBedOperationService,

    private readonly financialDischarge:
      FinancialDischargePort,
  ) {}

  private async requireDischarge(
    actor:
      import('../inpatient.types.js')
        .InpatientActorContext,

    dischargeId:
      string,
  ) {
    const discharge =
      await this.repository
        .findDischargeById(
          actor.facilityId,
          dischargeId,
        );

    if (
      discharge ===
      null
    ) {
      throw new InpatientClinicalContextMismatchError(
        'The discharge record was not found',
      );
    }

    return discharge;
  }

  private async requireAdmission(
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
      admission ===
      null
    ) {
      throw new AdmissionNotFoundError();
    }

    return admission;
  }

  private async publish(
    actor:
      import('../inpatient.types.js')
        .InpatientActorContext,

    transactionId:
      string,

    event:
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
          event,
          entityId,
        ),

      action:
        event,

      entityType:
        'Discharge',

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
          `${event}.v1`,
          entityId,
        ),

      eventType:
        `${event}.v1`,

      aggregateType:
        'Discharge',

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
        'inpatient.discharge_worklist.changed',

      facilityId:
        actor.facilityId,

      admissionId:
        typeof payload.admissionId ===
        'string'
          ? payload.admissionId
          : undefined,

      payload,
    });
  }

  public async initiate(
    command:
      DischargeCommand<InitiateDischargeInput>,
  ) {
    const input =
      initiateDischargeBodySchema.parse(
        command.input,
      );

    const admission =
      await this.requireAdmission(
        command.actor,
        input.admissionId,
      );

    this.support.assertExpectedVersion(
      admission,
      input.expectedAdmissionVersion,
      'ADMISSION',
    );

    assertAdmissionTransition(
      admission.status,
      'DISCHARGE_INITIATED',
    );

    await this.support.assertAccess(
      command.actor,
      'ADMISSION_CLINICAL_DISCHARGE',
      {
        admission,
      },
    );

    const existing =
      await this.repository
        .findActiveDischargeByAdmission(
          command.actor.facilityId,
          admission._id.toHexString(),
        );

    if (
      existing !==
      null
    ) {
      throw new InpatientClinicalContextMismatchError(
        'An active discharge process already exists for this admission',
      );
    }

    const actorStaffId =
      await this.support.actorStaffId(
        command.actor,
      );

    return this.support.dependencies
      .transactionManager.execute({
        transactionType:
          transactionTypes.INITIATE,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          `inpatient:discharge:${command.actor.facilityId}:${admission._id.toHexString()}`,
        ],

        idempotencyPayload:
          input,

        journalPayload: {
          admissionId:
            admission._id.toHexString(),
        },

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              this.support.dependencies.clock.now();

            const number =
              await this.support.dependencies.sequence.next(
                command.actor.facilityId,

                buildInpatientSequenceKey(
                  'inpatient.discharge.number',
                  occurredAt,
                ),
              );

            const actorId =
              toObjectId(
                command.actor.userId,
                'actorUserId',
              );

            const discharge =
              await this.repository.createDischarge({
                facilityId:
                  admission.facilityId,

                dischargeNumber:
                  formatInpatientNumber(
                    'DSC',
                    occurredAt,
                    number.value,
                  ),

                admissionId:
                  admission._id,

                admissionNumberSnapshot:
                  admission.admissionNumber,

                patientId:
                  admission.patientId,

                encounterId:
                  admission.encounterId,

                attendingConsultantUserId:
                  admission.attendingConsultantUserId,

                attendingConsultantStaffId:
                  admission.attendingConsultantStaffId,

                initiatingDepartmentId:
                  admission.admittingDepartmentId,

                status:
                  'INITIATED',

                disposition:
                  null,

                initiatedAt:
                  occurredAt,

                initiatedByUserId:
                  actorId,

                initiatedByStaffId:
                  toObjectId(
                    actorStaffId,
                    'actorStaffId',
                  ),

                clinicalClearanceAt:
                  null,

                clinicalClearanceByUserId:
                  null,

                clinicalClearanceByStaffId:
                  null,

                financialClearanceRequestedAt:
                  null,

                financialClearanceRequestId:
                  null,

                financialClearanceReference:
                  null,

                financiallyClearedAt:
                  null,

                financiallyClearedByUserId:
                  null,

                completedAt:
                  null,

                completedByUserId:
                  null,

                completedByStaffId:
                  null,

                cancelledAt:
                  null,

                cancelledByUserId:
                  null,

                cancelledByStaffId:
                  null,

                cancellationReason:
                  null,

                checklist:
                  (
                    input.checklist.length >
                    0
                      ? input.checklist
                      : defaultChecklist
                  ).map(
                    (
                      item,
                    ) => ({
                      code:
                        normalizeInpatientCode(
                          item.code,
                        ),

                      label:
                        this.support.displayText(
                          item.label,
                        ),

                      status:
                        item.status,

                      completedAt:
                        item.status ===
                          'COMPLETED'
                          ? occurredAt
                          : null,

                      completedByUserId:
                        item.status ===
                          'COMPLETED'
                          ? actorId
                          : null,

                      completedByStaffId:
                        item.status ===
                          'COMPLETED'
                          ? toObjectId(
                              actorStaffId,
                              'actorStaffId',
                            )
                          : null,

                      note:
                        this.support.nullableText(
                          item.note,
                        ),
                    }),
                  ),

                medicationReconciliationCompleted:
                  false,

                medicationReconciliationItems:
                  [],

                dischargeSummaryId:
                  null,

                latestDischargeSummaryVersionId:
                  null,

                currentSummaryVersion:
                  0,

                billingAccountReference:
                  admission.billingAccountReference,

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

            const updatedAdmission =
              await this.support.admissions.updateAdmission(
                command.actor.facilityId,
                admission._id.toHexString(),
                input.expectedAdmissionVersion,
                {
                  status:
                    'DISCHARGE_INITIATED',

                  dischargeId:
                    discharge._id,

                  updatedBy:
                    actorId,
                },
              );

            if (
              updatedAdmission ===
              null
            ) {
              throw new AdmissionConcurrencyError();
            }

            await this.publish(
              command.actor,
              transaction.transactionId,
              'inpatient.discharge.initiated',
              discharge._id.toHexString(),
              occurredAt,
              {
                dischargeId:
                  discharge._id.toHexString(),

                admissionId:
                  admission._id.toHexString(),

                patientId:
                  admission.patientId.toHexString(),

                status:
                  discharge.status,
              },
            );

            return {
              discharge,
              admission:
                updatedAdmission,
            };
          },
      });
  }

  public async updateReadiness(
    command:
      DischargeEntityCommand<UpdateDischargeReadinessInput>,
  ) {
    const input =
      updateDischargeReadinessBodySchema.parse(
        command.input,
      );

    const discharge =
      await this.requireDischarge(
        command.actor,
        command.dischargeId,
      );

    if (
      discharge.status !==
      'INITIATED'
    ) {
      throw new InpatientClinicalContextMismatchError(
        'Readiness may only be updated before clinical clearance',
      );
    }

    const admission =
      await this.requireAdmission(
        command.actor,
        discharge.admissionId.toHexString(),
      );

    await this.support.assertAccess(
      command.actor,
      'ADMISSION_CLINICAL_DISCHARGE',
      {
        admission,
      },
    );

    const occurredAt =
      this.support.dependencies.clock.now();

    const actorStaffId =
      await this.support.actorStaffId(
        command.actor,
      );

    const actorId =
      toObjectId(
        command.actor.userId,
        'actorUserId',
      );

    const updated =
      await this.repository.updateDischarge(
        command.actor.facilityId,
        command.dischargeId,
        input.expectedDischargeVersion,
        {
          checklist:
            input.checklist.map(
              (
                item,
              ) => ({
                code:
                  normalizeInpatientCode(
                    item.code,
                  ),

                label:
                  this.support.displayText(
                    item.label,
                  ),

                status:
                  item.status,

                completedAt:
                  item.status ===
                    'COMPLETED'
                    ? occurredAt
                    : null,

                completedByUserId:
                  item.status ===
                    'COMPLETED'
                    ? actorId
                    : null,

                completedByStaffId:
                  item.status ===
                    'COMPLETED'
                    ? toObjectId(
                        actorStaffId,
                        'actorStaffId',
                      )
                    : null,

                note:
                  this.support.nullableText(
                    item.note,
                  ),
              }),
            ),

          medicationReconciliationCompleted:
            input.medicationReconciliationCompleted,

          medicationReconciliationItems:
            input.medicationReconciliationItems.map(
              (
                item,
              ) => ({
                medicineId:
                  item.medicineId ==
                  null
                    ? null
                    : toObjectId(
                        item.medicineId,
                        'medicineId',
                      ),

                medicineDisplay:
                  this.support.displayText(
                    item.medicineDisplay,
                  ),

                action:
                  item.action,

                dose:
                  item.dose ==
                  null
                    ? null
                    : Decimal128.fromString(
                        item.dose,
                      ),

                doseUnitCode:
                  item.doseUnitCode ==
                  null
                    ? null
                    : normalizeInpatientCode(
                        item.doseUnitCode,
                      ),

                routeCode:
                  item.routeCode ==
                  null
                    ? null
                    : normalizeInpatientCode(
                        item.routeCode,
                      ),

                frequencyCode:
                  item.frequencyCode ==
                  null
                    ? null
                    : normalizeInpatientCode(
                        item.frequencyCode,
                      ),

                durationText:
                  this.support.nullableText(
                    item.durationText,
                  ),

                instructions:
                  this.support.nullableText(
                    item.instructions,
                  ),
              }),
            ),

          updatedBy:
            actorId,
        },
      );

    if (
      updated ===
      null
    ) {
      throw new AdmissionConcurrencyError();
    }

    return updated;
  }

  public async prepareSummary(
    command:
      DischargeEntityCommand<PrepareDischargeSummaryInput>,
  ) {
    const input =
      prepareDischargeSummaryBodySchema.parse(
        command.input,
      );

    const discharge =
      await this.requireDischarge(
        command.actor,
        command.dischargeId,
      );

    if (
      ![
        'INITIATED',
        'CLINICALLY_CLEARED',
        'FINANCIAL_CLEARANCE_PENDING',
        'FINANCIALLY_CLEARED',
      ].includes(
        discharge.status,
      )
    ) {
      throw new InpatientClinicalContextMismatchError(
        'A discharge summary cannot be prepared in the current discharge state',
      );
    }

    const admission =
      await this.requireAdmission(
        command.actor,
        discharge.admissionId.toHexString(),
      );

    await this.support.assertAccess(
      command.actor,
      'ADMISSION_CLINICAL_DISCHARGE',
      {
        admission,
      },
    );

    const actorStaffId =
      await this.support.actorStaffId(
        command.actor,
      );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        transactionTypes.PREPARE_SUMMARY,

      idempotencyKey:
        command.idempotencyKey,

      actorUserId:
        command.actor.userId,

      facilityId:
        command.actor.facilityId,

      correlationId:
        command.actor.correlationId,

      lockKeys: [
        `inpatient:discharge-summary:${command.actor.facilityId}:${discharge._id.toHexString()}`,
      ],

      idempotencyPayload:
        input,

      journalPayload: {
        dischargeId:
          discharge._id.toHexString(),

        versionNumber:
          discharge.currentSummaryVersion +
          1,
      },

      execute:
        async (
          transaction,
        ) => {
          const occurredAt =
            this.support.dependencies.clock.now();

          const actorId =
            toObjectId(
              command.actor.userId,
              'actorUserId',
            );

          const latest =
            await this.repository.findLatestDischargeSummary(
              command.actor.facilityId,
              discharge._id.toHexString(),
            );

          const versionNumber =
            discharge.currentSummaryVersion +
            1;

          const summaryPayload = {
            admissionReason:
              this.support.displayText(
                input.admissionReason,
              ),

            hospitalCourse:
              this.support.displayText(
                input.hospitalCourse,
              ),

            proceduresPerformed:
              input.proceduresPerformed.map(
                (
                  value,
                ) =>
                  this.support.displayText(
                    value,
                  ),
              ),

            significantInvestigations:
              input.significantInvestigations.map(
                (
                  value,
                ) =>
                  this.support.displayText(
                    value,
                  ),
              ),

            diagnosisSnapshots:
              input.diagnosisSnapshots.map(
                (
                  item,
                ) => ({
                  diagnosisId:
                    item.diagnosisId ==
                    null
                      ? null
                      : toObjectId(
                          item.diagnosisId,
                          'diagnosisId',
                        ),

                  diagnosisCode:
                    normalizeInpatientCode(
                      item.diagnosisCode,
                    ),

                  diagnosisSystem:
                    normalizeInpatientCode(
                      item.diagnosisSystem,
                    ),

                  diagnosisDisplay:
                    this.support.displayText(
                      item.diagnosisDisplay,
                    ),

                  primary:
                    item.primary,
                }),
              ),

            conditionAtDischarge:
              this.support.displayText(
                input.conditionAtDischarge,
              ),

            medicationReconciliationItems:
              discharge.medicationReconciliationItems,

            followUpInstructions:
              input.followUpInstructions.map(
                (
                  item,
                ) => ({
                  departmentId:
                    item.departmentId ==
                    null
                      ? null
                      : toObjectId(
                          item.departmentId,
                          'departmentId',
                        ),

                  providerStaffId:
                    item.providerStaffId ==
                    null
                      ? null
                      : toObjectId(
                          item.providerStaffId,
                          'providerStaffId',
                        ),

                  clinicName:
                    this.support.nullableText(
                      item.clinicName,
                    ),

                  followUpAt:
                    item.followUpAt ==
                    null
                      ? null
                      : new Date(
                          item.followUpAt,
                        ),

                  instruction:
                    this.support.displayText(
                      item.instruction,
                    ),
                }),
              ),

            warningSigns:
              input.warningSigns.map(
                (
                  value,
                ) =>
                  this.support.displayText(
                    value,
                  ),
              ),

            patientInstructions:
              this.support.displayText(
                input.patientInstructions,
              ),
          };

          const summary =
            await this.repository.createDischargeSummary({
              facilityId:
                discharge.facilityId,

              dischargeId:
                discharge._id,

              admissionId:
                discharge.admissionId,

              patientId:
                discharge.patientId,

              encounterId:
                discharge.encounterId,

              summaryNumber:
                `${discharge.dischargeNumber}-S${versionNumber}`,

              versionNumber,

              previousVersionId:
                latest?._id ??
                null,

              status:
                latest ===
                null
                  ? (
                      input.finalize
                        ? 'FINAL'
                        : 'DRAFT'
                    )
                  : 'AMENDED',

              ...summaryPayload,

              preparedAt:
                occurredAt,

              preparedByUserId:
                actorId,

              preparedByStaffId:
                toObjectId(
                  actorStaffId,
                  'actorStaffId',
                ),

              finalizedAt:
                input.finalize
                  ? occurredAt
                  : null,

              finalizedByUserId:
                input.finalize
                  ? actorId
                  : null,

              finalizedByStaffId:
                input.finalize
                  ? toObjectId(
                      actorStaffId,
                      'actorStaffId',
                    )
                  : null,

              amendmentReason:
                latest ===
                null
                  ? null
                  : 'Discharge summary revised',

              snapshotHash:
                snapshotHash(
                  summaryPayload,
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

          const updatedDischarge =
            await this.repository.updateDischarge(
              command.actor.facilityId,
              discharge._id.toHexString(),
              input.expectedDischargeVersion,
              {
                dischargeSummaryId:
                  discharge.dischargeSummaryId ??
                  summary._id,

                latestDischargeSummaryVersionId:
                  summary._id,

                currentSummaryVersion:
                  versionNumber,

                updatedBy:
                  actorId,
              },
            );

          if (
            updatedDischarge ===
            null
          ) {
            throw new AdmissionConcurrencyError();
          }

          return {
            discharge:
              updatedDischarge,

            summary,
          };
        },
    });
  }

  public async clinicallyClear(
    command:
      DischargeEntityCommand<ClinicallyClearDischargeInput>,
  ) {
    const input =
      clinicallyClearDischargeBodySchema.parse(
        command.input,
      );

    const discharge =
      await this.requireDischarge(
        command.actor,
        command.dischargeId,
      );

    const admission =
      await this.requireAdmission(
        command.actor,
        discharge.admissionId.toHexString(),
      );

    if (
      discharge.status !==
      'INITIATED'
    ) {
      throw new InpatientClinicalContextMismatchError(
        'Only initiated discharges can be clinically cleared',
      );
    }

    if (
      !discharge.medicationReconciliationCompleted
    ) {
      throw new InpatientClinicalContextMismatchError(
        'Medication reconciliation must be completed before clinical discharge',
      );
    }

    if (
      discharge.currentSummaryVersion <
      1
    ) {
      throw new InpatientClinicalContextMismatchError(
        'A discharge summary must be prepared before clinical discharge',
      );
    }

    const blockingItems =
      discharge.checklist.filter(
        (
          item,
        ) =>
          ![
            'COMPLETED',
            'NOT_APPLICABLE',
          ].includes(
            item.status,
          ) &&
          item.code !==
            'BED_RELEASE',
      );

    if (
      blockingItems.length >
      0
    ) {
      throw new InpatientClinicalContextMismatchError(
        'The discharge-readiness checklist contains incomplete or blocked items',
      );
    }

    await this.support.assertAccess(
      command.actor,
      'ADMISSION_CLINICAL_DISCHARGE',
      {
        admission,
      },
    );

    this.support.assertExpectedVersion(
      admission,
      input.expectedAdmissionVersion,
      'ADMISSION',
    );

    assertAdmissionTransition(
      admission.status,
      'CLINICALLY_DISCHARGED',
    );

    const actorStaffId =
      await this.support.actorStaffId(
        command.actor,
      );

    const occurredAt =
      this.support.dependencies.clock.now();

    const actorId =
      toObjectId(
        command.actor.userId,
        'actorUserId',
      );

    const updatedDischarge =
      await this.repository.updateDischarge(
        command.actor.facilityId,
        discharge._id.toHexString(),
        input.expectedDischargeVersion,
        {
          status:
            'CLINICALLY_CLEARED',

          disposition:
            input.disposition,

          clinicalClearanceAt:
            occurredAt,

          clinicalClearanceByUserId:
            actorId,

          clinicalClearanceByStaffId:
            toObjectId(
              actorStaffId,
              'actorStaffId',
            ),

          updatedBy:
            actorId,
        },
      );

    if (
      updatedDischarge ===
      null
    ) {
      throw new AdmissionConcurrencyError();
    }

    const updatedAdmission =
      await this.support.admissions.updateAdmission(
        command.actor.facilityId,
        admission._id.toHexString(),
        input.expectedAdmissionVersion,
        {
          status:
            'CLINICALLY_DISCHARGED',

          clinicallyDischargedAt:
            occurredAt,

          updatedBy:
            actorId,
        },
      );

    if (
      updatedAdmission ===
      null
    ) {
      throw new AdmissionConcurrencyError();
    }

    const clearance =
      await this.financialDischarge.requestFinancialClearance({
        idempotencyKey:
          command.idempotencyKey,

        facilityId:
          command.actor.facilityId,

        dischargeId:
          discharge._id.toHexString(),

        admissionId:
          admission._id.toHexString(),

        patientId:
          admission.patientId.toHexString(),

        billingAccountReference:
          admission.billingAccountReference,

        correlationId:
          command.actor.correlationId,
      });

    const financialStatus =
      clearance.status ===
      'CLEARED'
        ? 'FINANCIALLY_CLEARED'
        : 'FINANCIAL_CLEARANCE_PENDING';

    const financialDischarge =
      await this.repository.updateDischarge(
        command.actor.facilityId,
        discharge._id.toHexString(),
        updatedDischarge.version,
        {
          status:
            financialStatus,

          financialClearanceRequestedAt:
            clearance.occurredAt,

          financialClearanceRequestId:
            clearance.requestId,

          financialClearanceReference:
            clearance.clearanceReference,

          financiallyClearedAt:
            clearance.status ===
            'CLEARED'
              ? clearance.occurredAt
              : null,

          updatedBy:
            actorId,
        },
      );

    if (
      financialDischarge ===
      null
    ) {
      throw new AdmissionConcurrencyError();
    }

    const financialAdmission =
      await this.support.admissions.updateAdmission(
        command.actor.facilityId,
        admission._id.toHexString(),
        updatedAdmission.version,
        {
          status:
            clearance.status ===
            'CLEARED'
              ? 'FINANCIAL_CLEARANCE_PENDING'
              : 'FINANCIAL_CLEARANCE_PENDING',

          updatedBy:
            actorId,
        },
      );

    if (
      financialAdmission ===
      null
    ) {
      throw new AdmissionConcurrencyError();
    }

    await this.publish(
      command.actor,
      `discharge-clinical:${discharge._id.toHexString()}:${financialDischarge.version}`,
      'inpatient.discharge.clinically_cleared',
      discharge._id.toHexString(),
      occurredAt,
      {
        dischargeId:
          discharge._id.toHexString(),

        admissionId:
          admission._id.toHexString(),

        patientId:
          admission.patientId.toHexString(),

        status:
          financialDischarge.status,

        financialClearanceRequestId:
          clearance.requestId,
      },
    );

    return {
      discharge:
        financialDischarge,

      admission:
        financialAdmission,

      financialClearance:
        clearance,
    };
  }

  public async confirmFinancialClearance(
    command:
      DischargeEntityCommand<ConfirmFinancialClearanceInput>,
  ) {
    const input =
      confirmFinancialClearanceBodySchema.parse(
        command.input,
      );

    const discharge =
      await this.requireDischarge(
        command.actor,
        command.dischargeId,
      );

    const admission =
      await this.requireAdmission(
        command.actor,
        discharge.admissionId.toHexString(),
      );

    if (
      ![
        'CLINICALLY_CLEARED',
        'FINANCIAL_CLEARANCE_PENDING',
      ].includes(
        discharge.status,
      )
    ) {
      throw new InpatientClinicalContextMismatchError(
        'The discharge is not awaiting financial clearance',
      );
    }

    await this.support.assertAccess(
      command.actor,
      'ADMISSION_FINANCIAL_DISCHARGE',
      {
        admission,
      },
    );

    const occurredAt =
      input.clearedAt ==
      null
        ? this.support.dependencies.clock.now()
        : new Date(
            input.clearedAt,
          );

    const actorId =
      toObjectId(
        command.actor.userId,
        'actorUserId',
      );

    const updatedDischarge =
      await this.repository.updateDischarge(
        command.actor.facilityId,
        discharge._id.toHexString(),
        input.expectedDischargeVersion,
        {
          status:
            'FINANCIALLY_CLEARED',

          financialClearanceReference:
            this.support.displayText(
              input.financialClearanceReference,
            ),

          financiallyClearedAt:
            occurredAt,

          financiallyClearedByUserId:
            actorId,

          updatedBy:
            actorId,
        },
      );

    if (
      updatedDischarge ===
      null
    ) {
      throw new AdmissionConcurrencyError();
    }

    const updatedAdmission =
      await this.support.admissions.updateAdmission(
        command.actor.facilityId,
        admission._id.toHexString(),
        input.expectedAdmissionVersion,
        {
          financiallyClearedAt:
            occurredAt,

          updatedBy:
            actorId,
        },
      );

    if (
      updatedAdmission ===
      null
    ) {
      throw new AdmissionConcurrencyError();
    }

    return {
      discharge:
        updatedDischarge,

      admission:
        updatedAdmission,
    };
  }

  public async complete(
    command:
      DischargeEntityCommand<CompleteDischargeInput>,
  ) {
    const input =
      completeDischargeBodySchema.parse(
        command.input,
      );

    let discharge =
      await this.requireDischarge(
        command.actor,
        command.dischargeId,
      );

    let admission =
      await this.requireAdmission(
        command.actor,
        discharge.admissionId.toHexString(),
      );

    if (
      discharge.status !==
      'FINANCIALLY_CLEARED'
    ) {
      throw new InpatientClinicalContextMismatchError(
        'Final discharge requires confirmed financial clearance',
      );
    }

    if (
      admission.currentBedId !==
        null &&
      admission.currentBedAssignmentId !==
        null
    ) {
      if (
        input.expectedBedVersion ==
          null ||
        input.expectedAssignmentVersion ==
          null
      ) {
        throw new InpatientClinicalContextMismatchError(
          'Active bed occupancy must be released before final discharge',
        );
      }

      const released =
        await this.bedOperations.releaseBed({
          actor:
            command.actor,

          idempotencyKey:
            `${command.idempotencyKey}:release-bed`,

          input: {
            admissionId:
              admission._id.toHexString(),

            expectedAdmissionVersion:
              input.expectedAdmissionVersion,

            expectedBedVersion:
              input.expectedBedVersion,

            expectedAssignmentVersion:
              input.expectedAssignmentVersion,

            releaseReasonCode:
              'DISCHARGE',

            releaseReason:
              'Patient discharged from inpatient care',

            releasedAt:
              null,

            startTurnaround:
              true,
          },
        });

      admission =
        released.admission;

      discharge =
        await this.requireDischarge(
          command.actor,
          command.dischargeId,
        );
    }

    await this.support.assertAccess(
      command.actor,
      'ADMISSION_FINANCIAL_DISCHARGE',
      {
        admission,
      },
    );

    const actorStaffId =
      await this.support.actorStaffId(
        command.actor,
      );

    const occurredAt =
      this.support.dependencies.clock.now();

    const actorId =
      toObjectId(
        command.actor.userId,
        'actorUserId',
      );

    const completedDischarge =
      await this.repository.updateDischarge(
        command.actor.facilityId,
        discharge._id.toHexString(),
        discharge.version,
        {
          status:
            'COMPLETED',

          completedAt:
            occurredAt,

          completedByUserId:
            actorId,

          completedByStaffId:
            toObjectId(
              actorStaffId,
              'actorStaffId',
            ),

          updatedBy:
            actorId,
        },
      );

    if (
      completedDischarge ===
      null
    ) {
      throw new AdmissionConcurrencyError();
    }

    const completedAdmission =
      await this.support.admissions.updateAdmission(
        command.actor.facilityId,
        admission._id.toHexString(),
        admission.version,
        {
          status:
            'DISCHARGED',

          isActive:
            false,

          dischargedAt:
            occurredAt,

          dischargeId:
            completedDischarge._id,

          currentWardId:
            null,

          currentRoomId:
            null,

          currentBedId:
            null,

          currentBedAssignmentId:
            null,

          currentBedAssignedAt:
            null,

          updatedBy:
            actorId,
        },
      );

    if (
      completedAdmission ===
      null
    ) {
      throw new AdmissionConcurrencyError();
    }

    await this.publish(
      command.actor,
      `discharge-complete:${completedDischarge._id.toHexString()}:${completedDischarge.version}`,
      'inpatient.discharge.completed',
      completedDischarge._id.toHexString(),
      occurredAt,
      {
        dischargeId:
          completedDischarge._id.toHexString(),

        admissionId:
          completedAdmission._id.toHexString(),

        patientId:
          completedAdmission.patientId.toHexString(),

        disposition:
          completedDischarge.disposition,

        dischargedAt:
          occurredAt.toISOString(),
      },
    );

    return {
      discharge:
        completedDischarge,

      admission:
        completedAdmission,
    };
  }

  public async cancel(
    command:
      DischargeEntityCommand<CancelDischargeInput>,
  ) {
    const input =
      cancelDischargeBodySchema.parse(
        command.input,
      );

    const discharge =
      await this.requireDischarge(
        command.actor,
        command.dischargeId,
      );

    const admission =
      await this.requireAdmission(
        command.actor,
        discharge.admissionId.toHexString(),
      );

    if (
      ![
        'INITIATED',
        'CLINICALLY_CLEARED',
        'FINANCIAL_CLEARANCE_PENDING',
      ].includes(
        discharge.status,
      )
    ) {
      throw new InpatientClinicalContextMismatchError(
        'The discharge process can no longer be cancelled',
      );
    }

    await this.support.assertAccess(
      command.actor,
      'ADMISSION_CLINICAL_DISCHARGE',
      {
        admission,
      },
    );

    const actorStaffId =
      await this.support.actorStaffId(
        command.actor,
      );

    const occurredAt =
      this.support.dependencies.clock.now();

    const actorId =
      toObjectId(
        command.actor.userId,
        'actorUserId',
      );

    const cancelled =
      await this.repository.updateDischarge(
        command.actor.facilityId,
        discharge._id.toHexString(),
        input.expectedDischargeVersion,
        {
          status:
            'CANCELLED',

          cancelledAt:
            occurredAt,

          cancelledByUserId:
            actorId,

          cancelledByStaffId:
            toObjectId(
              actorStaffId,
              'actorStaffId',
            ),

          cancellationReason:
            this.support.displayText(
              input.reason,
            ),

          updatedBy:
            actorId,
        },
      );

    if (
      cancelled ===
      null
    ) {
      throw new AdmissionConcurrencyError();
    }

    const restored =
      await this.support.admissions.updateAdmission(
        command.actor.facilityId,
        admission._id.toHexString(),
        input.expectedAdmissionVersion,
        {
          status:
            'ADMITTED',

          dischargeId:
            null,

          clinicallyDischargedAt:
            null,

          financiallyClearedAt:
            null,

          updatedBy:
            actorId,
        },
      );

    if (
      restored ===
      null
    ) {
      throw new AdmissionConcurrencyError();
    }

    return {
      discharge:
        cancelled,

      admission:
        restored,
    };
  }
}