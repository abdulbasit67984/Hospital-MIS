import Decimal from 'decimal.js';

import {
  CoverageBenefitBalanceModel,
  CoverageDeterminationModel,
  CoverageUtilizationModel,
  CoverageOperationalHistoryModel,
  DiagnosticPanelItemModel,
  DiagnosticPanelModel,
  DiagnosticPanelVersionModel,
  PackageEnrollmentBalanceModel,
  PackageUtilizationModel,
  PanelPlanModel,
  TreatmentPackageItemModel,
  TreatmentPackageModel,
  TreatmentPackageVersionModel,
  decimal128,
  decimal128ToString,
  toObjectId,
} from '@hospital-mis/database';

import {
  PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS,
} from '../panels-packages-coverage.constants.js';

import type {
  PanelsPackagesCoverageActorContext,
} from '../panels-packages-coverage.contracts.js';

import {
  CoverageDeterminationNotFoundError,
  PpcConcurrencyConflictError,
  PpcInvalidFinancialAllocationError,
  PpcMakerCheckerViolationError,
} from '../panels-packages-coverage.errors.js';

import type {
  PpcAccessPolicyPort,
  PpcAuditPort,
  PpcOutboxPort,
  PpcTransactionManagerPort,
} from '../panels-packages-coverage.ports.js';

import type {
  MongoUnifiedBillingCoverageAdapter,
} from './unified-billing-coverage.adapter.js';

export interface OverrideCoverageInput {
  expectedVersion: number;
  expectedInvoiceVersion: number;
  sponsorAmount: string;
  patientAmount: string;
  authorizationReference: string;
  reason: string;
}

export interface ReverseCoverageInput {
  expectedVersion: number;
  expectedInvoiceVersion: number;
  reason: string;
}

export interface ApplyCoverageRefundEffectsInput {
  refundId: string;
  invoiceId: string;
  packageUtilizationIds: readonly string[];
  coverageUtilizationIds: readonly string[];
  reason: string;
}

export interface MasterStatusInput {
  expectedVersion: number;
  status: string;
  reason: string;
}

export class CoverageFinancialControlService {
  public constructor(
    private readonly dependencies: Readonly<{
      accessPolicy: PpcAccessPolicyPort;
      transactionManager: PpcTransactionManagerPort;
      audit: PpcAuditPort;
      outbox: PpcOutboxPort;
      billing: MongoUnifiedBillingCoverageAdapter;
    }>,
  ) {}

