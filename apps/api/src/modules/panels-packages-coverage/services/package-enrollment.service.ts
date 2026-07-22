import Decimal from 'decimal.js';

import {
  PANELS_PACKAGE_COVERAGE_EVENTS,
  PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS,
} from '../panels-packages-coverage.constants.js';

import type {
  EnrollPatientPackageInput,
  PanelsPackagesCoverageActorContext,
  ReservePackageUtilizationInput,
  ReversePackageUtilizationInput,
} from '../panels-packages-coverage.contracts.js';

import {
  PackageBalanceExceededError,
  PackageEnrollmentNotFoundError,
  PackageEligibilityFailedError,
  PpcConcurrencyConflictError,
  PpcImmutableHistoryError,
} from '../panels-packages-coverage.errors.js';

import type {
  PackageCoverageRepositoryPort,
  PpcAccessPolicyPort,
  PpcAuditPort,
  PpcClockPort,
  PpcOutboxPort,
  PpcReferenceDataPort,
  PpcTransactionManagerPort,
} from '../panels-packages-coverage.ports.js';

export interface PackageDefinitionItem {
  id: string;
  included: boolean;
  includedQuantity: string;
  allocationAmount: string;
}

export interface PackageDefinitionSnapshot {
  id: string;
  status: string;
  effectiveFrom: Date;
  effectiveThrough: Date | null;
  eligibility: Readonly<{
    patientCategoryCodes: readonly string[];
    minimumAgeYears: number | null;
    maximumAgeYears: number | null;
    genderCodes: readonly string[];
    admissionRequired: boolean;
    departmentIds: readonly string[];
    payerOrganizationIds: readonly string[];
  }>;
  items: readonly PackageDefinitionItem[];
}

export interface PackagePatientSnapshot {
  patientCategoryCode: string | null;
  ageYears: number | null;
  genderCode: string | null;
  hasActiveAdmission: boolean;
  departmentId: string | null;
  payerOrganizationIds: readonly string[];
}

export interface PackageEnrollmentServiceDependencies {
  packages: PackageCoverageRepositoryPort & Readonly<{
    findDefinition(
      facilityId: string,
      packageId: string,
    ): Promise<PackageDefinitionSnapshot | null>;
    findPatientSnapshot(
      facilityId: string,
      patientId: string,
    ): Promise<PackagePatientSnapshot | null>;
    reserveEnrollmentBalance(input: Readonly<{
      facilityId: string;
      enrollmentId: string;
      chargeCatalogItemId: string;
      quantity: string;
      amount: string;
      expectedVersion: number;
      actorUserId: string;
      transactionId: string;
      session: import('../panels-packages-coverage.persistence.types.js').PpcMongoSession;
    }>): Promise<Readonly<{
      balanceId: string;
      treatmentPackageItemId: string;
      version: number;
    }> | null>;
    createPackageUtilization(input: Readonly<{
      actor: PanelsPackagesCoverageActorContext;
      operationKey: string;
      enrollmentId: string;
      treatmentPackageItemId: string;
      balanceId: string;
      invoiceId: string;
      invoiceLineId: string;
      chargeCatalogItemId: string;
      quantity: string;
      grossAmount: string;
      packageAllocatedAmount: string;
      transactionId: string;
      session: import('../panels-packages-coverage.persistence.types.js').PpcMongoSession;
    }>): Promise<Readonly<{
      id: string;
      version: number;
    }>>;
    reversePackageUtilization(input: Readonly<{
      facilityId: string;
      utilizationId: string;
      expectedVersion: number;
      actorUserId: string;
      reason: string;
      refundId: string | null;
      creditNoteId: string | null;
      transactionId: string;
      session: import('../panels-packages-coverage.persistence.types.js').PpcMongoSession;
    }>): Promise<Readonly<{
      id: string;
      enrollmentId: string;
      balanceId: string;
      quantity: string;
      amount: string;
    }> | null>;
    releaseEnrollmentBalance(input: Readonly<{
      facilityId: string;
      balanceId: string;
      quantity: string;
      amount: string;
      actorUserId: string;
      transactionId: string;
      session: import('../panels-packages-coverage.persistence.types.js').PpcMongoSession;
    }>): Promise<void>;
  }>;
  referenceData: PpcReferenceDataPort;
  accessPolicy: PpcAccessPolicyPort;
  transactionManager: PpcTransactionManagerPort;
  audit: PpcAuditPort;
  outbox: PpcOutboxPort;
  clock: PpcClockPort;
  nextEnrollmentNumber(facilityId: string): Promise<string>;
}

function contains(
  values: readonly string[],
  value: string | null,
): boolean {
  return values.length === 0 || (value !== null && values.includes(value));
}

