import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  validateNonNegativeInventoryDecimal,
  validatePositiveInventoryDecimal,
} from './inventory-schema-helpers.js';

import {
  nullablePharmacyObjectId,
  pharmacyCommonFields,
  pharmacyNullableDecimal,
  pharmacyTimestampedSchemaOptions,
  validateAllOrNone,
} from './pharmacy-dispensing-schema-helpers.js';

import {
  controlledMedicineDirectionValues,
  controlledMedicineDiscrepancyStatusValues,
  controlledMedicineEntryTypeValues,
  controlledMedicineWitnessMethodValues,
} from './pharmacy-dispensing.types.js';

const nullableString = {
  type: String,
  default: null,
  trim: true,
} as const;

function decimalParts(
  value: unknown,
  field: string,
): {
  coefficient: bigint;
  scale: number;
} {
  const source = String(value).trim();
  const match =
    /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/u.exec(
      source,
    );

  if (match == null) {
    throw new TypeError(
      `${field} must be a valid decimal value`,
    );
  }

  const sign = match[1] === '-' ? -1n : 1n;
  const integer = match[2] ?? '0';
  const fraction = match[3] ?? '';
  const exponent = Number(match[4] ?? '0');

  if (!Number.isSafeInteger(exponent)) {
    throw new TypeError(
      `${field} has an unsupported decimal exponent`,
    );
  }

  let coefficient =
    BigInt(`${integer}${fraction}`) * sign;
  let scale = fraction.length - exponent;

  if (scale < 0) {
    coefficient *= 10n ** BigInt(-scale);
    scale = 0;
  }

  return {
    coefficient,
    scale,
  };
}

function controlledBalanceReconciles(
  opening: unknown,
  quantity: unknown,
  closing: unknown,
  direction: string,
): boolean {
  const openingParts = decimalParts(
    opening,
    'openingBalance',
  );
  const quantityParts = decimalParts(
    quantity,
    'quantity',
  );
  const closingParts = decimalParts(
    closing,
    'closingBalance',
  );
  const scale = Math.max(
    openingParts.scale,
    quantityParts.scale,
    closingParts.scale,
  );
  const align = (
    value: Readonly<{
      coefficient: bigint;
      scale: number;
    }>,
  ) =>
    value.coefficient *
    10n ** BigInt(scale - value.scale);

  const expected =
    direction === 'IN'
      ? align(openingParts) +
        align(quantityParts)
      : direction === 'OUT'
        ? align(openingParts) -
          align(quantityParts)
        : align(openingParts);

  return expected === align(closingParts);
}

