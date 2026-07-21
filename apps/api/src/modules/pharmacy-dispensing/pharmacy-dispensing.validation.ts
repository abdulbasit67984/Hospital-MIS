import Decimal from 'decimal.js';
import {
  z,
} from 'zod';

import {
  dispensationContextValues,
  dispensationItemStatusValues,
  dispensationPriorityValues,
  dispensationStatusValues,
  dispensationSubstitutionTypeValues,
  patientReturnDispositionValues,
  pharmacyAcknowledgementMethodValues,
  pharmacyCounsellingStatusValues,
  pharmacyReviewOutcomeValues,
  pharmacySafetyAlertDispositionValues,
  returnedMedicineIntegrityValues,
  returnedMedicineSealStatusValues,
} from '@hospital-mis/database';

import {
  DEFAULT_PHARMACY_DISPENSING_PAGE_SIZE,
  DEFAULT_PHARMACY_RESERVATION_MINUTES,
  MAX_PHARMACY_DISPENSING_PAGE_SIZE,
  MAX_PHARMACY_RESERVATION_MINUTES,
  PHARMACY_DISPENSING_SORT_FIELDS,
} from './pharmacy-dispensing.constants.js';

export const pharmacyObjectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/iu, 'Expected a valid MongoDB ObjectId');

export const pharmacyExpectedVersionSchema = z
  .number()
  .int()
  .min(0);

export const pharmacyIsoDateTimeSchema = z
  .string()
  .datetime({ offset: true });

export const pharmacyReasonSchema = z
  .string()
  .trim()
  .min(5)
  .max(5_000);

export const pharmacyDecimalStringSchema = z
  .string()
  .trim()
  .regex(
    /^[+-]?\d{1,24}(?:\.\d{1,8})?$/u,
    'Expected a decimal with no more than eight decimal places',
  )
  .refine((value) => {
    try {
      return new Decimal(value).isFinite();
    } catch {
      return false;
    }
  }, 'Expected a finite decimal value');

export const pharmacyPositiveDecimalStringSchema =
  pharmacyDecimalStringSchema.refine(
    (value) => new Decimal(value).gt(0),
    'Expected a decimal value greater than zero',
  );

export const pharmacyNonNegativeDecimalStringSchema =
  pharmacyDecimalStringSchema.refine(
    (value) => new Decimal(value).gte(0),
    'Expected a non-negative decimal value',
  );

const nullableText = (minimum: number, maximum: number) =>
  z.string().trim().min(minimum).max(maximum).nullable().optional();

const pageSchema = z.coerce.number().int().min(1).default(1);
const pageSizeSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_PHARMACY_DISPENSING_PAGE_SIZE)
  .default(DEFAULT_PHARMACY_DISPENSING_PAGE_SIZE);

const booleanQuerySchema = z
  .union([
    z.boolean(),
    z.enum(['true', 'false']).transform((value) => value === 'true'),
  ])
  .optional();

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): boolean {
  return new Set(values.map(key)).size === values.length;
}

export const pharmacyMutationHeadersSchema = z
  .object({
    'idempotency-key': z
      .string()
      .trim()
      .min(8)
      .max(200)
      .regex(
        /^[A-Za-z0-9._:/-]+$/u,
        'Idempotency key contains unsupported characters',
      ),
    'x-break-glass-reason': z
      .string()
      .trim()
      .min(10)
      .max(1_000)
      .optional(),
  })
  .strict();

export const pharmacyReadHeadersSchema = z
  .object({
    'x-break-glass-reason': z
      .string()
      .trim()
      .min(10)
      .max(1_000)
      .optional(),
  })
  .strict();

export const pharmacyEntityParamsSchema = z
  .object({
    dispensationId: pharmacyObjectIdSchema.optional(),
    dispensationItemId: pharmacyObjectIdSchema.optional(),
    prescriptionId: pharmacyObjectIdSchema.optional(),
    substitutionId: pharmacyObjectIdSchema.optional(),
    returnId: pharmacyObjectIdSchema.optional(),
    reversalId: pharmacyObjectIdSchema.optional(),
    labelId: pharmacyObjectIdSchema.optional(),
  })
  .strict();

