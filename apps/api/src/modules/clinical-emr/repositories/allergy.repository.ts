import type {
  FilterQuery,
} from 'mongoose';

import {
  AllergyModel,
  PatientAllergyModel,
  PatientAllergyVersionModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  buildActiveAllergyKey,
  normalizeClinicalCode,
  normalizeClinicalDisplay,
  normalizeClinicalSearchText,
  normalizeClinicalSynonyms,
} from '../clinical-emr.normalization.js';

import {
  throwMappedClinicalEmrPersistenceError,
} from '../clinical-emr.persistence-errors.js';

import {
  ALLERGY_INTERNAL_SELECT,
  ALLERGY_STANDARD_SELECT,
  PATIENT_ALLERGY_CONTENT_SELECT,
  PATIENT_ALLERGY_STANDARD_SELECT,
  PATIENT_ALLERGY_VERSION_INTERNAL_SELECT,
  PATIENT_ALLERGY_VERSION_STANDARD_SELECT,
} from '../clinical-emr.projections.js';

import type {
  AllergyCatalogListQuery,
  AllergyRecord,
  EncryptedClinicalSnapshotRecord,
  PatientAllergyListQuery,
  PatientAllergyVersionRecord,
} from '../clinical-emr.persistence.types.js';

import type {
  AllergyReactionInput,
  ClinicalEmrPageResult,
  PatientAllergyRecord,
} from '../clinical-emr.types.js';

function escapeRegularExpression(
  value: string,
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/gu,
    '\\$&',
  );
}

export interface PersistedAllergyReactionInput {
  manifestation: string;
  severity: AllergyReactionInput['severity'];
  occurredAt: Date | null;
  notes: string | null;
}

export interface CreateAllergyRecordInput {
  allergyId: string;
  facilityId: string;
  code: string;
  category: AllergyRecord['category'];
  name: string;
  synonyms?: readonly string[];
  description?: string | null;
  actorUserId: string;
}

export interface CreatePatientAllergyRecordInput {
  patientAllergyId: string;
  initialVersionId: string;
  facilityId: string;
  patientId: string;
  recordType: PatientAllergyRecord['recordType'];
  allergyId: string | null;
  category: PatientAllergyRecord['category'];
  allergenText: string;
  verificationStatus: PatientAllergyRecord['verificationStatus'];
  severity: PatientAllergyRecord['severity'];
  reactions: readonly PersistedAllergyReactionInput[];
  onsetDate: string | null;
  lastReactionAt: Date | null;
  clinicalNoteId: string | null;
  sourceEncounterId: string | null;
  notes: string | null;
  recordedAt: Date;
  recordedBy: string;
  supersedesPatientAllergyId?: string | null;
  transactionId: string;
  correlationId: string;
}

export interface CreatePatientAllergyVersionInput {
  versionId: string;
  facilityId: string;
  patientAllergyId: string;
  patientId: string;
  versionNumber: number;
  previousVersionId: string | null;
  statusSnapshot: PatientAllergyVersionRecord['statusSnapshot'];
  encryptedSnapshot: EncryptedClinicalSnapshotRecord;
  snapshotHash: string;
  changeReason: string | null;
  recordedAt: Date;
  recordedBy: string;
  transactionId: string;
  correlationId: string;
}

