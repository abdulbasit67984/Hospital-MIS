import Decimal from 'decimal.js';

import {
  PANELS_PACKAGE_COVERAGE_EVENTS,
  PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS,
} from '../panels-packages-coverage.constants.js';

import type {
  CoverageDeterminationView,
  DetermineCoverageInput,
  EstimateCoverageInput,
  PanelsPackagesCoverageActorContext,
} from '../panels-packages-coverage.contracts.js';

import {
  CoverageInactiveError,
  PatientCoverageNotFoundError,
} from '../panels-packages-coverage.errors.js';

import {
  calculateCoverageFinancialAllocation,
} from '../panels-packages-coverage.financial-math.js';

import type {
  PanelPlanRecord,
  PatientCoverageRecord,
} from '../panels-packages-coverage.persistence.types.js';

import type {
  PpcAccessPolicyPort,
  PpcAuditPort,
  PpcOutboxPort,
  PpcTransactionManagerPort,
  UnifiedBillingCoveragePort,
} from '../panels-packages-coverage.ports.js';

import {
  CoverageRuleEvaluatorService,
} from './coverage-rule-evaluator.service.js';

export interface CoverageDeterminationDataPort {
  findCoverages(
    facilityId: string,
    patientId: string,
    coverageIds: readonly string[],
    asOf: Date,
  ): Promise<readonly PatientCoverageRecord[]>;

  findPlans(
    facilityId: string,
    planIds: readonly string[],
  ): Promise<readonly PanelPlanRecord[]>;

  resolveChargeContext(
    facilityId: string,
    invoiceId: string,
    invoiceLineId: string,
  ): Promise<Readonly<{
    departmentId: string | null;
    networkCode: string | null;
  }>>;

  hasValidPreauthorization(
    facilityId: string,
    patientCoverageId: string,
    chargeCatalogItemId: string,
    serviceDate: Date,
  ): Promise<boolean>;

  consumedAmountByRule(
    facilityId: string,
    patientCoverageId: string,
    asOf: Date,
  ): Promise<ReadonlyMap<string, string>>;

  deductibleRemaining(
    facilityId: string,
    patientCoverageId: string,
    asOf: Date,
  ): Promise<string>;

  nextDeterminationNumber(facilityId: string): Promise<string>;

  createDetermination(input: Readonly<{
    actor: PanelsPackagesCoverageActorContext;
    operationKey: string;
    determinationNumber: string;
    estimationId: string | null;
    patientId: string;
    invoiceId: string;
    coverageIds: readonly string[];
    status:
      | 'APPROVED'
      | 'PARTIALLY_APPROVED'
      | 'DENIED';
    asOf: Date;
    grossAmount: string;
    packageAmount: string;
    sponsorAmount: string;
    patientAmount: string;
    allocations: readonly Readonly<Record<string, unknown>>[];
    transactionId: string;
    session: import('../panels-packages-coverage.persistence.types.js').PpcMongoSession;
  }>): Promise<CoverageDeterminationView>;
}

export interface CoverageDeterminationServiceDependencies {
  data: CoverageDeterminationDataPort;
  evaluator: CoverageRuleEvaluatorService;
  accessPolicy: PpcAccessPolicyPort;
  transactionManager: PpcTransactionManagerPort;
  billing: UnifiedBillingCoveragePort;
  audit: PpcAuditPort;
  outbox: PpcOutboxPort;
}

export class CoverageDeterminationService {
  public constructor(
    private readonly dependencies: CoverageDeterminationServiceDependencies,
  ) {}

