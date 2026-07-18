import type {
  FilterQuery,
} from 'mongoose';

import {
  DiagnosisModel,
  EncounterDiagnosisModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  normalizeClinicalCode,
  normalizeClinicalDisplay,
  normalizeClinicalSearchText,
  normalizeClinicalSynonyms,
} from '../clinical-emr.normalization.js';

import {
  throwMappedClinicalEmrPersistenceError,
} from '../clinical-emr.persistence-errors.js';

import {
  DIAGNOSIS_INTERNAL_SELECT,
  DIAGNOSIS_STANDARD_SELECT,
  ENCOUNTER_DIAGNOSIS_INTERNAL_SELECT,
  ENCOUNTER_DIAGNOSIS_STANDARD_SELECT,
} from '../clinical-emr.projections.js';

import type {
  DiagnosisCatalogListQuery,
  DiagnosisRecord,
} from '../clinical-emr.persistence.types.js';

import type {
  ClinicalEmrPageResult,
  EncounterDiagnosisRecord,
} from '../clinical-emr.types.js';

function escapeRegularExpression(
  value: string,
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/gu,
    '\\$&',
  );
}

export interface CreateDiagnosisRecordInput {
  diagnosisId: string;
  facilityId: string;
  codeSystem: DiagnosisRecord['codeSystem'];
  code: string;
  display: string;
  synonyms?: readonly string[];
  description?: string | null;
  parentDiagnosisId?: string | null;
  billable?: boolean;
  actorUserId: string;
}

export interface CreateEncounterDiagnosisRecordInput {
  encounterDiagnosisId: string;
  facilityId: string;
  encounterId: string;
  patientId: string;
  diagnosisId: string | null;
  codeSystem: EncounterDiagnosisRecord['codeSystem'];
  code: string;
  display: string;
  role: EncounterDiagnosisRecord['role'];
  certainty: EncounterDiagnosisRecord['certainty'];
  clinicalNoteId: string | null;
  onsetDate: string | null;
  isChronic: boolean;
  presentOnAdmission: boolean | null;
  evidence: string | null;
  recordedAt: Date;
  recordedBy: string;
  supersedesEncounterDiagnosisId?: string | null;
  transactionId: string;
  correlationId: string;
}