export const pharmacyDispensationListQuerySchema = z
  .object({
    page: pageSchema,
    pageSize: pageSizeSchema,
    status: z.array(z.enum(dispensationStatusValues)).max(20).optional(),
    context: z.array(z.enum(dispensationContextValues)).max(10).optional(),
    priority: z.array(z.enum(dispensationPriorityValues)).max(10).optional(),
    pharmacyLocationId: pharmacyObjectIdSchema.optional(),
    patientId: pharmacyObjectIdSchema.optional(),
    prescriptionId: pharmacyObjectIdSchema.optional(),
    admissionId: pharmacyObjectIdSchema.optional(),
    controlledMedicine: booleanQuerySchema,
    from: pharmacyIsoDateTimeSchema.optional(),
    to: pharmacyIsoDateTimeSchema.optional(),
    search: z.string().trim().min(2).max(200).optional(),
    sortBy: z.enum(PHARMACY_DISPENSING_SORT_FIELDS).default('queuedAt'),
    sortDirection: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.from !== undefined &&
      value.to !== undefined &&
      new Date(value.from).getTime() > new Date(value.to).getTime()
    ) {
      context.addIssue({
        code: 'custom',
        path: ['from'],
        message: 'The pharmacy worklist start must not be after the end',
      });
    }
  });

export const pharmacyDispensationItemListQuerySchema = z
  .object({
    status: z.array(z.enum(dispensationItemStatusValues)).max(20).optional(),
    controlledMedicine: booleanQuerySchema,
    highAlertMedicine: booleanQuerySchema,
  })
  .strict();

export const createDispensationIntakeBodySchema = z
  .object({
    prescriptionId: pharmacyObjectIdSchema,
    expectedPrescriptionVersion: pharmacyExpectedVersionSchema,
    context: z.enum(dispensationContextValues),
    pharmacyLocationId: pharmacyObjectIdSchema,
    priority: z.enum(dispensationPriorityValues).default('ROUTINE'),
    admissionId: pharmacyObjectIdSchema.nullable().optional(),
    wardId: pharmacyObjectIdSchema.nullable().optional(),
    expiresAt: pharmacyIsoDateTimeSchema.optional(),
    items: z
      .array(
        z
          .object({
            prescriptionItemId: pharmacyObjectIdSchema,
            requestedQuantity: pharmacyPositiveDecimalStringSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(500)
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      ['INPATIENT', 'DISCHARGE', 'WARD_SUPPLY'].includes(value.context) &&
      value.admissionId == null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['admissionId'],
        message: 'This dispensing context requires an active admission',
      });
    }

    if (value.context === 'WARD_SUPPLY' && value.wardId == null) {
      context.addIssue({
        code: 'custom',
        path: ['wardId'],
        message: 'Ward supply requires a ward',
      });
    }

    if (
      value.items !== undefined &&
      !uniqueBy(
        value.items,
        (item: { prescriptionItemId: string }) => item.prescriptionItemId,
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'Prescription items must be unique',
      });
    }
  });

const alertDecisionSchema = z
  .object({
    alertFingerprint: z.string().trim().min(16).max(256),
    disposition: z.enum(pharmacySafetyAlertDispositionValues),
    reason: z.string().trim().min(5).max(2_000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      ['ACKNOWLEDGED', 'OVERRIDDEN', 'RESOLVED'].includes(value.disposition) &&
      value.reason === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'This alert decision requires a reason',
      });
    }
  });