  public async estimate(
    actor: PanelsPackagesCoverageActorContext,
    input: EstimateCoverageInput,
  ): Promise<Omit<CoverageDeterminationView, 'id' | 'facilityId' | 'version' | 'createdAt' | 'updatedAt'>> {
    await this.requirePermission(
      actor,
      PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS.COVERAGE_ESTIMATE,
    );

    const asOf = new Date(input.asOf);
    const coverages = await this.dependencies.data.findCoverages(
      actor.facilityId,
      input.patientId,
      input.coverageIds,
      asOf,
    );

    if (coverages.length !== input.coverageIds.length) {
      throw new PatientCoverageNotFoundError();
    }

    const planIds = coverages.map((coverage) =>
      coverage.panelPlanId.toHexString(),
    );
    const plans = await this.dependencies.data.findPlans(
      actor.facilityId,
      planIds,
    );
    const planById = new Map(
      plans.map((plan) => [plan._id.toHexString(), plan]),
    );

    const lines = [];
    let grossTotal = new Decimal(0);
    let packageTotal = new Decimal(0);
    let sponsorTotal = new Decimal(0);
    let patientTotal = new Decimal(0);

    for (const charge of input.charges) {
      const gross = new Decimal(charge.grossAmount);
      grossTotal = grossTotal.plus(gross);
      packageTotal = packageTotal.plus(charge.packageAllocationAmount);
      let remaining = gross.minus(charge.packageAllocationAmount);
      let lineSponsor = new Decimal(0);
      let linePatient = new Decimal(0);
      let denialReason = null;

      const chargeContext =
        await this.dependencies.data.resolveChargeContext(
          actor.facilityId,
          input.invoiceId,
          charge.invoiceLineId,
        );

      for (const coverage of coverages) {
        if (remaining.lte(0)) {
          break;
        }

        const plan = planById.get(coverage.panelPlanId.toHexString());
        if (plan === undefined) {
          throw new CoverageInactiveError();
        }

        const [preauthorized, consumed, deductibleRemaining] =
          await Promise.all([
            this.dependencies.data.hasValidPreauthorization(
              actor.facilityId,
              coverage._id.toHexString(),
              charge.chargeCatalogItemId,
              new Date(charge.serviceDate),
            ),
            this.dependencies.data.consumedAmountByRule(
              actor.facilityId,
              coverage._id.toHexString(),
              asOf,
            ),
            this.dependencies.data.deductibleRemaining(
              actor.facilityId,
              coverage._id.toHexString(),
              asOf,
            ),
          ]);

        const evaluation = this.dependencies.evaluator.evaluate({
          coverage,
          plan,
          charge: {
            ...charge,
            grossAmount: remaining.toFixed(2),
            packageAllocationAmount: '0.00',
          },
          serviceDepartmentId: chargeContext.departmentId,
          networkCode: chargeContext.networkCode,
          hasValidPreauthorization: preauthorized,
          consumedAmountByRule: consumed,
          deductibleRemaining,
        });

        if (!evaluation.covered) {
          denialReason ??= evaluation.denialReason;
          continue;
        }

        const calculated = calculateCoverageFinancialAllocation(
          remaining.toFixed(2),
          '0.00',
          {
            deductibleRemaining: evaluation.deductibleRemaining,
            copaymentAmount: evaluation.copaymentAmount,
            coinsurancePercentage: evaluation.coinsurancePercentage,
            coveragePercentage: evaluation.coveragePercentage,
            benefitRemaining: evaluation.benefitRemaining,
          },
        );

        const sponsor = new Decimal(calculated.sponsorAmount);
        lineSponsor = lineSponsor.plus(sponsor);
        linePatient = linePatient.plus(calculated.patientAmount);
        remaining = Decimal.max(
          0,
          remaining.minus(sponsor).minus(calculated.patientAmount),
        );
      }

      if (remaining.gt(0)) {
        linePatient = linePatient.plus(remaining);
      }

      sponsorTotal = sponsorTotal.plus(lineSponsor);
      patientTotal = patientTotal.plus(linePatient);

      lines.push({
        invoiceLineId: charge.invoiceLineId,
        coverageId:
          coverages[0]?._id.toHexString() ?? null,
        packageEnrollmentId: null,
        grossAmount: gross.toFixed(2),
        packageAmount: charge.packageAllocationAmount,
        deductibleAmount: '0.00',
        copaymentAmount: '0.00',
        coinsuranceAmount: '0.00',
        sponsorAmount: lineSponsor.toFixed(2),
        patientAmount: linePatient.toFixed(2),
        deniedAmount: denialReason === null
          ? '0.00'
          : linePatient.toFixed(2),
        denialReason,
      });
    }

    const status =
      sponsorTotal.isZero()
        ? 'DENIED'
        : patientTotal.isZero()
          ? 'APPROVED'
          : 'PARTIALLY_APPROVED';

    return {
      patientId: input.patientId,
      invoiceId: input.invoiceId,
      status,
      grossAmount: grossTotal.toFixed(2),
      packageAmount: packageTotal.toFixed(2),
      sponsorAmount: sponsorTotal.toFixed(2),
      patientAmount: patientTotal.toFixed(2),
      lines,
    };
  }

