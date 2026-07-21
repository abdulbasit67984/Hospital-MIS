import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  PaymentCashierActorContext,
  PaymentReceiptView,
  ReprintReceiptInput,
} from '../payments-cashier-shifts.contracts.js';

import {
  PaymentReceiptNotFoundError,
} from '../payments-cashier-shifts.errors.js';

import {
  PAYMENT_CASHIER_AUDIT_ACTIONS,
  PAYMENT_CASHIER_EVENT_TYPES,
  PAYMENT_CASHIER_LOCK_NAMESPACES,
  PAYMENT_CASHIER_REALTIME_EVENTS,
  PAYMENT_CASHIER_SEQUENCE_KEYS,
  PAYMENT_CASHIER_TRANSACTION_TYPES,
} from '../payments-cashier-shifts.operations.js';

import {
  paymentCashierLockKey,
} from '../payments-cashier-shifts.normalization.js';

import {
  projectPaymentReceipt,
} from '../payments-cashier-shifts.projections.js';

import type {
  PaymentCashierAccessPolicyPort,
  PaymentCashierAuditPort,
  PaymentCashierOutboxPort,
  PaymentCashierRealtimePort,
  PaymentCashierSequencePort,
} from '../payments-cashier-shifts.ports.js';

import type {
  MongoPaymentReceiptRepository,
} from '../repositories/payment-finance.repository.js';

import type {
  PaymentCashierCommandContext,
} from './payment-cashier-command-support.js';

import {
  PaymentCashierCommandSupport,
} from './payment-cashier-command-support.js';

export interface ReceiptReprintView {
  id: string;
  reprintNumber: string;
  receiptId: string;
  receiptNumber: string;
  copyType: string;
  reason: string;
  printedBy: string;
  printedAt: string;
  outputFormat: 'PRINT' | 'PDF';
  projectionHash: string;
}

export interface PaymentReceiptServiceDependencies {
  receipts: MongoPaymentReceiptRepository;
  accessPolicy: PaymentCashierAccessPolicyPort;
  commandSupport: PaymentCashierCommandSupport;
  sequences: PaymentCashierSequencePort;
  audit: PaymentCashierAuditPort;
  outbox: PaymentCashierOutboxPort;
  realtime: PaymentCashierRealtimePort;
  clock: Readonly<{ now(): Date }>;
}

export class PaymentReceiptService {
  public constructor(
    private readonly dependencies: PaymentReceiptServiceDependencies,
  ) {}

  public async get(
    actor: PaymentCashierActorContext,
    receiptId: string,
  ): Promise<PaymentReceiptView> {
    const receipt = await this.dependencies.receipts.findById(
      actor.facilityId,
      receiptId,
    );

    if (receipt === null) {
      throw new PaymentReceiptNotFoundError();
    }

    this.dependencies.accessPolicy.require({
      actor,
      action: 'RECEIPT_READ',
      resourceFacilityId: actor.facilityId,
      counterId: receipt.cashCounterId?.toHexString() ?? null,
      cashierUserId: receipt.cashierUserId?.toHexString() ?? null,
    });

    return projectPaymentReceipt(receipt);
  }

