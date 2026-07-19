import {
  RadiologyCriticalFindingCommunicationModel,
  RadiologyReportModel,
  RadiologyReportVersionModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  RadiologyCriticalFindingCommunicationRecord,
  RadiologyReportRecord,
  RadiologyReportRepositoryPort,
  RadiologyReportVersionRecord,
} from '../radiology-reporting.contracts.js';

function record<T>(
  value:
    unknown,
): T {
  return value as T;
}

const BASE_REPORT_SELECT = [
  '_id',
  'facilityId',
  'reportNumber',
  'radiologyOrderId',
  'radiologyOrderItemId',
  'imagingStudyId',
  'examinationId',
  'patientId',
  'encounterId',
  'procedureId',
  'procedureCodeSnapshot',
  'procedureNameSnapshot',
  'modalityCodeSnapshot',
  'accessionNumberSnapshot',
  'studyInstanceUidSnapshot',
  'assignedRadiologistStaffId',
  'assignedAt',
  'assignedByStaffId',
  'status',
  'urgency',
  'criticalFindingCount',
  'unresolvedCriticalFindingCount',
  'attachmentIds',
  'authoredAt',
  'authoredBy',
  'authorStaffId',
  'preliminaryAt',
  'preliminaryBy',
  'preliminaryRadiologistStaffId',
  'finalizedAt',
  'finalizedBy',
  'finalRadiologistStaffId',
  'currentVersion',
  'latestVersionId',
  'correctedAt',
  'correctedBy',
  'supersedesReportVersionId',
  'addendumCount',
  'latestAddendumAt',
  'publicationStatus',
  'publishedAt',
  'publishedBy',
  'withdrawnAt',
  'withdrawnBy',
  'latestRenderedArtifactId',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const SENSITIVE_REPORT_SELECT = [
  '+clinicalHistory',
  '+comparisonStudyReferences',
  '+findings',
  '+impression',
  '+recommendations',
  '+criticalFindings',
  '+correctionReason',
  '+withdrawalReason',
].join(' ');

const VERSION_SELECT = [
  '_id',
  'facilityId',
  'radiologyReportId',
  'radiologyOrderId',
  'radiologyOrderItemId',
  'imagingStudyId',
  'patientId',
  'encounterId',
  'versionNumber',
  'previousVersionId',
  'changeType',
  'statusSnapshot',
  'urgencySnapshot',
  'criticalFindingCountSnapshot',
  'attachmentIdsSnapshot',
  'snapshotHash',
  'contentHash',
  'authorStaffId',
  'finalRadiologistStaffId',
  'recordedAt',
  'recordedBy',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const COMMUNICATION_SELECT = [
  '_id',
  'facilityId',
  'radiologyReportId',
  'radiologyReportVersionId',
  'radiologyOrderId',
  'patientId',
  'encounterId',
  'sequence',
  'findingCodeSnapshot',
  'urgencySnapshot',
  'communicationType',
  'channel',
  'recipientType',
  'recipientUserId',
  'recipientStaffId',
  '+recipientDisplaySnapshot',
  '+communicationNotes',
  'acknowledgesCommunicationId',
  'occurredAt',
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

export class RadiologyReportRepository
  implements RadiologyReportRepositoryPort {
  public async findById(
    facilityId: string,
    reportId: string,
    includeSensitive =
      false,
  ): Promise<
    | RadiologyReportRecord
    | null
  > {
    const query =
      RadiologyReportModel.findOne({
        _id:
          toObjectId(
            reportId,
            'reportId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      }).select(
        BASE_REPORT_SELECT,
      );

    if (
      includeSensitive
    ) {
      query.select(
        SENSITIVE_REPORT_SELECT,
      );
    }

    return record<
      | RadiologyReportRecord
      | null
    >(
      await query
        .lean()
        .exec(),
    );
  }

  public async findByOrderItem(
    facilityId: string,
    orderItemId: string,
    includeSensitive =
      false,
  ): Promise<
    | RadiologyReportRecord
    | null
  > {
    const query =
      RadiologyReportModel.findOne({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        radiologyOrderItemId:
          toObjectId(
            orderItemId,
            'orderItemId',
          ),
      }).select(
        BASE_REPORT_SELECT,
      );

    if (
      includeSensitive
    ) {
      query.select(
        SENSITIVE_REPORT_SELECT,
      );
    }

    return record<
      | RadiologyReportRecord
      | null
    >(
      await query
        .lean()
        .exec(),
    );
  }

  public async listPublishedByEncounter(
    facilityId: string,
    encounterId: string,
    page: number,
    pageSize: number,
  ): Promise<{
    items:
      RadiologyReportRecord[];

    total:
      number;
  }> {
    const filter = {
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

      publicationStatus:
        'PUBLISHED',
    };

    const [
      items,
      total,
    ] =
      await Promise.all([
        RadiologyReportModel.find(
          filter,
        )
          .select(
            BASE_REPORT_SELECT,
          )
          .sort({
            finalizedAt:
              -1,

            _id:
              -1,
          })
          .skip(
            (page - 1) *
              pageSize,
          )
          .limit(
            pageSize,
          )
          .lean()
          .exec(),

        RadiologyReportModel.countDocuments(
          filter,
        ).exec(),
      ]);

    return {
      items:
        record<
          RadiologyReportRecord[]
        >(
          items,
        ),

      total,
    };
  }

  public async listPublishedByPatient(
    facilityId: string,
    patientId: string,
    page: number,
    pageSize: number,
  ): Promise<{
    items:
      RadiologyReportRecord[];

    total:
      number;
  }> {
    const filter = {
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

      publicationStatus:
        'PUBLISHED',
    };

    const [
      items,
      total,
    ] =
      await Promise.all([
        RadiologyReportModel.find(
          filter,
        )
          .select(
            BASE_REPORT_SELECT,
          )
          .sort({
            finalizedAt:
              -1,

            _id:
              -1,
          })
          .skip(
            (page - 1) *
              pageSize,
          )
          .limit(
            pageSize,
          )
          .lean()
          .exec(),

        RadiologyReportModel.countDocuments(
          filter,
        ).exec(),
      ]);

    return {
      items:
        record<
          RadiologyReportRecord[]
        >(
          items,
        ),

      total,
    };
  }

  public async create(
    input:
      Record<
        string,
        unknown
      >,
  ): Promise<
    RadiologyReportRecord
  > {
    const document =
      await RadiologyReportModel.create(
        input,
      );

    return record<
      RadiologyReportRecord
    >(
      document.toObject(),
    );
  }

  public async update(
    facilityId: string,
    reportId: string,
    expectedVersion: number,
    update:
      Record<
        string,
        unknown
      >,
  ): Promise<
    | RadiologyReportRecord
    | null
  > {
    return record<
      | RadiologyReportRecord
      | null
    >(
      await RadiologyReportModel.findOneAndUpdate(
        {
          _id:
            toObjectId(
              reportId,
              'reportId',
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
          `${BASE_REPORT_SELECT} ${SENSITIVE_REPORT_SELECT}`,
        )
        .lean()
        .exec(),
    );
  }

  public async appendVersion(
    input:
      Record<
        string,
        unknown
      >,
  ): Promise<
    RadiologyReportVersionRecord
  > {
    const document =
      await RadiologyReportVersionModel.create(
        input,
      );

    return record<
      RadiologyReportVersionRecord
    >(
      document.toObject(),
    );
  }

  public async findVersionById(
    facilityId: string,
    versionId: string,
    includeEncrypted =
      false,
  ): Promise<
    | RadiologyReportVersionRecord
    | null
  > {
    const query =
      RadiologyReportVersionModel.findOne({
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
      }).select(
        VERSION_SELECT,
      );

    if (
      includeEncrypted
    ) {
      query.select(
        '+encryptedSnapshot +encryptedSnapshot.ciphertext +changeReason',
      );
    }

    return record<
      | RadiologyReportVersionRecord
      | null
    >(
      await query
        .lean()
        .exec(),
    );
  }

  public async listVersions(
    facilityId: string,
    reportId: string,
  ): Promise<
    RadiologyReportVersionRecord[]
  > {
    return record<
      RadiologyReportVersionRecord[]
    >(
      await RadiologyReportVersionModel.find({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        radiologyReportId:
          toObjectId(
            reportId,
            'reportId',
          ),
      })
        .select(
          VERSION_SELECT,
        )
        .sort({
          versionNumber:
            1,
        })
        .lean()
        .exec(),
    );
  }

  public async appendCriticalCommunication(
    input:
      Record<
        string,
        unknown
      >,
  ): Promise<
    RadiologyCriticalFindingCommunicationRecord
  > {
    const document =
      await RadiologyCriticalFindingCommunicationModel.create(
        input,
      );

    return record<
      RadiologyCriticalFindingCommunicationRecord
    >(
      document.toObject(),
    );
  }

  public async findCriticalCommunicationById(
    facilityId: string,
    communicationId: string,
  ): Promise<
    | RadiologyCriticalFindingCommunicationRecord
    | null
  > {
    return record<
      | RadiologyCriticalFindingCommunicationRecord
      | null
    >(
      await RadiologyCriticalFindingCommunicationModel.findOne(
        {
          _id:
            toObjectId(
              communicationId,
              'communicationId',
            ),

          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),
        },
      )
        .select(
          COMMUNICATION_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async listCriticalCommunications(
    facilityId: string,
    reportId: string,
  ): Promise<
    RadiologyCriticalFindingCommunicationRecord[]
  > {
    return record<
      RadiologyCriticalFindingCommunicationRecord[]
    >(
      await RadiologyCriticalFindingCommunicationModel.find(
        {
          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          radiologyReportId:
            toObjectId(
              reportId,
              'reportId',
            ),
        },
      )
        .select(
          COMMUNICATION_SELECT,
        )
        .sort({
          sequence:
            1,
        })
        .lean()
        .exec(),
    );
  }
}