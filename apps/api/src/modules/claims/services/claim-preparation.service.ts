import {
  toObjectId,
} from '@hospital-mis/database';

import {
  CLAIM_CURRENCY,
  CLAIM_NUMBER_SEQUENCE_KEY,
  CLAIM_PERMISSION_KEYS,
  claimServiceCategoryValues,
} from '../claims.constants.js';

import type {
  ClaimDiagnosisInput,
  ClaimLineSelectionInput,
  ClaimsActorContext,
  ClaimsListQuery,
  CreateClaimInput,
  UpdateDraftClaimInput,
} from '../claims.contracts.js';

import {
  ClaimAccessDeniedError,
  ClaimCoverageNotEligibleError,
  ClaimDuplicateError,
  ClaimFinancialReconciliationError,
  ClaimInvoiceNotEligibleError,
  ClaimNotEditableError,
  ClaimNotFoundError,
  ClaimPreauthorizationRequiredError,
  ClaimVersionConflictError,
} from '../claims.errors.js';

import {
  aggregateClaimFinancials,
  deriveClaimLineFinancials,
} from '../claims.financial-math.js';

import {
  buildClaimDuplicateKey,
  buildClaimLineDuplicateKey,
  hashClaimSensitiveReference,
  maskClaimReference,
  normalizeClaimCode,
  normalizeOptionalClaimText,
  safeClaimRealtimePayload,
  stableClaimPayloadHash,
  uniqueSortedNumbers,
} from '../claims.normalization.js';

import type {
  ClaimDocumentRepositoryPort,
  ClaimLineRepositoryPort,
  ClaimsAccessPolicyPort,
  ClaimsAttachmentPort,
  ClaimsAuditPort,
  ClaimsAuthoritativeBillingPort,
  ClaimsClockPort,
  ClaimsCoverageUtilizationPort,
  ClaimsEncryptionPort,
  ClaimsNumberSequencePort,
  ClaimsOutboxPort,
  ClaimsRepositoryPort,
  ClaimsTransactionContext,
  ClaimsTransactionManagerPort,
  ClaimWorkflowHistoryRepositoryPort,
} from '../claims.ports.js';

import type {
  ClaimLineRecord,
  ClaimRecord,
} from '../claims.persistence.types.js';

import {
  projectClaim,
} from '../claims.projections.js';

const invoiceClaimableStatuses = new Set([
  'FINALIZED',
  'PARTIALLY_PAID',
  'PAID',
]);

const coverageClaimableStatuses = new Set([
  'APPROVED',
  'PARTIALLY_APPROVED',
  'OVERRIDDEN',
]);

const editableClaimStatuses = new Set([
  'DRAFT',
  'RETURNED',
  'REJECTED',
]);

export interface ClaimPreparationServiceDependencies {
  claims: ClaimsRepositoryPort;
  lines: ClaimLineRepositoryPort;
  documents: ClaimDocumentRepositoryPort;
  history: ClaimWorkflowHistoryRepositoryPort;
  billing: ClaimsAuthoritativeBillingPort;
  coverageUtilization: ClaimsCoverageUtilizationPort;
  attachments: ClaimsAttachmentPort;
  accessPolicy: ClaimsAccessPolicyPort;
  transactionManager: ClaimsTransactionManagerPort;
  audit: ClaimsAuditPort;
  outbox: ClaimsOutboxPort;
  clock: ClaimsClockPort;
  numberSequence: ClaimsNumberSequencePort;
  encryption: ClaimsEncryptionPort;
}

interface PreparedSource {
  authoritative: Awaited<ReturnType<ClaimsAuthoritativeBillingPort['loadClaimSource']>>;
  lines: readonly Readonly<Record<string, unknown>>[];
  financials: Readonly<Record<string, string>>;
  serviceFrom: Date;
  serviceThrough: Date;
}

function sourceReferenceFields(
  category: string,
  sourceRecordId: string | null,
): Readonly<Record<string, string | null>> {
  return {
    procedureId:
      category === 'PROCEDURE' || category === 'SURGERY'
        ? sourceRecordId
        : null,
    laboratoryOrderId:
      category === 'LABORATORY' ? sourceRecordId : null,
    radiologyOrderId:
      category === 'RADIOLOGY' ? sourceRecordId : null,
    dispensationId:
      category === 'PHARMACY' ? sourceRecordId : null,
  };
}

