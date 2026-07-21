import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  validatePositiveInventoryDecimal,
} from './inventory-schema-helpers.js';

import {
  nullablePharmacyObjectId,
  pharmacyCommonFields,
  pharmacyObjectIdArray,
  pharmacyStringArray,
  pharmacyTimestampedSchemaOptions,
  validateAllOrNone,
} from './pharmacy-dispensing-schema-helpers.js';

import {
  dispensingLabelPrintReasonValues,
  dispensingLabelStatusValues,
  pharmacyAcknowledgementMethodValues,
  pharmacyCounsellingStatusValues,
} from './pharmacy-dispensing.types.js';

const nullableString = {
  type: String,
  default: null,
  trim: true,
} as const;

const labelWarningSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 100,
    },

    text: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 2_000,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

export const dispensingLabelSchema =
  new Schema(
    {
      ...pharmacyCommonFields,

      labelNumber: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        minlength: 3,
        maxlength: 120,
      },

      dispensationId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      dispensationItemId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      patientId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      prescriptionId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      pharmacyLocationId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      templateCode: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        minlength: 2,
        maxlength: 100,
      },

      templateVersion: {
        type: Number,
        required: true,
        immutable: true,
        min: 1,
      },

      languageCode: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        lowercase: true,
        minlength: 2,
        maxlength: 20,
      },

      status: {
        type: String,
        required: true,
        enum: dispensingLabelStatusValues,
        default: 'DRAFT',
      },

      patientDisplayName: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 1,
        maxlength: 300,
        select: false,
      },

      patientIdentifierSnapshot: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 1,
        maxlength: 120,
        select: false,
      },

      medicineName: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 2,
        maxlength: 500,
      },

      strength: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 1,
        maxlength: 150,
      },

      dosageForm: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 1,
        maxlength: 200,
      },

      quantity: {
        type: Schema.Types.Decimal128,
        required: true,
        immutable: true,
      },

      quantityUnitLabel: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 1,
        maxlength: 50,
      },

      instructions: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 2,
        maxlength: 5_000,
        select: false,
      },

      route: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 1,
        maxlength: 150,
      },

      frequency: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 1,
        maxlength: 200,
      },

      duration: {
        ...nullableString,
        maxlength: 200,
        immutable: true,
      },

      warnings: {
        type: [labelWarningSchema],
        required: true,
        default: [],
        immutable: true,
      },

      storageInstructions: {
        ...nullableString,
        maxlength: 1_000,
        immutable: true,
      },

      batchNumber: {
        ...nullableString,
        uppercase: true,
        maxlength: 200,
        immutable: true,
      },

      expiryDate: {
        type: Date,
        default: null,
        immutable: true,
      },

      dispensedAt: {
        type: Date,
        required: true,
        immutable: true,
      },

      pharmacyDisplayName: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 2,
        maxlength: 300,
      },

      pharmacistDisplayName: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 2,
        maxlength: 300,
      },

      generatedByStaffId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      generatedAt: {
        type: Date,
        required: true,
        immutable: true,
      },

      printCount: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
      },

      lastPrintedAt: {
        type: Date,
        default: null,
      },

      voidedAt: {
        type: Date,
        default: null,
      },

      voidedByStaffId:
        nullablePharmacyObjectId,

      voidReason: {
        ...nullableString,
        minlength: 5,
        maxlength: 2_000,
        select: false,
      },

      medicationGuideAttachmentIds:
        pharmacyObjectIdArray,
    },
    pharmacyTimestampedSchemaOptions(
      'dispensingLabels',
    ),
  );

dispensingLabelSchema.pre(
  'validate',
  function validateDispensingLabel() {
    validatePositiveInventoryDecimal(
      this,
      'quantity',
      this.get('quantity'),
    );

    if (
      Number(this.get('printCount')) > 0 &&
      this.get('lastPrintedAt') == null
    ) {
      this.invalidate(
        'lastPrintedAt',
        'Printed labels require a last-print timestamp',
      );
    }

    if (
      this.get('status') === 'PRINTED' &&
      Number(this.get('printCount')) < 1
    ) {
      this.invalidate(
        'printCount',
        'Printed label status requires at least one print event',
      );
    }

    if (
      this.get('status') === 'VOID' &&
      (
        this.get('voidedAt') == null ||
        this.get('voidedByStaffId') == null ||
        this.get('voidReason') == null
      )
    ) {
      this.invalidate(
        'status',
        'Voided labels require actor, timestamp, and reason',
      );
    }
  },
);