  public async reprint(
    command: PaymentCashierCommandContext,
    receiptId: string,
    input: ReprintReceiptInput,
  ): Promise<ReceiptReprintView> {
    const { actor } = command;
    const existing = await this.dependencies.receipts.findById(
      actor.facilityId,
      receiptId,
    );

    if (existing === null) {
      throw new PaymentReceiptNotFoundError();
    }

    this.dependencies.accessPolicy.require({
      actor,
      action: 'RECEIPT_REPRINT',
      resourceFacilityId: actor.facilityId,
      counterId: existing.cashCounterId?.toHexString() ?? null,
      cashierUserId: existing.cashierUserId?.toHexString() ?? null,
      makerUserId: existing.cashierUserId?.toHexString() ?? null,
      sensitiveAmount: true,
    });

    const result = await this.dependencies.commandSupport.execute({
      operation: PAYMENT_CASHIER_TRANSACTION_TYPES.REPRINT_RECEIPT,
      command,
      payload: {
        receiptId,
        ...input,
      },
      lockKeys: [
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.RECEIPT,
          actor.facilityId,
          receiptId,
        ),
      ],
      work: async ({ session, transactionId, operationKey }) => {
        const receipt = await this.dependencies.receipts.findById(
          actor.facilityId,
          receiptId,
          session,
        );

        if (receipt === null) {
          throw new PaymentReceiptNotFoundError();
        }

        const now = this.dependencies.clock.now();
        const reprintNumber = await this.dependencies.sequences.next(
          actor.facilityId,
          PAYMENT_CASHIER_SEQUENCE_KEYS.RECEIPT_REPRINT,
          now,
          session,
        );

        const created = await this.dependencies.receipts.createReprint(
          {
            facilityId: toObjectId(actor.facilityId, 'facilityId'),
            transactionId,
            correlationId: actor.correlationId,
            schemaVersion: 1,
            version: 0,
            createdBy: toObjectId(actor.userId, 'actor.userId'),
            updatedBy: toObjectId(actor.userId, 'actor.userId'),
            reprintNumber,
            receiptId: receipt._id,
            receiptNumberSnapshot: receipt.receiptNumber,
            copyType: input.copyType,
            reason: input.reason,
            printedBy: toObjectId(actor.userId, 'actor.userId'),
            printedAt: now,
            cashCounterId: receipt.cashCounterId,
            cashShiftId: receipt.cashShiftId,
            outputFormat: input.outputFormat,
            projectionHash: receipt.printableProjectionHash,
          },
          session,
        );

        await this.dependencies.commandSupport.appendHistory({
          actor,
          transactionId,
          entityType: 'RECEIPT',
          entityId: receipt._id.toHexString(),
          action: 'REPRINTED',
          occurredAt: now,
          session,
          cashCounterId: receipt.cashCounterId?.toHexString() ?? null,
          cashShiftId: receipt.cashShiftId?.toHexString() ?? null,
          patientId: receipt.patientId.toHexString(),
          patientAccountId: receipt.patientAccountId.toHexString(),
          paymentId: receipt.paymentId.toHexString(),
          receiptId: receipt._id.toHexString(),
          amount: receipt.totalAmount.toString(),
          currency: receipt.currency,
          reason: input.reason,
          metadata: {
            reprintNumber,
            copyType: input.copyType,
            outputFormat: input.outputFormat,
            operationKey,
          },
        });

        await Promise.all([
          this.dependencies.audit.record(
            {
              facilityId: actor.facilityId,
              actorUserId: actor.userId,
              actorStaffId: actor.staffId,
              action: PAYMENT_CASHIER_AUDIT_ACTIONS.RECEIPT_REPRINTED,
              entityType: 'PAYMENT_RECEIPT',
              entityId: receipt._id.toHexString(),
              reason: input.reason,
              before: null,
              after: {
                receiptNumber: receipt.receiptNumber,
                reprintNumber,
                copyType: input.copyType,
                outputFormat: input.outputFormat,
              },
              correlationId: actor.correlationId,
              transactionId,
              ...(actor.ipAddress === undefined ? {} : { ipAddress: actor.ipAddress }),
              ...(actor.userAgent === undefined ? {} : { userAgent: actor.userAgent }),
            },
            session,
          ),
          this.dependencies.outbox.publish(
            {
              facilityId: actor.facilityId,
              aggregateType: 'PAYMENT_RECEIPT',
              aggregateId: receipt._id.toHexString(),
              eventType: PAYMENT_CASHIER_EVENT_TYPES.RECEIPT_REPRINTED,
              payload: {
                receiptId: receipt._id.toHexString(),
                receiptNumber: receipt.receiptNumber,
                reprintId: created._id.toHexString(),
                reprintNumber,
                copyType: input.copyType,
                outputFormat: input.outputFormat,
              },
              correlationId: actor.correlationId,
              transactionId,
              occurredAt: now,
            },
            session,
          ),
        ]);

        return {
          id: created._id.toHexString(),
          reprintNumber: created.reprintNumber,
          receiptId: created.receiptId.toHexString(),
          receiptNumber: created.receiptNumberSnapshot,
          copyType: created.copyType,
          reason: created.reason,
          printedBy: created.printedBy.toHexString(),
          printedAt: created.printedAt.toISOString(),
          outputFormat: created.outputFormat,
          projectionHash: created.projectionHash,
        };
      },
    });

    await this.dependencies.realtime.publishMinimumNecessary({
      facilityId: actor.facilityId,
      eventType: PAYMENT_CASHIER_REALTIME_EVENTS.RECEIPT_CHANGED,
      entityId: receiptId,
      counterId: existing.cashCounterId?.toHexString() ?? null,
      shiftId: existing.cashShiftId?.toHexString() ?? null,
      status: existing.status,
      occurredAt: this.dependencies.clock.now().toISOString(),
    });

    return result;
  }
}