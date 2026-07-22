import {
  AssistanceAllocationModel,
  AssistanceApplicationModel,
  AssistanceApprovalModel,
  AssistanceFundModel,
  AssistanceReservationModel,
  decimal128ToString,
} from '@hospital-mis/database';

import { WELFARE_ZAKAT_PERMISSION_KEYS } from '../welfare-zakat.constants.js';
import type { WelfareZakatActorContext } from '../welfare-zakat.contracts.js';
import { AssistanceVersionConflictError } from '../welfare-zakat.errors.js';
import {
  safeWelfareZakatRealtimePayload,
  stableAssistancePayloadHash,
} from '../welfare-zakat.normalization.js';
import type {
  AssistanceApplicationHistoryRepositoryPort,
  AssistanceApplicationRepositoryPort,
  AssistanceApprovalHistoryRepositoryPort,
  AssistanceApprovalRepositoryPort,
  AssistanceReservationRepositoryPort,
  WelfareZakatAuditPort,
  WelfareZakatClockPort,
  WelfareZakatOutboxPort,
  WelfareZakatTransactionManagerPort,
} from '../welfare-zakat.ports.js';
import type {
  AssistanceApplicationRecord,
  AssistanceApprovalRecord,
  AssistanceReservationRecord,
} from '../welfare-zakat.persistence.types.js';
import {
  projectAssistanceApplication,
  projectAssistanceApproval,
} from '../welfare-zakat.projections.js';
import type { AssistanceReconciliationService } from './assistance-reconciliation.service.js';
import type { AssistanceReservationService } from './assistance-reservation.service.js';

const SYSTEM_USER_ID = '000000000000000000000001';

function backgroundActor(facilityId: string, correlationId: string): WelfareZakatActorContext {
  return {
    userId: SYSTEM_USER_ID,
    staffId: null,
    facilityId,
    correlationId,
    permissionKeys: new Set([
      WELFARE_ZAKAT_PERMISSION_KEYS.RESERVATION_RELEASE,
      WELFARE_ZAKAT_PERMISSION_KEYS.RECONCILE,
      WELFARE_ZAKAT_PERMISSION_KEYS.RECOVERY_MANAGE,
      WELFARE_ZAKAT_PERMISSION_KEYS.READ,
    ]),
    roleKeys: ['SYSTEM_BACKGROUND'],
  };
}

export class AssistanceMaintenanceService {
  public constructor(
    private readonly dependencies: Readonly<{
      transactionManager: WelfareZakatTransactionManagerPort;
      applications: AssistanceApplicationRepositoryPort;
      applicationHistories: AssistanceApplicationHistoryRepositoryPort;
      approvals: AssistanceApprovalRepositoryPort;
      approvalHistories: AssistanceApprovalHistoryRepositoryPort;
      reservations: AssistanceReservationRepositoryPort;
      reservationService: AssistanceReservationService;
      reconciliationService: AssistanceReconciliationService;
      audit: WelfareZakatAuditPort;
      outbox: WelfareZakatOutboxPort;
      clock: WelfareZakatClockPort;
    }>,
  ) {}

  public async sweep(
    now = this.dependencies.clock.now(),
    limit = 200,
    facilityId?: string,
  ): Promise<Readonly<{
    applicationsExpired: number;
    approvalsExpired: number;
    reservationsExpired: number;
    fundsReconciled: number;
    allocationsReconciled: number;
    failures: number;
  }>> {
    const facilities = facilityId == null
      ? await AssistanceFundModel.distinct('facilityId')
      : [facilityId];
    const total = {
      applicationsExpired: 0,
      approvalsExpired: 0,
      reservationsExpired: 0,
      fundsReconciled: 0,
      allocationsReconciled: 0,
      failures: 0,
    };

    for (const value of facilities.slice(0, 500)) {
      const resolvedFacilityId = typeof value === 'string'
        ? value
        : value.toHexString();
      const result = await this.sweepFacility(resolvedFacilityId, now, limit);
      total.applicationsExpired += result.applicationsExpired;
      total.approvalsExpired += result.approvalsExpired;
      total.reservationsExpired += result.reservationsExpired;
      total.fundsReconciled += result.fundsReconciled;
      total.allocationsReconciled += result.allocationsReconciled;
      total.failures += result.failures;
    }

    return total;
  }