  public async changePanelStatus(
    actor: PanelsPackagesCoverageActorContext,
    panelId: string,
    idempotencyKey: string,
    input: MasterStatusInput,
  ) {
    await this.require(
      actor,
      PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS.PANEL_ACTIVATE,
    );

    return this.dependencies.transactionManager.execute({
      transactionType: 'CHANGE_DIAGNOSTIC_PANEL_STATUS',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `ppc:panel:${actor.facilityId}:${panelId}`,
      ],
      idempotencyPayload: input,
      journalPayload: { panelId, status: input.status },
      execute: async (transaction) => {
        const current = await DiagnosticPanelModel.findOne({
          _id: toObjectId(panelId, 'panelId'),
          facilityId: toObjectId(actor.facilityId, 'facilityId'),
        }).session(transaction.session).lean().exec();

        if (current === null) {
          throw new Error('Diagnostic panel was not found');
        }

        if (
          input.status === 'ACTIVE' &&
          current.createdBy.toHexString() === actor.userId
        ) {
          throw new PpcMakerCheckerViolationError();
        }

        const items = await DiagnosticPanelItemModel.find({
          facilityId: current.facilityId,
          diagnosticPanelId: current._id,
        }).sort({ lineNumber: 1 }).session(transaction.session).lean().exec();

        await DiagnosticPanelVersionModel.create(
          [{
            facilityId: current.facilityId,
            transactionId: transaction.transactionId,
            correlationId: actor.correlationId,
            schemaVersion: 1,
            version: 0,
            createdBy: toObjectId(actor.userId, 'createdBy'),
            updatedBy: toObjectId(actor.userId, 'updatedBy'),
            diagnosticPanelId: current._id,
            versionNumber: current.currentVersion,
            snapshot: current,
            itemSnapshots: items,
            changeReason: input.reason,
            supersedesVersionId: null,
          }],
          { session: transaction.session },
        );

        const now = new Date();
        const updated = await DiagnosticPanelModel.findOneAndUpdate(
          {
            _id: current._id,
            facilityId: current.facilityId,
            version: input.expectedVersion,
          },
          {
            $set: {
              status: input.status,
              activatedAt:
                input.status === 'ACTIVE' ? now : current.activatedAt,
              activatedBy:
                input.status === 'ACTIVE'
                  ? toObjectId(actor.userId, 'activatedBy')
                  : current.activatedBy,
              suspendedAt:
                input.status === 'SUSPENDED' ? now : null,
              suspendedBy:
                input.status === 'SUSPENDED'
                  ? toObjectId(actor.userId, 'suspendedBy')
                  : null,
              suspensionReason:
                input.status === 'SUSPENDED' ? input.reason : null,
              retiredAt:
                input.status === 'RETIRED' ? now : null,
              retiredBy:
                input.status === 'RETIRED'
                  ? toObjectId(actor.userId, 'retiredBy')
                  : null,
              retirementReason:
                input.status === 'RETIRED' ? input.reason : null,
              updatedBy: toObjectId(actor.userId, 'updatedBy'),
              transactionId: transaction.transactionId,
            },
            $inc: {
              version: 1,
              currentVersion: 1,
            },
          },
          {
            new: true,
            runValidators: true,
            session: transaction.session,
          },
        ).lean().exec();

        if (updated === null) {
          throw new PpcConcurrencyConflictError();
        }

        await this.recordMasterChange(
          actor,
          transaction,
          'DiagnosticPanel',
          panelId,
          current,
          updated,
          input.reason,
        );

        return {
          panelId,
          status: updated.status,
          version: updated.version,
          currentVersion: updated.currentVersion,
        };
      },
    });
  }

  public async changePackageStatus(
    actor: PanelsPackagesCoverageActorContext,
    packageId: string,
    idempotencyKey: string,
    input: MasterStatusInput,
  ) {
    await this.require(
      actor,
      PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS.PACKAGE_ACTIVATE,
    );

    return this.dependencies.transactionManager.execute({
      transactionType: 'CHANGE_TREATMENT_PACKAGE_STATUS',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `ppc:package:${actor.facilityId}:${packageId}`,
      ],
      idempotencyPayload: input,
      journalPayload: { packageId, status: input.status },
      execute: async (transaction) => {
        const current = await TreatmentPackageModel.findOne({
          _id: toObjectId(packageId, 'packageId'),
          facilityId: toObjectId(actor.facilityId, 'facilityId'),
        }).session(transaction.session).lean().exec();

        if (current === null) {
          throw new Error('Treatment package was not found');
        }

        if (
          input.status === 'ACTIVE' &&
          current.createdBy.toHexString() === actor.userId
        ) {
          throw new PpcMakerCheckerViolationError();
        }

        const items = await TreatmentPackageItemModel.find({
          facilityId: current.facilityId,
          treatmentPackageId: current._id,
        }).sort({ lineNumber: 1 }).session(transaction.session).lean().exec();

        await TreatmentPackageVersionModel.create(
          [{
            facilityId: current.facilityId,
            transactionId: transaction.transactionId,
            correlationId: actor.correlationId,
            schemaVersion: 1,
            version: 0,
            createdBy: toObjectId(actor.userId, 'createdBy'),
            updatedBy: toObjectId(actor.userId, 'updatedBy'),
            treatmentPackageId: current._id,
            versionNumber: current.currentVersion ?? 1,
            packageSnapshot: current,
            itemSnapshots: items,
            changeReason: input.reason,
          }],
          { session: transaction.session },
        );

        const updated = await TreatmentPackageModel.findOneAndUpdate(
          {
            _id: current._id,
            facilityId: current.facilityId,
            version: input.expectedVersion,
          },
          {
            $set: {
              status: input.status,
              updatedBy: toObjectId(actor.userId, 'updatedBy'),
              transactionId: transaction.transactionId,
            },
            $inc: {
              version: 1,
              currentVersion: 1,
            },
          },
          {
            new: true,
            runValidators: true,
            session: transaction.session,
          },
        ).lean().exec();

        if (updated === null) {
          throw new PpcConcurrencyConflictError();
        }

        await this.recordMasterChange(
          actor,
          transaction,
          'TreatmentPackage',
          packageId,
          current,
          updated,
          input.reason,
        );

        return {
          packageId,
          status: updated.status,
          version: updated.version,
          currentVersion: updated.currentVersion,
        };
      },
    });
  }

  public async changeCoveragePlanStatus(
    actor: PanelsPackagesCoverageActorContext,
    planId: string,
    idempotencyKey: string,
    input: MasterStatusInput,
  ) {
    await this.require(
      actor,
      PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS.COVERAGE_ACTIVATE,
    );

    return this.dependencies.transactionManager.execute({
      transactionType: 'CHANGE_COVERAGE_PLAN_STATUS',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `ppc:coverage-plan:${actor.facilityId}:${planId}`,
      ],
      idempotencyPayload: input,
      journalPayload: { planId, status: input.status },
      execute: async (transaction) => {
        const current = await PanelPlanModel.findOne({
          _id: toObjectId(planId, 'planId'),
          facilityId: toObjectId(actor.facilityId, 'facilityId'),
        }).session(transaction.session).lean().exec();

        if (current === null) {
          throw new Error('Coverage plan was not found');
        }

        if (
          input.status === 'ACTIVE' &&
          current.createdBy.toHexString() === actor.userId
        ) {
          throw new PpcMakerCheckerViolationError();
        }

        const updated = await PanelPlanModel.findOneAndUpdate(
          {
            _id: current._id,
            facilityId: current.facilityId,
            version: input.expectedVersion,
          },
          {
            $set: {
              status: input.status,
              updatedBy: toObjectId(actor.userId, 'updatedBy'),
              transactionId: transaction.transactionId,
            },
            $inc: {
              version: 1,
              currentVersion: 1,
            },
          },
          {
            new: true,
            runValidators: true,
            session: transaction.session,
          },
        ).lean().exec();

        if (updated === null) {
          throw new PpcConcurrencyConflictError();
        }

        await CoverageOperationalHistoryModel.create(
          [{
            facilityId: current.facilityId,
            transactionId: transaction.transactionId,
            correlationId: actor.correlationId,
            schemaVersion: 1,
            version: 0,
            createdBy: toObjectId(actor.userId, 'createdBy'),
            updatedBy: toObjectId(actor.userId, 'updatedBy'),
            action:
              input.status === 'ACTIVE'
                ? 'ACTIVATED'
                : input.status === 'SUSPENDED'
                  ? 'SUSPENDED'
                  : 'EXPIRED',
            entityType: 'PanelPlan',
            entityId: current._id,
            patientId: null,
            invoiceId: null,
            beforeSnapshot: current,
            afterSnapshot: updated,
            reason: input.reason,
          }],
          { session: transaction.session },
        );

        await this.recordMasterChange(
          actor,
          transaction,
          'PanelPlan',
          planId,
          current,
          updated,
          input.reason,
        );

        return {
          planId,
          status: updated.status,
          version: updated.version,
          currentVersion: updated.currentVersion,
        };
      },
    });
  }

  public async overrideDetermination(
    actor: PanelsPackagesCoverageActorContext,
    determinationId: string,
    idempotencyKey: string,
    input: OverrideCoverageInput,
  ) {
    await this.require(
      actor,
      PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS.COVERAGE_OVERRIDE,
    );

    return this.dependencies.transactionManager.execute({
      transactionType: 'OVERRIDE_COVERAGE_DETERMINATION',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `ppc:determination:${actor.facilityId}:${determinationId}`,
      ],
      idempotencyPayload: input,
      journalPayload: {
        determinationId,
      },
      execute: async (transaction) => {
        const existing = await CoverageDeterminationModel.findOne({
          _id: toObjectId(determinationId, 'determinationId'),
          facilityId: toObjectId(actor.facilityId, 'facilityId'),
        }).session(transaction.session).lean().exec();

        if (existing === null) {
          throw new CoverageDeterminationNotFoundError();
        }

        if (existing.createdBy.toHexString() === actor.userId) {
          throw new PpcMakerCheckerViolationError();
        }

        const packageAmount = new Decimal(
          decimal128ToString(existing.packageAmount),
        );
        const grossAmount = new Decimal(
          decimal128ToString(existing.grossAmount),
        );
        const sponsorAmount = new Decimal(input.sponsorAmount);
        const patientAmount = new Decimal(input.patientAmount);

        if (
          !packageAmount
            .plus(sponsorAmount)
            .plus(patientAmount)
            .equals(grossAmount)
        ) {
          throw new PpcInvalidFinancialAllocationError();
        }

        const nonPackageGross = grossAmount.minus(packageAmount);
        const allocations = existing.allocations.map(
          (allocation) => {
            const eligible = new Decimal(
              decimal128ToString(allocation.grossAmount),
            ).minus(
              decimal128ToString(allocation.packageAmount),
            );
            const ratio = nonPackageGross.isZero()
              ? new Decimal(0)
              : eligible.div(nonPackageGross);
            const lineSponsor = sponsorAmount
              .mul(ratio)
              .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
            const linePatient = eligible.minus(lineSponsor);

            return {
              ...allocation,
              sponsorAmount: decimal128(
                lineSponsor.toFixed(2),
              ),
              patientAmount: decimal128(
                linePatient.toFixed(2),
              ),
              deniedAmount: decimal128('0.00'),
              denialReason: null,
            };
          },
        );

        const updated =
          await CoverageDeterminationModel.findOneAndUpdate(
            {
              _id: existing._id,
              facilityId: existing.facilityId,
              version: input.expectedVersion,
            },
            {
              $set: {
                status: 'OVERRIDDEN',
                sponsorAmount: decimal128(
                  sponsorAmount.toFixed(2),
                ),
                patientAmount: decimal128(
                  patientAmount.toFixed(2),
                ),
                allocations,
                overriddenAt: new Date(),
                overriddenBy: toObjectId(
                  actor.userId,
                  'overriddenBy',
                ),
                overrideAuthorizationReference:
                  input.authorizationReference,
                overrideReason: input.reason,
                updatedBy: toObjectId(actor.userId, 'updatedBy'),
                transactionId: transaction.transactionId,
              },
              $inc: {
                version: 1,
              },
            },
            {
              new: true,
              runValidators: true,
              session: transaction.session,
            },
          ).lean().exec();

        if (updated === null) {
          throw new PpcConcurrencyConflictError();
        }

        await this.dependencies.billing.applyOverride({
          actorUserId: actor.userId,
          facilityId: actor.facilityId,
          invoiceId: updated.invoiceId.toHexString(),
          determinationId,
          expectedInvoiceVersion: input.expectedInvoiceVersion,
        });

        await this.dependencies.audit.record({
          actor,
          action: 'OVERRIDE_COVERAGE_DETERMINATION',
          entityType: 'CoverageDetermination',
          entityId: determinationId,
          reason: input.reason,
          before: existing,
          after: updated,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });

        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType:
            'panels-packages-coverage.coverage.overridden',
          aggregateType: 'CoverageDetermination',
          aggregateId: determinationId,
          payload: {
            determinationId,
            invoiceId: updated.invoiceId.toHexString(),
            status: updated.status,
          },
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });

        return {
          determinationId,
          status: updated.status,
          version: updated.version,
        };
      },
    });
  }

  public async reverseDetermination(
    actor: PanelsPackagesCoverageActorContext,
    determinationId: string,
    idempotencyKey: string,
    input: ReverseCoverageInput,
  ) {
    await this.require(
      actor,
      PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS.COVERAGE_OVERRIDE,
    );

    return this.dependencies.transactionManager.execute({
      transactionType: 'REVERSE_COVERAGE_DETERMINATION',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `ppc:determination:${actor.facilityId}:${determinationId}`,
      ],
      idempotencyPayload: input,
      journalPayload: {
        determinationId,
      },
      execute: async (transaction) => {
        const existing = await CoverageDeterminationModel.findOne({
          _id: toObjectId(determinationId, 'determinationId'),
          facilityId: toObjectId(actor.facilityId, 'facilityId'),
        }).session(transaction.session).lean().exec();

        if (existing === null) {
          throw new CoverageDeterminationNotFoundError();
        }

        if (existing.createdBy.toHexString() === actor.userId) {
          throw new PpcMakerCheckerViolationError();
        }

        const updated =
          await CoverageDeterminationModel.findOneAndUpdate(
            {
              _id: existing._id,
              facilityId: existing.facilityId,
              version: input.expectedVersion,
              status: {
                $ne: 'REVERSED',
              },
            },
            {
              $set: {
                status: 'REVERSED',
                reversedAt: new Date(),
                reversedBy: toObjectId(
                  actor.userId,
                  'reversedBy',
                ),
                reversalReason: input.reason,
                updatedBy: toObjectId(actor.userId, 'updatedBy'),
                transactionId: transaction.transactionId,
              },
              $inc: {
                version: 1,
              },
            },
            {
              new: true,
              runValidators: true,
              session: transaction.session,
            },
          ).lean().exec();

        if (updated === null) {
          throw new PpcConcurrencyConflictError();
        }

        await this.dependencies.billing.reverseDetermination({
          actorUserId: actor.userId,
          facilityId: actor.facilityId,
          invoiceId: updated.invoiceId.toHexString(),
          expectedInvoiceVersion: input.expectedInvoiceVersion,
        });

        await this.dependencies.audit.record({
          actor,
          action: 'REVERSE_COVERAGE_DETERMINATION',
          entityType: 'CoverageDetermination',
          entityId: determinationId,
          reason: input.reason,
          before: existing,
          after: updated,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });

        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType:
            'panels-packages-coverage.coverage.reversed',
          aggregateType: 'CoverageDetermination',
          aggregateId: determinationId,
          payload: {
            determinationId,
            invoiceId: updated.invoiceId.toHexString(),
            status: updated.status,
          },
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });

        return {
          determinationId,
          status: updated.status,
          version: updated.version,
        };
      },
    });
  }

  public async applyRefundEffects(
    actor: PanelsPackagesCoverageActorContext,
    idempotencyKey: string,
    input: ApplyCoverageRefundEffectsInput,
  ) {
    await this.require(
      actor,
      PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS.PACKAGE_REVERSE,
    );

    return this.dependencies.transactionManager.execute({
      transactionType: 'APPLY_PPC_REFUND_EFFECTS',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `payments:refund:${actor.facilityId}:${input.refundId}`,
        `billing:invoice:${actor.facilityId}:${input.invoiceId}`,
      ],
      idempotencyPayload: input,
      journalPayload: {
        refundId: input.refundId,
        invoiceId: input.invoiceId,
      },
      execute: async (transaction) => {
        let packageReversals = 0;
        let coverageReversals = 0;

        for (const utilizationId of input.packageUtilizationIds) {
          const utilization = await PackageUtilizationModel.findOne({
            _id: toObjectId(
              utilizationId,
              'packageUtilizationId',
            ),
            facilityId: toObjectId(
              actor.facilityId,
              'facilityId',
            ),
            status: {
              $in: ['RESERVED', 'CONSUMED'],
            },
          }).session(transaction.session).lean().exec();

          if (utilization === null) {
            continue;
          }

          const balance =
            await PackageEnrollmentBalanceModel.findOne({
              facilityId: utilization.facilityId,
              packageEnrollmentId:
                utilization.packageEnrollmentId,
              treatmentPackageItemId:
                utilization.treatmentPackageItemId,
            }).session(transaction.session).lean().exec();

          if (balance === null) {
            throw new Error(
              'Package balance was not found for refund reversal',
            );
          }

          await PackageUtilizationModel.updateOne(
            {
              _id: utilization._id,
              version: utilization.version,
            },
            {
              $set: {
                status: 'REVERSED',
                refundId: toObjectId(input.refundId, 'refundId'),
                reversedAt: new Date(),
                reversedBy: toObjectId(
                  actor.userId,
                  'reversedBy',
                ),
                reversalReason: input.reason,
                updatedBy: toObjectId(
                  actor.userId,
                  'updatedBy',
                ),
                transactionId: transaction.transactionId,
              },
              $inc: {
                version: 1,
              },
            },
            {
              session: transaction.session,
              runValidators: true,
            },
          );

          await PackageEnrollmentBalanceModel.updateOne(
            {
              _id: balance._id,
              version: balance.version,
            },
            {
              $inc: {
                reversedQuantity: utilization.consumedQuantity,
                reversedAmount:
                  utilization.packageAllocatedAmount,
                version: 1,
              },
              $set: {
                updatedBy: toObjectId(
                  actor.userId,
                  'updatedBy',
                ),
                transactionId: transaction.transactionId,
              },
            },
            {
              session: transaction.session,
              runValidators: true,
            },
          );

          packageReversals += 1;
        }

        for (const utilizationId of input.coverageUtilizationIds) {
          const utilization = await CoverageUtilizationModel.findOne({
            _id: toObjectId(
              utilizationId,
              'coverageUtilizationId',
            ),
            facilityId: toObjectId(
              actor.facilityId,
              'facilityId',
            ),
            status: {
              $in: ['RESERVED', 'CONSUMED'],
            },
          }).session(transaction.session).lean().exec();

          if (utilization === null) {
            continue;
          }

          const balance =
            await CoverageBenefitBalanceModel.findOne({
              _id: utilization.coverageBenefitBalanceId,
              facilityId: utilization.facilityId,
            }).session(transaction.session).lean().exec();

          if (balance === null) {
            throw new Error(
              'Coverage benefit balance was not found for refund reversal',
            );
          }

          await CoverageUtilizationModel.updateOne(
            {
              _id: utilization._id,
              version: utilization.version,
            },
            {
              $set: {
                status: 'REVERSED',
                refundId: toObjectId(input.refundId, 'refundId'),
                reversedAt: new Date(),
                reversedBy: toObjectId(
                  actor.userId,
                  'reversedBy',
                ),
                reversalReason: input.reason,
                updatedBy: toObjectId(
                  actor.userId,
                  'updatedBy',
                ),
                transactionId: transaction.transactionId,
              },
              $inc: {
                version: 1,
              },
            },
            {
              session: transaction.session,
              runValidators: true,
            },
          );

          await CoverageBenefitBalanceModel.updateOne(
            {
              _id: balance._id,
              version: balance.version,
            },
            {
              $inc: {
                reversedQuantity: utilization.quantity,
                reversedAmount: utilization.sponsorAmount,
                version: 1,
              },
              $set: {
                updatedBy: toObjectId(
                  actor.userId,
                  'updatedBy',
                ),
                transactionId: transaction.transactionId,
              },
            },
            {
              session: transaction.session,
              runValidators: true,
            },
          );

          coverageReversals += 1;
        }

        await this.dependencies.audit.record({
          actor,
          action: 'APPLY_PPC_REFUND_EFFECTS',
          entityType: 'Refund',
          entityId: input.refundId,
          reason: input.reason,
          before: null,
          after: {
            invoiceId: input.invoiceId,
            packageReversals,
            coverageReversals,
          },
          transactionId: transaction.transactionId,
          session: transaction.session,
        });

        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType:
            'panels-packages-coverage.refund.effects_applied',
          aggregateType: 'Refund',
          aggregateId: input.refundId,
          payload: {
            refundId: input.refundId,
            invoiceId: input.invoiceId,
            packageReversals,
            coverageReversals,
          },
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });

        return {
          refundId: input.refundId,
          invoiceId: input.invoiceId,
          packageReversals,
          coverageReversals,
        };
      },
    });
  }

  private async recordMasterChange(
    actor: PanelsPackagesCoverageActorContext,
    transaction: Readonly<{
      transactionId: string;
      session: import('../panels-packages-coverage.persistence.types.js').PpcMongoSession;
    }>,
    entityType: string,
    entityId: string,
    before: unknown,
    after: Readonly<{ status: string }>,
    reason: string,
  ): Promise<void> {
    await this.dependencies.audit.record({
      actor,
      action: `CHANGE_${entityType.toUpperCase()}_STATUS`,
      entityType,
      entityId,
      reason,
      before,
      after,
      transactionId: transaction.transactionId,
      session: transaction.session,
    });

    await this.dependencies.outbox.enqueue({
      facilityId: actor.facilityId,
      eventType:
        `panels-packages-coverage.${entityType.toLowerCase()}.status_changed`,
      aggregateType: entityType,
      aggregateId: entityId,
      payload: {
        entityId,
        status: after.status,
      },
      correlationId: actor.correlationId,
      transactionId: transaction.transactionId,
      session: transaction.session,
    });
  }

  private async require(
    actor: PanelsPackagesCoverageActorContext,
    permission: string,
  ): Promise<void> {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      permission,
    });

    if (!decision.allowed) {
      throw new Error(
        decision.denialReason ??
          'Financial coverage access denied',
      );
    }
  }
}