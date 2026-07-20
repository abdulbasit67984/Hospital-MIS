import {
  z,
} from 'zod';

import {
  bedHoldTypeValues,
  bedReleaseReasonValues,
  inpatientBedStatusValues,
} from '@hospital-mis/database';

import {
  DEFAULT_BED_HOLD_MINUTES,
  MAX_BED_HOLD_MINUTES,
} from './inpatient.constants.js';

import {
  inpatientExpectedVersionSchema,
  inpatientIsoDateTimeSchema,
  inpatientObjectIdSchema,
  inpatientReasonSchema,
} from './inpatient.validation.js';

export const reserveBedBodySchema =
  z
    .object({
      admissionId:
        inpatientObjectIdSchema,

      bedId:
        inpatientObjectIdSchema,

      holdType:
        z.enum(
          bedHoldTypeValues,
        ),

      holdMinutes:
        z
          .number()
          .int()
          .min(1)
          .max(
            MAX_BED_HOLD_MINUTES,
          )
          .default(
            DEFAULT_BED_HOLD_MINUTES,
          ),

      reasonCode:
        z
          .string()
          .trim()
          .min(1)
          .max(100),

      reason:
        inpatientReasonSchema,

      expectedBedVersion:
        inpatientExpectedVersionSchema,
    })
    .strict();

export const releaseBedHoldBodySchema =
  z
    .object({
      expectedHoldVersion:
        inpatientExpectedVersionSchema,

      expectedBedVersion:
        inpatientExpectedVersionSchema,

      reason:
        inpatientReasonSchema,
    })
    .strict();

export const assignBedBodySchema =
  z
    .object({
      admissionId:
        inpatientObjectIdSchema,

      bedId:
        inpatientObjectIdSchema,

      bedHoldId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      expectedAdmissionVersion:
        inpatientExpectedVersionSchema,

      expectedBedVersion:
        inpatientExpectedVersionSchema,

      expectedHoldVersion:
        inpatientExpectedVersionSchema
          .nullable()
          .optional(),

      assignedAt:
        inpatientIsoDateTimeSchema
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
          input.bedHoldId != null &&
          input.expectedHoldVersion ==
            null
        ) {
          context.addIssue({
            code:
              'custom',

            path:
              [
                'expectedHoldVersion',
              ],

            message:
              'A reserved-bed assignment requires the expected hold version',
          });
        }

        if (
          input.bedHoldId == null &&
          input.expectedHoldVersion !=
            null
        ) {
          context.addIssue({
            code:
              'custom',

            path:
              [
                'expectedHoldVersion',
              ],

            message:
              'Expected hold version may only be supplied with a bed hold',
          });
        }
      },
    );

export const transferBedBodySchema =
  z
    .object({
      admissionId:
        inpatientObjectIdSchema,

      destinationBedId:
        inpatientObjectIdSchema,

      destinationBedHoldId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      expectedAdmissionVersion:
        inpatientExpectedVersionSchema,

      expectedSourceBedVersion:
        inpatientExpectedVersionSchema,

      expectedDestinationBedVersion:
        inpatientExpectedVersionSchema,

      expectedSourceAssignmentVersion:
        inpatientExpectedVersionSchema,

      expectedDestinationHoldVersion:
        inpatientExpectedVersionSchema
          .nullable()
          .optional(),

      reason:
        inpatientReasonSchema,

      transferredAt:
        inpatientIsoDateTimeSchema
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
          input.destinationBedHoldId !=
            null &&
          input
            .expectedDestinationHoldVersion ==
            null
        ) {
          context.addIssue({
            code:
              'custom',

            path:
              [
                'expectedDestinationHoldVersion',
              ],

            message:
              'A reserved destination bed requires its expected hold version',
          });
        }
      },
    );

export const releaseBedBodySchema =
  z
    .object({
      admissionId:
        inpatientObjectIdSchema,

      expectedAdmissionVersion:
        inpatientExpectedVersionSchema,

      expectedBedVersion:
        inpatientExpectedVersionSchema,

      expectedAssignmentVersion:
        inpatientExpectedVersionSchema,

      releaseReasonCode:
        z.enum(
          bedReleaseReasonValues,
        ),

      releaseReason:
        z
          .string()
          .trim()
          .min(3)
          .max(5_000)
          .nullable()
          .optional(),

      releasedAt:
        inpatientIsoDateTimeSchema
          .nullable()
          .optional(),

      startTurnaround:
        z
          .boolean()
          .default(true),
    })
    .strict();

export const changeBedOperationalStatusCommandBodySchema =
  z
    .object({
      expectedBedVersion:
        inpatientExpectedVersionSchema,

      status:
        z.enum(
          inpatientBedStatusValues,
        ),

      reasonCode:
        z
          .string()
          .trim()
          .min(1)
          .max(100),

      reason:
        z
          .string()
          .trim()
          .min(3)
          .max(5_000)
          .nullable()
          .optional(),

      maintenanceReference:
        z
          .string()
          .trim()
          .min(1)
          .max(200)
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
          input.status ===
            'MAINTENANCE' &&
          input
            .maintenanceReference ==
            null
        ) {
          context.addIssue({
            code:
              'custom',

            path:
              [
                'maintenanceReference',
              ],

            message:
              'Maintenance status requires a maintenance reference',
          });
        }

        if (
          input.status !==
            'MAINTENANCE' &&
          input
            .maintenanceReference !=
            null
        ) {
          context.addIssue({
            code:
              'custom',

            path:
              [
                'maintenanceReference',
              ],

            message:
              'Maintenance reference is only valid for maintenance status',
          });
        }
      },
    );

export const completeBedTurnaroundBodySchema =
  z
    .object({
      expectedBedVersion:
        inpatientExpectedVersionSchema,

      reason:
        z
          .string()
          .trim()
          .min(3)
          .max(5_000)
          .nullable()
          .optional(),
    })
    .strict();

export const submitBedChargeBodySchema =
  z
    .object({
      expectedChargeSegmentVersion:
        inpatientExpectedVersionSchema,
    })
    .strict();

export const reverseBedChargeBodySchema =
  z
    .object({
      expectedChargeSegmentVersion:
        inpatientExpectedVersionSchema,

      reason:
        inpatientReasonSchema,
    })
    .strict();

export const reconcileBedStateBodySchema =
  z
    .object({
      expectedBedVersion:
        inpatientExpectedVersionSchema,

      reason:
        inpatientReasonSchema,

      dryRun:
        z
          .boolean()
          .default(true),
    })
    .strict();