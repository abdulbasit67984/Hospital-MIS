import type {
  FilterQuery,
} from 'mongoose';

import {
  PatientProblemModel,
  PatientProblemVersionModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  buildActiveClinicalCodeKey,
  normalizeClinicalCode,
  normalizeClinicalDisplay,
} from '../clinical-emr.normalization.js';

import {
  throwMappedClinicalEmrPersistenceError,
} from '../clinical-emr.persistence-errors.js';

import {
  PATIENT_PROBLEM_CONTENT_SELECT,
  PATIENT_PROBLEM_STANDARD_SELECT,
  PATIENT_PROBLEM_VERSION_INTERNAL_SELECT,
  PATIENT_PROBLEM_VERSION_STANDARD_SELECT,
} from '../clinical-emr.projections.js';

import type {
  EncryptedClinicalSnapshotRecord,
  PatientProblemListQuery,
  PatientProblemVersionRecord,
} from '../clinical-emr.persistence.types.js';

import type {
  ClinicalEmrPageResult,
  PatientProblemRecord,
} from '../clinical-emr.types.js';

export interface CreatePatientProblemRecordInput {
  patientProblemId: string;
  initialVersionId: string;
  facilityId: string;
  problemNumber: string;
  patientId: string;
  diagnosisId: string | null;
  sourceEncounterId: string;
  sourceEncounterDiagnosisId: string | null;
  codeSystem: PatientProblemRecord['codeSystem'];
  code: string;
  display: string;
  onsetDate: string | null;
  summary: string | null;
  recordedAt: Date;
  recordedBy: string;
  supersedesProblemId?: string | null;
  transactionId: string;
  correlationId: string;
}

export interface CreatePatientProblemVersionInput {
  versionId: string;
  facilityId: string;
  patientProblemId: string;
  patientId: string;
  versionNumber: number;
  previousVersionId: string | null;
  changeType: PatientProblemVersionRecord['changeType'];
  statusSnapshot: PatientProblemVersionRecord['statusSnapshot'];
  encryptedSnapshot: EncryptedClinicalSnapshotRecord;
  snapshotHash: string;
  changeReason: string | null;
  recordedAt: Date;
  recordedBy: string;
  transactionId: string;
  correlationId: string;
}