function assertServiceCategory(
  value: string,
): asserts value is (typeof claimServiceCategoryValues)[number] {
  if (!claimServiceCategoryValues.includes(
    value as (typeof claimServiceCategoryValues)[number],
  )) {
    throw new ClaimFinancialReconciliationError(
      `Unsupported authoritative claim service category: ${value}`,
    );
  }
}

function assertDiagnosisSequences(
  selections: readonly number[],
  diagnoses: readonly ClaimDiagnosisInput[],
): void {
  const available = new Set(diagnoses.map((diagnosis) => diagnosis.sequence));
  if (selections.some((sequence) => !available.has(sequence))) {
    throw new ClaimFinancialReconciliationError(
      'Claim-line diagnosis sequences must reference claim diagnoses',
    );
  }
}

function zeroSettlementFinancials() {
  return {
    approvedAmount: '0.00',
    deniedAmount: '0.00',
    disallowedAmount: '0.00',
    returnedAmount: '0.00',
    contractualAdjustmentAmount: '0.00',
    writeOffAmount: '0.00',
    payerWithholdingAmount: '0.00',
    paidAmount: '0.00',
    outstandingAmount: '0.00',
  } as const;
}

function fullHeaderFinancials(
  aggregate: ReturnType<typeof aggregateClaimFinancials>,
): Readonly<Record<string, string>> {
  return {
    grossAmount: aggregate.grossAmount,
    packageAmount: aggregate.packageAmount,
    deductibleAmount: aggregate.deductibleAmount,
    copaymentAmount: aggregate.copaymentAmount,
    coinsuranceAmount: aggregate.coinsuranceAmount,
    excludedAmount: aggregate.excludedAmount,
    patientOtherAmount: aggregate.patientOtherAmount,
    patientResponsibilityAmount: aggregate.patientResponsibilityAmount,
    claimedAmount: aggregate.claimedAmount,
    approvedAmount: '0.00',
    deniedAmount: '0.00',
    disallowedAmount: '0.00',
    returnedAmount: '0.00',
    contractualAdjustmentAmount: '0.00',
    writeOffAmount: '0.00',
    payerWithholdingAmount: '0.00',
    debitNoteAmount: '0.00',
    creditNoteAmount: '0.00',
    refundAmount: '0.00',
    repaymentAmount: '0.00',
    paidAmount: '0.00',
    unappliedPaymentAmount: '0.00',
    outstandingAmount: '0.00',
    overpaymentAmount: '0.00',
  };
}

function snapshotClaim(
  claim: ClaimRecord,
  lines: readonly ClaimLineRecord[],
): Readonly<Record<string, unknown>> {
  return projectClaim(claim, lines) as unknown as Readonly<
    Record<string, unknown>
  >;
}

export class ClaimPreparationService {
  public constructor(
    private readonly dependencies: ClaimPreparationServiceDependencies,
  ) {}

  public async get(
    actor: ClaimsActorContext,
    claimId: string,
  ) {
    await this.requirePermission(actor, CLAIM_PERMISSION_KEYS.READ);
    const claim = await this.dependencies.claims.findById(
      actor.facilityId,
      claimId,
    );
    if (claim === null) {
      throw new ClaimNotFoundError();
    }
    const lines = await this.dependencies.lines.listByClaim(
      actor.facilityId,
      claimId,
    );
    return projectClaim(claim, lines);
  }

  public async list(
    actor: ClaimsActorContext,
    query: ClaimsListQuery,
  ) {
    await this.requirePermission(actor, CLAIM_PERMISSION_KEYS.READ);
    const { records, totalItems } = await this.dependencies.claims.list(
      actor.facilityId,
      query,
    );
    const page = Math.max(1, Math.trunc(query.page ?? 1));
    const pageSize = Math.max(1, Math.trunc(query.pageSize ?? 25));
    const items = await Promise.all(
      records.map(async (claim) =>
        projectClaim(
          claim,
          await this.dependencies.lines.listByClaim(
            actor.facilityId,
            claim._id.toHexString(),
          ),
        ),
      ),
    );
    return {
      items,
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    };
  }

