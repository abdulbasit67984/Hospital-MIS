import {
  AdmissionBedAssignmentModel,
  BedChargeSegmentModel,
  BedHoldModel,
  BedModel,
  BedStatusHistoryModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  throwMappedInpatientPersistenceError,
} from '../inpatient.errors.js';

import type {
  BedAssignmentPersistenceUpdate,
  BedChargeSegmentPersistenceUpdate,
  BedHoldPersistenceUpdate,
  InpatientBedOperationRepositoryPort,
} from '../inpatient-bed-operations.ports.js';

import type {
  AdmissionBedAssignmentRecord,
  BedChargeSegmentRecord,
  BedHoldRecord,
  BedRecord,
  BedStatusHistoryRecord,
} from '../inpatient.persistence.types.js';

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

const BED_SELECT = [
  '_id',
  'facilityId',
  'wardId',
  'roomId',
  'departmentId',
  'servicePointId',
  'bedCode',
  'bedNumber',
  'label',
  'normalizedLabel',
  'bedCategory',
  'operationalStatus',
  'operationalStatusChangedAt',
  'operationalStatusChangedBy',
  'operationalStatusReasonCode',
  '+operationalStatusReason',
  'currentAdmissionId',
  'currentAssignmentId',
  '+currentPatientId',
  'activeHoldId',
  'lastReleasedAt',
  'turnaroundRequiredAfterRelease',
  'maintenanceReference',
  'displayOrder',
  'permittedSexes',
  'minimumAgeYears',
  'maximumAgeYears',
  'specialtyCodes',
  'isolationCapabilities',
  'infectionControlTags',
  'negativePressureCapable',
  'cohortingAllowed',
  'status',
  'activatedAt',
  'activatedBy',
  'deactivatedAt',
  'deactivatedBy',
  '+deactivationReason',
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

export class InpatientBedOperationRepository
implements InpatientBedOperationRepositoryPort {
  public async findBedHoldById(
    facilityId:
      string,

    bedHoldId:
      string,
  ): Promise<
    BedHoldRecord | null
  > {
    return record<
      BedHoldRecord | null
    >(
      await BedHoldModel.findOne({
        _id:
          toObjectId(
            bedHoldId,
            'bedHoldId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          BED_HOLD_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async findAssignmentById(
    facilityId:
      string,

    assignmentId:
      string,
  ): Promise<
    AdmissionBedAssignmentRecord | null
  > {
    return record<
      AdmissionBedAssignmentRecord | null
    >(
      await AdmissionBedAssignmentModel.findOne({
        _id:
          toObjectId(
            assignmentId,
            'assignmentId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          ASSIGNMENT_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async findChargeSegmentById(
    facilityId:
      string,

    chargeSegmentId:
      string,
  ): Promise<
    BedChargeSegmentRecord | null
  > {
    return record<
      BedChargeSegmentRecord | null
    >(
      await BedChargeSegmentModel.findOne({
        _id:
          toObjectId(
            chargeSegmentId,
            'chargeSegmentId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          BED_CHARGE_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async findOpenChargeSegmentForAssignment(
    facilityId:
      string,

    assignmentId:
      string,
  ): Promise<
    BedChargeSegmentRecord | null
  > {
    return record<
      BedChargeSegmentRecord | null
    >(
      await BedChargeSegmentModel.findOne({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        admissionBedAssignmentId:
          toObjectId(
            assignmentId,
            'assignmentId',
          ),

        isOpen:
          true,
      })
        .select(
          BED_CHARGE_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async createBedHold(
    input:
      Omit<
        BedHoldRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<
    BedHoldRecord
  > {
    try {
      const created =
        await BedHoldModel.create(
          input,
        );

      return record<
        BedHoldRecord
      >(
        await BedHoldModel.findById(
          created._id,
        )
          .select(
            BED_HOLD_SELECT,
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
        'CREATE_BED_HOLD',
      );
    }
  }

  public async updateBedHold(
    facilityId:
      string,

    bedHoldId:
      string,

    expectedVersion:
      number,

    update:
      BedHoldPersistenceUpdate,
  ): Promise<
    BedHoldRecord | null
  > {
    return record<
      BedHoldRecord | null
    >(
      await BedHoldModel.findOneAndUpdate(
        {
          _id:
            toObjectId(
              bedHoldId,
              'bedHoldId',
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
          BED_HOLD_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async createAssignment(
    input:
      Omit<
        AdmissionBedAssignmentRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<
    AdmissionBedAssignmentRecord
  > {
    try {
      const created =
        await AdmissionBedAssignmentModel.create(
          input,
        );

      return record<
        AdmissionBedAssignmentRecord
      >(
        await AdmissionBedAssignmentModel.findById(
          created._id,
        )
          .select(
            ASSIGNMENT_SELECT,
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
        'CREATE_BED_ASSIGNMENT',
      );
    }
  }

  public async updateAssignment(
    facilityId:
      string,

    assignmentId:
      string,

    expectedVersion:
      number,

    update:
      BedAssignmentPersistenceUpdate,
  ): Promise<
    AdmissionBedAssignmentRecord | null
  > {
    return record<
      AdmissionBedAssignmentRecord | null
    >(
      await AdmissionBedAssignmentModel.findOneAndUpdate(
        {
          _id:
            toObjectId(
              assignmentId,
              'assignmentId',
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
          ASSIGNMENT_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async createBedStatusHistory(
    input:
      Omit<
        BedStatusHistoryRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<
    BedStatusHistoryRecord
  > {
    const created =
      await BedStatusHistoryModel.create(
        input,
      );

    return record<
      BedStatusHistoryRecord
    >(
      await BedStatusHistoryModel.findById(
        created._id,
      )
        .select(
          BED_STATUS_HISTORY_SELECT,
        )
        .lean()
        .orFail()
        .exec(),
    );
  }

  public async findLatestBedStatusHistory(
    facilityId:
      string,

    bedId:
      string,
  ): Promise<
    BedStatusHistoryRecord | null
  > {
    return record<
      BedStatusHistoryRecord | null
    >(
      await BedStatusHistoryModel.findOne({
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
            -1,
        })
        .lean()
        .exec(),
    );
  }

  public async createChargeSegment(
    input:
      Omit<
        BedChargeSegmentRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<
    BedChargeSegmentRecord
  > {
    const created =
      await BedChargeSegmentModel.create(
        input,
      );

    return record<
      BedChargeSegmentRecord
    >(
      await BedChargeSegmentModel.findById(
        created._id,
      )
        .select(
          BED_CHARGE_SELECT,
        )
        .lean()
        .orFail()
        .exec(),
    );
  }

  public async updateChargeSegment(
    facilityId:
      string,

    chargeSegmentId:
      string,

    expectedVersion:
      number,

    update:
      BedChargeSegmentPersistenceUpdate,
  ): Promise<
    BedChargeSegmentRecord | null
  > {
    return record<
      BedChargeSegmentRecord | null
    >(
      await BedChargeSegmentModel.findOneAndUpdate(
        {
          _id:
            toObjectId(
              chargeSegmentId,
              'chargeSegmentId',
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
          BED_CHARGE_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async expireActiveHolds(
    facilityId:
      string,

    occurredAt:
      Date,

    actorUserId:
      string,

    limit:
      number,
  ): Promise<
    BedHoldRecord[]
  > {
    const holds =
      record<
        BedHoldRecord[]
      >(
        await BedHoldModel.find({
          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          status:
            'ACTIVE',

          isActive:
            true,

          expiresAt: {
            $lte:
              occurredAt,
          },
        })
          .select(
            BED_HOLD_SELECT,
          )
          .sort({
            expiresAt:
              1,
          })
          .limit(
            limit,
          )
          .lean()
          .exec(),
      );

    const expired:
      BedHoldRecord[] = [];

    for (
      const hold of
      holds
    ) {
      const updated =
        await this.updateBedHold(
          facilityId,
          hold._id.toHexString(),
          hold.version,
          {
            status:
              'EXPIRED',

            isActive:
              false,

            endedAt:
              occurredAt,

            endedBy:
              toObjectId(
                actorUserId,
                'actorUserId',
              ),

            endingReason:
              'The bed hold expired before allocation',

            updatedBy:
              toObjectId(
                actorUserId,
                'actorUserId',
              ),
          },
        );

      if (
        updated !== null
      ) {
        expired.push(
          updated,
        );
      }
    }

    return expired;
  }

  public async projectBedState(
    facilityId:
      string,

    bedId:
      string,

    expectedVersion:
      number,

    update:
      Partial<
        Pick<
          BedRecord,
          | 'operationalStatus'
          | 'operationalStatusChangedAt'
          | 'operationalStatusChangedBy'
          | 'operationalStatusReasonCode'
          | 'operationalStatusReason'
          | 'currentAdmissionId'
          | 'currentAssignmentId'
          | 'currentPatientId'
          | 'activeHoldId'
          | 'lastReleasedAt'
          | 'maintenanceReference'
          | 'updatedBy'
        >
      >,
  ): Promise<
    BedRecord | null
  > {
    return record<
      BedRecord | null
    >(
      await BedModel.findOneAndUpdate(
        {
          _id:
            toObjectId(
              bedId,
              'bedId',
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
          BED_SELECT,
        )
        .lean()
        .exec(),
    );
  }
}