export class PatientProblemRepository {
  public async create(
    input: CreatePatientProblemRecordInput,
  ): Promise<PatientProblemRecord> {
    try {
      const code =
        normalizeClinicalCode(
          input.code,
          'code',
        );

      const created =
        await PatientProblemModel.create({
          _id:
            toObjectId(
              input.patientProblemId,
              'patientProblemId',
            ),

          facilityId:
            toObjectId(
              input.facilityId,
              'facilityId',
            ),

          problemNumber:
            input.problemNumber,

          patientId:
            toObjectId(
              input.patientId,
              'patientId',
            ),

          diagnosisId:
            input.diagnosisId === null
              ? null
              : toObjectId(
                  input.diagnosisId,
                  'diagnosisId',
                ),

          sourceEncounterId:
            toObjectId(
              input.sourceEncounterId,
              'sourceEncounterId',
            ),

          sourceEncounterDiagnosisId:
            input.sourceEncounterDiagnosisId === null
              ? null
              : toObjectId(
                  input.sourceEncounterDiagnosisId,
                  'sourceEncounterDiagnosisId',
                ),

          codeSystem:
            input.codeSystem,

          code,

          normalizedCode:
            code,

          display:
            normalizeClinicalDisplay(
              input.display,
              'display',
            ),

          status:
            'ACTIVE',

          onsetDate:
            input.onsetDate,

          resolvedAt:
            null,

          summary:
            input.summary,

          currentVersion:
            1,

          latestVersionId:
            toObjectId(
              input.initialVersionId,
              'initialVersionId',
            ),

          statusReason:
            null,

          supersedesProblemId:
            input.supersedesProblemId == null
              ? null
              : toObjectId(
                  input.supersedesProblemId,
                  'supersedesProblemId',
                ),

          supersededByProblemId:
            null,

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

      return created.toObject() as PatientProblemRecord;
    } catch (error) {
      throwMappedClinicalEmrPersistenceError(
        error,
        'CREATE_PATIENT_PROBLEM',
      );
    }
  }

  public async findById(
    facilityId: string,
    patientProblemId: string,
    includeContent = false,
  ): Promise<PatientProblemRecord | null> {
    return PatientProblemModel.findOne({
      _id:
        toObjectId(
          patientProblemId,
          'patientProblemId',
        ),

      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    })
      .select(
        includeContent
          ? PATIENT_PROBLEM_CONTENT_SELECT
          : PATIENT_PROBLEM_STANDARD_SELECT,
      )
      .lean<PatientProblemRecord>()
      .exec();
  }

  public async findActiveByCode(
    facilityId: string,
    patientId: string,
    codeSystem: PatientProblemRecord['codeSystem'],
    code: string,
    includeContent = false,
  ): Promise<PatientProblemRecord | null> {
    return PatientProblemModel.findOne({
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

      activeProblemKey:
        buildActiveClinicalCodeKey(
          codeSystem,
          code,
        ),
    })
      .select(
        includeContent
          ? PATIENT_PROBLEM_CONTENT_SELECT
          : PATIENT_PROBLEM_STANDARD_SELECT,
      )
      .lean<PatientProblemRecord>()
      .exec();
  }

  public async list(
    facilityId: string,
    query: PatientProblemListQuery,
    includeContent = false,
  ): Promise<ClinicalEmrPageResult<PatientProblemRecord>> {
    const filter:
      FilterQuery<PatientProblemRecord> = {
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
        PatientProblemModel.find(filter)
          .select(
            includeContent
              ? PATIENT_PROBLEM_CONTENT_SELECT
              : PATIENT_PROBLEM_STANDARD_SELECT,
          )
          .sort({
            recordedAt: direction,
            _id: direction,
          })
          .skip(skip)
          .limit(query.pageSize)
          .lean<PatientProblemRecord[]>()
          .exec(),

        PatientProblemModel.countDocuments(filter).exec(),
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
      patientProblemId: string;
      expectedVersion: number;
      nextClinicalVersion: number;
      versionId: string;
      codeSystem: PatientProblemRecord['codeSystem'];
      code: string;
      status: PatientProblemRecord['status'];
      summary: string | null;
      onsetDate: string | null;
      resolvedAt: Date | null;
      reason: string | null;
      actorUserId: string;
    }>,
  ): Promise<PatientProblemRecord | null> {
    const activeProblemKey =
      input.status === 'ACTIVE'
        ? buildActiveClinicalCodeKey(
            input.codeSystem,
            input.code,
          )
        : null;

    return PatientProblemModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.patientProblemId,
            'patientProblemId',
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

          activeProblemKey,

          summary:
            input.summary,

          onsetDate:
            input.onsetDate,

          resolvedAt:
            input.status === 'RESOLVED'
              ? input.resolvedAt
              : null,

          statusReason:
            input.reason,

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
      .select(PATIENT_PROBLEM_CONTENT_SELECT)
      .lean<PatientProblemRecord>()
      .exec();
  }

  public async markCorrectedWithVersion(
    input: Readonly<{
      facilityId: string;
      patientProblemId: string;
      expectedVersion: number;
      nextClinicalVersion: number;
      versionId: string;
      replacementProblemId: string;
      reason: string;
      actorUserId: string;
    }>,
  ): Promise<PatientProblemRecord | null> {
    return PatientProblemModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.patientProblemId,
            'patientProblemId',
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

          activeProblemKey:
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

          supersededByProblemId:
            toObjectId(
              input.replacementProblemId,
              'replacementProblemId',
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
      .select(PATIENT_PROBLEM_CONTENT_SELECT)
      .lean<PatientProblemRecord>()
      .exec();
  }
}

export class PatientProblemVersionRepository {
  public async create(
    input: CreatePatientProblemVersionInput,
  ): Promise<PatientProblemVersionRecord> {
    try {
      const created =
        await PatientProblemVersionModel.create({
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

          patientProblemId:
            toObjectId(
              input.patientProblemId,
              'patientProblemId',
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

      return created.toObject() as PatientProblemVersionRecord;
    } catch (error) {
      throwMappedClinicalEmrPersistenceError(
        error,
        'CREATE_PATIENT_PROBLEM_VERSION',
      );
    }
  }

  public async findLatestForProblem(
    facilityId: string,
    patientProblemId: string,
    includeEncryptedSnapshot = false,
  ): Promise<PatientProblemVersionRecord | null> {
    return PatientProblemVersionModel.findOne({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      patientProblemId:
        toObjectId(
          patientProblemId,
          'patientProblemId',
        ),
    })
      .select(
        includeEncryptedSnapshot
          ? PATIENT_PROBLEM_VERSION_INTERNAL_SELECT
          : PATIENT_PROBLEM_VERSION_STANDARD_SELECT,
      )
      .sort({
        versionNumber: -1,
      })
      .lean<PatientProblemVersionRecord>()
      .exec();
  }

  public async listForProblem(
    facilityId: string,
    patientProblemId: string,
    includeEncryptedSnapshot = false,
  ): Promise<PatientProblemVersionRecord[]> {
    return PatientProblemVersionModel.find({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      patientProblemId:
        toObjectId(
          patientProblemId,
          'patientProblemId',
        ),
    })
      .select(
        includeEncryptedSnapshot
          ? PATIENT_PROBLEM_VERSION_INTERNAL_SELECT
          : PATIENT_PROBLEM_VERSION_STANDARD_SELECT,
      )
      .sort({
        versionNumber: 1,
      })
      .lean<PatientProblemVersionRecord[]>()
      .exec();
  }
}