export const controlledMedicineRegisterEntrySchema =
  new Schema(
    {
      ...pharmacyCommonFields,

      registerNumber: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        minlength: 3,
        maxlength: 120,
      },

      registerSequence: {
        type: Number,
        required: true,
        immutable: true,
        min: 1,
      },

      operationKey: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 8,
        maxlength: 500,
      },

      entryType: {
        type: String,
        required: true,
        immutable: true,
        enum: controlledMedicineEntryTypeValues,
      },

      direction: {
        type: String,
        required: true,
        immutable: true,
        enum: controlledMedicineDirectionValues,
      },

      pharmacyLocationId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      stockLocationId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      patientId:
        nullablePharmacyObjectId,
      prescriptionId:
        nullablePharmacyObjectId,
      prescriptionItemId:
        nullablePharmacyObjectId,
      dispensationId:
        nullablePharmacyObjectId,
      dispensationItemId:
        nullablePharmacyObjectId,
      patientReturnId:
        nullablePharmacyObjectId,
      reversalId:
        nullablePharmacyObjectId,

      prescriberProviderId:
        nullablePharmacyObjectId,

      pharmacistStaffId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      witnessRequired: {
        type: Boolean,
        required: true,
        immutable: true,
        default: false,
      },

      witnessStaffId:
        nullablePharmacyObjectId,

      witnessMethod: {
        type: String,
        default: null,
        enum: [
          ...controlledMedicineWitnessMethodValues,
          null,
        ],
        immutable: true,
      },

      witnessedAt: {
        type: Date,
        default: null,
        immutable: true,
      },

      formularyItemId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      medicineId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      inventoryItemId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      inventoryBatchId:
        nullablePharmacyObjectId,

      batchNumberSnapshot: {
        ...nullableString,
        uppercase: true,
        maxlength: 200,
        immutable: true,
      },

      expiryDateSnapshot: {
        type: Date,
        default: null,
        immutable: true,
      },

      stockUnitId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      quantity: {
        type: Schema.Types.Decimal128,
        required: true,
        immutable: true,
      },

      openingBalance: {
        type: Schema.Types.Decimal128,
        required: true,
        immutable: true,
      },

      closingBalance: {
        type: Schema.Types.Decimal128,
        required: true,
        immutable: true,
      },

      physicalBalance:
        pharmacyNullableDecimal,

      stockMovementId:
        nullablePharmacyObjectId,

      reversalOfRegisterEntryId:
        nullablePharmacyObjectId,

      discrepancyStatus: {
        type: String,
        required: true,
        immutable: true,
        enum:
          controlledMedicineDiscrepancyStatusValues,
        default: 'NONE',
      },

      discrepancyQuantity:
        pharmacyNullableDecimal,

      discrepancyReason: {
        ...nullableString,
        minlength: 5,
        maxlength: 2_000,
        immutable: true,
        select: false,
      },

      escalationReference: {
        ...nullableString,
        maxlength: 200,
        immutable: true,
      },

      reason: {
        ...nullableString,
        maxlength: 2_000,
        immutable: true,
        select: false,
      },

      occurredAt: {
        type: Date,
        required: true,
        immutable: true,
      },
    },
    pharmacyTimestampedSchemaOptions(
      'controlledMedicineRegisterEntries',
    ),
  );

