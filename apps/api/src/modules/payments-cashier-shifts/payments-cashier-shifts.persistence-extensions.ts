import type {
  Types,
} from 'mongoose';

import type {
  PaymentIntentPurpose,
} from './payments-cashier-shifts.contracts.js';

import type {
  PaymentTenderStatus,
} from './payments-cashier-shifts.contracts.js';

import type {
  DepositType,
} from './payments-cashier-shifts.contracts.js';

import type {
  PaymentTenderRecord,
} from './payments-cashier-shifts.persistence.types.js';

declare module './payments-cashier-shifts.persistence.types.js' {
  interface PaymentIntentRecord {
    paymentMethodConfigurationId:
      Types.ObjectId | null;
    purpose:
      PaymentIntentPurpose;
    payerName:
      string | null;
    responsiblePartyType:
      string | null;
    capturedAt:
      Date | null;
    cancelledAt:
      Date | null;
    cancelledBy:
      Types.ObjectId | null;
    cancellationReason:
      string | null;
    reversedAt:
      Date | null;
    reversedBy:
      Types.ObjectId | null;
    reversalReason:
      string | null;
  }

  interface PaymentRecord {
    paymentNumber:
      string;
    paymentMethodConfigurationId:
      Types.ObjectId | null;
    payerName:
      string | null;
    responsiblePartyType:
      string | null;
    notes:
      string | null;
    tenders:
      PaymentTenderRecord[];
  }

  interface PaymentTenderRecord {
    status:
      PaymentTenderStatus;
  }

  interface DepositRecord {
    operationKey:
      string;
    depositType:
      DepositType;
    admissionId:
      Types.ObjectId | null;
    procedureReferenceId:
      Types.ObjectId | null;
    responsiblePartyType:
      string | null;
    transferredAmount:
      Types.Decimal128;
    forfeitedAmount:
      Types.Decimal128;
    releasedAt:
      Date | null;
    releasedBy:
      Types.ObjectId | null;
    releaseReason:
      string | null;
    reversalId:
      Types.ObjectId | null;
  }
}

export {};