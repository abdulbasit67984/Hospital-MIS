import type {
  FilterQuery,
} from 'mongoose';

import {
  AdmissionBedAssignmentModel,
  AdmissionModel,
  AdmissionRecommendationModel,
  AdmissionStatusHistoryModel,
  BedChargeSegmentModel,
  BedHoldModel,
  BedStatusHistoryModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  throwMappedInpatientPersistenceError,
} from '../inpatient.errors.js';

import type {
  AdmissionPersistenceUpdate,
  AdmissionRecommendationPersistenceUpdate,
  InpatientAdmissionRepositoryPort,
} from '../inpatient.ports.js';

import type {
  AdmissionBedAssignmentRecord,
  AdmissionRecommendationRecord,
  AdmissionRecord,
  AdmissionStatusHistoryRecord,
  BedChargeSegmentRecord,
  BedHoldRecord,
  BedStatusHistoryRecord,
} from '../inpatient.persistence.types.js';

import type {
  InpatientAdmissionListQuery,
} from '../inpatient.types.js';

const RECOMMENDATION_SELECT = [
  '_id',
  'facilityId',
  'recommendationNumber',
  'patientId',
  'requestedPatientId',
  'canonicalRedirected',
  'encounterId',
  'registrationId',
  'opdVisitId',
  'queueTokenId',
  'orderingProviderUserId',
  'orderingProviderStaffId',
  'orderingDepartmentId',
  'orderingServicePointId',
  'admissionType',
  'priority',
  'requestedWardTypes',
  'requestedSpecialtyCodes',
  'requestedIsolationCapabilities',
  '+clinicalIndication',
  '+diagnosisSnapshots',
  'expectedLengthOfStayDays',
  'requestedAdmissionAt',
  'recommendedAt',
  'status',
  'acceptedAt',
  'acceptedBy',
  'acceptedByStaffId',
  'rejectedAt',
  'rejectedBy',
  'rejectedByStaffId',
  '+rejectionReason',
  'cancelledAt',
  'cancelledBy',
  'cancelledByStaffId',
  '+cancellationReason',
  'expiresAt',
  'admissionId',
  'convertedAt',
  'convertedBy',
  'patientCoverageId',
  'preauthorizationId',
  'treatmentPackageId',
  'attachmentIds',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const ADMISSION_SELECT = [
  '_id',
  'facilityId',
  'admissionNumber',
  'admissionRecommendationId',
  'patientId',
  'requestedPatientId',
  'canonicalRedirected',
  'encounterId',
  'registrationId',
  'opdVisitId',
  'queueTokenId',
  'admittingDepartmentId',
  'admittingServicePointId',
  'admissionType',
  'priority',
  'status',
  'isActive',
  'requestedAt',
  'acceptedAt',
  'acceptedBy',
  'acceptedByStaffId',
  'admittedAt',
  'admittedBy',
  'admittedByStaffId',
  'clinicallyDischargedAt',
  'financiallyClearedAt',
  'dischargedAt',
  'cancelledAt',
  'cancelledBy',
  'cancelledByStaffId',
  '+cancellationReason',
  'attendingConsultantUserId',
  'attendingConsultantStaffId',
  'careTeam',
  '+clinicalIndicationSnapshot',
  '+diagnosisSnapshots',
  '+guardianSnapshot',
  '+emergencyContactSnapshot',
  'payerOrganizationId',
  'panelProgramId',
  'panelPlanId',
  'patientCoverageId',
  'preauthorizationId',
  'treatmentPackageId',
  'depositRequirementReference',
  'authorizationRequirementReference',
  'billingAccountReference',
  'currentWardId',
  'currentRoomId',
  'currentBedId',
  'currentBedAssignmentId',
  'currentBedAssignedAt',
  'currentStatusSequence',
  'latestStatusHistoryId',
  'dischargeId',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const ADMISSION_HISTORY_SELECT = [
  '_id',
  'facilityId',
  'admissionId',
  'patientId',
  'sequence',
  'fromStatus',
  'toStatus',
  'changeType',
  'reasonCode',
  '+reason',
  'admissionBedAssignmentId',
  'bedId',
  'dischargeId',
  'occurredAt',
  'performedBy',
  'performedByStaffId',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const BED_HOLD_SELECT = [
  '_id',
  'facilityId',
  'holdNumber',
  'bedId',
  'roomId',
  'wardId',
  'admissionId',
  'admissionRecommendationId',
  '+patientId',
  'holdType',
  'status',
  'isActive',
  'heldAt',
  'expiresAt',
  'heldBy',
  'heldByStaffId',
  'reasonCode',
  '+reason',
  'consumedAt',
  'consumedBy',
  'admissionBedAssignmentId',
  'endedAt',
  'endedBy',
  '+endingReason',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const ASSIGNMENT_SELECT = [
  '_id',
  'facilityId',
  'assignmentNumber',
  'admissionId',
  '+patientId',
  'sequence',
  'assignmentType',
  'status',
  'isActive',
  'wardId',
  'roomId',
  'bedId',
  'wardCodeSnapshot',
  'wardNameSnapshot',
  'roomCodeSnapshot',
  'roomNumberSnapshot',
  'bedCodeSnapshot',
  'bedNumberSnapshot',
  'bedCategorySnapshot',
  'bedHoldId',
  'previousAssignmentId',
  'assignedAt',
  'assignedBy',
  'assignedByStaffId',
  'releasedAt',
  'releasedBy',
  'releasedByStaffId',
  'releaseReasonCode',
  '+releaseReason',
  'nextAssignmentId',
  'turnaroundRequired',
  'bedChargeSegmentId',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const BED_STATUS_HISTORY_SELECT = [
  '_id',
  'facilityId',
  'bedId',
  'wardId',
  'roomId',
  'sequence',
  'fromStatus',
  'toStatus',
  'reasonCode',
  '+reason',
  'admissionId',
  'admissionBedAssignmentId',
  'bedHoldId',
  'maintenanceReference',
  'occurredAt',
  'performedBy',
  'performedByStaffId',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const BED_CHARGE_SELECT = [
  '_id',
  'facilityId',
  'segmentNumber',
  'admissionId',
  'admissionBedAssignmentId',
  '+patientId',
  'wardId',
  'roomId',
  'bedId',
  'bedRateId',
  'bedRateVersionId',
  'bedRateVersionNumber',
  'rateCodeSnapshot',
  'currencyCode',
  'unitRate',
  'chargingPolicySnapshot',
  'startedAt',
  'endedAt',
  'isOpen',
  'billableMinutes',
  'quantity',
  'grossAmount',
  'status',
  'billingRequestId',
  'billingChargeReference',
  'billedAt',
  'reversalRequestId',
  'reversalReference',
  'reversedAt',
  '+correctionReason',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

function record<T>(
  value:
    unknown,
): T {
  return value as T;
}

function sortDirection(
  direction:
    'asc' | 'desc',
): 1 | -1 {
  return direction === 'asc'
    ? 1
    : -1;
}

export class InpatientAdmissionRepository
implements InpatientAdmissionRepositoryPort {
  public async findRecommendationById(
    facilityId:
      string,

    recommendationId:
      string,
  ): Promise<
    AdmissionRecommendationRecord | null
  > {
    return record<
      AdmissionRecommendationRecord | null
    >(
      await AdmissionRecommendationModel.findOne({
        _id:
          toObjectId(
            recommendationId,
            'recommendationId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          RECOMMENDATION_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async createRecommendation(
    input:
      Omit<
        AdmissionRecommendationRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<
    AdmissionRecommendationRecord
  > {
    try {
      const created =
        await AdmissionRecommendationModel.create(
          input,
        );

      return record<
        AdmissionRecommendationRecord
      >(
        await AdmissionRecommendationModel.findById(
          created._id,
        )
          .select(
            RECOMMENDATION_SELECT,
          )
          .lean()
          .orFail()
          .exec(),
      );
    } catch (
      error
    ) {
      throwMappedInpatientPersistenceError(
        error,
        'CREATE_RECOMMENDATION',
      );
    }
  }

  public async updateRecommendation(
    facilityId:
      string,

    recommendationId:
      string,

    expectedVersion:
      number,

    update:
      AdmissionRecommendationPersistenceUpdate,
  ): Promise<
    AdmissionRecommendationRecord | null
  > {
    try {
      return record<
        AdmissionRecommendationRecord | null
      >(
        await AdmissionRecommendationModel.findOneAndUpdate(
          {
            _id:
              toObjectId(
                recommendationId,
                'recommendationId',
              ),

            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),

            version:
              expectedVersion,
          },

          {
            $set:
              update,

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
          .select(
            RECOMMENDATION_SELECT,
          )
          .lean()
          .exec(),
      );
    } catch (
      error
    ) {
      throwMappedInpatientPersistenceError(
        error,
        'UPDATE_RECOMMENDATION',
      );
    }
  }

  public async findAdmissionById(
    facilityId:
      string,

    admissionId:
      string,
  ): Promise<
    AdmissionRecord | null
  > {
    return record<
      AdmissionRecord | null
    >(
      await AdmissionModel.findOne({
        _id:
          toObjectId(
            admissionId,
            'admissionId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          ADMISSION_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async findActiveAdmissionByPatient(
    facilityId:
      string,

    patientId:
      string,
  ): Promise<
    AdmissionRecord | null
  > {
    return record<
      AdmissionRecord | null
    >(
      await AdmissionModel.findOne({
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

        isActive:
          true,
      })
        .select(
          ADMISSION_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async listAdmissions(
    facilityId:
      string,

    query:
      InpatientAdmissionListQuery,
  ): Promise<{
    items:
      AdmissionRecord[];

    total:
      number;
  }> {
    const filter:
      FilterQuery<unknown> = {
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      };

    if (
      query.patientId !==
      undefined
    ) {
      filter[
        'patientId'
      ] =
        toObjectId(
          query.patientId,
          'patientId',
        );
    }

    if (
      query.encounterId !==
      undefined
    ) {
      filter[
        'encounterId'
      ] =
        toObjectId(
          query.encounterId,
          'encounterId',
        );
    }

    if (
      query.departmentId !==
      undefined
    ) {
      filter[
        'admittingDepartmentId'
      ] =
        toObjectId(
          query.departmentId,
          'departmentId',
        );
    }

    if (
      query.wardId !==
      undefined
    ) {
      filter[
        'currentWardId'
      ] =
        toObjectId(
          query.wardId,
          'wardId',
        );
    }

    if (
      query
        .attendingConsultantStaffId !==
      undefined
    ) {
      filter[
        'attendingConsultantStaffId'
      ] =
        toObjectId(
          query
            .attendingConsultantStaffId,
          'attendingConsultantStaffId',
        );
    }

    if (
      query.status !==
      undefined
    ) {
      filter[
        'status'
      ] =
        query.status;
    }

    if (
      query.admissionType !==
      undefined
    ) {
      filter[
        'admissionType'
      ] =
        query.admissionType;
    }

    if (
      query.priority !==
      undefined
    ) {
      filter[
        'priority'
      ] =
        query.priority;
    }

    if (
      query.activeOnly !==
      undefined
    ) {
      filter[
        'isActive'
      ] =
        query.activeOnly;
    }

    if (
      query.requestedFrom !==
        undefined ||
      query.requestedTo !==
        undefined
    ) {
      filter[
        'requestedAt'
      ] = {
        ...(
          query.requestedFrom ===
          undefined
            ? {}
            : {
                $gte:
                  new Date(
                    query
                      .requestedFrom,
                  ),
              }
        ),

        ...(
          query.requestedTo ===
          undefined
            ? {}
            : {
                $lte:
                  new Date(
                    query
                      .requestedTo,
                  ),
              }
        ),
      };
    }

    if (
      query.admittedFrom !==
        undefined ||
      query.admittedTo !==
        undefined
    ) {
      filter[
        'admittedAt'
      ] = {
        ...(
          query.admittedFrom ===
          undefined
            ? {}
            : {
                $gte:
                  new Date(
                    query
                      .admittedFrom,
                  ),
              }
        ),

        ...(
          query.admittedTo ===
          undefined
            ? {}
            : {
                $lte:
                  new Date(
                    query
                      .admittedTo,
                  ),
              }
        ),
      };
    }

    const skip =
      (
        query.page -
        1
      ) *
      query.pageSize;

    const direction =
      sortDirection(
        query.sortDirection,
      );

    const [
      items,
      total,
    ] =
      await Promise.all([
        AdmissionModel.find(
          filter,
        )
          .select(
            ADMISSION_SELECT,
          )
          .sort({
            [
              query.sortBy
            ]:
              direction,

            _id:
              1,
          })
          .skip(
            skip,
          )
          .limit(
            query.pageSize,
          )
          .lean()
          .exec(),

        AdmissionModel
          .countDocuments(
            filter,
          )
          .exec(),
      ]);

    return {
      items:
        record<
          AdmissionRecord[]
        >(
          items,
        ),

      total,
    };
  }

  public async createAdmission(
    input:
      Omit<
        AdmissionRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<
    AdmissionRecord
  > {
    try {
      const created =
        await AdmissionModel.create(
          input,
        );

      return record<
        AdmissionRecord
      >(
        await AdmissionModel.findById(
          created._id,
        )
          .select(
            ADMISSION_SELECT,
          )
          .lean()
          .orFail()
          .exec(),
      );
    } catch (
      error
    ) {
      throwMappedInpatientPersistenceError(
        error,
        'CREATE_ADMISSION',
      );
    }
  }

  public async updateAdmission(
    facilityId:
      string,

    admissionId:
      string,

    expectedVersion:
      number,

    update:
      AdmissionPersistenceUpdate,
  ): Promise<
    AdmissionRecord | null
  > {
    try {
      return record<
        AdmissionRecord | null
      >(
        await AdmissionModel.findOneAndUpdate(
          {
            _id:
              toObjectId(
                admissionId,
                'admissionId',
              ),

            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),

            version:
              expectedVersion,
          },

          {
            $set:
              update,

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
          .select(
            ADMISSION_SELECT,
          )
          .lean()
          .exec(),
      );
    } catch (
      error
    ) {
      throwMappedInpatientPersistenceError(
        error,
        'UPDATE_ADMISSION',
      );
    }
  }

  public async createAdmissionStatusHistory(
    input:
      Omit<
        AdmissionStatusHistoryRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<
    AdmissionStatusHistoryRecord
  > {
    try {
      const created =
        await AdmissionStatusHistoryModel.create(
          input,
        );

      return record<
        AdmissionStatusHistoryRecord
      >(
        await AdmissionStatusHistoryModel.findById(
          created._id,
        )
          .select(
            ADMISSION_HISTORY_SELECT,
          )
          .lean()
          .orFail()
          .exec(),
      );
    } catch (
      error
    ) {
      throwMappedInpatientPersistenceError(
        error,
        'CREATE_ADMISSION_HISTORY',
      );
    }
  }

  public async listAdmissionStatusHistory(
    facilityId:
      string,

    admissionId:
      string,
  ): Promise<
    AdmissionStatusHistoryRecord[]
  > {
    return record<
      AdmissionStatusHistoryRecord[]
    >(
      await AdmissionStatusHistoryModel.find({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        admissionId:
          toObjectId(
            admissionId,
            'admissionId',
          ),
      })
        .select(
          ADMISSION_HISTORY_SELECT,
        )
        .sort({
          sequence:
            1,
        })
        .lean()
        .exec(),
    );
  }

  public async findActiveBedHold(
    facilityId:
      string,

    bedId:
      string,
  ): Promise<
    BedHoldRecord | null
  > {
    return record<
      BedHoldRecord | null
    >(
      await BedHoldModel.findOne({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        bedId:
          toObjectId(
            bedId,
            'bedId',
          ),

        isActive:
          true,
      })
        .select(
          BED_HOLD_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async findActiveBedAssignment(
    facilityId:
      string,

    bedId:
      string,
  ): Promise<
    AdmissionBedAssignmentRecord | null
  > {
    return record<
      AdmissionBedAssignmentRecord | null
    >(
      await AdmissionBedAssignmentModel.findOne({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        bedId:
          toObjectId(
            bedId,
            'bedId',
          ),

        isActive:
          true,
      })
        .select(
          ASSIGNMENT_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async findActiveAssignmentForAdmission(
    facilityId:
      string,

    admissionId:
      string,
  ): Promise<
    AdmissionBedAssignmentRecord | null
  > {
    return record<
      AdmissionBedAssignmentRecord | null
    >(
      await AdmissionBedAssignmentModel.findOne({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        admissionId:
          toObjectId(
            admissionId,
            'admissionId',
          ),

        isActive:
          true,
      })
        .select(
          ASSIGNMENT_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async listAssignments(
    facilityId:
      string,

    admissionId:
      string,
  ): Promise<
    AdmissionBedAssignmentRecord[]
  > {
    return record<
      AdmissionBedAssignmentRecord[]
    >(
      await AdmissionBedAssignmentModel.find({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        admissionId:
          toObjectId(
            admissionId,
            'admissionId',
          ),
      })
        .select(
          ASSIGNMENT_SELECT,
        )
        .sort({
          sequence:
            1,
        })
        .lean()
        .exec(),
    );
  }

  public async listBedStatusHistory(
    facilityId:
      string,

    bedId:
      string,
  ): Promise<
    BedStatusHistoryRecord[]
  > {
    return record<
      BedStatusHistoryRecord[]
    >(
      await BedStatusHistoryModel.find({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        bedId:
          toObjectId(
            bedId,
            'bedId',
          ),
      })
        .select(
          BED_STATUS_HISTORY_SELECT,
        )
        .sort({
          sequence:
            1,
        })
        .lean()
        .exec(),
    );
  }

  public async listBedChargeSegments(
    facilityId:
      string,

    admissionId:
      string,
  ): Promise<
    BedChargeSegmentRecord[]
  > {
    return record<
      BedChargeSegmentRecord[]
    >(
      await BedChargeSegmentModel.find({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        admissionId:
          toObjectId(
            admissionId,
            'admissionId',
          ),
      })
        .select(
          BED_CHARGE_SELECT,
        )
        .sort({
          startedAt:
            1,
        })
        .lean()
        .exec(),
    );
  }
}