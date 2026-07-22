import Decimal from 'decimal.js';

import {
  decimal128ToString,
} from '@hospital-mis/database';

import {
  CLAIM_PERMISSION_KEYS,
  type ClaimAdjudicationDecision,
  type ClaimStatus,
} from '../claims.constants.js';

import type {
  ClaimsActorContext,
  RecordClaimAdjudicationInput,
} from '../claims.contracts.js';

import {
  ClaimAccessDeniedError,
  ClaimAdjudicationReconciliationError,
  ClaimLineNotFoundError,
  ClaimNotFoundError,
  ClaimVersionConflictError,
} from '../claims.errors.js';

import {
  calculateClaimAdjudication,
  calculateClaimReceivable,
} from '../claims.financial-math.js';

import {
  safeClaimRealtimePayload,
} from '../claims.normalization.js';

import type {
  ClaimAdjudicationRepositoryPort,
  ClaimDenialRepositoryPort,
  ClaimLineRepositoryPort,
  ClaimsAccessPolicyPort,
  ClaimsAuditPort,
  ClaimsClockPort,
  ClaimsEncryptionPort,
  ClaimsFinancialDischargePort,
  ClaimsFinancialLedgerPort,
  ClaimsOutboxPort,
  ClaimsRepositoryPort,
  ClaimsTransactionManagerPort,
  ClaimsWorkflowPort,
  ClaimWorkQueueRepositoryPort,
} from '../claims.ports.js';

import type {
  ClaimLineRecord,
} from '../claims.persistence.types.js';

export interface ClaimAdjudicationServiceDependencies {
  claims: ClaimsRepositoryPort;
  lines: ClaimLineRepositoryPort;
  adjudications: ClaimAdjudicationRepositoryPort;
  denials: ClaimDenialRepositoryPort;
  workQueue: ClaimWorkQueueRepositoryPort;
  workflow: ClaimsWorkflowPort;
  accessPolicy: ClaimsAccessPolicyPort;
  transactionManager: ClaimsTransactionManagerPort;
  ledger: ClaimsFinancialLedgerPort;
  financialDischarge: ClaimsFinancialDischargePort;
  encryption: ClaimsEncryptionPort;
  audit: ClaimsAuditPort;
  outbox: ClaimsOutboxPort;
  clock: ClaimsClockPort;
  appealWindowDays: number;
}

interface CalculatedLine {
  record: ClaimLineRecord;
  decision: ClaimAdjudicationDecision;
  claimedAmount: string;
  approvedAmount: string;
  deniedAmount: string;
  disallowedAmount: string;
  returnedAmount: string;
  contractualAdjustmentAmount: string;
  payerLineReference: string | null;
  denialCategory: string | null;
  reasonCode: string | null;
  reasonDescription: string | null;
  outstandingAmount: string;
}

function money(value: unknown): Decimal {
  return new Decimal(String(value ?? '0')).toDecimalPlaces(
    2,
    Decimal.ROUND_HALF_UP,
  );
}

function total(
  lines: readonly CalculatedLine[],
  field: keyof Pick<
    CalculatedLine,
    | 'claimedAmount'
    | 'approvedAmount'
    | 'deniedAmount'
    | 'disallowedAmount'
    | 'returnedAmount'
    | 'contractualAdjustmentAmount'
  >,
): string {
  return lines
    .reduce((sum, line) => sum.plus(line[field]), new Decimal(0))
    .toFixed(2);
}

function lineStatus(decision: ClaimAdjudicationDecision): string {
  return decision;
}

function claimStatus(lines: readonly CalculatedLine[]): ClaimStatus {
  const approved = lines.reduce(
    (sum, line) => sum.plus(line.approvedAmount),
    new Decimal(0),
  );
  const adverse = lines.reduce(
    (sum, line) =>
      sum
        .plus(line.deniedAmount)
        .plus(line.disallowedAmount)
        .plus(line.returnedAmount),
    new Decimal(0),
  );

  if (approved.isPositive() && adverse.isPositive()) {
    return 'PARTIALLY_APPROVED';
  }
  if (approved.isPositive()) {
    return 'APPROVED';
  }
  if (lines.every((line) => line.decision === 'REJECTED')) {
    return 'REJECTED';
  }
  if (lines.some((line) => line.decision === 'RETURNED')) {
    return 'RETURNED';
  }
  return 'DENIED';
}

function claimLineMap(lines: readonly ClaimLineRecord[]) {
  return new Map(lines.map((line) => [line._id.toHexString(), line]));
}

export class ClaimAdjudicationService {
  public constructor(
    private readonly dependencies: ClaimAdjudicationServiceDependencies,
  ) {}