  private async sweepFacility(facilityId: string, now: Date, limit: number) {
    const result = {
      applicationsExpired: 0,
      approvalsExpired: 0,
      reservationsExpired: 0,
      fundsReconciled: 0,
      allocationsReconciled: 0,
      failures: 0,
    };
    const boundedLimit = Math.max(1, Math.min(limit, 1_000));

    const applications = await AssistanceApplicationModel.find({
      facilityId,
      status: { $in: ['ELIGIBLE', 'APPROVAL_PENDING', 'APPROVED', 'PARTIALLY_APPROVED'] },
      expiresAt: { $ne: null, $lte: now },
    })
      .sort({ expiresAt: 1, _id: 1 })
      .limit(boundedLimit)
      .lean()
      .exec() as unknown as AssistanceApplicationRecord[];

    for (const application of applications) {
      try {
        await this.expireApplication(facilityId, application, now);
        result.applicationsExpired += 1;
      } catch {
        result.failures += 1;
      }
    }

    const approvals = await AssistanceApprovalModel.find({
      facilityId,
      status: { $in: ['PENDING', 'APPROVED', 'PARTIALLY_APPROVED'] },
      expiresAt: { $ne: null, $lte: now },
    })
      .sort({ expiresAt: 1, _id: 1 })
      .limit(boundedLimit)
      .lean()
      .exec() as unknown as AssistanceApprovalRecord[];

    for (const approval of approvals) {
      try {
        await this.expireApproval(facilityId, approval, now);
        result.approvalsExpired += 1;
        const released = await this.releaseApprovalReservations(
          facilityId,
          approval._id.toHexString(),
          now,
          boundedLimit,
        );
        result.reservationsExpired += released.released;
        result.failures += released.failures;
      } catch {
        result.failures += 1;
      }
    }

    const expiredReservations = await this.dependencies.reservations.listExpired(
      facilityId,
      now,
      boundedLimit,
    );
    for (const reservation of expiredReservations) {
      try {
        const actor = backgroundActor(
          facilityId,
          `welfare-zakat-reservation-expiry:${reservation._id.toHexString()}:${reservation.version}`,
        );
        const [fund, approval] = await Promise.all([
          AssistanceFundModel.findOne({ _id: reservation.fundId, facilityId }).lean().exec(),
          AssistanceApprovalModel.findOne({ _id: reservation.approvalId, facilityId }).lean().exec(),
        ]);
        if (fund == null || approval == null) {
          result.failures += 1;
          continue;
        }
        await this.dependencies.reservationService.release(
          actor,
          reservation._id.toHexString(),
          `expire-reservation:${reservation._id.toHexString()}:${reservation.version}`,
          {
            expectedVersion: reservation.version,
            expectedFundVersion: Number(fund['version']),
            expectedApprovalVersion: Number(approval['version']),
            amount: null,
            reason: 'Reservation expired automatically at the configured expiry time',
          },
          'EXPIRED',
        );
        result.reservationsExpired += 1;
      } catch {
        result.failures += 1;
      }
    }

    const actor = backgroundActor(
      facilityId,
      `welfare-zakat-reconciliation:${now.toISOString()}`,
    );
    const funds = await AssistanceFundModel.find({ facilityId })
      .select({ _id: 1, version: 1 })
      .sort({ updatedAt: 1, _id: 1 })
      .limit(Math.min(boundedLimit, 100))
      .lean()
      .exec();
    for (const fund of funds) {
      try {
        await this.dependencies.reconciliationService.reconcileFund(
          actor,
          fund._id.toHexString(),
          `auto-reconcile-fund:${fund._id.toHexString()}:${now.toISOString().slice(0, 13)}`,
          now,
        );
        result.fundsReconciled += 1;
      } catch {
        result.failures += 1;
      }
    }

    const allocations = await AssistanceAllocationModel.find({
      facilityId,
      status: { $in: ['PARTIALLY_UTILIZED', 'UTILIZED', 'PARTIALLY_REVERSED', 'RECOVERY_PENDING'] },
    })
      .select({ _id: 1 })
      .sort({ updatedAt: 1, _id: 1 })
      .limit(Math.min(boundedLimit, 100))
      .lean()
      .exec();
    for (const allocation of allocations) {
      try {
        await this.dependencies.reconciliationService.reconcileAllocation(
          actor,
          allocation._id.toHexString(),
          `auto-reconcile-allocation:${allocation._id.toHexString()}:${now.toISOString().slice(0, 13)}`,
        );
        result.allocationsReconciled += 1;
      } catch {
        result.failures += 1;
      }
    }

    return result;
  }