  public async determine(
    actor: PanelsPackagesCoverageActorContext,
    expectedInvoiceVersion: number,
    input: DetermineCoverageInput,
  ): Promise<CoverageDeterminationView> {
    await this.requirePermission(
      actor,
      PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS.COVERAGE_DETERMINE,
    );

    const estimate = await this.estimate(actor, input);
    const number =
      await this.dependencies.data.nextDeterminationNumber(
        actor.facilityId,
      );

    return this.dependencies.transactionManager.execute({
      transactionType: 'DETERMINE_COVERAGE',
      idempotencyKey: input.idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `billing:invoice:${actor.facilityId}:${input.invoiceId}`,
        ...input.coverageIds.map(
          (id) => `ppc:coverage-balance:${actor.facilityId}:${id}`,
        ),
      ],
      idempotencyPayload: input,
      journalPayload: {
        invoiceId: input.invoiceId,
        patientId: input.patientId,
      },
      execute: async (transaction) => {
        const determination =
          await this.dependencies.data.createDetermination({
            actor,
            operationKey: input.idempotencyKey,
            determinationNumber: number,
            estimationId: input.estimationId,
            patientId: input.patientId,
            invoiceId: input.invoiceId,
            coverageIds: input.coverageIds,
            status: estimate.status as
              | 'APPROVED'
              | 'PARTIALLY_APPROVED'
              | 'DENIED',
            asOf: new Date(input.asOf),
            grossAmount: estimate.grossAmount,
            packageAmount: estimate.packageAmount,
            sponsorAmount: estimate.sponsorAmount,
            patientAmount: estimate.patientAmount,
            allocations: estimate.lines,
            transactionId: transaction.transactionId,
            session: transaction.session,
          });

        await this.dependencies.billing.applyPackageAndCoverageAllocations({
          actor,
          invoiceId: input.invoiceId,
          determinationId: determination.id,
          expectedInvoiceVersion,
          idempotencyKey: input.idempotencyKey,
        });

        await this.dependencies.audit.record({
          actor,
          action: 'DETERMINE_COVERAGE',
          entityType: 'CoverageDetermination',
          entityId: determination.id,
          reason: null,
          before: null,
          after: {
            determinationId: determination.id,
            invoiceId: input.invoiceId,
            sponsorAmount: determination.sponsorAmount,
            patientAmount: determination.patientAmount,
          },
          transactionId: transaction.transactionId,
          session: transaction.session,
        });

        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType:
            PANELS_PACKAGE_COVERAGE_EVENTS.COVERAGE_DETERMINED,
          aggregateType: 'CoverageDetermination',
          aggregateId: determination.id,
          payload: {
            determinationId: determination.id,
            invoiceId: input.invoiceId,
            status: determination.status,
          },
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });

        return determination;
      },
    });
  }

  private async requirePermission(
    actor: PanelsPackagesCoverageActorContext,
    permission: string,
  ): Promise<void> {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      permission,
    });
    if (!decision.allowed) {
      throw new Error(decision.denialReason ?? 'Coverage access denied');
    }
  }
}