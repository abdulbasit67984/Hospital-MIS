import type {
  FilterQuery,
  UpdateQuery,
} from 'mongoose';

import {
  PatientModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  PATIENT_ACCESS_LEVEL,
  type PatientAccessLevel,
} from '../patient.constants.js';

import {
  buildLegalName,
  buildNameSearchTokens,
  buildPatientDisplayName,
  normalizeCountryCode,
  normalizeHumanName,
  normalizeLocale,
  normalizeOptionalText,
  normalizeSearchText,
  toPatientBirthDateRecord,
} from '../patient.normalization.js';

import {
  PATIENT_MATCHING_SELECT,
  PATIENT_SENSITIVE_SELECT,
  PATIENT_STANDARD_SELECT,
} from '../patient.projections.js';

import type {
  PatientListQuery,
  PatientPageResult,
  PatientRecord,
  RegisterPatientInput,
  UpdatePatientInput,
} from '../patient.types.js';

function selectForAccess(
  access: PatientAccessLevel,
): string {
  switch (access) {
    case PATIENT_ACCESS_LEVEL.SENSITIVE:
      return PATIENT_SENSITIVE_SELECT;

    case PATIENT_ACCESS_LEVEL.MATCHING:
      return PATIENT_MATCHING_SELECT;

    case PATIENT_ACCESS_LEVEL.STANDARD:
      return PATIENT_STANDARD_SELECT;
  }
}

function localizedNames(
  input:
    | readonly {
        locale: string;
        fullName: string;
      }[]
    | undefined,
): Array<{
  locale: string;
  fullName: string;
  normalizedFullName: string;
}> {
  return (input ?? []).map(
    (name) => ({
      locale:
        normalizeLocale(
          name.locale,
          'localizedNames.locale',
        ),
      fullName:
        normalizeHumanName(
          name.fullName,
          'localizedNames.fullName',
        ),
      normalizedFullName:
        normalizeSearchText(
          name.fullName,
        ),
    }),
  );
}

export class PatientRepository {
  public async create(
    input: RegisterPatientInput & Readonly<{
      facilityId: string;
      createdBy: string;
      registeredAt: Date;
    }>,
  ): Promise<PatientRecord> {
    const firstName =
      normalizeHumanName(
        input.firstName,
      );

    const middleName =
      normalizeOptionalText(
        input.middleName,
      );

    const lastName =
      normalizeOptionalText(
        input.lastName,
      );

    const preferredName =
      normalizeOptionalText(
        input.preferredName,
      );

    const legalName =
      buildLegalName({
        firstName,
        middleName,
        lastName,
      });

    const created =
      await PatientModel.create({
        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),
        firstName,
        middleName,
        lastName,
        preferredName,
        displayName:
          buildPatientDisplayName({
            firstName,
            middleName,
            lastName,
            preferredName,
          }),
        normalizedFullName:
          normalizeSearchText(
            legalName,
          ),
        nameSearchTokens:
          buildNameSearchTokens(
            legalName,
          ),
        localizedNames:
          localizedNames(
            input.localizedNames,
          ),
        birthDate:
          toPatientBirthDateRecord(
            input.birthDate,
          ),
        isMinor:
          input.isMinor,
        guardianRequirement:
          input.isMinor
            ? 'REQUIRED'
            : 'NOT_REQUIRED',
        sexAtBirth:
          input.sexAtBirth,
        genderIdentity:
          input.genderIdentity ??
          'NOT_DISCLOSED',
        genderDescription:
          normalizeOptionalText(
            input.genderDescription,
          ),
        preferredLocale:
          normalizeLocale(
            input.preferredLocale ??
              'en-PK',
          ),
        nationalityCountryCode:
          normalizeCountryCode(
            input.nationalityCountryCode ??
              'PK',
          ),
        status:
          'ACTIVE',
        mergeState:
          'CANONICAL',
        mergedIntoPatientId:
          null,
        mergedAt:
          null,
        mergedBy:
          null,
        mergeReason:
          null,
        deceasedAt:
          null,
        statusReason:
          null,
        identityReviewRequired:
          false,
        duplicateReviewRequired:
          false,
        registrationSource:
          input.registrationSource ??
          'RECEPTION',
        registeredAt:
          input.registeredAt,
        version:
          0,
        createdBy:
          toObjectId(
            input.createdBy,
            'createdBy',
          ),
        updatedBy:
          toObjectId(
            input.createdBy,
            'createdBy',
          ),
      });

