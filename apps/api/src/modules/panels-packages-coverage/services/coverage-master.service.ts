import {
  PANELS_PACKAGE_COVERAGE_EVENTS,
  PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS,
} from '../panels-packages-coverage.constants.js';

import type {
  CreateCoveragePlanInput,
  CreatePayerOrganizationInput,
  EnrollPatientCoverageInput,
  PanelsPackagesCoverageActorContext,
} from '../panels-packages-coverage.contracts.js';

import {
  CoveragePlanNotFoundError,
} from '../panels-packages-coverage.errors.js';

import {
  normalizePpcCode,
  normalizePpcText,
  ppcHashSensitiveReference,
} from '../panels-packages-coverage.normalization.js';

import type {
  PayerCoverageRepositoryPort,
  PpcAccessPolicyPort,
  PpcAuditPort,
  PpcOutboxPort,
  PpcReferenceDataPort,
  PpcTransactionManagerPort,
} from '../panels-packages-coverage.ports.js';

export interface CoverageMasterServiceDependencies {
  repository: PayerCoverageRepositoryPort;
  referenceData: PpcReferenceDataPort;
  accessPolicy: PpcAccessPolicyPort;
  transactionManager: PpcTransactionManagerPort;
  audit: PpcAuditPort;
  outbox: PpcOutboxPort;
  encryptSensitiveReference(value: string): Promise<string>;
  nextCoverageNumber(facilityId: string): Promise<string>;
}

export class CoverageMasterService {
  public constructor(
    private readonly dependencies: CoverageMasterServiceDependencies,
  ) {}

  public async createPayer(
    actor: PanelsPackagesCoverageActorContext,
    idempotencyKey: string,
    input: CreatePayerOrganizationInput,
  ) {
    await this.requirePermission(actor, PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS.COVERAGE_MANAGE);

    return this.dependencies.transactionManager.execute({
      transactionType: 'CREATE_PAYER_ORGANIZATION',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `ppc:payer:${actor.facilityId}:${normalizePpcCode(input.code)}`,
      ],
      idempotencyPayload: input,
      journalPayload: { payerCode: normalizePpcCode(input.code) },
      execute: async (transaction) => {
        const payer = await this.dependencies.repository.createPayer(
          actor,
          {
            ...input,
            code: normalizePpcCode(input.code),
            name: normalizePpcText(input.name),
          },
          transaction,
        );

        await this.dependencies.audit.record({
          actor,
          action: 'CREATE_PAYER_ORGANIZATION',
          entityType: 'PayerOrganization',
          entityId: payer._id.toHexString(),
          reason: null,
          before: null,
          after: payer,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });

        return payer;
      },
    });
  }

  public async createPlan(
    actor: PanelsPackagesCoverageActorContext,
    idempotencyKey: string,
    input: CreateCoveragePlanInput,
  ) {
    await this.requirePermission(actor, PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS.COVERAGE_MANAGE);

    return this.dependencies.transactionManager.execute({
      transactionType: 'CREATE_COVERAGE_PLAN',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `ppc:plan:${actor.facilityId}:${input.payerOrganizationId}:${normalizePpcCode(input.code)}`,
      ],
      idempotencyPayload: input,
      journalPayload: { planCode: normalizePpcCode(input.code) },
      execute: async (transaction) => {
        const plan = await this.dependencies.repository.createPlan(
          actor,
          input,
          transaction,
        );

        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType:
            PANELS_PACKAGE_COVERAGE_EVENTS.COVERAGE_PLAN_CREATED,
          aggregateType: 'PanelPlan',
          aggregateId: plan._id.toHexString(),
          payload: {
            panelPlanId: plan._id.toHexString(),
            status: plan.status,
          },
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });

        return plan;
      },
    });
  }

  public async enrollPatient(
    actor: PanelsPackagesCoverageActorContext,
    idempotencyKey: string,
    input: EnrollPatientCoverageInput,
  ) {
    await this.requirePermission(actor, PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS.COVERAGE_ENROLL);

    if (
      !(await this.dependencies.referenceData.patientExists(
        actor.facilityId,
        input.patientId,
      ))
    ) {
      throw new Error('Patient was not found');
    }

    const plan = await this.dependencies.repository.findPlan(
      actor.facilityId,
      input.coveragePlanId,
    );

    if (plan === null) {
      throw new CoveragePlanNotFoundError();
    }

    const coverageNumber =
      await this.dependencies.nextCoverageNumber(actor.facilityId);
    const membership = input.membershipReference?.trim() || null;
    const encrypted =
      membership === null
        ? null
        : await this.dependencies.encryptSensitiveReference(membership);
    const hash =
      membership === null
        ? null
        : ppcHashSensitiveReference(actor.facilityId, membership);

    return this.dependencies.transactionManager.execute({
      transactionType: 'ENROLL_PATIENT_COVERAGE',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `ppc:coverage:${actor.facilityId}:${input.patientId}:${input.priority}`,
      ],
      idempotencyPayload: {
        ...input,
        membershipReference: membership === null ? null : '[REDACTED]',
      },
      journalPayload: {
        patientId: input.patientId,
        panelPlanId: input.coveragePlanId,
      },
      execute: async (transaction) => {
        const coverage = await this.dependencies.repository.enrollPatient(
          actor,
          input,
          coverageNumber,
          encrypted,
          hash,
          plan,
          transaction,
        );

        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType:
            PANELS_PACKAGE_COVERAGE_EVENTS.COVERAGE_ENROLLED,
          aggregateType: 'PatientCoverage',
          aggregateId: coverage._id.toHexString(),
          payload: {
            coverageId: coverage._id.toHexString(),
            patientId: input.patientId,
            priority: input.priority,
            status: coverage.status,
          },
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });

        return coverage;
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