controlledMedicineRegisterEntrySchema.pre(
  'validate',
  function validateControlledMedicineRegisterEntry() {
    for (
      const field of [
        'openingBalance',
        'closingBalance',
      ] as const
    ) {
      validateNonNegativeInventoryDecimal(
        this,
        field,
        this.get(field),
      );
    }

    if (this.get('direction') === 'NEUTRAL') {
      validateNonNegativeInventoryDecimal(
        this,
        'quantity',
        this.get('quantity'),
      );
    } else {
      validatePositiveInventoryDecimal(
        this,
        'quantity',
        this.get('quantity'),
      );
    }

    if (
      this.get('physicalBalance') != null
    ) {
      validateNonNegativeInventoryDecimal(
        this,
        'physicalBalance',
        this.get('physicalBalance'),
      );
    }

    if (
      this.get('discrepancyQuantity') != null
    ) {
      validateNonNegativeInventoryDecimal(
        this,
        'discrepancyQuantity',
        this.get('discrepancyQuantity'),
      );
    }

    try {
      if (
        !controlledBalanceReconciles(
          this.get('openingBalance'),
          this.get('quantity'),
          this.get('closingBalance'),
          String(this.get('direction')),
        )
      ) {
        this.invalidate(
          'closingBalance',
          'Controlled-medicine closing balance must reconcile exactly to opening balance and transaction quantity',
        );
      }
    } catch (error) {
      this.invalidate(
        'closingBalance',
        error instanceof Error
          ? error.message
          : 'Controlled-medicine balances must be valid decimal values',
      );
    }

    validateAllOrNone(
      this,
      [
        'witnessStaffId',
        'witnessMethod',
        'witnessedAt',
      ],
      'Controlled-medicine witness requires staff, method, and timestamp',
    );

    if (
      this.get('witnessRequired') === true &&
      this.get('witnessStaffId') == null
    ) {
      this.invalidate(
        'witnessStaffId',
        'Witness-required controlled-medicine transactions require witness attribution',
      );
    }

    if (
      this.get('witnessStaffId') != null &&
      String(this.get('witnessStaffId')) ===
        String(this.get('pharmacistStaffId'))
    ) {
      this.invalidate(
        'witnessStaffId',
        'Controlled-medicine pharmacist and witness must be different staff members',
      );
    }

    const entryType = String(
      this.get('entryType'),
    );

    if (
      entryType === 'DISPENSE' &&
      (
        this.get('dispensationId') == null ||
        this.get('dispensationItemId') ==
          null ||
        this.get('patientId') == null ||
        this.get('prescriberProviderId') ==
          null ||
        this.get('stockMovementId') == null
      )
    ) {
      this.invalidate(
        'entryType',
        'Controlled-medicine dispensing entries require patient, prescription, dispensation, prescriber, and stock traceability',
      );
    }

    if (
      entryType === 'REVERSAL' &&
      (
        this.get('reversalId') == null ||
        this.get(
          'reversalOfRegisterEntryId',
        ) == null
      )
    ) {
      this.invalidate(
        'reversalOfRegisterEntryId',
        'Controlled-medicine reversals require the original register entry and reversal record',
      );
    }

    const discrepancyStatus = String(
      this.get('discrepancyStatus'),
    );

    if (
      discrepancyStatus !== 'NONE' &&
      (
        this.get('discrepancyQuantity') ==
          null ||
        this.get('discrepancyReason') == null
      )
    ) {
      this.invalidate(
        'discrepancyStatus',
        'Controlled-medicine discrepancies require quantity and reason',
      );
    }

    if (
      discrepancyStatus === 'NONE' &&
      (
        this.get('discrepancyQuantity') !=
          null ||
        this.get('discrepancyReason') != null ||
        this.get('escalationReference') !=
          null
      )
    ) {
      this.invalidate(
        'discrepancyStatus',
        'Non-discrepant controlled-medicine entries cannot retain discrepancy metadata',
      );
    }

    if (
      discrepancyStatus === 'ESCALATED' &&
      this.get('escalationReference') == null
    ) {
      this.invalidate(
        'escalationReference',
        'Escalated controlled-medicine discrepancies require an escalation reference',
      );
    }

    if (
      this.get('inventoryBatchId') == null &&
      (
        this.get('batchNumberSnapshot') !=
          null ||
        this.get('expiryDateSnapshot') != null
      )
    ) {
      this.invalidate(
        'inventoryBatchId',
        'Controlled-medicine batch snapshots require an inventory batch identifier',
      );
    }
  },
);

controlledMedicineRegisterEntrySchema.index(
  {
    facilityId: 1,
    registerNumber: 1,
  },
  {
    name: 'uq_controlled_medicine_register_number',
    unique: true,
  },
);

controlledMedicineRegisterEntrySchema.index(
  {
    facilityId: 1,
    operationKey: 1,
  },
  {
    name: 'uq_controlled_medicine_operation_key',
    unique: true,
  },
);

controlledMedicineRegisterEntrySchema.index(
  {
    facilityId: 1,
    stockLocationId: 1,
    inventoryItemId: 1,
    registerSequence: 1,
  },
  {
    name: 'uq_controlled_medicine_register_sequence',
    unique: true,
  },
);

controlledMedicineRegisterEntrySchema.index(
  {
    facilityId: 1,
    dispensationId: 1,
    dispensationItemId: 1,
    occurredAt: 1,
  },
  {
    name: 'ix_controlled_medicine_dispensing_trace',
  },
);

controlledMedicineRegisterEntrySchema.index(
  {
    facilityId: 1,
    discrepancyStatus: 1,
    occurredAt: 1,
  },
  {
    name: 'ix_controlled_medicine_discrepancy_worklist',
  },
);

export type ControlledMedicineRegisterEntry =
  InferSchemaType<
    typeof controlledMedicineRegisterEntrySchema
  >;

export const ControlledMedicineRegisterEntryModel =
  (mongoose.models[
    'ControlledMedicineRegisterEntry'
  ] as
    | Model<ControlledMedicineRegisterEntry>
    | undefined) ??
  mongoose.model<ControlledMedicineRegisterEntry>(
    'ControlledMedicineRegisterEntry',
    controlledMedicineRegisterEntrySchema,
    'controlledMedicineRegisterEntries',
  );