import {
  RadiologyAppointmentModel,
  RadiologyModalityModel,
  RadiologyOrderItemModel,
  RadiologyOrderItemStatusHistoryModel,
  RadiologyOrderModel,
  RadiologyOrderStatusHistoryModel,
  RadiologyProcedureModel,
  RadiologyResourceModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import type {
  RadiologyActorContext,
} from '../radiology.types.js';

import type {
  RadiologyReportRepositoryPort,
  RadiologyReportSummaryView,
} from '../radiology-reporting.contracts.js';

import {
  RadiologyCommandService,
} from './radiology-command.service.js';

interface CatalogQuery {
  q?: string;
  modalityId?: string;
  departmentId?: string;
  status?: string;
  effectiveAt?: string;
  page: number;
  pageSize: number;
}

interface OrderQuery {
  status?: string;
  priority?: string;
  patientId?: string;
  encounterId?: string;
  departmentId?: string;
  orderedFrom?: string;
  orderedTo?: string;
  page: number;
  pageSize: number;
}

interface AppointmentQuery {
  scheduledFrom?: string;
  scheduledTo?: string;
  departmentId?: string;
  modalityId?: string;
  resourceId?: string;
  technicianStaffId?: string;
  appointmentStatus?: string;
  page: number;
  pageSize: number;
}

function idString(
  value:
    unknown,
): string | null {
  if (
    value !==
      null &&
    typeof value ===
      'object' &&
    'toHexString' in
      value &&
    typeof value.toHexString ===
      'function'
  ) {
    return value.toHexString();
  }

  return null;
}

function isoString(
  value:
    unknown,
): string | null {
  return value instanceof
    Date
    ? value.toISOString()
    : null;
}

function escapedRegex(
  value:
    string,
): string {
  return value.replaceAll(
    /[.*+?^${}()|[\]\\]/gu,
    '\\$&',
  );
}

function effectiveFilter(
  effectiveAt?:
    string,
): Record<
  string,
  unknown
> {
  if (
    effectiveAt ===
    undefined
  ) {
    return {};
  }

  const at =
    new Date(
      effectiveAt,
    );

  return {
    effectiveFrom: {
      $lte:
        at,
    },

    $and: [
      {
        $or: [
          {
            effectiveThrough:
              null,
          },
          {
            effectiveThrough: {
              $gte:
                at,
            },
          },
        ],
      },
    ],
  };
}

function pageWindow(
  page:
    number,

  pageSize:
    number,
) {
  return {
    skip:
      (page -
        1) *
      pageSize,

    limit:
      pageSize,
  };
}

function pageResult<T>(
  items:
    readonly T[],

  total:
    number,

  page:
    number,

  pageSize:
    number,
) {
  return {
    items,
    total,
    page,
    pageSize,
  };
}

function reportSummary(
  report:
    Record<
      string,
      unknown
    >,
): RadiologyReportSummaryView {
  return {
    id:
      idString(
        report[
          '_id'
        ],
      ) as string,

    reportNumber:
      String(
        report[
          'reportNumber'
        ],
      ),

    orderId:
      idString(
        report[
          'radiologyOrderId'
        ],
      ) as string,

    orderItemId:
      idString(
        report[
          'radiologyOrderItemId'
        ],
      ) as string,

    imagingStudyId:
      idString(
        report[
          'imagingStudyId'
        ],
      ) as string,

    procedureCode:
      String(
        report[
          'procedureCodeSnapshot'
        ],
      ),

    procedureName:
      String(
        report[
          'procedureNameSnapshot'
        ],
      ),

    modalityCode:
      String(
        report[
          'modalityCodeSnapshot'
        ],
      ),

    status:
      String(
        report[
          'status'
        ],
      ),

    urgency:
      String(
        report[
          'urgency'
        ],
      ),

    publicationStatus:
      String(
        report[
          'publicationStatus'
        ],
      ),

    versionNumber:
      Number(
        report[
          'currentVersion'
        ],
      ),

    criticalFindingCount:
      Number(
        report[
          'criticalFindingCount'
        ],
      ),

    finalizedAt:
      isoString(
        report[
          'finalizedAt'
        ],
      ),

    publishedAt:
      isoString(
        report[
          'publishedAt'
        ],
      ),
  };
}

export class RadiologyQueryService {
  public constructor(
    private readonly support:
      RadiologyCommandService,

    private readonly reports:
      RadiologyReportRepositoryPort,
  ) {}

  public async searchModalities(
    actor:
      RadiologyActorContext,

    query:
      CatalogQuery,
  ) {
    await this.support.assertAccess(
      actor,
      'CATALOG_READ',
    );

    const filter:
      Record<
        string,
        unknown
      > = {
      facilityId:
        toObjectId(
          actor.facilityId,
          'facilityId',
        ),

      ...effectiveFilter(
        query.effectiveAt,
      ),
    };

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
      query.departmentId !==
      undefined
    ) {
      filter[
        'departmentIds'
      ] =
        toObjectId(
          query.departmentId,
          'departmentId',
        );
    }

    if (
      query.q !==
        undefined &&
      query.q.length >
        0
    ) {
      const pattern =
        escapedRegex(
          query.q,
        );

      filter[
        '$or'
      ] = [
        {
          modalityCode: {
            $regex:
              pattern,

            $options:
              'i',
          },
        },
        {
          name: {
            $regex:
              pattern,

            $options:
              'i',
          },
        },
      ];
    }

    const {
      skip,
      limit,
    } =
      pageWindow(
        query.page,
        query.pageSize,
      );

    const [
      items,
      total,
    ] =
      await Promise.all([
        RadiologyModalityModel.find(
          filter,
        )
          .select(
            '_id modalityCode name modalityType departmentIds description status effectiveFrom effectiveThrough version createdAt updatedAt',
          )
          .sort({
            name:
              1,

            _id:
              1,
          })
          .skip(
            skip,
          )
          .limit(
            limit,
          )
          .lean()
          .exec(),

        RadiologyModalityModel.countDocuments(
          filter,
        ).exec(),
      ]);

    return pageResult(
      items,
      total,
      query.page,
      query.pageSize,
    );
  }

  public async searchProcedures(
    actor:
      RadiologyActorContext,

    query:
      CatalogQuery,
  ) {
    await this.support.assertAccess(
      actor,
      'CATALOG_READ',
    );

    const filter:
      Record<
        string,
        unknown
      > = {
      facilityId:
        toObjectId(
          actor.facilityId,
          'facilityId',
        ),

      ...effectiveFilter(
        query.effectiveAt,
      ),
    };

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
      query.modalityId !==
      undefined
    ) {
      filter[
        'modalityId'
      ] =
        toObjectId(
          query.modalityId,
          'modalityId',
        );
    }

    if (
      query.departmentId !==
      undefined
    ) {
      filter[
        'availableDepartmentIds'
      ] =
        toObjectId(
          query.departmentId,
          'departmentId',
        );
    }

    if (
      query.q !==
        undefined &&
      query.q.length >
        0
    ) {
      const pattern =
        escapedRegex(
          query.q,
        );

      filter[
        '$or'
      ] = [
        {
          procedureCode: {
            $regex:
              pattern,

            $options:
              'i',
          },
        },
        {
          name: {
            $regex:
              pattern,

            $options:
              'i',
          },
        },
        {
          aliases: {
            $regex:
              pattern,

            $options:
              'i',
          },
        },
      ];
    }

    const {
      skip,
      limit,
    } =
      pageWindow(
        query.page,
        query.pageSize,
      );

    const [
      items,
      total,
    ] =
      await Promise.all([
        RadiologyProcedureModel.find(
          filter,
        )
          .select(
            '_id procedureCode name aliases modalityId modalityCodeSnapshot bodyRegionCode lateralityRequirement contrastRequirement expectedDurationMinutes routineTurnaroundMinutes urgentTurnaroundMinutes statTurnaroundMinutes availableDepartmentIds orderable status effectiveFrom effectiveThrough version createdAt updatedAt',
          )
          .sort({
            name:
              1,

            _id:
              1,
          })
          .skip(
            skip,
          )
          .limit(
            limit,
          )
          .lean()
          .exec(),

        RadiologyProcedureModel.countDocuments(
          filter,
        ).exec(),
      ]);

    return pageResult(
      items,
      total,
      query.page,
      query.pageSize,
    );
  }

  public async getProcedure(
    actor:
      RadiologyActorContext,

    procedureId:
      string,
  ) {
    await this.support.assertAccess(
      actor,
      'CATALOG_READ',
    );

    const procedure =
      await RadiologyProcedureModel.findOne(
        {
          _id:
            toObjectId(
              procedureId,
              'procedureId',
            ),

          facilityId:
            toObjectId(
              actor.facilityId,
              'facilityId',
            ),
        },
      )
        .select(
          '_id procedureCode name aliases modalityId modalityCodeSnapshot bodyRegionCode lateralityRequirement allowedLateralities contrastRequirement allowedContrastRoutes safetyScreeningRequirements preparationInstructions expectedDurationMinutes routineTurnaroundMinutes urgentTurnaroundMinutes statTurnaroundMinutes availableDepartmentIds requiresTechnician orderable chargeCatalogItemId status effectiveFrom effectiveThrough version createdAt updatedAt',
        )
        .lean()
        .exec();

    if (
      procedure ===
      null
    ) {
      throw new ResourceNotFoundError(
        'Radiology procedure was not found',
      );
    }

    return procedure;
  }

  public async listResources(
    actor:
      RadiologyActorContext,

    query:
      CatalogQuery,
  ) {
    await this.support.assertAccess(
      actor,
      'SCHEDULE_READ',
    );

    const filter:
      Record<
        string,
        unknown
      > = {
      facilityId:
        toObjectId(
          actor.facilityId,
          'facilityId',
        ),
    };

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
      query.modalityId !==
      undefined
    ) {
      filter[
        'modalityIds'
      ] =
        toObjectId(
          query.modalityId,
          'modalityId',
        );
    }

    if (
      query.departmentId !==
      undefined
    ) {
      filter[
        'departmentId'
      ] =
        toObjectId(
          query.departmentId,
          'departmentId',
        );
    }

    if (
      query.q !==
        undefined &&
      query.q.length >
        0
    ) {
      const pattern =
        escapedRegex(
          query.q,
        );

      filter[
        '$or'
      ] = [
        {
          resourceCode: {
            $regex:
              pattern,

            $options:
              'i',
          },
        },
        {
          name: {
            $regex:
              pattern,

            $options:
              'i',
          },
        },
      ];
    }

    const {
      skip,
      limit,
    } =
      pageWindow(
        query.page,
        query.pageSize,
      );

    const [
      items,
      total,
    ] =
      await Promise.all([
        RadiologyResourceModel.find(
          filter,
        )
          .select(
            '_id resourceCode name resourceType departmentId modalityIds location capabilities manufacturer modelName externalResourceReference status effectiveFrom effectiveThrough deactivatedAt version createdAt updatedAt',
          )
          .sort({
            resourceType:
              1,

            name:
              1,

            _id:
              1,
          })
          .skip(
            skip,
          )
          .limit(
            limit,
          )
          .lean()
          .exec(),

        RadiologyResourceModel.countDocuments(
          filter,
        ).exec(),
      ]);

    return pageResult(
      items,
      total,
      query.page,
      query.pageSize,
    );
  }

  public async listOrders(
    actor:
      RadiologyActorContext,

    query:
      OrderQuery,
  ) {
    await this.support.assertAccess(
      actor,
      'ORDER_READ',
    );

    const filter:
      Record<
        string,
        unknown
      > = {
      facilityId:
        toObjectId(
          actor.facilityId,
          'facilityId',
        ),
    };

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
      query.priority !==
      undefined
    ) {
      filter[
        'priority'
      ] =
        query.priority;
    }

    for (
      const [
        key,
        value,
      ] of
      Object.entries({
        patientId:
          query.patientId,

        encounterId:
          query.encounterId,

        departmentId:
          query.departmentId,
      })
    ) {
      if (
        value !==
        undefined
      ) {
        filter[
          key
        ] =
          toObjectId(
            value,
            key,
          );
      }
    }

    if (
      query.orderedFrom !==
        undefined ||
      query.orderedTo !==
        undefined
    ) {
      filter[
        'orderedAt'
      ] = {
        ...(
          query.orderedFrom ===
          undefined
            ? {}
            : {
                $gte:
                  new Date(
                    query.orderedFrom,
                  ),
              }
        ),

        ...(
          query.orderedTo ===
          undefined
            ? {}
            : {
                $lte:
                  new Date(
                    query.orderedTo,
                  ),
              }
        ),
      };
    }

    const {
      skip,
      limit,
    } =
      pageWindow(
        query.page,
        query.pageSize,
      );

    const [
      items,
      total,
    ] =
      await Promise.all([
        RadiologyOrderModel.find(
          filter,
        )
          .select(
            '_id orderNumber patientId encounterId departmentId orderingProviderStaffId priority status itemCount activeItemCount scheduledItemCount completedItemCount reportedItemCount verifiedItemCount criticalFindingCount orderedAt dueAt acceptedAt scheduledAt examinationStartedAt examinationCompletedAt verifiedAt cancelledAt version createdAt updatedAt',
          )
          .sort({
            priority:
              -1,

            orderedAt:
              1,

            _id:
              1,
          })
          .skip(
            skip,
          )
          .limit(
            limit,
          )
          .lean()
          .exec(),

        RadiologyOrderModel.countDocuments(
          filter,
        ).exec(),
      ]);

    return pageResult(
      items,
      total,
      query.page,
      query.pageSize,
    );
  }

  public async getOrder(
    actor:
      RadiologyActorContext,

    orderId:
      string,
  ) {
    const order =
      await this.support.requireOrder(
        actor,
        orderId,
      );

    const items =
      await this.support.orders.listItems(
        actor.facilityId,
        orderId,
      );

    await this.support.assertAccess(
      actor,
      'ORDER_READ',
      {
        order,
        orderItems:
          items,
      },
    );

    const facilityId =
      toObjectId(
        actor.facilityId,
        'facilityId',
      );

    const orderObjectId =
      toObjectId(
        orderId,
        'orderId',
      );

    const [
      safeOrder,
      safeItems,
      orderHistory,
      itemHistory,
    ] =
      await Promise.all([
        RadiologyOrderModel.findOne(
          {
            _id:
              orderObjectId,

            facilityId,
          },
        )
          .select(
            '_id orderNumber patientId encounterId registrationId opdVisitId queueTokenId departmentId clinicId servicePointId orderingProviderStaffId priority status itemCount activeItemCount scheduledItemCount checkedInItemCount completedItemCount reportedItemCount verifiedItemCount rejectedItemCount cancelledItemCount criticalFindingCount orderedAt dueAt acceptedAt scheduledAt checkedInAt examinationStartedAt examinationCompletedAt verifiedAt cancelledAt version createdAt updatedAt',
          )
          .lean()
          .exec(),

        RadiologyOrderItemModel.find(
          {
            facilityId,

            radiologyOrderId:
              orderObjectId,
          },
        )
          .select(
            '_id radiologyOrderId radiologyProcedureId procedureDefinitionSnapshot procedureDefinitionHash patientId encounterId priority laterality contrastRequested contrastRoute status accessionNumber appointmentId scheduledAt checkedInAt examinationStartedAt examinationCompletedAt imagingStudyId externalStudyIdentifier reportId verifiedAt preparationStatus safetyScreeningStatus billingStatus accountChargeId dueAt version createdAt updatedAt',
          )
          .sort({
            sequence:
              1,

            _id:
              1,
          })
          .lean()
          .exec(),

        RadiologyOrderStatusHistoryModel.find(
          {
            facilityId,

            radiologyOrderId:
              orderObjectId,
          },
        )
          .select(
            '_id sequence fromStatus toStatus changeSource reasonCode occurredAt changedBy transactionId correlationId createdAt',
          )
          .sort({
            sequence:
              1,
          })
          .lean()
          .exec(),

        RadiologyOrderItemStatusHistoryModel.find(
          {
            facilityId,

            radiologyOrderId:
              orderObjectId,
          },
        )
          .select(
            '_id radiologyOrderItemId sequence fromStatus toStatus changeSource reasonCode occurredAt changedBy transactionId correlationId createdAt',
          )
          .sort({
            radiologyOrderItemId:
              1,

            sequence:
              1,
          })
          .lean()
          .exec(),
      ]);

    if (
      safeOrder ===
      null
    ) {
      throw new ResourceNotFoundError(
        'Radiology order was not found',
      );
    }

    return {
      order:
        safeOrder,

      items:
        safeItems,

      orderHistory,

      itemHistory,
    };
  }

  public async listAppointments(
    actor:
      RadiologyActorContext,

    query:
      AppointmentQuery,
  ) {
    await this.support.assertAccess(
      actor,
      'SCHEDULE_READ',
    );

    const filter:
      Record<
        string,
        unknown
      > = {
      facilityId:
        toObjectId(
          actor.facilityId,
          'facilityId',
        ),
    };

    if (
      query.appointmentStatus !==
      undefined
    ) {
      filter[
        'status'
      ] =
        query.appointmentStatus;
    }

    if (
      query.departmentId !==
      undefined
    ) {
      filter[
        'departmentId'
      ] =
        toObjectId(
          query.departmentId,
          'departmentId',
        );
    }

    if (
      query.modalityId !==
      undefined
    ) {
      filter[
        'modalityId'
      ] =
        toObjectId(
          query.modalityId,
          'modalityId',
        );
    }

    if (
      query.resourceId !==
      undefined
    ) {
      const resourceId =
        toObjectId(
          query.resourceId,
          'resourceId',
        );

      filter[
        '$or'
      ] = [
        {
          roomResourceId:
            resourceId,
        },
        {
          equipmentResourceIds:
            resourceId,
        },
      ];
    }

    if (
      query.technicianStaffId !==
      undefined
    ) {
      filter[
        'technicianStaffIds'
      ] =
        toObjectId(
          query.technicianStaffId,
          'technicianStaffId',
        );
    }

    if (
      query.scheduledFrom !==
        undefined ||
      query.scheduledTo !==
        undefined
    ) {
      filter[
        'scheduledStartAt'
      ] = {
        ...(
          query.scheduledFrom ===
          undefined
            ? {}
            : {
                $gte:
                  new Date(
                    query.scheduledFrom,
                  ),
              }
        ),

        ...(
          query.scheduledTo ===
          undefined
            ? {}
            : {
                $lte:
                  new Date(
                    query.scheduledTo,
                  ),
              }
        ),
      };
    }

    const {
      skip,
      limit,
    } =
      pageWindow(
        query.page,
        query.pageSize,
      );

    const [
      items,
      total,
    ] =
      await Promise.all([
        RadiologyAppointmentModel.find(
          filter,
        )
          .select(
            '_id radiologyOrderId radiologyOrderItemId patientId encounterId procedureId modalityId departmentId scheduledStartAt scheduledEndAt timezone roomResourceId equipmentResourceIds technicianStaffIds preparationStatus safetyScreeningStatus status scheduledAt checkedInAt cancelledAt version createdAt updatedAt',
          )
          .sort({
            scheduledStartAt:
              1,

            _id:
              1,
          })
          .skip(
            skip,
          )
          .limit(
            limit,
          )
          .lean()
          .exec(),

        RadiologyAppointmentModel.countDocuments(
          filter,
        ).exec(),
      ]);

    return pageResult(
      items,
      total,
      query.page,
      query.pageSize,
    );
  }

  public async getReport(
    actor:
      RadiologyActorContext,

    reportId:
      string,
  ) {
    const report =
      await this.reports.findById(
        actor.facilityId,
        reportId,
        false,
      );

    if (
      report ===
      null
    ) {
      throw new ResourceNotFoundError(
        'Radiology report was not found',
      );
    }

    const item =
      await this.support.requireOrderItem(
        actor,
        report.radiologyOrderItemId.toHexString(),
      );

    const order =
      await this.support.requireOrder(
        actor,
        report.radiologyOrderId.toHexString(),
      );

    await this.support.assertAccess(
      actor,
      'REPORT_READ',
      {
        order,
        orderItem:
          item,
      },
    );

    const [
      versions,
      communications,
    ] =
      await Promise.all([
        this.reports.listVersions(
          actor.facilityId,
          reportId,
        ),

        this.reports.listCriticalCommunications(
          actor.facilityId,
          reportId,
        ),
      ]);

    return {
      report:
        reportSummary(
          report as unknown as Record<
            string,
            unknown
          >,
        ),

      versions:
        versions.map(
          (
            version,
          ) => ({
            id:
              version._id.toHexString(),

            versionNumber:
              version.versionNumber,

            previousVersionId:
              version.previousVersionId?.toHexString() ??
              null,

            changeType:
              version.changeType,

            status:
              version.statusSnapshot,

            urgency:
              version.urgencySnapshot,

            criticalFindingCount:
              version.criticalFindingCountSnapshot,

            attachmentCount:
              version.attachmentIdsSnapshot.length,

            contentHash:
              version.contentHash,

            recordedAt:
              version.recordedAt.toISOString(),

            authorStaffId:
              version.authorStaffId.toHexString(),

            finalRadiologistStaffId:
              version.finalRadiologistStaffId.toHexString(),
          }),
        ),

      criticalCommunications:
        communications.map(
          (
            communication,
          ) => ({
            id:
              communication._id.toHexString(),

            sequence:
              communication.sequence,

            reportVersionId:
              communication.radiologyReportVersionId.toHexString(),

            findingCode:
              communication.findingCodeSnapshot,

            urgency:
              communication.urgencySnapshot,

            communicationType:
              communication.communicationType,

            channel:
              communication.channel,

            recipientType:
              communication.recipientType,

            acknowledgedCommunicationId:
              communication.acknowledgesCommunicationId?.toHexString() ??
              null,

            occurredAt:
              communication.occurredAt.toISOString(),

            performedByStaffId:
              communication.performedByStaffId.toHexString(),
          }),
        ),
    };
  }
}