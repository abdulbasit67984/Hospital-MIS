import {
  DischargeModel,
  DischargeSummaryModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  DischargeRecord,
  DischargeRepositoryPort,
  DischargeSummaryRecord,
} from '../inpatient-discharge.contracts.js';

const DISCHARGE_SELECT = [
  '_id',
  'facilityId',
  'dischargeNumber',
  'admissionId',
  'admissionNumberSnapshot',
  '+patientId',
  'encounterId',
  'attendingConsultantUserId',
  'attendingConsultantStaffId',
  'initiatingDepartmentId',
  'status',
  'disposition',
  'initiatedAt',
  'initiatedByUserId',
  'initiatedByStaffId',
  'clinicalClearanceAt',
  'clinicalClearanceByUserId',
  'clinicalClearanceByStaffId',
  'financialClearanceRequestedAt',
  'financialClearanceRequestId',
  'financialClearanceReference',
  'financiallyClearedAt',
  'financiallyClearedByUserId',
  'completedAt',
  'completedByUserId',
  'completedByStaffId',
  'cancelledAt',
  'cancelledByUserId',
  'cancelledByStaffId',
  '+cancellationReason',
  'checklist',
  'medicationReconciliationCompleted',
  'medicationReconciliationItems',
  'dischargeSummaryId',
  'latestDischargeSummaryVersionId',
  'currentSummaryVersion',
  'billingAccountReference',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(
  ' ',
);

const SUMMARY_SELECT = [
  '_id',
  'facilityId',
  'dischargeId',
  'admissionId',
  '+patientId',
  'encounterId',
  'summaryNumber',
  'versionNumber',
  'previousVersionId',
  'status',
  '+admissionReason',
  '+hospitalCourse',
  '+proceduresPerformed',
  '+significantInvestigations',
  'diagnosisSnapshots',
  '+conditionAtDischarge',
  'medicationReconciliationItems',
  'followUpInstructions',
  '+warningSigns',
  '+patientInstructions',
  'preparedAt',
  'preparedByUserId',
  'preparedByStaffId',
  'finalizedAt',
  'finalizedByUserId',
  'finalizedByStaffId',
  '+amendmentReason',
  'snapshotHash',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(
  ' ',
);

function record<T>(
  value:
    unknown,
): T {
  return value as T;
}

export class InpatientDischargeRepository
implements DischargeRepositoryPort {
  public async createDischarge(
    input:
      Omit<
        DischargeRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<DischargeRecord> {
    const created =
      await DischargeModel.create(
        input,
      );

    return record<DischargeRecord>(
      await DischargeModel.findById(
        created._id,
      )
        .select(
          DISCHARGE_SELECT,
        )
        .lean()
        .orFail()
        .exec(),
    );
  }

  public async findDischargeById(
    facilityId:
      string,

    dischargeId:
      string,
  ): Promise<DischargeRecord | null> {
    return record<DischargeRecord | null>(
      await DischargeModel.findOne({
        _id:
          toObjectId(
            dischargeId,
            'dischargeId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          DISCHARGE_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async findActiveDischargeByAdmission(
    facilityId:
      string,

    admissionId:
      string,
  ): Promise<DischargeRecord | null> {
    return record<DischargeRecord | null>(
      await DischargeModel.findOne({
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

        status: {
          $in: [
            'INITIATED',
            'CLINICALLY_CLEARED',
            'FINANCIAL_CLEARANCE_PENDING',
            'FINANCIALLY_CLEARED',
            'COMPLETED',
          ],
        },
      })
        .select(
          DISCHARGE_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async updateDischarge(
    facilityId:
      string,

    dischargeId:
      string,

    expectedVersion:
      number,

    update:
      Record<string, unknown>,
  ): Promise<DischargeRecord | null> {
    return record<DischargeRecord | null>(
      await DischargeModel.findOneAndUpdate(
        {
          _id:
            toObjectId(
              dischargeId,
              'dischargeId',
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
          DISCHARGE_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async createDischargeSummary(
    input:
      Record<string, unknown>,
  ): Promise<DischargeSummaryRecord> {
    const created =
      await DischargeSummaryModel.create(
        input,
      );

    return record<DischargeSummaryRecord>(
      await DischargeSummaryModel.findById(
        created._id,
      )
        .select(
          SUMMARY_SELECT,
        )
        .lean()
        .orFail()
        .exec(),
    );
  }

  public async findLatestDischargeSummary(
    facilityId:
      string,

    dischargeId:
      string,
  ): Promise<DischargeSummaryRecord | null> {
    return record<
      DischargeSummaryRecord | null
    >(
      await DischargeSummaryModel.findOne({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        dischargeId:
          toObjectId(
            dischargeId,
            'dischargeId',
          ),
      })
        .select(
          SUMMARY_SELECT,
        )
        .sort({
          versionNumber:
            -1,
        })
        .lean()
        .exec(),
    );
  }
}