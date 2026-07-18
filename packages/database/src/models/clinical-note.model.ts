import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

import {
  clinicalConfidentialityValues,
  clinicalDocumentStatusValues,
  clinicalDocumentTypeValues,
  clinicalDocumentVersionChangeTypeValues,
  providerSignatureMethodValues,
} from './clinical-emr.types.js';

const encryptedClinicalSnapshotSchema = new Schema(
  {
    algorithm: {
      type: String,
      required: true,
      immutable: true,
      enum: ['AES-256-GCM'],
    },
    keyVersion: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    initializationVector: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 16,
      maxlength: 256,
    },
    authenticationTag: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 16,
      maxlength: 256,
    },
    ciphertext: {
      type: String,
      required: true,
      immutable: true,
      minlength: 1,
      maxlength: 20_000_000,
      select: false,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

export const clinicalNoteSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    noteNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 120,
    },
    encounterId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    authorProviderId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    documentType: {
      type: String,
      required: true,
      enum: clinicalDocumentTypeValues,
      immutable: true,
    },
    title: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
    },
    narrativeText: {
      type: String,
      default: null,
      maxlength: 200_000,
      select: false,
    },
    structuredData: {
      type: Schema.Types.Mixed,
      default: null,
      select: false,
    },
    status: {
      type: String,
      required: true,
      enum: clinicalDocumentStatusValues,
      default: 'DRAFT',
    },
    confidentiality: {
      type: String,
      required: true,
      enum: clinicalConfidentialityValues,
      default: 'ROUTINE',
    },
    restrictionReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 1_000,
      select: false,
    },
    currentVersion: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    latestVersionId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    finalizedAt: {
      type: Date,
      default: null,
    },
    finalizedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    signedAt: {
      type: Date,
      default: null,
    },
    signedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    signatureMethod: {
      type: String,
      enum: [...providerSignatureMethodValues, null],
      default: null,
    },
    signatureDigest: {
      type: String,
      default: null,
      trim: true,
      minlength: 32,
      maxlength: 256,
      select: false,
    },
    amendedAt: {
      type: Date,
      default: null,
    },
    amendedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    amendmentReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },
    correctedAt: {
      type: Date,
      default: null,
    },
    correctedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    correctionReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },
    enteredInErrorAt: {
      type: Date,
      default: null,
    },
    enteredInErrorBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    enteredInErrorReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },
    addendumToNoteId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    supersedesNoteId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    supersededByNoteId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    transactionId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
    },
    correlationId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
    },
    schemaVersion: {
      type: Number,
      required: true,
      immutable: true,
      default: 1,
      min: 1,
    },
    version: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      required: true,
    },
  },
  {
    collection: 'clinicalNotes',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

clinicalNoteSchema.pre('validate', function validateClinicalNote() {
  if (this.narrativeText == null && this.structuredData == null) {
    this.invalidate(
      'narrativeText',
      'Clinical notes require narrativeText, structuredData, or both',
    );
  }

  if (
    this.documentType === 'ADDENDUM' &&
    this.addendumToNoteId == null
  ) {
    this.invalidate(
      'addendumToNoteId',
      'Addenda require the parent clinical note',
    );
  }

  if (
    this.documentType !== 'ADDENDUM' &&
    this.addendumToNoteId != null
  ) {
    this.invalidate(
      'documentType',
      'Only addenda may reference addendumToNoteId',
    );
  }

  if (
    this.confidentiality !== 'ROUTINE' &&
    this.restrictionReason == null
  ) {
    this.invalidate(
      'restrictionReason',
      'Restricted clinical notes require a minimum-necessary access reason',
    );
  }

  if (this.status === 'DRAFT') {
    if (
      this.finalizedAt != null ||
      this.finalizedBy != null ||
      this.signedAt != null ||
      this.signedBy != null ||
      this.signatureMethod != null ||
      this.signatureDigest != null
    ) {
      this.invalidate(
        'status',
        'Draft notes cannot contain finalization or signature metadata',
      );
    }
  } else if (
    this.finalizedAt == null ||
    this.finalizedBy == null
  ) {
    this.invalidate(
      'status',
      'Non-draft notes require finalization attribution',
    );
  }

  if (this.signedAt != null) {
    if (
      this.signedBy == null ||
      this.signatureMethod == null ||
      this.signatureDigest == null ||
      this.finalizedAt == null ||
      this.signedAt < this.finalizedAt
    ) {
      this.invalidate(
        'signedAt',
        'Signed notes require complete signature attribution after finalization',
      );
    }
  } else if (
    this.signedBy != null ||
    this.signatureMethod != null ||
    this.signatureDigest != null
  ) {
    this.invalidate(
      'signedAt',
      'Signature metadata requires signedAt',
    );
  }

  if (this.status === 'AMENDED') {
    if (
      this.amendedAt == null ||
      this.amendedBy == null ||
      this.amendmentReason == null
    ) {
      this.invalidate(
        'status',
        'Amended notes require amendment attribution and reason',
      );
    }
  }

  if (this.status === 'CORRECTED') {
    if (
      this.correctedAt == null ||
      this.correctedBy == null ||
      this.correctionReason == null ||
      this.supersededByNoteId == null
    ) {
      this.invalidate(
        'status',
        'Corrected notes require correction attribution, reason, and replacement note',
      );
    }
  } else if (this.supersededByNoteId != null) {
    this.invalidate(
      'supersededByNoteId',
      'Only corrected notes may reference a replacement note',
    );
  }

  if (this.status === 'ENTERED_IN_ERROR') {
    if (
      this.enteredInErrorAt == null ||
      this.enteredInErrorBy == null ||
      this.enteredInErrorReason == null
    ) {
      this.invalidate(
        'status',
        'Notes entered in error require attribution and a non-destructive reason',
      );
    }
  }

  if (
    this.supersedesNoteId != null &&
    this.supersedesNoteId.equals(this._id)
  ) {
    this.invalidate(
      'supersedesNoteId',
      'A clinical note cannot supersede itself',
    );
  }
});

clinicalNoteSchema.index(
  {
    facilityId: 1,
    noteNumber: 1,
  },
  {
    name: 'uq_clinical_notes_facility_number',
    unique: true,
  },
);

clinicalNoteSchema.index(
  {
    facilityId: 1,
    encounterId: 1,
    documentType: 1,
    createdAt: -1,
  },
  {
    name: 'ix_clinical_notes_facility_encounter_type_created',
  },
);

clinicalNoteSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    status: 1,
    createdAt: -1,
  },
  {
    name: 'ix_clinical_notes_facility_patient_status_created',
  },
);

