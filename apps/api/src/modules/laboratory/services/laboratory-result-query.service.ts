import type {
  LaboratoryActorContext,
  LaboratoryResultSummaryView,
} from '../laboratory.types.js';

import type {
  LaboratoryReportDocument,
} from '../laboratory.ports.js';

import type {
  LaboratoryCriticalResultCommunicationRecord,
  LaboratoryResultRecord,
  LaboratoryResultVersionRecord,
} from '../laboratory.persistence.types.js';

import {
  LaboratoryMinimumNecessaryAccessError,
  LaboratoryOrderNotFoundError,
  LaboratoryResultNotFoundError,
} from '../laboratory.errors.js';

import {
  LaboratoryResultReportUnavailableError,
  LaboratoryResultSnapshotIntegrityError,
} from '../laboratory-result.errors.js';

import {
  assertLaboratoryResultSnapshotIntegrity,
  laboratoryResultVersionAssociatedData,
  type LaboratoryVerifiedResultSnapshot,
} from '../laboratory-result.workflow-helpers.js';

import {
  DEFAULT_LABORATORY_HISTORY_PAGE_SIZE,
  LABORATORY_RESULT_AUDIT_ACTIONS,
  MAX_LABORATORY_HISTORY_PAGE_SIZE,
} from '../laboratory-result.transaction.constants.js';

import {
  laboratoryDeduplicationKey,
} from '../laboratory.workflow-helpers.js';

import {
  LaboratoryCommandService,
} from './laboratory-command.service.js';

import {
  LaboratoryReportRenderer,
} from './laboratory-report.renderer.js';

import {
  LaboratoryResultRepository,
  type LaboratoryResultHistoryQuery,
} from '../repositories/laboratory-result.repository.js';

export interface LaboratoryResultHistoryResponse {
  items:
    LaboratoryResultSummaryView[];

  total:
    number;

  page:
    number;

  pageSize:
    number;
}

export interface LaboratoryResultVersionView {
  id:
    string;

  versionNumber:
    number;

  changeType:
    LaboratoryResultVersionRecord['changeType'];

  status:
    LaboratoryResultVersionRecord['statusSnapshot'];

  overallFlag:
    LaboratoryResultVersionRecord['overallFlagSnapshot'];

  criticalComponentCount:
    number;

  changeReason:
    string | null;

  recordedAt:
    string;

  recordedBy:
    string;

  snapshot:
    LaboratoryVerifiedResultSnapshot;
}

function summary(
  result:
    LaboratoryResultRecord,
): LaboratoryResultSummaryView {
  return {
    id:
      result
        ._id
        .toHexString(),

    resultNumber:
      result.resultNumber,

    labOrderId:
      result
        .labOrderId
        .toHexString(),

    labOrderItemId:
      result
        .labOrderItemId
        .toHexString(),

    patientId:
      result
        .patientId
        .toHexString(),

    encounterId:
      result
        .encounterId
        .toHexString(),

    status:
      result.status,

    publicationStatus:
      result
        .publicationStatus,

    overallFlag:
      result.overallFlag,

    verifiedAt:
      result
        .verifiedAt
        ?.toISOString() ??
      null,

    currentVersion:
      result.currentVersion,

    version:
      result.version,
  };
}

export class LaboratoryResultQueryService {
  public constructor(
    private readonly support:
      LaboratoryCommandService,

    private readonly results:
      LaboratoryResultRepository,

    private readonly renderer:
      LaboratoryReportRenderer,
  ) {}

  private async authorizeRead(
    actor:
      LaboratoryActorContext,

    result:
      LaboratoryResultRecord,

    action:
      | 'RESULT_READ'
      | 'RESULT_PRINT',
  ) {
    const order =
      await this
        .support
        .orders
        .findById(
          actor.facilityId,
          result
            .labOrderId
            .toHexString(),
        );

    if (
      order ===
      null
    ) {
      throw new LaboratoryOrderNotFoundError();
    }

    const decision =
      await this
        .support
        .accessPolicy
        .authorize({
          actor,

          action,

          order,

          result,
        });

    if (
      !decision.allowed
    ) {
      throw new LaboratoryMinimumNecessaryAccessError();
    }

    return {
      order,

      decision,
    };
  }