export class AllergyRepository {
  public async create(
    input: CreateAllergyRecordInput,
  ): Promise<AllergyRecord> {
    try {
      const name =
        normalizeClinicalDisplay(
          input.name,
          'name',
        );

      const created =
        await AllergyModel.create({
          _id:
            toObjectId(
              input.allergyId,
              'allergyId',
            ),

          facilityId:
            toObjectId(
              input.facilityId,
              'facilityId',
            ),

          code:
            normalizeClinicalCode(
              input.code,
              'code',
            ),

          category:
            input.category,

          name,

          normalizedName:
            normalizeClinicalSearchText(name),

          synonyms:
            normalizeClinicalSynonyms(
              input.synonyms,
            ),

          description:
            input.description ??
            null,

          status:
            'ACTIVE',

          deactivatedAt:
            null,

          deactivatedBy:
            null,

          deactivationReason:
            null,

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

      return created.toObject() as AllergyRecord;
    } catch (error) {
      throwMappedClinicalEmrPersistenceError(
        error,
        'CREATE_ALLERGY',
      );
    }
  }

  public async findById(
    facilityId: string,
    allergyId: string,
    includeInternal = false,
  ): Promise<AllergyRecord | null> {
    return AllergyModel.findOne({
      _id:
        toObjectId(
          allergyId,
          'allergyId',
        ),

      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    })
      .select(
        includeInternal
          ? ALLERGY_INTERNAL_SELECT
          : ALLERGY_STANDARD_SELECT,
      )
      .lean<AllergyRecord>()
      .exec();
  }

  public async findByCode(
    facilityId: string,
    code: string,
    includeInternal = false,
  ): Promise<AllergyRecord | null> {
    return AllergyModel.findOne({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      code:
        normalizeClinicalCode(
          code,
          'code',
        ),
    })
      .select(
        includeInternal
          ? ALLERGY_INTERNAL_SELECT
          : ALLERGY_STANDARD_SELECT,
      )
      .lean<AllergyRecord>()
      .exec();
  }

  public async list(
    facilityId: string,
    query: AllergyCatalogListQuery,
  ): Promise<ClinicalEmrPageResult<AllergyRecord>> {
    const filter:
      FilterQuery<AllergyRecord> = {
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      };

    if (query.status !== undefined) {
      filter.status =
        query.status;
    }

    if (query.category !== undefined) {
      filter.category =
        query.category;
    }

    if (
      query.search !== undefined &&
      query.search.trim().length > 0
    ) {
      const expression =
        new RegExp(
          escapeRegularExpression(
            normalizeClinicalSearchText(
              query.search,
            ),
          ),
          'iu',
        );

      filter.$or = [
        {
          code:
            expression,
        },
        {
          normalizedName:
            expression,
        },
        {
          synonyms:
            expression,
        },
      ];
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
        AllergyModel.find(filter)
          .select(ALLERGY_STANDARD_SELECT)
          .sort({
            normalizedName: direction,
            code: direction,
            _id: direction,
          })
          .skip(skip)
          .limit(query.pageSize)
          .lean<AllergyRecord[]>()
          .exec(),

        AllergyModel.countDocuments(filter).exec(),
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

  public async deactivateWithVersion(
    input: Readonly<{
      facilityId: string;
      allergyId: string;
      expectedVersion: number;
      reason: string;
      occurredAt: Date;
      actorUserId: string;
    }>,
  ): Promise<AllergyRecord | null> {
    return AllergyModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.allergyId,
            'allergyId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,

        status:
          'ACTIVE',
      },
      {
        $set: {
          status:
            'INACTIVE',

          deactivatedAt:
            input.occurredAt,

          deactivatedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),

          deactivationReason:
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
      .select(ALLERGY_INTERNAL_SELECT)
      .lean<AllergyRecord>()
      .exec();
  }
}

export class PatientAllergyRepository {
  public async create(
    input: CreatePatientAllergyRecordInput,
  ): Promise<PatientAllergyRecord> {
    try {
      const allergenText =
        normalizeClinicalDisplay(
          input.allergenText,
          'allergenText',
        );

      const confirmed =
        input.verificationStatus === 'CONFIRMED';

      const created =
        await PatientAllergyModel.create({
          _id:
            toObjectId(
              input.patientAllergyId,
              'patientAllergyId',
            ),

          facilityId:
            toObjectId(
              input.facilityId,
              'facilityId',
            ),

          patientId:
            toObjectId(
              input.patientId,
              'patientId',
            ),

          recordType:
            input.recordType,

          allergyId:
            input.allergyId === null
              ? null
              : toObjectId(
                  input.allergyId,
                  'allergyId',
                ),

          category:
            input.category,

          allergenText,

          normalizedAllergenText:
            normalizeClinicalSearchText(allergenText),

          status:
            'ACTIVE',

          verificationStatus:
            input.verificationStatus,

          severity:
            input.severity,

          reactions:
            input.reactions,

          onsetDate:
            input.onsetDate,

          lastReactionAt:
            input.lastReactionAt,

          clinicalNoteId:
            input.clinicalNoteId === null
              ? null
              : toObjectId(
                  input.clinicalNoteId,
                  'clinicalNoteId',
                ),

          sourceEncounterId:
            input.sourceEncounterId === null
              ? null
              : toObjectId(
                  input.sourceEncounterId,
                  'sourceEncounterId',
                ),

          notes:
            input.notes,

          currentVersion:
            1,

          latestVersionId:
            toObjectId(
              input.initialVersionId,
              'initialVersionId',
            ),

          recordedAt:
            input.recordedAt,

          recordedBy:
            toObjectId(
              input.recordedBy,
              'recordedBy',
            ),

          verifiedAt:
            confirmed
              ? input.recordedAt
              : null,

          verifiedBy:
            confirmed
              ? toObjectId(
                  input.recordedBy,
                  'recordedBy',
                )
              : null,

          statusReason:
            null,

          supersedesPatientAllergyId:
            input.supersedesPatientAllergyId == null
              ? null
              : toObjectId(
                  input.supersedesPatientAllergyId,
                  'supersedesPatientAllergyId',
                ),

          supersededByPatientAllergyId:
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
              input.recordedBy,
              'recordedBy',
            ),

          updatedBy:
            toObjectId(
              input.recordedBy,
              'recordedBy',
            ),
        });

      return created.toObject() as PatientAllergyRecord;
    } catch (error) {
      throwMappedClinicalEmrPersistenceError(
        error,
        'CREATE_PATIENT_ALLERGY',
      );
    }
  }

  public async findById(
    facilityId: string,
    patientAllergyId: string,
    includeContent = false,
  ): Promise<PatientAllergyRecord | null> {
    return PatientAllergyModel.findOne({
      _id:
        toObjectId(
          patientAllergyId,
          'patientAllergyId',
        ),

      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    })
      .select(
        includeContent
          ? PATIENT_ALLERGY_CONTENT_SELECT
          : PATIENT_ALLERGY_STANDARD_SELECT,
      )
      .lean<PatientAllergyRecord>()
      .exec();
  }

  public async findActiveByKey(
    facilityId: string,
    patientId: string,
    recordType: PatientAllergyRecord['recordType'],
    category: PatientAllergyRecord['category'],
    allergenText: string,
    includeContent = false,
  ): Promise<PatientAllergyRecord | null> {
    return PatientAllergyModel.findOne({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      patientId:
        toObjectId(
          patientId,
          'patientId',
        ),

      activeAllergyKey:
        buildActiveAllergyKey(
          recordType,
          category,
          allergenText,
        ),
    })
      .select(
        includeContent
          ? PATIENT_ALLERGY_CONTENT_SELECT
          : PATIENT_ALLERGY_STANDARD_SELECT,
      )
      .lean<PatientAllergyRecord>()
      .exec();
  }

  public async list(
    facilityId: string,
    query: PatientAllergyListQuery,
    includeContent = false,
  ): Promise<ClinicalEmrPageResult<PatientAllergyRecord>> {
    const filter:
      FilterQuery<PatientAllergyRecord> = {
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        patientId:
          toObjectId(
            query.patientId,
            'patientId',
          ),
      };

    if (query.status !== undefined) {
      filter.status =
        query.status;
    }

    if (query.category !== undefined) {
      filter.category =
        query.category;
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
        PatientAllergyModel.find(filter)
          .select(
            includeContent
              ? PATIENT_ALLERGY_CONTENT_SELECT
              : PATIENT_ALLERGY_STANDARD_SELECT,
          )
          .sort({
            recordedAt: direction,
            _id: direction,
          })
          .skip(skip)
          .limit(query.pageSize)
          .lean<PatientAllergyRecord[]>()
          .exec(),

        PatientAllergyModel.countDocuments(filter).exec(),
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

  public async updateWithVersion(
    input: Readonly<{
      facilityId: string;
      patientAllergyId: string;
      expectedVersion: number;
      nextClinicalVersion: number;
      versionId: string;
      recordType: PatientAllergyRecord['recordType'];
      category: PatientAllergyRecord['category'];
      allergenText: string;
      status: PatientAllergyRecord['status'];
      verificationStatus: PatientAllergyRecord['verificationStatus'];
      severity: PatientAllergyRecord['severity'];
      reactions: readonly PersistedAllergyReactionInput[];
      onsetDate: string | null;
      lastReactionAt: Date | null;
      notes: string | null;
      reason: string | null;
      occurredAt: Date;
      actorUserId: string;
    }>,
  ): Promise<PatientAllergyRecord | null> {
    const activeAllergyKey =
      input.status === 'ACTIVE'
        ? buildActiveAllergyKey(
            input.recordType,
            input.category,
            input.allergenText,
          )
        : null;

    const confirmed =
      input.verificationStatus === 'CONFIRMED';

    return PatientAllergyModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.patientAllergyId,
            'patientAllergyId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,

        status: {
          $ne: 'ENTERED_IN_ERROR',
        },
      },
      {
        $set: {
          status:
            input.status,

          activeAllergyKey,

          verificationStatus:
            input.verificationStatus,

          severity:
            input.severity,

          reactions:
            input.reactions,

          onsetDate:
            input.onsetDate,

          lastReactionAt:
            input.lastReactionAt,

          notes:
            input.notes,

          currentVersion:
            input.nextClinicalVersion,

          latestVersionId:
            toObjectId(
              input.versionId,
              'versionId',
            ),

          verifiedAt:
            confirmed
              ? input.occurredAt
              : null,

          verifiedBy:
            confirmed
              ? toObjectId(
                  input.actorUserId,
                  'actorUserId',
                )
              : null,

          statusReason:
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
      .select(PATIENT_ALLERGY_CONTENT_SELECT)
      .lean<PatientAllergyRecord>()
      .exec();
  }

  public async markCorrectedWithVersion(
    input: Readonly<{
      facilityId: string;
      patientAllergyId: string;
      expectedVersion: number;
      nextClinicalVersion: number;
      versionId: string;
      replacementPatientAllergyId: string;
      reason: string;
      actorUserId: string;
    }>,
  ): Promise<PatientAllergyRecord | null> {
    return PatientAllergyModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.patientAllergyId,
            'patientAllergyId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,

        status: {
          $ne: 'ENTERED_IN_ERROR',
        },
      },
      {
        $set: {
          status:
            'ENTERED_IN_ERROR',

          activeAllergyKey:
            null,

          statusReason:
            input.reason,

          currentVersion:
            input.nextClinicalVersion,

          latestVersionId:
            toObjectId(
              input.versionId,
              'versionId',
            ),

          supersededByPatientAllergyId:
            toObjectId(
              input.replacementPatientAllergyId,
              'replacementPatientAllergyId',
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
      .select(PATIENT_ALLERGY_CONTENT_SELECT)
      .lean<PatientAllergyRecord>()
      .exec();
  }
}

export class PatientAllergyVersionRepository {
  public async create(
    input: CreatePatientAllergyVersionInput,
  ): Promise<PatientAllergyVersionRecord> {
    try {
      const created =
        await PatientAllergyVersionModel.create({
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

          patientAllergyId:
            toObjectId(
              input.patientAllergyId,
              'patientAllergyId',
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

          statusSnapshot:
            input.statusSnapshot,

          encryptedSnapshot:
            input.encryptedSnapshot,

          snapshotHash:
            input.snapshotHash,

          changeReason:
            input.changeReason,

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

      return created.toObject() as PatientAllergyVersionRecord;
    } catch (error) {
      throwMappedClinicalEmrPersistenceError(
        error,
        'CREATE_PATIENT_ALLERGY_VERSION',
      );
    }
  }

  public async findLatestForAllergy(
    facilityId: string,
    patientAllergyId: string,
    includeEncryptedSnapshot = false,
  ): Promise<PatientAllergyVersionRecord | null> {
    return PatientAllergyVersionModel.findOne({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      patientAllergyId:
        toObjectId(
          patientAllergyId,
          'patientAllergyId',
        ),
    })
      .select(
        includeEncryptedSnapshot
          ? PATIENT_ALLERGY_VERSION_INTERNAL_SELECT
          : PATIENT_ALLERGY_VERSION_STANDARD_SELECT,
      )
      .sort({
        versionNumber: -1,
      })
      .lean<PatientAllergyVersionRecord>()
      .exec();
  }

  public async listForAllergy(
    facilityId: string,
    patientAllergyId: string,
    includeEncryptedSnapshot = false,
  ): Promise<PatientAllergyVersionRecord[]> {
    return PatientAllergyVersionModel.find({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      patientAllergyId:
        toObjectId(
          patientAllergyId,
          'patientAllergyId',
        ),
    })
      .select(
        includeEncryptedSnapshot
          ? PATIENT_ALLERGY_VERSION_INTERNAL_SELECT
          : PATIENT_ALLERGY_VERSION_STANDARD_SELECT,
      )
      .sort({
        versionNumber: 1,
      })
      .lean<PatientAllergyVersionRecord[]>()
      .exec();
  }
}