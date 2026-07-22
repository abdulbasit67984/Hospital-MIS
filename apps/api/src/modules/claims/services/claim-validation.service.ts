import {
  decimal128ToString,
  toObjectId,
} from '@hospital-mis/database';

import {
  CLAIM_PERMISSION_KEYS,
} from '../claims.constants.js';

import type {
  ClaimReadinessIssueView,
  ClaimsActorContext,
  ValidateClaimInput,
} from '../claims.contracts.js';

import {
  ClaimAccessDeniedError,
  ClaimNotEditableError,
  ClaimNotFoundError,
  ClaimVersionConflictError,
} from '../claims.errors.js';

import {
  aggregateClaimFinancials,
  deriveClaimLineFinancials,
} from '../claims.financial-math.js';

import {
  safeClaimRealtimePayload,
  stableClaimPayloadHash,
} from '../claims.normalization.js';

import type {
  ClaimDocumentRepositoryPort,
  ClaimLineRepositoryPort,
  ClaimsAccessPolicyPort,
  ClaimsAuditPort,
  ClaimsAuthoritativeBillingPort,
  ClaimsClockPort,
  ClaimsEncryptionPort,
  ClaimsOutboxPort,
  ClaimsRepositoryPort,
  ClaimsTransactionManagerPort,
  ClaimValidationRepositoryPort,
  ClaimWorkQueueRepositoryPort,
} from '../claims.ports.js';

import {
  projectClaimReadinessIssue,
} from '../claims.projections.js';

const validationEligibleStatuses = new Set([
  'DRAFT',
  'RETURNED',
  'REJECTED',
  'READY',
]);

const requiredPurposeByCategory: Readonly<
  Record<string, string | undefined>
> = {
  PHARMACY: 'PRESCRIPTION',
  LABORATORY: 'LAB_RESULT',
  RADIOLOGY: 'RADIOLOGY_REPORT',
  ADMISSION: 'DISCHARGE_SUMMARY',
  BED: 'DISCHARGE_SUMMARY',
  SURGERY: 'PROCEDURE_NOTE',
  PROCEDURE: 'PROCEDURE_NOTE',
};

export interface ClaimValidationServiceDependencies {
  claims: ClaimsRepositoryPort;
  lines: ClaimLineRepositoryPort;
  documents: ClaimDocumentRepositoryPort;
  validation: ClaimValidationRepositoryPort;
  workQueue: ClaimWorkQueueRepositoryPort;
  billing: ClaimsAuthoritativeBillingPort;
  accessPolicy: ClaimsAccessPolicyPort;
  transactionManager: ClaimsTransactionManagerPort;
  audit: ClaimsAuditPort;
  outbox: ClaimsOutboxPort;
  clock: ClaimsClockPort;
  encryption: ClaimsEncryptionPort;
}

function issue(
  code: string,
  message: string,
  options: Readonly<{
    scope?: ClaimReadinessIssueView['scope'];
    field?: string | null;
    claimLineId?: string | null;
    severity?: ClaimReadinessIssueView['severity'];
  }> = {},
): ClaimReadinessIssueView {
  return {
    code,
    severity: options.severity ?? 'ERROR',
    scope: options.scope ?? 'CLAIM',
    claimLineId: options.claimLineId ?? null,
    field: options.field ?? null,
    message,
  };
}

function lineFinancials(
  line: Readonly<{
    grossAmount: Parameters<typeof decimal128ToString>[0];
    packageAmount: Parameters<typeof decimal128ToString>[0];
    deductibleAmount: Parameters<typeof decimal128ToString>[0];
    copaymentAmount: Parameters<typeof decimal128ToString>[0];
    coinsuranceAmount: Parameters<typeof decimal128ToString>[0];
    excludedAmount: Parameters<typeof decimal128ToString>[0];
    patientOtherAmount: Parameters<typeof decimal128ToString>[0];
    patientResponsibilityAmount: Parameters<typeof decimal128ToString>[0];
    claimedAmount: Parameters<typeof decimal128ToString>[0];
    approvedAmount: Parameters<typeof decimal128ToString>[0];
    deniedAmount: Parameters<typeof decimal128ToString>[0];
    disallowedAmount: Parameters<typeof decimal128ToString>[0];
    returnedAmount: Parameters<typeof decimal128ToString>[0];
    contractualAdjustmentAmount: Parameters<typeof decimal128ToString>[0];
    writeOffAmount: Parameters<typeof decimal128ToString>[0];
    paidAmount: Parameters<typeof decimal128ToString>[0];
    outstandingAmount: Parameters<typeof decimal128ToString>[0];
  }>,
) {
  return {
    grossAmount: decimal128ToString(line.grossAmount),
    packageAmount: decimal128ToString(line.packageAmount),
    deductibleAmount: decimal128ToString(line.deductibleAmount),
    copaymentAmount: decimal128ToString(line.copaymentAmount),
    coinsuranceAmount: decimal128ToString(line.coinsuranceAmount),
    excludedAmount: decimal128ToString(line.excludedAmount),
    patientOtherAmount: decimal128ToString(line.patientOtherAmount),
    patientResponsibilityAmount: decimal128ToString(
      line.patientResponsibilityAmount,
    ),
    claimedAmount: decimal128ToString(line.claimedAmount),
    approvedAmount: decimal128ToString(line.approvedAmount),
    deniedAmount: decimal128ToString(line.deniedAmount),
    disallowedAmount: decimal128ToString(line.disallowedAmount),
    returnedAmount: decimal128ToString(line.returnedAmount),
    contractualAdjustmentAmount: decimal128ToString(
      line.contractualAdjustmentAmount,
    ),
    writeOffAmount: decimal128ToString(line.writeOffAmount),
    paidAmount: decimal128ToString(line.paidAmount),
    outstandingAmount: decimal128ToString(line.outstandingAmount),
  };
}