  private async releaseApprovalReservations(
    facilityId: string,
    approvalId: string,
    expiredAt: Date,
    limit: number,
  ): Promise<Readonly<{ released: number; failures: number }>> {
    const reservations = await AssistanceReservationModel.find({
      facilityId,
      approvalId,
      status: { $in: ['ACTIVE', 'PARTIALLY_CONSUMED'] },
    })
      .sort({ expiresAt: 1, _id: 1 })
      .limit(limit)
      .lean()
      .exec() as unknown as AssistanceReservationRecord[];
    let released = 0;
    let failures = 0;

    for (const reservation of reservations) {
      if (decimal128ToString(reservation.remainingAmount) === '0.00') continue;
      try {
        const actor = backgroundActor(
          facilityId,
          `welfare-zakat-approval-reservation-release:${reservation._id.toHexString()}:${reservation.version}`,
        );
        const [fund, approval] = await Promise.all([
          AssistanceFundModel.findOne({
            _id: reservation.fundId,
            facilityId,
          }).select({ version: 1 }).lean().exec(),
          AssistanceApprovalModel.findOne({
            _id: reservation.approvalId,
            facilityId,
          }).select({ version: 1 }).lean().exec(),
        ]);
        if (fund == null || approval == null) {
          failures += 1;
          continue;
        }
        await this.dependencies.reservationService.release(
          actor,
          reservation._id.toHexString(),
          `release-expired-approval-reservation:${reservation._id.toHexString()}:${reservation.version}`,
          {
            expectedVersion: reservation.version,
            expectedFundVersion: Number(fund['version']),
            expectedApprovalVersion: Number(approval['version']),
            amount: null,
            reason: `Unused reservation released because approval expired at ${expiredAt.toISOString()}`,
          },
          'EXPIRED',
        );
        released += 1;
      } catch {
        failures += 1;
      }
    }

    return { released, failures };
  }

