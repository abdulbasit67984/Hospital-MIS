import type {
  Types,
} from 'mongoose';

interface RefundAllocationEffectRecord {
  paymentAllocationId:
    Types.ObjectId;
  invoiceId:
    Types.ObjectId | null;
  accountChargeId:
    Types.ObjectId | null;
  amount:
    Types.Decimal128;
}

declare module './payments-cashier-shifts.persistence.types.js' {
  interface PaymentTenderRecord {
    refundedAmount:
      Types.Decimal128;
  }

  interface PaymentRecord {
    reversedAmount:
      Types.Decimal128;
  }

  interface RefundRecord {
    creditNoteId:
      Types.ObjectId | null;
    paymentMethodConfigurationId:
      Types.ObjectId | null;
    cashCounterId:
      Types.ObjectId | null;
    cashShiftId:
      Types.ObjectId | null;
    cashierUserId:
      Types.ObjectId | null;
    unallocatedRefundAmount:
      Types.Decimal128;
    allocationEffects:
      RefundAllocationEffectRecord[];
    reversedAt:
      Date | null;
    reversedBy:
      Types.ObjectId | null;
    reversalReason:
      string | null;
    reversalApprovalRequestId:
      Types.ObjectId | null;
  }

  interface PaymentReversalRecord {
    cashCounterId:
      Types.ObjectId | null;
    cashShiftId:
      Types.ObjectId | null;
    cashierUserId:
      Types.ObjectId | null;
  }
}

export type {
  RefundAllocationEffectRecord,
};

export {};