dispensingLabelSchema.index(
  {
    facilityId: 1,
    labelNumber: 1,
  },
  {
    name: 'uq_dispensing_labels_number',
    unique: true,
  },
);

dispensingLabelSchema.index(
  {
    facilityId: 1,
    dispensationItemId: 1,
    status: 1,
    templateVersion: -1,
  },
  {
    name: 'ix_dispensing_labels_item_status',
  },
);

export const dispensingLabelPrintSchema =
  new Schema(
    {
      ...pharmacyCommonFields,

      dispensingLabelId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      dispensationId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      dispensationItemId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      printSequence: {
        type: Number,
        required: true,
        immutable: true,
        min: 1,
      },

      reason: {
        type: String,
        required: true,
        immutable: true,
        enum: dispensingLabelPrintReasonValues,
      },

      labelVersion: {
        type: Number,
        required: true,
        immutable: true,
        min: 0,
      },

      printerIdentifier: {
        ...nullableString,
        maxlength: 200,
        immutable: true,
      },

      workstationIdentifier: {
        ...nullableString,
        maxlength: 200,
        immutable: true,
      },

      previousPrintId: {
        ...nullablePharmacyObjectId,
        immutable: true,
      },

      printedByStaffId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      printedAt: {
        type: Date,
        required: true,
        immutable: true,
      },
    },
    pharmacyTimestampedSchemaOptions(
      'dispensingLabelPrints',
    ),
  );

dispensingLabelPrintSchema.pre(
  'validate',
  function validateDispensingLabelPrint() {
    if (
      this.get('reason') !== 'INITIAL' &&
      this.get('previousPrintId') == null
    ) {
      this.invalidate(
        'previousPrintId',
        'Label reprints and corrections require the previous print reference',
      );
    }

    if (
      this.get('reason') === 'INITIAL' &&
      Number(this.get('printSequence')) !== 1
    ) {
      this.invalidate(
        'printSequence',
        'Initial label print must be sequence one',
      );
    }
  },
);

dispensingLabelPrintSchema.index(
  {
    facilityId: 1,
    dispensingLabelId: 1,
    printSequence: 1,
  },
  {
    name: 'uq_dispensing_label_print_sequence',
    unique: true,
  },
);

dispensingLabelPrintSchema.index(
  {
    facilityId: 1,
    dispensationId: 1,
    printedAt: -1,
  },
  {
    name: 'ix_dispensing_label_prints_dispensation',
  },
);

export const pharmacyCounsellingRecordSchema =
  new Schema(
    {
      ...pharmacyCommonFields,

      dispensationId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      patientId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      dispensationItemIds:
        pharmacyObjectIdArray,

      counsellingRequired: {
        type: Boolean,
        required: true,
        immutable: true,
      },

      status: {
        type: String,
        required: true,
        enum: pharmacyCounsellingStatusValues,
        default: 'PENDING',
      },

      topics:
        pharmacyStringArray,

      languageCode: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        minlength: 2,
        maxlength: 20,
      },

      interpreterUsed: {
        type: Boolean,
        required: true,
        default: false,
      },

      interpreterStaffId:
        nullablePharmacyObjectId,

      interpreterName: {
        ...nullableString,
        maxlength: 300,
        select: false,
      },

      counselledPerson: {
        type: String,
        required: true,
        enum: [
          'PATIENT',
          'CAREGIVER',
          'BOTH',
        ],
        default: 'PATIENT',
      },

      caregiverName: {
        ...nullableString,
        maxlength: 300,
        select: false,
      },

      acknowledgementMethod: {
        type: String,
        default: null,
        enum: [
          ...pharmacyAcknowledgementMethodValues,
          null,
        ],
      },

      acknowledgementAttachmentId:
        nullablePharmacyObjectId,

      completedByStaffId:
        nullablePharmacyObjectId,

      completedAt: {
        type: Date,
        default: null,
      },

      declinedReason: {
        ...nullableString,
        minlength: 5,
        maxlength: 2_000,
        select: false,
      },

      unableReason: {
        ...nullableString,
        minlength: 5,
        maxlength: 2_000,
        select: false,
      },

      notes: {
        ...nullableString,
        maxlength: 5_000,
        select: false,
      },

      correctionOfCounsellingRecordId:
        nullablePharmacyObjectId,

      attachmentIds:
        pharmacyObjectIdArray,
    },
    pharmacyTimestampedSchemaOptions(
      'pharmacyCounsellingRecords',
    ),
  );