export class PackageEnrollmentService {
  public constructor(
    private readonly dependencies: PackageEnrollmentServiceDependencies,
  ) {}

  public async enroll(
    actor: PanelsPackagesCoverageActorContext,
    idempotencyKey: string,
    input: EnrollPatientPackageInput,
  ) {
    await this.requirePermission(
      actor,
      PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS.PACKAGE_ENROLL,
    );

    const [definition, patient] = await Promise.all([
      this.dependencies.packages.findDefinition(
        actor.facilityId,
        input.packageId,
      ),
      this.dependencies.packages.findPatientSnapshot(
        actor.facilityId,
        input.patientId,
      ),
    ]);

    if (definition === null) {
      throw new Error('Treatment package was not found');
    }
    if (patient === null) {
      throw new Error('Patient was not found');
    }

    this.assertDefinitionActive(definition, new Date(input.startsAt));
    this.assertEligible(definition, patient);

    const enrollmentNumber =
      await this.dependencies.nextEnrollmentNumber(actor.facilityId);

    return this.dependencies.transactionManager.execute({
      transactionType: 'ENROLL_PATIENT_PACKAGE',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `ppc:package-enrollment:${actor.facilityId}:${input.patientId}:${input.packageId}`,
      ],
      idempotencyPayload: input,
      journalPayload: {
        patientId: input.patientId,
        packageId: input.packageId,
      },
      execute: async (transaction) => {
        const enrollment = await this.dependencies.packages.enroll(
          actor,
          input,
          enrollmentNumber,
          transaction,
        );

        const balances = await this.dependencies.packages.createBalances(
          actor,
          enrollment._id.toHexString(),
          definition.items
            .filter((item) => item.included)
            .map((item) => ({
              treatmentPackageItemId: item.id,
              includedQuantity: item.includedQuantity,
              includedAmount: item.allocationAmount,
            })),
          transaction,
        );

        await this.dependencies.audit.record({
          actor,
          action: 'ENROLL_PATIENT_PACKAGE',
          entityType: 'PackageEnrollment',
          entityId: enrollment._id.toHexString(),
          reason: input.reason,
          before: null,
          after: {
            enrollmentId: enrollment._id.toHexString(),
            packageId: input.packageId,
            patientId: input.patientId,
            balanceCount: balances.length,
          },
          transactionId: transaction.transactionId,
          session: transaction.session,
        });

        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType: PANELS_PACKAGE_COVERAGE_EVENTS.PACKAGE_ENROLLED,
          aggregateType: 'PackageEnrollment',
          aggregateId: enrollment._id.toHexString(),
          payload: {
            enrollmentId: enrollment._id.toHexString(),
            patientId: input.patientId,
            packageId: input.packageId,
            status: enrollment.status,
          },
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });

        return { enrollment, balances };
      },
    });
  }

  public async reserveUtilization(
    actor: PanelsPackagesCoverageActorContext,
    expectedBalanceVersion: number,
    input: ReservePackageUtilizationInput,
  ) {
    await this.requirePermission(
      actor,
      PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS.PACKAGE_ENROLL,
    );

    const enrollment = await this.dependencies.packages.findEnrollment(
      actor.facilityId,
      input.enrollmentId,
    );

    if (enrollment === null) {
      throw new PackageEnrollmentNotFoundError();
    }
    if (enrollment.status !== 'ACTIVE') {
      throw new PpcImmutableHistoryError();
    }

    return this.dependencies.transactionManager.execute({
      transactionType: 'RESERVE_PACKAGE_UTILIZATION',
      idempotencyKey: input.idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `ppc:package-balance:${actor.facilityId}:${input.enrollmentId}:${input.chargeCatalogItemId}`,
        `billing:invoice:${actor.facilityId}:${input.invoiceId}`,
      ],
      idempotencyPayload: input,
      journalPayload: {
        enrollmentId: input.enrollmentId,
        invoiceLineId: input.invoiceLineId,
      },
      execute: async (transaction) => {
        const allocationAmount = new Decimal(input.grossAmount).toFixed(2);
        const reserved =
          await this.dependencies.packages.reserveEnrollmentBalance({
            facilityId: actor.facilityId,
            enrollmentId: input.enrollmentId,
            chargeCatalogItemId: input.chargeCatalogItemId,
            quantity: input.quantity,
            amount: allocationAmount,
            expectedVersion: expectedBalanceVersion,
            actorUserId: actor.userId,
            transactionId: transaction.transactionId,
            session: transaction.session,
          });

        if (reserved === null) {
          throw new PackageBalanceExceededError();
        }

        const utilization =
          await this.dependencies.packages.createPackageUtilization({
            actor,
            operationKey: input.idempotencyKey,
            enrollmentId: input.enrollmentId,
            treatmentPackageItemId: reserved.treatmentPackageItemId,
            balanceId: reserved.balanceId,
            invoiceId: input.invoiceId,
            invoiceLineId: input.invoiceLineId,
            chargeCatalogItemId: input.chargeCatalogItemId,
            quantity: input.quantity,
            grossAmount: input.grossAmount,
            packageAllocatedAmount: allocationAmount,
            transactionId: transaction.transactionId,
            session: transaction.session,
          });

        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType: PANELS_PACKAGE_COVERAGE_EVENTS.PACKAGE_UTILIZED,
          aggregateType: 'PackageUtilization',
          aggregateId: utilization.id,
          payload: {
            utilizationId: utilization.id,
            enrollmentId: input.enrollmentId,
            invoiceId: input.invoiceId,
            invoiceLineId: input.invoiceLineId,
          },
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });

        return utilization;
      },
    });
  }

  public async reverseUtilization(
    actor: PanelsPackagesCoverageActorContext,
    utilizationId: string,
    idempotencyKey: string,
    input: ReversePackageUtilizationInput,
  ) {
    await this.requirePermission(
      actor,
      PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS.PACKAGE_REVERSE,
    );

    return this.dependencies.transactionManager.execute({
      transactionType: 'REVERSE_PACKAGE_UTILIZATION',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `ppc:package-utilization:${actor.facilityId}:${utilizationId}`,
      ],
      idempotencyPayload: input,
      journalPayload: { utilizationId },
      execute: async (transaction) => {
        const reversed =
          await this.dependencies.packages.reversePackageUtilization({
            facilityId: actor.facilityId,
            utilizationId,
            expectedVersion: input.expectedVersion,
            actorUserId: actor.userId,
            reason: input.reason,
            refundId: input.refundId ?? null,
            creditNoteId: input.creditNoteId ?? null,
            transactionId: transaction.transactionId,
            session: transaction.session,
          });

        if (reversed === null) {
          throw new PpcConcurrencyConflictError();
        }

        await this.dependencies.packages.releaseEnrollmentBalance({
          facilityId: actor.facilityId,
          balanceId: reversed.balanceId,
          quantity: reversed.quantity,
          amount: reversed.amount,
          actorUserId: actor.userId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });

        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType:
            PANELS_PACKAGE_COVERAGE_EVENTS
              .PACKAGE_UTILIZATION_REVERSED,
          aggregateType: 'PackageUtilization',
          aggregateId: reversed.id,
          payload: {
            utilizationId: reversed.id,
            enrollmentId: reversed.enrollmentId,
          },
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });

        return reversed;
      },
    });
  }

  private assertDefinitionActive(
    definition: PackageDefinitionSnapshot,
    startsAt: Date,
  ): void {
    if (
      definition.status !== 'ACTIVE' ||
      startsAt < definition.effectiveFrom ||
      (
        definition.effectiveThrough !== null &&
        startsAt > definition.effectiveThrough
      )
    ) {
      throw new PackageEligibilityFailedError(
        'package is not active for the enrollment date',
      );
    }
  }

  private assertEligible(
    definition: PackageDefinitionSnapshot,
    patient: PackagePatientSnapshot,
  ): void {
    const rule = definition.eligibility;

    if (!contains(rule.patientCategoryCodes, patient.patientCategoryCode)) {
      throw new PackageEligibilityFailedError('patient category');
    }
    if (!contains(rule.genderCodes, patient.genderCode)) {
      throw new PackageEligibilityFailedError('gender');
    }
    if (
      rule.minimumAgeYears !== null &&
      (patient.ageYears === null ||
        patient.ageYears < rule.minimumAgeYears)
    ) {
      throw new PackageEligibilityFailedError('minimum age');
    }
    if (
      rule.maximumAgeYears !== null &&
      (patient.ageYears === null ||
        patient.ageYears > rule.maximumAgeYears)
    ) {
      throw new PackageEligibilityFailedError('maximum age');
    }
    if (rule.admissionRequired && !patient.hasActiveAdmission) {
      throw new PackageEligibilityFailedError('active admission required');
    }
    if (!contains(rule.departmentIds, patient.departmentId)) {
      throw new PackageEligibilityFailedError('department');
    }
    if (
      rule.payerOrganizationIds.length > 0 &&
      !rule.payerOrganizationIds.some((payerId) =>
        patient.payerOrganizationIds.includes(payerId),
      )
    ) {
      throw new PackageEligibilityFailedError('payer organization');
    }
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
      throw new Error(decision.denialReason ?? 'Package access denied');
    }
  }
}