export const verifyDispensationBodySchema = z
  .object({
    expectedVersion: pharmacyExpectedVersionSchema,
    action: z
      .enum([
        'VERIFIED',
        'SECOND_CHECK_APPROVED',
        'CONTROLLED_MEDICINE_AUTHORIZED',
      ])
      .default('VERIFIED'),
    outcome: z.enum(pharmacyReviewOutcomeValues),
    alertDecisions: z.array(alertDecisionSchema).max(500).default([]),
    reason: z.string().trim().min(5).max(2_000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      ['BLOCKED', 'REJECTED', 'PASS_WITH_WARNINGS'].includes(value.outcome) &&
      value.reason === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'This pharmacy review outcome requires a reason',
      });
    }

    if (
      !uniqueBy(
        value.alertDecisions,
        (item: { alertFingerprint: string }) => item.alertFingerprint,
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['alertDecisions'],
        message: 'Safety alert decisions must be unique',
      });
    }
  });

export const holdDispensationBodySchema = z
  .object({
    expectedVersion: pharmacyExpectedVersionSchema,
    reason: pharmacyReasonSchema,
  })
  .strict();

export const releaseDispensationBodySchema = holdDispensationBodySchema;
export const rejectDispensationBodySchema = holdDispensationBodySchema;

export const proposeDispensationSubstitutionBodySchema = z
  .object({
    expectedItemVersion: pharmacyExpectedVersionSchema,
    substitutionType: z.enum(dispensationSubstitutionTypeValues),
    proposedFormularyItemId: pharmacyObjectIdSchema,
    reason: pharmacyReasonSchema,
  })
  .strict();

export const decideDispensationSubstitutionBodySchema = z
  .object({
    expectedVersion: pharmacyExpectedVersionSchema,
    decision: z.enum(['AUTHORIZE', 'REJECT']),
    reason: pharmacyReasonSchema,
    prescriberAuthorizationProviderId: pharmacyObjectIdSchema
      .nullable()
      .optional(),
  })
  .strict();