  private decryptVersion(
    actor:
      LaboratoryActorContext,

    version:
      LaboratoryResultVersionRecord,
  ): LaboratoryVerifiedResultSnapshot {
    const associatedData =
      laboratoryResultVersionAssociatedData(
        actor.facilityId,

        version
          .labResultId
          .toHexString(),

        version.versionNumber,
      );

    let snapshot:
      LaboratoryVerifiedResultSnapshot;

    try {
      snapshot =
        this
          .support
          .dependencies
          .snapshotCrypto
          .unprotect<
            LaboratoryVerifiedResultSnapshot
          >(
            version.encryptedSnapshot,
            associatedData,
          );
    } catch (error) {
      throw new LaboratoryResultSnapshotIntegrityError(
        'Laboratory result snapshot could not be decrypted',

        error,
      );
    }

    assertLaboratoryResultSnapshotIntegrity({
      snapshot,

      version,

      associatedData,

      matchesHash: (
        value,
        data,
        expectedHash,
      ) =>
        this
          .support
          .dependencies
          .snapshotCrypto
          .matchesHash(
            value,
            data,
            expectedHash,
          ),
    });

    return snapshot;
  }

  public async getResult(
    actor:
      LaboratoryActorContext,

    resultId:
      string,
  ): Promise<{
    result:
      LaboratoryResultRecord;

    versions:
      LaboratoryResultVersionView[];

    communications:
      LaboratoryCriticalResultCommunicationRecord[];
  }> {
    const result =
      await this
        .results
        .findById(
          actor.facilityId,
          resultId,
        );

    if (
      result ===
      null
    ) {
      throw new LaboratoryResultNotFoundError();
    }

    const {
      decision,
    } =
      await this.authorizeRead(
        actor,
        result,
        'RESULT_READ',
      );

    const [
      versions,
      communications,
    ] =
      await Promise.all([
        this
          .results
          .listVersions(
            actor.facilityId,
            resultId,
          ),

        this
          .results
          .listCriticalCommunications(
            actor.facilityId,
            resultId,
          ),
      ]);

    const versionViews =
      versions.map(
        (version) => ({
          id:
            version
              ._id
              .toHexString(),

          versionNumber:
            version.versionNumber,

          changeType:
            version.changeType,

          status:
            version.statusSnapshot,

          overallFlag:
            version
              .overallFlagSnapshot,

          criticalComponentCount:
            version
              .criticalComponentCountSnapshot,

          changeReason:
            version.changeReason,

          recordedAt:
            version
              .recordedAt
              .toISOString(),

          recordedBy:
            version
              .recordedBy
              .toHexString(),

          snapshot:
            this.decryptVersion(
              actor,
              version,
            ),
        }),
      );

    if (
      decision.auditSensitiveRead
    ) {
      const occurredAt =
        this
          .support
          .dependencies
          .clock
          .now();

      await this
        .support
        .dependencies
        .audit
        .append({
          transactionId:
            actor.correlationId,

          deduplicationKey:
            laboratoryDeduplicationKey(
              actor.correlationId,

              LABORATORY_RESULT_AUDIT_ACTIONS
                .RESULT_HISTORY_READ,

              resultId,
            ),

          action:
            LABORATORY_RESULT_AUDIT_ACTIONS
              .RESULT_HISTORY_READ,

          entityType:
            'LabResult',

          entityId:
            resultId,

          ...this
            .support
            .auditActorFields(
              actor,
            ),

          occurredAt,

          metadata: {
            accessMode:
              decision.accessMode,

            immutableVersionCount:
              versionViews.length,

            communicationCount:
              communications.length,
          },
        });
    }

    return {
      result,

      versions:
        versionViews,

      communications,
    };
  }

  public async listPatientHistory(
    actor:
      LaboratoryActorContext,

    patientId:
      string,

    page =
      1,

    pageSize =
      DEFAULT_LABORATORY_HISTORY_PAGE_SIZE,
  ): Promise<
    LaboratoryResultHistoryResponse
  > {
    return this.listHistory(
      actor,
      {
        patientId,

        page,

        pageSize,
      },
    );
  }

