import type {
  FilterQuery,
} from 'mongoose';

import {
  ClinicalNoteModel,
  ClinicalNoteVersionModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  throwMappedClinicalEmrPersistenceError,
} from '../clinical-emr.persistence-errors.js';

import {
  CLINICAL_NOTE_CONTENT_SELECT,
  CLINICAL_NOTE_STANDARD_SELECT,
  CLINICAL_NOTE_VERSION_INTERNAL_SELECT,
  CLINICAL_NOTE_VERSION_STANDARD_SELECT,
} from '../clinical-emr.projections.js';

import type {
  ClinicalNoteVersionRecord,
  EncryptedClinicalSnapshotRecord,
} from '../clinical-emr.persistence.types.js';

import type {
  ClinicalEmrPageResult,
  ClinicalNoteListQuery,
  ClinicalNoteRecord,
} from '../clinical-emr.types.js';

export interface CreateClinicalNoteRecordInput {
  noteId: string;
  initialVersionId: string;
  facilityId: string;
  noteNumber: string;
  encounterId: string;
  patientId: string;
  authorProviderId: string;
  documentType: ClinicalNoteRecord['documentType'];
  title: string | null;
  narrativeText: string | null;
  structuredData: Record<string, unknown> | readonly unknown[] | null;
  confidentiality: ClinicalNoteRecord['confidentiality'];
  restrictionReason: string | null;
  addendumToNoteId?: string | null;
  supersedesNoteId?: string | null;
  transactionId: string;
  correlationId: string;
  actorUserId: string;
}

export interface CreateClinicalNoteVersionInput {
  versionId: string;
  facilityId: string;
  clinicalNoteId: string;
  encounterId: string;
  patientId: string;
  versionNumber: number;
  previousVersionId: string | null;
  changeType: ClinicalNoteVersionRecord['changeType'];
  statusSnapshot: ClinicalNoteVersionRecord['statusSnapshot'];
  documentTypeSnapshot: ClinicalNoteVersionRecord['documentTypeSnapshot'];
  confidentialitySnapshot: ClinicalNoteVersionRecord['confidentialitySnapshot'];
  encryptedSnapshot: EncryptedClinicalSnapshotRecord;
  snapshotHash: string;
  contentHash: string;
  changeReason: string | null;
  authorProviderId: string;
  signedBy: string | null;
  signatureMethod: ClinicalNoteVersionRecord['signatureMethod'];
  signatureDigest: string | null;
  recordedAt: Date;
  recordedBy: string;
  transactionId: string;
  correlationId: string;
}

function nullableObjectId(
  value: string | null | undefined,
  path: string,
) {
  return value == null
    ? null
    : toObjectId(
        value,
        path,
      );
}

export class ClinicalNoteRepository {
  public async create(
    input: CreateClinicalNoteRecordInput,
  ): Promise<ClinicalNoteRecord> {
    try {
      const created =
        await ClinicalNoteModel.create({
          _id:
            toObjectId(
              input.noteId,
              'noteId',
            ),

          facilityId:
            toObjectId(
              input.facilityId,
              'facilityId',
            ),

          noteNumber:
            input.noteNumber,

          encounterId:
            toObjectId(
              input.encounterId,
              'encounterId',
            ),

          patientId:
            toObjectId(
              input.patientId,
              'patientId',
            ),

          authorProviderId:
            toObjectId(
              input.authorProviderId,
              'authorProviderId',
            ),

          documentType:
            input.documentType,

          title:
            input.title,

          narrativeText:
            input.narrativeText,

          structuredData:
            input.structuredData,

          status:
            'DRAFT',

          confidentiality:
            input.confidentiality,

          restrictionReason:
            input.restrictionReason,

          currentVersion:
            1,

          latestVersionId:
            toObjectId(
              input.initialVersionId,
              'initialVersionId',
            ),

          finalizedAt:
            null,

          finalizedBy:
            null,

          signedAt:
            null,

          signedBy:
            null,

          signatureMethod:
            null,

          signatureDigest:
            null,

          amendedAt:
            null,

          amendedBy:
            null,

          amendmentReason:
            null,

          correctedAt:
            null,

          correctedBy:
            null,

          correctionReason:
            null,

          enteredInErrorAt:
            null,

          enteredInErrorBy:
            null,

          enteredInErrorReason:
            null,

          addendumToNoteId:
            nullableObjectId(
              input.addendumToNoteId,
              'addendumToNoteId',
            ),

          supersedesNoteId:
            nullableObjectId(
              input.supersedesNoteId,
              'supersedesNoteId',
            ),

          supersededByNoteId:
            null,

          transactionId:
            input.transactionId,

          correlationId:
            input.correlationId,

          schemaVersion:
            1,

          version:
            0,

          createdBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),

          updatedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),
        });

