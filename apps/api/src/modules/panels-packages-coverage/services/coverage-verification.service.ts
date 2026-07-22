import {
  PANELS_PACKAGE_COVERAGE_EVENTS,
  PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS,
} from '../panels-packages-coverage.constants.js';

import type {
  PanelsPackagesCoverageActorContext,
  VerifyCoverageInput,
} from '../panels-packages-coverage.contracts.js';

import {
  PatientCoverageNotFoundError,
  PpcConcurrencyConflictError,
} from '../panels-packages-coverage.errors.js';

import type {
  PpcAccessPolicyPort,
  PpcAuditPort,
  PpcOutboxPort,
  PpcTransactionManagerPort,
} from '../panels-packages-coverage.ports.js';

export interface CoverageVerificationRepositoryPort {
  findCoverage(
    facilityId: string,
    coverageId: string,
  ): Promise<Readonly<{
    id: string;
    patientId: string;
    version: number;
    status: string;
  }> | null>;

  appendVerification(input: Readonly<{
    actor: PanelsPackagesCoverageActorContext;
    coverageId: string;
    verifiedEligible: boolean;
    verifiedFrom: Date;
    verifiedThrough: Date | null;
    verificationReference: string | null;
    reason: string;
    transactionId: string;
    session: import('../panels-packages-coverage.persistence.types.js').PpcMongoSession;
  }>): Promise<Readonly<{ id: string }>>;

  applyVerification(input: Readonly<{
    facilityId: string;
    coverageId: string;
    expectedVersion: number;
    verificationId: string;
    status: 'ACTIVE' | 'PENDING_VERIFICATION';
    actorUserId: string;
    transactionId: string;
    session: import('../panels-packages-coverage.persistence.types.js').PpcMongoSession;
  }>): Promise<Readonly<{
    id: string;
    patientId: string;
    status: string;
    version: number;
  }> | null>;
}

export interface CoverageVerificationServiceDependencies {
  repository: CoverageVerificationRepositoryPort;
  accessPolicy: PpcAccessPolicyPort;
  transactionManager: PpcTransactionManagerPort;
  audit: PpcAuditPort;
  outbox: PpcOutboxPort;
}

export class CoverageVerificationService {
  public constructor(
    private readonly dependencies: CoverageVerificationServiceDependencies,
  ) {}

  public async verify(
    actor: PanelsPackagesCoverageActorContext,
    coverageId: string,
    idempotencyKey: string,
    input: VerifyCoverageInput,
  ) {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      permission:
        PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS.COVERAGE_VERIFY,
    });
    if (!decision.allowed) {
      throw new Error(decision.denialReason ?? 'Coverage access denied');
    }

    const current = await this.dependencies.repository.findCoverage(
      actor.facilityId,
      coverageId,
    );
    if (current === null) {
      throw new PatientCoverageNotFoundError();
    }

    return this.dependencies.transactionManager.execute({
      transactionType: 'VERIFY_PATIENT_COVERAGE',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `ppc:coverage-verification:${actor.facilityId}:${coverageId}`,
      ],
      idempotencyPayload: input,
      journalPayload: { coverageId },
      execute: async (transaction) => {
        const verification =
          await this.dependencies.repository.appendVerification({
            actor,
            coverageId,
            verifiedEligible: input.verifiedEligible,
            verifiedFrom: new Date(input.verifiedFrom),
            verifiedThrough:
              input.verifiedThrough === null
                ? null
                : new Date(input.verifiedThrough),
            verificationReference: input.verificationReference,
            reason: input.reason,
            transactionId: transaction.transactionId,
            session: transaction.session,
          });

        const updated =
          await this.dependencies.repository.applyVerification({
            facilityId: actor.facilityId,
            coverageId,
            expectedVersion: input.expectedVersion,
            verificationId: verification.id,
            status: input.verifiedEligible
              ? 'ACTIVE'
              : 'PENDING_VERIFICATION',
            actorUserId: actor.userId,
            transactionId: transaction.transactionId,
            session: transaction.session,
          });

        if (updated === null) {
          throw new PpcConcurrencyConflictError();
        }

        await this.dependencies.audit.record({
          actor,
          action: 'VERIFY_PATIENT_COVERAGE',
          entityType: 'PatientCoverage',
          entityId: coverageId,
          reason: input.reason,
          before: current,
          after: updated,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });

        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType:
            PANELS_PACKAGE_COVERAGE_EVENTS.COVERAGE_VERIFIED,
          aggregateType: 'PatientCoverage',
          aggregateId: coverageId,
          payload: {
            coverageId,
            patientId: updated.patientId,
            status: updated.status,
            eligible: input.verifiedEligible,
          },
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });

        return { coverage: updated, verification };
      },
    });
  }
}