pharmacyCounsellingRecordSchema.pre(
  'validate',
  function validatePharmacyCounsellingRecord() {
    if (
      this.get('counsellingRequired') !==
        true &&
      this.get('status') !== 'NOT_REQUIRED'
    ) {
      this.invalidate(
        'status',
        'Counselling that is not required must use NOT_REQUIRED status',
      );
    }

    if (
      this.get('counsellingRequired') ===
        true &&
      this.get('status') === 'NOT_REQUIRED'
    ) {
      this.invalidate(
        'status',
        'Required counselling cannot use NOT_REQUIRED status',
      );
    }

    if (
      this.get('interpreterUsed') === true &&
      this.get('interpreterStaffId') == null &&
      this.get('interpreterName') == null
    ) {
      this.invalidate(
        'interpreterUsed',
        'Interpreter use requires staff or external interpreter attribution',
      );
    }

    const status = String(
      this.get('status'),
    );

    if (
      status === 'COMPLETED' &&
      (
        this.get('completedByStaffId') ==
          null ||
        this.get('completedAt') == null ||
        this.get('acknowledgementMethod') ==
          null ||
        (
          this.get('topics') as string[]
        ).length === 0
      )
    ) {
      this.invalidate(
        'status',
        'Completed counselling requires counsellor, timestamp, topics, and acknowledgement',
      );
    }

    if (
      status === 'DECLINED' &&
      this.get('declinedReason') == null
    ) {
      this.invalidate(
        'declinedReason',
        'Declined counselling requires a reason',
      );
    }

    if (
      status === 'UNABLE' &&
      this.get('unableReason') == null
    ) {
      this.invalidate(
        'unableReason',
        'Unable-to-counsel status requires a reason',
      );
    }

    validateAllOrNone(
      this,
      [
        'completedByStaffId',
        'completedAt',
      ],
      'Counselling completion requires actor and timestamp',
    );

    if (
      this.get('counselledPerson') ===
        'CAREGIVER' &&
      this.get('caregiverName') == null
    ) {
      this.invalidate(
        'caregiverName',
        'Caregiver counselling requires caregiver attribution',
      );
    }
  },
);

pharmacyCounsellingRecordSchema.index(
  {
    facilityId: 1,
    dispensationId: 1,
    createdAt: -1,
  },
  {
    name: 'ix_pharmacy_counselling_dispensation',
  },
);

pharmacyCounsellingRecordSchema.index(
  {
    facilityId: 1,
    dispensationId: 1,
    status: 1,
  },
  {
    name: 'uq_pharmacy_counselling_active',
    unique: true,
    partialFilterExpression: {
      status: {
        $in: [
          'PENDING',
          'COMPLETED',
          'DECLINED',
          'UNABLE',
        ],
      },
    },
  },
);

export type DispensingLabel =
  InferSchemaType<
    typeof dispensingLabelSchema
  >;
export type DispensingLabelPrint =
  InferSchemaType<
    typeof dispensingLabelPrintSchema
  >;
export type PharmacyCounsellingRecord =
  InferSchemaType<
    typeof pharmacyCounsellingRecordSchema
  >;

export const DispensingLabelModel =
  (mongoose.models[
    'DispensingLabel'
  ] as Model<DispensingLabel> | undefined) ??
  mongoose.model<DispensingLabel>(
    'DispensingLabel',
    dispensingLabelSchema,
    'dispensingLabels',
  );

export const DispensingLabelPrintModel =
  (mongoose.models[
    'DispensingLabelPrint'
  ] as
    | Model<DispensingLabelPrint>
    | undefined) ??
  mongoose.model<DispensingLabelPrint>(
    'DispensingLabelPrint',
    dispensingLabelPrintSchema,
    'dispensingLabelPrints',
  );

export const PharmacyCounsellingRecordModel =
  (mongoose.models[
    'PharmacyCounsellingRecord'
  ] as
    | Model<PharmacyCounsellingRecord>
    | undefined) ??
  mongoose.model<PharmacyCounsellingRecord>(
    'PharmacyCounsellingRecord',
    pharmacyCounsellingRecordSchema,
    'pharmacyCounsellingRecords',
  );