  public async listEncounterHistory(
    actor:
      LaboratoryActorContext,

    encounterId:
      string,

    page =
      1,

    pageSize =
      DEFAULT_LABORATORY_HISTORY_PAGE_SIZE,
  ): Promise<
    LaboratoryResultHistoryResponse
  > {
    return this.listHistory(
      actor,
      {
        encounterId,

        page,

        pageSize,
      },
    );
  }

  private async listHistory(
    actor:
      LaboratoryActorContext,

    query:
      LaboratoryResultHistoryQuery,
  ): Promise<
    LaboratoryResultHistoryResponse
  > {
    const page =
      Math.max(
        1,
        query.page,
      );

    const pageSize =
      Math.min(
        MAX_LABORATORY_HISTORY_PAGE_SIZE,

        Math.max(
          1,
          query.pageSize,
        ),
      );

    const records =
      await this
        .results
        .list(
          actor.facilityId,
          {
            ...query,

            page,

            pageSize,
          },
        );

    for (
      const result of
      records.items
    ) {
      await this.authorizeRead(
        actor,
        result,
        'RESULT_READ',
      );
    }

    return {
      items:
        records.items.map(
          summary,
        ),

      total:
        records.total,

      page,

      pageSize,
    };
  }

  public async printOrderReport(
    actor:
      LaboratoryActorContext,

    orderId:
      string,
  ): Promise<
    LaboratoryReportDocument
  > {
    const order =
      await this
        .support
        .orders
        .findById(
          actor.facilityId,
          orderId,
        );

    if (
      order ===
      null
    ) {
      throw new LaboratoryOrderNotFoundError();
    }

    const records =
      await this
        .results
        .list(
          actor.facilityId,
          {
            page:
              1,

            pageSize:
              MAX_LABORATORY_HISTORY_PAGE_SIZE,

            orderId,
          },
        );

    const printable =
      records.items.filter(
        (result) =>
          [
            'VERIFIED',
            'CORRECTED',
          ].includes(
            result.status,
          ) &&
          result.publicationStatus ===
            'PUBLISHED' &&
          result.latestVersionId !==
            null,
      );

    if (
      printable.length ===
      0
    ) {
      throw new LaboratoryResultReportUnavailableError();
    }

    const snapshots:
      LaboratoryVerifiedResultSnapshot[] =
        [];

    for (
      const result of
      printable
    ) {
      await this.authorizeRead(
        actor,
        result,
        'RESULT_PRINT',
      );

      const versions =
        await this
          .results
          .listVersions(
            actor.facilityId,

            result
              ._id
              .toHexString(),
          );

      const latest =
        versions.at(
          -1,
        );

      if (
        latest ===
        undefined
      ) {
        throw new LaboratoryResultSnapshotIntegrityError(
          'Published Laboratory result has no immutable result version',
        );
      }

      snapshots.push(
        this.decryptVersion(
          actor,
          latest,
        ),
      );
    }

    const printedAt =
      this
        .support
        .dependencies
        .clock
        .now();

    const document =
      await this
        .renderer
        .renderVerifiedSnapshots({
          orderNumber:
            order.orderNumber,

          snapshots,

          printedAt,
        });

    await this
      .support
      .dependencies
      .audit
      .append({
        transactionId:
          actor.correlationId,

        deduplicationKey:
          laboratoryDeduplicationKey(
            actor.correlationId,

            LABORATORY_RESULT_AUDIT_ACTIONS
              .RESULT_REPORT_PRINTED,

            orderId,
          ),

        action:
          LABORATORY_RESULT_AUDIT_ACTIONS
            .RESULT_REPORT_PRINTED,

        entityType:
          'LabOrder',

        entityId:
          orderId,

        ...this
          .support
          .auditActorFields(
            actor,
          ),

        occurredAt:
          printedAt,

        metadata: {
          resultCount:
            snapshots.length,

          contentHash:
            document.contentHash,

          filename:
            document.filename,
        },
      });

    return document;
  }
}