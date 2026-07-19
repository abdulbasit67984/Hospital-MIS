import {
  Types,
} from 'mongoose';

import {
  toObjectId,
} from '@hospital-mis/database';

import {
  ConcurrencyConflictError,
  ConflictError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import type {
  RadiologyActorContext,
} from '../radiology.types.js';

import type {
  RadiologyOrderItemRecord,
  RadiologyOrderRecord,
} from '../radiology.persistence.types.js';

import type {
  RadiologyOperationsRepositoryPort,
} from '../radiology-operations.ports.js';

import type {
  AcknowledgeRadiologyCriticalCommunicationInput,
  AddRadiologyReportAddendumInput,
  AssignRadiologyReportCommand,
  ChangeRadiologyReportPublicationInput,
  CorrectRadiologyReportInput,
  FinalizeRadiologyReportInput,
  RadiologyFinalReportSnapshot,
  RadiologyReportArtifactPort,
  RadiologyReportAttachmentPort,
  RadiologyReportCommand,
  RadiologyReportRecord,
  RadiologyReportRendererPort,
  RadiologyReportRepositoryPort,
  RadiologyReportSummaryView,
  RadiologyReportingStaffPort,
  RecordRadiologyCriticalCommunicationInput,
  SaveRadiologyReportDraftInput,
  SubmitRadiologyPreliminaryInput,
} from '../radiology-reporting.contracts.js';

import {
  acknowledgeRadiologyCriticalCommunicationBodySchema,
  addRadiologyReportAddendumBodySchema,
  assignRadiologyReportBodySchema,
  changeRadiologyReportPublicationBodySchema,
  correctRadiologyReportBodySchema,
  finalizeRadiologyReportBodySchema,
  recordRadiologyCriticalCommunicationBodySchema,
  renderRadiologyReportBodySchema,
  saveRadiologyReportDraftBodySchema,
  submitRadiologyPreliminaryBodySchema,
  type RadiologyCriticalNotificationPort,
} from '../radiology-reporting.contracts.js';

import {
  formatRadiologyNumber,
  normalizeRadiologyCode,
  radiologyContentHash,
  uniqueRadiologyObjectIdStrings,
  uniqueRadiologyStrings,
} from '../radiology.normalization.js';

import {
  deleteCreatedRadiologyRecordCompensation,
  protectRadiologyRestorePayload,
  radiologyOrderItemRestoreSnapshot,
  radiologyOrderRestoreSnapshot,
  restoreRadiologyRecordCompensation,
} from '../radiology.mutation-snapshots.js';

import {
  RADIOLOGY_AUDIT_ACTIONS,
  RADIOLOGY_OUTBOX_EVENTS,
  RADIOLOGY_REALTIME_EVENTS,
  RADIOLOGY_TRANSACTION_STATES,
} from '../radiology.transaction.constants.js';

import {
  radiologyLockKey,
} from '../radiology.workflow-helpers.js';

import {
  RadiologyCommandService,
} from './radiology-command.service.js';

class RadiologyReportNotFoundError
  extends ResourceNotFoundError {
  public constructor() {
    super(
      'Radiology report was not found',
    );
  }
}

class RadiologyReportVersionNotFoundError
  extends ResourceNotFoundError {
  public constructor() {
    super(
      'Radiology report version was not found',
    );
  }
}

class RadiologyCriticalCommunicationNotFoundError
  extends ResourceNotFoundError {
  public constructor() {
    super(
      'Radiology critical-finding communication was not found',
    );
  }
}

class RadiologyReportingConcurrencyError
  extends ConcurrencyConflictError {
  public constructor() {
    super(
      'The Radiology report changed before the operation could be completed',
    );
  }
}

function reportLockKey(
  facilityId:
    string,

  reportId:
    string,
): string {
  return radiologyLockKey(
    'radiology-report',
    facilityId,
    reportId,
  );
}

function orderItemReportLockKey(
  facilityId:
    string,

  orderItemId:
    string,
): string {
  return radiologyLockKey(
    'radiology-report-order-item',
    facilityId,
    orderItemId,
  );
}

function reportVersionAssociatedData(
  facilityId:
    string,

  reportId:
    string,

  versionNumber:
    number,
): string {
  return [
    'radiology',
    'report-version',
    facilityId,
    reportId,
    String(
      versionNumber,
    ),
  ].join(':');
}

function restoreSnapshot(
  record:
    Record<
      string,
      unknown
    >,
): Record<
  string,
  unknown
> {
  const snapshot = {
    ...record,
  };

  delete snapshot[
    '_id'
  ];

  delete snapshot[
    'createdAt'
  ];

  return snapshot;
}

function safeReportSnapshot(
  report:
    RadiologyReportRecord,
): Record<
  string,
  unknown
> {
  return {
    reportId:
      report._id.toHexString(),

    reportNumber:
      report.reportNumber,

    orderId:
      report.radiologyOrderId.toHexString(),

    orderItemId:
      report.radiologyOrderItemId.toHexString(),

    imagingStudyId:
      report.imagingStudyId.toHexString(),

    procedureCode:
      report.procedureCodeSnapshot,

    modalityCode:
      report.modalityCodeSnapshot,

    status:
      report.status,

    urgency:
      report.urgency,

    publicationStatus:
      report.publicationStatus,

    currentVersion:
      report.currentVersion,

    criticalFindingCount:
      report.criticalFindingCount,

    unresolvedCriticalFindingCount:
      report.unresolvedCriticalFindingCount,

    attachmentCount:
      report.attachmentIds.length,

    assignedRadiologistStaffId:
      report.assignedRadiologistStaffId.toHexString(),

    finalizedAt:
      report.finalizedAt?.toISOString() ??
      null,

    version:
      report.version,
  };
}

function safeCommunicationSnapshot(
  input: {
    communicationId:
      string;

    reportId:
      string;

    reportVersionId:
      string;

    findingCode:
      string;

    urgency:
      string;

    communicationType:
      string;

    channel:
      string;

    recipientType:
      string;

    acknowledgedCommunicationId:
      | string
      | null;

    occurredAt:
      Date;
  },
): Record<
  string,
  unknown
> {
  return {
    communicationId:
      input.communicationId,

    reportId:
      input.reportId,

    reportVersionId:
      input.reportVersionId,

    findingCode:
      input.findingCode,

    urgency:
      input.urgency,

    communicationType:
      input.communicationType,

    channel:
      input.channel,

    recipientType:
      input.recipientType,

    acknowledgedCommunicationId:
      input.acknowledgedCommunicationId,

    occurredAt:
      input.occurredAt.toISOString(),
  };
}

export class RadiologyReportingService {
  public constructor(
    private readonly support:
      RadiologyCommandService,

    private readonly operations:
      RadiologyOperationsRepositoryPort,

    private readonly reports:
      RadiologyReportRepositoryPort,

    private readonly reportingStaff:
      RadiologyReportingStaffPort,

    private readonly attachments:
      RadiologyReportAttachmentPort,

    private readonly criticalNotifications:
      RadiologyCriticalNotificationPort,

    private readonly renderer:
      RadiologyReportRendererPort,

    private readonly artifacts:
      RadiologyReportArtifactPort,
  ) {}

  public async assignReport(
    command:
      AssignRadiologyReportCommand,
  ) {
    const input =
      assignRadiologyReportBodySchema.parse(
        command.input,
      );

    const item =
      await this.support.requireOrderItem(
        command.actor,
        input.orderItemId,
      );

    const order =
      await this.support.requireOrder(
        command.actor,
        item.radiologyOrderId.toHexString(),
      );

    await this.support.assertAccess(
      command.actor,
      'REPORT_REVIEW',
      {
        order,
        orderItem:
          item,
      },
    );

    this.support.assertExpectedVersion(
      item,
      input.expectedOrderItemVersion,
      'ORDER_ITEM',
    );

    if (
      item.status !==
        'COMPLETED' ||
      item.imagingStudyId ===
        null ||
      item.accessionNumber ===
        null
    ) {
      throw new ConflictError(
        'Radiology report assignment requires a completed order item with a registered imaging study',
      );
    }

    const existing =
      await this.reports.findByOrderItem(
        command.actor.facilityId,
        input.orderItemId,
        true,
      );

    if (
      existing !==
      null
    ) {
      throw new ConflictError(
        'A Radiology report is already assigned for this order item',
      );
    }

    const study =
      await this.operations.findImagingStudyByOrderItem(
        command.actor.facilityId,
        input.orderItemId,
      );

    if (
      study ===
      null
    ) {
      throw new ConflictError(
        'The registered Radiology imaging study could not be resolved',
      );
    }

    await this.reportingStaff.assertEligibleRadiologist(
      {
        facilityId:
          command.actor.facilityId,

        staffId:
          input.radiologistStaffId,
      },
    );

    return this.support.dependencies.transactionManager.execute(
      {
        transactionType:
          'RADIOLOGY_REPORT_ASSIGN',

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          orderItemReportLockKey(
            command.actor.facilityId,
            input.orderItemId,
          ),
        ],

        idempotencyPayload: {
          orderItemId:
            input.orderItemId,

          expectedOrderItemVersion:
            input.expectedOrderItemVersion,

          radiologistStaffId:
            input.radiologistStaffId,
        },

        journalPayload: {
          operation:
            'ASSIGN_REPORT',

          orderId:
            order._id.toHexString(),

          orderItemId:
            input.orderItemId,

          imagingStudyId:
            study._id.toHexString(),
        },

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              this.support.dependencies.clock.now();

            const assigningStaffId =
              await this.support.accessPolicy.requireActiveActorStaffId(
                command.actor,
              );

            const actorObjectId =
              toObjectId(
                command.actor.userId,
                'actorUserId',
              );

            const year =
              occurredAt.getUTCFullYear();

            const allocation =
              await this.support.dependencies.sequence.next(
                command.actor.facilityId,
                [
                  'radiology',
                  'report',
                  String(
                    year,
                  ),
                ].join(':'),
              );

            const reportId =
              new Types.ObjectId();

            const report =
              await this.reports.create(
                {
                  _id:
                    reportId,

                  facilityId:
                    item.facilityId,

                  reportNumber:
                    formatRadiologyNumber(
                      'RPT',
                      year,
                      allocation.value,
                    ),

                  radiologyOrderId:
                    order._id,

                  radiologyOrderItemId:
                    item._id,

                  imagingStudyId:
                    study._id,

                  examinationId:
                    study.examinationId,

                  patientId:
                    item.patientId,

                  encounterId:
                    item.encounterId,

                  procedureId:
                    item.radiologyProcedureId,

                  procedureCodeSnapshot:
                    item.procedureDefinitionSnapshot.procedureCode,

                  procedureNameSnapshot:
                    item.procedureDefinitionSnapshot.procedureName,

                  modalityCodeSnapshot:
                    item.procedureDefinitionSnapshot.modalityCode,

                  accessionNumberSnapshot:
                    item.accessionNumber,

                  studyInstanceUidSnapshot:
                    study.studyInstanceUid,

                  assignedRadiologistStaffId:
                    toObjectId(
                      input.radiologistStaffId,
                      'radiologistStaffId',
                    ),

                  assignedAt:
                    occurredAt,

                  assignedByStaffId:
                    toObjectId(
                      assigningStaffId,
                      'assigningStaffId',
                    ),

                  status:
                    'DRAFT',

                  urgency:
                    'ROUTINE',

                  clinicalHistory:
                    null,

                  comparisonStudyReferences:
                    [],

                  findings:
                    null,

                  impression:
                    null,

                  recommendations:
                    null,

                  criticalFindings:
                    [],

                  criticalFindingCount:
                    0,

                  unresolvedCriticalFindingCount:
                    0,

                  attachmentIds:
                    [],

                  authoredAt:
                    null,

                  authoredBy:
                    null,

                  authorStaffId:
                    null,

                  preliminaryAt:
                    null,

                  preliminaryBy:
                    null,

                  preliminaryRadiologistStaffId:
                    null,

                  finalizedAt:
                    null,

                  finalizedBy:
                    null,

                  finalRadiologistStaffId:
                    null,

                  currentVersion:
                    0,

                  latestVersionId:
                    null,

                  correctedAt:
                    null,

                  correctedBy:
                    null,

                  correctionReason:
                    null,

                  supersedesReportVersionId:
                    null,

                  addendumCount:
                    0,

                  latestAddendumAt:
                    null,

                  publicationStatus:
                    'NOT_PUBLISHED',

                  publishedAt:
                    null,

                  publishedBy:
                    null,

                  withdrawnAt:
                    null,

                  withdrawnBy:
                    null,

                  withdrawalReason:
                    null,

                  latestRenderedArtifactId:
                    null,

                  transactionId:
                    transaction.transactionId,

                  correlationId:
                    command.actor.correlationId,

                  schemaVersion:
                    1,

                  version:
                    0,

                  createdBy:
                    actorObjectId,

                  updatedBy:
                    actorObjectId,
                },
              );

            await transaction.registerCompensation(
              deleteCreatedRadiologyRecordCompensation(
                `delete-radiology-report:${reportId.toHexString()}`,
                {
                  facilityId:
                    command.actor.facilityId,

                  collection:
                    'radiologyReports',

                  entityId:
                    reportId.toHexString(),

                  transactionId:
                    transaction.transactionId,
                },
              ),
            );

            const itemRestore =
              protectRadiologyRestorePayload(
                {
                  facilityId:
                    command.actor.facilityId,

                  collection:
                    'radiologyOrderItems',

                  entityId:
                    item._id.toHexString(),

                  expectedPostVersion:
                    item.version +
                    1,

                  transactionId:
                    transaction.transactionId,

                  snapshot:
                    radiologyOrderItemRestoreSnapshot(
                      item,
                    ),

                  snapshotCrypto:
                    this.support.dependencies.snapshotCrypto,
                },
              );

            const updatedItem =
              await this.support.orders.transitionItem(
                command.actor.facilityId,
                item._id.toHexString(),
                item.version,
                [
                  'COMPLETED',
                ],
                {
                  reportId,

                  updatedBy:
                    actorObjectId,
                },
              );

            if (
              updatedItem ===
              null
            ) {
              throw new RadiologyReportingConcurrencyError();
            }

            await transaction.registerCompensation(
              restoreRadiologyRecordCompensation(
                `restore-radiology-report-item:${item._id.toHexString()}`,
                itemRestore,
              ),
            );

            await this.emitReportMutation(
              command.actor,
              transaction.transactionId,
              occurredAt,
              RADIOLOGY_AUDIT_ACTIONS.REPORT_ASSIGNED,
              RADIOLOGY_OUTBOX_EVENTS.REPORT_ASSIGNED,
              report,
            );

            return report;
          },
      },
    );
  }

  public async saveDraft(
    command:
      RadiologyReportCommand<SaveRadiologyReportDraftInput>,
  ) {
    const input =
      saveRadiologyReportDraftBodySchema.parse(
        command.input,
      );

    const context =
      await this.resolveReportContext(
        command.actor,
        command.reportId,
      );

    await this.support.assertAccess(
      command.actor,
      'REPORT_ENTER',
      {
        order:
          context.order,

        orderItem:
          context.item,
      },
    );

    await this.requireAssignedRadiologist(
      command.actor,
      context.report,
    );

    this.assertReportVersion(
      context.report,
      input.expectedReportVersion,
    );

    if (
      context.report.status !==
      'DRAFT'
    ) {
      throw new ConflictError(
        'Only a draft Radiology report can be edited as a draft',
      );
    }

    return this.saveMutableReport(
      command,
      input,
      'DRAFT',
      RADIOLOGY_AUDIT_ACTIONS.REPORT_DRAFT_SAVED,
      RADIOLOGY_OUTBOX_EVENTS.REPORT_DRAFT_SAVED,
    );
  }

  public async submitPreliminary(
    command:
      RadiologyReportCommand<SubmitRadiologyPreliminaryInput>,
  ) {
    const input =
      submitRadiologyPreliminaryBodySchema.parse(
        command.input,
      );

    const context =
      await this.resolveReportContext(
        command.actor,
        command.reportId,
      );

    await this.support.assertAccess(
      command.actor,
      'REPORT_REVIEW',
      {
        order:
          context.order,

        orderItem:
          context.item,
      },
    );

    await this.requireAssignedRadiologist(
      command.actor,
      context.report,
    );

    this.assertReportVersion(
      context.report,
      input.expectedReportVersion,
    );

    if (
      ![
        'DRAFT',
        'PRELIMINARY',
      ].includes(
        context.report.status,
      )
    ) {
      throw new ConflictError(
        'Only draft or preliminary Radiology reports can be submitted as preliminary',
      );
    }

    return this.support.dependencies.transactionManager.execute(
      {
        transactionType:
          'RADIOLOGY_REPORT_PRELIMINARY',

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          reportLockKey(
            command.actor.facilityId,
            command.reportId,
          ),
        ],

        idempotencyPayload: {
          reportId:
            command.reportId,

          expectedReportVersion:
            input.expectedReportVersion,

          contentHash:
            radiologyContentHash(
              input,
            ),
        },

        journalPayload: {
          operation:
            'SUBMIT_PRELIMINARY_REPORT',

          reportId:
            command.reportId,

          orderItemId:
            context.item._id.toHexString(),

          criticalFindingCount:
            input.criticalFindings.length,
        },

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              this.support.dependencies.clock.now();

            const staffId =
              await this.support.accessPolicy.requireActiveActorStaffId(
                command.actor,
              );

            const actorObjectId =
              toObjectId(
                command.actor.userId,
                'actorUserId',
              );

            await this.validateAttachments(
              command.actor,
              input.attachmentIds,
            );

            await transaction.checkpoint(
              RADIOLOGY_TRANSACTION_STATES.ATTACHMENTS_VALIDATED,
              {
                attachmentCount:
                  input.attachmentIds.length,
              },
            );

            const updated =
              await this.updateReportWithCompensation(
                command.actor,
                transaction.transactionId,
                context.report,
                {
                  ...this.reportContentUpdate(
                    input,
                  ),

                  status:
                    'PRELIMINARY',

                  authoredAt:
                    occurredAt,

                  authoredBy:
                    actorObjectId,

                  authorStaffId:
                    toObjectId(
                      staffId,
                      'staffId',
                    ),

                  preliminaryAt:
                    occurredAt,

                  preliminaryBy:
                    actorObjectId,

                  preliminaryRadiologistStaffId:
                    toObjectId(
                      staffId,
                      'staffId',
                    ),

                  updatedBy:
                    actorObjectId,
                },

                transaction.registerCompensation.bind(
                  transaction,
                ),
              );

            await this.transitionItemAndOrderForReport(
              command.actor,
              transaction.transactionId,
              context.item,
              context.order,
              'PRELIMINARY_REPORTED',
              'REPORTED',
              occurredAt,
              transaction.registerCompensation.bind(
                transaction,
              ),
            );

            await this.emitReportMutation(
              command.actor,
              transaction.transactionId,
              occurredAt,
              RADIOLOGY_AUDIT_ACTIONS.REPORT_PRELIMINARY_SUBMITTED,
              RADIOLOGY_OUTBOX_EVENTS.REPORT_PRELIMINARY_SUBMITTED,
              updated,
            );

            return updated;
          },
      },
    );
  }

  public async finalize(
    command:
      RadiologyReportCommand<FinalizeRadiologyReportInput>,
  ) {
    const input =
      finalizeRadiologyReportBodySchema.parse(
        command.input,
      );

    const context =
      await this.resolveReportContext(
        command.actor,
        command.reportId,
      );

    await this.support.assertAccess(
      command.actor,
      'REPORT_VERIFY',
      {
        order:
          context.order,

        orderItem:
          context.item,
      },
    );

    await this.requireAssignedRadiologist(
      command.actor,
      context.report,
    );

    this.assertReportVersion(
      context.report,
      input.expectedReportVersion,
    );

    if (
      ![
        'DRAFT',
        'PRELIMINARY',
      ].includes(
        context.report.status,
      ) ||
      context.report.currentVersion !==
        0
    ) {
      throw new ConflictError(
        'Radiology finalization requires an unsigned draft or preliminary report',
      );
    }

    return this.appendFinalVersion(
      command,
      context,
      input,
      'FINAL',
      'INITIAL_FINALIZATION',
      null,
      null,
    );
  }

  public async correct(
    command:
      RadiologyReportCommand<CorrectRadiologyReportInput>,
  ) {
    const input =
      correctRadiologyReportBodySchema.parse(
        command.input,
      );

    const context =
      await this.resolveReportContext(
        command.actor,
        command.reportId,
      );

    await this.support.assertAccess(
      command.actor,
      'REPORT_AMEND',
      {
        order:
          context.order,

        orderItem:
          context.item,
      },
    );

    this.assertReportVersion(
      context.report,
      input.expectedReportVersion,
    );

    if (
      ![
        'FINAL',
        'CORRECTED',
        'ADDENDUM',
      ].includes(
        context.report.status,
      )
    ) {
      throw new ConflictError(
        'Only a finalized Radiology report can be corrected',
      );
    }

    return this.appendFinalVersion(
      command,
      context,
      input,
      'CORRECTED',
      'CORRECTION',
      input.reason,
      null,
    );
  }

  public async addAddendum(
    command:
      RadiologyReportCommand<AddRadiologyReportAddendumInput>,
  ) {
    const input =
      addRadiologyReportAddendumBodySchema.parse(
        command.input,
      );

    const context =
      await this.resolveReportContext(
        command.actor,
        command.reportId,
      );

    await this.support.assertAccess(
      command.actor,
      'REPORT_AMEND',
      {
        order:
          context.order,

        orderItem:
          context.item,
      },
    );

    this.assertReportVersion(
      context.report,
      input.expectedReportVersion,
    );

    if (
      ![
        'FINAL',
        'CORRECTED',
        'ADDENDUM',
      ].includes(
        context.report.status,
      )
    ) {
      throw new ConflictError(
        'Only a finalized Radiology report can receive an addendum',
      );
    }

    const previousSnapshot =
      await this.readLatestSnapshot(
        context.report,
      );

    const content:
      FinalContent = {
        urgency:
          previousSnapshot.urgency,

        clinicalHistory:
          previousSnapshot.clinicalHistory,

        comparisonStudyReferences:
          previousSnapshot.comparisonStudyReferences,

        findings:
          previousSnapshot.findings,

        impression:
          previousSnapshot.impression,

        recommendations:
          previousSnapshot.recommendations,

        criticalFindings:
          previousSnapshot.criticalFindings,

        attachmentIds:
          uniqueRadiologyObjectIdStrings(
            [
              ...previousSnapshot.attachmentIds,
              ...input.attachmentIds,
            ],
          ),
      };

    return this.appendFinalVersion(
      command,
      context,
      content,
      'ADDENDUM',
      'ADDENDUM',
      input.reason,
      input.addendumText,
    );
  }

  public async changePublication(
    command:
      RadiologyReportCommand<ChangeRadiologyReportPublicationInput>,
  ) {
    const input =
      changeRadiologyReportPublicationBodySchema.parse(
        command.input,
      );

    const context =
      await this.resolveReportContext(
        command.actor,
        command.reportId,
      );

    await this.support.assertAccess(
      command.actor,
      input.publicationStatus ===
        'WITHDRAWN'
        ? 'REPORT_WITHDRAW'
        : 'REPORT_PUBLISH',
      {
        order:
          context.order,

        orderItem:
          context.item,
      },
    );

    this.assertReportVersion(
      context.report,
      input.expectedReportVersion,
    );

    if (
      ![
        'PUBLISHED',
        'WITHDRAWN',
      ].includes(
        input.publicationStatus,
      )
    ) {
      throw new ConflictError(
        'Radiology publication commands support only PUBLISHED or WITHDRAWN',
      );
    }

    if (
      input.publicationStatus ===
        'PUBLISHED' &&
      ![
        'FINAL',
        'CORRECTED',
        'ADDENDUM',
      ].includes(
        context.report.status,
      )
    ) {
      throw new ConflictError(
        'Only finalized Radiology reports can be published',
      );
    }

    if (
      input.publicationStatus ===
        'PUBLISHED' &&
      context.report.unresolvedCriticalFindingCount >
        0
    ) {
      throw new ConflictError(
        'Critical or urgent Radiology findings must be acknowledged before report publication',
      );
    }

    if (
      input.publicationStatus ===
        'WITHDRAWN' &&
      context.report.publicationStatus !==
        'PUBLISHED'
    ) {
      throw new ConflictError(
        'Only a published Radiology report can be withdrawn',
      );
    }

    return this.support.dependencies.transactionManager.execute(
      {
        transactionType:
          input.publicationStatus ===
          'PUBLISHED'
            ? 'RADIOLOGY_REPORT_PUBLISH'
            : 'RADIOLOGY_REPORT_WITHDRAW',

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          reportLockKey(
            command.actor.facilityId,
            command.reportId,
          ),
        ],

        idempotencyPayload: {
          reportId:
            command.reportId,

          expectedReportVersion:
            input.expectedReportVersion,

          publicationStatus:
            input.publicationStatus,

          reasonHash:
            input.reason ===
            undefined
              ? null
              : radiologyContentHash(
                  input.reason,
                ),
        },

        journalPayload: {
          operation:
            input.publicationStatus ===
            'PUBLISHED'
              ? 'PUBLISH_REPORT'
              : 'WITHDRAW_REPORT',

          reportId:
            command.reportId,

          publicationStatus:
            input.publicationStatus,
        },

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              this.support.dependencies.clock.now();

            const actorObjectId =
              toObjectId(
                command.actor.userId,
                'actorUserId',
              );

            const updated =
              await this.updateReportWithCompensation(
                command.actor,
                transaction.transactionId,
                context.report,
                input.publicationStatus ===
                'PUBLISHED'
                  ? {
                      publicationStatus:
                        'PUBLISHED',

                      publishedAt:
                        occurredAt,

                      publishedBy:
                        actorObjectId,

                      withdrawnAt:
                        null,

                      withdrawnBy:
                        null,

                      withdrawalReason:
                        null,

                      updatedBy:
                        actorObjectId,
                    }
                  : {
                      publicationStatus:
                        'WITHDRAWN',

                      withdrawnAt:
                        occurredAt,

                      withdrawnBy:
                        actorObjectId,

                      withdrawalReason:
                        input.reason?.trim() ??
                        null,

                      updatedBy:
                        actorObjectId,
                    },

                transaction.registerCompensation.bind(
                  transaction,
                ),
              );

            await this.transitionItemAndOrderForReport(
              command.actor,
              transaction.transactionId,
              context.item,
              context.order,
              input.publicationStatus ===
              'PUBLISHED'
                ? 'VERIFIED'
                : 'FINAL_REPORTED',
              input.publicationStatus ===
              'PUBLISHED'
                ? 'VERIFIED'
                : 'REPORTED',
              occurredAt,
              transaction.registerCompensation.bind(
                transaction,
              ),
            );

            await transaction.checkpoint(
              RADIOLOGY_TRANSACTION_STATES.REPORT_PUBLICATION_CHANGED,
              {
                reportId:
                  command.reportId,

                publicationStatus:
                  input.publicationStatus,
              },
            );

            await this.emitReportMutation(
              command.actor,
              transaction.transactionId,
              occurredAt,
              input.publicationStatus ===
              'PUBLISHED'
                ? RADIOLOGY_AUDIT_ACTIONS.REPORT_PUBLISHED
                : RADIOLOGY_AUDIT_ACTIONS.REPORT_WITHDRAWN,
              input.publicationStatus ===
              'PUBLISHED'
                ? RADIOLOGY_OUTBOX_EVENTS.REPORT_PUBLISHED
                : RADIOLOGY_OUTBOX_EVENTS.REPORT_WITHDRAWN,
              updated,
              input.reason,
              RADIOLOGY_REALTIME_EVENTS.REPORT_PUBLICATION_CHANGED,
            );

            return updated;
          },
      },
    );
  }

  public async recordCriticalCommunication(
    command:
      RadiologyReportCommand<RecordRadiologyCriticalCommunicationInput>,
  ) {
    const input =
      recordRadiologyCriticalCommunicationBodySchema.parse(
        command.input,
      );

    const context =
      await this.resolveReportContext(
        command.actor,
        command.reportId,
      );

    await this.support.assertAccess(
      command.actor,
      'CRITICAL_NOTIFY',
      {
        order:
          context.order,

        orderItem:
          context.item,
      },
    );

    this.assertReportVersion(
      context.report,
      input.expectedReportVersion,
    );

    const snapshot =
      await this.readLatestSnapshot(
        context.report,
      );

    const findingCode =
      normalizeRadiologyCode(
        input.findingCode,
      );

    const finding =
      snapshot.criticalFindings.find(
        (
          candidate,
        ) =>
          candidate.findingCode ===
          findingCode,
      );

    if (
      finding ===
      undefined
    ) {
      throw new ConflictError(
        'The requested critical-finding code is not present in the latest immutable report version',
      );
    }

    return this.support.dependencies.transactionManager.execute(
      {
        transactionType:
          'RADIOLOGY_CRITICAL_FINDING_COMMUNICATE',

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          reportLockKey(
            command.actor.facilityId,
            command.reportId,
          ),

          radiologyLockKey(
            'radiology-critical-finding',
            command.actor.facilityId,
            command.reportId,
            findingCode,
          ),
        ],

        idempotencyPayload: {
          reportId:
            command.reportId,

          reportVersionId:
            context.report.latestVersionId?.toHexString(),

          findingCode,

          communicationType:
            input.communicationType,

          channel:
            input.channel,

          recipientType:
            input.recipientType,
        },

        journalPayload: {
          operation:
            'COMMUNICATE_CRITICAL_FINDING',

          reportId:
            command.reportId,

          findingCode,

          urgency:
            finding.urgency,

          communicationType:
            input.communicationType,

          channel:
            input.channel,

          recipientType:
            input.recipientType,
        },

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              this.support.dependencies.clock.now();

            const staffId =
              await this.support.accessPolicy.requireActiveActorStaffId(
                command.actor,
              );

            const actorObjectId =
              toObjectId(
                command.actor.userId,
                'actorUserId',
              );

            const communications =
              await this.reports.listCriticalCommunications(
                command.actor.facilityId,
                command.reportId,
              );

            const communicationId =
              new Types.ObjectId();

            const reportVersionId =
              context.report.latestVersionId;

            if (
              reportVersionId ===
              null
            ) {
              throw new ConflictError(
                'Critical-finding communication requires an immutable report version',
              );
            }

            const communication =
              await this.reports.appendCriticalCommunication(
                {
                  _id:
                    communicationId,

                  facilityId:
                    context.report.facilityId,

                  radiologyReportId:
                    context.report._id,

                  radiologyReportVersionId:
                    reportVersionId,

                  radiologyOrderId:
                    context.report.radiologyOrderId,

                  patientId:
                    context.report.patientId,

                  encounterId:
                    context.report.encounterId,

                  sequence:
                    communications.length +
                    1,

                  findingCodeSnapshot:
                    findingCode,

                  urgencySnapshot:
                    finding.urgency,

                  communicationType:
                    input.communicationType,

                  channel:
                    input.channel,

                  recipientType:
                    input.recipientType,

                  recipientUserId:
                    input.recipientUserId ==
                    null
                      ? null
                      : toObjectId(
                          input.recipientUserId,
                          'recipientUserId',
                        ),

                  recipientStaffId:
                    input.recipientStaffId ==
                    null
                      ? null
                      : toObjectId(
                          input.recipientStaffId,
                          'recipientStaffId',
                        ),

                  recipientDisplaySnapshot:
                    input.recipientDisplay.trim(),

                  communicationNotes:
                    input.notes?.trim() ??
                    null,

                  acknowledgesCommunicationId:
                    null,

                  occurredAt,

                  performedByStaffId:
                    toObjectId(
                      staffId,
                      'staffId',
                    ),

                  transactionId:
                    transaction.transactionId,

                  correlationId:
                    command.actor.correlationId,

                  schemaVersion:
                    1,

                  version:
                    0,

                  createdBy:
                    actorObjectId,

                  updatedBy:
                    actorObjectId,
                },
              );

            await transaction.registerCompensation(
              deleteCreatedRadiologyRecordCompensation(
                `delete-radiology-critical-communication:${communicationId.toHexString()}`,
                {
                  facilityId:
                    command.actor.facilityId,

                  collection:
                    'radiologyCriticalFindingCommunications',

                  entityId:
                    communicationId.toHexString(),

                  transactionId:
                    transaction.transactionId,
                },
              ),
            );

            if (
              input.communicationType !==
              'FAILED'
            ) {
              await this.criticalNotifications.notify(
                {
                  facilityId:
                    command.actor.facilityId,

                  reportId:
                    command.reportId,

                  reportVersionId:
                    reportVersionId.toHexString(),

                  patientId:
                    context.report.patientId.toHexString(),

                  encounterId:
                    context.report.encounterId.toHexString(),

                  findingCode,

                  urgency:
                    finding.urgency,

                  recipientType:
                    input.recipientType,

                  recipientUserId:
                    input.recipientUserId ??
                    null,

                  recipientStaffId:
                    input.recipientStaffId ??
                    null,

                  channel:
                    input.channel,

                  correlationId:
                    command.actor.correlationId,

                  transactionId:
                    transaction.transactionId,
                },
              );
            }

            await transaction.checkpoint(
              RADIOLOGY_TRANSACTION_STATES.CRITICAL_COMMUNICATION_APPENDED,
              {
                reportId:
                  command.reportId,

                communicationId:
                  communicationId.toHexString(),

                findingCode,
              },
            );

            await this.emitCommunication(
              command.actor,
              transaction.transactionId,
              communicationId.toHexString(),
              reportVersionId.toHexString(),
              command.reportId,
              findingCode,
              finding.urgency,
              input.communicationType,
              input.channel,
              input.recipientType,
              null,
              occurredAt,
              RADIOLOGY_AUDIT_ACTIONS.CRITICAL_FINDING_COMMUNICATED,
              RADIOLOGY_OUTBOX_EVENTS.CRITICAL_FINDING_COMMUNICATED,
            );

            return communication;
          },
      },
    );
  }

  public async acknowledgeCriticalCommunication(
    command:
      RadiologyReportCommand<AcknowledgeRadiologyCriticalCommunicationInput>,
  ) {
    const input =
      acknowledgeRadiologyCriticalCommunicationBodySchema.parse(
        command.input,
      );

    const context =
      await this.resolveReportContext(
        command.actor,
        command.reportId,
      );

    await this.support.assertAccess(
      command.actor,
      'CRITICAL_ACKNOWLEDGE',
      {
        order:
          context.order,

        orderItem:
          context.item,
      },
    );

    this.assertReportVersion(
      context.report,
      input.expectedReportVersion,
    );

    const source =
      await this.reports.findCriticalCommunicationById(
        command.actor.facilityId,
        input.communicationId,
      );

    if (
      source ===
        null ||
      source.radiologyReportId.toHexString() !==
        command.reportId
    ) {
      throw new RadiologyCriticalCommunicationNotFoundError();
    }

    if (
      ![
        'NOTIFIED',
        'ESCALATED',
        'NOTIFICATION_ATTEMPT',
      ].includes(
        source.communicationType,
      )
    ) {
      throw new ConflictError(
        'Only a notification or escalation communication can be acknowledged',
      );
    }

    const communications =
      await this.reports.listCriticalCommunications(
        command.actor.facilityId,
        command.reportId,
      );

    if (
      communications.some(
        (
          candidate,
        ) =>
          candidate.acknowledgesCommunicationId?.toHexString() ===
            input.communicationId ||
          (
            candidate.communicationType ===
              'ACKNOWLEDGED' &&
            candidate.findingCodeSnapshot ===
              source.findingCodeSnapshot
          ),
      )
    ) {
      throw new ConflictError(
        'The selected critical finding is already acknowledged',
      );
    }

    return this.support.dependencies.transactionManager.execute(
      {
        transactionType:
          'RADIOLOGY_CRITICAL_FINDING_ACKNOWLEDGE',

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          radiologyLockKey(
            'radiology-critical-finding-acknowledgement',
            command.actor.facilityId,
            input.communicationId,
          ),
        ],

        idempotencyPayload: {
          reportId:
            command.reportId,

          communicationId:
            input.communicationId,

          expectedReportVersion:
            input.expectedReportVersion,
        },

        journalPayload: {
          operation:
            'ACKNOWLEDGE_CRITICAL_FINDING',

          reportId:
            command.reportId,

          findingCode:
            source.findingCodeSnapshot,

          sourceCommunicationId:
            input.communicationId,
        },

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              this.support.dependencies.clock.now();

            const staffId =
              await this.support.accessPolicy.requireActiveActorStaffId(
                command.actor,
              );

            const actorObjectId =
              toObjectId(
                command.actor.userId,
                'actorUserId',
              );

            const acknowledgementId =
              new Types.ObjectId();

            const acknowledgement =
              await this.reports.appendCriticalCommunication(
                {
                  _id:
                    acknowledgementId,

                  facilityId:
                    context.report.facilityId,

                  radiologyReportId:
                    context.report._id,

                  radiologyReportVersionId:
                    source.radiologyReportVersionId,

                  radiologyOrderId:
                    context.report.radiologyOrderId,

                  patientId:
                    context.report.patientId,

                  encounterId:
                    context.report.encounterId,

                  sequence:
                    communications.length +
                    1,

                  findingCodeSnapshot:
                    source.findingCodeSnapshot,

                  urgencySnapshot:
                    source.urgencySnapshot,

                  communicationType:
                    'ACKNOWLEDGED',

                  channel:
                    source.channel,

                  recipientType:
                    source.recipientType,

                  recipientUserId:
                    source.recipientUserId,

                  recipientStaffId:
                    source.recipientStaffId,

                  recipientDisplaySnapshot:
                    source.recipientDisplaySnapshot,

                  communicationNotes:
                    input.notes?.trim() ??
                    null,

                  acknowledgesCommunicationId:
                    source._id,

                  occurredAt,

                  performedByStaffId:
                    toObjectId(
                      staffId,
                      'staffId',
                    ),

                  transactionId:
                    transaction.transactionId,

                  correlationId:
                    command.actor.correlationId,

                  schemaVersion:
                    1,

                  version:
                    0,

                  createdBy:
                    actorObjectId,

                  updatedBy:
                    actorObjectId,
                },
              );

            await transaction.registerCompensation(
              deleteCreatedRadiologyRecordCompensation(
                `delete-radiology-critical-acknowledgement:${acknowledgementId.toHexString()}`,
                {
                  facilityId:
                    command.actor.facilityId,

                  collection:
                    'radiologyCriticalFindingCommunications',

                  entityId:
                    acknowledgementId.toHexString(),

                  transactionId:
                    transaction.transactionId,
                },
              ),
            );

            const updatedReport =
              await this.updateReportWithCompensation(
                command.actor,
                transaction.transactionId,
                context.report,
                {
                  unresolvedCriticalFindingCount:
                    Math.max(
                      0,
                      context.report.unresolvedCriticalFindingCount -
                        1,
                    ),

                  updatedBy:
                    actorObjectId,
                },

                transaction.registerCompensation.bind(
                  transaction,
                ),
              );

            await transaction.checkpoint(
              RADIOLOGY_TRANSACTION_STATES.CRITICAL_FINDING_ACKNOWLEDGED,
              {
                reportId:
                  command.reportId,

                sourceCommunicationId:
                  input.communicationId,

                acknowledgementId:
                  acknowledgementId.toHexString(),
              },
            );

            await this.emitCommunication(
              command.actor,
              transaction.transactionId,
              acknowledgementId.toHexString(),
              source.radiologyReportVersionId.toHexString(),
              command.reportId,
              source.findingCodeSnapshot,
              source.urgencySnapshot,
              'ACKNOWLEDGED',
              source.channel,
              source.recipientType,
              input.communicationId,
              occurredAt,
              RADIOLOGY_AUDIT_ACTIONS.CRITICAL_FINDING_ACKNOWLEDGED,
              RADIOLOGY_OUTBOX_EVENTS.CRITICAL_FINDING_ACKNOWLEDGED,
            );

            return {
              communication:
                acknowledgement,

              report:
                updatedReport,
            };
          },
      },
    );
  }

  public async renderFinalReport(
    command:
      RadiologyReportCommand<{
        expectedReportVersion:
          number;
      }>,
  ) {
    const input =
      renderRadiologyReportBodySchema.parse(
        command.input,
      );

    const context =
      await this.resolveReportContext(
        command.actor,
        command.reportId,
      );

    await this.support.assertAccess(
      command.actor,
      'REPORT_PRINT',
      {
        order:
          context.order,

        orderItem:
          context.item,
      },
    );

    this.assertReportVersion(
      context.report,
      input.expectedReportVersion,
    );

    if (
      ![
        'FINAL',
        'CORRECTED',
        'ADDENDUM',
      ].includes(
        context.report.status,
      )
    ) {
      throw new ConflictError(
        'Only a finalized Radiology report can be rendered',
      );
    }

    return this.support.dependencies.transactionManager.execute(
      {
        transactionType:
          'RADIOLOGY_REPORT_RENDER',

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          reportLockKey(
            command.actor.facilityId,
            command.reportId,
          ),
        ],

        idempotencyPayload: {
          reportId:
            command.reportId,

          expectedReportVersion:
            input.expectedReportVersion,

          immutableVersionNumber:
            context.report.currentVersion,
        },

        journalPayload: {
          operation:
            'RENDER_FINAL_REPORT',

          reportId:
            command.reportId,

          immutableVersionNumber:
            context.report.currentVersion,
        },

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              this.support.dependencies.clock.now();

            const snapshot =
              await this.readLatestSnapshot(
                context.report,
              );

            const document =
              await this.renderer.renderFinalSnapshot(
                {
                  snapshot,

                  printedAt:
                    occurredAt,
                },
              );

            const stored =
              await this.artifacts.storeGeneratedReport(
                {
                  facilityId:
                    command.actor.facilityId,

                  reportId:
                    command.reportId,

                  reportVersionId:
                    context.report.latestVersionId?.toHexString() as string,

                  patientId:
                    context.report.patientId.toHexString(),

                  encounterId:
                    context.report.encounterId.toHexString(),

                  mediaType:
                    document.mediaType,

                  filename:
                    document.filename,

                  bytes:
                    document.bytes,

                  contentHash:
                    document.contentHash,

                  generatedBy:
                    command.actor.userId,

                  generatedAt:
                    occurredAt,

                  correlationId:
                    command.actor.correlationId,

                  transactionId:
                    transaction.transactionId,
                },
              );

            const updated =
              await this.updateReportWithCompensation(
                command.actor,
                transaction.transactionId,
                context.report,
                {
                  latestRenderedArtifactId:
                    toObjectId(
                      stored.artifactId,
                      'artifactId',
                    ),

                  updatedBy:
                    toObjectId(
                      command.actor.userId,
                      'actorUserId',
                    ),
                },

                transaction.registerCompensation.bind(
                  transaction,
                ),
              );

            await transaction.checkpoint(
              RADIOLOGY_TRANSACTION_STATES.REPORT_ARTIFACT_STORED,
              {
                reportId:
                  command.reportId,

                artifactId:
                  stored.artifactId,

                contentHash:
                  document.contentHash,
              },
            );

            await this.emitReportMutation(
              command.actor,
              transaction.transactionId,
              occurredAt,
              RADIOLOGY_AUDIT_ACTIONS.REPORT_RENDERED,
              RADIOLOGY_OUTBOX_EVENTS.REPORT_RENDERED,
              updated,
            );

            return {
              artifactId:
                stored.artifactId,

              document,
            };
          },
      },
    );
  }

  public async getPublishedSnapshot(
    actor:
      RadiologyActorContext,

    reportId:
      string,
  ): Promise<
    RadiologyFinalReportSnapshot
  > {
    const context =
      await this.resolveReportContext(
        actor,
        reportId,
      );

    await this.support.assertAccess(
      actor,
      'REPORT_READ',
      {
        order:
          context.order,

        orderItem:
          context.item,
      },
    );

    if (
      context.report.publicationStatus !==
      'PUBLISHED'
    ) {
      throw new ConflictError(
        'The requested Radiology report is not currently published',
      );
    }

    const snapshot =
      await this.readLatestSnapshot(
        context.report,
      );

    const occurredAt =
      this.support.dependencies.clock.now();

    await this.support.dependencies.audit.append(
      {
        transactionId:
          `read:${actor.correlationId}`,

        deduplicationKey:
          [
            actor.correlationId,
            RADIOLOGY_AUDIT_ACTIONS.REPORT_SENSITIVE_READ,
            reportId,
          ].join(':'),

        action:
          RADIOLOGY_AUDIT_ACTIONS.REPORT_SENSITIVE_READ,

        entityType:
          'RadiologyReport',

        entityId:
          reportId,

        ...this.support.auditActorFields(
          actor,
        ),

        occurredAt,

        metadata: {
          reportVersion:
            context.report.currentVersion,

          accessPurpose:
            'PUBLISHED_REPORT_READ',
        },
      },
    );

    return snapshot;
  }

  public async listEncounterHistory(
    actor:
      RadiologyActorContext,

    encounterId:
      string,

    page:
      number,

    pageSize:
      number,
  ) {
    await this.support.assertAccess(
      actor,
      'REPORT_READ',
    );

    const result =
      await this.reports.listPublishedByEncounter(
        actor.facilityId,
        encounterId,
        page,
        pageSize,
      );

    return {
      items:
        result.items.map(
          (report) =>
            this.summary(
              report,
            ),
        ),

      total:
        result.total,

      page,

      pageSize,
    };
  }

  public async listPatientHistory(
    actor:
      RadiologyActorContext,

    patientId:
      string,

    page:
      number,

    pageSize:
      number,
  ) {
    await this.support.assertAccess(
      actor,
      'REPORT_READ',
    );

    const result =
      await this.reports.listPublishedByPatient(
        actor.facilityId,
        patientId,
        page,
        pageSize,
      );

    return {
      items:
        result.items.map(
          (report) =>
            this.summary(
              report,
            ),
        ),

      total:
        result.total,

      page,

      pageSize,
    };
  }

  private async saveMutableReport(
    command:
      RadiologyReportCommand<SaveRadiologyReportDraftInput>,

    input:
      SaveRadiologyReportDraftInput,

    status:
      'DRAFT',

    auditAction:
      string,

    outboxEvent:
      string,
  ) {
    const context =
      await this.resolveReportContext(
        command.actor,
        command.reportId,
      );

    this.assertReportVersion(
      context.report,
      input.expectedReportVersion,
    );

    return this.support.dependencies.transactionManager.execute(
      {
        transactionType:
          'RADIOLOGY_REPORT_DRAFT_SAVE',

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          reportLockKey(
            command.actor.facilityId,
            command.reportId,
          ),
        ],

        idempotencyPayload: {
          reportId:
            command.reportId,

          expectedReportVersion:
            input.expectedReportVersion,

          contentHash:
            radiologyContentHash(
              input,
            ),
        },

        journalPayload: {
          operation:
            'SAVE_REPORT_DRAFT',

          reportId:
            command.reportId,

          criticalFindingCount:
            input.criticalFindings.length,

          attachmentCount:
            input.attachmentIds.length,
        },

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              this.support.dependencies.clock.now();

            const staffId =
              await this.support.accessPolicy.requireActiveActorStaffId(
                command.actor,
              );

            const actorObjectId =
              toObjectId(
                command.actor.userId,
                'actorUserId',
              );

            await this.validateAttachments(
              command.actor,
              input.attachmentIds,
            );

            const updated =
              await this.updateReportWithCompensation(
                command.actor,
                transaction.transactionId,
                context.report,
                {
                  ...this.reportContentUpdate(
                    input,
                  ),

                  status,

                  authoredAt:
                    occurredAt,

                  authoredBy:
                    actorObjectId,

                  authorStaffId:
                    toObjectId(
                      staffId,
                      'staffId',
                    ),

                  updatedBy:
                    actorObjectId,
                },

                transaction.registerCompensation.bind(
                  transaction,
                ),
              );

            await this.emitReportMutation(
              command.actor,
              transaction.transactionId,
              occurredAt,
              auditAction,
              outboxEvent,
              updated,
            );

            return updated;
          },
      },
    );
  }

  private async appendFinalVersion(
    command:
      RadiologyReportCommand<unknown>,

    context:
      ReportContext,

    content:
      FinalContent,

    status:
      | 'FINAL'
      | 'CORRECTED'
      | 'ADDENDUM',

    changeType:
      | 'INITIAL_FINALIZATION'
      | 'CORRECTION'
      | 'ADDENDUM',

    changeReason:
      | string
      | null,

    addendumText:
      | string
      | null,
  ) {
    return this.support.dependencies.transactionManager.execute(
      {
        transactionType:
          `RADIOLOGY_REPORT_${changeType}`,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          reportLockKey(
            command.actor.facilityId,
            command.reportId,
          ),
        ],

        idempotencyPayload: {
          reportId:
            command.reportId,

          expectedReportVersion:
            context.report.version,

          currentImmutableVersion:
            context.report.currentVersion,

          contentHash:
            radiologyContentHash(
              {
                content,
                status,
                changeType,
                changeReason,
                addendumText,
              },
            ),
        },

        journalPayload: {
          operation:
            `APPEND_${changeType}_REPORT_VERSION`,

          reportId:
            command.reportId,

          nextVersion:
            context.report.currentVersion +
            1,

          status,

          criticalFindingCount:
            content.criticalFindings.length,

          attachmentCount:
            content.attachmentIds.length,
        },

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              this.support.dependencies.clock.now();

            const staffId =
              await this.support.accessPolicy.requireActiveActorStaffId(
                command.actor,
              );

            const actorObjectId =
              toObjectId(
                command.actor.userId,
                'actorUserId',
              );

            await this.reportingStaff.assertEligibleRadiologist(
              {
                facilityId:
                  command.actor.facilityId,

                staffId,
              },
            );

            await this.validateAttachments(
              command.actor,
              content.attachmentIds,
            );

            const versionNumber =
              context.report.currentVersion +
              1;

            const snapshot =
              this.buildFinalSnapshot(
                context.report,
                content,
                status,
                versionNumber,
                staffId,
                changeReason,
                addendumText,
                occurredAt,
              );

            const associatedData =
              reportVersionAssociatedData(
                command.actor.facilityId,
                command.reportId,
                versionNumber,
              );

            const protectedSnapshot =
              this.support.dependencies.snapshotCrypto.protect(
                snapshot,
                associatedData,
              );

            const versionId =
              new Types.ObjectId();

            const version =
              await this.reports.appendVersion(
                {
                  _id:
                    versionId,

                  facilityId:
                    context.report.facilityId,

                  radiologyReportId:
                    context.report._id,

                  radiologyOrderId:
                    context.report.radiologyOrderId,

                  radiologyOrderItemId:
                    context.report.radiologyOrderItemId,

                  imagingStudyId:
                    context.report.imagingStudyId,

                  patientId:
                    context.report.patientId,

                  encounterId:
                    context.report.encounterId,

                  versionNumber,

                  previousVersionId:
                    context.report.latestVersionId,

                  changeType,

                  statusSnapshot:
                    status,

                  urgencySnapshot:
                    content.urgency,

                  criticalFindingCountSnapshot:
                    content.criticalFindings.length,

                  attachmentIdsSnapshot:
                    content.attachmentIds.map(
                      (
                        id,
                      ) =>
                        toObjectId(
                          id,
                          'attachmentIds',
                        ),
                    ),

                  encryptedSnapshot:
                    protectedSnapshot.encryptedValue,

                  snapshotHash:
                    protectedSnapshot.valueHash,

                  contentHash:
                    radiologyContentHash(
                      snapshot,
                    ),

                  changeReason,

                  authorStaffId:
                    context.report.authorStaffId ??
                    toObjectId(
                      staffId,
                      'staffId',
                    ),

                  finalRadiologistStaffId:
                    toObjectId(
                      staffId,
                      'staffId',
                    ),

                  recordedAt:
                    occurredAt,

                  recordedBy:
                    actorObjectId,

                  transactionId:
                    transaction.transactionId,

                  correlationId:
                    command.actor.correlationId,

                  schemaVersion:
                    1,

                  version:
                    0,

                  createdBy:
                    actorObjectId,

                  updatedBy:
                    actorObjectId,
                },
              );

            await transaction.registerCompensation(
              deleteCreatedRadiologyRecordCompensation(
                `delete-radiology-report-version:${versionId.toHexString()}`,
                {
                  facilityId:
                    command.actor.facilityId,

                  collection:
                    'radiologyReportVersions',

                  entityId:
                    versionId.toHexString(),

                  transactionId:
                    transaction.transactionId,
                },
              ),
            );

            const updated =
              await this.updateReportWithCompensation(
                command.actor,
                transaction.transactionId,
                context.report,
                {
                  ...this.reportContentUpdate(
                    content,
                  ),

                  status,

                  authoredAt:
                    context.report.authoredAt ??
                    occurredAt,

                  authoredBy:
                    context.report.authoredBy ??
                    actorObjectId,

                  authorStaffId:
                    context.report.authorStaffId ??
                    toObjectId(
                      staffId,
                      'staffId',
                    ),

                  finalizedAt:
                    occurredAt,

                  finalizedBy:
                    actorObjectId,

                  finalRadiologistStaffId:
                    toObjectId(
                      staffId,
                      'staffId',
                    ),

                  currentVersion:
                    versionNumber,

                  latestVersionId:
                    versionId,

                  correctedAt:
                    status ===
                    'CORRECTED'
                      ? occurredAt
                      : null,

                  correctedBy:
                    status ===
                    'CORRECTED'
                      ? actorObjectId
                      : null,

                  correctionReason:
                    status ===
                    'CORRECTED'
                      ? changeReason
                      : null,

                  supersedesReportVersionId:
                    status ===
                    'CORRECTED'
                      ? context.report.latestVersionId
                      : null,

                  addendumCount:
                    status ===
                    'ADDENDUM'
                      ? context.report.addendumCount +
                        1
                      : context.report.addendumCount,

                  latestAddendumAt:
                    status ===
                    'ADDENDUM'
                      ? occurredAt
                      : null,

                  publicationStatus:
                    'NOT_PUBLISHED',

                  publishedAt:
                    null,

                  publishedBy:
                    null,

                  withdrawnAt:
                    null,

                  withdrawnBy:
                    null,

                  withdrawalReason:
                    null,

                  updatedBy:
                    actorObjectId,
                },

                transaction.registerCompensation.bind(
                  transaction,
                ),
              );

            await this.transitionItemAndOrderForReport(
              command.actor,
              transaction.transactionId,
              context.item,
              context.order,
              'FINAL_REPORTED',
              'REPORTED',
              occurredAt,
              transaction.registerCompensation.bind(
                transaction,
              ),
            );

            await transaction.checkpoint(
              RADIOLOGY_TRANSACTION_STATES.REPORT_VERSION_APPENDED,
              {
                reportId:
                  command.reportId,

                reportVersionId:
                  version._id.toHexString(),

                versionNumber,

                changeType,
              },
            );

            await this.emitReportMutation(
              command.actor,
              transaction.transactionId,
              occurredAt,
              status ===
              'FINAL'
                ? RADIOLOGY_AUDIT_ACTIONS.REPORT_FINALIZED
                : status ===
                  'CORRECTED'
                  ? RADIOLOGY_AUDIT_ACTIONS.REPORT_CORRECTED
                  : RADIOLOGY_AUDIT_ACTIONS.REPORT_ADDENDUM_ADDED,
              status ===
              'FINAL'
                ? RADIOLOGY_OUTBOX_EVENTS.REPORT_FINALIZED
                : status ===
                  'CORRECTED'
                  ? RADIOLOGY_OUTBOX_EVENTS.REPORT_CORRECTED
                  : RADIOLOGY_OUTBOX_EVENTS.REPORT_ADDENDUM_ADDED,
              updated,
              changeReason ??
                undefined,
            );

            return {
              report:
                updated,

              version,
            };
          },
      },
    );
  }

  private async resolveReportContext(
    actor:
      RadiologyActorContext,

    reportId:
      string,
  ): Promise<
    ReportContext
  > {
    const report =
      await this.reports.findById(
        actor.facilityId,
        reportId,
        true,
      );

    if (
      report ===
      null
    ) {
      throw new RadiologyReportNotFoundError();
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

    return {
      report,
      item,
      order,
    };
  }

  private async requireAssignedRadiologist(
    actor:
      RadiologyActorContext,

    report:
      RadiologyReportRecord,
  ): Promise<
    string
  > {
    const actorStaffId =
      await this.support.accessPolicy.requireActiveActorStaffId(
        actor,
      );

    if (
      report.assignedRadiologistStaffId.toHexString() !==
      actorStaffId
    ) {
      throw new ConflictError(
        'The authenticated staff member is not the assigned Radiology report radiologist',
      );
    }

    return actorStaffId;
  }

  private assertReportVersion(
    report:
      RadiologyReportRecord,

    expectedVersion:
      number,
  ): void {
    if (
      report.version !==
      expectedVersion
    ) {
      throw new RadiologyReportingConcurrencyError();
    }
  }

  private async validateAttachments(
    actor:
      RadiologyActorContext,

    attachmentIds:
      readonly string[],
  ): Promise<void> {
    await this.attachments.assertUsable(
      {
        facilityId:
          actor.facilityId,

        attachmentIds:
          uniqueRadiologyObjectIdStrings(
            attachmentIds,
          ),

        actorUserId:
          actor.userId,

        purpose:
          'RADIOLOGY_REPORT',
      },
    );
  }

  private reportContentUpdate(
    content:
      FinalContent,
  ) {
    const criticalFindings =
      content.criticalFindings.map(
        (
          finding,
        ) => ({
          findingCode:
            normalizeRadiologyCode(
              finding.findingCode,
            ),

          title:
            finding.title.trim(),

          description:
            finding.description.trim(),

          urgency:
            finding.urgency,

          recommendation:
            finding.recommendation?.trim() ??
            null,
        }),
      );

    return {
      urgency:
        content.urgency,

      clinicalHistory:
        content.clinicalHistory?.trim() ??
        null,

      comparisonStudyReferences:
        uniqueRadiologyStrings(
          content.comparisonStudyReferences,
        ),

      findings:
        content.findings.trim(),

      impression:
        content.impression.trim(),

      recommendations:
        content.recommendations?.trim() ??
        null,

      criticalFindings,

      criticalFindingCount:
        criticalFindings.length,

      unresolvedCriticalFindingCount:
        criticalFindings.length,

      attachmentIds:
        uniqueRadiologyObjectIdStrings(
          content.attachmentIds,
        ).map(
          (
            id,
          ) =>
            toObjectId(
              id,
              'attachmentIds',
            ),
        ),
    };
  }

  private buildFinalSnapshot(
    report:
      RadiologyReportRecord,

    content:
      FinalContent,

    status:
      | 'FINAL'
      | 'CORRECTED'
      | 'ADDENDUM',

    versionNumber:
      number,

    finalRadiologistStaffId:
      string,

    correctionReason:
      | string
      | null,

    addendumText:
      | string
      | null,

    recordedAt:
      Date,
  ): RadiologyFinalReportSnapshot {
    return {
      schemaVersion:
        1,

      reportId:
        report._id.toHexString(),

      reportNumber:
        report.reportNumber,

      orderId:
        report.radiologyOrderId.toHexString(),

      orderItemId:
        report.radiologyOrderItemId.toHexString(),

      imagingStudyId:
        report.imagingStudyId.toHexString(),

      examinationId:
        report.examinationId.toHexString(),

      patientId:
        report.patientId.toHexString(),

      encounterId:
        report.encounterId.toHexString(),

      procedureId:
        report.procedureId.toHexString(),

      procedureCode:
        report.procedureCodeSnapshot,

      procedureName:
        report.procedureNameSnapshot,

      modalityCode:
        report.modalityCodeSnapshot,

      accessionNumber:
        report.accessionNumberSnapshot,

      studyInstanceUid:
        report.studyInstanceUidSnapshot,

      status,

      urgency:
        content.urgency,

      versionNumber,

      clinicalHistory:
        content.clinicalHistory?.trim() ??
        null,

      comparisonStudyReferences:
        uniqueRadiologyStrings(
          content.comparisonStudyReferences,
        ),

      findings:
        content.findings.trim(),

      impression:
        content.impression.trim(),

      recommendations:
        content.recommendations?.trim() ??
        null,

      criticalFindings:
        content.criticalFindings.map(
          (
            finding,
          ) => ({
            findingCode:
              normalizeRadiologyCode(
                finding.findingCode,
              ),

            title:
              finding.title.trim(),

            description:
              finding.description.trim(),

            urgency:
              finding.urgency,

            recommendation:
              finding.recommendation?.trim() ??
              null,
          }),
        ),

      attachmentIds:
        uniqueRadiologyObjectIdStrings(
          content.attachmentIds,
        ),

      authorStaffId:
        report.authorStaffId?.toHexString() ??
        finalRadiologistStaffId,

      finalRadiologistStaffId,

      finalizedAt:
        recordedAt.toISOString(),

      correctionReason,

      addendumText,

      recordedAt:
        recordedAt.toISOString(),
    };
  }

  private async readLatestSnapshot(
    report:
      RadiologyReportRecord,
  ): Promise<
    RadiologyFinalReportSnapshot
  > {
    if (
      report.latestVersionId ===
      null
    ) {
      throw new RadiologyReportVersionNotFoundError();
    }

    const version =
      await this.reports.findVersionById(
        report.facilityId.toHexString(),
        report.latestVersionId.toHexString(),
        true,
      );

    if (
      version ===
        null ||
      version.radiologyReportId.toHexString() !==
        report._id.toHexString()
    ) {
      throw new RadiologyReportVersionNotFoundError();
    }

    const associatedData =
      reportVersionAssociatedData(
        report.facilityId.toHexString(),
        report._id.toHexString(),
        version.versionNumber,
      );

    const snapshot =
      this.support.dependencies.snapshotCrypto.unprotect<
        RadiologyFinalReportSnapshot
      >(
        version.encryptedSnapshot,
        associatedData,
      );

    if (
      !this.support.dependencies.snapshotCrypto.matchesHash(
        snapshot,
        associatedData,
        version.snapshotHash,
      ) ||
      radiologyContentHash(
        snapshot,
      ) !==
        version.contentHash
    ) {
      throw new ConflictError(
        'Radiology report-version integrity verification failed',
      );
    }

    return snapshot;
  }

  private async updateReportWithCompensation(
    actor:
      RadiologyActorContext,

    transactionId:
      string,

    current:
      RadiologyReportRecord,

    update:
      Record<
        string,
        unknown
      >,

    register:
      RegisterCompensation,
  ): Promise<
    RadiologyReportRecord
  > {
    const restore =
      protectRadiologyRestorePayload(
        {
          facilityId:
            actor.facilityId,

          collection:
            'radiologyReports',

          entityId:
            current._id.toHexString(),

          expectedPostVersion:
            current.version +
            1,

          transactionId,

          snapshot:
            restoreSnapshot(
              current as unknown as Record<
                string,
                unknown
              >,
            ),

          snapshotCrypto:
            this.support.dependencies.snapshotCrypto,
        },
      );

    const updated =
      await this.reports.update(
        actor.facilityId,
        current._id.toHexString(),
        current.version,
        update,
      );

    if (
      updated ===
      null
    ) {
      throw new RadiologyReportingConcurrencyError();
    }

    await register(
      restoreRadiologyRecordCompensation(
        `restore-radiology-report:${current._id.toHexString()}`,
        restore,
      ),
    );

    return updated;
  }

  private async transitionItemAndOrderForReport(
    actor:
      RadiologyActorContext,

    transactionId:
      string,

    item:
      RadiologyOrderItemRecord,

    order:
      RadiologyOrderRecord,

    itemStatus:
      RadiologyOrderItemRecord[
        'status'
      ],

    orderStatus:
      RadiologyOrderRecord[
        'status'
      ],

    occurredAt:
      Date,

    register:
      RegisterCompensation,
  ): Promise<void> {
    const staffId =
      await this.support.accessPolicy.requireActiveActorStaffId(
        actor,
      );

    const staffObjectId =
      toObjectId(
        staffId,
        'staffId',
      );

    const actorObjectId =
      toObjectId(
        actor.userId,
        'actorUserId',
      );

    if (
      item.status !==
      itemStatus
    ) {
      const itemRestore =
        protectRadiologyRestorePayload(
          {
            facilityId:
              actor.facilityId,

            collection:
              'radiologyOrderItems',

            entityId:
              item._id.toHexString(),

            expectedPostVersion:
              item.version +
              1,

            transactionId,

            snapshot:
              radiologyOrderItemRestoreSnapshot(
                item,
              ),

            snapshotCrypto:
              this.support.dependencies.snapshotCrypto,
          },
        );

      const updatedItem =
        await this.support.orders.transitionItem(
          actor.facilityId,
          item._id.toHexString(),
          item.version,
          [
            item.status,
          ],
          {
            status:
              itemStatus,

            reportId:
              item.reportId,

            verifiedAt:
              itemStatus ===
              'VERIFIED'
                ? occurredAt
                : null,

            updatedBy:
              actorObjectId,
          },
        );

      if (
        updatedItem ===
        null
      ) {
        throw new RadiologyReportingConcurrencyError();
      }

      await register(
        restoreRadiologyRecordCompensation(
          `restore-report-order-item:${item._id.toHexString()}:${itemStatus}`,
          itemRestore,
        ),
      );

      const histories =
        await this.support.orders.listItemHistory(
          actor.facilityId,
          item._id.toHexString(),
        );

      const history =
        await this.support.orders.appendItemHistory(
          {
            facilityId:
              item.facilityId,

            radiologyOrderId:
              item.radiologyOrderId,

            radiologyOrderItemId:
              item._id,

            patientId:
              item.patientId,

            encounterId:
              item.encounterId,

            sequence:
              histories.length +
              1,

            fromStatus:
              item.status,

            toStatus:
              itemStatus,

            changeSource:
              'RADIOLOGY_STAFF',

            reasonCode:
              null,

            reason:
              null,

            occurredAt,

            changedBy:
              staffObjectId,

            transactionId,

            correlationId:
              actor.correlationId,

            schemaVersion:
              1,

            version:
              0,

            createdBy:
              actorObjectId,

            updatedBy:
              actorObjectId,
          },
        );

      await register(
        deleteCreatedRadiologyRecordCompensation(
          `delete-report-order-item-history:${history._id.toHexString()}`,
          {
            facilityId:
              actor.facilityId,

            collection:
              'radiologyOrderItemStatusHistories',

            entityId:
              history._id.toHexString(),

            transactionId,
          },
        ),
      );
    }

    if (
      order.status ===
      orderStatus
    ) {
      return;
    }

    if (
      orderStatus ===
      'VERIFIED'
    ) {
      const aggregateItems =
        await this.support.orders.listItems(
          actor.facilityId,
          order._id.toHexString(),
        );

      const allItemsResolved =
        aggregateItems.every(
          (
            candidate,
          ) =>
            [
              'VERIFIED',
              'REJECTED',
              'CANCELLED',
            ].includes(
              candidate.status,
            ),
        );

      if (
        !allItemsResolved
      ) {
        return;
      }
    }

    const orderRestore =
      protectRadiologyRestorePayload(
        {
          facilityId:
            actor.facilityId,

          collection:
            'radiologyOrders',

          entityId:
            order._id.toHexString(),

          expectedPostVersion:
            order.version +
            1,

          transactionId,

          snapshot:
            radiologyOrderRestoreSnapshot(
              order,
            ),

          snapshotCrypto:
            this.support.dependencies.snapshotCrypto,
        },
      );

    const updatedOrder =
      await this.support.orders.transitionStatus(
        actor.facilityId,
        order._id.toHexString(),
        order.version,
        [
          order.status,
        ],
        {
          status:
            orderStatus,

          reportedItemCount:
            orderStatus ===
            'REPORTED'
              ? Math.max(
                  order.reportedItemCount,
                  1,
                )
              : order.reportedItemCount,

          verifiedItemCount:
            orderStatus ===
            'VERIFIED'
              ? Math.max(
                  order.verifiedItemCount,
                  1,
                )
              : order.verifiedItemCount,

          verifiedAt:
            orderStatus ===
            'VERIFIED'
              ? occurredAt
              : null,

          lastStatusChangedAt:
            occurredAt,

          lastStatusChangedBy:
            staffObjectId,

          updatedBy:
            actorObjectId,
        },
      );

    if (
      updatedOrder ===
      null
    ) {
      throw new RadiologyReportingConcurrencyError();
    }

    await register(
      restoreRadiologyRecordCompensation(
        `restore-report-order:${order._id.toHexString()}:${orderStatus}`,
        orderRestore,
      ),
    );

    const histories =
      await this.support.orders.listHistory(
        actor.facilityId,
        order._id.toHexString(),
      );

    const history =
      await this.support.orders.appendHistory(
        {
          facilityId:
            order.facilityId,

          radiologyOrderId:
            order._id,

          patientId:
            order.patientId,

          encounterId:
            order.encounterId,

          sequence:
            histories.length +
            1,

          fromStatus:
            order.status,

          toStatus:
            orderStatus,

          changeSource:
            'RADIOLOGY_STAFF',

          reasonCode:
            null,

          reason:
            null,

          occurredAt,

          changedBy:
            staffObjectId,

          transactionId,

          correlationId:
            actor.correlationId,

          schemaVersion:
            1,

          version:
            0,

          createdBy:
            actorObjectId,

          updatedBy:
            actorObjectId,
        },
      );

    await register(
      deleteCreatedRadiologyRecordCompensation(
        `delete-report-order-history:${history._id.toHexString()}`,
        {
          facilityId:
            actor.facilityId,

          collection:
            'radiologyOrderStatusHistories',

          entityId:
            history._id.toHexString(),

          transactionId,
        },
      ),
    );
  }

  private async emitReportMutation(
    actor:
      RadiologyActorContext,

    transactionId:
      string,

    occurredAt:
      Date,

    auditAction:
      string,

    outboxEvent:
      string,

    report:
      RadiologyReportRecord,

    reason?:
      string,

    realtimeEvent =
      RADIOLOGY_REALTIME_EVENTS.REPORT_WORKLIST_CHANGED,
  ): Promise<void> {
    const payload =
      safeReportSnapshot(
        report,
      );

    await this.support.dependencies.audit.append(
      {
        transactionId,

        deduplicationKey:
          this.support.deduplicationKey(
            transactionId,
            auditAction,
            report._id.toHexString(),
          ),

        action:
          auditAction,

        entityType:
          'RadiologyReport',

        entityId:
          report._id.toHexString(),

        ...this.support.auditActorFields(
          actor,
        ),

        occurredAt,

        ...(
          reason ===
          undefined
            ? {}
            : {
                reason,
              }
        ),

        metadata:
          payload,
      },
    );

    await this.support.dependencies.outbox.enqueue(
      {
        transactionId,

        deduplicationKey:
          this.support.deduplicationKey(
            transactionId,
            outboxEvent,
            report._id.toHexString(),
          ),

        eventType:
          outboxEvent,

        aggregateType:
          'RadiologyReport',

        aggregateId:
          report._id.toHexString(),

        actorUserId:
          actor.userId,

        facilityId:
          actor.facilityId,

        correlationId:
          actor.correlationId,

        occurredAt,

        payload,
      },
    );

    await this.support.dependencies.realtime.publish(
      {
        eventType:
          realtimeEvent,

        facilityId:
          actor.facilityId,

        patientId:
          report.patientId.toHexString(),

        encounterId:
          report.encounterId.toHexString(),

        orderId:
          report.radiologyOrderId.toHexString(),

        orderItemId:
          report.radiologyOrderItemId.toHexString(),

        studyId:
          report.imagingStudyId.toHexString(),

        reportId:
          report._id.toHexString(),

        payload,
      },
    );

    await this.support.dependencies.realtime.publish(
      {
        eventType:
          RADIOLOGY_REALTIME_EVENTS.ENCOUNTER_RADIOLOGY_CHANGED,

        facilityId:
          actor.facilityId,

        patientId:
          report.patientId.toHexString(),

        encounterId:
          report.encounterId.toHexString(),

        orderId:
          report.radiologyOrderId.toHexString(),

        orderItemId:
          report.radiologyOrderItemId.toHexString(),

        reportId:
          report._id.toHexString(),

        payload,
      },
    );
  }

  private async emitCommunication(
    actor:
      RadiologyActorContext,

    transactionId:
      string,

    communicationId:
      string,

    reportVersionId:
      string,

    reportId:
      string,

    findingCode:
      string,

    urgency:
      string,

    communicationType:
      string,

    channel:
      string,

    recipientType:
      string,

    acknowledgedCommunicationId:
      | string
      | null,

    occurredAt:
      Date,

    auditAction:
      string,

    outboxEvent:
      string,
  ): Promise<void> {
    const payload =
      safeCommunicationSnapshot(
        {
          communicationId,
          reportId,
          reportVersionId,
          findingCode,
          urgency,
          communicationType,
          channel,
          recipientType,
          acknowledgedCommunicationId,
          occurredAt,
        },
      );

    await this.support.dependencies.audit.append(
      {
        transactionId,

        deduplicationKey:
          this.support.deduplicationKey(
            transactionId,
            auditAction,
            communicationId,
          ),

        action:
          auditAction,

        entityType:
          'RadiologyCriticalFindingCommunication',

        entityId:
          communicationId,

        ...this.support.auditActorFields(
          actor,
        ),

        occurredAt,

        metadata:
          payload,
      },
    );

    await this.support.dependencies.outbox.enqueue(
      {
        transactionId,

        deduplicationKey:
          this.support.deduplicationKey(
            transactionId,
            outboxEvent,
            communicationId,
          ),

        eventType:
          outboxEvent,

        aggregateType:
          'RadiologyReport',

        aggregateId:
          reportId,

        actorUserId:
          actor.userId,

        facilityId:
          actor.facilityId,

        correlationId:
          actor.correlationId,

        occurredAt,

        payload,
      },
    );

    await this.support.dependencies.realtime.publish(
      {
        eventType:
          RADIOLOGY_REALTIME_EVENTS.CRITICAL_FINDING_CHANGED,

        facilityId:
          actor.facilityId,

        reportId,

        payload,
      },
    );
  }

  private summary(
    report:
      RadiologyReportRecord,
  ): RadiologyReportSummaryView {
    return {
      id:
        report._id.toHexString(),

      reportNumber:
        report.reportNumber,

      orderId:
        report.radiologyOrderId.toHexString(),

      orderItemId:
        report.radiologyOrderItemId.toHexString(),

      imagingStudyId:
        report.imagingStudyId.toHexString(),

      procedureCode:
        report.procedureCodeSnapshot,

      procedureName:
        report.procedureNameSnapshot,

      modalityCode:
        report.modalityCodeSnapshot,

      status:
        report.status,

      urgency:
        report.urgency,

      publicationStatus:
        report.publicationStatus,

      versionNumber:
        report.currentVersion,

      criticalFindingCount:
        report.criticalFindingCount,

      finalizedAt:
        report.finalizedAt?.toISOString() ??
        null,

      publishedAt:
        report.publishedAt?.toISOString() ??
        null,
    };
  }
}

interface ReportContext {
  report:
    RadiologyReportRecord;

  item:
    RadiologyOrderItemRecord;

  order:
    RadiologyOrderRecord;
}

interface FinalContent {
  urgency:
    RadiologyReportRecord[
      'urgency'
    ];

  clinicalHistory?:
    | string
    | null;

  comparisonStudyReferences:
    readonly string[];

  findings:
    string;

  impression:
    string;

  recommendations?:
    | string
    | null;

  criticalFindings:
    readonly Array<{
      findingCode:
        string;

      title:
        string;

      description:
        string;

      urgency:
        | 'URGENT'
        | 'CRITICAL';

      recommendation?:
        | string
        | null;
    }>;

  attachmentIds:
    readonly string[];
}

type RegisterCompensation = (
  compensation: {
    key:
      string;

    type:
      string;

    payload:
      Record<
        string,
        unknown
      >;
  },
) => Promise<void>;