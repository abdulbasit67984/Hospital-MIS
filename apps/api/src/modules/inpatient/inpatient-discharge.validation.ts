import {
  z,
} from 'zod';

import {
  dischargeDispositionValues,
  dischargeChecklistItemStatusValues,
} from '@hospital-mis/database';

import {
  inpatientExpectedVersionSchema,
  inpatientIsoDateTimeSchema,
  inpatientMoneyStringSchema,
  inpatientObjectIdSchema,
  inpatientReasonSchema,
} from './inpatient.validation.js';

const optionalText = (
  minimum:
    number,

  maximum:
    number,
) =>
  z
    .string()
    .trim()
    .min(
      minimum,
    )
    .max(
      maximum,
    )
    .nullable()
    .optional();

export const dischargeChecklistItemSchema =
  z
    .object({
      code:
        z
          .string()
          .trim()
          .min(
            1,
          )
          .max(
            100,
          ),

      label:
        z
          .string()
          .trim()
          .min(
            1,
          )
          .max(
            500,
          ),

      status:
        z
          .enum(
            dischargeChecklistItemStatusValues,
          )
          .default(
            'PENDING',
          ),

      note:
        optionalText(
          1,
          2_000,
        ),
    })
    .strict();

export const medicationReconciliationItemSchema =
  z
    .object({
      medicineId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      medicineDisplay:
        z
          .string()
          .trim()
          .min(
            1,
          )
          .max(
            500,
          ),

      action:
        z.enum([
          'CONTINUE',
          'STOP',
          'CHANGE',
          'NEW',
        ]),

      dose:
        inpatientMoneyStringSchema
          .nullable()
          .optional(),

      doseUnitCode:
        optionalText(
          1,
          80,
        ),

      routeCode:
        optionalText(
          1,
          80,
        ),

      frequencyCode:
        optionalText(
          1,
          80,
        ),

      durationText:
        optionalText(
          1,
          500,
        ),

      instructions:
        optionalText(
          1,
          2_000,
        ),
    })
    .strict();

const followUpInstructionSchema =
  z
    .object({
      departmentId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      providerStaffId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      clinicName:
        optionalText(
          1,
          500,
        ),

      followUpAt:
        inpatientIsoDateTimeSchema
          .nullable()
          .optional(),

      instruction:
        z
          .string()
          .trim()
          .min(
            1,
          )
          .max(
            2_000,
          ),
    })
    .strict();

export const initiateDischargeBodySchema =
  z
    .object({
      admissionId:
        inpatientObjectIdSchema,

      expectedAdmissionVersion:
        inpatientExpectedVersionSchema,

      checklist:
        z
          .array(
            dischargeChecklistItemSchema,
          )
          .max(
            100,
          )
          .default([]),
    })
    .strict();

export const updateDischargeReadinessBodySchema =
  z
    .object({
      expectedDischargeVersion:
        inpatientExpectedVersionSchema,

      checklist:
        z
          .array(
            dischargeChecklistItemSchema,
          )
          .max(
            100,
          ),

      medicationReconciliationCompleted:
        z.boolean(),

      medicationReconciliationItems:
        z
          .array(
            medicationReconciliationItemSchema,
          )
          .max(
            500,
          ),
    })
    .strict();

export const prepareDischargeSummaryBodySchema =
  z
    .object({
      expectedDischargeVersion:
        inpatientExpectedVersionSchema,

      admissionReason:
        z
          .string()
          .trim()
          .min(
            1,
          )
          .max(
            10_000,
          ),

      hospitalCourse:
        z
          .string()
          .trim()
          .min(
            1,
          )
          .max(
            50_000,
          ),

      proceduresPerformed:
        z
          .array(
            z
              .string()
              .trim()
              .min(
                1,
              )
              .max(
                2_000,
              ),
          )
          .max(
            200,
          )
          .default([]),

      significantInvestigations:
        z
          .array(
            z
              .string()
              .trim()
              .min(
                1,
              )
              .max(
                2_000,
              ),
          )
          .max(
            500,
          )
          .default([]),

      diagnosisSnapshots:
        z
          .array(
            z
              .object({
                diagnosisId:
                  inpatientObjectIdSchema
                    .nullable()
                    .optional(),

                diagnosisCode:
                  z
                    .string()
                    .trim()
                    .min(
                      1,
                    )
                    .max(
                      100,
                    ),

                diagnosisSystem:
                  z
                    .string()
                    .trim()
                    .min(
                      1,
                    )
                    .max(
                      100,
                    ),

                diagnosisDisplay:
                  z
                    .string()
                    .trim()
                    .min(
                      1,
                    )
                    .max(
                      1_000,
                    ),

                primary:
                  z
                    .boolean()
                    .default(
                      false,
                    ),
              })
              .strict(),
          )
          .min(
            1,
          )
          .max(
            100,
          ),

      conditionAtDischarge:
        z
          .string()
          .trim()
          .min(
            1,
          )
          .max(
            10_000,
          ),

      medicationReconciliationItems:
        z
          .array(
            medicationReconciliationItemSchema,
          )
          .max(
            500,
          ),

      followUpInstructions:
        z
          .array(
            followUpInstructionSchema,
          )
          .max(
            100,
          )
          .default([]),

      warningSigns:
        z
          .array(
            z
              .string()
              .trim()
              .min(
                1,
              )
              .max(
                2_000,
              ),
          )
          .max(
            100,
          )
          .default([]),

      patientInstructions:
        z
          .string()
          .trim()
          .min(
            1,
          )
          .max(
            20_000,
          ),

      finalize:
        z
          .boolean()
          .default(
            false,
          ),
    })
    .strict();

export const clinicallyClearDischargeBodySchema =
  z
    .object({
      expectedDischargeVersion:
        inpatientExpectedVersionSchema,

      expectedAdmissionVersion:
        inpatientExpectedVersionSchema,

      disposition:
        z.enum(
          dischargeDispositionValues,
        ),
    })
    .strict();

export const confirmFinancialClearanceBodySchema =
  z
    .object({
      expectedDischargeVersion:
        inpatientExpectedVersionSchema,

      expectedAdmissionVersion:
        inpatientExpectedVersionSchema,

      financialClearanceReference:
        z
          .string()
          .trim()
          .min(
            1,
          )
          .max(
            200,
          ),

      clearedAt:
        inpatientIsoDateTimeSchema
          .nullable()
          .optional(),
    })
    .strict();

export const completeDischargeBodySchema =
  z
    .object({
      expectedDischargeVersion:
        inpatientExpectedVersionSchema,

      expectedAdmissionVersion:
        inpatientExpectedVersionSchema,

      expectedBedVersion:
        inpatientExpectedVersionSchema
          .nullable()
          .optional(),

      expectedAssignmentVersion:
        inpatientExpectedVersionSchema
          .nullable()
          .optional(),
    })
    .strict()
    .superRefine(
      (
        input,
        context,
      ) => {
        if (
          (
            input.expectedBedVersion ==
            null
          ) !==
          (
            input.expectedAssignmentVersion ==
            null
          )
        ) {
          context.addIssue({
            code:
              'custom',

            message:
              'Bed and assignment versions must be supplied together',
          });
        }
      },
    );

export const cancelDischargeBodySchema =
  z
    .object({
      expectedDischargeVersion:
        inpatientExpectedVersionSchema,

      expectedAdmissionVersion:
        inpatientExpectedVersionSchema,

      reason:
        inpatientReasonSchema,
    })
    .strict();