      return created.toObject() as ClinicalNoteRecord;
    } catch (error) {
      throwMappedClinicalEmrPersistenceError(
        error,
        'CREATE_CLINICAL_NOTE',
      );
    }
  }

  public async findById(
    facilityId: string,
    clinicalNoteId: string,
    includeContent = false,
  ): Promise<ClinicalNoteRecord | null> {
    return ClinicalNoteModel.findOne({
      _id:
        toObjectId(
          clinicalNoteId,
          'clinicalNoteId',
        ),

      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    })
      .select(
        includeContent
          ? CLINICAL_NOTE_CONTENT_SELECT
          : CLINICAL_NOTE_STANDARD_SELECT,
      )
      .lean<ClinicalNoteRecord>()
      .exec();
  }

  public async findByNumber(
    facilityId: string,
    noteNumber: string,
    includeContent = false,
  ): Promise<ClinicalNoteRecord | null> {
    return ClinicalNoteModel.findOne({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      noteNumber:
        noteNumber
          .trim()
          .toLocaleUpperCase('en-US'),
    })
      .select(
        includeContent
          ? CLINICAL_NOTE_CONTENT_SELECT
          : CLINICAL_NOTE_STANDARD_SELECT,
      )
      .lean<ClinicalNoteRecord>()
      .exec();
  }

  public async list(
    facilityId: string,
    query: ClinicalNoteListQuery,
  ): Promise<ClinicalEmrPageResult<ClinicalNoteRecord>> {
    const filter:
      FilterQuery<ClinicalNoteRecord> = {
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      };

    if (query.encounterId !== undefined) {
      filter.encounterId =
        toObjectId(
          query.encounterId,
          'encounterId',
        );
    }

    if (query.patientId !== undefined) {
      filter.patientId =
        toObjectId(
          query.patientId,
          'patientId',
        );
    }

    if (query.authorProviderId !== undefined) {
      filter.authorProviderId =
        toObjectId(
          query.authorProviderId,
          'authorProviderId',
        );
    }

    if (query.documentType !== undefined) {
      filter.documentType =
        query.documentType;
    }

    if (query.status !== undefined) {
      filter.status =
        query.status;
    }

    if (query.confidentiality !== undefined) {
      filter.confidentiality =
        query.confidentiality;
    }

    const skip =
      (query.page - 1) *
      query.pageSize;

    const direction =
      query.sortDirection === 'asc'
        ? 1
        : -1;

    const [
      items,
      totalItems,
    ] =
      await Promise.all([
        ClinicalNoteModel.find(filter)
          .select(CLINICAL_NOTE_STANDARD_SELECT)
          .sort({
            [query.sortBy]: direction,
            _id: direction,
          })
          .skip(skip)
          .limit(query.pageSize)
          .lean<ClinicalNoteRecord[]>()
          .exec(),

        ClinicalNoteModel.countDocuments(filter).exec(),
      ]);

    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages:
        Math.ceil(
          totalItems /
          query.pageSize,
        ),
    };
  }

  public async updateDraftWithVersion(
    input: Readonly<{
      facilityId: string;
      clinicalNoteId: string;
      expectedVersion: number;
      nextClinicalVersion: number;
      versionId: string;
      title: string | null;
      narrativeText: string | null;
      structuredData: Record<string, unknown> | readonly unknown[] | null;
      confidentiality: ClinicalNoteRecord['confidentiality'];
      restrictionReason: string | null;
      actorUserId: string;
    }>,
  ): Promise<ClinicalNoteRecord | null> {
    return ClinicalNoteModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.clinicalNoteId,
            'clinicalNoteId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,

        status:
          'DRAFT',
      },
      {
        $set: {
          title:
            input.title,

          narrativeText:
            input.narrativeText,

          structuredData:
            input.structuredData,

          confidentiality:
            input.confidentiality,

          restrictionReason:
            input.restrictionReason,

          currentVersion:
            input.nextClinicalVersion,

          latestVersionId:
            toObjectId(
              input.versionId,
              'versionId',
            ),

          updatedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),
        },

        $inc: {
          version: 1,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    )
      .select(CLINICAL_NOTE_CONTENT_SELECT)
      .lean<ClinicalNoteRecord>()
      .exec();
  }

  public async finalizeWithVersion(
    input: Readonly<{
      facilityId: string;
      clinicalNoteId: string;
      expectedVersion: number;
      nextClinicalVersion: number;
      versionId: string;
      occurredAt: Date;
      actorUserId: string;
      signatureMethod: ClinicalNoteRecord['signatureMethod'];
      signatureDigest: string | null;
    }>,
  ): Promise<ClinicalNoteRecord | null> {
    const signed =
      input.signatureMethod !== null &&
      input.signatureDigest !== null;

    return ClinicalNoteModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.clinicalNoteId,
            'clinicalNoteId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,

        status:
          'DRAFT',
      },
      {
        $set: {
          status:
            'FINAL',

          currentVersion:
            input.nextClinicalVersion,

          latestVersionId:
            toObjectId(
              input.versionId,
              'versionId',
            ),

          finalizedAt:
            input.occurredAt,

          finalizedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),

          signedAt:
            signed
              ? input.occurredAt
              : null,

          signedBy:
            signed
              ? toObjectId(
                  input.actorUserId,
                  'actorUserId',
                )
              : null,

          signatureMethod:
            input.signatureMethod,

          signatureDigest:
            input.signatureDigest,

          updatedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),
        },

        $inc: {
          version: 1,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    )
      .select(CLINICAL_NOTE_CONTENT_SELECT)
      .lean<ClinicalNoteRecord>()
      .exec();
  }

  public async amendWithVersion(
    input: Readonly<{
      facilityId: string;
      clinicalNoteId: string;
      expectedVersion: number;
      nextClinicalVersion: number;
      versionId: string;
      title: string | null;
      narrativeText: string | null;
      structuredData: Record<string, unknown> | readonly unknown[] | null;
      confidentiality: ClinicalNoteRecord['confidentiality'];
      restrictionReason: string | null;
      reason: string;
      occurredAt: Date;
      actorUserId: string;
    }>,
  ): Promise<ClinicalNoteRecord | null> {
    return ClinicalNoteModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.clinicalNoteId,
            'clinicalNoteId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,

        status: {
          $in: [
            'FINAL',
            'AMENDED',
          ],
        },
      },
      {
        $set: {
          status:
            'AMENDED',

          title:
            input.title,

          narrativeText:
            input.narrativeText,

          structuredData:
            input.structuredData,

          confidentiality:
            input.confidentiality,

          restrictionReason:
            input.restrictionReason,

          currentVersion:
            input.nextClinicalVersion,

          latestVersionId:
            toObjectId(
              input.versionId,
              'versionId',
            ),

          amendedAt:
            input.occurredAt,

          amendedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),

          amendmentReason:
            input.reason,

          updatedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),
        },

        $inc: {
          version: 1,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    )
      .select(CLINICAL_NOTE_CONTENT_SELECT)
      .lean<ClinicalNoteRecord>()
      .exec();
  }

  public async markCorrectedWithVersion(
    input: Readonly<{
      facilityId: string;
      clinicalNoteId: string;
      expectedVersion: number;
      nextClinicalVersion: number;
      versionId: string;
      replacementNoteId: string;
      reason: string;
      occurredAt: Date;
      actorUserId: string;
    }>,
  ): Promise<ClinicalNoteRecord | null> {
    return ClinicalNoteModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.clinicalNoteId,
            'clinicalNoteId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,

        status: {
          $in: [
            'FINAL',
            'AMENDED',
          ],
        },
      },
      {
        $set: {
          status:
            'CORRECTED',

          currentVersion:
            input.nextClinicalVersion,

          latestVersionId:
            toObjectId(
              input.versionId,
              'versionId',
            ),

          correctedAt:
            input.occurredAt,

          correctedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),

          correctionReason:
            input.reason,

          supersededByNoteId:
            toObjectId(
              input.replacementNoteId,
              'replacementNoteId',
            ),

          updatedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),
        },

        $inc: {
          version: 1,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    )
      .select(CLINICAL_NOTE_CONTENT_SELECT)
      .lean<ClinicalNoteRecord>()
      .exec();
  }

  public async markEnteredInErrorWithVersion(
    input: Readonly<{
      facilityId: string;
      clinicalNoteId: string;
      expectedVersion: number;
      nextClinicalVersion: number;
      versionId: string;
      reason: string;
      occurredAt: Date;
      actorUserId: string;
    }>,
  ): Promise<ClinicalNoteRecord | null> {
    return ClinicalNoteModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.clinicalNoteId,
            'clinicalNoteId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,

        status: {
          $in: [
            'DRAFT',
            'FINAL',
            'AMENDED',
          ],
        },
      },
      {
        $set: {
          status:
            'ENTERED_IN_ERROR',

          currentVersion:
            input.nextClinicalVersion,

          latestVersionId:
            toObjectId(
              input.versionId,
              'versionId',
            ),

          enteredInErrorAt:
            input.occurredAt,

          enteredInErrorBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),

          enteredInErrorReason:
            input.reason,

          updatedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),
        },

        $inc: {
          version: 1,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    )
      .select(CLINICAL_NOTE_CONTENT_SELECT)
      .lean<ClinicalNoteRecord>()
      .exec();
  }
}