  public async record(
    actor: ClaimsActorContext,
    claimId: string,
    idempotencyKey: string,
    input: RecordClaimAdjudicationInput,
  ) {
    await this.requirePermission(actor);

    return this.dependencies.transactionManager.execute({
      transactionType: 'RECORD_CLAIM_ADJUDICATION',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `claims:claim:${actor.facilityId}:${claimId}`,
        `claims:adjudication:${actor.facilityId}:${claimId}`,
      ],
      idempotencyPayload: input,
      journalPayload: {
        claimId,
        payerReferenceNumber: input.payerReferenceNumber,
      },
      execute: async (transaction) => {
        let claim = await this.dependencies.claims.findById(
          actor.facilityId,
          claimId,
          transaction.session,
        );
        if (claim === null) {
          throw new ClaimNotFoundError();
        }
        if (claim.version !== input.expectedVersion) {
          throw new ClaimVersionConflictError();
        }
        if (
          ![
            'SUBMITTED',
            'ACKNOWLEDGED',
            'UNDER_REVIEW',
            'RESUBMITTED',
          ].includes(claim.status)
        ) {
          throw new ClaimAdjudicationReconciliationError();
        }

        if (claim.status !== 'UNDER_REVIEW') {
          claim = await this.dependencies.workflow.transition({
            actor,
            claim,
            toStatus: 'UNDER_REVIEW',
            reason: 'Payer adjudication received',
            transaction,
          });
        }

        const records = await this.dependencies.lines.listByClaim(
          actor.facilityId,
          claimId,
          transaction.session,
        );
        if (records.length !== input.lines.length) {
          throw new ClaimAdjudicationReconciliationError();
        }

        const recordsById = claimLineMap(records);
        const calculatedLines: CalculatedLine[] = [];
        for (const lineInput of input.lines) {
          const record = recordsById.get(lineInput.claimLineId);
          if (record === undefined) {
            throw new ClaimLineNotFoundError();
          }
          const calculated = calculateClaimAdjudication({
            claimedAmount: decimal128ToString(record.claimedAmount),
            approvedAmount: lineInput.approvedAmount,
            deniedAmount: lineInput.deniedAmount,
            disallowedAmount: lineInput.disallowedAmount,
            returnedAmount: lineInput.returnedAmount,
            ...(lineInput.contractualAdjustmentAmount === undefined
              ? {}
              : {
                  contractualAdjustmentAmount:
                    lineInput.contractualAdjustmentAmount,
                }),
          });
          calculatedLines.push({
            record,
            decision: lineInput.decision,
            ...calculated,
            payerLineReference: lineInput.payerLineReference ?? null,
            denialCategory: lineInput.denialCategory ?? null,
            reasonCode: lineInput.reasonCode ?? null,
            reasonDescription: lineInput.reasonDescription ?? null,
            outstandingAmount: calculated.adjudicatedReceivableAmount,
          });
        }

        const latest = await this.dependencies.adjudications.findLatest(
          actor.facilityId,
          claimId,
          transaction.session,
        );
        const notesEncrypted =
          input.notes == null
            ? null
            : await this.dependencies.encryption.encrypt(input.notes);
        const totals = {
          claimedAmount: total(calculatedLines, 'claimedAmount'),
          approvedAmount: total(calculatedLines, 'approvedAmount'),
          deniedAmount: total(calculatedLines, 'deniedAmount'),
          disallowedAmount: total(calculatedLines, 'disallowedAmount'),
          returnedAmount: total(calculatedLines, 'returnedAmount'),
          contractualAdjustmentAmount: total(
            calculatedLines,
            'contractualAdjustmentAmount',
          ),
        };
        if (!money(totals.claimedAmount).equals(claim.claimedAmount.toString())) {
          throw new ClaimAdjudicationReconciliationError();
        }

        const adjudication = await this.dependencies.adjudications.create(
          actor,
          claimId,
          input,
          {
            adjudicationSequence:
              (latest?.adjudicationSequence ?? 0) + 1,
            ...totals,
            notesEncrypted,
            lines: calculatedLines.map((line) => ({
              claimLineId: line.record._id.toHexString(),
              decision: line.decision,
              claimedAmount: line.claimedAmount,
              approvedAmount: line.approvedAmount,
              deniedAmount: line.deniedAmount,
              disallowedAmount: line.disallowedAmount,
              returnedAmount: line.returnedAmount,
              contractualAdjustmentAmount:
                line.contractualAdjustmentAmount,
              payerLineReference: line.payerLineReference,
              denialCategory: line.denialCategory,
              reasonCode: line.reasonCode,
              reasonDescription: line.reasonDescription,
            })),
          },
          transaction,
        );

        for (const line of calculatedLines) {
          const updated = await this.dependencies.lines.updateFinancials(
            actor.facilityId,
            line.record._id.toHexString(),
            line.record.version,
            {
              status: lineStatus(line.decision),
              approvedAmount: line.approvedAmount,
              deniedAmount: line.deniedAmount,
              disallowedAmount: line.disallowedAmount,
              returnedAmount: line.returnedAmount,
              contractualAdjustmentAmount:
                line.contractualAdjustmentAmount,
              outstandingAmount: line.outstandingAmount,
              payerLineReference: line.payerLineReference,
              denialCategory: line.denialCategory,
              denialReasonCode: line.reasonCode,
              denialReasonDescription: line.reasonDescription,
            },
            actor.userId,
            transaction,
          );
          if (updated === null) {
            throw new ClaimVersionConflictError();
          }
        }

        const now = this.dependencies.clock.now();
        const appealDeadline = new Date(
          now.getTime() +
            this.dependencies.appealWindowDays * 24 * 60 * 60 * 1_000,
        );
        const adverseLines = calculatedLines.filter((line) =>
          money(line.deniedAmount)
            .plus(line.disallowedAmount)
            .plus(line.returnedAmount)
            .isPositive(),
        );
        const denials = await this.dependencies.denials.createMany(
          actor,
          adverseLines.map((line) => ({
            claimId,
            claimLineId: line.record._id.toHexString(),
            adjudicationId: adjudication._id.toHexString(),
            category: line.denialCategory ?? 'OTHER',
            reasonCode: line.reasonCode,
            reasonDescription:
              line.reasonDescription ?? 'Payer adverse adjudication',
            deniedAmount: money(line.deniedAmount)
              .plus(line.disallowedAmount)
              .plus(line.returnedAmount)
              .toFixed(2),
            appealEligible: true,
            appealDeadline: appealDeadline.toISOString(),
          })),
          transaction,
        );

        const receivable = calculateClaimReceivable({
          approvedAmount: totals.approvedAmount,
          paidAmount: decimal128ToString(claim.paidAmount),
          contractualAdjustmentAmount:
            totals.contractualAdjustmentAmount,
          writeOffAmount: decimal128ToString(claim.writeOffAmount),
          payerWithholdingAmount: decimal128ToString(
            claim.payerWithholdingAmount,
          ),
          debitNoteAmount: decimal128ToString(claim.debitNoteAmount),
          creditNoteAmount: decimal128ToString(claim.creditNoteAmount),
          refundAmount: decimal128ToString(claim.refundAmount),
          repaymentAmount: decimal128ToString(claim.repaymentAmount),
        });

        const financialClaim = await this.dependencies.claims.updateFinancials(
          actor.facilityId,
          claimId,
          claim.version,
          {
            approvedAmount: totals.approvedAmount,
            deniedAmount: totals.deniedAmount,
            disallowedAmount: totals.disallowedAmount,
            returnedAmount: totals.returnedAmount,
            contractualAdjustmentAmount:
              totals.contractualAdjustmentAmount,
            outstandingAmount: receivable.outstandingAmount,
            overpaymentAmount: receivable.overpaymentAmount,
          },
          actor.userId,
          transaction,
        );
        if (financialClaim === null) {
          throw new ClaimVersionConflictError();
        }

        const finalClaim = await this.dependencies.workflow.transition({
          actor,
          claim: financialClaim,
          toStatus: claimStatus(calculatedLines),
          reason: 'Payer adjudication recorded',
          transaction,
        });

        await this.dependencies.ledger.postClaimFinancialEvent({
          actor,
          claimId,
          eventType: 'CLAIM_ADJUDICATED',
          amount: totals.approvedAmount,
          sourceRecordId: adjudication._id.toHexString(),
          patientId: claim.patientId.toHexString(),
          patientAccountId: claim.patientAccountId.toHexString(),
          invoiceId: claim.invoiceId.toHexString(),
          currency: claim.currency,
          transaction,
        });
        await this.dependencies.financialDischarge.refreshClearance({
          facilityId: actor.facilityId,
          patientAccountId: claim.patientAccountId.toHexString(),
          invoiceId: claim.invoiceId.toHexString(),
          actorUserId: actor.userId,
          transaction,
        });

        for (const denial of denials) {
          await this.dependencies.workQueue.upsertOpenItem(
            actor,
            {
              claimId,
              claimLineId: denial.claimLineId?.toHexString() ?? null,
              workQueueType: 'DENIAL',
              priority: 60,
              followUpAt: appealDeadline,
              reasonEncrypted: null,
            },
            transaction,
          );
        }

        await this.dependencies.audit.record({
          actor,
          action: 'CLAIM_ADJUDICATION_RECORDED',
          entityType: 'ClaimAdjudication',
          entityId: adjudication._id.toHexString(),
          reason: input.notes ?? null,
          before: { status: claim.status, version: input.expectedVersion },
          after: {
            status: finalClaim.status,
            version: finalClaim.version,
            denialCount: denials.length,
          },
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType: 'claims.adjudication.recorded',
          aggregateType: 'Claim',
          aggregateId: claimId,
          payload: safeClaimRealtimePayload({
            claimId,
            status: finalClaim.status,
            previousStatus: claim.status,
            version: finalClaim.version,
            eventAt: now.toISOString(),
          }),
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });

        return {
          claim: finalClaim,
          adjudication,
          denials,
        };
      },
    });
  }

  private async requirePermission(actor: ClaimsActorContext): Promise<void> {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      permission: CLAIM_PERMISSION_KEYS.ADJUDICATION_RECORD,
      resourceFacilityId: actor.facilityId,
      sensitiveFinancialAction: true,
    });
    if (!decision.allowed) {
      throw new ClaimAccessDeniedError(
        decision.denialReason ?? undefined,
      );
    }
  }
}