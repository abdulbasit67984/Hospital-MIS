import type {
  Db,
} from '@hospital-mis/database';

import {
  StaffModel,
  createObjectId,
  toObjectId,
} from '@hospital-mis/database';

import {
  ConflictError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import type {
  RadiologyChargeBridgePort,
} from '../modules/radiology/services/radiology-command.service.js';

import type {
  RadiologyImagingGatewayPort,
  RadiologyInventoryUsageBoundaryPort,
} from '../modules/radiology/radiology-operations.ports.js';

import type {
  RadiologyCriticalNotificationPort,
  RadiologyReportArtifactPort,
  RadiologyReportAttachmentPort,
  RadiologyReportingStaffPort,
} from '../modules/radiology/radiology-reporting.contracts.js';

export interface UnifiedRadiologyBillingPort {
  createSourceCharge(input: {
    facilityId: string;
    patientId: string;
    encounterId: string;
    sourceModule: 'RADIOLOGY';
    sourceType: 'RADIOLOGY_ORDER_ITEM';
    sourceId: string;
    chargeCatalogItemId: string;
    quantity: string;
    requestedBy: string;
    requestedAt: Date;
    correlationId: string;
    transactionId: string;
    idempotencyKey: string;
  }): Promise<{
    state: 'PENDING' | 'CHARGED';
    chargeId: string | null;
  }>;

  cancelOrRefundSourceCharge(input: {
    facilityId: string;
    sourceModule: 'RADIOLOGY';
    sourceType: 'RADIOLOGY_ORDER_ITEM';
    sourceId: string;
    chargeId: string | null;
    reason: string;
    requestedBy: string;
    requestedAt: Date;
    correlationId: string;
    transactionId: string;
    idempotencyKey: string;
  }): Promise<void>;
}

export class UnifiedRadiologyChargeAdapter
  implements RadiologyChargeBridgePort
{
  public constructor(
    private readonly billing: UnifiedRadiologyBillingPort,
  ) {}

  public async requestCharge(
    request: Parameters<
      RadiologyChargeBridgePort['requestCharge']
    >[0],
  ): Promise<
    Awaited<
      ReturnType<
        RadiologyChargeBridgePort['requestCharge']
      >
    >
  > {
    const result =
      await this.billing.createSourceCharge({
        facilityId:
          request.facilityId,

        patientId:
          request.patientId,

        encounterId:
          request.encounterId,

        sourceModule:
          'RADIOLOGY',

        sourceType:
          'RADIOLOGY_ORDER_ITEM',

        sourceId:
          request.radiologyOrderItemId,

        chargeCatalogItemId:
          request.chargeCatalogItemId,

        quantity:
          request.quantity,

        requestedBy:
          request.requestedBy,

        requestedAt:
          request.requestedAt,

        correlationId:
          request.correlationId,

        transactionId:
          request.transactionId,

        idempotencyKey: [
          request.transactionId,
          'radiology-charge',
          request.radiologyOrderItemId,
        ].join(':'),
      });

    return {
      status:
        result.state,

      accountChargeId:
        result.chargeId,
    } as Awaited<
      ReturnType<
        RadiologyChargeBridgePort['requestCharge']
      >
    >;
  }

  public async requestCancellation(
    request: Parameters<
      RadiologyChargeBridgePort['requestCancellation']
    >[0],
  ): Promise<
    Awaited<
      ReturnType<
        RadiologyChargeBridgePort['requestCancellation']
      >
    >
  > {
    await this.billing.cancelOrRefundSourceCharge({
      facilityId:
        request.facilityId,

      sourceModule:
        'RADIOLOGY',

      sourceType:
        'RADIOLOGY_ORDER_ITEM',

      sourceId:
        request.radiologyOrderItemId,

      chargeId:
        request.accountChargeId,

      reason:
        request.reason,

      requestedBy:
        request.requestedBy,

      requestedAt:
        request.requestedAt,

      correlationId:
        request.correlationId,

      transactionId:
        request.transactionId,

      idempotencyKey: [
        request.transactionId,
        'radiology-charge-cancellation',
        request.radiologyOrderItemId,
      ].join(':'),
    });
  }
}

export interface UnifiedPacsRisGatewayPort {
  verifyStudy(input: {
    facilityId: string;
    patientId: string;
    accessionNumber: string;
    studyInstanceUid: string;
    studyDateTime: Date;
    externalReferences:
      readonly Record<string, unknown>[];
    series:
      readonly Record<string, unknown>[];
    correlationId: string;
  }): Promise<{
    studyInstanceUid: string;
    studyDateTime: Date;
    externalReferences:
      Record<string, unknown>[];
    series:
      Record<string, unknown>[];
    containsBinaryPayload?: boolean;
  }>;
}

export class PacsRisRadiologyImagingGatewayAdapter
  implements RadiologyImagingGatewayPort
{
  public constructor(
    private readonly gateway:
      UnifiedPacsRisGatewayPort,
  ) {}

  public async verifyExternalStudy(
    input: Parameters<
      RadiologyImagingGatewayPort['verifyExternalStudy']
    >[0],
  ): Promise<
    Awaited<
      ReturnType<
        RadiologyImagingGatewayPort['verifyExternalStudy']
      >
    >
  > {
    const result =
      await this.gateway.verifyStudy({
        facilityId:
          input.facilityId,

        patientId:
          input.patientId,

        accessionNumber:
          input.accessionNumber,

        studyInstanceUid:
          input.studyInstanceUid,

        studyDateTime:
          input.studyDateTime,

        externalReferences:
          input.externalReferences as readonly Record<
            string,
            unknown
          >[],

        series:
          input.series as readonly Record<
            string,
            unknown
          >[],

        correlationId:
          input.correlationId,
      });

    if (
      result.containsBinaryPayload ===
      true
    ) {
      throw new ConflictError(
        'PACS or RIS integration returned image binaries; Radiology accepts metadata references only',
      );
    }

    if (
      result.studyInstanceUid !==
        input.studyInstanceUid ||
      result.externalReferences.length <
        1 ||
      result.series.length <
        1
    ) {
      throw new ConflictError(
        'PACS or RIS study verification returned incomplete or mismatched metadata',
      );
    }

    return {
      studyInstanceUid:
        result.studyInstanceUid,

      studyDateTime:
        result.studyDateTime,

      references:
        result.externalReferences,

      series:
        result.series,
    } as Awaited<
      ReturnType<
        RadiologyImagingGatewayPort['verifyExternalStudy']
      >
    >;
  }
}

export interface UnifiedInventoryUsagePort {
  recordSourceUsage(input: {
    facilityId: string;
    patientId: string;
    encounterId: string;
    sourceModule: 'RADIOLOGY';
    sourceType: 'RADIOLOGY_EXAMINATION';
    sourceId: string;
    sourceItemId: string;
    productReference: string;
    quantity: string;
    unitCode: string;
    requestedBy: string;
    requestedAt: Date;
    correlationId: string;
    transactionId: string;
    idempotencyKey: string;
  }): Promise<{
    usageReference: string;
  }>;
}

export class RadiologyInventoryUsageAdapter
  implements RadiologyInventoryUsageBoundaryPort
{
  public constructor(
    private readonly inventory:
      UnifiedInventoryUsagePort,
  ) {}

  public async recordContrastUsage(
    request: Parameters<
      RadiologyInventoryUsageBoundaryPort['recordContrastUsage']
    >[0],
  ): Promise<
    Awaited<
      ReturnType<
        RadiologyInventoryUsageBoundaryPort['recordContrastUsage']
      >
    >
  > {
    return this.inventory.recordSourceUsage({
      facilityId:
        request.facilityId,

      patientId:
        request.patientId,

      encounterId:
        request.encounterId,

      sourceModule:
        'RADIOLOGY',

      sourceType:
        'RADIOLOGY_EXAMINATION',

      sourceId:
        request.examinationId,

      sourceItemId:
        request.radiologyOrderItemId,

      productReference:
        request.productReference,

      quantity:
        request.quantity,

      unitCode:
        request.unitCode,

      requestedBy:
        request.requestedBy,

      requestedAt:
        request.requestedAt,

      correlationId:
        request.correlationId,

      transactionId:
        request.transactionId,

      idempotencyKey: [
        request.transactionId,
        'radiology-contrast-usage',
        request.examinationId,
      ].join(':'),
    });
  }
}

export class MongoRadiologyReportingStaffAdapter
  implements RadiologyReportingStaffPort
{
  public async assertEligibleRadiologist(
    input: Parameters<
      RadiologyReportingStaffPort['assertEligibleRadiologist']
    >[0],
  ): Promise<void> {
    const staff =
      await StaffModel.findOne({
        _id:
          toObjectId(
            input.staffId,
            'staffId',
          ),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        employmentStatus:
          'ACTIVE',

        isActive:
          true,

        isClinical:
          true,
      })
        .select(
          '_id professionalType designation professionalRegistrationNumber',
        )
        .lean()
        .exec();

    if (
      staff ===
      null
    ) {
      throw new ResourceNotFoundError(
        'The assigned Radiology reporting staff member is not active in this facility',
      );
    }

    const professionalDescriptor = [
      staff.professionalType,
      staff.designation,
    ]
      .filter(
        (
          value,
        ): value is string =>
          typeof value ===
          'string',
      )
      .join(' ')
      .toLocaleLowerCase(
        'en-US',
      );

    if (
      staff.professionalRegistrationNumber ==
        null ||
      !professionalDescriptor.includes(
        'radiolog',
      )
    ) {
      throw new ConflictError(
        'Radiology report assignment requires an active registered radiologist',
      );
    }
  }
}

interface AttachmentRecord {
  _id: unknown;
  facilityId: unknown;
  status?: string;
  deletedAt?: Date | null;
  malwareScanStatus?: string;
  purpose?: string;
}

export class MongoRadiologyReportAttachmentAdapter
  implements RadiologyReportAttachmentPort
{
  public constructor(
    private readonly database:
      Db,
  ) {}

  public async assertUsable(
    input: Parameters<
      RadiologyReportAttachmentPort['assertUsable']
    >[0],
  ): Promise<void> {
    if (
      input.attachmentIds.length ===
      0
    ) {
      return;
    }

    const uniqueIds = [
      ...new Set(
        input.attachmentIds,
      ),
    ];

    const attachments =
      await this.database
        .collection<AttachmentRecord>(
          'attachments',
        )
        .find({
          _id: {
            $in:
              uniqueIds.map(
                (
                  id,
                ) =>
                  toObjectId(
                    id,
                    'attachmentIds',
                  ),
              ),
          },

          facilityId:
            toObjectId(
              input.facilityId,
              'facilityId',
            ),

          $and: [
            {
              $or: [
                {
                  deletedAt:
                    null,
                },
                {
                  deletedAt: {
                    $exists:
                      false,
                  },
                },
              ],
            },
            {
              $or: [
                {
                  malwareScanStatus:
                    'CLEAN',
                },
                {
                  malwareScanStatus: {
                    $exists:
                      false,
                  },
                },
              ],
            },
          ],
        })
        .project({
          _id:
            1,
        })
        .toArray();

    if (
      attachments.length !==
      uniqueIds.length
    ) {
      throw new ConflictError(
        'One or more Radiology report attachments are missing, deleted, unsafe, or outside the facility',
      );
    }
  }
}

export interface UnifiedReportArtifactStoragePort {
  store(input: {
    facilityId: string;
    module: 'RADIOLOGY';
    entityType: 'RADIOLOGY_REPORT_VERSION';
    entityId: string;
    filename: string;
    mediaType: 'application/pdf';
    bytes: Uint8Array;
    contentHash: string;
    generatedAt: Date;
    correlationId: string;
  }): Promise<{
    storageReference: string;
    sizeBytes: number;
  }>;
}

export class MongoRadiologyReportArtifactAdapter
  implements RadiologyReportArtifactPort
{
  public constructor(
    private readonly database:
      Db,

    private readonly storage:
      UnifiedReportArtifactStoragePort,
  ) {}

  public async storeGeneratedReport(
    input: Parameters<
      RadiologyReportArtifactPort['storeGeneratedReport']
    >[0],
  ): Promise<
    Awaited<
      ReturnType<
        RadiologyReportArtifactPort['storeGeneratedReport']
      >
    >
  > {
    const stored =
      await this.storage.store({
        facilityId:
          input.facilityId,

        module:
          'RADIOLOGY',

        entityType:
          'RADIOLOGY_REPORT_VERSION',

        entityId:
          input.reportVersionId,

        filename:
          input.filename,

        mediaType:
          input.mediaType,

        bytes:
          input.bytes,

        contentHash:
          input.contentHash,

        generatedAt:
          input.generatedAt,

        correlationId:
          input.correlationId,
      });

    const artifactId =
      createObjectId();

    await this.database
      .collection(
        'reportArtifacts',
      )
      .insertOne({
        _id:
          artifactId,

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        data: {
          module:
            'RADIOLOGY',

          reportType:
            'RADIOLOGY_FINAL_REPORT',

          entityType:
            'RadiologyReportVersion',

          entityId:
            input.reportVersionId,

          radiologyReportId:
            input.reportId,

          radiologyReportVersionId:
            input.reportVersionId,

          patientId:
            input.patientId,

          encounterId:
            input.encounterId,

          filename:
            input.filename,

          mediaType:
            input.mediaType,

          storageReference:
            stored.storageReference,

          contentHash:
            input.contentHash,

          sizeBytes:
            stored.sizeBytes,

          generatedAt:
            input.generatedAt.toISOString(),

          generatedBy:
            input.generatedBy,

          transactionId:
            input.transactionId,

          correlationId:
            input.correlationId,

          status:
            'AVAILABLE',

          binaryStorageProhibited:
            true,
        },

        schemaVersion:
          1,

        version:
          0,

        createdAt:
          input.generatedAt,

        updatedAt:
          input.generatedAt,
      });

    return {
      artifactId:
        artifactId.toHexString(),
    };
  }
}

export interface UnifiedClinicalNotificationPort {
  notify(input: {
    facilityId: string;
    module: 'RADIOLOGY';
    notificationType: 'CRITICAL_FINDING';
    reportId: string;
    reportVersionId: string;
    patientId: string;
    encounterId: string;
    findingCode: string;
    urgency: 'URGENT' | 'CRITICAL';
    recipientType: string;
    recipientUserId: string | null;
    recipientStaffId: string | null;
    channel: string;
    correlationId: string;
    transactionId: string;
    idempotencyKey: string;
  }): Promise<void>;
}

export class RadiologyCriticalNotificationAdapter
  implements RadiologyCriticalNotificationPort
{
  public constructor(
    private readonly notifications:
      UnifiedClinicalNotificationPort,
  ) {}

  public async notify(
    input: Parameters<
      RadiologyCriticalNotificationPort['notify']
    >[0],
  ): Promise<void> {
    await this.notifications.notify({
      facilityId:
        input.facilityId,

      module:
        'RADIOLOGY',

      notificationType:
        'CRITICAL_FINDING',

      reportId:
        input.reportId,

      reportVersionId:
        input.reportVersionId,

      patientId:
        input.patientId,

      encounterId:
        input.encounterId,

      findingCode:
        input.findingCode,

      urgency:
        input.urgency,

      recipientType:
        input.recipientType,

      recipientUserId:
        input.recipientUserId,

      recipientStaffId:
        input.recipientStaffId,

      channel:
        input.channel,

      correlationId:
        input.correlationId,

      transactionId:
        input.transactionId,

      idempotencyKey: [
        input.transactionId,
        'radiology-critical-notification',
        input.reportVersionId,
        input.findingCode,
        input.recipientType,
      ].join(':'),
    });
  }
}

export function createRadiologyPlatformAdapters(
  input: {
    database: Db;
    billing: UnifiedRadiologyBillingPort;
    imaging: UnifiedPacsRisGatewayPort;
    inventory: UnifiedInventoryUsagePort;
    artifactStorage:
      UnifiedReportArtifactStoragePort;
    notifications:
      UnifiedClinicalNotificationPort;
  },
) {
  return {
    charges:
      new UnifiedRadiologyChargeAdapter(
        input.billing,
      ),

    imagingGateway:
      new PacsRisRadiologyImagingGatewayAdapter(
        input.imaging,
      ),

    inventoryUsage:
      new RadiologyInventoryUsageAdapter(
        input.inventory,
      ),

    reportingStaff:
      new MongoRadiologyReportingStaffAdapter(),

    reportAttachments:
      new MongoRadiologyReportAttachmentAdapter(
        input.database,
      ),

    reportArtifacts:
      new MongoRadiologyReportArtifactAdapter(
        input.database,
        input.artifactStorage,
      ),

    criticalNotifications:
      new RadiologyCriticalNotificationAdapter(
        input.notifications,
      ),
  };
}