export class DiagnosisRepository {
  public async create(
    input: CreateDiagnosisRecordInput,
  ): Promise<DiagnosisRecord> {
    try {
      const code =
        normalizeClinicalCode(
          input.code,
          'code',
        );

      const display =
        normalizeClinicalDisplay(
          input.display,
          'display',
        );

      const created =
        await DiagnosisModel.create({
          _id:
            toObjectId(
              input.diagnosisId,
              'diagnosisId',
            ),

          facilityId:
            toObjectId(
              input.facilityId,
              'facilityId',
            ),

          codeSystem:
            input.codeSystem,

          code,

          normalizedCode:
            code,

          display,

          normalizedDisplay:
            normalizeClinicalSearchText(display),

          synonyms:
            normalizeClinicalSynonyms(
              input.synonyms,
            ),

          description:
            input.description ??
            null,

          parentDiagnosisId:
            input.parentDiagnosisId == null
              ? null
              : toObjectId(
                  input.parentDiagnosisId,
                  'parentDiagnosisId',
                ),

          billable:
            input.billable ??
            true,

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

      return created.toObject() as DiagnosisRecord;
    } catch (error) {
      throwMappedClinicalEmrPersistenceError(
        error,
        'CREATE_DIAGNOSIS',
      );
    }
  }

  public async findById(
    facilityId: string,
    diagnosisId: string,
    includeInternal = false,
  ): Promise<DiagnosisRecord | null> {
    return DiagnosisModel.findOne({
      _id:
        toObjectId(
          diagnosisId,
          'diagnosisId',
        ),

      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    })
      .select(
        includeInternal
          ? DIAGNOSIS_INTERNAL_SELECT
          : DIAGNOSIS_STANDARD_SELECT,
      )
      .lean<DiagnosisRecord>()
      .exec();
  }

  public async findByCode(
    facilityId: string,
    codeSystem: DiagnosisRecord['codeSystem'],
    code: string,
    includeInternal = false,
  ): Promise<DiagnosisRecord | null> {
    return DiagnosisModel.findOne({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      codeSystem,

      normalizedCode:
        normalizeClinicalCode(
          code,
          'code',
        ),
    })
      .select(
        includeInternal
          ? DIAGNOSIS_INTERNAL_SELECT
          : DIAGNOSIS_STANDARD_SELECT,
      )
      .lean<DiagnosisRecord>()
      .exec();
  }

  public async list(
    facilityId: string,
    query: DiagnosisCatalogListQuery,
  ): Promise<ClinicalEmrPageResult<DiagnosisRecord>> {
    const filter:
      FilterQuery<DiagnosisRecord> = {
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

    if (query.codeSystem !== undefined) {
      filter.codeSystem =
        query.codeSystem;
    }

    if (
      query.search !== undefined &&
      query.search.trim().length > 0
    ) {
      const normalized =
        normalizeClinicalSearchText(
          query.search,
        );

      const expression =
        new RegExp(
          escapeRegularExpression(normalized),
          'iu',
        );

      filter.$or = [
        {
          normalizedCode:
            expression,
        },
        {
          normalizedDisplay:
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
        DiagnosisModel.find(filter)
          .select(DIAGNOSIS_STANDARD_SELECT)
          .sort({
            normalizedDisplay: direction,
            normalizedCode: direction,
            _id: direction,
          })
          .skip(skip)
          .limit(query.pageSize)
          .lean<DiagnosisRecord[]>()
          .exec(),

        DiagnosisModel.countDocuments(filter).exec(),
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
      diagnosisId: string;
      expectedVersion: number;
      reason: string;
      occurredAt: Date;
      actorUserId: string;
    }>,
  ): Promise<DiagnosisRecord | null> {
    return DiagnosisModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.diagnosisId,
            'diagnosisId',
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
      .select(DIAGNOSIS_INTERNAL_SELECT)
      .lean<DiagnosisRecord>()
      .exec();
  }
}

export class EncounterDiagnosisRepository {
  public async create(
    input: CreateEncounterDiagnosisRecordInput,
  ): Promise<EncounterDiagnosisRecord> {
    try {
      const code =
        normalizeClinicalCode(
          input.code,
          'code',
        );

      const created =
        await EncounterDiagnosisModel.create({
          _id:
            toObjectId(
              input.encounterDiagnosisId,
              'encounterDiagnosisId',
            ),

          facilityId:
            toObjectId(
              input.facilityId,
              'facilityId',
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

          diagnosisId:
            input.diagnosisId === null
              ? null
              : toObjectId(
                  input.diagnosisId,
                  'diagnosisId',
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

          role:
            input.role,

          certainty:
            input.certainty,

          status:
            'ACTIVE',

          clinicalNoteId:
            input.clinicalNoteId === null
              ? null
              : toObjectId(
                  input.clinicalNoteId,
                  'clinicalNoteId',
                ),

          onsetDate:
            input.onsetDate,

          resolvedAt:
            null,

          isChronic:
            input.isChronic,

          presentOnAdmission:
            input.presentOnAdmission,

          evidence:
            input.evidence,

          recordedAt:
            input.recordedAt,

          recordedBy:
            toObjectId(
              input.recordedBy,
              'recordedBy',
            ),

          verifiedAt:
            null,

          verifiedBy:
            null,

          statusReason:
            null,

          supersedesEncounterDiagnosisId:
            input.supersedesEncounterDiagnosisId == null
              ? null
              : toObjectId(
                  input.supersedesEncounterDiagnosisId,
                  'supersedesEncounterDiagnosisId',
                ),

          supersededByEncounterDiagnosisId:
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

      return created.toObject() as EncounterDiagnosisRecord;
    } catch (error) {
      throwMappedClinicalEmrPersistenceError(
        error,
        'CREATE_ENCOUNTER_DIAGNOSIS',
      );
    }
  }

  public async findById(
    facilityId: string,
    encounterDiagnosisId: string,
    includeInternal = false,
  ): Promise<EncounterDiagnosisRecord | null> {
    return EncounterDiagnosisModel.findOne({
      _id:
        toObjectId(
          encounterDiagnosisId,
          'encounterDiagnosisId',
        ),

      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    })
      .select(
        includeInternal
          ? ENCOUNTER_DIAGNOSIS_INTERNAL_SELECT
          : ENCOUNTER_DIAGNOSIS_STANDARD_SELECT,
      )
      .lean<EncounterDiagnosisRecord>()
      .exec();
  }

  public async listForEncounter(
    facilityId: string,
    encounterId: string,
    includeInternal = false,
  ): Promise<EncounterDiagnosisRecord[]> {
    return EncounterDiagnosisModel.find({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      encounterId:
        toObjectId(
          encounterId,
          'encounterId',
        ),
    })
      .select(
        includeInternal
          ? ENCOUNTER_DIAGNOSIS_INTERNAL_SELECT
          : ENCOUNTER_DIAGNOSIS_STANDARD_SELECT,
      )
      .sort({
        role: 1,
        recordedAt: -1,
        _id: -1,
      })
      .lean<EncounterDiagnosisRecord[]>()
      .exec();
  }

  public async listForPatient(
    facilityId: string,
    patientId: string,
    includeEnteredInError = false,
  ): Promise<EncounterDiagnosisRecord[]> {
    return EncounterDiagnosisModel.find({
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

      ...(includeEnteredInError
        ? {}
        : {
            status: {
              $ne: 'ENTERED_IN_ERROR',
            },
          }),
    })
      .select(ENCOUNTER_DIAGNOSIS_STANDARD_SELECT)
      .sort({
        recordedAt: -1,
        _id: -1,
      })
      .lean<EncounterDiagnosisRecord[]>()
      .exec();
  }

  public async verifyWithVersion(
    input: Readonly<{
      facilityId: string;
      encounterDiagnosisId: string;
      expectedVersion: number;
      occurredAt: Date;
      actorUserId: string;
    }>,
  ): Promise<EncounterDiagnosisRecord | null> {
    return EncounterDiagnosisModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.encounterDiagnosisId,
            'encounterDiagnosisId',
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
          verifiedAt:
            input.occurredAt,

          verifiedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
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
      .select(ENCOUNTER_DIAGNOSIS_INTERNAL_SELECT)
      .lean<EncounterDiagnosisRecord>()
      .exec();
  }

  public async changeStatusWithVersion(
    input: Readonly<{
      facilityId: string;
      encounterDiagnosisId: string;
      expectedVersion: number;
      status: Exclude<EncounterDiagnosisRecord['status'], 'ACTIVE'>;
      reason: string;
      resolvedAt: Date | null;
      replacementEncounterDiagnosisId?: string | null;
      actorUserId: string;
    }>,
  ): Promise<EncounterDiagnosisRecord | null> {
    return EncounterDiagnosisModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.encounterDiagnosisId,
            'encounterDiagnosisId',
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
            input.status,

          activeDiagnosisKey:
            null,

          statusReason:
            input.reason,

          resolvedAt:
            input.status === 'RESOLVED'
              ? input.resolvedAt
              : null,

          supersededByEncounterDiagnosisId:
            input.replacementEncounterDiagnosisId == null
              ? null
              : toObjectId(
                  input.replacementEncounterDiagnosisId,
                  'replacementEncounterDiagnosisId',
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
      .select(ENCOUNTER_DIAGNOSIS_INTERNAL_SELECT)
      .lean<EncounterDiagnosisRecord>()
      .exec();
  }
}