    return created.toObject() as PatientRecord;
  }

  public async findById(
    facilityId: string,
    patientId: string,
    access: PatientAccessLevel =
      PATIENT_ACCESS_LEVEL.STANDARD,
  ): Promise<PatientRecord | null> {
    return PatientModel.findOne({
      _id:
        toObjectId(
          patientId,
          'patientId',
        ),
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    })
      .select(selectForAccess(access))
      .lean<PatientRecord>()
      .exec();
  }

  public async findByIds(
    facilityId: string,
    patientIds: readonly string[],
    access: PatientAccessLevel =
      PATIENT_ACCESS_LEVEL.STANDARD,
  ): Promise<PatientRecord[]> {
    if (patientIds.length === 0) {
      return [];
    }

    return PatientModel.find({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
      _id: {
        $in:
          patientIds.map(
            (patientId) =>
              toObjectId(
                patientId,
                'patientId',
              ),
          ),
      },
    })
      .select(selectForAccess(access))
      .lean<PatientRecord[]>()
      .exec();
  }

  public async findByEnterprisePatientId(
    facilityId: string,
    enterprisePatientId: string,
    access: PatientAccessLevel =
      PATIENT_ACCESS_LEVEL.STANDARD,
  ): Promise<PatientRecord | null> {
    return PatientModel.findOne({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
      enterprisePatientId:
        enterprisePatientId.trim(),
    })
      .select(selectForAccess(access))
      .lean<PatientRecord>()
      .exec();
  }

  public async list(
    facilityId: string,
    query: PatientListQuery,
  ): Promise<PatientPageResult<PatientRecord>> {
    const filter:
      FilterQuery<PatientRecord> = {
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

    if (query.isMinor !== undefined) {
      filter.isMinor =
        query.isMinor;
    }

    if (query.search !== undefined) {
      const normalized =
        normalizeSearchText(
          query.search,
        );

      if (normalized.length > 0) {
        const tokens =
          buildNameSearchTokens(
            normalized,
          );

        filter.$or = [
          {
            normalizedFullName: {
              $regex:
                `^${normalized.replace(
                  /[.*+?^${}()|[\]\\]/gu,
                  '\\$&',
                )}`,
            },
          },
          {
            nameSearchTokens: {
              $all:
                tokens,
            },
          },
        ];
      }
    }

    const page =
      Math.max(1, query.page);

    const pageSize =
      Math.max(1, query.pageSize);

    const skip =
      (page - 1) * pageSize;

    const direction =
      query.sortDirection === 'desc'
        ? -1
        : 1;

    const [
      items,
      totalItems,
    ] = await Promise.all([
      PatientModel.find(filter)
        .select(PATIENT_STANDARD_SELECT)
        .sort({
          [query.sortBy]:
            direction,
          _id:
            1,
        })
        .skip(skip)
        .limit(pageSize)
        .lean<PatientRecord[]>()
        .exec(),
      PatientModel.countDocuments(
        filter,
      ).exec(),
    ]);

    return {
      items,
      page,
      pageSize,
      totalItems,
      totalPages:
        totalItems === 0
          ? 0
          : Math.ceil(
              totalItems / pageSize,
            ),
    };
  }

  public async findMatchingCandidates(
    input: Readonly<{
      facilityId: string;
      normalizedFullName: string;
      birthDate: Date | null;
      estimatedBirthYear: number | null;
      excludePatientId?: string;
      limit?: number;
    }>,
  ): Promise<PatientRecord[]> {
    const filter:
      FilterQuery<PatientRecord> = {
        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),
        status: {
          $ne:
            'MERGED',
        },
        normalizedFullName:
          input.normalizedFullName,
      };

    if (input.excludePatientId !== undefined) {
      filter._id = {
        $ne:
          toObjectId(
            input.excludePatientId,
            'excludePatientId',
          ),
      };
    }

    const dateFilters:
      FilterQuery<PatientRecord>[] = [];

    if (input.birthDate !== null) {
      const start =
        new Date(input.birthDate);

      start.setUTCHours(0, 0, 0, 0);

      const end =
        new Date(start);

      end.setUTCDate(
        end.getUTCDate() + 1,
      );

      dateFilters.push({
        'birthDate.value': {
          $gte:
            start,
          $lt:
            end,
        },
      });
    }

    if (input.estimatedBirthYear !== null) {
      dateFilters.push({
        'birthDate.value': {
          $gte:
            new Date(
              Date.UTC(
                input.estimatedBirthYear,
                0,
                1,
              ),
            ),
          $lt:
            new Date(
              Date.UTC(
                input.estimatedBirthYear + 1,
                0,
                1,
              ),
            ),
        },
      });
    }

    if (dateFilters.length > 0) {
      filter.$or =
        dateFilters;
    }

    return PatientModel.find(filter)
      .select(PATIENT_MATCHING_SELECT)
      .limit(input.limit ?? 50)
      .lean<PatientRecord[]>()
      .exec();
  }

  public async updateWithVersion(
    facilityId: string,
    patientId: string,
    input: UpdatePatientInput,
    actorUserId: string,
  ): Promise<PatientRecord | null> {
    const existing =
      await this.findById(
        facilityId,
        patientId,
        PATIENT_ACCESS_LEVEL.MATCHING,
      );

    if (existing === null) {
      return null;
    }

    const setValues:
      Record<string, unknown> = {
        updatedBy:
          toObjectId(
            actorUserId,
            'actorUserId',
          ),
      };

    const firstName =
      input.firstName === undefined
        ? existing.firstName
        : normalizeHumanName(
            input.firstName,
          );

    const middleName =
      input.middleName === undefined
        ? existing.middleName
        : normalizeOptionalText(
            input.middleName,
          );

    const lastName =
      input.lastName === undefined
        ? existing.lastName
        : normalizeOptionalText(
            input.lastName,
          );

    const preferredName =
      input.preferredName === undefined
        ? existing.preferredName
        : normalizeOptionalText(
            input.preferredName,
          );

    if (
      input.firstName !== undefined ||
      input.middleName !== undefined ||
      input.lastName !== undefined ||
      input.preferredName !== undefined
    ) {
      const legalName =
        buildLegalName({
          firstName,
          middleName,
          lastName,
        });

      setValues.firstName =
        firstName;
      setValues.middleName =
        middleName;
      setValues.lastName =
        lastName;
      setValues.preferredName =
        preferredName;
      setValues.displayName =
        buildPatientDisplayName({
          firstName,
          middleName,
          lastName,
          preferredName,
        });
      setValues.normalizedFullName =
        normalizeSearchText(
          legalName,
        );
      setValues.nameSearchTokens =
        buildNameSearchTokens(
          legalName,
        );
    }

    if (input.localizedNames !== undefined) {
      setValues.localizedNames =
        localizedNames(
          input.localizedNames,
        );
    }

    if (input.birthDate !== undefined) {
      setValues.birthDate =
        toPatientBirthDateRecord(
          input.birthDate,
        );
    }

    if (input.isMinor !== undefined) {
      setValues.isMinor =
        input.isMinor;

      if (
        input.guardianRequirement ===
        undefined
      ) {
        setValues.guardianRequirement =
          input.isMinor
            ? 'REQUIRED'
            : 'NOT_REQUIRED';
      }
    }

    if (
      input.guardianRequirement !== undefined
    ) {
      setValues.guardianRequirement =
        input.guardianRequirement;
    }

    if (input.sexAtBirth !== undefined) {
      setValues.sexAtBirth =
        input.sexAtBirth;
    }

    if (input.genderIdentity !== undefined) {
      setValues.genderIdentity =
        input.genderIdentity;
    }

    if (
      input.genderDescription !== undefined
    ) {
      setValues.genderDescription =
        normalizeOptionalText(
          input.genderDescription,
        );
    }

    if (input.preferredLocale !== undefined) {
      setValues.preferredLocale =
        normalizeLocale(
          input.preferredLocale,
        );
    }

    if (
      input.nationalityCountryCode !==
      undefined
    ) {
      setValues.nationalityCountryCode =
        normalizeCountryCode(
          input.nationalityCountryCode,
        );
    }

    if (input.status !== undefined) {
      setValues.status =
        input.status;

      if (input.status === 'DECEASED') {
        setValues.deceasedAt =
          new Date();
      } else {
        setValues.deceasedAt =
          null;
      }
    }

    if (input.statusReason !== undefined) {
      setValues.statusReason =
        normalizeOptionalText(
          input.statusReason,
        );
    }

    if (
      input.identityReviewRequired !==
      undefined
    ) {
      setValues.identityReviewRequired =
        input.identityReviewRequired;
    }

    if (
      input.duplicateReviewRequired !==
      undefined
    ) {
      setValues.duplicateReviewRequired =
        input.duplicateReviewRequired;
    }

    const update:
      UpdateQuery<PatientRecord> = {
        $set:
          setValues,
        $inc: {
          version:
            1,
        },
      };

    return PatientModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            patientId,
            'patientId',
          ),
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
        version:
          input.expectedVersion,
        status: {
          $ne:
            'MERGED',
        },
      },
      update,
      {
        new:
          true,
        runValidators:
          true,
      },
    )
      .select(PATIENT_SENSITIVE_SELECT)
      .lean<PatientRecord>()
      .exec();
  }

  public async setDuplicateReview(
    input: Readonly<{
      facilityId: string;
      patientId: string;
      expectedVersion: number;
      required: boolean;
      actorUserId: string;
    }>,
  ): Promise<PatientRecord | null> {
    return PatientModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.patientId,
            'patientId',
          ),
        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),
        version:
          input.expectedVersion,
        status: {
          $ne:
            'MERGED',
        },
      },
      {
        $set: {
          duplicateReviewRequired:
            input.required,
          mergeState:
            input.required
              ? 'DUPLICATE_SUSPECTED'
              : 'CANONICAL',
          updatedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),
        },
        $inc: {
          version:
            1,
        },
      },
      {
        new:
          true,
        runValidators:
          true,
      },
    )
      .select(PATIENT_STANDARD_SELECT)
      .lean<PatientRecord>()
      .exec();
  }
}