  public async create(
    actor: ClaimsActorContext,
    idempotencyKey: string,
    input: CreateClaimInput,
  ) {
    await this.requirePermission(actor, CLAIM_PERMISSION_KEYS.PREPARE);
    await this.dependencies.attachments.assertAttachmentsUsable({
      facilityId: actor.facilityId,
      actorUserId: actor.userId,
      attachments: input.attachments ?? [],
    });

    return this.dependencies.transactionManager.execute({
      transactionType: 'CREATE_CLAIM',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `claims:invoice:${actor.facilityId}:${input.invoiceId}`,
        `claims:coverage:${actor.facilityId}:${input.coverageDeterminationId}`,
        `claims:payer:${actor.facilityId}:${input.payerOrganizationId}`,
      ],
      idempotencyPayload: input,
      journalPayload: {
        invoiceId: input.invoiceId,
        payerOrganizationId: input.payerOrganizationId,
        claimVersionType: input.claimVersionType,
      },
      execute: async (transaction) => {
        const prepared = await this.prepareSource(
          actor,
          input,
          input.lines,
          input.diagnoses,
          transaction,
        );
        const now = this.dependencies.clock.now();
        const duplicateKey = buildClaimDuplicateKey({
          facilityId: actor.facilityId,
          payerOrganizationId: input.payerOrganizationId,
          invoiceId: input.invoiceId,
          patientCoverageId: input.patientCoverageId,
          originalClaimId: input.originalClaimId ?? null,
        });
        const duplicate = await this.dependencies.claims.findActiveByDuplicateKey(
          actor.facilityId,
          duplicateKey,
          transaction.session,
        );
        if (duplicate !== null) {
          throw new ClaimDuplicateError();
        }

        const versionContext = await this.resolveVersionContext(
          actor,
          input,
          transaction,
        );
        const claimNumber = await this.dependencies.numberSequence.next({
          facilityId: actor.facilityId,
          sequenceKey: CLAIM_NUMBER_SEQUENCE_KEY,
          effectiveAt: now,
          actorUserId: actor.userId,
          transaction,
        });
        const [internalNoteEncrypted, payerNoteEncrypted, medicalEncrypted] =
          await Promise.all([
            this.encryptOptional(input.internalNote),
            this.encryptOptional(input.payerNote),
            this.encryptOptional(input.medicalNecessitySummary),
          ]);
        const coverage = prepared.authoritative.coverage;
        const claim = await this.dependencies.claims.create(
          actor,
          input,
          {
            claimNumber,
            claimVersionNumber: versionContext.claimVersionNumber,
            priorClaimVersionId: versionContext.priorClaimVersionId,
            operationKey: stableClaimPayloadHash({
              facilityId: actor.facilityId,
              idempotencyKey,
              invoiceId: input.invoiceId,
              payerOrganizationId: input.payerOrganizationId,
              claimVersionType: input.claimVersionType,
            }),
            duplicateKey,
            patientId: prepared.authoritative.invoice.patientId,
            patientAccountId:
              prepared.authoritative.invoice.patientAccountId,
            encounterId: prepared.authoritative.invoice.encounterId,
            admissionId: prepared.authoritative.invoice.admissionId,
            payerType: coverage.payerType,
            policyReferenceHash: hashClaimSensitiveReference(
              coverage.policyReference,
            ),
            policyReferenceMasked: maskClaimReference(
              coverage.policyReference,
            ),
            membershipReferenceHash: hashClaimSensitiveReference(
              coverage.membershipReference,
            ),
            membershipReferenceMasked: maskClaimReference(
              coverage.membershipReference,
            ),
            employerReferenceHash: hashClaimSensitiveReference(
              coverage.employerReference,
            ),
            authorizationReferenceHash: hashClaimSensitiveReference(
              coverage.authorizationReference,
            ),
            serviceFrom: prepared.serviceFrom,
            serviceThrough: prepared.serviceThrough,
            currency: CLAIM_CURRENCY,
            financials: prepared.financials,
            diagnoses: input.diagnoses,
            agingAnchorAt: now,
            internalNoteEncrypted,
            payerNoteEncrypted,
            medicalNecessitySummaryEncrypted: medicalEncrypted,
          },
          transaction,
        );
        const claimId = claim._id.toHexString();
        const lines = await this.dependencies.lines.createMany(
          actor,
          claimId,
          prepared.lines,
          transaction,
        );
        await this.dependencies.documents.replaceForDraft(
          actor,
          claimId,
          input.attachments ?? [],
          transaction,
        );
        await this.dependencies.coverageUtilization.reserveForClaim({
          actor,
          claimId,
          coverageDeterminationId: input.coverageDeterminationId,
          invoiceLineIds: input.lines.map((line) => line.invoiceLineId),
          transaction,
        });
        await this.dependencies.history.appendStatus(
          actor,
          {
            claimId: claim._id,
            fromStatus: null,
            toStatus: 'DRAFT',
            reason: 'Claim created from authoritative invoice and coverage determination',
            payerReasonCode: null,
            payerReasonDescription: null,
            actorUserId: toObjectId(actor.userId, 'actorUserId'),
            makerUserId: toObjectId(actor.userId, 'makerUserId'),
            checkerUserId: null,
            approvalRequestId: null,
            transactionId: transaction.transactionId,
            correlationId: actor.correlationId,
            occurredAt: now,
            immutableHash: '',
          },
          transaction,
        );
        await this.dependencies.history.appendVersion(
          actor,
          {
            claimId: claim._id,
            claimNumber: claim.claimNumber,
            versionNumber: 1,
            versionType: claim.claimVersionType,
            priorClaimId: claim.priorClaimVersionId,
            snapshot: snapshotClaim(claim, lines),
            snapshotHash: '',
            reason: 'Initial immutable claim version',
            actorUserId: toObjectId(actor.userId, 'actorUserId'),
            transactionId: transaction.transactionId,
            correlationId: actor.correlationId,
            occurredAt: now,
          },
          transaction,
        );
        await this.dependencies.audit.record({
          actor,
          action: 'CLAIM_CREATED',
          entityType: 'Claim',
          entityId: claimId,
          reason: 'Claim prepared from approved billing and coverage records',
          before: null,
          after: {
            claimId,
            status: claim.status,
            lineCount: lines.length,
            version: claim.version,
          },
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType: 'claims.claim.created',
          aggregateType: 'Claim',
          aggregateId: claimId,
          payload: safeClaimRealtimePayload({
            claimId,
            status: claim.status,
            version: claim.version,
            eventAt: now.toISOString(),
          }),
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        return projectClaim(claim, lines);
      },
    });
  }

  public async updateDraft(
    actor: ClaimsActorContext,
    claimId: string,
    idempotencyKey: string,
    input: UpdateDraftClaimInput,
  ) {
    await this.requirePermission(actor, CLAIM_PERMISSION_KEYS.UPDATE);
    if (input.attachments !== undefined) {
      await this.dependencies.attachments.assertAttachmentsUsable({
        facilityId: actor.facilityId,
        actorUserId: actor.userId,
        attachments: input.attachments,
      });
    }

    return this.dependencies.transactionManager.execute({
      transactionType: 'UPDATE_DRAFT_CLAIM',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `claims:claim:${actor.facilityId}:${claimId}`,
      ],
      idempotencyPayload: input,
      journalPayload: { claimId, expectedVersion: input.expectedVersion },
      execute: async (transaction) => {
        const existing = await this.dependencies.claims.findById(
          actor.facilityId,
          claimId,
          transaction.session,
        );
        if (existing === null) {
          throw new ClaimNotFoundError();
        }
        if (!editableClaimStatuses.has(existing.status)) {
          throw new ClaimNotEditableError();
        }
        if (existing.version !== input.expectedVersion) {
          throw new ClaimVersionConflictError();
        }
        const existingLines = await this.dependencies.lines.listByClaim(
          actor.facilityId,
          claimId,
          transaction.session,
        );
        const diagnoses = input.diagnoses ?? existing.diagnoses.map((item) => ({
          diagnosisId: item.diagnosisId?.toHexString() ?? null,
          codeSystem: item.codeSystem,
          code: item.code,
          description: item.description,
          diagnosisType: item.diagnosisType,
          sequence: item.sequence,
          presentOnAdmission: item.presentOnAdmission,
        }));
        let prepared: PreparedSource | null = null;
        if (input.lines !== undefined) {
          prepared = await this.prepareSource(
            actor,
            {
              invoiceId: existing.invoiceId.toHexString(),
              coverageDeterminationId:
                existing.coverageDeterminationId.toHexString(),
              payerOrganizationId:
                existing.payerOrganizationId.toHexString(),
              panelPlanId: existing.panelPlanId.toHexString(),
              patientCoverageId: existing.patientCoverageId.toHexString(),
              preauthorizationIds: existing.preauthorizationIds.map((id) =>
                id.toHexString(),
              ),
            },
            input.lines,
            diagnoses,
            transaction,
          );
          if (
            prepared.serviceFrom.getTime() !== existing.serviceFrom.getTime() ||
            prepared.serviceThrough.getTime() !== existing.serviceThrough.getTime()
          ) {
            throw new ClaimFinancialReconciliationError(
              'Draft line changes cannot alter the immutable claim service-period boundary; create a corrected claim version instead',
            );
          }
        }
        const [internalNoteEncrypted, payerNoteEncrypted, medicalEncrypted] =
          await Promise.all([
            input.internalNote === undefined
              ? Promise.resolve(undefined)
              : this.encryptOptional(input.internalNote),
            input.payerNote === undefined
              ? Promise.resolve(undefined)
              : this.encryptOptional(input.payerNote),
            input.medicalNecessitySummary === undefined
              ? Promise.resolve(undefined)
              : this.encryptOptional(input.medicalNecessitySummary),
          ]);
        const updated = await this.dependencies.claims.updateDraft(
          actor.facilityId,
          claimId,
          input.expectedVersion,
          {
            ...(input.diagnoses === undefined ? {} : { diagnoses }),
            ...(input.preauthorizationIds === undefined
              ? {}
              : { preauthorizationIds: input.preauthorizationIds }),
            ...(input.filingDeadline === undefined
              ? {}
              : {
                  filingDeadline:
                    input.filingDeadline === null
                      ? null
                      : new Date(input.filingDeadline),
                }),
            ...(internalNoteEncrypted === undefined
              ? {}
              : { internalNoteEncrypted }),
            ...(payerNoteEncrypted === undefined
              ? {}
              : { payerNoteEncrypted }),
            ...(medicalEncrypted === undefined
              ? {}
              : { medicalNecessitySummaryEncrypted: medicalEncrypted }),
            ...(prepared === null ? {} : { financials: prepared.financials }),
          },
          actor.userId,
          transaction,
        );
        if (updated === null) {
          throw new ClaimVersionConflictError();
        }
        let updatedLines = existingLines;
        if (prepared !== null) {
          await this.dependencies.coverageUtilization.reverseClaimReservation({
            actor,
            claimId,
            reason: input.reason,
            transaction,
          });
          updatedLines = await this.dependencies.lines.replaceForDraft(
            actor,
            claimId,
            prepared.lines,
            transaction,
          );
          await this.dependencies.coverageUtilization.reserveForClaim({
            actor,
            claimId,
            coverageDeterminationId:
              existing.coverageDeterminationId.toHexString(),
            invoiceLineIds: input.lines!.map((line) => line.invoiceLineId),
            transaction,
          });
        }
        if (input.attachments !== undefined) {
          await this.dependencies.documents.replaceForDraft(
            actor,
            claimId,
            input.attachments,
            transaction,
          );
        }
        const now = this.dependencies.clock.now();
        await this.dependencies.history.appendVersion(
          actor,
          {
            claimId: existing._id,
            claimNumber: existing.claimNumber,
            versionNumber: updated.version + 1,
            versionType: existing.claimVersionType,
            priorClaimId: existing.priorClaimVersionId,
            snapshot: snapshotClaim(existing, existingLines),
            snapshotHash: '',
            reason: input.reason,
            actorUserId: toObjectId(actor.userId, 'actorUserId'),
            transactionId: transaction.transactionId,
            correlationId: actor.correlationId,
            occurredAt: now,
          },
          transaction,
        );
        await this.dependencies.audit.record({
          actor,
          action: 'CLAIM_DRAFT_UPDATED',
          entityType: 'Claim',
          entityId: claimId,
          reason: input.reason,
          before: {
            status: existing.status,
            version: existing.version,
            lineCount: existingLines.length,
          },
          after: {
            status: updated.status,
            version: updated.version,
            lineCount: updatedLines.length,
          },
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType: 'claims.claim.updated',
          aggregateType: 'Claim',
          aggregateId: claimId,
          payload: safeClaimRealtimePayload({
            claimId,
            status: updated.status,
            previousStatus: existing.status,
            version: updated.version,
            eventAt: now.toISOString(),
          }),
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        return projectClaim(updated, updatedLines);
      },
    });
  }

  private async prepareSource(
    actor: ClaimsActorContext,
    input: Pick<
      CreateClaimInput,
      | 'invoiceId'
      | 'coverageDeterminationId'
      | 'payerOrganizationId'
      | 'panelPlanId'
      | 'patientCoverageId'
      | 'preauthorizationIds'
    >,
    selections: readonly ClaimLineSelectionInput[],
    diagnoses: readonly ClaimDiagnosisInput[],
    transaction: ClaimsTransactionContext,
  ): Promise<PreparedSource> {
    const authoritative = await this.dependencies.billing.loadClaimSource({
      facilityId: actor.facilityId,
      invoiceId: input.invoiceId,
      coverageDeterminationId: input.coverageDeterminationId,
      payerOrganizationId: input.payerOrganizationId,
      panelPlanId: input.panelPlanId,
      patientCoverageId: input.patientCoverageId,
      selectedInvoiceLineIds: selections.map((line) => line.invoiceLineId),
      asOf: this.dependencies.clock.now(),
      session: transaction.session,
    });
    if (!invoiceClaimableStatuses.has(authoritative.invoice.status)) {
      throw new ClaimInvoiceNotEligibleError();
    }
    if (!coverageClaimableStatuses.has(authoritative.coverage.status)) {
      throw new ClaimCoverageNotEligibleError();
    }
    if (
      authoritative.coverage.payerOrganizationId !== input.payerOrganizationId ||
      authoritative.coverage.panelPlanId !== input.panelPlanId ||
      authoritative.coverage.patientCoverageId !== input.patientCoverageId
    ) {
      throw new ClaimCoverageNotEligibleError();
    }
    const sourceByInvoiceLine = new Map(
      authoritative.lines.map((line) => [line.invoiceLineId, line]),
    );
    if (sourceByInvoiceLine.size !== selections.length) {
      throw new ClaimFinancialReconciliationError(
        'Every selected claim line must resolve to one authoritative invoice line',
      );
    }
    const allowedPreauthorizations = new Set(
      input.preauthorizationIds ?? [],
    );
    const preparedLines = await Promise.all(
      selections.map(async (selection, index) => {
        const source = sourceByInvoiceLine.get(selection.invoiceLineId);
        if (source === undefined) {
          throw new ClaimFinancialReconciliationError(
            'Selected invoice line was not returned by authoritative billing',
          );
        }
        if (
          source.preauthorizationRequired &&
          (source.preauthorizationId === null ||
            !allowedPreauthorizations.has(source.preauthorizationId))
        ) {
          throw new ClaimPreauthorizationRequiredError();
        }
        assertServiceCategory(source.serviceCategory);
        const diagnosisSequences = uniqueSortedNumbers(
          selection.diagnosisSequences ?? diagnoses.map((item) => item.sequence),
        );
        assertDiagnosisSequences(diagnosisSequences, diagnoses);
        const financials = deriveClaimLineFinancials(source.allocation);
        const serviceCodeSystem = normalizeClaimCode(
          selection.codingOverride?.serviceCodeSystem ??
            source.serviceCodeSystem,
        );
        const serviceCode = normalizeClaimCode(
          selection.codingOverride?.serviceCode ?? source.serviceCode,
        );
        const medicalNecessityNoteEncrypted = await this.encryptOptional(
          selection.medicalNecessityNote,
        );
        const internalNoteEncrypted = await this.encryptOptional(
          selection.internalNote,
        );
        return {
          duplicateKey: buildClaimLineDuplicateKey({
            facilityId: actor.facilityId,
            payerOrganizationId: input.payerOrganizationId,
            patientCoverageId: input.patientCoverageId,
            invoiceLineId: source.invoiceLineId,
            serviceFrom: source.serviceFrom.toISOString(),
            serviceThrough: source.serviceThrough?.toISOString() ?? null,
            serviceCodeSystem,
            serviceCode,
          }),
          lineNumber: index + 1,
          invoiceLineId: source.invoiceLineId,
          coverageAllocationId: source.allocation.coverageAllocationId,
          chargeCatalogItemId: source.chargeCatalogItemId,
          sourceModule: source.sourceModule,
          sourceRecordId: source.sourceRecordId,
          encounterId: authoritative.invoice.encounterId,
          admissionId: authoritative.invoice.admissionId,
          ...sourceReferenceFields(
            source.serviceCategory,
            source.sourceRecordId,
          ),
          packageEnrollmentId: source.allocation.packageEnrollmentId,
          serviceCategory: source.serviceCategory,
          serviceFrom: source.serviceFrom,
          serviceThrough: source.serviceThrough,
          providerId: selection.providerId ?? source.providerId,
          departmentId: selection.departmentId ?? source.departmentId,
          chargeCatalogCode: source.chargeCatalogCode,
          serviceCodeSystem,
          serviceCode,
          revenueCode:
            selection.codingOverride?.revenueCode ?? source.revenueCode,
          modifiers: selection.codingOverride?.modifiers ?? [],
          units: selection.codingOverride?.units ?? source.units,
          diagnosisSequences,
          preauthorizationId: source.preauthorizationId,
          status: 'DRAFT',
          ...financials,
          ...zeroSettlementFinancials(),
          medicalNecessityNoteEncrypted,
          internalNoteEncrypted,
          payerLineReference: null,
          denialCategory: null,
          denialReasonCode: null,
          denialReasonDescription: null,
        };
      }),
    );
    const aggregate = aggregateClaimFinancials(
      preparedLines.map((line) => ({
        grossAmount: line.grossAmount,
        packageAmount: line.packageAmount,
        deductibleAmount: line.deductibleAmount,
        copaymentAmount: line.copaymentAmount,
        coinsuranceAmount: line.coinsuranceAmount,
        excludedAmount: line.excludedAmount,
        patientOtherAmount: line.patientOtherAmount,
        patientResponsibilityAmount: line.patientResponsibilityAmount,
        claimedAmount: line.claimedAmount,
        approvedAmount: line.approvedAmount,
        deniedAmount: line.deniedAmount,
        disallowedAmount: line.disallowedAmount,
        returnedAmount: line.returnedAmount,
        contractualAdjustmentAmount: line.contractualAdjustmentAmount,
        writeOffAmount: line.writeOffAmount,
        paidAmount: line.paidAmount,
        outstandingAmount: line.outstandingAmount,
      })),
    );
    const serviceTimes = authoritative.lines.flatMap((line) => [
      line.serviceFrom.getTime(),
      (line.serviceThrough ?? line.serviceFrom).getTime(),
    ]);
    if (serviceTimes.length === 0) {
      throw new ClaimFinancialReconciliationError(
        'A claim requires at least one authoritative service line',
      );
    }
    return {
      authoritative,
      lines: preparedLines,
      financials: fullHeaderFinancials(aggregate),
      serviceFrom: new Date(Math.min(...serviceTimes)),
      serviceThrough: new Date(Math.max(...serviceTimes)),
    };
  }

  private async resolveVersionContext(
    actor: ClaimsActorContext,
    input: CreateClaimInput,
    transaction: ClaimsTransactionContext,
  ): Promise<Readonly<{
    claimVersionNumber: number;
    priorClaimVersionId: string | null;
  }>> {
    if (input.claimVersionType === 'ORIGINAL') {
      return { claimVersionNumber: 1, priorClaimVersionId: null };
    }
    const original = await this.dependencies.claims.findById(
      actor.facilityId,
      input.originalClaimId!,
      transaction.session,
    );
    if (
      original === null ||
      original.invoiceId.toHexString() !== input.invoiceId ||
      original.payerOrganizationId.toHexString() !== input.payerOrganizationId ||
      original.patientCoverageId.toHexString() !== input.patientCoverageId
    ) {
      throw new ClaimNotFoundError();
    }
    return {
      claimVersionNumber: original.claimVersionNumber + 1,
      priorClaimVersionId: original._id.toHexString(),
    };
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

  private async encryptOptional(
    value: string | null | undefined,
  ): Promise<string | null> {
    const normalized = normalizeOptionalClaimText(value);
    return normalized === null
      ? null
      : this.dependencies.encryption.encrypt(normalized);
  }
}