export class ClinicalNoteVersionRepository {
  public async create(
    input: CreateClinicalNoteVersionInput,
  ): Promise<ClinicalNoteVersionRecord> {
    try {
      const created =
        await ClinicalNoteVersionModel.create({
          _id:
            toObjectId(
              input.versionId,
              'versionId',
            ),

          facilityId:
            toObjectId(
              input.facilityId,
              'facilityId',
            ),

          clinicalNoteId:
            toObjectId(
              input.clinicalNoteId,
              'clinicalNoteId',
            ),

          encounterId:
            toObjectId(
              input.encounterId,
              'encounterId',
            ),

          patientId:
            toObjectId(
              input.patientId,
              'patientId',
            ),

          versionNumber:
            input.versionNumber,

          previousVersionId:
            input.previousVersionId === null
              ? null
              : toObjectId(
                  input.previousVersionId,
                  'previousVersionId',
                ),

          changeType:
            input.changeType,

          statusSnapshot:
            input.statusSnapshot,

          documentTypeSnapshot:
            input.documentTypeSnapshot,

          confidentialitySnapshot:
            input.confidentialitySnapshot,

          encryptedSnapshot:
            input.encryptedSnapshot,

          snapshotHash:
            input.snapshotHash,

          contentHash:
            input.contentHash,

          changeReason:
            input.changeReason,

          authorProviderId:
            toObjectId(
              input.authorProviderId,
              'authorProviderId',
            ),

          signedBy:
            input.signedBy === null
              ? null
              : toObjectId(
                  input.signedBy,
                  'signedBy',
                ),

          signatureMethod:
            input.signatureMethod,

          signatureDigest:
            input.signatureDigest,

          recordedAt:
            input.recordedAt,

          recordedBy:
            toObjectId(
              input.recordedBy,
              'recordedBy',
            ),

          transactionId:
            input.transactionId,

          correlationId:
            input.correlationId,

          schemaVersion:
            1,

          version:
            0,

          createdBy:
            toObjectId(
              input.recordedBy,
              'recordedBy',
            ),

          updatedBy:
            toObjectId(
              input.recordedBy,
              'recordedBy',
            ),
        });

      return created.toObject() as ClinicalNoteVersionRecord;
    } catch (error) {
      throwMappedClinicalEmrPersistenceError(
        error,
        'CREATE_CLINICAL_NOTE_VERSION',
      );
    }
  }