export const reserveDispensationStockBodySchema = z
  .object({
    expectedVersion: pharmacyExpectedVersionSchema,
    reservationMinutes: z
      .number()
      .int()
      .min(1)
      .max(MAX_PHARMACY_RESERVATION_MINUTES)
      .default(DEFAULT_PHARMACY_RESERVATION_MINUTES),
    items: z
      .array(
        z
          .object({
            dispensationItemId: pharmacyObjectIdSchema,
            requestedQuantity: pharmacyPositiveDecimalStringSchema,
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict()
  .refine(
    (value) =>
      uniqueBy(
        value.items,
        (item: { dispensationItemId: string }) => item.dispensationItemId,
      ),
    {
      path: ['items'],
      message: 'Dispensation reservation items must be unique',
    },
  );

const dispenseAllocationSchema = z
  .object({
    allocationId: pharmacyObjectIdSchema,
    stockQuantity: pharmacyPositiveDecimalStringSchema,
    scannedBarcode: nullableText(1, 200),
  })
  .strict();

export const completeDispensationBodySchema = z
  .object({
    expectedVersion: pharmacyExpectedVersionSchema,
    items: z
      .array(
        z
          .object({
            dispensationItemId: pharmacyObjectIdSchema,
            expectedVersion: pharmacyExpectedVersionSchema,
            quantity: pharmacyPositiveDecimalStringSchema,
            quantityUnitId: pharmacyObjectIdSchema,
            allocations: z.array(dispenseAllocationSchema).min(1).max(100),
          })
          .strict()
          .refine(
            (value) =>
              uniqueBy(
                value.allocations,
                (item: { allocationId: string }) => item.allocationId,
              ),
            {
              path: ['allocations'],
              message: 'Dispensing allocations must be unique',
            },
          ),
      )
      .min(1)
      .max(500),
    witnessStaffId: pharmacyObjectIdSchema.nullable().optional(),
    priceOverrideReason: nullableText(5, 2_000),
    counsellingRequired: z.boolean().default(false),
  })
  .strict()
  .refine(
    (value) =>
      uniqueBy(
        value.items,
        (item: { dispensationItemId: string }) => item.dispensationItemId,
      ),
    {
      path: ['items'],
      message: 'Dispensation items must be unique',
    },
  );

export const createPatientReturnBodySchema = z
  .object({
    originalDispensationId: pharmacyObjectIdSchema,
    receivingStockLocationId: pharmacyObjectIdSchema,
    reason: pharmacyReasonSchema,
    witnessStaffId: pharmacyObjectIdSchema.nullable().optional(),
    items: z
      .array(
        z
          .object({
            originalDispensationItemId: pharmacyObjectIdSchema,
            originalAllocationId: pharmacyObjectIdSchema.nullable().optional(),
            quantity: pharmacyPositiveDecimalStringSchema,
            sealStatus: z.enum(returnedMedicineSealStatusValues),
            storageIntegrity: z.enum(returnedMedicineIntegrityValues),
            coldChainIntegrity: z.enum(returnedMedicineIntegrityValues),
            contaminationRisk: z.enum([
              'NONE_IDENTIFIED',
              'POSSIBLE',
              'CONFIRMED',
              'UNKNOWN',
            ]),
            requestedDisposition: z.enum(patientReturnDispositionValues).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();

export const createDispensationReversalBodySchema = z
  .object({
    expectedDispensationVersion: pharmacyExpectedVersionSchema,
    reason: pharmacyReasonSchema,
    witnessStaffId: pharmacyObjectIdSchema.nullable().optional(),
    dispensationItemIds: z.array(pharmacyObjectIdSchema).min(1).max(500).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.dispensationItemIds === undefined ||
      uniqueBy(value.dispensationItemIds, (item: string) => item),
    {
      path: ['dispensationItemIds'],
      message: 'Reversal item identifiers must be unique',
    },
  );

export const printDispensingLabelBodySchema = z
  .object({
    expectedLabelVersion: pharmacyExpectedVersionSchema.optional(),
    printerIdentifier: nullableText(1, 200),
    workstationIdentifier: nullableText(1, 200),
    reason: z.enum(['INITIAL', 'REPRINT', 'CORRECTION']).default('INITIAL'),
  })
  .strict();

export const recordPharmacyCounsellingBodySchema = z
  .object({
    dispensationItemIds: z.array(pharmacyObjectIdSchema).max(500).optional(),
    status: z.enum(pharmacyCounsellingStatusValues),
    topics: z.array(z.string().trim().min(2).max(300)).max(100).default([]),
    languageCode: z.string().trim().toLowerCase().min(2).max(20),
    interpreterUsed: z.boolean().default(false),
    interpreterStaffId: pharmacyObjectIdSchema.nullable().optional(),
    interpreterName: nullableText(2, 300),
    counselledPerson: z.enum(['PATIENT', 'CAREGIVER', 'BOTH']).default('PATIENT'),
    caregiverName: nullableText(2, 300),
    acknowledgementMethod: z
      .enum(pharmacyAcknowledgementMethodValues)
      .nullable()
      .optional(),
    acknowledgementAttachmentId: pharmacyObjectIdSchema.nullable().optional(),
    declinedReason: nullableText(5, 2_000),
    unableReason: nullableText(5, 2_000),
    notes: nullableText(1, 5_000),
    attachmentIds: z.array(pharmacyObjectIdSchema).max(100).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.interpreterUsed &&
      value.interpreterStaffId == null &&
      value.interpreterName == null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['interpreterUsed'],
        message: 'Interpreter use requires staff or external interpreter attribution',
      });
    }

    if (
      value.status === 'COMPLETED' &&
      (value.topics.length === 0 || value.acknowledgementMethod == null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'Completed counselling requires topics and acknowledgement',
      });
    }

    if (value.status === 'DECLINED' && value.declinedReason == null) {
      context.addIssue({
        code: 'custom',
        path: ['declinedReason'],
        message: 'Declined counselling requires a reason',
      });
    }

    if (value.status === 'UNABLE' && value.unableReason == null) {
      context.addIssue({
        code: 'custom',
        path: ['unableReason'],
        message: 'Unable-to-counsel status requires a reason',
      });
    }
  });