  private async expireApplication(
    facilityId: string,
    application: AssistanceApplicationRecord,
    expiredAt: Date,
  ): Promise<void> {
    const actor = backgroundActor(
      facilityId,
      `welfare-zakat-application-expiry:${application._id.toHexString()}:${application.version}`,
    );
    await this.dependencies.transactionManager.execute({
      transactionType: 'EXPIRE_ASSISTANCE_APPLICATION',
      idempotencyKey: `expire-application:${application._id.toHexString()}:${application.version}`,
      actorUserId: actor.userId,
      facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`welfare-zakat:application:${facilityId}:${application._id.toHexString()}`],
      idempotencyPayload: { applicationId: application._id.toHexString(), expiredAt },
      journalPayload: { applicationId: application._id.toHexString(), fromStatus: application.status },
      execute: async (transaction) => {
        const current = await this.dependencies.applications.findById(
          facilityId,
          application._id.toHexString(),
          transaction.session,
        );
        if (current == null || current.expiresAt == null || current.expiresAt > expiredAt) return;
        const updated = await this.dependencies.applications.transition({
          actor,
          applicationId: current._id.toHexString(),
          expectedVersion: current.version,
          fromStatus: current.status,
          toStatus: 'EXPIRED',
          reason: 'Application expired automatically after its configured validity period',
          occurredAt: expiredAt,
          updates: { expiresAt: expiredAt },
          transaction,
        });
        if (updated == null) throw new AssistanceVersionConflictError();
        const snapshot = projectAssistanceApplication(updated);
        const snapshotHash = stableAssistancePayloadHash(snapshot);
        await this.dependencies.applicationHistories.append({
          actor,
          application: updated,
          fromStatus: current.status,
          toStatus: 'EXPIRED',
          reason: 'Application expired automatically after its configured validity period',
          snapshot: snapshot as unknown as Readonly<Record<string, unknown>>,
          snapshotHash,
          immutableHash: stableAssistancePayloadHash({
            applicationId: updated._id.toHexString(),
            applicationVersion: updated.version,
            fromStatus: current.status,
            toStatus: 'EXPIRED',
            snapshotHash,
            transactionId: transaction.transactionId,
          }),
          occurredAt: expiredAt,
          transaction,
        });
        await this.dependencies.audit.record({
          actor,
          action: 'ASSISTANCE_APPLICATION_EXPIRED',
          entityType: 'AssistanceApplication',
          entityId: updated._id.toHexString(),
          reason: 'Configured application validity period elapsed',
          before: projectAssistanceApplication(current),
          after: snapshot,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.dependencies.outbox.enqueue({
          facilityId,
          eventType: 'welfare_zakat.application.expired',
          aggregateType: 'AssistanceApplication',
          aggregateId: updated._id.toHexString(),
          payload: safeWelfareZakatRealtimePayload({
            applicationId: updated._id.toHexString(),
            status: updated.status,
            previousStatus: current.status,
            version: updated.version,
            eventAt: expiredAt.toISOString(),
          }),
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
      },
    });
  }

  private async expireApproval(
    facilityId: string,
    approval: AssistanceApprovalRecord,
    expiredAt: Date,
  ): Promise<void> {
    const actor = backgroundActor(
      facilityId,
      `welfare-zakat-approval-expiry:${approval._id.toHexString()}:${approval.version}`,
    );
    await this.dependencies.transactionManager.execute({
      transactionType: 'EXPIRE_ASSISTANCE_APPROVAL',
      idempotencyKey: `expire-approval:${approval._id.toHexString()}:${approval.version}`,
      actorUserId: actor.userId,
      facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`welfare-zakat:approval:${facilityId}:${approval._id.toHexString()}`],
      idempotencyPayload: { approvalId: approval._id.toHexString(), expiredAt },
      journalPayload: { approvalId: approval._id.toHexString(), fromStatus: approval.status },
      execute: async (transaction) => {
        const current = await this.dependencies.approvals.findById(
          facilityId,
          approval._id.toHexString(),
          transaction.session,
        );
        if (current == null || current.expiresAt == null || current.expiresAt > expiredAt) return;
        const updated = await this.dependencies.approvals.expire({
          facilityId,
          approvalId: current._id.toHexString(),
          expectedVersion: current.version,
          expiredAt,
          actorUserId: actor.userId,
          transaction,
        });
        if (updated == null) throw new AssistanceVersionConflictError();
        await this.dependencies.approvalHistories.append({
          actor,
          approval: updated,
          fromStatus: current.status,
          toStatus: 'EXPIRED',
          checkerUserId: null,
          reason: 'Approval expired automatically after its approved period',
          occurredAt: expiredAt,
          immutableHash: stableAssistancePayloadHash({
            approvalId: updated._id.toHexString(),
            approvalVersion: updated.version,
            fromStatus: current.status,
            toStatus: 'EXPIRED',
            transactionId: transaction.transactionId,
          }),
          transaction,
        });
        await this.dependencies.audit.record({
          actor,
          action: 'ASSISTANCE_APPROVAL_EXPIRED',
          entityType: 'AssistanceApproval',
          entityId: updated._id.toHexString(),
          reason: 'Approved validity period elapsed',
          before: projectAssistanceApproval(current),
          after: projectAssistanceApproval(updated),
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.dependencies.outbox.enqueue({
          facilityId,
          eventType: 'welfare_zakat.approval.expired',
          aggregateType: 'AssistanceApproval',
          aggregateId: updated._id.toHexString(),
          payload: safeWelfareZakatRealtimePayload({
            approvalId: updated._id.toHexString(),
            status: updated.status,
            previousStatus: current.status,
            version: updated.version,
            eventAt: expiredAt.toISOString(),
          }),
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
      },
    });
  }
}