clinicalNoteSchema.index(
  {
    facilityId: 1,
    authorProviderId: 1,
    status: 1,
    updatedAt: -1,
  },
  {
    name: 'ix_clinical_notes_facility_author_status_updated',
  },
);

clinicalNoteSchema.index(
  {
    facilityId: 1,
    addendumToNoteId: 1,
    createdAt: 1,
  },
  {
    name: 'ix_clinical_notes_facility_addendum_parent_created',
    partialFilterExpression: {
      addendumToNoteId: {
        $type: 'objectId',
      },
    },
  },
);

export const clinicalNoteVersionSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    clinicalNoteId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    encounterId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    versionNumber: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
    },
    previousVersionId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    changeType: {
      type: String,
      required: true,
      enum: clinicalDocumentVersionChangeTypeValues,
      immutable: true,
    },
    statusSnapshot: {
      type: String,
      required: true,
      enum: clinicalDocumentStatusValues,
      immutable: true,
    },
    documentTypeSnapshot: {
      type: String,
      required: true,
      enum: clinicalDocumentTypeValues,
      immutable: true,
    },
    confidentialitySnapshot: {
      type: String,
      required: true,
      enum: clinicalConfidentialityValues,
      immutable: true,
    },
    encryptedSnapshot: {
      type: encryptedClinicalSnapshotSchema,
      required: true,
      immutable: true,
      select: false,
    },
    snapshotHash: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 32,
      maxlength: 256,
    },
    contentHash: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 32,
      maxlength: 256,
    },
    changeReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
      immutable: true,
      select: false,
    },
    authorProviderId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    signedBy: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    signatureMethod: {
      type: String,
      enum: [...providerSignatureMethodValues, null],
      default: null,
      immutable: true,
    },
    signatureDigest: {
      type: String,
      default: null,
      trim: true,
      minlength: 32,
      maxlength: 256,
      immutable: true,
      select: false,
    },
    recordedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    recordedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    transactionId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
    },
    correlationId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
    },
    schemaVersion: {
      type: Number,
      required: true,
      immutable: true,
      default: 1,
      min: 1,
    },
    version: {
      type: Number,
      required: true,
      immutable: true,
      default: 0,
      min: 0,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
  },
  {
    collection: 'clinicalNoteVersions',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

clinicalNoteVersionSchema.pre(
  'validate',
  function validateClinicalNoteVersion() {
    if (
      this.versionNumber === 1 &&
      this.previousVersionId != null
    ) {
      this.invalidate(
        'previousVersionId',
        'The first note version cannot have a previous version',
      );
    }

    if (
      this.versionNumber > 1 &&
      this.previousVersionId == null
    ) {
      this.invalidate(
        'previousVersionId',
        'Subsequent note versions require previousVersionId',
      );
    }

    const requiresReason = [
      'AMENDED',
      'CORRECTED',
      'ENTERED_IN_ERROR',
    ].includes(this.changeType);

    if (
      requiresReason &&
      this.changeReason == null
    ) {
      this.invalidate(
        'changeReason',
        `${this.changeType} versions require a reason`,
      );
    }
  },
);

clinicalNoteVersionSchema.index(
  {
    facilityId: 1,
    clinicalNoteId: 1,
    versionNumber: 1,
  },
  {
    name: 'uq_clinical_note_versions_note_version',
    unique: true,
  },
);

clinicalNoteVersionSchema.index(
  {
    facilityId: 1,
    encounterId: 1,
    recordedAt: -1,
  },
  {
    name: 'ix_clinical_note_versions_encounter_recorded',
  },
);

clinicalNoteVersionSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    recordedAt: -1,
  },
  {
    name: 'ix_clinical_note_versions_patient_recorded',
  },
);

export type ClinicalNoteDocument =
  InferSchemaType<typeof clinicalNoteSchema>;

export type ClinicalNoteVersionDocument =
  InferSchemaType<typeof clinicalNoteVersionSchema>;

export const ClinicalNoteModel =
  (mongoose.models['clinicalNotes'] as
    | Model<ClinicalNoteDocument>
    | undefined) ??
  mongoose.model<ClinicalNoteDocument>(
    'clinicalNotes',
    clinicalNoteSchema,
    'clinicalNotes',
  );

export const ClinicalNoteVersionModel =
  (mongoose.models['clinicalNoteVersions'] as
    | Model<ClinicalNoteVersionDocument>
    | undefined) ??
  mongoose.model<ClinicalNoteVersionDocument>(
    'clinicalNoteVersions',
    clinicalNoteVersionSchema,
    'clinicalNoteVersions',
  );