  public async findById(
    facilityId: string,
    versionId: string,
    includeEncryptedSnapshot = false,
  ): Promise<ClinicalNoteVersionRecord | null> {
    return ClinicalNoteVersionModel.findOne({
      _id:
        toObjectId(
          versionId,
          'versionId',
        ),

      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    })
      .select(
        includeEncryptedSnapshot
          ? CLINICAL_NOTE_VERSION_INTERNAL_SELECT
          : CLINICAL_NOTE_VERSION_STANDARD_SELECT,
      )
      .lean<ClinicalNoteVersionRecord>()
      .exec();
  }

  public async findLatestForNote(
    facilityId: string,
    clinicalNoteId: string,
    includeEncryptedSnapshot = false,
  ): Promise<ClinicalNoteVersionRecord | null> {
    return ClinicalNoteVersionModel.findOne({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      clinicalNoteId:
        toObjectId(
          clinicalNoteId,
          'clinicalNoteId',
        ),
    })
      .select(
        includeEncryptedSnapshot
          ? CLINICAL_NOTE_VERSION_INTERNAL_SELECT
          : CLINICAL_NOTE_VERSION_STANDARD_SELECT,
      )
      .sort({
        versionNumber: -1,
      })
      .lean<ClinicalNoteVersionRecord>()
      .exec();
  }

  public async listForNote(
    facilityId: string,
    clinicalNoteId: string,
    includeEncryptedSnapshot = false,
  ): Promise<ClinicalNoteVersionRecord[]> {
    return ClinicalNoteVersionModel.find({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      clinicalNoteId:
        toObjectId(
          clinicalNoteId,
          'clinicalNoteId',
        ),
    })
      .select(
        includeEncryptedSnapshot
          ? CLINICAL_NOTE_VERSION_INTERNAL_SELECT
          : CLINICAL_NOTE_VERSION_STANDARD_SELECT,
      )
      .sort({
        versionNumber: 1,
      })
      .lean<ClinicalNoteVersionRecord[]>()
      .exec();
  }
}