export class ClaimValidationService {
  public constructor(
    private readonly dependencies: ClaimValidationServiceDependencies,
  ) {}

  public async validate(
    actor: ClaimsActorContext,
    claimId: string,
    idempotencyKey: string,
    input: ValidateClaimInput,
  ) {
    await this.requirePermission(actor, CLAIM_PERMISSION_KEYS.VALIDATE);

    return this.dependencies.transactionManager.execute({
      transactionType: 'VALIDATE_CLAIM',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`claims:claim:${actor.facilityId}:${claimId}`],
      idempotencyPayload: input,
      journalPayload: { claimId, expectedVersion: input.expectedVersion },
      execute: async (transaction) => {
        const claim = await this.dependencies.claims.findById(
          actor.facilityId,
          claimId,
          transaction.session,
        );
        if (claim === null) {
          throw new ClaimNotFoundError();
        }
        if (!validationEligibleStatuses.has(claim.status)) {
          throw new ClaimNotEditableError();
        }
        if (claim.version !== input.expectedVersion) {
          throw new ClaimVersionConflictError();
        }
        const [lines, documents] = await Promise.all([
          this.dependencies.lines.listByClaim(
            actor.facilityId,
            claimId,
            transaction.session,
          ),
          this.dependencies.documents.listByClaim(
            actor.facilityId,
            claimId,
            transaction.session,
          ),
        ]);
        const checkedAt = input.asOf === undefined
          ? this.dependencies.clock.now()
          : new Date(input.asOf);
        const issues: ClaimReadinessIssueView[] = [];
        if (lines.length === 0) {
          issues.push(issue(
            'CLAIM_LINES_REQUIRED',
            'The claim requires at least one authoritative invoice line',
            { scope: 'LINE', field: 'lines' },
          ));
        }
        const primaryDiagnosisCount = claim.diagnoses.filter(
          (diagnosis) => diagnosis.diagnosisType === 'PRIMARY',
        ).length;
        if (primaryDiagnosisCount !== 1) {
          issues.push(issue(
            'PRIMARY_DIAGNOSIS_REQUIRED',
            'The claim requires exactly one primary diagnosis',
            { scope: 'DIAGNOSIS', field: 'diagnoses' },
          ));
        }
        if (
          claim.filingDeadline !== null &&
          claim.filingDeadline.getTime() < checkedAt.getTime()
        ) {
          issues.push(issue(
            'FILING_DEADLINE_EXPIRED',
            'The payer filing deadline has expired',
            { field: 'filingDeadline' },
          ));
        }
        const purposes = new Set<string>(
          documents.map((document) => document.purpose),
        );
        for (const mandatoryPurpose of ['CLAIM_FORM', 'INVOICE'] as const) {
          if (!purposes.has(mandatoryPurpose)) {
            issues.push(issue(
              `DOCUMENT_${mandatoryPurpose}_MISSING`,
              `Required ${mandatoryPurpose.toLowerCase().replaceAll('_', ' ')} document is missing`,
              { scope: 'ATTACHMENT', field: 'attachments' },
            ));
          }
        }
        for (const line of lines) {
          if (line.diagnosisSequences.length === 0) {
            issues.push(issue(
              'LINE_DIAGNOSIS_LINK_MISSING',
              'The claim line is not linked to a diagnosis',
              {
                scope: 'LINE',
                claimLineId: line._id.toHexString(),
                field: 'diagnosisSequences',
              },
            ));
          }
          const requiredPurpose = requiredPurposeByCategory[line.serviceCategory];
          if (requiredPurpose !== undefined && !purposes.has(requiredPurpose)) {
            issues.push(issue(
              `DOCUMENT_${requiredPurpose}_MISSING`,
              `Supporting ${requiredPurpose.toLowerCase().replaceAll('_', ' ')} is missing`,
              {
                scope: 'ATTACHMENT',
                claimLineId: line._id.toHexString(),
                field: 'attachments',
              },
            ));
          }
        }
        if (claim.preauthorizationIds.length > 0 && !purposes.has('PREAUTHORIZATION')) {
          issues.push(issue(
            'PREAUTHORIZATION_DOCUMENT_MISSING',
            'Preauthorization supporting evidence is missing',
            { scope: 'ATTACHMENT', field: 'attachments' },
          ));
        }
        const duplicateLineKeys = lines.map((line) => line.duplicateKey);
        if (new Set(duplicateLineKeys).size !== duplicateLineKeys.length) {
          issues.push(issue(
            'DUPLICATE_SERVICE_LINE',
            'Duplicate claim service lines were detected',
            { scope: 'LINE', field: 'lines' },
          ));
        }
        const activeDuplicate = await this.dependencies.claims.findActiveByDuplicateKey(
          actor.facilityId,
          claim.duplicateKey,
          transaction.session,
        );
        const duplicateFree =
          activeDuplicate === null ||
          activeDuplicate._id.equals(claim._id);
        if (!duplicateFree) {
          issues.push(issue(
            'DUPLICATE_ACTIVE_CLAIM',
            'Another active claim exists for this invoice and payer context',
          ));
        }

        let authoritativeEligible = true;
        let financialsMatch = true;
        let authoritativeHash = stableClaimPayloadHash({
          claimId,
          claimVersion: claim.version,
          unavailable: true,
        });
        try {
          const authoritative = await this.dependencies.billing.loadClaimSource({
            facilityId: actor.facilityId,
            invoiceId: claim.invoiceId.toHexString(),
            coverageDeterminationId:
              claim.coverageDeterminationId.toHexString(),
            payerOrganizationId:
              claim.payerOrganizationId.toHexString(),
            panelPlanId: claim.panelPlanId.toHexString(),
            patientCoverageId: claim.patientCoverageId.toHexString(),
            selectedInvoiceLineIds: lines.map((line) =>
              line.invoiceLineId.toHexString(),
            ),
            asOf: checkedAt,
            session: transaction.session,
          });
          authoritativeEligible =
            ['FINALIZED', 'PARTIALLY_PAID', 'PAID'].includes(
              authoritative.invoice.status,
            ) &&
            ['APPROVED', 'PARTIALLY_APPROVED', 'OVERRIDDEN'].includes(
              authoritative.coverage.status,
            );
          if (!authoritativeEligible) {
            issues.push(issue(
              'AUTHORITATIVE_ELIGIBILITY_FAILED',
              'Invoice or coverage status is no longer eligible for submission',
            ));
          }
          const sourceByLine = new Map(
            authoritative.lines.map((line) => [line.invoiceLineId, line]),
          );
          const authoritativeFinancials = aggregateClaimFinancials(
            lines.map((line) => {
              const source = sourceByLine.get(line.invoiceLineId.toHexString());
              if (source === undefined) {
                throw new Error('AUTHORITATIVE_LINE_MISSING');
              }
              const derived = deriveClaimLineFinancials(source.allocation);
              return {
                ...derived,
                approvedAmount: '0.00',
                deniedAmount: '0.00',
                disallowedAmount: '0.00',
                returnedAmount: '0.00',
                contractualAdjustmentAmount: '0.00',
                writeOffAmount: '0.00',
                paidAmount: '0.00',
                outstandingAmount: '0.00',
              };
            }),
          );
          const persistedFinancials = aggregateClaimFinancials(
            lines.map(lineFinancials),
          );
          financialsMatch = [
            'grossAmount',
            'packageAmount',
            'patientResponsibilityAmount',
            'claimedAmount',
          ].every(
            (field) =>
              authoritativeFinancials[
                field as keyof typeof authoritativeFinancials
              ] ===
              persistedFinancials[field as keyof typeof persistedFinancials],
          );
          if (!financialsMatch) {
            issues.push(issue(
              'AUTHORITATIVE_FINANCIAL_MISMATCH',
              'Claim financial values no longer match billing and coverage allocations',
            ));
          }
          authoritativeHash = stableClaimPayloadHash({
            invoice: authoritative.invoice,
            coverage: authoritative.coverage,
            lines: authoritative.lines.map((line) => ({
              invoiceLineId: line.invoiceLineId,
              chargeCatalogItemId: line.chargeCatalogItemId,
              serviceCodeSystem: line.serviceCodeSystem,
              serviceCode: line.serviceCode,
              allocation: line.allocation,
              preauthorizationId: line.preauthorizationId,
              preauthorizationRequired: line.preauthorizationRequired,
            })),
          });
        } catch (error) {
          authoritativeEligible = false;
          financialsMatch = false;
          issues.push(issue(
            'AUTHORITATIVE_SOURCE_UNAVAILABLE',
            error instanceof Error && error.message === 'AUTHORITATIVE_LINE_MISSING'
              ? 'A persisted claim line no longer exists in the authoritative invoice'
              : 'Authoritative invoice and coverage validation could not be completed',
          ));
        }

        const complete = !issues.some(
          (current) =>
            current.severity === 'ERROR' &&
            ['ATTACHMENT', 'DIAGNOSIS', 'LINE'].includes(current.scope),
        );
        const eligible = authoritativeEligible;
        const scrubbed = financialsMatch && !issues.some(
          (current) =>
            current.severity === 'ERROR' &&
            current.code !== 'DUPLICATE_ACTIVE_CLAIM',
        );
        const submissionReady =
          complete && eligible && duplicateFree && scrubbed;
        const snapshot = await this.dependencies.validation.createSnapshot(
          actor,
          {
            claimId: claim._id,
            claimVersion: claim.version,
            checkedAt,
            checkedBy: toObjectId(actor.userId, 'checkedBy'),
            complete,
            eligible,
            duplicateFree,
            scrubbed,
            submissionReady,
            authoritativePayloadHash: authoritativeHash,
            issues: issues.map((current) => ({
              code: current.code,
              severity: current.severity,
              scope: current.scope,
              claimLineId:
                current.claimLineId === null
                  ? null
                  : toObjectId(current.claimLineId, 'claimLineId'),
              field: current.field,
              message: current.message,
            })),
          },
          transaction,
        );
        const updated = await this.dependencies.claims.updateStatus(
          actor.facilityId,
          claimId,
          input.expectedVersion,
          {
            readinessSnapshotId: snapshot._id.toHexString(),
            readinessIssues: snapshot.issues,
            readinessCheckedAt: checkedAt,
            readinessCheckedBy: actor.userId,
          },
          actor.userId,
          transaction,
        );
        if (updated === null) {
          throw new ClaimVersionConflictError();
        }
        if (!submissionReady) {
          const reasonEncrypted = await this.dependencies.encryption.encrypt(
            issues.map((current) => current.code).join(','),
          );
          await this.dependencies.workQueue.upsertOpenItem(
            actor,
            {
              claimId,
              workQueueType: complete ? 'SCRUBBING' : 'COMPLETENESS',
              priority: issues.some((current) =>
                current.code === 'FILING_DEADLINE_EXPIRED'
              )
                ? 900
                : 500,
              followUpAt: checkedAt,
              reasonEncrypted,
            },
            transaction,
          );
        }
        await this.dependencies.audit.record({
          actor,
          action: 'CLAIM_VALIDATED',
          entityType: 'Claim',
          entityId: claimId,
          reason: null,
          before: {
            version: claim.version,
            readinessSnapshotId:
              claim.readinessSnapshotId?.toHexString() ?? null,
          },
          after: {
            version: updated.version,
            validationSnapshotId: snapshot._id.toHexString(),
            submissionReady,
            issueCount: issues.length,
          },
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType: 'claims.claim.validated',
          aggregateType: 'Claim',
          aggregateId: claimId,
          payload: safeClaimRealtimePayload({
            claimId,
            status: updated.status,
            previousStatus: claim.status,
            version: updated.version,
            eventAt: checkedAt.toISOString(),
          }),
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        return {
          validationSnapshotId: snapshot._id.toHexString(),
          claimId,
          claimVersion: snapshot.claimVersion,
          complete,
          eligible,
          duplicateFree,
          scrubbed,
          submissionReady,
          issues: snapshot.issues.map(projectClaimReadinessIssue),
          version: updated.version,
        };
      },
    });
  }

  private async requirePermission(
    actor: ClaimsActorContext,
    permission: string,
  ): Promise<void> {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      permission,
      resourceFacilityId: actor.facilityId,
    });
    if (!decision.allowed) {
      throw new ClaimAccessDeniedError(
        decision.denialReason ?? undefined,
      );
    }
  }
}